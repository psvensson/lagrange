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
  SPLIT_ACK_STATUS.CHILD_PROVISIONED,
  SPLIT_ACK_STATUS.CHILD_PROVISION_FAILED,
  SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
  SPLIT_ACK_STATUS.BACKFILL_FAILED,
  SPLIT_ACK_STATUS.CUTOVER_FAILED,
  SPLIT_ACK_STATUS.CLEANUP_FAILED,
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
  BACKFILL_ROWS_COPIED: 'backfillRowsCopied',
  BACKFILL_TOTAL_ROWS: 'backfillTotalRows',
  SOURCE_MIRROR_REMOVED: 'sourceMirrorRemoved',
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

export {
  SPLIT_ACK_STATUS,
  SPLIT_ACK_TERMINAL_STATUSES,
  SPLIT_ACK_FAILURE_STATUSES,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_LOG_MSG,
};
