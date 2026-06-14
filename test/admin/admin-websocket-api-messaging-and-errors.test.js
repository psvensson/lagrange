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
import {registerAdminWebSocketApiLoadBenchmarkTests} from
  './admin-websocket-api-load-benchmark-test-cases.js';
import {registerAdminWebSocketApiLoadReadinessTests} from
  './admin-websocket-api-load-readiness-test-cases.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {
} from '../../src/admin/admin-constants.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {getSystemCachePrimaryKeyField} from
  '../../src/cache/system-cache-key-descriptor.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TABLES} from '../../src/constants/index.js';
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

registerAdminWebSocketApiLoadReadinessTests({
  test,
  AdminWebSocketAPI,
  MessageType,
  ErrorCode,
  createInProcWebSocketPair,
  createPopulatedCache,
  connectAndReceive,
  waitForMessage,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
});

registerAdminWebSocketApiLoadBenchmarkTests({
  test,
  AdminWebSocketAPI,
  MessageType,
  ErrorCode,
  createReadOnlyCache,
  getSystemCachePrimaryKeyField,
  createMockQueryEngine,
  createPopulatedCache,
  connectAndReceive,
  waitForMessage,
  TABLES,
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
