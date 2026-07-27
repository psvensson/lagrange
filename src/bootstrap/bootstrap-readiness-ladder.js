import {NUM} from '../constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../control-plane/control-plane-publication-merge.js';

const BOOTSTRAP_READINESS_STAGE = Object.freeze({
  PROCESS_ALIVE: 'alive',
  CONTROL_PLANE_PUBLISHED: 'published',
  CONTROL_PLANE_ACKED: 'acked',
  RECOVERY_SAFE: 'recovery_safe',
  TRAFFIC_READY: 'traffic_ready',
});

const BOOTSTRAP_READINESS_STAGE_RANK = Object.freeze({
  [BOOTSTRAP_READINESS_STAGE.PROCESS_ALIVE]: 1,
  [BOOTSTRAP_READINESS_STAGE.CONTROL_PLANE_PUBLISHED]: 2,
  [BOOTSTRAP_READINESS_STAGE.CONTROL_PLANE_ACKED]: NUM.THREE,
  [BOOTSTRAP_READINESS_STAGE.RECOVERY_SAFE]: NUM.FOUR,
  [BOOTSTRAP_READINESS_STAGE.TRAFFIC_READY]: NUM.FIVE,
});

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ?
    value.trim() :
    null;
}

function normalizeNonNegativeIntegerOrNull(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    null;
}

function hasPublicationEvidence(options = {}) {
  return Number.isFinite(options.publishedControlPlaneEpoch) ||
    normalizeOptionalString(options.publishedControlPlaneStatus) !== null ||
    normalizeOptionalString(options.publishedControlPlaneObservationState) !==
      null;
}

function isPublicationAcknowledged(options = {}) {
  const normalizedStatus = normalizeOptionalString(
    options.publishedControlPlaneStatus,
  );
  const pendingAckCount = normalizeNonNegativeIntegerOrNull(
    options.publishedControlPlanePendingAckCount,
  );

  if (pendingAckCount !== null) {
    return pendingAckCount === 0;
  }

  return normalizedStatus !== null &&
    normalizedStatus.toUpperCase() ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
}

function buildBootstrapReadinessStage(options = {}) {
  let stage = BOOTSTRAP_READINESS_STAGE.PROCESS_ALIVE;

  if (options.ready === true) {
    stage = BOOTSTRAP_READINESS_STAGE.TRAFFIC_READY;
  } else if (
    options.controlPlaneRecoveryReady === true ||
    options.backgroundWorkReady === true
  ) {
    stage = BOOTSTRAP_READINESS_STAGE.RECOVERY_SAFE;
  } else if (hasPublicationEvidence(options)) {
    stage = isPublicationAcknowledged(options) ?
      BOOTSTRAP_READINESS_STAGE.CONTROL_PLANE_ACKED :
      BOOTSTRAP_READINESS_STAGE.CONTROL_PLANE_PUBLISHED;
  }

  return Object.freeze({
    stage,
    stageRank: BOOTSTRAP_READINESS_STAGE_RANK[stage] || 0,
  });
}

export {
  BOOTSTRAP_READINESS_STAGE,
  buildBootstrapReadinessStage,
};
