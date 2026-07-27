import {createHash} from 'node:crypto';
import {types as utilTypes} from 'node:util';

const arrayIsArray = Array.isArray;
const bufferByteLength = Buffer.byteLength;
const bufferFrom = Buffer.from;
const bufferIsBuffer = Buffer.isBuffer;
const bufferToString = Buffer.prototype.toString;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const mathTrunc = Math.trunc;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const regexpExec = RegExp.prototype.exec;
const stringSlice = String.prototype.slice;
const stringStartsWith = String.prototype.startsWith;
const utilIsNativeError = utilTypes.isNativeError;
const utilIsProxy = utilTypes.isProxy;
const weakSetAdd = WeakSet.prototype.add;
const weakSetDelete = WeakSet.prototype.delete;
const weakSetHas = WeakSet.prototype.has;
const WeakSetConstructor = WeakSet;
const canonicalArrayPrototype = Array.prototype;
const canonicalObjectPrototype = Object.prototype;
const ARRAY_LENGTH_KEY = 'length';
const DATA_VALUE_KEY = 'value';
const FIRST_DIGIT = '0';
const LAST_DIGIT = '9';

const BYTE_ENCODING = 'utf8';
const SHA256_ALGORITHM = 'sha256';
const SHA256_ENCODING = 'hex';
const SHA256_PREFIX = 'sha256:';
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function regexpMatches(pattern, value) {
  if (typeof value !== 'string') return false;
  return reflectApply(regexpExec, pattern, [value]) !== null;
}

function stringHasPrefix(value, prefix) {
  if (typeof value !== 'string' || typeof prefix !== 'string') return false;
  return reflectApply(stringStartsWith, value, [prefix]);
}

function stringPart(value, start, end) {
  return reflectApply(stringSlice, value, [start, end]);
}

function ownDataValue(record, key) {
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, DATA_VALUE_KEY) ?
    descriptor.value :
    undefined;
}

function isCanonicalArrayIndex(key, length) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (key.length > 1 && key[0] === FIRST_DIGIT) return false;
  for (let index = 0; index < key.length; index += 1) {
    if (key[index] < FIRST_DIGIT || key[index] > LAST_DIGIT) return false;
  }
  const numericKey = +key;
  return numberIsSafeInteger(numericKey) && numericKey < length;
}

function snapshotArrayField(value, key, length, ancestors) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (!isCanonicalArrayIndex(key, length)) {
    throw new TypeError('exact evidence array elements are required');
  }
  if (descriptor?.enumerable !== true) {
    throw new TypeError('exact evidence array elements are required');
  }
  if (!objectHasOwn(descriptor, DATA_VALUE_KEY)) {
    throw new TypeError('exact evidence array elements are required');
  }
  return snapshotPlainData(descriptor.value, ancestors);
}

function snapshotArray(value, ancestors) {
  if (objectGetPrototypeOf(value) !== canonicalArrayPrototype) {
    throw new TypeError('canonical evidence array is required');
  }
  const lengthDescriptor =
    objectGetOwnPropertyDescriptor(value, ARRAY_LENGTH_KEY);
  const keys = reflectOwnKeys(value);
  if (!lengthDescriptor ||
      !objectHasOwn(lengthDescriptor, DATA_VALUE_KEY)) {
    throw new TypeError('dense evidence array is required');
  }
  const length = lengthDescriptor.value;
  if (!numberIsSafeInteger(length) || length < 0) {
    throw new TypeError('dense evidence array is required');
  }
  if (keys.length !== length + 1) {
    throw new TypeError('dense evidence array is required');
  }
  const copy = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === ARRAY_LENGTH_KEY) continue;
    objectDefineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value: snapshotArrayField(value, key, length, ancestors),
      writable: true,
    });
  }
  return copy;
}

function snapshotRecord(value, ancestors) {
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== canonicalObjectPrototype && prototype !== null) {
    throw new TypeError('plain evidence record is required');
  }
  const copy = objectCreate(null);
  const keys = reflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || descriptor?.enumerable !== true) {
      throw new TypeError('exact evidence record fields are required');
    }
    if (!objectHasOwn(descriptor, DATA_VALUE_KEY)) {
      throw new TypeError('exact evidence record fields are required');
    }
    copy[key] = snapshotPlainData(descriptor.value, ancestors);
  }
  return copy;
}

function snapshotPlainData(value, ancestors = new WeakSetConstructor()) {
  if (value === null) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (numberIsFinite(value)) return value;
    throw new TypeError('finite evidence numbers are required');
  }
  if (!value || typeof value !== 'object' || utilIsProxy(value)) {
    throw new TypeError('exact own plain evidence data is required');
  }
  if (reflectApply(weakSetHas, ancestors, [value])) {
    throw new TypeError('acyclic evidence data is required');
  }
  reflectApply(weakSetAdd, ancestors, [value]);
  try {
    return arrayIsArray(value) ?
      snapshotArray(value, ancestors) :
      snapshotRecord(value, ancestors);
  } finally {
    reflectApply(weakSetDelete, ancestors, [value]);
  }
}

function sortedOwnKeys(record) {
  const keys = reflectOwnKeys(record);
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

function canonicalPlainJson(value) {
  if (value === null || typeof value !== 'object') {
    return jsonStringify(value);
  }
  if (arrayIsArray(value)) {
    let text = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) text += ',';
      text += canonicalPlainJson(ownDataValue(value, String(index)));
    }
    return `${text}]`;
  }
  const keys = sortedOwnKeys(value);
  let text = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) text += ',';
    const key = keys[index];
    text += `${jsonStringify(key)}:` +
      canonicalPlainJson(ownDataValue(value, key));
  }
  return `${text}}`;
}

function plainDataEqual(left, right) {
  return canonicalPlainJson(left) === canonicalPlainJson(right);
}

function hasExactKeys(record, expectedKeys) {
  if (!record || typeof record !== 'object' || arrayIsArray(record)) {
    return false;
  }
  const keys = reflectOwnKeys(record);
  if (keys.length !== expectedKeys.length) return false;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (!objectHasOwn(record, expectedKeys[index])) return false;
  }
  return true;
}

function allArrayValues(values, predicate) {
  if (!arrayIsArray(values)) return false;
  for (let index = 0; index < values.length; index += 1) {
    if (!predicate(ownDataValue(values, String(index)), index)) return false;
  }
  return true;
}

function sameStringMembers(left, right) {
  if (!arrayIsArray(left) || !arrayIsArray(right) ||
      left.length !== right.length) {
    return false;
  }
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const candidate = ownDataValue(left, String(leftIndex));
    let matches = 0;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (candidate === ownDataValue(right, String(rightIndex))) matches += 1;
    }
    if (matches !== 1) return false;
  }
  for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
    const candidate = ownDataValue(right, String(rightIndex));
    let matches = 0;
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      if (candidate === ownDataValue(left, String(leftIndex))) matches += 1;
    }
    if (matches !== 1) return false;
  }
  return true;
}

function sha256(bytes) {
  return `${SHA256_PREFIX}${createHash(SHA256_ALGORITHM)
    .update(bytes)
    .digest(SHA256_ENCODING)}`;
}

function canonicalDigest(value) {
  return sha256(bufferFrom(canonicalPlainJson(value), BYTE_ENCODING));
}

function digestHex(digest) {
  return stringPart(digest, SHA256_PREFIX.length);
}

export {
  BYTE_ENCODING,
  DATA_VALUE_KEY,
  SHA256_PATTERN,
  SHA256_PREFIX,
  allArrayValues,
  arrayIsArray,
  bufferByteLength,
  bufferFrom,
  bufferIsBuffer,
  bufferToString,
  canonicalArrayPrototype,
  canonicalDigest,
  canonicalObjectPrototype,
  canonicalPlainJson,
  digestHex,
  hasExactKeys,
  jsonParse,
  jsonStringify,
  mathTrunc,
  numberIsFinite,
  numberIsSafeInteger,
  objectCreate,
  objectFreeze,
  objectGetOwnPropertyDescriptor,
  objectGetPrototypeOf,
  objectHasOwn,
  plainDataEqual,
  reflectApply,
  reflectOwnKeys,
  regexpMatches,
  sameStringMembers,
  sha256,
  snapshotPlainData,
  stringHasPrefix,
  stringPart,
  utilIsNativeError,
  utilIsProxy,
};
