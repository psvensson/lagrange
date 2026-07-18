import {
  areCanonicalSystemTableRowsEqual,
  stableSerialize,
} from '../control-plane/control-plane-system-table-gateway-normalizers.js';
import {TABLES} from '../constants/index.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {
  SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_TERMINAL_REQUIRED_FIELD_NAMES,
} from './cache-constants.js';

function omitSystemTableCacheLocalFields(cachedRow, authoritativeRow) {
  if (!cachedRow || typeof cachedRow !== 'object') {
    return cachedRow;
  }
  const comparableRow = {...cachedRow};
  for (const fieldName of SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(
      authoritativeRow || {},
      fieldName,
    )) {
      delete comparableRow[fieldName];
    }
  }
  return comparableRow;
}

function areAuthoritativeSystemTableCacheRowsEqual(
  tableName,
  cachedRow,
  authoritativeRow,
) {
  return areCanonicalSystemTableRowsEqual(
    tableName,
    omitSystemTableCacheLocalFields(cachedRow, authoritativeRow),
    authoritativeRow,
  );
}

function isFiniteSystemTableCacheNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  return Number.isFinite(Number(value));
}

function hasCompleteAuthoritativeSystemTableCacheAlignmentRow(
  tableName,
  authoritativeRow,
) {
  if (tableName !== TABLES.SERVICES) {
    return Boolean(
      authoritativeRow &&
      typeof authoritativeRow === 'object',
    );
  }
  if (!authoritativeRow || typeof authoritativeRow !== 'object') {
    return false;
  }
  const fieldsPresent =
    SYSTEM_TABLE_CACHE_SERVICE_TERMINAL_REQUIRED_FIELD_NAMES.every(
      (fieldName) => Object.prototype.hasOwnProperty.call(
        authoritativeRow,
        fieldName,
      ),
    );
  if (!fieldsPresent) {
    return false;
  }
  const requiredStrings = [
    ...SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
    'status',
  ];
  return requiredStrings.every((fieldName) =>
    typeof authoritativeRow[fieldName] === 'string' &&
      authoritativeRow[fieldName].trim().length > 0) &&
    isFiniteSystemTableCacheNumber(authoritativeRow.state_entered_at) &&
    isFiniteSystemTableCacheNumber(authoritativeRow.updated_at);
}

function areAuthoritativeSystemTableCacheRowsAligned(
  tableName,
  cachedRow,
  authoritativeRow,
) {
  if (
    tableName !== TABLES.SERVICES ||
    !cachedRow ||
    !authoritativeRow ||
    typeof cachedRow !== 'object' ||
    typeof authoritativeRow !== 'object'
  ) {
    return areAuthoritativeSystemTableCacheRowsEqual(
      tableName,
      cachedRow,
      authoritativeRow,
    );
  }
  if (!hasCompleteAuthoritativeSystemTableCacheAlignmentRow(
    tableName,
    authoritativeRow,
  )) {
    return false;
  }
  const identityAligned =
    SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES.every((fieldName) =>
      stableSerialize(cachedRow[fieldName]) ===
        stableSerialize(authoritativeRow[fieldName]));
  if (!identityAligned || cachedRow.status !== authoritativeRow.status) {
    return false;
  }
  const cachedStateEnteredAt = Number(cachedRow.state_entered_at);
  const authoritativeStateEnteredAt = Number(
    authoritativeRow.state_entered_at,
  );
  if (
    !Number.isFinite(cachedStateEnteredAt) ||
    !Number.isFinite(authoritativeStateEnteredAt) ||
    cachedStateEnteredAt < authoritativeStateEnteredAt
  ) {
    return false;
  }
  if (cachedStateEnteredAt > authoritativeStateEnteredAt) {
    return true;
  }
  return SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES.every(
    (fieldName) => !Object.prototype.hasOwnProperty.call(
      authoritativeRow,
      fieldName,
    ) ||
      stableSerialize(cachedRow[fieldName]) ===
        stableSerialize(authoritativeRow[fieldName]),
  );
}

function buildAuthoritativeSystemTableCacheReplacement(
  existing,
  authoritative,
) {
  const replacement = fastJsonClone(authoritative);
  for (const fieldName of SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES) {
    if (
      !Object.prototype.hasOwnProperty.call(authoritative, fieldName) &&
      Object.prototype.hasOwnProperty.call(existing, fieldName)
    ) {
      replacement[fieldName] = fastJsonClone(existing[fieldName]);
    }
  }
  return replacement;
}

function buildAuthoritativeServiceLifecycleCacheReplacement(
  existing,
  authoritative,
) {
  const replacement = fastJsonClone(existing);
  for (const [fieldName, fieldValue] of Object.entries(authoritative)) {
    if (!Object.prototype.hasOwnProperty.call(replacement, fieldName)) {
      replacement[fieldName] = fastJsonClone(fieldValue);
    }
  }
  for (const fieldName of SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES) {
    replacement[fieldName] = fastJsonClone(authoritative[fieldName]);
  }
  const existingStateEnteredAt = Number(existing?.state_entered_at);
  const authoritativeStateEnteredAt = Number(
    authoritative?.state_entered_at,
  );
  if (
    !Number.isFinite(existingStateEnteredAt) ||
    authoritativeStateEnteredAt >= existingStateEnteredAt
  ) {
    for (const fieldName of SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES) {
      if (Object.prototype.hasOwnProperty.call(authoritative, fieldName)) {
        replacement[fieldName] = fastJsonClone(authoritative[fieldName]);
      }
    }
  }
  const existingUpdatedAt = Number(existing?.updated_at);
  const authoritativeUpdatedAt = Number(authoritative?.updated_at);
  if (
    Number.isFinite(existingUpdatedAt) &&
    Number.isFinite(authoritativeUpdatedAt)
  ) {
    replacement.updated_at = Math.max(
      existingUpdatedAt,
      authoritativeUpdatedAt,
    );
  }
  return replacement;
}

export {
  areAuthoritativeSystemTableCacheRowsAligned,
  areAuthoritativeSystemTableCacheRowsEqual,
  buildAuthoritativeServiceLifecycleCacheReplacement,
  buildAuthoritativeSystemTableCacheReplacement,
  hasCompleteAuthoritativeSystemTableCacheAlignmentRow,
  omitSystemTableCacheLocalFields,
};
