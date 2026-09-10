import {COLUMN, FIELD, TABLES} from '../constants/index.js';
import {classifySystemPartition} from
  '../bootstrap/system-partition-classification.js';
import {
  hasCanonicalActiveService,
  hasCanonicalWebSocketEndpoint,
  resolveLatestPublicationRow,
} from './active-node-projection.js';
import {normalizeServiceRow} from './system-row-normalizers.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {copyMapValuesToArray} from '../utils/map-values-array.js';

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

const DIRECT_GLOBAL_PROJECTION_FIELD = Object.freeze({
  ENDPOINT_NODE_IDS: 'endpointNodeIds',
  PRIORITY_PARTITIONS: 'priorityPartitions',
  SERVICE_FALLBACK_NODE_IDS: 'serviceFallbackNodeIds',
});

const MapConstructor = Map;
const SetConstructor = Set;
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const stringConstructor = String;
const stringLocaleCompare = Function.call.bind(String.prototype.localeCompare);

function defineValue(record, name, value) {
  objectDefineProperty(record, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function readRowsFromShadow(sourceRowsByTable, tableName) {
  const byKey = mapGet(sourceRowsByTable, tableName);
  return byKey ? copyMapValuesToArray(byKey) : [];
}

function readNodeId(record) {
  const source = copyStrictOwnDataRecord(record);
  if (!source) return '';
  const candidate = source[COLUMN.NODE_ID] ?? source.node_id ??
    source[COLUMN.TARGET_NODE_ID] ?? source.target_node_id;
  return typeof candidate === 'string' ? candidate : '';
}

function isPriorityPartitionRecord(record) {
  try {
    return classifySystemPartition({partitionRow: record})
      .priorityControlPlane === true;
  } catch {
    return false;
  }
}

function buildPriorityPartitionIndex(partitionRows) {
  const knownPartitionIds = new SetConstructor();
  const priorityPartitionIds = new SetConstructor();
  for (let index = 0; index < partitionRows.length; index += 1) {
    const row = partitionRows[index];
    const partitionId = row?.[COLUMN.PARTITION_ID] ?? row?.partitionId;
    if (typeof partitionId !== 'string') continue;
    setAdd(knownPartitionIds, partitionId);
    if (isPriorityPartitionRecord(row)) {
      setAdd(priorityPartitionIds, partitionId);
    }
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

function normalizeOptionalString(value) {
  return value === undefined || value === null ? '' : stringConstructor(value);
}

function readNormalizedAliasedString(record, primaryName, alternateName) {
  const primary = normalizeOptionalString(record?.[primaryName]);
  return primary.length > 0 ?
    primary :
    normalizeOptionalString(record?.[alternateName]);
}

function readNormalizedServicePartitionId(record) {
  return readNormalizedAliasedString(
    record,
    COLUMN.PARTITION_ID,
    FIELD.PARTITION_ID,
  );
}

function readNormalizedServiceId(record) {
  return readNormalizedAliasedString(
    record,
    COLUMN.SERVICE_ID,
    FIELD.SERVICE_ID,
  );
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
    tableId: readAliasedValue(
      record,
      COLUMN.TABLE_ID,
      SEMANTIC_RECORD_FIELD.TABLE_ID,
    ),
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

function buildPriorityServiceRecords(serviceRows, partitionIndex) {
  const records = [];
  for (let index = 0; index < serviceRows.length; index += 1) {
    const row = serviceRows[index];
    if (!isPriorityPartitionId(
      readNormalizedServicePartitionId(row),
      partitionIndex,
    )) continue;
    defineValue(
      records,
      records.length,
      objectFreeze(normalizeServiceRow(row)),
    );
  }
  return records;
}

function projectedListIncludes(projection, fieldName, value, readValue) {
  const values = projection?.[fieldName];
  if (!arrayIsArray(values)) return false;
  for (let index = 0; index < values.length; index += 1) {
    if (readValue(values[index]) === value) return true;
  }
  return false;
}

function isPriorityPartitionFromProjection(
  partitionId,
  sourceRowsByTable,
  projection,
) {
  if (typeof partitionId !== 'string' || partitionId.length === 0) return true;
  const partitionRowsByKey = mapGet(sourceRowsByTable, TABLES.PARTITIONS);
  if (!(partitionRowsByKey instanceof MapConstructor)) return true;
  let partitionKnown = false;
  mapForEach(partitionRowsByKey, (row) => {
    const candidate = row?.[COLUMN.PARTITION_ID] ?? row?.partitionId;
    partitionKnown = partitionKnown || candidate === partitionId;
  });
  if (partitionKnown) {
    return projectedListIncludes(
      projection,
      DIRECT_GLOBAL_PROJECTION_FIELD.PRIORITY_PARTITIONS,
      partitionId,
      (row) => row?.partitionId,
    );
  }
  try {
    return classifySystemPartition({partitionId}).priorityControlPlane === true;
  } catch {
    return true;
  }
}

function priorityServiceChangeAffectsProjection(
  sourceChange,
  sourceRowsByTable,
  previousProjection,
) {
  if (!sourceChange || !previousProjection) return true;
  const records = [sourceChange.previousRecord, sourceChange.currentRecord];
  let recordSeen = false;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    recordSeen = true;
    if (isPriorityPartitionFromProjection(
      readNormalizedServicePartitionId(record),
      sourceRowsByTable,
      previousProjection,
    )) return true;
  }
  return !recordSeen;
}

function resolveChangedServiceRecords(sourceChange) {
  if (!sourceChange) return null;
  const previousRecord = sourceChange.previousRecord;
  const currentRecord = sourceChange.currentRecord;
  if (!previousRecord && !currentRecord) return null;
  const previousServiceId = previousRecord ?
    readNormalizedServiceId(previousRecord) : '';
  const currentServiceId = currentRecord ?
    readNormalizedServiceId(currentRecord) : '';
  if ((previousRecord && !previousServiceId) ||
      (currentRecord && !currentServiceId)) return null;
  return {currentRecord, currentServiceId, previousRecord, previousServiceId};
}

function buildChangedPriorityServiceRecords(
  previousRecords,
  sourceChange,
  partitionIndex,
) {
  if (!arrayIsArray(previousRecords)) return null;
  const change = resolveChangedServiceRecords(sourceChange);
  if (!change) return null;
  const records = arrayFilter(previousRecords, (record) =>
    record?.serviceId !== change.previousServiceId &&
      record?.serviceId !== change.currentServiceId);
  if (change.currentRecord && isPriorityPartitionId(
    readNormalizedServicePartitionId(change.currentRecord),
    partitionIndex,
  )) {
    defineValue(
      records,
      records.length,
      objectFreeze(normalizeServiceRow(change.currentRecord)),
    );
  }
  return sortSemanticRecords(records, (record) => record.serviceId);
}

function shouldRebuildPriorityServices(
  rebuildPriorityPartitions,
  changedTableName,
  sourceChange,
  sourceRowsByTable,
  previousProjection,
) {
  return rebuildPriorityPartitions ||
    (changedTableName === TABLES.SERVICES &&
      priorityServiceChangeAffectsProjection(
        sourceChange,
        sourceRowsByTable,
        previousProjection,
      ));
}

function buildProjectionRebuildPlan(
  sourceRowsByTable,
  previousProjection,
  changedTableName,
  sourceChange,
) {
  const fullBuild = !previousProjection;
  const rebuildNodeIds = fullBuild || changedTableName === TABLES.NODES;
  const rebuildEndpointNodeIds = rebuildNodeIds ||
    changedTableName === TABLES.NODE_ENDPOINTS;
  const rebuildServiceFallbackNodeIds = rebuildEndpointNodeIds ||
    changedTableName === TABLES.SERVICES;
  const rebuildPriorityPartitions = fullBuild ||
    changedTableName === TABLES.PARTITIONS;
  const rebuildPriorityServices = shouldRebuildPriorityServices(
    rebuildPriorityPartitions,
    changedTableName,
    sourceChange,
    sourceRowsByTable,
    previousProjection,
  );
  const rebuildPriorityOperations = rebuildPriorityPartitions ||
    changedTableName === TABLES.REPLICA_OPERATIONS;
  const rebuildMembershipPublication = fullBuild ||
    changedTableName === TABLES.CONTROL_PLANE_PUBLICATIONS;
  return {
    rebuildEndpointNodeIds,
    rebuildMembershipPublication,
    rebuildNodeIds,
    rebuildPriorityOperations,
    rebuildPriorityPartitions,
    rebuildPriorityServices,
    rebuildServiceFallbackNodeIds,
  };
}

function readProjectionRows(sourceRowsByTable, tableName, required) {
  return required ? readRowsFromShadow(sourceRowsByTable, tableName) : [];
}

function readProjectionSourceRows(sourceRowsByTable, plan) {
  return {
    endpointRows: readProjectionRows(
      sourceRowsByTable,
      TABLES.NODE_ENDPOINTS,
      plan.rebuildEndpointNodeIds || plan.rebuildServiceFallbackNodeIds,
    ),
    nodeRows: readProjectionRows(
      sourceRowsByTable,
      TABLES.NODES,
      plan.rebuildNodeIds,
    ),
    partitionRows: readProjectionRows(
      sourceRowsByTable,
      TABLES.PARTITIONS,
      plan.rebuildPriorityPartitions ||
        plan.rebuildPriorityServices ||
        plan.rebuildPriorityOperations,
    ),
    serviceRows: readProjectionRows(
      sourceRowsByTable,
      TABLES.SERVICES,
      plan.rebuildPriorityServices || plan.rebuildServiceFallbackNodeIds,
    ),
  };
}

function resolveProjectedNodeIds(plan, rows, previousProjection) {
  return plan.rebuildNodeIds ? arraySort(arrayFilter(
    arrayMap(rows.nodeRows, (row) => readNodeId(row)),
    (nodeId) => nodeId.length > 0,
  )) : previousProjection.nodeIds;
}

function resolveProjectedEndpointNodeIds(
  plan,
  rows,
  nodeIds,
  previousProjection,
) {
  return plan.rebuildEndpointNodeIds ? arrayFilter(
    nodeIds,
    (nodeId) => hasCanonicalWebSocketEndpoint(nodeId, rows.endpointRows),
  ) : previousProjection.endpointNodeIds;
}

function resolveProjectedServiceFallbackNodeIds(
  plan,
  rows,
  nodeIds,
  previousProjection,
) {
  return plan.rebuildServiceFallbackNodeIds ? arrayFilter(
    nodeIds,
    (nodeId) =>
      !hasCanonicalWebSocketEndpoint(nodeId, rows.endpointRows) &&
      hasCanonicalActiveService(nodeId, rows.serviceRows),
  ) : previousProjection.serviceFallbackNodeIds;
}

function resolveProjectedPriorityPartitions(plan, rows, previousProjection) {
  return plan.rebuildPriorityPartitions ? sortSemanticRecords(
    arrayMap(
      arrayFilter(rows.partitionRows, isPriorityPartitionRecord),
      buildPriorityPartitionSemanticRecord,
    ),
    (row) => row.partitionId,
  ) : previousProjection.priorityPartitions;
}

function resolveProjectedPriorityServices(
  plan,
  rows,
  previousProjection,
  sourceChange,
  partitionIndex,
) {
  if (!plan.rebuildPriorityServices) {
    return previousProjection.priorityServices;
  }
  const changedRecords = buildChangedPriorityServiceRecords(
    previousProjection?.priorityServices,
    sourceChange,
    partitionIndex,
  );
  return changedRecords ?? sortSemanticRecords(
    buildPriorityServiceRecords(rows.serviceRows, partitionIndex),
    (row) => row.serviceId,
  );
}

function resolveProjectedPriorityOperations(
  plan,
  sourceRowsByTable,
  previousProjection,
  partitionIndex,
) {
  if (!plan.rebuildPriorityOperations) {
    return previousProjection.priorityOperations;
  }
  return sortSemanticRecords(
    arrayMap(
      arrayFilter(
        readRowsFromShadow(sourceRowsByTable, TABLES.REPLICA_OPERATIONS),
        (row) => isPriorityPartitionId(
          row?.[COLUMN.PARTITION_ID] ?? row?.partitionId,
          partitionIndex,
        ),
      ),
      buildPriorityOperationSemanticRecord,
    ),
    (row) => row.operationId,
  );
}

function resolveProjectedMembershipPublication(
  plan,
  sourceRowsByTable,
  previousProjection,
) {
  return plan.rebuildMembershipPublication ? resolveLatestPublicationRow({
    publicationRows: readRowsFromShadow(
      sourceRowsByTable,
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    ),
  }) : previousProjection.membershipPublication;
}

function freezeDirectGlobalProjection(projection) {
  return objectFreeze({
    endpointNodeIds: objectFreeze(projection.endpointNodeIds),
    membershipPublication: projection.membershipPublication,
    nodeIds: objectFreeze(projection.nodeIds),
    priorityOperations: objectFreeze(projection.priorityOperations),
    priorityPartitions: objectFreeze(projection.priorityPartitions),
    priorityServices: objectFreeze(projection.priorityServices),
    serviceFallbackNodeIds: objectFreeze(projection.serviceFallbackNodeIds),
  });
}

function buildDirectGlobalProjection(
  sourceRowsByTable,
  previousProjection = null,
  changedTableName = null,
  sourceChange = null,
) {
  const plan = buildProjectionRebuildPlan(
    sourceRowsByTable,
    previousProjection,
    changedTableName,
    sourceChange,
  );
  const rows = readProjectionSourceRows(sourceRowsByTable, plan);
  const partitionIndex = plan.rebuildPriorityServices ||
    plan.rebuildPriorityOperations ?
    buildPriorityPartitionIndex(rows.partitionRows) :
    null;
  const nodeIds = resolveProjectedNodeIds(plan, rows, previousProjection);
  return freezeDirectGlobalProjection({
    endpointNodeIds: resolveProjectedEndpointNodeIds(
      plan,
      rows,
      nodeIds,
      previousProjection,
    ),
    membershipPublication: resolveProjectedMembershipPublication(
      plan,
      sourceRowsByTable,
      previousProjection,
    ),
    nodeIds,
    priorityOperations: resolveProjectedPriorityOperations(
      plan,
      sourceRowsByTable,
      previousProjection,
      partitionIndex,
    ),
    priorityPartitions: resolveProjectedPriorityPartitions(
      plan,
      rows,
      previousProjection,
    ),
    priorityServices: resolveProjectedPriorityServices(
      plan,
      rows,
      previousProjection,
      sourceChange,
      partitionIndex,
    ),
    serviceFallbackNodeIds: resolveProjectedServiceFallbackNodeIds(
      plan,
      rows,
      nodeIds,
      previousProjection,
    ),
  });
}

export {
  DIRECT_GLOBAL_PROJECTION_FIELD,
  buildDirectGlobalProjection,
  isPriorityPartitionFromProjection,
  projectedListIncludes,
};
