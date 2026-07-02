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
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';
import './cluster-active-gate-startup-owner-handoff-test-cases.js';

const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_CONTROL_SNAPSHOT_SOURCE = 'control_snapshot';
const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const SNAPSHOT_REACHABILITY_TIMEOUT_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID;
const SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REACHABILITY_TIMEOUT_PUBLISHED_NODE_IDS =
  SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS;
const SNAPSHOT_REACHABILITY_TIMEOUT_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_TEST_NAME =
  'Unit: _probeClusterActiveState classifies contact-seed partial startup coverage';
const ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS = 5000;
const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_STATUS = 200;
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATUS = 503;
const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_PHASE = 'JOIN_READY';
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_PHASE = 'CONTROL_READY';
const ACTIVE_GATE_PARTIAL_RESIDUAL_ACTIVE_STATE = 'active';
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATE = 'warming';
const ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_REASON =
  'BOOTSTRAP_NOT_READY';
const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH = 3;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_COVERAGE = 3;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_ACTIVE = 3;
const ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_INACTIVE = 2;
const ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const ACTIVE_GATE_PARTIAL_RESIDUAL_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_MISSING_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLISHED_ACTIVE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_READY_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_INACTIVE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_CAPTURED_AT_MS =
  SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS;
const ACTIVE_GATE_PARTIAL_RESIDUAL_STALE_CAPTURED_AT_MS =
  SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS;
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
test(
  'Unit: _probeControlSnapshotCoverage keeps diagnostics-backed partial snapshot clean',
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const reachabilityProbeCalls = [];
    const snapshotByNodeId = new Map([
      [
        SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID,
        {
          nodes: SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS,
          capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds:
                SNAPSHOT_REACHABILITY_TIMEOUT_PUBLISHED_NODE_IDS,
              pendingAckNodeIds: [],
              acknowledgedNodeIds:
                SNAPSHOT_REACHABILITY_TIMEOUT_PUBLISHED_NODE_IDS,
            },
          },
        },
      ],
      [
        SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
        {
          nodes: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
          capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds:
                SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
              pendingAckNodeIds: [],
              acknowledgedNodeIds:
                SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
            },
          },
        },
      ],
    ]);

    for (const [index, nodeId] of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.entries()) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          reachabilityProbeCalls.push(nodeId);
          if (nodeId === SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID) {
            throw new Error(SNAPSHOT_REACHABILITY_TIMEOUT_ERROR);
          }
          return {
            reachable: index % 2 === 0,
            adminReady: false,
            reachableBy: null,
            lastError: null,
          };
        },
        async getControlSnapshot() {
          const snapshot = snapshotByNodeId.get(nodeId);
          if (!snapshot) {
            throw new Error('snapshot lane unavailable for ' + nodeId);
          }
          return {rows: [snapshot]};
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
    );

    assert.strictEqual(
      coverage.completeCoverage,
      false,
      'selected witness should preserve the current partial 3/5 coverage shape',
    );
    assert.strictEqual(
      coverage.bestCoverageNodeCount,
      SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS.length,
      'selected witness should keep the best observed coverage count',
    );
    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID,
      'diagnostics-backed 35a891... witness should remain selected',
    );
    assert.deepStrictEqual(
      coverage.selectedObservedNodeIds,
      SNAPSHOT_REACHABILITY_TIMEOUT_OBSERVED_NODE_IDS,
      'selected witness should freeze the observed partial-coverage cohort',
    );
    assert.deepStrictEqual(
      coverage.selectedMissingPublishedNodeIds,
      SNAPSHOT_REACHABILITY_TIMEOUT_MISSING_NODE_IDS,
      'selected witness should keep publication ACK debt separate from coverage',
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      'control snapshot diagnostics should provide the admin-backed witness',
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      SNAPSHOT_REPLAY_TEST_CONTROL_SNAPSHOT_SOURCE,
      'selected witness should identify control snapshot diagnostics as source',
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachabilityError,
      null,
      'redundant reachability timeout should not poison a diagnostics-backed snapshot',
    );
    assert.deepStrictEqual(
      reachabilityProbeCalls.filter(
        (nodeId) => nodeId === SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID,
      ),
      [SNAPSHOT_REACHABILITY_TIMEOUT_SELECTED_NODE_ID],
      'diagnostics-backed selected snapshot should preserve the timeout probe',
    );
  },
);

test(ACTIVE_GATE_PARTIAL_RESIDUAL_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const buildReadiness = (nodeId) => {
    const active =
      ACTIVE_GATE_PARTIAL_RESIDUAL_READY_NODE_IDS.includes(nodeId);
    return {
      status: active ?
        ACTIVE_GATE_PARTIAL_RESIDUAL_READY_STATUS :
        ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATUS,
      phase: active ?
        ACTIVE_GATE_PARTIAL_RESIDUAL_READY_PHASE :
        ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_PHASE,
      state: active ?
        ACTIVE_GATE_PARTIAL_RESIDUAL_ACTIVE_STATE :
        ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_STATE,
      reasons: active ? [] : [ACTIVE_GATE_PARTIAL_RESIDUAL_BLOCKED_REASON],
    };
  };
  const buildSnapshotRow = (nodeId) => ({
    nodes: ACTIVE_GATE_PARTIAL_RESIDUAL_OBSERVED_NODE_IDS,
    capturedAtMs:
      nodeId === ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_NODE_ID ?
        ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_CAPTURED_AT_MS :
        ACTIVE_GATE_PARTIAL_RESIDUAL_STALE_CAPTURED_AT_MS,
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publishedActiveNodeIds:
          ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLISHED_ACTIVE_NODE_IDS,
        pendingAckNodeIds: [],
        acknowledgedNodeIds: ACTIVE_GATE_PARTIAL_RESIDUAL_OBSERVED_NODE_IDS,
      },
    },
  });

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        return buildReadiness(nodeId);
      },
      async getReachabilityDiagnostics() {
        const active =
          ACTIVE_GATE_PARTIAL_RESIDUAL_READY_NODE_IDS.includes(nodeId);
        return {
          reachable: active,
          adminReady: active,
          reachableBy:
            active === true ? SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE : null,
          lastError: null,
        };
      },
      async getControlSnapshot() {
        if (
          nodeId === ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_NODE_ID ||
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE
        ) {
          return {rows: [buildSnapshotRow(nodeId)]};
        }
        throw new Error('snapshot lane unavailable for ' + nodeId);
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const probeResult = await cluster._probeClusterActiveState(
    Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
  );

  assert.strictEqual(
    probeResult.allActive,
    false,
    'clean partial startup coverage must stay blocked while nodes are inactive',
  );
  assert.strictEqual(
    probeResult.snapshotCoverage.selectedSnapshotNodeId,
    ACTIVE_GATE_PARTIAL_RESIDUAL_SELECTED_NODE_ID,
    'the current residual selected node should remain the selected witness',
  );
  assert.strictEqual(
    probeResult.snapshotCoverage.bestCoverageNodeCount,
    ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_COVERAGE,
    'contact-seed residual coverage should remain partial at 3/5',
  );
  assert.deepStrictEqual(
    probeResult.snapshotCoverage.selectedMissingPublishedNodeIds,
    ACTIVE_GATE_PARTIAL_RESIDUAL_MISSING_PUBLISHED_NODE_IDS,
    'selected publication debt should remain diagnostics, not readiness',
  );
  assert.strictEqual(
    probeResult.nodeDiagnostics.filter((diagnostic) =>
      diagnostic.active === true).length,
    ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_ACTIVE,
    'the active probe should preserve the observed 3/5 active cohort',
  );
  assert.strictEqual(
    probeResult.nodeDiagnostics.filter((diagnostic) =>
      diagnostic.active !== true).length,
    ACTIVE_GATE_PARTIAL_RESIDUAL_EXPECTED_INACTIVE,
    'the active probe should preserve the two real inactive nodes',
  );
  assert.deepStrictEqual(
    probeResult.nodeDiagnostics
      .filter((diagnostic) => diagnostic.active !== true)
      .map((diagnostic) => diagnostic.nodeId),
    ACTIVE_GATE_PARTIAL_RESIDUAL_INACTIVE_NODE_IDS,
    'the residual should preserve the contact-seed inactive joiner cohort',
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
