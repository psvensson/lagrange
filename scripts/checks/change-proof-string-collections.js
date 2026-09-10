// Intrinsic-independent ordered string collections for change-proof authority.
//
// The selector runs inside a JavaScript realm that repository code can have
// modified before a proof decision. Native Map/Set and Array iteration methods
// are therefore not authorities for what changed or what must run. These
// collections use own data on null-prototype records plus indexed array access;
// no mutable collection prototype participates in membership, iteration,
// deduplication, or sorting.

const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const setHas = Function.call.bind(Set.prototype.has);

const FIELD_KEYS = 'keys';
const FIELD_LENGTH = 'length';
const FIELD_MEMBERS = 'members';
const FIELD_SIZE = 'size';
const FIELD_VALUES = 'values';
const FIELD_WRITABLE = 'writable';
const FIELD_VALUE = 'value';
const orderedStringSetMarker = Symbol('ordered-string-set');

function defineOwnValue(target, key, value, writable = false) {
  objectDefineProperty(target, key, {
    configurable: false,
    enumerable: true,
    [FIELD_WRITABLE]: writable,
    [FIELD_VALUE]: value,
  });
}

function appendArrayValue(array, value) {
  defineOwnValue(array, array.length, value, true);
}

function appendArrayValues(target, source) {
  for (let index = 0; index < source.length; index += 1) {
    appendArrayValue(target, source[index]);
  }
  return target;
}

function copyArrayValues(source) {
  return appendArrayValues([], source);
}

function copyOwnDataRecord(value) {
  if (!value || typeof value !== 'object' || arrayIsArray(value)) return null;
  const copy = objectCreate(null);
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true ||
        !objectHasOwn(descriptor, FIELD_VALUE)) {
      return null;
    }
    objectDefineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptor.value,
    });
  }
  return copy;
}

// External arrays participate in proof authority only through own data
// entries. Indexed descriptor reads avoid inherited indices, accessors, and a
// hostile iterator; the returned array is a detached own-data copy.
function copyOwnDataArray(source) {
  if (!arrayIsArray(source)) return null;
  const lengthDescriptor = objectGetOwnPropertyDescriptor(source, FIELD_LENGTH);
  const length = lengthDescriptor?.value;
  if (!lengthDescriptor ||
      !objectHasOwn(lengthDescriptor, FIELD_VALUE) ||
      !numberIsSafeInteger(length) || length < 0) {
    return null;
  }
  const copy = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(source, index);
    if (!descriptor || descriptor.enumerable !== true ||
        !objectHasOwn(descriptor, FIELD_VALUE)) {
      return null;
    }
    appendArrayValue(copy, descriptor.value);
  }
  return copy;
}

function copyOwnStringArray(source) {
  const copy = copyOwnDataArray(source);
  if (!copy) return null;
  for (let index = 0; index < copy.length; index += 1) {
    if (typeof copy[index] !== 'string' || copy[index].length === 0) return null;
  }
  return copy;
}

function createOrderedStringSet(initialValues = []) {
  const state = objectCreate(null);
  defineOwnValue(state, orderedStringSetMarker, true);
  defineOwnValue(state, FIELD_MEMBERS, objectCreate(null));
  defineOwnValue(state, FIELD_VALUES, []);
  defineOwnValue(state, FIELD_SIZE, 0, true);
  for (let index = 0; index < initialValues.length; index += 1) {
    orderedStringSetAdd(state, initialValues[index]);
  }
  return state;
}

function isOrderedStringSet(value) {
  return value?.[orderedStringSetMarker] === true;
}

function orderedStringSetAdd(state, value) {
  if (objectHasOwn(state[FIELD_MEMBERS], value)) return state;
  defineOwnValue(state[FIELD_MEMBERS], value, true);
  appendArrayValue(state[FIELD_VALUES], value);
  state[FIELD_SIZE] += 1;
  return state;
}

function orderedStringSetHas(state, value) {
  return objectHasOwn(state[FIELD_MEMBERS], value);
}

function orderedStringSetValues(state) {
  return state[FIELD_VALUES];
}

function stringCollectionHas(collection, value) {
  if (isOrderedStringSet(collection)) {
    return orderedStringSetHas(collection, value);
  }
  if (arrayIsArray(collection)) {
    for (let index = 0; index < collection.length; index += 1) {
      if (collection[index] === value) return true;
    }
    return false;
  }
  return setHas(collection, value);
}

function createOrderedStringMap() {
  const state = objectCreate(null);
  defineOwnValue(state, FIELD_KEYS, []);
  defineOwnValue(state, FIELD_VALUES, objectCreate(null));
  return state;
}

function orderedStringMapHas(state, key) {
  return objectHasOwn(state[FIELD_VALUES], key);
}

function orderedStringMapGet(state, key) {
  return orderedStringMapHas(state, key) ? state[FIELD_VALUES][key] : undefined;
}

function orderedStringMapSet(state, key, value) {
  if (!orderedStringMapHas(state, key)) {
    appendArrayValue(state[FIELD_KEYS], key);
  }
  defineOwnValue(state[FIELD_VALUES], key, value, true);
  return state;
}

function orderedStringMapKeys(state) {
  return state[FIELD_KEYS];
}

function orderedStringMapValues(state) {
  const values = [];
  const keys = orderedStringMapKeys(state);
  for (let index = 0; index < keys.length; index += 1) {
    appendArrayValue(values, orderedStringMapGet(state, keys[index]));
  }
  return values;
}

function sortStrings(values) {
  const sorted = copyArrayValues(values);
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    let insertionIndex = index;
    while (insertionIndex > 0 && sorted[insertionIndex - 1] > current) {
      sorted[insertionIndex] = sorted[insertionIndex - 1];
      insertionIndex -= 1;
    }
    sorted[insertionIndex] = current;
  }
  return sorted;
}

function sortByStringProjection(values, project) {
  const sorted = copyArrayValues(values);
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const currentKey = project(current);
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      project(sorted[insertionIndex - 1]) > currentKey
    ) {
      sorted[insertionIndex] = sorted[insertionIndex - 1];
      insertionIndex -= 1;
    }
    sorted[insertionIndex] = current;
  }
  return sorted;
}

export {
  appendArrayValue,
  appendArrayValues,
  copyArrayValues,
  copyOwnDataArray,
  copyOwnDataRecord,
  copyOwnStringArray,
  createOrderedStringMap,
  createOrderedStringSet,
  orderedStringMapGet,
  orderedStringMapHas,
  orderedStringMapKeys,
  orderedStringMapSet,
  orderedStringMapValues,
  orderedStringSetAdd,
  orderedStringSetHas,
  orderedStringSetValues,
  sortByStringProjection,
  sortStrings,
  stringCollectionHas,
};
