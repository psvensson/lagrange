import {
  assert,
  createCluster,
  NODE_ROLES,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX,
  SERVICE_STATUS,
  SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
  SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
  SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
  SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
  SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH,
  SNAPSHOT_REPLAY_TEST_EMPTY_LOG,
  SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX,
  SNAPSHOT_REPLAY_TEST_IMAGE,
  SNAPSHOT_REPLAY_TEST_NODE_ID,
  SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX,
  SNAPSHOT_TIMEOUT_REPAIR_ASSERTION,
  test,
} from './cluster-control-snapshot-timeout-repair-fixtures.js';

const SELECTED_SOURCE_PRE_PROBE_ELAPSED_MS = 1235;
const SELECTED_SOURCE_REMAINING_TIMEOUT_MS = 3765;
const SELECTED_SOURCE_HALVED_RETRY_TIMEOUT_MS = 1882;
const SELECTED_SOURCE_ELAPSED_RETRY_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage subtracts controlled elapsed time ' +
  'before halving the selected-source retry';

async function runSelectedSnapshotSourceTimeoutReset({
  elapsedBeforeSelectedProbeMs,
}) {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;
  let currentTimeMs = SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS;

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
        if (
          nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID &&
          lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE
        ) {
          selectedSnapshotLaneReset = true;
        }
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        // The seed fails first. Its awaited reachability observation consumes
        // this controlled budget before the owner probes the remaining nodes.
        if (nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED) {
          currentTimeMs += elapsedBeforeSelectedProbeMs;
        }
        return {
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
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
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID) {
          if (selectedSnapshotLaneReset !== true) {
            throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR);
          }
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS,
            }],
          };
        }
        throw new Error(
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
        );
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const originalDateNow = Date.now;
  // These root TAP cases run serially. Keep the global clock replacement
  // within the awaited owner call, restoring it even when that call rejects.
  Date.now = () => currentTimeMs;
  let coverage;
  try {
    const deadline = Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS;
    coverage = await cluster._probeControlSnapshotCoverage(
      deadline,
      SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
    );
  } finally {
    Date.now = originalDateNow;
  }
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

  return {coverage, resetCalls, selectedCalls, snapshotProbeCalls};
}

function assertSelectedSnapshotSourceTimeoutReset({
  coverage,
  resetCalls,
  selectedCalls,
  snapshotProbeCalls,
}, expectedInitialTimeoutMs, expectedRetryTimeoutMs) {
  assert.strictEqual(
    snapshotProbeCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].nodeId,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  );
  assert.strictEqual(
    snapshotProbeCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS,
  );
  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_RETRY_SOURCE,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_RETRY_RECOVERY,
  );
  assert.deepStrictEqual(
    resetCalls,
    [{
      nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
    }],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_LANE_RESET,
  );
  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS.length,
  );
  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    expectedInitialTimeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_TIMEOUT_FLOOR,
  );
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs <
      selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_TIMEOUT_FLOOR,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    expectedRetryTimeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_SCALED_TIMEOUT,
  );
  assert.ok(
    snapshotProbeCalls.every((call) =>
      call.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE &&
      call.forceRepair === false &&
      call.forceAuthoritativeRepair === false,
    ),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.RETRY_SNAPSHOT_LANE,
  );
}

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME, async () => {
  const result = await runSelectedSnapshotSourceTimeoutReset({
    elapsedBeforeSelectedProbeMs: 0,
  });
  assertSelectedSnapshotSourceTimeoutReset(
    result,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
  );
});

test(SELECTED_SOURCE_ELAPSED_RETRY_TEST_NAME, async () => {
  const result = await runSelectedSnapshotSourceTimeoutReset({
    elapsedBeforeSelectedProbeMs: SELECTED_SOURCE_PRE_PROBE_ELAPSED_MS,
  });
  assertSelectedSnapshotSourceTimeoutReset(
    result,
    SELECTED_SOURCE_REMAINING_TIMEOUT_MS,
    SELECTED_SOURCE_HALVED_RETRY_TIMEOUT_MS,
  );
});

