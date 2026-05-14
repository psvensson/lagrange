import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildCanonicalPublicationRecoveryEvidence,
} from '../../src/control-plane/publication-recovery-evidence.js';
import {registerAdminControlSnapshotTailTests} from './admin-control-snapshot-tail-test-cases.js';

const COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE = Object.freeze({
  nodeId: 'node-1',
  nowMs: 200,
  operation: Object.freeze({
    operation_id: 'replace-source-retired',
    operation_type: 'REPLACE',
    partition_id: 'nodes-p1',
    entity_type: 'partition',
    entity_id: 'nodes-p1',
    source_node_id: 'seed-node',
    source_replica_id: 'nodes-p1-r1',
    target_node_id: 'node-2',
    replica_id: 'nodes-p1-r4',
    status: 'active',
    workflow_step: 'ACTIVE',
    created_at: 100,
    updated_at: 150,
  }),
  serviceRows: Object.freeze([
    Object.freeze({
      service_id: 'nodes-p1-r4',
      replica_id: 'nodes-p1-r4',
      service_type: 'partition',
      partition_id: 'nodes-p1',
      node_id: 'node-2',
      status: 'active',
    }),
  ]),
});
const ACTIVE_GATE_OWNER_TRUTH_NOW_MS = 1000;
const ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS = 1000;
const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH = 31;
const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS = 'PUBLISHED';
const ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS = 'active';
const ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE = 'ready';
const ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE = 'connected';
const ACTIVE_GATE_OWNER_TRUTH_SOURCE = 'locally_eligible_projection';
const ACTIVE_GATE_OWNER_TRUTH_EFFECTIVE_SOURCE = 'publication_owner_truth';
const ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ID = 'node-1-ws';
const ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_TRANSPORT = 'ws';
const ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ADDRESS = 'ws://node-1:8082';
const ACTIVE_GATE_OWNER_TRUTH_PRIORITY_PARTITION_COUNT = 0;
const ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT = 0;
const ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT = 1;
const ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT = 1;
const ACTIVE_GATE_OWNER_TRUTH_CURRENT_MISSING_COUNT = 5;
const ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT = 4;
const ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION = 1;
const ACTIVE_GATE_OWNER_COHORT_STATE_DEGRADED = 'degraded';
const ACTIVE_GATE_OWNER_COHORT_REASON_PUBLISHED_INCOMPLETE =
  'published_active_coverage_incomplete';
const ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_AVAILABLE = 'available';
const ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_UNAVAILABLE = 'unavailable';
const ACTIVE_GATE_OWNER_COHORT_GATE_STATE_STALLED = 'stalled';
const ACTIVE_GATE_OWNER_COHORT_GATE_REASON_STALLED_NO_PROGRESS =
  'stalled_no_progress';
const ACTIVE_GATE_OWNER_COHORT_BUDGET_ELAPSED_MS = 121033;
const ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS = 9;
const ACTIVE_GATE_OWNER_COHORT_BUDGET_MAX_ATTEMPTS = 10;
const ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS_SINCE_PROGRESS = 2;
const ACTIVE_GATE_OWNER_COHORT_BUDGET_COORDINATOR_CYCLES = 3;
const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_UNPUBLISHED =
  'unpublished_observation';
const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY =
  'steady_published';
const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_ABSENT = '';
const ACTIVE_GATE_OWNER_TRUTH_FRESHNESS_FENCE_CONSUMER_LAG = 'consumer_lag';
const ACTIVE_GATE_OWNER_TRUTH_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER =
  'waiting_for_consumer';
const ACTIVE_GATE_OWNER_TRUTH_STREAM_OUTCOME_STALE = 'stale';
const ACTIVE_GATE_OWNER_TRUTH_RECENT_HEARTBEAT_DELTA_MS = 1000;
const ACTIVE_GATE_OWNER_TRUTH_STALE_HEARTBEAT_DELTA_MS = 61000;
const ACTIVE_GATE_OWNER_TRUTH_NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
  'node-4',
  'node-5',
]);
const ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID =
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS[0];
const ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(1),
);
const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_ROW = Object.freeze({
  publication_id: 'publication-active-gate-owner-truth',
  publication_kind: 'cluster_membership',
  publication_epoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
  status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
  published_active_node_ids: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
  required_ack_node_ids: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
  acknowledged_node_ids: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
  priority_partition_summary: Object.freeze({
    satisfied: true,
    totalPriorityPartitionCount:
      ACTIVE_GATE_OWNER_TRUTH_PRIORITY_PARTITION_COUNT,
    missingPartitionIds: Object.freeze([]),
    blockedPartitions: Object.freeze([]),
  }),
  membership_lifecycle_summary: Object.freeze({
    publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
    projectedServingNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
    locallyEligibleNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
    recoveryActiveNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
    recoveryActiveNodeSource: ACTIVE_GATE_OWNER_TRUTH_SOURCE,
    missingPublishedRecoveryActiveNodeIds: [
      ...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
    ],
  }),
});

test('AdminControlSnapshot routes publication convergence through the shared recovery protocol snapshot',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics([], {
      publicationEpoch: 12,
      status: 'ACK_PENDING',
      publishedActiveNodeIds: ['node-1'],
      requiredAckNodeIds: ['node-1', 'node-2'],
      acknowledgedNodeIds: ['node-1'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['replica_operations-p1'],
      },
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-1'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-2'],
      },
    });

    t.equal(
      diagnostics?.recoveryProtocolState,
      'publication_pending',
      'admin convergence diagnostics should expose the shared recovery protocol phase',
    );
    t.same(
      diagnostics?.priorityRecoveryReasonCodes,
      [
        'publication_epoch_pending',
        'priority_partitions_not_spread',
      ],
      'admin convergence diagnostics should preserve canonical protocol reasons',
    );
    t.match(
      diagnostics?.participationByNodeId || {},
      {
        'node-1': {
          state: 'recovery_pending_publish',
        },
        'node-2': {
          state: 'recovery_pending_publish',
          recoveryActive: true,
        },
      },
      'admin convergence diagnostics should preserve canonical node participation',
    );
  });

test('AdminControlSnapshot exposes publication owner-truth active cohort in control snapshot nodes',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll(tableId) {
          if (tableId === TABLES.NODES) {
            return [{
              node_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
              status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
              connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
              ready_lease_expires_at:
                ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
                  ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
            }];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_ROW;
          },
          getLatestPublishedClusterPublicationSync() {
            return ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_ROW;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.nodes,
      [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'snapshot nodes should include durable and recently admitted owner truth',
    );
    t.same(
      result.projectedNodes,
      [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'projected nodes should expose the owner-truth active cohort',
    );
    t.same(
      result.publishedNodes,
      [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable published nodes should remain publication-scoped',
    );
    t.same(
      result.suspectedOrTransitioningNodes,
      [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
      'recently admitted nodes should remain distinct from durable publication',
    );
    t.match(
      result.controlPlaneDiagnostics.activeNodeViews,
      {
        effectiveNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        projectedNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        publishedNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        effectiveSource: ACTIVE_GATE_OWNER_TRUTH_EFFECTIVE_SOURCE,
      },
      'diagnostics should identify publication owner truth as the widened source',
    );
    t.match(
      result.controlPlaneDiagnostics.activeGateOwnerCohort,
      {
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_DEGRADED,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_PUBLISHED_INCOMPLETE,
        topologyEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
        expectedNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        expectedNodeCount: ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT,
        readyLeaseNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        readyLeaseNodeCount: ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT,
        publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        publishedActiveNodeCount:
          ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT,
        missingPublishedNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        missingPublishedCount: ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
        pendingReconcileNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        pendingReconcileCount: ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
        activeGateBudget: {
          state: ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_UNAVAILABLE,
        },
      },
      'active-gate owner cohort diagnostics should keep published coverage distinct from PUBLISHED status',
    );
  });

test('AdminControlSnapshot normalizes active-gate owner cohort budget state',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const activeGateOwnerCohort =
      snapshot.resolveActiveGateOwnerCohortSnapshot({
        nodeRows: [
          {
            node_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
            status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
            connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
            ready_lease_expires_at:
              ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
                ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
          },
          {
            node_id: ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
            status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
            connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
            ready_lease_expires_at:
              ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
                ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
          },
        ],
        activeNodeViews: {
          effectiveActiveNodeIds: [
            ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
            ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
          ],
          publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          missingPublishedNodeIds: [ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]],
        },
        readinessByNodeId: {
          [ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]]: {
            reasonCodes: [
              CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            ],
          },
        },
        activeGate: {
          state: ACTIVE_GATE_OWNER_COHORT_GATE_STATE_STALLED,
          reasonCode:
            ACTIVE_GATE_OWNER_COHORT_GATE_REASON_STALLED_NO_PROGRESS,
          elapsedMs: ACTIVE_GATE_OWNER_COHORT_BUDGET_ELAPSED_MS,
          attempts: ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS,
          maxAttempts: ACTIVE_GATE_OWNER_COHORT_BUDGET_MAX_ATTEMPTS,
          attemptsSinceProgress:
            ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS_SINCE_PROGRESS,
          coordinatorCyclesSinceProgress:
            ACTIVE_GATE_OWNER_COHORT_BUDGET_COORDINATOR_CYCLES,
        },
      });

    t.match(
      activeGateOwnerCohort,
      {
        state: ACTIVE_GATE_OWNER_COHORT_STATE_DEGRADED,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_PUBLISHED_INCOMPLETE,
        pendingRecoveryNodeIds: [ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]],
        pendingReconcileNodeIds: [],
        activeGateBudget: {
          state: ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_AVAILABLE,
          activeGateState: ACTIVE_GATE_OWNER_COHORT_GATE_STATE_STALLED,
          reasonCode:
            ACTIVE_GATE_OWNER_COHORT_GATE_REASON_STALLED_NO_PROGRESS,
          elapsedMs: ACTIVE_GATE_OWNER_COHORT_BUDGET_ELAPSED_MS,
          attempts: ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS,
          maxAttempts: ACTIVE_GATE_OWNER_COHORT_BUDGET_MAX_ATTEMPTS,
          attemptsSinceProgress:
            ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS_SINCE_PROGRESS,
          coordinatorCyclesSinceProgress:
            ACTIVE_GATE_OWNER_COHORT_BUDGET_COORDINATOR_CYCLES,
        },
      },
      'active-gate owner cohort diagnostics should normalize bounded budget fields',
    );
  });

test('AdminControlSnapshot widens owner truth from missing published recovery nodes',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
      [{
        node_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
        connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
        ready_lease_expires_at:
          ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
            ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
      }],
      [],
      [],
      {
        publicationConvergence: {
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publicationStatus: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          requiredAckNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          acknowledgedNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            totalPriorityPartitionCount:
              ACTIVE_GATE_OWNER_TRUTH_PRIORITY_PARTITION_COUNT,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
          missingPublishedRecoveryActiveNodeIds: [
            ...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
          ],
        },
      },
      [],
    );

    t.same(
      activeNodeViews.effectiveActiveNodeIds,
      [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'missing published recovery nodes should count as owner-truth active nodes',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
      'projected nodes should include missing published recovery owner truth',
    );
    t.same(
      activeNodeViews.publishedActiveNodeIds,
      [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable publication membership should remain distinct',
    );
    t.same(
      activeNodeViews.suspectedOrTransitioningNodeIds,
      [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
      'missing published recovery nodes should remain transitional diagnostics',
    );
    t.equal(
      activeNodeViews.effectiveSource,
      ACTIVE_GATE_OWNER_TRUTH_EFFECTIVE_SOURCE,
      'diagnostics should identify owner truth as the effective source',
    );
  });

test('canonical publication evidence retains active-gate best publication owner truth after a timeout sample',
  async (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
        pendingAckNodeIds: [],
        pendingAckCount: ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
        activeGate: {
          progress: {
            expectedNodeCount: ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT,
            publicationStatus: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_ABSENT,
            recoveryProtocolState:
              ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_UNPUBLISHED,
            selectedPublishedActiveNodeIds: [],
            selectedPublishedActiveCount: ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            selectedMissingPublishedNodeIds: [],
            pendingAckCount: ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            missingPublishedCount: ACTIVE_GATE_OWNER_TRUTH_CURRENT_MISSING_COUNT,
          },
          bestProgress: {
            expectedNodeCount: ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT,
            publicationStatus: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            recoveryProtocolState:
              ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY,
            selectedPublishedActiveNodeIds: [
              ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
            ],
            selectedPublishedActiveCount:
              ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT,
            selectedMissingPublishedNodeIds: [
              ...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
            ],
            pendingAckCount: ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            missingPublishedCount: ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
            prioritySpreadSatisfied: true,
            priorityRecoveryProgressClasses: {
              unresolvedClassCount: ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
              unresolvedSemanticStateCount:
                ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
              blockedPartitionCount:
                ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
            },
          },
        },
      },
    });

    t.match(
      evidence.publicationConvergence,
      {
        publicationStatus: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        recoveryProtocolState:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY,
        pendingAckCount: ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT,
        publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
        ],
        missingPublishedCount: ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
        freshnessFence: ACTIVE_GATE_OWNER_TRUTH_FRESHNESS_FENCE_CONSUMER_LAG,
        recoveryOutcome:
          ACTIVE_GATE_OWNER_TRUTH_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
        streamOutcome: ACTIVE_GATE_OWNER_TRUTH_STREAM_OUTCOME_STALE,
      },
      'best active-gate publication evidence should keep the exact owner-truth publication blocker',
    );
    t.match(
      evidence.publicationConvergenceGate,
      {
        publicationStatus: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        recoveryProtocolState:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY,
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
        ],
        missingPublishedCount: ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT,
      },
      'publication gate evidence should not let the timeout sample inflate the owner blocker',
    );
  });

test('AdminControlSnapshot projects recovery-eligible readiness into diagnostic node coverage',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
      [{
        node_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
        connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
        ready_lease_expires_at:
          ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
            ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
      }],
      [],
      [],
      {
        publishedMembershipObservation: {
          publicationEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        },
        readinessByNodeId: {
          [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID]: {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
          [ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]]: {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
          },
        },
      },
    );

    t.same(
      activeNodeViews.effectiveActiveNodeIds,
      [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable effective nodes should remain scoped to the published row',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      [
        ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
      ],
      'diagnostic projection should include recovery-eligible readiness-only nodes',
    );
  });

test('AdminControlSnapshot projects connected active heartbeat rows when readiness is unavailable',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });
    const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
      [
        {
          node_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
          status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
          ready_lease_expires_at:
            ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
              ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
        },
        {
          node_id: ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
          status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE,
          last_heartbeat:
            ACTIVE_GATE_OWNER_TRUTH_NOW_MS -
              ACTIVE_GATE_OWNER_TRUTH_RECENT_HEARTBEAT_DELTA_MS,
        },
        {
          node_id: ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[1],
          status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE,
          last_heartbeat:
            ACTIVE_GATE_OWNER_TRUTH_NOW_MS -
              ACTIVE_GATE_OWNER_TRUTH_RECENT_HEARTBEAT_DELTA_MS,
        },
        {
          node_id: ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[2],
          status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
          connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE,
          last_heartbeat:
            ACTIVE_GATE_OWNER_TRUTH_NOW_MS -
              ACTIVE_GATE_OWNER_TRUTH_STALE_HEARTBEAT_DELTA_MS,
        },
      ],
      [],
      [{
        endpoint_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ID,
        node_id: ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        transport_type: ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_TRANSPORT,
        status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
        address: ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ADDRESS,
      }],
      {
        publishedMembershipObservation: {
          publicationEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        },
        readinessByNodeId: {},
      },
    );

    t.same(
      activeNodeViews.effectiveActiveNodeIds,
      [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
      'durable effective nodes should remain scoped to the published row',
    );
    t.same(
      activeNodeViews.projectedActiveNodeIds,
      [
        ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID,
        ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
        ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[1],
      ],
      'diagnostic projection should include active connected nodes with fresh heartbeat evidence',
    );
    t.same(
      activeNodeViews.suspectedOrTransitioningNodeIds,
      [
        ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0],
        ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[1],
      ],
      'fresh connected nodes should remain distinct from durable publication',
    );
  });

test('AdminControlSnapshot exports publication convergence gate from live priority recovery readiness',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 12,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
              priorityPartitionSummary: {
                satisfied: false,
                missingPartitionIds: ['replica_operations-p1'],
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 3,
                  readyDistinctNodeCount: 2,
                  spreadGap: 1,
                }],
              },
            },
            priorityControlPlaneRecovery: {
              active: false,
              reasonCodes: [],
              publicationRecoveryGate: {
                state: 'ready',
                ready: true,
                active: false,
                publicationEpoch: 12,
                publicationStatus: 'PUBLISHED',
                reasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 5,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: false,
                publicationPending: false,
                ackPending: false,
              },
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-12',
              publication_kind: 'cluster_membership',
              publication_epoch: 12,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              publication_id: 'publication-12',
              publication_kind: 'cluster_membership',
              publication_epoch: 12,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.match(
      result.controlPlaneDiagnostics.publicationConvergenceGate,
      {
        ready: true,
        prioritySpreadPending: false,
        priorityPartitionSummary: {
          satisfied: true,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
      },
      'control snapshot should export the live readiness-owned convergence gate',
    );
    t.match(
      result.controlPlaneDiagnostics.priorityRecoveryObservation,
      {
        publicationEpoch: 12,
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: 'priority_spread_pending',
        priorityRecoveryReasonCodes: [
          'priority_partitions_not_spread',
        ],
        priorityRecoveryBlockedPartitionIds: ['replica_operations-p1'],
        priorityRecoveryBlockedPartitionCount: 1,
      },
      'control snapshot should export the shared priority-recovery observation snapshot',
    );
    const priorityRecoveryWitnesses = Array.isArray(
      result.controlPlaneDiagnostics.priorityRecoveryObservation
        ?.priorityRecoveryPartitionWitnesses,
    ) ?
      result.controlPlaneDiagnostics.priorityRecoveryObservation
        .priorityRecoveryPartitionWitnesses :
      [];
    t.ok(
      priorityRecoveryWitnesses.length > 0,
      'control snapshot should export priority-recovery partition witnesses',
    );
    t.equal(
      priorityRecoveryWitnesses[0]?.partitionId,
      'replica_operations-p1',
      'control snapshot should preserve the blocked partition witness id',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.progressContractState === 'string' &&
        priorityRecoveryWitnesses[0].progressContractState.length > 0,
      'control snapshot should expose witness progress contract state',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.currentOwner === 'string' &&
        priorityRecoveryWitnesses[0].currentOwner.length > 0,
      'control snapshot should expose witness current owner',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.actuationState === 'string' &&
        priorityRecoveryWitnesses[0].actuationState.length > 0,
      'control snapshot should expose witness actuation state',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.nextRequiredAction === 'string' &&
        priorityRecoveryWitnesses[0].nextRequiredAction.length > 0,
      'control snapshot should expose witness next required action',
    );
    t.ok(
      typeof priorityRecoveryWitnesses[0]?.workflowProgressPhaseId === 'string' &&
        priorityRecoveryWitnesses[0].workflowProgressPhaseId.length > 0,
      'control snapshot should expose witness workflow progress phase',
    );
    t.equal(
      priorityRecoveryWitnesses[0]?.stepAgeMs,
      1000,
      'control snapshot should expose witness workflow step age',
    );
    t.ok(
      typeof result.controlPlaneDiagnostics.priorityRecoveryObservation
        ?.pressureConditions?.pressureState === 'string',
      'control snapshot should expose top-level priority-recovery pressure conditions',
    );
  });

test('AdminControlSnapshot refreshes stale readiness publication gates from the shared closure witness',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 12,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
              priorityPartitionSummary: {
                satisfied: false,
                missingPartitionIds: ['replica_operations-p1'],
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 3,
                  readyDistinctNodeCount: 2,
                  spreadGap: 1,
                }],
              },
            },
            priorityControlPlaneRecovery: {
              active: true,
              reasonCodes: ['priority_partitions_not_spread'],
              publicationRecoveryGate: {
                state: 'priority_spread_pending',
                ready: false,
                active: true,
                publicationEpoch: 12,
                publicationStatus: 'PUBLISHED',
                recoveryProtocolState: 'priority_spread_pending',
                reasonCodes: ['priority_partitions_not_spread'],
                priorityPartitionSummary: {
                  satisfied: false,
                  missingPartitionIds: ['replica_operations-p1'],
                  blockedPartitions: [{
                    partitionId: 'replica_operations-p1',
                    requiredDistinctNodeCount: 3,
                    readyDistinctNodeCount: 2,
                    spreadGap: 1,
                  }],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: true,
                publicationPending: false,
                ackPending: false,
              },
            },
          }];
        },
      },
    });
    snapshot.buildPriorityRecoveryDecisionSnapshots = () => ({
      closureWitness: {
        state: 'closure_satisfied_stale_publication',
        prioritySpreadPending: false,
        publicationRefreshRequired: true,
        closureRecordId: 'CL-003',
        closureWitnessClass:
          'publication_converged_priority_spread_pending',
        refreshedPriorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 3,
          totalPriorityPartitionCount: 1,
          missingPartitionIds: [],
          blockedPartitions: [],
          blockedPartitionCount: 0,
          largestSpreadGap: 0,
          totalSpreadGap: 0,
        },
      },
      priorityPartitionSummary: {
        satisfied: true,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 3,
        totalPriorityPartitionCount: 1,
        missingPartitionIds: [],
        blockedPartitions: [],
        blockedPartitionCount: 0,
        largestSpreadGap: 0,
        totalSpreadGap: 0,
      },
      partitionIdsBySemanticState: {},
      snapshots: [],
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.match(
      result.controlPlaneDiagnostics.publicationConvergenceGate,
      {
        ready: true,
        prioritySpreadPending: false,
        closureRecordId: 'CL-003',
        closureWitnessClass: 'publication_converged_priority_spread_pending',
        priorityPartitionSummary: {
          satisfied: true,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
      },
      'control snapshot should rebuild the convergence gate from the shared closure witness instead of stale per-node readiness state',
    );
    t.match(
      result.controlPlaneDiagnostics.priorityRecoveryObservation,
      {
        prioritySpreadPending: false,
        closureRecordId: 'CL-003',
        closureWitnessClass: 'publication_converged_priority_spread_pending',
        priorityRecoveryBlockedPartitionCount: 0,
        priorityRecoveryUnresolvedPartitionCount: 0,
      },
      'control snapshot should expose the same closure witness in the top-level observation snapshot',
    );
  });

test('AdminControlSnapshot does not leak runtime readiness blockers into the exported publication convergence gate',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            },
            membershipPublication: {
              publicationEpoch: 18,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1', 'node-2', 'node-3'],
              priorityPartitionSummary: {
                satisfied: true,
                missingPartitionIds: [],
                blockedPartitions: [],
              },
            },
            priorityControlPlaneRecovery: {
              active: false,
              state: 'runtime_blocked',
              reasonCodes: ['control_plane_not_writable'],
              publicationGateReasonCodes: [],
              runtimeBlockerReasonCodes: ['control_plane_not_writable'],
              publicationRecoveryGate: {
                state: 'ready',
                ready: true,
                active: false,
                publicationEpoch: 18,
                publicationStatus: 'PUBLISHED',
                reasonCodes: [],
                priorityPartitionSummary: {
                  satisfied: true,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                },
                pendingAckNodeIds: [],
                missingPublishedNodeIds: [],
                prioritySpreadPending: false,
                publicationPending: false,
                ackPending: false,
              },
            },
          }];
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.match(
      result.controlPlaneDiagnostics.publicationConvergenceGate,
      {
        ready: true,
        prioritySpreadPending: false,
        reasonCodes: [],
      },
      'control snapshot should keep runtime blocker reasons out of the canonical publication gate',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationConvergence
        ?.priorityRecoveryReasonCodes?.includes('control_plane_not_writable'),
      false,
      'top-level publication convergence should not inherit runtime-only blocker vocabulary',
    );
  });

test('AdminControlSnapshot resolves active nodes from published membership only', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeIds = snapshot.resolveControlSnapshotActiveNodeIds(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ],
    [
      {
        endpoint_id: 'node-1-ws',
        node_id: 'node-1',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-1:8082',
      },
      {
        endpoint_id: 'node-2-ws',
        node_id: 'node-2',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-2:8082',
      },
    ],
    {
      publicationConvergence: {
        publicationEpoch: 14,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeIds,
    ['node-2'],
    'control snapshots should not fall back to locally derived active nodes when publication exists',
  );
});

test('AdminControlSnapshot resolves heartbeat publication diagnostics through the canonical publication story when available', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    controlPlaneReadinessService: {
      getControlPlanePublicationStorySync(nodeId, observedAt) {
        return {
          nodeId,
          observedAt,
          nodeStatePublication: {
            publicationPath: 'node_state_reporter',
            targetNodeId: 'seed-node',
            targetServiceType: 'message_group',
            targetServiceId: 'mg-1-r1',
            consecutiveFailures: 0,
          },
        };
      },
    },
  });

  t.same(
    snapshot.resolveHeartbeatPublicationDiagnostics(),
    {
      publicationPath: 'node_state_reporter',
      targetNodeId: 'seed-node',
      targetServiceType: 'message_group',
      targetServiceId: 'mg-1-r1',
      consecutiveFailures: 0,
    },
    'admin diagnostics should prefer the readiness-owned publication story',
  );
});

test('AdminControlSnapshot includes canonical replica operation rows in the control snapshot summary',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 200,
    });

    const summary = snapshot.buildControlSnapshotReplicaOperationSummary([{
      operation_id: 'replace-1',
      operation_type: 'REPLACE',
      partition_id: 'nodes-p1',
      entity_type: 'partition',
      entity_id: 'nodes-p1',
      source_node_id: 'seed-node',
      target_node_id: 'node-2',
      replica_id: 'nodes-p1-r4',
      status: 'active',
      workflow_step: 'ACTIVE',
      created_at: 100,
      updated_at: 150,
    }], {
      serviceRows: [],
    });

    t.equal(
      summary.inFlightCount,
      1,
      'REPLACE ACTIVE should contribute to the control snapshot in-flight summary',
    );
    t.equal(
      Array.isArray(summary.rows),
      true,
      'control snapshot summaries should expose canonical operation rows for harness diagnostics',
    );
    t.match(
      summary.rows[0],
      {
        operationId: 'replace-1',
        partitionId: 'nodes-p1',
        type: 'REPLACE',
        status: 'active',
        workflowStep: 'ACTIVE',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'nodes-p1-r4',
      },
      'control snapshot summaries should expose one normalized operation record per visible row',
    );
  });

test('AdminControlSnapshot excludes topology-completed REPLACE rows from in-flight counts',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.nodeId,
      nowFn: () => COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.nowMs,
    });

    const summary = snapshot.buildControlSnapshotReplicaOperationSummary([
      COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.operation,
    ], {
      serviceRows: COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.serviceRows,
    });

    t.equal(
      summary.inFlightCount,
      0,
      'admin control snapshots should not count completed REPLACE rows as live work',
    );
    t.equal(
      summary.rows.length,
      1,
      'admin control snapshots should keep completed rows visible for diagnostics',
    );
    t.match(
      summary.rows[0],
      {
        operationId:
          COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE.operation.operation_id,
        sourceReplicaId:
          COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE
            .operation.source_replica_id,
      },
      'admin control snapshots should expose retired-source evidence on the row',
    );
  });

test('AdminControlSnapshot prefers published membership observation over newer open convergence for active node resolution', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeIds = snapshot.resolveControlSnapshotActiveNodeIds(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ],
    [
      {
        endpoint_id: 'node-1-ws',
        node_id: 'node-1',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-1:8082',
      },
      {
        endpoint_id: 'node-2-ws',
        node_id: 'node-2',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-2:8082',
      },
    ],
    {
      publicationConvergence: {
        publicationEpoch: 14,
        status: 'OPEN',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1'],
      },
      publishedMembershipObservation: {
        publicationEpoch: 13,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeIds,
    ['node-1', 'node-2'],
    'control snapshots should keep using the last published membership while a newer publication is still open',
  );
});

test('AdminControlSnapshot falls back to durable published membership from ack-pending convergence when published observation is unavailable', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-3',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
      {
        service_id: 'svc-3',
        node_id: 'node-3',
        status: 'active',
      },
    ],
    [
      {
        endpoint_id: 'node-1-ws',
        node_id: 'node-1',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-1:8082',
      },
      {
        endpoint_id: 'node-2-ws',
        node_id: 'node-2',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-2:8082',
      },
      {
        endpoint_id: 'node-3-ws',
        node_id: 'node-3',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-3:8082',
      },
    ],
    {
      publicationConvergence: {
        publicationEpoch: 14,
        status: 'ACK_PENDING',
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-3': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeViews.authoritativeActiveNodeIds,
    ['node-1', 'node-2'],
    'control snapshots should retain the durable published membership while the latest epoch is ack-pending',
  );
  t.same(
    activeNodeViews.projectedActiveNodeIds,
    ['node-1', 'node-2', 'node-3'],
    'control snapshots should still expose the wider local projection separately',
  );
  t.equal(
    activeNodeViews.publishedMembershipAvailable,
    true,
    'control snapshots should preserve published-membership availability from ack-pending convergence when the durable set is known',
  );
});

test('AdminControlSnapshot exposes separate published and projected node views', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
  });

  const activeNodeViews = snapshot.resolveControlSnapshotNodeViews(
    [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ],
    [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ],
    [
      {
        endpoint_id: 'node-1-ws',
        node_id: 'node-1',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-1:8082',
      },
      {
        endpoint_id: 'node-2-ws',
        node_id: 'node-2',
        transport_type: 'ws',
        status: 'active',
        address: 'ws://node-2:8082',
      },
    ],
    {
      publishedMembershipObservation: {
        publicationEpoch: 14,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-2'],
      },
      readinessByNodeId: {
        'node-1': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        'node-2': {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      },
    },
  );

  t.same(
    activeNodeViews,
    {
      authoritativeSource: 'published_membership',
      authoritativeActiveNodeIds: ['node-2'],
      projectedServingNodeIds: ['node-1', 'node-2'],
      locallyEligibleNodeIds: ['node-1', 'node-2'],
      suspectedOrTransitioningNodeIds: ['node-1'],
      membershipFreeze: {
        active: false,
        reasonCode: null,
        retainedPublishedNodeIds: ['node-2'],
        missingProjectedNodeIds: [],
        unconfirmedProjectedNodeIds: ['node-1'],
      },
      effectiveSource: 'published_membership',
      effectiveActiveNodeIds: ['node-2'],
      projectedActiveNodeIds: ['node-1', 'node-2'],
      publishedActiveNodeIds: ['node-2'],
      publishedMembershipAvailable: true,
    },
    'control snapshot node views should preserve both published membership and local projection',
  );
});

test('AdminControlSnapshot uses observed membership publication when readiness entries lag publication metadata', async (t) => {
  const nodeRows = [
    {
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
    {
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
  ];
  const serviceRows = [
    {
      service_id: 'svc-1',
      node_id: 'node-1',
      status: 'active',
    },
    {
      service_id: 'svc-2',
      node_id: 'node-2',
      status: 'active',
    },
  ];
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return nodeRows;
        }
        if (tableName === TABLES.SERVICES) {
          return serviceRows;
        }
        return [];
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [{
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        }];
      },
      membershipPublicationService: {
        async getLatestClusterPublication() {
          return {
            publicationEpoch: 7,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1', 'node-2'],
            requiredAckNodeIds: ['node-1', 'node-2'],
            acknowledgedNodeIds: ['node-1', 'node-2'],
          };
        },
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot({
    allowAuthoritativeReadinessRefresh: true,
    allowStaleReadinessOnCacheChange: false,
  });

  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'observed membership publication should seed control snapshot node coverage when readiness metadata lags',
  );
  t.same(
    result.publishedNodes,
    ['node-1', 'node-2'],
    'control snapshots should expose the published active-node set explicitly',
  );
  t.same(
    result.projectedNodes,
    ['node-1', 'node-2'],
    'control snapshots should also expose the locally projected active-node set',
  );
  t.same(
    result.suspectedOrTransitioningNodes,
    [],
    'control snapshots should expose transitioning or suspected nodes separately from authoritative membership',
  );
  t.same(
    result.controlPlaneDiagnostics.publicationConvergence?.publishedActiveNodeIds,
    ['node-1', 'node-2'],
    'control-plane diagnostics should retain the observed published membership',
  );
  t.same(
    result.controlPlaneDiagnostics.activeNodeViews,
    {
      authoritativeSource: 'published_membership',
      authoritativeNodeIds: ['node-1', 'node-2'],
      projectedServingNodeIds: ['node-1', 'node-2'],
      locallyEligibleNodeIds: ['node-1', 'node-2'],
      suspectedOrTransitioningNodeIds: [],
      membershipFreeze: {
        active: false,
        reasonCode: null,
        retainedPublishedNodeIds: ['node-1', 'node-2'],
        missingProjectedNodeIds: [],
        unconfirmedProjectedNodeIds: [],
      },
      effectiveSource: 'published_membership',
      effectiveNodeIds: ['node-1', 'node-2'],
      projectedNodeIds: ['node-1', 'node-2'],
      publishedNodeIds: ['node-1', 'node-2'],
      publishedMembershipAvailable: true,
    },
    'control-plane diagnostics should report both effective and projected node views',
  );
});

test('AdminControlSnapshot uses repaired publication rows when publication services are unavailable', async (t) => {
  const nodeRows = [
    {
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
    {
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 2000,
    },
  ];
  const serviceRows = [
    {
      service_id: 'svc-1',
      node_id: 'node-1',
      status: 'active',
    },
    {
      service_id: 'svc-2',
      node_id: 'node-2',
      status: 'active',
    },
  ];
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return nodeRows;
        }
        if (tableName === TABLES.SERVICES) {
          return serviceRows;
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [{
            publication_epoch: 9,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-1', 'node-2'],
          }];
        }
        return [];
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot();

  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'repaired publication rows should seed control snapshot node coverage even without readiness publication metadata',
  );
  t.same(
    result.publishedNodes,
    ['node-1', 'node-2'],
    'repaired publication rows should populate the explicit published node view',
  );
  t.same(
    result.projectedNodes,
    ['node-1', 'node-2'],
    'projected node view should remain available alongside the published node view',
  );
  t.same(
    result.suspectedOrTransitioningNodes,
    [],
    'repaired publication rows should still keep authoritative and projected views separated cleanly',
  );
  t.match(
    result.controlPlaneDiagnostics.publicationConvergence,
    {
      publicationEpoch: 9,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    },
    'control-plane diagnostics should surface repaired membership publication convergence when the publication service is unavailable',
  );
  t.match(
    result.controlPlaneDiagnostics.publishedMembershipObservation,
    {
      publicationEpoch: 9,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    },
    'published membership observation should also fall back to repaired publication rows when the publication service is unavailable',
  );
});

test('AdminControlSnapshot falls back to repaired publication rows when publication services return null without acknowledging from the read path', async (t) => {
  let acknowledgedPublicationRow = null;
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-2',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return [{
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }, {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'svc-1',
            node_id: 'node-1',
            status: 'active',
          }, {
            service_id: 'svc-2',
            node_id: 'node-2',
            status: 'active',
          }];
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [{
            publication_id: 'publication-11',
            publication_kind: 'cluster_membership',
            publication_epoch: 11,
            status: 'OPEN',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1', 'node-2'],
            acknowledged_node_ids: ['node-1'],
          }];
        }
        return [];
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [];
      },
      membershipPublicationService: {
        getLatestClusterPublicationSync() {
          return null;
        },
        async getLatestClusterPublication() {
          return null;
        },
        getLatestPublishedClusterPublicationSync() {
          return null;
        },
        async getLatestPublishedClusterPublication() {
          return null;
        },
        async acknowledgePublication(_publicationId, _nodeId, options = {}) {
          acknowledgedPublicationRow = options.publicationRow || null;
          return {
            ...options.publicationRow,
            status: 'PUBLISHED',
            acknowledged_node_ids: ['node-1', 'node-2'],
            published_at: 1000,
            updated_at: 1000,
            closed_at: 1000,
          };
        },
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot();

  t.equal(
    acknowledgedPublicationRow,
    null,
    'control snapshot reads should not acknowledge repaired publication rows as a side effect',
  );
  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'fallback publication observation should still restore strict snapshot node coverage',
  );
  t.equal(
    result.controlPlaneDiagnostics.publishedMembershipObservation
      ?.publicationObservation?.state,
    'unavailable',
    'control snapshot diagnostics should surface explicit observation absence instead of null',
  );
});

test('AdminControlSnapshot keeps the last published membership when publication services return null', async (t) => {
  const snapshot = new AdminControlSnapshot({
    nodeId: 'node-1',
    nowFn: () => 1000,
    systemTableCache: {
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return [{
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }, {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'svc-1',
            node_id: 'node-1',
            status: 'active',
          }, {
            service_id: 'svc-2',
            node_id: 'node-2',
            status: 'active',
          }];
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [{
            publication_id: 'publication-8',
            publication_kind: 'cluster_membership',
            publication_epoch: 8,
            status: 'OPEN',
            published_active_node_ids: ['node-1', 'node-2', 'node-3'],
            required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
            acknowledged_node_ids: ['node-1'],
          }, {
            publication_id: 'publication-7',
            publication_kind: 'cluster_membership',
            publication_epoch: 7,
            status: 'PUBLISHED',
            published_active_node_ids: ['node-1', 'node-2'],
            required_ack_node_ids: ['node-1', 'node-2'],
            acknowledged_node_ids: ['node-1', 'node-2'],
          }];
        }
        return [];
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [];
      },
      membershipPublicationService: {
        getLatestClusterPublicationSync() {
          return null;
        },
        async getLatestClusterPublication() {
          return null;
        },
        getLatestPublishedClusterPublicationSync() {
          return null;
        },
        async getLatestPublishedClusterPublication() {
          return null;
        },
      },
    },
  });

  const result = await snapshot.buildLocalControlSnapshot();

  t.same(
    result.nodes,
    ['node-1', 'node-2'],
    'snapshot coverage should fall back to the last repaired published membership when service reads return null',
  );
  t.match(
    result.controlPlaneDiagnostics.publicationConvergence,
    {
      publicationEpoch: 8,
      status: 'OPEN',
    },
    'diagnostics should still expose the latest open publication from repaired rows',
  );
  t.match(
    result.controlPlaneDiagnostics.publishedMembershipObservation,
    {
      publicationEpoch: 7,
      status: 'PUBLISHED',
      publishedActiveNodeIds: ['node-1', 'node-2'],
    },
    'diagnostics should recover the last published membership from repaired rows when service reads return null',
  );
});

test('AdminControlSnapshot prefers the authoritative latest publication when control snapshots observe membership',
  async (t) => {
    let observedAckPublicationRow = null;
    let observedLatestPublicationReadOptions = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-3',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-18',
              publication_kind: 'cluster_membership',
              publication_epoch: 18,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: [],
            };
          },
          async getLatestClusterPublication(options = {}) {
            observedLatestPublicationReadOptions = options;
            return {
              publication_id: 'publication-18',
              publication_kind: 'cluster_membership',
              publication_epoch: 18,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            observedAckPublicationRow = options.publicationRow || null;
            return options.publicationRow;
          },
        },
      },
    });

    await snapshot.ensureMembershipPublicationObservation({
      preferAuthoritativeRead: true,
    });

    t.same(
      observedLatestPublicationReadOptions,
      {
        preferAuthoritativeRead: true,
        readProfile: 'diagnostics',
      },
      'authoritative control snapshots should bypass the synchronous cache publication read',
    );
    t.equal(
      observedAckPublicationRow,
      null,
      'control snapshot observation should not acknowledge membership as a side effect',
    );
  });

test('AdminControlSnapshot prefers cached membership publication observation over repeated reconcile',
  async (t) => {
    let reconcileCallCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }];
          }
          if (tableName === TABLES.SERVICES) {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [{
              publication_id: 'publication-10',
              publication_kind: 'cluster_membership',
              publication_epoch: 10,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            }];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-10',
              publication_kind: 'cluster_membership',
              publication_epoch: 10,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
          async enqueueClusterMembershipReconcile() {
            reconcileCallCount += 1;
            throw new Error('should not queue reconcile when cached publication exists');
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.equal(
      reconcileCallCount,
      0,
      'control snapshot observation should not force a new reconcile when cached published membership already exists',
    );
    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'cached published membership should still drive control snapshot coverage',
    );
  });

test('AdminControlSnapshot authoritative membership observation stays read-only when published membership lags cluster growth',
  async (t) => {
    let observedEnqueueOptions = null;
    let observedAckPublicationRow = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            t.fail('authoritative snapshot reads should bypass synchronous cache publication reads');
            return null;
          },
          async getLatestClusterPublication(options = {}) {
            t.same(
              options,
              {
                preferAuthoritativeRead: true,
                readProfile: 'diagnostics',
              },
              'authoritative snapshot reads should request an authoritative publication read before reconciling',
            );
            return {
              publication_id: 'publication-1',
              publication_kind: 'cluster_membership',
              publication_epoch: 1,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async enqueueClusterMembershipReconcile(reason, context = {}) {
            observedEnqueueOptions = {reason, context};
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            observedAckPublicationRow = options.publicationRow || null;
            return options.publicationRow;
          },
        },
      },
    });

    const publicationRow = await snapshot.ensureMembershipPublicationObservation({
      preferAuthoritativeRead: true,
    });

    t.equal(
      observedEnqueueOptions,
      null,
      'authoritative snapshot observation should not queue reconcile from the read path',
    );
    t.equal(
      observedAckPublicationRow,
      null,
      'authoritative snapshot observation should not acknowledge publication from the read path',
    );
    t.match(
      publicationRow,
      {
        publication_id: 'publication-1',
        publication_epoch: 1,
        status: 'PUBLISHED',
      },
      'the observed publication should remain the returned snapshot observation when reconcile is queued',
    );
  });

test('AdminControlSnapshot auto-repaired snapshots use authoritative membership publication without acknowledging',
  async (t) => {
    let authoritativeLatestPublicationReadOptions = null;
    let acknowledgePublicationRow = null;
    let authoritativeRepairQueueCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      ensureAuthoritativeDiscoveryCacheRepair: async () => ({
        applied: true,
        repairedTables: [TABLES.CONTROL_PLANE_PUBLICATIONS],
      }),
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-1',
              publication_kind: 'cluster_membership',
              publication_epoch: 1,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1'],
              required_ack_node_ids: ['node-1'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async getLatestClusterPublication(options = {}) {
            authoritativeLatestPublicationReadOptions = options;
            return {
              publication_id: 'publication-2',
              publication_kind: 'cluster_membership',
              publication_epoch: 2,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async enqueueClusterMembershipReconcile() {
            authoritativeRepairQueueCount += 1;
          },
          async acknowledgePublication(_publicationId, _nodeId, options = {}) {
            acknowledgePublicationRow = options.publicationRow || null;
            return options.publicationRow || null;
          },
        },
      },
    });

    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    await snapshot.resolveLocalControlSnapshot();

    t.same(
      authoritativeLatestPublicationReadOptions,
      {
        preferAuthoritativeRead: true,
        readProfile: 'diagnostics',
      },
      'post-repair control snapshots should bypass stale cached publication observations before acknowledging',
    );
    t.equal(
      authoritativeRepairQueueCount,
      0,
      'post-repair control snapshots should not queue reconcile from the read path',
    );
    t.equal(
      acknowledgePublicationRow,
      null,
      'post-repair control snapshots should not acknowledge the authoritative publication from the read path',
    );
  });

test('AdminControlSnapshot keeps the latest published membership when readiness surfaces a newer open publication',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }];
          }
          if (tableName === TABLES.SERVICES) {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1'],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              publication_id: 'publication-7',
              publication_kind: 'cluster_membership',
              publication_epoch: 7,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'control snapshot coverage should keep the last published membership while a newer publication remains open',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence,
      {
        publicationEpoch: 8,
        status: 'OPEN',
      },
      'diagnostics should still expose the current open publication state',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 7,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'diagnostics should retain the last published membership observation for strict coverage consumers',
    );
  });

test('AdminControlSnapshot prefers authoritative published membership when cache only exposes a newer open publication',
  async (t) => {
    let publishedReadOptions = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      nowFn: () => 1000,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return [{
              node_id: 'node-1',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }, {
              node_id: 'node-2',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: 2000,
            }];
          }
          if (tableName === TABLES.SERVICES) {
            return [{
              service_id: 'svc-1',
              node_id: 'node-1',
              status: 'active',
            }, {
              service_id: 'svc-2',
              node_id: 'node-2',
              status: 'active',
            }];
          }
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [{
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            }];
          }
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
              acknowledgedNodeIds: ['node-1'],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2', 'node-3'],
              required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return null;
          },
          async getLatestPublishedClusterPublication(options = {}) {
            publishedReadOptions = options;
            return {
              publication_id: 'publication-7',
              publication_kind: 'cluster_membership',
              publication_epoch: 7,
              status: 'PUBLISHED',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1', 'node-2'],
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      allowAuthoritativeRepair: true,
      forceAuthoritativeRepair: true,
    });

    t.same(
      result.nodes,
      ['node-1', 'node-2'],
      'forced recovery snapshots should use authoritative published membership when cache-only publication history is incomplete',
    );
    t.same(
      publishedReadOptions,
      {
        preferAuthoritativeRead: true,
        readProfile: 'diagnostics',
      },
      'published membership recovery should request authoritative publication history explicitly',
    );
    t.match(
      result.controlPlaneDiagnostics.publishedMembershipObservation,
      {
        publicationEpoch: 7,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2'],
      },
      'diagnostics should surface the authoritative published membership that restored snapshot coverage',
    );
  });

registerAdminControlSnapshotTailTests({
  test,
  TABLES,
  AdminControlSnapshot,
  CONTROL_PLANE_READINESS_DIMENSION,
});
