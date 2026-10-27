// The existing CDC visibility owner's absence repair. A conditional deletion
// observes disappearance of its matched row, never disappearance of a successor.
import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {cacheRecordChangedDuringAuthoritativeAbsenceRead} from
  './cdc-integration-service-cache-visibility-authority.js';

const {CDC_OPERATION, READ_MODEL_DIVERGENCE_TYPE, SYSTEM_TABLE_VISIBILITY_STATE,
  buildSystemTableVisibilityResult, resolveAuthoritativeFallbackOutcome} =
  CDC_INTEGRATION_SERVICE_SHARED;

function isDeletedRowObservationSatisfied(service, row, expectedFields) {
  if (!row) return true;
  // Missing projected fields are unknown, not evidence of a different row.
  return Object.entries(expectedFields || {}).some(([field, expected]) =>
    Object.hasOwn(row, field) && row[field] !== undefined &&
    !service.doesCacheRecordMatchExpectedFields(row, {[field]: expected}));
}

function repairDeletedRowVisibility(service, observation) {
  const {tableName, key, primaryKeyField, expectedFields, rows,
    projectionBeforeRead, projectionAfterRead} = observation;
  if (rows.some((row) => !isDeletedRowObservationSatisfied(service, row, expectedFields))) {
    return buildSystemTableVisibilityResult({visibilityState: null});
  }
  // Any row returned must be the requested key. An invalid read cannot be
  // interpreted as absence or as permission to install another row.
  if (rows.length > 1 || (rows.length === 1 && rows[0]?.[primaryKeyField] !== key)) {
    return buildSystemTableVisibilityResult({visibilityState: null});
  }
  const satisfied = () => service.isCacheExpectationSatisfied(
    tableName, key, false, expectedFields);
  // A successor is already visible. Do not replace or delete it using an older
  // authoritative snapshot, even when that snapshot says the key is absent.
  if (service.hasCacheRecord(tableName, key) && satisfied()) {
    return buildSystemTableVisibilityResult({authoritativeVisibilityConfirmed: true});
  }
  if (cacheRecordChangedDuringAuthoritativeAbsenceRead(tableName,
    projectionBeforeRead, projectionAfterRead)) {
    return buildSystemTableVisibilityResult({visibilityState: null});
  }
  return applyDeletionVisibilityRepair(service, observation);
}

function deletionVisibilityRepair(observation) {
  const {tableName, key, primaryKeyField, rows,
    projectionBeforeRead, projectionAfterRead} = observation;
  const row = rows[0] || projectionAfterRead?.record ||
    projectionBeforeRead?.record || {[primaryKeyField]: key};
  return {tableName, key, row,
    operation: rows.length > 0 ? CDC_OPERATION.UPSERT : CDC_OPERATION.DELETE};
}

function applyDeletionVisibilityRepair(service, observation) {
  const {tableName, key, primaryKeyField, expectedFields, rows, authoritativeObservedAtMs, phase,
    projectionAfterRead} = observation;
  const cachedRecord = projectionAfterRead?.record;
  const successor = rows[0] || null;
  if (cachedRecord) {
    service.emitCacheVisibilityDivergence(tableName, key,
      successor ? READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING :
        READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING,
      cachedRecord, successor, Object.keys(expectedFields || {[primaryKeyField]: key}), phase);
  }
  const repair = deletionVisibilityRepair(observation);
  const cacheRepaired = service.applyAuthoritativeCacheRepair(tableName,
    repair.operation, repair.row, key, {
      authoritativeObservedAtMs,
    });
  const visible = service.isCacheExpectationSatisfied(tableName, key, false, expectedFields);
  service.recordAuthoritativeFallbackSignal({tableName, key, expectPresent: false, phase,
    outcome: resolveAuthoritativeFallbackOutcome(cacheRepaired && visible)});
  return buildSystemTableVisibilityResult({
    visibilityState: visible ? SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE :
      SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
    authoritativeVisibilityConfirmed: true,
    cacheRepaired,
  });
}

export {isDeletedRowObservationSatisfied, repairDeletedRowVisibility};
