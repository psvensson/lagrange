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
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function normalizeReasonCode(reason) {
  if (typeof reason !== TYPEOF.STRING) {
    return null;
  }
  const normalized = reason.trim();
  return normalized.length > NUM.ZERO ?
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
  if (typeof phase !== TYPEOF.STRING) {
    return null;
  }
  const normalizedPhase = phase.trim().toUpperCase();
  return Object.values(LIFECYCLE_PHASE).includes(normalizedPhase) ?
    normalizedPhase :
    null;
}

function normalizeReasonCodes(snapshot) {
  return normalizeReasonCodeArray(snapshot?.reasons);
}

function normalizePriorityRecoveryTargetParticipation(value) {
  if (!value || typeof value !== TYPEOF.OBJECT) {
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
const BOOTSTRAP_INIT_PRIORITY_BYPASS_REASON_SET = new Set(
  BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS,
);

function canBypassBootstrapInitPriorityReasons(reasonCodes, snapshot) {
  if (!snapshot || snapshot.draining === true) {
    return false;
  }
  const normalizedPhase = normalizeLifecyclePhase(snapshot.phase);
  if (normalizedPhase !== LIFECYCLE_PHASE.INIT) {
    return false;
  }
  const normalizedReasonCodes = normalizeReasonCodeArray(reasonCodes);
  if (normalizedReasonCodes.length === NUM.ZERO) {
    return false;
  }
  if (!normalizedReasonCodes.includes(
    LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
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
  if (typeof phase !== TYPEOF.STRING || phase.length === NUM.ZERO) {
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
  if (typeof recoveryProtocolState !== TYPEOF.STRING ||
      recoveryProtocolState.length === NUM.ZERO) {
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
  if (!targetParticipation || typeof targetParticipation !== TYPEOF.OBJECT) {
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
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
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
  if (typeof failureReason !== TYPEOF.STRING ||
      failureReason.length === NUM.ZERO) {
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
  if (!value || typeof value !== TYPEOF.OBJECT) {
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
    this.now = typeof options.now === TYPEOF.FUNCTION ?
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
    const managed = Boolean(snapshot && typeof snapshot === TYPEOF.OBJECT);
    const readinessSnapshot = buildReadinessSnapshotDetail(
      managed ? snapshot : null,
    );
    const phaseDetail = buildOptionalPhaseDetail(
      typeof snapshot?.phase === TYPEOF.STRING &&
        snapshot.phase.length > NUM.ZERO ?
        snapshot.phase :
        null,
    );
    const retryAfter = buildOptionalRetryAfterDetail(
      Number.isFinite(snapshot?.retryAfterMs) &&
        snapshot.retryAfterMs > NUM.ZERO ?
        Math.floor(snapshot.retryAfterMs) :
        null,
    );
    const stableWindow = buildOptionalStableWindowDetail(
      Number.isFinite(snapshot?.stableWindowMs) &&
        snapshot.stableWindowMs >= NUM.ZERO ?
        Math.floor(snapshot.stableWindowMs) :
        null,
    );
    const stableElapsed = buildOptionalStableElapsedDetail(
      Number.isFinite(snapshot?.stableElapsedMs) &&
        snapshot.stableElapsedMs >= NUM.ZERO ?
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
    const startupAuthorityBlocksRecovery =
      startupAuthorityUnavailable || startupAuthorityBlocked;
    const startupAuthorityAvailableForBootstrapInit =
      startupAuthority?.authorityAvailable === true &&
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
      STARTUP_RECOVERY_STAGE_RANK[recoveryStage] || NUM.ZERO;

    return Object.freeze({
      schemaVersion: NUM.ONE,
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
