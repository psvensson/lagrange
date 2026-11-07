import {
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  TABLES,
} from '../constants/index.js';
import {CDC_PROPAGATED_TABLES} from '../cache/cdc-table-policy.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  normalizeControlPlanePublicationRow,
  normalizeNodeRow,
} from './system-row-normalizers.js';
import {hasPriorityRecoverySpreadGap} from './priority-recovery-planning-intent.js';
import {buildDerivedPriorityPartitionSummary} from './membership-publication-priority-partition-summary.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_STATUS,
} from './membership-publication-row-contract.js';
import {
  listEquals,
  normalizeNodeIdList,
} from './membership-publication-row-helpers.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

// Owner-driven membership liveness (Workstream A). A dedicated always-on interval
// — started UNCONDITIONALLY, independent of metadata-publication readiness so it
// cannot be gated behind the very progress it exists to create — drives the
// membership reconcile on the partition leader. Each drive is timeout-bounded so a
// slow/doomed reconcile can never wedge the in-flight guard.
const OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS = 5000;
// Owner decision 2026-10-04 (decision 4): a decision held on a lagging durable
// priority summary (the stale-member steady trim, the published-convergence
// gate) takes ONE extra reconcile hop after the refresh write. That hop is
// ended by the write itself, never by the owner-driver timer.
const PRIORITY_SUMMARY_REFRESHED_REASON = 'priority_summary_refreshed';

const OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS = 15000; // ends-on: the reconcileActiveGateMembershipPublication() drive resolves
const OWNER_MEMBERSHIP_RECONCILE_WAIT = Object.freeze({
  wait: 'OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS',
  awaited: 'the owner-driven reconcileActiveGateMembershipPublication() ' +
    'drive resolves',
  boundMs: OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS,
});

const OWNER_MEMBERSHIP_DRIVER_ERROR_MSG =
  'Owner-driven membership reconcile error';
const OWNER_MEMBERSHIP_DRIVER_RAN_MSG =
  'DIAG owner-membership driver ran as leader (predicate true)';
const OWNER_MEMBERSHIP_DRIVER_PREDICATE_MSG =
  'DIAG owner-membership driver predicate (am I the owner?)';
const OWNER_MEMBERSHIP_DRIVER_SNAP_MSG =
  'DIAG owner-membership driver planning snapshot';
const MEMBERSHIP_MULTI_PARTITION_MSG =
  'CRITICAL: control_plane_publications has >1 partition — membership ' +
  'single-source-of-truth assumption violated (see B1 non-split policy)';

const MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG =
  'Membership reconcile deferred: not the control_plane_publications write-leader';
const NOT_PUBLICATIONS_WRITE_LEADER_REASON = 'not_publications_write_leader';
const EMPTY_PUBLICATION_CANDIDATE_REASON =
  'publication_candidate_has_no_members';

const MEMBERSHIP_DEFERRED_PUBLICATIONS_CATCHUP_FAILED_MSG =
  'Deferred non-write-leader publications cache catch-up failed';
const DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS = 5000;

const MEMBERSHIP_DEFERRED_PROPAGATED_CATCHUP_FAILED_MSG =
  'Deferred non-write-leader propagated cache catch-up failed';
const DEFERRED_PROPAGATED_CATCHUP_COOLDOWN_MS = 30000;
const DEFERRED_PROPAGATED_CATCHUP_MAX_ATTEMPTS_PER_TABLE = 1;
const DEFERRED_PROPAGATED_CATCHUP_OUTCOME = Object.freeze({
  CATCHUP_UNAVAILABLE:
    Object.freeze({swept: false, reason: 'catchup_unavailable'}),
  COOLDOWN_ACTIVE: Object.freeze({swept: false, reason: 'cooldown_active'}),
  READ_FAILED: Object.freeze({swept: false, reason: 'authoritative_read_failed'}),
});
const DEFERRED_PROPAGATED_CATCHUP_ROUTING_TABLES = Object.freeze([
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.NODES,
  TABLES.MESSAGE_GROUPS,
  TABLES.TABLES,
  TABLES.NODE_ENDPOINTS,
]);
const DEFERRED_PROPAGATED_CATCHUP_TABLES = Object.freeze(
  DEFERRED_PROPAGATED_CATCHUP_ROUTING_TABLES.filter(
    (tableName) => tableName !== TABLES.CONTROL_PLANE_PUBLICATIONS &&
      CDC_PROPAGATED_TABLES.includes(tableName),
  ),
);

const CONVERGENCE_DECISION_TRACE_MSG = 'convergence decision trace';
const CONVERGENCE_TRACE_LEVEL = 'info';
const CONVERGENCE_DECISION = Object.freeze({
  DRIVE: 'drive',
  SKIP: 'skip',
  DEFER: 'defer',
});
const CONVERGENCE_REASON = Object.freeze({
  NOT_OWNER: 'not-owner',
  NO_SNAPSHOT: 'no-snapshot',
  NO_DEFICIT: 'no-deficit',
  DRIVEN: 'driven',
  IN_FLIGHT: 'reconcile-in-flight',
  ERROR: 'error',
  NOT_WRITE_LEADER: 'not-publications-write-leader',
  EMPTY_CANDIDATE: 'empty-publication-candidate',
});
const CONVERGENCE_OUTCOME = Object.freeze({
  RECONCILE_COMMITTED: 'reconcile-committed',
  RECONCILE_TIMED_OUT: 'reconcile-timed-out',
  NONE: 'none',
});

const OWNER_ACK_COMPLETION_REDRIVE_STATUSES = Object.freeze([
  MEMBERSHIP_PUBLICATION_STATUS.OPEN,
  MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING,
]);

function hasPrioritySummaryRefreshClearedGap(latestPublicationRow, candidate) {
  return hasPriorityRecoverySpreadGap(
    normalizeControlPlanePublicationRow(latestPublicationRow)
      ?.priorityPartitionSummary,
  ) && !hasPriorityRecoverySpreadGap(candidate?.priorityPartitionSummary);
}

function normalizeLowercaseStatus(row) {
  return String(
    row?.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
  ).toLowerCase();
}

function isInProgressServiceStatus(status) {
  return (
    status.length > 0 &&
    status !== SERVICE_STATUS.ACTIVE &&
    status !== SERVICE_STATUS.STOPPED &&
    status !== SERVICE_LIFECYCLE_STATE.FAILED
  );
}

function hasInProgressServiceRows(serviceRows) {
  return serviceRows.some((row) =>
    isInProgressServiceStatus(normalizeLowercaseStatus(row)),
  );
}

function extractActiveNodeIds(nodeRows) {
  return normalizeNodeIdList(
    nodeRows
      .map((row) => normalizeNodeRow(row))
      .filter((row) => row.status === SERVICE_STATUS.ACTIVE)
      .map((row) => row.nodeId),
  );
}

function readLatestCachedPublicationActiveNodeIds(systemTableCache) {
  const publicationRows =
    systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [];
  let latestRow = null;
  for (const row of publicationRows) {
    const normalized = normalizeControlPlanePublicationRow(row);
    if (normalized?.publicationKind !== MEMBERSHIP_PUBLICATION_KIND) {
      continue;
    }
    if (
      !latestRow ||
      (normalized.publicationEpoch || 0) > (latestRow.publicationEpoch || 0)
    ) {
      latestRow = normalized;
    }
  }
  return normalizeNodeIdList(latestRow?.publishedActiveNodeIds);
}

function hasLocalServicesConvergenceGap(systemTableCache) {
  if (typeof systemTableCache?.getAll !== 'function') {
    return false;
  }
  const serviceRows = systemTableCache.getAll(TABLES.SERVICES) || [];
  if (hasInProgressServiceRows(serviceRows)) {
    return true;
  }
  const locallyEligibleNodeIds = extractActiveNodeIds(
    systemTableCache.getAll(TABLES.NODES) || [],
  );
  const publishedActiveNodeIds =
    readLatestCachedPublicationActiveNodeIds(systemTableCache);
  const eligibleNodeCount = normalizeNodeIdList([
    ...locallyEligibleNodeIds,
    ...publishedActiveNodeIds,
  ]).length;
  const partitionRows = systemTableCache.getAll(TABLES.PARTITIONS) || [];
  if (eligibleNodeCount <= 1 || partitionRows.length === 0) {
    return false;
  }
  return hasPriorityRecoverySpreadGap(
    buildDerivedPriorityPartitionSummary({
      partitionRows,
      serviceRows,
      locallyEligibleNodeIds,
      publishedActiveNodeIds,
    }),
  );
}

function resolveDeferredPropagatedCatchupCooldownMs(
  systemTableCache,
  cdcIntegrationService,
) {
  if (
    typeof cdcIntegrationService?.canWriteSystemTableLocally === 'function' &&
    cdcIntegrationService.canWriteSystemTableLocally(TABLES.SERVICES) === true
  ) {
    return DEFERRED_PROPAGATED_CATCHUP_COOLDOWN_MS;
  }
  return hasLocalServicesConvergenceGap(systemTableCache) ?
    DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS :
    DEFERRED_PROPAGATED_CATCHUP_COOLDOWN_MS;
}

// The owner drive's bound was spent: the driver carries on unchanged (the
// next interval drives again); this only makes the expiry visible, once per
// node and observed state within the reporter's fold window.
function reportOwnerMembershipReconcileSpent(coordinator, startedAtMs, observed) {
  reportWaitBoundSpent(coordinator.logger, {
    ...OWNER_MEMBERSHIP_RECONCILE_WAIT,
    elapsedMs: Date.now() - startedAtMs,
    subject: coordinator.nodeId ?? null,
    lastObserved: observed,
    scope: {nodeId: coordinator.nodeId ?? null},
  });
}

// Phase 4: defer the membership reconcile when this node is NOT the
// control_plane_publications write-leader (leader-driven mode, unconditional
// since 2026-07-02 — validated by the dt4 full-chain and dt6 publication
// failback/ack-recovery/quorum-failback reproducers). Fail CLOSED on a missing
// or throwing predicate so a coordinator never drives a reconcile without
// proven write-leader authority.
function shouldDeferMembershipReconcileToWriteLeader(coordinator) {
  if (
    !coordinator ||
    typeof coordinator.resolveIsControlPlanePublicationsWriteLeader !==
      'function'
  ) {
    return true;
  }
  try {
    return coordinator.resolveIsControlPlanePublicationsWriteLeader() !== true;
  } catch {
    return true;
  }
}

function hasCandidateAcknowledgementRefresh(latestPublicationRow, candidate = {}) {
  const normalizedLatestPublication =
    normalizeControlPlanePublicationRow(latestPublicationRow);
  return Array.isArray(candidate.acknowledgedNodeIds) &&
    !listEquals(
      normalizedLatestPublication.acknowledgedNodeIds,
      candidate.acknowledgedNodeIds,
    );
}

function hasCandidateStatusRefresh(latestPublicationRow, candidate = {}) {
  const normalizedLatestPublication =
    normalizeControlPlanePublicationRow(latestPublicationRow);
  const candidateStatus =
    typeof candidate.publicationStatus === 'string' ?
      candidate.publicationStatus.toUpperCase() :
      MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
  return candidateStatus.length > 0 &&
    candidateStatus !== normalizedLatestPublication.status;
}

function isNodeAckCompletionEligible(dimensions = {}) {
  if (
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] === true
  ) {
    return true;
  }
  return (
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
      true &&
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true
  );
}

function readReadinessDimensionsForNode(planningSnapshot, nodeId) {
  const readinessByNodeId = planningSnapshot?.readinessByNodeId;
  if (!readinessByNodeId || typeof readinessByNodeId !== 'object') {
    return {};
  }
  return readinessByNodeId[nodeId]?.dimensions || {};
}

function resolveOwnerAckCompletionPendingNodeIds(planningSnapshot) {
  const latestRow = normalizeControlPlanePublicationRow(
    planningSnapshot?.latestPublicationRow,
  );
  if (
    !latestRow ||
    !OWNER_ACK_COMPLETION_REDRIVE_STATUSES.includes(latestRow.status)
  ) {
    return [];
  }
  const requiredAckNodeIds = normalizeNodeIdList(latestRow.requiredAckNodeIds);
  const acknowledgedNodeIds = new Set(
    normalizeNodeIdList(latestRow.acknowledgedNodeIds),
  );
  const pendingAckNodeIds = requiredAckNodeIds.filter(
    (nodeId) => !acknowledgedNodeIds.has(nodeId),
  );
  if (pendingAckNodeIds.length === 0) {
    return [];
  }
  const allEligible = pendingAckNodeIds.every((nodeId) =>
    isNodeAckCompletionEligible(
      readReadinessDimensionsForNode(planningSnapshot, nodeId),
    ),
  );
  return allEligible ? pendingAckNodeIds : [];
}

const EMPTY_RECORD = Object.freeze({});

function toNullable(value) {
  return value === undefined ? null : value;
}

function asRecord(value) {
  return value && typeof value === 'object' ? value : EMPTY_RECORD;
}

function buildHandoffContractCoreTraceFields(contract) {
  const safe = asRecord(contract);
  return {
    contractState: toNullable(safe.state),
    contractReason: toNullable(safe.reasonCode),
    contractNextAction: toNullable(safe.nextAction),
    expectedNodeCount: toNullable(safe.expectedNodeCount),
  };
}

function buildHandoffContractCountTraceFields(contract) {
  const safe = asRecord(contract);
  return {
    publishedActiveNodeCount: toNullable(safe.publishedActiveNodeCount),
    pendingRecoveryCount: toNullable(safe.pendingRecoveryCount),
    pendingReconcileCount: toNullable(safe.pendingReconcileCount),
  };
}

function buildFenceCoreTraceFields(fence) {
  const safe = asRecord(fence);
  return {
    fenceState: toNullable(safe.state),
    fencePromotionAllowed: toNullable(safe.promotionAllowed),
    fenceMissingProofReasons: Array.isArray(safe.missingProofReasons) ?
      safe.missingProofReasons :
      null,
  };
}

function buildFenceSubstateTraceFields(fence) {
  const safe = asRecord(fence);
  const durable = asRecord(safe.durablePublication);
  const snapshotCoverage = asRecord(safe.snapshotCoverage);
  const presence = asRecord(safe.presence);
  return {
    fenceDurablePublicationState: toNullable(durable.state),
    fenceDurablePublicationMissingCount: toNullable(durable.missingNodeCount),
    fenceSnapshotCoverageState: toNullable(snapshotCoverage.state),
    fenceSnapshotCoverageMissingCount: toNullable(
      snapshotCoverage.missingNodeCount,
    ),
    fencePresenceComplete: toNullable(presence.complete),
    fencePresenceMissingCount: toNullable(presence.missingNodeCount),
  };
}

function buildPriorityRecoveryTraceFields(prs) {
  const safe = asRecord(prs);
  const gate = asRecord(safe.publicationRecoveryGate);
  return {
    prioritySpreadPending: toNullable(gate.prioritySpreadPending),
    priorityRecoveryReasonCodes: Array.isArray(safe.priorityRecoveryReasonCodes) ?
      safe.priorityRecoveryReasonCodes :
      toNullable(gate.reasonCodes),
    recoveryProtocolState: toNullable(safe.recoveryProtocolState),
  };
}

function buildPublicationReadinessTraceFields(handoffContract, planningSnapshot) {
  const safeSnapshot = asRecord(planningSnapshot);
  const safeContract = asRecord(handoffContract);
  const prs = toNullable(safeSnapshot.priorityRecoveryPlanningSnapshot);
  const fence = toNullable(safeContract.activeGateCatchupFence);
  return {
    ...buildHandoffContractCoreTraceFields(handoffContract),
    ...buildHandoffContractCountTraceFields(handoffContract),
    ...buildFenceCoreTraceFields(fence),
    ...buildFenceSubstateTraceFields(fence),
    ...buildPriorityRecoveryTraceFields(prs),
  };
}

export {
  CONVERGENCE_DECISION,
  CONVERGENCE_DECISION_TRACE_MSG,
  CONVERGENCE_OUTCOME,
  CONVERGENCE_REASON,
  CONVERGENCE_TRACE_LEVEL,
  DEFERRED_PROPAGATED_CATCHUP_MAX_ATTEMPTS_PER_TABLE,
  DEFERRED_PROPAGATED_CATCHUP_OUTCOME,
  DEFERRED_PROPAGATED_CATCHUP_TABLES,
  DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS,
  EMPTY_PUBLICATION_CANDIDATE_REASON,
  MEMBERSHIP_DEFERRED_PROPAGATED_CATCHUP_FAILED_MSG,
  MEMBERSHIP_DEFERRED_PUBLICATIONS_CATCHUP_FAILED_MSG,
  MEMBERSHIP_MULTI_PARTITION_MSG,
  MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
  OWNER_MEMBERSHIP_DRIVER_ERROR_MSG,
  OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS,
  OWNER_MEMBERSHIP_DRIVER_PREDICATE_MSG,
  OWNER_MEMBERSHIP_DRIVER_RAN_MSG,
  OWNER_MEMBERSHIP_DRIVER_SNAP_MSG,
  OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS,
  PRIORITY_SUMMARY_REFRESHED_REASON,
  buildPublicationReadinessTraceFields,
  hasCandidateAcknowledgementRefresh,
  hasCandidateStatusRefresh,
  hasPrioritySummaryRefreshClearedGap,
  reportOwnerMembershipReconcileSpent,
  resolveDeferredPropagatedCatchupCooldownMs,
  resolveOwnerAckCompletionPendingNodeIds,
  shouldDeferMembershipReconcileToWriteLeader,
};
