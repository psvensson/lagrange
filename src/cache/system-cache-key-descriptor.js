/**
 * Canonical primary-key descriptor for system-table cache operations.
 *
 * This module is the single owner for resolving the primary-key field
 * used by cache implementations and CDC system-table helpers.
 */

import {
  SYSTEM_TABLE_SCHEMAS,
} from '../bootstrap/system-table-schemas-constants.js';

const LOCAL_NUM_ZERO = 0;

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
      schema.primaryKey.length > LOCAL_NUM_ZERO) {
    return schema.primaryKey[LOCAL_NUM_ZERO];
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

export {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
  SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG,
  SYSTEM_CACHE_KEY_FALLBACK,
  getSystemCachePrimaryKeyField,
  getSystemCachePrimaryKeyFieldOrFallback,
};
