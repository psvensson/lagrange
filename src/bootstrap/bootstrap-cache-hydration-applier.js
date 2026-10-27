import {COLUMN} from '../constants/index.js';
import {resolveSystemCacheRowKey} from
  '../cache/system-cache-key-descriptor.js';
import {
  getRecordHlc,
  getRecordTimestamp,
} from '../cache/system-table-cache-row-merge.js';

function resolveEffectiveSeedTimestampMs(row) {
  const hlc = getRecordHlc(row);
  return Number.isFinite(hlc?.physical) ?
    hlc.physical :
    getRecordTimestamp(row);
}

function shouldAdvanceSeedRow(row, observedAtMs) {
  if (!Number.isFinite(observedAtMs)) {
    return false;
  }
  const effectiveTimestampMs = resolveEffectiveSeedTimestampMs(row);
  return !Number.isFinite(effectiveTimestampMs) ||
    effectiveTimestampMs <= observedAtMs;
}

function advanceSeedRowPastAuthoritativeObservation(row, observedAtMs) {
  const minTimestampMs = Math.floor(observedAtMs) + 1;
  const currentUpdatedAt = Number(row?.[COLUMN.UPDATED_AT]);
  const nextRow = {
    ...row,
    [COLUMN.UPDATED_AT]: Number.isFinite(currentUpdatedAt) ?
      Math.max(currentUpdatedAt, minTimestampMs) :
      minTimestampMs,
  };
  const hlc = getRecordHlc(row);
  if (hlc && hlc.physical <= observedAtMs) {
    delete nextRow[COLUMN.UPDATED_AT_HLC];
  }
  return nextRow;
}

function clearSeedRowTombstone(systemTableCache, tableName, row) {
  const key = resolveSystemCacheRowKey(tableName, row);
  if (key !== undefined) {
    systemTableCache?.tombstoneStore?.clearKey?.(tableName, key);
  }
}

/**
 * Prepare a join-time / bootstrap-seeded row so a concurrent authoritative
 * absence observation taken before the registration write committed cannot
 * fence the local cache seed.
 *
 * @param {Object} systemTableCache - Target cache.
 * @param {string} tableName - System table name.
 * @param {Object} row - Row to seed.
 * @return {Object} Prepared row.
 */
function prepareBootstrapHydrationRow(systemTableCache, tableName, row) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  clearSeedRowTombstone(systemTableCache, tableName, row);
  const observedAtMs =
    systemTableCache?.getLastAuthoritativeObservedAtMs?.(tableName);
  return shouldAdvanceSeedRow(row, observedAtMs) ?
    advanceSeedRowPastAuthoritativeObservation(row, observedAtMs) :
    row;
}

/**
 * Bootstrap-only cache hydration applier.
 *
 * This is the sanctioned direct-cache exception for seed/join hydration
 * before steady-state CDC subscriptions are active.
 *
 * Synchronous by contract: a thrown cache failure must propagate to the
 * registration boundary instead of escaping as an unobserved rejection.
 *
 * @param {Object} systemTableCache - Target cache.
 * @return {Function} Bootstrap-only row applier.
 */
function createBootstrapCacheHydrationApplier(systemTableCache) {
  return (tableName, operation, row) => {
    systemTableCache.applySystemTableChange(
      tableName,
      operation,
      prepareBootstrapHydrationRow(systemTableCache, tableName, row),
    );
  };
}

export {
  createBootstrapCacheHydrationApplier,
  prepareBootstrapHydrationRow,
};
