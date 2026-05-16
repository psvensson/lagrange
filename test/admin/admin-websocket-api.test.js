/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
} from '../../src/admin/admin-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-snapshot-owner.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const TEST_CONTROL_SNAPSHOT_QUERY_TIMEOUT_MS = 3349;

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

test('AdminWebSocketAPI - sendError preserves structured deferred query ' +
  'metadata', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    sqlQueryEngine: {
      async executeRequest() {
        return {success: true, rows: []};
      },
    },
  });
  const messages = [];
  const clientInfo = {
    id: 'client-1',
    socket: {
      send(payload) {
        messages.push(JSON.parse(payload));
      },
    },
  };

  api.sendError(
    clientInfo,
    'query-1',
    'QUERY_TIMEOUT',
    'query_admission_deferred',
    null,
    {
      deferRetry: true,
      retryAfterMs: 225,
      outcome: 'deferred',
      visibilityState: 'deferred_by_pressure',
      contractState: 'deferred',
      nextAction: 'retry',
      reasonCode: 'control_plane_write_unhealthy',
      reasonCodes: ['control_plane_write_unhealthy'],
      failedDimensions: ['controlPlaneWritable'],
      runtimeAuthority: {state: 'establishing'},
      details: {cause: 'Query timeout after 15000ms'},
    },
  );

  t.equal(messages.length, 1);
  t.equal(messages[0].queryId, 'query-1');
  t.equal(messages[0].deferRetry, true);
  t.equal(messages[0].retryAfterMs, 225);
  t.equal(messages[0].outcome, 'deferred');
  t.equal(messages[0].visibilityState, 'deferred_by_pressure');
  t.equal(messages[0].contractState, 'deferred');
  t.equal(messages[0].nextAction, 'retry');
  t.equal(messages[0].reasonCode, 'control_plane_write_unhealthy');
  t.same(messages[0].reasonCodes, ['control_plane_write_unhealthy']);
  t.same(messages[0].failedDimensions, ['controlPlaneWritable']);
  t.equal(messages[0].runtimeAuthority?.state, 'establishing');
  t.equal(messages[0].details?.cause, 'Query timeout after 15000ms');
});

test('AdminWebSocketAPI - executeSqlRequestWithTimeout forwards an inner ' +
  'completion budget to the SQL query engine', async (t) => {
  let receivedRequest = null;
  const fixedNowMs = 1000;
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    nowFn: () => fixedNowMs,
    sqlQueryEngine: {
      async executeRequest(request) {
        receivedRequest = request;
        return {
          success: true,
          operation: 'CREATE_TABLE',
          affectedRows: 0,
        };
      },
    },
  });

  const result = await api.executeSqlRequestWithTimeout(
    createSqlRequest({
      statement: 'CREATE TABLE users (id TEXT PRIMARY KEY)',
      sessionId: 'create-budget-test',
    }),
    1500,
  );

  t.equal(result.success, true);
  t.equal(receivedRequest.timeoutMs, 1500);
  t.ok(
    receivedRequest.timeoutBudget &&
      typeof receivedRequest.timeoutBudget === 'object',
    'admin query execution should forward one timeout budget object',
  );
  t.ok(
    receivedRequest.timeoutBudget.deadlineMs < fixedNowMs + 1500,
    'inner SQL timeout budget should leave completion margin before the outer admin timeout',
  );
});

/**
 * Extract authoritative repair table names from executed SQL statements.
 * @param {string[]} statements
 * @return {string[]}
 */

/**
 * Create a deterministic authoritative-cache reconcile gateway for tests.
 * @param {SystemTableCache} writableCache
 * @param {Object} [options={}]
 * @param {Object|null} [options.queryEngine]
 * @param {Object<string, Array<Object>|Function>} [options.readRowsByTable]
 * @return {Object}
 */

/**
 * Create a realistic system-table cache for authoritative discovery repair.
 * @param {string} [nodeId='test-node']
 * @return {SystemTableCache}
 */

/**
 * Create local partition-service replicas that answer direct table reads.
 * @param {SystemTableCache} cache
 * @param {Object<string, Array<Object>>} [overrides={}]
 * @return {Map<string, Object>}
 */

/**
 * Create a populated system table cache.
 * @return {SystemTableCache} Populated cache.
 */
function createPopulatedCache() {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', 'INSERT', {
    id: 'node-1',
    address: 'localhost:8080',
    status: 'active',
  });

  cache.applySystemTableChange('services', 'INSERT', {
    id: 'service-1',
    nodeId: 'node-1',
    type: 'partition',
  });

  cache.applySystemTableChange('partitions', 'INSERT', {
    id: 'partition-1',
    tableId: 'table-1',
    keyStart: null,
    keyEnd: null,
  });

  cache.applySystemTableChange('tables', 'INSERT', {
    id: 'table-1',
    name: 'test_table',
  });

  cache.applySystemTableChange('message_groups', 'INSERT', {
    id: 'mg-1',
    replicaCount: 3,
  });

  cache.applySystemTableChange('indices', 'INSERT', {
    id: 'index-1',
    tableId: 'table-1',
    column: 'name',
  });

  return cache;
}

/**
 * Add runtime service-definition and service-endpoint rows for discovery tests.
 * @param {SystemTableCache} cache
 */

/**
 * Seed table-scoped discovery rows where only one node hosts partition replicas.
 * This models routed queryability: all active postgres-wire nodes should remain
 * schema-ready when table metadata is available cluster-wide.
 *
 * @param {SystemTableCache} cache
 */

/**
 * Seed table-scoped discovery rows where a second node hosts a local learner
 * replica for the benchmark partition. The node remains routable for service
 * discovery, but benchmark admission must fail closed until the local replica
 * becomes voter-ready.
 *
 * @param {SystemTableCache} cache
 */

/**
 * Seed table-scoped discovery rows where a second node hosts a local candidate
 * replica for the benchmark partition. The node remains routable for service
 * discovery, but benchmark admission must fail closed until the local replica
 * converges to a stable voter role.
 *
 * @param {SystemTableCache} cache
 */

/**
 * Seed table-scoped discovery rows where a second node hosts a stable local
 * follower replica for the benchmark partition.
 *
 * @param {SystemTableCache} cache
 */

/**
 * Stage split-child partition metadata for benchmark_events without
 * advancing the table's active serving partition version.
 *
 * @param {SystemTableCache} cache
 * @param {Object} [options={}]
 * @param {number} [options.activePartitionVersion=1]
 * @param {number} [options.partitionCount=1]
 * @return {Object}
 */

/**
 * Seed table-scoped discovery rows without a local TABLES row.
 * This verifies applied schema watermark fallback from partition metadata.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */

/**
 * Seed table-scoped discovery rows without local TABLES row and without
 * partition table_name metadata. Partition matching must rely on table_id.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */

/**
 * Connect to AdminWebSocketAPI in-process and wait for first message.
 * Avoids binding TCP ports (not permitted in some test sandboxes).
 * @param {AdminWebSocketAPI} api - Admin API instance.
 * @param {number} timeout - Timeout in ms.
 * @param {Object|null} [request] - Optional synthetic request.
 * @return {Promise<{ws: Object, message: Object}>}
 */
async function connectAndReceive(api, timeout = 2000, request = null) {
  const {clientSocket, serverSocket} = createInProcWebSocketPair();
  api.handleConnection(serverSocket, request);
  const message = await waitForMessage(clientSocket, timeout);
  return {ws: clientSocket, message};
}

/**
 * Wait for next message from WebSocket.
 * @param {WebSocket} ws - WebSocket instance.
 * @param {number} timeout - Timeout in ms.
 * @return {Promise<Object>} Parsed message.
 */
function waitForMessage(ws, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Assert no additional message arrives within timeout.
 * @param {Object} ws
 * @param {number} timeout
 * @return {Promise<void>}
 */

/**
 * Create a mock test-run service for HTTP route tests.
 * @param {Object} [overrides]
 * @return {Object}
 */

/**
 * Create a mock debug metadata store for debug ingress route tests.
 * @param {Object} [overrides]
 * @return {Object}
 */

test('AdminWebSocketAPI - initialization', async (t) => {
  const api = new AdminWebSocketAPI({nodeId: 'test-node'});

  t.equal(api.isInitialized(), false, 'should not be initialized initially');

  await api.initialize(0, {listen: false});

  t.equal(api.isInitialized(), true, 'should be initialized after init');
  t.equal(api.getClientCount(), 0, 'should have no clients initially');

  await api.shutdown();
  t.equal(api.isInitialized(), false, 'should not be initialized after shutdown');
});

test('AdminWebSocketAPI - cache dump on connection', async (t) => {
  const cache = createPopulatedCache();
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: cache,
  });

  await api.initialize(0, {listen: false});
  const {ws, message} = await connectAndReceive(api);

  t.equal(message.type, MessageType.CACHE_DUMP, 'should receive cache_dump');
  t.ok(message.timestamp, 'should have timestamp');
  t.ok(message.data, 'should have data');
  t.ok(Array.isArray(message.data.nodes), 'should have nodes array');
  t.ok(Array.isArray(message.data.services), 'should have services array');
  t.ok(Array.isArray(message.data.partitions), 'should have partitions array');
  t.ok(Array.isArray(message.data.tables), 'should have tables array');
  t.ok(Array.isArray(message.data.message_groups), 'should have message_groups');
  t.ok(Array.isArray(message.data.indices), 'should have indices array');
  t.ok(Array.isArray(message.data.service_definitions),
    'should have service_definitions array');
  t.ok(Array.isArray(message.data.service_endpoints),
    'should have service_endpoints array');
  t.ok(Array.isArray(message.data.latency_groups),
    'should include latency_groups in cache dump');
  t.ok(Array.isArray(message.data.inter_group_latencies),
    'should include inter_group_latencies in cache dump');
  t.equal(message.data.nodes.length, 1, 'should have 1 node');
  t.equal(message.data.nodes[0].id, 'node-1', 'should have correct node');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - multiple concurrent connections', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});

  const [conn1, conn2, conn3] = await Promise.all([
    connectAndReceive(api),
    connectAndReceive(api),
    connectAndReceive(api),
  ]);

  t.equal(api.getClientCount(), 3, 'should have 3 connected clients');

  conn1.ws.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(api.getClientCount(), 2, 'should have 2 clients after disconnect');

  conn2.ws.close();
  conn3.ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - control snapshot query preserves requested repair timeout',
  async (t) => {
    let controlSnapshotOptions = null;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: createMockQueryEngine(),
    });
    api.buildControlSnapshotQueryResult = async (options = {}) => {
      controlSnapshotOptions = options;
      return {
        success: true,
        rows: [],
      };
    };

    await api.executeLocalQueryEnvelope({
      queryId: 'q-force-control-snapshot-timeout',
      sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR,
      params: [],
      timeoutMs: TEST_CONTROL_SNAPSHOT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      controlSnapshotOptions?.queryTimeoutMs,
      TEST_CONTROL_SNAPSHOT_QUERY_TIMEOUT_MS,
      'control snapshot owner should receive the query timeout requested by the caller',
    );
    t.equal(
      controlSnapshotOptions?.forceAuthoritativeRepair,
      true,
      'forced control snapshot should keep the forced repair request',
    );
  });

test('AdminWebSocketAPI - query execution SELECT', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q1',
    sql: 'SELECT * FROM test_table',
  }));

  const result = await waitForMessage(ws);

  t.equal(result.type, MessageType.QUERY_RESULT, 'should receive query_result');
  t.equal(result.queryId, 'q1', 'should have correct queryId');
  t.ok(Array.isArray(result.results), 'should have results array');
  t.equal(result.count, 1, 'should have count');
  t.ok(Array.isArray(result.partitions), 'should have partitions array');
  t.equal(result.tableName, 'test_table', 'should have tableName');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - load lane sheds queries when routing is not ready',
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
            routingReady: false,
            clusterMemberHealthy: false,
            serveEligible: false,
          },
          runtimeAuthority: {
            state: RUNTIME_AUTHORITY_STATE.ESTABLISHING,
            visibility: {
              state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
            },
          },
          reasons: [
            {code: 'routing_not_ready'},
            {code: 'cluster_member_unhealthy'},
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
      queryId: 'q-load-lane-shed',
      sql: 'SELECT 1',
    }));

    const result = await waitForMessage(ws);
    t.equal(result.type, MessageType.QUERY_RESULT,
      'should return query_result envelope');
    t.equal(result.queryId, 'q-load-lane-shed',
      'should preserve query id');
    t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
      'shed result should surface as a typed admin error');
    t.match(
      String(result.error || ''),
      /serve not ready/i,
      'shed result should expose serve-not-ready reason',
    );
    t.equal(
      result.details?.loadLaneAdmission?.[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]
        ?.state,
      RUNTIME_AUTHORITY_STATE.ESTABLISHING,
      'load-lane admission should preserve runtime authority state',
    );
    t.equal(
      result.details?.loadLaneAdmission?.[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]
        ?.visibilityState,
      RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
      'load-lane admission should preserve runtime authority visibility',
    );
    t.equal(executedQueryCount, 0,
      'load-lane admission should reject before SQL execution');

    ws.close();
    await api.shutdown();
  });
