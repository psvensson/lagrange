/**
 * Readiness-planning table-impact classification: the pure functions that
 * turn one system-table cache change (or a shadow-row replay) into its
 * planning impact — which node identities and whether the global identity
 * rotate — plus the canonical semantic record shapes (priority partitions,
 * priority operations, endpoints, services) those classifications compare.
 * Owned by the semantic generation tracker; no timers, no state.
 */
import {
  CDC_OPERATION,
  COLUMN,
  TABLES,
} from '../constants/index.js';
import {
  isDeepStrictEqual,
} from 'node:util';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {
  hasCanonicalActiveService,
  isCanonicalWebSocketEndpointRow,
} from './active-node-projection.js';
import {
  DIRECT_GLOBAL_PROJECTION_FIELD,
  buildDirectGlobalProjection,
  isPriorityPartitionFromProjection,
  projectedListIncludes,
} from './readiness-planning-global-projection.js';
import {
  normalizeNodeEndpointRow,
  normalizeServiceRow,
} from './system-row-normalizers.js';
import {
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';
import {copyMapValuesToArray} from '../utils/map-values-array.js';

const MapConstructor = Map;
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);

const objectDefineProperty = Object.defineProperty;

const objectFreeze = Object.freeze;

const stringConstructor = String;

const CONSERVATIVE_GLOBAL_SOURCE_TABLES = objectFreeze([
  TABLES.SERVICES,
  TABLES.NODE_ENDPOINTS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.PARTITIONS,
  TABLES.REPLICA_OPERATIONS,
]);

const REVISIONED_SOURCE_TABLES = objectFreeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
]);


function defineValue(record, name, value) {
  objectDefineProperty(record, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function readNodeId(record) {
  const source = copyStrictOwnDataRecord(record);
  if (!source) return '';
  const candidate = source[COLUMN.NODE_ID] ?? source.node_id ??
    source[COLUMN.TARGET_NODE_ID] ?? source.target_node_id;
  return typeof candidate === 'string' ? candidate : '';
}

function appendUniqueNodeId(nodeIds, nodeId) {
  if (!nodeId) return;
  for (let index = 0; index < nodeIds.length; index += 1) {
    if (nodeIds[index] === nodeId) return;
  }
  defineValue(nodeIds, nodeIds.length, nodeId);
}

function sourceObservationsEqual(left, right) {
  if (!left || !right) return false;
  for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
    const tableName = REVISIONED_SOURCE_TABLES[index];
    if (left[tableName] !== right[tableName]) return false;
  }
  return true;
}

function readSourceRowKey(tableName, record) {
  const source = copyStrictOwnDataRecord(record);
  if (!source) return null;
  let keyField;
  try {
    keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
  } catch {
    return null;
  }
  const value = source[keyField] ?? source.id;
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
    return null;
  }
  return `${typeof value}:${stringConstructor(value)}`;
}

function copySourceRowsByKey(tableName, rows) {
  const copied = copyDenseOwnDataRecordArray(rows);
  if (!copied) return null;
  const byKey = new MapConstructor();
  for (let index = 0; index < copied.length; index += 1) {
    const key = readSourceRowKey(tableName, copied[index]);
    if (key === null || mapGet(byKey, key)) return null;
    mapSet(byKey, key, objectFreeze(copied[index]));
  }
  return byKey;
}

function readRowsFromShadow(sourceRowsByTable, tableName) {
  const byKey = mapGet(sourceRowsByTable, tableName);
  return byKey ? copyMapValuesToArray(byKey) : [];
}

function readNormalizedEndpointNodeId(record) {
  try {
    return normalizeNodeEndpointRow(record).nodeId || '';
  } catch {
    return '';
  }
}

function readNormalizedServiceNodeId(record) {
  try {
    return normalizeServiceRow(record).nodeId || '';
  } catch {
    return '';
  }
}

function serviceFallbackMembershipUnchanged(
  previousRecord,
  currentRecord,
  sourceRowsByTable,
  projection,
) {
  const nodeIds = [];
  appendUniqueNodeId(nodeIds, readNormalizedServiceNodeId(previousRecord));
  appendUniqueNodeId(nodeIds, readNormalizedServiceNodeId(currentRecord));
  if (nodeIds.length === 0) return false;
  const serviceRows = readRowsFromShadow(sourceRowsByTable, TABLES.SERVICES);
  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index];
    if (projectedListIncludes(
      projection,
      DIRECT_GLOBAL_PROJECTION_FIELD.ENDPOINT_NODE_IDS,
      nodeId,
      (candidate) => candidate,
    )) continue;
    const previousPresent = projectedListIncludes(
      projection,
      DIRECT_GLOBAL_PROJECTION_FIELD.SERVICE_FALLBACK_NODE_IDS,
      nodeId,
      (candidate) => candidate,
    );
    if (previousPresent !== hasCanonicalActiveService(nodeId, serviceRows)) {
      return false;
    }
  }
  return true;
}

function canReuseOrdinaryTopologyProjection(
  tableName,
  previousRecord,
  currentRecord,
  sourceRowsByTable,
  projection,
) {
  if (!projection || (!previousRecord && !currentRecord)) return false;
  const records = [previousRecord, currentRecord];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const partitionId = tableName === TABLES.SERVICES ?
      normalizeServiceRow(record).partitionId :
      record?.[COLUMN.PARTITION_ID] ?? record?.partitionId;
    if (isPriorityPartitionFromProjection(
      partitionId,
      sourceRowsByTable,
      projection,
    )) return false;
  }
  return tableName === TABLES.REPLICA_OPERATIONS ||
    serviceFallbackMembershipUnchanged(
      previousRecord,
      currentRecord,
      sourceRowsByTable,
      projection,
    );
}

function canReuseDirectGlobalProjection(
  tableName,
  operation,
  previousRecord,
  currentRecord,
  sourceRowsByTable,
  projection,
) {
  if (tableName === TABLES.STORAGE_RESERVATIONS) return true;
  const sameKeyUpdate = previousRecord && currentRecord &&
    (operation === CDC_OPERATION.UPDATE ||
      operation === CDC_OPERATION.UPSERT);
  if (sameKeyUpdate && tableName === TABLES.NODES) return true;
  if (sameKeyUpdate && tableName === TABLES.SERVICES && isDeepStrictEqual(
    localSemanticRecord(tableName, previousRecord),
    localSemanticRecord(tableName, currentRecord),
  )) return true;
  if (tableName !== TABLES.SERVICES &&
      tableName !== TABLES.REPLICA_OPERATIONS) return false;
  return canReuseOrdinaryTopologyProjection(
    tableName,
    previousRecord,
    currentRecord,
    sourceRowsByTable,
    projection,
  );
}

function localSemanticRecord(tableName, record) {
  if (!record) return null;
  if (tableName === TABLES.NODES) {
    return objectFreeze({
      cpuUsagePercent: record[COLUMN.CPU_USAGE_PERCENT] ?? null,
      diskUsagePercent: record[COLUMN.DISK_USAGE_PERCENT] ?? null,
      memoryUsagePercent: record[COLUMN.MEMORY_USAGE_PERCENT] ?? null,
    });
  }
  if (tableName === TABLES.NODE_ENDPOINTS) {
    return isCanonicalWebSocketEndpointRow(record) ?
      normalizeNodeEndpointRow(record) : null;
  }
  if (tableName === TABLES.SERVICES) {
    return normalizeServiceRow(record);
  }
  return null;
}

function classifyShadowTableImpact(
  tableName,
  previousRecord,
  currentRecord,
  previousGlobalProjection,
  currentGlobalProjection,
) {
  const affectedNodeIds = [];
  if (tableName === TABLES.NODES) {
    appendUniqueNodeId(affectedNodeIds, readNodeId(previousRecord));
    appendUniqueNodeId(affectedNodeIds, readNodeId(currentRecord));
  } else if (tableName === TABLES.NODE_ENDPOINTS) {
    appendUniqueNodeId(
      affectedNodeIds,
      readNormalizedEndpointNodeId(previousRecord),
    );
    appendUniqueNodeId(
      affectedNodeIds,
      readNormalizedEndpointNodeId(currentRecord),
    );
  } else if (tableName === TABLES.SERVICES) {
    appendUniqueNodeId(
      affectedNodeIds,
      readNormalizedServiceNodeId(previousRecord),
    );
    appendUniqueNodeId(
      affectedNodeIds,
      readNormalizedServiceNodeId(currentRecord),
    );
  }
  const localChanged = !isDeepStrictEqual(
    localSemanticRecord(tableName, previousRecord),
    localSemanticRecord(tableName, currentRecord),
  );
  const globalChanged = !isDeepStrictEqual(
    previousGlobalProjection,
    currentGlobalProjection,
  );
  return freezeImpact(
    globalChanged,
    localChanged ? affectedNodeIds : [],
    globalChanged || (localChanged && affectedNodeIds.length > 0),
  );
}

function readSharedLivenessComponent(projection) {
  if (!projection || typeof projection !== 'object') return null;
  return objectFreeze([
    projection.readyNow === true,
    projection.heartbeatFreshness?.clusterMembership ?? null,
    projection.repairFreshness?.state ?? null,
    projection.derivationGraceActive === true,
    projection.clusterMembershipSemantics?.healthy === true,
    projection.clusterMembershipSemantics?.state ?? null,
  ]);
}

function sharedLivenessComponentChanged(previousProjection, projection) {
  const previous = readSharedLivenessComponent(previousProjection);
  const current = readSharedLivenessComponent(projection);
  if (!previous || !current || previous.length !== current.length) return true;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== current[index]) return true;
  }
  return false;
}

function freezeImpact(globalChanged, affectedNodeIds, semanticChanged = true) {
  return objectFreeze({
    affectedNodeIds: objectFreeze(affectedNodeIds),
    globalChanged,
    semanticChanged,
  });
}

function classifyNodeFallbackImpact(operation, nodeId) {
  const affectedNodeIds = nodeId ? [nodeId] : [];
  if (operation === CDC_OPERATION.UPDATE ||
      operation === CDC_OPERATION.UPSERT) {
    return freezeImpact(false, [], false);
  }
  return freezeImpact(true, affectedNodeIds);
}

function classifyReservationFallbackImpact(nodeId) {
  return nodeId ? freezeImpact(false, [nodeId]) : freezeImpact(true, []);
}

function classifyTableImpact(tableName, operation, record) {
  const nodeId = readNodeId(record);
  if (tableName === TABLES.NODES) {
    return classifyNodeFallbackImpact(operation, nodeId);
  }
  if (tableName === TABLES.STORAGE_RESERVATIONS) {
    return classifyReservationFallbackImpact(nodeId);
  }
  if (arrayIncludes(CONSERVATIVE_GLOBAL_SOURCE_TABLES, tableName)) {
    // Without a stable row-shadow bracket, these events cannot prove that
    // shared membership/priority topology was preserved. Versioned caches
    // take the exact old/new path and retain node-local granularity.
    return freezeImpact(true, nodeId ? [nodeId] : []);
  }
  return freezeImpact(false, [], false);
}

function copySourceRowsSnapshot(cache) {
  const candidateRowsByTable = new MapConstructor();
  try {
    for (let index = 0; index < REVISIONED_SOURCE_TABLES.length; index += 1) {
      const tableName = REVISIONED_SOURCE_TABLES[index];
      const byKey = copySourceRowsByKey(tableName, cache.getAll(tableName));
      if (!byKey) return null;
      mapSet(candidateRowsByTable, tableName, byKey);
    }
  } catch {
    return null;
  }
  return candidateRowsByTable;
}

export {
  buildDirectGlobalProjection,
  canReuseDirectGlobalProjection,
  classifyShadowTableImpact,
  classifyTableImpact,
  copySourceRowsSnapshot,
  defineValue,
  freezeImpact,
  readSourceRowKey,
  sharedLivenessComponentChanged,
  sourceObservationsEqual,
};
