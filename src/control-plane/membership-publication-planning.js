import {NUM, SERVICE_STATUS, SERVICE_TYPE, TYPEOF} from '../constants/index.js';
import {
  buildActiveMembershipSnapshot,
  buildReadinessByNodeId,
  resolveActiveNodeViews,
  resolvePriorityRecoveryActiveNodeCohort,
} from './active-node-projection.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';
import {
  normalizeControlPlanePublicationRow,
  normalizeServiceRow,
} from './system-row-normalizers.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {hasPriorityRecoverySpreadGap} from './priority-recovery-snapshot.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {buildRecoveryProtocolSnapshot} from './recovery-protocol-snapshot.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  isPriorityControlPlanePartition,
  resolvePriorityControlPlanePartitionIds,
} from '../bootstrap/system-partition-classification.js';
import {RAFT_ROLE} from '../raft/constants.js';

const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;
const PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT = 3;
const AUTHORITATIVE_MEMBERSHIP_CHANGED_REASON = 'authoritative_membership_changed';

function normalizePartitionIdList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

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
  const missingPartitionIds = normalizePartitionIdList([
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

function areMembershipLifecycleSummariesEqual(leftSummary, rightSummary) {
  const left =
    leftSummary && typeof leftSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(leftSummary) :
      null;
  const right =
    rightSummary && typeof rightSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(rightSummary) :
      null;
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

function buildPublicationMetadataRefreshRow(options = {}, helperFns = {}) {
  const publicationRow = options.publicationRow;
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return publicationRow;
  }
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary ?? normalizedPublication.priorityPartitionSummary,
    {},
    helperFns,
  );
  const membershipLifecycleSummary =
    options.membershipLifecycleSummary &&
    typeof options.membershipLifecycleSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(options.membershipLifecycleSummary) :
      normalizedPublication.membershipLifecycleSummary &&
          typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT ?
        buildMembershipLifecycleSummary(normalizedPublication.membershipLifecycleSummary) :
        null;
  return {
    ...publicationRow,
    priority_partition_summary: priorityPartitionSummary,
    priorityPartitionSummary,
    membership_lifecycle_summary: membershipLifecycleSummary,
    membershipLifecycleSummary,
    updated_at: helperFns.normalizePositiveInteger(options.nowMs, Date.now()),
    transition_history: Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory,
  };
}

function shouldAllowRecoveryEligibleProjection(options = {}, helperFns = {}) {
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const latestVisiblePublicationRow = latestPublicationRow || latestPublishedPublicationRow;
  const latestPublicationStatus = String(latestVisiblePublicationRow?.status || '').toUpperCase();
  if (
    !latestVisiblePublicationRow ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
  ) {
    return false;
  }
  if (latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
    return true;
  }
  const prioritySpreadGapPending = hasPriorityRecoverySpreadGap(
    latestPublicationRow?.priorityPartitionSummary ||
      latestPublishedPublicationRow?.priorityPartitionSummary,
  );
  if (prioritySpreadGapPending) {
    return true;
  }
  if (options.observedRecoveryProjectionGap === true) {
    return true;
  }
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(options.publishedBaselineNodeIds);
  if (publishedBaselineNodeIds.length === NUM.ZERO) {
    return false;
  }
  const defaultObservedNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
    }),
  );
  const recoveryEligibleObservedNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
    }),
  );
  return recoveryEligibleObservedNodeIds.some(
    (nodeId) =>
      !publishedBaselineNodeIds.includes(nodeId) &&
      !defaultObservedNodeIds.includes(nodeId) &&
      isReadinessPromotable(options.readinessByNodeId?.[nodeId] || null),
  );
}

function shouldPreferAuthoritativeMembershipState(options = {}, helperFns = {}) {
  if (options.preferAuthoritativeRead === true || options.requireAuthoritative === true) {
    return true;
  }
  const publicationRows = [
    helperFns.normalizeLatestPublicationRow(options.latestPublicationRow),
    helperFns.normalizeLatestPublicationRow(options.latestPublishedPublicationRow),
  ];
  return publicationRows.some((row) => {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return false;
    }
    const publicationStatus = String(row.status || '').toUpperCase();
    if (publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
      return hasPriorityRecoverySpreadGap(row.priorityPartitionSummary);
    }
    if (
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
    ) {
      return false;
    }
    return (
      row.publishedActiveNodeIdsPresent === true ||
      (Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO) ||
      (Array.isArray(row.requiredAckNodeIds) && row.requiredAckNodeIds.length > NUM.ZERO) ||
      (Array.isArray(row.acknowledgedNodeIds) && row.acknowledgedNodeIds.length > NUM.ZERO)
    );
  });
}

function buildPublishedMemberStates(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(options.publishedBaselineNodeIds);
  const desiredPublishedNodeIds = helperFns.normalizeNodeIdList(options.desiredPublishedNodeIds);
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(options.projectedServingNodeIds);
  const suspectedOrTransitioningNodeIds = helperFns.normalizeNodeIdList(
    options.suspectedOrTransitioningNodeIds,
  );
  const recoveryEpochByNodeId = options.recoveryEpochByNodeId || {};
  const explicitRetiredNodeIds = new Set(
    helperFns.normalizeNodeIdList(options.explicitRetiredNodeIds),
  );
  const states = {};
  const allNodeIds = helperFns.normalizeNodeIdList([
    ...publishedBaselineNodeIds,
    ...desiredPublishedNodeIds,
    ...projectedServingNodeIds,
    ...suspectedOrTransitioningNodeIds,
    ...Object.keys(recoveryEpochByNodeId),
    ...explicitRetiredNodeIds,
  ]);
  for (const nodeId of allNodeIds) {
    const latestEpoch = recoveryEpochByNodeId[nodeId] || null;
    const recoveryOpen = latestEpoch?.open === true;
    if (explicitRetiredNodeIds.has(nodeId)) {
      states[nodeId] = MEMBERSHIP_MEMBER_STATE.RETIRED;
      continue;
    }
    if (desiredPublishedNodeIds.includes(nodeId)) {
      if (!publishedBaselineNodeIds.includes(nodeId)) {
        states[nodeId] =
          recoveryOpen ?
            MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
            MEMBERSHIP_MEMBER_STATE.JOINING;
        continue;
      }
      if (!projectedServingNodeIds.includes(nodeId)) {
        states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
        continue;
      }
      states[nodeId] =
        recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.SERVING;
      continue;
    }
    if (projectedServingNodeIds.includes(nodeId)) {
      states[nodeId] =
        recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.JOINING;
      continue;
    }
    if (publishedBaselineNodeIds.includes(nodeId)) {
      states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
    }
  }
  return states;
}

function buildProjectionDiagnosticsSummary(activeNodeViews = null, helperFns = {}) {
  const projectionDiagnostics =
    activeNodeViews?.projectionDiagnostics &&
    typeof activeNodeViews.projectionDiagnostics === TYPEOF.OBJECT ?
      activeNodeViews.projectionDiagnostics :
      null;
  if (!projectionDiagnostics) {
    return null;
  }
  return {
    readinessDecisionMode:
      typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING &&
      projectionDiagnostics.readinessDecisionMode.length > NUM.ZERO ?
        projectionDiagnostics.readinessDecisionMode :
        null,
    readinessDecisionDimensions: helperFns.normalizeStringList(
      projectionDiagnostics.readinessDecisionDimensions,
    ),
    recoveryEligibleProjectionEnabled:
      projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.recoveryEligibleIncludedNodeIds,
    ),
    livenessFallbackIncludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.livenessFallbackIncludedNodeIds,
    ),
    readinessExcludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.readinessExcludedNodeIds,
    ),
    clusterMemberUnhealthyExcludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
    ),
  };
}

function deriveMembershipPublicationCandidate(options = {}, helperFns = {}) {
  const planningSnapshot =
    options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
      options.planningSnapshot :
      helperFns.buildMembershipPublicationEvidenceSnapshot(options);
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    planningSnapshot.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    planningSnapshot.latestPublishedPublicationRow,
  );
  const latestPublicationStatus = String(latestPublicationRow?.status || '').toUpperCase();
  const carryForwardLatestPublicationBaseline =
    latestPublicationRow &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED &&
    Array.isArray(latestPublicationRow.publishedActiveNodeIds) &&
    latestPublicationRow.publishedActiveNodeIds.length > NUM.ZERO;
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    carryForwardLatestPublicationBaseline ?
      latestPublicationRow.publishedActiveNodeIds :
      latestPublishedPublicationRow?.publishedActiveNodeIds,
  );
  const readinessByNodeId = buildReadinessByNodeId({
    readinessByNodeId: planningSnapshot.readinessByNodeId,
    readinessEntries: planningSnapshot.readinessEntries,
  });
  const observedRecoveryProjectionNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...planningSnapshot,
      readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
      allowLivenessFallbackProjection: true,
    }),
  );
  const observedRecoveryProjectionGap = observedRecoveryProjectionNodeIds.some(
    (nodeId) => !publishedBaselineNodeIds.includes(nodeId),
  );
  const allowRecoveryEligibleProjection = shouldAllowRecoveryEligibleProjection(
    {
      ...options,
      latestPublicationRow,
      publishedBaselineNodeIds,
      readinessByNodeId,
      observedRecoveryProjectionGap,
    },
    helperFns,
  );
  const priorityRecoverySpreadGapPending = hasPriorityRecoverySpreadGap(
    latestPublicationRow?.priorityPartitionSummary ||
      latestPublishedPublicationRow?.priorityPartitionSummary,
  );
  const allowPrioritySpreadLivenessFallbackProjection =
    allowRecoveryEligibleProjection &&
    (priorityRecoverySpreadGapPending || observedRecoveryProjectionGap);
  const activeNodeViews = resolveActiveNodeViews({
    ...planningSnapshot,
    publicationRows:
      publishedBaselineNodeIds.length > 0 ?
        [
          {
            publication_epoch:
                latestPublishedPublicationRow?.publicationEpoch ||
                latestPublicationRow?.publicationEpoch ||
                NUM.ONE,
            status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
            published_active_node_ids: publishedBaselineNodeIds,
          },
        ] :
        [],
    latestPublicationRow:
      publishedBaselineNodeIds.length > 0 ?
        {
          publication_epoch:
              latestPublishedPublicationRow?.publicationEpoch ||
              latestPublicationRow?.publicationEpoch ||
              NUM.ONE,
          status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
          published_active_node_ids: publishedBaselineNodeIds,
        } :
        null,
    readinessByNodeId,
    allowControlPlaneRecoveryEligibleProjection: allowRecoveryEligibleProjection,
    allowLivenessFallbackProjection: allowPrioritySpreadLivenessFallbackProjection,
  });
  const projectionDiagnostics = buildProjectionDiagnosticsSummary(activeNodeViews, helperFns);
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(
    activeNodeViews.projectedServingNodeIds || activeNodeViews.projectedActiveNodeIds,
  );
  const locallyEligibleNodeIds = helperFns.normalizeNodeIdList(
    activeNodeViews.locallyEligibleNodeIds || projectedServingNodeIds,
  );
  const recoveryActiveNodeCohort = resolvePriorityRecoveryActiveNodeCohort({
    publishedActiveNodeIds: publishedBaselineNodeIds,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    membershipLifecycleSummary: {
      publishedActiveNodeIds: publishedBaselineNodeIds,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      projectionDiagnostics,
      participationByNodeId:
        planningSnapshot.membershipLifecycleSummary?.participationByNodeId,
    },
  });
  const recoveryEpochByNodeId = helperFns.buildLatestRecoveryEpochByNodeId(
    options.recoveryEpochsByNodeId,
  );
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    Array.isArray(planningSnapshot.publishedActiveNodeIds) ?
      planningSnapshot.publishedActiveNodeIds :
      publishedBaselineNodeIds.length > NUM.ZERO ?
        recoveryActiveNodeCohort.activeNodeIds :
        helperFns.resolveObservedActiveNodeIds({
          ...planningSnapshot,
          readinessByNodeId,
        }),
  );
  const priorityRecoveryPublicationContext = buildActiveMembershipSnapshot({
    publishedActiveNodeIds,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    membershipLifecycleSummary: {
      publishedActiveNodeIds,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      projectionDiagnostics,
    },
    recoveryActiveNodeIds: recoveryActiveNodeCohort.activeNodeIds,
    recoveryActiveNodeSource: recoveryActiveNodeCohort.source,
  });
  const requiredAckNodeIds = helperFns.normalizeNodeIdList(
    Array.isArray(planningSnapshot.requiredAckNodeIds) ?
      planningSnapshot.requiredAckNodeIds :
      publishedActiveNodeIds,
  );
  const acknowledgedNodeIds = helperFns.normalizeNodeIdList([
    ...helperFns.resolveCarriedAcknowledgedNodeIds({
      latestPublicationRow,
      latestPublishedPublicationRow,
      requiredAckNodeIds,
    }),
    ...(Array.isArray(planningSnapshot.acknowledgedNodeIds) ?
      planningSnapshot.acknowledgedNodeIds :
      []),
  ]);
  const sourceTopologyEpoch = helperFns.normalizePositiveInteger(
    planningSnapshot.sourceTopologyEpoch,
    null,
  );
  const sourceSnapshotVersion = helperFns.normalizePositiveInteger(
    planningSnapshot.sourceSnapshotVersion,
    null,
  );
  const normalizedPriorityPartitionSummary = normalizePriorityPartitionSummary(
    planningSnapshot.priorityPartitionSummary ||
      planningSnapshot.priorityRecoveryPlanningSnapshot?.priorityPartitionSummary,
    {
      requiredDistinctNodeCount: Math.min(
        PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
        locallyEligibleNodeIds.length,
      ),
      readyEligibleNodeCount: locallyEligibleNodeIds.length,
    },
    helperFns,
  );
  const derivedPriorityPartitionSummary = buildDerivedPriorityPartitionSummary(
    {
      serviceRows: planningSnapshot.serviceRows,
      partitionRows: planningSnapshot.partitionRows,
      readinessByNodeId,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      publishedActiveNodeIds,
    },
    helperFns,
  );
  const priorityPartitionSummary = chooseMoreAdvancedPriorityPartitionSummary(
    normalizedPriorityPartitionSummary,
    derivedPriorityPartitionSummary,
    helperFns,
  );
  const reasonCode =
    typeof planningSnapshot.reasonCode === TYPEOF.STRING && planningSnapshot.reasonCode.length > 0 ?
      planningSnapshot.reasonCode :
      AUTHORITATIVE_MEMBERSHIP_CHANGED_REASON;
  const membershipLifecycleSummaryBase =
    planningSnapshot.membershipLifecycleSummary &&
    typeof planningSnapshot.membershipLifecycleSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(planningSnapshot.membershipLifecycleSummary) :
      buildMembershipLifecycleSummary({
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds,
        projectedServingNodeIds,
        locallyEligibleNodeIds,
        suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
        memberStatesByNodeId: buildPublishedMemberStates(
          {
            publishedBaselineNodeIds,
            desiredPublishedNodeIds: publishedActiveNodeIds,
            projectedServingNodeIds,
            suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
            recoveryEpochByNodeId,
          },
          helperFns,
        ),
        recoveryEpochByNodeId: Object.keys(recoveryEpochByNodeId).reduce(
          (accumulator, nodeId) => {
            accumulator[nodeId] = recoveryEpochByNodeId[nodeId].epochId;
            return accumulator;
          },
          {},
        ),
        membershipFreeze: activeNodeViews.membershipFreeze,
        projectionDiagnostics,
        recoveryActiveNodeIds: priorityRecoveryPublicationContext.recoveryActiveNodeIds,
        recoveryActiveNodeSource: priorityRecoveryPublicationContext.recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds:
          priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds,
      });
  const baselineEpoch = helperFns.normalizePositiveInteger(
    latestPublicationRow?.publicationEpoch,
    NUM.ZERO,
  );
  const changed =
    !latestPublicationRow ||
    !helperFns.listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds) ||
    helperFns.didOptionalSourceVersionChange(
      latestPublicationRow.sourceTopologyEpoch,
      sourceTopologyEpoch,
    ) ||
    helperFns.didOptionalSourceVersionChange(
      latestPublicationRow.sourceSnapshotVersion,
      sourceSnapshotVersion,
    );
  const priorityPartitionSummaryChanged = !arePriorityPartitionSummariesEqual(
    latestPublicationRow?.priorityPartitionSummary,
    priorityPartitionSummary,
    helperFns,
  );
  const candidatePublicationEpoch =
    changed ?
      baselineEpoch + NUM.ONE :
      Math.max(baselineEpoch, NUM.ONE);
  const candidatePublicationStatus =
    changed === true ?
      MEMBERSHIP_PUBLICATION_STATUS.OPEN :
      String(
        latestPublicationRow?.status || MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      ).toUpperCase();
  const recoveryProtocolSnapshot = buildRecoveryProtocolSnapshot({
    publicationEpoch: candidatePublicationEpoch,
    publicationStatus: candidatePublicationStatus,
    targetNodeId: planningSnapshot.targetNodeId || planningSnapshot.publisherNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    publishedActiveNodeIdsPresent: true,
    durablePublishedActiveNodeIds: publishedBaselineNodeIds,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    priorityPartitionSummary,
    membershipLifecycleSummary: membershipLifecycleSummaryBase,
    projectionDiagnostics,
  });
  const membershipLifecycleSummary = buildMembershipLifecycleSummary({
    ...membershipLifecycleSummaryBase,
    participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
    participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
    recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
    recoveryProtocolReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
  });
  return {
    publicationKind: helperFns.publicationKind,
    publicationEpoch: candidatePublicationEpoch,
    publicationStatus: candidatePublicationStatus,
    publicationObservationState: recoveryProtocolSnapshot.publicationObservationState,
    publisherNodeId: planningSnapshot.publisherNodeId,
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    publishedPlanningEpoch: recoveryProtocolSnapshot.publishedPlanningEpoch,
    publishedActiveNodeIdsPresent: recoveryProtocolSnapshot.publishedActiveNodeIdsPresent,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    priorityPartitionSummary,
    membershipLifecycleSummary,
    projectedServingNodeIds,
    locallyEligibleNodeIds,
    recoveryEligibleIncludedNodeIds: recoveryProtocolSnapshot.recoveryEligibleIncludedNodeIds,
    recoveryActiveNodeIds: recoveryProtocolSnapshot.recoveryActiveNodeIds,
    recoveryActiveNodeSource: recoveryProtocolSnapshot.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      recoveryProtocolSnapshot.missingPublishedRecoveryActiveNodeIds,
    participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
    participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
    recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
    targetParticipation: recoveryProtocolSnapshot.targetParticipation,
    priorityRecoveryReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
    targetNodeId:
      planningSnapshot.targetNodeId || planningSnapshot.publisherNodeId || null,
    admissionState: planningSnapshot.admissionState || null,
    admissionReasonCodes: Array.isArray(planningSnapshot.admissionReasonCodes) ?
      planningSnapshot.admissionReasonCodes :
      [],
    clusterIncarnationFence:
      planningSnapshot.clusterIncarnationFence &&
        typeof planningSnapshot.clusterIncarnationFence === TYPEOF.OBJECT ?
        planningSnapshot.clusterIncarnationFence :
        null,
    projectionDiagnostics,
    reasonCode,
    changed,
    priorityPartitionSummaryChanged,
    membershipLifecycleSummaryChanged: !areMembershipLifecycleSummariesEqual(
      latestPublicationRow?.membershipLifecycleSummary,
      membershipLifecycleSummary,
    ),
  };
}

export {
  buildPublicationMetadataRefreshRow,
  deriveMembershipPublicationCandidate,
  shouldPreferAuthoritativeMembershipState,
};
