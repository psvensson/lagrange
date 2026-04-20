/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  ADMIN_ROUTE,
  CONSISTENCY_MISMATCH_KIND,
} from '../../src/admin/admin-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TraceCollector} from '../../src/debug/trace-collector.js';
import {COLUMN, TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const AUTHORITATIVE_REPAIR_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.TABLES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.REPLICA_OPERATIONS,
]);
const ERROR_UNEXPECTED_AUTHORITATIVE_PUBLISHED_MEMBERSHIP_READ =
  'unexpected_authoritative_published_membership_read';
const TEST_LOCAL_SYSTEM_OBSERVATION_QUERY_ID =
  'q-snapshot-local-services-observation';
const TEST_LOCAL_SYSTEM_OBSERVATION_SQL =
  'SELECT * FROM services WHERE service_type = \'partition\'';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_SERVICE_ID =
  'svc-gap-partition-node-2';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_NODE_ID =
  'node-gap-partition-2';
const TEST_LOCAL_SYSTEM_OBSERVATION_LOCAL_NODE_ID =
  'node-1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_PARTITION_ID =
  'partition-1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_REPLICA_ID =
  'partition-gap-r1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_ADDRESS =
  'node-gap-partition-2/partition/partition-1-r4';
const TEST_LOCAL_SYSTEM_OBSERVATION_ACTIVE_STATUS =
  'active';
const TEST_LOCAL_SYSTEM_OBSERVATION_LANE =
  'snapshot';
const BACKGROUND_REPAIR_SETTLE_TURNS = 8;
const BACKGROUND_REPAIR_SETTLE_DELAY_MS = 0;
const BACKGROUND_REPAIR_WAIT_ATTEMPTS = 40;

async function waitForBackgroundRepairToSettle(
  turnCount = BACKGROUND_REPAIR_SETTLE_TURNS,
)
{
  for (let index = 0; index < turnCount; index += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, BACKGROUND_REPAIR_SETTLE_DELAY_MS);
    });
  }
}

async function waitForBackgroundRepairCondition(
  conditionFn,
  attemptCount = BACKGROUND_REPAIR_WAIT_ATTEMPTS,
)
{
  for (let index = 0; index < attemptCount; index += 1) {
    if (conditionFn()) {
      return true;
    }
    await waitForBackgroundRepairToSettle(1);
  }
  return conditionFn();
}

/**
 * Create a mock SQL query engine.
 * @return {Object} Mock query engine.
 */
function createMockQueryEngine() {
  return {
    executeRequest: async (request) => {
      const sqlLower = request.statement.toLowerCase().trim();

      // Check for error conditions first (before checking statement type)
      if (sqlLower.includes('invalid_table')) {
        return {
          success: false,
          error: 'Table not found: invalid_table',
          errorCode: 'TABLE_NOT_FOUND',
        };
      } else if (sqlLower.includes('syntax_error')) {
        throw new Error('Parse error: syntax error near syntax_error');
      } else if (sqlLower.startsWith('select')) {
        return {
          success: true,
          rows: [{id: '1', name: 'test'}],
          count: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('insert')) {
        return {
          success: true,
          operation: 'INSERT',
          affectedRows: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('update')) {
        return {
          success: true,
          operation: 'UPDATE',
          affectedRows: 2,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('delete')) {
        return {
          success: true,
          operation: 'DELETE',
          affectedRows: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      }

      return {success: true, rows: [], count: 0};
    },
  };
}

/**
 * Create a mock query engine that returns authoritative rows per system table.
 * @param {Object<string, Array<Object>|Function>} rowsByTable
 * @return {Object}
 */
function createSystemTableRepairQueryEngine(rowsByTable = {}) {
  const fallback = createMockQueryEngine();
  const executeRequestCalls = [];
  return {
    executeRequestCalls,
    async executeRequest(request) {
      const statement = String(request?.statement || '').trim();
      executeRequestCalls.push(statement);
      const match = statement.match(/^select \* from ([a-z_]+)$/i);
      if (!match) {
        return fallback.executeRequest(request);
      }
      const tableName = match[1].toLowerCase();
      const value = rowsByTable[tableName];
      const rows = typeof value === 'function' ? value(tableName) : value;
      return {
        success: true,
        rows: Array.isArray(rows) ? rows.map((row) => ({...row})) : [],
        count: Array.isArray(rows) ? rows.length : 0,
        partitions: [`partition-${tableName}`],
        tableName,
      };
    },
  };
}

test('AdminWebSocketAPI - load lane uses serveEligible instead of ' +
  'repair-only readiness', async (t) => {
  let executedQueryCount = 0;
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: {
      executeRequest: async () => {
        executedQueryCount += 1;
        return {
          success: true,
          rows: [{id: '1'}],
          count: 1,
        };
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => ({
        nodeId: 'test-node',
        dimensions: {
          routingReady: true,
          clusterMemberHealthy: true,
          repairEligible: true,
          serveEligible: false,
          loadReady: false,
        },
        runtimeAuthority: {
          state: RUNTIME_AUTHORITY_STATE.CONFIRMED,
          visibility: {
            state: RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED,
          },
        },
        reasons: [
          {code: 'load_not_ready'},
        ],
      }),
    },
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api, 2000, {
    query: {lane: 'load'},
  });

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q-load-lane-serve-gate',
    sql: 'SELECT 1',
  }));

  const result = await waitForMessage(ws);
  t.equal(result.type, MessageType.QUERY_RESULT,
    'should return query_result envelope');
  t.equal(result.queryId, 'q-load-lane-serve-gate',
    'should preserve query id');
  t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
    'serve-only readiness rejection should surface as a typed admin error');
  t.match(
    String(result.error || ''),
    /serve not ready/i,
    'load-lane admission must be keyed off serveEligible',
  );
  t.equal(
    result.details?.loadLaneAdmission?.[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]
      ?.state,
    RUNTIME_AUTHORITY_STATE.CONFIRMED,
    'load-lane admission should preserve runtime authority details on serve-only rejection',
  );
  t.equal(executedQueryCount, 0,
    'load-lane admission should reject before SQL execution');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query_result preserves retry metadata for deferred failures',
  async (t) => {
    const deferredReasonCode = 'publication_epoch_pending';
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => ({
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: ErrorCode.INTERNAL_ERROR,
          deferRetry: true,
          retryAfterMs: 275,
          outcome: 'deferred',
          visibilityState: 'pending_visibility',
          contractState: 'deferred',
          nextAction: 'retry',
          authoritativeVisibilityConfirmed: true,
          reasonCode: deferredReasonCode,
          reasonCodes: [deferredReasonCode],
          failedDimensions: ['publishedConvergencePending'],
          runtimeAuthority: {
            state: 'establishing',
            visibility: {
              state: 'pending_publication',
            },
          },
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-retry-metadata',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-retry-metadata',
      'should preserve query id');
    t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
      'should preserve error code');
    t.equal(result.deferRetry, true,
      'should preserve deferRetry on failed query results');
    t.equal(result.retryAfterMs, 275,
      'should preserve retryAfterMs on failed query results');
    t.equal(result.outcome, 'deferred',
      'should preserve canonical outcome metadata');
    t.equal(result.visibilityState, 'pending_visibility',
      'should preserve mutation visibility state');
    t.equal(result.contractState, 'deferred',
      'should preserve the shared contract state');
    t.equal(result.nextAction, 'retry',
      'should preserve the shared next action');
    t.equal(result.authoritativeVisibilityConfirmed, true,
      'should preserve authoritative visibility confirmation');
    t.equal(result.reasonCode, deferredReasonCode,
      'should preserve the primary authority-establishment reason');
    t.same(result.reasonCodes, [deferredReasonCode],
      'should preserve authority-establishment reason codes');
    t.same(result.failedDimensions, ['publishedConvergencePending'],
      'should preserve failed readiness dimensions');
    t.equal(result.runtimeAuthority?.state, 'establishing',
      'should preserve compact runtime authority state');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane upgrades retryable participant failures',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => ({
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: ErrorCode.INTERNAL_ERROR,
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-retryable-participant-failure',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-load-lane-retryable-participant-failure',
      'should preserve query id');
    t.equal(result.deferRetry, true,
      'load-lane participant failures should defer instead of hard-failing');
    t.equal(result.retryAfterMs, 250,
      'load-lane participant failures should include bounded retry metadata');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane caps SQL timeout and defers timed-out queries',
  async (t) => {
    let observedTimeoutMs = null;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async (sqlRequest) => {
          observedTimeoutMs = Number(sqlRequest?.timeoutMs);
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            success: true,
            rows: [{id: 1}],
            count: 1,
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-timeout-cap',
      sql: 'SELECT 1',
      timeoutMs: 10,
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-load-lane-timeout-cap',
      'should preserve query id');
    t.equal(result.deferRetry, true,
      'timed-out load-lane requests should remain retryable');
    t.equal(result.retryAfterMs, 250,
      'timed-out load-lane requests should include bounded retry metadata');
    t.equal(observedTimeoutMs, 10,
      'load lane should honor bounded caller timeout budgets');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane prefers async readiness when available',
  async (t) => {
    let executedQueryCount = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync: () => ({
          nodeId: 'test-node',
          dimensions: {
            serveEligible: false,
          },
          reasons: [
            {code: 'storage_budget_unavailable'},
          ],
        }),
        async getNodeReadiness() {
          return {
            nodeId: 'test-node',
            dimensions: {
              routingReady: true,
              clusterMemberHealthy: true,
              repairEligible: true,
              serveEligible: true,
              loadReady: true,
            },
            reasons: [],
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-async-readiness',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'async readiness should admit the load-lane query');
    t.equal(executedQueryCount, 1,
      'async readiness should allow SQL execution');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane requests authoritative readiness refresh',
  async (t) => {
    let executedQueryCount = 0;
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: '1'}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        async getNodeReadiness(nodeId, options) {
          readinessCalls.push({nodeId, options});
          return {
            nodeId,
            dimensions: {
              routingReady: true,
              clusterMemberHealthy: true,
              repairEligible: true,
              serveEligible: true,
              loadReady: true,
            },
            reasons: [],
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-authoritative-refresh',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'authoritative readiness refresh should admit the load-lane query');
    t.equal(executedQueryCount, 1,
      'admitted load-lane query should execute once');
    t.same(
      readinessCalls,
      [{
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          preferBackgroundRefreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }],
      'load-lane admission should request cached authoritative readiness',
    );

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - repeated load lane requests reuse cached readiness',
  async (t) => {
    let executedQueryCount = 0;
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{id: String(executedQueryCount)}],
            count: 1,
          };
        },
      },
      controlPlaneReadinessService: {
        async getNodeReadiness(nodeId, options) {
          readinessCalls.push({nodeId, options});
          return {
            nodeId,
            dimensions: {
              routingReady: true,
              clusterMemberHealthy: true,
              repairEligible: true,
              serveEligible: true,
              loadReady: true,
            },
            reasons: [],
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-cached-readiness-1',
      sql: 'SELECT 1',
    }));
    const firstResult = await waitForMessage(ws);
    t.equal(firstResult.type, MessageType.QUERY_RESULT);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-lane-cached-readiness-2',
      sql: 'SELECT 2',
    }));
    const secondResult = await waitForMessage(ws);
    t.equal(secondResult.type, MessageType.QUERY_RESULT);

    t.equal(executedQueryCount, 2, 'both load queries should execute');
    t.same(
      readinessCalls,
      [{
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          preferBackgroundRefreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }, {
        nodeId: 'test-node',
        options: {
          allowAuthoritativeRefresh: true,
          preferBackgroundRefreshOnIneligible: true,
          decisionDimension: 'serveEligible',
          maxCachedAgeMs: 5000,
        },
      }],
      'load-lane readiness should consistently request the ' +
        'cached snapshot window',
    );

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane blocks benchmark table queries until local benchmark admission is ready',
  async (t) => {
    let executedQueryCount = 0;
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalCandidate(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{count: 1}],
            count: 1,
            tableName: 'benchmark_events',
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-benchmark-blocked',
      sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-load-benchmark-blocked',
      'should preserve query id');
    t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
      'blocked benchmark admission should surface as typed admin error');
    t.equal(result.deferRetry, true,
      'blocked benchmark admission should remain retryable');
    t.equal(result.retryAfterMs, 250,
      'blocked benchmark admission should carry bounded retry metadata');
    t.match(
      String(result.error || ''),
      /benchmarkReady=false/i,
      'blocked benchmark admission should report benchmark readiness state',
    );
    t.match(
      String(result.error || ''),
      /local_replica_not_voter_ready/i,
      'blocked benchmark admission should expose canonical readiness reasons',
    );
    t.equal(executedQueryCount, 0,
      'blocked benchmark admission should reject before SQL execution');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane repairs cache-gap admission blockers before rejecting benchmark table queries',
  async (t) => {
    let executedQueryCount = 0;
    const writableCache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(writableCache);

    const authoritativeRowsByTable = {};
    for (const tableName of AUTHORITATIVE_REPAIR_TABLES) {
      authoritativeRowsByTable[tableName] = writableCache.getAll(tableName);
    }

    writableCache.applySystemTableChange(TABLES.TABLES, 'DELETE', {
      id: 'table-benchmark-events',
      table_id: 'table-benchmark-events',
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'DELETE', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
    });

    const repairEngine = createSystemTableRepairQueryEngine(
      authoritativeRowsByTable,
    );
    const authoritativeGateway = createAuthoritativeCacheGateway(writableCache, {
      queryEngine: repairEngine,
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: authoritativeGateway,
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{count: 1}],
            count: 1,
            tableName: 'benchmark_events',
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-benchmark-cache-gap-repair',
      sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
    }));

    const result = await waitForMessage(ws);
    const repairReadTables = getAuthoritativeRepairReadTables(
      repairEngine.executeRequestCalls,
    );

    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.match(
      result.error,
      /serve not ready: load lane admission denied/,
      'first load-lane observation should defer while the shared owner repairs discovery gaps',
    );
    t.equal(executedQueryCount, 0,
      'initial deferred observation should not execute the benchmark query');
    t.equal(authoritativeGateway.executeReadCalls.length > 0, true,
      'cache-gap admission should trigger an authoritative discovery read');
    t.equal(repairReadTables.includes(TABLES.PARTITIONS), true,
      'background repair should refresh partition rows for schema gap recovery');

    const tablesRefreshObserved = await waitForBackgroundRepairCondition(() =>
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.TABLES}`),
    );
    t.equal(
      tablesRefreshObserved,
      true,
      'background repair should widen to TABLES rows for schema gap recovery',
    );
    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-benchmark-cache-gap-repair-retry',
      sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
    }));
    const retryResult = await waitForMessage(ws);

    t.equal(retryResult.error, undefined,
      'retried load-lane query should admit once background discovery repair completes');
    t.equal(executedQueryCount, 1,
      'repaired benchmark admission should execute exactly once');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane admits benchmark table queries on stable local follower',
  async (t) => {
    let executedQueryCount = 0;
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{count: 1}],
            count: 1,
            tableName: 'benchmark_events',
          };
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-benchmark-ready',
      sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'stable local follower should admit benchmark query');
    t.equal(executedQueryCount, 1,
      'admitted benchmark query should execute exactly once');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane admits local voter-ready benchmark queries through transient schema and leadership jitter',
  async (t) => {
    let executedQueryCount = 0;
    const cache = createPopulatedCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{count: 1}],
            count: 1,
            tableName: 'benchmark_events',
          };
        },
      },
    });

    api.serviceDiscovery.resolveServiceDiscoverySnapshot = async () => ({
      services: [{
        replicas: [{
          nodeId: 'node-2',
          benchmarkAdmission: {
            state: 'blocked',
            routingReady: true,
            localReplicaRole: 'follower',
            degradedByOperationIds: [],
            reasons: [
              {code: 'schema_partition_unavailable'},
              {code: 'leadership_unstable'},
            ],
          },
        }],
      }],
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-benchmark-soft-blocker',
      sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'load lane should execute through transient schema+leadership jitter when local voter is ready');
    t.equal(executedQueryCount, 1,
      'soft schema/leadership blockers should not reject before SQL execution');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - load lane admits readiness-only benchmark queries through transient schema and leadership jitter',
  async (t) => {
    let executedQueryCount = 0;
    const cache = createPopulatedCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executedQueryCount += 1;
          return {
            success: true,
            rows: [{count: 1}],
            count: 1,
            tableName: 'benchmark_events',
          };
        },
      },
    });

    api.serviceDiscovery.resolveServiceDiscoverySnapshot = async () => ({
      services: [{
        replicas: [{
          nodeId: 'node-2',
          readiness: {
            benchmarkReady: false,
            routingReady: true,
            reasons: [
              {code: 'schema_partition_unavailable'},
              {code: 'leadership_unstable'},
            ],
          },
        }],
      }],
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api, 2000, {
      query: {lane: 'load'},
    });

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-load-benchmark-soft-blocker-readiness-only',
      sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.error, undefined,
      'load lane should execute through transient schema+leadership jitter when only readiness fallback is available');
    t.equal(executedQueryCount, 1,
      'readiness-only soft blockers should not reject before SQL execution');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - query execution INSERT', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q2',
    sql: 'INSERT INTO test_table (id, name) VALUES (1, "test")',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'q2', 'should have correct queryId');
  t.equal(result.operation, 'INSERT', 'should have operation');
  t.equal(result.affectedRows, 1, 'should have affectedRows');
  t.ok(Array.isArray(result.partitions), 'should have partitions');
  t.equal(result.tableName, 'test_table', 'should have tableName');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query execution UPDATE', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q3',
    sql: 'UPDATE test_table SET name = "updated"',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.operation, 'UPDATE', 'should have UPDATE operation');
  t.equal(result.affectedRows, 2, 'should have affectedRows');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query execution DELETE', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q4',
    sql: 'DELETE FROM test_table WHERE id = 1',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.operation, 'DELETE', 'should have DELETE operation');
  t.equal(result.affectedRows, 1, 'should have affectedRows');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - partition callback execution route', async (t) => {
  let capturedRequest = null;
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: {
      executeRequest: async (request) => {
        capturedRequest = request;
        return {
          success: true,
          executionMode: request.executionMode,
          callbackModuleRef: request.callbackModuleRef,
          callbackExport: request.callbackExport,
          results: [],
          hostResult: {
            state: 'completed',
            processedPartitions: 2,
            failedPartitions: 0,
            totalRows: 4,
          },
        };
      },
    },
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.PARTITION_CALLBACK,
    queryId: 'cb1',
    statement: 'SELECT * FROM test_table',
    parameters: [],
    callbackModuleRef: 'mod-1',
    callbackExport: 'run',
    runtimeKind: 'wasm_component',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'cb1', 'should include callback queryId');
  t.equal(result.operation, 'partition_callback',
    'should label operation as partition_callback');
  t.same(result.hostResult, {
    state: 'completed',
    processedPartitions: 2,
    failedPartitions: 0,
    totalRows: 4,
  }, 'should include structured host result');
  t.equal(capturedRequest.executionMode, 'partition_callback',
    'should route request through partition_callback mode');
  t.equal(capturedRequest.callbackModuleRef, 'mod-1',
    'should pass callbackModuleRef to SqlRequest');
  t.equal(capturedRequest.callbackExport, 'run',
    'should pass callbackExport to SqlRequest');
  t.equal(capturedRequest.runtimeKind, 'wasm_component',
    'should pass runtimeKind to SqlRequest');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - partition callback validation requires callback fields',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.PARTITION_CALLBACK,
      queryId: 'cb-invalid',
      statement: 'SELECT * FROM test_table',
      callbackExport: 'run',
      runtimeKind: 'wasm_component',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT, 'should return query_result envelope');
    t.equal(result.queryId, 'cb-invalid', 'should preserve query id');
    t.equal(result.errorCode, ErrorCode.MALFORMED_JSON,
      'should return malformed error for missing module ref');
    t.ok(result.error, 'should include validation error');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - error handling TABLE_NOT_FOUND', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q5',
    sql: 'SELECT * FROM invalid_table',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'q5', 'should have correct queryId');
  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.TABLE_NOT_FOUND, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - error handling SYNTAX_ERROR', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q6',
    sql: 'syntax_error',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.errorCode, ErrorCode.SYNTAX_ERROR, 'should have SYNTAX_ERROR');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - malformed JSON handling', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send('not valid json');

  const result = await waitForMessage(ws);

  t.equal(result.errorCode, ErrorCode.MALFORMED_JSON, 'should have error code');
  t.ok(result.error, 'should have error message');
  t.ok(result.hint, 'should have hint');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - unknown message type ignored', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  // Send unknown message type (should be ignored)
  ws.send(JSON.stringify({type: 'unknown_type', data: 'test'}));

  // Send a valid query
  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q7',
    sql: 'SELECT 1',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query result');
  t.equal(result.queryId, 'q7', 'should have correct queryId');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - refresh message', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws, message: firstDump} = await connectAndReceive(api);

  t.equal(firstDump.type, MessageType.CACHE_DUMP, 'should receive initial dump');

  ws.send(JSON.stringify({type: MessageType.REFRESH}));

  const secondDump = await waitForMessage(ws);
  t.equal(secondDump.type, MessageType.CACHE_DUMP, 'should receive refresh dump');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - CDC event broadcasting', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});

  const [conn1, conn2] = await Promise.all([
    connectAndReceive(api),
    connectAndReceive(api),
  ]);

  // Broadcast CDC event
  api.broadcastCDCEvent('nodes', 'INSERT', {
    id: 'node-2',
    address: 'localhost:8081',
    status: 'active',
  });

  const [event1, event2] = await Promise.all([
    waitForMessage(conn1.ws),
    waitForMessage(conn2.ws),
  ]);

  t.equal(event1.type, MessageType.CDC_EVENT, 'client 1 should receive event');
  t.equal(event1.table, 'nodes', 'should have correct table');
  t.equal(event1.operation, 'insert', 'should have correct operation');
  t.equal(event1.record.id, 'node-2', 'should have correct record');

  t.equal(event2.type, MessageType.CDC_EVENT, 'client 2 should receive event');

  conn1.ws.close();
  conn2.ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - health endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  await connectAndReceive(api);

  const response = await api.getFastify().inject({method: 'GET', url: '/health'});
  const health = response.json();

  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(health.status, 'healthy', 'should be healthy');
  t.equal(health.nodeId, 'test-node', 'should have nodeId');
  t.equal(health.connectedClients, 1, 'should have 1 connected client');

  await api.shutdown();
});
