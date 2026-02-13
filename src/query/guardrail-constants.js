/**
 * Constants for budget enforcement, lineage tracking,
 * dedupe registry, and cancellation tokens.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 * @module query/guardrail-constants
 */

/**
 * Field names used in guardrail tracking objects.
 * @enum {string}
 */
const GUARDRAIL_FIELD = Object.freeze({
  CPU_TIME_MS: 'cpuTimeMs',
  MEMORY_BYTES: 'memoryBytes',
  WALL_START: 'wallStart',
  LOOKUP_KEYS: 'lookupKeys',
  LOOKUP_BYTES: 'lookupBytes',
  EMIT_BYTES: 'emitBytes',
  BROADCAST_BYTES: 'broadcastBytes',
  OUT_BYTES: 'outBytes',
  LINEAGE_ID: 'lineageId',
  QUERY_ID: 'queryId',
  STAGE_INDEX: 'stageIndex',
  PRIMITIVE_TYPE: 'primitiveType',
  SEQUENCE_NUM: 'sequenceNum',
});

/**
 * Error messages for guardrail violations.
 * @enum {string}
 */
const GUARDRAIL_ERROR_MSG = Object.freeze({
  CPU_TIME_EXCEEDED: 'CPU time budget exceeded',
  MEMORY_EXCEEDED: 'Memory budget exceeded',
  WALL_TIME_EXCEEDED: 'Wall time budget exceeded',
  LOOKUP_KEYS_EXCEEDED: 'Lookup key count budget exceeded',
  LOOKUP_BYTES_EXCEEDED: 'Lookup byte budget exceeded',
  EMIT_BYTES_EXCEEDED: 'Emit byte budget exceeded',
  BROADCAST_BYTES_EXCEEDED:
    'Broadcast byte budget exceeded',
  OUT_BYTES_EXCEEDED:
    'Output byte budget exceeded',
  NESTED_CALLS_EXCEEDED:
    'Nested call count budget exceeded',
  NESTED_KEYS_EXCEEDED:
    'Nested key count budget exceeded',
  NESTED_BYTES_EXCEEDED:
    'Nested byte budget exceeded',
  INFLIGHT_EXCEEDED:
    'Max inflight operations exceeded',
  EMIT_BACKPRESSURE:
    'Emit backpressure limit reached',
  OPERATION_TERMINATED:
    'Operation terminated due to budget violation',
  CANCELLED: 'Operation was cancelled',
  TIMEOUT_EXCEEDED: 'Operation timed out',
  ALREADY_CANCELLED: 'Token is already cancelled',
});

/**
 * Log messages for guardrail operations.
 * @enum {string}
 */
const GUARDRAIL_LOG_MSG = Object.freeze({
  BUDGET_CHECK: 'Budget limit checked',
  BUDGET_EXCEEDED: 'Budget limit exceeded',
  LINEAGE_ATTACHED: 'Lineage ID attached to artifact',
  DEDUPE_HIT: 'Duplicate operation detected by lineage',
  CANCELLATION_TRIGGERED: 'Cancellation triggered',
});

/**
 * Separator for lineage ID components.
 * @type {string}
 */
const LINEAGE_SEPARATOR = ':';

/**
 * Field names for dedupe registry result entries.
 * @enum {string}
 */
const DEDUPE_RESULT_FIELD = Object.freeze({
  LINEAGE_ID: 'lineageId',
  STAGE_ID: 'stageId',
  RESULT: 'result',
  TIMESTAMP: 'timestamp',
});

/**
 * Separator for composite dedupe keys (lineageId + stageId).
 * @type {string}
 */
const DEDUPE_KEY_SEPARATOR = '|';

export {
  GUARDRAIL_FIELD,
  GUARDRAIL_ERROR_MSG,
  GUARDRAIL_LOG_MSG,
  LINEAGE_SEPARATOR,
  DEDUPE_RESULT_FIELD,
  DEDUPE_KEY_SEPARATOR,
};
