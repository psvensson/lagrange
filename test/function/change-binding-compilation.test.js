import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {beforeEach, describe, test} from 'node:test';

import {
  RuntimeServiceRebalancerOwner,
} from '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
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
import {LoggingService} from '../../src/logging/logging-service.js';
import {SD_COL} from '../../src/wasm-service/wasm-service-models.js';

const TENANT_ID = 'tenant-change';
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const LEGACY_MANAGER_PATH = 'src/function/cdc-subscription-manager.js';
const LEGACY_MANAGER_TEST_PATH =
  'test/function/cdc-subscription-manager.test.js';
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT_ID,
  principal: 'change-deployer',
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

  rows(tableName) {
    return this.storage.get(tableName);
  }

  primaryKey(tableName) {
    const schema = SYSTEM_TABLE_SCHEMAS.find(
      (candidate) => candidate.tableName === tableName,
    );
    return schema.primaryKey?.[0] ||
      schema.columns.find((column) => column.primaryKey)?.name;
  }

  async readAuthoritativeRows(tableName, sql, params) {
    const rows = [...this.rows(tableName).values()];
    const field = / WHERE ([a-z_]+) = \?$/u.exec(sql)?.[1];
    return {
      success: true,
      rows: clone(field ?
        rows.filter((row) => row[field] === params[0]) : rows),
    };
  }

  async insertSystemTableRow(tableName, row) {
    const rows = this.rows(tableName);
    const key = row[this.primaryKey(tableName)];
    if (rows.has(key)) return {success: false, error: 'duplicate key'};
    rows.set(key, clone(row));
    this.writes.push({operation: 'insert', tableName, row: clone(row)});
    if (this.lostInsertResponses.delete(tableName)) {
      throw new Error('insert response lost after durable apply');
    }
    return {success: true, affectedRows: 1};
  }

  async upsertSystemTableRow(tableName, row) {
    this.rows(tableName).set(row[this.primaryKey(tableName)], clone(row));
    this.writes.push({operation: 'upsert', tableName, row: clone(row)});
    return {success: true, affectedRows: 1};
  }
}

function manifest() {
  return {
    schema_version: 2,
    name: 'orders-change-service',
    version: '1.0.0',
    capabilities: ['clock.read', 'network.client'],
    exports: [{
      name: 'change-handler',
      interface: 'change_v1',
      reads: ['table:global.orders'],
      writes: ['table:global.audit'],
    }],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/acme/orders-change:1.0.0',
      digest: ARTIFACT_DIGEST,
      media_type: 'application/vnd.oci.image.manifest.v1+json',
    },
    runtime: {
      kind: 'oci_container',
      entrypoint: 'change-server',
      runtime_options: {memoryLimitMb: 64, networkPolicy: 'isolated'},
    },
  };
}

function bindingInput(package_, overrides = {}) {
  return {
    schema_version: 1,
    name: 'orders-change',
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: 'change-handler',
    },
    source: {
      kind: 'change',
      operations: ['delete', 'insert', 'update'],
      tables: ['table:global.audit', 'table:global.orders'],
    },
    contexts: ['table:global.audit', 'table:global.orders'],
    budgets: {
      cpu_time_ms: 100,
      wall_time_ms: 1000,
      memory_bytes: 1048576,
      input_bytes: 4096,
      output_bytes: 8192,
      context_bytes: 16384,
    },
    ...overrides,
  };
}

function resolvedArtifact() {
  return {
    status: 'resolved',
    artifact: {
      digest: ARTIFACT_DIGEST,
      payloadMediaType: 'application/vnd.oci.image.manifest.v1+json',
      signature: {status: 'verified', keyId: 'publisher-change'},
    },
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
  const input = bindingInput(package_, options.bindingOverrides);
  const binding = await owners.deploymentBindingOwner.createBinding(
    input, SECURITY_CONTEXT,
  );
  const bindingRow = gateway.rows(TABLES.SERVICE_BINDINGS)
    .get(binding.bindingVersionId);
  if (options.loseDesiredInsertResponse) {
    gateway.lostInsertResponses.add(TABLES.SERVICE_DEFINITIONS);
  }
  return {binding, bindingRow, gateway, input, owners};
}

function createPlanner(fixture) {
  const cache = createCache(fixture.gateway);
  const rebalancers = [];
  const owner = new RuntimeServiceRebalancerOwner({
    nodeId: 'node-change',
    systemTableCache: cache,
    cdcIntegrationService: {sqlQueryEngine: {}},
    tablePolicyService: {},
    messageRouter: {},
    rebalanceCoordinator: {},
    serviceDefinitionsOwner: fixture.owners.serviceDefinitionsOwner,
    createRebalancer: (options) => {
      rebalancers.push(options);
      return {initialize() {}, setLeader() {}, shutdown() {}};
    },
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

describe('change Binding compilation cutover', () => {
  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  test('production planning compiles the full source projection without an ' +
    'event or runtime actual', async () => {
    const fixture = await createFixture();
    fixture.gateway.writes.length = 0;
    const planner = createPlanner(fixture);

    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();

    const serviceId = deriveRequestServiceDefinitionId(
      fixture.binding.bindingVersionId,
    );
    const row = fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).get(serviceId);
    assert.ok(row);
    assert.equal(row[SD_COL.BINDING_VERSION_ID], fixture.binding.bindingVersionId);
    assert.equal(row[SD_COL.BINDING_DIGEST], fixture.bindingRow.binding_digest);
    assert.equal(row[SD_COL.STATUS], 'inactive');
    assert.equal(row[SD_COL.REPLICA_COUNT], 0);
    assert.equal(
      row[SD_COL.RUNTIME_REF],
      `registry.example.test/acme/orders-change:1.0.0@${ARTIFACT_DIGEST}`,
    );
    const projection = JSON.parse(row[SD_COL.BINDING_PROJECTION]);
    assert.deepEqual(projection.declaration.source, fixture.input.source);
    assert.deepEqual(projection.declaration.contexts, fixture.input.contexts);
    assert.deepEqual(
      projection.declaration.capabilities,
      ['clock.read', 'network.client'],
    );
    assert.deepEqual(projection.declaration.budgets, fixture.input.budgets);
    assert.equal(Object.hasOwn(projection.declaration, 'elasticity'), false);
    assert.deepEqual(
      fixture.gateway.writes.map((write) => write.tableName),
      [TABLES.SERVICE_DEFINITIONS],
    );
    assert.equal(fixture.gateway.rows(TABLES.SERVICES).size, 0);
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_ENDPOINTS).size, 0);
    assert.equal(planner.rebalancers.length, 0);
    planner.owner.shutdown();
  });

  test('cache wake, replay, leadership reacquisition, repair, lost response, ' +
    'and concurrent replay converge', async () => {
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
    assert.equal(fixture.gateway.writes.length, 0);

    const serviceId = deriveRequestServiceDefinitionId(
      fixture.binding.bindingVersionId,
    );
    planner.owner.setLeader(false);
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).delete(serviceId);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.writes.length, 1);
    planner.owner.shutdown();

    const lost = await createFixture({loseDesiredInsertResponse: true});
    const lostPlanner = createPlanner(lost);
    lostPlanner.owner.setLeader(true);
    await lostPlanner.owner.waitForBindingRefresh();
    assert.equal(lost.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
    lostPlanner.owner.shutdown();

    const concurrent = await createFixture();
    concurrent.gateway.writes.length = 0;
    const results = await Promise.all([
      concurrent.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        concurrent.bindingRow,
      ),
      concurrent.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        concurrent.bindingRow,
      ),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(concurrent.gateway.writes.length, 1);
  });

  test('conflicting and malformed durable change state fails closed',
    async () => {
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
      assert.equal(planner.rebalancers.length, 0);
      planner.owner.shutdown();

      const corrupt = await createFixture();
      const malformed = {
        ...corrupt.bindingRow,
        binding_version_id: `binding-version-${'f'.repeat(64)}`,
      };
      corrupt.gateway.rows(TABLES.SERVICE_BINDINGS).clear();
      corrupt.gateway.rows(TABLES.SERVICE_BINDINGS).set(
        malformed.binding_version_id, malformed,
      );
      const corruptPlanner = createPlanner(corrupt);
      corruptPlanner.owner.setLeader(true);
      await corruptPlanner.owner.waitForBindingRefresh();
      assert.equal(corrupt.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 0);
      assert.equal(corruptPlanner.rebalancers.length, 0);
      corruptPlanner.owner.shutdown();
    });

  test('the legacy declaration, callback API, tests, and private constants ' +
    'are absent', () => {
    assert.equal(existsSync(LEGACY_MANAGER_PATH), false);
    assert.equal(existsSync(LEGACY_MANAGER_TEST_PATH), false);
    const constants = readFileSync(
      'src/function/function-constants.js', 'utf8',
    );
    assert.doesNotMatch(
      constants,
      /FUNCTION_SUBSCRIPTION_TYPE|FUNCTION_CDC_MATCH_TYPE|FUNCTION_CDC_OPERATION|FUNCTION_CDC_PREDICATE|FUNCTION_EVENT|FUNCTION_PREDICATE|FUNCTION_SEPARATOR/u,
    );
    assert.doesNotMatch(
      constants,
      /SUBSCRIPTION_MANAGER|SUBSCRIPTION_INVOKE|CDC_CALLBACK|CDC_INVOKE/u,
    );
  });
});
