/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import http from 'node:http';
import assert from 'node:assert';
import {promises as fs} from 'node:fs';
import {resolve as resolvePath} from 'node:path';
import fc from 'fast-check';
import {validate as uuidValidate} from 'uuid';
import {WebSocketServer} from 'ws';
import {distributeNodes} from '../cluster.js';

const REUSE_START_COMMAND =
  'if [ -f /harness-control/reset-data-on-start ]; then rm -rf /data/* && ' +
  'rm -f /harness-control/reset-data-on-start; fi; ' +
  'exec node --max-old-space-size=1536 /app/src/index.js';

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

test('Unit: NodeHandle.getControlSnapshot uses injected default admin timeout',
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
            nodeId: 'node-1',
            capturedAt: 1,
            nodes: [],
          }],
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
      await node.getControlSnapshot();
      assert.strictEqual(
        capturedQuery.sql,
        NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
        'getControlSnapshot should query the canonical control snapshot SQL',
      );
      assert.strictEqual(
        capturedQuery.timeoutMs,
        4321,
        'getControlSnapshot should inherit the injected default admin timeout',
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

test('Unit: NodeHandle.getControlSnapshot reuses explicit stale observations ' +
  'before escalating to forced repair', async () => {
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

  const capturedQueries = [];
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'cache_dump',
      data: {},
    }));
    socket.on('message', (data) => {
      const capturedQuery = JSON.parse(data.toString());
      capturedQueries.push(capturedQuery);
      socket.send(JSON.stringify({
        type: 'query_result',
        queryId: capturedQuery.queryId,
        results: [{
          nodeId: 'node-1',
          capturedAt: 1,
          nodes: [],
          snapshotObservation: {
            state: 'stale_usable',
            contractState: 'pending',
          },
        }],
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
    await node.getControlSnapshot({forceRepair: true});
    assert.deepEqual(
      capturedQueries.map((query) => query.sql),
      [NODE_CLIENT_CONTROL_SNAPSHOT_SQL],
      'forced repair should stay on the local control snapshot when the response already carries an explicit non-failed observation',
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

test('Unit: _isNodeActive matches active status case-insensitively', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  assert.strictEqual(
    cluster._isNodeActive({rows: [{status: 'active'}]}),
    true,
    'lowercase active should be treated as active',
  );
  assert.strictEqual(
    cluster._isNodeActive({rows: [{status: 'ACTIVE'}]}),
    true,
    'uppercase active should be treated as active',
  );
  assert.strictEqual(
    cluster._isNodeActive({status: 'active'}),
    true,
    'top-level lowercase active should be treated as active',
  );
  assert.strictEqual(
    cluster._isNodeActive({rows: [{status: 'ready'}]}),
    false,
    'non-active status should remain false',
  );
});

test('Unit: _waitForBootstrapApi succeeds after transient non-2xx statuses',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
    });

    const bootstrapStatuses = [503, -1, 200];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const status = bootstrapStatuses[Math.min(
        bootstrapCallCount,
        bootstrapStatuses.length - 1,
      )];
      bootstrapCallCount += 1;
      return status;
    };
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForBootstrapApi({
      id: '00000000-0000-4000-8000-000000000001',
      ip: '127.0.0.1',
    });
    assert.strictEqual(
      bootstrapCallCount,
      bootstrapStatuses.length,
      'should poll until bootstrap API returns a join-ready 2xx response',
    );
  });

test('Unit: _waitForBootstrapApi waits for bootstrap join readiness probe',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
    });

    const bootstrapStatuses = [503, 503, 200];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const status = bootstrapStatuses[Math.min(
        bootstrapCallCount,
        bootstrapStatuses.length - 1,
      )];
      bootstrapCallCount += 1;
      return status;
    };
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForBootstrapApi({
      id: '00000000-0000-4000-8000-000000000001',
      ip: '127.0.0.1',
    });
    assert.strictEqual(
      bootstrapCallCount,
      bootstrapStatuses.length,
      'should wait for bootstrap probe success readiness',
    );
  });

test('Unit: _waitForBootstrapApi probes lightweight bootstrap readiness endpoint',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
    });

    const probeCalls = [];
    cluster._httpRequest = async (request) => {
      probeCalls.push(request);
      return {
        status: 200,
        body: {
          ready: true,
          scope: 'bootstrap_join',
        },
      };
    };
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForBootstrapApi({
      id: '00000000-0000-4000-8000-000000000001',
      ip: '127.0.0.1',
    });

    assert.strictEqual(
      probeCalls.length,
      1,
      'startup gate should probe readiness endpoint exactly once on immediate success',
    );
    assert.strictEqual(
      probeCalls[0].method,
      'GET',
      'startup gate should use GET readiness probe',
    );
    assert.ok(
      probeCalls[0].url.endsWith('/bootstrap/ready'),
      'startup gate should target lightweight /bootstrap/ready endpoint',
    );
  });

test('Unit: _waitForBootstrapApi returns on first bootstrap-ready success',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 200,
        bootstrapReadyStableWindowMs: 2000,
      },
    });

    const bootstrapStatuses = [503, 200, 503, 503];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const status = bootstrapStatuses[Math.min(
        bootstrapCallCount,
        bootstrapStatuses.length - 1,
      )];
      bootstrapCallCount += 1;
      return status;
    };
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForBootstrapApi({
      id: '00000000-0000-4000-8000-000000000001',
      ip: '127.0.0.1',
    });

    assert.ok(
      bootstrapCallCount === 2,
      'should stop probing after the first bootstrap-ready success',
    );
  });

test('Unit: _waitForBootstrapApi extends past startup timeout while progress advances',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 10,
        bootstrapReadyStableWindowMs: 10,
      },
    });

    const probeResponses = [
      {
        status: 503,
        body: {
          ready: false,
          phase: 'INIT',
          reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
        },
      },
      {
        status: 503,
        body: {
          ready: false,
          phase: 'CONTROL_READY',
          phaseRank: 1,
          reasons: ['SQL_ENGINE_UNAVAILABLE'],
        },
      },
      {
        status: 503,
        body: {
          ready: false,
          phase: 'JOIN_READY',
          phaseRank: 2,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableWindowMs: 10,
          stableElapsedMs: 5,
        },
      },
      {
        status: 200,
        body: {
          ready: true,
          phase: 'JOIN_READY',
          phaseRank: 2,
          reasons: [],
        },
      },
    ];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const response = probeResponses[Math.min(
        bootstrapCallCount,
        probeResponses.length - 1,
      )];
      bootstrapCallCount += 1;
      return response;
    };
    const originalDateNow = Date.now;
    let fakeNowMs = 0;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {
      fakeNowMs += 5;
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    try {
      await cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      });
    } finally {
      Date.now = originalDateNow;
    }

    assert.ok(
      bootstrapCallCount >= 4,
      'should keep probing past the base startup timeout while readiness advances',
    );
  });
