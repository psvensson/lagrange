const arrayIsArray = Array.isArray;
const MapConstructor = Map;
const mapGetMethod = Map.prototype.get;
const mapHasMethod = Map.prototype.has;
const mapSetMethod = Map.prototype.set;
const numberIsSafeInteger = Number.isSafeInteger;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const canonicalArrayPrototype = Array.prototype;
const canonicalObjectPrototype = Object.prototype;
const MAXIMUM_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const EMPTY_TABLE_VALUE = 0;
const ARRAY_LENGTH_KEY = 'length';
const DATA_VALUE_KEY = 'value';
const FIRST_DIGIT = '0';
const LAST_DIGIT = '9';
const SIGNED_INT32_MINIMUM = -2_147_483_648;
const SIGNED_INT32_MAXIMUM = 2_147_483_647;
const UNSIGNED_INT32_MAXIMUM = 4_294_967_295;
const INDEXED_ROW_ESTIMATED_BYTES = 128;
const TABLE_READ_INDEX_ERROR = Object.freeze({
  BOUND_EXCEEDED: 'request Cell table read bound exceeded',
  BOUND_INVALID: 'request Cell table read bound must be a safe integer',
  READS_INVALID: 'request Cell table reads must be an array',
  ROW_INVALID: 'request Cell table row is invalid',
  SNAPSHOT_INVALID: 'request Cell table snapshot is invalid',
});

class RequestCellTableReadBoundError extends RangeError {
  constructor(actualRows, maximumRows) {
    super(TABLE_READ_INDEX_ERROR.BOUND_EXCEEDED);
    this.actualRows = actualRows;
    this.maximumRows = maximumRows;
  }
}

function appendOwnArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
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

function hasCanonicalArrayLength(value) {
  const descriptor =
    objectGetOwnPropertyDescriptor(value, ARRAY_LENGTH_KEY);
  return Boolean(
    descriptor &&
    objectHasOwn(descriptor, DATA_VALUE_KEY) &&
    descriptor.value === value.length,
  );
}

function hasCanonicalArrayElement(value, key) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  return isCanonicalArrayIndex(key, value.length) &&
    descriptor?.enumerable === true &&
    objectHasOwn(descriptor, DATA_VALUE_KEY);
}

function isDenseDataArray(value) {
  if (
    !arrayIsArray(value) ||
    objectGetPrototypeOf(value) !== canonicalArrayPrototype
  ) {
    return false;
  }
  if (!hasCanonicalArrayLength(value)) return false;
  const keys = reflectOwnKeys(value);
  if (keys.length !== value.length + 1) return false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === ARRAY_LENGTH_KEY) continue;
    if (
      key !== ARRAY_LENGTH_KEY &&
      !hasCanonicalArrayElement(value, key)
    ) {
      return false;
    }
  }
  return true;
}

function isPlainDataRecord(value) {
  if (!value || typeof value !== 'object' || arrayIsArray(value)) return false;
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== canonicalObjectPrototype && prototype !== null) return false;
  const keys = reflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string') return false;
    const descriptor = objectGetOwnPropertyDescriptor(value, keys[index]);
    if (
      descriptor?.enumerable !== true ||
      !objectHasOwn(descriptor, DATA_VALUE_KEY)
    ) {
      return false;
    }
  }
  return true;
}

function isUnsignedInt32(value) {
  return typeof value === 'number' &&
    numberIsSafeInteger(value) &&
    value >= 0 &&
    value <= UNSIGNED_INT32_MAXIMUM &&
    !objectIs(value, -0);
}

function isSignedInt32(value) {
  return typeof value === 'number' &&
    numberIsSafeInteger(value) &&
    value >= SIGNED_INT32_MINIMUM &&
    value <= SIGNED_INT32_MAXIMUM &&
    !objectIs(value, -0);
}

function requestCellTableIndexRowBound(contextBytes) {
  if (!numberIsSafeInteger(contextBytes) || contextBytes < 0) {
    throw new TypeError(TABLE_READ_INDEX_ERROR.BOUND_INVALID);
  }
  return Math.floor(contextBytes / INDEXED_ROW_ESTIMATED_BYTES);
}

function requestCellTableIndexEstimatedBytes(rowCount) {
  if (!numberIsSafeInteger(rowCount) || rowCount < 0) {
    throw new TypeError(TABLE_READ_INDEX_ERROR.BOUND_INVALID);
  }
  return rowCount * INDEXED_ROW_ESTIMATED_BYTES;
}

function readSnapshot(snapshot) {
  const context = isPlainDataRecord(snapshot) ?
    ownDataValue(snapshot, 'context') :
    undefined;
  const rows = isPlainDataRecord(snapshot) ?
    ownDataValue(snapshot, 'rows') :
    undefined;
  if (typeof context !== 'string' || !isDenseDataArray(rows)) {
    throw new TypeError(TABLE_READ_INDEX_ERROR.SNAPSHOT_INVALID);
  }
  return {context, rows};
}

function mapHas(map, key) {
  return reflectApply(mapHasMethod, map, [key]);
}

function mapSet(map, key, value) {
  reflectApply(mapSetMethod, map, [key, value]);
}

function mapGet(map, key) {
  return reflectApply(mapGetMethod, map, [key]);
}

function indexSnapshotRows(snapshotRows) {
  const rows = new MapConstructor();
  for (let rowIndex = 0; rowIndex < snapshotRows.length; rowIndex += 1) {
    const row = ownDataValue(snapshotRows, String(rowIndex));
    const key = isPlainDataRecord(row) ? ownDataValue(row, 'key') : undefined;
    const value = isPlainDataRecord(row) ?
      ownDataValue(row, 'value') :
      undefined;
    if (!isUnsignedInt32(key) || !isSignedInt32(value)) {
      throw new TypeError(TABLE_READ_INDEX_ERROR.ROW_INVALID);
    }
    if (!mapHas(rows, key)) mapSet(rows, key, value);
  }
  return rows;
}

function indexRequestCellTableReads(
  tableReads,
  maximumRows = MAXIMUM_SAFE_INTEGER,
) {
  if (!isDenseDataArray(tableReads)) {
    throw new TypeError(TABLE_READ_INDEX_ERROR.READS_INVALID);
  }
  if (!numberIsSafeInteger(maximumRows) || maximumRows < 0) {
    throw new TypeError(TABLE_READ_INDEX_ERROR.BOUND_INVALID);
  }
  const indexed = [];
  let totalRows = 0;
  for (let snapshotIndex = 0;
    snapshotIndex < tableReads.length;
    snapshotIndex += 1) {
    const snapshot = readSnapshot(
      ownDataValue(tableReads, String(snapshotIndex)),
    );
    totalRows += snapshot.rows.length;
    if (totalRows > maximumRows) {
      throw new RequestCellTableReadBoundError(totalRows, maximumRows);
    }
    appendOwnArrayValue(indexed, objectFreeze({
      context: snapshot.context,
      rows: indexSnapshotRows(snapshot.rows),
    }));
  }
  return indexed;
}

function readIndexedRequestCellTable(indexedReads, context, key) {
  for (let index = 0; index < indexedReads.length; index += 1) {
    const snapshot = indexedReads[index];
    if (snapshot.context !== context) continue;
    const value = mapGet(snapshot.rows, key);
    return value ?? EMPTY_TABLE_VALUE;
  }
  return EMPTY_TABLE_VALUE;
}

export {
  INDEXED_ROW_ESTIMATED_BYTES,
  RequestCellTableReadBoundError,
  indexRequestCellTableReads,
  readIndexedRequestCellTable,
  requestCellTableIndexEstimatedBytes,
  requestCellTableIndexRowBound,
};
