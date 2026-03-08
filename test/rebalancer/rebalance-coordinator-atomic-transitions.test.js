import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_TRANSITION_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';

const MOCK_NODE_ID = 'node-local';

function createMinimalCoordinator(overrides = {}) {
  const transactionCoordinator =
    Object.prototype.hasOwnProperty.call(overrides, 'transactionCoordinator') ?
      overrides.transactionCoordinator :
      new DistributedTransactionCoordinator({
        beginParticipant: async () => {},
        prepareParticipant: async () => {},
        commitParticipant: async () => {},
        rollbackParticipant: async () => {},
        now: () => 1000,
      });
  return new RebalanceCoordinator({
    nodeId: MOCK_NODE_ID,
    systemTableCache: {get() { return null; }},
    cdcIntegrationService: {async waitForCacheUpdate() {}},
    tablePolicyService: {
      async getPolicyForPartition() { return {minReplicaCount: 1}; },
    },
    messageRouter: {
      async deliver() { return {acknowledged: true, status: 'initiated'}; },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    transactionCoordinator,
    enableTimeouts: false,
    ...overrides,
  });
}

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

test('updateStep wraps transition and persist in transaction boundary',
  async (t) => {
    const txCalls = [];
    const txCoordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async () => {},
      commitParticipant: async () => {},
      rollbackParticipant: async () => {},
      now: () => 1000,
    });
    const originalBegin = txCoordinator.begin.bind(txCoordinator);
    const originalCommit = txCoordinator.commit.bind(txCoordinator);
    txCoordinator.begin = async (sessionId) => {
      txCalls.push(`begin:${sessionId}`);
      return originalBegin(sessionId);
    };
    txCoordinator.commit = async (sessionId) => {
      txCalls.push(`commit:${sessionId}`);
      return originalCommit(sessionId);
    };

    const coordinator = createMinimalCoordinator({
      transactionCoordinator: txCoordinator,
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation();
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
      t.ok(
        txCalls.some((c) => c.startsWith('begin:')),
        'transaction begin must be called',
      );
      t.ok(
        txCalls.some((c) => c.startsWith('commit:')),
        'transaction commit must be called',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('completeOperation wraps transition and persist in transaction ' +
  'boundary', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => 1000,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push(`begin:${sessionId}`);
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push(`commit:${sessionId}`);
    return originalCommit(sessionId);
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation({
      workflowStep: WORKFLOW_STEP.SYNCING,
      status: 'syncing',
    });
    await coordinator.completeOperation(operation);

    t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE);
    t.ok(
      txCalls.some((c) => c.startsWith('begin:')),
      'transaction begin must be called for terminal transition',
    );
    t.ok(
      txCalls.some((c) => c.startsWith('commit:')),
      'transaction commit must be called for terminal transition',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('failOperation wraps transition and persist in transaction ' +
  'boundary', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => 1000,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push(`begin:${sessionId}`);
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push(`commit:${sessionId}`);
    return originalCommit(sessionId);
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation({
      workflowStep: WORKFLOW_STEP.CREATING,
      status: 'creating',
    });
    await coordinator.failOperation(operation, 'test failure');

    t.equal(operation.workflowStep, WORKFLOW_STEP.FAILED);
    t.ok(
      txCalls.some((c) => c.startsWith('begin:')),
      'transaction begin must be called for failure transition',
    );
    t.ok(
      txCalls.some((c) => c.startsWith('commit:')),
      'transaction commit must be called for failure transition',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('executeAtomicTransition rolls back on persist failure',
  async (t) => {
    const txCalls = [];
    const txCoordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async () => {},
      commitParticipant: async () => {},
      rollbackParticipant: async () => {},
      now: () => 1000,
    });
    const originalBegin = txCoordinator.begin.bind(txCoordinator);
    const originalRollback = txCoordinator.rollback.bind(txCoordinator);
    txCoordinator.begin = async (sessionId) => {
      txCalls.push(`begin:${sessionId}`);
      return originalBegin(sessionId);
    };
    txCoordinator.rollback = async (sessionId) => {
      txCalls.push(`rollback:${sessionId}`);
      return originalRollback(sessionId);
    };

    const coordinator = createMinimalCoordinator({
      transactionCoordinator: txCoordinator,
      sqlQueryEngine: {
        async executeQuery() {
          return {success: false, error: 'persist failed'};
        },
      },
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation({
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
      });

      let caught = false;
      try {
        await coordinator.updateStep(
          operation, WORKFLOW_STEP.SYNCING,
        );
      } catch (_err) {
        caught = true;
      }

      t.ok(caught, 'persist failure must propagate');
      t.ok(
        txCalls.some((c) => c.startsWith('rollback:')),
        'transaction must be rolled back on persist failure',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('executeAtomicTransition fails closed when transaction coordinator ' +
  'is absent', async (t) => {
  let persistCalled = false;
  const coordinator = createMinimalCoordinator({
    transactionCoordinator: null,
    sqlQueryEngine: {
      async executeQuery() {
        persistCalled = true;
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation();

    await t.rejects(
      coordinator.updateStep(operation, WORKFLOW_STEP.SENDING),
      {
        message:
          REBALANCE_COORDINATOR_ERROR_MSG.TRANSACTION_COORDINATOR_REQUIRED,
      },
      'atomic workflow transition must fail closed without a transaction coordinator',
    );
    t.equal(
      persistCalled,
      false,
      'row persistence must not run when the transaction coordinator is missing',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('idempotency check prevents duplicate step transition',
  async (t) => {
    let persistCount = 0;
    const coordinator = createMinimalCoordinator({
      sqlQueryEngine: {
        async executeQuery() {
          persistCount++;
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation();

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
      t.equal(persistCount, 1, 'first transition must persist');

      const stepsBefore = operation.stepsHistory.length;
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);
      t.equal(
        operation.stepsHistory.length,
        stepsBefore,
        'duplicate transition must be skipped by idempotency check',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('idempotency check prevents duplicate completeOperation',
  async (t) => {
    let persistCount = 0;
    const coordinator = createMinimalCoordinator({
      sqlQueryEngine: {
        async executeQuery() {
          persistCount++;
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation({
        workflowStep: WORKFLOW_STEP.SYNCING,
        status: 'syncing',
      });

      await coordinator.completeOperation(operation);
      const countAfterFirst = persistCount;

      await coordinator.completeOperation(operation);
      t.equal(
        persistCount,
        countAfterFirst,
        'duplicate completeOperation must be skipped by idempotency',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('idempotency check prevents duplicate failOperation',
  async (t) => {
    let persistCount = 0;
    const coordinator = createMinimalCoordinator({
      sqlQueryEngine: {
        async executeQuery() {
          persistCount++;
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation({
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
      });

      await coordinator.failOperation(operation, 'test error');
      const countAfterFirst = persistCount;

      await coordinator.failOperation(operation, 'test error again');
      t.equal(
        persistCount,
        countAfterFirst,
        'duplicate failOperation must be skipped by idempotency',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('DurableWorkflowCoordinator idempotency tracking marks and ' +
  'detects committed transitions', async (t) => {
  const wfc = new DurableWorkflowCoordinator();

  t.equal(
    wfc.isTransitionIdempotent('op-1', WORKFLOW_STEP.SENDING),
    false,
    'uncommitted transition must not be idempotent',
  );

  wfc.markTransitionCommitted('op-1', WORKFLOW_STEP.SENDING);

  t.equal(
    wfc.isTransitionIdempotent('op-1', WORKFLOW_STEP.SENDING),
    true,
    'committed transition must be idempotent',
  );

  t.equal(
    wfc.isTransitionIdempotent('op-1', WORKFLOW_STEP.CREATING),
    false,
    'different step must not be idempotent',
  );

  t.equal(
    wfc.isTransitionIdempotent('op-2', WORKFLOW_STEP.SENDING),
    false,
    'different operation must not be idempotent',
  );
});

test('DurableWorkflowCoordinator transitionStep skips duplicate ' +
  'transition via idempotency', async (t) => {
  let persistCount = 0;
  const wfc = new DurableWorkflowCoordinator({
    persistWorkflow: async () => { persistCount++; },
  });

  await wfc.registerWorkflow({
    workflowId: 'wf-idem',
    ownerKey: 'wf-idem',
    step: WORKFLOW_STEP.PENDING,
  });

  await wfc.transitionStep('wf-idem', {
    nextStep: WORKFLOW_STEP.SENDING,
    reason: OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
  });
  const countAfterFirst = persistCount;

  const result = await wfc.transitionStep('wf-idem', {
    nextStep: WORKFLOW_STEP.SENDING,
    reason: OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
  });

  t.equal(
    persistCount,
    countAfterFirst,
    'duplicate transitionStep must not persist again',
  );
  t.equal(
    result.step,
    WORKFLOW_STEP.SENDING,
    'idempotent return must reflect current step',
  );
});

test('DurableWorkflowCoordinator removeWorkflow clears committed ' +
  'transitions', async (t) => {
  const wfc = new DurableWorkflowCoordinator();

  await wfc.registerWorkflow({
    workflowId: 'wf-clear',
    ownerKey: 'wf-clear',
    step: WORKFLOW_STEP.PENDING,
  });

  wfc.markTransitionCommitted('wf-clear', WORKFLOW_STEP.SENDING);
  t.equal(
    wfc.isTransitionIdempotent('wf-clear', WORKFLOW_STEP.SENDING),
    true,
    'committed transition must be tracked',
  );

  wfc.removeWorkflow('wf-clear');
  t.equal(
    wfc.isTransitionIdempotent('wf-clear', WORKFLOW_STEP.SENDING),
    false,
    'committed transitions must be cleared on workflow removal',
  );
});
