/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
  CDCOperationType,
  VALID_SYSTEM_TABLES,
} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
} from '../../src/control-plane/timeout-budget.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
} from '../../src/control-plane/read-model-contract.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const TEST_RETRY_AFTER_MS = 125;
const LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID =
  'op-local-authoritative-read';
const LOCAL_AUTHORITATIVE_REPLICA_OPERATION_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ROW = Object.freeze({
  operation_id: LOCAL_AUTHORITATIVE_REPLICA_OPERATION_ID,
  workflow_step: 'LOCAL_ONLY_QUERY',
});

/**
 * Create a mock SQL query engine for testing.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine() {
  const executedQueries = [];

  const mockSqlEngine = {
    executedQueries,
    async executeQuery(sql, params = [], options = {}) {
      executedQueries.push({sql, params, options});
      return {
        success: true,
        affectedRows: 1,
        rows: [],
      };
    },
  };
  mockSqlEngine.queryExecutor = {
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'node-owner',
        serviceRowCount: 1,
        routableServiceCount: 1,
        deniedByNodeId: {},
      };
    },
    async executeOnPartition(partitionId, sql, params = [], _forRead,
      _preferLeader, _preferSameLatencyGroup, executionOptions = {}) {
      const result = await mockSqlEngine.executeQuery(
        sql,
        params,
        {
          ...executionOptions,
          partitionId,
        },
      );
      return {
        success: result.success !== false,
        rows: Array.isArray(result.rows) ? result.rows : [],
        participantNodeId: 'node-owner',
      };
    },
  };
  return mockSqlEngine;
}

/**
 * Create a deterministic cache probe for CDC cache-wait behavior tests.
 * The first onCacheChange registration synchronously flips record presence
 * and emits a matching table change so waiters resolve immediately.
 * @return {{cache: Object, state: Object}}
 */
function createCacheWaitProbe() {
  const state = {
    present: false,
    row: null,
    onCacheChangeCalls: 0,
    offCacheChangeCalls: 0,
  };

  const cache = {
    has() {
      return state.present;
    },
    get() {
      return state.row;
    },
    onCacheChange(listener) {
      state.onCacheChangeCalls++;
      state.present = true;
      state.row = {
        node_id: 'node-1',
        node_address: 'localhost:8080',
      };
      listener(SYSTEM_TABLE_NAME.NODES);
      listener(SYSTEM_TABLE_NAME.LOGS);
    },
    offCacheChange() {
      state.offCacheChangeCalls++;
    },
  };

  return {cache, state};
}

/**
 * Create a local partition-service map for authoritative system-table tests.
 * @param {string} tableName
 * @param {Object} handlers
 * @return {Map<string, Object>}
 */
function createLocalSystemTablePartitionServices(
  tableName,
  handlers = {},
) {
  const partitionId = INITIAL_PARTITION_IDS[tableName] || `${tableName}-p1`;
  const partitionService = {
    partitionId,
    replicaId: `${partitionId}-r1`,
    initialized: true,
    isLeader: handlers.isLeader !== false,
    async executeQuery(sql, params = []) {
      if (typeof handlers.executeQuery === 'function') {
        return handlers.executeQuery(sql, params);
      }
      return {
        success: true,
        rows: [],
      };
    },
  };
  if (typeof handlers.executeLocalQuery === 'function') {
    partitionService.executeLocalQuery = async (sql, params = []) => {
      return handlers.executeLocalQuery(sql, params);
    };
  }
  return new Map([
    [partitionId, partitionService],
  ]);
}

test('CDCIntegrationService - updateSystemTableRow forwards query timeout to SQL engine',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {
        status: 'active',
      },
      {
        queryTimeoutMs: 4321,
        skipCacheWait: true,
      },
    );

    t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
    t.ok(
      Number.isFinite(mockSqlEngine.executedQueries[0]?.options?.timeoutMs) &&
      mockSqlEngine.executedQueries[0].options.timeoutMs > 0 &&
      mockSqlEngine.executedQueries[0].options.timeoutMs <= 4321,
      'should pass one bounded routed SQL timeout budget through execution options',
    );
  },
);

test('CDCIntegrationService - routed system-table write timeout budget bounds transient retries',
  async (t) => {
    const executedQueries = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      retryMaxAttempts: 5,
      retryDelayMs: 50,
      sqlQueryEngine: {
        async executeQuery(sql, params, options) {
          executedQueries.push({sql, params, options});
          return {
            success: false,
            error: 'query transport reconnecting',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            retryAfterMs: 250,
          };
        },
      },
    });
    service.initialize();

    const error = await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        {node_id: 'node-1'},
        {
          status: 'active',
        },
        {
          queryTimeoutMs: 200,
          skipCacheWait: true,
        },
      ),
      'routed system-table writes should fail once the per-call timeout budget is exhausted',
    );

    t.equal(executedQueries.length, 1,
      'per-call timeout budget should prevent repeated routed SQL attempts once retryAfterMs exceeds the remaining budget');
    t.equal(executedQueries[0]?.options?.timeoutMs, 200,
      'first routed SQL attempt should receive the full per-call timeout budget');
    t.equal(error?.deferRetry, true,
      'bounded timeout exhaustion should preserve defer-retry semantics for upstream owners');
    t.equal(error?.retryAfterMs, 250,
      'bounded timeout exhaustion should preserve retryAfterMs for the next owner-level retry');
  },
);

test('CDCIntegrationService - routed system-table writes default to shared background transport when the table is not transport critical',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {
        status: 'active',
      },
      {
        skipCacheWait: true,
      },
    );

    t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'internal system-table writes should route through control-plane recovery readiness by default',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
      'background',
      'non-critical system-table writes should not claim the critical delivery lane by default',
    );
  },
);

test('CDCIntegrationService - critical transport system-table writes still default to the critical lane',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    await service.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      {
        publication_id: 'pub-critical-1',
        publication_kind: 'cluster_membership',
        publication_epoch: 1,
        publisher_node_id: 'node-a',
        published_active_node_ids: '["node-a"]',
        required_ack_node_ids: '["node-a"]',
        acknowledged_node_ids: '["node-a"]',
        status: 'OPEN',
        reason_code: 'authoritative_membership_changed',
        opened_at: 1,
        updated_at: 1,
      },
      {
        skipCacheWait: true,
      },
    );

    t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
      'critical',
      'critical transport system-table writes should keep the critical delivery lane by default',
    );
  },
);

test('CDCIntegrationService - transaction-control system-table writes default to the critical lane during recovery routing',
  async (t) => {
    const TEST_TRANSACTION_ROW = Object.freeze({
      transaction_id: 'tx-critical-1',
      session_id: 'session-critical-1',
      status: 'ACTIVE',
      transaction_epoch: 1,
      timeout_deadline: 1000,
      created_at: 1,
      updated_at: 2,
    });
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    await service.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      TEST_TRANSACTION_ROW,
      {
        skipCacheWait: true,
      },
    );

    t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'transaction-control system-table writes should stay on the recovery routing dimension by default',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
      'critical',
      'transaction-control system-table writes should keep the critical delivery lane by default',
    );
  },
);

test(
  'CDCIntegrationService - updateSystemTableRow forwards minimum cache fields',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: {
        onCacheChange() {},
        offCacheChange() {},
      },
    });
    service.initialize();

    const waitCalls = [];
    service.waitForCacheUpdate = async (
      tableName,
      key,
      expectPresent,
      options = {},
    ) => {
      waitCalls.push({
        tableName,
        key,
        expectPresent,
        options,
      });
    };

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {
        status: 'suspected',
        updated_at: 200,
      },
      {
        expectedCacheFields: {node_id: 'node-1'},
        minimumCacheFields: {updated_at: 200},
      },
    );

    t.equal(waitCalls.length, 1, 'should perform one cache wait');
    t.same(
      waitCalls[0]?.options?.minimumFields,
      {updated_at: 200},
      'should forward caller minimum cache fields to cache waits',
    );
    t.same(
      waitCalls[0]?.options?.expectedFields,
      {node_id: 'node-1'},
      'should keep forwarding exact cache fields alongside minimums',
    );
    t.end();
  },
);

test('CDCIntegrationService - upsertSystemTableRow skips cache wait when requested',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const {cache, state} = createCacheWaitProbe();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
    });
    service.initialize();

    await service.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {
        node_id: 'node-1',
        node_address: 'localhost:8080',
      },
      {skipCacheWait: true},
    );

    t.equal(
      state.onCacheChangeCalls,
      0,
      'should not subscribe to cache waits when explicitly skipped',
    );
    t.end();
  },
);

test('CDCIntegrationService - insertSystemTableRow skips cache wait when requested',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const {cache, state} = createCacheWaitProbe();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
    });
    service.initialize();

    await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {
        node_id: 'node-1',
        node_address: 'localhost:8080',
      },
      {skipCacheWait: true},
    );

    t.equal(
      state.onCacheChangeCalls,
      0,
      'should not subscribe to cache waits when insert explicitly skips them',
    );
    t.end();
  },
);

test('CDCIntegrationService - updateSystemTableRow skips cache wait when requested',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const {cache, state} = createCacheWaitProbe();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {node_address: 'localhost:8080'},
      {skipCacheWait: true},
    );

    t.equal(
      state.onCacheChangeCalls,
      0,
      'should not subscribe to cache waits when update explicitly skips them',
    );
    t.end();
  },
);

test(
  'CDCIntegrationService - updateSystemTableRow rejects when cache row stays stale',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    let listener = null;
    const cache = {
      has(tableName, key) {
        return tableName === SYSTEM_TABLE_NAME.SERVICES && key === 'svc-1';
      },
      get(tableName, key) {
        if (tableName !== SYSTEM_TABLE_NAME.SERVICES || key !== 'svc-1') {
          return undefined;
        }
        return {
          service_id: 'svc-1',
          status: 'active',
        };
      },
      onCacheChange(nextListener) {
        listener = nextListener;
      },
      offCacheChange(nextListener) {
        if (listener === nextListener) {
          listener = null;
        }
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
    });
    service.initialize();
    service.cacheWaitTimeoutMs = 20;

    try {
      await service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'suspected'},
        {
          expectedCacheFields: {
            status: 'suspected',
          },
        },
      );
      t.fail('should fail closed when cache never reflects the updated row');
    } catch (error) {
      const timeoutClassification = error?.timeoutClassification || null;
      const effectiveClassification =
        timeoutClassification?.classification ===
          TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT ?
          timeoutClassification.originalClassification :
          timeoutClassification?.classification;
      t.match(
        error?.message || '',
        /cache update/i,
        'stale cache visibility should still surface a cache-wait timeout',
      );
      t.equal(
        effectiveClassification,
        TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        'strict cache waits should preserve explicit cache visibility timeout classification',
      );
    }
    t.equal(listener, null, 'should clean up the cache listener after timeout');
    t.end();
  },
);

test(
  'CDCIntegrationService - updateSystemTableRow repairs cache lag from authoritative row after timeout',
  async (t) => {
    const cache = new SystemTableCache();
    const executedQueries = [];
    const divergenceEvents = [];
    const authoritativeRow = {
      node_id: 'node-1',
      status: 'suspected',
      updated_at: 200,
    };
    const mockSqlEngine = {
      executedQueries,
      async executeQuery(sql, params = []) {
        executedQueries.push({sql, params});
        if (sql.startsWith('UPDATE')) {
          return {
            success: true,
            affectedRows: 1,
          };
        }
        if (sql.startsWith('SELECT * FROM nodes')) {
          return {
            success: true,
            rows: [authoritativeRow],
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    mockSqlEngine.queryExecutor = {
      async executeOnPartition(_partitionId, sql, params = []) {
        executedQueries.push({sql, params});
        if (sql.startsWith('SELECT * FROM nodes')) {
          return {
            success: true,
            participantNodeId: 'node-1',
            rows: [authoritativeRow],
          };
        }
        throw new Error(`Unexpected owner RPC query: ${sql}`);
      },
      getPartitionRoutingSnapshot() {
        return {
          canonicalLeaderNodeId: 'node-1',
          serviceRowCount: 1,
          routableServiceCount: 1,
          deniedByNodeId: {},
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
    });
    service.initialize();
    service.cacheWaitTimeoutMs = 20;
    service.on(CDC_EVENT.READ_MODEL_DIVERGENCE, (event) => {
      divergenceEvents.push(event);
    });

    const result = await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'suspected', updated_at: 200},
      {
        expectedCacheFields: {
          status: 'suspected',
          updated_at: 200,
        },
      },
    );

    t.equal(result.success, true,
      'should recover the write after authoritative confirmation');
    t.equal(executedQueries.length, 2, 'should issue one authoritative repair query');
    t.match(
      executedQueries[1].sql,
      /SELECT \* FROM nodes WHERE node_id = \?/,
      'confirmation should read the authoritative row by primary key',
    );
    t.same(
      cache.get(SYSTEM_TABLE_NAME.NODES, 'node-1'),
      authoritativeRow,
      'authoritative confirmation should repair the cache directly',
    );
    t.equal(divergenceEvents.length, 1,
      'cache lag should emit one divergence event');
    t.equal(divergenceEvents[0]?.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING);
    t.end();
  },
);

test(
  'CDCIntegrationService - insertSystemTableRow repairs cache lag from authoritative row after timeout',
  async (t) => {
    const cache = new SystemTableCache();
    const executedQueries = [];
    const divergenceEvents = [];
    const authoritativeRow = {
      table_id: 'tbl-1',
      table_name: 'benchmark_events',
      partition_id: 'benchmark_events-p1',
      owner_node_id: 'node-1',
      created_at: 100,
      updated_at: 100,
    };
    const mockSqlEngine = {
      executedQueries,
      async executeQuery(sql, params = []) {
        executedQueries.push({sql, params});
        if (sql.startsWith('INSERT INTO tables')) {
          return {
            success: true,
            affectedRows: 1,
          };
        }
        if (sql.startsWith('SELECT * FROM tables')) {
          return {
            success: true,
            rows: [authoritativeRow],
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    mockSqlEngine.queryExecutor = {
      async executeOnPartition(_partitionId, sql, params = []) {
        executedQueries.push({sql, params});
        if (sql.startsWith('SELECT * FROM tables')) {
          return {
            success: true,
            participantNodeId: 'node-1',
            rows: [authoritativeRow],
          };
        }
        throw new Error(`Unexpected owner RPC query: ${sql}`);
      },
      getPartitionRoutingSnapshot() {
        return {
          canonicalLeaderNodeId: 'node-1',
          serviceRowCount: 1,
          routableServiceCount: 1,
          deniedByNodeId: {},
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
    });
    service.initialize();
    service.cacheWaitTimeoutMs = 20;
    service.on(CDC_EVENT.READ_MODEL_DIVERGENCE, (event) => {
      divergenceEvents.push(event);
    });

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.TABLES,
      authoritativeRow,
    );

    t.equal(result.success, true,
      'should recover inserts after authoritative confirmation');
    t.equal(executedQueries.length, 2, 'should issue one authoritative read after insert');
    t.match(
      executedQueries[1].sql,
      /SELECT \* FROM tables WHERE table_id = \?/,
      'confirmation should read the inserted row by primary key',
    );
    t.same(
      cache.get(SYSTEM_TABLE_NAME.TABLES, 'tbl-1'),
      authoritativeRow,
      'authoritative confirmation should hydrate the cache directly',
    );
    t.equal(divergenceEvents.length, 1,
      'cache lag should emit one divergence event after insert');
    t.equal(divergenceEvents[0]?.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING);
    t.end();
  },
);

test(
  'CDCIntegrationService - authoritative confirmation repairs explicit writable cache targets',
  async (t) => {
    const writableCache = new SystemTableCache();
    const readOnlyCache = createReadOnlyCache(writableCache);
    const executedQueries = [];
    const divergenceEvents = [];
    const authoritativeRow = {
      node_id: 'node-1',
      status: 'suspected',
      updated_at: 200,
    };
    const mockSqlEngine = {
      executedQueries,
      async executeQuery(sql, params = []) {
        executedQueries.push({sql, params});
        if (sql.startsWith('UPDATE')) {
          return {
            success: true,
            affectedRows: 1,
          };
        }
        if (sql.startsWith('SELECT * FROM nodes')) {
          return {
            success: true,
            rows: [authoritativeRow],
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    mockSqlEngine.queryExecutor = {
      async executeOnPartition(_partitionId, sql, params = []) {
        executedQueries.push({sql, params});
        if (sql.startsWith('SELECT * FROM nodes')) {
          return {
            success: true,
            participantNodeId: 'node-1',
            rows: [authoritativeRow],
          };
        }
        throw new Error(`Unexpected owner RPC query: ${sql}`);
      },
      getPartitionRoutingSnapshot() {
        return {
          canonicalLeaderNodeId: 'node-1',
          serviceRowCount: 1,
          routableServiceCount: 1,
          deniedByNodeId: {},
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: readOnlyCache,
      cacheMutationTarget: writableCache,
    });
    service.initialize();
    service.cacheWaitTimeoutMs = 20;
    service.on(CDC_EVENT.READ_MODEL_DIVERGENCE, (event) => {
      divergenceEvents.push(event);
    });

    const result = await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'suspected', updated_at: 200},
      {
        expectedCacheFields: {
          status: 'suspected',
          updated_at: 200,
        },
      },
    );

    t.equal(result.success, true,
      'should confirm through authoritative reads and repair writable cache targets');
    t.same(
      writableCache.get(SYSTEM_TABLE_NAME.NODES, 'node-1'),
      authoritativeRow,
      'writable cache should be repaired by authoritative confirmation',
    );
    t.same(
      readOnlyCache.get(SYSTEM_TABLE_NAME.NODES, 'node-1'),
      authoritativeRow,
      'read-only cache should reflect the repaired writable cache',
    );
    t.equal(executedQueries.length, 2,
      'should still issue one authoritative confirmation query');
    t.equal(divergenceEvents.length, 1,
      'cache lag should emit one divergence event for writable targets too');
    t.end();
  },
);

test('CDCIntegrationService - deleteSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const whereClause = {node_id: 'node-1'};

  const result = await service.deleteSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    whereClause,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.DELETE, 'should be DELETE operation');
  t.equal(result.tableName, SYSTEM_TABLE_NAME.NODES, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('DELETE'),
    'should be DELETE query',
  );
  t.end();
});

test('CDCIntegrationService - validates table name', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  try {
    await service.insertSystemTableRow('invalid_table', {id: '1'});
    t.fail('should throw error for invalid table');
  } catch (error) {
    t.ok(error.message.includes('Invalid system table name'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - validates data object', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  try {
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, null);
    t.fail('should throw error for null data');
  } catch (error) {
    t.ok(error.message.includes('requires data object'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - requires primary key for update', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  try {
    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {status: 'active'}, // Missing primary key
      {status: 'failed'},
    );
    t.fail('should throw error for missing primary key');
  } catch (error) {
    t.ok(error.message.includes('requires primary key'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - requires primary key for delete', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  try {
    await service.deleteSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {status: 'active'}, // Missing primary key
    );
    t.fail('should throw error for missing primary key');
  } catch (error) {
    t.ok(error.message.includes('requires primary key'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - throws when sqlQueryEngine not available', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  try {
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '1'});
    t.fail('should throw error when sqlQueryEngine not available');
  } catch (error) {
    t.ok(error.message.includes('sqlQueryEngine not provided'),
      'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - throws when not initialized', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  try {
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '1'});
    t.fail('should throw error when not initialized');
  } catch (error) {
    t.ok(error.message.includes('not properly initialized'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - tracks statistics', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '1'});
  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '2'});
  await service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {node_id: '1'},
    {status: 'failed'},
  );
  await service.deleteSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '2'});

  const stats = service.getStats();
  t.equal(stats.inserts, 2, 'should track inserts');
  t.equal(stats.updates, 1, 'should track updates');
  t.equal(stats.deletes, 1, 'should track deletes');
  t.equal(stats.total, 4, 'should track total');
  t.end();
});

test('CDCIntegrationService - emits events', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const events = [];
  service.on('insert', (e) => events.push({type: 'insert', ...e}));
  service.on('update', (e) => events.push({type: 'update', ...e}));
  service.on('delete', (e) => events.push({type: 'delete', ...e}));

  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '1'});
  await service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {node_id: '1'},
    {status: 'failed'},
  );
  await service.deleteSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '1'});

  t.equal(events.length, 3, 'should emit 3 events');
  t.equal(events[0].type, 'insert', 'should emit insert event');
  t.equal(events[1].type, 'update', 'should emit update event');
  t.equal(events[2].type, 'delete', 'should emit delete event');
  t.end();
});

test('CDCIntegrationService - VALID_SYSTEM_TABLES contains all system tables', async (t) => {
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.NODES), 'should include nodes');
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.SERVICES), 'should include services');
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.PARTITIONS), 'should include partitions');
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.TABLES), 'should include tables');
  t.ok(
    VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.MESSAGE_GROUPS),
    'should include message_groups',
  );
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.INDICES), 'should include indices');
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.LOGS), 'should include logs');
  t.ok(VALID_SYSTEM_TABLES.includes(SYSTEM_TABLE_NAME.CONFIG), 'should include config');
  t.end();
});

test('CDCIntegrationService - resetStats', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {node_id: '1'});

  let stats = service.getStats();
  t.equal(stats.inserts, 1, 'should have 1 insert');

  service.resetStats();
  stats = service.getStats();
  t.equal(stats.inserts, 0, 'should reset inserts');
  t.equal(stats.total, 0, 'should reset total');
  t.end();
});


// Import epoch-related classes for testing
import {AssignmentEpochManager} from '../../src/rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {EPOCH_CONFIG_KEY} from '../../src/cdc/cdc-integration-service.js';

test('CDCIntegrationService - setEpochManager', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();

  service.setEpochManager(epochManager);

  t.equal(service.epochManager, epochManager, 'should set epoch manager');
  t.end();
});

test('CDCIntegrationService - setEpochManager throws on null', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  try {
    service.setEpochManager(null);
    t.fail('should throw error for null epoch manager');
  } catch (error) {
    t.ok(error.message.includes('epochManager is required'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC applies valid epoch', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  // Create a new epoch to apply
  const newEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: {'partition-1': ['node-1', 'node-2']},
    timestamp: Date.now().toString(),
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify(newEpoch.toObject()),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, true, 'should apply epoch');
  t.equal(result.epoch, 1, 'should return epoch number');
  t.equal(epochManager.getCurrentEpoch().epoch, 1, 'epoch manager should have new epoch');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC emits epochChange event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const events = [];
  service.on('epochChange', (e) => events.push(e));

  const newEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: {'partition-1': ['node-1']},
    timestamp: '12345',
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: newEpoch.toObject(),
    },
  };

  service.handleEpochChangeCDC(cdcEvent);

  t.equal(events.length, 1, 'should emit one epochChange event');
  t.equal(events[0].epoch, 1, 'event should have epoch number');
  t.equal(events[0].source, 'cdc', 'event should have cdc source');
  t.equal(events[0].proposedBy, 'other-node', 'event should have proposedBy');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC rejects non-epoch config key', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: 'some_other_config',
      config_value: 'some_value',
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply');
  t.ok(result.error.includes('Not an epoch change event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC rejects stale epoch', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  // Initialize with epoch 5
  const initialEpoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {'partition-1': ['node-1']},
    timestamp: Date.now().toString(),
    proposedBy: 'test-node',
  });
  epochManager.initialize(initialEpoch);
  service.setEpochManager(epochManager);

  // Try to apply epoch 3 (stale)
  const staleEpoch = new AssignmentEpoch({
    epoch: 3,
    assignments: {'partition-1': ['node-2']},
    timestamp: Date.now().toString(),
    proposedBy: 'other-node',
  });

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify(staleEpoch.toObject()),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply stale epoch');
  t.ok(result.error.includes('stale'), 'should have stale error message');
  t.equal(epochManager.getCurrentEpoch().epoch, 5, 'epoch should remain at 5');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC without epoch manager', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify({
        epoch: 1,
        assignments: {},
        timestamp: '12345',
        proposedBy: 'node-1',
      }),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply without epoch manager');
  t.ok(result.error.includes('Epoch manager not set'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC with invalid event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const result = service.handleEpochChangeCDC(null);

  t.equal(result.applied, false, 'should not apply null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC with invalid JSON', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: 'not valid json {{{',
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply with invalid JSON');
  t.ok(result.error.includes('Failed to parse epoch data'), 'should have parse error');
  t.end();
});

test('CDCIntegrationService - handleEpochChangeCDC with invalid epoch data', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: EPOCH_CONFIG_KEY,
      config_value: JSON.stringify({
        epoch: -1, // Invalid: negative epoch
        assignments: {},
        timestamp: '12345',
        proposedBy: 'node-1',
      }),
    },
  };

  const result = service.handleEpochChangeCDC(cdcEvent);

  t.equal(result.applied, false, 'should not apply with invalid epoch data');
  t.ok(result.error.includes('Failed to create epoch'), 'should have create error');
  t.end();
});
