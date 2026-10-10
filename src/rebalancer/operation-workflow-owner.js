/**
 * Owner contract:
 * Owner: OperationWorkflowOwner owns replica-operation workflow lifecycle progress.
 * Inputs: operation repository state, executor outcomes, readiness, replica status.
 * Canonical output: one workflow owner class with canonical transition methods.
 * Prohibited fallbacks: callers must not import segment classes to bypass this surface.
 * Primary tests: test/rebalancer/replace-replica-workflow.test.js.
 */
import {OperationWorkflowRecoveryReconcile} from
  './operation-workflow-recovery-reconcile.js';
import {createOperationWorkflowOwnerAdapter} from
  './operation-workflow-owner-adapter.js';
import {createOperationProgressStore} from './operation-progress-store.js';
import {resolveCoordinatorCreatedDispatchPhase} from
  './operation-workflow-owner-create-budget-dispatch.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
} from './operation-workflow-owner-ports.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
} from './operation-workflow-owner-constants.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED,
} from './operation-workflow-recovery-reconcile-shared.js';
import {
  applyOperationWorkflowOwnerTargetProgressReentryAction,
  normalizeOperationWorkflowOwnerTargetProgressOwnerSnapshot,
  resolveOperationWorkflowOwnerTargetProgressReentryAction,
} from './operation-workflow-owner-priority-recovery-reentry.js';
import {
  OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID,
  isOperationWorkflowOwnerSnapshotCandidate,
  normalizeOperationWorkflowOwnerSnapshotOperationId,
  normalizePriorityRecoveryDispatchPendingOwnerSnapshot,
} from './operation-workflow-owner-dispatch-pending-reentry.js';

const OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT = Object.freeze({});
const OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_BOUNDARY =
  'coordinator_created_local_initialization';
const OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_ERROR =
  'control_plane_pressure_degraded while local workflow owner initialization is pending';
const OPERATION_WORKFLOW_OWNER_NO_OPERATION = null;
const {
  OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION:
    OPERATION_WORKFLOW_OWNER_OBSERVED_PROGRESS_ROUTE_ACTION,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
function shouldReturnDeferredDispatchOwnerProgressResult(result) {
  return (
    result?.applied !== true &&
    result?.outcome?.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER &&
    result?.command?.effectCommand ===
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND
  );
}
import {recordMessageGroupLearnerFromRecipient, recoverMessageGroupLearnerFromRecipient} from
  './operation-workflow-message-group-native-read.js';

class OperationWorkflowOwner extends OperationWorkflowRecoveryReconcile {
  constructor(options) {
    super(options);
    // The DT6 TimeSource seam is owned by OperationWorkflowRecoveryTimeout.
    this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId =
      new Map();
    // Consecutive UNAVAILABLE stopping-observation deferrals per operation;
    // consumed by the bounded starvation escalation in
    // reconcileStoppingOperationProgress and cleared on any non-UNAVAILABLE
    // observation (only real observation evidence resets the bound).
    this.stoppingObservationDeferralsByOperationId = new Map();
    this.operationWorkflowOwnerPorts =
      createOperationWorkflowOwnerPorts(this);
    this.operationProgressStore =
      options?.operationProgressStore || createOperationProgressStore();
    this.operationWorkflowOwnerAdapter =
      createOperationWorkflowOwnerAdapter({
        ports: this.operationWorkflowOwnerPorts,
      });
  }

  /** Recover the exact issued learner through the registered native recipient.
   * No ordinary workflow transition or CREATE permission follows from RECORDED.
   */
  recordMessageGroupLearnerOutcomeFromRecipient(request, recipient) {
    return recordMessageGroupLearnerFromRecipient(this, request, recipient);
  }

  /** Restart entry: the repository reconstructs the receipt input from durable state. */
  recoverMessageGroupLearnerOutcomeFromRecipient(operationId, recipient) {
    return recoverMessageGroupLearnerFromRecipient(this, operationId, recipient);
  }

  selectOperationWorkflowOwnerAdapterSnapshotOperation(
    operationInput,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    if (isOperationWorkflowOwnerSnapshotCandidate(operationInput)) {
      return operationInput;
    }
    if (isOperationWorkflowOwnerSnapshotCandidate(context?.operationSnapshot)) {
      return context.operationSnapshot;
    }
    if (isOperationWorkflowOwnerSnapshotCandidate(context?.operation)) {
      return context.operation;
    }
    if (isOperationWorkflowOwnerSnapshotCandidate(context?.fallbackOperation)) {
      return context.fallbackOperation;
    }
    return OPERATION_WORKFLOW_OWNER_NO_OPERATION;
  }

  retainOperationWorkflowOwnerAdapterOperationSnapshot(
    operationInput,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    const operation = this.selectOperationWorkflowOwnerAdapterSnapshotOperation(
      operationInput,
      context,
    );
    const operationId =
      normalizeOperationWorkflowOwnerSnapshotOperationId(operation);
    if (!operationId) {
      return OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID;
    }
    const operationSnapshot = this.cloneOperationSnapshot(operation);
    if (!operationSnapshot) {
      return OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID;
    }
    this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId.set(
      operationId,
      operationSnapshot,
    );
    return operationId;
  }

  clearOperationWorkflowOwnerAdapterOperationSnapshot(operationId) {
    if (!operationId) {
      return;
    }
    this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId.delete(
      operationId,
    );
  }

  buildTransitionRetryContextWithAdapterOperationSnapshot(
    operationId,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    if (
      isOperationWorkflowOwnerSnapshotCandidate(context?.operationSnapshot) ||
      isOperationWorkflowOwnerSnapshotCandidate(context?.operation)
    ) {
      return context;
    }
    const operationSnapshot =
      this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId.get(
        operationId,
      );
    if (!operationSnapshot) {
      return context;
    }
    return {
      ...context,
      operationSnapshot: this.cloneOperationSnapshot(operationSnapshot),
    };
  }

  deferTransitionRetry(
    operationId,
    errorLike,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    return super.deferTransitionRetry(
      operationId,
      errorLike,
      this.buildTransitionRetryContextWithAdapterOperationSnapshot(
        operationId,
        context,
      ),
    );
  }

  async runOperationWorkflowOwnerAdapter(
    operationInput,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    const retainedOperationId =
      this.retainOperationWorkflowOwnerAdapterOperationSnapshot(
        operationInput,
        context,
      );
    try {
      const result = await this.operationWorkflowOwnerAdapter.run(
        operationInput,
        context,
      );
      return result;
    } finally {
      this.clearOperationWorkflowOwnerAdapterOperationSnapshot(
        retainedOperationId,
      );
    }
  }

  buildCoordinatorCreatedLocalInitializationRetryError() {
    const error = new Error(
      OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_ERROR,
    );
    error.deferRetry = true;
    return error;
  }

  shouldDeferCoordinatorCreatedLocalInitialization(operationInput) {
    return (
      this.isCoordinatorCreatedOperationLocallyOwned(operationInput) &&
      this.isDispatchRetryableWorkflowStep(operationInput)
    );
  }

  deferCoordinatorCreatedLocalInitializationRetry(operationInput) {
    const operationId = operationInput?.operationId || null;
    if (
      !operationId ||
      !this.shouldDeferCoordinatorCreatedLocalInitialization(operationInput)
    ) {
      return false;
    }
    return this.deferTransitionRetry(
      operationId,
      this.buildCoordinatorCreatedLocalInitializationRetryError(),
      {
        boundary: OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_BOUNDARY,
        workflowStep: operationInput?.workflowStep || null,
        partitionId: operationInput?.partitionId || null,
        updatedAt: operationInput?.updatedAt,
        createdAt: operationInput?.createdAt,
        operationSnapshot: operationInput,
      },
    );
  }

  async armCoordinatorCreatedOperation(operationInput, armContext) {
    const operationId = operationInput?.operationId || null;
    if (!operationId || this.isShuttingDown) {
      return false;
    }
    if (
      !this.isInitialized &&
      !this.shouldArmCoordinatorCreatedOperationWhileUninitialized(
        operationInput,
      )
    ) {
      return this.deferCoordinatorCreatedLocalInitializationRetry(
        operationInput,
      );
    }

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);
    try {
      const result = await this.operationWorkflowRunExclusive(
        singleFlightKey,
        () => this.runOperationWorkflowOwnerAdapter(
          operationInput,
          {
            mode:
              OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE
                .COORDINATOR_CREATED_OPERATION,
            fallbackOperation: operationInput,
            coordinatorCreatedDispatchPhase:
              resolveCoordinatorCreatedDispatchPhase(armContext),
          },
        ),
      );
      if (result?.applied === true) {
        return true;
      }
      if (shouldReturnDeferredDispatchOwnerProgressResult(result)) {
        return result;
      }
      return false;
    } catch (error) {
      if (
        this.deferCoordinatorCreatedRemoteHandoffRetry(operationInput, error)
      ) {
        return false;
      }
      throw error;
    }
  }

  async reconcileObservedProgressOperation(operationId) {
    if (!operationId) {
      return false;
    }
    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    const operation = visibilityObservation?.operation || null;
    const routeEvidence =
      this.buildObservedProgressOperationRouteEvidence(operation);
    const routeAction =
      this.resolveObservedProgressOperationRouteAction(routeEvidence);
    if (
      routeAction ===
      OPERATION_WORKFLOW_OWNER_OBSERVED_PROGRESS_ROUTE_ACTION.SKIP
    ) {
      this.clearObservedProgressRetry(operationId);
      return false;
    }
    if (
      routeAction ===
      OPERATION_WORKFLOW_OWNER_OBSERVED_PROGRESS_ROUTE_ACTION.WAKE_REMOTE_OWNER
    ) {
      const woken = await this.wakeCoordinatorCreatedRemoteOwner(operation);
      this.clearObservedProgressRetry(operationId);
      return woken;
    }
    try {
      return await this.runOperationWorkflowOwnerAdapter(
        operation,
        {
          ...OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
          mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OBSERVED_PROGRESS,
        },
      );
    } finally {
      this.clearObservedProgressRetry(operationId);
    }
  }

  async reconcileOperationProgress(
    operation,
    options = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    return super.reconcileOperationProgress(operation, options);
  }

  async getPriorityRecoveryDecisionSnapshotForPartitionOperations(
    partitionId,
    operations = [],
  ) {
    const snapshot =
      await super.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
        partitionId,
        operations,
      );
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const normalizedSnapshot =
      this.normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
        snapshot,
        operation,
      );
    const targetProgressNormalizedSnapshot =
      normalizeOperationWorkflowOwnerTargetProgressOwnerSnapshot(
        this,
        normalizedSnapshot,
        operation,
      );
    this.schedulePriorityRecoveryTargetProgressReentry(
      targetProgressNormalizedSnapshot,
      operation ? [operation] : operations,
    );
    return targetProgressNormalizedSnapshot;
  }

  buildPriorityRecoveryDecisionSnapshotForOperations(
    partitionId,
    operations = [],
    planningSnapshot = null,
    incompleteOperationObservation = null,
  ) {
    const snapshot = super.buildPriorityRecoveryDecisionSnapshotForOperations(
      partitionId,
      operations,
      planningSnapshot,
      incompleteOperationObservation,
    );
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const normalizedSnapshot =
      this.normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
        snapshot,
        operation,
      );
    const targetProgressNormalizedSnapshot =
      normalizeOperationWorkflowOwnerTargetProgressOwnerSnapshot(
        this,
        normalizedSnapshot,
        operation,
      );
    this.schedulePriorityRecoveryTargetProgressReentry(
      targetProgressNormalizedSnapshot,
      operations,
    );
    return targetProgressNormalizedSnapshot;
  }

  normalizePriorityRecoveryDispatchPendingOwnerSnapshot(snapshot, operation) {
    return normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
      this,
      snapshot,
      operation,
    );
  }

  schedulePriorityRecoveryTargetProgressReentry(snapshot, operations = []) {
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const action =
      resolveOperationWorkflowOwnerTargetProgressReentryAction(
        this,
        snapshot,
        operation,
      );
    return applyOperationWorkflowOwnerTargetProgressReentryAction(
      this,
      operation,
      action,
    );
  }
}

export {OperationWorkflowOwner};
