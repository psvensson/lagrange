/**
 * Owner contract:
 * Owner: the REPLACE owner's leadership handoff attempt (quest
 * replace-source-removal-owner, amendment-1 step 2, design §3.4 as amended:
 * BR9/BR10/A13).
 * Inputs: the witness replica's fresh leader (its own port's status, read
 * through the READ_REPLICA_MEMBERSHIP seam), the STEP_DOWN answer echoed
 * with its attempt sequence, and the group's leadership-transfer window.
 * Canonical output: for a REPLACE, the one leadership decision before its
 * source may be removed:
 *  - LEADERSHIP_SAFE when a fresh read shows the target leading, or another
 *    replica leading (the source released leadership to a canonical
 *    successor);
 *  - ISSUE a named-target handoff (always the target t) when the source
 *    leads and no attempt is unresolved;
 *  - WAIT while an attempt is unresolved, while no leader is known, or while
 *    the witness cannot be read;
 *  - TARGET_NOT_FOUND when the target answered that it hosts no replica.
 * One attempt record per operation, {attemptSeq, issuedAtMs, answeredAtMs,
 * answerClass}; an answer is applied only when its echoed attemptSeq is the
 * current one (a late answer is dropped and counted). All attempts share one
 * transferee, so a retarget is structurally impossible (raft-rs ignores a
 * same-transferee repeat); the most-caught-up leg and the H-B' retarget do
 * not exist for a REPLACE.
 * Resolution: a fresh lead === t; a refusal; the ROLE_NO_OP answer; or the
 * transfer window elapsed since the answer arrived. Each resolution only
 * permits the next decision.
 * Superseded (R09, owner decision 2026-09-25, this quest): the CL-043
 * completed-election authorization (BR11) and the row-based
 * WAIT_REPLACEMENT_LEADER_OWNERSHIP input (BR3) no longer decide a REPLACE.
 */
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
} from '../node/replica-handler-leader-handoff-methods.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../partition/partition-replica-membership-constants.js';

const REPLACE_HANDOFF_DECISION = Object.freeze({
  LEADERSHIP_SAFE: 'leadership_safe',
  ISSUE: 'issue',
  WAIT_ATTEMPT_UNRESOLVED: 'wait_attempt_unresolved',
  WAIT_NO_LEADER: 'wait_no_leader',
  WAIT_WITNESS_UNAVAILABLE: 'wait_witness_unavailable',
  TARGET_NOT_FOUND: 'target_not_found',
});

// What an attempt's answer means for its resolution.
const REPLACE_HANDOFF_ANSWER_CLASS = Object.freeze({
  ACCEPTED: 'accepted',
  NO_EFFECT: 'no_effect',
  REFUSED: 'refused',
  NOT_FOUND: 'not_found',
});

const NO_EFFECT_BRANCHES = Object.freeze(new Set([
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP,
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.SOURCE_DEMOTION_ROLE_NO_OP,
]));

const ATTEMPT_STATE_BY_OWNER = new WeakMap();

function readAttemptState(owner) {
  let state = ATTEMPT_STATE_BY_OWNER.get(owner);
  if (!state) {
    state = {attemptByOperationId: new Map(), nextSeq: 1, lateAnswers: 0};
    ATTEMPT_STATE_BY_OWNER.set(owner, state);
  }
  return state;
}

function nowMsOf(owner) {
  return typeof owner.resolveTimeoutCheckNowMs === 'function' ?
    owner.resolveTimeoutCheckNowMs() : Date.now();
}

/**
 * @param {Object|null} response - The STEP_DOWN answer.
 * @return {string} A REPLACE_HANDOFF_ANSWER_CLASS member.
 */
function classifyReplaceHandoffAnswer(response) {
  if (response?.status === ReplicaOperationResponseStatus.NOT_FOUND) {
    return REPLACE_HANDOFF_ANSWER_CLASS.NOT_FOUND;
  }
  if (response?.status !== ReplicaOperationResponseStatus.COMPLETED) {
    return REPLACE_HANDOFF_ANSWER_CLASS.REFUSED;
  }
  return NO_EFFECT_BRANCHES.has(response.handoffBranch) ?
    REPLACE_HANDOFF_ANSWER_CLASS.NO_EFFECT :
    REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED;
}

/**
 * Open the operation's attempt: the next sequence, replacing any resolved
 * one. Called only when the decision was ISSUE.
 * @param {Object} owner
 * @param {string} operationId
 * @return {number} The attempt sequence the request carries.
 */
function beginReplaceHandoffAttempt(owner, operationId) {
  const state = readAttemptState(owner);
  const attemptSeq = state.nextSeq;
  state.nextSeq += 1;
  state.attemptByOperationId.set(operationId, {
    attemptSeq,
    issuedAtMs: nowMsOf(owner),
    answeredAtMs: null,
    answerClass: null,
  });
  return attemptSeq;
}

/**
 * Apply an answer to the attempt it names; a late answer of an earlier
 * attempt (or of none) is dropped and counted.
 * @param {Object} owner
 * @param {string} operationId
 * @param {Object|null} response
 * @param {number} requestSeq - The sequence the request carried (the
 *   answer's echo is preferred when present).
 * @return {boolean} Whether the answer was applied.
 */
function recordReplaceHandoffAnswer(owner, operationId, response, requestSeq) {
  const state = readAttemptState(owner);
  const attempt = state.attemptByOperationId.get(operationId);
  const echoed = Number(response?.[ReplicaOperationField.ATTEMPT_SEQ]);
  const answerSeq = Number.isFinite(echoed) ? echoed : requestSeq;
  if (!attempt || attempt.attemptSeq !== answerSeq ||
      attempt.answerClass !== null) {
    state.lateAnswers += 1;
    return false;
  }
  attempt.answerClass = classifyReplaceHandoffAnswer(response);
  attempt.answeredAtMs = nowMsOf(owner);
  return true;
}

function isAttemptUnresolved(owner, attempt, witness) {
  if (!attempt) {
    return false;
  }
  if (attempt.answerClass === null) {
    return true;
  }
  if (attempt.answerClass !== REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED) {
    return false;
  }
  const windowMs = Number(witness?.transferWindowMaxMs);
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    // Without the group's window nothing can prove the transfer was
    // abandoned; only a fresh leader resolves it.
    return true;
  }
  return nowMsOf(owner) - attempt.answeredAtMs < windowMs;
}

/**
 * The REPLACE's leadership decision from a fresh witness read.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} witness - The witness observation.
 * @param {Object} replicaIds - {sourceReplicaId, targetReplicaId}.
 * @return {Object} Frozen {state, attemptSeq?}.
 */
function decideReplaceNamedHandoff(owner, operation, witness, replicaIds) {
  const state = readAttemptState(owner);
  const attempt = state.attemptByOperationId.get(operation.operationId);
  if (!witness ||
      witness.state === PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE) {
    return Object.freeze({
      state: REPLACE_HANDOFF_DECISION.WAIT_WITNESS_UNAVAILABLE});
  }
  const leader = witness.leaderReplicaId ?? null;
  if (leader !== null && leader !== replicaIds.sourceReplicaId) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.LEADERSHIP_SAFE});
  }
  if (attempt?.answerClass === REPLACE_HANDOFF_ANSWER_CLASS.NOT_FOUND) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.TARGET_NOT_FOUND});
  }
  if (isAttemptUnresolved(owner, attempt, witness)) {
    return Object.freeze({
      state: REPLACE_HANDOFF_DECISION.WAIT_ATTEMPT_UNRESOLVED,
      attemptSeq: attempt.attemptSeq,
    });
  }
  if (leader === null) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.WAIT_NO_LEADER});
  }
  return Object.freeze({state: REPLACE_HANDOFF_DECISION.ISSUE});
}

/**
 * @param {Object} owner
 * @param {string} operationId
 * @return {Object|null} The operation's attempt record (a copy).
 */
function readReplaceHandoffAttempt(owner, operationId) {
  const attempt = ATTEMPT_STATE_BY_OWNER.get(owner)?.attemptByOperationId
    .get(operationId);
  return attempt ? Object.freeze({...attempt}) : null;
}

/**
 * @param {Object} owner
 * @return {number} Late answers dropped (a different or no current attempt).
 */
function readReplaceHandoffLateAnswerCount(owner) {
  return ATTEMPT_STATE_BY_OWNER.get(owner)?.lateAnswers || 0;
}

function clearReplaceHandoffAttempt(owner, operationId) {
  ATTEMPT_STATE_BY_OWNER.get(owner)?.attemptByOperationId.delete(operationId);
}

export {
  REPLACE_HANDOFF_ANSWER_CLASS,
  REPLACE_HANDOFF_DECISION,
  beginReplaceHandoffAttempt,
  clearReplaceHandoffAttempt,
  decideReplaceNamedHandoff,
  readReplaceHandoffAttempt,
  readReplaceHandoffLateAnswerCount,
  recordReplaceHandoffAnswer,
};
