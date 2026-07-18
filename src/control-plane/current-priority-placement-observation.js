import {SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
import {
  resolvePriorityControlPlanePartitionIds,
} from '../bootstrap/system-partition-classification.js';
import {
  buildDerivedPriorityPartitionSummary,
} from './membership-publication-priority-partition-summary.js';
import {
  normalizeNodeIdList,
  normalizePositiveInteger,
} from './membership-publication-row-helpers.js';
import {normalizeServiceRow} from './system-row-normalizers.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {
  evaluatePartitionReplicaTopology,
} from '../admin/admin-shared-metadata-consistency.js';

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

function resolveCurrentPlacementEligibleNodeIds(activeNodeViews = {}) {
  return normalizeNodeIdList(
    activeNodeViews.locallyEligibleNodeIds?.length > 0 ?
      activeNodeViews.locallyEligibleNodeIds :
      activeNodeViews.effectiveActiveNodeIds?.length > 0 ?
        activeNodeViews.effectiveActiveNodeIds :
        activeNodeViews.projectedServingNodeIds,
  );
}

function buildCurrentPriorityLeaderCoverage({
  priorityPartitionIds,
  partitionRows,
  serviceRows,
  eligibleNodeIds,
}) {
  const eligibleNodeIdSet = new Set(eligibleNodeIds);
  const priorityPartitionIdSet = new Set(priorityPartitionIds);
  const partitionRowById = new Map();
  for (const partitionRow of partitionRows) {
    const partitionId = String(
      partitionRow?.partition_id ?? partitionRow?.partitionId ?? '',
    ).trim();
    if (partitionId.length > 0) {
      partitionRowById.set(partitionId, partitionRow);
    }
  }
  const currentVoterServiceRows = serviceRows.filter((serviceRow) => {
    const service = normalizeServiceRow(serviceRow);
    return (
      service.serviceType === SERVICE_TYPE.PARTITION &&
      service.status === SERVICE_STATUS.ACTIVE &&
      isVoterRaftRole(service.raftRole) &&
      Boolean(service.nodeId) &&
      Boolean(service.address) &&
      priorityPartitionIdSet.has(service.partitionId) &&
      (
        eligibleNodeIdSet.size === 0 ||
        eligibleNodeIdSet.has(service.nodeId)
      )
    );
  });
  const topologyByPartition = new Map(
    priorityPartitionIds.map((partitionId) => [
      partitionId,
      evaluatePartitionReplicaTopology({
        partitionRow: partitionRowById.get(partitionId) || null,
        serviceRows: currentVoterServiceRows,
        requiresAddress: true,
        requireLeaderNodeId: true,
      }),
    ]),
  );
  const missingLeaderPartitionIds = priorityPartitionIds.filter(
    (partitionId) =>
      topologyByPartition.get(partitionId).canonicalLeaderReplica !== true,
  );
  const missingLeaderPartitionIdSet = new Set(missingLeaderPartitionIds);
  return Object.freeze({
    satisfied: missingLeaderPartitionIds.length === 0,
    requiredPartitionCount: priorityPartitionIds.length,
    observedLeaderPartitionCount:
      priorityPartitionIds.length - missingLeaderPartitionIds.length,
    missingLeaderPartitionCount: missingLeaderPartitionIds.length,
    missingLeaderPartitionIds: Object.freeze(missingLeaderPartitionIds),
    leaderNodeIdsByPartition: Object.freeze(
      Object.fromEntries(
        priorityPartitionIds.map((partitionId) => [
          partitionId,
          Object.freeze(
            normalizeNodeIdList(
              missingLeaderPartitionIdSet.has(partitionId) ?
                [] :
                [topologyByPartition.get(partitionId).leaderNodeId],
            ),
          ),
        ]),
      ),
    ),
  });
}

function attachCurrentPrioritySpreadTotals(priorityPartitionSummary) {
  if (!priorityPartitionSummary) {
    return null;
  }
  const spreadGaps = priorityPartitionSummary.blockedPartitions.map(
    (partition) => normalizePositiveInteger(partition.spreadGap, 0),
  );
  return Object.freeze({
    ...priorityPartitionSummary,
    blockedPartitionCount:
      priorityPartitionSummary.blockedPartitions.length,
    largestSpreadGap:
      spreadGaps.length > 0 ? Math.max(...spreadGaps) : 0,
    totalSpreadGap: spreadGaps.reduce(
      (total, spreadGap) => total + spreadGap,
      0,
    ),
  });
}

function buildCurrentPriorityPlacementObservation(options = {}) {
  const partitionRows = Array.isArray(options.partitionRows) ?
    options.partitionRows :
    [];
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  const readinessByNodeId =
    options.readinessByNodeId &&
    typeof options.readinessByNodeId === 'object' ?
      options.readinessByNodeId :
      {};
  const activeNodeViews =
    options.activeNodeViews &&
    typeof options.activeNodeViews === 'object' ?
      options.activeNodeViews :
      {};
  const eligibleNodeIds = resolveCurrentPlacementEligibleNodeIds(
    activeNodeViews,
  );
  const priorityPartitionSummary = attachCurrentPrioritySpreadTotals(
    buildDerivedPriorityPartitionSummary(
      {
        partitionRows,
        serviceRows,
        readinessByNodeId,
        projectedServingNodeIds: activeNodeViews.projectedServingNodeIds,
        locallyEligibleNodeIds: eligibleNodeIds,
        publishedActiveNodeIds: activeNodeViews.publishedActiveNodeIds,
      },
      PRIORITY_PARTITION_SUMMARY_HELPERS,
    ),
  );
  const priorityPartitionIds = resolvePriorityControlPlanePartitionIds({
    partitionRows,
    serviceRows,
    includeInitialWhenMissing: true,
  });
  const leaderCoverage = buildCurrentPriorityLeaderCoverage({
    priorityPartitionIds,
    partitionRows,
    serviceRows,
    eligibleNodeIds,
  });
  const available = priorityPartitionSummary !== null;
  return Object.freeze({
    state: available ?
      CURRENT_PRIORITY_PLACEMENT_OBSERVATION_STATE.AVAILABLE :
      CURRENT_PRIORITY_PLACEMENT_OBSERVATION_STATE.UNAVAILABLE,
    source: CURRENT_PRIORITY_PLACEMENT_OBSERVATION_SOURCE,
    capturedAt: Number.isFinite(options.capturedAt) ?
      options.capturedAt :
      null,
    eligibleNodeIds: Object.freeze(eligibleNodeIds),
    priorityPartitionIds: Object.freeze(priorityPartitionIds),
    priorityPartitionSummary,
    leaderCoverage,
    satisfied:
      available &&
      priorityPartitionSummary.satisfied === true &&
      leaderCoverage.satisfied === true,
  });
}

export {
  CURRENT_PRIORITY_PLACEMENT_OBSERVATION_STATE,
  buildCurrentPriorityPlacementObservation,
};
