import assert from 'node:assert/strict';
import {beforeEach, describe, test} from 'node:test';

import {
  RuntimeServiceRebalancerOwner,
} from '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE,
  RequestBindingServiceDefinitionError,
  buildRequestBindingServiceDefinition,
  createSystemMetadataOwners,
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/index.js';
import {deriveTenantPackageId} from
  '../../src/control-plane/owners/service-install-catalog-contract.js';
import {supportsBindingServiceDefinitionSourceKind} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SD_COL} from '../../src/wasm-service/wasm-service-models.js';

const TENANT_ID = 'tenant-a';
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT_ID,
  principal: 'alice',
  roles: Object.freeze(['deployer']),
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class DurableGateway {
  constructor() {
    this.storage = new Map(SYSTEM_TABLE_SCHEMAS.map(
      (schema) => [schema.tableName, new Map()],
    ));
    this.writes = [];
    this.lostInsertResponses = new Set();
  }

  schema(tableName) {
    return SYSTEM_TABLE_SCHEMAS.find(
      (schema) => schema.tableName === tableName,
    );
  }

  primaryKey(tableName) {
    const schema = this.schema(tableName);
    return schema.primaryKey?.[0] ||
      schema.columns.find((column) => column.primaryKey)?.name;
  }

  rows(tableName) {
    return this.storage.get(tableName);
  }

  async readAuthoritativeRows(tableName, sql, params) {
    const rows = [...this.rows(tableName).values()];
    const field = / WHERE ([a-z_]+) = \?$/u.exec(sql)?.[1];
    const selected = field ?
      rows.filter((row) => row[field] === params[0]) : rows;
    return {success: true, rows: clone(selected)};
  }

  async insertSystemTableRow(tableName, row) {
    const table = this.rows(tableName);
    const key = row[this.primaryKey(tableName)];
    if (table.has(key)) return {success: false, error: 'duplicate key'};
    table.set(key, clone(row));
    this.writes.push({operation: 'insert', tableName, row: clone(row)});
    if (this.lostInsertResponses.delete(tableName)) {
      throw new Error('insert response lost after durable apply');
    }
    return {success: true, affectedRows: 1};
  }

  async upsertSystemTableRow(tableName, row) {
    this.rows(tableName).set(
      row[this.primaryKey(tableName)], clone(row),
    );
    this.writes.push({operation: 'upsert', tableName, row: clone(row)});
    return {success: true, affectedRows: 1};
  }

  loseNextInsertResponse(tableName) {
    this.lostInsertResponses.add(tableName);
  }
}

function manifest() {
  return {
    schema_version: 2,
    name: 'orders-service',
    version: '1.0.0',
    capabilities: ['network.client', 'clock.read'],
    exports: [{
      name: 'request-handler',
      interface: 'request_v1',
      reads: ['table:global.orders'],
      writes: ['table:global.audit'],
    }],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/acme/orders:1.0.0',
      digest: ARTIFACT_DIGEST,
      media_type: 'application/vnd.oci.image.manifest.v1+json',
    },
    runtime: {
      kind: 'oci_container',
      entrypoint: 'server',
      runtime_options: {memoryLimitMb: 128, networkPolicy: 'isolated'},
    },
  };
}

function resolvedArtifact() {
  return {
    status: 'resolved',
    artifact: {
      digest: ARTIFACT_DIGEST,
      payloadMediaType: 'application/vnd.oci.image.manifest.v1+json',
      signature: {status: 'verified', keyId: 'publisher-main'},
    },
  };
}

function bindingInput(package_, overrides = {}) {
  return {
    schema_version: 0,
    name: 'orders-api',
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: 'request-handler',
    },
    source: {kind: 'request', method: 'POST', path: '/orders'},
    contexts: ['table:global.audit', 'table:global.orders'],
    budgets: {
      cpu_time_ms: 100,
      wall_time_ms: 1000,
      memory_bytes: 1048576,
      input_bytes: 4096,
      output_bytes: 8192,
      context_bytes: 16384,
    },
    elasticity: {voters: 3, min_learners: 1, max_learners: 2},
    ...overrides,
  };
}

function createCache(gateway) {
  const listeners = new Set();
  return {
    filter(tableName, predicate) {
      return [...gateway.rows(tableName).values()].filter(predicate);
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    emit(tableName) {
      for (const listener of listeners) listener(tableName, 'INSERT', {});
    },
  };
}

function makeFakeRebalancer(record, options) {
  const rebalancer = {
    options,
    initialize() {},
    setLeader() {},
    shutdown() {},
  };
  record.push(rebalancer);
  return rebalancer;
}

async function createFixture(options = {}) {
  const gateway = new DurableGateway();
  const owners = createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now: () => 1000,
  });
  const value = manifest();
  const packageId = deriveTenantPackageId(value, TENANT_ID);
  const package_ = await owners.serviceInstallCatalogOwner.recordPackage({
    packageId,
    manifest: value,
    resolvedArtifact: resolvedArtifact(),
  });
  const binding = await owners.deploymentBindingOwner.createBinding(
    bindingInput(package_), SECURITY_CONTEXT,
  );
  const bindingRow = gateway.rows(TABLES.SERVICE_BINDINGS)
    .get(binding.bindingVersionId);
  if (options.loseDesiredInsertResponse) {
    gateway.loseNextInsertResponse(TABLES.SERVICE_DEFINITIONS);
  }
  return {binding, bindingRow, gateway, owners, package_};
}

function createPlanner(fixture) {
  const cache = createCache(fixture.gateway);
  const rebalancers = [];
  const owner = new RuntimeServiceRebalancerOwner({
    nodeId: 'node-1',
    systemTableCache: cache,
    cdcIntegrationService: {sqlQueryEngine: {}},
    tablePolicyService: {},
    messageRouter: {},
    rebalanceCoordinator: {},
    serviceDefinitionsOwner: fixture.owners.serviceDefinitionsOwner,
    createRebalancer: (options) =>
      makeFakeRebalancer(rebalancers, options),
  });
  return {cache, owner, rebalancers};
}

function assertConflict(error) {
  assert.ok(error instanceof RequestBindingServiceDefinitionError);
  assert.equal(
    error.code,
    REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DESIRED_SERVICE_CONFLICT,
  );
  return true;
}

describe('request Binding desired-service compilation owner', () => {
  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  test('the compiler source set preserves prior sources and adds only boot',
    () => {
      assert.equal(
        supportsBindingServiceDefinitionSourceKind('request'), true,
      );
      assert.equal(supportsBindingServiceDefinitionSourceKind('change'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('time'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('once'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('boot'), true);
      for (const sourceKind of ['call', 'pushdown']) {
        assert.equal(
          supportsBindingServiceDefinitionSourceKind(sourceKind),
          false,
        );
      }
    });

  test('the existing planning leader compiles the complete pinned projection ' +
    'without creating a runtime actual', async () => {
    const fixture = await createFixture();
    fixture.gateway.writes.length = 0;
    const planner = createPlanner(fixture);

    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    planner.cache.emit(TABLES.SERVICE_DEFINITIONS);
    await planner.owner.waitForBindingRefresh();

    const serviceId = deriveRequestServiceDefinitionId(
      fixture.binding.bindingVersionId,
    );
    const row = fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).get(serviceId);
    assert.ok(row, 'the request Binding produced one desired service row');
    assert.equal(row[SD_COL.BINDING_VERSION_ID], fixture.binding.bindingVersionId);
    assert.equal(row[SD_COL.BINDING_DIGEST], fixture.bindingRow.binding_digest);
    assert.equal(row[SD_COL.STATUS], 'inactive');
    assert.equal(row[SD_COL.REPLICA_COUNT], 0);
    assert.equal(row[SD_COL.RUNTIME_KIND], 'oci_container');
    assert.equal(
      row[SD_COL.RUNTIME_REF],
      `registry.example.test/acme/orders:1.0.0@${ARTIFACT_DIGEST}`,
    );
    assert.deepEqual(JSON.parse(row[SD_COL.RUNTIME_CONFIG]), {
      entrypoint: 'server',
      export_name: 'request-handler',
      runtime_options: {memoryLimitMb: 128, networkPolicy: 'isolated'},
    });
    assert.deepEqual(
      JSON.parse(row[SD_COL.RESOURCE_BUDGET]),
      bindingInput(fixture.package_).budgets,
    );
    const projection = JSON.parse(row[SD_COL.BINDING_PROJECTION]);
    assert.equal(projection.binding_version_id, fixture.binding.bindingVersionId);
    assert.equal(projection.tenant_id, TENANT_ID);
    assert.deepEqual(
      projection.declaration.source,
      {kind: 'request', method: 'POST', path: '/orders'},
    );
    assert.deepEqual(
      projection.declaration.contexts,
      ['table:global.audit', 'table:global.orders'],
    );
    assert.deepEqual(
      projection.declaration.capabilities,
      ['clock.read', 'network.client'],
    );
    assert.deepEqual(
      projection.declaration.elasticity,
      {max_learners: 2, min_learners: 1, voters: 3},
    );
    assert.deepEqual(
      fixture.gateway.writes.map((write) => write.tableName),
      [TABLES.SERVICE_DEFINITIONS],
    );
    assert.equal(fixture.gateway.rows(TABLES.SERVICES).size, 0);
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_ENDPOINTS).size, 0);
    assert.equal(planner.rebalancers.length, 0);
    planner.owner.shutdown();
  });

  test('CDC wake, replay, and leadership reacquisition are stable and repair ' +
    'a missing derived row', async () => {
    const fixture = await createFixture();
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    fixture.gateway.writes.length = 0;

    planner.cache.emit(TABLES.SERVICE_BINDINGS);
    await planner.owner.waitForBindingRefresh();
    planner.owner.setLeader(false);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.writes.length, 0, 'stable replay does not write');

    const nextInput = bindingInput(fixture.package_, {
      name: 'orders-status',
      source: {kind: 'request', method: 'GET', path: '/orders/status'},
    });
    await fixture.owners.deploymentBindingOwner.createBinding(
      nextInput, SECURITY_CONTEXT,
    );
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1,
      'declaration persistence alone does not compile synchronously');
    fixture.gateway.writes.length = 0;
    planner.cache.emit(TABLES.SERVICE_BINDINGS);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 2,
      'the replicated Binding cache wake compiles the new declaration');
    assert.deepEqual(
      fixture.gateway.writes.map((write) => write.tableName),
      [TABLES.SERVICE_DEFINITIONS],
    );
    fixture.gateway.writes.length = 0;

    const serviceId = deriveRequestServiceDefinitionId(
      fixture.binding.bindingVersionId,
    );
    planner.owner.setLeader(false);
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).delete(serviceId);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.writes.length, 1, 'leader scan repairs absence');
    assert.ok(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).has(serviceId));
    planner.owner.shutdown();
  });

  test('lost insert responses recover by authoritative replay', async () => {
    const fixture = await createFixture({loseDesiredInsertResponse: true});
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
    assert.equal(planner.rebalancers.length, 0);
    planner.owner.shutdown();
  });

  test('the declaration owner exposes no generic row-mutation API', async () => {
    const fixture = await createFixture();
    for (const methodName of [
      'insertRow',
      'upsertRow',
      'updateByPrimaryKey',
      'deleteByPrimaryKey',
    ]) {
      assert.equal(
        typeof fixture.owners.serviceDefinitionsOwner[methodName],
        'undefined',
        `${methodName} is not a public declaration bypass`,
      );
    }
  });

  test('conflicting derived state fails closed and cannot activate', async () => {
    const fixture = await createFixture();
    const artifact = await fixture.owners.serviceInstallCatalogOwner
      .getBindableArtifactForTenant(
        fixture.bindingRow.package_id,
        fixture.bindingRow.manifest_digest,
        TENANT_ID,
      );
    const expected = buildRequestBindingServiceDefinition(
      fixture.bindingRow, artifact,
    );
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).set(
      expected.service_id,
      {...expected, binding_version_id: null, status: 'active'},
    );

    await assert.rejects(
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      assertConflict,
    );
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(planner.rebalancers.length, 0,
      'partial Binding lineage remains ineligible for runtime placement');
    planner.owner.shutdown();
  });

  test('alternate service IDs cannot duplicate one Binding lineage', async () => {
    const fixture = await createFixture();
    const artifact = await fixture.owners.serviceInstallCatalogOwner
      .getBindableArtifactForTenant(
        fixture.bindingRow.package_id,
        fixture.bindingRow.manifest_digest,
        TENANT_ID,
      );
    const expected = buildRequestBindingServiceDefinition(
      fixture.bindingRow, artifact,
    );
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).set(
      'conflicting-service-id',
      {
        ...expected,
        service_id: 'conflicting-service-id',
        service_name: 'conflicting-service-id',
      },
    );
    fixture.gateway.writes.length = 0;

    await assert.rejects(
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      assertConflict,
    );
    assert.equal(fixture.gateway.writes.length, 0);
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
  });

  test('malformed request declaration state is ignored without a partial row',
    async () => {
      const fixture = await createFixture();
      const malformed = {
        ...fixture.bindingRow,
        binding_version_id: `binding-version-${'f'.repeat(64)}`,
      };
      fixture.gateway.rows(TABLES.SERVICE_BINDINGS).clear();
      fixture.gateway.rows(TABLES.SERVICE_BINDINGS).set(
        malformed.binding_version_id, malformed,
      );
      const planner = createPlanner(fixture);
      planner.owner.setLeader(true);
      await planner.owner.waitForBindingRefresh();
      assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 0);
      assert.equal(planner.rebalancers.length, 0);
      planner.owner.shutdown();
    });

  test('concurrent owner replay inserts one deterministic row', async () => {
    const fixture = await createFixture();
    fixture.gateway.writes.length = 0;
    const results = await Promise.all([
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(fixture.gateway.writes.length, 1);
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
  });
});
