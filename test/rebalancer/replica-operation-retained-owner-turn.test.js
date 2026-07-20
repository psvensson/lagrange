import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  OPERATION_OWNER_TURN_POLICY,
} from '../../src/rebalancer/operation-owner-turn-policy.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'node-retained-turn';
const TEST_OPERATION_ID = 'schema-job-users:operation:node-retained-turn';
const TEST_PARTITION_ID = 'tbl-users-p1';
const TEST_REPLICA_ID = 'schema-job-users:replica:node-retained-turn';
const TEST_HOLDER_ERROR = 'concurrent wake failed independently';

function buildOperation() {
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

function applyOperationUpdate(operation, params) {
  operation.status = params[0];
  operation.workflowStep = params[1];
  operation.updatedAt = params[2];
  operation.completedAt = params[3];
  operation.errorMessage = params[4];
  operation.stepsHistory = JSON.parse(params[5]);
  operation.replicaId = params[6];
}

function createCoordinator(operation, deliveries) {
  const executeQuery = async (sql, params) => {
    if (sql.includes('WHERE operation_id')) {
      return {success: true, rows: [operationToRow(operation)]};
    }
    if (sql.includes('UPDATE')) {
      applyOperationUpdate(operation, params);
      return {success: true, rows: [], affectedRows: 1};
    }
    return {success: true, rows: []};
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: {get: () => null},
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    tablePolicyService: {
      getPolicyForPartition: async () => ({minReplicaCount: 1}),
    },
    messageRouter: {
      async deliver() {
        deliveries.push(TEST_OPERATION_ID);
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {executeQuery},
    controlPlaneSystemTableGateway: {
      readRows: async (_tableName, sql, params) => executeQuery(sql, params),
      readAuthoritativeRows:
        async (_tableName, sql, params) => executeQuery(sql, params),
      executeQuery,
    },
    operationWorkflowCoordinator: new DurableWorkflowCoordinator(),
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  coordinator.repository.confirmReplicaOperationPersistence =
    async (projectedOperation) => ({operation: projectedOperation});
  return coordinator;
}

async function holdOperationOwnerLane(coordinator, rejectAfterRelease = false) {
  const ownerKey =
    coordinator.getOperationOwnerSingleFlightKey(TEST_OPERATION_ID);
  let release;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const promise = coordinator.operationWorkflowRunExclusive(
    ownerKey,
    async () => {
      markStarted();
      await new Promise((resolve) => {
        release = resolve;
      });
      if (rejectAfterRelease) {
        throw new Error(TEST_HOLDER_ERROR);
      }
    },
  );
  await started;
  return {promise, release};
}

test('ordinary concurrent execute keeps the generic coalescing contract',
  async (t) => {
    const operation = buildOperation();
    const deliveries = [];
    const coordinator = createCoordinator(operation, deliveries);
    const holder = await holdOperationOwnerLane(coordinator);

    const result = await coordinator.executeOperation(operation);

    t.equal(result?.skipped, true, 'the ordinary duplicate is skipped');
    t.equal(result?.reason, 'operation_already_executing',
      'the ordinary duplicate retains its established reason');
    t.equal(deliveries.length, 0, 'the ordinary duplicate does not dispatch');
    t.equal(operation.workflowStep, WORKFLOW_STEP.PENDING,
      'the skipped duplicate leaves the row untouched');
    holder.release();
    await holder.promise;
    await coordinator.shutdown();
  });

test('retained schema inline execute owns a turn after a concurrent wake',
  async (t) => {
    const operation = buildOperation();
    const deliveries = [];
    const coordinator = createCoordinator(operation, deliveries);
    const holder = await holdOperationOwnerLane(coordinator);

    const executePromise = coordinator.executeOperation(operation, {
      ownerTurnPolicy: OPERATION_OWNER_TURN_POLICY.RETAIN,
    });
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(deliveries.length, 0, 'the command waits behind the wake');

    holder.release();
    await holder.promise;
    const result = await executePromise;

    t.equal(result?.success, true, 'the exact command owns the next turn');
    t.same(deliveries, [TEST_OPERATION_ID], 'the schema child dispatches once');
    t.equal(operation.workflowStep, WORKFLOW_STEP.CREATING,
      'the durable child leaves PENDING');
    await coordinator.shutdown();
  });

test('retained schema execute does not inherit the holder rejection',
  async (t) => {
    const operation = buildOperation();
    const deliveries = [];
    const coordinator = createCoordinator(operation, deliveries);
    const holder = await holdOperationOwnerLane(coordinator, true);
    const holderOutcome = holder.promise.catch((error) => error);

    const executePromise = coordinator.executeOperation(operation, {
      ownerTurnPolicy: OPERATION_OWNER_TURN_POLICY.RETAIN,
    });
    holder.release();
    const [holderError, result] = await Promise.all([
      holderOutcome,
      executePromise,
    ]);

    t.equal(holderError?.message, TEST_HOLDER_ERROR,
      'the rejection remains attributable to the concurrent holder');
    t.equal(result?.success, true,
      'the retained command still owns a later turn');
    t.same(deliveries, [TEST_OPERATION_ID],
      'the retained command dispatches exactly once');
    t.equal(operation.workflowStep, WORKFLOW_STEP.CREATING,
      'the retained command leaves PENDING after holder failure');
    await coordinator.shutdown();
  });
