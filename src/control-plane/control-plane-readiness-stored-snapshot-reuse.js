import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from
  './control-plane-readiness-service-shared.js';

const {
  compareNodeHeartbeatWatermarks,
  normalizeIsoTimestamp,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const controlPlaneReadinessStoredSnapshotReuseMethods = {
  /**
   * Reuse a stored evaluation only while its row, service revision, transport,
   * and invalidation witnesses still agree with the live read model.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @param {Object|null} publication
   * @param {Object|null} membershipPublication
   * @return {Object|null}
   * @private
   */
  getFresherStoredReadinessSnapshot(
    nodeId,
    nodeRow,
    publication,
    membershipPublication,
  ) {
    const candidate = this.getStoredReadinessSnapshotReuseCandidate(
      nodeId,
      nodeRow,
    );
    if (!candidate) {
      return null;
    }
    if (
      !this.isStoredReadinessServicesVersionCurrent(nodeId) ||
      this.hasStoredSnapshotLocalQueryTransportDrift(
        nodeId,
        candidate.snapshot,
      ) ||
      !this.isStoredReadinessWatermarkReusable(
        nodeId,
        nodeRow,
        candidate,
      )
    ) {
      return null;
    }
    const storedSnapshot = candidate.snapshot;
    return Object.freeze({
      ...storedSnapshot,
      publication:
        publication && typeof publication === 'object' ?
          Object.freeze({...publication}) :
          storedSnapshot.publication ?? null,
      membershipPublication:
        membershipPublication && typeof membershipPublication === 'object' ?
          Object.freeze({...membershipPublication}) :
          storedSnapshot.membershipPublication ?? null,
      recentTransitions: this.getReadinessTransitionHistory(nodeId),
    });
  },

  getStoredReadinessSnapshotReuseCandidate(nodeId, nodeRow) {
    const snapshot = this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    return snapshot &&
      nodeRow &&
      this.isStoredReadinessSnapshotFresh(snapshot, capturedAtMs) ?
      {snapshot, capturedAtMs} :
      null;
  },

  isStoredReadinessServicesVersionCurrent(nodeId) {
    const storedVersion =
      this.lastReadinessSnapshotServicesVersionByNodeId?.get(nodeId);
    return !Number.isFinite(storedVersion) ||
      storedVersion === this.getServicesTableMutationVersionForSnapshotReuse();
  },

  isStoredReadinessWatermarkReusable(nodeId, nodeRow, candidate) {
    const storedWatermark =
      this.buildStoredReadinessSnapshotWatermark(candidate.snapshot);
    if (!storedWatermark) {
      return false;
    }
    const comparison = compareNodeHeartbeatWatermarks(nodeRow, storedWatermark);
    if (comparison < 0) {
      return false;
    }
    const invalidation = this.lastReadinessSnapshotInvalidatedAtMsByNodeId
      .get(nodeId);
    const independentInvalidatedAtMs = Math.max(
      Number(invalidation?.independentAtMs) || 0,
      Number(this.lastReadinessSnapshotClusterInvalidatedAtMs) || 0,
    );
    const invalidationApplies = comparison === 0 ||
      independentInvalidatedAtMs >= candidate.capturedAtMs;
    return !invalidationApplies ||
      !this.isReadinessSnapshotInvalidated(nodeId, candidate.capturedAtMs);
  },

  getReusableNodeReadinessSnapshotSync(nodeId) {
    const observedAt = normalizeIsoTimestamp(this.now());
    return this.getFresherStoredReadinessSnapshot(
      nodeId,
      this.getNodeRow(nodeId),
      this.getPublicationDiagnostics(observedAt),
      this.getMembershipPublicationDiagnosticsSync(nodeId, observedAt),
    );
  },

  buildAndStoreMissingNodeReadinessSnapshot(context = {}) {
    const {
      nodeId,
      observedAt,
      publication,
      membershipPublication,
      persistSnapshot,
      buildStartedAtMs,
      options,
    } = context;
    const missingReadiness = this.buildMissingNodeReadiness(
      nodeId,
      observedAt,
      publication,
      membershipPublication,
    );
    const recentTransitions = persistSnapshot ?
      this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        nodeEvidence: null,
        dimensions: missingReadiness.dimensions,
        reasons: missingReadiness.reasons,
        runtimeAuthority: missingReadiness.runtimeAuthority,
        priorityControlPlaneRecovery:
          missingReadiness.priorityControlPlaneRecovery,
      }) :
      this.getReadinessTransitionHistory(nodeId);
    const snapshot = Object.freeze({...missingReadiness, recentTransitions});
    if (persistSnapshot) {
      this.storeReadinessSnapshot(
        nodeId,
        snapshot,
        buildStartedAtMs,
        options,
      );
    }
    return snapshot;
  },
};

function installControlPlaneReadinessStoredSnapshotReuseMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessStoredSnapshotReuseMethods).map(
        ([name, value]) => [
          name,
          {configurable: true, value, writable: true},
        ],
      ),
    ),
  );
}

export {installControlPlaneReadinessStoredSnapshotReuseMethods};
