import {randomUUID} from 'node:crypto';
import {ERRORS} from '../constants/errors.js';
import {isValidRaftLogIndex} from '../raft/log-index.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../raft/raft-rs-durable-store-constants.js';
import {PARTITION_COMMITTED_COMMAND_ERROR_CODE} from
  './partition-service-constants.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from './proposal-queue-constants.js';


const PARTITION_WRITE_COMMIT_MODE = Object.freeze({
  RAFT: 'raft',
  REJECTED: 'rejected',
});

// A write this replica did not take, typed by what it knows of it: this
// replica does not lead (another replica leads, or the write was released
// before it was handed to consensus); its group is held by its host failure
// (the port's typed recovery outcome), or that recovery waits for a user
// session open on the replica's connection; the port's host failed while it
// proposed the write; or the write was released after it was handed to
// consensus, so its outcome is not known to this replica (a retry with the
// same entryId is idempotent).
const PARTITION_WRITE_LEADERSHIP_REFUSAL = Object.freeze({
  NOT_LEADER: 'partition_write_not_leader',
  CONSENSUS_RECOVERY_REQUIRED: 'partition_write_consensus_recovery_required',
  CONSENSUS_SESSION_OPEN: 'partition_write_consensus_session_open',
  CONSENSUS_HOST_FAILURE: 'partition_write_consensus_host_failure',
  OUTCOME_UNKNOWN: 'partition_write_outcome_unknown',
});

const PARTITION_WRITE_KERNEL_LITERAL = Object.freeze({
  EMPTY_STRING: '',
});
const DURABLE_COMMIT_WITNESS_ERROR =
  'Cannot acknowledge write without durable commit identity';

function normalizeInteger(value, fallback = null) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

// The write's proposal instant: the caller's when it has one, the host's only
// when it does not.
function resolveProposedAt(value) {
  const supplied = normalizeInteger(value);
  return supplied === null ? Date.now() : supplied;
}

function normalizeCommitWitnessString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// A write's entryId keys its outcome row and its answer: the caller's when it
// supplied one (the admission owner refuses one that is not a non-empty
// string before it is proposed), minted only when none was supplied.
function resolveEntryId(entryId) {
  return entryId === undefined || entryId === null ? randomUUID() : entryId;
}

function buildPartitionWriteEntry(operation, options = {}) {
  const timestamp = options.timestamp;

  return {
    ...operation,
    entryId: resolveEntryId(operation?.entryId),
    timestamp: timestamp === undefined ? '' : String(timestamp),
    proposedBy:
      typeof options.proposedBy === 'string' ?
        options.proposedBy :
        PARTITION_WRITE_KERNEL_LITERAL.EMPTY_STRING,
    // Lazily, not as a default argument: JavaScript evaluates the fallback
    // whether or not it is used, so a caller that supplied its own node's
    // reading still read the host clock here.
    proposedAt: resolveProposedAt(options.proposedAt),
  };
}

function normalizeCommitWitnessIdentity({
  partitionId,
  leaderNodeId,
  leaderReplicaId,
  logEntry,
}) {
  return {
    partitionId: normalizeCommitWitnessString(partitionId),
    leaderNodeId: normalizeCommitWitnessString(leaderNodeId),
    leaderReplicaId: normalizeCommitWitnessString(leaderReplicaId),
    term: Number(logEntry?.term),
    logIndex: Number(logEntry?.index),
    entryId: normalizeCommitWitnessString(logEntry?.data?.entryId),
    operationId: normalizeCommitWitnessString(logEntry?.data?.operationId),
    idempotencyKey:
      normalizeCommitWitnessString(logEntry?.data?.idempotencyKey),
  };
}

function hasCompleteCommitWitnessIdentity(identity) {
  const strings = [
    identity.partitionId,
    identity.leaderNodeId,
    identity.leaderReplicaId,
    identity.entryId,
  ];
  return strings.every((value) => value.length > 0) &&
    Number.isSafeInteger(identity.term) &&
    identity.term >= 0 &&
    isValidRaftLogIndex(identity.logIndex) &&
    identity.logIndex > 0;
}

function appendOptionalCommitWitnessIdentity(witness, identity) {
  if (identity.operationId.length > 0) {
    witness.operationId = identity.operationId;
  }
  if (identity.idempotencyKey.length > 0) {
    witness.idempotencyKey = identity.idempotencyKey;
  }
}

function buildDurableCommitWitness(options) {
  const identity = normalizeCommitWitnessIdentity(options);
  if (!hasCompleteCommitWitnessIdentity(identity)) {
    throw new Error(DURABLE_COMMIT_WITNESS_ERROR);
  }
  const witness = {
    partitionId: identity.partitionId,
    leaderNodeId: identity.leaderNodeId,
    leaderReplicaId: identity.leaderReplicaId,
    term: identity.term,
    logIndex: identity.logIndex,
    entryId: identity.entryId,
  };
  appendOptionalCommitWitnessIdentity(witness, identity);
  return Object.freeze(witness);
}

// A write is proposed only by the consensus leader; a lone leader commits its
// own proposal, so there is no direct-execution mode.
function resolvePartitionWriteCommitMode(options = {}) {
  const replicaIds = Array.isArray(options.replicaIds) ? options.replicaIds : [];
  // A self-only replica list must not authorize a unilateral commit when a
  // remote leader is known to exist: the local list can be viability-filtered
  // down to self under membership churn (CL-013 class), and a self-elected
  // solo leader then forks the group - one replica fabricates committed
  // entries the true leader never saw (run-15: replica_operations-p1-r5
  // self-committed phantom operations that safety-gated the control plane
  // into a cluster-wide freeze). The witness must be an ACTUAL (a leader
  // observed via raft traffic or the published leader pointer on another
  // node) - never a target like replica_count, which legitimately exceeds
  // placed membership on single-node and degraded clusters.
  if (replicaIds.length <= 1 && options.hasKnownRemoteLeader === true) {
    return PARTITION_WRITE_COMMIT_MODE.REJECTED;
  }
  return options.raftState === options.raftLeaderState ?
    PARTITION_WRITE_COMMIT_MODE.RAFT :
    PARTITION_WRITE_COMMIT_MODE.REJECTED;
}

// The text of a refusal while this replica's group is held: the recovery,
// what holds it and when to retry, never a missing leader.
function recoveryRefusalMessage({reason, phase, retryAfterMs}) {
  const retry = Number.isFinite(retryAfterMs) ?
    `; retry after ${retryAfterMs} ms` : '';
  return `${ERRORS.CONSENSUS_RECOVERY_IN_PROGRESS}: ${reason} ` +
    `(phase ${phase})${retry}`;
}

// A write this replica may not propose, typed by what its port reports: a
// group held by its host failure (the port's recovery outcome, carried as
// read; an open user session that holds the recovery is its own code), or no
// leadership here. Answered at once; nothing is proposed.
function buildPartitionWriteLeadershipRefusal(status, partitionId) {
  const recovering = status?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    status.recoveryRequired === true;
  if (!recovering) {
    return {
      success: false,
      error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
      partitionId,
    };
  }
  const consensus = {
    reason: status.reason,
    phase: status.phase,
    retryAfterMs: status.retryAfterMs ?? null,
  };
  return {
    success: false,
    error: recoveryRefusalMessage(consensus),
    failureCode:
      status.reason === RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN ?
        PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_SESSION_OPEN :
        PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_RECOVERY_REQUIRED,
    consensus,
    partitionId,
  };
}

// The answer of a pending write released without an answer from consensus
// (its replica stopped leading), from what the proposal queue knew of it: a
// write handed to consensus may commit whatever this replica answers, so its
// outcome is not known here; a write never handed to it was not proposed.
function buildReleasedPendingWriteAnswer({entryId, proposal, logIndex},
  partitionId) {
  const proposed = proposal === PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED;
  return {
    success: false,
    error: proposed ? ERRORS.WRITE_OUTCOME_UNKNOWN :
      ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
    failureCode: proposed ? PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN :
      PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    partitionId,
    entryId,
    ...(proposed && isValidRaftLogIndex(logIndex) && logIndex > 0 ?
      {logIndex} : {}),
  };
}

// The answer of a write whose proposal the port refused. A host failure is
// typed with the port's phase, reason and retryability: the environmental
// failure of its own application keeps that failure's code and text, any
// other is CONSENSUS_HOST_FAILURE; a core refusal is the port's text.
function buildPartitionWriteProposalRefusal(refusal, rejection, partitionId) {
  const port = refusal?.raftResult;
  if (port?.outcome !== RAFT_OPERATION_OUTCOME.HOST_FAILURE) {
    return buildPartitionWriteFailureResult(refusal, partitionId);
  }
  const environmental = rejection?.code ===
    PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED;
  return {
    success: false,
    error: (environmental ? rejection : refusal).message,
    failureCode: environmental ? rejection.code :
      PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_HOST_FAILURE,
    consensus: {
      reason: port.reason,
      phase: port.phase,
      retryable: port.retryable === true,
    },
    partitionId,
  };
}

function buildPartitionWriteFailureResult(error, partitionId, logIndex = null) {
  const result = {
    success: false,
    error: error?.message || String(error),
    partitionId,
  };
  if (Number.isFinite(logIndex)) {
    result.logIndex = Math.floor(logIndex);
  }
  return result;
}

function buildPartitionWriteSideEffectPlan(entry, executionResult) {
  if (executionResult?.success !== true) {
    return Object.freeze({
      emitCdcEntry: null,
      splitReplicationEntry: null,
      scheduleSizeUpdate: false,
      requestManagedSplitEvaluation: false,
    });
  }

  const executedEntry = {
    ...entry,
    changes: executionResult.changes,
  };
  // The durable Raft log index this write committed at: the split/merge
  // mirror replay cursor advances its persisted watermark from this, so
  // a restarted source replays deltas from the log rather than the
  // volatile in-memory queue.
  const committedLogIndex = Number(
    executionResult?.durableCommitWitness?.logIndex,
  );
  if (Number.isSafeInteger(committedLogIndex) && committedLogIndex > 0) {
    executedEntry.logIndex = committedLogIndex;
  }

  return Object.freeze({
    emitCdcEntry: executedEntry,
    splitReplicationEntry: executedEntry,
    scheduleSizeUpdate: true,
    requestManagedSplitEvaluation: true,
  });
}

export {
  DURABLE_COMMIT_WITNESS_ERROR,
  PARTITION_WRITE_COMMIT_MODE,
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
  buildDurableCommitWitness,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteLeadershipRefusal,
  buildPartitionWriteProposalRefusal,
  buildPartitionWriteSideEffectPlan,
  buildReleasedPendingWriteAnswer,
  resolvePartitionWriteCommitMode,
};
