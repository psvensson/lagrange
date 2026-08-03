/**
 * Shared harness for the per-source-kind Binding compilation cutover tests
 * (once/boot/call/pushdown, time, change). One durable-gateway fake, one
 * fixture/planner kit, and the two scenario bodies every kind replays —
 * parameterized by the kind-specific manifest, binding input, and artifact
 * builders each test file keeps inline.
 */

import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

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
import {SD_COL} from '../../src/wasm-service/wasm-service-models.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HEALTH_STATUS,
  PREPARE_STATUS,
  START_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';

const COMPONENT_BYTES = Buffer.from(
  'AGFzbQ0AAQAHGwFCAgFAAAB3BAAOZ2V0LXJhbmRvbS11NjQBAAodAQAYd2FzaTpyYW5k' +
  'b20vcmFuZG9tQDAuMi4wBQAHXwFCBgFAAgV0YWJsZXkDa2V5eQB6BAAEcmVhZAEAAUAD' +
  'BXRhYmxleQNrZXl5BXZhbHVlegEABAAFd3JpdGUBAQFAAQpjYXBhYmlsaXR5eQB6BAAK' +
  'Y2FwYWJpbGl0eQECChoBABVsYWdyYW5nZTpjZWxsL2NvbnRleHQFAQYJAQEAAQRyZWFk' +
  'CAUBAQAAAAYKAQEAAQV3cml0ZQgFAQEAAQAGDwEBAAEKY2FwYWJpbGl0eQgFAQEAAgAC' +
  'HwEBAwRyZWFkAAAFd3JpdGUAAQpjYXBhYmlsaXR5AAIB1gEAYXNtAQAAAAESA2ACf38B' +
  'f2ADf39/AGABfwF/AikDA2N0eARyZWFkAAADY3R4BXdyaXRlAAEDY3R4CmNhcGFiaWxp' +
  'dHkAAgMCAQIHBwEDcnVuAAMKTQFLACAARQR/QQBBBxAAQQBBB0EqEAFBABACagUgAEEB' +
  'RgR/QeMAQQcQAAUgAEECRgR/QeMAEAIFIABBA0YEfwNADAALAAUgAAsLCwsLADEEbmFt' +
  'ZQACAW0BGgMABHJlYWQBBXdyaXRlAgpjYXBhYmlsaXR5AwoBAwEEBWFnYWluAgoBAAAB' +
  'A2N0eBIABw4BQAEHcmVxdWVzdHoAegYJAQAAAQEDcnVuCAYBAAADAAILCQEAA3J1bgED' +
  'AABdDmNvbXBvbmVudC1uYW1lARwAAAMABHJlYWQBBXdyaXRlAgpjYXBhYmlsaXR5AQYA' +
  'EQEAAW0BDAASAgAEY3R4aQEBaQEHAQEDA3J1bgEPBQIABnJhbmRvbQEDY3R4',
  'base64',
);
const COMPONENT_PAYLOAD_DIGEST = `sha256:${createHash('sha256')
  .update(COMPONENT_BYTES)
  .digest('hex')}`;
// call/pushdown Bindings start in the sealed call-cell world, whose host
// imports are `lagrange:cell/call-context` only — the request-cell fixture
// above cannot instantiate there. This fixture is a minimal conforming
// call-cell world component (wasm-tools component embed/new against
// wit/, the canonical authoring package) exporting run/reduce.
const CALL_COMPONENT_BYTES = Buffer.from(
  'AGFzbQ0AAQAHcAFCBwFxBApudWxsLXZhbHVlAAAHaW50ZWdlcgF4AARyZWFsAXUA' +
  'BHRleHQBcwAEAApjZWxsLXZhbHVlAwAAAXICBG5hbWVzA3ZhbAEEAAZjb2x1bW4D' +
  'AAIBcAMBcgEHY29sdW1ucwQEAANyb3cDAAUKHwEAGmxhZ3JhbmdlOmNlbGwvY2Fs' +
  'bC1jb250ZXh0BQAGCAEDAAADcm93CgkBAANyb3cDAAEBiwEAYXNtAQAAAAEJAWAE' +
  'f39/fwF/AwQDAAAABQMBAAEHKAQGbWVtb3J5AgAMY2FiaV9yZWFsbG9jAAADcnVu' +
  'AAEGcmVkdWNlAAIKEAMEAEEICwQAQQALBABBAAsALwlwcm9kdWNlcnMBDHByb2Nl' +
  'c3NlZC1ieQENd2l0LWNvbXBvbmVudAcwLjIzNi4wAgQBAAAABgwBAAIBAAZtZW1v' +
  'cnkHGQJwAkACBWJhdGNoAwlhcmd1bWVudHNzAHMGGgIAAAEAA3J1bgAAAQAMY2Fi' +
  'aV9yZWFsbG9jCAsBAAAAAwMABAEABAsJAQADcnVuAQAAByADbwJzc3AFQAIIcGFy' +
  'dGlhbHMGCWFyZ3VtZW50c3MAcwYMAQAAAQAGcmVkdWNlCAsBAAACAwMABAEABwsM' +
  'AQAGcmVkdWNlAQIAAC8JcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBDXdpdC1jb21w' +
  'b25lbnQHMC4yMzYuMA==',
  'base64',
);
const CALL_COMPONENT_PAYLOAD_DIGEST = `sha256:${createHash('sha256')
  .update(CALL_COMPONENT_BYTES)
  .digest('hex')}`;
const CALL_WORLD_SOURCE_KINDS = new Set(['call', 'pushdown']);

function componentFixtureForSourceKind(sourceKind) {
  return CALL_WORLD_SOURCE_KINDS.has(sourceKind) ?
    {bytes: CALL_COMPONENT_BYTES, payloadDigest: CALL_COMPONENT_PAYLOAD_DIGEST} :
    {bytes: COMPONENT_BYTES, payloadDigest: COMPONENT_PAYLOAD_DIGEST};
}

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

  async updateSystemTableRow(tableName, whereClause, data) {
    const rows = this.rows(tableName);
    const key = whereClause[this.primaryKey(tableName)];
    const existing = rows.get(key);
    if (!existing) return {success: true, affectedRows: 0};
    const row = {...existing, ...clone(data)};
    rows.set(key, row);
    this.writes.push({operation: 'update', tableName, row: clone(row)});
    return {success: true, affectedRows: 1};
  }
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

function resetTestSingletons() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

/**
 * Assert the compiled service-definition row shape every kind's
 * production-planning test shares, and return the row, its parsed binding
 * projection, and the derived service id for the kind-specific assertions
 * the caller keeps inline.
 *
 * @param {Object} options
 * @param {Object} options.fixture
 * @param {Object} options.planner
 * @param {string} options.runtimeRef
 * @param {string} [options.status]
 * @param {number} [options.expectedWriteCount]
 * @param {boolean} [options.expectRebalancer]
 * @return {{row: Object, projection: Object, serviceId: string}}
 */
function assertCompiledServiceDefinitionRow(options) {
  const {fixture, planner, runtimeRef} = options;
  const status = options.status || 'active';
  const expectedWriteCount = options.expectedWriteCount ?? 2;
  const expectRebalancer = options.expectRebalancer !== false;
  const serviceId = deriveRequestServiceDefinitionId(
    fixture.binding.bindingVersionId,
  );
  const row = fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).get(serviceId);
  assert.ok(row);
  assert.equal(row[SD_COL.BINDING_VERSION_ID], fixture.binding.bindingVersionId);
  assert.equal(row[SD_COL.BINDING_DIGEST], fixture.bindingRow.binding_digest);
  assert.equal(row[SD_COL.STATUS], status);
  assert.equal(row[SD_COL.REPLICA_COUNT], 0);
  assert.equal(row[SD_COL.RUNTIME_KIND], 'wasm_component');
  assert.equal(row[SD_COL.RUNTIME_REF], runtimeRef);
  const projection = JSON.parse(row[SD_COL.BINDING_PROJECTION]);
  assert.equal(Object.hasOwn(projection.declaration, 'contexts'), false);
  assert.deepEqual(projection.declaration.budgets, fixture.input.budgets);
  assert.equal(Object.hasOwn(projection.declaration, 'elasticity'), false);
  assert.deepEqual(
    fixture.gateway.writes.map((write) => write.tableName),
    new Array(expectedWriteCount).fill(TABLES.SERVICE_DEFINITIONS),
  );
  assert.equal(fixture.gateway.rows(TABLES.SERVICES).size, 0);
  assert.equal(fixture.gateway.rows(TABLES.SERVICE_ENDPOINTS).size, 0);
  if (expectRebalancer) {
    assert.equal(planner.rebalancers.length, 1);
    assert.equal(planner.rebalancers[0].entityId, serviceId);
    assert.equal(planner.rebalancers[0].entityType, 'runtime_service');
  } else {
    assert.equal(planner.rebalancers.length, 0);
  }
  return {projection, row, serviceId};
}

function assertDesiredServiceConflict(error) {
  assert.ok(error instanceof RequestBindingServiceDefinitionError);
  assert.equal(
    error.code,
    REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DESIRED_SERVICE_CONFLICT,
  );
  return true;
}

/**
 * Build the kind-parameterized fixture/planner/readiness kit one Binding
 * compilation test file drives. The builders receive the per-fixture
 * sourceKind so multi-kind files (once/boot/call/pushdown) can share one kit.
 *
 * @param {Object} config
 * @param {string} config.tenantId
 * @param {Object} config.securityContext
 * @param {number} config.nowMs
 * @param {string} config.plannerNodeId
 * @param {(sourceKind: string|undefined) => string} config.replicaNodeId
 * @param {string} config.artifactDigest
 * @param {(sourceKind: string|undefined) => Object} config.buildManifest
 * @param {Function} config.buildBindingInput
 * @param {(sourceKind: string|undefined) => Object} config.buildResolvedArtifact
 * @return {Object}
 */
function createBindingCompilationKit(config) {
  async function createFixture(options = {}) {
    const sourceKind = options.sourceKind;
    const gateway = new DurableGateway();
    const owners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: gateway,
      now: () => config.nowMs,
    });
    const value = config.buildManifest(sourceKind);
    const packageId = deriveTenantPackageId(value, config.tenantId);
    const package_ = await owners.serviceInstallCatalogOwner.recordPackage({
      packageId,
      manifest: value,
      resolvedArtifact: config.buildResolvedArtifact(sourceKind),
    });
    const input = config.buildBindingInput(
      package_, sourceKind, options.bindingOverrides,
    );
    const binding = await owners.deploymentBindingOwner.createBinding(
      input, config.securityContext,
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
      nodeId: config.plannerNodeId,
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

  async function assertComponentReadiness(definition, bindingRow, sourceKind) {
    const fixture = componentFixtureForSourceKind(sourceKind);
    const driver = new WasmComponentDriver({
      artifactLoader: async () => ({
        artifactDigest: config.artifactDigest,
        bytes: fixture.bytes,
        manifest: config.buildManifest(sourceKind),
        manifestDigest: bindingRow.manifest_digest,
        packageId: bindingRow.package_id,
        payloadDigest: fixture.payloadDigest,
      }),
      componentRuntime: new WasiComponentCellRuntime(),
    });
    const registry = new RuntimeDriverRegistry();
    registry.register(driver);
    registry.freeze();
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    const projections = [];
    lifecycle.setStateProjectionWriter(async (_serviceId, projection) => {
      projections.push(projection);
    });
    const replica = {definition, nodeId: config.replicaNodeId(sourceKind)};

    assert.equal(
      (await lifecycle.prepare(definition, {})).status,
      PREPARE_STATUS.READY,
    );
    assert.equal(
      (await lifecycle.start(replica)).status,
      START_STATUS.RUNNING,
    );
    assert.equal(
      (await lifecycle.health(replica)).status,
      HEALTH_STATUS.HEALTHY,
    );
    assert.equal(projections.at(-1).status, 'active');
    await lifecycle.stop(replica);
  }

  /**
   * The 'cache wake, replay, leadership reacquisition, repair, lost
   * response, and concurrent replay converge' scenario body.
   * @param {Object} [options]
   * @param {Object} [options.fixtureOptions]
   * @param {number} [options.expectedRepairWrites]
   * @param {number} [options.expectedConcurrentWrites]
   */
  async function runReplayConvergenceScenario(options = {}) {
    const fixtureOptions = options.fixtureOptions || {};
    const expectedRepairWrites = options.expectedRepairWrites ?? 2;
    const expectedConcurrentWrites = options.expectedConcurrentWrites ?? 2;
    const fixture = await createFixture(fixtureOptions);
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    fixture.gateway.writes.length = 0;

    planner.cache.emit(TABLES.SERVICE_BINDINGS);
    await planner.owner.waitForBindingRefresh();
    planner.owner.refresh();
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
    assert.equal(fixture.gateway.writes.length, expectedRepairWrites);
    planner.owner.shutdown();

    const lost = await createFixture({
      ...fixtureOptions,
      loseDesiredInsertResponse: true,
    });
    const lostPlanner = createPlanner(lost);
    lostPlanner.owner.setLeader(true);
    await lostPlanner.owner.waitForBindingRefresh();
    assert.equal(lost.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
    lostPlanner.owner.shutdown();

    const concurrent = await createFixture(fixtureOptions);
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
    assert.equal(
      concurrent.gateway.writes.length,
      expectedConcurrentWrites,
    );
  }

  /**
   * The 'conflicting and malformed durable state fails closed' scenario
   * body.
   * @param {Object} [options]
   * @param {Object} [options.fixtureOptions]
   * @param {string} [options.corruptFillChar]
   */
  async function runFailClosedScenario(options = {}) {
    const fixtureOptions = options.fixtureOptions || {};
    const corruptFillChar = options.corruptFillChar || 'f';
    const fixture = await createFixture(fixtureOptions);
    const artifact = await fixture.owners.serviceInstallCatalogOwner
      .getBindableArtifactForTenant(
        fixture.bindingRow.package_id,
        fixture.bindingRow.manifest_digest,
        config.tenantId,
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
      assertDesiredServiceConflict,
    );
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(planner.rebalancers.length, 0);
    planner.owner.shutdown();

    const corrupt = await createFixture(fixtureOptions);
    const malformed = {
      ...corrupt.bindingRow,
      binding_version_id: `binding-version-${corruptFillChar.repeat(64)}`,
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
  }

  return {
    assertComponentReadiness,
    createFixture,
    createPlanner,
    runFailClosedScenario,
    runReplayConvergenceScenario,
  };
}

export {
  assertCompiledServiceDefinitionRow,
  createBindingCompilationKit,
  resetTestSingletons,
};
