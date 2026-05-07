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
import {CONTROL_PLANE_WORKLOAD_CLASS} from '../../src/control-plane/control-plane-workload-profile.js';
import {CONTROL_PLANE_TIMEOUT_DEFAULT} from '../../src/control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  PRIORITY_RECOVERY_COMPLETION_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from '../../src/cdc/cdc-integration-service.js';
import {
  OperationType,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  TERMINAL_STATUSES,
} from '../../src/rebalancer/replica-status.js';
import {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
} from '../../src/control-plane/read-model-contract.js';
import {REBALANCE_COORDINATOR_EVENT} from '../../src/rebalancer/rebalancer-constants.js';
import {PARTITION_SERVICE_ERROR_MSG} from '../../src/partition/partition-service-constants.js';
import {createTestCoordinator} from './test-helpers.js';
import {registerReplicaOperationRepositoryTailTests} from './replica-operation-repository-tail-test-cases.js';

const TEST_NODE_ID = 'test-node-1';
const TEST_OPERATION_ID = 'op-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_REPLICA_ID = 'partition-1-r1';
const TEST_TARGET_NODE_ID = 'node-2';
const TEST_SOURCE_OWNER_NODE_ID = 'src-node';
const TEST_TARGET_OWNER_NODE_ID = 'tgt-node';
const TEST_NON_PRIORITY_SYSTEM_PARTITION_ID = 'service_timers-p1';
const TEST_USER_REPLACE_PARTITION_ID = 'user_partition-p1';
const TEST_ENTITY_TYPE = SERVICE_TYPE.PARTITION;
const TEST_CREATING_STATUS = 'creating';
const TEST_ACTIVE_STATUS = 'active';
const TEST_REMOVED_STATUS = 'removed';
const TEST_FAILED_STATUS = 'failed';
const VISIBILITY_CONFIRMATION_STATE_DEFERRED = 'deferred';
const TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID = 'op-cache-backed-visibility';
const TEST_PENDING_STATUS = 'pending';
const PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_FAILURE_SOURCE =
  'priority_recovery_authoritative_operation_visibility_failure';
const PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_EMPTY_READ_SOURCE =
  'priority_recovery_authoritative_operation_visibility_empty_read';
const OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE =
  'owner_persisted_transition_authoritative_operation_visibility_empty_read';
const OWNER_PERSISTED_TRANSITION_VISIBILITY_STALE_READ_SOURCE =
  'owner_persisted_transition_authoritative_operation_visibility_stale_read';
const OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON =
  'owner_persisted_transition_pending_authoritative_confirmation';
const TEST_REPLICA_OPERATION_MUTATION_COALESCING_KEY =
  'replica-operation:op-1';
const TEST_REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE =
  'control-plane:write:replica_operations:replica-operation:op-1';
const TEST_REPLICA_OPERATION_READ_COALESCING_KEY =
  'replica-operation:op-1';
const TEST_REPLICA_OPERATION_READ_DELIVERY_SOURCE =
  'control-plane:read:replica_operations:replica-operation:op-1';
const TEST_REPLICA_OPERATION_OWNER_READ_COALESCING_KEY =
  'replica-operation-owner:test-node-1';
const TEST_REPLICA_OPERATION_OWNER_READ_DELIVERY_SOURCE =
  'control-plane:read:replica_operations:replica-operation-owner:test-node-1';

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
    authoritativeVisibilityTimeoutMs: overrides.authoritativeVisibilityTimeoutMs,
    authoritativeVisibilityRetryDelayMs: overrides.authoritativeVisibilityRetryDelayMs,
    controlPlaneReadinessService: overrides.controlPlaneReadinessService || null,
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

test('buildOperationMutationQueryOptions scopes replica operation writes by owner id',
  async (t) => {
    const repo = createTestRepository();
    const queryOptions = repo.buildOperationMutationQueryOptions({
      ownerId: TEST_OPERATION_ID,
    });

    t.equal(
      queryOptions.coalescingKey,
      TEST_REPLICA_OPERATION_MUTATION_COALESCING_KEY,
      'replica operation mutations should coalesce by operation id',
    );
    t.equal(
      queryOptions.deliverySource,
      TEST_REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE,
      'replica operation mutations should use an operation-scoped delivery source',
    );
  });

// ── rowToOperation translation ──────────────────────────────────

test('rowToOperation translates SQL row to operation object', async (t) => {
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

test('rowToOperation exposes shared semantic phase and witnesses', async (t) => {
  const repo = createTestRepository();
  const op = repo.rowToOperation(makeRow({
    type: OperationType.REPLACE,
    status: 'active',
    workflow_step: WORKFLOW_STEP.ACTIVE,
  }));

  t.equal(
    op.semanticPhase,
    REPLICA_OPERATION_SEMANTIC_PHASE.TARGET_READY,
    'replace promotion should use the shared target_ready semantic phase',
  );
  t.same(
    op.witnesses,
    {
      activationWitness: true,
      sourceRetirementWitness: false,
      settlementWitness: false,
      failureWitness: false,
    },
    'repository rows should expose explicit lifecycle witnesses',
  );
});

test('rowToOperation rehydrates replica topology metadata', async (t) => {
  const repo = createTestRepository();
  const history = [
    {
      step: WORKFLOW_STEP.PENDING,
      replicaIds: ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'],
      peerAddresses: [
        'node-1/message-group/mg-1-r1',
        'node-2/message-group/mg-1-r2',
        'node-3/message-group/mg-1-r3',
      ],
    },
  ];
  const row = makeRow({
    entity_type: SERVICE_TYPE.MESSAGE_GROUP,
    entity_id: 'mg-1',
    steps_history: JSON.stringify(history),
  });
  const op = repo.rowToOperation(row);

  t.same(op.replicaIds, history[0].replicaIds);
  t.same(op.peerAddresses, history[0].peerAddresses);
});

test('rowToOperation defaults entity_type to partition', async (t) => {
  const repo = createTestRepository();
  const row = makeRow({entity_type: null, entity_id: null});
  const op = repo.rowToOperation(row);

  t.equal(op.entityType, SERVICE_TYPE.PARTITION);
  t.equal(op.entityId, TEST_PARTITION_ID);
});

test('rowToOperation recovers from malformed steps_history', async (t) => {
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
  t.ok(errors.length > 0, 'should log error for malformed JSON');
});

test('queryIncompleteOperations logs retryable read failures as warnings', async (t) => {
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

  t.same(operations, [], 'retryable read failures should fail closed to empty results');
  t.equal(warnings.length, 1, 'retryable read failures should log one warning');
  t.equal(errors.length, 0, 'retryable read failures should not log hard errors');
  t.equal(
    warnings[0][1]?.code,
    'CONTROL_PLANE_PRESSURE_DEGRADED',
    'warning should preserve the typed pressure code',
  );
  t.equal(warnings[0][1]?.retryAfterMs, 250, 'warning should preserve the retry-after hint');
});

test('queryIncompleteOperations backs off SQL retries after retryable read failures', async (t) => {
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

  t.same(first, [], 'first retryable failure should fail closed to empty results');
  t.same(second, [], 'subsequent reads during cooldown should reuse the empty observation');
  t.equal(
    readCalls,
    1,
    'retryable failures should arm a cooldown instead of hammering replica_operations SQL',
  );
});

test(
  'queryIncompleteOperations backs off when authoritative row source is ' +
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

    t.same(first, [], 'authoritative-source gaps should fail closed to empty results');
    t.same(second, [], 'subsequent reads during cooldown should reuse the empty observation');
    t.equal(
      readCalls,
      1,
      'authoritative-source gaps should arm cooldown instead of hammering routed SQL',
    );
    t.equal(warnings.length, 1, 'authoritative-source gaps should log one warning');
    t.equal(
      errors.length,
      0,
      'authoritative-source gaps should not log hard errors while cooling down',
    );
  },
);

test(
  'queryIncompleteOperations reuses the last observed operation set when ' +
    'priority recovery defers the authoritative owner read',
  async (t) => {
    let readCalls = 0;
    const cachedRows = [
      makeRow({
        operation_id: 'op-priority-recovery',
        type: OperationType.REPLACE,
        partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
        workflow_step: WORKFLOW_STEP.ACTIVE,
        status: 'active',
        source_node_id: 'node-2',
        target_node_id: TEST_NODE_ID,
      }),
    ];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
          };
        },
        executeQuery: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return {
            publicationStatus: 'PENDING',
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [
                {
                  partitionId: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
                  spreadGap: 1,
                },
              ],
            },
          };
        },
      },
      systemTableCache: {
        get: () => null,
        getAll: () => cachedRows,
        filter: (_table, predicate) => cachedRows.filter(predicate),
      },
    });

    const operations = await repo.queryIncompleteOperations({
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
    });
    const outcome = repo.getLastIncompleteOperationReadOutcome();

    t.ok(
      readCalls >= 1,
      'the repository should still attempt the authoritative owner read before deferring',
    );
    t.same(
      operations.map((operation) => operation.operationId),
      ['op-priority-recovery'],
      'priority recovery defer should fall back to the last observed incomplete operation set instead of collapsing to empty',
    );
    t.equal(
      outcome?.completionState,
      'operation_visibility_deferred',
      'the repository should preserve the canonical deferred completion state',
    );
    t.equal(
      outcome?.reasonCode,
      'operation_visibility_deferred',
      'the repository should preserve the canonical deferred reason code',
    );
    t.equal(
      outcome?.retryAfterMs,
      250,
      'the repository should preserve the bounded retry delay from the failed owner read',
    );
    t.equal(
      outcome?.cachedOperationCount,
      1,
      'the deferred outcome should report how many cached operations were reused',
    );
    t.equal(
      outcome?.source,
      'priority_recovery_authoritative_operation_failure',
      'the deferred outcome should retain the authoritative-read failure source',
    );
    t.ok(
      Number.isInteger(outcome?.queryDurationMs) && outcome.queryDurationMs >= 0,
      'the deferred outcome should preserve the bounded owner-read duration',
    );
  },
);

test(
  'getOperationsByEntityAuthoritativeObservation preserves one ' +
    'canonical deferred outcome on retryable owner-read failure',
  async (t) => {
    let readCalls = 0;
    const cachedRows = [
      makeRow({
        operation_id: 'op-entity-visibility-cached',
        status: 'creating',
        workflow_step: WORKFLOW_STEP.CREATING,
      }),
    ];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
          };
        },
        executeQuery: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return {
            publicationStatus: 'PENDING',
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [
                {
                  partitionId: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
                  spreadGap: 1,
                },
              ],
            },
          };
        },
      },
      systemTableCache: {
        get: () => null,
        getAll: () => cachedRows,
        filter: (_table, predicate) => cachedRows.filter(predicate),
      },
    });

    const observation = await repo.getOperationsByEntityAuthoritativeObservation(
      TEST_ENTITY_TYPE,
      TEST_PARTITION_ID,
    );

    t.equal(readCalls, 1, 'the repository should still attempt one authoritative owner read');
    t.equal(
      observation?.state,
      'present',
      'cache-visible in-flight rows should remain usable while authoritative visibility is deferred',
    );
    t.same(
      observation?.operations?.map((operation) => operation.operationId),
      ['op-entity-visibility-cached'],
      'deferred entity visibility should reuse the cache-visible in-flight operation rows',
    );
    t.equal(
      observation?.deferredOutcome?.completionState,
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'entity observation should preserve the canonical deferred completion state',
    );
    t.equal(
      observation?.deferredOutcome?.source,
      'priority_recovery_entity_operation_authoritative_failure',
      'entity observation should retain the authoritative-failure source',
    );
    t.equal(
      observation?.retryAfterMs,
      250,
      'entity observation should preserve bounded retry guidance',
    );
  },
);

test(
  'getOperationsByEntityAuthoritativeObservation preserves deferred ' +
    'emptiness when slow owner reads cannot yet prove the entity is clear',
  async (t) => {
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: []}),
        executeQuery: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return {
            publicationStatus: 'PENDING',
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [
                {
                  partitionId: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
                  spreadGap: 1,
                },
              ],
            },
          };
        },
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });

    const originalNow = Date.now;
    let nowMs = 1_000;
    Date.now = () => {
      nowMs += 1_100;
      return nowMs;
    };
    try {
      const observation = await repo.getOperationsByEntityAuthoritativeObservation(
        TEST_ENTITY_TYPE,
        TEST_PARTITION_ID,
      );

      t.equal(
        observation?.state,
        'deferred',
        'slow empty owner reads under active priority recovery should stay deferred instead of collapsing to empty',
      );
      t.equal(
        observation?.operationCount,
        0,
        'no fallback rows should remain a deferred empty observation, not a false positive',
      );
      t.equal(
        observation?.deferredOutcome?.source,
        'priority_recovery_entity_operation_empty_read',
        'slow empty reads should preserve the empty-read deferred source',
      );
      t.equal(
        observation?.deferredOutcome?.completionState,
        PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'slow empty reads should preserve the canonical deferred completion state',
      );
    } finally {
      Date.now = originalNow;
    }
  },
);

test(
  'getOperationsByEntityAuthoritativeObservation replaces stale ' +
    'authoritative rows with newer locally owned terminal transition witnesses',
  async (t) => {
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: true,
          rows: [
            makeRow({
              type: OperationType.REPLACE,
              status: TEST_CREATING_STATUS,
              workflow_step: WORKFLOW_STEP.CREATING,
              updated_at: 150,
              completed_at: null,
            }),
          ],
        }),
        executeQuery: async () => ({success: true}),
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });
    repo.recordOwnerPersistedTransitionVisibilityWitness(
      repo.rowToOperation(makeRow({
        type: OperationType.REPLACE,
        status: TERMINAL_STATUSES.FAILED,
        workflow_step: WORKFLOW_STEP.FAILED,
        updated_at: 200,
        completed_at: 200,
      })),
    );

    const observation = await repo.getOperationsByEntityAuthoritativeObservation(
      TEST_ENTITY_TYPE,
      TEST_PARTITION_ID,
    );

    t.equal(
      observation?.state,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'entity visibility should keep the newer locally committed transition visible',
    );
    t.same(
      observation?.operations?.map((operation) => operation.workflowStep),
      [WORKFLOW_STEP.FAILED],
      'entity visibility should supersede the stale creating row with the newer failed transition',
    );
    t.same(
      observation?.operations?.map((operation) => operation.status),
      [TERMINAL_STATUSES.FAILED],
      'the superseded entity row should preserve the terminal status',
    );
  },
);

test(
  'queryIncompleteOperations uses the local-safe owner-read path when ' +
    'canonical participation defers only on self query transport',
  async (t) => {
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
            reasonCode: CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
            reasonCodes: [CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY],
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

    t.same(
      operations,
      [],
      'local-safe execution should still fail closed to empty owner observations when no rows exist',
    );
    t.equal(readCalls, 1, 'owner read should proceed through the local-safe gateway path');
  },
);

test(
  'executeReplicaOperationsRead routes authoritative owner reads through ' +
    'control-plane recovery readiness',
  async (t) => {
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

    t.equal(
      result.success,
      true,
      'authoritative owner read should still succeed when the gateway read succeeds',
    );
    t.equal(capturedReads.length, 1, 'authoritative owner read should perform one gateway read');
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
      capturedReads[0]?.options?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY,
      'replica_operations owner reads should emit the shared visibility workload class',
    );
    t.equal(
      capturedReads[0]?.options?.deliveryPriority,
      'critical',
      'replica_operations owner reads should use critical delivery priority',
    );
    t.equal(
      capturedReads[0]?.options?.coalescingKey,
      TEST_REPLICA_OPERATION_READ_COALESCING_KEY,
      'operation-id owner reads should coalesce by operation id',
    );
    t.equal(
      capturedReads[0]?.options?.deliverySource,
      TEST_REPLICA_OPERATION_READ_DELIVERY_SOURCE,
      'operation-id owner reads should use an operation-scoped delivery source',
    );
    t.equal(
      capturedReads[0]?.options?.timeoutMs,
      CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
      'generic replica_operations owner reads should keep the shared control-plane timeout budget',
    );
    t.equal(
      capturedReads[0]?.options?.allowPressureDefer,
      false,
      'replica_operations owner reads should not defer under transport pressure',
    );
    t.equal(
      capturedReads[0]?.options?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      'replica_operations owner reads should report the canonical local-only read mode',
    );
  },
);

test(
  'queryAuthoritativeOperationById uses the cache-preferred visibility ' +
    'read contract when strict owner RPC is not required',
  async (t) => {
    const capturedReads = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async (tableName, sql, params, options) => {
          capturedReads.push({tableName, sql, params, options});
          return {
            success: true,
            rows: [makeRow()],
          };
        },
      },
    });

    const operation = await repo.queryAuthoritativeOperationById(TEST_OPERATION_ID);

    t.equal(
      operation?.operationId,
      TEST_OPERATION_ID,
      'authoritative visibility reads should still return the matched operation',
    );
    t.equal(
      capturedReads.length,
      1,
      'authoritative visibility reads should perform one gateway read',
    );
    t.equal(
      capturedReads[0]?.options?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'authoritative visibility reads should prefer owner RPC with SQL fallback',
    );
  },
);

test(
  'queryAuthoritativeOperationById retries retryable authoritative read ' +
    'failures before returning null',
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
    });
    repo.waitForReplicaOperationReadRetry = async (delayMs) => {
      waitCalls.push(delayMs);
    };

    const operation = await repo.queryAuthoritativeOperationById(TEST_OPERATION_ID);

    t.equal(
      operation?.operationId,
      TEST_OPERATION_ID,
      'authoritative operation reads should recover after bounded retryable failures',
    );
    t.equal(readCalls, 3, 'authoritative operation reads should retry until one read succeeds');
    t.equal(
      waitCalls.length,
      2,
      'authoritative operation reads should wait between retryable failures',
    );
  },
);

test(
  'queryAuthoritativeOperationById retries transaction commit visibility ' +
    'gaps before returning null',
  async (t) => {
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

    const operation = await repo.queryAuthoritativeOperationById(TEST_OPERATION_ID);

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
  },
);

test(
  'getOperationByIdVisibilityObservation preserves deferred cache-backed ' +
    'visibility when priority recovery blocks authoritative reads',
  async (t) => {
    let readCalls = 0;
    const cachedRow = makeRow({
      operation_id: TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
      status: TEST_PENDING_STATUS,
      workflow_step: WORKFLOW_STEP.PENDING,
    });
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            retryAfterMs: 250,
          };
        },
        executeQuery: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return {
            publicationStatus: 'PENDING',
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [
                {
                  partitionId: `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`,
                  spreadGap: 1,
                },
              ],
            },
          };
        },
      },
      systemTableCache: {
        get(tableName, key) {
          return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
            key === cachedRow.operation_id ?
            cachedRow :
            null;
        },
        getAll() {
          return [cachedRow];
        },
        filter(_tableName, predicate) {
          return [cachedRow].filter(predicate);
        },
      },
    });

    const observation = await repo.getOperationByIdVisibilityObservation(cachedRow.operation_id, {
      allowPriorityRecoveryDeferredVisibility: true,
    });

    t.ok(
      readCalls >= 1,
      'single-operation visibility should still attempt an authoritative read before falling back',
    );
    t.equal(
      observation?.state,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'deferred authoritative visibility should keep cache-backed operations visible',
    );
    t.equal(
      observation?.operation?.operationId,
      cachedRow.operation_id,
      'single-operation visibility should fall back to the repository-owned query result',
    );
    t.equal(
      observation?.deferredOutcome?.completionState,
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'single-operation visibility should preserve the canonical deferred completion state',
    );
    t.equal(
      observation?.retryAfterMs,
      250,
      'single-operation visibility should preserve bounded retry guidance',
    );
  },
);

test(
  'persistNewOperation keeps a deferred owner-persisted transition visible ' +
    'to later single-operation reads when authoritative confirmation stays empty',
  async (t) => {
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      authoritativeVisibilityRetryDelayMs: 123,
      controlPlaneSystemTableGateway: {
        readRows: async () => ({success: true, rows: []}),
        executeQuery: async () => ({success: true, changes: 1}),
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });
    const operation = repo.rowToOperation(makeRow({
      type: OperationType.REPLACE,
      status: TEST_CREATING_STATUS,
      workflow_step: WORKFLOW_STEP.CREATING,
      updated_at: 200,
    }));

    const persisted = await repo.persistNewOperation(operation);
    const visibilityObservation = await repo.getOperationByIdVisibilityObservation(
      operation.operationId,
    );

    t.equal(
      persisted,
      true,
      'deferred authoritative confirmation should not unwind the persisted insert',
    );
    t.equal(
      visibilityObservation?.state,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'later single-operation reads should keep the owner-persisted transition visible',
    );
    t.equal(
      visibilityObservation?.operation?.workflowStep,
      WORKFLOW_STEP.CREATING,
      'the fallback visibility should preserve the owner-persisted workflow step',
    );
    t.equal(
      visibilityObservation?.deferredOutcome?.reasonCode,
      OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
      'the later read should preserve the canonical owner-persisted deferred reason',
    );
    t.equal(
      visibilityObservation?.deferredOutcome?.source,
      OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
      'the later read should preserve the owner-persisted empty-read source',
    );
  },
);

test(
  'persistOperationUpdate keeps a deferred owner-persisted transition visible ' +
    'to later entity observations when authoritative rows stay on an older step',
  async (t) => {
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      authoritativeVisibilityRetryDelayMs: 123,
      controlPlaneSystemTableGateway: {
        readRows: async () => ({
          success: true,
          rows: [
            makeRow({
              type: OperationType.REPLACE,
              status: TEST_CREATING_STATUS,
              workflow_step: WORKFLOW_STEP.CREATING,
              updated_at: 150,
            }),
          ],
        }),
        executeQuery: async () => ({success: true, changes: 1}),
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });
    const operation = repo.rowToOperation(makeRow({
      type: OperationType.REPLACE,
      status: 'active',
      workflow_step: WORKFLOW_STEP.ACTIVE,
      updated_at: 200,
    }));

    const persisted = await repo.persistOperationUpdate(operation);
    const observation = await repo.getOperationsByEntityAuthoritativeObservation(
      TEST_ENTITY_TYPE,
      TEST_PARTITION_ID,
    );

    t.equal(
      persisted,
      true,
      'deferred authoritative confirmation should not unwind the persisted update',
    );
    t.equal(
      observation?.state,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'later entity observations should keep the owner-persisted transition visible',
    );
    t.same(
      observation?.operations?.map((entry) => entry.workflowStep),
      [WORKFLOW_STEP.ACTIVE],
      'the entity observation should project the newer owner-persisted workflow step',
    );
  },
);

test(
  'getIncompleteOperationVisibilityObservation merges cache-visible and ' +
    'authoritative incomplete operations through the repository-owned ' +
    'visibility contract',
  async (t) => {
    let readCalls = 0;
    const cachedRow = makeRow({
      operation_id: 'op-incomplete-cached',
      workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: 100,
    });
    const authoritativeCachedRow = makeRow({
      operation_id: 'op-incomplete-cached',
      workflow_step: WORKFLOW_STEP.SYNCING,
      updated_at: 200,
    });
    const authoritativeNewRow = makeRow({
      operation_id: 'op-incomplete-authoritative',
      replica_id: 'partition-1-r2',
      target_node_id: 'node-3',
      workflow_step: WORKFLOW_STEP.CREATING,
      updated_at: 300,
    });
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: true,
            rows: [authoritativeCachedRow, authoritativeNewRow],
          };
        },
      },
      systemTableCache: {
        get(tableName, key) {
          return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
            key === cachedRow.operation_id ?
            cachedRow :
            null;
        },
        getAll() {
          return [cachedRow];
        },
        filter(_tableName, predicate) {
          return [cachedRow].filter(predicate);
        },
      },
    });

    const observation = await repo.getIncompleteOperationVisibilityObservation({
      cachedOperations: [repo.rowToOperation(cachedRow)],
      visibilitySupplementMode:
        INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.AUTHORITATIVE_SUPPLEMENT,
    });

    t.equal(
      readCalls,
      1,
      'repository-owned incomplete visibility should still perform one authoritative owner read when cache already sees in-flight work',
    );
    t.equal(
      observation?.state,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'repository-owned incomplete visibility should stay present once either visibility source sees in-flight operations',
    );
    t.same(
      observation?.operations.map((operation) => operation.operationId),
      ['op-incomplete-cached', 'op-incomplete-authoritative'],
      'repository-owned incomplete visibility should surface the merged operation cohort',
    );
    t.equal(
      observation?.operations?.[0]?.workflowStep,
      WORKFLOW_STEP.SYNCING,
      'authoritative visibility should win when cache and owner rows describe the same operation',
    );
  },
);

test(
  'getIncompleteOperationVisibilityObservation preserves cache-preferred ' +
    'semantics when provided cache-visible work is already present',
  async (t) => {
    let readCalls = 0;
    const cachedRow = makeRow({
      operation_id: 'op-cache-preferred',
      workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: 100,
    });
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readRows: async () => {
          readCalls += 1;
          return {
            success: true,
            rows: [makeRow({operation_id: 'op-authoritative-only'})],
          };
        },
      },
      systemTableCache: {
        get(tableName, key) {
          return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
            key === cachedRow.operation_id ?
            cachedRow :
            null;
        },
        getAll() {
          return [cachedRow];
        },
        filter(_tableName, predicate) {
          return [cachedRow].filter(predicate);
        },
      },
    });

    const observation = await repo.getIncompleteOperationVisibilityObservation({
      cachedOperations: [repo.rowToOperation(cachedRow)],
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
    });

    t.equal(
      readCalls,
      0,
      'cache-preferred incomplete visibility must not add owner-RPC pressure when the cache already sees in-flight work',
    );
    t.equal(
      observation?.state,
      INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT,
      'cache-preferred incomplete visibility should stay present from the cache-backed observation',
    );
    t.same(
      observation?.operations.map((operation) => operation.operationId),
      ['op-cache-preferred'],
      'cache-preferred incomplete visibility should preserve the cache-backed operation cohort',
    );
  },
);

test('queryIncompleteOperations retries retryable authoritative read failures', async (t) => {
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
    visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
  });

  t.equal(
    operations.length,
    1,
    'authoritative incomplete-operation reads should recover after bounded retry',
  );
  t.equal(
    readCalls,
    3,
    'authoritative incomplete-operation reads should retry until one read succeeds',
  );
  t.equal(
    waitCalls.length,
    2,
    'authoritative incomplete-operation reads should wait between retryable failures',
  );
});

test(
  'queryIncompleteOperations uses the cache-preferred visibility read ' +
    'contract when the cache observation is empty',
  async (t) => {
    const capturedReads = [];
    const repo = createTestRepository({
      controlPlaneSystemTableGateway: {
        readAuthoritativeRows: async (tableName, sql, params, options) => {
          capturedReads.push({tableName, sql, params, options});
          return {
            success: true,
            rows: [
              makeRow({
                type: OperationType.REPLACE,
                partition_id: 'control_plane_publications-p1',
                entity_id: 'control_plane_publications-p1',
                workflow_step: WORKFLOW_STEP.ACTIVE,
                status: 'active',
                source_node_id: 'node-a',
                target_node_id: TEST_NODE_ID,
              }),
            ],
          };
        },
      },
      systemTableCache: {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      },
    });

    const operations = await repo.queryIncompleteOperations();

    t.equal(
      operations.length,
      1,
      'empty cache visibility should still recover the routed authoritative operation',
    );
    t.equal(
      capturedReads.length,
      1,
      'empty cache visibility should issue one authoritative gateway read',
    );
    t.equal(
      capturedReads[0]?.options?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'empty cache visibility should prefer owner RPC with SQL fallback',
    );
  },
);

test(
  'buildReplicaOperationReadParticipationFailure evaluates owner reads ' +
    'against control-plane recovery readiness',
  async (t) => {
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

    const participationFailure = repo.buildReplicaOperationReadParticipationFailure();

    t.equal(
      participationFailure,
      null,
      'eligible recovery participation should not synthesize a failure',
    );
    t.equal(participationCalls.length, 1, 'owner-read readiness should be evaluated once');
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
  },
);

test(
  'queryIncompleteOperations ignores non-transport participation blocks for ' +
    'owner-local SQL reads',
  async (t) => {
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
            reasonCodes: [CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING],
            deferRetry: false,
            retryAfterMs: null,
            errorCode: 'CONTROL_PLANE_PARTICIPATION_BLOCKED',
            error: 'missing node row',
          };
        },
      },
    });

    const operations = await repo.queryIncompleteOperations();

    t.same(
      operations,
      [],
      'owner read should still fail closed to empty results when SQL sees no rows',
    );
    t.equal(
      readCalls,
      1,
      'non-transport readiness blocks should not suppress owner-local SQL reads',
    );
  },
);

// ── isOperationTerminal ─────────────────────────────────────────

test('isOperationTerminal returns true for terminal workflow step', async (t) => {
  const repo = createTestRepository();
  const op = {
    type: OperationType.ADD,
    workflowStep: WORKFLOW_STEP.ACTIVE,
  };
  t.ok(repo.isOperationTerminal(op));
});

test('isOperationTerminal returns false for active workflow step', async (t) => {
  const repo = createTestRepository();
  const op = {
    type: OperationType.ADD,
    workflowStep: WORKFLOW_STEP.CREATING,
  };
  t.notOk(repo.isOperationTerminal(op));
});

test('isOperationTerminal falls back to type-aware status for raw rows', async (t) => {
  const repo = createTestRepository();
  t.ok(
    repo.isOperationTerminal({
      type: OperationType.ADD,
      status: TEST_ACTIVE_STATUS,
    }),
    'ADD active should be terminal',
  );
  t.ok(
    repo.isOperationTerminal({
      type: OperationType.REMOVE,
      status: TEST_REMOVED_STATUS,
    }),
    'REMOVE removed should be terminal',
  );
  t.ok(
    repo.isOperationTerminal({
      type: OperationType.REPLACE,
      status: TEST_REMOVED_STATUS,
    }),
    'REPLACE removed should be terminal',
  );
  t.ok(
    repo.isOperationTerminal({
      status: TEST_FAILED_STATUS,
    }),
    'failed should remain terminal even when the raw row type is unavailable',
  );
  t.notOk(
    repo.isOperationTerminal({
      status: TEST_ACTIVE_STATUS,
    }),
    'active without an operation type should not be treated as terminal',
  );
  t.notOk(
    repo.isOperationTerminal({
      status: TEST_REMOVED_STATUS,
    }),
    'removed without an operation type should not be treated as terminal',
  );
});

test('isOperationTerminal returns false for null', async (t) => {
  const repo = createTestRepository();
  t.notOk(repo.isOperationTerminal(null));
});

// ── resolveOperationOwnerNodeId ─────────────────────────────────

test('resolveOperationOwnerNodeId prefers sourceNodeId', async (t) => {
  const repo = createTestRepository();
  const op = {
    sourceNodeId: 'src-node',
    targetNodeId: 'tgt-node',
  };
  t.equal(repo.resolveOperationOwnerNodeId(op), 'src-node');
});

test('resolveOperationOwnerNodeId falls back to targetNodeId', async (t) => {
  const repo = createTestRepository();
  const op = {targetNodeId: 'tgt-node'};
  t.equal(repo.resolveOperationOwnerNodeId(op), 'tgt-node');
});

test('resolveOperationOwnerNodeId accepts raw row fields', async (t) => {
  const repo = createTestRepository();
  const row = {source_node_id: 'raw-src'};
  t.equal(repo.resolveOperationOwnerNodeId(row), 'raw-src');
});

test('resolveOperationOwnerNodeId keeps critical REPLACE ACTIVE on target owner', async (t) => {
  const repo = createTestRepository();
  const operation = {
    type: OperationType.REPLACE,
    partitionId: 'control_plane_publications-p1',
    sourceNodeId: 'src-node',
    targetNodeId: 'tgt-node',
    workflowStep: WORKFLOW_STEP.ACTIVE,
  };
  t.equal(repo.resolveOperationOwnerNodeId(operation), 'tgt-node');
});

test('resolveOperationOwnerNodeId keeps critical REPLACE PENDING on target owner', async (t) => {
  const repo = createTestRepository();
  const operation = {
    type: OperationType.REPLACE,
    partitionId: 'control_plane_publications-p1',
    sourceNodeId: 'src-node',
    targetNodeId: 'tgt-node',
    workflowStep: WORKFLOW_STEP.PENDING,
  };
  t.equal(repo.resolveOperationOwnerNodeId(operation), 'tgt-node');
});

test('resolveOperationOwnerNodeId keeps system-table REPLACE CREATING on target owner', async (t) => {
  const repo = createTestRepository();
  const operation = {
    type: OperationType.REPLACE,
    partitionId: TEST_NON_PRIORITY_SYSTEM_PARTITION_ID,
    sourceNodeId: TEST_SOURCE_OWNER_NODE_ID,
    targetNodeId: TEST_TARGET_OWNER_NODE_ID,
    workflowStep: WORKFLOW_STEP.CREATING,
  };
  t.equal(
    repo.resolveOperationOwnerNodeId(operation),
    TEST_TARGET_OWNER_NODE_ID,
  );
});

test('resolveOperationOwnerNodeId keeps user REPLACE CREATING on source owner', async (t) => {
  const repo = createTestRepository();
  const operation = {
    type: OperationType.REPLACE,
    partitionId: TEST_USER_REPLACE_PARTITION_ID,
    sourceNodeId: TEST_SOURCE_OWNER_NODE_ID,
    targetNodeId: TEST_TARGET_OWNER_NODE_ID,
    workflowStep: WORKFLOW_STEP.CREATING,
  };
  t.equal(
    repo.resolveOperationOwnerNodeId(operation),
    TEST_SOURCE_OWNER_NODE_ID,
  );
});

// ── isOperationLocallyOwned ─────────────────────────────────────

test('isOperationLocallyOwned returns true for local node', async (t) => {
  const repo = createTestRepository();
  const op = {sourceNodeId: TEST_NODE_ID};
  t.ok(repo.isOperationLocallyOwned(op));
});

test('isOperationLocallyOwned returns false for remote node', async (t) => {
  const repo = createTestRepository();
  const op = {sourceNodeId: 'other-node'};
  t.notOk(repo.isOperationLocallyOwned(op));
});

// ── REPLACE operation helpers ────────────────────────────────────

test('getReplaceSourceReplicaId extracts from stepsHistory', async (t) => {
  const repo = createTestRepository();
  const op = {
    type: OperationType.REPLACE,
    stepsHistory: [{sourceReplicaId: 'src-r1'}],
  };
  t.equal(repo.getReplaceSourceReplicaId(op), 'src-r1');
});

test('getReplaceSourceReplicaId returns null for ADD', async (t) => {
  const repo = createTestRepository();
  const op = {type: OperationType.ADD};
  t.equal(repo.getReplaceSourceReplicaId(op), null);
});

test('isReplaceRemovePhase detects REPLACE ACTIVE', async (t) => {
  const repo = createTestRepository();
  t.ok(
    repo.isReplaceRemovePhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    }),
  );
  t.notOk(
    repo.isReplaceRemovePhase({
      type: OperationType.ADD,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    }),
  );
});

test('isReplaceRemoveDispatchPhase includes STOPPING replay for REPLACE', async (t) => {
  const repo = createTestRepository();
  t.ok(
    repo.isReplaceRemoveDispatchPhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    }),
  );
  t.ok(
    repo.isReplaceRemoveDispatchPhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.STOPPING,
    }),
  );
  t.notOk(
    repo.isReplaceRemoveDispatchPhase({
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.SYNCING,
    }),
  );
  t.notOk(
    repo.isReplaceRemoveDispatchPhase({
      type: OperationType.ADD,
      workflowStep: WORKFLOW_STEP.STOPPING,
    }),
  );
});

test('getReplaceTargetReplicaId returns replicaId when different from source', async (t) => {
  const repo = createTestRepository();
  const op = {
    type: OperationType.REPLACE,
    replicaId: 'tgt-r2',
    sourceReplicaId: 'src-r1',
    stepsHistory: [{sourceReplicaId: 'src-r1'}],
  };
  t.equal(repo.getReplaceTargetReplicaId(op), 'tgt-r2');
});

test('queryIncompleteOperations requests bounded local replica fallback for authoritative replica_operations reads', async (t) => {
  const authoritativeReadCalls = [];
  const repo = createTestRepository({
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    controlPlaneSystemTableGateway: {
      readRows: async (_tableName, _sql, _params, options = {}) => {
        authoritativeReadCalls.push(options);
        if (
          options?.replicaFallbackConsistency !==
          LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA
        ) {
          return {success: false, rows: [], error: 'missing_replica_fallback'};
        }
        return {
          success: true,
          rows: [
            makeRow({
              status: TEST_PENDING_STATUS,
              workflow_step: WORKFLOW_STEP.PENDING,
            }),
          ],
        };
      },
    },
  });

  const operations = await repo.queryIncompleteOperations();

  t.equal(
    operations.length,
    1,
    'authoritative incomplete-operation reads should remain visible through the bounded local replica fallback lane',
  );
  t.equal(
    authoritativeReadCalls[0]?.replicaFallbackConsistency,
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
    'replica_operations owner reads should request bounded local replica fallback',
  );
  t.equal(
    authoritativeReadCalls[0]?.coalescingKey,
    TEST_REPLICA_OPERATION_OWNER_READ_COALESCING_KEY,
    'incomplete-operation owner reads should coalesce by owner node',
  );
  t.equal(
    authoritativeReadCalls[0]?.deliverySource,
    TEST_REPLICA_OPERATION_OWNER_READ_DELIVERY_SOURCE,
    'incomplete-operation owner reads should use an owner-scoped delivery source',
  );
});

test('persistOperationUpdate requests bounded local replica fallback for authoritative replica_operations confirmation', async (t) => {
  const authoritativeReadCalls = [];
  const confirmedUpdatedAt = 200;
  const repo = createTestRepository({
    authoritativeVisibilityTimeoutMs: 0,
    controlPlaneSystemTableGateway: {
      executeQuery: async () => ({success: true, changes: 1}),
      readRows: async (_tableName, _sql, _params, options = {}) => {
        authoritativeReadCalls.push(options);
        if (
          options?.replicaFallbackConsistency !==
          LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA
        ) {
          return {success: true, rows: []};
        }
        return {
          success: true,
          rows: [
            makeRow({
              status: 'active',
              workflow_step: WORKFLOW_STEP.ACTIVE,
              updated_at: confirmedUpdatedAt,
            }),
          ],
        };
      },
    },
  });
  const operation = repo.rowToOperation(
    makeRow({
      status: 'active',
      workflow_step: WORKFLOW_STEP.ACTIVE,
      updated_at: confirmedUpdatedAt,
    }),
  );

  const persisted = await repo.persistOperationUpdate(operation);

  t.equal(
    persisted,
    true,
    'authoritative confirmation should succeed once the shared replica fallback contract exposes the persisted row',
  );
  t.equal(
    authoritativeReadCalls[0]?.replicaFallbackConsistency,
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
    'persistence confirmation should reuse the bounded local replica fallback contract',
  );
});


registerReplicaOperationRepositoryTailTests({
  test,
  createTestRepository,
  makeRow,
  TEST_NODE_ID,
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_REPLICA_ID,
  TEST_TARGET_NODE_ID,
  TEST_ENTITY_TYPE,
  TEST_CREATING_STATUS,
  TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
  TEST_PENDING_STATUS,
  VISIBILITY_CONFIRMATION_STATE_DEFERRED,
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_FAILURE_SOURCE,
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_VISIBILITY_EMPTY_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_VISIBILITY_STALE_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
  ERRORS,
  WORKFLOW_STEP,
  SERVICE_TYPE,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  PRIORITY_RECOVERY_COMPLETION_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  OperationType,
  ReplicaOperationRepository,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  TERMINAL_STATUSES,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  REBALANCE_COORDINATOR_EVENT,
  PARTITION_SERVICE_ERROR_MSG,
  createTestCoordinator,
});
