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
  NODE_ROLES,
} from './cluster-test-helpers.js';

const LOAD_GATE_PROJECTION_TEST_CLUSTER_SIZE = 2;
const LOAD_GATE_PROJECTION_TEST_NODE_A = 'node-a';
const LOAD_GATE_PROJECTION_TEST_NODE_B = 'node-b';
const LOAD_GATE_PROJECTION_TEST_NODE_IDS = Object.freeze([
  LOAD_GATE_PROJECTION_TEST_NODE_A,
  LOAD_GATE_PROJECTION_TEST_NODE_B,
]);
const LOAD_GATE_PROJECTION_TEST_TIMEOUT_MS = 1000;
const LOAD_GATE_PROJECTION_TEST_READY_STATUS = 200;
const LOAD_GATE_PROJECTION_TEST_BLOCKED_STATUS = 503;
const LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH = 17;
const LOAD_GATE_PROJECTION_TEST_READY_PHASE = 'TRAFFIC_READY';
const LOAD_GATE_PROJECTION_TEST_READY_STATE = 'traffic_ready';
const LOAD_GATE_PROJECTION_TEST_BLOCKED_PHASE = 'CONTROL_READY';
const LOAD_GATE_PROJECTION_TEST_BLOCKED_STATE = 'degraded';
const LOAD_GATE_PROJECTION_TEST_PENDING_REASON =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
const LOAD_GATE_PROJECTION_TEST_PRIORITY_SPREAD_PENDING_REASON =
  'priority_control_plane_spread_pending';
const LOAD_GATE_PROJECTION_TEST_STABLE_WINDOW_REASON =
  'READINESS_STABLE_WINDOW_PENDING';
const LOAD_GATE_PROJECTION_TEST_OBSERVABILITY_BACKLOG_REASON =
  'OBSERVABILITY_BACKLOG';
const LOAD_GATE_PROJECTION_TEST_TIMEOUT_REASON_PREFIX =
  'readiness_probe_timeout_fallback=';
const LOAD_GATE_PROJECTION_TEST_SELECTED_REACHABILITY_TIMEOUT_ERROR =
  'Control snapshot reachability probe timed out for node-timeout';
const LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS = 'PUBLISHED';
const LOAD_GATE_PROJECTION_TEST_GATE_STATE = 'ready';
const LOAD_GATE_PROJECTION_TEST_GATE_SOURCE =
  'load_publication_gate_projection';
const LOAD_GATE_PROJECTION_TEST_REACHABILITY_SOURCE = 'admin_health';
const LOAD_GATE_PROJECTION_TEST_CONTROL_SNAPSHOT_SOURCE = 'control_snapshot';
const LOAD_GATE_PROJECTION_TEST_PRIORITY_PARTITION_COUNT = 5;
const LOAD_GATE_PROJECTION_TEST_BLOCKED_PARTITION_ID = 'partition-a';
const LOAD_GATE_PROJECTION_TEST_SPREAD_GAP = 1;

test(
  'Unit: _probeClusterActiveState projects stale traffic recovery blockers ' +
    'after load publication gate closes',
  async () => {
    const cluster = createCluster({
      size: LOAD_GATE_PROJECTION_TEST_CLUSTER_SIZE,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const snapshotRow = {
      nodes: LOAD_GATE_PROJECTION_TEST_NODE_IDS,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus: LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS,
          publishedActiveNodeIds: LOAD_GATE_PROJECTION_TEST_NODE_IDS,
          pendingAckNodeIds: [],
          acknowledgedNodeIds: LOAD_GATE_PROJECTION_TEST_NODE_IDS,
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
        publicationConvergenceGate: {
          state: LOAD_GATE_PROJECTION_TEST_GATE_STATE,
          ready: true,
          publicationEpoch: LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus: LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS,
          reasonCodes: [],
          reasons: [],
          priorityPartitionSummary: {
            satisfied: true,
            totalPriorityPartitionCount:
              LOAD_GATE_PROJECTION_TEST_PRIORITY_PARTITION_COUNT,
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
    };
    const createNode = (nodeId) => ({
      id: nodeId,
      role:
        nodeId === LOAD_GATE_PROJECTION_TEST_NODE_A ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      async probeTrafficReadiness(_options) {
        if (nodeId === LOAD_GATE_PROJECTION_TEST_NODE_A) {
          return {
            status: LOAD_GATE_PROJECTION_TEST_READY_STATUS,
            phase: LOAD_GATE_PROJECTION_TEST_READY_PHASE,
            state: LOAD_GATE_PROJECTION_TEST_READY_STATE,
            reasons: [],
          };
        }
        return {
          status: LOAD_GATE_PROJECTION_TEST_BLOCKED_STATUS,
          phase: LOAD_GATE_PROJECTION_TEST_BLOCKED_PHASE,
          state: LOAD_GATE_PROJECTION_TEST_BLOCKED_STATE,
          reasons: [LOAD_GATE_PROJECTION_TEST_PENDING_REASON],
        };
      },
      async getReachabilityDiagnostics(_options) {
        return {
          adminReady: true,
          reachable: true,
          reachableBy: LOAD_GATE_PROJECTION_TEST_REACHABILITY_SOURCE,
        };
      },
      async getControlSnapshot() {
        return {
          rows: [snapshotRow],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    cluster._nodes.set(
      LOAD_GATE_PROJECTION_TEST_NODE_A,
      createNode(LOAD_GATE_PROJECTION_TEST_NODE_A),
    );
    cluster._nodes.set(
      LOAD_GATE_PROJECTION_TEST_NODE_B,
      createNode(LOAD_GATE_PROJECTION_TEST_NODE_B),
    );

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + LOAD_GATE_PROJECTION_TEST_TIMEOUT_MS,
      {mode: 'load'},
    );
    const blockedNodeDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId === LOAD_GATE_PROJECTION_TEST_NODE_B,
    );

    assert.strictEqual(
      probeResult.publicationConvergenceGate.ready,
      true,
      'fixture should expose the readiness-owned publication gate as closed',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'stale local priority recovery readiness should not block load mode ' +
        'after the canonical gate is ready',
    );
    assert.strictEqual(
      blockedNodeDiagnostic?.active,
      true,
      'stale traffic readiness blocker should be projected active',
    );
    assert.strictEqual(
      blockedNodeDiagnostic?.activitySource,
      LOAD_GATE_PROJECTION_TEST_GATE_SOURCE,
      'diagnostics should expose publication-gate projection as the ' +
        'activity source',
    );
  },
	);

test(
  'Unit: _probeClusterActiveState projects terminal load-mode readiness noise ' +
    'after publication gate closure',
  async () => {
    const nodeIds = Object.freeze([
      'node-ready',
      'node-stable-window',
      'node-observability',
      'node-timeout',
    ]);
    const timeoutErrorMessage =
      'Node readiness probe timed out for node-timeout';
    const cluster = createCluster({
      size: nodeIds.length,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const snapshotRow = {
      nodes: [...nodeIds],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus: LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS,
          publishedActiveNodeIds: [...nodeIds],
          pendingAckNodeIds: [],
          acknowledgedNodeIds: [...nodeIds],
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
        publicationConvergenceGate: {
          state: LOAD_GATE_PROJECTION_TEST_GATE_STATE,
          ready: true,
          publicationEpoch: LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus: LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS,
          reasonCodes: [],
          reasons: [],
          priorityPartitionSummary: {
            satisfied: true,
            totalPriorityPartitionCount:
              LOAD_GATE_PROJECTION_TEST_PRIORITY_PARTITION_COUNT,
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
    };
    const readinessByNodeId = {
      'node-ready': {
        status: LOAD_GATE_PROJECTION_TEST_READY_STATUS,
        phase: LOAD_GATE_PROJECTION_TEST_READY_PHASE,
        state: LOAD_GATE_PROJECTION_TEST_READY_STATE,
        reasons: [],
      },
      'node-stable-window': {
        status: LOAD_GATE_PROJECTION_TEST_BLOCKED_STATUS,
        phase: LOAD_GATE_PROJECTION_TEST_BLOCKED_PHASE,
        state: 'warming',
        reasons: [LOAD_GATE_PROJECTION_TEST_STABLE_WINDOW_REASON],
      },
      'node-observability': {
        status: LOAD_GATE_PROJECTION_TEST_BLOCKED_STATUS,
        phase: LOAD_GATE_PROJECTION_TEST_BLOCKED_PHASE,
        state: 'warming',
        reasons: [LOAD_GATE_PROJECTION_TEST_OBSERVABILITY_BACKLOG_REASON],
      },
    };

    for (const nodeId of nodeIds) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role: nodeId === 'node-ready' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
        async probeTrafficReadiness(_options) {
          if (nodeId === 'node-timeout') {
            throw new Error(timeoutErrorMessage);
          }
          return readinessByNodeId[nodeId];
        },
        async getReachabilityDiagnostics(_options) {
          return {
            adminReady: true,
            reachable: true,
            reachableBy: LOAD_GATE_PROJECTION_TEST_REACHABILITY_SOURCE,
          };
        },
        async getControlSnapshot() {
          return {
            rows: [snapshotRow],
          };
        },
        async getLogs(_options) {
          return '';
        },
      });
    }

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + LOAD_GATE_PROJECTION_TEST_TIMEOUT_MS,
      {mode: 'load'},
    );
    const projectedDiagnostics = probeResult.nodeDiagnostics.filter(
      (diagnostic) =>
        diagnostic.activitySource === LOAD_GATE_PROJECTION_TEST_GATE_SOURCE,
    );
    const timeoutDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) => diagnostic.nodeId === 'node-timeout',
    );

    assert.strictEqual(
      probeResult.allActive,
      true,
      'terminal load-readiness noise should not block after publication closes',
    );
    assert.strictEqual(
      projectedDiagnostics.length,
      nodeIds.length - 1,
      'stable-window, observability, and timeout witnesses should be projected',
    );
    assert.strictEqual(
      timeoutDiagnostic?.active,
      true,
      'timeout-shaped readiness should be admitted after canonical closure',
    );
    assert.strictEqual(
      timeoutDiagnostic?.error,
      null,
      'projection should clear the timeout error after preserving sourceError',
    );
    assert.ok(
      timeoutDiagnostic?.reasons.some((reason) =>
        reason.startsWith(LOAD_GATE_PROJECTION_TEST_TIMEOUT_REASON_PREFIX),
      ),
      'timeout diagnostic should retain the readiness timeout reason',
    );
  },
);
test(
  'Unit: _probeClusterActiveState trusts canonical load publication gate when ' +
    'selected admin reachability times out',
  async () => {
    const nodeIds = Object.freeze(['node-timeout', 'node-pending']);
    const readinessTimeoutErrorMessage =
      'Node readiness probe timed out for node-timeout';
    const cluster = createCluster({
      size: nodeIds.length,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const snapshotRow = {
      nodes: [...nodeIds],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus: LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS,
          publishedActiveNodeIds: [...nodeIds],
          pendingAckNodeIds: [],
          acknowledgedNodeIds: [...nodeIds],
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
        publicationConvergenceGate: {
          state: LOAD_GATE_PROJECTION_TEST_GATE_STATE,
          ready: true,
          publicationEpoch: LOAD_GATE_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus: LOAD_GATE_PROJECTION_TEST_PUBLICATION_STATUS,
          reasonCodes: [],
          reasons: [],
          priorityPartitionSummary: {
            satisfied: true,
            totalPriorityPartitionCount:
              LOAD_GATE_PROJECTION_TEST_PRIORITY_PARTITION_COUNT,
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
    };

    for (const nodeId of nodeIds) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role: nodeId === 'node-timeout' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
        async probeTrafficReadiness(_options) {
          if (nodeId === 'node-timeout') {
            throw new Error(readinessTimeoutErrorMessage);
          }
          return {
            status: LOAD_GATE_PROJECTION_TEST_BLOCKED_STATUS,
            phase: LOAD_GATE_PROJECTION_TEST_BLOCKED_PHASE,
            state: LOAD_GATE_PROJECTION_TEST_BLOCKED_STATE,
            reasons: [LOAD_GATE_PROJECTION_TEST_PENDING_REASON],
          };
        },
        async getReachabilityDiagnostics(_options) {
          if (nodeId === 'node-timeout') {
            throw new Error(
              LOAD_GATE_PROJECTION_TEST_SELECTED_REACHABILITY_TIMEOUT_ERROR,
            );
          }
          return {
            adminReady: true,
            reachable: true,
            reachableBy: LOAD_GATE_PROJECTION_TEST_REACHABILITY_SOURCE,
          };
        },
        async getControlSnapshot() {
          return {
            rows: [snapshotRow],
          };
        },
        async getLogs(_options) {
          return '';
        },
      });
    }

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + LOAD_GATE_PROJECTION_TEST_TIMEOUT_MS,
      {mode: 'load'},
    );
    const projectedDiagnostics = probeResult.nodeDiagnostics.filter(
      (diagnostic) =>
        diagnostic.activitySource === LOAD_GATE_PROJECTION_TEST_GATE_SOURCE,
    );

    assert.strictEqual(
      probeResult.snapshotCoverage.selectedAdminReady,
      true,
      'selected snapshot reachability timeout should be tolerable with canonical snapshot evidence',
    );
    assert.strictEqual(
      probeResult.snapshotCoverage.selectedSnapshotReachableBy,
      LOAD_GATE_PROJECTION_TEST_CONTROL_SNAPSHOT_SOURCE,
      'selected snapshot should name the control snapshot fallback witness',
    );
    assert.strictEqual(
      probeResult.publicationConvergenceGate.ready,
      true,
      'canonical publication gate should be closed',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'canonical publication gate should admit terminal load-readiness noise',
    );
    assert.strictEqual(
      projectedDiagnostics.length,
      nodeIds.length,
      'both timeout and stale priority recovery blockers should be projected',
    );
  },
);

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
                  blockedPartitions: [{
                    partitionId: LOAD_GATE_PROJECTION_TEST_BLOCKED_PARTITION_ID,
                    spreadGap: LOAD_GATE_PROJECTION_TEST_SPREAD_GAP,
                  }],
                },
              },
              publicationConvergenceGate: {
                ready: false,
                reasons: [
                  LOAD_GATE_PROJECTION_TEST_PRIORITY_SPREAD_PENDING_REASON,
                ],
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
  'Unit: _probeClusterActiveState blocks readiness-timeout nodes during ' +
    'load-mode traffic admission',
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
          publishedActiveNodeIds: ['node-b'],
          pendingAckNodeIds: [],
          acknowledgedNodeIds: ['node-b'],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: LOAD_GATE_PROJECTION_TEST_BLOCKED_PARTITION_ID,
              spreadGap: LOAD_GATE_PROJECTION_TEST_SPREAD_GAP,
            }],
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

    assert.strictEqual(
      probeResult.allActive,
      false,
      'load-mode readiness should not fall back to status on traffic timeout',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].active,
      false,
      'timeout-shaped traffic readiness should keep the node inactive',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].activitySource,
      'traffic_readiness',
      'diagnostics should preserve the traffic-readiness source',
    );
    assert.ok(
      probeResult.nodeDiagnostics[0].reasons.some((reason) =>
        reason.startsWith('readiness_probe_timeout_fallback='),
      ),
      'diagnostics should include the timeout reason without admitting traffic',
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
      'blocked timeout node should satisfy traffic gate closure while spread is pending',
    );
    assert.deepStrictEqual(
      trafficGateInvariant.details.observedAdmittedNodeIds,
      [],
      'timeout node should not be traffic-admitted in load mode',
    );
    assert.deepStrictEqual(
      trafficGateInvariant.details.deferredAdmittedNodeIds,
      [],
      'load-mode timeout should not require deferred admission accounting',
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
