import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
} from '../../src/control-plane/timeout-budget.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  buildTransactionCoordinator,
  createCoordinator,
} from './rebalance-coordinator-timeout-cache-visibility-fixture.js';

const REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS = 15_000;
const INCOMPLETE_OPERATION_OWNER_QUERY_SQL_FRAGMENT =
  'source_node_id = ? OR target_node_id = ?';

export function registerRebalanceCoordinatorTimeoutCacheVisibilityReadStateTests() {
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
        refreshAuthoritativeCacheRow: async () => true,
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
          refreshAuthoritativeCacheRow: async () => true,
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
          refreshAuthoritativeCacheRow: async () => true,
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
          refreshAuthoritativeCacheRow: async () => true,
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
}
