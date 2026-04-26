/**
 * Tests for executor outcome routing through the owner-key reconcile
 * path in RebalanceCoordinator.
 *
 * Proves that:
 * - Executor outcomes are routed through runExclusive (owner-key queue)
 * - The coordinator transitions workflow state based on outcome type
 * - Terminal and non-local operations are skipped
 * - Unknown outcome types are rejected
 * - Subscription is cleaned up on shutdown
 *
 * Uses RebalanceCoordinator.handleExecutorOutcome → reconcileExecutorOutcome
 * as the canonical owner path for executor outcomes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from '../../src/rebalancer/executor-outcome-emitter.js';
import {
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_OUTCOME_ACTION,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {createMockControlPlaneSystemTableGateway} from './test-helpers.js';

const TEST_NODE_ID = 'node-local';
const TEST_OPERATION_ID = 'op-outcome-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_REPLICA_ID = 'partition-1-r1';
const TEST_REPLACE_PARTITION_ID = 'users-p1';
const TEST_REPLACE_SOURCE_REPLICA_ID = 'users-p1-r1';
const TEST_REPLACE_TARGET_REPLICA_ID = 'users-p1-r2';

/**
 * Build a minimal operation record for testing.
 */
function buildTestOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: TEST_OPERATION_ID,
    type: 'ADD',
    partitionId: TEST_PARTITION_ID,
    entityType: 'partition',
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_NODE_ID,
    status: 'in_progress',
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [{step: WORKFLOW_STEP.CREATING, timestamp: now}],
    ...overrides,
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

/**
 * Create a coordinator with a SQL engine that returns the given
 * operation when queried by ID.
 */
function createTestCoordinator(options = {}) {
  const {
    operation = null,
    persistResults = {success: true, rows: [], affectedRows: 1},
  } = options;

  const emitter = new ExecutorOutcomeEmitter({logger: console});
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const ownerKeys = [];
  const originalRunExclusive =
    workflowCoordinator.runExclusive.bind(workflowCoordinator);
  workflowCoordinator.runExclusive = (ownerKey, factory) => {
    ownerKeys.push(ownerKey);
    return originalRunExclusive(ownerKey, factory);
  };
  const executeQuery = async (sql, params) => {
    // SELECT by operation_id
    if (sql.includes('WHERE operation_id') && operation) {
      const opId = params?.[0];
      if (opId === operation.operationId) {
        return {
          success: true,
          rows: [operationToRow(operation)],
        };
      }
    }
    if (sql.includes('UPDATE') && operation) {
      operation.status = params?.[0];
      operation.workflowStep = params?.[1];
      operation.updatedAt = params?.[2];
      operation.completedAt = params?.[3];
      operation.errorMessage = params?.[4];
      operation.stepsHistory =
        typeof params?.[5] === 'string' ?
          JSON.parse(params[5]) :
          operation.stepsHistory;
      operation.replicaId = params?.[6];
      return persistResults;
    }
    return {success: true, rows: []};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    transactionCoordinator: createTransactionCoordinator(),
    systemTableCache: {get() {
      return null;
    }},
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {
      executeQuery,
    },
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway({
        executeQuery,
      }),
    storageAccountingService: {estimateReplicaBytes: () => 1},
    storageAdmissionService: {
      async checkAdd() {
        return {allowed: true, decision: 'allow'};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return null;
      },
    },
    operationWorkflowCoordinator: workflowCoordinator,
    executorOutcomeEmitter: emitter,
    enableTimeouts: false,
  });
  coordinator.initialize();

  return {coordinator, emitter, ownerKeys};
}

/**
 * Convert an in-memory operation object to a row shape that
 * queryOperationById expects from SQL.
 */
function operationToRow(op) {
  return {
    operation_id: op.operationId,
    type: op.type,
    partition_id: op.partitionId,
    entity_type: op.entityType,
    entity_id: op.entityId,
    replica_id: op.replicaId,
    source_node_id: op.sourceNodeId,
    target_node_id: op.targetNodeId,
    status: op.status,
    workflow_step: op.workflowStep,
    created_at: op.createdAt,
    updated_at: op.updatedAt,
    completed_at: op.completedAt,
    error_message: op.errorMessage,
    steps_history: JSON.stringify(op.stepsHistory || []),
  };
}

function waitForCoordinatorEvent(coordinator, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    coordinator.once(eventName, (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
}

test('Executor outcome routing through owner-key reconcile path',
  async (t) => {
    await t.test(
      'REPLICA_CREATE_SYNCING routes through runExclusive and ' +
      'calls updateStep with SYNCING',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter, ownerKeys} =
          createTestCoordinator({operation});

        try {
          const routedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.SYNCING,
          );
          const routedEvent = await routedEventPromise;

          t.ok(
            ownerKeys.length > 0,
            'outcome must be routed through runExclusive',
          );
          t.ok(
            ownerKeys[0].includes(TEST_OPERATION_ID),
            'owner key must contain the operationId',
          );
          t.equal(
            routedEvent.action,
            EXECUTOR_OUTCOME_ACTION.UPDATE_STEP,
            'action should be updateStep',
          );
          t.equal(
            routedEvent.outcomeType,
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            'outcomeType should match',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'REPLICA_CREATE_SYNCING reconciles already-active REPLACE target',
      async (t) => {
        const deliveries = [];
        const operation = buildTestOperation({
          type: OperationType.REPLACE,
          partitionId: TEST_REPLACE_PARTITION_ID,
          entityId: TEST_REPLACE_PARTITION_ID,
          replicaId: TEST_REPLACE_TARGET_REPLICA_ID,
          sourceNodeId: TEST_NODE_ID,
          sourceReplicaId: TEST_REPLACE_SOURCE_REPLICA_ID,
          targetNodeId: TEST_NODE_ID,
          workflowStep: WORKFLOW_STEP.CREATING,
          status: ReplicaStatus.CREATING,
          stepsHistory: [
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: Date.now(),
              sourceReplicaId: TEST_REPLACE_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.CREATING,
              timestamp: Date.now(),
            },
          ],
        });
        const {coordinator, emitter} = createTestCoordinator({operation});
        coordinator.messageRouter = {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
        };
        coordinator.workflowOwner.messageRouter = coordinator.messageRouter;
        coordinator.workflowOwner.getReconciledReplicaStatus = async () =>
          ReplicaStatus.ACTIVE;

        try {
          const routedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.SYNCING,
          );
          await routedEventPromise;

          t.equal(
            deliveries.length,
            1,
            'active target reconciliation should resume source removal',
          );
          t.equal(
            deliveries[0]?.payload?.type,
            ReplicaOperationMessageType.REMOVE_REPLICA,
            'source removal should be dispatched after the active resample',
          );
          t.equal(
            deliveries[0]?.payload?.replicaId,
            TEST_REPLACE_SOURCE_REPLICA_ID,
            'source removal should target the retained source replica',
          );
          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.STOPPING,
            'operation should not remain pinned in SYNCING',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'REPLICA_CREATE_SYNCING does not regress REPLACE source removal',
      async (t) => {
        const deliveries = [];
        const operation = buildTestOperation({
          type: OperationType.REPLACE,
          partitionId: TEST_REPLACE_PARTITION_ID,
          entityId: TEST_REPLACE_PARTITION_ID,
          replicaId: TEST_REPLACE_TARGET_REPLICA_ID,
          sourceNodeId: TEST_NODE_ID,
          sourceReplicaId: TEST_REPLACE_SOURCE_REPLICA_ID,
          targetNodeId: TEST_NODE_ID,
          workflowStep: WORKFLOW_STEP.STOPPING,
          status: ReplicaStatus.REMOVING,
          stepsHistory: [
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: Date.now(),
              sourceReplicaId: TEST_REPLACE_SOURCE_REPLICA_ID,
            },
            {
              step: WORKFLOW_STEP.SYNCING,
              timestamp: Date.now(),
            },
            {
              step: WORKFLOW_STEP.ACTIVE,
              timestamp: Date.now(),
            },
            {
              step: WORKFLOW_STEP.STOPPING,
              timestamp: Date.now(),
            },
          ],
        });
        const {coordinator, emitter} = createTestCoordinator({operation});
        coordinator.messageRouter = {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
        };
        coordinator.workflowOwner.messageRouter = coordinator.messageRouter;
        coordinator.workflowOwner.getReconciledReplicaStatus = async () =>
          ReplicaStatus.ACTIVE;

        try {
          const routedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.SYNCING,
          );
          await routedEventPromise;

          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.STOPPING,
            'delayed SYNCING outcome should not rewind source removal',
          );
          t.equal(
            operation.status,
            ReplicaStatus.REMOVING,
            'operation status should remain in the remove phase',
          );
          t.equal(
            deliveries.length,
            0,
            'stale create progress should not dispatch another removal',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'REPLICA_CREATE_ACTIVE routes through runExclusive and ' +
      'calls completeOperation',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.SYNCING,
        });
        const {coordinator, emitter, ownerKeys} =
          createTestCoordinator({operation});

        try {
          const completedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.ACTIVE,
          );
          await completedEventPromise;

          t.ok(
            ownerKeys.length > 0,
            'outcome must be routed through runExclusive',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'REPLICA_CREATE_ACTIVE resumes source removal for REPLACE ' +
      'instead of completing terminally',
      async (t) => {
        const deliveries = [];
        const operation = buildTestOperation({
          type: 'REPLACE',
          partitionId: 'users-p1',
          entityId: 'users-p1',
          replicaId: 'users-p1-r2',
          sourceReplicaId: 'users-p1-r1',
          workflowStep: WORKFLOW_STEP.SYNCING,
          status: 'syncing',
          stepsHistory: [
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: Date.now(),
              sourceReplicaId: 'users-p1-r1',
            },
            {
              step: WORKFLOW_STEP.SYNCING,
              timestamp: Date.now(),
            },
          ],
        });
        const {coordinator, emitter, ownerKeys} =
          createTestCoordinator({operation});
        coordinator.messageRouter = {
          async deliver(target, payload, options) {
            deliveries.push({target, payload, options});
            return {acknowledged: true, status: 'initiated'};
          },
        };
        coordinator.workflowOwner.messageRouter = coordinator.messageRouter;

        try {
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.ACTIVE,
            {replicaId: 'nodes-p1-r2'},
          );

          await new Promise((resolve) => setImmediate(resolve));
          await new Promise((resolve) => setImmediate(resolve));

          t.ok(
            ownerKeys.length > 0,
            'outcome must still route through runExclusive',
          );
          t.equal(
            deliveries.length,
            1,
            'REPLACE active outcome should continue into source removal',
          );
          t.equal(
            deliveries[0]?.payload?.type,
            'REMOVE_REPLICA',
            'the resumed phase should dispatch source removal',
          );
          t.equal(
            deliveries[0]?.payload?.replicaId,
            'users-p1-r1',
            'source removal should target the retained source replica',
          );
          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.STOPPING,
            'REPLACE should move into STOPPING instead of terminal completion',
          );
          t.equal(
            operation.completedAt,
            null,
            'REPLACE create-active should not mark the operation complete',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'REPLICA_CREATE_FAILED routes through runExclusive and ' +
      'calls failOperation',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        try {
          const failedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.FAILED,
            {errorMessage: 'disk full'},
          );
          const failedEvent = await failedEventPromise;

          t.match(
            failedEvent.errorMessage,
            /disk full/,
            'error message should propagate',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'REPLICA_REMOVE_COMPLETED calls completeOperation',
      async (_t) => {
        const operation = buildTestOperation({
          type: 'REMOVE',
          workflowStep: WORKFLOW_STEP.STOPPING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        try {
          const completedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.REMOVED,
          );
          await completedEventPromise;
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'MESSAGE_GROUP_CREATE_ACTIVE calls completeOperation',
      async (_t) => {
        const operation = buildTestOperation({
          entityType: 'message_group',
          entityId: 'mg-1',
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        try {
          const completedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.ACTIVE,
          );
          await completedEventPromise;
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'RUNTIME_SERVICE_CREATE_FAILED calls failOperation',
      async (_t) => {
        const operation = buildTestOperation({
          entityType: 'runtime_service',
          entityId: 'rs-1',
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        try {
          const failedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.FAILED,
            {errorMessage: 'container pull failed'},
          );
          await failedEventPromise;
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'outcome for terminal operation is skipped',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.ACTIVE,
          status: 'active',
          completedAt: Date.now(),
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        const routed = [];
        coordinator.on(
          REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          (evt) => routed.push(evt),
        );

        try {
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.ACTIVE,
          );

          await new Promise((r) => setImmediate(r));

          t.equal(routed.length, 0,
            'terminal operation should not be routed');
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'outcome for non-local operation is skipped',
      async (t) => {
        const operation = buildTestOperation({
          sourceNodeId: 'node-remote',
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        const routed = [];
        coordinator.on(
          REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          (evt) => routed.push(evt),
        );

        try {
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.ACTIVE,
          );

          await new Promise((r) => setImmediate(r));

          t.equal(routed.length, 0,
            'non-local operation should not be routed');
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'outcome for unknown operation is skipped',
      async (t) => {
        // No operation in the SQL engine.
        const {coordinator, emitter} =
          createTestCoordinator({operation: null});

        const routed = [];
        coordinator.on(
          REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          (evt) => routed.push(evt),
        );

        try {
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            'op-nonexistent',
            WORKFLOW_STEP.ACTIVE,
          );

          await new Promise((r) => setImmediate(r));

          t.equal(routed.length, 0,
            'unknown operation should not be routed');
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'shutdown removes emitter subscription',
      async (t) => {
        const operation = buildTestOperation();
        const {coordinator, emitter} =
          createTestCoordinator({operation});

        await coordinator.shutdown();

        const listenerCount =
          emitter.listenerCount(OUTCOME_EVENT_NAME);
        t.equal(
          listenerCount,
          0,
          'emitter should have no listeners after shutdown',
        );
      },
    );
  },
);
