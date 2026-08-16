import {SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  resolvePriorityControlPlanePartitionIds,
} from '../bootstrap/system-partition-classification.js';
import {
  buildDerivedPriorityPartitionSummary,
} from './membership-publication-priority-partition-summary.js';
import {
  appendOwnArrayValue,
  copyCanonicalDenseOwnDataRecordArray,
  copyDenseOwnDataArray,
  copyStrictOwnDataRecord,
  createNullRecord,
  MapConstructor,
  mapGet,
  mapSet,
  normalizePrimitiveStringList,
  readOwnLowerPrimitiveString,
  readOwnPrimitiveString,
  SetConstructor,
  setAdd,
  setHas,
  setSize,
  sortArray,
} from './membership-publication-priority-partition-canonical-data.js';
import {
  normalizeNodeIdList,
  normalizePositiveInteger,
} from './membership-publication-row-helpers.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';

const CURRENT_PRIORITY_PLACEMENT_OBSERVATION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const CURRENT_PRIORITY_PLACEMENT_OBSERVATION_SOURCE =
  'control_snapshot_captured_rows';
const PRIORITY_PARTITION_SUMMARY_HELPERS = Object.freeze({
  normalizeNodeIdList,
  normalizePositiveInteger,
});
const ACTIVE_NODE_VIEW_LIST_FIELDS = Object.freeze([
  'locallyEligibleNodeIds',
  'effectiveActiveNodeIds',
  'projectedServingNodeIds',
  'publishedActiveNodeIds',
]);
const objectHasOwn = Object.hasOwn;
const numberIsFinite = Number.isFinite;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;

function invalidCanonicalValue() {
  return {valid: false, value: null};
}

function validCanonicalValue(value) {
  return {valid: true, value};
}

function copyOptionalRecordArray(options, fieldName) {
  if (!objectHasOwn(options, fieldName) || options[fieldName] == null) {
    return validCanonicalValue([]);
  }
  const rows = copyCanonicalDenseOwnDataRecordArray(options[fieldName]);
  return rows === null ?
    invalidCanonicalValue() :
    validCanonicalValue(rows);
}

function copyOptionalRecord(options, fieldName) {
  if (!objectHasOwn(options, fieldName) || options[fieldName] == null) {
    return validCanonicalValue(createNullRecord(null));
  }
  const record = copyStrictOwnDataRecord(options[fieldName]);
  return record === null ?
    invalidCanonicalValue() :
    validCanonicalValue(record);
}

function copyOptionalNodeIdList(activeNodeViews, fieldName) {
  if (!objectHasOwn(activeNodeViews, fieldName) ||
      activeNodeViews[fieldName] == null) {
    return validCanonicalValue(null);
  }
  const values = copyDenseOwnDataArray(activeNodeViews[fieldName]);
  const nodeIds = values === null ?
    null :
    normalizePrimitiveStringList(values);
  return nodeIds === null ?
    invalidCanonicalValue() :
    validCanonicalValue(nodeIds);
}

function copyActiveNodeViews(value) {
  if (value == null) {
    return validCanonicalValue(createNullRecord(null));
  }
  const record = copyStrictOwnDataRecord(value);
  if (record === null) {
    return invalidCanonicalValue();
  }
  const views = createNullRecord(null);
  for (let index = 0; index < ACTIVE_NODE_VIEW_LIST_FIELDS.length; index += 1) {
    const fieldName = ACTIVE_NODE_VIEW_LIST_FIELDS[index];
    const result = copyOptionalNodeIdList(record, fieldName);
    if (!result.valid) {
      return invalidCanonicalValue();
    }
    views[fieldName] = result.value;
  }
  return validCanonicalValue(views);
}

function resolveCurrentPlacementEligibleNodeIds(activeNodeViews = {}) {
  return (
    activeNodeViews.locallyEligibleNodeIds?.length > 0 ?
      activeNodeViews.locallyEligibleNodeIds :
      activeNodeViews.effectiveActiveNodeIds?.length > 0 ?
        activeNodeViews.effectiveActiveNodeIds :
        activeNodeViews.projectedServingNodeIds || []
  );
}

function buildStringSet(values) {
  const valueSet = new SetConstructor();
  for (let index = 0; index < values.length; index += 1) {
    setAdd(valueSet, values[index]);
  }
  return valueSet;
}

function buildCurrentPriorityCensusOptions({
  partitionRows,
  serviceRows,
  readinessByNodeId,
  eligibleNodeIds,
  activeNodeViews,
}) {
  const censusOptions = {
    partitionRows,
    serviceRows,
    readinessByNodeId,
    locallyEligibleNodeIds: eligibleNodeIds,
  };
  if (activeNodeViews.projectedServingNodeIds !== null &&
      activeNodeViews.projectedServingNodeIds !== undefined) {
    censusOptions.projectedServingNodeIds =
      activeNodeViews.projectedServingNodeIds;
  }
  if (activeNodeViews.publishedActiveNodeIds !== null &&
      activeNodeViews.publishedActiveNodeIds !== undefined) {
    censusOptions.publishedActiveNodeIds =
      activeNodeViews.publishedActiveNodeIds;
  }
  return censusOptions;
}

function normalizeCurrentVoterServiceRow({
  eligibleNodeIdSet,
  priorityPartitionIdSet,
  serviceRow,
}) {
  const serviceType = readOwnLowerPrimitiveString(
    serviceRow,
    ['service_type', 'serviceType'],
  );
  const status = readOwnLowerPrimitiveString(serviceRow, ['status']);
  const raftRole = readOwnLowerPrimitiveString(
    serviceRow,
    ['raft_role', 'raftRole'],
  );
  const nodeId = readOwnPrimitiveString(serviceRow, ['node_id', 'nodeId']);
  const address = readOwnPrimitiveString(serviceRow, ['address']);
  const partitionId = readOwnPrimitiveString(
    serviceRow,
    ['partition_id', 'partitionId'],
  );
  if (serviceType !== SERVICE_TYPE.PARTITION ||
      status !== SERVICE_STATUS.ACTIVE ||
      !isVoterRaftRole(raftRole) ||
      nodeId.length === 0 ||
      address.length === 0 ||
      !setHas(priorityPartitionIdSet, partitionId) ||
      (setSize(eligibleNodeIdSet) > 0 &&
        !setHas(eligibleNodeIdSet, nodeId))) {
    return null;
  }
  return {nodeId, partitionId, raftRole};
}

function buildCurrentPriorityTopology({
  currentVoterServices,
  partitionId,
  partitionRow,
}) {
  const leaderNodeId = readOwnPrimitiveString(
    partitionRow,
    ['leader_node_id', 'leaderNodeId'],
  );
  const leaderRoleNodeIds = [];
  const leaderRoleNodeIdSet = new SetConstructor();
  let canonicalLeaderReplica = false;
  for (let index = 0; index < currentVoterServices.length; index += 1) {
    const service = currentVoterServices[index];
    if (service.partitionId !== partitionId) {
      continue;
    }
    canonicalLeaderReplica = canonicalLeaderReplica ||
      (leaderNodeId.length > 0 && service.nodeId === leaderNodeId);
    if (service.raftRole === RAFT_ROLE.LEADER &&
        !setHas(leaderRoleNodeIdSet, service.nodeId)) {
      setAdd(leaderRoleNodeIdSet, service.nodeId);
      appendOwnArrayValue(leaderRoleNodeIds, service.nodeId);
    }
  }
  sortArray(leaderRoleNodeIds);
  return {
    leaderKnown: canonicalLeaderReplica || leaderRoleNodeIds.length > 0,
    leaderNodeId: leaderNodeId || null,
    leaderRoleNodeIds,
  };
}

function buildCurrentPriorityLeaderCoverage({
  priorityPartitionIds,
  partitionRows,
  serviceRows,
  eligibleNodeIds,
}) {
  const eligibleNodeIdSet = buildStringSet(eligibleNodeIds);
  const priorityPartitionIdSet = buildStringSet(priorityPartitionIds);
  const partitionRowById = new MapConstructor();
  for (let index = 0; index < partitionRows.length; index += 1) {
    const partitionRow = partitionRows[index];
    const partitionId = readOwnPrimitiveString(
      partitionRow,
      ['partition_id', 'partitionId'],
    );
    if (partitionId.length > 0) {
      mapSet(partitionRowById, partitionId, partitionRow);
    }
  }
  const currentVoterServices = [];
  for (let index = 0; index < serviceRows.length; index += 1) {
    const service = normalizeCurrentVoterServiceRow({
      eligibleNodeIdSet,
      priorityPartitionIdSet,
      serviceRow: serviceRows[index],
    });
    if (service !== null) {
      appendOwnArrayValue(currentVoterServices, service);
    }
  }
  const topologyByPartition = new MapConstructor();
  for (let index = 0; index < priorityPartitionIds.length; index += 1) {
    const partitionId = priorityPartitionIds[index];
    mapSet(
      topologyByPartition,
      partitionId,
      buildCurrentPriorityTopology({
        currentVoterServices,
        partitionId,
        partitionRow: mapGet(partitionRowById, partitionId) || null,
      }),
    );
  }
  // Cut 2 (control-plane-truth-local-converged-read): read the partition's
  // proven-local leadership (leaderKnown = canonical leader_node_id OR an
  // elected Raft leader role visible in the group's service rows), not the
  // leader-funneled canonicalLeaderReplica alone. A physically-healthy group
  // whose funneled partitions.leader_node_id row is stale/congested must not
  // be reported as missing an active leader: raft elected one, and that truth
  // is present locally. Genuinely-leaderless partitions (no elected role, no
  // funneled leader) still report missingActiveLeader - leaderKnown stays
  // false there, so the fail-closed safety case is preserved.
  const missingLeaderPartitionIds = [];
  for (let index = 0; index < priorityPartitionIds.length; index += 1) {
    const partitionId = priorityPartitionIds[index];
    if (mapGet(topologyByPartition, partitionId).leaderKnown !== true) {
      appendOwnArrayValue(missingLeaderPartitionIds, partitionId);
    }
  }
  const missingLeaderPartitionIdSet = buildStringSet(
    missingLeaderPartitionIds,
  );
  const resolveReportedLeaderNodeId = (partitionId) => {
    const topology = mapGet(topologyByPartition, partitionId);
    return topology.leaderNodeId || topology.leaderRoleNodeIds[0] || null;
  };
  const leaderNodeIdsByPartition = {};
  for (let index = 0; index < priorityPartitionIds.length; index += 1) {
    const partitionId = priorityPartitionIds[index];
    const leaderNodeIds = [];
    const leaderNodeId = resolveReportedLeaderNodeId(partitionId);
    if (!setHas(missingLeaderPartitionIdSet, partitionId) && leaderNodeId) {
      appendOwnArrayValue(leaderNodeIds, leaderNodeId);
    }
    objectDefineProperty(leaderNodeIdsByPartition, partitionId, {
      value: objectFreeze(leaderNodeIds),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return objectFreeze({
    satisfied: missingLeaderPartitionIds.length === 0,
    requiredPartitionCount: priorityPartitionIds.length,
    observedLeaderPartitionCount:
      priorityPartitionIds.length - missingLeaderPartitionIds.length,
    missingLeaderPartitionCount: missingLeaderPartitionIds.length,
    missingLeaderPartitionIds: objectFreeze(missingLeaderPartitionIds),
    leaderNodeIdsByPartition: objectFreeze(leaderNodeIdsByPartition),
  });
}

function attachCurrentPrioritySpreadTotals(priorityPartitionSummary) {
  if (!priorityPartitionSummary) {
    return null;
  }
  let largestSpreadGap = 0;
  let totalSpreadGap = 0;
  for (let index = 0;
    index < priorityPartitionSummary.blockedPartitions.length;
    index += 1) {
    const spreadGap = normalizePositiveInteger(
      priorityPartitionSummary.blockedPartitions[index].spreadGap,
      0,
    );
    largestSpreadGap = spreadGap > largestSpreadGap ?
      spreadGap :
      largestSpreadGap;
    totalSpreadGap += spreadGap;
  }
  return objectFreeze({
    ...priorityPartitionSummary,
    blockedPartitionCount:
      priorityPartitionSummary.blockedPartitions.length,
    largestSpreadGap,
    totalSpreadGap,
  });
}

function hasDuplicatePartitionIds(partitionRows) {
  const partitionIds = new SetConstructor();
  for (let index = 0; index < partitionRows.length; index += 1) {
    const partitionId = readOwnPrimitiveString(
      partitionRows[index],
      ['partition_id', 'partitionId'],
    );
    if (partitionId.length === 0) {
      continue;
    }
    if (setHas(partitionIds, partitionId)) {
      return true;
    }
    setAdd(partitionIds, partitionId);
  }
  return false;
}

function buildUnavailablePriorityLeaderCoverage(priorityPartitionIds) {
  const leaderNodeIdsByPartition = {};
  const missingLeaderPartitionIds = [];
  for (let index = 0; index < priorityPartitionIds.length; index += 1) {
    const partitionId = priorityPartitionIds[index];
    appendOwnArrayValue(missingLeaderPartitionIds, partitionId);
    objectDefineProperty(leaderNodeIdsByPartition, partitionId, {
      value: objectFreeze([]),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return objectFreeze({
    satisfied: false,
    requiredPartitionCount: priorityPartitionIds.length,
    observedLeaderPartitionCount: 0,
    missingLeaderPartitionCount: missingLeaderPartitionIds.length,
    missingLeaderPartitionIds: objectFreeze(missingLeaderPartitionIds),
    leaderNodeIdsByPartition: objectFreeze(leaderNodeIdsByPartition),
  });
}

function canonicalizeCurrentPlacementInputs(options) {
  const optionsSnapshot = copyStrictOwnDataRecord(options);
  const safeOptions = optionsSnapshot || createNullRecord(null);
  const partitionRowsResult = copyOptionalRecordArray(
    safeOptions,
    'partitionRows',
  );
  const serviceRowsResult = copyOptionalRecordArray(safeOptions, 'serviceRows');
  const readinessByNodeIdResult = copyOptionalRecord(
    safeOptions,
    'readinessByNodeId',
  );
  const activeNodeViewsResult = copyActiveNodeViews(
    safeOptions.activeNodeViews,
  );
  return {
    valid: optionsSnapshot !== null &&
      partitionRowsResult.valid &&
      serviceRowsResult.valid &&
      readinessByNodeIdResult.valid &&
      activeNodeViewsResult.valid &&
      !hasDuplicatePartitionIds(partitionRowsResult.value || []),
    safeOptions,
    partitionRows: partitionRowsResult.value || [],
    serviceRows: serviceRowsResult.value || [],
    readinessByNodeId: readinessByNodeIdResult.value ||
      createNullRecord(null),
    activeNodeViews: activeNodeViewsResult.value || createNullRecord(null),
  };
}

function buildCurrentPriorityPlacementObservation(options = {}) {
  const inputs = canonicalizeCurrentPlacementInputs(options);
  const {
    activeNodeViews,
    partitionRows,
    readinessByNodeId,
    safeOptions,
    serviceRows,
  } = inputs;
  const eligibleNodeIds = resolveCurrentPlacementEligibleNodeIds(
    activeNodeViews,
  );
  const censusOptions = buildCurrentPriorityCensusOptions({
    partitionRows,
    serviceRows,
    readinessByNodeId,
    eligibleNodeIds,
    activeNodeViews,
  });
  const priorityPartitionSummary = inputs.valid ?
    attachCurrentPrioritySpreadTotals(
      buildDerivedPriorityPartitionSummary(
        censusOptions,
        PRIORITY_PARTITION_SUMMARY_HELPERS,
      ),
    ) :
    null;
  const priorityPartitionIds = resolvePriorityControlPlanePartitionIds({
    partitionRows,
    serviceRows,
    includeInitialWhenMissing: true,
  });
  const leaderCoverage = inputs.valid ?
    buildCurrentPriorityLeaderCoverage({
      priorityPartitionIds,
      partitionRows,
      serviceRows,
      eligibleNodeIds,
    }) :
    buildUnavailablePriorityLeaderCoverage(priorityPartitionIds);
  const available = priorityPartitionSummary !== null;
  return objectFreeze({
    state: available ?
      CURRENT_PRIORITY_PLACEMENT_OBSERVATION_STATE.AVAILABLE :
      CURRENT_PRIORITY_PLACEMENT_OBSERVATION_STATE.UNAVAILABLE,
    source: CURRENT_PRIORITY_PLACEMENT_OBSERVATION_SOURCE,
    capturedAt: numberIsFinite(safeOptions.capturedAt) ?
      safeOptions.capturedAt :
      null,
    eligibleNodeIds: objectFreeze(eligibleNodeIds),
    priorityPartitionIds: objectFreeze(priorityPartitionIds),
    priorityPartitionSummary,
    leaderCoverage,
    satisfied:
      available &&
      priorityPartitionSummary.satisfied === true &&
      leaderCoverage.satisfied === true,
  });
}

export {
  buildCurrentPriorityPlacementObservation,
};
