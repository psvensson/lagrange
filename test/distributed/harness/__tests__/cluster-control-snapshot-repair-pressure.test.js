import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const TEST_CLUSTER_SIZE = 5;
const TEST_LATE_DEADLINE_EXTENSION_MS = 1;
const TEST_DEADLINE_EXTENSION_MS = 5000;
const TEST_INITIAL_TIMEOUT_MS = 100;
const TEST_RETRY_TIMEOUT_MS = 2500;
const TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const TEST_IMAGE = 'distributed-db:test';
const TEST_EMPTY_LOG = '';
const TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const TEST_SNAPSHOT_LANE = 'snapshot';
const TEST_CAPTURED_AT_MS = 1777976842000;
const TEST_NAME =
  'Unit: _probeControlSnapshotCoverage retries non-forced snapshot after ' +
  'authoritative repair participant connection close';
const TEST_SELECTED_TIMEOUT_RETRY_NAME =
  'Unit: _probeControlSnapshotCoverage retries selected snapshot timeout with ' +
  'normal probe budget';
const TEST_SELECTED_TIMEOUT_RETRY_WITHOUT_RESET_NAME =
  'Unit: _probeControlSnapshotCoverage retries selected snapshot timeout ' +
  'without requiring reset hook';
const TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const TEST_EXPECTED_NODE_IDS = Object.freeze([
  TEST_NODE_ID.SEED,
  TEST_NODE_ID.BASELINE,
  TEST_NODE_ID.ADMIN_READY_STALE,
  TEST_NODE_ID.STRONG_EXTRA,
  TEST_NODE_ID.STALE_EXTRA,
]);
const TEST_SELECTED_NODE_ID = TEST_NODE_ID.BASELINE;
const TEST_REPAIR_CONNECTION_CLOSED_ERROR =
  'Admin API query failed for node ' +
  TEST_SELECTED_NODE_ID +
  ' on lane snapshot: Authoritative control snapshot repair failed: ' +
  'nodes:Connection to node ' +
  TEST_NODE_ID.SEED +
  ' closed';
const TEST_SELECTED_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  TEST_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  TEST_INITIAL_TIMEOUT_MS +
  'ms';
const TEST_UNSELECTED_ERROR_PREFIX = 'snapshot lane unavailable for ';
const TEST_RECOVERY_ASSERTION =
  'non-forced retry should recover selected snapshot coverage';
const TEST_SELECTED_ERROR_ASSERTION =
  'participant connection-closed repair pressure should not pin coverage at ' +
  'zero when a local snapshot succeeds';
const TEST_READINESS_ASSERTION =
  'retry proof should keep startup readiness out of the snapshot owner ' +
  'decision';
const TEST_RETRY_BUDGET_ASSERTION =
  'admin-ready timeout retry should use the normal snapshot probe budget';
const TEST_RESET_ASSERTION =
  'selected timeout retry should reset only the selected snapshot lane';
const TEST_NO_RESET_RETRY_ASSERTION =
  'selected timeout retry should not require a reset hook';

test(TEST_NAME, async () => {
  const cluster = createCluster({
    size: TEST_CLUSTER_SIZE,
    docker: {socketPath: TEST_DOCKER_SOCKET_PATH},
    image: TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const reachabilityProbeCalls = [];

  for (const nodeId of TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: nodeId === TEST_SELECTED_NODE_ID ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          nodeId,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        });
        return {
          reachable: nodeId === TEST_SELECTED_NODE_ID,
          adminReady: nodeId === TEST_SELECTED_NODE_ID,
          reachableBy:
            nodeId === TEST_SELECTED_NODE_ID ?
              TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === TEST_SELECTED_NODE_ID) {
          if (options.forceRepair === true) {
            throw new Error(TEST_REPAIR_CONNECTION_CLOSED_ERROR);
          }
          return {
            rows: [{
              nodes: [...TEST_EXPECTED_NODE_IDS],
              capturedAtMs: TEST_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(TEST_UNSELECTED_ERROR_PREFIX + nodeId);
      },
      async getLogs(_options) {
        return TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + TEST_DEADLINE_EXTENSION_MS,
    TEST_EXPECTED_NODE_IDS,
    {forceRepair: true},
  );
  const selectedWitness = coverage.probeWitnesses.find((witness) => {
    return witness.nodeId === TEST_SELECTED_NODE_ID;
  });

  assert.strictEqual(coverage.completeCoverage, true);
  assert.strictEqual(coverage.forceRepair, true);
  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    TEST_EXPECTED_NODE_IDS.length,
    TEST_RECOVERY_ASSERTION,
  );
  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    TEST_SELECTED_NODE_ID,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    TEST_SELECTED_ERROR_ASSERTION,
  );
  assert.strictEqual(selectedWitness?.snapshotQuerySucceeded, true);
  assert.deepStrictEqual(
    snapshotProbeCalls,
    [
      {
        nodeId: TEST_SELECTED_NODE_ID,
        lane: TEST_SNAPSHOT_LANE,
        forceRepair: true,
        forceAuthoritativeRepair: false,
      },
      {
        nodeId: TEST_SELECTED_NODE_ID,
        lane: TEST_SNAPSHOT_LANE,
        forceRepair: false,
        forceAuthoritativeRepair: false,
      },
    ],
  );
  assert.ok(
    reachabilityProbeCalls.every((call) =>
      call.skipBootstrapReadiness === true,
    ),
    TEST_READINESS_ASSERTION,
  );
});

test(TEST_SELECTED_TIMEOUT_RETRY_NAME, async () => {
  const cluster = createCluster({
    size: TEST_CLUSTER_SIZE,
    docker: {socketPath: TEST_DOCKER_SOCKET_PATH},
    image: TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;

  for (const nodeId of TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: nodeId === TEST_SELECTED_NODE_ID ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
        if (nodeId === TEST_SELECTED_NODE_ID && lane === TEST_SNAPSHOT_LANE) {
          selectedSnapshotLaneReset = true;
        }
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        return {
          reachable: nodeId === TEST_SELECTED_NODE_ID,
          adminReady: nodeId === TEST_SELECTED_NODE_ID,
          reachableBy:
            nodeId === TEST_SELECTED_NODE_ID ?
              TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === TEST_SELECTED_NODE_ID) {
          if (
            selectedSnapshotLaneReset !== true ||
            options.timeoutMs < TEST_RETRY_TIMEOUT_MS
          ) {
            throw new Error(TEST_SELECTED_TIMEOUT_ERROR);
          }
          return {
            rows: [{
              nodes: [...TEST_EXPECTED_NODE_IDS],
              capturedAtMs: TEST_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(TEST_UNSELECTED_ERROR_PREFIX + nodeId);
      },
      async getLogs(_options) {
        return TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + TEST_LATE_DEADLINE_EXTENSION_MS,
    TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(coverage.completeCoverage, true);
  assert.strictEqual(
    coverage.selectedSnapshotTimeoutMs,
    TEST_RETRY_TIMEOUT_MS,
    TEST_RETRY_BUDGET_ASSERTION,
  );
  assert.deepStrictEqual(
    resetCalls,
    [{
      nodeId: TEST_SELECTED_NODE_ID,
      lane: TEST_SNAPSHOT_LANE,
    }],
    TEST_RESET_ASSERTION,
  );
  assert.deepStrictEqual(
    snapshotProbeCalls,
    [
      {
        nodeId: TEST_SELECTED_NODE_ID,
        timeoutMs: TEST_INITIAL_TIMEOUT_MS,
        lane: TEST_SNAPSHOT_LANE,
        forceRepair: false,
        forceAuthoritativeRepair: false,
      },
      {
        nodeId: TEST_SELECTED_NODE_ID,
        timeoutMs: TEST_RETRY_TIMEOUT_MS,
        lane: TEST_SNAPSHOT_LANE,
        forceRepair: false,
        forceAuthoritativeRepair: false,
      },
    ],
  );
});

test(TEST_SELECTED_TIMEOUT_RETRY_WITHOUT_RESET_NAME, async () => {
  const cluster = createCluster({
    size: TEST_CLUSTER_SIZE,
    docker: {socketPath: TEST_DOCKER_SOCKET_PATH},
    image: TEST_IMAGE,
  });
  const snapshotProbeCalls = [];

  for (const nodeId of TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: nodeId === TEST_SELECTED_NODE_ID ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        return {
          reachable: nodeId === TEST_SELECTED_NODE_ID,
          adminReady: nodeId === TEST_SELECTED_NODE_ID,
          reachableBy:
            nodeId === TEST_SELECTED_NODE_ID ?
              TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
          lane: options.lane,
          forceRepair: options.forceRepair === true,
          forceAuthoritativeRepair:
            options.forceAuthoritativeRepair === true,
        });
        if (nodeId === TEST_SELECTED_NODE_ID) {
          if (options.timeoutMs < TEST_RETRY_TIMEOUT_MS) {
            throw new Error(TEST_SELECTED_TIMEOUT_ERROR);
          }
          return {
            rows: [{
              nodes: [...TEST_EXPECTED_NODE_IDS],
              capturedAtMs: TEST_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(TEST_UNSELECTED_ERROR_PREFIX + nodeId);
      },
      async getLogs(_options) {
        return TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + TEST_LATE_DEADLINE_EXTENSION_MS,
    TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(
    coverage.completeCoverage,
    true,
    TEST_NO_RESET_RETRY_ASSERTION,
  );
  assert.strictEqual(
    coverage.selectedSnapshotTimeoutMs,
    TEST_RETRY_TIMEOUT_MS,
    TEST_RETRY_BUDGET_ASSERTION,
  );
  assert.deepStrictEqual(
    snapshotProbeCalls,
    [
      {
        nodeId: TEST_SELECTED_NODE_ID,
        timeoutMs: TEST_INITIAL_TIMEOUT_MS,
        lane: TEST_SNAPSHOT_LANE,
        forceRepair: false,
        forceAuthoritativeRepair: false,
      },
      {
        nodeId: TEST_SELECTED_NODE_ID,
        timeoutMs: TEST_RETRY_TIMEOUT_MS,
        lane: TEST_SNAPSHOT_LANE,
        forceRepair: false,
        forceAuthoritativeRepair: false,
      },
    ],
  );
});
