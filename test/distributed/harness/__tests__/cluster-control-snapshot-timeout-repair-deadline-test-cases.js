/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {
  assert,
  buildSelectedSnapshotSourceTimeoutError,
  createCluster,
  NODE_ROLES,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_EXPIRED_REMAINING_WITNESS_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX,
  SERVICE_STATUS,
  SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
  SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
  SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH,
  SNAPSHOT_REPLAY_TEST_EMPTY_LOG,
  SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  SNAPSHOT_REPLAY_TEST_IMAGE,
  SNAPSHOT_REPLAY_TEST_NODE_ID,
  SNAPSHOT_TIMEOUT_REPAIR_ASSERTION,
  test,
} from './cluster-control-snapshot-timeout-repair-fixtures.js';

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_EXPIRED_REMAINING_WITNESS_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const snapshotProbeCalls = [];
    const querySuccessNodeId = SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA;
    let currentTimeMs = SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS;

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
          const selectedSource = nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
          return {
            reachable: selectedSource,
            adminReady: selectedSource,
            reachableBy: selectedSource ?
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
          if (nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED) {
            currentTimeMs += options.timeoutMs;
            throw new Error(buildSelectedSnapshotSourceTimeoutError(
              nodeId,
              options.timeoutMs,
            ));
          }
          if (nodeId === querySuccessNodeId) {
            return {
              rows: [{
                nodes: SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
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
    Date.now = () => currentTimeMs;
    let coverage;
    try {
      coverage = await cluster._probeControlSnapshotCoverage(
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS +
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS,
        SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
        {readinessMode: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE},
      );
    } finally {
      Date.now = originalDateNow;
    }

    const querySuccessCall = snapshotProbeCalls.find((call) =>
      call.nodeId === querySuccessNodeId);

    assert.ok(
      querySuccessCall,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .LOAD_EXPIRED_REMAINING_WITNESS_SELECTION,
    );
    assert.strictEqual(
      querySuccessCall.timeoutMs,
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .LOAD_EXPIRED_REMAINING_WITNESS_TIMEOUT,
    );
    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      querySuccessNodeId,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .LOAD_EXPIRED_REMAINING_WITNESS_SELECTION,
    );
    assert.strictEqual(
      coverage.completeCoverage,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .LOAD_EXPIRED_REMAINING_WITNESS_SELECTION,
    );
  });
