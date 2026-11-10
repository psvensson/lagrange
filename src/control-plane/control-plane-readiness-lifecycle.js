/**
 * Explicit end of a ControlPlaneReadinessService's lifecycle (quest
 * single-readiness-owner). Exactly one service exists per node process: the
 * bootstrap control-plane setup constructs it and hands it to the
 * RebalanceCoordinator container, and that container shuts it down exactly
 * once when the node runtime stops. Partition and rebalancer lifecycles only
 * consume the node-owned service and never call this on it.
 */
import {readWiredCollaborator} from './control-plane-readiness-collaborators.js';
import {
  CONTROL_PLANE_READINESS_COLLABORATOR as COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED as UNWIRED,
} from './control-plane-readiness-constants.js';

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
    const cache = readWiredCollaborator(this, COLLABORATOR.SYSTEM_TABLE_CACHE);
    if (this.cacheChangeListener && cache !== UNWIRED) {
      cache.offCacheChange(this.cacheChangeListener);
    }
    this.cacheChangeListener = null;
    this.detachCacheApplyChangeListener(this.systemTableCache);
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
