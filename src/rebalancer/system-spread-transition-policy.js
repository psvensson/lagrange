import {NUM} from '../constants/index.js';
import {readLowerStateField} from '../utils/state-field-read.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
  getPartitionRowFromCache,
} from '../bootstrap/system-partition-classification.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {normalizeServiceRow} from '../control-plane/system-row-normalizers.js';
import {
  OperationType,
  ReplicaStatus,
  isCoordinatorOwnedOperationType,
  isTerminalReplicaOperationRecord,
} from './replica-status.js';
import {normalizeReplicaOperationRecord} from './replica-operation-liveness.js';
import {
  doesWorkflowStepOccupySystemTargetNodeSlot,
} from './replica-operation-step-policy.js';

const ACTIVE_NODE_STATUS = 'active';
const TARGET_SLOT_LIMIT_REASON_CODE = 'system_target_node_slot_limit_reached';

function collectActiveNodeIdsFromRows(rows, targetSet) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const nodeId = row?.node_id || null;
    if (!nodeId) {
      continue;
    }
    const status = readLowerStateField(row?.status);
    if (status === ACTIVE_NODE_STATUS) {
      targetSet.add(nodeId);
    }
  }
}

function resolveCommittedActiveClusterHostCount(
  systemTableCache,
  availableNodes,
  controlPlaneReadinessService = null,
) {
  const availableHostCount = Array.isArray(availableNodes) ?
    availableNodes.length :
    NUM.ZERO;
  const activeNodeIds = new Set();
  const committedAnswer = controlPlaneReadinessService?.answerCommittedNodes?.();
  if (Array.isArray(committedAnswer?.nodeRows)) {
    collectActiveNodeIdsFromRows(committedAnswer.nodeRows, activeNodeIds);
  }
  if (systemTableCache?.filter) {
    const cachedNodeRows = systemTableCache.filter(
      SYSTEM_TABLE_NAME.NODES,
      (row) => Boolean(row?.node_id),
    );
    collectActiveNodeIdsFromRows(cachedNodeRows, activeNodeIds);
  }
  return Math.max(availableHostCount, activeNodeIds.size);
}

function countDistinctActiveHostsFromReplicas(replicas) {
  if (!Array.isArray(replicas)) {
    return NUM.ZERO;
  }
  const activeNodeIds = new Set();
  for (const replica of replicas) {
    const normalized = normalizeServiceRow(replica);
    if (normalized.status !== ReplicaStatus.ACTIVE || !normalized.nodeId) {
      continue;
    }
    activeNodeIds.add(normalized.nodeId);
  }
  return activeNodeIds.size;
}

function isReplicasBelowDeclaredDistinctHostSpread(
  systemTableCache,
  partitionId,
  replicas,
  resolveAvailableNodes,
  controlPlaneReadinessService = null,
) {
  const desired = resolveDesiredReplicationFactor(
    getPartitionRowFromCache(systemTableCache, partitionId),
  );
  if (
    desired.source === REPLICATION_TARGET_SOURCE.UNDECLARED ||
    desired.replicationFactor <= NUM.ZERO
  ) {
    return false;
  }
  const activeNodeIds = new Set();
  let activeReplicaCount = NUM.ZERO;
  for (const replica of Array.isArray(replicas) ? replicas : []) {
    const normalized = normalizeServiceRow(replica);
    if (normalized.status !== ReplicaStatus.ACTIVE) {
      continue;
    }
    activeReplicaCount += NUM.ONE;
    if (normalized.nodeId) {
      activeNodeIds.add(normalized.nodeId);
    }
  }
  if (activeReplicaCount === NUM.ZERO) {
    return false;
  }
  if (activeReplicaCount < desired.replicationFactor) {
    return true;
  }
  const availableNodes = resolveAvailableNodes();
  const clusterHostCount = resolveCommittedActiveClusterHostCount(
    systemTableCache,
    availableNodes,
    controlPlaneReadinessService,
  );
  return (
    clusterHostCount > NUM.ONE &&
    activeNodeIds.size < Math.min(desired.replicationFactor, clusterHostCount)
  );
}

function getNodesPartitionDistinctActiveHostCount(systemTableCache) {
  const nodesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
  const serviceRows = systemTableCache.filter(
    SYSTEM_TABLE_NAME.SERVICES,
    (row) => normalizeServiceRow(row).partitionId === nodesPartitionId,
  );
  return countDistinctActiveHostsFromReplicas(serviceRows);
}

function isNodesPartitionSpreadInCache(
  systemTableCache,
  availableNodes,
  controlPlaneReadinessService = null,
) {
  const clusterHostCount = resolveCommittedActiveClusterHostCount(
    systemTableCache,
    availableNodes,
    controlPlaneReadinessService,
  );
  if (!systemTableCache || clusterHostCount <= NUM.ONE) {
    return false;
  }
  const nodesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
  if (!getPartitionRowFromCache(systemTableCache, nodesPartitionId)) {
    return false;
  }
  return (
    getNodesPartitionDistinctActiveHostCount(systemTableCache) >=
    Math.min(NUM.THREE, clusterHostCount)
  );
}

function isNodesPartitionPresentAndUnderSpread(
  systemTableCache,
  availableNodes,
  controlPlaneReadinessService = null,
) {
  const clusterHostCount = resolveCommittedActiveClusterHostCount(
    systemTableCache,
    availableNodes,
    controlPlaneReadinessService,
  );
  if (!systemTableCache || clusterHostCount <= NUM.ONE) {
    return false;
  }
  const nodesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
  const partitionRow = getPartitionRowFromCache(
    systemTableCache,
    nodesPartitionId,
  );
  if (!partitionRow) {
    return false;
  }
  const desired = resolveDesiredReplicationFactor(partitionRow);
  const requiredHosts = desired.replicationFactor > NUM.ZERO ?
    Math.min(desired.replicationFactor, clusterHostCount) :
    Math.min(NUM.THREE, clusterHostCount);
  return (
    getNodesPartitionDistinctActiveHostCount(systemTableCache) < requiredHosts
  );
}

function isNonTerminalSystemAddOrReplaceOperation(operation) {
  const normalized = normalizeReplicaOperationRecord(operation);
  if (isTerminalReplicaOperationRecord(normalized)) {
    return false;
  }
  const operationType = String(normalized.type || '').toUpperCase();
  return (
    operationType === OperationType.ADD ||
    operationType === OperationType.REPLACE ||
    operationType.length === NUM.ZERO
  );
}

function isPriorityControlPlaneOperation(systemTableCache, operation) {
  const partitionId = normalizeReplicaOperationRecord(operation).partitionId || null;
  if (!partitionId) {
    return false;
  }
  return (
    classifySystemPartition({
      partitionId,
      partitionRow: getPartitionRowFromCache(systemTableCache, partitionId),
    }).priorityControlPlane === true
  );
}

function doesOperationOccupySystemTargetNodeSlot(
  operation,
  {includeDrainPhase = false} = {},
) {
  if (!isNonTerminalSystemAddOrReplaceOperation(operation)) {
    return false;
  }
  const normalized = normalizeReplicaOperationRecord(operation);
  return doesWorkflowStepOccupySystemTargetNodeSlot(
    normalized.workflowStep,
    includeDrainPhase,
  );
}

function doesOperationTransitionReleaseSystemTargetNodeSlot(operation) {
  const normalized = normalizeReplicaOperationRecord(operation);
  if (!isCoordinatorOwnedOperationType(normalized.type)) {
    return false;
  }
  return isTerminalReplicaOperationRecord(normalized);
}

function resolvePhaseBSystemTransitionSnapshotOptions({
  systemTableCache,
  controlPlaneReadinessService = null,
  entityId,
  isSystemPartition,
  isPriorityPartition,
  isFormationDependencyPartition,
  currentReplicas,
  resolveAvailableNodes,
  globalInFlightOperations,
}) {
  const phaseBEligibleEntity =
    isSystemPartition &&
    !isPriorityPartition &&
    isReplicasBelowDeclaredDistinctHostSpread(
      systemTableCache,
      entityId,
      currentReplicas,
      resolveAvailableNodes,
      controlPlaneReadinessService,
    );
  // Phase B reads nothing for an entity it cannot apply to: the nodes-spread
  // condition is evaluated only for an eligible entity.
  const baseConditionsMet =
    phaseBEligibleEntity &&
    Boolean(systemTableCache) &&
    (
      isFormationDependencyPartition === true ||
      isNodesPartitionSpreadInCache(
        systemTableCache,
        resolveAvailableNodes(),
        controlPlaneReadinessService,
      )
    );
  const cachedNonTerminalOperations = baseConditionsMet && systemTableCache?.filter ?
    systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) =>
        !isTerminalReplicaOperationRecord(
          normalizeReplicaOperationRecord(operation),
        ),
    ) :
    [];
  const mergedNonTerminalOperations = [];
  const seenOperationIds = new Set();
  for (const operation of [
    ...cachedNonTerminalOperations,
    ...(Array.isArray(globalInFlightOperations) ? globalInFlightOperations : []),
  ]) {
    const normalized = normalizeReplicaOperationRecord(operation);
    if (isTerminalReplicaOperationRecord(normalized)) {
      continue;
    }
    const operationId = normalized.operationId || null;
    if (operationId && seenOperationIds.has(operationId)) {
      continue;
    }
    if (operationId) {
      seenOperationIds.add(operationId);
    }
    mergedNonTerminalOperations.push(operation);
  }
  const allNonTerminalOperations = baseConditionsMet ?
    mergedNonTerminalOperations :
    globalInFlightOperations;
  const priorityOperationActive =
    baseConditionsMet &&
    (globalInFlightOperations.some((operation) =>
      isPriorityControlPlaneOperation(systemTableCache, operation),
    ) ||
      allNonTerminalOperations.some((operation) =>
        isPriorityControlPlaneOperation(systemTableCache, operation),
      ));
  const usePhaseBCapacity = baseConditionsMet && !priorityOperationActive;
  return {
    usePhaseBCapacity,
    maxPerTargetNode: usePhaseBCapacity ? NUM.TWO : NUM.ONE,
    includeDrainPhase: usePhaseBCapacity,
    operations: usePhaseBCapacity ?
      allNonTerminalOperations :
      globalInFlightOperations,
  };
}

function buildGlobalSystemTransitionNodeSet(options) {
  const targetNodeIds = new Set();
  if (!options.systemPartition) {
    return targetNodeIds;
  }
  const maxPerTargetNode =
    Number.isInteger(options.maxPerTargetNode) &&
    options.maxPerTargetNode > NUM.ZERO ?
      options.maxPerTargetNode :
      NUM.ONE;
  const countsByNodeId = new Map();
  for (const operation of options.operations) {
    if (!options.isAddOperation(operation)) {
      continue;
    }
    const normalized = normalizeReplicaOperationRecord(operation);
    const partitionId = normalized.partitionId || null;
    if (!options.isSystemPartition({partitionId})) {
      continue;
    }
    const targetNodeId = normalized.targetNodeId || null;
    const nextCount = (countsByNodeId.get(targetNodeId) || NUM.ZERO) + NUM.ONE;
    countsByNodeId.set(targetNodeId, nextCount);
    if (nextCount >= maxPerTargetNode) {
      targetNodeIds.add(targetNodeId);
    }
  }
  return targetNodeIds;
}

function countNonTerminalSystemOpsByTargetNode(systemTableCache) {
  const counts = new Map();
  if (!systemTableCache) {
    return counts;
  }
  const operations = systemTableCache.filter(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    (operation) => isNonTerminalSystemAddOrReplaceOperation(operation),
  );
  for (const operation of operations) {
    const normalized = normalizeReplicaOperationRecord(operation);
    const partitionId = normalized.partitionId || null;
    if (!partitionId) {
      continue;
    }
    if (
      !classifySystemPartition({
        partitionId,
        partitionRow: getPartitionRowFromCache(systemTableCache, partitionId),
      }).systemTable
    ) {
      continue;
    }
    if (normalized.targetNodeId) {
      counts.set(
        normalized.targetNodeId,
        (counts.get(normalized.targetNodeId) || NUM.ZERO) + NUM.ONE,
      );
    }
  }
  return counts;
}

function buildPhaseBGlobalSystemTransitionNodeSet({
  systemTableCache,
  controlPlaneReadinessService = null,
  entityId,
  isSystemPartition,
  isPriorityPartition,
  isFormationDependencyPartition,
  currentReplicas,
  resolveAvailableNodes,
  globalInFlightOperations,
  isAddActiveOperation,
}) {
  const phaseBOptions = resolvePhaseBSystemTransitionSnapshotOptions({
    systemTableCache,
    controlPlaneReadinessService,
    entityId,
    isSystemPartition,
    isPriorityPartition,
    isFormationDependencyPartition,
    currentReplicas,
    resolveAvailableNodes,
    globalInFlightOperations,
  });
  return buildGlobalSystemTransitionNodeSet({
    systemPartition: isSystemPartition,
    maxPerTargetNode: phaseBOptions.maxPerTargetNode,
    operations: phaseBOptions.operations,
    isAddOperation: phaseBOptions.includeDrainPhase ?
      (operation) =>
        doesOperationOccupySystemTargetNodeSlot(operation, {
          includeDrainPhase: true,
        }) :
      isAddActiveOperation ||
        ((operation) =>
          doesOperationOccupySystemTargetNodeSlot(operation, {
            includeDrainPhase: false,
          })),
    isSystemPartition: (options) =>
      classifySystemPartition({
        partitionId: options.partitionId,
        partitionRow: getPartitionRowFromCache(
          systemTableCache,
          options.partitionId,
        ),
      }).systemTable,
  });
}

function evaluateSystemPartitionTargetNodeSlotAdmission({
  systemTableCache,
  controlPlaneReadinessService = null,
  partitionId,
  targetNodeId,
  operations = [],
  currentReplicas = null,
  resolveAvailableNodes = null,
}) {
  const normalizedPartitionId = String(partitionId || '').trim();
  const normalizedTargetNodeId = String(targetNodeId || '').trim();
  if (!normalizedPartitionId || !normalizedTargetNodeId) {
    return Object.freeze({
      allowed: true,
      maxPerTargetNode: NUM.ONE,
      occupiedCount: NUM.ZERO,
      includeDrainPhase: false,
      usePhaseBCapacity: false,
      occupyingOperationIds: Object.freeze([]),
      reasonCode: null,
    });
  }
  const partitionRow = getPartitionRowFromCache(
    systemTableCache,
    normalizedPartitionId,
  );
  const classification = classifySystemPartition({
    partitionId: normalizedPartitionId,
    partitionRow,
  });
  if (
    classification.systemTable !== true ||
    classification.priorityControlPlane === true
  ) {
    return Object.freeze({
      allowed: true,
      maxPerTargetNode: NUM.ONE,
      occupiedCount: NUM.ZERO,
      includeDrainPhase: false,
      usePhaseBCapacity: false,
      occupyingOperationIds: Object.freeze([]),
      reasonCode: null,
    });
  }
  const resolvedReplicas = Array.isArray(currentReplicas) ?
    currentReplicas :
    systemTableCache?.filter ?
      systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (row) => normalizeServiceRow(row).partitionId === normalizedPartitionId,
      ) :
      [];
  const resolveAvailableNodesFn = () => {
    const provided = resolveAvailableNodes?.();
    if (Array.isArray(provided)) {
      return provided;
    }
    return systemTableCache?.filter ?
      systemTableCache.filter(
        SYSTEM_TABLE_NAME.NODES,
        (row) => readLowerStateField(row?.status) === ACTIVE_NODE_STATUS,
      ) :
      [];
  };
  const phaseBOptions = resolvePhaseBSystemTransitionSnapshotOptions({
    systemTableCache,
    controlPlaneReadinessService,
    entityId: normalizedPartitionId,
    isSystemPartition: classification.systemTable,
    isPriorityPartition: classification.priorityControlPlane,
    isFormationDependencyPartition: classification.formationLivenessDependency,
    currentReplicas: resolvedReplicas,
    resolveAvailableNodes: resolveAvailableNodesFn,
    globalInFlightOperations: Array.isArray(operations) ? operations : [],
  });
  const occupyingOperationIds = [];
  const seenOperationIds = new Set();
  for (const operation of phaseBOptions.operations) {
    if (
      !doesOperationOccupySystemTargetNodeSlot(operation, {
        includeDrainPhase: phaseBOptions.includeDrainPhase,
      })
    ) {
      continue;
    }
    const normalized = normalizeReplicaOperationRecord(operation);
    const opPartitionId = normalized.partitionId || null;
    if (
      !opPartitionId ||
      !classifySystemPartition({
        partitionId: opPartitionId,
        partitionRow: getPartitionRowFromCache(systemTableCache, opPartitionId),
      }).systemTable
    ) {
      continue;
    }
    if (normalized.targetNodeId !== normalizedTargetNodeId) {
      continue;
    }
    const operationId =
      normalized.operationId || `${opPartitionId}:${normalizedTargetNodeId}`;
    if (seenOperationIds.has(operationId)) {
      continue;
    }
    seenOperationIds.add(operationId);
    occupyingOperationIds.push(operationId);
  }
  const allowed = occupyingOperationIds.length < phaseBOptions.maxPerTargetNode;
  return Object.freeze({
    allowed,
    maxPerTargetNode: phaseBOptions.maxPerTargetNode,
    occupiedCount: occupyingOperationIds.length,
    includeDrainPhase: phaseBOptions.includeDrainPhase,
    usePhaseBCapacity: phaseBOptions.usePhaseBCapacity,
    occupyingOperationIds: Object.freeze(occupyingOperationIds),
    reasonCode: allowed ? null : TARGET_SLOT_LIMIT_REASON_CODE,
  });
}

export {
  buildPhaseBGlobalSystemTransitionNodeSet,
  countDistinctActiveHostsFromReplicas,
  countNonTerminalSystemOpsByTargetNode,
  doesOperationOccupySystemTargetNodeSlot,
  doesOperationTransitionReleaseSystemTargetNodeSlot,
  evaluateSystemPartitionTargetNodeSlotAdmission,
  isNodesPartitionPresentAndUnderSpread,
  isReplicasBelowDeclaredDistinctHostSpread,
};
