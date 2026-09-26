// When the core takes a configuration-change proposal, read from the core's
// own numbers (verification V2). raft-rs drops a conf-change proposal while
// `pending_conf_index > applied` (raft.rs:2743) or while the configuration
// is joint and the change is not the leave (raft.rs:2063-2090) - answering
// Ok and appending an empty entry in its place. Every proposed conf entry
// sets the pending index, whatever its effect (raft.rs:2077), and a new
// leader sets it to its last index (raft.rs:1227-1232).
//
// This module decides two things from the core's status and configuration,
// read by the runtime owner in the same turn:
//   - a proposal the core would drop is answered as a typed, retryable
//     deferral (CONF_CHANGE_PENDING) and never reaches the crate;
//   - a drain settled a configuration change when it applied a conf-change
//     entry or the pending index was reached without one; the settlement is
//     announced (CONF_CHANGE_APPLIED) so a deferred or in-flight admission is
//     proposed again within one applied entry.
// Nothing here reads a row or the core itself.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {
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
 * The deferral of a conf-change proposal the core would drop, or null when
 * the core takes it.
 * @param {Object} status - The core's status.
 * @param {Object} confState - The core's configuration.
 * @return {Object|null} Frozen HOST_FAILURE deferral (retryable, the group
 *   usable), or null.
 */
function confChangeProposalDeferral(status, confState) {
  if (!hasPendingConfChange(status) &&
      (confState?.votersOutgoing || []).length === 0) {
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
 * @return {Object|null} Frozen {appliedIndex, confChangeEntries, admissible}.
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
    admissible: !pendingNow,
  });
}

export {confChangeProposalDeferral, confChangeSettlement};
