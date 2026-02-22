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
import fc from 'fast-check';
import {validate as uuidValidate} from 'uuid';
import {WebSocketServer} from 'ws';
import {distributeNodes} from '../cluster.js';

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
test('Property 5: Multi-Host Container Distribution', async (t) => {
  await t.test(
    'no host exceeds nodesPerHost and total equals min(size, H*P)',
    async () => {
      const configArb = fc.record({
        hostCount: fc.integer({min: 1, max: 10}),
        nodesPerHost: fc.integer({min: 1, max: 20}),
        clusterSize: fc.integer({min: 1, max: 100}),
      });

      fc.assert(
        fc.property(configArb, ({hostCount, nodesPerHost, clusterSize}) => {
          // Build a mock providers array of the right length
          const providers = new Array(hostCount).fill(null);

          const assignment = distributeNodes(
            clusterSize, providers, nodesPerHost,
          );

          const capacity = hostCount * nodesPerHost;
          const expectedTotal = Math.min(clusterSize, capacity);

          // Total assignments equals min(clusterSize, H * P)
          assert.strictEqual(
            assignment.length,
            expectedTotal,
            `expected ${expectedTotal} assignments, got ${assignment.length}` +
            ` (hosts=${hostCount}, perHost=${nodesPerHost},` +
            ` size=${clusterSize})`,
          );

          // Count per-host assignments
          const perHostCount = new Array(hostCount).fill(0);
          for (const hostIdx of assignment) {
            // All host indices must be valid
            assert.ok(
              hostIdx >= 0 && hostIdx < hostCount,
              `host index ${hostIdx} out of range [0, ${hostCount})`,
            );
            perHostCount[hostIdx]++;
          }

          // No host exceeds nodesPerHost
          for (let h = 0; h < hostCount; h++) {
            assert.ok(
              perHostCount[h] <= nodesPerHost,
              `host ${h} has ${perHostCount[h]} containers,` +
              ` exceeds limit ${nodesPerHost}`,
            );
          }
        }),
        {numRuns: 10},
      );
    },
  );
});

// --- Unit Tests for Cluster ---

import {createCluster, Cluster, NodeHandle} from '../cluster.js';
import {
  LABELS,
  NODE_ROLES,
  CONTAINER_ENV_KEYS,
  PORTS,
  RAFT_PROVIDER_DEFAULTS,
} from '../constants.js';
import {ENTRYPOINT_ENV} from '../../../../src/constants/entrypoint.js';

const LOAD_STOP_DISPATCH_SETTLE_MS = 25;
const LOAD_STOP_WAIT_TIMEOUT_MS = 250;
const ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS = 150;

/**
 * Unit: createCluster returns object with all required methods (Req 2.4)
 */
test('Unit: createCluster exposes every required method', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const requiredMethods = [
    'start',
    'stop',
    'getNode',
    'getNodes',
    'randomNonSeed',
    'waitForConvergence',
    'assertConsistency',
    'assertDataIntegrity',
    'killNode',
    'stopNode',
    'pauseNode',
    'unpauseNode',
    'restartNode',
    'partitionNetwork',
    'healPartition',
    'slowNetwork',
    'corruptDisk',
    'startLoad',
  ];

  for (const method of requiredMethods) {
    assert.strictEqual(
      typeof cluster[method],
      'function',
      'cluster should have method: ' + method,
    );
  }
});

test('Unit: createCluster returns a Cluster instance', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  assert.ok(
    cluster instanceof Cluster,
    'createCluster should return a Cluster instance',
  );
});

test('Unit: startLoad emits progress and completion playback events', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const playbackEvents = [];
  cluster._recordPlaybackEvent = (type, scope, entityId, details) => {
    playbackEvents.push({
      type,
      scope,
      entityId,
      details,
    });
  };

  const run = cluster.startLoad({
    opsPerSec: 5,
    duration: 1200,
  });
  const metrics = await run.waitComplete();
  assert.ok(metrics, 'waitComplete should resolve metrics');

  const started = playbackEvents.filter((event) =>
    event.type === 'load.started',
  );
  const progress = playbackEvents.filter((event) =>
    event.type === 'load.progress',
  );
  const completed = playbackEvents.filter((event) =>
    event.type === 'load.completed',
  );

  assert.strictEqual(
    started.length,
    1,
    'startLoad should emit one load.started event',
  );
  assert.ok(
    progress.length >= 1,
    'startLoad should emit periodic load.progress events while running',
  );
  assert.strictEqual(
    completed.length,
    1,
    'startLoad should emit one load.completed event',
  );
  assert.ok(
    completed[0].details &&
      completed[0].details.metrics,
    'load.completed should include final metrics',
  );
});

test('Unit: Cluster.stop cancels active load runs', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const mockProvider = {
    stopContainer: async () => {},
    removeContainer: async () => {},
  };
  const node = {
    id: 'n1',
    role: NODE_ROLES.SEED,
    containerId: 'container-1',
    _dockerProvider: mockProvider,
    closeQueryConnection: () => {},
    async query(_sql) {
      return new Promise(() => {});
    },
  };

  cluster._nodes.set(node.id, node);
  cluster._providers = [mockProvider];
  cluster._hostAssignment = [0];
  cluster._logCollector.collectFinalSnapshot = async () => [];
  cluster._logCollector.stopSubscription = async () => {};
  cluster._playbackRecorder = {
    suspendPolling: () => {},
    stop: async () => null,
    recordEvent: () => {},
  };

  const run = cluster.startLoad({
    opsPerSec: 100,
    duration: 60000,
    maxInFlight: 1,
  });
  let timeoutId = null;

  try {
    await new Promise((resolve) =>
      setTimeout(resolve, LOAD_STOP_DISPATCH_SETTLE_MS),
    );
    await cluster.stop();

    const metrics = await Promise.race([
      run.waitComplete(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('waitComplete did not resolve during cluster stop'));
        }, LOAD_STOP_WAIT_TIMEOUT_MS);
      }),
    ]);
    assert.strictEqual(typeof metrics.total, 'number');
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    run.cancel();
  }
});

/**
 * Unit: local vs remote Docker connection routing (Req 2.2)
 */
test('Unit: local socketPath creates a single provider', async () => {
  const cluster = createCluster({
    size: 5,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  assert.strictEqual(
    cluster._providers.length,
    1,
    'local config should create exactly 1 provider',
  );
});

test('Unit: remote hosts creates one provider per host', async () => {
  const hosts = [
    'tcp://192.168.1.1:2376',
    'tcp://192.168.1.2:2376',
    'tcp://192.168.1.3:2376',
  ];
  const cluster = createCluster({
    size: 9,
    docker: {hosts},
    nodesPerHost: 3,
    image: 'distributed-db:test',
  });

  assert.strictEqual(
    cluster._providers.length,
    hosts.length,
    'remote config should create one provider per host',
  );
});

test('Unit: local config assigns all nodes to host index 0', async () => {
  const cluster = createCluster({
    size: 4,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  for (let i = 0; i < cluster._hostAssignment.length; i++) {
    assert.strictEqual(
      cluster._hostAssignment[i],
      0,
      'all nodes should be assigned to host 0 for local config',
    );
  }
  assert.strictEqual(
    cluster._hostAssignment.length,
    4,
    'host assignment length should match cluster size',
  );
});

test('Unit: remote config distributes nodes across hosts', async () => {
  const cluster = createCluster({
    size: 6,
    docker: {
      hosts: [
        'tcp://10.0.0.1:2376',
        'tcp://10.0.0.2:2376',
      ],
    },
    nodesPerHost: 4,
    image: 'distributed-db:test',
  });

  assert.strictEqual(
    cluster._hostAssignment.length,
    6,
    'should have 6 host assignments',
  );

  const perHost = [0, 0];
  for (const idx of cluster._hostAssignment) {
    perHost[idx]++;
  }
  assert.ok(
    perHost[0] <= 4 && perHost[1] <= 4,
    'no host should exceed nodesPerHost limit of 4',
  );
  assert.strictEqual(
    perHost[0] + perHost[1],
    6,
    'total assignments should equal cluster size',
  );
});

test('Unit: NodeHandle.isReachable checks bootstrap health endpoint', async () => {
  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
  );

  const originalGet = http.get;
  const calledUrls = [];
  http.get = (url, _options, callback) => {
    calledUrls.push(String(url));
    const req = {
      on: () => req,
      destroy: () => {},
    };
    process.nextTick(() => {
      callback({
        statusCode: String(url).endsWith('/health') ? 200 : 404,
        resume: () => {},
      });
    });
    return req;
  };

  try {
    const reachable = await node.isReachable();
    assert.strictEqual(reachable, true, 'health endpoint should be reachable');
    assert.ok(calledUrls[0].endsWith('/health'), 'should probe /health endpoint');
  } finally {
    http.get = originalGet;
  }
});

test('Unit: NodeHandle.isReachable uses admin health when bootstrap health is unavailable',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQuery = node.query;
    const calledUrls = [];
    let queryCalled = false;
    http.get = (url, _options, callback) => {
      calledUrls.push(String(url));
      const req = {
        on: (event, handler) => {
          if (event === 'error' && String(url).includes(':8080/health')) {
            process.nextTick(() => handler(new Error('connect ECONNREFUSED')));
          }
          return req;
        },
        destroy: () => {},
      };
      if (String(url).includes(':8081/health')) {
        process.nextTick(() => {
          callback({
            statusCode: 200,
            resume: () => {},
          });
        });
      }
      return req;
    };
    node.query = async () => {
      queryCalled = true;
      throw new Error('query probe should not be used');
    };

    try {
      const reachable = await node.isReachable();
      assert.strictEqual(reachable, true, 'admin health probe should mark node reachable');
      assert.strictEqual(queryCalled, false, 'should not issue query fallback');
      assert.ok(calledUrls.some((url) => url.includes(':8080/health')),
        'should probe bootstrap health endpoint first');
      assert.ok(calledUrls.some((url) => url.includes(':8081/health')),
        'should probe admin health endpoint');
    } finally {
      http.get = originalGet;
      node.query = originalQuery;
    }
  });

test('Unit: NodeHandle.isReachable falls back to admin query when HTTP probes are unavailable',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    let queryProbeCount = 0;
    const calledUrls = [];
    const originalQuery = node.query;
    const originalGetAdminSocket = node._getAdminSocket;
    http.get = (url, _options, _callback) => {
      calledUrls.push(String(url));
      const req = {
        on: (event, handler) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('connect ECONNREFUSED')));
          }
          return req;
        },
        destroy: () => {},
      };
      return req;
    };
    node.query = async (sql) => {
      if (sql === 'SELECT node_id FROM nodes LIMIT 1') {
        queryProbeCount += 1;
      }
      return {rows: [{ok: 1}]};
    };
    node._getAdminSocket = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8081');
    };

    try {
      const reachable = await node.isReachable();
      assert.strictEqual(reachable, true,
        'admin query probe should mark node reachable');
      assert.strictEqual(queryProbeCount, 1, 'should issue exactly one admin probe');
      assert.strictEqual(calledUrls.length, 2,
        'should attempt both bootstrap and admin HTTP health probes');
    } finally {
      http.get = originalGet;
      node.query = originalQuery;
      node._getAdminSocket = originalGetAdminSocket;
    }
  });

test('Unit: NodeHandle.getReachabilityDiagnostics reports all probe stages on failure',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQuery = node.query;
    const originalGetAdminSocket = node._getAdminSocket;
    http.get = (_url, _options, callback) => {
      const req = {
        on: () => req,
        destroy: () => {},
      };
      process.nextTick(() => {
        callback({
          statusCode: 503,
          resume: () => {},
        });
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.query = async () => {
      throw new Error('sql probe failed');
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics();
      assert.strictEqual(diagnostics.reachable, false);
      assert.strictEqual(diagnostics.bootstrapHealth.attempted, true);
      assert.strictEqual(diagnostics.bootstrapHealth.ok, false);
      assert.strictEqual(diagnostics.adminHealth.attempted, true);
      assert.strictEqual(diagnostics.adminHealth.ok, false);
      assert.strictEqual(diagnostics.adminWs.attempted, true);
      assert.strictEqual(diagnostics.adminWs.ok, false);
      assert.strictEqual(diagnostics.sqlProbe.attempted, true);
      assert.strictEqual(diagnostics.sqlProbe.ok, false);
      assert.strictEqual(diagnostics.lastError, 'sql probe failed');
    } finally {
      http.get = originalGet;
      node.query = originalQuery;
      node._getAdminSocket = originalGetAdminSocket;
    }
  });

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

test('Unit: _waitForBootstrapApi requires stable success window before proceeding',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 200,
        bootstrapReadyStableWindowMs: 2,
      },
    });

    const bootstrapStatuses = [503, 200, 503, 200, 200];
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
      bootstrapCallCount > 2,
      'should keep probing until join-ready status stays stable',
    );
  });

test('Unit: _waitForBootstrapApi requires sustained success across stable window',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 200,
        bootstrapReadyStableWindowMs: 2,
      },
    });

    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      bootstrapCallCount += 1;
      if (bootstrapCallCount === 1) {
        return 503;
      }
      return 200;
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
      bootstrapCallCount >= 3,
      'should keep probing until join-ready status remains stable',
    );
  });

test('Unit: _waitForBootstrapApi exposes diagnostic status summary on timeout',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 40, bootstrapReadyStableWindowMs: 0},
    });

    const bootstrapStatuses = [503, 503, -1, 503];
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

    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /attempts=/, 'should include attempt count');
        assert.match(error.message, /lastStatus=/, 'should include last status');
        assert.match(error.message, /statusCounts=/, 'should include status histogram');
        return true;
      },
    );
    assert.ok(bootstrapCallCount > 0, 'should execute bootstrap readiness probes');
  });

test('Unit: _waitForBootstrapApi timeout diagnostics include readiness reasons and histograms',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 40, bootstrapReadyStableWindowMs: 0},
    });

    const probeResponses = [
      {
        status: 503,
        body: {
          ready: false,
          phase: 'CONTROL_READY',
          state: 'bootstrapping',
          reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
        },
      },
      {
        status: 503,
        body: {
          ready: false,
          phase: 'JOIN_READY',
          state: 'warming',
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
        },
      },
      {status: -1, body: null},
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
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };

    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /statusCounts=/, 'should include status histogram');
        assert.match(error.message, /phaseCounts=/, 'should include phase histogram');
        assert.match(error.message, /lastPhase=/, 'should include last phase');
        assert.match(error.message, /reasonCounts=/, 'should include reason histogram');
        assert.match(error.message, /lastReasons=/, 'should include last blocker reasons');
        return true;
      },
    );
    assert.ok(bootstrapCallCount > 0, 'should execute readiness probes before timeout');
  });

test('Unit: _waitForBootstrapApi records periodic startup-stage diagnostics',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
    });

    const bootstrapStatuses = new Array(20).fill(503).concat([200]);
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

    const stageEvents = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      stageEvents.push({stage, details});
    };

    await cluster._waitForBootstrapApi({
      id: '00000000-0000-4000-8000-000000000001',
      ip: '127.0.0.1',
    });

    assert.strictEqual(
      bootstrapCallCount,
      bootstrapStatuses.length,
      'should continue polling until join readiness succeeds',
    );
    assert.strictEqual(
      stageEvents.length,
      1,
      'should emit one periodic waiting stage event at attempt 20',
    );
    assert.strictEqual(
      stageEvents[0].stage,
      'setup.seed.bootstrap.waiting',
      'should emit bootstrap waiting stage',
    );
    assert.strictEqual(
      stageEvents[0].details.nodeId,
      '00000000-0000-4000-8000-000000000001',
      'should include seed node id in waiting stage diagnostics',
    );
    assert.strictEqual(
      stageEvents[0].details.attempts,
      20,
      'should report periodic waiting attempts',
    );
  });

test('Unit: _waitForAllActive times out when a node status probe hangs',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {convergence: 40},
    });

    cluster._nodes.set('stuck-node', {
      id: 'stuck-node',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return new Promise(() => {});
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};

    let timeoutId = null;
    try {
      await assert.rejects(
        async () => {
          await Promise.race([
            cluster._waitForAllActive(),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error('waitForAllActive hung'));
              }, ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS);
            }),
          ]);
        },
        (error) => {
          assert.match(
            error.message,
            /Not all nodes reached ACTIVE state within/,
          );
          return true;
        },
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  });

test('Unit: _waitForAllActive exposes diagnostic summary on timeout',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {convergence: 30},
    });

    cluster._nodes.set('joining-node', {
      id: 'joining-node',
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'joining'}]};
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };

    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster._waitForAllActive(),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /attempts=/, 'should include attempt count');
        assert.match(
          error.message,
          /nodeDiagnostics=/,
          'should include node-level diagnostics',
        );
        return true;
      },
    );
  });

test('Unit: Cluster.start generates UUID node IDs', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const generatedIds = [];
  const mockProvider = {
    createNetwork: async () => ({id: 'net-1', name: 'net-1'}),
    removeNetwork: async () => {},
    stopContainer: async () => {},
    removeContainer: async () => {},
  };

  cluster._providers = [mockProvider];
  cluster._hostAssignment = [0, 0, 0];
  cluster._startNode = async (nodeId, role, _seedIp, _nodeIndex) => {
    generatedIds.push(nodeId);
    const containerId = 'container-' + generatedIds.length;
    const ip = '10.0.0.' + generatedIds.length;
    return new NodeHandle(nodeId, containerId, ip, role, mockProvider);
  };
  cluster._waitForBootstrapApi = async () => {};
  cluster._waitForAllActive = async () => {};
  cluster._logCollector.startLiveSubscription = async () => {};
  cluster._logCollector.collectFinalSnapshot = async () => {};
  cluster._logCollector.stopSubscription = async () => {};

  await cluster.start();

  assert.strictEqual(generatedIds.length, 3, 'should generate one node ID per node');
  for (const nodeId of generatedIds) {
    assert.ok(
      uuidValidate(nodeId),
      'generated node ID must be a UUID: ' + nodeId,
    );
  }

  await cluster.stop();
});

test('Unit: Cluster.start records unified startup gate state transitions',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const mockProvider = {
      createNetwork: async () => ({id: 'net-2', name: 'net-2'}),
      removeNetwork: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {},
    };
    cluster._providers = [mockProvider];
    cluster._hostAssignment = [0, 0];

    const stageEvents = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      stageEvents.push({stage, details});
    };

    const generatedIds = [];
    cluster._startNode = async (nodeId, role, _seedIp, _nodeIndex) => {
      generatedIds.push(nodeId);
      const containerId = 'container-stage-' + generatedIds.length;
      const ip = '10.0.1.' + generatedIds.length;
      return new NodeHandle(nodeId, containerId, ip, role, mockProvider);
    };
    cluster._waitForBootstrapApi = async () => {};
    cluster._waitForAllActive = async () => {};
    cluster._logCollector.startLiveSubscription = async () => {};
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};

    await cluster.start();

    const startupStates = stageEvents
      .filter((event) => event.details && event.details.startupGateState)
      .map((event) => event.details.startupGateState);

    assert.deepStrictEqual(
      startupStates,
      ['seed_live', 'seed_join_ready', 'seed_join_ready', 'cluster_active'],
      'startup gate should move through deterministic readiness states',
    );

    await cluster.stop();
  });

test('Unit: _startNode sets NODE_ADDRESS to routable host:port', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-1',
      ip: '10.0.0.10',
      name: options.name,
    };
  };

  const nodeId = 'test-node-id';
  await cluster._startNode(nodeId, NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.ok(env, 'container env should be set');
  assert.notStrictEqual(
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS],
    nodeId,
    'node address should not be raw nodeId',
  );
  assert.ok(
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS].endsWith(
      ':' + PORTS.REST,
    ),
    'node address should include rest port',
  );
  assert.strictEqual(
    env.TRANSPORT_WS_HOST,
    '0.0.0.0',
    'transport ws host should bind on all interfaces in containers',
  );
  assert.strictEqual(
    env[RAFT_PROVIDER_DEFAULTS.envKey],
    RAFT_PROVIDER_DEFAULTS.provider,
    'raft provider env should default to liferaft',
  );
});

test('Unit: _startNode sets joiner timeout env overrides', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      joiningHttpTimeoutMs: 45000,
      joiningLeadershipWaitTimeoutMs: 180000,
    },
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-joiner-1',
      ip: '10.0.0.11',
      name: options.name,
    };
  };

  await cluster._startNode(
    'joiner-node-id',
    NODE_ROLES.JOINER,
    '10.0.0.2',
    0,
  );

  const env = capturedCreateOptions.env;
  assert.strictEqual(
    env[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS],
    '10.0.0.2:' + PORTS.REST,
    'joiner should receive seed address',
  );
  assert.strictEqual(
    env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
    '45000',
    'joiner should receive overridden HTTP timeout',
  );
  assert.strictEqual(
    env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
    '180000',
    'joiner should receive overridden leadership wait timeout',
  );
});

test('Unit: _startNode sets leak capture NODE_OPTIONS when enabled', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    memoryLeak: {
      enabled: true,
      captureHeapArtifacts: true,
      heapSnapshotNearLimitCount: 4,
    },
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-2',
      ip: '10.0.0.20',
      name: options.name,
    };
  };

  await cluster._startNode('node-with-leak-capture', NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.ok(env.NODE_OPTIONS, 'NODE_OPTIONS should be set');
  assert.ok(
    env.NODE_OPTIONS.includes('--heap-prof'),
    'NODE_OPTIONS should enable heap profiling',
  );
  assert.ok(
    env.NODE_OPTIONS.includes('--heapsnapshot-near-heap-limit=4'),
    'NODE_OPTIONS should use configured near-limit snapshot count',
  );
});

test('Unit: _startNode forwards docker bind mounts as hostConfig extras', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {
      socketPath: '/var/run/docker.sock',
      binds: ['/tmp/project/src:/app/src:ro'],
    },
    image: 'distributed-db:test',
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-bind-test',
      ip: '10.0.0.25',
      name: options.name,
    };
  };

  await cluster._startNode('bind-node', NODE_ROLES.SEED, null, 0);

  assert.deepStrictEqual(
    capturedCreateOptions.hostConfigExtras,
    {Binds: ['/tmp/project/src:/app/src:ro']},
    'bind mounts should be forwarded into host config extras',
  );
});

test('Unit: _startNode reuses existing local container when reuse is enabled', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
      keepRunningContainers: true,
    },
    image: 'distributed-db:test',
  });

  cluster._networkName = 'ddb-test-net-reuse-local-1';
  cluster._networkId = 'net-reuse-1';

  // _buildNodeId now returns a deterministic UUID for reuse mode
  const reuseNodeId = cluster._buildNodeId(0);

  const provider = cluster._providers[0];
  let inspectedContainerName = null;
  let restartContainerId = null;
  let startContainerCalls = 0;
  let createContainerCalls = 0;
  provider.inspectContainerIfExists = async (name) => {
    inspectedContainerName = name;
    return {
      Id: 'existing-container-id',
      State: {Status: 'running'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-1-1:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: ['rm -rf /data/* && exec node --max-old-space-size=1536 /app/src/index.js'],
      },
      NetworkSettings: {
        Networks: {
          [cluster._networkName]: {
            IPAddress: '10.0.0.44',
          },
        },
      },
    };
  };
  provider.restartContainer = async (containerId) => {
    restartContainerId = containerId;
  };
  provider.startContainer = async () => {
    startContainerCalls++;
  };
  provider.inspectContainer = async () => ({
    NetworkSettings: {
      Networks: {
        [cluster._networkName]: {
          IPAddress: '10.0.0.44',
        },
      },
    },
  });
  provider.createContainer = async () => {
    createContainerCalls++;
    throw new Error('createContainer should not be called for reused node');
  };

  const node = await cluster._startNode(
    reuseNodeId,
    NODE_ROLES.SEED,
    null,
    0,
  );

  assert.strictEqual(
    inspectedContainerName,
    'ddb-test-reuse-1-1',
    'reuse mode should use deterministic container naming',
  );
  assert.strictEqual(
    restartContainerId,
    'existing-container-id',
    'running reusable container should be restarted',
  );
  assert.strictEqual(startContainerCalls, 0);
  assert.strictEqual(createContainerCalls, 0);
  assert.strictEqual(node.containerId, 'existing-container-id');
  assert.strictEqual(node.ip, '10.0.0.44');
});

test('Unit: _startNode recreates reusable joiner container on timeout env mismatch',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
      timeouts: {
        joiningHttpTimeoutMs: 45000,
        joiningLeadershipWaitTimeoutMs: 180000,
      },
    });

    cluster._networkName = 'ddb-test-net-reuse-local-2';
    cluster._networkId = 'net-reuse-2';

    const joinerId = cluster._buildNodeId(1);
    const provider = cluster._providers[0];
    let removeContainerId = null;
    let createContainerOptions = null;
    provider.inspectContainerIfExists = async () => ({
      Id: 'existing-joiner-container-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${joinerId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-2-2:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
          `${CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS}=10.0.0.1:8080`,
          `${ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS}=10000`,
          `${ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS}=30000`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: ['rm -rf /data/* && exec node --max-old-space-size=1536 /app/src/index.js'],
      },
    });
    provider.removeContainer = async (containerId) => {
      removeContainerId = containerId;
    };
    provider.createContainer = async (options) => {
      createContainerOptions = options;
      return {
        containerId: 'new-joiner-container-id',
        ip: '10.0.0.52',
        name: options.name,
      };
    };

    const node = await cluster._startNode(
      joinerId,
      NODE_ROLES.JOINER,
      '10.0.0.1',
      1,
    );

    assert.strictEqual(
      removeContainerId,
      'existing-joiner-container-id',
      'mismatched reusable joiner env should force container recreation',
    );
    assert.ok(
      createContainerOptions,
      'recreated reusable joiner should be created with updated env',
    );
    assert.strictEqual(
      createContainerOptions.env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
      '45000',
    );
    assert.strictEqual(
      createContainerOptions.env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
      '180000',
    );
    assert.strictEqual(node.containerId, 'new-joiner-container-id');
    assert.strictEqual(node.ip, '10.0.0.52');
  });

test('Unit: Cluster.start quiesces reusable containers before startup sequence',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
        keepRunningContainers: true,
      },
      image: 'distributed-db:test',
    });

    const provider = {
      ensureNetwork: async () => ({id: 'net-reuse-3', name: 'net-reuse-3'}),
      removeNetwork: async () => {},
    };
    cluster._providers = [provider];
    cluster._hostAssignment = [0, 0];
    cluster._logCollector.startLiveSubscription = async () => {};
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};
    cluster._waitForBootstrapApi = async () => {};
    cluster._waitForAllActive = async () => {};

    const containerStateByName = new Map();
    const containerIpByName = new Map();
    const seedNodeId = cluster._buildNodeId(0);
    const joinerNodeId = cluster._buildNodeId(1);
    const seedContainerName = 'ddb-test-reuse-2-1';
    const joinerContainerName = 'ddb-test-reuse-2-2';
    const seedContainerId = 'reuse-container-seed';
    const joinerContainerId = 'reuse-container-joiner';
    containerStateByName.set(seedContainerName, 'running');
    containerStateByName.set(joinerContainerName, 'running');
    containerIpByName.set(seedContainerName, '10.0.2.1');
    containerIpByName.set(joinerContainerName, '10.0.2.2');
    const stoppedContainers = [];

    provider.inspectContainerIfExists = async (name) => {
      if (!containerStateByName.has(name)) {
        return null;
      }
      const env = [
        `NODE_ID=${name === seedContainerName ? seedNodeId : joinerNodeId}`,
        'DATA_DIR=/data',
        `NODE_ADDRESS=${name}:8080`,
        'TRANSPORT_WS_HOST=0.0.0.0',
        `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
      ];
      if (name === joinerContainerName) {
        env.push(
          `${CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS}=10.0.2.1:8080`,
          `${ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS}=30000`,
          `${ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS}=120000`,
        );
      }
      return {
        Id: name === seedContainerName ?
          seedContainerId :
          joinerContainerId,
        State: {Status: containerStateByName.get(name)},
        Config: {
          Env: env,
          Entrypoint: ['sh', '-lc'],
          Cmd: ['rm -rf /data/* && exec node --max-old-space-size=1536 /app/src/index.js'],
        },
        NetworkSettings: {
          Networks: {
            'ddb-test-net-reuse-local-2': {
              IPAddress: containerIpByName.get(name),
            },
          },
        },
      };
    };
    provider.stopContainer = async (containerId) => {
      stoppedContainers.push(containerId);
      if (containerId === seedContainerId) {
        containerStateByName.set(seedContainerName, 'exited');
      } else if (containerId === joinerContainerId) {
        containerStateByName.set(joinerContainerName, 'exited');
      }
    };
    provider.startContainer = async (containerId) => {
      if (containerId === seedContainerId) {
        containerStateByName.set(seedContainerName, 'running');
      } else if (containerId === joinerContainerId) {
        containerStateByName.set(joinerContainerName, 'running');
      }
    };
    provider.restartContainer = async () => {
      throw new Error('start() should quiesce before startup, not restart');
    };
    provider.inspectContainer = async (containerId) => {
      const name = containerId === seedContainerId ?
        seedContainerName :
        joinerContainerName;
      return {
        NetworkSettings: {
          Networks: {
            [cluster._networkName]: {
              IPAddress: containerIpByName.get(name),
            },
          },
        },
      };
    };
    provider.connectToNetwork = async () => {};
    provider.createContainer = async () => {
      throw new Error('reusable containers should be reused in this test');
    };

    await cluster.start();

    assert.deepStrictEqual(
      stoppedContainers,
      [seedContainerId, joinerContainerId],
      'reusable containers should be quiesced before startup',
    );

    await cluster.stop();
  });

test('Unit: _startNode propagates configured raft provider env', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    raftProvider: 'raft_logic',
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-raft-provider',
      ip: '10.0.0.30',
      name: options.name,
    };
  };

  await cluster._startNode('provider-node', NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.strictEqual(
    env[RAFT_PROVIDER_DEFAULTS.envKey],
    'raft_logic',
    'configured raft provider should be passed to node container',
  );
});

/**
 * Unit: startup failure error reporting with logs (Req 3.4)
 */
test('Unit: _startNode failure produces descriptive error', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {nodeStartup: 50},
  });

  const provider = cluster._providers[0];
  provider.createContainer = async () => {
    throw new Error('image not found');
  };

  // Prevent real Docker log collection
  cluster._collectFailureLogs = async () => {};

  await assert.rejects(
    () => cluster._startNode(
      'test-node-1', NODE_ROLES.SEED, null, 0,
    ),
    (err) => {
      assert.ok(
        err.message.includes('test-node-1'),
        'error should include node ID: ' + err.message,
      );
      assert.ok(
        err.message.includes('failed to start'),
        'error should mention startup failure: ' + err.message,
      );
      assert.ok(
        err.message.includes('image not found'),
        'error should include original cause: ' + err.message,
      );
      assert.ok(
        err.message.includes(NODE_ROLES.SEED),
        'error should include node role: ' + err.message,
      );
      return true;
    },
  );
});

test('Unit: _collectFailureLogs collects from all nodes', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const logsCalled = [];
  const mockProvider = {
    getContainerLogs: async (containerId, _opts) => {
      logsCalled.push(containerId);
      return 'mock log output for ' + containerId;
    },
  };

  cluster._nodes.set('n1', new NodeHandle(
    'n1', 'container-aaa', '10.0.0.1', NODE_ROLES.SEED,
    mockProvider,
  ));
  cluster._nodes.set('n2', new NodeHandle(
    'n2', 'container-bbb', '10.0.0.2', NODE_ROLES.JOINER,
    mockProvider,
  ));

  // _collectFailureLogs writes to stderr; just verify it
  // calls getLogs on each node without throwing
  await cluster._collectFailureLogs();

  assert.strictEqual(
    logsCalled.length,
    2,
    'should collect logs from both nodes',
  );
  assert.ok(
    logsCalled.includes('container-aaa'),
    'should collect logs from first node container',
  );
  assert.ok(
    logsCalled.includes('container-bbb'),
    'should collect logs from second node container',
  );
});

/**
 * Unit: best-effort cleanup via labels (Req 2.6)
 */
test('Unit: createCluster registers process cleanup handlers only once', async () => {
  const firstCluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const countsAfterFirst = {
    exit: process.listenerCount('exit'),
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    uncaughtException: process.listenerCount('uncaughtException'),
  };

  const secondCluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const countsAfterSecond = {
    exit: process.listenerCount('exit'),
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    uncaughtException: process.listenerCount('uncaughtException'),
  };

  assert.deepStrictEqual(
    countsAfterSecond,
    countsAfterFirst,
    'listener counts should remain stable across repeated createCluster calls',
  );
  assert.ok(
    countsAfterFirst.exit >= 1,
    'should have at least one exit listener registered',
  );
  assert.ok(
    countsAfterFirst.SIGINT >= 1,
    'should have at least one SIGINT listener registered',
  );
  assert.ok(
    countsAfterFirst.SIGTERM >= 1,
    'should have at least one SIGTERM listener registered',
  );
  assert.ok(
    countsAfterFirst.uncaughtException >= 1,
    'should have at least one uncaughtException listener registered',
  );
  assert.ok(
    firstCluster._clusterId,
    'cluster should have a clusterId for label identification',
  );
  assert.ok(
    secondCluster._clusterId,
    'second cluster should have a clusterId for label identification',
  );
});

test('Unit: cluster uses label constants for identification', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  assert.ok(
    typeof cluster._clusterId === 'string',
    'clusterId should be a string',
  );
  assert.ok(
    cluster._clusterId.length > 0,
    'clusterId should not be empty',
  );

  assert.ok(
    LABELS.CLUSTER,
    'LABELS.CLUSTER constant should exist for cleanup identification',
  );
});

test('Unit: _buildNodeId returns valid UUIDs in reuse mode', async () => {
  // Bug: _buildNodeId in reuse mode returns 'reuse-node-1' etc. which are
  // not valid UUIDs. The bootstrap API requires UUID node IDs, causing
  // joining nodes to fail with "nodeId must be a valid UUID".
  const cluster = createCluster({
    size: 3,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
    },
    image: 'distributed-db:test',
  });

  assert.ok(
    cluster._isContainerReuseEnabled(),
    'reuse mode should be enabled for this config',
  );

  const nodeId0 = cluster._buildNodeId(0);
  const nodeId1 = cluster._buildNodeId(1);
  const nodeId2 = cluster._buildNodeId(2);

  assert.ok(
    uuidValidate(nodeId0),
    'reuse-mode node ID for index 0 must be a valid UUID, got: ' + nodeId0,
  );
  assert.ok(
    uuidValidate(nodeId1),
    'reuse-mode node ID for index 1 must be a valid UUID, got: ' + nodeId1,
  );
  assert.ok(
    uuidValidate(nodeId2),
    'reuse-mode node ID for index 2 must be a valid UUID, got: ' + nodeId2,
  );

  // IDs must be distinct
  assert.notStrictEqual(nodeId0, nodeId1);
  assert.notStrictEqual(nodeId1, nodeId2);
  assert.notStrictEqual(nodeId0, nodeId2);

  // IDs must be deterministic (same index → same UUID across calls)
  assert.strictEqual(cluster._buildNodeId(0), nodeId0);
  assert.strictEqual(cluster._buildNodeId(1), nodeId1);
  assert.strictEqual(cluster._buildNodeId(2), nodeId2);
});
