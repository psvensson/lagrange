import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS,
} from './replica-operation-step-policy.js';
import {
  DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE,
  isDispatchWakeProgressPreemptStateAllowed,
  resolveDispatchWakePendingTargetProgressState,
  resolveDispatchWakeProgressPreemptState as resolvePreemptStateDecision,
} from './operation-workflow-dispatch-wake-progress-decision.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP,
  classifySystemPartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const DISPATCH_WAKE_PROGRESS_PREEMPT_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.FAILED,
  ]),
);

/**
 * @param {string|Object} operationInput
 * @return {boolean}
 */
function isOperationRowDispatchWakeInput(operationInput) {
  return (
    operationInput &&
    typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT &&
    typeof operationInput.operation_id ===
      OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
    operationInput.operation_id.length > 0
  );
}

/**
 * @param {Object} options
 * @return {boolean}
 */
function isExplicitDispatchWakeProgressInput(options) {
  return (
    options?.cause ===
    OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_OPERATION_DISPATCH
  );
}

/**
 * @param {Object} context
 * @param {Object} operation
 * @return {string}
 */
function getDispatchWakeObservedTargetStatus(context, operation) {
  if (
    typeof context.getObservedOperationRowTargetProgressStatus !==
      'function'
  ) {
    return OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
  }
  const observedTargetStatus =
    context.getObservedOperationRowTargetProgressStatus(operation);
  return typeof observedTargetStatus === 'string' ?
    observedTargetStatus :
    OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
}

/**
 * @param {Object} context
 * @param {string|Object} operationInput
 * @param {Object} operation
 * @param {boolean} createRearmDispatchPhase
 * @param {Object} [options={}]
 * @return {Object}
 */
function buildDispatchWakeProgressPreemptEvidence(
  context,
  operationInput,
  operation,
  createRearmDispatchPhase,
  options = {},
) {
  const observedTargetStatus =
    context.getDispatchWakeObservedTargetStatus(operation);
  const dispatchWakeInput =
    context.isOperationRowDispatchWakeInput(operationInput) ||
    context.isExplicitDispatchWakeProgressInput(options);
  return Object.freeze({
    operationAvailable: Boolean(operation),
    progressWakeWorkflowStep:
      createRearmDispatchPhase === true ||
      DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS.has(
        operation?.workflowStep,
      ),
    dispatchWakeInput,
    progressReconcilerAvailable:
      typeof context.reconcileOperationProgress === 'function',
    observedPreemptStatus:
      DISPATCH_WAKE_PROGRESS_PREEMPT_STATUSES.has(observedTargetStatus),
    boundedPendingWakeReconcile:
      dispatchWakeInput === true &&
      operation?.workflowStep === WORKFLOW_STEP.PENDING &&
      (
        classifySystemPartition({
          partitionId: operation?.partitionId,
        }).systemTable ||
        classifySystemPartition({
          partitionId: operation?.partitionId,
        }).priorityControlPlane
      ),
    observedTargetStatus,
  });
}

/**
 * @param {Object} evidence
 * @return {string}
 */
function resolveDispatchWakeProgressPreemptState(evidence) {
  return resolvePreemptStateDecision(evidence);
}

/**
 * @param {Object} context
 * @param {string|Object} operationInput
 * @param {Object} operation
 * @param {boolean} createRearmDispatchPhase
 * @param {Object} [options={}]
 * @return {boolean}
 */
function shouldPreemptCreateRearmWithObservedProgress(
  context,
  operationInput,
  operation,
  createRearmDispatchPhase,
  options = {},
) {
  const evidence = context.buildDispatchWakeProgressPreemptEvidence(
    operationInput,
    operation,
    createRearmDispatchPhase,
    options,
  );
  const state = context.resolveDispatchWakeProgressPreemptState(evidence);
  return isDispatchWakeProgressPreemptStateAllowed(state);
}

/**
 * Dispatch wakeups can arrive after cache evidence has already moved the
 * replica beyond the current durable step. Let the owner reconcile that
 * progress before replaying create dispatch or classifying the wakeup as
 * non-dispatchable.
 *
 * @param {Object} context
 * @param {Object} operation
 * @return {Promise<boolean>}
 */
async function reconcileDispatchWakeOperationProgress(context, operation) {
  if (
    await context.reconcileDispatchWakePendingTargetProgress(operation)
  ) {
    return true;
  }
  if (typeof context.reconcileOperationLifecycle === 'function') {
    return context.reconcileOperationLifecycle(operation, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
    });
  }
  if (typeof context.reconcileOperationProgress !== 'function') {
    return false;
  }
  return context.reconcileOperationProgress(operation, {
    cause: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
  });
}

/**
 * PENDING dispatch wakes with target evidence need only persist the target
 * progress transition for create-phase operations. A target `pending` row
 * proves the create handler accepted the request, so it advances the durable
 * owner row to CREATING. REMOVE uses the existing replica as its source, so an
 * ACTIVE row is a remove precondition rather than target-create progress.
 * Running the full replace execution path here can turn a duplicate-create
 * guard into a source-removal safety failure.
 *
 * @param {Object} context
 * @param {Object} operation
 * @return {Promise<boolean>}
 */
async function reconcileDispatchWakePendingTargetProgress(
  context,
  operation,
) {
  if (operation?.type === OperationType.REMOVE) {
    return false;
  }
  const statusReconcilerAvailable =
    typeof context.getReconciledReplicaStatus === 'function';
  const actualTargetStatus = statusReconcilerAvailable === true ?
    await context.getReconciledReplicaStatus(
      operation?.replicaId,
      operation?.partitionId,
      operation?.targetNodeId,
      {
        entityType: operation?.entityType || operation?.entity_type || null,
      },
    ) :
    OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
  const reconciledTargetStatus =
    typeof context.resolveReconciledReplicaStatus === 'function' ?
      context.resolveReconciledReplicaStatus(operation, actualTargetStatus) :
      actualTargetStatus;
  const state = resolveDispatchWakePendingTargetProgressState(
    Object.freeze({
      operationAvailable: Boolean(operation),
      pendingWorkflowStep: operation?.workflowStep === WORKFLOW_STEP.PENDING,
      statusReconcilerAvailable,
      reconciledTargetStatus,
    }),
  );

  if (state === DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.TARGET_PENDING) {
    await context.updateStep(operation, WORKFLOW_STEP.CREATING);
    return true;
  }
  if (state === DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.TARGET_SYNCING) {
    await context.updateStep(operation, WORKFLOW_STEP.SYNCING);
    return true;
  }
  if (state === DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.TARGET_ACTIVE) {
    await context.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    return true;
  }
  return false;
}

export {
  buildDispatchWakeProgressPreemptEvidence,
  getDispatchWakeObservedTargetStatus,
  isExplicitDispatchWakeProgressInput,
  isOperationRowDispatchWakeInput,
  reconcileDispatchWakeOperationProgress,
  reconcileDispatchWakePendingTargetProgress,
  resolveDispatchWakeProgressPreemptState,
  shouldPreemptCreateRearmWithObservedProgress,
};
