import {createHash} from 'node:crypto';

const arrayIsArray = Array.isArray;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectIs = Object.is;
const reflectOwnKeys = Reflect.ownKeys;
const canonicalArrayPrototype = Array.prototype;
const canonicalObjectPrototype = Object.prototype;
const MAX_SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const ARRAY_LENGTH_KEY = 'length';
const DATA_VALUE_KEY = 'value';
const SHA256_ALGORITHM = 'sha256';
const SHA256_ENCODING = 'hex';
const SHA256_PREFIX = 'sha256:';
const SHA256_HEX_LENGTH = 64;
const FIRST_DIGIT = '0';
const LAST_DIGIT = '9';
const FIRST_HEX_LETTER = 'a';
const LAST_HEX_LETTER = 'f';
const MISSING_VALUE = Symbol('benchmark_semantic_missing_value');
const SERIALIZATION_TEXT = {
  ARRAY_REQUIRED: 'canonical benchmark semantic array required',
  ARRAY_OPEN: '[',
  ARRAY_CLOSE: ']',
  RECORD_REQUIRED: 'canonical benchmark semantic record required',
  RECORD_OPEN: '{',
  RECORD_CLOSE: '}',
  SEPARATOR: ',',
  KEY_SEPARATOR: ':',
  NULL: 'null',
  TRUE: 'true',
  FALSE: 'false',
  JSON_TEXT_REQUIRED: 'benchmark semantic JSON text required',
};

export function appendOwnArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

export function ownDataValue(record, key) {
  if (!record || typeof record !== 'object') {
    return MISSING_VALUE;
  }
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, DATA_VALUE_KEY) ?
    descriptor.value :
    MISSING_VALUE;
}

export function isMissingDataValue(value) {
  return value === MISSING_VALUE;
}

function isOwnEnumerableDataProperty(value, key) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true &&
    objectHasOwn(descriptor, DATA_VALUE_KEY);
}

export function isPlainDataRecord(value) {
  if (!value || typeof value !== 'object' || arrayIsArray(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== canonicalObjectPrototype && prototype !== null) {
    return false;
  }
  const keys = reflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (
      typeof keys[index] !== 'string' ||
      !isOwnEnumerableDataProperty(value, keys[index])
    ) {
      return false;
    }
  }
  return true;
}

export function hasExactOwnDataKeys(value, expectedKeys) {
  if (!isPlainDataRecord(value) || !isDenseDataArray(expectedKeys)) {
    return false;
  }
  const keys = objectKeys(value);
  if (keys.length !== expectedKeys.length) {
    return false;
  }
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (!objectHasOwn(value, expectedKeys[index])) {
      return false;
    }
  }
  return true;
}

function isCanonicalArrayIndexKey(key, length) {
  if (typeof key !== 'string' || key.length === 0) {
    return false;
  }
  if (key.length > 1 && key[0] === FIRST_DIGIT) {
    return false;
  }
  for (let index = 0; index < key.length; index += 1) {
    if (key[index] < FIRST_DIGIT || key[index] > LAST_DIGIT) {
      return false;
    }
  }
  const numericKey = +key;
  return numberIsSafeInteger(numericKey) && numericKey < length;
}

export function isDenseDataArray(value) {
  if (
    !arrayIsArray(value) ||
    objectGetPrototypeOf(value) !== canonicalArrayPrototype
  ) {
    return false;
  }
  const lengthDescriptor = objectGetOwnPropertyDescriptor(
    value,
    ARRAY_LENGTH_KEY,
  );
  if (
    !lengthDescriptor ||
    !objectHasOwn(lengthDescriptor, DATA_VALUE_KEY) ||
    lengthDescriptor.value !== value.length ||
    !numberIsSafeInteger(value.length)
  ) {
    return false;
  }
  const keys = reflectOwnKeys(value);
  if (keys.length !== value.length + 1) {
    return false;
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === ARRAY_LENGTH_KEY) {
      continue;
    }
    if (
      !isCanonicalArrayIndexKey(key, value.length) ||
      !isOwnEnumerableDataProperty(value, key)
    ) {
      return false;
    }
  }
  return true;
}

export function copyDenseStringArray(value) {
  if (!isDenseDataArray(value)) {
    return null;
  }
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'string') {
      return null;
    }
    appendOwnArrayValue(copy, value[index]);
  }
  return copy;
}

export function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' &&
    numberIsFinite(value) &&
    numberIsInteger(value) &&
    numberIsSafeInteger(value) &&
    value >= 0 &&
    !objectIs(value, -0);
}

export function isNonNegativeSafeNumber(value) {
  return typeof value === 'number' &&
    numberIsFinite(value) &&
    value >= 0 &&
    value <= MAX_SAFE_MAGNITUDE &&
    !objectIs(value, -0);
}

export function isSha256Digest(value) {
  if (
    typeof value !== 'string' ||
    value.length !== SHA256_PREFIX.length + SHA256_HEX_LENGTH
  ) {
    return false;
  }
  for (let index = 0; index < SHA256_PREFIX.length; index += 1) {
    if (value[index] !== SHA256_PREFIX[index]) {
      return false;
    }
  }
  for (let index = SHA256_PREFIX.length; index < value.length; index += 1) {
    const character = value[index];
    const isDigit = character >= FIRST_DIGIT && character <= LAST_DIGIT;
    const isHexLetter =
      character >= FIRST_HEX_LETTER && character <= LAST_HEX_LETTER;
    if (!isDigit && !isHexLetter) {
      return false;
    }
  }
  return true;
}

function sortedOwnStringKeys(value) {
  const keys = objectKeys(value);
  for (let index = 1; index < keys.length; index += 1) {
    const current = keys[index];
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      keys[insertionIndex - 1] > current
    ) {
      keys[insertionIndex] = keys[insertionIndex - 1];
      insertionIndex -= 1;
    }
    keys[insertionIndex] = current;
  }
  return keys;
}

function serializeArray(value) {
  if (!isDenseDataArray(value)) {
    throw new TypeError(SERIALIZATION_TEXT.ARRAY_REQUIRED);
  }
  let serialized = SERIALIZATION_TEXT.ARRAY_OPEN;
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) {
      serialized += SERIALIZATION_TEXT.SEPARATOR;
    }
    serialized += serializeValue(value[index]);
  }
  return serialized + SERIALIZATION_TEXT.ARRAY_CLOSE;
}

function serializeRecord(value) {
  if (!isPlainDataRecord(value)) {
    throw new TypeError(SERIALIZATION_TEXT.RECORD_REQUIRED);
  }
  const keys = sortedOwnStringKeys(value);
  let serialized = SERIALIZATION_TEXT.RECORD_OPEN;
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) {
      serialized += SERIALIZATION_TEXT.SEPARATOR;
    }
    const key = keys[index];
    serialized += jsonStringify(key) +
      SERIALIZATION_TEXT.KEY_SEPARATOR +
      serializeValue(value[key]);
  }
  return serialized + SERIALIZATION_TEXT.RECORD_CLOSE;
}

function serializeValue(value) {
  if (value === null) {
    return SERIALIZATION_TEXT.NULL;
  }
  if (typeof value === 'string') {
    return jsonStringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? SERIALIZATION_TEXT.TRUE : SERIALIZATION_TEXT.FALSE;
  }
  if (isNonNegativeSafeNumber(value)) {
    return `${value}`;
  }
  if (arrayIsArray(value)) {
    return serializeArray(value);
  }
  return serializeRecord(value);
}

export function serializeBenchmarkSemanticData(value) {
  return serializeValue(value);
}

export function parseBenchmarkSemanticJson(value) {
  if (typeof value !== 'string') {
    throw new TypeError(SERIALIZATION_TEXT.JSON_TEXT_REQUIRED);
  }
  const parsed = jsonParse(value);
  serializeBenchmarkSemanticData(parsed);
  return parsed;
}

export function digestBenchmarkSemanticData(value) {
  return SHA256_PREFIX +
    createHash(SHA256_ALGORITHM)
      .update(serializeBenchmarkSemanticData(value))
      .digest(SHA256_ENCODING);
}

export function uniqueSortedStrings(values) {
  const seen = objectCreate(null);
  const unique = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!objectHasOwn(seen, value)) {
      seen[value] = true;
      appendOwnArrayValue(unique, value);
    }
  }
  for (let index = 1; index < unique.length; index += 1) {
    const current = unique[index];
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      unique[insertionIndex - 1] > current
    ) {
      unique[insertionIndex] = unique[insertionIndex - 1];
      insertionIndex -= 1;
    }
    unique[insertionIndex] = current;
  }
  return unique;
}
