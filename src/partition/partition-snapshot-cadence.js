// Leader checkpoint cadence owner (quest raft-snapshot-live-rebuild, spec
// solve/specs/raft-snapshot-transfer-install/live-rebuild-design.md, S6
// Phase A link 1; raft-rs ownership in SN1 / F5). A tick riding the existing
// 1s prepared-state-hold sweep
// (partition-service-participant-transaction-cadence-methods.js). The sweep
// fires on ALL roles every second and checkpoint creation is async and can
// exceed a second, so THE TICK owns its own role gate (leader-only,
// re-checked after the creation await since role can change mid-creation) AND
// an in-flight flag. In-memory and control-plane partitions are typed
// refusals. On fire: one S1 checkpoint with the cache-derived identity and
// raft-rs group witness, the S5 retention sweep with the FULL pin set, and
// proof-gated compaction on the raft-rs durable store.
//
// Decision table (evaluated top-down, first row wins):
//   in-memory dbPath or control-plane partition -> UNSUPPORTED_PARTITION
//   tick already in flight                      -> ALREADY_IN_FLIGHT
//   role !== leader, shut down, or db closed    -> NOT_LEADER
//   no raft-rs durable record present           -> COMMITTED_LOG_UNSUPPORTED
//   entries < entryThreshold AND logBytes < byteThreshold:
//     valid uncompacted checkpoint exists       -> COMPACTED / CHECKPOINTED
//     otherwise                                 -> BELOW_THRESHOLD
//   a refusal stands and nothing lifts it       -> HELD_AFTER_REFUSAL
//   creation outcome !== CREATED                -> CREATION_REFUSED
//   role lost across the creation await         -> LEADERSHIP_LOST_MID_CREATION
//   compaction outcome === COMPACTED            -> COMPACTED (+ sweep)
//   otherwise                                   -> CHECKPOINTED (+ sweep)
//
// A refused image attempt (CREATION_REFUSED, or a failure thrown from it)
// leaves a standing refusal (partition-snapshot-cadence-refusal.js), stamped
// when the attempt COMPLETES: the image is not rebuilt every sweep while its
// reason cannot have changed, and any compaction ends it. This owner is the
// partition's ONE image creation owner: a generation the catch-up dispatch
// needs is sealed through sealForCatchup under the same refusal and the same
// in-flight exclusion.
// Every outcome but COMPACTED and the quiet states is one typed log line
// (folded while it persists); readDiagnostics() answers the last outcome,
// the last compaction and the standing refusal.

import {RAFT_COMPACTION_OUTCOME} from '../raft/compaction-policy.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  createCheckpointSealer,
  listInFlightGenerationIndexes,
  snapshotCheckpointIdentityKey,
} from '../raft/snapshot-catchup.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
} from '../raft/snapshot-checkpoint-constants.js';
import {
  compactRaftRsCommittedEntries,
} from '../raft/snapshot-compaction.js';
import {resolveReplicaCheckpointsRoot} from '../raft/snapshot-install.js';
import {
  gatherRetentionPins,
  sweepCheckpointGenerations,
} from '../raft/snapshot-retention.js';

import {
  NOT_REFUSED,
  QUIET_OUTCOMES,
  REFUSED_ATTEMPT_OUTCOMES,
  outcomeReason,
  tickFailed,
  tickResult,
} from './partition-snapshot-cadence-outcome.js';
import {
  evaluateCadenceThresholds,
  isLeaderReady,
  isUnsupportedPartition,
  resolveCadenceIdentity,
} from './partition-snapshot-cadence-coverage.js';
import {
  NO_STANDING_REFUSAL,
  PARTITION_SNAPSHOT_CADENCE_ATTEMPT as ATTEMPT,
  cadenceAttemptDecision,
  standingRefusal,
} from './partition-snapshot-cadence-refusal.js';
import {createPartitionSnapshotOutcomeLog} from './partition-snapshot-outcome-log.js';
import {
  PARTITION_SNAPSHOT_PROGRESS_EVENT as EVENT,
  PARTITION_SNAPSHOT_PROGRESS_LOG_MSG as LOG_MSG,
  RAFT_SNAPSHOT_CADENCE_OUTCOME as OUTCOME,
} from './partition-snapshot-progress-constants.js';

function compactToGeneration(service, creation) {
  return compactRaftRsCommittedEntries(
    service.db,
    service.partitionId,
    {
      toIndex: creation.descriptor.lastIncludedIndex,
      proof: {checkpointDir: creation.checkpointDir},
    },
  );
}

function sweepAndCompactCheckpoint(service, checkpointsRoot, creation) {
  const sweep = sweepCheckpointGenerations({
    checkpointsRoot,
    installTarget: {replicaId: service.replicaId, partitionId: service.partitionId},
    pinnedGenerationIndexes: gatherRetentionPins({
      checkpointsRoot,
      installTarget: {replicaId: service.replicaId, partitionId: service.partitionId},
      inProcessPins: listInFlightGenerationIndexes(),
    }),
  });
  const compaction = compactToGeneration(service, creation);
  const compacted =
    compaction.outcome === RAFT_COMPACTION_OUTCOME.COMPACTED;
  const targetIndex = creation.descriptor.lastIncludedIndex;
  const compactedIndex = compacted ?
    targetIndex :
    Number(RaftRsDurableStore.readSnapshotIndexIn(
      service.db, service.partitionId));
  return tickResult(
    compacted ?
      OUTCOME.COMPACTED :
      OUTCOME.CHECKPOINTED,
    {
      creation,
      sweep,
      compaction,
      checkpointedIndex: targetIndex,
      compactedIndex,
      ...(compacted ? {compactedUpToIndex: targetIndex} : {}),
    },
  );
}

async function runCheckpointAndCompaction(
  service,
  checkpointsRoot,
  identity,
  options,
) {
  const creation = await createCheckpointSealer(service.db,
    {replicaId: service.replicaId, partitionId: service.partitionId})({
    identity,
    checkpointsRoot,
    inProcessPins: listInFlightGenerationIndexes(),
  });
  if (creation.outcome !== RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED) {
    return tickResult(OUTCOME.CREATION_REFUSED, {
      creation,
    });
  }
  await options?.onAfterCreateCheckpoint?.(creation);
  if (!isLeaderReady(service)) {
    return tickResult(
      OUTCOME.LEADERSHIP_LOST_MID_CREATION,
      {
        creation,
        checkpointedIndex: creation.descriptor.lastIncludedIndex,
      },
    );
  }
  return sweepAndCompactCheckpoint(service, checkpointsRoot, creation);
}

/**
 * Create the checkpoint cadence owner for one partition service. The
 * returned tick NEVER rejects — every path is a typed frozen outcome, so the
 * fire-and-forget sweep call site cannot leak a rejection.
 * @param {Object} options cadence options
 * @param {Object} options.service the owning PartitionService
 * @param {number} [options.entryThreshold] committed-entry trigger override
 * @param {number} [options.byteThresholdBytes] pending-log-byte trigger override
 * @param {Function} [options.onAfterCreateCheckpoint] optional hook after creation
 * @return {Object} frozen {tick(nowMs), isInFlight(), sealForCatchup(request),
 *   readDiagnostics()}
 */
function createPartitionSnapshotCadence(options) {
  const {service} = options;
  const state = {
    inFlight: false,
    refusal: NO_STANDING_REFUSAL,
    lastOutcome: null,
    lastSuccess: null,
    reportedSinceSuccess: 0,
    observationFault: null,
  };
  const outcomeLog = createPartitionSnapshotOutcomeLog({
    service,
    event: EVENT.CADENCE_OUTCOME,
    message: LOG_MSG.CADENCE_OUTCOME,
  });

  // What one attempt is measured at: the caller's timestamp, the applied
  // index and the checkpoint identity.
  const attemptAt = (nowMs, record, identity) => Object.freeze({
    nowMs,
    appliedIndex: Number(record.appliedIndex),
    identityKey: snapshotCheckpointIdentityKey(identity),
  });
  // The refusal standing after an attempt answered: renewed when it was
  // refused, stamped at its COMPLETION (the attempt's timestamp plus what it
  // took on the service clock, so a slow image build is spaced from its end),
  // ended otherwise.
  const refusalAfter = (attempt, startedAtMs, refused) => {
    state.refusal = refused === NOT_REFUSED ? NO_STANDING_REFUSAL :
      standingRefusal(state.refusal, Object.freeze({...attempt,
        nowMs: attempt.nowMs + (service.timeSource.now() - startedAtMs)}), refused);
  };

  // One image attempt under the standing refusal: held, or made and the
  // refusal renewed or lifted by what it answered.
  const attemptCheckpoint = async (checkpointsRoot, record, nowMs) => {
    const identity = resolveCadenceIdentity(service);
    const attempt = attemptAt(nowMs, record, identity);
    const decision = cadenceAttemptDecision(state.refusal, attempt);
    if (decision === ATTEMPT.HELD) {
      return tickResult(OUTCOME.HELD_AFTER_REFUSAL, {refusal: state.refusal});
    }
    const startedAtMs = service.timeSource.now();
    const result = await runCheckpointAndCompaction(
      service, checkpointsRoot, identity, options).catch(tickFailed);
    refusalAfter(attempt, startedAtMs,
      REFUSED_ATTEMPT_OUTCOMES.includes(result.outcome) ?
        {outcome: result.outcome, reason: outcomeReason(result)} : NOT_REFUSED);
    return decision === ATTEMPT.UNHELD ?
      result :
      tickResult(result.outcome, {...result, retryTrigger: decision});
  };

  // A generation for the catch-up dispatch, sealed by this owner: refused
  // typed while a cadence attempt is in flight or a refusal stands that
  // nothing lifts, and a refusal it draws is the cadence's own.
  const sealForCatchup = async (request) => {
    if (state.inFlight) {
      return tickResult(RAFT_CHECKPOINT_CREATION_OUTCOME.SEALER_BUSY);
    }
    const startedAtMs = service.timeSource.now();
    const attempt = attemptAt(startedAtMs, RaftRsDurableStore.readDurableRecordIn(
      service.db, service.partitionId), request.identity);
    if (cadenceAttemptDecision(state.refusal, attempt) === ATTEMPT.HELD) {
      return tickResult(RAFT_CHECKPOINT_CREATION_OUTCOME.SEALER_HELD,
        {refusal: state.refusal});
    }
    state.inFlight = true;
    try {
      const creation = await createCheckpointSealer(service.db,
        {replicaId: service.replicaId, partitionId: service.partitionId})(request);
      const refused = creation.outcome === RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED ?
        NOT_REFUSED : {outcome: OUTCOME.CREATION_REFUSED, reason: creation.outcome};
      refusalAfter(attempt, startedAtMs, refused);
      if (refused !== NOT_REFUSED) {
        outcomeLog.report(service.partitionId,
          {...refused, attempts: state.refusal.attempts});
      }
      return creation;
    } finally {
      state.inFlight = false;
    }
  };

  const evaluate = async (nowMs) => {
    if (isUnsupportedPartition(service)) {
      return tickResult(OUTCOME.UNSUPPORTED_PARTITION, {
        partitionId: service.partitionId,
      });
    }
    if (state.inFlight) {
      return tickResult(OUTCOME.ALREADY_IN_FLIGHT);
    }
    if (!isLeaderReady(service)) {
      state.refusal = NO_STANDING_REFUSAL;
      return tickResult(OUTCOME.NOT_LEADER, {
        role: service.role,
      });
    }
    if (!RaftRsDurableStore.hasDurableRecordIn(
      service.db, service.partitionId)) {
      return tickResult(
        OUTCOME.COMMITTED_LOG_UNSUPPORTED, {
          partitionId: service.partitionId,
        });
    }
    const checkpointsRoot = resolveReplicaCheckpointsRoot(service.dbPath);
    const record = RaftRsDurableStore.readDurableRecordIn(
      service.db, service.partitionId);
    const thresholds = evaluateCadenceThresholds(
      service, options, checkpointsRoot, record);
    if (thresholds.belowThreshold && !thresholds.uncompactedCheckpoint) {
      return tickResult(OUTCOME.BELOW_THRESHOLD, {
        checkpointedIndex: thresholds.checkpointedIndex,
        compactedIndex: thresholds.compactedIndex,
        pendingEntryCount: thresholds.pendingEntryCount,
        pendingLogBytes: thresholds.pendingLogBytes,
        entryThreshold: thresholds.entryThreshold,
        byteThresholdBytes: thresholds.byteThresholdBytes,
      });
    }
    state.inFlight = true;
    try {
      if (thresholds.belowThreshold) {
        return sweepAndCompactCheckpoint(
          service, checkpointsRoot, thresholds.uncompactedCheckpoint);
      }
      return await attemptCheckpoint(checkpointsRoot, record, nowMs);
    } finally {
      state.inFlight = false;
    }
  };

  // The visible record of one tick: the last outcome, the last compaction,
  // one typed line for an outcome that neither compacted nor is quiet, and
  // one line when a compaction ends a run of reported outcomes.
  const observe = (result, nowMs) => {
    const reason = outcomeReason(result);
    state.lastOutcome = Object.freeze({outcome: result.outcome, reason, atMs: nowMs});
    if (result.outcome === OUTCOME.COMPACTED) {
      state.lastSuccess = Object.freeze({
        outcome: result.outcome,
        compactedUpToIndex: result.compactedUpToIndex,
        atMs: nowMs,
      });
      if (state.reportedSinceSuccess > 0) {
        service.logger.info(LOG_MSG.CADENCE_RECOVERED, {
          event: EVENT.CADENCE_RECOVERED,
          partitionId: service.partitionId,
          compactedUpToIndex: result.compactedUpToIndex,
          reportedOutcomes: state.reportedSinceSuccess,
        });
        state.reportedSinceSuccess = 0;
      }
      return;
    }
    if (QUIET_OUTCOMES.includes(result.outcome)) {
      return;
    }
    state.reportedSinceSuccess += 1;
    outcomeLog.report(service.partitionId, {
      outcome: result.outcome,
      reason,
      detail: result.detail,
      ...(state.refusal === NO_STANDING_REFUSAL ?
        {} : {attempts: state.refusal.attempts}),
    });
  };

  return Object.freeze({
    async tick(nowMs) {
      const result = await evaluate(nowMs).catch(tickFailed);
      if (result.outcome === OUTCOME.COMPACTED) {
        state.refusal = NO_STANDING_REFUSAL;
      }
      try {
        observe(result, nowMs);
      } catch (error) {
        // The record of a tick never changes what the tick answered; a
        // failing observation is itself kept for the diagnostics read.
        state.observationFault = error?.message;
      }
      return result;
    },
    isInFlight() {
      return state.inFlight;
    },
    /**
     * @param {Object} request {identity, checkpointsRoot, inProcessPins}
     * @return {Promise<Object>} a typed creation result: the creation
     *   owner's, or this sealer's sealer_busy / sealer_held_after_refusal /
     *   sealer_failed (one vocabulary: RAFT_CHECKPOINT_CREATION_OUTCOME)
     */
    sealForCatchup(request) {
      return sealForCatchup(request).catch((error) => tickResult(
        RAFT_CHECKPOINT_CREATION_OUTCOME.SEALER_FAILED, {detail: error?.message}));
    },
    /**
     * @return {Object} frozen {lastOutcome, lastSuccess, refusal,
     *   observationFault}: each null until it has happened.
     */
    readDiagnostics() {
      return Object.freeze({
        lastOutcome: state.lastOutcome,
        lastSuccess: state.lastSuccess,
        refusal: state.refusal,
        observationFault: state.observationFault,
      });
    },
  });
}

const DEFAULT_SERVICE_SNAPSHOT_THRESHOLD = 10000;
const WAL_CHECKPOINT_TRUNCATE_PRAGMA = 'wal_checkpoint(TRUNCATE)';
const CADENCE_STATUS_COMPACTED = 'compacted';
const CADENCE_STATUS_SKIPPED = 'skipped';
const CADENCE_STATUS_FAILED = 'failed';
const CADENCE_REASON_CANNOT_COMPACT = 'cannot_compact';
const CADENCE_REASON_BELOW_THRESHOLD = 'below_threshold';

function hasDurableCompactionSupport(service) {
  return Boolean(
    service?.durableCheckpointingEnabled === true ||
    service?.durableCheckpointing === true ||
    service?.db,
  );
}

function resolveCompactionTargetFn(service) {
  if (!service) return null;
  if (service.raftBackend === null) {
    return typeof service.raft?.compactLog === 'function' ?
      (idx) => service.raft.compactLog(idx) :
      null;
  }
  if (typeof service.compactDurableRaftLog === 'function') {
    return (idx) => service.compactDurableRaftLog(idx);
  }
  if (typeof service.raftBackend?.compactLog === 'function') {
    return (idx) => service.raftBackend.compactLog(idx);
  }
  if (typeof service.raft?.compactLog === 'function' &&
      hasDurableCompactionSupport(service)) {
    return (idx) => service.raft.compactLog(idx);
  }
  return null;
}

/**
 * Whether a partition service can compact its Raft log.
 * @param {Object} service - The PartitionService instance.
 * @return {boolean} Whether log compaction is supported.
 */
function canCompactPartitionRaftLog(service) {
  return resolveCompactionTargetFn(service) !== null;
}

function resolveServiceSnapshotThreshold(service) {
  return Number.isSafeInteger(service?.snapshotThreshold) &&
    service.snapshotThreshold > 0 ?
    service.snapshotThreshold :
    DEFAULT_SERVICE_SNAPSHOT_THRESHOLD;
}

function resolveServiceCommitIndex(service) {
  const candidates = [
    service?.lastCommittedIndex,
    service?.lastIncludedIndex,
    service?.commitIndex,
    service?.raft?.commitIndex,
    service?.raft?.lastApplied,
    service?.lastCheckpointedCommitIndex,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return 0;
}

function runServiceLogCompaction(service, compactFn, commitIndex) {
  if (service.raftBackend !== null && typeof service.db?.pragma === 'function') {
    service.db.pragma(WAL_CHECKPOINT_TRUNCATE_PRAGMA);
  }
  const compactionResult = compactFn(commitIndex);
  service.lastCheckpointedCommitIndex = commitIndex;
  service.committedWritesSinceSnapshot = 0;
  return {
    status: CADENCE_STATUS_COMPACTED,
    commitIndex,
    compactionResult,
  };
}

/**
 * Evaluate snapshot cadence and compact the Raft log if eligible.
 * @param {Object} service - The PartitionService instance.
 * @return {Object} Evaluated cadence outcome.
 */
function evaluatePartitionSnapshotCadence(service) {
  const compactFn = resolveCompactionTargetFn(service);
  const threshold = resolveServiceSnapshotThreshold(service);
  const writes = service?.committedWritesSinceSnapshot;
  if (!compactFn) {
    return {status: CADENCE_STATUS_SKIPPED, reason: CADENCE_REASON_CANNOT_COMPACT};
  } else if (typeof writes === 'number' && writes < threshold) {
    return {
      status: CADENCE_STATUS_SKIPPED,
      reason: CADENCE_REASON_BELOW_THRESHOLD,
      committedWritesSinceSnapshot: writes,
      threshold,
    };
  }
  const commitIndex = resolveServiceCommitIndex(service);
  try {
    return runServiceLogCompaction(service, compactFn, commitIndex);
  } catch (error) {
    return {
      status: CADENCE_STATUS_FAILED,
      error: error?.message || String(error),
      commitIndex,
    };
  }
}

export {
  canCompactPartitionRaftLog,
  createPartitionSnapshotCadence,
  evaluatePartitionSnapshotCadence,
};
