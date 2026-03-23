import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
} from '../../src/control-plane/timeout-budget.js';

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
      t.equal(
        call.options.timeoutMs,
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
        `coordinator read should pass shared timeout on ${call.sql}`,
      );
    }
  });

test(
  'getActualReplicaStatus falls back to exact services cache observation ' +
    'when authoritative reads miss',
  async (t) => {
    const gatewayCalls = [];
    const observedServiceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      status: 'active',
    };
    const coordinator = new RebalanceCoordinator({
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
        'active',
        'exact observed services row should satisfy replica status when authoritative reads miss',
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

test('queryIncompleteOperations uses gateway-owned owner-local authoritative reads for replica_operations',
  async (t) => {
    const authoritativeReadCalls = [];
    const sqlQueryCalls = [];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options = {},
        ) {
          authoritativeReadCalls.push({
            tableName,
            sql,
            params: [...params],
            options,
          });
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{
              operation_id: 'op-local-1',
              type: 'ADD',
              partition_id: 'partition-1',
              replica_id: 'partition-1-r2',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: 'pending',
              workflow_step: 'PENDING',
              created_at: 100,
              updated_at: 200,
              completed_at: null,
              error_message: null,
              steps_history: '[]',
            }],
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
        async executeQuery(sql, params, options = {}) {
          sqlQueryCalls.push({sql, params, options});
          return {
            success: true,
            rows: [],
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.equal(operations.length, 1, 'owner-local authoritative read should surface the local in-flight operation');
      t.equal(
        operations[0]?.operationId,
        'op-local-1',
        'coordinator should translate the authoritative owner-local row',
      );
      t.equal(sqlQueryCalls.length, 0, 'should not reconstruct owner-local reads through the SQL query engine');
      t.equal(authoritativeReadCalls.length, 1, 'should use the authoritative local-read owner for owner rows');
      t.equal(
        authoritativeReadCalls[0]?.options?.queryOptions?.timeoutMs,
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
        'should preserve control-plane timeout options on owner-local authoritative reads',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.allowSqlFallback,
        false,
        'owner-local authoritative reads should disable routed SQL fallback',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('queryIncompleteOperations prefers cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const cacheRows = [
      {
        operation_id: 'op-cache-local-1',
        type: 'ADD',
        partition_id: 'partition-1',
        replica_id: 'partition-1-r2',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'creating',
        workflow_step: 'CREATING',
        created_at: 100,
        updated_at: 200,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-1',
      },
      {
        operation_id: 'op-cache-remote-1',
        type: 'ADD',
        partition_id: 'partition-2',
        replica_id: 'partition-2-r2',
        source_node_id: 'node-other',
        target_node_id: 'node-3',
        status: 'creating',
        workflow_step: 'CREATING',
        created_at: 50,
        updated_at: 60,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-2',
      },
    ];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return cacheRows.filter(predicate);
        },
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
        async executeQuery() {
          sqlQueryCalls += 1;
          throw new Error('routed SQL should not run');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.same(
        operations.map((operation) => operation.operationId),
        ['op-cache-local-1'],
        'cache observation boundary should answer incomplete owner scans',
      );
      t.equal(sqlQueryCalls, 0, 'cache-visible incomplete operations should bypass routed SQL');
    } finally {
      await coordinator.shutdown();
    }
  });

test(
  'queryIncompleteOperations reuses empty cache observation boundary while router is backpressured',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
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
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          throw new Error('routed SQL should not run while router is backpressured');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.same(
        operations,
        [],
        'empty cache observation boundary should be reused during router pressure',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'router pressure should suppress routed replica_operations scans',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'queryIncompleteOperations falls back to routed SQL when cache is empty and router pressure is clear',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
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
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.same(
        operations,
        [],
        'empty cache with clear pressure should still return no in-flight operations',
      );
      t.equal(
        sqlQueryCalls,
        1,
        'empty cache with clear pressure should fall back to one routed replica_operations scan',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartAddOperation reuses empty cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
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
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const canStart = await coordinator.canStartAddOperation();
      t.equal(
        canStart,
        false,
        'empty cache should defer add scheduling until authoritative confirmation is allowed',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'add scheduling admission should not route replica_operations SQL on empty cache',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartRemoveOperation returns false without routed reads while router is backpressured',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {},
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const canStart = await coordinator.canStartRemoveOperation();
      t.equal(
        canStart,
        false,
        'router pressure should pause remove scheduling admission',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'router pressure should avoid routed concurrent-remove count reads',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartRemoveOperation reuses empty cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
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
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const canStart = await coordinator.canStartRemoveOperation();
      t.equal(
        canStart,
        false,
        'empty cache should defer remove scheduling until authoritative confirmation is allowed',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'remove scheduling admission should not route replica_operations SQL on empty cache',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'checkTimeouts reuses empty cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
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
        async executeQuery() {
          sqlQueryCalls += 1;
          throw new Error('timeout scans should not route replica_operations SQL');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
      t.equal(
        sqlQueryCalls,
        0,
        'timeout scans should stay on the empty cache observation boundary',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('queryExistingInFlightOperation falls back to cache when routed SQL read fails',
  async (t) => {
    let sqlQueryCalls = 0;
    const cacheRows = [
      {
        operation_id: 'op-cache-dedupe-1',
        type: 'ADD',
        partition_id: 'partition-1',
        replica_id: 'partition-1-r2',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'creating',
        workflow_step: 'CREATING',
        created_at: 100,
        updated_at: 200,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-1',
      },
    ];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return cacheRows.filter(predicate);
        },
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
        async executeQuery() {
          sqlQueryCalls += 1;
          return {
            success: false,
            error: 'synthetic read failure',
            rows: [],
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operation = await coordinator.queryExistingInFlightOperation(
        'partition-1',
        'node-2',
        'partition',
        'partition-1',
        {
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          nodeId: 'node-2',
        },
      );
      t.equal(
        operation?.operationId,
        'op-cache-dedupe-1',
        'cache fallback should answer in-flight dedupe reads after SQL failure',
      );
      t.equal(sqlQueryCalls, 1, 'SQL-first dedupe path should attempt one routed read');
    } finally {
      await coordinator.shutdown();
    }
  });

test('queryIncompleteOperations scopes reads to local operation owner',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
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
      operationQuery.sql.includes("source_node_id IS NULL OR source_node_id = ''"),
      false,
      'query should avoid legacy target fallback predicate in owner path',
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

test('queryIncompleteOperations avoids legacy OR predicate timeout path',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-owner-only',
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
          const query = String(sql);
          executeQueryCalls.push({
            sql: query,
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          if (query.includes("source_node_id IS NULL OR source_node_id = ''")) {
            return {
              success: false,
              error: 'Query timeout after 5000ms',
              rows: [],
            };
          }
          return {
            success: true,
            rows: [
              {
                operation_id: 'owner-op-1',
                type: 'ADD',
                partition_id: 'partition-owner',
                replica_id: 'partition-owner-r2',
                source_node_id: 'node-owner-only',
                target_node_id: 'node-target',
                status: 'creating',
                workflow_step: 'CREATING',
                created_at: 10,
                updated_at: 20,
                completed_at: null,
                error_message: null,
                steps_history: '[]',
                entity_type: 'partition',
                entity_id: 'partition-owner',
              },
            ],
            affectedRows: 0,
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.equal(
        operations.length,
        1,
        'owner-scoped query should return in-flight operations without legacy OR fallback',
      );
      t.equal(
        executeQueryCalls.some((call) =>
          call.sql.includes("source_node_id IS NULL OR source_node_id = ''")),
        false,
        'query path should not execute legacy OR fallback predicate',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test(
  'checkTimeouts completes creating operations from exact cache-visible ' +
    'services rows when authoritative reads miss',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const observedServiceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      status: 'active',
    };
    const operationRow = {
      operation_id: 'op-cache-visible-active',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
        {step: 'CREATING', timestamp: staleUpdatedAtMs - 800},
      ]),
      entity_type: 'partition',
      entity_id: 'partition-1',
    };
    const gatewayCalls = [];

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
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
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...operationRow}],
            affectedRows: 0,
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
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName === 'replica_operations') {
            return key === operationRow.operation_id ? operationRow : null;
          }
          if (tableName === 'services') {
            return key === observedServiceRow.service_id ? observedServiceRow : null;
          }
          return null;
        },
        getAll(tableName) {
          if (tableName === 'replica_operations') {
            return [operationRow];
          }
          if (tableName === 'services') {
            return [observedServiceRow];
          }
          return [];
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
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
        async executeQuery(sql, params) {
          return sqlQueryEngine.executeQuery(sql, params);
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

      t.equal(
        operationRow.workflow_step,
        'ACTIVE',
        'timeout reconciliation should complete the ADD operation instead of failing it',
      );
      t.equal(
        operationRow.status,
        'active',
        'completed ADD should persist active status from observed target service state',
      );
      t.equal(
        operationRow.error_message,
        null,
        'cache-visible convergence should avoid timeout failure metadata',
      );
      t.equal(
        gatewayCalls.length >= 2,
        true,
        'timeout reconciliation should still attempt authoritative service reads before using observed cache state',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('timeout checker backs off empty incomplete-operation scans', async (t) => {
  let incompleteQueryAttempts = 0;
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-empty-backoff',
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
      async executeQuery(sql) {
        if (String(sql).includes('FROM replica_operations')) {
          incompleteQueryAttempts += 1;
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
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 60_000;

  coordinator.initialize();
  try {
    await coordinator.checkTimeouts();
    await coordinator.checkTimeouts();
    await coordinator.checkTimeouts();
    t.equal(
      incompleteQueryAttempts,
      1,
      'empty timeout scans should back off instead of querying on every loop',
    );

    coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs =
      Date.now() -
      coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs -
      1;
    await coordinator.checkTimeouts();
    t.equal(
      incompleteQueryAttempts,
      2,
      'query should resume once empty-scan backoff window has elapsed',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test(
  'timeout checker survives repeated replica_operations query timeouts',
  async (t) => {
    let incompleteQueryAttempts = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-timeout-loop',
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
        async executeQuery(sql) {
          if (String(sql).includes('FROM replica_operations')) {
            incompleteQueryAttempts += 1;
            throw new Error('Query timeout after 5000ms');
          }
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
    });
    coordinator.timeoutCheckIntervalMs = 5;

    coordinator.initialize();
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      incompleteQueryAttempts >= 2,
      true,
      'periodic timeout loop should keep running through repeated query timeouts',
    );
    t.equal(
      coordinator.timeoutCheckInFlight,
      false,
      'timeout loop should release in-flight guard after timeout errors',
    );
  },
);
