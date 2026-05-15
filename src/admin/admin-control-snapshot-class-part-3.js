/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {NUM, TABLES, TYPEOF} from '../constants/index.js';
import {evaluateAuthoritativeRepairPolicy} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
} from './admin-constants.js';
import {
  uniqueSorted,
} from './admin-helpers.js';
import {
  buildActiveMembershipSnapshot,
  resolveActiveNodeViews,
  buildReadinessByNodeId,
  hasCanonicalWebSocketEndpoint,
  hasCanonicalWebSocketEndpoints,
  isCanonicalWebSocketEndpointRow,
  isCanonicallyActiveNode,
} from '../control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../control-plane/control-plane-readiness-constants.js';
import {evaluateSharedMetadataNodeCoverage} from './admin-shared-metadata-consistency.js';
import {
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {AdminControlSnapshotPart2} from './admin-control-snapshot-class-part-2.js';
// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  READY: 'ready',
  UPDATEDAT: 'updatedAt',
  UPDATED_AT: 'updated_at',
  UNKNOWN_ERROR: 'unknown_error',
  PUBLISHED: 'PUBLISHED',
  NODEID: 'nodeId',
  ID: 'id',
  NAME: 'name',
  CAPTUREDAT: 'capturedAt',
  SOURCELEADERNODEID: 'sourceLeaderNodeId',
  DECISIONTIMESTAMP: 'decisionTimestamp',
  FAILEDAT: 'failedAt',
  NEXTATTEMPTAT: 'nextAttemptAt',
  TABLEID: 'tableId',
  TABLE_NAME: 'table_name',
  TABLENAME: 'tableName',
  PARTITIONSTATE: 'partitionState',
  REPLICAID: 'replicaId',
  RAFTROLE: 'raftRole',
  STATUS: 'status',
  ADDRESS: 'address',
  NODE_ID: 'node_id',
  READY_LEASE_EXPIRES_AT: 'ready_lease_expires_at',
  READY_LEASE_EXPIRES_AT_CAMEL: 'readyLeaseExpiresAt',
  REASON_CODE: 'reasonCode',
  REASON_CODES: 'reasonCodes',
  REASONS: 'reasons',
  CODE: 'code',
});
const CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS = 5000;
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
const CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE = Object.freeze({
  AVAILABLE: 'available',
});
const CONTROL_SNAPSHOT_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const CONTROL_SNAPSHOT_RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
const CONTROL_SNAPSHOT_ACTIVE_NODE_VIEW_SOURCE_PUBLICATION_OWNER_TRUTH =
  'publication_owner_truth';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_BUDGET_FIELD =
  'activeGateBudget';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION = 1;
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_STATE = Object.freeze({
  COMPLETE: 'complete',
  DEGRADED: 'degraded',
  PENDING: 'pending',
  UNAVAILABLE: 'unavailable',
});
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_REASON = Object.freeze({
  COMPLETE: 'owner_cohort_complete',
  EXPECTED_COHORT_UNAVAILABLE: 'expected_cohort_unavailable',
  OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
  PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE:
    'published_active_coverage_incomplete',
});
const CONTROL_SNAPSHOT_ACTIVE_GATE_BUDGET_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const CONTROL_SNAPSHOT_ACTIVE_GATE_PENDING_OWNER_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);
function normalizeControlSnapshotNodeIdList(values = ADMIN_CACHE_DUMP.EMPTY) {
  return uniqueSorted(
    (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
      .map((value) =>
        String(value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).trim(),
      )
      .filter((value) => value.length > NUM.ZERO),
  );
}
function normalizeControlSnapshotNodeId(value) {
  const normalizedValue = String(
    value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
  ).trim();
  return normalizedValue.length > NUM.ZERO ? normalizedValue : null;
}
function isControlSnapshotRecord(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value);
}
function normalizeControlSnapshotOptionalString(value) {
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}
function normalizeControlSnapshotOptionalInteger(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}
function resolveControlSnapshotNodeRowId(row) {
  if (!isControlSnapshotRecord(row)) {
    return null;
  }
  return normalizeControlSnapshotNodeId(
    row[ADMIN_CONTROL_SNAPSHOT_LITERAL.NODE_ID] ??
      row[ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID] ??
      row[ADMIN_CONTROL_SNAPSHOT_LITERAL.ID],
  );
}
function resolveControlSnapshotReadyLeaseNodeIds(nodeRows, nowMs) {
  const observedAtMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const readyLeaseNodeIds = [];
  for (const nodeRow of Array.isArray(nodeRows) ? nodeRows : ADMIN_CACHE_DUMP.EMPTY) {
    const nodeId = resolveControlSnapshotNodeRowId(nodeRow);
    if (!nodeId) {
      continue;
    }
    const readyLeaseExpiresAt = Number(
      nodeRow?.[ADMIN_CONTROL_SNAPSHOT_LITERAL.READY_LEASE_EXPIRES_AT] ??
        nodeRow?.[
          ADMIN_CONTROL_SNAPSHOT_LITERAL.READY_LEASE_EXPIRES_AT_CAMEL
        ],
    );
    if (
      Number.isFinite(readyLeaseExpiresAt) &&
      readyLeaseExpiresAt > observedAtMs
    ) {
      readyLeaseNodeIds.push(nodeId);
    }
  }
  return normalizeControlSnapshotNodeIdList(readyLeaseNodeIds);
}
function resolveControlSnapshotReadinessReasonCodes(readinessEntry) {
  if (!isControlSnapshotRecord(readinessEntry)) {
    return ADMIN_CACHE_DUMP.EMPTY;
  }
  const reasonCodes = [
    ...(Array.isArray(
      readinessEntry[ADMIN_CONTROL_SNAPSHOT_LITERAL.REASON_CODES],
    ) ?
      readinessEntry[ADMIN_CONTROL_SNAPSHOT_LITERAL.REASON_CODES] :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(
      readinessEntry[ADMIN_CONTROL_SNAPSHOT_LITERAL.REASONS],
    ) ?
      readinessEntry[ADMIN_CONTROL_SNAPSHOT_LITERAL.REASONS].map((reason) =>
        isControlSnapshotRecord(reason) ?
          reason[ADMIN_CONTROL_SNAPSHOT_LITERAL.CODE] :
          reason,
      ) :
      ADMIN_CACHE_DUMP.EMPTY),
    readinessEntry[ADMIN_CONTROL_SNAPSHOT_LITERAL.REASON_CODE],
  ];
  return normalizeControlSnapshotNodeIdList(reasonCodes);
}
function hasControlSnapshotPendingOwnerWork(readinessEntry) {
  const reasonCodes = resolveControlSnapshotReadinessReasonCodes(
    readinessEntry,
  );
  return CONTROL_SNAPSHOT_ACTIVE_GATE_PENDING_OWNER_REASON_CODES.some(
    (reasonCode) => reasonCodes.includes(reasonCode),
  );
}
function normalizeControlSnapshotPublishedActiveNodeIds(activeNodeViews) {
  return normalizeControlSnapshotNodeIdList(
    Array.isArray(activeNodeViews?.publishedActiveNodeIds) ?
      activeNodeViews.publishedActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY,
  );
}
function resolveControlSnapshotPublicationNodeIds(publicationConvergence) {
  const membershipLifecycleSummary =
    isControlSnapshotRecord(publicationConvergence?.membershipLifecycleSummary) ?
      publicationConvergence.membershipLifecycleSummary :
      null;
  return normalizeControlSnapshotNodeIdList([
    ...(Array.isArray(publicationConvergence?.publishedActiveNodeIds) ?
      publicationConvergence.publishedActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(publicationConvergence?.missingPublishedNodeIds) ?
      publicationConvergence.missingPublishedNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      publicationConvergence.missingPublishedRecoveryActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(publicationConvergence?.recoveryActiveNodeIds) ?
      publicationConvergence.recoveryActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(membershipLifecycleSummary?.publishedActiveNodeIds) ?
      membershipLifecycleSummary.publishedActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(membershipLifecycleSummary?.projectedServingNodeIds) ?
      membershipLifecycleSummary.projectedServingNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(membershipLifecycleSummary?.locallyEligibleNodeIds) ?
      membershipLifecycleSummary.locallyEligibleNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(membershipLifecycleSummary?.recoveryActiveNodeIds) ?
      membershipLifecycleSummary.recoveryActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(
      membershipLifecycleSummary?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      membershipLifecycleSummary.missingPublishedRecoveryActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
  ]);
}
function resolveControlSnapshotExpectedNodeIds(options = {}) {
  const activeNodeViews = options.activeNodeViews || {};
  return normalizeControlSnapshotNodeIdList([
    ...Object.keys(options.readinessByNodeId || {}),
    ...(Array.isArray(options.nodeRows) ?
      options.nodeRows.map(resolveControlSnapshotNodeRowId) :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(activeNodeViews.authoritativeActiveNodeIds) ?
      activeNodeViews.authoritativeActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(activeNodeViews.effectiveActiveNodeIds) ?
      activeNodeViews.effectiveActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(activeNodeViews.projectedActiveNodeIds) ?
      activeNodeViews.projectedActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(activeNodeViews.projectedServingNodeIds) ?
      activeNodeViews.projectedServingNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(activeNodeViews.locallyEligibleNodeIds) ?
      activeNodeViews.locallyEligibleNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(activeNodeViews.suspectedOrTransitioningNodeIds) ?
      activeNodeViews.suspectedOrTransitioningNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...normalizeControlSnapshotPublishedActiveNodeIds(activeNodeViews),
    ...resolveControlSnapshotPublicationNodeIds(
      options.publicationConvergence,
    ),
  ]);
}
function resolveControlSnapshotPendingRecoveryNodeIds(
  expectedNodeIds,
  readinessByNodeId,
) {
  return normalizeControlSnapshotNodeIdList(
    expectedNodeIds.filter((nodeId) =>
      hasControlSnapshotPendingOwnerWork(readinessByNodeId?.[nodeId]),
    ),
  );
}
function resolveControlSnapshotPendingReconcileNodeIds(options = {}) {
  const pendingRecoveryNodeIdSet = new Set(options.pendingRecoveryNodeIds);
  return normalizeControlSnapshotNodeIdList(
    options.missingPublishedNodeIds.filter((nodeId) =>
      !pendingRecoveryNodeIdSet.has(nodeId),
    ),
  );
}
function normalizeControlSnapshotActiveGateBudget(activeGate = null) {
  if (!isControlSnapshotRecord(activeGate)) {
    return Object.freeze({
      state: CONTROL_SNAPSHOT_ACTIVE_GATE_BUDGET_STATE.UNAVAILABLE,
    });
  }
  return Object.freeze({
    state: CONTROL_SNAPSHOT_ACTIVE_GATE_BUDGET_STATE.AVAILABLE,
    ...(normalizeControlSnapshotOptionalString(activeGate.state) ?
      {activeGateState: normalizeControlSnapshotOptionalString(activeGate.state)} :
      {}),
    ...(normalizeControlSnapshotOptionalString(activeGate.reasonCode) ?
      {reasonCode: normalizeControlSnapshotOptionalString(activeGate.reasonCode)} :
      {}),
    ...(normalizeControlSnapshotOptionalInteger(activeGate.elapsedMs) !== null ?
      {elapsedMs: normalizeControlSnapshotOptionalInteger(activeGate.elapsedMs)} :
      {}),
    ...(normalizeControlSnapshotOptionalInteger(activeGate.attempts) !== null ?
      {attempts: normalizeControlSnapshotOptionalInteger(activeGate.attempts)} :
      {}),
    ...(normalizeControlSnapshotOptionalInteger(activeGate.maxAttempts) !== null ?
      {maxAttempts: normalizeControlSnapshotOptionalInteger(activeGate.maxAttempts)} :
      {}),
    ...(normalizeControlSnapshotOptionalInteger(
      activeGate.attemptsSinceProgress,
    ) !== null ?
      {
        attemptsSinceProgress: normalizeControlSnapshotOptionalInteger(
          activeGate.attemptsSinceProgress,
        ),
      } :
      {}),
    ...(normalizeControlSnapshotOptionalInteger(
      activeGate.coordinatorCyclesSinceProgress,
    ) !== null ?
      {
        coordinatorCyclesSinceProgress:
          normalizeControlSnapshotOptionalInteger(
            activeGate.coordinatorCyclesSinceProgress,
          ),
      } :
      {}),
  });
}
function resolveControlSnapshotTopologyEpoch(publicationConvergence) {
  const sourceTopologyEpoch = normalizeControlSnapshotOptionalInteger(
    publicationConvergence?.sourceTopologyEpoch,
  );
  if (sourceTopologyEpoch !== null) {
    return sourceTopologyEpoch;
  }
  return normalizeControlSnapshotOptionalInteger(
    publicationConvergence?.publicationEpoch,
  );
}
function decideControlSnapshotActiveGateOwnerCohort(evidence) {
  if (evidence.expectedNodeIds.length === NUM.ZERO) {
    return Object.freeze({
      state: CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_STATE.UNAVAILABLE,
      reasonCode:
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_REASON
          .EXPECTED_COHORT_UNAVAILABLE,
    });
  }
  if (
    evidence.pendingRecoveryNodeIds.length > NUM.ZERO ||
    evidence.pendingReconcileNodeIds.length > NUM.ZERO
  ) {
    return Object.freeze({
      state: CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_STATE.PENDING,
      reasonCode:
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_REASON
          .OWNER_RECONCILE_PENDING,
    });
  }
  if (evidence.missingPublishedNodeIds.length > NUM.ZERO) {
    return Object.freeze({
      state: CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_STATE.DEGRADED,
      reasonCode:
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_REASON
          .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE,
    });
  }
  return Object.freeze({
    state: CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_STATE.COMPLETE,
    reasonCode: CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_REASON.COMPLETE,
  });
}
function resolveControlSnapshotActiveGateBudgetSource(
  controlPlaneDiagnostics = null,
) {
  const sources = [
    controlPlaneDiagnostics?.publicationConvergence?.activeGate,
    controlPlaneDiagnostics?.publicationConvergenceGate?.activeGate,
    controlPlaneDiagnostics?.priorityRecoveryObservation?.activeGate,
    controlPlaneDiagnostics?.priorityRecoveryObservation?.activeGateNoProgress,
    controlPlaneDiagnostics?.priorityRecoveryObservation?.activeGateProgress,
    controlPlaneDiagnostics?.priorityRecoveryObservation?.activeGateBestProgress,
  ];
  return sources.find(isControlSnapshotRecord) || null;
}
function buildControlSnapshotActiveGateOwnerCohort(options = {}) {
  const readinessByNodeId = buildReadinessByNodeId({
    readinessByNodeId: options.readinessByNodeId || null,
  });
  const expectedNodeIds = resolveControlSnapshotExpectedNodeIds({
    nodeRows: options.nodeRows,
    activeNodeViews: options.activeNodeViews,
    publicationConvergence: options.publicationConvergence,
    readinessByNodeId,
  });
  const readyLeaseNodeIds = resolveControlSnapshotReadyLeaseNodeIds(
    options.nodeRows,
    options.nowMs,
  );
  const publishedActiveNodeIds =
    normalizeControlSnapshotPublishedActiveNodeIds(options.activeNodeViews);
  const publishedActiveNodeIdSet = new Set(publishedActiveNodeIds);
  const explicitMissingPublishedNodeIds = normalizeControlSnapshotNodeIdList([
    ...(Array.isArray(options.publicationConvergence?.missingPublishedNodeIds) ?
      options.publicationConvergence.missingPublishedNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(
      options.publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      options.publicationConvergence.missingPublishedRecoveryActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(
      options.publicationConvergence?.membershipLifecycleSummary
        ?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      options.publicationConvergence.membershipLifecycleSummary
        .missingPublishedRecoveryActiveNodeIds :
      ADMIN_CACHE_DUMP.EMPTY),
  ]);
  const missingPublishedNodeIds = normalizeControlSnapshotNodeIdList([
    ...expectedNodeIds.filter((nodeId) => !publishedActiveNodeIdSet.has(nodeId)),
    ...explicitMissingPublishedNodeIds,
  ]);
  const pendingRecoveryNodeIds = resolveControlSnapshotPendingRecoveryNodeIds(
    expectedNodeIds,
    readinessByNodeId,
  );
  const pendingReconcileNodeIds = resolveControlSnapshotPendingReconcileNodeIds({
    missingPublishedNodeIds,
    pendingRecoveryNodeIds,
  });
  const evidence = Object.freeze({
    expectedNodeIds,
    missingPublishedNodeIds,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds,
  });
  const decision = decideControlSnapshotActiveGateOwnerCohort(evidence);
  return Object.freeze({
    schemaVersion: CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
    state: decision.state,
    reasonCode: decision.reasonCode,
    topologyEpoch: resolveControlSnapshotTopologyEpoch(
      options.publicationConvergence,
    ),
    expectedNodeIds,
    expectedNodeCount: expectedNodeIds.length,
    readyLeaseNodeIds,
    readyLeaseNodeCount: readyLeaseNodeIds.length,
    publishedActiveNodeIds,
    publishedActiveNodeCount: publishedActiveNodeIds.length,
    missingPublishedNodeIds,
    missingPublishedCount: missingPublishedNodeIds.length,
    pendingRecoveryNodeIds,
    pendingRecoveryCount: pendingRecoveryNodeIds.length,
    pendingReconcileNodeIds,
    pendingReconcileCount: pendingReconcileNodeIds.length,
    [CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_BUDGET_FIELD]:
      normalizeControlSnapshotActiveGateBudget(options.activeGate),
  });
}
function hasDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  if (
    !publicationDiagnostics ||
    typeof publicationDiagnostics !== TYPEOF.OBJECT
  ) {
    return false;
  }
  if (
    publicationDiagnostics?.publicationObservation?.state ===
    CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE.AVAILABLE
  ) {
    return true;
  }
  if (
    publicationDiagnostics?.publishedActiveNodeIdsPresent === true ||
    Array.isArray(publicationDiagnostics?.publishedActiveNodeIds)
  ) {
    return true;
  }
  const publicationStatus = String(
    publicationDiagnostics?.status ||
      publicationDiagnostics?.publicationStatus ||
      publicationDiagnostics?.publicationObservation?.status ||
      ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
  ).toUpperCase();
  return publicationStatus === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED;
}
function selectDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  return hasDurablePublishedMembershipObservation(publicationDiagnostics) ?
    publicationDiagnostics :
    null;
}

function buildControlSnapshotPublicationOwnerTruthEvidence(
  publicationConvergence = null,
) {
  if (
    !publicationConvergence ||
    typeof publicationConvergence !== TYPEOF.OBJECT
  ) {
    return {
      published: false,
      ackComplete: false,
      prioritySpreadSatisfied: false,
    };
  }
  const publicationStatus = String(
    publicationConvergence.publicationStatus ||
      publicationConvergence.status ||
      publicationConvergence.publicationObservation?.status ||
      ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
  ).toUpperCase();
  const priorityPartitionSummary =
    publicationConvergence.priorityPartitionSummary &&
    typeof publicationConvergence.priorityPartitionSummary === TYPEOF.OBJECT ?
      publicationConvergence.priorityPartitionSummary :
      null;
  const blockedPriorityPartitions = Array.isArray(
    priorityPartitionSummary?.blockedPartitions,
  ) ?
    priorityPartitionSummary.blockedPartitions :
    ADMIN_CACHE_DUMP.EMPTY;
  const missingPriorityPartitionIds = Array.isArray(
    priorityPartitionSummary?.missingPartitionIds,
  ) ?
    priorityPartitionSummary.missingPartitionIds :
    ADMIN_CACHE_DUMP.EMPTY;
  const prioritySpreadSatisfied =
    priorityPartitionSummary === null ||
    (
      priorityPartitionSummary.satisfied === true &&
      blockedPriorityPartitions.length === NUM.ZERO &&
      missingPriorityPartitionIds.length === NUM.ZERO
    );
  return {
    published:
      publicationStatus === CONTROL_SNAPSHOT_PUBLICATION_STATUS_PUBLISHED,
    ackComplete:
      normalizeControlSnapshotNodeIdList(
        publicationConvergence.pendingAckNodeIds,
      ).length === NUM.ZERO,
    prioritySpreadSatisfied:
      prioritySpreadSatisfied &&
      publicationConvergence.recoveryProtocolState !==
        CONTROL_SNAPSHOT_RECOVERY_PROTOCOL_STATE_PRIORITY_SPREAD_PENDING,
  };
}

function shouldMergeControlSnapshotPublicationOwnerTruth(
  publicationConvergence = null,
) {
  const evidence = buildControlSnapshotPublicationOwnerTruthEvidence(
    publicationConvergence,
  );
  return (
    evidence.published === true &&
    evidence.ackComplete === true &&
    evidence.prioritySpreadSatisfied === true
  );
}

function mergeControlSnapshotActiveNodeViewsWithPublicationOwnerTruth(
  activeNodeViews,
  publicationConvergence = null,
) {
  if (
    shouldMergeControlSnapshotPublicationOwnerTruth(
      publicationConvergence,
    ) !== true
  ) {
    return activeNodeViews;
  }
  const activeMembershipSnapshot =
    buildActiveMembershipSnapshot(publicationConvergence);
  const ownerTruthNodeIds = normalizeControlSnapshotNodeIdList([
    ...activeMembershipSnapshot.concreteEligibleNodeIds,
    ...activeMembershipSnapshot.recoveryActiveNodeIds,
  ]);
  if (ownerTruthNodeIds.length === NUM.ZERO) {
    return activeNodeViews;
  }
  const effectiveActiveNodeIds = normalizeControlSnapshotNodeIdList([
    ...activeNodeViews.effectiveActiveNodeIds,
    ...ownerTruthNodeIds,
  ]);
  const projectedServingNodeIds = normalizeControlSnapshotNodeIdList([
    ...activeNodeViews.projectedServingNodeIds,
    ...activeMembershipSnapshot.projectedServingNodeIds,
    ...activeMembershipSnapshot.locallyEligibleNodeIds,
    ...activeMembershipSnapshot.recoveryEligibleIncludedNodeIds,
  ]);
  const locallyEligibleNodeIds = normalizeControlSnapshotNodeIdList([
    ...activeNodeViews.locallyEligibleNodeIds,
    ...activeMembershipSnapshot.locallyEligibleNodeIds,
    ...activeMembershipSnapshot.recoveryEligibleIncludedNodeIds,
  ]);
  const publishedActiveNodeIds = Array.isArray(
    activeNodeViews.publishedActiveNodeIds,
  ) ?
    activeNodeViews.publishedActiveNodeIds :
    ADMIN_CACHE_DUMP.EMPTY;
  const suspectedOrTransitioningNodeIds = normalizeControlSnapshotNodeIdList([
    ...activeNodeViews.suspectedOrTransitioningNodeIds,
    ...ownerTruthNodeIds.filter(
      (nodeId) => !publishedActiveNodeIds.includes(nodeId),
    ),
  ]);
  return {
    ...activeNodeViews,
    projectedServingNodeIds,
    locallyEligibleNodeIds,
    suspectedOrTransitioningNodeIds,
    effectiveSource:
      effectiveActiveNodeIds.length >
        activeNodeViews.effectiveActiveNodeIds.length ?
        CONTROL_SNAPSHOT_ACTIVE_NODE_VIEW_SOURCE_PUBLICATION_OWNER_TRUTH :
        activeNodeViews.effectiveSource,
    effectiveActiveNodeIds,
    projectedActiveNodeIds: normalizeControlSnapshotNodeIdList([
      ...activeNodeViews.projectedActiveNodeIds,
      ...projectedServingNodeIds,
      ...ownerTruthNodeIds,
    ]),
  };
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart3 extends AdminControlSnapshotPart2 {
  resolveControlSnapshotNodeViews(
    nodeRows = [],
    serviceRows = [],
    nodeEndpointRows = [],
    controlPlaneDiagnostics = null,
    publicationRows = [],
  ) {
    const latestPublishedMembershipObservation =
      selectDurablePublishedMembershipObservation(
        controlPlaneDiagnostics?.publishedMembershipObservation,
      );
    const publicationConvergence =
      controlPlaneDiagnostics?.publicationConvergence || null;
    const latestPublishedPublicationObservation =
      latestPublishedMembershipObservation ||
      selectDurablePublishedMembershipObservation(publicationConvergence);
    const readinessByNodeId = buildReadinessByNodeId({
      readinessByNodeId: controlPlaneDiagnostics?.readinessByNodeId || null,
    });
    const connectedNodeIds =
      this.messageRouter &&
      typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION ?
        this.messageRouter.getConnectedNodes() :
        ADMIN_CACHE_DUMP.EMPTY;
    const activeNodeViews = resolveActiveNodeViews({
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      publicationRows,
      latestPublicationRow: latestPublishedPublicationObservation,
      readinessByNodeId,
      connectedNodeIds,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      allowControlPlaneRecoveryEligibleProjection: true,
      allowLivenessFallbackProjection: true,
      nowMs: this.nowFn(),
    });
    const activeNodeViewsWithOwnerTruth =
      mergeControlSnapshotActiveNodeViewsWithPublicationOwnerTruth(
        activeNodeViews,
        publicationConvergence,
      );
    return {
      authoritativeSource: activeNodeViewsWithOwnerTruth.authoritativeSource,
      authoritativeActiveNodeIds: [
        ...activeNodeViewsWithOwnerTruth.authoritativeActiveNodeIds,
      ],
      projectedServingNodeIds: [
        ...activeNodeViewsWithOwnerTruth.projectedServingNodeIds,
      ],
      locallyEligibleNodeIds: [
        ...activeNodeViewsWithOwnerTruth.locallyEligibleNodeIds,
      ],
      suspectedOrTransitioningNodeIds: [
        ...activeNodeViewsWithOwnerTruth.suspectedOrTransitioningNodeIds,
      ],
      membershipFreeze: activeNodeViewsWithOwnerTruth.membershipFreeze,
      effectiveSource: activeNodeViewsWithOwnerTruth.effectiveSource,
      effectiveActiveNodeIds: [
        ...activeNodeViewsWithOwnerTruth.effectiveActiveNodeIds,
      ],
      projectedActiveNodeIds: [
        ...activeNodeViewsWithOwnerTruth.projectedActiveNodeIds,
      ],
      publishedActiveNodeIds: Array.isArray(
        activeNodeViewsWithOwnerTruth.publishedActiveNodeIds,
      ) ?
        [...activeNodeViewsWithOwnerTruth.publishedActiveNodeIds] :
        null,
      publishedMembershipAvailable: Array.isArray(
        activeNodeViewsWithOwnerTruth.publishedActiveNodeIds,
      ),
    };
  }
  resolveActiveGateOwnerCohortSnapshot(options = {}) {
    return buildControlSnapshotActiveGateOwnerCohort({
      ...options,
      activeGate:
        options.activeGate ||
        resolveControlSnapshotActiveGateBudgetSource(
          options.controlPlaneDiagnostics,
        ),
      publicationConvergence:
        options.publicationConvergence ||
        options.controlPlaneDiagnostics?.publicationConvergence ||
        null,
      readinessByNodeId:
        options.readinessByNodeId ||
        options.controlPlaneDiagnostics?.readinessByNodeId ||
        null,
      nowMs: Number.isFinite(options.nowMs) ? options.nowMs : this.nowFn(),
    });
  }
  isControlSnapshotActiveNode(
    nodeRow,
    readinessByNodeId,
    nodeEndpointRows,
    options = {},
  ) {
    return isCanonicallyActiveNode(nodeRow, {
      readinessByNodeId,
      nodeEndpointRows,
      nowMs: this.nowFn(),
      requireWebSocketEndpoint: options.requireWebSocketEndpoint,
    });
  }
  hasAnyActiveWebSocketEndpoint(nodeEndpointRows = []) {
    return hasCanonicalWebSocketEndpoints(nodeEndpointRows);
  }
  hasActiveWebSocketEndpoint(nodeId, nodeEndpointRows = []) {
    return hasCanonicalWebSocketEndpoint(nodeId, nodeEndpointRows);
  }
  isActiveWebSocketEndpoint(endpointRow) {
    return isCanonicalWebSocketEndpointRow(endpointRow);
  }
  /**
   * Determine whether one authoritative control-snapshot repair path
   * can run with current dependencies.
   * @return {boolean}
   * @private
   */
  canRunAuthoritativeControlSnapshotRepair() {
    return Boolean(
      this.systemTableCache &&
      typeof this.systemTableCache.getAll === TYPEOF.FUNCTION &&
      this.cacheMutationTarget &&
      typeof this.cacheMutationTarget.applySystemTableChange ===
        TYPEOF.FUNCTION &&
      this.ensureAuthoritativeDiscoveryCacheRepair,
    );
  }
  /**
   * Determine whether local control snapshot should attempt
   * authoritative cache repair.
   * @return {boolean}
   * @private
   */
  shouldAttemptAuthoritativeControlSnapshotRepair() {
    return shouldAttemptAuthoritativeRepair({
      repairEvaluation: this.evaluateAuthoritativeControlSnapshotRepair(),
      allowAuthoritativeRepair: true,
    });
  }
  /**
   * Evaluate whether local control snapshot should attempt
   * authoritative cache repair.
   * @return {Object|null}
   * @private
   */
  evaluateAuthoritativeControlSnapshotRepair(snapshot = null) {
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return null;
    }
    const capturedAt = Number.isFinite(snapshot?.capturedAt) ?
      snapshot.capturedAt :
      this.nowFn();
    const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
    const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
    const nodeEndpointRows = this.systemTableCache.getAll(
      TABLES.NODE_ENDPOINTS,
    );
    const controlPlaneDiagnostics = snapshot?.controlPlaneDiagnostics || null;
    const topologyGap = this.hasControlSnapshotPartitionTopologyGap(
      tableRows,
      partitionRows,
    );
    const nodeCoverage = evaluateSharedMetadataNodeCoverage({
      nodeRows,
      serviceRows,
      partitionRows,
      nodeEndpointRows,
    });
    const connectedNodeCoverage =
      this.evaluateConnectedNodeCoverageGap(nodeRows);
    const activeProjectionCoverage =
      this.evaluateActiveNodeProjectionCoverageGap({
        nodeRows,
        serviceRows,
        nodeEndpointRows,
        controlPlaneDiagnostics,
      });
    const replicaOperationRows = this.systemTableCache.getAll(
      TABLES.REPLICA_OPERATIONS,
    );
    const replicaOperationSummary =
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
    const evaluation = evaluateAuthoritativeRepairPolicy({
      cacheStalenessMs: this.resolveControlSnapshotCacheStalenessMs(
        nodeRows,
        capturedAt,
      ),
      staleThresholdMs: CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS,
      nodeCoverageGap:
        nodeCoverage.hasCoverageGap ||
        connectedNodeCoverage.hasCoverageGap ||
        activeProjectionCoverage.hasCoverageGap,
      topologyGap,
      staleReplicaOpsInFlightCount: replicaOperationSummary.staleInFlightCount,
    });
    return Object.freeze({
      ...evaluation,
      nodeCoverage: Object.freeze({
        sharedMetadata: nodeCoverage,
        connectedNodes: connectedNodeCoverage,
        activeProjection: activeProjectionCoverage,
      }),
    });
  }
}
export {AdminControlSnapshotPart3};
