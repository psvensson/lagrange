import {types} from 'node:util';
import {
  copyDenseOwnDataArray,
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';

const DESCRIPTOR_VALUE_FIELD = 'value';
const DATA_PROPERTY_STATE = Object.freeze({
  ABSENT: 'absent',
  INVALID: 'invalid',
  VALID: 'valid',
});
const EXPECTED_REPLICA_COUNT_FIELD = 'expectedReplicaCount';
const numberToExactInteger = BigInt;
const isProxy = types.isProxy.bind(types);
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectKeys = Object.keys;
const MapConstructor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapValues = Function.call.bind(Map.prototype.values);
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const setSizeGetter = objectGetOwnPropertyDescriptor(Set.prototype, 'size').get;
const setSize = Function.call.bind(setSizeGetter);
const setValues = Function.call.bind(Set.prototype.values);
const mapIteratorNext = Function.call.bind(
  objectGetPrototypeOf(mapValues(new MapConstructor())).next,
);
const setIteratorNext = Function.call.bind(
  objectGetPrototypeOf(setValues(new SetConstructor())).next,
);
const sortArray = Function.call.bind(Array.prototype.sort);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringTrim = Function.call.bind(String.prototype.trim);
const EXACT_NON_NEGATIVE_ZERO = numberToExactInteger(0);

function appendOwnArrayValue(array, value) {
  objectDefineProperty(array, array.length, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function inspectOwnDataProperty(record, propertyNames) {
  if (!record || typeof record !== 'object' || isProxy(record)) {
    return {state: DATA_PROPERTY_STATE.INVALID, value: null};
  }
  try {
    for (let index = 0; index < propertyNames.length; index += 1) {
      const propertyName = propertyNames[index];
      const descriptor = objectGetOwnPropertyDescriptor(record, propertyName);
      if (!descriptor) {
        continue;
      }
      return objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD) ?
        {state: DATA_PROPERTY_STATE.VALID, value: descriptor.value} :
        {state: DATA_PROPERTY_STATE.INVALID, value: null};
    }
  } catch {
    return {state: DATA_PROPERTY_STATE.INVALID, value: null};
  }
  return {state: DATA_PROPERTY_STATE.ABSENT, value: null};
}

function readOwnDataProperty(record, propertyNames) {
  const result = inspectOwnDataProperty(record, propertyNames);
  return {
    found: result.state === DATA_PROPERTY_STATE.VALID,
    value: result.value,
  };
}

function normalizeExpectedReplicaCount(value) {
  return typeof value === 'number' &&
    numberIsSafeInteger(value) &&
    value > 0 ?
    value :
    null;
}

function normalizeNonNegativeSafeInteger(value, fallback = null) {
  return typeof value === 'number' &&
    numberIsSafeInteger(value) &&
    !objectIs(value, -0) &&
    value >= 0 ?
    value :
    fallback;
}

function readOwnPrimitiveString(record, propertyNames) {
  const entry = readOwnDataProperty(record, propertyNames);
  if (!entry.found || typeof entry.value !== 'string') {
    return '';
  }
  return stringTrim(entry.value);
}

function readOwnLowerPrimitiveString(record, propertyNames) {
  const value = readOwnPrimitiveString(record, propertyNames);
  return value.length > 0 ? stringToLowerCase(value) : value;
}

function normalizeExclusionReasonCount(value) {
  return typeof value === 'number' &&
    numberIsSafeInteger(value) &&
    !objectIs(value, -0) &&
    value >= 0 ?
    value :
    null;
}

function copyExclusionCounts(value) {
  const source = copyStrictOwnDataRecord(value);
  if (source === null) {
    return null;
  }
  const keys = objectKeys(source);
  const copy = objectCreate(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const entry = readOwnDataProperty(source, [key]);
    const count = entry.found ? normalizeExclusionReasonCount(entry.value) : null;
    if (count === null) {
      return null;
    }
    objectDefineProperty(copy, key, {
      value: count,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function exclusionReasonCountsEqual(left, right) {
  const leftRecord = left && typeof left === 'object' ? left : null;
  const rightRecord = right && typeof right === 'object' ? right : null;
  if (leftRecord === null || rightRecord === null) {
    return leftRecord === rightRecord;
  }
  const leftKeys = sortArray(objectKeys(leftRecord));
  const rightKeys = sortArray(objectKeys(rightRecord));
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] ||
        readOwnDataProperty(leftRecord, [key]).value !==
          readOwnDataProperty(rightRecord, [key]).value) {
      return false;
    }
  }
  return true;
}

function normalizedStringListsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function normalizedBlockedPartitionsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftPartition = left[index];
    const rightPartition = right[index];
    const leftExclusionReasonCounts = readOwnDataProperty(
      leftPartition,
      ['exclusionReasonCounts'],
    );
    const rightExclusionReasonCounts = readOwnDataProperty(
      rightPartition,
      ['exclusionReasonCounts'],
    );
    if (!(leftPartition.partitionId === rightPartition.partitionId &&
      leftPartition.requiredDistinctNodeCount ===
        rightPartition.requiredDistinctNodeCount &&
      leftPartition.readyDistinctNodeCount ===
        rightPartition.readyDistinctNodeCount &&
      leftPartition.readyReplicaCount === rightPartition.readyReplicaCount &&
      leftPartition.spreadGap === rightPartition.spreadGap &&
      objectHasOwn(leftPartition, EXPECTED_REPLICA_COUNT_FIELD) ===
        objectHasOwn(rightPartition, EXPECTED_REPLICA_COUNT_FIELD) &&
      leftPartition.expectedReplicaCount === rightPartition.expectedReplicaCount &&
      leftExclusionReasonCounts.found === rightExclusionReasonCounts.found &&
      exclusionReasonCountsEqual(
        leftExclusionReasonCounts.value,
        rightExclusionReasonCounts.value,
      ))) {
      return false;
    }
  }
  return true;
}

function normalizedPriorityPartitionSummariesEqual(left, right) {
  return left.satisfied === right.satisfied &&
    left.requiredDistinctNodeCount === right.requiredDistinctNodeCount &&
    left.readyEligibleNodeCount === right.readyEligibleNodeCount &&
    left.totalPriorityPartitionCount === right.totalPriorityPartitionCount &&
    normalizedStringListsEqual(left.missingPartitionIds, right.missingPartitionIds) &&
    normalizedBlockedPartitionsEqual(left.blockedPartitions, right.blockedPartitions);
}

function priorityPartitionDiagnosticsEqual(left, right) {
  if (left.blockedPartitions.length !== right.blockedPartitions.length) {
    return false;
  }
  for (let index = 0; index < left.blockedPartitions.length; index += 1) {
    const leftPartition = left.blockedPartitions[index];
    const rightPartition = right.blockedPartitions[index];
    const leftExclusionReasonCounts = readOwnDataProperty(
      leftPartition,
      ['exclusionReasonCounts'],
    );
    const rightExclusionReasonCounts = readOwnDataProperty(
      rightPartition,
      ['exclusionReasonCounts'],
    );
    if (!(leftPartition.partitionId === rightPartition.partitionId &&
      objectHasOwn(leftPartition, EXPECTED_REPLICA_COUNT_FIELD) ===
        objectHasOwn(rightPartition, EXPECTED_REPLICA_COUNT_FIELD) &&
      leftPartition.expectedReplicaCount === rightPartition.expectedReplicaCount &&
      leftExclusionReasonCounts.found === rightExclusionReasonCounts.found &&
      exclusionReasonCountsEqual(
        leftExclusionReasonCounts.value,
        rightExclusionReasonCounts.value,
      ))) {
      return false;
    }
  }
  return true;
}

function normalizePrimitiveStringList(values, blockedPartitions = []) {
  const normalized = [];
  const seen = objectCreate(null);
  const appendValue = (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    const entry = stringTrim(value);
    if (entry.length === 0) {
      return false;
    }
    if (objectHasOwn(seen, entry)) {
      return true;
    }
    objectDefineProperty(seen, entry, {
      value: true,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    appendOwnArrayValue(normalized, entry);
    return true;
  };
  if (values !== null) {
    for (let index = 0; index < values.length; index += 1) {
      if (!appendValue(values[index])) {
        return null;
      }
    }
  }
  for (let index = 0; index < blockedPartitions.length; index += 1) {
    if (!appendValue(blockedPartitions[index].partitionId)) {
      return null;
    }
  }
  sortArray(normalized, (left, right) => left < right ? -1 : left > right ? 1 : 0);
  return normalized;
}

function buildStringSet(values) {
  const result = new SetConstructor();
  for (let index = 0; index < values.length; index += 1) {
    setAdd(result, values[index]);
  }
  return result;
}

function addExactNonNegativeInteger(total, value) {
  return total + numberToExactInteger(value);
}

function compareExactValues(left, right) {
  return left === right ? 0 : left > right ? 1 : -1;
}

function exactNonNegativeZero() {
  return EXACT_NON_NEGATIVE_ZERO;
}

export {
  appendOwnArrayValue,
  addExactNonNegativeInteger,
  buildStringSet,
  copyDenseOwnDataArray,
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
  copyExclusionCounts,
  DATA_PROPERTY_STATE,
  exactNonNegativeZero,
  inspectOwnDataProperty,
  MapConstructor,
  mapGet,
  mapHas,
  mapIteratorNext,
  mapSet,
  mapValues,
  normalizeExclusionReasonCount,
  normalizeExpectedReplicaCount,
  normalizeNonNegativeSafeInteger,
  normalizePrimitiveStringList,
  normalizedPriorityPartitionSummariesEqual,
  objectCreate as createNullRecord,
  objectDefineProperty as defineOwnDataProperty,
  priorityPartitionDiagnosticsEqual,
  compareExactValues,
  readOwnDataProperty,
  readOwnLowerPrimitiveString,
  readOwnPrimitiveString,
  setAdd,
  setHas,
  setIteratorNext,
  SetConstructor,
  setSize,
  setValues,
  sortArray,
};
