import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';
import {OPERATION_METADATA_KEY} from './replica-operation-progress.js';
import {PLACEMENT_TRANSITION_KIND} from './replica-placement-owner-constants.js';
import {readOriginalCreateBootstrapMembership, OperationType} from './replica-status.js';

const PLACEMENT_BOOTSTRAP_WAIT = 'placement_bootstrap_authority_wait';

function requiresPlacementCreateBootstrapTopology(
  operation,
  replaceRemoveDispatchPhase,
) {
  if (!operation || replaceRemoveDispatchPhase === true ||
      (operation.type !== OperationType.ADD &&
        operation.type !== OperationType.REPLACE) ||
      operation.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE ||
      operation.entityType === UNIFIED_SERVICE_TYPE.MESSAGE_GROUP) {
    return false;
  }
  const placementAdmission =
    operation.stepsHistory?.[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  return placementAdmission?.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT;
}

function isPlacementBootstrapAwaitingAuthority(operation) {
  return requiresPlacementCreateBootstrapTopology(operation, false) &&
    operation.completedAt === null &&
    operation.createAdmissionState == null &&
    (operation.workflowStep === WORKFLOW_STEP.PENDING ||
      operation.workflowStep === WORKFLOW_STEP.SENDING) &&
    readOriginalCreateBootstrapMembership(operation.stepsHistory) === null;
}

function isPlacementBootstrapBeforeDeadline(operation, now) {
  return Number.isFinite(operation.createdAt) && Number.isFinite(now) &&
    now < operation.createdAt + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
}

export {
  isPlacementBootstrapAwaitingAuthority,
  isPlacementBootstrapBeforeDeadline,
  requiresPlacementCreateBootstrapTopology,
  PLACEMENT_BOOTSTRAP_WAIT,
};
