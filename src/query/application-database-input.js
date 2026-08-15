import {Buffer} from 'node:buffer';
import {types as utilTypes} from 'node:util';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
  APPLICATION_DATABASE_LIMIT,
} from './application-database-constants.js';
import {createApplicationDatabaseError} from './application-database-error.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_VALUE = 'value';
const APPLICATION_ID_PROPERTY = 'applicationId';
const ArrayConstructor = Array;
const objectPrototype = Object.prototype;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'buffer',
).get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
).get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset',
).get;
const arrayIsArray = Array.isArray;
const bufferFrom = Buffer.from;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const {isProxy, isSharedArrayBuffer, isUint8Array} = utilTypes;

function snapshotApplicationDatabaseOpenOptions(options) {
  if (
    options === null ||
    typeof options !== 'object' ||
    isProxy(options) ||
    arrayIsArray(options)
  ) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.APPLICATION_ID_REQUIRED);
  }
  const prototype = objectGetPrototypeOf(options);
  const keys = reflectOwnKeys(options);
  if (
    (prototype !== objectPrototype && prototype !== null) ||
    keys.length !== LOCAL_NUM_ONE ||
    keys[LOCAL_NUM_ZERO] !== APPLICATION_ID_PROPERTY
  ) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.APPLICATION_ID_REQUIRED);
  }
  const descriptor = objectGetOwnPropertyDescriptor(
    options,
    APPLICATION_ID_PROPERTY,
  );
  if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.APPLICATION_ID_REQUIRED);
  }
  return snapshotApplicationId(descriptor.value);
}

function invalidArgument(message) {
  throw createApplicationDatabaseError(
    APPLICATION_DATABASE_ERROR_CODE.INVALID_ARGUMENT,
    message,
  );
}

function snapshotApplicationId(value) {
  if (
    typeof value !== LOCAL_STR_STRING ||
    value.length === LOCAL_NUM_ZERO ||
    value.length > APPLICATION_DATABASE_LIMIT.APPLICATION_ID_LENGTH
  ) {
    throw createApplicationDatabaseError(
      APPLICATION_DATABASE_ERROR_CODE.APPLICATION_ID_REQUIRED,
      APPLICATION_DATABASE_ERROR_MSG.APPLICATION_ID_REQUIRED,
    );
  }
  return value;
}

function snapshotSql(value) {
  if (
    typeof value !== LOCAL_STR_STRING ||
    value.length === LOCAL_NUM_ZERO ||
    value.length > APPLICATION_DATABASE_LIMIT.SQL_LENGTH
  ) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_QUERY);
  }
  return value;
}

function copyByteValue(value) {
  if (isProxy(value) || !isUint8Array(value)) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
  let buffer;
  let byteLength;
  let byteOffset;
  try {
    buffer = reflectApply(typedArrayBufferGetter, value, []);
    byteLength = reflectApply(typedArrayByteLengthGetter, value, []);
    byteOffset = reflectApply(typedArrayByteOffsetGetter, value, []);
  } catch {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
  if (
    isSharedArrayBuffer(buffer) ||
    byteLength > APPLICATION_DATABASE_LIMIT.BYTE_BIND_LENGTH
  ) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
  try {
    const view = reflectApply(bufferFrom, Buffer, [
      buffer,
      byteOffset,
      byteLength,
    ]);
    return reflectApply(bufferFrom, Buffer, [view]);
  } catch {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
}

function snapshotBindValue(value) {
  if (value === null) return null;
  if (typeof value === LOCAL_STR_STRING) {
    if (value.length > APPLICATION_DATABASE_LIMIT.STRING_BIND_LENGTH) {
      invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? LOCAL_NUM_ONE : LOCAL_NUM_ZERO;
  }
  if (typeof value === 'number') {
    if (!numberIsFinite(value) || !numberIsSafeInteger(value)) {
      invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
    }
    return objectIs(value, -LOCAL_NUM_ZERO) ? LOCAL_NUM_ZERO : value;
  }
  if (isUint8Array(value)) return copyByteValue(value);
  invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
}

function defineArrayValue(target, index, value) {
  reflectApply(objectDefineProperty, Object, [target, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function snapshotParams(params) {
  if (isProxy(params) || !arrayIsArray(params)) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
  const lengthDescriptor = objectGetOwnPropertyDescriptor(params, 'length');
  if (!lengthDescriptor || !objectHasOwn(lengthDescriptor, LOCAL_STR_VALUE)) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
  const length = lengthDescriptor.value;
  if (length > APPLICATION_DATABASE_LIMIT.PARAMETER_COUNT) {
    invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
  }
  const snapshot = new ArrayConstructor(length);
  for (let index = LOCAL_NUM_ZERO; index < length; index++) {
    const descriptor = objectGetOwnPropertyDescriptor(params, index);
    if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
      invalidArgument(APPLICATION_DATABASE_ERROR_MSG.INVALID_PARAMS);
    }
    defineArrayValue(snapshot, index, snapshotBindValue(descriptor.value));
  }
  return objectFreeze(snapshot);
}

export {
  snapshotApplicationDatabaseOpenOptions,
  snapshotApplicationId,
  snapshotParams,
  snapshotSql,
};
