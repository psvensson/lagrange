import {randomUUID} from 'node:crypto';
import {ERRORS} from '../constants/errors.js';
import {isValidRaftLogIndex} from '../raft/log-index.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../raft/raft-rs-durable-store-constants.js';
import {PARTITION_COMMITTED_COMMAND_ERROR_CODE} from
  './partition-service-constants.js';
import {PARTICIPANT_TRANSACTION_COMMAND_TYPES} from
  './partition-participant-transaction-constants.js';
import {PARTITION_SETTLED_REPLAY} from
  './partition-committed-statement-outcome-constants.js';
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
// session open on the replica's connection; the write was handed to
// consensus and released before consensus answered it (its replica stopped
// leading, its commit deadline passed, its service shut down), or the core or
// the port's host failed while it proposed it, or its own committed apply
// failed, so its outcome is not known to this replica (a retry with the same
// entryId is idempotent); or it was not proposed - the port refused its
// proposal, its proposal queue was at capacity (retry after the queue's
// retryAfterMs), its service shut down or its commit deadline passed before
// it was handed over. CONSENSUS_HOST_FAILURE is not a code the kernel
// answers with: it names the cause of the unknown outcome of a write whose
// proposal the port's host failed (outcomeUnknownAnswer); its retirement is
// the owner's open decision. RESERVED: the write committed and met a prepared
// participant transaction's reservation when it applied - consumed without
// effect and its entry key left unsettled (TX1 design 4), so it is retried
// and applies once the decision has applied.
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
  RESERVED: 'partition_write_reserved',
});
const REFUSAL = PARTITION_WRITE_LEADERSHIP_REFUSAL;

// The answers of a write that did not fail for good: a caller may retry it -
// route it again to the current leader, or here once the state it names has
// passed. An unknown outcome is among them - a write that may be in the log:
// released after it was handed to consensus, or answered by a host failure
// while proposing or by an environmental failure of its own committed apply
// (each answered OUTCOME_UNKNOWN, its own code and text kept as the cause, so
// CONSENSUS_HOST_FAILURE is not an answer of the kernel) - but it is routed
// again only by a caller that re-proposes the write under its own entryId:
// the retry is then idempotent (the write's outcome row answers it), while a
// re-proposal under a fresh id may apply it twice. The errors owner lists
// each code's text for the callers that receive only a text
// (isRetryableWriteError); the unknown outcome's text is never routed again
// (REROUTABLE_WRITE_ERROR_FRAGMENTS), since a text carries no entryId.
const RETRYABLE_WRITE_FAILURE_CODES = Object.freeze([
  REFUSAL.NOT_LEADER,
  REFUSAL.CONSENSUS_RECOVERY_REQUIRED,
  REFUSAL.CONSENSUS_SESSION_OPEN,
  REFUSAL.OUTCOME_UNKNOWN,
  REFUSAL.CONSENSUS_REFUSED,
  REFUSAL.BACKPRESSURE,
  REFUSAL.SERVICE_SHUTDOWN,
  REFUSAL.COMMIT_DEADLINE_EXCEEDED,
  REFUSAL.RESERVED,
]);

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
 * @return {boolean} Whether it is a PARTITION_WRITE_LEADERSHIP_REFUSAL.
 */
function isPartitionWriteFailureCode(code) {
  return Object.values(REFUSAL).includes(code);
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
 * unknown outcome only when the caller re-proposes the write under its own
 * entryId.
 * @param {*} code - A write answer's failureCode.
 * @param {Object} [options] - What the caller carries.
 * @param {boolean} [options.carriesEntryId=false] - Whether the caller
 *   re-proposes the write under the entryId it was answered for.
 * @return {boolean} Whether the caller may route it again.
 */
function isReroutableWriteFailureCode(code, {carriesEntryId = false} = {}) {
  return isRetryableWriteFailureCode(code) &&
    (code !== REFUSAL.OUTCOME_UNKNOWN || carriesEntryId === true);
}

// The typed fields of a write answer that did not succeed: what is known of
// the write - its code, the entry it was proposed under and that entry's log
// index, the consensus state that answered it, whether a committed statement
// failed - and, from the redelivery owner, the wait it spent on an unknown
// outcome. Every hop between the partition and the write's caller carries
// them as they are (R07: a typed outcome never degrades to its text). The
// cause of an unknown outcome (outcomeUnknownAnswer) is not among them: it is
// the kernel's own, and the leader logs it with the entry where it answers.
// A hop carries what every classifier decides on - the code and the entryId
// a re-delivery is made under - and, for a statement the statement-admission
// owner refused, the rule that refused it (`refusalLayer`).
const TYPED_WRITE_ANSWER_FIELDS = Object.freeze([
  'failureCode',
  'entryId',
  'logIndex',
  'consensus',
  'committed',
  'outcome',
  'spentWait',
  'refusalLayer',
]);

/**
 * The typed fields a failed write answer carries (TYPED_WRITE_ANSWER_FIELDS),
 * for a hop to carry on beside its text.
 * @param {*} answer - A failed write answer, or a result built from one.
 * @return {Object} The fields it carries (absent ones are left out).
 */
function pickTypedWriteAnswer(answer) {
  const typed = {};
  for (const field of TYPED_WRITE_ANSWER_FIELDS) {
    const value = answer?.[field];
    if (value !== undefined && value !== null) {
      typed[field] = value;
    }
  }
  return typed;
}

/**
 * Whether a write answer says its write's outcome is not known: it was handed
 * to consensus, or failed on this replica while it was proposed or applied,
 * and may commit whatever this answer says. Only a re-delivery under the
 * answer's own entryId resolves it.
 * @param {*} answer - A write answer.
 * @return {boolean} Whether it is the typed unknown outcome.
 */
function isWriteOutcomeUnknown(answer) {
  return answer?.failureCode === REFUSAL.OUTCOME_UNKNOWN;
}

/**
 * Whether a write answer is a settled replay whose affected-row count is not
 * known (PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED): the write was
 * applied, and it carries no count. Every consumer that turns an answer's
 * count into an outcome asks this first - an unknown count is never zero
 * rows.
 * @param {*} answer - A partition write answer, or a result built from
 *   answers that carries their named replay state.
 * @return {boolean} Whether the answer is applied with an unknown count.
 */
function isAppliedWithUnknownCount(answer) {
  return answer?.settledReplay === PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED;
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

// The answer of a write that may have committed: it was proposed, and what
// answered it does not prove it absent from the log, so its outcome is not
// known here (a re-delivery under its entryId is idempotent). Its cause keeps
// the code and text of what answered it; it stays with this answer (no hop
// carries it, TYPED_WRITE_ANSWER_FIELDS). The text of a write that failed on
// this replica while it was proposed or applied is never retried by a caller
// that holds only the text (ERRORS.WRITE_OUTCOME_UNKNOWN_AFTER_FAILURE).
function outcomeUnknownAnswer(cause,
  error = ERRORS.WRITE_OUTCOME_UNKNOWN_AFTER_FAILURE) {
  return {
    error,
    failureCode: REFUSAL.OUTCOME_UNKNOWN,
    cause: Object.freeze({...cause}),
  };
}

// A host failure while proposing may leave the entry in the log: an unknown
// outcome whose cause is the environmental failure of the write's own
// application (its code and text, with the host's SQLite code) or, for any
// other host failure, CONSENSUS_HOST_FAILURE with the port's text.
function hostFailureProposalAnswer(refusal, rejection) {
  const environmental = rejection?.code ===
    PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED;
  return outcomeUnknownAnswer(environmental ?
    {error: rejection.message, failureCode: rejection.code} :
    {error: refusal.message, failureCode: REFUSAL.CONSENSUS_HOST_FAILURE});
}

// What each port outcome of a refused proposal answers: a host failure (as
// hostFailureProposalAnswer types it); a core refusal - the proposal never
// entered consensus; a core failure - the core failed while it held the
// proposal, so the write's outcome is not known here (its cause is the port's
// text; its own text is a released write's, as before).
const PROPOSAL_REFUSAL_ANSWER = Object.freeze({
  [RAFT_OPERATION_OUTCOME.HOST_FAILURE]: hostFailureProposalAnswer,
  [RAFT_OPERATION_OUTCOME.CORE_REFUSED]: (refusal) => ({
    error: `${ERRORS.WRITE_CONSENSUS_REFUSED}: ${refusal.raftResult.reason}`,
    failureCode: REFUSAL.CONSENSUS_REFUSED,
  }),
  [RAFT_OPERATION_OUTCOME.CORE_FATAL]: (refusal) => outcomeUnknownAnswer(
    {error: refusal.message}, ERRORS.WRITE_OUTCOME_UNKNOWN),
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

// The answer of a proposed write whose pending answer was rejected neither by
// its proposal's refusal nor by its release: its own committed apply failed
// environmentally, or its committed command was not recognised. Its entry may
// be in the log, so its outcome is not known here; the cause keeps the
// rejection's code (when it carries one) and text.
function buildRejectedProposedWriteAnswer(rejection, {partitionId, entryId}) {
  const code = rejection?.code;
  return {
    success: false,
    ...outcomeUnknownAnswer({
      ...(typeof code === 'string' ? {failureCode: code} : {}),
      error: rejection?.message || String(rejection),
    }),
    partitionId,
    entryId,
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

// A participant transaction command has none of a write's side effects: it is
// not mirrored (TX1 design 8.1), and its decision's CDC events and size update
// are its own apply's (partition-participant-transaction-apply.js).
function buildPartitionWriteSideEffectPlan(entry, executionResult) {
  if (executionResult?.success !== true ||
      PARTICIPANT_TRANSACTION_COMMAND_TYPES.includes(entry?.type)) {
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
  PARTITION_WRITE_RELEASE_CAUSE,
  buildDurableCommitWitness,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteLeadershipRefusal,
  buildPartitionWriteProposalRefusal,
  buildPartitionWriteSideEffectPlan,
  buildRejectedProposedWriteAnswer,
  buildReleasedPendingWriteAnswer,
  isAppliedWithUnknownCount,
  isHeldByHostFailure,
  isPartitionWriteFailureCode,
  isReroutableWriteFailureCode,
  isRetryableWriteFailureCode,
  isWriteOutcomeUnknown,
  pickTypedWriteAnswer,
  resolvePartitionWriteCommitMode,
};
