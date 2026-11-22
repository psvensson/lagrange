/**
 * Remote and cluster-authoritative locking-read reservation helpers.
 *
 * Resolves the authoritative partition leader (or local non-Raft store), dispatches
 * LOCKING_READ_RESERVATION RPCs over QueryExecutor, enforces fail-closed outcomes,
 * and cleans up partial or terminated reservations across local and remote partitions.
 *
 * @module query/sql-locking-read-remote
 */

import {randomUUID} from 'node:crypto';
import {
  createLockConflictResult,
  createReservationUnavailableResult,
} from '../partition/partition-locking-read-reservation.js';
import {
  inspectPartitionRowReservationConflict,
  inspectPartitionTableReservationConflict,
  requestLockingReadReservation,
} from '../partition/partition-locking-read-service.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  deliveryAnswerOf,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {
  LOCKING_READ_ERROR_MSG,
  LOCKING_READ_PARTITION_OP,
  LOCKING_READ_RESERVATION_OUTCOME,
  LOCKING_READ_RESERVATION_TYPE,
} from './sql-locking-read-constants.js';

const RESERVATION_RESULT_MODE = Object.freeze({
  LOCAL: 'local',
  REMOTE: 'remote',
});

const RESERVATION_ENTRY_PREFIX = 'locking-read-';

function iterateServiceCollection(services) {
  if (!services) return [];
  if (services instanceof Map || services instanceof Set) {
    return services.values();
  }
  return Array.isArray(services) ? services : [];
}

function isEligibleLocalLeaderService(service) {
  return Boolean(service) && (!service.raft || service.role === RAFT_ROLE.LEADER);
}

function matchesPartitionDirectEntry(direct, partitionId) {
  return Boolean(direct) && (!direct.partitionId || direct.partitionId === partitionId);
}

function pickServiceFromCollection(services, partitionId) {
  let hasLocalFollower = false;
  const direct = services instanceof Map ? services.get(partitionId) : null;
  if (matchesPartitionDirectEntry(direct, partitionId)) {
    if (isEligibleLocalLeaderService(direct)) {
      return {service: direct, hasLocalFollower: false};
    }
    hasLocalFollower = true;
  }
  for (const svc of iterateServiceCollection(services)) {
    if (svc?.partitionId === partitionId) {
      if (isEligibleLocalLeaderService(svc)) {
        return {service: svc, hasLocalFollower: false};
      }
      hasLocalFollower = true;
    }
  }
  return {service: null, hasLocalFollower};
}

function collectServiceSources(engine) {
  const providerServices = engine?.partitionServicesProvider ?
    engine.partitionServicesProvider() :
    null;
  const cdcResolver = engine?.cdcIntegrationService?.resolvePartitionServices;
  const cdcServices = cdcResolver ?
    engine.cdcIntegrationService.resolvePartitionServices() :
    null;
  return [
    providerServices,
    engine?.queryExecutor?.partitionServices,
    engine?.partitionServices,
    engine?.partitionManager?.partitionServices,
    cdcServices,
  ].filter(Boolean);
}

/**
 * Resolve the local authoritative leader PartitionService (or non-Raft local store)
 * for a partition, ignoring followers so cluster callers route to the leader.
 *
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {string} partitionId - Partition ID.
 * @return {{service: Object|null, hasLocalFollower: boolean}}
 */
export function resolvePartitionServiceEntry(engine, partitionId) {
  if (!engine || !partitionId) {
    return {service: null, hasLocalFollower: false};
  }
  let hasLocalFollower = false;
  for (const source of collectServiceSources(engine)) {
    const picked = pickServiceFromCollection(source, partitionId);
    if (picked.service) {
      return picked;
    }
    if (picked.hasLocalFollower) {
      hasLocalFollower = true;
    }
  }
  return {service: null, hasLocalFollower};
}

/**
 * Perform read-only row conflict inspection through the local authoritative
 * partition owner if co-located on this node; returns null when remote.
 *
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {Object} query - {partitionId, tableName, pkValues, transactionId}.
 * @return {Object|null}
 */
export function inspectLocalPartitionRowConflict(
  engine,
  {partitionId, tableName, pkValues, transactionId = null},
) {
  const {service} = resolvePartitionServiceEntry(engine, partitionId);
  if (!service) return null;
  return inspectPartitionRowReservationConflict(
    bindServicePartitionId(service, partitionId),
    {tableName, pkValues, transactionId},
  );
}

/**
 * Perform read-only table conflict inspection across co-located candidate
 * partition owners without exposing raw SQLite handles to query execution.
 *
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {Object} query - {candidatePartitions, tableName, transactionId}.
 * @return {{partitionId: string, match: Object}|null}
 */
export function inspectLocalCandidateTableConflict(
  engine,
  {candidatePartitions, tableName, transactionId = null},
) {
  if (!engine || !Array.isArray(candidatePartitions)) return null;
  const seen = new Set();
  for (const rawCandidate of candidatePartitions) {
    const partitionId = typeof rawCandidate === 'object' && rawCandidate !== null ?
      (rawCandidate.partition_id || rawCandidate.id) :
      rawCandidate;
    if (!partitionId || seen.has(partitionId)) continue;
    seen.add(partitionId);
    const {service} = resolvePartitionServiceEntry(engine, partitionId);
    if (!service) continue;
    const match = inspectPartitionTableReservationConflict(
      bindServicePartitionId(service, partitionId),
      {tableName, transactionId},
    );
    if (match) {
      return {partitionId, match};
    }
  }
  return null;
}

function createLockingReadDeliveryOptions(engine, partitionId, op, payload) {
  const safePayload = payload || {};
  const entryId = safePayload.entryId || `${RESERVATION_ENTRY_PREFIX}${randomUUID()}`;
  const request = {
    type: LOCKING_READ_RESERVATION_TYPE,
    op,
    partitionId,
    ...safePayload,
    entryId,
  };
  let acceptedAnswer = null;
  const routingReadinessDimension =
    engine.resolveTableRoutingReadinessDimension?.(safePayload.tableName) ||
    engine.defaultRoutingReadinessDimension;
  return {
    entryId,
    sessionId: safePayload.sessionId || null,
    tableName: safePayload.tableName || null,
    routingReadinessDimension,
    buildRequest: () => ({...request}),
    isSuccessfulResponse: (delivery) => {
      if (!isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery))) {
        return false;
      }
      const answer = deliveryAnswerOf(delivery);
      if (answer?.authoritativeReservationAnswer !== true) {
        return false;
      }
      acceptedAnswer = answer;
      return true;
    },
    buildSuccessResult: () => ({...acceptedAnswer}),
  };
}

/**
 * Execute a LOCKING_READ_RESERVATION RPC against a partition leader via QueryExecutor.
 *
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {string} partitionId - Target partition ID.
 * @param {string} op - LOCKING_READ_PARTITION_OP.
 * @param {Object} payload - Operation payload.
 * @return {Promise<Object>} Authoritative answer or typed unavailable refusal.
 */
export async function sendRemoteLockingReadOp(engine, partitionId, op, payload) {
  const executor = engine?.queryExecutor;
  if (!executor?.executeOnPartition || !partitionId) {
    return createReservationUnavailableResult({
      partitionId,
      message: LOCKING_READ_ERROR_MSG.RESERVATION_STORE_UNAVAILABLE,
    });
  }
  const deliveryOptions = createLockingReadDeliveryOptions(engine, partitionId, op, payload);
  const result = await executor.executeOnPartition(
    partitionId,
    '',
    [],
    false,
    true,
    false,
    deliveryOptions,
  );
  if (result?.authoritativeReservationAnswer === true) {
    return result;
  }
  const hasResultError = typeof result?.error === 'string' && result.error.length > 0;
  return createReservationUnavailableResult({
    partitionId,
    rowKey: payload?.rowKey || null,
    message: hasResultError ? result.error : LOCKING_READ_ERROR_MSG.RESERVATION_STORE_UNAVAILABLE,
  });
}

function bindServicePartitionId(service, partitionId) {
  return service.partitionId ? service : {...service, partitionId};
}

/**
 * Acquire one authoritative FOR_UPDATE reservation through the partition owner.
 * Fails closed if neither an eligible local partition owner nor RPC route succeeds.
 *
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {Object} params - Reservation parameters.
 * @return {Promise<{mode: string, result: Object}>}
 */
export async function acquireAuthoritativePartitionReservation(engine, params) {
  const {partitionId} = params;
  const {service} = resolvePartitionServiceEntry(engine, partitionId);
  const rpcPayload = {
    tableName: params.tableName,
    pkValues: params.pkValues,
    transactionId: params.transactionId,
    sessionId: params.sessionId,
    participantId: `${params.transactionId}:${partitionId}`,
    holdTimeoutMs: params.holdTimeoutMs,
    readGeneration: params.readGeneration,
  };
  if (service) {
    const result = await requestLockingReadReservation(
      bindServicePartitionId(service, partitionId),
      {
        op: LOCKING_READ_PARTITION_OP.ACQUIRE,
        ...rpcPayload,
      },
    );
    return {
      mode: service.raft ? RESERVATION_RESULT_MODE.REMOTE : RESERVATION_RESULT_MODE.LOCAL,
      result,
    };
  }
  const result = await sendRemoteLockingReadOp(
    engine,
    partitionId,
    LOCKING_READ_PARTITION_OP.ACQUIRE,
    rpcPayload,
  );
  return {mode: RESERVATION_RESULT_MODE.REMOTE, result};
}

async function releaseTransactionOnPartition(engine, partitionId, transactionId, sessionId) {
  const {service} = resolvePartitionServiceEntry(engine, partitionId);
  const payload = {
    transactionId,
    sessionId,
    participantId: `${transactionId}:${partitionId}`,
  };
  if (service) {
    await requestLockingReadReservation(
      bindServicePartitionId(service, partitionId),
      {
        op: LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION,
        ...payload,
      },
    );
    return;
  }
  await sendRemoteLockingReadOp(
    engine,
    partitionId,
    LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION,
    payload,
  );
}

/**
 * Roll back partially acquired locking-read reservations after an acquisition failure
 * exclusively through each partition's canonical reservation owner.
 *
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {Array<Object>} acquiredEntries - Entries newly acquired in this statement.
 * @param {string} transactionId - Owning transaction ID.
 * @param {string|null} sessionId - Owning session ID.
 * @return {Promise<void>}
 */
export async function rollbackAcquiredReservations(
  engine,
  acquiredEntries,
  transactionId,
  sessionId,
) {
  if (!Array.isArray(acquiredEntries) || acquiredEntries.length === 0) {
    return;
  }
  const affectedPartitions = new Set();
  for (const entry of acquiredEntries) {
    if (entry.partitionId) {
      affectedPartitions.add(entry.partitionId);
    }
  }
  for (const partitionId of affectedPartitions) {
    await releaseTransactionOnPartition(engine, partitionId, transactionId, sessionId);
  }
}

const ACQUISITION_CLEARED = Object.freeze({cleared: true});

function buildUnavailableFromAcquisition(acq, partitionId, tableName, transactionId) {
  const hasAcqMsg = typeof acq?.error === 'string' && acq.error.length > 0;
  return createReservationUnavailableResult({
    rowKey: acq?.rowKey,
    partitionId,
    tableName,
    transactionId,
    message: hasAcqMsg ? acq.error : LOCKING_READ_ERROR_MSG.RESERVATION_STORE_UNAVAILABLE,
  });
}

async function acquireSingleRowForStatement(ctx, pkValues, acquiredEntries) {
  const {
    engine, tableName, resolvePartitionId, transactionId,
    sessionId, holdTimeoutMs, readGenerationsByPartition, onConflict,
  } = ctx;
  const partitionId = resolvePartitionId(pkValues);
  const {mode, result: acq} = await acquireAuthoritativePartitionReservation(engine, {
    tableName, partitionId, pkValues, transactionId,
    sessionId, holdTimeoutMs, readGeneration: readGenerationsByPartition[partitionId],
  });
  if (acq?.conflict) {
    await rollbackAcquiredReservations(engine, acquiredEntries, transactionId, sessionId);
    if (onConflict) {
      await onConflict();
    }
    return createLockConflictResult({
      rowKey: acq.rowKey, transactionId,
      conflictingTransactionId: acq.conflictingTransactionId, message: acq.error,
    });
  }
  if (!acq || acq.success !== true || acq.unavailable === true) {
    await rollbackAcquiredReservations(engine, acquiredEntries, transactionId, sessionId);
    return buildUnavailableFromAcquisition(acq, partitionId, tableName, transactionId);
  }
  if (acq.outcome === LOCKING_READ_RESERVATION_OUTCOME.ACQUIRED) {
    acquiredEntries.push({mode, partitionId, tableName, rowKey: acq.rowKey, transactionId});
  }
  return ACQUISITION_CLEARED;
}

/**
 * Acquire FOR_UPDATE reservations sequentially across all selected rows, rolling back
 * any partial acquisitions on conflict or store unavailability.
 *
 * @param {Object} ctx - Acquisition context.
 * @return {Promise<Object|null>} Failure/conflict result or null on full success.
 */
export async function acquireAllRowReservations(ctx) {
  const normalizedCtx = {
    ...ctx,
    readGenerationsByPartition: ctx.readGenerationsByPartition || {},
  };
  const acquiredEntries = [];
  for (const pkValues of normalizedCtx.canonicalTuples) {
    const outcome = await acquireSingleRowForStatement(
      normalizedCtx,
      pkValues,
      acquiredEntries,
    );
    if (outcome !== ACQUISITION_CLEARED) return outcome;
  }
  return null;
}
