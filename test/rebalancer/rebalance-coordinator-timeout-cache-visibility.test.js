import {test} from '../../src/test-helpers/tap.js';
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
  createCoordinator,
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

test('checkTimeouts confirms STOPPING timeout failure without cache waits',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const waitForCacheUpdateCalls = [];
    const timedOutOperationRow = {
      operation_id: 'op-stopping-timeout',
      type: 'REMOVE',
      partition_id: 'partition-1',
      entity_type: 'partition',
      entity_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'stopping',
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

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...timedOutOperationRow}],
          };
        }
        if (sql.startsWith('UPDATE replica_operations SET')) {
          timedOutOperationRow.status = params[0];
          timedOutOperationRow.workflow_step = params[1];
          timedOutOperationRow.updated_at = params[2];
          timedOutOperationRow.completed_at = params[3];
          timedOutOperationRow.error_message = params[4];
          timedOutOperationRow.steps_history = params[5];
          timedOutOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        refreshAuthoritativeCacheRow: async () => true,
        async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
          waitForCacheUpdateCalls.push({
            tableName,
            key,
            expectPresent,
            options,
          });
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(waitForCacheUpdateCalls.length, 0,
      'timeout handling should not depend on projection visibility waits');
    t.equal(timedOutOperationRow.status, 'removed');
    t.equal(timedOutOperationRow.workflow_step, 'REMOVED');
  });

test('checkTimeouts reconciles stale operations when owner-rpc reads are unavailable',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const authoritativeReadCalls = [];
    const timedOutOperationRow = {
      operation_id: 'op-owner-rpc-fallback-timeout',
      type: 'REMOVE',
      partition_id: 'partition-1',
      entity_type: 'partition',
      entity_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'stopping',
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

    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
      async waitForCacheUpdate() {},
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
        if (tableName === 'replica_operations' &&
            options.authoritativeReadMode === 'owner_rpc_required') {
          return {
            success: false,
            error: 'owner-rpc-read-failed',
            rows: [],
          };
        }
        if (tableName === 'replica_operations') {
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{...timedOutOperationRow}],
          };
        }
        return {
          success: true,
          source: 'local_partition_replica',
          rows: [],
        };
      },
    };

    const controlPlaneSystemTableGateway = {
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
        if (String(sql).startsWith('UPDATE replica_operations SET')) {
          timedOutOperationRow.status = params[0];
          timedOutOperationRow.workflow_step = params[1];
          timedOutOperationRow.updated_at = params[2];
          timedOutOperationRow.completed_at = params[3];
          timedOutOperationRow.error_message = params[4];
          timedOutOperationRow.steps_history = params[5];
          timedOutOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
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
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      timedOutOperationRow.workflow_step,
      'REMOVED',
      'timeout reconciliation should still complete stale operations when owner-rpc reads are unavailable',
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

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      if (sql.includes('FROM replica_operations')) {
        authoritativeReplicaOperationReads.push({
          sql: String(sql),
          params: [...params],
        });
        return {
          success: true,
          rows: [...operationRows.values()].map((row) => ({...row})),
          affectedRows: 0,
        };
      }
      if (sql.startsWith('UPDATE replica_operations SET')) {
        const operationRow = operationRows.get(params[7]);
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      if (sql.includes('FROM services WHERE service_id = ?')) {
        const serviceRow = serviceRowsByReplicaId.get(params[0]) || null;
        return {
          success: true,
          rows: serviceRow ? [{...serviceRow}] : [],
          affectedRows: serviceRow ? 1 : 0,
        };
      }
      if (sql.includes('FROM services') &&
          sql.includes('WHERE partition_id = ? AND node_id = ?')) {
        const serviceRow = [...serviceRowsByReplicaId.values()].find((row) =>
          row.partition_id === params[0] &&
          row.node_id === params[1],
        ) || null;
        return {
          success: true,
          rows: serviceRow ? [{...serviceRow}] : [],
          affectedRows: serviceRow ? 1 : 0,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: 'node-1',
    transactionCoordinator: buildTransactionCoordinator(),
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
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine,
    enableTimeouts: false,
  });

  coordinator.initialize();
  try {
    await coordinator.checkTimeouts();
  } finally {
    await coordinator.shutdown();
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

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...prioritySyncingOperationRow}],
          };
        }
        if (sql.startsWith('UPDATE replica_operations SET')) {
          prioritySyncingOperationRow.status = params[0];
          prioritySyncingOperationRow.workflow_step = params[1];
          prioritySyncingOperationRow.updated_at = params[2];
          prioritySyncingOperationRow.completed_at = params[3];
          prioritySyncingOperationRow.error_message = params[4];
          prioritySyncingOperationRow.steps_history = params[5];
          prioritySyncingOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        refreshAuthoritativeCacheRow: async () => true,
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      prioritySyncingOperationRow.workflow_step,
      'FAILED',
      'priority control-plane SYNCING operations should time out within the bounded timeout window',
    );
    t.match(
      prioritySyncingOperationRow.error_message || '',
      /Timeout in SYNCING step/,
      'bounded SYNCING timeout failure should report the timed out step',
    );
  });

test('checkTimeouts does not fail a stale operation while a deferred transition retry is still armed',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    let updateCalls = 0;
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

    const coordinator = createCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
        filter() {
          return [];
        },
      },
      cdcIntegrationService: {
        refreshAuthoritativeCacheRow: async () => true,
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 3};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params) {
          if (String(sql).includes('FROM replica_operations')) {
            return {
              success: true,
              rows: [{...operationRow}],
            };
          }
          if (String(sql).startsWith('UPDATE replica_operations SET')) {
            updateCalls += 1;
            operationRow.status = params[0];
            operationRow.workflow_step = params[1];
            operationRow.updated_at = params[2];
            operationRow.completed_at = params[3];
            operationRow.error_message = params[4];
            operationRow.steps_history = params[5];
            operationRow.replica_id = params[6];
            return {
              success: true,
              affectedRows: 1,
            };
          }
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      coordinator.workflowOwner.transitionRetryTimerByOperationId.set(
        operationRow.operation_id,
        {armed: true},
      );

      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      updateCalls,
      0,
      'timeout reconciliation should not fail an operation while the deferred transition retry lane is still armed',
    );
    t.equal(
      operationRow.status,
      'pending',
      'the stale operation should remain pending until the deferred retry is allowed to run',
    );
    t.equal(
      operationRow.workflow_step,
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

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...operationRow}],
          };
        }
        if (sql.includes('UPDATE replica_operations SET')) {
          operationRow.status = params[0];
          operationRow.workflow_step = params[1];
          operationRow.updated_at = params[2];
          operationRow.completed_at = params[3];
          operationRow.error_message = params[4];
          operationRow.steps_history = params[5];
          operationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      messageRouter: {
        async deliver() {
          dispatchDeliveries += 1;
          return {acknowledged: true, status: 'initiated'};
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
        getMembershipPublicationPlanningSnapshotSync(nodeId) {
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
      },
      cdcIntegrationService: {
        refreshAuthoritativeCacheRow: async () => true,
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 3};
        },
      },
      systemTableCache: {
        get() {
          return null;
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      dispatchDeliveries,
      0,
      'stale timed-out priority recovery should not re-enter dispatch before being failed',
    );
    t.equal(
      operationRow.workflow_step,
      'FAILED',
      'timed-out priority recovery should become an explicit failed next action',
    );
    t.match(
      operationRow.error_message,
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
    const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
    const TEST_SERVICES_TABLE = 'services';
    const TEST_RAFT_ROLE_FOLLOWER = 'follower';
    const TEST_LOCAL_SOURCE = 'local_partition_replica';
    const TEST_UPDATE_OPERATION_SQL_PREFIX =
      'UPDATE replica_operations SET';
    const TEST_ADDRESS_SEPARATOR = '/';
    const TEST_STEP_STALE_MS = 65_000;
    const TEST_CREATED_LAG_MS = 5_000;
    const TEST_STEP_HISTORY_LAG_MS = 1_000;
    const TEST_MIN_REPLICA_COUNT = 3;
    const TEST_AFFECTED_ROW_COUNT = 1;
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
    const TEST_ASSERT_TARGET_CACHE_READ =
      'target services cache row should drive active progress';

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
      address: [
        TEST_SOURCE_NODE_ID,
        TEST_ENTITY_TYPE_PARTITION,
        TEST_SOURCE_REPLICA_ID,
      ].join(TEST_ADDRESS_SEPARATOR),
    };
    const serviceRows = [sourceServiceRow, targetServiceRow];
    const authoritativeServiceReadResults = [];
    const serviceCacheReadKeys = [];
    const dispatchedMessages = [];

    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params = [],
        _options = {},
      ) {
        if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
          return {
            success: true,
            source: TEST_LOCAL_SOURCE,
            rows: [],
          };
        }
        if (tableName === TEST_SERVICES_TABLE) {
          const result = {
            success: true,
            source: TEST_LOCAL_SOURCE,
            rows: [],
          };
          authoritativeServiceReadResults.push({
            sql: String(sql),
            params: [...params],
            success: result.success,
            rowCount: result.rows.length,
          });
          return result;
        }
        return {
          success: true,
          source: TEST_LOCAL_SOURCE,
          rows: [],
        };
      },
    };
    const controlPlaneSystemTableGateway = {
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
        if (String(sql).startsWith(TEST_UPDATE_OPERATION_SQL_PREFIX)) {
          const [
            nextStatus,
            nextWorkflowStep,
            nextUpdatedAt,
            nextCompletedAt,
            nextErrorMessage,
            nextStepsHistory,
            nextReplicaId,
          ] = params;
          operationRow.status = nextStatus;
          operationRow.workflow_step = nextWorkflowStep;
          operationRow.updated_at = nextUpdatedAt;
          operationRow.completed_at = nextCompletedAt;
          operationRow.error_message = nextErrorMessage;
          operationRow.steps_history = nextStepsHistory;
          operationRow.replica_id = nextReplicaId;
          return {
            success: true,
            affectedRows: TEST_AFFECTED_ROW_COUNT,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: TEST_EMPTY_AFFECTED_ROW_COUNT,
        };
      },
    };
    const coordinator = createCoordinator({
      nodeId: TEST_TARGET_NODE_ID,
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
            return key === operationRow.operation_id ?
              operationRow :
              TEST_EMPTY_VALUE;
          }
          if (tableName === TEST_SERVICES_TABLE) {
            serviceCacheReadKeys.push(key);
            return serviceRows.find((row) =>
              row.service_id === key,
            ) || TEST_EMPTY_VALUE;
          }
          return TEST_EMPTY_VALUE;
        },
        getAll(tableName) {
          if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
            return [operationRow];
          }
          if (tableName === TEST_SERVICES_TABLE) {
            return serviceRows;
          }
          return [];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
        },
      },
      cdcIntegrationService,
      controlPlaneSystemTableGateway,
      messageRouter: {
        async deliver(target, request) {
          dispatchedMessages.push({target, request});
          return {acknowledged: true, status: 'initiated'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.ok(
      authoritativeServiceReadResults.length > TEST_EMPTY_AFFECTED_ROW_COUNT,
      TEST_ASSERT_AUTHORITATIVE_SERVICE_READS,
    );
    t.ok(
      authoritativeServiceReadResults.every((result) =>
        result.rowCount === TEST_EMPTY_AFFECTED_ROW_COUNT,
      ),
      TEST_ASSERT_EMPTY_AUTHORITATIVE_SERVICE_ROWS,
    );
    t.ok(
      serviceCacheReadKeys.includes(TEST_REPLICA_ID),
      TEST_ASSERT_TARGET_CACHE_READ,
    );
    t.equal(
      operationRow.error_message,
      TEST_EMPTY_VALUE,
      TEST_ASSERT_NO_TIMEOUT_FAILURE,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_WORKFLOW_STEP_ACTIVE,
      TEST_ASSERT_ACTIVE_STEP,
    );
    t.same(
      dispatchedMessages,
      [],
      TEST_ASSERT_NO_UNSAFE_TRIM,
    );
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
