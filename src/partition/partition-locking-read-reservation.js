/**
 * Participant write-intent reservation and fail-fast lock conflict handling
 * for PostgreSQL SELECT ... FOR UPDATE (Stages B3–B5, J4, 0.4.1 authoritative).
 *
 * Implements authoritative locking read policy:
 * - Deterministic fail-fast row key reservations (${tableName}:${partitionId}:${JSON.stringify(pkValues)})
 * - No wait queues (waitQueue: false)
 * - Conflict refusal with sqlState: 55P03 (LOCK_NOT_AVAILABLE)
 * - Authoritative SQLite persistence required for FOR_UPDATE (fail closed if unavailable)
 * - Re-entrant reservation by the same transaction
 * - Automatic release on COMMIT, ROLLBACK, timeout, cancellation, or recovery
 *
 * @module partition/partition-locking-read-reservation
 */

import {
  LOCKING_READ_ERROR_CODE,
  LOCKING_READ_ERROR_MSG,
  LOCKING_READ_LOCAL_EXPIRY,
  LOCKING_READ_RESERVATION_KIND,
  LOCKING_READ_RESERVATION_OUTCOME,
  LOCKING_READ_SQL_STATE,
} from '../query/sql-locking-read-constants.js';
import {encodeCanonicalPkTupleKey} from './partition-write-footprint-contract.js';
import {
  checkDbRowReservation,
  deleteExpiredDbReservations,
  deleteOwnedDbRowReservation,
  ensureLockingReadTableInitialized,
  hasDbTransactionReservations,
  listDbTableReservationConflicts,
  releaseDbSessionReservations,
  releaseDbTransactionReservations,
  truncateDbReservations,
  upsertDbReservation,
} from './partition-locking-read-store.js';

const STORE_OPTION_DB_FIELD = 'db';

export {
  LOCKING_READ_RESERVATION_KIND,
  ensureLockingReadTableInitialized,
  hasDbTransactionReservations,
  listDbTableReservationConflicts,
  releaseDbSessionReservations,
  releaseDbTransactionReservations,
};

const DEFAULT_UNKNOWN_ROW_KEY = 'unknown';

// Map<rowKey, ReservationRecord> (process-local mirror cache; SQLite is authoritative)
const RESERVATIONS = new Map();

// Map<transactionId, Set<rowKey>>
const TRANSACTION_RESERVATIONS = new Map();

// Map<partitionId, Database>
const PARTITION_DBS = new Map();

/**
 * Derive the canonical row lock key for a primary-key tuple on a partition.
 *
 * @param {string} tableName - Target table.
 * @param {string} partitionId - Target partition.
 * @param {Array<*>|*} pkValues - Declared primary-key values tuple.
 * @return {string} Canonical row lock key.
 */
export function deriveRowLockKey(tableName, partitionId, pkValues) {
  return `${tableName}:${partitionId}:${encodeCanonicalPkTupleKey(pkValues)}`;
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
 * Create a typed reservation-unavailable failure object when the authoritative
 * reservation store or leader path cannot admit/persist a lock.
 *
 * @param {Object} [details={}] - Failure details.
 * @return {Object} Fail-closed reservation failure result.
 */
export function createReservationUnavailableResult(details = {}) {
  const hasMessage = typeof details.message === 'string' && details.message.length > 0;
  const error = hasMessage ? details.message : LOCKING_READ_ERROR_MSG.RESERVATION_STORE_UNAVAILABLE;
  return {
    success: false,
    unavailable: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.UNAVAILABLE,
    error,
    errorCode: LOCKING_READ_ERROR_CODE.RESERVATION_UNAVAILABLE,
    code: LOCKING_READ_ERROR_CODE.RESERVATION_UNAVAILABLE,
    sqlState: LOCKING_READ_SQL_STATE.INTERNAL_ERROR,
    ...details,
  };
}

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
 * Register a partition SQLite database for reservation persistence and sweeping.
 *
 * @param {string} partitionId - Partition identifier.
 * @param {Object} db - SQLite database instance.
 */
export function registerPartitionDatabase(partitionId, db) {
  if (partitionId && db && typeof db.prepare === 'function') {
    PARTITION_DBS.set(partitionId, db);
    ensureLockingReadTableInitialized(db, {readOnly: false});
  }
}

function resolvePartitionStore(partitionId, explicitDb, hasExplicitDbProp) {
  if (hasExplicitDbProp && explicitDb === null) {
    return null;
  }
  const store = explicitDb || PARTITION_DBS.get(partitionId) || null;
  if (store && store.open !== false) {
    PARTITION_DBS.set(partitionId, store);
    return store;
  }
  return null;
}

function formatReentrantOutcome(rowKey) {
  return {
    success: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.ALREADY_OWNED,
    rowKey,
    reentrant: true,
  };
}

function evaluateStoreDbCheck(dbCheck, rowKey) {
  if (!dbCheck) {
    return null;
  }
  if (dbCheck.error) {
    return createReservationUnavailableResult({rowKey, message: dbCheck.message});
  }
  if (dbCheck.conflict) {
    return {
      success: false,
      conflict: true,
      outcome: LOCKING_READ_RESERVATION_OUTCOME.CONFLICT,
      rowKey,
      conflictingTransactionId: dbCheck.conflictingTransactionId,
    };
  }
  return dbCheck.reentrant ? formatReentrantOutcome(rowKey) : null;
}

function checkStoreReservation(store, query) {
  if (!store) {
    return null;
  }
  return evaluateStoreDbCheck(checkDbRowReservation(store, query), query.rowKey);
}

function trackMemoryReservation(transactionId, rowKey, record) {
  RESERVATIONS.set(rowKey, record);
  let txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) {
    txSet = new Set();
    TRANSACTION_RESERVATIONS.set(transactionId, txSet);
  }
  txSet.add(rowKey);
}

function untrackMemoryRow(rowKey, transactionId) {
  const existing = RESERVATIONS.get(rowKey);
  if (existing && existing.transactionId === transactionId) {
    RESERVATIONS.delete(rowKey);
  }
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (txSet) {
    txSet.delete(rowKey);
    if (txSet.size === 0) {
      TRANSACTION_RESERVATIONS.delete(transactionId);
    }
  }
}

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

function evaluateReservationConflict(storeOutcome, existing, transactionId, rowKey) {
  if (storeOutcome) {
    return storeOutcome;
  }
  if (existing) {
    return resolveExistingReservationOutcome(existing, transactionId, rowKey);
  }
  return null;
}

function handleReentrantUpgrade(options) {
  const {conflictOutcome, storeOutcome, existing, record, kind, store} = options;
  if (conflictOutcome.unavailable) {
    return conflictOutcome;
  }
  const missingFromStoreOrNonForUpdate = !storeOutcome ||
    !existing ||
    existing.kind !== LOCKING_READ_RESERVATION_KIND.FOR_UPDATE;
  const needsUpgrade = conflictOutcome.reentrant === true &&
    kind === LOCKING_READ_RESERVATION_KIND.FOR_UPDATE &&
    missingFromStoreOrNonForUpdate;
  if (!needsUpgrade) {
    return conflictOutcome;
  }
  if (!store || store.open === false) {
    return createReservationUnavailableResult({rowKey: record.rowKey});
  }
  const write = upsertDbReservation(store, {
    ...record,
    kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
  });
  if (!write.ok) {
    return createReservationUnavailableResult({rowKey: record.rowKey, message: write.error});
  }
  if (existing) {
    existing.kind = LOCKING_READ_RESERVATION_KIND.FOR_UPDATE;
    if (record.expiresAt !== null) {
      existing.expiresAt = record.expiresAt;
    }
  } else {
    trackMemoryReservation(record.transactionId, record.rowKey, {
      ...record,
      kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
    });
  }
  return conflictOutcome;
}

function acquireAuthoritativeForUpdate(store, options, record) {
  if (!store || store.open === false) {
    return createReservationUnavailableResult({
      rowKey: record.rowKey,
      partitionId: options.partitionId,
      tableName: options.tableName,
      transactionId: options.transactionId,
    });
  }
  try {
    return store.transaction(() => {
      const storeOutcome = checkStoreReservation(store, {
        partitionId: options.partitionId,
        tableName: options.tableName,
        rowKey: record.rowKey,
        transactionId: options.transactionId,
      });
      const existing = RESERVATIONS.get(record.rowKey) || null;
      const conflictOutcome = evaluateReservationConflict(
        storeOutcome,
        existing,
        options.transactionId,
        record.rowKey,
      );
      if (conflictOutcome !== null) {
        return handleReentrantUpgrade({
          conflictOutcome,
          storeOutcome,
          existing,
          record,
          kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
          store,
        });
      }
      const write = upsertDbReservation(store, record);
      if (!write.ok) {
        return createReservationUnavailableResult({
          rowKey: record.rowKey,
          partitionId: options.partitionId,
          tableName: options.tableName,
          transactionId: options.transactionId,
          message: write.error,
        });
      }
      trackMemoryReservation(options.transactionId, record.rowKey, record);
      return {
        success: true,
        outcome: LOCKING_READ_RESERVATION_OUTCOME.ACQUIRED,
        rowKey: record.rowKey,
      };
    })();
  } catch (err) {
    return createReservationUnavailableResult({
      rowKey: record.rowKey,
      partitionId: options.partitionId,
      tableName: options.tableName,
      transactionId: options.transactionId,
      message: err?.message || String(err),
    });
  }
}

/**
 * Attempt to acquire a row write-intent reservation for a transaction.
 * Fail-fast without waiting (waitQueue: false). For FOR_UPDATE, authoritative
 * SQLite persistence is mandatory and failures fail closed without phantom
 * in-memory state.
 *
 * @param {Object} options - Acquisition options.
 * @return {Object} Acquisition outcome.
 */
export function acquireRowReservation(options) {
  const {
    tableName,
    partitionId,
    pkValues,
    transactionId,
    kind = LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
  } = options;
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const store = resolvePartitionStore(
    partitionId,
    options.db,
    Object.hasOwn(options, STORE_OPTION_DB_FIELD),
  );
  const now = Date.now();
  const expiresAt = typeof options.holdTimeoutMs === 'number' && options.holdTimeoutMs > 0 ?
    now + options.holdTimeoutMs :
    null;
  const record = buildReservationRecord(options, rowKey, now, expiresAt);

  if (kind === LOCKING_READ_RESERVATION_KIND.FOR_UPDATE) {
    return acquireAuthoritativeForUpdate(store, options, record);
  }

  const storeOutcome = checkStoreReservation(store, {
    partitionId,
    tableName,
    rowKey,
    transactionId,
  });
  const existing = RESERVATIONS.get(rowKey) || null;
  const conflictOutcome = evaluateReservationConflict(
    storeOutcome,
    existing,
    transactionId,
    rowKey,
  );
  if (conflictOutcome !== null) {
    return conflictOutcome;
  }
  trackMemoryReservation(transactionId, rowKey, record);
  return {
    success: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.ACQUIRED,
    rowKey,
  };
}

function checkMemoryReservationConflict(rowKey, transactionId, onlyForUpdate) {
  const existing = RESERVATIONS.get(rowKey);
  if (!existing || existing.transactionId === transactionId) {
    return null;
  }
  if (onlyForUpdate && existing.kind !== LOCKING_READ_RESERVATION_KIND.FOR_UPDATE) {
    return null;
  }
  return {
    conflict: true,
    rowKey,
    conflictingTransactionId: existing.transactionId,
  };
}

/**
 * Check whether a row lock key conflicts with another active transaction.
 *
 * @param {Object} options - Check options.
 * @return {{conflict: boolean, rowKey: string, conflictingTransactionId?: string, unavailable?: boolean}}
 */
export function checkRowReservationConflict({
  tableName,
  partitionId,
  pkValues,
  transactionId = null,
  db = null,
  onlyForUpdate = false,
}) {
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const store = resolvePartitionStore(partitionId, db, db !== null);
  if (store) {
    const dbCheck = checkDbRowReservation(store, {partitionId, tableName, rowKey, transactionId});
    if (dbCheck?.error) {
      return {conflict: false, unavailable: true, error: dbCheck.message, rowKey};
    }
    if (dbCheck?.conflict) {
      return {
        conflict: true,
        rowKey,
        conflictingTransactionId: dbCheck.conflictingTransactionId,
      };
    }
  }
  return checkMemoryReservationConflict(rowKey, transactionId, onlyForUpdate) ||
    {conflict: false, rowKey};
}

/**
 * Find the first conflicting FOR_UPDATE reservation on a table/partition in SQLite.
 *
 * @param {Object} db - SQLite database instance.
 * @param {Object} options - {partitionId, tableName, transactionId}.
 * @return {Object|null}
 */
export function findTableDbReservationConflict(db, {partitionId, tableName, transactionId}) {
  const listed = listDbTableReservationConflicts(db, {partitionId, tableName, transactionId});
  if (!listed.ok) {
    return {error: true, message: listed.error};
  }
  return listed.rows[0] || null;
}

/**
 * Release specific row reservations in memory and optional local DB.
 *
 * @param {Array<{partitionId: string, tableName: string, rowKey: string, transactionId: string, db?: Object}>} entries
 */
export function releaseSpecificRowReservations(entries) {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const entry of entries) {
    untrackMemoryRow(entry.rowKey, entry.transactionId);
    const store = entry.db || PARTITION_DBS.get(entry.partitionId) || null;
    if (store && store.open !== false) {
      deleteOwnedDbRowReservation(store, entry);
    }
  }
}

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
 * @return {number} Count of released in-memory reservations.
 */
export function releaseTransactionReservations(transactionId, options = {}) {
  if (!transactionId) {
    return 0;
  }
  const released = releaseMemoryTransactionReservations(transactionId);
  releaseStoreTransactionReservations(transactionId, options.db || null);
  return released;
}

function releaseMemorySessionReservations(sessionId) {
  let released = 0;
  for (const [rowKey, rec] of RESERVATIONS.entries()) {
    if (rec.sessionId === sessionId) {
      RESERVATIONS.delete(rowKey);
      const txSet = TRANSACTION_RESERVATIONS.get(rec.transactionId);
      if (txSet) {
        txSet.delete(rowKey);
        if (txSet.size === 0) {
          TRANSACTION_RESERVATIONS.delete(rec.transactionId);
        }
      }
      released += 1;
    }
  }
  return released;
}

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
 * @return {number} Count of released reservations.
 */
export function releaseSessionReservations(sessionId, options = {}) {
  if (!sessionId) {
    return 0;
  }
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
  return deleteExpiredDbReservations(db, Date.now());
}

/**
 * Query reservations held by a transaction.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {Array<Object>} List of reservation records.
 */
export function getTransactionReservations(transactionId) {
  if (!transactionId) {
    return [];
  }
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) {
    return [];
  }
  const results = [];
  for (const rowKey of txSet) {
    const rec = RESERVATIONS.get(rowKey);
    if (rec) {
      results.push(rec);
    }
  }
  return results;
}

/**
 * Whether a transaction currently holds any FOR_UPDATE reservations (in memory or optional DB).
 *
 * @param {string} transactionId - Transaction identifier.
 * @param {Object|null} [db=null] - Optional partition SQLite DB.
 * @return {boolean}
 */
export function hasLockingReadReservations(transactionId, db = null) {
  if (!transactionId) {
    return false;
  }
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (txSet && txSet.size > 0) {
    for (const rowKey of txSet) {
      const rec = RESERVATIONS.get(rowKey);
      if (rec && rec.kind === LOCKING_READ_RESERVATION_KIND.FOR_UPDATE) {
        return true;
      }
    }
  }
  return db ? hasDbTransactionReservations(db, transactionId) : false;
}

/**
 * Clear ONLY process-local in-memory reservation maps, preserving all SQLite rows
 * and registered partition DB handles. Useful for restart/leader-failover tests.
 */
export function clearMemoryReservations() {
  RESERVATIONS.clear();
  TRANSACTION_RESERVATIONS.clear();
}

/**
 * Clear all reservations across all transactions and partition databases. Test support only.
 */
export function clearAllReservations() {
  clearMemoryReservations();
  for (const store of PARTITION_DBS.values()) {
    truncateDbReservations(store);
  }
  PARTITION_DBS.clear();
}
