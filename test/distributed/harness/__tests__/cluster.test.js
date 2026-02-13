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
import fc from 'fast-check';
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
import {LABELS, NODE_ROLES} from '../constants.js';

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
test('Unit: createCluster registers process exit handlers', async () => {
  const originalListenerCounts = {
    exit: process.listenerCount('exit'),
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    uncaughtException: process.listenerCount('uncaughtException'),
  };

  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  assert.ok(
    process.listenerCount('exit') >
      originalListenerCounts.exit,
    'should register an exit handler',
  );
  assert.ok(
    process.listenerCount('SIGINT') >
      originalListenerCounts.SIGINT,
    'should register a SIGINT handler',
  );
  assert.ok(
    process.listenerCount('SIGTERM') >
      originalListenerCounts.SIGTERM,
    'should register a SIGTERM handler',
  );
  assert.ok(
    process.listenerCount('uncaughtException') >
      originalListenerCounts.uncaughtException,
    'should register an uncaughtException handler',
  );

  assert.ok(
    cluster._clusterId,
    'cluster should have a clusterId for label identification',
  );

  // Clean up listeners to avoid test pollution
  process.removeAllListeners('exit');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('uncaughtException');
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
