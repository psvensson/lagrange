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
import {SERVICE_STATUS} from '../../../../src/constants/index.js';
import {
  createCluster,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE = 5;
const SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS = 5000;
const SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS = 1777976838250;
const SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH = 2;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE =
  'discovery_node_coverage_gap';
const SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS = 250;
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
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects the remaining pending ' +
  'owner-reconcile node into startup snapshot coverage';
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects paired pending ' +
  'owner-reconcile nodes into startup snapshot coverage';
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
const SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
]);
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
const ACTIVE_GATE_REACHABILITY_DELAY_ZERO = 0;
const ACTIVE_GATE_REACHABILITY_DELAY_ONE = 1;
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE = 'active';
const ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE = 'inactive';
const ACTIVE_GATE_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME =
  'Unit: _waitForAllActive keeps metric-moving snapshot when terminal probe ' +
  'regresses to selected timeout';
const ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_TEST_NAME =
  'Unit: _waitForAllActive keeps best snapshot coverage when active count ' +
  'later regresses to selected timeout';
const ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS = 200;
const ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS = 2;
const ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT = 2;
const ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT = 4;
const ACTIVE_GATE_NO_PROGRESS_ZERO_COVERAGE = 0;
const ACTIVE_GATE_NO_PROGRESS_PUBLICATION_EPOCH = 1;
const ACTIVE_GATE_NO_PROGRESS_WAITING_STAGE = 'setup.cluster.waiting-active';
const ACTIVE_GATE_NO_PROGRESS_PENDING_REASON =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
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
test(SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTION_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });

    cluster._nodes.set(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      {
        id: SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
        role: NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          };
        },
        async getControlSnapshot() {
          return {
            rows: [{
              nodes:
                SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_OBSERVED_NODE_IDS,
              capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
              observationMode:
                ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
              snapshotObservation: {
                state:
                  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
                contractState: OWNER_CONTRACT_STATE.DEFERRED,
                nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
                reasonCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
                retryAfterMs: SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
                refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
              },
              adminObservation: {
                repair: {
                  deferred: true,
                  triggerCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
                },
              },
              controlPlaneDiagnostics: {
                publicationConvergence: {
                  publicationEpoch:
                    SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
                  publicationStatus:
                    CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
                  publishedActiveNodeIds:
                    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                  pendingAckNodeIds: [],
                  acknowledgedNodeIds:
                    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                },
                publicationActiveGateHandoff: {
                  state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
                  reasonCode:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
                  nextAction:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
                  runtimePromotionAllowed:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
                  publishedActiveNodeIds:
                    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                  missingPublishedNodeIds:
                    SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS,
                  pendingReconcileNodeIds:
                    SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS,
                  pendingReconcileCount:
                    SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS.length,
                },
                membershipPublicationHandoffOutcome: {
                  state:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
                  reasonCode:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
                  enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
                  retryAfterMs:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
                },
              },
            }],
          };
        },
        async getLogs() {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      },
    );

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
    );

    assert.strictEqual(
      coverage.bestCoverageNodeCount,
      SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTED_NODE_IDS.length,
    );
    assert.strictEqual(coverage.completeCoverage, false);
    assert.deepStrictEqual(
      coverage.selectedObservedNodeIds,
      SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_PROJECTED_NODE_IDS,
    );
    assert.deepStrictEqual(
      coverage.selectedPublicationActiveGateHandoff?.pendingReconcileNodeIds,
      SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS,
    );
    assert.strictEqual(
      coverage.selectedPublicationActiveGateHandoff?.pendingReconcileCount,
      SNAPSHOT_REPLAY_TEST_REMAINING_RECONCILE_NODE_IDS.length,
    );
  });

test(SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTION_TEST_NAME,
  async () => {
    const cluster = createCluster({
      size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
      image: SNAPSHOT_REPLAY_TEST_IMAGE,
    });

    cluster._nodes.set(
      SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
      {
        id: SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
        role: NODE_ROLES.JOINER,
        async getStatus() {
          return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
        },
        async getReachabilityDiagnostics() {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          };
        },
        async getControlSnapshot() {
          return {
            rows: [{
              nodes:
                SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_OBSERVED_NODE_IDS,
              capturedAtMs: SNAPSHOT_REPLAY_TEST_ADMIN_CAPTURED_AT_MS,
              observationMode:
                ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
              snapshotObservation: {
                state:
                  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
                contractState: OWNER_CONTRACT_STATE.DEFERRED,
                nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
                reasonCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
                retryAfterMs: SNAPSHOT_REPLAY_TEST_REPAIR_RETRY_AFTER_MS,
                refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
              },
              adminObservation: {
                repair: {
                  deferred: true,
                  triggerCodes: [SNAPSHOT_REPLAY_TEST_REPAIR_TRIGGER_CODE],
                },
              },
              controlPlaneDiagnostics: {
                publicationConvergence: {
                  publicationEpoch:
                    SNAPSHOT_REPLAY_TEST_STALE_PUBLICATION_EPOCH,
                  publicationStatus:
                    CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
                  publishedActiveNodeIds:
                    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                  pendingAckNodeIds: [],
                  acknowledgedNodeIds:
                    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                },
                publicationActiveGateHandoff: {
                  state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
                  reasonCode:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
                  nextAction:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
                  runtimePromotionAllowed:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
                  publishedActiveNodeIds:
                    SNAPSHOT_REPLAY_TEST_PENDING_HANDOFF_PUBLISHED_NODE_IDS,
                  missingPublishedNodeIds:
                    SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS,
                  pendingReconcileNodeIds:
                    SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS,
                  pendingReconcileCount:
                    SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS.length,
                },
                membershipPublicationHandoffOutcome: {
                  state:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
                  reasonCode:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_REASON_READBACK,
                  enqueued: SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_ENQUEUED,
                  retryAfterMs:
                    SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_RETRY_AFTER_MS,
                },
              },
            }],
          };
        },
        async getLogs() {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      },
    );

    const coverage = await cluster._probeControlSnapshotCoverage(
      Date.now() + SNAPSHOT_REPLAY_TEST_DEADLINE_EXTENSION_MS,
      SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
    );

    assert.strictEqual(
      coverage.bestCoverageNodeCount,
      SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTED_NODE_IDS.length,
    );
    assert.strictEqual(coverage.completeCoverage, true);
    assert.deepStrictEqual(
      coverage.selectedObservedNodeIds,
      SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_PROJECTED_NODE_IDS,
    );
    assert.deepStrictEqual(
      coverage.selectedPublicationActiveGateHandoff?.pendingReconcileNodeIds,
      SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS,
    );
    assert.strictEqual(
      coverage.selectedPublicationActiveGateHandoff?.pendingReconcileCount,
      SNAPSHOT_REPLAY_TEST_PAIRED_RECONCILE_NODE_IDS.length,
    );
    assert.strictEqual(
      coverage.selectedPublicationActiveGateHandoff?.runtimePromotionAllowed,
      SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
    );
  });

test('Unit: _waitForAllActive carries selected snapshot witness into no-progress diagnostics',
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
    cluster._collectFailureLogs = async () => {};
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
          completeCoverage: false,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 1,
          selectedNodeId: 'seed-1',
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedSnapshotObservationMode: 'repair_deferred',
          selectedSnapshotObservationState: 'stale_usable',
          selectedSnapshotObservationContractState: 'pending',
          selectedSnapshotObservationRefreshState: 'idle',
          selectedSnapshotObservationNextAction: 'wait',
          selectedSnapshotObservationReasonCodes: [
            'discovery_node_coverage_gap',
          ],
          selectedSnapshotObservationRetryAfterMs: 250,
          selectedSnapshotRepairDeferred: true,
          selectedPublicationConvergence: {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1'],
          selectedMissingPublishedNodeIds: ['joiner-1'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['publication_missing_active_node=joiner-1'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: ['joiner-1'],
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

    await assert.rejects(
      async () => cluster._waitForAllActive({mode: 'load'}),
      (error) => {
        assert.match(error.message, /snapshotNode=seed-1#adminReady=true/);
        assert.match(
          error.message,
          /snapshotObservation=repair_deferred\/stale_usable\/pending\/idle\/wait#repairDeferred=true#reasons=discovery_node_coverage_gap#retryAfterMs=250/,
        );
        assert.match(error.message, /missingPublishedIds=joiner-1/);
        assert.equal(
          error?.diagnostics?.noProgress?.currentProgress?.selectedSnapshotNodeId,
          'seed-1',
        );
        assert.deepStrictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedSnapshotObservationReasonCodes,
          ['discovery_node_coverage_gap'],
        );
        assert.strictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedSnapshotRepairDeferred,
          true,
        );
        assert.deepStrictEqual(
          error?.diagnostics?.noProgress?.currentProgress
            ?.selectedMissingPublishedNodeIds,
          ['joiner-1'],
        );
        return true;
      },
    );

    const waitingStage = recordedStages.find((entry) => {
      return entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGate?.state === 'stalled';
    });
    assert.ok(waitingStage, 'should record waiting-active stall details');
    assert.equal(
      waitingStage.details?.activeGateProgress?.selectedSnapshotNodeId,
      'seed-1',
    );
    assert.deepStrictEqual(
      waitingStage.details?.activeGateProgress?.selectedMissingPublishedNodeIds,
      ['joiner-1'],
    );
  });

test(ACTIVE_GATE_NO_PROGRESS_BEST_SNAPSHOT_TEST_NAME, async () => {
  const cluster = createCluster({
    size: ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
    timeouts: {
      convergence: ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS,
      activeWaitNoProgressMaxAttempts: ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS,
    },
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
  const priorityRecoveryInvariants = {
    invariants: [],
    failingInvariantIds: [],
    failingInvariantReasonCodes: [],
    passed: true,
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
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: 'steady_published',
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_NO_PROGRESS_PUBLISHED_NODE_IDS,
        ],
        pendingAckNodeIds: [],
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
          ...ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS.length,
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
        'publication_missing_active_node=' +
          ACTIVE_GATE_NO_PROGRESS_SELECTED_NODE_ID,
      ],
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: 'steady_published',
      pendingAckNodeIds: [],
      missingPublishedNodeIds: [
        ...ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS,
      ],
      missingPublishedCount: ACTIVE_GATE_NO_PROGRESS_MISSING_NODE_IDS.length,
      priorityPartitionSummary,
    },
    priorityRecoveryInvariants,
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
    priorityRecoveryInvariants,
  };
  let probeCount = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
  cluster._probeClusterActiveState = async () => {
    probeCount += ACTIVE_GATE_REACHABILITY_DELAY_ONE;
    return probeCount === ACTIVE_GATE_REACHABILITY_DELAY_ONE ?
      metricMovingResult :
      regressedTimeoutResult;
  };

  await assert.rejects(
    async () => cluster._waitForAllActive({mode: 'load'}),
    (error) => {
      assert.match(error.message, /coverage=2\/5/);
      assert.doesNotMatch(error.message, /snapshotError/);
      assert.match(
        error.message,
        /snapshotObservation=repair_deferred\/deferred_refresh\/deferred\/deferred\/retry/,
      );
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
    return entry.stage === 'setup.cluster.waiting-active' &&
      entry.details?.activeGate?.state === 'stalled';
  });
  assert.ok(stalledStage, 'should record stalled active-gate details');
  assert.strictEqual(
    stalledStage.details?.activeGateProgress?.snapshotCoverageNodeCount,
    ACTIVE_GATE_NO_PROGRESS_COVERAGE_NODE_COUNT,
  );
});

test(ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_TEST_NAME, async () => {
  const cluster = createCluster({
    size: ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
    timeouts: {
      convergence: ACTIVE_GATE_NO_PROGRESS_TIMEOUT_MS,
      activeWaitNoProgressMaxAttempts: ACTIVE_GATE_NO_PROGRESS_MAX_ATTEMPTS,
    },
  });

  cluster._sleep = async () => {};
  cluster._collectFailureLogs = async () => {};
  const recordedStages = [];
  cluster._recordClusterStage = (stage, details = {}) => {
    recordedStages.push({stage, details});
  };
  const buildNodeDiagnostics = (activeNodeIds) => {
    return SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.map((nodeId) => {
      const active = activeNodeIds.includes(nodeId);
      return {
        nodeId,
        active,
        state: active ?
          ACTIVE_GATE_REACHABILITY_DELAY_STATE_ACTIVE :
          ACTIVE_GATE_REACHABILITY_DELAY_STATE_INACTIVE,
        reasons: active ? [] : [ACTIVE_GATE_NO_PROGRESS_PENDING_REASON],
      };
    });
  };
  const partialCoverageNodeIds =
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.slice(
      ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
      ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT,
    );
  const mostlyActiveNodeIds =
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS.slice(
      ACTIVE_GATE_REACHABILITY_DELAY_ZERO,
      ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT -
        ACTIVE_GATE_REACHABILITY_DELAY_ONE,
    );
  const bestCoverageResult = {
    allActive: false,
    nodeDiagnostics: buildNodeDiagnostics([
      SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    ]),
    snapshotCoverage: {
      completeCoverage: false,
      expectedNodeCount: ACTIVE_GATE_NO_PROGRESS_EXPECTED_NODE_COUNT,
      bestCoverageNodeCount: ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT,
      selectedNodeId: SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      selectedAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedPublicationConvergence: {
        publicationEpoch: ACTIVE_GATE_NO_PROGRESS_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publishedActiveNodeIds: [...partialCoverageNodeIds],
        pendingAckNodeIds: [],
      },
      selectedPublishedActiveNodeIds: [...partialCoverageNodeIds],
      selectedMissingPublishedNodeIds: [
        SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
      ],
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
  const regressedTimeoutResult = {
    allActive: false,
    nodeDiagnostics: buildNodeDiagnostics(mostlyActiveNodeIds),
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
      ready: true,
      reasons: [],
      publicationStatus: null,
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
  let probeCount = ACTIVE_GATE_REACHABILITY_DELAY_ZERO;
  cluster._probeClusterActiveState = async () => {
    probeCount += ACTIVE_GATE_REACHABILITY_DELAY_ONE;
    return probeCount === ACTIVE_GATE_REACHABILITY_DELAY_ONE ?
      bestCoverageResult :
      regressedTimeoutResult;
  };

  await assert.rejects(
    async () => cluster._waitForAllActive({mode: 'load'}),
    (error) => {
      assert.match(error.message, /coverage=4\/5/);
      assert.strictEqual(
        error?.diagnostics?.activeGate?.progress?.snapshotCoverageNodeCount,
        ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT,
      );
      assert.match(
        error?.diagnostics?.activeGate?.lastProgressEvent?.message || '',
        /active=4\/5,coverage=0\/5.*snapshotError/u,
      );
      return true;
    },
  );

  const stalledStage = recordedStages.find((entry) => {
    return entry.stage === ACTIVE_GATE_NO_PROGRESS_WAITING_STAGE &&
      entry.details?.activeGate?.state === 'stalled';
  });
  assert.ok(stalledStage, 'should record stalled active-gate details');
  assert.strictEqual(
    stalledStage.details?.activeGateProgress?.snapshotCoverageNodeCount,
    ACTIVE_GATE_NO_PROGRESS_BEST_COVERAGE_NODE_COUNT,
  );
});

