/**
 * Participant write-intent reservation and fail-fast lock conflict handling
 * for PostgreSQL SELECT ... FOR UPDATE (Stages B3–B5).
 *
 * Implements Phase 0.3 locking read policy:
 * - Deterministic fail-fast row key reservations (${tableName}:${partitionId}:${JSON.stringify(pkValues)})
 * - No wait queues (waitQueue: false)
 * - Conflict refusal with sqlState: 55P03 (LOCK_NOT_AVAILABLE)
 * - Durable/replicated reservations until transaction resolution (localExpiry: forbidden)
 * - Re-entrant reservation by the same transaction
 * - Automatic release on COMMIT, ROLLBACK, timeout, cancellation, or recovery
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
  LOCKING_READ_ERROR_CODE,
  LOCKING_READ_SQL_STATE,
  LOCKING_READ_RESERVATION_KIND,
  LOCKING_READ_LOCAL_EXPIRY,
  LOCKING_READ_RESERVATION_OUTCOME,
};

const DEFAULT_UNKNOWN_ROW_KEY = 'unknown';

// Map<rowKey, ReservationRecord>
const RESERVATIONS = new Map();

// Map<transactionId, Set<rowKey>>
const TRANSACTION_RESERVATIONS = new Map();

/**
 * Derive the canonical row lock key for a primary-key tuple on a partition.
 *
 * @param {string} tableName - Target table.
 * @param {string} partitionId - Target partition.
 * @param {Array<*>|*} pkValues - Declared primary-key values tuple.
 * @return {string} Canonical row lock key: ${tableName}:${partitionId}:${JSON.stringify(pkValues)}
 */
export function deriveRowLockKey(tableName, partitionId, pkValues) {
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
    ...details,
  };
}

/**
 * Create a typed locking conflict Error instance.
 *
 * @param {Object} details - Error details.
 * @return {Error}
 */
export function createLockNotAvailableError(details = {}) {
  const result = createLockConflictResult(details);
  const error = new Error(result.error);
  error.code = result.code;
  error.errorCode = result.errorCode;
  error.sqlState = result.sqlState;
  error.conflict = true;
  return Object.assign(error, details);
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
 * @return {{success: boolean, outcome: string, rowKey: string, conflict?: boolean, conflictingTransactionId?: string, reentrant?: boolean}}
 */
export function acquireRowReservation({
  tableName,
  partitionId,
  pkValues,
  transactionId,
  sessionId = null,
  participantId = null,
  kind = LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
}) {
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const existing = RESERVATIONS.get(rowKey);

  if (existing) {
    return resolveExistingReservationOutcome(existing, transactionId, rowKey);
  }

  const record = {
    rowKey,
    tableName,
    partitionId,
    pkValues: Array.isArray(pkValues) ? pkValues : [pkValues],
    transactionId,
    sessionId,
    participantId: participantId || `${transactionId}:${partitionId}`,
    kind,
    acquiredAt: Date.now(),
    localExpiry: LOCKING_READ_LOCAL_EXPIRY.FORBIDDEN,
  };

  RESERVATIONS.set(rowKey, record);

  let txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) {
    txSet = new Set();
    TRANSACTION_RESERVATIONS.set(transactionId, txSet);
  }
  txSet.add(rowKey);

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
 * @return {{conflict: boolean, rowKey: string, conflictingTransactionId?: string}}
 */
export function checkRowReservationConflict({
  tableName,
  partitionId,
  pkValues,
  transactionId = null,
}) {
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const existing = RESERVATIONS.get(rowKey);

  if (existing && existing.transactionId !== transactionId) {
    return {
      conflict: true,
      rowKey,
      conflictingTransactionId: existing.transactionId,
    };
  }

  return {
    conflict: false,
    rowKey,
  };
}

/**
 * Release all locking-read and staged write reservations held by a transaction.
 * Invoked on COMMIT, ROLLBACK, timeout, cancellation, or recovery.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {number} Count of released reservations.
 */
export function releaseTransactionReservations(transactionId) {
  if (!transactionId) return 0;
  const txSet = TRANSACTION_RESERVATIONS.get(transactionId);
  if (!txSet) return 0;

  let released = 0;
  for (const rowKey of txSet) {
    const existing = RESERVATIONS.get(rowKey);
    if (existing && existing.transactionId === transactionId) {
      RESERVATIONS.delete(rowKey);
      released += 1;
    }
  }
  TRANSACTION_RESERVATIONS.delete(transactionId);
  return released;
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
 * Clear all reservations across all transactions. Test support only.
 */
export function clearAllReservations() {
  RESERVATIONS.clear();
  TRANSACTION_RESERVATIONS.clear();
}
