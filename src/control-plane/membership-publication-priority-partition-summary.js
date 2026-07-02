import {SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
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
  requiredDistinctNodeCount = 0,
  helperFns = {},
) {
  if (!entry || typeof entry !== 'object') {
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
    0,
  );
  const readyReplicaCount = helperFns.normalizePositiveInteger(
    entry.readyReplicaCount ?? entry.ready_replica_count,
    readyDistinctNodeCount,
  );
  const spreadGap = helperFns.normalizePositiveInteger(
    entry.spreadGap ?? entry.spread_gap,
    Math.max(0, normalizedRequiredDistinctNodeCount - readyDistinctNodeCount),
  );
  const exclusionReasonCounts =
    entry.exclusionReasonCounts &&
    typeof entry.exclusionReasonCounts === 'object' ?
      {...entry.exclusionReasonCounts} :
      null;
  return {
    partitionId,
    requiredDistinctNodeCount: normalizedRequiredDistinctNodeCount,
    readyDistinctNodeCount,
    readyReplicaCount,
    spreadGap,
    ...(exclusionReasonCounts ? {exclusionReasonCounts} : {}),
  };
}

function normalizePriorityPartitionSummary(summary, options = {}, helperFns = {}) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const fallbackRequiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    options.requiredDistinctNodeCount,
    0,
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
    helperFns.normalizePositiveInteger(options.readyEligibleNodeCount, 0),
  );
  const totalPriorityPartitionCount = helperFns.normalizePositiveInteger(
    summary.totalPriorityPartitionCount ?? summary.total_priority_partition_count,
    PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
  );
  const satisfied =
    summary.satisfied === true &&
    missingPartitionIds.length === 0 &&
    blockedPartitions.length === 0;
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
  let blockedPartitionSpreadGap = 0;
  let blockedPartitionReadyDistinctNodeCount = 0;
  for (const blockedPartition of normalizedSummary.blockedPartitions) {
    blockedPartitionSpreadGap += helperFns.normalizePositiveInteger(
      blockedPartition.spreadGap,
      0,
    );
    blockedPartitionReadyDistinctNodeCount += helperFns.normalizePositiveInteger(
      blockedPartition.readyDistinctNodeCount,
      0,
    );
  }
  return {
    normalizedSummary,
    satisfiedRank: normalizedSummary.satisfied === true ? 1 : 0,
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
    return 0;
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
  ].find((delta) => delta !== 0);
  return typeof decisiveDelta === 'number' ? decisiveDelta : 0;
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
  ) > 0 ?
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
    readinessEntry?.dimensions && typeof readinessEntry.dimensions === 'object' ?
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
    options.locallyEligibleNodeIds?.length > 0 ?
      options.locallyEligibleNodeIds :
      options.projectedServingNodeIds?.length > 0 ?
        options.projectedServingNodeIds :
        options.publishedActiveNodeIds,
  );
  if (preferredNodeIds.length > 0) {
    return new Set(preferredNodeIds);
  }
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === 'object' ?
      options.readinessByNodeId :
      {};
  const promotableNodeIds = helperFns.normalizeNodeIdList(
    Object.keys(readinessByNodeId).filter((nodeId) =>
      isReadinessPromotable(readinessByNodeId[nodeId]),
    ),
  );
  return new Set(promotableNodeIds);
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
    normalizedService.raftRole === RAFT_ROLE.LEARNER &&
    !isReadinessPromotable(readinessByNodeId[normalizedService.nodeId] || null)
  ) {
    return 'learner_not_promotable';
  }
  return null;
}

function buildDerivedPriorityPartitionSummary(options = {}, helperFns = {}) {
  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  if (serviceRows.length === 0) {
    return null;
  }
  const partitionRows = Array.isArray(options.partitionRows) ? options.partitionRows : [];
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === 'object' ?
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
    if (!readyReplicaStatsByPartitionId.has(partitionId)) {
      readyReplicaStatsByPartitionId.set(partitionId, {
        readyReplicaCount: 0,
        nodeIds: new Set(),
        exclusionReasonCounts: {},
      });
    }
    const stats = readyReplicaStatsByPartitionId.get(partitionId);
    const exclusionReason = resolvePrioritySpreadReplicaExclusionReason(
      normalizedService,
      readinessByNodeId,
    ) || (
      eligibleNodeIds.size > 0 &&
      !eligibleNodeIds.has(normalizedService.nodeId) ?
        'node_not_eligible' :
        null
    );
    if (exclusionReason !== null) {
      stats.exclusionReasonCounts[exclusionReason] =
        (stats.exclusionReasonCounts[exclusionReason] || 0) + 1;
      continue;
    }
    stats.readyReplicaCount += 1;
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
  if (eligibleNodeIds.size === 0) {
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
      readyReplicaCount: 0,
      nodeIds: new Set(),
      exclusionReasonCounts: {},
    };
    const readyDistinctNodeCount = stats.nodeIds.size;
    const spreadGap = Math.max(0, requiredDistinctNodeCount - readyDistinctNodeCount);
    if (requiredDistinctNodeCount <= 1 || spreadGap <= 0) {
      continue;
    }
    blockedPartitions.push({
      partitionId,
      requiredDistinctNodeCount,
      readyDistinctNodeCount,
      exclusionReasonCounts: {...stats.exclusionReasonCounts},
      readyReplicaCount: stats.readyReplicaCount,
      spreadGap,
    });
  }
  return normalizePriorityPartitionSummary(
    {
      satisfied: blockedPartitions.length === 0,
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
