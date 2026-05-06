export function registerClusterPart6Core04Tests(context) {
  const {
    assert,
    CONTROL_PLANE_QUIESCENCE_REASON,
    CONTROL_PLANE_QUIESCENCE_STATE,
    createCluster,
    LOAD_READINESS_CANONICAL_ACTIVE_STATE,
    LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
    LOAD_READINESS_CANONICAL_DOCKER_SOCKET,
    LOAD_READINESS_CANONICAL_IMAGE,
    LOAD_READINESS_CANONICAL_LOG_FAILURE,
    LOAD_READINESS_CANONICAL_NODE_A,
    LOAD_READINESS_CANONICAL_NODE_B,
    LOAD_READINESS_CANONICAL_OBSERVED_AT_MS,
    LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
    LOAD_READINESS_CANONICAL_READY_REASON,
    LOAD_READINESS_CANONICAL_READY_STATE,
    LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
    LOAD_READINESS_CANONICAL_SLEEP_FAILURE,
    LOAD_READINESS_CANONICAL_SNAPSHOT_CAPTURED_AT_MS,
    LOAD_READINESS_CANONICAL_SOURCE,
    LOAD_READINESS_CANONICAL_STABLE_WINDOW_MS,
    LOAD_READINESS_CANONICAL_STAGE,
    LOAD_READINESS_CANONICAL_START_MS,
    LOAD_READINESS_CANONICAL_TIMEOUT_MS,
    LOAD_READINESS_CANONICAL_ZERO_COUNT,
    LOAD_READINESS_NO_PROGRESS_ACTIVE_GATE_STATE,
    LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
    LOAD_READINESS_NO_PROGRESS_DOCKER_SOCKET,
    LOAD_READINESS_NO_PROGRESS_IMAGE,
    LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
    LOAD_READINESS_NO_PROGRESS_MISSING_NODE_ID,
    LOAD_READINESS_NO_PROGRESS_MISSING_NODE_PREFIX,
    LOAD_READINESS_NO_PROGRESS_NODE_ID,
    LOAD_READINESS_NO_PROGRESS_PUBLICATION_STATUS,
    LOAD_READINESS_NO_PROGRESS_REASON,
    LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS,
    LOAD_READINESS_NO_PROGRESS_STAGE,
    LOAD_READINESS_NO_PROGRESS_START_MS,
    LOAD_READINESS_NO_PROGRESS_STEP_MS,
    LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS,
    LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT,
    LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_PROBES,
    LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_SLEEPS,
    LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
    LOAD_READINESS_PARTIAL_COVERAGE_LOG_FAILURE,
    LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS,
    LOAD_READINESS_PARTIAL_COVERAGE_SNAPSHOT_CAPTURED_AT_MS,
    LOAD_READINESS_PARTIAL_COVERAGE_SOURCE,
    LOAD_READINESS_PARTIAL_COVERAGE_STABLE_WINDOW_MS,
    LOAD_READINESS_PARTIAL_COVERAGE_START_MS,
    LOAD_READINESS_PARTIAL_COVERAGE_TIMEOUT_MS,
    LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_PROBES,
    LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_SLEEPS,
    LOAD_READINESS_PARTIAL_TO_COMPLETE_READY_OBSERVED_MS,
    LOAD_READINESS_PARTIAL_TO_COMPLETE_SECOND_OBSERVED_MS,
    NODE_ROLES,
    QUIESCENCE_CACHE_VISIBLE_COMPLETION_STATE,
    QUIESCENCE_CACHE_VISIBLE_EFFECTIVE_IN_FLIGHT_COUNT,
    QUIESCENCE_CACHE_VISIBLE_FAILURE_LOG_MESSAGE,
    QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
    QUIESCENCE_CACHE_VISIBLE_MAX_IN_FLIGHT_COUNT,
    QUIESCENCE_CACHE_VISIBLE_NODE_ID,
    QUIESCENCE_CACHE_VISIBLE_OPERATION_ID,
    QUIESCENCE_CACHE_VISIBLE_PARTITION_ID,
    QUIESCENCE_CACHE_VISIBLE_SLEEP_MS,
    QUIESCENCE_CACHE_VISIBLE_STABLE_WINDOW_MS,
    QUIESCENCE_CACHE_VISIBLE_STATUS,
    QUIESCENCE_CACHE_VISIBLE_STEP,
    QUIESCENCE_CACHE_VISIBLE_TIMEOUT_MS,
    QUIESCENCE_CACHE_VISIBLE_VISIBILITY_STATE,
    QUIESCENCE_RESET_BLOCKED_CAPTURED_AT_MS,
    QUIESCENCE_RESET_CANDIDATE_CAPTURED_AT_MS,
    QUIESCENCE_RESET_CANDIDATE_READY_AT_MS,
    QUIESCENCE_RESET_EFFECTIVE_IN_FLIGHT_COUNT,
    QUIESCENCE_RESET_IN_FLIGHT_COUNT,
    QUIESCENCE_RESET_MAX_IN_FLIGHT_COUNT,
    QUIESCENCE_RESET_NODE_ID,
    QUIESCENCE_RESET_OPERATION_ID,
    QUIESCENCE_RESET_PARTITION_ID,
    QUIESCENCE_RESET_SLEEP_MS,
    QUIESCENCE_RESET_STABLE_WINDOW_MS,
    QUIESCENCE_RESET_STALE_IN_FLIGHT_COUNT,
    QUIESCENCE_RESET_START_AT_MS,
    QUIESCENCE_RESET_STATUS,
    QUIESCENCE_RESET_STEP,
    QUIESCENCE_RESET_TIMEOUT_MS,
    test,
  } = context;

  test(
    'Unit: waitForLoadReadinessStability credits canonical snapshot capture time',
    async () => {
      const cluster = createCluster({
        size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
        docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
        image: LOAD_READINESS_CANONICAL_IMAGE,
      });

      const recordedStages = [];
      cluster._recordClusterStage = (stage, details = {}) => {
        recordedStages.push({stage, details});
      };
      cluster._sleep = async () => {
        throw new Error(LOAD_READINESS_CANONICAL_SLEEP_FAILURE);
      };
      cluster._collectFailureLogs = async () => {
        throw new Error(LOAD_READINESS_CANONICAL_LOG_FAILURE);
      };

      let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      let fakeNowMs = LOAD_READINESS_CANONICAL_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      cluster._probeClusterActiveState = async () => {
        probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        fakeNowMs = LOAD_READINESS_CANONICAL_OBSERVED_AT_MS;
        return {
          allActive: true,
          nodeDiagnostics: [
            {
              nodeId: LOAD_READINESS_CANONICAL_NODE_A,
              active: true,
              state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
              reasons: [],
            },
            {
              nodeId: LOAD_READINESS_CANONICAL_NODE_B,
              active: true,
              state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
              reasons: [],
            },
          ],
          snapshotCoverage: {
            completeCoverage: true,
            expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
            bestCoverageNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
            selectedCapturedAtMs:
            LOAD_READINESS_CANONICAL_SNAPSHOT_CAPTURED_AT_MS,
          },
          publicationConvergenceGate: {
            ready: true,
            reasons: [],
            publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
          },
        };
      };

      try {
        await cluster.waitForLoadReadinessStability({
          stableWindowMs: LOAD_READINESS_CANONICAL_STABLE_WINDOW_MS,
          timeoutMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        probeCallCount,
        LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
      );
      const stableStage = recordedStages.find(
        (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.state,
        LOAD_READINESS_CANONICAL_READY_STATE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.reasonCode,
        LOAD_READINESS_CANONICAL_READY_REASON,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.source,
        LOAD_READINESS_CANONICAL_SOURCE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.stableElapsedMs,
        LOAD_READINESS_CANONICAL_OBSERVED_AT_MS -
        LOAD_READINESS_CANONICAL_SNAPSHOT_CAPTURED_AT_MS,
      );
    });

  test(
    'Unit: waitForLoadReadinessStability does not credit partial snapshot time',
    async () => {
      const cluster = createCluster({
        size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
        docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
        image: LOAD_READINESS_CANONICAL_IMAGE,
      });

      const recordedStages = [];
      cluster._recordClusterStage = (stage, details = {}) => {
        recordedStages.push({stage, details});
      };
      let sleepCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      cluster._sleep = async () => {
        sleepCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        fakeNowMs = LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS;
      };
      cluster._collectFailureLogs = async () => {
        throw new Error(LOAD_READINESS_PARTIAL_COVERAGE_LOG_FAILURE);
      };

      let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      let fakeNowMs = LOAD_READINESS_PARTIAL_COVERAGE_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      cluster._probeClusterActiveState = async () => {
        probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        fakeNowMs =
        probeCallCount === LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT ?
          LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS :
          LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS;
        return {
          allActive: true,
          nodeDiagnostics: [
            {
              nodeId: LOAD_READINESS_CANONICAL_NODE_A,
              active: true,
              state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
              reasons: [],
            },
            {
              nodeId: LOAD_READINESS_CANONICAL_NODE_B,
              active: true,
              state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
              reasons: [],
            },
          ],
          snapshotCoverage: {
            completeCoverage: false,
            expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
            bestCoverageNodeCount: LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT,
            selectedCapturedAtMs:
            LOAD_READINESS_PARTIAL_COVERAGE_SNAPSHOT_CAPTURED_AT_MS,
          },
          publicationConvergenceGate: {
            ready: true,
            reasons: [],
            publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
          },
        };
      };

      try {
        await cluster.waitForLoadReadinessStability({
          stableWindowMs: LOAD_READINESS_PARTIAL_COVERAGE_STABLE_WINDOW_MS,
          timeoutMs: LOAD_READINESS_PARTIAL_COVERAGE_TIMEOUT_MS,
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        probeCallCount,
        LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_PROBES,
      );
      assert.equal(
        sleepCallCount,
        LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_SLEEPS,
      );
      const stableStage = recordedStages.find(
        (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.source,
        LOAD_READINESS_PARTIAL_COVERAGE_SOURCE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.startedAtMs,
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.stableElapsedMs,
        LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS -
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
      );
    });

  test(
    'Unit: waitForLoadReadinessStability does not backdate complete snapshot ' +
    'after partial coverage',
    async () => {
      const cluster = createCluster({
        size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
        docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
        image: LOAD_READINESS_CANONICAL_IMAGE,
      });

      const recordedStages = [];
      cluster._recordClusterStage = (stage, details = {}) => {
        recordedStages.push({stage, details});
      };
      let sleepCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      cluster._sleep = async () => {
        sleepCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      };
      cluster._collectFailureLogs = async () => {
        throw new Error(LOAD_READINESS_PARTIAL_COVERAGE_LOG_FAILURE);
      };

      let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      let fakeNowMs = LOAD_READINESS_PARTIAL_COVERAGE_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      cluster._probeClusterActiveState = async () => {
        probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        const firstProbe =
        probeCallCount === LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        fakeNowMs = firstProbe ?
          LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS :
          probeCallCount === LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_PROBES ?
            LOAD_READINESS_PARTIAL_TO_COMPLETE_READY_OBSERVED_MS :
            LOAD_READINESS_PARTIAL_TO_COMPLETE_SECOND_OBSERVED_MS;
        return {
          allActive: true,
          nodeDiagnostics: [
            {
              nodeId: LOAD_READINESS_CANONICAL_NODE_A,
              active: true,
              state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
              reasons: [],
            },
            {
              nodeId: LOAD_READINESS_CANONICAL_NODE_B,
              active: true,
              state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
              reasons: [],
            },
          ],
          snapshotCoverage: {
            completeCoverage: firstProbe !== true,
            expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
            bestCoverageNodeCount: firstProbe ?
              LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT :
              LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
            selectedCapturedAtMs:
            LOAD_READINESS_PARTIAL_COVERAGE_SNAPSHOT_CAPTURED_AT_MS,
          },
          publicationConvergenceGate: {
            ready: true,
            reasons: [],
            publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
          },
        };
      };

      try {
        await cluster.waitForLoadReadinessStability({
          stableWindowMs: LOAD_READINESS_PARTIAL_COVERAGE_STABLE_WINDOW_MS,
          timeoutMs: LOAD_READINESS_PARTIAL_COVERAGE_TIMEOUT_MS,
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        probeCallCount,
        LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_PROBES,
      );
      assert.equal(
        sleepCallCount,
        LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_SLEEPS,
      );
      const stableStage = recordedStages.find(
        (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.source,
        LOAD_READINESS_PARTIAL_COVERAGE_SOURCE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.startedAtMs,
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
      );
      assert.equal(
        stableStage?.details?.loadReadinessStableWindow?.stableElapsedMs,
        LOAD_READINESS_PARTIAL_TO_COMPLETE_READY_OBSERVED_MS -
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
      );
    });

  test(
    'Unit: waitForLoadReadinessStability fails fast when load ACTIVE progress stalls',
    async () => {
      const cluster = createCluster({
        size: LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
        docker: {socketPath: LOAD_READINESS_NO_PROGRESS_DOCKER_SOCKET},
        image: LOAD_READINESS_NO_PROGRESS_IMAGE,
      });

      const recordedStages = [];
      cluster._recordClusterStage = (stage, details = {}) => {
        recordedStages.push({stage, details});
      };

      let collectedFailureLogs = false;
      cluster._collectFailureLogs = async () => {
        collectedFailureLogs = true;
      };

      let fakeNowMs = LOAD_READINESS_NO_PROGRESS_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      cluster._sleep = async () => {};
      cluster._probeClusterActiveState = async () => {
        fakeNowMs += LOAD_READINESS_NO_PROGRESS_STEP_MS;
        return {
          allActive: false,
          nodeDiagnostics: [{
            nodeId: LOAD_READINESS_NO_PROGRESS_NODE_ID,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          }],
          snapshotCoverage: {
            completeCoverage: true,
            expectedNodeCount: LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
            bestCoverageNodeCount: LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
            selectedPublicationConvergence: {
              publicationStatus: LOAD_READINESS_NO_PROGRESS_PUBLICATION_STATUS,
              pendingAckNodeIds: [],
              priorityPartitionSummary: {
                satisfied: true,
                blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
                totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              },
            },
          },
          publicationConvergenceGate: {
            ready: false,
            reasons: [
              LOAD_READINESS_NO_PROGRESS_MISSING_NODE_PREFIX +
              LOAD_READINESS_NO_PROGRESS_MISSING_NODE_ID,
            ],
            publicationStatus: LOAD_READINESS_NO_PROGRESS_PUBLICATION_STATUS,
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [
              LOAD_READINESS_NO_PROGRESS_MISSING_NODE_ID,
            ],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
          },
        };
      };

      try {
        await assert.rejects(
          async () => {
            await cluster.waitForLoadReadinessStability({
              stableWindowMs: LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS,
              timeoutMs: LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS,
              noProgressMaxAttempts: LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
            });
          },
          (error) => {
            assert.match(
              error.message,
              /stalled with no meaningful progress/,
            );
            assert.equal(
              error?.diagnostics?.noProgress?.reasonCode,
              LOAD_READINESS_NO_PROGRESS_REASON,
            );
            assert.equal(
              error?.diagnostics?.noProgress?.failedNoProgress?.details
                ?.budgetAttempts,
              LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
            );
            assert.equal(
              error?.diagnostics?.activeGate?.state,
              LOAD_READINESS_NO_PROGRESS_ACTIVE_GATE_STATE,
            );
            return true;
          },
        );
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        collectedFailureLogs,
        true,
        'should collect failure logs before surfacing load-readiness stalls',
      );
      assert.equal(
        recordedStages.some((entry) =>
          entry.stage === LOAD_READINESS_NO_PROGRESS_STAGE &&
        entry.details?.activeGateNoProgress?.stalled === true),
        true,
        'load-readiness stall diagnostics should be recorded as stage evidence',
      );
    });

  test('Unit: waitForControlPlaneQuiescence waits for replica operations to ' +
  'drain and leadership to stay stable', async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let probeCallCount = 0;
    const snapshots = [
      {
        rows: [{
          capturedAt: 1,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 2,
            partitionGroupInFlight: {groupA: 2},
            operationTimelineById: {
              op1: [{step: 'PENDING', status: 'ACTIVE', inFlight: true}],
            },
          },
        }],
      },
      {
        rows: [{
          capturedAt: 2,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 3,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 4,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
    ];

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        const snapshot = snapshots[Math.min(
          probeCallCount,
          snapshots.length - 1,
        )];
        probeCallCount += 1;
        return snapshot;
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when quiescence succeeds');
    };

    const result = await cluster.waitForControlPlaneQuiescence({
      stableWindowMs: 2,
      timeoutMs: 50,
      noProgressTimeoutMs: 25,
      maxInFlightCount: 0,
    });

    assert.equal(result.inFlightCount, 0);
    assert.ok(
      probeCallCount >= 3,
      'quiescence gate should keep polling until the stable window completes',
    );
  });

  test('Unit: waitForControlPlaneQuiescence surfaces timeout diagnostics',
    async () => {
      const STALE_IN_FLIGHT_COUNT = 1;
      const EFFECTIVE_IN_FLIGHT_COUNT = 0;
      const STABLE_WINDOW_MS = 50;
      const TIMEOUT_MS = 15;
      const MAX_IN_FLIGHT_COUNT = 0;

      const cluster = createCluster({
        size: 3,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      cluster._nodes = new Map([['seed-a', {
        id: 'seed-a',
        role: NODE_ROLES.SEED,
        async getControlSnapshot() {
          return {
            rows: [{
              capturedAt: Date.now(),
              leaders: {partitions: 'seed-a'},
              replicaOperations: {
                inFlightCount: STALE_IN_FLIGHT_COUNT,
                staleInFlightCount: STALE_IN_FLIGHT_COUNT,
                partitionGroupInFlight: {groupA: 1},
                operationTimelineById: {
                  op1: [{step: 'PENDING', status: 'ACTIVE', inFlight: true}],
                },
              },
            }],
          };
        },
        async getLogs() {
          return '';
        },
      }]]);
      cluster._sleep = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
      };
      let collected = false;
      cluster._collectFailureLogs = async () => {
        collected = true;
      };

      await assert.rejects(
        async () => cluster.waitForControlPlaneQuiescence({
          stableWindowMs: STABLE_WINDOW_MS,
          timeoutMs: TIMEOUT_MS,
          maxInFlightCount: MAX_IN_FLIGHT_COUNT,
          ignoreStaleInFlightReplicaOperations: true,
        }),
        (error) => {
          assert.ok(collected, 'should collect failure logs before throwing');
          assert.match(error.message, /Control plane did not quiesce/i);
          assert.match(error.message, /inFlightCount=1/i);
          assert.equal(
            error.quiescence.effectiveInFlightCount,
            EFFECTIVE_IN_FLIGHT_COUNT,
          );
          assert.equal(
            error.quiescence.staleInFlightCount,
            STALE_IN_FLIGHT_COUNT,
          );
          assert.equal(
            error.quiescence.ignoreStaleInFlightReplicaOperations,
            true,
          );
          return true;
        },
      );
    });

  test(
    'Unit: waitForControlPlaneQuiescence discounts nested cache-visible priority recovery diagnostics',
    async () => {
      const cluster = createCluster({
        size: 3,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      let probeCallCount = 0;
      cluster._nodes = new Map([[QUIESCENCE_CACHE_VISIBLE_NODE_ID, {
        id: QUIESCENCE_CACHE_VISIBLE_NODE_ID,
        role: NODE_ROLES.SEED,
        async getControlSnapshot() {
          probeCallCount += 1;
          return {
            rows: [{
              capturedAt: Date.now(),
              leaders: {
                [QUIESCENCE_CACHE_VISIBLE_PARTITION_ID]:
                QUIESCENCE_CACHE_VISIBLE_NODE_ID,
              },
              replicaOperations: {
                inFlightCount: QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
                partitionGroupInFlight: {
                  [QUIESCENCE_CACHE_VISIBLE_PARTITION_ID]:
                  QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
                },
                operationTimelineById: {
                  [QUIESCENCE_CACHE_VISIBLE_OPERATION_ID]: [{
                    step: QUIESCENCE_CACHE_VISIBLE_STEP,
                    status: QUIESCENCE_CACHE_VISIBLE_STATUS,
                    inFlight: true,
                  }],
                },
                rows: [{
                  operationId: QUIESCENCE_CACHE_VISIBLE_OPERATION_ID,
                  partitionId: QUIESCENCE_CACHE_VISIBLE_PARTITION_ID,
                  status: QUIESCENCE_CACHE_VISIBLE_STATUS,
                  workflowStep: QUIESCENCE_CACHE_VISIBLE_STEP,
                }],
              },
              controlPlaneDiagnostics: {
                priorityRecoveryObservation: {
                  priorityRecoveryPartitionSnapshots: [{
                    partitionId: QUIESCENCE_CACHE_VISIBLE_PARTITION_ID,
                    visibilityState:
                    QUIESCENCE_CACHE_VISIBLE_VISIBILITY_STATE,
                    semanticState:
                    QUIESCENCE_CACHE_VISIBLE_COMPLETION_STATE,
                    operationIds: [QUIESCENCE_CACHE_VISIBLE_OPERATION_ID],
                  }],
                },
              },
            }],
          };
        },
        async getLogs() {
          return '';
        },
      }]]);
      cluster._sleep = async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, QUIESCENCE_CACHE_VISIBLE_SLEEP_MS),
        );
      };
      cluster._collectFailureLogs = async () => {
        throw new Error(QUIESCENCE_CACHE_VISIBLE_FAILURE_LOG_MESSAGE);
      };

      const result = await cluster.waitForControlPlaneQuiescence({
        stableWindowMs: QUIESCENCE_CACHE_VISIBLE_STABLE_WINDOW_MS,
        timeoutMs: QUIESCENCE_CACHE_VISIBLE_TIMEOUT_MS,
        maxInFlightCount: QUIESCENCE_CACHE_VISIBLE_MAX_IN_FLIGHT_COUNT,
        ignoreStaleInFlightReplicaOperations: true,
      });

      assert.equal(
        result.inFlightCount,
        QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
      );
      assert.equal(
        result.effectiveInFlightCount,
        QUIESCENCE_CACHE_VISIBLE_EFFECTIVE_IN_FLIGHT_COUNT,
      );
      assert.ok(
        probeCallCount > QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
        'quiescence gate should hold the stable window after discounting',
      );
    },
  );

  test(
    'Unit: waitForControlPlaneQuiescence timeout names candidate window reset reason',
    async () => {
      const cluster = createCluster({
        size: 3,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      let currentNowMs = QUIESCENCE_RESET_START_AT_MS;
      const blockedSnapshot = {
        rows: [{
          capturedAt: QUIESCENCE_RESET_BLOCKED_CAPTURED_AT_MS,
          leaders: {[QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_NODE_ID},
          replicaOperations: {
            inFlightCount: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
            partitionGroupInFlight: {
              [QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
            },
            operationTimelineById: {
              [QUIESCENCE_RESET_OPERATION_ID]: [{
                step: QUIESCENCE_RESET_STEP,
                status: QUIESCENCE_RESET_STATUS,
                inFlight: true,
              }],
            },
          },
        }],
      };
      const candidateSnapshot = {
        rows: [{
          capturedAt: QUIESCENCE_RESET_CANDIDATE_CAPTURED_AT_MS,
          leaders: {[QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_NODE_ID},
          replicaOperations: {
            inFlightCount: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
            staleInFlightCount: QUIESCENCE_RESET_STALE_IN_FLIGHT_COUNT,
            partitionGroupInFlight: {
              [QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
            },
            operationTimelineById: {
              [QUIESCENCE_RESET_OPERATION_ID]: [{
                step: QUIESCENCE_RESET_STEP,
                status: QUIESCENCE_RESET_STATUS,
                inFlight: true,
              }],
            },
          },
        }],
      };

      cluster._nodes = new Map([[QUIESCENCE_RESET_NODE_ID, {
        id: QUIESCENCE_RESET_NODE_ID,
        role: NODE_ROLES.SEED,
        async getControlSnapshot() {
          return currentNowMs < QUIESCENCE_RESET_CANDIDATE_READY_AT_MS ?
            blockedSnapshot :
            candidateSnapshot;
        },
        async getLogs() {
          return '';
        },
      }]]);
      cluster._sleep = async () => {
        currentNowMs += QUIESCENCE_RESET_SLEEP_MS;
      };
      let collected = false;
      cluster._collectFailureLogs = async () => {
        collected = true;
      };
      const originalDateNow = Date.now;
      Date.now = () => currentNowMs;
      try {
        await assert.rejects(
          async () => cluster.waitForControlPlaneQuiescence({
            stableWindowMs: QUIESCENCE_RESET_STABLE_WINDOW_MS,
            timeoutMs: QUIESCENCE_RESET_TIMEOUT_MS,
            maxInFlightCount: QUIESCENCE_RESET_MAX_IN_FLIGHT_COUNT,
            ignoreStaleInFlightReplicaOperations: true,
          }),
          (error) => {
            assert.ok(collected, 'should collect failure logs before throwing');
            assert.equal(
              error.quiescence.state,
              CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
            );
            assert.equal(
              error.quiescence.effectiveInFlightCount,
              QUIESCENCE_RESET_EFFECTIVE_IN_FLIGHT_COUNT,
            );
            assert.equal(
              error.quiescence.candidateWindowReset.reason,
              CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
            );
            assert.equal(
              error.quiescence.candidateWindowReset.canonicalBlocker,
              CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
            );
            return true;
          },
        );
      } finally {
        Date.now = originalDateNow;
      }
    },
  );
}
