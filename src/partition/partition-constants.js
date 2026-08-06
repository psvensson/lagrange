import {SERVICE_TYPE} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

const PARTITION_SUBSYSTEM = Object.freeze({
  PARTITION: 'partition',
  KEY_RANGE_MANAGER: 'key-range-manager',
  PENDING_REQUEST_TRACKER: 'pending-request-tracker',
  SPLIT_MERGE: 'partition-split-merge',
});

const PARTITION_ENTITY_TYPE = SERVICE_TYPE.PARTITION;

const PARTITION_STATE = Object.freeze({
  NORMAL: 'NORMAL',
  SPLITTING: 'SPLITTING',
  MERGING: 'MERGING',
});

const PARTITION_TRANSITION_STATE = Object.freeze({
  ADMISSION_PENDING: 'admission_pending',
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
  FAILED: 'failed',
  SPLIT_PREPARING: 'split_preparing',
  SPLIT_BACKFILLING: 'split_backfilling',
  SPLIT_CATCHUP: 'split_catchup',
  SPLIT_CUTOVER_ACTIVE: 'split_cutover_active',
  SPLIT_SOURCE_DISSOLVING: 'split_source_dissolving',
  MERGE_PREPARING: 'merge_preparing',
  MERGE_BACKFILLING: 'merge_backfilling',
  MERGE_CATCHUP: 'merge_catchup',
  MERGE_CUTOVER_ACTIVE: 'merge_cutover_active',
});
const PARTITION_TRANSITION_STATE_UNKNOWN = 'unknown';

const PARTITION_TRANSITION_PHASE = Object.freeze({
  NONE: 'none',
  ADMISSION: 'admission',
  SPLIT_PREPARING: 'split_preparing',
  SPLIT_BACKFILLING: 'split_backfilling',
  SPLIT_CATCHUP: 'split_catchup',
  SPLIT_CUTOVER: 'split_cutover',
  SPLIT_SOURCE_DISSOLVING: 'split_source_dissolving',
  MERGE_PREPARING: 'merge_preparing',
  MERGE_BACKFILLING: 'merge_backfilling',
  MERGE_CATCHUP: 'merge_catchup',
  MERGE_CUTOVER: 'merge_cutover',
});

const PARTITION_TRANSITION_OUTCOME = Object.freeze({
  UNKNOWN: 'unknown',
  PENDING: 'pending',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
  FAILED: 'failed',
});

const PARTITION_TRANSITION_PHASE_BY_STATE = Object.freeze(
  new Map([
    [
      PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
      PARTITION_TRANSITION_PHASE.ADMISSION,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
      PARTITION_TRANSITION_PHASE.SPLIT_PREPARING,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      PARTITION_TRANSITION_PHASE.SPLIT_BACKFILLING,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
      PARTITION_TRANSITION_PHASE.SPLIT_CATCHUP,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      PARTITION_TRANSITION_PHASE.SPLIT_CUTOVER,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
      PARTITION_TRANSITION_PHASE.SPLIT_SOURCE_DISSOLVING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_PREPARING,
      PARTITION_TRANSITION_PHASE.MERGE_PREPARING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
      PARTITION_TRANSITION_PHASE.MERGE_BACKFILLING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
      PARTITION_TRANSITION_PHASE.MERGE_CATCHUP,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
      PARTITION_TRANSITION_PHASE.MERGE_CUTOVER,
    ],
  ]),
);

const PARTITION_TRANSITION_OUTCOME_BY_STATE = Object.freeze(
  new Map([
    [
      PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
      PARTITION_TRANSITION_OUTCOME.PENDING,
    ],
    [
      PARTITION_TRANSITION_STATE.BLOCKED,
      PARTITION_TRANSITION_OUTCOME.BLOCKED,
    ],
    [
      PARTITION_TRANSITION_STATE.DEFERRED,
      PARTITION_TRANSITION_OUTCOME.DEFERRED,
    ],
    [
      PARTITION_TRANSITION_STATE.FAILED,
      PARTITION_TRANSITION_OUTCOME.FAILED,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_PREPARING,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
    [
      PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
      PARTITION_TRANSITION_OUTCOME.RUNNING,
    ],
  ]),
);

/**
 * Set of split lifecycle phases that only ManagedSplitWorkflow may
 * persist as durable partition_transition_state values.
 *
 * PartitionService and other execution participants MUST NOT write
 * these states to the tables system table directly. They report typed
 * acknowledgements and let the workflow owner advance the phase.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_OWNER_MANAGED_PHASES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  PARTITION_TRANSITION_STATE.BLOCKED,
  PARTITION_TRANSITION_STATE.DEFERRED,
  PARTITION_TRANSITION_STATE.FAILED,
  PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING,
]));

/**
 * Set of merge lifecycle phases that only ManagedMergeWorkflow may
 * persist as durable partition_transition_state values.
 *
 * PartitionService and other execution participants MUST NOT write
 * these states to the tables system table directly. They report typed
 * acknowledgements and let the workflow owner advance the phase.
 *
 * @type {ReadonlySet<string>}
 */
const MERGE_OWNER_MANAGED_PHASES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  PARTITION_TRANSITION_STATE.BLOCKED,
  PARTITION_TRANSITION_STATE.DEFERRED,
  PARTITION_TRANSITION_STATE.FAILED,
  PARTITION_TRANSITION_STATE.MERGE_PREPARING,
  PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]));

/**
 * Workflow states from which the durable cutover may still be applied —
 * and, conversely, in which a source failure ack aborts the merge
 * fail-safe (post-cutover failures cannot un-promote the epoch).
 * @type {ReadonlySet<string>}
 */
const PRE_CUTOVER_MERGE_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  PARTITION_TRANSITION_STATE.MERGE_PREPARING,
  PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
]));

/**
 * Outcome variants of one lane-serialized merge abort step.
 * @enum {string}
 */
const MERGE_ABORT_OUTCOME = Object.freeze({
  ABORTED: 'aborted',
  ALREADY_ABORTED: 'already_aborted',
  REFUSED_POST_CUTOVER: 'refused_post_cutover',
  // The outcome slot before the lane step or fallback has produced a
  // decision: raw null must never encode this runtime state.
  UNRESOLVED: 'unresolved',
});

const RETRYABLE_PARTITION_TRANSITION_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.BLOCKED,
  PARTITION_TRANSITION_STATE.DEFERRED,
]));

function normalizePartitionTransitionState(state) {
  const normalizedState = String(state || '').trim().toLowerCase();
  return Object.values(PARTITION_TRANSITION_STATE).includes(normalizedState) ?
    normalizedState :
    PARTITION_TRANSITION_STATE_UNKNOWN;
}

function buildPartitionTransitionProjection(state) {
  const normalizedState = normalizePartitionTransitionState(state);
  const outcome =
    PARTITION_TRANSITION_OUTCOME_BY_STATE.get(normalizedState) ||
    PARTITION_TRANSITION_OUTCOME.UNKNOWN;
  const phase =
    PARTITION_TRANSITION_PHASE_BY_STATE.get(normalizedState) ||
    PARTITION_TRANSITION_PHASE.NONE;
  return Object.freeze({
    state: normalizedState,
    phase,
    outcome,
    retryable:
      outcome === PARTITION_TRANSITION_OUTCOME.BLOCKED ||
      outcome === PARTITION_TRANSITION_OUTCOME.DEFERRED,
  });
}

function isRetryablePartitionTransitionState(state) {
  return buildPartitionTransitionProjection(state).retryable === true;
}

function isDeferredPartitionTransitionOutcome(state) {
  const outcome = buildPartitionTransitionProjection(state).outcome;
  return outcome === PARTITION_TRANSITION_OUTCOME.BLOCKED ||
    outcome === PARTITION_TRANSITION_OUTCOME.DEFERRED;
}

const PARTITION_TRANSITION_METADATA_FIELD = Object.freeze({
  WORKFLOW_ID: 'workflowId',
  ADMISSION: 'admission',
  FAILURE: 'failure',
  PRIMARY_KEY_COLUMN: 'primaryKeyColumn',
  RETRY: 'retry',
  SOURCE_PARTITION_ID: 'sourcePartitionId',
  SOURCE_PARTITION_IDS: 'sourcePartitionIds',
  SIBLING_PARTITION_IDS: 'siblingPartitionIds',
  TOPOLOGY_SNAPSHOT: 'topologySnapshot',
  SPLIT_KEY: 'splitKey',
  TARGET_PARTITION_IDS: 'targetPartitionIds',
  TARGET_PARTITION_VERSION: 'targetPartitionVersion',
  CUTOVER_APPLIED_AT: 'cutoverAppliedAt',
  PARTICIPANTS: 'participants',
  SOURCE_CHECKPOINT: 'sourceCheckpoint',
  // Durable ownership claim triple (embedded in the transition metadata
  // so the tables row carries the fencing state without a schema
  // change): the workflow fence token (monotonic epoch), the claiming
  // owner identity, and its lease expiry.
  WORKFLOW_FENCE_TOKEN: 'workflowFenceToken',
  WORKFLOW_OWNER_ID: 'workflowOwnerId',
  WORKFLOW_LEASE_EXPIRES_AT: 'workflowLeaseExpiresAt',
});

const PARTITION_SPLIT_MIRROR_ORIGIN = Object.freeze({
  SNAPSHOT: 'snapshot',
  SOURCE: 'source',
  TARGET: 'target',
});

const PARTITION_DESCRIPTOR_EPOCH_DECISION = Object.freeze({
  ACCEPT: 'accept',
  REJECT: 'reject',
});

const PARTITION_DESCRIPTOR_EPOCH_STATE = Object.freeze({
  ACTIVE_MATCH: 'active_match',
  PENDING_MATCH: 'pending_match',
  SPLIT_TARGET_MATCH: 'split_target_match',
  STALE_ROUTE: 'stale_route',
  MISSING_EVIDENCE: 'missing_evidence',
});

const PARTITION_DESCRIPTOR_EPOCH_REASON = Object.freeze({
  ACTIVE_DESCRIPTOR_EPOCH_MATCH: 'active_descriptor_epoch_match',
  PENDING_DESCRIPTOR_EPOCH_MATCH: 'pending_descriptor_epoch_match',
  SPLIT_TARGET_VERSION_MATCH: 'split_target_version_match',
  TABLE_ACTIVE_VERSION_MISSING: 'table_active_version_missing',
  ROUTE_TARGET_VERSION_MISSING: 'route_target_version_missing',
  PARTITION_DESCRIPTOR_VERSION_MISSING:
    'partition_descriptor_version_missing',
  TARGET_DESCRIPTOR_VERSION_MISSING: 'target_descriptor_version_missing',
  PARTITION_DESCRIPTOR_STALE: 'partition_descriptor_stale',
  ROUTE_TARGET_VERSION_STALE: 'route_target_version_stale',
  TARGET_DESCRIPTOR_VERSION_STALE: 'target_descriptor_version_stale',
});

const PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG = Object.freeze({
  STALE_ROUTE: 'Partition descriptor epoch rejected stale route',
});

const PARTITION_RAFT_ROLE = RAFT_ROLE;

const PARTITION_REQUEST_TYPE = Object.freeze({
  QUERY: 'QUERY',
  FORWARD_WRITE: 'FORWARD_WRITE',
});

const KEY_RANGE_LOG_MSG = Object.freeze({
  ADDED_PARTITION_RANGE: 'Added partition range',
  REMOVED_PARTITION_RANGE: 'Removed partition range',
  SPLIT_PARTITION: 'Split partition',
  MERGED_PARTITIONS: 'Merged partitions',
});

const KEY_RANGE_ERROR_MSG = Object.freeze({
  overlap: (partitionId, existingId) =>
    `Key range overlap detected: partition ${partitionId} overlaps with ${existingId}`,
  firstPartitionStarts: (partitionId) =>
    `First partition ${partitionId} does not start at NULL`,
  lastPartitionEnds: (partitionId) =>
    `Last partition ${partitionId} does not end at NULL`,
  gapBetweenPartitions: (currentId, nextId, currentEnd, nextStart) =>
    `Gap between partitions ${currentId} and ${nextId}: [${currentEnd}, ${nextStart})`,
  overlapBetweenPartitions: (currentId, nextId) =>
    `Overlap between partitions ${currentId} and ${nextId}`,
  partitionNotFound: (partitionId) => `Partition ${partitionId} not found`,
  splitKeyOutOfRange: (splitKey) =>
    `Split key ${splitKey} is not in partition range`,
  leftPartitionNotFound: (partitionId) =>
    `Left partition ${partitionId} not found`,
  rightPartitionNotFound: (partitionId) =>
    `Right partition ${partitionId} not found`,
  partitionsNotAdjacent: (leftId, rightId) =>
    `Partitions ${leftId} and ${rightId} are not adjacent`,
});

const SPLIT_MERGE_STATE = Object.freeze({
  IDLE: 'IDLE',
  EVALUATING: 'EVALUATING',
  SPLITTING: 'SPLITTING',
  MERGING: 'MERGING',
});

const SPLIT_MERGE_EVENT = Object.freeze({
  SPLIT_STARTED: 'splitStarted',
  SPLIT_COMPLETED: 'splitCompleted',
  SPLIT_FAILED: 'splitFailed',
  SPLIT_DEFERRED: 'splitDeferred',
  MERGE_STARTED: 'mergeStarted',
  MERGE_COMPLETED: 'mergeCompleted',
  MERGE_FAILED: 'mergeFailed',
  EVALUATION_COMPLETED: 'evaluationCompleted',
});

const SPLIT_MERGE_REASON = Object.freeze({
  BUSY: 'busy',
  CONTROL_PLANE_BACKPRESSURE: 'control_plane_backpressure',
  MANAGED_SPLIT_RETRY_DUE: 'managed_split_retry_due',
  INSUFFICIENT_CAPACITY: 'insufficient_capacity',
  CAPACITY_AVAILABLE: 'capacity_available',
});

const SPLIT_MERGE_ID = Object.freeze({
  PARTITION_SEPARATOR: '_p_',
  LEFT_SUFFIX: '_left',
  RIGHT_SUFFIX: '_right',
  MERGED_SUFFIX: '_merged',
});

const SPLIT_MERGE_SQL = Object.freeze({
  countRows: (tableName) => `SELECT COUNT(*) as total FROM ${tableName}`,
  selectMedian: (primaryKeyColumn, tableName) =>
    `SELECT ${primaryKeyColumn} FROM ${tableName} ` +
    `ORDER BY ${primaryKeyColumn} LIMIT 1 OFFSET ?`,
});

const SPLIT_MERGE_LOG_MSG = Object.freeze({
  MISSING_MEDIAN_PARAMS: 'Missing required parameters for median calculation',
  CALCULATING_MEDIAN_KEY: 'Calculating median key',
  INSUFFICIENT_ROWS_FOR_SPLIT: 'Partition has insufficient rows for split',
  FAILED_MEDIAN_CALC: 'Failed to calculate median key',
  CALCULATED_MEDIAN_KEY: 'Calculated median key',
  EVALUATED_SPLIT_CRITERIA: 'Evaluated split criteria',
  EVALUATED_MERGE_CRITERIA: 'Evaluated merge criteria',
  STARTING_SPLIT: 'Starting partition split',
  SPLIT_PLAN_COMPLETED: 'Partition split plan completed',
  SPLIT_PLAN_FAILED: 'Partition split plan failed',
  SPLIT_EXECUTION_DEFERRED: 'Managed split execution deferred',
  SPLIT_EXECUTION_FAILED: 'Managed split execution failed',
  STARTING_MERGE: 'Starting partition merge',
  MERGE_COMPLETED: 'Partition merge completed',
  MERGE_FAILED: 'Partition merge failed',
  MERGE_EXECUTION_DEFERRED: 'Managed merge execution deferred',
  MERGE_EXECUTION_FAILED: 'Managed merge execution failed',
  RANGE_INTEGRITY_OVERLAP:
    'Range integrity violation: left and right ranges overlap',
  RANGE_VALID_AFTER_SPLIT: 'Range integrity validated after split',
  RANGE_VALID_AFTER_MERGE: 'Range integrity validated after merge',
  STARTING_PERIODIC_EVAL: 'Starting periodic split/merge evaluation',
  PERIODIC_EVAL_FAILED: 'Periodic evaluation failed',
  REQUESTED_EVAL_FAILED: 'Requested split/merge evaluation failed',
  STOPPED_PERIODIC_EVAL: 'Stopped periodic split/merge evaluation',
  SKIPPING_EVAL_BUSY: 'Skipping evaluation: manager is busy',
  PARTITION_EVAL_COMPLETED: 'Partition evaluation completed',
  THRESHOLDS_UPDATED: 'Thresholds updated',
  MANAGER_SHUTDOWN: 'PartitionSplitMergeManager shutdown',
  SPLIT_CAPACITY_PREFLIGHT: 'Split capacity preflight check',
  SPLIT_DEFERRED_CAPACITY: 'Split deferred due to insufficient capacity',
  SPLIT_DEFERRED_BACKPRESSURE:
    'Split deferred due to control-plane backpressure',
  SPLIT_CAPACITY_ALLOWED: 'Split capacity preflight passed',
  MERGE_ELIGIBLE_UNDER_PRESSURE:
    'Merge remains eligible under capacity pressure',
});

const SPLIT_MERGE_ERROR_MSG = Object.freeze({
  rangeIntegrityNotContiguous: (leftEnd, rightStart) =>
    'Range integrity violation: ranges not contiguous - ' +
    `left end (${leftEnd}) != right start (${rightStart})`,
  KEY_RANGE_MANAGER_REQUIRED: 'KeyRangeManager is required for merge operations',
  rangeIntegrityLeftStart: (leftStart, originalStart) =>
    `Range integrity violation: left start (${leftStart}) != original start (${originalStart})`,
  rangeIntegrityRightEnd: (rightEnd, originalEnd) =>
    `Range integrity violation: right end (${rightEnd}) != original end (${originalEnd})`,
  rangeIntegrityMergedStart: (mergedStart, leftStart) =>
    `Range integrity violation: merged start (${mergedStart}) != left start (${leftStart})`,
  rangeIntegrityMergedEnd: (mergedEnd, rightEnd) =>
    `Range integrity violation: merged end (${mergedEnd}) != right end (${rightEnd})`,
  managerBusy: (state) => `Cannot split: manager is in ${state} state`,
  mergeManagerBusy: (state) => `Cannot merge: manager is in ${state} state`,
  MANAGED_SPLIT_EXECUTION_FAILED: 'Managed split execution failed',
  MANAGED_MERGE_EXECUTION_FAILED: 'Managed merge execution failed',
  partitionRangeMissing: (partitionId) =>
    `Partition ${partitionId} not found in key range manager`,
  leftPartitionMissing: (partitionId) =>
    `Left partition ${partitionId} not found`,
  rightPartitionMissing: (partitionId) =>
    `Right partition ${partitionId} not found`,
  partitionsNotAdjacent: (leftId, leftEnd, rightId, rightStart) =>
    `Partitions are not adjacent: ${leftId} end (${leftEnd}) != ` +
    `${rightId} start (${rightStart})`,
  SPLIT_PREFLIGHT_OWNER_REQUIRED:
    'Split capacity preflight requires storageAdmissionService and storageAccountingService',
});

const MANAGED_MERGE_ERROR_MSG = Object.freeze({
  SOURCE_PARTITIONS_REQUIRED:
    'Managed merge requires two distinct source partition ids',
  PARTITION_NOT_FOUND: 'Managed merge source partition not found',
  TABLE_NOT_FOUND: 'Managed merge table not found',
  TABLE_MISMATCH:
    'Managed merge source partitions belong to different tables',
  NOT_ADJACENT: 'Managed merge source partitions are not adjacent',
  LEADER_REQUIRED:
    'Managed merge requires local leadership of the left source partition',
  ALREADY_IN_PROGRESS:
    'Managed merge refused: partition transition already in progress',
  CRITICAL_PARTITION:
    'Managed merge refused for critical system partition',
  OVER_THRESHOLD:
    'Managed merge refused: combined source size exceeds merge threshold',
  PRIMARY_KEY_REQUIRED:
    'Managed merge requires a single-column partition key',
  START_FAILED: 'Managed merge execution failed to start',
  INVALID_PHASE_TRANSITION: 'Invalid managed merge phase transition',
  WORKFLOW_NOT_FOUND: 'Managed merge workflow not found',
  DESCRIPTOR_EPOCH_REJECTED:
    'Managed merge partition descriptor epoch rejected stale evidence',
  ADMISSION_OWNER_REQUIRED:
    'Managed merge admission requires storageAdmissionService',
  TARGET_PROVISIONING_NOT_VIABLE:
    'Managed merge target provisioning precheck could not satisfy the ' +
    'minimum routable cohort',
  TRANSITION_PERSIST_UNAVAILABLE:
    'Merge transition persistence unavailable: durable control-plane ' +
    'write path not ready',
  EPOCH_PERSIST_EFFECT_FAILED:
    'Merge epoch-changing tables update did not take effect: durable ' +
    'control-plane write path not ready',
  OWNED_TRANSITION_PERSIST_REJECTED:
    'Owned merge transition CAS rejected and the durable row was not ' +
    're-syncable for this owner',
});

const MANAGED_MERGE_LOG_MSG = Object.freeze({
  MERGE_START: 'Managed merge started',
  MERGE_PREPARED: 'Managed merge prepared and backfilling',
  CUTOVER_APPLIED: 'Managed merge cutover applied',
  CUTOVER_AWAITING_SOURCES:
    'Managed merge cutover awaiting remaining source catch-up',
  CUTOVER_REFUSED_NOT_PRE_CUTOVER:
    'Managed merge cutover refused: workflow is not in a pre-cutover phase',
  PHASE_ADVANCE_REFUSED:
    'Managed merge phase advance refused: the workflow left the expected ' +
    'predecessor state while the step was queued',
  ABORT_DISPATCH_FAILED:
    'Managed merge abort step failed to apply',
  SIBLINGS_RESTORED_AFTER_ABORT:
    'Managed merge abort restored carried-forward sibling descriptors to ' +
    'the active epoch',
  SIBLING_CARRIED_FORWARD:
    'Managed merge carried sibling partition forward to the target epoch',
  DISSOLUTION_DISPATCHED:
    'Managed merge source dissolution dispatched',
  DISSOLUTION_FAILED: 'Managed merge source dissolution failed',
  EXECUTION_FAILURE_PERSISTED:
    'Managed merge execution failure persisted',
  PERSIST_FAILURE_FAILED:
    'Failed to persist managed merge workflow failure',
  MERGE_ABORTED_ON_SOURCE_FAILURE:
    'Managed merge aborted fail-safe on source failure acknowledgement; ' +
    'sources remain authoritative',
  POST_CUTOVER_SOURCE_FAILURE_RECORDED:
    'Managed merge source failure acknowledged after cutover; epoch not ' +
    'reverted',
  TARGET_TEARDOWN_FAILED:
    'Managed merge aborted-target teardown failed',
  TERMINAL_TRANSITION_CLEARED:
    'Managed merge terminal transition cleared after dissolution',
  OWNERSHIP_CLAIMED: 'Managed merge workflow ownership claimed',
  OWNERSHIP_CLAIM_REFUSED:
    'Managed merge workflow ownership claim refused',
  OWNERSHIP_LOST: 'Managed merge workflow ownership lost',
  ACK_REJECTED: 'Managed merge source acknowledgement rejected',
});

/**
 * Admission operation label for managed merges. The capacity math reuses
 * storageAdmissionService.checkSplit (target node cohort + estimatedBytes
 * are operation-agnostic), but durable admission metadata must not
 * mislabel a merge as a split.
 * @type {string}
 */
const MANAGED_MERGE_ADMISSION_OPERATION_TYPE = 'partition_merge';

const MANAGED_SPLIT_LOG_MSG = Object.freeze({
  CUTOVER_APPLIED: 'Managed split cutover applied',
  PHASE_ADVANCE_REFUSED:
    'Managed split phase advance refused: the workflow left the expected ' +
    'predecessor state while the step was queued',
  ABORT_DISPATCH_FAILED: 'Managed split abort step failed to apply',
  SIBLING_CARRIED_FORWARD:
    'Managed split carried sibling partition forward to the target epoch',
  SIBLINGS_RESTORED_AFTER_ABORT:
    'Managed split abort restored carried-forward sibling descriptors to ' +
    'the active epoch',
  DISSOLUTION_DISPATCHED: 'Managed split source dissolution dispatched',
  DISSOLUTION_FAILED: 'Managed split source dissolution failed',
  CHILD_TEARDOWN_FAILED: 'Managed split aborted-child teardown failed',
  SPLIT_ABORTED_ON_SOURCE_FAILURE:
    'Managed split aborted fail-safe on source failure acknowledgement; ' +
    'the source remains authoritative',
  POST_CUTOVER_SOURCE_FAILURE_RECORDED:
    'Managed split source failure acknowledged after cutover; epoch not ' +
    'reverted',
  TERMINAL_TRANSITION_CLEARED:
    'Managed split terminal transition cleared after dissolution',
  OWNERSHIP_CLAIMED: 'Managed split workflow ownership claimed',
  OWNERSHIP_CLAIM_REFUSED:
    'Managed split workflow ownership claim refused',
  OWNERSHIP_LOST: 'Managed split workflow ownership lost',
  ACK_REJECTED: 'Managed split source acknowledgement rejected',
});

const SPLIT_MERGE_DEFAULT = Object.freeze({
  SPLIT_STORAGE_THRESHOLD_BYTES: 10 * 1024 * 1024 * 1024,
  SPLIT_TRAFFIC_THRESHOLD_QPM: 1000,
  MERGE_STORAGE_THRESHOLD_BYTES: 2 * 1024 * 1024 * 1024,
  MERGE_TRAFFIC_THRESHOLD_QPM: 200,
  EVALUATION_INTERVAL_MS: 5 * 60 * 1000,
});

const PENDING_REQUEST_DEFAULT = Object.freeze({
  REQUEST_TIMEOUT_MS: 30000,
  CLEANUP_INTERVAL_MS: 60000,
  STALE_REQUEST_BUFFER_MS: 5000,
  MAX_PENDING_REQUESTS: 1024,
});

const PENDING_REQUEST_LOG_MSG = Object.freeze({
  REQUEST_TIMED_OUT: 'Request timed out',
  TRACKING_REQUEST: 'Tracking request',
  REQUEST_RESOLVED: 'Request resolved',
  REQUEST_REJECTED: 'Request rejected',
  BACKPRESSURE_APPLIED: 'Pending request tracker at capacity',
  NO_PENDING_REQUEST_RESOLVE: 'No pending request found for resolution',
  NO_PENDING_REQUEST_REJECT: 'No pending request found for rejection',
  TRACKER_SHUTDOWN: 'Tracker shutdown',
  CLEARED_PENDING_REQUESTS: 'Cleared pending requests on shutdown',
  CLEANED_STALE_REQUEST: 'Cleaned up stale request',
});

const PENDING_REQUEST_ERROR_MSG = Object.freeze({
  ackTimeout: (timeoutMs, requestId) =>
    `ACK timeout after ${timeoutMs}ms for request ${requestId}`,
  staleRequest: (elapsedMs) =>
    `Stale request cleanup after ${elapsedMs}ms`,
  backpressure: (maxPendingRequests) =>
    `Pending request tracker at capacity (${maxPendingRequests})`,
});

const PENDING_REQUEST_VALUE = Object.freeze({
  ZERO: 0,
});

export {
  MANAGED_MERGE_ADMISSION_OPERATION_TYPE,
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_ENTITY_TYPE,
  PARTITION_RAFT_ROLE,
  PARTITION_REQUEST_TYPE,
  PARTITION_STATE,
  PARTITION_SUBSYSTEM,
  KEY_RANGE_ERROR_MSG,
  KEY_RANGE_LOG_MSG,
  PENDING_REQUEST_DEFAULT,
  PENDING_REQUEST_ERROR_MSG,
  PENDING_REQUEST_LOG_MSG,
  PENDING_REQUEST_VALUE,
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_ERROR_MSG,
  SPLIT_MERGE_EVENT,
  SPLIT_MERGE_ID,
  SPLIT_MERGE_LOG_MSG,
  SPLIT_MERGE_REASON,
  SPLIT_MERGE_SQL,
  SPLIT_MERGE_STATE,
  PARTITION_TRANSITION_OUTCOME,
  PARTITION_TRANSITION_PHASE,
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_STATE_UNKNOWN,
  RETRYABLE_PARTITION_TRANSITION_STATES,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_DESCRIPTOR_EPOCH_DECISION,
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_DESCRIPTOR_EPOCH_REASON,
  PARTITION_DESCRIPTOR_EPOCH_STATE,
  SPLIT_OWNER_MANAGED_PHASES,
  MERGE_OWNER_MANAGED_PHASES,
  PRE_CUTOVER_MERGE_STATES,
  MERGE_ABORT_OUTCOME,
  buildPartitionTransitionProjection,
  isDeferredPartitionTransitionOutcome,
  isRetryablePartitionTransitionState,
};
