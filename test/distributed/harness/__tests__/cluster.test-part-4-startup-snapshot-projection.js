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

const STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A = 'node-a';
const STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B = 'node-b';
const STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_C = 'node-c';
const STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_MS = 1000;
const STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_ERROR =
  'Node readiness probe timed out for node-a';
const STARTUP_SNAPSHOT_PROJECTION_TEST_STATUS_TIMEOUT_ERROR =
  'Node status probe timed out for node-a';
const STARTUP_SNAPSHOT_PROJECTION_TEST_READY_STATUS = 200;
const STARTUP_SNAPSHOT_PROJECTION_TEST_PUBLICATION_EPOCH = 10;
const STARTUP_SNAPSHOT_PROJECTION_TEST_PUBLICATION_STATUS = 'PUBLISHED';
const STARTUP_SNAPSHOT_PROJECTION_TEST_REACHABILITY_SOURCE = 'admin_health';
const STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_SOURCE =
  'startup_snapshot_projection';
const STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_REASON =
  'startup_snapshot_ready';
const STARTUP_SNAPSHOT_PROJECTION_TEST_ADMISSION_STATE =
  'degraded_but_proceeding';
const STARTUP_SNAPSHOT_PROJECTION_TEST_DIMENSION = 'clusterMemberHealthy';
const STARTUP_SNAPSHOT_PROJECTION_TEST_INACTIVE_STATUS = 503;
const STARTUP_SNAPSHOT_PROJECTION_TEST_INACTIVE_STATE = 'init';
const STARTUP_SNAPSHOT_PROJECTION_TEST_INACTIVE_REASON = 'BOOTSTRAP_NOT_READY';
const STARTUP_SNAPSHOT_PROJECTION_TEST_PARTIAL_COVERAGE_COUNT = 2;

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

test('Unit: _probeClusterActiveState keeps startup readiness timeouts blocked',
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
      false,
      'startup gate should not fall back to status when readiness times out',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].active,
      false,
      'timeout-shaped startup readiness should keep the node inactive',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics[0].activitySource,
      'bootstrap_readiness',
      'active diagnostics should preserve the startup readiness source',
    );
    assert.ok(
      probeResult.nodeDiagnostics[0].reasons.some((reason) =>
        reason.startsWith('readiness_probe_timeout='),
      ),
      'active diagnostics should include the timeout reason witness',
    );
    assert.match(
      probeResult.nodeDiagnostics[0].error,
      /Node readiness probe timed out for node-a/u,
      'startup readiness timeout should remain explicit owner evidence',
    );
  });

test(
  'Unit: _probeClusterActiveState keeps startup gate closed on partial ' +
    'snapshot coverage even with publication evidence',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const nodeIds = ['node-a', 'node-b'];
    const snapshotRow = {
      nodes: ['node-a'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 11,
          publicationStatus: 'PUBLISHED',
          publishedActiveNodeIds: nodeIds,
          pendingAckNodeIds: [],
          acknowledgedNodeIds: nodeIds,
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
      },
    };
    const createNode = (nodeId) => ({
      id: nodeId,
      role: nodeId === 'node-a' ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        return {
          status: 200,
          phase: 'BOOTSTRAP_READY',
          state: 'active',
          reasons: [],
        };
      },
      async getReachabilityDiagnostics() {
        return {
          adminReady: true,
          reachable: true,
          reachableBy: 'admin_health',
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

    cluster._nodes.set('node-a', createNode('node-a'));
    cluster._nodes.set('node-b', createNode('node-b'));

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + 1000,
    );

    assert.strictEqual(
      probeResult.snapshotCoverage.completeCoverage,
      false,
      'fixture should preserve incomplete startup snapshot coverage',
    );
    assert.strictEqual(
      probeResult.publicationConvergenceGate.ready,
      true,
      'startup publication gate should not replace snapshot coverage',
    );
    assert.strictEqual(
      probeResult.allActive,
      false,
      'startup gate should require complete snapshot coverage',
    );
  },
);

test(
  'Unit: _probeClusterActiveState projects startup timeout from partial ' +
    'selected snapshot coverage',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const coveredNodeIds = [
      STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A,
      STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B,
    ];
    const missingNodeIds = [STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_C];

    cluster._nodes.set(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A, {
      id: STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A,
      role: NODE_ROLES.SEED,
      async probeBootstrapReadiness() {
        throw new Error(STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_ERROR);
      },
    });
    cluster._nodes.set(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B, {
      id: STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B,
      role: NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        return {
          status: STARTUP_SNAPSHOT_PROJECTION_TEST_READY_STATUS,
        };
      },
    });
    cluster._nodes.set(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_C, {
      id: STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_C,
      role: NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        return {
          status: STARTUP_SNAPSHOT_PROJECTION_TEST_INACTIVE_STATUS,
          state: STARTUP_SNAPSHOT_PROJECTION_TEST_INACTIVE_STATE,
          reasons: [STARTUP_SNAPSHOT_PROJECTION_TEST_INACTIVE_REASON],
        };
      },
    });
    cluster._probeControlSnapshotCoverage = async () => {
      return {
        completeCoverage: false,
        expectedNodeCount: cluster._nodes.size,
        bestCoverageNodeCount:
          STARTUP_SNAPSHOT_PROJECTION_TEST_PARTIAL_COVERAGE_COUNT,
        selectedNodeId: STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B,
        selectedAdminReady: true,
        selectedReachableBy: STARTUP_SNAPSHOT_PROJECTION_TEST_REACHABILITY_SOURCE,
        selectedObservedNodeIds: coveredNodeIds,
        selectedPublishedActiveNodeIds: coveredNodeIds,
        selectedMissingPublishedNodeIds: missingNodeIds,
        publicationDisagreementByNodeId: {
          [STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A]: [],
          [STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B]: [],
          [STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_C]: missingNodeIds,
        },
        selectedError: null,
        selectedReachabilityError: null,
      };
    };

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_MS,
    );
    const projectedDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId === STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A,
    );
    const uncoveredDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId === STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_C,
    );
    const activeNodeCount = probeResult.nodeDiagnostics.filter(
      (diagnostic) => diagnostic.active === true,
    ).length;

    assert.strictEqual(probeResult.allActive, false);
    assert.strictEqual(probeResult.snapshotCoverage.completeCoverage, false);
    assert.strictEqual(
      activeNodeCount,
      STARTUP_SNAPSHOT_PROJECTION_TEST_PARTIAL_COVERAGE_COUNT,
    );
    assert.strictEqual(projectedDiagnostic.active, true);
    assert.strictEqual(
      projectedDiagnostic.activitySource,
      STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_SOURCE,
    );
    assert.strictEqual(
      projectedDiagnostic.admissionReason,
      STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_REASON,
    );
    assert.strictEqual(
      projectedDiagnostic.sourceError,
      STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_ERROR,
    );
    assert.strictEqual(uncoveredDiagnostic.active, false);
  },
);

test(
  'Unit: _probeClusterActiveState projects startup timeout from control snapshot',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const nodeIds = [
      STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A,
      STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B,
    ];
    const readinessByNodeId = Object.fromEntries(
      nodeIds.map((nodeId) => [
        nodeId,
        {
          dimensions: {
            [STARTUP_SNAPSHOT_PROJECTION_TEST_DIMENSION]: true,
          },
        },
      ]),
    );
    const snapshotRow = {
      nodes: nodeIds,
      controlPlaneDiagnostics: {
        readinessByNodeId,
        publicationConvergence: {
          publicationEpoch:
            STARTUP_SNAPSHOT_PROJECTION_TEST_PUBLICATION_EPOCH,
          publicationStatus:
            STARTUP_SNAPSHOT_PROJECTION_TEST_PUBLICATION_STATUS,
          publishedActiveNodeIds: nodeIds,
          pendingAckNodeIds: [],
          acknowledgedNodeIds: nodeIds,
        },
      },
    };
    const createSnapshotNode = (nodeId) => ({
      id: nodeId,
      async getControlSnapshot() {
        return {rows: [snapshotRow]};
      },
      async getReachabilityDiagnostics() {
        return {
          adminReady: true,
          reachable: true,
          reachableBy:
            STARTUP_SNAPSHOT_PROJECTION_TEST_REACHABILITY_SOURCE,
        };
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._nodes.set(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A, {
      ...createSnapshotNode(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A),
      role: NODE_ROLES.SEED,
      async probeBootstrapReadiness() {
        throw new Error(STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_ERROR);
      },
      async getStatus() {
        throw new Error(
          STARTUP_SNAPSHOT_PROJECTION_TEST_STATUS_TIMEOUT_ERROR,
        );
      },
    });
    cluster._nodes.set(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B, {
      ...createSnapshotNode(STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_B),
      role: NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        return {
          status: STARTUP_SNAPSHOT_PROJECTION_TEST_READY_STATUS,
        };
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_MS,
    );
    const projectedDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId === STARTUP_SNAPSHOT_PROJECTION_TEST_NODE_A,
    );

    assert.strictEqual(probeResult.allActive, true);
    assert.strictEqual(projectedDiagnostic.active, true);
    assert.strictEqual(
      projectedDiagnostic.activitySource,
      STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_SOURCE,
    );
    assert.strictEqual(
      projectedDiagnostic.admissionState,
      STARTUP_SNAPSHOT_PROJECTION_TEST_ADMISSION_STATE,
    );
    assert.strictEqual(
      projectedDiagnostic.admissionReason,
      STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_REASON,
    );
    assert.ok(
      projectedDiagnostic.reasons.includes(
        STARTUP_SNAPSHOT_PROJECTION_TEST_GATE_REASON,
      ),
    );
    assert.strictEqual(
      projectedDiagnostic.sourceError,
      STARTUP_SNAPSHOT_PROJECTION_TEST_TIMEOUT_ERROR,
    );
  },
);
