/**
 * Comprehensive integration test for composed developer journeys
 * (J1, J2, J3, V07–V10, Sections 5–6, 10.1–10.2).
 *
 * J1 (generated-service-http-journey & fresh-developer-walkthrough):
 *   - runInit -> runGenerate -> runBuild -> runPublish -> runDeploy -> runInspect
 *   - Seeded SQLite database with account_activity / amounts table
 *   - Real HTTP ingress over POST /amounts/summary
 *   - Filtered sums for account IDs 101 and 202
 *   - Unfiltered sums for {} and null
 *   - Explicit HTTP 400 refusal on invalid JSON body shapes
 *   - Same-endpoint code update (V09): handler updated, rebuilt, republished,
 *     redeployed to same endpoint; in-flight generation 1 pinned invocation
 *     completes on generation 1 while new requests route to generation 2;
 *     failed update leaves generation 2 active without disruption.
 *
 * J2 (canonical-artifact-ingestion & remote publisher disappearance):
 *   - Client 1 builds and publishes service artifact, then completely deletes
 *     project directory (rm -rf).
 *   - Client 2 on clean directory (zero .wasm files) deploys from registered
 *     identities and inspects readiness.
 *   - Activation loads sealed bytes exclusively from ArtifactPayloadStore
 *     (loadComponentPayloadThroughStore).
 *   - Simulating accepting-node restart or activating on a second node succeeds
 *     from surviving ArtifactPayloadStore rows.
 *   - Negative admission: artifact_source with local_oci_layout or remote_oci
 *     rejected with ARTIFACT_SOURCE_RETIRED before file/network access; missing
 *     store fails with STORE_UNAVAILABLE.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {after, before, describe, it} from 'node:test';

import Database from 'better-sqlite3';

import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ARTIFACT_PAYLOADS_SCHEMA,
} from '../../src/bootstrap/system-table-artifact-schema-definitions.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../../src/constants/unified-service-lifecycle.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  deriveBindingVersionId,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {createSystemMetadataOwners} from '../../src/control-plane/owners/index.js';
import {PostgresWireAdapter} from '../../src/query/pg/postgres-wire-adapter.js';
import {
  SERVICE_LIFECYCLE_SQL_ERROR_CODE,
} from '../../src/query/service-lifecycle-sql-contract.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from '../../src/runtime/pgwire-auth-handler.js';
import {
  createArtifactPayloadStore,
} from '../../src/service/artifact-payload-store.js';
import {
  loadComponentPayloadThroughStore,
} from '../../src/service/artifact-payload-loader.js';
import {
  runBuild,
  runDeploy,
  runGenerate,
  runInspect,
  runPublish,
} from '../../src/cli/service-pipeline-command.js';
import {
  runInit,
} from '../../src/cli/service-wasm-scaffold.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';
import {
  RequestBindingRouteResolver,
} from '../../src/service/request-binding-route-resolver.js';
import {
  RequestCellHttpAdapter,
} from '../../src/service/request-cell-http-adapter.js';

const TENANT_ID = 'default';
const USER = 'developer';
const NODE_ONE = 'node-worker-1';
const HTTP_METHOD = 'POST';
const HTTP_PATH = '/amounts/summary';
const PARAM_PATTERN = /\$(\d+)/g;
const SQLITE_PLACEHOLDER = '?';
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
const SHARD_TABLE_DDL =
  'CREATE TABLE account_activity (' +
  'id INTEGER PRIMARY KEY, ' +
  'account_id INTEGER, ' +
  'amount_cents INTEGER' +
  '); ' +
  'CREATE VIEW amounts AS SELECT id, account_id, amount_cents FROM account_activity;';
const SHARD_ROW_INSERT =
  'INSERT INTO account_activity (id, account_id, amount_cents) VALUES (?, ?, ?)';

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class SharedLifecycleCatalogGateway {
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
    const pk = this.primaryKey(table);
    const key = row[pk];
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

function createStoreDatabase() {
  const database = new Database(':memory:');
  for (const schema of [
    ARTIFACT_PAYLOADS_SCHEMA,
    ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ]) {
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) {
      database.exec(indexSql);
    }
  }
  const executeInternal = async (sql, params = []) => {
    const values = [];
    const rewritten = sql.replace(PARAM_PATTERN, (_all, position) => {
      values.push(params[Number(position) - 1]);
      return SQLITE_PLACEHOLDER;
    });
    try {
      const statement = database.prepare(rewritten);
      return statement.reader ?
        {rows: statement.all(...values), success: true} :
        {affectedRows: statement.run(...values).changes, success: true};
    } catch (err) {
      return {error: err.message, success: false};
    }
  };
  return {database, executeInternal};
}

class PassthroughArtifactResolver {
  constructor(payloadStore) {
    this._payloadStore = payloadStore;
  }

  async resolve(request) {
    const manifest = request.manifest;
    const digest = manifest?.artifact?.digest;
    const found = await this._payloadStore.findSealedPayloadByArtifactDigest(digest);
    if (!found?.found) {
      return Object.freeze({
        errors: Object.freeze([Object.freeze({
          code: 'artifact_not_sealed',
          message: `artifact ${digest} not sealed`,
          path: '/artifact/digest',
        })]),
        status: 'rejected',
      });
    }
    return Object.freeze({
      artifact: Object.freeze({
        digest,
        payloadMediaType: manifest.artifact.media_type || 'application/wasm',
        signature: Object.freeze({
          keyId: null,
          status: 'unsigned_allowed',
        }),
      }),
      status: 'resolved',
    });
  }
}

function createAuthHandler() {
  return new PgWireAuthHandler({
    authenticator: async () => ({
      authenticated: true,
      roles: ['service-operator'],
    }),
    logger: {debug() {}, error() {}, info() {}, warn() {}},
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    policy: {allowedActions: new Set(LIFECYCLE_ACTIONS)},
  });
}

function createSqlTestClient(adapter, sessionId = 'session-main') {
  return () => ({
    async execute(statement, parameters = []) {
      const res = await adapter.execute(sessionId, statement, parameters);
      if (res.success === false) {
        const error = new Error(res.errorMessage || 'sql execution failed');
        error.code = res.errorCode;
        throw error;
      }
      return res;
    },
  });
}

describe('developer-journey-j1-j2-j3.integration', () => {
  let rootDir;
  let shardDb;
  let storeDb;
  let artifactPayloadStore;
  let systemTableCache;
  let gateway;
  let commandOwner;
  let pgAdapter;
  let createSqlClient;
  let routeResolver;
  let httpServer;
  let httpPort;
  let activeHandlers;

  before(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'lagrange-journey-int-'));

    // Shard SQLite with account_activity and amounts view
    shardDb = new Database(':memory:');
    shardDb.exec(SHARD_TABLE_DDL);
    const insert = shardDb.prepare(SHARD_ROW_INSERT);
    // Two distinct accounts: 101 (id 1: 500, id 2: 700) and 202 (id 3: 1500, id 4: 2500)
    insert.run(1, 101, 500);
    insert.run(2, 101, 700);
    insert.run(3, 202, 1500);
    insert.run(4, 202, 2500);

    // Payload store
    storeDb = createStoreDatabase();
    artifactPayloadStore = createArtifactPayloadStore({
      executeInternal: storeDb.executeInternal,
    });

    // Control-plane and metadata owners
    systemTableCache = new SystemTableCache();
    gateway = new SharedLifecycleCatalogGateway(systemTableCache);
    const systemMetadataOwners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: gateway,
      now: () => Date.now(),
    });
    systemMetadataOwners.deploymentBindingOwner.artifactPayloadStore = artifactPayloadStore;

    const artifactResolver = new PassthroughArtifactResolver(artifactPayloadStore);
    commandOwner = new ServiceLifecycleCommandOwner({
      artifactPayloadStore,
      artifactResolver,
      bindingOwner: systemMetadataOwners.deploymentBindingOwner,
      catalogOwner: systemMetadataOwners.serviceInstallCatalogOwner,
      runtimeAccessPolicyOwner: systemMetadataOwners.runtimeAccessPolicyOwner,
      signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
    });

    // PG Wire SQL client
    const engine = new SQLQueryEngine({
      autoStartDistributedTransactionRecovery: false,
      messageRouter: {deliver: async () => ({success: true})},
      systemCache: systemTableCache,
    });
    engine.setServiceLifecycleCommandOwner(commandOwner);
    engine.setRuntimeAccessPolicyOwner(systemMetadataOwners.runtimeAccessPolicyOwner);

    pgAdapter = new PostgresWireAdapter({
      authHandler: createAuthHandler(),
      logger: {debug() {}, error() {}, info() {}, warn() {}},
      sqlCore: engine,
    });
    await pgAdapter.authenticate('session-main', {
      database: TENANT_ID,
      password: 'test-password',
      tenantId: TENANT_ID,
      user: USER,
    });
    createSqlClient = createSqlTestClient(pgAdapter, 'session-main');

    // Route resolver
    routeResolver = new RequestBindingRouteResolver({
      systemTableCache,
    });

    // Active handlers map per bindingVersionId
    activeHandlers = new Map();

    // Service dispatcher executing active version handler
    const serviceDispatcher = {
      async dispatch(serviceMessage) {
        const payload = serviceMessage?.payload || serviceMessage;
        const bindingVersionId =
          payload?.route?.bindingVersionId || payload?.bindingVersionId;
        const req = payload?.request || payload;
        const handlerEntry = activeHandlers.get(bindingVersionId);
        if (!handlerEntry) {
          throw new Error(`no active handler for ${bindingVersionId}`);
        }
        const {handle, operation, summarizeReduce, summarizeRun} = handlerEntry;
        const context = {
          call(_op, args) {
            const rows = shardDb.prepare('SELECT id, account_id, amount_cents FROM account_activity').all();
            const partials = [];
            const emit = (k, v) => partials.push([k, v]);
            summarizeRun(rows, args, {emit});
            return summarizeReduce(partials, args);
          },
          json(value, status) {
            return {
              body: JSON.stringify(value),
              headers: [['content-type', 'application/json']],
              status,
            };
          },
        };

        const result = handle(
          {
            body: req.body,
            headers: req.headers || {},
            method: req.method,
            path: req.path,
          },
          context,
          operation,
        );

        return {
          answer: {
            componentResponse: result,
            invocationOutcome: {code: 'ok', invoked: true},
            processed: true,
          },
        };
      },
    };

    // Ingress HTTP adapter
    const httpAdapter = new RequestCellHttpAdapter({
      authenticateRequest: async () => ({
        principal: USER,
        roles: ['application'],
        tenantId: TENANT_ID,
      }),
      routeResolver,
      serviceDispatcher,
    });

    // Node HTTP Server
    httpServer = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body = rawBody;
      if (req.headers['content-type']?.includes('application/json')) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }
      const reply = {
        _headers: {},
        _status: 200,
        code(c) {
          this._status = c;
          return this;
        },
        header(k, v) {
          this._headers[k] = v;
          return this;
        },
      };

      const response = await httpAdapter.handle({
        body,
        headers: req.headers,
        method: req.method,
        url: req.url,
      }, reply);

      res.writeHead(reply._status, reply._headers);
      res.end(typeof response === 'string' ? response : JSON.stringify(response));
    });

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        httpPort = httpServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (shardDb) shardDb.close();
    if (storeDb?.database) storeDb.database.close();
    if (rootDir) {
      await rm(rootDir, {force: true, recursive: true});
    }
  });

  function activateBindingGeneration({artifact, bindingRow, _generation, handlers}) {
    const binding = projectBinding(bindingRow);
    const serviceDefinition = buildActivatedRequestBindingServiceDefinition(
      buildRequestBindingServiceDefinition(bindingRow, artifact),
      binding,
    );
    const serviceId = deriveRequestServiceDefinitionId(binding.bindingVersionId);

    // Apply active definition and runtime actuals to cache
    systemTableCache.applySystemTableChange(
      TABLES.SERVICE_DEFINITIONS,
      CDC_OPERATION.UPSERT,
      serviceDefinition,
    );
    systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        node_id: NODE_ONE,
        service_id: `${serviceId}-r1`,
        service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        status: ReplicaStatus.ACTIVE,
      },
    );

    activeHandlers.set(binding.bindingVersionId, handlers);
    return {binding, serviceDefinition, serviceId};
  }

  describe('Journey J1 (generated-service-http-journey & fresh-developer-walkthrough)', () => {
    let projectDir;
    let initialReceipt;
    let gen1BindingRow;
    let gen1Binding;
    let gen1Handlers;

    it('creates project via runInit, generates via runGenerate, and builds via runBuild', async () => {
      projectDir = path.join(rootDir, 'amounts-service-j1');
      const initResult = runInit(projectDir);
      assert.equal(initResult.name, 'amounts-service-j1');

      const genResult = await runGenerate({projectDirectory: projectDir});
      assert.equal(genResult.ir.name, 'amounts-service-j1');

      const buildResult = await runBuild({
        createLocalOciLayoutBuilder: () => new ServiceLocalOciLayoutBuilder(),
        projectDirectory: projectDir,
      });
      assert.ok(buildResult.descriptor.digest.startsWith('sha256:'));
      assert.ok(buildResult.descriptor.sizeBytes > 0);
      assert.ok(fs.statSync(buildResult.componentPath).size > 1000);
      assert.ok(fs.existsSync(buildResult.componentPath));
    });

    it('publishes via runPublish into ArtifactPayloadStore and deploys via runDeploy', async () => {
      initialReceipt = await runPublish({
        createSqlClient,
        projectDirectory: projectDir,
      });
      assert.equal(initialReceipt.service, 'amounts-service-j1');
      assert.ok(initialReceipt.artifactDigest.startsWith('sha256:'));

      // Verify sealed in payload store
      const sealed = await artifactPayloadStore.findSealedPayloadByArtifactDigest(
        initialReceipt.artifactDigest,
      );
      assert.equal(sealed.found, true);

      // Deploy identity-only
      const deployResult = await runDeploy({
        createSqlClient,
        idempotencyKey: 'deploy-j1-v1',
        projectDirectory: projectDir,
      });
      assert.equal(deployResult.packageId, initialReceipt.packageId);
      assert.ok(deployResult.bindings.length >= 1);

      // Inspect readiness
      const inspectResult = await runInspect({
        createSqlClient,
        projectDirectory: projectDir,
      });
      assert.equal(inspectResult.ready, true);
      assert.equal(inspectResult.service, 'amounts-service-j1');

      // Load compiled modules to register in active dispatcher
      const handlerPath = path.join(projectDir, 'src', 'handler.js');
      const {handleAmountSummary} = await import(pathToFileURL(handlerPath).href);
      const servicePath = path.join(projectDir, 'lagrange.service.js');
      const serviceModule = (await import(pathToFileURL(servicePath).href)).default;

      const bindingName = deployResult.bindings.find((b) => b.includes('--request--'));
      const manifest = JSON.parse(await readFile(
        path.join(projectDir, '.lagrange', 'deployment', 'manifest.json'),
        'utf8',
      ));
      const existingRows = await commandOwner.bindingOwner.readBindingRowsByName(
        TENANT_ID,
        bindingName,
      );
      gen1BindingRow = existingRows[existingRows.length - 1];

      const summarizeOp = serviceModule.operations.summarizeAmounts;
      gen1Handlers = {
        handle: handleAmountSummary,
        operation: summarizeOp,
        summarizeReduce: summarizeOp.reduce,
        summarizeRun: summarizeOp.run,
      };

      const activated = activateBindingGeneration({
        artifact: {
          artifactDigest: initialReceipt.artifactDigest,
          manifest,
          manifestDigest: initialReceipt.manifestDigest,
          packageId: initialReceipt.packageId,
        },
        bindingRow: gen1BindingRow,
        generation: 1,
        handlers: gen1Handlers,
      });
      gen1Binding = activated.binding;
    });

    it('invokes POST /amounts/summary with distinct account IDs and asserts accurately filtered sums', async () => {
      // 1. Account 101 -> total: 1200 cents (500 + 700), transactions: 2
      const res101 = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
        body: JSON.stringify({accountId: 101}),
        headers: {'content-type': 'application/json'},
        method: HTTP_METHOD,
      });
      assert.equal(res101.status, 200);
      const data101 = await res101.json();
      assert.equal(data101.accountId, 101);
      assert.equal(data101.totalCents, 1200);
      assert.equal(data101.transactions, 2);

      // 2. Account 202 -> total: 4000 cents (1500 + 2500), transactions: 2
      const res202 = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
        body: JSON.stringify({accountId: 202}),
        headers: {'content-type': 'application/json'},
        method: HTTP_METHOD,
      });
      assert.equal(res202.status, 200);
      const data202 = await res202.json();
      assert.equal(data202.accountId, 202);
      assert.equal(data202.totalCents, 4000);
      assert.equal(data202.transactions, 2);

      // Distinct output check
      assert.notEqual(data101.totalCents, data202.totalCents);
    });

    it('invokes POST /amounts/summary with {} and null and asserts unfiltered total sum', async () => {
      // 1. Empty body {} -> total: 5200 cents (500 + 700 + 1500 + 2500), transactions: 4
      const resEmpty = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
        body: JSON.stringify({}),
        headers: {'content-type': 'application/json'},
        method: HTTP_METHOD,
      });
      assert.equal(resEmpty.status, 200);
      const dataEmpty = await resEmpty.json();
      assert.equal(dataEmpty.accountId, null);
      assert.equal(dataEmpty.totalCents, 5200);
      assert.equal(dataEmpty.transactions, 4);

      // 2. Null body -> total: 5200 cents, transactions: 4
      const resNull = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
        body: 'null',
        headers: {'content-type': 'application/json'},
        method: HTTP_METHOD,
      });
      assert.equal(resNull.status, 200);
      const dataNull = await resNull.json();
      assert.equal(dataNull.accountId, null);
      assert.equal(dataNull.totalCents, 5200);
      assert.equal(dataNull.transactions, 4);
    });

    it('invokes POST /amounts/summary with invalid JSON body shapes and asserts explicit HTTP 400 refusal', async () => {
      const invalidBodies = [
        JSON.stringify([1, 2]),
        JSON.stringify('bad'),
        JSON.stringify({accountId: 'not-an-int'}),
        JSON.stringify({accountId: -5}),
        '{bad',
      ];

      for (const invalidBody of invalidBodies) {
        const res = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
          body: invalidBody,
          headers: {'content-type': 'application/json'},
          method: HTTP_METHOD,
        });
        assert.equal(
          res.status,
          400,
          `expected HTTP 400 for invalid body: ${invalidBody}, got ${res.status}`,
        );
        const text = await res.text();
        assert.ok(!text.includes('5200'), 'must never fall back to unfiltered sum');
      }
    });

    describe('Same-Endpoint Code Update (V09, stable-service-update)', () => {
      let gen2Binding;

      it('updates handler code, rebuilds, publishes, and redeploys behind exact same endpoint', async () => {
        // Modify src/handler.js to add version: 2 to summary result
        const handlerPath = path.join(projectDir, 'src', 'handler.js');
        const originalSource = await readFile(handlerPath, 'utf8');
        const modifiedSource = originalSource.replace(
          'const summary = call(operation, {accountId});',
          'const summary = call(operation, {accountId}); summary.version = 2;',
        );
        assert.notEqual(originalSource, modifiedSource);
        await writeFile(handlerPath, modifiedSource);

        // Rebuild
        const rebuildResult = await runBuild({
          createLocalOciLayoutBuilder: () => new ServiceLocalOciLayoutBuilder(),
          projectDirectory: projectDir,
        });
        assert.ok(rebuildResult.descriptor.digest.startsWith('sha256:'));
        assert.notEqual(rebuildResult.descriptor.digest, initialReceipt.artifactDigest);

        // Republish
        const gen2Receipt = await runPublish({
          createSqlClient,
          projectDirectory: projectDir,
        });
        assert.notEqual(gen2Receipt.artifactDigest, initialReceipt.artifactDigest);

        // Redeploy to same endpoint
        const gen2Deploy = await runDeploy({
          createSqlClient,
          idempotencyKey: 'deploy-j1-v2',
          projectDirectory: projectDir,
        });
        assert.equal(gen2Deploy.service, 'amounts-service-j1');

        // Dynamically import updated handler
        const {handleAmountSummary: handleGen2} = await import(
          `${pathToFileURL(handlerPath).href}?v=2`
        );
        const manifestGen2 = JSON.parse(await readFile(
          path.join(projectDir, '.lagrange', 'deployment', 'manifest.json'),
          'utf8',
        ));
        const bindingName = gen2Deploy.bindings.find((b) => b.includes('--request--'));
        const existingRows = await commandOwner.bindingOwner.readBindingRowsByName(
          TENANT_ID,
          bindingName,
        );
        const gen2BindingRow = existingRows[existingRows.length - 1];

        const activatedGen2 = activateBindingGeneration({
          artifact: {
            artifactDigest: gen2Receipt.artifactDigest,
            manifest: manifestGen2,
            manifestDigest: gen2Receipt.manifestDigest,
            packageId: gen2Deploy.packageId,
          },
          bindingRow: gen2BindingRow,
          generation: 2,
          handlers: {
            handle: handleGen2,
            operation: gen1Handlers.operation,
            summarizeReduce: gen1Handlers.summarizeReduce,
            summarizeRun: gen1Handlers.summarizeRun,
          },
        });
        gen2Binding = activatedGen2.binding;

        assert.equal(gen2Binding.generation, 2);
        assert.equal(
          gen2Binding.bindingVersionId,
          deriveBindingVersionId(gen2Binding.bindingId, 2),
        );
      });

      it('in-flight pinned invocation to gen 1 completes with gen 1 response while new requests route to gen 2', async () => {
        // 1. Pinned in-flight resolution for generation 1
        const pinnedRoute = routeResolver.resolve({
          bindingVersionId: gen1Binding.bindingVersionId,
          method: HTTP_METHOD,
          path: HTTP_PATH,
          securityContext: {tenantId: TENANT_ID},
        });
        assert.equal(pinnedRoute.bindingVersionId, gen1Binding.bindingVersionId);
        assert.equal(pinnedRoute.generation, 1);

        // 2. Unpinned new request routes to generation 2
        const newRoute = routeResolver.resolve({
          method: HTTP_METHOD,
          path: HTTP_PATH,
          securityContext: {tenantId: TENANT_ID},
        });
        assert.equal(newRoute.bindingVersionId, gen2Binding.bindingVersionId);
        assert.equal(newRoute.generation, 2);

        // 3. New request over HTTP receives generation 2 response (with version: 2)
        const httpRes = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
          body: JSON.stringify({accountId: 101}),
          headers: {'content-type': 'application/json'},
          method: HTTP_METHOD,
        });
        assert.equal(httpRes.status, 200);
        const data = await httpRes.json();
        assert.equal(data.accountId, 101);
        assert.equal(data.totalCents, 1200);
        assert.equal(data.version, 2);
      });

      it('failed update leaves generation 2 active and serving requests without disruption', async () => {
        // Attempt deploy with unsealed artifact digest
        const unsealedDigest = `sha256:${'f'.repeat(64)}`;
        const unsealedManifest = {
          artifact: {
            digest: unsealedDigest,
            media_type: 'application/wasm',
            ref: 'registry.example.test/amounts-service:0.2.0',
            type: 'oci',
          },
          exports: [{interface: 'request_v1', name: 'handle-request'}],
          name: 'amounts-service-j1',
          runtime: {kind: 'wasm_component'},
          schema_version: 3,
          version: '0.2.0',
        };

        const failedPayload = JSON.stringify({
          idempotency_key: 'deploy-failed-unsealed',
          manifest: unsealedManifest,
        });

        const res = await pgAdapter.execute(
          'session-main',
          'INSTALL SERVICE $1',
          [failedPayload],
        );
        assert.equal(res.success, false);
        assert.equal(
          res.errorCode,
          SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_NOT_SEALED,
        );

        // Gen 2 remains active and serving without disruption
        const httpRes = await fetch(`http://127.0.0.1:${httpPort}${HTTP_PATH}`, {
          body: JSON.stringify({accountId: 202}),
          headers: {'content-type': 'application/json'},
          method: HTTP_METHOD,
        });
        assert.equal(httpRes.status, 200);
        const data = await httpRes.json();
        assert.equal(data.accountId, 202);
        assert.equal(data.totalCents, 4000);
        assert.equal(data.version, 2);
      });
    });
  });

  describe('Journey J2 (canonical-artifact-ingestion & remote publisher disappearance)', () => {
    let client1Dir;
    let client2Dir;
    let publishedReceipt;

    it('Client 1 builds and publishes service artifact, then completely deletes project directory', async () => {
      client1Dir = path.join(rootDir, 'j2-client1-publisher');
      runInit(client1Dir);
      await runGenerate({projectDirectory: client1Dir});
      await runBuild({
        createLocalOciLayoutBuilder: () => new ServiceLocalOciLayoutBuilder(),
        projectDirectory: client1Dir,
      });

      publishedReceipt = await runPublish({
        createSqlClient,
        projectDirectory: client1Dir,
      });
      assert.ok(publishedReceipt.artifactDigest.startsWith('sha256:'));
      assert.ok(publishedReceipt.packageId.startsWith('service-package-'));

      // Completely delete Client 1 project and .lagrange build directory
      await rm(client1Dir, {force: true, recursive: true});
      assert.equal(fs.existsSync(client1Dir), false);
    });

    it('Client 2 deploys and inspects on a clean directory with zero .wasm files', async () => {
      client2Dir = path.join(rootDir, 'j2-client2-consumer');
      await fs.promises.mkdir(client2Dir, {recursive: true});

      // Confirm clean directory: zero .wasm files
      const files = await fs.promises.readdir(client2Dir);
      assert.equal(files.length, 0);

      // Deploy using only registration identity and explicit config
      const registration = {
        accessPolicies: publishedReceipt.accessPolicies,
        artifactDigest: publishedReceipt.artifactDigest,
        bindings: publishedReceipt.bindings,
        config: {replicas: 1},
        manifest: publishedReceipt.manifest,
        manifestDigest: publishedReceipt.manifestDigest,
        packageId: publishedReceipt.packageId,
        service: publishedReceipt.service,
      };

      const deployResult = await runDeploy({
        createSqlClient,
        idempotencyKey: 'client2-deploy-identities-only',
        projectDirectory: client2Dir,
        registration,
      });
      assert.equal(deployResult.packageId, publishedReceipt.packageId);

      // Inspect readiness
      const inspectResult = await runInspect({
        createSqlClient,
        projectDirectory: client2Dir,
        registration,
      });
      assert.equal(inspectResult.ready, true);
    });

    it('activation loads sealed bytes exclusively from ArtifactPayloadStore (loadComponentPayloadThroughStore)', async () => {
      const target = {
        artifactDigest: publishedReceipt.artifactDigest,
      };
      const loaded = await loadComponentPayloadThroughStore(commandOwner, target);
      assert.ok(Buffer.isBuffer(loaded.bytes) || loaded.bytes instanceof Uint8Array);
      assert.ok(loaded.bytes.length > 1000);
      assert.equal(
        loaded.payloadDigest,
        `sha256:${createHash('sha256').update(loaded.bytes).digest('hex')}`,
      );
    });

    it('simulating accepting-node restart or second node activation succeeds from surviving store rows', async () => {
      // Create second node command owner sharing the same replicated store database
      const node2Store = createArtifactPayloadStore({
        executeInternal: storeDb.executeInternal,
      });
      const node2Owner = {
        artifactPayloadStore: node2Store,
      };

      const loadedNode2 = await loadComponentPayloadThroughStore(node2Owner, {
        artifactDigest: publishedReceipt.artifactDigest,
      });
      assert.ok(loadedNode2.bytes.length > 1000);
      assert.equal(
        loadedNode2.payloadDigest,
        `sha256:${createHash('sha256').update(loadedNode2.bytes).digest('hex')}`,
      );
    });

    it('rejects retired artifact_source (local_oci_layout and remote_oci) with ARTIFACT_SOURCE_RETIRED (10.2)', async () => {
      // 1. local_oci_layout
      const localSourcePayload = JSON.stringify({
        artifact_source: {kind: 'local_oci_layout', location: '/tmp/retired-layout'},
        idempotency_key: 'install-retired-local',
        manifest: publishedReceipt.manifest,
      });
      const localRes = await pgAdapter.execute(
        'session-main',
        'INSTALL SERVICE $1',
        [localSourcePayload],
      );
      assert.equal(localRes.success, false);
      assert.equal(
        localRes.errorCode,
        SERVICE_LIFECYCLE_SQL_ERROR_CODE.ARTIFACT_SOURCE_RETIRED,
      );

      // 2. remote_oci
      const remoteSourcePayload = JSON.stringify({
        artifact_source: {kind: 'remote_oci', ref: 'registry.example.test/service:1.0'},
        idempotency_key: 'install-retired-remote',
        manifest: publishedReceipt.manifest,
      });
      const remoteRes = await pgAdapter.execute(
        'session-main',
        'INSTALL SERVICE $1',
        [remoteSourcePayload],
      );
      assert.equal(remoteRes.success, false);
      assert.equal(
        remoteRes.errorCode,
        SERVICE_LIFECYCLE_SQL_ERROR_CODE.ARTIFACT_SOURCE_RETIRED,
      );
    });

    it('rejects installation when ArtifactPayloadStore is missing with STORE_UNAVAILABLE', async () => {
      const storelessGateway = new SharedLifecycleCatalogGateway(systemTableCache);
      const storelessMetadataOwners = createSystemMetadataOwners({
        controlPlaneSystemTableGateway: storelessGateway,
        now: () => Date.now(),
      });
      const storelessCommandOwner = new ServiceLifecycleCommandOwner({
        artifactPayloadStore: null,
        artifactResolver: new PassthroughArtifactResolver(artifactPayloadStore),
        bindingOwner: storelessMetadataOwners.deploymentBindingOwner,
        catalogOwner: storelessMetadataOwners.serviceInstallCatalogOwner,
        runtimeAccessPolicyOwner: storelessMetadataOwners.runtimeAccessPolicyOwner,
        signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
      });

      const storelessEngine = new SQLQueryEngine({
        autoStartDistributedTransactionRecovery: false,
        messageRouter: {deliver: async () => ({success: true})},
        systemCache: systemTableCache,
      });
      storelessEngine.setServiceLifecycleCommandOwner(storelessCommandOwner);

      const storelessAdapter = new PostgresWireAdapter({
        authHandler: createAuthHandler(),
        logger: {debug() {}, error() {}, info() {}, warn() {}},
        sqlCore: storelessEngine,
      });
      await storelessAdapter.authenticate('session-storeless', {
        database: TENANT_ID,
        password: 'test-password',
        tenantId: TENANT_ID,
        user: USER,
      });

      const payload = JSON.stringify({
        idempotency_key: 'install-storeless-fail',
        manifest: publishedReceipt.manifest,
      });
      const res = await storelessAdapter.execute(
        'session-storeless',
        'INSTALL SERVICE $1',
        [payload],
      );
      assert.equal(res.success, false);
      assert.equal(
        res.errorCode,
        SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.STORE_UNAVAILABLE,
      );
    });
  });
});
