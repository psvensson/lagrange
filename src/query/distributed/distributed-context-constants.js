/**
 * Constants for distributed movement primitives.
 *
 * Defines field names, error messages, and configuration for
 * ctx.lookup, ctx.emit, ctx.broadcast, and ctx.useBroadcast.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {NUM} from '../../constants/index.js';

/**
 * Primitive type identifiers for telemetry and logging.
 * @enum {string}
 */
const PRIMITIVE_TYPE = Object.freeze({
  LOOKUP: 'lookup',
  EMIT: 'emit',
  BROADCAST: 'broadcast',
  USE_BROADCAST: 'useBroadcast',
});

/**
 * Allowed access path types for lookup operations.
 * Only pk, unique, or bounded-index access is permitted.
 * @enum {string}
 */
const LOOKUP_ACCESS_PATH = Object.freeze({
  PRIMARY_KEY: 'primary_key',
  UNIQUE_INDEX: 'unique_index',
  BOUNDED_INDEX: 'bounded_index',
});

/**
 * Field names for lookup key-value objects.
 * @enum {string}
 */
const LOOKUP_KEY_FIELD = Object.freeze({
  COLUMN: 'column',
  VALUE: 'value',
});

/**
 * Field names for lookup result objects.
 * @enum {string}
 */
const LOOKUP_RESULT_FIELD = Object.freeze({
  ROWS: 'rows',
  KEY_COUNT: 'keyCount',
  BYTE_COUNT: 'byteCount',
  DEDUPED_KEY_COUNT: 'dedupedKeyCount',
  PARTITION_COUNT: 'partitionCount',
  ACCESS_PATH: 'accessPath',
});

/**
 * Field names for emit queue state.
 * @enum {string}
 */
const EMIT_FIELD = Object.freeze({
  KEY: 'key',
  VALUE: 'value',
  BYTE_COUNT: 'byteCount',
  QUEUE_SIZE: 'queueSize',
  SPILLED: 'spilled',
  BACKPRESSURE: 'backpressure',
});

/**
 * Field names for broadcast descriptor objects.
 * @enum {string}
 */
const BROADCAST_FIELD = Object.freeze({
  REF: 'ref',
  VERSION: 'version',
  PAYLOAD: 'payload',
  BYTE_COUNT: 'byteCount',
  TIMESTAMP: 'timestamp',
});

/**
 * Emit queue states for backpressure management.
 * @enum {string}
 */
const EMIT_QUEUE_STATE = Object.freeze({
  ACCEPTING: 'accepting',
  BACKPRESSURE: 'backpressure',
  SPILLING: 'spilling',
  CLOSED: 'closed',
});

/**
 * Error messages for distributed movement primitives.
 * @enum {string}
 */
const PRIMITIVE_ERROR_MSG = Object.freeze({
  // lookup errors
  LOOKUP_TABLE_REQUIRED:
    'Table name is required for lookup',
  LOOKUP_TABLE_MUST_BE_STRING:
    'Table name must be a string',
  LOOKUP_KEYS_REQUIRED:
    'Keys array is required for lookup',
  LOOKUP_KEYS_MUST_BE_ARRAY:
    'Keys must be an array',
  LOOKUP_KEYS_EMPTY:
    'Keys array must not be empty',
  LOOKUP_KEY_MISSING_COLUMN:
    'Each lookup key must have a column field',
  LOOKUP_KEY_MISSING_VALUE:
    'Each lookup key must have a value field',
  LOOKUP_MAX_KEYS_EXCEEDED:
    'Lookup batch exceeds maximum key count',
  LOOKUP_MAX_BYTES_EXCEEDED:
    'Lookup result exceeds maximum byte limit',
  LOOKUP_ACCESS_PATH_DENIED:
    'Lookup requires primary key, unique index, or bounded index access',

  // emit errors
  EMIT_KEY_REQUIRED:
    'Key is required for emit',
  EMIT_VALUE_REQUIRED:
    'Value is required for emit',
  EMIT_VALUE_MUST_BE_UINT8ARRAY:
    'Emit value must be a Uint8Array',
  EMIT_MAX_BYTES_EXCEEDED:
    'Emitted intermediate bytes exceed query budget',
  EMIT_QUEUE_CLOSED:
    'Emit queue is closed',
  EMIT_BACKPRESSURE:
    'Emit backpressure applied; retry after drain',

  // broadcast errors
  BROADCAST_REF_REQUIRED:
    'Broadcast reference string is required',
  BROADCAST_REF_MUST_BE_STRING:
    'Broadcast reference must be a string',
  BROADCAST_PAYLOAD_REQUIRED:
    'Broadcast payload is required',
  BROADCAST_VERSION_REQUIRED:
    'Broadcast payload must include a version field',
  BROADCAST_MAX_PAYLOAD_EXCEEDED:
    'Broadcast payload exceeds maximum size limit',
  BROADCAST_REF_NOT_FOUND:
    'Broadcast reference not found',
});

/**
 * Log messages for distributed movement primitives.
 * @enum {string}
 */
const PRIMITIVE_LOG_MSG = Object.freeze({
  LOOKUP_STARTED: 'Lookup operation started',
  LOOKUP_COMPLETED: 'Lookup operation completed',
  LOOKUP_DEDUPED: 'Lookup keys deduplicated',
  EMIT_STARTED: 'Emit operation started',
  EMIT_COMPLETED: 'Emit operation completed',
  EMIT_BACKPRESSURE: 'Emit backpressure applied',
  EMIT_SPILL: 'Emit spilling to disk',
  BROADCAST_PUBLISHED: 'Broadcast dataset published',
  BROADCAST_RETRIEVED: 'Broadcast dataset retrieved',
});

/**
 * Default emit queue high-water mark (number of buffered records).
 * @type {number}
 */
const EMIT_QUEUE_HIGH_WATER_MARK = NUM.BYTES_PER_KIB;

/**
 * Default emit spill threshold in bytes (4 MiB).
 * When buffered bytes exceed this, spill to disk.
 * @type {number}
 */
const EMIT_SPILL_THRESHOLD_BYTES =
  NUM.BYTES_PER_MIB * NUM.FOUR;

export {
  PRIMITIVE_TYPE,
  LOOKUP_ACCESS_PATH,
  LOOKUP_KEY_FIELD,
  LOOKUP_RESULT_FIELD,
  EMIT_FIELD,
  BROADCAST_FIELD,
  EMIT_QUEUE_STATE,
  PRIMITIVE_ERROR_MSG,
  PRIMITIVE_LOG_MSG,
  EMIT_QUEUE_HIGH_WATER_MARK,
  EMIT_SPILL_THRESHOLD_BYTES,
};
