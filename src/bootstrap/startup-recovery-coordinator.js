import {NUM, TYPEOF} from '../constants/index.js';
import {
  isPriorityControlPlanePartition as isPriorityControlPlanePartitionId,
} from './system-partition-classification.js';
import {
  getTrafficReadinessSnapshot,
  isBackgroundWorkReadySnapshot,
  isMetadataPublicationReadySnapshot,
} from './traffic-readiness-utils.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from './lifecycle-controller-constants.js';

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

const BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS = Object.freeze([
  LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
]);

function canBypassBootstrapInitPriorityReasons(reasonCodes, snapshot) {
  if (!snapshot || snapshot.draining === true) {
    return false;
  }
  if (snapshot.phase !== LIFECYCLE_PHASE.INIT) {
    return false;
  }
  if (!Array.isArray(reasonCodes) || reasonCodes.length === 0) {
    return false;
  }
  if (!reasonCodes.includes(
    LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  )) {
    return false;
  }
  return reasonCodes.every((reason) =>
    BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS.includes(reason),
  );
}

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
    const reasonCodes = managed ? normalizeReasonCodes(snapshot) : [];
    const backgroundWorkReady = managed ?
      isBackgroundWorkReadySnapshot(snapshot, {partitionId}) :
      true;
    const controlPlaneRecoveryReady = trafficReady || metadataPublicationReady;
    const priorityControlPlaneRecoveryReady =
      isPriorityControlPlanePartition && controlPlaneRecoveryReady;
    const bootstrapInitPriorityBypassReady =
      isPriorityControlPlanePartition &&
      options.allowBootstrapInitPriorityBypass === true &&
      this.canBypassPriorityPartitionDuringBootstrapInit(reasonCodes, snapshot);
    const shouldBypassLocalPriorityControlPlaneStartupReadiness = Boolean(
      (priorityControlPlaneRecoveryReady && !trafficReady) ||
      bootstrapInitPriorityBypassReady,
    );
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
      bootstrapInitPriorityBypassReady,
      recoveryStage,
      recoveryStageRank,
      recoveryBlocked:
        managed === true && controlPlaneRecoveryReady !== true,
      shouldBypassLocalPriorityControlPlaneStartupReadiness,
      snapshot: managed ? snapshot : null,
    });
  }

  canBypassPriorityPartitionDuringBootstrapInit(reasonCodes, snapshot) {
    return canBypassBootstrapInitPriorityReasons(reasonCodes, snapshot);
  }
}

export {
  BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS,
  STARTUP_RECOVERY_STAGE,
  StartupRecoveryCoordinator,
  canBypassBootstrapInitPriorityReasons,
};
