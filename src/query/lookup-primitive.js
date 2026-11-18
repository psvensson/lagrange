/**
 * Lookup primitive — ctx.lookup(table, keys[]).
 *
 * Vectorized/batched key fetch with deduplication and access
 * path enforcement. Only primary key, unique index, or bounded
 * index lookups are allowed.
 *
 * Requirements: 5.1, 5.2
 */

import {
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
} from '../wasm-service/query-budget-constants.js';
import {
  LOOKUP_ACCESS_PATH,
  LOOKUP_KEY_FIELD,
  LOOKUP_RESULT_FIELD as LRF,
  PRIMITIVE_ERROR_MSG,
  PRIMITIVE_TYPE,
} from './distributed/distributed-context-constants.js';

/**
 * Set of allowed access path values for fast membership check.
 * @type {Set<string>}
 */
const KEY_SERIALIZATION_DELIMITER = '\0';

const ALLOWED_ACCESS_PATHS = new Set([
  LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
  LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
]);

/**
 * Validate lookup arguments before execution.
 *
 * @param {string} table - Table name.
 * @param {Array<Object>} keys - Key-value objects.
 * @param {Object} budgets - Budget limits.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateLookupArgs(table, keys, budgets) {
  if (!table) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_REQUIRED};
  }
  if (typeof table !== 'string') {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_MUST_BE_STRING,
    };
  }
  if (!keys) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_REQUIRED};
  }
  if (!Array.isArray(keys)) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_MUST_BE_ARRAY};
  }
  if (keys.length === 0) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_EMPTY};
  }

  for (const key of keys) {
    if (key[LOOKUP_KEY_FIELD.COLUMN] === undefined ||
        key[LOOKUP_KEY_FIELD.COLUMN] === null) {
      return {
        valid: false,
        error: PRIMITIVE_ERROR_MSG.LOOKUP_KEY_MISSING_COLUMN,
      };
    }
    if (key[LOOKUP_KEY_FIELD.VALUE] === undefined ||
        key[LOOKUP_KEY_FIELD.VALUE] === null) {
      return {
        valid: false,
        error: PRIMITIVE_ERROR_MSG.LOOKUP_KEY_MISSING_VALUE,
      };
    }
  }

  const maxKeys = budgets?.LOOKUP_MAX_KEYS ?? LOOKUP_MAX_KEYS;
  if (keys.length > maxKeys) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.LOOKUP_MAX_KEYS_EXCEEDED,
    };
  }

  return {valid: true, error: null};
}

/**
 * Validate that the access path is allowed for lookup.
 *
 * @param {string} accessPath - Access path type.
 * @return {boolean} True if allowed.
 */
function isAllowedAccessPath(accessPath) {
  return ALLOWED_ACCESS_PATHS.has(accessPath);
}

/**
 * Deduplicate keys by serializing column+value pairs.
 * Returns unique keys preserving first-seen order.
 *
 * @param {Array<Object>} keys - Key-value objects.
 * @return {{uniqueKeys: Array<Object>, originalCount: number,
 *   dedupedCount: number}} Deduplication result.
 */
function deduplicateKeys(keys) {
  const seen = new Set();
  const uniqueKeys = [];

  for (const key of keys) {
    const serialized = key[LOOKUP_KEY_FIELD.COLUMN] +
      KEY_SERIALIZATION_DELIMITER +
      String(key[LOOKUP_KEY_FIELD.VALUE]);
    if (!seen.has(serialized)) {
      seen.add(serialized);
      uniqueKeys.push(key);
    }
  }

  return {
    uniqueKeys,
    originalCount: keys.length,
    dedupedCount: uniqueKeys.length,
  };
}

/**
 * Group keys by destination partition for vectorized dispatch.
 *
 * @param {Array<Object>} keys - Deduplicated key-value objects.
 * @param {Function} partitionResolver - Function(table, key) =>
 *   partitionId. Maps a key to its owning partition.
 * @return {Map<string, Array<Object>>} Keys grouped by partition.
 */
function groupKeysByPartition(keys, partitionResolver) {
  const groups = new Map();

  for (const key of keys) {
    const partitionId = partitionResolver(key);
    if (!groups.has(partitionId)) {
      groups.set(partitionId, []);
    }
    groups.get(partitionId).push(key);
  }

  return groups;
}

/**
 * Estimate byte size of lookup result rows.
 *
 * @param {Array<Object>} rows - Result rows.
 * @return {number} Estimated byte count.
 */
function estimateLookupBytes(rows) {
  let total = 0;
  for (const row of rows) {
    total += JSON.stringify(row).length;
  }
  return total;
}

/**
 * Execute a lookup operation with validation, deduplication,
 * batching by partition, and budget enforcement.
 *
 * Requirement 5.1: Cross-partition data movement only through
 * explicit primitives.
 * Requirement 5.2: Lookup is batched key access limited to
 * primary, unique, or bounded index lookups.
 *
 * @param {Object} options - Lookup options.
 * @param {string} options.table - Table name.
 * @param {Array<Object>} options.keys - Key-value objects with
 *   {column, value} shape.
 * @param {string} options.accessPath - Access path type from
 *   LOOKUP_ACCESS_PATH.
 * @param {Function} options.partitionResolver - Maps key to
 *   partition ID.
 * @param {Function} options.fetchFn - Async function
 *   (partitionId, table, keys) => rows.
 * @param {Object} [options.budgets] - Budget overrides.
 * @param {Function} [options.onTelemetry] - Telemetry callback.
 * @param {Object} [options.lineageTracker] - LineageTracker
 *   instance for attaching lineage IDs.
 * @param {number} [options.stageIndex] - Stage index for
 *   lineage ID generation.
 * @param {number} [options.sequenceNum] - Sequence number for
 *   lineage ID generation.
 * @return {Promise<Object>} Lookup result with rows, counts,
 *   and metadata.
 */
async function executeLookup(options) {
  const {
    table,
    keys,
    accessPath,
    partitionResolver,
    fetchFn,
    budgets,
    onTelemetry,
    lineageTracker,
    stageIndex,
    sequenceNum,
  } = options;

  const startTime = Date.now();

  // Validate arguments
  const validation = validateLookupArgs(table, keys, budgets);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Enforce access path
  if (!isAllowedAccessPath(accessPath)) {
    throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED);
  }

  // Deduplicate keys
  const deduped = deduplicateKeys(keys);

  // Group by partition for vectorized dispatch
  const partitionGroups = groupKeysByPartition(
    deduped.uniqueKeys,
    partitionResolver,
  );

  // Fetch from each partition
  const allRows = [];
  for (const [partitionId, partitionKeys] of partitionGroups) {
    const rows = await fetchFn(partitionId, table, partitionKeys);
    if (Array.isArray(rows)) {
      allRows.push(...rows);
    }
  }

  // Enforce byte budget
  const byteCount = estimateLookupBytes(allRows);
  const maxBytes = budgets?.LOOKUP_MAX_BYTES ?? LOOKUP_MAX_BYTES;
  if (byteCount > maxBytes) {
    throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_MAX_BYTES_EXCEEDED);
  }

  const durationMs = Date.now() - startTime;

  const result = {
    [LRF.ROWS]: allRows,
    [LRF.KEY_COUNT]: deduped.originalCount,
    [LRF.BYTE_COUNT]: byteCount,
    [LRF.DEDUPED_KEY_COUNT]: deduped.dedupedCount,
    [LRF.PARTITION_COUNT]: partitionGroups.size,
    [LRF.ACCESS_PATH]: accessPath,
  };

  if (lineageTracker) {
    lineageTracker.attachLineage(
      result, stageIndex ?? 0, PRIMITIVE_TYPE.LOOKUP,
      sequenceNum ?? 0,
    );
  }

  // Report telemetry
  if (typeof onTelemetry === 'function') {
    onTelemetry({
      primitive: PRIMITIVE_TYPE.LOOKUP,
      table,
      keyCount: deduped.originalCount,
      dedupedKeyCount: deduped.dedupedCount,
      partitionCount: partitionGroups.size,
      byteCount,
      durationMs,
    });
  }

  return result;
}

export {
  validateLookupArgs,
  isAllowedAccessPath,
  deduplicateKeys,
  groupKeysByPartition,
  estimateLookupBytes,
  executeLookup,
};
