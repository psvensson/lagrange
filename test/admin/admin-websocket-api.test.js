/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TraceCollector} from '../../src/debug/trace-collector.js';
import {TABLES} from '../../src/constants/index.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

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
function seedServiceDiscoveryRows(cache) {
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 3,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: Date.now(),
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-2',
    service_id: 'sys-postgres-wire',
    node_id: 'node-2',
    protocol: 'postgresql',
    address: '10.0.0.2',
    port: 5432,
    health_status: 'unhealthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: Date.now(),
  });
}

/**
 * Seed table-scoped discovery rows where only one node hosts partition replicas.
 * This models routed queryability: all active postgres-wire nodes should remain
 * schema-ready when table metadata is available cluster-wide.
 *
 * @param {SystemTableCache} cache
 */
function seedRoutedTableDiscoveryRows(cache) {
  const updatedAt = Date.now();

  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: 'node-2',
    address: 'localhost:8081',
    status: 'active',
  });

  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 2,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-2',
    service_id: 'sys-postgres-wire',
    node_id: 'node-2',
    protocol: 'postgresql',
    address: '10.0.0.2',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    id: 'table-benchmark-events',
    table_id: 'table-benchmark-events',
    name: 'benchmark_events',
    table_name: 'benchmark_events',
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    table_name: 'benchmark_events',
    keyStart: null,
    keyEnd: null,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
}

/**
 * Seed table-scoped discovery rows without a local TABLES row.
 * This verifies applied schema watermark fallback from partition metadata.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */
function seedPartitionScopedDiscoveryRowsWithoutTableRecord(cache, updatedAt) {
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 1,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    table_name: 'benchmark_events',
    keyStart: null,
    keyEnd: null,
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
}

/**
 * Seed table-scoped discovery rows without local TABLES row and without
 * partition table_name metadata. Partition matching must rely on table_id.
 *
 * @param {SystemTableCache} cache
 * @param {number} updatedAt
 */
function seedPartitionScopedDiscoveryRowsWithoutTableName(cache, updatedAt) {
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: 'sys-postgres-wire',
    service_name: 'sys-postgres-wire',
    replica_count: 1,
    runtime_kind: 'native_js',
  });

  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'sys-postgres-wire-ep-node-1',
    service_id: 'sys-postgres-wire',
    node_id: 'node-1',
    protocol: 'postgresql',
    address: '10.0.0.1',
    port: 5432,
    health_status: 'healthy',
    metadata: JSON.stringify({
      service_name: 'sys-postgres-wire',
      protocol: 'postgresql',
      version: '1.0.0',
    }),
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'partition-benchmark-events-1',
    partition_id: 'partition-benchmark-events-1',
    table_id: 'table-benchmark-events',
    keyStart: null,
    keyEnd: null,
    updated_at: updatedAt,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    id: 'service-benchmark-events-node-1',
    service_type: 'partition',
    partition_id: 'partition-benchmark-events-1',
    node_id: 'node-1',
    status: 'active',
    raft_role: 'leader',
    address: '10.0.0.1:7001',
  });
}

/**
 * Connect to AdminWebSocketAPI in-process and wait for first message.
 * Avoids binding TCP ports (not permitted in some test sandboxes).
 * @param {AdminWebSocketAPI} api - Admin API instance.
 * @param {number} timeout - Timeout in ms.
 * @return {Promise<{ws: Object, message: Object}>}
 */
async function connectAndReceive(api, timeout = 2000) {
  const {clientSocket, serverSocket} = createInProcWebSocketPair();
  api.handleConnection(serverSocket);
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
function waitForNoMessage(ws, timeout = 50) {
  return new Promise((resolve, reject) => {
    const onMessage = () => {
      clearTimeout(timer);
      reject(new Error('Unexpected message received'));
    };
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve();
    }, timeout);
    ws.once('message', onMessage);
  });
}

/**
 * Create a mock test-run service for HTTP route tests.
 * @param {Object} [overrides]
 * @return {Object}
 */
function createMockTestRunService(overrides = {}) {
  return {
    readDashboardPage: async () => '<html><body>dashboard</body></html>',
    readPlaybackViewer: async () => '<html><body>viewer</body></html>',
    listAvailableTests: async () => [],
    listAvailableConfigs: async () => [],
    listSavedRuns: async () => [],
    getRun: async (_runId) => null,
    startRun: async (_payload) => {
      throw new Error('startRun not mocked');
    },
    stopRun: async (_runId) => {
      throw new Error('stopRun not mocked');
    },
    deleteRun: async (_runId) => {
      throw new Error('deleteRun not mocked');
    },
    subscribeToRun: (_runId, _listener) => null,
    readOutputAsset: async (_path) => null,
    ...overrides,
  };
}

/**
 * Create a mock debug metadata store for debug ingress route tests.
 * @param {Object} [overrides]
 * @return {Object}
 */
function createMockDebugMetadataStore(overrides = {}) {
  return {
    createSession: async (request) => ({
      sessionId: request.sessionId || 'session-1',
      tenantId: request.securityContext.tenantId,
      serviceName: request.serviceName || 'svc-debug',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    getSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: 'svc-debug',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    attachSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: 'svc-debug',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    updateSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: request.serviceName || 'svc-debug',
      lineageId: request.lineageId || null,
      stageId: request.stageId || null,
      endpoint: request.endpoint || null,
      nodeId: request.nodeId || null,
      status: request.status || 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    detachSession: async (request) => ({
      sessionId: request.sessionId,
      tenantId: request.securityContext.tenantId,
      serviceName: 'svc-debug',
      lineageId: null,
      stageId: null,
      endpoint: null,
      nodeId: null,
      status: 'detached',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    writeBreakpoints: async (_request) => ([
      {
        breakpointId: 'bp-1',
        lineNumber: 10,
        resolved: true,
      },
    ]),
    listBreakpoints: async (_request) => ([
      {
        breakpointId: 'bp-1',
        lineNumber: 10,
        resolved: true,
      },
    ]),
    writeSnapshot: async (_request) => ({
      snapshotId: 'snapshot-1',
      sessionId: 'session-1',
      frameCount: 2,
      hostCallCount: 1,
      envelope: Buffer.from([1, 2, 3]),
    }),
    listSnapshots: async (_request) => ([
      {
        snapshotId: 'snapshot-1',
        sessionId: 'session-1',
        frameCount: 2,
        hostCallCount: 1,
      },
    ]),
    getSnapshot: async (_request) => ({
      snapshotId: 'snapshot-1',
      sessionId: 'session-1',
      frameCount: 2,
      hostCallCount: 1,
      envelope: Buffer.from([1, 2, 3]),
    }),
    ...overrides,
  };
}

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

test('AdminWebSocketAPI - local control snapshot endpoint shape and non-mutation',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    cache.applySystemTableChange('replica_operations', 'INSERT', {
      operation_id: 'op-1',
      status: 'creating',
    });
    cache.applySystemTableChange('replica_operations', 'INSERT', {
      operation_id: 'op-2',
      status: 'active',
    });
    const beforeCounts = {
      nodes: cache.count(TABLES.NODES),
      partitions: cache.count(TABLES.PARTITIONS),
      services: cache.count(TABLES.SERVICES),
      replicaOperations: cache.count(TABLES.REPLICA_OPERATIONS),
    };
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});

    const startedAt = Date.now();
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(elapsedMs < 100, true, 'should respond within local snapshot bound');
    t.equal(payload.schemaVersion, 1, 'should expose schema version');
    t.equal(payload.nodeId, 'test-node', 'should include current node id');
    t.equal(Array.isArray(payload.nodes), true, 'should include nodes array');
    t.equal(Array.isArray(payload.partitions), true, 'should include partitions array');
    t.equal(typeof payload.leaders, 'object', 'should include leaders map');
    t.equal(typeof payload.voterCounts, 'object', 'should include voter-count map');
    t.equal(typeof payload.replicaOperations, 'object',
      'should include replica operation summary');
    t.equal(
      Number.isInteger(payload.replicaOperations.inFlightCount),
      true,
      'should include in-flight operation count',
    );
    t.equal(
      typeof payload.replicaOperations.statusHistogram,
      'object',
      'should include status histogram',
    );
    t.equal(
      typeof payload.replicaOperations.partitionGroupInFlight,
      'object',
      'should include partition-group in-flight summary',
    );
    t.equal(
      payload.replicaOperations.partitionGroupInFlight.unknown,
      1,
      'creating operation without explicit partition id should be grouped',
    );
    t.equal(executeRequestCalls, 0,
      'local snapshot endpoint should not execute SQL query engine requests');

    t.equal(cache.count(TABLES.NODES), beforeCounts.nodes, 'should not mutate nodes table');
    t.equal(cache.count(TABLES.PARTITIONS), beforeCounts.partitions,
      'should not mutate partitions table');
    t.equal(cache.count(TABLES.SERVICES), beforeCounts.services,
      'should not mutate services table');
    t.equal(cache.count(TABLES.REPLICA_OPERATIONS), beforeCounts.replicaOperations,
      'should not mutate replica operations table');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot query avoids distributed fanout',
  async (t) => {
    let executeRequestCalls = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: [{id: 'unexpected'}]};
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    const startedAt = Date.now();
    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-control-snapshot',
      sql: 'SELECT * FROM control_snapshot_local()',
    }));

    const response = await waitForMessage(ws);
    const elapsedMs = Date.now() - startedAt;

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-control-snapshot', 'should preserve query id');
    t.equal(elapsedMs < 100, true, 'query should complete within local bound');
    t.equal(Array.isArray(response.results), true, 'query result should include rows');
    t.equal(response.results.length, 1, 'query should return one snapshot row');
    t.equal(response.results[0].schemaVersion, 1, 'query should expose snapshot schema');
    t.equal(typeof response.results[0].voterCounts, 'object',
      'query result should include voter-count map');
    t.equal(executeRequestCalls, 0,
      'local control snapshot query should not execute distributed SQL requests');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - local service discovery endpoint shape and filtering',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const beforeCounts = {
      serviceDefinitions: cache.count(TABLES.SERVICE_DEFINITIONS),
      serviceEndpoints: cache.count(TABLES.SERVICE_ENDPOINTS),
    };
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&nodeId=node-1&healthyOnly=true',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(payload.schemaVersion, 2, 'should expose schema version');
    t.equal(payload.nodeId, 'test-node', 'should include current node id');
    t.equal(payload.serviceCount, 1, 'should return one logical discovery group');
    t.equal(payload.replicaCount, 1, 'should include filtered replica count');
    t.equal(Array.isArray(payload.services), true, 'should include services array');
    t.equal(payload.services.length, 1, 'should include one service row');
    t.equal(payload.services[0].serviceKey,
      'sys-postgres-wire|postgresql', 'should expose endpoint-sync service key');
    t.equal(payload.services[0].observedReplicaCount, 1,
      'should honor discovery filters');
    t.equal(payload.services[0].desiredReplicaCount, 3,
      'should include desired replica count from definitions');
    t.equal(payload.services[0].replicas.length, 1,
      'should include filtered replica rows');
    t.equal(payload.services[0].replicas[0].nodeId, 'node-1',
      'should keep only requested node replica');
    t.equal(
      payload.services[0].replicas[0].readiness.workloadReady,
      true,
      'should include canonical workload readiness',
    );
    t.equal(
      payload.services[0].replicas[0].readiness.topologyReady,
      true,
      'should include canonical topology readiness',
    );
    t.equal(
      payload.services[0].replicas[0].readiness.benchmarkReady,
      true,
      'should include canonical benchmark readiness',
    );
    t.equal(
      payload.services[0].replicas[0].readiness.schemaReady,
      true,
      'default discovery scope should mark schema readiness true',
    );
    t.equal(executeRequestCalls, 0,
      'service discovery endpoint should not execute distributed SQL requests');

    t.equal(cache.count(TABLES.SERVICE_DEFINITIONS),
      beforeCounts.serviceDefinitions,
      'should not mutate service definitions table');
    t.equal(cache.count(TABLES.SERVICE_ENDPOINTS), beforeCounts.serviceEndpoints,
      'should not mutate service endpoints table');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local service discovery query avoids distributed fanout',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: [{id: 'unexpected'}]};
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-service-discovery',
      sql: 'SELECT * FROM service_discovery_local()',
    }));

    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-service-discovery', 'should preserve query id');
    t.equal(Array.isArray(response.results), true, 'query result should include rows');
    t.equal(response.results.length, 1, 'query should return one snapshot row');
    t.equal(response.results[0].schemaVersion, 2,
      'query should expose discovery schema version');
    t.equal(Array.isArray(response.results[0].services), true,
      'query snapshot should include services array');
    t.equal(response.results[0].serviceCount, 1,
      'query snapshot should include grouped service count');
    t.equal(
      response.results[0].services[0].replicas[0].readiness.workloadReady,
      true,
      'query snapshot should include readiness block',
    );
    t.equal(
      response.results[0].services[0].replicas[0].readiness.topologyReady,
      true,
      'query snapshot should include topology readiness',
    );
    t.equal(
      response.results[0].services[0].replicas[0].readiness.benchmarkReady,
      true,
      'query snapshot should include benchmark readiness',
    );
    t.equal(executeRequestCalls, 0,
      'local service discovery query should not execute distributed SQL requests');

    ws.close();
    await api.shutdown();
  });

test('AdminWebSocketAPI - table-scoped discovery readiness marks missing schema',
  async (t) => {
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const readiness = payload.services[0].replicas[0].readiness;
    t.equal(readiness.schemaReady, false, 'missing table should mark schema not ready');
    t.equal(readiness.workloadReady, false, 'missing table should block workload readiness');
    t.equal(readiness.topologyReady, true, 'topology can still be ready when schema is missing');
    t.equal(
      readiness.benchmarkReady,
      false,
      'benchmark readiness should fail when schema is missing',
    );
    t.equal(
      readiness.reasons.some((reason) => reason.code === 'schema_table_missing'),
      true,
      'readiness reasons should include schema_table_missing',
    );

    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - table-scoped discovery keeps routed replicas schema ready',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.schemaReady,
      true,
      'node-1 should remain schema ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'node-2 should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'node-2 should remain schema ready via routed partition ownership',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'schema_partition_unavailable'),
      false,
      'node-2 should not be excluded for lacking local partition replica',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery falls back to partition schema watermark',
  async (t) => {
    const expectedSchemaVersion = 1740589945999;
    const cache = createPopulatedCache();
    seedPartitionScopedDiscoveryRowsWithoutTableRecord(cache, expectedSchemaVersion);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const readiness = payload.services[0].replicas[0].readiness;
    t.equal(
      readiness.schemaReady,
      true,
      'partition coverage should keep schema readiness true',
    );
    t.equal(
      readiness.appliedSchemaVersion,
      String(expectedSchemaVersion),
      'readiness should expose partition-derived schema watermark',
    );
    t.equal(
      readiness.benchmarkReady,
      true,
      'benchmark readiness should remain true when partition watermark is available',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - local discovery query supports table-id hints',
  async (t) => {
    const expectedSchemaVersion = 1740589946999;
    const cache = createPopulatedCache();
    seedPartitionScopedDiscoveryRowsWithoutTableName(cache, expectedSchemaVersion);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-table-id-hint',
      sql: 'SELECT * FROM service_discovery_local(' +
        '\'benchmark_events\', \'table-benchmark-events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-table-id-hint', 'should preserve query id');
    t.equal(Array.isArray(response.results), true, 'should include one snapshot row');
    t.equal(response.results.length, 1, 'should return one discovery snapshot');

    const readiness =
      response.results[0]?.services?.[0]?.replicas?.[0]?.readiness || null;
    t.equal(
      readiness?.schemaReady,
      true,
      'table-id hint should resolve partition-scoped schema readiness',
    );
    t.equal(
      readiness?.appliedSchemaVersion,
      String(expectedSchemaVersion),
      'table-id hint should expose partition-derived schema watermark',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - preflight cache freshness keeps unknown watermark as null',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: {
        getAll() {
          return [];
        },
        count() {
          return 0;
        },
        getLastAppliedAtMs() {
          return null;
        },
        getLastAppliedCauseId() {
          return null;
        },
        getAppliedSchemaVersion() {
          return null;
        },
      },
    });

    const cacheFreshness = api.buildPreflightCacheFreshnessSummary({
      capturedAtMs: 12345,
    });

    t.equal(
      cacheFreshness.lastAppliedAtMs,
      null,
      'unknown watermark must remain null in snapshot output',
    );
    t.equal(
      cacheFreshness.stalenessMs,
      null,
      'unknown watermark must not coerce staleness to a synthetic value',
    );
  },
);

test('AdminWebSocketAPI - cleanup on disconnect', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  t.equal(api.getClientCount(), 1, 'should have 1 client');

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(api.getClientCount(), 0, 'should have 0 clients after disconnect');

  await api.shutdown();
});

test('AdminWebSocketAPI - query without queryId', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({type: MessageType.QUERY, sql: 'SELECT 1'}));

  const result = await waitForMessage(ws);

  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.MALFORMED_JSON, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query without sql', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({type: MessageType.QUERY, queryId: 'q8'}));

  const result = await waitForMessage(ws);

  t.equal(result.queryId, 'q8', 'should have queryId');
  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.SYNTAX_ERROR, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - dashboard landing page', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      readDashboardPage: async () => '<html><body>landing-page</body></html>',
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({method: 'GET', url: '/'});
  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(
    response.headers['content-type'],
    'text/html; charset=utf-8',
    'should return html content type',
  );
  t.equal(
    response.headers['cache-control'],
    'no-store',
    'should disable dashboard page caching',
  );
  t.match(response.body, /landing-page/, 'should return dashboard html');

  await api.shutdown();
});

test('AdminWebSocketAPI - test catalog endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      listAvailableTests: async () => [
        {id: 'alpha', file: 'test/distributed/scenarios/alpha.js'},
      ],
      listAvailableConfigs: async () => [
        {id: 'local.json', file: 'test/distributed/config/local.json'},
      ],
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/tests',
  });
  const payload = response.json();
  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(payload.tests.length, 1, 'should include test entries');
  t.equal(payload.tests[0].id, 'alpha', 'should return scenario id');
  t.equal(payload.configs.length, 1, 'should include config entries');
  t.equal(payload.defaultConfig, 'local.json',
    'should publish default config for UI selection');

  await api.shutdown();
});

test('AdminWebSocketAPI - start/stop test run endpoints', async (t) => {
  const run = {
    runId: 'run-1',
    scenario: 'alpha',
    status: 'running',
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      startRun: async (_payload) => run,
      stopRun: async (_runId) => ({...run, status: 'stopping'}),
    }),
  });

  await api.initialize(0, {listen: false});

  const startResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/test-runs',
    payload: {scenario: 'alpha', config: 'local.json'},
  });
  t.equal(startResponse.statusCode, 200, 'should start run');
  t.equal(startResponse.json().run.runId, 'run-1', 'should return run id');

  const stopResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/test-runs/run-1/stop',
  });
  t.equal(stopResponse.statusCode, 200, 'should stop run');
  t.equal(stopResponse.json().run.status, 'stopping', 'should return stop status');

  await api.shutdown();
});

test('AdminWebSocketAPI - delete test run endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      deleteRun: async (runId) => ({
        runId,
        deleted: true,
        removed: {metadata: true, report: true},
      }),
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'DELETE',
    url: '/api/admin/test-runs/run-to-delete',
  });
  const payload = response.json();
  t.equal(response.statusCode, 200, 'should delete run');
  t.equal(payload.deleted, true, 'should return deleted flag');
  t.equal(payload.runId, 'run-to-delete', 'should return deleted run id');

  await api.shutdown();
});

test('AdminWebSocketAPI - output asset endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      readOutputAsset: async (_path) => ({
        contentType: 'application/json; charset=utf-8',
        body: Buffer.from('{"ok":true}', 'utf8'),
      }),
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/ui/test-output/alpha/report.json',
  });
  t.equal(response.statusCode, 200, 'should return output file');
  t.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  t.same(response.json(), {ok: true}, 'should return requested payload');

  await api.shutdown();
});

test('AdminWebSocketAPI - stream endpoint returns 404 for unknown run', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      getRun: async (_runId) => null,
    }),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/test-runs/missing/stream',
  });
  t.equal(response.statusCode, 404, 'should return not found');
  t.equal(response.json().error, 'Test run not found');

  await api.shutdown();
});

test('AdminWebSocketAPI - stream endpoint serves archived run backlog', async (t) => {
  const archivedRun = {
    runId: 'archive-run',
    scenario: 'alpha',
    status: 'passed',
    logs: [{
      timestamp: '2026-02-14T12:00:00.000Z',
      stream: 'archive',
      line: 'archived line',
    }],
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      getRun: async (_runId) => archivedRun,
      subscribeToRun: (_runId, _listener) => null,
    }),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/test-runs/archive-run/stream',
  });

  t.equal(response.statusCode, 200, 'should return stream response for archived run');
  t.match(response.body, /"type":"status"/, 'should include status frame');
  t.match(response.body, /"type":"log"/, 'should include archived log frame');
  t.match(response.body, /archived line/, 'should include archived log content');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug routes require security headers', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore(),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions',
    payload: {sessionId: 'session-1', serviceName: 'svc-debug'},
  });

  t.equal(response.statusCode, 401, 'should reject missing security context');
  t.match(response.json().error, /requires tenant and principal headers/);

  await api.shutdown();
});

test('AdminWebSocketAPI - debug session create/get/attach routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      createSession: async (request) => {
        calls.push({method: 'createSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: request.serviceName,
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      getSession: async (request) => {
        calls.push({method: 'getSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      attachSession: async (request) => {
        calls.push({method: 'attachSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const createResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions',
    headers,
    payload: {
      sessionId: 'session-2',
      serviceName: 'svc-debug',
      lineageId: 'lineage-2',
      endpoint: 'ws://node-a/debug',
    },
  });
  t.equal(createResponse.statusCode, 200, 'should create debug session');
  t.equal(createResponse.json().session.sessionId, 'session-2');

  const getResponse = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-2',
    headers,
  });
  t.equal(getResponse.statusCode, 200, 'should fetch debug session');
  t.equal(getResponse.json().session.tenantId, 'tenant-a');

  const attachResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-2/attach',
    headers,
  });
  t.equal(attachResponse.statusCode, 200, 'should attach debug session');
  t.equal(attachResponse.json().session.sessionId, 'session-2');

  t.equal(calls.length, 3, 'should route to metadata store methods');
  t.equal(calls[0].request.securityContext.tenantId, 'tenant-a');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug session update/detach routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      updateSession: async (request) => {
        calls.push({method: 'updateSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: request.serviceName || 'svc-debug',
          lineageId: request.lineageId || null,
          stageId: request.stageId || null,
          endpoint: request.endpoint || null,
          nodeId: request.nodeId || null,
          status: request.status || 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      detachSession: async (request) => {
        calls.push({method: 'detachSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          lineageId: null,
          stageId: null,
          endpoint: null,
          nodeId: null,
          status: 'detached',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const updateResponse = await api.getFastify().inject({
    method: 'PATCH',
    url: '/api/admin/debug/sessions/session-2',
    headers,
    payload: {
      endpoint: 'ws://node-b/debug',
      nodeId: 'node-b',
      lineageId: 'lineage-2',
      stageId: 2,
    },
  });
  t.equal(updateResponse.statusCode, 200, 'should update debug session');
  t.equal(updateResponse.json().session.endpoint, 'ws://node-b/debug');
  t.equal(updateResponse.json().session.nodeId, 'node-b');

  const detachResponse = await api.getFastify().inject({
    method: 'PATCH',
    url: '/api/admin/debug/sessions/session-2',
    headers,
    payload: {
      detach: true,
    },
  });
  t.equal(detachResponse.statusCode, 200, 'should detach debug session');
  t.equal(detachResponse.json().session.status, 'detached');
  t.equal(detachResponse.json().session.endpoint, null);

  t.equal(calls.length, 2, 'should route to update/detach metadata methods');
  t.equal(calls[0].method, 'updateSession');
  t.equal(calls[1].method, 'detachSession');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug breakpoints/snapshots and DAP routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      writeBreakpoints: async (request) => {
        calls.push({method: 'writeBreakpoints', request});
        return [{breakpointId: 'bp-1', lineNumber: 10, resolved: true}];
      },
      listBreakpoints: async (request) => {
        calls.push({method: 'listBreakpoints', request});
        return [{breakpointId: 'bp-1', lineNumber: 10, resolved: true}];
      },
      writeSnapshot: async (request) => {
        calls.push({method: 'writeSnapshot', request});
        return {
          snapshotId: 'snapshot-1',
          sessionId: request.sessionId,
          frameCount: 2,
          hostCallCount: 1,
          envelope: Buffer.from([1, 2, 3]),
        };
      },
      getSnapshot: async (request) => {
        calls.push({method: 'getSnapshot', request});
        return {
          snapshotId: request.snapshotId,
          sessionId: request.sessionId || 'session-3',
          frameCount: 2,
          hostCallCount: 1,
          envelope: Buffer.from([1, 2, 3]),
        };
      },
      listSnapshots: async (request) => {
        calls.push({method: 'listSnapshots', request});
        return [{
          snapshotId: 'snapshot-1',
          sessionId: request.sessionId,
          frameCount: 2,
          hostCallCount: 1,
        }];
      },
    }),
    debugDapRouter: {
      async handleRequest(request) {
        calls.push({method: 'dap', request});
        return {ok: true, sessionId: request.sessionId};
      },
    },
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const writeBreakpoints = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-3/breakpoints',
    headers,
    payload: {
      moduleRef: 'svc:debug@1.0.0',
      sourceFileUrl: 'file:///src/service.ts',
      breakpoints: [{lineNumber: 10}],
    },
  });
  t.equal(writeBreakpoints.statusCode, 200, 'should write breakpoints');
  t.equal(writeBreakpoints.json().breakpoints.length, 1);

  const listBreakpoints = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-3/breakpoints',
    headers,
  });
  t.equal(listBreakpoints.statusCode, 200, 'should list breakpoints');
  t.equal(listBreakpoints.json().breakpoints[0].breakpointId, 'bp-1');

  const writeSnapshot = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-3/snapshots',
    headers,
    payload: {
      snapshotArtifact: {
        manifest: {
          snapshotId: 'snapshot-1',
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
        },
        snapshot: {
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
        },
        envelope: [1, 2, 3],
      },
    },
  });
  t.equal(writeSnapshot.statusCode, 200, 'should write snapshot metadata');
  t.equal(writeSnapshot.json().snapshot.envelopeBase64, 'AQID');

  const listSnapshots = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-3/snapshots',
    headers,
  });
  t.equal(listSnapshots.statusCode, 200, 'should list snapshots');
  t.equal(listSnapshots.json().snapshots.length, 1);

  const getSnapshot = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/snapshots/snapshot-1?sessionId=session-3',
    headers,
  });
  t.equal(getSnapshot.statusCode, 200, 'should fetch snapshot by id');
  t.equal(getSnapshot.json().snapshot.envelopeBase64, 'AQID');

  const dapResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/dap/request',
    headers,
    payload: {
      sessionId: 'session-3',
      request: {seq: 1, command: 'threads'},
    },
  });
  t.equal(dapResponse.statusCode, 200, 'should route DAP request');
  t.equal(dapResponse.json().response.ok, true);
  t.equal(calls.some((entry) => entry.method === 'dap'), true);

  await api.shutdown();
});

test('AdminWebSocketAPI - debug trace stream route wiring and filtering', async (t) => {
  const traceCollector = new TraceCollector();
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    traceCollector,
  });

  await api.initialize(0, {listen: false});
  const routes = api.getFastify().printRoutes();
  t.match(routes, /trace \(GET, HEAD\)/,
    'should register debug trace websocket route');

  const {clientSocket, serverSocket} = createInProcWebSocketPair();
  api.handleDebugTraceConnection(serverSocket, {
    query: {lineagePrefix: 'lineage-allow'},
  });

  traceCollector.emit({
    level: 'info',
    message: 'allowed',
    lineageId: 'lineage-allow-1',
    source: 'service',
  });
  traceCollector.emit({
    level: 'info',
    message: 'blocked',
    lineageId: 'lineage-deny-1',
    source: 'service',
  });

  const first = await waitForMessage(clientSocket);
  t.equal(first.message, 'allowed', 'should receive matching lineage event');
  await waitForNoMessage(clientSocket, 80);

  t.equal(traceCollector.getSubscriberCount(), 1);
  clientSocket.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.equal(traceCollector.getSubscriberCount(), 0,
    'should cleanup subscription on disconnect');

  await api.shutdown();
});

// ============================================================================
// Live Query Wiring Tests
// ============================================================================

test('live query subscribe routes to liveQueryManager', async (t) => {
  const registrations = [];
  const mockLiveQueryManager = {
    initialized: true,
    isInitialized: () => true,
    registerLiveQuery: async (parsedQuery, client) => {
      registrations.push({parsedQuery, clientId: client.id});
      return {
        queryId: 'lq-test-1',
        expiresAt: Date.now() + 30000,
        renewBefore: Date.now() + 21000,
        partitions: ['partition-1'],
      };
    },
    sendSnapshotToClient: async () => {},
    unregisterLiveQuery: () => {},
    handleClientDisconnection: () => {},
  };

  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: mockLiveQueryManager,
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);

  // Send live query subscribe message
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    subscriptionId: 'sub-1',
    sql: 'LIVE SELECT * FROM logs',
  }));

  // Wait for the registration to be processed
  const response = await waitForMessage(ws);
  t.equal(response.type, MessageType.LIVE_QUERY_EVENT,
    'should respond with live_query_event');
  t.equal(response.subscriptionId, 'sub-1',
    'should include subscriptionId');
  t.equal(registrations.length, 1,
    'should register with live query manager');
  t.ok(registrations[0].parsedQuery,
    'should pass parsed query to manager');

  ws.close();
  await api.shutdown();
});

test('live query subscribe rejects missing subscriptionId', async (t) => {
  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: {
      initialized: true,
      isInitialized: () => true,
      handleClientDisconnection: () => {},
    },
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    sql: 'LIVE SELECT * FROM logs',
  }));

  const response = await waitForMessage(ws);
  t.equal(response.type, MessageType.ERROR,
    'should respond with error');
  t.ok(response.error, 'should include error message');

  ws.close();
  await api.shutdown();
});

test('live query unsubscribe routes to liveQueryManager', async (t) => {
  const unregistrations = [];
  const mockLiveQueryManager = {
    initialized: true,
    isInitialized: () => true,
    registerLiveQuery: async () => ({
      queryId: 'lq-test-2',
      expiresAt: Date.now() + 30000,
      renewBefore: Date.now() + 21000,
      partitions: [],
    }),
    sendSnapshotToClient: async () => {},
    unregisterLiveQuery: (queryId, clientId) => {
      unregistrations.push({queryId, clientId});
    },
    handleClientDisconnection: () => {},
  };

  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: mockLiveQueryManager,
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);

  // Subscribe first
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    subscriptionId: 'sub-2',
    sql: 'LIVE SELECT * FROM logs',
  }));
  await waitForMessage(ws);

  // Now unsubscribe
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_UNSUBSCRIBE,
    subscriptionId: 'sub-2',
  }));

  // Give time for async processing
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(unregistrations.length, 1,
    'should unregister from live query manager');

  ws.close();
  await api.shutdown();
});

test('live query client disconnect cleans up subscriptions', async (t) => {
  const disconnections = [];
  const mockLiveQueryManager = {
    initialized: true,
    isInitialized: () => true,
    handleClientDisconnection: (clientId) => {
      disconnections.push(clientId);
    },
  };

  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: mockLiveQueryManager,
  });
  await api.initialize(0, {listen: false});

  const {ws} = await connectAndReceive(api);
  ws.close();

  // Give time for disconnect handler
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(disconnections.length, 1,
    'should notify live query manager of disconnection');

  await api.shutdown();
});
