/**
 * Production wiring evidence for the call-cell invocation path over TWO
 * production-composed nodes: RuntimeServiceHandlers built by the REAL
 * RuntimeServiceHandlerSetup factory (no injected resolver — the Phase-A
 * self-default over the system table cache is what routes), the invoker
 * assembled by the REAL attachCallCellInvoker bootstrap module against a
 * real SQLQueryEngine whose coordination SQL executes against the
 * REGISTERED call_cell_reduce_slots / call_cell_reduce_results system
 * tables (DDL generated from their schema objects into real per-partition
 * SQLite), and shard runs spread deterministically across replicas on
 * BOTH nodes by their slot-scoped wire identities. The evidence: each
 * shard-owning replica publishes its own emitted partials under its own
 * acquired slot lease, reduce executes exactly once on the replica
 * holding the dedicated reduce lease slot, and exactly one atomically
 * published final snapshot is visible.
 */

import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, it} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import Database from 'better-sqlite3';

import {attachCallCellInvoker} from
  '../../src/bootstrap/shared/call-cell-invocation-setup.js';
import {RuntimeServiceHandlerSetup} from
  '../../src/bootstrap/shared/runtime-service-handler-setup.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  CALL_CELL_REDUCE_RESULTS_SCHEMA,
  CALL_CELL_REDUCE_SLOTS_SCHEMA,
} from '../../src/bootstrap/system-table-runtime-schema-definitions.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
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
  deriveRequestServiceDefinitionId,
} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {invokeCallCell} from
  '../../src/runtime/call-cell-driver-invoke.js';
import {HEALTH_STATUS} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';

function digestSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const NODE_A = 'wiring-node-a';
const NODE_B = 'wiring-node-b';
const TENANT_ID = 'tenant-a';
const PRINCIPAL = 'alice';
const CALL_SERVICE_NAME = 'call-cell-wiring';
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
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const ARTIFACT_REF = 'registry.example.test/acme/call-cell-wiring:1.0.0';
const TOP_N = 3;
const EMIT_BUDGET = 8;
const NESTED_CALL_BUDGET = 1;
const BATCH_ROW_BOUND = 64;
const PARTIAL_LIMIT = 8;
const SLOT_COUNT = 4;
const REDUCE_LEASE_MS = 60000;
const REDUCE_LEASE_SLOT_ID = 3;
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
const FIXTURE_DIRECTORY = new URL(
  '../wasm-service/fixtures/call-cell-world',
  import.meta.url,
);
const SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL,
  roles: Object.freeze(['application']),
  tenantId: TENANT_ID,
});
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
const EXPECTED_RESULT_JSON = JSON.stringify([
  {key: '3', score: 4.9},
  {key: '5', score: 4.7},
  {key: '1', score: 4.5},
]);

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function createManifest() {
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
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: '1.0.0',
  };
}

function createArtifact() {
  const manifest = createManifest();
  return {
    artifactDigest: ARTIFACT_DIGEST,
    bytes: Buffer.from('call-cell-wiring-bytes'),
    manifest,
    manifestDigest: `sha256:${digestSha256(canonicalJson(manifest))}`,
    packageId: `service-package-${'d'.repeat(64)}`,
    payloadDigest: `sha256:${digestSha256('call-cell-wiring-bytes')}`,
  };
}

function createDeploymentRows() {
  const artifact = createArtifact();
  const declaration = bindDeploymentArtifact(
    normalizeDeploymentBinding({
      budgets: {
        context_bytes: 4096,
        cpu_time_ms: 1000,
        input_bytes: 65536,
        memory_bytes: 64 * 1024 * 1024,
        output_bytes: 65536,
        wall_time_ms: 10000,
      },
      name: CALL_SERVICE_NAME,
      schema_version: 2,
      source: {
        kind: 'call',
        name: CALL_SERVICE_NAME,
        statement: CALL_STATEMENT,
      },
      target: {
        export_name: CALL_EXPORT,
        manifest_digest: artifact.manifestDigest,
        package_id: artifact.packageId,
      },
    }),
    artifact,
  );
  const bindingRow = buildBindingRow(declaration, SECURITY_CONTEXT, 1);
  const binding = projectBinding(bindingRow);
  const definition = buildActivatedRequestBindingServiceDefinition(
    buildRequestBindingServiceDefinition(bindingRow, artifact),
    binding,
  );
  const serviceId = deriveRequestServiceDefinitionId(
    binding.bindingVersionId);
  return {artifact, binding, bindingRow, definition, serviceId};
}

// Real per-partition SQLite storage: user shard partitions from hand DDL,
// coordination partitions from the REGISTERED system table schemas — the
// same generators the bootstrap partition DDL path consumes.
function createPartitionStores() {
  const databases = new Map();
  for (const [partitionId, rows] of Object.entries(SEEDED_ROWS)) {
    const database = new Database(':memory:');
    database.exec(SHARD_TABLE_DDL);
    const insert = database.prepare(SHARD_ROW_INSERT);
    for (const row of rows) insert.run(row.id, row.score, row.label);
    databases.set(partitionId, database);
  }
  for (const schema of [
    CALL_CELL_REDUCE_SLOTS_SCHEMA,
    CALL_CELL_REDUCE_RESULTS_SCHEMA,
  ]) {
    const database = new Database(':memory:');
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) {
      database.exec(indexSql);
    }
    databases.set(`${schema.tableName}-p1`, database);
  }
  return {
    databases,
    close() {
      for (const database of databases.values()) database.close();
    },
  };
}

function executePartitionSql(partitionStores, partitionId, message) {
  const database = partitionStores.databases.get(partitionId);
  if (!database) {
    return {acknowledged: true, success: false,
      error: `unknown partition: ${partitionId}`};
  }
  const sql = message.sql || message.payload?.sql;
  const params = message.params || message.payload?.params || [];
  if (/^\s*SELECT/iu.test(sql)) {
    const rows = database.prepare(sql).all(...params);
    return {acknowledged: true, success: true, rows,
      count: rows.length, partitionId};
  }
  const outcome = database.prepare(sql).run(...params);
  return {acknowledged: true, success: true, rows: [],
    affectedRows: outcome.changes, changes: outcome.changes, partitionId};
}

// One in-process router serving both nodes: registered handler addresses
// win (the REAL RuntimeServiceHandlerSetup registration path), partition
// addresses execute the delivered SQL against the real SQLite stores.
function createSharedMessageRouter(partitionStores) {
  const handlers = new Map();
  const partitionQueryDeliveries = [];
  return {
    partitionQueryDeliveries,
    register(address, handler) {
      handlers.set(address, handler);
    },
    async deliver(address, message) {
      const handler = handlers.get(address);
      if (handler) return handler(message);
      if (message?.type === QUERY_MESSAGE_TYPE ||
          message?.payload?.type === QUERY_MESSAGE_TYPE) {
        const partitionId = address.split('/')[2];
        partitionQueryDeliveries.push(partitionId);
        return executePartitionSql(partitionStores, partitionId, message);
      }
      return {acknowledged: true, success: true};
    },
    send: async () => ({success: true}),
  };
}

function seedTableRouting(cache, tableName, partitionIds, options = {}) {
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATION.UPSERT, {
    primary_key: options.primaryKey || 'id',
    table_id: tableName,
    table_name: tableName,
  });
  for (const partitionId of partitionIds) {
    const hostNodeId = options.hostByPartition?.[partitionId] || NODE_A;
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT, {
      leader_node_id: hostNodeId,
      partition_id: partitionId,
      partition_key_end: options.rangeByPartition?.[partitionId]?.end ?? null,
      partition_key_start:
        options.rangeByPartition?.[partitionId]?.start ?? null,
      table_name: tableName,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      address: `${hostNodeId}/partition/${partitionId}`,
      node_id: hostNodeId,
      partition_id: partitionId,
      raft_role: PARTITION_RAFT_LEADER,
      service_id: partitionId,
      service_type: PARTITION_SERVICE_TYPE,
      status: PARTITION_SERVICE_STATUS,
    });
  }
}

// Componentization is deterministic for the fixture guest; memoize the
// build so the second test in this file reuses the same bytes.
let componentizePromise = null;
function componentizeFixtureGuest() {
  componentizePromise = componentizePromise ?? (async () => {
    const guestSource = await readFile(
      new URL(
        '../wasm-service/fixtures/call-cell-world/guest.js',
        import.meta.url,
      ),
      'utf8',
    );
    const {component} = await componentize(guestSource, {
      disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
      witPath: path.join(FIXTURE_DIRECTORY.pathname, 'wit'),
      worldName: WORLD_NAME,
    });
    return component;
  })();
  return componentizePromise;
}

function cancelNoop() {}

function createRuntimeInvocationOwner(cellRuntime, options = {}) {
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
        });
        // Test instrumentation seam: the parallel-evidence test parks
        // both nodes' run invocations on a cross-node barrier here, so
        // passage proves genuinely overlapping receiver-side execution.
        if (invocation.exportName === CALL_EXPORT &&
            typeof options.onRunEntered === 'function') {
          await options.onRunEntered(options.nodeId, invocation);
        }
        return invokeCallCell(
          {
            failLifecycle: (cause) => {
              throw cause;
            },
            invokeComponent: (serviceId, args, read, write, invokeOptions) =>
              cellRuntime.invoke(
                serviceId, args, read, write, cancelNoop, invokeOptions),
            stopComponent: (serviceId) => cellRuntime.stop(serviceId),
          },
          invocation,
          replicaHandle.serviceId,
        );
      },
    },
  };
}

async function createNode({
  nodeId,
  componentBytes,
  serviceId,
  replicaId,
  messageRouter,
  systemTableCache,
  localPartitionServices,
  sqlQueryEngine,
  onRunEntered,
}) {
  const cellRuntime = new WasiComponentCellRuntime();
  await cellRuntime.start(Object.freeze({
    budgets: CELL_BUDGETS,
    bytes: new Uint8Array(componentBytes),
    capabilities: [],
    exportName: CALL_EXPORT,
    serviceId,
    world: WORLD_NAME,
  }));
  const runtimeInvocationOwner = createRuntimeInvocationOwner(
    cellRuntime, {nodeId, onRunEntered});
  // The PRODUCTION factory: no callBindingRouteResolver injected — the
  // Phase-A self-default over the system table cache is what must route.
  const {runtimeServiceHandler} = RuntimeServiceHandlerSetup.create({
    cdcIntegrationService: {sqlQueryEngine},
    messageRouter,
    nodeId,
    partitionServicesProvider: () => localPartitionServices,
    serviceLifecycleManager: {},
    serviceRuntimeLifecycle: runtimeInvocationOwner.owner,
    systemTableCache,
  });
  runtimeServiceHandler.localReplicas.set(replicaId, {
    entityId: serviceId,
    replicaHandle: {serviceId},
    status: ReplicaStatus.ACTIVE,
  });
  return {cellRuntime, runtimeInvocationOwner, runtimeServiceHandler};
}

// Full two-node production composition shared by both tests in this
// file: routed shard table split across the nodes, registered
// coordination system tables in real SQLite, real handler-setup
// factories, and real WASI cell runtimes per node.
async function composeTwoNodeDeployment(testContext, options = {}) {
  const systemTableCache = new SystemTableCache();
  const partitionStores = createPartitionStores();
  const messageRouter = createSharedMessageRouter(partitionStores);
  const engine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    messageRouter,
    nodeId: NODE_A,
    systemCache: systemTableCache,
  });

  seedTableRouting(systemTableCache, DECLARED_TABLE,
    [PARTITION_ONE, PARTITION_TWO], {
      hostByPartition: {
        [PARTITION_ONE]: NODE_A,
        [PARTITION_TWO]: NODE_B,
      },
      rangeByPartition: {
        [PARTITION_ONE]: {end: '5', start: null},
        [PARTITION_TWO]: {end: null, start: '5'},
      },
    });
  seedTableRouting(systemTableCache, TABLES.CALL_CELL_REDUCE_SLOTS,
    [`${TABLES.CALL_CELL_REDUCE_SLOTS}-p1`],
    {primaryKey: 'invocation_id'});
  seedTableRouting(systemTableCache, TABLES.CALL_CELL_REDUCE_RESULTS,
    [`${TABLES.CALL_CELL_REDUCE_RESULTS}-p1`],
    {primaryKey: 'result_id'});

  const rows = createDeploymentRows();
  systemTableCache.applySystemTableChange(
    TABLES.SERVICE_BINDINGS,
    CDC_OPERATION.UPSERT,
    rows.bindingRow,
  );
  systemTableCache.applySystemTableChange(
    TABLES.SERVICE_DEFINITIONS,
    CDC_OPERATION.UPSERT,
    rows.definition,
  );
  const replicaByNode = {
    [NODE_A]: `${rows.serviceId}-r1`,
    [NODE_B]: `${rows.serviceId}-r2`,
  };
  for (const [nodeId, replicaId] of Object.entries(replicaByNode)) {
    systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        created_at: Date.now(),
        node_id: nodeId,
        service_id: replicaId,
        service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        status: ReplicaStatus.ACTIVE,
        updated_at: Date.now(),
      },
    );
  }

  const componentBytes = await componentizeFixtureGuest();
  const shardPartitionByNode = {
    [NODE_A]: PARTITION_ONE,
    [NODE_B]: PARTITION_TWO,
  };
  const nodes = {};
  for (const [nodeId, replicaId] of Object.entries(replicaByNode)) {
    const shardPartitionId = shardPartitionByNode[nodeId];
    const database = partitionStores.databases.get(shardPartitionId);
    nodes[nodeId] = await createNode({
      componentBytes,
      localPartitionServices: new Map([[shardPartitionId, {
        executeQuery: async (sql, params = []) => {
          const rowsRead = database.prepare(sql).all(...params);
          return {
            count: rowsRead.length,
            partitionId: shardPartitionId,
            rows: rowsRead,
            success: true,
          };
        },
        initialized: true,
        partitionId: shardPartitionId,
      }]]),
      messageRouter,
      nodeId,
      onRunEntered: options.onRunEntered,
      replicaId,
      serviceId: rows.serviceId,
      sqlQueryEngine: engine,
      systemTableCache,
    });
  }
  testContext.after(async () => {
    for (const node of Object.values(nodes)) {
      await node.cellRuntime.stop(rows.serviceId);
    }
    partitionStores.close();
    await engine.shutdown();
  });

  // The PRODUCTION assembly: the bootstrap attachment composes the
  // invoker onto the lifecycle command owner dependency slot.
  function attachInvoker(attachOptions = {}) {
    const serviceLifecycleCommandOwner = {};
    const invoker = attachCallCellInvoker({
      messageRouterProvider: () => messageRouter,
      onInvocationTelemetry: attachOptions.onInvocationTelemetry,
      serviceLifecycleCommandOwner,
      sqlQueryEngine: engine,
      systemTableCacheProvider: () => systemTableCache,
      tunables: {
        batchRowBound: BATCH_ROW_BOUND,
        emitBudget: EMIT_BUDGET,
        nestedCallBudget: NESTED_CALL_BUDGET,
        partialLimit: PARTIAL_LIMIT,
        reduceLeaseMs: REDUCE_LEASE_MS,
        slotCount: SLOT_COUNT,
        ...attachOptions.tunables,
      },
    });
    return {invoker, serviceLifecycleCommandOwner};
  }

  return {attachInvoker, engine, messageRouter, nodes, partitionStores,
    replicaByNode, rows, systemTableCache};
}

describe('minimal deployment call-cell production wiring', () => {
  it('spreads shard runs across two production-composed nodes and reduces ' +
    'exactly once on the reduce-lease holder', async (testContext) => {
    const {attachInvoker, messageRouter, nodes, partitionStores,
      replicaByNode} = await composeTwoNodeDeployment(testContext);
    const {invoker, serviceLifecycleCommandOwner} = attachInvoker();
    assert.equal(serviceLifecycleCommandOwner.callCellInvoker, invoker,
      'the command owner dependency is satisfied by the attachment');

    const resultJson = await invoker.invoke({
      name: CALL_SERVICE_NAME,
      argumentsJson: JSON.stringify({topN: TOP_N}),
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(resultJson, EXPECTED_RESULT_JSON,
      'the reduced top-N over both nodes matches the independently ' +
        'computed expectation');

    // Data-local placement: each shard run executed on the node hosting
    // its partition replica — driven by the partition topology, never by
    // hash luck.
    const runCounts = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) =>
        [nodeId, node.runtimeInvocationOwner.invocations.run.length]));
    assert.deepEqual(runCounts, {[NODE_A]: 1, [NODE_B]: 1},
      'each shard run executed on its partition host node');

    // The locality contract itself: no shard-table QUERY delivery ever
    // crossed the router — the shard rows were read by each host node's
    // own partition replica, so only INVOKE messages and coordination
    // SQL used the wire.
    const shardQueryDeliveries = messageRouter.partitionQueryDeliveries
      .filter((partitionId) => partitionId.startsWith(DECLARED_TABLE));
    assert.deepEqual(shardQueryDeliveries, [],
      'raw shard rows never left their host node before run');

    // Reduce exactly once, on the replica holding the reduce lease slot.
    const reduceCounts = Object.entries(nodes).map(([nodeId, node]) =>
      [nodeId, node.runtimeInvocationOwner.invocations.reduce.length]);
    assert.equal(
      reduceCounts.reduce((total, [, count]) => total + count, 0),
      1,
      'reduce executed exactly once across the deployment',
    );
    const slotsDb = partitionStores.databases.get(
      `${TABLES.CALL_CELL_REDUCE_SLOTS}-p1`);
    const slotRows = slotsDb
      .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_SLOTS} ` +
        'ORDER BY slot_id')
      .all();
    assert.equal(slotRows.length, 3,
      'two shard slots plus the dedicated reduce lease slot are seeded');
    const shardSlotRows = slotRows.filter(
      (row) => row.slot_id !== REDUCE_LEASE_SLOT_ID);
    assert.deepEqual(
      shardSlotRows.map((row) => row.replica_id).sort(),
      Object.values(replicaByNode).sort(),
      'each shard-owning replica published under its own slot lease',
    );
    assert.ok(
      shardSlotRows.every((row) => row.partial_json !== '[]'),
      'each shard slot carries its published emitted partial set',
    );
    const reduceLeaseRow = slotRows.find(
      (row) => row.slot_id === REDUCE_LEASE_SLOT_ID);
    const reducingNode = Object.entries(nodes).find(([, node]) =>
      node.runtimeInvocationOwner.invocations.reduce.length === 1)?.[0];
    assert.equal(
      reduceLeaseRow.replica_id,
      replicaByNode[reducingNode],
      'the replica that executed reduce holds the dedicated reduce lease',
    );

    // Exactly one atomically visible snapshot with the exact result and a
    // witness naming both shard replicas.
    const resultsDb = partitionStores.databases.get(
      `${TABLES.CALL_CELL_REDUCE_RESULTS}-p1`);
    const resultRows = resultsDb
      .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_RESULTS}`)
      .all();
    assert.equal(resultRows.length, 1, 'exactly one visible result row');
    assert.equal(resultRows[0].result_json, EXPECTED_RESULT_JSON);
    const witness = JSON.parse(resultRows[0].source_snapshot_json);
    assert.deepEqual(
      witness.slots.map((slot) => slot.replicaId).sort(),
      Object.values(replicaByNode).sort(),
      'the snapshot witness names both shard-owning replicas',
    );
  });

  it('overlaps shard runs across the two nodes under the bounded limit ' +
    'and returns the identical result serially and in parallel',
  async (testContext) => {
    // Cross-node rendezvous barrier: each node's run invocation parks
    // here until BOTH nodes have entered. Serial dispatch would deadlock
    // (the first run blocks the only in-flight slot), so completing the
    // invocation at all proves two run executions were genuinely in
    // flight at the same time on their partition-host nodes. The barrier
    // is armed only for the parallel invocation.
    const barrier = {armed: true, entered: [], releaseAll: null, waiters: []};
    const BARRIER_TIMEOUT_MS = 15000;
    const onRunEntered = async (nodeId) => {
      if (!barrier.armed) return;
      barrier.entered.push(nodeId);
      if (barrier.entered.length >= 2) {
        for (const release of barrier.waiters) release();
        barrier.waiters = [];
        return;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(
            'no overlap: the second shard run never entered while the ' +
            'first was parked — dispatch is not parallel'));
        }, BARRIER_TIMEOUT_MS);
        timer.unref?.();
        barrier.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    const {attachInvoker, messageRouter, nodes, partitionStores} =
      await composeTwoNodeDeployment(testContext, {onRunEntered});

    const telemetryRecords = [];
    const PARALLEL_LIMIT = 2;
    const {invoker: parallelInvoker} = attachInvoker({
      onInvocationTelemetry: (record) => telemetryRecords.push(record),
      tunables: {maxConcurrentShardRuns: PARALLEL_LIMIT},
    });
    const parallelResult = await parallelInvoker.invoke({
      argumentsJson: JSON.stringify({topN: TOP_N}),
      name: CALL_SERVICE_NAME,
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(parallelResult, EXPECTED_RESULT_JSON,
      'the parallel invocation reduces to the expected result');
    assert.deepEqual([...barrier.entered].sort(), [NODE_A, NODE_B].sort(),
      'both partition-host nodes entered run while the barrier held — ' +
        'two run executions overlapped in time');
    assert.equal(telemetryRecords.length, 1);
    assert.equal(telemetryRecords[0].configuredConcurrency, PARALLEL_LIMIT);
    assert.equal(telemetryRecords[0].peakConcurrentShardRuns,
      PARALLEL_LIMIT,
      'peak concurrency reached, and never exceeded, the configured limit');
    assert.equal(telemetryRecords[0].selectedPartitionCount, 2);

    // Locality is preserved under parallel dispatch: one run per
    // partition-host node and zero shard-table deliveries on the wire.
    const runCounts = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) =>
        [nodeId, node.runtimeInvocationOwner.invocations.run.length]));
    assert.deepEqual(runCounts, {[NODE_A]: 1, [NODE_B]: 1},
      'each shard run executed on its partition host node');
    assert.deepEqual(
      messageRouter.partitionQueryDeliveries
        .filter((partitionId) => partitionId.startsWith(DECLARED_TABLE)),
      [],
      'raw shard rows never left their host node before run',
    );

    // Serial/parallel identity: the same deployment invoked with the
    // limit forced to 1 (barrier disarmed) returns the identical result.
    barrier.armed = false;
    const {invoker: serialInvoker} = attachInvoker({
      tunables: {maxConcurrentShardRuns: 1},
    });
    const serialResult = await serialInvoker.invoke({
      argumentsJson: JSON.stringify({topN: TOP_N}),
      name: CALL_SERVICE_NAME,
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(serialResult, parallelResult,
      'serial and parallel dispatch return the identical result for the ' +
        'same invocation');

    // Exactly one visible snapshot per invocation, both carrying the
    // identical reduced result.
    const resultsDb = partitionStores.databases.get(
      `${TABLES.CALL_CELL_REDUCE_RESULTS}-p1`);
    const resultRows = resultsDb
      .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_RESULTS}`)
      .all();
    assert.equal(resultRows.length, 2,
      'one visible result row per completed invocation');
    assert.ok(
      resultRows.every((row) => row.result_json === EXPECTED_RESULT_JSON),
      'every visible snapshot carries the identical reduced result',
    );
  });
});
