import {
  assert,
  buildSelectedSnapshotSourceTimeoutError,
  createCluster,
  NODE_ROLES,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX,
  SERVICE_STATUS,
  SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
  SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
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

const OWNER_RECOVERY_LATE_FLOOR_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage keeps owner-recovery retry floor ' +
  'after late load selected-source timeout';
const OWNER_RECOVERY_LATE_INITIAL_TIMEOUT_MS = 100;

test(OWNER_RECOVERY_LATE_FLOOR_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(_lane) {},
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        const adminReady =
          nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
        return {
          reachable: adminReady,
          adminReady,
          reachableBy: adminReady ?
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
        });
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID) {
          throw new Error(buildSelectedSnapshotSourceTimeoutError(
            nodeId,
            options.timeoutMs,
          ));
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
  Date.now = () => SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS;
  let coverage;
  try {
    coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + OWNER_RECOVERY_LATE_INITIAL_TIMEOUT_MS,
      SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
      {readinessMode: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE},
    );
  } finally {
    Date.now = originalDateNow;
  }
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    OWNER_RECOVERY_LATE_INITIAL_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_FIRST_TIMEOUT,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_TIMEOUT,
  );
  assert.strictEqual(
    coverage.selectedSnapshotTimeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_TIMEOUT,
  );
  assert.strictEqual(
    coverage.selectedSnapshotObservationRetryAfterMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_OBSERVATION,
  );
  assert.strictEqual(
    coverage.selectedMembershipPublicationHandoffOutcome?.retryAfterMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
      .STARTUP_RETRY_EXHAUSTED_OWNER_QUEUE,
  );
});
