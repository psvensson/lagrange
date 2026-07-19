import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {ExecutorOutcomeEmitter} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {REBALANCE_COORDINATOR_LOG_MSG} from
  '../../src/rebalancer/rebalancer-constants.js';
import {COORDINATOR_CREATED_REMOTE_HANDOFF_MODE} from
  '../../src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js';
import {createMockControlPlaneSystemTableGateway} from './test-helpers.js';

const TARGET_NODE_ID = 'target-node';
const SOURCE_NODE_ID = 'source-node';
const OPERATION_ID = 'replace-user-partition-remote-outcome';
const PARTITION_ID = 'ratings-p1';
const SOURCE_REPLICA_ID = 'ratings-p1-r1';
const TARGET_REPLICA_ID = 'ratings-p1-r2';
const RUNTIME_SERVICE_ID = 'svc-movielens-topn';
const RUNTIME_REPLICA_ID = `${RUNTIME_SERVICE_ID}-r1`;
const REMOTE_HANDOFF_DELIVERY_SOURCE =
  'coordinator_created_remote_handoff';
const RETRY_AFTER_MS = 25;
const RETRYABLE_DELIVERY_ERROR = 'source owner ingress is recovering';

function buildUserPartitionReplaceOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    replicaId: TARGET_REPLICA_ID,
    sourceNodeId: SOURCE_NODE_ID,
    targetNodeId: TARGET_NODE_ID,
    status: ReplicaStatus.SYNCING,
    workflowStep: WORKFLOW_STEP.SYNCING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: now,
        sourceReplicaId: SOURCE_REPLICA_ID,
      },
      {step: WORKFLOW_STEP.SYNCING, timestamp: now},
    ],
    ...overrides,
  };
}

function operationToRow(operation) {
  return {
    operation_id: operation.operationId,
    type: operation.type,
    partition_id: operation.partitionId,
    entity_type: operation.entityType,
    entity_id: operation.entityId,
    replica_id: operation.replicaId,
    source_node_id: operation.sourceNodeId,
    target_node_id: operation.targetNodeId,
    status: operation.status,
    workflow_step: operation.workflowStep,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt,
    completed_at: operation.completedAt,
    error_message: operation.errorMessage,
    steps_history: JSON.stringify(operation.stepsHistory),
  };
}

function createTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createTargetOutcomeHarness(operation, options = {}) {
  const deliveries = [];
  const scheduledTimers = [];
  const warnings = [];
  const connectionDiagnosticNodeIds = [];
  let operationVisible = true;
  const logger = {
    debug() {},
    info() {},
    warn(message, fields) {
      warnings.push({message, fields});
    },
    error() {},
  };
  const emitter = new ExecutorOutcomeEmitter({
    logger,
  });
  const executeQuery = async (sql, params = []) => {
    if (
      String(sql).includes('WHERE operation_id') &&
      params[0] === operation.operationId &&
      operationVisible
    ) {
      return {success: true, rows: [operationToRow(operation)]};
    }
    return {success: true, rows: [], affectedRows: 0};
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: TARGET_NODE_ID,
    transactionCoordinator: createTransactionCoordinator(),
    systemTableCache: {get() {
      return null;
    }},
    cdcIntegrationService: {async waitForCacheUpdate() {}},
    tablePolicyService: {async getPolicyForPartition() {
      return {minReplicaCount: 1};
    }},
    messageRouter: {
      async deliver(target, payload, deliveryOptions) {
        deliveries.push({target, payload, options: deliveryOptions});
        if (typeof options.deliveryResult === 'function') {
          return options.deliveryResult(target, payload, deliveryOptions);
        }
        return {acknowledged: true, status: 'initiated'};
      },
      getConnectionHandoffDiagnostics(nodeId) {
        connectionDiagnosticNodeIds.push(nodeId);
        return {present: true, state: 'connected'};
      },
    },
    sqlQueryEngine: {executeQuery},
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway({executeQuery}),
    storageAccountingService: {estimateReplicaBytes: () => 1},
    storageAdmissionService: {async checkAdd() {
      return {allowed: true, decision: 'allow'};
    }},
    controlPlaneReadinessService: {getNodeReadinessSync() {
      return null;
    }},
    operationWorkflowCoordinator: new DurableWorkflowCoordinator(),
    executorOutcomeEmitter: emitter,
    setTimeoutFn(callback, delayMs) {
      const timer = {callback, delayMs, cleared: false};
      scheduledTimers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      timer.cleared = true;
    },
    enableTimeouts: false,
  });
  coordinator.logger = logger;
  coordinator.initialize();
  return {
    coordinator,
    connectionDiagnosticNodeIds,
    deliveries,
    emitter,
    scheduledTimers,
    setOperationVisible(visible) {
      operationVisible = visible;
    },
    warnings,
  };
}

async function settleOutcomeReconcile() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function buildActiveOutcome() {
  return Object.freeze({
    [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: OPERATION_ID,
    [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.ACTIVE,
    [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: TARGET_REPLICA_ID,
    [EXECUTOR_OUTCOME_FIELD.PARTITION_ID]: PARTITION_ID,
  });
}

function remoteHandoffDeliveries(deliveries) {
  return deliveries.filter(
    (delivery) =>
      delivery?.payload?.type ===
        ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
  );
}

test(
  'user-partition REPLACE target ACTIVE outcome wakes the remote source owner',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation();
    const harness = createTargetOutcomeHarness(operation);
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      t.equal(
        harness.deliveries.length,
        1,
        'target completion should wake the canonical source owner once',
      );
      t.equal(
        harness.deliveries[0]?.target,
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
        'the wake should use the source owner replica-dispatch ingress',
      );
      t.equal(
        harness.deliveries[0]?.payload?.type,
        ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        'the wake should reuse the canonical replica-dispatch transport',
      );
      t.equal(
        harness.deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ID],
        OPERATION_ID,
        'the wake should carry the operation identity',
      );
      t.equal(
        harness.deliveries[0]?.options?.deliverySource,
        REMOTE_HANDOFF_DELIVERY_SOURCE,
        'the wake should retain the coordinator-created handoff boundary',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SYNCING,
        'the target observer must not mutate source-owned workflow state',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'user-partition ADD target ACTIVE outcome wakes the remote source owner',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation({
      type: OperationType.ADD,
    });
    const harness = createTargetOutcomeHarness(operation);
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        1,
        'target completion should wake the canonical source owner once',
      );
      t.equal(
        harness.deliveries[0]?.target,
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
        'the ADD wake should use the source owner replica-dispatch ingress',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SYNCING,
        'the target observer must not mutate source-owned ADD workflow state',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'runtime-service ADD target ACTIVE outcome wakes the remote source owner',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation({
      type: OperationType.ADD,
      partitionId: RUNTIME_SERVICE_ID,
      entityType: 'runtime_service',
      entityId: RUNTIME_SERVICE_ID,
      replicaId: RUNTIME_REPLICA_ID,
      status: ReplicaStatus.CREATING,
      workflowStep: WORKFLOW_STEP.CREATING,
    });
    const harness = createTargetOutcomeHarness(operation);
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: RUNTIME_REPLICA_ID},
      );
      await settleOutcomeReconcile();

      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        1,
        'runtime completion should wake the canonical source owner once',
      );
      t.equal(
        harness.deliveries[0]?.target,
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
        'runtime completion should use the source owner ingress',
      );
      t.equal(
        harness.deliveries[0]?.options?.deliverySource,
        REMOTE_HANDOFF_DELIVERY_SOURCE,
        'runtime completion should retain the remote-handoff boundary',
      );
      t.equal(
        harness.deliveries[0]?.payload?.[ControlPlaneField.HANDOFF_MODE],
        COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
        'runtime completion should mark the wake as target progress',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the target observer must not mutate source-owned runtime workflow',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'user-partition ADD target ACTIVE outcome wakes the owner before its ' +
    'durable row advances from CREATING',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation({
      type: OperationType.ADD,
      status: ReplicaStatus.CREATING,
      workflowStep: WORKFLOW_STEP.CREATING,
    });
    const harness = createTargetOutcomeHarness(operation);
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        1,
        'early target completion should retain an owner wake',
      );
      t.equal(
        harness.deliveries[0]?.target,
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
        'the early wake should use the source owner ingress',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the target observer must not advance source-owned workflow state',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'retryable user-partition target outcome delivery retains and retries ' +
    'the canonical source-owner wake',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation();
    let deliveryAttempt = 0;
    const harness = createTargetOutcomeHarness(operation, {
      deliveryResult() {
        deliveryAttempt += 1;
        if (deliveryAttempt === 1) {
          return {
            acknowledged: false,
            error: RETRYABLE_DELIVERY_ERROR,
            deferRetry: true,
            retryAfterMs: RETRY_AFTER_MS,
          };
        }
        return {acknowledged: true, status: 'initiated'};
      },
    });
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      const owner = harness.coordinator.workflowOwner;
      const retryTimer =
        owner.createdOperationHandoffRetryTimerByOperationId.get(OPERATION_ID);
      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        1,
        'the target should attempt the source-owner wake once',
      );
      t.ok(
        retryTimer,
        'retryable delivery should retain one handoff retry owner',
      );
      t.equal(
        owner.createdOperationHandoffRetryTargetNodeByOperationId.get(
          OPERATION_ID,
        ),
        SOURCE_NODE_ID,
        'retry pressure should be accounted against the actual source owner',
      );
      const deferredWarning = harness.warnings.find(
        (entry) => entry.message ===
          REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
      );
      t.equal(
        deferredWarning?.fields?.handoffDestinationNodeId,
        SOURCE_NODE_ID,
        'target-outcome deferral should name the canonical source owner',
      );
      t.equal(
        deferredWarning?.fields?.targetNodeId,
        undefined,
        'target-outcome deferral must not label the replica target as owner',
      );
      t.equal(
        harness.connectionDiagnosticNodeIds[0],
        SOURCE_NODE_ID,
        'transport diagnostics should inspect the source-owner connection',
      );

      harness.setOperationVisible(false);
      await retryTimer.callback();

      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        2,
        'the retained operation snapshot should retry through the same ingress',
      );
      t.equal(
        harness.deliveries[1]?.target,
        `${SOURCE_NODE_ID}/service/replica-dispatch`,
        'the retry should still target the canonical source owner',
      );
      t.ok(
        owner.createdOperationHandoffRetryTimerByOperationId.has(OPERATION_ID),
        'successful delivery should retain the bounded verification follow-up',
      );
      const snapshotWarning = harness.warnings.find(
        (entry) => entry.message ===
          REBALANCE_COORDINATOR_LOG_MSG
            .COORDINATOR_HANDOFF_RETRY_FROM_SNAPSHOT,
      );
      t.equal(
        snapshotWarning?.fields?.handoffDestinationNodeId,
        SOURCE_NODE_ID,
        'snapshot retry should retain the source-owner destination',
      );
      t.equal(
        snapshotWarning?.fields?.targetNodeId,
        undefined,
        'snapshot retry must not regress to the replica target diagnostic',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'target outcome remote wake preserves local, terminal, and incompatible ' +
    'workflow controls',
  async (t) => {
    const cases = [
      {
        name: 'wrong executor outcome',
        operation: buildUserPartitionReplaceOperation(),
        outcome: Object.freeze({
          ...buildActiveOutcome(),
          [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
          [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.SYNCING,
        }),
      },
      {
        name: 'wrong operation type',
        operation: buildUserPartitionReplaceOperation({
          type: OperationType.REMOVE,
        }),
      },
      {
        name: 'locally owned',
        operation: buildUserPartitionReplaceOperation({
          sourceNodeId: TARGET_NODE_ID,
        }),
        prepare(owner) {
          owner.reconcileReplaceActualActive = async () => true;
        },
      },
      {
        name: 'terminal',
        operation: buildUserPartitionReplaceOperation({
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
          completedAt: Date.now(),
        }),
      },
      {
        name: 'incompatible source-removal phase',
        operation: buildUserPartitionReplaceOperation({
          status: ReplicaStatus.REMOVING,
          workflowStep: WORKFLOW_STEP.STOPPING,
        }),
      },
    ];

    for (const testCase of cases) {
      const harness = createTargetOutcomeHarness(testCase.operation);
      try {
        testCase.prepare?.(harness.coordinator.workflowOwner);
        await harness.coordinator.workflowOwner.reconcileExecutorOutcome(
          testCase.outcome || buildActiveOutcome(),
        );
        t.equal(
          remoteHandoffDeliveries(harness.deliveries).length,
          0,
          `${testCase.name} operations must not emit a remote owner wake`,
        );
      } finally {
        await harness.coordinator.shutdown();
      }
    }
  },
);

test(
  'terminal observation stops an already-armed target-outcome retry',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation();
    const harness = createTargetOutcomeHarness(operation, {
      deliveryResult() {
        return {
          acknowledged: false,
          error: RETRYABLE_DELIVERY_ERROR,
          deferRetry: true,
          retryAfterMs: RETRY_AFTER_MS,
        };
      },
    });
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      const owner = harness.coordinator.workflowOwner;
      const retryTimer =
        owner.createdOperationHandoffRetryTimerByOperationId.get(OPERATION_ID);
      operation.status = ReplicaStatus.REMOVED;
      operation.workflowStep = WORKFLOW_STEP.REMOVED;
      operation.completedAt = Date.now();
      await retryTimer.callback();

      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        1,
        'terminal read-back should prevent another source-owner wake',
      );
      t.notOk(
        owner.createdOperationHandoffRetryTimerByOperationId.has(OPERATION_ID),
        'terminal read-back should clear the armed retry timer',
      );
      t.notOk(
        owner.createdOperationHandoffRetryModeByOperationId.has(OPERATION_ID),
        'terminal read-back should release retained handoff mode state',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'late delivery honor preserves target-outcome mode for slower follow-up',
  async (t) => {
    const operation = buildUserPartitionReplaceOperation();
    const harness = createTargetOutcomeHarness(operation, {
      deliveryResult() {
        return {
          acknowledged: false,
          error: RETRYABLE_DELIVERY_ERROR,
          deferRetry: true,
          retryAfterMs: RETRY_AFTER_MS,
        };
      },
    });
    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      const owner = harness.coordinator.workflowOwner;
      const tightRetry =
        owner.createdOperationHandoffRetryTimerByOperationId.get(OPERATION_ID);
      await owner.onLateDispatchDeliveryHonored({
        deliverySource: REMOTE_HANDOFF_DELIVERY_SOURCE,
        responseContext: OPERATION_ID,
      });
      const verificationFollowUp =
        owner.createdOperationHandoffRetryTimerByOperationId.get(OPERATION_ID);

      t.not(
        verificationFollowUp,
        tightRetry,
        'late delivery should replace the tight retry timer',
      );
      t.ok(
        tightRetry.cleared,
        'late delivery should cancel the tight retry timer',
      );
      t.ok(
        verificationFollowUp.delayMs > RETRY_AFTER_MS,
        'late delivery should install the slower verification cadence',
      );
      t.equal(
        owner.createdOperationHandoffRetryModeByOperationId.get(OPERATION_ID),
        COORDINATOR_CREATED_REMOTE_HANDOFF_MODE.TARGET_EXECUTOR_OUTCOME,
        'replacement follow-up should retain target executor-outcome mode',
      );
      t.equal(
        owner.createdOperationHandoffRetryTargetNodeByOperationId.get(
          OPERATION_ID,
        ),
        SOURCE_NODE_ID,
        'replacement follow-up should remain accounted to the source owner',
      );
    } finally {
      await harness.coordinator.shutdown();
    }
  },
);

test(
  'expired target-outcome handoff refuses retry ownership after one source wake',
  async (t) => {
    const originalDateNow = Date.now;
    const capturedAtMs = originalDateNow();
    const operation = buildUserPartitionReplaceOperation();
    const harness = createTargetOutcomeHarness(operation, {
      deliveryResult() {
        return {
          acknowledged: false,
          error: RETRYABLE_DELIVERY_ERROR,
          deferRetry: true,
          retryAfterMs: RETRY_AFTER_MS,
        };
      },
    });
    const syncingTimeoutMs = harness.coordinator.getTimeoutForStep(
      WORKFLOW_STEP.SYNCING,
      operation,
    );
    const expiredProgressAtMs = capturedAtMs - syncingTimeoutMs - 1;
    operation.createdAt = expiredProgressAtMs;
    operation.updatedAt = expiredProgressAtMs;
    operation.stepsHistory = operation.stepsHistory.map((entry) => ({
      ...entry,
      timestamp: expiredProgressAtMs,
    }));
    Date.now = () => capturedAtMs;

    try {
      harness.emitter.emitOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        OPERATION_ID,
        WORKFLOW_STEP.ACTIVE,
        {replicaId: TARGET_REPLICA_ID, partitionId: PARTITION_ID},
      );
      await settleOutcomeReconcile();

      const owner = harness.coordinator.workflowOwner;
      t.equal(
        remoteHandoffDeliveries(harness.deliveries).length,
        1,
        'the initial target outcome should attempt one source wake',
      );
      t.notOk(
        owner.createdOperationHandoffRetryTimerByOperationId.has(OPERATION_ID),
        'an expired operation must not retain target-outcome retry ownership',
      );
    } finally {
      Date.now = originalDateNow;
      await harness.coordinator.shutdown();
    }
  },
);
