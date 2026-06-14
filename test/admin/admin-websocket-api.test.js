/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  connectAndReceive,
  createMockQueryEngine,
  createPopulatedCache,
  waitForMessage,
} from './admin-websocket-api-test-support.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
} from '../../src/admin/admin-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
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

test('AdminWebSocketAPI - direct query preserves ignorePreRestart handoff',
  async (t) => {
    let observedPayload = null;
    let sentResult = null;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: createMockQueryEngine(),
    });
    api.executeLocalQueryEnvelope = async (payload) => {
      observedPayload = payload;
      return {
        success: true,
        rows: [],
      };
    };
    api.sendQueryResult = (_clientInfo, _queryId, result) => {
      sentResult = result;
    };

    await api.handleQueryMessage(
      {id: 'client-ignore-pre-restart'},
      {
        queryId: 'q-ignore-pre-restart',
        sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL,
        params: [],
        ignorePreRestart: true,
      },
    );

    t.equal(
      observedPayload?.ignorePreRestart,
      true,
      'direct WebSocket query should preserve ignorePreRestart into local execution',
    );
    t.equal(sentResult?.success, true);
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
