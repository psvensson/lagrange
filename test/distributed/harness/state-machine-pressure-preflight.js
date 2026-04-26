import {NUM, TYPEOF} from '../../../src/constants/index.js';
import {
  summarizeReplicaOperationLiveness,
} from '../../../src/rebalancer/replica-operation-liveness.js';
import {
  PUBLICATION_RECOVERY_INVARIANT_ID,
  PUBLICATION_RECOVERY_INVARIANT_SEVERITY,
  PUBLICATION_RECOVERY_MACHINE_ACTION,
  PUBLICATION_RECOVERY_MACHINE_CONTEXT,
  PUBLICATION_RECOVERY_MACHINE_SPEC,
  PUBLICATION_RECOVERY_REASON,
  evaluatePublicationRecoveryMachine,
} from '../../../src/control-plane/publication-recovery-state-machine.js';
import {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
} from './post-rebalance-closure-contract.js';

const EMPTY_TEXT = '';
const EMPTY_LIST = Object.freeze([]);
const EMPTY_RECORD = Object.freeze({});
const STATE_MACHINE_PRESSURE_PREFLIGHT_LABEL =
  'State-machine pressure preflight';
const SUMMARY_SEPARATOR = ': ';
const SUMMARY_COUNT_PREFIX = 'issues=';
const SUMMARY_STATIC_PREFIX = ' static=';
const SUMMARY_SNAPSHOT_PREFIX = ' snapshots=';
const SUMMARY_READY_PREFIX = ' ready=';
const SUMMARY_ISSUE_PREFIX = '- ';
const SUMMARY_ISSUE_JOINER = ' ';
const SUMMARY_NEWLINE = '\n';
const DIRECT_STATIC_SCOPE_ID = 'static-pressure-obligations';
const DEFAULT_SNAPSHOT_SCOPE_ID = 'diagnostics-snapshot';
const DIAGNOSTICS_DETAILS_FIELD = 'details';
const DIAGNOSTICS_FIELD = 'diagnostics';
const SCENARIOS_FIELD = 'scenarios';
const CONTROL_PLANE_DIAGNOSTICS_FIELD = 'controlPlaneDiagnostics';
const POST_REBALANCE_CLOSURE_FIELD = 'postRebalanceClosure';
const PUBLICATION_CONVERGENCE_FIELD = 'publicationConvergence';
const PRIORITY_RECOVERY_OBSERVATION_FIELD = 'priorityRecoveryObservation';
const REPLICA_OPERATION_ROWS_FIELD = 'replicaOperationRows';
const OPERATION_HISTORY_FIELD = 'operationHistory';
const ERROR_FIELD = 'error';
const ROOT_CAUSE_BUNDLE_FIELD = 'rootCauseBundle';
const ROOT_CAUSE_SNAPSHOTS_FIELD = 'snapshotsByNodeId';
const ROOT_CAUSE_CONTROL_PLANE_FIELD = 'controlPlaneDiagnostics';
const PENDING_ACK_COUNT_FIELD = 'pendingAckCount';
const PENDING_ACK_NODE_IDS_FIELD = 'pendingAckNodeIds';
const REQUIRED_ACK_NODE_IDS_FIELD = 'requiredAckNodeIds';
const ACKNOWLEDGED_NODE_IDS_FIELD = 'acknowledgedNodeIds';
const ACTIVE_GATE_FIELD = 'activeGate';
const ACTIVE_GATE_PROGRESS_FIELD = 'activeGateProgress';
const BEST_PROGRESS_FIELD = 'bestProgress';
const MISSING_PUBLISHED_COUNT_FIELD = 'missingPublishedCount';
const MISSING_PUBLISHED_NODE_IDS_FIELD = 'missingPublishedNodeIds';
const PROGRESS_FIELD = 'progress';
const SELECTED_MISSING_PUBLISHED_NODE_IDS_FIELD =
  'selectedMissingPublishedNodeIds';
const STATUS_FIELD = 'status';
const PUBLICATION_STATUS_FIELD = 'publicationStatus';
const PUBLICATION_AVAILABLE_FIELD = 'publicationAvailable';
const STATE_FIELD = 'state';
const DIMENSIONS_FIELD = 'dimensions';
const REASON_CODES_FIELD = 'reasonCodes';
const EVIDENCE_FIELD = 'evidence';
const WORKFLOW_STEP_FIELD = 'workflowStep';
const WORKFLOW_STEP_SNAKE_FIELD = 'workflow_step';
const COMPLETED_AT_FIELD = 'completedAt';
const COMPLETED_AT_SNAKE_FIELD = 'completed_at';
const OPERATION_ID_FIELD = 'operationId';
const OPERATION_ID_SNAKE_FIELD = 'operation_id';
const REPLICA_OPERATION_TYPE_FIELD = 'type';
const REPLICA_OPERATION_STATUS_FIELD = 'status';
const SEMANTIC_PHASE_FIELD = 'semanticPhase';
const STEPS_HISTORY_FIELD = 'stepsHistory';
const STEPS_HISTORY_SNAKE_FIELD = 'steps_history';
const STEP_REASON_FIELD = 'reason';
const SNAPSHOT_ID_FIELD = 'snapshotId';
const ISSUE_ID_FIELD = 'issueId';
const SEVERITY_FIELD = 'severity';
const PRESSURE_POINT_FIELD = 'pressurePointId';
const MESSAGE_FIELD = 'message';
const OWNER_FIELD = 'owner';
const PRODUCER_FIELD = 'producer';
const WITNESS_FIELD = 'witness';
const RETRY_FIELD = 'retry';
const ESCALATION_FIELD = 'escalation';
const CONSUMER_FIELD = 'consumer';
const READY_FIELD = 'ready';
const RESULT_STATE_FIELD = 'resultState';
const STATIC_GRAMMAR_FIELD = 'staticGrammar';
const SNAPSHOTS_FIELD = 'snapshots';
const ISSUES_FIELD = 'issues';
const HARD_ISSUE_COUNT_FIELD = 'hardIssueCount';
const WARNING_ISSUE_COUNT_FIELD = 'warningIssueCount';
const PRESSURE_POINTS_FIELD = 'pressurePoints';
const MISSING_FIELD = 'missing';
const CHECKED_POINT_COUNT_FIELD = 'checkedPointCount';
const CONTROL_PLANE_PUBLICATIONS_PARTITION =
  'control_plane_publications-p1';
const REPLICA_OPERATIONS_PARTITION = 'replica_operations-p1';
const SQL_TRANSACTION_PARTICIPANTS_PARTITION =
  'sql_transaction_participants-p1';

const STATE_MACHINE_PRESSURE_PREFLIGHT_STATE = Object.freeze({
  PASS: 'pass',
  WARNING: 'warning',
  FAILED: 'failed',
});

const STATE_MACHINE_PRESSURE_POINT_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  WARNING: 'warning',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed',
});

const STATE_MACHINE_PRESSURE_ISSUE_SEVERITY = Object.freeze({
  FAILURE: 'failure',
  WARNING: 'warning',
});

const STATE_MACHINE_PRESSURE_POINT_ID = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  OPERATION_DRAIN: 'operation_drain',
  MEMBERSHIP_TRIM: 'membership_trim',
  NO_OVER_TARGET: 'no_over_target',
  REPLACEMENT_LEADER_OWNERSHIP: 'replacement_leader_ownership',
  RECOVERY_ADMISSION: 'recovery_admission',
  CDC_PROJECTION_VISIBLE: 'cdc_projection_visible',
});

const STATE_MACHINE_PRESSURE_OWNER = Object.freeze({
  MEMBERSHIP_PUBLICATION_COORDINATOR: 'membership_publication_coordinator',
  REPLICA_OPERATION_LIVENESS: 'replica_operation_liveness',
  REBALANCER_WORKFLOW_OWNER: 'rebalancer_workflow_owner',
  POST_REBALANCE_CLOSURE_CONTRACT: 'post_rebalance_closure_contract',
  PRIORITY_RECOVERY_SNAPSHOT: 'priority_recovery_snapshot',
  CDC_PROJECTION: 'cdc_projection',
});

const STATE_MACHINE_PRESSURE_WITNESS = Object.freeze({
  PUBLICATION_ACKS_COMPLETE: 'publication_acks_complete',
  OPERATION_SETTLEMENT_WITNESS: 'operation_settlement_witness',
  PUBLISHED_MEMBERSHIP_TRIMMED: 'published_membership_trimmed',
  TARGET_VOTER_COUNT_RESTORED: 'target_voter_count_restored',
  REPLACEMENT_LEADER_VISIBLE: 'replacement_leader_visible',
  RECOVERY_SPREAD_SATISFIED: 'recovery_spread_satisfied',
  PARTITION_LEADER_PROJECTION_VISIBLE: 'partition_leader_projection_visible',
});

const STATE_MACHINE_PRESSURE_PRODUCER = Object.freeze({
  PUBLICATION_ACK_OWNER: 'publication_ack_owner',
  REPLICA_OPERATION_OWNER: 'replica_operation_owner',
  MEMBERSHIP_PUBLICATION_RECONCILER: 'membership_publication_reconciler',
  MOVE_PLANNER_CLEANUP: 'move_planner_cleanup',
  SOURCE_LEADER_HANDOFF_OWNER: 'source_leader_handoff_owner',
  PRIORITY_RECOVERY_OWNER: 'priority_recovery_owner',
  CONTROL_SNAPSHOT_CDC_PROJECTION: 'control_snapshot_cdc_projection',
});

const STATE_MACHINE_PRESSURE_RETRY = Object.freeze({
  HEARTBEAT_ACK_PROBE: 'heartbeat_ack_probe',
  OPERATION_VISIBILITY_RECHECK: 'operation_visibility_recheck',
  MEMBERSHIP_RECONCILE_WAKEUP: 'membership_reconcile_wakeup',
  REBALANCER_CLEANUP_TICK: 'rebalancer_cleanup_tick',
  REPLACEMENT_ELECTION_RETRY: 'replacement_election_retry',
  PRIORITY_RECOVERY_PROGRESS_WAKEUP: 'priority_recovery_progress_wakeup',
  SNAPSHOT_REPAIR_OR_REQUERY: 'snapshot_repair_or_requery',
});

const STATE_MACHINE_PRESSURE_ESCALATION = Object.freeze({
  PUBLICATION_TIMEOUT_CLASSIFICATION: 'publication_timeout_classification',
  STALE_OPERATION_LIVENESS_CLASSIFICATION:
    'stale_operation_liveness_classification',
  POST_REBALANCE_BLOCKER: 'post_rebalance_blocker',
  RETARGET_REPLACEMENT_LEADER: 'retarget_replacement_leader',
  RECOVERY_BLOCKER_CLASSIFICATION: 'recovery_blocker_classification',
  CDC_PROJECTION_UNAVAILABLE: 'cdc_projection_unavailable',
});

const REPLICA_OPERATION_STATUS = Object.freeze({
  ACTIVE: 'active',
});

const REPLICA_OPERATION_SEMANTIC_PHASE = Object.freeze({
  SETTLED: 'settled',
});

const PRESSURE_PREFLIGHT_ISSUE_ID = Object.freeze({
  MISSING_STATIC_OBLIGATION: 'missing_static_obligation',
  PUBLICATION_PUBLISHED_WITH_PENDING_ACK:
    PUBLICATION_RECOVERY_INVARIANT_ID.PUBLISHED_WITH_PENDING_ACK,
  PUBLICATION_ACK_COMPLETE_NON_TERMINAL:
    PUBLICATION_RECOVERY_INVARIANT_ID.ACK_COMPLETE_NON_TERMINAL,
  PUBLICATION_ACK_PENDING: PUBLICATION_RECOVERY_REASON.PUBLICATION_ACK_PENDING,
  PUBLICATION_MISSING_PUBLISHED_MEMBERS:
    PUBLICATION_RECOVERY_REASON.PUBLICATION_MISSING_PUBLISHED_MEMBERS,
  COMPLETED_ACTIVE_OPERATION_ROW: 'completed_active_operation_row',
  OPERATION_DRAIN_OPEN: 'operation_drain_open',
  MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN: 'membership_trim_with_closed_drain',
  OVERTARGET_WITH_CLOSED_DRAIN: 'overtarget_with_closed_drain',
  REPLACEMENT_LEADER_HANDOFF_STALLED:
    'replacement_leader_handoff_stalled',
  RECOVERY_ADMISSION_OPEN: 'recovery_admission_open',
  CDC_PROJECTION_OPEN: 'cdc_projection_open',
});

const PRESSURE_PREFLIGHT_MESSAGE = Object.freeze({
  MISSING_STATIC_OBLIGATION:
    'pressure point is missing a closure obligation field',
  PUBLICATION_PUBLISHED_WITH_PENDING_ACK:
    'published publication still reports pending acknowledgement debt',
  PUBLICATION_ACK_COMPLETE_NON_TERMINAL:
    'non-terminal publication has all required acknowledgements',
  PUBLICATION_ACK_PENDING:
    'publication convergence still waits on acknowledgement evidence',
  PUBLICATION_MISSING_PUBLISHED_MEMBERS:
    'publication convergence still misses published-active evidence',
  COMPLETED_ACTIVE_OPERATION_ROW:
    'replica operation row has completion evidence while status remains active',
  OPERATION_DRAIN_OPEN:
    'operation drain is still open in the post-rebalance closure contract',
  MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN:
    'membership trim remains open after operation drain closed',
  OVERTARGET_WITH_CLOSED_DRAIN:
    'over-target voter cleanup remains open after operation drain closed',
  REPLACEMENT_LEADER_HANDOFF_STALLED:
    'replacement leader ownership or source handoff evidence is stalled',
  RECOVERY_ADMISSION_OPEN:
    'priority recovery admission remains open',
  CDC_PROJECTION_OPEN:
    'CDC projection visibility remains open',
});

const REPLACEMENT_LEADER_STALL_FRAGMENT = Object.freeze({
  REPLACE_REMOVE_SAFETY_BLOCKED: 'replace_remove_safety_blocked',
  REPLACEMENT_LEADER_OWNERSHIP_PENDING:
    'replacement leader ownership pending',
  REPLICA_NOT_FOUND_FOR_HANDOFF: 'Replica not found for leader handoff',
});

const STATE_MACHINE_PRESSURE_STATIC_FIELDS = Object.freeze([
  OWNER_FIELD,
  PRODUCER_FIELD,
  WITNESS_FIELD,
  RETRY_FIELD,
  ESCALATION_FIELD,
  CONSUMER_FIELD,
]);

const STATE_MACHINE_PRESSURE_POINT_GRAMMAR = Object.freeze([
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.PUBLICATION_CONVERGENCE,
    owner: STATE_MACHINE_PRESSURE_OWNER.MEMBERSHIP_PUBLICATION_COORDINATOR,
    producer: STATE_MACHINE_PRESSURE_PRODUCER.PUBLICATION_ACK_OWNER,
    witness: STATE_MACHINE_PRESSURE_WITNESS.PUBLICATION_ACKS_COMPLETE,
    retry: STATE_MACHINE_PRESSURE_RETRY.HEARTBEAT_ACK_PROBE,
    escalation:
      STATE_MACHINE_PRESSURE_ESCALATION.PUBLICATION_TIMEOUT_CLASSIFICATION,
    consumer: STATE_MACHINE_PRESSURE_OWNER.POST_REBALANCE_CLOSURE_CONTRACT,
    description: 'publication status and acknowledgement closure',
  }),
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.OPERATION_DRAIN,
    owner: STATE_MACHINE_PRESSURE_OWNER.REPLICA_OPERATION_LIVENESS,
    producer: STATE_MACHINE_PRESSURE_PRODUCER.REPLICA_OPERATION_OWNER,
    witness: STATE_MACHINE_PRESSURE_WITNESS.OPERATION_SETTLEMENT_WITNESS,
    retry: STATE_MACHINE_PRESSURE_RETRY.OPERATION_VISIBILITY_RECHECK,
    escalation:
      STATE_MACHINE_PRESSURE_ESCALATION
        .STALE_OPERATION_LIVENESS_CLASSIFICATION,
    consumer: STATE_MACHINE_PRESSURE_OWNER.POST_REBALANCE_CLOSURE_CONTRACT,
    description: 'replica operation settlement and drain closure',
  }),
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.MEMBERSHIP_TRIM,
    owner: STATE_MACHINE_PRESSURE_OWNER.MEMBERSHIP_PUBLICATION_COORDINATOR,
    producer:
      STATE_MACHINE_PRESSURE_PRODUCER.MEMBERSHIP_PUBLICATION_RECONCILER,
    witness: STATE_MACHINE_PRESSURE_WITNESS.PUBLISHED_MEMBERSHIP_TRIMMED,
    retry: STATE_MACHINE_PRESSURE_RETRY.MEMBERSHIP_RECONCILE_WAKEUP,
    escalation: STATE_MACHINE_PRESSURE_ESCALATION.POST_REBALANCE_BLOCKER,
    consumer: STATE_MACHINE_PRESSURE_OWNER.POST_REBALANCE_CLOSURE_CONTRACT,
    description: 'published membership trim after topology changes',
  }),
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.NO_OVER_TARGET,
    owner: STATE_MACHINE_PRESSURE_OWNER.REBALANCER_WORKFLOW_OWNER,
    producer: STATE_MACHINE_PRESSURE_PRODUCER.MOVE_PLANNER_CLEANUP,
    witness: STATE_MACHINE_PRESSURE_WITNESS.TARGET_VOTER_COUNT_RESTORED,
    retry: STATE_MACHINE_PRESSURE_RETRY.REBALANCER_CLEANUP_TICK,
    escalation: STATE_MACHINE_PRESSURE_ESCALATION.POST_REBALANCE_BLOCKER,
    consumer: STATE_MACHINE_PRESSURE_OWNER.POST_REBALANCE_CLOSURE_CONTRACT,
    description: 'bounded over-target voter cleanup',
  }),
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.REPLACEMENT_LEADER_OWNERSHIP,
    owner: STATE_MACHINE_PRESSURE_OWNER.REBALANCER_WORKFLOW_OWNER,
    producer: STATE_MACHINE_PRESSURE_PRODUCER.SOURCE_LEADER_HANDOFF_OWNER,
    witness: STATE_MACHINE_PRESSURE_WITNESS.REPLACEMENT_LEADER_VISIBLE,
    retry: STATE_MACHINE_PRESSURE_RETRY.REPLACEMENT_ELECTION_RETRY,
    escalation: STATE_MACHINE_PRESSURE_ESCALATION.RETARGET_REPLACEMENT_LEADER,
    consumer: STATE_MACHINE_PRESSURE_OWNER.REPLICA_OPERATION_LIVENESS,
    description: 'source-removal safety for replacement leader ownership',
  }),
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.RECOVERY_ADMISSION,
    owner: STATE_MACHINE_PRESSURE_OWNER.PRIORITY_RECOVERY_SNAPSHOT,
    producer: STATE_MACHINE_PRESSURE_PRODUCER.PRIORITY_RECOVERY_OWNER,
    witness: STATE_MACHINE_PRESSURE_WITNESS.RECOVERY_SPREAD_SATISFIED,
    retry: STATE_MACHINE_PRESSURE_RETRY.PRIORITY_RECOVERY_PROGRESS_WAKEUP,
    escalation:
      STATE_MACHINE_PRESSURE_ESCALATION.RECOVERY_BLOCKER_CLASSIFICATION,
    consumer: STATE_MACHINE_PRESSURE_OWNER.MEMBERSHIP_PUBLICATION_COORDINATOR,
    description: 'priority recovery admission and spread closure',
  }),
  Object.freeze({
    id: STATE_MACHINE_PRESSURE_POINT_ID.CDC_PROJECTION_VISIBLE,
    owner: STATE_MACHINE_PRESSURE_OWNER.CDC_PROJECTION,
    producer: STATE_MACHINE_PRESSURE_PRODUCER.CONTROL_SNAPSHOT_CDC_PROJECTION,
    witness:
      STATE_MACHINE_PRESSURE_WITNESS.PARTITION_LEADER_PROJECTION_VISIBLE,
    retry: STATE_MACHINE_PRESSURE_RETRY.SNAPSHOT_REPAIR_OR_REQUERY,
    escalation: STATE_MACHINE_PRESSURE_ESCALATION.CDC_PROJECTION_UNAVAILABLE,
    consumer: STATE_MACHINE_PRESSURE_OWNER.POST_REBALANCE_CLOSURE_CONTRACT,
    description: 'leader and partition projection visibility',
  }),
]);

const CLOSURE_DIMENSION_STATE_MAP = Object.freeze({
  [POST_REBALANCE_CLOSURE_STATE.CLOSED]:
    STATE_MACHINE_PRESSURE_POINT_STATE.CLOSED,
  [POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED]:
    STATE_MACHINE_PRESSURE_POINT_STATE.WARNING,
  [POST_REBALANCE_CLOSURE_STATE.OPEN]:
    STATE_MACHINE_PRESSURE_POINT_STATE.OPEN,
  [POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE]:
    STATE_MACHINE_PRESSURE_POINT_STATE.UNAVAILABLE,
});

const PUBLICATION_MACHINE_ACTION_PRESSURE_STATE = Object.freeze({
  [PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE]:
    STATE_MACHINE_PRESSURE_POINT_STATE.FAILED,
  [PUBLICATION_RECOVERY_MACHINE_ACTION.PRESERVE_STATUS]:
    STATE_MACHINE_PRESSURE_POINT_STATE.OPEN,
  [PUBLICATION_RECOVERY_MACHINE_ACTION.RECORD_ACK]:
    STATE_MACHINE_PRESSURE_POINT_STATE.OPEN,
  [PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_CLOSED]:
    STATE_MACHINE_PRESSURE_POINT_STATE.CLOSED,
  [PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_OPEN]:
    STATE_MACHINE_PRESSURE_POINT_STATE.OPEN,
  [PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_UNAVAILABLE]:
    STATE_MACHINE_PRESSURE_POINT_STATE.UNAVAILABLE,
});

const PUBLICATION_MACHINE_ACTION_ISSUE_ID = Object.freeze({
  [PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_OPEN]:
    PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_ACK_PENDING,
});

const PUBLICATION_RECOVERY_REASON_ISSUE_ID = Object.freeze({
  [PUBLICATION_RECOVERY_REASON.PUBLICATION_ACK_PENDING]:
    PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_ACK_PENDING,
  [PUBLICATION_RECOVERY_REASON.PUBLICATION_MISSING_PUBLISHED_MEMBERS]:
    PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_MISSING_PUBLISHED_MEMBERS,
});

const PUBLICATION_INVARIANT_SEVERITY_MAP = Object.freeze({
  [PUBLICATION_RECOVERY_INVARIANT_SEVERITY.FAILURE]:
    STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.FAILURE,
  [PUBLICATION_RECOVERY_INVARIANT_SEVERITY.WARNING]:
    STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
});

const RECOVERY_ADMISSION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    state: STATE_MACHINE_PRESSURE_POINT_STATE.OPEN,
    issueId: PRESSURE_PREFLIGHT_ISSUE_ID.RECOVERY_ADMISSION_OPEN,
    message: PRESSURE_PREFLIGHT_MESSAGE.RECOVERY_ADMISSION_OPEN,
    matches: (evidence) =>
      evidence.available === true &&
      (
        evidence.prioritySpreadPending === true ||
        evidence.blockedPartitionCount > NUM.ZERO ||
        evidence.unresolvedPartitionCount > NUM.ZERO
      ),
  }),
  Object.freeze({
    state: STATE_MACHINE_PRESSURE_POINT_STATE.CLOSED,
    issueId: EMPTY_TEXT,
    message: EMPTY_TEXT,
    matches: (evidence) =>
      evidence.available === true &&
      evidence.prioritySpreadPending !== true &&
      evidence.blockedPartitionCount === NUM.ZERO &&
      evidence.unresolvedPartitionCount === NUM.ZERO,
  }),
]);

const DEFAULT_RECOVERY_ADMISSION_DECISION = Object.freeze({
  state: STATE_MACHINE_PRESSURE_POINT_STATE.UNAVAILABLE,
  issueId: EMPTY_TEXT,
  message: EMPTY_TEXT,
});

const OPERATION_DRAIN_REASON_ISSUE = Object.freeze({
  [POST_REBALANCE_CLOSURE_REASON.IN_FLIGHT_REPLICA_OPERATIONS]:
    PRESSURE_PREFLIGHT_ISSUE_ID.OPERATION_DRAIN_OPEN,
});

const MEMBERSHIP_TRIM_REASON_ISSUE = Object.freeze({
  [POST_REBALANCE_CLOSURE_REASON.PUBLISHED_MEMBERSHIP_TRIM_DEBT]:
    PRESSURE_PREFLIGHT_ISSUE_ID.MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN,
  [POST_REBALANCE_CLOSURE_REASON.CURRENT_OVERTARGET_VOTERS]:
    PRESSURE_PREFLIGHT_ISSUE_ID.MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN,
});

const NO_OVER_TARGET_REASON_ISSUE = Object.freeze({
  [POST_REBALANCE_CLOSURE_REASON.OVERTARGET_BUDGET_EXCEEDED]:
    PRESSURE_PREFLIGHT_ISSUE_ID.OVERTARGET_WITH_CLOSED_DRAIN,
  [POST_REBALANCE_CLOSURE_REASON.CURRENT_OVERTARGET_VOTERS]:
    PRESSURE_PREFLIGHT_ISSUE_ID.OVERTARGET_WITH_CLOSED_DRAIN,
});

const CDC_PROJECTION_REASON_ISSUE = Object.freeze({
  [POST_REBALANCE_CLOSURE_REASON.CDC_PROJECTION_UNAVAILABLE]:
    PRESSURE_PREFLIGHT_ISSUE_ID.CDC_PROJECTION_OPEN,
  [POST_REBALANCE_CLOSURE_REASON.MISSING_PARTITION_LEADERS]:
    PRESSURE_PREFLIGHT_ISSUE_ID.CDC_PROJECTION_OPEN,
});

const ISSUE_MESSAGE_BY_ID = Object.freeze({
  [PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_PUBLISHED_WITH_PENDING_ACK]:
    PRESSURE_PREFLIGHT_MESSAGE.PUBLICATION_PUBLISHED_WITH_PENDING_ACK,
  [PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_ACK_COMPLETE_NON_TERMINAL]:
    PRESSURE_PREFLIGHT_MESSAGE.PUBLICATION_ACK_COMPLETE_NON_TERMINAL,
  [PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_ACK_PENDING]:
    PRESSURE_PREFLIGHT_MESSAGE.PUBLICATION_ACK_PENDING,
  [PRESSURE_PREFLIGHT_ISSUE_ID.PUBLICATION_MISSING_PUBLISHED_MEMBERS]:
    PRESSURE_PREFLIGHT_MESSAGE.PUBLICATION_MISSING_PUBLISHED_MEMBERS,
  [PRESSURE_PREFLIGHT_ISSUE_ID.OPERATION_DRAIN_OPEN]:
    PRESSURE_PREFLIGHT_MESSAGE.OPERATION_DRAIN_OPEN,
  [PRESSURE_PREFLIGHT_ISSUE_ID.MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN]:
    PRESSURE_PREFLIGHT_MESSAGE.MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN,
  [PRESSURE_PREFLIGHT_ISSUE_ID.OVERTARGET_WITH_CLOSED_DRAIN]:
    PRESSURE_PREFLIGHT_MESSAGE.OVERTARGET_WITH_CLOSED_DRAIN,
  [PRESSURE_PREFLIGHT_ISSUE_ID.CDC_PROJECTION_OPEN]:
    PRESSURE_PREFLIGHT_MESSAGE.CDC_PROJECTION_OPEN,
});

const DEFAULT_PRESSURE_PARTITIONS = Object.freeze([
  CONTROL_PLANE_PUBLICATIONS_PARTITION,
  REPLICA_OPERATIONS_PARTITION,
  SQL_TRANSACTION_PARTICIPANTS_PARTITION,
]);

function normalizeObject(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value) ?
    value :
    EMPTY_RECORD;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : EMPTY_LIST;
}

function normalizeString(value) {
  return String(value || EMPTY_TEXT).trim();
}

function normalizeUpperString(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeNonNegativeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
}

function normalizeStringList(values) {
  const candidateValues = values instanceof Set ?
    Array.from(values) :
    normalizeArray(values);
  return [
    ...new Set(
      candidateValues
        .map((value) => normalizeString(value))
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function firstObject(candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeObject(candidate);
    if (normalized !== EMPTY_RECORD) {
      return normalized;
    }
  }
  return EMPTY_RECORD;
}

function extractDiagnosticsEnvelope(input = EMPTY_RECORD) {
  const root = normalizeObject(input);
  const details = normalizeObject(root[DIAGNOSTICS_DETAILS_FIELD]);
  return firstObject([
    details[DIAGNOSTICS_FIELD],
    root[DIAGNOSTICS_FIELD],
    root,
  ]);
}

function extractScenarioDiagnostics(input = EMPTY_RECORD) {
  const root = normalizeObject(input);
  if (Array.isArray(root[SCENARIOS_FIELD])) {
    return root[SCENARIOS_FIELD]
      .map((scenario) => extractDiagnosticsEnvelope(scenario))
      .filter((diagnostics) => diagnostics !== EMPTY_RECORD);
  }
  const diagnostics = extractDiagnosticsEnvelope(root);
  return diagnostics === EMPTY_RECORD ? EMPTY_LIST : [diagnostics];
}

function extractControlPlaneDiagnostics(diagnostics) {
  const direct = normalizeObject(diagnostics[CONTROL_PLANE_DIAGNOSTICS_FIELD]);
  const postRebalanceClosure = normalizeObject(
    diagnostics[POST_REBALANCE_CLOSURE_FIELD],
  );
  const closureDimensions = normalizeObject(
    postRebalanceClosure[DIMENSIONS_FIELD],
  );
  const operationDrainDimension = normalizeObject(
    closureDimensions[POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN],
  );
  const closureEvidence = normalizeObject(
    operationDrainDimension[EVIDENCE_FIELD],
  );
  return firstObject([
    direct,
    closureEvidence[CONTROL_PLANE_DIAGNOSTICS_FIELD],
  ]);
}

function extractPublicationConvergence(diagnostics) {
  const controlPlaneDiagnostics = extractControlPlaneDiagnostics(diagnostics);
  return firstObject([
    diagnostics[PUBLICATION_CONVERGENCE_FIELD],
    controlPlaneDiagnostics[PUBLICATION_CONVERGENCE_FIELD],
    diagnostics[PRIORITY_RECOVERY_OBSERVATION_FIELD],
  ]);
}

function extractPublicationActiveGateProgress(publication) {
  const activeGate = normalizeObject(publication[ACTIVE_GATE_FIELD]);
  return firstObject([
    activeGate[PROGRESS_FIELD],
    publication[ACTIVE_GATE_PROGRESS_FIELD],
    activeGate[BEST_PROGRESS_FIELD],
  ]);
}

function normalizePublicationEvidence(diagnostics) {
  const publication = extractPublicationConvergence(diagnostics);
  const activeGateProgress = extractPublicationActiveGateProgress(publication);
  const pendingAckNodeIds = normalizeStringList(
    publication[PENDING_ACK_NODE_IDS_FIELD],
  );
  const requiredAckNodeIds = normalizeStringList(
    publication[REQUIRED_ACK_NODE_IDS_FIELD],
  );
  const acknowledgedNodeIds = normalizeStringList(
    publication[ACKNOWLEDGED_NODE_IDS_FIELD],
  );
  const activeGatePendingAckCount = normalizeNonNegativeInteger(
    activeGateProgress[PENDING_ACK_COUNT_FIELD],
  );
  const pendingAckCount = Math.max(
    pendingAckNodeIds.length,
    normalizeNonNegativeInteger(publication[PENDING_ACK_COUNT_FIELD]),
    activeGatePendingAckCount,
  );
  const missingPublishedNodeIds = normalizeStringList(
    publication[MISSING_PUBLISHED_NODE_IDS_FIELD] ||
      activeGateProgress[SELECTED_MISSING_PUBLISHED_NODE_IDS_FIELD],
  );
  const missingPublishedCount = Math.max(
    missingPublishedNodeIds.length,
    normalizeNonNegativeInteger(publication[MISSING_PUBLISHED_COUNT_FIELD]),
    normalizeNonNegativeInteger(
      activeGateProgress[MISSING_PUBLISHED_COUNT_FIELD],
    ),
  );
  const status = normalizeUpperString(
    publication[PUBLICATION_STATUS_FIELD] ||
      publication[STATUS_FIELD] ||
      activeGateProgress[PUBLICATION_STATUS_FIELD],
  );

  return {
    available:
      publication !== EMPTY_RECORD ||
      diagnostics[PUBLICATION_AVAILABLE_FIELD] === true,
    status,
    pendingAckCount,
    requiredAckCount: requiredAckNodeIds.length,
    acknowledgedAckCount: acknowledgedNodeIds.length,
    pendingAckNodeIds,
    missingPublishedCount,
    missingPublishedNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
  };
}

function getGrammarEntry(pressurePointId) {
  return STATE_MACHINE_PRESSURE_POINT_GRAMMAR.find(
    (entry) => entry.id === pressurePointId,
  ) || EMPTY_RECORD;
}

function buildIssue({
  issueId,
  severity,
  pressurePointId,
  message,
  evidence = EMPTY_RECORD,
  snapshotId = DEFAULT_SNAPSHOT_SCOPE_ID,
}) {
  return {
    [ISSUE_ID_FIELD]: issueId,
    [SEVERITY_FIELD]: severity,
    [PRESSURE_POINT_FIELD]: pressurePointId,
    [MESSAGE_FIELD]: message,
    [SNAPSHOT_ID_FIELD]: snapshotId,
    [EVIDENCE_FIELD]: evidence,
  };
}

function buildPressurePointResult({
  pressurePointId,
  state,
  reasonCodes = EMPTY_LIST,
  evidence = EMPTY_RECORD,
  issues = EMPTY_LIST,
}) {
  const grammar = getGrammarEntry(pressurePointId);
  return {
    id: pressurePointId,
    state,
    [OWNER_FIELD]: grammar[OWNER_FIELD] || EMPTY_TEXT,
    [PRODUCER_FIELD]: grammar[PRODUCER_FIELD] || EMPTY_TEXT,
    [WITNESS_FIELD]: grammar[WITNESS_FIELD] || EMPTY_TEXT,
    [RETRY_FIELD]: grammar[RETRY_FIELD] || EMPTY_TEXT,
    [ESCALATION_FIELD]: grammar[ESCALATION_FIELD] || EMPTY_TEXT,
    [CONSUMER_FIELD]: grammar[CONSUMER_FIELD] || EMPTY_TEXT,
    [REASON_CODES_FIELD]: normalizeStringList(reasonCodes),
    [EVIDENCE_FIELD]: evidence,
    [ISSUES_FIELD]: issues,
  };
}

function resolvePublicationPressureState(machineDecision) {
  if (machineDecision.invariantBreaches.some((breach) =>
    breach.severity === PUBLICATION_RECOVERY_INVARIANT_SEVERITY.FAILURE,
  )) {
    return STATE_MACHINE_PRESSURE_POINT_STATE.FAILED;
  }
  return PUBLICATION_MACHINE_ACTION_PRESSURE_STATE[machineDecision.action] ||
    STATE_MACHINE_PRESSURE_POINT_STATE.OPEN;
}

function buildPublicationInvariantIssues(machineDecision, evidence, snapshotId) {
  return machineDecision.invariantBreaches.map((breach) =>
    buildIssue({
      issueId: breach.id,
      severity:
        PUBLICATION_INVARIANT_SEVERITY_MAP[breach.severity] ||
        STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.PUBLICATION_CONVERGENCE,
      message: ISSUE_MESSAGE_BY_ID[breach.id] || breach.id,
      evidence: {
        ...evidence,
        satisfiedFlagIds: machineDecision.satisfiedFlagIds,
      },
      snapshotId,
    }),
  );
}

function resolvePublicationOpenIssueId(machineDecision) {
  return PUBLICATION_RECOVERY_REASON_ISSUE_ID[machineDecision.reasonCode] ||
    PUBLICATION_MACHINE_ACTION_ISSUE_ID[machineDecision.action] ||
    EMPTY_TEXT;
}

function evaluatePublicationPoint(diagnostics, snapshotId) {
  const evidence = normalizePublicationEvidence(diagnostics);
  const machineDecision = evaluatePublicationRecoveryMachine({
    ...evidence,
    context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
  });
  const invariantIssues = buildPublicationInvariantIssues(
    machineDecision,
    evidence,
    snapshotId,
  );
  const openIssueId = invariantIssues.length === NUM.ZERO ?
    resolvePublicationOpenIssueId(machineDecision) :
    EMPTY_TEXT;
  const openIssues = openIssueId.length > NUM.ZERO ?
    [buildIssue({
      issueId: openIssueId,
      severity: STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.PUBLICATION_CONVERGENCE,
      message: ISSUE_MESSAGE_BY_ID[openIssueId] || openIssueId,
      evidence,
      snapshotId,
    })] :
    EMPTY_LIST;
  const issues = [
    ...invariantIssues,
    ...openIssues,
  ];
  return buildPressurePointResult({
    pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.PUBLICATION_CONVERGENCE,
    state: resolvePublicationPressureState(machineDecision),
    reasonCodes: issues.map((issue) => issue[ISSUE_ID_FIELD]),
    evidence: {
      ...evidence,
      machineAction: machineDecision.action,
      transitionId: machineDecision.transitionId,
      satisfiedFlagIds: machineDecision.satisfiedFlagIds,
      livenessObligations:
        machineDecision.livenessObligations.map((obligation) => obligation.id),
    },
    issues,
  });
}

function extractPostRebalanceClosure(diagnostics) {
  return normalizeObject(diagnostics[POST_REBALANCE_CLOSURE_FIELD]);
}

function extractClosureDimension(diagnostics, dimension) {
  const closureDimensions = normalizeObject(
    extractPostRebalanceClosure(diagnostics)[DIMENSIONS_FIELD],
  );
  return normalizeObject(closureDimensions[dimension]);
}

function resolveClosurePressurePointState(closureDimension) {
  const closureState = normalizeString(closureDimension[STATE_FIELD]);
  return CLOSURE_DIMENSION_STATE_MAP[closureState] ||
    STATE_MACHINE_PRESSURE_POINT_STATE.UNAVAILABLE;
}

function buildClosureDimensionIssues({
  pressurePointId,
  closureDimension,
  reasonIssueMap,
  snapshotId,
}) {
  const reasonCodes = normalizeStringList(closureDimension[REASON_CODES_FIELD]);
  if (resolveClosurePressurePointState(closureDimension) !==
      STATE_MACHINE_PRESSURE_POINT_STATE.OPEN) {
    return EMPTY_LIST;
  }
  return reasonCodes
    .map((reasonCode) => reasonIssueMap[reasonCode] || EMPTY_TEXT)
    .filter((issueId) => issueId.length > NUM.ZERO)
    .map((issueId) => buildIssue({
      issueId,
      severity: STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
      pressurePointId,
      message: ISSUE_MESSAGE_BY_ID[issueId] || issueId,
      evidence: {
        reasonCodes,
        closureState: normalizeString(closureDimension[STATE_FIELD]),
      },
      snapshotId,
    }));
}

function evaluateClosureDimensionPoint({
  diagnostics,
  snapshotId,
  pressurePointId,
  dimension,
  reasonIssueMap,
}) {
  const closureDimension = extractClosureDimension(diagnostics, dimension);
  const state = resolveClosurePressurePointState(closureDimension);
  const issues = buildClosureDimensionIssues({
    pressurePointId,
    closureDimension,
    reasonIssueMap,
    snapshotId,
  });
  return buildPressurePointResult({
    pressurePointId,
    state,
    reasonCodes: normalizeStringList(closureDimension[REASON_CODES_FIELD]),
    evidence: normalizeObject(closureDimension[EVIDENCE_FIELD]),
    issues,
  });
}

function normalizeReplicaOperationRows(diagnostics) {
  return normalizeArray(diagnostics[REPLICA_OPERATION_ROWS_FIELD]);
}

function hasCompletedAt(row) {
  return Number.isFinite(Number(row?.[COMPLETED_AT_FIELD])) ||
    Number.isFinite(Number(row?.[COMPLETED_AT_SNAKE_FIELD]));
}

function extractOperationId(row) {
  return normalizeString(
    row?.[OPERATION_ID_FIELD] || row?.[OPERATION_ID_SNAKE_FIELD],
  );
}

function isCompletedActiveReplicaOperation(row) {
  return normalizeString(row?.[REPLICA_OPERATION_STATUS_FIELD]) ===
    REPLICA_OPERATION_STATUS.ACTIVE &&
    hasCompletedAt(row) &&
    normalizeString(row?.[SEMANTIC_PHASE_FIELD]) !==
      REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED;
}

function buildCompletedActiveOperationIssues(rows, snapshotId) {
  return rows
    .filter((row) => isCompletedActiveReplicaOperation(row))
    .map((row) => buildIssue({
      issueId: PRESSURE_PREFLIGHT_ISSUE_ID.COMPLETED_ACTIVE_OPERATION_ROW,
      severity: STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.OPERATION_DRAIN,
      message: PRESSURE_PREFLIGHT_MESSAGE.COMPLETED_ACTIVE_OPERATION_ROW,
      evidence: {
        operationId: extractOperationId(row),
        type: normalizeString(row?.[REPLICA_OPERATION_TYPE_FIELD]),
        status: normalizeString(row?.[REPLICA_OPERATION_STATUS_FIELD]),
        workflowStep: normalizeString(
          row?.[WORKFLOW_STEP_FIELD] || row?.[WORKFLOW_STEP_SNAKE_FIELD],
        ),
      },
      snapshotId,
    }));
}

function evaluateOperationDrainPoint(diagnostics, snapshotId) {
  const closurePoint = evaluateClosureDimensionPoint({
    diagnostics,
    snapshotId,
    pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.OPERATION_DRAIN,
    dimension: POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN,
    reasonIssueMap: OPERATION_DRAIN_REASON_ISSUE,
  });
  const rows = normalizeReplicaOperationRows(diagnostics);
  const liveness = summarizeReplicaOperationLiveness(rows);
  const completedActiveIssues = buildCompletedActiveOperationIssues(
    liveness.rows,
    snapshotId,
  );
  const issues = [
    ...closurePoint[ISSUES_FIELD],
    ...completedActiveIssues,
  ];
  const state = closurePoint.state === STATE_MACHINE_PRESSURE_POINT_STATE.CLOSED &&
    completedActiveIssues.length > NUM.ZERO ?
    STATE_MACHINE_PRESSURE_POINT_STATE.WARNING :
    closurePoint.state;
  return {
    ...closurePoint,
    state,
    [EVIDENCE_FIELD]: {
      ...closurePoint[EVIDENCE_FIELD],
      liveness: {
        inFlightCount: liveness.inFlightCount,
        staleInFlightCount: liveness.staleInFlightCount,
        statusHistogram: liveness.statusHistogram,
        semanticPhaseHistogram: liveness.semanticPhaseHistogram,
      },
    },
    [ISSUES_FIELD]: issues,
    [REASON_CODES_FIELD]: normalizeStringList([
      ...closurePoint[REASON_CODES_FIELD],
      ...completedActiveIssues.map((issue) => issue[ISSUE_ID_FIELD]),
    ]),
  };
}

function extractStepsHistory(row) {
  const rawStepsHistory =
    row?.[STEPS_HISTORY_FIELD] || row?.[STEPS_HISTORY_SNAKE_FIELD];
  if (Array.isArray(rawStepsHistory)) {
    return rawStepsHistory;
  }
  if (typeof rawStepsHistory !== TYPEOF.STRING) {
    return EMPTY_LIST;
  }
  try {
    const parsed = JSON.parse(rawStepsHistory);
    return Array.isArray(parsed) ? parsed : EMPTY_LIST;
  } catch (_error) {
    return EMPTY_LIST;
  }
}

function containsReplacementLeaderStallFragment(value) {
  const normalized = normalizeString(value).toLowerCase();
  return Object.values(REPLACEMENT_LEADER_STALL_FRAGMENT).some((fragment) =>
    normalized.includes(fragment.toLowerCase()),
  );
}

function countReplacementLeaderStallEvidence(diagnostics) {
  const rows = normalizeReplicaOperationRows(diagnostics);
  const operationHistory = normalizeArray(diagnostics[OPERATION_HISTORY_FIELD]);
  const rootError = normalizeString(diagnostics[ERROR_FIELD]);
  const rootCauseBundle = normalizeObject(diagnostics[ROOT_CAUSE_BUNDLE_FIELD]);
  const rootSnapshots = normalizeObject(
    rootCauseBundle[ROOT_CAUSE_SNAPSHOTS_FIELD],
  );
  const rowEvidenceCount = rows.filter((row) =>
    extractStepsHistory(row).some((step) =>
      containsReplacementLeaderStallFragment(step?.[STEP_REASON_FIELD]),
    ),
  ).length;
  const operationHistoryCount = operationHistory.filter((entry) =>
    containsReplacementLeaderStallFragment(JSON.stringify(entry)),
  ).length;
  const rootSnapshotCount = Object.values(rootSnapshots).filter((snapshot) => {
    const controlPlane = normalizeObject(snapshot)[ROOT_CAUSE_CONTROL_PLANE_FIELD];
    return containsReplacementLeaderStallFragment(JSON.stringify(controlPlane));
  }).length;
  const errorCount = containsReplacementLeaderStallFragment(rootError) ?
    NUM.ONE :
    NUM.ZERO;
  return rowEvidenceCount + operationHistoryCount + rootSnapshotCount + errorCount;
}

function evaluateReplacementLeaderOwnershipPoint(diagnostics, snapshotId) {
  const stalledEvidenceCount = countReplacementLeaderStallEvidence(diagnostics);
  const state = stalledEvidenceCount > NUM.ZERO ?
    STATE_MACHINE_PRESSURE_POINT_STATE.OPEN :
    STATE_MACHINE_PRESSURE_POINT_STATE.UNAVAILABLE;
  const evidence = {stalledEvidenceCount};
  const issues = stalledEvidenceCount > NUM.ZERO ?
    [buildIssue({
      issueId: PRESSURE_PREFLIGHT_ISSUE_ID.REPLACEMENT_LEADER_HANDOFF_STALLED,
      severity: STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
      pressurePointId:
        STATE_MACHINE_PRESSURE_POINT_ID.REPLACEMENT_LEADER_OWNERSHIP,
      message: PRESSURE_PREFLIGHT_MESSAGE.REPLACEMENT_LEADER_HANDOFF_STALLED,
      evidence,
      snapshotId,
    })] :
    EMPTY_LIST;
  return buildPressurePointResult({
    pressurePointId:
      STATE_MACHINE_PRESSURE_POINT_ID.REPLACEMENT_LEADER_OWNERSHIP,
    state,
    reasonCodes: issues.map((issue) => issue[ISSUE_ID_FIELD]),
    evidence,
    issues,
  });
}

function normalizePriorityRecoveryEvidence(diagnostics) {
  const observation = normalizeObject(
    diagnostics[PRIORITY_RECOVERY_OBSERVATION_FIELD],
  );
  return {
    available: observation !== EMPTY_RECORD,
    prioritySpreadPending:
      observation.prioritySpreadPending === true,
    blockedPartitionCount: normalizeNonNegativeInteger(
      observation.priorityRecoveryBlockedPartitionCount,
    ),
    unresolvedPartitionCount: normalizeNonNegativeInteger(
      observation.priorityRecoveryUnresolvedPartitionCount,
    ),
    defaultPressurePartitions: DEFAULT_PRESSURE_PARTITIONS,
  };
}

function evaluateRecoveryAdmissionPoint(diagnostics, snapshotId) {
  const evidence = normalizePriorityRecoveryEvidence(diagnostics);
  const decision =
    RECOVERY_ADMISSION_DECISION_TABLE.find((entry) => entry.matches(evidence)) ||
    DEFAULT_RECOVERY_ADMISSION_DECISION;
  const issues = decision[ISSUE_ID_FIELD] ?
    [buildIssue({
      issueId: decision[ISSUE_ID_FIELD],
      severity: STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.RECOVERY_ADMISSION,
      message: decision[MESSAGE_FIELD],
      evidence,
      snapshotId,
    })] :
    EMPTY_LIST;
  return buildPressurePointResult({
    pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.RECOVERY_ADMISSION,
    state: decision[STATE_FIELD],
    reasonCodes: issues.map((issue) => issue[ISSUE_ID_FIELD]),
    evidence,
    issues,
  });
}

function evaluateStateMachinePressureSnapshot(
  diagnostics,
  snapshotId = DEFAULT_SNAPSHOT_SCOPE_ID,
) {
  const normalizedDiagnostics = extractDiagnosticsEnvelope(diagnostics);
  const pressurePoints = [
    evaluatePublicationPoint(normalizedDiagnostics, snapshotId),
    evaluateOperationDrainPoint(normalizedDiagnostics, snapshotId),
    evaluateClosureDimensionPoint({
      diagnostics: normalizedDiagnostics,
      snapshotId,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.MEMBERSHIP_TRIM,
      dimension: POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
      reasonIssueMap: MEMBERSHIP_TRIM_REASON_ISSUE,
    }),
    evaluateClosureDimensionPoint({
      diagnostics: normalizedDiagnostics,
      snapshotId,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.NO_OVER_TARGET,
      dimension: POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET,
      reasonIssueMap: NO_OVER_TARGET_REASON_ISSUE,
    }),
    evaluateReplacementLeaderOwnershipPoint(normalizedDiagnostics, snapshotId),
    evaluateRecoveryAdmissionPoint(normalizedDiagnostics, snapshotId),
    evaluateClosureDimensionPoint({
      diagnostics: normalizedDiagnostics,
      snapshotId,
      pressurePointId: STATE_MACHINE_PRESSURE_POINT_ID.CDC_PROJECTION_VISIBLE,
      dimension: POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE,
      reasonIssueMap: CDC_PROJECTION_REASON_ISSUE,
    }),
  ];
  const issues = pressurePoints.flatMap((point) => point[ISSUES_FIELD]);
  return {
    [SNAPSHOT_ID_FIELD]: snapshotId,
    [PRESSURE_POINTS_FIELD]: pressurePoints,
    [ISSUES_FIELD]: issues,
  };
}

function buildStaticObligationIssue(pressurePointId, missingField) {
  return buildIssue({
    issueId: PRESSURE_PREFLIGHT_ISSUE_ID.MISSING_STATIC_OBLIGATION,
    severity: STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.FAILURE,
    pressurePointId,
    message: PRESSURE_PREFLIGHT_MESSAGE.MISSING_STATIC_OBLIGATION,
    evidence: {[MISSING_FIELD]: missingField},
    snapshotId: DIRECT_STATIC_SCOPE_ID,
  });
}

function evaluateStaticPressurePointGrammar(
  grammar = STATE_MACHINE_PRESSURE_POINT_GRAMMAR,
) {
  const issues = [];
  for (const point of grammar) {
    const pressurePointId = normalizeString(point.id);
    for (const field of STATE_MACHINE_PRESSURE_STATIC_FIELDS) {
      if (normalizeString(point[field]).length === NUM.ZERO) {
        issues.push(buildStaticObligationIssue(pressurePointId, field));
      }
    }
  }
  return {
    [CHECKED_POINT_COUNT_FIELD]: grammar.length,
    [ISSUES_FIELD]: issues,
    [READY_FIELD]: issues.length === NUM.ZERO,
  };
}

function countIssuesBySeverity(issues, severity) {
  return issues.filter((issue) => issue[SEVERITY_FIELD] === severity).length;
}

function resolvePreflightState(hardIssueCount, warningIssueCount) {
  if (hardIssueCount > NUM.ZERO) {
    return STATE_MACHINE_PRESSURE_PREFLIGHT_STATE.FAILED;
  }
  if (warningIssueCount > NUM.ZERO) {
    return STATE_MACHINE_PRESSURE_PREFLIGHT_STATE.WARNING;
  }
  return STATE_MACHINE_PRESSURE_PREFLIGHT_STATE.PASS;
}

function runStateMachinePressurePreflight(options = EMPTY_RECORD) {
  const staticGrammar = evaluateStaticPressurePointGrammar(
    options.grammar || STATE_MACHINE_PRESSURE_POINT_GRAMMAR,
  );
  const reportSource = normalizeObject(options.report);
  const diagnosticsSource = normalizeObject(options.diagnostics);
  const hasReportSource = Object.keys(reportSource).length > NUM.ZERO;
  const hasDiagnosticsSource = Object.keys(diagnosticsSource).length > NUM.ZERO;
  const diagnosticsSnapshots = Array.isArray(options.diagnosticsSnapshots) ?
    options.diagnosticsSnapshots :
    hasReportSource ?
      extractScenarioDiagnostics(reportSource) :
      hasDiagnosticsSource ?
        extractScenarioDiagnostics(diagnosticsSource) :
        EMPTY_LIST;
  const snapshots = diagnosticsSnapshots.map((diagnostics, index) =>
    evaluateStateMachinePressureSnapshot(
      diagnostics,
      DEFAULT_SNAPSHOT_SCOPE_ID + '-' + String(index + NUM.ONE),
    ),
  );
  const issues = [
    ...staticGrammar[ISSUES_FIELD],
    ...snapshots.flatMap((snapshot) => snapshot[ISSUES_FIELD]),
  ];
  const hardIssueCount = countIssuesBySeverity(
    issues,
    STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.FAILURE,
  );
  const warningIssueCount = countIssuesBySeverity(
    issues,
    STATE_MACHINE_PRESSURE_ISSUE_SEVERITY.WARNING,
  );
  const resultState = resolvePreflightState(hardIssueCount, warningIssueCount);
  return {
    [RESULT_STATE_FIELD]: resultState,
    [READY_FIELD]: hardIssueCount === NUM.ZERO,
    [STATIC_GRAMMAR_FIELD]: staticGrammar,
    [SNAPSHOTS_FIELD]: snapshots,
    [ISSUES_FIELD]: issues,
    [HARD_ISSUE_COUNT_FIELD]: hardIssueCount,
    [WARNING_ISSUE_COUNT_FIELD]: warningIssueCount,
  };
}

function formatStateMachinePressurePreflightSummary(result) {
  const preflight = normalizeObject(result);
  const lines = [
    STATE_MACHINE_PRESSURE_PREFLIGHT_LABEL +
      SUMMARY_SEPARATOR +
      normalizeString(preflight[RESULT_STATE_FIELD]) +
      SUMMARY_READY_PREFIX +
      String(preflight[READY_FIELD] === true) +
      SUMMARY_STATIC_PREFIX +
      String(
        normalizeNonNegativeInteger(
          preflight[STATIC_GRAMMAR_FIELD]?.[CHECKED_POINT_COUNT_FIELD],
        ),
      ) +
      SUMMARY_SNAPSHOT_PREFIX +
      String(normalizeArray(preflight[SNAPSHOTS_FIELD]).length) +
      SUMMARY_SEPARATOR +
      SUMMARY_COUNT_PREFIX +
      String(normalizeArray(preflight[ISSUES_FIELD]).length),
  ];
  for (const issue of normalizeArray(preflight[ISSUES_FIELD])) {
    lines.push(
      SUMMARY_ISSUE_PREFIX +
      normalizeString(issue[SEVERITY_FIELD]) +
      SUMMARY_ISSUE_JOINER +
      normalizeString(issue[PRESSURE_POINT_FIELD]) +
      SUMMARY_ISSUE_JOINER +
      normalizeString(issue[ISSUE_ID_FIELD]) +
      SUMMARY_SEPARATOR +
      normalizeString(issue[MESSAGE_FIELD]),
    );
  }
  return lines.join(SUMMARY_NEWLINE);
}

export {
  PRESSURE_PREFLIGHT_ISSUE_ID,
  PUBLICATION_RECOVERY_MACHINE_SPEC,
  STATE_MACHINE_PRESSURE_ISSUE_SEVERITY,
  STATE_MACHINE_PRESSURE_POINT_GRAMMAR,
  STATE_MACHINE_PRESSURE_POINT_ID,
  STATE_MACHINE_PRESSURE_POINT_STATE,
  STATE_MACHINE_PRESSURE_PREFLIGHT_STATE,
  evaluateStateMachinePressureSnapshot,
  evaluateStaticPressurePointGrammar,
  extractScenarioDiagnostics,
  formatStateMachinePressurePreflightSummary,
  runStateMachinePressurePreflight,
};
