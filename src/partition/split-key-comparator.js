// Typed split-key comparator — the single owner of split-key comparison
// semantics for every split routing decision (mirror replay, snapshot
// batching, service-wrapper routing). Audit finding F12: a raw JavaScript
// relational comparison coerces mixed-type operands arbitrarily
// ('10' < 2 is false, so the string '10' would be routed right of a
// numeric splitKey 2 — a silent mis-route). This module compares only
// within one declared key type and rejects mixed-type key spaces with a
// typed outcome; nothing may fall back to coercion.

import {
  PARTITION_SERVICE_ERROR_MSG,
} from './partition-service-constants.js';

const SPLIT_KEY_TYPE = Object.freeze({
  NUMBER: 'number',
  STRING: 'string',
  BUFFER: 'buffer',
});
const COMPARISON_RESULT = Object.freeze({
  LEFT: -1,
  RIGHT: 1,
  EQUAL: 0,
});
const SUPPORTED_KEY_TYPE_LIST = 'number/string/buffer';

function resolveSplitKeyType(value) {
  if (typeof value === SPLIT_KEY_TYPE.NUMBER && Number.isFinite(value)) {
    return SPLIT_KEY_TYPE.NUMBER;
  }
  if (typeof value === SPLIT_KEY_TYPE.STRING) {
    return SPLIT_KEY_TYPE.STRING;
  }
  if (Buffer.isBuffer(value)) {
    return SPLIT_KEY_TYPE.BUFFER;
  }
  return null;
}

/**
 * Compare a routing key against the split key within one declared key
 * type. Mixed-type or non-comparable key spaces throw the typed
 * SPLIT_KEY_TYPE_MISMATCH outcome instead of coercing.
 * @param {*} value - Partition-key value to place.
 * @param {*} splitKey - Split boundary key (the key-space type authority).
 * @return {number} Negative when value sorts left of the split key,
 *   zero at the boundary, positive right of it.
 */
export function compareSplitKey(value, splitKey) {
  const splitKeyType = resolveSplitKeyType(splitKey);
  if (splitKeyType === null) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        typeof splitKey,
        SUPPORTED_KEY_TYPE_LIST,
      ),
    );
  }
  // null/undefined keys route right of the split key by contract (the
  // resolver handles them before comparison); they never reach here.
  const valueType = resolveSplitKeyType(value);
  if (valueType === null || valueType !== splitKeyType) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        valueType || typeof value,
        splitKeyType,
      ),
    );
  }
  if (splitKeyType === SPLIT_KEY_TYPE.BUFFER) {
    return Buffer.compare(value, splitKey);
  }
  if (value < splitKey) {
    return COMPARISON_RESULT.LEFT;
  }
  if (value > splitKey) {
    return COMPARISON_RESULT.RIGHT;
  }
  return COMPARISON_RESULT.EQUAL;
}

/**
 * Resolve the child partition ID for one partition-key value through the
 * typed comparator.
 * @param {*} value - Primary-key value.
 * @param {Object} metadata - Split metadata (splitKey, targetPartitionIds).
 * @return {string} Target child partition ID.
 */
export function resolveSplitTargetPartitionId(value, metadata = {}) {
  const [leftPartitionId, rightPartitionId] = Array.isArray(
    metadata?.targetPartitionIds,
  ) ?
    metadata.targetPartitionIds :
    [];
  if (value === null || value === void 0) {
    return rightPartitionId;
  }
  return compareSplitKey(value, metadata.splitKey) < COMPARISON_RESULT.EQUAL ?
    leftPartitionId :
    rightPartitionId;
}

export {SPLIT_KEY_TYPE};
