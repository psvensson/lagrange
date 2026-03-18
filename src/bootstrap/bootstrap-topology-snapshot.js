import {assertCritical} from '../utils/assert.js';
import {CACHE_HYDRATION_TABLES} from '../cache/cache-constants.js';
import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';

const DEFAULT_TOPOLOGY_EPOCH = NUM.ZERO;

function resolvePublishedTopologyEpoch(systemTableCache, currentEpoch) {
  if (Number.isFinite(currentEpoch?.epoch)) {
    return Math.max(NUM.ZERO, Math.floor(currentEpoch.epoch));
  }
  if (typeof systemTableCache?.getEpoch === TYPEOF.FUNCTION) {
    const cacheEpoch = systemTableCache.getEpoch();
    if (Number.isFinite(cacheEpoch)) {
      return Math.max(NUM.ZERO, Math.floor(cacheEpoch));
    }
  }
  return DEFAULT_TOPOLOGY_EPOCH;
}

function resolveActiveNodeIds(nodeRows) {
  const activeNodeIds = new Set();
  const rows = Array.isArray(nodeRows) ? nodeRows : [];
  for (const row of rows) {
    const nodeId = String(
      row?.[COLUMN.NODE_ID] || row?.node_id || row?.nodeId || '',
    );
    const status = String(
      row?.[COLUMN.STATUS] || row?.status || '',
    ).toLowerCase();
    if (nodeId.length === NUM.ZERO) {
      continue;
    }
    if (status === 'active') {
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
  if (typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
    throw new Error('bootstrap topology snapshot requires systemTableCache.getAll');
  }

  const hydrationTables = Array.isArray(options.hydrationTables) ?
    [...options.hydrationTables] :
    [...CACHE_HYDRATION_TABLES];
  const resolveSnapshotRows =
    typeof options.resolveSnapshotRows === TYPEOF.FUNCTION ?
      options.resolveSnapshotRows :
      (_tableName, cacheRows) => cacheRows;
  const publishedAt =
    typeof options.now === TYPEOF.FUNCTION ?
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
