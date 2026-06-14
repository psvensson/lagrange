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
import {
  createCluster,
  LOAD_STOP_DISPATCH_SETTLE_MS,
  LOAD_STOP_WAIT_TIMEOUT_MS,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const RESTART_RECOVERY_DIAGNOSTIC_TEST_NODE_ID = 'node-recovery-blocked';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_REACHABLE_BY = 'bootstrap_health';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_READINESS_PHASE = 'CONTROL_READY';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_READINESS_STAGE =
  'publication_epoch_pending';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_READINESS_STAGE_RANK = 1;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_REASON_LEADER =
  'LEADER_METADATA_INCOMPLETE';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_REASON_PRIORITY =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_LAST_ERROR = 'admin still closed';
const RESTART_RECOVERY_DIAGNOSTIC_TEST_TIMEOUT_MS = 1;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_BLOCKER =
  'control_snapshot_authority_unavailable';
const STRICT_RESTART_READINESS_TEST_NODE_ID = 'node-strict-admin';
const STRICT_RESTART_READINESS_TEST_TIMEOUT_MS = 50;
const STRICT_RESTART_READINESS_READY_ATTEMPT = 3;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_PHASE_PATTERN =
  /readinessPhase=CONTROL_READY/;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_STAGE_PATTERN =
  /readinessStage=publication_epoch_pending/;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_REASONS_PATTERN =
  /readinessReasons=LEADER_METADATA_INCOMPLETE\|PRIORITY_CONTROL_PLANE_RECOVERY_PENDING/;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_PATTERN =
  /bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable/;

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

test('Unit: _waitForNodeAdminReadiness can require admin readiness',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: STRICT_RESTART_READINESS_TEST_TIMEOUT_MS,
      },
    });

    let attempts = 0;
    cluster._nodes.set(STRICT_RESTART_READINESS_TEST_NODE_ID, {
      id: STRICT_RESTART_READINESS_TEST_NODE_ID,
      async getReachabilityDiagnostics() {
        attempts += 1;
        return {
          nodeId: STRICT_RESTART_READINESS_TEST_NODE_ID,
          reachable: true,
          reachableBy: 'bootstrap_health',
          adminReady: attempts >= STRICT_RESTART_READINESS_READY_ATTEMPT,
          controlPlaneRecoveryReady: true,
          recoveryStage: 'control_plane_recovery_ready',
          recoveryStageRank: 2,
          lastError:
            attempts >= STRICT_RESTART_READINESS_READY_ATTEMPT ?
              null :
              'admin still warming',
        };
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    await cluster._waitForNodeAdminReadiness(
      STRICT_RESTART_READINESS_TEST_NODE_ID,
      {
        requireAdminReady: true,
      },
    );

    assert.ok(
      attempts >= STRICT_RESTART_READINESS_READY_ATTEMPT,
      'strict restart readiness should keep polling until admin is ready',
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

test(
  'Unit: _waitForNodeAdminReadiness timeout reports bootstrap readiness ' +
    'owner blocker',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: RESTART_RECOVERY_DIAGNOSTIC_TEST_TIMEOUT_MS,
      },
    });

    cluster._nodes.set(RESTART_RECOVERY_DIAGNOSTIC_TEST_NODE_ID, {
      id: RESTART_RECOVERY_DIAGNOSTIC_TEST_NODE_ID,
      async getReachabilityDiagnostics() {
        return {
          nodeId: RESTART_RECOVERY_DIAGNOSTIC_TEST_NODE_ID,
          reachable: true,
          reachableBy: RESTART_RECOVERY_DIAGNOSTIC_TEST_REACHABLE_BY,
          adminReady: false,
          controlPlaneRecoveryReady: false,
          readinessStage: RESTART_RECOVERY_DIAGNOSTIC_TEST_READINESS_STAGE,
          readinessStageRank:
            RESTART_RECOVERY_DIAGNOSTIC_TEST_READINESS_STAGE_RANK,
          bootstrapReadiness: {
            phase: RESTART_RECOVERY_DIAGNOSTIC_TEST_READINESS_PHASE,
            reasons: [
              RESTART_RECOVERY_DIAGNOSTIC_TEST_REASON_LEADER,
              RESTART_RECOVERY_DIAGNOSTIC_TEST_REASON_PRIORITY,
            ],
            bootstrapJoinProjection: {
              canProjectReady: false,
              blockerReason:
                RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_BLOCKER,
            },
          },
          lastError: RESTART_RECOVERY_DIAGNOSTIC_TEST_LAST_ERROR,
        };
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};

    await assert.rejects(
      () => cluster._waitForNodeAdminReadiness(
        RESTART_RECOVERY_DIAGNOSTIC_TEST_NODE_ID,
        {
          readinessTimeoutMs: RESTART_RECOVERY_DIAGNOSTIC_TEST_TIMEOUT_MS,
        },
      ),
      (error) => {
        assert.match(
          error.message,
          RESTART_RECOVERY_DIAGNOSTIC_TEST_PHASE_PATTERN,
        );
        assert.match(
          error.message,
          RESTART_RECOVERY_DIAGNOSTIC_TEST_STAGE_PATTERN,
        );
        assert.match(
          error.message,
          RESTART_RECOVERY_DIAGNOSTIC_TEST_REASONS_PATTERN,
        );
        assert.match(
          error.message,
          RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_PATTERN,
        );
        return true;
      },
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

await import('./cluster-node-reachability-test-cases.js');
