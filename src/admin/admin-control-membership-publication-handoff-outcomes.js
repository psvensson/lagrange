/**
 * Membership publication handoff outcome builders for admin control snapshots.
 */
import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../control-plane/control-plane-error-classification.js';

const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_SCHEMA_VERSION = 1;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_SCHEMA_VERSION = 1;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_QUEUE_BOUND = NUM.ONE;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_RETRY_AFTER_MS =
  NUM.THOUSAND;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OWNER_KEY =
  'membership-publication:cluster_membership';
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OPERATION =
  'active_gate_handoff';
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD = Object.freeze({
  CONTROL_PLANE_CONVERGENCE: 'controlPlaneConvergence',
  CONTROL_PLANE_CONVERGENCE_CLASS: 'controlPlaneConvergenceClass',
  CONTROL_PLANE_PRESSURE_OUTCOME: 'controlPlanePressureOutcome',
});
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE = Object.freeze({
  WRITE_DEFERRED: 'write_deferred',
  TARGET_BLOCKED: 'target_blocked',
  NO_CHANGE: 'no_change',
});
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_COMMAND_ERROR =
  'owner_reconcile_error';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_ENQUEUED =
  'owner_reconcile_enqueued';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_ENQUEUED =
  'owner_recovery_wait_enqueued';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_SERVICE_UNAVAILABLE =
  'owner_recovery_wait_service_unavailable';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE =
  'owner_reconcile_service_unavailable';

function normalizeMembershipPublicationHandoffPressureOutcome(options = {}) {
  const pressureOutcome = options.pressureOutcome;
  return Object.values(CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME).includes(
    pressureOutcome,
  ) ?
    pressureOutcome :
    CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED;
}

function buildMembershipPublicationHandoffControlPlaneConvergence(
  options = {},
) {
  const retryAfterMs = Number.isFinite(options.retryAfterMs) &&
    options.retryAfterMs > NUM.ZERO ?
    Math.floor(options.retryAfterMs) :
    MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_RETRY_AFTER_MS;
  return Object.freeze({
    schemaVersion: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_SCHEMA_VERSION,
    convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
    pressureOutcome: normalizeMembershipPublicationHandoffPressureOutcome(
      options,
    ),
    ownerKey: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OWNER_KEY,
    operation: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OPERATION,
    queueBound: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_QUEUE_BOUND,
    retryAfterMs,
    ...(typeof options.reasonCode === TYPEOF.STRING &&
      options.reasonCode.length > NUM.ZERO ?
      {reasonCode: options.reasonCode} :
      {}),
  });
}

function buildMembershipPublicationHandoffOutcome(state, options = {}) {
  const controlPlaneConvergence =
    options.controlPlaneConvergence &&
      typeof options.controlPlaneConvergence === TYPEOF.OBJECT ?
      Object.freeze({...options.controlPlaneConvergence}) :
      null;
  return Object.freeze({
    schemaVersion: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_SCHEMA_VERSION,
    state,
    target: options.target || null,
    publicationRow: null,
    enqueued: options.enqueued === true,
    ...(Number.isFinite(options.retryAfterMs) &&
      options.retryAfterMs > NUM.ZERO ?
      {retryAfterMs: Math.floor(options.retryAfterMs)} :
      {}),
    ...(typeof options.reasonCode === TYPEOF.STRING &&
      options.reasonCode.length > NUM.ZERO ?
      {reasonCode: options.reasonCode} :
      {}),
    ...(controlPlaneConvergence ?
      {
        [MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE]: controlPlaneConvergence,
        [MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE_CLASS]:
          controlPlaneConvergence.convergenceClass,
        [MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD
          .CONTROL_PLANE_PRESSURE_OUTCOME]:
          controlPlaneConvergence.pressureOutcome,
      } :
      {}),
  });
}

function resolveOwnerRecoveryWaitHandoffReasonCode(enqueueOutcome) {
  return enqueueOutcome.accepted === true ?
    MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_ENQUEUED :
    MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_SERVICE_UNAVAILABLE;
}

function isMembershipPublicationHandoffControlPlaneConvergence(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value) &&
    value.convergenceClass === CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL &&
    Object.values(CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME).includes(
      value.pressureOutcome,
    );
}

function buildMembershipPublicationHandoffEnqueueOutcome({
  rawEnqueueResult,
  queueConvergence = null,
  called = false,
} = {}) {
  const queueAdmitted =
    queueConvergence?.pressureOutcome ===
    CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED;
  const accepted = called === true &&
    (rawEnqueueResult !== false || queueAdmitted === true);
  const controlPlaneConvergence =
    queueConvergence ||
    buildMembershipPublicationHandoffControlPlaneConvergence({
      pressureOutcome: accepted ?
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED :
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
    });
  return Object.freeze({
    accepted,
    controlPlaneConvergence,
    reasonCode: accepted ?
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_ENQUEUED :
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE,
  });
}

export {
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_COMMAND_ERROR,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_ENQUEUED,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_ENQUEUED,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_SERVICE_UNAVAILABLE,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE,
  buildMembershipPublicationHandoffControlPlaneConvergence,
  buildMembershipPublicationHandoffEnqueueOutcome,
  buildMembershipPublicationHandoffOutcome,
  isMembershipPublicationHandoffControlPlaneConvergence,
  resolveOwnerRecoveryWaitHandoffReasonCode,
};
