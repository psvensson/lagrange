import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  PRIORITY_ADD_ADMISSION_PRESSURE_ACTION,
  PRIORITY_ADD_ADMISSION_PRESSURE_ACTION_BY_STATE,
  PRIORITY_DEFERRED_OBSERVATION_PRESSURE_ALLOWED_STATES,
  REBALANCE_COORDINATOR_TYPE,
  REBALANCE_COORDINATOR_SEGMENT_5_LITERAL,
  resolvePriorityAddAdmissionPressureState,
  resolvePriorityDeferredObservationPressureState,
} from './rebalance-coordinator-helper-common.js';

const {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  PRESSURE_GOVERNOR_ACTION,
  buildPriorityRecoveryPartitionAssessment,
} = REBALANCE_COORDINATOR_SHARED;


function isLocalRouterBackpressured(coordinator, options = {}) {
  return (
    coordinator.getLocalRouterPressureDecision(options).action !==
    PRESSURE_GOVERNOR_ACTION.ALLOW
  );
}

function shouldPauseAdmissionReadForLocalRouterPressure(coordinator, options = {}) {
  const action = coordinator.getLocalRouterPressureDecision(options).action;
  return (
    action === PRESSURE_GOVERNOR_ACTION.DEFER ||
    action === PRESSURE_GOVERNOR_ACTION.REJECT
  );
}

function hasContainedPriorityRecoveryPressure(coordinator, partitionId = null) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return false;
  }
  const decision = coordinator.getLocalRouterPressureDecision({partitionId});
  const evidence = buildPriorityDeferredObservationPressureEvidence(coordinator, {
    partitionId,
    pressureDecision: decision,
  });
  const state = resolvePriorityDeferredObservationPressureState(evidence);
  return PRIORITY_DEFERRED_OBSERVATION_PRESSURE_ALLOWED_STATES.has(state);
}

function buildPriorityDeferredObservationPressureEvidence(coordinator, options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  const pressureDecision =
    options.pressureDecision && typeof options.pressureDecision === 'object' ?
      options.pressureDecision :
      coordinator.getLocalRouterPressureDecision(options);
  const admissionEvidence = buildPriorityAddAdmissionPressureEvidence(coordinator, {
    partitionId,
    pressureDecision,
  });
  return Object.freeze({
    priorityRecoveryPartitionActive:
      admissionEvidence.priorityRecoveryPartitionActive === true,
    emergencyPriorityPartition:
      partitionId.length > NUM.ZERO &&
      coordinator.isEmergencyPriorityControlPlanePartition(partitionId),
    backpressured: pressureDecision?.summary?.backpressured === true,
  });
}

function shouldAllowPriorityRecoveryDeferredObservation(
  coordinator,
  partitionId = null,
  observation = null,
) {
  if (
    observation?.state !== INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
  ) {
    return false;
  }
  const operationCount = Number.isFinite(observation?.operationCount) ?
    Math.max(NUM.ZERO, Math.floor(observation.operationCount)) :
    Array.isArray(observation?.operations) ?
      observation.operations.length :
      NUM.ZERO;
  if (operationCount > NUM.ZERO || !observation?.deferredOutcome) {
    return false;
  }
  return hasContainedPriorityRecoveryPressure(coordinator, partitionId);
}

function resolvePriorityRecoveryPlanningEvidence(coordinator, partitionId) {
  const resolvePlanningSnapshot =
    coordinator.repository?.resolvePriorityRecoveryPlanningSnapshotForOwnerRead;
  const planningSnapshot =
    typeof resolvePlanningSnapshot === REBALANCE_COORDINATOR_TYPE.FUNCTION ?
      resolvePlanningSnapshot.call(coordinator.repository) :
      null;
  const isPlanningRecoveryActive =
    coordinator.repository?.isPriorityRecoveryOwnerReadActive;
  const recoveryActive =
    typeof isPlanningRecoveryActive === REBALANCE_COORDINATOR_TYPE.FUNCTION ?
      isPlanningRecoveryActive.call(coordinator.repository, planningSnapshot) :
      false;
  const partitionAssessment = buildPriorityRecoveryPartitionAssessment({
    partitionId,
    priorityPartitionSummary:
      planningSnapshot?.priorityPartitionSummary || null,
  });
  return Object.freeze({
    recoveryActive,
    blockedPriorityPartition: partitionAssessment?.planner?.ready === false,
  });
}

function buildPriorityAddAdmissionPressureEvidence(coordinator, options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  const pressureDecision =
    options.pressureDecision && typeof options.pressureDecision === 'object' ?
      options.pressureDecision :
      coordinator.getLocalRouterPressureDecision(options);
  const priorityRecoveryAdmissionPlan =
    coordinator.getPriorityRecoveryAdmissionPlan();
  const hasBlockedPartition =
    typeof priorityRecoveryAdmissionPlan?.hasBlockedPartition ===
    REBALANCE_COORDINATOR_TYPE.FUNCTION ?
      priorityRecoveryAdmissionPlan.hasBlockedPartition(partitionId) :
      false;
  const planningEvidence =
    resolvePriorityRecoveryPlanningEvidence(coordinator, partitionId);
  const emergencyPriorityRecoveryPartition =
    partitionId.length > NUM.ZERO &&
    priorityRecoveryAdmissionPlan?.emergencyRecoveryActive === true &&
    coordinator.isEmergencyPriorityControlPlanePartition(partitionId);
  const priorityRecoveryActive =
    priorityRecoveryAdmissionPlan?.recoveryActive === true ||
    planningEvidence.recoveryActive === true;
  const blockedPriorityPartition =
    hasBlockedPartition === true ||
    planningEvidence.blockedPriorityPartition === true;
  const priorityRecoveryPartitionActive =
    priorityRecoveryActive === true &&
    (
      blockedPriorityPartition === true ||
      emergencyPriorityRecoveryPartition === true
    );
  const pressureBlocked =
    pressureDecision?.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
    pressureDecision?.action === PRESSURE_GOVERNOR_ACTION.REJECT;
  return Object.freeze({
    partitionId,
    pressureAction:
      pressureDecision?.action ||
      REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.PRESSURE_ACTION_UNAVAILABLE,
    pressureBlocked,
    priorityRecoveryActive,
    blockedPriorityPartition,
    emergencyPriorityRecoveryPartition,
    priorityRecoveryPartitionActive,
  });
}

function resolvePriorityAddAdmissionPressureAction(coordinator, options = {}) {
  const evidence = buildPriorityAddAdmissionPressureEvidence(coordinator, options);
  const state = resolvePriorityAddAdmissionPressureState(evidence);
  return (
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION_BY_STATE[state] ||
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.PAUSE_READ
  );
}

function shouldPausePriorityAddAdmissionReadForLocalRouterPressure(
  coordinator,
  options = {},
) {
  return (
    resolvePriorityAddAdmissionPressureAction(coordinator, options) ===
    PRIORITY_ADD_ADMISSION_PRESSURE_ACTION.PAUSE_READ
  );
}

export {
  isLocalRouterBackpressured,
  shouldPauseAdmissionReadForLocalRouterPressure,
  hasContainedPriorityRecoveryPressure,
  buildPriorityDeferredObservationPressureEvidence,
  shouldAllowPriorityRecoveryDeferredObservation,
  resolvePriorityRecoveryPlanningEvidence,
  buildPriorityAddAdmissionPressureEvidence,
  resolvePriorityAddAdmissionPressureAction,
  shouldPausePriorityAddAdmissionReadForLocalRouterPressure,
};
