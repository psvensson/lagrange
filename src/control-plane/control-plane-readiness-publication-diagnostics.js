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
  NUM,
  TYPEOF,
  buildControlPlanePublicationStory,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

class ControlPlaneReadinessPublicationDiagnostics extends ControlPlaneReadinessDiagnosticsEligibility {
  async getMembershipPublicationDiagnostics(
    nodeId,
    observedAt,
    readOptions = {},
  ) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    const normalizedReadOptions = resolveMembershipPublicationReadOptions({
      lane: resolveMembershipPublicationReadLane(readOptions?.lane),
      queryTimeoutMs:
        Number.isFinite(readOptions?.queryTimeoutMs) &&
        readOptions.queryTimeoutMs > NUM.ZERO ?
          readOptions.queryTimeoutMs :
          this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    let row = null;
    if (typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION) {
      row = await service.getLatestPublicationForNode(
        nodeId,
        normalizedReadOptions,
      );
    } else if (typeof service.getLatestClusterPublication === TYPEOF.FUNCTION) {
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
          ?.getLatestClusterPublicationSync === TYPEOF.FUNCTION;
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
      typeof service.deriveClusterMembershipCandidate === TYPEOF.FUNCTION
    ) {
      const candidate = await service.deriveClusterMembershipCandidate({
        deferNestedPriorityRecoveryPlanning: true,
        publisherNodeId: nodeId || this.nodeId,
        nowMs: observedAt,
      });
      if (candidate && typeof candidate === TYPEOF.OBJECT) {
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

  getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidateSync === TYPEOF.FUNCTION
    ) {
      const candidate = service.deriveClusterMembershipCandidateSync({
        deferNestedPriorityRecoveryPlanning: true,
        publisherNodeId: nodeId || this.nodeId,
        nowMs: observedAt,
      });
      if (candidate && typeof candidate === TYPEOF.OBJECT) {
        return this.normalizeMembershipPublicationPlanningSnapshot(candidate);
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
