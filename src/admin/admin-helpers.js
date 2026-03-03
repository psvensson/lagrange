/**
 * Shared helper functions for admin WebSocket API modules.
 *
 * These pure utility functions are used by multiple extracted admin modules
 * (service-discovery, preflight, control-snapshot) and the residual
 * admin-websocket-api.js. Single-use helpers live in their consuming module.
 */

import {NUM, TYPEOF} from '../constants/index.js';

const EMPTY_STRING = '';
const SINGLE_SPACE = ' ';
const SQL_NORMALIZE_WHITESPACE_PATTERN = /\s+/g;
const SQL_TRAILING_SEMICOLON_PATTERN = /;\s*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SERVICE_DISCOVERY_TABLE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Normalize SQL string for comparison.
 * @param {string} sql
 * @return {string}
 */
function normalizeSql(sql) {
  return String(sql || EMPTY_STRING)
    .trim()
    .replace(SQL_TRAILING_SEMICOLON_PATTERN, EMPTY_STRING)
    .replace(SQL_NORMALIZE_WHITESPACE_PATTERN, SINGLE_SPACE)
    .toLowerCase();
}

/**
 * Deduplicate and sort an array of values.
 * @param {Array} values
 * @return {Array}
 */
function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

/**
 * Return the first non-empty string value found among the given keys.
 * @param {Object} record
 * @param {...string} keys
 * @return {string|null}
 */
function firstStringField(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
      return value;
    }
  }
  return null;
}

/**
 * Normalize a schema version value to a trimmed string or null.
 * @param {*} value
 * @return {string|null}
 */
function normalizeSchemaVersionValue(value) {
  if (typeof value === TYPEOF.STRING) {
    const normalized = value.trim();
    return normalized.length > NUM.ZERO ? normalized : null;
  }
  if (typeof value === TYPEOF.NUMBER && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === TYPEOF.BIGINT) {
    return String(value);
  }
  return null;
}

/**
 * Normalize identifier-like values used in discovery scope.
 * @param {*} value
 * @return {string|null}
 */
function normalizeIdentifier(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === NUM.ZERO) {
    return null;
  }
  if (!IDENTIFIER_PATTERN.test(trimmedValue)) {
    return null;
  }
  return trimmedValue;
}

/**
 * Normalize optional table-id discovery scope value.
 * @param {*} value
 * @return {string|null}
 */
function normalizeDiscoveryTableId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === NUM.ZERO) {
    return null;
  }
  if (!SERVICE_DISCOVERY_TABLE_ID_PATTERN.test(trimmedValue)) {
    return null;
  }
  return trimmedValue;
}

export {
  firstStringField,
  normalizeDiscoveryTableId,
  normalizeIdentifier,
  normalizeSchemaVersionValue,
  normalizeSql,
  uniqueSorted,
};
