import {readLowerStateField} from '../utils/state-field-read.js';
import {
  areCanonicalSystemTableRowsEqual,
  stableSerialize,
} from '../control-plane/control-plane-system-table-gateway-normalizers.js';
import {
  SERVICE_STATUS,
  TABLES,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {
  SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_TERMINAL_REQUIRED_FIELD_NAMES,
} from './cache-constants.js';

const SERVICE_LIFECYCLE_COLUMN = Object.freeze({
  STATE_ENTERED_AT: 'state_entered_at',
});
const CLEANUP_OWNED_STATUS = 'cleanup_owned';
const SERVICE_INCARNATION_TOKEN_FIELD_NAMES = Object.freeze([
  ...SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  'create_attempt_token',
  'cleanup_token',
]);

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

function resolveServiceDurableVersion(row) {
  if (isFiniteSystemTableCacheNumber(row?.state_entered_at)) {
    return {
      column: SERVICE_LIFECYCLE_COLUMN.STATE_ENTERED_AT,
      value: Number(row.state_entered_at),
    };
  }
  return null;
}

function isCompleteCleanupAlignmentRow(row) {
  const requiredStrings = [
    'service_id',
    'partition_id',
    'node_id',
    'cleanup_token',
  ];
  return row.status === CLEANUP_OWNED_STATUS &&
    requiredStrings.every((field) =>
      typeof row[field] === 'string' && row[field].length > 0) &&
    isFiniteSystemTableCacheNumber(row.updated_at);
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
  if (isPartitionCleanupServiceRow(authoritativeRow)) {
    return isCompleteCleanupAlignmentRow(authoritativeRow);
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
    resolveServiceDurableVersion(authoritativeRow) !== null &&
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
  if (isPartitionCleanupServiceRow(authoritativeRow)) {
    return isPartitionCleanupServiceRow(cachedRow) &&
      cachedRow.status === authoritativeRow.status &&
      cachedRow.service_id === authoritativeRow.service_id &&
      cachedRow.partition_id === authoritativeRow.partition_id &&
      cachedRow.node_id === authoritativeRow.node_id &&
      cachedRow.cleanup_token === authoritativeRow.cleanup_token &&
      Number(cachedRow.updated_at) === Number(authoritativeRow.updated_at);
  }
  const identityAligned =
    SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES.every((fieldName) =>
      stableSerialize(cachedRow[fieldName]) ===
        stableSerialize(authoritativeRow[fieldName]));
  if (!identityAligned || cachedRow.status !== authoritativeRow.status) {
    return false;
  }
  const authoritativeVersion = resolveServiceDurableVersion(authoritativeRow);
  const cachedVersion = authoritativeVersion ?
    Number(cachedRow[authoritativeVersion.column]) : NaN;
  if (
    !Number.isFinite(cachedVersion) ||
    cachedVersion < authoritativeVersion.value
  ) {
    return false;
  }
  if (cachedVersion > authoritativeVersion.value) {
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

function hasConflictingNonEmptyField(existing, authoritative, fieldName) {
  const existingValue = existing?.[fieldName];
  const authoritativeValue = authoritative?.[fieldName];
  return typeof existingValue === 'string' &&
    existingValue.trim().length > 0 &&
    typeof authoritativeValue === 'string' &&
    authoritativeValue.trim().length > 0 &&
    existingValue !== authoritativeValue;
}

function hasDifferentServiceIdentity(existing, authoritative) {
  if (SERVICE_INCARNATION_TOKEN_FIELD_NAMES.some((fieldName) =>
    hasConflictingNonEmptyField(existing, authoritative, fieldName))) {
    return true;
  }
  return isFiniteSystemTableCacheNumber(existing?.created_at) &&
    isFiniteSystemTableCacheNumber(authoritative?.created_at) &&
    Number(existing.created_at) !== Number(authoritative.created_at);
}

function isNonLeaderVoterRole(role) {
  return isVoterRaftRole(role) &&
    String(role).toLowerCase() !== RAFT_ROLE.LEADER;
}

function isActiveServiceStatus(row) {
  return readLowerStateField(row?.status) === SERVICE_STATUS.ACTIVE;
}

function shouldPreserveActiveNonLeaderVoterRaftRole(
  tableName,
  existing,
  authoritative,
) {
  if (
    tableName !== TABLES.SERVICES ||
    !existing ||
    !authoritative ||
    hasDifferentServiceIdentity(existing, authoritative)
  ) {
    return false;
  }
  return isActiveServiceStatus(existing) &&
    isActiveServiceStatus(authoritative) &&
    authoritative.raft_role == null &&
    isNonLeaderVoterRole(existing.raft_role) &&
    !(Number(authoritative.updated_at) > Number(existing.updated_at));
}

function resolveReplacementArguments(firstArg, secondArg, thirdArg) {
  if (typeof firstArg === 'string') {
    return {
      tableName: firstArg,
      existing: secondArg,
      authoritative: thirdArg,
    };
  }
  const existing = firstArg;
  const authoritative = secondArg;
  const tableName =
    typeof authoritative?.service_id === 'string' ||
      typeof existing?.service_id === 'string' ?
      TABLES.SERVICES :
      null;
  return {tableName, existing, authoritative};
}

function applyPreservedNonLeaderVoterRaftRole(
  tableName,
  existing,
  authoritative,
  replacement,
) {
  if (shouldPreserveActiveNonLeaderVoterRaftRole(
    tableName,
    existing,
    authoritative,
  )) {
    replacement.raft_role = existing.raft_role;
  }
  return replacement;
}

const HLC_LOCAL_FIELD_NAMES = new Set([
  'updated_at_hlc',
  'updatedAtHlc',
]);

function shouldPreserveLocalFieldAcrossAuthoritativeReplacement(
  fieldName,
  existing,
  authoritative,
) {
  if (!HLC_LOCAL_FIELD_NAMES.has(fieldName)) {
    return true;
  }
  const existingUpdatedAt = Number(existing?.updated_at);
  const authoritativeUpdatedAt = Number(authoritative?.updated_at);
  return !(
    Number.isFinite(existingUpdatedAt) &&
    Number.isFinite(authoritativeUpdatedAt) &&
    authoritativeUpdatedAt > existingUpdatedAt
  );
}

function buildAuthoritativeSystemTableCacheReplacement(
  firstArg,
  secondArg,
  thirdArg,
) {
  const {tableName, existing, authoritative} = resolveReplacementArguments(
    firstArg,
    secondArg,
    thirdArg,
  );
  const replacement = fastJsonClone(authoritative);
  for (const fieldName of SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES) {
    if (
      !Object.prototype.hasOwnProperty.call(authoritative, fieldName) &&
      Object.prototype.hasOwnProperty.call(existing, fieldName) &&
      shouldPreserveLocalFieldAcrossAuthoritativeReplacement(
        fieldName,
        existing,
        authoritative,
      )
    ) {
      replacement[fieldName] = fastJsonClone(existing[fieldName]);
    }
  }
  return applyPreservedNonLeaderVoterRaftRole(
    tableName,
    existing,
    authoritative,
    replacement,
  );
}

function buildAuthoritativeServiceLifecycleCacheReplacement(
  existing,
  authoritative,
) {
  if (isPartitionCleanupServiceRow(authoritative)) {
    return buildAuthoritativeSystemTableCacheReplacement(
      TABLES.SERVICES,
      existing,
      authoritative,
    );
  }
  const replacement = fastJsonClone(existing);
  for (const fieldName of HLC_LOCAL_FIELD_NAMES) {
    if (
      !Object.prototype.hasOwnProperty.call(authoritative || {}, fieldName) &&
      !shouldPreserveLocalFieldAcrossAuthoritativeReplacement(
        fieldName,
        existing,
        authoritative,
      )
    ) {
      delete replacement[fieldName];
    }
  }
  for (const [fieldName, fieldValue] of Object.entries(authoritative)) {
    if (!Object.prototype.hasOwnProperty.call(replacement, fieldName)) {
      replacement[fieldName] = fastJsonClone(fieldValue);
    }
  }
  for (const fieldName of SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES) {
    replacement[fieldName] = fastJsonClone(authoritative[fieldName]);
  }
  const authoritativeVersion = resolveServiceDurableVersion(authoritative);
  const existingVersion = authoritativeVersion ?
    Number(existing?.[authoritativeVersion.column]) : NaN;
  if (authoritativeVersion && (
    !Number.isFinite(existingVersion) ||
    authoritativeVersion.value >= existingVersion
  )) {
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
  return applyPreservedNonLeaderVoterRaftRole(
    TABLES.SERVICES,
    existing,
    authoritative,
    replacement,
  );
}

export {
  areAuthoritativeSystemTableCacheRowsAligned,
  areAuthoritativeSystemTableCacheRowsEqual,
  buildAuthoritativeServiceLifecycleCacheReplacement,
  buildAuthoritativeSystemTableCacheReplacement,
  hasCompleteAuthoritativeSystemTableCacheAlignmentRow,
  omitSystemTableCacheLocalFields,
};
