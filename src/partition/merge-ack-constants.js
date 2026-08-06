/**
 * Typed participant acknowledgement constants for merge executors.
 *
 * Merge execution participants (the two source PartitionServices and the
 * merged target partition) produce acknowledgement payloads that flow
 * through the durable workflow coordinator to ManagedMergeWorkflow.
 *
 * Payloads compose with PARTICIPANT_ACK_FIELD from workflow-constants.js
 * for the canonical field names (workflowId, participantKey, fenceToken,
 * status, checkpoint, acknowledgedAt).
 *
 * Mirror of split-ack-constants.js for the merge direction.
 */

/**
 * Participant status values for merge executor acknowledgements.
 *
 * Each value represents a semantic merge execution boundary that the
 * workflow owner uses to decide whether to advance the merge phase.
 *
 * @enum {string}
 */
const MERGE_ACK_STATUS = Object.freeze({
  // Target provisioning acknowledgement (recorded by the workflow owner
  // once the merged target partition raft group is provisioned).
  TARGET_PROVISIONED: 'target_provisioned',
  TARGET_PROVISION_FAILED: 'target_provision_failed',

  // Source-side execution acknowledgements (PartitionService, per source)
  SNAPSHOT_STARTED: 'snapshot_started',
  BACKFILL_PROGRESS: 'backfill_progress',
  CATCHUP_READY: 'catchup_ready',
  CUTOVER_APPLIED: 'cutover_applied',
  SOURCE_MIRROR_REMOVED: 'source_mirror_removed',

  // Dissolution acknowledgement (recorded by the workflow owner per source
  // once the retired raft group teardown has been dispatched and the
  // authoritative descriptor row deleted).
  SOURCE_DISSOLVED: 'source_dissolved',

  // Failure acknowledgements
  SNAPSHOT_FAILED: 'snapshot_failed',
  BACKFILL_FAILED: 'backfill_failed',
  CUTOVER_FAILED: 'cutover_failed',
  DISSOLUTION_FAILED: 'dissolution_failed',
});

/**
 * Failure status values for merge acknowledgements.
 *
 * @type {ReadonlySet<string>}
 */
const MERGE_ACK_FAILURE_STATUSES = Object.freeze(new Set([
  MERGE_ACK_STATUS.TARGET_PROVISION_FAILED,
  MERGE_ACK_STATUS.SNAPSHOT_FAILED,
  MERGE_ACK_STATUS.BACKFILL_FAILED,
  MERGE_ACK_STATUS.CUTOVER_FAILED,
  MERGE_ACK_STATUS.DISSOLUTION_FAILED,
]));

/**
 * Source-side statuses that satisfy the "catch-up ready" cutover
 * precondition. A source that has already progressed beyond catch-up
 * still counts as ready.
 *
 * @type {ReadonlySet<string>}
 */
const MERGE_ACK_CATCHUP_SATISFIED_STATUSES = Object.freeze(new Set([
  MERGE_ACK_STATUS.CATCHUP_READY,
  MERGE_ACK_STATUS.CUTOVER_APPLIED,
  MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  MERGE_ACK_STATUS.SOURCE_DISSOLVED,
]));

/**
 * Source-side statuses that satisfy the "mirror removed" dissolution
 * precondition. DISSOLUTION_FAILED qualifies: it can only be recorded
 * after the mirror was removed, and treating it as satisfied lets a
 * re-delivered SOURCE_MIRROR_REMOVED acknowledgement re-attempt the
 * dissolution instead of locking the terminal forever.
 *
 * @type {ReadonlySet<string>}
 */
const MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES = Object.freeze(new Set([
  MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  MERGE_ACK_STATUS.SOURCE_DISSOLVED,
  MERGE_ACK_STATUS.DISSOLUTION_FAILED,
]));

/**
 * Checkpoint field names specific to merge acknowledgement payloads.
 *
 * @enum {string}
 */
const MERGE_ACK_CHECKPOINT_FIELD = Object.freeze({
  SNAPSHOT_REVISION: 'snapshotRevision',
  // Durable replay cursor (mirrors SPLIT_ACK_CHECKPOINT_FIELD): the
  // Raft log index the snapshot barrier was taken at, and the watermark
  // up to which deltas have been mirrored.
  SNAPSHOT_BARRIER_INDEX: 'snapshotBarrierIndex',
  REPLAY_WATERMARK_INDEX: 'replayWatermarkIndex',
  BACKFILL_ROWS_COPIED: 'backfillRowsCopied',
  SOURCE_MIRROR_REMOVED: 'sourceMirrorRemoved',
  DISSOLVED_REPLICA_IDS: 'dissolvedReplicaIds',
});

/**
 * Participant key prefixes for merge workflow participants.
 * Source participants are keyed per source partition:
 * `source-partition:<partitionId>`.
 *
 * @enum {string}
 */
const MERGE_PARTICIPANT_PREFIX = Object.freeze({
  SOURCE_PARTITION: 'source-partition',
  MERGED_TARGET: 'merged-target',
});

/**
 * Separator between a merge participant prefix and its partition id.
 * @type {string}
 */
const MERGE_PARTICIPANT_KEY_SEPARATOR = ':';

/**
 * Build the canonical participant key for one merge source partition.
 * @param {string} partitionId - Source partition ID.
 * @return {string} Participant key.
 */
function buildMergeSourceParticipantKey(partitionId) {
  return MERGE_PARTICIPANT_PREFIX.SOURCE_PARTITION +
    MERGE_PARTICIPANT_KEY_SEPARATOR +
    String(partitionId || '');
}

/**
 * Explicit participant transition graph for one merge source partition:
 * the set of statuses a source acknowledgement may move to FROM each
 * current status. An ack whose (from, to) edge is absent is rejected
 * with a typed invalid-transition outcome — the owner never silently
 * applies an out-of-graph transition. `null` models the not-yet-acked
 * initial state; failure edges are allowed from every non-terminal
 * state; terminal states admit no further transitions (self-repeats are
 * handled as duplicates before graph validation).
 *
 * @type {Readonly<Object<string|null, ReadonlySet<string>>>}
 */
const MERGE_SOURCE_ACK_TRANSITION_GRAPH = Object.freeze({
  [String(null)]: new Set([
    MERGE_ACK_STATUS.SNAPSHOT_STARTED,
    MERGE_ACK_STATUS.SNAPSHOT_FAILED,
  ]),
  [MERGE_ACK_STATUS.SNAPSHOT_STARTED]: new Set([
    MERGE_ACK_STATUS.BACKFILL_PROGRESS,
    MERGE_ACK_STATUS.CATCHUP_READY,
    MERGE_ACK_STATUS.SNAPSHOT_FAILED,
    MERGE_ACK_STATUS.BACKFILL_FAILED,
  ]),
  [MERGE_ACK_STATUS.BACKFILL_PROGRESS]: new Set([
    MERGE_ACK_STATUS.BACKFILL_PROGRESS,
    MERGE_ACK_STATUS.CATCHUP_READY,
    MERGE_ACK_STATUS.BACKFILL_FAILED,
  ]),
  [MERGE_ACK_STATUS.CATCHUP_READY]: new Set([
    MERGE_ACK_STATUS.CUTOVER_APPLIED,
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    MERGE_ACK_STATUS.CUTOVER_FAILED,
  ]),
  [MERGE_ACK_STATUS.CUTOVER_APPLIED]: new Set([
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  ]),
  [MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED]: new Set([
    MERGE_ACK_STATUS.SOURCE_DISSOLVED,
    MERGE_ACK_STATUS.DISSOLUTION_FAILED,
  ]),
  [MERGE_ACK_STATUS.DISSOLUTION_FAILED]: new Set([
    // A failed dissolution is re-attemptable: the hosting node recovers
    // and the source re-delivers mirror-removed so the owner retries.
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    MERGE_ACK_STATUS.SOURCE_DISSOLVED,
  ]),
  [MERGE_ACK_STATUS.SOURCE_DISSOLVED]: new Set([]),
  [MERGE_ACK_STATUS.SNAPSHOT_FAILED]: new Set([]),
  [MERGE_ACK_STATUS.BACKFILL_FAILED]: new Set([]),
  [MERGE_ACK_STATUS.CUTOVER_FAILED]: new Set([]),
});

/**
 * Resolve whether one merge source-participant transition is allowed by
 * the explicit graph.
 * @param {string|null} fromStatus - Current participant status.
 * @param {string} toStatus - Acknowledged status.
 * @return {boolean}
 */
/**
 * Source states from which NO failure acknowledgement may advance the
 * participant: dissolved sources and already-recorded failures are
 * terminal for the failure path.
 * @type {ReadonlySet<string>}
 */
const MERGE_ACK_TERMINAL_FOR_FAILURE_SET = Object.freeze(new Set([
  MERGE_ACK_STATUS.SOURCE_DISSOLVED,
  MERGE_ACK_STATUS.SNAPSHOT_FAILED,
  MERGE_ACK_STATUS.BACKFILL_FAILED,
  MERGE_ACK_STATUS.CUTOVER_FAILED,
  MERGE_ACK_STATUS.DISSOLUTION_FAILED,
]));

function isMergeSourceAckTransitionAllowed(fromStatus, toStatus) {
  const fromKey = fromStatus ? String(fromStatus) : String(null);
  const allowed = MERGE_SOURCE_ACK_TRANSITION_GRAPH[fromKey];
  if (allowed instanceof Set && allowed.has(toStatus)) {
    return true;
  }
  // A failure acknowledgement is admissible from every non-terminal
  // state: a source can fail at any point before it dissolves, and the
  // owner must be able to record that failure (driving the fail-safe
  // abort) regardless of which progress edge it was on.
  if (MERGE_ACK_FAILURE_STATUSES.has(toStatus)) {
    return allowed instanceof Set &&
      !MERGE_ACK_TERMINAL_FOR_FAILURE_SET.has(fromKey);
  }
  return false;
}

export {
  MERGE_ACK_STATUS,
  MERGE_ACK_FAILURE_STATUSES,
  MERGE_ACK_CATCHUP_SATISFIED_STATUSES,
  MERGE_ACK_MIRROR_REMOVED_SATISFIED_STATUSES,
  MERGE_ACK_CHECKPOINT_FIELD,
  MERGE_PARTICIPANT_PREFIX,
  MERGE_PARTICIPANT_KEY_SEPARATOR,
  buildMergeSourceParticipantKey,
  isMergeSourceAckTransitionAllowed,
};
