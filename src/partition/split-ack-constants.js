/**
 * Typed participant acknowledgement constants for split executors.
 *
 * Split execution participants (PartitionService for source-side work,
 * child partitions for provisioning) produce acknowledgement payloads
 * that flow through the owner-key reconcile queue to ManagedSplitWorkflow.
 *
 * Payloads compose with PARTICIPANT_ACK_FIELD from workflow-constants.js
 * for the canonical field names (workflowId, participantKey, fenceToken,
 * status, checkpoint, acknowledgedAt).
 *
 * Requirements: 2, 3, 8
 * Design: §1, §3, §4
 */

/**
 * Participant status values for split executor acknowledgements.
 *
 * Each value represents a semantic split execution boundary that the
 * workflow owner uses to decide whether to advance the split phase.
 *
 * @enum {string}
 */
const SPLIT_ACK_STATUS = Object.freeze({
  // Source-side execution acknowledgements (PartitionService)
  SNAPSHOT_STARTED: 'snapshot_started',
  BACKFILL_PROGRESS: 'backfill_progress',
  CATCHUP_READY: 'catchup_ready',
  CUTOVER_APPLIED: 'cutover_applied',
  CLEANUP_COMPLETED: 'cleanup_completed',

  // Child provisioning acknowledgements
  CHILD_PROVISIONED: 'child_provisioned',
  CHILD_PROVISION_FAILED: 'child_provision_failed',

  // Owner-recorded dissolution outcomes (mirrors MERGE_ACK_STATUS:
  // the owner, not the source, records these after replica removal).
  SOURCE_DISSOLVED: 'source_dissolved',
  DISSOLUTION_FAILED: 'dissolution_failed',

  // Failure acknowledgements
  SNAPSHOT_FAILED: 'snapshot_failed',
  BACKFILL_FAILED: 'backfill_failed',
  CUTOVER_FAILED: 'cutover_failed',
  CLEANUP_FAILED: 'cleanup_failed',
});

/**
 * Terminal status values for split acknowledgements.
 * An acknowledgement with one of these statuses indicates the participant
 * has reached a final state for its execution boundary.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_TERMINAL_STATUSES = Object.freeze(new Set([
  SPLIT_ACK_STATUS.CUTOVER_APPLIED,
  SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
  SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
  SPLIT_ACK_STATUS.CHILD_PROVISIONED,
  SPLIT_ACK_STATUS.CHILD_PROVISION_FAILED,
  SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
  SPLIT_ACK_STATUS.BACKFILL_FAILED,
  SPLIT_ACK_STATUS.CUTOVER_FAILED,
  SPLIT_ACK_STATUS.CLEANUP_FAILED,
]));

/**
 * Owner decision on whether the split cutover may promote the target
 * epoch: every child partition's canonical leader service must be
 * serve-routable, or the source keeps serving (run 2026-08-30T12:20:17Z:
 * the cutover applied while the right child's leader was readiness-denied
 * and the right key range had no routable write participant).
 * @enum {string}
 */
const SPLIT_CUTOVER_READINESS_DECISION = Object.freeze({
  ROUTABLE: 'routable',
  REFUSED: 'refused',
});

/**
 * Typed refusal reasons for the cutover readiness decision.
 * @enum {string}
 */
const SPLIT_CUTOVER_REFUSAL_REASON = Object.freeze({
  TARGET_PARTITIONS_MISSING: 'target_partitions_missing',
  CHILD_LEADER_UNKNOWN: 'child_leader_unknown',
  CHILD_LEADER_NOT_ROUTABLE: 'child_leader_not_routable',
});

/**
 * Source-participant statuses that satisfy the "mirror removed"
 * dissolution gate (mirrors MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES:
 * DISSOLUTION_FAILED qualifies so a re-delivered CLEANUP_COMPLETED ack
 * re-attempts a failed dissolution).
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES = Object.freeze(new Set([
  SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
  SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
  SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
]));

/**
 * Source-participant statuses that satisfy the cutover gate: the source
 * reported catch-up readiness and has not failed since.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_CATCHUP_SATISFIED_STATUSES = Object.freeze(new Set([
  SPLIT_ACK_STATUS.CATCHUP_READY,
  SPLIT_ACK_STATUS.CUTOVER_APPLIED,
  SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
  SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
]));

/**
 * Failure status values for split acknowledgements.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_FAILURE_STATUSES = Object.freeze(new Set([
  SPLIT_ACK_STATUS.CHILD_PROVISION_FAILED,
  SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
  SPLIT_ACK_STATUS.BACKFILL_FAILED,
  SPLIT_ACK_STATUS.CUTOVER_FAILED,
  SPLIT_ACK_STATUS.CLEANUP_FAILED,
]));

/**
 * Checkpoint field names specific to split acknowledgement payloads.
 * These extend the generic PARTICIPANT_ACK_FIELD.CHECKPOINT object
 * with split-specific progress data.
 *
 * @enum {string}
 */
const SPLIT_ACK_CHECKPOINT_FIELD = Object.freeze({
  SNAPSHOT_REVISION: 'snapshotRevision',
  LAST_APPLIED_DELTA: 'lastAppliedDelta',
  // Durable replay cursor: the Raft log index the snapshot barrier was
  // taken at (every log entry up to and including it is covered by the
  // backfill), and the watermark up to which deltas have been mirrored.
  // Both ride the source ack checkpoint into the persisted transition
  // metadata so a restarted source replays from the Raft log instead of
  // the volatile pendingEntries array.
  SNAPSHOT_BARRIER_INDEX: 'snapshotBarrierIndex',
  REPLAY_WATERMARK_INDEX: 'replayWatermarkIndex',
  BACKFILL_ROWS_COPIED: 'backfillRowsCopied',
  BACKFILL_TOTAL_ROWS: 'backfillTotalRows',
  SOURCE_MIRROR_REMOVED: 'sourceMirrorRemoved',
  DISSOLVED_REPLICA_IDS: 'dissolvedReplicaIds',
});

/**
 * Participant key prefixes for split workflow participants.
 * Used to construct canonical participantKey values that compose with
 * PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY.
 *
 * @enum {string}
 */
const SPLIT_PARTICIPANT_PREFIX = Object.freeze({
  SOURCE_PARTITION: 'source-partition',
  LEFT_CHILD: 'left-child',
  RIGHT_CHILD: 'right-child',
});

/**
 * Log messages for split participant acknowledgement processing.
 *
 * @enum {string}
 */
const SPLIT_ACK_LOG_MSG = Object.freeze({
  ACK_RECEIVED: 'Split participant acknowledgement received',
  ACK_ACCEPTED: 'Split participant acknowledgement accepted',
  ACK_STALE_FENCE: 'Split participant acknowledgement rejected: stale fence',
  ACK_DUPLICATE: 'Split participant acknowledgement rejected: duplicate',
  ACK_NOT_FOUND:
    'Split participant acknowledgement rejected: participant not found',
});

/**
 * Explicit participant transition graph for the split source partition:
 * the set of statuses a source acknowledgement may move to FROM each
 * current status. An ack whose (from, to) edge is absent is rejected
 * with a typed invalid-transition outcome — the owner never silently
 * applies an out-of-graph transition. `null` models the not-yet-acked
 * initial state; failure edges are allowed from every non-terminal
 * state; terminal states admit only self-repeats (handled as duplicates
 * before graph validation).
 *
 * @type {Readonly<Object<string|null, ReadonlySet<string>>>}
 */
const SPLIT_SOURCE_ACK_TRANSITION_GRAPH = Object.freeze({
  [String(null)]: new Set([
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
  ]),
  [SPLIT_ACK_STATUS.SNAPSHOT_STARTED]: new Set([
    SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    SPLIT_ACK_STATUS.CATCHUP_READY,
    SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
    SPLIT_ACK_STATUS.BACKFILL_FAILED,
  ]),
  [SPLIT_ACK_STATUS.BACKFILL_PROGRESS]: new Set([
    SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    SPLIT_ACK_STATUS.CATCHUP_READY,
    SPLIT_ACK_STATUS.BACKFILL_FAILED,
  ]),
  [SPLIT_ACK_STATUS.CATCHUP_READY]: new Set([
    SPLIT_ACK_STATUS.CUTOVER_APPLIED,
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    SPLIT_ACK_STATUS.CUTOVER_FAILED,
    SPLIT_ACK_STATUS.CLEANUP_FAILED,
  ]),
  [SPLIT_ACK_STATUS.CUTOVER_APPLIED]: new Set([
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    SPLIT_ACK_STATUS.CLEANUP_FAILED,
  ]),
  [SPLIT_ACK_STATUS.CLEANUP_COMPLETED]: new Set([
    SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
    SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
  ]),
  [SPLIT_ACK_STATUS.DISSOLUTION_FAILED]: new Set([
    // A failed dissolution is re-attemptable (mirrors the merge graph):
    // the source re-delivers cleanup-completed so the owner retries.
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
  ]),
  [SPLIT_ACK_STATUS.SOURCE_DISSOLVED]: new Set([]),
  [SPLIT_ACK_STATUS.SNAPSHOT_FAILED]: new Set([]),
  [SPLIT_ACK_STATUS.BACKFILL_FAILED]: new Set([]),
  [SPLIT_ACK_STATUS.CUTOVER_FAILED]: new Set([]),
  [SPLIT_ACK_STATUS.CLEANUP_FAILED]: new Set([]),
});

/**
 * Resolve whether one split source-participant transition is allowed by
 * the explicit graph.
 * @param {string|null} fromStatus - Current participant status.
 * @param {string} toStatus - Acknowledged status.
 * @return {boolean}
 */
/**
 * Source states from which NO failure acknowledgement may advance the
 * participant (mirrors the merge graph): dissolved sources and
 * already-recorded failures are terminal for the failure path.
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_TERMINAL_FOR_FAILURE_SET = Object.freeze(new Set([
  SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
  SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
  SPLIT_ACK_STATUS.BACKFILL_FAILED,
  SPLIT_ACK_STATUS.CUTOVER_FAILED,
  SPLIT_ACK_STATUS.CLEANUP_FAILED,
  SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
]));

function isSplitSourceAckTransitionAllowed(fromStatus, toStatus) {
  const fromKey = fromStatus ? String(fromStatus) : String(null);
  const allowed = SPLIT_SOURCE_ACK_TRANSITION_GRAPH[fromKey];
  if (allowed instanceof Set && allowed.has(toStatus)) {
    return true;
  }
  // A failure acknowledgement is admissible from every non-terminal
  // state (mirrors the merge graph): a source can fail at any point
  // before it dissolves, and the owner must record that failure
  // (driving the fail-safe abort) regardless of the progress edge.
  if (SPLIT_ACK_FAILURE_STATUSES.has(toStatus)) {
    return allowed instanceof Set &&
      !SPLIT_ACK_TERMINAL_FOR_FAILURE_SET.has(fromKey);
  }
  return false;
}

export {
  SPLIT_CUTOVER_READINESS_DECISION,
  SPLIT_CUTOVER_REFUSAL_REASON,
  SPLIT_ACK_STATUS,
  SPLIT_ACK_TERMINAL_STATUSES,
  SPLIT_ACK_FAILURE_STATUSES,
  SPLIT_ACK_CATCHUP_SATISFIED_STATUSES,
  SPLIT_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_LOG_MSG,
  isSplitSourceAckTransitionAllowed,
};
