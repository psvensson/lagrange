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
import {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH = 3;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_CONTROL_SNAPSHOT_SOURCE = 'control_snapshot';
const SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE =
  'discovery_node_coverage_gap';
const SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS = 250;
const SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING = 'pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK =
  'durable_readback_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED = true;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
const SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps admin-ready authority over ' +
  'stronger publication when 102455Z coverage ties';
const SNAPSHOT_REPLAY_TEST_DEFERRED_AUTHORITY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage exposes deferred owner observation ' +
  'for admin-ready stale 102455Z witness';
const SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION =
  'same-coverage active-gate selection should keep the admin-ready authority ' +
  'witness';
const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR =
  'Control snapshot reachability probe timed out for ' +
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
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
const ACTIVE_GATE_REACHABILITY_DELAY_TEST_NAME =
  'Unit: _waitForAllActive keeps terminal reachability delay from selected progress';
const ACTIVE_GATE_REACHABILITY_DELAY_CLUSTER_SIZE = 5;
const ACTIVE_GATE_REACHABILITY_DELAY_CONVERGENCE_MS = 30;
const ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS = Object.freeze([
  'seed-1',
  'joiner-1',
  'joiner-2',
  'joiner-3',
  'joiner-4',
]);
const ACTIVE_GATE_REACHABILITY_DELAY_ERROR =
  'Control snapshot reachability probe timed out for seed-1';
const ACTIVE_GATE_REACHABILITY_DELAY_CAUSE =
  'snapshot_reachability_timeout';
const ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS = 'PUBLISHED';
const ACTIVE_GATE_REACHABILITY_DELAY_RECOVERY_PROTOCOL_STATE =
  'priority_spread_pending';
const ACTIVE_GATE_REACHABILITY_DELAY_ZERO = 0;
const ACTIVE_GATE_REACHABILITY_DELAY_ONE = 1;
const ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT = 2;
const ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT = 3;
const ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT = 3;
const ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT = 5;
const ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP = 10;
const ACTIVE_GATE_REACHABILITY_DELAY_SLEEP_MS = 10;
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE = 'active';
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE = 'inactive';
const ACTIVE_GATE_REACHABILITY_DELAY_STRING_TYPE = 'string';
const ACTIVE_GATE_REACHABILITY_DELAY_TIMEOUT_MESSAGE =
  'Not all nodes reached ACTIVE state within';
const ACTIVE_GATE_REACHABILITY_DELAY_ASSERTION =
  'startup timeout should keep the selected reachability delay evidence';
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

test('Unit: _probeControlSnapshotCoverage keeps snapshot-lane failures explicit',
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

    assert.strictEqual(coverage.completeCoverage, false);
    assert.strictEqual(probeCalls.length, 1);
    assert.strictEqual(
      probeCalls[0]?.lane,
      'snapshot',
      'coverage probe should stay on the snapshot lane',
    );
    assert.match(
      coverage.selectedError,
      /snapshot lane timed out/u,
      'coverage summary should preserve the snapshot-lane timeout',
    );
  });

test(
  'Unit: _probeControlSnapshotCoverage uses the admin-only reachability fast path',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const nodeId = 'node-fast-path';
    const reachabilityError =
      'Control snapshot reachability probe timed out for ' + nodeId;
    const reachabilityProbeCalls = [];

    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: 'active'}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          timeoutMs: options.timeoutMs,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        });
        if (options.skipBootstrapReadiness === true) {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: 'admin_health',
            lastError: null,
          };
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              reachable: false,
              adminReady: false,
              reachableBy: null,
              lastError: reachabilityError,
            });
          }, Number(options.timeoutMs || 0) + 50);
        });
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [nodeId],
            capturedAtMs: 789,
          }],
        };
      },
      async getLogs(_options) {
        return '';
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + 1000,
      [nodeId],
    );

    assert.deepStrictEqual(
      reachabilityProbeCalls.map((call) => call.skipBootstrapReadiness),
      [true],
      'selected coverage should request the admin-only fast path',
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      'fast path should preserve the admin-backed selected witness',
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachabilityError,
      null,
      'fast path should avoid converting bootstrap-readiness latency into a selected reachability timeout',
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      'admin_health',
      'fast path should preserve the admin-health source on the selected witness',
    );
  },
);

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

test('Unit: _probeControlSnapshotCoverage surfaces stringified publication diagnostics from the selected snapshot',
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
                publication_epoch: '18',
                status: 'OPEN',
                published_active_node_ids: JSON.stringify(['node-a', 'node-b']),
                pending_ack_node_ids: JSON.stringify(['node-b']),
                acknowledged_node_ids: JSON.stringify(['node-a']),
                priority_recovery_reason_codes: JSON.stringify([
                  'publication_epoch_pending',
                  'priority_partitions_not_spread',
                ]),
                participation_by_node_id: JSON.stringify({
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
                }),
                participation_state_counts: JSON.stringify({
                  published_active: 1,
                  recovery_pending_publish: 2,
                }),
                membership_lifecycle_summary: JSON.stringify({
                  lifecycleState: 'publish_pending',
                  epochBoundary: 'publication_pending',
                  publishedActiveNodeIds: ['node-a', 'node-b'],
                  projectedServingNodeIds: ['node-a', 'node-b', 'node-c'],
                  locallyEligibleNodeIds: ['node-a', 'node-b', 'node-c'],
                  suspectedOrTransitioningNodeIds: ['node-c'],
                  recoveryProtocolState: 'publication_pending',
                  projection_diagnostics: {
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
                }),
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
    const selectedPublicationConvergence =
      coverage.selectedPublicationConvergence;
    assert.deepStrictEqual(
      {
        publicationEpoch: selectedPublicationConvergence.publicationEpoch,
        publicationStatus: selectedPublicationConvergence.publicationStatus,
        publishedActiveNodeIds:
          selectedPublicationConvergence.publishedActiveNodeIds,
        pendingAckNodeIds: selectedPublicationConvergence.pendingAckNodeIds,
        acknowledgedNodeIds:
          selectedPublicationConvergence.acknowledgedNodeIds,
        recoveryActiveNodeIds:
          selectedPublicationConvergence.recoveryActiveNodeIds,
        recoveryActiveNodeSource:
          selectedPublicationConvergence.recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds:
          selectedPublicationConvergence.missingPublishedRecoveryActiveNodeIds,
        recoveryProtocolState:
          selectedPublicationConvergence.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          selectedPublicationConvergence.priorityRecoveryReasonCodes,
        participationByNodeId:
          selectedPublicationConvergence.participationByNodeId,
        participationStateCounts:
          selectedPublicationConvergence.participationStateCounts,
        priorityPartitionSummary:
          selectedPublicationConvergence.priorityPartitionSummary,
        membershipLifecycleSummary:
          selectedPublicationConvergence.membershipLifecycleSummary,
        projectionDiagnostics:
          selectedPublicationConvergence.projectionDiagnostics,
      },
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
      {
        publicationEpoch:
          coverage.selectedPriorityRecoveryObservation?.publicationEpoch,
        publicationStatus:
          coverage.selectedPriorityRecoveryObservation?.publicationStatus,
        recoveryProtocolState:
          coverage.selectedPriorityRecoveryObservation?.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          coverage.selectedPriorityRecoveryObservation
            ?.priorityRecoveryReasonCodes,
        pendingAckCount:
          coverage.selectedPriorityRecoveryObservation?.pendingAckCount,
        priorityRecoveryBlockedPartitionCount:
          coverage.selectedPriorityRecoveryObservation
            ?.priorityRecoveryBlockedPartitionCount,
      },
      {
        publicationEpoch: 18,
        publicationStatus: 'OPEN',
        recoveryProtocolState: 'publication_pending',
        priorityRecoveryReasonCodes: [
          'priority_partitions_not_spread',
          'publication_epoch_pending',
        ],
        pendingAckCount: 1,
        priorityRecoveryBlockedPartitionCount: 0,
      },
      'coverage probe should preserve the canonical priority-recovery observation for the selected snapshot',
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
        snapshotRevision: null,
        snapshotRevisionState: null,
        snapshotRevisionGap: null,
        snapshotObservationMode: null,
        snapshotObservationState: null,
        snapshotObservationContractState: null,
        snapshotObservationRefreshState: null,
        snapshotObservationNextAction: null,
        snapshotObservationReasonCodes: [],
        snapshotObservationRetryAfterMs: null,
        snapshotRepairDeferred: false,
        activeGateOwnerCohort: null,
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

test(SNAPSHOT_REPLAY_TEST_AUTHORITY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const createNode = (
    nodeId,
    role,
    options,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: options.reachable,
        adminReady: options.adminReady,
        ...(options.reachableBy ? {reachableBy: options.reachableBy} : {}),
        ...(options.reachabilityError ?
          {lastError: options.reachabilityError} :
          {}),
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: options.observedNodeIds,
          capturedAtMs: options.capturedAtMs,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: options.publicationEpoch,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: options.publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: options.publishedActiveNodeIds,
              ...(options.membershipPublicationHandoffOutcome ?
                {
                  membershipPublicationHandoffOutcome:
                    options.membershipPublicationHandoffOutcome,
                } :
                {}),
            },
            ...(options.publicationActiveGateHandoff ?
              {
                publicationActiveGateHandoff:
                  options.publicationActiveGateHandoff,
              } :
              {}),
            ...(options.membershipPublicationHandoffOutcome ?
              {
                membershipPublicationHandoffOutcome:
                  options.membershipPublicationHandoffOutcome,
              } :
              {}),
          },
        }],
      };
    },
    async getLogs() {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      NODE_ROLES.SEED,
      {
        reachable: false,
        adminReady: false,
        reachabilityError: SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
        publicationActiveGateHandoff: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
          reasonCode:
            SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
          nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
          runtimePromotionAllowed:
            SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publishedActiveNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
          missingPublishedNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileCount:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS.length,
        },
        membershipPublicationHandoffOutcome: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
          reasonCode: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
          enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
          retryAfterMs: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
        },
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_LOWER_COVERAGE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
      },
    ),
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const seedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION,
  );
  assert.strictEqual(coverage.selectedSnapshotAdminReady, true);
  assert.deepStrictEqual(
    coverage.selectedPublishedActiveNodeIds,
    SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
  );
  assert.deepStrictEqual(
    coverage.selectedMissingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
  );
  assert.ok(seedWitness);
  assert.strictEqual(
    seedWitness.publicationEpoch,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
  );
  assert.deepStrictEqual(
    seedWitness.publishedActiveNodeIds,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
  );
  assert.deepStrictEqual(
    seedWitness.missingPublishedNodeIds,
    SNAPSHOT_REPLAY_TEST_STRONG_MISSING_NODE_IDS,
  );
});

test(SNAPSHOT_REPLAY_TEST_DEFERRED_AUTHORITY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const createNode = (
    nodeId,
    role,
    options,
  ) => ({
    id: nodeId,
    role,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: options.reachable,
        adminReady: options.adminReady,
        ...(options.reachableBy ? {reachableBy: options.reachableBy} : {}),
        ...(options.reachabilityError ?
          {lastError: options.reachabilityError} :
          {}),
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: options.observedNodeIds,
          capturedAtMs: options.capturedAtMs,
          ...(options.observationMode ?
            {observationMode: options.observationMode} :
            {}),
          ...(options.snapshotObservation ?
            {snapshotObservation: options.snapshotObservation} :
            {}),
          ...(options.adminObservation ?
            {adminObservation: options.adminObservation} :
            {}),
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: options.publicationEpoch,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds: options.publishedActiveNodeIds,
              pendingAckNodeIds: [],
              acknowledgedNodeIds: options.publishedActiveNodeIds,
              ...(options.membershipPublicationHandoffOutcome ?
                {
                  membershipPublicationHandoffOutcome:
                    options.membershipPublicationHandoffOutcome,
                } :
                {}),
            },
            ...(options.publicationActiveGateHandoff ?
              {
                publicationActiveGateHandoff:
                  options.publicationActiveGateHandoff,
              } :
              {}),
            ...(options.membershipPublicationHandoffOutcome ?
              {
                membershipPublicationHandoffOutcome:
                  options.membershipPublicationHandoffOutcome,
              } :
              {}),
          },
        }],
      };
    },
    async getLogs() {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      NODE_ROLES.SEED,
      {
        reachable: false,
        adminReady: false,
        reachabilityError: SNAPSHOT_REPLAY_TEST_SEED_REACHABILITY_ERROR,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STRONG_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STRONG_PUBLISHED_NODE_IDS,
      },
    ),
  );
  cluster._nodes.set(
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    createNode(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      NODE_ROLES.JOINER,
      {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        observedNodeIds: SNAPSHOT_REPLAY_TEST_STALE_OBSERVED_NODE_IDS,
        capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
        observationMode:
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
        snapshotObservation: {
          state:
            CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
          contractState: OWNER_CONTRACT_STATE.DEFERRED,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
          reasonCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
          retryAfterMs: SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
          refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
        },
        adminObservation: {
          repair: {
            deferred: true,
            triggerCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
          },
        },
        publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
        publishedActiveNodeIds:
          SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
        publicationActiveGateHandoff: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
          reasonCode:
            SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
          nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
          runtimePromotionAllowed:
            SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publishedActiveNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_PUBLISHED_NODE_IDS,
          missingPublishedNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileNodeIds:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS,
          pendingReconcileCount:
            SNAPSHOT_REPLAY_TEST_STALE_MISSING_NODE_IDS.length,
        },
        membershipPublicationHandoffOutcome: {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
          reasonCode: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
          enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
          retryAfterMs: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
        },
      },
    ),
  );

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const seedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  );
  const selectedWitness = coverage.probeWitnesses.find((witness) =>
    witness.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  );

  assert.strictEqual(
    coverage.selectedNodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_AUTHORITY_ASSERTION,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationMode,
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationState,
    CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationContractState,
    OWNER_CONTRACT_STATE.DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationNextAction,
    OWNER_CONTRACT_NEXT_ACTION.RETRY,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationRefreshState,
    CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
  );
  assert.deepStrictEqual(
    coverage.selectedSnapshotObservationReasonCodes,
    [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationRetryAfterMs,
    SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
  );
  assert.strictEqual(coverage.selectedSnapshotRepairDeferred, true);
  assert.strictEqual(
    coverage.selectedPublicationActiveGateHandoff?.nextAction,
    SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
  );
  assert.strictEqual(
    coverage.selectedMembershipPublicationHandoffOutcome?.state,
    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  );
  assert.strictEqual(
    coverage.selectedMembershipPublicationHandoffOutcome?.reasonCode,
    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
  );
  assert.ok(seedWitness);
  assert.strictEqual(
    seedWitness.publicationEpoch,
    SNAPSHOT_REPLAY_TEST_STRONG_PUBLICATION_EPOCH,
  );
  assert.ok(selectedWitness);
  assert.strictEqual(
    selectedWitness.snapshotObservationMode,
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
  );
  assert.strictEqual(selectedWitness.snapshotRepairDeferred, true);
  assert.strictEqual(
    selectedWitness.publicationActiveGateHandoff?.nextAction,
    SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
  );
  assert.strictEqual(
    selectedWitness.membershipPublicationHandoffOutcome?.state,
    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
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
          selectedSnapshotObservationMode: 'repair_deferred',
          selectedSnapshotObservationState: 'stale_usable',
          selectedSnapshotObservationContractState: 'pending',
          selectedSnapshotObservationRefreshState: 'idle',
          selectedSnapshotObservationNextAction: 'wait',
          selectedSnapshotObservationReasonCodes: [
            'discovery_node_coverage_gap',
          ],
          selectedSnapshotObservationRetryAfterMs: 250,
          selectedSnapshotRepairDeferred: true,
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
        assert.match(
          error.message,
          /snapshotObservation=repair_deferred\/stale_usable\/pending\/idle\/wait#repairDeferred=true#reasons=discovery_node_coverage_gap#retryAfterMs=250/,
        );
        assert.match(error.message, /missingPublishedIds=joiner-1/);
        assert.equal(
          error?.diagnostics?.noProgress?.currentProgress?.selectedSnapshotNodeId,
          'seed-1',
        );
        assert.deepStrictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedSnapshotObservationReasonCodes,
          ['discovery_node_coverage_gap'],
        );
        assert.strictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedSnapshotRepairDeferred,
          true,
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
        entry.details?.activeGate?.state === 'stalled';
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
        entry.details?.activeGate?.state === 'stalled';
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

test('Unit: _waitForAllActive respects an existing CL-003 gate witness in load mode',
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

    const CL_003 = 'CL-003';
    const CL_003_WITNESS_CLASS =
      'publication_converged_priority_spread_pending';

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
            publicationEpoch: 15,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: 0,
              totalSpreadGap: 0,
            },
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: [],
          selectedError: null,
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
          closureRecordId: CL_003,
          closureWitnessClass: CL_003_WITNESS_CLASS,
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
        entry.details?.activeGate?.state === 'stalled';
    });
    assert.equal(
      waitingStage,
      undefined,
      'an explicit CL-003 witness should complete load-mode ACTIVE wait without a no-progress stall',
    );
    assert.equal(
      collectedFailureLogs,
      false,
      'an explicit CL-003 witness should not trigger failure log collection',
    );
  });

test('Unit: _waitForAllActive derives CL-003 load-mode soft success from ' +
  'selected priority-recovery decision snapshots', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      convergence: 200,
      activeWaitNoProgressMaxAttempts: 2,
    },
  });

  const CL_003 = 'CL-003';
  const CL_003_WITNESS_CLASS =
    'publication_converged_priority_spread_pending';

  cluster._sleep = async () => {};
  let collectedFailureLogs = false;
  cluster._collectFailureLogs = async () => {
    collectedFailureLogs = true;
  };

  const recordedStages = [];
  cluster._recordClusterStage = (stage, details = {}) => {
    recordedStages.push({stage, details});
  };

  for (const [index, nodeId] of ['seed-1', 'joiner-1'].entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness() {
        return {
          status: 503,
          state: 'traffic_blocked',
          reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        };
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
    });
  }

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: true,
      expectedNodeCount: 2,
      bestCoverageNodeCount: 2,
      selectedNodeId: 'seed-1',
      selectedAdminReady: true,
      selectedReachableBy: 'admin_health',
      selectedPublicationConvergence: {
        publicationEpoch: 16,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['seed-1', 'joiner-1'],
        pendingAckNodeIds: [],
        recoveryProtocolState: 'steady_published',
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          totalSpreadGap: 0,
        },
      },
      selectedPublicationConvergenceGate: {
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
        recoveryProtocolState: 'steady_published',
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          totalSpreadGap: 0,
        },
      },
      selectedPriorityRecoveryDecisionSnapshots: {
        closureWitness: {
          closureRecordId: CL_003,
          closureWitnessClass: CL_003_WITNESS_CLASS,
          prioritySpreadPending: false,
          blockedPartitionIds: [],
          blockedPartitionCount: 0,
          unresolvedSemanticStateIds: [],
          satisfiedPartitionIds: ['control_plane_publications-p1'],
          decisionPartitionIds: ['control_plane_publications-p1'],
          refreshedPriorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
        },
        snapshots: [],
      },
      selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
      selectedMissingPublishedNodeIds: [],
      selectedError: null,
    };
  };

  await cluster._waitForAllActive({mode: 'load'});

  const waitingStage = recordedStages.find((entry) => {
    return entry.stage === 'setup.cluster.waiting-active' &&
      entry.details?.activeGate?.state === 'stalled';
  });
  assert.equal(
    waitingStage,
    undefined,
    'selected decision-snapshot closure evidence should complete load-mode ACTIVE wait without a no-progress stall',
  );
  assert.equal(
    collectedFailureLogs,
    false,
    'selected decision-snapshot closure evidence should not trigger failure log collection',
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

test(ACTIVE_GATE_REACHABILITY_DELAY_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_REACHABILITY_DELAY_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
      timeouts: {convergence: ACTIVE_GATE_REACHABILITY_DELAY_CONVERGENCE_MS},
    });

    const buildNodeDiagnostics = () =>
      ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.map((nodeId, index) => ({
      nodeId,
      active: index < ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT,
      state: index < ACTIVE_GATE_REACHABILITY_DELAY_ACTIVE_COUNT ?
        ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE :
        ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE,
      reasons: [],
    }));
    const buildProbeResult = (snapshotCoverage) => ({
      allActive: false,
      nodeDiagnostics: buildNodeDiagnostics(),
      snapshotCoverage,
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: Array.isArray(
          snapshotCoverage?.selectedMissingPublishedNodeIds,
        ) ?
          snapshotCoverage.selectedMissingPublishedNodeIds :
          [],
        recoveryProtocolState:
          ACTIVE_GATE_REACHABILITY_DELAY_RECOVERY_PROTOCOL_STATE,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount:
            ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT,
          totalSpreadGap: ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP,
        },
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        failingInvariantReasonCodes: [],
        passed: true,
      },
    });
    const selectedProgressResult = buildProbeResult({
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.length,
      bestCoverageNodeCount:
        ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
      selectedNodeId:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS[
          ACTIVE_GATE_REACHABILITY_DELAY_ZERO
        ],
      selectedAdminReady: false,
      selectedReachableBy: null,
      selectedReachabilityError: ACTIVE_GATE_REACHABILITY_DELAY_ERROR,
      selectedPublicationConvergence: {
        publicationEpoch: ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT,
        publicationStatus: ACTIVE_GATE_REACHABILITY_DELAY_PUBLICATION_STATUS,
        publishedActiveNodeIds: ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitionCount:
            ACTIVE_GATE_REACHABILITY_DELAY_BLOCKED_PARTITION_COUNT,
          totalSpreadGap: ACTIVE_GATE_REACHABILITY_DELAY_TOTAL_SPREAD_GAP,
        },
      },
      selectedPublishedActiveNodeIds:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
      selectedError: null,
    });
    const regressedProgressResult = buildProbeResult({
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.length,
      bestCoverageNodeCount: ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
      selectedNodeId:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS[
          ACTIVE_GATE_REACHABILITY_DELAY_ONE
        ],
      selectedAdminReady: false,
      selectedReachableBy: null,
      selectedReachabilityError: null,
      selectedPublicationConvergence: null,
      selectedPublishedActiveNodeIds: [],
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_REACHABILITY_DELAY_NODE_IDS.slice(
          ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
        ),
      selectedError: null,
    });
    const probeResults = [
      selectedProgressResult,
      regressedProgressResult,
      regressedProgressResult,
    ];
    let probeIndex = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
    cluster._probeClusterActiveState = async () => {
      const result = probeResults[
        Math.min(
          probeIndex,
          probeResults.length - ACTIVE_GATE_REACHABILITY_DELAY_ONE,
        )
      ];
      probeIndex += ACTIVE_GATE_REACHABILITY_DELAY_ONE;
      return result;
    };
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};
    const originalDateNow = Date.now;
    let fakeNowMs = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {
      fakeNowMs += ACTIVE_GATE_REACHABILITY_DELAY_SLEEP_MS;
    };

    let timeoutError = null;
    try {
      await assert.rejects(
        async () => {
          await cluster._waitForAllActive();
        },
        (error) => {
          timeoutError = error;
          return typeof error?.message ===
            ACTIVE_GATE_REACHABILITY_DELAY_STRING_TYPE &&
            error.message.includes(
              ACTIVE_GATE_REACHABILITY_DELAY_TIMEOUT_MESSAGE,
            );
        },
        ACTIVE_GATE_REACHABILITY_DELAY_ASSERTION,
      );
    } finally {
      Date.now = originalDateNow;
    }

    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.snapshotCoverageNodeCount,
      ACTIVE_GATE_REACHABILITY_DELAY_SELECTED_COVERAGE_COUNT,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.inactiveNodeCount,
      ACTIVE_GATE_REACHABILITY_DELAY_INACTIVE_COUNT,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.readinessDelay?.cause,
      ACTIVE_GATE_REACHABILITY_DELAY_CAUSE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      ACTIVE_GATE_REACHABILITY_DELAY_CAUSE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.error,
      ACTIVE_GATE_REACHABILITY_DELAY_ERROR,
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
