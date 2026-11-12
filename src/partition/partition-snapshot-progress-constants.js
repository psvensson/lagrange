// Vocabulary of a partition leader's snapshot progress: the typed outcomes
// its checkpoint cadence and its catch-up dispatch report, the named events
// that lift a cadence refusal or re-ask a follower whose snapshot was not
// served, and the declared bounds of both. Values only; the cadence owner
// (partition-snapshot-cadence.js) and the catch-up driver
// (partition-snapshot-catchup-driver.js) decide with them.

import {TIME_MS} from '../constants/time.js';

// Typed outcomes of one cadence tick.
const RAFT_SNAPSHOT_CADENCE_OUTCOME = Object.freeze({
  CHECKPOINTED: 'checkpointed',
  COMPACTED: 'compacted',
  BELOW_THRESHOLD: 'below_threshold',
  NOT_LEADER: 'not_leader',
  ALREADY_IN_FLIGHT: 'already_in_flight',
  UNSUPPORTED_PARTITION: 'unsupported_partition',
  COMMITTED_LOG_UNSUPPORTED: 'committed_log_unsupported',
  CREATION_REFUSED: 'creation_refused',
  LEADERSHIP_LOST_MID_CREATION: 'leadership_lost_mid_creation',
  HELD_AFTER_REFUSAL: 'held_after_refusal',
  TICK_FAILED: 'tick_failed',
});

// The `event` field of the one log line each owner writes for an outcome
// that is not success, and of the line written when the condition ends.
const PARTITION_SNAPSHOT_PROGRESS_EVENT = Object.freeze({
  CADENCE_OUTCOME: 'partition_snapshot_cadence_outcome',
  CADENCE_RECOVERED: 'partition_snapshot_cadence_recovered',
  CATCHUP_DISPATCH_OUTCOME: 'partition_snapshot_catchup_dispatch_outcome',
  CATCHUP_SETTLED: 'partition_snapshot_catchup_settled',
  // A follower replica's install orchestration that did not end installed
  // and recreated.
  INSTALL_OUTCOME: 'partition_snapshot_install_outcome',
});

const PARTITION_SNAPSHOT_PROGRESS_LOG_MSG = Object.freeze({
  CADENCE_OUTCOME: 'Partition snapshot cadence did not compact',
  CADENCE_RECOVERED: 'Partition snapshot cadence compacted after refusals',
  CATCHUP_DISPATCH_OUTCOME: 'Snapshot catch-up dispatch did not serve',
  CATCHUP_SETTLED: 'Snapshot catch-up follower record closed',
  INSTALL_OUTCOME: 'Snapshot install did not complete on this replica',
});

// The `reason` of an outcome that names none of its own.
const PARTITION_SNAPSHOT_NO_OUTCOME_REASON = 'none';

// A cadence attempt that built (or tried to build) an image and was refused
// is not repeated every sweep: it is held until the named event that can
// change its reason, spaced by a doubling interval, or until the bound.
const PARTITION_SNAPSHOT_CADENCE_RETRY = Object.freeze({
  BASE_MS: TIME_MS.SECOND,
  BOUND_MS: TIME_MS.MINUTE,
});

const PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER = Object.freeze({
  APPLIED_INDEX_ADVANCED: 'applied_index_advanced',
  IDENTITY_CHANGED: 'identity_changed',
  BOUND_ELAPSED: 'retry_bound_elapsed',
});

// Why the catch-up driver asked the dispatcher for one follower.
const PARTITION_SNAPSHOT_CATCHUP_TRIGGER = Object.freeze({
  RUNTIME_NOTIFICATION: 'runtime_notification',
  NEWER_CHECKPOINT_GENERATION: 'newer_checkpoint_generation',
  IDENTITY_CHANGED: 'identity_changed',
  // The dispatcher answered that another transfer to the follower's node
  // held the node's one transfer slot: asked again on the next sweep.
  FOLLOWER_NODE_SLOT_BUSY: 'follower_node_slot_busy',
  BOUND_ELAPSED: 'reask_bound_elapsed',
  SERVED_BOUND_ELAPSED: 'served_reask_bound_elapsed',
});

// A follower still behind its snapshot boundary this long after a dispatch
// that did NOT serve settled is asked again.
const PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS = TIME_MS.SECOND * 30;

// A SERVED follower is closed by the leader's own progress for it once it
// has shut down, installed and reopened. Until then it is not offered the
// image again; if no progress has arrived this long after the transfer
// completed, the install is taken as not having happened and it is asked
// again. Ten times the refused bound: an install copies and hashes the
// whole image before the replica reopens.
const PARTITION_SNAPSHOT_CATCHUP_SERVED_REASK_BOUND_MS = TIME_MS.MINUTE * 5;

// A dispatch in flight that has reported no progress (generation resolved,
// channel obtained, one chunk served) for this long is aborted through the
// dispatcher's signal and settles typed, so a peer that stops answering
// cannot hold the follower's record or its node's transfer slot (R13: the
// record and the slot are resources with a bounded lifetime). It bounds
// SILENCE, never a transfer's total duration; it must exceed one paced
// chunk and is deliberately not sized to the slowest image seal: a seal
// that outlives it finishes, is kept, and is served by the next ask.
const PARTITION_SNAPSHOT_CATCHUP_DISPATCH_IDLE_BOUND_MS = TIME_MS.MINUTE;

// What the driver itself answers for a dispatch the dispatcher never typed.
const PARTITION_SNAPSHOT_CATCHUP_DRIVER_OUTCOME = Object.freeze({
  // The dispatch has not settled yet.
  IN_FLIGHT: 'dispatch_in_flight',
  DISPATCHER_UNWIRED: 'dispatcher_unwired',
  DISPATCH_FAULTED: 'dispatch_faulted',
  RESULT_UNTYPED: 'dispatch_result_untyped',
  // No progress within the idle bound: aborted through the signal.
  DISPATCH_UNANSWERED: 'dispatch_unanswered',
  // Asked of a driver whose service has shut down.
  SERVICE_SHUT_DOWN: 'service_shut_down',
});

// One re-ask sweep of the driver.
const PARTITION_SNAPSHOT_CATCHUP_SWEEP_OUTCOME = Object.freeze({
  NO_FOLLOWER_RECORD: 'no_follower_record',
  NOT_LEADER: 'not_leader',
  STATUS_UNAVAILABLE: 'status_unavailable',
  SWEPT: 'swept',
  SWEEP_FAILED: 'sweep_failed',
});

// Why a follower record closed.
const PARTITION_SNAPSHOT_CATCHUP_CLOSE = Object.freeze({
  PAST_BOUNDARY: 'follower_past_snapshot_boundary',
  NOT_IN_CONFIGURATION: 'follower_not_in_configuration',
  LEADERSHIP_LOST: 'leadership_lost',
  SERVICE_SHUT_DOWN: 'service_shut_down',
});

export {
  PARTITION_SNAPSHOT_CADENCE_RETRY,
  PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER,
  PARTITION_SNAPSHOT_CATCHUP_CLOSE,
  PARTITION_SNAPSHOT_CATCHUP_DISPATCH_IDLE_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_DRIVER_OUTCOME,
  PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_SERVED_REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_SWEEP_OUTCOME,
  PARTITION_SNAPSHOT_CATCHUP_TRIGGER,
  PARTITION_SNAPSHOT_NO_OUTCOME_REASON,
  PARTITION_SNAPSHOT_PROGRESS_EVENT,
  PARTITION_SNAPSHOT_PROGRESS_LOG_MSG,
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
};
