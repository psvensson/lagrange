import {ADDRESS, ENTITY_TYPE} from '../constants/index.js';
import {types} from 'node:util';
import {OUTBOUND_DELIVERY_PRIORITY} from '../constants/transport.js';
import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from './system-table-schemas-constants.js';

const LOCAL_NUM_THREE = 3;
const DESCRIPTOR_VALUE_FIELD = 'value';
const arrayIsArray = Array.isArray;
const arrayPush = Function.call.bind(Array.prototype.push);
const sortArray = Function.call.bind(Array.prototype.sort);
const MapConstructor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const isProxy = types.isProxy.bind(types);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const setValues = Function.call.bind(Set.prototype.values);
const setIteratorNext = Function.call.bind(
  Object.getPrototypeOf(setValues(new SetConstructor())).next,
);
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);

const PARTITION_ID_CANONICAL_PATTERN = /^(.+)-p\d+$/;
const PARTITION_ID_SPLIT_SEPARATOR = '_p_';
const REPLICA_ID_SUFFIX_PATTERN = /-r\d+$/;

const SYSTEM_TABLE_IDS = new Set(Object.values(SYSTEM_TABLE_NAME));

// First partition of every system table — the bootstrap-critical partition set.
// NOTE the deliberate -p1 scoping: this names only FIRST partitions, while
// isSystemTablePartition matches any partition of a system table. Previously
// re-derived locally in replica-handler-transition-policy,
// partition-service-shared, and partition-service-row-owner (identical copies
// that could silently drift); declared once here.
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);

const PRIORITY_CONTROL_PLANE_TABLE_ID_LIST = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);
const PRIORITY_CONTROL_PLANE_TABLE_IDS = new SetConstructor(
  PRIORITY_CONTROL_PLANE_TABLE_ID_LIST,
);

// Exact formation dependency whose durable liveness rows are stored through
// the partition it must spread. This is intentionally NOT a priority
// control-plane table: the distinct fact is consumed only by the serial
// formation planner and its matching evidence gates.
const FORMATION_LIVENESS_DEPENDENCY_PARTITION_IDS = new Set([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
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

const INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID = new MapConstructor(
  Object.entries(INITIAL_PARTITION_IDS).map(([tableId, partitionId]) => [
    partitionId,
    tableId,
  ]),
);

function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = stringTrim(value);
  return normalized.length > 0 ? normalized : null;
}

function readOwnDataValue(record, propertyNames) {
  if (!record || typeof record !== 'object' || isProxy(record)) {
    return {found: false, valid: false, value: null};
  }
  for (let index = 0; index < propertyNames.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(
      record,
      propertyNames[index],
    );
    if (!descriptor) {
      continue;
    }
    return objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD) ?
      {found: true, valid: true, value: descriptor.value} :
      {found: true, valid: false, value: null};
  }
  return {found: false, valid: true, value: null};
}

function getPartitionIdFromPartitionRow(partitionRow = null) {
  const entry = readOwnDataValue(
    partitionRow,
    ['partition_id', 'partitionId'],
  );
  return entry.valid ? normalizeNonEmptyString(entry.value) : null;
}

function getTableIdFromPartitionRow(partitionRow = null) {
  const entry = readOwnDataValue(partitionRow, ['table_id', 'tableId']);
  return entry.valid ? normalizeNonEmptyString(entry.value) : null;
}

function resolvePartitionTableIdFromPartitionId(partitionId) {
  const normalizedPartitionId = normalizeNonEmptyString(partitionId);
  if (!normalizedPartitionId) {
    return null;
  }

  if (mapHas(INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID, normalizedPartitionId)) {
    return mapGet(INITIAL_PARTITION_TABLE_ID_BY_PARTITION_ID, normalizedPartitionId);
  }

  const canonicalMatch = regexpExec(
    PARTITION_ID_CANONICAL_PATTERN,
    normalizedPartitionId,
  );
  if (canonicalMatch && canonicalMatch[1]) {
    return canonicalMatch[1];
  }

  const splitSeparatorIndex = stringIndexOf(
    normalizedPartitionId,
    PARTITION_ID_SPLIT_SEPARATOR,
  );
  if (splitSeparatorIndex > 0) {
    return stringSlice(normalizedPartitionId, 0, splitSeparatorIndex);
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

const SYSTEM_PARTITION_CLASS = Object.freeze({
  BOOTSTRAP_CRITICAL: 'bootstrap_critical',
  PRIORITY_CONTROL_PLANE: 'priority_control_plane',
  DEFAULT: 'default',
});

const SYSTEM_PARTITION_CLASS_ROWS = Object.freeze([
  Object.freeze({
    partitionClass: SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
    matches: ({partitionId}) =>
      setHas(CRITICAL_SYSTEM_PARTITION_IDS, partitionId),
  }),
  Object.freeze({
    partitionClass: SYSTEM_PARTITION_CLASS.PRIORITY_CONTROL_PLANE,
    matches: ({tableId}) =>
      setHas(PRIORITY_CONTROL_PLANE_TABLE_IDS, tableId),
  }),
  Object.freeze({
    partitionClass: SYSTEM_PARTITION_CLASS.DEFAULT,
    matches: () => true,
  }),
]);

function classifySystemPartition(options = {}) {
  const partitionId =
    getPartitionIdFromPartitionRow(options.partitionRow) ||
    normalizeNonEmptyString(options.partitionId);
  const tableId = resolvePartitionTableId(options);
  const context = Object.freeze({partitionId, tableId});
  const row = SYSTEM_PARTITION_CLASS_ROWS.find((candidate) =>
    candidate.matches(context));
  return Object.freeze({
    partitionClass: row.partitionClass,
    bootstrapCritical: setHas(CRITICAL_SYSTEM_PARTITION_IDS, partitionId),
    formationLivenessDependency:
      setHas(FORMATION_LIVENESS_DEPENDENCY_PARTITION_IDS, partitionId),
    priorityControlPlane: setHas(PRIORITY_CONTROL_PLANE_TABLE_IDS, tableId),
    systemTable: setHas(SYSTEM_TABLE_IDS, tableId),
  });
}

function isBootstrapCriticalSystemPartitionId(partitionId) {
  return setHas(CRITICAL_SYSTEM_PARTITION_IDS, partitionId);
}

function isSystemTablePartition(options = {}) {
  return classifySystemPartition(options).systemTable;
}

function isPriorityControlPlanePartition(options = {}) {
  return classifySystemPartition(options).priorityControlPlane;
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
    setHas(CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS, tableId);
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
  if (!tableName || !setHas(SYSTEM_TABLE_IDS, tableName)) {
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
  return arrayIsArray(matchingRows) ?
    matchingRows[0] || null :
    null;
}

function buildPartitionRowByPartitionId(partitionRows = []) {
  const partitionRowByPartitionId = new MapConstructor();
  const rows = copyDenseOwnDataRecordArray(partitionRows) || [];
  for (let index = 0; index < rows.length; index += 1) {
    const partitionRow = rows[index];
    const partitionId = getPartitionIdFromPartitionRow(partitionRow);
    if (!partitionId) {
      continue;
    }
    mapSet(partitionRowByPartitionId, partitionId, partitionRow);
  }
  return partitionRowByPartitionId;
}

function buildInitialPriorityPartitionIds() {
  const partitionIds = [];
  for (let index = 0;
    index < PRIORITY_CONTROL_PLANE_TABLE_ID_LIST.length;
    index += 1) {
    const partitionId = normalizeNonEmptyString(
      INITIAL_PARTITION_IDS[PRIORITY_CONTROL_PLANE_TABLE_ID_LIST[index]],
    );
    if (partitionId) {
      arrayPush(partitionIds, partitionId);
    }
  }
  sortArray(partitionIds);
  return partitionIds;
}

function readPriorityPartitionResolutionOptionEntries(options) {
  const partitionRowsEntry = readOwnDataValue(options, ['partitionRows']);
  const serviceRowsEntry = readOwnDataValue(options, ['serviceRows']);
  const includeInitialEntry = readOwnDataValue(
    options,
    ['includeInitialWhenMissing'],
  );
  const partitionMapEntry = readOwnDataValue(
    options,
    ['partitionRowByPartitionId'],
  );
  if (!partitionRowsEntry.valid ||
      !serviceRowsEntry.valid ||
      !includeInitialEntry.valid ||
      !partitionMapEntry.valid) {
    return null;
  }
  return {
    includeInitialEntry,
    partitionMapEntry,
    partitionRowsEntry,
    serviceRowsEntry,
  };
}

function copyPriorityResolutionRows(entry) {
  return copyDenseOwnDataRecordArray(entry.found ? entry.value : []);
}

function resolvePriorityPartitionRowMap(partitionMapEntry, partitionRows) {
  const candidatePartitionMap = partitionMapEntry.value;
  return partitionMapEntry.found &&
    !isProxy(candidatePartitionMap) &&
    candidatePartitionMap instanceof MapConstructor ?
    candidatePartitionMap :
    buildPartitionRowByPartitionId(partitionRows);
}

function normalizePriorityPartitionResolutionOptions(options) {
  const entries = readPriorityPartitionResolutionOptionEntries(options);
  if (entries === null) {
    return null;
  }
  const partitionRows = copyPriorityResolutionRows(
    entries.partitionRowsEntry,
  );
  const serviceRows = copyPriorityResolutionRows(entries.serviceRowsEntry);
  if (partitionRows === null || serviceRows === null) {
    return null;
  }
  return {
    includeInitialWhenMissing:
      !entries.includeInitialEntry.found ||
      entries.includeInitialEntry.value !== false,
    partitionRowByPartitionId: resolvePriorityPartitionRowMap(
      entries.partitionMapEntry,
      partitionRows,
    ),
    partitionRows,
    serviceRows,
  };
}

function addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId) {
  if (!tableId ||
      !partitionId ||
      !setHas(PRIORITY_CONTROL_PLANE_TABLE_IDS, tableId)) {
    return;
  }
  if (!mapHas(priorityPartitionIdsByTableId, tableId)) {
    mapSet(
      priorityPartitionIdsByTableId,
      tableId,
      new SetConstructor(),
    );
  }
  setAdd(mapGet(priorityPartitionIdsByTableId, tableId), partitionId);
}

function buildDeterministicPriorityPartitionIds(
  priorityPartitionIdsByTableId,
) {
  // Preserve the frozen table order and captured collection intrinsics before
  // the final lexical sort; ambient prototype mutation must not change output.
  const partitionIds = [];
  const seenPartitionIds = new SetConstructor();
  for (let index = 0;
    index < PRIORITY_CONTROL_PLANE_TABLE_ID_LIST.length;
    index += 1) {
    const tableId = PRIORITY_CONTROL_PLANE_TABLE_ID_LIST[index];
    const partitionIdSet = mapGet(priorityPartitionIdsByTableId, tableId);
    if (!partitionIdSet) {
      continue;
    }
    const iterator = setValues(partitionIdSet);
    for (let step = setIteratorNext(iterator);
      !step.done;
      step = setIteratorNext(iterator)) {
      if (!setHas(seenPartitionIds, step.value)) {
        setAdd(seenPartitionIds, step.value);
        arrayPush(partitionIds, step.value);
      }
    }
  }
  sortArray(partitionIds);
  return partitionIds;
}

function resolvePriorityControlPlanePartitionIds(options = {}) {
  const normalizedOptions = normalizePriorityPartitionResolutionOptions(
    options,
  );
  if (normalizedOptions === null) {
    return buildInitialPriorityPartitionIds();
  }
  const {
    includeInitialWhenMissing,
    partitionRowByPartitionId,
    partitionRows,
    serviceRows,
  } = normalizedOptions;
  const priorityPartitionIdsByTableId = new MapConstructor();

  for (let index = 0; index < partitionRows.length; index += 1) {
    const partitionRow = partitionRows[index];
    const partitionId = getPartitionIdFromPartitionRow(partitionRow);
    const tableId = resolvePartitionTableId({
      partitionId,
      partitionRow,
    });
    addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId);
  }

  for (let index = 0; index < serviceRows.length; index += 1) {
    const serviceRow = serviceRows[index];
    const partitionIdEntry = readOwnDataValue(
      serviceRow,
      ['partition_id', 'partitionId'],
    );
    const partitionId = partitionIdEntry.valid ?
      normalizeNonEmptyString(partitionIdEntry.value) :
      null;
    if (!partitionId) {
      continue;
    }
    const partitionRow = mapGet(partitionRowByPartitionId, partitionId) || null;
    const tableId = resolvePartitionTableId({
      partitionId,
      partitionRow,
    });
    addPriorityPartitionId(priorityPartitionIdsByTableId, tableId, partitionId);
  }

  for (let index = 0;
    index < PRIORITY_CONTROL_PLANE_TABLE_ID_LIST.length;
    index += 1) {
    const tableId = PRIORITY_CONTROL_PLANE_TABLE_ID_LIST[index];
    if (mapHas(priorityPartitionIdsByTableId, tableId)) {
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

  return buildDeterministicPriorityPartitionIds(
    priorityPartitionIdsByTableId,
  );
}

export {
  CRITICAL_SYSTEM_PARTITION_IDS,
  CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS,
  CRITICAL_TRANSPORT_TARGET_REASON,
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  SYSTEM_PARTITION_CLASS,
  SYSTEM_PARTITION_CLASS_ROWS,
  buildPartitionRowByPartitionId,
  classifySystemPartition,
  getPartitionRowFromCache,
  isBootstrapCriticalSystemPartitionId,
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
