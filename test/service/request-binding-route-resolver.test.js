import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, test} from 'node:test';

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalJson,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RequestBindingRouteResolver} from
  '../../src/service/request-binding-route-resolver.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
} from '../../src/service/request-cell-routing-contract.js';

const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const PACKAGE_ID = `service-package-${'b'.repeat(64)}`;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const SECURITY_CONTEXT = Object.freeze({
  principal: 'app-user',
  roles: Object.freeze(['application']),
  tenantId: 'tenant-a',
});
const NODE_A = 'node-a';
const NODE_B = 'node-b';

function sha256(value) {
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING)}`;
}

function createManifest(overrides = {}) {
  return {
    artifact: {
      digest: overrides.digest || ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/acme/request-cell:1.0.0',
      type: 'oci',
    },
    capabilities: [],
    exports: [{
      interface: 'request_v1',
      name: 'run',
    }],
    name: overrides.name || 'request-cell',
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: overrides.version || '1.0.0',
  };
}

function createArtifact(overrides = {}) {
  const manifest = createManifest(overrides);
  return {
    artifactDigest: manifest.artifact.digest,
    bytes: Buffer.from('request-cell-fixture-bytes'),
    manifest,
    manifestDigest: sha256(canonicalJson(manifest)),
    packageId: overrides.packageId || PACKAGE_ID,
    payloadDigest: sha256('request-cell-fixture-bytes'),
  };
}

function createBindingDeclaration(artifact, overrides = {}) {
  const input = {
    budgets: {
      context_bytes: 4096,
      cpu_time_ms: 100,
      input_bytes: 16384,
      memory_bytes: 64 * 1024 * 1024,
      output_bytes: 4096,
      wall_time_ms: 1000,
    },
    name: overrides.name || 'request-cell',
    schema_version: 2,
    source: {
      kind: 'request',
      method: overrides.method || 'POST',
      path: overrides.path || '/orders',
    },
    target: {
      export_name: 'run',
      manifest_digest: artifact.manifestDigest,
      package_id: artifact.packageId,
    },
  };
  return bindDeploymentArtifact(
    normalizeDeploymentBinding(input),
    artifact,
  );
}

function deployRequestRows(opts = {}) {
  const artifact = opts.artifact || createArtifact(opts);
  const declaration = createBindingDeclaration(artifact, opts);
  const row = buildBindingRow(
    declaration,
    SECURITY_CONTEXT,
    opts.createdAt || 1,
    opts.generation || 1,
  );
  const binding = projectBinding(row);
  return {
    artifact,
    binding,
    bindingRow: row,
    declaration,
    definition: buildActivatedRequestBindingServiceDefinition(
      buildRequestBindingServiceDefinition(row, artifact),
      binding,
    ),
  };
}

function makeActual(def, replicaId, nodeId) {
  return {
    created_at: Date.now(),
    definition_id: def.service_id,
    node_id: nodeId,
    service_id: replicaId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
    updated_at: Date.now(),
  };
}

function createTestCache() {
  const store = new Map();
  return {
    get: (tbl, key) => store.get(`${tbl}:${key}`) ?? null,
    getAll: (tbl) => {
      const pfx = `${tbl}:`;
      const out = [];
      for (const [k, v] of store) {
        if (k.startsWith(pfx)) out.push(v);
      }
      return out;
    },
    set: (tbl, key, row) => store.set(`${tbl}:${key}`, row),
  };
}

function seedRows(cache, rows) {
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
    rows.bindingRow.binding_version_id,
    rows.bindingRow,
  );
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
    rows.definition.service_id,
    rows.definition,
  );
}

describe('RequestBindingRouteResolver', () => {
  test('resolves a ready route for matching method and path', () => {
    const rows = deployRequestRows();
    const cache = createTestCache();
    seedRows(cache, rows);
    cache.set(
      SYSTEM_TABLE_NAME.SERVICES,
      `${rows.definition.service_id}-r1`,
      makeActual(rows.definition, `${rows.definition.service_id}-r1`, NODE_A),
    );

    const resolver = new RequestBindingRouteResolver({systemTableCache: cache});
    const route = resolver.resolve({
      invocationId: 'req-inv-1',
      method: 'POST',
      path: '/orders',
      securityContext: SECURITY_CONTEXT,
    });

    assert.equal(route.bindingVersionId, rows.bindingRow.binding_version_id);
    assert.equal(route.serviceId, rows.definition.service_id);
    assert.equal(route.method, 'POST');
    assert.equal(route.path, '/orders');
    assert.equal(route.nodeId, NODE_A);
  });

  test('fails ROUTE_NOT_FOUND when no binding matches', () => {
    const cache = createTestCache();
    const resolver = new RequestBindingRouteResolver({systemTableCache: cache});
    assert.throws(
      () => resolver.resolve({
        invocationId: 'req-inv-1',
        method: 'POST',
        path: '/unknown',
        securityContext: SECURITY_CONTEXT,
      }),
      (error) => error.code === REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
    );
  });

  test('fails ROUTE_AMBIGUOUS when distinct binding names collide on the same method and path', () => {
    const rows1 = deployRequestRows({name: 'binding-1'});
    const rows2 = deployRequestRows({name: 'binding-2'});
    const cache = createTestCache();
    cache.set(
      SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
      rows1.bindingRow.binding_version_id,
      rows1.bindingRow,
    );
    cache.set(
      SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
      rows2.bindingRow.binding_version_id,
      rows2.bindingRow,
    );

    const resolver = new RequestBindingRouteResolver({systemTableCache: cache});
    assert.throws(
      () => resolver.resolve({
        invocationId: 'req-inv-1',
        method: 'POST',
        path: '/orders',
        securityContext: SECURITY_CONTEXT,
      }),
      (error) => error.code === REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS,
    );
  });

  test('generational revision transition: resolves prior generation until new generation is ready, pins in-flight, and prefers caller revision', () => {
    const artifact1 = createArtifact({version: '1.0.0'});
    const artifact2 = createArtifact({
      digest: `sha256:${'c'.repeat(64)}`,
      packageId: `service-package-${'d'.repeat(64)}`,
      version: '1.0.1',
    });

    const gen1 = deployRequestRows({
      artifact: artifact1,
      createdAt: 100,
      generation: 1,
    });
    const gen2 = deployRequestRows({
      artifact: artifact2,
      createdAt: 200,
      generation: 2,
    });

    const cache = createTestCache();
    for (const g of [gen1, gen2]) {
      cache.set(SYSTEM_TABLE_NAME.SERVICE_BINDINGS, g.bindingRow.binding_version_id, g.bindingRow);
      cache.set(SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, g.definition.service_id, g.definition);
    }

    // Only gen1 has a ready actual
    cache.set(
      SYSTEM_TABLE_NAME.SERVICES,
      `${gen1.definition.service_id}-r1`,
      makeActual(gen1.definition, `${gen1.definition.service_id}-r1`, NODE_A),
    );

    const resolver = new RequestBindingRouteResolver({systemTableCache: cache});

    // 1. When gen2 has no ready Cell, traffic selects gen1
    const routeBefore = resolver.resolve({
      invocationId: 'req-inv-1',
      method: 'POST',
      path: '/orders',
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(routeBefore.bindingVersionId, gen1.bindingRow.binding_version_id);
    assert.equal(routeBefore.serviceId, gen1.definition.service_id);

    // 2. Activate gen2 Cell
    cache.set(
      SYSTEM_TABLE_NAME.SERVICES,
      `${gen2.definition.service_id}-r1`,
      makeActual(gen2.definition, `${gen2.definition.service_id}-r1`, NODE_B),
    );

    // New requests select gen2
    const routeAfter = resolver.resolve({
      invocationId: 'req-inv-2',
      method: 'POST',
      path: '/orders',
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(routeAfter.bindingVersionId, gen2.bindingRow.binding_version_id);
    assert.equal(routeAfter.serviceId, gen2.definition.service_id);

    // 3. Pinned in-flight requests stay on gen1
    const routePinned = resolver.resolve({
      bindingVersionId: gen1.bindingRow.binding_version_id,
      invocationId: 'req-inv-3',
      method: 'POST',
      path: '/orders',
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(routePinned.bindingVersionId, gen1.bindingRow.binding_version_id);

    // assertSelectedRoute remains pinned to gen1 without throwing TARGET_STALE
    const asserted = resolver.assertSelectedRoute({
      invocationId: 'req-inv-3',
      method: 'POST',
      path: '/orders',
      securityContext: SECURITY_CONTEXT,
    }, routeBefore);
    assert.equal(asserted.bindingVersionId, gen1.bindingRow.binding_version_id);

    // 4. Outbound call matching caller definition
    const callerServiceId = 'caller-service-id';
    cache.set(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      callerServiceId,
      {
        manifest_digest: artifact1.manifestDigest,
        package_id: artifact1.packageId,
        service_id: callerServiceId,
      },
    );
    const callerRoute = resolver.resolve({
      callerServiceId,
      invocationId: 'req-inv-4',
      method: 'POST',
      path: '/orders',
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(callerRoute.bindingVersionId, gen1.bindingRow.binding_version_id);
  });

  test('fails ROUTE_UNAVAILABLE when no candidate has ready actuals', () => {
    const rows = deployRequestRows({method: 'DELETE', path: '/cart'});
    const cache = createTestCache();
    seedRows(cache, rows);

    const resolver = new RequestBindingRouteResolver({systemTableCache: cache});
    assert.throws(
      () => resolver.resolve({
        invocationId: 'req-cart-1',
        method: 'DELETE',
        path: '/cart',
        securityContext: SECURITY_CONTEXT,
      }),
      (error) =>
        error.code === REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE &&
        error.classification === REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
    );
  });
});
