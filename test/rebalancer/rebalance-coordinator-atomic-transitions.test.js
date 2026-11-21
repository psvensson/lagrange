import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OPERATION_RECONCILE_OUTCOME} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {buildOperationUpdateOutcome} from '../../src/rebalancer/replica-operation-update-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {createTestCoordinator} from './test-helpers.js';

const MOCK_NODE_ID = 'node-local';

function createMinimalCoordinator(t, overrides = {}) {
  const coordinator = createTestCoordinator({nodeId: MOCK_NODE_ID, ...overrides});
  t.teardown(() => coordinator.shutdown());
  return coordinator;
}

async function seedOperation(t, coordinator, overrides = {}) {
  const operation = {
    operationId: 'op-atomic-test', type: 'ADD', partitionId: 'partition-1',
    entityType: 'partition', entityId: 'partition-1', replicaId: 'partition-1-r1',
    sourceNodeId: MOCK_NODE_ID, targetNodeId: 'node-remote', status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING, createdAt: Date.now(), updatedAt: Date.now(),
    completedAt: null, errorMessage: null, stepsHistory: [], ...overrides,
  };
  t.equal(await coordinator.repository.persistNewOperation(operation), true,
    'fixture begins with the real SQLite INSERT');
  return operation;
}

test('transition persistence is independent autocommit with expected-step CAS', async (t) => {
  const coordinator = createMinimalCoordinator(t, {
    transactionCoordinator: {async begin() {
      throw new Error('rebalancer must not open a transaction');
    }},
  });
  const operation = await seedOperation(t, coordinator);
  const execute = coordinator.sqlQueryEngine.executeQuery.bind(coordinator.sqlQueryEngine);
  const writes = [];
  coordinator.sqlQueryEngine.executeQuery = async (sql, params, options) => {
    if (sql.includes('UPDATE replica_operations') && sql.includes('workflow_step')) {
      writes.push({sql, params, options});
    }
    return execute(sql, params, options);
  };
  await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
  t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
  t.equal(writes.length, 1);
  t.match(writes[0].sql, /workflow_step = \?/);
  t.equal(writes[0].params.at(-1), WORKFLOW_STEP.PENDING);
  t.equal(Object.hasOwn(writes[0].options || {}, 'sessionId'), false);
});

test('transition marks committed only after persistence then confirms', async (t) => {
  const coordinator = createMinimalCoordinator(t);
  const operation = await seedOperation(t, coordinator);
  const persist = coordinator.repository.persistOperationUpdate.bind(coordinator.repository);
  const confirm = coordinator.repository.confirmReplicaOperationPersistence.bind(coordinator.repository);
  const order = [];
  coordinator.repository.persistOperationUpdate = async (...args) => {
    order.push('persist');
    t.equal(coordinator.operationWorkflowCoordinator.isTransitionIdempotent(
      operation.operationId, WORKFLOW_STEP.SENDING), false);
    return persist(...args);
  };
  coordinator.repository.confirmReplicaOperationPersistence = async (...args) => {
    order.push('confirm');
    return confirm(...args);
  };
  await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
  t.same(order, ['persist', 'confirm']);
  t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
});

test('honest persistence refusal leaves the operation projection uncommitted', async (t) => {
  const coordinator = createMinimalCoordinator(t);
  const operation = await seedOperation(t, coordinator);
  // This adapter-only refusal uses the real producer's builder. SQLite refusal
  // and competing writer behavior are separately exercised by the strict witness.
  coordinator.repository.persistOperationUpdate = async () => buildOperationUpdateOutcome({
    persisted: false, disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED, operation: null,
  });
  const result = await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
  t.equal(result, OPERATION_RECONCILE_OUTCOME.REFUSED);
  t.equal(operation.workflowStep, WORKFLOW_STEP.PENDING);
});

test('transition owner lets independent operation persistence overlap', async (t) => {
  const coordinator = createMinimalCoordinator(t);
  const first = await seedOperation(t, coordinator, {operationId: 'op-first'});
  const second = await seedOperation(t, coordinator, {operationId: 'op-second'});
  const persist = coordinator.repository.persistOperationUpdate.bind(coordinator.repository);
  let inFlight = 0;
  let maxInFlight = 0;
  coordinator.repository.persistOperationUpdate = async (...args) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await Promise.resolve();
      return await persist(...args);
    } finally {
      inFlight--;
    }
  };
  await Promise.all([
    coordinator.updateStep(first, WORKFLOW_STEP.SENDING),
    coordinator.updateStep(second, WORKFLOW_STEP.SENDING),
  ]);
  t.equal(maxInFlight, 2);
  t.equal(first.workflowStep, WORKFLOW_STEP.SENDING);
  t.equal(second.workflowStep, WORKFLOW_STEP.SENDING);
});

test('idempotent transition reads the durable winner and does not persist twice', async (t) => {
  const coordinator = createMinimalCoordinator(t);
  const operation = await seedOperation(t, coordinator);
  const persist = coordinator.repository.persistOperationUpdate.bind(coordinator.repository);
  let calls = 0;
  coordinator.repository.persistOperationUpdate = async (...args) => {
    calls++;
    return persist(...args);
  };
  await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
  const original = await coordinator.repository.queryAuthoritativeOperationById(operation.operationId);
  const result = await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
  t.equal(calls, 1);
  t.equal(result, OPERATION_RECONCILE_OUTCOME.WAITING);
  t.same(await coordinator.repository.queryAuthoritativeOperationById(operation.operationId), original);
});

test('guarded transitions retry the same operation after rejected persistence', async (t) => {
  const cases = [
    {name: 'updateStep', initialStep: WORKFLOW_STEP.PENDING, initialStatus: 'pending',
      targetStep: WORKFLOW_STEP.SENDING,
      invoke: (owner, operation) => owner.updateStep(operation, WORKFLOW_STEP.SENDING)},
    {name: 'completeOperation', initialStep: WORKFLOW_STEP.SYNCING, initialStatus: 'syncing',
      targetStep: WORKFLOW_STEP.ACTIVE,
      invoke: (owner, operation) => owner.completeOperation(operation)},
    {name: 'failOperation', initialStep: WORKFLOW_STEP.CREATING, initialStatus: 'creating',
      targetStep: WORKFLOW_STEP.FAILED,
      invoke: (owner, operation) => owner.failOperation(operation, 'test failure')},
  ];
  for (const testCase of cases) {
    const coordinator = createMinimalCoordinator(t);
    const operation = await seedOperation(t, coordinator, {
      operationId: `op-same-object-${testCase.name}`,
      workflowStep: testCase.initialStep, status: testCase.initialStatus,
    });
    const execute = coordinator.sqlQueryEngine.executeQuery.bind(coordinator.sqlQueryEngine);
    let writes = 0;
    coordinator.sqlQueryEngine.executeQuery = async (sql, params, options) => {
      if (sql.includes('UPDATE replica_operations') && sql.includes('workflow_step') &&
          ++writes === 1) {
        return {success: false, error: 'persist failed'};
      }
      return execute(sql, params, options);
    };
    await t.rejects(testCase.invoke(coordinator, operation));
    t.equal(coordinator.operationWorkflowCoordinator.isTransitionIdempotent(
      operation.operationId, testCase.targetStep), false);
    await testCase.invoke(coordinator, operation);
    t.equal(writes, 2, `${testCase.name} retries the real conditional write`);
    t.equal(operation.workflowStep, testCase.targetStep);
    t.equal(operation.stepsHistory.length, 1);
    t.equal(operation.stepsHistory[0].step, testCase.targetStep);
  }
});
