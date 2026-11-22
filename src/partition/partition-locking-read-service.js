/**
 * Authoritative partition leader and Raft apply handler for LOCKING_READ_RESERVATION
 * commands and RPC requests.
 *
 * @module partition/partition-locking-read-service
 */

import {PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY} from './partition-service-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
  committedCommandRefusalResult,
} from './partition-committed-command-admission.js';
import {
  readSettledOwnerCommandIn,
  recordCommittedStatementOutcome,
  statementEnvironmentFailure,
} from './partition-committed-statement-outcome.js';
import {PARTITION_SETTLED_COMMAND_STATE as SETTLED} from
  './partition-committed-statement-outcome-constants.js';
import {
  partitionWriteLeadershipRefusalOf,
  startPartitionRaftWriteCommit,
} from './partition-service-raft-write-commit.js';
import {
  DB_LOCKING_READ_ACQUIRE_STATUS,
  LOCKING_READ_PARTITION_OP,
  LOCKING_READ_RESERVATION_COMMAND_ERROR as CMD_ERROR,
  LOCKING_READ_RESERVATION_TYPE,
} from './partition-locking-read-command-constants.js';
import {
  buildLockingReadCommand,
  isPinnedLockingReadCommand,
} from './partition-locking-read-command.js';
import {
  LOCKING_READ_LOCAL_EXPIRY,
  LOCKING_READ_RESERVATION_KIND,
  LOCKING_READ_RESERVATION_OUTCOME,
} from '../query/sql-locking-read-constants.js';
import {
  clearPartitionSessionMemoryReservations,
  clearPartitionTransactionMemoryReservations,
  createLockConflictResult,
  createReservationUnavailableResult,
  deriveRowLockKey,
  recordCommittedReservationMirror,
} from './partition-locking-read-reservation.js';
import {
  acquireDbForUpdateReservation,
  checkDbRowReservation,
  hasDbSessionReservations,
  hasDbTransactionReservations,
  listDbTableReservationConflicts,
  releaseDbPartitionSessionReservations,
  releaseDbPartitionTransactionReservations,
} from './partition-locking-read-store.js';
import {
  buildStaleReadLockConflict,
  checkPartitionWriteLockingReadConflict,
  findConflictingPreparedWrite,
  findConflictingStagedOrPreparedWrite,
  hasRowModificationSinceGeneration,
} from './partition-locking-read-write-check.js';

const {PARTITION_SERVICE_RESPONSE, RaftRole} = PARTITION_SERVICE_SHARED;
const INVALID_COMMAND_PAYLOAD_MSG = 'Invalid locking-read reservation command payload';

function resolveLeadershipOrRedirect(service) {
  if (!service?.raft) {
    return null;
  }
  if (service.role !== RaftRole.LEADER) {
    try {
      const leaderAddress = service.resolveLeaderAddress();
      return {
        success: false,
        redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT,
        leaderAddress,
        partitionId: service.partitionId,
      };
    } catch (_err) {
      return partitionWriteLeadershipRefusalOf(service);
    }
  }
  return partitionWriteLeadershipRefusalOf(service);
}

function buildSettledConflict(partitionId, rowKey, transactionId, conflictingTransactionId) {
  return {
    settled: {
      ...createLockConflictResult({
        rowKey,
        partitionId,
        transactionId,
        conflictingTransactionId,
      }),
      authoritativeReservationAnswer: true,
    },
  };
}

function precheckAcquire(service, payload) {
  const rowKey = deriveRowLockKey(
    payload.tableName,
    service.partitionId,
    payload.pkValues,
  );
  const dbCheck = checkDbRowReservation(service.db, {
    partitionId: service.partitionId,
    tableName: payload.tableName,
    rowKey,
    transactionId: payload.transactionId,
  });
  if (dbCheck?.error) {
    return {
      settled: {
        ...createReservationUnavailableResult({
          rowKey,
          partitionId: service.partitionId,
          message: dbCheck.message,
        }),
        authoritativeReservationAnswer: true,
      },
    };
  }
  if (dbCheck?.conflict) {
    return buildSettledConflict(
      service.partitionId,
      rowKey,
      payload.transactionId,
      dbCheck.conflictingTransactionId,
    );
  }
  const stagedConflictTxId = dbCheck?.reentrant === true ?
    null :
    findConflictingStagedOrPreparedWrite(service, {
      tableName: payload.tableName,
      pkValues: payload.pkValues,
      transactionId: payload.transactionId,
    });
  if (stagedConflictTxId !== null) {
    return buildSettledConflict(
      service.partitionId,
      rowKey,
      payload.transactionId,
      stagedConflictTxId,
    );
  }
  if (Number.isSafeInteger(payload.readGeneration) &&
      hasRowModificationSinceGeneration(service.db, payload.readGeneration, payload.pkValues)) {
    return {
      settled: buildStaleReadLockConflict(
        service.partitionId,
        rowKey,
        payload.transactionId,
      ),
    };
  }
  return {rowKey, settled: null};
}

function buildForUpdateRecord(service, payload, rowKey, nowMs) {
  const expiresAt = typeof payload.holdTimeoutMs === 'number' && payload.holdTimeoutMs > 0 ?
    nowMs + payload.holdTimeoutMs :
    null;
  return {
    rowKey,
    tableName: payload.tableName,
    partitionId: service.partitionId,
    pkValues: Array.isArray(payload.pkValues) ? payload.pkValues : [payload.pkValues],
    transactionId: payload.transactionId,
    sessionId: payload.sessionId || null,
    participantId: payload.participantId || `${payload.transactionId}:${service.partitionId}`,
    kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
    epoch: payload.epoch || 0,
    acquiredAt: nowMs,
    expiresAt,
    localExpiry: LOCKING_READ_LOCAL_EXPIRY.FORBIDDEN,
  };
}

function formatDbAcquisitionAnswer(service, payload, dbOutcome, {deterministic}) {
  if (dbOutcome.status === DB_LOCKING_READ_ACQUIRE_STATUS.UNAVAILABLE) {
    if (deterministic) {
      throw statementEnvironmentFailure(dbOutcome.cause ?? new Error(dbOutcome.error));
    }
    return {
      ...createReservationUnavailableResult({
        rowKey: dbOutcome.rowKey,
        partitionId: service.partitionId,
        tableName: payload.tableName,
        transactionId: payload.transactionId,
        message: dbOutcome.error,
      }),
      authoritativeReservationAnswer: true,
    };
  }
  if (dbOutcome.status === DB_LOCKING_READ_ACQUIRE_STATUS.CONFLICT) {
    return {
      ...createLockConflictResult({
        rowKey: dbOutcome.rowKey,
        partitionId: service.partitionId,
        transactionId: payload.transactionId,
        conflictingTransactionId: dbOutcome.conflictingTransactionId,
      }),
      authoritativeReservationAnswer: true,
    };
  }
  if (dbOutcome.status === DB_LOCKING_READ_ACQUIRE_STATUS.ALREADY_OWNED) {
    return {
      success: true,
      outcome: LOCKING_READ_RESERVATION_OUTCOME.ALREADY_OWNED,
      rowKey: dbOutcome.rowKey,
      reentrant: true,
      partitionId: service.partitionId,
      authoritativeReservationAnswer: true,
    };
  }
  return {
    success: true,
    outcome: LOCKING_READ_RESERVATION_OUTCOME.ACQUIRED,
    rowKey: dbOutcome.rowKey,
    partitionId: service.partitionId,
    authoritativeReservationAnswer: true,
  };
}

function executeDirectLockingReadOp(service, payload) {
  if (payload.op === LOCKING_READ_PARTITION_OP.ACQUIRE) {
    const pre = precheckAcquire(service, payload);
    if (pre.settled) {
      return pre.settled;
    }
    const record = buildForUpdateRecord(service, payload, pre.rowKey, Date.now());
    const dbOutcome = acquireDbForUpdateReservation(service.db, record);
    if (dbOutcome.status === DB_LOCKING_READ_ACQUIRE_STATUS.ACQUIRED) {
      recordCommittedReservationMirror(record);
    }
    return formatDbAcquisitionAnswer(service, payload, dbOutcome, {deterministic: false});
  }
  if (payload.op === LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION) {
    const released = releaseDbPartitionTransactionReservations(
      service.db,
      service.partitionId,
      payload.transactionId,
    );
    clearPartitionTransactionMemoryReservations(service.partitionId, payload.transactionId);
    return {
      success: true,
      released,
      partitionId: service.partitionId,
      authoritativeReservationAnswer: true,
    };
  }
  const released = releaseDbPartitionSessionReservations(
    service.db,
    service.partitionId,
    payload.sessionId,
  );
  clearPartitionSessionMemoryReservations(service.partitionId, payload.sessionId);
  return {
    success: true,
    released,
    partitionId: service.partitionId,
    authoritativeReservationAnswer: true,
  };
}

function hasPendingReleaseWork(service, payload) {
  if (payload.op === LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION) {
    return hasDbTransactionReservations(service.db, payload.transactionId, service.partitionId);
  }
  if (payload.op === LOCKING_READ_PARTITION_OP.RELEASE_SESSION) {
    return hasDbSessionReservations(service.db, payload.sessionId, service.partitionId);
  }
  return true;
}

function cleanLocalReleaseCache(service, payload) {
  if (payload.op === LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION) {
    clearPartitionTransactionMemoryReservations(service.partitionId, payload.transactionId);
  } else if (payload.op === LOCKING_READ_PARTITION_OP.RELEASE_SESSION) {
    clearPartitionSessionMemoryReservations(service.partitionId, payload.sessionId);
  }
}

function resolveReleaseShortCircuit(service, normalized) {
  if (normalized.op === LOCKING_READ_PARTITION_OP.ACQUIRE ||
      hasPendingReleaseWork(service, normalized)) {
    return null;
  }
  cleanLocalReleaseCache(service, normalized);
  return {
    success: true,
    released: 0,
    partitionId: service.partitionId,
    authoritativeReservationAnswer: true,
  };
}

function precheckLockingReadRequest(service, normalized) {
  const noopRelease = resolveReleaseShortCircuit(service, normalized);
  if (noopRelease !== null) {
    return noopRelease;
  }
  if (!service.raft) {
    return executeDirectLockingReadOp(service, normalized);
  }
  return normalized.op === LOCKING_READ_PARTITION_OP.ACQUIRE ?
    precheckAcquire(service, normalized).settled :
    null;
}

function proposeLockingReadCommand(service, command) {
  const admission = admitCommittedCommand(command, {
    origin: PARTITION_COMMITTED_COMMAND_ORIGIN.LOCKING_READ_OWNER,
  });
  if (!admission.admitted) {
    return committedCommandRefusalResult(admission, service.partitionId);
  }
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) {
    return pending;
  }
  return startPartitionRaftWriteCommit(service, {
    entry: command,
    phaseTimings: null,
    applyStartMs: service.timeSource.now(),
    park: false,
  });
}

/**
 * Handle an inbound LOCKING_READ_RESERVATION request on the PartitionService leader.
 * Proposes a Raft-replicated command when Consensus (service.raft) is active.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} payload - Reservation request payload.
 * @return {Promise<Object>} Reservation answer.
 */
export async function requestLockingReadReservation(service, payload) {
  if (!service?.db || service.db.open === false) {
    return {
      ...createReservationUnavailableResult({partitionId: service?.partitionId}),
      authoritativeReservationAnswer: true,
    };
  }
  const routingRefusal = resolveLeadershipOrRedirect(service);
  if (routingRefusal !== null) {
    return routingRefusal;
  }
  const normalized = {...(payload || {}), partitionId: service.partitionId};
  const immediate = precheckLockingReadRequest(service, normalized);
  if (immediate !== null) {
    return immediate;
  }
  const command = buildLockingReadCommand(service, normalized);
  if (command === null) {
    return {
      ...createReservationUnavailableResult({
        partitionId: service.partitionId,
        failureCode: CMD_ERROR.BYTES,
        message: INVALID_COMMAND_PAYLOAD_MSG,
      }),
      authoritativeReservationAnswer: true,
    };
  }
  return proposeLockingReadCommand(service, command);
}

function checkCommittedAcquirePreconditions(service, reservation, rowKey) {
  const dbCheck = checkDbRowReservation(service.db, {
    partitionId: service.partitionId,
    tableName: reservation.tableName,
    rowKey,
    transactionId: reservation.transactionId,
  });
  if (dbCheck?.error) {
    throw statementEnvironmentFailure(dbCheck.cause ?? new Error(dbCheck.message));
  }
  if (dbCheck?.reentrant === true) {
    return null;
  }
  if (Number.isSafeInteger(reservation.readGeneration) &&
      hasRowModificationSinceGeneration(
        service.db,
        reservation.readGeneration,
        reservation.pkValues,
      )) {
    return buildStaleReadLockConflict(service.partitionId, rowKey, reservation.transactionId);
  }
  const tableName = typeof service.tableName === 'string' && service.tableName.length > 0 ?
    service.tableName :
    reservation.tableName;
  const preparedConflictTxId = findConflictingPreparedWrite(
    service.db,
    tableName,
    reservation.pkValues,
    reservation.transactionId,
  );
  return preparedConflictTxId === null ?
    null :
    buildSettledConflict(
      service.partitionId,
      rowKey,
      reservation.transactionId,
      preparedConflictTxId,
    ).settled;
}

function applyCommittedAcquire(service, reservation, proposedAt, afterCommit) {
  const rowKey = deriveRowLockKey(
    reservation.tableName,
    service.partitionId,
    reservation.pkValues,
  );
  const preconditionRefusal = checkCommittedAcquirePreconditions(service, reservation, rowKey);
  if (preconditionRefusal !== null) {
    return preconditionRefusal;
  }
  const record = buildForUpdateRecord(service, reservation, rowKey, proposedAt);
  const dbOutcome = acquireDbForUpdateReservation(service.db, record);
  if (dbOutcome.status === DB_LOCKING_READ_ACQUIRE_STATUS.ACQUIRED) {
    afterCommit(() => recordCommittedReservationMirror(record));
  }
  return formatDbAcquisitionAnswer(service, reservation, dbOutcome, {deterministic: true});
}

function applyCommittedReservationEffect(service, reservation, proposedAt, afterCommit) {
  if (reservation.op === LOCKING_READ_PARTITION_OP.ACQUIRE) {
    return applyCommittedAcquire(service, reservation, proposedAt, afterCommit);
  }
  if (reservation.op === LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION) {
    const released = releaseDbPartitionTransactionReservations(
      service.db,
      service.partitionId,
      reservation.transactionId,
    );
    afterCommit(() =>
      clearPartitionTransactionMemoryReservations(service.partitionId, reservation.transactionId),
    );
    return {
      success: true,
      released,
      partitionId: service.partitionId,
      authoritativeReservationAnswer: true,
    };
  }
  const released = releaseDbPartitionSessionReservations(
    service.db,
    service.partitionId,
    reservation.sessionId,
  );
  afterCommit(() =>
    clearPartitionSessionMemoryReservations(service.partitionId, reservation.sessionId),
  );
  return {
    success: true,
    released,
    partitionId: service.partitionId,
    authoritativeReservationAnswer: true,
  };
}

function parseSettledOwnerAnswer(recorded) {
  return JSON.parse(recorded.ownerResultText);
}

/**
 * Deterministically apply a committed LOCKING_READ_RESERVATION command on all replicas
 * inside the single SQLite Raft application transaction.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} committed - {command, index, term, afterCommit, afterRollback}.
 * @return {string} PARTITION_COMMITTED_COMMAND_OUTCOME.
 */
export function applyLockingReadReservationCommand(service, committed) {
  const {command, index, term, afterCommit, afterRollback} = committed;
  if (command.type !== LOCKING_READ_RESERVATION_TYPE ||
      command.partitionId !== service.partitionId ||
      !isPinnedLockingReadCommand(command)) {
    throw new Error(CMD_ERROR.BYTES);
  }
  const entryKey = service.getCommittedEntryKey(command);
  const settled = readSettledOwnerCommandIn(service.db, {
    entryId: command.entryId,
    commandDigest: command.commandDigest,
  });
  if (settled.state === SETTLED.OTHER_RECORD) {
    throw new Error(CMD_ERROR.BYTES);
  }
  if (settled.state === SETTLED.SAME_COMMAND) {
    const replayedAnswer = parseSettledOwnerAnswer(settled.recorded);
    afterCommit(() => service.resolveCommittedWrite(command.entryId, replayedAnswer));
    return APPLY.REPLAYED;
  }
  try {
    const answer = applyCommittedReservationEffect(
      service, command.reservation, command.proposedAt, afterCommit,
    );
    recordCommittedStatementOutcome(service, {
      entryKey,
      outcome: APPLY.APPLIED,
      index,
      term,
      ownerResultText: JSON.stringify(answer),
      commandDigest: command.commandDigest,
    });
    afterCommit(() => service.resolveCommittedWrite(command.entryId, {
      ...answer,
      committed: true,
      logIndex: index,
      term,
    }));
    return APPLY.APPLIED;
  } catch (error) {
    afterRollback(() => service.rejectCommittedWrite(command.entryId, error));
    throw error;
  }
}

function hasDbReservationsForTransaction(db, partitionId, transactionId) {
  return Boolean(db) &&
    db.open !== false &&
    hasDbTransactionReservations(db, transactionId, partitionId);
}

/**
 * Release any locking-read reservations held by a transaction during an unbound rollback.
 * Replicates the release via Raft when consensus is active and durable rows exist.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} payload - Participant rollback request payload.
 * @return {Promise<void>}
 */
export async function releaseUnboundTransactionLockingRead(service, payload) {
  const transactionId = payload?.transactionId;
  if (!transactionId) return null;
  const db = service?.db ?? null;
  const partitionId = service?.partitionId ?? null;
  if (!service?.raft) {
    if (db && db.open !== false && partitionId) {
      releaseDbPartitionTransactionReservations(db, partitionId, transactionId);
    }
    clearPartitionTransactionMemoryReservations(partitionId, transactionId);
    return null;
  }
  if (!hasDbReservationsForTransaction(db, partitionId, transactionId)) {
    clearPartitionTransactionMemoryReservations(partitionId, transactionId);
    return null;
  }
  const releaseAnswer = await requestLockingReadReservation(service, {
    op: LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION,
    transactionId,
    sessionId: payload.sessionId ?? null,
    participantId: payload.participantId ?? null,
  });
  return releaseAnswer?.success === true ? null : releaseAnswer;
}

/**
 * Read-only partition-owner inspection for a single row reservation conflict
 * against this partition service's durable SQLite store.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} query - {tableName, pkValues, transactionId}.
 * @return {{conflict: boolean, rowKey: string, conflictingTransactionId?: string, unavailable?: boolean, error?: string}}
 */
export function inspectPartitionRowReservationConflict(
  service,
  {tableName, pkValues, transactionId = null},
) {
  const rowKey = deriveRowLockKey(tableName, service.partitionId, pkValues);
  if (!service?.db || service.db.open === false) {
    return {conflict: false, rowKey};
  }
  const dbCheck = checkDbRowReservation(service.db, {
    partitionId: service.partitionId,
    tableName,
    rowKey,
    transactionId,
  });
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
  return {conflict: false, rowKey};
}

/**
 * Read-only partition-owner inspection for the first conflicting FOR_UPDATE
 * reservation on a table in this partition service's durable SQLite store.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} query - {tableName, transactionId}.
 * @return {Object|null}
 */
export function inspectPartitionTableReservationConflict(
  service,
  {tableName, transactionId = null},
) {
  if (!service?.db || service.db.open === false) {
    return null;
  }
  const listed = listDbTableReservationConflicts(service.db, {
    partitionId: service.partitionId,
    tableName,
    transactionId,
  });
  if (!listed.ok) {
    return {error: true, message: listed.error};
  }
  return listed.rows[0] || null;
}

export {checkPartitionWriteLockingReadConflict};
