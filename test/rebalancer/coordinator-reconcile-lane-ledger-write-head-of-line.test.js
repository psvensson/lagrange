/**
 * Run-22 deterministic reproduction: one replica_operations INSERT for the
 * operation-ledger partition remained in flight while a sibling priority
 * operation had already reached ACTIVE replica truth. The repository's
 * mutation lane must let the sibling owner reconcile persist independently,
 * while retaining serialization for two mutations of the same operation.
 */
import {setImmediate as waitForImmediate} from 'node:timers/promises';
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  RebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  createOperation,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockMessageRouter,
  createMockPolicyService,
} from './test-helpers.js';

const TEST_NODE_ID = 'coordinator-hol-owner-node';
const TEST_SLOW_OPERATION_ID = 'coordinator-hol-slow-ledger-insert';
const TEST_SIBLING_OPERATION_ID = 'coordinator-hol-sibling-reconcile';
const TEST_SLOW_REPLICA_ID = 'replica_operations-p1-r4';
const TEST_SIBLING_REPLICA_ID = 'control_plane_publications-p1-r4';
const TEST_OBSERVATION_TURN_BUDGET = 20;
const TEST_SQL_INSERT_PREFIX = 'INSERT';
const TEST_SQL_UPDATE_PREFIX = 'UPDATE';
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';

function createDeferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return {promise, resolve: resolvePromise};
}

function buildOperation({operationId, partitionId, replicaId, step}) {
  const operation = createOperation({
    operationId,
    type: OperationType.ADD,
    partitionId,
    replicaId,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_NODE_ID,
  });
  if (step !== WORKFLOW_STEP.PENDING) {
    operation.workflowStep = step;
    operation.status = ReplicaStatus.SYNCING;
    operation.stepsHistory.push({
      step,
      timestamp: operation.updatedAt,
      previousStep: WORKFLOW_STEP.PENDING,
    });
  }
  return operation;
}

function updateTrackedOperationRow(rowsByOperationId, params) {
  const [
    status,
    workflowStep,
    updatedAt,
    completedAt,
    errorMessage,
    stepsHistory,
    replicaId,
    operationId,
  ] = params;
  const existing = rowsByOperationId.get(operationId) || {};
  rowsByOperationId.set(operationId, {
    ...existing,
    operation_id: operationId,
    status,
    workflow_step: workflowStep,
    updated_at: updatedAt,
    completed_at: completedAt,
    error_message: errorMessage,
    steps_history: stepsHistory,
    replica_id: replicaId,
  });
}

function createCoordinatorHarness() {
  const slowWriteStarted = createDeferred();
  const releaseSlowWrite = createDeferred();
  const siblingWriteStarted = createDeferred();
  const rowsByOperationId = new Map();
  const slowOperation = buildOperation({
    operationId: TEST_SLOW_OPERATION_ID,
    partitionId:
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
    replicaId: TEST_SLOW_REPLICA_ID,
    step: WORKFLOW_STEP.PENDING,
  });
  const siblingOperation = buildOperation({
    operationId: TEST_SIBLING_OPERATION_ID,
    partitionId:
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
    replicaId: TEST_SIBLING_REPLICA_ID,
    step: WORKFLOW_STEP.SYNCING,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql).trim();
      if (
        normalizedSql.startsWith(TEST_SQL_INSERT_PREFIX) &&
        normalizedSql.includes(TEST_REPLICA_OPERATIONS_TABLE) &&
        params[0] === TEST_SLOW_OPERATION_ID
      ) {
        slowWriteStarted.resolve();
        await releaseSlowWrite.promise;
        rowsByOperationId.set(
          slowOperation.operationId,
          coordinator.repository.buildReplicaOperationRow(slowOperation),
        );
        return {success: true, affectedRows: 1, changes: 1};
      }
      if (
        normalizedSql.startsWith(TEST_SQL_UPDATE_PREFIX) &&
        normalizedSql.includes(TEST_REPLICA_OPERATIONS_TABLE)
      ) {
        updateTrackedOperationRow(rowsByOperationId, params);
        if (params[7] === TEST_SIBLING_OPERATION_ID) {
          siblingWriteStarted.resolve();
        }
        return {success: true, affectedRows: 1, changes: 1};
      }
      if (normalizedSql.includes(TEST_REPLICA_OPERATIONS_TABLE)) {
        const operationId = params[0];
        if (operationId && rowsByOperationId.has(operationId)) {
          return {
            success: true,
            rows: [rowsByOperationId.get(operationId)],
          };
        }
        return {success: true, rows: Array.from(rowsByOperationId.values())};
      }
      return {success: true, rows: []};
    },
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: createMockCache(),
    cdcIntegrationService: {},
    messageRouter: createMockMessageRouter(),
    tablePolicyService: createMockPolicyService(),
    sqlQueryEngine,
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlQueryEngine),
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    enableTimeouts: false,
  });
  rowsByOperationId.set(
    siblingOperation.operationId,
    coordinator.repository.buildReplicaOperationRow(siblingOperation),
  );
  return {
    coordinator,
    slowOperation,
    siblingOperation,
    slowWriteStarted,
    releaseSlowWrite,
    siblingWriteStarted,
  };
}

async function settlesWithinEventLoopTurns(promise) {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  for (
    let turn = 0;
    turn < TEST_OBSERVATION_TURN_BUDGET && !settled;
    turn += 1
  ) {
    await waitForImmediate();
  }
  return settled;
}

test(
  'a frozen ledger INSERT does not block a sibling owner reconciliation',
  async (t) => {
    const harness = createCoordinatorHarness();
    const {
      coordinator,
      slowOperation,
      siblingOperation,
      slowWriteStarted,
      releaseSlowWrite,
      siblingWriteStarted,
    } = harness;
    coordinator.initialize();
    const slowWrite = coordinator.repository.persistNewOperation(
      slowOperation,
    );
    let siblingReconcile;
    try {
      await slowWriteStarted.promise;
      siblingReconcile = coordinator.operationWorkflowRunExclusive(
        coordinator.getOperationOwnerSingleFlightKey(
          siblingOperation.operationId,
        ),
        () => coordinator.workflowOwner.applyReconciledReplicaStatus(
          siblingOperation,
          ReplicaStatus.ACTIVE,
          {cause: 'progress'},
        ),
      );

      t.equal(
        await settlesWithinEventLoopTurns(siblingWriteStarted.promise),
        true,
        'the sibling SYNCING->ACTIVE ledger write starts while the unrelated ' +
          'INSERT remains frozen',
      );
    } finally {
      releaseSlowWrite.resolve();
      await Promise.all([slowWrite, siblingReconcile].filter(Boolean));
      t.equal(
        siblingOperation.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the fixture reaches ACTIVE after the frozen write is released',
      );
      await coordinator.shutdown();
    }
  },
);

test(
  'two ledger mutations for the same operation remain serialized',
  async (t) => {
    const {coordinator, siblingOperation} = createCoordinatorHarness();
    const releaseFirstMutation = createDeferred();
    const firstMutationStarted = createDeferred();
    const executionOrder = [];
    coordinator.initialize();
    try {
      const firstMutation = coordinator.repository
        .runReplicaOperationTransitionExclusive(
          async () => {
            executionOrder.push('first-start');
            firstMutationStarted.resolve();
            await releaseFirstMutation.promise;
            executionOrder.push('first-end');
          },
          {operation: siblingOperation},
        );
      await firstMutationStarted.promise;
      const secondMutation = coordinator.repository
        .runReplicaOperationTransitionExclusive(
          async () => {
            executionOrder.push('second-start');
          },
          {operation: siblingOperation},
        );

      await waitForImmediate();
      t.same(
        executionOrder,
        ['first-start'],
        'the second mutation cannot enter while the same operation is active',
      );
      releaseFirstMutation.resolve();
      await Promise.all([firstMutation, secondMutation]);
      t.same(
        executionOrder,
        ['first-start', 'first-end', 'second-start'],
        'same-operation mutation order remains single-flight',
      );
      await waitForImmediate();
      t.equal(
        coordinator.repository.replicaOperationTransitionQueues.size,
        0,
        'settled operation queues are released instead of accumulating',
      );
    } finally {
      releaseFirstMutation.resolve();
      await coordinator.shutdown();
    }
  },
);
