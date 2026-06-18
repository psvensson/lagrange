const LOAD_READINESS_FORCE_REPAIR_TEST_NAME =
  'Unit: waitForLoadReadinessStability enables force repair after snapshot ' +
  'timeout progress stalls';
const LOAD_READINESS_FORCE_REPAIR_START_MS = 1000;
const LOAD_READINESS_FORCE_REPAIR_AFTER_MS = 1000;
const LOAD_READINESS_FORCE_REPAIR_SECOND_PROBE_MS = 2100;
const LOAD_READINESS_FORCE_REPAIR_OBSERVED_MS = 2500;
const LOAD_READINESS_FORCE_REPAIR_SNAPSHOT_CAPTURED_AT_MS = 1200;
const LOAD_READINESS_FORCE_REPAIR_STABLE_WINDOW_MS = 1000;
const LOAD_READINESS_FORCE_REPAIR_TIMEOUT_MS = 4000;
const LOAD_READINESS_FORCE_REPAIR_EXPECTED_PROBES = 2;
const LOAD_READINESS_FORCE_REPAIR_EXPECTED_SLEEPS = 1;
const LOAD_READINESS_FORCE_REPAIR_SEQUENCE = Object.freeze([false, true]);
const LOAD_READINESS_FORCE_REPAIR_SEQUENCE_ASSERTION =
  'load-readiness should enter forced repair after the active-wait threshold';
const LOAD_READINESS_FORCE_REPAIR_SLEEP_ASSERTION =
  'load-readiness should wait once before forced repair becomes eligible';
const LOAD_READINESS_FORCE_REPAIR_STAGE_ASSERTION =
  'forced repair success should close load readiness';

export function registerClusterLoadReadinessStabilityQuiescenceTests(context) {
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
    'Unit: waitForLoadReadinessStability can require active-gate promotion',
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
      cluster._collectFailureLogs = async () => {
        throw new Error(LOAD_READINESS_CANONICAL_LOG_FAILURE);
      };

      let sleepCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
      let fakeNowMs = LOAD_READINESS_CANONICAL_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      cluster._sleep = async () => {
        sleepCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        fakeNowMs += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      };
      cluster._probeClusterActiveState = async () => {
        probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
        const ownerRecoveryPending =
          probeCallCount === LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
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
            bestCoverageNodeCount:
              LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT,
            selectedPublicationActiveGateHandoff: ownerRecoveryPending ?
              {
                state: 'pending',
                reasonCode: 'owner_reconcile_pending',
                nextAction: 'wait_owner_recovery',
                runtimePromotionAllowed: false,
                pendingRecoveryCount:
                  LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
              } :
              {
                state: 'complete',
                reasonCode: 'owner_cohort_complete',
                nextAction: 'admit_active_gate',
                runtimePromotionAllowed: true,
                pendingRecoveryCount:
                  LOAD_READINESS_CANONICAL_ZERO_COUNT,
              },
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
          stableWindowMs: LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
          timeoutMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
          requireActiveGatePromotion: true,
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        probeCallCount,
        3,
        'owner-recovery pending evidence should reset the stable window',
      );
      assert.equal(sleepCallCount, 2);
      const stableStage = recordedStages.find(
        (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessAdmissionGate?.required,
        true,
      );
      assert.equal(
        stableStage?.details?.loadReadinessAdmissionGate?.state,
        'ready',
      );
    });

  test(
    'Unit: waitForLoadReadinessStability admits bounded startup-support ' +
    'owner recovery',
    async () => {
      const ownerRecoveryNodeIds = Object.freeze([
        'load-owner-recovery-seed',
        'load-owner-recovery-a',
        'load-owner-recovery-b',
        'load-owner-recovery-c',
        'load-owner-recovery-d',
      ]);
      const ownerRecoveryPendingNodeIds = Object.freeze(
        ownerRecoveryNodeIds.slice(0, 4),
      );
      const ownerRecoveryClusterSize = ownerRecoveryNodeIds.length;
      const ownerRecoveryCoverageNodeCount =
        ownerRecoveryClusterSize -
        LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      const cluster = createCluster({
        size: ownerRecoveryClusterSize,
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
          nodeDiagnostics: ownerRecoveryNodeIds.map((nodeId) => ({
            nodeId,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          })),
          snapshotCoverage: {
            completeCoverage: false,
            expectedNodeCount: ownerRecoveryClusterSize,
            bestCoverageNodeCount: ownerRecoveryCoverageNodeCount,
            selectedCapturedAtMs: LOAD_READINESS_CANONICAL_START_MS,
            selectedAdminReady: true,
            selectedSnapshotRepairDeferred: true,
            selectedSnapshotObservationMode: 'repair_deferred',
            selectedSnapshotObservationState: 'deferred_refresh',
            selectedSnapshotObservationContractState: 'deferred',
            selectedSnapshotObservationRefreshState: 'deferred',
            selectedSnapshotObservationNextAction: 'retry',
            selectedSnapshotObservationRetryAfterMs:
              LOAD_READINESS_CANONICAL_TIMEOUT_MS,
            selectedPublishedActiveNodeIds: ownerRecoveryNodeIds,
            selectedMissingPublishedNodeIds: [],
            selectedPendingAckNodeIds: [],
            selectedPublicationActiveGateHandoff: {
              state: 'pending',
              reasonCode: 'owner_reconcile_pending',
              nextAction: 'wait_owner_recovery',
              runtimePromotionAllowed: false,
              publishedActiveNodeIds: ownerRecoveryNodeIds,
              missingPublishedNodeIds: [],
              missingPublishedCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              pendingRecoveryNodeIds: ownerRecoveryPendingNodeIds,
              pendingRecoveryCount: ownerRecoveryPendingNodeIds.length,
              pendingReconcileNodeIds: [],
              pendingReconcileCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
            selectedMembershipPublicationHandoffOutcome: {
              state: 'write_deferred',
              reasonCode: 'owner_reconcile_pending',
              enqueued: true,
              retryAfterMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
            },
            selectedControlPlaneOwnerQueueDepth: {
              pendingWrites: ownerRecoveryPendingNodeIds.length,
              pendingWriteGrowthCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              retainedBacklogGrowthCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              sharedPressureBackpressured: false,
              transportPressureBackpressured: false,
              queryPressureBackpressured: false,
            },
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
          stableWindowMs: LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
          timeoutMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
          requireActiveGatePromotion: true,
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        probeCallCount,
        LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
        'bounded owner-recovery support should admit load readiness',
      );
      const stableStage = recordedStages.find(
        (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
      );
      assert.equal(
        stableStage?.details?.loadReadinessAdmissionGate
          ?.startupSupportOwnerRecoveryWindow,
        true,
      );
      assert.equal(
        stableStage?.details?.loadReadinessAdmissionGate?.state,
        'ready',
      );
      assert.equal(stableStage?.details?.snapshotCoverage?.completeCoverage, true);
      assert.equal(
        stableStage?.details?.snapshotCoverage?.canonicalCompleteCoverage,
        false,
      );
      assert.equal(
        stableStage?.details?.snapshotCoverage?.completeCoverageSource,
        'load_readiness_startup_support_owner_recovery_window',
      );
    });

  test(
    'Unit: waitForLoadReadinessStability rejects count-only bounded ' +
    'owner recovery',
    async () => {
      const ownerRecoveryNodeIds = Object.freeze([
        'load-owner-recovery-seed',
        'load-owner-recovery-a',
        'load-owner-recovery-b',
        'load-owner-recovery-c',
        'load-owner-recovery-d',
      ]);
      const unpublishedRecoveryNodeId = 'load-owner-recovery-unpublished';
      const ownerRecoveryClusterSize = ownerRecoveryNodeIds.length;
      const ownerRecoveryCoverageNodeCount =
        ownerRecoveryClusterSize -
        LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      const cluster = createCluster({
        size: ownerRecoveryClusterSize,
        docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
        image: LOAD_READINESS_CANONICAL_IMAGE,
      });

      const recordedStages = [];
      cluster._recordClusterStage = (stage, details = {}) => {
        recordedStages.push({stage, details});
      };
      cluster._sleep = async (ms) => {
        fakeNowMs += Math.max(
          LOAD_READINESS_CANONICAL_ZERO_COUNT,
          Number(ms) || LOAD_READINESS_CANONICAL_ZERO_COUNT,
        );
      };
      cluster._collectFailureLogs = async () => {
        recordedStages.push({stage: 'failure_logs'});
      };

      let fakeNowMs = LOAD_READINESS_CANONICAL_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      cluster._probeClusterActiveState = async () => {
        fakeNowMs = LOAD_READINESS_CANONICAL_OBSERVED_AT_MS;
        return {
          allActive: true,
          nodeDiagnostics: ownerRecoveryNodeIds.map((nodeId) => ({
            nodeId,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          })),
          snapshotCoverage: {
            completeCoverage: false,
            expectedNodeCount: ownerRecoveryClusterSize,
            bestCoverageNodeCount: ownerRecoveryCoverageNodeCount,
            selectedCapturedAtMs: LOAD_READINESS_CANONICAL_START_MS,
            selectedAdminReady: true,
            selectedSnapshotRepairDeferred: true,
            selectedSnapshotObservationMode: 'repair_deferred',
            selectedSnapshotObservationState: 'deferred_refresh',
            selectedSnapshotObservationContractState: 'deferred',
            selectedSnapshotObservationRefreshState: 'deferred',
            selectedSnapshotObservationNextAction: 'retry',
            selectedSnapshotObservationRetryAfterMs:
              LOAD_READINESS_CANONICAL_TIMEOUT_MS,
            selectedPublishedActiveNodeIds: ownerRecoveryNodeIds,
            selectedMissingPublishedNodeIds: [],
            selectedPendingAckNodeIds: [],
            selectedPublicationActiveGateHandoff: {
              state: 'pending',
              reasonCode: 'owner_reconcile_pending',
              nextAction: 'wait_owner_recovery',
              runtimePromotionAllowed: false,
              publishedActiveNodeIds: ownerRecoveryNodeIds,
              missingPublishedNodeIds: [],
              missingPublishedCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              pendingRecoveryNodeIds: [unpublishedRecoveryNodeId],
              pendingRecoveryCount:
                LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
              pendingReconcileNodeIds: [],
              pendingReconcileCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
            selectedMembershipPublicationHandoffOutcome: {
              state: 'write_deferred',
              reasonCode: 'owner_reconcile_pending',
              enqueued: true,
              retryAfterMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
            },
            selectedControlPlaneOwnerQueueDepth: {
              pendingWrites: LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
              pendingWriteGrowthCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              retainedBacklogGrowthCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              sharedPressureBackpressured: false,
              transportPressureBackpressured: false,
              queryPressureBackpressured: false,
            },
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
        await assert.rejects(
          async () => {
            await cluster.waitForLoadReadinessStability({
              stableWindowMs: LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
              timeoutMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
              noProgressMaxAttempts:
                LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
              requireActiveGatePromotion: true,
            });
          },
          /stalled with no meaningful progress/,
        );
      } finally {
        Date.now = originalDateNow;
      }

      const waitingStage = recordedStages.find(
        (entry) => entry.details?.loadReadinessAdmissionGate,
      );
      assert.equal(
        waitingStage?.details?.loadReadinessAdmissionGate
          ?.startupSupportOwnerRecoveryWindow,
        false,
      );
      assert.equal(
        waitingStage?.details?.loadReadinessAdmissionGate?.state,
        'blocked',
      );
    });

  test(
    'Unit: waitForLoadReadinessStability follows repair-deferred active-gate ' +
    'retry at terminal deadline',
    async () => {
      const LOAD_READINESS_REPAIR_START_MS = 1000;
      const LOAD_READINESS_REPAIR_TIMEOUT_MS = 20;
      const LOAD_READINESS_REPAIR_STABLE_WINDOW_MS = 1;
      const LOAD_READINESS_REPAIR_RETRY_AFTER_MS = 2500;
      const LOAD_READINESS_REPAIR_CLUSTER_SIZE = 5;
      const LOAD_READINESS_REPAIR_ONE_COUNT = 1;
      const LOAD_READINESS_REPAIR_ZERO_COUNT = 0;
      const LOAD_READINESS_REPAIR_NODE_IDS = Object.freeze([
        'load-repair-seed',
        'load-repair-joiner-a',
        'load-repair-joiner-b',
        'load-repair-joiner-c',
        'load-repair-joiner-d',
      ]);
      const LOAD_READINESS_REPAIR_ORIGINAL_DEADLINE =
        LOAD_READINESS_REPAIR_START_MS + LOAD_READINESS_REPAIR_TIMEOUT_MS;
      const cluster = createCluster({
        size: LOAD_READINESS_REPAIR_CLUSTER_SIZE,
        docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
        image: LOAD_READINESS_CANONICAL_IMAGE,
      });

      let fakeNowMs = LOAD_READINESS_REPAIR_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => fakeNowMs;
      const probeDeadlines = [];
      let probeCallCount = LOAD_READINESS_REPAIR_ZERO_COUNT;
      let collectedFailureLogs = false;
      cluster._sleep = async (ms) => {
        fakeNowMs += Math.max(LOAD_READINESS_REPAIR_ZERO_COUNT, Number(ms) || 0);
      };
      cluster._collectFailureLogs = async () => {
        collectedFailureLogs = true;
      };
      cluster._recordClusterStage = () => {};

      const repairRetryProbe = {
        allActive: false,
        nodeDiagnostics: LOAD_READINESS_REPAIR_NODE_IDS.map((nodeId, index) => ({
          nodeId,
          active: index === LOAD_READINESS_REPAIR_ZERO_COUNT,
          state: index === LOAD_READINESS_REPAIR_ZERO_COUNT ?
            LOAD_READINESS_CANONICAL_ACTIVE_STATE :
            'degraded',
          reasons: [],
        })),
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: LOAD_READINESS_REPAIR_CLUSTER_SIZE,
          bestCoverageNodeCount: LOAD_READINESS_REPAIR_ONE_COUNT,
          selectedNodeId: LOAD_READINESS_REPAIR_NODE_IDS[0],
          selectedAdminReady: true,
          selectedReachableBy: 'admin_ws',
          selectedError:
            'Admin API query timed out for node load-repair-seed on lane ' +
            'snapshot after 2500ms',
          selectedSnapshotObservationMode: 'repair_deferred',
          selectedSnapshotObservationState: 'deferred_refresh',
          selectedSnapshotObservationContractState: 'deferred',
          selectedSnapshotObservationRefreshState: 'deferred',
          selectedSnapshotObservationNextAction: 'retry',
          selectedSnapshotObservationReasonCodes: ['selected_timeout'],
          selectedSnapshotObservationRetryAfterMs:
            LOAD_READINESS_REPAIR_RETRY_AFTER_MS,
          selectedSnapshotRepairDeferred: true,
          selectedControlPlaneOwnerQueueDepth: {
            pendingWrites: LOAD_READINESS_REPAIR_ONE_COUNT,
            pendingWriteGrowthCount: LOAD_READINESS_REPAIR_ZERO_COUNT,
            retainedBacklogGrowthCount: LOAD_READINESS_REPAIR_ZERO_COUNT,
            sharedPressureBackpressured: false,
            transportPressureBackpressured: false,
            queryPressureBackpressured: false,
          },
          selectedPublicationConvergence: {
            publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
            recoveryProtocolState: 'steady_published',
            publishedActiveNodeIds: LOAD_READINESS_REPAIR_NODE_IDS,
            pendingAckNodeIds: [],
          },
          selectedPublicationActiveGateHandoff: {
            state: 'pending',
            reasonCode: 'owner_reconcile_pending',
            nextAction: 'wait_owner_recovery',
            runtimePromotionAllowed: false,
            pendingRecoveryNodeIds: [LOAD_READINESS_REPAIR_NODE_IDS[0]],
            pendingRecoveryCount: LOAD_READINESS_REPAIR_ONE_COUNT,
            pendingReconcileNodeIds: [],
            pendingReconcileCount: LOAD_READINESS_REPAIR_ZERO_COUNT,
            missingPublishedNodeIds: [],
            missingPublishedCount: LOAD_READINESS_REPAIR_ZERO_COUNT,
            publishedActiveNodeIds: LOAD_READINESS_REPAIR_NODE_IDS,
          },
          selectedMembershipPublicationHandoffOutcome: {
            state: 'write_deferred',
            reasonCode: 'owner_reconcile_pending',
            enqueued: true,
            retryAfterMs: LOAD_READINESS_REPAIR_RETRY_AFTER_MS,
          },
          selectedPublishedActiveNodeIds: LOAD_READINESS_REPAIR_NODE_IDS,
          selectedMissingPublishedNodeIds: [],
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['load_publication_gate_ready'],
          publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: LOAD_READINESS_REPAIR_ZERO_COUNT,
            totalSpreadGap: LOAD_READINESS_REPAIR_ZERO_COUNT,
          },
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
      const readyProbe = {
        allActive: true,
        nodeDiagnostics: LOAD_READINESS_REPAIR_NODE_IDS.map((nodeId) => ({
          nodeId,
          active: true,
          state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
          reasons: [],
        })),
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: LOAD_READINESS_REPAIR_CLUSTER_SIZE,
          bestCoverageNodeCount: LOAD_READINESS_REPAIR_CLUSTER_SIZE,
          selectedCapturedAtMs:
            LOAD_READINESS_REPAIR_ORIGINAL_DEADLINE +
            LOAD_READINESS_REPAIR_ONE_COUNT,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: LOAD_READINESS_REPAIR_ZERO_COUNT,
            totalSpreadGap: LOAD_READINESS_REPAIR_ZERO_COUNT,
          },
        },
      };
      cluster._probeClusterActiveState = async (deadline) => {
        probeDeadlines.push(deadline);
        probeCallCount += LOAD_READINESS_REPAIR_ONE_COUNT;
        if (probeCallCount === LOAD_READINESS_REPAIR_ONE_COUNT) {
          fakeNowMs =
            LOAD_READINESS_REPAIR_ORIGINAL_DEADLINE +
            LOAD_READINESS_REPAIR_ONE_COUNT;
          return repairRetryProbe;
        }
        return readyProbe;
      };

      try {
        await cluster.waitForLoadReadinessStability({
          stableWindowMs: LOAD_READINESS_REPAIR_STABLE_WINDOW_MS,
          timeoutMs: LOAD_READINESS_REPAIR_TIMEOUT_MS,
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.equal(
        probeCallCount,
        2,
        'load-readiness should take the bounded repair retry probe',
      );
      assert.equal(
        collectedFailureLogs,
        false,
        'bounded load-readiness repair retry should avoid failure logs',
      );
      assert.ok(
        probeDeadlines[1] > probeDeadlines[0],
        'load-readiness repair retry should extend the probe deadline',
      );
    });

  test(LOAD_READINESS_FORCE_REPAIR_TEST_NAME, async () => {
    const cluster = createCluster({
      size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
      docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
      image: LOAD_READINESS_CANONICAL_IMAGE,
    });

    cluster._config.timeouts = {
      ...(cluster._config.timeouts || {}),
      activeWaitForceRepairAfter: LOAD_READINESS_FORCE_REPAIR_AFTER_MS,
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };
    cluster._collectFailureLogs = async () => {
      throw new Error(LOAD_READINESS_CANONICAL_LOG_FAILURE);
    };

    let sleepCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    let fakeNowMs = LOAD_READINESS_FORCE_REPAIR_START_MS;
    const forceRepairByProbe = [];
    const originalDateNow = Date.now;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {
      sleepCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      fakeNowMs = LOAD_READINESS_FORCE_REPAIR_SECOND_PROBE_MS;
    };
    cluster._probeClusterActiveState = async (_deadline, probeOptions = {}) => {
      probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      forceRepairByProbe.push(probeOptions.forceRepair === true);
      const forcedRepairProbe =
        probeCallCount === LOAD_READINESS_FORCE_REPAIR_EXPECTED_PROBES;
      if (forcedRepairProbe !== true) {
        return {
          allActive: false,
          nodeDiagnostics: [],
          snapshotCoverage: {
            completeCoverage: false,
            expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
            bestCoverageNodeCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
          },
          publicationConvergenceGate: {
            ready: false,
            reasons: [],
          },
        };
      }
      fakeNowMs = LOAD_READINESS_FORCE_REPAIR_OBSERVED_MS;
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
            LOAD_READINESS_FORCE_REPAIR_SNAPSHOT_CAPTURED_AT_MS,
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
        stableWindowMs: LOAD_READINESS_FORCE_REPAIR_STABLE_WINDOW_MS,
        timeoutMs: LOAD_READINESS_FORCE_REPAIR_TIMEOUT_MS,
      });
    } finally {
      Date.now = originalDateNow;
    }

    assert.deepEqual(
      forceRepairByProbe,
      LOAD_READINESS_FORCE_REPAIR_SEQUENCE,
      LOAD_READINESS_FORCE_REPAIR_SEQUENCE_ASSERTION,
    );
    assert.equal(
      sleepCallCount,
      LOAD_READINESS_FORCE_REPAIR_EXPECTED_SLEEPS,
      LOAD_READINESS_FORCE_REPAIR_SLEEP_ASSERTION,
    );
    const stableStage = recordedStages.find(
      (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.state,
      LOAD_READINESS_CANONICAL_READY_STATE,
      LOAD_READINESS_FORCE_REPAIR_STAGE_ASSERTION,
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
        entry.details?.activeGate?.state === 'stalled'),
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
      const STALE_OPERATION_ID = 'op1';
      const STALE_PARTITION_ID = 'message_groups-p1';

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
                  [STALE_OPERATION_ID]: [{
                    step: 'PENDING',
                    status: 'ACTIVE',
                    inFlight: true,
                  }],
                },
                rows: [{
                  operationId: STALE_OPERATION_ID,
                  type: 'REPLACE',
                  partitionId: STALE_PARTITION_ID,
                  status: 'creating',
                  workflowStep: 'CREATING',
                  updatedAt: Date.now() - 70000,
                }],
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
          assert.deepEqual(error.quiescence.replicaOperationDrainRows.map(
            (row) => ({
              operationId: row.operationId,
              partitionId: row.partitionId,
              stale: row.stale,
              effectiveInFlight: row.effectiveInFlight,
            }),
          ), [{
            operationId: STALE_OPERATION_ID,
            partitionId: STALE_PARTITION_ID,
            stale: true,
            effectiveInFlight: false,
          }]);
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
            rows: [{
              operationId: QUIESCENCE_RESET_OPERATION_ID,
              partitionId: QUIESCENCE_RESET_PARTITION_ID,
              status: QUIESCENCE_RESET_STATUS,
              workflowStep: QUIESCENCE_RESET_STEP,
              updatedAt: QUIESCENCE_RESET_START_AT_MS,
            }],
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
            rows: [{
              operationId: QUIESCENCE_RESET_OPERATION_ID,
              partitionId: QUIESCENCE_RESET_PARTITION_ID,
              status: QUIESCENCE_RESET_STATUS,
              workflowStep: QUIESCENCE_RESET_STEP,
              updatedAt: QUIESCENCE_RESET_START_AT_MS,
            }],
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
            assert.deepEqual(error.quiescence.replicaOperationDrainRows.map(
              (row) => ({
                operationId: row.operationId,
                partitionId: row.partitionId,
                stale: row.stale,
                effectiveInFlight: row.effectiveInFlight,
              }),
            ), [{
              operationId: QUIESCENCE_RESET_OPERATION_ID,
              partitionId: QUIESCENCE_RESET_PARTITION_ID,
              stale: false,
              effectiveInFlight: true,
            }]);
            return true;
          },
        );
      } finally {
        Date.now = originalDateNow;
      }
    },
  );
}
