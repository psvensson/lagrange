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
import {
  ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS,
  ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE,
  BENCHMARK_DEGRADATION_STATE,
  BENCHMARK_LOAD_ADMISSION_STATE,
  buildCriticalSystemDiscoverySnapshot,
  Cluster,
  CONTAINER_ALREADY_STOPPED_ERROR_MESSAGE,
  CONTAINER_ENV_KEYS,
  createCluster,
  distributeNodes,
  ENTRYPOINT_ENV,
  LABELS,
  LOAD_STOP_DISPATCH_SETTLE_MS,
  LOAD_STOP_WAIT_TIMEOUT_MS,
  NodeHandle,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
  PORTS,
  RAFT_PROVIDER_DEFAULTS,
} from './cluster-test-helpers.js';

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
test('Unit: resolveBenchmarkLoadAdmissionSnapshot preserves load-lane retry ' +
  'hints on pressured routed-ready nodes',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const pressuredNode = {
    id: 'node-pressured',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-pressured',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(_sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        return {
          rows: [{
            services: [{
              protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
              serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
              replicas: [{
                nodeId: 'node-pressured',
                benchmarkAdmission: {
                  state: 'blocked',
                  routingReady: true,
                  schemaReady: false,
                  topologyReady: false,
                  reasons: [{
                    code: 'schema_partition_unavailable',
                    detail: 'lag',
                  }],
                },
              }],
            }],
          }],
        };
      }
      if (options.lane === 'load') {
        const error = new Error(
          'load lane denied (reasons=load_lane_denied)',
        );
        error.retryAfterMs = 275;
        throw error;
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(pressuredNode.id, pressuredNode);

  const snapshot = await cluster.resolveBenchmarkLoadAdmissionSnapshot({
    tableName: 'benchmark_events',
  });
  const evaluation = snapshot.evaluations.find(
    (entry) => entry.nodeId === 'node-pressured',
  );

  assert.equal(evaluation?.admissionReady, false);
  assert.equal(evaluation?.retryAfterMs, 275);
  assert.deepStrictEqual(evaluation?.loadLaneReasonCodes, [
    'load_lane_denied',
  ]);
  assert.deepStrictEqual(evaluation?.reasonCodes, [
    'schema_partition_unavailable',
    'load_lane_denied',
  ]);
});

test('Unit: resolveBenchmarkReadyLoadNodes admits routed-only nodes when ' +
  'strict discovery is disabled and the load lane accepts the table',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    benchmark: {
      strictDiscovery: false,
    },
  });

  let loadProbeCount = 0;
  const routedOnlyNode = {
    id: 'node-routed-only',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-routed-only',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        return {
          rows: [{
            services: [{
              protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
              serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
              replicas: [{
                nodeId: 'node-seed',
                benchmarkAdmission: {
                  state: 'ready',
                },
              }],
            }],
          }],
        };
      }
      if (options.lane === 'load') {
        loadProbeCount += 1;
        assert.match(
          sql,
          /select\s+1\s+from\s+benchmark_events\s+limit\s+1/i,
          'routed-only fallback should validate effective load-lane ' +
            'admission with a benign table-local probe',
        );
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(routedOnlyNode.id, routedOnlyNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    ['node-routed-only'],
    'strictDiscovery=false should admit nodes that can already route the ' +
      'benchmark table even before local discovery publishes a replica row',
  );
  assert.equal(
    loadProbeCount,
    1,
    'routed-only fallback should still require one real load-lane ' +
      'admission probe',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes keeps routed-only nodes excluded ' +
  'when strict discovery remains enabled',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    benchmark: {
      strictDiscovery: true,
    },
  });

  let loadProbeCount = 0;
  const routedOnlyNode = {
    id: 'node-routed-only-strict',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-routed-only-strict',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(_sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        return {
          rows: [{
            services: [{
              protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
              serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
              replicas: [{
                nodeId: 'node-seed',
                benchmarkAdmission: {
                  state: 'ready',
                },
              }],
            }],
          }],
        };
      }
      if (options.lane === 'load') {
        loadProbeCount += 1;
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(routedOnlyNode.id, routedOnlyNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    [],
    'strict discovery should still require local discovery evidence before ' +
      'admitting a benchmark load node',
  );
  assert.equal(
    loadProbeCount,
    0,
    'strict discovery should not probe the load lane when local discovery ' +
      'still lacks the node',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes falls back to the load lane when ' +
  'local discovery is under retryable control-plane pressure',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  let loadProbeCount = 0;
  const pressuredNode = {
    id: 'node-pressured-discovery',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-pressured-discovery',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        const error = new Error('control_plane_pressure_degraded');
        error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
        throw error;
      }
      if (options.lane === 'load') {
        loadProbeCount += 1;
        assert.match(
          sql,
          /select\s+1\s+from\s+benchmark_events\s+limit\s+1/i,
          'retryable discovery pressure should still validate effective ' +
            'load-lane admission with a benign table-local probe',
        );
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(pressuredNode.id, pressuredNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    ['node-pressured-discovery'],
    'retryable discovery pressure should not hard-exclude a node whose real ' +
      'load lane already admits the benchmark table',
  );
  assert.equal(
    loadProbeCount,
    1,
    'retryable discovery fallback should require one real load-lane probe',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes still excludes retryable ' +
  'discovery-pressure nodes when the real load lane denies the table',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const pressuredNode = {
    id: 'node-pressured-denied',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-pressured-denied',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        const error = new Error('Query timeout after 3000ms');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      if (options.lane === 'load') {
        assert.match(
          sql,
          /select\s+1\s+from\s+benchmark_events\s+limit\s+1/i,
          'retryable discovery fallback should only admit nodes when the ' +
            'real load lane accepts the benchmark table',
        );
        throw new Error(
          'serve not ready: load lane admission denied on node ' +
          'node-pressured-denied (tableName=benchmark_events, ' +
          'benchmarkReady=false, reasons=schema_partition_unavailable)',
        );
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(pressuredNode.id, pressuredNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    [],
    'retryable discovery fallback must still respect the real load-lane ' +
      'admission result',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes only admits nodes on the required published control-plane epoch',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const buildDiscoverySnapshot = (localNodeId) => ({
      rows: [{
        services: [{
          protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
          serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
          replicas: [{
            nodeId: localNodeId,
            benchmarkAdmission: {
              state: 'ready',
            },
          }],
        }],
      }],
    });

    const epoch14Node = {
      id: 'node-epoch-14',
      closeQueryConnection: () => {},
      async getReachabilityDiagnostics() {
        return {
          nodeId: 'node-epoch-14',
          adminReady: true,
          controlPlaneRecoveryReady: true,
          publishedControlPlaneEpoch: 14,
        };
      },
      async queryWithTimeout(_sql, _params = [], options = {}) {
        if (options.lane === 'snapshot') {
          return buildDiscoverySnapshot('node-epoch-14');
        }
        if (options.lane === 'load') {
          return {rows: [{ok: 1}]};
        }
        throw new Error('unexpected lane: ' + String(options.lane || 'default'));
      },
    };
    const epoch13Node = {
      id: 'node-epoch-13',
      closeQueryConnection: () => {},
      async getReachabilityDiagnostics() {
        return {
          nodeId: 'node-epoch-13',
          adminReady: true,
          controlPlaneRecoveryReady: true,
          publishedControlPlaneEpoch: 13,
        };
      },
      async queryWithTimeout(_sql, _params = [], options = {}) {
        if (options.lane === 'snapshot') {
          return buildDiscoverySnapshot('node-epoch-13');
        }
        if (options.lane === 'load') {
          return {rows: [{ok: 1}]};
        }
        throw new Error('unexpected lane: ' + String(options.lane || 'default'));
      },
    };

    cluster._nodes.set(epoch14Node.id, epoch14Node);
    cluster._nodes.set(epoch13Node.id, epoch13Node);

    const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
      tableName: 'benchmark_events',
      requiredPublicationEpoch: 14,
    });

    assert.deepStrictEqual(
      loadNodes.map((node) => node.id),
      ['node-epoch-14'],
      'benchmark-ready admission should reject nodes that are locally ready but still report an older published control-plane epoch',
    );
  });

test('Unit: _waitForNodeAdminReadiness accepts bootstrap recovery readiness before admin health',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 50,
      },
    });

    let attempts = 0;
    cluster._nodes.set('node-a', {
      id: 'node-a',
      async getReachabilityDiagnostics() {
        attempts += 1;
        return {
          nodeId: 'node-a',
          reachable: true,
          reachableBy: 'bootstrap_health',
          adminReady: false,
          controlPlaneRecoveryReady: attempts >= 2,
          recoveryStage: attempts >= 2 ?
            'control_plane_recovery_ready' :
            'blocked',
          recoveryStageRank: attempts >= 2 ? 2 : 1,
          lastError: attempts >= 2 ? null : 'admin still warming',
        };
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForNodeAdminReadiness('node-a');

    assert.ok(
      attempts >= 2,
      'restart readiness gate should poll until the coordinator-derived recovery stage is ready',
    );
  });

test('Unit: _waitForNodeAdminReadiness waits until the expected published control-plane epoch is visible',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 50,
      },
    });

    let attempts = 0;
    cluster._nodes.set('node-epoch-gated', {
      id: 'node-epoch-gated',
      async getReachabilityDiagnostics() {
        attempts += 1;
        return {
          nodeId: 'node-epoch-gated',
          reachable: true,
          reachableBy: 'bootstrap_health',
          adminReady: true,
          controlPlaneRecoveryReady: true,
          publishedControlPlaneEpoch: attempts >= 3 ? 14 : 13,
          lastError: null,
        };
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForNodeAdminReadiness('node-epoch-gated', {
      expectedPublicationEpoch: 14,
    });

    assert.ok(
      attempts >= 3,
      'restart readiness should keep polling until the node reports the expected published control-plane epoch',
    );
  });

test('Unit: waitForBenchmarkReadyLoadNodes waits for a stable ready quorum',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const readyNodes = [
      {id: 'node-1'},
      {id: 'node-2'},
      {id: 'node-3'},
    ];
    let attempts = 0;

    cluster.resolveBenchmarkReadyLoadNodes = async () => {
      attempts += 1;
      return attempts < 3 ? readyNodes.slice(0, 1) : readyNodes;
    };

    const selectedNodes = await cluster.waitForBenchmarkReadyLoadNodes({
      tableName: 'benchmark_events',
      minNodeCount: 3,
      stableWindowMs: 1,
      timeoutMs: 100,
      pollIntervalMs: 1,
    });

    assert.deepEqual(
      selectedNodes.map((node) => node.id),
      readyNodes.map((node) => node.id),
      'benchmark-ready gate should return the stable ready quorum',
    );
    assert.ok(
      attempts >= 3,
      'benchmark-ready gate should keep polling until quorum is stable',
    );
  });

test('Unit: waitForBenchmarkReadyLoadNodes allows stable quorum completion after timeout boundary',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const readyNodes = [
      {id: 'node-1'},
      {id: 'node-2'},
    ];
    let attempts = 0;

    cluster.resolveBenchmarkReadyLoadNodes = async () => {
      attempts += 1;
      return attempts === 1 ? readyNodes.slice(0, 1) : readyNodes;
    };

    const originalDateNow = Date.now;
    let fakeNowMs = 0;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {
      fakeNowMs += 5;
    };

    try {
      const selectedNodes = await cluster.waitForBenchmarkReadyLoadNodes({
        tableName: 'benchmark_events',
        minNodeCount: 2,
        stableWindowMs: 10,
        timeoutMs: 10,
        pollIntervalMs: 5,
      });

      assert.deepEqual(
        selectedNodes.map((node) => node.id),
        readyNodes.map((node) => node.id),
        'benchmark-ready gate should allow an in-progress stable quorum window to complete past the initial timeout boundary',
      );
    } finally {
      Date.now = originalDateNow;
    }

    assert.ok(
      attempts >= 4,
      'benchmark-ready gate should continue polling long enough to satisfy the stable quorum window after readiness first appears',
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

test('Unit: Cluster.stop terminates reusable containers after each run',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
        keepRunningContainers: true,
      },
      image: 'distributed-db:test',
    });

    const stopCalls = [];
    const removeCalls = [];
    const mockProvider = {
      stopContainer: async (containerId) => {
        stopCalls.push(containerId);
      },
      killContainer: async () => {},
      removeContainer: async (containerId) => {
        removeCalls.push(containerId);
      },
    };
    const node = {
      id: 'n1',
      role: NODE_ROLES.SEED,
      containerId: 'container-reuse-1',
      _dockerProvider: mockProvider,
      closeQueryConnection: () => {},
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

    await cluster.stop();

    assert.deepStrictEqual(
      stopCalls,
      ['container-reuse-1'],
      'reusable containers should be stopped so node processes are not left running',
    );
    assert.deepStrictEqual(
      removeCalls,
      [],
      'reusable containers should not be removed during teardown',
    );
  });

test('Unit: Cluster.stop force-kills containers when graceful stop fails',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const callOrder = [];
    const mockProvider = {
      stopContainer: async () => {
        callOrder.push('stop');
        throw new Error('simulated stop failure');
      },
      killContainer: async () => {
        callOrder.push('kill');
      },
      removeContainer: async () => {
        callOrder.push('remove');
      },
    };
    const node = {
      id: 'n1',
      role: NODE_ROLES.SEED,
      containerId: 'container-force-kill-1',
      _dockerProvider: mockProvider,
      closeQueryConnection: () => {},
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

    await cluster.stop();

    assert.deepStrictEqual(
      callOrder,
      ['stop', 'kill', 'remove'],
      'teardown should force-kill after stop failure before removing',
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
      if (String(url).includes(':8080/bootstrap/ready')) {
        process.nextTick(() => {
          callback({
            statusCode: 503,
            resume: () => {},
          });
        });
      }
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
    const originalQueryWithTimeout = node.queryWithTimeout;
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
    node.queryWithTimeout = async (sql) => {
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
      assert.strictEqual(calledUrls.length, 3,
        'should attempt bootstrap health, bootstrap readiness, and admin HTTP probes');
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  });

test(
  'Unit: NodeHandle.getReachabilityDiagnostics checks admin readiness even when ' +
    'bootstrap health is reachable',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    const calledUrls = [];
    let sqlProbeCount = 0;
    http.get = (url, _options, callback) => {
      calledUrls.push(String(url));
      const req = {
        on: () => req,
        destroy: () => {},
      };
      process.nextTick(() => {
        callback({
          statusCode: String(url).includes(':8080/health') ? 200 : 503,
          resume: () => {},
        });
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async (sql) => {
      if (sql === 'SELECT node_id FROM nodes LIMIT 1') {
        sqlProbeCount += 1;
      }
      return {rows: [{ok: 1}]};
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics();
      assert.strictEqual(
        diagnostics.bootstrapHealth.ok,
        true,
        'bootstrap health probe should report reachable',
      );
      assert.strictEqual(
        diagnostics.adminHealth.ok,
        false,
        'admin health probe should still execute after bootstrap health success',
      );
      assert.strictEqual(
        diagnostics.sqlProbe.ok,
        true,
        'sql readiness probe should execute as admin fallback',
      );
      assert.strictEqual(
        diagnostics.adminReady,
        true,
        'admin readiness should be true when sql fallback succeeds',
      );
      assert.strictEqual(
        diagnostics.reachableBy,
        'sql_probe',
        'reachability source should reflect admin-readiness probe path',
      );
      assert.strictEqual(
        sqlProbeCount,
        1,
        'sql readiness fallback should run exactly once',
      );
      assert.strictEqual(
        calledUrls.length,
        3,
        'diagnostics should execute bootstrap health, bootstrap readiness, and admin HTTP probes',
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test(
  'Unit: NodeHandle.getReachabilityDiagnostics preserves published control-plane ' +
    'epoch from bootstrap readiness',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    let requestCount = 0;
    http.get = (url, _options, callback) => {
      requestCount += 1;
      const req = {
        on: () => req,
        destroy: () => {},
      };
      const isBootstrapReadiness =
        String(url).includes(':8080/bootstrap/ready');
      const response = {
        statusCode: isBootstrapReadiness ? 503 : 200,
        setEncoding: () => {},
        resume: () => {},
        on(event, handler) {
          if (event === 'data' && isBootstrapReadiness) {
            process.nextTick(() => {
              handler(JSON.stringify({
                phase: 'INIT',
                state: 'complete',
                reasons: ['LEADER_METADATA_INCOMPLETE'],
                controlPlaneRecoveryReady: true,
                readinessStage: 'acked',
                readinessStageRank: 3,
                recoveryStage: 'control_plane_recovery_ready',
                recoveryStageRank: 2,
                publishedControlPlaneEpoch: 14,
              }));
            });
          }
          if (event === 'end') {
            process.nextTick(() => {
              handler();
            });
          }
          return response;
        },
      };
      process.nextTick(() => {
        callback(response);
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async () => {
      throw new Error('sql probe failed');
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics();
      assert.strictEqual(requestCount >= 3, true);
      assert.strictEqual(diagnostics.publishedControlPlaneEpoch, 14);
      assert.strictEqual(diagnostics.controlPlaneRecoveryReady, true);
      assert.strictEqual(diagnostics.readinessStage, 'acked');
      assert.strictEqual(diagnostics.readinessStageRank, 3);
      assert.strictEqual(
        diagnostics.bootstrapReadiness?.publishedControlPlaneEpoch,
        14,
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test(
  'Unit: NodeHandle.getReachabilityDiagnostics applies a shared timeout budget across probes',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    const observedTimeouts = [];
    let requestCount = 0;
    http.get = (_url, options, callback) => {
      requestCount += 1;
      observedTimeouts.push(Number(options?.timeout));
      const req = {
        on: () => req,
        destroy: () => {},
      };
      if (requestCount === 1) {
        setTimeout(() => {
          callback({
            statusCode: 503,
            resume: () => {},
          });
        }, 30);
      } else {
        process.nextTick(() => {
          callback({
            statusCode: 503,
            resume: () => {},
          });
        });
      }
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async () => {
      throw new Error('sql probe failed');
    };

    try {
      await node.getReachabilityDiagnostics({timeoutMs: 40});
      assert.strictEqual(
        observedTimeouts.length >= 3,
        true,
        'should issue bootstrap health, bootstrap readiness, and admin HTTP probes',
      );
      assert.strictEqual(
        observedTimeouts[1] < observedTimeouts[0],
        true,
        'admin probe should receive remaining timeout budget',
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

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
    const originalQueryWithTimeout = node.queryWithTimeout;
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
    node.queryWithTimeout = async () => {
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
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  });
