import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {isOperationReconcileTerminal} from './operation-workflow-reconcile-outcome.js';
import {isPartitionReplace} from './operation-workflow-replace-owner.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL, REBALANCER_SKIP_REASON, ReplicaStatus,
  SYSTEM_TABLE_NAME,
} = OPERATION_WORKFLOW_OWNER_SHARED;

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
    const replaceResumeDecision =
      owner.buildCreateSatisfiedReplaceResumeDecision(operation);
    let replaceResumeResult = null;
    if (replaceResumeDecision.shouldResume) {
      replaceResumeResult =
        await owner.executeOperationFromReconcilePath(operation);
    }
    if (replaceResumeResult?.skipped === true) {
      owner.ensurePriorityActiveReplaceRetryArmed(operation);
    }
    const terminalOutcome = [replaceResumeResult?.reconcileOutcome, reconciled]
      .find(isOperationReconcileTerminal);
    return owner.buildSuccessfulOperationResult(operation.operationId, {
      status: responseStatus,
      ...(replace && terminalOutcome ? {reconcileOutcome: terminalOutcome} : progress),
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
