import {
  areAuthoritativeSystemTableCacheRowsAligned,
  areAuthoritativeSystemTableCacheRowsEqual,
} from '../cache/system-table-cache-authoritative-reconciliation.js';
import {
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
} from '../cache/cache-constants.js';
import {CDC_OPERATION} from '../constants/index.js';
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

function applyAuthoritativeCacheSweep(
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
    );
  }
  return areAuthoritativeSystemTableCacheRowsEqual(
    tableName,
    currentRow,
    authoritativeRow,
  );
}

export {
  CACHE_REPAIR_READ_AUTHORITY,
  applyAuthoritativeCacheSweep,
  authoritativeReadRowsAreValid,
  cacheRepairSatisfiedAfterApply,
  cacheRecordChangedDuringAuthoritativeAbsenceRead,
  captureAuthoritativeCacheSweepSnapshot,
  captureCacheRecordBeforeAbsenceRepair,
  doesCachedRowSatisfyAuthoritativeRepair,
  resolveAuthoritativeCacheRepairMutationMode,
  resolveCacheVisibilityRepairReadAuthority,
};
