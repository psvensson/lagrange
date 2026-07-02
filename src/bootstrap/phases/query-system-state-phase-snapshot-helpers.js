import {
  CACHE_DEFAULT,
} from '../../cache/cache-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';
import {
  resolveControlPlaneSnapshotRevisionMetadata,
} from '../../control-plane/control-plane-snapshot-revision.js';
import {
  COLUMN,
  CDC_OPERATION,
} from '../../constants/index.js';
import {
  LOG_SKIPPING_STALE_SNAPSHOT,
  LOG_TOPOLOGY_EPOCH_APPLIED,
} from './query-system-state-phase-constants.js';

function resolveSnapshotBackfillPlan({
  bootstrapResponse,
  tableNames = [],
} = {}) {
  const snapshots = bootstrapResponse?.systemTableSnapshots;
  const hydrationTables = Array.isArray(
    bootstrapResponse?.topologySnapshotMeta?.hydrationTables,
  ) ?
    new Set(
      bootstrapResponse.topologySnapshotMeta.hydrationTables.filter(
        (value) => typeof value === 'string' && value.length > 0,
      ),
    ) :
    null;
  const missingTables = [];

  for (const tableName of tableNames) {
    const hasSnapshotRows = Array.isArray(snapshots?.[tableName]);
    const declaredHydrated =
      !hydrationTables || hydrationTables.has(tableName);
    if (!hasSnapshotRows || !declaredHydrated) {
      missingTables.push(tableName);
    }
  }

  return {
    tables: missingTables,
    missingTables,
  };
}

function applyBootstrapTopologyEpoch({
  systemTableCache,
  bootstrapResponse,
  logger,
  nodeId,
} = {}) {
  if (!systemTableCache ||
      typeof systemTableCache.updateFromEpoch !== 'function') {
    return;
  }

  const currentEpoch = bootstrapResponse?.currentEpoch;
  if (!currentEpoch || typeof currentEpoch !== 'object') {
    return;
  }

  systemTableCache.updateFromEpoch(currentEpoch);
  logger.info(LOG_TOPOLOGY_EPOCH_APPLIED, {
    nodeId,
    topologyEpoch: currentEpoch.epoch,
  });
}

function recordBootstrapTopologySnapshotMetadata({
  bootstrapResponse,
  delegates,
} = {}) {
  const nowMs =
    typeof delegates?.getNow === 'function' ?
      delegates.getNow() :
      Date.now();
  const topologySnapshotMeta =
    bootstrapResponse?.topologySnapshotMeta &&
    typeof bootstrapResponse.topologySnapshotMeta === 'object' ?
      bootstrapResponse.topologySnapshotMeta :
      null;
  const revisionMetadata = resolveControlPlaneSnapshotRevisionMetadata(
    {
      topologySnapshotEpoch:
        topologySnapshotMeta?.topologyEpoch ??
        bootstrapResponse?.currentEpoch?.epoch ??
        null,
      capturedAt: nowMs,
    },
  );
  if (typeof delegates?.setBootstrapTopologySnapshotMeta ===
      'function') {
    delegates.setBootstrapTopologySnapshotMeta(
      topologySnapshotMeta ?
        {
          ...topologySnapshotMeta,
          snapshotRevision: revisionMetadata.revision,
          snapshotRevisionSource: revisionMetadata.revisionSource,
          snapshotResumeToken: revisionMetadata.resumeToken,
          snapshotObservedAt: revisionMetadata.observedAt,
          snapshotObservedAtMs: revisionMetadata.observedAtMs,
        } :
        null,
    );
  }
  if (typeof delegates?.setBootstrapTopologySnapshotHydratedAtMs ===
      'function') {
    delegates.setBootstrapTopologySnapshotHydratedAtMs(
      nowMs,
    );
  }
}

function getSnapshotHydrationOperation({
  systemTableCache,
  tableName,
  record,
  logger,
  nodeId,
} = {}) {
  const pkField = getSystemCachePrimaryKeyFieldOrFallback(
    tableName,
    CACHE_DEFAULT.PRIMARY_KEY_FALLBACK,
  );
  const key =
    record?.[pkField] ??
    record?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];

  // Let cache validation handle malformed rows with no key.
  if (typeof key === 'undefined' || key === null) {
    return CDC_OPERATION.INSERT;
  }

  if (!systemTableCache.has(tableName, key)) {
    return CDC_OPERATION.INSERT;
  }

  const existing = systemTableCache.get(tableName, key);
  const existingUpdatedAt =
    Number(existing?.[COLUMN.UPDATED_AT]);
  const incomingUpdatedAt =
    Number(record?.[COLUMN.UPDATED_AT]);
  const hasExistingUpdatedAt =
    Number.isFinite(existingUpdatedAt) &&
    existingUpdatedAt > 0;
  const hasIncomingUpdatedAt =
    Number.isFinite(incomingUpdatedAt) &&
    incomingUpdatedAt > 0;

  if (
    hasExistingUpdatedAt &&
    (!hasIncomingUpdatedAt ||
      existingUpdatedAt >= incomingUpdatedAt)
  ) {
    logger.debug(
      LOG_SKIPPING_STALE_SNAPSHOT,
      {
        nodeId,
        tableName,
        key,
        existingUpdatedAt,
        incomingUpdatedAt: hasIncomingUpdatedAt ?
          incomingUpdatedAt :
          null,
      },
    );
    return null;
  }

  return CDC_OPERATION.UPSERT;
}

export {
  applyBootstrapTopologyEpoch,
  getSnapshotHydrationOperation,
  recordBootstrapTopologySnapshotMetadata,
  resolveSnapshotBackfillPlan,
};
