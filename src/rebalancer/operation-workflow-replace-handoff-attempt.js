/**
 * Owner contract:
 * Owner: the one leadership decision before a partition replica is removed
 * from its group, and its named-target handoff attempt - a REPLACE's source
 * (quest replace-source-removal-owner, amendment-1 step 2, design §3.4 as
 * amended: BR9/BR10/A13; BR11 as superseded 2026-11-11, leadership retained)
 * and a plain REMOVE's replica (the universal removal leadership rule,
 * 2026-11-11: a replica that is its group's current leader is never the
 * subject of a removal effect). Consumed by the removal leadership gate
 * (operation-workflow-removal-leadership-gate.js) for every partition class.
 * Inputs: for a REPLACE the witness replica's fresh leader (the target's own
 * port, read through the READ_REPLICA_MEMBERSHIP seam); the group's
 * current-leader authority (the completion authority's leader-answered,
 * majority-corroborated read, with the voters' confirming answers) - for a
 * REPLACE only when the witness names a third replica, for a plain REMOVE
 * always (it has no target to read); the STEP_DOWN answer echoed with its
 * attempt sequence; and the group's leadership-transfer window.
 * Canonical output: the one leadership decision before the subject may be
 * removed:
 *  - LEADERSHIP_SAFE when a fresh read shows the REPLACE's target leading;
 *  - LEADER_RETAINED when no attempt is unresolved and the corroborated
 *    current leader is a surviving replica (for a REPLACE a third replica
 *    the target follows at the same term; for a REMOVE any replica other
 *    than the subject), or when the corroborated leader is the transferee an
 *    attempt named: the subject is removed and leadership does not move;
 *  - ISSUE one named-target handoff only when the subject itself leads and
 *    no attempt is unresolved: to the REPLACE's target t, or for a REMOVE to
 *    the surviving committed voter its own answer shows most caught up;
 *  - WAIT while an attempt is unresolved, while no leader is known, while
 *    the witness cannot be read, while the current leader is not
 *    corroborated, or (REMOVE) while the leading subject has no surviving
 *    live committed voter to hand off to;
 *  - TARGET_NOT_FOUND (REPLACE only) when the target hosts no replica.
 * One attempt record per operation, {attemptSeq, transfereeReplicaId,
 * issuedAtMs, answeredAtMs, answerClass}; an answer is applied only when its
 * echoed attemptSeq is the current one (a late answer is dropped and
 * counted). Every attempt names one transferee, and a new one is issued only
 * after the previous one resolved, so no transfer is retargeted while it
 * runs (raft-rs ignores a same-transferee repeat); the most-caught-up leg
 * and the H-B' retarget do not exist for a REPLACE.
 * Resolution: a fresh lead === the transferee; a refusal; the ROLE_NO_OP
 * answer; or the transfer window elapsed since the answer arrived. Each
 * resolution only permits the next decision.
 * Superseded (R09, owner decision 2026-09-25, this quest): the CL-043
 * completed-election authorization (BR11) and the row-based
 * WAIT_REPLACEMENT_LEADER_OWNERSHIP input (BR3) no longer decide a REPLACE.
 * Superseded (R09, 2026-11-11): "any leader other than the target gets the
 * handoff" - a third leader is retained; and "only a REPLACE of a priority
 * control-plane partition reads leadership" - every partition removal does.
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
import {
  claimReplaceAttemptStateRebuild,
} from './operation-workflow-replace-owner-recovery.js';
import {chooseRemovalTransferee} from '../raft/raft-removal-transferee-rule.js';

// The sequence of an attempt record rebuilt after a restart (BR10): not one
// this session issued, so no answer can match it.
const REBUILT_ATTEMPT_SEQ = 0;

const REPLACE_HANDOFF_DECISION = Object.freeze({
  LEADERSHIP_SAFE: 'leadership_safe',
  // A corroborated current leader that is neither the source nor the target:
  // the source may be removed and leadership stays where it is.
  LEADER_RETAINED: 'leader_retained',
  ISSUE: 'issue',
  WAIT_ATTEMPT_UNRESOLVED: 'wait_attempt_unresolved',
  WAIT_NO_LEADER: 'wait_no_leader',
  WAIT_WITNESS_UNAVAILABLE: 'wait_witness_unavailable',
  // The witness names a third leader the current-leader authority did not
  // confirm (unread, unreachable, deposed, or not the one the target follows);
  // for a plain REMOVE: the group's current leader could not be corroborated
  // (no answer, no leader named, or no majority at its term - a dead leader
  // whose survivors have not elected yet reads here).
  WAIT_LEADER_NOT_CORROBORATED: 'wait_leader_not_corroborated',
  // A plain REMOVE's replica leads and no other voter of the leader's
  // committed (non-joint) configuration answered at its term past its
  // participation gate (a single-voter group; a joint configuration).
  // Cleared when such a voter exists (an admission commits), by the same
  // re-evaluation as every wait.
  WAIT_NO_TRANSFEREE: 'wait_no_transferee',
  TARGET_NOT_FOUND: 'target_not_found',
});

// The deferral text of WAIT_LEADER_NOT_CORROBORATED, around the partition
// and the source replica it names.
const REPLACE_LEADER_NOT_CORROBORATED_DEFERRAL = Object.freeze({
  PARTITION_PREFIX: 'Critical partition ',
  SOURCE_INFIX: ' source replica ',
  SUFFIX: ' removal waits: the group\'s current leader is not corroborated ' +
    '(a third replica is named leader without a current, majority-confirmed ' +
    'leader answer the replacement follows)',
});

/**
 * @param {string} partitionId
 * @param {string} sourceReplicaId
 * @return {string} The WAIT_LEADER_NOT_CORROBORATED deferral message.
 */
function buildReplaceLeaderNotCorroboratedDeferral(
  partitionId, sourceReplicaId) {
  return REPLACE_LEADER_NOT_CORROBORATED_DEFERRAL.PARTITION_PREFIX +
    partitionId + REPLACE_LEADER_NOT_CORROBORATED_DEFERRAL.SOURCE_INFIX +
    sourceReplicaId + REPLACE_LEADER_NOT_CORROBORATED_DEFERRAL.SUFFIX;
}

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
    // decisionByOperationId: the last named-handoff decision per operation,
    // the state an ACTIVE wait's diagnostic is labelled from (S9).
    state = {attemptByOperationId: new Map(), decisionByOperationId: new Map(),
      nextSeq: 1, lateAnswers: 0};
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
 * @param {string} transfereeReplicaId - The one replica the attempt names.
 * @return {number} The attempt sequence the request carries.
 */
function beginReplaceHandoffAttempt(owner, operationId, transfereeReplicaId) {
  const state = readAttemptState(owner);
  const attemptSeq = state.nextSeq;
  state.nextSeq += 1;
  state.attemptByOperationId.set(operationId, {
    attemptSeq,
    transfereeReplicaId: transfereeReplicaId ?? null,
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
 * BR10: a handoff the previous owner session issued may still be in flight.
 * Its record is rebuilt as an accepted attempt answered now: a fresh read of
 * the REPLACE's target leading resolves it at once, otherwise the transfer
 * window does. Until then it
 * blocks a new issuance and a retained-leader removal (T-9: the lost
 * handoff's transfer may be running at the present leader).
 * @param {Object} owner
 * @param {Object} state - The attempt state.
 * @param {Object} operation
 * @param {Object} replicaIds - {sourceReplicaId, targetReplicaId}.
 */
function rebuildLostHandoffAttempt(owner, state, operation, replicaIds) {
  if (state.attemptByOperationId.has(operation.operationId) ||
      !claimReplaceAttemptStateRebuild(owner, operation).due) {
    return;
  }
  const nowMs = nowMsOf(owner);
  state.attemptByOperationId.set(operation.operationId, {
    attemptSeq: REBUILT_ATTEMPT_SEQ,
    transfereeReplicaId: replicaIds.targetReplicaId,
    issuedAtMs: nowMs,
    answeredAtMs: nowMs,
    answerClass: REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED,
  });
}

/**
 * The removal's leadership decision. For a REPLACE it starts from a fresh
 * witness read of the target and reads the group's current-leader authority
 * only when the witness names a third replica and nothing else decides
 * first; a plain REMOVE has no target and always reads the authority. The
 * decision is then taken again, whole, on the state as it is after that
 * read.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} reads
 * @param {Object|null} reads.witness - The REPLACE target's observation
 *   (null for a plain REMOVE).
 * @param {Object} reads.replicaIds - {sourceReplicaId, targetReplicaId}.
 * @param {function(): Promise<Object>} reads.readLeaderAuthority - The
 *   group's corroborated current-leader read with its confirming voters'
 *   answers ({authority, confirmingVoterAnswers}).
 * @param {function(string): Object|null} reads.routeOf - A member's route
 *   ({replicaId, nodeId}) or null.
 * @return {Promise<Object>} Frozen {state, attemptSeq?, transferee?}.
 */
async function decideRemovalNamedHandoff(owner, operation, reads) {
  let decision = decideNamedHandoff(owner, operation, reads, null);
  if (decision.state ===
      REPLACE_HANDOFF_DECISION.WAIT_LEADER_NOT_CORROBORATED) {
    decision = decideNamedHandoff(
      owner, operation, reads, await reads.readLeaderAuthority());
  }
  readAttemptState(owner).decisionByOperationId.set(
    operation.operationId, decision);
  return decision;
}

function isAnsweredObservation(observation) {
  return Boolean(observation) &&
    observation.state !== PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE;
}

// The group's current leader as the authority answered it: the leader's own
// replica, or null when the authority is unread or answered a typed wait.
function corroboratedLeaderOf(leaderAuthority) {
  const leader = isAnsweredObservation(leaderAuthority) ?
    leaderAuthority.leaderReplicaId ?? null : null;
  return leader !== null && leader === leaderAuthority.replicaId ?
    leader : null;
}

// Whether the target follows the corroborated third leader: its own read is
// at the leader's term and names that leader, its participation gate is
// open, and it is a voter of the leader's committed configuration.
function targetFollowsLeader(witness, leaderAuthority, replicaIds) {
  const voters = Array.isArray(leaderAuthority.voterReplicaIds) ?
    leaderAuthority.voterReplicaIds : [];
  return witness.gateOpen === true &&
    witness.leaderReplicaId === leaderAuthority.replicaId &&
    Number(witness.term) === Number(leaderAuthority.term) &&
    voters.includes(replicaIds.targetReplicaId);
}

function issueTo(transferee) {
  return Object.freeze({
    state: REPLACE_HANDOFF_DECISION.ISSUE,
    transferee: Object.freeze({...transferee}),
  });
}

// The witness names a third replica (neither the source nor the target) and
// no attempt is unresolved: what the group's current-leader authority says
// decides. The stronger read wins when it names the target or the source.
function decideThirdLeader(operation, reads, leaderAuthority) {
  const {witness, replicaIds} = reads;
  const leader = corroboratedLeaderOf(leaderAuthority);
  if (leader === null) {
    return Object.freeze({
      state: REPLACE_HANDOFF_DECISION.WAIT_LEADER_NOT_CORROBORATED});
  }
  if (leader === replicaIds.targetReplicaId) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.LEADERSHIP_SAFE});
  }
  if (leader === replicaIds.sourceReplicaId) {
    return issueTo(replaceTransfereeOf(operation, replicaIds));
  }
  return Object.freeze({
    state: targetFollowsLeader(witness, leaderAuthority, replicaIds) ?
      REPLACE_HANDOFF_DECISION.LEADER_RETAINED :
      REPLACE_HANDOFF_DECISION.WAIT_LEADER_NOT_CORROBORATED,
  });
}

// BR9: a REPLACE's one transferee is its own target.
function replaceTransfereeOf(operation, replicaIds) {
  return {replicaId: replicaIds.targetReplicaId,
    nodeId: operation.targetNodeId};
}

function decideNamedHandoff(owner, operation, reads, corroborated) {
  const state = readAttemptState(owner);
  // BR10 is a REPLACE's: a plain REMOVE's lost transfer can only land on a
  // survivor, and a RemoveNode a transfer window drops is re-proposed by the
  // node's deferred-retirement owner, so a restart never delays it.
  if (reads.replicaIds.targetReplicaId !== null) {
    rebuildLostHandoffAttempt(owner, state, operation, reads.replicaIds);
  }
  const attempt = state.attemptByOperationId.get(operation.operationId);
  return reads.replicaIds.targetReplicaId === null ?
    decideRemoveLeadership(owner, attempt, reads, corroborated) :
    decideReplaceLeadership(owner, operation, attempt, reads,
      corroborated?.authority ?? null);
}

function decideReplaceLeadership(
  owner, operation, attempt, reads, leaderAuthority) {
  const {witness, replicaIds} = reads;
  if (!witness ||
      witness.state === PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE) {
    return Object.freeze({
      state: REPLACE_HANDOFF_DECISION.WAIT_WITNESS_UNAVAILABLE});
  }
  const leader = witness.leaderReplicaId ?? null;
  // A fresh read of the target itself leading authorizes the removal and
  // resolves any attempt (BR10, BR11).
  if (leader !== null && leader === replicaIds.targetReplicaId) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.LEADERSHIP_SAFE});
  }
  if (attempt?.answerClass === REPLACE_HANDOFF_ANSWER_CLASS.NOT_FOUND) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.TARGET_NOT_FOUND});
  }
  // T-9: an unresolved attempt blocks a new issuance and a retained-leader
  // removal alike.
  if (isAttemptUnresolved(owner, attempt, witness)) {
    return unresolvedDecision(attempt);
  }
  if (leader === null) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.WAIT_NO_LEADER});
  }
  // The one named-target handoff is for a source that itself leads.
  if (leader === replicaIds.sourceReplicaId) {
    return issueTo(replaceTransfereeOf(operation, replicaIds));
  }
  return decideThirdLeader(operation, reads, leaderAuthority);
}

function unresolvedDecision(attempt) {
  return Object.freeze({
    state: REPLACE_HANDOFF_DECISION.WAIT_ATTEMPT_UNRESOLVED,
    attemptSeq: attempt.attemptSeq,
  });
}

// A plain REMOVE: the corroborated current leader decides. The subject is
// removed with leadership where it is unless it leads itself; then one
// named handoff goes to a surviving live committed voter. Unread (null) is
// the cue to read the authority.
function decideRemoveLeadership(owner, attempt, reads, corroborated) {
  const leader = corroborated === null ? null :
    corroboratedLeaderOf(corroborated.authority);
  if (leader === null) {
    return Object.freeze({
      state: REPLACE_HANDOFF_DECISION.WAIT_LEADER_NOT_CORROBORATED,
      authorityReason: corroborated?.authority?.reason ?? null,
    });
  }
  // The transfer an attempt asked for landed: the transferee leads.
  if (typeof attempt?.transfereeReplicaId === 'string' &&
      leader === attempt.transfereeReplicaId) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.LEADER_RETAINED});
  }
  // T-9: an unresolved (or rebuilt) attempt blocks a new issuance and the
  // removal alike.
  if (isAttemptUnresolved(owner, attempt, corroborated.authority)) {
    return unresolvedDecision(attempt);
  }
  if (leader !== reads.replicaIds.sourceReplicaId) {
    return Object.freeze({state: REPLACE_HANDOFF_DECISION.LEADER_RETAINED});
  }
  const transferee = chooseGateRemovalTransferee(corroborated, reads, attempt);
  return transferee === null ?
    Object.freeze({state: REPLACE_HANDOFF_DECISION.WAIT_NO_TRANSFEREE}) :
    issueTo(transferee);
}

// The voters of the leader's committed configuration as the removal
// transferee rule reads them (raft-removal-transferee-rule.js), from the
// gate's evidence: each voter's own corroborating answer (it confirmed the
// leader's term; its gateOpen; its applied and commit index) and its route.
function transfereeFactsOf(corroborated, reads) {
  const {authority, confirmingVoterAnswers} = corroborated;
  const voterIds = Array.isArray(authority.voterReplicaIds) ?
    authority.voterReplicaIds : [];
  return voterIds.map((replicaId) => {
    const answer = confirmingVoterAnswers?.get?.(replicaId) ?? null;
    const route = reads.routeOf(replicaId);
    return {id: replicaId, route, confirmsLeader: answer !== null,
      pastParticipationGate: answer?.gateOpen === true, routed: route !== null,
      index: answer?.appliedIndex, secondaryIndex: answer?.commitIndex};
  });
}

// The removal transferee rule over the gate's evidence. The transferee of the
// previous ACCEPTED attempt is kept while it is still eligible (raft-rs
// ignores a same-transferee repeat, so a running transfer is never
// retargeted); the transferee of a previous attempt that did not take
// leadership is excluded while another candidate exists.
function chooseGateRemovalTransferee(corroborated, reads, attempt) {
  const outgoing = corroborated.authority.votersOutgoingReplicaIds;
  const voters = transfereeFactsOf(corroborated, reads);
  const subjectId = reads.replicaIds.sourceReplicaId;
  const joint = Array.isArray(outgoing) && outgoing.length > 0;
  const previous = attempt?.transfereeReplicaId ?? null;
  const accepted = attempt?.answerClass === REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED;
  const kept = accepted ? chooseRemovalTransferee({subjectId, joint,
    voters: voters.filter((voter) => voter.id === previous)}) : null;
  const chosen = kept ?? chooseRemovalTransferee({subjectId, joint, voters,
    excludedId: accepted ? null : previous});
  return chosen === null ? null :
    {replicaId: chosen.id, nodeId: chosen.route.nodeId};
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
 * Whether the operation has an attempt its answers have not resolved yet.
 * @param {Object} owner
 * @param {string} operationId
 * @param {Object|null} witness - A fresh witness observation.
 * @return {boolean}
 */
function isReplaceHandoffAttemptUnresolved(owner, operationId, witness) {
  return isAttemptUnresolved(owner,
    ATTEMPT_STATE_BY_OWNER.get(owner)?.attemptByOperationId.get(operationId),
    witness);
}

/**
 * @param {Object} owner
 * @return {number} Late answers dropped (a different or no current attempt).
 */
function readReplaceHandoffLateAnswerCount(owner) {
  return ATTEMPT_STATE_BY_OWNER.get(owner)?.lateAnswers || 0;
}

/**
 * S9: whether the operation's last named-handoff decision waited on an
 * unresolved attempt; null when no decision was taken in this session.
 * @param {Object} owner
 * @param {string} operationId
 * @return {boolean|null}
 */
function readReplaceHandoffDecisionUnresolved(owner, operationId) {
  const decision = ATTEMPT_STATE_BY_OWNER.get(owner)?.decisionByOperationId
    .get(operationId);
  return decision ?
    decision.state === REPLACE_HANDOFF_DECISION.WAIT_ATTEMPT_UNRESOLVED :
    null;
}

function clearReplaceHandoffAttempt(owner, operationId) {
  ATTEMPT_STATE_BY_OWNER.get(owner)?.attemptByOperationId.delete(operationId);
  ATTEMPT_STATE_BY_OWNER.get(owner)?.decisionByOperationId.delete(operationId);
}

// Shutdown: every attempt is released with the owner's state; the sequence
// keeps counting, so a late answer of a released attempt stays late.
function clearAllReplaceHandoffAttempts(owner) {
  ATTEMPT_STATE_BY_OWNER.get(owner)?.attemptByOperationId.clear();
  ATTEMPT_STATE_BY_OWNER.get(owner)?.decisionByOperationId.clear();
}

export {
  REPLACE_HANDOFF_ANSWER_CLASS,
  REPLACE_HANDOFF_DECISION,
  beginReplaceHandoffAttempt,
  buildReplaceLeaderNotCorroboratedDeferral,
  clearAllReplaceHandoffAttempts,
  clearReplaceHandoffAttempt,
  decideRemovalNamedHandoff,
  isReplaceHandoffAttemptUnresolved,
  readReplaceHandoffAttempt,
  readReplaceHandoffDecisionUnresolved,
  readReplaceHandoffLateAnswerCount,
  recordReplaceHandoffAnswer,
};
