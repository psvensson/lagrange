import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';

const {
  buildDivergenceEvent,
  SQL_RECONCILIATION_REASON,
  CDC_EVENT,
  CDC_ERROR_MSG,
  getSchemaByTableName,
  CDC_INTEGRATION_SERVICE_LITERAL,
} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * Compare one cached field against an expected post-write value.
 * @param {*} actualValue
 * @param {*} expectedValue
 * @return {boolean} True if equal.
 */
export function areCacheFieldValuesEqual(actualValue, expectedValue) {
  if (actualValue === expectedValue) {
    return true;
  }
  if (
    (actualValue === null || typeof actualValue !== 'object') &&
    (expectedValue === null || typeof expectedValue !== 'object')
  ) {
    return false;
  }
  try {
    return JSON.stringify(actualValue) === JSON.stringify(expectedValue);
  } catch (_parseErr) {
    return false;
  }
}

/**
 * Normalize one cache field into a comparable numeric value when possible.
 * @param {*} value
 * @return {number|null} Comparable value or null.
 */
export function normalizeComparableCacheFieldValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'string') {
    if (value.length === 0) {
      return null;
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
    const asDate = Date.parse(value);
    return Number.isFinite(asDate) ? asDate : null;
  }
  return null;
}

/**
 * Check whether one cached value is equal to or greater than a minimum.
 * @param {*} actualValue
 * @param {*} minimumValue
 * @return {boolean} True if actual is at least minimum.
 */
export function isCacheFieldValueAtLeast(actualValue, minimumValue) {
  if (areCacheFieldValuesEqual(actualValue, minimumValue)) {
    return true;
  }
  const actualComparable = normalizeComparableCacheFieldValue(actualValue);
  const minimumComparable = normalizeComparableCacheFieldValue(minimumValue);
  if (actualComparable === null || minimumComparable === null) {
    return false;
  }
  return actualComparable >= minimumComparable;
}

/**
 * Determine whether one cached row matches the expected post-write fields.
 * @param {Object|undefined} record
 * @param {Object|null} expectedFields
 * @return {boolean} True if matched.
 */
export function doesCacheRecordMatchExpectedFields(record, expectedFields) {
  if (!expectedFields) {
    return Boolean(record);
  }
  if (!record || typeof record !== 'object') {
    return false;
  }
  for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
    if (!areCacheFieldValuesEqual(record[fieldName], expectedValue)) {
      return false;
    }
  }
  return true;
}

/**
 * Remove exact-match fields that are validated by minimum thresholds.
 * @param {Object|null} expectedFields
 * @param {Object|null} minimumFields
 * @return {Object|null} Normalized expected fields.
 */
export function normalizeExpectedFieldsForMinimums(expectedFields, minimumFields) {
  if (!expectedFields) {
    return null;
  }
  if (!minimumFields) {
    return expectedFields;
  }
  const normalized = {};
  for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
    if (Object.prototype.hasOwnProperty.call(minimumFields, fieldName)) {
      continue;
    }
    normalized[fieldName] = expectedValue;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

/**
 * Determine whether one cached row satisfies all minimum field thresholds.
 * @param {Object|undefined} record
 * @param {Object|null} minimumFields
 * @return {boolean} True if meets minimums.
 */
export function doesCacheRecordMeetMinimumFields(record, minimumFields) {
  if (!minimumFields) {
    return true;
  }
  if (!record || typeof record !== 'object') {
    return false;
  }
  for (const [fieldName, minimumValue] of Object.entries(minimumFields)) {
    if (!isCacheFieldValueAtLeast(record[fieldName], minimumValue)) {
      return false;
    }
  }
  return true;
}

/**
 * Build convergent fields array for cache visibility tracking.
 * @param {string} primaryKeyField
 * @param {Object|null} expectedFields
 * @param {Object|null} minimumFields
 * @return {Array<string>} Fields list.
 */
export function buildCacheVisibilityDivergentFields(
  primaryKeyField,
  expectedFields,
  minimumFields,
) {
  return Array.from(
    new Set([
      primaryKeyField,
      ...Object.keys(expectedFields || {}),
      ...Object.keys(minimumFields || {}),
    ]),
  );
}

/**
 * Emit cache visibility divergence events and log warnings.
 * @param {Object} context
 * @param {string} tableName
 * @param {string} key
 * @param {string} divergenceType
 * @param {Object|null} cacheValue
 * @param {Object|null} authoritativeValue
 * @param {Array<string>} divergentFields
 * @param {string} phase
 */
export function emitCacheVisibilityDivergence(
  context,
  tableName,
  key,
  divergenceType,
  cacheValue,
  authoritativeValue,
  divergentFields,
  phase,
) {
  const event = buildDivergenceEvent({
    divergenceType,
    tableName,
    ownerComponent: 'CDCIntegrationService',
    reconciliationReason:
      SQL_RECONCILIATION_REASON.DIAGNOSTICS_CACHE_RECONCILE,
    rowKey: key,
    cacheValue,
    authoritativeValue,
    divergentFields,
  });
  context.logger.warn(
    CDC_INTEGRATION_SERVICE_LITERAL.DIAGNOSED_CACHE_VISIBILITY_GAP_FROM_AUTHORITATIVE_SYSTEM_TABLE_READ,
    {
      ...event,
      nodeId: context.nodeId,
      phase,
    },
  );
  context.emit(CDC_EVENT.READ_MODEL_DIVERGENCE, event);
}

/**
 * Filter row data to known columns for the target system table.
 * @param {string} tableName - System table name.
 * @param {Object} data - Row data.
 * @return {Object} Filtered row data.
 */
export function filterDataForTable(tableName, data) {
  const schema = getSchemaByTableName(tableName);
  if (!schema || !schema.columns) {
    throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
  }
  const allowed = new Set(schema.columns.map((column) => column.name));
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
