/**
 * ControlPlaneReadinessParticipationBase delegates to the readiness planning
 * snapshot owner: the storage-capacity semantic projection binding, planning
 * diagnostics, the per-node planning identity (and its current-only memo
 * currency), snapshot subscriptions, readiness/recovery-epoch change
 * notifications, and owner shutdown. Installed on the participation base
 * prototype so the base keeps construction, owner dependency sync, and
 * participation evaluation.
 */

import {
  isPlanningIdentityCurrent,
} from './readiness-planning-semantic-generation.js';


const controlPlaneReadinessPlanningOwnerDelegateMethods = {
  configureStorageCapacitySemanticProjection() {
    this.storageAccountingService?.configureCapacitySemanticProjection?.({
      clearTimeoutFn: this.clearTimeoutFn,
      now: this.now,
      setTimeoutFn: this.setTimeoutFn,
      timeSource: this.timeSource,
    });
  },

  getReadinessPlanningDiagnostics() {
    return this.readinessPlanningSnapshotOwner?.getDiagnostics() || null;
  },

  readPlanningProjectionIdentity(nodeId, observedAtMs) {
    const currentObservedAtMs = observedAtMs ??
      (typeof this.now === 'function' ? this.now() : undefined);
    return this.readinessPlanningSnapshotOwner?.readPlanningProjectionIdentity(
      nodeId,
      currentObservedAtMs,
    ) || null;
  },

  // Memo currency for the planning memo layers: the planning identity only
  // while it is CURRENT. A saturated identity (unclassified source revision,
  // unavailable semantic input, stopped owner) blocks snapshot admission by
  // design but carries no reusable currency; serving it as a memo key made
  // every lookup a miss during formation write bursts (measured 98% misses,
  // 45s of seed CPU per join on the three-node seed rebalance), and the
  // rebuilds themselves delayed the classification that closes the window.
  // Memo layers receive null here and fall back to the floored table-version
  // key, which any write still invalidates.
  readCurrentPlanningProjectionIdentity(nodeId, observedAtMs) {
    const identity = this.readPlanningProjectionIdentity(nodeId, observedAtMs);
    return isPlanningIdentityCurrent(identity) ? identity : null;
  },

  subscribeReadinessPlanningSnapshots(listener) {
    return this.readinessPlanningSnapshotOwner?.subscribe(listener) ||
      (() => {});
  },

  recordReadinessPlanningSnapshotChange(nodeId) {
    this.readinessPlanningSnapshotOwner?.recordReadinessSnapshotChange(nodeId);
  },

  recordReadinessPlanningRecoveryEpochChange(nodeId) {
    this.readinessPlanningSnapshotOwner?.recordRecoveryEpochChange(nodeId);
  },

  shutdownReadinessPlanningOwner() {
    this.formationReleaseHandoffPublicationCoordinator?.shutdown();
    this.readinessPlanningSnapshotOwner?.shutdown();
    this.shutdownNodeLivenessSemanticProjectionOwner();
  },
};

function installControlPlaneReadinessPlanningOwnerDelegateMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessPlanningOwnerDelegateMethods).map(([name, value]) => [
        name,
        {configurable: true, value, writable: true},
      ]),
    ),
  );
}

export {installControlPlaneReadinessPlanningOwnerDelegateMethods};
