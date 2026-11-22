/**
 * Process-local locking-read mirror and pure key/error outcome helpers for
 * PostgreSQL SELECT ... FOR UPDATE (P1/P2 authoritative split).
 *
 * Capability boundary:
 * - Authoritative durable FOR_UPDATE acquisition, durable SQLite reads, and
 *   durable SQLite release live solely in partition-private
 *   `partition-locking-read-store.js` and are invoked only by partition owners
 *   (`partition-locking-read-service.js`, `partition-locking-read-write-check.js`,
 *   `partition-participant-transaction-apply.js`, and
 *   `partition-participant-transaction-session.js`).
 * - This module has ZERO imports from `partition-locking-read-store.js` and
 *   ZERO SQLite database access or partition DB registry: it exposes ONLY
 *   volatile process-local mirror bookkeeping (`clearTransactionMemoryReservations`,
 *   `clearSessionMemoryReservations`, `clearMemoryReservations`,
 *   `stageLocalWriteReservation`, `checkLocalStagedWriteConflict`,
 *   `checkMemoryRowReservationConflict`, `hasLockingReadReservations`),
 *   canonical key derivation (`deriveRowLockKey`), and typed result builders.
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

export {LOCKING_READ_RESERVATION_KIND};

const DEFAULT_UNKNOWN_ROW_KEY = 'unknown';

// Map<rowKey, ReservationRecord> (process-local mirror cache; SQLite is authoritative)
const RESERVATIONS = new Map();

// Map<transactionId, Set<rowKey>>
const TRANSACTION_RESERVATIONS = new Map();

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
 * stages a write statement. Purely volatile — never accesses SQLite.
 *
 * @param {Object} options - Staging metadata.
 * @return {Object} Local staging outcome.
 */
export function stageLocalWriteReservation(options) {
  const {tableName, partitionId, pkValues, transactionId} = options;
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const existing = RESERVATIONS.get(rowKey) || null;
  if (existing) {
    return existing.transactionId === transactionId ?
      buildStagedAlreadyOwned(rowKey) :
      buildStagedConflict(rowKey, existing.transactionId);
  }
  return recordLocalWriteStaged(options, rowKey);
}

/**
 * Pure process-local check for a same-gateway WRITE_STAGED mirror conflict.
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
 * Pure volatile memory-mirror check whether a row lock key conflicts with
 * another active transaction in this process. Never accesses SQLite.
 *
 * @param {Object} options - Check options.
 * @return {{conflict: boolean, rowKey: string, conflictingTransactionId?: string}}
 */
export function checkMemoryRowReservationConflict({
  tableName,
  partitionId,
  pkValues,
  transactionId = null,
  onlyForUpdate = false,
}) {
  const rowKey = deriveRowLockKey(tableName, partitionId, pkValues);
  const existing = RESERVATIONS.get(rowKey);
  if (!existing || existing.transactionId === transactionId) {
    return {conflict: false, rowKey};
  }
  if (onlyForUpdate && existing.kind !== LOCKING_READ_RESERVATION_KIND.FOR_UPDATE) {
    return {conflict: false, rowKey};
  }
  return {
    conflict: true,
    rowKey,
    conflictingTransactionId: existing.transactionId,
  };
}

/**
 * Clear ONLY process-local in-memory reservations for one partition and transaction.
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
 * partitions. Gateway/coordinator cleanup uses this; it never touches durable state.
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
 * partitions. Gateway/coordinator cleanup uses this; it never touches durable state.
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
 * Pure volatile memory-mirror check whether a transaction currently holds any
 * FOR_UPDATE reservations in this process. Never accesses SQLite.
 *
 * @param {string} transactionId - Transaction identifier.
 * @return {boolean}
 */
export function hasLockingReadReservations(transactionId) {
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
  return false;
}

/**
 * Clear ONLY process-local in-memory reservation maps, preserving all durable
 * SQLite reservation rows.
 */
export function clearMemoryReservations() {
  RESERVATIONS.clear();
  TRANSACTION_RESERVATIONS.clear();
}
