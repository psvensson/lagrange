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
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  SERVICE_STATUS,
  TYPEOF,
} from '../../../../src/constants/index.js';
import {
  createCluster,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
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
const ACTIVE_GATE_STRONG_ADMISSION_TEST_NAME =
  'Unit: _waitForAllActive rejects CL-004 witness without strong admission';
const ACTIVE_GATE_STRONG_ADMIN_PROOF_TEST_NAME =
  'Unit: _waitForAllActive rejects CL-006 witness without strong admin proof';
const ACTIVE_GATE_TEST_SEED_NODE_ID = 'seed-1';
const ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID = 'joiner-1';
const ACTIVE_GATE_TEST_JOINER_TWO_NODE_ID = 'joiner-2';
const ACTIVE_GATE_TEST_ACTIVE_STATE = SERVICE_STATUS.ACTIVE;
const ACTIVE_GATE_STRONG_ADMISSION_CLUSTER_SIZE = 2;
const ACTIVE_GATE_STRONG_ADMIN_PROOF_CLUSTER_SIZE = 3;
const ACTIVE_GATE_STRONG_ADMISSION_CONVERGENCE_MS = 200;
const ACTIVE_GATE_STRONG_ADMISSION_MAX_ATTEMPTS = 2;
const ACTIVE_GATE_STRONG_ADMISSION_COVERAGE_COUNT = 0;
const ACTIVE_GATE_STRONG_ADMIN_PROOF_COVERAGE_COUNT = 2;
const ACTIVE_GATE_STRONG_ADMISSION_QUERY_TIMEOUT_MS = 3000;
const ACTIVE_GATE_STRONG_ADMISSION_SELECTED_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_TEST_SEED_NODE_ID +
  ' on lane snapshot after ' +
  ACTIVE_GATE_STRONG_ADMISSION_QUERY_TIMEOUT_MS +
  'ms';
const ACTIVE_GATE_STALLED_MESSAGE =
  'Cluster ACTIVE wait stalled with no meaningful progress';
const ACTIVE_GATE_STRONG_ADMISSION_TIMEOUT_ASSERTION =
  'startup snapshot timeout should timeout until active admission is strong';
const ACTIVE_GATE_STRONG_ADMIN_PROOF_TIMEOUT_ASSERTION =
  'startup publication lag witness should timeout when strong admission is absent';
const ACTIVE_GATE_TIMEOUT_DIAGNOSTICS_ASSERTION =
  'startup timeout should carry final timeout diagnostics';
const ACTIVE_GATE_SNAPSHOT_TIMEOUT_CLASS_CODE = 'snapshot_timeout';
const ACTIVE_GATE_NO_PROGRESS_TERMINAL_CLASS_CODE = 'no_progress_terminal';
const ACTIVE_GATE_TERMINAL_RECOVERABILITY = 'terminal';
const ACTIVE_GATE_NONE_CAUSE = 'none';
const ACTIVE_GATE_STARTUP_MODE = 'startup';
const ACTIVE_GATE_STRONG_ADMISSION_LOGS_ASSERTION =
  'startup snapshot-timeout path should collect failure logs';
const ACTIVE_GATE_STRONG_ADMIN_PROOF_PUBLISHED_NODE_IDS = Object.freeze([
  ACTIVE_GATE_TEST_SEED_NODE_ID,
  ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID,
]);
const ACTIVE_GATE_STRONG_ADMIN_PROOF_MISSING_NODE_IDS = Object.freeze([
  ACTIVE_GATE_TEST_JOINER_TWO_NODE_ID,
]);
const ACTIVE_GATE_STRONG_ADMIN_PROOF_LOGS_ASSERTION =
  'startup publication-lag timeout should collect failure logs';
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
test(ACTIVE_GATE_STRONG_ADMISSION_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_STRONG_ADMISSION_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
      timeouts: {
        convergence: ACTIVE_GATE_STRONG_ADMISSION_CONVERGENCE_MS,
        activeWaitNoProgressMaxAttempts:
          ACTIVE_GATE_STRONG_ADMISSION_MAX_ATTEMPTS,
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
          nodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }, {
          nodeId: ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: ACTIVE_GATE_STRONG_ADMISSION_CLUSTER_SIZE,
          bestCoverageNodeCount: ACTIVE_GATE_STRONG_ADMISSION_COVERAGE_COUNT,
          selectedNodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          selectedAdminReady: true,
          selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          selectedError: ACTIVE_GATE_STRONG_ADMISSION_SELECTED_ERROR,
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
        return typeof error?.message === TYPEOF.STRING &&
          error.message.includes(ACTIVE_GATE_STALLED_MESSAGE);
      },
      ACTIVE_GATE_STRONG_ADMISSION_TIMEOUT_ASSERTION,
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      ACTIVE_GATE_TIMEOUT_DIAGNOSTICS_ASSERTION,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      ACTIVE_GATE_SNAPSHOT_TIMEOUT_CLASS_CODE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.recoverability,
      ACTIVE_GATE_TERMINAL_RECOVERABILITY,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      ACTIVE_GATE_STARTUP_MODE,
    );
    assert.equal(
      collectedFailureLogs,
      true,
      ACTIVE_GATE_STRONG_ADMISSION_LOGS_ASSERTION,
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

test(ACTIVE_GATE_STRONG_ADMIN_PROOF_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: ACTIVE_GATE_STRONG_ADMIN_PROOF_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
      timeouts: {
        convergence: ACTIVE_GATE_STRONG_ADMISSION_CONVERGENCE_MS,
        activeWaitNoProgressMaxAttempts:
          ACTIVE_GATE_STRONG_ADMISSION_MAX_ATTEMPTS,
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
          nodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }, {
          nodeId: ACTIVE_GATE_TEST_JOINER_ONE_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }, {
          nodeId: ACTIVE_GATE_TEST_JOINER_TWO_NODE_ID,
          active: true,
          state: ACTIVE_GATE_TEST_ACTIVE_STATE,
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: ACTIVE_GATE_STRONG_ADMIN_PROOF_CLUSTER_SIZE,
          bestCoverageNodeCount:
            ACTIVE_GATE_STRONG_ADMIN_PROOF_COVERAGE_COUNT,
          selectedNodeId: ACTIVE_GATE_TEST_SEED_NODE_ID,
          selectedAdminReady: true,
          selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          selectedPublicationConvergence: {
            publicationEpoch: SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
            publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
            publishedActiveNodeIds:
              ACTIVE_GATE_STRONG_ADMIN_PROOF_PUBLISHED_NODE_IDS,
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds:
            ACTIVE_GATE_STRONG_ADMIN_PROOF_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
            ACTIVE_GATE_STRONG_ADMIN_PROOF_MISSING_NODE_IDS,
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
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
        return typeof error?.message === TYPEOF.STRING &&
          error.message.includes(ACTIVE_GATE_STALLED_MESSAGE);
      },
      ACTIVE_GATE_STRONG_ADMIN_PROOF_TIMEOUT_ASSERTION,
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      ACTIVE_GATE_TIMEOUT_DIAGNOSTICS_ASSERTION,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      ACTIVE_GATE_NO_PROGRESS_TERMINAL_CLASS_CODE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.cause,
      ACTIVE_GATE_NONE_CAUSE,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      ACTIVE_GATE_STARTUP_MODE,
    );
    assert.equal(
      collectedFailureLogs,
      true,
      ACTIVE_GATE_STRONG_ADMIN_PROOF_LOGS_ASSERTION,
    );
  });
