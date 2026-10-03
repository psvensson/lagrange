import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from
  './control-plane-readiness-service-shared.js';

const {
  COLUMN,
  TABLES,
  compareNodeHeartbeatWatermarks,
  normalizeIsoTimestamp,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;
const stringConstructor = String;

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

  getStoredReadinessSnapshotReuseCandidate(nodeId) {
    const snapshot = this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    // A missing node row must not forbid reuse: the sealed pre-cutover
    // contract bridges a lagged or deleted row from the stored snapshot
    // while freshness, services-version, transport, and independent
    // invalidation witnesses still hold (the bulk-readiness lagged-row
    // reuse case). Watermark arbitration below is row-relative and runs
    // only when a row exists.
    return snapshot &&
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

  // A cluster-wide invalidation is a real semantic change (for example a
  // genuine node removal or option drift): it must fail closed even when
  // the node row is missing, because the missing row is itself part of
  // that change. Only a per-node cache-lag invalidation may be bridged
  // from the stored snapshot while its independent witness still holds.
  isClusterInvalidatedMissingRowReuse(
    nodeId,
    nodeRow,
    candidate,
    clusterInvalidatedAtMs,
  ) {
    return !nodeRow &&
      clusterInvalidatedAtMs >= candidate.capturedAtMs &&
      this.isReadinessSnapshotInvalidated(nodeId, candidate.capturedAtMs);
  },

  isStoredReadinessWatermarkReusable(nodeId, nodeRow, candidate) {
    const storedWatermark =
      this.buildStoredReadinessSnapshotWatermark(candidate.snapshot);
    if (!storedWatermark) {
      return false;
    }
    // Row-relative watermark arbitration runs only when a row exists; a
    // lagged or deleted row cannot refute the stored snapshot (sealed
    // pre-cutover contract), and independent invalidation is still checked
    // below either way.
    const comparison = nodeRow ?
      compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) :
      null;
    if (comparison !== null && comparison < 0) {
      return false;
    }
    const invalidation = this.lastReadinessSnapshotInvalidatedAtMsByNodeId
      .get(nodeId);
    const clusterInvalidatedAtMs =
      Number(this.lastReadinessSnapshotClusterInvalidatedAtMs) || 0;
    if (this.isClusterInvalidatedMissingRowReuse(
      nodeId,
      nodeRow,
      candidate,
      clusterInvalidatedAtMs,
    )) {
      return false;
    }
    const independentInvalidatedAtMs = Math.max(
      Number(invalidation?.independentAtMs) || 0,
      clusterInvalidatedAtMs,
    );
    const invalidationApplies = comparison === 0 ||
      independentInvalidatedAtMs >= candidate.capturedAtMs;
    return !invalidationApplies ||
      !this.isReadinessSnapshotInvalidated(nodeId, candidate.capturedAtMs);
  },

  /**
   * Invalidate the stored readiness snapshots and publication memos one
   * delivered cache change refutes (the deferred channel's duty).
   * @param {string} tableName
   * @param {Object|null} record
   * @private
   */
  invalidateReadinessSnapshotsForCacheChange(tableName, record) {
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS ||
      tableName === TABLES.NODES ||
      tableName === TABLES.SERVICES ||
      tableName === TABLES.PARTITIONS
    ) {
      this.membershipPublicationPlanningSourceRevision += 1;
    }
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      // CL-019: publication content feeds the memoized membership-publication
      // diagnostics AND the publication-derived dimensions baked into every
      // stored readiness snapshot. Publication rows carry publication_id, not
      // node_id, so this invalidates cluster-wide.
      this.membershipPublicationDiagnosticsMemo = null;
      this.lastReadinessSnapshotClusterInvalidatedAtMs = this.now();
      return;
    }
    if (tableName === TABLES.NODES || tableName === TABLES.SERVICES) {
      this.invalidateNodeReadinessSnapshot(tableName, record);
    }
  },

  /**
   * Stamp the per-node invalidation one delivered nodes or services change
   * carries; a services change is also an independent invalidation.
   * @param {string} tableName
   * @param {Object|null} record
   * @private
   */
  invalidateNodeReadinessSnapshot(tableName, record) {
    const nodeId = stringConstructor(
      record?.[COLUMN.NODE_ID] ?? record?.node_id ?? '',
    );
    if (!nodeId) {
      return;
    }
    const nowMs = this.now();
    const previous =
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId);
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(nodeId, {
      atMs: nowMs,
      independentAtMs: tableName === TABLES.SERVICES ?
        nowMs : Number(previous?.independentAtMs) || 0,
    });
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
        projectionReadinessContract:
          missingReadiness.projectionReadinessContract,
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
