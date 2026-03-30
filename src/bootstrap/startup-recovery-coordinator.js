import {NUM, TYPEOF} from '../constants/index.js';
import {
  isPriorityControlPlanePartition as isPriorityControlPlanePartitionId,
} from './system-partition-classification.js';
import {
  getTrafficReadinessSnapshot,
  isBackgroundWorkReadySnapshot,
  isMetadataPublicationReadySnapshot,
} from './traffic-readiness-utils.js';
import {LIFECYCLE_PHASE} from './lifecycle-controller-constants.js';

function normalizePartitionId(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function normalizeReasonCodes(snapshot) {
  return Array.isArray(snapshot?.reasons) ?
    snapshot.reasons.filter((reason) =>
      typeof reason === TYPEOF.STRING && reason.length > NUM.ZERO,
    ) :
    [];
}

function isTrafficReadySnapshot(snapshot) {
  return Boolean(
    snapshot &&
    snapshot.ready === true &&
    snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY,
  );
}

const STARTUP_RECOVERY_STAGE = Object.freeze({
  UNMANAGED: 'unmanaged',
  BLOCKED: 'blocked',
  CONTROL_PLANE_RECOVERY_READY: 'control_plane_recovery_ready',
  BACKGROUND_WORK_READY: 'background_work_ready',
  TRAFFIC_READY: 'traffic_ready',
});

const STARTUP_RECOVERY_STAGE_RANK = Object.freeze({
  [STARTUP_RECOVERY_STAGE.UNMANAGED]: NUM.ZERO,
  [STARTUP_RECOVERY_STAGE.BLOCKED]: NUM.ONE,
  [STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY]: NUM.TWO,
  [STARTUP_RECOVERY_STAGE.BACKGROUND_WORK_READY]: NUM.THREE,
  [STARTUP_RECOVERY_STAGE.TRAFFIC_READY]: NUM.FOUR,
});

function resolveStartupRecoveryStage(options = {}) {
  if (options.managed !== true) {
    return STARTUP_RECOVERY_STAGE.UNMANAGED;
  }
  if (options.trafficReady === true) {
    return STARTUP_RECOVERY_STAGE.TRAFFIC_READY;
  }
  if (options.backgroundWorkReady === true) {
    return STARTUP_RECOVERY_STAGE.BACKGROUND_WORK_READY;
  }
  if (options.controlPlaneRecoveryReady === true) {
    return STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY;
  }
  return STARTUP_RECOVERY_STAGE.BLOCKED;
}

class StartupRecoveryCoordinator {
  /**
   * @param {Object} [options={}]
   * @param {Object|null} [options.readinessState]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.readinessState = options.readinessState || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
  }

  /**
   * @param {Object} [options={}]
   * @return {void}
   */
  syncOwnerDependencies(options = {}) {
    if (Object.hasOwn(options, 'readinessState')) {
      this.readinessState = options.readinessState || null;
    }
  }

  /**
   * @return {Object|null}
   */
  getSnapshot() {
    return getTrafficReadinessSnapshot(this.readinessState);
  }

  /**
   * @param {Object} [options={}]
   * @param {string|null} [options.partitionId]
   * @param {Object|null} [options.snapshot]
   * @return {Object}
   */
  evaluate(options = {}) {
    const partitionId = normalizePartitionId(options.partitionId);
    const snapshot = options.snapshot || this.getSnapshot();
    const capturedAtMs = this.now();
    const capturedAt = new Date(capturedAtMs).toISOString();
    const managed = Boolean(snapshot && typeof snapshot === TYPEOF.OBJECT);
    const isPriorityControlPlanePartition =
      partitionId !== null &&
      isPriorityControlPlanePartitionId({partitionId});
    const trafficReady = managed ? isTrafficReadySnapshot(snapshot) : true;
    const metadataPublicationReady = managed ?
      isMetadataPublicationReadySnapshot(snapshot) :
      true;
    const backgroundWorkReady = managed ?
      isBackgroundWorkReadySnapshot(snapshot, {partitionId}) :
      true;
    const controlPlaneRecoveryReady = trafficReady || metadataPublicationReady;
    const priorityControlPlaneRecoveryReady =
      isPriorityControlPlanePartition && controlPlaneRecoveryReady;
    const shouldBypassLocalPriorityControlPlaneStartupReadiness = Boolean(
      priorityControlPlaneRecoveryReady && !trafficReady,
    );
    const reasonCodes = managed ? normalizeReasonCodes(snapshot) : [];
    const recoveryStage = resolveStartupRecoveryStage({
      managed,
      trafficReady,
      backgroundWorkReady,
      controlPlaneRecoveryReady,
    });
    const recoveryStageRank =
      STARTUP_RECOVERY_STAGE_RANK[recoveryStage] || NUM.ZERO;

    return Object.freeze({
      schemaVersion: NUM.ONE,
      capturedAt,
      capturedAtMs,
      managed,
      partitionId,
      phase:
        typeof snapshot?.phase === TYPEOF.STRING &&
          snapshot.phase.length > NUM.ZERO ?
          snapshot.phase :
          null,
      ready: snapshot?.ready === true,
      draining: snapshot?.draining === true,
      reasonCodes,
      retryAfterMs:
        Number.isFinite(snapshot?.retryAfterMs) &&
          snapshot.retryAfterMs > NUM.ZERO ?
          Math.floor(snapshot.retryAfterMs) :
          null,
      stableWindowMs:
        Number.isFinite(snapshot?.stableWindowMs) &&
          snapshot.stableWindowMs >= NUM.ZERO ?
          Math.floor(snapshot.stableWindowMs) :
          null,
      stableElapsedMs:
        Number.isFinite(snapshot?.stableElapsedMs) &&
          snapshot.stableElapsedMs >= NUM.ZERO ?
          Math.floor(snapshot.stableElapsedMs) :
          null,
      isPriorityControlPlanePartition,
      trafficReady,
      metadataPublicationReady,
      backgroundWorkReady,
      controlPlaneRecoveryReady,
      priorityControlPlaneRecoveryReady,
      recoveryStage,
      recoveryStageRank,
      recoveryBlocked:
        managed === true && controlPlaneRecoveryReady !== true,
      shouldBypassLocalPriorityControlPlaneStartupReadiness,
      snapshot: managed ? snapshot : null,
    });
  }
}

export {
  STARTUP_RECOVERY_STAGE,
  StartupRecoveryCoordinator,
};
