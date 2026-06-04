/**
 * Tests for executor outcome routing through the owner-key reconcile
 * path in RebalanceCoordinator.
 *
 * Proves that:
 * - Executor outcomes are routed through runExclusive (owner-key queue)
 * - The coordinator transitions workflow state based on outcome type
 * - Terminal and ordinary non-local operations are skipped
 * - Priority recovery target progress wakes a non-local operation owner
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
  EXECUTOR_OUTCOME_FIELD,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
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
const TEST_CRITICAL_CREATE_FAILURE_PARTITION_ID = 'replica_operations-p1';
const TEST_PRIORITY_RECOVERY_PARTITION_ID = 'sql_transaction_participants-p1';
const TEST_PRIORITY_RECOVERY_REPLICA_ID = 'sql_transaction_participants-p1-r4';
const TEST_PRIORITY_RECOVERY_SOURCE_NODE_ID = 'priority-recovery-source-node';
const TEST_PRIORITY_RECOVERY_TARGET_NODE_ID = TEST_NODE_ID;
const TEST_RETRYABLE_CREATE_FAILURE_MESSAGE =
  'Operational message-group ingress not ready for replica_operations ' +
  'CDC subscription';
const TEST_RETRYABLE_CREATE_FAILURE_RETRY_AFTER_MS = 5000;
const TEST_MG_RETRYABLE_PARTITION_ID = TEST_CRITICAL_CREATE_FAILURE_PARTITION_ID;
const TEST_MG_RETRYABLE_REPLICA_ID = 'replica_operations-p1-r2';
const TEST_MG_RETRYABLE_CREATE_FAILURE_MESSAGE =
  'Operational message-group ingress not ready for replica_operations ' +
  'CDC subscription';
const TEST_MG_RETRYABLE_CREATE_FAILURE_RETRY_AFTER_MS = 5000;
const TEST_DEFERRED_OUTCOME_RETRY_AFTER_MS = 1;
const TEST_DEFERRED_OUTCOME_STATE = 'deferred';
const TEST_EMPTY_OUTCOME_STATE = 'empty';
const TEST_PRESENT_OUTCOME_STATE = 'present';
const TEST_DEFERRED_OUTCOME_COMPLETION_STATE =
  'authoritative_operation_read_deferred';
const TEST_REPLICA_OPERATION_UPDATE_SQL_PREFIX =
  'UPDATE replica_operations';
const TEST_RETRY_PAYLOAD_WAIT_INITIAL_ATTEMPT = 0;
const TEST_RETRY_PAYLOAD_WAIT_ATTEMPT_INCREMENT = 1;
const TEST_RETRY_PAYLOAD_WAIT_ATTEMPT_COUNT = 4;
const TEST_COORDINATOR_CREATED_REMOTE_HANDOFF =
  'coordinator_created_remote_handoff';
const TEST_CRITICAL_DELIVERY_PRIORITY = 'critical';

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
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
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
    if (
      sql.includes(TEST_REPLICA_OPERATION_UPDATE_SQL_PREFIX) &&
      operation
    ) {
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
    setTimeoutFn,
    clearTimeoutFn,
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

function buildExecutorOutcomePayload(outcomeType, workflowStep) {
  return Object.freeze({
    [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: TEST_OPERATION_ID,
    [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]: outcomeType,
    [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: workflowStep,
  });
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

async function waitForExecutorOutcomeRetryPayload(
  coordinator,
  operationId,
  workflowStep,
) {
  for (
    let attemptIndex = TEST_RETRY_PAYLOAD_WAIT_INITIAL_ATTEMPT;
    attemptIndex < TEST_RETRY_PAYLOAD_WAIT_ATTEMPT_COUNT;
    attemptIndex += TEST_RETRY_PAYLOAD_WAIT_ATTEMPT_INCREMENT
  ) {
    const payload =
      coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId.get(
        operationId,
      );
    if (payload?.workflowStep === workflowStep) {
      return payload;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  return coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId.get(
    operationId,
  );
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
      'REPLICA_CREATE_CREATING routes through runExclusive and ' +
      'calls updateStep with CREATING',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.SENDING,
          status: ReplicaStatus.PENDING,
          stepsHistory: [
            {
              step: WORKFLOW_STEP.SENDING,
              timestamp: Date.now(),
            },
          ],
        });
        const {coordinator, emitter, ownerKeys} =
          createTestCoordinator({operation});

        try {
          const routedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED,
          );
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.CREATING,
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
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
            'outcomeType should match',
          );
          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.CREATING,
            'operation should advance to the accepted create step',
          );
          t.equal(
            operation.status,
            ReplicaStatus.CREATING,
            'operation status should advance with the workflow step',
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
      'deferred visibility retains the furthest executor outcome',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.CREATING,
          status: ReplicaStatus.CREATING,
        });
        const scheduledTimers = [];
        const {coordinator} =
          createTestCoordinator({
            operation,
            setTimeoutFn(callback, delayMs) {
              const timerHandle = {callback, delayMs};
              scheduledTimers.push(timerHandle);
              return timerHandle;
            },
            clearTimeoutFn(timerHandle) {
              timerHandle.cleared = true;
            },
          });
        let visibilityState = TEST_DEFERRED_OUTCOME_STATE;
        coordinator.repository.getOperationByIdVisibilityObservation =
          async () => {
            if (visibilityState === TEST_DEFERRED_OUTCOME_STATE) {
              return {
                state: TEST_DEFERRED_OUTCOME_STATE,
                operation: null,
                deferredOutcome: {
                  completionState: TEST_DEFERRED_OUTCOME_COMPLETION_STATE,
                  retryAfterMs: TEST_DEFERRED_OUTCOME_RETRY_AFTER_MS,
                },
                retryAfterMs: TEST_DEFERRED_OUTCOME_RETRY_AFTER_MS,
              };
            }
            return {
              state: TEST_PRESENT_OUTCOME_STATE,
              operation,
              deferredOutcome: null,
              retryAfterMs: null,
            };
          };

        try {
          const deferredVisibilityObservation = Object.freeze({
            state: TEST_DEFERRED_OUTCOME_STATE,
            operation: null,
            deferredOutcome: Object.freeze({
              completionState: TEST_DEFERRED_OUTCOME_COMPLETION_STATE,
              retryAfterMs: TEST_DEFERRED_OUTCOME_RETRY_AFTER_MS,
            }),
            retryAfterMs: TEST_DEFERRED_OUTCOME_RETRY_AFTER_MS,
          });
          coordinator.workflowOwner.scheduleExecutorOutcomeRetry(
            buildExecutorOutcomePayload(
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
              WORKFLOW_STEP.SYNCING,
            ),
            deferredVisibilityObservation,
          );
          coordinator.workflowOwner.scheduleExecutorOutcomeRetry(
            buildExecutorOutcomePayload(
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
              WORKFLOW_STEP.ACTIVE,
            ),
            deferredVisibilityObservation,
          );
          const retainedRetryPayload =
            await waitForExecutorOutcomeRetryPayload(
              coordinator,
              TEST_OPERATION_ID,
              WORKFLOW_STEP.ACTIVE,
            );

          t.equal(
            scheduledTimers.length,
            1,
            'deferred visibility should retain one retry timer',
          );
          t.equal(
            scheduledTimers[0].delayMs,
            TEST_DEFERRED_OUTCOME_RETRY_AFTER_MS,
            'retry should use the owner visibility retry delay',
          );
          t.equal(
            retainedRetryPayload?.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'deferred visibility should retain the furthest queued workflow step',
          );

          visibilityState = TEST_PRESENT_OUTCOME_STATE;
          const completedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
          );
          await scheduledTimers[0].callback();
          const completedEvent = await completedEventPromise;

          t.equal(
            completedEvent.operation.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'retained furthest ACTIVE outcome should complete after visibility recovers',
          );
          t.ok(
            completedEvent.operation.completedAt,
            'retained ACTIVE outcome should not be lost',
          );
        } finally {
          await coordinator.shutdown();
        }
      },
    );

    await t.test(
      'empty visibility retains fresh create-active outcome until visible',
      async (t) => {
        const operation = buildTestOperation({
          workflowStep: WORKFLOW_STEP.SYNCING,
          status: ReplicaStatus.SYNCING,
        });
        const scheduledTimers = [];
        const {coordinator} =
          createTestCoordinator({
            operation,
            setTimeoutFn(callback, delayMs) {
              const timerHandle = {callback, delayMs};
              scheduledTimers.push(timerHandle);
              return timerHandle;
            },
            clearTimeoutFn(timerHandle) {
              timerHandle.cleared = true;
            },
          });
        let visibilityState = TEST_EMPTY_OUTCOME_STATE;
        coordinator.repository.getOperationByIdVisibilityObservation =
          async () => {
            if (visibilityState === TEST_EMPTY_OUTCOME_STATE) {
              return {
                state: TEST_EMPTY_OUTCOME_STATE,
                operation: null,
                deferredOutcome: null,
                retryAfterMs: null,
              };
            }
            return {
              state: TEST_PRESENT_OUTCOME_STATE,
              operation,
              deferredOutcome: null,
              retryAfterMs: null,
            };
          };

        try {
          await coordinator.workflowOwner.reconcileExecutorOutcome(
            Object.freeze({
              ...buildExecutorOutcomePayload(
                EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
                WORKFLOW_STEP.ACTIVE,
              ),
              [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: TEST_REPLICA_ID,
              [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: Date.now(),
            }),
          );
          const retainedRetryPayload =
            await waitForExecutorOutcomeRetryPayload(
              coordinator,
              TEST_OPERATION_ID,
              WORKFLOW_STEP.ACTIVE,
            );

          t.equal(
            scheduledTimers.length,
            1,
            'fresh empty visibility should retain one retry timer',
          );
          t.equal(
            retainedRetryPayload?.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'fresh empty visibility should retain the ACTIVE outcome',
          );

          visibilityState = TEST_PRESENT_OUTCOME_STATE;
          const completedEventPromise = waitForCoordinatorEvent(
            coordinator,
            REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
          );
          await scheduledTimers[0].callback();
          const completedEvent = await completedEventPromise;

          t.equal(
            completedEvent.operation.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'retained ACTIVE outcome should complete once the row appears',
          );
          t.ok(
            completedEvent.operation.completedAt,
            'retained ACTIVE outcome should not be skipped',
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
      'REPLICA_CREATE_FAILED preserves retryable critical create failures ' +
      'in the owner retry lane',
      async (t) => {
        const operation = buildTestOperation({
          partitionId: TEST_CRITICAL_CREATE_FAILURE_PARTITION_ID,
          entityId: TEST_CRITICAL_CREATE_FAILURE_PARTITION_ID,
          status: ReplicaStatus.CREATING,
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});
        let failedEventCount = 0;
        coordinator.on(
          REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
          () => {
            failedEventCount += 1;
          },
        );

        try {
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.FAILED,
            {
              errorMessage: TEST_RETRYABLE_CREATE_FAILURE_MESSAGE,
              retryAfterMs: TEST_RETRYABLE_CREATE_FAILURE_RETRY_AFTER_MS,
              deferRetry: true,
            },
          );

          await new Promise((resolve) => setImmediate(resolve));
          await new Promise((resolve) => setImmediate(resolve));

          t.equal(
            failedEventCount,
            0,
            'retryable critical create failure should not fail terminally',
          );
          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.CREATING,
            'retryable create failure should keep the create-rearm step',
          );
          t.equal(
            operation.status,
            ReplicaStatus.CREATING,
            'retryable create failure should preserve the in-flight status',
          );
          t.equal(
            operation.completedAt,
            null,
            'retryable create failure should not mark the operation complete',
          );
          t.equal(
            operation.errorMessage,
            null,
            'retryable create failure should not persist a terminal error',
          );
          t.equal(
            coordinator.workflowOwner.hasActiveTransitionRetryGrace(
              TEST_OPERATION_ID,
            ),
            true,
            'retryable create failure should arm transition retry grace',
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
      'MESSAGE_GROUP_CREATE_FAILED preserves retryable ingress failures ' +
      'in the owner retry lane',
      async (t) => {
        const operation = buildTestOperation({
          partitionId: TEST_MG_RETRYABLE_PARTITION_ID,
          entityId: TEST_MG_RETRYABLE_PARTITION_ID,
          entityType: 'message_group',
          replicaId: TEST_MG_RETRYABLE_REPLICA_ID,
          status: ReplicaStatus.CREATING,
          workflowStep: WORKFLOW_STEP.CREATING,
        });
        const {coordinator, emitter} =
          createTestCoordinator({operation});
        let failedEventCount = 0;
        coordinator.on(
          REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
          () => {
            failedEventCount += 1;
          },
        );

        try {
          emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.FAILED,
            {
              errorMessage: TEST_MG_RETRYABLE_CREATE_FAILURE_MESSAGE,
              retryAfterMs: TEST_MG_RETRYABLE_CREATE_FAILURE_RETRY_AFTER_MS,
              deferRetry: true,
            },
          );

          await new Promise((resolve) => setImmediate(resolve));
          await new Promise((resolve) => setImmediate(resolve));

          t.equal(
            failedEventCount,
            0,
            'retryable message-group ingress failure must not fail terminally',
          );
          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.CREATING,
            'retryable message-group failure should keep the create-rearm step',
          );
          t.equal(
            operation.status,
            ReplicaStatus.CREATING,
            'retryable message-group failure should preserve the in-flight status',
          );
          t.equal(
            operation.completedAt,
            null,
            'retryable message-group failure should not mark the operation complete',
          );
          t.equal(
            operation.errorMessage,
            null,
            'retryable message-group failure should not persist a terminal error',
          );
          t.equal(
            coordinator.workflowOwner.hasActiveTransitionRetryGrace(
              TEST_OPERATION_ID,
            ),
            true,
            'retryable message-group failure should arm transition retry grace',
          );
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
      'priority recovery non-local create progress wakes operation owner',
      async (t) => {
        const deliveries = [];
        const operation = buildTestOperation({
          type: OperationType.ADD,
          partitionId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
          entityId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
          replicaId: TEST_PRIORITY_RECOVERY_REPLICA_ID,
          sourceNodeId: TEST_PRIORITY_RECOVERY_SOURCE_NODE_ID,
          targetNodeId: TEST_PRIORITY_RECOVERY_TARGET_NODE_ID,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
          stepsHistory: [
            {
              step: WORKFLOW_STEP.PENDING,
              timestamp: Date.now(),
            },
          ],
        });
        const {coordinator} = createTestCoordinator({operation});
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

        try {
          const woken = await coordinator.workflowOwner.reconcileExecutorOutcome(
            buildExecutorOutcomePayload(
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
              WORKFLOW_STEP.SYNCING,
            ),
          );

          t.equal(
            woken,
            true,
            'eligible non-local progress should wake the owner',
          );
          t.equal(
            deliveries.length,
            1,
            'non-local priority progress should issue one owner wake',
          );
          t.equal(
            deliveries[0]?.target,
            `${TEST_PRIORITY_RECOVERY_SOURCE_NODE_ID}/service/replica-dispatch`,
            'owner wake should target the source owner dispatch service',
          );
          t.equal(
            deliveries[0]?.payload?.type,
            ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
            'owner wake should use replica operation dispatch',
          );
          t.equal(
            deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ID],
            TEST_OPERATION_ID,
            'owner wake should carry the operation id',
          );
          t.equal(
            deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.operation_id,
            TEST_OPERATION_ID,
            'owner wake should carry the operation row',
          );
          t.equal(
            deliveries[0]?.options?.deliverySource,
            TEST_COORDINATOR_CREATED_REMOTE_HANDOFF,
            'owner wake should retain the remote handoff delivery source',
          );
          t.equal(
            deliveries[0]?.options?.deliveryPriority,
            TEST_CRITICAL_DELIVERY_PRIORITY,
            'priority recovery owner wake should use critical delivery',
          );
          t.equal(
            operation.workflowStep,
            WORKFLOW_STEP.PENDING,
            'target-side outcome should not mutate the non-local operation',
          );
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

test('priority recovery in-progress create dispatch reconciles observed ' +
  'target progress',
async (t) => {
  const deliveries = [];
  const operation = buildTestOperation({
    type: OperationType.REPLACE,
    partitionId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
    entityId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
    replicaId: TEST_PRIORITY_RECOVERY_REPLICA_ID,
    sourceNodeId: TEST_PRIORITY_RECOVERY_SOURCE_NODE_ID,
    targetNodeId: TEST_PRIORITY_RECOVERY_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.CREATING,
    status: ReplicaStatus.CREATING,
  });
  const {coordinator} = createTestCoordinator({operation});
  coordinator.messageRouter = {
    async deliver(target, payload, options) {
      deliveries.push({target, payload, options});
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  coordinator.workflowOwner.messageRouter = coordinator.messageRouter;
  coordinator.workflowOwner.repository.getObservedReplicaStatusFromCache =
    () => ReplicaStatus.SYNCING;

  try {
    await coordinator.workflowOwner.dispatchOperationInternal(operation);

    t.equal(
      deliveries.length,
      1,
      'create rearm should still issue one dispatch request',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SYNCING,
      'in-progress create dispatch should advance to the observed target progress state',
    );
    t.equal(
      operation.status,
      ReplicaStatus.SYNCING,
      'in-progress create dispatch should persist the reconciled target status',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('priority recovery in-progress create dispatch uses response target ' +
  'status when cache is unavailable',
async (t) => {
  const deliveries = [];
  const scheduledTimers = [];
  const operation = buildTestOperation({
    type: OperationType.REPLACE,
    partitionId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
    entityId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
    replicaId: TEST_PRIORITY_RECOVERY_REPLICA_ID,
    sourceNodeId: TEST_PRIORITY_RECOVERY_SOURCE_NODE_ID,
    targetNodeId: TEST_PRIORITY_RECOVERY_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.CREATING,
    status: ReplicaStatus.CREATING,
  });
  const {coordinator} = createTestCoordinator({
    operation,
    setTimeoutFn(callback, delayMs) {
      const timerHandle = {callback, delayMs};
      scheduledTimers.push(timerHandle);
      return timerHandle;
    },
    clearTimeoutFn(timerHandle) {
      timerHandle.cleared = true;
    },
  });
  coordinator.messageRouter = {
    async deliver(target, payload, options) {
      deliveries.push({target, payload, options});
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
        [ReplicaOperationField.REPLICA_STATUS]: ReplicaStatus.SYNCING,
      };
    },
  };
  coordinator.workflowOwner.messageRouter = coordinator.messageRouter;
  coordinator.workflowOwner.repository.getObservedReplicaStatusFromCache =
    () => null;

  try {
    await coordinator.workflowOwner.dispatchOperationInternal(operation);

    t.equal(
      deliveries.length,
      1,
      'create rearm should still issue one dispatch request',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SYNCING,
      'response target status should advance without services-cache coverage',
    );
    t.equal(
      operation.status,
      ReplicaStatus.SYNCING,
      'response target status should persist the reconciled workflow status',
    );
    t.equal(
      scheduledTimers.length,
      1,
      'SYNCING response progress should arm observed-progress recheck',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('in-progress remove dispatch does not reconcile active target as ' +
  'create progress',
async (t) => {
  const deliveries = [];
  let completedEventCount = 0;
  const operation = buildTestOperation({
    type: OperationType.REMOVE,
    partitionId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
    entityId: TEST_PRIORITY_RECOVERY_PARTITION_ID,
    replicaId: TEST_PRIORITY_RECOVERY_REPLICA_ID,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_PRIORITY_RECOVERY_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.STOPPING,
    status: ReplicaStatus.REMOVING,
    stepsHistory: [
      {
        step: WORKFLOW_STEP.STOPPING,
        timestamp: Date.now(),
      },
    ],
  });
  const {coordinator} = createTestCoordinator({operation});
  coordinator.messageRouter = {
    async deliver(target, payload, options) {
      deliveries.push({target, payload, options});
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  coordinator.workflowOwner.messageRouter = coordinator.messageRouter;
  coordinator.workflowOwner.evaluateRemoveSafety = async () => ({});
  coordinator.workflowOwner.repository.getObservedReplicaStatusFromCache =
    () => ReplicaStatus.ACTIVE;
  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
    () => {
      completedEventCount += 1;
    },
  );

  try {
    await coordinator.workflowOwner.executeOperationInternal(operation);

    t.equal(
      deliveries.length,
      1,
      'remove rearm should issue one dispatch request',
    );
    t.equal(
      deliveries[0]?.payload?.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'remove rearm should keep the remove-phase message type',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'in-progress remove dispatch should remain parked in STOPPING',
    );
    t.equal(
      operation.status,
      ReplicaStatus.REMOVING,
      'observed active target should not complete a remove operation',
    );
    t.equal(
      operation.completedAt,
      null,
      'in-progress remove dispatch should not mark completion',
    );
    t.equal(
      completedEventCount,
      0,
      'in-progress remove dispatch should not emit completion',
    );
  } finally {
    await coordinator.shutdown();
  }
});
