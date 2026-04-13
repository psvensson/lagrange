/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */
// @ts-nocheck


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
  PLAYBACK_EVENT_TYPE,
  RAFT_PROVIDER_DEFAULTS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
} from '../constants.js';
import {ENTRYPOINT_ENV} from '../../../../src/constants/entrypoint.js';

const LOAD_STOP_DISPATCH_SETTLE_MS = 25;
const LOAD_STOP_WAIT_TIMEOUT_MS = 250;
const ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS = 150;
const ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS = 80;

function buildCriticalSystemDiscoverySnapshot(nodeIds, capturedAt = 1) {
  return {
    rows: [{
      capturedAt,
      services: [{
        replicas: nodeIds.map((nodeId, index) => ({
          nodeId,
          serviceId: `svc-${nodeId}-${index + 1}`,
          readiness: {
            routingReady: true,
          },
        })),
      }],
    }],
  };
}

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

test('Unit: _waitForBootstrapApi times out after bootstrap progress stalls',
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
          phase: 'CONTROL_READY',
          phaseRank: 1,
          reasons: ['SQL_ENGINE_UNAVAILABLE'],
        },
      },
      {
        status: -1,
        body: null,
      },
      {
        status: -1,
        body: null,
      },
      {
        status: -1,
        body: null,
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
      collected = true;
    };
    let collected = false;

    await assert.rejects(
      async () => {
        try {
          await cluster._waitForBootstrapApi({
            id: '00000000-0000-4000-8000-000000000001',
            ip: '127.0.0.1',
          });
        } finally {
          Date.now = originalDateNow;
        }
      },
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /timeoutReason=no_progress/);
        assert.match(error.message, /bestPhase=CONTROL_READY/);
        assert.match(error.message, /lastProgressElapsedMs=/);
        return true;
      },
    );

    assert.ok(
      bootstrapCallCount >= 3,
      'should continue probing until the no-progress budget is exhausted',
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

test('Unit: _probeClusterActiveState probes node status in parallel',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let releaseProbes;
    const probeRelease = new Promise((resolve) => {
      releaseProbes = resolve;
    });
    const startedNodeIds = [];

    const createBlockingNode = (nodeId) => ({
      id: nodeId,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        startedNodeIds.push(nodeId);
        await probeRelease;
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a', 'node-b'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 7,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: true,
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createBlockingNode('node-a'));
    cluster._nodes.set('node-b', createBlockingNode('node-b'));

    const probePromise = cluster._probeClusterActiveState(Date.now() + 1000);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.strictEqual(
      startedNodeIds.length,
      2,
      'all node status probes should start before any probe resolves',
    );

    releaseProbes();

    const probeResult = await probePromise;
    assert.strictEqual(probeResult.allActive, true);
  });

test('Unit: _probeClusterActiveState prefers traffic readiness probe in load mode',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let trafficProbeCalls = 0;
    let bootstrapProbeCalls = 0;
    let getStatusCalls = 0;
    const createNode = (nodeId) => ({
      id: nodeId,
      role: nodeId === 'node-a' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness(_options) {
        trafficProbeCalls += 1;
        return {
          status: 200,
          phase: 'TRAFFIC_READY',
          state: 'traffic_ready',
          reasons: [],
        };
      },
      async probeBootstrapReadiness(_options) {
        bootstrapProbeCalls += 1;
        return {
          status: 200,
          phase: 'JOIN_READY',
          state: 'join_ready',
          reasons: [],
        };
      },
      async getStatus() {
        getStatusCalls += 1;
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a', 'node-b'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 7,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: true,
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
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
      probeResult.allActive,
      true,
      'traffic readiness probe should satisfy load-readiness gate when snapshot coverage is complete',
    );
    assert.strictEqual(
      trafficProbeCalls,
      2,
      'traffic readiness should be queried per node',
    );
    assert.strictEqual(
      bootstrapProbeCalls,
      0,
      'bootstrap join readiness should not drive ACTIVE gate when traffic probe exists',
    );
    assert.strictEqual(
      getStatusCalls,
      0,
      'legacy status query path should not be used when traffic readiness probe exists',
    );
  });

test('Unit: _probeClusterActiveState allows converged load mode with partial snapshot coverage',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const createNode = (nodeId) => ({
      id: nodeId,
      role: nodeId === 'node-a' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness(_options) {
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
            nodes: ['node-a'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 11,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: true,
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
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
      probeResult.snapshotCoverage.completeCoverage,
      false,
      'test fixture should preserve partial snapshot coverage',
    );
    assert.strictEqual(
      probeResult.snapshotCoverage.bestCoverageNodeCount,
      1,
      'partial coverage witness should include at least one observed node',
    );
    assert.strictEqual(
      probeResult.publicationConvergenceGate.ready,
      true,
      'fixture should satisfy publication convergence gate',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'load-mode ACTIVE gate should accept converged publication with partial snapshot coverage',
    );
  });

test(
  'Unit: _probeClusterActiveState fails priority-recovery traffic invariant ' +
    'when any node remains traffic-admitted',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const createNode = (nodeId, ready) => ({
      id: nodeId,
      role: nodeId === 'node-a' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness(_options) {
        return ready ?
          {
            status: 200,
            phase: 'TRAFFIC_READY',
            state: 'traffic_ready',
            reasons: [],
          } :
          {
            status: 503,
            phase: 'CONTROL_READY',
            state: 'warming',
            reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
          };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a', 'node-b'],
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 9,
                publicationStatus: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                pendingAckNodeIds: [],
                acknowledgedNodeIds: ['node-a', 'node-b'],
                priorityPartitionSummary: {
                  satisfied: false,
                  blockedPartitionCount: 1,
                  totalSpreadGap: 1,
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode('node-a', true));
    cluster._nodes.set('node-b', createNode('node-b', false));

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + 1000,
      {mode: 'load'},
    );

    const trafficGateInvariant = probeResult.priorityRecoveryInvariants.invariants
      .find((invariant) =>
        invariant.id === 'priority_recovery_readyz_closed_during_priority_recovery',
      );
    assert.ok(
      trafficGateInvariant,
      'priority-recovery traffic gate invariant should be reported',
    );
    assert.strictEqual(
      trafficGateInvariant.passed,
      false,
      'traffic gate invariant should fail when one node remains traffic-admitted',
    );
    assert.deepStrictEqual(
      trafficGateInvariant.details.trafficAdmittedNodeIds,
      ['node-a'],
      'invariant diagnostics should identify admitted nodes',
    );
    assert.strictEqual(
      trafficGateInvariant.details.expectedBlockedNodeCount,
      2,
      'invariant diagnostics should report required blocked-node coverage',
    );
    assert.strictEqual(
      trafficGateInvariant.details.observedBlockedNodeCount,
      1,
      'invariant diagnostics should report observed blocked-node coverage',
    );
  },
);

test(
  'Unit: _probeClusterActiveState defers readiness-timeout fallback nodes ' +
    'from load-mode traffic admission invariants',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const snapshotRow = {
      nodes: ['node-a', 'node-b'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 10,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          pendingAckNodeIds: [],
          acknowledgedNodeIds: ['node-a', 'node-b'],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      },
    };

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async probeTrafficReadiness() {
        throw new Error('Node readiness probe timed out for node-a');
      },
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {rows: [snapshotRow]};
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._nodes.set('node-b', {
      id: 'node-b',
      role: NODE_ROLES.JOINER,
      async probeTrafficReadiness() {
        return {
          status: 503,
          phase: 'CONTROL_READY',
          state: 'warming',
          reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        };
      },
      async getControlSnapshot() {
        return {rows: [snapshotRow]};
      },
      async getLogs(_options) {
        return '';
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + 1000,
      {mode: 'load'},
    );

    const trafficGateInvariant = probeResult.priorityRecoveryInvariants.invariants
      .find((invariant) =>
        invariant.id === 'priority_recovery_readyz_closed_during_priority_recovery',
      );
    assert.ok(
      trafficGateInvariant,
      'priority-recovery traffic gate invariant should be reported',
    );
    assert.strictEqual(
      trafficGateInvariant.passed,
      true,
      'timeout-fallback node should be deferred from violation accounting while spread is pending',
    );
    assert.deepStrictEqual(
      trafficGateInvariant.details.observedAdmittedNodeIds,
      ['node-a'],
      'invariant diagnostics should report observed admissions before timeout deferral',
    );
    assert.deepStrictEqual(
      trafficGateInvariant.details.deferredAdmittedNodeIds,
      ['node-a'],
      'invariant diagnostics should identify timeout-fallback admissions deferred during load-mode spread',
    );
    assert.deepStrictEqual(
      trafficGateInvariant.details.violatingNodeIds,
      [],
      'no violating nodes should remain after timeout-fallback deferral',
    );
    assert.strictEqual(
      trafficGateInvariant.details.observedBlockedNodeCount,
      2,
      'deferred timeout fallback should count as blocked during load-mode recovery gating',
    );
  },
);

test(
  'Unit: _probeClusterActiveState prefers bootstrap readiness over ' +
    'traffic-local blockers during startup',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const node = {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async probeTrafficReadiness(_options) {
        return {
          status: 503,
          phase: 'CONTROL_READY',
          phaseRank: 1,
          state: 'warming',
          reasons: ['local_query_transport_not_ready'],
        };
      },
      async probeBootstrapReadiness(_options) {
        return {
          status: 200,
          phase: 'JOIN_READY',
          state: 'join_ready',
          reasons: [],
        };
      },
      async getReachabilityDiagnostics(_options) {
        return {
          adminReady: true,
          lastError: null,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    };

    cluster._nodes.set('node-a', node);

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      true,
      'ACTIVE gate should open once admin readiness and snapshot coverage are complete',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].active,
      true,
      'node should be projected active for startup when only traffic-local blockers remain',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].phase,
      'JOIN_READY',
      'startup gate should preserve bootstrap readiness phase when it owns the admission decision',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].activitySource,
      'bootstrap_readiness',
      'startup gate should use bootstrap readiness rather than traffic-local readiness for admission',
    );
  },
);

test(
  'Unit: _probeClusterActiveState admits startup when bootstrap join ' +
    'readiness projects leader-metadata gaps as non-blocking',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const node = {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async probeTrafficReadiness(_options) {
        return {
          status: 503,
          phase: 'CONTROL_READY',
          phaseRank: 1,
          state: 'warming',
          reasons: ['LEADER_METADATA_INCOMPLETE'],
        };
      },
      async probeBootstrapReadiness(_options) {
        return {
          status: 200,
          phase: 'CONTROL_READY',
          state: 'warming',
          reasons: [],
        };
      },
      async getReachabilityDiagnostics(_options) {
        return {
          adminReady: true,
          lastError: null,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    };

    cluster._nodes.set('node-a', node);

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      true,
      'startup ACTIVE gate should use bootstrap join readiness semantics for leader-metadata publication',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].activitySource,
      'bootstrap_readiness',
      'bootstrap readiness should own startup admission when traffic readiness is still stricter',
    );
  },
);

test(
  'Unit: _probeClusterActiveState keeps ACTIVE gate closed for hard ' +
    'traffic blockers even when admin readiness is up',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const node = {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async probeTrafficReadiness(_options) {
        return {
          status: 503,
          phase: 'CONTROL_READY',
          phaseRank: 1,
          state: 'warming',
          reasons: ['SQL_ENGINE_UNAVAILABLE'],
        };
      },
      async getReachabilityDiagnostics(_options) {
        return {
          adminReady: true,
          lastError: null,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    };

    cluster._nodes.set('node-a', node);

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      false,
      'ACTIVE gate should stay closed on hard readiness blockers',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].active,
      false,
      'hard readiness blockers should not be projected active',
    );
  },
);

test(
  'Unit: _probeClusterActiveState keeps ACTIVE gate closed when bootstrap ' +
    'readiness passes but admin readiness fails',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const node = {
      id: 'node-a',
      role: NODE_ROLES.JOINER,
      async probeBootstrapReadiness(_options) {
        return {
          status: 200,
          phase: 'TRAFFIC_READY',
          state: 'join_ready',
          reasons: [],
        };
      },
      async getReachabilityDiagnostics(_options) {
        return {
          adminReady: false,
          lastError: 'connect ECONNREFUSED 127.0.0.1:8081',
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    };

    cluster._nodes.set('node-a', node);

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      false,
      'startup gate should require admin readiness, not just bootstrap readiness',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].active,
      false,
      'node should remain inactive when admin readiness is false',
    );
  });

test('Unit: _probeClusterActiveState falls back to status when readiness probe times out',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        throw new Error('Node readiness probe timed out for node-a');
      },
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + 1000,
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'status fallback should keep startup gate open when readiness endpoint is transiently timing out',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].active,
      true,
      'status fallback should preserve active projection for timeout-shaped readiness errors',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].activitySource,
      'status_query_fallback',
      'active diagnostics should expose timeout fallback source for CL-003 witnessing',
    );
    assert.ok(
      probeResult.nodeDiagnostics[0].reasons.some((reason) =>
        reason.startsWith('readiness_probe_timeout_fallback='),
      ),
      'active diagnostics should include fallback reason witness',
    );
  });

test('Unit: _probeClusterActiveState requires control snapshot coverage even when ACTIVE',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const createNode = (nodeId) => ({
      id: nodeId,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode('node-a'));
    cluster._nodes.set('node-b', createNode('node-b'));

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      false,
      'ACTIVE gate should stay closed until snapshot coverage includes all nodes',
    );
    assert.ok(
      probeResult.snapshotCoverage,
      'startup probe should include snapshot coverage diagnostics',
    );
  });

test('Unit: _probeClusterActiveState does not bypass ACTIVE status with snapshot coverage',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const expectedNodeIds = ['node-a', 'node-b', 'node-c'];
    const createNode = (nodeId, snapshotNodes) => ({
      id: nodeId,
      role: NODE_ROLES.JOINER,
      async getStatus() {
        throw new Error('Admin API query failed for node ' + nodeId);
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: snapshotNodes,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode('node-a', expectedNodeIds));
    cluster._nodes.set('node-b', createNode('node-b', []));
    cluster._nodes.set('node-c', createNode('node-c', []));

    const probeResult = await cluster._probeClusterActiveState(Date.now() + 1000);
    assert.strictEqual(
      probeResult.allActive,
      false,
      'snapshot coverage should not bypass non-ACTIVE node status',
    );
  });

test('Unit: _probeControlSnapshotCoverage short-circuits after complete coverage',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const probeCalls = [];
    const createNode = (nodeId, role, observedNodes) => ({
      id: nodeId,
      role,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push({
          nodeId,
          options,
        });
        return {
          rows: [{
            nodes: observedNodes,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set('node-a', createNode(
      'node-a',
      NODE_ROLES.SEED,
      ['node-a', 'node-b', 'node-c'],
    ));
    cluster._nodes.set('node-b', createNode(
      'node-b',
      NODE_ROLES.JOINER,
      ['node-a'],
    ));
    cluster._nodes.set('node-c', createNode(
      'node-c',
      NODE_ROLES.JOINER,
      ['node-a'],
    ));

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a', 'node-b', 'node-c'],
    );
    assert.strictEqual(
      coverage.completeCoverage,
      true,
      'single complete coverage snapshot should satisfy startup gate coverage',
    );
    assert.strictEqual(
      probeCalls.length,
      1,
      'snapshot probing should short-circuit after first complete coverage result',
    );
    assert.strictEqual(
      probeCalls[0].options.lane,
      'snapshot',
      'control snapshot probe should use snapshot lane',
    );
    assert.ok(
      Number.isInteger(probeCalls[0].options.timeoutMs) &&
      probeCalls[0].options.timeoutMs > 0,
      'control snapshot probe should pass explicit timeout budget to node query',
    );
    assert.strictEqual(
      probeCalls[0].options.forceRepair,
      false,
      'control snapshot probe should not force repair by default',
    );
  });

test('Unit: _probeControlSnapshotCoverage forwards forced repair requests',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const probeCalls = [];
    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push(options);
        return {
          rows: [{
            nodes: ['node-a'],
            capturedAtMs: 123,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a'],
      {forceRepair: true},
    );

    assert.strictEqual(coverage.completeCoverage, true);
    assert.strictEqual(probeCalls.length, 1);
    assert.strictEqual(
      probeCalls[0].forceRepair,
      true,
      'forced repair should be forwarded to the control snapshot query',
    );
    assert.strictEqual(
      coverage.selectedCapturedAtMs,
      123,
      'coverage summary should prefer capturedAtMs when present',
    );
  });

test('Unit: _probeControlSnapshotCoverage parallelizes remaining nodes after ' +
  'a partial seed snapshot',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const probeCalls = [];
    const nodeIds = ['node-a', 'node-b', 'node-c'];
    for (const [index, nodeId] of nodeIds.entries()) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: 'active'}]};
        },
        async getReachabilityDiagnostics() {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: 'admin_health',
            lastError: null,
          };
        },
        async getControlSnapshot(options) {
          probeCalls.push({
            nodeId,
            timeoutMs: options.timeoutMs,
          });
          return {
            rows: [{
              nodes: nodeIds.slice(0, index + 1),
              capturedAtMs: 100 + index,
            }],
          };
        },
        async getLogs(_options) {
          return '';
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 3500,
      nodeIds,
    );

    assert.strictEqual(
      coverage.completeCoverage,
      true,
      'final node should still be able to satisfy complete coverage',
    );
    assert.strictEqual(
      probeCalls.length,
      3,
      'coverage probe should continue probing until a complete snapshot is found',
    );
    assert.ok(
      Number.isInteger(probeCalls[0].timeoutMs) &&
        probeCalls[0].timeoutMs > 0,
      'seed snapshot probe should receive a positive timeout budget',
    );
    assert.ok(
      probeCalls.every((call) =>
        Number.isInteger(call.timeoutMs) && call.timeoutMs > 0),
      'every snapshot probe should receive a positive timeout budget',
    );
    assert.strictEqual(
      probeCalls[1].timeoutMs,
      probeCalls[2].timeoutMs,
      'remaining node probes should share the same timeout budget instead of ' +
        'serially starving the tail node',
    );
  });

test('Unit: _probeControlSnapshotCoverage preserves a meaningful timeout floor ' +
  'for late active-wait probes',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const snapshotProbeCalls = [];
    const reachabilityProbeCalls = [];
    for (const [index, nodeId] of ['node-a', 'node-b'].entries()) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: 'active'}]};
        },
        async getReachabilityDiagnostics(options = {}) {
          reachabilityProbeCalls.push({
            nodeId,
            timeoutMs: options.timeoutMs,
          });
          return {
            reachable: true,
            adminReady: true,
            reachableBy: 'admin_health',
            lastError: null,
          };
        },
        async getControlSnapshot(options = {}) {
          snapshotProbeCalls.push({
            nodeId,
            timeoutMs: options.timeoutMs,
          });
          return {
            rows: [{
              nodes: [nodeId],
              capturedAtMs: 100 + index,
            }],
          };
        },
        async getLogs(_options) {
          return '';
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 1,
      ['node-a', 'node-b'],
    );

    assert.strictEqual(
      snapshotProbeCalls.length,
      2,
      'late coverage probes should still inspect the remaining nodes when the first witness is partial',
    );
    assert.ok(
      snapshotProbeCalls.every((call) => call.timeoutMs >= 100),
      'snapshot coverage probes should preserve a meaningful timeout floor instead of collapsing to 1ms near the deadline',
    );
    assert.ok(
      reachabilityProbeCalls.every((call) => call.timeoutMs >= 100),
      'reachability probes should preserve the same meaningful timeout floor for late coverage attempts',
    );
    assert.ok(
      coverage.selectedSnapshotTimeoutMs >= 100,
      'coverage summary should report the preserved late snapshot timeout floor',
    );
    assert.ok(
      coverage.selectedReachabilityTimeoutMs >= 100,
      'coverage summary should report the preserved late reachability timeout floor',
    );
  });

test('Unit: _probeControlSnapshotCoverage falls back to default lane after snapshot-lane failure',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const probeCalls = [];
    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push(options);
        if (options?.lane === 'snapshot') {
          throw new Error('snapshot lane timed out');
        }
        return {
          rows: [{
            nodes: ['node-a'],
            capturedAtMs: 456,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a'],
    );

    assert.strictEqual(coverage.completeCoverage, true);
    assert.strictEqual(probeCalls.length, 2);
    assert.strictEqual(
      probeCalls[0]?.lane,
      'snapshot',
      'coverage probe should try snapshot lane first',
    );
    assert.strictEqual(
      probeCalls[1]?.lane,
      'default',
      'coverage probe should fall back to default lane after snapshot lane failure',
    );
    assert.strictEqual(
      coverage.selectedCapturedAtMs,
      456,
      'coverage summary should use fallback lane snapshot payload',
    );
  });

test('Unit: _probeControlSnapshotCoverage prefers authoritative admin-ready witnesses when coverage ties',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: false,
          adminReady: false,
          reachableBy: null,
          lastError: 'connect ECONNREFUSED 127.0.0.1:8081',
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-a'],
            capturedAtMs: 200,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._nodes.set('node-b', {
      id: 'node-b',
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: ['node-b'],
            capturedAtMs: 100,
            controlPlaneDiagnostics: {
              readinessByNodeId: {
                'node-b': {
                  dimensions: {
                    clusterMemberHealthy: true,
                  },
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 1000,
      ['node-a', 'node-b'],
    );

    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      'node-b',
      'authoritative admin-ready witnesses should win snapshot selection when coverage is otherwise tied',
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      'selected witness should preserve the authoritative admin-ready status',
    );
    assert.strictEqual(
      coverage.selectedControlPlaneDiagnosticsAvailable,
      true,
      'selected witness should preserve control-plane diagnostics availability',
    );
  });

test('Unit: _probeControlSnapshotCoverage parses stringified snapshot fields',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: JSON.stringify(['node-a']),
            capturedAtMs: '123',
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a'],
    );

    assert.strictEqual(
      coverage.completeCoverage,
      true,
      'stringified control snapshot fields should still satisfy coverage',
    );
    assert.strictEqual(
      coverage.bestCoverageNodeCount,
      1,
      'coverage should count parsed node ids from stringified JSON',
    );
    assert.strictEqual(
      coverage.selectedCapturedAtMs,
      123,
      'coverage should parse numeric capturedAtMs strings',
    );
  });

test('Unit: _probeControlSnapshotCoverage counts projected and suspected nodes ' +
  'when authoritative nodes remain publication-scoped', async () => {
  const cluster = createCluster({
    size: 5,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  cluster._nodes.set('node-a', {
    id: 'node-a',
    role: NODE_ROLES.SEED,
    async getStatus() {
      return {rows: [{status: 'active'}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        adminReady: true,
        reachableBy: 'admin_health',
        lastError: null,
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-a', 'node-b'],
          projectedNodes: ['node-a', 'node-b', 'node-c', 'node-d'],
          suspectedOrTransitioningNodes: ['node-e'],
          capturedAtMs: 321,
        }],
      };
    },
    async getLogs(_options) {
      return '';
    },
  });

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'],
  );

  assert.strictEqual(
    coverage.completeCoverage,
    true,
    'coverage should treat projected and suspected nodes as observed membership',
  );
  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    5,
    'coverage should union authoritative, projected, and suspected node ids',
  );
  assert.deepStrictEqual(
    coverage.selectedObservedNodeIds,
    ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'],
    'coverage should retain the expanded observed node set',
  );
});

test('Unit: _probeControlSnapshotCoverage surfaces publication diagnostics from the selected snapshot',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [],
            capturedAtMs: 123,
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: '18',
                publicationStatus: 'OPEN',
                publishedActiveNodeIds: JSON.stringify(['node-a', 'node-b']),
                pendingAckNodeIds: ['node-b'],
                acknowledgedNodeIds: ['node-a'],
                recoveryProtocolState: 'publication_pending',
                priorityRecoveryReasonCodes: [
                  'publication_epoch_pending',
                  'priority_partitions_not_spread',
                ],
                participationByNodeId: {
                  'node-a': {
                    state: 'published_active',
                    publishedActive: true,
                    recoveryActive: true,
                  },
                  'node-b': {
                    state: 'recovery_pending_publish',
                    recoveryActive: true,
                    recoverySource: 'recovery_eligible_projection',
                  },
                  'node-c': {
                    state: 'recovery_pending_publish',
                    recoveryActive: true,
                    recoverySource: 'recovery_eligible_projection',
                  },
                },
                participationStateCounts: {
                  published_active: 1,
                  recovery_pending_publish: 2,
                },
                membershipLifecycleSummary: {
                  lifecycleState: 'publish_pending',
                  epochBoundary: 'publication_pending',
                  publishedActiveNodeIds: ['node-a', 'node-b'],
                  projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
                  locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
                  suspectedOrTransitioningNodeIds: ['node-c'],
                  projectionDiagnostics: {
                    readinessDecisionMode:
                      'cluster_member_or_recovery_eligible',
                    readinessDecisionDimensions: [
                      'clusterMemberHealthy',
                      'controlPlaneRecoveryEligible',
                      'controlPlaneWritable',
                    ],
                    recoveryEligibleProjectionEnabled: true,
                    recoveryEligibleIncludedNodeIds: ['node-b'],
                    readinessExcludedNodeIds: ['node-c'],
                    clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
                  },
                },
              },
              publishedMembershipObservation: {
                publicationEpoch: 17,
                status: 'PUBLISHED',
                publishedActiveNodeIds: ['node-a'],
                acknowledgedNodeIds: ['node-a'],
              },
              readinessByNodeId: {
                'node-a': {
                  dimensions: {
                    clusterMemberHealthy: true,
                  },
                },
                'node-b': {
                  dimensions: {
                    clusterMemberHealthy: false,
                  },
                },
              },
            },
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 5000,
      ['node-a', 'node-b'],
      {forceRepair: true},
    );

    assert.strictEqual(coverage.completeCoverage, false);
    assert.deepStrictEqual(
      coverage.selectedPublicationConvergence,
      {
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        publishedActiveNodeIds: ['node-a', 'node-b'],
        pendingAckNodeIds: ['node-b'],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
        recoveryActiveNodeSource: 'locally_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-c'],
        recoveryProtocolState: 'publication_pending',
        priorityRecoveryReasonCodes: [
          'priority_partitions_not_spread',
          'publication_epoch_pending',
        ],
        participationByNodeId: {
          'node-a': {
            state: 'published_active',
            durable: false,
            publishedActive: true,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: null,
            reasons: [],
          },
          'node-b': {
            state: 'recovery_pending_publish',
            durable: false,
            publishedActive: false,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: 'recovery_eligible_projection',
            reasons: [],
          },
          'node-c': {
            state: 'recovery_pending_publish',
            durable: false,
            publishedActive: false,
            recoveryActive: true,
            projectedServing: false,
            locallyEligible: false,
            suspectedOrTransitioning: false,
            recoverySource: 'recovery_eligible_projection',
            reasons: [],
          },
        },
        participationStateCounts: {
          published_active: 1,
          recovery_pending_publish: 2,
        },
        priorityPartitionSummary: null,
        membershipLifecycleSummary: {
          lifecycleState: 'publish_pending',
          epochBoundary: 'publication_pending',
          publishedActiveNodeIds: ['node-a', 'node-b'],
          projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
          locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
          suspectedOrTransitioningNodeIds: ['node-c'],
          recoveryActiveNodeIds: ['node-a', 'node-b', 'node-c'],
          recoveryActiveNodeSource: 'locally_eligible_projection',
          missingPublishedRecoveryActiveNodeIds: ['node-c'],
          recoveryProtocolState: 'publication_pending',
          recoveryProtocolReasonCodes: [
            'priority_partitions_not_spread',
            'publication_epoch_pending',
          ],
          participationByNodeId: {
            'node-a': {
              state: 'published_active',
              durable: false,
              publishedActive: true,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: null,
              reasons: [],
            },
            'node-b': {
              state: 'recovery_pending_publish',
              durable: false,
              publishedActive: false,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: 'recovery_eligible_projection',
              reasons: [],
            },
            'node-c': {
              state: 'recovery_pending_publish',
              durable: false,
              publishedActive: false,
              recoveryActive: true,
              projectedServing: false,
              locallyEligible: false,
              suspectedOrTransitioning: false,
              recoverySource: 'recovery_eligible_projection',
              reasons: [],
            },
          },
          participationStateCounts: {
            published_active: 1,
            recovery_pending_publish: 2,
          },
          projectionDiagnostics: {
            readinessDecisionMode: 'cluster_member_or_recovery_eligible',
            readinessDecisionDimensions: [
              'clusterMemberHealthy',
              'controlPlaneRecoveryEligible',
              'controlPlaneWritable',
            ],
            recoveryEligibleProjectionEnabled: true,
            recoveryEligibleIncludedNodeIds: ['node-b'],
            readinessExcludedNodeIds: ['node-c'],
            clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
          },
        },
        projectionDiagnostics: {
          readinessDecisionMode: 'cluster_member_or_recovery_eligible',
          readinessDecisionDimensions: [
            'clusterMemberHealthy',
            'controlPlaneRecoveryEligible',
            'controlPlaneWritable',
          ],
          recoveryEligibleProjectionEnabled: true,
          recoveryEligibleIncludedNodeIds: ['node-b'],
          readinessExcludedNodeIds: ['node-c'],
          clusterMemberUnhealthyExcludedNodeIds: ['node-c'],
        },
      },
      'coverage probe should retain current publication convergence details for failing snapshots',
    );
    assert.deepStrictEqual(
      coverage.selectedPublishedMembershipObservation,
      {
        publicationEpoch: 17,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['node-a'],
        pendingAckNodeIds: [],
        acknowledgedNodeIds: ['node-a'],
        recoveryActiveNodeIds: ['node-a'],
        recoveryActiveNodeSource: 'published_membership',
        missingPublishedRecoveryActiveNodeIds: [],
        priorityPartitionSummary: null,
        membershipLifecycleSummary: null,
        projectionDiagnostics: null,
      },
      'coverage probe should surface the last published membership separately from newer open publications',
    );
    assert.deepStrictEqual(
      coverage.selectedHealthyReadinessNodeIds,
      ['node-a'],
      'coverage probe should report readiness-healthy nodes from the selected snapshot diagnostics',
    );
    assert.strictEqual(
      coverage.selectedAdminReady,
      true,
      'coverage probe should preserve admin-readiness for the selected snapshot node',
    );
    assert.deepStrictEqual(
      coverage.selectedMissingPublishedNodeIds,
      [],
      'coverage probe should preserve the selected snapshot publication disagreement set',
    );
    assert.deepStrictEqual(
      coverage.probeWitnesses,
      [{
        nodeId: 'node-a',
        snapshotQuerySucceeded: true,
        adminReady: true,
        reachable: true,
        reachableBy: 'admin_health',
        reachabilityError: null,
        error: null,
        observedNodeCount: 0,
        missingExpectedNodeCount: 2,
        capturedAtMs: 123,
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        publishedActiveNodeIds: ['node-a', 'node-b'],
        pendingAckNodeIds: ['node-b'],
        missingPublishedNodeIds: [],
      }],
      'coverage probe should emit compact per-attempt witness data for closure-ledger updates',
    );
  });

test('Unit: _probeControlSnapshotCoverage captures per-node publication ' +
  'disagreement for 3-node active-gate characterization', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const createNode = (
    nodeId,
    role,
    observedNodes,
    capturedAtMs,
    publishedActiveNodeIds,
    pendingWrites,
    bufferedEvents,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: 'active'}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        adminReady: true,
        reachableBy: 'admin_health',
        lastError: null,
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: observedNodes,
          capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 22,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: ['node-a'],
            },
            logsTable: {
              pendingWrites,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              sharedPressureBackpressured: false,
            },
            cdcReplay: {
              bufferedEvents,
              replayBufferGrowthCount: 0,
              replayRetryDepth: 1,
              partitionCount: 1,
              replayInFlightPartitionCount: 0,
              byPartitionId: {},
            },
          },
        }],
      };
    },
    async getLogs(_options) {
      return '';
    },
  });

  cluster._nodes.set('node-a', createNode(
    'node-a',
    NODE_ROLES.SEED,
    ['node-a', 'node-b'],
    100,
    ['node-a', 'node-b'],
    4,
    9,
  ));
  cluster._nodes.set('node-b', createNode(
    'node-b',
    NODE_ROLES.JOINER,
    ['node-a', 'node-b'],
    200,
    ['node-a', 'node-c'],
    7,
    13,
  ));
  cluster._nodes.set('node-c', createNode(
    'node-c',
    NODE_ROLES.JOINER,
    ['node-a'],
    300,
    ['node-a'],
    1,
    5,
  ));

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c'],
  );

  assert.strictEqual(coverage.completeCoverage, false);
  assert.strictEqual(
    coverage.selectedNodeId,
    'node-b',
    'probe should select the best 3-node snapshot candidate for gate diagnostics',
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    ['node-b'],
    'selected snapshot should preserve the publication disagreement set',
  );
  assert.deepStrictEqual(
    coverage.publicationDisagreementByNodeId,
    {
      'node-a': ['node-c'],
      'node-b': ['node-b'],
      'node-c': ['node-b', 'node-c'],
    },
    'coverage probe should expose per-node publication disagreement witnesses',
  );
  assert.strictEqual(
    coverage.selectedControlPlaneOwnerQueueDepth?.pendingWrites,
    7,
    'selected snapshot should carry owner queue-depth witness at the active gate',
  );
  assert.strictEqual(
    coverage.selectedCdcReplayLag?.bufferedEvents,
    13,
    'selected snapshot should carry CDC lag witness at the active gate',
  );
});

test('Unit: _probeControlSnapshotCoverage prefers the strongest publication ' +
  'witness when coverage ties', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const createNode = (
    nodeId,
    role,
    capturedAtMs,
    publishedActiveNodeIds,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: 'active'}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        adminReady: true,
        reachableBy: 'admin_health',
        lastError: null,
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-a', 'node-b'],
          capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 22,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: ['node-a'],
            },
            logsTable: {
              pendingWrites: 0,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 0,
              sharedPressureBackpressured: false,
            },
            cdcReplay: {
              bufferedEvents: 0,
              replayBufferGrowthCount: 0,
              replayRetryDepth: 0,
              partitionCount: 1,
              replayInFlightPartitionCount: 0,
              byPartitionId: {},
            },
          },
        }],
      };
    },
    async getLogs() {
      return '';
    },
  });

  cluster._nodes.set('node-a', createNode(
    'node-a',
    NODE_ROLES.SEED,
    100,
    ['node-a', 'node-b'],
  ));
  cluster._nodes.set('node-b', createNode(
    'node-b',
    NODE_ROLES.JOINER,
    200,
    ['node-a'],
  ));
  cluster._nodes.set('node-c', createNode(
    'node-c',
    NODE_ROLES.JOINER,
    300,
    ['node-a'],
  ));

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + 5000,
    ['node-a', 'node-b', 'node-c'],
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    'node-a',
    'probe should prefer the witness with fewer missing published nodes over a newer stale witness',
  );
  assert.deepStrictEqual(
    coverage.selectedPublishedActiveNodeIds,
    ['node-a', 'node-b'],
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    ['node-c'],
  );
});

test('Unit: _waitForAllActive carries selected snapshot witness into no-progress diagnostics',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};
    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 1,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1'],
          selectedMissingPublishedNodeIds: ['joiner-1'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['publication_missing_active_node=joiner-1'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: ['joiner-1'],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await assert.rejects(
      async () => cluster._waitForAllActive({mode: 'load'}),
      (error) => {
        assert.match(error.message, /snapshotNode=seed-1#adminReady=true/);
        assert.match(error.message, /missingPublishedIds=joiner-1/);
        assert.equal(
          error?.diagnostics?.noProgress?.currentProgress?.selectedSnapshotNodeId,
          'seed-1',
        );
        assert.deepStrictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedMissingPublishedNodeIds,
          ['joiner-1'],
        );
        return true;
      },
    );

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true;
    });
    assert.ok(waitingStage, 'should record waiting-active stall details');
    assert.equal(
      waitingStage.details?.activeGateProgress?.selectedSnapshotNodeId,
      'seed-1',
    );
    assert.deepStrictEqual(
      waitingStage.details?.activeGateProgress?.selectedMissingPublishedNodeIds,
      ['joiner-1'],
    );
  });

test('Unit: _waitForAllActive treats CL-003 witness as load-mode soft success',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: [],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true;
    });
    assert.equal(
      waitingStage,
      undefined,
      'soft-success closure should complete without recording a stalled waiting-active stage',
    );
    assert.equal(
      collectedFailureLogs,
      false,
      'soft-success closure should not trigger failure log collection',
    );
  });

test('Unit: _waitForAllActive rejects CL-004 witness without strong admission',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 0,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedError:
            'Admin API query timed out for node seed-1 on lane snapshot after 3000ms',
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
          error.message.includes('Not all nodes reached ACTIVE state within');
      },
      'startup snapshot timeout should timeout until active admission is strong',
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      'startup timeout should carry final timeout diagnostics',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      'snapshot_timeout',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.recoverability,
      'terminal',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      'startup',
    );
    assert.equal(
      collectedFailureLogs,
      true,
      'startup snapshot-timeout path should collect failure logs',
    );
  });

test('Unit: _waitForAllActive rejects CL-006 witness without strong admin proof',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    cluster._recordClusterStage = () => {};

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-2',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 3,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 2,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: ['joiner-2'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
          error.message.includes('Not all nodes reached ACTIVE state within');
      },
      'startup publication lag witness should timeout when strong admission is absent',
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      'startup timeout should carry final timeout diagnostics',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      'no_progress_terminal',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.cause,
      'none',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      'startup',
    );
    assert.equal(
      collectedFailureLogs,
      true,
      'startup publication-lag timeout should collect failure logs',
    );
  });

test('Unit: _waitForAllActive rejects CL-006 witness when only reachability is transient',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    cluster._recordClusterStage = () => {};

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-2',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 3,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: false,
          selectedReachableBy: null,
          selectedReachabilityError:
            'Control snapshot reachability probe timed out for seed-1',
          selectedPublicationConvergence: {
            publicationEpoch: 2,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: ['joiner-2'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
          error.message.includes('Not all nodes reached ACTIVE state within');
      },
      'startup publication-lag witness should timeout when reachability is weak',
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      'startup timeout should carry final timeout diagnostics',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      'snapshot_reachability_timeout',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.recoverability,
      'terminal',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      'startup',
    );
    assert.equal(
      collectedFailureLogs,
      true,
      'startup publication-lag timeout should collect failure logs',
    );
  });

test('Unit: _probeClusterActiveState forwards forced repair to snapshot coverage',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async probeBootstrapReadiness() {
        return {
          ok: true,
          statusCode: 200,
          body: {status: 'ok'},
        };
      },
    });
    let forwardedOptions = null;
    cluster._probeControlSnapshotCoverage = async (_deadline, _nodeIds, options) => {
      forwardedOptions = options;
      return {
        completeCoverage: true,
        expectedNodeCount: 1,
        bestCoverageNodeCount: 1,
      };
    };

    const result = await cluster._probeClusterActiveState(
      Date.now() + 5000,
      {forceRepair: true},
    );

    assert.strictEqual(
      typeof result.allActive,
      'boolean',
      'cluster ACTIVE probe should still return a boolean result',
    );
    assert.strictEqual(
      forwardedOptions?.forceRepair,
      true,
      'cluster ACTIVE probe should forward forced repair to the snapshot coverage probe',
    );
  });

test('Unit: _waitForAllActive falls back to local snapshot reads after one forced repair attempt',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        activeWaitForceRepairAfter: 0,
      },
    });

    const forceRepairCalls = [];
    let warmedSnapshotCache = false;

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when ACTIVE wait succeeds');
    };
    cluster._probeClusterActiveState = async (_deadline, options = {}) => {
      const forceRepair = options?.forceRepair === true;
      forceRepairCalls.push(forceRepair);
      if (forceRepair) {
        warmedSnapshotCache = true;
        return {
          allActive: false,
          nodeDiagnostics: [],
          snapshotCoverage: null,
          publicationConvergenceGate: null,
          priorityRecoveryInvariants: {invariants: []},
        };
      }
      return {
        allActive: warmedSnapshotCache === true,
        nodeDiagnostics: [],
        snapshotCoverage: null,
        publicationConvergenceGate: null,
        priorityRecoveryInvariants: {invariants: []},
      };
    };

    await cluster._waitForAllActive();

    assert.deepEqual(
      forceRepairCalls,
      [true, false],
      'ACTIVE wait should issue one forced repair probe, then return to local snapshot reads',
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

test('Unit: _waitForAllActive forwards explicit readiness mode to ACTIVE probes',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const observedOptions = [];
    cluster._probeClusterActiveState = async (_deadline, options = {}) => {
      observedOptions.push({...options});
      return {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    assert.strictEqual(
      observedOptions.length,
      1,
      'waitForAllActive should issue a single ACTIVE probe when the first probe succeeds',
    );
    assert.strictEqual(
      observedOptions[0].mode,
      'load',
      'waitForAllActive should forward the requested readiness mode to ACTIVE probes',
    );
  });

test('Unit: _waitForAllActive scales timeout budget for larger clusters',
  async () => {
    const cluster = createCluster({
      size: 7,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {convergence: 40},
    });

    cluster._nodes.set('stuck-node', {
      id: 'stuck-node',
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return new Promise(() => {});
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};

    const startedAt = Date.now();
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
        /Not all nodes reached ACTIVE state within/,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
    const elapsedMs = Date.now() - startedAt;
    assert.ok(
      elapsedMs >= 70,
      'scaled timeout should keep ACTIVE gate open longer for larger clusters',
    );
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

test('Unit: _waitForAllActive load mode fails fast when ACTIVE progress stalls',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 3,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 1,
          bestCoverageNodeCount: 1,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      };
    };

    await assert.rejects(
      async () => cluster._waitForAllActive({mode: 'load'}),
      (error) => {
        assert.match(
          error.message,
          /stalled with no meaningful progress/,
        );
        assert.equal(
          error?.diagnostics?.noProgress?.reasonCode,
          'stalled_no_progress',
        );
        assert.equal(
          error?.diagnostics?.noProgress?.failedNoProgress?.details
            ?.budgetAttempts,
          3,
        );
        return true;
      },
    );

    assert.equal(
      collectedFailureLogs,
      true,
      'should collect failure logs before surfacing no-progress stall errors',
    );
    assert.equal(
      recordedStages.some((entry) =>
        entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true),
      true,
      'stall diagnostics should be emitted into cluster-stage playback details',
    );
  });

test('Unit: _waitForAllActive load mode resets no-progress budget after progress',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 500,
        activeWaitNoProgressMaxAttempts: 3,
      },
    });

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when ACTIVE wait succeeds');
    };

    const progressSamples = [
      {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: ['joiner-1'],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: ['joiner-1'],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      },
      {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      },
      {
        allActive: true,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: 0,
              totalSpreadGap: 0,
            },
          },
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
        },
      },
    ];
    let probeCallCount = 0;
    cluster._probeClusterActiveState = async () => {
      const sample = progressSamples[Math.min(
        probeCallCount,
        progressSamples.length - 1,
      )];
      probeCallCount += 1;
      return sample;
    };

    await cluster._waitForAllActive({mode: 'load'});

    assert.equal(
      probeCallCount,
      3,
      'ACTIVE wait should allow progress updates to reset no-progress budget',
    );
  });

test('Unit: _waitForAllActive load mode fails directly on priority-recovery' +
  ' invariant breaches', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      convergence: 200,
      activeWaitNoProgressMaxAttempts: 50,
    },
  });

  cluster._sleep = async () => {};
  let collectedFailureLogs = false;
  cluster._collectFailureLogs = async () => {
    collectedFailureLogs = true;
  };

  cluster._probeClusterActiveState = async () => {
    return {
      allActive: false,
      nodeDiagnostics: [{
        nodeId: 'seed-1',
        active: true,
        state: 'active',
      }],
      snapshotCoverage: {
        completeCoverage: true,
        expectedNodeCount: 1,
        bestCoverageNodeCount: 1,
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: ['priority_control_plane_spread_pending'],
      },
      priorityRecoveryInvariants: {
        invariants: [{
          id: 'priority_recovery_readyz_closed_during_priority_recovery',
          invariantId:
            'priority_recovery_readyz_closed_during_priority_recovery',
          reasonCode: 'priority_recovery_readyz_not_closed_during_priority_recovery',
          severity: 'error',
          scope: 'cluster',
          owningSubsystem: 'distributed_harness_cluster_active_gate',
          passed: false,
          details: {
            mode: 'load',
            prioritySpreadPending: true,
            trafficBlockedNodeIds: [],
          },
        }],
        failingInvariantIds: [
          'priority_recovery_readyz_closed_during_priority_recovery',
        ],
        failingInvariantReasonCodes: [
          'priority_recovery_readyz_not_closed_during_priority_recovery',
        ],
        passed: false,
      },
    };
  };

  await assert.rejects(
    async () => cluster._waitForAllActive({mode: 'load'}),
    (error) => {
      assert.match(error.message, /invariant breach/);
      assert.equal(
        error?.diagnostics?.reasonCode,
        'priority_recovery_invariant_breach',
      );
      assert.equal(
        error?.diagnostics?.invariantBreaches?.hardCount,
        1,
      );
      assert.equal(
        error?.diagnostics?.invariantBreaches?.hardBreaches?.[0]?.reasonCode,
        'priority_recovery_readyz_not_closed_during_priority_recovery',
      );
      return true;
    },
  );

  assert.equal(
    collectedFailureLogs,
    true,
    'should collect failure logs before surfacing invariant breach errors',
  );
});

test('Unit: waitForLoadReadinessStability requires a sustained ACTIVE window',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const readinessSamples = [
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
      {
        allActive: false,
        nodeDiagnostics: [{nodeId: 'node-b', active: false, state: 'warming'}],
        snapshotCoverage: {completeCoverage: false},
      },
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
    ];
    let probeCallCount = 0;
    cluster._probeClusterActiveState = async () => {
      const sample = readinessSamples[Math.min(
        probeCallCount,
        readinessSamples.length - 1,
      )];
      probeCallCount += 1;
      return sample;
    };
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when stability succeeds');
    };

    await cluster.waitForLoadReadinessStability({
      stableWindowMs: 2,
      timeoutMs: 50,
    });

    assert.ok(
      probeCallCount >= 4,
      'stability window should restart when readiness briefly regresses',
    );
  });

test('Unit: waitForControlPlaneQuiescence waits for replica operations to ' +
  'drain and leadership to stay stable', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  let probeCallCount = 0;
  const snapshots = [
    {
      rows: [{
        capturedAt: 1,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 2,
          partitionGroupInFlight: {groupA: 2},
          operationTimelineById: {
            op1: [{step: 'PENDING', status: 'ACTIVE', inFlight: true}],
          },
        },
      }],
    },
    {
      rows: [{
        capturedAt: 2,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 0,
          partitionGroupInFlight: {},
          operationTimelineById: {},
        },
      }],
    },
    {
      rows: [{
        capturedAt: 3,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 0,
          partitionGroupInFlight: {},
          operationTimelineById: {},
        },
      }],
    },
    {
      rows: [{
        capturedAt: 4,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 0,
          partitionGroupInFlight: {},
          operationTimelineById: {},
        },
      }],
    },
  ];

  cluster._nodes = new Map([['seed-a', {
    id: 'seed-a',
    role: NODE_ROLES.SEED,
    async getControlSnapshot() {
      const snapshot = snapshots[Math.min(
        probeCallCount,
        snapshots.length - 1,
      )];
      probeCallCount += 1;
      return snapshot;
    },
    async getLogs() {
      return '';
    },
  }]]);
  cluster._sleep = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
  };
  cluster._collectFailureLogs = async () => {
    throw new Error('should not collect failure logs when quiescence succeeds');
  };

  const result = await cluster.waitForControlPlaneQuiescence({
    stableWindowMs: 2,
    timeoutMs: 50,
    noProgressTimeoutMs: 25,
    maxInFlightCount: 0,
  });

  assert.equal(result.inFlightCount, 0);
  assert.ok(
    probeCallCount >= 3,
    'quiescence gate should keep polling until the stable window completes',
  );
});

test('Unit: waitForControlPlaneQuiescence surfaces timeout diagnostics',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        return {
          rows: [{
            capturedAt: Date.now(),
            leaders: {partitions: 'seed-a'},
            replicaOperations: {
              inFlightCount: 1,
              partitionGroupInFlight: {groupA: 1},
              operationTimelineById: {
                op1: [{step: 'PENDING', status: 'ACTIVE', inFlight: true}],
              },
            },
          }],
        };
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster.waitForControlPlaneQuiescence({
        stableWindowMs: 2,
        timeoutMs: 15,
        maxInFlightCount: 0,
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /Control plane did not quiesce/i);
        assert.match(error.message, /inFlightCount=1/i);
        return true;
      },
    );
  });

test(
  'Unit: waitForControlPlaneQuiescence waits for critical system table spread',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let controlSnapshotCallCount = 0;
    let discoveryCallCount = 0;
    const controlSnapshots = [
      {
        rows: [{
          capturedAt: 1,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 2,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 3,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 4,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
    ];
    const discoverySnapshots = [
      buildCriticalSystemDiscoverySnapshot(['seed-a'], 1),
      buildCriticalSystemDiscoverySnapshot(['seed-a'], 2),
      buildCriticalSystemDiscoverySnapshot(
        ['seed-a', 'node-b', 'node-c'],
        3,
      ),
      buildCriticalSystemDiscoverySnapshot(
        ['seed-a', 'node-b', 'node-c'],
        4,
      ),
    ];

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        const snapshot = controlSnapshots[Math.min(
          controlSnapshotCallCount,
          controlSnapshots.length - 1,
        )];
        controlSnapshotCallCount += 1;
        return snapshot;
      },
      async queryWithTimeout(sql) {
        assert.match(
          sql,
          /service_discovery_local\('replica_operations'\)/,
          'critical spread probe should query the requested control-plane table',
        );
        const snapshot = discoverySnapshots[Math.min(
          discoveryCallCount,
          discoverySnapshots.length - 1,
        )];
        discoveryCallCount += 1;
        return snapshot;
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when quiescence succeeds');
    };

    const result = await cluster.waitForControlPlaneQuiescence({
      stableWindowMs: 2,
      timeoutMs: 50,
      noProgressTimeoutMs: 25,
      maxInFlightCount: 0,
      requireCriticalSystemSpread: true,
      criticalSystemTableNames: ['replica_operations'],
      criticalSystemRequiredDistinctNodeCount: 3,
    });

    assert.equal(result.inFlightCount, 0);
    assert.ok(
      discoveryCallCount >= 3,
      'quiescence should keep polling until critical control-plane replicas spread across distinct nodes',
    );
  },
);

test(
  'Unit: waitForControlPlaneQuiescence timeout diagnostics include critical system spread gaps',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        return {
          rows: [{
            capturedAt: Date.now(),
            leaders: {partitions: 'seed-a'},
            replicaOperations: {
              inFlightCount: 0,
              partitionGroupInFlight: {},
              operationTimelineById: {},
            },
          }],
        };
      },
      async queryWithTimeout(sql) {
        assert.match(
          sql,
          /service_discovery_local\('replica_operations'\)/,
        );
        return buildCriticalSystemDiscoverySnapshot(['seed-a'], Date.now());
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster.waitForControlPlaneQuiescence({
        stableWindowMs: 2,
        timeoutMs: 15,
        maxInFlightCount: 0,
        requireCriticalSystemSpread: true,
        criticalSystemTableNames: ['replica_operations'],
        criticalSystemRequiredDistinctNodeCount: 3,
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /criticalSystemDistribution=/i);
        assert.match(error.message, /replica_operations:1\/3/i);
        return true;
      },
    );
  },
);

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

test('Unit: Cluster.start waits for ACTIVE using startup readiness mode',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const mockProvider = {
      createNetwork: async () => ({id: 'net-startup-mode', name: 'net-startup-mode'}),
      removeNetwork: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {},
    };
    cluster._providers = [mockProvider];
    cluster._hostAssignment = [0, 0];

    cluster._startNode = async (nodeId, role, _seedIp, _nodeIndex) => {
      const containerId = 'container-startup-mode-' + nodeId;
      const ip = role === NODE_ROLES.SEED ? '10.0.2.1' : '10.0.2.2';
      return new NodeHandle(nodeId, containerId, ip, role, mockProvider);
    };
    cluster._waitForBootstrapApi = async () => {};
    let capturedActiveWaitOptions = null;
    cluster._waitForAllActive = async (options = {}) => {
      capturedActiveWaitOptions = {...options};
    };
    cluster._logCollector.startLiveSubscription = async () => {};
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};

    await cluster.start();

    assert.deepStrictEqual(
      capturedActiveWaitOptions,
      {mode: 'startup'},
      'startup gate should evaluate ACTIVE admission with startup readiness mode',
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

test('Unit: _startNode injects benchmark control timeout into NodeHandle',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      benchmark: {
        controlQueryTimeoutMs: 4321,
      },
    });

    cluster._networkName = 'test-net';

    const provider = cluster._providers[0];
    provider.createContainer = async (options) => ({
      containerId: 'container-1',
      ip: '10.0.0.10',
      name: options.name,
    });

    const node = await cluster._startNode('test-node-id', NODE_ROLES.SEED, null, 0);

    assert.strictEqual(
      node._defaultAdminQueryTimeoutMs,
      4321,
      'NodeHandle should inherit the benchmark control timeout configured for the cluster',
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
  const stopContainerCalls = [];
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
        Cmd: [REUSE_START_COMMAND],
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
  provider.stopContainer = async (containerId) => {
    stopContainerCalls.push(containerId);
  };
  provider.startContainer = async () => {
    startContainerCalls++;
  };
  provider.inspectContainer = async () => ({
    NetworkSettings: {
      Networks: {
        [cluster._networkName]: {
          IPAddress: '10.0.0.44',
          Aliases: ['ddb-test-reuse-1-1'],
        },
      },
    },
  });
  provider.createContainer = async () => {
    createContainerCalls++;
    throw new Error('createContainer should not be called for reused node');
  };
  let connectToNetworkArgs = null;
  provider.connectToNetwork = async (networkId, containerId, aliases) => {
    connectToNetworkArgs = {networkId, containerId, aliases};
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
    stopContainerCalls.length,
    1,
    'running reusable container should be quiesced before start',
  );
  assert.strictEqual(
    stopContainerCalls[0],
    'existing-container-id',
    'running reusable container should be stopped explicitly',
  );
  assert.strictEqual(startContainerCalls, 1);
  assert.strictEqual(createContainerCalls, 0);
  assert.strictEqual(node.containerId, 'existing-container-id');
  assert.strictEqual(node.ip, '10.0.0.44');
  await assert.doesNotReject(
    fs.access(
      resolvePath(
        '.tmp',
        'reuse-control',
        'ddb-test-reuse-1-1',
        'reset-data-on-start',
      ),
    ),
    'reused containers should be marked for one-time data reset before scenario start',
  );
  assert.strictEqual(
    connectToNetworkArgs,
    null,
    'already-connected reusable containers should not be reconnected',
  );
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
        Cmd: [REUSE_START_COMMAND],
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
    assert.ok(
      createContainerOptions.hostConfigExtras?.Binds?.some((entry) =>
        String(entry).endsWith(
          ':/harness-control',
        ),
      ),
      'recreated reusable joiner should mount the reuse-control bind',
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
    const strayContainerName = 'ddb-test-reuse-2-3';
    const seedContainerId = 'reuse-container-seed';
    const joinerContainerId = 'reuse-container-joiner';
    const strayContainerId = 'reuse-container-stray';
    containerStateByName.set(seedContainerName, 'running');
    containerStateByName.set(joinerContainerName, 'running');
    containerStateByName.set(strayContainerName, 'running');
    containerIpByName.set(seedContainerName, '10.0.2.1');
    containerIpByName.set(joinerContainerName, '10.0.2.2');
    containerIpByName.set(strayContainerName, '10.0.2.3');
    const stoppedContainers = [];

    provider.listContainers = async () => [
      {Names: [`/${seedContainerName}`]},
      {Names: [`/${joinerContainerName}`]},
      {Names: [`/${strayContainerName}`]},
    ];
    provider.inspectContainerIfExists = async (name) => {
      if (!containerStateByName.has(name)) {
        return null;
      }
      const env = [
        `NODE_ID=${
          name === seedContainerName ?
            seedNodeId :
            name === joinerContainerName ?
              joinerNodeId :
              cluster._buildNodeId(2)
        }`,
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
          name === joinerContainerName ?
            joinerContainerId :
            strayContainerId,
        State: {Status: containerStateByName.get(name)},
        Config: {
          Env: env,
          Entrypoint: ['sh', '-lc'],
          Cmd: [REUSE_START_COMMAND],
        },
        NetworkSettings: {
          Networks: {
            'ddb-test-net-reuse-local-2': {
              IPAddress: containerIpByName.get(name),
              Aliases: [name],
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
      } else if (containerId === strayContainerId) {
        containerStateByName.set(strayContainerName, 'exited');
      }
    };
    provider.startContainer = async (containerId) => {
      if (containerId === seedContainerId) {
        containerStateByName.set(seedContainerName, 'running');
      } else if (containerId === joinerContainerId) {
        containerStateByName.set(joinerContainerName, 'running');
      } else if (containerId === strayContainerId) {
        containerStateByName.set(strayContainerName, 'running');
      }
    };
    provider.restartContainer = async () => {
      throw new Error('start() should quiesce before startup, not restart');
    };
    provider.inspectContainer = async (containerId) => {
      const name = containerId === seedContainerId ?
        seedContainerName :
        containerId === joinerContainerId ?
          joinerContainerName :
          strayContainerName;
      return {
        NetworkSettings: {
          Networks: {
            [cluster._networkName]: {
              IPAddress: containerIpByName.get(name),
              Aliases: [name],
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
      [seedContainerId, joinerContainerId, strayContainerId],
      'reusable containers should quiesce base and stray same-size nodes',
    );

    await cluster.stop();
  });

test('Unit: reusable cluster lease rejects reentry in the same process',
  async () => {
    const lockPath = resolvePath(
      process.cwd(),
      '.tmp',
      'cluster-reuse-lease-reentry-' + Date.now() + '.lock',
    );
    const clusterA = createCluster({
      size: 5,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });
    const clusterB = createCluster({
      size: 5,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });

    clusterA._resolveReusableLeasePath = () => lockPath;
    clusterB._resolveReusableLeasePath = () => lockPath;

    try {
      await clusterA._acquireReusableClusterLease();
      await assert.rejects(
        () => clusterB._acquireReusableClusterLease(),
        /Reusable cluster lease already held in this process/,
      );
    } finally {
      await clusterA._releaseReusableClusterLease();
      await clusterB._releaseReusableClusterLease();
      await fs.rm(lockPath, {force: true});
    }
  });

test('Unit: reusable cluster lease recovers stale holder files', async () => {
  const lockPath = resolvePath(
    process.cwd(),
    '.tmp',
    'cluster-reuse-lease-stale-' + Date.now() + '.lock',
  );
  const cluster = createCluster({
    size: 5,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
    },
    image: 'distributed-db:test',
  });

  cluster._resolveReusableLeasePath = () => lockPath;
  await fs.mkdir(resolvePath(process.cwd(), '.tmp'), {recursive: true});
  await fs.writeFile(
    lockPath,
    JSON.stringify({
      pid: 999999,
      scenarioName: 'stale-owner',
      acquiredAtMs: Date.now() - 1000,
    }),
    'utf8',
  );

  try {
    await cluster._acquireReusableClusterLease();
    assert.strictEqual(
      typeof cluster._reuseLeaseRelease,
      'function',
      'stale reusable lease should be replaced by the current run',
    );
  } finally {
    await cluster._releaseReusableClusterLease();
    await fs.rm(lockPath, {force: true});
  }
});

test('Unit: reusable cluster lease timeout disables fast-local reuse for the ' +
  'current run', async () => {
  const cluster = createCluster({
    size: 5,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
    },
    image: 'distributed-db:test',
  });

  cluster._acquireReusableClusterLease = async () => {
    const error = new Error(
      'Timed out waiting for reusable cluster lease ' +
      '(path=/tmp/reuse.lock, timeoutMs=1000, holderPid=42, ' +
      'holderScenario=busy-run)',
    );
    error.code = 'REUSE_CLUSTER_LEASE_TIMEOUT';
    throw error;
  };

  await cluster._prepareReusableClusterLeaseForStart();

  assert.strictEqual(
    cluster._isContainerReuseEnabled(),
    false,
    'lease timeout should disable reusable containers for this run',
  );
  assert.match(
    cluster._reuseLeaseFallbackWarning,
    /Timed out waiting for reusable cluster lease/,
    'lease timeout fallback should retain the cause for diagnostics',
  );
});

test('Unit: _startNode reconnects reusable container with hostname alias',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });

    cluster._networkName = 'ddb-test-net-reuse-local-1';
    cluster._networkId = 'net-reuse-1';

    const reuseNodeId = cluster._buildNodeId(0);
    const provider = cluster._providers[0];
    let connectToNetworkArgs = null;
    let inspectAfterStartCalls = 0;
    provider.inspectContainerIfExists = async () => ({
      Id: 'existing-container-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-1-1:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: [REUSE_START_COMMAND],
      },
      NetworkSettings: {
        Networks: {
          [cluster._networkName]: {
            IPAddress: '10.0.0.55',
            Aliases: [],
          },
        },
      },
    });
    provider.startContainer = async () => {};
    provider.disconnectFromNetwork = async () => {};
    provider.inspectContainer = async () => {
      inspectAfterStartCalls++;
      return {
        NetworkSettings: {
          Networks: inspectAfterStartCalls === 1 ?
            {
              [cluster._networkName]: {
                IPAddress: '10.0.0.55',
                Aliases: [],
              },
            } :
            {
              [cluster._networkName]: {
                IPAddress: '10.0.0.55',
                Aliases: ['ddb-test-reuse-1-1'],
              },
            },
        },
      };
    };
    provider.connectToNetwork = async (networkId, containerId, aliases) => {
      connectToNetworkArgs = {networkId, containerId, aliases};
    };
    provider.createContainer = async () => {
      throw new Error('createContainer should not be called for reused node');
    };

    const node = await cluster._startNode(
      reuseNodeId,
      NODE_ROLES.SEED,
      null,
      0,
    );

    assert.deepStrictEqual(
      connectToNetworkArgs,
      {
        networkId: 'net-reuse-1',
        containerId: 'existing-container-id',
        aliases: ['ddb-test-reuse-1-1'],
      },
      'reused containers should be reattached when run-network endpoint ' +
      'is missing the hostname alias used in node addresses',
    );
    assert.strictEqual(node.containerId, 'existing-container-id');
    assert.strictEqual(node.ip, '10.0.0.55');
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
