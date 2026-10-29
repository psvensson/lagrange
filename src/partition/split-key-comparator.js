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
  BIGINT: 'bigint',
  STRING: 'string',
  BUFFER: 'buffer',
  TUPLE: 'tuple',
});

const COMPARISON_RESULT = Object.freeze({
  LEFT: -1,
  RIGHT: 1,
  EQUAL: 0,
});

const SUPPORTED_KEY_TYPE_LIST = 'number/bigint/string/buffer/tuple';
const UTF8_ENCODING = 'utf8';
const LOCAL_STR_EMPTY_TUPLE = 'empty_tuple';
const LOCAL_STR_NULL_OR_UNDEFINED_ELEMENT = 'null_or_undefined_tuple_element';

function resolveSplitKeyType(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return SPLIT_KEY_TYPE.NUMBER;
  }
  if (typeof value === 'bigint') {
    return SPLIT_KEY_TYPE.BIGINT;
  }
  if (typeof value === 'string') {
    return SPLIT_KEY_TYPE.STRING;
  }
  if (Buffer.isBuffer(value)) {
    return SPLIT_KEY_TYPE.BUFFER;
  }
  if (Array.isArray(value)) {
    return SPLIT_KEY_TYPE.TUPLE;
  }
  return null;
}

function assertRoutingKeySupported(value) {
  const type = resolveSplitKeyType(value);
  if (type === null) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        typeof value,
        SUPPORTED_KEY_TYPE_LIST,
      ),
    );
  }
  if (type === SPLIT_KEY_TYPE.TUPLE) {
    if (value.length === 0) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
          LOCAL_STR_EMPTY_TUPLE,
          SUPPORTED_KEY_TYPE_LIST,
        ),
      );
    }
    for (const elem of value) {
      if (elem === null || elem === undefined) {
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
            LOCAL_STR_NULL_OR_UNDEFINED_ELEMENT,
            SUPPORTED_KEY_TYPE_LIST,
          ),
        );
      }
      const elemType = resolveSplitKeyType(elem);
      if (elemType === null || elemType === SPLIT_KEY_TYPE.TUPLE) {
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
            elemType || typeof elem,
            SUPPORTED_KEY_TYPE_LIST,
          ),
        );
      }
    }
  }
}

function compareNumbers(left, right) {
  if (left < right) return COMPARISON_RESULT.LEFT;
  if (left > right) return COMPARISON_RESULT.RIGHT;
  return COMPARISON_RESULT.EQUAL;
}

function compareBigInts(left, right) {
  if (left < right) return COMPARISON_RESULT.LEFT;
  if (left > right) return COMPARISON_RESULT.RIGHT;
  return COMPARISON_RESULT.EQUAL;
}

function compareBigIntWithNumber(bigintVal, numberVal) {
  if (Number.isSafeInteger(numberVal)) {
    return compareBigInts(bigintVal, BigInt(numberVal));
  }
  return compareNumbers(Number(bigintVal), numberVal);
}

function compareUtf8Strings(a, b) {
  const cmp = Buffer.compare(
    Buffer.from(String(a), UTF8_ENCODING),
    Buffer.from(String(b), UTF8_ENCODING),
  );
  if (cmp < 0) return COMPARISON_RESULT.LEFT;
  if (cmp > 0) return COMPARISON_RESULT.RIGHT;
  return COMPARISON_RESULT.EQUAL;
}

function compareTuples(a, b) {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i += 1) {
    const cmp = compareRoutingKeys(a[i], b[i]);
    if (cmp !== COMPARISON_RESULT.EQUAL) {
      return cmp;
    }
  }
  if (a.length < b.length) return COMPARISON_RESULT.LEFT;
  if (a.length > b.length) return COMPARISON_RESULT.RIGHT;
  return COMPARISON_RESULT.EQUAL;
}

function compareWithinType(keyType, a, b) {
  if (keyType === SPLIT_KEY_TYPE.BUFFER) {
    const cmp = Buffer.compare(a, b);
    if (cmp < 0) return COMPARISON_RESULT.LEFT;
    if (cmp > 0) return COMPARISON_RESULT.RIGHT;
    return COMPARISON_RESULT.EQUAL;
  }
  if (keyType === SPLIT_KEY_TYPE.NUMBER) return compareNumbers(a, b);
  if (keyType === SPLIT_KEY_TYPE.BIGINT) return compareBigInts(a, b);
  if (keyType === SPLIT_KEY_TYPE.TUPLE) return compareTuples(a, b);
  return compareUtf8Strings(a, b);
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
  assertRoutingKeySupported(splitKey);
  assertRoutingKeySupported(value);
  return compareRoutingKeys(value, splitKey);
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

export {SPLIT_KEY_TYPE, SUPPORTED_KEY_TYPE_LIST};

function assertPresentKeySupported(key) {
  if (key !== null && key !== undefined) {
    assertRoutingKeySupported(key);
  }
}

function invertComparisonResult(cmp) {
  if (cmp === COMPARISON_RESULT.LEFT) return COMPARISON_RESULT.RIGHT;
  if (cmp === COMPARISON_RESULT.RIGHT) return COMPARISON_RESULT.LEFT;
  return COMPARISON_RESULT.EQUAL;
}

function compareMixedBigIntNumber(aType, bType, a, b) {
  if (aType === SPLIT_KEY_TYPE.BIGINT && bType === SPLIT_KEY_TYPE.NUMBER) {
    return compareBigIntWithNumber(a, b);
  }
  if (aType === SPLIT_KEY_TYPE.NUMBER && bType === SPLIT_KEY_TYPE.BIGINT) {
    return invertComparisonResult(compareBigIntWithNumber(b, a));
  }
  return null;
}

/**
 * Routing order for partition keys: the one comparator behind
 * KeyRange.compareKeys, PartitionResolver.compareValues and
 * QueryGroup.compareValues. Null sorts first. Two keys of one declared
 * type compare within that type (numbers numerically without overflow,
 * bigints with exact precision, strings by binary utf8 byte order, buffers
 * bytewise, tuples element-by-element). BigInt compares with Number in the exact
 * integer domain when safe or numerically otherwise. Any mixed key space
 * (e.g. number vs string) is the typed split-key mismatch outcome, never coerced.
 * Unsupported operands (NaN, Infinity, booleans, objects) fail closed even
 * before equality short-circuiting.
 * @param {*} a - Routed key or boundary.
 * @param {*} b - Routed key or boundary.
 * @return {number} Negative when a sorts first, positive when b does, 0 when equal.
 */
export function compareRoutingKeys(a, b) {
  assertPresentKeySupported(a);
  assertPresentKeySupported(b);
  if (a === b) return COMPARISON_RESULT.EQUAL;
  const absentOrder = compareAbsentKeys(a, b);
  if (absentOrder !== null) return absentOrder;

  const aType = resolveSplitKeyType(a);
  const bType = resolveSplitKeyType(b);

  if (aType !== null && aType === bType) {
    return compareWithinType(aType, a, b);
  }

  const mixedCmp = compareMixedBigIntNumber(aType, bType, a, b);
  if (mixedCmp !== null) {
    return mixedCmp;
  }

  throw new Error(
    PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
      aType || typeof a,
      bType || typeof b,
    ),
  );
}
