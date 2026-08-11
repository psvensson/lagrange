import {types} from 'node:util';

const ARRAY_LENGTH_FIELD = 'length';
const DESCRIPTOR_VALUE_FIELD = 'value';
const arrayIsArray = Array.isArray;
const canonicalArrayPrototype = Array.prototype;
const canonicalObjectPrototype = Object.prototype;
const isProxy = types.isProxy.bind(types);
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const reflectOwnKeys = Reflect.ownKeys;

function appendOwnArrayValue(array, value) {
  objectDefineProperty(array, array.length, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function copyDenseOwnDataArray(value) {
  if (isProxy(value) ||
      !arrayIsArray(value) ||
      objectGetPrototypeOf(value) !== canonicalArrayPrototype) {
    return null;
  }
  const lengthDescriptor = objectGetOwnPropertyDescriptor(
    value,
    ARRAY_LENGTH_FIELD,
  );
  const length = lengthDescriptor &&
    objectHasOwn(lengthDescriptor, DESCRIPTOR_VALUE_FIELD) ?
    lengthDescriptor.value :
    null;
  if (!numberIsSafeInteger(length) || length < 0) {
    return null;
  }
  const copy = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, index);
    if (!descriptor ||
        !objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD)) {
      return null;
    }
    appendOwnArrayValue(copy, descriptor.value);
  }
  return copy;
}

function isSupportedOwnDataDescriptor(key, descriptor) {
  return typeof key === 'string' &&
    descriptor?.enumerable === true &&
    objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD);
}

function copyStrictOwnDataRecord(value) {
  if (!value ||
      typeof value !== 'object' ||
      isProxy(value) ||
      arrayIsArray(value)) {
    return null;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== canonicalObjectPrototype && prototype !== null) {
    return null;
  }
  let keys;
  try {
    keys = reflectOwnKeys(value);
  } catch {
    return null;
  }
  const copy = objectCreate(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!isSupportedOwnDataDescriptor(key, descriptor)) {
      return null;
    }
    objectDefineProperty(copy, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function copyDenseOwnDataRecordArray(value) {
  const rows = copyDenseOwnDataArray(value);
  if (rows === null) {
    return null;
  }
  const copies = [];
  for (let index = 0; index < rows.length; index += 1) {
    const copy = copyStrictOwnDataRecord(rows[index]);
    if (copy === null) {
      return null;
    }
    appendOwnArrayValue(copies, copy);
  }
  return copies;
}

export {
  copyDenseOwnDataArray,
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
};
