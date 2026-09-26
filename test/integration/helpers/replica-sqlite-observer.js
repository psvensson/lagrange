// Direct, read-only observation of partition replica SQLite files.
//
// A routed read answers from whichever replica the router picks, so it cannot
// say which replicas hold a row. This helper opens EVERY replica file a node
// keeps under `<dataDir>/partitions/<partitionId>/<replicaId>.db` (the layout
// owned by src/storage/data-directory-manager.js getPartitionDbPath) with a
// read-only connection and reports, per replica: which of the named ids are
// in the table, the participant commit-outcome rows (_transaction_outcomes,
// written by the partition transaction owner), and the Raft log entries that
// mention the ids or carry a transaction marker (_raft_log, same file). It is
// an observer only: it never writes, and a file it cannot read is reported,
// not skipped.

import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {STORAGE_DEFAULT} from '../../../src/storage/storage-constants.js';

const OBSERVER_SQL = Object.freeze({
  HAS_TABLE:
    'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
  TABLES: 'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name',
  OUTCOMES:
    'SELECT session_id, transaction_epoch, outcome, updated_at ' +
    'FROM _transaction_outcomes ORDER BY updated_at',
  RAFT_LOG_BOUNDS:
    'SELECT MIN(log_index) AS first, MAX(log_index) AS last, ' +
    'COUNT(*) AS entries FROM _raft_log',
  RAFT_LOG_MATCH:
    'SELECT log_index, term, command FROM _raft_log ' +
    'WHERE command LIKE ? ORDER BY log_index',
});
const OBSERVER_TABLE = Object.freeze({
  OUTCOMES: '_transaction_outcomes',
  RAFT_LOG: '_raft_log',
});
const OPEN_READ_ONLY = Object.freeze({readonly: true, fileMustExist: true});
const MAX_SEARCH_DEPTH = 4;
const LIKE_ANY = '%';
const QUOTE = '"';

function findPartitionDirectories(root, depth = 0) {
  if (depth > MAX_SEARCH_DEPTH || !existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    if (entry.name === STORAGE_DEFAULT.PARTITIONS_DIRNAME) {
      found.push(path);
    } else {
      found.push(...findPartitionDirectories(path, depth + 1));
    }
  }
  return found;
}

/**
 * Every replica file one node keeps, as the storage layout names it.
 * @param {{nodeId: string, dataDir: string}} node
 * @return {Array<{nodeId: string, partitionId: string, replicaId: string,
 *   path: string}>}
 */
function listReplicaFiles(node) {
  const files = [];
  for (const partitionsDir of findPartitionDirectories(node.dataDir)) {
    for (const partition of readdirSync(partitionsDir, {withFileTypes: true})) {
      if (!partition.isDirectory()) continue;
      const partitionDir = join(partitionsDir, partition.name);
      for (const file of readdirSync(partitionDir)) {
        if (!file.endsWith(STORAGE_DEFAULT.DB_EXT)) continue;
        files.push({
          nodeId: node.nodeId,
          partitionId: partition.name,
          replicaId: file.slice(0, -STORAGE_DEFAULT.DB_EXT.length),
          path: join(partitionDir, file),
        });
      }
    }
  }
  return files;
}

function tableExists(db, name) {
  return Boolean(db.prepare(OBSERVER_SQL.HAS_TABLE).get(name));
}

const LOG_ENTRY_FIELDS = Object.freeze(
  ['type', 'sessionId', 'sql', 'params', 'proposedBy']);

function parseCommand(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeLogEntry(row) {
  const command = parseCommand(row.command);
  const summary = {logIndex: row.log_index, term: row.term,
    unparsed: command === null};
  for (const field of LOG_ENTRY_FIELDS) summary[field] = command?.[field];
  if (Array.isArray(command?.operations)) {
    summary.operationCount = command.operations.length;
    summary.operationParams = command.operations.map((op) => op?.params);
  }
  return summary;
}

function matchLog(db, needle) {
  return db.prepare(OBSERVER_SQL.RAFT_LOG_MATCH)
    .all(`${LIKE_ANY}${needle}${LIKE_ANY}`)
    .map(summarizeLogEntry);
}

/**
 * Read one replica file: row presence for `ids` in `tableName`, the commit
 * outcome rows, and the Raft log entries naming an id or a marker type.
 * @param {{path: string}} file
 * @param {{tableName: string, ids: string[], markerTypes?: string[]}} query
 * @return {object}
 */
function observeReplicaFile(file, {tableName, ids, markerTypes = []}) {
  let db;
  try {
    db = new Database(file.path, OPEN_READ_ONLY);
    if (!tableExists(db, tableName)) {
      return {...file, hasTable: false,
        tables: db.prepare(OBSERVER_SQL.TABLES).all().map((row) => row.name)};
    }
    const select = db.prepare(
      `SELECT COUNT(*) AS count FROM "${tableName}" WHERE id = ?`);
    const rows = Object.fromEntries(ids.map((id) => [id, select.get(id).count]));
    const outcomes = tableExists(db, OBSERVER_TABLE.OUTCOMES) ?
      db.prepare(OBSERVER_SQL.OUTCOMES).all() : null;
    let raftLog = null;
    if (tableExists(db, OBSERVER_TABLE.RAFT_LOG)) {
      raftLog = {
        bounds: db.prepare(OBSERVER_SQL.RAFT_LOG_BOUNDS).get(),
        byId: Object.fromEntries(ids.map((id) =>
          [id, matchLog(db, `${QUOTE}${id}${QUOTE}`)])),
        byMarker: Object.fromEntries(markerTypes.map((type) =>
          [type, matchLog(db, `${QUOTE}${type}${QUOTE}`)])),
      };
    }
    return {...file, hasTable: true, rows, outcomes, raftLog};
  } catch (error) {
    return {...file, observationError: error.message};
  } finally {
    db?.close();
  }
}

/**
 * Observe every replica file of every node that holds `tableName`.
 * @param {Array<{nodeId: string, dataDir: string}>} nodes
 * @param {{tableName: string, ids: string[], markerTypes?: string[]}} query
 * @return {object[]} one observation per replica file holding the table
 */
function observeTableReplicas(nodes, query) {
  return nodes.flatMap(listReplicaFiles)
    .map((file) => observeReplicaFile(file, query))
    .filter((observation) =>
      observation.hasTable === true || observation.observationError);
}

export {listReplicaFiles, observeReplicaFile, observeTableReplicas};
