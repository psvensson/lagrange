import {types as utilTypes} from 'node:util';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
} from './query/application-database-constants.js';
import {createApplicationDatabaseError} from
  './query/application-database-error.js';

const CONFIGURATION_LIMIT = Object.freeze({
  ARRAY_LENGTH: 10000,
  DEPTH: 64,
  PROPERTY_COUNT: 10000,
  STRING_LENGTH: 16 * 1024 * 1024,
});
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_VALUE = 'value';
const CONFIGURATION_PROPERTY = 'configuration';
const DANGEROUS_CONFIGURATION_KEY = Object.freeze({
  CONSTRUCTOR: 'constructor',
  PROTOTYPE: 'prototype',
  PROTO_SETTER: '__proto__',
});
const ArrayConstructor = Array;
const WeakSetConstructor = WeakSet;
const objectPrototype = Object.prototype;
const arrayIsArray = Array.isArray;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const weakSetAdd = WeakSet.prototype.add;
const weakSetDelete = WeakSet.prototype.delete;
const weakSetHas = WeakSet.prototype.has;
const {isProxy} = utilTypes;

function isDangerousKey(key) {
  return key === DANGEROUS_CONFIGURATION_KEY.PROTO_SETTER ||
    key === DANGEROUS_CONFIGURATION_KEY.CONSTRUCTOR ||
    key === DANGEROUS_CONFIGURATION_KEY.PROTOTYPE;
}

function invalidConfiguration() {
  throw createApplicationDatabaseError(
    APPLICATION_DATABASE_ERROR_CODE.INVALID_ARGUMENT,
    APPLICATION_DATABASE_ERROR_MSG.INVALID_CONFIGURATION,
    {operation: CONFIGURATION_PROPERTY},
  );
}

function snapshotConfigurationPrimitive(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > CONFIGURATION_LIMIT.STRING_LENGTH) invalidConfiguration();
    return value;
  }
  if (typeof value === 'number') {
    if (!numberIsFinite(value) || !numberIsSafeInteger(value)) {
      invalidConfiguration();
    }
    return objectIs(value, -LOCAL_NUM_ZERO) ? LOCAL_NUM_ZERO : value;
  }
  return undefined;
}

function defineArrayValue(target, index, value) {
  reflectApply(objectDefineProperty, Object, [target, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  }]);
}

function snapshotConfigurationArray(value, seen, depth) {
  const lengthDescriptor = objectGetOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !objectHasOwn(lengthDescriptor, LOCAL_STR_VALUE)) {
    invalidConfiguration();
  }
  const length = lengthDescriptor.value;
  if (length > CONFIGURATION_LIMIT.ARRAY_LENGTH) invalidConfiguration();
  const snapshot = new ArrayConstructor(length);
  for (let index = LOCAL_NUM_ZERO; index < length; index++) {
    const descriptor = objectGetOwnPropertyDescriptor(value, index);
    if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
      invalidConfiguration();
    }
    defineArrayValue(
      snapshot,
      index,
      snapshotConfigurationValue(descriptor.value, seen, depth + 1),
    );
  }
  return objectFreeze(snapshot);
}

function snapshotConfigurationRecord(value, seen, depth) {
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) {
    invalidConfiguration();
  }
  const keys = reflectOwnKeys(value);
  if (keys.length > CONFIGURATION_LIMIT.PROPERTY_COUNT) invalidConfiguration();
  const snapshot = objectCreate(null);
  for (let index = LOCAL_NUM_ZERO; index < keys.length; index++) {
    const key = keys[index];
    if (typeof key !== 'string' || isDangerousKey(key)) {
      invalidConfiguration();
    }
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
      invalidConfiguration();
    }
    snapshot[key] = snapshotConfigurationValue(
      descriptor.value,
      seen,
      depth + 1,
    );
  }
  return objectFreeze(snapshot);
}

function snapshotConfigurationValue(value, seen, depth) {
  if (depth > CONFIGURATION_LIMIT.DEPTH) invalidConfiguration();
  const primitive = snapshotConfigurationPrimitive(value);
  if (primitive !== undefined) return primitive;
  if (
    typeof value !== 'object' ||
    isProxy(value) ||
    reflectApply(weakSetHas, seen, [value])
  ) {
    invalidConfiguration();
  }
  reflectApply(weakSetAdd, seen, [value]);
  try {
    if (arrayIsArray(value)) {
      return snapshotConfigurationArray(value, seen, depth);
    }
    return snapshotConfigurationRecord(value, seen, depth);
  } finally {
    reflectApply(weakSetDelete, seen, [value]);
  }
}

function snapshotEmbeddedConfiguration(configuration) {
  if (
    configuration === null ||
    typeof configuration !== 'object' ||
    isProxy(configuration) ||
    arrayIsArray(configuration)
  ) {
    invalidConfiguration();
  }
  return snapshotConfigurationValue(
    configuration,
    new WeakSetConstructor(),
    LOCAL_NUM_ZERO,
  );
}

function snapshotEmbeddedFactoryConfiguration(options) {
  if (
    options === null ||
    typeof options !== 'object' ||
    isProxy(options) ||
    arrayIsArray(options)
  ) {
    invalidConfiguration();
  }
  const prototype = objectGetPrototypeOf(options);
  if (prototype !== objectPrototype && prototype !== null) {
    invalidConfiguration();
  }
  const keys = reflectOwnKeys(options);
  if (keys.length === LOCAL_NUM_ZERO) {
    return snapshotEmbeddedConfiguration(objectCreate(null));
  }
  if (keys.length !== 1 || keys[LOCAL_NUM_ZERO] !== CONFIGURATION_PROPERTY) {
    invalidConfiguration();
  }
  const descriptor = objectGetOwnPropertyDescriptor(
    options,
    CONFIGURATION_PROPERTY,
  );
  if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
    invalidConfiguration();
  }
  return snapshotEmbeddedConfiguration(descriptor.value);
}

function snapshotEmbeddedEnvironment(environment = process.env) {
  const snapshot = objectCreate(null);
  const keys = objectKeys(environment);
  for (let index = LOCAL_NUM_ZERO; index < keys.length; index++) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(environment, key);
    if (descriptor && typeof descriptor.value === 'string') {
      snapshot[key] = descriptor.value;
    }
  }
  return objectFreeze(snapshot);
}

export {
  snapshotEmbeddedConfiguration,
  snapshotEmbeddedEnvironment,
  snapshotEmbeddedFactoryConfiguration,
};
