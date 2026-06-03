import {
  ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
  assert,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
  createCluster,
  NODE_ROLES,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_ERROR,
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_FALLBACK_TEST_NAME,
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
  SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ALTERNATIVE_ERROR,
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ERROR,
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_HANDOFF_FIXTURE_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_HIGHER_COVERAGE_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_AFTER_TOLERANCE_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_UNSELECTED_ERROR_PREFIX,
  SELECTED_SNAPSHOT_SOURCE_TRANSPORT_CLOSED_OBSERVATION_REASON,
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ALTERNATIVE_ERROR,
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR,
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_HANDOFF_FIXTURE_TEST_NAME,
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS,
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID,
  SERVICE_STATUS,
  SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS,
  SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
  SNAPSHOT_REPAIR_TIMEOUT_SELECTED_ERROR,
  SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
  SNAPSHOT_REPAIR_TIMEOUT_UNSELECTED_ERROR_PREFIX,
  SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_CAPTURED_AT_MS,
  SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_DEADLINE_EXTENSION_MS,
  SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_NODE_ID,
  SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
  SNAPSHOT_REPLAY_TEST_ADMIN_ONLY_FAST_PATH_TEST_NAME,
  SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE,
  SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
  SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
  SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
  SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH,
  SNAPSHOT_REPLAY_TEST_EMPTY_LOG,
  SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  SNAPSHOT_REPLAY_TEST_FAST_PATH_TIMEOUT_BUFFER_MS,
  SNAPSHOT_REPLAY_TEST_FORCED_REPAIR_TEST_NAME,
  SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECONCILE_COUNT,
  SNAPSHOT_REPLAY_TEST_HANDOFF_PENDING_RECOVERY_COUNT,
  SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
  SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
  SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
  SNAPSHOT_REPLAY_TEST_IMAGE,
  SNAPSHOT_REPLAY_TEST_INITIAL_PROBE_CALL_COUNT,
  SNAPSHOT_REPLAY_TEST_NO_PROBE_CALLS,
  SNAPSHOT_REPLAY_TEST_NODE_ID,
  SNAPSHOT_REPLAY_TEST_OWNER_QUEUE_PENDING_WRITES,
  SNAPSHOT_REPLAY_TEST_REACHABILITY_ERROR_PREFIX,
  SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT,
  SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE,
  SNAPSHOT_TIMEOUT_REPAIR_ASSERTION,
  test,
} from './cluster-control-snapshot-timeout-repair-fixtures.js';
test(SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_FALLBACK_TEST_NAME, async () => {
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
            nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
          adminReady:
            nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
          reachableBy:
            nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID ?
              SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
              null,
          lastError: null,
          skipBootstrapReadiness: options.skipBootstrapReadiness === true,
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
        if (nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID) {
          if (options.forceAuthoritativeRepair === true) {
            throw new Error(SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_ERROR);
          }
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_CAPTURED_AT_MS,
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
    {forceRepair: true},
  );
  const selectedCalls = snapshotProbeCalls.filter((call) => {
    return call.nodeId === SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID;
  });

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_SOURCE,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_CLEAR,
  );
  assert.strictEqual(
    coverage.completeCoverage,
    true,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_COVERAGE,
  );
  assert.deepStrictEqual(
    selectedCalls,
    [
      {
        nodeId: SELECTED_SNAPSHOT_FORCE_REPAIR_TIMEOUT_NODE_ID,
        lane: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE,
        forceRepair: true,
        forceAuthoritativeRepair: false,
      },
    ],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_CALLS,
  );
  assert.deepStrictEqual(
    resetCalls,
    [],
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_LANE_RESET,
  );
});

test(
  SNAPSHOT_REPLAY_TEST_FORCED_REPAIR_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const snapshotProbeCalls = [];
    const reachabilityProbeCalls = [];
    const originalDateNow = Date.now;
    Date.now = () => SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS;

    try {
      for (const nodeId of SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS) {
        cluster._nodes.set(nodeId, {
          id: nodeId,
          role:
            nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID ?
              NODE_ROLES.SEED :
              NODE_ROLES.JOINER,
          async getStatus() {
            return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
          },
          async getReachabilityDiagnostics(options = {}) {
            reachabilityProbeCalls.push({
              nodeId,
              timeoutMs: options.timeoutMs,
              skipBootstrapReadiness:
                options.skipBootstrapReadiness === true,
            });
            return {
              reachable:
                nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
              adminReady:
                nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
              reachableBy:
                nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID ?
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
            if (
              nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID &&
              options.forceRepair === true &&
              options.forceAuthoritativeRepair !== true
            ) {
              return {
                rows: [{
                  nodes: [...SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS],
                  capturedAtMs: SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS,
                }],
              };
            }
            if (nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID) {
              throw new Error(SNAPSHOT_REPAIR_TIMEOUT_SELECTED_ERROR);
            }
            throw new Error(
              SNAPSHOT_REPAIR_TIMEOUT_UNSELECTED_ERROR_PREFIX + nodeId,
            );
          },
          async getLogs(_options) {
            return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
          },
        });
      }

      const coverage = await cluster._probeControlSnapshotCoverage(
        SNAPSHOT_REPAIR_TIMEOUT_CAPTURED_NOW_MS +
          SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
        SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
        {forceRepair: true},
      );
      const selectedWitness = coverage.probeWitnesses.find((witness) => {
        return witness.nodeId === SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID;
      });

      assert.strictEqual(coverage.completeCoverage, true);
      assert.strictEqual(
        coverage.forceRepair,
        true,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_PATH,
      );
      assert.strictEqual(
        coverage.bestCoverageNodeCount,
        SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.length,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_METRIC,
      );
      assert.strictEqual(
        coverage.selectedSnapshotNodeId,
        SNAPSHOT_REPAIR_TIMEOUT_SELECTED_NODE_ID,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_SELECTED_SOURCE,
      );
      assert.strictEqual(
        coverage.selectedSnapshotTimeoutMs,
        SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_TIMEOUT_BUDGET,
      );
      assert.strictEqual(
        coverage.selectedError,
        null,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_TIMEOUT_CHAIN,
      );
      assert.strictEqual(
        selectedWitness?.snapshotQuerySucceeded,
        true,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_QUERY,
      );
      assert.strictEqual(
        selectedWitness?.error,
        null,
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_SELECTED_ERROR,
      );
      assert.ok(
        snapshotProbeCalls.every((call) =>
          call.lane === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SNAPSHOT_LANE &&
          call.forceRepair === true &&
          call.forceAuthoritativeRepair === false &&
          call.timeoutMs === SNAPSHOT_REPAIR_TIMEOUT_QUERY_TIMEOUT_MS,
        ),
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.FORCED_REPAIR_DIRECT_SNAPSHOT,
      );
      assert.ok(
        reachabilityProbeCalls.every((call) =>
          call.skipBootstrapReadiness === true,
        ),
        SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH,
      );
    } finally {
      Date.now = originalDateNow;
    }
  },
);

test(
  SNAPSHOT_REPLAY_TEST_ADMIN_ONLY_FAST_PATH_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_SINGLE_NODE_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    const nodeId = SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_NODE_ID;
    const reachabilityError =
      SNAPSHOT_REPLAY_TEST_REACHABILITY_ERROR_PREFIX + nodeId;
    const reachabilityProbeCalls = [];

    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: NODE_ROLES.SEED,
      async getStatus() {
        return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
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
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
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
          }, Number(options.timeoutMs || ACTIVE_GATE_REACHABILITY_DELAY_ZERO) +
            SNAPSHOT_REPLAY_TEST_FAST_PATH_TIMEOUT_BUFFER_MS);
        });
      },
      async getControlSnapshot() {
        return {
          rows: [{
            nodes: [nodeId],
            capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_CAPTURED_AT_MS,
          }],
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_ADMIN_FAST_PATH_DEADLINE_EXTENSION_MS,
      [nodeId],
    );

    assert.deepStrictEqual(
      reachabilityProbeCalls.map((call) => call.skipBootstrapReadiness),
      [true],
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_REQUEST,
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_WITNESS,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachabilityError,
      null,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_REACHABILITY,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ADMIN_FAST_PATH_SOURCE,
    );
  },
);

test(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

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
      async getReachabilityDiagnostics() {
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
      async getControlSnapshot() {
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID) {
          return {
            rows: [{
              nodes: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_HIGHER_COVERAGE_NODE_IDS,
              capturedAtMs: SELECTED_SNAPSHOT_SOURCE_TIMEOUT_CAPTURED_AT_MS,
            }],
          };
        }
        if (nodeId === SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID) {
          return {
            rows: [{
              nodes:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_NODE_IDS,
              capturedAtMs:
                SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ALTERNATIVE_WITNESS_CAPTURED_AT_MS,
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

  let timedOut = false;
  const selectedNode = cluster._nodes.get(
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_SELECTED_NODE_ID,
  );
  const selectedOriginalGetControlSnapshot =
    selectedNode.getControlSnapshot.bind(selectedNode);
  selectedNode.getControlSnapshot = async (...args) => {
    if (timedOut !== true) {
      timedOut = true;
      throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR);
    }
    return selectedOriginalGetControlSnapshot(...args);
  };

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );

  assert.strictEqual(
    coverage.selectedSnapshotNodeId,
    SELECTED_SNAPSHOT_SOURCE_TIMEOUT_FALLBACK_NODE_ID,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ALTERNATIVE_WITNESS_SELECTION,
  );
  assert.strictEqual(
    coverage.selectedError,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ALTERNATIVE_WITNESS_TIMEOUT_CLEAR,
  );
  assert.strictEqual(
    coverage.selectedSnapshotReachableBy,
    null,
    SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.ALTERNATIVE_WITNESS_REACHABILITY,
  );
});

test(
  SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_HANDOFF_FIXTURE_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });

    for (const nodeId of SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          const selectedSourceNode =
            nodeId ===
              SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID;
          return {
            reachable: selectedSourceNode,
            adminReady: selectedSourceNode,
            reachableBy:
              selectedSourceNode ? SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE : null,
            lastError: null,
          };
        },
        async getControlSnapshot() {
          if (
            nodeId === SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID
          ) {
            throw new Error(SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR);
          }
          throw new Error(
            SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ALTERNATIVE_ERROR,
          );
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_NODE_IDS,
    );

    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_SELECTED_NODE_ID,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_SOURCE,
    );
    assert.strictEqual(
      coverage.selectedError,
      SELECTED_SNAPSHOT_SOURCE_WEBSOCKET_CLOSED_ERROR,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ERROR,
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ADMIN_READY,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      SNAPSHOT_REPLAY_TEST_ADMIN_WS_SOURCE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_REACHABILITY,
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
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION,
    );
    assert.ok(
      coverage.selectedSnapshotObservationReasonCodes.includes(
        SELECTED_SNAPSHOT_SOURCE_TRANSPORT_CLOSED_OBSERVATION_REASON,
      ),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION_REASON,
    );
    assert.strictEqual(
      coverage.selectedSnapshotRepairDeferred,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_REPAIR_DEFERRED,
    );
    assert.ok(
      coverage.selectedSnapshotObservationRetryAfterMs >=
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS -
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_AFTER_TOLERANCE_MS &&
        coverage.selectedSnapshotObservationRetryAfterMs <=
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_RETRY_TIMEOUT,
    );
    assert.ok(
      Object.hasOwn(
        coverage.publicationDisagreementByNodeId,
        SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
      ),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_ALTERNATIVE_WITNESS,
    );
  },
);

test(
  SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_HANDOFF_FIXTURE_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    let selectedSnapshotProbeCount = SNAPSHOT_REPLAY_TEST_NO_PROBE_CALLS;

    for (const nodeId of SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_NODE_IDS) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          const selectedSourceNode =
            nodeId === SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID;
          return {
            reachable: selectedSourceNode,
            adminReady: selectedSourceNode,
            reachableBy:
              selectedSourceNode ?
                SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
                null,
            lastError: null,
          };
        },
        async getControlSnapshot() {
          if (nodeId === SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID) {
            selectedSnapshotProbeCount += SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT;
            throw new Error(SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ERROR);
          }
          throw new Error(
            SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ALTERNATIVE_ERROR,
          );
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_NODE_IDS,
    );

    assert.strictEqual(
      selectedSnapshotProbeCount,
      SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
    );
    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_SOURCE,
    );
    assert.strictEqual(
      coverage.selectedError,
      SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ERROR,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ERROR,
    );
    assert.strictEqual(
      coverage.selectedSnapshotAdminReady,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ADMIN_READY,
    );
    assert.strictEqual(
      coverage.selectedSnapshotReachableBy,
      SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_REACHABILITY,
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
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION,
    );
    assert.ok(
      coverage.selectedSnapshotObservationReasonCodes.includes(
        SELECTED_SNAPSHOT_SOURCE_TRANSPORT_CLOSED_OBSERVATION_REASON,
      ),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION_REASON,
    );
    assert.strictEqual(
      coverage.selectedSnapshotRepairDeferred,
      true,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_REPAIR_DEFERRED,
    );
    assert.ok(
      coverage.selectedSnapshotObservationRetryAfterMs >=
        SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS -
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_RETRY_AFTER_TOLERANCE_MS &&
        coverage.selectedSnapshotObservationRetryAfterMs <=
          SELECTED_SNAPSHOT_SOURCE_TIMEOUT_STARTUP_RETRY_TIMEOUT_MS,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_RETRY_TIMEOUT,
    );
    assert.ok(
      Object.hasOwn(
        coverage.publicationDisagreementByNodeId,
        SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
      ),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_ALTERNATIVE_WITNESS,
    );
  },
);

test(
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });
    let selectedSnapshotProbeCount = SNAPSHOT_REPLAY_TEST_NO_PROBE_CALLS;

    for (
      const nodeId of
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_NODE_IDS
    ) {
      cluster._nodes.set(nodeId, {
        id: nodeId,
        role:
          nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          const selectedSourceNode =
            nodeId === SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID;
          return {
            reachable: selectedSourceNode,
            adminReady: selectedSourceNode,
            reachableBy:
              selectedSourceNode ?
                SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE :
                null,
            lastError: null,
          };
        },
        async getControlSnapshot() {
          if (nodeId === SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID) {
            selectedSnapshotProbeCount += SNAPSHOT_REPLAY_TEST_SINGLE_CALL_COUNT;
            if (
              selectedSnapshotProbeCount ===
                SNAPSHOT_REPLAY_TEST_INITIAL_PROBE_CALL_COUNT
            ) {
              throw new Error(SELECTED_SNAPSHOT_SOURCE_TIMEOUT_ERROR);
            }
            throw new Error(SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ERROR);
          }
          throw new Error(
            SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ALTERNATIVE_ERROR,
          );
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SELECTED_SNAPSHOT_SOURCE_TIMEOUT_THEN_ADMIN_CLOSED_NODE_IDS,
    );

    assert.strictEqual(
      selectedSnapshotProbeCount,
      SNAPSHOT_REPLAY_TEST_BOUNDED_RETRY_CALL_COUNT,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.STARTUP_RETRY_COUNT,
    );
    assert.strictEqual(
      coverage.selectedSnapshotNodeId,
      SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_SOURCE,
    );
    assert.strictEqual(
      coverage.selectedError,
      SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_ERROR,
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_SELECTED_ERROR,
    );
    assert.ok(
      coverage.selectedSnapshotObservationReasonCodes.includes(
        SELECTED_SNAPSHOT_SOURCE_TRANSPORT_CLOSED_OBSERVATION_REASON,
      ),
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION.WEBSOCKET_CLOSED_OBSERVATION_REASON,
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
          SELECTED_SNAPSHOT_SOURCE_ADMIN_CLOSED_SELECTED_NODE_ID,
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
        enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
        retryAfterMs: coverage.selectedSnapshotObservationRetryAfterMs,
      },
      SNAPSHOT_TIMEOUT_REPAIR_ASSERTION
        .STARTUP_RETRY_EXHAUSTED_OWNER_QUEUE,
    );
  },
);
