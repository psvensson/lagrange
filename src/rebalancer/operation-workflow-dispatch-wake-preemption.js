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
  OPERATION_WORKFLOW_OWNER_REASON,
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

// What one dispatch wake's progress reconcile established. A wake is a
// request to reconcile, so only PROGRESS_RECONCILED is a success.
const DISPATCH_WAKE_PROGRESS_OUTCOME = Object.freeze({
  // The owner applied observed progress to the operation.
  PROGRESS_RECONCILED: 'progress_reconciled',
  // Nothing to apply, and the target's authoritative services row says the
  // create is in progress: the wake neither progresses nor re-sends. The
  // operation is released by the target's next lifecycle publication (the
  // observed-progress wake), by the owner's own dispatch and transition
  // retries (which re-send CREATE_REPLICA through the node-side admission
  // owner), or by the timeout sweep's CREATING step budget.
  CREATE_IN_PROGRESS: 'create_in_progress',
  // Nothing to apply and no authoritative in-progress evidence: the caller
  // continues on its dispatch path.
  NO_PROGRESS: 'no_progress',
});

/**
 * Whether the target's authoritative services row reports the create in
 * progress. An absent, unavailable or cache-only observation is not evidence:
 * the create may be lost, and the dispatch path must be free to re-send.
 * @param {Object} context
 * @param {Object} operation
 * @return {Promise<boolean>}
 */
async function isTargetCreateAuthoritativelyInProgress(context, operation) {
  if (operation?.workflowStep !== WORKFLOW_STEP.CREATING) {
    return false;
  }
  const observation = await context.repository.getActualReplicaObservation(
    operation.replicaId,
    operation.partitionId,
    operation.targetNodeId,
    context.buildObservedTargetReplicaObservationOptions(operation),
  );
  return observation?.state === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED &&
    observation.lifecycleStatus === ReplicaStatus.CREATING;
}

/**
 * Dispatch wakeups can arrive after cache evidence has already moved the
 * replica beyond the current durable step. Let the owner reconcile that
 * progress before replaying create dispatch or classifying the wakeup as
 * non-dispatchable.
 *
 * @param {Object} context
 * @param {Object} operation
 * @return {Promise<string>} DISPATCH_WAKE_PROGRESS_OUTCOME.
 */
async function reconcileDispatchWakeOperationProgress(context, operation) {
  // An initial REMOVE dispatch has no target progress to reconcile: the
  // dispatch path executes it and answers the execute's own typed result
  // (a safety-blocked remove is a skip, never this wake's success).
  if (context.isRemoveInitialDispatchPhase(operation)) {
    return DISPATCH_WAKE_PROGRESS_OUTCOME.NO_PROGRESS;
  }
  if (
    await context.reconcileDispatchWakePendingTargetProgress(operation) ||
    await context.reconcileOperationLifecycle(operation, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
    }) === true
  ) {
    return DISPATCH_WAKE_PROGRESS_OUTCOME.PROGRESS_RECONCILED;
  }
  return await isTargetCreateAuthoritativelyInProgress(context, operation) ?
    DISPATCH_WAKE_PROGRESS_OUTCOME.CREATE_IN_PROGRESS :
    DISPATCH_WAKE_PROGRESS_OUTCOME.NO_PROGRESS;
}

/**
 * The caller's result for one settled dispatch wake: success when progress
 * was reconciled, a typed skip while the create is authoritatively in
 * progress, null when the dispatch path continues.
 * @param {Object} context
 * @param {Object} operation
 * @return {Promise<Object|null>}
 */
async function resolveDispatchWakeProgressResult(context, operation) {
  const outcome = await context.reconcileDispatchWakeOperationProgress(
    operation,
  );
  if (outcome === DISPATCH_WAKE_PROGRESS_OUTCOME.PROGRESS_RECONCILED) {
    return context.buildSuccessfulOperationResult(operation.operationId);
  }
  if (outcome === DISPATCH_WAKE_PROGRESS_OUTCOME.CREATE_IN_PROGRESS) {
    return context.buildSkippedOperationResult(
      OPERATION_WORKFLOW_OWNER_REASON.CREATE_IN_PROGRESS,
      operation.operationId,
    );
  }
  return null;
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
  DISPATCH_WAKE_PROGRESS_OUTCOME,
  getDispatchWakeObservedTargetStatus,
  isExplicitDispatchWakeProgressInput,
  isOperationRowDispatchWakeInput,
  reconcileDispatchWakeOperationProgress,
  reconcileDispatchWakePendingTargetProgress,
  resolveDispatchWakeProgressPreemptState,
  resolveDispatchWakeProgressResult,
  shouldPreemptCreateRearmWithObservedProgress,
};
