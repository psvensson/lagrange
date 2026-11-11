import {COLUMN, TABLES} from '../constants/index.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {isNodeHeartbeatWatermarkRegression} from '../node/node-readiness-policy.js';
import {
  mergeControlPlanePublicationRows,
} from '../control-plane/control-plane-publication-merge.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {
  SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES,
} from './cache-constants.js';

const LOCAL_ZERO = 0;
const NO_ADVANCED_SERVICE_LIFECYCLE_FIELDS = Object.freeze([]);

const INCARNATION_SENSITIVE_FIELD_NAMES = Object.freeze(new Set([
  'raft_role',
  'raftRole',
  'status',
  'state_entered_at',
  'stateEnteredAt',
  'previous_state',
  'previousState',
  'trigger_reason',
  'triggerReason',
  'error_message',
  'errorMessage',
  'create_attempt_token',
  'createAttemptToken',
  'cleanup_token',
  'cleanupToken',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'boot_id',
  'bootId',
  'endpoint_incarnation',
  'endpointIncarnation',
]));

function isIncarnationSensitiveField(fieldName) {
  return INCARNATION_SENSITIVE_FIELD_NAMES.has(fieldName);
}

function extractStringToken(val) {
  return typeof val === 'string' && val.length > LOCAL_ZERO ? val : null;
}

function extractPositiveNumber(val) {
  const num = Number(val);
  return Number.isFinite(num) && num > LOCAL_ZERO ? num : null;
}

const INCARNATION_PROP_NAMES = Object.freeze([
  'replicaId',
  'serviceId',
  'operationId',
  'createAttemptToken',
  'cleanupToken',
  'bootId',
  'endpointIncarnation',
  'createdAt',
]);

function hasAnyIncarnationIdentity(identity) {
  return INCARNATION_PROP_NAMES.some((key) => identity[key] !== null);
}

function extractRowReplicaIncarnation(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const identity = {
    replicaId: extractStringToken(row.replica_id),
    serviceId: extractStringToken(row.service_id),
    operationId: extractStringToken(row.operation_id),
    createAttemptToken: extractStringToken(row.create_attempt_token),
    cleanupToken: extractStringToken(row.cleanup_token),
    bootId: extractStringToken(row.boot_id),
    endpointIncarnation: extractStringToken(row.endpoint_incarnation),
    createdAt: extractPositiveNumber(row.created_at),
  };
  identity.hasIdentity = hasAnyIncarnationIdentity(identity);
  return identity;
}

const INCARNATION_IDENTITY_KEYS = Object.freeze([
  'replicaId',
  'serviceId',
  'bootId',
  'endpointIncarnation',
  'createdAt',
]);

function hasConflictingIncarnationIdentity(existingIdentity, incomingIdentity) {
  if (!existingIdentity || !incomingIdentity) {
    return false;
  }
  return INCARNATION_IDENTITY_KEYS.some((key) => {
    const a = existingIdentity[key];
    const b = incomingIdentity[key];
    return a !== null && b !== null && a !== b;
  });
}

const POSITIVE_MATCH_KEYS = Object.freeze([
  'replicaId',
  'serviceId',
  'cleanupToken',
]);

function hasMismatchedExistingKey(existingId, incomingId) {
  return POSITIVE_MATCH_KEYS.some((key) => {
    const existingVal = existingId?.[key];
    const incomingVal = incomingId?.[key];
    return existingVal !== null && incomingVal !== null && incomingVal !== existingVal;
  });
}

function isAnonymousServiceIdentity(id) {
  return id?.replicaId === null && id?.createAttemptToken === null;
}

function hasPositiveIncarnationMatch(tableName, existing, incoming) {
  const existingId = extractRowReplicaIncarnation(existing);
  const incomingId = extractRowReplicaIncarnation(incoming);

  if (hasConflictingIncarnationIdentity(existingId, incomingId)) {
    return false;
  }
  if (hasMismatchedExistingKey(existingId, incomingId)) {
    return false;
  }
  if (tableName === TABLES.SERVICES && isAnonymousServiceIdentity(incomingId)) {
    return isAnonymousServiceIdentity(existingId);
  }
  return true;
}

function deepClone(value) {
  return fastJsonClone(value);
}

function getRecordTimestamp(record) {
  const updatedAt = Number(record?.[COLUMN.UPDATED_AT]);
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    return updatedAt;
  }
  const createdAt = Number(record?.[COLUMN.CREATED_AT]);
  if (Number.isFinite(createdAt) && createdAt > 0) {
    return createdAt;
  }
  return null;
}

// Parse the per-row origin HLC stamp (`updated_at_hlc`) when present. The HLC is a
// globally comparable causal version (physical, logical, nodeId tie-break); when both
// records carry one it is the authoritative ordering, immune to equal-millisecond
// `updated_at` ties and to cross-leader wall-clock skew.
function getRecordHlc(record) {
  return tryParseHLCTimestamp(record?.[COLUMN.UPDATED_AT_HLC]);
}

function extractStateEnteredAt(row) {
  return extractPositiveNumber(row?.state_entered_at);
}

function isLifecycleTimestampRegressing(existingTs, incomingTs) {
  if (existingTs === null || incomingTs === null) {
    return false;
  }
  return incomingTs < existingTs;
}

function isServiceLifecycleRegressionOnEqualTimestamp(existing, incoming) {
  const existingTs = extractStateEnteredAt(existing);
  const incomingTs = extractStateEnteredAt(incoming);
  return isLifecycleTimestampRegressing(existingTs, incomingTs);
}

// `sameEntryOrder` orders two versions of one source entry (equal origin HLC)
// by source ordinal (system-table-cache-source-order.js): nonzero, it decides.
function isStaleForExistingRecord(tableName, existing, incoming, sameEntryOrder = 0) {
  if (sameEntryOrder !== 0) return sameEntryOrder < 0;
  // Prefer the origin HLC when both rows carry one: it is a total causal order, so
  // equal-`updated_at` ties resolve deterministically and identically on every replica.
  const existingHlc = getRecordHlc(existing);
  const incomingHlc = getRecordHlc(incoming);
  const hlcOrder = existingHlc && incomingHlc ?
    incomingHlc.compare(existingHlc) : 0;
  if (hlcOrder !== 0) {
    return hlcOrder < 0;
  }

  const existingTimestamp = getRecordTimestamp(existing);
  const incomingTimestamp = getRecordTimestamp(incoming);

  if (Number.isFinite(existingTimestamp) &&
      Number.isFinite(incomingTimestamp) &&
      incomingTimestamp !== existingTimestamp) {
    return incomingTimestamp < existingTimestamp;
  }

  if (
    tableName === TABLES.SERVICES &&
    isServiceLifecycleRegressionOnEqualTimestamp(existing, incoming)
  ) {
    return true;
  }

  return tableName === TABLES.NODES &&
    isNodeHeartbeatWatermarkRegression(existing, incoming);
}

function deletePredicateValueMatches(recordValue, predicateValue) {
  if (predicateValue === null || typeof predicateValue === 'undefined') {
    return recordValue === null || typeof recordValue === 'undefined';
  }
  return recordValue !== null && typeof recordValue !== 'undefined' &&
    String(recordValue) === String(predicateValue);
}

// A DELETE's CDC payload is its where-clause predicate, not a row version.
// CDC emits only applied deletes, so a cached row that satisfies the whole
// predicate is exactly a version the durable DELETE removed.
function recordSatisfiesDeletePredicate(record, predicate) {
  const entries = Object.entries(predicate || {})
    .filter(([column]) => column !== COLUMN.UPDATED_AT_HLC);
  return entries.length > 0 && entries.every(([column, value]) =>
    deletePredicateValueMatches(record?.[column], value));
}

/**
 * Whether the cached row is causally newer than an applied DELETE. The
 * origin HLC orders both when each carries one. Without that pair the
 * predicate's columns are not a version: a row satisfying the predicate was
 * removed by it, whatever unrelated metadata advanced its updated_at, and
 * only a row outside the predicate falls back to row-version ordering.
 * @param {string} tableName
 * @param {Object} existing
 * @param {Object} deletePredicate
 * @return {boolean}
 */
function isDeleteSupersededByExistingRecord(tableName, existing, deletePredicate,
  sameEntryOrder = 0) {
  if (sameEntryOrder !== 0) return sameEntryOrder < 0;
  const hlcOrdered = Boolean(getRecordHlc(existing) &&
    getRecordHlc(deletePredicate));
  if (!hlcOrdered &&
      recordSatisfiesDeletePredicate(existing, deletePredicate)) {
    return false;
  }
  return isStaleForExistingRecord(tableName, existing, deletePredicate);
}

/**
 * The tombstone of an applied DELETE carries the deleted row's version and
 * creation identity, not the predicate's, so a late write of the removed row
 * cannot outrank it merely because the predicate named no updated_at.
 * @param {Object|null} existing - Cached row the DELETE removed.
 * @param {Object} deletePredicate
 * @return {Object}
 */
function buildDeletedRowTombstoneSource(existing, deletePredicate) {
  if (!existing) {
    return deletePredicate;
  }
  const versions = [getRecordTimestamp(existing),
    getRecordTimestamp(deletePredicate)].filter(Number.isFinite);
  return {
    ...deletePredicate,
    [COLUMN.CREATED_AT]: existing[COLUMN.CREATED_AT] ??
      deletePredicate?.[COLUMN.CREATED_AT],
    [COLUMN.UPDATED_AT]: versions.length > 0 ? Math.max(...versions) : null,
  };
}

function shouldUsePublicationMerge(existing, incoming) {
  return Boolean(existing?.publication_id || incoming?.publication_id);
}

function cloneFieldValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return deepClone(value);
}

function shouldBackfillMissingField(field, existingValue, incomingValue) {
  if (field === COLUMN.UPDATED_AT_HLC) {
    return false;
  }
  const existingMissing = existingValue === null ||
    typeof existingValue === 'undefined';
  const incomingPresent = incomingValue !== null &&
    typeof incomingValue !== 'undefined';
  return existingMissing && incomingPresent;
}

/**
 * SERVICES is a composite multi-owner row. A raft-role write can advance the
 * row-level updated_at while the replica lifecycle owner is still persisting
 * its next state. When that later lifecycle delivery carries a strictly newer
 * state_entered_at but an older updated_at, generic row LWW must retain the
 * role-owned fields/version while still accepting the newer lifecycle fields.
 * @param {string} tableName
 * @param {Object} existing
 * @param {Object} incoming
 * @return {{applied: boolean, record: Object, advancedFields: string[]}}
 */
function hasValidStatusString(row) {
  return typeof row?.status === 'string' && row.status.length > LOCAL_ZERO;
}

function isTimestampAdvancing(existingTs, incomingTs) {
  if (incomingTs === null) {
    return false;
  }
  if (existingTs === null) {
    return true;
  }
  return incomingTs > existingTs;
}

function canAdvanceServiceLifecycle(tableName, existing, incoming) {
  if (tableName !== TABLES.SERVICES) {
    return false;
  }
  if (!hasPositiveIncarnationMatch(tableName, existing, incoming)) {
    return false;
  }
  if (!hasValidStatusString(incoming)) {
    return false;
  }
  const existingTs = extractStateEnteredAt(existing);
  const incomingTs = extractStateEnteredAt(incoming);
  return isTimestampAdvancing(existingTs, incomingTs);
}

function buildStaleServiceLifecycleAdvance(tableName, existing, incoming) {
  const record = deepClone(existing);
  if (!canAdvanceServiceLifecycle(tableName, existing, incoming)) {
    return {
      applied: false,
      record,
      advancedFields: NO_ADVANCED_SERVICE_LIFECYCLE_FIELDS,
    };
  }
  const advancedFields = [];
  for (const fieldName of SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(incoming, fieldName)) {
      continue;
    }
    const incomingValue = incoming[fieldName];
    if (JSON.stringify(record[fieldName]) === JSON.stringify(incomingValue)) {
      continue;
    }
    record[fieldName] = cloneFieldValue(incomingValue);
    advancedFields.push(fieldName);
  }
  return {
    applied: advancedFields.length > LOCAL_ZERO,
    record,
    advancedFields,
  };
}

function handlePublicationStaleBackfill(table, key, existing, incoming) {
  const mergedRecord = mergeControlPlanePublicationRows(existing, incoming);
  if (JSON.stringify(mergedRecord) === JSON.stringify(existing)) {
    return {
      applied: false,
      record: existing,
      backfilledFields: NO_ADVANCED_SERVICE_LIFECYCLE_FIELDS,
    };
  }
  table.set(key, mergedRecord);
  return {
    applied: true,
    record: mergedRecord,
    backfilledFields: Object.keys(incoming),
  };
}

function hasMismatchedToken(a, b) {
  return a !== null && b !== null && a !== b;
}

function hasConflictingCleanupToken(existingCleanup, incomingCleanup) {
  return existingCleanup !== null && incomingCleanup !== existingCleanup;
}

function isConflictingStaleIncarnation(existingId, incomingId) {
  if (hasConflictingIncarnationIdentity(existingId, incomingId)) {
    return true;
  }
  if (hasMismatchedToken(
    existingId?.createAttemptToken,
    incomingId?.createAttemptToken,
  )) {
    return true;
  }
  return hasConflictingCleanupToken(
    existingId?.cleanupToken,
    incomingId?.cleanupToken,
  );
}

function applyStaleRowBackfill(
  tableName,
  table,
  key,
  existing,
  incoming,
) {
  if (shouldUsePublicationMerge(existing, incoming)) {
    return handlePublicationStaleBackfill(table, key, existing, incoming);
  }

  const existingId = extractRowReplicaIncarnation(existing);
  const incomingId = extractRowReplicaIncarnation(incoming);
  if (isConflictingStaleIncarnation(existingId, incomingId)) {
    return {
      applied: false,
      record: existing,
      backfilledFields: NO_ADVANCED_SERVICE_LIFECYCLE_FIELDS,
    };
  }

  const positiveIncarnationMatch = hasPositiveIncarnationMatch(
    tableName,
    existing,
    incoming,
  );

  const lifecycleAdvance = buildStaleServiceLifecycleAdvance(
    tableName,
    existing,
    incoming,
  );
  const merged = lifecycleAdvance.record;
  const backfilledFields = [...lifecycleAdvance.advancedFields];

  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (!positiveIncarnationMatch && isIncarnationSensitiveField(field)) {
      continue;
    }
    if (shouldBackfillMissingField(field, merged[field], incomingValue)) {
      merged[field] = cloneFieldValue(incomingValue);
      backfilledFields.push(field);
    }
  }

  if (backfilledFields.length === LOCAL_ZERO) {
    return {
      applied: false,
      record: existing,
      backfilledFields,
    };
  }

  table.set(key, merged);
  return {
    applied: true,
    record: merged,
    backfilledFields,
  };
}

function hasMatchingTokens(existing, incoming) {
  const existingAttempt = extractStringToken(existing?.create_attempt_token);
  const incomingAttempt = extractStringToken(incoming?.create_attempt_token);
  if (existingAttempt !== incomingAttempt) {
    return false;
  }
  const existingCleanup = extractStringToken(existing?.cleanup_token);
  const incomingCleanup = extractStringToken(incoming?.cleanup_token);
  return existingCleanup === incomingCleanup;
}

function shouldPreserveExistingServiceLifecycle(tableName, existing, incoming) {
  if (tableName !== TABLES.SERVICES) {
    return false;
  }
  if (!hasPositiveIncarnationMatch(tableName, incoming, existing)) {
    return false;
  }
  if (!hasMatchingTokens(existing, incoming)) {
    return false;
  }
  const existingTs = extractStateEnteredAt(existing);
  const incomingTs = extractStateEnteredAt(incoming);
  return isLifecycleTimestampRegressing(existingTs, incomingTs);
}

function mergeRecords(tableName, existing, incoming) {
  if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
    return mergeControlPlanePublicationRows(incoming, existing);
  }
  let merged;
  if (
    tableName === TABLES.SERVICES &&
    hasConflictingIncarnationIdentity(
      extractRowReplicaIncarnation(existing),
      extractRowReplicaIncarnation(incoming),
    )
  ) {
    const nonSensitiveExisting = {};
    for (const [key, value] of Object.entries(existing)) {
      if (!isIncarnationSensitiveField(key)) {
        nonSensitiveExisting[key] = value;
      }
    }
    merged = {...nonSensitiveExisting, ...deepClone(incoming)};
  } else {
    merged = {...existing, ...deepClone(incoming)};
  }

  if (shouldPreserveExistingServiceLifecycle(tableName, existing, incoming)) {
    for (const fieldName of SYSTEM_TABLE_CACHE_SERVICE_LIFECYCLE_FIELD_NAMES) {
      if (Object.prototype.hasOwnProperty.call(existing, fieldName)) {
        merged[fieldName] = cloneFieldValue(existing[fieldName]);
      }
    }
  }
  return merged;
}

function tryParseHLCTimestamp(value) {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }

  try {
    return HLCTimestamp.fromString(String(value));
  } catch {
    return null;
  }
}

function compareSchemaVersions(incomingVersion, currentVersion) {
  if (incomingVersion === currentVersion) {
    return 0;
  }

  const incomingHlc = tryParseHLCTimestamp(incomingVersion);
  const currentHlc = tryParseHLCTimestamp(currentVersion);
  if (incomingHlc && currentHlc) {
    return incomingHlc.compare(currentHlc);
  }

  const incomingNumber = Number(incomingVersion);
  const currentNumber = Number(currentVersion);
  if (Number.isFinite(incomingNumber) && Number.isFinite(currentNumber)) {
    return incomingNumber - currentNumber;
  }

  return String(incomingVersion).localeCompare(String(currentVersion));
}

export {
  applyStaleRowBackfill,
  buildDeletedRowTombstoneSource,
  cloneFieldValue,
  compareSchemaVersions,
  getRecordHlc,
  getRecordTimestamp,
  isDeleteSupersededByExistingRecord,
  isStaleForExistingRecord,
  mergeRecords,
  shouldBackfillMissingField,
  shouldUsePublicationMerge,
  tryParseHLCTimestamp,
};
