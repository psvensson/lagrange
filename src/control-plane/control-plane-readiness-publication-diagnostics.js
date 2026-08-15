/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService publication-diagnostics tier owns the
 * membership-publication diagnostics and planning-snapshot read surface.
 * Inputs: membership publication owner reads, heartbeat publication diagnostics.
 * Canonical output: publication diagnostics, publication story, planning snapshots.
 * Prohibited fallbacks: no direct publication reads that bypass owner read modes.
 * Primary tests: test/control-plane/control-plane-readiness-service.test.js.
 */
import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {ControlPlaneReadinessDiagnosticsEligibility} from './control-plane-readiness-diagnostics-eligibility.js';

const {
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  TABLES,
  buildControlPlanePublicationStory,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

// Every system table the synchronous membership-planning candidate
// derivation reads; the derivation memo below is keyed on their mutation
// versions so any relevant write invalidates it while a synchronous
// planning sweep (hundreds of identical derivations in one burst) shares
// one derivation. Non-table inputs (readiness entries, recovery-epoch
// history, router connectivity) are derived from these tables or reach
// the key within one heartbeat interval via the NODES bump — the same
// bound the sealed CL-033 planning-source revision accepts.
const MEMBERSHIP_PLANNING_VERSION_KEY_FIELD_SEPARATOR = ':';
const MEMBERSHIP_PLANNING_VERSION_KEY_ENTRY_SEPARATOR = '|';
const MEMBERSHIP_PLANNING_DERIVATION_SOURCE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.REPLICA_OPERATIONS,
]);

class ControlPlaneReadinessPublicationDiagnostics
  extends ControlPlaneReadinessDiagnosticsEligibility {
  async getMembershipPublicationDiagnostics(
    nodeId,
    observedAt,
    readOptions = {},
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== 'object') {
      return null;
    }
    const normalizedReadOptions = resolveMembershipPublicationReadOptions({
      lane: resolveMembershipPublicationReadLane(readOptions?.lane),
      queryTimeoutMs:
        Number.isFinite(readOptions?.queryTimeoutMs) &&
        readOptions.queryTimeoutMs > 0 ?
          readOptions.queryTimeoutMs :
          this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    let row = null;
    if (typeof service.getLatestPublicationForNode === 'function') {
      row = await service.getLatestPublicationForNode(
        nodeId,
        normalizedReadOptions,
      );
    } else if (typeof service.getLatestClusterPublication === 'function') {
      row = await service.getLatestClusterPublication(normalizedReadOptions);
    }
    return this.buildMembershipPublicationDiagnostics(row, observedAt);
  }

  getMembershipPublicationDiagnosticsSync(
    nodeId,
    observedAt,
    readOptions = {},
  ) {
    // CL-019: this sits on the getNodeReadinessSync hot path (per routing
    // decision, per CDC forward selection). The diagnostics are a pure
    // function of the latest publication row, which changes ~once per epoch
    // — memoize per change, invalidated by the control_plane_publications
    // cache-change listener (handleCacheChange). Only the CLUSTER-scope read
    // is node-independent and memoizable; TARGET_NODE reads recompute.
    const memoizableRead =
      resolveMembershipPublicationReadScope(readOptions?.scope) ===
        MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER &&
      typeof this.membershipPublicationService
        ?.getLatestClusterPublicationSync === 'function';
    if (memoizableRead && this.membershipPublicationDiagnosticsMemo) {
      return this.membershipPublicationDiagnosticsMemo.diagnostics;
    }
    const row = this.getLatestMembershipPublicationRowSync(nodeId, readOptions);
    const diagnostics = this.buildMembershipPublicationDiagnostics(
      row,
      observedAt,
    );
    if (memoizableRead) {
      // Production rows come through normalizeControlPlanePublicationRow,
      // which emits NO created_at/updated_at — the diagnostics' createdAt/
      // updatedAt are therefore observedAt-derived on every build already,
      // and their only consumers are provenance descriptors (enteredAt with
      // fallbacks), never gating logic. Freezing them at memo-build time is
      // no staler than today's per-call now(); content staleness is bounded
      // by the publication-change invalidation that clears this memo.
      this.membershipPublicationDiagnosticsMemo = {diagnostics};
    }
    return diagnostics;
  }

  async getControlPlanePublicationStory(nodeId, observedAt, readOptions = {}) {
    const metadataPublication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication =
      await this.getMembershipPublicationDiagnostics(
        nodeId,
        observedAt,
        readOptions,
      );
    return buildControlPlanePublicationStory({
      observedAt,
      nodeId,
      metadataPublication,
      nodeStatePublication: this.getHeartbeatPublicationDiagnostics(),
      nodeStatePublicationMode: this.getHeartbeatPublicationMode(),
      membershipPublication,
    });
  }

  getControlPlanePublicationStorySync(nodeId, observedAt, readOptions = {}) {
    const metadataPublication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
      readOptions,
    );
    return buildControlPlanePublicationStory({
      observedAt,
      nodeId,
      metadataPublication,
      nodeStatePublication: this.getHeartbeatPublicationDiagnostics(),
      nodeStatePublicationMode: this.getHeartbeatPublicationMode(),
      membershipPublication,
    });
  }

  async getMembershipPublicationPlanningSnapshot(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidate === 'function'
    ) {
      const candidate = await service.deriveClusterMembershipCandidate({
        deferNestedPriorityRecoveryPlanning: true,
        publisherNodeId: nodeId || this.nodeId,
        nowMs: observedAt,
      });
      if (candidate && typeof candidate === 'object') {
        return this.normalizeMembershipPublicationPlanningSnapshot(candidate);
      }
    }
    const membershipPublication =
      await this.getMembershipPublicationDiagnostics(nodeId, observedAt, {
        lane: MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING,
        scope: MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER,
      });
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    });
  }

  // The full candidate derivation re-reads five system tables, rebuilds the
  // priority-partition summary over every partition, and rebuilds recovery
  // closure evidence — profiled at half of all seed CPU during formation
  // planning sweeps that call it once per entity plus dozens of times per
  // priority entity in one synchronous burst. Memoized on the source-table
  // mutation versions (heartbeat writes bound staleness at the heartbeat
  // interval, the same bound the CL-019 diagnostics memo accepted); any
  // relevant table write invalidates.
  readMembershipPlanningDerivationVersionKey() {
    const cache = this.systemTableCache;
    if (!cache || typeof cache.getTableMutationVersion !== 'function') {
      return null;
    }
    let key = '';
    for (const tableName of MEMBERSHIP_PLANNING_DERIVATION_SOURCE_TABLES) {
      key += tableName +
        MEMBERSHIP_PLANNING_VERSION_KEY_FIELD_SEPARATOR +
        cache.getTableMutationVersion(tableName) +
        MEMBERSHIP_PLANNING_VERSION_KEY_ENTRY_SEPARATOR;
    }
    return key;
  }

  getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidateSync === 'function'
    ) {
      const publisherNodeId = nodeId || this.nodeId;
      const versionKey = this.readMembershipPlanningDerivationVersionKey();
      const memo = this.membershipPlanningSnapshotSyncMemo;
      if (
        versionKey !== null &&
        memo &&
        memo.versionKey === versionKey &&
        memo.publisherNodeId === publisherNodeId
      ) {
        return memo.snapshot;
      }
      const candidate = service.deriveClusterMembershipCandidateSync({
        deferNestedPriorityRecoveryPlanning: true,
        publisherNodeId,
        nowMs: observedAt,
      });
      if (candidate && typeof candidate === 'object') {
        const snapshot = Object.freeze(
          this.normalizeMembershipPublicationPlanningSnapshot(candidate),
        );
        if (versionKey !== null) {
          this.membershipPlanningSnapshotSyncMemo = {
            versionKey,
            publisherNodeId,
            snapshot,
          };
        }
        return snapshot;
      }
    }
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
      {
        lane: MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING,
        scope: MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER,
      },
    );
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    });
  }

  /**
   * Canonical synchronous priority-recovery planning snapshot.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getPriorityRecoveryPlanningSnapshotSync(nodeId, observedAt) {
    return this.getMembershipPublicationPlanningSnapshotSync(
      nodeId,
      observedAt,
    );
  }

  /**
   * Return one synchronous owner answer for membership-publication planning.
   * This remains distinct from the async/best-effort surface so sync callers
   * never reconstruct planning state from diagnostics locally.
   *
   * @param {string|null} nodeId
   * @param {number|string|null} observedAt
   * @return {Object|null}
   */
  getMembershipPublicationPlanningAnswerSync(nodeId, observedAt) {
    return this.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt);
  }
}

export {ControlPlaneReadinessPublicationDiagnostics};
