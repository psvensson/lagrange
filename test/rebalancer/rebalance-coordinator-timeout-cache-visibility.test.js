import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {createCoordinatorSqlStore, withExecutorMutationPort} from './test-helpers.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  TIMEOUT_BUDGET_DEFAULT,
} from '../../src/control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  buildTransactionCoordinator,
  createCommittedTimeoutLedger,
  createCoordinator,
  createTimeoutSweepCoordinator,
  createTimeoutVisibilityCache,
} from './rebalance-coordinator-timeout-cache-visibility-fixture.js';
import {
  registerRebalanceCoordinatorTimeoutCacheVisibilityReadStateTests,
} from './rebalance-coordinator-timeout-cache-visibility-read-state-test-cases.js';
import {registerRebalanceCoordinatorTimeoutCacheVisibilityTailTests} from './rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js';

const PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE =
  'operation_visibility_deferred';
const EMERGENCY_PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const PRIORITY_PENDING_EXHAUSTED_OPERATION_BUDGET_OVERRUN_MS = 1000;
const STALE_PRIORITY_PENDING_CACHE_ACTIVE_TIMEOUT_RECONCILE_TEST_NAME =
  'checkTimeouts reconciles stale priority PENDING from cached active target without unsafe trim';

function buildStoppingRemoval(operationId, staleUpdatedAtMs) {
  return {
    operation_id: operationId,
    type: 'REMOVE',
    partition_id: 'partition-1',
    entity_type: 'partition',
    entity_id: 'partition-1',
    replica_id: 'partition-1-r1',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: ReplicaStatus.REMOVING,
    workflow_step: 'STOPPING',
    created_at: staleUpdatedAtMs - 5000,
    updated_at: staleUpdatedAtMs,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([
      {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
      {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
      {step: 'STOPPING', timestamp: staleUpdatedAtMs - 800},
    ]),
  };
}

test('checkTimeouts settles STOPPING from confirmed source absence without cache waits',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const timedOutOperationRow = buildStoppingRemoval('op-stopping-timeout', staleUpdatedAtMs);

    const store = createCoordinatorSqlStore({
      getAll: (table) => table === 'replica_operations' ? [timedOutOperationRow] : [],
      upsert: (_table, row) => Object.assign(timedOutOperationRow, row),
    });
    const sqlQueryEngine = {executeQuery: async (sql, params) => store.execute(sql, params)};

    const coordinator = createTimeoutSweepCoordinator({
      nodeId: 'node-1',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        refreshAuthoritativeCacheRow: async () => true,
      },
      sqlQueryEngine,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
      store.suspend();
    }

    t.equal(timedOutOperationRow.status, 'removed');
    t.equal(timedOutOperationRow.workflow_step, 'REMOVED');
  });

test('checkTimeouts retries a stale STOPPING operation after strict owner reads recover',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const authoritativeReadCalls = [];
    const timedOutOperationRow =
      buildStoppingRemoval('op-owner-rpc-fallback-timeout', staleUpdatedAtMs);

    const store = createCoordinatorSqlStore({
      getAll: (table) => table === 'replica_operations' ? [timedOutOperationRow] : [],
      upsert: (_table, row) => Object.assign(timedOutOperationRow, row),
    });
    let ownerRpcAvailable = false;
    let terminalWrites = 0;
    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options = {},
      ) {
        authoritativeReadCalls.push({
          tableName,
          sql: String(sql),
          params: [...(Array.isArray(params) ? params : [])],
          options: {...options},
        });
        if (!ownerRpcAvailable && tableName === 'replica_operations' &&
            options.authoritativeReadMode ===
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
          return {
            success: false,
            error: 'owner-rpc-read-failed',
            rows: [],
          };
        }
        return store.execute(sql, params);
      },
    };

    const controlPlaneSystemTableGateway = withExecutorMutationPort({
      async readRows(tableName, sql, params = [], options = {}) {
        return cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        );
      },
      async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
        return cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        );
      },
      async executeQuery(sql, params = []) {
        if (sql.includes('UPDATE replica_operations') && sql.includes('completed_at IS NULL')) {
          terminalWrites += 1;
        }
        return store.execute(sql, params);
      },
    });

    const coordinator = createTimeoutSweepCoordinator({
      nodeId: 'node-1',
      systemTableCache: {
        get(tableName, key) {
          if (tableName !== 'replica_operations') {
            return null;
          }
          return key === timedOutOperationRow.operation_id ?
            timedOutOperationRow :
            null;
        },
        getAll(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [timedOutOperationRow];
        },
      },
      cdcIntegrationService,
      controlPlaneSystemTableGateway,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
      t.equal(timedOutOperationRow.workflow_step, 'STOPPING',
        'local discovery cannot settle terminal state during strict owner unavailability');
      t.equal(terminalWrites, 0, 'the owner refuses before the terminal CAS');
      ownerRpcAvailable = true;
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
      store.suspend();
    }

    t.equal(
      timedOutOperationRow.workflow_step,
      'REMOVED',
      'the retained removal settles once owner reads recover',
    );
    t.ok(
      authoritativeReadCalls.some((call) =>
        call.tableName === 'replica_operations' &&
        call.options.authoritativeReadMode !== 'owner_rpc_required',
      ),
      'timeout reconciliation should query authoritative rows without requiring strict owner-rpc reads',
    );
  });

test('checkTimeouts preserves cache-preferred incomplete visibility when the ' +
  'local cache already exposes in-flight work', async (t) => {
  const nowMs = Date.now();
  const staleUpdatedAtMs = nowMs - 70000;
  const cacheVisibleOperationRow = {
    operation_id: 'op-cache-visible-syncing',
    type: 'ADD',
    partition_id: 'partition-cache-visible',
    replica_id: 'partition-cache-visible-r2',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: staleUpdatedAtMs - 5000,
    updated_at: staleUpdatedAtMs,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: 'partition',
    entity_id: 'partition-cache-visible',
  };
  const authoritativeOnlyOperationRow = {
    operation_id: 'op-authoritative-only-syncing',
    type: 'ADD',
    partition_id: 'partition-authoritative-only',
    replica_id: 'partition-authoritative-only-r2',
    source_node_id: 'node-1',
    target_node_id: 'node-3',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: staleUpdatedAtMs - 5000,
    updated_at: staleUpdatedAtMs,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: 'partition',
    entity_id: 'partition-authoritative-only',
  };
  const operationRows = new Map([
    [cacheVisibleOperationRow.operation_id, cacheVisibleOperationRow],
    [authoritativeOnlyOperationRow.operation_id, authoritativeOnlyOperationRow],
  ]);
  const serviceRowsByReplicaId = new Map([
    [cacheVisibleOperationRow.replica_id, {
      service_id: cacheVisibleOperationRow.replica_id,
      replica_id: cacheVisibleOperationRow.replica_id,
      partition_id: cacheVisibleOperationRow.partition_id,
      node_id: cacheVisibleOperationRow.target_node_id,
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
    }],
    [authoritativeOnlyOperationRow.replica_id, {
      service_id: authoritativeOnlyOperationRow.replica_id,
      replica_id: authoritativeOnlyOperationRow.replica_id,
      partition_id: authoritativeOnlyOperationRow.partition_id,
      node_id: authoritativeOnlyOperationRow.target_node_id,
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
    }],
  ]);
  const authoritativeReplicaOperationReads = [];
  const store = createCoordinatorSqlStore({
    getAll(table) {
      if (table === 'replica_operations') return [...operationRows.values()];
      if (table === 'services') return [...serviceRowsByReplicaId.values()];
      return [];
    },
    upsert(_table, row) {
      Object.assign(operationRows.get(row.operation_id), row);
    },
  });
  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      if (sql.includes('FROM replica_operations')) {
        authoritativeReplicaOperationReads.push({sql, params: [...params]});
      }
      return store.execute(sql, params);
    },
  };

  const coordinator = createTimeoutSweepCoordinator({
    nodeId: 'node-1',
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === cacheVisibleOperationRow.operation_id ?
          cacheVisibleOperationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [cacheVisibleOperationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [cacheVisibleOperationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
    },
    sqlQueryEngine,
  });

  coordinator.initialize();
  try {
    await coordinator.checkTimeouts();
  } finally {
    await coordinator.shutdown();
    store.suspend();
  }

  t.equal(
    authoritativeReplicaOperationReads.some((entry) =>
      entry.sql.includes('source_node_id = ?') &&
      entry.sql.includes('target_node_id = ?'),
    ),
    false,
    'timeout reconciliation should not widen cache-visible work into a broad authoritative incomplete-operation read',
  );
  t.equal(cacheVisibleOperationRow.workflow_step, 'ACTIVE');
  t.equal(cacheVisibleOperationRow.status, 'active');
  t.equal(authoritativeOnlyOperationRow.workflow_step, 'SYNCING');
  t.equal(authoritativeOnlyOperationRow.status, 'syncing');
});

test('checkTimeouts applies bounded SYNCING timeout to priority control-plane partitions',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const prioritySyncingOperationRow = {
      operation_id: 'op-priority-syncing-timeout',
      type: 'REPLACE',
      partition_id: 'sql_write_operations-p1',
      entity_type: 'partition',
      entity_id: 'sql_write_operations-p1',
      source_replica_id: 'sql_write_operations-p1-r1',
      replica_id: 'sql_write_operations-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'syncing',
      workflow_step: 'SYNCING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1200},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 1100},
        {step: 'CREATING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SYNCING', timestamp: staleUpdatedAtMs - 900},
      ]),
    };

    const ledger = createCommittedTimeoutLedger(prioritySyncingOperationRow);
    const coordinator = createTimeoutSweepCoordinator({
      nodeId: 'node-2',
      systemTableCache: {
        get() {
          return null;
        },
      },
      ...ledger.options,
    });

    coordinator.initialize();
    let committed;
    try {
      await coordinator.checkTimeouts();
      committed = ledger.read();
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        ledger.close();
      }
    }

    t.same(ledger.terminalChanges, [1], 'exactly one guarded SQLite timeout commits');

    t.equal(
      committed.workflow_step,
      'FAILED',
      'priority control-plane SYNCING operations should time out within the bounded timeout window',
    );
    t.match(
      committed.error_message || '',
      /Timeout in SYNCING step/,
      'bounded SYNCING timeout failure should report the timed out step',
    );
  });

test('the timeout owner retains a stale operation while a deferred transition retry is armed',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const operationRow = {
      operation_id: 'op-deferred-transition-retry-timeout',
      type: 'ADD',
      partition_id: 'replica_operations-p1',
      entity_type: 'partition',
      entity_id: 'replica_operations-p1',
      replica_id: 'replica_operations-p1-r4',
      source_node_id: 'node-source',
      target_node_id: 'node-local',
      status: 'pending',
      workflow_step: 'PENDING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
      ]),
    };

    const ledger = createCommittedTimeoutLedger(operationRow);
    const coordinator = createCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
        getAll(tableName) {
          return tableName === 'replica_operations' ? [operationRow] : [];
        },
      },
      messageRouter: {
        async deliver() {
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {targetReplicaCount: 3, minReplicaCount: 3};
        },
      },
      ...ledger.options,
      enableTimeouts: false,
    });

    coordinator.initialize();
    let committed;
    try {
      const owner = coordinator.workflowOwner;
      const {operation} = await owner.repository.queryAuthoritativeOperationVisibilityObservation(
        operationRow.operation_id, {
          authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
          requireCompleteExactKey: true,
        });
      t.equal(operation.workflowStep, 'PENDING', 'complete owner RPC observes the retained step');
      t.ok(owner.deferTransitionRetry(operation.operationId, {
        deferRetry: true, retryAfterMs: 1000,
      }, {
        workflowStep: operation.workflowStep,
        updatedAt: operation.updatedAt, createdAt: operation.createdAt,
        partitionId: operation.partitionId, operationSnapshot: operation,
      }), 'the owner arms a real transition retry');
      t.ok(owner.hasActiveTransitionRetryGrace(operation.operationId));
      await owner.reconcileTimeoutOperation(operation, Date.now());
      committed = ledger.read();
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        ledger.close();
      }
    }

    t.ok(ledger.pointReads.some(({rows}) => rows[0]?.operation_id === operationRow.operation_id),
      'the timeout decision uses the exact durable operation with retry grace active');
    t.same(ledger.terminalChanges, [],
      'timeout reconciliation does not submit failure while the transition retry is armed');
    t.equal(
      committed.status,
      'pending',
      'the stale operation should remain pending until the deferred retry is allowed to run',
    );
    t.equal(
      committed.workflow_step,
      'PENDING',
      'timeout handling should preserve the current step while the deferred retry is active',
    );
    t.equal(
      (await coordinator.getStats()).operationsTimedOut,
      0,
      'deferred retry should suppress timeout accounting until the retry lane is exhausted',
    );
  });

test('checkTimeouts fails stale priority PENDING recovery operations once the dispatch budget is exhausted',
  async (t) => {
    const nowMs = Date.now();
    const staleCreatedAtMs =
      nowMs -
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS -
      PRIORITY_PENDING_EXHAUSTED_OPERATION_BUDGET_OVERRUN_MS;
    const staleUpdatedAtMs = nowMs - 65000;
    const operationRow = {
      operation_id: 'op-stale-priority-pending',
      type: 'REPLACE',
      partition_id: 'control_plane_publications-p1',
      entity_type: 'partition',
      entity_id: 'control_plane_publications-p1',
      source_replica_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: 'PENDING',
      created_at: staleCreatedAtMs,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
      ]),
    };
    let dispatchDeliveries = 0;

    const ledger = createCommittedTimeoutLedger(operationRow);
    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      messageRouter: {
        async deliver() {
          dispatchDeliveries += 1;
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              controlPlaneRecoveryEligible: true,
              repairEligible: true,
              serveEligible: true,
            },
          };
        },
        getPriorityRecoveryPlanningAnswerSync(nodeId) {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: Object.freeze(['node-1', 'node-2']),
            recoveryActiveNodeIds: Object.freeze(['node-1', 'node-2']),
            projectedServingNodeIds: Object.freeze(['node-1', 'node-2']),
            locallyEligibleNodeIds: Object.freeze(['node-1', 'node-2']),
            publishedMembershipIncludesTargetNode: nodeId === 'node-2',
            priorityPartitionSummary: Object.freeze({
              satisfied: false,
              requiredDistinctNodeCount: 2,
              missingPartitionIds: ['control_plane_publications-p1'],
            }),
          };
        },
        async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId) {
          return this.getPriorityRecoveryPlanningAnswerSync(nodeId);
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {targetReplicaCount: 3, minReplicaCount: 3};
        },
      },
      systemTableCache: {
        get() {
          return null;
        },
      },
      ...ledger.options,
      enableTimeouts: false,
    });

    coordinator.initialize();
    let committed;
    try {
      await coordinator.checkTimeouts();
      committed = ledger.read();
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        ledger.close();
      }
    }

    t.same(ledger.terminalChanges, [1], 'exactly one guarded SQLite timeout commits');

    t.equal(
      dispatchDeliveries,
      0,
      'stale timed-out priority recovery should not re-enter dispatch before being failed',
    );
    t.equal(
      committed.workflow_step,
      'FAILED',
      'timed-out priority recovery should become an explicit failed next action',
    );
    t.match(
      committed.error_message,
      /Timeout in PENDING step/i,
      'timeout failure should explain the exhausted dispatch budget',
    );
  });

test(STALE_PRIORITY_PENDING_CACHE_ACTIVE_TIMEOUT_RECONCILE_TEST_NAME,
  async (t) => {
    const TEST_OPERATION_ID =
      'op-timeout-reconcile-pending-cache-active-target';
    const TEST_OPERATION_TYPE_REPLACE = 'REPLACE';
    const TEST_PARTITION_ID = 'sql_transactions-p1';
    const TEST_REPLICA_ID = 'sql_transactions-p1-r4';
    const TEST_SOURCE_REPLICA_ID = 'sql_transactions-p1-r1';
    const TEST_SOURCE_NODE_ID = 'node-1';
    const TEST_TARGET_NODE_ID = 'node-4';
    const TEST_ENTITY_TYPE_PARTITION = 'partition';
    const TEST_WORKFLOW_STEP_PENDING = 'PENDING';
    const TEST_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
    const TEST_STATUS_PENDING = 'pending';
    const TEST_RAFT_ROLE_FOLLOWER = 'follower';
    const TEST_ADDRESS_SEPARATOR = '/';
    const TEST_STEP_STALE_MS = 65_000;
    const TEST_CREATED_LAG_MS = 5_000;
    const TEST_STEP_HISTORY_LAG_MS = 1_000;
    const TEST_MIN_REPLICA_COUNT = 3;
    const TEST_EMPTY_AFFECTED_ROW_COUNT = 0;
    const TEST_EMPTY_VALUE = null;
    const TEST_ASSERT_NO_TIMEOUT_FAILURE =
      'cache-visible active target should reconcile before timeout failure';
    const TEST_ASSERT_ACTIVE_STEP =
      'timeout reconciliation should advance the stale PENDING operation to ACTIVE';
    const TEST_ASSERT_NO_UNSAFE_TRIM =
      'source removal should wait while the over-target source row remains cache-visible';
    const TEST_ASSERT_AUTHORITATIVE_SERVICE_READS =
      'authoritative services reads should be attempted before cache fallback';
    const TEST_ASSERT_EMPTY_AUTHORITATIVE_SERVICE_ROWS =
      'authoritative services reads should not provide target progress';

    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - TEST_STEP_STALE_MS;
    const operationRow = {
      operation_id: TEST_OPERATION_ID,
      type: TEST_OPERATION_TYPE_REPLACE,
      partition_id: TEST_PARTITION_ID,
      replica_id: TEST_REPLICA_ID,
      source_node_id: TEST_SOURCE_NODE_ID,
      target_node_id: TEST_TARGET_NODE_ID,
      status: TEST_STATUS_PENDING,
      workflow_step: TEST_WORKFLOW_STEP_PENDING,
      created_at: staleUpdatedAtMs - TEST_CREATED_LAG_MS,
      updated_at: staleUpdatedAtMs,
      completed_at: TEST_EMPTY_VALUE,
      error_message: TEST_EMPTY_VALUE,
      steps_history: JSON.stringify([{
        step: TEST_WORKFLOW_STEP_PENDING,
        timestamp: staleUpdatedAtMs - TEST_STEP_HISTORY_LAG_MS,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      }]),
      entity_type: TEST_ENTITY_TYPE_PARTITION,
      entity_id: TEST_PARTITION_ID,
    };
    const targetServiceRow = {
      service_id: TEST_REPLICA_ID,
      replica_id: TEST_REPLICA_ID,
      partition_id: TEST_PARTITION_ID,
      node_id: TEST_TARGET_NODE_ID,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      created_at: staleUpdatedAtMs - 1000,
      state_entered_at: staleUpdatedAtMs,
      updated_at: staleUpdatedAtMs,
      address: [
        TEST_TARGET_NODE_ID,
        TEST_ENTITY_TYPE_PARTITION,
        TEST_REPLICA_ID,
      ].join(TEST_ADDRESS_SEPARATOR),
    };
    const sourceServiceRow = {
      service_id: TEST_SOURCE_REPLICA_ID,
      replica_id: TEST_SOURCE_REPLICA_ID,
      partition_id: TEST_PARTITION_ID,
      node_id: TEST_SOURCE_NODE_ID,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      created_at: staleUpdatedAtMs - 1000,
      state_entered_at: staleUpdatedAtMs,
      updated_at: staleUpdatedAtMs,
      address: [
        TEST_SOURCE_NODE_ID,
        TEST_ENTITY_TYPE_PARTITION,
        TEST_SOURCE_REPLICA_ID,
      ].join(TEST_ADDRESS_SEPARATOR),
    };
    const serviceRows = [sourceServiceRow, targetServiceRow];
    const authoritativeServiceReadResults = [];
    const dispatchedMessages = [];

    const cache = createTimeoutVisibilityCache(operationRow, serviceRows);
    let targetAuthority = null;
    const ledger = createCommittedTimeoutLedger(operationRow, {
      cache,
      readServices(sql, params) {
        const targetPointRead = params[0] === TEST_REPLICA_ID;
        const rows = targetPointRead && targetAuthority ? [targetAuthority] : [];
        authoritativeServiceReadResults.push({sql, params, rowCount: rows.length});
        return {success: true, rows, rowSetComplete: rows.length === 1};
      },
    });
    const coordinator = createCoordinator({
      nodeId: TEST_TARGET_NODE_ID,
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: cache,
      ...ledger.options,
      messageRouter: {
        async deliver(target, request) {
          dispatchedMessages.push({target, request});
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {targetReplicaCount: 3, minReplicaCount: TEST_MIN_REPLICA_COUNT};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const owner = coordinator.workflowOwner;
      const original = ledger.read();
      await coordinator.checkTimeouts();
      t.ok(ledger.pointReads.some(({rows}) => rows[0]?.operation_id === TEST_OPERATION_ID),
        'the sweep reads the exact committed operation before consulting services');
      t.ok(authoritativeServiceReadResults.length > TEST_EMPTY_AFFECTED_ROW_COUNT,
        TEST_ASSERT_AUTHORITATIVE_SERVICE_READS);
      t.ok(authoritativeServiceReadResults.every(({rowCount}) => rowCount === 0),
        TEST_ASSERT_EMPTY_AUTHORITATIVE_SERVICE_ROWS);
      t.same(ledger.read(), original, 'unavailable SERVICES retains the exact original operation');
      t.same(ledger.terminalChanges, [], TEST_ASSERT_NO_TIMEOUT_FAILURE);
      const retry = owner.observedProgressRetryTimerByOperationId.get(TEST_OPERATION_ID);
      t.ok(retry, 'the existing terminal-handoff wake stays armed');

      targetAuthority = {
        ...targetServiceRow,
        node_id: TEST_SOURCE_NODE_ID,
        address: [TEST_SOURCE_NODE_ID, TEST_ENTITY_TYPE_PARTITION, TEST_REPLICA_ID]
          .join(TEST_ADDRESS_SEPARATOR),
        updated_at: nowMs,
      };
      await coordinator.checkTimeouts();
      t.same(ledger.read(), original, 'an ACTIVE row belonging to another host is inconclusive');
      t.same(ledger.terminalChanges, [], 'wrong target authority cannot terminalize the operation');

      targetAuthority = {...targetServiceRow, updated_at: nowMs + 1};
      await coordinator.checkTimeouts();
      t.equal(ledger.read().workflow_step, TEST_WORKFLOW_STEP_ACTIVE, TEST_ASSERT_ACTIVE_STEP);
      t.equal(cache.get('services', TEST_REPLICA_ID)?.updated_at, nowMs + 1,
        'the authoritative target row is applied by production CDC alignment');
      t.equal(owner.observedProgressRetryTimerByOperationId.has(TEST_OPERATION_ID), false,
        'the completed handoff clears the old retry owner');
      t.same(dispatchedMessages, [], TEST_ASSERT_NO_UNSAFE_TRIM);
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        ledger.close();
      }
    }
  });

registerRebalanceCoordinatorTimeoutCacheVisibilityReadStateTests();

registerRebalanceCoordinatorTimeoutCacheVisibilityTailTests({
  test,
  RebalanceCoordinator,
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  QUERY_ERROR_MSG,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  ReplicaStatus,
  PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
  EMERGENCY_PRIORITY_PARTITION_ID,
  buildTransactionCoordinator,
  createCoordinator,
});
