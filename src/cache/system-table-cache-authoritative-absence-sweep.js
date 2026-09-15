import {normalizeCauseId} from '../utils/cause-id.js';
import {CACHE_CDC_OPERATIONS, CACHE_LOG_MSG} from './cache-constants.js';
import {
  isUsableSystemCacheKey,
  resolveSystemCacheRowKey,
} from
  './system-cache-key-descriptor.js';
import {getRecordTimestamp} from './system-table-cache-row-merge.js';

const AUTHORITATIVE_OBSERVED_AT_FIELD = 'authoritativeObservedAtMs';

function rowKey(tableName, row) {
  return resolveSystemCacheRowKey(tableName, row);
}

function buildAuthoritativeKeySet(tableName, authoritativeRows) {
  const keys = new Set();
  for (const row of authoritativeRows) {
    const key = rowKey(tableName, row);
    if (!row || typeof row !== 'object' ||
        !isUsableSystemCacheKey(key) || keys.has(key)) {
      return null;
    }
    keys.add(key);
  }
  return keys;
}

function mutationSnapshotEntryValid(tableName, entry) {
  const key = entry?.key;
  const record = entry?.record;
  return Boolean(
    entry && typeof entry === 'object' &&
    record && typeof record === 'object' && !Array.isArray(record) &&
    isUsableSystemCacheKey(key) && rowKey(tableName, record) === key &&
    Number.isSafeInteger(entry.mutationRevision) && entry.mutationRevision >= 0,
  );
}

function mutationSnapshotEntriesValid(tableName, entries) {
  const keys = new Set();
  return Array.isArray(entries) && entries.every((entry) => {
    if (!mutationSnapshotEntryValid(tableName, entry) || keys.has(entry.key)) {
      return false;
    }
    keys.add(entry.key);
    return true;
  });
}

function getSweepMutationEntries(cache, tableName, options) {
  const suppliedSnapshots = options?.mutationSnapshots;
  if (
    suppliedSnapshots &&
    Object.prototype.hasOwnProperty.call(suppliedSnapshots, tableName)
  ) {
    const supplied = suppliedSnapshots[tableName];
    return supplied?.tableName === tableName &&
      mutationSnapshotEntriesValid(tableName, supplied.entries) ?
      supplied.entries :
      null;
  }
  if (Object.prototype.hasOwnProperty.call(
    options || {},
    AUTHORITATIVE_OBSERVED_AT_FIELD,
  )) {
    return null;
  }
  const captured = cache.captureTableMutationSnapshot(tableName);
  return captured?.tableName === tableName &&
    mutationSnapshotEntriesValid(tableName, captured.entries) ?
    captured.entries :
    null;
}

function authoritativeObservationOptionValid(options) {
  if (!Object.prototype.hasOwnProperty.call(
    options || {},
    AUTHORITATIVE_OBSERVED_AT_FIELD,
  )) {
    return true;
  }
  return Number.isFinite(options.authoritativeObservedAtMs) &&
    options.authoritativeObservedAtMs >= 0;
}

function authoritativeSweepTableInputsValid(
  cache,
  tableName,
  authoritativeRows,
  options,
) {
  return cache.tables.has(tableName) &&
    Array.isArray(authoritativeRows) &&
    authoritativeObservationOptionValid(options);
}

function recordAuthoritativeAbsence(cache, tableName, key, row, options) {
  cache.tombstoneStore.record(tableName, key, row, {
    authoritativeAbsence: true,
    authoritativeObservedAtMs: options?.authoritativeObservedAtMs,
  });
}

function rowChangedSinceSnapshot(currentSnapshot, beforeEntry) {
  return currentSnapshot.record &&
    (
      !Number.isFinite(currentSnapshot.mutationRevision) ||
      !Number.isFinite(beforeEntry?.mutationRevision) ||
      currentSnapshot.mutationRevision !== beforeEntry.mutationRevision
    );
}

function shouldPreserveByAge(record, evictOlderThanMs) {
  if (!Number.isFinite(evictOlderThanMs)) {
    return false;
  }
  const rowTimestamp = getRecordTimestamp(record);
  return Number.isFinite(rowTimestamp) && rowTimestamp >= evictOlderThanMs;
}

function removeSnapshotEntry(cache, tableName, entry, options, removed) {
  const key = entry?.key;
  if (typeof key === 'undefined' || !entry?.record) {
    return;
  }
  const currentSnapshot = cache.captureRecordMutationSnapshot(tableName, key);
  if (rowChangedSinceSnapshot(currentSnapshot, entry)) {
    return;
  }
  if (!currentSnapshot.record) {
    recordAuthoritativeAbsence(cache, tableName, key, entry.record, options);
    return;
  }
  if (shouldPreserveByAge(currentSnapshot.record, options?.evictOlderThanMs)) {
    return;
  }
  const table = cache.tables.get(tableName);
  table.delete(key);
  cache.lastCdcObservationByTableName.get(tableName).delete(key);
  recordAuthoritativeAbsence(
    cache,
    tableName,
    key,
    currentSnapshot.record,
    options,
  );
  removed.push({tableName, key});
  cache.logger.debug(CACHE_LOG_MSG.ANTI_ENTROPY_SWEEP_DELETE, {tableName, key});
  // The same watermark, and therefore the same clock authority: the cache's.
  cache.lastAppliedAtMsByTableName.set(tableName, cache.timeSource.now());
  const tableMutationRevision = cache.recordTableMutation(tableName, key);
  cache.notifyListeners(
    tableName,
    CACHE_CDC_OPERATIONS.DELETE,
    cache.deepClone(currentSnapshot.record),
    Object.freeze({
      causeId: normalizeCauseId(null),
      tableMutationRevision,
    }),
  );
}

function reconcileSystemTableCacheAgainstAuthoritativeTruth(
  cache,
  truthSnapshot = {},
  options = {},
) {
  const removed = [];
  for (const [tableName, authoritativeRows] of Object.entries(truthSnapshot)) {
    if (!authoritativeSweepTableInputsValid(
      cache,
      tableName,
      authoritativeRows,
      options,
    )) {
      continue;
    }
    const authoritativeKeys = buildAuthoritativeKeySet(
      tableName,
      authoritativeRows,
    );
    if (!authoritativeKeys) {
      continue;
    }
    const mutationEntries = getSweepMutationEntries(cache, tableName, options);
    if (!Array.isArray(mutationEntries)) {
      continue;
    }
    for (const entry of mutationEntries) {
      if (!authoritativeKeys.has(entry?.key)) {
        removeSnapshotEntry(cache, tableName, entry, options, removed);
      }
    }
    cache.recordAuthoritativeObservation(
      tableName,
      {
        observedAtMs: options?.authoritativeObservedAtMs,
        causeId: `authoritative-absence-sweep:${tableName}`,
      },
    );
  }
  return {removed};
}

export {reconcileSystemTableCacheAgainstAuthoritativeTruth};
