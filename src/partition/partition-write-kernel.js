import {randomUUID} from 'node:crypto';
import {ERRORS} from '../constants/errors.js';
import {isValidRaftLogIndex} from '../raft/log-index.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_RS_PROPOSAL_CODEC_ERROR} from
  '../raft/raft-rs-proposal-codec-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../raft/raft-rs-durable-store-constants.js';
import {PARTITION_COMMITTED_COMMAND_ERROR_CODE} from
  './partition-service-constants.js';
import {
  PROPOSAL_QUEUE_BACKPRESSURE_CODE,
  PROPOSAL_QUEUE_PROPOSAL_STATE,
} from './proposal-queue-constants.js';


const PARTITION_WRITE_COMMIT_MODE = Object.freeze({
  RAFT: 'raft',
  REJECTED: 'rejected',
});

// A write this replica did not take, typed by what it knows of it: this
// replica does not lead (another replica leads, or the write was released
// before it was handed to consensus); its group is held by its host failure
// (the port's typed recovery outcome), or that recovery waits for a user
// session open on the replica's connection; the port's host failed while it
// proposed the write; the write was handed to consensus and released before
// consensus answered it (its replica stopped leading, its commit deadline
// passed, its service shut down) or the core failed while it proposed it, so
// its outcome is not known to this replica (a retry with the same entryId is
// idempotent); or it was not proposed - the port refused its proposal, its
// proposal queue was at capacity (retry after the queue's retryAfterMs), its
// service shut down or its commit deadline passed before it was handed over.
const PARTITION_WRITE_LEADERSHIP_REFUSAL = Object.freeze({
  NOT_LEADER: 'partition_write_not_leader',
  CONSENSUS_RECOVERY_REQUIRED: 'partition_write_consensus_recovery_required',
  CONSENSUS_SESSION_OPEN: 'partition_write_consensus_session_open',
  CONSENSUS_HOST_FAILURE: 'partition_write_consensus_host_failure',
  OUTCOME_UNKNOWN: 'partition_write_outcome_unknown',
  CONSENSUS_REFUSED: 'partition_write_consensus_refused',
  BACKPRESSURE: 'partition_write_backpressure',
  SERVICE_SHUTDOWN: 'partition_write_service_shutdown',
  COMMIT_DEADLINE_EXCEEDED: 'partition_write_commit_deadline_exceeded',
});
const REFUSAL = PARTITION_WRITE_LEADERSHIP_REFUSAL;

// The environmental failure of a committed write's own application (the
// host failed while applying it after it committed; the application failed
// closed and the entry is applied again when the host recovers): the write
// is committed, so it did not fail for good.
const STATEMENT_ENVIRONMENT_FAILED =
  PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED;

// The answers of a write that did not fail for good: a caller may retry it -
// route it again to the current leader, or here once the state it names has
// passed. A host failure while proposing is not among them: its retryability
// is the port's, and the caller decides. An unknown outcome and the
// environmental failure of a committed write's application are among them,
// but they are routed again only by a caller that re-proposes the write
// under its own entryId (ENTRY_ID_BOUND_RETRY_CODES): the retry is then
// idempotent (the write's outcome row answers it), while a re-proposal under
// a fresh id may apply it twice. Partition write answers carry their code
// across the wire (PARTITION_WRITE_ANSWER_FIELDS), so a caller routes them
// by it; the errors owner keeps each code's text - every code below,
// STATEMENT_ENVIRONMENT_FAILED included - only for the control plane's retry
// of a failure that reached it as text (isRetryableWriteError), so a code
// and its text always agree on the retry.
const RETRYABLE_WRITE_FAILURE_CODES = Object.freeze([
  REFUSAL.NOT_LEADER,
  REFUSAL.CONSENSUS_RECOVERY_REQUIRED,
  REFUSAL.CONSENSUS_SESSION_OPEN,
  REFUSAL.OUTCOME_UNKNOWN,
  REFUSAL.CONSENSUS_REFUSED,
  REFUSAL.BACKPRESSURE,
  REFUSAL.SERVICE_SHUTDOWN,
  REFUSAL.COMMIT_DEADLINE_EXCEEDED,
  STATEMENT_ENVIRONMENT_FAILED,
]);
const ENTRY_ID_BOUND_RETRY_CODES = Object.freeze([
  REFUSAL.OUTCOME_UNKNOWN,
  STATEMENT_ENVIRONMENT_FAILED,
]);
// The answers of a write the partition refused for good, before it was
// proposed (quest reroute-carries-the-entry-id, verification round 3, F22
// and F19): its entryId is settled, or pending, for another statement (the
// committed-statement outcome owner's binding), or its statement is one the
// proposal codec cannot encode. No attempt of the same statement under the
// same entryId can succeed, so they are never retried and never routed
// again, and a caller decides them by this code before any text a summary
// of them carries.
const FAILED_FOR_GOOD_WRITE_FAILURE_CODES = Object.freeze([
  PARTITION_COMMITTED_COMMAND_ERROR_CODE.ENTRY_ID_STATEMENT_MISMATCH,
  RAFT_RS_PROPOSAL_CODEC_ERROR.UNENCODABLE,
]);

// The typed fields of a partition write answer, which cross every boundary
// (the transport query reply, the query executor's results and errors) as
// the partition answered them (quest reroute-carries-the-entry-id, C3).
// `changesKnown` is false on the replay of an outcome row recorded before its
// affected-row count was (its `changes` is then null, never 0);
// `statementBinding` names how a replayed row binds the statement asking
// (the outcome owner's PARTITION_COMMITTED_STATEMENT_BINDING: the same
// statement, or unrecorded for a row recorded before its binding was).
const PARTITION_WRITE_ANSWER_FIELDS = Object.freeze([
  'failureCode',
  'retryAfterMs',
  'consensus',
  'entryId',
  'idempotentReplay',
  'logIndex',
  'replayOfLogIndex',
  'changes',
  'changesKnown',
  'statementBinding',
]);

/**
 * The typed fields a partition write answer carries, as it carries them.
 * @param {Object|null} answer - A partition write answer (or an error that
 *   carries one).
 * @return {Object} The PARTITION_WRITE_ANSWER_FIELDS it has.
 */
function pickPartitionWriteAnswerFields(answer) {
  const fields = {};
  for (const field of PARTITION_WRITE_ANSWER_FIELDS) {
    if (answer?.[field] !== undefined) {
      fields[field] = answer[field];
    }
  }
  return fields;
}

/**
 * The typed fields a statement's summary keeps from its answers: those of
 * its one answer when one partition answered it (its code, its entry), none
 * when several did (each keeps its own).
 * @param {Array<Object>} answers - The statement's partition answers.
 * @return {Object} The PARTITION_WRITE_ANSWER_FIELDS of its one answer, or {}.
 */
function pickSingleAnswerFields(answers) {
  return answers.length === 1 ? pickPartitionWriteAnswerFields(answers[0]) :
    {};
}

// The affected rows of a write whose count is not known (a replay of an
// outcome row that recorded none): never rendered as a number (R07).
const AFFECTED_ROWS_UNKNOWN = Object.freeze({
  affectedRows: null,
  affectedRowsKnown: false,
});

/**
 * The affected rows of a write's successful answers: their sum, or unknown
 * (AFFECTED_ROWS_UNKNOWN) when any answer's count is not known - an unknown
 * count is never summed as 0.
 * @param {Array<Object>} counts - One {count, known} per successful answer.
 * @return {Object} {affectedRows} or AFFECTED_ROWS_UNKNOWN.
 */
function sumAffectedRows(counts) {
  if (counts.some((part) => part.known !== true)) {
    return {...AFFECTED_ROWS_UNKNOWN};
  }
  return {affectedRows: counts.reduce((sum, part) => sum + part.count, 0)};
}

// Why pending writes are released without an answer from consensus: their
// replica stopped leading, their commit deadline passed, or their service is
// shutting down.
const PARTITION_WRITE_RELEASE_CAUSE = Object.freeze({
  LEADERSHIP_LOST: 'leadership-lost',
  COMMIT_DEADLINE_EXCEEDED: 'commit-deadline-exceeded',
  SHUTDOWN: 'shutdown',
});

// A released write never handed to consensus was not proposed; its code and
// text say why it was released.
const RELEASED_UNPROPOSED_ANSWER = Object.freeze({
  [PARTITION_WRITE_RELEASE_CAUSE.LEADERSHIP_LOST]: Object.freeze({
    failureCode: REFUSAL.NOT_LEADER,
    error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
  }),
  [PARTITION_WRITE_RELEASE_CAUSE.COMMIT_DEADLINE_EXCEEDED]: Object.freeze({
    failureCode: REFUSAL.COMMIT_DEADLINE_EXCEEDED,
    error: ERRORS.WRITE_COMMIT_DEADLINE_EXCEEDED,
  }),
  [PARTITION_WRITE_RELEASE_CAUSE.SHUTDOWN]: Object.freeze({
    failureCode: REFUSAL.SERVICE_SHUTDOWN,
    error: ERRORS.WRITE_SERVICE_SHUTDOWN,
  }),
});

/**
 * Whether a code is one the write kernel answers a failed write with.
 * @param {*} code - A failureCode.
 * @return {boolean} Whether it is a PARTITION_WRITE_LEADERSHIP_REFUSAL, the
 *   environmental failure of a committed write's application, or a refusal
 *   that failed for good (FAILED_FOR_GOOD_WRITE_FAILURE_CODES).
 */
function isPartitionWriteFailureCode(code) {
  return Object.values(REFUSAL).includes(code) ||
    code === STATEMENT_ENVIRONMENT_FAILED ||
    FAILED_FOR_GOOD_WRITE_FAILURE_CODES.includes(code);
}

/**
 * Whether a write answer's failureCode names a write that did not fail for
 * good (RETRYABLE_WRITE_FAILURE_CODES): the control plane retries it rather
 * than record it as a failed write.
 * @param {*} code - A write answer's failureCode.
 * @return {boolean} Whether it is one of RETRYABLE_WRITE_FAILURE_CODES.
 */
function isRetryableWriteFailureCode(code) {
  return RETRYABLE_WRITE_FAILURE_CODES.includes(code);
}

/**
 * Whether a caller may route a write answer again, by its failureCode: an
 * unknown outcome (or a committed write's environmental application failure)
 * only when the caller re-proposes the write under its own entryId.
 * @param {*} code - A write answer's failureCode.
 * @param {Object} [options] - What the caller carries.
 * @param {boolean} [options.carriesEntryId=false] - Whether the caller
 *   re-proposes the write under the entryId it was answered for.
 * @return {boolean} Whether the caller may route it again.
 */
function isReroutableWriteFailureCode(code, {carriesEntryId = false} = {}) {
  return isRetryableWriteFailureCode(code) &&
    (!ENTRY_ID_BOUND_RETRY_CODES.includes(code) || carriesEntryId === true);
}

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

/**
 * Whether a port status names its group held by a host failure (the port's
 * recovery outcome).
 * @param {Object} status - A port status.
 * @return {boolean} Whether the group is held.
 */
function isHeldByHostFailure(status) {
  return status?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    status.recoveryRequired === true;
}

// A write this replica may not propose, typed by what its port reports: a
// group held by its host failure (the port's recovery outcome, carried as
// read; an open user session that holds the recovery is its own code), or no
// leadership here. Answered at once; nothing is proposed.
function buildPartitionWriteLeadershipRefusal(status, partitionId) {
  if (!isHeldByHostFailure(status)) {
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

/**
 * The error a replica that neither leads nor knows a leader to forward to
 * throws for a write: typed NOT_LEADER, as buildPartitionWriteLeadershipRefusal
 * answers it, so the answer the transport carries is routed by its code.
 * @param {string} partitionId - The partition.
 * @return {Error} The typed error.
 */
function buildPartitionWriteNotLeaderError(partitionId) {
  return Object.assign(new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE), {
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    partitionId,
  });
}

// The answer of a pending write released without an answer from consensus,
// from what the proposal queue knew of it and why it was released ({cause},
// a PARTITION_WRITE_RELEASE_CAUSE, and the deadline for a passed commit
// deadline): a write handed to consensus may commit whatever this replica
// answers, so its outcome is not known here; a write never handed to it was
// not proposed. The one builder of every released write's answer.
function buildReleasedPendingWriteAnswer({entryId, proposal, logIndex},
  partitionId, {cause, deadlineMs}) {
  const proposed = proposal === PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED;
  const unproposed = RELEASED_UNPROPOSED_ANSWER[cause];
  return {
    success: false,
    error: proposed ? ERRORS.WRITE_OUTCOME_UNKNOWN : unproposed.error,
    failureCode: proposed ? REFUSAL.OUTCOME_UNKNOWN : unproposed.failureCode,
    consensus: {
      reason: cause,
      ...(deadlineMs === undefined ? {} : {deadlineMs}),
    },
    partitionId,
    entryId,
    ...(proposed && isValidRaftLogIndex(logIndex) && logIndex > 0 ?
      {logIndex} : {}),
  };
}

// A host failure while proposing: the environmental failure of the write's
// own application keeps that failure's code and text, any other is
// CONSENSUS_HOST_FAILURE.
function hostFailureProposalAnswer(refusal, rejection) {
  const environmental = rejection?.code ===
    PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED;
  return environmental ?
    {error: rejection.message, failureCode: rejection.code} :
    {error: refusal.message, failureCode: REFUSAL.CONSENSUS_HOST_FAILURE};
}

// What each port outcome of a refused proposal answers: a host failure (as
// hostFailureProposalAnswer types it); a core refusal - the proposal never
// entered consensus; a core failure - the core failed while it held the
// proposal, so the write's outcome is not known here.
const PROPOSAL_REFUSAL_ANSWER = Object.freeze({
  [RAFT_OPERATION_OUTCOME.HOST_FAILURE]: hostFailureProposalAnswer,
  [RAFT_OPERATION_OUTCOME.CORE_REFUSED]: (refusal) => ({
    error: `${ERRORS.WRITE_CONSENSUS_REFUSED}: ${refusal.raftResult.reason}`,
    failureCode: REFUSAL.CONSENSUS_REFUSED,
  }),
  [RAFT_OPERATION_OUTCOME.CORE_FATAL]: () => ({
    error: ERRORS.WRITE_OUTCOME_UNKNOWN,
    failureCode: REFUSAL.OUTCOME_UNKNOWN,
  }),
});

// The answer of a proposal its proposal queue refused at capacity: nothing
// was registered or proposed; retry after the queue's retryAfterMs.
function backpressureProposalAnswer(refusal, {partitionId, entryId}) {
  return {
    success: false,
    error: `${ERRORS.WRITE_BACKPRESSURE}; retry after ` +
      `${refusal.retryAfterMs} ms`,
    failureCode: REFUSAL.BACKPRESSURE,
    retryAfterMs: refusal.retryAfterMs,
    partitionId,
    entryId,
  };
}

// The answer of a write whose proposal was refused - by its proposal queue
// at capacity, or by the port (typed with the port's reason, phase and
// retryability, by PROPOSAL_REFUSAL_ANSWER). The one builder of every
// refused proposal's answer; a failure that is neither is the write's own.
function buildPartitionWriteProposalRefusal(refusal, rejection,
  {partitionId, entryId}) {
  if (refusal?.code === PROPOSAL_QUEUE_BACKPRESSURE_CODE) {
    return backpressureProposalAnswer(refusal, {partitionId, entryId});
  }
  const port = refusal?.raftResult;
  const answerOf = PROPOSAL_REFUSAL_ANSWER[port?.outcome];
  if (answerOf === undefined) {
    return buildPartitionWriteFailureResult(refusal, partitionId);
  }
  return {
    success: false,
    ...answerOf(refusal, rejection),
    consensus: {
      reason: port.reason,
      phase: port.phase,
      retryable: port.retryable === true,
    },
    partitionId,
    entryId,
  };
}

// A write's own failure; one the kernel types (a committed write's
// environmental application failure) keeps its code as its failureCode.
function buildPartitionWriteFailureResult(error, partitionId, logIndex = null) {
  const result = {
    success: false,
    error: error?.message || String(error),
    ...(isPartitionWriteFailureCode(error?.code) ?
      {failureCode: error.code} : {}),
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
  PARTITION_WRITE_ANSWER_FIELDS,
  PARTITION_WRITE_COMMIT_MODE,
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
  PARTITION_WRITE_RELEASE_CAUSE,
  buildDurableCommitWitness,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteLeadershipRefusal,
  buildPartitionWriteNotLeaderError,
  buildPartitionWriteProposalRefusal,
  buildPartitionWriteSideEffectPlan,
  buildReleasedPendingWriteAnswer,
  isHeldByHostFailure,
  isPartitionWriteFailureCode,
  isReroutableWriteFailureCode,
  isRetryableWriteFailureCode,
  pickPartitionWriteAnswerFields,
  pickSingleAnswerFields,
  resolvePartitionWriteCommitMode,
  sumAffectedRows,
};
