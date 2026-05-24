import {NUM, SERVICE_STATUS, SERVICE_TYPE, TYPEOF} from '../constants/index.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  isPriorityControlPlanePartition,
  resolvePriorityControlPlanePartitionIds,
} from '../bootstrap/system-partition-classification.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {normalizeServiceRow} from './system-row-normalizers.js';
import {
  normalizeMembershipPublicationStringList,
} from './membership-publication-normalizers.js';

const PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT = 3;

function normalizeBlockedPriorityPartition(
  entry,
  requiredDistinctNodeCount = NUM.ZERO,
  helperFns = {},
) {
  if (!entry || typeof entry !== TYPEOF.OBJECT) {
    return null;
  }
  const partitionId = String(entry.partitionId || entry.partition_id || '').trim();
  if (!partitionId) {
    return null;
  }
  const normalizedRequiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    entry.requiredDistinctNodeCount ?? entry.required_distinct_node_count,
    requiredDistinctNodeCount,
  );
  const readyDistinctNodeCount = helperFns.normalizePositiveInteger(
    entry.readyDistinctNodeCount ?? entry.ready_distinct_node_count,
    NUM.ZERO,
  );
  const readyReplicaCount = helperFns.normalizePositiveInteger(
    entry.readyReplicaCount ?? entry.ready_replica_count,
    readyDistinctNodeCount,
  );
  const spreadGap = helperFns.normalizePositiveInteger(
    entry.spreadGap ?? entry.spread_gap,
    Math.max(NUM.ZERO, normalizedRequiredDistinctNodeCount - readyDistinctNodeCount),
  );
  return {
    partitionId,
    requiredDistinctNodeCount: normalizedRequiredDistinctNodeCount,
    readyDistinctNodeCount,
    readyReplicaCount,
    spreadGap,
  };
}

function normalizePriorityPartitionSummary(summary, options = {}, helperFns = {}) {
  if (!summary || typeof summary !== TYPEOF.OBJECT) {
    return null;
  }
  const fallbackRequiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    options.requiredDistinctNodeCount,
    NUM.ZERO,
  );
  const requiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    summary.requiredDistinctNodeCount ?? summary.required_distinct_node_count,
    fallbackRequiredDistinctNodeCount,
  );
  const blockedPartitions = (
    Array.isArray(summary.blockedPartitions) ? summary.blockedPartitions : []
  )
    .map((entry) =>
      normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount, helperFns),
    )
    .filter(Boolean)
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const missingPartitionIds = normalizeMembershipPublicationStringList([
    ...(Array.isArray(summary.missingPartitionIds) ? summary.missingPartitionIds : []),
    ...blockedPartitions.map((entry) => entry.partitionId),
  ]);
  const readyEligibleNodeCount = helperFns.normalizePositiveInteger(
    summary.readyEligibleNodeCount ?? summary.ready_eligible_node_count,
    helperFns.normalizePositiveInteger(options.readyEligibleNodeCount, NUM.ZERO),
  );
  const totalPriorityPartitionCount = helperFns.normalizePositiveInteger(
    summary.totalPriorityPartitionCount ?? summary.total_priority_partition_count,
    PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
  );
  const satisfied =
    summary.satisfied === true &&
    missingPartitionIds.length === NUM.ZERO &&
    blockedPartitions.length === NUM.ZERO;
  return {
    satisfied,
    requiredDistinctNodeCount,
    readyEligibleNodeCount,
    totalPriorityPartitionCount,
    missingPartitionIds,
    blockedPartitions,
  };
}

function buildPriorityPartitionSummaryAdvancement(summary, helperFns = {}) {
  const normalizedSummary = normalizePriorityPartitionSummary(summary, {}, helperFns);
  if (normalizedSummary === null) {
    return null;
  }
  let blockedPartitionSpreadGap = NUM.ZERO;
  let blockedPartitionReadyDistinctNodeCount = NUM.ZERO;
  for (const blockedPartition of normalizedSummary.blockedPartitions) {
    blockedPartitionSpreadGap += helperFns.normalizePositiveInteger(
      blockedPartition.spreadGap,
      NUM.ZERO,
    );
    blockedPartitionReadyDistinctNodeCount += helperFns.normalizePositiveInteger(
      blockedPartition.readyDistinctNodeCount,
      NUM.ZERO,
    );
  }
  return {
    normalizedSummary,
    satisfiedRank: normalizedSummary.satisfied === true ? NUM.ONE : NUM.ZERO,
    missingPartitionCount: normalizedSummary.missingPartitionIds.length,
    blockedPartitionCount: normalizedSummary.blockedPartitions.length,
    blockedPartitionSpreadGap,
    blockedPartitionReadyDistinctNodeCount,
  };
}

function comparePriorityPartitionSummaryAdvancement(leftSummary, rightSummary, helperFns = {}) {
  const leftAdvancement = buildPriorityPartitionSummaryAdvancement(leftSummary, helperFns);
  const rightAdvancement = buildPriorityPartitionSummaryAdvancement(rightSummary, helperFns);
  if (leftAdvancement === null || rightAdvancement === null) {
    return NUM.ZERO;
  }
  const decisiveDelta = [
    leftAdvancement.satisfiedRank - rightAdvancement.satisfiedRank,
    rightAdvancement.missingPartitionCount - leftAdvancement.missingPartitionCount,
    rightAdvancement.blockedPartitionCount - leftAdvancement.blockedPartitionCount,
    rightAdvancement.blockedPartitionSpreadGap - leftAdvancement.blockedPartitionSpreadGap,
    leftAdvancement.blockedPartitionReadyDistinctNodeCount -
      rightAdvancement.blockedPartitionReadyDistinctNodeCount,
    leftAdvancement.normalizedSummary.readyEligibleNodeCount -
      rightAdvancement.normalizedSummary.readyEligibleNodeCount,
  ].find((delta) => delta !== NUM.ZERO);
  return typeof decisiveDelta === TYPEOF.NUMBER ? decisiveDelta : NUM.ZERO;
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
  return comparePriorityPartitionSummaryAdvancement(
    normalizedCandidateSummary,
    normalizedBaselineSummary,
    helperFns,
  ) > NUM.ZERO ?
    normalizedCandidateSummary :
    normalizedBaselineSummary;
}

function arePriorityPartitionSummariesEqual(leftSummary, rightSummary, helperFns = {}) {
  const left = normalizePriorityPartitionSummary(leftSummary, {}, helperFns);
  const right = normalizePriorityPartitionSummary(rightSummary, {}, helperFns);
  if (left === null || right === null) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function isReadinessPromotable(readinessEntry = null) {
  const dimensions =
    readinessEntry?.dimensions && typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      null;
  if (!dimensions) {
    return true;
  }
  const hasPublicationSignal =
    Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED) ||
    Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
  if (!hasPublicationSignal) {
    return (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false
    );
  }
  if (dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === true) {
    return (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false
    );
  }
  return dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true;
}

function buildPrioritySpreadEligibleNodeIdSet(options = {}, helperFns = {}) {
  const preferredNodeIds = helperFns.normalizeNodeIdList(
    options.locallyEligibleNodeIds?.length > NUM.ZERO ?
      options.locallyEligibleNodeIds :
      options.projectedServingNodeIds?.length > NUM.ZERO ?
        options.projectedServingNodeIds :
        options.publishedActiveNodeIds,
  );
  if (preferredNodeIds.length > NUM.ZERO) {
    return new Set(preferredNodeIds);
  }
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const promotableNodeIds = helperFns.normalizeNodeIdList(
    Object.keys(readinessByNodeId).filter((nodeId) =>
      isReadinessPromotable(readinessByNodeId[nodeId]),
    ),
  );
  return new Set(promotableNodeIds);
}

function isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId = {}) {
  if (!normalizedService || typeof normalizedService !== TYPEOF.OBJECT) {
    return false;
  }
  if (
    normalizedService.serviceType !== SERVICE_TYPE.PARTITION ||
    normalizedService.status !== SERVICE_STATUS.ACTIVE ||
    !normalizedService.raftRole ||
    !normalizedService.address ||
    !normalizedService.nodeId
  ) {
    return false;
  }
  if (normalizedService.raftRole !== RAFT_ROLE.LEARNER) {
    return true;
  }
  return isReadinessPromotable(readinessByNodeId[normalizedService.nodeId] || null);
}

function buildDerivedPriorityPartitionSummary(options = {}, helperFns = {}) {
  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  if (serviceRows.length === NUM.ZERO) {
    return null;
  }
  const partitionRows = Array.isArray(options.partitionRows) ? options.partitionRows : [];
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const partitionRowByPartitionId = buildPartitionRowByPartitionId(partitionRows);
  const readyReplicaStatsByPartitionId = new Map();
  let observedPriorityServiceRow = false;
  const eligibleNodeIds = buildPrioritySpreadEligibleNodeIdSet(options, helperFns);
  for (const serviceRow of serviceRows) {
    const normalizedService = normalizeServiceRow(serviceRow);
    const partitionId = normalizedService.partitionId;
    const partitionRow = partitionRowByPartitionId.get(partitionId) || null;
    if (!isPriorityControlPlanePartition({partitionId, partitionRow})) {
      continue;
    }
    observedPriorityServiceRow = true;
    if (!isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId)) {
      continue;
    }
    if (eligibleNodeIds.size > NUM.ZERO && !eligibleNodeIds.has(normalizedService.nodeId)) {
      continue;
    }
    if (!readyReplicaStatsByPartitionId.has(partitionId)) {
      readyReplicaStatsByPartitionId.set(partitionId, {
        readyReplicaCount: NUM.ZERO,
        nodeIds: new Set(),
      });
    }
    const stats = readyReplicaStatsByPartitionId.get(partitionId);
    stats.readyReplicaCount += NUM.ONE;
    stats.nodeIds.add(normalizedService.nodeId);
  }
  const observedPriorityPartitionRow = partitionRows.some((partitionRow) =>
    isPriorityControlPlanePartition({partitionRow}),
  );
  if (!observedPriorityServiceRow && !observedPriorityPartitionRow) {
    return null;
  }
  const priorityPartitionIds = resolvePriorityControlPlanePartitionIds({
    partitionRows,
    serviceRows,
    partitionRowByPartitionId,
    includeInitialWhenMissing: true,
  });
  if (eligibleNodeIds.size === NUM.ZERO) {
    for (const stats of readyReplicaStatsByPartitionId.values()) {
      for (const nodeId of stats.nodeIds) {
        eligibleNodeIds.add(nodeId);
      }
    }
  }
  const requiredDistinctNodeCount = Math.min(
    PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
    eligibleNodeIds.size,
  );
  const blockedPartitions = [];
  for (const partitionId of priorityPartitionIds) {
    const stats = readyReplicaStatsByPartitionId.get(partitionId) || {
      readyReplicaCount: NUM.ZERO,
      nodeIds: new Set(),
    };
    const readyDistinctNodeCount = stats.nodeIds.size;
    const spreadGap = Math.max(NUM.ZERO, requiredDistinctNodeCount - readyDistinctNodeCount);
    if (requiredDistinctNodeCount <= NUM.ONE || spreadGap <= NUM.ZERO) {
      continue;
    }
    blockedPartitions.push({
      partitionId,
      requiredDistinctNodeCount,
      readyDistinctNodeCount,
      readyReplicaCount: stats.readyReplicaCount,
      spreadGap,
    });
  }
  return normalizePriorityPartitionSummary(
    {
      satisfied: blockedPartitions.length === NUM.ZERO,
      requiredDistinctNodeCount,
      readyEligibleNodeCount: eligibleNodeIds.size,
      totalPriorityPartitionCount: priorityPartitionIds.length,
      missingPartitionIds: blockedPartitions.map((entry) => entry.partitionId),
      blockedPartitions,
    },
    {
      requiredDistinctNodeCount,
      readyEligibleNodeCount: eligibleNodeIds.size,
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
