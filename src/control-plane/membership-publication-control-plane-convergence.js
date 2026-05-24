import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
} from './control-plane-error-classification.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
  PRESSURE_WORK_CLASS,
} from './pressure-governor.js';

const CONTROL_PLANE_CONVERGENCE_OUTCOME_SCHEMA_VERSION = 1;
const CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND = NUM.ONE;
const CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS = NUM.THOUSAND;
const CONTROL_PLANE_CRITICAL_CONVERGENCE_DELIVERY_PRIORITY = 'critical';
const CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION = Object.freeze({
  MEMBERSHIP_PUBLICATION: 'membership_publication',
  PUBLICATION_ACK: 'publication_ack',
  ACTIVE_GATE_HANDOFF: 'active_gate_handoff',
  OWNER_RECOVERY_WAKE: 'owner_recovery_wake',
});
const CONTROL_PLANE_CONVERGENCE_FIELD = Object.freeze({
  CONTROL_PLANE_CONVERGENCE: 'controlPlaneConvergence',
  CONTROL_PLANE_CONVERGENCE_CLASS: 'controlPlaneConvergenceClass',
  CONTROL_PLANE_CONVERGENCE_OWNER_KEY: 'controlPlaneConvergenceOwnerKey',
  CONTROL_PLANE_CONVERGENCE_OPERATION: 'controlPlaneConvergenceOperation',
  CONTROL_PLANE_CONVERGENCE_QUEUE_BOUND:
    'controlPlaneConvergenceQueueBound',
  CONTROL_PLANE_PRESSURE_OUTCOME: 'controlPlanePressureOutcome',
  DELIVERY_PRIORITY: 'deliveryPriority',
  PRESSURE_RETRY_AFTER_MS: 'pressureRetryAfterMs',
  RETRY_AFTER_MS: 'retryAfterMs',
  WORK_CLASS: 'workClass',
});

function normalizeControlPlaneConvergenceRetryAfterMs(value) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS;
}

function buildControlPlaneConvergenceOutcome({
  pressureOutcome,
  ownerKey,
  operation,
  queueOutcome = null,
  reasonCode = null,
  retryAfterMs = CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS,
  pressureReason = null,
} = {}) {
  return Object.freeze({
    schemaVersion: CONTROL_PLANE_CONVERGENCE_OUTCOME_SCHEMA_VERSION,
    convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
    pressureOutcome,
    ownerKey,
    operation,
    queueBound: CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND,
    retryAfterMs: normalizeControlPlaneConvergenceRetryAfterMs(retryAfterMs),
    ...(typeof queueOutcome === TYPEOF.STRING &&
      queueOutcome.length > NUM.ZERO ?
      {queueOutcome} :
      {}),
    ...(typeof reasonCode === TYPEOF.STRING &&
      reasonCode.length > NUM.ZERO ?
      {reasonCode} :
      {}),
    ...(typeof pressureReason === TYPEOF.STRING &&
      pressureReason.length > NUM.ZERO ?
      {pressureReason} :
      {}),
  });
}

function buildCriticalControlPlaneConvergenceOptions(
  options = {},
  {
    ownerKey,
    operation,
    pressureOutcome =
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
  } = {},
) {
  const retryAfterMs = normalizeControlPlaneConvergenceRetryAfterMs(
    options[CONTROL_PLANE_CONVERGENCE_FIELD.PRESSURE_RETRY_AFTER_MS] ??
      options[CONTROL_PLANE_CONVERGENCE_FIELD.RETRY_AFTER_MS],
  );
  return {
    ...options,
    [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
      CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
    [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_OWNER_KEY]:
      ownerKey,
    [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_OPERATION]:
      operation,
    [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_QUEUE_BOUND]:
      CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND,
    [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_PRESSURE_OUTCOME]:
      pressureOutcome,
    [CONTROL_PLANE_CONVERGENCE_FIELD.PRESSURE_RETRY_AFTER_MS]: retryAfterMs,
    [CONTROL_PLANE_CONVERGENCE_FIELD.DELIVERY_PRIORITY]:
      options[CONTROL_PLANE_CONVERGENCE_FIELD.DELIVERY_PRIORITY] ||
      CONTROL_PLANE_CRITICAL_CONVERGENCE_DELIVERY_PRIORITY,
    [CONTROL_PLANE_CONVERGENCE_FIELD.WORK_CLASS]:
      options[CONTROL_PLANE_CONVERGENCE_FIELD.WORK_CLASS] ||
      PRESSURE_WORK_CLASS.CRITICAL,
    [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE]:
      buildControlPlaneConvergenceOutcome({
        pressureOutcome,
        ownerKey,
        operation,
        retryAfterMs,
      }),
  };
}

function buildCriticalConvergenceErrorOutcome(error, ownerKey, operation) {
  const retryAfterMs = getControlPlaneRetryAfterMs(error);
  const pressureOutcome =
    getControlPlaneFailureSummary(error).primaryReason ===
      CONTROL_PLANE_FAILURE_REASON.PRESSURE_DEGRADED ||
    error?.code ===
      PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED ||
    error?.errorCode ===
      PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED ?
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED :
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED;
  return buildControlPlaneConvergenceOutcome({
    pressureOutcome,
    ownerKey,
    operation,
    retryAfterMs,
    pressureReason: error?.pressureReason,
  });
}

export {
  CONTROL_PLANE_CONVERGENCE_FIELD,
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildControlPlaneConvergenceOutcome,
  buildCriticalControlPlaneConvergenceOptions,
  buildCriticalConvergenceErrorOutcome,
  normalizeControlPlaneConvergenceRetryAfterMs,
};
