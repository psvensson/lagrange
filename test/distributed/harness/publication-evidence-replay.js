import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveMembershipPublicationCandidate} from
  '../../../src/control-plane/membership-publication-coordinator.js';
import {
  buildPriorityRecoveryClosureWitness,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from
  '../../../src/control-plane/priority-recovery-snapshot.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
} from
  '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_CAPACITY_LOG_MSG,
} from '../../../src/rebalancer/storage-capacity-constants.js';
import {NUM, TYPEOF} from '../../../src/constants/index.js';

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
  AVAILABILITY: 'availability',
  FOLLOW_UP_STATE: 'followUpState',
  OPERATION_ID: 'operationId',
  POST_TERMINAL_LEADERSHIP_LOSS_OBSERVED:
    'postTerminalLeadershipLossObserved',
  POST_TERMINAL_LEADERSHIP_LOSS_TIME_MS:
    'postTerminalLeadershipLossTimeMs',
  POST_TERMINAL_MOVE_LIMIT_EVIDENCE_STATE:
    'postTerminalMoveLimitEvidenceState',
  PARTITION_ID: 'partitionId',
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
  DECISION: 'decision',
  ENTITY_ID: 'entityId',
  ERROR: 'error',
  ERROR_MESSAGE: 'errorMessage',
  FEASIBLE_COUNT: 'feasibleCount',
  HAS_COORDINATOR: 'hasCoordinator',
  MOVE_COUNT: 'moveCount',
  MOVE_TYPE: 'moveType',
  MSG: 'msg',
  NODE_ID: 'nodeId',
  OPERATION_ID: 'operationId',
  PARTITION_ID: 'partitionId',
  QUERY_DURATION_MS: 'queryDurationMs',
  REASON: 'reason',
  REPLICA_ID: 'replicaId',
  REJECTED_COUNT: 'rejectedCount',
  REJECTIONS_BY_REASON: 'rejectionsByReason',
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

function isRecord(value) {
  return Boolean(value) && typeof value === TYPEOF.OBJECT && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === TYPEOF.STRING ?
    value.trim() :
    PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
}

function normalizeScalarText(value) {
  if (typeof value === TYPEOF.STRING) {
    return normalizeText(value);
  }
  if (typeof value === TYPEOF.NUMBER && Number.isFinite(value)) {
    return String(value);
  }
  return PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
}

function normalizeInteger(value, fallback = NUM.ZERO) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.trunc(normalized) : fallback;
}

function normalizeTimestampMs(value, fallback = NUM.ZERO) {
  const normalizedTime = Date.parse(normalizeText(value));
  return Number.isFinite(normalizedTime) ? normalizedTime : fallback;
}

function normalizeList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeScalarText(value))
      .filter((value) => value.length > NUM.ZERO),
  )].sort((left, right) => left.localeCompare(right));
}

function normalizeRecordKeyList(value = {}) {
  return normalizeList(isRecord(value) ? Object.keys(value) : []);
}

function readArrayField(record, ...fieldNames) {
  if (!isRecord(record)) {
    return [];
  }
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readRecordField(record, ...fieldNames) {
  if (!isRecord(record)) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (isRecord(value)) {
      return {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
        value,
      };
    }
  }
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    value: {},
  };
}

function readFirstRecord(...values) {
  for (const value of values) {
    if (isRecord(value)) {
      return {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
        value,
      };
    }
  }
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    value: {},
  };
}

function readFirstAvailableRecord(...recordStates) {
  for (const recordState of recordStates) {
    if (recordState?.availability === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE) {
      return recordState;
    }
  }
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    value: {},
  };
}

function readSelectedSnapshotObservationFromFailureBundle(failureBundle = {}) {
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  const coverageState = readRecordField(
    controlPlaneState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  );
  const coverage = coverageState.value;
  return {
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.AVAILABILITY]:
      coverageState.availability,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_ADMIN_READY]:
      coverage[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_ADMIN_READY
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_ADMIN_READY]:
      coverage[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_ADMIN_READY
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_REACHABLE_BY]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_REACHABLE_BY
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_REACHABLE_BY]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_REACHABLE_BY
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_REACHABILITY_ERROR]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_REACHABILITY_ERROR
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_OBSERVATION_MODE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_MODE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_OBSERVATION_STATE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_STATE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_REFRESH_STATE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_REFRESH_STATE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES]:
      normalizeList(
        readArrayField(
          coverage,
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_REPAIR_DEFERRED]:
      coverage[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
          .SELECTED_SNAPSHOT_REPAIR_DEFERRED
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.EXPECTED_NODE_COUNT]:
      normalizeInteger(
        coverage[PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.EXPECTED_NODE_COUNT],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.BEST_COVERAGE_NODE_COUNT]:
      normalizeInteger(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.BEST_COVERAGE_NODE_COUNT
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_PUBLISHED_ACTIVE_NODE_IDS]:
      normalizeList(
        readArrayField(
          coverage,
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_PUBLISHED_ACTIVE_NODE_IDS,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_MISSING_PUBLISHED_NODE_IDS]:
      normalizeList(
        readArrayField(
          coverage,
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_MISSING_PUBLISHED_NODE_IDS,
        ),
      ),
  };
}

function parseRepairLogRecordFromLine(line) {
  const normalizedLine = normalizeText(line);
  const jsonStartIndex = normalizedLine.indexOf(
    PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.JSON_START,
  );
  const jsonEndIndex = normalizedLine.lastIndexOf(
    PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.JSON_END,
  );
  if (jsonStartIndex < NUM.ZERO || jsonEndIndex <= jsonStartIndex) {
    return {};
  }
  try {
    const parsed = JSON.parse(normalizedLine.slice(jsonStartIndex, jsonEndIndex + NUM.ONE));
    return isRecord(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function readFailureBundleLogExcerptLines(failureBundle = {}) {
  const logsState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.LOGS,
  );
  const excerptsByNodeState = readRecordField(
    logsState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.EXCERPTS_BY_NODE_ID,
  );
  return Object.values(excerptsByNodeState.value)
    .flatMap((lines) => Array.isArray(lines) ? lines : [])
    .filter((line) => typeof line === TYPEOF.STRING);
}

function normalizeRepairLogEvidence(record = {}) {
  return {
    message: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.MSG],
    ),
    nodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.NODE_ID],
    ),
    readSource: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.READ_SOURCE],
    ),
    failedTableNames: normalizeList(
      readArrayField(
        record,
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.FAILED_TABLES,
      ),
    ),
    causeChain: normalizeList(
      readArrayField(
        record,
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.CAUSE_CHAIN,
      ),
    ),
    failureClass: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.FAILURE_CLASS],
    ),
    retryAfterMs: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.RETRY_AFTER_MS],
    ),
  };
}

function isOwnerRpcCacheRepairDeferral(evidence = {}) {
  return PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_RULES.every((rule) =>
    rule.matches(evidence),
  );
}

function maxRetryAfterMs(evidenceRecords = []) {
  return evidenceRecords.reduce(
    (maxRetryAfter, evidence) => Math.max(maxRetryAfter, evidence.retryAfterMs),
    NUM.ZERO,
  );
}

function summarizeOwnerRpcCacheRepairDeferrals({
  failureBundle = {},
  selectedSnapshotNodeId = PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
} = {}) {
  const repairDeferrals = readFailureBundleLogExcerptLines(failureBundle)
    .map(parseRepairLogRecordFromLine)
    .filter(isRecord)
    .map(normalizeRepairLogEvidence)
    .filter(isOwnerRpcCacheRepairDeferral);
  const selectedNodeId = normalizeText(selectedSnapshotNodeId);
  const selectedWitnessDeferrals = repairDeferrals.filter((evidence) =>
    evidence.nodeId === selectedNodeId,
  );
  const matchingDeferralCount = repairDeferrals.length;
  return {
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.AVAILABILITY]:
      matchingDeferralCount > NUM.ZERO ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.DEFERRAL_STATE]:
      matchingDeferralCount > NUM.ZERO ?
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.REPAIR_DEFERRED :
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_NODE_ID]:
      selectedNodeId,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.MATCHING_DEFERRAL_COUNT]:
      matchingDeferralCount,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_DEFERRAL_COUNT]:
      selectedWitnessDeferrals.length,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.LATEST_RETRY_AFTER_MS]:
      maxRetryAfterMs(repairDeferrals),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD
      .SELECTED_WITNESS_LATEST_RETRY_AFTER_MS]:
      maxRetryAfterMs(selectedWitnessDeferrals),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.NODE_IDS]:
      normalizeList(repairDeferrals.map((evidence) => evidence.nodeId)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.FAILED_TABLE_NAMES]:
      normalizeList(repairDeferrals.flatMap((evidence) => evidence.failedTableNames)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.CAUSE_CHAIN]:
      normalizeList(repairDeferrals.flatMap((evidence) => evidence.causeChain)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.READ_SOURCES]:
      normalizeList(repairDeferrals.map((evidence) => evidence.readSource)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.FAILURE_CLASSES]:
      normalizeList(repairDeferrals.map((evidence) => evidence.failureClass)),
  };
}

function hasRetainedSelectedSnapshotRepairEvidence(
  selectedSnapshotObservation = {},
) {
  return (
    selectedSnapshotObservation[
      PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.AVAILABILITY
    ] === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE &&
    (
      selectedSnapshotObservation[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
          .SELECTED_SNAPSHOT_REPAIR_DEFERRED
      ] === true ||
      selectedSnapshotObservation[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
          .SELECTED_SNAPSHOT_OBSERVATION_MODE
      ] ===
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.REPAIR_DEFERRED
    )
  );
}

function hasReconstructedOwnerRpcRepairEvidence(ownerRpcCacheRepair = {}) {
  return (
    ownerRpcCacheRepair[
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.AVAILABILITY
    ] === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE &&
    ownerRpcCacheRepair[
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.DEFERRAL_STATE
    ] === PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.REPAIR_DEFERRED &&
    normalizeInteger(
      ownerRpcCacheRepair[
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_DEFERRAL_COUNT
      ],
    ) > NUM.ZERO
  );
}

function resolveSelectedSnapshotRepairEvidenceRecoveryState(evidence = {}) {
  return PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_RULES
    .find((rule) => rule.matches(evidence))
    .evidenceState;
}

function summarizeSelectedSnapshotRepairEvidenceRecovery({
  selectedSnapshotObservation = {},
  ownerRpcCacheRepair = {},
} = {}) {
  const hasRetainedObservation =
    hasRetainedSelectedSnapshotRepairEvidence(selectedSnapshotObservation);
  const hasReconstructedOwnerRpc =
    hasReconstructedOwnerRpcRepairEvidence(ownerRpcCacheRepair);
  const evidenceState = resolveSelectedSnapshotRepairEvidenceRecoveryState({
    hasRetainedObservation,
    hasReconstructedOwnerRpc,
  });
  const selectedObservationNodeId = normalizeText(
    selectedSnapshotObservation[
      PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID
    ],
  );
  const selectedRepairNodeId = normalizeText(
    ownerRpcCacheRepair[
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_NODE_ID
    ],
  );
  return {
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.AVAILABILITY]:
      evidenceState ===
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE.MISSING ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.EVIDENCE_STATE]:
      evidenceState,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.SELECTED_WITNESS_NODE_ID]:
      selectedObservationNodeId || selectedRepairNodeId,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RETAINED_OBSERVATION_AVAILABILITY]:
      hasRetainedObservation ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RECONSTRUCTED_OWNER_RPC_AVAILABILITY]:
      hasReconstructedOwnerRpc ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RETAINED_OBSERVATION_DEFERRAL_STATE]:
      hasRetainedObservation ?
        normalizeText(
          selectedSnapshotObservation[
            PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
              .SELECTED_SNAPSHOT_OBSERVATION_MODE
          ],
        ) :
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RECONSTRUCTED_OWNER_RPC_DEFERRAL_STATE]:
      normalizeText(
        ownerRpcCacheRepair[
          PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.DEFERRAL_STATE
        ],
      ) || PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.RETAINED_OBSERVATION_STATE]:
      hasRetainedObservation ?
        normalizeText(
          selectedSnapshotObservation[
            PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
              .SELECTED_SNAPSHOT_OBSERVATION_STATE
          ],
        ) :
        PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RETAINED_OBSERVATION_REASON_CODES]:
      hasRetainedObservation ?
        normalizeList(
          selectedSnapshotObservation[
            PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
              .SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES
          ],
        ) :
        [],
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RECONSTRUCTED_FAILED_TABLE_NAMES]:
      hasReconstructedOwnerRpc ?
        normalizeList(
          ownerRpcCacheRepair[
            PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.FAILED_TABLE_NAMES
          ],
        ) :
        [],
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.RECONSTRUCTED_READ_SOURCES]:
      hasReconstructedOwnerRpc ?
        normalizeList(
          ownerRpcCacheRepair[
            PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.READ_SOURCES
          ],
        ) :
        [],
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.RECONSTRUCTED_CAUSE_CHAIN]:
      hasReconstructedOwnerRpc ?
        normalizeList(
          ownerRpcCacheRepair[
            PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.CAUSE_CHAIN
          ],
        ) :
        [],
  };
}

function readPriorityRecoveryWitnessCandidates(failureBundle = {}) {
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  const observationState = readRecordField(
    controlPlaneState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_RECOVERY_OBSERVATION,
  );
  return readArrayField(
    observationState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PARTITION_WITNESSES,
  ).filter(isRecord);
}

function appendPriorityWitnessIntegerField(target, fieldName, value) {
  const normalizedValue = Number(value);
  if (Number.isFinite(normalizedValue)) {
    target[fieldName] = Math.trunc(normalizedValue);
  }
  return target;
}

function buildMissingPriorityRecoveryWitness() {
  return {
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.AVAILABILITY]:
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SEMANTIC_STATE_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CORRELATION_KEY]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CURRENT_OWNER]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.BLOCKING_BOUNDARY]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WAIT_MODE]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.ACTUATION_STATE]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WORKFLOW_PROGRESS_PHASE_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
      .LATEST_OPERATION_WORKFLOW_STEP]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.LATEST_OPERATION_STATUS]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PROGRESS_CLASS_IDS]:
      [],
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_OPERATION_IDS]:
      [],
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_PARTITION_IDS]:
      [],
  };
}

function summarizePriorityRecoveryWitness(witnessCandidate) {
  const witness = isRecord(witnessCandidate) ? witnessCandidate : {};
  const operationId = normalizeList(witness.operationIds)[NUM.ZERO] ||
    PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
  const summary = {
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.AVAILABILITY]:
      isRecord(witnessCandidate) ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID]:
      normalizeText(witness.partitionId),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SEMANTIC_STATE_ID]:
      normalizeText(witness.semanticStateId),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID]:
      operationId,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CORRELATION_KEY]:
      normalizeText(witness.correlationKey),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CURRENT_OWNER]:
      normalizeText(witness.currentOwner),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.BLOCKING_BOUNDARY]:
      normalizeText(witness.blockingBoundary),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WAIT_MODE]:
      normalizeText(witness.waitMode),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION]:
      normalizeText(witness.nextRequiredAction),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.ACTUATION_STATE]:
      normalizeText(witness.actuationState),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WORKFLOW_PROGRESS_PHASE_ID]:
      normalizeText(witness.workflowProgressPhaseId),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
      .LATEST_OPERATION_WORKFLOW_STEP]:
      normalizeText(witness.latestOperationWorkflowStep),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.LATEST_OPERATION_STATUS]:
      normalizeText(witness.latestOperationStatus),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PROGRESS_CLASS_IDS]:
      normalizeList(
        readArrayField(
          witness,
          PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PROGRESS_CLASS_IDS,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_OPERATION_IDS]:
      normalizeList(
        readArrayField(
          witness,
          PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
            .SERIAL_WAIT_OPERATION_IDS,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_PARTITION_IDS]:
      normalizeList(
        readArrayField(
          witness,
          PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
            .SERIAL_WAIT_PARTITION_IDS,
        ),
      ),
  };
  appendPriorityWitnessIntegerField(
    summary,
    PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.STEP_AGE_MS,
    witness.stepAgeMs,
  );
  appendPriorityWitnessIntegerField(
    summary,
    PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.STEP_TIMEOUT_MS,
    witness.stepTimeoutMs,
  );
  return summary;
}

function summarizePriorityRecoveryWitnesses(failureBundle = {}) {
  return readPriorityRecoveryWitnessCandidates(failureBundle)
    .map((witnessCandidate) =>
      summarizePriorityRecoveryWitness(witnessCandidate),
    );
}

function selectSupportingPriorityRecoveryWitness(priorityRecoveryWitnesses = []) {
  return priorityRecoveryWitnesses.length > NUM.ZERO ?
    priorityRecoveryWitnesses[NUM.ZERO] :
    buildMissingPriorityRecoveryWitness();
}

function selectRebalancerFollowUpWitness(priorityRecoveryWitnesses = []) {
  return priorityRecoveryWitnesses.find((witness) =>
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION
    ] === PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE &&
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.ACTUATION_STATE
    ] === PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED &&
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID
    ].length > NUM.ZERO,
  ) || buildMissingPriorityRecoveryWitness();
}

function normalizeRebalancerHandoffLogEvidence(record = {}) {
  return {
    message: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MSG],
    ),
    nodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.NODE_ID],
    ),
    entityId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ENTITY_ID],
    ),
    partitionId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.PARTITION_ID],
    ),
    operationId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.OPERATION_ID],
    ),
    replicaId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REPLICA_ID],
    ),
    moveType: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MOVE_TYPE],
    ),
    reason: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REASON],
    ),
    decision: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.DECISION],
    ),
    error: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ERROR],
    ),
    errorMessage: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ERROR_MESSAGE],
    ),
    skipDetail: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.SKIP_DETAIL],
    ),
    timeMs: normalizeTimestampMs(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.TIME],
    ),
    moveCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MOVE_COUNT],
    ),
    totalCandidates: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.TOTAL_CANDIDATES
      ],
    ),
    feasibleCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.FEASIBLE_COUNT],
    ),
    rejectedCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REJECTED_COUNT],
    ),
    rejectionReasonCodes: normalizeRecordKeyList(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REJECTIONS_BY_REASON
      ],
    ),
    targetNodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.TARGET_NODE_ID],
    ),
    queryDurationMs: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.QUERY_DURATION_MS
      ],
    ),
    rowCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ROW_COUNT],
    ),
    hasCoordinator:
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.HAS_COORDINATOR] ===
      true,
  };
}

function selectLatestRebalancerHandoffLog(records = []) {
  return records.reduce(
    (selected, record) => record.timeMs >= selected.timeMs ? record : selected,
    Object.freeze({
      message: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      nodeId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      entityId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      partitionId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      operationId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      replicaId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      moveType: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      reason: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      decision: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      error: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      errorMessage: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      skipDetail: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      timeMs: NUM.ZERO,
      moveCount: NUM.ZERO,
      totalCandidates: NUM.ZERO,
      feasibleCount: NUM.ZERO,
      rejectedCount: NUM.ZERO,
      rejectionReasonCodes: Object.freeze([]),
      targetNodeId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      queryDurationMs: NUM.ZERO,
      rowCount: NUM.ZERO,
      hasCoordinator: false,
    }),
  );
}

function readRebalancerHandoffLogEvidence(failureBundle = {}, logLines = []) {
  return [
    ...new Set([
      ...readFailureBundleLogExcerptLines(failureBundle),
      ...(Array.isArray(logLines) ? logLines : []),
    ]),
  ]
    .map(parseRepairLogRecordFromLine)
    .filter(isRecord)
    .map(normalizeRebalancerHandoffLogEvidence);
}

function normalizeReplicaOperationRow(row = {}) {
  return {
    operationId: normalizeText(
      row[
        PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.OPERATION_ID
      ] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .OPERATION_ID_SNAKE
        ],
    ),
    partitionId: normalizeText(
      row[
        PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.PARTITION_ID
      ] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .PARTITION_ID_SNAKE
        ],
    ),
    status: normalizeText(
      row[PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.STATUS],
    ),
    workflowStep: normalizeText(
      row[
        PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.WORKFLOW_STEP
      ] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .WORKFLOW_STEP_SNAKE
        ],
    ),
    createdAtMs: normalizeInteger(
      row[PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.CREATED_AT] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .CREATED_AT_SNAKE
        ],
    ),
    updatedAtMs: normalizeInteger(
      row[PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.UPDATED_AT] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .UPDATED_AT_SNAKE
        ],
    ),
  };
}

function readReplicaOperationRowsFromSnapshotStates(snapshotStates = []) {
  return snapshotStates
    .filter((snapshotState) =>
      snapshotState?.availability ===
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    )
    .map((snapshotState) => snapshotState.value)
    .filter(isRecord)
    .flatMap((snapshot) => [
      ...readArrayField(
        snapshot,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.REPLICA_OPERATIONS,
      ),
      ...readArrayField(
        snapshot,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.REPLICA_OPERATIONS_SNAKE,
      ),
    ])
    .map((row) => normalizeReplicaOperationRow(row))
    .filter((row) => row.operationId.length > NUM.ZERO);
}

function selectLatestReplicaOperationRow(rows = []) {
  return rows.reduce(
    (selected, row) => {
      const rowTime = Math.max(row.createdAtMs, row.updatedAtMs);
      const selectedTime = Math.max(selected.createdAtMs, selected.updatedAtMs);
      return rowTime >= selectedTime ? row : selected;
    },
    Object.freeze({
      operationId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      partitionId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      status: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      workflowStep: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      createdAtMs: NUM.ZERO,
      updatedAtMs: NUM.ZERO,
    }),
  );
}

function isTerminalOperationFailureLog(evidence, witness) {
  return (
    evidence.message === REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED &&
    evidence.operationId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID] &&
    evidence.partitionId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID]
  );
}

function isPostTerminalRebalanceStartLog(evidence, witness, terminalFailure) {
  return (
    evidence.message === REBALANCER_LOG_MSG.START_REBALANCE &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > terminalFailure.timeMs &&
    evidence.moveCount > NUM.ZERO
  );
}

function isPostTerminalMoveExecutionLog(evidence, witness, postTerminalRebalance) {
  return (
    evidence.message === REBALANCER_LOG_MSG.EXECUTE_MOVE &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalMoveBlockedLog(evidence, witness, postTerminalRebalance) {
  const partitionId =
    witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID];
  return (
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_BLOCKED_MESSAGES.includes(
      evidence.message,
    ) &&
    (evidence.entityId === partitionId || evidence.partitionId === partitionId) &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalFeasibilityFilterLog(
  evidence,
  witness,
  terminalFailure,
  postTerminalRebalance,
) {
  return (
    evidence.message === STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > terminalFailure.timeMs &&
    evidence.timeMs <= postTerminalRebalance.timeMs
  );
}

function isPrecedingCapacityFeasibilityFilterLog(
  evidence,
  postTerminalFeasibilityFilter,
) {
  return (
    evidence.message === STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED &&
    evidence.nodeId === postTerminalFeasibilityFilter.nodeId &&
    evidence.timeMs < postTerminalFeasibilityFilter.timeMs
  );
}

function selectRebalancerAdmissionBatchStartTimeMs(
  logEvidence = [],
  postTerminalFeasibilityFilter = {},
) {
  return selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPrecedingCapacityFeasibilityFilterLog(
        evidence,
        postTerminalFeasibilityFilter,
      ),
    ),
  ).timeMs;
}

function isPostTerminalAdmissionLog(
  evidence,
  terminalFailure,
  postTerminalFeasibilityFilter,
  admissionBatchStartTimeMs,
  message,
) {
  const admissionWindowStartTimeMs = Math.max(
    terminalFailure.timeMs,
    admissionBatchStartTimeMs,
  );
  return (
    postTerminalFeasibilityFilter.timeMs > NUM.ZERO &&
    evidence.message === message &&
    evidence.nodeId === postTerminalFeasibilityFilter.nodeId &&
    evidence.timeMs > admissionWindowStartTimeMs &&
    evidence.timeMs <= postTerminalFeasibilityFilter.timeMs
  );
}

function isPostTerminalBudgetPressureLog(evidence, postTerminalRebalance) {
  return (
    evidence.message ===
      PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG
        .CONTROL_PLANE_PRESSURE_QUERY &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalBudgetBlockLog(evidence, witness, postTerminalRebalance) {
  const partitionId =
    witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID];
  return (
    evidence.timeMs > postTerminalRebalance.timeMs &&
    (evidence.entityId === partitionId || evidence.partitionId === partitionId) &&
    (
      evidence.reason === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED ||
      evidence.skipDetail === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED
    )
  );
}

function isPostTerminalLeadershipLossLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    evidence.message === REBALANCER_LOG_MSG.LEADER_STOP &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalSiblingLeadershipLossLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    evidence.message === REBALANCER_LOG_MSG.LEADER_STOP &&
    evidence.entityId !==
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalSchedulerHandoffLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    (
      evidence.message === REBALANCER_LOG_MSG.COORDINATOR_SET ||
      evidence.message === REBALANCER_LOG_MSG.LEADER_START
    ) &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalPersistedReplicaOperation(
  operation,
  witness,
  postTerminalRebalance,
) {
  return (
    operation.partitionId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    operation.operationId !==
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID] &&
    operation.createdAtMs >= postTerminalRebalance.timeMs &&
    postTerminalRebalance.timeMs > NUM.ZERO
  );
}

function isPostTerminalSuppressionLog(evidence, witness, terminalFailure) {
  return (
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_SUPPRESSION_MESSAGES.includes(
      evidence.message,
    ) &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > terminalFailure.timeMs
  );
}

function selectRebalancerMoveBlockedReason(evidence = {}) {
  return [
    evidence.reason,
    evidence.errorMessage,
    evidence.error,
    evidence.skipDetail,
    evidence.message,
  ].find((value) => normalizeText(value).length > NUM.ZERO) ||
    PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
}

function resolveRebalancerHandoffFollowUpState(evidence = {}) {
  const state = [
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.ENQUEUED,
      matches: (handoffEvidence) =>
        handoffEvidence.retainedByWitness === true &&
        handoffEvidence.terminalFailureObserved === true &&
        handoffEvidence.postTerminalRebalanceObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.SUPPRESSED,
      matches: (handoffEvidence) =>
        handoffEvidence.retainedByWitness === true &&
        handoffEvidence.terminalFailureObserved === true &&
        handoffEvidence.postTerminalSuppressionObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.RETAINED,
      matches: (handoffEvidence) =>
        handoffEvidence.retainedByWitness === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.MISSING,
      matches: () => true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state || PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.MISSING;
}

function resolveRebalancerFollowUpExecutionState(evidence = {}) {
  const state = [
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .PERSISTED_NEW_OPERATION,
      matches: (executionEvidence) =>
        executionEvidence.persistedOperationObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .BLOCKED_DURING_MOVE_EXECUTION,
      matches: (executionEvidence) =>
        executionEvidence.moveExecutionObserved === true &&
        executionEvidence.moveBlockedObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .EXECUTED_WITHOUT_PERSISTED_OPERATION,
      matches: (executionEvidence) =>
        executionEvidence.moveExecutionObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .NOT_EXECUTED_AFTER_ENQUEUE,
      matches: (executionEvidence) =>
        executionEvidence.followUpState ===
          PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.ENQUEUED,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .MISSING,
      matches: () => true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state ||
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE.MISSING;
}

function resolveRebalancerMoveLimitEvidenceState(evidence = {}) {
  const state = [
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE.BUDGET_BLOCKED,
      matches: (moveLimitEvidence) =>
        moveLimitEvidence.budgetBlockObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE
          .PLANNED_MOVE_COUNT_AVAILABLE,
      matches: (moveLimitEvidence) =>
        moveLimitEvidence.postTerminalRebalanceMoveCount > NUM.ZERO,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE.MISSING,
      matches: () => true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state ||
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE.MISSING;
}

function resolveRebalancerExecutionGapState(evidence = {}) {
  const state = [
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .NEW_OPERATION_PERSISTED,
      matches: (executionEvidence) =>
        executionEvidence.persistedOperationObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .MOVE_BLOCKED,
      matches: (executionEvidence) =>
        executionEvidence.moveBlockedObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .MOVE_EXECUTED,
      matches: (executionEvidence) =>
        executionEvidence.moveExecutionObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .BUDGET_BLOCKED,
      matches: (executionEvidence) =>
        executionEvidence.budgetBlockObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .ADMISSION_DENIED,
      matches: (executionEvidence) =>
        executionEvidence.admissionDeniedObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .SAME_PARTITION_LEADERSHIP_LOST,
      matches: (executionEvidence) =>
        executionEvidence.leadershipLossObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .STARTED_WITH_PRE_EXECUTION_GAP,
      matches: (executionEvidence) =>
        executionEvidence.postTerminalRebalanceObserved === true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state ||
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
      .STARTED_WITH_PRE_EXECUTION_GAP;
}

function summarizeRebalancerFollowUpHandoff({
  failureBundle = {},
  logLines = [],
  priorityRecoveryWitnesses = [],
  snapshotStates = [],
} = {}) {
  const witness = selectRebalancerFollowUpWitness(priorityRecoveryWitnesses);
  const retainedByWitness =
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.AVAILABILITY
    ] === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE;
  const logEvidence = readRebalancerHandoffLogEvidence(failureBundle, logLines);
  const terminalFailure = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isTerminalOperationFailureLog(evidence, witness),
    ),
  );
  const terminalFailureObserved = terminalFailure.timeMs > NUM.ZERO;
  const postTerminalRebalance = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalRebalanceStartLog(evidence, witness, terminalFailure),
    ),
  );
  const postTerminalSuppression = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalSuppressionLog(evidence, witness, terminalFailure),
    ),
  );
  const postTerminalMoveExecution = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalMoveExecutionLog(evidence, witness, postTerminalRebalance),
    ),
  );
  const postTerminalMoveBlocked = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalMoveBlockedLog(evidence, witness, postTerminalRebalance),
    ),
  );
  const postTerminalFeasibilityFilter = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalFeasibilityFilterLog(
        evidence,
        witness,
        terminalFailure,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalAdmissionBatchStartTimeMs =
    selectRebalancerAdmissionBatchStartTimeMs(
      logEvidence,
      postTerminalFeasibilityFilter,
    );
  const postTerminalAdmissionAllowed = logEvidence.filter((evidence) =>
    isPostTerminalAdmissionLog(
      evidence,
      terminalFailure,
      postTerminalFeasibilityFilter,
      postTerminalAdmissionBatchStartTimeMs,
      STORAGE_CAPACITY_LOG_MSG.ADMISSION_ALLOWED,
    ),
  );
  const postTerminalAdmissionDenied = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalAdmissionLog(
        evidence,
        terminalFailure,
        postTerminalFeasibilityFilter,
        postTerminalAdmissionBatchStartTimeMs,
        STORAGE_CAPACITY_LOG_MSG.ADMISSION_DENIED,
      ),
    ),
  );
  const postTerminalBudgetBlock = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalBudgetBlockLog(evidence, witness, postTerminalRebalance),
    ),
  );
  const postTerminalBudgetPressure = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalBudgetPressureLog(evidence, postTerminalRebalance),
    ),
  );
  const postTerminalLeadershipLoss = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalLeadershipLossLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalSiblingLeadershipLoss = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalSiblingLeadershipLossLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalSchedulerHandoff = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalSchedulerHandoffLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalPersistedOperation = selectLatestReplicaOperationRow(
    readReplicaOperationRowsFromSnapshotStates(snapshotStates)
      .filter((operation) =>
        isPostTerminalPersistedReplicaOperation(
          operation,
          witness,
          postTerminalRebalance,
        ),
      ),
  );
  const handoffEvidence = Object.freeze({
    retainedByWitness,
    terminalFailureObserved,
    postTerminalRebalanceObserved: postTerminalRebalance.timeMs > NUM.ZERO,
    postTerminalSuppressionObserved: postTerminalSuppression.timeMs > NUM.ZERO,
  });
  const followUpState = resolveRebalancerHandoffFollowUpState(handoffEvidence);
  const executionEvidence = Object.freeze({
    followUpState,
    postTerminalRebalanceObserved: postTerminalRebalance.timeMs > NUM.ZERO,
    postTerminalRebalanceMoveCount: postTerminalRebalance.moveCount,
    moveExecutionObserved: postTerminalMoveExecution.timeMs > NUM.ZERO,
    moveBlockedObserved: postTerminalMoveBlocked.timeMs > NUM.ZERO,
    budgetBlockObserved: postTerminalBudgetBlock.timeMs > NUM.ZERO,
    admissionDeniedObserved: postTerminalAdmissionDenied.timeMs > NUM.ZERO,
    leadershipLossObserved: postTerminalLeadershipLoss.timeMs > NUM.ZERO,
    persistedOperationObserved:
      postTerminalPersistedOperation.operationId.length > NUM.ZERO,
  });
  const followUpExecutionState =
    resolveRebalancerFollowUpExecutionState(executionEvidence);
  const moveLimitEvidenceState =
    resolveRebalancerMoveLimitEvidenceState(executionEvidence);
  const executionGapState =
    resolveRebalancerExecutionGapState(executionEvidence);
  return {
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.AVAILABILITY]:
      followUpState === PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE
        .MISSING ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.FOLLOW_UP_STATE]:
      followUpState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.PARTITION_ID]:
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID],
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.OPERATION_ID]:
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID],
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.RETAINED_BY_WITNESS]:
      retainedByWitness,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .RETAINED_NEXT_REQUIRED_ACTION]:
      witness[
        PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION
      ],
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .TERMINAL_FAILURE_OBSERVED]:
      terminalFailureObserved,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .TERMINAL_FAILURE_TIME_MS]:
      terminalFailure.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REBALANCE_OBSERVED]:
      postTerminalRebalance.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REBALANCE_TIME_MS]:
      postTerminalRebalance.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REBALANCE_MOVE_COUNT]:
      postTerminalRebalance.moveCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_LIMIT_EVIDENCE_STATE]:
      moveLimitEvidenceState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FOLLOW_UP_EXECUTION_STATE]:
      followUpExecutionState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_EXECUTION_GAP_STATE]:
      executionGapState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FEASIBILITY_FILTER_OBSERVED]:
      postTerminalFeasibilityFilter.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FEASIBLE_CANDIDATE_COUNT]:
      postTerminalFeasibilityFilter.feasibleCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REJECTED_CANDIDATE_COUNT]:
      postTerminalFeasibilityFilter.rejectedCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FEASIBILITY_REJECTED_REASON_CODES]:
      postTerminalFeasibilityFilter.rejectionReasonCodes,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_ADMISSION_ALLOWED_OBSERVED]:
      postTerminalAdmissionAllowed.length > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_ADMISSION_ALLOWED_COUNT]:
      postTerminalAdmissionAllowed.length,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_ADMISSION_DENIED_OBSERVED]:
      postTerminalAdmissionDenied.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_BLOCK_OBSERVED]:
      postTerminalBudgetBlock.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_OBSERVED]:
      postTerminalBudgetPressure.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_TIME_MS]:
      postTerminalBudgetPressure.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_QUERY_DURATION_MS]:
      postTerminalBudgetPressure.queryDurationMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_ROW_COUNT]:
      postTerminalBudgetPressure.rowCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_LEADERSHIP_LOSS_OBSERVED]:
      postTerminalLeadershipLoss.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_LEADERSHIP_LOSS_TIME_MS]:
      postTerminalLeadershipLoss.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SIBLING_LEADERSHIP_LOSS_OBSERVED]:
      postTerminalSiblingLeadershipLoss.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SIBLING_LEADERSHIP_LOSS_TIME_MS]:
      postTerminalSiblingLeadershipLoss.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SCHEDULER_HANDOFF_OBSERVED]:
      postTerminalSchedulerHandoff.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SCHEDULER_HANDOFF_TIME_MS]:
      postTerminalSchedulerHandoff.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_EXECUTION_OBSERVED]:
      postTerminalMoveExecution.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_EXECUTION_TIME_MS]:
      postTerminalMoveExecution.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_BLOCKED_OBSERVED]:
      postTerminalMoveBlocked.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_BLOCKED_REASON]:
      selectRebalancerMoveBlockedReason(postTerminalMoveBlocked),
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PERSISTED_OPERATION_OBSERVED]:
      postTerminalPersistedOperation.operationId.length > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PERSISTED_OPERATION_ID]:
      postTerminalPersistedOperation.operationId,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PERSISTED_OPERATION_CREATED_AT_MS]:
      postTerminalPersistedOperation.createdAtMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SUPPRESSION_OBSERVED]:
      postTerminalSuppression.timeMs > NUM.ZERO,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SUPPRESSION_REASON]:
      postTerminalSuppression.message,
  };
}

function readPublicationConvergenceFromFailureBundle(failureBundle = {}) {
  const directSummaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE,
  );
  const summaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.SUMMARY,
  );
  const standardSummaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.STANDARD_SUMMARY,
  );
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  return readFirstAvailableRecord(
    directSummaryState,
    readFirstRecord(
      summaryState.value[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE],
    ),
    readFirstRecord(
      standardSummaryState.value[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE],
    ),
    readFirstRecord(
      controlPlaneState.value[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE],
    ),
  );
}

function readPriorityRecoveryDecisionSnapshotsFromFailureBundle(
  failureBundle = {},
) {
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  const summaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.SUMMARY,
  );
  const standardSummaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.STANDARD_SUMMARY,
  );
  return readFirstAvailableRecord(
    readFirstRecord(controlPlaneState.value.priorityRecoveryDecisionSnapshots),
    readFirstRecord(
      summaryState.value.controlPlane?.priorityRecoveryDecisionSnapshots,
    ),
    readFirstRecord(
      standardSummaryState.value.controlPlane?.priorityRecoveryDecisionSnapshots,
    ),
  );
}

function buildPublicationRowStateFromConvergence(publicationConvergenceState) {
  if (publicationConvergenceState.availability !==
    PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  const convergence = publicationConvergenceState.value;
  const publishedActiveNodeIds = normalizeList(
    readArrayField(
      convergence,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    ),
  );
  const pendingAckNodeIds = new Set(
    normalizeList(
      readArrayField(
        convergence,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.PENDING_ACK_NODE_IDS,
      ),
    ),
  );
  const requiredAckNodeIds = normalizeList(
    readArrayField(
      convergence,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.REQUIRED_ACK_NODE_IDS,
    ),
  );
  const acknowledgedNodeIds = normalizeList(
    readArrayField(
      convergence,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.ACKNOWLEDGED_NODE_IDS,
    ),
  );
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    value: {
      publicationEpoch:
        normalizeInteger(convergence[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_EPOCH]),
      status:
        normalizeText(
          convergence[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_STATUS],
        ) ||
        normalizeText(convergence[PUBLICATION_EVIDENCE_REPLAY_FIELD.STATUS]),
      publishedActiveNodeIds,
      requiredAckNodeIds:
        requiredAckNodeIds.length > NUM.ZERO ? requiredAckNodeIds : publishedActiveNodeIds,
      acknowledgedNodeIds:
        acknowledgedNodeIds.length > NUM.ZERO ?
          acknowledgedNodeIds :
          publishedActiveNodeIds.filter((nodeId) => !pendingAckNodeIds.has(nodeId)),
      priorityPartitionSummary:
        readRecordField(
          convergence,
          PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_PARTITION_SUMMARY,
        ).value,
    },
  };
}

function selectLatestPublicationRowState(snapshot = {}, publicationConvergenceState = {}) {
  const snapshotPublicationRows = [
    ...readArrayField(
      snapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE_PUBLICATIONS,
    ),
    ...readArrayField(
      snapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE_PUBLICATIONS_SNAKE,
    ),
  ].filter(isRecord);
  if (snapshotPublicationRows.length > NUM.ZERO) {
    const sortedPublicationRows = snapshotPublicationRows.slice().sort((left, right) => {
      const epochDelta =
        normalizeInteger(right.publication_epoch ?? right.publicationEpoch) -
        normalizeInteger(left.publication_epoch ?? left.publicationEpoch);
      if (epochDelta !== NUM.ZERO) {
        return epochDelta;
      }
      return normalizeInteger(right.updated_at ?? right.updatedAt) -
        normalizeInteger(left.updated_at ?? left.updatedAt);
    });
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
      value: sortedPublicationRows[NUM.ZERO],
    };
  }
  return buildPublicationRowStateFromConvergence(publicationConvergenceState);
}

function summarizePriorityPartitionSummary(summary = {}) {
  const blockedPartitions = readArrayField(
    summary,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.BLOCKED_PARTITIONS,
  );
  return {
    satisfied: summary.satisfied === true,
    missingPartitionIds: normalizeList(
      readArrayField(
        summary,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.MISSING_PARTITION_IDS,
      ),
    ),
    blockedPartitionIds: normalizeList(
      blockedPartitions
        .map((entry) => entry?.partitionId ?? entry?.partition_id)
        .filter((partitionId) => normalizeScalarText(partitionId).length > NUM.ZERO),
    ),
  };
}

function buildPrioritySummaryComparison(durableSummary = {}, replayedSummary = {}) {
  const durable = summarizePriorityPartitionSummary(durableSummary);
  const replayed = summarizePriorityPartitionSummary(replayedSummary);
  const durableBlockedPartitionIds = normalizeList([
    ...durable.missingPartitionIds,
    ...durable.blockedPartitionIds,
  ]);
  const replayedBlockedPartitionIds = normalizeList([
    ...replayed.missingPartitionIds,
    ...replayed.blockedPartitionIds,
  ]);
  const summaryChanged =
    JSON.stringify(durableSummary) !== JSON.stringify(replayedSummary);
  const blockedPartitionIdsMatch =
    JSON.stringify(durableBlockedPartitionIds) === JSON.stringify(replayedBlockedPartitionIds);
  const driftClassification = classifyPublicationEvidenceDrift({
    durable,
    replayed,
    summaryChanged,
    blockedPartitionIdsMatch,
  });
  return {
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.DURABLE_SATISFIED]: durable.satisfied,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.REPLAYED_SATISFIED]: replayed.satisfied,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.SUMMARY_CHANGED]: summaryChanged,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.BLOCKED_PARTITION_IDS_MATCH]:
      blockedPartitionIdsMatch,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.DRIFT_CLASSIFICATION]:
      driftClassification,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.DURABLE_BLOCKED_PARTITION_IDS]:
      durableBlockedPartitionIds,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.REPLAYED_BLOCKED_PARTITION_IDS]:
      replayedBlockedPartitionIds,
  };
}

function summarizePriorityRecoveryClosureWitness(closureWitness = null) {
  const closureWitnessRecord = isRecord(closureWitness) ? closureWitness : {};
  const closureRecordId = normalizeText(
    closureWitnessRecord[
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID
    ],
  );
  const closureWitnessClass = normalizeText(
    closureWitnessRecord[
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_WITNESS_CLASS
    ],
  );
  return {
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE]:
      normalizeText(
        closureWitnessRecord[
          PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE
        ],
      ) || null,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PRIORITY_SPREAD_PENDING]:
      closureWitnessRecord[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PRIORITY_SPREAD_PENDING
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED]:
      closureWitnessRecord[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID]:
      closureRecordId.length > NUM.ZERO ? closureRecordId : null,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_WITNESS_CLASS]:
      closureWitnessClass.length > NUM.ZERO ? closureWitnessClass : null,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.BLOCKED_PARTITION_IDS]:
      normalizeList(
        readArrayField(
          closureWitnessRecord,
          PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.BLOCKED_PARTITION_IDS,
        ),
      ),
  };
}

function classifyPublicationEvidenceClosureWitness(closureWitness = {}) {
  const closureWitnessState = normalizeText(
    closureWitness[PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE],
  );
  if (closureWitnessState.length === NUM.ZERO) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION.ABSENT;
  }
  if (
    closureWitnessState === PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.PENDING
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION.PENDING;
  }
  if (
    closureWitnessState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION ||
    closureWitness[
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED
    ] === true
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION
      .REFRESH_REQUIRED;
  }
  if (
    closureWitnessState ===
    PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_FRESH
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION
      .SATISFIED_FRESH;
  }
  return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION.OTHER;
}

function buildPriorityClosureWitnessComparison(closureWitness = {}) {
  return {
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_STATE]:
      closureWitness[PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE],
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_RECORD_ID]:
      closureWitness[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID
      ],
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_CLASS]:
      closureWitness[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_WITNESS_CLASS
      ],
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_PUBLICATION_REFRESH_REQUIRED]:
      closureWitness[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_CLASSIFICATION]:
      classifyPublicationEvidenceClosureWitness(closureWitness),
  };
}

function classifyPublicationEvidenceDrift(options = {}) {
  if (
    options.summaryChanged !== true &&
    options.blockedPartitionIdsMatch === true &&
    options.durable?.satisfied === options.replayed?.satisfied
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.ALIGNED;
  }
  if (
    options.durable?.satisfied !== true &&
    options.replayed?.satisfied === true
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION
      .DURABLE_STALE_REPLAYED_SATISFIED;
  }
  if (options.replayed?.satisfied !== true) {
    return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED;
  }
  return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.CHANGED;
}

function buildReplayDerivationOptions(options = {}) {
  const latestPublicationRowState =
    options.latestPublicationRowState &&
      typeof options.latestPublicationRowState === TYPEOF.OBJECT ?
      options.latestPublicationRowState :
      {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
        value: {},
      };
  return {
    ...(latestPublicationRowState.availability ===
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE ?
      {
        [PUBLICATION_EVIDENCE_REPLAY_FIELD.LATEST_PUBLICATION_ROW]:
          latestPublicationRowState.value,
      } :
      {}),
    nodeRows: Array.isArray(options.nodeRows) ? options.nodeRows : [],
    nodeEndpointRows: Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : [],
    serviceRows: Array.isArray(options.serviceRows) ? options.serviceRows : [],
    partitionRows: Array.isArray(options.partitionRows) ? options.partitionRows : [],
    readinessEntries: Array.isArray(options.readinessEntries) ? options.readinessEntries : [],
    nowMs: normalizeInteger(options.nowMs, Date.now()),
  };
}

function replayPublicationPriorityEvidenceFromRows(options = {}) {
  const publicationConvergenceState =
    options.publicationConvergenceState &&
      typeof options.publicationConvergenceState === TYPEOF.OBJECT ?
      options.publicationConvergenceState :
      {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
        value: {},
      };
  const latestPublicationRowState =
    options.latestPublicationRowState &&
      typeof options.latestPublicationRowState === TYPEOF.OBJECT ?
      options.latestPublicationRowState :
      buildPublicationRowStateFromConvergence(publicationConvergenceState);
  const candidate = deriveMembershipPublicationCandidate(
    buildReplayDerivationOptions({
      ...options,
      latestPublicationRowState,
    }),
  );
  const durablePriorityPartitionSummary = readRecordField(
    publicationConvergenceState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_PARTITION_SUMMARY,
  ).value;
  const replayedPriorityPartitionSummary =
    candidate.priorityPartitionSummary &&
      typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT ?
      candidate.priorityPartitionSummary :
      {};
  const replayedClosureWitness = summarizePriorityRecoveryClosureWitness(
    candidate.priorityRecoveryClosureWitness ||
      buildPriorityRecoveryClosureWitness({
        decisionSnapshots: options.priorityRecoveryDecisionSnapshots,
        priorityPartitionSummary: durablePriorityPartitionSummary,
      }),
  );
  return {
    source: PUBLICATION_EVIDENCE_REPLAY_SOURCE.SNAPSHOT,
    rowCounts: {
      nodes: Array.isArray(options.nodeRows) ? options.nodeRows.length : NUM.ZERO,
      nodeEndpoints: Array.isArray(options.nodeEndpointRows) ?
        options.nodeEndpointRows.length :
        NUM.ZERO,
      partitions: Array.isArray(options.partitionRows) ? options.partitionRows.length : NUM.ZERO,
      services: Array.isArray(options.serviceRows) ? options.serviceRows.length : NUM.ZERO,
    },
    durablePublication: {
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.EPOCH]:
        normalizeInteger(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_EPOCH
          ],
        ),
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.STATUS]:
        normalizeText(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_STATUS
          ],
        ),
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.CLOSURE_RECORD_ID]:
        normalizeText(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID
          ],
        ) || null,
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.CLOSURE_WITNESS_CLASS]:
        normalizeText(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD
              .CLOSURE_WITNESS_CLASS
          ],
        ) || null,
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.PRIORITY_SPREAD_PENDING]:
        publicationConvergenceState.value.prioritySpreadPending === true,
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.SUMMARY]:
        durablePriorityPartitionSummary,
    },
    replayedPublication: {
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.EPOCH]: candidate.publicationEpoch,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.STATUS]: candidate.publicationStatus,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.CLOSURE_WITNESS]:
        replayedClosureWitness,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.RECOVERY_PROTOCOL_STATE]:
        candidate.recoveryProtocolState,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.PRIORITY_RECOVERY_REASON_CODES]:
        normalizeList(candidate.priorityRecoveryReasonCodes),
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.SUMMARY]:
        replayedPriorityPartitionSummary,
    },
    comparison: {
      ...buildPrioritySummaryComparison(
        durablePriorityPartitionSummary,
        replayedPriorityPartitionSummary,
      ),
      ...buildPriorityClosureWitnessComparison(replayedClosureWitness),
    },
  };
}

function parseSnapshotLine(line, index) {
  const normalizedLine = normalizeText(line);
  if (normalizedLine.length === NUM.ZERO) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  try {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
      value: JSON.parse(normalizedLine),
    };
  } catch (error) {
    error.message = `invalid snapshots.ndjson line ${index + NUM.ONE}: ${error.message}`;
    throw error;
  }
}

function selectLatestSnapshot(snapshots = []) {
  const availableSnapshots = snapshots
    .filter((snapshotState) =>
      snapshotState.availability === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    )
    .map((snapshotState) => snapshotState.value)
    .filter(isRecord);
  if (availableSnapshots.length === NUM.ZERO) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  const sortedSnapshots = availableSnapshots.slice().sort((left, right) =>
    normalizeInteger(right[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP]) -
    normalizeInteger(left[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP]),
  );
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    value: sortedSnapshots[NUM.ZERO],
  };
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, PUBLICATION_EVIDENCE_REPLAY_ENCODING);
  return JSON.parse(raw);
}

async function readSnapshotStates(filePath) {
  const raw = await readFile(filePath, PUBLICATION_EVIDENCE_REPLAY_ENCODING);
  return raw
    .split(PUBLICATION_EVIDENCE_REPLAY_NEWLINE)
    .map((line, index) => parseSnapshotLine(line, index))
    .filter((snapshotState) =>
      snapshotState.availability === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
}

async function readOptionalLogLines(filePath) {
  try {
    const raw = await readFile(filePath, PUBLICATION_EVIDENCE_REPLAY_ENCODING);
    return raw
      .split(PUBLICATION_EVIDENCE_REPLAY_NEWLINE)
      .filter((line) => normalizeText(line).length > NUM.ZERO);
  } catch (_error) {
    return [];
  }
}

async function replayPublicationPriorityEvidenceFromReportDir(reportDir) {
  const normalizedReportDir = normalizeText(reportDir);
  if (normalizedReportDir.length === NUM.ZERO) {
    throw new Error(PUBLICATION_EVIDENCE_REPLAY_ERROR_MESSAGE.REPORT_DIR_REQUIRED);
  }
  const failureBundle = await readJsonFile(
    join(normalizedReportDir, PUBLICATION_EVIDENCE_REPLAY_FILE.FAILURE_BUNDLE),
  );
  const snapshotStates = await readSnapshotStates(
    join(normalizedReportDir, PUBLICATION_EVIDENCE_REPLAY_FILE.SNAPSHOTS),
  );
  const logLines = await readOptionalLogLines(
    join(normalizedReportDir, PUBLICATION_EVIDENCE_REPLAY_FILE.TIMELINE_LOG),
  );
  const latestSnapshotState = selectLatestSnapshot(snapshotStates);
  const latestSnapshot = latestSnapshotState.value;
  const publicationConvergenceState =
    readPublicationConvergenceFromFailureBundle(failureBundle);
  const priorityRecoveryDecisionSnapshotsState =
    readPriorityRecoveryDecisionSnapshotsFromFailureBundle(failureBundle);
  const latestPublicationRowState = selectLatestPublicationRowState(
    latestSnapshot,
    publicationConvergenceState,
  );
  const selectedSnapshotObservation =
    readSelectedSnapshotObservationFromFailureBundle(failureBundle);
  const ownerRpcCacheRepair = summarizeOwnerRpcCacheRepairDeferrals({
    failureBundle,
    selectedSnapshotNodeId:
      selectedSnapshotObservation[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID
      ],
  });
  const priorityRecoveryWitnesses =
    summarizePriorityRecoveryWitnesses(failureBundle);
  const rebalancerFollowUpHandoff = summarizeRebalancerFollowUpHandoff({
    failureBundle,
    logLines,
    priorityRecoveryWitnesses,
    snapshotStates,
  });
  const nodeEndpointRows = [
    ...readArrayField(
      latestSnapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.NODE_ENDPOINTS,
    ),
    ...readArrayField(
      latestSnapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.NODE_ENDPOINTS_SNAKE,
    ),
  ];
  return {
    reportDir: normalizedReportDir,
    source: PUBLICATION_EVIDENCE_REPLAY_SOURCE.FAILURE_BUNDLE,
    snapshotTimestamp: normalizeInteger(
      latestSnapshot[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP],
    ),
    selectedSnapshotObservation,
    ownerRpcCacheRepair,
    selectedSnapshotRepairEvidenceRecovery:
      summarizeSelectedSnapshotRepairEvidenceRecovery({
        selectedSnapshotObservation,
        ownerRpcCacheRepair,
      }),
    priorityRecoveryWitnesses,
    rebalancerFollowUpHandoff,
    supportingPriorityRecoveryWitness:
      selectSupportingPriorityRecoveryWitness(priorityRecoveryWitnesses),
    ...replayPublicationPriorityEvidenceFromRows({
      publicationConvergenceState,
      latestPublicationRowState,
      nodeRows: readArrayField(latestSnapshot, PUBLICATION_EVIDENCE_REPLAY_FIELD.NODES),
      nodeEndpointRows,
      serviceRows: readArrayField(latestSnapshot, PUBLICATION_EVIDENCE_REPLAY_FIELD.SERVICES),
      partitionRows: readArrayField(latestSnapshot, PUBLICATION_EVIDENCE_REPLAY_FIELD.PARTITIONS),
      priorityRecoveryDecisionSnapshots:
        priorityRecoveryDecisionSnapshotsState.value,
      nowMs: normalizeInteger(
        latestSnapshot[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP],
        Date.now(),
      ),
    }),
  };
}

function formatJsonLine(label, value) {
  return `${label}: ${JSON.stringify(value)}`;
}

function formatPublicationEvidenceReplaySummary(summary = {}) {
  return [
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.REPORT, summary.reportDir),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SNAPSHOT_TIMESTAMP,
      summary.snapshotTimestamp,
    ),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.ROW_COUNTS, summary.rowCounts),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.DURABLE, summary.durablePublication),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.REPLAYED, summary.replayedPublication),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SELECTED_SNAPSHOT_OBSERVATION,
      summary.selectedSnapshotObservation,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.OWNER_RPC_CACHE_REPAIR,
      summary.ownerRpcCacheRepair,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SELECTED_SNAPSHOT_REPAIR_EVIDENCE_RECOVERY,
      summary.selectedSnapshotRepairEvidenceRecovery,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.PRIORITY_RECOVERY_WITNESSES,
      summary.priorityRecoveryWitnesses,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.REBALANCER_FOLLOW_UP_HANDOFF,
      summary.rebalancerFollowUpHandoff,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SUPPORTING_PRIORITY_RECOVERY_WITNESS,
      summary.supportingPriorityRecoveryWitness,
    ),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.COMPARISON, summary.comparison),
  ].join(PUBLICATION_EVIDENCE_REPLAY_NEWLINE);
}

async function runPublicationEvidenceReplayCli(argv = process.argv) {
  const reportDir = argv[NUM.TWO];
  const summary = await replayPublicationPriorityEvidenceFromReportDir(reportDir);
  process.stdout.write(
    formatPublicationEvidenceReplaySummary(summary) +
      PUBLICATION_EVIDENCE_REPLAY_NEWLINE,
  );
}

if (process.argv[NUM.ONE] === fileURLToPath(import.meta.url)) {
  runPublicationEvidenceReplayCli().catch((error) => {
    process.stderr.write(
      JSON.stringify(
        {error: error.message},
        PUBLICATION_EVIDENCE_REPLAY_JSON_REPLACER,
        PUBLICATION_EVIDENCE_REPLAY_JSON_INDENT,
      ) + PUBLICATION_EVIDENCE_REPLAY_NEWLINE,
    );
    process.exitCode = PUBLICATION_EVIDENCE_REPLAY_EXIT_CODE.FAILURE;
  });
}

export {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE,
  formatPublicationEvidenceReplaySummary,
  replayPublicationPriorityEvidenceFromReportDir,
  replayPublicationPriorityEvidenceFromRows,
};
