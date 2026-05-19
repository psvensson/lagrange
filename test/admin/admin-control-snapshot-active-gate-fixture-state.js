import {TABLES} from '../../src/constants/index.js';

export const COMPLETED_REPLACE_CONTROL_SNAPSHOT_FIXTURE = Object.freeze({
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
export const ACTIVE_GATE_OWNER_TRUTH_NOW_MS = 1000;
export const ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_DELTA_MS = 1000;
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EPOCH = 31;
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS = 'PUBLISHED';
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS_OPEN = 'OPEN';
export const ACTIVE_GATE_OWNER_TRUTH_NODE_STATUS = 'active';
export const ACTIVE_GATE_OWNER_TRUTH_CONNECTION_STATE = 'ready';
export const ACTIVE_GATE_OWNER_TRUTH_CONNECTED_STATE = 'connected';
export const ACTIVE_GATE_OWNER_TRUTH_SOURCE = 'locally_eligible_projection';
export const ACTIVE_GATE_OWNER_TRUTH_EFFECTIVE_SOURCE = 'publication_owner_truth';
export const ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ID = 'node-1-ws';
export const ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_TRANSPORT = 'ws';
export const ACTIVE_GATE_OWNER_TRUTH_LOCAL_ENDPOINT_ADDRESS = 'ws://node-1:8082';
export const ACTIVE_GATE_OWNER_TRUTH_PRIORITY_PARTITION_COUNT = 0;
export const ACTIVE_GATE_OWNER_TRUTH_PENDING_ACK_COUNT = 0;
export const ACTIVE_GATE_OWNER_TRUTH_PRIORITY_RECOVERY_CLEAN_COUNT = 0;
export const ACTIVE_GATE_OWNER_TRUTH_READY_LEASE_COUNT = 1;
export const ACTIVE_GATE_OWNER_TRUTH_SELECTED_PUBLISHED_COUNT = 1;
export const ACTIVE_GATE_OWNER_TRUTH_CURRENT_MISSING_COUNT = 5;
export const ACTIVE_GATE_OWNER_TRUTH_BEST_MISSING_COUNT = 4;
export const ACTIVE_GATE_OWNER_TRUTH_EXPECTED_NODE_COUNT = 5;
export const ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION = 1;
export const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
export const ACTIVE_GATE_OWNER_COHORT_STATE_COMPLETE = 'complete';
export const ACTIVE_GATE_CATCHUP_FENCE_STATE_PENDING = 'catchup_pending';
export const ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
export const ACTIVE_GATE_OWNER_COHORT_REASON_COMPLETE =
  'owner_cohort_complete';
export const ACTIVE_GATE_CATCHUP_FENCE_REASON_DURABLE_INCOMPLETE =
  'durable_publication_incomplete';
export const ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
export const ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
export const ACTIVE_GATE_HANDOFF_NEXT_ACTION_ADMIT_ACTIVE_GATE =
  'admit_active_gate';
export const ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE = false;
export const ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_TRUE = true;
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_AVAILABLE = 'available';
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_STATE_UNAVAILABLE = 'unavailable';
export const ACTIVE_GATE_OWNER_COHORT_GATE_STATE_STALLED = 'stalled';
export const ACTIVE_GATE_OWNER_COHORT_GATE_REASON_STALLED_NO_PROGRESS =
  'stalled_no_progress';
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_ELAPSED_MS = 121033;
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS = 9;
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_MAX_ATTEMPTS = 10;
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_ATTEMPTS_SINCE_PROGRESS = 2;
export const ACTIVE_GATE_OWNER_COHORT_BUDGET_COORDINATOR_CYCLES = 3;
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_UNPUBLISHED =
  'unpublished_observation';
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_STEADY =
  'steady_published';
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_EVIDENCE_ABSENT = '';
export const ACTIVE_GATE_OWNER_TRUTH_FRESHNESS_FENCE_CONSUMER_LAG = 'consumer_lag';
export const ACTIVE_GATE_OWNER_TRUTH_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER =
  'waiting_for_consumer';
export const ACTIVE_GATE_OWNER_TRUTH_STREAM_OUTCOME_STALE = 'stale';
export const ACTIVE_GATE_OWNER_TRUTH_RECENT_HEARTBEAT_DELTA_MS = 1000;
export const ACTIVE_GATE_OWNER_TRUTH_STALE_HEARTBEAT_DELTA_MS = 61000;
export const ACTIVE_GATE_OWNER_TRUTH_NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
  'node-4',
  'node-5',
]);
export const ACTIVE_GATE_OWNER_TRUTH_LOCAL_NODE_ID =
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS[0];
export const ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(1),
);
export const ACTIVE_GATE_OWNER_TRUTH_EMPTY_NODE_IDS = Object.freeze([]);
export const ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
]);
export const ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(0, 4),
);
export const ACTIVE_GATE_HANDOFF_FLAT_PUBLISHED_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(0, 2),
);
export const ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS = Object.freeze(
  ACTIVE_GATE_OWNER_TRUTH_NODE_IDS.slice(2),
);
export const ACTIVE_GATE_HANDOFF_FLAT_PENDING_COUNT =
  ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS.length;
export const ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID =
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1];
export const ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS = Object.freeze([
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
]);
export const ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS = Object.freeze(
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS.slice(1),
);
export const ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT =
  ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS.length;
export const ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS = Object.freeze([
  ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
]);
export const ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_COUNT =
  ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS.length;
export const ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT = 0;
export const ACTIVE_GATE_HANDOFF_OPEN_PENDING_ACK_COUNT = 1;
export const ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ = true;
export const ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE = true;
export const ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK = false;
export const ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE = 'diagnostics';
export const ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS = true;
export const ACTIVE_GATE_HANDOFF_RECONCILE_DISABLE_NESTED_PRIORITY_RECOVERY = true;
export const ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH = false;
export const ACTIVE_GATE_HANDOFF_RECONCILE_READBACK_FAILURE =
  'handoff_publication_readback_unavailable';
export const ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND =
  'cluster_membership';
export const ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH = 3;
export const ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID =
  'publication-3';
export const ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID =
  'publication-4';
export const ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR =
  'publication_reconcile_pressure';
export const ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH_ERROR =
  'catchup_rebuild_should_not_force_authoritative_readiness_refresh';
export const ACTIVE_GATE_HANDOFF_CATCHUP_REBUILD_ERROR =
  'catchup_rebuild_unavailable_after_publication_write';
export const ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH = 4;
export const ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_STATUS =
  ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS;
export const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE =
  'published_visible';
export const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED =
  'write_deferred';
export const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON =
  'owner_reconcile_enqueued';
export const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_COMMAND_ERROR =
  'owner_reconcile_error';
export const ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_SERVICE_UNAVAILABLE =
  'owner_reconcile_service_unavailable';
export const ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED = true;
export const ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED = false;
export const ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED = true;
export const ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_CONVERGENCE =
  'controlPlaneConvergence';
export const ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE =
  'owner_recovery_wake';
export const ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS = 32000;
export const ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS = 1000;
export const ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OPERATION =
  'active_gate_handoff';
export const ACTIVE_GATE_HANDOFF_RECONCILE_CACHE_STALE_TRIGGER =
  'cache_stale_watermark';
export const ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_BACKPRESSURE_CAUSE =
  'control_plane_backpressure';
export const ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_QUERY_TRANSPORT_READY_STATE =
  'ready';
export const ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_DEGRADED_ERROR =
  'control_plane_pressure_degraded';
export const ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS = 3349;
export const ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID =
  '11601fe0-72d6-5853-8590-ec2881853e72';
export const ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS = 100;
export const ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS = 50;
export const ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT = 5;
export const ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT = 0;
export const ACTIVE_GATE_SNAPSHOT_LANE = 'snapshot';
export const ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR =
  'Admin API query timed out for node ' +
  `${ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
  `${ACTIVE_GATE_SNAPSHOT_LANE} after ` +
  `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`;
export const ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX =
  'forced repair snapshot failed: Admin API query failed for node';
export const ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX =
  'Authoritative control snapshot repair failed:';
export const ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL =
  `${TABLES.NODES}:Query timeout after ` +
  `${ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`;
export const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL =
  `${TABLES.NODES}:Distributed operation failed due to participant failures`;
export const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID =
  '7493b0ab-a054-5fad-a91b-5e331db29304';
export const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE =
  'Connection to node ' +
  `${ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID} closed`;
export const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL =
  `${TABLES.NODES}:${ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE}`;
export const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
export const ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CODE =
  'ROUTER_MESSAGE_TIMEOUT';
export const ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE = 'query_timeout';
export const ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE =
  'query_participant_failure';
export const ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON =
  'selected_snapshot_source_timeout';
export const ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON =
  'forced_repair_snapshot_timeout';
export const ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON =
  'authoritative_control_snapshot_query_timeout';
export const ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON =
  'authoritative_control_snapshot_query_pressure';
export const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY =
  'authoritative_control_snapshot_query_pressure';
export const ACTIVE_GATE_HANDOFF_OPEN_PROGRESS_TEST_NAME =
  'AdminControlSnapshot no-attempt path queues flattened OPEN active-gate ' +
  'handoff reconcile';
export const ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER =
  'discovery_node_coverage_gap';
export const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE =
  'repair_deferred';
export const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE = 'deferred_refresh';
export const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE = 'deferred';
export const ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION = 'retry';
export const ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR =
  'leader unknown';
export const ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ =
  'preferAuthoritativePublicationRead';
export const ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH =
  'allowAuthoritativeReadinessRefresh';
export const ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION =
  'reconcileAuthoritativeMembershipPublication';
export const ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR =
  'forceAuthoritativeRepair';
export const ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR =
  'allowAuthoritativeRepair';
export const ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID =
  'active_gate_snapshot_coverage';
export const ACTIVE_GATE_READINESS_EDGE_ID = 'readiness_startup_support';
export const ACTIVE_GATE_TIMED_OUT_STATE = 'timed_out';
export const ACTIVE_GATE_TIMED_OUT_REASON = 'active_gate_timed_out';
export const ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON =
  'snapshot_coverage_incomplete';
export const ACTIVE_GATE_READINESS_INHERITED_REASON =
  'readiness_inherited_active_gate_no_progress';
export const ACTIVE_GATE_READINESS_SUPPORT_PATH_INHERITED =
  'inherited_active_gate_no_progress';
export const ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
export const ACTIVE_GATE_READINESS_MODE_STARTUP = 'startup';
export const ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL = 'terminal';
export const ACTIVE_GATE_READINESS_TERMINAL_STALLED = 'stalled_no_progress';
export const ACTIVE_GATE_FRONTIER_BLOCKED = 'blocked';
export const ACTIVE_GATE_FRONTIER_DEFERRED = 'deferred';
export const ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS = Object.freeze([]);
export const ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS = Object.freeze([
  ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
  ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
  '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
]);
export const ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS = Object.freeze([]);
export const ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS = Object.freeze([
  'node-4',
  'node-5',
]);
export const ACTIVE_GATE_HANDOFF_RECONCILE_PRIORITY_RECOVERY = Object.freeze({
  publicationRecoveryGate: Object.freeze({
    ready: false,
  }),
});
export const PRIORITY_RECOVERY_REENTRY_NOW_MS = 2000;
export const PRIORITY_RECOVERY_REENTRY_NODE_ID = 'node-1';
export const PRIORITY_RECOVERY_REENTRY_OPERATION_ID = 'priority-reentry-op-1';
export const PRIORITY_RECOVERY_REENTRY_PARTITION_ID = 'control_plane_publications-p1';
export const PRIORITY_RECOVERY_REENTRY_SOURCE_NODE_ID = 'seed-node';
export const PRIORITY_RECOVERY_REENTRY_TARGET_NODE_ID = 'node-2';
export const PRIORITY_RECOVERY_REENTRY_REPLICA_ID =
  'control_plane_publications-p1-r4';
export const PRIORITY_RECOVERY_REENTRY_STATUS_PENDING = 'pending';
export const PRIORITY_RECOVERY_REENTRY_WORKFLOW_STEP_PENDING = 'PENDING';
export const PRIORITY_RECOVERY_REENTRY_PROGRESS_OWNER =
  'operation_workflow_owner';
export const PRIORITY_RECOVERY_REENTRY_PHASE_DISPATCH_PENDING = 'dispatch_pending';
export const PRIORITY_RECOVERY_REENTRY_ACTUATION_STATE =
  'persisted_not_dispatched';
export const PRIORITY_RECOVERY_REENTRY_NEXT_ACTION =
  'advance_existing_operation';
export const PRIORITY_RECOVERY_REENTRY_BLOCKING_BOUNDARY = 'workflow_progress';
export const PRIORITY_RECOVERY_REENTRY_WAIT_MODE = 'event_driven';
export const PRIORITY_RECOVERY_REENTRY_SEMANTIC_STATE = 'recovering_in_flight';
export const PRIORITY_RECOVERY_REENTRY_OPTIONS = Object.freeze({
  allowOwnerLaneRetry: true,
});
export const PRIORITY_RECOVERY_REENTRY_OPERATION = Object.freeze({
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
export const PRIORITY_RECOVERY_REENTRY_DECISION_SNAPSHOT = Object.freeze({
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
export const ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_ROW = Object.freeze({
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
