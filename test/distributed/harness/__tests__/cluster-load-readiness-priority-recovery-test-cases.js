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
import {ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE} from
  '../../../../src/admin/admin-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE =
  'discovery_node_coverage_gap';
const SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING = 'pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK =
  'durable_readback_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED = true;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
const SNAPSHOT_REPLAY_TEST_NODE_ID = Object.freeze({
  SEED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  BASELINE: '11601fe0-72d6-5853-8590-ec2881853e72',
  ADMIN_READY_STALE: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  STRONG_EXTRA: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  STALE_EXTRA: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_REACHABILITY_DELAY_ZERO = 0;
const ACTIVE_GATE_REACHABILITY_DELAY_ONE = 1;
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE = 'inactive';
const ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS = 2;
const ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT = 2;
const ACTIVE_GATE_NO_PROGRESS_ZERO_COVERAGE = 0;
const ACTIVE_GATE_NO_PROGRESS_PUBLICATION_EPOCH = 1;
const ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE;
const ACTIVE_GATE_NO_PROGRESS_RETRY_AFTER_MS = 25300;
const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY = 3000;
const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID +
  ' on lane snapshot after ' +
  ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY +
  'ms';
const ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
  SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
]);
const ACTIVE_GATE_NO_PROGRESS_REASONS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE,
]);
const ACTIVE_GATE_NO_PROGRESS_TERMINAL_GATE_REASONS = Object.freeze([
  'publication_convergence_missing',
  'publication_missing_active_node=' + SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
]);
const LOAD_READINESS_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME =
  'Unit: waitForLoadReadinessStability keeps metric-moving snapshot when ' +
  'terminal probe regresses to selected timeout';
const LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS = 1000;
const LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS = 200;
const LOAD_READINESS_NO_PROGRESS_PHASE = 'pre_load';
const LOAD_READINESS_NO_PROGRESS_STAGE = 'scenario.load-readiness.waiting';
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
test(LOAD_READINESS_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME, async () => {
  const cluster = createCluster({
    size: ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });

  cluster._sleep = async () => {};
  cluster._collectFailureLogs = async () => {};
  const recordedStages = [];
  cluster._recordClusterStage = (stage, details = {}) => {
    recordedStages.push({stage, details});
  };
  const nodeDiagnostics = SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.map(
    (nodeId) => ({
      nodeId,
      active: false,
      state: ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE,
      reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
    }),
  );
  const priorityPartitionSummary = {
    satisfied: true,
    totalSpreadGap: ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
    blockedPartitionCount: ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
  };
  const metricMovingResult = {
    allActive: false,
    nodeDiagnostics,
    snapshotCoverage: {
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT,
      bestCoverageNodeCount: ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT,
      selectedNodeId: ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID,
      selectedAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedSnapshotTimeoutMs:
        ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY,
      selectedSnapshotObservationMode:
        ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
      selectedSnapshotObservationState:
        CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
      selectedSnapshotObservationContractState: OWNER_CONTRACT_STATE.DEFERRED,
      selectedSnapshotObservationRefreshState:
        CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      selectedSnapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      selectedSnapshotObservationReasonCodes: [
        ...ACTIVE_GATE_NO_PROGRESS_REASONS,
      ],
      selectedSnapshotObservationRetryAfterMs:
        ACTIVE_GATE_NO_PROGRESS_RETRY_AFTER_MS,
      selectedSnapshotRepairDeferred: true,
      selectedPublicationConvergence: {
        publicationEpoch: ACTIVE_GATE_NO_PROGRESS_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        recoveryProtocolState: 'publication_pending',
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS,
        ],
        pendingAckNodeIds: [ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID],
        priorityPartitionSummary,
      },
      selectedPublishedActiveNodeIds: [
        ...ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS,
      ],
      selectedMissingPublishedNodeIds: [
        ...ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS,
      ],
      selectedPublicationActiveGateHandoff: {
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        nextAction: SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
        runtimePromotionAllowed:
          SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID,
        ],
        pendingReconcileCount: ACTIVE_GATE_REACHABILITY_DELAY_ONE,
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        reasonCode: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
        enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
        retryAfterMs: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
      },
      selectedError: null,
    },
    publicationConvergenceGate: {
      ready: false,
      reasons: [
        'publication_pending_ack=' +
          String(ACTIVE_GATE_REACHABILITY_DELAY_ONE),
      ],
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      recoveryProtocolState: 'publication_pending',
      pendingAckNodeIds: [ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID],
      missingPublishedNodeIds: [
        ...ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS,
      ],
      missingPublishedCount: ACTIVE_GATE_REACHABILITY_DELAY_ONE,
      priorityPartitionSummary,
    },
  };
  const regressedTimeoutResult = {
    allActive: false,
    nodeDiagnostics,
    snapshotCoverage: {
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT,
      bestCoverageNodeCount: ACTIVE_GATE_NO_PROGRESS_ZERO_COVERAGE,
      selectedNodeId: ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID,
      selectedAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedSnapshotTimeoutMs:
        ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS_PER_QUERY,
      selectedError: ACTIVE_GATE_NO_PROGRESS_TIMEOUT_ERROR,
    },
    publicationConvergenceGate: {
      ready: false,
      reasons: [...ACTIVE_GATE_NO_PROGRESS_TERMINAL_GATE_REASONS],
      publicationStatus: null,
      pendingAckNodeIds: [],
      missingPublishedNodeIds: [],
      priorityPartitionSummary: null,
    },
  };
  let probeCount = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
  cluster._probeClusterActiveState = async () => {
    probeCount += ACTIVE_GATE_REACHABILITY_DELAY_ONE;
    return probeCount === ACTIVE_GATE_REACHABILITY_DELAY_ONE ?
      metricMovingResult :
      regressedTimeoutResult;
  };

  await assert.rejects(
    async () => cluster.waitForLoadReadinessStability({
      stableWindowMs: LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS,
      timeoutMs: LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS,
      noProgressMaxAttempts: ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS,
      loadReadinessPhase: LOAD_READINESS_NO_PROGRESS_PHASE,
    }),
    (error) => {
      assert.match(error.message, /coverage=2\/5/);
      assert.doesNotMatch(error.message, /snapshotError/);
      assert.strictEqual(
        error?.diagnostics?.activeGate?.progress?.snapshotCoverageNodeCount,
        ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT,
      );
      assert.strictEqual(
        error?.diagnostics?.noProgress?.currentProgress
          ?.snapshotCoverageNodeCount,
        ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT,
      );
      assert.match(
        error?.diagnostics?.noProgress?.lastProgressEvent?.message || '',
        /coverage=0\/5/,
      );
      return true;
    },
  );

  const stalledStage = recordedStages.find((entry) => {
    return entry.stage === LOAD_READINESS_NO_PROGRESS_STAGE &&
      entry.details?.activeGate?.state === 'stalled';
  });
  assert.ok(stalledStage, 'should record stalled load-readiness details');
  assert.strictEqual(
    stalledStage.details?.activeGateProgress?.snapshotCoverageNodeCount,
    ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT,
  );
});

test('Unit: _waitForAllActive treats CL-003 witness as load-mode soft success',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
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
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: [],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGate?.state === 'stalled';
    });
    assert.equal(
      waitingStage,
      undefined,
      'soft-success closure should complete without recording a stalled waiting-active stage',
    );
    assert.equal(
      collectedFailureLogs,
      false,
      'soft-success closure should not trigger failure log collection',
    );
  });

test('Unit: _waitForAllActive respects an existing CL-003 gate witness in load mode',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    const CL_003 = 'CL-003';
    const CL_003_WITNESS_CLASS =
      'publication_converged_priority_spread_pending';

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
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedPublicationConvergence: {
            publicationEpoch: 15,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: 0,
              totalSpreadGap: 0,
            },
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: [],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
          closureRecordId: CL_003,
          closureWitnessClass: CL_003_WITNESS_CLASS,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGate?.state === 'stalled';
    });
    assert.equal(
      waitingStage,
      undefined,
      'an explicit CL-003 witness should complete load-mode ACTIVE wait without a no-progress stall',
    );
    assert.equal(
      collectedFailureLogs,
      false,
      'an explicit CL-003 witness should not trigger failure log collection',
    );
  });

test('Unit: _waitForAllActive derives CL-003 load-mode soft success from ' +
  'selected priority-recovery decision snapshots', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      convergence: 200,
      activeWaitNoProgressMaxAttempts: 2,
    },
  });

  const CL_003 = 'CL-003';
  const CL_003_WITNESS_CLASS =
    'publication_converged_priority_spread_pending';

  cluster._sleep = async () => {};
  let collectedFailureLogs = false;
  cluster._collectFailureLogs = async () => {
    collectedFailureLogs = true;
  };

  const recordedStages = [];
  cluster._recordClusterStage = (stage, details = {}) => {
    recordedStages.push({stage, details});
  };

  for (const [index, nodeId] of ['seed-1', 'joiner-1'].entries()) {
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: index === 0 ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeTrafficReadiness() {
        return {
          status: 503,
          state: 'traffic_blocked',
          reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        };
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: 'admin_health',
          lastError: null,
        };
      },
    });
  }

  cluster._probeControlSnapshotCoverage = async () => {
    return {
      completeCoverage: true,
      expectedNodeCount: 2,
      bestCoverageNodeCount: 2,
      selectedNodeId: 'seed-1',
      selectedAdminReady: true,
      selectedReachableBy: 'admin_health',
      selectedPublicationConvergence: {
        publicationEpoch: 16,
        publicationStatus: 'PUBLISHED',
        publishedActiveNodeIds: ['seed-1', 'joiner-1'],
        pendingAckNodeIds: [],
        recoveryProtocolState: 'steady_published',
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          totalSpreadGap: 0,
        },
      },
      selectedPublicationConvergenceGate: {
        publicationStatus: 'PUBLISHED',
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
        recoveryProtocolState: 'steady_published',
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          totalSpreadGap: 0,
        },
      },
      selectedPriorityRecoveryDecisionSnapshots: {
        closureWitness: {
          closureRecordId: CL_003,
          closureWitnessClass: CL_003_WITNESS_CLASS,
          prioritySpreadPending: false,
          blockedPartitionIds: [],
          blockedPartitionCount: 0,
          unresolvedSemanticStateIds: [],
          satisfiedPartitionIds: ['control_plane_publications-p1'],
          decisionPartitionIds: ['control_plane_publications-p1'],
          refreshedPriorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
        },
        snapshots: [],
      },
      selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
      selectedMissingPublishedNodeIds: [],
      selectedError: null,
    };
  };

  await cluster._waitForAllActive({mode: 'load'});

  const waitingStage = recordedStages.find((entry) => {
    return entry.stage === 'setup.cluster.waiting-active' &&
      entry.details?.activeGate?.state === 'stalled';
  });
  assert.equal(
    waitingStage,
    undefined,
    'selected decision-snapshot closure evidence should complete load-mode ACTIVE wait without a no-progress stall',
  );
  assert.equal(
    collectedFailureLogs,
    false,
    'selected decision-snapshot closure evidence should not trigger failure log collection',
  );
});

