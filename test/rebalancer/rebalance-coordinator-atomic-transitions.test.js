import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const MOCK_NODE_ID = 'node-local';

function createTestOperation(overrides = {}) {
  return {
    operationId: 'op-atomic-test',
    type: 'ADD',
    partitionId: 'partition-1',
    entityType: 'partition',
    entityId: 'partition-1',
    replicaId: 'partition-1-r1',
    sourceNodeId: MOCK_NODE_ID,
    targetNodeId: 'node-remote',
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    ...overrides,
  };
}

function createMinimalCoordinator(overrides = {}) {
  const coordinator = new RebalanceCoordinator({
    nodeId: MOCK_NODE_ID,
    systemTableCache: {get() {
      return null;
    }},
    cdcIntegrationService: {async waitForCacheUpdate() {}},
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
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    enableTimeouts: false,
    ...overrides,
  });
  coordinator.repository.confirmReplicaOperationPersistence = async () => {};
  return coordinator;
}

test('transition persistence is independent autocommit with expected-step CAS',
  async (t) => {
    const observedWrites = [];
    const coordinator = createMinimalCoordinator({
      transactionCoordinator: {
        async begin() {
          throw new Error('rebalancer must not open a transaction');
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params, options) {
          if (sql.includes('UPDATE replica_operations')) {
            observedWrites.push({sql, params, options});
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();
    try {
      const operation = createTestOperation();
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
      t.equal(observedWrites.length, 1);
      t.equal(
        Object.hasOwn(observedWrites[0].options, 'sessionId'),
        false,
      );
      t.match(observedWrites[0].sql, /workflow_step = \?/,
        'non-terminal transitions use the same durable CAS as priority rows');
    } finally {
      await coordinator.shutdown();
    }
  });

test('transition marks committed only after persistence then confirms',
  async (t) => {
    const callOrder = [];
    const coordinator = createMinimalCoordinator();
    coordinator.repository.persistOperationUpdate = async () => {
      callOrder.push('persist');
      return true;
    };
    coordinator.repository.confirmReplicaOperationPersistence = async () => {
      callOrder.push('confirm');
    };
    coordinator.initialize();
    try {
      const operation = createTestOperation();
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
      t.same(callOrder, ['persist', 'confirm']);
      t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
    } finally {
      await coordinator.shutdown();
    }
  });

test('honest persistence refusal leaves the operation projection uncommitted',
  async (t) => {
    const coordinator = createMinimalCoordinator();
    coordinator.repository.persistOperationUpdate = async () => false;
    coordinator.initialize();
    try {
      const operation = createTestOperation();
      const committed = await coordinator.updateStep(
        operation,
        WORKFLOW_STEP.SENDING,
      );
      t.equal(committed, false);
      t.equal(operation.workflowStep, WORKFLOW_STEP.PENDING);
    } finally {
      await coordinator.shutdown();
    }
  });

test('transition owner serializes independent operation persistence',
  async (t) => {
    let inFlight = 0;
    let maxInFlight = 0;
    const coordinator = createMinimalCoordinator();
    coordinator.repository.persistOperationUpdate = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return true;
    };
    coordinator.initialize();
    try {
      const first = createTestOperation({operationId: 'op-first'});
      const second = createTestOperation({operationId: 'op-second'});
      await Promise.all([
        coordinator.updateStep(first, WORKFLOW_STEP.SENDING),
        coordinator.updateStep(second, WORKFLOW_STEP.SENDING),
      ]);
      t.equal(maxInFlight, 1);
      t.equal(first.workflowStep, WORKFLOW_STEP.SENDING);
      t.equal(second.workflowStep, WORKFLOW_STEP.SENDING);
    } finally {
      await coordinator.shutdown();
    }
  });

test('idempotent transition does not persist twice', async (t) => {
  let persistCalls = 0;
  const coordinator = createMinimalCoordinator();
  coordinator.repository.persistOperationUpdate = async () => {
    persistCalls += 1;
    return true;
  };
  coordinator.initialize();
  try {
    const operation = createTestOperation();
    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
    t.equal(persistCalls, 1);
  } finally {
    await coordinator.shutdown();
  }
});

test('guarded transitions retry the same operation after rejected persistence',
  async (t) => {
    const cases = [
      {
        name: 'updateStep',
        initialStep: WORKFLOW_STEP.PENDING,
        initialStatus: 'pending',
        targetStep: WORKFLOW_STEP.SENDING,
        invoke: (coordinator, operation) =>
          coordinator.updateStep(operation, WORKFLOW_STEP.SENDING),
      },
      {
        name: 'completeOperation',
        initialStep: WORKFLOW_STEP.SYNCING,
        initialStatus: 'syncing',
        targetStep: WORKFLOW_STEP.ACTIVE,
        invoke: (coordinator, operation) =>
          coordinator.completeOperation(operation),
      },
      {
        name: 'failOperation',
        initialStep: WORKFLOW_STEP.CREATING,
        initialStatus: 'creating',
        targetStep: WORKFLOW_STEP.FAILED,
        invoke: (coordinator, operation) =>
          coordinator.failOperation(operation, 'test failure'),
      },
    ];

    for (const testCase of cases) {
      let persistCalls = 0;
      const coordinator = createMinimalCoordinator({
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (!sql.includes('UPDATE replica_operations')) {
              return {success: true, rows: [], changes: 1};
            }
            persistCalls += 1;
            return persistCalls === 1 ?
              {success: false, error: 'persist failed'} :
              {success: true, rows: [], changes: 1};
          },
        },
      });
      coordinator.initialize();
      try {
        const operation = createTestOperation({
          operationId: `op-same-object-${testCase.name}`,
          workflowStep: testCase.initialStep,
          status: testCase.initialStatus,
        });

        await t.rejects(
          testCase.invoke(coordinator, operation),
          `${testCase.name} must surface the first persist rejection`,
        );
        t.equal(
          coordinator.operationWorkflowCoordinator.isTransitionIdempotent(
            operation.operationId,
            testCase.targetStep,
          ),
          false,
          `${testCase.name} must not poison the idempotency key`,
        );

        await testCase.invoke(coordinator, operation);

        t.equal(persistCalls, 2,
          `${testCase.name} must retry durable persistence`);
        t.equal(operation.workflowStep, testCase.targetStep,
          `${testCase.name} must project the successful retry`);
        t.equal(operation.stepsHistory.length, 1,
          `${testCase.name} must append one durable history entry`);
        t.equal(operation.stepsHistory[0]?.step, testCase.targetStep,
          `${testCase.name} history must record the target step`);
      } finally {
        await coordinator.shutdown();
      }
    }
  });
