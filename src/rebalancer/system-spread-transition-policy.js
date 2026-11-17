import {NUM} from '../constants/index.js';
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
  isTerminalReplicaOperationRecord,
} from './replica-status.js';
import {normalizeReplicaOperationRecord} from './replica-operation-liveness.js';

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
  const availableHostCount = Array.isArray(availableNodes) ?
    availableNodes.length :
    NUM.ZERO;
  return (
    availableHostCount > NUM.ONE &&
    activeNodeIds.size < Math.min(desired.replicationFactor, availableHostCount)
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

function isNodesPartitionSpreadInCache(systemTableCache, availableNodes) {
  const availableHostCount = Array.isArray(availableNodes) ?
    availableNodes.length :
    NUM.ZERO;
  if (!systemTableCache || availableHostCount <= NUM.ONE) {
    return false;
  }
  const nodesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
  if (!getPartitionRowFromCache(systemTableCache, nodesPartitionId)) {
    return false;
  }
  return (
    getNodesPartitionDistinctActiveHostCount(systemTableCache) >=
    Math.min(NUM.THREE, availableHostCount)
  );
}

function isNodesPartitionPresentAndUnderSpread(
  systemTableCache,
  availableNodes,
) {
  const availableHostCount = Array.isArray(availableNodes) ?
    availableNodes.length :
    NUM.ZERO;
  if (!systemTableCache || availableHostCount <= NUM.ONE) {
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
    Math.min(desired.replicationFactor, availableHostCount) :
    Math.min(NUM.THREE, availableHostCount);
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

function resolvePhaseBSystemTransitionSnapshotOptions({
  systemTableCache,
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
    !isFormationDependencyPartition &&
    isReplicasBelowDeclaredDistinctHostSpread(
      systemTableCache,
      entityId,
      currentReplicas,
      resolveAvailableNodes,
    );
  const baseConditionsMet =
    phaseBEligibleEntity &&
    Boolean(systemTableCache) &&
    isNodesPartitionSpreadInCache(systemTableCache, resolveAvailableNodes());
  const allNonTerminalOperations = baseConditionsMet ?
    systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) =>
        !isTerminalReplicaOperationRecord(
          normalizeReplicaOperationRecord(operation),
        ),
    ) :
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
      isNonTerminalSystemAddOrReplaceOperation :
      isAddActiveOperation,
    isSystemPartition: (options) =>
      classifySystemPartition(options).systemTable,
  });
}

export {
  buildPhaseBGlobalSystemTransitionNodeSet,
  countDistinctActiveHostsFromReplicas,
  countNonTerminalSystemOpsByTargetNode,
  isNodesPartitionPresentAndUnderSpread,
  isReplicasBelowDeclaredDistinctHostSpread,
};
