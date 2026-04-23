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
