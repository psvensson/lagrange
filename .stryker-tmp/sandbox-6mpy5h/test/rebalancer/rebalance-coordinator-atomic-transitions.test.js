// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  OPERATION_TRANSITION_REASON,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
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

test('executeAtomicTransition does not rotate the transition session on ' +
  'partition contention without stale-session evidence', async (t) => {
  let rotateCalls = 0;
  let recoverCalls = 0;
  const coordinator = createMinimalCoordinator();
  const workflowOwner = coordinator.workflowOwner;
  coordinator.repository.persistOperationUpdate =
    async () => {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
      );
    };
  workflowOwner.recoverTransitionExecutionSession =
    async () => {
      recoverCalls += 1;
      return false;
    };
  workflowOwner.rotateTransitionExecutionAttemptAfterStaleSessionConflict =
    () => {
      rotateCalls += 1;
    };
  coordinator.initialize();

  try {
    await t.rejects(
      coordinator.updateStep(
        createTestOperation(),
        WORKFLOW_STEP.SENDING,
      ),
      /Transaction already active on this partition/i,
      'partition-level contention should still surface when no stale ' +
        'same-session state can be recovered',
    );

    t.ok(
      recoverCalls >= 1,
      'the owner should still probe for stale same-session state before giving up',
    );
    t.equal(
      rotateCalls,
      0,
      'generic partition contention must not rotate the canonical transition session',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('executeAtomicTransition retries the same step after a failed persist ' +
  'without idempotency poisoning', async (t) => {
  let persistUpdateCalls = 0;
  const operationId = 'op-atomic-retry-step';
  const coordinator = createMinimalCoordinator({
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
      operationId,
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });

    await t.rejects(
      coordinator.updateStep(
        firstAttempt,
        WORKFLOW_STEP.SENDING,
      ),
      'first persist failure should propagate',
    );

    t.equal(
      coordinator.operationWorkflowCoordinator
        .isTransitionIdempotent(
          operationId,
          WORKFLOW_STEP.SENDING,
        ),
      false,
      'failed persist must not mark the transition idempotent',
    );

    const secondAttempt = createTestOperation({
      operationId,
      workflowStep: WORKFLOW_STEP.PENDING,
      status: 'pending',
    });
    await coordinator.updateStep(
      secondAttempt,
      WORKFLOW_STEP.SENDING,
    );

    t.equal(
      persistUpdateCalls,
      2,
      'same step should be persisted again after the first failure',
    );
    t.equal(
      secondAttempt.workflowStep,
      WORKFLOW_STEP.SENDING,
      'retry should advance the workflow step',
    );
    t.equal(
      coordinator.operationWorkflowCoordinator
        .isTransitionIdempotent(
          operationId,
          WORKFLOW_STEP.SENDING,
        ),
      true,
      'transition should become idempotent only after the successful commit',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatchOperation defers retryable transition persistence failures ' +
  'through the shared owner retry lane', async (t) => {
  const deferredTimers = [];
  const deliveries = [];
  const operation = createTestOperation({
    operationId: 'op-transition-retry-dispatch',
    partitionId: 'control_plane_publications-p1',
  });
  let persistCalls = 0;
  const coordinator = createMinimalCoordinator({
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });
  coordinator.repository.queryOperationById = async () => operation;
  coordinator.repository.queryAuthoritativeOperationById =
    async () => operation;
  coordinator.repository.persistOperationUpdate =
    async (nextOperation) => {
      persistCalls += 1;
      if (persistCalls === 1) {
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        );
      }
      operation.workflowStep = nextOperation.workflowStep;
      operation.status = nextOperation.status;
      operation.updatedAt = nextOperation.updatedAt;
      operation.completedAt = nextOperation.completedAt;
      operation.errorMessage = nextOperation.errorMessage;
      operation.replicaId = nextOperation.replicaId;
      operation.stepsHistory = nextOperation.stepsHistory.map(
        (entry) => ({...entry}),
      );
    };
  coordinator.initialize();

  try {
    const result = await coordinator.dispatchOperation(
      operation.operationId,
    );

    t.equal(
      result?.success,
      false,
      'retryable transition contention should stop the current dispatch attempt',
    );
    t.equal(
      result?.skipped,
      true,
      'retryable transition contention should defer rather than fail closed',
    );
    t.equal(
      result?.reason,
      REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      'dispatch should return the canonical deferred-retry reason',
    );
    t.equal(
      deliveries.length,
      0,
      'the shared retry lane should defer before any duplicate dispatch leaves the node',
    );
    t.equal(
      deferredTimers.length,
      1,
      'dispatch should schedule one owner-lane retry',
    );

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      1,
      'the deferred retry should resume the dispatch on the same owner lane',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.CREATING,
      'the resumed owner path should advance the operation after persistence recovers',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('deferred transition retry resumes a stale critical pending operation ' +
  'instead of timing it out before the retry lane runs', async (t) => {
  const deferredTimers = [];
  const deliveries = [];
  const staleNow = Date.now();
  const operation = createTestOperation({
    operationId: 'op-stale-transition-retry-dispatch',
    partitionId: 'control_plane_publications-p1',
    createdAt: staleNow - 70000,
    updatedAt: staleNow - 65000,
  });
  let persistCalls = 0;
  const coordinator = createMinimalCoordinator({
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });
  coordinator.repository.queryOperationById = async () => operation;
  coordinator.repository.queryAuthoritativeOperationById =
    async () => operation;
  coordinator.repository.persistOperationUpdate =
    async (nextOperation) => {
      persistCalls += 1;
      if (persistCalls === 1) {
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        );
      }
      operation.workflowStep = nextOperation.workflowStep;
      operation.status = nextOperation.status;
      operation.updatedAt = nextOperation.updatedAt;
      operation.completedAt = nextOperation.completedAt;
      operation.errorMessage = nextOperation.errorMessage;
      operation.replicaId = nextOperation.replicaId;
      operation.stepsHistory = nextOperation.stepsHistory.map(
        (entry) => ({...entry}),
      );
    };
  coordinator.initialize();

  try {
    const firstAttempt = await coordinator.dispatchOperation(
      operation.operationId,
    );

    t.equal(firstAttempt?.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      'the initial retryable contention should defer through the shared retry lane');
    t.equal(deferredTimers.length, 1,
      'a deferred owner-lane retry should be armed');

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      1,
      'the deferred retry should still replay dispatch for the stale critical operation',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.CREATING,
      'the retried owner path should advance the stale operation instead of failing it closed',
    );
    t.not(
      String(operation.status || '').toUpperCase(),
      'FAILED',
      'critical deferred retries should not collapse into terminal timeout before retry execution',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('updateStep retries on the same operation object after a failed persist',
  async (t) => {
    let persistUpdateCalls = 0;
    const operationId = 'op-atomic-same-object-retry';
    const coordinator = createMinimalCoordinator({
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
      const operation = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.PENDING,
        status: 'pending',
        stepsHistory: [],
      });

      await t.rejects(
        coordinator.updateStep(operation, WORKFLOW_STEP.SENDING),
        'first persist failure should propagate for the same object',
      );

      t.equal(
        coordinator.operationWorkflowCoordinator
          .isTransitionIdempotent(
            operationId,
            WORKFLOW_STEP.SENDING,
          ),
        false,
        'failed persist on the same object must not mark the transition idempotent',
      );

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(
        persistUpdateCalls,
        2,
        'same operation object should persist the transition again after failure',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SENDING,
        'same operation object should still advance after the retry succeeds',
      );
      t.equal(
        operation.stepsHistory.length,
        1,
        'successful retry on the same object should append one durable step entry',
      );
      t.equal(
        operation.stepsHistory[0]?.step,
        WORKFLOW_STEP.SENDING,
        'same-object retry should durably record the requested step',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('completeOperation retries on the same operation object after a failed persist',
  async (t) => {
    let persistUpdateCalls = 0;
    const operationId = 'op-atomic-complete-same-object-retry';
    const coordinator = createMinimalCoordinator({
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
      const operation = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.SYNCING,
        status: 'syncing',
        stepsHistory: [],
      });

      await t.rejects(
        coordinator.completeOperation(operation),
        'first terminal persist failure should propagate for the same object',
      );

      t.equal(
        coordinator.operationWorkflowCoordinator
          .isTransitionIdempotent(
            operationId,
            WORKFLOW_STEP.ACTIVE,
          ),
        false,
        'failed completeOperation persist must not mark the terminal transition idempotent',
      );

      await coordinator.completeOperation(operation);

      t.equal(
        persistUpdateCalls,
        2,
        'same operation object should persist the terminal transition again after failure',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'same operation object should still complete after the retry succeeds',
      );
      t.equal(
        operation.stepsHistory.length,
        1,
        'successful terminal retry on the same object should append one durable step entry',
      );
      t.equal(
        operation.stepsHistory[0]?.step,
        WORKFLOW_STEP.ACTIVE,
        'same-object terminal retry should durably record the final step',
      );
      t.ok(
        operation.completedAt !== null,
        'successful terminal retry should set completedAt on the live object',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('failOperation retries on the same operation object after a failed persist',
  async (t) => {
    let persistUpdateCalls = 0;
    const operationId = 'op-atomic-fail-same-object-retry';
    const coordinator = createMinimalCoordinator({
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
      const operation = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
        stepsHistory: [],
      });

      await t.rejects(
        coordinator.failOperation(operation, 'test failure'),
        'first failure persist should propagate for the same object',
      );

      t.equal(
        coordinator.operationWorkflowCoordinator
          .isTransitionIdempotent(
            operationId,
            WORKFLOW_STEP.FAILED,
          ),
        false,
        'failed failOperation persist must not mark the failure transition idempotent',
      );

      await coordinator.failOperation(operation, 'test failure');

      t.equal(
        persistUpdateCalls,
        2,
        'same operation object should persist the failure transition again after failure',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.FAILED,
        'same operation object should still fail after the retry succeeds',
      );
      t.equal(
        operation.status,
        ReplicaStatus.FAILED,
        'successful retry should project failed status onto the live object',
      );
      t.equal(
        operation.errorMessage,
        'test failure',
        'successful retry should project the normalized failure message onto the live object',
      );
      t.equal(
        operation.stepsHistory.length,
        1,
        'successful failure retry on the same object should append one durable step entry',
      );
      t.equal(
        operation.stepsHistory[0]?.step,
        WORKFLOW_STEP.FAILED,
        'same-object failure retry should durably record the failed step',
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

test('persistNewOperation retries transient routable partition timeouts ' +
  'on the canonical owner mutation path', async (t) => {
  const partitionId = 'replica_operations-p1';
  const observedSessions = [];
  let executeCalls = 0;
  const coordinator = createMinimalCoordinator({
    sqlQueryEngine: {
      async executeQuery(_sql, _params, options = {}) {
        executeCalls += 1;
        observedSessions.push(options.sessionId || null);
        if (executeCalls === 1) {
          return {
            success: false,
            error:
              QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX +
              partitionId,
          };
        }
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.repository.waitForOperationPersistRetry = async () => {};
  coordinator.initialize();

  try {
    const operation = createTestOperation();
    const inserted = await coordinator.persistNewOperation(operation);

    t.equal(inserted, true, 'owner mutation should retry and persist successfully');
    t.equal(executeCalls, 2, 'routable partition timeout should trigger one retry');
    t.equal(
      observedSessions[0],
      observedSessions[1],
      'owner mutation retry should reuse the same canonical session',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('persistOperationUpdate retries transient partition transaction ' +
  'contention on the canonical owner mutation path', async (t) => {
  const expectedSessionId = buildExpectedTransitionSessionId(
    'op-atomic-test',
    WORKFLOW_STEP.SENDING,
  );
  let executeCalls = 0;
  const observedSessions = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => Date.now(),
  });
  const coordinator = createMinimalCoordinator({
    transactionCoordinator: txCoordinator,
    sqlQueryEngine: {
      async executeQuery(sql, _params, options = {}) {
        if (!sql.includes('UPDATE replica_operations')) {
          return {success: true, rows: [], changes: 1};
        }
        executeCalls += 1;
        observedSessions.push(options.sessionId || null);
        if (executeCalls === 1) {
          return {
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        }
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.repository.waitForOperationPersistRetry = async () => {};
  coordinator.initialize();

  try {
    const operation = createTestOperation();
    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.SENDING,
      'step transition should succeed after retrying transient partition transaction contention',
    );
    t.equal(
      executeCalls,
      2,
      'partition transaction contention should trigger one retry',
    );
    t.same(
      observedSessions,
      [expectedSessionId, expectedSessionId],
      'retry should reuse the same canonical transition session',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('persistOperationUpdate serializes external metadata writes with ' +
  'owner step transitions on replica_operations', async (t) => {
  let releaseFirstPersist;
  const firstPersistEntered = new Promise((resolve) => {
    releaseFirstPersist = resolve;
  });
  let firstPersistBlocking = true;
  let activePersistCount = 0;
  let overlapAttempts = 0;

  const coordinator = createMinimalCoordinator({
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (!sql.includes('UPDATE replica_operations')) {
          return {success: true, rows: [], changes: 1};
        }

        activePersistCount += 1;
        if (activePersistCount > 1) {
          overlapAttempts += 1;
        }
        try {
          if (firstPersistBlocking) {
            firstPersistBlocking = false;
            await firstPersistEntered;
          }
          return {success: true, rows: [], changes: 1};
        } finally {
          activePersistCount -= 1;
        }
      },
    },
  });
  coordinator.initialize();

  try {
    const bootstrapOperation = createTestOperation({
      operationId: 'op-bootstrap-metadata',
      replicaId: 'partition-1-r-bootstrap',
      targetNodeId: 'node-bootstrap',
    });
    const transitionOperation = createTestOperation({
      operationId: 'op-transition-metadata',
      replicaId: 'partition-1-r-transition',
      targetNodeId: 'node-transition',
    });

    const persistPromise =
      coordinator.persistOperationUpdate(bootstrapOperation);

    await new Promise((resolve) => setImmediate(resolve));

    const transitionPromise = coordinator.updateStep(
      transitionOperation,
      WORKFLOW_STEP.SENDING,
    );

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    releaseFirstPersist();

    await Promise.all([persistPromise, transitionPromise]);

    t.equal(
      overlapAttempts,
      0,
      'external metadata writes should share the replica_operations ' +
        'serialization lane with owner step transitions',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('priority control-plane transitions bypass unrelated ordinary ' +
  'replica_operations transition work', async (t) => {
  let releaseFirstPersist;
  const firstPersistEntered = new Promise((resolve) => {
    releaseFirstPersist = resolve;
  });
  let firstPersistBlocking = true;
  let activePersistCount = 0;
  let overlapAttempts = 0;

  const coordinator = createMinimalCoordinator({
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (!sql.includes('UPDATE replica_operations')) {
          return {success: true, rows: [], changes: 1};
        }

        activePersistCount += 1;
        if (activePersistCount > 1) {
          overlapAttempts += 1;
        }
        try {
          if (firstPersistBlocking) {
            firstPersistBlocking = false;
            await firstPersistEntered;
          }
          return {success: true, rows: [], changes: 1};
        } finally {
          activePersistCount -= 1;
        }
      },
    },
  });
  coordinator.initialize();

  try {
    const ordinaryOperation = createTestOperation({
      operationId: 'op-ordinary-metadata',
      partitionId: 'partition-ordinary',
      entityId: 'partition-ordinary',
      replicaId: 'partition-ordinary-r1',
      targetNodeId: 'node-ordinary',
    });
    const priorityPartitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
    const priorityOperation = createTestOperation({
      operationId: 'op-priority-recovery',
      partitionId: priorityPartitionId,
      entityId: priorityPartitionId,
      replicaId: `${priorityPartitionId}-r4`,
      targetNodeId: 'node-priority',
    });

    const ordinaryPersistPromise =
      coordinator.persistOperationUpdate(ordinaryOperation);

    await new Promise((resolve) => setImmediate(resolve));

    const priorityTransitionPromise = coordinator.updateStep(
      priorityOperation,
      WORKFLOW_STEP.SENDING,
    );

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      overlapAttempts,
      1,
      'priority control-plane transitions should not wait behind unrelated ordinary transition work',
    );

    releaseFirstPersist();

    await Promise.all([ordinaryPersistPromise, priorityTransitionPromise]);
  } finally {
    await coordinator.shutdown();
  }
});

test('executeAtomicTransition serializes cross-operation transitions ' +
  'on the replica_operations owner lane', async (t) => {
  let activeSessionId = null;
  const beginCalls = [];
  const persistSessions = [];
  let releaseFirstPersist;
  const firstPersistEntered = new Promise((resolve) => {
    releaseFirstPersist = resolve;
  });
  let blockFirstPersist = true;

  const coordinator = createMinimalCoordinator({
    transactionCoordinator: {
      async begin(sessionId) {
        beginCalls.push(sessionId);
        if (activeSessionId) {
          return {
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        }
        activeSessionId = sessionId;
        return {success: true};
      },
      async commit(sessionId) {
        if (activeSessionId === sessionId) {
          activeSessionId = null;
        }
        return {success: true};
      },
      async rollback(sessionId) {
        if (activeSessionId === sessionId) {
          activeSessionId = null;
        }
        return {success: true};
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, _params, options = {}) {
        if (sql.includes('UPDATE replica_operations')) {
          persistSessions.push(options.sessionId || null);
          if (blockFirstPersist) {
            blockFirstPersist = false;
            await firstPersistEntered;
          }
        }
        return {success: true, rows: [], changes: 1};
      },
    },
  });
  coordinator.initialize();

  try {
    const firstOperation = createTestOperation({
      operationId: 'op-atomic-first',
      replicaId: 'partition-1-r1',
    });
    const secondOperation = createTestOperation({
      operationId: 'op-atomic-second',
      replicaId: 'partition-1-r2',
      targetNodeId: 'node-remote-2',
    });

    const firstTransition = coordinator.updateStep(
      firstOperation,
      WORKFLOW_STEP.SENDING,
    );
    await new Promise((resolve) => setImmediate(resolve));

    const secondTransition = coordinator.updateStep(
      secondOperation,
      WORKFLOW_STEP.SENDING,
    );
    await new Promise((resolve) => setImmediate(resolve));

    releaseFirstPersist();
    await Promise.all([firstTransition, secondTransition]);

    t.same(
      beginCalls,
      [
        buildExpectedTransitionSessionId(
          'op-atomic-first',
          WORKFLOW_STEP.SENDING,
        ),
        buildExpectedTransitionSessionId(
          'op-atomic-second',
          WORKFLOW_STEP.SENDING,
        ),
      ],
      'cross-operation transitions should begin sequentially without partition contention',
    );
    t.same(
      persistSessions,
      [
        buildExpectedTransitionSessionId(
          'op-atomic-first',
          WORKFLOW_STEP.SENDING,
        ),
        buildExpectedTransitionSessionId(
          'op-atomic-second',
          WORKFLOW_STEP.SENDING,
        ),
      ],
      'replica_operations updates should persist one transition at a time on the owner lane',
    );
    t.equal(
      secondOperation.workflowStep,
      WORKFLOW_STEP.SENDING,
      'the second transition should succeed after the first one commits',
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

test('idempotent updateStep projects stale operation objects to the committed step',
  async (t) => {
    const operationId = 'op-idempotent-stale-projection';
    const coordinator = createMinimalCoordinator();
    coordinator.initialize();

    try {
      const committedOperation = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.CREATING,
        status: ReplicaStatus.CREATING,
      });
      await coordinator.updateStep(committedOperation, WORKFLOW_STEP.SYNCING);

      const staleOperation = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.CREATING,
        status: ReplicaStatus.CREATING,
        stepsHistory: [],
      });
      await coordinator.updateStep(staleOperation, WORKFLOW_STEP.SYNCING);

      t.equal(
        staleOperation.workflowStep,
        WORKFLOW_STEP.SYNCING,
        'idempotent transitions should still project stale in-memory steps',
      );
      t.equal(
        staleOperation.status,
        ReplicaStatus.SYNCING,
        'idempotent transitions should still project stale in-memory status',
      );
      t.equal(
        staleOperation.stepsHistory.length,
        0,
        'idempotent projections should not append duplicate durable history entries',
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
    persistWorkflow: async () => {
      persistCount++;
    },
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
