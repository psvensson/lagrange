/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {
  ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
  NodeHandle,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  NODE_ROLES,
} from './cluster-test-helpers.js';
import {
  registerClusterBootstrapApiReadinessTests,
} from './cluster-bootstrap-api-readiness-test-cases.js';
import {
  registerClusterNodeHandleControlSnapshotTests,
} from './cluster-node-handle-control-snapshot-test-cases.js';

const TEST_ADMIN_HOST = '127.0.0.1';
const TEST_ADMIN_PORT_ANY = 0;
const TEST_CACHE_DUMP_MESSAGE_TYPE = 'cache_dump';
const TEST_QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const TEST_EMPTY_CACHE_DUMP = Object.freeze({});
const TEST_NODE_ID = 'node-1';
const TEST_CONTAINER_ID = 'container-1';
const TEST_SNAPSHOT_LANE = 'snapshot';
const TEST_RESET_LANE_SOCKET_TEST_NAME =
  'Unit: NodeHandle._resetAdminSocket closes lane socket before retry';
const TEST_RESET_LANE_QUERY_ONE = 'SELECT 1';
const TEST_RESET_LANE_QUERY_TWO = 'SELECT 2';
const TEST_RESET_LANE_ROW = Object.freeze({ok: 1});
const TEST_FIRST_CONNECTION_COUNT = 1;
const TEST_QUERY_RESULT_COUNT = 1;

test('Unit: NodeHandle reads process memory from the node diagnostics owner',
  async () => {
    const capturedAt = 123456;
    const processSnapshot = {
      rssBytes: 900,
      heapUsedBytes: 400,
      heapTotalBytes: 600,
      externalBytes: 70,
      arrayBuffersBytes: 30,
    };
    let responseNodeId = TEST_NODE_ID;
    const server = createServer((_request, response) => {
      response.end(JSON.stringify({
        nodeId: responseNodeId,
        diagnostics: {
          resources: {
            latest: {
              timestamp: capturedAt,
              process: processSnapshot,
            },
          },
        },
      }));
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
      server.listen(TEST_ADMIN_PORT_ANY, TEST_ADMIN_HOST);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const node = new NodeHandle(
      TEST_NODE_ID,
      TEST_CONTAINER_ID,
      TEST_ADMIN_HOST,
      NODE_ROLES.SEED,
      {},
      address.port,
    );
    try {
      const diagnostics = await node.getProcessResourceDiagnostics();
      assert.equal(diagnostics.nodeId, TEST_NODE_ID);
      assert.equal(diagnostics.capturedAt, capturedAt);
      assert.deepEqual(diagnostics.process, processSnapshot);
      responseNodeId = 'different-node';
      await assert.rejects(
        node.getProcessResourceDiagnostics(),
        /node identity/u,
      );
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test('Unit: NodeHandle.query sends queryId and ignores initial cache dump', async () => {
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should expose listen address');
  const adminApiPort = address.port;

  let capturedQuery = null;
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'cache_dump',
      data: {},
    }));
    socket.once('message', (data) => {
      capturedQuery = JSON.parse(data.toString());
      socket.send(JSON.stringify({
        type: 'query_result',
        queryId: capturedQuery.queryId,
        results: [{node_id: 'node-1', status: 'active'}],
        count: 1,
      }));
    });
  });

  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    adminApiPort,
  );

  try {
    const result = await node.query(
      'SELECT * FROM nodes WHERE node_id = \'node-1\'',
    );
    assert.strictEqual(capturedQuery.type, 'query', 'should send query message');
    assert.ok(capturedQuery.queryId, 'should include queryId');
    assert.deepStrictEqual(
      result.rows,
      [{node_id: 'node-1', status: 'active'}],
      'should return rows from query_result message',
    );
  } finally {
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
});

test('Unit: NodeHandle.query uses injected default admin timeout', async () => {
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should expose listen address');
  const adminApiPort = address.port;

  let capturedQuery = null;
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'cache_dump',
      data: {},
    }));
    socket.once('message', (data) => {
      capturedQuery = JSON.parse(data.toString());
      socket.send(JSON.stringify({
        type: 'query_result',
        queryId: capturedQuery.queryId,
        results: [{ok: 1}],
        count: 1,
      }));
    });
  });

  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    adminApiPort,
    {adminQueryTimeoutMs: 4321},
  );

  try {
    await node.query('SELECT 1');
    assert.strictEqual(
      capturedQuery.timeoutMs,
      4321,
      'query() should inherit the injected default admin timeout',
    );
  } finally {
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
});

test('Unit: NodeHandle.queryWithTimeout opens lane-tagged admin stream sockets',
  async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    let observedRequestUrl = null;
    server.on('connection', (socket, request) => {
      observedRequestUrl = request?.url || null;
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.once('message', (data) => {
        const parsed = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: parsed.queryId,
          results: [{ok: 1}],
          count: 1,
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
    );

    try {
      const result = await node.queryWithTimeout('SELECT 1', [], {
        lane: 'load',
      });
      assert.deepStrictEqual(result.rows, [{ok: 1}]);
      assert.ok(
        typeof observedRequestUrl === 'string' &&
        observedRequestUrl.includes('/api/admin/stream?lane=load'),
        'lane-tagged admin stream URL should include load lane query parameter',
      );
    } finally {
      node.closeQueryConnection();
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

test('Unit: NodeHandle.queryWithTimeout preserves structured visibility ' +
  'metadata from admin stream successes',
async () => {
  const successReasonCode = 'publication_epoch_pending';
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object',
    'server should expose listen address');
  const adminApiPort = address.port;

  server.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'cache_dump',
      data: {},
    }));
    socket.once('message', (data) => {
      const parsed = JSON.parse(data.toString());
      socket.send(JSON.stringify({
        type: 'query_result',
        queryId: parsed.queryId,
        results: [{table_id: 'tbl-1'}],
        count: 1,
        outcome: 'deferred',
        visibilityState: 'pending_visibility',
        contractState: 'pending',
        nextAction: 'wait',
        authoritativeVisibilityConfirmed: true,
        reasonCode: successReasonCode,
        reasonCodes: [successReasonCode],
        failedDimensions: ['publishedConvergencePending'],
        runtimeAuthority: {
          state: 'establishing',
          visibility: {
            state: 'pending_publication',
          },
        },
      }));
    });
  });

  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    adminApiPort,
  );

  try {
    const result = await node.queryWithTimeout('SELECT * FROM tables');
    assert.deepStrictEqual(result.rows, [{table_id: 'tbl-1'}]);
    assert.strictEqual(result.outcome, 'deferred');
    assert.strictEqual(result.visibilityState, 'pending_visibility');
    assert.strictEqual(result.contractState, 'pending');
    assert.strictEqual(result.nextAction, 'wait');
    assert.strictEqual(result.authoritativeVisibilityConfirmed, true);
    assert.strictEqual(result.reasonCode, successReasonCode);
    assert.deepStrictEqual(result.reasonCodes, [successReasonCode]);
    assert.deepStrictEqual(
      result.failedDimensions,
      ['publishedConvergencePending'],
    );
    assert.strictEqual(result.runtimeAuthority?.state, 'establishing');
  } finally {
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
});

test('Unit: NodeHandle.queryWithTimeout preserves admin stream errorCode',
  async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.once('message', (data) => {
        const parsed = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: parsed.queryId,
          error: 'routing not ready',
          errorCode: 'ROUTING_NOT_READY',
          hint: 'retry on healthy node',
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
    );

    try {
      await assert.rejects(
        node.queryWithTimeout('SELECT 1'),
        (error) => {
          assert.strictEqual(error.code, 'routing_not_ready');
          assert.strictEqual(error.hint, 'retry on healthy node');
          assert.match(String(error.message), /routing not ready/i);
          return true;
        },
      );
    } finally {
      node.closeQueryConnection();
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

test('Unit: NodeHandle.queryWithTimeout preserves retry metadata from admin stream',
  async () => {
    const deferredReasonCode = 'publication_epoch_pending';
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.once('message', (data) => {
        const parsed = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: parsed.queryId,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
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
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
    );

    try {
      await assert.rejects(
        node.queryWithTimeout('SELECT 1'),
        (error) => {
          assert.strictEqual(
            error.code,
            'distributed_participant_failure',
          );
          assert.strictEqual(error.deferRetry, true);
          assert.strictEqual(error.retryAfterMs, 275);
          assert.strictEqual(error.outcome, 'deferred');
          assert.strictEqual(error.visibilityState, 'pending_visibility');
          assert.strictEqual(error.contractState, 'deferred');
          assert.strictEqual(error.nextAction, 'retry');
          assert.strictEqual(error.authoritativeVisibilityConfirmed, true);
          assert.strictEqual(error.reasonCode, deferredReasonCode);
          assert.deepStrictEqual(error.reasonCodes, [deferredReasonCode]);
          assert.deepStrictEqual(
            error.failedDimensions,
            ['publishedConvergencePending'],
          );
          assert.strictEqual(error.runtimeAuthority?.state, 'establishing');
          return true;
        },
      );
    } finally {
      node.closeQueryConnection();
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

test('Unit: NodeHandle.queryWithTimeout captures timeout query trace entries',
  async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    let capturedQuery = null;
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.once('message', (data) => {
        capturedQuery = JSON.parse(data.toString());
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
    );

    try {
      await assert.rejects(
        node.queryWithTimeout('SELECT 1', [], {
          timeoutMs: ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
        }),
        /timed out/i,
      );
      const traces = node.getAdminQueryTraceSnapshot();
      assert.ok(
        Array.isArray(traces),
        'node should expose query trace snapshot array',
      );
      assert.strictEqual(traces.length, 1, 'timeout query should capture one trace');
      const trace = traces[0];
      assert.strictEqual(trace.queryId, capturedQuery.queryId);
      assert.strictEqual(
        capturedQuery.timeoutMs,
        ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
        'query payload should include the per-request timeout override',
      );
      assert.strictEqual(trace.lane, 'default');
      assert.strictEqual(trace.operation, 'query');
      assert.strictEqual(trace.outcome, 'timeout');
      assert.strictEqual(trace.statementPreview, 'SELECT 1');
      assert.ok(Number.isFinite(trace.startedAtMs));
      assert.ok(Number.isFinite(trace.socketReadyAtMs));
      assert.ok(Number.isFinite(trace.sentAtMs));
      assert.ok(Number.isFinite(trace.timeoutAtMs));
      assert.strictEqual(trace.resolvedAtMs, null);
      assert.ok(
        typeof trace.error === 'string' && trace.error.length > 0,
        'timeout trace should include non-empty error message',
      );
    } finally {
      node.closeQueryConnection();
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

test(TEST_RESET_LANE_SOCKET_TEST_NAME, async () => {
  const server = new WebSocketServer({
    host: TEST_ADMIN_HOST,
    port: TEST_ADMIN_PORT_ANY,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object',
    'server should expose listen address');
  const adminApiPort = address.port;
  const connectionsByLane = [];
  let firstSnapshotConnectionClosed = null;
  const firstSnapshotConnectionClosedPromise = new Promise((resolve) => {
    firstSnapshotConnectionClosed = resolve;
  });

  server.on('connection', (socket, request) => {
    const requestUrl = new URL(
      request?.url || '',
      'ws://' + TEST_ADMIN_HOST,
    );
    const lane = requestUrl.searchParams.get('lane');
    connectionsByLane.push(lane);
    const snapshotConnectionCount = connectionsByLane.filter(
      (connectionLane) => connectionLane === TEST_SNAPSHOT_LANE,
    ).length;
    socket.send(JSON.stringify({
      type: TEST_CACHE_DUMP_MESSAGE_TYPE,
      data: TEST_EMPTY_CACHE_DUMP,
    }));
    if (
      lane === TEST_SNAPSHOT_LANE &&
      snapshotConnectionCount === TEST_FIRST_CONNECTION_COUNT
    ) {
      socket.once('close', firstSnapshotConnectionClosed);
    }
    socket.once('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (
        lane === TEST_SNAPSHOT_LANE &&
        snapshotConnectionCount === TEST_FIRST_CONNECTION_COUNT
      ) {
        return;
      }
      socket.send(JSON.stringify({
        type: TEST_QUERY_RESULT_MESSAGE_TYPE,
        queryId: parsed.queryId,
        results: [TEST_RESET_LANE_ROW],
        count: TEST_QUERY_RESULT_COUNT,
      }));
    });
  });

  const node = new NodeHandle(
    TEST_NODE_ID,
    TEST_CONTAINER_ID,
    TEST_ADMIN_HOST,
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    adminApiPort,
  );

  try {
    await assert.rejects(
      node.queryWithTimeout(TEST_RESET_LANE_QUERY_ONE, [], {
        lane: TEST_SNAPSHOT_LANE,
        timeoutMs: ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
      }),
      /timed out/i,
    );
    node._resetAdminSocket(TEST_SNAPSHOT_LANE);
    await firstSnapshotConnectionClosedPromise;
    const result = await node.queryWithTimeout(
      TEST_RESET_LANE_QUERY_TWO,
      [],
      {lane: TEST_SNAPSHOT_LANE},
    );
    assert.deepStrictEqual(result.rows, [TEST_RESET_LANE_ROW]);
    assert.deepStrictEqual(
      connectionsByLane,
      [
        TEST_SNAPSHOT_LANE,
        TEST_SNAPSHOT_LANE,
      ],
    );
  } finally {
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
});

test('Unit: NodeHandle.partitionCallback sends callback envelope and returns hostResult',
  async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    let capturedMessage = null;
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.once('message', (data) => {
        capturedMessage = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: capturedMessage.queryId,
          operation: 'partition_callback',
          results: [],
          hostResult: {
            state: 'completed',
            processedPartitions: 3,
            failedPartitions: 0,
            totalRows: 7,
          },
          callbackModuleRef: capturedMessage.callbackModuleRef,
          callbackExport: capturedMessage.callbackExport,
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
    );

    try {
      const result = await node.partitionCallback({
        statement: 'SELECT * FROM nodes',
        parameters: [],
        callbackModuleRef: 'mod-1',
        callbackExport: 'run',
        runtimeKind: 'wasm_component',
      });
      assert.strictEqual(capturedMessage.type, 'partition_callback');
      assert.strictEqual(capturedMessage.statement, 'SELECT * FROM nodes');
      assert.strictEqual(capturedMessage.callbackModuleRef, 'mod-1');
      assert.strictEqual(capturedMessage.callbackExport, 'run');
      assert.strictEqual(capturedMessage.runtimeKind, 'wasm_component');
      assert.equal(result.operation, 'partition_callback');
      assert.deepStrictEqual(result.hostResult, {
        state: 'completed',
        processedPartitions: 3,
        failedPartitions: 0,
        totalRows: 7,
      });
    } finally {
      node.closeQueryConnection();
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

test('Unit: NodeHandle.query reuses one Admin API connection', async () => {
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should expose listen address');
  const adminApiPort = address.port;

  let connectionCount = 0;
  server.on('connection', (socket) => {
    connectionCount++;
    socket.send(JSON.stringify({
      type: 'cache_dump',
      data: {},
    }));
    socket.on('message', (data) => {
      const query = JSON.parse(data.toString());
      socket.send(JSON.stringify({
        type: 'query_result',
        queryId: query.queryId,
        results: [{ok: true}],
      }));
    });
  });

  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    adminApiPort,
  );

  try {
    await node.query('SELECT 1');
    await node.query('SELECT 2');
    assert.strictEqual(
      connectionCount,
      1,
      'query client should reuse a single websocket connection',
    );
  } finally {
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
});

test('Unit: NodeHandle.getStatus derives ACTIVE state from local discovery readiness',
  async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    let capturedQuery = null;
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.once('message', (data) => {
        capturedQuery = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: capturedQuery.queryId,
          results: [{
            services: [{
              serviceIds: [NODE_CLIENT_SERVICE_ID_ADMIN_META],
              replicas: [{
                nodeId: 'node-1',
                serviceId: NODE_CLIENT_SERVICE_ID_ADMIN_META,
                readiness: {
                  routingReady: true,
                },
              }],
            }],
          }],
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
    );

    try {
      const result = await node.getStatus();
      assert.strictEqual(
        capturedQuery.sql,
        NODE_CLIENT_SERVICE_DISCOVERY_SQL,
        'getStatus should query local service discovery snapshot',
      );
      assert.strictEqual(
        result.rows[0].status,
        'active',
        'routing-ready admin replica should be treated as ACTIVE',
      );
    } finally {
      node.closeQueryConnection();
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  });

registerClusterNodeHandleControlSnapshotTests();

test('Unit: NodeHandle.subscribeLogStream receives log CDC events', async () => {
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should expose listen address');
  const adminApiPort = address.port;

  const expectedEntry = {
    log_id: 'log-1',
    node_id: 'node-1',
    level: 'error',
    message: 'streamed log',
    timestamp: Date.now(),
  };

  server.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'cache_dump',
      data: {},
    }));
    socket.send(JSON.stringify({
      type: 'cdc_event',
      table: 'logs',
      operation: 'insert',
      record: expectedEntry,
    }));
  });

  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    adminApiPort,
  );

  let removeListener = () => {};
  try {
    const received = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('timed out waiting for streamed log event'));
      }, 500);

      Promise.resolve(
        node.subscribeLogStream((entry) => {
          clearTimeout(timeout);
          resolve(entry);
        }),
      ).then((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          removeListener = unsubscribe;
        }
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    assert.deepStrictEqual(
      received,
      expectedEntry,
      'should stream logs table CDC record to subscribers',
    );
  } finally {
    removeListener();
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
});

registerClusterBootstrapApiReadinessTests();
