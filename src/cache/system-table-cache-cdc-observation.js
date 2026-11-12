import {CACHE_CDC_OPERATIONS} from './cache-constants.js';
import {compareSchemaVersions} from './system-table-cache-row-merge.js';

function resolveCdcOriginHlc(row) {
  if (typeof row?.updated_at_hlc === 'string') {
    return row.updated_at_hlc;
  }
  return typeof row?.updatedAtHlc === 'string' ? row.updatedAtHlc : null;
}

function resolveIncomingOriginHlc(data, options) {
  const candidates = [
    data?.origin_hlc,
    data?.originHlc,
    data?.updated_at_hlc,
    data?.updatedAtHlc,
    options?.timestamp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function getOrCreateTableRevisionWatermarks(cache) {
  if (!cache || typeof cache !== 'object') {
    return null;
  }
  if (!(cache.tableRevisionWatermarks instanceof Map)) {
    cache.tableRevisionWatermarks = new Map();
  }
  return cache.tableRevisionWatermarks;
}

function hasCdcObservationMetadata(options) {
  return Boolean(
    options &&
      (Number.isSafeInteger(options.sourceLogIndex) ||
        Number.isSafeInteger(options.sourceOrdinal) ||
        typeof options.sourcePartition === 'string' ||
        typeof options.sourceReplica === 'string' ||
        Number.isFinite(options.cdcObservedAtMs)),
  );
}

function normalizeNonEmptyWatermarkString(value, fallback = null) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normalizeSafeIntegerWatermark(value, fallback = null) {
  return Number.isSafeInteger(value) ? value : fallback;
}

function normalizeMonotonicSafeIntegerWatermark(incoming, previous = null) {
  if (!Number.isSafeInteger(incoming)) {
    return normalizeSafeIntegerWatermark(previous, null);
  }
  return Number.isSafeInteger(previous) ?
    Math.max(previous, incoming) :
    incoming;
}

function normalizeMonotonicObservedAtMs(incoming, previous = null) {
  const prevMs = Number.isFinite(previous) ? previous : null;
  if (!Number.isFinite(incoming) || incoming < 0) {
    return prevMs;
  }
  const normalizedIncoming = Math.floor(incoming);
  return prevMs === null ?
    normalizedIncoming :
    Math.max(prevMs, normalizedIncoming);
}

function resolveTableMutationRevision(cache, tableName, prev) {
  return typeof cache?.getTableMutationVersion === 'function' ?
    cache.getTableMutationVersion(tableName) :
    (prev?.tableMutationRevision ?? 0);
}

function resolveNextSourceOrdinal(options, prev, nextLastSourceLogIndex) {
  const fallback = normalizeSafeIntegerWatermark(prev?.lastSourceOrdinal, null);
  if (
    !Number.isSafeInteger(options?.sourceOrdinal) ||
    options?.sourceLogIndex !== nextLastSourceLogIndex
  ) {
    return fallback;
  }
  if (prev?.lastSourceLogIndex === nextLastSourceLogIndex) {
    return normalizeMonotonicSafeIntegerWatermark(
      options.sourceOrdinal,
      fallback,
    );
  }
  return options.sourceOrdinal;
}

function resolveNextOriginHlc(data, options, previousHlc = null) {
  const incomingOriginHlc = resolveIncomingOriginHlc(data, options);
  const fallback = normalizeNonEmptyWatermarkString(previousHlc, null);
  if (!incomingOriginHlc) {
    return fallback;
  }
  if (!fallback || compareSchemaVersions(incomingOriginHlc, fallback) >= 0) {
    return incomingOriginHlc;
  }
  return fallback;
}

function preserveAuthoritativeWatermarkFields(prev) {
  return {
    lastAuthoritativeTerm:
      normalizeSafeIntegerWatermark(prev?.lastAuthoritativeTerm, null),
    lastAuthoritativeAppliedIndex:
      normalizeSafeIntegerWatermark(prev?.lastAuthoritativeAppliedIndex, null),
    lastAuthoritativeCommitIndex:
      normalizeSafeIntegerWatermark(prev?.lastAuthoritativeCommitIndex, null),
    lastAuthoritativeServingNodeId:
      normalizeNonEmptyWatermarkString(
        prev?.lastAuthoritativeServingNodeId,
        null,
      ),
    lastAuthoritativePartitionId:
      normalizeNonEmptyWatermarkString(
        prev?.lastAuthoritativePartitionId,
        null,
      ),
    lastAuthoritativeObservedAtMs:
      normalizeMonotonicObservedAtMs(null, prev?.lastAuthoritativeObservedAtMs),
  };
}

function preserveCdcWatermarkFields(prev) {
  return {
    lastSourcePartition:
      normalizeNonEmptyWatermarkString(prev?.lastSourcePartition, null),
    lastSourceReplica:
      normalizeNonEmptyWatermarkString(prev?.lastSourceReplica, null),
    lastSourceLogIndex:
      normalizeSafeIntegerWatermark(prev?.lastSourceLogIndex, null),
    lastSourceOrdinal:
      normalizeSafeIntegerWatermark(prev?.lastSourceOrdinal, null),
    lastOriginHlc: normalizeNonEmptyWatermarkString(prev?.lastOriginHlc, null),
    lastCdcObservedAtMs:
      normalizeMonotonicObservedAtMs(null, prev?.lastCdcObservedAtMs),
  };
}

/**
 * Record CDC-side revision watermark observations for one system table.
 * @param {Object} cache
 * @param {string} tableName
 * @param {Object} data
 * @param {Object} [options]
 * @return {Object|null}
 */
function recordCdcTableObservation(cache, tableName, data, options = {}) {
  const watermarks = getOrCreateTableRevisionWatermarks(cache);
  if (!watermarks || !normalizeNonEmptyWatermarkString(tableName)) {
    return null;
  }
  const prev = watermarks.get(tableName) || {};
  const nextLastSourceLogIndex = normalizeMonotonicSafeIntegerWatermark(
    options?.sourceLogIndex,
    prev.lastSourceLogIndex,
  );
  const nextWatermark = {
    tableName,
    tableMutationRevision:
      resolveTableMutationRevision(cache, tableName, prev),
    lastSourcePartition: normalizeNonEmptyWatermarkString(
      options?.sourcePartition,
      normalizeNonEmptyWatermarkString(prev.lastSourcePartition, null),
    ),
    lastSourceReplica: normalizeNonEmptyWatermarkString(
      options?.sourceReplica,
      normalizeNonEmptyWatermarkString(prev.lastSourceReplica, null),
    ),
    lastSourceLogIndex: nextLastSourceLogIndex,
    lastSourceOrdinal: resolveNextSourceOrdinal(
      options,
      prev,
      nextLastSourceLogIndex,
    ),
    lastOriginHlc: resolveNextOriginHlc(data, options, prev.lastOriginHlc),
    lastCdcObservedAtMs: normalizeMonotonicObservedAtMs(
      options?.cdcObservedAtMs,
      prev.lastCdcObservedAtMs,
    ),
    ...preserveAuthoritativeWatermarkFields(prev),
  };
  watermarks.set(tableName, nextWatermark);
  return nextWatermark;
}

/**
 * Record authoritative owner read revision watermark observations for one
 * system table.
 * @param {Object} cache
 * @param {string} tableName
 * @param {number|null} observedAtMs
 * @param {Object} [options]
 * @return {Object|null}
 */
function recordAuthoritativeTableObservation(
  cache,
  tableName,
  observedAtMs,
  options = {},
) {
  const watermarks = getOrCreateTableRevisionWatermarks(cache);
  if (!watermarks || !normalizeNonEmptyWatermarkString(tableName)) {
    return null;
  }
  const prev = watermarks.get(tableName) || {};
  const nextWatermark = {
    tableName,
    tableMutationRevision:
      resolveTableMutationRevision(cache, tableName, prev),
    ...preserveCdcWatermarkFields(prev),
    lastAuthoritativeTerm: normalizeSafeIntegerWatermark(
      options?.term,
      normalizeSafeIntegerWatermark(prev.lastAuthoritativeTerm, null),
    ),
    lastAuthoritativeAppliedIndex: normalizeMonotonicSafeIntegerWatermark(
      options?.appliedIndex,
      prev.lastAuthoritativeAppliedIndex,
    ),
    lastAuthoritativeCommitIndex: normalizeMonotonicSafeIntegerWatermark(
      options?.commitIndex,
      prev.lastAuthoritativeCommitIndex,
    ),
    lastAuthoritativeServingNodeId: normalizeNonEmptyWatermarkString(
      options?.servingNodeId,
      normalizeNonEmptyWatermarkString(
        prev.lastAuthoritativeServingNodeId,
        null,
      ),
    ),
    lastAuthoritativePartitionId: normalizeNonEmptyWatermarkString(
      options?.partitionId,
      normalizeNonEmptyWatermarkString(
        prev.lastAuthoritativePartitionId,
        null,
      ),
    ),
    lastAuthoritativeObservedAtMs: normalizeMonotonicObservedAtMs(
      observedAtMs,
      prev.lastAuthoritativeObservedAtMs,
    ),
  };
  watermarks.set(tableName, nextWatermark);
  return nextWatermark;
}

/**
 * Return a shallow copy of the revision watermark for one table.
 * @param {Object} cache
 * @param {string} tableName
 * @return {Object|null}
 */
function getTableRevisionWatermarkSnapshot(cache, tableName) {
  const watermarks = cache?.tableRevisionWatermarks;
  if (!(watermarks instanceof Map)) {
    return null;
  }
  const entry = watermarks.get(tableName);
  return entry ? {...entry} : null;
}

/**
 * Return a plain object mapping each tracked table name to its watermark.
 * @param {Object} cache
 * @return {Object<string, Object>}
 */
function getAllTableRevisionWatermarkSnapshots(cache) {
  const snapshot = {};
  const watermarks = cache?.tableRevisionWatermarks;
  if (!(watermarks instanceof Map)) {
    return snapshot;
  }
  for (const [tableName, entry] of watermarks.entries()) {
    snapshot[tableName] = {...entry};
  }
  return snapshot;
}

/**
 * Retain CDC receipt provenance only when it names the accepted row origin.
 * Stale CDC backfills leave the newer row's observation untouched, while
 * non-CDC mutation owners invalidate CDC-only evidence.
 * @param {Object} apply
 */
function updateSystemTableCacheCdcObservation(apply) {
  if (
    apply.recordForNotification ||
    hasCdcObservationMetadata(apply.options)
  ) {
    recordCdcTableObservation(
      apply.cache,
      apply.tableName,
      apply.data,
      apply.options,
    );
  }
  if (!apply.recordForNotification) {
    return;
  }
  if (apply.operation === CACHE_CDC_OPERATIONS.DELETE) {
    apply.observationTable.delete(apply.key);
    return;
  }
  const observedAtMs = apply.options.cdcObservedAtMs;
  if (!Number.isFinite(observedAtMs) || observedAtMs < 0) {
    apply.observationTable.delete(apply.key);
    return;
  }
  if (!apply.incomingVersionAccepted) {
    return;
  }
  const incomingOriginHlc = resolveCdcOriginHlc(apply.data);
  const resultingOriginHlc = resolveCdcOriginHlc(apply.resultingRow);
  if (incomingOriginHlc && incomingOriginHlc === resultingOriginHlc) {
    apply.observationTable.set(apply.key, {
      observedAtMs: Math.floor(observedAtMs),
      originHlc: incomingOriginHlc,
    });
    return;
  }
  apply.observationTable.delete(apply.key);
}


export {
  getAllTableRevisionWatermarkSnapshots,
  getTableRevisionWatermarkSnapshot,
  recordAuthoritativeTableObservation,
  updateSystemTableCacheCdcObservation,
};
