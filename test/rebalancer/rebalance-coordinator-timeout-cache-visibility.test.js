import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
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
import {registerRebalanceCoordinatorTimeoutCacheVisibilityTailTests} from './rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js';

const PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE =
  'operation_visibility_deferred';
const EMERGENCY_PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS = 15_000;
const INCOMPLETE_OPERATION_OWNER_QUERY_SQL_FRAGMENT =
  'source_node_id = ? OR target_node_id = ?';

function buildTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createCoordinator(overrides = {}) {
  const sqlQueryEngine = overrides.sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: [], affectedRows: 0};
    },
  };
  const hasExplicitGateway =
    overrides.controlPlaneSystemTableGateway &&
    typeof overrides.controlPlaneSystemTableGateway === 'object';
  const hasLocalAuthoritativeRead =
    typeof overrides.cdcIntegrationService
      ?.executeAuthoritativeSystemTableRead === 'function';

  if (hasExplicitGateway || hasLocalAuthoritativeRead) {
    return new RebalanceCoordinator({
      ...overrides,
      sqlQueryEngine,
    });
  }

  return new RebalanceCoordinator({
    ...overrides,
    sqlQueryEngine,
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      readRows: async (_tableName, sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      executeQuery: async (sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
    },
  });
}

test('checkTimeouts confirms STOPPING timeout failure without cache waits',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const waitForCacheUpdateCalls = [];
    const timedOutOperationRow = {
      operation_id: 'op-stopping-timeout',
      type: 'REMOVE',
      partition_id: 'partition-1',
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
            options.requireOwnerRpcRead === true) {
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
        call.options.requireOwnerRpcRead !== true,
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
    const staleUpdatedAtMs = nowMs - 65000;
    const operationRow = {
      operation_id: 'op-stale-priority-pending',
      type: 'REPLACE',
      partition_id: 'control_plane_publications-p1',
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: 'PENDING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
      ]),
      entity_type: 'partition',
      entity_id: 'control_plane_publications-p1',
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

test('checkTimeouts keeps non-priority SYNCING operations pending within configured timeout',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 130000;
    const nonPrioritySyncingOperationRow = {
      operation_id: 'op-non-priority-syncing',
      type: 'REPLACE',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
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
            rows: [{...nonPrioritySyncingOperationRow}],
          };
        }
        if (sql.startsWith('UPDATE replica_operations SET')) {
          nonPrioritySyncingOperationRow.status = params[0];
          nonPrioritySyncingOperationRow.workflow_step = params[1];
          nonPrioritySyncingOperationRow.updated_at = params[2];
          nonPrioritySyncingOperationRow.completed_at = params[3];
          nonPrioritySyncingOperationRow.error_message = params[4];
          nonPrioritySyncingOperationRow.steps_history = params[5];
          nonPrioritySyncingOperationRow.replica_id = params[6];
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
      nonPrioritySyncingOperationRow.workflow_step,
      'SYNCING',
      'non-priority SYNCING operations should keep the configured longer timeout budget',
    );
    t.equal(
      nonPrioritySyncingOperationRow.error_message,
      null,
      'non-priority SYNCING operations should not fail early under the bounded priority timeout path',
    );
  });

test('checkTimeouts resolves operation state from authoritative owner rows ' +
  'before reconciling stale cache entries', async (t) => {
  const deliveries = [];
  const staleCacheRow = {
    operation_id: 'op-stale-cache',
    type: 'REPLACE',
    partition_id: 'control_plane_publications-p1',
    replica_id: 'control_plane_publications-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: Date.now() - 10000,
    updated_at: Date.now() - 5000,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([
      {step: 'PENDING', timestamp: Date.now() - 7000},
      {step: 'SENDING', timestamp: Date.now() - 6000},
      {step: 'CREATING', timestamp: Date.now() - 5500},
      {step: 'SYNCING', timestamp: Date.now() - 5000},
    ]),
  };
  const authoritativeTerminalRow = {
    ...staleCacheRow,
    status: 'removed',
    workflow_step: 'REMOVED',
    completed_at: Date.now() - 1000,
    updated_at: Date.now() - 1000,
    steps_history: JSON.stringify([
      ...JSON.parse(staleCacheRow.steps_history),
      {step: 'REMOVED', timestamp: Date.now() - 1000},
    ]),
  };

  const coordinator = createCoordinator({
    nodeId: 'node-1',
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === staleCacheRow.operation_id ? staleCacheRow : null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [staleCacheRow];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver() {
        deliveries.push(true);
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (sql.includes('FROM replica_operations WHERE operation_id = ?')) {
          return {
            success: true,
            rows: [{...authoritativeTerminalRow}],
            affectedRows: 1,
          };
        }
        return {success: true, rows: [], affectedRows: 0};
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

  t.equal(deliveries.length, 0,
    'stale cache rows should not trigger dispatch when authoritative row is terminal');
});

test('coordinator SQL reads use shared control-plane timeout options',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
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
      sqlQueryEngine: {
        async executeQuery(sql, params, options = {}) {
          executeQueryCalls.push({
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
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
      await coordinator.queryOperationById('op-1');
      await coordinator.queryIncompleteOperations();
      await coordinator.queryExistingInFlightOperation(
        'p1',
        'node-2',
        'partition',
        'p1',
        null,
      );
      await coordinator.getAllOperations();
      await coordinator.getOperationsByEntity('partition', 'p1');
      await coordinator.getConcurrentRemoveCount();
      await coordinator.getActualReplicaStatus('p1-r1', 'p1', 'node-2');
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      executeQueryCalls.length > 0,
      true,
      'probe should execute coordinator SQL reads',
    );
    for (const call of executeQueryCalls) {
      const expectedTimeoutMs = call.sql.includes(
        INCOMPLETE_OPERATION_OWNER_QUERY_SQL_FRAGMENT,
      ) ?
        REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS :
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS;
      t.equal(
        call.options.timeoutMs,
        expectedTimeoutMs,
        `coordinator read should pass the expected timeout on ${call.sql}`,
      );
    }
  });

test(
  'getActualReplicaStatus falls back to exact services cache observation ' +
    'when authoritative reads fail',
  async (t) => {
    const gatewayCalls = [];
    const observedServiceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      status: 'active',
    };
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName !== 'services') {
            return null;
          }
          return key === observedServiceRow.service_id ? observedServiceRow : null;
        },
        getAll(tableName) {
          if (tableName !== 'services') {
            return [];
          }
          return [observedServiceRow];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneSystemTableGateway: {
        async readRows(tableName, sql, params, options) {
          gatewayCalls.push({
            tableName,
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          return {
            success: false,
            rows: [],
            affectedRows: 0,
          };
        },
        async executeQuery() {
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
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
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('raw SQL path should not be used');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const actualStatus = await coordinator.getActualReplicaStatus(
        'partition-1-r2',
        'partition-1',
        'node-2',
      );

      t.equal(
        actualStatus,
        'active',
        'exact observed services row should satisfy replica status when authoritative reads fail',
      );
      t.equal(
        gatewayCalls.length,
        2,
        'coordinator should still attempt authoritative service status reads before using observed cache state',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'getActualReplicaStatus returns null when authoritative reads succeed ' +
    'empty despite stale services cache state',
  async (t) => {
    const cacheReadCounts = {
      get: 0,
      getAll: 0,
      filter: 0,
    };
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          cacheReadCounts.get += 1;
          return {
            service_id: 'partition-1-r2',
            replica_id: 'partition-1-r2',
            partition_id: 'partition-1',
            node_id: 'node-2',
            status: 'active',
          };
        },
        getAll() {
          cacheReadCounts.getAll += 1;
          return [];
        },
        filter() {
          cacheReadCounts.filter += 1;
          return [];
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneSystemTableGateway: {
        async readRows() {
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
        async executeQuery() {
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
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
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('raw SQL path should not be used');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const actualStatus = await coordinator.getActualReplicaStatus(
        'partition-1-r2',
        'partition-1',
        'node-2',
      );

      t.equal(
        actualStatus,
        null,
        'successful authoritative no-row reads should win over stale cache visibility',
      );
      t.same(
        cacheReadCounts,
        {get: 0, getAll: 0, filter: 0},
        'coordinator should not consult services cache after successful authoritative no-row reads',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'getActualReplicaStatus keeps active learner partition replicas in syncing ' +
    'until promotion',
  async (t) => {
    const authoritativeLearnerRow = {
      service_id: 'nodes-p1-r4',
      replica_id: 'nodes-p1-r4',
      partition_id: 'nodes-p1',
      node_id: 'node-2',
      service_type: 'partition',
      status: 'active',
      raft_role: 'learner',
      address: 'node-2/partition/nodes-p1-r4',
    };
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        filter() {
          return [];
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (sql.includes('FROM services')) {
            return {
              success: true,
              rows: [{...authoritativeLearnerRow}],
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
      const actualStatus = await coordinator.getActualReplicaStatus(
        'nodes-p1-r4',
        'nodes-p1',
        'node-2',
      );

      t.equal(
        actualStatus,
        ReplicaStatus.SYNCING,
        'authoritative learner rows should remain syncing until the replacement is promoted',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);


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
