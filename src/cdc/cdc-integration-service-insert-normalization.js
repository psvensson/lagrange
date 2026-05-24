import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {filterDataForTable} from './cdc-integration-service-cache-divergence.js';

const {
  CDC_ERROR_MSG,
  CDC_INTEGRATION_SERVICE_LITERAL,
  COLUMN,
  NUM,
  SERVICE_STATUS,
  STATE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  canonicalizeSystemTableRow,
  getSchemaByTableName,
  materializeNormalizedDefaultValue,
  uuidv4,
} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * Normalize schema default values (strip quotes, parse numbers).
 * @param {string|number|null} value - Default value.
 * @return {Object} Explicit default-value normalization result.
 */
export function normalizeDefaultValue(value) {
  if (value === undefined || value === null) {
    return Object.freeze({
      state:
        value === undefined ?
          CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED :
          CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL,
    });
  }
  if (typeof value !== TYPEOF.STRING) {
    return Object.freeze({
      state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
      value,
    });
  }
  const trimmed = value.trim();
  if (
    (trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) &&
      trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4)) ||
    (trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) &&
      trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5))
  ) {
    return Object.freeze({
      state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
      value: trimmed.slice(NUM.ONE, -NUM.ONE),
    });
  }
  if (trimmed.toLowerCase() === CDC_INTEGRATION_SERVICE_LITERAL.NULL) {
    return Object.freeze({
      state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL,
    });
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Object.freeze({
      state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
      value: Number(trimmed),
    });
  }
  return Object.freeze({
    state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
    value: trimmed,
  });
}

/**
 * Apply schema-defined defaults to missing fields.
 * @param {Object} schema - Table schema.
 * @param {Object} rowData - Row data to mutate.
 */
export function applySchemaDefaults(schema, rowData) {
  for (const column of schema.columns) {
    if (rowData[column.name] !== undefined) {
      continue;
    }
    if (column.defaultValue === undefined) {
      continue;
    }
    const normalizedDefault = normalizeDefaultValue(column.defaultValue);
    if (
      normalizedDefault.state ===
      CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED
    ) {
      continue;
    }
    rowData[column.name] =
      materializeNormalizedDefaultValue(normalizedDefault);
  }
}

/**
 * Apply generic timestamp defaults for inserts when columns exist.
 * @param {Object} schema - Table schema.
 * @param {Object} rowData - Row data to mutate.
 */
export function applyTimestampDefaults(schema, rowData) {
  const now = Date.now();
  const columnNames = new Set(schema.columns.map((col) => col.name));
  if (
    columnNames.has(COLUMN.CREATED_AT) &&
    rowData[COLUMN.CREATED_AT] == null
  ) {
    rowData[COLUMN.CREATED_AT] = now;
  }
  if (
    columnNames.has(COLUMN.UPDATED_AT) &&
    rowData[COLUMN.UPDATED_AT] == null
  ) {
    rowData[COLUMN.UPDATED_AT] = now;
  }
}

/**
 * Apply table-specific defaults for inserts.
 * @param {string} tableName - System table name.
 * @param {Object} schema - Table schema.
 * @param {Object} rowData - Row data to mutate.
 */
export function applyTableInsertDefaults(tableName, _schema, rowData) {
  const now = Date.now();
  if (tableName !== SYSTEM_TABLE_NAME.NODES) {
    return;
  }
  if (!rowData[COLUMN.NODE_ADDRESS]) {
    rowData[COLUMN.NODE_ADDRESS] = CDC_INTEGRATION_SERVICE_LITERAL.UNKNOWN;
  }
  if (rowData.cpu_cores == null) {
    rowData.cpu_cores = NUM.ZERO;
  }
  if (rowData.memory_mb == null) {
    rowData.memory_mb = NUM.ZERO;
  }
  if (rowData.disk_gb == null) {
    rowData.disk_gb = NUM.ZERO;
  }
  if (rowData.cpu_usage_percent == null) {
    rowData.cpu_usage_percent = NUM.ZERO;
  }
  if (rowData.memory_usage_percent == null) {
    rowData.memory_usage_percent = NUM.ZERO;
  }
  if (rowData.disk_usage_percent == null) {
    rowData.disk_usage_percent = NUM.ZERO;
  }
  if (!rowData.status) {
    rowData.status = SERVICE_STATUS.ACTIVE;
  }
  if (!rowData.connection_state) {
    rowData.connection_state = STATE.DISCONNECTED;
  }
  if (rowData.capabilities == null) {
    rowData.capabilities = CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_3;
  }
  if (rowData.last_heartbeat == null) {
    rowData.last_heartbeat = now;
  }
}

/**
 * Normalize INSERT/UPSERT row data using schema defaults and table-specific defaults.
 * @param {Object} context - Service context providing getPrimaryKeyField method.
 * @param {string} tableName - System table name.
 * @param {Object} data - Input row data.
 * @param {Object} options - Options.
 * @return {Object} Normalized row data.
 */
export function prepareInsertData(context, tableName, data, options = {}) {
  const schema = getSchemaByTableName(tableName);
  if (!schema || !schema.columns) {
    throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
  }
  const canonicalData = canonicalizeSystemTableRow(tableName, data);
  const rowData = filterDataForTable(tableName, {
    ...canonicalData,
  });
  if (Object.keys(rowData).length === NUM.ZERO) {
    throw new Error(
      `${CDC_ERROR_MSG.INSERT_VALID_COLUMNS_PREFIX}${tableName}`,
    );
  }
  const {generatePrimaryKey = true} = options;
  const idField = context.getPrimaryKeyField(tableName);
  if (!rowData[idField] && generatePrimaryKey) {
    rowData[idField] = uuidv4();
  }
  applySchemaDefaults(schema, rowData);
  applyTableInsertDefaults(tableName, schema, rowData);
  applyTimestampDefaults(schema, rowData);
  return rowData;
}
