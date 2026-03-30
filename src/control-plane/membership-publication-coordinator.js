import {createHash} from 'node:crypto';
import {v4 as uuidv4} from 'uuid';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {
  buildReadinessByNodeId,
  resolveActiveNodeViews,
  resolveCanonicalActiveNodeIds,
} from './active-node-projection.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';
import {
  normalizeControlPlanePublicationRow,
  normalizeServiceRow,
  serializeControlPlanePublicationRow,
} from './system-row-normalizers.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  mergeControlPlanePublicationRows,
  publicationRowSatisfiesDesiredState,
} from './control-plane-publication-merge.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  isPriorityControlPlanePartition,
  resolvePriorityControlPlanePartitionIds,
} from '../bootstrap/system-partition-classification.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {OperationLane} from '../workflow/operation-lane.js';

const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const MEMBERSHIP_PUBLICATION_OWNER_KEY =
  `membership-publication:${MEMBERSHIP_PUBLICATION_KIND}`;

const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;

const MEMBERSHIP_PUBLICATION_WORKFLOW_STEP = Object.freeze({
  IDLE: 'IDLE',
  DERIVING: 'DERIVING',
  OPEN: 'OPEN',
});
const PUBLICATION_WRITE_MAX_ATTEMPTS = 3;
const PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT = 3;
const PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED = 'ack_timeout_exceeded';
const PUBLICATION_WORKFLOW_REASON = Object.freeze({
  DERIVE_MEMBERSHIP_PUBLICATION: 'derive-membership-publication',
  PERSIST_OPEN_PUBLICATION: 'persist-open-publication',
});

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )].sort();
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )].sort();
}

function listEquals(left = [], right = []) {
  const normalizedLeft = normalizeNodeIdList(left);
  const normalizedRight = normalizeNodeIdList(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizePositiveInteger(value, fallback = null) {
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) {
    return Math.trunc(normalized);
  }
  return fallback;
}

function buildTransitionHistoryEntry({state, reasonCode, at, metadata} = {}) {
  const entry = {
    state: String(state || MEMBERSHIP_PUBLICATION_STATUS.OPEN),
    at: normalizePositiveInteger(at, Date.now()),
  };
  if (typeof reasonCode === TYPEOF.STRING && reasonCode.length > 0) {
    entry.reasonCode = reasonCode;
  }
  if (metadata && typeof metadata === TYPEOF.OBJECT) {
    Object.assign(entry, metadata);
  }
  return entry;
}

function didOptionalSourceVersionChange(previousValue, nextValue) {
  if (nextValue === null || nextValue === undefined) {
    return false;
  }
  return previousValue !== nextValue;
}

function hasPublicationTimedOut(publicationRow, options = {}) {
  const normalizedPublication = normalizeControlPlanePublicationRow(
    publicationRow,
  );
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, null);
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const createdAt = normalizePositiveInteger(
    publicationRow?.created_at,
    normalizePositiveInteger(publicationRow?.createdAt, null),
  );
  if (!timeoutMs || !createdAt) {
    return false;
  }
  if (normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
      normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED) {
    return false;
  }
  return nowMs - createdAt >= timeoutMs;
}

function abandonMembershipPublication(options = {}) {
  const publicationRow = options.publicationRow || {};
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const reasonCode =
    typeof options.reasonCode === TYPEOF.STRING && options.reasonCode.length > 0 ?
      options.reasonCode :
      PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED;
  const existingHistory = Array.isArray(publicationRow.transition_history) ?
    publicationRow.transition_history.slice() :
    normalizeControlPlanePublicationRow(publicationRow).transitionHistory;
  return {
    ...publicationRow,
    status: MEMBERSHIP_PUBLICATION_STATUS.ABANDONED,
    reason_code: reasonCode,
    updated_at: nowMs,
    closed_at: nowMs,
    transition_history: [
      ...existingHistory,
      buildTransitionHistoryEntry({
        state: MEMBERSHIP_PUBLICATION_STATUS.ABANDONED,
        reasonCode,
        at: nowMs,
      }),
    ],
  };
}

function normalizeLatestPublicationRow(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return null;
  }
  return normalizeControlPlanePublicationRow(row);
}

function normalizeTableRowsResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

const mergePublicationRows = mergeControlPlanePublicationRows;

function buildPublicationReadOptions(options = {}) {
  return {
    ...options,
    preferOwnerRpcRead: true,
  };
}

function resolveObservedActiveNodeIds(options = {}) {
  return resolveCanonicalActiveNodeIds({
    ...options,
    latestPublicationRow: null,
    publicationRows: [],
    requirePublishedMembership: false,
  });
}

function buildLatestRecoveryEpochByNodeId(recoveryEpochsByNodeId = {}) {
  const entries = {};
  if (!recoveryEpochsByNodeId || typeof recoveryEpochsByNodeId !== TYPEOF.OBJECT) {
    return entries;
  }
  for (const [nodeId, history] of Object.entries(recoveryEpochsByNodeId)) {
    const epochs = Array.isArray(history) ? history : [];
    const latestEpoch = epochs[epochs.length - 1] || null;
    if (!latestEpoch || typeof latestEpoch !== TYPEOF.OBJECT) {
      continue;
    }
    const epochId = String(latestEpoch.epochId || '').trim();
    if (!epochId) {
      continue;
    }
    entries[nodeId] = {
      epochId,
      open: latestEpoch.open === true,
    };
  }
  return entries;
}

function normalizePartitionIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )].sort();
}

function normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount = 0) {
  if (!entry || typeof entry !== TYPEOF.OBJECT) {
    return null;
  }
  const partitionId = String(
    entry.partitionId || entry.partition_id || '',
  ).trim();
  if (!partitionId) {
    return null;
  }
  const normalizedRequiredDistinctNodeCount = normalizePositiveInteger(
    entry.requiredDistinctNodeCount ?? entry.required_distinct_node_count,
    requiredDistinctNodeCount,
  );
  const readyDistinctNodeCount = normalizePositiveInteger(
    entry.readyDistinctNodeCount ?? entry.ready_distinct_node_count,
    0,
  );
  const readyReplicaCount = normalizePositiveInteger(
    entry.readyReplicaCount ?? entry.ready_replica_count,
    readyDistinctNodeCount,
  );
  const spreadGap = normalizePositiveInteger(
    entry.spreadGap ?? entry.spread_gap,
    Math.max(
      0,
      normalizedRequiredDistinctNodeCount - readyDistinctNodeCount,
    ),
  );
  return {
    partitionId,
    requiredDistinctNodeCount: normalizedRequiredDistinctNodeCount,
    readyDistinctNodeCount,
    readyReplicaCount,
    spreadGap,
  };
}

function normalizePriorityPartitionSummary(summary, options = {}) {
  if (!summary || typeof summary !== TYPEOF.OBJECT) {
    return null;
  }

  const fallbackRequiredDistinctNodeCount = normalizePositiveInteger(
    options.requiredDistinctNodeCount,
    0,
  );
  const requiredDistinctNodeCount = normalizePositiveInteger(
    summary.requiredDistinctNodeCount ?? summary.required_distinct_node_count,
    fallbackRequiredDistinctNodeCount,
  );
  const blockedPartitions = (Array.isArray(summary.blockedPartitions) ?
    summary.blockedPartitions :
    [])
    .map((entry) =>
      normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount),
    )
    .filter(Boolean)
    .sort((left, right) =>
      left.partitionId.localeCompare(right.partitionId),
    );
  const missingPartitionIds = normalizePartitionIdList([
    ...(Array.isArray(summary.missingPartitionIds) ?
      summary.missingPartitionIds :
      []),
    ...blockedPartitions.map((entry) => entry.partitionId),
  ]);
  const readyEligibleNodeCount = normalizePositiveInteger(
    summary.readyEligibleNodeCount ?? summary.ready_eligible_node_count,
    normalizePositiveInteger(options.readyEligibleNodeCount, 0),
  );
  const totalPriorityPartitionCount = normalizePositiveInteger(
    summary.totalPriorityPartitionCount ?? summary.total_priority_partition_count,
    PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
  );
  const satisfied =
    summary.satisfied === true &&
    missingPartitionIds.length === 0 &&
    blockedPartitions.length === 0 ?
      true :
      false;

  return {
    satisfied,
    requiredDistinctNodeCount,
    readyEligibleNodeCount,
    totalPriorityPartitionCount,
    missingPartitionIds,
    blockedPartitions,
  };
}

function arePriorityPartitionSummariesEqual(leftSummary, rightSummary) {
  const left = normalizePriorityPartitionSummary(leftSummary);
  const right = normalizePriorityPartitionSummary(rightSummary);
  if (left === null || right === null) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildPrioritySpreadEligibleNodeIdSet(options = {}) {
  const preferredNodeIds = normalizeNodeIdList(
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
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const promotableNodeIds = normalizeNodeIdList(
    Object.keys(readinessByNodeId).filter((nodeId) =>
      isReadinessPromotable(readinessByNodeId[nodeId]),
    ),
  );
  return new Set(promotableNodeIds);
}

function buildDerivedPriorityPartitionSummary(options = {}) {
  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  if (serviceRows.length === 0) {
    return null;
  }
  const partitionRows = Array.isArray(options.partitionRows) ?
    options.partitionRows :
    [];
  const partitionRowByPartitionId = buildPartitionRowByPartitionId(partitionRows);
  const readyReplicaStatsByPartitionId = new Map();
  let observedPriorityServiceRow = false;
  const eligibleNodeIds = buildPrioritySpreadEligibleNodeIdSet(options);

  for (const serviceRow of serviceRows) {
    const normalizedService = normalizeServiceRow(serviceRow);
    const partitionId = normalizedService.partitionId;
    const partitionRow = partitionRowByPartitionId.get(partitionId) || null;
    if (!isPriorityControlPlanePartition({
      partitionId,
      partitionRow,
    })) {
      continue;
    }
    observedPriorityServiceRow = true;
    if (normalizedService.serviceType !== SERVICE_TYPE.PARTITION ||
        normalizedService.status !== SERVICE_STATUS.ACTIVE ||
        normalizedService.raftRole === RAFT_ROLE.LEARNER ||
        !normalizedService.raftRole ||
        !normalizedService.address ||
        !normalizedService.nodeId) {
      continue;
    }
    if (eligibleNodeIds.size > 0 && !eligibleNodeIds.has(normalizedService.nodeId)) {
      continue;
    }
    if (!readyReplicaStatsByPartitionId.has(partitionId)) {
      readyReplicaStatsByPartitionId.set(partitionId, {
        readyReplicaCount: 0,
        nodeIds: new Set(),
      });
    }
    const stats = readyReplicaStatsByPartitionId.get(partitionId);
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
    };
    const readyDistinctNodeCount = stats.nodeIds.size;
    const spreadGap = Math.max(
      0,
      requiredDistinctNodeCount - readyDistinctNodeCount,
    );
    if (requiredDistinctNodeCount <= 1 || spreadGap <= 0) {
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

  return normalizePriorityPartitionSummary({
    satisfied: blockedPartitions.length === 0,
    requiredDistinctNodeCount,
    readyEligibleNodeCount: eligibleNodeIds.size,
    totalPriorityPartitionCount: priorityPartitionIds.length,
    missingPartitionIds: blockedPartitions.map((entry) => entry.partitionId),
    blockedPartitions,
  }, {
    requiredDistinctNodeCount,
    readyEligibleNodeCount: eligibleNodeIds.size,
  });
}

function buildPriorityPartitionSummaryRefreshRow(options = {}) {
  const publicationRow = options.publicationRow;
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
  );
  if (!publicationRow || !priorityPartitionSummary) {
    return publicationRow;
  }
  const normalizedPublication = normalizeControlPlanePublicationRow(
    publicationRow,
  );
  return {
    ...publicationRow,
    priority_partition_summary: priorityPartitionSummary,
    priorityPartitionSummary,
    updated_at: normalizePositiveInteger(options.nowMs, Date.now()),
    transition_history: Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory,
  };
}

function isReadinessPromotable(readinessEntry = null) {
  const dimensions = readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
    readinessEntry.dimensions :
    null;
  if (!dimensions) {
    return true;
  }
  const hasPublicationSignal =
    Object.hasOwn(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
    ) ||
    Object.hasOwn(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    );
  if (!hasPublicationSignal) {
    return dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
        true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !==
        false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !==
        false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false;
  }
  if (dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] ===
      true) {
    return dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
        true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !==
        false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !==
        false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false;
  }
  return dimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
  ] === true &&
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false;
}

function shouldAllowRecoveryEligibleProjection(options = {}) {
  const latestPublicationRow = normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublicationStatus = String(
    latestPublicationRow?.status || '',
  ).toUpperCase();
  if (!latestPublicationRow ||
      latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED) {
    return false;
  }
  if (latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
    return true;
  }

  const publishedBaselineNodeIds = normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  if (publishedBaselineNodeIds.length === 0) {
    return false;
  }
  const defaultObservedNodeIds = normalizeNodeIdList(
    resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
    }),
  );
  const recoveryEligibleObservedNodeIds = normalizeNodeIdList(
    resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
    }),
  );

  return recoveryEligibleObservedNodeIds.some((nodeId) =>
    !publishedBaselineNodeIds.includes(nodeId) &&
    !defaultObservedNodeIds.includes(nodeId) &&
    isReadinessPromotable(options.readinessByNodeId?.[nodeId] || null),
  );
}

function buildPublishedMemberStates(options = {}) {
  const publishedBaselineNodeIds = normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const desiredPublishedNodeIds = normalizeNodeIdList(
    options.desiredPublishedNodeIds,
  );
  const projectedServingNodeIds = normalizeNodeIdList(
    options.projectedServingNodeIds,
  );
  const suspectedOrTransitioningNodeIds = normalizeNodeIdList(
    options.suspectedOrTransitioningNodeIds,
  );
  const recoveryEpochByNodeId = options.recoveryEpochByNodeId || {};
  const explicitRetiredNodeIds = new Set(normalizeNodeIdList(
    options.explicitRetiredNodeIds,
  ));
  const states = {};
  const allNodeIds = normalizeNodeIdList([
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
        states[nodeId] = recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.JOINING;
        continue;
      }
      if (!projectedServingNodeIds.includes(nodeId)) {
        states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
        continue;
      }
      states[nodeId] = recoveryOpen ?
        MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
        MEMBERSHIP_MEMBER_STATE.SERVING;
      continue;
    }
    if (projectedServingNodeIds.includes(nodeId)) {
      states[nodeId] = recoveryOpen ?
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

function buildServingMemberStatesByNodeId(existingStates = {}, publishedNodeIds = []) {
  const nextStates = {...(existingStates || {})};
  for (const nodeId of normalizeNodeIdList(publishedNodeIds)) {
    nextStates[nodeId] = MEMBERSHIP_MEMBER_STATE.SERVING;
  }
  return nextStates;
}

function buildProjectionDiagnosticsSummary(activeNodeViews = null) {
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
      projectionDiagnostics.readinessDecisionMode.length > 0 ?
        projectionDiagnostics.readinessDecisionMode :
        null,
    readinessDecisionDimensions: normalizeStringList(
      projectionDiagnostics.readinessDecisionDimensions,
    ),
    recoveryEligibleProjectionEnabled:
      projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: normalizeNodeIdList(
      projectionDiagnostics.recoveryEligibleIncludedNodeIds,
    ),
    readinessExcludedNodeIds: normalizeNodeIdList(
      projectionDiagnostics.readinessExcludedNodeIds,
    ),
    clusterMemberUnhealthyExcludedNodeIds: normalizeNodeIdList(
      projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
    ),
  };
}

function deriveMembershipPublicationCandidate(options = {}) {
  const latestPublicationRow = normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublishedPublicationRow = normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const latestPublicationStatus = String(
    latestPublicationRow?.status || '',
  ).toUpperCase();
  const carryForwardLatestPublicationBaseline =
    latestPublicationRow &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED &&
    Array.isArray(latestPublicationRow.publishedActiveNodeIds) &&
    latestPublicationRow.publishedActiveNodeIds.length > 0;
  const publishedBaselineNodeIds = normalizeNodeIdList(
    carryForwardLatestPublicationBaseline ?
      latestPublicationRow.publishedActiveNodeIds :
      latestPublishedPublicationRow?.publishedActiveNodeIds,
  );
  const readinessByNodeId = buildReadinessByNodeId({
    readinessByNodeId: options.readinessByNodeId,
    readinessEntries: options.readinessEntries,
  });
  const allowRecoveryEligibleProjection =
    shouldAllowRecoveryEligibleProjection({
      ...options,
      latestPublicationRow,
      publishedBaselineNodeIds,
      readinessByNodeId,
    });
  const activeNodeViews = resolveActiveNodeViews({
    ...options,
    publicationRows: publishedBaselineNodeIds.length > 0 ? [{
      publication_epoch:
        latestPublishedPublicationRow?.publicationEpoch ||
        latestPublicationRow?.publicationEpoch ||
        1,
      status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: publishedBaselineNodeIds,
    }] : [],
    latestPublicationRow:
      publishedBaselineNodeIds.length > 0 ? {
        publication_epoch:
          latestPublishedPublicationRow?.publicationEpoch ||
          latestPublicationRow?.publicationEpoch ||
          1,
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: publishedBaselineNodeIds,
      } : null,
    readinessByNodeId,
    allowControlPlaneRecoveryEligibleProjection: allowRecoveryEligibleProjection,
  });
  const projectionDiagnostics = buildProjectionDiagnosticsSummary(
    activeNodeViews,
  );
  const projectedServingNodeIds = normalizeNodeIdList(
    activeNodeViews.projectedServingNodeIds ||
      activeNodeViews.projectedActiveNodeIds,
  );
  const locallyEligibleNodeIds = normalizeNodeIdList(
    activeNodeViews.locallyEligibleNodeIds || projectedServingNodeIds,
  );
  const recoveryEpochByNodeId = buildLatestRecoveryEpochByNodeId(
    options.recoveryEpochsByNodeId,
  );
  const promotableNodeIds = projectedServingNodeIds.filter((nodeId) =>
    !publishedBaselineNodeIds.includes(nodeId) &&
    isReadinessPromotable(readinessByNodeId[nodeId]),
  );
  const publishedActiveNodeIds = normalizeNodeIdList(
    Array.isArray(options.publishedActiveNodeIds) ?
      options.publishedActiveNodeIds :
      publishedBaselineNodeIds.length > 0 ?
        [...publishedBaselineNodeIds, ...promotableNodeIds] :
        resolveObservedActiveNodeIds({
          ...options,
          readinessByNodeId,
        }),
  );
  const requiredAckNodeIds = normalizeNodeIdList(
    Array.isArray(options.requiredAckNodeIds) ?
      options.requiredAckNodeIds :
      publishedActiveNodeIds,
  );
  const sourceTopologyEpoch = normalizePositiveInteger(
    options.sourceTopologyEpoch,
    null,
  );
  const sourceSnapshotVersion = normalizePositiveInteger(
    options.sourceSnapshotVersion,
    null,
  );
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
    {
      requiredDistinctNodeCount: Math.min(
        PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
        locallyEligibleNodeIds.length,
      ),
      readyEligibleNodeCount: locallyEligibleNodeIds.length,
    },
  ) || buildDerivedPriorityPartitionSummary({
    serviceRows: options.serviceRows,
    partitionRows: options.partitionRows,
    readinessByNodeId,
    projectedServingNodeIds,
    locallyEligibleNodeIds,
    publishedActiveNodeIds,
  });
  const reasonCode =
    typeof options.reasonCode === TYPEOF.STRING && options.reasonCode.length > 0 ?
      options.reasonCode :
      'authoritative_membership_changed';
  const membershipLifecycleSummary =
    options.membershipLifecycleSummary &&
      typeof options.membershipLifecycleSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(options.membershipLifecycleSummary) :
      buildMembershipLifecycleSummary({
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds,
        projectedServingNodeIds,
        locallyEligibleNodeIds,
        suspectedOrTransitioningNodeIds:
          activeNodeViews.suspectedOrTransitioningNodeIds,
        memberStatesByNodeId: buildPublishedMemberStates({
          publishedBaselineNodeIds,
          desiredPublishedNodeIds: publishedActiveNodeIds,
          projectedServingNodeIds,
          suspectedOrTransitioningNodeIds:
            activeNodeViews.suspectedOrTransitioningNodeIds,
          recoveryEpochByNodeId,
        }),
        recoveryEpochByNodeId: Object.keys(recoveryEpochByNodeId)
          .reduce((accumulator, nodeId) => {
            accumulator[nodeId] = recoveryEpochByNodeId[nodeId].epochId;
            return accumulator;
          }, {}),
        membershipFreeze: activeNodeViews.membershipFreeze,
        projectionDiagnostics,
      });
  const baselineEpoch = normalizePositiveInteger(
    latestPublicationRow?.publicationEpoch,
    0,
  );
  const changed =
    !latestPublicationRow ||
    !listEquals(
      latestPublicationRow.publishedActiveNodeIds,
      publishedActiveNodeIds,
    ) ||
    didOptionalSourceVersionChange(
      latestPublicationRow.sourceTopologyEpoch,
      sourceTopologyEpoch,
    ) ||
    didOptionalSourceVersionChange(
      latestPublicationRow.sourceSnapshotVersion,
      sourceSnapshotVersion,
    );
  const priorityPartitionSummaryChanged =
    !arePriorityPartitionSummariesEqual(
      latestPublicationRow?.priorityPartitionSummary,
      priorityPartitionSummary,
    );

  return {
    publicationKind: MEMBERSHIP_PUBLICATION_KIND,
    publicationEpoch: changed ? baselineEpoch + 1 : Math.max(baselineEpoch, 1),
    publisherNodeId: String(options.publisherNodeId || ''),
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds: normalizeNodeIdList(options.acknowledgedNodeIds),
    priorityPartitionSummary,
    membershipLifecycleSummary,
    reasonCode,
    changed,
    priorityPartitionSummaryChanged,
  };
}

function deriveMembershipPublicationId(candidate = {}) {
  const fingerprint = JSON.stringify({
    publicationKind: String(
      candidate.publicationKind || MEMBERSHIP_PUBLICATION_KIND,
    ),
    publicationEpoch: normalizePositiveInteger(candidate.publicationEpoch, 1),
    sourceTopologyEpoch: normalizePositiveInteger(
      candidate.sourceTopologyEpoch,
      null,
    ),
    sourceSnapshotVersion: normalizePositiveInteger(
      candidate.sourceSnapshotVersion,
      null,
    ),
    publishedActiveNodeIds: normalizeNodeIdList(candidate.publishedActiveNodeIds),
    requiredAckNodeIds: normalizeNodeIdList(candidate.requiredAckNodeIds),
  });
  const digest = createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .slice(0, 24);
  return 'membership-publication:' +
    normalizePositiveInteger(candidate.publicationEpoch, 1) +
    ':' +
    digest;
}

function buildMembershipPublicationRow(options = {}) {
  const candidate = options.candidate || {};
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const status = String(
    options.status || MEMBERSHIP_PUBLICATION_STATUS.OPEN,
  ).toUpperCase();
  const transitionHistory = Array.isArray(options.transitionHistory) ?
    options.transitionHistory.slice() :
    [buildTransitionHistoryEntry({
      state: status,
      reasonCode: candidate.reasonCode,
      at: nowMs,
    })];

  return {
    publication_id: String(
      options.publicationId ||
      deriveMembershipPublicationId(candidate) ||
      uuidv4(),
    ),
    publication_kind: String(
      candidate.publicationKind || MEMBERSHIP_PUBLICATION_KIND,
    ),
    publication_epoch: normalizePositiveInteger(candidate.publicationEpoch, 1),
    publisher_node_id: String(candidate.publisherNodeId || ''),
    source_topology_epoch: normalizePositiveInteger(
      candidate.sourceTopologyEpoch,
      null,
    ),
    source_snapshot_version: normalizePositiveInteger(
      candidate.sourceSnapshotVersion,
      null,
    ),
    published_active_node_ids: normalizeNodeIdList(
      candidate.publishedActiveNodeIds,
    ),
    required_ack_node_ids: normalizeNodeIdList(candidate.requiredAckNodeIds),
    acknowledged_node_ids: normalizeNodeIdList(
      candidate.acknowledgedNodeIds,
    ),
    priority_partition_summary:
      candidate.priorityPartitionSummary &&
        typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT ?
        candidate.priorityPartitionSummary :
        null,
    membership_lifecycle_summary:
      candidate.membershipLifecycleSummary &&
        typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT ?
        candidate.membershipLifecycleSummary :
        buildMembershipLifecycleSummary({
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
          publishedActiveNodeIds: candidate.publishedActiveNodeIds,
        }),
    status,
    reason_code: String(candidate.reasonCode || ''),
    created_at: nowMs,
    updated_at: nowMs,
    published_at:
      status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? nowMs : null,
    closed_at:
      status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? nowMs : null,
    transition_history: transitionHistory,
  };
}

function serializeMembershipPublicationRow(publicationRow = {}) {
  return serializeControlPlanePublicationRow(publicationRow);
}

function acknowledgeMembershipPublication(options = {}) {
  const publicationRow = options.publicationRow || {};
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const nodeId = String(options.nodeId || '').trim();
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const requiredAckNodeIds = normalizedPublication.requiredAckNodeIds;
  if (nodeId && !requiredAckNodeIds.includes(nodeId)) {
    return {
      ...publicationRow,
      acknowledged_node_ids: normalizedPublication.acknowledgedNodeIds,
      updated_at: nowMs,
      transition_history: [
        ...(Array.isArray(publicationRow.transition_history) ?
          publicationRow.transition_history :
          normalizedPublication.transitionHistory),
      ],
    };
  }
  if (hasPublicationTimedOut(publicationRow, options)) {
    return abandonMembershipPublication({
      publicationRow,
      nowMs,
      reasonCode: options.timeoutReasonCode,
    });
  }
  const acknowledgedNodeIds = normalizeNodeIdList([
    ...normalizedPublication.acknowledgedNodeIds,
    nodeId,
  ]);
  const isDuplicate = listEquals(
    acknowledgedNodeIds,
    normalizedPublication.acknowledgedNodeIds,
  );
  if (isDuplicate) {
    return {
      ...publicationRow,
      acknowledged_node_ids: acknowledgedNodeIds,
      updated_at: nowMs,
      transition_history: [
        ...(Array.isArray(publicationRow.transition_history) ?
          publicationRow.transition_history :
          normalizedPublication.transitionHistory),
      ],
    };
  }

  const allAcknowledged = listEquals(
    acknowledgedNodeIds,
    requiredAckNodeIds,
  );
  const nextStatus = allAcknowledged ?
    MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED :
    MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING;
  const transitionHistory = [
    ...(Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory),
    buildTransitionHistoryEntry({
      state: nextStatus,
      reasonCode: allAcknowledged ?
        'required_acknowledgements_completed' :
        'acknowledgement_recorded',
      at: nowMs,
      metadata: {
        nodeId,
      },
    }),
  ];
  const nextLifecycleState = allAcknowledged ?
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE :
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
  const publishedNodeIdsForState = normalizedPublication.publishedActiveNodeIds
    .length > 0 ?
    normalizedPublication.publishedActiveNodeIds :
    normalizedPublication.requiredAckNodeIds;

  return {
    ...publicationRow,
    acknowledged_node_ids: acknowledgedNodeIds,
    status: nextStatus,
    updated_at: nowMs,
    published_at: allAcknowledged ? nowMs : publicationRow.published_at || null,
    closed_at: allAcknowledged ? nowMs : publicationRow.closed_at || null,
    membership_lifecycle_summary: buildMembershipLifecycleSummary({
      lifecycleState: nextLifecycleState,
      publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
      projectedServingNodeIds:
        normalizedPublication.membershipLifecycleSummary?.projectedServingNodeIds,
      locallyEligibleNodeIds:
        normalizedPublication.membershipLifecycleSummary?.locallyEligibleNodeIds,
      suspectedOrTransitioningNodeIds:
        normalizedPublication.membershipLifecycleSummary?.suspectedOrTransitioningNodeIds,
      memberStatesByNodeId:
        allAcknowledged ?
          buildServingMemberStatesByNodeId(
            normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
            publishedNodeIdsForState,
          ) :
          normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
      recoveryEpochByNodeId:
        normalizedPublication.membershipLifecycleSummary?.recoveryEpochByNodeId,
      membershipFreeze:
        normalizedPublication.membershipLifecycleSummary?.membershipFreeze,
    }),
    transition_history: transitionHistory,
  };
}

class MembershipPublicationCoordinator {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.controlPlanePublicationsOwner =
      options.controlPlanePublicationsOwner || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.workflowCoordinator =
      options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
      });
    this.publicationReconcileLane =
      options.publicationReconcileLane ||
      new OperationLane({
        name: 'membership-publication-reconcile',
        workflowCoordinator: this.workflowCoordinator,
      });
    this.publicationAcknowledgementLane =
      options.publicationAcknowledgementLane ||
      new OperationLane({
        name: 'membership-publication-acknowledgement',
        workflowCoordinator: this.workflowCoordinator,
      });
    this.reconcileQueue =
      options.reconcileQueue ||
      new OwnerKeyReconcileQueue({
        name: MEMBERSHIP_PUBLICATION_OWNER_KEY,
        reconcileFn: async (_ownerKey, _reasons, context) =>
          this.reconcileClusterMembership(context || {}),
      });
  }

  buildOwnerKey(publicationKind = MEMBERSHIP_PUBLICATION_KIND) {
    return `membership-publication:${publicationKind}`;
  }

  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      now: this.now,
    });
    return this.authoritativeControlPlaneView;
  }

  async readTableRows(tableName, options = {}) {
    const preloadedRows = options.preloadedRows;
    if (Array.isArray(preloadedRows) &&
        (preloadedRows.length > NUM.ZERO ||
          options.allowEmptyPreloadedRows === true)) {
      return preloadedRows;
    }
    const preferAuthoritativeRead =
      options.preferAuthoritativeRead === true ||
      options.requireAuthoritative === true;

    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
        preferAuthoritativeRead !== true &&
        this.controlPlanePublicationsOwner &&
        typeof this.controlPlanePublicationsOwner.listPublicationsFromCache ===
          TYPEOF.FUNCTION) {
      const cachedPublicationRows = normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublicationsFromCache(
          options,
        ),
      );
      if (cachedPublicationRows.length > 0 ||
          typeof this.controlPlanePublicationsOwner.listPublications !==
            TYPEOF.FUNCTION) {
        return cachedPublicationRows;
      }
    }

    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
        this.controlPlanePublicationsOwner &&
        typeof this.controlPlanePublicationsOwner.listPublications ===
          TYPEOF.FUNCTION) {
      const publicationReadOptions = buildPublicationReadOptions(options);
      return normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublications(
          publicationReadOptions,
        ),
      );
    }

    const view = this.getAuthoritativeControlPlaneView();
    if (view && typeof view.readRows === TYPEOF.FUNCTION && view.canRead()) {
      const result = await view.readRows(
        tableName,
        `SELECT * FROM ${tableName}`,
        [],
        options,
      );
      return normalizeTableRowsResult(result);
    }

    if (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION) {
      return this.systemTableCache.getAll(tableName) || [];
    }

    return [];
  }

  async getLatestPublicationRow(options = {}) {
    const publicationRows = await this.readTableRows(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      {
        ...options,
        preloadedRows: options.publicationRows,
      },
    );
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[0] || null;
  }

  getLatestPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ?
      options.publicationRows :
      null;
    const publicationRows = preloadedRows ||
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[0] || null;
  }

  async getLatestClusterPublication(options = {}) {
    return this.getLatestPublicationRow(options);
  }

  getLatestClusterPublicationSync(options = {}) {
    return this.getLatestPublicationRowSync(options);
  }

  async getLatestPublishedPublicationRow(options = {}) {
    const publicationRows = await this.readTableRows(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      {
        ...options,
        preloadedRows: options.publicationRows,
      },
    );
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) =>
        row.publicationKind === MEMBERSHIP_PUBLICATION_KIND &&
        row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      )
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[0] || null;
  }

  getLatestPublishedPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ?
      options.publicationRows :
      null;
    const publicationRows = preloadedRows ||
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) =>
        row.publicationKind === MEMBERSHIP_PUBLICATION_KIND &&
        row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      )
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[0] || null;
  }

  async getLatestPublishedClusterPublication(options = {}) {
    return this.getLatestPublishedPublicationRow(options);
  }

  getLatestPublishedClusterPublicationSync(options = {}) {
    return this.getLatestPublishedPublicationRowSync(options);
  }

  async getLatestPublicationForNode(nodeId, options = {}) {
    const latestPublicationRow = await this.getLatestPublicationRow(options);
    if (!latestPublicationRow) {
      return null;
    }
    const normalizedNodeId = String(nodeId || '');
    if (!normalizedNodeId) {
      return latestPublicationRow;
    }
    const publishedActiveNodeIds = Array.isArray(
      latestPublicationRow.publishedActiveNodeIds,
    ) ? latestPublicationRow.publishedActiveNodeIds : [];
    const requiredAckNodeIds = Array.isArray(
      latestPublicationRow.requiredAckNodeIds,
    ) ? latestPublicationRow.requiredAckNodeIds : [];
    return publishedActiveNodeIds.includes(normalizedNodeId) ||
      requiredAckNodeIds.includes(normalizedNodeId) ?
      latestPublicationRow :
      latestPublicationRow;
  }

  getLatestPublicationForNodeSync(nodeId, options = {}) {
    const latestPublicationRow = this.getLatestPublicationRowSync(options);
    if (!latestPublicationRow) {
      return null;
    }
    const normalizedNodeId = String(nodeId || '');
    if (!normalizedNodeId) {
      return latestPublicationRow;
    }
    const publishedActiveNodeIds = Array.isArray(
      latestPublicationRow.publishedActiveNodeIds,
    ) ? latestPublicationRow.publishedActiveNodeIds : [];
    const requiredAckNodeIds = Array.isArray(
      latestPublicationRow.requiredAckNodeIds,
    ) ? latestPublicationRow.requiredAckNodeIds : [];
    return publishedActiveNodeIds.includes(normalizedNodeId) ||
      requiredAckNodeIds.includes(normalizedNodeId) ?
      latestPublicationRow :
      latestPublicationRow;
  }

  async deriveClusterMembershipCandidate(options = {}) {
    const latestPublicationRow =
      options.latestPublicationRow || await this.getLatestPublicationRow(options);
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (String(latestPublicationRow?.status || '').toUpperCase() ===
        MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        await this.getLatestPublishedPublicationRow(options));
    const nodeRows = await this.readTableRows(TABLES.NODES, {
      ...options,
      preloadedRows: options.nodeRows,
    });
    const nodeEndpointRows = await this.readTableRows(TABLES.NODE_ENDPOINTS, {
      ...options,
      preloadedRows: options.nodeEndpointRows,
    });
    const serviceRows = await this.readTableRows(TABLES.SERVICES, {
      ...options,
      preloadedRows: options.serviceRows,
    });
    const partitionRows = await this.readTableRows(TABLES.PARTITIONS, {
      ...options,
      preloadedRows: options.partitionRows,
    });
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      (this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getAllNodeReadiness === TYPEOF.FUNCTION ?
        await this.controlPlaneReadinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh: false,
        }) :
        []);
    const recoveryEpochsByNodeId =
      options.recoveryEpochsByNodeId ||
      (this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId ===
        TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() :
        null);

    return deriveMembershipPublicationCandidate({
      ...options,
      latestPublicationRow,
      latestPublishedPublicationRow,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      nodeRows,
      nodeEndpointRows,
      serviceRows,
      partitionRows,
      readinessEntries,
      recoveryEpochsByNodeId,
      nowMs: normalizePositiveInteger(options.nowMs, this.now()),
    });
  }

  async ensureWorkflow(ownerKey, candidate) {
    const existingWorkflow = this.workflowCoordinator.getWorkflowByOwnerKey(
      ownerKey,
    );
    if (existingWorkflow) {
      return existingWorkflow;
    }

    return this.workflowCoordinator.registerWorkflow({
      workflowId: `membership-publication:${candidate.publicationEpoch}`,
      ownerKey,
      step: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.IDLE,
      metadata: {
        publicationKind: candidate.publicationKind,
      },
      transitionHistory: [],
    });
  }

  async persistPublicationRow(row, options = {}) {
    let persistedRow = serializeMembershipPublicationRow(row);
    if (this.controlPlanePublicationsOwner &&
        typeof this.controlPlanePublicationsOwner.upsertPublication ===
          TYPEOF.FUNCTION) {
      const publicationId = persistedRow.publication_id || null;
      const canVerifyPersistedRow = publicationId &&
        typeof this.controlPlanePublicationsOwner.getPublication ===
          TYPEOF.FUNCTION;
      const maxAttempts = normalizePositiveInteger(
        options.publicationWriteMaxAttempts,
        PUBLICATION_WRITE_MAX_ATTEMPTS,
      );
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (canVerifyPersistedRow) {
          const currentRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(options),
          );
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(persistedRow, currentRow),
          );
        }
        try {
          await this.controlPlanePublicationsOwner.upsertPublication(
            persistedRow,
            options,
          );
        } catch (error) {
          if (!canVerifyPersistedRow || attempt + 1 >= maxAttempts) {
            throw error;
          }
          const durableRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(options),
          );
          if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
            return serializeMembershipPublicationRow(
              mergePublicationRows(durableRow, persistedRow),
            );
          }
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(durableRow, persistedRow),
          );
          continue;
        }
        if (!canVerifyPersistedRow) {
          return persistedRow;
        }
        const durableRow = await this.controlPlanePublicationsOwner.getPublication(
          publicationId,
          buildPublicationReadOptions(options),
        );
        if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
          return serializeMembershipPublicationRow(
            mergePublicationRows(durableRow, persistedRow),
          );
        }
        persistedRow = serializeMembershipPublicationRow(
          mergePublicationRows(durableRow, persistedRow),
        );
      }
    }
    return persistedRow;
  }

  async acknowledgePublication(publicationId, nodeId, options = {}) {
    return this.publicationAcknowledgementLane.run(
      {
        ownerKey: `${this.buildOwnerKey()}:ack:${publicationId}`,
      },
      async () => {
        let existingRow = null;
        if (this.controlPlanePublicationsOwner &&
            typeof this.controlPlanePublicationsOwner.getPublication ===
              TYPEOF.FUNCTION) {
          existingRow =
            await this.controlPlanePublicationsOwner.getPublication(
              publicationId,
              buildPublicationReadOptions(options),
            );
        }
        const baseRow = mergePublicationRows(existingRow, options.publicationRow || null);
        if (!baseRow) {
          return null;
        }
        const normalizedBaseRow = normalizeControlPlanePublicationRow(baseRow);
        const acknowledgedRow = acknowledgeMembershipPublication({
          publicationRow: baseRow,
          nodeId,
          nowMs: this.now(),
          timeoutMs: options.timeoutMs,
          timeoutReasonCode: options.timeoutReasonCode,
        });
        const normalizedAcknowledgedRow = normalizeControlPlanePublicationRow(
          acknowledgedRow,
        );
        const acknowledgementChanged =
          normalizedAcknowledgedRow.status !== normalizedBaseRow.status ||
          !listEquals(
            normalizedAcknowledgedRow.acknowledgedNodeIds,
            normalizedBaseRow.acknowledgedNodeIds,
          );
        if (!acknowledgementChanged) {
          return acknowledgedRow;
        }
        return this.persistPublicationRow(acknowledgedRow, options);
      },
    );
  }

  async reconcileClusterMembership(options = {}) {
    const ownerKey = this.buildOwnerKey();
    return this.publicationReconcileLane.run(
      {ownerKey},
      async () => this.workflowCoordinator.runExclusive(ownerKey, async () => {
        const latestPublicationRow =
          options.latestPublicationRow ||
          await this.getLatestPublicationRow(options);
        const latestPublishedPublicationRow =
          options.latestPublishedPublicationRow ||
          (String(latestPublicationRow?.status || '').toUpperCase() ===
            MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
            latestPublicationRow :
            await this.getLatestPublishedPublicationRow(options));
        const candidate = await this.deriveClusterMembershipCandidate({
          ...options,
          latestPublicationRow,
          latestPublishedPublicationRow,
        });
        const workflow = await this.ensureWorkflow(ownerKey, candidate);

        if (latestPublicationRow && candidate.changed !== true) {
          if (candidate.priorityPartitionSummaryChanged === true &&
              candidate.priorityPartitionSummary &&
              typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT) {
            const refreshedRow = buildPriorityPartitionSummaryRefreshRow({
              publicationRow: latestPublicationRow,
              priorityPartitionSummary: candidate.priorityPartitionSummary,
              nowMs: this.now(),
            });
            const persistedRow = await this.persistPublicationRow(
              refreshedRow,
              options,
            );
            return {
              candidate,
              publicationRow: normalizeControlPlanePublicationRow(
                persistedRow,
              ),
              workflow,
            };
          }
          return {
            candidate,
            publicationRow:
              String(latestPublicationRow.status || '').toUpperCase() ===
                MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
              !latestPublishedPublicationRow ?
                latestPublicationRow :
                latestPublishedPublicationRow,
            workflow,
          };
        }

        await this.workflowCoordinator.transitionStep(workflow.workflowId, {
          nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.DERIVING,
          reason: PUBLICATION_WORKFLOW_REASON.DERIVE_MEMBERSHIP_PUBLICATION,
          metadata: {
            publicationEpoch: candidate.publicationEpoch,
          },
        });

        const row = buildMembershipPublicationRow({
          publicationId: options.publicationId,
          candidate,
          nowMs: this.now(),
        });
        await this.persistPublicationRow(row, options);

        await this.workflowCoordinator.transitionStep(workflow.workflowId, {
          nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN,
          reason: PUBLICATION_WORKFLOW_REASON.PERSIST_OPEN_PUBLICATION,
          metadata: {
            publicationId: row.publication_id,
            publicationEpoch: row.publication_epoch,
          },
        }, {
          metadata: {
            publicationId: row.publication_id,
            publicationEpoch: row.publication_epoch,
          },
        });

        return {
          candidate,
          publicationRow: row,
          workflow,
        };
      }),
    );
  }

  getLaneDiagnostics() {
    const inFlightExecutions =
      this.workflowCoordinator?.inFlightExecutionsByOwnerKey instanceof Map ?
        this.workflowCoordinator.inFlightExecutionsByOwnerKey :
        new Map();
    return Object.freeze({
      reconcileLane: Object.freeze({
        name: this.publicationReconcileLane?.name || null,
        activeExecutionCount: inFlightExecutions.has(this.buildOwnerKey()) ? 1 : 0,
      }),
      acknowledgementLane: Object.freeze({
        name: this.publicationAcknowledgementLane?.name || null,
        activeExecutionCount: [...inFlightExecutions.keys()].filter((ownerKey) =>
          String(ownerKey).startsWith(`${this.buildOwnerKey()}:ack:`),
        ).length,
      }),
    });
  }

  enqueueClusterMembershipReconcile(reason = 'manual', context = {}, options = {}) {
    return this.reconcileQueue.enqueue(
      this.buildOwnerKey(),
      reason,
      context,
      options,
    );
  }
}

export {
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_OWNER_KEY,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  MembershipPublicationCoordinator,
  acknowledgeMembershipPublication,
  abandonMembershipPublication,
  buildMembershipPublicationRow,
  buildTransitionHistoryEntry,
  deriveMembershipPublicationCandidate,
  hasPublicationTimedOut,
};
