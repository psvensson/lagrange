import {readLowerStateField} from '../utils/state-field-read.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  findObservedTargetReplicaServiceRows,
  hasObservedCompletedReplicaOperation,
} from '../rebalancer/replica-operation-observed-completion.js';
import {
  isReplicaOperationTerminalSuccess,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {
  OperationType,
  ReplicaStatus,
} from '../rebalancer/replica-status.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';

const COMPLETED_PLACEMENT_TRANSITIONAL_TARGET_STATUSES = new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
]);

const PRE_CANDIDATE_RAFT_ROLE = 'pre_candidate';

function isCompletedPlacementVoterRole(role) {
  return isVoterRaftRole(role) || role === PRE_CANDIDATE_RAFT_ROLE;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// serviceRows are systemTableCache services rows (SQL-column keyed, the one
// spelling raft_role). An absent status or role is STATE_ABSENT, which is no
// transitional status, not ACTIVE and no voter role.
function normalizeServiceStatus(serviceRow) {
  return readLowerStateField(serviceRow?.status);
}

function normalizeServiceRaftRole(serviceRow) {
  return readLowerStateField(serviceRow?.raft_role);
}

function isVoterReadyActiveTargetServiceRow(serviceRow) {
  return normalizeServiceStatus(serviceRow) === ReplicaStatus.ACTIVE &&
    isCompletedPlacementVoterRole(
      normalizeServiceRaftRole(serviceRow),
    );
}

function isTransitionalPriorityPlacementTargetRow(serviceRow) {
  const status = normalizeServiceStatus(serviceRow);
  if (COMPLETED_PLACEMENT_TRANSITIONAL_TARGET_STATUSES.has(status)) {
    return true;
  }
  return status === ReplicaStatus.ACTIVE &&
    !isCompletedPlacementVoterRole(
      normalizeServiceRaftRole(serviceRow),
    );
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function addNormalizedPartitionIds(
  partitionIds,
  values,
  resolvePartitionId,
) {
  for (const value of arrayOrEmpty(values)) {
    const partitionId = normalizeString(resolvePartitionId(value));
    if (partitionId) {
      partitionIds.add(partitionId);
    }
  }
}

function collectBlockedPriorityPartitionIds(observation = null) {
  const partitionIds = new Set();
  addNormalizedPartitionIds(
    partitionIds,
    observation?.priorityPartitionSummary?.blockedPartitions,
    (blockedPartition) =>
      blockedPartition?.partitionId ?? blockedPartition?.partition_id,
  );
  addNormalizedPartitionIds(
    partitionIds,
    observation?.leaderCoverage?.missingLeaderPartitionIds,
    (partitionId) => partitionId,
  );
  return partitionIds;
}

function buildCompletedPriorityPlacementHandoffObservation(options = {}) {
  const operationRows = arrayOrEmpty(options.replicaOperationRows);
  const serviceRows = arrayOrEmpty(options.serviceRows);
  const blockedPartitionIds = collectBlockedPriorityPartitionIds(
    options.currentPriorityPlacementObservation,
  );
  const operationIds = new Set();
  const partitionIds = new Set();
  const targetReplicaIds = new Set();

  for (const operationRow of operationRows) {
    const operation = normalizeReplicaOperationRecord(operationRow, {
      nowMs: options.nowMs,
    });
    const targetServiceRows = findObservedTargetReplicaServiceRows(
      operation,
      {serviceRows},
    );
    if (
      !isReplicaOperationTerminalSuccess(operation) ||
      (
        operation.type !== OperationType.ADD &&
        operation.type !== OperationType.REPLACE
      ) ||
      !blockedPartitionIds.has(operation.partitionId) ||
      classifySystemPartition({
        partitionId: operation.partitionId,
      }).priorityControlPlane !== true ||
      (
        hasObservedCompletedReplicaOperation(operation, {serviceRows}) &&
        targetServiceRows.some(isVoterReadyActiveTargetServiceRow)
      )
    ) {
      continue;
    }
    if (!targetServiceRows.some(isTransitionalPriorityPlacementTargetRow)) {
      continue;
    }
    operationIds.add(operation.operationId);
    partitionIds.add(operation.partitionId);
    targetReplicaIds.add(operation.replicaId);
  }

  const sortedOperationIds = [...operationIds].filter(Boolean).sort();
  return Object.freeze({
    hasGap: sortedOperationIds.length > 0,
    operationIds: Object.freeze(sortedOperationIds),
    partitionIds: Object.freeze(
      [...partitionIds].filter(Boolean).sort(),
    ),
    targetReplicaIds: Object.freeze(
      [...targetReplicaIds].filter(Boolean).sort(),
    ),
  });
}

export {
  buildCompletedPriorityPlacementHandoffObservation,
};
