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

import {createCluster, Cluster} from '../cluster.js';
import {
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE,
  BENCHMARK_DEGRADATION_STATE,
  BENCHMARK_LOAD_ADMISSION_STATE,
} from '../benchmark-partition-convergence.js';
import {
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  TIMEOUTS,
} from '../constants.js';
import {
  buildControlSnapshotRecord,
  buildPartitionReplicaRow,
} from './assertions-test-helpers.js';

const CONTAINER_ALREADY_STOPPED_ERROR_MESSAGE =
  '(HTTP code 304) container already stopped -  ';


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
    'addNode',
    'randomNonSeed',
    'resolveBenchmarkLoadAdmissionSnapshot',
    'resolveBenchmarkCriticalControlPlaneStabilitySnapshot',
    'resolveBenchmarkReadyLoadNodes',
    'waitForBenchmarkReadyLoadNodes',
    'waitForControlPlaneQuiescence',
    'waitForLoadReadinessStability',
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
    'clearNetworkSlowdown',
    'corruptDisk',
    'fillDisk',
    'releaseDiskPressure',
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

test('Unit: restartNode stages stop, shutdown boundary, start, and admin readiness',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const calls = [];
    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      closeQueryConnection() {
        calls.push(['closeQueryConnection']);
      },
    });
    cluster._chaos = {
      async stopNode(nodeId) {
        calls.push(['stopNode', nodeId]);
      },
      async startNode(nodeId) {
        calls.push(['startNode', nodeId]);
      },
    };
    cluster._waitForRestartShutdownBoundary = async (nodeId) => {
      calls.push(['waitForRestartShutdownBoundary', nodeId]);
    };
    cluster._waitForNodeAdminReadiness = async (nodeId) => {
      calls.push(['waitForNodeAdminReadiness', nodeId]);
    };

    await cluster.restartNode('node-a');

    assert.deepStrictEqual(calls, [
      ['closeQueryConnection'],
      ['stopNode', 'node-a'],
      ['waitForRestartShutdownBoundary', 'node-a'],
      ['startNode', 'node-a'],
      ['closeQueryConnection'],
      ['waitForNodeAdminReadiness', 'node-a'],
    ]);
  });

test('Unit: restartNode tolerates ignorable already-stopped stop errors',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const calls = [];
    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      closeQueryConnection() {
        calls.push(['closeQueryConnection']);
      },
    });
    cluster._chaos = {
      async stopNode(nodeId) {
        calls.push(['stopNode', nodeId]);
        throw new Error(CONTAINER_ALREADY_STOPPED_ERROR_MESSAGE);
      },
      async startNode(nodeId) {
        calls.push(['startNode', nodeId]);
      },
    };
    cluster._waitForRestartShutdownBoundary = async (nodeId) => {
      calls.push(['waitForRestartShutdownBoundary', nodeId]);
    };
    cluster._waitForNodeAdminReadiness = async (nodeId) => {
      calls.push(['waitForNodeAdminReadiness', nodeId]);
    };

    await cluster.restartNode('node-a');

    assert.deepStrictEqual(calls, [
      ['closeQueryConnection'],
      ['stopNode', 'node-a'],
      ['waitForRestartShutdownBoundary', 'node-a'],
      ['startNode', 'node-a'],
      ['closeQueryConnection'],
      ['waitForNodeAdminReadiness', 'node-a'],
    ]);
  });

test('Unit: restart observation records compact restart-boundary playback snapshots',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const playbackEvents = [];
    cluster._recordPlaybackEvent = (type, scope, entityId, details) => {
      playbackEvents.push({type, scope, entityId, details});
    };
    cluster._nodes.set('node-a', {
      id: 'node-a',
      closeQueryConnection() {},
      async getControlPlaneLedgerSnapshot() {
        return {
          capturedAt: '2026-03-24T00:00:00.000Z',
          capturedAtMs: 1,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 7,
              pendingAckNodeIds: ['node-b'],
            },
            startupRecovery: {
              recoveryStage: 'blocked',
              recoveryBlocked: true,
            },
            heartbeatPublication: {
              publicationPath: 'node_state_reporter',
            },
            readinessByNodeId: {
              'node-a': {
                nodeId: 'node-a',
                reasonCodes: ['control_plane_publication_pending'],
                dimensions: {
                  controlPlanePublished: false,
                },
              },
            },
          },
        };
      },
    });
    cluster._chaos = {
      async stopNode() {},
      async startNode() {},
    };
    cluster._waitForRestartShutdownBoundary = async () => {};
    cluster._waitForNodeAdminReadiness = async () => {};

    await cluster._restartNodeWithObservation('node-a');

    const restartEvents = playbackEvents.filter((event) =>
      event.type === PLAYBACK_EVENT_TYPE.NODE_RESTART_BOUNDARY,
    );
    assert.equal(restartEvents.length, 2);
    assert.deepEqual(
      restartEvents.map((event) => event.details.phase),
      ['before_stop', 'after_ready'],
    );
    assert.equal(
      restartEvents[0].details.snapshot.publicationConvergence.publicationEpoch,
      7,
    );
    assert.deepEqual(
      restartEvents[0].details.snapshot.localReadiness.reasonCodes,
      ['control_plane_publication_pending'],
    );
  });

test('Unit: _probeRestartShutdownBoundary requires both container stop and admin loss',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._dockerProvider = {
      async inspectContainer(containerId) {
        assert.equal(containerId, 'container-a');
        return {
          State: {
            Status: 'running',
          },
        };
      },
    };
    cluster._nodes.set('node-a', {
      id: 'node-a',
      containerId: 'container-a',
      async getReachabilityDiagnostics() {
        return {
          reachable: false,
          adminReady: false,
          reachableBy: null,
          lastError: 'connect ECONNREFUSED 127.0.0.1:8081',
        };
      },
    });

    const result = await cluster._probeRestartShutdownBoundary(
      'node-a',
      Date.now() + 1000,
    );

    assert.equal(result.observed, false);
    assert.equal(result.containerState, 'running');
    assert.equal(result.containerRunning, true);
    assert.equal(result.reachable, false);
    assert.equal(result.adminReady, false);
  });

test('Unit: _waitForRestartShutdownBoundary succeeds from local shutdown state without peer snapshots',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let boundaryProbeCalls = 0;
    let peerObservationCalls = 0;
    cluster._probeRestartShutdownBoundary = async () => {
      boundaryProbeCalls += 1;
      if (boundaryProbeCalls < 2) {
        return {
          observed: false,
          containerState: 'running',
          containerRunning: true,
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          error: null,
        };
      }
      return {
        observed: true,
        containerState: 'exited',
        containerRunning: false,
        reachable: false,
        adminReady: false,
        reachableBy: null,
        error: null,
      };
    };
    cluster._probeRestartShutdownObservation = async () => {
      peerObservationCalls += 1;
      return {
        observed: false,
        error: 'peer observation should stay diagnostic-only on success',
      };
    };
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when shutdown boundary succeeds');
    };

    await cluster._waitForRestartShutdownBoundary('node-a');

    assert.ok(
      boundaryProbeCalls >= 2,
      'shutdown boundary should keep polling local shutdown state until the node is down',
    );
    assert.equal(
      peerObservationCalls,
      0,
      'peer control snapshots should not be part of the success path',
    );
  });

test('Unit: _runChaosAction emits typed fault-injected playback event',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const playbackEvents = [];
    cluster._recordPlaybackEvent = (type, scope, entityId, details) => {
      playbackEvents.push({type, scope, entityId, details});
    };

    await cluster._runChaosAction(
      'slowNetwork',
      'node-1',
      {latency: 100, jitter: 10},
      async () => null,
    );

    assert.ok(
      playbackEvents.some((event) =>
        event.type === PLAYBACK_EVENT_TYPE.CHAOS_ACTION_STARTED),
      'chaos action should emit started event',
    );
    assert.ok(
      playbackEvents.some((event) =>
        event.type === PLAYBACK_EVENT_TYPE.CHAOS_ACTION_COMPLETED),
      'chaos action should emit completed event',
    );
    assert.ok(
      playbackEvents.some((event) =>
        event.type === PLAYBACK_EVENT_TYPE.CHAOS_FAULT_INJECTED),
      'fault injection action should emit injected event',
    );
  });

test('Unit: _runChaosAction emits typed fault-recovered playback event',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const playbackEvents = [];
    cluster._recordPlaybackEvent = (type, scope, entityId, details) => {
      playbackEvents.push({type, scope, entityId, details});
    };

    await cluster._runChaosAction(
      'healPartition',
      'network',
      null,
      async () => null,
    );

    assert.ok(
      playbackEvents.some((event) =>
        event.type === PLAYBACK_EVENT_TYPE.CHAOS_FAULT_RECOVERED),
      'recovery action should emit recovered event',
    );
  });

test('Unit: _runChaosAction emits typed fault-failed playback event',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const playbackEvents = [];
    cluster._recordPlaybackEvent = (type, scope, entityId, details) => {
      playbackEvents.push({type, scope, entityId, details});
    };

    await assert.rejects(
      cluster._runChaosAction(
        'fillDisk',
        'node-1',
        {sizeMb: 8},
        async () => {
          throw new Error('injected test failure');
        },
      ),
      /injected test failure/,
    );

    assert.ok(
      playbackEvents.some((event) =>
        event.type === PLAYBACK_EVENT_TYPE.CHAOS_FAULT_FAILED),
      'failed chaos action should emit failed event',
    );
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
  assert.equal(
    started[0].details?.options?.admissionAwareScheduling,
    true,
    'startLoad should default distributed load runs to admission-aware scheduling',
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

test('Unit: startLoad honors an explicit node subset', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const selectedNode = {
    id: 'node-selected',
    closeQueryConnection: () => {},
    async queryWithTimeout() {
      return {rows: []};
    },
  };
  const excludedNode = {
    id: 'node-excluded',
    closeQueryConnection: () => {},
    async queryWithTimeout() {
      return {rows: []};
    },
  };

  cluster._nodes.set(selectedNode.id, selectedNode);
  cluster._nodes.set(excludedNode.id, excludedNode);

  const run = cluster.startLoad({
    nodes: [selectedNode],
    opsPerSec: 5,
    duration: 250,
    maxInFlight: 1,
  });
  const metrics = await run.waitComplete();

  assert.deepEqual(
    Object.keys(metrics.perNode || {}),
    ['node-selected'],
    'load metrics should only track nodes from the explicit subset',
  );
});

test('Unit: startLoad preserves an explicit empty node list until nodeResolver refreshes it', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const selectedNode = {
    id: 'node-selected',
    closeQueryConnection: () => {},
    async queryWithTimeout() {
      return {rows: []};
    },
  };
  const excludedNode = {
    id: 'node-excluded',
    closeQueryConnection: () => {},
    async queryWithTimeout() {
      return {rows: []};
    },
  };

  cluster._nodes.set(selectedNode.id, selectedNode);
  cluster._nodes.set(excludedNode.id, excludedNode);

  const run = cluster.startLoad({
    nodes: [],
    nodeResolver: () => [selectedNode],
    opsPerSec: 5,
    duration: 250,
    maxInFlight: 1,
  });
  const metrics = await run.waitComplete();

  assert.deepEqual(
    Object.keys(metrics.perNode || {}),
    ['node-selected'],
    'an explicit empty node list should not widen to cluster defaults before resolver updates',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes only trusts local replica readiness',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const buildDiscoverySnapshot = (localNodeId, localReady, remoteNodeId) => ({
      rows: [{
        services: [{
          protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
          serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
          replicas: [
            {
              nodeId: localNodeId,
              benchmarkAdmission: {
                state: localReady ? 'ready' : 'blocked',
              },
            },
            {
              nodeId: remoteNodeId,
              benchmarkAdmission: {
                state: 'ready',
              },
            },
          ],
        }],
      }],
    });

    const readyNode = {
      id: 'node-ready',
      closeQueryConnection: () => {},
      async getReachabilityDiagnostics() {
        return {
          nodeId: 'node-ready',
          adminReady: true,
          controlPlaneRecoveryReady: true,
        };
      },
      async queryWithTimeout(sql, _params = [], options = {}) {
        if (options.lane === 'snapshot') {
          assert.match(
            sql,
            /service_discovery_local/,
            'cluster should read benchmark-ready nodes from service discovery',
          );
          return buildDiscoverySnapshot('node-ready', true, 'node-blocked');
        }
        if (options.lane === 'load') {
          return {rows: [{ok: 1}]};
        }
        throw new Error('unexpected lane: ' + String(options.lane || 'default'));
      },
    };
    const blockedNode = {
      id: 'node-blocked',
      closeQueryConnection: () => {},
      async getReachabilityDiagnostics() {
        return {
          nodeId: 'node-blocked',
          adminReady: false,
          controlPlaneRecoveryReady: false,
        };
      },
      async queryWithTimeout(_sql, _params = [], options = {}) {
        if (options.lane === 'snapshot') {
          return buildDiscoverySnapshot('node-blocked', false, 'node-ready');
        }
        if (options.lane === 'load') {
          return {rows: [{ok: 1}]};
        }
        throw new Error('unexpected lane: ' + String(options.lane || 'default'));
      },
    };

    cluster._nodes.set(readyNode.id, readyNode);
    cluster._nodes.set(blockedNode.id, blockedNode);

    const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
      tableName: 'benchmark_events',
    });

    assert.deepStrictEqual(
      loadNodes.map((node) => node.id),
      ['node-ready'],
      'only nodes whose own local discovery marks their replica ready and whose recovery gate is open should be selected',
    );
  });

test('Unit: resolveBenchmarkReadyLoadNodes admits recovery-ready nodes before admin readiness',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const recoveringNode = {
      id: 'node-recovering',
      closeQueryConnection: () => {},
      async getReachabilityDiagnostics() {
        return {
          nodeId: 'node-recovering',
          adminReady: false,
          controlPlaneRecoveryReady: true,
          recoveryStage: 'control_plane_recovery_ready',
          recoveryStageRank: 2,
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
                  nodeId: 'node-recovering',
                  benchmarkAdmission: {
                    state: 'ready',
                  },
                }],
              }],
            }],
          };
        }
        if (options.lane === 'load') {
          return {rows: [{ok: 1}]};
        }
        throw new Error('unexpected lane: ' + String(options.lane || 'default'));
      },
    };

    cluster._nodes.set(recoveringNode.id, recoveringNode);

    const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
      tableName: 'benchmark_events',
    });

    assert.deepStrictEqual(
      loadNodes.map((node) => node.id),
      ['node-recovering'],
      'benchmark-ready admission should accept nodes once the control-plane recovery gate is open',
    );
  });

test('Unit: resolveBenchmarkReadyLoadNodes rejects discovery-ready nodes ' +
  'whose load lane still denies benchmark admission',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const readyDiscoverySnapshot = {
    rows: [{
      services: [{
        protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
        serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
        replicas: [{
          nodeId: 'node-stale-ready',
          benchmarkAdmission: {
            state: 'ready',
          },
        }],
      }],
    }],
  };

  const staleReadyNode = {
    id: 'node-stale-ready',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-stale-ready',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        return readyDiscoverySnapshot;
      }
      if (options.lane === 'load') {
        assert.match(
          sql,
          /select\s+1\s+from\s+benchmark_events\s+limit\s+1/i,
          'benchmark-ready admission should validate effective load-lane admission with a benign table-local probe',
        );
        throw new Error(
          'serve not ready: load lane admission denied on node ' +
          'node-stale-ready (tableName=benchmark_events, ' +
          'benchmarkReady=false, reasons=schema_partition_unavailable)',
        );
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(staleReadyNode.id, staleReadyNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    [],
    'benchmark-ready admission should exclude nodes whose real load lane still rejects the benchmark table',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes admits soft-blocked discovery ' +
  'nodes when the real load lane accepts the benchmark table',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  let loadProbeCount = 0;
  const softBlockedNode = {
    id: 'node-soft-blocked',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-soft-blocked',
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
                nodeId: 'node-soft-blocked',
                benchmarkAdmission: {
                  state: 'blocked',
                  routingReady: true,
                  localReplicaRole: 'follower',
                  degradedByOperationIds: [],
                  reasons: [{
                    code: 'schema_partition_unavailable',
                    detail: 'transient cache lag',
                  }],
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
          'soft-blocked discovery should still validate effective load-lane admission with a benign table-local probe',
        );
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(softBlockedNode.id, softBlockedNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    ['node-soft-blocked'],
    'benchmark-ready admission should not fail closed on soft local discovery blockers when the load lane already admits the table',
  );
  assert.equal(
    loadProbeCount,
    1,
    'soft-blocked discovery should still require one real load-lane admission probe',
  );
});

test('Unit: resolveBenchmarkReadyLoadNodes admits topology-deferred ' +
  'routed nodes without a voter-ready local replica when the load lane ' +
  'accepts the benchmark table',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  let loadProbeCount = 0;
  const topologyDeferredNode = {
    id: 'node-topology-deferred',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-topology-deferred',
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
                nodeId: 'node-topology-deferred',
                benchmarkAdmission: {
                  state: 'blocked',
                  routingReady: true,
                  schemaReady: false,
                  topologyReady: false,
                  degradedByOperationIds: [],
                  reasons: [
                    {code: 'schema_partition_unavailable'},
                    {code: 'leadership_unstable'},
                  ],
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
          'topology-deferred discovery should still validate effective ' +
            'load-lane admission with a benign table-local probe',
        );
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(topologyDeferredNode.id, topologyDeferredNode);

  const loadNodes = await cluster.resolveBenchmarkReadyLoadNodes({
    tableName: 'benchmark_events',
  });

  assert.deepStrictEqual(
    loadNodes.map((node) => node.id),
    ['node-topology-deferred'],
    'topology-deferred discovery should not fail closed when the node is ' +
      'routable and the real load lane already admits the table',
  );
  assert.equal(
    loadProbeCount,
    1,
    'topology-deferred discovery should still require one real load-lane ' +
      'admission probe',
  );
});

test('Unit: resolveBenchmarkCriticalControlPlaneStabilitySnapshot preserves pending pressure signals from the selected control snapshot',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {id: 'node-a'});
    cluster._nodes.set('node-b', {id: 'node-b'});
    cluster._probeControlSnapshotCoverage = async (_deadline, expectedNodeIds, options = {}) => {
      assert.deepStrictEqual(expectedNodeIds, ['node-a', 'node-b']);
      assert.equal(options.readinessMode, 'load');
      return {
        completeCoverage: false,
        bestCoverageNodeCount: 2,
        selectedSnapshotNodeId: 'node-a',
        selectedControlPlaneDiagnosticsAvailable: true,
        selectedPublicationConvergence: {
          publicationStatus: 'OPEN',
          publishedActiveNodeIds: ['node-a'],
          pendingAckNodeIds: ['node-b'],
          recoveryActiveNodeIds: ['node-a', 'node-b'],
          recoveryProtocolState: 'publication_pending',
          priorityRecoveryReasonCodes: [],
        },
        selectedControlPlaneOwnerQueueDepth: {
          pendingWrites: 5,
          pendingWriteGrowthCount: 2,
          retainedBacklogGrowthCount: 1,
          sharedPressureBackpressured: true,
        },
        selectedCdcReplayLag: {
          bufferedEvents: 4,
          replayBufferGrowthCount: 1,
          replayRetryDepth: 2,
        },
        selectedError: null,
      };
    };

    const snapshot = await cluster.resolveBenchmarkCriticalControlPlaneStabilitySnapshot();

    assert.equal(
      snapshot.state,
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.PENDING,
    );
    assert.equal(snapshot.selectedNodeId, 'node-a');
    assert.equal(snapshot.controlPlaneDiagnosticsAvailable, true);
    assert.ok(snapshot.reasonCodes.includes('critical_control_owner_backpressured'));
    assert.ok(snapshot.reasonCodes.includes('critical_control_pending_write_growth'));
    assert.ok(snapshot.reasonCodes.includes('critical_control_retained_backlog_growth'));
    assert.ok(snapshot.reasonCodes.includes('critical_control_replay_buffer_growth'));
    assert.ok(snapshot.reasonCodes.includes('critical_control_replay_retry_depth'));
  });

test('Unit: resolveBenchmarkCriticalControlPlaneStabilitySnapshot preserves probe failures as unavailable outcomes',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {id: 'node-a'});
    cluster._probeControlSnapshotCoverage = async () => {
      throw new Error('snapshot probe failed');
    };

    const snapshot = await cluster.resolveBenchmarkCriticalControlPlaneStabilitySnapshot();

    assert.equal(
      snapshot.state,
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.UNAVAILABLE,
    );
    assert.deepStrictEqual(snapshot.reasonCodes, [
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE,
    ]);
    assert.equal(snapshot.selectedError, 'snapshot probe failed');
  });

test('Unit: resolveBenchmarkLoadAdmissionSnapshot preserves routed-ready ' +
  'versus local-ready admission states',
async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const localReadyNode = {
    id: 'node-local-ready',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-local-ready',
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
                nodeId: 'node-local-ready',
                benchmarkAdmission: {
                  state: 'ready',
                  routingReady: true,
                  schemaReady: true,
                  topologyReady: true,
                  localReplicaRole: 'leader',
                },
              }],
            }],
          }],
        };
      }
      if (options.lane === 'load') {
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };
  const topologyDeferredNode = {
    id: 'node-topology-deferred-snapshot',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-topology-deferred-snapshot',
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
                nodeId: 'node-topology-deferred-snapshot',
                benchmarkAdmission: {
                  state: 'blocked',
                  routingReady: true,
                  topologyReady: false,
                  schemaReady: false,
                  localReplicaRole: 'follower',
                  degradationState: 'promotion_pending',
                  degradedByOperationIds: ['op-promote-1'],
                  reasons: [
                    {
                      code: 'schema_partition_unavailable',
                      detail: 'cache lag',
                    },
                    {
                      code: 'leadership_unstable',
                      detail: 'leader handoff',
                    },
                  ],
                },
              }],
            }],
          }],
        };
      }
      if (options.lane === 'load') {
        return {rows: [{ok: 1}]};
      }
      throw new Error('unexpected lane: ' + String(options.lane || 'default'));
    },
  };

  cluster._nodes.set(localReadyNode.id, localReadyNode);
  cluster._nodes.set(topologyDeferredNode.id, topologyDeferredNode);

  const snapshot = await cluster.resolveBenchmarkLoadAdmissionSnapshot({
    tableName: 'benchmark_events',
  });
  const stateByNodeId = new Map(
    snapshot.evaluations.map((evaluation) => [evaluation.nodeId, evaluation]),
  );

  assert.deepStrictEqual(
    snapshot.admissionReadyNodeIds,
    ['node-local-ready', 'node-topology-deferred-snapshot'],
  );
  assert.deepStrictEqual(
    snapshot.localReadyNodeIds,
    ['node-local-ready'],
  );
  assert.equal(
    stateByNodeId.get('node-local-ready')?.state,
    BENCHMARK_LOAD_ADMISSION_STATE.LOCAL_READY,
  );
  assert.equal(
    stateByNodeId.get('node-local-ready')?.localReplicaRole,
    'leader',
  );
  assert.equal(
    stateByNodeId.get('node-local-ready')?.localReplicaVoterReady,
    true,
  );
  assert.equal(
    stateByNodeId.get('node-topology-deferred-snapshot')?.state,
    BENCHMARK_LOAD_ADMISSION_STATE.ROUTED_READY,
  );
  assert.equal(
    stateByNodeId.get('node-topology-deferred-snapshot')?.localReplicaRole,
    'follower',
  );
  assert.equal(
    stateByNodeId.get('node-topology-deferred-snapshot')?.localReplicaVoterReady,
    true,
  );
  assert.equal(
    stateByNodeId.get('node-topology-deferred-snapshot')?.leadershipStable,
    false,
  );
  assert.equal(
    stateByNodeId.get('node-topology-deferred-snapshot')?.degradationState,
    'promotion_pending',
  );
  assert.deepStrictEqual(
    stateByNodeId.get('node-topology-deferred-snapshot')?.degradedByOperationIds,
    ['op-promote-1'],
  );
  assert.deepStrictEqual(
    stateByNodeId.get('node-topology-deferred-snapshot')?.discoveryReasonDetails,
    [
      {code: 'schema_partition_unavailable', detail: 'cache lag'},
      {code: 'leadership_unstable', detail: 'leader handoff'},
    ],
  );
  assert.deepStrictEqual(
    stateByNodeId.get('node-topology-deferred-snapshot')?.reasonCodes,
    ['schema_partition_unavailable', 'leadership_unstable'],
    'topology-deferred nodes should preserve the local blocker reasons even when the routed load lane already admits them',
  );
  assert.deepStrictEqual(
    snapshot.degradationStateHistogram,
    {
      [BENCHMARK_DEGRADATION_STATE.HEALTHY]: 1,
      promotion_pending: 1,
    },
  );
});

test('Unit: resolveBenchmarkLoadAdmissionSnapshot preserves ' +
  'retryable discovery failures as pressured evaluations',
async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const pressuredNode = {
    id: 'node-discovery-pressured',
    closeQueryConnection: () => {},
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-discovery-pressured',
        adminReady: true,
        controlPlaneRecoveryReady: true,
      };
    },
    async queryWithTimeout(_sql, _params = [], options = {}) {
      if (options.lane === 'snapshot') {
        const error = new Error('Message timeout');
        error.retryAfterMs = 320;
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
    (entry) => entry.nodeId === 'node-discovery-pressured',
  );

  assert.equal(evaluation?.state, 'discovery_pressured');
  assert.equal(evaluation?.discoveryPressured, true);
  assert.equal(evaluation?.retryAfterMs, 320);
  assert.deepStrictEqual(evaluation?.reasonCodes, [
    'discovery_pressured',
    'load_lane_denied',
  ]);
  assert.deepStrictEqual(snapshot.readinessReasonHistogram, {
    discovery_pressured: 1,
    load_lane_denied: 1,
  });
});

test(
  'Unit: load-mode active convergence prefers the live publication gate ' +
    'over stale publication summary',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const createNode = (nodeId) => ({
      id: nodeId,
      role: nodeId === 'node-a' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness() {
        return {
          status: 200,
          phase: 'TRAFFIC_READY',
          state: 'traffic_ready',
          reasons: [],
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a', 'node-b'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 12,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: false,
                  missingPartitionIds: ['replica_operations-p1'],
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                    spreadGap: 1,
                  }],
                },
                recoveryProtocolState: 'priority_spread_pending',
                priorityRecoveryReasonCodes: [
                  'priority_partitions_not_spread',
                ],
              },
              publicationConvergenceGate: {
                state: 'ready',
                ready: true,
                active: false,
                publicationEpoch: 12,
                publicationStatus: 'PUBLISHED',
                reasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 2,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: false,
                publicationPending: false,
                ackPending: false,
              },
            },
          }],
        };
      },
      async getLogs() {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode('node-a'));
    cluster._nodes.set('node-b', createNode('node-b'));

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + 1000,
      {mode: 'load'},
    );

    assert.strictEqual(
      probeResult.publicationConvergenceGate.ready,
      true,
      'load-mode convergence should follow the live readiness-owned gate',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'stale publication summary should not keep load readiness blocked once the live gate is ready',
    );
  },
);

function buildStuckConvergenceNode(id) {
  const rows = [
    buildPartitionReplicaRow('p1', 'a', 'leader'),
    buildPartitionReplicaRow('p1', 'b', 'follower'),
    buildPartitionReplicaRow('p1', 'c', 'follower'),
  ];
  return {
    id,
    isReachable: async () => true,
    getControlSnapshot: async () => ({
      rows: [buildControlSnapshotRecord({
        nodeId: id,
        partitionIds: ['p1'],
        servicesRows: rows,
        operationRows: [{operation_id: 'op-1', status: 'creating'}],
      })],
    }),
  };
}

test('Unit: cluster.waitForConvergence defaults to a fail-fast no-progress window',
  async () => {
    assert.strictEqual(TIMEOUTS.CONVERGENCE_NO_PROGRESS, 30000);
  });

test('Unit: cluster.waitForConvergence aborts early on a stalled cluster',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    cluster._nodes.set('node-a', buildStuckConvergenceNode('node-a'));

    const settleTimeoutMs = 5000;
    const startedAt = Date.now();
    try {
      await cluster.waitForConvergence({
        settleTimeoutMs,
        quietWindowMs: 0,
        maxSustainedOverTargetMs: 100,
        sampleIntervalMs: 10,
        targetVoterCount: 3,
        noProgressTimeoutMs: 40,
        noProgressGraceMs: 0,
      });
      assert.fail('Expected a stalled no-progress abort');
    } catch (err) {
      assert.ok(
        Date.now() - startedAt < settleTimeoutMs,
        'should abort well before the settle budget elapses',
      );
      assert.ok(err.diagnostics, 'should include diagnostics');
      assert.strictEqual(err.diagnostics.reason, 'stalled');
      assert.match(err.message, /Convergence stalled/);
    }
  });
