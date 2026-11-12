/**
 * Canonical primary-key descriptor for system-table cache operations.
 *
 * This module is the single owner for resolving the primary-key field
 * used by cache implementations and CDC system-table helpers.
 */

import {
  SYSTEM_TABLE_SCHEMAS,
} from '../bootstrap/system-table-schemas-constants.js';
import {CanonicalJsonDataError, appendOwnArrayValue, captureJsonData,
  isDenseDataArray, isNonEmptyText, isRecord} from '../utils/canonical-json-data.js';

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const CanonicalSet = Set;
const setAdd = Function.prototype.call.bind(Set.prototype.add);
const setHas = Function.prototype.call.bind(Set.prototype.has);

const SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG = Object.freeze({
  missingDescriptor: (tableName) =>
    `System cache key descriptor missing for table: ${tableName}`,
});

const SYSTEM_CACHE_KEY_FALLBACK = 'id';

/**
 * Resolve the canonical key field for a table schema.
 * Uses explicit composite primaryKey metadata first, then column-level flags.
 *
 * @param {Object} schema - System table schema descriptor.
 * @return {string|undefined} Canonical key field, if present.
 */
function resolveSchemaPrimaryKeyField(schema) {
  if (schema?.primaryKey && Array.isArray(schema.primaryKey) &&
      schema.primaryKey.length > 0) {
    return schema.primaryKey[0];
  }

  if (!Array.isArray(schema?.columns)) {
    return undefined;
  }

  const keyColumn = schema.columns.find((column) => column.primaryKey === true);
  return keyColumn?.name;
}

const descriptor = {};
for (const schema of SYSTEM_TABLE_SCHEMAS) {
  const keyField = resolveSchemaPrimaryKeyField(schema);
  if (!schema?.tableName || !keyField) {
    continue;
  }
  descriptor[schema.tableName] = keyField;
}

const SYSTEM_CACHE_KEY_DESCRIPTOR = Object.freeze({...descriptor});

/**
 * Get canonical key field for a system table.
 * Fails fast when descriptor is missing.
 *
 * @param {string} tableName - System table name.
 * @return {string} Canonical key field.
 */
function getSystemCachePrimaryKeyField(tableName) {
  const keyField = SYSTEM_CACHE_KEY_DESCRIPTOR[tableName];
  if (!keyField) {
    throw new Error(
      SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG.missingDescriptor(tableName),
    );
  }
  return keyField;
}

/**
 * Get canonical key field for a system table with fallback.
 *
 * @param {string} tableName - System table name.
 * @param {string} fallback - Fallback key field.
 * @return {string} Canonical key field or fallback.
 */
function getSystemCachePrimaryKeyFieldOrFallback(
  tableName,
  fallback = SYSTEM_CACHE_KEY_FALLBACK,
) {
  const keyField = SYSTEM_CACHE_KEY_DESCRIPTOR[tableName];
  return keyField || fallback;
}

/**
 * The row's declared key: the value of its table's primary-key field. A row
 * without a usable value there has no key (undefined); the caller refuses it.
 * No other field stands in for the declared key.
 *
 * @param {string} tableName - System table name.
 * @param {Object} row - System-table row.
 * @return {*} The declared key, or undefined when the row has none.
 */
function resolveSystemCacheRowKey(tableName, row) {
  const key = row?.[getSystemCachePrimaryKeyField(tableName)];
  return key ? key : undefined;
}

function isUsableSystemCacheKey(value) {
  return isNonEmptyText(value);
}

// This operation captures data, not read authority. Each consumer still owns
// its original serving evidence and whether that evidence permits an effect.
function captureSystemTableRows(tableName, rows) {
  if (typeof tableName !== 'string' || !objectHasOwn(SYSTEM_CACHE_KEY_DESCRIPTOR, tableName) ||
      !isDenseDataArray(rows)) return null;
  const keyField = SYSTEM_CACHE_KEY_DESCRIPTOR[tableName];
  if (!isNonEmptyText(keyField)) return null;
  let capturedRows;
  try {
    capturedRows = captureJsonData(rows);
  } catch (error) {
    if (error instanceof CanonicalJsonDataError) return null;
    throw error;
  }
  const keys = [];
  const seen = new CanonicalSet();
  for (let index = 0; index < capturedRows.length; index += 1) {
    const row = capturedRows[index];
    if (!isRecord(row) || !objectHasOwn(row, keyField)) return null;
    const key = row[keyField];
    if (!isUsableSystemCacheKey(key) || setHas(seen, key)) return null;
    setAdd(seen, key);
    appendOwnArrayValue(keys, key);
  }
  return objectFreeze({rows: capturedRows, keys: objectFreeze(keys)});
}

export {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
  SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG,
  SYSTEM_CACHE_KEY_FALLBACK,
  captureSystemTableRows,
  getSystemCachePrimaryKeyField,
  getSystemCachePrimaryKeyFieldOrFallback,
  isUsableSystemCacheKey,
  resolveSystemCacheRowKey,
};
