import {
  OperationType,
  isTerminalStep as isTerminalReplicaOperationStep,
  isValidWorkflowStep as isValidReplicaOperationStep,
} from '../rebalancer/replica-status.js';
import {
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
  PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET,
  STATUS_ACTIVE,
} from './priority-recovery-snapshot-contract.js';

const PRIORITY_RECOVERY_OPERATION_STEP_TERMINAL_STATE = Object.freeze({
  UNKNOWN: 'operation_step_terminal_unknown',
});

function resolvePriorityRecoveryOperationStepTerminalState(
  operationType,
  workflowStep,
) {
  const normalizedOperationType = String(operationType || '').toUpperCase();
  const normalizedWorkflowStep = String(workflowStep || '').toUpperCase();
  if (
    normalizedOperationType.length === 0 ||
    normalizedWorkflowStep.length === 0 ||
    !isValidReplicaOperationStep(
      normalizedOperationType,
      normalizedWorkflowStep,
    )
  ) {
    return PRIORITY_RECOVERY_OPERATION_STEP_TERMINAL_STATE.UNKNOWN;
  }
  return isTerminalReplicaOperationStep(
    normalizedOperationType,
    normalizedWorkflowStep,
  );
}

function shouldRetireOnTerminalTimelineDespiteStaleStep(
  operationContext,
  operationType,
  workflowStepTerminalState,
  latestTimelineStepTerminalState,
) {
  return (
    workflowStepTerminalState === false &&
    latestTimelineStepTerminalState === true &&
    operationContext.latestTimelineInFlight !== true &&
    operationType !== OperationType.ADD &&
    (operationType !== OperationType.REPLACE ||
      operationContext.targetVisibilityState ===
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL)
  );
}

function isPriorityRecoveryOperationContextTerminal(operationContext) {
  if (!operationContext || typeof operationContext !== 'object') {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  const workflowStepTerminalState =
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      operationContext.workflowStep,
    );
  if (workflowStepTerminalState === true) {
    return true;
  }
  const latestTimelineStepTerminalState =
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      operationContext.latestTimelineStep,
    );
  if (
    shouldRetireOnTerminalTimelineDespiteStaleStep(
      operationContext,
      operationType,
      workflowStepTerminalState,
      latestTimelineStepTerminalState,
    )
  ) {
    return true;
  }
  if (typeof workflowStepTerminalState === 'boolean') {
    return workflowStepTerminalState;
  }
  if (typeof latestTimelineStepTerminalState === 'boolean') {
    return latestTimelineStepTerminalState;
  }
  if (operationContext.latestTimelineInFlight === true) {
    return false;
  }
  const status = String(operationContext.status || '').toLowerCase();
  if (status.length === 0) {
    return false;
  }
  if (status === STATUS_ACTIVE) {
    return operationType !== OperationType.REPLACE;
  }
  return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
}

function isPriorityRecoveryCompletedAddOperationContext(operationContext) {
  if (!operationContext || typeof operationContext !== 'object') {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType !== OperationType.ADD) {
    return false;
  }
  const workflowStep = String(
    operationContext.workflowStep || '',
  ).toUpperCase();
  if (
    workflowStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      workflowStep,
    ) === true
  ) {
    return true;
  }
  const latestTimelineStep = String(
    operationContext.latestTimelineStep || '',
  ).toUpperCase();
  return (
    latestTimelineStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE &&
    operationContext.latestTimelineInFlight !== true &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      latestTimelineStep,
    ) === true
  );
}

function isPriorityRecoveryCompletedReplaceOperationContext(operationContext) {
  if (!operationContext || typeof operationContext !== 'object') {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType !== OperationType.REPLACE) {
    return false;
  }
  if (
    operationContext.targetVisibilityState !==
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  ) {
    return false;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
    return true;
  }
  const workflowStep = String(
    operationContext.workflowStep || '',
  ).toUpperCase();
  if (
    workflowStep.length > 0 &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      workflowStep,
    ) === true
  ) {
    return true;
  }
  const latestTimelineStep = String(
    operationContext.latestTimelineStep || '',
  ).toUpperCase();
  return (
    latestTimelineStep.length > 0 &&
    operationContext.latestTimelineInFlight !== true &&
    resolvePriorityRecoveryOperationStepTerminalState(
      operationType,
      latestTimelineStep,
    ) === true
  );
}

function isPriorityRecoveryCompletedPlacementOperationContext(
  operationContext,
) {
  return (
    isPriorityRecoveryCompletedAddOperationContext(operationContext) ||
    isPriorityRecoveryCompletedReplaceOperationContext(operationContext)
  );
}

export {
  isPriorityRecoveryCompletedAddOperationContext,
  isPriorityRecoveryCompletedPlacementOperationContext,
  isPriorityRecoveryCompletedReplaceOperationContext,
  isPriorityRecoveryOperationContextTerminal,
  resolvePriorityRecoveryOperationStepTerminalState,
};
