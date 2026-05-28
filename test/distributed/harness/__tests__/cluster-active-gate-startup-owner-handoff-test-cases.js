/**
 * Startup active-gate owner handoff tests for cluster module.
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
const SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS = 1777976837236;
const SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const SNAPSHOT_REPLAY_TEST_IMAGE = 'distributed-db:test';
const SNAPSHOT_REPLAY_TEST_EMPTY_LOG = '';
const SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE = 'admin_health';
const SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING = 'pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
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
const ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS = 5000;
const ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH = 3;
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_TEST_NAME =
  'Unit: _probeClusterActiveState resolves stale selected ACK covered by ' +
  'startup owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_STALE_ACK_TEST_NAME =
  'Unit: _probeClusterActiveState resolves stale selected ACK covered by ' +
  'startup owner-recovery handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_TEST_NAME =
  'Unit: _probeControlSnapshotCoverage projects pending owner-recovery ' +
  'node into startup snapshot coverage';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_TEST_NAME =
  'Unit: _probeClusterActiveState projects selected-timeout owner-recovery ' +
  'node during startup';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ENQUEUED_QUEUE_TEST_NAME =
  'Unit: _probeClusterActiveState wakes already-enqueued owner-recovery ' +
  'queue during startup';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_TEST_NAME =
  'Unit: _probeClusterActiveState projects selected-timeout inherited ' +
  'readiness support during startup';
const ACTIVE_GATE_STARTUP_SELECTED_SOURCE_RECONCILE_TIMEOUT_TEST_NAME =
  'Unit: _probeClusterActiveState projects selected source readiness timeout ' +
  'with owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_GUARDRAIL_TEST_NAME =
  'Unit: _probeClusterActiveState keeps stale selected ACK blocked without ' +
  'startup owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_TEST_NAME =
  'Unit: _probeClusterActiveState resolves no-ACK missing-published ' +
  'residual with startup owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_GUARDRAIL_TEST_NAME =
  'Unit: _probeClusterActiveState keeps no-ACK missing-published residual ' +
  'blocked without startup owner-reconcile handoff';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS = 200;
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE = 'JOIN_READY';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE = 'active';
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_COVERAGE_COUNT = 3;
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
    SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PUBLISHED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS =
  Object.freeze([]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECONCILE_NODE_IDS =
  Object.freeze([]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECOVERY_NODE_IDS =
  Object.freeze([]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_RECONCILE_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_HANDOFF_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_OBSERVED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PUBLISHED_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS =
  Object.freeze([
    SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
  ]);
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_NODE_IDS = Object.freeze([
  SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
]);
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID +
  ' on lane snapshot after 100ms';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_READINESS_TIMEOUT_ERROR =
  'Node readiness probe timed out for ' +
  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_NODE_ID =
  SNAPSHOT_REPLAY_TEST_NODE_ID.SEED;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_ERROR =
  'Node readiness probe timed out for ' +
  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_NODE_ID;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS = 100;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_PENDING_WRITES = 1;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_GROWTH_COUNT = 0;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_HANDOFF_ENQUEUED = false;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_HANDOFF_ALREADY_ENQUEUED = true;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ADMISSION_DEGRADED =
  'degraded_but_proceeding';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_MODE =
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_STATE =
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_CONTRACT_STATE =
  OWNER_CONTRACT_STATE.DEFERRED;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_NEXT_ACTION =
  OWNER_CONTRACT_NEXT_ACTION.RETRY;
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_REASON_SELECTED_TIMEOUT =
  'selected_timeout';
const ACTIVE_GATE_STARTUP_OWNER_RECOVERY_WRITE_DEFERRED =
  SNAPSHOT_REPLAY_TEST_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED;

function buildStartupOwnerReconcilePartialCoverageCluster({
  includeOwnerReconcileHandoff,
  handoffNextAction = SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_RECONCILE,
  pendingAckNodeIds = ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS,
  pendingReconcileNodeIds =
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_RECONCILE_NODE_IDS,
  pendingRecoveryNodeIds =
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECOVERY_NODE_IDS,
  handoffMissingPublishedNodeIds =
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS,
  readinessTimeoutNodeId = null,
  selectedNodeId = SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
  selectedObservedNodeIds =
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_OBSERVED_NODE_IDS,
  selectedPublishedActiveNodeIds =
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PUBLISHED_NODE_IDS,
  publicationDisagreementByNodeId = null,
}) {
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
      async probeBootstrapReadiness() {
        if (nodeId === readinessTimeoutNodeId) {
          throw new Error('Node readiness probe timed out for ' + nodeId);
        }
        return {
          status: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS,
          phase: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE,
          state: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE,
          reasons: [],
        };
      },
      async getReachabilityDiagnostics() {
        return {
          reachable: true,
          adminReady: true,
          reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
          lastError: null,
        };
      },
      async getLogs(_options) {
        return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
      },
    });
  }
  cluster._probeControlSnapshotCoverage = async () => {
    const selectedPublicationActiveGateHandoff =
      includeOwnerReconcileHandoff === true ?
        {
          state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
          reasonCode:
            SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
          nextAction: handoffNextAction,
          runtimePromotionAllowed:
            SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publishedActiveNodeIds:
            ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PUBLISHED_NODE_IDS,
          missingPublishedNodeIds: handoffMissingPublishedNodeIds,
          pendingReconcileNodeIds,
          pendingReconcileCount: pendingReconcileNodeIds.length,
          pendingRecoveryNodeIds,
          pendingRecoveryCount: pendingRecoveryNodeIds.length,
        } :
        null;
    return {
      completeCoverage: false,
      expectedNodeCount: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      bestCoverageNodeCount:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_COVERAGE_COUNT,
      selectedNodeId,
      selectedSnapshotNodeId: selectedNodeId,
      selectedAdminReady: true,
      selectedSnapshotAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedSnapshotReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedError: null,
      selectedObservedNodeIds,
      selectedPublishedActiveNodeIds,
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS,
      selectedPendingAckNodeIds: pendingAckNodeIds,
      ...(publicationDisagreementByNodeId ?
        {publicationDisagreementByNodeId} :
        {}),
      selectedPublicationConvergenceGate: {
        ready: false,
        pendingAckNodeIds,
        missingPublishedNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS,
        priorityPartitionSummary: {
          satisfied: true,
        },
      },
      selectedPublicationConvergence: {
        publicationEpoch: ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publishedActiveNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PUBLISHED_NODE_IDS,
        pendingAckNodeIds,
      },
      ...(selectedPublicationActiveGateHandoff ?
        {selectedPublicationActiveGateHandoff} :
        {}),
    };
  };
  return cluster;
}

test(ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_TEST_NAME, async () => {
  const cluster = buildStartupOwnerReconcilePartialCoverageCluster({
    includeOwnerReconcileHandoff: true,
  });

  const probeResult = await cluster._probeClusterActiveState(
    Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
  );

  assert.strictEqual(
    probeResult.allActive,
    true,
    'owner-reconcile handoff should resolve stale selected ACK for startup',
  );
  assert.strictEqual(
    probeResult.snapshotCoverage.bestCoverageNodeCount,
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_COVERAGE_COUNT,
    'startup coverage should remain partial at the selected witness',
  );
  assert.deepStrictEqual(
    probeResult.snapshotCoverage.selectedPendingAckNodeIds,
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS,
    'selected snapshot still records the stale pending ACK witness',
  );
});

test(ACTIVE_GATE_STARTUP_OWNER_RECOVERY_STALE_ACK_TEST_NAME, async () => {
  const cluster = buildStartupOwnerReconcilePartialCoverageCluster({
    includeOwnerReconcileHandoff: true,
    handoffNextAction:
      SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
    pendingReconcileNodeIds:
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECONCILE_NODE_IDS,
    pendingRecoveryNodeIds:
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS,
  });

  const probeResult = await cluster._probeClusterActiveState(
    Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
  );

  assert.strictEqual(
    probeResult.allActive,
    true,
    'owner-recovery handoff should resolve stale selected ACK for startup',
  );
  assert.deepStrictEqual(
    probeResult.snapshotCoverage.selectedPendingAckNodeIds,
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS,
    'selected snapshot still records the stale pending ACK witness',
  );
  assert.deepStrictEqual(
    probeResult.snapshotCoverage.selectedPublicationActiveGateHandoff
      .pendingRecoveryNodeIds,
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS,
    'owner-recovery handoff should preserve pending recovery diagnostics',
  );
});

test(ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_TEST_NAME, async () => {
  const cluster = createCluster({
    size: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
    docker: {socketPath: SNAPSHOT_REPLAY_TEST_DOCKER_SOCKET_PATH},
    image: SNAPSHOT_REPLAY_TEST_IMAGE,
  });
  cluster._nodes.set(SNAPSHOT_REPLAY_TEST_NODE_ID.SEED, {
    id: SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    role: NODE_ROLES.SEED,
    async getStatus() {
      return {rows: [{status: SERVICE_STATUS.ACTIVE}]};
    },
    async getReachabilityDiagnostics() {
      return {
        reachable: true,
        adminReady: true,
        reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
        lastError: null,
      };
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_OBSERVED_NODE_IDS,
          capturedAtMs: SNAPSHOT_REPLAY_TEST_SEED_CAPTURED_AT_MS,
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: ACTIVE_GATE_PARTIAL_RESIDUAL_PUBLICATION_EPOCH,
              publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
              publishedActiveNodeIds:
                ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PUBLISHED_NODE_IDS,
              publicationActiveGateHandoff: {
                state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
                reasonCode:
                  SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
                nextAction:
                  SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
                runtimePromotionAllowed:
                  SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
                pendingReconcileNodeIds:
                  ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECONCILE_NODE_IDS,
                pendingRecoveryNodeIds:
                  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
              },
            },
          },
        }],
      };
    },
    async getLogs(_options) {
      return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
    },
  });

  const coverage = await cluster._probeControlSnapshotCoverage(
    Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    SNAPSHOT_REPLAY_TEST_EXPECTED_NODE_IDS,
  );

  assert.deepStrictEqual(
    new Set(coverage.selectedObservedNodeIds),
    new Set(ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_NODE_IDS),
    'owner-recovery handoff should project the pending recovery node',
  );
  assert.strictEqual(
    coverage.bestCoverageNodeCount,
    ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_NODE_IDS.length,
    'owner-recovery projection should move startup snapshot coverage',
  );
  assert.strictEqual(
    coverage.completeCoverage,
    false,
    'owner-recovery projection should not complete active-gate coverage',
  );
});

test(
  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_TEST_NAME,
  async () => {
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
        async probeBootstrapReadiness() {
          if (
            nodeId ===
            ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID
          ) {
            throw new Error(
              ACTIVE_GATE_STARTUP_OWNER_RECOVERY_READINESS_TIMEOUT_ERROR,
            );
          }
          return {
            status: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS,
            phase: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE,
            state: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE,
            reasons: [],
          };
        },
        async getReachabilityDiagnostics() {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
            lastError: null,
          };
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }
    cluster._probeControlSnapshotCoverage = async () => ({
      completeCoverage: false,
      expectedNodeCount: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      bestCoverageNodeCount:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS.length,
      selectedNodeId:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
      selectedSnapshotNodeId:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
      selectedAdminReady: true,
      selectedSnapshotAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedSnapshotReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedError: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_ERROR,
      selectedSnapshotObservationMode:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_MODE,
      selectedSnapshotObservationState:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_STATE,
      selectedSnapshotObservationContractState:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_CONTRACT_STATE,
      selectedSnapshotObservationRefreshState:
        CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      selectedSnapshotObservationNextAction:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_NEXT_ACTION,
      selectedSnapshotObservationRetryAfterMs:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_REASON_SELECTED_TIMEOUT,
      ],
      selectedSnapshotRepairDeferred: true,
      selectedObservedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
      selectedPublishedActiveNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PUBLISHED_NODE_IDS,
      selectedPendingAckNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      selectedPublicationActiveGateHandoff: {
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        nextAction:
          SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed:
          SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingReconcileNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECONCILE_NODE_IDS,
        pendingRecoveryNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_WRITE_DEFERRED,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        enqueued: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_HANDOFF_ENQUEUED,
        retryAfterMs:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_PENDING_WRITES,
        pendingWriteGrowthCount:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_GROWTH_COUNT,
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    );
    const projectedDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId ===
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
    );

    assert.strictEqual(
      projectedDiagnostic.active,
      true,
      'selected-timeout owner-recovery node should be projected active',
    );
    assert.strictEqual(
      projectedDiagnostic.admissionState,
      ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ADMISSION_DEGRADED,
      'selected-timeout owner-recovery projection stays degraded',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'selected-timeout owner-recovery progress should satisfy startup gate',
    );
  },
);

test(
  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ENQUEUED_QUEUE_TEST_NAME,
  async () => {
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
        async probeBootstrapReadiness() {
          if (
            nodeId ===
            ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID
          ) {
            throw new Error(
              ACTIVE_GATE_STARTUP_OWNER_RECOVERY_READINESS_TIMEOUT_ERROR,
            );
          }
          return {
            status: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS,
            phase: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE,
            state: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE,
            reasons: [],
          };
        },
        async getReachabilityDiagnostics() {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
            lastError: null,
          };
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }
    cluster._probeControlSnapshotCoverage = async () => ({
      completeCoverage: false,
      expectedNodeCount: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      bestCoverageNodeCount:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS.length,
      selectedNodeId:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
      selectedSnapshotNodeId:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
      selectedAdminReady: true,
      selectedSnapshotAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedSnapshotReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedError: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_ERROR,
      selectedSnapshotObservationMode:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_MODE,
      selectedSnapshotObservationState:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_STATE,
      selectedSnapshotObservationContractState:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_CONTRACT_STATE,
      selectedSnapshotObservationRefreshState:
        CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      selectedSnapshotObservationNextAction:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_NEXT_ACTION,
      selectedSnapshotObservationRetryAfterMs:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_REASON_SELECTED_TIMEOUT,
      ],
      selectedSnapshotRepairDeferred: true,
      selectedObservedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
      selectedPublishedActiveNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PUBLISHED_NODE_IDS,
      selectedPendingAckNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      selectedPublicationActiveGateHandoff: {
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        nextAction:
          SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed:
          SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingReconcileNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECONCILE_NODE_IDS,
        pendingRecoveryNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_WRITE_DEFERRED,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        enqueued:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_HANDOFF_ALREADY_ENQUEUED,
        retryAfterMs:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_PENDING_WRITES,
        pendingWriteGrowthCount:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_GROWTH_COUNT,
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    );
    const projectedDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId ===
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
    );

    assert.strictEqual(
      probeResult.snapshotCoverage.selectedMembershipPublicationHandoffOutcome
        ?.enqueued,
      ACTIVE_GATE_STARTUP_OWNER_RECOVERY_HANDOFF_ALREADY_ENQUEUED,
      'already-enqueued owner-recovery evidence should stay visible',
    );
    assert.strictEqual(
      projectedDiagnostic.active,
      true,
      'already-enqueued owner-recovery queue should wake startup projection',
    );
    assert.strictEqual(
      projectedDiagnostic.admissionState,
      ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ADMISSION_DEGRADED,
      'already-enqueued owner-recovery projection stays degraded',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'bounded already-enqueued owner-recovery progress should satisfy startup gate',
    );
  },
);

test(
  ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_TEST_NAME,
  async () => {
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
        async probeBootstrapReadiness() {
          if (
            nodeId ===
            ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_NODE_ID
          ) {
            throw new Error(
              ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_ERROR,
            );
          }
          return {
            status: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATUS,
            phase: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PHASE,
            state: ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STATE,
            reasons: [],
          };
        },
        async getReachabilityDiagnostics() {
          return {
            reachable: true,
            adminReady: true,
            reachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
            lastError: null,
          };
        },
        async getLogs(_options) {
          return SNAPSHOT_REPLAY_TEST_EMPTY_LOG;
        },
      });
    }
    cluster._probeControlSnapshotCoverage = async () => ({
      completeCoverage: false,
      expectedNodeCount: SNAPSHOT_REPLAY_TEST_CLUSTER_SIZE,
      bestCoverageNodeCount:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS.length,
      selectedNodeId:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
      selectedSnapshotNodeId:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_NODE_ID,
      selectedAdminReady: true,
      selectedSnapshotAdminReady: true,
      selectedReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedSnapshotReachableBy: SNAPSHOT_REPLAY_TEST_ADMIN_HEALTH_SOURCE,
      selectedError: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_ERROR,
      selectedSnapshotObservationMode:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_MODE,
      selectedSnapshotObservationState:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_STATE,
      selectedSnapshotObservationContractState:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_CONTRACT_STATE,
      selectedSnapshotObservationRefreshState:
        CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      selectedSnapshotObservationNextAction:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OBSERVATION_NEXT_ACTION,
      selectedSnapshotObservationRetryAfterMs:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS,
      selectedSnapshotObservationReasonCodes: [
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_REASON_SELECTED_TIMEOUT,
      ],
      selectedSnapshotRepairDeferred: true,
      selectedObservedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
      selectedPublishedActiveNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PUBLISHED_NODE_IDS,
      selectedPendingAckNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      selectedMissingPublishedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      selectedPublicationActiveGateHandoff: {
        state: SNAPSHOT_REPLAY_TEST_HANDOFF_STATE_PENDING,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        nextAction:
          SNAPSHOT_REPLAY_TEST_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed:
          SNAPSHOT_REPLAY_TEST_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        pendingReconcileNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_RECONCILE_NODE_IDS,
        pendingRecoveryNodeIds:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_PROJECTION_PENDING_NODE_IDS,
      },
      selectedMembershipPublicationHandoffOutcome: {
        state: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_WRITE_DEFERRED,
        reasonCode:
          SNAPSHOT_REPLAY_TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        enqueued: ACTIVE_GATE_STARTUP_OWNER_RECOVERY_HANDOFF_ENQUEUED,
        retryAfterMs:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_SELECTED_TIMEOUT_RETRY_AFTER_MS,
      },
      selectedControlPlaneOwnerQueueDepth: {
        pendingWrites:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_PENDING_WRITES,
        pendingWriteGrowthCount:
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_OWNER_QUEUE_GROWTH_COUNT,
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    );
    const projectedDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId ===
          ACTIVE_GATE_STARTUP_OWNER_RECOVERY_INHERITED_TIMEOUT_NODE_ID,
    );

    assert.strictEqual(
      projectedDiagnostic.active,
      true,
      'inherited readiness timeout should be projected active',
    );
    assert.strictEqual(
      projectedDiagnostic.admissionState,
      ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ADMISSION_DEGRADED,
      'inherited readiness projection stays degraded',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'inherited readiness support should satisfy startup gate',
    );
  },
);

test(
  ACTIVE_GATE_STARTUP_SELECTED_SOURCE_RECONCILE_TIMEOUT_TEST_NAME,
  async () => {
    const cluster = buildStartupOwnerReconcilePartialCoverageCluster({
      includeOwnerReconcileHandoff: true,
      pendingAckNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      pendingReconcileNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_HANDOFF_NODE_IDS,
      handoffMissingPublishedNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_HANDOFF_NODE_IDS,
      readinessTimeoutNodeId: SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      selectedNodeId: SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
      selectedObservedNodeIds: [
        SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
        SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
      ],
      selectedPublishedActiveNodeIds: [SNAPSHOT_REPLAY_TEST_NODE_ID.SEED],
      publicationDisagreementByNodeId: {
        [SNAPSHOT_REPLAY_TEST_NODE_ID.SEED]: [
          SNAPSHOT_REPLAY_TEST_NODE_ID.BASELINE,
          SNAPSHOT_REPLAY_TEST_NODE_ID.ADMIN_READY_STALE,
          SNAPSHOT_REPLAY_TEST_NODE_ID.STRONG_EXTRA,
          SNAPSHOT_REPLAY_TEST_NODE_ID.STALE_EXTRA,
        ],
      },
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    );
    const projectedDiagnostic = probeResult.nodeDiagnostics.find(
      (diagnostic) =>
        diagnostic.nodeId === SNAPSHOT_REPLAY_TEST_NODE_ID.SEED,
    );

    assert.strictEqual(
      projectedDiagnostic.active,
      true,
      'selected snapshot source should project active despite stale peer debt',
    );
    assert.strictEqual(
      projectedDiagnostic.admissionState,
      ACTIVE_GATE_STARTUP_OWNER_RECOVERY_ADMISSION_DEGRADED,
      'selected source projection stays degraded',
    );
    assert.strictEqual(
      probeResult.allActive,
      true,
      'owner-reconcile partial coverage should satisfy startup gate',
    );
  },
);

test(
  ACTIVE_GATE_STARTUP_OWNER_RECONCILE_STALE_ACK_GUARDRAIL_TEST_NAME,
  async () => {
    const cluster = buildStartupOwnerReconcilePartialCoverageCluster({
      includeOwnerReconcileHandoff: false,
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    );

    assert.strictEqual(
      probeResult.allActive,
      false,
      'startup partial coverage must remain blocked without handoff proof',
    );
    assert.strictEqual(
      probeResult.nodeDiagnostics.every((diagnostic) =>
        diagnostic.active === true),
      true,
      'guardrail fixture should isolate the selected pending ACK blocker',
    );
    assert.deepStrictEqual(
      probeResult.snapshotCoverage.selectedPendingAckNodeIds,
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_PENDING_ACK_NODE_IDS,
      'selected stale pending ACK should stay visible to diagnostics',
    );
  },
);

test(ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_TEST_NAME, async () => {
  const cluster = buildStartupOwnerReconcilePartialCoverageCluster({
    includeOwnerReconcileHandoff: true,
    pendingAckNodeIds:
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
    pendingReconcileNodeIds:
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_HANDOFF_NODE_IDS,
    handoffMissingPublishedNodeIds:
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_HANDOFF_NODE_IDS,
  });

  const probeResult = await cluster._probeClusterActiveState(
    Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
  );

  assert.strictEqual(
    probeResult.allActive,
    true,
    'owner-reconcile handoff should resolve no-ACK missing-published residual',
  );
  assert.deepStrictEqual(
    probeResult.snapshotCoverage.selectedPendingAckNodeIds,
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
    'selected snapshot should preserve the closed ACK witness',
  );
  assert.deepStrictEqual(
    probeResult.snapshotCoverage.selectedMissingPublishedNodeIds,
    ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS,
    'selected snapshot should preserve stale missing-published diagnostics',
  );
});

test(
  ACTIVE_GATE_STARTUP_OWNER_RECONCILE_NO_ACK_GUARDRAIL_TEST_NAME,
  async () => {
    const cluster = buildStartupOwnerReconcilePartialCoverageCluster({
      includeOwnerReconcileHandoff: false,
      pendingAckNodeIds:
        ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
    });

    const probeResult = await cluster._probeClusterActiveState(
      Date.now() + ACTIVE_GATE_PARTIAL_RESIDUAL_TIMEOUT_MS,
    );

    assert.strictEqual(
      probeResult.allActive,
      false,
      'no-ACK residual must remain blocked without handoff proof',
    );
    assert.deepStrictEqual(
      probeResult.snapshotCoverage.selectedPendingAckNodeIds,
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_EMPTY_PENDING_ACK_NODE_IDS,
      'guardrail fixture should keep ACK closed',
    );
    assert.deepStrictEqual(
      probeResult.snapshotCoverage.selectedMissingPublishedNodeIds,
      ACTIVE_GATE_STARTUP_OWNER_RECONCILE_MISSING_NODE_IDS,
      'guardrail fixture should keep stale missing-published diagnostics',
    );
  },
);
