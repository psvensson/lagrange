/**
 * Observed-columns marking (quest system-table-row-decoders, lead ruling
 * RD-1/RD-2 2026-11-09): a partial row stored for a key the cache does not
 * hold, carrying no declared seed projection, is marked with the cache's
 * observed-columns projection in the one seed_projection marker, so the
 * decoders give ROW_NOT_OBSERVED for every other column (as for a declared
 * seed) and the readers keep HEAD's answers; each marking is counted by the
 * cache's named diagnostic. Without the marking (mutation) the RD-1 rows are
 * decoder refusals.
 */
import Database from 'better-sqlite3';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {
  CACHE_LOG_MSG,
  SYSTEM_TABLE_CACHE_DECODED_TABLES,
  SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
  SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD,
} from '../../src/cache/cache-constants.js';
import {
  NODES_SCHEMA,
  REPLICA_OPERATIONS_SCHEMA,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  extractParamUpdateData,
  fetchUpdatedRow,
} from '../../src/partition/partition-cdc-parameterized-sql.js';
import {
  decodeNodesRow,
  defineNodesProjection,
} from '../../src/control-plane/nodes-row-decoder.js';
import {
  decodeServicesRow,
  defineServicesProjection,
} from '../../src/control-plane/services-row-decoder.js';
import {
  REPLICA_OPERATIONS_ROW_STATUS,
  decodeReplicaOperationsRow,
  defineReplicaOperationsProjection,
} from '../../src/rebalancer/replica-operations-row-decoder.js';
import {
  ROW_ABSENT,
  ROW_NOT_OBSERVED,
  SYSTEM_TABLE_ROW_DECODE_REFUSAL,
  SystemTableRowDecodeError,
} from '../../src/control-plane/system-table-row-decoding.js';
import {
  buildBootstrapTopologySnapshotEnvelope,
} from '../../src/bootstrap/bootstrap-topology-snapshot.js';
import {ReplicaOperationRepository, SQL} from '../../src/rebalancer/replica-operation-repository.js';
import {
  assignReplicaHandlerCreateStatusMethods,
} from '../../src/node/replica-handler-create-status-methods.js';
import {projectReplicaFromServicesRow} from '../../src/rebalancer/projected-replica.js';
import {isVoterRaftRole} from '../../src/raft/replica-voter-readiness.js';
import {nodesRow, replicaOperationsRow, servicesRow} from '../test-helpers/system-table-row-fixture.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

function refusalReason(fn) {
  try {
    fn();
  } catch (error) {
    if (error instanceof SystemTableRowDecodeError) return error.reason;
    throw error;
  }
  return null;
}

// The CDC payload of a guarded UPDATE as the partition CDC path builds it:
// the statement runs on a real SQLite table, the read-back by the WHERE
// columns misses (the update changed a guard column), so the payload is the
// SET and WHERE columns (extractParamUpdateData).
function guardedUpdatePayload(schema, storedRow, sql, params) {
  const db = new Database(':memory:');
  try {
    db.exec(generateCreateTableSQL(schema));
    const columns = Object.keys(storedRow);
    db.prepare(`INSERT INTO ${schema.tableName} (${columns.join(', ')}) ` +
      `VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((column) => storedRow[column]));
    db.prepare(sql).run(...params);
    return extractParamUpdateData({sql, params, tableName: schema.tableName,
      logger: QUIET_LOGGER,
      fetchUpdatedRow: (tableName, whereClause) =>
        fetchUpdatedRow({tableName, whereClause, db, logger: QUIET_LOGGER})});
  } finally {
    db.close();
  }
}

// node-lifecycle-publication.js applyPublication: SET the lifecycle update,
// WHERE the source predicate (node_id, boot_incarnation, status,
// connection_state, last_heartbeat, created_at).
const NODE_LIFECYCLE_SET = ['node_address', 'connection_state', 'last_heartbeat',
  'ready_lease_expires_at', 'boot_incarnation'];
const NODE_LIFECYCLE_WHERE = ['node_id', 'boot_incarnation', 'status', 'connection_state',
  'last_heartbeat', 'created_at'];

function nodeLifecyclePayload({promoteToReady}) {
  const source = nodesRow({node_id: 'node-joiner', status: 'joining',
    connection_state: 'connected', last_heartbeat: 10, boot_incarnation: 3});
  const update = {node_address: source.node_address,
    connection_state: promoteToReady ? 'ready' : 'connected', last_heartbeat: 20,
    ready_lease_expires_at: 5000, boot_incarnation: 3,
    ...(promoteToReady ? {status: 'active'} : {})};
  const set = [...NODE_LIFECYCLE_SET, ...(promoteToReady ? ['status'] : [])];
  const sql = `UPDATE nodes SET ${set.map((column) => `${column} = ?`).join(', ')} ` +
    `WHERE ${NODE_LIFECYCLE_WHERE.map((column) => `${column} = ?`).join(' AND ')}`;
  return guardedUpdatePayload(NODES_SCHEMA, source, sql,
    [...set.map((column) => update[column]),
      ...NODE_LIFECYCLE_WHERE.map((column) => source[column])]);
}

// replica-operation-repository UPDATE_OPERATION_EXPECTING_STEP (the CAS on
// workflow_step, which the same statement SETs).
function expectingStepPayload() {
  const stored = replicaOperationsRow({operation_id: 'op-1',
    status: REPLICA_OPERATIONS_ROW_STATUS.PENDING, workflow_step: WORKFLOW_STEP.PENDING});
  return guardedUpdatePayload(REPLICA_OPERATIONS_SCHEMA, stored,
    SQL.UPDATE_OPERATION_EXPECTING_STEP,
    [REPLICA_OPERATIONS_ROW_STATUS.CREATING, WORKFLOW_STEP.CREATING, 2, null, null, '[]',
      'replica-1', 'op-1', WORKFLOW_STEP.PENDING]);
}

function cachedAfterUpdate(tableName, payload, key, cache = new SystemTableCache()) {
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, payload);
  return {cache, row: cache.get(tableName, key)};
}

function rowToOperation(row) {
  return Object.create(ReplicaOperationRepository.prototype).rowToOperation(row);
}

function thrownCode(fn) {
  try {
    fn();
  } catch (error) {
    return error.code ?? error.name;
  }
  return null;
}

test('RD-1 nodes: the guarded lifecycle UPDATE payload is marked with its observed columns',
  async (t) => {
    const payload = nodeLifecyclePayload({promoteToReady: false});
    t.notOk(Object.hasOwn(payload, 'latency_group_id'), 'the read-back missed: a partial payload');
    const {cache, row} = cachedAfterUpdate(TABLES.NODES, payload, 'node-joiner');
    t.same(row[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD], {table: TABLES.NODES,
      name: SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
      columns: NODES_SCHEMA.columns.map((column) => column.name)
        .filter((column) => Object.hasOwn(payload, column))},
    'exactly the observed columns, in the one marker field');
    const decoded = decodeNodesRow(row);
    t.equal(decoded.connectionState, 'connected');
    t.equal(decoded.status, 'joining', 'the WHERE value of an unSET guard column is observed');
    t.equal(decoded.readyLeaseExpiresAt, 5000);
    for (const field of ['latencyGroupId', 'cpuCores', 'storageBudgetBytes', 'capabilities']) {
      t.equal(decoded[field], ROW_NOT_OBSERVED, `${field} was never observed`);
    }
    t.equal(cache.getObservedColumnsMarkCount(TABLES.NODES), 1, 'the marking is counted');
  });

test('RD-1 nodes reader: the bootstrap topology active set keeps HEAD\'s answer', async (t) => {
  for (const [promoteToReady, expected] of [[false, []], [true, ['node-joiner']]]) {
    const {cache} = cachedAfterUpdate(TABLES.NODES, nodeLifecyclePayload({promoteToReady}),
      'node-joiner');
    const envelope = buildBootstrapTopologySnapshotEnvelope({systemTableCache: cache,
      hydrationTables: [TABLES.NODES], now: () => 1});
    t.same(envelope.topologySnapshotMeta.activeNodeIds, expected,
      `promoteToReady=${promoteToReady}: active exactly when the observed status is active`);
  }
});

test('RD-1 replica_operations: the expecting-step payload decodes; rowToOperation keeps HEAD',
  async (t) => {
    const payload = expectingStepPayload();
    t.notOk(Object.hasOwn(payload, 'entity_type'), 'the read-back missed: a partial payload');
    const {cache, row} = cachedAfterUpdate(TABLES.REPLICA_OPERATIONS, payload, 'op-1');
    const decoded = decodeReplicaOperationsRow(row);
    t.equal(decoded.workflowStep, WORKFLOW_STEP.CREATING);
    t.equal(decoded.status, REPLICA_OPERATIONS_ROW_STATUS.CREATING);
    t.equal(decoded.completedAt, ROW_ABSENT, 'a SET NULL is a stored NULL');
    t.equal(decoded.entityType, ROW_NOT_OBSERVED);
    t.equal(decoded.createdAt, ROW_NOT_OBSERVED);
    t.equal(thrownCode(() => rowToOperation(row)), 'UNSUPPORTED_REBALANCER_ENTITY_TYPE',
      'HEAD\'s answer: the identity assertion refuses the row without an entity type');
    t.equal(cache.getObservedColumnsMarkCount(TABLES.REPLICA_OPERATIONS), 1);
  });

// seedLocalReplicaVoterRaftRole reads the held row, then UPSERTs
// {service_id, raft_role}; the row is deleted in between.
test('RD-2: the voter raft-role row of the get-then-UPSERT race is marked', async (t) => {
  const cache = new SystemTableCache();
  class Handler {}
  assignReplicaHandlerCreateStatusMethods(Handler);
  const handler = new Handler();
  handler.systemTableCache = {
    get: () => servicesRow({service_id: 'replica-1'}),
    applySystemTableChange: (...args) => cache.applySystemTableChange(...args),
  };
  handler.getTrackedReplicaRole = () => 'follower';
  handler.replicaStateMachine = null;
  t.equal(handler.seedLocalReplicaVoterRaftRole('replica-1'), true);
  const row = cache.get(TABLES.SERVICES, 'replica-1');
  t.same(row[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD], {table: TABLES.SERVICES,
    name: SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
    columns: ['service_id', 'raft_role']});
  const decoded = decodeServicesRow(row);
  t.equal(decoded.raftRole, 'follower');
  t.equal(decoded.status, ROW_NOT_OBSERVED);
  t.equal(isVoterRaftRole(decoded.raftRole), true);
  const replica = projectReplicaFromServicesRow(decoded);
  t.equal(replica.replicaId, 'replica-1', 'replica id from the service id, as at HEAD');
  for (const field of ['partitionId', 'nodeId', 'groupId']) {
    t.equal(replica[field], ROW_ABSENT, `${field}: HEAD read the missing column as NULL`);
  }
  t.equal(cache.getObservedColumnsMarkCount(TABLES.SERVICES), 1);
});

test('the diagnostic counts only unheld partial unmarked rows of decoded tables',
  async (t) => {
    const cache = new SystemTableCache();
    const readOnly = createReadOnlyCache(cache);
    const warned = [];
    cache.logger = {...cache.logger, debug() {}, warn: (message, fields) =>
      warned.push({message, ...fields})};
    for (const operation of [CDC_OPERATIONS.INSERT, CDC_OPERATIONS.UPDATE,
      CDC_OPERATIONS.UPSERT]) {
      cache.applySystemTableChange(TABLES.NODES, operation,
        {node_id: `partial-${operation}`, status: 'joining'});
    }
    t.equal(readOnly.getObservedColumnsMarkCount(TABLES.NODES), 3,
      'one per partial store of an unheld key, readable through the read-only cache');
    t.same(warned.map((event) => [event.message, event.markCount, event.observedColumns]), [
      [CACHE_LOG_MSG.PARTIAL_ROW_MARKED_OBSERVED_COLUMNS, 1, ['node_id', 'status']],
      [CACHE_LOG_MSG.PARTIAL_ROW_MARKED_OBSERVED_COLUMNS, 2, ['node_id', 'status']],
    ], 'logged with the running count at 1, 2, 4, ... (bounded, never silent)');
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE,
      {node_id: 'partial-UPDATE', connection_state: 'ready'});
    t.equal(cache.getObservedColumnsMarkCount(TABLES.NODES), 3, 'a merge is untouched');
    t.same(cache.get(TABLES.NODES, 'partial-UPDATE')[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]
      .columns, ['node_id', 'status'], 'the merge leaves the marker as it was');
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, nodesRow({node_id: 'full'}));
    t.notOk(Object.hasOwn(cache.get(TABLES.NODES, 'full'), SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD),
      'a full row is not marked');
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATIONS.UPSERT,
      {partition_id: 'p-1'});
    t.notOk(Object.hasOwn(cache.get(TABLES.PARTITIONS, 'p-1'),
      SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD), 'a table no decoder reads is stored as written');
    t.equal(cache.getObservedColumnsMarkCount(TABLES.PARTITIONS), 0);
    t.equal(cache.getObservedColumnsMarkCount(TABLES.NODES), 3);
  });

test('a declared seed projection is never replaced; the drop rule applies to both', async (t) => {
  const cache = new SystemTableCache();
  const declared = defineNodesProjection('test_declared_seed', ['node_id', 'status']);
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT, {node_id: 'seeded',
    status: 'joining', [SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: {table: TABLES.NODES,
      name: declared.name, columns: [...declared.columns]}});
  t.equal(cache.get(TABLES.NODES, 'seeded')[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD].name,
    'test_declared_seed');
  t.equal(cache.getObservedColumnsMarkCount(TABLES.NODES), 0, 'a declared seed is not counted');
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE, {node_id: 'observed',
    status: 'joining'});
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE, nodesRow({node_id: 'observed'}));
  t.same(cache.get(TABLES.NODES, 'observed'), nodesRow({node_id: 'observed'}),
    'every column observed: the observed-columns marker goes as a declared one does');
});

test('INSERT notifies the marked row, never the stored object', async (t) => {
  const cache = new SystemTableCache();
  const notified = [];
  cache.onCacheApplyChange((_table, _operation, record) => notified.push(record));
  const data = {node_id: 'n-1', status: 'joining'};
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.INSERT, data);
  t.equal(decodeNodesRow(notified[0]).cpuCores, ROW_NOT_OBSERVED,
    'the notification decodes as the stored row does');
  t.notOk(Object.hasOwn(data, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD),
    'the caller\'s data is not mutated');
});

test('the marked tables are exactly the decoders\' tables', async (t) => {
  t.same([...SYSTEM_TABLE_CACHE_DECODED_TABLES].sort(), [
    defineNodesProjection('t', ['node_id']).table,
    defineServicesProjection('t', ['service_id']).table,
    defineReplicaOperationsProjection('t', ['operation_id']).table,
  ].sort());
});

test('an unmarked partial row remains a refusal (the marking is what decodes RD-1)',
  async (t) => {
    const {[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD]: _marker, ...unmarked} =
      cachedAfterUpdate(TABLES.NODES, nodeLifecyclePayload({promoteToReady: false}),
        'node-joiner').row;
    t.equal(refusalReason(() => decodeNodesRow(unmarked)),
      SYSTEM_TABLE_ROW_DECODE_REFUSAL.MISSING_COLUMN);
  });

// Round-4 ruling N3: an INSERT that replaces a held row stores its data
// exactly as written, so a partial payload (the CDC INSERT parameter
// fallback) is marked like a partial row for an unheld key: the readers
// read its missing columns as HEAD read the missing keys. A merge onto a
// held row (UPDATE / UPSERT) is never marked.
test('N3: an INSERT replacing a held row with a partial payload is marked; a merge is not',
  async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.INSERT,
      nodesRow({node_id: 'held'}));
    t.notOk(Object.hasOwn(cache.get(TABLES.NODES, 'held'),
      SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD), 'the full held row is unmarked');
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE,
      {node_id: 'held', connection_state: 'ready'});
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPSERT,
      {node_id: 'held', status: 'active'});
    t.notOk(Object.hasOwn(cache.get(TABLES.NODES, 'held'),
      SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD), 'partial merges onto the held row stay unmarked');
    t.equal(cache.getObservedColumnsMarkCount(TABLES.NODES), 0);
    const notified = [];
    cache.onCacheApplyChange((_table, _operation, record) => notified.push(record));
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.INSERT,
      {node_id: 'held', status: 'joining', connection_state: 'connected'});
    const stored = cache.get(TABLES.NODES, 'held');
    t.same(stored[SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD], {table: TABLES.NODES,
      name: SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME,
      columns: ['node_id', 'status', 'connection_state']},
    'the replacement is marked with exactly its observed columns');
    t.equal(cache.getObservedColumnsMarkCount(TABLES.NODES), 1, 'counted');
    const decoded = decodeNodesRow(stored);
    t.equal(decoded.status, 'joining');
    t.equal(decoded.cpuCores, ROW_NOT_OBSERVED, 'a replaced-away column was never observed');
    t.equal(decodeNodesRow(notified[0]).cpuCores, ROW_NOT_OBSERVED,
      'the notification decodes as the stored row does');
  });

// Round-4 ruling N4: the marker is no field of the row, so a marked partial
// row ranks by the columns it carries against an authoritative row
// (mergePlanningEvidenceRows' version-then-field-count order), as the
// unmarked partial row did at HEAD.
test('N4: the planning-evidence field count excludes the marker', async (t) => {
  const {countPlanningEvidenceRowFields, mergePlanningEvidenceRows} =
    await import('../../src/control-plane/membership-publication-planning-evidence.js');
  const full = nodesRow({node_id: 'n-9'});
  const {cpu_cores: _dropped, ...partial} = full;
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE, partial);
  const marked = cache.get(TABLES.NODES, 'n-9');
  t.ok(Object.hasOwn(marked, SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD), 'the row is marked');
  t.equal(countPlanningEvidenceRowFields(marked), countPlanningEvidenceRowFields(partial),
    'the marked row counts the columns it carries');
  t.equal(countPlanningEvidenceRowFields(marked), countPlanningEvidenceRowFields(full) - 1);
  const merged = mergePlanningEvidenceRows(TABLES.NODES, [full], [marked]);
  t.same(merged, [full], 'the full authoritative row wins the field-count tiebreak, as at HEAD');
});
