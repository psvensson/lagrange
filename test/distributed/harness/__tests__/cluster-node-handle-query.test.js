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

async function withTestAdminWebSocketNode(
  onConnection, options, callback, serverOptions = {},
) {
  const server = new WebSocketServer({
    host: TEST_ADMIN_HOST,
    port: TEST_ADMIN_PORT_ANY,
    ...serverOptions,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should expose listen address');
  server.on('connection', (socket, request) => {
    socket.send(JSON.stringify({
      type: TEST_CACHE_DUMP_MESSAGE_TYPE,
      data: TEST_EMPTY_CACHE_DUMP,
    }));
    onConnection(socket, request);
  });

  const node = new NodeHandle(
    TEST_NODE_ID,
    TEST_CONTAINER_ID,
    TEST_ADMIN_HOST,
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    address.port,
    options,
  );

  try {
    await callback(node);
  } finally {
    node.closeQueryConnection();
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  }
}

const CONNECTION_BUDGET_MS = 5000;
const PEER_BUDGET_MS = 10000;

function observeAdminQueries(socket, onQuery) {
  socket.on('message', (data) => {
    const query = JSON.parse(data.toString());
    onQuery(query, () => socket.send(JSON.stringify({
      type: TEST_QUERY_RESULT_MESSAGE_TYPE,
      queryId: query.queryId,
      results: [{sql: query.sql}],
    })));
  });
}

test('Unit: NodeHandle refuses to send after a shared handshake spends its request deadline',
  async () => {
    const opening = Promise.withResolvers();
    const forwarded = [];
    let elapsedMs = 0;
    await withTestAdminWebSocketNode((socket) => {
      observeAdminQueries(socket, (query, answer) => {
        forwarded.push({sql: query.sql, timeoutMs: query.timeoutMs});
        answer();
      });
    }, {adminRequestNow: () => elapsedMs}, async (node) => {
      const realNow = Date.now;
      const startedAt = realNow();
      let wallClockMs = startedAt;
      Date.now = () => wallClockMs;
      try {
        const results = Promise.allSettled([
          node.queryWithTimeout('SELECT expired', [], {timeoutMs: CONNECTION_BUDGET_MS}),
          node.queryWithTimeout('SELECT peer', [], {timeoutMs: PEER_BUDGET_MS}),
        ]);
        const open = await opening.promise;
        // Run the actual opening callback after the short budget has expired
        // while its timer is queued and the wall clock has moved backwards.
        elapsedMs = CONNECTION_BUDGET_MS + 1;
        wallClockMs -= CONNECTION_BUDGET_MS;
        open(true);
        const [expired, peer] = await results;
        assert.equal(expired.status, 'rejected');
        assert.match(expired.reason.message, /timed out/i);
        assert.equal(peer.status, 'fulfilled');
        assert.deepEqual(peer.value.rows, [{sql: 'SELECT peer'}]);
        assert.deepEqual(forwarded, [{
          sql: 'SELECT peer',
          timeoutMs: PEER_BUDGET_MS - elapsedMs,
        }]);
        const expiry = node.getAdminQueryTraceSnapshot()
          .find(({statementPreview}) => statementPreview === 'SELECT expired');
        assert.equal(expiry.outcome, 'timeout');
        assert.equal(expiry.sentAtMs, null);
        assert.equal(expiry.durationMs, elapsedMs);
      } finally {
        Date.now = realNow;
      }
    }, {verifyClient: (_request, open) => opening.resolve(open)});
  });

test('Unit: NodeHandle rejects an actual delivered response after its original deadline',
  async () => {
    const sent = Promise.withResolvers();
    const held = new Map();
    let elapsedMs = 0;
    await withTestAdminWebSocketNode((socket) => {
      observeAdminQueries(socket, (query, answer) => {
        held.set(query.sql, answer);
        if (held.size === 2) sent.resolve();
      });
    }, {adminRequestNow: () => elapsedMs}, async (node) => {
      const results = Promise.allSettled([
        node.queryWithTimeout('SELECT late', [], {timeoutMs: CONNECTION_BUDGET_MS}),
        node.queryWithTimeout('SELECT peer', [], {timeoutMs: PEER_BUDGET_MS}),
      ]);
      await sent.promise;
      elapsedMs = CONNECTION_BUDGET_MS + 1;
      held.get('SELECT late')();
      held.get('SELECT peer')();
      const [late, peer] = await results;
      assert.equal(late.status, 'rejected');
      assert.match(late.reason.message, /timed out/i);
      assert.equal(peer.status, 'fulfilled');
      assert.deepEqual(peer.value.rows, [{sql: 'SELECT peer'}]);
      const expiry = node.getAdminQueryTraceSnapshot()
        .find(({statementPreview}) => statementPreview === 'SELECT late');
      assert.equal(expiry.outcome, 'timeout');
      assert.ok(Number.isFinite(expiry.sentAtMs));
      assert.equal(expiry.resolvedAtMs, null);
    });
  });

test('Unit: NodeHandle request timer detaches only the expired query on a shared lane',
  async () => {
    const sent = Promise.withResolvers();
    const held = new Map();
    let connections = 0;
    await withTestAdminWebSocketNode((socket) => {
      connections += 1;
      observeAdminQueries(socket, (query, answer) => {
        if (query.sql === 'SELECT warm' || query.sql === 'SELECT followup') {
          answer();
        } else {
          held.set(query.sql, answer);
          if (held.size === 2) sent.resolve();
        }
      });
    }, {}, async (node) => {
      await node.query('SELECT warm');
      const short = assert.rejects(node.queryWithTimeout('SELECT expired', [], {
        timeoutMs: ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
      }), /timed out/i);
      const peer = node.queryWithTimeout('SELECT peer', [], {timeoutMs: PEER_BUDGET_MS});
      // Preserve its rejection on the known-bad implementation while checking
      // the independent request timer and then permitting the peer to reply.
      const peerOutcome = Promise.allSettled([peer]);
      await sent.promise;
      await short;
      held.get('SELECT expired')();
      held.get('SELECT peer')();
      const [survivor] = await peerOutcome;
      assert.equal(survivor.status, 'fulfilled');
      assert.deepEqual(survivor.value.rows, [{sql: 'SELECT peer'}]);
      assert.deepEqual((await node.query('SELECT followup')).rows,
        [{sql: 'SELECT followup'}]);
      assert.equal(connections, 1);
      assert.equal(node._getPendingQueries('default').size, 0);
    });
  });

test('Unit: NodeHandle retires an opening attempt without replacing its successor socket',
  async () => {
    const forwarded = [];
    let connections = 0;
    await withTestAdminWebSocketNode((socket) => {
      connections += 1;
      observeAdminQueries(socket, (query, answer) => {
        forwarded.push(query.sql);
        answer();
      });
    }, {}, async (node) => {
      const expired = assert.rejects(node.queryWithTimeout('SELECT retired', [],
        {lane: TEST_SNAPSHOT_LANE}), /connection reset/i);
      node._resetAdminSocket(TEST_SNAPSHOT_LANE);
      const successor = node.queryWithTimeout('SELECT successor', [],
        {lane: TEST_SNAPSHOT_LANE});
      const [, result] = await Promise.all([expired, successor]);
      assert.deepEqual(result.rows, [{sql: 'SELECT successor'}]);
      assert.deepEqual(forwarded, ['SELECT successor']);
      assert.equal(connections, 1);
      assert.equal(node._getPendingQueries(TEST_SNAPSHOT_LANE).size, 0);
    });
  });

test('Unit: NodeHandle encoding failure only rejects the malformed request',
  async () => {
    const peerHeld = Promise.withResolvers();
    await withTestAdminWebSocketNode((socket) => {
      observeAdminQueries(socket, (query, answer) => {
        assert.equal(query.sql, 'SELECT peer');
        peerHeld.resolve(answer);
      });
    }, {}, async (node) => {
      const peer = node.query('SELECT peer');
      const peerOutcome = Promise.allSettled([peer]);
      const answerPeer = await peerHeld.promise;
      await assert.rejects(node.queryWithTimeout('SELECT malformed', [1n]),
        /serialize a BigInt/i);
      answerPeer();
      const [survivor] = await peerOutcome;
      assert.equal(survivor.status, 'fulfilled');
      assert.deepEqual(survivor.value.rows, [{sql: 'SELECT peer'}]);
      assert.equal(node._getPendingQueries('default').size, 0);
    });
  });

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
  let capturedQuery = null;
  await withTestAdminWebSocketNode(
    (socket) => {
      socket.once('message', (data) => {
        capturedQuery = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: capturedQuery.queryId,
          results: [{node_id: 'node-1', status: 'active'}],
          count: 1,
        }));
      });
    },
    {},
    async (node) => {
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
    },
  );
});

test('Unit: NodeHandle.query uses injected default admin timeout', async () => {
  let capturedQuery = null;
  await withTestAdminWebSocketNode(
    (socket) => {
      socket.on('message', (data) => {
        capturedQuery = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: capturedQuery.queryId,
          results: [{ok: 1}],
          count: 1,
        }));
      });
    },
    {adminQueryTimeoutMs: 4321, adminRequestNow: () => 0},
    async (node) => {
      await node.query('SELECT 1');
      assert.strictEqual(
        capturedQuery.timeoutMs,
        4321,
        'without elapsed time query() forwards the configured default',
      );
      await node._sendAdminRequest({
        type: 'query', sql: 'SELECT 1', timeoutMs: 120,
      }, 'query', {timeoutMs: CONNECTION_BUDGET_MS});
      assert.strictEqual(capturedQuery.timeoutMs, 120,
        'an explicit shorter server cap remains in force');
    },
  );
});

test('Unit: NodeHandle.queryWithTimeout opens lane-tagged admin stream sockets',
  async () => {
    let observedRequestUrl = null;
    await withTestAdminWebSocketNode(
      (socket, request) => {
        observedRequestUrl = request?.url || null;
        socket.once('message', (data) => {
          const parsed = JSON.parse(data.toString());
          socket.send(JSON.stringify({
            type: 'query_result',
            queryId: parsed.queryId,
            results: [{ok: 1}],
            count: 1,
          }));
        });
      },
      {},
      async (node) => {
        const result = await node.queryWithTimeout('SELECT 1', [], {
          lane: 'load',
        });
        assert.deepStrictEqual(result.rows, [{ok: 1}]);
        assert.ok(
          typeof observedRequestUrl === 'string' &&
          observedRequestUrl.includes('/api/admin/stream?lane=load'),
          'lane-tagged admin stream URL should include load lane query parameter',
        );
      },
    );
  });

test('Unit: NodeHandle.queryWithTimeout preserves structured visibility ' +
  'metadata from admin stream successes',
async () => {
  const successReasonCode = 'publication_epoch_pending';
  await withTestAdminWebSocketNode(
    (socket) => {
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
    },
    {},
    async (node) => {
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
    },
  );
});

test('Unit: NodeHandle.queryWithTimeout preserves admin stream errorCode',
  async () => {
    await withTestAdminWebSocketNode(
      (socket) => {
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
      },
      {},
      async (node) => {
        await assert.rejects(
          node.queryWithTimeout('SELECT 1'),
          (error) => {
            assert.strictEqual(error.code, 'routing_not_ready');
            assert.strictEqual(error.hint, 'retry on healthy node');
            assert.match(String(error.message), /routing not ready/i);
            return true;
          },
        );
      },
    );
  });

test('Unit: NodeHandle.queryWithTimeout preserves retry metadata from admin stream',
  async () => {
    const deferredReasonCode = 'publication_epoch_pending';
    await withTestAdminWebSocketNode(
      (socket) => {
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
      },
      {},
      async (node) => {
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
      },
    );
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
      assert.ok(capturedQuery.timeoutMs > 0 &&
        capturedQuery.timeoutMs <= ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
      'query payload carries only the remaining per-request timeout grant');
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

test('Unit: NodeHandle.queryWithTimeout single-flights concurrent cold connections and reconnects after close', async () => {
  let snapshotConnectionCount = 0;
  let activeSnapshotSocket = null;
  await withTestAdminWebSocketNode(
    (socket, request) => {
      const requestUrl = new URL(
        request?.url || '',
        'ws://' + TEST_ADMIN_HOST,
      );
      if (requestUrl.searchParams.get('lane') === TEST_SNAPSHOT_LANE) {
        snapshotConnectionCount += 1;
        activeSnapshotSocket = socket;
      }
      socket.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        socket.send(JSON.stringify({
          type: TEST_QUERY_RESULT_MESSAGE_TYPE,
          queryId: parsed.queryId,
          results: [TEST_RESET_LANE_ROW],
          count: TEST_QUERY_RESULT_COUNT,
        }));
      });
    },
    {},
    async (node) => {
      const concurrentResults = await Promise.all([
        node.queryWithTimeout('SELECT 1', [], {lane: TEST_SNAPSHOT_LANE}),
        node.queryWithTimeout('SELECT 2', [], {lane: TEST_SNAPSHOT_LANE}),
        node.queryWithTimeout('SELECT 3', [], {lane: TEST_SNAPSHOT_LANE}),
        node.queryWithTimeout('SELECT 4', [], {lane: TEST_SNAPSHOT_LANE}),
      ]);
      assert.strictEqual(concurrentResults.length, 4);
      assert.strictEqual(
        snapshotConnectionCount,
        1,
        'concurrent cold queries on the same lane must share a single WebSocket connection',
      );
      const clientSocket = node._adminSocketByLane.get(TEST_SNAPSHOT_LANE);
      assert.ok(clientSocket, 'snapshot lane socket should be tracked');
      const closedOnClient = new Promise((resolve) => {
        clientSocket.once('close', resolve);
      });
      activeSnapshotSocket.close();
      await closedOnClient;
      const reconnectedResult = await node.queryWithTimeout(
        'SELECT 5',
        [],
        {lane: TEST_SNAPSHOT_LANE},
      );
      assert.deepStrictEqual(reconnectedResult.rows, [TEST_RESET_LANE_ROW]);
      assert.strictEqual(
        snapshotConnectionCount,
        2,
        'query after remote socket close must open a fresh WebSocket instead of reusing a resolved readyPromise',
      );
    },
  );
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
