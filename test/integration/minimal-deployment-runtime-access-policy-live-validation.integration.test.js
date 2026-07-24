import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, it} from 'node:test';

import {ControlPlaneSetup} from
  '../../src/bootstrap/shared/control-plane-setup.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {CDC_OPERATION, RUNTIME_KIND, TABLES} from
  '../../src/constants/index.js';
import {
  bindDeploymentArtifact,
  canonicalJson,
  normalizeDeploymentBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {deriveTenantPackageId} from
  '../../src/control-plane/owners/service-install-catalog-contract.js';
import {
  buildRequestBindingServiceDefinition,
} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {CDCIntegrationService} from
  '../../src/cdc/cdc-integration-service.js';
import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from
  '../../src/runtime/pgwire-auth-handler.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';

const NODE_ID = 'runtime-access-live-node';
const TENANT_ID = 'tenant-a';
const PRINCIPAL = 'alice';
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const DATA_TABLE = 'table:global.orders';
const DATA_PARTITION_ID = 'orders-p1';
const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function artifactManifest() {
  return {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref:
        `registry.example.test/acme/runtime-access:1.0.0@${ARTIFACT_DIGEST}`,
      type: 'oci',
    },
    capabilities: [],
    exports: [{
      interface: 'request_v1',
      name: 'serve',
    }],
    name: 'runtime-access',
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: '1.0.0',
  };
}

function createCurrentBindingArtifact() {
  const manifest = artifactManifest();
  const manifestDigest = sha256(canonicalJson(manifest));
  const packageId = deriveTenantPackageId(manifest, TENANT_ID);
  const componentBytes = Buffer.from('component-fixture');
  const artifact = Object.freeze({
    artifactDigest: ARTIFACT_DIGEST,
    bytes: componentBytes,
    manifest,
    manifestDigest,
    packageId,
    payloadDigest: sha256(componentBytes),
  });
  const bindingInput = {
    schema_version: 2,
    name: 'orders-api',
    target: {
      package_id: packageId,
      manifest_digest: manifestDigest,
      export_name: 'serve',
    },
    source: {kind: 'request', method: 'POST', path: '/orders'},
    budgets: {
      cpu_time_ms: 100,
      wall_time_ms: 1000,
      memory_bytes: 1048576,
      input_bytes: 4096,
      output_bytes: 4096,
      context_bytes: 8192,
    },
  };
  const normalized = normalizeDeploymentBinding(bindingInput);
  bindDeploymentArtifact(normalized, artifact);
  return {
    artifact,
    bindingInput,
  };
}

function parseColumnAssignments(fragment) {
  return fragment.split(',').map((part) =>
    part.trim().split(/\s*=\s*\?/u)[0]);
}

function createCdcBackedStore(systemTableCache) {
  const tables = new Map();
  const cacheApplies = [];

  function table(tableName) {
    if (!tables.has(tableName)) tables.set(tableName, new Map());
    return tables.get(tableName);
  }

  function scheduleCacheUpsert(tableName, row) {
    const pending = new Promise((resolve) => {
      setImmediate(() => {
        systemTableCache.applySystemTableChange(
          tableName,
          CDC_OPERATION.UPSERT,
          row,
        );
        resolve();
      });
    });
    cacheApplies.push(pending);
  }

  async function execute(sql, params) {
    const insert = /^INSERT(?: OR REPLACE)? INTO ([a-z_]+) \(([^)]+)\) VALUES \(([^)]+)\)$/iu
      .exec(sql);
    if (insert) {
      const [, tableName, columns] = insert;
      const row = Object.fromEntries(
        columns.split(',').map((column, index) =>
          [column.trim(), params[index]]),
      );
      const primaryKey = getSystemCachePrimaryKeyField(tableName);
      table(tableName).set(row[primaryKey], {...row});
      scheduleCacheUpsert(tableName, row);
      return {affectedRows: 1, rows: [], success: true};
    }

    const update = /^UPDATE ([a-z_]+) SET (.+) WHERE (.+)$/iu.exec(sql);
    if (update) {
      const [, tableName, setFragment, whereFragment] = update;
      const setColumns = parseColumnAssignments(setFragment);
      const whereColumns = parseColumnAssignments(whereFragment);
      const setValues = params.slice(0, setColumns.length);
      const whereValues = params.slice(setColumns.length);
      let affectedRows = 0;
      for (const [key, current] of table(tableName)) {
        if (!whereColumns.every((column, index) =>
          current[column] === whereValues[index])) {
          continue;
        }
        const row = {
          ...current,
          ...Object.fromEntries(setColumns.map((column, index) =>
            [column, setValues[index]])),
        };
        table(tableName).set(key, row);
        scheduleCacheUpsert(tableName, row);
        affectedRows += 1;
      }
      return {affectedRows, rows: [], success: true};
    }

    throw new Error(`unsupported fixture SQL: ${sql}`);
  }

  return {
    execute,
    async read(tableName, sql, params = []) {
      const rows = [...table(tableName).values()];
      const field = / WHERE ([a-z_]+) = \?$/u.exec(sql)?.[1];
      const selected = field ?
        rows.filter((row) => row[field] === params[0]) :
        rows;
      return {
        rowCount: selected.length,
        rows: selected.map((row) => ({...row})),
        success: true,
      };
    },
    get(tableName, key) {
      return table(tableName).get(key) || null;
    },
    rows(tableName) {
      return [...table(tableName).values()].map((row) => ({...row}));
    },
    async settle() {
      await Promise.all(cacheApplies);
    },
  };
}

function createAuthenticatedAdapter(engine) {
  const authHandler = new PgWireAuthHandler({
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    authenticator: async () => ({
      authenticated: true,
      roles: ['service-operator'],
    }),
    policy: {
      allowedActions: new Set([
        PGWIRE_AUTH_ACTION.ACCESS_CONFIGURE,
        PGWIRE_AUTH_ACTION.BINDING_CREATE,
        PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
      ]),
    },
    logger: silentLogger,
  });
  return new PostgresWireAdapter({
    authHandler,
    logger: silentLogger,
    sqlCore: engine,
  });
}

class TableQueryingComponentRuntime {
  constructor() {
    this.running = new Set();
    this.invocations = 0;
    this.executeTableQuery = null;
  }

  setTableQueryExecutor(executeTableQuery) {
    this.executeTableQuery = executeTableQuery;
  }

  async start(cell) {
    this.running.add(cell.serviceId);
  }

  async health(serviceId) {
    return this.running.has(serviceId);
  }

  async invoke(
    _serviceId,
    _args,
    _readContexts,
    _writeEffects,
    _cancel,
  ) {
    const result = await this.executeTableQuery();
    if (result?.success !== true) {
      throw new Error(
        `Component table query denied: ${result?.reasonCode || 'unknown'}`,
      );
    }
    this.invocations += 1;
    return {processed: true, rows: result.rows};
  }

  async stop(serviceId) {
    this.running.delete(serviceId);
  }
}

function stopControlPlane(setup) {
  setup?.membershipPublicationService?.stopOwnerMembershipDriver?.();
  setup?.leaseService?.stop?.();
  setup?.heartbeatService?.stop?.();
  setup?.endpointService?.stop?.();
  setup?.dispatchService?.stop?.();
}

describe('minimal deployment runtime access production path', () => {
  it('observes exact grant and revocation through one setup-created owner path',
    async (testContext) => {
      const systemTableCache = new SystemTableCache();
      const messageRouter = {
        deliver: async () => ({success: true}),
        register() {},
        send: async () => ({success: true}),
      };
      const engine = new SQLQueryEngine({
        autoStartDistributedTransactionRecovery: false,
        messageRouter,
        nodeId: NODE_ID,
        systemCache: systemTableCache,
      });
      const cdcIntegrationService = new CDCIntegrationService({
        cacheMutationTarget: systemTableCache,
        messageRouter,
        nodeId: NODE_ID,
        sqlQueryEngine: engine,
        systemTableCache,
      });
      engine.setCDCIntegrationService(cdcIntegrationService);
      const durableStore = createCdcBackedStore(systemTableCache);
      cdcIntegrationService.executeSQL = durableStore.execute;
      cdcIntegrationService.executeAuthoritativeSystemTableRead =
        durableStore.read;
      const visibilityChecks = [];
      const waitForCacheUpdate =
        cdcIntegrationService.waitForCacheUpdate
          .bind(cdcIntegrationService);
      cdcIntegrationService.waitForCacheUpdate =
        (tableName, key, expectPresent, options) => {
          visibilityChecks.push({key, options, tableName});
          return waitForCacheUpdate(
            tableName,
            key,
            expectPresent,
            options,
          );
        };

      const setup = await ControlPlaneSetup.create({
        cdcIntegrationService,
        messageRouter,
        nodeAddress: '127.0.0.1:7410',
        nodeId: NODE_ID,
        systemTableCache,
        tablePolicyService: {
          getPolicy: () => null,
          initialize() {},
        },
      });
      testContext.after(async () => {
        stopControlPlane(setup);
        cdcIntegrationService.markShuttingDown();
        await durableStore.settle();
        await engine.shutdown();
      });

      const {artifact, bindingInput} = createCurrentBindingArtifact();
      assert.equal(artifact.manifest.schema_version, 3);
      const recordedArtifact =
        await setup.systemMetadataOwners.serviceInstallCatalogOwner
          .recordPackage({
            manifest: artifact.manifest,
            packageId: artifact.packageId,
            resolvedArtifact: {
              artifact: {
                digest: artifact.artifactDigest,
                payloadMediaType: artifact.manifest.artifact.media_type,
                signature: {
                  keyId: 'fixture-key',
                  status: 'verified',
                },
              },
              status: 'resolved',
            },
          });
      assert.equal(recordedArtifact.manifestDigest, artifact.manifestDigest);

      const adapter = createAuthenticatedAdapter(engine);
      await adapter.authenticate('runtime-access-session', {
        password: 'fixture-password',
        tenantId: TENANT_ID,
        user: PRINCIPAL,
      });
      const createdBinding = await adapter.execute(
        'runtime-access-session',
        'CREATE BINDING $1',
        [JSON.stringify(bindingInput)],
      );
      assert.equal(
        createdBinding.success,
        true,
        JSON.stringify(createdBinding),
      );
      const [bindingRow] = durableStore.rows(TABLES.SERVICE_BINDINGS);
      assert.equal(
        JSON.parse(bindingRow.normalized_binding).schema_version,
        2,
      );
      const definition =
        buildRequestBindingServiceDefinition(bindingRow, artifact);
      const grant = await adapter.execute(
        'runtime-access-session',
        'CONFIGURE SERVICE ACCESS $1',
        [JSON.stringify({
          binding_name: 'orders-api',
          schema_version: 1,
          tables: [{
            operations: ['read'],
            slot: 0,
            table: DATA_TABLE,
          }],
        })],
      );
      assert.equal(grant.success, true, JSON.stringify(grant));
      const serviceId = grant.rows[0].service_id;
      assert.strictEqual(
        engine.runtimeAccessPolicyOwner,
        setup.systemMetadataOwners.runtimeAccessPolicyOwner,
      );

      engine.getTableInfo = () => ({
        table_id: 'orders',
        table_name: 'orders',
      });
      engine.getTablePartitions = () => [{
        partition_id: DATA_PARTITION_ID,
        status: 'active',
        table_name: 'orders',
      }];
      engine.queryExecutor = {
        async executeSelect() {
          return {
            partitions: [DATA_PARTITION_ID],
            rows: [{
              key: 'order-7',
              value: 'ready',
            }],
            success: true,
          };
        },
        markShuttingDown() {},
      };

      const componentRuntime = new TableQueryingComponentRuntime();
      const driver = new WasmComponentDriver({
        artifactLoader: async () => artifact,
        componentRuntime,
      });
      const registry = new RuntimeDriverRegistry();
      registry.register(driver);
      registry.freeze();
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      engine.setServiceRuntimeLifecycle(lifecycle);
      const replicaContext = {definition, nodeId: NODE_ID};
      componentRuntime.setTableQueryExecutor(() =>
        replicaContext.queryExecutor('SELECT * FROM orders', []));
      await lifecycle.prepare(definition, {});
      await lifecycle.start(replicaContext);

      const firstInvocation = await lifecycle.invoke(
        replicaContext,
        {args: [{order_id: 7}]},
      );
      assert.equal(firstInvocation.processed, true);
      assert.equal(componentRuntime.invocations, 1);
      const configKey =
        setup.systemMetadataOwners.runtimeAccessPolicyOwner
          .configKey(serviceId);
      const configBeforeAffinity =
        durableStore.get(TABLES.CONFIG, configKey).config_value;
      const published =
        await engine.servicePartitionAccessPublisher.publishOnce();
      assert.deepEqual(published, {failed: 0, published: 1});
      assert.equal(
        durableStore.rows(TABLES.SERVICE_PARTITION_ACCESS).length,
        1,
      );
      assert.equal(
        durableStore.get(TABLES.CONFIG, configKey).config_value,
        configBeforeAffinity,
      );

      const revoke = await adapter.execute(
        'runtime-access-session',
        'CONFIGURE SERVICE ACCESS $1',
        [JSON.stringify({
          binding_name: 'orders-api',
          schema_version: 1,
          tables: [],
        })],
      );
      assert.equal(revoke.success, true, JSON.stringify(revoke));
      const policyAfterRevoke =
        await engine.runtimeAccessPolicyOwner.getRuntimePolicy(serviceId);
      assert.deepEqual(policyAfterRevoke.policy.tables, []);
      const configVisibilityChecks = visibilityChecks.filter(
        (entry) => entry.tableName === TABLES.CONFIG,
      );
      assert.equal(configVisibilityChecks.length, 2);
      assert.equal(
        configVisibilityChecks[1].options.expectedFields.config_value,
        durableStore.get(TABLES.CONFIG, configKey).config_value,
      );
      assert.notEqual(
        durableStore.get(TABLES.CONFIG, configKey).config_value,
        configBeforeAffinity,
      );

      const deniedSql = await replicaContext.queryExecutor(
        'SELECT * FROM orders',
        [],
      );
      assert.equal(deniedSql.success, false);
      assert.equal(deniedSql.reasonCode, 'access_not_granted');
      await assert.rejects(
        () => lifecycle.invoke(
          replicaContext,
          {args: [{order_id: 8}]},
        ),
        /Component table query denied: access_not_granted/u,
      );
      assert.equal(componentRuntime.invocations, 1);
    });
});
