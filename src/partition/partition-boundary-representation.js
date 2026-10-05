const PARTITION_BOUNDARY_KEY_TYPE = Object.freeze({
  INTEGER: 'INTEGER',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
});
const LOCAL_STR_STRING = 'string';
const ERROR_MISSING_AUTHORITY =
  'Partition boundary type authority is missing; revalidation required';
const ERROR_INVALID_INTEGER = 'Invalid INTEGER partition boundary representation';
const ERROR_INVALID_TEXT = 'Invalid TEXT partition boundary representation';
const ERROR_INVALID_BLOB = 'Invalid BLOB partition boundary representation';

function normalizePartitionBoundaryKeyType(value) {
  const type = typeof value === LOCAL_STR_STRING ? value.toUpperCase() : '';
  return Object.values(PARTITION_BOUNDARY_KEY_TYPE).includes(type) ? type : null;
}

function decodeIntegerBoundary(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === LOCAL_STR_STRING &&
      /^-?[0-9]+(?:[.]0+)?$/u.test(value)) {
    return BigInt(value.replace(/[.]0+$/u, ''));
  }
  throw new Error(ERROR_INVALID_INTEGER);
}

function decodeBlobBoundary(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === LOCAL_STR_STRING) return Buffer.from(value, 'base64');
  throw new Error(ERROR_INVALID_BLOB);
}

function decodePartitionBoundaryValue(value, keyType) {
  if (value === null || value === undefined) return value;
  const type = normalizePartitionBoundaryKeyType(keyType);
  if (!type) throw new Error(ERROR_MISSING_AUTHORITY);
  if (type === PARTITION_BOUNDARY_KEY_TYPE.INTEGER) {
    return decodeIntegerBoundary(value);
  }
  if (type === PARTITION_BOUNDARY_KEY_TYPE.TEXT) {
    if (typeof value !== LOCAL_STR_STRING) throw new Error(ERROR_INVALID_TEXT);
    return value;
  }
  return decodeBlobBoundary(value);
}

export {
  PARTITION_BOUNDARY_KEY_TYPE,
  decodePartitionBoundaryValue,
  normalizePartitionBoundaryKeyType,
};
