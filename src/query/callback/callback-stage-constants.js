/**
 * Constants for the callback stage executor.
 *
 * The stage executor runs callbacks in batch/stage mode:
 * one invocation per partition batch, not per-row RPC.
 *
 * Requirements: 4.1, 5.1
 */

/**
 * Stage execution states.
 * @enum {string}
 */
const STAGE_STATE = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/**
 * Field names for stage result objects.
 * @enum {string}
 */
const STAGE_RESULT_FIELD = Object.freeze({
  PARTITION_ID: 'partitionId',
  ROWS: 'rows',
  ROW_COUNT: 'rowCount',
  STATE: 'state',
  ERROR: 'error',
  DURATION_MS: 'durationMs',
});

/**
 * Field names for partition batch objects.
 * @enum {string}
 */
const PARTITION_BATCH_FIELD = Object.freeze({
  PARTITION_ID: 'partitionId',
  ROWS: 'rows',
  ROW_COUNT: 'rowCount',
});

/**
 * Error messages for stage execution failures.
 * @enum {string}
 */
const STAGE_ERROR_MSG = Object.freeze({
  CALLBACK_REQUIRED:
    'Callback function is required for stage execution',
  BATCHES_REQUIRED:
    'Partition batches array is required for stage execution',
  BATCHES_MUST_BE_ARRAY:
    'Partition batches must be an array',
  BATCH_MISSING_PARTITION_ID:
    'Each partition batch must have a partitionId',
  BATCH_MISSING_ROWS:
    'Each partition batch must have a rows array',
  STAGE_ALREADY_RUNNING:
    'Stage execution is already in progress',
  CALLBACK_EXECUTION_FAILED:
    'Callback execution failed on partition',
  STAGE_CANCELLED:
    'Stage execution was cancelled',
});

/**
 * Log messages for stage execution events.
 * @enum {string}
 */
const STAGE_LOG_MSG = Object.freeze({
  STAGE_STARTED: 'Callback stage execution started',
  STAGE_COMPLETED: 'Callback stage execution completed',
  STAGE_FAILED: 'Callback stage execution failed',
  PARTITION_STARTED: 'Partition batch callback started',
  PARTITION_COMPLETED: 'Partition batch callback completed',
  PARTITION_FAILED: 'Partition batch callback failed',
});

/**
 * Telemetry event types emitted by the callback execution
 * host for per-batch and aggregate metrics.
 * @enum {string}
 */
const CALLBACK_TELEMETRY_EVENT = Object.freeze({
  BATCH_COMPLETE: 'batchComplete',
  BATCH_FAILED: 'batchFailed',
  EXECUTION_COMPLETE: 'executionComplete',
  BUDGET_EXCEEDED: 'budgetExceeded',
  CANCELLED: 'cancelled',
  DEDUPE_SKIP: 'dedupeSkip',
});

/**
 * Field names for callback telemetry snapshots.
 * @enum {string}
 */
const CALLBACK_TELEMETRY_FIELD = Object.freeze({
  EVENT_TYPE: 'eventType',
  PARTITION_ID: 'partitionId',
  BATCH_INDEX: 'batchIndex',
  ROW_COUNT: 'rowCount',
  BYTE_ESTIMATE: 'byteEstimate',
  DURATION_MS: 'durationMs',
  TOTAL_BATCHES: 'totalBatches',
  TOTAL_ROWS: 'totalRows',
  TOTAL_BYTES: 'totalBytes',
  TOTAL_DURATION_MS: 'totalDurationMs',
  STATE: 'state',
  ERROR: 'error',
});

/**
 * Byte multiplier for JSON.stringify length to approximate
 * UTF-16 in-memory byte cost.
 * @type {number}
 */
const BYTE_ESTIMATE_MULTIPLIER = 2;

/**
 * Lineage artifact type for the aggregate stage result.
 * @type {string}
 */
const STAGE_ARTIFACT_TYPE = 'stage';

/**
 * Lineage artifact type for stage batch operations.
 * @type {string}
 */
const STAGE_BATCH_ARTIFACT_TYPE = 'stage_batch';

/**
 * Lineage artifact type for the callback host aggregate result.
 * @type {string}
 */
const CALLBACK_HOST_ARTIFACT_TYPE = 'callback_host';

/**
 * Lineage artifact type for callback batch operations.
 * @type {string}
 */
const CALLBACK_BATCH_ARTIFACT_TYPE = 'callback_batch';

export {
  STAGE_STATE,
  STAGE_RESULT_FIELD,
  PARTITION_BATCH_FIELD,
  STAGE_ERROR_MSG,
  STAGE_LOG_MSG,
  STAGE_ARTIFACT_TYPE,
  STAGE_BATCH_ARTIFACT_TYPE,
  CALLBACK_HOST_ARTIFACT_TYPE,
  CALLBACK_BATCH_ARTIFACT_TYPE,
  CALLBACK_TELEMETRY_EVENT,
  CALLBACK_TELEMETRY_FIELD,
  BYTE_ESTIMATE_MULTIPLIER,
};
