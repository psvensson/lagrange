import {NUM} from '../constants/index.js';
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

const STARTUP_RECOVERY_OPTIONAL_STATE = Object.freeze({
  PRESENT: 'present',
  NONE: 'none',
});
const STARTUP_RECOVERY_SNAPSHOT_STATE = Object.freeze({
  MANAGED: 'managed',
  UNMANAGED: 'unmanaged',
});
const STARTUP_AUTHORITY_FAILURE_STATE = Object.freeze({
  PRESENT: 'present',
  NONE: 'none',
});
const STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE =
  'observation_unavailable';
const STARTUP_RECOVERY_READINESS_STATE_OPTION = 'readinessState';

function normalizePartitionId(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

function normalizeReasonCode(reason) {
  if (typeof reason !== 'string') {
    return null;
  }
  const normalized = reason.trim();
  return normalized.length > 0 ?
    normalized :
    null;
}

function normalizeReasonCodeArray(reasonCodes) {
  if (!Array.isArray(reasonCodes)) {
    return [];
  }
  return [...new Set(reasonCodes
    .map((reason) => normalizeReasonCode(reason))
    .filter((reason) => reason !== null))];
}

function normalizeLifecyclePhase(phase) {
  if (typeof phase !== 'string') {
    return null;
  }
  const normalizedPhase = phase.trim().toUpperCase();
  return Object.values(LIFECYCLE_PHASE).includes(normalizedPhase) ?
    normalizedPhase :
    null;
}
const PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';

function normalizeReasonCodes(snapshot) {
  return normalizeReasonCodeArray(snapshot?.reasons);
}

function normalizePriorityRecoveryTargetParticipation(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const nodeId = normalizePartitionId(value.nodeId);
  const state = normalizeReasonCode(value.state);
  if (nodeId === null && state === null) {
    return null;
  }
  return Object.freeze({
    nodeId,
    state,
    recoverySource: normalizeReasonCode(value.recoverySource),
    durable: value.durable === true,
    publishedActive: value.publishedActive === true,
    recoveryActive: value.recoveryActive === true,
    projectedServing: value.projectedServing === true,
    locallyEligible: value.locallyEligible === true,
    suspectedOrTransitioning: value.suspectedOrTransitioning === true,
    reasons: normalizeReasonCodeArray(value.reasons),
  });
}

function normalizePriorityRecoveryHealthDetails(details) {
  const recoveryProtocolState = normalizeReasonCode(
    details?.recoveryProtocolState,
  );
  const targetParticipation = normalizePriorityRecoveryTargetParticipation(
    details?.targetParticipation,
  );
  return Object.freeze({
    recoveryProtocol:
      buildRecoveryProtocolDetail(recoveryProtocolState),
    targetParticipation:
      buildTargetParticipationDetail(targetParticipation),
    priorityRecoveryReasonCodes:
      normalizeReasonCodeArray(details?.priorityRecoveryReasonCodes),
  });
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
const STARTUP_AUTHORITY_STATE = Object.freeze({
  READY: 'ready',
  RECOVERY_PENDING: 'recovery_pending',
  SEED_LOCALLY_READY_UNPUBLISHED: 'seed_locally_ready_unpublished',
  OBSERVATION_UNAVAILABLE: 'observation_unavailable',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
  BLOCKED: 'blocked',
});

const STARTUP_RECOVERY_STAGE_RANK = Object.freeze({
  [STARTUP_RECOVERY_STAGE.UNMANAGED]: 0,
  [STARTUP_RECOVERY_STAGE.BLOCKED]: 1,
  [STARTUP_RECOVERY_STAGE.CONTROL_PLANE_RECOVERY_READY]: 2,
  [STARTUP_RECOVERY_STAGE.BACKGROUND_WORK_READY]: NUM.THREE,
  [STARTUP_RECOVERY_STAGE.TRAFFIC_READY]: NUM.FOUR,
});

const BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS = Object.freeze([
  LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.RUNTIME_WIRING_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
  LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
]);
const BOOTSTRAP_INIT_PRIORITY_BYPASS_REASON_SET = new Set(
  BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS,
);
const BOOTSTRAP_INIT_PRIORITY_RECOVERY_REASON_SET = new Set([
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
]);

function canBypassBootstrapInitPriorityReasons(reasonCodes, snapshot) {
  if (!snapshot || snapshot.draining === true) {
    return false;
  }
  const normalizedPhase = normalizeLifecyclePhase(snapshot.phase);
  if (normalizedPhase !== LIFECYCLE_PHASE.INIT) {
    return false;
  }
  const normalizedReasonCodes = normalizeReasonCodeArray(reasonCodes);
  if (normalizedReasonCodes.length === 0) {
    return false;
  }
  if (!normalizedReasonCodes.some((reason) =>
    BOOTSTRAP_INIT_PRIORITY_RECOVERY_REASON_SET.has(reason),
  )) {
    return false;
  }
  return normalizedReasonCodes.every((reason) =>
    BOOTSTRAP_INIT_PRIORITY_BYPASS_REASON_SET.has(reason),
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

function buildOptionalPhaseDetail(phase) {
  if (typeof phase !== 'string' || phase.length === 0) {
    return Object.freeze({
      state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
    phase,
  });
}

function buildOptionalRetryAfterDetail(retryAfterMs) {
  if (!Number.isFinite(retryAfterMs)) {
    return Object.freeze({
      state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
    retryAfterMs,
  });
}

function buildOptionalStableWindowDetail(stableWindowMs) {
  if (!Number.isFinite(stableWindowMs)) {
    return Object.freeze({
      state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
    stableWindowMs,
  });
}

function buildOptionalStableElapsedDetail(stableElapsedMs) {
  if (!Number.isFinite(stableElapsedMs)) {
    return Object.freeze({
      state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
    stableElapsedMs,
  });
}

function buildRecoveryProtocolDetail(recoveryProtocolState) {
  if (typeof recoveryProtocolState !== 'string' ||
      recoveryProtocolState.length === 0) {
    return Object.freeze({
      state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
    recoveryProtocolState,
  });
}

function buildTargetParticipationDetail(targetParticipation) {
  if (!targetParticipation || typeof targetParticipation !== 'object') {
    return Object.freeze({
      state: STARTUP_RECOVERY_OPTIONAL_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT,
    targetParticipation,
  });
}

function buildReadinessSnapshotDetail(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return Object.freeze({
      state: STARTUP_RECOVERY_SNAPSHOT_STATE.UNMANAGED,
    });
  }
  return Object.freeze({
    state: STARTUP_RECOVERY_SNAPSHOT_STATE.MANAGED,
    snapshot,
  });
}

function buildStartupAuthorityFailureDetail(failureReason) {
  if (typeof failureReason !== 'string' ||
      failureReason.length === 0) {
    return Object.freeze({
      state: STARTUP_AUTHORITY_FAILURE_STATE.NONE,
    });
  }
  return Object.freeze({
    state: STARTUP_AUTHORITY_FAILURE_STATE.PRESENT,
    reason: failureReason,
  });
}

function buildStartupAuthorityPublicationDetail(publicationObservationState) {
  return Object.freeze({
    observationState:
      publicationObservationState ||
      STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE,
  });
}

function normalizeStartupAuthoritySnapshot(value) {
  if (!value || typeof value !== 'object') {
    return Object.freeze({
      state: STARTUP_AUTHORITY_STATE.OBSERVATION_UNAVAILABLE,
      authorityAvailable: false,
      failure: Object.freeze({
        state: STARTUP_AUTHORITY_FAILURE_STATE.NONE,
      }),
      publication: Object.freeze({
        observationState:
          STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE,
      }),
      publicationObservationState:
        STARTUP_AUTHORITY_PUBLICATION_OBSERVATION_UNAVAILABLE,
    });
  }
  const state = normalizeReasonCode(value.state);
  const failureReason = normalizeReasonCode(
    value.failure?.reason || value.failureReason,
  );
  const publicationObservationState = normalizeReasonCode(
    value.publication?.observationState || value.publicationObservationState,
  );
  const failure = buildStartupAuthorityFailureDetail(failureReason);
  const publication = buildStartupAuthorityPublicationDetail(
    publicationObservationState,
  );
  return Object.freeze({
    state: state || STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE,
    authorityAvailable: value.authorityAvailable === true,
    failure,
    publication,
    ...(failure.state === STARTUP_AUTHORITY_FAILURE_STATE.PRESENT ?
      {
        failureReason,
      } :
      {}),
    publicationObservationState: publication.observationState,
  });
}

class StartupRecoveryCoordinator {
  /**
   * @param {Object} [options={}]
   * @param {Object|null} [options.readinessState]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.readinessState = options.readinessState || null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
  }

  /**
   * @param {Object} [options={}]
   * @return {void}
   */
  syncOwnerDependencies(options = {}) {
    if (Object.hasOwn(options, STARTUP_RECOVERY_READINESS_STATE_OPTION)) {
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
    const priorityRecoveryDetails =
      normalizePriorityRecoveryHealthDetails(
        options.priorityRecoveryHealth?.details ||
        options.priorityRecoveryDetails,
      );
    const startupAuthority = normalizeStartupAuthoritySnapshot(
      options.startupAuthority ||
      options.priorityRecoveryHealth?.details?.startupAuthority ||
      null,
    );
    const managed = Boolean(snapshot && typeof snapshot === 'object');
    const readinessSnapshot = buildReadinessSnapshotDetail(
      managed ? snapshot : null,
    );
    const phaseDetail = buildOptionalPhaseDetail(
      typeof snapshot?.phase === 'string' &&
        snapshot.phase.length > 0 ?
        snapshot.phase :
        null,
    );
    const retryAfter = buildOptionalRetryAfterDetail(
      Number.isFinite(snapshot?.retryAfterMs) &&
        snapshot.retryAfterMs > 0 ?
        Math.floor(snapshot.retryAfterMs) :
        null,
    );
    const stableWindow = buildOptionalStableWindowDetail(
      Number.isFinite(snapshot?.stableWindowMs) &&
        snapshot.stableWindowMs >= 0 ?
        Math.floor(snapshot.stableWindowMs) :
        null,
    );
    const stableElapsed = buildOptionalStableElapsedDetail(
      Number.isFinite(snapshot?.stableElapsedMs) &&
        snapshot.stableElapsedMs >= 0 ?
        Math.floor(snapshot.stableElapsedMs) :
        null,
    );
    const isPriorityControlPlanePartition =
      partitionId !== null &&
      isPriorityControlPlanePartitionId({partitionId});
    const trafficReady = managed ? isTrafficReadySnapshot(snapshot) : true;
    const metadataPublicationReady = managed ?
      isMetadataPublicationReadySnapshot(snapshot) :
      true;
    const reasonCodes = managed ? normalizeReasonCodes(snapshot) : [];
    const startupAuthorityUnavailable =
      startupAuthority?.state === STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE;
    const startupAuthorityBlocked =
      startupAuthority?.state === STARTUP_AUTHORITY_STATE.BLOCKED;
    const startupAuthorityUnobserved =
      startupAuthority?.state ===
        STARTUP_AUTHORITY_STATE.OBSERVATION_UNAVAILABLE;
    const startupAuthorityBlocksRecovery =
      startupAuthorityUnavailable || startupAuthorityBlocked;
    // The seed-direct INIT-bypass call site (seed-partitions-phase
    // waitForPartitionLeadership) drives the coordinator with no observed
    // startup authority — the seed IS its own authority during direct-write
    // bootstrap, so the snapshot normalizes to OBSERVATION_UNAVAILABLE /
    // authorityAvailable:false. The bypass must remain reachable there: gate
    // only on an authority that is positively available OR merely unobserved,
    // and keep blocking on an explicitly AUTHORITY_UNAVAILABLE / BLOCKED
    // authority. (Restores the pre-b1acc899 "!unavailable && !blocked"
    // semantics for the bypass while preserving its safety boundary.)
    const startupAuthorityAvailableForBootstrapInit =
      (startupAuthority?.authorityAvailable === true ||
        startupAuthorityUnobserved) &&
      !startupAuthorityBlocksRecovery;
    const backgroundWorkReady = managed ?
      isBackgroundWorkReadySnapshot(snapshot, {partitionId}) :
      true;
    const bootstrapInitControlPlaneRecoveryReady =
      startupAuthorityAvailableForBootstrapInit &&
      options.allowBootstrapInitPriorityBypass === true &&
      this.canBypassPriorityPartitionDuringBootstrapInit(reasonCodes, snapshot);
    const controlPlaneRecoveryReady =
      ((trafficReady || metadataPublicationReady) &&
        !startupAuthorityBlocksRecovery) ||
      bootstrapInitControlPlaneRecoveryReady;
    const priorityControlPlaneRecoveryReady =
      isPriorityControlPlanePartition && controlPlaneRecoveryReady;
    const bootstrapInitPriorityBypassReady =
      isPriorityControlPlanePartition &&
      bootstrapInitControlPlaneRecoveryReady;
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
      STARTUP_RECOVERY_STAGE_RANK[recoveryStage] || 0;

    return Object.freeze({
      schemaVersion: 1,
      capturedAt,
      capturedAtMs,
      managed,
      readinessSnapshot,
      partitionId,
      phaseDetail,
      ready: snapshot?.ready === true,
      draining: snapshot?.draining === true,
      reasonCodes,
      retryAfter,
      stableWindow,
      stableElapsed,
      isPriorityControlPlanePartition,
      trafficReady,
      metadataPublicationReady,
      backgroundWorkReady,
      controlPlaneRecoveryReady,
      priorityControlPlaneRecoveryReady,
      recoveryProtocolDetail: priorityRecoveryDetails.recoveryProtocol,
      targetParticipationDetail: priorityRecoveryDetails.targetParticipation,
      priorityRecoveryReasonCodes:
        priorityRecoveryDetails.priorityRecoveryReasonCodes,
      startupAuthorityState: startupAuthority.state,
      startupAuthorityAvailable: startupAuthority.authorityAvailable === true,
      startupAuthorityFailure: startupAuthority.failure,
      startupAuthorityPublication: startupAuthority.publication,
      ...(startupAuthority.failure.state ===
        STARTUP_AUTHORITY_FAILURE_STATE.PRESENT ?
        {
          startupAuthorityFailureReason: startupAuthority.failure.reason,
        } :
        {}),
      publicationObservationState: startupAuthority.publication.observationState,
      bootstrapInitPriorityBypassReady,
      recoveryStage,
      recoveryStageRank,
      recoveryBlocked:
        managed === true && controlPlaneRecoveryReady !== true,
      shouldBypassLocalPriorityControlPlaneStartupReadiness,
      ...(phaseDetail.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT ?
        {
          phase: phaseDetail.phase,
        } :
        {}),
      ...(retryAfter.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT ?
        {
          retryAfterMs: retryAfter.retryAfterMs,
        } :
        {}),
      ...(stableWindow.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT ?
        {
          stableWindowMs: stableWindow.stableWindowMs,
        } :
        {}),
      ...(stableElapsed.state === STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT ?
        {
          stableElapsedMs: stableElapsed.stableElapsedMs,
        } :
        {}),
      ...(priorityRecoveryDetails.recoveryProtocol.state ===
        STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT ?
        {
          recoveryProtocolState:
            priorityRecoveryDetails.recoveryProtocol.recoveryProtocolState,
        } :
        {}),
      ...(priorityRecoveryDetails.targetParticipation.state ===
        STARTUP_RECOVERY_OPTIONAL_STATE.PRESENT ?
        {
          targetParticipation:
            priorityRecoveryDetails.targetParticipation.targetParticipation,
        } :
        {}),
      ...(readinessSnapshot.state === STARTUP_RECOVERY_SNAPSHOT_STATE.MANAGED ?
        {
          snapshot,
        } :
        {}),
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
