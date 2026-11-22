/**
 * Process-local locking-read mirror, key/error helpers, and read-only conflict
 * inspection for PostgreSQL SELECT ... FOR UPDATE (P1/P2 authoritative split).
 *
 * Capability boundary:
 * - Authoritative durable FOR_UPDATE acquisition and durable SQLite release live
 *   solely in partition-private `partition-locking-read-store.js` and are invoked
 *   only by partition owners (`partition-locking-read-service.js` and
 *   `partition-participant-transaction-apply.js`).
 * - Gateway/query consumers receive ONLY local bookkeeping helpers
 *   (`clearTransactionMemoryReservations`, `clearSessionMemoryReservations`,
 *   `stageLocalWriteReservation`), read-only inspection, and typed result builders.
 * - No authority-switching flag (`authoritativeDbOnly`) or unscoped durable delete
 *   helper exists on this surface.
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
  ensureLockingReadTableInitialized,
  hasDbTransactionReservations,
  listDbTableReservationConflicts,
  truncateDbReservations,
} from './partition-locking-read-store.js';

export {LOCKING_READ_RESERVATION_KIND};

const DEFAULT_UNKNOWN_ROW_KEY = 'unknown';

// Map<rowKey, ReservationRecord> (process-local mirror cache; SQLite is authoritative)
const RESERVATIONS = new Map();

// Map<transactionId, Set<rowKey>>
const TRANSACTION_RESERVATIONS = new Map();

// Map<partitionId, Database> (read-only lookup / test cleanup registry; never mutated for release)
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

/**
 * Register a partition SQLite database for read-only conflict lookup and
 * test-harness cleanup. Never iterated for production reservation release.
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

function resolveReadOnlyStore(partitionId, explicitDb) {
  const store = explicitDb || PARTITION_DBS.get(partitionId) || null;
  return store && store.open !== false ? store : null;
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

/**
 * Record an observation mirror entry in process-local maps after authoritative
 * durable SQLite persistence has already committed.
 *
 * @param {Object|null} record - Reservation record.
 */
export function recordCommittedReservationMirror(record) {
  if (record?.transactionId && record?.rowKey) {
    trackMemoryReservation(record.transactionId, record.rowKey, record);
  }
}

function buildStagedConflict(rowKey, conflictingTransactionId) {
  return {
    success: false,
    conflict: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.CONFLICT,
    rowKey,
    conflictingTransactionId,
  };
}

function buildStagedAlreadyOwned(rowKey) {
  return {
    success: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.ALREADY_OWNED,
    rowKey,
    reentrant: true,
  };
}

function recordLocalWriteStaged(options, rowKey) {
  const {tableName, partitionId, pkValues, transactionId, sessionId} = options;
  trackMemoryReservation(transactionId, rowKey, {
    rowKey,
    tableName,
    partitionId,
    pkValues: Array.isArray(pkValues) ? pkValues : [pkValues],
    transactionId,
    sessionId: sessionId || null,
    participantId: `${transactionId}:${partitionId}`,
    kind: LOCKING_READ_RESERVATION_KIND.WRITE_STAGED,
    epoch: 0,
    acquiredAt: Date.now(),
    expiresAt: null,
    localExpiry: LOCKING_READ_LOCAL_EXPIRY.FORBIDDEN,
  });
  return {
    success: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.ACQUIRED,
    rowKey,
  };
}

/**
 * Record a process-local WRITE_STAGED mirror entry after an explicit transaction
 * stages a write statement. Never writes to SQLite or grants authoritative locks.
 *
 * @param {Object} options - Staging metadata.
 * @return {Object} Local staging outcome.
 */
export function stageLocalWriteReservation(options) {
  const {tableName, partitionId, pkValues, transactionId} = options;
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const store = resolveReadOnlyStore(partitionId, options.db || null);
  const dbCheck = store ?
    checkDbRowReservation(store, {partitionId, tableName, rowKey, transactionId}) :
    null;
  const existing = RESERVATIONS.get(rowKey) || null;
  if (dbCheck?.error) {
    return createReservationUnavailableResult({rowKey, message: dbCheck.message});
  } else if (dbCheck?.conflict) {
    return buildStagedConflict(rowKey, dbCheck.conflictingTransactionId);
  } else if (dbCheck?.reentrant) {
    return buildStagedAlreadyOwned(rowKey);
  } else if (existing) {
    return existing.transactionId === transactionId ?
      buildStagedAlreadyOwned(rowKey) :
      buildStagedConflict(rowKey, existing.transactionId);
  }
  return recordLocalWriteStaged(options, rowKey);
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
 * Pure process-local check for a same-gateway WRITE_STAGED mirror conflict.
 * Never consults PARTITION_DBS or any SQLite database.
 *
 * @param {Object} options - {tableName, partitionId, pkValues, transactionId}.
 * @return {{conflict: boolean, rowKey: string, conflictingTransactionId?: string}}
 */
export function checkLocalStagedWriteConflict({
  tableName,
  partitionId,
  pkValues,
  transactionId = null,
}) {
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const existing = RESERVATIONS.get(rowKey);
  if (
    existing &&
    existing.kind === LOCKING_READ_RESERVATION_KIND.WRITE_STAGED &&
    existing.transactionId !== transactionId
  ) {
    return {
      conflict: true,
      rowKey,
      conflictingTransactionId: existing.transactionId,
    };
  }
  return {conflict: false, rowKey};
}

/**
 * Pure read-only check whether a row lock key conflicts with another active transaction.
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
  const store = resolveReadOnlyStore(partitionId, db);
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
 * Pure read-only check for the first conflicting FOR_UPDATE reservation on a
 * table/partition in SQLite.
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
 * Clear ONLY process-local in-memory reservations for one partition and transaction.
 * Never touches PARTITION_DBS or any durable SQLite reservation rows.
 *
 * @param {string} partitionId - Partition identifier.
 * @param {string} transactionId - Transaction identifier.
 * @return {number} Count of cleared in-memory reservations.
 */
export function clearPartitionTransactionMemoryReservations(partitionId, transactionId) {
  if (!partitionId || !transactionId) {
    return 0;
  }
  let released = 0;
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) {
    return 0;
  }
  for (const rowKey of [...txSet]) {
    const existing = RESERVATIONS.get(rowKey);
    const ownedInPartition = existing &&
      existing.partitionId === partitionId &&
      existing.transactionId === transactionId;
    if (ownedInPartition) {
      RESERVATIONS.delete(rowKey);
      txSet.delete(rowKey);
      released += 1;
    }
  }
  if (txSet.size === 0) {
    TRANSACTION_RESERVATIONS.delete(transactionId);
  }
  return released;
}

/**
 * Clear ONLY process-local in-memory reservations for one partition and session.
 * Never touches PARTITION_DBS or any durable SQLite reservation rows.
 *
 * @param {string} partitionId - Partition identifier.
 * @param {string} sessionId - Session identifier.
 * @return {number} Count of cleared in-memory reservations.
 */
export function clearPartitionSessionMemoryReservations(partitionId, sessionId) {
  if (!partitionId || !sessionId) {
    return 0;
  }
  let released = 0;
  for (const [rowKey, rec] of [...RESERVATIONS.entries()]) {
    if (rec.partitionId === partitionId && rec.sessionId === sessionId) {
      untrackMemoryRow(rowKey, rec.transactionId);
      released += 1;
    }
  }
  return released;
}

/**
 * Clear ONLY process-local in-memory reservations for a transaction across all
 * partitions. Gateway/coordinator cleanup uses this; it NEVER touches
 * PARTITION_DBS or deletes durable SQLite reservation rows.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {number} Count of cleared in-memory reservations.
 */
export function clearTransactionMemoryReservations(transactionId) {
  if (!transactionId) {
    return 0;
  }
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
 * Clear ONLY process-local in-memory reservations for a session across all
 * partitions. Gateway/coordinator cleanup uses this; it NEVER touches
 * PARTITION_DBS or deletes durable SQLite reservation rows.
 *
 * @param {string} sessionId - Session identifier.
 * @return {number} Count of cleared in-memory reservations.
 */
export function clearSessionMemoryReservations(sessionId) {
  if (!sessionId) {
    return 0;
  }
  let released = 0;
  for (const [rowKey, rec] of [...RESERVATIONS.entries()]) {
    if (rec.sessionId === sessionId) {
      untrackMemoryRow(rowKey, rec.transactionId);
      released += 1;
    }
  }
  return released;
}

/**
 * Query process-local mirror reservations held by a transaction.
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
 * Pure read-only check whether a transaction currently holds any FOR_UPDATE
 * reservations (in memory mirror or optional durable partition DB).
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
 * Clear all reservations across all transactions and registered test DBs. Test support only.
 */
export function clearAllReservations() {
  clearMemoryReservations();
  for (const store of PARTITION_DBS.values()) {
    truncateDbReservations(store);
  }
  PARTITION_DBS.clear();
}
