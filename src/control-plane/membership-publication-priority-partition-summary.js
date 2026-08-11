import {COLUMN, SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  resolvePartitionTableId,
} from '../bootstrap/system-partition-classification.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  addExactNonNegativeInteger,
  appendOwnArrayValue,
  buildStringSet,
  compareExactValues,
  copyDenseOwnDataArray,
  copyDenseOwnDataRecordArray,
  copyExclusionCounts,
  copyStrictOwnDataRecord,
  createNullRecord as objectCreate,
  DATA_PROPERTY_STATE,
  defineOwnDataProperty as objectDefineProperty,
  exactNonNegativeZero,
  inspectOwnDataProperty,
  MapConstructor,
  mapGet,
  mapHas,
  mapIteratorNext,
  mapSet,
  mapValues,
  normalizeExclusionReasonCount,
  normalizeExpectedReplicaCount,
  normalizeNonNegativeSafeInteger,
  normalizePrimitiveStringList,
  normalizedPriorityPartitionSummariesEqual,
  priorityPartitionDiagnosticsEqual,
  readOwnDataProperty,
  readOwnLowerPrimitiveString,
  readOwnPrimitiveString,
  setAdd,
  setHas,
  setIteratorNext,
  setSize,
  setValues,
  sortArray as arraySort,
} from './membership-publication-priority-partition-canonical-data.js';
import {
  buildPrioritySpreadEligibleNodeSnapshot,
  isReadinessPromotable,
} from './membership-publication-priority-partition-readiness-data.js';
const PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT = 3;
const INVALID_NORMALIZED_BLOCKED_PARTITION = null;
const EXPECTED_REPLICA_COUNT_FIELD = 'expectedReplicaCount';
const ROW_ABSENT_REASON = 'row_absent';
const SERVICE_ADDRESS_FIELDS = Object.freeze([COLUMN.ADDRESS, 'address']);
const SERVICE_ID_FIELDS = Object.freeze([
  COLUMN.SERVICE_ID,
  'service_id',
  'serviceId',
]);
const SERVICE_NODE_ID_FIELDS = Object.freeze([
  COLUMN.NODE_ID,
  'node_id',
  'nodeId',
]);
const SERVICE_PARTITION_ID_FIELDS = Object.freeze([
  COLUMN.PARTITION_ID,
  'partition_id',
  'partitionId',
]);
const SERVICE_RAFT_ROLE_FIELDS = Object.freeze([
  COLUMN.RAFT_ROLE,
  'raft_role',
  'raftRole',
]);
const SERVICE_STATUS_FIELDS = Object.freeze([COLUMN.STATUS, 'status']);
const SERVICE_TYPE_FIELDS = Object.freeze([
  COLUMN.SERVICE_TYPE,
  'service_type',
  'serviceType',
]);
const mathMax = Math.max;
const mathMin = Math.min;

function readCanonicalNonNegativeInteger(
  record,
  propertyNames,
  fallback,
) {
  const entry = inspectOwnDataProperty(record, propertyNames);
  if (entry.state === DATA_PROPERTY_STATE.ABSENT) {
    return {valid: true, value: fallback};
  }
  if (entry.state !== DATA_PROPERTY_STATE.VALID) {
    return {valid: false, value: null};
  }
  const value = normalizeNonNegativeSafeInteger(entry.value, null);
  return {valid: value !== null, value};
}

function normalizeBlockedPriorityPartition(
  entry,
  requiredDistinctNodeCount = 0,
) {
  const entrySnapshot = copyStrictOwnDataRecord(entry);
  if (entrySnapshot === null) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  const partitionId = readOwnPrimitiveString(
    entrySnapshot,
    ['partitionId', 'partition_id'],
  );
  if (!partitionId) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  const requiredDistinctNodeCountEntry = readCanonicalNonNegativeInteger(
    entrySnapshot,
    ['requiredDistinctNodeCount', 'required_distinct_node_count'],
    requiredDistinctNodeCount,
  );
  const readyDistinctNodeCountEntry = readCanonicalNonNegativeInteger(
    entrySnapshot,
    ['readyDistinctNodeCount', 'ready_distinct_node_count'],
    0,
  );
  const readyReplicaCountEntry = readCanonicalNonNegativeInteger(
    entrySnapshot,
    ['readyReplicaCount', 'ready_replica_count'],
    readyDistinctNodeCountEntry.value,
  );
  if (!requiredDistinctNodeCountEntry.valid ||
      !readyDistinctNodeCountEntry.valid ||
      !readyReplicaCountEntry.valid) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  const normalizedRequiredDistinctNodeCount =
    requiredDistinctNodeCountEntry.value;
  const readyDistinctNodeCount = readyDistinctNodeCountEntry.value;
  const readyReplicaCount = readyReplicaCountEntry.value;
  const expectedReplicaCountEntry = inspectOwnDataProperty(
    entrySnapshot,
    [EXPECTED_REPLICA_COUNT_FIELD, 'expected_replica_count'],
  );
  if (expectedReplicaCountEntry.state === DATA_PROPERTY_STATE.INVALID) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  const expectedReplicaCount =
    expectedReplicaCountEntry.state === DATA_PROPERTY_STATE.VALID ?
      normalizeExpectedReplicaCount(expectedReplicaCountEntry.value) :
      null;
  const spreadGapEntry = readCanonicalNonNegativeInteger(
    entrySnapshot,
    ['spreadGap', 'spread_gap'],
    mathMax(0, normalizedRequiredDistinctNodeCount - readyDistinctNodeCount),
  );
  if (!spreadGapEntry.valid) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  const spreadGap = spreadGapEntry.value;
  const exclusionReasonCountsEntry = inspectOwnDataProperty(
    entrySnapshot,
    ['exclusionReasonCounts', 'exclusion_reason_counts'],
  );
  if (exclusionReasonCountsEntry.state === DATA_PROPERTY_STATE.INVALID) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  const exclusionReasonCounts =
    exclusionReasonCountsEntry.state === DATA_PROPERTY_STATE.VALID ?
      copyExclusionCounts(exclusionReasonCountsEntry.value) :
      null;
  if (exclusionReasonCountsEntry.state === DATA_PROPERTY_STATE.VALID &&
      exclusionReasonCounts === null) {
    return INVALID_NORMALIZED_BLOCKED_PARTITION;
  }
  return {
    partitionId,
    requiredDistinctNodeCount: normalizedRequiredDistinctNodeCount,
    readyDistinctNodeCount,
    readyReplicaCount,
    ...(expectedReplicaCount !== null ? {expectedReplicaCount} : {}),
    spreadGap,
    ...(exclusionReasonCounts ? {exclusionReasonCounts} : {}),
  };
}

function normalizePriorityPartitionSummary(summary, options = {}, _helperFns = {}) {
  const summarySnapshot = copyStrictOwnDataRecord(summary);
  const optionsSnapshot = copyStrictOwnDataRecord(options);
  if (summarySnapshot === null || optionsSnapshot === null) {
    return null;
  }
  const fallbackRequiredDistinctNodeCountEntry = readCanonicalNonNegativeInteger(
    optionsSnapshot,
    ['requiredDistinctNodeCount'],
    0,
  );
  if (!fallbackRequiredDistinctNodeCountEntry.valid) {
    return null;
  }
  const requiredDistinctNodeCountEntry = readCanonicalNonNegativeInteger(
    summarySnapshot,
    ['requiredDistinctNodeCount', 'required_distinct_node_count'],
    fallbackRequiredDistinctNodeCountEntry.value,
  );
  if (!requiredDistinctNodeCountEntry.valid) {
    return null;
  }
  const requiredDistinctNodeCount = requiredDistinctNodeCountEntry.value;
  const blockedPartitionsEntry = inspectOwnDataProperty(
    summarySnapshot,
    ['blockedPartitions', 'blocked_partitions'],
  );
  if (blockedPartitionsEntry.state === DATA_PROPERTY_STATE.INVALID) {
    return null;
  }
  const partitionRowsSnapshot =
    blockedPartitionsEntry.state === DATA_PROPERTY_STATE.VALID ?
      copyDenseOwnDataArray(blockedPartitionsEntry.value) :
      [];
  if (partitionRowsSnapshot === null) {
    return null;
  }
  const normalizedPartitions = [];
  for (let index = 0; index < partitionRowsSnapshot.length; index += 1) {
    const normalized = normalizeBlockedPriorityPartition(
      partitionRowsSnapshot[index],
      requiredDistinctNodeCount,
    );
    if (normalized === null) {
      return null;
    }
    appendOwnArrayValue(normalizedPartitions, normalized);
  }
  arraySort(normalizedPartitions, (left, right) =>
    left.partitionId < right.partitionId ? -1 :
      left.partitionId > right.partitionId ? 1 : 0);
  const missingPartitionIdsEntry = inspectOwnDataProperty(
    summarySnapshot,
    ['missingPartitionIds', 'missing_partition_ids'],
  );
  if (missingPartitionIdsEntry.state === DATA_PROPERTY_STATE.INVALID) {
    return null;
  }
  const missingPartitionIdRows =
    missingPartitionIdsEntry.state === DATA_PROPERTY_STATE.VALID ?
      copyDenseOwnDataArray(missingPartitionIdsEntry.value) :
      [];
  if (missingPartitionIdRows === null) {
    return null;
  }
  const missingPartitionIds = normalizePrimitiveStringList(
    missingPartitionIdRows,
    normalizedPartitions,
  );
  if (missingPartitionIds === null) {
    return null;
  }
  const fallbackReadyEligibleNodeCountEntry = readCanonicalNonNegativeInteger(
    optionsSnapshot,
    ['readyEligibleNodeCount'],
    0,
  );
  if (!fallbackReadyEligibleNodeCountEntry.valid) {
    return null;
  }
  const readyEligibleNodeCountEntry = readCanonicalNonNegativeInteger(
    summarySnapshot,
    ['readyEligibleNodeCount', 'ready_eligible_node_count'],
    fallbackReadyEligibleNodeCountEntry.value,
  );
  const totalPriorityPartitionCountEntry = readCanonicalNonNegativeInteger(
    summarySnapshot,
    ['totalPriorityPartitionCount', 'total_priority_partition_count'],
    setSize(PRIORITY_CONTROL_PLANE_TABLE_IDS),
  );
  if (!readyEligibleNodeCountEntry.valid ||
      !totalPriorityPartitionCountEntry.valid) {
    return null;
  }
  const readyEligibleNodeCount = readyEligibleNodeCountEntry.value;
  const totalPriorityPartitionCount = totalPriorityPartitionCountEntry.value;
  const satisfiedEntry = readOwnDataProperty(summarySnapshot, ['satisfied']);
  const satisfied =
    satisfiedEntry.found && satisfiedEntry.value === true &&
    missingPartitionIds.length === 0 &&
    normalizedPartitions.length === 0;
  return {
    satisfied,
    requiredDistinctNodeCount,
    readyEligibleNodeCount,
    totalPriorityPartitionCount,
    missingPartitionIds,
    blockedPartitions: normalizedPartitions,
  };
}

function buildPriorityPartitionSummaryAdvancement(summary, helperFns = {}) {
  const normalizedSummary = normalizePriorityPartitionSummary(summary, {}, helperFns);
  if (normalizedSummary === null) {
    return null;
  }
  let blockedPartitionSpreadGap = exactNonNegativeZero();
  let blockedPartitionReadyDistinctNodeCount = exactNonNegativeZero();
  let diagnosticCompletenessRank = 0;
  for (let index = 0;
    index < normalizedSummary.blockedPartitions.length;
    index += 1) {
    const blockedPartition = normalizedSummary.blockedPartitions[index];
    blockedPartitionSpreadGap = addExactNonNegativeInteger(
      blockedPartitionSpreadGap,
      normalizeNonNegativeSafeInteger(blockedPartition.spreadGap, 0),
    );
    blockedPartitionReadyDistinctNodeCount = addExactNonNegativeInteger(
      blockedPartitionReadyDistinctNodeCount,
      normalizeNonNegativeSafeInteger(
        blockedPartition.readyDistinctNodeCount,
        0,
      ),
    );
    const expectedReplicaCountEntry = readOwnDataProperty(
      blockedPartition,
      [EXPECTED_REPLICA_COUNT_FIELD],
    );
    if (expectedReplicaCountEntry.found && normalizeExpectedReplicaCount(
      expectedReplicaCountEntry.value,
    ) !== null) {
      diagnosticCompletenessRank += 1;
    }
    const exclusionReasonCountsEntry = readOwnDataProperty(
      blockedPartition,
      ['exclusionReasonCounts'],
    );
    const rowAbsentEntry = exclusionReasonCountsEntry.found ?
      readOwnDataProperty(exclusionReasonCountsEntry.value, ['row_absent']) :
      {found: false, value: null};
    if (rowAbsentEntry.found &&
      normalizeExclusionReasonCount(rowAbsentEntry.value) > 0) {
      diagnosticCompletenessRank += 1;
    }
  }
  return {
    normalizedSummary,
    satisfiedRank: normalizedSummary.satisfied === true ? 1 : 0,
    missingPartitionCount: normalizedSummary.missingPartitionIds.length,
    blockedPartitionCount: normalizedSummary.blockedPartitions.length,
    blockedPartitionSpreadGap,
    blockedPartitionReadyDistinctNodeCount,
    diagnosticCompletenessRank,
  };
}

function comparePriorityPartitionSummaryAdvancement(leftSummary, rightSummary, helperFns = {}) {
  const leftAdvancement = buildPriorityPartitionSummaryAdvancement(leftSummary, helperFns);
  const rightAdvancement = buildPriorityPartitionSummaryAdvancement(rightSummary, helperFns);
  if (leftAdvancement === null || rightAdvancement === null) {
    return 0;
  }
  const comparisons = [
    compareExactValues(leftAdvancement.satisfiedRank, rightAdvancement.satisfiedRank),
    compareExactValues(
      rightAdvancement.missingPartitionCount,
      leftAdvancement.missingPartitionCount,
    ),
    compareExactValues(
      rightAdvancement.blockedPartitionCount,
      leftAdvancement.blockedPartitionCount,
    ),
    compareExactValues(
      rightAdvancement.blockedPartitionSpreadGap,
      leftAdvancement.blockedPartitionSpreadGap,
    ),
    compareExactValues(
      leftAdvancement.blockedPartitionReadyDistinctNodeCount,
      rightAdvancement.blockedPartitionReadyDistinctNodeCount,
    ),
    compareExactValues(
      leftAdvancement.normalizedSummary.readyEligibleNodeCount,
      rightAdvancement.normalizedSummary.readyEligibleNodeCount,
    ),
    compareExactValues(
      leftAdvancement.diagnosticCompletenessRank,
      rightAdvancement.diagnosticCompletenessRank,
    ),
  ];
  let decisiveComparison = 0;
  for (let index = 0; index < comparisons.length; index += 1) {
    if (comparisons[index] !== 0) {
      decisiveComparison = comparisons[index];
      break;
    }
  }
  return decisiveComparison;
}

function chooseMoreAdvancedPriorityPartitionSummary(
  baselineSummary,
  candidateSummary,
  helperFns = {},
) {
  const normalizedBaselineSummary = normalizePriorityPartitionSummary(
    baselineSummary,
    {},
    helperFns,
  );
  const normalizedCandidateSummary = normalizePriorityPartitionSummary(
    candidateSummary,
    {},
    helperFns,
  );
  if (normalizedBaselineSummary === null) {
    return normalizedCandidateSummary;
  }
  if (normalizedCandidateSummary === null) {
    return normalizedBaselineSummary;
  }
  const advancement = comparePriorityPartitionSummaryAdvancement(
    normalizedCandidateSummary,
    normalizedBaselineSummary,
    helperFns,
  );
  if (advancement > 0) {
    return normalizedCandidateSummary;
  }
  if (advancement < 0 || priorityPartitionDiagnosticsEqual(
    normalizedCandidateSummary,
    normalizedBaselineSummary,
  )) {
    return normalizedBaselineSummary;
  }
  return normalizedCandidateSummary;
}

function arePriorityPartitionSummariesEqual(leftSummary, rightSummary, helperFns = {}) {
  const left = normalizePriorityPartitionSummary(leftSummary, {}, helperFns);
  const right = normalizePriorityPartitionSummary(rightSummary, {}, helperFns);
  if (left === null || right === null) {
    return left === right;
  }
  return normalizedPriorityPartitionSummariesEqual(left, right);
}

function normalizeCensusServiceRow(row) {
  return {
    serviceId: readOwnPrimitiveString(row, SERVICE_ID_FIELDS),
    serviceType: readOwnLowerPrimitiveString(row, SERVICE_TYPE_FIELDS),
    nodeId: readOwnPrimitiveString(row, SERVICE_NODE_ID_FIELDS),
    partitionId: readOwnPrimitiveString(row, SERVICE_PARTITION_ID_FIELDS),
    raftRole: readOwnLowerPrimitiveString(row, SERVICE_RAFT_ROLE_FIELDS),
    status: readOwnLowerPrimitiveString(row, SERVICE_STATUS_FIELDS),
    address: readOwnPrimitiveString(row, SERVICE_ADDRESS_FIELDS),
  };
}

function addPriorityPartitionId(byTableId, tableId, partitionId) {
  if (!setHas(PRIORITY_CONTROL_PLANE_TABLE_IDS, tableId) ||
      typeof partitionId !== 'string' || partitionId.length === 0) {
    return;
  }
  if (!mapHas(byTableId, tableId)) {
    mapSet(byTableId, tableId, buildStringSet([]));
  }
  setAdd(mapGet(byTableId, tableId), partitionId);
}

function resolveCensusPriorityPartitionIds(
  partitionRows,
  serviceRows,
  partitionRowByPartitionId,
) {
  const byTableId = new MapConstructor();
  for (let index = 0; index < partitionRows.length; index += 1) {
    const partitionRow = partitionRows[index];
    const partitionId = readOwnPrimitiveString(
      partitionRow,
      ['partition_id', 'partitionId'],
    );
    const tableId = resolvePartitionTableId({partitionId, partitionRow});
    addPriorityPartitionId(byTableId, tableId, partitionId);
  }
  for (let index = 0; index < serviceRows.length; index += 1) {
    const partitionId = normalizeCensusServiceRow(serviceRows[index]).partitionId;
    const partitionRow = mapGet(partitionRowByPartitionId, partitionId) || null;
    const tableId = resolvePartitionTableId({partitionId, partitionRow});
    addPriorityPartitionId(byTableId, tableId, partitionId);
  }
  const priorityTableIterator = setValues(PRIORITY_CONTROL_PLANE_TABLE_IDS);
  for (let next = setIteratorNext(priorityTableIterator); !next.done;
    next = setIteratorNext(priorityTableIterator)) {
    const tableId = next.value;
    if (!mapHas(byTableId, tableId)) {
      addPriorityPartitionId(byTableId, tableId, INITIAL_PARTITION_IDS[tableId]);
    }
  }
  const result = [];
  const partitionSetIterator = mapValues(byTableId);
  for (let nextSet = mapIteratorNext(partitionSetIterator); !nextSet.done;
    nextSet = mapIteratorNext(partitionSetIterator)) {
    const partitionIdIterator = setValues(nextSet.value);
    for (let nextId = setIteratorNext(partitionIdIterator); !nextId.done;
      nextId = setIteratorNext(partitionIdIterator)) {
      appendOwnArrayValue(result, nextId.value);
    }
  }
  arraySort(result, (left, right) => left < right ? -1 : left > right ? 1 : 0);
  return result;
}

/**
 * CL-021 witness: name WHY a priority service row is excluded from the
 * spread-ready count. The mode=load wedge presented as
 * readyDistinctNodeCount=1 while REPLACE-created replicas were ACTIVE and
 * in raft — without per-row exclusion attribution the blindness cause
 * (e.g. raft_role never written / wiped by full-row lifecycle REPLACE)
 * is invisible in run artifacts.
 * @return {string|null} Exclusion reason code, or null when ready.
 */
function resolvePrioritySpreadReplicaExclusionReason(
  normalizedService,
  readinessByNodeId = {},
) {
  if (!normalizedService || typeof normalizedService !== 'object') {
    return 'invalid_row';
  }
  if (normalizedService.serviceType !== SERVICE_TYPE.PARTITION) {
    return 'not_partition_service';
  }
  if (normalizedService.status !== SERVICE_STATUS.ACTIVE) {
    return `status_${normalizedService.status || 'missing'}`;
  }
  if (!normalizedService.raftRole) {
    return 'raft_role_missing';
  }
  if (!normalizedService.address) {
    return 'address_missing';
  }
  if (!normalizedService.nodeId) {
    return 'node_id_missing';
  }
  if (
    isCatchupLearnerRaftRole(normalizedService.raftRole) &&
    !isReadinessPromotable(
      readOwnDataProperty(
        readinessByNodeId,
        [normalizedService.nodeId],
      ).value,
    )
  ) {
    return 'learner_not_promotable';
  }
  return null;
}

function buildDerivedPriorityPartitionSummary(options = {}, helperFns = {}) {
  const optionsSnapshot = copyStrictOwnDataRecord(options);
  if (optionsSnapshot === null) {
    return null;
  }
  const serviceRowsEntry = inspectOwnDataProperty(
    optionsSnapshot,
    ['serviceRows'],
  );
  const serviceRows = serviceRowsEntry.state === DATA_PROPERTY_STATE.VALID ?
    copyDenseOwnDataRecordArray(serviceRowsEntry.value) : null;
  if (serviceRows === null) {
    return null;
  }
  const partitionRowsEntry = inspectOwnDataProperty(
    optionsSnapshot,
    ['partitionRows'],
  );
  if (partitionRowsEntry.state === DATA_PROPERTY_STATE.INVALID) {
    return null;
  }
  const partitionRows = partitionRowsEntry.state === DATA_PROPERTY_STATE.VALID ?
    copyDenseOwnDataRecordArray(partitionRowsEntry.value) : [];
  if (partitionRows === null) {
    return null;
  }
  const priorityNodeSnapshot = buildPrioritySpreadEligibleNodeSnapshot(
    optionsSnapshot,
  );
  if (priorityNodeSnapshot === null) {
    return null;
  }
  const {eligibleNodeIds, readinessByNodeId} = priorityNodeSnapshot;
  const partitionRowByPartitionId = buildPartitionRowByPartitionId(partitionRows);
  const readyReplicaStatsByPartitionId = new MapConstructor();
  let observedPriorityServiceRow = false;
  for (let serviceRowIndex = 0;
    serviceRowIndex < serviceRows.length;
    serviceRowIndex += 1) {
    const serviceRow = serviceRows[serviceRowIndex];
    const normalizedService = normalizeCensusServiceRow(serviceRow);
    const partitionId = normalizedService.partitionId;
    const partitionRow = mapGet(partitionRowByPartitionId, partitionId) || null;
    const tableId = resolvePartitionTableId({partitionId, partitionRow});
    if (!setHas(PRIORITY_CONTROL_PLANE_TABLE_IDS, tableId)) {
      continue;
    }
    observedPriorityServiceRow = true;
    if (!mapHas(readyReplicaStatsByPartitionId, partitionId)) {
      mapSet(readyReplicaStatsByPartitionId, partitionId, {
        observedReplicaRowCount: 0,
        readyReplicaCount: 0,
        nodeIds: buildStringSet([]),
        exclusionReasonCounts: objectCreate(null),
      });
    }
    const stats = mapGet(readyReplicaStatsByPartitionId, partitionId);
    if (normalizedService.serviceType === SERVICE_TYPE.PARTITION) {
      stats.observedReplicaRowCount += 1;
    }
    const exclusionReason = resolvePrioritySpreadReplicaExclusionReason(
      normalizedService,
      readinessByNodeId,
    ) || (
      setSize(eligibleNodeIds) > 0 &&
      !setHas(eligibleNodeIds, normalizedService.nodeId) ?
        'node_not_eligible' :
        null
    );
    if (exclusionReason !== null) {
      const currentCountEntry = readOwnDataProperty(
        stats.exclusionReasonCounts,
        [exclusionReason],
      );
      objectDefineProperty(stats.exclusionReasonCounts, exclusionReason, {
        value: (currentCountEntry.found ? currentCountEntry.value : 0) + 1,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      continue;
    }
    stats.readyReplicaCount += 1;
    setAdd(stats.nodeIds, normalizedService.nodeId);
  }
  let observedPriorityPartitionRow = false;
  for (let index = 0; index < partitionRows.length; index += 1) {
    if (setHas(PRIORITY_CONTROL_PLANE_TABLE_IDS, resolvePartitionTableId({
      partitionRow: partitionRows[index],
    }))) {
      observedPriorityPartitionRow = true;
      break;
    }
  }
  if (!observedPriorityServiceRow && !observedPriorityPartitionRow) {
    return null;
  }
  const priorityPartitionIds = resolveCensusPriorityPartitionIds(
    partitionRows,
    serviceRows,
    partitionRowByPartitionId,
  );
  if (setSize(eligibleNodeIds) === 0) {
    const statsIterator = mapValues(readyReplicaStatsByPartitionId);
    for (let nextStats = mapIteratorNext(statsIterator); !nextStats.done;
      nextStats = mapIteratorNext(statsIterator)) {
      const nodeIterator = setValues(nextStats.value.nodeIds);
      for (let nextNode = setIteratorNext(nodeIterator); !nextNode.done;
        nextNode = setIteratorNext(nodeIterator)) {
        setAdd(eligibleNodeIds, nextNode.value);
      }
    }
  }
  const requiredDistinctNodeCount = mathMin(
    PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
    setSize(eligibleNodeIds),
  );
  const blockedPartitions = [];
  for (let index = 0; index < priorityPartitionIds.length; index += 1) {
    const partitionId = priorityPartitionIds[index];
    const stats = mapGet(readyReplicaStatsByPartitionId, partitionId) || {
      observedReplicaRowCount: 0,
      readyReplicaCount: 0,
      nodeIds: buildStringSet([]),
      exclusionReasonCounts: objectCreate(null),
    };
    const readyDistinctNodeCount = setSize(stats.nodeIds);
    const spreadGap = mathMax(0, requiredDistinctNodeCount - readyDistinctNodeCount);
    if (requiredDistinctNodeCount <= 1 || spreadGap <= 0) {
      continue;
    }
    const partitionRow = mapGet(partitionRowByPartitionId, partitionId) || null;
    const expectedReplicaCountEntry = readOwnDataProperty(
      partitionRow,
      ['replica_count', 'replicaCount'],
    );
    const expectedReplicaCount = expectedReplicaCountEntry.found ?
      normalizeExpectedReplicaCount(expectedReplicaCountEntry.value) :
      null;
    const rowAbsentCount = expectedReplicaCount === null ? 0 : mathMax(
      0,
      expectedReplicaCount - stats.observedReplicaRowCount,
    );
    const exclusionReasonCounts = copyExclusionCounts(
      stats.exclusionReasonCounts,
    ) || objectCreate(null);
    if (rowAbsentCount > 0) {
      objectDefineProperty(exclusionReasonCounts, ROW_ABSENT_REASON, {
        value: rowAbsentCount,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    appendOwnArrayValue(blockedPartitions, {
      partitionId,
      requiredDistinctNodeCount,
      readyDistinctNodeCount,
      exclusionReasonCounts,
      readyReplicaCount: stats.readyReplicaCount,
      ...(expectedReplicaCount !== null ? {expectedReplicaCount} : {}),
      spreadGap,
    });
  }
  const missingPartitionIds = [];
  for (let index = 0; index < blockedPartitions.length; index += 1) {
    appendOwnArrayValue(missingPartitionIds, blockedPartitions[index].partitionId);
  }
  return normalizePriorityPartitionSummary(
    {
      satisfied: blockedPartitions.length === 0,
      requiredDistinctNodeCount,
      readyEligibleNodeCount: setSize(eligibleNodeIds),
      totalPriorityPartitionCount: priorityPartitionIds.length,
      missingPartitionIds,
      blockedPartitions,
    },
    {
      requiredDistinctNodeCount,
      readyEligibleNodeCount: setSize(eligibleNodeIds),
    },
    helperFns,
  );
}

export {
  PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
  arePriorityPartitionSummariesEqual,
  buildDerivedPriorityPartitionSummary,
  chooseMoreAdvancedPriorityPartitionSummary,
  isReadinessPromotable,
  normalizePriorityPartitionSummary,
};
