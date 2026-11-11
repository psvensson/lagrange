/**
 * Owner contract:
 * Owner: the removal transferee rule - which surviving voter a replica that
 * leads its group while it is being removed hands leadership to. One rule,
 * consumed at both ends of a removal (the universal removal leadership rule,
 * 2026-11-11): the rebalancer's removal leadership gate, which asks the
 * transferee by a named STEP_DOWN before it dispatches the removal
 * (operation-workflow-replace-handoff-attempt.js), and the node's removal
 * effect owner, whose retiring replica hands leadership on by a named
 * transfer when it holds or gains leadership after the removal began
 * (partition-service-removal-subject-handoff.js).
 * Inputs: the configuration's shape (joint or not) and one fact record per
 * voter of it, built by each consumer from its own evidence:
 *  - confirmsLeader: the voter answered the current leader at its term (the
 *    gate: its own corroborating answer; the leader: its own progress for the
 *    voter, which raft-rs resets at every election, is past zero);
 *  - pastParticipationGate: the voter takes part (the gate: its own answer's
 *    gateOpen; the leader: its log holds the configuration's own entry,
 *    matched >= the membership generation index - the leader's evidence that
 *    the voter can be past its gate);
 *  - routed: the voter can be addressed;
 *  - index, secondaryIndex: how far it has caught up (the gate: applied then
 *    commit index from its answer; the leader: matched, no secondary).
 * Canonical output: the chosen voter's fact record, or null (named by the
 * caller as its no-transferee wait). Eligible: a voter of a non-joint
 * configuration, not the subject, confirming the leader, past its gate and
 * routed; ranked by index, then secondary index, then the lower id. The
 * candidate the caller excludes - the one its previous attempt named that
 * did not take leadership (the gate: an answer that did not accept; the
 * node: a transfer that ran out) - is passed over while another eligible
 * candidate exists, so one refusing voter is never re-picked forever.
 * Not here: whether a transfer is needed at all (each consumer's), the
 * transfer itself (the leadership-transfer owner), and the last voter of a
 * group (no transferee: a group retirement's authority, never a removal's).
 */

import {PEER_ADDRESS_STATUS} from './raft-rs-runtime-owner-constants.js';

/**
 * @param {Object} voter - One voter's facts.
 * @param {string} subjectId - The replica being removed.
 * @return {boolean} Whether the voter may take leadership from the subject.
 */
function isEligibleTransferee(voter, subjectId) {
  return typeof voter?.id === 'string' && voter.id !== subjectId &&
    voter.confirmsLeader === true && voter.pastParticipationGate === true &&
    voter.routed === true;
}

function transfereeOrder(left, right) {
  return Number(right.index) - Number(left.index) ||
    Number(right.secondaryIndex) - Number(left.secondaryIndex) ||
    (left.id < right.id ? -1 : 1);
}

/**
 * Choose the transferee of a leading removal subject.
 * @param {Object} input
 * @param {string} input.subjectId - The replica being removed.
 * @param {boolean} input.joint - Whether the configuration is joint (no
 *   transferee is chosen inside one: the change in flight decides first).
 * @param {Array<Object>} input.voters - One fact record per voter.
 * @param {string|null} [input.excludedId] - The candidate the previous
 *   attempt named that did not take leadership.
 * @return {Object|null} The chosen voter's facts, or null.
 */
function chooseRemovalTransferee({subjectId, joint, voters,
  excludedId = null}) {
  if (joint === true || !Array.isArray(voters)) {
    return null;
  }
  const eligible = voters.filter((voter) =>
    isEligibleTransferee(voter, subjectId));
  const others = eligible.filter((voter) => voter.id !== excludedId);
  const ranked = (others.length > 0 ? others : eligible).sort(transfereeOrder);
  return ranked[0] ?? null;
}

// The leader's own facts about every voter of its configuration, as the
// rule reads them, from the port's status of the leader: raft-rs resets a
// follower's progress at every election, so a matched index past zero is
// the voter's answer to this leader; matched at or past the configuration's
// own entry (the membership generation index) is the leader's evidence that
// the voter can be past its participation gate.
function leaderTransfereeFactsOf(status) {
  const generation = Number(status.membershipGenerationIndex);
  return status.peers.filter((peer) => peer.learner !== true &&
    status.confState.voters.includes(peer.peerId)).map((peer) => {
    const matched = Number(status.followerProgress[peer.replicaIdentity]);
    return {id: peer.replicaIdentity, confirmsLeader: matched > 0,
      pastParticipationGate: Number.isFinite(generation) &&
        matched >= generation,
      routed: peer.addressStatus === PEER_ADDRESS_STATUS.RESOLVED,
      index: matched, secondaryIndex: 0};
  });
}

/**
 * The rule over a leading subject's own port status.
 * @param {Object} status - The leader's port status (readStatus).
 * @param {string|null} excludedId - The caller's excluded candidate.
 * @return {Object|null} The chosen voter's facts, or null.
 */
function chooseLeaderRemovalTransferee(status, excludedId) {
  return chooseRemovalTransferee({
    subjectId: status.replicaIdentity,
    joint: (status.confState.votersOutgoing || []).length > 0,
    voters: leaderTransfereeFactsOf(status),
    excludedId,
  });
}

export {chooseLeaderRemovalTransferee, chooseRemovalTransferee};
