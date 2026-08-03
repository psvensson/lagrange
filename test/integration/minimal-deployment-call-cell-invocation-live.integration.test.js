/**
 * Minimal-deployment call-cell invocation live wiring: one authenticated
 * pgwire session drives CALL BINDING through the real SQL ingress,
 * ServiceLifecycleCommandOwner dispatch, and a CallCellInvoker composed
 * from the real CallBindingRouteResolver (over the live system table
 * cache), the real createCallCellBatchExecutor (over the real engine
 * parser, partition resolver, and query executor fanning out to REAL
 * per-partition SQLite storage), the real createCallCellReduceCoordinator
 * (seeded rows + guarded-UPDATE coordination store), and the REAL
 * CallCellStatementAdapter assembled by createCallCellRoutingSurface —
 * so every run/reduce dispatch flows ServiceDispatcher → MessageRouter →
 * the REAL RuntimeServiceHandler receiver (INVOKE_CALL_CELL) → the real
 * driver call-cell invocation path over WasiComponentCellRuntime with the
 * componentized fixture guest. Legacy statement-less bindings fail closed
 * not-invocable; sessions lacking BINDING_CALL are denied before dispatch.
 */

import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, it} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import Database from 'better-sqlite3';

import {ControlPlaneSetup} from
  '../../src/bootstrap/shared/control-plane-setup.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from
  '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {CDC_OPERATION, RUNTIME_KIND, TABLES} from
  '../../src/constants/index.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {
  canonicalJson,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {deriveTenantPackageId} from
  '../../src/control-plane/owners/service-install-catalog-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
  deriveRequestServiceDefinitionId,
} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {invokeCallCell} from
  '../../src/runtime/call-cell-driver-invoke.js';
import {
  createCallCellReduceCoordinator,
} from '../../src/runtime/call-cell-reduce-coordinator.js';
import {toCellBatch} from
  '../../src/runtime/call-cell-value-mapping.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from
  '../../src/runtime/pgwire-auth-handler.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {CallBindingRouteResolver} from
  '../../src/service/call-binding-route-resolver.js';
import {createCallCellBatchExecutor} from
  '../../src/service/call-cell-batch-executor.js';
import {CallCellInvoker} from '../../src/service/call-cell-invoker.js';
import {createCallPartitionTopology} from
  '../../src/service/call-partition-topology.js';
import {CALL_CELL_INVOCATION_ID_PREFIX} from
  '../../src/service/call-cell-routing-contract.js';
import {createCallCellRoutingSurface} from
  '../../src/service/call-cell-routing-surface.js';

const NODE_ID = 'call-cell-live-node';
const TENANT_ID = 'tenant-a';
const PRINCIPAL = 'alice';
const APPLICATION_ROLE = 'application';
const CALL_SERVICE_NAME = 'call-cell-live';
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const ARTIFACT_REF =
  `registry.example.test/acme/call-cell-live:1.0.0@${ARTIFACT_DIGEST}`;
const WORLD_NAME = 'call-cell';
const CALL_EXPORT = 'run';
const CALL_INTERFACE = 'call_v1';
const CALL_STATEMENT = 'SELECT id, score, label FROM shard_ratings';
const DECLARED_TABLE = 'shard_ratings';
const PARTITION_ONE = 'shard_ratings-p1';
const PARTITION_TWO = 'shard_ratings-p2';
const PARTITION_SERVICE_TYPE = 'partition';
const PARTITION_RAFT_LEADER = 'leader';
const PARTITION_SERVICE_STATUS = 'active';
const QUERY_MESSAGE_TYPE = 'QUERY';
const COORDINATION_TABLE = 'call_cell_live_slots';
const RESULT_TABLE = 'call_cell_live_results';
const REDUCE_LEASE_MS = 60000;
const ADAPTER_DEADLINE_MS = 60000;
const BATCH_ROW_BOUND = 64;
const PARTIAL_LIMIT = 8;
const SLOT_COUNT = 4;
const EMIT_BUDGET = 8;
const NESTED_CALL_BUDGET = 1;
const TOP_N = 3;
const INVOCATION_ARGUMENTS_JSON = JSON.stringify({topN: TOP_N});
const SHARD_TABLE_DDL =
  'CREATE TABLE shard_ratings (id INTEGER PRIMARY KEY, score REAL, ' +
  'label TEXT)';
const SHARD_ROW_INSERT =
  'INSERT INTO shard_ratings (id, score, label) VALUES (?, ?, ?)';
const COMPONENTIZE_DISABLED_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);
const CELL_BUDGETS = Object.freeze({
  context_bytes: 4096,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

// Rows split across two REAL SQLite partition stores so every emitted
// group key is shard-disjoint (required by the reduce completeness gate)
// and every row survives each shard's top-3 (so nothing hits the emit
// budget).
const SEEDED_ROWS = Object.freeze({
  [PARTITION_ONE]: Object.freeze([
    Object.freeze({id: 1, score: 4.5, label: null}),
    Object.freeze({id: 2, score: 3.5, label: null}),
    Object.freeze({id: 3, score: 4.9, label: null}),
    Object.freeze({id: 4, score: 2.5, label: null}),
  ]),
  [PARTITION_TWO]: Object.freeze([
    Object.freeze({id: 5, score: 4.7, label: null}),
    Object.freeze({id: 6, score: 2.9, label: null}),
    Object.freeze({id: 7, score: 4.1, label: null}),
  ]),
});
// The guest reduce projects {key, score} from the numeric emitted
// aggregation values, ordered by score descending, top-N.
const EXPECTED_RESULT_JSON = JSON.stringify([
  {key: '3', score: 4.9},
  {key: '5', score: 4.7},
  {key: '1', score: 4.5},
]);

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function callServiceManifest() {
  return {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: ARTIFACT_REF,
      type: 'oci',
    },
    capabilities: [],
    exports: [{
      interface: CALL_INTERFACE,
      name: CALL_EXPORT,
    }],
    name: CALL_SERVICE_NAME,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: '1.0.0',
  };
}

function createCallArtifact() {
  const manifest = callServiceManifest();
  const bytes = Buffer.from('call-cell-live-component-bytes');
  return Object.freeze({
    artifactDigest: ARTIFACT_DIGEST,
    bytes,
    manifest,
    manifestDigest: sha256(canonicalJson(manifest)),
    packageId: deriveTenantPackageId(manifest, TENANT_ID),
    payloadDigest: sha256(bytes),
  });
}

function callBindingInput(artifact, options = {}) {
  const source = {
    kind: 'call',
    name: options.sourceName || CALL_SERVICE_NAME,
  };
  if (options.withStatement !== false) {
    source.statement = CALL_STATEMENT;
  }
  return {
    budgets: {
      context_bytes: 4096,
      cpu_time_ms: 1000,
      input_bytes: 65536,
      memory_bytes: 64 * 1024 * 1024,
      output_bytes: 65536,
      wall_time_ms: 10000,
    },
    name: options.bindingName || CALL_SERVICE_NAME,
    schema_version: 2,
    source,
    target: {
      export_name: CALL_EXPORT,
      manifest_digest: artifact.manifestDigest,
      package_id: artifact.packageId,
    },
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
    const insert =
      /^INSERT(?: OR REPLACE)? INTO ([a-z_]+) \(([^)]+)\) VALUES \(([^)]+)\)$/iu
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
    rows(tableName) {
      return [...table(tableName).values()].map((row) => ({...row}));
    },
    async settle() {
      await Promise.all(cacheApplies);
    },
  };
}

function extractQuotedString(sql, marker) {
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  let cursor = start + marker.length;
  let value = '';
  while (cursor < sql.length) {
    const char = sql[cursor];
    if (char !== '\'') {
      value += char;
      cursor += 1;
      continue;
    }
    if (sql[cursor + 1] === '\'') {
      value += '\'';
      cursor += 2;
      continue;
    }
    return value;
  }
  return value;
}

function whereValue(sql, marker) {
  const match = sql.match(new RegExp(`${marker} = ('?)([^'\\s,]+)\\1`, 'u'));
  return match ? match[2] : null;
}

// In-memory coordination/result store shaped like the production guarded
// UPDATE + seed INSERT grammar consumed by createCallCellReduceCoordinator.
function createCoordinationStore() {
  const slots = [];
  const results = [];

  function applySlotSet(row, setClause) {
    const claimOwner = extractQuotedString(setClause, 'replica_id = \'');
    if (claimOwner !== null) {
      row.replica_id = claimOwner;
      row.partial_json = '[]';
      row.computed_at = 0;
    }
    const partialJson = extractQuotedString(setClause, 'partial_json = \'');
    if (partialJson !== null) row.partial_json = partialJson;
    const lease = /lease_expires_at = (\d+)/u.exec(setClause);
    if (lease) row.lease_expires_at = Number(lease[1]);
    const computed = /computed_at = (\d+)/u.exec(setClause);
    if (computed) row.computed_at = Number(computed[1]);
  }

  function updateSlot(sql) {
    const whereClause = sql.slice(sql.indexOf(' WHERE '));
    const row = slots.find((slot) =>
      slot.invocation_id === whereValue(whereClause, 'invocation_id') &&
      slot.slot_id === Number(whereValue(whereClause, 'slot_id')));
    if (!row) return {rows: [], success: true};
    const ownerGuard = extractQuotedString(whereClause, 'replica_id = \'');
    if (ownerGuard !== null && row.replica_id !== ownerGuard) {
      return {rows: [], success: true};
    }
    const expiryGuard = /lease_expires_at <= (\d+)/u.exec(whereClause);
    if (expiryGuard && row.lease_expires_at > Number(expiryGuard[1])) {
      return {rows: [], success: true};
    }
    applySlotSet(row, sql.slice(0, sql.indexOf(' WHERE ')));
    return {rows: [], success: true};
  }

  function updateResult(sql) {
    const whereClause = sql.slice(sql.indexOf(' WHERE '));
    const row = results.find((entry) =>
      entry.result_id === extractQuotedString(whereClause, 'result_id = \''));
    if (!row) return {rows: [], success: true};
    const setClause = sql.slice(0, sql.indexOf(' WHERE '));
    const resultJson = extractQuotedString(setClause, 'result_json = \'');
    if (resultJson !== null) row.result_json = resultJson;
    const witness = extractQuotedString(setClause, 'source_snapshot_json = \'');
    if (witness !== null) row.source_snapshot_json = witness;
    const computed = /computed_at = (\d+)/u.exec(setClause);
    if (computed) row.computed_at = Number(computed[1]);
    return {rows: [], success: true};
  }

  function applyInsert(sql) {
    const match =
      /^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \((.+)\)$/u.exec(sql);
    if (!match) return null;
    const [, tableName, columnsFragment, valuesFragment] = match;
    const columns = columnsFragment.split(',')
      .map((column) => column.trim());
    const values = valuesFragment.match(/'(?:[^']|'')*'|[^,\s]+/gu)
      .map((value) => (value.startsWith('\'') ?
        value.slice(1, -1).replace(/''/gu, '\'') :
        Number(value)));
    const row = Object.fromEntries(
      columns.map((column, index) => [column, values[index]]));
    if (tableName === COORDINATION_TABLE) {
      slots.push(row);
      return {rows: [], success: true};
    }
    if (tableName === RESULT_TABLE) {
      results.push(row);
      return {rows: [], success: true};
    }
    return null;
  }

  return {
    async executeInternal(sql) {
      if (sql.startsWith(`UPDATE ${COORDINATION_TABLE}`)) {
        return updateSlot(sql);
      }
      if (sql.startsWith(`UPDATE ${RESULT_TABLE}`)) {
        return updateResult(sql);
      }
      if (sql.startsWith('SELECT slot_id, replica_id, lease_expires_at, ')) {
        const invocationId =
          extractQuotedString(sql, 'invocation_id = \'');
        return {
          rows: slots
            .filter((slot) => slot.invocation_id === invocationId)
            .map((slot) => ({...slot})),
          success: true,
        };
      }
      const inserted = applyInsert(sql);
      if (inserted) return inserted;
      const slotReclaim =
        /^DELETE FROM [a-z_]+ WHERE lease_expires_at <= (\d+)$/u.exec(sql);
      if (slotReclaim && sql.includes(COORDINATION_TABLE)) {
        const keep = slots.filter(
          (slot) => slot.lease_expires_at > Number(slotReclaim[1]));
        slots.length = 0;
        slots.push(...keep);
        return {rows: [], success: true};
      }
      const resultReclaim =
        /^DELETE FROM [a-z_]+ WHERE result_json = '' AND computed_at <= (\d+)$/u
          .exec(sql);
      if (resultReclaim && sql.includes(RESULT_TABLE)) {
        const keep = results.filter(
          (row) => row.result_json !== '' ||
            row.computed_at > Number(resultReclaim[1]));
        results.length = 0;
        results.push(...keep);
        return {rows: [], success: true};
      }
      return {
        error: `unsupported coordination SQL: ${sql}`,
        rows: [],
        success: false,
      };
    },
    resultRows() {
      return results.map((row) => ({...row}));
    },
    slotRows(invocationId) {
      return slots
        .filter((slot) => slot.invocation_id === invocationId)
        .map((slot) => ({...slot}));
    },
  };
}

function createAuthenticatedAdapter(engine, sessionId, allowedActions) {
  const authHandler = new PgWireAuthHandler({
    authenticator: async () => ({
      authenticated: true,
      roles: [APPLICATION_ROLE, 'service-operator'],
    }),
    logger: silentLogger,
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    policy: {allowedActions: new Set(allowedActions)},
  });
  const adapter = new PostgresWireAdapter({
    authHandler,
    logger: silentLogger,
    sqlCore: engine,
  });
  return adapter.authenticate(sessionId, {
    password: 'fixture-password',
    tenantId: TENANT_ID,
    user: PRINCIPAL,
  }).then(() => adapter);
}

const CONTROL_PLANE_STOPS = Object.freeze([
  ['membershipPublicationService', 'stopOwnerMembershipDriver'],
  ['leaseService', 'stop'],
  ['heartbeatService', 'stop'],
  ['endpointService', 'stop'],
  ['dispatchService', 'stop'],
]);

function stopControlPlane(setup) {
  for (const [serviceName, stopMethod] of CONTROL_PLANE_STOPS) {
    setup?.[serviceName]?.[stopMethod]?.();
  }
}

async function componentizeFixtureGuest() {
  const guestSource = await readFile(
    new URL(
      '../wasm-service/fixtures/call-cell-world/guest.js',
      import.meta.url,
    ),
    'utf8',
  );
  const {component} = await componentize(guestSource, {
    disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: WORLD_NAME,
  });
  return component;
}

function readNoContexts() {
  return [];
}

function writeNoEffects() {}

function cancelNoop() {}

// REAL per-partition SQLite storage behind the message router: a QUERY
// delivery executes the ACTUAL rendered SQL against the addressed
// partition's database — parse, routing, SQL rendering, fan-out, and
// storage execution are all live (the repo's distributed-select tests use
// the same shape).
function createPartitionStores() {
  const databases = new Map();
  for (const [partitionId, rows] of Object.entries(SEEDED_ROWS)) {
    const database = new Database(':memory:');
    database.exec(SHARD_TABLE_DDL);
    const insert = database.prepare(SHARD_ROW_INSERT);
    for (const row of rows) {
      insert.run(row.id, row.score, row.label);
    }
    databases.set(partitionId, database);
  }
  return {
    databases,
    close() {
      for (const database of databases.values()) database.close();
    },
  };
}

// One in-process MessageRouter serving both live seams: partition QUERY
// deliveries execute against the real SQLite stores, and addressed
// handler deliveries reach whatever registered via the REAL
// RuntimeServiceHandler.registerWithRouter path.
function isPartitionQueryMessage(message) {
  return message?.type === QUERY_MESSAGE_TYPE ||
    message?.payload?.type === QUERY_MESSAGE_TYPE;
}

function executePartitionQuery(partitionStores, address, message) {
  const partitionId = address.split('/')[2];
  const database = partitionStores.databases.get(partitionId);
  if (!database) {
    return {acknowledged: true, success: false,
      error: `unknown partition: ${partitionId}`};
  }
  const sql = message.sql || message.payload?.sql;
  const params = message.params || message.payload?.params || [];
  const rows = database.prepare(sql).all(...params);
  return {
    acknowledged: true,
    success: true,
    rows,
    count: rows.length,
    partitionId,
  };
}

function createLiveMessageRouter(partitionStores) {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    async deliver(address, message) {
      const handler = handlers.get(address);
      if (handler) {
        return handler(message);
      }
      if (isPartitionQueryMessage(message)) {
        return executePartitionQuery(partitionStores, address, message);
      }
      return {acknowledged: true, success: true};
    },
    send: async () => ({success: true}),
  };
}

function seedDeclaredTableRouting(systemTableCache) {
  systemTableCache.applySystemTableChange(
    TABLES.TABLES,
    CDC_OPERATION.UPSERT,
    {
      primary_key: 'id',
      table_id: DECLARED_TABLE,
      table_name: DECLARED_TABLE,
    },
  );
  const partitions = [
    {partition_id: PARTITION_ONE, partition_key_start: null,
      partition_key_end: '5'},
    {partition_id: PARTITION_TWO, partition_key_start: '5',
      partition_key_end: null},
  ];
  for (const partition of partitions) {
    systemTableCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CDC_OPERATION.UPSERT,
      {
        ...partition,
        leader_node_id: NODE_ID,
        table_name: DECLARED_TABLE,
      },
    );
    systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        address: `${NODE_ID}/partition/${partition.partition_id}`,
        node_id: NODE_ID,
        partition_id: partition.partition_id,
        raft_role: PARTITION_RAFT_LEADER,
        service_id: partition.partition_id,
        service_type: PARTITION_SERVICE_TYPE,
        status: PARTITION_SERVICE_STATUS,
      },
    );
  }
}

// The runtime invocation owner seam: the REAL driver call-cell path
// (invokeCallCell — call-context host wiring, bounded emit collection,
// partial-key prefixing) over the real WasiComponentCellRuntime worker.
function createRuntimeInvocationOwner(cellRuntime) {
  const invocations = {reduce: [], run: []};
  return {
    invocations,
    owner: {
      async health() {
        return {status: HEALTH_STATUS.HEALTHY};
      },
      async invoke(replicaHandle, invocation) {
        invocations[invocation.exportName]?.push({
          invocationId: invocation.invocationId,
          serviceId: replicaHandle.serviceId,
        });
        return invokeCallCell(
          {
            failLifecycle: (cause) => {
              throw cause;
            },
            invokeComponent: (serviceId, args, read, write, options) =>
              cellRuntime.invoke(
                serviceId, args, read, write, cancelNoop, options),
            stopComponent: (serviceId) => cellRuntime.stop(serviceId),
          },
          invocation,
          replicaHandle.serviceId,
        );
      },
    },
  };
}

describe('minimal deployment call-cell invocation live wiring', () => {
  it('flows one authenticated CALL BINDING through the real invocation ' +
    'layers to exactly one reduced snapshot', async (testContext) => {
    const systemTableCache = new SystemTableCache();
    const partitionStores = createPartitionStores();
    const messageRouter = createLiveMessageRouter(partitionStores);
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

    const setup = await ControlPlaneSetup.create({
      cdcIntegrationService,
      messageRouter,
      nodeAddress: '127.0.0.1:7411',
      nodeId: NODE_ID,
      systemTableCache,
      tablePolicyService: {
        getPolicy: () => null,
        initialize() {},
      },
    });
    seedDeclaredTableRouting(systemTableCache);
    const cellRuntime = new WasiComponentCellRuntime();
    const startedServices = new Set();
    testContext.after(async () => {
      stopControlPlane(setup);
      cdcIntegrationService.markShuttingDown();
      await durableStore.settle();
      for (const serviceId of startedServices) {
        await cellRuntime.stop(serviceId);
      }
      partitionStores.close();
      await engine.shutdown();
    });

    const artifact = createCallArtifact();
    const recordedPackage =
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
    assert.equal(recordedPackage.manifestDigest, artifact.manifestDigest);

    const adminAdapter = await createAuthenticatedAdapter(
      engine,
      'call-cell-admin-session',
      [PGWIRE_AUTH_ACTION.BINDING_CREATE],
    );
    const createdBinding = await adminAdapter.execute(
      'call-cell-admin-session',
      'CREATE BINDING $1',
      [JSON.stringify(callBindingInput(artifact))],
    );
    assert.equal(
      createdBinding.success,
      true,
      JSON.stringify(createdBinding),
    );

    // A second, legacy statement-less call Binding against the same
    // installed package proves the not-invocable fail-closed path.
    const legacyBinding = await adminAdapter.execute(
      'call-cell-admin-session',
      'CREATE BINDING $1',
      [JSON.stringify(callBindingInput(artifact, {
        bindingName: 'call-cell-legacy',
        sourceName: 'call-cell-legacy',
        withStatement: false,
      }))],
    );
    assert.equal(legacyBinding.success, true, JSON.stringify(legacyBinding));

    const bindingRows = durableStore.rows(TABLES.SERVICE_BINDINGS);
    assert.equal(bindingRows.length, 2);
    const bindingRow = bindingRows.find((row) =>
      row.binding_name === CALL_SERVICE_NAME);
    assert.ok(bindingRow, 'expected the statement-bearing binding row');
    const binding = projectBinding(bindingRow);
    assert.equal(binding.declaration.source.statement, CALL_STATEMENT);

    // Seed the desired/actual Cell rows the resolver requires: an ACTIVE
    // binding-derived definition plus a ready runtime-service actual.
    const compiledDefinition =
        buildRequestBindingServiceDefinition(bindingRow, artifact);
    const definition = buildActivatedRequestBindingServiceDefinition(
      compiledDefinition,
      binding,
    );
    const serviceId = deriveRequestServiceDefinitionId(
      binding.bindingVersionId,
    );
    const replicaId = `${serviceId}-r1`;
    systemTableCache.applySystemTableChange(
      TABLES.SERVICE_DEFINITIONS,
      CDC_OPERATION.UPSERT,
      definition,
    );
    systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        created_at: Date.now(),
        node_id: NODE_ID,
        service_id: replicaId,
        service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        status: ReplicaStatus.ACTIVE,
        updated_at: Date.now(),
      },
    );

    // The ready Cell actual: componentized fixture guest started in the
    // real WASI component runtime, addressable via the receiver's local
    // replica registry.
    const component = await componentizeFixtureGuest();
    await cellRuntime.start(Object.freeze({
      budgets: CELL_BUDGETS,
      bytes: new Uint8Array(component),
      capabilities: [],
      exportName: CALL_EXPORT,
      serviceId,
      world: WORLD_NAME,
    }));
    startedServices.add(serviceId);

    const routeResolver = new CallBindingRouteResolver({
      systemTableCacheProvider: () => systemTableCache,
    });
    const runtimeInvocationOwner = createRuntimeInvocationOwner(cellRuntime);
    const localPartitionServices = new Map(
      [...partitionStores.databases.entries()]
        .filter(([partitionId]) => partitionId.startsWith(DECLARED_TABLE))
        .map(([partitionId, database]) => [partitionId, {
          executeQuery: async (sql, params = []) => {
            const rows = database.prepare(sql).all(...params);
            return {count: rows.length, partitionId, rows, success: true};
          },
          initialized: true,
          partitionId,
        }]),
    );
    const runtimeServiceHandler = new RuntimeServiceHandler({
      callBindingRouteResolver: routeResolver,
      cdcIntegrationService,
      nodeId: NODE_ID,
      serviceLifecycleManager: {},
      partitionServicesProvider: () => localPartitionServices,
      serviceRuntimeLifecycle: runtimeInvocationOwner.owner,
      systemTableCache,
    });
    runtimeServiceHandler.localReplicas.set(replicaId, {
      entityId: serviceId,
      replicaHandle: {serviceId},
      status: ReplicaStatus.ACTIVE,
    });
    runtimeServiceHandler.registerWithRouter(messageRouter);

    // The REAL routing surface: CallBindingRouteResolver +
    // ServiceDispatcher + CallCellStatementAdapter assembled by the
    // production factory, delivering over the registered receiver.
    const routingSurface = createCallCellRoutingSurface({
      deadlineMs: ADAPTER_DEADLINE_MS,
      logger: silentLogger,
      messageRouterProvider: () => messageRouter,
      routeResolver,
    });

    const coordinationStore = createCoordinationStore();
    const reduceCoordinator = createCallCellReduceCoordinator({
      coordinationTable: COORDINATION_TABLE,
      executeInternal: (sql) => coordinationStore.executeInternal(sql),
      leaseMs: REDUCE_LEASE_MS,
      nowProvider: () => Date.now(),
      resultTable: RESULT_TABLE,
      slotCount: SLOT_COUNT,
    });
    const batchExecutor = createCallCellBatchExecutor({
      partitionResolver: engine.partitionResolver,
      partitionsProvider: (tableName) => engine.getTablePartitions(tableName),
      queryExecutor: engine.queryExecutor,
      sqlParser: {parse: (sql) => engine.parse(sql)},
    });
    const invoker = new CallCellInvoker({
      batchExecutor,
      partitionTopology: createCallPartitionTopology({sqlQueryEngine: engine}),
      batchRowBound: BATCH_ROW_BOUND,
      emitBudget: EMIT_BUDGET,
      nestedCallBudget: NESTED_CALL_BUDGET,
      partialLimit: PARTIAL_LIMIT,
      reduceCoordinator,
      routeResolver,
      statementAdapter: routingSurface.statementAdapter,
    });
    setup.serviceLifecycleCommandOwner.callCellInvoker = invoker;

    // Sanity: the declared statement fans out into one typed batch per
    // seeded partition through the real parser, partition resolver, SQL
    // renderer, and SQLite-backed partition execution.
    const batches = await batchExecutor.executeBatches({
      batchRowBound: BATCH_ROW_BOUND,
      statement: CALL_STATEMENT,
    });
    assert.equal(batches.length, 2);
    assert.deepEqual(
      batches.map((batch) => batch.partitionId),
      [PARTITION_ONE, PARTITION_TWO],
    );
    assert.equal(batches[0].batch.length, SEEDED_ROWS[PARTITION_ONE].length);
    assert.equal(batches[1].batch.length, SEEDED_ROWS[PARTITION_TWO].length);

    const callAdapter = await createAuthenticatedAdapter(
      engine,
      'call-cell-call-session',
      [PGWIRE_AUTH_ACTION.BINDING_CALL],
    );
    const invocation = await callAdapter.execute(
      'call-cell-call-session',
      'CALL BINDING $1',
      [JSON.stringify({
        arguments: {topN: TOP_N},
        name: CALL_SERVICE_NAME,
        schema_version: 2,
      })],
    );
    assert.equal(invocation.success, true, JSON.stringify(invocation));
    assert.equal(invocation.rows.length, 1);
    const resultJson = invocation.rows[0].result;
    assert.equal(
      resultJson,
      EXPECTED_RESULT_JSON,
      'the reduced top-N over the seeded rows matches the ' +
          'independently computed expectation',
    );
    assert.deepEqual(JSON.parse(resultJson), JSON.parse(EXPECTED_RESULT_JSON));

    // Exactly-once: one run per shard, one reduce over the complete set,
    // all through the receiver → runtime invocation owner path.
    assert.equal(runtimeInvocationOwner.invocations.run.length, 2);
    assert.equal(runtimeInvocationOwner.invocations.reduce.length, 1);

    // The atomically visible snapshot: a routing-contract UUID invocation
    // identity, the exact reduced result, and a witness covering exactly
    // the two shard slots with the runtime replica as lease holder.
    const resultRows = coordinationStore.resultRows();
    assert.equal(resultRows.length, 1);
    const resultRow = resultRows[0];
    assert.ok(
      resultRow.result_id.startsWith(CALL_CELL_INVOCATION_ID_PREFIX),
      'the invocation identity is the routing-contract UUID identity',
    );
    assert.equal(resultRow.result_json, EXPECTED_RESULT_JSON);
    const witness = JSON.parse(resultRow.source_snapshot_json);
    assert.equal(witness.schemaVersion, 1);
    assert.deepEqual(
      witness.slots.map((slot) => slot.slotId),
      [1, 2],
    );
    assert.equal(
      witness.slots.every((slot) => slot.replicaId === replicaId),
      true,
      'each shard partial was published under the invoking replica lease',
    );
    assert.equal(
      witness.slots.every((slot) =>
        Number.isFinite(slot.computedAt) && slot.computedAt > 0),
      true,
    );

    // The published slot partials are the shards' EMITTED partial sets in
    // the coordination gate shape (numeric aggregation values by group).
    const slotRows = coordinationStore.slotRows(resultRow.result_id)
      .filter((slot) => slot.partial_json !== '[]');
    assert.equal(slotRows.length, 2);
    const publishedEntries = slotRows.flatMap((slot) =>
      JSON.parse(slot.partial_json));
    assert.deepEqual(
      publishedEntries
        .map((entry) => [entry.groupKey, entry.aggValue])
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        ['1', 4.5], ['2', 3.5], ['3', 4.9], ['4', 2.5],
        ['5', 4.7], ['6', 2.9], ['7', 4.1],
      ],
    );

    // The legacy statement-less binding fails closed not-invocable: the real
    // route resolver over the live cache raises the typed refusal.
    assert.throws(
      () => routeResolver.resolve({
        invocationId: 'legacy-probe',
        name: 'call-cell-legacy',
        securityContext: {
          principal: PRINCIPAL,
          roles: [APPLICATION_ROLE, 'service-operator'],
          tenantId: TENANT_ID,
        },
      }),
      (error) => error.code === 'call_cell_not_invocable',
    );
    // End to end the CALL fails closed (no silent pass) and no shard runs.
    const legacyCall = await callAdapter.execute(
      'call-cell-call-session',
      'CALL BINDING $1',
      [JSON.stringify({name: 'call-cell-legacy', schema_version: 2})],
    );
    assert.equal(legacyCall.success, false, JSON.stringify(legacyCall));
    assert.equal(runtimeInvocationOwner.invocations.run.length, 2);
    assert.equal(runtimeInvocationOwner.invocations.reduce.length, 1);

    // A session lacking the BINDING_CALL action is denied at the auth
    // boundary before any dispatch.
    const deniedAdapter = await createAuthenticatedAdapter(
      engine,
      'call-cell-denied-session',
      [PGWIRE_AUTH_ACTION.EXECUTE_QUERY],
    );
    const denied = await deniedAdapter.execute(
      'call-cell-denied-session',
      'CALL BINDING $1',
      [JSON.stringify({name: CALL_SERVICE_NAME, schema_version: 2})],
    ).then(
      () => null,
      (error) => error,
    );
    assert.ok(denied, 'expected the unauthorized CALL to reject');
    assert.match(String(denied.message), /authorized/iu);
    assert.equal(runtimeInvocationOwner.invocations.run.length, 2);
    assert.equal(runtimeInvocationOwner.invocations.reduce.length, 1);
  });

  it('round-trips the fixture guest through the batch/reduce value seam',
    async () => {
      // Direct seam check: the typed batches the batch executor emits feed
      // the guest run export, and the emitted numeric partials feed reduce,
      // through the real worker path with no SQL ingress in the way.
      const component = await componentizeFixtureGuest();
      const cellRuntime = new WasiComponentCellRuntime();
      const serviceId = 'call-cell-seam-check';
      await cellRuntime.start(Object.freeze({
        budgets: CELL_BUDGETS,
        bytes: new Uint8Array(component),
        capabilities: [],
        exportName: CALL_EXPORT,
        serviceId,
        world: WORLD_NAME,
      }));
      try {
        const allRows = Object.values(SEEDED_ROWS).flat();
        const batch = toCellBatch(
          allRows.map((row) => ({...row})),
          allRows.length,
        );
        const runInvocation = await cellRuntime.invoke(
          serviceId,
          [batch, INVOCATION_ARGUMENTS_JSON],
          readNoContexts,
          writeNoEffects,
          cancelNoop,
          {
            callContext: {
              emitBudget: EMIT_BUDGET,
              nestedCallBudget: NESTED_CALL_BUDGET,
              onCallBounded: false,
            },
            exportName: 'run',
          },
        );
        const reduceInvocation = await cellRuntime.invoke(
          serviceId,
          [runInvocation.partials, INVOCATION_ARGUMENTS_JSON],
          readNoContexts,
          writeNoEffects,
          cancelNoop,
          {
            callContext: {
              emitBudget: EMIT_BUDGET,
              nestedCallBudget: NESTED_CALL_BUDGET,
              onCallBounded: false,
            },
            exportName: 'reduce',
          },
        );
        assert.equal(reduceInvocation.value, EXPECTED_RESULT_JSON);
      } finally {
        await cellRuntime.stop(serviceId);
      }
    });
});
