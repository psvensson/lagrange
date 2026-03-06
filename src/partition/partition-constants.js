import {NUM, SERVICE_TYPE} from '../constants/index.js';
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
  SPLIT_CUTOVER_ACTIVE: 'split_cutover_active',
});

const PARTITION_TRANSITION_METADATA_FIELD = Object.freeze({
  WORKFLOW_ID: 'workflowId',
  ADMISSION: 'admission',
  FAILURE: 'failure',
  PRIMARY_KEY_COLUMN: 'primaryKeyColumn',
  SOURCE_PARTITION_ID: 'sourcePartitionId',
  SPLIT_KEY: 'splitKey',
  TARGET_PARTITION_IDS: 'targetPartitionIds',
  TARGET_PARTITION_VERSION: 'targetPartitionVersion',
});

const PARTITION_SPLIT_MIRROR_ORIGIN = Object.freeze({
  SOURCE: 'source',
  TARGET: 'target',
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
  RANGE_INTEGRITY_OVERLAP:
    'Range integrity violation: left and right ranges overlap',
  RANGE_VALID_AFTER_SPLIT: 'Range integrity validated after split',
  RANGE_VALID_AFTER_MERGE: 'Range integrity validated after merge',
  STARTING_PERIODIC_EVAL: 'Starting periodic split/merge evaluation',
  PERIODIC_EVAL_FAILED: 'Periodic evaluation failed',
  STOPPED_PERIODIC_EVAL: 'Stopped periodic split/merge evaluation',
  SKIPPING_EVAL_BUSY: 'Skipping evaluation: manager is busy',
  PARTITION_EVAL_COMPLETED: 'Partition evaluation completed',
  THRESHOLDS_UPDATED: 'Thresholds updated',
  MANAGER_SHUTDOWN: 'PartitionSplitMergeManager shutdown',
  SPLIT_CAPACITY_PREFLIGHT: 'Split capacity preflight check',
  SPLIT_DEFERRED_CAPACITY: 'Split deferred due to insufficient capacity',
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
  ZERO: NUM.ZERO,
});

export {
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
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_SPLIT_MIRROR_ORIGIN,
};
