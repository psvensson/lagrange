import {
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_CAPACITY_LOG_MSG,
} from '../../../src/rebalancer/storage-capacity-constants.js';

const PUBLICATION_EVIDENCE_REPLAY_FILE = Object.freeze({
  FAILURE_BUNDLE: 'failure-bundle.json',
  SNAPSHOTS: 'snapshots.ndjson',
  TIMELINE_LOG: '_timeline.log',
});
const PUBLICATION_EVIDENCE_REPLAY_ENCODING = 'utf8';
const PUBLICATION_EVIDENCE_REPLAY_NEWLINE = '\n';
const PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT = '';
const PUBLICATION_EVIDENCE_REPLAY_JSON_INDENT = 2;
const PUBLICATION_EVIDENCE_REPLAY_JSON_REPLACER = null;
const PUBLICATION_EVIDENCE_REPLAY_EXIT_CODE = Object.freeze({
  FAILURE: 1,
});
const PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY = Object.freeze({
  AVAILABLE: 'available',
  MISSING: 'missing',
});
const PUBLICATION_EVIDENCE_REPLAY_SOURCE = Object.freeze({
  FAILURE_BUNDLE: 'failure_bundle',
  SNAPSHOT: 'snapshot',
});
const PUBLICATION_EVIDENCE_REPLAY_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'activeGateSnapshotCoverage',
  BLOCKED_PARTITIONS: 'blockedPartitions',
  CONTROL_PLANE: 'controlPlane',
  CONTROL_PLANE_PUBLICATIONS: 'controlPlanePublications',
  CONTROL_PLANE_PUBLICATIONS_SNAKE: 'control_plane_publications',
  EXCERPTS_BY_NODE_ID: 'excerptsByNodeId',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  LOGS: 'logs',
  MISSING_PARTITION_IDS: 'missingPartitionIds',
  NODE_ENDPOINTS: 'nodeEndpoints',
  NODE_ENDPOINTS_SNAKE: 'node_endpoints',
  NODES: 'nodes',
  PARTITIONS: 'partitions',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  PARTITION_WITNESSES: 'partitionWitnesses',
  PRIORITY_PARTITION_SUMMARY: 'priorityPartitionSummary',
  PRIORITY_RECOVERY_OBSERVATION: 'priorityRecoveryObservation',
  PRIORITY_RECOVERY_PARTITION_WITNESSES: 'priorityRecoveryPartitionWitnesses',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLICATION_STATUS: 'publicationStatus',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REPLICA_OPERATIONS: 'replicaOperations',
  REPLICA_OPERATIONS_SNAKE: 'replica_operations',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SERVICES: 'services',
  STANDARD_SUMMARY: 'standardSummary',
  STATUS: 'status',
  SUMMARY: 'summary',
  TIMESTAMP: 'timestamp',
});
const PUBLICATION_EVIDENCE_REPLAY_LINE = Object.freeze({
  REPORT: 'report',
  SNAPSHOT_TIMESTAMP: 'snapshotTimestamp',
  ROW_COUNTS: 'rowCounts',
  DURABLE: 'durable',
  REPLAYED: 'replayed',
  SELECTED_SNAPSHOT_OBSERVATION: 'selectedSnapshotObservation',
  OWNER_RPC_CACHE_REPAIR: 'ownerRpcCacheRepair',
  SELECTED_SNAPSHOT_REPAIR_EVIDENCE_RECOVERY:
    'selectedSnapshotRepairEvidenceRecovery',
  REBALANCER_FOLLOW_UP_HANDOFF: 'rebalancerFollowUpHandoff',
  PRIORITY_RECOVERY_WITNESSES: 'priorityRecoveryWitnesses',
  SUPPORTING_PRIORITY_RECOVERY_WITNESS: 'supportingPriorityRecoveryWitness',
  COMPARISON: 'comparison',
});
const PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD = Object.freeze({
  AVAILABILITY: 'availability',
  BEST_COVERAGE_NODE_COUNT: 'bestCoverageNodeCount',
  EXPECTED_NODE_COUNT: 'expectedNodeCount',
  SELECTED_ADMIN_READY: 'selectedAdminReady',
  SELECTED_MISSING_PUBLISHED_NODE_IDS: 'selectedMissingPublishedNodeIds',
  SELECTED_PUBLISHED_ACTIVE_NODE_IDS: 'selectedPublishedActiveNodeIds',
  SELECTED_REACHABLE_BY: 'selectedReachableBy',
  SELECTED_SNAPSHOT_ADMIN_READY: 'selectedSnapshotAdminReady',
  SELECTED_SNAPSHOT_NODE_ID: 'selectedSnapshotNodeId',
  SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE:
    'selectedSnapshotObservationContractState',
  SELECTED_SNAPSHOT_OBSERVATION_MODE: 'selectedSnapshotObservationMode',
  SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION: 'selectedSnapshotObservationNextAction',
  SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES:
    'selectedSnapshotObservationReasonCodes',
  SELECTED_SNAPSHOT_OBSERVATION_REFRESH_STATE:
    'selectedSnapshotObservationRefreshState',
  SELECTED_SNAPSHOT_OBSERVATION_STATE: 'selectedSnapshotObservationState',
  SELECTED_SNAPSHOT_REACHABLE_BY: 'selectedSnapshotReachableBy',
  SELECTED_SNAPSHOT_REACHABILITY_ERROR: 'selectedSnapshotReachabilityError',
  SELECTED_SNAPSHOT_REPAIR_DEFERRED: 'selectedSnapshotRepairDeferred',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD = Object.freeze({
  AVAILABILITY: 'availability',
  CAUSE_CHAIN: 'causeChain',
  DEFERRAL_STATE: 'deferralState',
  FAILED_TABLE_NAMES: 'failedTableNames',
  FAILURE_CLASSES: 'failureClasses',
  LATEST_RETRY_AFTER_MS: 'latestRetryAfterMs',
  MATCHING_DEFERRAL_COUNT: 'matchingDeferralCount',
  NODE_IDS: 'nodeIds',
  READ_SOURCES: 'readSources',
  SELECTED_WITNESS_DEFERRAL_COUNT: 'selectedWitnessDeferralCount',
  SELECTED_WITNESS_LATEST_RETRY_AFTER_MS: 'selectedWitnessLatestRetryAfterMs',
  SELECTED_WITNESS_NODE_ID: 'selectedWitnessNodeId',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD = Object.freeze({
  AVAILABILITY: 'availability',
  EVIDENCE_STATE: 'evidenceState',
  RECONSTRUCTED_CAUSE_CHAIN: 'reconstructedCauseChain',
  RECONSTRUCTED_FAILED_TABLE_NAMES: 'reconstructedFailedTableNames',
  RECONSTRUCTED_OWNER_RPC_AVAILABILITY: 'reconstructedOwnerRpcAvailability',
  RECONSTRUCTED_OWNER_RPC_DEFERRAL_STATE: 'reconstructedOwnerRpcDeferralState',
  RECONSTRUCTED_READ_SOURCES: 'reconstructedReadSources',
  RETAINED_OBSERVATION_AVAILABILITY: 'retainedObservationAvailability',
  RETAINED_OBSERVATION_DEFERRAL_STATE: 'retainedObservationDeferralState',
  RETAINED_OBSERVATION_REASON_CODES: 'retainedObservationReasonCodes',
  RETAINED_OBSERVATION_STATE: 'retainedObservationState',
  SELECTED_WITNESS_NODE_ID: 'selectedWitnessNodeId',
});
const PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD = Object.freeze({
  ACTUATION_STATE: 'actuationState',
  AVAILABILITY: 'availability',
  BLOCKING_BOUNDARY: 'blockingBoundary',
  CORRELATION_KEY: 'correlationKey',
  CURRENT_OWNER: 'currentOwner',
  LATEST_OPERATION_STATUS: 'latestOperationStatus',
  LATEST_OPERATION_WORKFLOW_STEP: 'latestOperationWorkflowStep',
  NEXT_REQUIRED_ACTION: 'nextRequiredAction',
  OPERATION_ID: 'operationId',
  PARTITION_ID: 'partitionId',
  PROGRESS_CLASS_IDS: 'progressClassIds',
  SERIAL_WAIT_OPERATION_IDS: 'serialWaitOperationIds',
  SERIAL_WAIT_PARTITION_IDS: 'serialWaitPartitionIds',
  SEMANTIC_STATE_ID: 'semanticStateId',
  STEP_AGE_MS: 'stepAgeMs',
  STEP_TIMEOUT_MS: 'stepTimeoutMs',
  WAIT_MODE: 'waitMode',
  WORKFLOW_PROGRESS_PHASE_ID: 'workflowProgressPhaseId',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD = Object.freeze({
  POST_TERMINAL_ADMISSION_ALLOWED_COUNT: 'postTerminalAdmissionAllowedCount',
  POST_TERMINAL_ADMISSION_ALLOWED_OBSERVED:
    'postTerminalAdmissionAllowedObserved',
  POST_TERMINAL_ADMISSION_DENIED_OBSERVED:
    'postTerminalAdmissionDeniedObserved',
  POST_TERMINAL_BUDGET_BLOCK_OBSERVED: 'postTerminalBudgetBlockObserved',
  POST_TERMINAL_BUDGET_PRESSURE_OBSERVED:
    'postTerminalBudgetPressureObserved',
  POST_TERMINAL_BUDGET_PRESSURE_QUERY_DURATION_MS:
    'postTerminalBudgetPressureQueryDurationMs',
  POST_TERMINAL_BUDGET_PRESSURE_ROW_COUNT:
    'postTerminalBudgetPressureRowCount',
  POST_TERMINAL_BUDGET_PRESSURE_TIME_MS:
    'postTerminalBudgetPressureTimeMs',
  POST_TERMINAL_EXECUTION_GAP_STATE: 'postTerminalExecutionGapState',
  POST_TERMINAL_FEASIBILITY_FILTER_OBSERVED:
    'postTerminalFeasibilityFilterObserved',
  POST_TERMINAL_FEASIBILITY_REJECTED_REASON_CODES:
    'postTerminalFeasibilityRejectedReasonCodes',
  POST_TERMINAL_FEASIBLE_CANDIDATE_COUNT:
    'postTerminalFeasibleCandidateCount',
  POST_TERMINAL_BLOCKED_READINESS_GROUP_COUNT:
    'postTerminalBlockedReadinessGroupCount',
  AVAILABILITY: 'availability',
  FOLLOW_UP_STATE: 'followUpState',
  OPERATION_ID: 'operationId',
  POST_TERMINAL_EXECUTABLE_MOVE_COUNT: 'postTerminalExecutableMoveCount',
  POST_TERMINAL_LIMITED_MOVE_COUNT: 'postTerminalLimitedMoveCount',
  POST_TERMINAL_LEADERSHIP_LOSS_OBSERVED:
    'postTerminalLeadershipLossObserved',
  POST_TERMINAL_LEADERSHIP_LOSS_TIME_MS:
    'postTerminalLeadershipLossTimeMs',
  POST_TERMINAL_MOVE_LIMIT: 'postTerminalMoveLimit',
  POST_TERMINAL_MOVE_LIMIT_EVIDENCE_STATE:
    'postTerminalMoveLimitEvidenceState',
  PARTITION_ID: 'partitionId',
  POST_TERMINAL_PRE_EXECUTE_RETURN_STATE:
    'postTerminalPreExecuteReturnState',
  POST_TERMINAL_PRE_EXECUTE_SKIP_REASONS:
    'postTerminalPreExecuteSkipReasons',
  POST_TERMINAL_PRE_EXECUTE_SKIPPED_MOVE_COUNT:
    'postTerminalPreExecuteSkippedMoveCount',
  POST_TERMINAL_PRE_EXECUTION_HANDOFF_OBSERVED:
    'postTerminalPreExecutionHandoffObserved',
  POST_TERMINAL_PRE_EXECUTION_HANDOFF_STATE:
    'postTerminalPreExecutionHandoffState',
  POST_TERMINAL_PRE_EXECUTION_HANDOFF_TIME_MS:
    'postTerminalPreExecutionHandoffTimeMs',
  POST_TERMINAL_READINESS_GROUP_COUNT: 'postTerminalReadinessGroupCount',
  POST_TERMINAL_READINESS_GROUPS: 'postTerminalReadinessGroups',
  POST_TERMINAL_READY_READINESS_GROUP_COUNT:
    'postTerminalReadyReadinessGroupCount',
  POST_TERMINAL_REJECTED_CANDIDATE_COUNT:
    'postTerminalRejectedCandidateCount',
  POST_TERMINAL_REBALANCE_MOVE_COUNT: 'postTerminalRebalanceMoveCount',
  POST_TERMINAL_REBALANCE_OBSERVED: 'postTerminalRebalanceObserved',
  POST_TERMINAL_REBALANCE_TIME_MS: 'postTerminalRebalanceTimeMs',
  POST_TERMINAL_SCHEDULER_HANDOFF_OBSERVED:
    'postTerminalSchedulerHandoffObserved',
  POST_TERMINAL_SCHEDULER_HANDOFF_TIME_MS:
    'postTerminalSchedulerHandoffTimeMs',
  POST_TERMINAL_SIBLING_LEADERSHIP_LOSS_OBSERVED:
    'postTerminalSiblingLeadershipLossObserved',
  POST_TERMINAL_SIBLING_LEADERSHIP_LOSS_TIME_MS:
    'postTerminalSiblingLeadershipLossTimeMs',
  POST_TERMINAL_FOLLOW_UP_EXECUTION_STATE:
    'postTerminalFollowUpExecutionState',
  POST_TERMINAL_MOVE_BLOCKED_OBSERVED: 'postTerminalMoveBlockedObserved',
  POST_TERMINAL_MOVE_BLOCKED_REASON: 'postTerminalMoveBlockedReason',
  POST_TERMINAL_MOVE_EXECUTION_OBSERVED: 'postTerminalMoveExecutionObserved',
  POST_TERMINAL_MOVE_EXECUTION_TIME_MS: 'postTerminalMoveExecutionTimeMs',
  POST_TERMINAL_PERSISTED_OPERATION_CREATED_AT_MS:
    'postTerminalPersistedOperationCreatedAtMs',
  POST_TERMINAL_PERSISTED_OPERATION_ID: 'postTerminalPersistedOperationId',
  POST_TERMINAL_PERSISTED_OPERATION_OBSERVED:
    'postTerminalPersistedOperationObserved',
  POST_TERMINAL_SUPPRESSION_OBSERVED: 'postTerminalSuppressionObserved',
  POST_TERMINAL_SUPPRESSION_REASON: 'postTerminalSuppressionReason',
  RETAINED_BY_WITNESS: 'retainedByWitness',
  RETAINED_NEXT_REQUIRED_ACTION: 'retainedNextRequiredAction',
  TERMINAL_FAILURE_OBSERVED: 'terminalFailureObserved',
  TERMINAL_FAILURE_TIME_MS: 'terminalFailureTimeMs',
});
const PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD = Object.freeze({
  BLOCKED_PARTITION_IDS_MATCH: 'blockedPartitionIdsMatch',
  CLOSURE_RECORD_ID: 'closureRecordId',
  CLOSURE_WITNESS_CLASS: 'closureWitnessClass',
  CLOSURE_WITNESS_CLASSIFICATION: 'closureWitnessClassification',
  CLOSURE_WITNESS_PUBLICATION_REFRESH_REQUIRED:
    'closureWitnessPublicationRefreshRequired',
  CLOSURE_WITNESS_STATE: 'closureWitnessState',
  DRIFT_CLASSIFICATION: 'driftClassification',
  DURABLE_BLOCKED_PARTITION_IDS: 'durableBlockedPartitionIds',
  DURABLE_SATISFIED: 'durableSatisfied',
  REPLAYED_BLOCKED_PARTITION_IDS: 'replayedBlockedPartitionIds',
  REPLAYED_SATISFIED: 'replayedSatisfied',
  SUMMARY_CHANGED: 'summaryChanged',
});
const PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION = Object.freeze(
  {
    ABSENT: 'absent',
    OTHER: 'other',
    PENDING: 'pending',
    REFRESH_REQUIRED: 'refresh_required',
    SATISFIED_FRESH: 'satisfied_fresh',
  },
);
const PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD = Object.freeze({
  BLOCKED_PARTITION_IDS: 'blockedPartitionIds',
  CLOSURE_RECORD_ID: 'closureRecordId',
  CLOSURE_WITNESS_CLASS: 'closureWitnessClass',
  PRIORITY_SPREAD_PENDING: 'prioritySpreadPending',
  PUBLICATION_REFRESH_REQUIRED: 'publicationRefreshRequired',
  STATE: 'state',
});
const PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION = Object.freeze({
  ALIGNED: 'aligned',
  CHANGED: 'changed',
  DURABLE_STALE_REPLAYED_SATISFIED: 'durable_stale_replayed_satisfied',
  REPLAYED_BLOCKED: 'replayed_blocked',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE = Object.freeze({
  MISSING: 'missing',
  REPAIR_DEFERRED: 'repair_deferred',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE = Object.freeze({
  MISSING: 'missing',
  RECONSTRUCTED_OWNER_RPC_CACHE_REPAIR: 'reconstructed_owner_rpc_cache_repair',
  RETAINED_AND_RECONSTRUCTED:
    'retained_selected_snapshot_and_reconstructed_owner_rpc',
  RETAINED_SELECTED_SNAPSHOT_OBSERVATION:
    'retained_selected_snapshot_observation',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE = Object.freeze({
  ENQUEUED: 'enqueued',
  MISSING: 'missing',
  RETAINED: 'retained',
  SUPPRESSED: 'suppressed',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE =
  Object.freeze({
    BLOCKED_DURING_MOVE_EXECUTION: 'blocked_during_move_execution',
    EXECUTED_WITHOUT_PERSISTED_OPERATION: 'executed_without_persisted_operation',
    MISSING: 'missing',
    NOT_EXECUTED_AFTER_ENQUEUE: 'not_executed_after_enqueue',
    PERSISTED_NEW_OPERATION: 'persisted_new_operation',
  });
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE = Object.freeze({
  BUDGET_BLOCKED: 'budget_blocked',
  LIMITED_MOVES_AVAILABLE: 'limited_moves_available',
  MISSING: 'missing',
  PLANNED_MOVE_COUNT_AVAILABLE: 'planned_move_count_available',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE = Object.freeze({
  ADMISSION_DENIED: 'admission_denied',
  BUDGET_BLOCKED: 'budget_blocked',
  MOVE_BLOCKED: 'move_blocked',
  MOVE_EXECUTED: 'move_executed',
  NEW_OPERATION_PERSISTED: 'new_operation_persisted',
  SAME_PARTITION_LEADERSHIP_LOST: 'same_partition_leadership_lost',
  STARTED_WITH_PRE_EXECUTION_GAP: 'started_with_pre_execution_gap',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_RULES = Object.freeze([
  Object.freeze({
    evidenceState:
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE
        .RETAINED_AND_RECONSTRUCTED,
    matches: (evidence) =>
      evidence.hasRetainedObservation === true &&
      evidence.hasReconstructedOwnerRpc === true,
  }),
  Object.freeze({
    evidenceState:
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE
        .RETAINED_SELECTED_SNAPSHOT_OBSERVATION,
    matches: (evidence) => evidence.hasRetainedObservation === true,
  }),
  Object.freeze({
    evidenceState:
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE
        .RECONSTRUCTED_OWNER_RPC_CACHE_REPAIR,
    matches: (evidence) => evidence.hasReconstructedOwnerRpc === true,
  }),
  Object.freeze({
    evidenceState:
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE.MISSING,
    matches: () => true,
  }),
]);
const PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD = Object.freeze({
  CLOSURE_RECORD_ID: 'closureRecordId',
  CLOSURE_WITNESS_CLASS: 'closureWitnessClass',
  EPOCH: 'epoch',
  PRIORITY_SPREAD_PENDING: 'prioritySpreadPending',
  STATUS: 'status',
  SUMMARY: 'summary',
});
const PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD = Object.freeze({
  CLOSURE_WITNESS: 'closureWitness',
  EPOCH: 'epoch',
  PRIORITY_RECOVERY_REASON_CODES: 'priorityRecoveryReasonCodes',
  RECOVERY_PROTOCOL_STATE: 'recoveryProtocolState',
  STATUS: 'status',
  SUMMARY: 'summary',
});
const PUBLICATION_EVIDENCE_REPLAY_ERROR_MESSAGE = Object.freeze({
  REPORT_DIR_REQUIRED: 'report directory is required',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG = Object.freeze({
  AUTHORITATIVE_DISCOVERY_REPAIR_FAILED:
    'Authoritative discovery cache repair failed',
  CONTROL_PLANE_BACKPRESSURE: 'control_plane_backpressure',
  JSON_END: '}',
  JSON_START: '{',
  NODES_TABLE: 'nodes',
  OWNER_RPC_LANE: 'owner_rpc_lane',
});
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD = Object.freeze({
  CAUSE_CHAIN: 'causeChain',
  FAILED_TABLES: 'failedTables',
  FAILURE_CLASS: 'failureClass',
  MSG: 'msg',
  NODE_ID: 'nodeId',
  READ_SOURCE: 'readSource',
  RETRY_AFTER_MS: 'retryAfterMs',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD = Object.freeze({
  ADD_LIKE_MOVE_COUNT: 'addLikeMoveCount',
  BLOCKED_READINESS_GROUP_COUNT: 'blockedReadinessGroupCount',
  DECISION: 'decision',
  ENTITY_ID: 'entityId',
  ERROR: 'error',
  ERROR_MESSAGE: 'errorMessage',
  EXECUTABLE_MOVE_COUNT: 'executableMoveCount',
  FEASIBLE_COUNT: 'feasibleCount',
  HAS_COORDINATOR: 'hasCoordinator',
  LIMITED_MOVE_COUNT: 'limitedMoveCount',
  MOVE_COUNT: 'moveCount',
  MOVE_LIMIT: 'moveLimit',
  MOVE_TYPE: 'moveType',
  MSG: 'msg',
  NODE_ID: 'nodeId',
  OPERATION_ID: 'operationId',
  OTHER_MOVE_COUNT: 'otherMoveCount',
  PARTITION_ID: 'partitionId',
  PLANNED_MOVE_COUNT: 'plannedMoveCount',
  PRE_EXECUTE_RETURN_STATE: 'preExecuteReturnState',
  PRE_EXECUTE_SKIP_REASONS: 'preExecuteSkipReasons',
  PRE_EXECUTE_SKIPPED_MOVE_COUNT: 'preExecuteSkippedMoveCount',
  PRE_EXECUTION_HANDOFF_STATE: 'preExecutionHandoffState',
  QUERY_DURATION_MS: 'queryDurationMs',
  READINESS_GROUP_COUNT: 'readinessGroupCount',
  READINESS_GROUPS: 'readinessGroups',
  READINESS_STATE: 'readinessState',
  READY_READINESS_GROUP_COUNT: 'readyReadinessGroupCount',
  REASON: 'reason',
  REPLICA_ID: 'replicaId',
  REJECTED_COUNT: 'rejectedCount',
  REJECTIONS_BY_REASON: 'rejectionsByReason',
  REMOVE_MOVE_COUNT: 'removeMoveCount',
  ROW_COUNT: 'rowCount',
  SKIP_DETAIL: 'skipDetail',
  TARGET_NODE_ID: 'targetNodeId',
  TIME: 'time',
  TOTAL_CANDIDATES: 'totalCandidates',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG = Object.freeze({
  CONTROL_PLANE_PRESSURE_QUERY:
    'In-flight operation owner query indicates control-plane pressure',
});
const PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD = Object.freeze({
  CREATED_AT: 'createdAt',
  CREATED_AT_SNAKE: 'created_at',
  OPERATION_ID: 'operationId',
  OPERATION_ID_SNAKE: 'operation_id',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  STATUS: 'status',
  UPDATED_AT: 'updatedAt',
  UPDATED_AT_SNAKE: 'updated_at',
  WORKFLOW_STEP: 'workflowStep',
  WORKFLOW_STEP_SNAKE: 'workflow_step',
});
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_SUPPRESSION_MESSAGES = Object.freeze([
  REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED,
  REBALANCER_LOG_MSG.MOVE_SKIPPED,
  REBALANCER_LOG_MSG.SKIP_UNREADY_NODE,
  REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY,
]);
const PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_BLOCKED_MESSAGES =
  Object.freeze([
    REBALANCER_LOG_MSG.MOVE_FAILED,
    REBALANCER_LOG_MSG.MOVE_SKIPPED,
    REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY,
    REBALANCER_LOG_MSG.SKIP_UNREADY_NODE,
    REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY,
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY,
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DEFERRED_BY_SAFETY_POLICY,
    REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED,
    REBALANCE_COORDINATOR_LOG_MSG.PROVISIONING_ADMISSION_DENIED,
  ]);
const PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_RULES = Object.freeze([
  Object.freeze({
    matches: (evidence) =>
      evidence.message ===
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG
        .AUTHORITATIVE_DISCOVERY_REPAIR_FAILED,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.readSource ===
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.OWNER_RPC_LANE,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.failedTableNames.includes(
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.NODES_TABLE,
      ),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.causeChain.includes(
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.CONTROL_PLANE_BACKPRESSURE,
      ),
  }),
]);

export {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
  PUBLICATION_EVIDENCE_REPLAY_ENCODING,
  PUBLICATION_EVIDENCE_REPLAY_ERROR_MESSAGE,
  PUBLICATION_EVIDENCE_REPLAY_EXIT_CODE,
  PUBLICATION_EVIDENCE_REPLAY_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_FILE,
  PUBLICATION_EVIDENCE_REPLAY_JSON_INDENT,
  PUBLICATION_EVIDENCE_REPLAY_JSON_REPLACER,
  PUBLICATION_EVIDENCE_REPLAY_LINE,
  PUBLICATION_EVIDENCE_REPLAY_NEWLINE,
  PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_BLOCKED_MESSAGES,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_SUPPRESSION_MESSAGES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_RULES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_RULES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_SOURCE,
};
