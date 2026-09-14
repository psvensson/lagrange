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

const TEXT_ENCODED_NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/u;

function isTextEncodedNumber(value) {
  return typeof value === SPLIT_KEY_TYPE.STRING &&
    TEXT_ENCODED_NUMBER_PATTERN.test(value) &&
    Number.isFinite(Number(value));
}

function compareWithinType(keyType, a, b) {
  if (keyType === SPLIT_KEY_TYPE.BUFFER) return Buffer.compare(a, b);
  if (keyType === SPLIT_KEY_TYPE.NUMBER) return a - b;
  return a.localeCompare(b);
}

function isAbsentKey(value) {
  return value === null || value === undefined;
}

function compareAbsentKeys(a, b) {
  const aAbsent = isAbsentKey(a);
  const bAbsent = isAbsentKey(b);
  if (aAbsent && bAbsent) return COMPARISON_RESULT.EQUAL;
  if (aAbsent) return COMPARISON_RESULT.LEFT;
  if (bAbsent) return COMPARISON_RESULT.RIGHT;
  return null;
}

function compareNumberWithTextEncodedNumber(a, b, aType, bType) {
  if (aType === SPLIT_KEY_TYPE.NUMBER && isTextEncodedNumber(b)) {
    return a - Number(b);
  }
  if (bType === SPLIT_KEY_TYPE.NUMBER && isTextEncodedNumber(a)) {
    return Number(a) - b;
  }
  return null;
}

/**
 * Routing order for partition keys: the one comparator behind
 * KeyRange.compareKeys, PartitionResolver.compareValues and
 * QueryGroup.compareValues. Null sorts first. Two keys of one declared
 * type compare within that type (numbers numerically, strings by
 * localeCompare as before, buffers bytewise); two values of one other
 * runtime type keep the String order they had. A number against a
 * text-encoded number compares numerically: the partitions system table
 * declares partition_key_start/end as TEXT, so a split's numeric median
 * comes back as '500' while the routed key is the number the SQL AST
 * carries; before this owner existed that pair fell through to String
 * coercion and 1000 sorted left of '500'. Any other mixed key space is the
 * typed split-key mismatch outcome, never a coerced comparison.
 * @param {*} a - Routed key or boundary.
 * @param {*} b - Routed key or boundary.
 * @return {number} Negative when a sorts first, positive when b does, 0 when equal.
 */
export function compareRoutingKeys(a, b) {
  if (a === b) return COMPARISON_RESULT.EQUAL;
  const absentOrder = compareAbsentKeys(a, b);
  if (absentOrder !== null) return absentOrder;
  const aType = resolveSplitKeyType(a);
  const bType = resolveSplitKeyType(b);
  if (aType !== null && aType === bType) return compareWithinType(aType, a, b);
  const numericOrder = compareNumberWithTextEncodedNumber(a, b, aType, bType);
  if (numericOrder !== null) return numericOrder;
  if (aType === null && bType === null && typeof a === typeof b) {
    return String(a).localeCompare(String(b));
  }
  throw new Error(
    PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
      aType || typeof a,
      bType || typeof b,
    ),
  );
}
