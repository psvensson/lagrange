import {assertCritical} from '../utils/assert.js';
import {CACHE_HYDRATION_TABLES} from '../cache/cache-constants.js';
import {TABLES} from '../constants/index.js';
import {normalizeNodeRow} from '../control-plane/system-row-normalizers.js';

const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_BOOTSTRAP_TOPOLOGY_SNAPSHOT_REQUIRES_SYS = 'bootstrap topology snapshot requires systemTableCache.getAll';

const DEFAULT_TOPOLOGY_EPOCH = 0;

function resolvePublishedTopologyEpoch(systemTableCache, currentEpoch) {
  if (Number.isFinite(currentEpoch?.epoch)) {
    return Math.max(0, Math.floor(currentEpoch.epoch));
  }
  if (typeof systemTableCache?.getEpoch === 'function') {
    const cacheEpoch = systemTableCache.getEpoch();
    if (Number.isFinite(cacheEpoch)) {
      return Math.max(0, Math.floor(cacheEpoch));
    }
  }
  return DEFAULT_TOPOLOGY_EPOCH;
}

function resolveActiveNodeIds(nodeRows) {
  const activeNodeIds = new Set();
  const rows = Array.isArray(nodeRows) ? nodeRows : [];
  for (const row of rows) {
    const normalizedRow = normalizeNodeRow(row);
    const {nodeId, status} = normalizedRow;
    if (nodeId.length === 0) {
      continue;
    }
    if (status === LOCAL_STR_ACTIVE) {
      activeNodeIds.add(nodeId);
    }
  }
  return [...activeNodeIds].sort();
}

function buildBootstrapTopologySnapshotEnvelope(options = {}) {
  const systemTableCache = assertCritical(
    options.systemTableCache,
    'bootstrap topology snapshot requires systemTableCache',
  );
  if (typeof systemTableCache.getAll !== 'function') {
    throw new Error(LOCAL_STR_BOOTSTRAP_TOPOLOGY_SNAPSHOT_REQUIRES_SYS);
  }

  const hydrationTables = Array.isArray(options.hydrationTables) ?
    [...options.hydrationTables] :
    [...CACHE_HYDRATION_TABLES];
  const resolveSnapshotRows =
    typeof options.resolveSnapshotRows === 'function' ?
      options.resolveSnapshotRows :
      (_tableName, cacheRows) => cacheRows;
  const publishedAt =
    typeof options.now === 'function' ?
      options.now() :
      Date.now();

  const systemTableSnapshots = {};
  const tableRowCounts = {};

  for (const tableName of hydrationTables) {
    const cacheRows = systemTableCache.getAll(tableName) || [];
    const snapshotRows = resolveSnapshotRows(tableName, cacheRows);
    const normalizedRows = Array.isArray(snapshotRows) ? snapshotRows : [];
    systemTableSnapshots[tableName] = normalizedRows;
    tableRowCounts[tableName] = normalizedRows.length;
  }

  return {
    systemTableSnapshots,
    topologySnapshotMeta: {
      publishedAt,
      topologyEpoch: resolvePublishedTopologyEpoch(
        systemTableCache,
        options.currentEpoch,
      ),
      activeNodeIds: resolveActiveNodeIds(
        systemTableSnapshots[TABLES.NODES],
      ),
      hydrationTables,
      tableRowCounts,
    },
  };
}

export {buildBootstrapTopologySnapshotEnvelope};
