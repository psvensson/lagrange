/**
 * Shared helper functions for admin WebSocket API modules.
 *
 * These pure utility functions are used by multiple extracted admin modules
 * (service-discovery, preflight, control-snapshot) and the residual
 * admin-websocket-api.js. Single-use helpers live in their consuming module.
 */


const EMPTY_STRING = '';
const SINGLE_SPACE = ' ';
const SQL_NORMALIZE_WHITESPACE_PATTERN = /\s+/g;
const SQL_TRAILING_SEMICOLON_PATTERN = /;\s*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SERVICE_DISCOVERY_TABLE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_PARTITION_VERSION = 1;
const ACTIVE_PARTITION_STATE = 'NORMAL';

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
    if (typeof value === 'string' && value.length > 0) {
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
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
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
  if (typeof value !== 'string') {
    return null;
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
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
  if (typeof value !== 'string') {
    return null;
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }
  if (!SERVICE_DISCOVERY_TABLE_ID_PATTERN.test(trimmedValue)) {
    return null;
  }
  return trimmedValue;
}

/**
 * Resolve a table row's active partition version.
 * Missing or invalid values default to version 1.
 * @param {Object|null} tableRow
 * @return {number}
 */
function resolveActivePartitionVersion(tableRow) {
  const value = tableRow?.active_partition_version ??
    tableRow?.activePartitionVersion;
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) ||
      parsedValue < DEFAULT_PARTITION_VERSION) {
    return DEFAULT_PARTITION_VERSION;
  }
  return parsedValue;
}

/**
 * Determine whether a partition row belongs to a table's active serving
 * partition set.
 * @param {Object|null} partitionRow
 * @param {number} activePartitionVersion
 * @return {boolean}
 */
function isPartitionVisibleForActiveTopology(
  partitionRow, activePartitionVersion,
) {
  const partitionVersion = Number(
    partitionRow?.partition_version ??
      partitionRow?.partitionVersion,
  );
  const normalizedPartitionVersion =
    Number.isInteger(partitionVersion) &&
      partitionVersion >= DEFAULT_PARTITION_VERSION ?
      partitionVersion :
      DEFAULT_PARTITION_VERSION;
  if (normalizedPartitionVersion !== activePartitionVersion) {
    return false;
  }

  const state = String(firstStringField(
    partitionRow,
    'state',
    'partition_state',
    'partitionState',
  ) || ACTIVE_PARTITION_STATE).toUpperCase();
  return state === ACTIVE_PARTITION_STATE;
}

/**
 * Filter partition rows down to the active serving topology for each table.
 * Table rows own active_partition_version. When a table row is missing,
 * version 1 remains the compatibility default.
 * @param {Array<Object>} partitionRows
 * @param {Array<Object>} tableRows
 * @return {Array<Object>}
 */
function filterActiveServingPartitionRows(
  partitionRows, tableRows,
) {
  const normalizedPartitionRows = Array.isArray(partitionRows) ?
    partitionRows :
    [];
  const normalizedTableRows = Array.isArray(tableRows) ?
    tableRows :
    [];
  const activePartitionVersionByTableId = new Map();
  const activePartitionVersionByTableName = new Map();

  for (const tableRow of normalizedTableRows) {
    const activePartitionVersion =
      resolveActivePartitionVersion(tableRow);
    const tableId = firstStringField(
      tableRow,
      'table_id',
      'tableId',
      'id',
    );
    if (tableId) {
      activePartitionVersionByTableId.set(
        tableId,
        activePartitionVersion,
      );
    }
    const tableName = firstStringField(
      tableRow,
      'table_name',
      'tableName',
      'name',
    );
    if (tableName) {
      activePartitionVersionByTableName.set(
        tableName,
        activePartitionVersion,
      );
    }
  }

  return normalizedPartitionRows.filter((partitionRow) => {
    const tableId = firstStringField(
      partitionRow,
      'table_id',
      'tableId',
    );
    const tableName = firstStringField(
      partitionRow,
      'table_name',
      'tableName',
      'name',
    );
    const activePartitionVersion = tableId &&
      activePartitionVersionByTableId.has(tableId) ?
      activePartitionVersionByTableId.get(tableId) :
      (tableName && activePartitionVersionByTableName.has(tableName) ?
        activePartitionVersionByTableName.get(tableName) :
        DEFAULT_PARTITION_VERSION);
    return isPartitionVisibleForActiveTopology(
      partitionRow,
      activePartitionVersion,
    );
  });
}

export {
  filterActiveServingPartitionRows,
  firstStringField,
  isPartitionVisibleForActiveTopology,
  normalizeDiscoveryTableId,
  normalizeIdentifier,
  normalizeSchemaVersionValue,
  normalizeSql,
  resolveActivePartitionVersion,
  uniqueSorted,
};
