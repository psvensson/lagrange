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
import {CallBindingRouteResolver} from
  '../../src/service/call-binding-route-resolver.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallReduceInvocationId,
  createCallSlotInvocationId,
} from '../../src/service/call-cell-routing-contract.js';

const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const PACKAGE_ID = `service-package-${'d'.repeat(64)}`;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ARTIFACT_MEDIA_TYPE = 'application/wasm';
const ARTIFACT_REF = 'registry.example.test/acme/call-cell:1.0.0';
const ARTIFACT_TYPE = 'oci';
const CALL_INTERFACE = 'call_v1';
const CALL_EXPORT = 'run';
const CALL_BINDING_NAME = 'call-cell';
const CALL_VERSION = '1.0.0';
const RUNTIME_KIND_WASM_COMPONENT = 'wasm_component';
const CALL_STATEMENT = 'SELECT value FROM shard_orders';
const SECURITY_CONTEXT = Object.freeze({
  principal: 'app-user',
  roles: Object.freeze(['application']),
  tenantId: 'tenant-a',
});
const NODE_A = 'call-node-a';
const NODE_B = 'call-node-b';

function sha256(value) {
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING)}`;
}

function createManifest() {
  return {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: ARTIFACT_MEDIA_TYPE,
      ref: ARTIFACT_REF,
      type: ARTIFACT_TYPE,
    },
    capabilities: [],
    exports: [{
      interface: CALL_INTERFACE,
      name: CALL_EXPORT,
    }],
    name: CALL_BINDING_NAME,
    runtime: {kind: RUNTIME_KIND_WASM_COMPONENT},
    schema_version: 3,
    version: CALL_VERSION,
  };
}

function createArtifact() {
  const manifest = createManifest();
  return {
    artifactDigest: ARTIFACT_DIGEST,
    bytes: Buffer.from('call-cell-fixture-bytes'),
    manifest,
    manifestDigest: sha256(canonicalJson(manifest)),
    packageId: PACKAGE_ID,
    payloadDigest: sha256('call-cell-fixture-bytes'),
  };
}

function createBindingDeclaration(artifact, overrides = {}) {
  const source = {
    kind: 'call',
    name: overrides.sourceName || CALL_BINDING_NAME,
  };
  if (overrides.statement !== undefined) {
    source.statement = overrides.statement;
  }
  const input = {
    budgets: {
      context_bytes: 4_096,
      cpu_time_ms: 100,
      input_bytes: 16_384,
      memory_bytes: 64 * 1024 * 1024,
      output_bytes: 4_096,
      wall_time_ms: 1_000,
    },
    name: overrides.name || CALL_BINDING_NAME,
    schema_version: 2,
    source,
    target: {
      export_name: CALL_EXPORT,
      manifest_digest: artifact.manifestDigest,
      package_id: artifact.packageId,
    },
  };
  return bindDeploymentArtifact(
    normalizeDeploymentBinding(input),
    artifact,
  );
}

function createCallDeploymentRows(overrides = {}) {
  const artifact = createArtifact();
  const declaration = createBindingDeclaration(artifact, overrides);
  const bindingRow = buildBindingRow(
    declaration,
    SECURITY_CONTEXT,
    overrides.createdAt || 1,
  );
  const binding = projectBinding(bindingRow);
  const compiled = buildRequestBindingServiceDefinition(bindingRow, artifact);
  const definition =
    buildActivatedRequestBindingServiceDefinition(compiled, binding);
  return {artifact, binding, bindingRow, declaration, definition};
}

function createActualRow(definition, replicaId, nodeId) {
  return {
    created_at: Date.now(),
    node_id: nodeId,
    service_id: replicaId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
    updated_at: Date.now(),
    definition_id: definition.service_id,
  };
}

class MutableSystemTableCache {
  constructor() {
    this.tables = new Map([
      [SYSTEM_TABLE_NAME.SERVICE_BINDINGS, new Map()],
      [SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, new Map()],
      [SYSTEM_TABLE_NAME.SERVICES, new Map()],
    ]);
  }

  get(tableName, key) {
    return this.tables.get(tableName)?.get(key) || null;
  }

  getAll(tableName) {
    return [...(this.tables.get(tableName)?.values() || [])];
  }

  set(tableName, key, row) {
    this.tables.get(tableName).set(key, row);
  }

  delete(tableName, key) {
    this.tables.get(tableName).delete(key);
  }
}

function seededCache(rows, options = {}) {
  const cache = new MutableSystemTableCache();
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
  if (options.withReadyActual !== false) {
    cache.set(
      SYSTEM_TABLE_NAME.SERVICES,
      `${rows.definition.service_id}-r1`,
      createActualRow(
        rows.definition,
        `${rows.definition.service_id}-r1`,
        NODE_A,
      ),
    );
  }
  return cache;
}

function resolveWith(resolver, name = CALL_BINDING_NAME) {
  return resolver.resolve({
    invocationId: 'call-invocation-fixture',
    name,
    securityContext: SECURITY_CONTEXT,
  });
}

describe('CallBindingRouteResolver', () => {
  test('resolves a route when the matched call Binding declares a statement',
    () => {
      const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
      const resolver = new CallBindingRouteResolver({
        systemTableCache: seededCache(rows),
      });
      const route = resolveWith(resolver);
      assert.equal(Object.isFrozen(route), true);
      assert.equal(route.bindingDigest, rows.definition.binding_digest);
      assert.equal(
        route.bindingVersionId,
        rows.bindingRow.binding_version_id,
      );
      assert.equal(route.name, CALL_BINDING_NAME);
      assert.equal(route.statement, CALL_STATEMENT);
      assert.equal(route.nodeId, NODE_A);
      assert.equal(
        route.replicaId,
        `${rows.definition.service_id}-r1`,
      );
      assert.equal(route.serviceId, rows.definition.service_id);
      assert.equal(
        route.targetAddress,
        `${NODE_A}/service/runtime-service-handler`,
      );
      assert.equal(route.targetNodeId, NODE_A);
      assert.equal(route.tenantId, SECURITY_CONTEXT.tenantId);
      assert.equal(Object.hasOwn(route, 'method'), false);
      assert.equal(Object.hasOwn(route, 'path'), false);
    },
  );

  test('fails closed NOT_INVOCABLE when the matched Binding has no statement',
    () => {
      const rows = createCallDeploymentRows();
      const resolver = new CallBindingRouteResolver({
        systemTableCache: seededCache(rows),
      });
      assert.throws(
        () => resolveWith(resolver),
        (error) =>
          error.code === CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE &&
          error.classification ===
            CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL &&
          error.retryable === false,
      );
    },
  );

  test('fails ROUTE_NOT_FOUND when no call Binding matches the name',
    () => {
      const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
      const resolver = new CallBindingRouteResolver({
        systemTableCache: seededCache(rows),
      });
      assert.throws(
        () => resolveWith(resolver, 'missing-call'),
        (error) =>
          error.code === CALL_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND &&
          error.classification ===
            CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
      );
    },
  );

  test('fails ROUTE_AMBIGUOUS when more than one call Binding matches',
    () => {
      const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
      const second = createCallDeploymentRows({
        createdAt: 2,
        name: 'call-cell-alt',
        statement: CALL_STATEMENT,
      });
      const cache = seededCache(rows);
      cache.set(
        SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
        second.bindingRow.binding_version_id,
        second.bindingRow,
      );
      const resolver = new CallBindingRouteResolver({
        systemTableCache: cache,
      });
      assert.throws(
        () => resolveWith(resolver),
        (error) =>
          error.code === CALL_CELL_ROUTE_ERROR_CODE.ROUTE_AMBIGUOUS &&
          error.classification ===
            CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
      );
    },
  );

  test('fails retryable ROUTE_UNAVAILABLE when no ready actual exists',
    () => {
      const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
      const resolver = new CallBindingRouteResolver({
        systemTableCache: seededCache(rows, {withReadyActual: false}),
      });
      assert.throws(
        () => resolveWith(resolver),
        (error) =>
          error.code === CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE &&
          error.classification ===
            CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE &&
          error.retryable === true,
      );
    },
  );

  test('assertSelectedRoute returns the current route when unchanged',
    () => {
      const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
      const resolver = new CallBindingRouteResolver({
        systemTableCache: seededCache(rows),
      });
      const route = resolveWith(resolver);
      const current = resolver.assertSelectedRoute(
        {
          invocationId: 'call-invocation-fixture',
          name: CALL_BINDING_NAME,
          securityContext: SECURITY_CONTEXT,
        },
        route,
      );
      assert.deepEqual(current, route);
    },
  );

  test('assertSelectedRoute fails retryable TARGET_STALE after handoff',
    () => {
      const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
      const cache = seededCache(rows);
      const resolver = new CallBindingRouteResolver({
        systemTableCache: cache,
      });
      const route = resolveWith(resolver);
      cache.delete(
        SYSTEM_TABLE_NAME.SERVICES,
        `${rows.definition.service_id}-r1`,
      );
      cache.set(
        SYSTEM_TABLE_NAME.SERVICES,
        `${rows.definition.service_id}-r2`,
        createActualRow(
          rows.definition,
          `${rows.definition.service_id}-r2`,
          NODE_B,
        ),
      );
      assert.throws(
        () => resolver.assertSelectedRoute(
          {
            invocationId: 'call-invocation-fixture',
            name: CALL_BINDING_NAME,
            securityContext: SECURITY_CONTEXT,
          },
          route,
        ),
        (error) =>
          error.code === CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE &&
          error.classification ===
            CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE &&
          error.preserveReplicaState === true,
      );
    },
  );
});

describe('CallBindingRouteResolver slot spread', () => {
  test('slot-scoped wire identities spread consecutive shard runs across ' +
    'the ready replicas while every hop agrees per identity', () => {
    const rows = createCallDeploymentRows({statement: CALL_STATEMENT});
    const cache = seededCache(rows);
    const secondReplicaId = `${rows.definition.service_id}-r2`;
    cache.set(
      SYSTEM_TABLE_NAME.SERVICES,
      secondReplicaId,
      createActualRow(rows.definition, secondReplicaId, 'node-b'),
    );
    const resolver = new CallBindingRouteResolver({
      systemTableCacheProvider: () => cache,
    });
    const baseId = 'call-invocation-spread-fixture';
    const routeFor = (invocationId) => resolver.resolve({
      invocationId,
      name: CALL_BINDING_NAME,
      securityContext: SECURITY_CONTEXT,
    });
    const slotReplicas = [1, 2].map((slotId) =>
      routeFor(createCallSlotInvocationId(baseId, slotId)).replicaId);
    assert.equal(
      new Set(slotReplicas).size,
      2,
      'two consecutive slots land on the two distinct ready replicas',
    );
    for (const slotId of [1, 2]) {
      const wireId = createCallSlotInvocationId(baseId, slotId);
      assert.equal(
        routeFor(wireId).replicaId,
        routeFor(wireId).replicaId,
        'selection is deterministic per wire identity',
      );
    }
    assert.equal(
      routeFor(createCallReduceInvocationId(baseId)).replicaId,
      routeFor(baseId).replicaId,
      'reduce routes from the invocation primary selection',
    );
  });
});
