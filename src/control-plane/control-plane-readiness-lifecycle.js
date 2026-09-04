/**
 * Explicit end of a ControlPlaneReadinessService's lifecycle (quest
 * single-readiness-owner). Exactly one service exists per node process: the
 * bootstrap control-plane setup constructs it and hands it to the
 * RebalanceCoordinator container, and that container shuts it down exactly
 * once when the node runtime stops. Partition and rebalancer lifecycles only
 * consume the node-owned service and never call this on it.
 */
const LOCAL_STR_FUNCTION = 'function';

const controlPlaneReadinessLifecycleMethods = {
  /**
   * Unsubscribe the cache-change listener, stop the planning owner and its
   * queue timers, and drop every memoized readiness snapshot so a
   * reconstructed owner never inherits stale reuse candidates. Idempotent.
   */
  shutdown() {
    if (this.isShutDown === true) {
      return;
    }
    this.isShutDown = true;
    if (
      this.cacheChangeListener &&
      typeof this.systemTableCache?.offCacheChange === LOCAL_STR_FUNCTION
    ) {
      this.systemTableCache.offCacheChange(this.cacheChangeListener);
    }
    this.cacheChangeListener = null;
    this.shutdownReadinessPlanningOwner();
    this.lastReadinessSnapshotByNodeId.clear();
    this.lastReadinessSnapshotAtMsByNodeId.clear();
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.clear();
    this.membershipPublicationDiagnosticsMemo = null;
    this.projectionReadinessEvidenceOwner?.invalidateAll();
    this.priorityRecoveryPlanningProjectionMemoByNodeId?.clear();
    this.membershipPublicationPlanningSnapshotMemoByNodeId?.clear();
    this.membershipPlanningSnapshotSyncMemoByPublisher?.clear();
    this.membershipPlanningSnapshotAsyncMemoByPublisher?.clear();
  },
};

function installControlPlaneReadinessLifecycleMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessLifecycleMethods).map(
        ([name, value]) => [
          name,
          {configurable: true, value, writable: true},
        ],
      ),
    ),
  );
}

export {installControlPlaneReadinessLifecycleMethods};
