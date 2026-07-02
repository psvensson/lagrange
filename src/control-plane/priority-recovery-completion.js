import {
  PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON,
} from './priority-recovery-diagnostics-constants.js';

const PRIORITY_RECOVERY_COMPLETION_STATE = Object.freeze({
  CONVERGED: 'converged',
  SPREAD_SATISFIED_IN_FLIGHT: 'spread_satisfied_in_flight',
  TEMPORARY_OVER_TARGET_ALLOWED: 'temporary_over_target_allowed',
  OPERATION_VISIBILITY_DEFERRED:
    'operation_visibility_deferred',
  AUTHORITATIVE_OPERATION_READ_DEFERRED:
    'operation_visibility_deferred',
  BLOCKED: 'blocked',
});

const PRIORITY_RECOVERY_COMPLETION_STATE_IDS = Object.freeze([
  PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
  PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
  PRIORITY_RECOVERY_COMPLETION_STATE.TEMPORARY_OVER_TARGET_ALLOWED,
  PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED,
  PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
]);

const PRIORITY_RECOVERY_COMPLETION_REASON = Object.freeze({
  TEMPORARY_OVER_TARGET_ALLOWED:
    'temporary_over_target_allowed_for_recovery_completion',
  OPERATION_VISIBILITY_DEFERRED:
    'operation_visibility_deferred',
  AUTHORITATIVE_OPERATION_READ_DEFERRED:
    'operation_visibility_deferred',
  BLOCKED: 'blocked',
});
const PRIORITY_RECOVERY_TEMPORARY_OVERFLOW_VOTER_BUDGET = 2;

function normalizeNonNegativeInteger(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }
  return Math.floor(normalized);
}

function resolvePriorityRecoveryTemporaryOverflowVoterBudget(options = {}) {
  const targetReplicaCount =
    normalizeNonNegativeInteger(options.targetReplicaCount);
  const activeVoterCount =
    normalizeNonNegativeInteger(options.activeVoterCount);
  const learnerCount =
    normalizeNonNegativeInteger(options.learnerCount);
  const activeOperationCount =
    normalizeNonNegativeInteger(options.activeOperationCount);
  const plannerUnresolved = options.plannerUnresolved === true;
  const priorityRecoveryActive = options.priorityRecoveryActive === true;
  if (!priorityRecoveryActive ||
      !Number.isFinite(targetReplicaCount) ||
      !Number.isFinite(activeVoterCount) ||
      !Number.isFinite(learnerCount) ||
      targetReplicaCount <= 0 ||
      learnerCount <= 0 ||
      activeVoterCount < targetReplicaCount) {
    return 0;
  }

  const recoveryCompletionPending =
    activeOperationCount > 0 || plannerUnresolved;
  if (!recoveryCompletionPending) {
    return 0;
  }

  return PRIORITY_RECOVERY_TEMPORARY_OVERFLOW_VOTER_BUDGET;
}

function buildPriorityRecoveryCompletion(options = {}) {
  const assessment =
    options.assessment && typeof options.assessment === 'object' ?
      options.assessment :
      null;
  const planner =
    assessment?.planner &&
    typeof assessment.planner === 'object' ?
      assessment.planner :
      null;
  const spreadCompletion =
    assessment?.spreadCompletion &&
    typeof assessment.spreadCompletion === 'object' ?
      assessment.spreadCompletion :
      null;
  const targetReplicaCount =
    normalizeNonNegativeInteger(options.targetReplicaCount);
  const activeVoterCount =
    normalizeNonNegativeInteger(options.activeVoterCount);
  const learnerCount =
    normalizeNonNegativeInteger(options.learnerCount);
  const retryAfterMs =
    normalizeNonNegativeInteger(options.retryAfterMs);
  const activeOperationCount =
    normalizeNonNegativeInteger(options.activeOperationCount) ??
    (Array.isArray(assessment?.activeOperationContexts) ?
      assessment.activeOperationContexts.length :
      0);
  const plannerSpreadGap =
    normalizeNonNegativeInteger(planner?.spreadGap);
  const plannerUnresolved =
    planner?.ready === false ||
    planner?.ready === null ||
    planner?.ready === undefined ||
    plannerSpreadGap > 0;
  const priorityRecoveryActive = options.priorityRecoveryActive === true;
  const authoritativeOperationReadDeferred =
    options.authoritativeOperationReadDeferred === true;
  const temporaryOverflowVoterBudget =
    options.allowTemporaryOverflowPromotion === true ?
      PRIORITY_RECOVERY_TEMPORARY_OVERFLOW_VOTER_BUDGET :
      resolvePriorityRecoveryTemporaryOverflowVoterBudget({
        targetReplicaCount,
        activeVoterCount,
        learnerCount,
        activeOperationCount,
        plannerUnresolved,
        priorityRecoveryActive,
      });
  const overTargetTemporaryOverflowAllowed =
    temporaryOverflowVoterBudget > 0;

  if (authoritativeOperationReadDeferred) {
    return Object.freeze({
      state:
        PRIORITY_RECOVERY_COMPLETION_STATE
          .OPERATION_VISIBILITY_DEFERRED,
      reasonCode:
        PRIORITY_RECOVERY_COMPLETION_REASON
          .OPERATION_VISIBILITY_DEFERRED,
      retryAfterMs,
      activeOperationCount,
      temporaryOverflowVoterBudget: 0,
      allowTemporaryOverflowPromotion: false,
      blocked: false,
    });
  }

  if (overTargetTemporaryOverflowAllowed) {
    return Object.freeze({
      state:
        PRIORITY_RECOVERY_COMPLETION_STATE.TEMPORARY_OVER_TARGET_ALLOWED,
      reasonCode:
        PRIORITY_RECOVERY_COMPLETION_REASON
          .TEMPORARY_OVER_TARGET_ALLOWED,
      retryAfterMs,
      activeOperationCount,
      temporaryOverflowVoterBudget,
      allowTemporaryOverflowPromotion: true,
      blocked: false,
    });
  }

  if (planner?.ready === true) {
    return Object.freeze({
      state: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
      reasonCode:
        spreadCompletion?.reasonCode ||
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.PLANNER_READY,
      retryAfterMs,
      activeOperationCount,
      temporaryOverflowVoterBudget: 0,
      allowTemporaryOverflowPromotion: false,
      blocked: false,
    });
  }

  if (spreadCompletion?.satisfied === true) {
    return Object.freeze({
      state:
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      reasonCode:
        spreadCompletion.reasonCode ||
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON
          .REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET,
      retryAfterMs,
      activeOperationCount,
      temporaryOverflowVoterBudget: 0,
      allowTemporaryOverflowPromotion: false,
      blocked: false,
    });
  }

  return Object.freeze({
    state: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
    reasonCode:
      spreadCompletion?.reasonCode ||
      PRIORITY_RECOVERY_COMPLETION_REASON.BLOCKED,
    retryAfterMs,
    activeOperationCount,
    temporaryOverflowVoterBudget: 0,
    allowTemporaryOverflowPromotion: false,
    blocked: true,
  });
}

export {
  PRIORITY_RECOVERY_COMPLETION_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
  buildPriorityRecoveryCompletion,
};
