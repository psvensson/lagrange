/**
 * Focused unit tests for ReplicaOperationRepository.
 *
 * Validates: Requirements 6.1, 6.4
 * Design: D7.1, D7.3, D11.2
 *
 * Proves that SQL/cache access and row <-> operation translation
 * are owned by the repository and that the coordinator facade
 * delegates to it.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  OperationType,
  TERMINAL_STATUSES,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_NODE_ID = 'test-node-1';
const TEST_OPERATION_ID = 'op-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_REPLICA_ID = 'partition-1-r1';
const TEST_TARGET_NODE_ID = 'node-2';
const TEST_ENTITY_TYPE = SERVICE_TYPE.PARTITION;

/**
 * Create a minimal repository for testing.
 * @param {object} [overrides]
 * @return {ReplicaOperationRepository}
 */
function createTestRepository(overrides = {}) {
  const mockLogger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
  const mockGateway = overrides.controlPlaneSystemTableGateway || {
    readRows: async () => ({success: true, rows: []}),
    executeQuery: async () => ({success: true}),
  };
  const mockCache = overrides.systemTableCache || {
    get: () => null,
    getAll: () => [],
    filter: (_table, predicate) => [].filter(predicate),
  };
  const mockCdc = overrides.cdcIntegrationService || {
    waitForCacheUpdate: async () => {},
  };

  return new ReplicaOperationRepository({
    nodeId: overrides.nodeId || TEST_NODE_ID,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdc,
    controlPlaneSystemTableGateway: mockGateway,
    logger: mockLogger,
    emitter: overrides.emitter || null,
  });
}

function makeRow(overrides = {}) {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: 'in_progress',
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: Date.now(),
    updated_at: Date.now(),
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: TEST_ENTITY_TYPE,
    entity_id: TEST_PARTITION_ID,
    ...overrides,
  };
}

// ── rowToOperation translation ──────────────────────────────────

test('rowToOperation translates SQL row to operation object',
  async (t) => {
    const repo = createTestRepository();
    const row = makeRow();
    const op = repo.rowToOperation(row);

    t.equal(op.operationId, TEST_OPERATION_ID);
    t.equal(op.type, OperationType.ADD);
    t.equal(op.partitionId, TEST_PARTITION_ID);
    t.equal(op.replicaId, TEST_REPLICA_ID);
    t.equal(op.sourceNodeId, TEST_NODE_ID);
    t.equal(op.targetNodeId, TEST_TARGET_NODE_ID);
    t.equal(op.entityType, TEST_ENTITY_TYPE);
    t.equal(op.entityId, TEST_PARTITION_ID);
    t.same(op.stepsHistory, []);
  });

test('rowToOperation parses steps_history JSON', async (t) => {
  const repo = createTestRepository();
  const history = [{step: WORKFLOW_STEP.PENDING}];
  const row = makeRow({
    steps_history: JSON.stringify(history),
  });
  const op = repo.rowToOperation(row);

  t.same(op.stepsHistory, history);
});

test('rowToOperation rehydrates replica topology metadata', async (t) => {
  const repo = createTestRepository();
  const history = [{
    step: WORKFLOW_STEP.PENDING,
    replicaIds: ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
    peerAddresses: [
      'node-1/message-group/mg-1-r1',
      'node-2/message-group/mg-1-r2',
      'node-3/message-group/mg-1-r3',
    ],
  }];
  const row = makeRow({
    entity_type: SERVICE_TYPE.MESSAGE_GROUP,
    entity_id: 'mg-1',
    steps_history: JSON.stringify(history),
  });
  const op = repo.rowToOperation(row);

  t.same(op.replicaIds, history[0].replicaIds);
  t.same(op.peerAddresses, history[0].peerAddresses);
});

test('rowToOperation defaults entity_type to partition',
  async (t) => {
    const repo = createTestRepository();
    const row = makeRow({entity_type: null, entity_id: null});
    const op = repo.rowToOperation(row);

    t.equal(op.entityType, SERVICE_TYPE.PARTITION);
    t.equal(op.entityId, TEST_PARTITION_ID);
  });

test('rowToOperation recovers from malformed steps_history',
  async (t) => {
    const errors = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: []}),
        executeQuery: async () => ({success: true}),
      },
    });
    repo.logger = {
      info() {},
      warn() {},
      debug() {},
      error(...args) {
        errors.push(args);
      },
    };
    const row = makeRow({steps_history: 'not-json'});
    const op = repo.rowToOperation(row);

    t.same(op.stepsHistory, []);
    t.ok(errors.length > 0,
      'should log error for malformed JSON');
  });

test('queryIncompleteOperations logs retryable read failures as warnings',
  async (t) => {
    const warnings = [];
    const errors = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
          retryAfterMs: 250,
        }),
        executeQuery: async () => ({success: true}),
      },
    });
    repo.logger = {
      info() {},
      debug() {},
      warn(...args) {
        warnings.push(args);
      },
      error(...args) {
        errors.push(args);
      },
    };

    const operations = await repo.queryIncompleteOperations();

    t.same(operations, [],
      'retryable read failures should fail closed to empty results');
    t.equal(warnings.length, 1,
      'retryable read failures should log one warning');
    t.equal(errors.length, 0,
      'retryable read failures should not log hard errors');
    t.equal(warnings[0][1]?.code, 'CONTROL_PLANE_PRESSURE_DEGRADED',
      'warning should preserve the typed pressure code');
    t.equal(warnings[0][1]?.retryAfterMs, 250,
      'warning should preserve the retry-after hint');
  });

test('queryIncompleteOperations backs off SQL retries after retryable read failures',
  async (t) => {
    let readCalls = 0;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 500,
          };
        },
        executeQuery: async () => ({success: true}),
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });

    const first = await repo.queryIncompleteOperations();
    const second = await repo.queryIncompleteOperations();

    t.same(first, [],
      'first retryable failure should fail closed to empty results');
    t.same(second, [],
      'subsequent reads during cooldown should reuse the empty observation');
    t.equal(readCalls, 1,
      'retryable failures should arm a cooldown instead of hammering replica_operations SQL');
  });

// ── isOperationTerminal ─────────────────────────────────────────

test('isOperationTerminal returns true for terminal workflow step',
  async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.ADD,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    };
    t.ok(repo.isOperationTerminal(op));
  });

test('isOperationTerminal returns false for active workflow step',
  async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.ADD,
      workflowStep: WORKFLOW_STEP.CREATING,
    };
    t.notOk(repo.isOperationTerminal(op));
  });

test('isOperationTerminal falls back to status for raw rows',
  async (t) => {
    const repo = createTestRepository();
    for (const status of TERMINAL_STATUSES) {
      t.ok(
        repo.isOperationTerminal({status}),
        `${status} should be terminal`,
      );
    }
  });

test('isOperationTerminal returns false for null', async (t) => {
  const repo = createTestRepository();
  t.notOk(repo.isOperationTerminal(null));
});

// ── resolveOperationOwnerNodeId ─────────────────────────────────

test('resolveOperationOwnerNodeId prefers sourceNodeId',
  async (t) => {
    const repo = createTestRepository();
    const op = {
      sourceNodeId: 'src-node',
      targetNodeId: 'tgt-node',
    };
    t.equal(repo.resolveOperationOwnerNodeId(op), 'src-node');
  });

test('resolveOperationOwnerNodeId falls back to targetNodeId',
  async (t) => {
    const repo = createTestRepository();
    const op = {targetNodeId: 'tgt-node'};
    t.equal(repo.resolveOperationOwnerNodeId(op), 'tgt-node');
  });

test('resolveOperationOwnerNodeId accepts raw row fields',
  async (t) => {
    const repo = createTestRepository();
    const row = {source_node_id: 'raw-src'};
    t.equal(repo.resolveOperationOwnerNodeId(row), 'raw-src');
  });

// ── isOperationLocallyOwned ─────────────────────────────────────

test('isOperationLocallyOwned returns true for local node',
  async (t) => {
    const repo = createTestRepository();
    const op = {sourceNodeId: TEST_NODE_ID};
    t.ok(repo.isOperationLocallyOwned(op));
  });

test('isOperationLocallyOwned returns false for remote node',
  async (t) => {
    const repo = createTestRepository();
    const op = {sourceNodeId: 'other-node'};
    t.notOk(repo.isOperationLocallyOwned(op));
  });

// ── REPLACE operation helpers ────────────────────────────────────

test('getReplaceSourceReplicaId extracts from stepsHistory',
  async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.REPLACE,
      stepsHistory: [{sourceReplicaId: 'src-r1'}],
    };
    t.equal(
      repo.getReplaceSourceReplicaId(op),
      'src-r1',
    );
  });

test('getReplaceSourceReplicaId returns null for ADD',
  async (t) => {
    const repo = createTestRepository();
    const op = {type: OperationType.ADD};
    t.equal(repo.getReplaceSourceReplicaId(op), null);
  });

test('isReplaceRemovePhase detects REPLACE ACTIVE',
  async (t) => {
    const repo = createTestRepository();
    t.ok(repo.isReplaceRemovePhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    }));
    t.notOk(repo.isReplaceRemovePhase({
      type: OperationType.ADD,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    }));
  });

test('getReplaceTargetReplicaId returns replicaId when different from source',
  async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.REPLACE,
      replicaId: 'tgt-r2',
      sourceReplicaId: 'src-r1',
      stepsHistory: [{sourceReplicaId: 'src-r1'}],
    };
    t.equal(repo.getReplaceTargetReplicaId(op), 'tgt-r2');
  });

test('getReplaceTargetReplicaId returns null when same as source',
  async (t) => {
    const repo = createTestRepository();
    const op = {
      type: OperationType.REPLACE,
      replicaId: 'src-r1',
      sourceReplicaId: 'src-r1',
      stepsHistory: [{sourceReplicaId: 'src-r1'}],
    };
    t.equal(repo.getReplaceTargetReplicaId(op), null);
  });

// ── Cache read methods ──────────────────────────────────────────

test('getReplicaOperationRowFromCache returns cached row',
  async (t) => {
    const expectedRow = makeRow();
    const repo = createTestRepository({
      systemTableCache: {
        get(table, key) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === TEST_OPERATION_ID) {
            return expectedRow;
          }
          return null;
        },
        getAll: () => [],
        filter: () => [],
      },
    });

    const result = repo.getReplicaOperationRowFromCache(
      TEST_OPERATION_ID,
    );
    t.same(result, expectedRow);
  });

test('getReplicaOperationRowFromCache returns null for missing',
  async (t) => {
    const repo = createTestRepository();
    const result = repo.getReplicaOperationRowFromCache(
      'nonexistent',
    );
    t.equal(result, null);
  });

test('filterReplicaOperationRowsFromCache applies predicate',
  async (t) => {
    const rows = [
      makeRow({operation_id: 'op-1', type: OperationType.ADD}),
      makeRow({operation_id: 'op-2', type: OperationType.REMOVE}),
    ];
    const repo = createTestRepository({
      systemTableCache: {
        get: () => null,
        getAll: () => rows,
        filter(table, predicate) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            return rows.filter(predicate);
          }
          return [];
        },
      },
    });

    const result = repo.filterReplicaOperationRowsFromCache(
      (row) => row.type === OperationType.ADD,
    );
    t.equal(result.length, 1);
    t.equal(result[0].operation_id, 'op-1');
  });

test('filterReplicaOperationRowsFromCache returns null without cache',
  async (t) => {
    const repo = createTestRepository({
      systemTableCache: null,
    });
    // Manually set to null since constructor requires it
    repo.systemTableCache = null;
    const result = repo.filterReplicaOperationRowsFromCache(
      () => true,
    );
    t.equal(result, null);
  });

// ── queryOperationById ──────────────────────────────────────────

test('queryOperationById returns from cache when available',
  async (t) => {
    const row = makeRow();
    const repo = createTestRepository({
      systemTableCache: {
        get(table, key) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
              key === TEST_OPERATION_ID) {
            return row;
          }
          return null;
        },
        getAll: () => [],
        filter: () => [],
      },
    });

    const op = await repo.queryOperationById(TEST_OPERATION_ID);
    t.equal(op.operationId, TEST_OPERATION_ID);
  });

test('queryOperationById falls back to SQL when not in cache',
  async (t) => {
    const row = makeRow();
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: [row]}),
        executeQuery: async () => ({success: true}),
      },
    });

    const op = await repo.queryOperationById(TEST_OPERATION_ID);
    t.equal(op.operationId, TEST_OPERATION_ID);
  });

test('queryOperationById returns null for missing operation',
  async (t) => {
    const repo = createTestRepository();
    const op = await repo.queryOperationById('nonexistent');
    t.equal(op, null);
  });

// ── persistNewOperation ─────────────────────────────────────────

test('persistNewOperation writes via gateway and waits for CDC',
  async (t) => {
    const executedQueries = [];
    const cdcWaits = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: []}),
        executeQuery: async (sql, params) => {
          executedQueries.push({sql, params});
          return {success: true, changes: 1};
        },
      },
      cdcIntegrationService: {
        waitForCacheUpdate: async (...args) => {
          cdcWaits.push(args);
        },
      },
    });

    const op = repo.rowToOperation(makeRow());
    const result = await repo.persistNewOperation(op);

    t.ok(result, 'should return true on success');
    t.equal(executedQueries.length, 1);
    t.ok(
      executedQueries[0].sql.includes('INSERT INTO'),
      'should execute INSERT',
    );
    t.equal(cdcWaits.length, 1,
      'should wait for CDC visibility');
  });

test('persistNewOperation recovers from replica_operations cache ' +
  'visibility gaps when owner-local SQL sees the row', async (t) => {
  const readRowsCalls = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async (tableName, sql, params) => {
        readRowsCalls.push({tableName, sql, params});
        return {success: true, rows: [makeRow({updated_at: 200})]};
      },
      executeQuery: async () => ({success: true, changes: 1}),
    },
    cdcIntegrationService: {
      waitForCacheUpdate: async () => {
        throw new Error(
          'Cache update not observed for replica_operations:' +
          `${TEST_OPERATION_ID} within 1000ms`,
        );
      },
    },
  });

  const op = repo.rowToOperation(makeRow({updated_at: 200}));
  const result = await repo.persistNewOperation(op);

  t.equal(result, true,
    'owner-local SQL confirmation should recover from cache lag');
  t.equal(readRowsCalls.length, 1,
    'owner-local read should verify the persisted row once');
  t.equal(readRowsCalls[0].tableName, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'recovery read should stay scoped to replica_operations');
  t.same(readRowsCalls[0].params, [TEST_OPERATION_ID],
    'recovery read should target the persisted operation id');
});

test('persistNewOperation preserves cache visibility errors when ' +
  'owner-local SQL cannot confirm the row', async (t) => {
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => ({success: true, rows: []}),
      executeQuery: async () => ({success: true, changes: 1}),
    },
    cdcIntegrationService: {
      waitForCacheUpdate: async () => {
        throw new Error(
          'Cache update not observed for replica_operations:' +
          `${TEST_OPERATION_ID} within 1000ms`,
        );
      },
    },
  });

  const op = repo.rowToOperation(makeRow({updated_at: 200}));

  await t.rejects(
    repo.persistNewOperation(op),
    /Cache update not observed/,
    'unconfirmed cache visibility gaps should still fail hard',
  );
});

test('persistOperationUpdate writes via gateway',
  async (t) => {
    const executedQueries = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: []}),
        executeQuery: async (sql, params) => {
          executedQueries.push({sql, params});
          return {success: true};
        },
      },
    });

    const op = repo.rowToOperation(makeRow());
    await repo.persistOperationUpdate(op);

    t.equal(executedQueries.length, 1);
    t.ok(
      executedQueries[0].sql.includes('UPDATE'),
      'should execute UPDATE',
    );
  });

// ── Coordinator delegates to repository ─────────────────────────

test('coordinator.rowToOperation delegates to repository',
  async (t) => {
    const coordinator = createTestCoordinator();
    try {
      const row = makeRow();
      const op = coordinator.rowToOperation(row);

      t.equal(op.operationId, TEST_OPERATION_ID);
      t.equal(op.type, OperationType.ADD);
      t.ok(
        coordinator.repository instanceof
          ReplicaOperationRepository,
        'coordinator should own a repository instance',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('coordinator.isOperationTerminal delegates to repository',
  async (t) => {
    const coordinator = createTestCoordinator();
    try {
      t.ok(coordinator.isOperationTerminal({
        type: OperationType.ADD,
        workflowStep: WORKFLOW_STEP.ACTIVE,
      }));
      t.notOk(coordinator.isOperationTerminal({
        type: OperationType.ADD,
        workflowStep: WORKFLOW_STEP.CREATING,
      }));
    } finally {
      await coordinator.shutdown();
    }
  });

test('coordinator.queryOperationById delegates to repository',
  async (t) => {
    const coordinator = createTestCoordinator();
    try {
      const move = {
        type: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        entityType: TEST_ENTITY_TYPE,
        entityId: TEST_PARTITION_ID,
        nodeId: TEST_TARGET_NODE_ID,
        sourceNodeId: TEST_NODE_ID,
      };
      const created = await coordinator.createOperation(move);
      const queried = await coordinator.queryOperationById(
        created.operationId,
      );

      t.ok(queried, 'should find the created operation');
      t.equal(
        queried.operationId,
        created.operationId,
      );
    } finally {
      await coordinator.shutdown();
    }
  });

// ── extractMutationChangeCount ──────────────────────────────────

test('extractMutationChangeCount extracts changes field',
  async (t) => {
    const repo = createTestRepository();
    t.equal(
      repo.extractMutationChangeCount({changes: 1}),
      1,
    );
    t.equal(
      repo.extractMutationChangeCount({affectedRows: 3}),
      3,
    );
    t.equal(
      repo.extractMutationChangeCount({}),
      null,
    );
  });

// ── getEntityServiceRows ────────────────────────────────────────

test('getEntityServiceRows filters services by entity type',
  async (t) => {
    const serviceRows = [
      {
        service_id: 'svc-1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: TEST_PARTITION_ID,
      },
      {
        service_id: 'svc-2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-1',
      },
    ];
    const repo = createTestRepository({
      systemTableCache: {
        get: () => null,
        getAll: () => serviceRows,
        filter(table, predicate) {
          if (table === SYSTEM_TABLE_NAME.SERVICES) {
            return serviceRows.filter(predicate);
          }
          return [];
        },
      },
    });

    const result = repo.getEntityServiceRows({
      partitionId: TEST_PARTITION_ID,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: TEST_PARTITION_ID,
    });
    t.equal(result.length, 1);
    t.equal(result[0].service_id, 'svc-1');
  });
