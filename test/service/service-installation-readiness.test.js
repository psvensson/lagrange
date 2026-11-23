import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';
import {
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_FAILURE_CODE,
  SERVICE_INSTALL_FAILURE_PHASE,
  SERVICE_INSTALL_ROLLOUT_STATE,
  createSystemMetadataOwners,
} from '../../src/control-plane/owners/index.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {runInspect} from '../../src/cli/service-pipeline-command.js';
import {
  runServicePipelineCommand,
} from '../../src/cli/service-pipeline-router.js';
import {PostgresWireAdapter} from '../../src/query/pg/postgres-wire-adapter.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from '../../src/runtime/pgwire-auth-handler.js';
import {
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';

const TENANT_ID = 'tenant-readiness';
const USER = 'service-operator';
const NODE_ID = 'node-readiness-1';
const SERVICE_NAME = 'orders-readiness-svc';
const DIGEST_V1 = `sha256:${'1'.repeat(64)}`;
const DIGEST_V2 = `sha256:${'2'.repeat(64)}`;
const DIGEST_OCI = `sha256:${'3'.repeat(64)}`;
const WASM_MEDIA_TYPE = 'application/wasm';
const OCI_MEDIA_TYPE = 'application/vnd.oci.image.manifest.v1+json';

const CATALOG_TABLES = Object.freeze([
  TABLES.CONFIG,
  TABLES.SERVICE_BINDINGS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.SERVICE_PACKAGES,
  TABLES.SERVICE_REVISIONS,
  TABLES.SERVICE_INSTALLATIONS,
  TABLES.SERVICE_INSTALL_FAILURES,
  TABLES.SERVICES,
]);

const LIFECYCLE_ACTIONS = Object.freeze([
  PGWIRE_AUTH_ACTION.ACCESS_CONFIGURE,
  PGWIRE_AUTH_ACTION.BINDING_CREATE,
  PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
  PGWIRE_AUTH_ACTION.SERVICE_INSTALL,
  PGWIRE_AUTH_ACTION.SERVICE_READ,
  PGWIRE_AUTH_ACTION.SERVICE_REMOVE,
  PGWIRE_AUTH_ACTION.SERVICE_UPGRADE,
]);

const DEFAULT_BUDGETS = Object.freeze({
  context_bytes: 65_536,
  cpu_time_ms: 5_000,
  input_bytes: 262_144,
  memory_bytes: 128 * 1_024 * 1_024,
  output_bytes: 262_144,
  wall_time_ms: 30_000,
});

const SILENT_LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class ReadinessCatalogGateway {
  constructor(systemTableCache) {
    this.systemTableCache = systemTableCache;
    this.tables = new Map(CATALOG_TABLES.map((table) => [table, new Map()]));
  }

  primaryKey(table) {
    return {
      [TABLES.CONFIG]: 'config_key',
      [TABLES.SERVICE_PACKAGES]: 'package_id',
      [TABLES.SERVICE_BINDINGS]: 'binding_version_id',
      [TABLES.SERVICE_DEFINITIONS]: 'service_id',
      [TABLES.SERVICE_ENDPOINTS]: 'endpoint_id',
      [TABLES.SERVICE_REVISIONS]: 'revision_id',
      [TABLES.SERVICE_INSTALLATIONS]: 'installation_id',
      [TABLES.SERVICE_INSTALL_FAILURES]: 'failure_id',
      [TABLES.SERVICES]: 'service_id',
    }[table];
  }

  async readAuthoritativeRows(table, sql, params) {
    const rows = [...(this.tables.get(table) || new Map()).values()];
    const match = / WHERE ([a-z_]+) = \?$/u.exec(sql);
    return {
      rows: clone(match ?
        rows.filter((row) => row[match[1]] === params[0]) :
        rows),
      success: true,
    };
  }

  async insertSystemTableRow(table, row) {
    const rows = this.tables.get(table);
    const key = row[this.primaryKey(table)];
    if (rows.has(key)) return {error: 'duplicate key', success: false};
    if (table === TABLES.SERVICE_INSTALLATIONS &&
        [...rows.values()].some((entry) => entry.operation_id === row.operation_id)) {
      return {error: 'duplicate operation', success: false};
    }
    rows.set(key, clone(row));
    this.systemTableCache?.applySystemTableChange(table, CDC_OPERATION.UPSERT, row);
    return {affectedRows: 1, success: true};
  }

  async updateSystemTableRow(table, where, data) {
    let affectedRows = 0;
    const rows = this.tables.get(table);
    for (const [key, row] of rows) {
      if (!Object.entries(where).every(([field, value]) => row[field] === value)) continue;
      const updated = clone({...row, ...data});
      rows.set(key, updated);
      this.systemTableCache?.applySystemTableChange(table, CDC_OPERATION.UPSERT, updated);
      affectedRows += 1;
    }
    return {affectedRows, success: true};
  }

  async awaitProjectionAt(position) {
    return {outcome: 'reached', position};
  }

  async upsertSystemTableRow(table, row) {
    const pk = this.primaryKey(table);
    this.tables.get(table).set(row[pk], clone(row));
    this.systemTableCache?.applySystemTableChange(table, CDC_OPERATION.UPSERT, row);
    return {affectedRows: 1, success: true};
  }

  async deleteSystemTableRow(table, where) {
    let affectedRows = 0;
    const rows = this.tables.get(table);
    for (const [key, row] of rows) {
      if (!Object.entries(where).every(([field, value]) => row[field] === value)) continue;
      rows.delete(key);
      this.systemTableCache?.applySystemTableChange(table, CDC_OPERATION.DELETE, row);
      affectedRows += 1;
    }
    return {affectedRows, success: true};
  }
}

function createSealedPayloadStore(digests = [DIGEST_V1, DIGEST_V2, DIGEST_OCI]) {
  const sealed = new Map();
  for (const digest of digests) {
    sealed.set(digest, Object.freeze({
      artifactDigest: digest,
      chunkCount: 1,
      createdAt: 1_000,
      mediaType: digest === DIGEST_OCI ? OCI_MEDIA_TYPE : WASM_MEDIA_TYPE,
      payloadDigest: digest,
      sealedAt: 1_000,
      totalSize: 2_048,
    }));
  }
  return {
    async findSealedPayloadByArtifactDigest(artifactDigest) {
      const payload = sealed.get(artifactDigest);
      return payload ? {found: true, payload} : {found: false};
    },
    async putPayload() {
      return {alreadySealed: true};
    },
  };
}

function createFixtureArtifactResolver() {
  return {
    async resolve(request) {
      return Object.freeze({
        artifact: Object.freeze({
          digest: request.manifest.artifact.digest,
          payloadMediaType: request.manifest.artifact.media_type,
          signature: Object.freeze({
            keyId: null,
            status: 'unsigned_allowed',
          }),
        }),
        status: 'resolved',
      });
    },
  };
}

function wasmManifest({
  digest = DIGEST_V1,
  name = SERVICE_NAME,
  version = '1.0.0',
} = {}) {
  return {
    artifact: {
      digest,
      media_type: WASM_MEDIA_TYPE,
      ref: `registry.example.test/${name}:${version}`,
      type: 'oci',
    },
    exports: [
      {interface: 'request_v2', name: 'handle-request'},
      {interface: 'call_v2', name: 'run'},
    ],
    name,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version,
  };
}

function ociManifest({name = 'oci-unsupported-svc', version = '1.0.0'} = {}) {
  return {
    artifact: {
      digest: DIGEST_OCI,
      media_type: OCI_MEDIA_TYPE,
      ref: `registry.example.test/${name}@${DIGEST_OCI}`,
      type: 'oci',
    },
    exports: [{interface: 'request_v1', name: 'serve'}],
    name,
    runtime: {kind: RUNTIME_KIND.OCI_CONTAINER},
    schema_version: 3,
    version,
  };
}

async function createProductionReadinessFixture(options = {}) {
  const includeCacheInOwners = options.includeCacheInOwners !== false;
  const systemTableCache = new SystemTableCache();
  const gateway = new ReadinessCatalogGateway(
    includeCacheInOwners ? systemTableCache : null,
  );
  let now = 1_000;
  const systemMetadataOwners = createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now: () => now++,
    systemTableCache: includeCacheInOwners ? systemTableCache : null,
  });
  const artifactPayloadStore = createSealedPayloadStore();
  systemMetadataOwners.deploymentBindingOwner.artifactPayloadStore =
    artifactPayloadStore;

  const commandOwner = new ServiceLifecycleCommandOwner({
    artifactPayloadStore,
    artifactResolver: createFixtureArtifactResolver(),
    bindingOwner: systemMetadataOwners.deploymentBindingOwner,
    catalogOwner: systemMetadataOwners.serviceInstallCatalogOwner,
    runtimeAccessPolicyOwner: systemMetadataOwners.runtimeAccessPolicyOwner,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });

  const engine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: {deliver: async () => ({success: true})},
    systemCache: systemTableCache,
  });
  engine.setServiceLifecycleCommandOwner(commandOwner);
  engine.setRuntimeAccessPolicyOwner(
    systemMetadataOwners.runtimeAccessPolicyOwner,
  );

  const authHandler = new PgWireAuthHandler({
    authenticator: async () => ({
      authenticated: true,
      roles: ['service-operator'],
    }),
    logger: SILENT_LOGGER,
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    policy: {allowedActions: new Set(LIFECYCLE_ACTIONS)},
  });
  const pgAdapter = new PostgresWireAdapter({
    authHandler,
    logger: SILENT_LOGGER,
    sqlCore: engine,
  });
  await pgAdapter.authenticate('session-readiness', {
    database: TENANT_ID,
    password: 'test-password',
    tenantId: TENANT_ID,
    user: USER,
  });

  const createSqlClient = () => ({
    async execute(statement, parameters = []) {
      const res = await pgAdapter.execute(
        'session-readiness',
        statement,
        parameters,
      );
      if (res.success === false) {
        const error = new Error(res.errorMessage || res.error || 'sql failed');
        error.code = res.errorCode;
        throw error;
      }
      return res;
    },
  });

  async function executeSql(statement, payload) {
    const params = payload === undefined ? [] : [JSON.stringify(payload)];
    return createSqlClient().execute(statement, params);
  }

  async function installService({
    command = 'INSTALL SERVICE $1',
    idempotencyKey,
    manifest = wasmManifest(),
  }) {
    const result = await executeSql(command, {
      config: {},
      idempotency_key: idempotencyKey,
      manifest,
    });
    const row = result.rows[0];
    const pkg = await systemMetadataOwners.serviceInstallCatalogOwner
      .getPackage(row.package_id);
    return {manifestDigest: pkg.manifestDigest, packageId: row.package_id, row};
  }

  async function createRequestBinding({
    manifestDigest,
    name = `${SERVICE_NAME}--request--fetch`,
    packageId,
    path: routePath = '/orders',
  }) {
    const result = await executeSql('CREATE BINDING $1', {
      budgets: DEFAULT_BUDGETS,
      name,
      schema_version: 3,
      source: {kind: 'request', method: 'POST', path: routePath},
      target: {
        handler_id: 'fetch',
        interface: 'request_v2',
        manifest_digest: manifestDigest,
        package_id: packageId,
      },
    });
    const rows = await systemMetadataOwners.deploymentBindingOwner
      .readBindingRowsByName(TENANT_ID, name);
    return {bindingRow: rows[rows.length - 1], receipt: result.rows[0]};
  }

  async function createCallBinding({
    manifestDigest,
    name = `${SERVICE_NAME}--call--summarize`,
    packageId,
    statement = 'SELECT id FROM orders',
  }) {
    const source = statement === null ?
      {kind: 'call', name} :
      {kind: 'call', name, statement};
    const result = await executeSql('CREATE BINDING $1', {
      budgets: DEFAULT_BUDGETS,
      name,
      schema_version: 3,
      source,
      target: {
        handler_id: 'summarize',
        interface: 'call_v2',
        manifest_digest: manifestDigest,
        package_id: packageId,
      },
    });
    const rows = await systemMetadataOwners.deploymentBindingOwner
      .readBindingRowsByName(TENANT_ID, name);
    return {bindingRow: rows[rows.length - 1], receipt: result.rows[0]};
  }

  async function publishBindingDefinition(bindingRow, {active = true} = {}) {
    const binding = projectBinding(bindingRow);
    const artifact = await systemMetadataOwners.serviceInstallCatalogOwner
      .getBindableArtifactForTenant(
        binding.declaration.target.package_id,
        binding.declaration.target.manifest_digest,
        TENANT_ID,
      );
    const compiled = buildRequestBindingServiceDefinition(bindingRow, artifact);
    const definition = active ?
      buildActivatedRequestBindingServiceDefinition(compiled, binding) :
      compiled;
    systemTableCache.applySystemTableChange(
      TABLES.SERVICE_DEFINITIONS,
      CDC_OPERATION.UPSERT,
      definition,
    );
    return {binding, definition, serviceId: definition.service_id};
  }

  function publishCellActual(serviceId, {
    nodeId = NODE_ID,
    status = ReplicaStatus.ACTIVE,
  } = {}) {
    const replicaId = `${serviceId}-r1`;
    const row = {
      node_id: nodeId,
      service_id: replicaId,
      service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      status,
    };
    systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      row,
    );
    return row;
  }

  function removeCellActual(serviceId) {
    systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.DELETE,
      {service_id: `${serviceId}-r1`},
    );
  }

  async function convergeCatalogInstallation(installationId) {
    await systemMetadataOwners.serviceInstallCatalogOwner.recordRolloutOutcome({
      installationId,
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    });
    await systemMetadataOwners.serviceInstallCatalogOwner.recordRolloutOutcome({
      installationId,
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
    });
  }

  return {
    catalogOwner: systemMetadataOwners.serviceInstallCatalogOwner,
    commandOwner,
    convergeCatalogInstallation,
    createCallBinding,
    createRequestBinding,
    createSqlClient,
    executeSql,
    gateway,
    installService,
    pgAdapter,
    publishBindingDefinition,
    publishCellActual,
    removeCellActual,
    systemMetadataOwners,
    systemTableCache,
  };
}

describe('Q4 service-inspect-achieved-readiness', () => {
  it('intent-is-not-readiness: desired active with initial recorded_not_running is never reported ready', async () => {
    const fx = await createProductionReadinessFixture();
    const installed = await fx.installService({
      idempotencyKey: 'q4-intent-not-ready-1',
    });

    assert.equal(installed.row.desired_state, SERVICE_INSTALL_DESIRED_STATE.ACTIVE);
    assert.equal(
      installed.row.rollout_state,
      SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
    );

    const inspected = await runInspect({
      createSqlClient: fx.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.service, SERVICE_NAME);
    assert.equal(inspected.ready, false);
    assert.equal(inspected.row.desired_state, SERVICE_INSTALL_DESIRED_STATE.ACTIVE);
    assert.equal(
      inspected.row.rollout_state,
      SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
    );
    assert.equal(inspected.row.readiness_state, 'not_ready');
    assert.equal(inspected.row.installation_id, installed.row.installation_id);
    assert.equal(inspected.row.revision_id, installed.row.revision_id);
    assert.equal(inspected.row.latest_failure_id, null);

    // Public CLI router path (`lagrange service inspect`) must agree.
    const outputs = [];
    const errors = [];
    const exitCode = await runServicePipelineCommand(
      ['inspect', SERVICE_NAME],
      {
        createLocalOciLayoutBuilder: () => ({}),
        createSqlClient: fx.createSqlClient,
        writeError: (line) => errors.push(line),
        writeOutput: (line) => outputs.push(line),
      },
    );
    assert.equal(exitCode, 0, errors.join('\n'));
    const cliPayload = JSON.parse(outputs[0]);
    assert.equal(cliPayload.ready, false);
    assert.equal(cliPayload.row.desired_state, SERVICE_INSTALL_DESIRED_STATE.ACTIVE);
    assert.equal(cliPayload.row.readiness_state, 'not_ready');
  });

  it('unavailable-and-failed-service-not-ready: pending, reconciling, failed, removed, and route-unavailable never report ready', async () => {
    const fx = await createProductionReadinessFixture();
    const installed = await fx.installService({
      idempotencyKey: 'q4-negative-states-1',
    });
    const installationId = installed.row.installation_id;

    // 1. pending
    await fx.catalogOwner.recordRolloutOutcome({
      installationId,
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
    });
    let inspected = await runInspect({
      createSqlClient: fx.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(inspected.row.rollout_state, SERVICE_INSTALL_ROLLOUT_STATE.PENDING);
    assert.equal(inspected.row.readiness_state, 'not_ready');

    // 2. reconciling (even when a Cell actual already exists!)
    const reqBinding = await fx.createRequestBinding({
      manifestDigest: installed.manifestDigest,
      packageId: installed.packageId,
    });
    const reqDef = await fx.publishBindingDefinition(reqBinding.bindingRow, {
      active: true,
    });
    fx.publishCellActual(reqDef.serviceId, {status: ReplicaStatus.ACTIVE});
    await fx.catalogOwner.recordRolloutOutcome({
      installationId,
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    });
    inspected = await runInspect({
      createSqlClient: fx.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(
      inspected.row.rollout_state,
      SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
    );
    assert.equal(inspected.row.readiness_state, 'not_ready');

    // 3. failed (with durable failure record, even with Cell actual present!)
    await fx.catalogOwner.recordFailure({
      failureCode: SERVICE_INSTALL_FAILURE_CODE.HEALTH_CHECK_FAILED,
      failureId: 'failure-health-1',
      failurePhase: SERVICE_INSTALL_FAILURE_PHASE.HEALTH,
      installationId,
      retryable: true,
    });
    inspected = await runInspect({
      createSqlClient: fx.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(inspected.row.rollout_state, SERVICE_INSTALL_ROLLOUT_STATE.FAILED);
    assert.equal(inspected.row.latest_failure_id, 'failure-health-1');
    assert.equal(inspected.row.readiness_state, 'not_ready');

    // 4. converged + route-unavailable cases on a fresh installation
    const fx2 = await createProductionReadinessFixture();
    const inst2 = await fx2.installService({
      idempotencyKey: 'q4-route-unavailable-1',
    });
    await fx2.convergeCatalogInstallation(inst2.row.installation_id);

    // 4a. converged with NO bindings -> not ready
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(
      inspected.row.rollout_state,
      SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
    );
    assert.equal(inspected.row.readiness_state, 'not_ready');

    // 4b. converged with binding, NO service_definitions -> not ready
    const req2 = await fx2.createRequestBinding({
      manifestDigest: inst2.manifestDigest,
      packageId: inst2.packageId,
    });
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(inspected.row.readiness_state, 'not_ready');

    // 4c. converged with INACTIVE service_definitions -> not ready
    await fx2.publishBindingDefinition(req2.bindingRow, {active: false});
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);

    // 4d. converged with ACTIVE service_definitions + NO services row -> not ready
    const activeDef2 = await fx2.publishBindingDefinition(req2.bindingRow, {
      active: true,
    });
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);

    // 4e. converged with ACTIVE service_definitions + non-ACTIVE Cell -> not ready
    fx2.publishCellActual(activeDef2.serviceId, {status: ReplicaStatus.CREATING});
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);

    // 4f. converged with ACTIVE request Cell + unready call binding -> not ready
    fx2.publishCellActual(activeDef2.serviceId, {status: ReplicaStatus.ACTIVE});
    const call2 = await fx2.createCallBinding({
      manifestDigest: inst2.manifestDigest,
      packageId: inst2.packageId,
    });
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);

    // 4g. BOTH request & call bindings have ACTIVE definitions + ACTIVE Cells -> READY!
    const activeCallDef2 = await fx2.publishBindingDefinition(call2.bindingRow, {
      active: true,
    });
    fx2.publishCellActual(activeCallDef2.serviceId, {status: ReplicaStatus.ACTIVE});
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, true);
    assert.equal(inspected.row.readiness_state, 'ready');
    assert.equal(inspected.row.desired_state, SERVICE_INSTALL_DESIRED_STATE.ACTIVE);
    assert.equal(
      inspected.row.rollout_state,
      SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
    );

    // 4h. Route drops out (Cell actual removed) -> IMMEDIATELY not ready!
    fx2.removeCellActual(activeDef2.serviceId);
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(inspected.row.readiness_state, 'not_ready');

    // 4i. Restore Cell, then UPGRADE to v2 -> v2 is NOT ready even though v1 Cells are active!
    fx2.publishCellActual(activeDef2.serviceId, {status: ReplicaStatus.ACTIVE});
    const v2 = await fx2.installService({
      command: 'UPGRADE SERVICE $1',
      idempotencyKey: 'q4-upgrade-v2',
      manifest: wasmManifest({digest: DIGEST_V2, version: '2.0.0'}),
    });
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(inspected.row.revision_id, v2.row.revision_id);
    assert.equal(inspected.row.version, '2.0.0');

    // 4j. REMOVE SERVICE -> desired_state removed -> not ready!
    await fx2.executeSql('REMOVE SERVICE $1', {
      idempotency_key: 'q4-remove-1',
      service_name: SERVICE_NAME,
    });
    inspected = await runInspect({
      createSqlClient: fx2.createSqlClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspected.ready, false);
    assert.equal(
      inspected.row.desired_state,
      SERVICE_INSTALL_DESIRED_STATE.REMOVED,
    );
  });

  it('unavailable-and-failed-service-not-ready: fails closed when runtime actuals cache is absent or row uses non-rollout active value', async () => {
    // Cache absent -> converged installation still fails closed (cannot verify Cell route)
    const fxNoCache = await createProductionReadinessFixture({
      includeCacheInOwners: false,
    });
    const inst = await fxNoCache.installService({
      idempotencyKey: 'q4-no-cache-1',
      manifest: ociManifest(),
    });
    await fxNoCache.convergeCatalogInstallation(inst.row.installation_id);
    const inspectedNoCache = await runInspect({
      createSqlClient: fxNoCache.createSqlClient,
      serviceName: 'oci-unsupported-svc',
    });
    assert.equal(inspectedNoCache.ready, false);
    assert.equal(inspectedNoCache.row.readiness_state, 'not_ready');

    // CLI consumer fails closed on non-canonical rollout_state: 'active' or desired_state: 'active' alone
    const bogusActiveClient = () => ({
      async execute() {
        return {
          rows: [{
            desired_state: 'active',
            installation_id: 'inst-bogus',
            latest_failure_id: null,
            operation_id: 'op-bogus',
            revision_id: 'rev-bogus',
            rollout_state: 'active',
            service_definition_id: 'def-bogus',
            service_name: SERVICE_NAME,
            version: '1.0.0',
          }],
        };
      },
    });
    const inspectedBogus = await runInspect({
      createSqlClient: bogusActiveClient,
      serviceName: SERVICE_NAME,
    });
    assert.equal(inspectedBogus.ready, false);
  });
});
