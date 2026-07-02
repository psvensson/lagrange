import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {registerRebalanceCoordinatorAtomicTransitionRetryTests} from './rebalance-coordinator-atomic-transition-retry-test-cases.js';
import {registerRebalanceCoordinatorAtomicTransitionTailTests} from './rebalance-coordinator-atomic-transitions-tail-test-cases.js';

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
    transactionCoordinator,
    enableTimeouts: false,
    ...overrides,
  });
  coordinator.repository.confirmReplicaOperationPersistence = async () => {};
  return coordinator;
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

function buildExpectedTransitionSessionId(
  operationId,
  workflowStep,
  attempt = 1,
) {
  return `${operationId}:${workflowStep}:attempt${attempt}`;
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

test('updateStep persists through the opened transaction session',
  async (t) => {
    const expectedSessionId = buildExpectedTransitionSessionId(
      'op-atomic-test',
      WORKFLOW_STEP.SENDING,
    );
    const observedSessions = [];
    const observedRoutingDimensions = [];
    const txCoordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async () => {},
      commitParticipant: async () => {},
      rollbackParticipant: async () => {},
      now: () => 1000,
    });

    const coordinator = createMinimalCoordinator({
      transactionCoordinator: txCoordinator,
      sqlQueryEngine: {
        async executeQuery(sql, _params, options = {}) {
          if (sql.includes('UPDATE replica_operations')) {
            observedSessions.push(options.sessionId || null);
            observedRoutingDimensions.push(
              options.routingReadinessDimension || null,
            );
            if (options.sessionId !== expectedSessionId) {
              return {
                success: false,
                error: 'Transaction already active for this session',
              };
            }
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation();
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.same(
        observedSessions,
        [expectedSessionId],
        'persisted update should use the transaction session for the step',
      );
      t.same(
        observedRoutingDimensions,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE],
        'owner mutation routing should stay on control-plane recovery ' +
          'readiness for internal topology work',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('updateStep confirms persisted state only after transaction commit',
  async (t) => {
    const callOrder = [];
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
      callOrder.push(`begin:${sessionId}`);
      return originalBegin(sessionId);
    };
    txCoordinator.commit = async (sessionId) => {
      callOrder.push(`commit:${sessionId}`);
      return originalCommit(sessionId);
    };

    const coordinator = createMinimalCoordinator({
      transactionCoordinator: txCoordinator,
    });
    coordinator.initialize();
    coordinator.repository.confirmReplicaOperationPersistence =
      async (operation) => {
        callOrder.push(`confirm:${operation.workflowStep}`);
      };

    try {
      const operation = createTestOperation();
      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.same(
        callOrder,
        [
          `begin:${buildExpectedTransitionSessionId(
            operation.operationId,
            WORKFLOW_STEP.SENDING,
          )}`,
          `commit:${buildExpectedTransitionSessionId(
            operation.operationId,
            WORKFLOW_STEP.SENDING,
          )}`,
          'confirm:SENDING',
        ],
        'authoritative confirmation should run only after the transition commits',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('updateStep normalizes row-shaped steps history before mutating a ' +
  'committed transition', async (t) => {
  const coordinator = createMinimalCoordinator();
  coordinator.initialize();
  let persistedStepsHistory = null;
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate = async (
    operationUpdate,
    options,
  ) => {
    persistedStepsHistory = operationUpdate.stepsHistory;
    return originalPersistOperationUpdate(operationUpdate, options);
  };

  try {
    const initialHistory = [{
      step: WORKFLOW_STEP.PENDING,
      timestamp: Date.now() - 1,
    }];
    const operation = createTestOperation({
      operationId: 'op-row-shaped-history-transition',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
    });
    delete operation.stepsHistory;
    operation.steps_history = JSON.stringify(initialHistory);

    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.ok(
      Array.isArray(persistedStepsHistory),
      'persisted transition should receive normalized stepsHistory',
    );
    t.equal(
      persistedStepsHistory.length,
      2,
      'persisted transition should retain row history before the new step',
    );
    t.same(
      persistedStepsHistory[0],
      initialHistory[0],
      'persisted transition should preserve row-shaped steps_history',
    );
    t.equal(
      persistedStepsHistory[1]?.step,
      WORKFLOW_STEP.SENDING,
      'persisted transition should append the committed step',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SENDING,
      'row-shaped operation should still advance after commit',
    );
    t.ok(
      Array.isArray(operation.stepsHistory),
      'committed mutation should leave canonical stepsHistory on the operation',
    );
    t.equal(
      operation.stepsHistory.length,
      2,
      'existing row history should be retained before the new step entry',
    );
    t.same(
      operation.stepsHistory[0],
      initialHistory[0],
      'row-shaped steps_history should be preserved',
    );
    t.equal(
      operation.stepsHistory[1]?.step,
      WORKFLOW_STEP.SENDING,
      'new committed step should be appended',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('updateStep keeps the committed transition when post-commit ' +
  'confirmation is temporarily unavailable', async (t) => {
  const callOrder = [];
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
    callOrder.push(`begin:${sessionId}`);
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    callOrder.push(`commit:${sessionId}`);
    return originalCommit(sessionId);
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();
  coordinator.repository.confirmReplicaOperationPersistence =
    async (operation) => {
      callOrder.push(`confirm:${operation.workflowStep}`);
      throw new Error('Authoritative replica operation not confirmed');
    };

  try {
    const operation = createTestOperation();
    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SENDING,
      'post-commit confirmation gaps should not unwind the committed step',
    );
    t.same(
      callOrder,
      [
        `begin:${buildExpectedTransitionSessionId(
          operation.operationId,
          WORKFLOW_STEP.SENDING,
        )}`,
        `commit:${buildExpectedTransitionSessionId(
          operation.operationId,
          WORKFLOW_STEP.SENDING,
        )}`,
        'confirm:SENDING',
      ],
      'authoritative confirmation should still run after commit without failing the transition',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('updateStep retries with a fresh transition session after stale-session ' +
  'begin contention', async (t) => {
  const blockedSessions = new Set();
  const observedBeginSessions = [];
  const txCoordinator = {
    async begin(sessionId) {
      observedBeginSessions.push(sessionId);
      if (observedBeginSessions.length === 1) {
        blockedSessions.add(sessionId);
        return {
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        };
      }
      if (blockedSessions.has(sessionId)) {
        return {
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        };
      }
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation();

    await t.rejects(
      coordinator.updateStep(operation, WORKFLOW_STEP.SENDING),
      /transaction already active/i,
      'first attempt should fail when the transition session is already active',
    );

    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SENDING,
      'second attempt should succeed after rotating the transition session id',
    );
    t.equal(
      observedBeginSessions.length,
      2,
      'owner should attempt begin twice across retries',
    );
    t.not(
      observedBeginSessions[0],
      observedBeginSessions[1],
      'retries must rotate transition session ids to avoid stale-session deadlocks',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('updateStep retries on the same transition session after generic ' +
  'persist contention', async (t) => {
  const observedBeginSessions = [];
  const observedPersistSessions = [];
  const activeSessions = new Set();
  let persistUpdateCalls = 0;
  const txCoordinator = {
    getTransaction(sessionId) {
      return activeSessions.has(sessionId) ? {
        sessionId,
        status: TRANSACTION_STATUS.ACTIVE,
      } : null;
    },
    async begin(sessionId) {
      observedBeginSessions.push(sessionId);
      activeSessions.add(sessionId);
      return {success: true};
    },
    async commit(sessionId) {
      activeSessions.delete(sessionId);
      return {success: true};
    },
    async rollback(sessionId) {
      activeSessions.delete(sessionId);
      return {success: true};
    },
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate = async (operation, options) => {
    observedPersistSessions.push(options?.sessionId || null);
    persistUpdateCalls += 1;
    if (persistUpdateCalls === 1) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
    return originalPersistOperationUpdate(operation, options);
  };

  try {
    const operation = createTestOperation();

    await t.rejects(
      coordinator.updateStep(operation, WORKFLOW_STEP.SENDING),
      /transaction already active/i,
      'first attempt should fail when the transition session collides during persist',
    );

    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SENDING,
      'second attempt should succeed after reusing the canonical transition session',
    );
    t.equal(
      observedBeginSessions.length,
      2,
      'owner should attempt begin twice across retries',
    );
    t.equal(
      observedBeginSessions[0],
      observedBeginSessions[1],
      'generic persist contention should preserve the canonical transition session id',
    );
    t.equal(
      observedPersistSessions[0],
      observedPersistSessions[1],
      'persist retries should stay on the same canonical transition session',
    );
    t.equal(
      activeSessions.size,
      0,
      'successful retry should clear the previous transition session state',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('getInFlightOperations keeps replica_operations owner-local reads on ' +
  'control-plane recovery routing', async (t) => {
  const observedRoutingDimensions = [];
  const coordinator = createMinimalCoordinator({
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        _tableName,
        _sql,
        _params,
        options = {},
      ) {
        observedRoutingDimensions.push(
          options?.queryOptions?.routingReadinessDimension || null,
        );
        return {success: true, rows: []};
      },
    },
  });
  coordinator.initialize();

  try {
    const operations = await coordinator.getInFlightOperations();

    t.same(
      operations,
      [],
      'fixture owner-local read should return no in-flight operations',
    );
    t.same(
      observedRoutingDimensions,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE],
      'replica_operations owner reads must stay on control-plane recovery routing',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('shutdown counts in-flight operations from the cache observation ' +
  'boundary without opening authoritative owner reads', async (t) => {
  const coordinator = createMinimalCoordinator();
  const cachedIncompleteOperations = [
    createTestOperation({operationId: 'op-shutdown-cache-1'}),
    createTestOperation({operationId: 'op-shutdown-cache-2'}),
  ];
  let cachedQueryCount = 0;
  let authoritativeQueryCount = 0;

  coordinator.queryCachedIncompleteOperations = async () => {
    cachedQueryCount += 1;
    return cachedIncompleteOperations;
  };
  coordinator.queryIncompleteOperations = async () => {
    authoritativeQueryCount += 1;
    throw new Error(
      'shutdown must not open authoritative in-flight operation reads',
    );
  };
  coordinator.initialize();

  await coordinator.shutdown();

  t.equal(
    cachedQueryCount,
    1,
    'shutdown should count in-flight operations from the cache boundary once',
  );
  t.equal(
    authoritativeQueryCount,
    0,
    'shutdown should not open authoritative owner reads',
  );
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

test('completeOperation clamps persist retries to the enclosing ' +
  'transaction budget', async (t) => {
  const expectedSessionId = buildExpectedTransitionSessionId(
    'op-atomic-test',
    WORKFLOW_STEP.ACTIVE,
  );
  const expectedDeadlineMs = Date.now() + 60000;
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => 1000,
  });
  const originalGetTransaction =
    txCoordinator.getTransaction.bind(txCoordinator);
  txCoordinator.getTransaction = (sessionId) => ({
    ...originalGetTransaction(sessionId),
    timeoutDeadline: expectedDeadlineMs,
  });

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();
  const observedPersistOptions = [];
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate = async (operation, options) => {
    observedPersistOptions.push(options || null);
    return originalPersistOperationUpdate(operation, options);
  };

  try {
    const operation = createTestOperation({
      workflowStep: WORKFLOW_STEP.SYNCING,
      status: 'syncing',
    });
    await coordinator.completeOperation(operation);

    t.same(
      observedPersistOptions.map((options) => options?.sessionId || null),
      [expectedSessionId],
      'terminal completion should persist on the transition session',
    );
    t.equal(
      observedPersistOptions.length,
      1,
      'terminal completion should emit one persisted transition update',
    );
    t.equal(
      observedPersistOptions[0]?.timeoutBudget?.deadlineMs,
      expectedDeadlineMs,
      'terminal completion retries should inherit the enclosing transaction deadline',
    );
    t.equal(
      observedPersistOptions[0]?.timeoutBudget?.operationName,
      'transaction',
      'terminal completion should classify the retry budget as transaction-owned',
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

test('failOperation clamps persist retries to the enclosing transaction ' +
  'budget', async (t) => {
  const expectedSessionId = buildExpectedTransitionSessionId(
    'op-atomic-test',
    WORKFLOW_STEP.FAILED,
  );
  const expectedDeadlineMs = Date.now() + 60000;
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => 1000,
  });
  const originalGetTransaction =
    txCoordinator.getTransaction.bind(txCoordinator);
  txCoordinator.getTransaction = (sessionId) => ({
    ...originalGetTransaction(sessionId),
    timeoutDeadline: expectedDeadlineMs,
  });

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();
  const observedPersistOptions = [];
  const originalPersistOperationUpdate =
    coordinator.repository.persistOperationUpdate
      .bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate = async (operation, options) => {
    observedPersistOptions.push(options || null);
    return originalPersistOperationUpdate(operation, options);
  };

  try {
    const operation = createTestOperation({
      workflowStep: WORKFLOW_STEP.CREATING,
      status: 'creating',
    });
    await coordinator.failOperation(operation, 'test failure');

    t.same(
      observedPersistOptions.map((options) => options?.sessionId || null),
      [expectedSessionId],
      'terminal failure should persist on the transition session',
    );
    t.equal(
      observedPersistOptions.length,
      1,
      'terminal failure should emit one persisted transition update',
    );
    t.equal(
      observedPersistOptions[0]?.timeoutBudget?.deadlineMs,
      expectedDeadlineMs,
      'terminal failure retries should inherit the enclosing transaction deadline',
    );
    t.equal(
      observedPersistOptions[0]?.timeoutBudget?.operationName,
      'transaction',
      'terminal failure should classify the retry budget as transaction-owned',
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

test('executeAtomicTransition reuses the same transition session while ' +
  'retrying rollback cleanup', async (t) => {
  const expectedSessionId = buildExpectedTransitionSessionId(
    'op-atomic-rollback-retry',
    WORKFLOW_STEP.SENDING,
  );
  const observedBeginSessions = [];
  const observedRollbackSessions = [];
  const transactionBySession = new Map();
  let persistUpdateCalls = 0;
  let rollbackCalls = 0;
  const txCoordinator = {
    getTransaction(sessionId) {
      return transactionBySession.get(sessionId) || null;
    },
    async begin(sessionId) {
      observedBeginSessions.push(sessionId);
      if (transactionBySession.has(sessionId)) {
        return {
          success: false,
          error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
        };
      }
      transactionBySession.set(sessionId, {
        sessionId,
        status: TRANSACTION_STATUS.ACTIVE,
      });
      return {success: true};
    },
    async commit(sessionId) {
      transactionBySession.delete(sessionId);
      return {success: true};
    },
    async rollback(sessionId) {
      observedRollbackSessions.push(sessionId);
      rollbackCalls += 1;
      if (rollbackCalls === 1) {
        transactionBySession.set(sessionId, {
          sessionId,
          status: TRANSACTION_STATUS.ROLLING_BACK,
        });
        return {success: false, error: 'rollback failed'};
      }
      transactionBySession.delete(sessionId);
      return {success: true};
    },
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (!sql.includes('UPDATE replica_operations')) {
          return {success: true, rows: [], changes: 1};
        }
        persistUpdateCalls += 1;
        if (persistUpdateCalls === 1) {
          return {success: false, error: 'persist failed'};
        }
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.initialize();

  try {
    const firstAttempt = createTestOperation({
      operationId: 'op-atomic-rollback-retry',
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });
    await t.rejects(
      coordinator.updateStep(firstAttempt, WORKFLOW_STEP.SENDING),
      /rollback failed/i,
      'failed rollback cleanup should surface so the next retry can resume it',
    );

    const secondAttempt = createTestOperation({
      operationId: 'op-atomic-rollback-retry',
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });
    await coordinator.updateStep(secondAttempt, WORKFLOW_STEP.SENDING);

    t.same(
      observedBeginSessions,
      [expectedSessionId, expectedSessionId],
      'retry should reuse the same transition session after rollback cleanup',
    );
    t.same(
      observedRollbackSessions,
      [expectedSessionId, expectedSessionId],
      'retry should first finish rollback on the prior session before beginning again',
    );
    t.equal(
      transactionBySession.size,
      0,
      'successful retry should fully clear the transition transaction state',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('executeAtomicTransition preserves the original commit failure when ' +
  'the coordinator already cleared the session', async (t) => {
  const expectedSessionId = buildExpectedTransitionSessionId(
    'op-atomic-commit-rollback-complete',
    WORKFLOW_STEP.SENDING,
  );
  const observedRollbackSessions = [];
  const transactionBySession = new Map();
  const txCoordinator = {
    getTransaction(sessionId) {
      return transactionBySession.get(sessionId) || null;
    },
    async begin(sessionId) {
      transactionBySession.set(sessionId, {
        sessionId,
        status: TRANSACTION_STATUS.ACTIVE,
      });
      return {success: true};
    },
    async commit(sessionId) {
      transactionBySession.delete(sessionId);
      return {
        success: false,
        error: 'participant prepare failed',
      };
    },
    async rollback(sessionId) {
      observedRollbackSessions.push(sessionId);
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
      };
    },
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
  });
  coordinator.initialize();

  try {
    const operation = createTestOperation({
      operationId: 'op-atomic-commit-rollback-complete',
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });
    await t.rejects(
      coordinator.updateStep(operation, WORKFLOW_STEP.SENDING),
      /participant prepare failed/i,
      'commit failure should surface unchanged once the coordinator already ' +
        'finished rollback cleanup',
    );
    t.same(
      observedRollbackSessions,
      [],
      'owner should not issue a second rollback after commit already cleared ' +
        'the session',
    );
    t.equal(
      txCoordinator.getTransaction(expectedSessionId),
      null,
      'transition session should remain fully cleared after the failed commit',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('executeAtomicTransition authoritatively recovers a missing transition ' +
  'session before reusing it', async (t) => {
  const operationId = 'op-atomic-authoritative-recovery';
  const expectedSessionId = buildExpectedTransitionSessionId(
    operationId,
    WORKFLOW_STEP.SENDING,
  );
  const authoritativeSessions = new Set([expectedSessionId]);
  const observedReadTables = [];
  const observedBeginSessions = [];
  const observedRollbackSessions = [];
  const observedPersistSessions = [];
  const transactionBySession = new Map();
  const gateway = {
    async readAuthoritativeRows(tableName, _sql, params) {
      observedReadTables.push(tableName);
      if (tableName === 'sql_transactions') {
        return {
          success: true,
          rows: authoritativeSessions.has(params[0]) ? [{
            transaction_id: `tx:${params[0]}`,
            session_id: params[0],
            status: TRANSACTION_STATUS.ACTIVE,
          }] : [],
        };
      }
      if (tableName === 'sql_transaction_participants') {
        return {
          success: true,
          rows: params.includes(`tx:${expectedSessionId}`) ? [{
            transaction_id: `tx:${expectedSessionId}`,
            partition_id: 'replica_operations-p1',
            status: TRANSACTION_STATUS.ACTIVE,
          }] : [],
        };
      }
      return {success: true, rows: []};
    },
  };
  const txCoordinator = {
    getTransaction(sessionId) {
      return transactionBySession.get(sessionId) || null;
    },
    recoverFromSystemTables(payload = {}) {
      for (const row of payload.transactions || []) {
        const sessionId = row.session_id || row.sessionId;
        transactionBySession.set(sessionId, {
          sessionId,
          status: row.status || TRANSACTION_STATUS.FAILED,
          recoveredAuthoritatively: true,
        });
      }
    },
    async begin(sessionId) {
      observedBeginSessions.push(sessionId);
      if (transactionBySession.has(sessionId)) {
        return {
          success: false,
          error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
        };
      }
      transactionBySession.set(sessionId, {
        sessionId,
        status: TRANSACTION_STATUS.ACTIVE,
      });
      return {success: true};
    },
    async commit(sessionId) {
      transactionBySession.delete(sessionId);
      return {success: true};
    },
    async rollback(sessionId) {
      observedRollbackSessions.push(sessionId);
      const transaction = transactionBySession.get(sessionId) || null;
      transactionBySession.delete(sessionId);
      if (transaction?.recoveredAuthoritatively === true) {
        authoritativeSessions.delete(sessionId);
      }
      return {success: true};
    },
  };

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
    controlPlaneSystemTableGateway: gateway,
  });
  coordinator.repository.persistOperationUpdate = async (_operation, options = {}) => {
    observedPersistSessions.push(options.sessionId || null);
    if (authoritativeSessions.has(options.sessionId)) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
      );
    }
  };
  coordinator.initialize();

  try {
    const firstAttempt = createTestOperation({
      operationId,
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });
    await t.rejects(
      coordinator.updateStep(firstAttempt, WORKFLOW_STEP.SENDING),
      /Transaction already active on this partition/i,
      'initial attempt should surface the contention after clearing it',
    );

    const secondAttempt = createTestOperation({
      operationId,
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });
    await coordinator.updateStep(secondAttempt, WORKFLOW_STEP.SENDING);

    t.same(
      observedRollbackSessions,
      [expectedSessionId, expectedSessionId],
      'failed attempt should roll back both the local transaction and the ' +
        'authoritatively recovered stale session',
    );
    t.same(
      observedBeginSessions,
      [expectedSessionId, expectedSessionId],
      'transition should reuse the same canonical session after recovery',
    );
    t.same(
      observedPersistSessions,
      [expectedSessionId, expectedSessionId],
      'both attempts should use the same canonical session id',
    );
    t.equal(
      authoritativeSessions.size,
      0,
      'successful recovery should clear the authoritative stale session',
    );
    t.ok(
      observedReadTables.includes('sql_transactions'),
      'authoritative recovery should inspect sql_transactions',
    );
    t.ok(
      observedReadTables.includes('sql_transaction_participants'),
      'authoritative recovery should hydrate participant state for rollback',
    );
  } finally {
    await coordinator.shutdown();
  }
});

registerRebalanceCoordinatorAtomicTransitionRetryTests({
  test,
  createMinimalCoordinator,
  createTestOperation,
});

registerRebalanceCoordinatorAtomicTransitionTailTests({
  test,
});
