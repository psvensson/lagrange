/**
 * Durable SQLite store for participant locking-read reservations
 * (_lagrange_locking_read_reservations).
 *
 * Fail-closed contract: SQLite read/write failures never degrade into "no conflict"
 * or silent acceptance; they surface explicit error descriptors so callers fail closed.
 *
 * @module partition/partition-locking-read-store
 */

import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';

const RESERVATION_TABLE_NAME = '_lagrange_locking_read_reservations';
const STORE_UNAVAILABLE_MSG = 'Partition database is closed or unavailable';
const RELEASE_ERROR_MSG = Object.freeze({
  TX: 'Failed to release transaction reservations',
  PARTITION_TX: 'Failed to release partition transaction reservations',
  SESSION: 'Failed to release session reservations',
  PARTITION_SESSION: 'Failed to release partition session reservations',
});

const RESERVATION_SQL = Object.freeze({
  DDL: `
    CREATE TABLE IF NOT EXISTS _lagrange_locking_read_reservations (
      partition_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_key TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      session_id TEXT,
      epoch INTEGER DEFAULT 0,
      reserved_at INTEGER NOT NULL,
      expires_at INTEGER,
      PRIMARY KEY (partition_id, table_name, row_key)
    );
    CREATE INDEX IF NOT EXISTS idx_lagrange_locking_tx
      ON _lagrange_locking_read_reservations (transaction_id);
    CREATE INDEX IF NOT EXISTS idx_lagrange_locking_session
      ON _lagrange_locking_read_reservations (session_id);
  `,
  CHECK_TABLE_EXISTS:
    'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' AND name = ?',
  SELECT_ROW:
    'SELECT transaction_id, expires_at FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND table_name = ? AND row_key = ?',
  SELECT_TABLE_OTHER_TX:
    'SELECT row_key, transaction_id, expires_at FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND table_name = ? AND transaction_id != ?',
  SELECT_TABLE_ALL:
    'SELECT row_key, transaction_id, expires_at FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND table_name = ?',
  SELECT_TX_EXISTS:
    'SELECT 1 AS held FROM _lagrange_locking_read_reservations WHERE transaction_id = ? LIMIT 1',
  SELECT_PARTITION_TX_EXISTS:
    'SELECT 1 AS held FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND transaction_id = ? LIMIT 1',
  SELECT_SESSION_EXISTS:
    'SELECT 1 AS held FROM _lagrange_locking_read_reservations WHERE session_id = ? LIMIT 1',
  SELECT_PARTITION_SESSION_EXISTS:
    'SELECT 1 AS held FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND session_id = ? LIMIT 1',
  DELETE_ROW:
    'DELETE FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND table_name = ? AND row_key = ?',
  DELETE_OWNED_ROW:
    'DELETE FROM _lagrange_locking_read_reservations ' +
    'WHERE partition_id = ? AND table_name = ? AND row_key = ? AND transaction_id = ?',
  DELETE_EXPIRED:
    'DELETE FROM _lagrange_locking_read_reservations WHERE expires_at IS NOT NULL AND expires_at <= ?',
  DELETE_BY_TRANSACTION:
    'DELETE FROM _lagrange_locking_read_reservations WHERE transaction_id = ?',
  DELETE_BY_PARTITION_TRANSACTION:
    'DELETE FROM _lagrange_locking_read_reservations WHERE partition_id = ? AND transaction_id = ?',
  DELETE_BY_SESSION:
    'DELETE FROM _lagrange_locking_read_reservations WHERE session_id = ?',
  DELETE_BY_PARTITION_SESSION:
    'DELETE FROM _lagrange_locking_read_reservations WHERE partition_id = ? AND session_id = ?',
  DELETE_ALL:
    'DELETE FROM _lagrange_locking_read_reservations',
  UPSERT_ROW: `
    INSERT INTO _lagrange_locking_read_reservations
      (partition_id, table_name, row_key, transaction_id, session_id, epoch, reserved_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (partition_id, table_name, row_key)
      DO UPDATE SET
        transaction_id = excluded.transaction_id,
        session_id = excluded.session_id,
        epoch = excluded.epoch,
        reserved_at = excluded.reserved_at,
        expires_at = excluded.expires_at
  `,
});

// Symbol on each DB handle tracks whether DDL has already been initialized.
const LOCKING_READ_DB_INITIALIZED = Symbol('lockingReadDbInitialized');

function dbErrorMessage(error) {
  return error?.message || String(error);
}

function dbFailure(error, extra = {}) {
  return {ok: false, error: dbErrorMessage(error), ...extra};
}

function dbCheckFailure(error) {
  return {error: true, conflict: false, message: dbErrorMessage(error)};
}

/**
 * Mark a database handle as uninitialized (e.g. if DDL/truncate is needed again).
 * @param {Object} db - SQLite database handle.
 */
export function resetInitializedReservationDb(db) {
  if (db && typeof db === 'object') {
    delete db[LOCKING_READ_DB_INITIALIZED];
  }
}

/**
 * Ensure the reservation table exists (for writes) or probe its presence (for reads).
 *
 * @param {Object|null} db - SQLite database instance.
 * @param {Object} [options] - Initialization options.
 * @param {boolean} [options.readOnly=false] - Read-only probe without DDL write.
 * @return {{ok: boolean, exists: boolean, error?: string}}
 */
export function ensureLockingReadTableInitialized(db, options = {}) {
  if (!db || db.open === false) {
    return {ok: false, exists: false, error: STORE_UNAVAILABLE_MSG};
  }
  if (db[LOCKING_READ_DB_INITIALIZED] === true) {
    return {ok: true, exists: true};
  }
  if (options.readOnly === true) {
    try {
      const present = sqliteConnectionState(db)
        .statement(RESERVATION_SQL.CHECK_TABLE_EXISTS)
        .get(RESERVATION_TABLE_NAME);
      if (present) {
        db[LOCKING_READ_DB_INITIALIZED] = true;
        return {ok: true, exists: true};
      }
      return {ok: true, exists: false};
    } catch (error) {
      return dbFailure(error, {exists: false});
    }
  }
  try {
    db.exec(RESERVATION_SQL.DDL);
    db[LOCKING_READ_DB_INITIALIZED] = true;
    return {ok: true, exists: true};
  } catch (error) {
    return dbFailure(error, {exists: false});
  }
}

function isRowExpired(expiresAt, now) {
  return typeof expiresAt === 'number' && expiresAt > 0 && expiresAt <= now;
}

function deleteRowFailure(error) {
  return {deleted: false, error: dbErrorMessage(error)};
}

function deleteExpiredDbRow(db, {partitionId, tableName, rowKey}) {
  try {
    sqliteConnectionState(db)
      .statement(RESERVATION_SQL.DELETE_ROW)
      .run(partitionId, tableName, rowKey);
    return {deleted: true};
  } catch (error) {
    return deleteRowFailure(error);
  }
}

/**
 * Check a single row reservation in the partition SQLite database.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} query - Query options.
 * @return {Object|null} Conflict/reentrant/error descriptor or null if unreserved.
 */
export function checkDbRowReservation(db, {partitionId, tableName, rowKey, transactionId}) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: true});
  if (!init.ok) {
    return {error: true, conflict: false, message: init.error};
  }
  if (!init.exists) {
    return null;
  }
  const now = Date.now();
  let existing;
  try {
    existing = sqliteConnectionState(db)
      .statement(RESERVATION_SQL.SELECT_ROW)
      .get(partitionId, tableName, rowKey);
  } catch (error) {
    return dbCheckFailure(error);
  }
  if (!existing) {
    return null;
  }
  if (isRowExpired(existing.expires_at, now)) {
    const clean = deleteExpiredDbRow(db, {partitionId, tableName, rowKey});
    return clean.deleted ? null : {error: true, conflict: false, message: clean.error};
  }
  if (existing.transaction_id === transactionId) {
    return {conflict: false, reentrant: true, rowKey};
  }
  return {
    conflict: true,
    rowKey,
    conflictingTransactionId: existing.transaction_id,
  };
}

/**
 * List active conflicting FOR_UPDATE reservations held on a table/partition in SQLite.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} query - Query options.
 * @return {{ok: boolean, rows?: Array<Object>, error?: string}}
 */
export function listDbTableReservationConflicts(db, {partitionId, tableName, transactionId}) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: true});
  if (!init.ok) {
    return {ok: false, error: init.error};
  }
  if (!init.exists) {
    return {ok: true, rows: []};
  }
  const now = Date.now();
  let rawRows;
  try {
    rawRows = typeof transactionId === 'string' && transactionId.length > 0 ?
      sqliteConnectionState(db)
        .statement(RESERVATION_SQL.SELECT_TABLE_OTHER_TX)
        .all(partitionId, tableName, transactionId) :
      sqliteConnectionState(db)
        .statement(RESERVATION_SQL.SELECT_TABLE_ALL)
        .all(partitionId, tableName);
  } catch (error) {
    return dbFailure(error);
  }
  const active = [];
  for (const row of rawRows) {
    if (isRowExpired(row.expires_at, now)) {
      deleteExpiredDbRow(db, {partitionId, tableName, rowKey: row.row_key});
      continue;
    }
    active.push({
      partitionId,
      tableName,
      rowKey: row.row_key,
      transactionId: row.transaction_id,
    });
  }
  return {ok: true, rows: active};
}

/**
 * Insert or update a reservation row in SQLite. Returns structured outcome.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} record - Reservation record.
 * @return {{ok: boolean, error?: string}}
 */
export function upsertDbReservation(db, record) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: false});
  if (!init.ok) {
    return {ok: false, error: init.error};
  }
  try {
    sqliteConnectionState(db)
      .statement(RESERVATION_SQL.UPSERT_ROW)
      .run(
        record.partitionId,
        record.tableName,
        record.rowKey,
        record.transactionId,
        record.sessionId,
        record.epoch || 0,
        record.acquiredAt,
        record.expiresAt || null,
      );
    return {ok: true};
  } catch (error) {
    return dbFailure(error);
  }
}

/**
 * Delete a specific row reservation owned by a transaction in SQLite.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} target - {partitionId, tableName, rowKey, transactionId}.
 * @return {number} Deleted row count.
 */
export function deleteOwnedDbRowReservation(db, {partitionId, tableName, rowKey, transactionId}) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: true});
  if (!init.ok || !init.exists) {
    return 0;
  }
  try {
    const info = sqliteConnectionState(db)
      .statement(RESERVATION_SQL.DELETE_OWNED_ROW)
      .run(partitionId, tableName, rowKey, transactionId);
    return info.changes;
  } catch (error) {
    throw new Error(`Failed to release locking-read row reservation: ${dbErrorMessage(error)}`);
  }
}

function isNonEmptyId(value) {
  return typeof value === 'string' && value.length > 0;
}

function runScopedDelete(db, sql, params, errorContext) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: true});
  if (!init.ok || !init.exists) {
    return 0;
  }
  try {
    return sqliteConnectionState(db).statement(sql).run(...params).changes;
  } catch (error) {
    throw new Error(`${errorContext}: ${dbErrorMessage(error)}`);
  }
}

function hasScopedReservationRow(db, sql, params) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: true});
  if (!init.ok || !init.exists) {
    return false;
  }
  return sqliteConnectionState(db).statement(sql).get(...params) !== undefined;
}

/**
 * Release all reservations on a SQLite database for a transaction (optionally partition-scoped).
 *
 * @param {Object} db - SQLite database instance.
 * @param {string} transactionId - Transaction identifier.
 * @param {string|null} [partitionId=null] - Optional partition scope filter.
 * @return {number} Count of deleted rows.
 */
export function releaseDbTransactionReservations(db, transactionId, partitionId = null) {
  if (!transactionId) {
    return 0;
  }
  if (isNonEmptyId(partitionId)) {
    return runScopedDelete(
      db,
      RESERVATION_SQL.DELETE_BY_PARTITION_TRANSACTION,
      [partitionId, transactionId],
      RELEASE_ERROR_MSG.PARTITION_TX,
    );
  }
  return runScopedDelete(
    db,
    RESERVATION_SQL.DELETE_BY_TRANSACTION,
    [transactionId],
    RELEASE_ERROR_MSG.TX,
  );
}

/**
 * Release durable SQLite reservations strictly scoped to one partition and transaction.
 *
 * @param {Object} db - SQLite database instance.
 * @param {string} partitionId - Partition identifier.
 * @param {string} transactionId - Transaction identifier.
 * @return {number} Count of deleted rows.
 */
export function releaseDbPartitionTransactionReservations(db, partitionId, transactionId) {
  if (!isNonEmptyId(partitionId) || !isNonEmptyId(transactionId)) {
    return 0;
  }
  return runScopedDelete(
    db,
    RESERVATION_SQL.DELETE_BY_PARTITION_TRANSACTION,
    [partitionId, transactionId],
    RELEASE_ERROR_MSG.PARTITION_TX,
  );
}

/**
 * Release all reservations on a SQLite database for a session (optionally partition-scoped).
 *
 * @param {Object} db - SQLite database instance.
 * @param {string} sessionId - Session identifier.
 * @param {string|null} [partitionId=null] - Optional partition scope filter.
 * @return {number} Count of deleted rows.
 */
export function releaseDbSessionReservations(db, sessionId, partitionId = null) {
  if (!sessionId) {
    return 0;
  }
  if (isNonEmptyId(partitionId)) {
    return runScopedDelete(
      db,
      RESERVATION_SQL.DELETE_BY_PARTITION_SESSION,
      [partitionId, sessionId],
      RELEASE_ERROR_MSG.PARTITION_SESSION,
    );
  }
  return runScopedDelete(
    db,
    RESERVATION_SQL.DELETE_BY_SESSION,
    [sessionId],
    RELEASE_ERROR_MSG.SESSION,
  );
}

/**
 * Release durable SQLite reservations strictly scoped to one partition and session.
 *
 * @param {Object} db - SQLite database instance.
 * @param {string} partitionId - Partition identifier.
 * @param {string} sessionId - Session identifier.
 * @return {number} Count of deleted rows.
 */
export function releaseDbPartitionSessionReservations(db, partitionId, sessionId) {
  if (!isNonEmptyId(partitionId) || !isNonEmptyId(sessionId)) {
    return 0;
  }
  return runScopedDelete(
    db,
    RESERVATION_SQL.DELETE_BY_PARTITION_SESSION,
    [partitionId, sessionId],
    RELEASE_ERROR_MSG.PARTITION_SESSION,
  );
}

/**
 * Check whether a transaction holds any durable SQLite reservation row.
 *
 * @param {Object|null} db - SQLite database instance.
 * @param {string|null} transactionId - Transaction identifier.
 * @param {string|null} [partitionId=null] - Optional partition scope filter.
 * @return {boolean}
 */
export function hasDbTransactionReservations(db, transactionId, partitionId = null) {
  if (!transactionId) {
    return false;
  }
  return isNonEmptyId(partitionId) ?
    hasScopedReservationRow(db, RESERVATION_SQL.SELECT_PARTITION_TX_EXISTS, [
      partitionId,
      transactionId,
    ]) :
    hasScopedReservationRow(db, RESERVATION_SQL.SELECT_TX_EXISTS, [transactionId]);
}

/**
 * Check whether a session holds any durable SQLite reservation row.
 *
 * @param {Object|null} db - SQLite database instance.
 * @param {string|null} sessionId - Session identifier.
 * @param {string|null} [partitionId=null] - Optional partition scope filter.
 * @return {boolean}
 */
export function hasDbSessionReservations(db, sessionId, partitionId = null) {
  if (!sessionId) {
    return false;
  }
  return isNonEmptyId(partitionId) ?
    hasScopedReservationRow(db, RESERVATION_SQL.SELECT_PARTITION_SESSION_EXISTS, [
      partitionId,
      sessionId,
    ]) :
    hasScopedReservationRow(db, RESERVATION_SQL.SELECT_SESSION_EXISTS, [sessionId]);
}

/**
 * Delete all reservations from a SQLite store. Test support only.
 * @param {Object} store - SQLite database instance.
 */
export function truncateDbReservations(store) {
  if (!store || store.open === false) {
    return;
  }
  const init = ensureLockingReadTableInitialized(store, {readOnly: true});
  if (!init.ok || !init.exists) {
    resetInitializedReservationDb(store);
    return;
  }
  try {
    sqliteConnectionState(store).statement(RESERVATION_SQL.DELETE_ALL).run();
  } catch (_err) {
    resetInitializedReservationDb(store);
  }
}

/**
 * Delete expired reservations from a SQLite store.
 * @param {Object} db - SQLite database instance.
 * @param {number} now - Current epoch milliseconds.
 * @return {number} Count of swept reservations.
 */
export function deleteExpiredDbReservations(db, now) {
  const init = ensureLockingReadTableInitialized(db, {readOnly: true});
  if (!init.ok || !init.exists) {
    return 0;
  }
  const info = sqliteConnectionState(db)
    .statement(RESERVATION_SQL.DELETE_EXPIRED)
    .run(now);
  return info.changes;
}
