import {
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
  assert,
  buildSelectedSnapshotSourceTimeoutError,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
  createCluster,
  NODE_ROLES,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_DRIFT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_MIN_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LATE_RETRY_FLOOR_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_HANDOFF_RETURN_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_MODE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_EXHAUSTED_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_DEADLINE_EXTENSION_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_INITIAL_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_ERROR,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_AFTER_TOLERANCE_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_EXHAUSTED_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_REASON,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_TEST_NAME,
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
  SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED_FALSE,
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECONCILE_COUNT,
  SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECOVERY_COUNT,
  SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
  SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
  SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
  SNAPSHOT_REPLAY_TEST_IMAGE,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_CLUSTER_SIZE,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_DEADLINE_EXTENSION_MS,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS,
  SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_TEST_NAME,
  SNAPSHOT_REPLAY_TEST_NODE_ID,
  SNAPSHOT_REPLAY_TEST_OWNER_QUEUE_PENDING_WRITES,
  SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX,
  SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT,
  SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE,
  SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_CAPTURED_AT_MS,
  SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_ERROR,
  SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_PATTERN,
  SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_TEST_NAME,
  SNAPSHOT_TIMEOUT_REPAIR_ASSERTION,
  test,
} from './cluster-control-snapshot-timeout-repair-fixtures.js';
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
test(SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_TEST_NAME,
async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  const snapshotProbeCalls = [];
  const reachabilityProbeCalls = [];
  for (const [index, nodeId] of SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS.entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
        reachabilityProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        return {
          reachable: true,
          adminReady: true,
          reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
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
            capturedAtMs:
              SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS + index,
          }],
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS,
  );

  assert.strictEqual(
    snapshotProbeCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LATE_PROBES_INSPECT_REMAINING,
  );
  assert.ok(
    snapshotProbeCalls.every((call) =>
      call.timeoutMs >= SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_TIMEOUT_FLOOR,
  );
  assert.ok(
    reachabilityProbeCalls.every((call) =>
      call.timeoutMs >= SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.REACHABILITY_TIMEOUT_FLOOR,
  );
  assert.ok(
    coverage.selectedSnapshotTimeoutMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_SNAPSHOT_TIMEOUT_FLOOR,
  );
  assert.ok(
    coverage.selectedReachabilityTimeoutMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_REACHABILITY_TIMEOUT_FLOOR,
  );
});

test(SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });

    const probeCalls = [];
    cluster._nodes.set(SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A, {
      id: SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A,
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getControlSnapshot(options) {
        probeCalls.push(options);
        if (options?.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE) {
          throw new Error(SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_ERROR);
        }
        return {
          rows: [{
            nodes: [SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A],
            capturedAtMs:
              SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_CAPTURED_AT_MS,
          }],
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      [SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A],
    );

    assert.strictEqual(coverage.completeCoverage, false);
    assert.strictEqual(probeCalls.length, SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT);
    assert.strictEqual(
      probeCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX]?.lane,
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_LANE,
    );
    assert.match(
      coverage.selectedError,
      SNAPSHOT_REPLAY_TEST_SNAPSHOT_LANE_FAILURE_PATTERN,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_LANE_TIMEOUT,
    );
  });

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const reachabilityProbeCalls = [];

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
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
          reachable:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
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
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID) {
          throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR);
        }
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID) {
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS,
              capturedAtMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
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

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_EMPTY_NODE_IDS.length,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_REPORT_SHAPE,
  );
  assert.strictEqual(
    coverage.forceRepair,
    false,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_SOURCE_BEFORE_REPAIR,
  );
  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.QUERY_SUCCESS_SELECTION,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.QUERY_SUCCESS_TIMEOUT_CLEAR,
  );
  assert.ok(
    snapshotProbeCalls.every((call) =>
      call.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE &&
      call.forceRepair === false &&
      call.forceAuthoritativeRepair === false,
    ),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.NORMAL_SNAPSHOT_SOURCE_PATH,
  );
  assert.ok(
    reachabilityProbeCalls.every((call) =>
      call.skipBootstrapReadiness === true,
    ),
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.INHERITED_READINESS_EXCLUDED,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;

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

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

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
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs >=
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_MIN_MS &&
      selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs <=
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_TIMEOUT_FLOOR,
  );
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs <
      selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_TIMEOUT_FLOOR,
  );
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs >=
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS -
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_INITIAL_PROBE_DRIFT_MS &&
      selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs <=
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
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
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_EXHAUSTED_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];

  for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role:
        nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
          NODE_ROLES.SEED :
          NODE_ROLES.JOINER,
      _resetAdminSocket(lane) {
        resetCalls.push({nodeId, lane});
      },
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics(options = {}) {
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

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID;
  });

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_SOURCE,
  );
  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
  );
  assert.strictEqual(
    coverage.selectedSnapshotTimeoutMs,
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_TIMEOUT,
  );
  const selectedRetryTimeoutPattern = new RegExp(
    String(selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs),
    'u',
  );
  assert.match(
    coverage.selectedError,
    selectedRetryTimeoutPattern,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_ERROR,
  );
  assert.deepStrictEqual(
    resetCalls,
    [
      {
        nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
      },
      {
        nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
      },
    ],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SELECTED_LANE_RESET,
  );
  assert.deepStrictEqual(
    {
      mode: coverage.selectedSnapshotObservationMode,
      state: coverage.selectedSnapshotObservationState,
      contractState: coverage.selectedSnapshotObservationContractState,
      refreshState: coverage.selectedSnapshotObservationRefreshState,
      nextAction: coverage.selectedSnapshotObservationNextAction,
    },
    {
      mode: ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
      state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    },
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_OBSERVATION,
  );
  assert.ok(
    coverage.selectedSnapshotObservationRetryAfterMs >=
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS -
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_AFTER_TOLERANCE_MS &&
      coverage.selectedSnapshotObservationRetryAfterMs <=
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_OBSERVATION,
  );
  assert.deepStrictEqual(
    coverage.selectedSnapshotObservationReasonCodes,
    [SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_REASON],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_REASON,
  );
  assert.strictEqual(
    coverage.selectedSnapshotRepairDeferred,
    true,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_REPAIR,
  );
  assert.deepStrictEqual(
    {
      state: coverage.selectedPublicationActiveGateHandoff?.state,
      reasonCode:
        coverage.selectedPublicationActiveGateHandoff?.reasonCode,
      nextAction:
        coverage.selectedPublicationActiveGateHandoff?.nextAction,
      runtimePromotionAllowed:
        coverage.selectedPublicationActiveGateHandoff
          ?.runtimePromotionAllowed,
      pendingRecoveryNodeIds:
        coverage.selectedPublicationActiveGateHandoff
          ?.pendingRecoveryNodeIds,
      pendingRecoveryCount:
        coverage.selectedPublicationActiveGateHandoff?.pendingRecoveryCount,
      pendingReconcileCount:
        coverage.selectedPublicationActiveGateHandoff?.pendingReconcileCount,
    },
    {
      state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
      reasonCode:
        SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
      nextAction:
        SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
      runtimePromotionAllowed:
        SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
      pendingRecoveryNodeIds: [
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      ],
      pendingRecoveryCount:
        SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECOVERY_COUNT,
      pendingReconcileCount:
        SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECONCILE_COUNT,
    },
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_HANDOFF,
  );
  assert.deepStrictEqual(
    {
      bestCoverageNodeCount: coverage.bestCoverageNodeCount,
      selectedObservedNodeIds: coverage.selectedObservedNodeIds,
    },
    {
      bestCoverageNodeCount:
        SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECOVERY_COUNT,
      selectedObservedNodeIds: [
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      ],
    },
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
      .STARTUP_RETRY_EXHAUSTED_RECOVERY_PROGRESS,
  );
  assert.deepStrictEqual(
    {
      pendingWrites: coverage.selectedControlPlaneOwnerQueueDepth
        ?.pendingWrites,
      state: coverage.selectedMembershipPublicationHandoffOutcome?.state,
      reasonCode:
        coverage.selectedMembershipPublicationHandoffOutcome?.reasonCode,
      enqueued:
        coverage.selectedMembershipPublicationHandoffOutcome?.enqueued,
      retryAfterMs:
        coverage.selectedMembershipPublicationHandoffOutcome?.retryAfterMs,
    },
    {
      pendingWrites: SNAPSHOT_REPLAY_TEST_OWNER_QUEUE_PENDING_WRITES,
      state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
      reasonCode:
        SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
      enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED_FALSE,
      retryAfterMs: coverage.selectedSnapshotObservationRetryAfterMs,
    },
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
      .STARTUP_RETRY_EXHAUSTED_OWNER_QUEUE,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LATE_RETRY_FLOOR_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];

  for (const [index, nodeId] of SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS.entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX ?
        NODE_ROLES.SEED :
        NODE_ROLES.JOINER,
      _resetAdminSocket(_lane) {},
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
      },
      async getReachabilityDiagnostics() {
        const selectedSource =
          nodeId === SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A;
        return {
          reachable: selectedSource,
          adminReady: selectedSource,
          reachableBy: selectedSource ?
            SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
            null,
          lastError: null,
        };
      },
      async getControlSnapshot(options = {}) {
        snapshotProbeCalls.push({
          nodeId,
          timeoutMs: options.timeoutMs,
        });
        if (nodeId === SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A) {
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

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_IDS,
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_NODE_A;
  });

  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
  );
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.SNAPSHOT_TIMEOUT_FLOOR,
  );
  assert.ok(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_LATE_TIMEOUT_FLOOR,
  );
  assert.strictEqual(
    coverage.selectedSnapshotTimeoutMs,
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_TIMEOUT,
  );
  assert.ok(
    coverage.selectedSnapshotObservationRetryAfterMs >=
      SNAPSHOT_REPLAY_TEST_LATE_TIMEOUT_FLOOR_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_LATE_TIMEOUT_FLOOR,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  const snapshotProbeCalls = [];
  const resetCalls = [];
  let selectedSnapshotLaneReset = false;

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
  Date.now = () => SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS;
  let coverage;
  try {
    coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
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
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_SOURCE,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_RECOVERY,
  );
  assert.strictEqual(
    selectedCalls.length,
    SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_COUNT,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_INITIAL_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_FIRST_TIMEOUT,
  );
  assert.strictEqual(
    selectedCalls[SNAPSHOT_REPLAY_TEST_RETRY_CALL_INDEX].timeoutMs,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_TIMEOUT,
  );
  assert.deepStrictEqual(
    resetCalls,
    [{
      nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
    }],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_LANE_RESET,
  );
});

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_EXHAUSTED_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const snapshotProbeCalls = [];
    const resetCalls = [];

    for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        _resetAdminSocket(lane) {
          resetCalls.push({nodeId, lane});
        },
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics(options = {}) {
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
        Date.now() +
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_DEADLINE_EXTENSION_MS,
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
      coverage.selectedSnapshotNodeId,
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_SOURCE,
    );
    assert.strictEqual(
      selectedCalls.length,
      SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_RETRY_COUNT,
    );
    assert.strictEqual(
      selectedCalls[SNAPSHOT_REPLAY_TEST_FIRST_CALL_INDEX].timeoutMs,
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_WIDE_INITIAL_TIMEOUT_MS,
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
    const selectedRetryTimeoutPattern = new RegExp(
      String(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS),
      'u',
    );
    assert.match(
      coverage.selectedError,
      selectedRetryTimeoutPattern,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_ERROR,
    );
    assert.deepStrictEqual(
      resetCalls,
      [
        {
          nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        },
        {
          nodeId: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
          lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        },
      ],
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_LANE_RESET,
    );
    assert.deepStrictEqual(
      {
        state: coverage.selectedPublicationActiveGateHandoff?.state,
        reasonCode:
          coverage.selectedPublicationActiveGateHandoff?.reasonCode,
        nextAction:
          coverage.selectedPublicationActiveGateHandoff?.nextAction,
        runtimePromotionAllowed:
          coverage.selectedPublicationActiveGateHandoff
            ?.runtimePromotionAllowed,
        pendingRecoveryNodeIds:
          coverage.selectedPublicationActiveGateHandoff
            ?.pendingRecoveryNodeIds,
        pendingRecoveryCount:
          coverage.selectedPublicationActiveGateHandoff?.pendingRecoveryCount,
        pendingReconcileCount:
          coverage.selectedPublicationActiveGateHandoff?.pendingReconcileCount,
      },
      {
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        nextAction:
          SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed:
          SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingRecoveryNodeIds: [
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RESET_NODE_ID,
        ],
        pendingRecoveryCount:
          SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECOVERY_COUNT,
        pendingReconcileCount:
          SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECONCILE_COUNT,
      },
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_HANDOFF,
    );
    assert.deepStrictEqual(
      {
        pendingWrites: coverage.selectedControlPlaneOwnerQueueDepth
          ?.pendingWrites,
        state: coverage.selectedMembershipPublicationHandoffOutcome?.state,
        reasonCode:
          coverage.selectedMembershipPublicationHandoffOutcome?.reasonCode,
        enqueued:
          coverage.selectedMembershipPublicationHandoffOutcome?.enqueued,
        retryAfterMs:
          coverage.selectedMembershipPublicationHandoffOutcome?.retryAfterMs,
      },
      {
        pendingWrites: SNAPSHOT_REPLAY_TEST_OWNER_QUEUE_PENDING_WRITES,
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED_FALSE,
        retryAfterMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
      },
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .STARTUP_RETRY_EXHAUSTED_OWNER_QUEUE,
    );
  });

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_HANDOFF_RETURN_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const snapshotProbeCalls = [];
    const resetCalls = [];

    for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        _resetAdminSocket(lane) {
          resetCalls.push({nodeId, lane});
        },
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics(options = {}) {
          return {
            reachable: nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
            adminReady: nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
            reachableBy:
              nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
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

    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_EXHAUSTED_SOURCE,
    );
    assert.strictEqual(
      snapshotProbeCalls.length,
      SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_HANDOFF_RETURN_PROBE_COUNT,
    );
    assert.ok(
      snapshotProbeCalls.every((call) =>
        call.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_HANDOFF_RETURN_PROBE_COUNT,
    );
    assert.deepStrictEqual(
      resetCalls,
      [
        {
          nodeId: SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
          lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        },
        {
          nodeId: SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
          lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        },
      ],
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_LANE_RESET,
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
    assert.deepStrictEqual(
      coverage.selectedPublicationActiveGateHandoff?.publishedActiveNodeIds,
      [...SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS].sort(),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.LOAD_HANDOFF_RETURN_PUBLISHED,
    );
    assert.deepStrictEqual(
      {
        pendingWrites: coverage.selectedControlPlaneOwnerQueueDepth
          ?.pendingWrites,
        state: coverage.selectedMembershipPublicationHandoffOutcome?.state,
        reasonCode:
          coverage.selectedMembershipPublicationHandoffOutcome?.reasonCode,
        enqueued:
          coverage.selectedMembershipPublicationHandoffOutcome?.enqueued,
        retryAfterMs:
          coverage.selectedMembershipPublicationHandoffOutcome?.retryAfterMs,
      },
      {
        pendingWrites: SNAPSHOT_REPLAY_TEST_OWNER_QUEUE_PENDING_WRITES,
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED_FALSE,
        retryAfterMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_LOAD_RETRY_TIMEOUT_MS,
      },
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .STARTUP_RETRY_EXHAUSTED_OWNER_QUEUE,
    );
  });
