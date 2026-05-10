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
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../control-plane/priority-recovery-snapshot.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE,
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
} from './operation-workflow-owner-ports.js';

const OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT = Object.freeze({});
const OPERATION_WORKFLOW_OWNER_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE =
  Object.freeze({
    OPERATION_UNAVAILABLE: 'operation_unavailable',
    NOT_OPERATION_WORKFLOW_OWNER: 'not_operation_workflow_owner',
    NOT_DISPATCH_PENDING: 'not_dispatch_pending',
    REBALANCER_HANDOFF_RETRY_ACTIVE: 'rebalancer_handoff_retry_active',
    PERSISTED_NOT_DISPATCHED: 'persisted_not_dispatched',
    EVENT_DRIVEN_ADVANCE: 'event_driven_advance',
    NOT_REENTERABLE: 'not_reenterable',
  });

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_ALLOWED_STATES =
  Object.freeze(new Set([
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .REBALANCER_HANDOFF_RETRY_ACTIVE,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .PERSISTED_NOT_DISPATCHED,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .EVENT_DRIVEN_ADVANCE,
  ]));

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_ACTUATION_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  ]));

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .OPERATION_UNAVAILABLE,
      matches: (evidence) => evidence.operationAvailable !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_OPERATION_WORKFLOW_OWNER,
      matches: (evidence) => evidence.operationWorkflowOwner !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_DISPATCH_PENDING,
      matches: (evidence) => evidence.dispatchPending !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .REBALANCER_HANDOFF_RETRY_ACTIVE,
      matches: (evidence) => evidence.rebalancerHandoffRetryActive === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .PERSISTED_NOT_DISPATCHED,
      matches: (evidence) => evidence.persistedNotDispatched === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .EVENT_DRIVEN_ADVANCE,
      matches: (evidence) => evidence.eventDrivenAdvance === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_REENTERABLE,
      matches: () => true,
    }),
  ]);

function buildOperationWorkflowOwnerDispatchPendingReentryEvidence(
  snapshot,
  operation,
  rebalancerHandoffRetryActive,
) {
  return Object.freeze({
    operationAvailable: Boolean(operation),
    operationWorkflowOwner:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    dispatchPending:
      OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_ACTUATION_STATES.has(
        snapshot?.actuation?.state,
      ) &&
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    persistedNotDispatched:
      snapshot?.actuation?.state ===
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    rebalancerHandoffRetryActive,
    eventDrivenAdvance:
      snapshot?.progress?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
      snapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
      snapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  });
}

function resolveOperationWorkflowOwnerDispatchPendingReentryState(evidence) {
  return (
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .OPERATION_UNAVAILABLE
  );
}

function shouldReenterOperationWorkflowOwnerDispatchPending(
  owner,
  snapshot,
  operation,
) {
  const operationId = String(
    operation?.operationId || OPERATION_WORKFLOW_OWNER_EMPTY_TEXT,
  ).trim();
  const evidence = buildOperationWorkflowOwnerDispatchPendingReentryEvidence(
    snapshot,
    operation,
    operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length &&
      owner.hasActiveCreatedOperationHandoffRetry(operationId),
  );
  return OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_ALLOWED_STATES.has(
    resolveOperationWorkflowOwnerDispatchPendingReentryState(evidence),
  );
}

function buildPriorityRecoveryDispatchPendingOwnerReentryContext(snapshot) {
  const baseContext = Object.freeze({
    mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
  });
  if (
    snapshot?.progress?.blockingBoundary !==
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT ||
    snapshot?.progress?.waitMode !==
      PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE
  ) {
    return baseContext;
  }
  return Object.freeze({
    ...baseContext,
    cause: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE.TIMEOUT,
  });
}

function normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
  owner,
  snapshot,
  operation,
) {
  if (!shouldReenterOperationWorkflowOwnerDispatchPending(
    owner,
    snapshot,
    operation,
  )) {
    return snapshot;
  }
  const normalizedSnapshot =
    normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
      snapshot,
      owner.operationWorkflowOwnerAdapter.decide(
        operation,
        buildPriorityRecoveryDispatchPendingOwnerReentryContext(snapshot),
      ),
    );
  owner.schedulePriorityRecoveryDispatchPendingReentry(
    normalizedSnapshot,
    [operation],
  );
  return normalizedSnapshot;
}

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
    return normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
      this,
      snapshot,
      operation,
    );
  }
}

export {OperationWorkflowOwner};
