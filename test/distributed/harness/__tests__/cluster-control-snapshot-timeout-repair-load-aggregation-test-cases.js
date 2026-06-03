import {
  assert,
  buildSelectedSnapshotSourceTimeoutError,
  createCluster,
  NODE_ROLES,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_AGGREGATED_HANDOFF_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_DEADLINE_EXTENSION_MS,
  SERVICE_STATUS,
  SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
  SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
  SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH,
  SNAPSHOT_REPLAY_TEST_EMPTY_LOG,
  SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
  SNAPSHOT_REPLAY_TEST_IMAGE,
  SNAPSHOT_REPLAY_TEST_NODE_ID,
  SNAPSHOT_TIMEOUT_REPAIR_ASSERTION,
  test,
} from './cluster-control-snapshot-timeout-repair-fixtures.js';

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_AGGREGATED_HANDOFF_TEST_NAME,
  async () => {
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
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
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
          throw new Error(buildSelectedSnapshotSourceTimeoutError(
            nodeId,
            options.timeoutMs,
          ));
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
        Date.now() +
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_DEADLINE_EXTENSION_MS,
        SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
        {readinessMode: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE},
      );
    } finally {
      Date.now = originalDateNow;
    }

    assert.deepStrictEqual(
      [...new Set(snapshotProbeCalls.map((call) => call.nodeId))].sort(),
      [...SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS].sort(),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_HANDOFF_RETURN_PROBE_COUNT,
    );
    assert.strictEqual(
      coverage.completeCoverage,
      false,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_AGGREGATED_HANDOFF_SELECTION,
    );
    assert.deepStrictEqual(
      [
        ...(coverage.selectedPublicationActiveGateHandoff
          ?.pendingRecoveryNodeIds || []),
      ].sort(),
      [...SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS].sort(),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_AGGREGATED_HANDOFF_SELECTION,
    );
    assert.deepStrictEqual(
      [...coverage.selectedObservedNodeIds].sort(),
      [...SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS].sort(),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_AGGREGATED_HANDOFF_SELECTION,
    );
    assert.strictEqual(
      coverage.bestCoverageNodeCount,
      SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.length,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_AGGREGATED_HANDOFF_SELECTION,
    );
    assert.deepStrictEqual(
      {
        pendingWrites: coverage.selectedControlPlaneOwnerQueueDepth
          ?.pendingWrites,
        pendingWriteGrowthCount:
          coverage.selectedControlPlaneOwnerQueueDepth
            ?.pendingWriteGrowthCount,
        state: coverage.selectedMembershipPublicationHandoffOutcome?.state,
        reasonCode:
          coverage.selectedMembershipPublicationHandoffOutcome?.reasonCode,
        enqueued:
          coverage.selectedMembershipPublicationHandoffOutcome?.enqueued,
        retryAfterMs:
          coverage.selectedMembershipPublicationHandoffOutcome?.retryAfterMs,
      },
      {
        pendingWrites: SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.length,
        pendingWriteGrowthCount: 0,
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
        retryAfterMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
      },
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_AGGREGATED_HANDOFF_QUEUE,
    );
  });
