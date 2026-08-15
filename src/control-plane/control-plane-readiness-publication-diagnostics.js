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
import {
  readMembershipPlanningDerivationVersionKey as
  readPlanningVersionKeyForCache,
} from './membership-planning-version-key.js';

const {
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  buildControlPlanePublicationStory,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

// Named empty-state for the memoized async candidate derivation: the
// service produced no usable candidate, so the caller must fall through to
// the diagnostics-derived planning snapshot instead of trusting the memo.
const ASYNC_PLANNING_DERIVATION_UNAVAILABLE = Object.freeze({
  planningCandidateUnavailable: true,
});

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

  // The async candidate derivation is called once per owner read during
  // formation planning — call count scales with the in-flight operation
  // ledger, profiled at ~8 percent of seed CPU alongside the synchronous
  // sweep. Memoized on the same source-table version key as the sync
  // derivation (separate memo slot: the async derivation may take owner
  // read paths the sync variant cannot, so the two never cross-serve); the
  // in-flight promise is shared so concurrent callers in one sweep collapse
  // to one derivation, and a rejected derivation clears the slot so the
  // next caller retries.
  async getMembershipPublicationPlanningSnapshot(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidate === 'function'
    ) {
      const publisherNodeId = nodeId || this.nodeId;
      const versionKey = readPlanningVersionKeyForCache(
        this.systemTableCache,
        observedAt,
      );
      const memo = this.membershipPlanningSnapshotAsyncMemo;
      let derivation;
      if (
        versionKey !== null &&
        memo &&
        memo.versionKey === versionKey &&
        memo.publisherNodeId === publisherNodeId
      ) {
        derivation = memo.promise;
      } else {
        derivation = (async () => {
          const candidate = await service.deriveClusterMembershipCandidate({
            deferNestedPriorityRecoveryPlanning: true,
            publisherNodeId,
            nowMs: observedAt,
          });
          if (candidate && typeof candidate === 'object') {
            return Object.freeze(
              this.normalizeMembershipPublicationPlanningSnapshot(candidate),
            );
          }
          return ASYNC_PLANNING_DERIVATION_UNAVAILABLE;
        })();
        if (versionKey !== null) {
          const entry = {versionKey, publisherNodeId, promise: derivation};
          this.membershipPlanningSnapshotAsyncMemo = entry;
          derivation.catch(() => {
            if (this.membershipPlanningSnapshotAsyncMemo === entry) {
              this.membershipPlanningSnapshotAsyncMemo = null;
            }
          });
        }
      }
      const snapshot = await derivation;
      if (snapshot !== ASYNC_PLANNING_DERIVATION_UNAVAILABLE) {
        return snapshot;
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
  readMembershipPlanningDerivationVersionKey(observedAt) {
    return readPlanningVersionKeyForCache(this.systemTableCache, observedAt);
  }

  getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (
      service &&
      typeof service.deriveClusterMembershipCandidateSync === 'function'
    ) {
      const publisherNodeId = nodeId || this.nodeId;
      const versionKey =
        this.readMembershipPlanningDerivationVersionKey(observedAt);
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
