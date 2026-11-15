import {
  areAuthoritativeSystemTableCacheRowsAligned,
  areAuthoritativeSystemTableCacheRowsEqual,
  hasDifferentReplicaBirthIncarnation,
} from '../cache/system-table-cache-authoritative-reconciliation.js';
import {
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
} from '../cache/cache-constants.js';
import {CDC_OPERATION, COLUMN} from '../constants/index.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {applyAuthoritativeCacheMutation} from './cdc-terminal-gate.js';
import {canonicalizeSystemTableRow} from
  '../control-plane/system-row-normalizers.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from
  '../control-plane/control-plane-system-table-gateway-constants.js';

const CACHE_REPAIR_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE
      .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
});
const CACHE_ABSENCE_REPAIR_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});

function resolveCacheVisibilityRepairReadAuthority(expectPresent) {
  return expectPresent ?
    CACHE_REPAIR_READ_AUTHORITY :
    CACHE_ABSENCE_REPAIR_READ_AUTHORITY;
}

function resolveAuthoritativeCacheRepairMutationMode(
  operation,
  requestedMode,
) {
  if (requestedMode) {
    return requestedMode;
  }
  return operation === CDC_OPERATION.DELETE ?
    SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_ABSENCE_RECONCILIATION :
    SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION;
}

function cacheRepairSatisfiedAfterApply(options) {
  if (typeof options.cacheMutationTarget.get !== 'function') {
    return false;
  }
  const resultingRow = options.cacheMutationTarget.get(
    options.tableName,
    options.key,
  );
  if (options.operation === CDC_OPERATION.DELETE) {
    return !resultingRow;
  }
  return doesCachedRowSatisfyAuthoritativeRepair({
    tableName: options.tableName,
    operation: options.operation,
    currentRow: resultingRow,
    authoritativeRow: options.authoritativeRow,
    mutationMode: options.mutationMode,
    reconciliationOptions: options.reconciliationOptions,
  });
}

function authoritativeReadRowsAreValid(queryResult) {
  return queryResult?.success === true && Array.isArray(queryResult.rows);
}

function captureAuthoritativeCacheSweepSnapshot(service, tableName) {
  const cache =
    typeof service.cacheMutationTarget?.captureTableMutationSnapshot ===
      'function' ?
      service.cacheMutationTarget :
      service.systemTableCache;
  return typeof cache?.captureTableMutationSnapshot === 'function' ?
    cache.captureTableMutationSnapshot(tableName) :
    null;
}

function authoritativeCacheSweepInputsValid(
  service,
  tableName,
  authoritativeRows,
  options,
) {
  return Boolean(
    service.cacheMutationTarget &&
    typeof service.cacheMutationTarget.reconcileAgainstAuthoritativeTruth ===
      'function' &&
    typeof service.getPrimaryKeyField === 'function' &&
    Array.isArray(authoritativeRows) &&
    options?.mutationSnapshot?.tableName === tableName &&
    Array.isArray(options.mutationSnapshot.entries) &&
    Number.isFinite(options.authoritativeObservedAtMs),
  );
}

function canonicalizeCompleteAuthoritativeRows(
  service,
  tableName,
  authoritativeRows,
) {
  const primaryKeyField = service.getPrimaryKeyField(tableName);
  const canonicalRows = [];
  for (const row of authoritativeRows) {
    if (!row || typeof row !== 'object') {
      return null;
    }
    const canonicalRow = canonicalizeSystemTableRow(tableName, row);
    if (canonicalRow[primaryKeyField] === undefined ||
        canonicalRow[primaryKeyField] === null) {
      return null;
    }
    canonicalRows.push(canonicalRow);
  }
  return canonicalRows;
}

function resolveLastCdcSourceLogIndex(service, tableName, key) {
  const observation =
    service.cacheMutationTarget?.getLastCdcObservation?.(tableName, key) ??
    null;
  return Number.isSafeInteger(observation?.sourceLogIndex) ?
    observation.sourceLogIndex :
    null;
}

function hasValidMutationSnapshotPair(beforeSnapshot, afterSnapshot) {
  return Boolean(
    beforeSnapshot &&
    afterSnapshot &&
    Number.isFinite(beforeSnapshot.mutationRevision) &&
    Number.isFinite(afterSnapshot.mutationRevision),
  );
}

function didCacheChangeBirthIncarnationDuringRead(
  beforeSnapshot,
  afterSnapshot,
  currentRow,
) {
  if (
    !hasValidMutationSnapshotPair(beforeSnapshot, afterSnapshot) ||
    beforeSnapshot.mutationRevision === afterSnapshot.mutationRevision ||
    !currentRow
  ) {
    return false;
  }
  return !beforeSnapshot.record ||
    hasDifferentReplicaBirthIncarnation(beforeSnapshot.record, currentRow);
}

function resolveSourcePositionSupersessionFlags(
  readAppliedIndex,
  lastCdcSourceLogIndex,
) {
  if (
    !Number.isSafeInteger(readAppliedIndex) ||
    !Number.isSafeInteger(lastCdcSourceLogIndex)
  ) {
    return {readSupersedesCdc: false, cdcSupersedesRead: false};
  }
  return {
    readSupersedesCdc: readAppliedIndex > lastCdcSourceLogIndex,
    cdcSupersedesRead: lastCdcSourceLogIndex > readAppliedIndex,
  };
}

function hasExplicitIncarnationSupersessionOption(options) {
  return (
    typeof options.cachedIncarnationSupersedes === 'boolean' ||
    typeof options.authoritativeIncarnationSupersedes === 'boolean'
  );
}

function buildSourcePositionOptions(lastCdcSourceLogIndex, readAppliedIndex) {
  const positionOptions = {};
  if (Number.isSafeInteger(lastCdcSourceLogIndex)) {
    positionOptions.cachedSourceLogIndex = lastCdcSourceLogIndex;
  }
  if (Number.isSafeInteger(readAppliedIndex)) {
    positionOptions.authoritativeSourceLogIndex = readAppliedIndex;
  }
  return positionOptions;
}

function resolveReadWitnessAppliedIndex(options) {
  return Number(options?.readAuthorityWitness?.appliedIndex);
}

function resolvePointRepairSupersessionFlags({
  beforeReadSnapshot,
  afterReadSnapshot,
  currentRow,
  readAppliedIndex,
  lastCdcSourceLogIndex,
}) {
  const {readSupersedesCdc, cdcSupersedesRead} =
    resolveSourcePositionSupersessionFlags(
      readAppliedIndex,
      lastCdcSourceLogIndex,
    );
  const hasSnapshotFence = hasValidMutationSnapshotPair(
    beforeReadSnapshot,
    afterReadSnapshot,
  );
  const changedIncarnationDuringRead =
    didCacheChangeBirthIncarnationDuringRead(
      beforeReadSnapshot,
      afterReadSnapshot,
      currentRow,
    );
  const cachedIncarnationSupersedes =
    cdcSupersedesRead ||
    (changedIncarnationDuringRead && !readSupersedesCdc);
  const authoritativeIncarnationSupersedes =
    !cachedIncarnationSupersedes &&
    (readSupersedesCdc || (hasSnapshotFence && !changedIncarnationDuringRead));
  return {cachedIncarnationSupersedes, authoritativeIncarnationSupersedes};
}

function buildAuthoritativePointRepairOptions(
  service,
  tableName,
  key,
  options = {},
) {
  if (hasExplicitIncarnationSupersessionOption(options)) {
    return options;
  }
  const afterReadSnapshot = options.beforeReadSnapshot ?
    service.cacheMutationTarget?.captureRecordMutationSnapshot?.(
      tableName,
      key,
    ) ?? null :
    null;
  const currentRow = afterReadSnapshot?.record ?? null;
  const lastCdcSourceLogIndex = resolveLastCdcSourceLogIndex(
    service,
    tableName,
    key,
  );
  const readAppliedIndex = resolveReadWitnessAppliedIndex(options);
  return {
    ...options,
    ...buildSourcePositionOptions(lastCdcSourceLogIndex, readAppliedIndex),
    ...resolvePointRepairSupersessionFlags({
      beforeReadSnapshot: options.beforeReadSnapshot,
      afterReadSnapshot,
      currentRow,
      readAppliedIndex,
      lastCdcSourceLogIndex,
    }),
  };
}

function applyAuthoritativeCacheRepairRow(
  service,
  tableName,
  operation,
  row,
  key,
  options = {},
) {
  if (
    !service.cacheMutationTarget ||
    typeof service.cacheMutationTarget.applySystemTableChange !==
      'function' ||
    !row ||
    typeof row !== 'object'
  ) {
    return false;
  }
  const canonicalRow = canonicalizeSystemTableRow(tableName, row);
  const mutationMode = resolveAuthoritativeCacheRepairMutationMode(
    operation,
    options.mutationMode,
  );
  const repairOptions = buildAuthoritativePointRepairOptions(
    service,
    tableName,
    key,
    options,
  );
  const currentRow =
    typeof service.cacheMutationTarget.get === 'function' ?
      service.cacheMutationTarget.get(tableName, key) :
      null;
  const currentRowSatisfiesRepair =
    doesCachedRowSatisfyAuthoritativeRepair({
      tableName,
      operation,
      currentRow,
      authoritativeRow: canonicalRow,
      mutationMode,
      reconciliationOptions: repairOptions,
    });
  if (currentRowSatisfiesRepair) {
    // A complete authoritative observation is already the cache state. Keep
    // reconciliation idempotent at the cache boundary: reapplying the row
    // would mint a mutation generation and wake every readiness/publication
    // consumer even though no semantic state changed.
    return true;
  }
  const causeId = `authoritative-repair:${tableName}:${key}`;
  const mutationOptions = {
    causeId,
    mutationMode,
    authoritativeObservedAtMs: repairOptions.authoritativeObservedAtMs,
    authoritativeReadStartedAtMs:
      repairOptions.authoritativeReadStartedAtMs,
    readAuthorityWitness: repairOptions.readAuthorityWitness || null,
    cachedSourceLogIndex: repairOptions.cachedSourceLogIndex,
    authoritativeSourceLogIndex: repairOptions.authoritativeSourceLogIndex,
    cachedIncarnationSupersedes: repairOptions.cachedIncarnationSupersedes,
    authoritativeIncarnationSupersedes:
      repairOptions.authoritativeIncarnationSupersedes,
  };
  const repairRow = Object.assign(
    {},
    repairOptions.originHlc ?
      {[COLUMN.UPDATED_AT_HLC]: repairOptions.originHlc} :
      null,
    canonicalRow,
  );
  service.cacheMutationTarget.applySystemTableChange(
    tableName,
    operation,
    repairRow,
    mutationOptions,
  );
  return cacheRepairSatisfiedAfterApply({
    cacheMutationTarget: service.cacheMutationTarget,
    tableName,
    operation,
    authoritativeRow: canonicalRow,
    mutationMode,
    key,
    reconciliationOptions: repairOptions,
  });
}

// (b) The class's choke point: every authoritative cache repair and sweep
// passes the owner's terminal gate; once terminal, nothing is applied.
function applyAuthoritativeCacheRepair(service, tableName, operation, row, key,
  options = {}) {
  return applyAuthoritativeCacheMutation(service,
    CDC_TERMINAL_STAGE.CACHE_REPAIR,
    () => applyAuthoritativeCacheRepairRow(
      service, tableName, operation, row, key, options),
    false);
}

function applyAuthoritativeCacheSweepRows(
  service,
  tableName,
  authoritativeRows,
  options,
) {
  if (!authoritativeCacheSweepInputsValid(
    service,
    tableName,
    authoritativeRows,
    options,
  )) {
    return 0;
  }
  const canonicalRows = canonicalizeCompleteAuthoritativeRows(
    service,
    tableName,
    authoritativeRows,
  );
  if (!canonicalRows) {
    return 0;
  }
  const result = service.cacheMutationTarget.reconcileAgainstAuthoritativeTruth(
    {[tableName]: canonicalRows},
    {
      evictOlderThanMs: options?.readStartedAtMs,
      authoritativeObservedAtMs: options.authoritativeObservedAtMs,
      mutationSnapshots: {[tableName]: options.mutationSnapshot},
    },
  );
  return Array.isArray(result?.removed) ? result.removed.length : 0;
}

function captureCacheRecordBeforeAbsenceRepair(
  service,
  tableName,
  key,
  expectPresent,
) {
  if (expectPresent) {
    return undefined;
  }
  const cache =
    typeof service.cacheMutationTarget?.captureRecordMutationSnapshot ===
      'function' ?
      service.cacheMutationTarget :
      service.systemTableCache;
  if (typeof cache?.captureRecordMutationSnapshot === 'function') {
    return cache.captureRecordMutationSnapshot(tableName, key);
  }
  return Object.freeze({
    record: service.getCacheRecord(tableName, key),
    mutationRevision: null,
  });
}

function cacheRecordChangedDuringAuthoritativeAbsenceRead(
  _tableName,
  beforeReadSnapshot,
  afterReadSnapshot,
) {
  const beforeRead = beforeReadSnapshot?.record;
  const afterRead = afterReadSnapshot?.record;
  if (!afterRead) {
    return false;
  }
  if (!beforeRead) {
    return true;
  }
  if (
    Number.isFinite(beforeReadSnapshot?.mutationRevision) &&
    Number.isFinite(afterReadSnapshot?.mutationRevision)
  ) {
    return beforeReadSnapshot.mutationRevision !==
      afterReadSnapshot.mutationRevision;
  }
  return true;
}

function doesCachedRowSatisfyAuthoritativeRepair({
  tableName,
  operation,
  currentRow,
  authoritativeRow,
  mutationMode,
  reconciliationOptions,
}) {
  if (operation !== CDC_OPERATION.UPSERT || !currentRow) {
    return false;
  }
  if (
    mutationMode ===
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION
  ) {
    return areAuthoritativeSystemTableCacheRowsAligned(
      tableName,
      currentRow,
      authoritativeRow,
      reconciliationOptions,
    );
  }
  return areAuthoritativeSystemTableCacheRowsEqual(
    tableName,
    currentRow,
    authoritativeRow,
  );
}

function applyAuthoritativeCacheSweep(service, tableName, authoritativeRows,
  options) {
  return applyAuthoritativeCacheMutation(service,
    CDC_TERMINAL_STAGE.CACHE_SWEEP,
    () => applyAuthoritativeCacheSweepRows(
      service, tableName, authoritativeRows, options),
    0);
}

export {
  CACHE_REPAIR_READ_AUTHORITY,
  applyAuthoritativeCacheRepair,
  applyAuthoritativeCacheSweep,
  authoritativeReadRowsAreValid,
  buildAuthoritativePointRepairOptions,
  cacheRecordChangedDuringAuthoritativeAbsenceRead,
  captureAuthoritativeCacheSweepSnapshot,
  captureCacheRecordBeforeAbsenceRepair,
  resolveCacheVisibilityRepairReadAuthority,
};
