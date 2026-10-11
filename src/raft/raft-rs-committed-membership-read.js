// The one read of a replica group's committed configuration (owner decision
// O1, committed-read amendment 1, section 3.1), shaped from the runtime
// owner's recorded observation: the configuration, the applied index of that
// same observation (never the core's own `applied`), the commit index, the
// term, the leader, the participation gate, and the replica identity of
// every id - as frozen data. No core, store, handle or mutable structure
// crosses; the runtime owner reads the core, this only shapes what it read.
//
// A bootstrap read is answered by the leader alone and refuses what a new
// replica cannot bootstrap from (a joint configuration, an id without a
// reserved identity); a witness read answers any replica's own applied
// configuration with unresolved identities as null.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE, RAFT_OPERATION_OUTCOME} from
  './raft-operation-port-constants.js';
import {
  COMMITTED_LEARNER_ACTION_KIND as ACTION_KIND,
  COMMITTED_LEARNER_ACTION_REASON as ACTION_REASON,
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {
  RAFT_RS_LEARNER_ORIGIN_COVERAGE,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {INVALID_COMMITTED_LEARNER_ADMISSION, INVALID_COMMITTED_PROMOTION_ADMISSION,
  canonicalMembershipActionContext, decodeCommittedLearnerAdmission,
  decodeCommittedPromotionAdmission} from
  './raft-rs-committed-membership-context.js';
import {ROLE_LEADER} from './raft-rs-runtime-owner-constants.js';

// Raft peer ids are decimal strings without leading zeros: the shorter one
// is the smaller, and equal lengths compare as text. Ascending id order is
// the one deterministic order of a membership list.
function ascendingPeerIdOrder(left, right) {
  return left.length - right.length || left.localeCompare(right);
}

function sortedIds(ids) {
  return [...(ids || [])].map(String).sort(ascendingPeerIdOrder);
}

/**
 * A typed refusal of the read.
 * @param {string} reason - A COMMITTED_MEMBERSHIP_REFUSAL.
 * @param {Object} [fields] - {leaderAddress} for NOT_LEADER.
 * @return {Object} Frozen {kind: REFUSED, reason, ...}.
 */
function committedMembershipRefusal(reason, fields = {}) {
  return deepFreeze({kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED, reason,
    ...fields});
}

/**
 * Every id of the configuration mapped to its reserved replica identity, or
 * null where this replica never reserved it.
 * @param {Object} group - The runtime group (resolvePeerIdentity).
 * @param {Array<string>} ids - The configuration's ids.
 * @return {Object} {peerId: replicaIdentity|null}.
 */
function identitiesOf(group, ids) {
  const identities = {};
  for (const id of ids) {
    const resolved = String(id) === String(group.peerId) ?
      {status: RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED,
        replicaIdentity: group.replicaIdentity} :
      group.resolvePeerIdentity(id);
    identities[String(id)] =
      resolved.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED ?
        resolved.replicaIdentity : null;
  }
  return identities;
}

// What a bootstrap or retirement read refuses of a configuration still in
// transition: a joint configuration; for a retirement read also a proposed
// change not yet applied (a member it adds would never be retired).
function configurationInTransitionRefusal(status, votersOutgoing, purpose) {
  if (votersOutgoing.length > 0) {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.JOINT);
  }
  return purpose === COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT &&
    status.confChangePending !== false ?
    committedMembershipRefusal(
      COMMITTED_MEMBERSHIP_REFUSAL.CONF_CHANGE_PENDING) : null;
}

function unavailableMembershipRefusal(status) {
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.HELD);
  }
  return status.membershipGenerationIndex === null ?
    committedMembershipRefusal(
      COMMITTED_MEMBERSHIP_REFUSAL.CONFIGURATION_GENERATION_UNAVAILABLE) :
    null;
}

/**
 * The answer a shaped status (one recorded observation) gives the read.
 * @param {Object} group - The runtime group.
 * @param {Object} status - The frozen status the runtime owner shaped from
 *   its recorded observation, or its typed failure.
 * @param {string} purpose - A COMMITTED_MEMBERSHIP_READ_PURPOSE.
 * @return {Object} The frozen answer or refusal.
 */
function answerCommittedMembership(group, status, purpose) {
  const unavailable = unavailableMembershipRefusal(status);
  if (unavailable !== null) {
    return unavailable;
  }
  const bootstrap = purpose !== COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS;
  if (bootstrap && status.role !== ROLE_LEADER) {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.NOT_LEADER,
      {leaderAddress: status.leaderAddress ?? null});
  }
  const confState = status.confState;
  const voters = sortedIds(confState.voters);
  const votersOutgoing = sortedIds(confState.votersOutgoing);
  const learners = sortedIds(confState.learners);
  const learnersNext = sortedIds(confState.learnersNext);
  const transitionRefusal = bootstrap ?
    configurationInTransitionRefusal(status, votersOutgoing, purpose) : null;
  if (transitionRefusal) {
    return transitionRefusal;
  }
  let identities;
  try {
    identities = identitiesOf(group,
      [...new Set([...voters, ...votersOutgoing, ...learners,
        ...learnersNext])]);
  } catch {
    // The registry itself could not be read: the replica cannot answer.
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.HELD);
  }
  if (bootstrap && Object.values(identities).some((identity) =>
    identity === null)) {
    return committedMembershipRefusal(
      COMMITTED_MEMBERSHIP_REFUSAL.IDENTITY_UNRESOLVED);
  }
  return deepFreeze({
    kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
    voters,
    votersOutgoing,
    learners,
    learnersNext,
    appliedIndex: status.appliedIndex,
    configurationKey: status.configurationKey,
    membershipGenerationIndex: status.membershipGenerationIndex,
    commitIndex: status.commitIndex,
    term: status.term,
    leaderId: status.leaderId ?? null,
    gateOpen: status.gateOpen,
    identities,
  });
}

function learnerActionAnswer(kind, reason, fields = {}) {
  return deepFreeze({kind, reason, ...fields});
}
// The queued observation an absent action was read in: which replica
// answered, its role and term, whether it leads with an entry of that term
// applied (currentTermApplied), whether this replica vouches that no
// application of the queried action is in its history (originRegistryComplete:
// for the learner action its registry holds no reservation of the target at
// all; for the promotion its applied configuration holds the target as a
// learner), its applied boundary, and the configuration, lifecycle and runtime
// fences a proposal through its port is compared with. Facts for the
// recorder's noncommitment decision; never a proposal grant.
function absenceObservation(status, vouched) {
  return {replicaIdentity: status.replicaIdentity, role: status.role, term: status.term,
    currentTermApplied: status.currentTermApplied === true,
    originRegistryComplete: vouched === true,
    appliedIndex: status.appliedIndex, configurationKey: status.configurationKey,
    membershipGenerationIndex: status.membershipGenerationIndex,
    lifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration};
}
function unavailableLearnerAction() {
  return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.UNAVAILABLE);
}
function normalizeCommittedLearnerRead(request, groupId) {
  try {
    if (request.groupId !== groupId) throw new Error(ACTION_REASON.INVALID);
    return {query: Object.freeze({groupId,
      action: canonicalMembershipActionContext(request.action)})};
  } catch {
    return {refusal: learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.INVALID)};
  }
}
function learnerOriginRefusal(origin, query, status) {
  if (origin.groupId !== query.groupId || Object.keys(query.action).some((key) =>
    origin.context[key] !== query.action[key])) {
    return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.MISMATCH);
  }
  if (BigInt(origin.index) > BigInt(status.appliedIndex) ||
      BigInt(origin.index) > BigInt(status.commitIndex) ||
      BigInt(origin.index) > BigInt(status.membershipGenerationIndex) ||
      BigInt(origin.term) > BigInt(status.term)) {
    return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.BEYOND_APPLIED);
  }
  return null;
}
function answerCommittedLearnerOrigin(group, status, query) {
  const evidence = group.readLearnerOriginEvidence(query.action.replicaIdentity);
  if (evidence.coverage !== RAFT_RS_LEARNER_ORIGIN_COVERAGE.RECORDED) {
    // Absence at this boundary alone proves nothing; the same observation
    // rides along so the recorder can tell whether it fences the action.
    return learnerActionAnswer(ACTION_KIND.UNRESOLVED, ACTION_REASON.NOT_RECORDED,
      {observation: absenceObservation(status,
        evidence.coverage === RAFT_RS_LEARNER_ORIGIN_COVERAGE.ABSENT)});
  }
  const origin = decodeCommittedLearnerAdmission(evidence.encoded);
  if (origin === INVALID_COMMITTED_LEARNER_ADMISSION) {
    return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.CORRUPT);
  }
  return learnerOriginRefusal(origin, query, status) ??
    learnerActionAnswer(ACTION_KIND.COMMITTED, ACTION_REASON.APPLIED,
      {receipt: origin, observedAppliedIndex: status.appliedIndex,
        // Same queued native observation, not a later second status read.
        // This remains a witness; current CREATE still needs its own leader read.
        membership: answerCommittedMembership(group, status,
          COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS)});
}

// Where this observation's applied configuration holds the promotion's
// target, under the target's own reserved identity: a voter, a learner, or
// neither (absent, unresolved, or in a joint configuration).
function promotionTargetView(group, status, action) {
  const confState = status.confState;
  const resolved = sortedIds(confState.votersOutgoing).length === 0 &&
    identitiesOf(group, [action.peerId])[action.peerId] === action.replicaIdentity;
  const voter = resolved && sortedIds(confState.voters).includes(action.peerId);
  return {voter,
    learner: resolved && !voter && sortedIds(confState.learners).includes(action.peerId)};
}
function promotionFactRefusal(fact, origin, encodedOrigin, query, status) {
  if (fact === INVALID_COMMITTED_PROMOTION_ADMISSION || origin === null ||
      encodedOrigin !== fact.learnerAdmission) return ACTION_REASON.CORRUPT;
  if (fact.groupId !== query.groupId || Object.keys(query.action).some((key) =>
    fact.context[key] !== query.action[key])) return ACTION_REASON.MISMATCH;
  if (BigInt(fact.index) > BigInt(status.appliedIndex) ||
      BigInt(fact.index) > BigInt(status.commitIndex) ||
      BigInt(fact.index) > BigInt(status.membershipGenerationIndex) ||
      BigInt(fact.term) > BigInt(status.term)) return ACTION_REASON.BEYOND_APPLIED;
  return null;
}
// The transition's PROMOTE (FreshMG 6.C slice C2) has committed at this
// replica when its applied configuration names the target a voter. A promotion
// retains one immutable apply-owned fact beside the target's learner origin.
// The fact binds the voter to this transition's fresh learner and identifies
// the exact committed attempt and historical configuration. A replica holding
// the target as a learner with no fact vouches that no promotion of it is in
// its applied history: a
// committed promotion makes it a voter, and only the transition's later
// branches, which wait for the promotion's recorded outcome, change that. A
// target held otherwise (absent, unresolved, a voter without that origin)
// vouches for nothing.
function answerCommittedPromotionAction(group, status, query) {
  const evidence = group.readLearnerOriginEvidence(query.action.replicaIdentity);
  const origin = evidence.coverage === RAFT_RS_LEARNER_ORIGIN_COVERAGE.RECORDED ?
    decodeCommittedLearnerAdmission(evidence.encoded) : null;
  if (origin === INVALID_COMMITTED_LEARNER_ADMISSION) {
    return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.CORRUPT);
  }
  const encodedFact = group.readPromotionAdmission(query.action.replicaIdentity);
  if (encodedFact !== null) {
    const fact = decodeCommittedPromotionAdmission(encodedFact);
    const refusal = promotionFactRefusal(fact, origin, evidence.encoded, query, status);
    if (refusal !== null) return learnerActionAnswer(ACTION_KIND.REFUSED, refusal);
    return learnerActionAnswer(ACTION_KIND.COMMITTED, ACTION_REASON.APPLIED,
      {receipt: origin, promotionFact: fact, observedAppliedIndex: status.appliedIndex,
        membership: answerCommittedMembership(group, status,
          COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS)});
  }
  const view = promotionTargetView(group, status, query.action);
  // A current voter without its immutable apply-owned promotion fact proves
  // neither which attempt committed nor its historical configuration.
  return learnerActionAnswer(ACTION_KIND.UNRESOLVED, ACTION_REASON.NOT_RECORDED,
    {observation: absenceObservation(status, view.learner)});
}
/** Historical positive evidence, never a current CREATE/absence/reissue grant.
 * Called in the group's queued turn after recovery and committed application.
 */
function answerCommittedLearnerAction(group, status, query) {
  if (unavailableMembershipRefusal(status) !== null) return unavailableLearnerAction();
  try {
    return query.action.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE ?
      answerCommittedPromotionAction(group, status, query) :
      answerCommittedLearnerOrigin(group, status, query);
  } catch {
    return unavailableLearnerAction();
  }
}

export {
  answerCommittedLearnerAction,
  normalizeCommittedLearnerRead,
  unavailableLearnerAction,
  answerCommittedMembership,
  ascendingPeerIdOrder,
  committedMembershipRefusal,
};
