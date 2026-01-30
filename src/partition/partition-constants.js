import {NUM, SERVICE_TYPE} from '../constants/index.js';

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

const PARTITION_RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner', // Non-voting member during catch-up phase
});

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
  OVERLAP: (partitionId, existingId) =>
    `Key range overlap detected: partition ${partitionId} overlaps with ${existingId}`,
  FIRST_PARTITION_STARTS: (partitionId) =>
    `First partition ${partitionId} does not start at NULL`,
  LAST_PARTITION_ENDS: (partitionId) =>
    `Last partition ${partitionId} does not end at NULL`,
  GAP_BETWEEN_PARTITIONS: (currentId, nextId, currentEnd, nextStart) =>
    `Gap between partitions ${currentId} and ${nextId}: [${currentEnd}, ${nextStart})`,
  OVERLAP_BETWEEN_PARTITIONS: (currentId, nextId) =>
    `Overlap between partitions ${currentId} and ${nextId}`,
  PARTITION_NOT_FOUND: (partitionId) => `Partition ${partitionId} not found`,
  SPLIT_KEY_OUT_OF_RANGE: (splitKey) =>
    `Split key ${splitKey} is not in partition range`,
  LEFT_PARTITION_NOT_FOUND: (partitionId) =>
    `Left partition ${partitionId} not found`,
  RIGHT_PARTITION_NOT_FOUND: (partitionId) =>
    `Right partition ${partitionId} not found`,
  PARTITIONS_NOT_ADJACENT: (leftId, rightId) =>
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
  MERGE_STARTED: 'mergeStarted',
  MERGE_COMPLETED: 'mergeCompleted',
  MERGE_FAILED: 'mergeFailed',
  EVALUATION_COMPLETED: 'evaluationCompleted',
});

const SPLIT_MERGE_REASON = Object.freeze({
  BUSY: 'busy',
});

const SPLIT_MERGE_ID = Object.freeze({
  PARTITION_SEPARATOR: '_p_',
  LEFT_SUFFIX: '_left',
  RIGHT_SUFFIX: '_right',
  MERGED_SUFFIX: '_merged',
});

const SPLIT_MERGE_SQL = Object.freeze({
  COUNT_ROWS: (tableName) => `SELECT COUNT(*) as total FROM ${tableName}`,
  SELECT_MEDIAN: (primaryKeyColumn, tableName) =>
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
  SPLIT_COMPLETED: 'Partition split completed',
  SPLIT_FAILED: 'Partition split failed',
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
});

const SPLIT_MERGE_ERROR_MSG = Object.freeze({
  RANGE_INTEGRITY_NOT_CONTIGUOUS: (leftEnd, rightStart) =>
    'Range integrity violation: ranges not contiguous - ' +
    `left end (${leftEnd}) != right start (${rightStart})`,
  KEY_RANGE_MANAGER_REQUIRED: 'KeyRangeManager is required for merge operations',
  RANGE_INTEGRITY_LEFT_START: (leftStart, originalStart) =>
    `Range integrity violation: left start (${leftStart}) != original start (${originalStart})`,
  RANGE_INTEGRITY_RIGHT_END: (rightEnd, originalEnd) =>
    `Range integrity violation: right end (${rightEnd}) != original end (${originalEnd})`,
  RANGE_INTEGRITY_MERGED_START: (mergedStart, leftStart) =>
    `Range integrity violation: merged start (${mergedStart}) != left start (${leftStart})`,
  RANGE_INTEGRITY_MERGED_END: (mergedEnd, rightEnd) =>
    `Range integrity violation: merged end (${mergedEnd}) != right end (${rightEnd})`,
  MANAGER_BUSY: (state) => `Cannot split: manager is in ${state} state`,
  MERGE_MANAGER_BUSY: (state) => `Cannot merge: manager is in ${state} state`,
  PARTITION_RANGE_MISSING: (partitionId) =>
    `Partition ${partitionId} not found in key range manager`,
  LEFT_PARTITION_MISSING: (partitionId) =>
    `Left partition ${partitionId} not found`,
  RIGHT_PARTITION_MISSING: (partitionId) =>
    `Right partition ${partitionId} not found`,
  PARTITIONS_NOT_ADJACENT: (leftId, leftEnd, rightId, rightStart) =>
    `Partitions are not adjacent: ${leftId} end (${leftEnd}) != ${rightId} start (${rightStart})`,
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
});

const PENDING_REQUEST_LOG_MSG = Object.freeze({
  REQUEST_TIMED_OUT: 'Request timed out',
  TRACKING_REQUEST: 'Tracking request',
  REQUEST_RESOLVED: 'Request resolved',
  REQUEST_REJECTED: 'Request rejected',
  NO_PENDING_REQUEST_RESOLVE: 'No pending request found for resolution',
  NO_PENDING_REQUEST_REJECT: 'No pending request found for rejection',
  TRACKER_SHUTDOWN: 'Tracker shutdown',
  CLEARED_PENDING_REQUESTS: 'Cleared pending requests on shutdown',
  CLEANED_STALE_REQUEST: 'Cleaned up stale request',
});

const PENDING_REQUEST_ERROR_MSG = Object.freeze({
  ACK_TIMEOUT: (timeoutMs, requestId) =>
    `ACK timeout after ${timeoutMs}ms for request ${requestId}`,
  STALE_REQUEST: (elapsedMs) =>
    `Stale request cleanup after ${elapsedMs}ms`,
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
};
