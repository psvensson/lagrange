// When the core takes a configuration-change proposal, read from the core's
// own numbers (verification V2; round 2 F-1, F-5).
//
// The one ingress: a conf-change proposal is taken only at the LEADER's own
// port. raft-rs forwards a follower's proposal to its leader (MsgPropose,
// `step_follower`), where `step_leader` applies the drop rules below to it
// without any answer reaching the proposer - an ingress this runtime cannot
// see. So a follower's (or candidate's) port answers a typed, retryable
// NOT_LEADER naming the leader it knows, and hands the crate nothing; the
// leader's port is then the only path into any core, and the pending-index
// check below covers every conf change that enters one.
//
// The crate's drop reasons (`step_leader`, raft.rs:2062-2090), each answered
// here instead of letting the crate replace the proposal with an empty
// entry and answer Ok:
//   - `pending_conf_index > applied` (raft.rs:2743): every proposed conf
//     entry sets it, whatever its effect (raft.rs:2077), and a new leader
//     sets it to its last index (raft.rs:1227-1232) - deferred typed
//     (CONF_CHANGE_PENDING);
//   - a joint configuration and a change that is not the leave - deferred
//     typed.
// Excluded: an empty change (the leave) outside a joint configuration. No
// producer reaches the port with one: the port's normaliser builds exactly
// one step for every membership operation it accepts.
//
// A drain settled a configuration change when it applied a conf-change
// entry or the pending index was reached without one; the settlement is
// announced (CONF_CHANGE_APPLIED) so a deferred, refused-not-leader or
// in-flight proposal is made again within one applied entry.
// Nothing here reads a row or the core itself.

import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {
  ROLE,
  ROLE_LEADER,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

/**
 * Whether the core holds an unapplied configuration change.
 * @param {Object} status - The core's status ({pendingConfIndex, applied}).
 * @return {boolean}
 */
function hasPendingConfChange(status) {
  return BigInt(status.pendingConfIndex ?? 0) > BigInt(status.applied ?? 0);
}

/**
 * The answer to a conf-change proposal the core must not be handed, or null
 * when the leader's core takes it. A replica that does not lead answers
 * NOT_LEADER (the crate would forward it where no answer comes back); the
 * leader defers what it would drop. In a joint configuration the one change
 * the core takes is the leave (a change with no steps); any other waits.
 * @param {Object} observed
 * @param {Object} observed.status - The core's status.
 * @param {Object} observed.confState - The core's configuration.
 * @param {Object} observed.change - The normalized ConfChangeV2 ({changes}).
 * @param {Function} observed.leaderReplicaIdOf - (lead) => the leader's
 *   replica identity, or null.
 * @return {Object|null} Frozen CORE_REFUSED NOT_LEADER or HOST_FAILURE
 *   deferral (both retryable, the group usable), or null.
 */
function confChangeProposalRefusal({status, confState, change,
  leaderReplicaIdOf}) {
  if (ROLE[status.raftState] !== ROLE_LEADER) {
    return deepFreeze({
      outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEADER,
      phase: RUNTIME_PHASE.ADMISSION,
      retryable: true,
      recoveryRequired: false,
      leaderReplicaId: leaderReplicaIdOf(status.lead),
    });
  }
  const joint = (confState?.votersOutgoing || []).length > 0;
  const leavesJoint = (change?.changes || []).length === 0;
  if (!hasPendingConfChange(status) && !(joint && !leavesJoint)) {
    return null;
  }
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    reason: RUNTIME_REASON.CONF_CHANGE_PENDING,
    phase: RUNTIME_PHASE.ADMISSION,
    retryable: true,
    recoveryRequired: false,
  });
}

/**
 * The settlement one drain announces, or null when it settled nothing.
 * @param {Object} observation
 * @param {Object|null|undefined} observation.before - The core's status the
 *   previous drain recorded.
 * @param {Object} observation.now - The core's status after this drain.
 * @param {number} observation.confChangeEntries - Conf-change entries this
 *   drain applied.
 * @param {bigint} observation.appliedIndex - The runtime's applied index.
 * @return {Object|null} Frozen {appliedIndex, confChangeEntries}.
 */
function confChangeSettlement({before, now, confChangeEntries,
  appliedIndex}) {
  const pendingNow = hasPendingConfChange(now);
  const windowClosed = Boolean(before) && hasPendingConfChange(before) &&
    !pendingNow;
  if (confChangeEntries === 0 && !windowClosed) {
    return null;
  }
  return deepFreeze({
    appliedIndex: Number(appliedIndex),
    confChangeEntries,
  });
}

export {confChangeProposalRefusal, confChangeSettlement};
