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
import {tryParseHLCTimestamp} from './system-table-cache-row-merge.js';
import {
  SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES,
  SYSTEM_TABLE_CACHE_SERVICE_RECONCILIATION_FIELD,
  SYSTEM_TABLE_CACHE_SERVICE_TERMINAL_REQUIRED_FIELD_NAMES,
} from './cache-constants.js';

const SERVICE_LIFECYCLE_COLUMN = Object.freeze({
  STATE_ENTERED_AT: 'state_entered_at',
  UPDATED_AT: 'updated_at',
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
  if (!Object.prototype.hasOwnProperty.call(
    row || {},
    SERVICE_LIFECYCLE_COLUMN.STATE_ENTERED_AT,
  ) &&
      isFiniteSystemTableCacheNumber(row?.updated_at)) {
    return {
      column: SERVICE_LIFECYCLE_COLUMN.UPDATED_AT,
      value: Number(row.updated_at),
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
  options = {},
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
  if (isCachedServiceIncarnationNewer(cachedRow, authoritativeRow, options)) {
    return true;
  }
  if (isCachedServiceIncarnationOlder(cachedRow, authoritativeRow, options)) {
    return false;
  }
  const identityAligned =
    SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES.every((fieldName) =>
      stableSerialize(cachedRow[fieldName]) ===
        stableSerialize(authoritativeRow[fieldName])) &&
    (!Object.prototype.hasOwnProperty.call(
      authoritativeRow,
      SYSTEM_TABLE_CACHE_SERVICE_RECONCILIATION_FIELD.PORT,
    ) ||
      stableSerialize(cachedRow.port) ===
        stableSerialize(authoritativeRow.port));
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
  ) && !Object.keys(authoritativeRow).some((fieldName) =>
    authorityFillsAbsentCachedServiceField(
      cachedRow,
      authoritativeRow,
      fieldName,
    ));
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

function resolveReplacementArguments(
  firstArg,
  secondArg,
  thirdArg,
  fourthArg = {},
) {
  if (typeof firstArg === 'string') {
    return {
      tableName: firstArg,
      existing: secondArg,
      authoritative: thirdArg,
      options: fourthArg || {},
    };
  }
  const existing = firstArg;
  const authoritative = secondArg;
  const tableName =
    typeof authoritative?.service_id === 'string' ||
      typeof existing?.service_id === 'string' ?
      TABLES.SERVICES :
      null;
  return {tableName, existing, authoritative, options: thirdArg || {}};
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

function resolveServiceIncarnationReplacementOverride(
  tableName,
  existing,
  authoritative,
  options,
) {
  if (
    tableName !== TABLES.SERVICES ||
    !options ||
    Object.keys(options).length === 0
  ) {
    return null;
  }
  if (isCachedServiceIncarnationNewer(existing, authoritative, options)) {
    return fastJsonClone(existing);
  }
  if (
    options.authoritativeIncarnationSupersedes === true &&
    isCachedServiceIncarnationOlder(existing, authoritative, options)
  ) {
    return buildNewerIncarnationServiceReplacement(existing, authoritative);
  }
  return null;
}

function buildAuthoritativeSystemTableCacheReplacement(
  firstArg,
  secondArg,
  thirdArg,
  fourthArg,
) {
  const {
    tableName,
    existing,
    authoritative,
    options,
  } = resolveReplacementArguments(
    firstArg,
    secondArg,
    thirdArg,
    fourthArg,
  );
  const incarnationOverride = resolveServiceIncarnationReplacementOverride(
    tableName,
    existing,
    authoritative,
    options,
  );
  if (incarnationOverride !== null) {
    return incarnationOverride;
  }
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

const AUTHORITATIVE_ABSENT_FILL_EXCLUDED_FIELD_NAMES = new Set([
  ...SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  ...SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES,
  SERVICE_LIFECYCLE_COLUMN.UPDATED_AT,
]);

function isAbsentSystemTableCacheValue(value) {
  return value === null || typeof value === 'undefined';
}

function isCachedServiceLifecycleVersionNewer(existing, authoritative) {
  const authoritativeVersion = resolveServiceDurableVersion(authoritative);
  if (!authoritativeVersion) {
    return true;
  }
  const existingVersion = existing?.[authoritativeVersion.column];
  return isFiniteSystemTableCacheNumber(existingVersion) &&
    Number(existingVersion) > authoritativeVersion.value;
}

function isAbsentCachedServiceFillColumn(existing, authoritative, fieldName) {
  return !AUTHORITATIVE_ABSENT_FILL_EXCLUDED_FIELD_NAMES.has(fieldName) &&
    !HLC_LOCAL_FIELD_NAMES.has(fieldName) &&
    isAbsentSystemTableCacheValue(existing?.[fieldName]) &&
    !isAbsentSystemTableCacheValue(authoritative?.[fieldName]);
}

function isCachedServiceRowVersionNewerOrAuthorityUnversioned(
  existing,
  authoritative,
) {
  const existingUpdatedAt = existing?.updated_at;
  const authoritativeUpdatedAt = authoritative?.updated_at;
  return !isFiniteSystemTableCacheNumber(authoritativeUpdatedAt) ||
    (isFiniteSystemTableCacheNumber(existingUpdatedAt) &&
      Number(existingUpdatedAt) > Number(authoritativeUpdatedAt));
}

function hasConflictingCreateAttemptToken(existing, authoritative) {
  return hasConflictingNonEmptyField(
    existing,
    authoritative,
    SYSTEM_TABLE_CACHE_SERVICE_RECONCILIATION_FIELD.CREATE_ATTEMPT_TOKEN,
  ) || hasConflictingNonEmptyField(
    existing,
    authoritative,
    SYSTEM_TABLE_CACHE_SERVICE_RECONCILIATION_FIELD.CREATE_ATTEMPT_TOKEN_CAMEL,
  );
}

function hasDifferentCreatedAtIncarnation(existing, authoritative) {
  return isFiniteSystemTableCacheNumber(existing?.created_at) &&
    isFiniteSystemTableCacheNumber(authoritative?.created_at) &&
    Number(existing.created_at) !== Number(authoritative.created_at);
}

function hasDifferentReplicaBirthIncarnation(existing, authoritative) {
  return hasDifferentCreatedAtIncarnation(existing, authoritative) ||
    hasConflictingCreateAttemptToken(existing, authoritative);
}

function hasCompleteOrdinaryServiceIncarnationRow(row) {
  return hasCompleteAuthoritativeSystemTableCacheAlignmentRow(
    TABLES.SERVICES,
    row,
  ) && !isPartitionCleanupServiceRow(row);
}

const INCARNATION_SUPERSESSION = Object.freeze({
  NONE: 'none',
  CACHED: 'cached',
  AUTHORITATIVE: 'authoritative',
});

function resolveCachedSupersessionIfComplete(existing) {
  return hasCompleteOrdinaryServiceIncarnationRow(existing) ?
    INCARNATION_SUPERSESSION.CACHED :
    INCARNATION_SUPERSESSION.NONE;
}

function resolveExplicitIncarnationSupersession(existing, options) {
  if (options?.cachedIncarnationSupersedes === true) {
    return resolveCachedSupersessionIfComplete(existing);
  }
  if (options?.authoritativeIncarnationSupersedes === true) {
    return INCARNATION_SUPERSESSION.AUTHORITATIVE;
  }
  return null;
}

function resolveIncarnationSourcePosition(row, optionPosition) {
  const candidates = [
    optionPosition,
    row?.source_log_index,
    row?.sourceLogIndex,
    row?.applied_index,
    row?.appliedIndex,
  ];
  for (const candidate of candidates) {
    if (Number.isSafeInteger(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  return null;
}

function resolveSourcePositionIncarnationSupersession(
  existing,
  authoritative,
  options,
) {
  const cachedPosition = resolveIncarnationSourcePosition(
    existing,
    options?.cachedSourceLogIndex,
  );
  const authoritativePosition = resolveIncarnationSourcePosition(
    authoritative,
    options?.authoritativeSourceLogIndex,
  );
  if (
    cachedPosition === null ||
    authoritativePosition === null ||
    cachedPosition === authoritativePosition
  ) {
    return null;
  }
  return cachedPosition > authoritativePosition ?
    resolveCachedSupersessionIfComplete(existing) :
    INCARNATION_SUPERSESSION.AUTHORITATIVE;
}

function resolveIncarnationOriginHlc(row, optionHlc) {
  const candidates = [
    optionHlc,
    row?.updated_at_hlc,
    row?.updatedAtHlc,
    row?.origin_hlc,
    row?.originHlc,
  ];
  for (const candidate of candidates) {
    const parsed = tryParseHLCTimestamp(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function resolveOriginHlcIncarnationSupersession(
  existing,
  authoritative,
  options,
) {
  const cachedHlc = resolveIncarnationOriginHlc(
    existing,
    options?.cachedOriginHlc,
  );
  const authoritativeHlc = resolveIncarnationOriginHlc(
    authoritative,
    options?.authoritativeOriginHlc ?? options?.originHlc,
  );
  if (!cachedHlc || !authoritativeHlc) {
    return null;
  }
  const order = cachedHlc.compare(authoritativeHlc);
  if (order === 0) {
    return null;
  }
  return order > 0 ?
    resolveCachedSupersessionIfComplete(existing) :
    INCARNATION_SUPERSESSION.AUTHORITATIVE;
}

function isCachedServiceStrictVersionNewer(existing, authoritative) {
  const authoritativeVersion = resolveServiceDurableVersion(authoritative);
  return Boolean(authoritativeVersion) &&
    isFiniteSystemTableCacheNumber(existing?.[authoritativeVersion.column]) &&
    Number(existing[authoritativeVersion.column]) >
      authoritativeVersion.value &&
    isFiniteSystemTableCacheNumber(existing?.updated_at) &&
    isFiniteSystemTableCacheNumber(authoritative?.updated_at) &&
    Number(existing.updated_at) > Number(authoritative.updated_at);
}

function resolveUnfencedVersionIncarnationSupersession(
  existing,
  authoritative,
) {
  if (isCachedServiceStrictVersionNewer(existing, authoritative)) {
    return resolveCachedSupersessionIfComplete(existing);
  }
  if (
    !isCachedServiceRowVersionNewerOrAuthorityUnversioned(
      existing,
      authoritative,
    ) &&
    !isCachedServiceLifecycleVersionNewer(existing, authoritative)
  ) {
    return INCARNATION_SUPERSESSION.AUTHORITATIVE;
  }
  return INCARNATION_SUPERSESSION.NONE;
}

function resolveServiceIncarnationSupersession(
  existing,
  authoritative,
  options = {},
) {
  if (
    !existing ||
    typeof existing !== 'object' ||
    !hasCompleteOrdinaryServiceIncarnationRow(authoritative) ||
    !hasDifferentReplicaBirthIncarnation(existing, authoritative)
  ) {
    return INCARNATION_SUPERSESSION.NONE;
  }
  return resolveExplicitIncarnationSupersession(existing, options) ??
    resolveSourcePositionIncarnationSupersession(
      existing,
      authoritative,
      options,
    ) ??
    resolveOriginHlcIncarnationSupersession(existing, authoritative, options) ??
    resolveUnfencedVersionIncarnationSupersession(existing, authoritative);
}

function isCachedServiceIncarnationNewer(
  existing,
  authoritative,
  options = {},
) {
  return resolveServiceIncarnationSupersession(
    existing,
    authoritative,
    options,
  ) === INCARNATION_SUPERSESSION.CACHED;
}

function isCachedServiceIncarnationOlder(
  existing,
  authoritative,
  options = {},
) {
  return resolveServiceIncarnationSupersession(
    existing,
    authoritative,
    options,
  ) === INCARNATION_SUPERSESSION.AUTHORITATIVE;
}

// A cached key holding null or undefined is absent evidence, not a newer
// value: it takes the authoritative value of a non-identity, non-lifecycle
// column when the cached row version is not newer, the cached lifecycle is
// not newer and both rows are the same incarnation. The builder fills these
// cells and the aligned predicate refuses while one stands.
function authorityFillsAbsentCachedServiceField(
  existing,
  authoritative,
  fieldName,
) {
  return isAbsentCachedServiceFillColumn(existing, authoritative, fieldName) &&
    !isCachedServiceRowVersionNewerOrAuthorityUnversioned(
      existing,
      authoritative,
    ) &&
    !isCachedServiceLifecycleVersionNewer(existing, authoritative) &&
    !hasDifferentServiceIdentity(existing, authoritative);
}

function buildNewerIncarnationServiceReplacement(existing, authoritative) {
  const replacement = fastJsonClone(existing);
  for (const fieldName of HLC_LOCAL_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(authoritative || {}, fieldName)) {
      delete replacement[fieldName];
    }
  }
  for (const [fieldName, fieldValue] of Object.entries(authoritative)) {
    replacement[fieldName] = fastJsonClone(fieldValue);
  }
  return replacement;
}

function buildSameIncarnationBaseReplacement(existing, authoritative) {
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
    if (
      !Object.prototype.hasOwnProperty.call(replacement, fieldName) ||
      authorityFillsAbsentCachedServiceField(
        existing,
        authoritative,
        fieldName,
      )
    ) {
      replacement[fieldName] = fastJsonClone(fieldValue);
    }
  }
  return replacement;
}

function buildAuthoritativeServiceLifecycleCacheReplacement(
  existing,
  authoritative,
  options = {},
) {
  if (isPartitionCleanupServiceRow(authoritative)) {
    return buildAuthoritativeSystemTableCacheReplacement(
      TABLES.SERVICES,
      existing,
      authoritative,
    );
  }
  if (isCachedServiceIncarnationNewer(existing, authoritative, options)) {
    return fastJsonClone(existing);
  }
  if (isCachedServiceIncarnationOlder(existing, authoritative, options)) {
    return buildNewerIncarnationServiceReplacement(existing, authoritative);
  }
  const replacement = buildSameIncarnationBaseReplacement(
    existing,
    authoritative,
  );
  for (const fieldName of SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES) {
    replacement[fieldName] = fastJsonClone(authoritative[fieldName]);
  }
  if (Object.prototype.hasOwnProperty.call(
    authoritative,
    SYSTEM_TABLE_CACHE_SERVICE_RECONCILIATION_FIELD.PORT,
  )) {
    replacement.port = fastJsonClone(authoritative.port);
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
  hasDifferentReplicaBirthIncarnation,
  omitSystemTableCacheLocalFields,
};
