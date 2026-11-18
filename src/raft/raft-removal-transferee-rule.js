/**
 * Owner contract:
 * Owner: the leadership transferee rule - which voter a leader that must hand
 * its leadership on names. One rule for every chooser of a transferee
 * (2026-11-11): the rebalancer's removal leadership gate, which asks the
 * transferee by a named STEP_DOWN before it dispatches the removal
 * (operation-workflow-replace-handoff-attempt.js); the node's removal effect
 * owner, whose retiring replica hands leadership on by a named transfer
 * (partition-service-removal-subject-handoff.js); and the raft owner's
 * MOST_CAUGHT_UP transfer (raft-rs-leadership-transfer.js), which serves the
 * replica handler's source-side STEP_DOWN and the step-down of a leader its
 * applied configuration removed.
 * Inputs: the configuration's shape (joint or not) and one fact record per
 * voter of it, built by each consumer from its own evidence:
 *  - confirmsLeader: the voter is live for this leader now (the gate: its own
 *    corroborating answer to the current leader at its term; a leader: its
 *    voter-liveness record - heard in this tenure within the window, and not
 *    a transferee whose attempt aborted and that has not been heard since);
 *  - pastParticipationGate: the voter can take leadership now (the gate: its
 *    own answer's gateOpen; the node's named transfer: its log holds the
 *    configuration's own entry, matched >= the membership generation index;
 *    the core's own transfer: its progress is not waiting on a snapshot, so
 *    the core can bring it to the last index by appends inside the
 *    transfer's election timeout - raft-rs sends MsgTimeoutNow only once
 *    matched == last index, which holds the configuration's entry);
 *  - routed: the voter can be addressed;
 *  - index, secondaryIndex: how far it has caught up (the gate: applied then
 *    commit index from its answer; a leader: matched, no secondary).
 * Canonical output (TRANSFEREE_DECISION): CHOSEN with the chosen voter's fact
 * record; JOINT_CONFIGURATION (no transferee inside a joint configuration:
 * the change in flight decides first); NO_LIVE_TRANSFEREE (no voter other
 * than the subject qualifies). Eligible: a voter of a non-joint
 * configuration, not the subject, live, past its gate and routed; ranked
 * first by whether the caller passed it over (the one its previous attempt
 * named that did not take leadership - the gate: an answer that did not
 * accept; the node: a transfer that ran out; a leader: a transfer that
 * aborted in this tenure), then by index, secondary index, the lower id. A
 * passed-over voter is named again only when no other qualifies, so one
 * refusing voter is never re-picked forever; a transferee that aborted and
 * was not heard since is not live at all (excluded until heard again).
 * Not here: whether a transfer is needed at all (each consumer's), the
 * transfer itself (the leadership-transfer owner), and the last voter of a
 * group (no transferee: a group retirement's authority, never a removal's).
 */

import {PEER_ADDRESS_STATUS} from './raft-rs-runtime-owner-constants.js';

const TRANSFEREE_DECISION = Object.freeze({
  CHOSEN: 'transferee-chosen',
  JOINT_CONFIGURATION: 'transferee-joint-configuration',
  NO_LIVE_TRANSFEREE: 'no-live-transferee',
});

// raft-rs's progress state of a follower the leader can only catch up by a
// snapshot (tracker/progress.rs ProgressState::Snapshot, as the binding's
// status formats it).
const SNAPSHOT_PROGRESS_STATE = 'Snapshot';

/**
 * @param {Object} voter - One voter's facts.
 * @param {string} subjectId - The replica handing leadership on.
 * @return {boolean} Whether the voter may take leadership from the subject.
 */
function isEligibleTransferee(voter, subjectId) {
  return typeof voter?.id === 'string' && voter.id !== subjectId &&
    voter.confirmsLeader === true && voter.pastParticipationGate === true &&
    voter.routed === true;
}

function lowerId(left, right) {
  return left < right ? -1 : 1;
}

// Raft peer ids are unsigned 64-bit integers: the lower id numerically.
function lowerRaftPeerId(left, right) {
  return BigInt(left) < BigInt(right) ? -1 : 1;
}

function transfereeOrder(passedOver, tieBreak) {
  return (left, right) =>
    Number(passedOver.has(left.id)) - Number(passedOver.has(right.id)) ||
    Number(right.index) - Number(left.index) ||
    Number(right.secondaryIndex) - Number(left.secondaryIndex) ||
    tieBreak(left.id, right.id);
}

/**
 * Decide the transferee of a leader that hands its leadership on.
 * @param {Object} input
 * @param {string} input.subjectId - The replica handing leadership on.
 * @param {boolean} input.joint - Whether the configuration is joint.
 * @param {Array<Object>} input.voters - One fact record per voter.
 * @param {Array<string>} [input.passedOverIds] - Candidates a previous
 *   attempt named that did not take leadership.
 * @param {Function} [input.tieBreak] - The order of two ids on a full tie
 *   (the lower id first).
 * @return {Object} Frozen {decision, transferee} (transferee null unless
 *   CHOSEN).
 */
function decideTransferee({subjectId, joint, voters, passedOverIds = [],
  tieBreak = lowerId}) {
  if (joint === true) {
    return Object.freeze({decision: TRANSFEREE_DECISION.JOINT_CONFIGURATION,
      transferee: null});
  }
  const passedOver = new Set(passedOverIds.filter((id) => id !== null));
  const [transferee] = (Array.isArray(voters) ? voters : [])
    .filter((voter) => isEligibleTransferee(voter, subjectId))
    .sort(transfereeOrder(passedOver, tieBreak));
  return transferee === undefined ?
    Object.freeze({decision: TRANSFEREE_DECISION.NO_LIVE_TRANSFEREE,
      transferee: null}) :
    Object.freeze({decision: TRANSFEREE_DECISION.CHOSEN, transferee});
}

/**
 * The rule's transferee as a fact record or null: the removal gate's present
 * reading of the rule (operation-workflow-replace-handoff-attempt.js names
 * null its WAIT_NO_TRANSFEREE). That consumer moves to decideTransferee's
 * named outcomes; this projection goes with it.
 * @param {Object} input - As decideTransferee, with excludedId the one
 *   passed-over candidate.
 * @return {Object|null} The chosen voter's facts, or null.
 */
function chooseRemovalTransferee({subjectId, joint, voters,
  excludedId = null}) {
  return decideTransferee({subjectId, joint, voters,
    passedOverIds: [excludedId]}).transferee;
}

function matchedPastGeneration(matched, generationIndex) {
  const generation = Number(generationIndex);
  return Number.isFinite(generation) && Number(matched) >= generation;
}

// The leader's own facts about every voter of its configuration, as the
// rule reads them, from the port's status of the leader: its liveness record
// (status.liveVoters, raft-rs-voter-liveness.js) says who answered it in this
// tenure; matched at or past the configuration's own entry (the membership
// generation index) is its evidence that the voter can be past its
// participation gate.
function leaderTransfereeFactsOf(status) {
  const live = new Set((status.liveVoters || []).map(String));
  return status.peers.filter((peer) => peer.learner !== true &&
    status.confState.voters.includes(peer.peerId)).map((peer) => {
    const matched = Number(status.followerProgress[peer.replicaIdentity]);
    return {id: peer.replicaIdentity,
      confirmsLeader: live.has(String(peer.peerId)),
      pastParticipationGate: matchedPastGeneration(matched,
        status.membershipGenerationIndex),
      routed: peer.addressStatus === PEER_ADDRESS_STATUS.RESOLVED,
      index: matched, secondaryIndex: 0};
  });
}

/**
 * The rule over a leading subject's own port status: the node's removal
 * effect owner's reading (partition-service-removal-subject-handoff.js names
 * null its NO_TRANSFEREE). That consumer moves to the named outcome of
 * decideLeaderTransferee; this projection goes with it.
 * @param {Object} status - The leader's port status (readStatus).
 * @param {string|null} excludedId - The caller's passed-over candidate.
 * @return {Object|null} The chosen voter's facts, or null.
 */
function chooseLeaderRemovalTransferee(status, excludedId) {
  return decideLeaderTransferee(status, [excludedId]).transferee;
}

/**
 * The rule over a leader's own port status.
 * @param {Object} status - The leader's port status (readStatus).
 * @param {Array<string>} passedOverIds - Passed-over replica identities.
 * @return {Object} As decideTransferee.
 */
function decideLeaderTransferee(status, passedOverIds) {
  return decideTransferee({
    subjectId: status.replicaIdentity,
    joint: (status.confState.votersOutgoing || []).length > 0,
    voters: leaderTransfereeFactsOf(status),
    passedOverIds,
  });
}

/**
 * The rule over the core's own facts, as the raft owner reads them in the
 * same queued turn as the transfer it steps: the voters of the configuration,
 * the leader's progress for each (raft-rs Progress: matched and state) and
 * the leader's voter-liveness facts (voterLivenessFactsOf). Ids are raft peer ids. The core addresses its
 * transferee through the group's transport, so every voter is routed here: an
 * unreachable transferee's transfer aborts and it is passed over.
 * @param {string} peerId - The leader's raft id.
 * @param {Object} observation - {status, confState, voterLiveness}.
 * @return {Object} As decideTransferee.
 */
function decideCoreTransferee(peerId, {status, confState, voterLiveness}) {
  const live = new Set(voterLiveness.liveVoters);
  const unheard = new Set(voterLiveness.abortedUnheard);
  const progressOf = new Map((status.progress || [])
    .map((progress) => [String(progress?.id), progress]));
  const learners = new Set((confState.learners || []).map(String));
  const voters = (confState.voters || []).map(String)
    .filter((id) => !learners.has(id) && progressOf.has(id))
    .map((id) => {
      const progress = progressOf.get(id);
      return {id, confirmsLeader: live.has(id) && !unheard.has(id),
        pastParticipationGate: progress.state !== SNAPSHOT_PROGRESS_STATE,
        routed: true, index: Number(progress.matched), secondaryIndex: 0};
    });
  return decideTransferee({subjectId: String(peerId),
    joint: (confState.votersOutgoing || []).length > 0, voters,
    passedOverIds: voterLiveness.aborted, tieBreak: lowerRaftPeerId});
}

export {
  TRANSFEREE_DECISION,
  chooseLeaderRemovalTransferee,
  chooseRemovalTransferee,
  decideCoreTransferee,
  decideLeaderTransferee,
  decideTransferee,
};
