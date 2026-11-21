import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {isOperationReconcileTerminal, OPERATION_RECONCILE_OUTCOME} from './operation-workflow-reconcile-outcome.js';
import {isPartitionReplace} from './operation-workflow-replace-owner.js';
import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL, REBALANCER_SKIP_REASON, ReplicaStatus,
  SYSTEM_TABLE_NAME,
} = OPERATION_WORKFLOW_OWNER_SHARED;

async function dispatchObservedTerminal(owner, operation, responseStatus, progress) {
  const observation = await owner.repository.observeOperationTransition(
    operation, operation.workflowStep, {terminalTransition: true},
  );
  if (!observation.outcome) {
    if (observation.deferredOutcome) {
      owner.deferObservedProgressRetry(operation.operationId, SYSTEM_TABLE_NAME.SERVICES,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT, observation.deferredOutcome);
    }
    return owner.buildSkippedOperationResult(
      OPERATION_RECONCILE_OUTCOME.WAITING, operation.operationId, progress,
    );
  }
  return owner.buildTerminalOperationDispatchResult(
    buildOperationTransitionOutcome(observation.outcome),
    {operationId: operation.operationId, status: responseStatus},
  );
}

// The dispatch owner may work on a detached operation. Capture its confirmed
// promotion before starting source removal, whose effect can be deferred.
async function reconcileSatisfiedCreateResponse(owner, operation, responseStatus) {
  const replace = isPartitionReplace(operation);
  const progress = {};
  try {
    const reconciled = await owner.applyReconciledReplicaStatus(
      operation,
      ReplicaStatus.ACTIVE,
      {
        onCommittedPromotion(outcome) {
          if (replace) progress.reconcileOutcome = outcome;
        },
      },
    );
    if (replace && isOperationReconcileTerminal(reconciled)) {
      return await dispatchObservedTerminal(owner, operation, responseStatus, progress);
    }
    const replaceResumeDecision =
      owner.buildCreateSatisfiedReplaceResumeDecision(operation);
    let replaceResumeResult = null;
    if (replaceResumeDecision.shouldResume) {
      replaceResumeResult =
        await owner.executeOperationFromReconcilePath(operation);
    }
    if (replace && isOperationReconcileTerminal(replaceResumeResult?.reconcileOutcome)) {
      return replaceResumeResult;
    }
    if (replaceResumeResult?.skipped === true) {
      owner.ensurePriorityActiveReplaceRetryArmed(operation);
    }
    return owner.buildSuccessfulOperationResult(operation.operationId, {
      status: responseStatus,
      ...progress,
    });
  } catch (error) {
    if (
      owner.deferObservedProgressRetry(
        operation?.operationId || null,
        SYSTEM_TABLE_NAME.SERVICES,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
        error,
      )
    ) {
      return owner.buildSkippedOperationResult(
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        operation?.operationId || null,
        {
          ...progress,
          error: owner.normalizeErrorMessage(
            error,
            OPERATION_WORKFLOW_OWNER_LITERAL
              .RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE,
          ),
        },
      );
    }
    throw error;
  }
}

export {reconcileSatisfiedCreateResponse};
