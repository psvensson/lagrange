import {
  areAuthoritativeSystemTableCacheRowsAligned,
  areAuthoritativeSystemTableCacheRowsEqual,
} from '../cache/system-table-cache-authoritative-reconciliation.js';
import {
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
} from '../cache/cache-constants.js';
import {CDC_OPERATION, COLUMN} from '../constants/index.js';
import {CDC_ERROR_CODE, CDC_TERMINAL_STAGE} from './cdc-constants.js';
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

// The one cache owner of authoritative repair, sweep, mutation snapshots and
// observation receipts is the writable SystemTableCache (cacheMutationTarget).
// The read view (systemTableCache) is a projection of that same cache, never a
// second owner. Unbound is a typed refusal, not an empty answer.
function requireCacheMutationTarget(service) {
  const cache = service.cacheMutationTarget;
  if (cache) return cache;
  throw Object.assign(new Error(CDC_ERROR_CODE.CACHE_OWNER_UNBOUND),
    {code: CDC_ERROR_CODE.CACHE_OWNER_UNBOUND, nodeId: service.nodeId});
}

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
  return requireCacheMutationTarget(service)
    .captureTableMutationSnapshot(tableName);
}

function authoritativeCacheSweepInputsValid(
  service,
  tableName,
  authoritativeRows,
  options,
) {
  return Boolean(
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

function applyAuthoritativeCacheRepairRow(
  service,
  tableName,
  operation,
  row,
  key,
  options = {},
) {
  const cache = requireCacheMutationTarget(service);
  if (!row || typeof row !== 'object') {
    return false;
  }
  const canonicalRow = canonicalizeSystemTableRow(tableName, row);
  const mutationMode = resolveAuthoritativeCacheRepairMutationMode(
    operation,
    options.mutationMode,
  );
  const currentRow = cache.get(tableName, key);
  const currentRowSatisfiesRepair =
    doesCachedRowSatisfyAuthoritativeRepair({
      tableName,
      operation,
      currentRow,
      authoritativeRow: canonicalRow,
      mutationMode,
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
    authoritativeObservedAtMs: options.authoritativeObservedAtMs,
    authoritativeReadStartedAtMs:
      options.authoritativeReadStartedAtMs,
  };
  const repairRow = Object.assign(
    {},
    options.originHlc ? {[COLUMN.UPDATED_AT_HLC]: options.originHlc} : null,
    canonicalRow,
  );
  cache.applySystemTableChange(
    tableName,
    operation,
    repairRow,
    mutationOptions,
  );
  return cacheRepairSatisfiedAfterApply({
    cacheMutationTarget: cache,
    tableName,
    operation,
    authoritativeRow: canonicalRow,
    mutationMode,
    key,
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
  const cache = requireCacheMutationTarget(service);
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
  const result = cache.reconcileAgainstAuthoritativeTruth(
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
  return requireCacheMutationTarget(service)
    .captureRecordMutationSnapshot(tableName, key);
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
  cacheRecordChangedDuringAuthoritativeAbsenceRead,
  captureAuthoritativeCacheSweepSnapshot,
  captureCacheRecordBeforeAbsenceRepair,
  requireCacheMutationTarget,
  resolveCacheVisibilityRepairReadAuthority,
};
