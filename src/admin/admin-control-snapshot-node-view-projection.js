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
  buildPublicationActiveGateHandoffContract,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  projectPublicationActiveGateHandoffToOwnerCohort,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {evaluateSharedMetadataNodeCoverage} from './admin-shared-metadata-consistency.js';
import {
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {AdminControlSnapshotRepairOrchestration} from './admin-control-snapshot-repair-orchestration.js';
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
  COMMA: ',',
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
const CONTROL_SNAPSHOT_ACTIVE_GATE_BUDGET_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
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
function buildControlSnapshotPublicationActiveGateHandoff(options = {}) {
  const readinessByNodeId = buildReadinessByNodeId({
    readinessByNodeId: options.readinessByNodeId || null,
  });
  const computedHandoff = buildPublicationActiveGateHandoffContract({
    nodeRows: options.nodeRows,
    activeNodeViews: options.activeNodeViews,
    publicationConvergence: options.publicationConvergence,
    readinessByNodeId,
  });
  const progressHandoff = selectPublicationActiveGateHandoffContract(
    options.publicationConvergence,
  );
  const progressPendingReconcileNodeIds = Array.isArray(
    progressHandoff?.pendingReconcileNodeIds,
  ) ?
    progressHandoff.pendingReconcileNodeIds :
    [];
  const progressPendingReconcileCount = Number(
    progressHandoff?.pendingReconcileCount,
  );
  const hasProgressOwnerReconcileDebt =
    progressHandoff?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION &&
    (
      progressPendingReconcileNodeIds.length > NUM.ZERO ||
      Number.isFinite(progressPendingReconcileCount) &&
        progressPendingReconcileCount > NUM.ZERO
    );
  const computedPendingReconcileNodeIds = Array.isArray(
    computedHandoff?.pendingReconcileNodeIds,
  ) ?
    computedHandoff.pendingReconcileNodeIds :
    [];
  const computedPendingReconcileCount = Number(
    computedHandoff?.pendingReconcileCount,
  );
  const hasComputedOwnerReconcileDebt =
    computedHandoff?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
    computedPendingReconcileNodeIds.length > NUM.ZERO ||
    Number.isFinite(computedPendingReconcileCount) &&
      computedPendingReconcileCount > NUM.ZERO;
  if (
    hasProgressOwnerReconcileDebt &&
    hasComputedOwnerReconcileDebt !== true
  ) {
    return progressHandoff;
  }
  return computedHandoff;
}
function buildControlSnapshotActiveGateOwnerCohort(options = {}) {
  const publicationActiveGateHandoff =
    options.publicationActiveGateHandoff ||
    buildControlSnapshotPublicationActiveGateHandoff(options);
  const readyLeaseNodeIds = resolveControlSnapshotReadyLeaseNodeIds(
    options.nodeRows,
    options.nowMs,
  );
  return projectPublicationActiveGateHandoffToOwnerCohort(
    publicationActiveGateHandoff,
    {
      readyLeaseNodeIds,
      activeGateBudget:
        normalizeControlSnapshotActiveGateBudget(options.activeGate),
    },
  );
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
function resolveControlSnapshotUnavailableActiveCandidateNodeIds(
  controlPlaneDiagnostics = null,
  publicationConvergence = null,
  activeNodeViews = null,
) {
  const retainedPublishedNodeIds = new Set(
    normalizeControlSnapshotNodeIdList(
      activeNodeViews?.publishedActiveNodeIds,
    ),
  );
  const normalizeCandidateDebtNodeIds = (values = ADMIN_CACHE_DUMP.EMPTY) =>
    normalizeControlSnapshotNodeIdList(values)
      .filter((nodeId) => !retainedPublishedNodeIds.has(nodeId));
  const pendingAckNodeIds = Array.isArray(
    publicationConvergence?.pendingAckNodeIds,
  ) ?
    normalizeCandidateDebtNodeIds(publicationConvergence.pendingAckNodeIds) :
    Array.isArray(
      publicationConvergence?.membershipLifecycleSummary?.pendingAckNodeIds,
    ) ?
      normalizeCandidateDebtNodeIds(
        publicationConvergence.membershipLifecycleSummary.pendingAckNodeIds,
      ) :
      ADMIN_CACHE_DUMP.EMPTY;
  const directHandoff =
    controlPlaneDiagnostics?.publicationActiveGateHandoff;
  const nestedHandoff =
    publicationConvergence?.publicationActiveGateHandoff;
  const pendingRecoveryNodeIds = [
    ...(directHandoff &&
      Array.isArray(directHandoff.pendingRecoveryNodeIds) ?
      normalizeCandidateDebtNodeIds(directHandoff.pendingRecoveryNodeIds) :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(nestedHandoff &&
      Array.isArray(nestedHandoff.pendingRecoveryNodeIds) ?
      normalizeCandidateDebtNodeIds(nestedHandoff.pendingRecoveryNodeIds) :
      ADMIN_CACHE_DUMP.EMPTY),
  ];
  const commaSeparatedRecovery =
    controlPlaneDiagnostics
      ?.publicationActiveGateHandoffPendingRecoveryNodeIds ||
    controlPlaneDiagnostics?.activeGateOwnerCohortPendingRecoveryNodeIds;
  if (
    commaSeparatedRecovery &&
    typeof commaSeparatedRecovery === TYPEOF.STRING
  ) {
    pendingRecoveryNodeIds.push(
      ...normalizeCandidateDebtNodeIds(
        commaSeparatedRecovery
          .split(ADMIN_CONTROL_SNAPSHOT_LITERAL.COMMA)
          .map((nodeId) => nodeId.trim())
          .filter((nodeId) => nodeId.length > NUM.ZERO),
      ),
    );
  }
  return new Set(normalizeControlSnapshotNodeIdList([
    ...pendingAckNodeIds,
    ...pendingRecoveryNodeIds,
  ]));
}
function filterControlSnapshotAvailableCandidateNodeIds(
  nodeIds,
  unavailableNodeIds,
) {
  return normalizeControlSnapshotNodeIdList(nodeIds)
    .filter((nodeId) => !unavailableNodeIds.has(nodeId));
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotNodeViewProjection extends AdminControlSnapshotRepairOrchestration {
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
    const unavailableActiveCandidateNodeIds =
      resolveControlSnapshotUnavailableActiveCandidateNodeIds(
        controlPlaneDiagnostics,
        publicationConvergence,
        activeNodeViewsWithOwnerTruth,
      );
    const filteredEffectiveActiveNodeIds =
      filterControlSnapshotAvailableCandidateNodeIds(
        activeNodeViewsWithOwnerTruth.effectiveActiveNodeIds,
        unavailableActiveCandidateNodeIds,
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
      effectiveActiveNodeIds: filteredEffectiveActiveNodeIds,
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
  resolvePublicationActiveGateHandoffContract(options = {}) {
    return buildControlSnapshotPublicationActiveGateHandoff({
      ...options,
      publicationConvergence:
        options.publicationConvergence ||
        options.controlPlaneDiagnostics?.publicationConvergence ||
        null,
      readinessByNodeId:
        options.readinessByNodeId ||
        options.controlPlaneDiagnostics?.readinessByNodeId ||
        null,
    });
  }
  resolveActiveGateOwnerCohortSnapshot(options = {}) {
    return buildControlSnapshotActiveGateOwnerCohort({
      ...options,
      publicationActiveGateHandoff:
        options.publicationActiveGateHandoff ||
        options.controlPlaneDiagnostics?.publicationActiveGateHandoff ||
        options.controlPlaneDiagnostics?.publicationConvergence
          ?.publicationActiveGateHandoff ||
        null,
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
  evaluateAuthoritativeControlSnapshotRepair(snapshot = null, options = {}) {
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
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows, options);
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
      staleReplicaOpsInFlightCount:
        Number.isInteger(replicaOperationSummary.effectiveStaleInFlightCount) ?
          replicaOperationSummary.effectiveStaleInFlightCount :
          replicaOperationSummary.staleInFlightCount,
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
export {AdminControlSnapshotNodeViewProjection};
