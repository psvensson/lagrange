import {NUM, TYPEOF} from '../constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from './system-table-schemas-constants.js';

const PARTITION_ID_CANONICAL_PATTERN = /^(.+)-p\d+$/;
const PARTITION_ID_SPLIT_SEPARATOR = '_p_';

const SYSTEM_TABLE_IDS = new Set(Object.values(SYSTEM_TABLE_NAME));

const PRIORITY_CONTROL_PLANE_TABLE_IDS = new Set([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);

const CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS = new Set([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
]);

const INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID = new Map(
  Object.entries(INITIAL_PARTITION_IDS).map(([tableId, partitionId]) => [
    partitionId,
    tableId,
  ]),
);

function normalizeNonEmptyString(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function getPartitionIdFromPartitionRow(partitionRow = null) {
  if (!partitionRow || typeof partitionRow !== TYPEOF.OBJECT) {
    return null;
  }
  return normalizeNonEmptyString(
    partitionRow.partition_id ?? partitionRow.partitionId,
  );
}

function getTableIdFromPartitionRow(partitionRow = null) {
  if (!partitionRow || typeof partitionRow !== TYPEOF.OBJECT) {
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
  if (canonicalMatch && canonicalMatch[NUM.ONE]) {
    return canonicalMatch[NUM.ONE];
  }

  const splitSeparatorIndex = normalizedPartitionId.indexOf(
    PARTITION_ID_SPLIT_SEPARATOR,
  );
  if (splitSeparatorIndex > NUM.ZERO) {
    return normalizedPartitionId.slice(NUM.ZERO, splitSeparatorIndex);
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

function isCriticalTransportControlPlanePartition(options = {}) {
  const tableId = resolvePartitionTableId(options);
  return tableId !== null &&
    CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS.has(tableId);
}

function getPartitionRowFromCache(systemTableCache, partitionId) {
  const normalizedPartitionId = normalizeNonEmptyString(partitionId);
  if (!normalizedPartitionId || !systemTableCache) {
    return null;
  }
  if (typeof systemTableCache.get === TYPEOF.FUNCTION) {
    const directRow = systemTableCache.get(
      SYSTEM_TABLE_NAME.PARTITIONS,
      normalizedPartitionId,
    );
    if (directRow && typeof directRow === TYPEOF.OBJECT) {
      return directRow;
    }
  }
  if (typeof systemTableCache.filter !== TYPEOF.FUNCTION) {
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
    matchingRows[NUM.ZERO] || null :
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
    if (!serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
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
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  getPartitionRowFromCache,
  isCriticalTransportControlPlanePartition,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
  resolvePartitionTableId,
  resolvePriorityControlPlanePartitionIds,
};
