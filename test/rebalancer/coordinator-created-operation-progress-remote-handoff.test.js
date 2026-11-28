import {buildTerminalOperationFixtureOutcome} from './operation-outcome-fixture.js';
import {test} from '../../src/test-helpers/tap.js';
import {EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {OperationWorkflowOwner} from
  '../../src/rebalancer/operation-workflow-owner.js';
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

test('RUNTIME_SERVICE_CREATE_FAILED with deferRetry=true defers transition retry and allows CREATING re-dispatch for logical runtime_service operations', async (t) => {
  const runtimeOperation = {
    operationId: 'op-runtime-defer-1',
    type: OperationType.ADD,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: 'sys-postgres-wire',
    partitionId: 'sys-postgres-wire',
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
    return buildTerminalOperationFixtureOutcome(op, {failed: true});
  };
  owner.clearExecutorOutcomeRetryIfNotAhead = () => true;
  owner.emitter = {emit: () => {}};
  owner.logger = {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}};

  t.equal(
    owner.isCreateRearmDispatchPhase(runtimeOperation),
    true,
    'logical runtime_service operation at CREATING must be eligible for create re-arm dispatch',
  );
  t.equal(
    owner.isDispatchRetryableWorkflowStep(runtimeOperation),
    true,
    'logical runtime_service operation at CREATING must be dispatch-retryable',
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

test('system and priority partition ADD in SYNCING wakes remote source owner on REPLICA_CREATE_ACTIVE or REPLICA_CREATE_FAILED', async (t) => {
  const systemSyncingOp = {
    operationId: 'op-sys-syncing',
    type: OperationType.ADD,
    entityType: UNIFIED_SERVICE_TYPE.PARTITION,
    partitionId: 'tables-p1',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    workflowStep: WORKFLOW_STEP.SYNCING,
  };
  const owner = {isDispatchRetryableWorkflowStep: () => false};
  const activeMode = resolveExecutorOutcomeRemoteOwnerHandoffMode(
    owner,
    systemSyncingOp,
    {
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: systemSyncingOp.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.ACTIVE,
    },
  );
  const failedMode = resolveExecutorOutcomeRemoteOwnerHandoffMode(
    owner,
    systemSyncingOp,
    {
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: systemSyncingOp.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.FAILED,
    },
  );
  t.equal(
    activeMode,
    COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
    'target executor wakes remote source owner for system partition ADD in SYNCING on REPLICA_CREATE_ACTIVE',
  );
  t.equal(
    failedMode,
    COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
    'target executor wakes remote source owner for system partition ADD in SYNCING on REPLICA_CREATE_FAILED',
  );
});
