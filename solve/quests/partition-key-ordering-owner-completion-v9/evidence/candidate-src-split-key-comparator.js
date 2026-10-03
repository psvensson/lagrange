// Typed split-key comparator — the single owner of split-key comparison
// semantics for every split routing decision (mirror replay, snapshot
// batching, service-wrapper routing). Audit finding F12: a raw JavaScript
// relational comparison coerces mixed-type operands arbitrarily
// ('10' < 2 is false, so the string '10' would be routed right of a
// numeric splitKey 2 — a silent mis-route). This module compares only
// within one declared key type and rejects mixed-type key spaces with a
// typed outcome; nothing may fall back to coercion.

import {types as nodeUtilTypes} from 'node:util';

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
const TEXT_ENCODING = 'utf8';
const SPLIT_METADATA_FIELD = Object.freeze({
  SPLIT_KEY: 'splitKey',
  PRIMARY_KEY_COLUMN: 'primaryKeyColumn',
  TARGET_PARTITION_IDS: 'targetPartitionIds',
  LENGTH: 'length',
  DESCRIPTOR_VALUE: 'value',
  LEFT_INDEX: '0',
  RIGHT_INDEX: '1',
  VALUE: 'value',
});
const INVALID_SPLIT_ROUTING_PROXY =
  'Split routing metadata proxies are rejected before descriptor access';
const INVALID_SPLIT_ROUTING_PRIMARY_KEY_COLUMN =
  'Split routing metadata primaryKeyColumn must be an own primitive string';
const ErrorCtor = Error;
const TypeErrorCtor = TypeError;
const arrayIsArray = Array.isArray;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const bufferCompare = Buffer.compare.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferIsBuffer = Buffer.isBuffer.bind(Buffer);
const numberIsFinite = Number.isFinite;
const numberFrom = Number;
const isProxy = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
const regExpExec = Function.call.bind(RegExp.prototype.exec);

function resolveSplitKeyType(value) {
  if (typeof value === SPLIT_KEY_TYPE.NUMBER && numberIsFinite(value)) {
    return SPLIT_KEY_TYPE.NUMBER;
  }
  if (typeof value === SPLIT_KEY_TYPE.STRING) {
    return SPLIT_KEY_TYPE.STRING;
  }
  if (bufferIsBuffer(value)) {
    return SPLIT_KEY_TYPE.BUFFER;
  }
  return null;
}

function compareBinaryText(left, right) {
  return bufferCompare(
    bufferFrom(left, TEXT_ENCODING),
    bufferFrom(right, TEXT_ENCODING),
  );
}

function compareNumbers(left, right) {
  if (left === right) {
    return COMPARISON_RESULT.EQUAL;
  }
  return left < right ?
    COMPARISON_RESULT.LEFT :
    COMPARISON_RESULT.RIGHT;
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
    throw new ErrorCtor(
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
    throw new ErrorCtor(
      PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
        valueType || typeof value,
        splitKeyType,
      ),
    );
  }
  if (splitKeyType === SPLIT_KEY_TYPE.BUFFER) {
    return bufferCompare(value, splitKey);
  }
  if (splitKeyType === SPLIT_KEY_TYPE.NUMBER) {
    return compareNumbers(value, splitKey);
  }
  return compareBinaryText(value, splitKey);
}

function assertSplitRoutingMetadataSafe(record) {
  const recordType = typeof record;
  if (record !== null &&
      (recordType === 'object' || recordType === 'function') &&
      isProxy(record)) {
    throw new TypeErrorCtor(INVALID_SPLIT_ROUTING_PROXY);
  }
}

function readOwnDataValue(record, key) {
  if (record === null || typeof record !== 'object') {
    return undefined;
  }
  assertSplitRoutingMetadataSafe(record);
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  if (!descriptor || !objectHasOwn(descriptor, SPLIT_METADATA_FIELD.VALUE)) {
    return undefined;
  }
  return descriptor.value;
}

function resolveSplitRoutingPrimaryKeyColumn(metadata) {
  assertSplitRoutingMetadataSafe(metadata);
  const primaryKeyColumn = readOwnDataValue(
    metadata,
    SPLIT_METADATA_FIELD.PRIMARY_KEY_COLUMN,
  );
  if (typeof primaryKeyColumn !== SPLIT_KEY_TYPE.STRING ||
      primaryKeyColumn.length === 0) {
    throw new TypeErrorCtor(INVALID_SPLIT_ROUTING_PRIMARY_KEY_COLUMN);
  }
  return primaryKeyColumn;
}

function readTargetPartitionIds(metadata) {
  const targetPartitionIds = readOwnDataValue(
    metadata,
    SPLIT_METADATA_FIELD.TARGET_PARTITION_IDS,
  );
  assertSplitRoutingMetadataSafe(targetPartitionIds);
  if (!arrayIsArray(targetPartitionIds)) {
    return {leftPartitionId: undefined, rightPartitionId: undefined};
  }
  const lengthDescriptor =
    objectGetOwnPropertyDescriptor(targetPartitionIds, SPLIT_METADATA_FIELD.LENGTH);
  if (!lengthDescriptor ||
      !objectHasOwn(lengthDescriptor, SPLIT_METADATA_FIELD.VALUE) ||
      lengthDescriptor.value < 2) {
    return {leftPartitionId: undefined, rightPartitionId: undefined};
  }
  return {
    leftPartitionId: readOwnDataValue(targetPartitionIds, SPLIT_METADATA_FIELD.LEFT_INDEX),
    rightPartitionId: readOwnDataValue(targetPartitionIds, SPLIT_METADATA_FIELD.RIGHT_INDEX),
  };
}

/**
 * Resolve the child partition ID for one partition-key value through the
 * typed comparator. Split metadata is consumed from own data properties only;
 * inherited/accessor fields and iterator behavior are not routing authority.
 * @param {*} value - Primary-key value.
 * @param {Object} metadata - Split metadata (splitKey, targetPartitionIds).
 * @return {string} Target child partition ID.
 */
export function resolveSplitTargetPartitionId(value, metadata = {}) {
  const {leftPartitionId, rightPartitionId} =
    readTargetPartitionIds(metadata);
  if (value === null || value === void 0) {
    return rightPartitionId;
  }
  const splitKey = readOwnDataValue(metadata, SPLIT_METADATA_FIELD.SPLIT_KEY);
  return compareSplitKey(value, splitKey) < COMPARISON_RESULT.EQUAL ?
    leftPartitionId :
    rightPartitionId;
}

export {
  SPLIT_KEY_TYPE,
  assertSplitRoutingMetadataSafe,
  resolveSplitRoutingPrimaryKeyColumn,
};

const TEXT_ENCODED_NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/u;

function isTextEncodedNumber(value) {
  return typeof value === SPLIT_KEY_TYPE.STRING &&
    regExpExec(TEXT_ENCODED_NUMBER_PATTERN, value) !== null &&
    numberIsFinite(numberFrom(value));
}

function compareWithinType(keyType, a, b) {
  if (keyType === SPLIT_KEY_TYPE.BUFFER) return bufferCompare(a, b);
  if (keyType === SPLIT_KEY_TYPE.NUMBER) return compareNumbers(a, b);
  return compareBinaryText(a, b);
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
    return compareNumbers(a, numberFrom(b));
  }
  if (bType === SPLIT_KEY_TYPE.NUMBER && isTextEncodedNumber(a)) {
    return compareNumbers(numberFrom(a), b);
  }
  return null;
}

function resolvePresentRoutingKeyType(value) {
  return isAbsentKey(value) ? null : resolveSplitKeyType(value);
}

function throwRoutingKeyTypeMismatch(a, b, aType, bType) {
  throw new ErrorCtor(
    PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch(
      aType || typeof a,
      bType || typeof b,
    ),
  );
}

function assertRoutingKeySupported(value, absent, valueType, peer, peerType) {
  if (!absent && valueType === null) {
    throwRoutingKeyTypeMismatch(value, peer, valueType, peerType);
  }
}

/**
 * Routing order for partition keys: the one comparator behind
 * KeyRange.compareKeys, PartitionResolver.compareValues and
 * QueryGroup.compareValues. Null sorts first. Two keys of one declared
 * type compare within that type (numbers numerically, strings by the
 * SQLite BINARY-compatible UTF-8 byte order, buffers bytewise). Unsupported
 * key types fail closed without coercion. A number against a text-encoded
 * number compares numerically: the partitions system table
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
  const aAbsent = isAbsentKey(a);
  const bAbsent = isAbsentKey(b);
  const aType = resolvePresentRoutingKeyType(a);
  const bType = resolvePresentRoutingKeyType(b);
  assertRoutingKeySupported(a, aAbsent, aType, b, bType);
  assertRoutingKeySupported(b, bAbsent, bType, a, aType);
  const absentOrder = compareAbsentKeys(a, b);
  if (absentOrder !== null) return absentOrder;
  if (aType === bType) return compareWithinType(aType, a, b);
  const numericOrder = compareNumberWithTextEncodedNumber(a, b, aType, bType);
  if (numericOrder !== null) return numericOrder;
  return throwRoutingKeyTypeMismatch(a, b, aType, bType);
}
