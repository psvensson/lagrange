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
} from '../constants.js';

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
