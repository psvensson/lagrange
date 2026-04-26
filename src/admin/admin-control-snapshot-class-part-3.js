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
import {TABLES, TYPEOF} from '../constants/index.js';
import {evaluateAuthoritativeRepairPolicy} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
} from './admin-constants.js';
import {
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
      nowMs: this.nowFn(),
    });
    return {
      authoritativeSource: activeNodeViews.authoritativeSource,
      authoritativeActiveNodeIds: [
        ...activeNodeViews.authoritativeActiveNodeIds,
      ],
      projectedServingNodeIds: [...activeNodeViews.projectedServingNodeIds],
      locallyEligibleNodeIds: [...activeNodeViews.locallyEligibleNodeIds],
      suspectedOrTransitioningNodeIds: [
        ...activeNodeViews.suspectedOrTransitioningNodeIds,
      ],
      membershipFreeze: activeNodeViews.membershipFreeze,
      effectiveSource: activeNodeViews.effectiveSource,
      effectiveActiveNodeIds: [...activeNodeViews.effectiveActiveNodeIds],
      projectedActiveNodeIds: [...activeNodeViews.projectedActiveNodeIds],
      publishedActiveNodeIds: Array.isArray(
        activeNodeViews.publishedActiveNodeIds,
      ) ?
        [...activeNodeViews.publishedActiveNodeIds] :
        null,
      publishedMembershipAvailable: Array.isArray(
        activeNodeViews.publishedActiveNodeIds,
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
