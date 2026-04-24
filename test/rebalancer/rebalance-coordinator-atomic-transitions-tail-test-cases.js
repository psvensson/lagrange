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
const PRIORITY_PERSISTENCE_TABLE_NAMES = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);
const PRIORITY_PERSISTENCE_OPERATION_ID_PARAM_INDEX = 7;
const PRIORITY_PERSISTENCE_EXPECTED_WRITE_COUNT = 1;

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

export function registerRebalanceCoordinatorAtomicTransitionTailTests({
  test,
}) {
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

  test('executeAtomicTransition bypasses the distributed transaction envelope ' +
    'for transaction-control recovery partitions', async (t) => {
    const observedHasSessionId = [];
    const coordinator = createMinimalCoordinator({
      transactionCoordinator: null,
      sqlQueryEngine: {
        async executeQuery(sql, _params, options = {}) {
          if (sql.includes('UPDATE replica_operations')) {
            observedHasSessionId.push(
              Object.prototype.hasOwnProperty.call(options, 'sessionId'),
            );
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const operation = createTestOperation({
        partitionId:
          INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
        entityId:
          INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
      });

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SENDING,
        'transaction-control transition should still advance without a transaction coordinator',
      );
      t.same(
        observedHasSessionId,
        [false],
        'direct transaction-control transitions must not mint routed system-write sessions',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('executeAtomicTransition bypasses the distributed transaction envelope ' +
    'for publication recovery partitions', async (t) => {
    const observedHasSessionId = [];
    const coordinator = createMinimalCoordinator({
      transactionCoordinator: null,
      sqlQueryEngine: {
        async executeQuery(sql, _params, options = {}) {
          if (sql.includes('UPDATE replica_operations')) {
            observedHasSessionId.push(
              Object.prototype.hasOwnProperty.call(options, 'sessionId'),
            );
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const publicationPartitionId =
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
      const operation = createTestOperation({
        partitionId: publicationPartitionId,
        entityId: publicationPartitionId,
      });

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SENDING,
        'publication transition should advance without a transaction coordinator',
      );
      t.same(
        observedHasSessionId,
        [false],
        'publication transitions must not mint routed system-write sessions',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('executeAtomicTransition bypasses the distributed transaction envelope ' +
    'for snake-case priority operation rows', async (t) => {
    const observedHasSessionId = [];
    const coordinator = createMinimalCoordinator({
      transactionCoordinator: null,
      sqlQueryEngine: {
        async executeQuery(sql, _params, options = {}) {
          if (sql.includes('UPDATE replica_operations')) {
            observedHasSessionId.push(
              Object.prototype.hasOwnProperty.call(options, 'sessionId'),
            );
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const publicationPartitionId =
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
      const {partitionId: _partitionId, ...operation} = createTestOperation({
        entityId: publicationPartitionId,
        partition_id: publicationPartitionId,
      });

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SENDING,
        'snake-case priority rows should advance without a transaction coordinator',
      );
      t.same(
        observedHasSessionId,
        [false],
        'snake-case priority rows must not mint routed system-write sessions',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('executeAtomicTransition bypasses the distributed transaction envelope ' +
    'for every snake-case priority control-plane partition row', async (t) => {
    const observedWritesByOperationId = new Map();
    const coordinator = createMinimalCoordinator({
      transactionCoordinator: null,
      sqlQueryEngine: {
        async executeQuery(sql, _params, options = {}) {
          if (sql.includes('UPDATE replica_operations')) {
            const operationId = String(
              _params?.[PRIORITY_PERSISTENCE_OPERATION_ID_PARAM_INDEX] || '',
            );
            observedWritesByOperationId.set(
              operationId,
              [
                ...(observedWritesByOperationId.get(operationId) || []),
                Object.prototype.hasOwnProperty.call(options, 'sessionId'),
              ],
            );
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      for (const tableName of PRIORITY_PERSISTENCE_TABLE_NAMES) {
        const priorityPartitionId = INITIAL_PARTITION_IDS[tableName];
        const operationId = `op-priority-${tableName}`;
        const {
          partitionId: _partitionId,
          entityId: _entityId,
          ...operation
        } = createTestOperation({
          operationId,
          entity_id: priorityPartitionId,
          partition_id: priorityPartitionId,
          replicaId: `${priorityPartitionId}-r-contract`,
          targetNodeId: `node-priority-${tableName}`,
        });

        await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.SENDING,
          `${tableName} priority rows should advance without transaction coordinator`,
        );
      }

      for (const tableName of PRIORITY_PERSISTENCE_TABLE_NAMES) {
        const operationId = `op-priority-${tableName}`;
        const operationWrites = observedWritesByOperationId.get(operationId);
        t.equal(
          operationWrites?.length,
          PRIORITY_PERSISTENCE_EXPECTED_WRITE_COUNT,
          `${tableName} priority rows should persist exactly once`,
        );
        t.same(
          operationWrites,
          [false],
          `${tableName} priority rows must not mint routed system-write sessions`,
        );
      }
      t.equal(
        observedWritesByOperationId.size,
        PRIORITY_PERSISTENCE_TABLE_NAMES.length,
        'each priority control-plane partition should take the direct recovery persistence lane',
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
        'priority control-plane transitions should not wait behind unrelated ' +
          'ordinary transition work',
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
}
