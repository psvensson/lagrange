import {ADDRESS, ENTITY_TYPE} from '../constants/index.js';
import {OUTBOUND_DELIVERY_PRIORITY} from '../constants/transport.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from './system-table-schemas-constants.js';

const LOCAL_NUM_THREE = 3;

const PARTITION_ID_CANONICAL_PATTERN = /^(.+)-p\d+$/;
const PARTITION_ID_SPLIT_SEPARATOR = '_p_';
const REPLICA_ID_SUFFIX_PATTERN = /-r\d+$/;

const SYSTEM_TABLE_IDS = new Set(Object.values(SYSTEM_TABLE_NAME));

const PRIORITY_CONTROL_PLANE_TABLE_IDS = new Set([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);

const CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS = new Set([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);

const CRITICAL_TRANSPORT_TARGET_REASON = Object.freeze({
  INVALID_TARGET_ADDRESS: 'invalid_target_address',
  INITIAL_MESSAGE_GROUP: 'initial_message_group',
  CRITICAL_CONTROL_PLANE_PARTITION: 'critical_control_plane_partition',
  NON_CRITICAL_TARGET: 'non_critical_target',
});

const SYSTEM_TABLE_MUTATION_TRANSPORT_REASON = Object.freeze({
  INVALID_TABLE_NAME: 'invalid_table_name',
  CRITICAL_TRANSPORT_PARTITION: 'critical_transport_partition',
  NON_CRITICAL_SYSTEM_TABLE: 'non_critical_system_table',
});

const INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID = new Map(
  Object.entries(INITIAL_PARTITION_IDS).map(([tableId, partitionId]) => [
    partitionId,
    tableId,
  ]),
);

function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getPartitionIdFromPartitionRow(partitionRow = null) {
  if (!partitionRow || typeof partitionRow !== 'object') {
    return null;
  }
  return normalizeNonEmptyString(
    partitionRow.partition_id ?? partitionRow.partitionId,
  );
}

function getTableIdFromPartitionRow(partitionRow = null) {
  if (!partitionRow || typeof partitionRow !== 'object') {
    return null;
  }
  return normalizeNonEmptyString(
    partitionRow.table_id ?? partitionRow.tableId,
  );
}

function resolvePartitionTableIdFromPartitionId(partitionId) {
  const normalizedPartitionId = normalizeNonEmptyString(partitionId);
  if (!normalizedPartitionId) {
    return null;
  }

  if (INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID.has(normalizedPartitionId)) {
    return INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID.get(normalizedPartitionId);
  }

  const canonicalMatch = normalizedPartitionId.match(
    PARTITION_ID_CANONICAL_PATTERN,
  );
  if (canonicalMatch && canonicalMatch[1]) {
    return canonicalMatch[1];
  }

  const splitSeparatorIndex = normalizedPartitionId.indexOf(
    PARTITION_ID_SPLIT_SEPARATOR,
  );
  if (splitSeparatorIndex > 0) {
    return normalizedPartitionId.slice(0, splitSeparatorIndex);
  }

  return null;
}

function resolvePartitionTableId(options = {}) {
  const partitionRow = options.partitionRow || null;
  const rowTableId = getTableIdFromPartitionRow(partitionRow);
  if (rowTableId) {
    return rowTableId;
  }
  const rowPartitionId = getPartitionIdFromPartitionRow(partitionRow);
  if (rowPartitionId) {
    const parsedTableId = resolvePartitionTableIdFromPartitionId(
      rowPartitionId,
    );
    if (parsedTableId) {
      return parsedTableId;
    }
  }
  return resolvePartitionTableIdFromPartitionId(options.partitionId);
}

function isSystemTablePartition(options = {}) {
  const tableId = resolvePartitionTableId(options);
  return tableId !== null && SYSTEM_TABLE_IDS.has(tableId);
}

function isPriorityControlPlanePartition(options = {}) {
  const tableId = resolvePartitionTableId(options);
  return tableId !== null && PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId);
}

// The replica_operations table is the operation LEDGER: every in-flight
// operation persists its workflow progress into it, so a partition of this
// table is the one partition whose own move disrupts every other move.
function isOperationLedgerPartition(options = {}) {
  return resolvePartitionTableId(options) ===
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
}

function isCriticalTransportControlPlanePartition(options = {}) {
  const tableId = resolvePartitionTableId(options);
  return tableId !== null &&
    CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS.has(tableId);
}

function isInitialMessageGroupEntityId(entityId) {
  const normalizedEntityId = normalizeNonEmptyString(entityId);
  return normalizedEntityId === INITIAL_MESSAGE_GROUP_ID ||
    normalizedEntityId?.startsWith(`${INITIAL_MESSAGE_GROUP_ID}-r`) === true;
}

function resolveCriticalTransportTargetSnapshot(options = {}) {
  const normalizedTargetAddress = normalizeNonEmptyString(
    options.targetAddress,
  );
  if (!normalizedTargetAddress) {
    return Object.freeze({
      criticalTransport: false,
      entityId: null,
      entityType: null,
      partitionId: null,
      reasonCode: CRITICAL_TRANSPORT_TARGET_REASON.INVALID_TARGET_ADDRESS,
      targetAddress: null,
    });
  }

  const addressSegments = normalizedTargetAddress.split(ADDRESS.SEPARATOR);
  if (addressSegments.length < LOCAL_NUM_THREE) {
    return Object.freeze({
      criticalTransport: false,
      entityId: null,
      entityType: null,
      partitionId: null,
      reasonCode: CRITICAL_TRANSPORT_TARGET_REASON.INVALID_TARGET_ADDRESS,
      targetAddress: normalizedTargetAddress,
    });
  }

  const entityType = normalizeNonEmptyString(addressSegments[1]);
  const entityId = normalizeNonEmptyString(
    addressSegments.slice(2).join(ADDRESS.SEPARATOR),
  );
  const partitionId = entityType === ENTITY_TYPE.PARTITION && entityId ?
    entityId.replace(REPLICA_ID_SUFFIX_PATTERN, '') :
    null;

  if (entityType === ENTITY_TYPE.MESSAGE_GROUP &&
      isInitialMessageGroupEntityId(entityId)) {
    return Object.freeze({
      criticalTransport: true,
      entityId,
      entityType,
      partitionId: null,
      reasonCode: CRITICAL_TRANSPORT_TARGET_REASON.INITIAL_MESSAGE_GROUP,
      targetAddress: normalizedTargetAddress,
    });
  }

  if (entityType === ENTITY_TYPE.PARTITION &&
      isCriticalTransportControlPlanePartition({partitionId})) {
    return Object.freeze({
      criticalTransport: true,
      entityId,
      entityType,
      partitionId,
      reasonCode:
        CRITICAL_TRANSPORT_TARGET_REASON.CRITICAL_CONTROL_PLANE_PARTITION,
      targetAddress: normalizedTargetAddress,
    });
  }

  return Object.freeze({
    criticalTransport: false,
    entityId,
    entityType,
    partitionId,
    reasonCode: CRITICAL_TRANSPORT_TARGET_REASON.NON_CRITICAL_TARGET,
    targetAddress: normalizedTargetAddress,
  });
}

function isCriticalTransportTargetAddress(options = {}) {
  return resolveCriticalTransportTargetSnapshot(options).criticalTransport ===
    true;
}

function resolveSystemTableMutationTransportSnapshot(options = {}) {
  const tableName = normalizeNonEmptyString(options.tableName);
  if (!tableName || !SYSTEM_TABLE_IDS.has(tableName)) {
    return Object.freeze({
      criticalTransport: false,
      deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.BACKGROUND,
      partitionId: null,
      reasonCode: SYSTEM_TABLE_MUTATION_TRANSPORT_REASON.INVALID_TABLE_NAME,
      tableName,
    });
  }

  const partitionId = normalizeNonEmptyString(INITIAL_PARTITION_IDS[tableName]);
  if (partitionId &&
      isCriticalTransportControlPlanePartition({partitionId})) {
    return Object.freeze({
      criticalTransport: true,
      deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.CRITICAL,
      partitionId,
      reasonCode:
        SYSTEM_TABLE_MUTATION_TRANSPORT_REASON.CRITICAL_TRANSPORT_PARTITION,
      tableName,
    });
  }

  return Object.freeze({
    criticalTransport: false,
    deliveryPriority: OUTBOUND_DELIVERY_PRIORITY.BACKGROUND,
    partitionId,
    reasonCode: SYSTEM_TABLE_MUTATION_TRANSPORT_REASON.NON_CRITICAL_SYSTEM_TABLE,
    tableName,
  });
}

function resolveSystemTableMutationDeliveryPriority(options = {}) {
  return resolveSystemTableMutationTransportSnapshot(options).deliveryPriority;
}

function getPartitionRowFromCache(systemTableCache, partitionId) {
  const normalizedPartitionId = normalizeNonEmptyString(partitionId);
  if (!normalizedPartitionId || !systemTableCache) {
    return null;
  }
  if (typeof systemTableCache.get === 'function') {
    const directRow = systemTableCache.get(
      SYSTEM_TABLE_NAME.PARTITIONS,
      normalizedPartitionId,
    );
    if (directRow && typeof directRow === 'object') {
      return directRow;
    }
  }
  if (typeof systemTableCache.filter !== 'function') {
    return null;
  }
  const matchingRows = systemTableCache.filter(
    SYSTEM_TABLE_NAME.PARTITIONS,
    (partitionRow) => {
      return getPartitionIdFromPartitionRow(partitionRow) ===
        normalizedPartitionId;
    },
  );
  return Array.isArray(matchingRows) ?
    matchingRows[0] || null :
    null;
}

function buildPartitionRowByPartitionId(partitionRows = []) {
  const partitionRowByPartitionId = new Map();
  const rows = Array.isArray(partitionRows) ? partitionRows : [];
  for (const partitionRow of rows) {
    const partitionId = getPartitionIdFromPartitionRow(partitionRow);
    if (!partitionId) {
      continue;
    }
    partitionRowByPartitionId.set(partitionId, partitionRow);
  }
  return partitionRowByPartitionId;
}

function addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId) {
  if (!tableId ||
      !partitionId ||
      !PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId)) {
    return;
  }
  if (!priorityPartitionIdsByTableId.has(tableId)) {
    priorityPartitionIdsByTableId.set(tableId, new Set());
  }
  priorityPartitionIdsByTableId.get(tableId).add(partitionId);
}

function resolvePriorityControlPlanePartitionIds(options = {}) {
  const partitionRows = Array.isArray(options.partitionRows) ?
    options.partitionRows :
    [];
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  const includeInitialWhenMissing = options.includeInitialWhenMissing !== false;
  const partitionRowByPartitionId = options.partitionRowByPartitionId instanceof Map ?
    options.partitionRowByPartitionId :
    buildPartitionRowByPartitionId(partitionRows);
  const priorityPartitionIdsByTableId = new Map();

  for (const partitionRow of partitionRows) {
    const partitionId = getPartitionIdFromPartitionRow(partitionRow);
    const tableId = resolvePartitionTableId({
      partitionId,
      partitionRow,
    });
    addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId);
  }

  for (const serviceRow of serviceRows) {
    if (!serviceRow || typeof serviceRow !== 'object') {
      continue;
    }
    const partitionId = normalizeNonEmptyString(
      serviceRow.partition_id ?? serviceRow.partitionId,
    );
    if (!partitionId) {
      continue;
    }
    const partitionRow = partitionRowByPartitionId.get(partitionId) || null;
    const tableId = resolvePartitionTableId({
      partitionId,
      partitionRow,
    });
    addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId);
  }

  for (const tableId of PRIORITY_CONTROL_PLANE_TABLE_IDS) {
    if (priorityPartitionIdsByTableId.has(tableId)) {
      continue;
    }
    if (!includeInitialWhenMissing) {
      continue;
    }
    const fallbackPartitionId = normalizeNonEmptyString(
      INITIAL_PARTITION_IDS[tableId],
    );
    if (!fallbackPartitionId) {
      continue;
    }
    addPriorityPartitionId(
      priorityPartitionIdsByTableId,
      tableId,
      fallbackPartitionId,
    );
  }

  const partitionIds = [];
  for (const partitionIdSet of priorityPartitionIdsByTableId.values()) {
    for (const partitionId of partitionIdSet) {
      partitionIds.push(partitionId);
    }
  }
  return [...new Set(partitionIds)].sort((left, right) =>
    left.localeCompare(right),
  );
}

export {
  CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS,
  CRITICAL_TRANSPORT_TARGET_REASON,
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  getPartitionRowFromCache,
  isCriticalTransportControlPlanePartition,
  isCriticalTransportTargetAddress,
  isOperationLedgerPartition,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
  resolveCriticalTransportTargetSnapshot,
  resolvePartitionTableId,
  resolvePriorityControlPlanePartitionIds,
  resolveSystemTableMutationDeliveryPriority,
  resolveSystemTableMutationTransportSnapshot,
  SYSTEM_TABLE_MUTATION_TRANSPORT_REASON,
};
