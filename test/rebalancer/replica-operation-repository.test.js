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
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
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
import {registerReplicaOperationRepositoryDeferredVisibilityTests} from './replica-operation-repository-deferred-visibility-test-cases.js';
import {registerReplicaOperationRepositoryIncompleteVisibilityTests} from './replica-operation-repository-incomplete-visibility-test-cases.js';
import {registerReplicaOperationRepositoryTailTests} from './replica-operation-repository-tail-test-cases.js';

const TEST_NODE_ID = 'test-node-1';
const TEST_OPERATION_ID = 'op-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_REPLICA_ID = 'partition-1-r1';
const TEST_TARGET_NODE_ID = 'node-2';
const TEST_SOURCE_OWNER_NODE_ID = 'src-node';
const TEST_TARGET_OWNER_NODE_ID = 'tgt-node';
const TEST_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
const TEST_PRIORITY_REPLICA_ID = 'sql_write_operations-p1-r4';
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
const TEST_REPLICA_OPERATION_MUTATION_REPLACE_PENDING_KEY =
  TEST_REPLICA_OPERATION_MUTATION_COALESCING_KEY;
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

function makePriorityOperation(overrides = {}) {
  return {
    operationId: 'priority-op-1',
    type: OperationType.ADD,
    partitionId: TEST_PRIORITY_PARTITION_ID,
    replicaId: TEST_PRIORITY_REPLICA_ID,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: 'in_progress',
    workflowStep: WORKFLOW_STEP.SENDING,
    createdAt: 1,
    updatedAt: 2,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    entityType: TEST_ENTITY_TYPE,
    entityId: TEST_PRIORITY_PARTITION_ID,
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
    t.equal(
      queryOptions.replacePendingKey,
      TEST_REPLICA_OPERATION_MUTATION_REPLACE_PENDING_KEY,
      'replica operation mutations should replace queued routed writes by operation id',
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

registerReplicaOperationRepositoryDeferredVisibilityTests({
  test,
  createTestRepository,
  makeRow,
  TEST_NODE_ID,
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_ENTITY_TYPE,
  TEST_CREATING_STATUS,
  TEST_CACHE_BACKED_VISIBILITY_OPERATION_ID,
  TEST_PENDING_STATUS,
  TEST_REPLICA_OPERATION_READ_COALESCING_KEY,
  TEST_REPLICA_OPERATION_READ_DELIVERY_SOURCE,
  OWNER_PERSISTED_TRANSITION_VISIBILITY_EMPTY_READ_SOURCE,
  OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION_REASON,
  WORKFLOW_STEP,
  SYSTEM_TABLE_NAME,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  OperationType,
  TERMINAL_STATUSES,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
});

registerReplicaOperationRepositoryIncompleteVisibilityTests({
  test,
  createTestRepository,
  makeRow,
  TEST_NODE_ID,
  WORKFLOW_STEP,
  SYSTEM_TABLE_NAME,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  OperationType,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
});

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

// ── applyLocalPriorityOperationProgressRow ──────────────────────

test('applyLocalPriorityOperationProgressRow ignores read-only cache seed boundary', async (t) => {
  const readOnlyCache = createReadOnlyCache({
    get: () => null,
    getAll: () => [],
    filter: () => [],
  });
  const repo = createTestRepository({systemTableCache: readOnlyCache});

  const applied = repo.applyLocalPriorityOperationProgressRow(
    makePriorityOperation(),
  );

  t.equal(
    applied,
    false,
    'read-only cache instances should leave the best-effort local seed unapplied',
  );
});

test('applyLocalPriorityOperationProgressRow rethrows unexpected cache failures', async (t) => {
  const repo = createTestRepository({
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
      applySystemTableChange() {
        throw new Error('cache backend failed');
      },
    },
  });

  t.throws(
    () => repo.applyLocalPriorityOperationProgressRow(makePriorityOperation()),
    /cache backend failed/,
    'unexpected cache failures should not be hidden',
  );
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

test('zero-change operation insert collision confirms through the ledger leader',
  async (t) => {
    const authoritativeReadCalls = [];
    const row = makeRow({
      created_at: 100,
      updated_at: 100,
    });
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      controlPlaneSystemTableGateway: {
        executeQuery: async () => ({success: true, changes: 0}),
        readRows: async (_tableName, _sql, _params, options = {}) => {
          authoritativeReadCalls.push(options);
          return {
            success: true,
            rows: options.preferOwnerRpcReadLeader === true ? [row] : [],
          };
        },
      },
    });
    const operation = repo.rowToOperation(row);

    const persisted = await repo.persistNewOperation(operation);

    t.equal(
      persisted,
      true,
      'a matching row on the canonical ledger leader proves the collision',
    );
    t.equal(
      authoritativeReadCalls.length,
      1,
      'collision recovery should perform one strict authoritative read',
    );
    t.equal(
      authoritativeReadCalls[0]?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'collision recovery should require the owner-RPC authority lane',
    );
    t.equal(
      authoritativeReadCalls[0]?.preferOwnerRpcReadLeader,
      true,
      'collision recovery should pin verification to the ledger leader',
    );
  });

test('zero-change operation insert collision fails when the ledger leader has no row',
  async (t) => {
    const authoritativeReadCalls = [];
    const row = makeRow({
      created_at: 100,
      updated_at: 100,
    });
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      controlPlaneSystemTableGateway: {
        executeQuery: async () => ({success: true, changes: 0}),
        readRows: async (_tableName, _sql, _params, options = {}) => {
          authoritativeReadCalls.push(options);
          return {success: true, rows: []};
        },
      },
    });

    await t.rejects(
      repo.persistNewOperation(repo.rowToOperation(row)),
      /Authoritative replica operation not confirmed/u,
      'an unconfirmed collision must remain fail-closed',
    );
    t.equal(
      authoritativeReadCalls[0]?.preferOwnerRpcReadLeader,
      true,
      'the negative proof should still query the canonical ledger leader',
    );
  });

test('zero-change operation insert collision rejects mismatched leader content',
  async (t) => {
    const expectedRow = makeRow({
      created_at: 100,
      updated_at: 100,
    });
    const mismatchedRow = makeRow({
      created_at: 100,
      updated_at: 101,
      status: 'active',
      workflow_step: WORKFLOW_STEP.ACTIVE,
    });
    const repo = createTestRepository({
      authoritativeVisibilityTimeoutMs: 0,
      controlPlaneSystemTableGateway: {
        executeQuery: async () => ({success: true, changes: 0}),
        readRows: async () => ({success: true, rows: [mismatchedRow]}),
      },
    });

    await t.rejects(
      repo.persistNewOperation(repo.rowToOperation(expectedRow)),
      /Authoritative replica operation not confirmed/u,
      'leader visibility is insufficient when the durable content differs',
    );
  });


test('CL-017(b): zero-row update with missing authoritative row re-inserts the owner copy', async (t) => {
  const executedSql = [];
  const repo = createTestRepository({
    authoritativeVisibilityTimeoutMs: 0,
    controlPlaneSystemTableGateway: {
      executeQuery: async (sql) => {
        executedSql.push(sql);
        if (sql.trim().toUpperCase().startsWith('INSERT')) {
          return {success: true, changes: 1};
        }
        // The UPDATE commits but affects zero rows — the row is missing
        // from the partition state that applied the write (the post-churn
        // divergence witness).
        return {success: true, changes: 0};
      },
      readRows: async () => ({success: true, rows: []}),
    },
  });
  const operation = repo.rowToOperation(
    makeRow({
      status: 'in_progress',
      workflow_step: WORKFLOW_STEP.SENDING,
    }),
  );

  const persisted = await repo.persistOperationUpdate(operation, {
    expectedWorkflowStep: WORKFLOW_STEP.CREATING,
  });

  t.equal(
    persisted,
    true,
    'divergence path recovers by re-inserting instead of failing',
  );
  t.ok(
    executedSql.some((sql) => sql.trim().toUpperCase().startsWith('INSERT')),
    'owner copy re-inserted after the zero-row update',
  );
});

test('CL-017(b): zero-row update with VISIBLE authoritative row does not re-insert', async (t) => {
  const executedSql = [];
  const repo = createTestRepository({
    authoritativeVisibilityTimeoutMs: 0,
    controlPlaneSystemTableGateway: {
      executeQuery: async (sql) => {
        executedSql.push(sql);
        return {success: true, changes: 0};
      },
      readRows: async () => ({
        success: true,
        rows: [
          makeRow({
            status: 'in_progress',
            workflow_step: WORKFLOW_STEP.SENDING,
          }),
        ],
      }),
    },
  });
  const operation = repo.rowToOperation(
    makeRow({
      status: 'in_progress',
      workflow_step: WORKFLOW_STEP.SENDING,
    }),
  );

  const persisted = await repo.persistOperationUpdate(operation, {
    expectedWorkflowStep: WORKFLOW_STEP.CREATING,
  });

  t.equal(persisted, true, 'visible row satisfies the transition');
  t.ok(
    !executedSql.some((sql) =>
      sql.trim().toUpperCase().startsWith('INSERT'),
    ),
    'no re-insert when the authoritative row is visible',
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
