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
import {ERRORS, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  OperationType,
  TERMINAL_STATUSES,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
} from '../../src/control-plane/read-model-contract.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
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
  const baseGateway = overrides.controlPlaneSystemTableGateway || {};
  const mockGateway = {
    readAuthoritativeRows: async (tableName, sql, params = [], options = {}) => {
      if (typeof baseGateway.readAuthoritativeRows === 'function') {
        return baseGateway.readAuthoritativeRows(tableName, sql, params, options);
      }
      if (typeof baseGateway.readRows === 'function') {
        return baseGateway.readRows(tableName, sql, params, options);
      }
      return {success: true, rows: []};
    },
    readRows: async (tableName, sql, params = [], options = {}) => {
      if (typeof baseGateway.readRows === 'function') {
        return baseGateway.readRows(tableName, sql, params, options);
      }
      if (typeof baseGateway.readAuthoritativeRows === 'function') {
        return baseGateway.readAuthoritativeRows(tableName, sql, params, options);
      }
      return {success: true, rows: []};
    },
    executeQuery: async (sql, params = [], options = {}) => {
      if (typeof baseGateway.executeQuery === 'function') {
        return baseGateway.executeQuery(sql, params, options);
      }
      return {success: true};
    },
    ...baseGateway,
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
    authoritativeVisibilityTimeoutMs:
      overrides.authoritativeVisibilityTimeoutMs,
    authoritativeVisibilityRetryDelayMs:
      overrides.authoritativeVisibilityRetryDelayMs,
    controlPlaneReadinessService:
      overrides.controlPlaneReadinessService || null,
    logger: mockLogger,
    emitter: overrides.emitter || null,
    random: overrides.random,
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

test('queryIncompleteOperations backs off when authoritative row source is ' +
  'temporarily unavailable',
async (t) => {
  let readCalls = 0;
  const warnings = [];
  const errors = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => {
        readCalls += 1;
        return {
          success: false,
          error: 'authoritative_row_source_unavailable',
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

  const first = await repo.queryIncompleteOperations();
  const second = await repo.queryIncompleteOperations();

  t.same(first, [],
    'authoritative-source gaps should fail closed to empty results');
  t.same(second, [],
    'subsequent reads during cooldown should reuse the empty observation');
  t.equal(readCalls, 1,
    'authoritative-source gaps should arm cooldown instead of hammering routed SQL');
  t.equal(warnings.length, 1,
    'authoritative-source gaps should log one warning');
  t.equal(errors.length, 0,
    'authoritative-source gaps should not log hard errors while cooling down');
});

test('queryIncompleteOperations uses the local-safe owner-read path when ' +
  'canonical participation defers only on self query transport', async (t) => {
  let readCalls = 0;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => {
        readCalls += 1;
        return {success: true, rows: []};
      },
      executeQuery: async () => ({success: true}),
    },
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(nodeId, options = {}) {
        return {
          nodeId,
          participationKind: options.participationKind || null,
          eligible: false,
          decision: 'defer',
          reasonCode:
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          reasonCodes: [
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          ],
          deferRetry: true,
          localExecutionAllowed: true,
          retryAfterMs: 321,
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
          error: 'query ingress owner not ready',
        };
      },
    },
  });
  const operations = await repo.queryIncompleteOperations();

  t.same(operations, [],
    'local-safe execution should still fail closed to empty owner observations when no rows exist');
  t.equal(readCalls, 1,
    'owner read should proceed through the local-safe gateway path');
});

test('executeReplicaOperationsRead routes authoritative owner reads through ' +
  'control-plane recovery readiness', async (t) => {
  const capturedReads = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (tableName, sql, params, options) => {
        capturedReads.push({tableName, sql, params, options});
        return {success: true, rows: []};
      },
    },
  });

  const result = await repo.executeReplicaOperationsRead(
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    [TEST_OPERATION_ID],
  );

  t.equal(result.success, true,
    'authoritative owner read should still succeed when the gateway read succeeds');
  t.equal(capturedReads.length, 1,
    'authoritative owner read should perform one gateway read');
  t.equal(
    capturedReads[0]?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'replica_operations owner reads should route on control-plane recovery readiness',
  );
  t.equal(
    capturedReads[0]?.options?.workClass,
    'critical',
    'replica_operations owner reads should stay on the critical pressure lane',
  );
  t.equal(
    capturedReads[0]?.options?.deliveryPriority,
    'critical',
    'replica_operations owner reads should use critical delivery priority',
  );
  t.equal(
    capturedReads[0]?.options?.allowPressureDefer,
    false,
    'replica_operations owner reads should not defer under transport pressure',
  );
});

test('queryAuthoritativeOperationById retries retryable authoritative read ' +
  'failures before returning null', async (t) => {
  let readCalls = 0;
  const waitCalls = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async () => {
        readCalls += 1;
        if (readCalls < 3) {
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            retryAfterMs: 25,
          };
        }
        return {
          success: true,
          rows: [makeRow()],
        };
      },
    },
  });
  repo.waitForReplicaOperationReadRetry = async (delayMs) => {
    waitCalls.push(delayMs);
  };

  const operation = await repo.queryAuthoritativeOperationById(
    TEST_OPERATION_ID,
  );

  t.equal(operation?.operationId, TEST_OPERATION_ID,
    'authoritative operation reads should recover after bounded retryable failures');
  t.equal(readCalls, 3,
    'authoritative operation reads should retry until one read succeeds');
  t.equal(waitCalls.length, 2,
    'authoritative operation reads should wait between retryable failures');
});

test('queryAuthoritativeOperationById retries transaction commit visibility ' +
  'gaps before returning null', async (t) => {
  let readCalls = 0;
  const waitCalls = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async () => {
        readCalls += 1;
        if (readCalls === 1) {
          return {
            success: false,
            error: 'No active transaction to commit',
          };
        }
        return {
          success: true,
          rows: [makeRow()],
        };
      },
    },
  });
  repo.waitForReplicaOperationReadRetry = async (delayMs) => {
    waitCalls.push(delayMs);
  };

  const operation = await repo.queryAuthoritativeOperationById(
    TEST_OPERATION_ID,
  );

  t.equal(
    operation?.operationId,
    TEST_OPERATION_ID,
    'authoritative reads should recover after a bounded transaction commit visibility gap',
  );
  t.equal(
    readCalls,
    2,
    'transaction commit visibility gaps should trigger one authoritative read retry',
  );
  t.equal(
    waitCalls.length,
    1,
    'authoritative read recovery should wait once before retrying the gap',
  );
});

test('queryIncompleteOperations retries retryable authoritative read failures',
  async (t) => {
    let readCalls = 0;
    const waitCalls = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async () => {
          readCalls += 1;
          if (readCalls < 3) {
            return {
              success: false,
              error: 'Distributed operation failed due to participant failures',
              retryAfterMs: 25,
            };
          }
          return {
            success: true,
            rows: [makeRow()],
          };
        },
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });
    repo.waitForReplicaOperationReadRetry = async (delayMs) => {
      waitCalls.push(delayMs);
    };

    const operations = await repo.queryIncompleteOperations({
      preferAuthoritativeRead: true,
    });

    t.equal(operations.length, 1,
      'authoritative incomplete-operation reads should recover after bounded retry');
    t.equal(readCalls, 3,
      'authoritative incomplete-operation reads should retry until one read succeeds');
    t.equal(waitCalls.length, 2,
      'authoritative incomplete-operation reads should wait between retryable failures');
  });

test('buildReplicaOperationReadParticipationFailure evaluates owner reads ' +
  'against control-plane recovery readiness', async (t) => {
  const participationCalls = [];
  const repo = createTestRepository({
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(nodeId, options = {}) {
        participationCalls.push({nodeId, options});
        return {
          nodeId,
          participationKind: options.participationKind || null,
          eligible: true,
          decision: 'ready',
          reasonCode: null,
          reasonCodes: [],
        };
      },
    },
  });

  const participationFailure =
    repo.buildReplicaOperationReadParticipationFailure();

  t.equal(participationFailure, null,
    'eligible recovery participation should not synthesize a failure');
  t.equal(participationCalls.length, 1,
    'owner-read readiness should be evaluated once');
  t.equal(
    participationCalls[0]?.options?.participationKind,
    CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
    'owner-read readiness should preserve the owner-read participation kind',
  );
  t.equal(
    participationCalls[0]?.options?.decisionDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'owner-read readiness should target control-plane recovery eligibility',
  );
});

test('queryIncompleteOperations ignores non-transport participation blocks for ' +
  'owner-local SQL reads', async (t) => {
  let readCalls = 0;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => {
        readCalls += 1;
        return {success: true, rows: []};
      },
      executeQuery: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(nodeId, options = {}) {
        return {
          nodeId,
          participationKind: options.participationKind || null,
          eligible: false,
          decision: 'blocked',
          reasonCode: CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
          reasonCodes: [
            CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
          ],
          deferRetry: false,
          retryAfterMs: null,
          errorCode: 'CONTROL_PLANE_PARTICIPATION_BLOCKED',
          error: 'missing node row',
        };
      },
    },
  });

  const operations = await repo.queryIncompleteOperations();

  t.same(operations, [],
    'owner read should still fail closed to empty results when SQL sees no rows');
  t.equal(readCalls, 1,
    'non-transport readiness blocks should not suppress owner-local SQL reads');
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

test('resolveOperationOwnerNodeId keeps critical REPLACE ACTIVE on target owner',
  async (t) => {
    const repo = createTestRepository();
    const operation = {
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      sourceNodeId: 'src-node',
      targetNodeId: 'tgt-node',
      workflowStep: WORKFLOW_STEP.ACTIVE,
    };
    t.equal(
      repo.resolveOperationOwnerNodeId(operation),
      'tgt-node',
    );
  });

test('resolveOperationOwnerNodeId keeps critical REPLACE PENDING on target owner',
  async (t) => {
    const repo = createTestRepository();
    const operation = {
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      sourceNodeId: 'src-node',
      targetNodeId: 'tgt-node',
      workflowStep: WORKFLOW_STEP.PENDING,
    };
    t.equal(
      repo.resolveOperationOwnerNodeId(operation),
      'tgt-node',
    );
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

test('isReplaceRemoveDispatchPhase includes STOPPING replay for REPLACE',
  async (t) => {
    const repo = createTestRepository();
    t.ok(repo.isReplaceRemoveDispatchPhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    }));
    t.ok(repo.isReplaceRemoveDispatchPhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.STOPPING,
    }));
    t.notOk(repo.isReplaceRemoveDispatchPhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.SYNCING,
    }));
    t.notOk(repo.isReplaceRemoveDispatchPhase({
      type: OperationType.ADD,
      workflowStep: WORKFLOW_STEP.STOPPING,
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

test('persistNewOperation uses canonical gateway mutation ingress when ' +
  'available and confirms authoritatively',
  async (t) => {
    const insertedRows = [];
    const authoritativeReads = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        cdcIntegrationService: {
          async insertSystemTableRow() {
            return {success: true};
          },
        },
        readRows: async (tableName, sql, params) => {
          authoritativeReads.push({tableName, sql, params});
          return {success: true, rows: [makeRow()]};
        },
        insertSystemTableRow: async (tableName, row, options = {}) => {
          insertedRows.push({tableName, row, options});
          return {success: true, affectedRows: 1};
        },
      },
    });

    const op = repo.rowToOperation(makeRow());
    const result = await repo.persistNewOperation(op);

    t.ok(result, 'should return true on success');
    t.equal(insertedRows.length, 1);
    t.ok(
      insertedRows[0].row.operation_id === TEST_OPERATION_ID,
      'should submit the canonical row shape through the mutation ingress',
    );
    t.equal(
      insertedRows[0]?.options?.skipCacheWait,
      true,
      'canonical mutation ingress should skip cache wait and rely on authoritative confirmation',
    );
    t.equal(authoritativeReads.length, 1,
      'should confirm the write through the authoritative read path');
  });

test('persistNewOperation emits divergence when projection cache lags ' +
  'a confirmed authoritative row', async (t) => {
  const authoritativeReads = [];
  const emittedEvents = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async (tableName, sql, params) => {
        authoritativeReads.push({tableName, sql, params});
        return {success: true, rows: [makeRow({updated_at: 200})]};
      },
      executeQuery: async () => ({success: true, changes: 1}),
    },
    emitter: {
      emit(eventName, payload) {
        emittedEvents.push({eventName, payload});
      },
    },
  });

  const op = repo.rowToOperation(makeRow({updated_at: 200}));
  const result = await repo.persistNewOperation(op);

  t.equal(result, true,
    'authoritative confirmation should succeed even when projection lags');
  t.equal(authoritativeReads.length, 1,
    'authoritative read should verify the persisted row once');
  t.equal(authoritativeReads[0].tableName, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'confirmation read should stay scoped to replica_operations');
  t.same(authoritativeReads[0].params, [TEST_OPERATION_ID],
    'confirmation read should target the persisted operation id');
  t.equal(emittedEvents.length, 1,
    'projection lag should emit a divergence event');
  t.equal(emittedEvents[0].eventName,
    REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE);
  t.equal(emittedEvents[0].payload.divergenceType,
    READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING);
  t.equal(emittedEvents[0].payload.reconciliationReason,
    SQL_RECONCILIATION_REASON.RECOVERY_OPERATION_PERSIST_CONFIRMATION);
});

test('persistNewOperation fails when authoritative confirmation ' +
  'cannot observe the row', async (t) => {
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => ({success: true, rows: []}),
      executeQuery: async () => ({success: true, changes: 1}),
    },
    authoritativeVisibilityTimeoutMs: 0,
  });

  const op = repo.rowToOperation(makeRow({updated_at: 200}));

  await t.rejects(
    repo.persistNewOperation(op),
    /Authoritative replica operation not confirmed/,
    'unconfirmed authoritative writes should still fail hard',
  );
});

test('persistNewOperation retries authoritative confirmation after an ' +
  'initial miss', async (t) => {
  let readRowsCalls = 0;
  const repo = createTestRepository({
    authoritativeVisibilityTimeoutMs: 10,
    authoritativeVisibilityRetryDelayMs: 0,
    controlPlaneSystemTableGateway: {
      readRows: async () => {
        readRowsCalls += 1;
        if (readRowsCalls === 1) {
          return {success: true, rows: []};
        }
        return {success: true, rows: [makeRow({updated_at: 200})]};
      },
      executeQuery: async () => ({success: true, changes: 1}),
    },
  });

  const op = repo.rowToOperation(makeRow({updated_at: 200}));
  const result = await repo.persistNewOperation(op);

  t.equal(result, true,
    'bounded authoritative retries should recover visibility after transient lag');
  t.equal(readRowsCalls, 2,
    'authoritative confirmation should retry until the row is visible');
});

test('persistNewOperation confirmation prefers owner RPC but does not require it',
  async (t) => {
    const readRowsCalls = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async (_tableName, _sql, _params, options = {}) => {
          readRowsCalls.push(options);
          if (options.requireOwnerRpcRead === true) {
            return {
              success: false,
              error: 'owner-rpc-read-failed',
              rows: [],
            };
          }
          return {
            success: true,
            rows: [makeRow({updated_at: 200})],
          };
        },
        executeQuery: async () => ({success: true, changes: 1}),
      },
    });

    const op = repo.rowToOperation(makeRow({updated_at: 200}));
    const result = await repo.persistNewOperation(op);

    t.equal(result, true,
      'authoritative confirmation should still succeed when owner RPC is unavailable');
    t.equal(readRowsCalls.length, 1,
      'confirmation should issue one authoritative read');
    t.equal(readRowsCalls[0]?.preferOwnerRpcRead, true,
      'confirmation should prefer owner-rpc reads');
    t.equal(readRowsCalls[0]?.requireOwnerRpcRead, false,
      'confirmation should not fail closed on owner-rpc unavailability');
  });

test('persistOperationUpdate uses canonical gateway mutation ingress when ' +
  'available',
  async (t) => {
    const gatewayMutations = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        cdcIntegrationService: {
          async updateSystemTableRow() {
            return {success: true};
          },
        },
        readRows: async () => ({success: true, rows: [makeRow()]}),
        updateSystemTableRow: async (tableName, whereClause, data, options={}) => {
          gatewayMutations.push({tableName, whereClause, data, options});
          return {success: true, affectedRows: 1};
        },
      },
    });

    const op = repo.rowToOperation(makeRow());
    await repo.persistOperationUpdate(op);

    t.equal(gatewayMutations.length, 1);
    t.equal(gatewayMutations[0].tableName, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
    t.same(
      gatewayMutations[0].whereClause,
      {operation_id: TEST_OPERATION_ID},
      'should update the canonical operation row by primary key',
    );
    t.equal(
      gatewayMutations[0].data.workflow_step,
      WORKFLOW_STEP.CREATING,
      'should pass the workflow fields through the canonical mutation ingress',
    );
    t.equal(
      gatewayMutations[0]?.options?.mergePolicy,
      CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
      'should replace older pending writes for the same operation row',
    );
    t.equal(
      gatewayMutations[0]?.options?.skipCacheWait,
      true,
      'canonical mutation ingress should skip cache wait and rely on authoritative confirmation',
    );
  });

test('persistOperationUpdate falls back to raw query mutations for reduced ' +
  'gateway stubs', async (t) => {
  const executedQueries = [];
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => ({success: true, rows: [makeRow()]}),
      executeQuery: async (sql, params, options = {}) => {
        executedQueries.push({sql, params, options});
        return {success: true};
      },
    },
  });

  const op = repo.rowToOperation(makeRow());
  await repo.persistOperationUpdate(op);

  t.equal(executedQueries.length, 1);
  t.ok(
    executedQueries[0].sql.includes('UPDATE'),
    'fallback stubs should continue to use the raw query path',
  );
});

test('runReplicaOperationTransitionExclusive keeps priority control-plane ' +
  'transitions off the ordinary transition lane', async (t) => {
  const repo = createTestRepository();
  const executionOrder = [];
  let releaseOrdinaryTransition = null;
  const ordinaryTransitionBlocked = new Promise((resolve) => {
    releaseOrdinaryTransition = resolve;
  });

  const ordinaryPromise = repo.runReplicaOperationTransitionExclusive(
    async () => {
      executionOrder.push('ordinary-start');
      await ordinaryTransitionBlocked;
      executionOrder.push('ordinary-end');
      return 'ordinary';
    },
    {
      partitionId: 'user-data-p17',
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  const priorityPromise = repo.runReplicaOperationTransitionExclusive(
    async () => {
      executionOrder.push('priority-start');
      return 'priority';
    },
    {
      partitionId:
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  t.same(
    executionOrder,
    ['ordinary-start', 'priority-start'],
    'priority control-plane transitions should start before unrelated ordinary transitions finish',
  );

  releaseOrdinaryTransition();

  const [ordinaryResult, priorityResult] =
    await Promise.all([ordinaryPromise, priorityPromise]);
  t.equal(ordinaryResult, 'ordinary');
  t.equal(priorityResult, 'priority');
});

test('persistOperationUpdate forwards the enclosing timeout budget',
  async (t) => {
    const executedQueries = [];
    const timeoutBudget = {
      configuredBudgetMs: 1000,
      startedAtMs: 1000,
      deadlineMs: 2000,
      operationName: 'transaction',
    };
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: [makeRow()]}),
        executeQuery: async (_sql, _params, options = {}) => {
          executedQueries.push(options);
          return {success: true};
        },
      },
    });

    const op = repo.rowToOperation(makeRow());
    await repo.persistOperationUpdate(op, {timeoutBudget});

    t.equal(executedQueries.length, 1,
      'persistOperationUpdate should issue one mutation');
    t.equal(
      executedQueries[0].timeoutBudget,
      timeoutBudget,
      'persistOperationUpdate should preserve the enclosing timeout budget on the mutation query',
    );
  });

test('persistOperationUpdate preserves structured retry metadata on ' +
  'thrown participant failures', async (t) => {
  const participantFailure = {
    error: 'control_plane_pressure_degraded',
    errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
    retryAfterMs: 250,
    deferRetry: true,
    failedTable: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  };
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      executeQuery: async () => ({
        success: false,
        error: 'Query execution failed',
        errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
        firstFailedParticipant: participantFailure,
        participantFailures: [participantFailure],
      }),
    },
  });

  const op = repo.rowToOperation(makeRow());

  try {
    await repo.persistOperationUpdate(op);
    t.fail('persistOperationUpdate should throw the mutation failure');
  } catch (error) {
    t.equal(error.message, 'Query execution failed');
    t.equal(
      error.errorCode,
      'DISTRIBUTED_PARTICIPANT_FAILURE',
      'top-level error code should be preserved on the thrown error',
    );
    t.equal(
      error.retryAfterMs,
      250,
      'nested retry-after hints should survive the repository throw boundary',
    );
    t.equal(
      error.deferRetry,
      true,
      'nested defer markers should survive the repository throw boundary',
    );
    t.equal(
      error.firstFailedParticipant?.errorCode,
      'CONTROL_PLANE_PRESSURE_DEGRADED',
      'first failed participant metadata should remain available to callers',
    );
    t.equal(
      error.participantFailures?.length,
      1,
      'participant failure details should remain available to callers',
    );
  }
});

test('buildOperationPersistError marks retryable workflow participant lookup ' +
  'failures for deferred retry', async (t) => {
  const repo = createTestRepository({
    random: () => 0,
  });

  const error = repo.buildOperationPersistError({
    success: false,
    error: 'Workflow participant replica_operations-p1 not found',
    errorCode: 'INTERNAL_ERROR',
  });

  t.equal(
    error.message,
    'Workflow participant replica_operations-p1 not found',
  );
  t.equal(
    error.deferRetry,
    true,
    'retryable participant lookup failures should be surfaced as deferred retries',
  );
  t.equal(
    error.retryAfterMs,
    250,
    'repository should surface the bounded retry delay for owner-lane retries',
  );
});

test('persistOperationUpdate fails when authoritative confirmation ' +
  'does not reflect workflow step/status', async (t) => {
  const repo = createTestRepository({
    authoritativeVisibilityTimeoutMs: 0,
    controlPlaneSystemTableGateway: {
      readRows: async () => ({
        success: true,
        rows: [makeRow({
          status: 'creating',
          workflow_step: 'CREATING',
          updated_at: 999,
        })],
      }),
      executeQuery: async () => ({success: true, changes: 1}),
    },
  });

  const op = repo.rowToOperation(makeRow({
    status: 'active',
    workflow_step: 'ACTIVE',
    updated_at: 200,
  }));

  await t.rejects(
    repo.persistOperationUpdate(op),
    /Authoritative replica operation not confirmed/,
    'step/status mismatches must fail persistence confirmation',
  );
});

test('persistOperationUpdate retries stale no-handler owner handoff errors ' +
  'and confirms the updated row authoritatively', async (t) => {
  let executeCalls = 0;
  let waitCalls = 0;
  const updatedAt = Date.now() + 1000;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      readRows: async () => ({
        success: true,
        rows: [makeRow({
          status: 'active',
          workflow_step: 'ACTIVE',
          updated_at: updatedAt,
        })],
      }),
      executeQuery: async () => {
        executeCalls += 1;
        if (executeCalls === 1) {
          return {
            success: false,
            error:
              `${ERRORS.NO_HANDLER_FOR_ADDRESS} ` +
              'node-1/partition/replica_operations-p1-r1',
          };
        }
        return {success: true, changes: 1};
      },
    },
  });
  repo.waitForOperationPersistRetry = async () => {
    waitCalls += 1;
  };

  const op = repo.rowToOperation(makeRow({
    status: 'active',
    workflow_step: 'ACTIVE',
    updated_at: updatedAt,
  }));

  await repo.persistOperationUpdate(op);

  t.equal(
    executeCalls,
    2,
    'persistOperationUpdate should retry one stale no-handler owner handoff failure',
  );
  t.equal(
    waitCalls,
    1,
    'persistOperationUpdate should wait once before the retry succeeds',
  );
});

test('executeOperationMutationWithRetry retries no-handler owner handoff errors',
  async (t) => {
    let attempts = 0;
    let waitCalls = 0;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              success: false,
              error:
                `${ERRORS.NO_HANDLER_FOR_ADDRESS} ` +
                'node-1/partition/replica_operations-p1-r1',
            };
          }
          return {success: true, changes: 1};
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {
      waitCalls += 1;
    };

    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {ownerId: TEST_OPERATION_ID},
    );

    t.equal(result.success, true,
      'no-handler owner handoff errors should be retried');
    t.equal(attempts, 2,
      'repository should retry once after no-handler owner handoff');
    t.equal(waitCalls, 1,
      'retry loop should wait exactly once before succeeding');
  });

test('executeOperationMutationWithRetry retries workflow participant ' +
  'lookup gaps', async (t) => {
  let attempts = 0;
  let waitCalls = 0;
  const repo = createTestRepository({
    controlPlaneSystemTableGateway: {
      executeQuery: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            success: false,
            error: 'Workflow participant replica_operations-p1 not found',
            errorCode: 'INTERNAL_ERROR',
          };
        }
        return {success: true, changes: 1};
      },
    },
  });
  repo.waitForOperationPersistRetry = async () => {
    waitCalls += 1;
  };

  const result = await repo.executeOperationMutationWithRetry(
    'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
    [Date.now(), TEST_OPERATION_ID],
    {ownerId: TEST_OPERATION_ID},
  );

  t.equal(result.success, true,
    'workflow participant lookup gaps should be retried');
  t.equal(attempts, 2,
    'repository should retry once after a retryable participant lookup gap');
  t.equal(waitCalls, 1,
    'retry loop should wait exactly once before retrying the participant gap');
});

test('executeOperationMutationWithRetry retries control-plane admission defers',
  async (t) => {
    let attempts = 0;
    let waitCalls = 0;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              success: false,
              error: 'query_admission_deferred',
              reasonCode: 'transport_backpressure',
              retryAfterMs: 250,
              deferRetry: true,
            };
          }
          return {success: true, changes: 1};
        },
      },
    });
    repo.waitForOperationPersistRetry = async () => {
      waitCalls += 1;
    };

    const result = await repo.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [Date.now(), TEST_OPERATION_ID],
      {ownerId: TEST_OPERATION_ID},
    );

    t.equal(result.success, true,
      'retryable control-plane admission defers should be retried');
    t.equal(attempts, 2,
      'repository should retry once after a retryable admission defer');
    t.equal(waitCalls, 1,
      'retry loop should wait exactly once before retrying the defer');
  });

test('executeOperationMutationWithRetry preserves explicit sessions and ' +
  'adds jitter for partition contention', async (t) => {
  let attempts = 0;
  const observedSessions = [];
  const observedWaits = [];
  const explicitSessionId = 'explicit-transition-session';
  const repo = createTestRepository({
    random: () => 1,
    controlPlaneSystemTableGateway: {
      executeQuery: async (_sql, _params, options = {}) => {
        attempts += 1;
        observedSessions.push(options.sessionId || null);
        if (attempts === 1) {
          return {
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        }
        return {success: true, changes: 1};
      },
    },
  });
  repo.waitForOperationPersistRetry = async (delayMs) => {
    observedWaits.push(delayMs);
  };

  const result = await repo.executeOperationMutationWithRetry(
    'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
    [Date.now(), TEST_OPERATION_ID],
    {
      ownerId: TEST_OPERATION_ID,
      sessionId: explicitSessionId,
    },
  );

  t.equal(result.success, true,
    'partition contention should still recover on retry');
  t.same(
    observedSessions,
    [explicitSessionId, explicitSessionId],
    'explicit transition sessions must stay stable across contention retries',
  );
  t.equal(observedWaits.length, 1,
    'contention should wait once before retrying');
  t.ok(
    observedWaits[0] > 250,
    'partition contention retries should add jitter instead of retrying in lockstep',
  );
});

test('executeOperationMutationWithRetry rotates implicit sessions on ' +
  'partition contention retries', async (t) => {
  let attempts = 0;
  const observedSessions = [];
  const repo = createTestRepository({
    random: () => 0,
    controlPlaneSystemTableGateway: {
      executeQuery: async (_sql, _params, options = {}) => {
        attempts += 1;
        observedSessions.push(options.sessionId || null);
        if (attempts === 1) {
          return {
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        }
        return {success: true, changes: 1};
      },
    },
  });
  repo.waitForOperationPersistRetry = async () => {};

  const result = await repo.executeOperationMutationWithRetry(
    'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
    [Date.now(), TEST_OPERATION_ID],
    {ownerId: TEST_OPERATION_ID},
  );

  t.equal(result.success, true,
    'repository-generated sessions should still recover after partition contention');
  t.equal(attempts, 2,
    'partition contention should trigger one retry');
  t.not(
    observedSessions[0],
    observedSessions[1],
    'implicit owner-mutation retries should rotate the generated session after partition contention',
  );
});

test('executeOperationMutationWithRetry stops at the enclosing timeout budget',
  async (t) => {
    const originalDateNow = Date.now;
    let nowMs = 1000;
    Date.now = () => nowMs;
    let attempts = 0;
    let waitCalls = 0;
    const observedTimeoutBudgets = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async (_sql, _params, options = {}) => {
          attempts += 1;
          observedTimeoutBudgets.push(options.timeoutBudget || null);
          nowMs += 450;
          return {
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        },
      },
    });
    repo.waitForOperationPersistRetry = async (delayMs) => {
      waitCalls += 1;
      nowMs += delayMs;
    };

    try {
      const timeoutBudget = {
        configuredBudgetMs: 1000,
        startedAtMs: nowMs,
        deadlineMs: nowMs + 1000,
        operationName: 'transaction',
      };
      const result = await repo.executeOperationMutationWithRetry(
        'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
        [Date.now(), TEST_OPERATION_ID],
        {
          ownerId: TEST_OPERATION_ID,
          timeoutBudget,
        },
      );

      t.equal(result.success, false,
        'retryable mutation should still fail when the enclosing budget runs out');
      t.equal(
        result.error,
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        'the original contention boundary should surface instead of a later timeout-shaped miss',
      );
      t.equal(
        attempts,
        2,
        'repository retry loop should stop once the enclosing transition budget is exhausted',
      );
      t.equal(
        waitCalls,
        1,
        'repository should only sleep while budget remains',
      );
      t.same(
        observedTimeoutBudgets,
        [timeoutBudget, timeoutBudget],
        'gateway retries should receive the same enclosing timeout budget',
      );
    } finally {
      Date.now = originalDateNow;
    }
  });

test('executeOperationMutationWithRetry stops at the local retry timeout',
  async (t) => {
    const originalDateNow = Date.now;
    let nowMs = 1000;
    Date.now = () => nowMs;
    let attempts = 0;
    let waitCalls = 0;
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        executeQuery: async () => {
          attempts += 1;
          nowMs += 5000;
          return {
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        },
      },
    });
    repo.waitForOperationPersistRetry = async (delayMs) => {
      waitCalls += 1;
      nowMs += delayMs;
    };

    try {
      const result = await repo.executeOperationMutationWithRetry(
        'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
        [Date.now(), TEST_OPERATION_ID],
        {ownerId: TEST_OPERATION_ID},
      );

      t.equal(result.success, false,
        'retryable mutation should still fail when the shared local retry window runs out');
      t.equal(
        result.error,
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        'the original contention boundary should be returned after the local retry timeout expires',
      );
      t.equal(
        attempts,
        3,
        'repository retry loop should stop once the shared local retry timeout is exhausted',
      );
      t.equal(
        waitCalls,
        2,
        'repository should only sleep while the shared local retry timeout still has budget remaining',
      );
    } finally {
      Date.now = originalDateNow;
    }
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
