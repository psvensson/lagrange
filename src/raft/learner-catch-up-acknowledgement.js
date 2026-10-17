// The group leader's acknowledgement that a fresh learner has caught up,
// judged on one observation of that leader. Moved unchanged from the
// learner-join capability (FreshMG 6.B slice B2, its RUNNING decision) so that
// 6.C slice C2's promotion selection consumes the same decision instead of a
// copy; subordinate to the promotion-progress owner (learner-promotion-
// progress.js), whose exact entry it consults. Pure: the caller supplies the
// leader's committed answer and status and the learner's own committed stamp;
// nothing here reads a port, a row or a clock. An acknowledgement is an
// observation, never a promotion grant: the native promotion turn re-derives
// progress in its own synchronous turn.

import {committedStampOfAnswer} from './raft-committed-membership-stamp.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {ROLE_LEADER} from './raft-rs-runtime-owner-constants.js';
import {LEARNER_CATCH_UP_ACKNOWLEDGEMENT as ACK, LEARNER_PROMOTION_PROOF_DECISION,
  evaluateExactLearnerPromotionProof} from './learner-promotion-progress.js';

// Decided in this order: the first unmet fact names the state (a leader whose
// committed configuration no longer holds the learner REMOVED it; no own view
// of the learner holding itself is LEARNER_UNOBSERVED; the exact
// promotion-progress predicate not granting is BEHIND).
const ACKNOWLEDGEMENT_RULES = Object.freeze([
  Object.freeze({fact: 'leads', state: ACK.LEADER_UNAVAILABLE}),
  Object.freeze({fact: 'holdsLearner', state: ACK.REMOVED}),
  Object.freeze({fact: 'learnerHolds', state: ACK.LEARNER_UNOBSERVED}),
  Object.freeze({fact: 'caughtUp', state: ACK.BEHIND}),
]);

/**
 * A configuration names exactly this learner: a learner, not a voter, under
 * its own permanent identity.
 * @param {Object} stamp - A validated committed stamp.
 * @param {Object} identity - {targetPeerId, targetReplicaId}.
 * @return {boolean}
 */
function namesExactLearner(stamp, identity) {
  return stamp.learners.includes(identity.targetPeerId) &&
    !stamp.voters.includes(identity.targetPeerId) &&
    stamp.identities[identity.targetPeerId] === identity.targetReplicaId;
}

// The leader's own observed progress for the learner (its follower progress
// at the address it resolves the learner's peer to), or undefined.
function leaderMatchIndex(status, identity) {
  const peer = status.peers?.find((entry) => entry.peerId === identity.targetPeerId &&
    entry.replicaIdentity === identity.targetReplicaId);
  return peer?.address ? status.followerProgress?.[peer.address] : undefined;
}

// The leader's committed answer and its own status are one leader in one term.
function observedLeaderLeads(leader, status, identity) {
  return leader !== null && status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.role === ROLE_LEADER && status.groupId === identity.groupId &&
    status.replicaIdentity === leader.leaderId && status.term === leader.term;
}

// The exact promotion-progress entry on the leader's own observation, the two
// observed epochs being the configuration generations of the leader and of
// the learner's own applied configuration.
function caughtUpProof(leader, status, own, identity) {
  return evaluateExactLearnerPromotionProof({raftIsLeader: true, currentTerm: status.term,
    committedIndex: status.commitIndex, learnerMatchIndex: leaderMatchIndex(status, identity),
    leaderMembershipEpoch: leader.membershipGenerationIndex,
    learnerMembershipEpoch: own.membershipGenerationIndex});
}

/**
 * Whether the group's current leader acknowledges the learner caught up. The
 * leader's committed configuration (its BOOTSTRAP-purpose answer) and its own
 * status must be one leader in one term; that configuration must still hold
 * the exact learner; its commit index and its follower match for the learner
 * must be exact integers with match >= commit > 0, the configuration
 * generations of the leader and of the learner's own applied configuration
 * equal, and the commit at or past the boundary. Pure; never a grant.
 * @param {Object} observation - {membership, status} from the leader.
 * @param {Object|null} own - The learner's own committed configuration stamp,
 *   naming it the exact learner, or null when no such view was observed.
 * @param {Object} identity - The recorded learner identity.
 * @param {number} boundary - The applied index the leader's commit must reach.
 * @return {Object} {state: LEARNER_CATCH_UP_ACKNOWLEDGEMENT, ...}.
 */
function learnerCatchUpAcknowledgement(observation, own, identity, boundary) {
  const leader = committedStampOfAnswer(observation?.membership);
  const status = observation?.status;
  const leads = observedLeaderLeads(leader, status, identity);
  const proof = leads && own !== null ? caughtUpProof(leader, status, own, identity) : null;
  const facts = {leads, holdsLearner: leads && namesExactLearner(leader, identity),
    learnerHolds: own !== null,
    caughtUp: proof?.decision === LEARNER_PROMOTION_PROOF_DECISION.GRANTED &&
      status.commitIndex >= boundary};
  const unmet = ACKNOWLEDGEMENT_RULES.find((rule) => facts[rule.fact] !== true);
  return unmet ? {state: unmet.state, proofReason: proof?.reason ?? null} :
    {state: ACK.ACKNOWLEDGED, leaderReplicaId: status.replicaIdentity, term: status.term,
      commitIndex: status.commitIndex, matchIndex: proof.learnerMatchIndex,
      configurationGeneration: leader.membershipGenerationIndex, leader};
}

export {
  learnerCatchUpAcknowledgement,
  namesExactLearner,
};
