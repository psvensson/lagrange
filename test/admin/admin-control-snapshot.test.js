import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildCanonicalPublicationRecoveryEvidence,
} from '../../src/control-plane/publication-recovery-evidence.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceReplayFixture,
  replayTopologyConvergenceFixture,
} from '../../src/diagnostics/topology-convergence-graph.js';
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
const ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT = 0;
const ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT = 1;
const ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT = 1;
const ACTIVE_GATE_OWNER_TRUTH_CURRENT_MISSING_COUNT = 5;
const ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT = 4;
const ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION = 1;
const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
const ACTIVE_GATE_OWNER_COHORT_STATE_COMPLETE = 'complete';
const ACTIVE_GATE_CATCHUP_FENCE_STATE_PENDING = 'catchup_pending';
const ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const ACTIVE_GATE_OWNER_COHORT_REASON_COMPLETE =
  'owner_cohort_complete';
const ACTIVE_GATE_CATCHUP_FENCE_REASON_DURABLE_INCOMPLETE =
  'durable_publication_incomplete';
const ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const ACTIVE_GATE_HANDOFF_NEXT_ACTION_ADMIT_ACTIVE_GATE =
  'admit_active_gate';
const ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
const ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_TRUE = true;
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
const ACTIVE_GATE_OWNER_TRUTH_EMPTY_NODE_IDS = Object.freeze([]);
const ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
]);
const ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(0, 4),
);
const ACTIVE_GATE_HANDOFF_FLAT_PUBLISHED_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(0, 2),
);
const ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(2),
);
const ACTIVE_GATE_HANDOFF_FLAT_PENDING_COUNT =
  ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS.length;
const ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID =
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1];
const ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS = Object.freeze([
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
]);
const ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS = Object.freeze(
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS.slice(1),
);
const ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT =
  ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS.length;
const ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS = Object.freeze([
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
]);
const ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_COUNT =
  ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS.length;
const ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT = 0;
const ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ = true;
const ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE = true;
const ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK = false;
const ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE = 'diagnostics';
const ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS = true;
const ACTIVE_GATE_HANDOFF_RECONCILE_DISABLE_NESTED_PRIORITY_RECOVERY = true;
const ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH = false;
const ACTIVE_GATE_HANDOFF_RECONCILE_READBACK_FAILURE =
  'handoff_publication_readback_unavailable';
const ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND =
  'cluster_membership';
const ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH = 3;
const ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID =
  'publication-3';
const ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID =
  'publication-4';
const ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR =
  'publication_reconcile_pressure';
const ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH_ERROR =
  'catchup_rebuild_should_not_force_authoritative_readiness_refresh';
const ACTIVE_GATE_HANDOFF_CATCHUP_REBUILD_ERROR =
  'catchup_rebuild_unavailable_after_publication_write';
const ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH = 4;
const ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_STATUS =
  ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS;
const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE =
  'published_visible';
const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED =
  'write_deferred';
const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON =
  'owner_reconcile_enqueued';
const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_COMMAND_ERROR =
  'owner_reconcile_error';
const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_SERVICE_UNAVAILABLE =
  'owner_reconcile_service_unavailable';
const ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED = true;
const ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED = false;
const ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED = true;
const ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_CONVERGENCE =
  'controlPlaneConvergence';
const ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE =
  'owner_recovery_wake';
const ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS = 32000;
const ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS = 3349;
const ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID =
  '11601fe0-72d6-5853-8590-ec2881853e72';
const ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS = 100;
const ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS = 50;
const ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT = 5;
const ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT = 0;
const ACTIVE_GATE_SNAPSHOT_LANE = 'snapshot';
const ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  `${ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
  `${ACTIVE_GATE_SNAPSHOT_LANE} after ` +
  `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`;
const ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX =
  'forced repair snapshot failed: Admin API query failed for node';
const ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX =
  'Authoritative control snapshot repair failed:';
const ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL =
  `${TABLES.NODES}:Query timeout after ` +
  `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`;
const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL =
  `${TABLES.NODES}:Distributed operation failed due to participant failures`;
const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID =
  '7493b0ab-a054-5fad-a91b-5e331db29304';
const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE =
  'Connection to node ' +
  `${ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID} closed`;
const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL =
  `${TABLES.NODES}:${ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE}`;
const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CODE =
  'ROUTER_MESSAGE_TIMEOUT';
const ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE = 'query_timeout';
const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE =
  'query_participant_failure';
const ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON =
  'selected_snapshot_source_timeout';
const ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON =
  'forced_repair_snapshot_timeout';
const ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON =
  'authoritative_control_snapshot_query_timeout';
const ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON =
  'authoritative_control_snapshot_query_pressure';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY =
  'authoritative_control_snapshot_query_pressure';
const ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER =
  'discovery_node_coverage_gap';
const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE =
  'repair_deferred';
const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE = 'deferred_refresh';
const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE = 'deferred';
const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION = 'retry';
const ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR =
  'leader unknown';
const ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ =
  'preferAuthoritativePublicationRead';
const ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH =
  'allowAuthoritativeReadinessRefresh';
const ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION =
  'reconcileAuthoritativeMembershipPublication';
const ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR =
  'forceAuthoritativeRepair';
const ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR =
  'allowAuthoritativeRepair';
const ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID =
  'active_gate_snapshot_coverage';
const ACTIVE_GATE_READINESS_EDGE_ID = 'readiness_startup_support';
const ACTIVE_GATE_TIMED_OUT_STATE = 'timed_out';
const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
const ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON =
  'snapshot_coverage_incomplete';
const ACTIVE_GATE_READINESS_INHERITED_REASON =
  'readiness_inherited_active_gate_no_progress';
const ACTIVE_GATE_READINESS_SUPPORT_PATH_INHERITED =
  'inherited_active_gate_no_progress';
const ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
const ACTIVE_GATE_READINESS_MODE_STARTUP = 'startup';
const ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL = 'terminal';
const ACTIVE_GATE_READINESS_TERMINAL_STALLED = 'stalled_no_progress';
const ACTIVE_GATE_FRONTIER_BLOCKED = 'blocked';
const ACTIVE_GATE_FRONTIER_DEFERRED = 'deferred';
const ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS = Object.freeze([]);
const ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS = Object.freeze([
  ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
  ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
]);
const ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS = Object.freeze([]);
const ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS = Object.freeze([
  'node-4',
  'node-5',
]);
const ACTIVE_GATE_HANDOFF_RECONCILE_PRIORITY_RECOVERY = Object.freeze({
  publicationRecoveryGate: Object.freeze({
    ready: false,
  }),
});
const PRIORITY_RECOVERY_REENTRY_NOW_MS = 2000;
const PRIORITY_RECOVERY_REENTRY_NODE_ID = 'node-1';
const PRIORITY_RECOVERY_REENTRY_OPERATION_ID = 'priority-reentry-op-1';
const PRIORITY_RECOVERY_REENTRY_PARTITION_ID = 'control_plane_publications-p1';
const PRIORITY_RECOVERY_REENTRY_SOURCE_NODE_ID = 'seed-node';
const PRIORITY_RECOVERY_REENTRY_TARGET_NODE_ID = 'node-2';
const PRIORITY_RECOVERY_REENTRY_REPLICA_ID =
  'control_plane_publications-p1-r4';
const PRIORITY_RECOVERY_REENTRY_STATUS_PENDING = 'pending';
const PRIORITY_RECOVERY_REENTRY_WORKFLOW_STEP_PENDING = 'PENDING';
const PRIORITY_RECOVERY_REENTRY_PROGRESS_OWNER =
  'operation_workflow_owner';
const PRIORITY_RECOVERY_REENTRY_PHASE_DISPATCH_PENDING = 'dispatch_pending';
const PRIORITY_RECOVERY_REENTRY_ACTUATION_STATE =
  'persisted_not_dispatched';
const PRIORITY_RECOVERY_REENTRY_NEXT_ACTION =
  'advance_existing_operation';
const PRIORITY_RECOVERY_REENTRY_BLOCKING_BOUNDARY = 'workflow_progress';
const PRIORITY_RECOVERY_REENTRY_WAIT_MODE = 'event_driven';
const PRIORITY_RECOVERY_REENTRY_SEMANTIC_STATE = 'recovering_in_flight';
const PRIORITY_RECOVERY_REENTRY_OPTIONS = Object.freeze({
  allowOwnerLaneRetry: true,
});
const PRIORITY_RECOVERY_REENTRY_OPERATION = Object.freeze({
  operationId: PRIORITY_RECOVERY_REENTRY_OPERATION_ID,
  partitionId: PRIORITY_RECOVERY_REENTRY_PARTITION_ID,
  status: PRIORITY_RECOVERY_REENTRY_STATUS_PENDING,
  workflowStep: PRIORITY_RECOVERY_REENTRY_WORKFLOW_STEP_PENDING,
  sourceNodeId: PRIORITY_RECOVERY_REENTRY_SOURCE_NODE_ID,
  targetNodeId: PRIORITY_RECOVERY_REENTRY_TARGET_NODE_ID,
  replicaId: PRIORITY_RECOVERY_REENTRY_REPLICA_ID,
  createdAtMs: ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
  updatedAtMs: ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
});
const PRIORITY_RECOVERY_REENTRY_DECISION_SNAPSHOT = Object.freeze({
  partitionId: PRIORITY_RECOVERY_REENTRY_PARTITION_ID,
  operationId: PRIORITY_RECOVERY_REENTRY_OPERATION_ID,
  coordinator: Object.freeze({
    operation: PRIORITY_RECOVERY_REENTRY_OPERATION,
  }),
  actuation: Object.freeze({
    workflowProgressPhaseId: PRIORITY_RECOVERY_REENTRY_PHASE_DISPATCH_PENDING,
    owner: PRIORITY_RECOVERY_REENTRY_PROGRESS_OWNER,
    state: PRIORITY_RECOVERY_REENTRY_ACTUATION_STATE,
  }),
  progress: Object.freeze({
    workflowProgressPhaseId: PRIORITY_RECOVERY_REENTRY_PHASE_DISPATCH_PENDING,
    currentOwner: PRIORITY_RECOVERY_REENTRY_PROGRESS_OWNER,
    nextRequiredAction: PRIORITY_RECOVERY_REENTRY_NEXT_ACTION,
    blockingBoundary: PRIORITY_RECOVERY_REENTRY_BLOCKING_BOUNDARY,
    waitMode: PRIORITY_RECOVERY_REENTRY_WAIT_MODE,
  }),
  blockerReasons: Object.freeze([]),
  semanticState: PRIORITY_RECOVERY_REENTRY_SEMANTIC_STATE,
});
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

test('AdminControlSnapshot uses authoritative published fallback when readiness has stale seed-only publication',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics(
      [{
        nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
        membershipPublication: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          requiredAckNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          acknowledgedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      }],
      {
        publication_id:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
        publication_kind:
          ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
        publication_epoch:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        published_active_node_ids: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
    );

    t.match(
      diagnostics,
      {
        publicationEpoch:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      'producer convergence diagnostics should prefer the wider durable published fallback over stale readiness publication',
    );
  });

test('AdminControlSnapshot carries authoritative published fallback through local snapshot diagnostics',
  async (t) => {
    const nodeRows = ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
      connection_state: ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE,
      ready_lease_expires_at:
        ACTIVE_GATE_OWNER_TRUTH_NOW_MS +
        ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS,
    }));
    const serviceRows = ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS.map(
      (nodeId) => ({
        service_id: nodeId,
        node_id: nodeId,
        status: ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS,
      }),
    );
    const durablePublishedPublicationRow = {
      publication_id:
        ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
      publication_kind:
        ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
      publication_epoch:
        ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
      status:
        ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
      published_active_node_ids: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return nodeRows;
          }
          if (tableName === TABLES.SERVICES) {
            return serviceRows;
          }
          return ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS;
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
            },
            membershipPublication: {
              publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              publishedActiveNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              requiredAckNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledgedNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return durablePublishedPublicationRow;
          },
          getLatestPublishedClusterPublicationSync() {
            return durablePublishedPublicationRow;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot();

    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        ?.publishedActiveNodeIds,
      [...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'producer diagnostics should carry durable published membership through local snapshot assembly',
    );
    t.same(
      result.controlPlaneDiagnostics.publishedMembershipObservation
        ?.publishedActiveNodeIds,
      [...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'strict published membership observation should remain aligned with producer diagnostics',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationActiveGateHandoff
        ?.pendingReconcileCount,
      ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT,
      'active-gate handoff should not retain reconcile debt after producer diagnostics observe durable membership',
    );
  });

test('AdminControlSnapshot keeps priority recovery readiness ahead of generic durable fallback without handoff',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
    });

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics(
      [{
        nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
        priorityControlPlaneRecovery:
          ACTIVE_GATE_HANDOFF_RECONCILE_PRIORITY_RECOVERY,
        membershipPublication: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          requiredAckNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          acknowledgedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      }],
      {
        publication_id:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
        publication_kind:
          ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
        publication_epoch:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        published_active_node_ids: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      {
        preferAuthoritativePublicationRead:
          ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      },
    );

    t.match(
      diagnostics,
      {
        publicationEpoch:
          ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
      },
      'generic durable fallback should not override readiness owner-recovery evidence without an active-gate handoff',
    );
  });

test('AdminControlSnapshot uses authoritative handoff reconcile fallback when readiness has priority recovery',
  async (t) => {
    const durablePublishedPublicationRow = {
      publication_id:
        ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
      publication_kind:
        ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
      publication_epoch:
        ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
      status:
        ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
      published_active_node_ids: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll() {
          return ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS;
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
            priorityControlPlaneRecovery:
              ACTIVE_GATE_HANDOFF_RECONCILE_PRIORITY_RECOVERY,
            membershipPublication: {
              publicationEpoch:
                ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              publishedActiveNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              requiredAckNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledgedNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            },
          }];
        },
        membershipPublicationService: {
          async getLatestClusterPublication() {
            return durablePublishedPublicationRow;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      preferAuthoritativePublicationRead:
        ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      publicationActiveGateHandoff: {
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
    });

    t.match(
      result.controlPlaneDiagnostics.publicationConvergence,
      {
        publicationEpoch:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      'authoritative active-gate handoff fallback should override stale readiness owner-recovery publication only when it covers the handoff target',
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
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
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
    t.match(
      result.controlPlaneDiagnostics.publicationActiveGateHandoff,
      {
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
        expectedNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        publishedActiveNodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
        missingPublishedNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        pendingReconcileNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
      'control-plane diagnostics should expose the canonical publication-to-active-gate handoff contract',
    );
    t.match(
      result.controlPlaneDiagnostics.activeGateCatchupFence,
      {
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        state: ACTIVE_GATE_CATCHUP_FENCE_STATE_PENDING,
        targetNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        durablePublication: {
          publicationEpoch: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH,
          nodeIds: [ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID],
          missingNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS],
        },
        missingProofReasons: [
          ACTIVE_GATE_CATCHUP_FENCE_REASON_DURABLE_INCOMPLETE,
        ],
        nextLegalAction: ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE,
        promotionAllowed: false,
      },
      'control-plane diagnostics should carry the owner-owned active-gate catch-up fence',
    );
    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        .activeGateCatchupFence,
      result.controlPlaneDiagnostics.activeGateCatchupFence,
      'publication convergence diagnostics should display the same catch-up fence without rebuilding promotion state',
    );
    t.match(
      result.controlPlaneDiagnostics.activeGateOwnerCohort
        .activeGateCatchupFence,
      {
        state: ACTIVE_GATE_CATCHUP_FENCE_STATE_PENDING,
        targetNodeIds: [...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS],
        missingProofReasons: [
          ACTIVE_GATE_CATCHUP_FENCE_REASON_DURABLE_INCOMPLETE,
        ],
        nextLegalAction: ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE,
        promotionAllowed: false,
      },
      'active-gate owner cohort diagnostics should carry the same catch-up fence',
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
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
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

test('AdminControlSnapshot maps clean priority recovery readiness debt to publication reconcile',
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
          priorityRecoveryCurrentSummary: {
            unresolvedClassCount:
              ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
            unresolvedSemanticStateCount:
              ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
            blockedPartitionCount:
              ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
          },
        },
        readinessByNodeId: {
          [ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]]: {
            reasonCodes: [
              CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            ],
          },
        },
      });

    t.match(
      activeGateOwnerCohort,
      {
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
        pendingRecoveryNodeIds: [
          ...ACTIVE_GATE_OWNER_TRUTH_EMPTY_NODE_IDS,
        ],
        pendingRecoveryCount:
          ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT,
        pendingReconcileNodeIds: [ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS[0]],
        pendingReconcileCount: ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT,
      },
      'clean canonical priority recovery evidence should not keep missing publication nodes in owner-recovery wait',
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

test('AdminControlSnapshot schedules workflow-owner reentry for dispatch-pending priority recovery snapshots',
  async (t) => {
    const scheduledReentries = [];
    const snapshot = new AdminControlSnapshot({
      nodeId: PRIORITY_RECOVERY_REENTRY_NODE_ID,
      nowFn: () => PRIORITY_RECOVERY_REENTRY_NOW_MS,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      sqlQueryEngine: {
        rebalanceCoordinator: {
          workflowOwner: {
            schedulePriorityRecoveryDispatchPendingReentry(
              decisionSnapshot,
              operations,
              options,
            ) {
              scheduledReentries.push({
                decisionSnapshot,
                operations,
                options,
              });
              return true;
            },
          },
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
      },
    });
    snapshot.buildPriorityRecoveryDecisionSnapshots = () => ({
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: [PRIORITY_RECOVERY_REENTRY_PARTITION_ID],
        blockedPartitions: [],
      },
      partitionIdsBySemanticState: {},
      snapshots: [PRIORITY_RECOVERY_REENTRY_DECISION_SNAPSHOT],
    });

    await snapshot.buildLocalControlSnapshot();

    t.equal(
      scheduledReentries.length,
      1,
      'admin control snapshots should hand dispatch-pending priority recovery snapshots back to the workflow owner',
    );
    t.equal(
      scheduledReentries[0].decisionSnapshot,
      PRIORITY_RECOVERY_REENTRY_DECISION_SNAPSHOT,
      'admin reentry should preserve the canonical decision snapshot',
    );
    t.same(
      scheduledReentries[0].operations,
      [PRIORITY_RECOVERY_REENTRY_OPERATION],
      'admin reentry should pass the canonical operation from the decision snapshot',
    );
    t.same(
      scheduledReentries[0].options,
      PRIORITY_RECOVERY_REENTRY_OPTIONS,
      'admin reentry should allow the workflow owner to retry after its owner lane clears',
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

test('AdminControlSnapshot forced authoritative membership observation stays read-only without handoff target',
  async (t) => {
    let observedReconcileOptions = null;
    let latestPublicationReadCount = 0;
    let observedAckPublicationRow = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            t.fail('forced authoritative reconcile should bypass cache reads');
            return null;
          },
          async getLatestClusterPublication() {
            latestPublicationReadCount += 1;
            return null;
          },
          async reconcileClusterMembership(options = {}) {
            observedReconcileOptions = options;
            return {
              publicationRow: {
                publication_id: 'publication-2',
                publication_kind: 'cluster_membership',
                publication_epoch: 2,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              },
            };
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
      reconcileAuthoritativeMembershipPublication: true,
    });

    t.same(
      observedReconcileOptions,
      null,
      'forced authoritative repair should not reconcile without a handoff target',
    );
    t.equal(
      latestPublicationReadCount,
      1,
      'read-only authoritative observation should fall back to the publication read path',
    );
    t.equal(
      observedAckPublicationRow,
      null,
      'forced authoritative reconcile should not acknowledge membership from the snapshot read path',
    );
    t.match(
      publicationRow,
      null,
      'no publication row should be synthesized from diagnostics-only reconcile',
    );
  });

test('AdminControlSnapshot build snapshot keeps broad authoritative membership observation read-only',
  async (t) => {
    let observedReconcileOptions = null;
    let latestPublicationReadCount = 0;
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-2',
      nowFn: () => 1000,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        membershipPublicationService: {
          async getLatestClusterPublication() {
            latestPublicationReadCount += 1;
            return null;
          },
          async reconcileClusterMembership(options = {}) {
            observedReconcileOptions = options;
            return {
              publicationRow: {
                publication_id: 'publication-3',
                publication_kind: 'cluster_membership',
                publication_epoch: 3,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1'],
              },
            };
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      preferAuthoritativePublicationRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });

    t.same(
      observedReconcileOptions,
      null,
      'buildLocalControlSnapshot should not run broad publication reconcile without handoff target',
    );
    t.equal(
      latestPublicationReadCount,
      1,
      'broad authoritative observation should use the read path after reconcile is skipped',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence,
      {
        status: null,
        publishedActiveNodeIds: [],
      },
      'diagnostics should not synthesize publication success from a skipped broad reconcile',
    );
  });

test('AdminControlSnapshot build snapshot forwards handoff pending reconcile target',
  async (t) => {
    let observedHandoff = null;
    let observedReconcileOptions = null;
    let enqueueAttempted = false;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      systemTableCache: {
        getAll() {
          return [...ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS];
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [...ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS];
        },
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            publicationActiveGateHandoff,
            options = {},
          ) {
            observedHandoff = publicationActiveGateHandoff;
            observedReconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          enqueueClusterMembershipReconcile() {
            enqueueAttempted = true;
          },
        },
      },
    });

    const result = await snapshot.buildLocalControlSnapshot({
      preferAuthoritativePublicationRead:
        ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      reconcileAuthoritativeMembershipPublication:
        ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
      publicationActiveGateHandoff: {
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
    });

    t.match(
      observedHandoff,
      {
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS,
        ],
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
      'admin snapshots should forward the active-gate handoff to the publication owner command',
    );
    t.equal(
      observedReconcileOptions.reconcileAuthoritativeMembershipPublication,
      ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
      'active-gate trigger should keep the explicit reconcile intent on the owner command',
    );
    t.match(
      result.controlPlaneDiagnostics.membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'admin diagnostics should display the owner outcome without converting it into publication truth',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'publication convergence should retain the owner outcome for representative reports',
    );
    t.equal(
      enqueueAttempted,
      false,
      'awaited owner reconcile should be preferred over queue-only catch-up when the coordinator exposes it',
    );
  });

test('AdminControlSnapshot surfaces handoff owner outcome when repair is not selected',
  async (t) => {
    let observedHandoff = null;
    const localSnapshot = {
      nodes: [
        ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            publicationActiveGateHandoff,
          ) {
            observedHandoff = publicationActiveGateHandoff;
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: false,
      triggerCodes: [],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.match(
      observedHandoff,
      {
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
      },
      'active-gate owner reconcile signals should trigger the membership publication owner even without repair',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'representative publication convergence should surface the owner command outcome',
    );
  });

test('AdminControlSnapshot queues handoff reconcile when awaited owner reconcile is pressure-deferred',
  async (t) => {
    let enqueuedContext = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership() {
            throw new Error(ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR);
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            enqueuedContext = context;
          },
        },
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        enqueued: true,
      },
      'pressure-deferred fallback reconcile should return a structured queued owner outcome',
    );
    t.match(
      enqueuedContext,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        allowEmptyPreloadedRows:
          ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
        disableNestedPriorityRecoveryPlanning:
          ACTIVE_GATE_HANDOFF_RECONCILE_DISABLE_NESTED_PRIORITY_RECOVERY,
        nodeRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        nodeEndpointRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        serviceRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        partitionRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        replicaOperationRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        readinessEntries: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        skipPublicationWriteReadback:
          ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'pressure-deferred awaited reconcile should still enqueue the canonical owner catch-up context',
    );
    t.equal(
      enqueuedContext.readProfile,
      ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
      'queued handoff reconcile should preserve diagnostics read intent',
    );
  });

test('AdminControlSnapshot queues handoff reconcile through SQL storage admission readiness owner',
  async (t) => {
    let enqueuedContext = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {},
      sqlQueryEngine: {
        rebalanceCoordinator: {
          storageAdmissionService: {
            controlPlaneReadinessService: {
              membershipPublicationService: {
                enqueueClusterMembershipReconcile(_reason, context = {}) {
                  enqueuedContext = context;
                },
              },
            },
          },
        },
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        enqueued: true,
      },
      'storage-admission runtime owner fallback should return the queued handoff outcome',
    );
    t.match(
      enqueuedContext,
      {
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
      },
      'storage-admission runtime owner fallback should enqueue the canonical handoff target',
    );
  });

test('AdminControlSnapshot returns handoff service-unavailable outcome when runtime owner is absent',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {},
      sqlQueryEngine: {},
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_SERVICE_UNAVAILABLE,
        enqueued: false,
        target: {
          reconcileRequired: true,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
        },
      },
      'missing runtime owner should still return a structured handoff outcome',
    );
  });

test('AdminControlSnapshot surfaces handoff command errors as structured outcomes',
  async (t) => {
    const commandError =
      new Error(ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR);
    commandError.retryAfterMs =
      ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            throw commandError;
          },
        },
      },
    });

    const triggeredSnapshot =
      await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
        staleSnapshot,
      );

    t.match(
      triggeredSnapshot.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_COMMAND_ERROR,
        retryAfterMs: ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS,
      },
      'trigger-only command failures should stay visible in publication convergence diagnostics',
    );
  });

test('AdminControlSnapshot distinguishes critical convergence defer from ordinary repair defer',
  async (t) => {
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
              enqueued: false,
              target: {
                reconcileRequired: true,
              },
              [ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_CONVERGENCE]: {
                convergenceClass:
                  CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
                pressureOutcome:
                  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME
                    .CRITICAL_DEFERRED,
                operation:
                  ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE,
                retryAfterMs:
                  ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS,
              },
            };
          },
        },
      },
    });

    const triggeredSnapshot =
      await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
        staleSnapshot,
      );

    t.match(
      triggeredSnapshot.controlPlaneDiagnostics,
      {
        criticalConvergenceDeferred:
          ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED,
        ordinaryRepairDeferred:
          ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
        controlPlaneConvergence: {
          convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED,
          operation: ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE,
        },
        publicationConvergence: {
          criticalConvergenceDeferred:
            ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED,
          ordinaryRepairDeferred:
            ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
        },
        activeGateOwnerCohort: {
          criticalConvergenceDeferred:
            ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED,
          ordinaryRepairDeferred:
            ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
        },
      },
      'critical convergence defer should stay distinct from ordinary repair deferral',
    );
  });

test('AdminControlSnapshot handoff reconcile defers when publication readback is unavailable',
  async (t) => {
    let publicationReadbackAttempts = 0;
    const upsertedRows = [];
    const publicationOwner = {
      async listPublications() {
        return [
          {
            publication_id:
              ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
            publication_kind:
              ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
            publication_epoch:
              ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
            status:
              ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            published_active_node_ids: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            required_ack_node_ids: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            acknowledged_node_ids: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
          },
        ];
      },
      async getPublication() {
        publicationReadbackAttempts += 1;
        throw new Error(ACTIVE_GATE_HANDOFF_RECONCILE_READBACK_FAILURE);
      },
      async upsertPublication(row) {
        upsertedRows.push(row);
        return row;
      },
    };
    const membershipPublicationService =
      new MembershipPublicationCoordinator({
        nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
        controlPlanePublicationsOwner: publicationOwner,
        systemTableCache: {
          getAll() {
            return [...ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS];
          },
        },
        now: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      });
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService,
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.equal(
      publicationReadbackAttempts > 0,
      true,
      'handoff catch-up should attempt diagnostics readback before reporting success',
    );
    t.equal(
      upsertedRows.length,
      0,
      'handoff catch-up should not report or patch a write when durable readback is unavailable',
    );
    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        publicationRow: null,
        enqueued: true,
        controlPlaneConvergence: {
          convergenceClass:
            CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
        },
      },
      'the awaited handoff reconcile should return a structured critical defer without carrying an unverified publication row',
    );
  });

test('AdminControlSnapshot queues handoff reconcile when awaited owner reconcile returns a stale target',
  async (t) => {
    let enqueuedContext = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership() {
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
                ],
              },
            };
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            enqueuedContext = context;
          },
        },
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        publicationRow: null,
        enqueued: true,
        controlPlaneConvergence: {
          convergenceClass:
            CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
        },
      },
      'stale awaited reconcile rows should return a structured critical defer instead of a completed handoff',
    );
    t.match(
      enqueuedContext,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        allowEmptyPreloadedRows:
          ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
        disableNestedPriorityRecoveryPlanning:
          ACTIVE_GATE_HANDOFF_RECONCILE_DISABLE_NESTED_PRIORITY_RECOVERY,
        nodeRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        nodeEndpointRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        serviceRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        partitionRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        replicaOperationRows: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        readinessEntries: ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        skipPublicationWriteReadback:
          ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'stale awaited reconcile rows should requeue the canonical owner catch-up context',
    );
  });

test('AdminControlSnapshot keeps handoff reconcile outcomes out of publication observation reads',
  async (t) => {
    let latestPublicationReadAttempted = false;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership() {
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status:
                  ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async getLatestClusterPublication() {
            latestPublicationReadAttempted = true;
            return {
              publication_id:
                ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
              publication_kind:
                ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
              publication_epoch:
                ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status:
                ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              published_active_node_ids: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              required_ack_node_ids: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledged_node_ids: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            };
          },
        },
      },
    });

    await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff(
      {
        schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
    );

    const observedPublication =
      await snapshot.ensureMembershipPublicationObservation({
        preferAuthoritativeRead:
          ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      });

    t.equal(
      latestPublicationReadAttempted,
      true,
      'authoritative publication observation should stay on the publication read path',
    );
    t.notMatch(
      observedPublication,
      {
        publicationEpoch:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      'handoff reconcile outcomes should not become publication observation truth',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner emits retry action after attempted repair',
  async (t) => {
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: false,
      failedTables: [TABLES.SERVICES],
      causeChain: ['control_plane_backpressure'],
      retryAfterMs: 16000,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
      errors: ['control_plane_pressure_degraded'],
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.match(
      result,
      {
        snapshotObservation: {
          state: 'deferred_refresh',
          contractState: 'deferred',
          nextAction: 'retry',
          reasonCodes: ['cache_stale_watermark'],
          retryAfterMs: 16000,
          refreshState: 'deferred',
        },
        observationMode: 'repair_deferred',
        adminObservation: {
          sharedOwnerResolved: true,
          repair: {
            deferred: true,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred:
            ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED,
        },
      },
      'attempted repair deferral should expose a legal retry action instead of wait-only stale evidence',
    );
  });

test('AdminControlSnapshot threads caller query timeout into authoritative repair',
  async (t) => {
    let repairOptions = null;
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return {
        applied: true,
      };
    };

    await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
    });

    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      'authoritative snapshot repair should inherit the caller query budget',
    );
  });

test('AdminControlSnapshot forced participant repair failure preserves the local snapshot',
  async (t) => {
    const buildOptions = [];
    let sharedOwnerRepairCalls = 0;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: ['node-4', 'node-5'],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      1,
      'participant failure should preserve the already built local snapshot',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after a deferred participant failure',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'deferred participant failure should keep metric-moving snapshot coverage',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: ['discovery_node_coverage_gap'],
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'forced participant failure should become a structured deferred owner observation',
    );
  });

test('AdminControlSnapshot forced participant repair failure returns a usable fallback snapshot',
  async (t) => {
    const buildOptions = [];
    let evaluationCalls = 0;
    let repairOptions = null;
    let sharedOwnerRepairCalls = 0;
    const emptySelectedSourceSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const fallbackSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (
        buildOptions.length > 1 &&
        (
          options[
            ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
          ] === true
        )
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      return buildOptions.length === 1 ?
        emptySelectedSourceSnapshot :
        fallbackSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => {
      evaluationCalls += 1;
      return {
        shouldRepair: true,
        triggerCodes: [
          ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
        ],
        nodeCoverage: {
          ...(evaluationCalls > 1 ?
            {
              sharedMetadata: {
                referencedNodeIds: [
                  ...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS,
                ],
              },
            } :
            {}),
          activeProjection: {
            hasCoverageGap: true,
            missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
          },
        },
      };
    };
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      2,
      'participant repair failure should try one local fallback when the selected source snapshot has no usable coverage',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should exit the forced repair path before reading the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should not schedule another authoritative repair while repair is deferred',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
      ],
      false,
      'fallback should avoid the failed authoritative publication read path',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH
      ],
      false,
      'fallback should not reopen readiness refresh',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION
      ],
      false,
      'fallback should not reconcile publication while repair is deferred',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced repair should reserve caller query time for returning the fallback snapshot',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after fallback deferral',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred participant failure should project service-discovery references above two-of-five',
    );
    t.same(
      result.projectedNodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred participant failure should expose projected fallback coverage',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: [
            ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
          ],
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'connection-closed participant repair failure should become a structured deferred snapshot',
    );
  });

test('AdminControlSnapshot thrown forced repair connection failure preserves a metric-moving fallback',
  async (t) => {
    const buildOptions = [];
    let repairOptions = null;
    let sharedOwnerRepairCalls = 0;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = new Error(
      ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
    );
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      if (
        options[
          ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ] === true
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      throw repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      2,
      'thrown forced repair failure should retry once from the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should exit forced repair before reading the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should not allow another authoritative repair while repair is deferred',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
      ],
      false,
      'fallback should not repeat the failed authoritative publication read',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced thrown repair should reserve caller query time for the local fallback',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after the thrown participant failure',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'thrown participant failure should keep snapshot coverage above two-of-five',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: [
            ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
          ],
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'thrown connection-closed repair failure should become a structured deferred snapshot',
    );
  });

test('AdminControlSnapshot forced repair uses projected fallback coverage under query pressure',
  async (t) => {
    const buildOptions = [];
    const projectedFallbackSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
      projectedNodes: [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return projectedFallbackSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      1,
      'projected fallback coverage should preserve the already built local snapshot',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred repair should promote projected fallback coverage above two-of-five',
    );
    t.same(
      result.projectedNodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred repair should keep projected fallback coverage visible to probes',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'projected forced repair pressure should become a structured deferred snapshot',
    );
  });

test('AdminControlSnapshot forced publication read failure preserves a metric-moving local fallback',
  async (t) => {
    const buildOptions = [];
    let repairOptions = null;
    let sharedOwnerRepairCalls = 0;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      if (
        options[
          ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ] === true
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: ['node-4', 'node-5'],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      2,
      'forced publication read failure should retry once from the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should exit forced repair before retrying the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should not allow another authoritative repair while repair is deferred',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
      ],
      false,
      'fallback should not repeat the failed authoritative publication read',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH
      ],
      false,
      'fallback should not open a readiness refresh side path',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION
      ],
      false,
      'fallback should not reconcile publication while repair is deferred',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced pre-snapshot repair should reserve caller query time for the local fallback',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after the fallback is marked deferred',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'deferred forced repair should keep the metric-moving local fallback',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'forced publication read repair failure should become a structured deferred owner observation',
    );
  });

test('AdminControlSnapshot forced query timeout preserves metric-moving local snapshot',
  async (t) => {
    const buildOptions = [];
    let sharedOwnerRepairCalls = 0;
    let repairOptions = null;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE],
      retryAfterMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: ['node-4', 'node-5'],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      1,
      'query timeout should preserve the already built local snapshot',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after a deferred query timeout',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced repair should reserve caller query time for returning the metric-moving local snapshot',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'deferred query timeout should keep metric-moving snapshot coverage',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: ['discovery_node_coverage_gap'],
          retryAfterMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'forced query timeout should become a structured deferred owner observation',
    );
  });

test('AdminControlSnapshot forced repair deferral triggers handoff owner command before returning',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const publicationActiveGateHandoff = {
      state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
      reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
      nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      expectedNodeIds: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      publishedActiveNodeIds: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
      ],
      pendingReconcileCount:
        ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
      pendingReconcileNodeIds: [
        ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
      ],
    };
    const localSnapshot = {
      nodes: [
        ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
        ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const fallbackSnapshot = {
      nodes: [...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const catchupSnapshot = {
      nodes: [...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
        },
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE],
      retryAfterMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return localSnapshot;
      }
      return buildOptions.length === 2 ? fallbackSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.match(
      reconcileOptions,
      {
        reconcileAuthoritativeMembershipPublication:
          ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
      },
      'forced repair deferral should trigger the owner command before returning',
    );
    t.equal(
      buildOptions.length,
      3,
      'a visible forced-deferral owner outcome should get one bounded snapshot rebuild',
    );
    t.match(
      buildOptions[2],
      {
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        preferAuthoritativePublicationRead: true,
        allowAuthoritativeReadinessRefresh:
          ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH,
        reconcileAuthoritativeMembershipPublication: false,
        publicationActiveGateHandoff,
      },
      'the bounded rebuild should keep the forced repair context while avoiding readiness refresh',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'visible owner publication should improve the returned snapshot coverage above two-of-five',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'forced repair deferral should surface the owner outcome in publication convergence',
    );
  });

test('AdminControlSnapshot forced repair failures preserve authoritative nodes query timeout replay evidence',
  async (t) => {
    const localSnapshot = {
      nodes: [ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL],
      causeChain: [
        ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE,
        ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE,
      ],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CODE,
        error: 'Query timeout after ' +
          `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`,
        retryAfterMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const error = await t.rejects(
      snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      }),
    );

    t.equal(
      error.cause,
      repairFailure,
      'forced repair failure should retain the structured repair result',
    );
    t.equal(
      error.message,
      `${ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX} ` +
        ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL,
      'forced repair failure should expose the nodes query timeout detail',
    );

    const selectedSnapshotError =
      `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR}; ` +
      `${ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX} ` +
      `${ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
      `${ACTIVE_GATE_SNAPSHOT_LANE}: ${error.message}`;
    const graph = buildTopologyConvergenceGraph({
      report: {
        scenarios: [
          {
            scenario: 'rolling-restart',
            publicationConvergence: {
              publicationStatus: 'UNKNOWN',
              pendingAckCount: 0,
              blockedNodeCount: 0,
              missingPublishedCount: 0,
              activeGate: {
                state: ACTIVE_GATE_TIMED_OUT_STATE,
                ready: false,
                progress: {
                  expectedNodeCount: ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT,
                  snapshotCoverageNodeCount:
                    ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT,
                  snapshotCoverageComplete: false,
                  selectedSnapshotNodeId:
                    ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
                  selectedSnapshotTimeoutMs:
                    ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
                  selectedSnapshotError,
                  readinessDelay: {
                    cause: ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                    source: 'selectedSnapshotError',
                    recoverability:
                      ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                    error: selectedSnapshotError,
                  },
                },
              },
            },
            readinessFailure: {
              mode: ACTIVE_GATE_READINESS_MODE_STARTUP,
              classCode: ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
              terminalReason: ACTIVE_GATE_READINESS_TERMINAL_STALLED,
              cause: ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              source: 'selectedSnapshotError',
            },
          },
        ],
      },
    });
    const replayFixture = buildTopologyConvergenceReplayFixture(graph);
    const replayResult = replayTopologyConvergenceFixture(replayFixture);
    const activeGateWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
    );
    const readinessWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_READINESS_EDGE_ID,
    );

    t.equal(
      replayResult.matches.preserved,
      true,
      'the replay fixture should preserve the owner-boundary classification',
    );
    t.match(
      replayFixture.publicationConvergence.activeGate.progress,
      {
        selectedSnapshotNodeId:
          ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        selectedSnapshotTimeoutMs:
          ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        selectedSnapshotSourceCause:
          ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        forcedRepairSnapshotCause:
          ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        authoritativeControlSnapshotQueryCause:
          ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON,
        activeGateSnapshotOwnerEdge:
          ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
      },
      'replay progress should separate selected-source, forced-repair, and authoritative-query causes',
    );
    t.same(
      activeGateWitness.reasons,
      [
        ACTIVE_GATE_TIMED_OUT_REASON,
        ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON,
      ],
      'active-gate witness should identify the exact snapshot subcauses',
    );
    t.equal(
      readinessWitness.state,
      ACTIVE_GATE_FRONTIER_DEFERRED,
      'readiness should remain downstream of active-gate no progress',
    );
    t.same(
      readinessWitness.reasons,
      [ACTIVE_GATE_READINESS_INHERITED_REASON],
      'readiness should not become the owning cause while snapshot coverage is blocked',
    );
    t.equal(
      readinessWitness.source.supportPath,
      ACTIVE_GATE_READINESS_SUPPORT_PATH_INHERITED,
      'readiness support should preserve inherited active-gate support path',
    );
    t.equal(
      replayFixture.expected.frontierState,
      ACTIVE_GATE_FRONTIER_BLOCKED,
      'replay fixture should keep active-gate snapshot coverage as the blocked frontier',
    );
  });

test('Topology convergence replay separates authoritative nodes participant query pressure',
  async (t) => {
    const selectedSnapshotError =
      `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR}; ` +
      `${ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX} ` +
      `${ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
      `${ACTIVE_GATE_SNAPSHOT_LANE}: ` +
      `${ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX} ` +
      ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL;
    const graph = buildTopologyConvergenceGraph({
      report: {
        scenarios: [
          {
            scenario: 'rolling-restart',
            publicationConvergence: {
              publicationStatus: 'UNKNOWN',
              pendingAckCount: 0,
              blockedNodeCount: 0,
              missingPublishedCount: 0,
              activeGate: {
                state: ACTIVE_GATE_TIMED_OUT_STATE,
                ready: false,
                progress: {
                  expectedNodeCount: ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT,
                  snapshotCoverageNodeCount:
                    ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT,
                  snapshotCoverageComplete: false,
                  selectedSnapshotNodeId:
                    ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
                  selectedSnapshotTimeoutMs:
                    ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
                  selectedSnapshotError,
                  readinessDelay: {
                    cause: ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                    source: 'selectedSnapshotError',
                    recoverability:
                      ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                    error: selectedSnapshotError,
                  },
                },
              },
            },
            readinessFailure: {
              mode: ACTIVE_GATE_READINESS_MODE_STARTUP,
              classCode: ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              recoverability: ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
              terminalReason: ACTIVE_GATE_READINESS_TERMINAL_STALLED,
              cause: ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              source: 'selectedSnapshotError',
            },
          },
        ],
      },
    });
    const replayFixture = buildTopologyConvergenceReplayFixture(graph);
    const replayResult = replayTopologyConvergenceFixture(replayFixture);
    const activeGateWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
    );
    const readinessWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_READINESS_EDGE_ID,
    );

    t.equal(
      replayResult.matches.preserved,
      true,
      'participant-failure replay should preserve the owner-boundary classification',
    );
    t.match(
      replayFixture.publicationConvergence.activeGate.progress,
      {
        selectedSnapshotNodeId:
          ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        selectedSnapshotTimeoutMs:
          ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        selectedSnapshotSourceCause:
          ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        forcedRepairSnapshotCause:
          ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        authoritativeControlSnapshotQueryCause:
          ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON,
        activeGateSnapshotOwnerEdge:
          ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
      },
      'participant-failure replay should keep authoritative nodes query pressure distinct from the forced repair stall',
    );
    t.same(
      activeGateWitness.reasons,
      [
        ACTIVE_GATE_TIMED_OUT_REASON,
        ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON,
      ],
      'active-gate witness should include authoritative nodes query pressure',
    );
    t.equal(
      readinessWitness.state,
      ACTIVE_GATE_FRONTIER_DEFERRED,
      'readiness should stay downstream of active-gate no progress',
    );
    t.same(
      readinessWitness.reasons,
      [ACTIVE_GATE_READINESS_INHERITED_REASON],
      'readiness should remain inherited support evidence',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner attempts publication catch-up before returning',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          pendingReconcileCount: 1,
          pendingReconcileNodeIds: ['node-2'],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const catchupSnapshot = {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 2,
          status: 'OPEN',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            reconcileOptions = context;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return buildOptions.length === 1 ? staleSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: false,
      failedTables: [TABLES.SERVICES],
      causeChain: ['control_plane_backpressure'],
      retryAfterMs: 12000,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
      errors: ['control_plane_pressure_degraded'],
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.match(
      reconcileOptions,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'repair-deferred degradation should perform a narrow publication-owner reconcile before rebuilding the snapshot view',
    );
    t.equal(
      buildOptions.length,
      1,
      'repair-deferred degradation should trigger the owner command without rebuilding the snapshot',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the returned deferred snapshot should keep the original snapshot view',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state: 'deferred_refresh',
          contractState: 'deferred',
          nextAction: 'retry',
          retryAfterMs: 12000,
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred:
            ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED,
          publicationConvergence: {
            publicationEpoch: 1,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
          },
        },
        observationMode: 'repair_deferred',
      },
      'the trigger-only deferred snapshot should keep the structured deferred retry outcome',
    );
  });

test('AdminControlSnapshot repair-deferred trigger refreshes after visible owner publication',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    let latestPublicationReadOptions = null;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
            ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS,
          ],
        },
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
            ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
            ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[2],
          ],
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            locallyEligibleNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            recoveryActiveNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            missingPublishedRecoveryActiveNodeIds: [
              ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
              ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[2],
            ],
          },
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async reconcileClusterMembership(options = {}) {
            reconcileOptions = options;
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async getLatestClusterPublication(options = {}) {
            latestPublicationReadOptions = options;
            return {
              publicationId:
                ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
              publicationKind:
                ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
              publicationEpoch:
                ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              publishedActiveNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
              ],
              requiredAckNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
              ],
              acknowledgedNodeIds: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
              ],
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return staleSnapshot;
      }
      if (
        options.allowAuthoritativeReadinessRefresh !==
          ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH
      ) {
        throw new Error(
          ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH_ERROR,
        );
      }
      const observedPublication =
        await snapshot.ensureMembershipPublicationObservation({
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
        });
      return {
        nodes: [...observedPublication.publishedActiveNodeIds],
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: observedPublication.publicationEpoch,
            status: observedPublication.status,
            publishedActiveNodeIds: [
              ...observedPublication.publishedActiveNodeIds,
            ],
          },
        },
      };
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'repair-deferred trigger should keep explicit owner-command intent',
    );
    t.equal(
      buildOptions.length,
      2,
      'a visible owner outcome should get one bounded authoritative snapshot rebuild',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'the visible owner outcome should improve returned snapshot coverage',
    );
    t.same(
      latestPublicationReadOptions,
      {
        preferAuthoritativeRead:
          ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
      },
      'the bounded rebuild should use authoritative publication reads',
    );
    t.equal(
      buildOptions[1].allowAuthoritativeReadinessRefresh,
      ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH,
      'the bounded rebuild should not reopen authoritative readiness refresh',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'the returned publication convergence should display the awaited owner outcome',
    );
  });

test('AdminControlSnapshot retains flat coverage refresh when visible owner publication drains handoff',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const pendingHandoff = {
      schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
      state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
      reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
      nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      expectedNodeIds: [
        ...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
      ],
      publishedActiveNodeIds: [
        ...ACTIVE_GATE_HANDOFF_FLAT_PUBLISHED_NODE_IDS,
      ],
      pendingReconcileCount: ACTIVE_GATE_HANDOFF_FLAT_PENDING_COUNT,
      pendingReconcileNodeIds: [
        ...ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS,
      ],
      runtimePromotionAllowed:
        ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
    };
    const refreshedHandoff = {
      ...pendingHandoff,
      state: ACTIVE_GATE_OWNER_COHORT_STATE_COMPLETE,
      reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_COMPLETE,
      nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_ADMIT_ACTIVE_GATE,
      publishedActiveNodeIds: [
        ...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
      ],
      pendingReconcileCount:
        ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT,
      pendingReconcileNodeIds: [],
      runtimePromotionAllowed:
        ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_TRUE,
    };
    const staleSnapshot = {
      nodes: [...ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: pendingHandoff,
        activeGateOwnerCohort: pendingHandoff,
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_FLAT_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const refreshedSnapshot = {
      nodes: [...ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: refreshedHandoff,
        activeGateOwnerCohort: refreshedHandoff,
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
          ],
          missingPublishedNodeIds: [],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
                ],
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return refreshedSnapshot;
    };

    const triggeredSnapshot =
      await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
        staleSnapshot,
        {},
      );
    const refreshResult =
      await snapshot.prepareVisibleMembershipPublicationHandoffRefresh(
        triggeredSnapshot,
        {},
      );

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'visible owner handoff should come from the narrow owner command',
    );
    t.equal(
      buildOptions.length,
      1,
      'visible owner handoff should perform one bounded refresh',
    );
    t.same(
      refreshResult.snapshot.nodes,
      [...ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS],
      'the retained refresh should not require node coverage to increase',
    );
    t.equal(
      refreshResult.refreshed,
      true,
      'flat coverage refresh should be retained when handoff evidence improves',
    );
    t.match(
      refreshResult.snapshot.controlPlaneDiagnostics
        .publicationActiveGateHandoff,
      {
        pendingReconcileCount:
          ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT,
        pendingReconcileNodeIds: [],
        runtimePromotionAllowed:
          ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_TRUE,
      },
      'the retained refresh should carry drained owner reconcile evidence',
    );
    t.match(
      refreshResult.snapshot.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'the retained refresh should preserve the visible owner outcome',
    );
  });

test('AdminControlSnapshot repair-deferred trigger preserves original snapshot after owner outcome',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      publishedNodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      projectedNodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publicationStatus: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async reconcileClusterMembership(options = {}) {
            reconcileOptions = options;
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return staleSnapshot;
      }
      throw new Error(ACTIVE_GATE_HANDOFF_CATCHUP_REBUILD_ERROR);
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'repair-deferred trigger should keep explicit owner-command intent',
    );
    t.equal(
      buildOptions.length,
      2,
      'repair-deferred trigger should try one bounded rebuild after visible owner outcome',
    );
    t.same(
      result.nodes,
      [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      'the returned deferred snapshot should preserve the original observed coverage',
    );
    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        .publishedActiveNodeIds,
      [...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS],
      'the returned publication convergence should not convert an owner outcome into publication truth',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'the returned publication convergence should surface the owner outcome',
    );
  });

test('AdminControlSnapshot repair-deferred trigger queues owner reconcile without rebuild after pressure defers',
  async (t) => {
    const buildOptions = [];
    const reconcileOptions = [];
    const enqueuedContexts = [];
    let latestPublicationReadAttempted = false;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            locallyEligibleNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            recoveryActiveNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            missingPublishedRecoveryActiveNodeIds: [
              ...ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
            ],
          },
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership(options = {}) {
            reconcileOptions.push(options);
            if (reconcileOptions.length === 1) {
              throw new Error(ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR);
            }
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            enqueuedContexts.push(context);
          },
          async getLatestClusterPublication() {
            latestPublicationReadAttempted = true;
            return {
              publication_id:
                ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
              publication_kind:
                ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
              publication_epoch:
                ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              published_active_node_ids: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              required_ack_node_ids: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledged_node_ids: [
                ...ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return staleSnapshot;
      }
      const observedPublication =
        await snapshot.ensureMembershipPublicationObservation({
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
          reconcileAuthoritativeMembershipPublication:
            options.reconcileAuthoritativeMembershipPublication === true,
          publicationActiveGateHandoff:
            options.publicationActiveGateHandoff,
        });
      return {
        nodes: [...observedPublication.publishedActiveNodeIds],
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: observedPublication.publicationEpoch,
            status: observedPublication.status,
            publishedActiveNodeIds: [
              ...observedPublication.publishedActiveNodeIds,
            ],
          },
        },
      };
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      reconcileOptions.length,
      0,
      'trigger-only fallback should not run broad reconcileClusterMembership directly',
    );
    t.match(
      enqueuedContexts[0],
      {
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'the pressure-deferred direct attempt should still enqueue the owner catch-up target',
    );
    t.equal(
      buildOptions.length,
      1,
      'the pressure-deferred trigger-only path should not rebuild the snapshot',
    );
    t.equal(
      latestPublicationReadAttempted,
      false,
      'the trigger-only path should not run publication observation reads',
    );
    t.same(
      result.nodes,
      [ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      'the returned deferred snapshot should keep the original snapshot coverage',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        enqueued: true,
      },
      'the returned deferred snapshot should surface the queued owner outcome',
    );
  });

test('AdminControlSnapshot no-attempt path still triggers publication owner command',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          pendingReconcileCount: 1,
          pendingReconcileNodeIds: ['node-2'],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const catchupSnapshot = {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 2,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            reconcileOptions = context;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return buildOptions.length === 1 ? staleSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.match(
      reconcileOptions,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'repair-deferred no-attempt path should perform the narrow publication-owner reconcile',
    );
    t.equal(
      buildOptions.length,
      1,
      'the no-attempt trigger-only path should not rebuild the snapshot',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the returned deferred snapshot should keep the original snapshot',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state: 'stale_usable',
          contractState: 'pending',
          nextAction: 'wait',
        },
        observationMode: 'repair_deferred',
      },
      'the no-attempt deferred path should keep the shared-owner stale outcome',
    );
  });

test('AdminControlSnapshot repair-unavailable path still triggers publication owner command',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          pendingReconcileCount: 1,
          pendingReconcileNodeIds: ['node-2'],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const catchupSnapshot = {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 2,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            reconcileOptions = context;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return buildOptions.length === 1 ? staleSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => false;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.match(
      reconcileOptions,
      {
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
        readProfile:
          ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'repair-unavailable snapshots should still enqueue publication owner catch-up',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the repair-unavailable path should return the original trigger-only snapshot',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner skips publication catch-up for owner recovery waits',
  async (t) => {
    const buildOptions = [];
    let reconcileAttempted = false;
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          nextAction: 'wait_owner_recovery',
          pendingRecoveryCount: 1,
          pendingRecoveryNodeIds: ['node-2'],
          pendingReconcileCount: 0,
          pendingReconcileNodeIds: [],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile() {
            reconcileAttempted = true;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      buildOptions.length,
      1,
      'wait_owner_recovery should not schedule publication catch-up from repair-deferred admin reads',
    );
    t.equal(
      reconcileAttempted,
      false,
      'wait_owner_recovery should not be treated as a publication reconcile target',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the deferred snapshot should stay on the original local snapshot',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner skips publication catch-up without pending reconcile evidence',
  async (t) => {
    const buildOptions = [];
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: false,
      failedTables: [TABLES.SERVICES],
      causeChain: ['control_plane_backpressure'],
      retryAfterMs: 12000,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
      errors: ['control_plane_pressure_degraded'],
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.equal(
      buildOptions.length,
      1,
      'repair-deferred degradation should not run publication catch-up without owner-reconcile evidence',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the deferred snapshot should stay on the original local snapshot',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state: 'deferred_refresh',
          contractState: 'deferred',
          nextAction: 'retry',
          retryAfterMs: 12000,
        },
        observationMode: 'repair_deferred',
      },
      'the local deferred retry outcome should remain structured',
    );
  });

test('AdminControlSnapshot auto-repaired snapshots use authoritative membership publication without acknowledging',
  async (t) => {
    let authoritativeLatestPublicationReadOptions = null;
    let acknowledgePublicationRow = null;
    const authoritativeRepairQueueEvents = [];
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
          async enqueueClusterMembershipReconcile(reason, options = {}) {
            authoritativeRepairQueueEvents.push({reason, options});
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
      authoritativeRepairQueueEvents.length,
      0,
      'post-repair control snapshots should not use the read path as publication catch-up',
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
