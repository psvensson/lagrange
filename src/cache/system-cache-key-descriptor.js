/**
 * Canonical primary-key descriptor for system-table cache operations.
 *
 * This module is the single owner for resolving the primary-key field
 * used by cache implementations and CDC system-table helpers.
 */

import {
  SYSTEM_TABLE_SCHEMAS,
} from '../bootstrap/system-table-schemas-constants.js';


const SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG = Object.freeze({
  missingDescriptor: (tableName) =>
    `System cache key descriptor missing for table: ${tableName}`,
});

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
 * Check whether a table name has a canonical system-table cache key descriptor.
 *
 * @param {string} tableName - Candidate table name.
 * @return {boolean} True when tableName is a known system table with a descriptor.
 */
function hasSystemCacheKeyDescriptor(tableName) {
  return typeof tableName === 'string' &&
    Object.prototype.hasOwnProperty.call(SYSTEM_CACHE_KEY_DESCRIPTOR, tableName);
}

/**
 * Get canonical key field for a system table.
 * Fails fast when descriptor is missing.
 *
 * @param {string} tableName - System table name.
 * @return {string} Canonical key field.
 */
function getSystemCachePrimaryKeyField(tableName) {
  if (!hasSystemCacheKeyDescriptor(tableName)) {
    throw new Error(
      SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG.missingDescriptor(tableName),
    );
  }
  return SYSTEM_CACHE_KEY_DESCRIPTOR[tableName];
}

/**
 * Resolve the canonical primary-key value for a known system-table row.
 * Requires the table's declared primary-key field; never falls back to generic `id`.
 *
 * @param {string} tableName - System table name.
 * @param {Object} row - Row record.
 * @return {*} Declared primary-key value, or undefined when missing/empty.
 */
function resolveSystemCacheRowKey(tableName, row) {
  const keyField = getSystemCachePrimaryKeyField(tableName);
  const value = row?.[keyField];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return value;
}

function isUsableSystemCacheKey(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
  getSystemCachePrimaryKeyField,
  hasSystemCacheKeyDescriptor,
  isUsableSystemCacheKey,
  resolveSystemCacheRowKey,
};
