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
  FIELD,
  TABLES,
} from '../constants/index.js';
import {
  isDeepStrictEqual,
} from 'node:util';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {
  hasCanonicalActiveService,
  hasCanonicalWebSocketEndpoint,
  isCanonicalWebSocketEndpointRow,
  resolveLatestPublicationRow,
} from './active-node-projection.js';
import {
  normalizeNodeEndpointRow,
  normalizeServiceRow,
} from './system-row-normalizers.js';
import {
  copyDenseOwnDataRecordArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';

const SEMANTIC_RECORD_COLUMN = Object.freeze({
  PARTITION_KEY_END: 'partition_key_end',
  PARTITION_KEY_START: 'partition_key_start',
  PARTITION_VERSION: 'partition_version',
  REPLICA_COUNT: 'replica_count',
  SOURCE_NODE_ID: 'source_node_id',
  TABLE_NAME: 'table_name',
  WORKFLOW_STEP: 'workflow_step',
});

const SEMANTIC_RECORD_FIELD = Object.freeze({
  LEADER_NODE_ID: 'leaderNodeId',
  PARTITION_KEY_END: 'partitionKeyEnd',
  PARTITION_KEY_START: 'partitionKeyStart',
  PARTITION_VERSION: 'partitionVersion',
  REPLICA_COUNT: 'replicaCount',
  TABLE_ID: 'tableId',
  TABLE_NAME: 'tableName',
  WORKFLOW_STEP: 'workflowStep',
});

const MapConstructor = Map;
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const mapForEach = Function.call.bind(Map.prototype.forEach);

const mapGet = Function.call.bind(Map.prototype.get);

const mapSet = Function.call.bind(Map.prototype.set);

const arrayFilter = Function.call.bind(Array.prototype.filter);

const arrayMap = Function.call.bind(Array.prototype.map);

const arraySort = Function.call.bind(Array.prototype.sort);

const objectDefineProperty = Object.defineProperty;

const objectFreeze = Object.freeze;

const stringConstructor = String;

const stringLocaleCompare = Function.call.bind(String.prototype.localeCompare);

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
  const rows = [];
  if (byKey) {
    mapForEach(byKey, (row) => defineValue(rows, rows.length, row));
  }
  return rows;
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

function isPriorityPartitionRecord(record) {
  try {
    return classifySystemPartition({partitionRow: record})
      .priorityControlPlane === true;
  } catch {
    return false;
  }
}

// One pass over the partition rows per projection build: the index answers
// "is this partition priority?" for every service and operation row in O(1)
// instead of rescanning the partition rows per row (measured 34 ms/event at
// 1000 partitions × 3000 services before indexing).
function buildPriorityPartitionIndex(partitionRows) {
  const knownPartitionIds = new SetConstructor();
  const priorityPartitionIds = new SetConstructor();
  for (let index = 0; index < partitionRows.length; index += 1) {
    const row = partitionRows[index];
    const partitionId = row?.[COLUMN.PARTITION_ID] ?? row?.partitionId;
    if (typeof partitionId !== 'string') continue;
    setAdd(knownPartitionIds, partitionId);
    if (isPriorityPartitionRecord(row)) setAdd(priorityPartitionIds, partitionId);
  }
  return objectFreeze({knownPartitionIds, priorityPartitionIds});
}

function isPriorityPartitionId(partitionId, partitionIndex) {
  if (setHas(partitionIndex.knownPartitionIds, partitionId)) {
    return setHas(partitionIndex.priorityPartitionIds, partitionId);
  }
  try {
    return classifySystemPartition({partitionId}).priorityControlPlane === true;
  } catch {
    return false;
  }
}

function readAliasedValue(record, fieldName, aliasName) {
  const primary = record?.[fieldName];
  if (primary !== undefined && primary !== null) return primary;
  const alternate = record?.[aliasName];
  return alternate === undefined || alternate === null ? null : alternate;
}

function buildPriorityPartitionSemanticRecord(record) {
  return objectFreeze({
    leaderNodeId: readAliasedValue(
      record,
      COLUMN.LEADER_NODE_ID,
      SEMANTIC_RECORD_FIELD.LEADER_NODE_ID,
    ),
    partitionId: readAliasedValue(
      record,
      COLUMN.PARTITION_ID,
      FIELD.PARTITION_ID,
    ),
    partitionKeyEnd: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.PARTITION_KEY_END,
      SEMANTIC_RECORD_FIELD.PARTITION_KEY_END,
    ),
    partitionKeyStart: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.PARTITION_KEY_START,
      SEMANTIC_RECORD_FIELD.PARTITION_KEY_START,
    ),
    partitionVersion: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.PARTITION_VERSION,
      SEMANTIC_RECORD_FIELD.PARTITION_VERSION,
    ),
    replicaCount: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.REPLICA_COUNT,
      SEMANTIC_RECORD_FIELD.REPLICA_COUNT,
    ),
    state: record?.state ?? null,
    tableId: readAliasedValue(record, COLUMN.TABLE_ID, SEMANTIC_RECORD_FIELD.TABLE_ID),
    tableName: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.TABLE_NAME,
      SEMANTIC_RECORD_FIELD.TABLE_NAME,
    ),
  });
}

function buildPriorityOperationSemanticRecord(record) {
  return objectFreeze({
    entityId: readAliasedValue(record, COLUMN.ENTITY_ID, FIELD.ENTITY_ID),
    entityType: readAliasedValue(record, COLUMN.ENTITY_TYPE, FIELD.ENTITY_TYPE),
    operationId: readAliasedValue(
      record,
      COLUMN.OPERATION_ID,
      FIELD.OPERATION_ID,
    ),
    partitionId: readAliasedValue(
      record,
      COLUMN.PARTITION_ID,
      FIELD.PARTITION_ID,
    ),
    replicaId: readAliasedValue(record, COLUMN.REPLICA_ID, FIELD.REPLICA_ID),
    sourceNodeId: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.SOURCE_NODE_ID,
      FIELD.SOURCE_NODE_ID,
    ),
    status: record?.[COLUMN.STATUS] ?? null,
    targetNodeId: readAliasedValue(
      record,
      COLUMN.TARGET_NODE_ID,
      FIELD.TARGET_NODE_ID,
    ),
    type: record?.type ?? null,
    workflowStep: readAliasedValue(
      record,
      SEMANTIC_RECORD_COLUMN.WORKFLOW_STEP,
      SEMANTIC_RECORD_FIELD.WORKFLOW_STEP,
    ),
  });
}

function sortSemanticRecords(records, readKey) {
  return arraySort(records, (left, right) => stringLocaleCompare(
    stringConstructor(readKey(left) ?? ''),
    stringConstructor(readKey(right) ?? ''),
  ));
}

function buildDirectGlobalProjection(sourceRowsByTable) {
  const nodeRows = readRowsFromShadow(sourceRowsByTable, TABLES.NODES);
  const endpointRows = readRowsFromShadow(
    sourceRowsByTable,
    TABLES.NODE_ENDPOINTS,
  );
  const serviceRows = readRowsFromShadow(sourceRowsByTable, TABLES.SERVICES);
  const partitionRows = readRowsFromShadow(
    sourceRowsByTable,
    TABLES.PARTITIONS,
  );
  const operationRows = readRowsFromShadow(
    sourceRowsByTable,
    TABLES.REPLICA_OPERATIONS,
  );
  const publicationRows = readRowsFromShadow(
    sourceRowsByTable,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  );
  const nodeIds = arraySort(arrayFilter(
    arrayMap(nodeRows, (row) => readNodeId(row)),
    (nodeId) => nodeId.length > 0,
  ));
  const endpointNodeIds = arrayFilter(nodeIds, (nodeId) =>
    hasCanonicalWebSocketEndpoint(nodeId, endpointRows),
  );
  const serviceFallbackNodeIds = arrayFilter(nodeIds, (nodeId) =>
    !hasCanonicalWebSocketEndpoint(nodeId, endpointRows) &&
      hasCanonicalActiveService(nodeId, serviceRows),
  );
  const partitionIndex = buildPriorityPartitionIndex(partitionRows);
  const priorityPartitions = sortSemanticRecords(
    arrayMap(
      arrayFilter(partitionRows, isPriorityPartitionRecord),
      buildPriorityPartitionSemanticRecord,
    ),
    (row) => row.partitionId,
  );
  const priorityServices = sortSemanticRecords(
    arrayMap(arrayFilter(serviceRows, (row) => {
      const normalized = normalizeServiceRow(row);
      return isPriorityPartitionId(normalized.partitionId, partitionIndex);
    }), (row) => objectFreeze(normalizeServiceRow(row))),
    (row) => row.serviceId,
  );
  const priorityOperations = sortSemanticRecords(
    arrayMap(
      arrayFilter(operationRows, (row) => isPriorityPartitionId(
        row?.[COLUMN.PARTITION_ID] ?? row?.partitionId,
        partitionIndex,
      )),
      buildPriorityOperationSemanticRecord,
    ),
    (row) => row.operationId,
  );
  return objectFreeze({
    endpointNodeIds: objectFreeze(endpointNodeIds),
    membershipPublication: resolveLatestPublicationRow({publicationRows}),
    nodeIds: objectFreeze(nodeIds),
    priorityOperations: objectFreeze(priorityOperations),
    priorityPartitions: objectFreeze(priorityPartitions),
    priorityServices: objectFreeze(priorityServices),
    serviceFallbackNodeIds: objectFreeze(serviceFallbackNodeIds),
  });
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
  classifyShadowTableImpact,
  classifyTableImpact,
  copySourceRowsSnapshot,
  defineValue,
  freezeImpact,
  readSourceRowKey,
  sharedLivenessComponentChanged,
  sourceObservationsEqual,
};
