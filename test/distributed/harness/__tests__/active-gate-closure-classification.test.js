import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
  classifyActiveGateClosureWitness,
} from '../active-gate-closure-classification.js';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceReplayFixture,
  EDGE_ID,
  replayTopologyConvergenceFixture,
} from '../../../../src/diagnostics/topology-convergence-graph.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
} from '../../../../src/control-plane/publication-active-gate-handoff-contract.js';
import {
  PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
  buildPriorityRecoveryPublicationConvergenceFixture,
} from '../__fixtures__/priority-recovery-actuation-contract-fixture.js';
import {CLUSTER_SEGMENT_2} from '../cluster-segment-2.js';

const ACTIVE_GATE_READINESS_MODE_LOAD = 'load';
const ACTIVE_GATE_READINESS_MODE_STARTUP = 'startup';
const ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const ACTIVE_GATE_REASON_PRIORITY_SPREAD_PENDING =
  'priority_control_plane_spread_pending';
const ACTIVE_GATE_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_SELECTED_NODE_COUNT = 5;
const ACTIVE_GATE_PARTIAL_SNAPSHOT_COVERAGE_COUNT = 3;
const ACTIVE_GATE_MISSING_PUBLISHED_COUNT = 3;
const ACTIVE_GATE_ZERO = 0;
const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
const ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const ACTIVE_GATE_HANDOFF_OUTCOME_STATE_PRESSURE_DEFERRED =
  'pressure_deferred';
const ACTIVE_GATE_HANDOFF_OUTCOME_REASON_BACKPRESSURE =
  'control_plane_backpressure';
const ACTIVE_GATE_HANDOFF_OUTCOME_ENQUEUED = true;
const ACTIVE_GATE_HANDOFF_OUTCOME_RETRY_AFTER_MS = 1000;
const ACTIVE_GATE_TOPOLOGY_REPLAY_TEST_NAME =
  'topology convergence replay fixture preserves publication owner recovery wake';
const ACTIVE_GATE_TOPOLOGY_REPLAY_SCENARIO = 'rolling-restart';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER = 'startup_active_gate_owner';
const ACTIVE_GATE_TOPOLOGY_REPLAY_BOUNDARY = 'snapshot_coverage';
const ACTIVE_GATE_TOPOLOGY_REPLAY_DOMINANT_REASON =
  'active_gate_timed_out';
const ACTIVE_GATE_TOPOLOGY_REPLAY_PUBLICATION_EPOCH = 1;
const ACTIVE_GATE_TOPOLOGY_REPLAY_SNAPSHOT_COVERAGE_COUNT = 2;
const ACTIVE_GATE_TOPOLOGY_REPLAY_MISSING_PUBLISHED_COUNT = 4;
const ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER_COHORT_PENDING_COUNT = 1;
const ACTIVE_GATE_TOPOLOGY_REPLAY_ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const ACTIVE_GATE_TOPOLOGY_REPLAY_RECOVERY_PROTOCOL_STATE =
  'publication_pending';
const ACTIVE_GATE_TOPOLOGY_REPLAY_ACK_STATE = 'acknowledged';
const ACTIVE_GATE_TOPOLOGY_REPLAY_FRESHNESS_FENCE = 'consumer_lag';
const ACTIVE_GATE_TOPOLOGY_REPLAY_RECOVERY_OUTCOME =
  'waiting_for_consumer';
const ACTIVE_GATE_TOPOLOGY_REPLAY_REVISION_STATE = 'current';
const ACTIVE_GATE_TOPOLOGY_REPLAY_STREAM_OUTCOME = 'stale';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_MODE = 'repair_deferred';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_STATE = 'deferred_refresh';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_CONTRACT_STATE = 'deferred';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_REFRESH_STATE = 'deferred';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_NEXT_ACTION = 'retry';
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_RETRY_AFTER_MS = 14639;
const ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_CAUSE = 'none';
const ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_MODE = 'startup';
const ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_CLASS =
  'no_progress_terminal';
const ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_TERMINAL_REASON =
  'stalled_no_progress';
const ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_SOURCE = 'unknown';
const ACTIVE_GATE_TOPOLOGY_REPLAY_PUBLISHED_NODE_IDS = Object.freeze([
  '7493b0ab-a054-5fad-a91b-5e331db29304',
]);
const ACTIVE_GATE_TOPOLOGY_REPLAY_MISSING_NODE_IDS = Object.freeze([
  '11601fe0-72d6-5853-8590-ec2881853e72',
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  '8be8d30f-4499-5eed-865c-71b4d529a67a',
  'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
]);
const ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER_COHORT_NODE_IDS = Object.freeze([
  '11601fe0-72d6-5853-8590-ec2881853e72',
]);
const ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_REASONS = Object.freeze([
  'cache_stale_watermark',
  'discovery_node_coverage_gap',
  'stale_replica_operations_in_flight',
]);
const ACTIVE_GATE_TOPOLOGY_REPLAY_BLOCKERS = Object.freeze([
  'inactive_nodes=1',
  'snapshot_coverage=2/5',
]);
const ACTIVE_GATE_PRIORITY_SPREAD_TEST_NAME =
  'active gate classifies publication-closed priority spread as closure witness';
const ACTIVE_GATE_STARTUP_PUBLICATION_LAG_TEST_NAME =
  'active gate classifies startup publication lag as CL-006 witness when snapshot covers partial nodes and publication gate is stub';
const ACTIVE_GATE_STARTUP_PUBLICATION_LAG_OWNER_PATH_TEST_NAME =
  'active gate owner path preserves selected missing published nodes for startup publication lag';
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_SELECTED_COVERAGE_TEST_NAME =
  'active gate progress prefers owner-recovery handoff publication coverage over empty selected snapshot coverage';
const ACTIVE_GATE_PUBLICATION_BLOCKER_PROJECTION_TEST_NAME =
  'active gate publication blocker projection consumes complete owner handoff coverage';
const ACTIVE_GATE_SELECTED_SNAPSHOT_NODE_ID =
  '8be8d30f-4499-5eed-865c-71b4d529a67a';
const ACTIVE_GATE_PUBLISHED_NODE_IDS = Object.freeze([
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  '7493b0ab-a054-5fad-a91b-5e331db29304',
]);
const ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS = Object.freeze([
  '11601fe0-72d6-5853-8590-ec2881853e72',
  '8be8d30f-4499-5eed-865c-71b4d529a67a',
  'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
]);
const ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS = Object.freeze([
  ...ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS,
  ...ACTIVE_GATE_PUBLISHED_NODE_IDS,
].sort((left, right) => left.localeCompare(right)));
const ACTIVE_GATE_EMPTY_NODE_IDS = Object.freeze([]);
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_COUNT = 1;
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_NODE_IDS = Object.freeze([
  ACTIVE_GATE_SELECTED_SNAPSHOT_NODE_ID,
]);
const ACTIVE_GATE_STALE_MISSING_PUBLISHED_COUNT =
  ACTIVE_GATE_EXPECTED_NODE_COUNT;
const ACTIVE_GATE_PUBLICATION_GATE_BLOCKER_PREFIX = 'publication_gate=';

function buildTopologyReplaySourceArtifact() {
  return {
    scenario: ACTIVE_GATE_TOPOLOGY_REPLAY_SCENARIO,
    publicationConvergence: {
      publicationEpoch: ACTIVE_GATE_TOPOLOGY_REPLAY_PUBLICATION_EPOCH,
      publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
      pendingAckNodeIds: [],
      pendingAckCount: ACTIVE_GATE_ZERO,
      blockedNodeCount: ACTIVE_GATE_ZERO,
      publishedActiveNodeIds: ACTIVE_GATE_TOPOLOGY_REPLAY_PUBLISHED_NODE_IDS,
      missingPublishedNodeIds: ACTIVE_GATE_TOPOLOGY_REPLAY_MISSING_NODE_IDS,
      missingPublishedCount:
        ACTIVE_GATE_TOPOLOGY_REPLAY_MISSING_PUBLISHED_COUNT,
      publicationPending: true,
      recoveryProtocolState: ACTIVE_GATE_TOPOLOGY_REPLAY_RECOVERY_PROTOCOL_STATE,
      prioritySpreadPending: false,
      publicationOwnerStream: {
        ackState: ACTIVE_GATE_TOPOLOGY_REPLAY_ACK_STATE,
        freshnessFence: ACTIVE_GATE_TOPOLOGY_REPLAY_FRESHNESS_FENCE,
        recoveryOutcome: ACTIVE_GATE_TOPOLOGY_REPLAY_RECOVERY_OUTCOME,
        revision: {
          state: ACTIVE_GATE_TOPOLOGY_REPLAY_REVISION_STATE,
        },
        streamOutcome: ACTIVE_GATE_TOPOLOGY_REPLAY_STREAM_OUTCOME,
      },
      activeGate: {
        state: ACTIVE_GATE_TOPOLOGY_REPLAY_ACTIVE_GATE_STATE_TIMED_OUT,
        progress: {
          snapshotCoverageComplete: false,
          snapshotCoverageNodeCount:
            ACTIVE_GATE_TOPOLOGY_REPLAY_SNAPSHOT_COVERAGE_COUNT,
          expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
          selectedSnapshotObservationMode:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_MODE,
          selectedSnapshotObservationState:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_STATE,
          selectedSnapshotObservationContractState:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_CONTRACT_STATE,
          selectedSnapshotObservationRefreshState:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_REFRESH_STATE,
          selectedSnapshotObservationNextAction:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_NEXT_ACTION,
          selectedSnapshotObservationRetryAfterMs:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_RETRY_AFTER_MS,
          selectedSnapshotObservationReasonCodes:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OBSERVATION_REASONS,
          selectedSnapshotRepairDeferred: true,
          publicationActiveGateHandoffState:
            PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
          publicationActiveGateHandoffReasonCode:
            PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
          publicationActiveGateHandoffNextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
          publicationActiveGateHandoffRuntimePromotionAllowed:
            ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
          publicationActiveGateHandoffPendingReconcileCount: ACTIVE_GATE_ZERO,
          activeGateOwnerCohortState: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          activeGateOwnerCohortReasonCode:
            ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          activeGateOwnerCohortMissingPublishedCount:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER_COHORT_PENDING_COUNT,
          activeGateOwnerCohortMissingPublishedNodeIds:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER_COHORT_NODE_IDS,
          activeGateOwnerCohortPendingRecoveryCount:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER_COHORT_PENDING_COUNT,
          activeGateOwnerCohortPendingRecoveryNodeIds:
            ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER_COHORT_NODE_IDS,
          activeGateOwnerCohortPendingReconcileCount: ACTIVE_GATE_ZERO,
          blockers: ACTIVE_GATE_TOPOLOGY_REPLAY_BLOCKERS,
        },
      },
    },
    summary: {
      readinessFailure: {
        mode: ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_MODE,
        classCode: ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_CLASS,
        terminalReason:
          ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_TERMINAL_REASON,
        source: ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_SOURCE,
        cause: ACTIVE_GATE_TOPOLOGY_REPLAY_READINESS_CAUSE,
      },
    },
  };
}

test(ACTIVE_GATE_PRIORITY_SPREAD_TEST_NAME,
  () => {
    const publicationConvergence =
      buildPriorityRecoveryPublicationConvergenceFixture();
    const progressSnapshot = {
      publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
      snapshotCoverageComplete: true,
      snapshotCoverageNodeCount: ACTIVE_GATE_SELECTED_NODE_COUNT,
      expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      activeNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      inactiveNodeCount: ACTIVE_GATE_ZERO,
      pendingAckCount: ACTIVE_GATE_ZERO,
      missingPublishedCount: ACTIVE_GATE_ZERO,
      prioritySpreadSatisfied: false,
      gateReasons: [ACTIVE_GATE_REASON_PRIORITY_SPREAD_PENDING],
      priorityRecoveryDecisionSnapshots: {
        ...PRIORITY_RECOVERY_DECISION_SET_EXPECTED,
        priorityPartitionSummary:
          publicationConvergence.priorityPartitionSummary,
      },
    };

    const witness = classifyActiveGateClosureWitness({
      progressSnapshot,
      publicationConvergence,
      readinessMode: ACTIVE_GATE_READINESS_MODE_LOAD,
    });

    assert.deepEqual(witness, {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
      closureWitnessClass: ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
    });
  });

test(ACTIVE_GATE_STARTUP_PUBLICATION_LAG_TEST_NAME,
  () => {
    const progressSnapshot = {
      publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
      snapshotCoverageComplete: false,
      snapshotCoverageNodeCount: ACTIVE_GATE_PARTIAL_SNAPSHOT_COVERAGE_COUNT,
      expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      activeNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      inactiveNodeCount: ACTIVE_GATE_ZERO,
      pendingAckCount: ACTIVE_GATE_ZERO,
      missingPublishedCount: ACTIVE_GATE_MISSING_PUBLISHED_COUNT,
      gateReasons: [],
      publicationRecoveryGate: {pendingAckCount: ACTIVE_GATE_ZERO},
    };

    const witness = classifyActiveGateClosureWitness({
      progressSnapshot,
      readinessMode: ACTIVE_GATE_READINESS_MODE_STARTUP,
    });

    assert.deepEqual(witness, {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
      closureWitnessClass:
        ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
    });
  });

test(ACTIVE_GATE_STARTUP_PUBLICATION_LAG_OWNER_PATH_TEST_NAME,
  () => {
    const progressSnapshot = CLUSTER_SEGMENT_2.buildActiveWaitProgressSnapshot(
      {
        allActive: true,
        nodeDiagnostics: ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS.map(
          (nodeId) => ({
            nodeId,
            active: true,
          }),
        ).concat(
          ACTIVE_GATE_PUBLISHED_NODE_IDS.map((nodeId) => ({
            nodeId,
            active: true,
          })),
        ),
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
          pendingAckNodeIds: [],
        },
        snapshotCoverage: {
          expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
          bestCoverageNodeCount: ACTIVE_GATE_PARTIAL_SNAPSHOT_COVERAGE_COUNT,
          completeCoverage: false,
          selectedNodeId: ACTIVE_GATE_SELECTED_SNAPSHOT_NODE_ID,
          selectedAdminReady: true,
          selectedPublishedActiveNodeIds: ACTIVE_GATE_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
            ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS,
          selectedPublicationActiveGateHandoff: {
            state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
            reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
            nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
            runtimePromotionAllowed:
              ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
            missingPublishedNodeIds: ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS,
            missingPublishedCount: ACTIVE_GATE_MISSING_PUBLISHED_COUNT,
            pendingRecoveryNodeIds: [],
            pendingRecoveryCount: ACTIVE_GATE_ZERO,
            pendingReconcileNodeIds: ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS,
            pendingReconcileCount: ACTIVE_GATE_MISSING_PUBLISHED_COUNT,
          },
          selectedMembershipPublicationHandoffOutcome: {
            state: ACTIVE_GATE_HANDOFF_OUTCOME_STATE_PRESSURE_DEFERRED,
            reasonCode: ACTIVE_GATE_HANDOFF_OUTCOME_REASON_BACKPRESSURE,
            enqueued: ACTIVE_GATE_HANDOFF_OUTCOME_ENQUEUED,
            retryAfterMs: ACTIVE_GATE_HANDOFF_OUTCOME_RETRY_AFTER_MS,
          },
          selectedPublicationConvergence: {
            publicationStatus: ACTIVE_GATE_PUBLICATION_STATUS_PUBLISHED,
          },
        },
      },
      ACTIVE_GATE_EXPECTED_NODE_COUNT,
      {readinessMode: ACTIVE_GATE_READINESS_MODE_STARTUP},
    );

    assert.equal(
      progressSnapshot.missingPublishedCount,
      ACTIVE_GATE_MISSING_PUBLISHED_COUNT,
    );
    assert.equal(
      progressSnapshot.closureRecordId,
      ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
    );
    assert.equal(
      progressSnapshot.closureWitnessClass,
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
    );
    assert.deepEqual(
      progressSnapshot.selectedMissingPublishedNodeIds,
      ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS,
    );
    assert.equal(
      progressSnapshot.activeGateOwnerCohortState,
      ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
    );
    assert.equal(
      progressSnapshot.activeGateOwnerCohortReasonCode,
      ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
    );
    assert.equal(
      progressSnapshot.activeGateOwnerCohortPendingReconcileCount,
      ACTIVE_GATE_MISSING_PUBLISHED_COUNT,
    );
    assert.deepEqual(
      progressSnapshot.activeGateOwnerCohortPendingReconcileNodeIds,
      ACTIVE_GATE_MISSING_PUBLISHED_NODE_IDS,
    );
    assert.equal(
      progressSnapshot.publicationActiveGateHandoffNextAction,
      ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
    );
    assert.equal(
      progressSnapshot.publicationActiveGateHandoffRuntimePromotionAllowed,
      ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
    );
    assert.equal(
      progressSnapshot.membershipPublicationHandoffOutcomeState,
      ACTIVE_GATE_HANDOFF_OUTCOME_STATE_PRESSURE_DEFERRED,
    );
    assert.equal(
      progressSnapshot.membershipPublicationHandoffOutcomeReasonCode,
      ACTIVE_GATE_HANDOFF_OUTCOME_REASON_BACKPRESSURE,
    );
    assert.equal(
      progressSnapshot.membershipPublicationHandoffOutcomeEnqueued,
      ACTIVE_GATE_HANDOFF_OUTCOME_ENQUEUED,
    );
    assert.equal(
      progressSnapshot.membershipPublicationHandoffOutcomeRetryAfterMs,
      ACTIVE_GATE_HANDOFF_OUTCOME_RETRY_AFTER_MS,
    );
  });

test(ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_SELECTED_COVERAGE_TEST_NAME,
  () => {
    const progressSnapshot = CLUSTER_SEGMENT_2.buildActiveWaitProgressSnapshot(
      {
        allActive: true,
        nodeDiagnostics: ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS.map(
          (nodeId) => ({
            nodeId,
            active: true,
          }),
        ),
        publicationConvergenceGate: {
          ready: false,
          reasons: ACTIVE_GATE_EMPTY_NODE_IDS,
          missingPublishedNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
          missingPublishedCount: ACTIVE_GATE_STALE_MISSING_PUBLISHED_COUNT,
        },
        snapshotCoverage: {
          expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
          bestCoverageNodeCount: ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_COUNT,
          completeCoverage: false,
          selectedNodeId: ACTIVE_GATE_SELECTED_SNAPSHOT_NODE_ID,
          selectedAdminReady: true,
          selectedPublishedActiveNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
          selectedMissingPublishedNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
          selectedPublicationActiveGateHandoff: {
            state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
            reasonCode:
              PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
            nextAction:
              PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
            runtimePromotionAllowed:
              ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
            publishedActiveNodeIds: ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS,
            missingPublishedNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
            missingPublishedCount: ACTIVE_GATE_ZERO,
            pendingRecoveryNodeIds:
              ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_NODE_IDS,
            pendingRecoveryCount:
              ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_COUNT,
            pendingReconcileNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
            pendingReconcileCount: ACTIVE_GATE_ZERO,
          },
        },
      },
      ACTIVE_GATE_EXPECTED_NODE_COUNT,
      {readinessMode: ACTIVE_GATE_READINESS_MODE_STARTUP},
    );

    assert.deepEqual(
      progressSnapshot.selectedPublishedActiveNodeIds,
      ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS,
    );
    assert.deepEqual(
      progressSnapshot.selectedMissingPublishedNodeIds,
      ACTIVE_GATE_EMPTY_NODE_IDS,
    );
    assert.equal(
      progressSnapshot.missingPublishedCount,
      ACTIVE_GATE_ZERO,
    );
    assert.equal(
      progressSnapshot.activeGateOwnerCohortMissingPublishedCount,
      ACTIVE_GATE_ZERO,
    );
    assert.equal(
      progressSnapshot.activeGateOwnerCohortPendingRecoveryCount,
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_COUNT,
    );
    assert.deepEqual(
      progressSnapshot.activeGateOwnerCohortPendingRecoveryNodeIds,
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_NODE_IDS,
    );
    assert.equal(
      progressSnapshot.publicationActiveGateHandoffNextAction,
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    );
    assert.equal(
      progressSnapshot.publicationActiveGateHandoffRuntimePromotionAllowed,
      ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
    );
  });

test(ACTIVE_GATE_PUBLICATION_BLOCKER_PROJECTION_TEST_NAME,
  () => {
    const snapshotCoverage = {
      expectedNodeCount: ACTIVE_GATE_EXPECTED_NODE_COUNT,
      bestCoverageNodeCount:
        ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_COUNT,
      completeCoverage: false,
      selectedNodeId: ACTIVE_GATE_SELECTED_SNAPSHOT_NODE_ID,
      selectedAdminReady: true,
      selectedPublishedActiveNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
      selectedMissingPublishedNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
      selectedPublicationActiveGateHandoff: {
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        publishedActiveNodeIds: ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS,
        missingPublishedNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
        missingPublishedCount: ACTIVE_GATE_ZERO,
        pendingRecoveryNodeIds:
          ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_NODE_IDS,
        pendingRecoveryCount:
          ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_PENDING_COUNT,
        pendingReconcileNodeIds: ACTIVE_GATE_EMPTY_NODE_IDS,
        pendingReconcileCount: ACTIVE_GATE_ZERO,
      },
    };
    const publicationConvergenceGate =
      CLUSTER_SEGMENT_2.evaluateLoadPublishedConvergence(
        snapshotCoverage,
        ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS,
      );
    const progressSnapshot = CLUSTER_SEGMENT_2.buildActiveWaitProgressSnapshot(
      {
        allActive: true,
        nodeDiagnostics: ACTIVE_GATE_ALL_PUBLISHED_NODE_IDS.map(
          (nodeId) => ({
            nodeId,
            active: true,
          }),
        ),
        publicationConvergenceGate,
        snapshotCoverage,
      },
      ACTIVE_GATE_EXPECTED_NODE_COUNT,
      {readinessMode: ACTIVE_GATE_READINESS_MODE_LOAD},
    );

    assert.equal(publicationConvergenceGate.ready, true);
    assert.deepEqual(publicationConvergenceGate.reasons, ACTIVE_GATE_EMPTY_NODE_IDS);
    assert.deepEqual(
      publicationConvergenceGate.missingPublishedNodeIds,
      ACTIVE_GATE_EMPTY_NODE_IDS,
    );
    assert.equal(progressSnapshot.missingPublishedCount, ACTIVE_GATE_ZERO);
    assert.equal(
      progressSnapshot.blockers.some((blocker) =>
        blocker.startsWith(ACTIVE_GATE_PUBLICATION_GATE_BLOCKER_PREFIX)),
      false,
    );
    assert.equal(
      progressSnapshot.publicationActiveGateHandoffRuntimePromotionAllowed,
      ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
    );
  });

test(ACTIVE_GATE_TOPOLOGY_REPLAY_TEST_NAME,
  () => {
    const sourceGraph = buildTopologyConvergenceGraph(
      buildTopologyReplaySourceArtifact(),
    );
    const replayFixture = buildTopologyConvergenceReplayFixture(sourceGraph);
    const replayResult = replayTopologyConvergenceFixture(replayFixture);

    assert.equal(
      replayFixture.expected.firstFrontierEdgeId,
      EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    );
    assert.equal(
      replayFixture.expected.owner,
      ACTIVE_GATE_TOPOLOGY_REPLAY_OWNER,
    );
    assert.equal(
      replayFixture.expected.boundary,
      ACTIVE_GATE_TOPOLOGY_REPLAY_BOUNDARY,
    );
    assert.equal(
      replayFixture.expected.dominantReason,
      ACTIVE_GATE_TOPOLOGY_REPLAY_DOMINANT_REASON,
    );
    assert.equal(
      replayFixture.expected.nextAction,
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    );
    assert.equal(replayResult.matches.preserved, true);
    assert.deepEqual(replayResult.actual, replayFixture.expected);
    const publicationWitness = replayResult.graph.ownerWitnesses.find(
      (witness) =>
        witness.edgeId === EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
    );
    assert.equal(
      publicationWitness.dominantReason,
      'publication_published',
    );
    assert.equal(
      publicationWitness.source
        .publicationOwnerRecoveryOutcome,
      ACTIVE_GATE_TOPOLOGY_REPLAY_RECOVERY_OUTCOME,
    );
    assert.equal(
      publicationWitness.source.publicationOwnerStreamOutcome,
      ACTIVE_GATE_TOPOLOGY_REPLAY_STREAM_OUTCOME,
    );
  });
