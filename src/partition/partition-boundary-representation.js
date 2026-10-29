/**
 * Single owner for partition boundary representation and declared primary-key metadata.
 * Stage A requirement (Quest partition-key-ordering-owner-completion):
 * - Validates and decodes typed boundary values (INTEGER, REAL, TEXT, BLOB, COMPOSITE).
 * - Preserves 64-bit BigInt precision for integer partition boundaries.
 * - Resolves declared primary/partition key columns without any fallback to ['id'].
 * - Fails closed when partition boundary type authority is missing or mismatched.
 */

import {
  BOUNDARY_ENCODING,
  PARTITION_BOUNDARY_KEY_TYPE,
  SQL_TYPE_NAME,
} from './partition-boundary-constants.js';

export {PARTITION_BOUNDARY_KEY_TYPE};

const INTEGER_STRING_PATTERN = /^-?[0-9]+(?:[.]0+)?$/u;
const REAL_STRING_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/u;
const TRAILING_ZERO_DECIMAL_PATTERN = /[.]0+$/u;

const LOCAL_ERR_MSG = Object.freeze({
  TYPE_AUTHORITY_MISSING: 'Partition boundary type authority is missing; revalidation required',
  INVALID_INTEGER: 'Invalid INTEGER partition boundary representation',
  INVALID_REAL: 'Invalid REAL partition boundary representation',
  INVALID_TEXT: 'Invalid TEXT partition boundary representation',
  INVALID_BLOB: 'Invalid BLOB partition boundary representation',
  INVALID_COMPOSITE: 'Invalid COMPOSITE partition boundary representation',
});

const TYPE_NAME_MAP = new Map([
  [SQL_TYPE_NAME.INTEGER, PARTITION_BOUNDARY_KEY_TYPE.INTEGER],
  [SQL_TYPE_NAME.INT, PARTITION_BOUNDARY_KEY_TYPE.INTEGER],
  [SQL_TYPE_NAME.BIGINT, PARTITION_BOUNDARY_KEY_TYPE.INTEGER],
  [SQL_TYPE_NAME.SMALLINT, PARTITION_BOUNDARY_KEY_TYPE.INTEGER],
  [SQL_TYPE_NAME.TINYINT, PARTITION_BOUNDARY_KEY_TYPE.INTEGER],
  [SQL_TYPE_NAME.REAL, PARTITION_BOUNDARY_KEY_TYPE.REAL],
  [SQL_TYPE_NAME.FLOAT, PARTITION_BOUNDARY_KEY_TYPE.REAL],
  [SQL_TYPE_NAME.DOUBLE, PARTITION_BOUNDARY_KEY_TYPE.REAL],
  [SQL_TYPE_NAME.NUMERIC, PARTITION_BOUNDARY_KEY_TYPE.REAL],
  [SQL_TYPE_NAME.DECIMAL, PARTITION_BOUNDARY_KEY_TYPE.REAL],
  [SQL_TYPE_NAME.TEXT, PARTITION_BOUNDARY_KEY_TYPE.TEXT],
  [SQL_TYPE_NAME.VARCHAR, PARTITION_BOUNDARY_KEY_TYPE.TEXT],
  [SQL_TYPE_NAME.CHAR, PARTITION_BOUNDARY_KEY_TYPE.TEXT],
  [SQL_TYPE_NAME.CLOB, PARTITION_BOUNDARY_KEY_TYPE.TEXT],
  [SQL_TYPE_NAME.BLOB, PARTITION_BOUNDARY_KEY_TYPE.BLOB],
  [SQL_TYPE_NAME.COMPOSITE, PARTITION_BOUNDARY_KEY_TYPE.COMPOSITE],
]);

/**
 * Normalize an external/declared column or boundary type string.
 * @param {string|null|undefined} value
 * @return {string|null}
 */
export function normalizePartitionBoundaryKeyType(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return TYPE_NAME_MAP.get(value.trim().toUpperCase()) || null;
}

function isValidCompositeElement(item) {
  if (typeof item === 'bigint') return true;
  if (typeof item === 'number' && Number.isFinite(item)) return true;
  if (typeof item === 'string') return true;
  if (Buffer.isBuffer(item)) return true;
  return false;
}

function validateCompositeArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(LOCAL_ERR_MSG.INVALID_COMPOSITE);
  }
  for (const item of arr) {
    if (!isValidCompositeElement(item)) {
      throw new Error(LOCAL_ERR_MSG.INVALID_COMPOSITE);
    }
  }
  return arr;
}

function decodeIntegerValue(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string' && INTEGER_STRING_PATTERN.test(value)) {
    return BigInt(value.replace(TRAILING_ZERO_DECIMAL_PATTERN, ''));
  }
  throw new Error(LOCAL_ERR_MSG.INVALID_INTEGER);
}

function decodeRealValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' &&
      REAL_STRING_PATTERN.test(value) &&
      Number.isFinite(Number(value))) {
    return Number(value);
  }
  throw new Error(LOCAL_ERR_MSG.INVALID_REAL);
}

function decodeTextValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(LOCAL_ERR_MSG.INVALID_TEXT);
}

function decodeBlobValue(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return Buffer.from(value, BOUNDARY_ENCODING.BASE64);
  }
  throw new Error(LOCAL_ERR_MSG.INVALID_BLOB);
}

function decodeCompositeValue(value) {
  if (Array.isArray(value)) {
    return validateCompositeArray(value);
  }
  if (typeof value === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(LOCAL_ERR_MSG.INVALID_COMPOSITE);
    }
    return validateCompositeArray(parsed);
  }
  throw new Error(LOCAL_ERR_MSG.INVALID_COMPOSITE);
}

const BOUNDARY_DECODERS = {
  [PARTITION_BOUNDARY_KEY_TYPE.INTEGER]: decodeIntegerValue,
  [PARTITION_BOUNDARY_KEY_TYPE.REAL]: decodeRealValue,
  [PARTITION_BOUNDARY_KEY_TYPE.TEXT]: decodeTextValue,
  [PARTITION_BOUNDARY_KEY_TYPE.BLOB]: decodeBlobValue,
  [PARTITION_BOUNDARY_KEY_TYPE.COMPOSITE]: decodeCompositeValue,
};

/**
 * Decode a persisted or raw boundary value into its canonical typed representation.
 * @param {*} value - Persisted or passed boundary value.
 * @param {string} keyType - Declared boundary key type.
 * @return {*} Decoded typed value, or null/undefined if unbounded edge.
 */
export function decodePartitionBoundaryValue(value, keyType) {
  if (value === null || value === undefined) {
    return value;
  }

  const normalizedKeyType = normalizePartitionBoundaryKeyType(keyType);
  const decoder = normalizedKeyType ? BOUNDARY_DECODERS[normalizedKeyType] : null;
  if (!decoder) {
    throw new Error(LOCAL_ERR_MSG.TYPE_AUTHORITY_MISSING);
  }
  return decoder(value);
}

function parseSchemaIfJson(schemaOrDefinition) {
  if (!schemaOrDefinition) return null;
  if (typeof schemaOrDefinition === 'object') return schemaOrDefinition;
  if (typeof schemaOrDefinition === 'string') {
    try {
      return JSON.parse(schemaOrDefinition);
    } catch {
      return null;
    }
  }
  return null;
}

function resolveTableSchemaRaw(tableInfo) {
  if (!tableInfo) return null;
  return tableInfo.schema ?? tableInfo.schema_definition ?? tableInfo.schemaDefinition ?? null;
}

function resolveRawPartitionKey(tableInfo) {
  if (!tableInfo) return null;
  return tableInfo.partition_key ?? tableInfo.partitionKey ?? null;
}

function resolveRawPrimaryKey(tableInfo) {
  if (!tableInfo) return null;
  return tableInfo.primaryKey ?? tableInfo.primary_key ?? null;
}

function resolveOptionsKeyColumns(options) {
  if (options && Array.isArray(options.keyColumns) && options.keyColumns.length > 0) {
    return options.keyColumns.map(String);
  }
  return null;
}

function normalizeKeyList(rawKey) {
  if (Array.isArray(rawKey) && rawKey.length > 0) {
    const filtered = rawKey.filter(Boolean).map(String);
    if (filtered.length > 0) {
      return filtered;
    }
  }
  if (typeof rawKey === 'string' && rawKey.trim().length > 0) {
    const parts = rawKey.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts;
    }
  }
  return null;
}

function extractPrimaryKeyFromSchema(schema) {
  if (!schema) {
    return null;
  }
  const fromPkField = normalizeKeyList(schema.primaryKey);
  if (fromPkField) {
    return fromPkField;
  }
  if (Array.isArray(schema.columns)) {
    const pkColumns = schema.columns
      .filter((col) => Boolean(col?.primaryKey))
      .map((col) => col.name)
      .filter(Boolean);
    if (pkColumns.length > 0) {
      return pkColumns.map(String);
    }
  }
  return null;
}

/**
 * Single owner for resolving a table's declared primary/partition key columns.
 * NEVER falls back to ['id'].
 * @param {Object|null} tableInfo - Table metadata row.
 * @param {Object} [options={}] - Optional resolution options.
 * @return {string[]} Array of declared primary key column names (empty if none declared).
 */
export function resolveDeclaredPrimaryKeyColumns(tableInfo, options = {}) {
  const fromOptions = resolveOptionsKeyColumns(options);
  if (fromOptions) {
    return fromOptions;
  }

  const fromPartitionKey = normalizeKeyList(resolveRawPartitionKey(tableInfo));
  if (fromPartitionKey) {
    return fromPartitionKey;
  }

  const fromPrimaryKey = normalizeKeyList(resolveRawPrimaryKey(tableInfo));
  if (fromPrimaryKey) {
    return fromPrimaryKey;
  }

  const schema = parseSchemaIfJson(resolveTableSchemaRaw(tableInfo));
  const fromSchema = extractPrimaryKeyFromSchema(schema);
  if (fromSchema) {
    return fromSchema;
  }

  return [];
}

function resolveColumnTypeFromSchema(schema, targetName) {
  if (!schema || !Array.isArray(schema.columns) || !targetName) {
    return null;
  }
  const normalizedTarget = targetName.toLowerCase();
  const column = schema.columns.find(
    (c) => c && typeof c.name === 'string' && c.name.toLowerCase() === normalizedTarget,
  );
  if (column?.type) {
    return normalizePartitionBoundaryKeyType(column.type);
  }
  return null;
}

function resolveExplicitPartitionKeyType(tableInfo) {
  if (!tableInfo) return null;
  const raw = tableInfo.partition_key_type ?? tableInfo.partitionKeyType;
  return raw ? normalizePartitionBoundaryKeyType(raw) : null;
}

/**
 * Resolve declared partition key type for a table.
 * @param {Object|null} tableInfo - Table metadata.
 * @param {string[]} [primaryKeyColumns=null] - Pre-resolved primary key columns.
 * @return {string|null} Normalized PARTITION_BOUNDARY_KEY_TYPE or null.
 */
export function resolveDeclaredPartitionKeyType(tableInfo, primaryKeyColumns = null) {
  const pkColumns = primaryKeyColumns || resolveDeclaredPrimaryKeyColumns(tableInfo);
  if (pkColumns.length > 1) {
    return PARTITION_BOUNDARY_KEY_TYPE.COMPOSITE;
  }

  const explicit = resolveExplicitPartitionKeyType(tableInfo);
  if (explicit) {
    return explicit;
  }

  if (pkColumns.length === 1) {
    const schema = parseSchemaIfJson(resolveTableSchemaRaw(tableInfo));
    const schemaType = resolveColumnTypeFromSchema(schema, pkColumns[0]);
    if (schemaType) {
      return schemaType;
    }
  }

  return null;
}
