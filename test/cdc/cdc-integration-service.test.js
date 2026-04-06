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
  return new Map([
    [partitionId, {
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
      async executeLocalQuery(sql, params = []) {
        if (typeof handlers.executeLocalQuery === 'function') {
          return handlers.executeLocalQuery(sql, params);
        }
        return {
          success: true,
          rows: [],
        };
      },
    }],
  ]);
}

test('CDCIntegrationService - constructor', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('CDCIntegrationService - constructor has no _nodeStates field', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(
    Object.prototype.hasOwnProperty.call(service, '_nodeStates'),
    false,
    'should not have _nodeStates property (node state tracking owned by CDCEventHandler)',
  );
  t.end();
});

test('CDCIntegrationService - initialize', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  service.initialize({
    sqlQueryEngine: mockSqlEngine,
  });

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const data = {
    node_id: 'node-1',
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, data);

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.INSERT, 'should be INSERT operation');
  t.equal(result.tableName, SYSTEM_TABLE_NAME.NODES, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('INSERT INTO'),
    'should be INSERT query',
  );
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow generates id', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const data = {
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, data);

  t.equal(result.success, true, 'should succeed');
  t.ok(result.data.node_id, 'should generate node_id');
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow skips cache wait for logs', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const {cache, state} = createCacheWaitProbe();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
    systemTableCache: cache,
  });
  service.initialize();

  const data = {
    log_id: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    node_id: 'node-1',
    message: 'log message',
    created_at: Date.now(),
  };

  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.LOGS, data);

  t.equal(
    state.onCacheChangeCalls,
    0,
    'should not subscribe to cache waits for non-propagated logs table',
  );
  t.end();
});

test('CDCIntegrationService - coalesces identical in-flight upserts into ' +
  'one routed write', async (t) => {
  let releaseWrite = null;
  const mockSqlEngine = {
    executedQueries: [],
    async executeQuery(sql, params = [], options = {}) {
      this.executedQueries.push({sql, params, options});
      await new Promise((resolve) => {
        releaseWrite = resolve;
      });
      return {
        success: true,
        affectedRows: 1,
      };
    },
  };
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const row = {
    node_id: 'node-1',
    node_address: 'localhost:8080',
    status: 'active',
    last_heartbeat: 1000,
    created_at: 1000,
    updated_at: 1000,
  };

  const firstWrite = service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    row,
    {
      skipCacheWait: true,
      workClass: 'background',
      allowPressureDefer: true,
      deliveryPriority: 'background',
    },
  );
  const secondWrite = service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {...row},
    {
      skipCacheWait: true,
      workClass: 'background',
      allowPressureDefer: true,
      deliveryPriority: 'background',
    },
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.equal(
    mockSqlEngine.executedQueries.length,
    1,
    'identical concurrent upserts should collapse into one routed mutation',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
    'background',
    'coalesced writes should preserve routed delivery metadata',
  );
  t.equal(
    typeof releaseWrite,
    'function',
    'the routed write should be armed before releasing it',
  );

  releaseWrite();
  const [firstResult, secondResult] = await Promise.all([
    firstWrite,
    secondWrite,
  ]);

  t.same(firstResult, secondResult, 'coalesced upserts should share one result');
  t.end();
});

test('CDCIntegrationService - forwards pressure admission metadata to routed ' +
  'SQL writes', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
    {
      transaction_id: 'tx-forwarded-1',
      session_id: 'session-1',
      status: 'ACTIVE',
      transaction_epoch: 1,
      timeout_deadline: 1000,
      created_at: 1,
      updated_at: 2,
    },
    {
      skipCacheWait: true,
      workClass: 'critical',
      allowPressureDefer: true,
      pressureRetryAfterMs: 777,
      deliveryPriority: 'background',
    },
  );

  t.equal(mockSqlEngine.executedQueries.length, 1,
    'routed SQL write should execute once');
  t.equal(mockSqlEngine.executedQueries[0]?.options?.workClass, 'critical',
    'work class should survive the CDC SQL handoff');
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.allowPressureDefer,
    true,
    'defer policy should survive the CDC SQL handoff',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.pressureRetryAfterMs,
    777,
    'retry-after hints should survive the CDC SQL handoff',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
    'background',
    'delivery priority should survive the CDC SQL handoff',
  );
  t.end();
});

test('CDCIntegrationService canonicalizes control_plane_publications upserts ' +
  'before filtering schema columns', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    {
      publicationId: 'pub-1',
      publicationKind: 'cluster_membership',
      publicationEpoch: 7,
      publisherNodeId: 'node-a',
      publishedActiveNodeIds: ['node-a', 'node-b'],
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a'],
      status: 'OPEN',
      reasonCode: 'authoritative_membership_changed',
    },
    {
      skipCacheWait: true,
    },
  );

  t.equal(
    mockSqlEngine.executedQueries.length,
    1,
    'canonicalized publication upsert should execute once',
  );
  t.match(
    mockSqlEngine.executedQueries[0].sql,
    /^INSERT OR REPLACE INTO control_plane_publications \(/,
    'publication upsert should still use INSERT OR REPLACE',
  );
  t.same(
    mockSqlEngine.executedQueries[0].params.slice(0, 4),
    ['pub-1', 'cluster_membership', 7, 'node-a'],
    'canonicalized publication row should preserve the primary key and core fields',
  );
  t.end();
});

test('CDCIntegrationService - defers routed writes under pressure when allowed',
  async (t) => {
    let sqlCalls = 0;
    const service = new CDCIntegrationService({
      nodeId: 'pressure-node',
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 64,
            maxPendingUtilization: 1,
          };
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlCalls++;
          return {
            success: true,
            affectedRows: 1,
          };
        },
      },
    });
    service.initialize();

    const error = await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'active', updated_at: 1234},
        {
          skipCacheWait: true,
          workClass: 'background',
          allowPressureDefer: true,
          deliveryPriority: 'background',
        },
      ),
      'deferable routed writes should fail closed before hitting SQL',
    );
    t.equal(
      error?.code,
      'CONTROL_PLANE_PRESSURE_DEGRADED',
      'pressure admission should surface the typed error code',
    );
    t.equal(
      error?.deferRetry,
      true,
      'pressure admission should mark the error as deferable',
    );
    t.equal(
      error?.retryAfterMs,
      250,
      'pressure admission should preserve retry-after metadata',
    );

    t.equal(sqlCalls, 0, 'deferred routed writes should not hit routed SQL');
  });

test('CDCIntegrationService logs retryable table-write failures as warnings',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        async executeQuery() {
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
          };
        },
      },
    });
    service.initialize();

    const warnings = [];
    const errors = [];
    service.logger = {
      debug() {},
      info() {},
      warn(...args) {
        warnings.push(args);
      },
      error(...args) {
        errors.push(args);
      },
    };

    await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'active'},
        {
          skipCacheWait: true,
          causeId: 'cdc-write-failure:test',
        },
      ),
      'retryable control-plane deferrals should still fail closed',
    );

    t.equal(warnings.length, 1,
      'retryable table-write deferrals should log one warning');
    t.equal(errors.length, 0,
      'retryable table-write deferrals should not log hard errors');
    t.equal(warnings[0][1]?.code, 'CONTROL_PLANE_PRESSURE_DEGRADED',
      'warning should preserve the typed error code');
    t.equal(warnings[0][1]?.retryAfterMs, 250,
      'warning should preserve the retry-after hint');
    t.equal(warnings[0][1]?.causeId, 'cdc-write-failure:test',
      'warning should preserve the write cause');
    t.equal(warnings[0][1]?.operation, 'UPDATE',
      'warning should identify the failed write operation');
    t.equal(warnings[0][1]?.writeMode, 'sql-routed',
      'warning should identify the write path');
    t.equal(warnings[0][1]?.bootstrapMode, false,
      'warning should indicate bootstrap mode state');
    t.same(warnings[0][1]?.primaryKey, {service_id: 'svc-1'},
      'warning should preserve the primary key');
    t.equal(warnings[0][1]?.attempt, 1,
      'warning should preserve the final SQL attempt number');
    t.equal(warnings[0][1]?.cacheWaitTimedOut, false,
      'warning should distinguish SQL failure from cache wait timeout');
  });

test('CDCIntegrationService - insertSystemTableRow waits for propagated tables', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const {cache, state} = createCacheWaitProbe();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
    systemTableCache: cache,
  });
  service.initialize();

  const data = {
    node_id: 'node-1',
    node_address: 'localhost:8080',
  };

  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, data);

  t.equal(state.onCacheChangeCalls, 1, 'should subscribe to cache waits for nodes table');
  t.ok(state.offCacheChangeCalls >= 1, 'should clean up cache wait subscription');
  t.end();
});

test('CDCIntegrationService - waitForCacheUpdate skips in bootstrap mode', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const {cache, state} = createCacheWaitProbe();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
    systemTableCache: cache,
  });
  service.initialize();

  // Enable bootstrap mode with local partition map to match seed registration path.
  service.setBootstrapMode(true, new Map());

  await service.waitForCacheUpdate(SYSTEM_TABLE_NAME.NODES, 'node-1', true);

  t.equal(
    state.onCacheChangeCalls,
    0,
    'should not subscribe to cache waits while bootstrap mode is enabled',
  );
  t.equal(state.offCacheChangeCalls, 0, 'should not register cache wait listeners');
  t.end();
});

test('CDCIntegrationService - waitForCacheUpdate accepts monotonic minimum fields',
  async (t) => {
    const operationId = 'op-monotonic-1';
    const expectedUpdatedAt = 1000;
    const authoritativeRow = {
      operation_id: operationId,
      status: 'creating',
      workflow_step: 'CREATING',
      updated_at: 1200,
    };
    const listeners = new Set();
    const state = {
      row: null,
      onCacheChangeCalls: 0,
      offCacheChangeCalls: 0,
    };
    const cache = {
      has(tableName, key) {
        return tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
          key === operationId &&
          Boolean(state.row);
      },
      get(tableName, key) {
        if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
          key !== operationId) {
          return null;
        }
        return state.row;
      },
      onCacheChange(listener) {
        state.onCacheChangeCalls++;
        listeners.add(listener);
      },
      offCacheChange(listener) {
        state.offCacheChangeCalls++;
        listeners.delete(listener);
      },
    };
    const cacheMutationTarget = {
      applySystemTableChange(_tableName, _operation, record) {
        state.row = {...record};
        for (const listener of listeners) {
          listener(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
        }
      },
    };
    const sqlQueryEngine = {
      queryExecutor: {
        async executeOnPartition() {
          return {
            success: true,
            participantNodeId: 'node-owner',
            rows: [{...authoritativeRow}],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-owner',
            serviceRowCount: 1,
            routableServiceCount: 1,
            deniedByNodeId: {},
          };
        },
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine,
      systemTableCache: cache,
      cacheMutationTarget,
    });
    const divergenceEvents = [];
    service.initialize();
    service.on(CDC_EVENT.READ_MODEL_DIVERGENCE, (event) => {
      divergenceEvents.push(event);
    });

    await service.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      {
        expectedFields: {updated_at: expectedUpdatedAt},
        minimumFields: {updated_at: expectedUpdatedAt},
        timeoutMs: 5,
      },
    );

    t.same(
      state.row,
      authoritativeRow,
      'authoritative confirmation should repair the writable cache target',
    );
    t.equal(state.onCacheChangeCalls > 0, true, 'should subscribe to cache changes');
    t.equal(state.offCacheChangeCalls > 0, true, 'should clean up cache listener');
    t.equal(divergenceEvents.length, 1,
      'projection lag should emit one divergence event');
    t.equal(divergenceEvents[0]?.divergenceType,
      READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING);
    t.equal(divergenceEvents[0]?.reconciliationReason,
      SQL_RECONCILIATION_REASON.DIAGNOSTICS_CACHE_RECONCILE);
    t.end();
  },
);

test('CDCIntegrationService - authoritative fallback diagnostics track phase windows',
  async (t) => {
    const mockSqlEngine = {
      queryExecutor: {
        async executeOnPartition() {
          return {
            success: true,
            participantNodeId: 'node-owner',
            rows: [{
              node_id: 'node-1',
              node_address: 'localhost:8080',
            }],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-owner',
            serviceRowCount: 1,
            routableServiceCount: 1,
            deniedByNodeId: {},
          };
        },
      },
    };
    const cacheState = {
      row: undefined,
    };
    const cache = {
      has(_tableName, key) {
        return key === 'node-1' && Boolean(cacheState.row);
      },
      get(_tableName, key) {
        return key === 'node-1' ? cacheState.row : undefined;
      },
    };
    const cacheMutationTarget = {
      applySystemTableChange(_tableName, _operation, record) {
        cacheState.row = {...record};
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache: cache,
      cacheMutationTarget,
    });
    service.initialize();

    await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.NODES,
      'node-1',
      true,
      null,
      null,
      {fallbackPhase: 'steady_state'},
    );
    cacheState.row = undefined;
    await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.NODES,
      'node-1',
      true,
      null,
      null,
      {fallbackPhase: 'recovery'},
    );

    const diagnostics = service.getAuthoritativeFallbackDiagnostics();

    t.equal(diagnostics.totalCount, 2, 'should track total fallback diagnostics');
    t.equal(diagnostics.windowCount, 2, 'should track windowed fallback diagnostics');
    t.equal(diagnostics.phases.steady_state.totalCount, 1,
      'should classify steady-state fallback separately');
    t.equal(diagnostics.phases.recovery.totalCount, 1,
      'should classify recovery fallback separately');
    t.equal(diagnostics.outcomes.recovered.totalCount, 2,
      'should classify repaired cache lag separately from failure');
    t.equal(diagnostics.byTable.nodes.totalCount, 2,
      'should group fallback diagnostics by table');
    t.equal(diagnostics.recentEvents.length, 2,
      'should keep recent fallback events for diagnostics');
    t.end();
  },
);

test('CDCIntegrationService - steady-state system table writes prefer local partition services',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const localWrites = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.NODES,
        {
          async executeQuery(sql, params) {
            localWrites.push({sql, params});
            return {
              success: true,
              changes: 1,
            };
          },
        },
      ),
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
      {skipCacheWait: true},
    );

    t.equal(localWrites.length, 1, 'should execute through a local partition service');
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not hit routed SQL when a local system partition service is available',
    );
    t.match(
      localWrites[0]?.sql,
      /^UPDATE nodes SET /,
      'should preserve the system table SQL mutation',
    );
  });

test('CDCIntegrationService - steady-state system table writes skip local followers and use routed SQL',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const localWrites = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.NODES,
        {
          isLeader: false,
          async executeQuery(sql, params) {
            localWrites.push({sql, params});
            return {
              success: true,
              changes: 1,
            };
          },
        },
      ),
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
      {skipCacheWait: true},
    );

    t.equal(
      localWrites.length,
      0,
      'should not execute steady-state writes through a local follower',
    );
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should fall back to routed SQL when only follower-local replicas are present',
    );
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'fallback routed SQL should stay on control-plane recovery readiness',
    );
  });

test('CDCIntegrationService - authoritative cache confirmation prefers local partition replicas',
  async (t) => {
    const operationId = 'op-local-repair';
    const authoritativeRow = {
      operation_id: operationId,
      status: 'creating',
      workflow_step: 'CREATING',
      updated_at: 500,
    };
    const cacheState = {
      row: null,
    };
    const sqlQueryEngine = {
      executedQueries: [],
      async executeQuery(sql, params = []) {
        this.executedQueries.push({sql, params});
        return {
          success: true,
          rows: [{...authoritativeRow}],
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine,
      systemTableCache: {
        has() {
          return Boolean(cacheState.row);
        },
        get() {
          return cacheState.row;
        },
      },
      cacheMutationTarget: {
        applySystemTableChange(_tableName, _operation, row) {
          cacheState.row = {...row};
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          async executeQuery(sql, params) {
            t.equal(
              params[0],
              operationId,
              'local authoritative read should preserve bound parameters',
            );
            return {
              success: true,
              rows: sql.includes('WHERE operation_id = ?') ?
                [{...authoritativeRow}] :
                [],
            };
          },
        },
      ),
    });
    const divergenceEvents = [];
    service.initialize();
    service.on(CDC_EVENT.READ_MODEL_DIVERGENCE, (event) => {
      divergenceEvents.push(event);
    });

    const repaired = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      null,
      null,
      {fallbackPhase: 'recovery'},
    );

    t.equal(repaired, true,
      'should confirm the authoritative row without routed SQL');
    t.same(cacheState.row, authoritativeRow,
      'authoritative confirmation should hydrate the writable cache target');
    t.equal(
      sqlQueryEngine.executedQueries.length,
      0,
      'should not use routed SQL when local authoritative replicas are available',
    );
    t.equal(divergenceEvents.length, 1,
      'local authoritative confirmation should emit a cache-lag divergence');
  });

test('CDCIntegrationService - leader-only authoritative reads fall back to the owner RPC lane',
  async (t) => {
    const ownerRpcReads = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot() {
            return {
              canonicalLeaderNodeId: 'node-sql-leader',
              serviceRowCount: 2,
              routableServiceCount: 1,
              deniedByNodeId: {},
            };
          },
          async executeOnPartition(partitionId, sql, params = [], _forRead,
            _preferLeader, _preferSameLatencyGroup, options = {}) {
            ownerRpcReads.push({partitionId, sql, params, options});
            return {
              success: true,
              participantNodeId: 'node-sql-leader',
              rows: [{
                operation_id: 'op-sql-fallback',
                workflow_step: 'PENDING',
              }],
            };
          },
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          isLeader: false,
          async executeQuery() {
            return {
              success: true,
              rows: [{
                operation_id: 'op-local-follower',
              }],
            };
          },
        },
      ),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-sql-fallback'],
      {
        localReadConsistency: 'local_leader',
        queryOptions: {timeoutMs: 1234},
      },
    );

    t.equal(result.source, 'owner_rpc_lane', 'should fall back when no local leader is available');
    t.equal(ownerRpcReads.length, 1, 'should use the owner RPC lane once');
    t.equal(ownerRpcReads[0]?.options?.timeoutMs, 1234, 'should preserve query options');
    t.equal(
      ownerRpcReads[0]?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'owner RPC fallback should default to recovery eligibility when callers omit a readiness dimension',
    );
    t.equal(result.localReadHit, false, 'owner RPC fallback should not mark a local read hit');
    t.equal(result.systemTableDiagnostics?.routedToNode, 'node-sql-leader',
      'owner RPC fallback should record the routed leader hint');
    t.equal(result.systemTableDiagnostics?.queryTimeoutMs, 1234,
      'owner RPC fallback should record the query timeout');
  });

test('CDCIntegrationService - leader-only authoritative reads can fall back to local replicas',
  async (t) => {
    const sqlReads = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot() {
            return {
              canonicalLeaderNodeId: 'node-local-leader',
              serviceRowCount: 2,
              routableServiceCount: 1,
              deniedByNodeId: {},
            };
          },
        },
        async executeQuery(sql, params = [], options = {}) {
          sqlReads.push({sql, params, options});
          return {
            success: true,
            rows: [],
          };
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          isLeader: false,
          async executeQuery(sql, params) {
            t.equal(
              params[0],
              'op-local-fallback',
              'local replica fallback should preserve query parameters',
            );
            return {
              success: true,
              rows: [{
                operation_id: 'op-local-fallback',
                workflow_step: 'PENDING',
              }],
            };
          },
        },
      ),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-local-fallback'],
      {
        localReadConsistency: 'local_leader',
        replicaFallbackConsistency: 'any_replica',
      },
    );

    t.equal(
      result.source,
      'local_partition_replica',
      'should use a local follower before routed SQL when replica fallback is allowed',
    );
    t.equal(sqlReads.length, 0, 'should not reach routed SQL fallback');
    t.equal(result.rows.length, 1, 'should return the local replica rows');
    t.equal(result.localReadHit, true, 'local replica read should mark a local read hit');
    t.equal(result.localReplicaFallbackHit, true,
      'local replica fallback should record the fallback path');
    t.equal(result.systemTableDiagnostics?.leaderNodeId, 'node-local-leader',
      'local replica fallback should include the canonical leader hint');
  });

test('CDCIntegrationService - authoritative reads can prefer owner RPC over available local replicas',
  async (t) => {
    let localReadCount = 0;
    let ownerRpcReadCount = 0;
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        queryExecutor: {
          async executeOnPartition() {
            ownerRpcReadCount += 1;
            return {
              success: true,
              participantNodeId: 'node-sql-leader',
              rows: [{
                operation_id: 'op-owner-rpc-preferred',
                workflow_step: 'OWNER_RPC',
              }],
            };
          },
          getPartitionRoutingSnapshot() {
            return {
              canonicalLeaderNodeId: 'node-sql-leader',
              serviceRowCount: 2,
              routableServiceCount: 2,
              deniedByNodeId: {},
            };
          },
        },
        async executeQuery() {
          return {
            success: true,
            rows: [],
          };
        },
      },
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          isLeader: true,
          async executeQuery() {
            localReadCount += 1;
            return {
              success: true,
              rows: [{
                operation_id: 'op-owner-rpc-preferred',
                workflow_step: 'LOCAL_REPLICA',
              }],
            };
          },
        },
      ),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-owner-rpc-preferred'],
      {
        localReadConsistency: 'local_leader',
        preferOwnerRpcRead: true,
      },
    );

    t.equal(localReadCount, 1,
      'owner-rpc preference should keep one local read available as a fallback');
    t.equal(ownerRpcReadCount, 1,
      'owner-rpc preference should query the owner lane even when a local replica is available');
    t.equal(result.source, 'owner_rpc_lane',
      'owner-rpc preference should select the owner lane result');
    t.equal(result.localReadHit, false,
      'owner-rpc preference should not report a local authoritative hit when owner RPC wins');
    t.same(result.rows, [{
      operation_id: 'op-owner-rpc-preferred',
      workflow_step: 'OWNER_RPC',
    }], 'owner-rpc preference should return the owner lane rows');
  });

test('CDCIntegrationService - strict owner-RPC authoritative reads fail ' +
  'closed instead of falling back to local replicas',
async (t) => {
  let localReadCount = 0;
  let ownerRpcReadCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition() {
          ownerRpcReadCount += 1;
          return {
            success: false,
            error: 'owner-rpc-read-failed',
            rows: [],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 2,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {
        isLeader: true,
        async executeQuery() {
          localReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: 'op-owner-rpc-required',
              workflow_step: 'LOCAL_REPLICA',
            }],
          };
        },
      },
    ),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-owner-rpc-required'],
    {
      localReadConsistency: 'local_leader',
      preferOwnerRpcRead: true,
      requireOwnerRpcRead: true,
    },
  );

  t.equal(localReadCount, 1,
    'strict owner-rpc mode may still probe local rows but must not return them');
  t.equal(ownerRpcReadCount, 1,
    'strict owner-rpc mode should still attempt owner-rpc reads');
  t.equal(result.success, false,
    'strict owner-rpc mode should fail when owner-rpc reads fail');
  t.equal(result.source, 'owner_rpc_lane',
    'strict owner-rpc mode should surface owner-rpc failure source');
  t.equal(result.localReadHit, false,
    'strict owner-rpc mode must not report local authoritative hits on failure');
  t.same(
    Array.isArray(result.rows) ? result.rows : [],
    [],
    'strict owner-rpc mode should not return local fallback rows',
  );
});

test('CDCIntegrationService - strict owner-RPC reads still use owner lane ' +
  'when SQL fallback is disabled',
async (t) => {
  let ownerRpcReadCount = 0;
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition() {
          ownerRpcReadCount += 1;
          return {
            success: true,
            rows: [{
              operation_id: 'op-owner-rpc-only',
              workflow_step: 'OWNER_RPC',
            }],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-sql-leader',
            serviceRowCount: 2,
            routableServiceCount: 2,
            deniedByNodeId: {},
          };
        },
      },
      async executeQuery() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-owner-rpc-only'],
    {
      preferOwnerRpcRead: true,
      requireOwnerRpcRead: true,
      allowSqlFallback: false,
    },
  );

  t.equal(ownerRpcReadCount, 1,
    'strict owner-rpc mode should still attempt the owner lane');
  t.equal(result.success, true,
    'strict owner-rpc mode should succeed through owner lane without SQL fallback');
  t.equal(result.source, 'owner_rpc_lane',
    'strict owner-rpc mode should preserve owner-lane source');
  t.same(result.rows, [{
    operation_id: 'op-owner-rpc-only',
    workflow_step: 'OWNER_RPC',
  }], 'strict owner-rpc mode should return owner-lane rows');
});

test('CDCIntegrationService - authoritative reads defer before owner RPC fallback when local query transport is not ready and fallback is disabled',
  async (t) => {
    let sqlReadCount = 0;
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        async executeQuery() {
          sqlReadCount++;
          return {
            success: true,
            rows: [{operation_id: 'op-should-not-run'}],
          };
        },
      },
      partitionServicesProvider: () => new Map(),
    });
    service.initialize();
    service.setMessageRouter({
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 321,
        };
      },
    });

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'SELECT * FROM replica_operations WHERE operation_id = ?',
      ['op-deferred'],
      {allowOwnerRpcFallback: false},
    );

    t.equal(result.success, false,
      'authoritative read should fail closed while local query transport is unavailable');
    t.equal(result.errorCode, 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      'authoritative read should preserve the canonical typed transport error');
    t.equal(result.deferRetry, true,
      'authoritative read should preserve typed defer semantics');
    t.equal(result.retryAfterMs, 321,
      'authoritative read should preserve retryAfterMs from the transport owner');
    t.equal(result.error, 'query ingress owner not ready',
      'authoritative read should preserve the owner reason');
    t.equal(result.source, 'query_transport_preflight',
      'authoritative read should report the preflight gate as the source');
    t.equal(sqlReadCount, 0,
      'authoritative read should not fan out through routed SQL when local query transport is not ready');
  });

test('CDCIntegrationService - authoritative merge prefers fresher heartbeat rows',
  async (t) => {
    const partitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES];
    const olderRow = {
      node_id: 'node-merge-freshness',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 16000,
    };
    const newerRow = {
      node_id: 'node-merge-freshness',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 5000,
      ready_lease_expires_at: 20000,
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: createMockSqlQueryEngine(),
      partitionServicesProvider: () => new Map([
        ['nodes-leader', {
          partitionId,
          replicaId: `${partitionId}-r1`,
          initialized: true,
          isLeader: true,
          async executeQuery() {
            return {
              success: true,
              rows: [{...olderRow}],
            };
          },
        }],
        ['nodes-follower', {
          partitionId,
          replicaId: `${partitionId}-r2`,
          initialized: true,
          isLeader: false,
          async executeQuery() {
            return {
              success: true,
              rows: [{...newerRow}],
            };
          },
        }],
      ]),
    });
    service.initialize();

    const result = await service.executeAuthoritativeSystemTableRead(
      SYSTEM_TABLE_NAME.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-merge-freshness'],
      {localReadConsistency: 'any_replica'},
    );

    t.equal(result.success, true, 'authoritative local read should succeed');
    t.equal(result.source, 'local_partition_replica',
      'authoritative read should stay on local replicas');
    t.equal(result.rows.length, 1, 'replica rows should merge by primary key');
    t.same(result.rows[0], newerRow,
      'merged authoritative row should retain freshest heartbeat evidence');
  });

test('CDCIntegrationService - authoritative read re-seeds bootstrap ' +
  'overlay when the owner RPC lane returns partition-not-found (uses ' +
  'installRecoveryRoutingOverlayEntry)', async (t) => {
  // Regression: after seed restart, follower cache is empty and bootstrap
  // overlay was deleted. executeAuthoritativeSystemTableRead must re-seed
  // the overlay via installRecoveryRoutingOverlayEntry using connected
  // nodes from the message router, then retry the query so the circular
  // dependency (empty cache → no partitions → Table not found → repair
  // fails → cache stays empty) is broken.
  const tableName = SYSTEM_TABLE_NAME.NODES;
  const expectedPartitionId = INITIAL_PARTITION_IDS[tableName];
  const queryAttempts = [];
  let installCalls = 0;
  let installedServiceRows = null;

  const mockSqlEngine = {
    installRecoveryRoutingOverlayEntry(partitionId, tbl, serviceRows) {
      installCalls++;
      installedServiceRows = serviceRows;
      t.equal(partitionId, expectedPartitionId,
        'overlay install should use the initial partition ID');
      t.equal(tbl, tableName,
        'overlay install should reference the correct table');
      return true;
    },
  };
  mockSqlEngine.queryExecutor = {
    async executeOnPartition(partitionId, sql, params = [], _forRead,
      _preferLeader, _preferSameLatencyGroup, options = {}) {
      queryAttempts.push({partitionId, sql, params, options});
      if (queryAttempts.length === 1) {
        return {
          success: false,
          error: `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`,
          errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND,
        };
      }
      return {
        success: true,
        participantNodeId: 'seed-node',
        rows: [{node_id: 'node-recovered', status: 'active'}],
        count: 1,
      };
    },
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'seed-node',
        serviceRowCount: 2,
        routableServiceCount: 2,
        deniedByNodeId: {},
      };
    },
  };

  const connectedNodeIds = ['seed-node', 'peer-node-2'];
  const mockMessageRouter = {
    getConnectedNodes() {
      return connectedNodeIds;
    },
  };

  const service = new CDCIntegrationService({
    nodeId: 'follower-node',
    sqlQueryEngine: mockSqlEngine,
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();
  service.setMessageRouter(mockMessageRouter);

  const result = await service.executeAuthoritativeSystemTableRead(
    tableName,
    `SELECT * FROM ${tableName}`,
  );

  t.equal(result.success, true,
    'authoritative read should succeed after overlay re-seed');
  t.equal(result.rows.length, 1,
    'should return the rows from the retried query');
  t.equal(result.source, 'owner_rpc_lane',
    'source should report the owner RPC lane after retry');
  t.equal(queryAttempts.length, 2,
    'should attempt the query twice (fail + retry)');
  t.equal(installCalls, 1,
    'should install recovery overlay exactly once');
  t.equal(installedServiceRows.length, connectedNodeIds.length,
    'should create one service row per connected node');
  t.equal(installedServiceRows[0].partition_id, expectedPartitionId,
    'service row should carry the correct partition_id');
  t.equal(installedServiceRows[0].node_id, connectedNodeIds[0],
    'service row node_id should match connected node');
  t.ok(installedServiceRows[0].address.includes(expectedPartitionId),
    'service row address should contain the partition ID');
});

test('CDCIntegrationService - authoritative read does not re-seed ' +
  'overlay for non-partition-not-found errors', async (t) => {
  // Ensure the overlay re-seed path only triggers for TABLE_NOT_FOUND,
  // not for other SQL failures.
  let installCalls = 0;
  const mockSqlEngine = {
    installRecoveryRoutingOverlayEntry() {
      installCalls++;
      return true;
    },
  };
  mockSqlEngine.queryExecutor = {
    async executeOnPartition() {
      return {
        success: false,
        error: 'Connection refused',
        errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
      };
    },
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'some-node',
        serviceRowCount: 1,
        routableServiceCount: 1,
        deniedByNodeId: {},
      };
    },
  };

  const mockMessageRouter = {
    getConnectedNodes() {
      return ['some-node'];
    },
  };

  const service = new CDCIntegrationService({
    nodeId: 'follower-node',
    sqlQueryEngine: mockSqlEngine,
    partitionServicesProvider: () => new Map(),
  });
  service.initialize();
  service.setMessageRouter(mockMessageRouter);

  const result = await service.executeAuthoritativeSystemTableRead(
    SYSTEM_TABLE_NAME.NODES,
    'SELECT * FROM nodes',
  );

  t.equal(result.success, false,
    'should return failure for non-table-not-found errors');
  t.equal(installCalls, 0,
    'should not re-seed overlay for non-table-not-found errors');
});

test('CDCIntegrationService - updateSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const whereClause = {node_id: 'node-1'};
  const data = {
    status: 'suspected',
    last_heartbeat: Date.now(),
  };

  const result = await service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    whereClause,
    data,
  );

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.UPDATE, 'should be UPDATE operation');
  t.equal(result.tableName, SYSTEM_TABLE_NAME.NODES, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('UPDATE'),
    'should be UPDATE query',
  );
  t.end();
});

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
    t.equal(
      mockSqlEngine.executedQueries[0]?.options?.timeoutMs,
      4321,
      'should pass query timeout through routed SQL execution options',
    );
  },
);

test('CDCIntegrationService - routed system-table writes default to control-plane recovery eligibility',
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
      'critical',
      'internal system-table writes should claim the critical delivery lane by default',
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
        return tableName === SYSTEM_TABLE_NAME.NODES && key === 'node-1';
      },
      get(tableName, key) {
        if (tableName !== SYSTEM_TABLE_NAME.NODES || key !== 'node-1') {
          return undefined;
        }
        return {
          node_id: 'node-1',
          status: 'active',
          updated_at: 100,
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

    await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        {node_id: 'node-1'},
        {status: 'suspected', updated_at: 200},
        {
          expectedCacheFields: {
            status: 'suspected',
            updated_at: 200,
          },
        },
      ),
      /cache update/i,
      'should fail closed when cache never reflects the updated row',
    );
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

test('CDCIntegrationService - tracks epochChanges in stats', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const epochManager = new AssignmentEpochManager({nodeId: 'test-node'});
  epochManager.initialize();
  service.setEpochManager(epochManager);

  // Apply two epochs
  for (let i = 1; i <= 2; i++) {
    const epoch = new AssignmentEpoch({
      epoch: i,
      assignments: {'partition-1': ['node-1']},
      timestamp: Date.now().toString(),
      proposedBy: 'other-node',
    });

    const cdcEvent = {
      tableName: SYSTEM_TABLE_NAME.CONFIG,
      operation: 'UPDATE',
      data: {
        config_key: EPOCH_CONFIG_KEY,
        config_value: epoch.toObject(),
      },
    };

    service.handleEpochChangeCDC(cdcEvent);
  }

  const stats = service.getStats();
  t.equal(stats.epochChanges, 2, 'should track epoch changes');
  t.end();
});

test('CDCIntegrationService - EPOCH_CONFIG_KEY is exported', async (t) => {
  t.equal(EPOCH_CONFIG_KEY, 'current_epoch', 'should export correct config key');
  t.end();
});


// Import EventEmitter for creating mock rebalancer
import {EventEmitter} from 'events';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';

/**
 * Create a mock rebalancer for testing CDC integration.
 * Mimics the event-emitting behavior of UnifiedRebalancer.onNodeStateChange().
 * @return {Object} Mock rebalancer with onNodeStateChange method.
 */
function createMockRebalancer() {
  const emitter = new EventEmitter();
  emitter.onNodeStateChange = function(nodeId, oldState, newState) {
    // Emit nodeStateChange event (always)
    this.emit('nodeStateChange', {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
    });

    // Determine if rebalancing is needed
    let rebalanceNeeded = false;
    let reason = null;

    if (newState === NodeState.READY && oldState !== NodeState.READY) {
      rebalanceNeeded = true;
      reason = 'node_became_ready';
    }
    if (newState === NodeState.DRAINING) {
      rebalanceNeeded = true;
      reason = 'node_draining';
    }
    if (oldState === NodeState.READY && newState !== NodeState.READY &&
        newState !== NodeState.DRAINING) {
      rebalanceNeeded = true;
      reason = 'node_left_ready';
    }
    if (newState === NodeState.STOPPED) {
      rebalanceNeeded = true;
      reason = 'node_stopped';
    }

    if (rebalanceNeeded) {
      this.emit('rebalanceNeeded', {
        nodeId,
        oldState,
        newState,
        reason,
        timestamp: Date.now(),
      });
    }
  };
  return emitter;
}

test('CDCIntegrationService - setRebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  const rebalancer = createMockRebalancer();

  service.setRebalancer(rebalancer);

  t.equal(service.rebalancer, rebalancer, 'should set rebalancer');
  t.end();
});

test('CDCIntegrationService - setRebalancer throws on null', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  try {
    service.setRebalancer(null);
    t.fail('should throw error for null rebalancer');
  } catch (error) {
    t.ok(error.message.includes('rebalancer is required'), 'should have error message');
  }
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC processes valid event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.nodeId, 'node-1', 'should return node ID');
  t.equal(result.newState, NodeState.READY, 'should return new state');
  t.equal(result.stateChanged, true, 'should indicate state changed');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC emits nodeStateChange event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const events = [];
  service.on('nodeStateChange', (e) => events.push(e));

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  service.handleNodeStateCDC(cdcEvent);

  t.equal(events.length, 1, 'should emit one nodeStateChange event');
  t.equal(events[0].nodeId, 'node-1', 'event should have node ID');
  t.equal(events[0].newState, NodeState.READY, 'event should have new state');
  t.equal(events[0].source, 'cdc', 'event should have cdc source');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC triggers rebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const rebalancer = createMockRebalancer();
  const rebalancerEvents = [];
  rebalancer.on('nodeStateChange', (e) => rebalancerEvents.push(e));

  service.setRebalancer(rebalancer);

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  service.handleNodeStateCDC(cdcEvent);

  t.equal(rebalancerEvents.length, 1, 'should trigger rebalancer');
  t.equal(rebalancerEvents[0].nodeId, 'node-1', 'rebalancer should receive node ID');
  t.equal(rebalancerEvents[0].newState, NodeState.READY, 'rebalancer should receive new state');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects non-nodes table', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.CONFIG,
    operation: 'UPDATE',
    data: {
      config_key: 'some_key',
      config_value: 'some_value',
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Not a nodes table event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects invalid event', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const result = service.handleNodeStateCDC(null);

  t.equal(result.processed, false, 'should not process null event');
  t.ok(result.error.includes('Invalid CDC event'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects missing node_id', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      status: NodeState.READY,
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing node_id'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC rejects missing status', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
    },
  };

  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, false, 'should not process');
  t.ok(result.error.includes('Missing status'), 'should have error message');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC tracks state changes', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // First state change: null -> JOINING
  const event1 = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'INSERT',
    data: {
      node_id: 'node-1',
      status: NodeState.JOINING,
    },
  };
  const result1 = service.handleNodeStateCDC(event1);
  t.equal(result1.oldState, null, 'first event should have null old state');
  t.equal(result1.newState, NodeState.JOINING, 'first event should have JOINING new state');

  // Second state change: JOINING -> READY
  const event2 = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  const result2 = service.handleNodeStateCDC(event2);
  t.equal(result2.oldState, NodeState.JOINING, 'second event should have JOINING old state');
  t.equal(result2.newState, NodeState.READY, 'second event should have READY new state');

  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC skips unchanged state', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const events = [];
  service.on('nodeStateChange', (e) => events.push(e));

  // First event sets state to READY
  const event1 = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  service.handleNodeStateCDC(event1);

  // Second event with same state
  const event2 = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };
  const result = service.handleNodeStateCDC(event2);

  t.equal(result.processed, true, 'should process event');
  t.equal(result.stateChanged, false, 'should indicate state not changed');
  t.equal(events.length, 1, 'should only emit one event (for first change)');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC tracks nodeStateChanges in stats', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // Process multiple state changes
  const states = [NodeState.JOINING, NodeState.READY, NodeState.DRAINING];
  for (const status of states) {
    const cdcEvent = {
      tableName: SYSTEM_TABLE_NAME.NODES,
      operation: 'UPDATE',
      data: {
        node_id: 'node-1',
        status,
      },
    };
    service.handleNodeStateCDC(cdcEvent);
  }

  const stats = service.getStats();
  t.equal(stats.nodeStateChanges, 3, 'should track node state changes');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC without rebalancer', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // Don't set rebalancer

  const cdcEvent = {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  };

  // Should not throw, just skip rebalancer notification
  const result = service.handleNodeStateCDC(cdcEvent);

  t.equal(result.processed, true, 'should process event without rebalancer');
  t.equal(result.stateChanged, true, 'should indicate state changed');
  t.end();
});

test('CDCIntegrationService - handleNodeStateCDC handles DRAINING state', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const rebalancer = createMockRebalancer();
  const rebalanceNeededEvents = [];
  rebalancer.on('rebalanceNeeded', (e) => rebalanceNeededEvents.push(e));

  service.setRebalancer(rebalancer);

  // First set to READY
  service.handleNodeStateCDC({
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.READY,
    },
  });

  // Then transition to DRAINING
  service.handleNodeStateCDC({
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: 'UPDATE',
    data: {
      node_id: 'node-1',
      status: NodeState.DRAINING,
    },
  });

  // Rebalancer should emit rebalanceNeeded for DRAINING
  t.ok(
    rebalanceNeededEvents.some((e) => e.reason === 'node_draining'),
    'should trigger rebalance for draining node',
  );
  t.end();
});

test('CDCIntegrationService - setBootstrapMode enables bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('partition-1', {id: 'partition-1'});
  mockPartitionServices.set('partition-2', {id: 'partition-2'});

  service.setBootstrapMode(true, mockPartitionServices);

  t.equal(service.bootstrapMode, true, 'should enable bootstrap mode');
  t.equal(service.localPartitionServices, mockPartitionServices, 'should store partition services');
  t.end();
});

test('CDCIntegrationService - setBootstrapMode disables bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('partition-1', {id: 'partition-1'});

  service.setBootstrapMode(true, mockPartitionServices);
  t.equal(service.bootstrapMode, true, 'should enable bootstrap mode');

  service.setBootstrapMode(false, null);

  t.equal(service.bootstrapMode, false, 'should disable bootstrap mode');
  t.equal(service.localPartitionServices, null, 'should clear partition services');
  t.end();
});

test('CDCIntegrationService - clearBootstrapMode disables bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('partition-1', {id: 'partition-1'});

  service.setBootstrapMode(true, mockPartitionServices);
  t.equal(service.bootstrapMode, true, 'should enable bootstrap mode');

  service.clearBootstrapMode();

  t.equal(service.bootstrapMode, false, 'should disable bootstrap mode');
  t.equal(service.localPartitionServices, null, 'should clear partition services');
  t.end();
});

test('CDCIntegrationService - setBootstrapMode requires Map when enabling', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  try {
    service.setBootstrapMode(true, null);
    t.fail('should throw error when enabling without partition services');
  } catch (error) {
    t.ok(error.message.includes('requires a Map'), 'should throw error about Map requirement');
  }

  try {
    service.setBootstrapMode(true, {});
    t.fail('should throw error when enabling with non-Map object');
  } catch (error) {
    t.ok(error.message.includes('requires a Map'), 'should throw error about Map requirement');
  }

  t.end();
});

test('CDCIntegrationService - bootstrap mode starts disabled', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.bootstrapMode, false, 'should start with bootstrap mode disabled');
  t.equal(service.localPartitionServices, null, 'should start with null partition services');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from INSERT', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'INSERT INTO services (service_id, address) VALUES (?, ?)',
  );

  t.equal(tableName, 'services', 'should extract table name from INSERT');
  t.end();
});

test('extractTableNameFromSQL extracts from INSERT OR REPLACE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'INSERT OR REPLACE INTO partitions (partition_id, table_name) VALUES (?, ?)',
  );

  t.equal(tableName, 'partitions', 'should extract table name from INSERT OR REPLACE');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from UPDATE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'UPDATE nodes SET status = ? WHERE node_id = ?',
  );

  t.equal(tableName, 'nodes', 'should extract table name from UPDATE');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL extracts from DELETE', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const tableName = service.extractTableNameFromSQL(
    'DELETE FROM replica_operations WHERE operation_id = ?',
  );

  t.equal(tableName, 'replica_operations', 'should extract table name from DELETE');
  t.end();
});

test('CDCIntegrationService - extractTableNameFromSQL returns null for invalid SQL', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  t.equal(service.extractTableNameFromSQL(''), null, 'should return null for empty string');
  t.equal(service.extractTableNameFromSQL(null), null, 'should return null for null');
  t.equal(
    service.extractTableNameFromSQL('INVALID SQL'),
    null,
    'should return null for invalid SQL',
  );
  t.end();
});

test('executeSQLDirectToLocalPartition executes on local partition', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  // Mock partition service
  const mockPartitionService = {
    partitionId: 'services-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async (sql, params) => {
      t.ok(sql.includes('INSERT INTO services'), 'should receive INSERT SQL');
      t.equal(params.length, 2, 'should receive params');
      return {success: true, affectedRows: 1};
    },
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set('services-p1', mockPartitionService);

  service.setBootstrapMode(true, mockPartitionServices);

  const result = await service.executeSQLDirectToLocalPartition(
    'INSERT INTO services (service_id, address) VALUES (?, ?)',
    ['service-1', 'node1/service/1'],
  );

  t.ok(result.success, 'should return success');
  t.equal(result.affectedRows, 1, 'should return affected rows');
  t.end();
});

test('executeSQLDirectToLocalPartition throws when not in bootstrap mode', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw error when not in bootstrap mode');
  } catch (error) {
    t.ok(error.message.includes('bootstrap mode'), 'should throw error about bootstrap mode');
  }

  t.end();
});

test('executeSQLDirectToLocalPartition throws when partition not found', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('nodes-p1', {
    partitionId: 'nodes-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async () => ({success: true, affectedRows: 1}),
  });

  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw error when partition not found');
  } catch (error) {
    t.ok(
      error.message.includes('Partition services not initialized') ||
      error.message.includes('No local partition service found'),
      'should throw error about missing partition',
    );
    t.ok(error.message.includes('services'), 'should mention the table name');
  }

  t.end();
});

test('executeSQLDirectToLocalPartition throws when SQL parsing fails', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionServices = new Map();
  mockPartitionServices.set('services-p1', {
    partitionId: 'services-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async () => ({success: true, affectedRows: 1}),
  });

  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition('INVALID SQL', []);
    t.fail('should throw error when SQL parsing fails');
  } catch (error) {
    t.ok(
      error.message.includes('Could not extract table name'),
      'should throw error about table name extraction',
    );
  }

  t.end();
});

test('executeSQLDirectToLocalPartition handles partition errors', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });
  service.initialize();

  const mockPartitionService = {
    partitionId: 'services-p1',
    initialized: true,
    isLeader: true,
    executeLocalQuery: async () => {
      return {success: false, error: 'Partition error'};
    },
  };

  const mockPartitionServices = new Map();
  mockPartitionServices.set('services-p1', mockPartitionService);

  service.setBootstrapMode(true, mockPartitionServices);

  try {
    await service.executeSQLDirectToLocalPartition(
      'INSERT INTO services (service_id) VALUES (?)',
      ['service-1'],
    );
    t.fail('should throw error when partition returns error');
  } catch (error) {
    t.ok(error.message.includes('Partition error'), 'should throw partition error');
  }

  t.end();
});

test('CDCIntegrationService - executeSQL routes to direct partition in bootstrap mode',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });
    service.initialize();

    let directCallMade = false;
    const mockPartitionService = {
      partitionId: 'services-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        directCallMade = true;
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('services-p1', mockPartitionService);

    service.setBootstrapMode(true, mockPartitionServices);

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: 'service-1',
        address: 'node1/service/1',
      },
    );

    t.ok(result.success, 'should succeed');
    t.ok(directCallMade, 'should call direct partition method in bootstrap mode');
    t.end();
  });

test('CDCIntegrationService - executeSQL routes to SQL engine in normal mode',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    // Ensure bootstrap mode is disabled (default state)
    t.equal(service.bootstrapMode, false, 'bootstrap mode should be disabled');

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: 'service-1',
        address: 'node1/service/1',
      },
    );

    t.ok(result.success, 'should succeed');
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should execute query through SQL engine',
    );
    t.ok(
      mockSqlEngine.executedQueries[0].sql.includes('INSERT INTO'),
      'should execute INSERT query',
    );
    t.end();
  });

test('CDCIntegrationService - canWriteSystemTableLocally detects local leader ownership',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      partitionServicesProvider: new Map([
        ['services-p1-r1', {
          partitionId: 'services-p1',
          initialized: true,
          isLeader: true,
          executeQuery: async () => ({success: true, affectedRows: 1}),
        }],
      ]),
    });
    service.initialize();

    t.equal(
      service.canWriteSystemTableLocally(SYSTEM_TABLE_NAME.SERVICES),
      true,
      'should treat a local services leader as a writable owner',
    );
    t.equal(
      service.canWriteSystemTableLocally('not_a_system_table'),
      false,
      'should reject unknown tables',
    );
    t.end();
  });

test('CDCIntegrationService - steady-state writes use isolated SQL sessions',
  async (t) => {
    const observedSessions = [];
    const mockSqlEngine = {
      executedQueries: [],
      async executeQuery(sql, params = [], options = {}) {
        this.executedQueries.push({sql, params, options});
        observedSessions.push(options.sessionId || null);
        if (!options.sessionId || options.sessionId === 'default') {
          return {
            success: false,
            error: 'Transaction already active for this session',
          };
        }
        return {
          success: true,
          affectedRows: 1,
        };
      },
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: 'service-1',
        address: 'node1/service/1',
      },
      {skipCacheWait: true},
    );

    t.equal(result.success, true, 'should succeed with an isolated session');
    t.equal(observedSessions.length, 1, 'should execute one routed SQL write');
    t.type(observedSessions[0], 'string', 'should provide a SQL session id');
    t.not(observedSessions[0], 'default', 'should not reuse the default session');
    t.match(
      observedSessions[0],
      /^cdc-system-write:/,
      'should use the CDC system-write session prefix',
    );
    t.end();
  });

test('CDCIntegrationService - executeSQL switches from bootstrap to normal mode',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    let directCallCount = 0;
    const mockPartitionService = {
      partitionId: 'services-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        directCallCount++;
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('services-p1', mockPartitionService);

    // Enable bootstrap mode
    service.setBootstrapMode(true, mockPartitionServices);

    // First insert should go direct to partition
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, {
      service_id: 'service-1',
      address: 'node1/service/1',
    });

    t.equal(directCallCount, 1, 'should call direct partition in bootstrap mode');
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not call SQL engine in bootstrap mode',
    );

    // Disable bootstrap mode
    service.clearBootstrapMode();

    // Second insert should go through SQL engine
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, {
      service_id: 'service-2',
      address: 'node1/service/2',
    });

    t.equal(
      directCallCount,
      1,
      'should not call direct partition after bootstrap mode disabled',
    );
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should call SQL engine after bootstrap mode disabled',
    );
    t.end();
  });

test('CDCIntegrationService - executeSQL throws when SQL engine missing in normal mode',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });
    service.initialize();

    // No SQL engine set and bootstrap mode disabled
    t.equal(service.bootstrapMode, false, 'bootstrap mode should be disabled');
    t.equal(service.sqlQueryEngine, null, 'SQL engine should be null');

    try {
      await service.insertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, {
        service_id: 'service-1',
        address: 'node1/service/1',
      });
      t.fail('should throw error when SQL engine missing in normal mode');
    } catch (error) {
      t.ok(
        error.message.includes('sqlQueryEngine not provided'),
        'should throw error about missing SQL engine',
      );
    }

    t.end();
  });

test('CDCIntegrationService - executeSQL single code path based on mode flag',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const mockPartitionService = {
      partitionId: 'nodes-p1',
      initialized: true,
      isLeader: true,
      executeLocalQuery: async (_sql, _params) => {
        return {success: true, affectedRows: 1};
      },
    };

    const mockPartitionServices = new Map();
    mockPartitionServices.set('nodes-p1', mockPartitionService);

    // Test 1: Bootstrap mode enabled - should use direct path
    service.setBootstrapMode(true, mockPartitionServices);
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
      node_id: 'node-1',
      node_address: 'localhost:8080',
    });
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not use SQL engine in bootstrap mode',
    );

    // Test 2: Bootstrap mode disabled - should use SQL engine path
    service.clearBootstrapMode();
    await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
      node_id: 'node-2',
      node_address: 'localhost:8081',
    });
    t.equal(
      mockSqlEngine.executedQueries.length,
      1,
      'should use SQL engine in normal mode',
    );

    t.end();
  });

test('CDCIntegrationService - transient detection includes leader-transition query failures',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
    });

    t.equal(
      service.isTransientCdcError('Query failed'),
      true,
      'generic query-failed wrapper should be treated as transient for CDC writes',
    );
    t.equal(
      service.isTransientCdcError('Failed to forward write to leader'),
      true,
      'leader-forwarding failures should be retried',
    );
    t.equal(
      service.isTransientCdcError('Message timeout'),
      true,
      'transport timeout during leader handoff should be retried',
    );
    t.equal(
      service.isTransientCdcError('SQL syntax error near FROM'),
      false,
      'non-transient SQL errors should not be retried',
    );
    t.end();
  });
