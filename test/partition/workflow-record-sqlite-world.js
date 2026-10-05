/**
 * A REAL system-table store for the workflow-record ownership witnesses
 * (owner ruling 2026-10-05: the loser of two genuine concurrent owners can
 * never regress a durable fact; the compare-and-swap is never stubbed).
 *
 * Every owner writes through its own PRODUCTION CDCIntegrationService and
 * PRODUCTION control-plane system-table gateway (the workflow's own
 * getControlPlaneSystemTableGateway builds it over that CDC service). The
 * CDC service builds the SQL (UPDATE ... SET ... WHERE table_id = ? AND
 * partition_transition_metadata = ? AND partition_transition_state = ?) and
 * hands it to its SQL engine; here the engine runs the statement on one
 * shared better-sqlite3 database holding the PRODUCTION `tables` and
 * `partitions` schemas - exactly what a partition replica's committed-entry
 * application does (db.prepare(sql).run(params), answering `changes`). The
 * WHERE clause is therefore evaluated by SQLite at apply time against the
 * authoritative row, never by the test.
 *
 * Each owner reads the record through its own view: the live row, or a
 * snapshot the test freezes (a lagging control-plane cache).
 */
import Database from 'better-sqlite3';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  PARTITIONS_SCHEMA,
  TABLES_SCHEMA,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const SELECT = 'SELECT';
const LOST_ACK = 'replicated write applied; its acknowledgement was lost';

function parsePartitionTransition(tableInfo) {
  const state = tableInfo?.partition_transition_state ?? null;
  const raw = tableInfo?.partition_transition_metadata ?? null;
  if (!state || !raw) return null;
  try {
    return {state, metadata: typeof raw === 'string' ? JSON.parse(raw) : raw};
  } catch {
    return null;
  }
}

/**
 * @param {Object} [options]
 * @param {string} [options.tableId]
 * @param {string} [options.tableName]
 * @param {Array<Object>} [options.partitions] - Initial partitions rows.
 * @return {Object} The store.
 */
function openRecordStore({tableId = 'tbl-users', tableName = 'users',
  partitions = []} = {}) {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(TABLES_SCHEMA));
  db.exec(generateCreateTableSQL(PARTITIONS_SCHEMA));
  db.prepare('INSERT INTO tables (table_id, table_name, schema_definition, ' +
    'partition_key, partition_count, active_partition_version, created_at, ' +
    'updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tableId, tableName, '{}', 'id', partitions.length || 1, 1, 1, 1);
  const store = {db, tableId, writes: [], lostAcks: []};
  const insertPartition = db.prepare('INSERT INTO partitions ' +
    '(partition_id, table_id, table_name, partition_key_start, ' +
    'partition_key_end, partition_version, replica_count, size_bytes, ' +
    'leader_node_id, state, created_at, updated_at) VALUES ' +
    '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of partitions) {
    insertPartition.run(row.partition_id, tableId, tableName,
      row.partition_key_start ?? null, row.partition_key_end ?? null,
      row.partition_version ?? 1, row.replica_count ?? 3,
      row.size_bytes ?? 128, row.leader_node_id ?? 'node-a', 'NORMAL', 1, 1);
  }
  store.tablesRow = () => ({...db.prepare(
    'SELECT * FROM tables WHERE table_id = ?').get(tableId)});
  store.partitionRow = (partitionId) => {
    const row = db.prepare('SELECT * FROM partitions WHERE partition_id = ?')
      .get(partitionId);
    return row ? {...row} : null;
  };
  store.partitionIds = () => db.prepare(
    'SELECT partition_id FROM partitions ORDER BY partition_id').all()
    .map((row) => row.partition_id);
  store.metadata = () => JSON.parse(
    store.tablesRow().partition_transition_metadata || '{}');
  // The next write matching `predicate` applies but answers a failure.
  store.loseAckOnce = (predicate) => store.lostAcks.push(predicate);
  // One PRODUCTION CDC service per owner (each node has its own), all on
  // the one authoritative database.
  store.cdcFor = (writer) => {
    const engine = {
      async executeQuery(sql, params = []) {
        await new Promise((resolve) => setImmediate(resolve));
        if (sql.trim().toUpperCase().startsWith(SELECT)) {
          return {success: true, rows: db.prepare(sql).all(...params)};
        }
        const info = db.prepare(sql).run(...params);
        store.writes.push({writer, sql, params, changes: info.changes});
        const lost = store.lostAcks.findIndex((predicate) =>
          predicate({writer, sql, params, changes: info.changes}));
        if (lost >= 0) {
          store.lostAcks.splice(lost, 1);
          throw new Error(LOST_ACK);
        }
        return {success: true, affectedRows: info.changes, rows: []};
      },
    };
    const cdc = new CDCIntegrationService({nodeId: writer,
      sqlQueryEngine: engine});
    cdc.initialize();
    cdc.logger = QUIET;
    return cdc;
  };
  store.tablesWritesBy = (writer) => store.writes.filter((write) =>
    write.writer === writer && /^UPDATE tables/u.test(write.sql));
  store.partitionDeletesBy = (writer) => store.writes.filter((write) =>
    write.writer === writer && /^DELETE FROM partitions/u.test(write.sql) &&
    write.changes > 0).map((write) => write.params.at(-1));
  return store;
}

/**
 * One owner's view of the record: live, or frozen at a snapshot.
 * @param {Object} store
 * @return {Object} {row(), list(), freeze(row?), thaw()}.
 */
function openView(store) {
  let frozen = null;
  return {
    row: () => frozen ?? store.tablesRow(),
    list: () => [frozen ?? store.tablesRow()],
    freeze: (row = store.tablesRow()) => {
      frozen = {...row};
    },
    thaw: () => {
      frozen = null;
    },
  };
}

/**
 * Give one owner the authoritative read of the record (what an owner-RPC
 * read of the `tables` partition answers: the store's own row).
 * @param {Object} workflow - The workflow owner.
 * @param {Object} store
 * @return {void}
 */
function readAuthoritativelyFrom(workflow, store) {
  workflow.readAuthoritativeWorkflowRecord = async () => store.tablesRow();
}

// A logger whose lines are kept by level.
function recordingLogger() {
  const lines = [];
  const sink = (level) => (message, fields) =>
    lines.push({level, message, fields});
  return {lines, logger: {debug() {}, info: sink('info'),
    warn: sink('warn'), error: sink('error')}};
}

async function turns(count = 50) {
  for (let turn = 0; turn < count; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

export {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  recordingLogger,
  turns,
};
