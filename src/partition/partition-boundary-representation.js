const PARTITION_BOUNDARY_KEY_TYPE = Object.freeze({
  INTEGER: 'INTEGER',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
});

function normalizePartitionBoundaryKeyType(value) {
  const type = typeof value === 'string' ? value.toUpperCase() : '';
  return Object.values(PARTITION_BOUNDARY_KEY_TYPE).includes(type) ? type : null;
}

function decodePartitionBoundaryValue(value, keyType) {
  if (value === null || value === undefined) return value;
  const type = normalizePartitionBoundaryKeyType(keyType);
  if (!type) {
    throw new Error('Partition boundary type authority is missing; revalidation required');
  }
  if (type === PARTITION_BOUNDARY_KEY_TYPE.INTEGER) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) {
      return BigInt(value);
    }
    if (typeof value === 'string' && /^-?[0-9]+(?:[.]0+)?$/u.test(value)) {
      return BigInt(value.replace(/[.]0+$/u, ''));
    }
    throw new Error('Invalid INTEGER partition boundary representation');
  }
  if (type === PARTITION_BOUNDARY_KEY_TYPE.TEXT) {
    if (typeof value !== 'string') {
      throw new Error('Invalid TEXT partition boundary representation');
    }
    return value;
  }
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'base64');
  throw new Error('Invalid BLOB partition boundary representation');
}

export {
  PARTITION_BOUNDARY_KEY_TYPE,
  decodePartitionBoundaryValue,
  normalizePartitionBoundaryKeyType,
};
