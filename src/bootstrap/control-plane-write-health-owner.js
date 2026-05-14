import {TYPEOF} from '../constants/index.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_REASON,
} from './lifecycle-controller-constants.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../control-plane/control-plane-constants.js';
import {PressureGovernor} from '../control-plane/pressure-governor.js';

const LOCAL_NUM_ZERO = 0;

const CONTROL_PLANE_WRITE_HEALTH_DEFAULT = Object.freeze({
  FAILURE_THRESHOLD: 3,
});

const CONTROL_PLANE_WRITE_HEALTH_STATE = Object.freeze({
  HEALTHY: 'healthy',
  BACKGROUND_BACKLOG_CONTAINED: 'background_backlog_contained',
  RECOVERY_WRITE_DEFERRED: 'recovery_write_deferred',
  CRITICAL_WRITE_UNHEALTHY: 'critical_write_unhealthy',
});

const CONTROL_PLANE_WRITE_HEALTH_SOURCE = Object.freeze({
  HEARTBEAT_SERVICE: 'heartbeat_service',
  PROVIDER_ERROR: 'provider_error',
});

const CONTROL_PLANE_WRITE_HEALTH_LITERAL = Object.freeze({
  RESOURCE_KEY_CONTROL_PLANE_WRITE: 'control-plane:write',
  UNOBSERVED: 'unobserved',
});

const CONTROL_PLANE_WRITE_HEALTH_RESOURCE_KEYS = Object.freeze([
  CONTROL_PLANE_WRITE_HEALTH_LITERAL.RESOURCE_KEY_CONTROL_PLANE_WRITE,
]);

const BACKGROUND_PUBLICATION_MODE_SET = new Set([
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
]);

function normalizeFailureThreshold(value) {
  return Number.isFinite(value) && value > LOCAL_NUM_ZERO ?
    Math.floor(value) :
    CONTROL_PLANE_WRITE_HEALTH_DEFAULT.FAILURE_THRESHOLD;
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value > LOCAL_NUM_ZERO ? Math.floor(value) : LOCAL_NUM_ZERO;
}

function normalizeNonEmptyString(value, fallbackValue) {
  return typeof value === TYPEOF.STRING && value.length > LOCAL_NUM_ZERO ?
    value :
    fallbackValue;
}

function getHeartbeatPublicationDiagnostics(heartbeatService) {
  if (typeof heartbeatService?.getHeartbeatPublicationDiagnostics ===
      TYPEOF.FUNCTION) {
    const diagnostics = heartbeatService.getHeartbeatPublicationDiagnostics();
    return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
      diagnostics :
      Object.freeze({});
  }
  return Object.freeze({});
}

function getControlPlanePublicationStory(owner) {
  const observedAt = Date.now();
  if (typeof owner?.controlPlaneReadinessService
    ?.getControlPlanePublicationStorySync === TYPEOF.FUNCTION) {
    const story = owner.controlPlaneReadinessService
      .getControlPlanePublicationStorySync(owner?.nodeId || null, observedAt);
    return story && typeof story === TYPEOF.OBJECT ?
      story :
      null;
  }
  return null;
}

function getHeartbeatPublicationMode(heartbeatService) {
  return normalizeNonEmptyString(
    heartbeatService?.lastHeartbeatPublicationDecision?.publicationMode,
    CONTROL_PLANE_WRITE_HEALTH_LITERAL.UNOBSERVED,
  );
}

function getRouterStats(owner) {
  if (typeof owner?.messageRouter?.getStats === TYPEOF.FUNCTION) {
    const stats = owner.messageRouter.getStats();
    return stats && typeof stats === TYPEOF.OBJECT ? stats : Object.freeze({});
  }
  return Object.freeze({});
}

function buildControlPlanePressureSummary(owner) {
  const governor = new PressureGovernor({
    nodeId: owner?.nodeId,
    messageRouter: owner?.messageRouter || null,
  });
  return governor.getPressureSummary(CONTROL_PLANE_WRITE_HEALTH_RESOURCE_KEYS);
}

function hasContainedBackgroundBacklog(routerStats = {}) {
  const outboundQueues = routerStats?.outboundQueues || {};
  return Object.values(outboundQueues).some((queue) => {
    const pendingBackground = normalizeNonNegativeInteger(queue?.pendingBackground);
    const backgroundPendingLimit = normalizeNonNegativeInteger(
      queue?.backgroundPendingLimit,
    );
    const pendingCritical = normalizeNonNegativeInteger(queue?.pendingCritical);
    const criticalReserve = normalizeNonNegativeInteger(queue?.criticalReserve);
    return backgroundPendingLimit > LOCAL_NUM_ZERO &&
      pendingBackground >= backgroundPendingLimit &&
      pendingCritical < criticalReserve;
  });
}

function buildControlPlaneWriteHealthSnapshot(owner, failureThreshold) {
  const heartbeatService = owner?.heartbeatService || null;
  const publicationStory = getControlPlanePublicationStory(owner);
  const diagnostics =
    publicationStory?.nodeStatePublication &&
      typeof publicationStory.nodeStatePublication === TYPEOF.OBJECT ?
      publicationStory.nodeStatePublication :
      getHeartbeatPublicationDiagnostics(heartbeatService);
  const routerStats = getRouterStats(owner);
  return Object.freeze({
    source: CONTROL_PLANE_WRITE_HEALTH_SOURCE.HEARTBEAT_SERVICE,
    consecutiveFailures: normalizeNonNegativeInteger(
      heartbeatService?.heartbeatConsecutiveFailures ??
        diagnostics?.consecutiveFailures,
    ),
    failureThreshold,
    publicationMode: normalizeNonEmptyString(
      publicationStory?.nodeStatePublication?.publicationMode,
      getHeartbeatPublicationMode(heartbeatService),
    ),
    lastFailureStage: normalizeNonEmptyString(
      diagnostics?.lastFailureStage,
      CONTROL_PLANE_WRITE_HEALTH_LITERAL.UNOBSERVED,
    ),
    lastFailureReason: normalizeNonEmptyString(
      diagnostics?.lastFailureReason,
      CONTROL_PLANE_WRITE_HEALTH_LITERAL.UNOBSERVED,
    ),
    controlPlanePressureSummary: buildControlPlanePressureSummary(owner),
    backgroundBacklogContained: hasContainedBackgroundBacklog(routerStats),
  });
}

function resolveControlPlaneWriteHealthState(snapshot) {
  if (snapshot.consecutiveFailures < snapshot.failureThreshold) {
    return CONTROL_PLANE_WRITE_HEALTH_STATE.HEALTHY;
  }
  if (
    snapshot.publicationMode ===
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY &&
    snapshot.controlPlanePressureSummary?.backpressured !== true
  ) {
    return CONTROL_PLANE_WRITE_HEALTH_STATE.RECOVERY_WRITE_DEFERRED;
  }
  if (BACKGROUND_PUBLICATION_MODE_SET.has(snapshot.publicationMode) &&
      snapshot.controlPlanePressureSummary?.backpressured !== true &&
      snapshot.backgroundBacklogContained === true) {
    return CONTROL_PLANE_WRITE_HEALTH_STATE.BACKGROUND_BACKLOG_CONTAINED;
  }
  return CONTROL_PLANE_WRITE_HEALTH_STATE.CRITICAL_WRITE_UNHEALTHY;
}

function buildControlPlaneWriteHealthOutcome(snapshot, state) {
  const baseDetails = Object.freeze({
    source: snapshot.source,
    state,
    publicationMode: snapshot.publicationMode,
    consecutiveFailures: snapshot.consecutiveFailures,
    failureThreshold: snapshot.failureThreshold,
    lastFailureStage: snapshot.lastFailureStage,
    lastFailureReason: snapshot.lastFailureReason,
    backgroundBacklogContained: snapshot.backgroundBacklogContained,
    pressureSummary: snapshot.controlPlanePressureSummary,
  });
  if (state === CONTROL_PLANE_WRITE_HEALTH_STATE.HEALTHY) {
    return {
      healthy: true,
      classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
      reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
      state,
      details: baseDetails,
    };
  } else if (
    state === CONTROL_PLANE_WRITE_HEALTH_STATE.BACKGROUND_BACKLOG_CONTAINED ||
    state === CONTROL_PLANE_WRITE_HEALTH_STATE.RECOVERY_WRITE_DEFERRED
  ) {
    return {
      healthy: false,
      classification: LIFECYCLE_DEPENDENCY_CLASS.SOFT,
      reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
      state,
      details: baseDetails,
    };
  }
  return {
    healthy: false,
    classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
    reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
    state,
    details: baseDetails,
  };
}

function createControlPlaneWriteHealthProvider(owner, options = {}) {
  const failureThreshold = normalizeFailureThreshold(options.failureThreshold);
  return () => {
    const snapshot = buildControlPlaneWriteHealthSnapshot(
      owner,
      failureThreshold,
    );
    const state = resolveControlPlaneWriteHealthState(snapshot);
    return buildControlPlaneWriteHealthOutcome(snapshot, state);
  };
}

export {
  CONTROL_PLANE_WRITE_HEALTH_DEFAULT,
  CONTROL_PLANE_WRITE_HEALTH_RESOURCE_KEYS,
  CONTROL_PLANE_WRITE_HEALTH_SOURCE,
  CONTROL_PLANE_WRITE_HEALTH_STATE,
  createControlPlaneWriteHealthProvider,
};
