/**
 * Participant write-intent reservation and fail-fast lock conflict handling
 * for PostgreSQL SELECT ... FOR UPDATE (Stages B3–B5, J4).
 *
 * Implements Phase 0.3 locking read policy:
 * - Deterministic fail-fast row key reservations (${tableName}:${partitionId}:${JSON.stringify(pkValues)})
 * - No wait queues (waitQueue: false)
 * - Conflict refusal with sqlState: 55P03 (LOCK_NOT_AVAILABLE)
 * - Durable/replicated reservations until transaction resolution (localExpiry: forbidden)
 * - Re-entrant reservation by the same transaction
 * - Automatic release on COMMIT, ROLLBACK, timeout, cancellation, or recovery
 * - Durable participant SQLite mirroring via _lagrange_locking_read_reservations
 *
 * @module partition/partition-locking-read-reservation
 */

import {
  LOCKING_READ_ERROR_CODE,
  LOCKING_READ_SQL_STATE,
  LOCKING_READ_RESERVATION_KIND,
  LOCKING_READ_LOCAL_EXPIRY,
  LOCKING_READ_RESERVATION_OUTCOME,
} from '../query/sql-locking-read-constants.js';

export {
  LOCKING_READ_RESERVATION_KIND,
};

const DEFAULT_UNKNOWN_ROW_KEY = 'unknown';

// Map<rowKey, ReservationRecord>
const RESERVATIONS = new Map();

// Map<transactionId, Set<rowKey>>
const TRANSACTION_RESERVATIONS = new Map();

// Map<partitionId, Database>
const PARTITION_DBS = new Map();

// WeakSet<Database>
const INITIALIZED_DBS = new WeakSet();

// WeakMap<Database, Map<string, Statement>>
const PREPARED_STATEMENTS = new WeakMap();

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
  SELECT_ROW:
    'SELECT transaction_id, expires_at FROM _lagrange_locking_read_reservations WHERE partition_id = ? AND table_name = ? AND row_key = ?',
  DELETE_ROW:
    'DELETE FROM _lagrange_locking_read_reservations WHERE partition_id = ? AND table_name = ? AND row_key = ?',
  DELETE_EXPIRED:
    'DELETE FROM _lagrange_locking_read_reservations WHERE expires_at IS NOT NULL AND expires_at <= ?',
  DELETE_BY_TRANSACTION:
    'DELETE FROM _lagrange_locking_read_reservations WHERE transaction_id = ?',
  DELETE_BY_SESSION:
    'DELETE FROM _lagrange_locking_read_reservations WHERE session_id = ?',
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

/**
 * Get or prepare a statement on a partition database.
 *
 * @param {Object} db - SQLite database.
 * @param {string} sql - SQL query text.
 * @return {Object} Prepared statement.
 */
function resolvePreparedStatement(db, sql) {
  let statements = PREPARED_STATEMENTS.get(db);
  if (!statements) {
    statements = new Map();
    PREPARED_STATEMENTS.set(db, statements);
  }
  let stmt = statements.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    statements.set(sql, stmt);
  }
  return stmt;
}

/**
 * Ensure the reservation table exists on a partition database.
 *
 * @param {Object} db - SQLite database instance.
 */
function ensureTableInitialized(db) {
  if (!db || db.open === false || INITIALIZED_DBS.has(db)) return false;
  try {
    db.exec(RESERVATION_SQL.DDL);
    INITIALIZED_DBS.add(db);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Derive the canonical row lock key for a primary-key tuple on a partition.
 *
 * @param {string} tableName - Target table.
 * @param {string} partitionId - Target partition.
 * @param {Array<*>|*} pkValues - Declared primary-key values tuple.
 * @return {string} Canonical row lock key.
 */
function deriveRowLockKey(tableName, partitionId, pkValues) {
  const normalizedValues = Array.isArray(pkValues) ? pkValues : [pkValues];
  return `${tableName}:${partitionId}:${JSON.stringify(normalizedValues)}`;
}

/**
 * Create a typed locking conflict failure object.
 *
 * @param {Object} details - Failure details.
 * @return {Object} Standard query error result.
 */
export function createLockConflictResult(details = {}) {
  const rowKey = details.rowKey || DEFAULT_UNKNOWN_ROW_KEY;
  return {
    success: false,
    error: details.message ||
      `could not obtain lock on row "${rowKey}" due to concurrent transaction conflict`,
    errorCode: LOCKING_READ_ERROR_CODE.LOCK_NOT_AVAILABLE,
    code: LOCKING_READ_ERROR_CODE.LOCK_NOT_AVAILABLE,
    sqlState: LOCKING_READ_SQL_STATE.LOCK_NOT_AVAILABLE,
    conflict: true,
    retryable: true,
    ...details,
  };
}

/**
 * Resolve conflict or reentrancy outcome for an existing reservation record.
 *
 * @param {Object} existing - Existing reservation record.
 * @param {string} transactionId - Current transaction ID.
 * @param {string} rowKey - Canonical row lock key.
 * @return {Object} Outcome result.
 */
function resolveExistingReservationOutcome(existing, transactionId, rowKey) {
  if (existing.transactionId === transactionId) {
    return {
      success: true,
      outcome: LOCKING_READ_RESERVATION_OUTCOME.ALREADY_OWNED,
      rowKey,
      reentrant: true,
    };
  }
  return {
    success: false,
    conflict: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.CONFLICT,
    rowKey,
    conflictingTransactionId: existing.transactionId,
  };
}

/**
 * Check if a reservation exists and conflicts in the partition database.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} options - Match options.
 * @return {Object|null}
 */
function checkDbReservation(db, {partitionId, tableName, rowKey, transactionId}) {
  ensureTableInitialized(db);
  const now = Date.now();
  let existing;
  try {
    existing = resolvePreparedStatement(db, RESERVATION_SQL.SELECT_ROW).get(
      partitionId,
      tableName,
      rowKey,
    );
  } catch (_err) {
    return null;
  }

  if (!existing) return null;

  if (typeof existing.expires_at === 'number' &&
      existing.expires_at > 0 &&
      existing.expires_at <= now) {
    try {
      resolvePreparedStatement(db, RESERVATION_SQL.DELETE_ROW).run(
        partitionId,
        tableName,
        rowKey,
      );
    } catch (_err) {
      return null;
    }
    return null;
  }

  if (existing.transaction_id === transactionId) {
    return {conflict: false, reentrant: true, rowKey};
  }
  return {conflict: true, rowKey, conflictingTransactionId: existing.transaction_id};
}

/**
 * Insert or update a reservation in the partition database.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} record - Reservation record.
 */
function insertDbReservation(db, record) {
  ensureTableInitialized(db);
  try {
    resolvePreparedStatement(db, RESERVATION_SQL.UPSERT_ROW).run(
      record.partitionId,
      record.tableName,
      record.rowKey,
      record.transactionId,
      record.sessionId,
      record.epoch || 0,
      record.acquiredAt,
      record.expiresAt || null,
    );
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Register a partition SQLite database for reservation persistence and sweeping.
 *
 * @param {string} partitionId - Partition identifier.
 * @param {Object} db - SQLite database instance.
 */
export function registerPartitionDatabase(partitionId, db) {
  if (partitionId && db && typeof db.prepare === 'function') {
    PARTITION_DBS.set(partitionId, db);
    ensureTableInitialized(db);
  }
}

/**
 * Resolve active partition store if available.
 *
 * @param {string} partitionId - Partition identifier.
 * @param {Object|null} explicitDb - Optional explicit database.
 * @return {Object|null}
 */
function resolvePartitionStore(partitionId, explicitDb) {
  const store = explicitDb || PARTITION_DBS.get(partitionId) || null;
  if (store && store.open !== false) {
    registerPartitionDatabase(partitionId, store);
    return store;
  }
  return null;
}

/**
 * Evaluate store check result into a reservation outcome.
 *
 * @param {Object|null} dbCheck - Raw database check.
 * @param {string} rowKey - Canonical row lock key.
 * @return {Object|null}
 */
function evaluateStoreDbCheck(dbCheck, rowKey) {
  if (!dbCheck) {
    return null;
  } else if (dbCheck.conflict) {
    return {
      success: false,
      conflict: true,
      outcome: LOCKING_READ_RESERVATION_OUTCOME.CONFLICT,
      rowKey,
      conflictingTransactionId: dbCheck.conflictingTransactionId,
    };
  } else if (dbCheck.reentrant) {
    return {
      success: true,
      outcome: LOCKING_READ_RESERVATION_OUTCOME.ALREADY_OWNED,
      rowKey,
      reentrant: true,
    };
  }
  return null;
}

/**
 * Check partition store for conflict or reentrancy.
 *
 * @param {Object|null} store - Partition database.
 * @param {Object} query - Query parameters.
 * @return {Object|null}
 */
function checkStoreReservation(store, query) {
  if (!store) {
    return null;
  }
  return evaluateStoreDbCheck(checkDbReservation(store, query), query.rowKey);
}

/**
 * Track an acquired reservation in memory.
 *
 * @param {string} transactionId - Owning transaction ID.
 * @param {string} rowKey - Canonical row lock key.
 * @param {Object} record - Reservation record.
 */
function trackMemoryReservation(transactionId, rowKey, record) {
  RESERVATIONS.set(rowKey, record);
  let txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) {
    txSet = new Set();
    TRANSACTION_RESERVATIONS.set(transactionId, txSet);
  }
  txSet.add(rowKey);
}

/**
 * Build a canonical reservation record object.
 *
 * @param {Object} options - Acquisition options.
 * @param {string} rowKey - Canonical row lock key.
 * @param {number} now - Acquisition timestamp.
 * @param {number|null} expiresAt - Expiry timestamp.
 * @return {Object} Record.
 */
function buildReservationRecord(options, rowKey, now, expiresAt) {
  const {
    tableName,
    partitionId,
    pkValues,
    transactionId,
    sessionId,
    participantId,
    kind,
    epoch,
  } = options;
  return {
    rowKey,
    tableName,
    partitionId,
    pkValues: Array.isArray(pkValues) ? pkValues : [pkValues],
    transactionId,
    sessionId: sessionId || null,
    participantId: participantId || `${transactionId}:${partitionId}`,
    kind: kind || LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
    epoch: epoch || 0,
    acquiredAt: now,
    expiresAt,
    localExpiry: LOCKING_READ_LOCAL_EXPIRY.FORBIDDEN,
  };
}

/**
 * Evaluate conflict against existing partition store or memory reservation.
 * Uses if-else-if structure to maintain single decision boundary.
 *
 * @param {Object|null} storeOutcome - Conflict check from store.
 * @param {Object|null} existing - In-memory existing reservation.
 * @param {string} transactionId - Current transaction ID.
 * @param {string} rowKey - Canonical row lock key.
 * @return {Object|null}
 */
function evaluateReservationConflict(storeOutcome, existing, transactionId, rowKey) {
  if (storeOutcome) {
    return storeOutcome;
  } else if (existing) {
    return resolveExistingReservationOutcome(existing, transactionId, rowKey);
  }
  return null;
}

/**
 * Attempt to acquire a row write-intent reservation for a transaction.
 * Fail-fast without waiting (waitQueue: false).
 *
 * @param {Object} options - Acquisition options.
 * @param {string} options.tableName - Table name.
 * @param {string} options.partitionId - Partition identifier.
 * @param {Array<*>|*} options.pkValues - Declared primary key tuple.
 * @param {string} options.transactionId - Owning transaction ID.
 * @param {string} [options.sessionId] - Owning session ID.
 * @param {string} [options.participantId] - Enlisted participant ID.
 * @param {string} [options.kind] - FOR_UPDATE or WRITE_STAGED.
 * @param {Object} [options.db] - Partition SQLite database.
 * @param {number} [options.holdTimeoutMs] - Hold timeout in ms.
 * @param {number} [options.epoch] - Transaction epoch.
 * @return {Object} Acquisition outcome.
 */
export function acquireRowReservation(options) {
  const {tableName, partitionId, pkValues, transactionId} = options;
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const store = resolvePartitionStore(partitionId, options.db);
  const storeOutcome = checkStoreReservation(store, {
    partitionId,
    tableName,
    rowKey,
    transactionId,
  });
  const existing = RESERVATIONS.get(rowKey);

  const conflictOutcome = evaluateReservationConflict(
    storeOutcome,
    existing,
    transactionId,
    rowKey,
  );
  if (conflictOutcome !== null) {
    return conflictOutcome;
  }

  const now = Date.now();
  const expiresAt = typeof options.holdTimeoutMs === 'number' && options.holdTimeoutMs > 0 ?
    now + options.holdTimeoutMs :
    null;
  const record = buildReservationRecord(options, rowKey, now, expiresAt);

  trackMemoryReservation(transactionId, rowKey, record);
  if (store) insertDbReservation(store, record);

  return {
    success: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.ACQUIRED,
    rowKey,
  };
}

/**
 * Check whether a row lock key conflicts with another active transaction.
 *
 * @param {Object} options - Check options.
 * @param {string} options.tableName - Table name.
 * @param {string} options.partitionId - Partition identifier.
 * @param {Array<*>|*} options.pkValues - Declared primary key tuple.
 * @param {string} [options.transactionId] - Current transaction ID (if any).
 * @param {Object} [options.db] - Partition SQLite database.
 * @return {{conflict: boolean, rowKey: string, conflictingTransactionId?: string}}
 */
export function checkRowReservationConflict({
  tableName,
  partitionId,
  pkValues,
  transactionId = null,
  db = null,
}) {
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const store = resolvePartitionStore(partitionId, db);
  if (store) {
    const dbCheck = checkDbReservation(store, {partitionId, tableName, rowKey, transactionId});
    if (dbCheck?.conflict) {
      return {
        conflict: true,
        rowKey,
        conflictingTransactionId: dbCheck.conflictingTransactionId,
      };
    }
  }

  const existing = RESERVATIONS.get(rowKey);
  if (existing && existing.transactionId !== transactionId) {
    return {
      conflict: true,
      rowKey,
      conflictingTransactionId: existing.transactionId,
    };
  }

  return {conflict: false, rowKey};
}

/**
 * Release reservations on a SQLite database for a transaction.
 *
 * @param {Object} db - SQLite database.
 * @param {string} transactionId - Transaction identifier.
 * @return {number} Count of deleted rows.
 */
function releaseDbTransactionReservations(db, transactionId) {
  try {
    ensureTableInitialized(db);
    const info = resolvePreparedStatement(db, RESERVATION_SQL.DELETE_BY_TRANSACTION).run(
      transactionId,
    );
    return info.changes;
  } catch (_err) {
    return 0;
  }
}

/**
 * Release reservations in memory for a transaction.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {number} Count of released in-memory records.
 */
function releaseMemoryTransactionReservations(transactionId) {
  let released = 0;
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (txSet) {
    for (const rowKey of txSet) {
      const existing = RESERVATIONS.get(rowKey);
      if (existing && existing.transactionId === transactionId) {
        RESERVATIONS.delete(rowKey);
        released += 1;
      }
    }
    TRANSACTION_RESERVATIONS.delete(transactionId);
  }
  return released;
}

/**
 * Release reservations across all registered partition databases for a transaction.
 *
 * @param {string} transactionId - Transaction identifier.
 * @param {Object|null} explicitDb - Optional explicit database.
 */
function releaseStoreTransactionReservations(transactionId, explicitDb) {
  if (explicitDb && explicitDb.open !== false) {
    releaseDbTransactionReservations(explicitDb, transactionId);
  }
  for (const store of PARTITION_DBS.values()) {
    if (store && store.open !== false && store !== explicitDb) {
      releaseDbTransactionReservations(store, transactionId);
    }
  }
}

/**
 * Release all locking-read and staged write reservations held by a transaction.
 * Invoked on COMMIT, ROLLBACK, timeout, cancellation, or recovery.
 *
 * @param {string} transactionId - Transaction identifier.
 * @param {Object} [options] - Release options.
 * @param {Object} [options.db] - Partition database.
 * @return {number} Count of released reservations.
 */
export function releaseTransactionReservations(transactionId, options = {}) {
  if (!transactionId) return 0;
  const released = releaseMemoryTransactionReservations(transactionId);
  releaseStoreTransactionReservations(transactionId, options.db || null);
  return released;
}

/**
 * Release reservations on a SQLite database for a session.
 *
 * @param {Object} db - SQLite database.
 * @param {string} sessionId - Session identifier.
 * @return {number} Count of deleted rows.
 */
function releaseDbSessionReservations(db, sessionId) {
  try {
    ensureTableInitialized(db);
    const info = resolvePreparedStatement(db, RESERVATION_SQL.DELETE_BY_SESSION).run(
      sessionId,
    );
    return info.changes;
  } catch (_err) {
    return 0;
  }
}

/**
 * Release reservations in memory for a session.
 *
 * @param {string} sessionId - Session identifier.
 * @return {number} Count of released in-memory records.
 */
function releaseMemorySessionReservations(sessionId) {
  let released = 0;
  for (const [rowKey, rec] of RESERVATIONS.entries()) {
    if (rec.sessionId === sessionId) {
      RESERVATIONS.delete(rowKey);
      const txSet = TRANSACTION_RESERVATIONS.get(rec.transactionId);
      if (txSet) {
        txSet.delete(rowKey);
        if (txSet.size === 0) TRANSACTION_RESERVATIONS.delete(rec.transactionId);
      }
      released += 1;
    }
  }
  return released;
}

/**
 * Release reservations across all registered partition databases for a session.
 *
 * @param {string} sessionId - Session identifier.
 * @param {Object|null} explicitDb - Optional explicit database.
 */
function releaseStoreSessionReservations(sessionId, explicitDb) {
  if (explicitDb && explicitDb.open !== false) {
    releaseDbSessionReservations(explicitDb, sessionId);
  }
  for (const store of PARTITION_DBS.values()) {
    if (store && store.open !== false && store !== explicitDb) {
      releaseDbSessionReservations(store, sessionId);
    }
  }
}

/**
 * Release all reservations held by a session across all its transactions.
 * Invoked on client disconnect or session abort.
 *
 * @param {string} sessionId - Session identifier.
 * @param {Object} [options] - Release options.
 * @param {Object} [options.db] - Partition database.
 * @return {number} Count of released reservations.
 */
export function releaseSessionReservations(sessionId, options = {}) {
  if (!sessionId) return 0;
  const released = releaseMemorySessionReservations(sessionId);
  releaseStoreSessionReservations(sessionId, options.db || null);
  return released;
}

/**
 * Sweep expired reservations from a partition database.
 *
 * @param {Object} db - SQLite database instance.
 * @return {number} Count of swept reservations.
 */
export function sweepExpiredReservations(db) {
  if (!db || db.open === false) return 0;
  try {
    ensureTableInitialized(db);
    const info = resolvePreparedStatement(db, RESERVATION_SQL.DELETE_EXPIRED).run(
      Date.now(),
    );
    return info.changes;
  } catch (_err) {
    return 0;
  }
}

/**
 * Query reservations held by a transaction.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {Array<Object>} List of reservation records.
 */
export function getTransactionReservations(transactionId) {
  if (!transactionId) return [];
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) return [];
  const results = [];
  for (const rowKey of txSet) {
    const rec = RESERVATIONS.get(rowKey);
    if (rec) results.push(rec);
  }
  return results;
}

/**
 * Whether a transaction currently holds any reservations.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {boolean}
 */
export function hasLockingReadReservations(transactionId) {
  if (!transactionId) return false;
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  return Boolean(txSet && txSet.size > 0);
}

/**
 * Clear all reservations across all transactions and partition databases. Test support only.
 */
export function clearAllReservations() {
  RESERVATIONS.clear();
  TRANSACTION_RESERVATIONS.clear();
  for (const store of PARTITION_DBS.values()) {
    if (store && store.open !== false) {
      try {
        ensureTableInitialized(store);
        resolvePreparedStatement(store, RESERVATION_SQL.DELETE_ALL).run();
      } catch (_err) {
        INITIALIZED_DBS.delete(store);
      }
    }
  }
  PARTITION_DBS.clear();
}
