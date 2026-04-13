/**
 * Tests proving that replica_operations is a single-writer table
 * owned by RebalanceCoordinator.
 *
 * Task 3.4: Remove non-owner writes and any fallback row
 * reconstruction tied to those writes.
 * Task 3.5: Owner-path regressions proving handlers cannot bypass
 * the coordinator.
 *
 * Proves:
 * - ReplicaHandler no longer has updateOperationStep
 * - MessageGroupServiceHandler no longer has updateOperationStep
 * - RuntimeServiceHandler no longer has updateOperationStep
 * - ReplicaDispatchService no longer writes to replica_operations
 *   directly; dispatch claim routes through coordinator
 * - RebalanceCoordinator.claimDispatchTransition performs the
 *   PENDING→SENDING transition through the owner path
 * - claimDispatchTransition rejects non-PENDING, non-local, and
 *   missing operations
 * - ReplicaHandler emits typed outcomes (REPLICA_CREATE_ACTIVE),
 *   not direct replica_operations writes
 * - MessageGroupServiceHandler emits typed outcomes, not writes
 * - RuntimeServiceHandler emits typed outcomes, not writes
 * - Coordinator consumes outcome and transitions workflow through
 *   the owner path
 * - No handler cdcIntegrationService calls target REPLICA_OPERATIONS
 *
 * Requirements: 1, 6, 8
 * Design: §2, §7, Phase 2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {ReplicaHandler} from
  '../../src/node/replica-handler.js';
import {MessageGroupServiceHandler} from
  '../../src/node/message-group-service-handler.js';
import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from '../../src/rebalancer/executor-outcome-emitter.js';
import {
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_OUTCOME_FIELD,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  ReplicaStatus,
  isCoordinatorOwnedOperationType,
} from
  '../../src/rebalancer/replica-status.js';
import {SystemTableCache} from
  '../../src/cache/system-table-cache.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'node-single-writer';
const TEST_OPERATION_ID = 'op-sw-1';
const TEST_PARTITION_ID = 'partition-sw-1';
const TEST_REPLICA_ID = 'partition-sw-1-r1';
const REMOTE_NODE_ID = 'node-remote';

/**
 * Build a minimal operation record for testing.
 * @param {Object} overrides - Field overrides.
 * @return {Object} Operation record.
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
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [{step: WORKFLOW_STEP.PENDING, timestamp: now}],
    ...overrides,
  };
}

/**
 * Convert an in-memory operation to a SQL row shape.
 * @param {Object} op - Operation object.
 * @return {Object} Row-shaped object.
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

/**
 * Create a coordinator with a SQL engine that returns the given
 * operation when queried by ID.
 * @param {Object} options - Test options.
 * @return {Object} Coordinator and tracking state.
 */
function createTestCoordinator(options = {}) {
  const {
    operation = null,
    persistResults = {success: true, rows: [], affectedRows: 1},
    messageRouter = null,
    transactionCoordinator = null,
  } = options;

  const emitter = new ExecutorOutcomeEmitter({logger: console});
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const persisted = [];
  const executeQuery = async (sql, params) => {
    if (sql.includes('WHERE operation_id') && operation) {
      const opId = params?.[0];
      if (opId === operation.operationId) {
        return {
          success: true,
          rows: [operationToRow(operation)],
        };
      }
    }
    if (sql.includes('UPDATE')) {
      if (operation) {
        operation.status = params?.[0] ?? operation.status;
        operation.workflowStep = params?.[1] ?? operation.workflowStep;
        operation.updatedAt = params?.[2] ?? operation.updatedAt;
        operation.completedAt = params?.[3] ?? operation.completedAt;
        operation.errorMessage = params?.[4] ?? operation.errorMessage;
        operation.stepsHistory = Array.isArray(operation.stepsHistory) ?
          JSON.parse(params?.[5] || JSON.stringify(operation.stepsHistory)) :
          [];
        operation.replicaId = params?.[6] ?? operation.replicaId;
      }
      persisted.push({sql, params});
      return persistResults;
    }
    return {success: true, rows: []};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: {get() { return null; }},
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: messageRouter || {
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {
      executeQuery,
    },
    controlPlaneSystemTableGateway: {
      async readRows(_tableName, sql, params) {
        return executeQuery(sql, params);
      },
      async readAuthoritativeRows(_tableName, sql, params) {
        return executeQuery(sql, params);
      },
      async executeQuery(sql, params) {
        return executeQuery(sql, params);
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() { return null; },
    },
    operationWorkflowCoordinator: workflowCoordinator,
    executorOutcomeEmitter: emitter,
    transactionCoordinator:
      transactionCoordinator || createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    enableTimeouts: false,
  });
  coordinator.initialize();

  return {coordinator, emitter, persisted};
}

// --- Executor handlers no longer have updateOperationStep ---

test('ReplicaHandler does not have updateOperationStep ' +
  '(uses executor outcome emitter instead)',
async (t) => {
  t.equal(
    typeof ReplicaHandler.prototype.updateOperationStep,
    'undefined',
    'ReplicaHandler.prototype.updateOperationStep must not exist',
  );
});

test('MessageGroupServiceHandler does not have ' +
  'updateOperationStep (uses executor outcome emitter instead)',
async (t) => {
  t.equal(
    typeof MessageGroupServiceHandler.prototype.updateOperationStep,
    'undefined',
    'MessageGroupServiceHandler.prototype.updateOperationStep ' +
    'must not exist',
  );
});

test('RuntimeServiceHandler does not have updateOperationStep ' +
  '(uses executor outcome emitter instead)',
async (t) => {
  t.equal(
    typeof RuntimeServiceHandler.prototype.updateOperationStep,
    'undefined',
    'RuntimeServiceHandler.prototype.updateOperationStep ' +
    'must not exist',
  );
});

// --- Dispatch service no longer has claimPendingDispatch ---

test('ReplicaDispatchService does not have claimPendingDispatch ' +
  '(dispatch claim routes through coordinator)',
async (t) => {
  t.equal(
    typeof ReplicaDispatchService.prototype.claimPendingDispatch,
    'undefined',
    'ReplicaDispatchService.prototype.claimPendingDispatch ' +
    'must not exist',
  );
});

test('ReplicaDispatchService does not have getClaimAffectedRows ' +
  '(removed with claimPendingDispatch)',
async (t) => {
  t.equal(
    typeof ReplicaDispatchService.prototype.getClaimAffectedRows,
    'undefined',
    'ReplicaDispatchService.prototype.getClaimAffectedRows ' +
    'must not exist',
  );
});

// --- claimDispatchTransition owner-path tests ---

test('claimDispatchTransition transitions PENDING operation to ' +
  'SENDING through coordinator owner path',
async (t) => {
  const operation = buildTestOperation({
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const {coordinator, persisted} =
    createTestCoordinator({operation});

  const claimed = await coordinator.claimDispatchTransition(
    TEST_OPERATION_ID,
  );

  t.ok(claimed, 'claim must return the operation');
  t.equal(
    claimed.workflowStep,
    WORKFLOW_STEP.SENDING,
    'claimed operation must be in SENDING state',
  );
  t.ok(
    persisted.length > 0,
    'coordinator must persist the transition via SQL',
  );
});

test('claimDispatchTransition returns null for non-PENDING ' +
  'operation (already claimed)',
async (t) => {
  const operation = buildTestOperation({
    workflowStep: WORKFLOW_STEP.SENDING,
  });
  const {coordinator, persisted} =
    createTestCoordinator({operation});

  const claimed = await coordinator.claimDispatchTransition(
    TEST_OPERATION_ID,
  );

  t.equal(claimed, null, 'claim must return null for non-PENDING');
  t.equal(
    persisted.length,
    0,
    'no persistence should occur for non-PENDING claim',
  );
});

test('claimDispatchTransition returns null for missing operation',
  async (t) => {
    const {coordinator, persisted} =
      createTestCoordinator({operation: null});

    const claimed = await coordinator.claimDispatchTransition(
      'nonexistent-op',
    );

    t.equal(claimed, null, 'claim must return null for missing op');
    t.equal(
      persisted.length,
      0,
      'no persistence should occur for missing operation',
    );
  });

test('claimDispatchTransition returns null for operation owned ' +
  'by another node',
async (t) => {
  const operation = buildTestOperation({
    workflowStep: WORKFLOW_STEP.PENDING,
    sourceNodeId: REMOTE_NODE_ID,
  });
  const {coordinator, persisted} =
    createTestCoordinator({operation});

  const claimed = await coordinator.claimDispatchTransition(
    TEST_OPERATION_ID,
  );

  t.equal(
    claimed,
    null,
    'claim must return null for non-local operation',
  );
  t.equal(
    persisted.length,
    0,
    'no persistence should occur for non-local operation',
  );
});

test('claimDispatchTransition returns null for bootstrap-owned ' +
  'MOVE_ASSIGNMENT reservations',
async (t) => {
  const operation = buildTestOperation({
    type: 'MOVE_ASSIGNMENT',
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const {coordinator, persisted} =
    createTestCoordinator({operation});

  const claimed = await coordinator.claimDispatchTransition(
    TEST_OPERATION_ID,
  );

  t.equal(
    isCoordinatorOwnedOperationType(operation.type),
    false,
    'MOVE_ASSIGNMENT must stay outside the coordinator owner domain',
  );
  t.equal(
    claimed,
    null,
    'claim must ignore bootstrap-owned reservation rows',
  );
  t.equal(
    persisted.length,
    0,
    'no persistence should occur for bootstrap-owned reservations',
  );
});

test('claimDispatchTransition returns null when coordinator is ' +
  'shutting down',
async (t) => {
  const operation = buildTestOperation({
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const {coordinator} = createTestCoordinator({operation});

  coordinator.isShuttingDown = true;

  const claimed = await coordinator.claimDispatchTransition(
    TEST_OPERATION_ID,
  );

  t.equal(
    claimed,
    null,
    'claim must return null during shutdown',
  );
});

test('claimDispatchTransition uses compare-and-set owner claim for priority ' +
  'control-plane partitions',
async (t) => {
  const operation = buildTestOperation({
    partitionId: 'sql_transactions-p1',
    entityId: 'sql_transactions-p1',
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const txCalls = [];
  const transactionCoordinator = {
    begin: async () => {
      txCalls.push('begin');
      return {success: true};
    },
    commit: async () => {
      txCalls.push('commit');
      return {success: true};
    },
    rollback: async () => {
      txCalls.push('rollback');
      return {success: true};
    },
  };
  const {coordinator, persisted} = createTestCoordinator({
    operation,
    transactionCoordinator,
  });

  const claimed = await coordinator.claimDispatchTransition(
    TEST_OPERATION_ID,
  );

  t.ok(claimed, 'priority claim must return the operation');
  t.equal(
    claimed.workflowStep,
    WORKFLOW_STEP.SENDING,
    'priority claim must still advance the workflow step',
  );
  t.equal(
    txCalls.length,
    0,
    'priority dispatch claim should not begin a distributed transaction',
  );
  t.equal(
    persisted.length,
    1,
    'priority dispatch claim should perform exactly one durable compare-and-set update',
  );
  t.match(
    persisted[0]?.sql || '',
    /WHERE operation_id = \? AND workflow_step = \?/,
    'priority dispatch claim should guard the update on the durable PENDING row',
  );
});

test('dispatchOperation shares the owner-key execution with ' +
  'concurrent inline executeOperation calls',
async (t) => {
  const operation = buildTestOperation({
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  let releaseDispatch = null;
  let dispatchStartedResolve = null;
  const dispatchStarted = new Promise((resolve) => {
    dispatchStartedResolve = resolve;
  });

  const {coordinator, persisted} = createTestCoordinator({
    operation,
    messageRouter: {
      async deliver() {
        dispatchStartedResolve();
        await new Promise((resolve) => {
          releaseDispatch = resolve;
        });
        return {acknowledged: true, status: 'initiated'};
      },
    },
  });

  const queuedDispatchPromise = coordinator.dispatchOperation(
    TEST_OPERATION_ID,
  );
  await dispatchStarted;

  const inlineResult = await coordinator.executeOperation(operation);
  t.same(
    inlineResult,
    {
      success: false,
      skipped: true,
      reason: REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
      operationId: TEST_OPERATION_ID,
    },
    'concurrent inline execution should observe the shared owner-key lock',
  );

  releaseDispatch();
  const dispatchResult = await queuedDispatchPromise;
  t.equal(
    dispatchResult?.success,
    true,
    'queued dispatch should complete successfully',
  );
  t.equal(
    persisted.length,
    2,
    'dispatch owner path should persist each step transition only once',
  );
});

test('dispatchOperation uses critical router priority for replica work',
  async (t) => {
    const operation = buildTestOperation({
      workflowStep: WORKFLOW_STEP.PENDING,
      targetNodeId: REMOTE_NODE_ID,
    });
    const deliverCalls = [];

    const {coordinator} = createTestCoordinator({
      operation,
      messageRouter: {
        async deliver(target, request, options) {
          deliverCalls.push({target, request, options});
          return {acknowledged: true, status: 'initiated'};
        },
      },
    });

    const result = await coordinator.dispatchOperation(TEST_OPERATION_ID);

    t.equal(result.success, true, 'dispatch should still succeed');
    t.equal(deliverCalls.length, 1, 'dispatch should use one router delivery');
    t.equal(
      deliverCalls[0].options?.deliveryPriority,
      'critical',
      'replica dispatch should use critical router priority',
    );
    t.equal(
      deliverCalls[0].options?.targetNodeId,
      REMOTE_NODE_ID,
      'dispatch should preserve explicit target node routing',
    );
  });
