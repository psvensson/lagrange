import {test} from '../../src/test-helpers/tap.js';
import {EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {OperationWorkflowOwner} from
  '../../src/rebalancer/operation-workflow-owner.js';
import {
  DISPATCH_WAKE_PROGRESS_OUTCOME,
  reconcileDispatchWakeOperationProgress,
} from '../../src/rebalancer/operation-workflow-dispatch-wake-preemption.js';
import {
  COORDINATOR_CREATED_REMOTE_HANDOFF_MODE,
  resolveExecutorOutcomeRemoteOwnerHandoffMode,
  scheduleCoordinatorCreatedRemoteHandoffFollowUp,
} from '../../src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js';
import {
  registerCoordinatorCreatedRemoteHandoffCreateOperationTests,
} from './coordinator-created-operation-progress-remote-handoff-create-operation-test-cases.js';
import {
  registerCoordinatorCreatedRemoteHandoffPriorityRecoveryTests,
} from './coordinator-created-operation-progress-remote-handoff-priority-recovery-test-cases.js';

// The remote-handoff follow-up owner double: its timers land in
// scheduledCallbacks so a test fires them by hand.
function createRemoteHandoffFollowUpOwner(scheduledCallbacks, members) {
  return {
    isShuttingDown: false,
    repository: {isOperationTerminal: () => false},
    resolveTimeoutCheckNowMs: () => Date.now(),
    createdOperationHandoffRetryTimerByOperationId: new Map(),
    createdOperationHandoffRetryDeadlineMsByOperationId: new Map(),
    createdOperationHandoffRetryModeByOperationId: new Map(),
    createdOperationHandoffRetryTargetNodeByOperationId: new Map(),
    shouldRetryCoordinatorCreatedRemoteHandoff: () => true,
    canContinueCoordinatorCreatedRemoteHandoff: () => true,
    hasActiveCreatedOperationHandoffRetry(opId) {
      return this.createdOperationHandoffRetryTimerByOperationId.has(opId);
    },
    clearCreatedOperationHandoffRetry(opId) {
      this.createdOperationHandoffRetryTimerByOperationId.delete(opId);
      this.createdOperationHandoffRetryDeadlineMsByOperationId.delete(opId);
    },
    cloneOperationSnapshot: (snap) => ({...snap}),
    resolveCoordinatorCreatedOperationOwnerNodeId: () => 'node-owner',
    setTimeoutFn(fn, delayMs) {
      const handle = {id: scheduledCallbacks.length + 1, delayMs};
      scheduledCallbacks.push({handle, fn});
      return handle;
    },
    ...members,
  };
}

registerCoordinatorCreatedRemoteHandoffCreateOperationTests({test});
registerCoordinatorCreatedRemoteHandoffPriorityRecoveryTests({test});

test('RUNTIME_SERVICE_CREATE_FAILED wakes remote operation owner via TARGET_EXECUTOR_OUTCOME and stale timer callbacks cannot delete replaced timers', async (t) => {
  const operation = {
    operationId: 'op-runtime-failed-1',
    type: OperationType.ADD,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: 'svc-def-1',
    partitionId: 'user-table-p0',
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: Date.now(),
  };
  const handoffMode = resolveExecutorOutcomeRemoteOwnerHandoffMode(
    {isDispatchRetryableWorkflowStep: () => false},
    operation,
    {
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.FAILED,
    },
  );
  t.equal(
    handoffMode,
    COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
    'RUNTIME_SERVICE_CREATE_FAILED must wake the remote operation owner',
  );

  const scheduledCallbacks = [];
  const owner = createRemoteHandoffFollowUpOwner(scheduledCallbacks, {
    getDeferredDispatchRetryOperation: async () => null,
  });

  scheduleCoordinatorCreatedRemoteHandoffFollowUp(owner, operation, 5000, {
    handoffMode,
  });
  scheduleCoordinatorCreatedRemoteHandoffFollowUp(owner, operation, 100, {
    handoffMode,
  });
  t.equal(scheduledCallbacks.length, 2, 'earlier deadline replaces existing timer');
  const activeHandle = owner.createdOperationHandoffRetryTimerByOperationId.get(
    operation.operationId,
  );
  t.equal(activeHandle, scheduledCallbacks[1].handle);

  // Firing the stale first timer callback must not delete or consume the newer timer
  scheduledCallbacks[0].fn();
  t.equal(
    owner.createdOperationHandoffRetryTimerByOperationId.get(
      operation.operationId,
    ),
    scheduledCallbacks[1].handle,
    'stale timer callback must not delete the replaced active timer handle',
  );
});

test('RUNTIME_SERVICE_CREATE_FAILED with deferRetry=true defers transition retry and allows CREATING re-dispatch for partitionless runtime_service operations', async (t) => {
  const runtimeOperation = {
    operationId: 'op-runtime-defer-1',
    type: OperationType.ADD,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: 'sys-postgres-wire',
    partitionId: null,
    replicaId: 'sys-postgres-wire-r1',
    targetNodeId: 'node-1',
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const failedCalls = [];
  const deferredCalls = [];
  const owner = Object.create(OperationWorkflowOwner.prototype);
  owner.repository = {
    isReplaceRemoveDispatchPhase: () => false,
    isOperationTerminal: () => false,
    isOperationLocallyOwned: () => true,
  };
  owner.deferTransitionRetry = (operationId, errorLike, context) => {
    deferredCalls.push({operationId, errorLike, context});
    return true;
  };
  owner.failOperation = async (op, msg) => {
    failedCalls.push({op, msg});
  };
  owner.clearExecutorOutcomeRetryIfNotAhead = () => true;
  owner.emitter = {emit: () => {}};
  owner.logger = {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}};

  t.equal(
    owner.isCreateRearmDispatchPhase(runtimeOperation),
    true,
    'partitionless runtime_service operation at CREATING must be eligible for create re-arm dispatch',
  );
  t.equal(
    owner.isDispatchRetryableWorkflowStep(runtimeOperation),
    true,
    'partitionless runtime_service operation at CREATING must be dispatch-retryable',
  );

  const retryableError = owner.buildExecutorFailureOutcomeErrorLike(
    {
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: runtimeOperation.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.FAILED,
      [EXECUTOR_OUTCOME_FIELD.ERROR_CODE]:
        'service_definition_authority_unavailable',
      [EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE]:
        'Service definition authority unavailable',
      [EXECUTOR_OUTCOME_FIELD.DEFER_RETRY]: true,
    },
    'RUNTIME_SERVICE_CREATE_FAILED',
  );
  const retryableState = owner.resolveExecutorFailureReconcileState(
    owner.buildExecutorFailureReconcileEvidence(
      runtimeOperation,
      retryableError,
    ),
  );
  t.equal(
    retryableState,
    'defer_retry',
    'RUNTIME_SERVICE_CREATE_FAILED with deferRetry=true must resolve to defer_retry',
  );

  const terminalError = owner.buildExecutorFailureOutcomeErrorLike(
    {
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: runtimeOperation.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.FAILED,
      [EXECUTOR_OUTCOME_FIELD.ERROR_CODE]: 'service_definition_not_found',
      [EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE]: 'Service definition not found',
      [EXECUTOR_OUTCOME_FIELD.DEFER_RETRY]: false,
    },
    'RUNTIME_SERVICE_CREATE_FAILED',
  );
  const terminalState = owner.resolveExecutorFailureReconcileState(
    owner.buildExecutorFailureReconcileEvidence(
      runtimeOperation,
      terminalError,
    ),
  );
  t.equal(
    terminalState,
    'fail_operation',
    'RUNTIME_SERVICE_CREATE_FAILED with deferRetry=false must resolve to fail_operation',
  );
});

test('dispatch-wake preemption answers create_in_progress while target is authoritatively CREATING and remote-handoff INITIAL_DISPATCH stops once workflowStep advances to CREATING', async (t) => {
  const creatingOperation = {
    operationId: 'op-in-flight-creating-1',
    type: OperationType.ADD,
    entityType: UNIFIED_SERVICE_TYPE.PARTITION,
    partitionId: 'sql_write_operations-p1',
    replicaId: 'sql_write_operations-p1-r5',
    targetNodeId: 'node-target',
    workflowStep: WORKFLOW_STEP.CREATING,
  };
  // The wake's progress reconcile answers a named outcome; the in-progress
  // verdict reads the target's authoritative services row, never the cache.
  const buildWakeContext = () => ({
    isRemoveInitialDispatchPhase: () => false,
    reconcileDispatchWakePendingTargetProgress: async () => false,
    reconcileOperationLifecycle: async () => false,
    buildObservedTargetReplicaObservationOptions: () => ({}),
    repository: {
      getActualReplicaObservation: async () => ({
        state: 'observed',
        lifecycleStatus: ReplicaStatus.CREATING,
      }),
    },
  });
  t.equal(
    await reconcileDispatchWakeOperationProgress(
      buildWakeContext(),
      creatingOperation,
    ),
    DISPATCH_WAKE_PROGRESS_OUTCOME.CREATE_IN_PROGRESS,
    'a CREATING operation whose target is authoritatively CREATING answers create_in_progress, so the wake sends no duplicate CREATE_REPLICA',
  );

  const pendingOperation = {
    ...creatingOperation,
    workflowStep: WORKFLOW_STEP.PENDING,
  };
  t.equal(
    await reconcileDispatchWakeOperationProgress(
      buildWakeContext(),
      pendingOperation,
    ),
    DISPATCH_WAKE_PROGRESS_OUTCOME.NO_PROGRESS,
    'PENDING operation must still advance through its initial transition when observed target is CREATING',
  );

  const outcomeHandoffWhenPending =
    resolveExecutorOutcomeRemoteOwnerHandoffMode(
      {isDispatchRetryableWorkflowStep: () => true},
      pendingOperation,
      {
        [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
        [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.CREATING,
      },
    );
  t.equal(
    outcomeHandoffWhenPending,
    COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.INITIAL_DISPATCH,
    'REPLICA_CREATE_CREATING must arm INITIAL_DISPATCH when operation is still at PENDING',
  );

  const outcomeHandoffWhenAlreadyCreating =
    resolveExecutorOutcomeRemoteOwnerHandoffMode(
      {isDispatchRetryableWorkflowStep: () => true},
      creatingOperation,
      {
        [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
        [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.CREATING,
      },
    );
  t.equal(
    outcomeHandoffWhenAlreadyCreating,
    COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.NONE,
    'REPLICA_CREATE_CREATING must not arm a remote handoff wake when the operation is already at CREATING',
  );

  const scheduledCallbacks = [];
  let rearmed = false;
  const owner = createRemoteHandoffFollowUpOwner(scheduledCallbacks, {
    getDeferredDispatchRetryOperation: async () => creatingOperation,
    rearmCoordinatorCreatedRemoteHandoff: async () => {
      rearmed = true;
    },
  });
  scheduleCoordinatorCreatedRemoteHandoffFollowUp(owner, pendingOperation, 50, {
    handoffMode: COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.INITIAL_DISPATCH,
  });
  t.equal(scheduledCallbacks.length, 1, 'initial follow-up timer armed');
  await scheduledCallbacks[0].fn();
  t.equal(
    rearmed,
    false,
    'INITIAL_DISPATCH follow-up must stop without re-arming once operation has advanced to CREATING',
  );
  t.equal(
    owner.hasActiveCreatedOperationHandoffRetry(pendingOperation.operationId),
    false,
    'INITIAL_DISPATCH follow-up timer must be cleared once operation has advanced to CREATING',
  );
});
