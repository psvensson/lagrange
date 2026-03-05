import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
} from '../../src/control-plane/timeout-budget.js';

test('checkTimeouts enforces cache visibility after STOPPING timeout failure',
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

    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
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

    t.equal(waitForCacheUpdateCalls.length > 0, true);
    t.equal(
      waitForCacheUpdateCalls[0]?.tableName,
      'replica_operations',
    );
    t.equal(
      waitForCacheUpdateCalls[0]?.key,
      'op-stopping-timeout',
    );
    t.equal(
      waitForCacheUpdateCalls[0]?.options?.expectedFields?.workflow_step,
      undefined,
      'cache visibility should not wait on brittle workflow_step exact matches',
    );
    t.equal(
      waitForCacheUpdateCalls[0]?.options?.expectedFields?.status,
      undefined,
      'cache visibility should not wait on brittle status exact matches',
    );
    t.equal(
      waitForCacheUpdateCalls[0]?.options?.expectedFields?.replica_id,
      'partition-1-r1',
      'cache visibility should still pin replica identity',
    );
    t.equal(
      Number.isFinite(waitForCacheUpdateCalls[0]?.options?.minimumFields?.updated_at),
      true,
      'cache visibility should enforce monotonic updated_at propagation',
    );
  });

test('coordinator SQL reads use shared control-plane timeout options',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
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
      t.equal(
        call.options.timeoutMs,
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
        `coordinator read should pass shared timeout on ${call.sql}`,
      );
    }
  });

test('queryIncompleteOperations scopes reads to local operation owner',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
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
      await coordinator.queryIncompleteOperations();
    } finally {
      await coordinator.shutdown();
    }

    const operationQuery = executeQueryCalls[0];
    t.equal(
      Boolean(operationQuery),
      true,
      'queryIncompleteOperations should execute SQL read',
    );
    t.equal(
      operationQuery.sql.includes('source_node_id = ?'),
      true,
      'query should scope results to local source owner',
    );
    t.equal(
      operationQuery.sql.includes('target_node_id = ?'),
      true,
      'query should include legacy fallback ownership by target node',
    );
    t.equal(
      operationQuery.params.includes('node-local'),
      true,
      'owner-scoped query should bind local node id',
    );
    t.equal(
      operationQuery.options.timeoutMs,
      CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
      'owner-scoped query should retain shared timeout budget',
    );
  });
