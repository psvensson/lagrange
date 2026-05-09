/**
 * Owner contract:
 * Owner: OperationWorkflowOwner owns replica-operation workflow lifecycle progress.
 * Inputs: operation repository state, executor outcomes, readiness, replica status.
 * Canonical output: one workflow owner class with canonical transition methods.
 * Prohibited fallbacks: callers must not import segment classes to bypass this surface.
 * Primary tests: test/rebalancer/replace-replica-workflow.test.js.
 */
import {OperationWorkflowOwnerSegment7} from
  './operation-workflow-owner-segment-7.js';
import {createOperationWorkflowOwnerAdapter} from
  './operation-workflow-owner-adapter.js';
import {
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../control-plane/priority-recovery-snapshot.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
} from './operation-workflow-owner-ports.js';

const OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT = Object.freeze({});
const OPERATION_WORKFLOW_OWNER_ADAPTER_SNAPSHOT = Object.freeze({
  DISPATCH_PENDING_PHASE: 'dispatch_pending',
  DISPATCHED_WAITING_PROGRESS: 'dispatched_waiting_progress',
  OPERATION_WORKFLOW_OWNER: 'operation_workflow_owner',
});

class OperationWorkflowOwner extends OperationWorkflowOwnerSegment7 {
  constructor(options) {
    super(options);
    this.operationWorkflowOwnerPorts =
      createOperationWorkflowOwnerPorts(this);
    this.operationWorkflowOwnerAdapter =
      createOperationWorkflowOwnerAdapter({
        ports: this.operationWorkflowOwnerPorts,
      });
  }

  async runOperationWorkflowOwnerAdapter(operationInput, context) {
    const result = await this.operationWorkflowOwnerAdapter.run(
      operationInput,
      context,
    );
    return result.applied === true;
  }

  async armCoordinatorCreatedOperation(operationInput) {
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
      return false;
    }

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);
    try {
      return await this.operationWorkflowRunExclusive(
        singleFlightKey,
        () => this.runOperationWorkflowOwnerAdapter(
          operationInput,
          {
            mode:
              OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE
                .COORDINATOR_CREATED_OPERATION,
            fallbackOperation: operationInput,
          },
        ),
      );
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
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    const operation = visibilityObservation?.operation || null;
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
    return this.runOperationWorkflowOwnerAdapter(
      operation,
      {
        ...options,
        mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
      },
    );
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
    if (
      !operation ||
      snapshot?.progress?.workflowProgressPhaseId !==
        OPERATION_WORKFLOW_OWNER_ADAPTER_SNAPSHOT.DISPATCH_PENDING_PHASE ||
      snapshot?.progress?.currentOwner !==
        OPERATION_WORKFLOW_OWNER_ADAPTER_SNAPSHOT.OPERATION_WORKFLOW_OWNER ||
      snapshot?.actuation?.state ===
        OPERATION_WORKFLOW_OWNER_ADAPTER_SNAPSHOT
          .DISPATCHED_WAITING_PROGRESS &&
        !this.hasActiveCreatedOperationHandoffRetry(operation.operationId)
    ) {
      return snapshot;
    }
    return normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
      snapshot,
      this.operationWorkflowOwnerAdapter.decide(operation, {
        mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
      }),
    );
  }
}

export {OperationWorkflowOwner};
