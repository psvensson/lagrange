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

test('CDCIntegrationService - insertSystemTableRow can ignore existing rows',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    mockSqlEngine.executeQuery = async (sql, params = [], options = {}) => {
      mockSqlEngine.executedQueries.push({sql, params, options});
      return {
        success: true,
        affectedRows: 0,
        rows: [],
      };
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {
        node_id: 'node-1',
        node_address: 'localhost:8080',
        cpu_cores: 4,
        memory_mb: 8192,
        disk_gb: 100,
        status: 'active',
        last_heartbeat: Date.now(),
        created_at: Date.now(),
      },
      {
        ignoreExisting: true,
      },
    );

    t.match(
      mockSqlEngine.executedQueries[0]?.sql,
      /^INSERT OR IGNORE INTO nodes \(/,
      'idempotent inserts should route through INSERT OR IGNORE',
    );
    t.equal(result.affectedRows, 0, 'ignored duplicates should preserve zero affected rows');
    t.equal(result.partitionResult?.affectedRows, 0,
      'partition result should preserve zero affected rows');
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

    t.ok(warnings.length >= 1,
      'retryable table-write deferrals should log at least one warning');
    t.equal(errors.length, 0,
      'retryable table-write deferrals should not log hard errors');
    const finalWarningPayload = warnings[warnings.length - 1]?.[1] || null;
    t.equal(finalWarningPayload?.code, 'CONTROL_PLANE_PRESSURE_DEGRADED',
      'warning should preserve the typed error code');
    t.equal(finalWarningPayload?.retryAfterMs, 250,
      'warning should preserve the retry-after hint');
    t.equal(finalWarningPayload?.causeId, 'cdc-write-failure:test',
      'warning should preserve the write cause');
    t.equal(finalWarningPayload?.operation, 'UPDATE',
      'warning should identify the failed write operation');
    t.equal(finalWarningPayload?.writeMode, 'sql-routed',
      'warning should identify the write path');
    t.equal(finalWarningPayload?.bootstrapMode, false,
      'warning should indicate bootstrap mode state');
    t.same(finalWarningPayload?.primaryKey, {service_id: 'svc-1'},
      'warning should preserve the primary key');
    t.ok(finalWarningPayload?.attempt > 1,
      'warning should preserve the final SQL attempt number after retries');
    t.equal(finalWarningPayload?.cacheWaitTimedOut, false,
      'warning should distinguish SQL failure from cache wait timeout');
  });

test('CDCIntegrationService preserves explicit deferRetry on routed SQL errors',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      retryMaxAttempts: 1,
      sqlQueryEngine: {
        async executeQuery() {
          return {
            success: false,
            error: 'query transport reconnecting',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            participantFailures: [
              {
                failedPartition: 'nodes-p1',
                failedAddress: 'leader-node/partition/nodes-p1-r1',
              },
            ],
            firstFailedParticipant: {
              failedPartition: 'nodes-p1',
              failedAddress: 'leader-node/partition/nodes-p1-r1',
            },
          };
        },
      },
    });
    service.initialize();

    const error = await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'active'},
        {
          skipCacheWait: true,
        },
      ),
      'explicit routed deferrals should be preserved when CDC wraps failures',
    );

    t.equal(error?.code, 'ROUTER_CONNECTION_CLOSED',
      'wrapped error should preserve the canonical error code');
    t.equal(error?.errorCode, 'ROUTER_CONNECTION_CLOSED',
      'wrapped error should preserve errorCode for downstream owners');
    t.equal(error?.deferRetry, true,
      'wrapped error should preserve explicit deferRetry even without retryAfterMs');
    t.equal(error?.participantFailures?.length, 1,
      'wrapped error should preserve structured participant failures for upstream owners');
    t.equal(error?.firstFailedParticipant?.failedPartition, 'nodes-p1',
      'wrapped error should preserve the canonical first failed participant');
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

test('CDCIntegrationService - waitForCacheUpdate retries authoritative confirmation within the reserved fallback budget',
  async (t) => {
    const operationId = 'op-authoritative-retry';
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
      authoritativeReads: 0,
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
          state.authoritativeReads++;
          return {
            success: true,
            participantNodeId: 'node-owner',
            rows: state.authoritativeReads >= 2 ? [{...authoritativeRow}] : [],
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
      authoritativeFallbackRepairBudgetMs: 10,
      authoritativeFallbackRetryDelayMs: 1,
    });
    service.initialize();

    await service.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      {
        expectedFields: {updated_at: 1000},
        minimumFields: {updated_at: 1000},
        timeoutMs: 20,
      },
    );

    t.equal(
      state.authoritativeReads,
      2,
      'authoritative repair should retry once when the first read still misses the row',
    );
    t.same(
      state.row,
      authoritativeRow,
      'the later authoritative confirmation should still repair the writable cache target',
    );
    t.equal(state.onCacheChangeCalls, 1,
      'cache wait should subscribe once before the fallback tail begins');
    t.equal(state.offCacheChangeCalls, 1,
      'cache wait should clean up its listener after the retry succeeds');
    t.end();
  },
);

test('CDCIntegrationService - waitForCacheUpdate can return pending visibility after authoritative confirmation',
  async (t) => {
    const operationId = 'op-pending-visibility';
    const authoritativeRow = {
      operation_id: operationId,
      status: 'creating',
      workflow_step: 'CREATING',
      updated_at: 1200,
    };
    const listeners = new Set();
    const state = {
      row: null,
      authoritativeReads: 0,
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
        listeners.add(listener);
      },
      offCacheChange(listener) {
        listeners.delete(listener);
      },
    };
    const sqlQueryEngine = {
      queryExecutor: {
        async executeOnPartition() {
          state.authoritativeReads++;
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
      authoritativeFallbackRepairBudgetMs: 10,
      authoritativeFallbackRetryDelayMs: 1,
    });
    service.initialize();

    const result = await service.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      {
        allowPendingVisibility: true,
        timeoutMs: 20,
      },
    );

    t.equal(
      result.visibilityState,
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
      'authoritative confirmation without writable cache repair should return pending visibility',
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
    t.equal(
      result.authoritativeVisibilityConfirmed,
      true,
      'pending visibility should retain the authoritative confirmation signal',
    );
    t.equal(
      state.authoritativeReads,
      1,
      'pending visibility should confirm once instead of looping until timeout',
    );
  },
);


test(
  'CDCIntegrationService allows pending visibility callers to continue ' +
    'when authoritative confirmation is still pending',
  async (t) => {
    const operationId = 'op-confirmation-pending';
    const state = {
      authoritativeReads: 0,
    };
    const cache = {
      get(tableName, key) {
        if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
          key !== operationId) {
          return null;
        }
        return null;
      },
      onCacheChange() {},
      offCacheChange() {},
    };
    const sqlQueryEngine = {
      queryExecutor: {
        async executeOnPartition() {
          state.authoritativeReads += 1;
          return {
            success: true,
            participantNodeId: 'node-owner',
            rows: [{
              operation_id: operationId,
              status: 'preparing',
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
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine,
      systemTableCache: cache,
      authoritativeFallbackRepairBudgetMs: 10,
      authoritativeFallbackRetryDelayMs: 1,
    });
    service.initialize();

    const result = await service.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      {
        allowPendingVisibility: true,
        timeoutMs: 20,
        expectedFields: {status: 'committed'},
      },
    );

    t.equal(
      result.visibilityState,
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
        .AUTHORITATIVE_CONFIRMATION_PENDING,
      'allowPendingVisibility should return one explicit confirmation-pending state instead of timing out',
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
    t.equal(
      result.authoritativeVisibilityConfirmed,
      false,
      'confirmation-pending visibility should not claim authoritative confirmation',
    );
    t.ok(
      state.authoritativeReads >= 1,
      'confirmation-pending visibility should still attempt authoritative confirmation before yielding',
    );
  },
);

test(
  'CDCIntegrationService maps deferred visibility confirmation to retryable ' +
    'contract outcomes',
  async (t) => {
    const operationId = 'op-visibility-deferred';
    const cache = {
      get() {
        return null;
      },
      onCacheChange() {},
      offCacheChange() {},
    };
    const sqlQueryEngine = {
      queryExecutor: {
        async executeOnPartition() {
          return {
            success: false,
            pressureAction: 'defer',
            pressureReason: 'transport_backpressure',
            retryAfterMs: TEST_RETRY_AFTER_MS,
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
      authoritativeFallbackRepairBudgetMs: 10,
      authoritativeFallbackRetryDelayMs: 1,
    });
    service.initialize();

    const result = await service.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
      true,
      {
        allowPendingVisibility: true,
        timeoutMs: 20,
      },
    );

    t.equal(
      result.visibilityState,
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.DEFERRED);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.RETRY);
    t.equal(result.retryAfterMs, TEST_RETRY_AFTER_MS);
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
