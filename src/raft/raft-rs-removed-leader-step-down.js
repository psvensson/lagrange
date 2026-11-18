// The runtime owner's two entries to the removed leader's action
// (removedLeaderAction, raft-rs-leadership-transfer.js): a leader its own
// applied configuration no longer names steps down through the binding's
// step_down_removed_leader, or hands leadership to the voter the transferee
// rule names.
//
// At the apply: the moment the core applied the configuration change that
// removed this replica, inside the Ready cycle that carried it and before
// any other core call of that cycle. A step-down decided there is entered
// there: the cycle's own advance_append (on_persist_entries) and every later
// acknowledgement (maybe_commit) then find a follower, never a leader
// without progress for itself. A transfer is not started there; the drain's
// end starts it.
// At the end of every drain: the same decision on the facts that drain left.
// A step-down is entered at once, in the same turn, and the caller drains
// the Ready it produced; a transfer is queued as the group's next turn, one
// at a time. The drains of that turn itself never queue another (that would
// queue turn after turn with nothing else moving); the next drain anything
// else causes - a tick, a delivery - decides again while the replica still
// leads: once the transfer aborted, the transferee rule names the next live
// voter, or none, and then the leader steps down.
//
// The binding refuses the step-down by name in every state but a removed
// leader's (not leader, still promotable, still holds its own progress) and
// while a Ready is outstanding with messages queued (raft-rs's
// advance_append refuses new messages from a replica that does not lead). A
// refusal leaves the core as it was, and the next entry decides again from
// the core's facts then. A trap fails the runtime as any core call's does;
// the caller's next core call answers it.

import {RAFT_RS_CORE_PRIMITIVE} from './raft-rs-core-constants.js';
import {
  REMOVED_LEADER_ACTION,
  removedLeaderAction,
} from './raft-rs-leadership-transfer.js';

function namesPeer(confState, peerId) {
  return [...(confState.voters || []), ...(confState.votersOutgoing || []),
    ...(confState.learners || [])].map(String).includes(String(peerId));
}

function settle(peerId, observed, {stepDown, queueTransfer}) {
  if (!observed.ok) {
    return false;
  }
  const decided = removedLeaderAction(peerId, observed.value);
  if (decided.action === REMOVED_LEADER_ACTION.TRANSFER) {
    queueTransfer(decided.transfer);
    return false;
  }
  return decided.action === REMOVED_LEADER_ACTION.STEP_DOWN &&
    stepDown(RAFT_RS_CORE_PRIMITIVE.STEP_DOWN_REMOVED_LEADER).ok;
}

const NO_TRANSFER_AT_APPLY = Object.freeze({queueTransfer() {}});

/**
 * The entry at the apply of a configuration change.
 * @param {Object} input
 * @param {string} input.peerId - This replica's raft id.
 * @param {Object} input.confState - The configuration the core just applied.
 * @param {Function} input.observe - () => the group's observation
 *   ({ok, value}) read now.
 * @param {Function} input.stepDown - (primitive) => the core call's answer.
 * @return {boolean} Whether the replica stepped down.
 */
function removedLeaderAtApply({peerId, confState, observe, stepDown}) {
  return !namesPeer(confState, peerId) &&
    settle(peerId, observe(), {stepDown, ...NO_TRANSFER_AT_APPLY});
}

/**
 * The entry at the end of a drain.
 * @param {Object} input
 * @param {string} input.peerId - This replica's raft id.
 * @param {Object} input.observed - The observation the drain recorded
 *   ({ok, value}).
 * @param {Function} input.stepDown - (primitive) => the core call's answer.
 * @param {Function} input.queueTransfer - (transfer) => queues the transfer
 *   command as the group's next turn.
 * @return {boolean} Whether the replica stepped down: the core holds a Ready
 *   the caller drains.
 */
function removedLeaderAtDrainEnd({peerId, observed, stepDown, queueTransfer}) {
  return settle(peerId, observed, {stepDown, queueTransfer});
}

export {removedLeaderAtApply, removedLeaderAtDrainEnd};
