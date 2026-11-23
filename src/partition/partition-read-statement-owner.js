import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';

const MAX_PREPARED_STATEMENTS_PER_DB = 64;

function resetStatementModes(statement) {
  if (statement.reader !== false) {
    statement.raw?.(false);
  }
  statement.safeIntegers?.(false);
  return statement;
}

/**
 * Retain a bounded per-connection LRU of prepared SQL statements through the
 * connection's state owner. Control-plane reads and writes repeat a small set
 * of parameterized SQL templates per partition connection; SQLite recompiles
 * held statements automatically on schema changes.
 *
 * @param {Object} database - SQLite-compatible database handle.
 * @param {string} sql - Exact SQL statement text.
 * @return {Object} Prepared SQLite statement.
 */
function preparePartitionReadStatement(database, sql) {
  const statement = database?.open === true ?
    sqliteConnectionState(database).boundedStatement(
      sql, MAX_PREPARED_STATEMENTS_PER_DB,
    ) :
    database.prepare(sql);
  return resetStatementModes(statement);
}

export {preparePartitionReadStatement};
