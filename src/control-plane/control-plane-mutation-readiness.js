import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {ControlPlaneReadinessService} from
  './control-plane-readiness-service.js';

const CONTROL_PLANE_MUTATION_WORK_CLASS = Object.freeze({
  BACKGROUND: 'background',
  INTERACTIVE: 'interactive',
  CRITICAL: 'critical',
});

const DEFAULT_REQUIRED_DIMENSIONS = Object.freeze([
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
  CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
]);

const REASON_BY_DIMENSION = Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
    CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
  [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
    CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
});

function normalizeControlPlaneMutationWorkClass(
  workClass,
  defaultWorkClass = CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
) {
  if (typeof workClass !== TYPEOF.STRING || workClass.length === NUM.ZERO) {
    return defaultWorkClass;
  }
  const normalized = workClass.toLowerCase();
  if (normalized === CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND) {
    return CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND;
  }
  if (normalized === CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL) {
    return CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL;
  }
  return CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE;
}

function requiresStableLocalControlPlaneMutationReadiness(workClass) {
  return normalizeControlPlaneMutationWorkClass(workClass) ===
    CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND;
}

function normalizeReasonCodes(readiness, failedDimensions) {
  const seen = new Set();
  const codes = [];
  for (const reason of Array.isArray(readiness?.reasons) ? readiness.reasons : []) {
    const code = String(reason?.code || reason?.reason || reason || '');
    if (code.length === NUM.ZERO || seen.has(code)) {
      continue;
    }
    seen.add(code);
    codes.push(code);
  }

  for (const dimension of Array.isArray(failedDimensions) ? failedDimensions : []) {
    const mappedCode = REASON_BY_DIMENSION[dimension] || '';
    if (mappedCode.length === NUM.ZERO || seen.has(mappedCode)) {
      continue;
    }
    seen.add(mappedCode);
    codes.push(mappedCode);
  }

  return Object.freeze(codes);
}

function getLocalControlPlaneMutationReadinessBlocker(options = {}) {
  const nodeId = String(options.nodeId || '');
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService || null;
  if (!nodeId ||
      !controlPlaneReadinessService ||
      typeof controlPlaneReadinessService.getNodeReadinessSync !==
        TYPEOF.FUNCTION) {
    return null;
  }

  const requiredDimensions = Array.isArray(options.requiredDimensions) &&
      options.requiredDimensions.length > NUM.ZERO ?
    options.requiredDimensions :
    DEFAULT_REQUIRED_DIMENSIONS;
  const readiness = controlPlaneReadinessService.getNodeReadinessSync(
    nodeId,
    {
      allowStaleOnCacheChange: false,
    },
  );
  const failedDimensions = requiredDimensions.filter((dimension) => {
    return readiness?.dimensions?.[dimension] !== true;
  });
  if (failedDimensions.length === NUM.ZERO) {
    return null;
  }

  return Object.freeze({
    nodeId,
    readiness: readiness || null,
    failedDimensions: Object.freeze([...failedDimensions]),
    reasonCodes: normalizeReasonCodes(readiness, failedDimensions),
    readinessSnapshot: readiness ?
      ControlPlaneReadinessService.compactSnapshotSummary(
        readiness,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
      ) :
      null,
  });
}

export {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  getLocalControlPlaneMutationReadinessBlocker,
  normalizeControlPlaneMutationWorkClass,
  requiresStableLocalControlPlaneMutationReadiness,
};
