import {test} from '../../src/test-helpers/tap.js';
import {EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
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
  const owner = {
    isShuttingDown: false,
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
    getDeferredDispatchRetryOperation: async () => null,
  };

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
