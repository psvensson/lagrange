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
function normalizeControlSnapshotNodeIdList(values = ADMIN_CACHE_DUMP.EMPTY) {
  return uniqueSorted(
    (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
      .map((value) =>
        String(value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).trim(),
      )
      .filter((value) => value.length > NUM.ZERO),
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
