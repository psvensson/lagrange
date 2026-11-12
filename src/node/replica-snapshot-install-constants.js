// Vocabulary of a node's snapshot-install ownership (quest
// partition-checkpoint-epoch-generation, finding 1): the admission of a
// recreate after an install, and the recreation record the replica handler
// keeps for a replica it stopped for one. A leaf module.

// The admission of recreating a local replica after a snapshot install.
// ADMITTED: the lifecycle row says the replica is this node's to run.
// REFUSED: another owner has the replica (its removal or its cleanup): it is
// not recreated. HELD: the lifecycle cannot be decided now (the row is
// unobservable, or the create has not published SYNCING yet): asked again.
const REPLICA_RECREATE_ADMISSION = Object.freeze({
  ADMITTED: 'admitted',
  REFUSED: 'refused',
  HELD: 'held',
});

const REPLICA_RECREATE_ADMISSION_REASON = Object.freeze({
  ROW_ACTIVE: 'row_active',
  ROW_SYNCING: 'row_syncing',
  ROW_BEFORE_SYNCING: 'row_before_syncing',
  ROW_UNOBSERVABLE: 'row_unobservable',
  ROW_REMOVAL_IN_PROGRESS: 'row_removal_in_progress',
  ROW_FAILED: 'row_failed',
  ROW_CLEANUP_OWNED: 'row_cleanup_owned',
  ROW_ABSENT: 'row_absent',
  ROW_NOT_THIS_REPLICA: 'row_not_this_replica',
  ROW_STATUS_UNKNOWN: 'row_status_unknown',
});

// The state of one replica's install episode. RECEIVING: the offer was
// admitted and the replica still runs and serves. INSTALLING: stopped, its
// shutdown or install step running. RECREATE_PENDING: stopped, the handler
// bringing it back (or holding, see the holds). The others are how an episode
// ended: RUNNING (recreated), NOT_STOPPED (ended before the shutdown; the
// replica never stopped), CLAIMED (another owner took it; `claim` names it).
const REPLICA_SNAPSHOT_INSTALL_STATE = Object.freeze({
  RECEIVING: 'receiving',
  INSTALLING: 'installing',
  RECREATE_PENDING: 'recreate_pending',
  RUNNING: 'running',
  NOT_STOPPED: 'not_stopped',
  CLAIMED: 'claimed',
});

// Why a live episode opens nothing right now. Each hold has a production
// actor that clears it:
//   removal_pending               the accepted REMOVE itself (its claim once
//                                 REMOVING is durable, or its task ending)
//   awaiting_removal_owner        the REMOVE re-dispatch (the row is REMOVING
//                                 and no local removal runs)
//   awaiting_cleanup_owner        the cleanup owner's claim, or the row
//                                 returning to ACTIVE or SYNCING
//   lifecycle_unobservable        the control plane answering
//   row_before_syncing            the create publishing SYNCING
//   open_refused_install_conflict a removal, a cleanup or the handler's stop
const REPLICA_SNAPSHOT_INSTALL_HOLD = Object.freeze({
  NONE: 'none',
  REMOVAL_PENDING: 'removal_pending',
  AWAITING_REMOVAL_OWNER: 'awaiting_removal_owner',
  AWAITING_CLEANUP_OWNER: 'awaiting_cleanup_owner',
  LIFECYCLE_UNOBSERVABLE: 'lifecycle_unobservable',
  ROW_BEFORE_SYNCING: 'row_before_syncing',
  OPEN_REFUSED_INSTALL_CONFLICT: 'open_refused_install_conflict',
});

// The owners that take a replica from its episode, each at its own durable
// fact (replica-snapshot-install-owner.js).
const REPLICA_SNAPSHOT_INSTALL_CLAIM = Object.freeze({
  NONE: 'none',
  REMOVAL: 'removal',
  CREATE_FAILURE: 'create_failure',
  CLEANUP: 'cleanup',
  HANDLER_STOP: 'handler_stop',
});

// What a claimant waits for before it acts: the episode's step in flight (one
// service shutdown, one install, or one factory open with the release of
// what it opened). Bounded by that step; visible while it lasts.
const REPLICA_SNAPSHOT_INSTALL_WAIT = Object.freeze({
  NONE: 'none',
  EPISODE_STEP_SETTLE: 'episode_step_settle',
});

const REPLICA_SNAPSHOT_INSTALL_ERROR_CODE = Object.freeze({
  // A registry or tracked-service write for a replica under a live episode
  // that did not present the episode's custody.
  REPLICA_UNDER_INSTALL_EPISODE: 'REPLICA_UNDER_INSTALL_EPISODE',
  // A caller waiting on a replica that did not return from its install.
  REPLICA_NOT_BACK_FROM_INSTALL: 'REPLICA_NOT_BACK_FROM_SNAPSHOT_INSTALL',
});

// Why an offer is not admitted, beyond the lifecycle admission's reasons.
const REPLICA_SNAPSHOT_OFFER_REFUSAL = Object.freeze({
  EPISODE_LIVE: 'replica_installing',
  NOT_TRACKED_RUNNING: 'replica_not_tracked_running',
  REMOVAL_IN_PROGRESS: 'removal_in_progress',
  REMOVAL_PENDING: 'removal_pending',
  EPISODE_CLAIMED: 'episode_claimed',
  IMAGE_OMITS_REPLICA: 'image_omits_replica',
});

// What one recreation attempt answered.
const REPLICA_RECREATE_ATTEMPT = Object.freeze({
  NOT_ATTEMPTED: 'not_attempted',
  RECREATED: 'recreated',
  PREVIOUS_SERVICE_NOT_RELEASED: 'previous_service_not_released',
  ADMISSION_HELD: 'admission_held',
  ADMISSION_REFUSED: 'admission_refused',
  CREATE_THREW: 'create_threw',
  OPEN_REFUSED_INSTALL_CONFLICT: 'open_refused_install_conflict',
  ATTEMPT_FAULTED: 'attempt_faulted',
  REGISTER_THREW: 'register_threw',
  HELD_FOR_REMOVAL: 'held_for_removal',
  EPISODE_CLAIMED: 'episode_claimed',
});

// Why a recreation attempt ran.
const REPLICA_RECREATE_TRIGGER = Object.freeze({
  INSTALL_SETTLED: 'install_settled',
  LIFECYCLE_TRANSITION: 'lifecycle_transition',
  BOUND_ELAPSED: 'bound_elapsed',
  HOLD_LIFTED: 'hold_lifted',
});

// How long a pending recreation waits before it asks again when no lifecycle
// transition of the replica wakes it earlier. One attempt is one
// authoritative row read and, when admitted, one open of the replica's
// database; a lifecycle that is unobservable recovers in seconds on a healthy
// control plane, and the leader's own re-offer bound for a served follower is
// minutes (partition-snapshot-progress-constants.js), so the replica is back
// well inside it.
const REPLICA_RECREATE_RETRY_BOUND_MS = 2000;

// The backoff of a hold that only another owner clears (awaiting_removal_owner,
// awaiting_cleanup_owner, open_refused_install_conflict): the attempt is
// repeated at the retry bound, doubling to this ceiling, so a replica nobody
// claims costs one row read a minute and stays visible.
const REPLICA_RECREATE_HOLD_BACKOFF_MAX_MS = 60000;

const REPLICA_SNAPSHOT_INSTALL_EVENT = Object.freeze({
  RECREATION: 'replica_snapshot_install_recreation',
  OFFER_NOT_ADMITTED: 'replica_snapshot_offer_not_admitted',
  EPISODE_CLAIMED: 'replica_snapshot_install_episode_claimed',
  EPISODE_HELD: 'replica_snapshot_install_episode_held',
  REGISTRY_WRITE_REFUSED: 'replica_snapshot_install_registry_write_refused',
});

const REPLICA_SNAPSHOT_INSTALL_LOG_MSG = Object.freeze({
  RECREATION_PENDING: 'Replica stopped for a snapshot install is not back yet',
  RECREATION_ENDED: 'Replica snapshot install episode ended',
  OFFER_NOT_ADMITTED: 'Snapshot offer refused before anything was received',
  EPISODE_CLAIMED: 'Replica snapshot install episode claimed by another owner',
  EPISODE_HELD: 'Replica snapshot install episode held for a removal',
});

export {
  REPLICA_RECREATE_ADMISSION,
  REPLICA_RECREATE_ADMISSION_REASON,
  REPLICA_RECREATE_ATTEMPT,
  REPLICA_RECREATE_HOLD_BACKOFF_MAX_MS,
  REPLICA_RECREATE_RETRY_BOUND_MS,
  REPLICA_RECREATE_TRIGGER,
  REPLICA_SNAPSHOT_INSTALL_CLAIM,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE,
  REPLICA_SNAPSHOT_INSTALL_EVENT,
  REPLICA_SNAPSHOT_INSTALL_HOLD,
  REPLICA_SNAPSHOT_INSTALL_LOG_MSG,
  REPLICA_SNAPSHOT_INSTALL_STATE,
  REPLICA_SNAPSHOT_INSTALL_WAIT,
  REPLICA_SNAPSHOT_OFFER_REFUSAL,
};
