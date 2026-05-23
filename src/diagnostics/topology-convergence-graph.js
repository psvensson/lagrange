/**
 * Read-only topology convergence diagnostic graph builder.
 *
 * The graph is derived from parsed failure-bundle, triage-summary, or report
 * artifacts. It does not mutate runtime state or reinterpret owner decisions.
 */
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  buildPublicationActiveGateHandoffContract,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {
  buildOperationProgressCompatibilityProjection,
} from '../rebalancer/operation-progress-observer.js';
import {
  FAILURE_CLASS as CAUSAL_FAILURE_CLASS,
} from './causal-analysis-schema.js';

const ABSENT_VALUE = 'absent';
const UNKNOWN_VALUE = 'unknown';
const PATH_SEPARATOR = '.';
const LIST_SEPARATOR = ',';
const REASON_SEPARATOR = '|';
const SOURCE_ORDER_BASE = 0;
const FIRST_FRONTIER_INDEX = 0;
const TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST = Object.freeze([]);
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1 =
  'topology-convergence-graph-v1';
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_FIXTURE_V1 =
  'topology-convergence-replay-fixture-v1';
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_RESULT_V1 =
  'topology-convergence-replay-result-v1';
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_DECISION_TABLE_V1 =
  'topology-convergence-owner-decision-table-v1';
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GLOSSARY_V1 =
  'topology-convergence-owner-glossary-v1';
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_OWNER_PRESENTATION_V1 =
  'topology-convergence-owner-presentation-v1';
const TYPE_OBJECT = 'object';
const TYPE_STRING = 'string';
const BOOLEAN_TRUE_TEXT = 'true';
const BOOLEAN_FALSE_TEXT = 'false';
const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
const ROOT_CAUSE_CLASS_STARTUP = 'startup';
const ROOT_CAUSE_CLASS_UNKNOWN = 'unknown';
const OPERATION_PROGRESS_PROJECTION_UNAVAILABLE =
  'operation_progress_projection_unavailable';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_STATUS_OPEN = 'OPEN';
const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
const PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING =
  'publication_pending';
const PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';
const PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED = 'acknowledged';
const PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED = 'not_required';
const PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG = 'consumer_lag';
const PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER =
  'waiting_for_consumer';
const PUBLICATION_OWNER_REVISION_STATE_CURRENT = 'current';
const PUBLICATION_OWNER_STREAM_OUTCOME_STALE = 'stale';
const PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT = 'recovering_in_flight';
const PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN = 'event_driven';
const PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS =
  'wait_for_operation_progress';
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const ACTIVE_GATE_STATE_STALLED = 'stalled';
const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
const ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const READINESS_RECOVERABILITY_TERMINAL = 'terminal';
const READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL = 'no_progress_terminal';
const READINESS_FAILURE_CLASS_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
const READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS = 'stalled_no_progress';
const READINESS_SOURCE_UNKNOWN = 'unknown';
const READINESS_SOURCE_SELECTED_SNAPSHOT_ERROR = 'selectedSnapshotError';
const READINESS_CAUSE_NONE = 'none';
const READINESS_CAUSE_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
const TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_GRAPH = 'topology_convergence_graph';
const TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT =
  'topology_convergence_artifact';
const TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT_ABSENT = 'artifact_absent';
const PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS = 'progress';
const PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY = 'summary';
const PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES =
  'partition_witnesses';
const PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS =
  'topology_operator_witness';
const PRIORITY_RECOVERY_OBSERVATION_FIELD_WAIT_MODES = 'waitModes';
const PRIORITY_RECOVERY_OBSERVATION_FIELD_NEXT_REQUIRED_ACTIONS =
  'nextRequiredActions';
const PRIORITY_RECOVERY_OBSERVATION_FIELD_ACTUATION_STATES =
  'actuationStates';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED = 'planned';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_DISPATCHED = 'dispatched';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_OBSERVED = 'observed';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_RETRY_SCHEDULED =
  'retry_scheduled';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_BLOCKED = 'blocked';
const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL = 'terminal';
const TOPOLOGY_OPERATOR_WITNESS_FIELD_NAME = 'topologyOperatorWitness';
const SELECTED_SNAPSHOT_SOURCE_CAUSE_TIMEOUT =
  'selected_snapshot_source_timeout';
const SELECTED_SNAPSHOT_SOURCE_CAUSE_TRANSPORT_CLOSED =
  'selected_transport_closed';
const FORCED_REPAIR_SNAPSHOT_CAUSE_TIMEOUT =
  'forced_repair_snapshot_timeout';
const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_TIMEOUT =
  'authoritative_control_snapshot_query_timeout';
const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_PRESSURE =
  'authoritative_control_snapshot_query_pressure';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_SELECTED_SOURCE =
  'selected_snapshot_source_selection';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_FORCED_REPAIR =
  'forced_repair_path_stall';
const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY =
  'authoritative_control_snapshot_query_pressure';
const SELECTED_SNAPSHOT_ADMIN_QUERY_TIMEOUT_PREFIX =
  'Admin API query timed out for node ';
const SELECTED_SNAPSHOT_ADMIN_QUERY_FAILED_PREFIX =
  'Admin API query failed for node ';
const SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX =
  'Admin API query connection closed before response for node ';
const SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER = ' on lane ';
const SELECTED_SNAPSHOT_FORCED_REPAIR_FAILURE_FRAGMENT =
  'forced repair snapshot failed:';
const SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT =
  'Authoritative control snapshot repair failed:';
const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_TIMEOUT_FRAGMENT =
  'nodes:Query timeout after ';
const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_PARTICIPANT_FAILURE_FRAGMENT =
  'nodes:Distributed operation failed due to participant failures';
const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_FRAGMENT =
  'nodes:Connection to node ';
const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_SUFFIX =
  ' closed';
const SELECTED_SNAPSHOT_ADMIN_QUERY_NODE_ID_PREFIXES = Object.freeze([
  SELECTED_SNAPSHOT_ADMIN_QUERY_FAILED_PREFIX,
  SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX,
]);
const OWNER_QUEUE_DEPTH_STATE_OBSERVED = 'observed';

const EDGE_STATE = Object.freeze({
  SATISFIED: 'satisfied',
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
  RETRYABLE: 'retryable',
  TERMINAL_FAILED: 'terminal_failed',
  UNKNOWN: 'unknown',
});

const TOPOLOGY_OPERATOR_WITNESS_EDGE_STATE_BY_STEP = new Map([
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL, EDGE_STATE.SATISFIED],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_BLOCKED, EDGE_STATE.BLOCKED],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_RETRY_SCHEDULED, EDGE_STATE.RETRYABLE],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_DISPATCHED, EDGE_STATE.RETRYABLE],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED, EDGE_STATE.RETRYABLE],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_OBSERVED, EDGE_STATE.RETRYABLE],
]);

const NODE_ID = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'active_gate_snapshot_coverage',
  PRIORITY_RECOVERY_PROGRESS: 'priority_recovery_progress',
  READINESS_STARTUP_SUPPORT: 'readiness_startup_support',
  TOP_FAILURE_REASONS: 'top_failure_reasons',
});

const EDGE_ID = Object.freeze({
  PUBLICATION_ACK_CONVERGENCE: 'publication_ack_convergence',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'active_gate_snapshot_coverage',
  PRIORITY_RECOVERY_PARTITION_PROGRESS: 'priority_recovery_partition_progress',
  READINESS_STARTUP_SUPPORT: 'readiness_startup_support',
  TOP_FAILURE_REASONS: 'top_failure_reasons',
});

const OWNER = Object.freeze({
  TOPOLOGY_PUBLICATION: 'topology_publication_owner',
  ACTIVE_GATE: 'startup_active_gate_owner',
  PRIORITY_RECOVERY: 'operation_workflow_owner',
  READINESS: 'startup_readiness_owner',
  FAILURE_CLASSIFIER: 'failure_classifier_owner',
});

const BOUNDARY = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  SNAPSHOT_COVERAGE: 'snapshot_coverage',
  WORKFLOW_PROGRESS: 'workflow_progress',
  STARTUP_SUPPORT_EVIDENCE: 'startup_support_evidence',
  FAILURE_REASON_RANKING: 'failure_reason_ranking',
});

const PROJECTION_HINT = Object.freeze({
  PUBLICATION_ACK: 'publication ack convergence is already closed; inspect successor edges',
  SNAPSHOT_COVERAGE: 'after priority progress closes, expect active gate snapshot coverage',
  PRIORITY_RECOVERY: 'advance or classify the selected priority recovery operation workflow',
  READINESS: 'after coverage improves, expect startup readiness support evidence to clear',
  TOP_REASONS: 'compare top reason ranking after the dominant frontier edge clears',
  UNKNOWN: 'artifact lacks enough evidence; collect failure bundle and triage summary',
});

const REASON = Object.freeze({
  PUBLICATION_PUBLISHED: 'publication_published',
  PUBLICATION_PENDING: 'publication_pending',
  PENDING_ACKS: 'pending_acks_present',
  BLOCKED_NODES: 'blocked_publication_nodes_present',
  MISSING_PUBLISHED: 'missing_published_nodes_present',
  PRIORITY_SPREAD_PENDING: 'priority_spread_pending',
  OWNER_RECONCILE_PENDING:
    ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
  SNAPSHOT_COVERAGE_INCOMPLETE: 'snapshot_coverage_incomplete',
  SNAPSHOT_REPAIR_DEFERRED: 'snapshot_repair_deferred',
  SELECTED_SNAPSHOT_SOURCE_TIMEOUT:
    SELECTED_SNAPSHOT_SOURCE_CAUSE_TIMEOUT,
  SELECTED_SNAPSHOT_TRANSPORT_CLOSED:
    SELECTED_SNAPSHOT_SOURCE_CAUSE_TRANSPORT_CLOSED,
  FORCED_REPAIR_SNAPSHOT_TIMEOUT:
    FORCED_REPAIR_SNAPSHOT_CAUSE_TIMEOUT,
  AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT:
    AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_TIMEOUT,
  AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_PRESSURE:
    AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_PRESSURE,
  ACTIVE_GATE_TIMED_OUT: 'active_gate_timed_out',
  ACTIVE_GATE_READY: 'active_gate_ready',
  PRIORITY_RECOVERY_PROGRESS_BLOCKED: 'priority_recovery_progress_blocked',
  PRIORITY_RECOVERY_RETRYABLE: 'priority_recovery_event_driven_wait',
  PRIORITY_RECOVERY_SATISFIED: 'priority_recovery_satisfied',
  READINESS_TERMINAL: 'readiness_terminal',
  READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS:
    'readiness_inherited_active_gate_no_progress',
  READINESS_RETRYABLE: 'readiness_retryable',
  READINESS_SATISFIED: 'readiness_satisfied',
  TOP_FAILURES_PRESENT: 'top_failures_present',
  TOP_FAILURES_ABSENT: 'top_failures_absent',
  EVIDENCE_MISSING: 'evidence_missing',
});

const SOURCE_PATH = Object.freeze({
  FAILURE_BUNDLE: 'failureBundle',
  REPORT_FAILURE_BUNDLE: 'report.failureBundle',
  FAILURE_BUNDLE_PUBLICATION: 'failureBundle.publicationConvergence',
  FAILURE_BUNDLE_SUMMARY: 'failureBundle.summary',
  TRIAGE_PUBLICATION: 'triageSummary.publicationConvergence',
  TRIAGE_SUMMARY: 'triageSummary.summary',
  REPORT_SCENARIO: 'report.scenarios[0]',
  REPORT_SCENARIO_FAILURE_BUNDLE: 'report.scenarios[0].failureBundle',
  REPORT_SCENARIO_PUBLICATION: 'report.scenarios[0].publicationConvergence',
  REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION:
    'report.scenarios[0].priorityRecoveryObservation',
  REPORT_SCENARIO_READINESS_FAILURE: 'report.scenarios[0].readinessFailure',
  PRIORITY_RECOVERY_PROGRESS_CLASSES:
    'publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses',
  PRIORITY_RECOVERY_PROGRESS_SUMMARY:
    'publicationConvergence.priorityRecoveryProgressSummary',
  PRIORITY_RECOVERY_DOMINANT_WITNESS:
    'publicationConvergence.priorityRecoveryProgressSummary.dominantWitness',
  ACTIVE_GATE_PROGRESS: 'publicationConvergence.activeGate.progress',
  PUBLICATION_ACTIVE_GATE_HANDOFF:
    'publicationConvergence.publicationActiveGateHandoff',
  TOPOLOGY_OPERATOR_WITNESS:
    'publicationConvergence.priorityRecoveryProgressSummary.topologyOperatorWitness',
  READINESS_FAILURE: 'summary.readinessFailure',
  TOP_REASONS: 'summary.topReasons',
});

const SOURCE_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  ACTIVE_GATE_PROGRESS: 'activeGateProgress',
  BEST_PROGRESS: 'bestProgress',
  BLOCKING_BOUNDARY: 'blockingBoundary',
  BOUNDARY: 'boundary',
  CURRENT_OWNER: 'currentOwner',
  DOMINANT_REASON: 'dominantReason',
  DOMINANT_WITNESS: 'dominantWitness',
  PROGRESS: 'progress',
  PRIORITY_RECOVERY_PROGRESS_CLASSES: 'priorityRecoveryProgressClasses',
  PRIORITY_RECOVERY_PROGRESS_SUMMARY: 'priorityRecoveryProgressSummary',
  PRIORITY_RECOVERY_PARTITION_WITNESSES: 'priorityRecoveryPartitionWitnesses',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  TOPOLOGY_OPERATOR_WITNESS: TOPOLOGY_OPERATOR_WITNESS_FIELD_NAME,
  READINESS_FAILURE: 'readinessFailure',
  PARTITION_ID: 'partitionId',
  SEMANTIC_STATE_ID: 'semanticStateId',
  WAIT_MODE: 'waitMode',
  NEXT_REQUIRED_ACTION: 'nextRequiredAction',
  ACTUATION_STATE: 'actuationState',
  PROGRESS_CLASS_IDS: 'progressClassIds',
  BLOCKER_REASON_CODES: 'blockerReasonCodes',
  CURRENT_STEP_ID: 'currentStepId',
  CURRENT_STEP_STATE: 'currentStepState',
  DEADLINE_MS: 'deadlineMs',
  KIND: 'kind',
  LAST_OBSERVED_AT_MS: 'lastObservedAtMs',
  NEXT_ACTION: 'nextAction',
  OPERATOR_ID: 'operatorId',
  OWNER: 'owner',
  TARGET_NODE_ID: 'targetNodeId',
});

const OWNER_WITNESS_FIELD = Object.freeze({
  EDGE_ID: 'edgeId',
  OWNER: 'owner',
  BOUNDARY: 'boundary',
  STATE: 'state',
  FRONTIER_STATE: 'frontierState',
  DOMINANT_REASON: 'dominantReason',
  REASONS: 'reasons',
  EVIDENCE_PATH: 'evidencePath',
  SOURCE: 'source',
  ROOT_CAUSE_CLASS: 'rootCauseClass',
});

const EDGE_ROOT_CAUSE_CLASS = Object.freeze({
  [EDGE_ID.PUBLICATION_ACK_CONVERGENCE]: ROOT_CAUSE_CLASS_TOPOLOGY,
  [EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS]: ROOT_CAUSE_CLASS_TOPOLOGY,
  [EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE]: ROOT_CAUSE_CLASS_STARTUP,
  [EDGE_ID.READINESS_STARTUP_SUPPORT]: ROOT_CAUSE_CLASS_STARTUP,
  [EDGE_ID.TOP_FAILURE_REASONS]: ROOT_CAUSE_CLASS_UNKNOWN,
});

const OWNER_SUPPORTING_REASON_SET = Object.freeze(new Set([
  REASON.PUBLICATION_PUBLISHED,
  REASON.PUBLICATION_PENDING,
]));

const ACTIVE_GATE_SNAPSHOT_CAUSE_RULES = Object.freeze([
  Object.freeze({
    reason: REASON.SELECTED_SNAPSHOT_SOURCE_TIMEOUT,
    sourceField: 'selectedSnapshotSourceCause',
    cause: SELECTED_SNAPSHOT_SOURCE_CAUSE_TIMEOUT,
    matches: (evidence) => evidence.selectedSnapshotSourceTimeout === true,
  }),
  Object.freeze({
    reason: REASON.SELECTED_SNAPSHOT_TRANSPORT_CLOSED,
    sourceField: 'selectedSnapshotSourceCause',
    cause: SELECTED_SNAPSHOT_SOURCE_CAUSE_TRANSPORT_CLOSED,
    matches: (evidence) =>
      evidence.selectedSnapshotSourceTransportClosed === true,
  }),
  Object.freeze({
    reason: REASON.FORCED_REPAIR_SNAPSHOT_TIMEOUT,
    sourceField: 'forcedRepairSnapshotCause',
    cause: FORCED_REPAIR_SNAPSHOT_CAUSE_TIMEOUT,
    matches: (evidence) => evidence.forcedRepairSnapshotTimeout === true,
  }),
  Object.freeze({
    reason: REASON.AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_TIMEOUT,
    sourceField: 'authoritativeControlSnapshotQueryCause',
    cause: AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_TIMEOUT,
    matches: (evidence) =>
      evidence.authoritativeControlSnapshotQueryTimeout === true,
  }),
  Object.freeze({
    reason: REASON.AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_PRESSURE,
    sourceField: 'authoritativeControlSnapshotQueryCause',
    cause: AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_PRESSURE,
    matches: (evidence) =>
      evidence.authoritativeControlSnapshotQueryPressure === true,
  }),
]);

const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_RULES = Object.freeze([
  Object.freeze({
    ownerEdge: ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
    matches: (evidence) =>
      evidence.authoritativeControlSnapshotQueryTimeout === true ||
      evidence.authoritativeControlSnapshotQueryPressure === true,
  }),
  Object.freeze({
    ownerEdge: ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_FORCED_REPAIR,
    matches: (evidence) => evidence.forcedRepairSnapshotTimeout === true,
  }),
  Object.freeze({
    ownerEdge: ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_SELECTED_SOURCE,
    matches: (evidence) => evidence.selectedSnapshotSourceTimeout === true,
  }),
  Object.freeze({
    ownerEdge: ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_SELECTED_SOURCE,
    matches: (evidence) =>
      evidence.selectedSnapshotSourceTransportClosed === true,
  }),
]);

const PUBLICATION_PENDING_STATUS_SET = Object.freeze(new Set([
  PUBLICATION_STATUS_OPEN,
  PUBLICATION_STATUS_ACK_PENDING,
]));

const RANK = Object.freeze({
  PRIORITY_RECOVERY: 10,
  SNAPSHOT_COVERAGE: 20,
  READINESS: 30,
  PUBLICATION: 40,
  TOP_FAILURES: 50,
});

const SEMANTIC_STATE = Object.freeze({
  PRIORITY_RECOVERY_RECOVERING_IN_FLIGHT:
    PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  PRIORITY_RECOVERY_SPREAD_SATISFIED_IN_FLIGHT:
    PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
});

const PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
  ]));
const PRIORITY_RECOVERY_NON_BLOCKING_WITNESS_SEMANTIC_STATE_SET =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
  ]));

const READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_STATE_SET =
  Object.freeze(new Set([
    ACTIVE_GATE_STATE_TIMED_OUT,
    ACTIVE_GATE_STATE_STALLED,
  ]));

const DECISION_INPUT = Object.freeze({
  PUBLICATION_STATUS: 'publicationStatus',
  PENDING_ACK_COUNT: 'pendingAckCount',
  BLOCKED_NODE_COUNT: 'blockedNodeCount',
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  PRIORITY_SPREAD_PENDING: 'prioritySpreadPending',
  PRIORITY_BLOCKED_PARTITION_COUNT: 'priorityBlockedPartitionCount',
  UNRESOLVED_SEMANTIC_STATE_IDS: 'unresolvedSemanticStateIds',
  ACTIVE_GATE_READY: 'activeGate.ready',
  ACTIVE_GATE_STATE: 'activeGate.state',
  SNAPSHOT_COVERAGE_COMPLETE: 'snapshotCoverageComplete',
  READINESS_RECOVERABILITY: 'readiness.recoverability',
  TOP_REASONS: 'topReasons',
});

const DECISION_CONDITION = Object.freeze({
  PUBLICATION_PENDING_EVIDENCE: 'publication pending evidence is present',
  PUBLICATION_PENDING_ACKS: 'pending acknowledgement count is positive',
  PUBLICATION_BLOCKED_NODES: 'blocked publication node count is positive',
  PUBLICATION_MISSING_PUBLISHED_WITHOUT_PRIORITY_SPREAD:
    'missing published node evidence is present without priority spread pending',
  PUBLICATION_CLOSED: 'publication has no pending convergence blockers',
  PRIORITY_NO_UNRESOLVED_SEMANTIC_STATES:
    'priority recovery has no unresolved semantic states',
  PRIORITY_BLOCKED_PARTITIONS:
    'priority recovery has blocked partitions',
  PRIORITY_ONLY_RECOVERING_IN_FLIGHT:
    'priority recovery has only recovering_in_flight semantic state',
  PRIORITY_PARTITION_WITNESS_EVENT_DRIVEN_WAIT:
    'priority recovery partition witness has event-driven workflow wait',
  PRIORITY_RECOVERING_IN_FLIGHT:
    'priority recovery contains recovering_in_flight semantic state',
  PRIORITY_UNRESOLVED_WITHOUT_IN_FLIGHT:
    'priority recovery has unresolved semantic states without in-flight recovery',
  ACTIVE_GATE_READY_OR_COVERED:
    'active gate is ready or snapshot coverage is complete',
  ACTIVE_GATE_TIMED_OUT_INCOMPLETE:
    'active gate timed out before snapshot coverage completed',
  ACTIVE_GATE_PROGRESS_MISSING:
    'active gate progress evidence is missing',
  ACTIVE_GATE_COVERAGE_DEFERRED:
    'active gate progress exists but snapshot coverage is incomplete',
  READINESS_ACTIVE_GATE_READY: 'active gate readiness is already satisfied',
  READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS:
    'readiness no-progress is inherited from active-gate no-progress',
  READINESS_TERMINAL_FAILURE: 'readiness recoverability is terminal',
  READINESS_EVIDENCE_MISSING: 'readiness failure evidence is missing',
  READINESS_RETRYABLE_FAILURE: 'readiness failure evidence is retryable',
  TOP_FAILURES_PRESENT: 'top failure reasons are present',
  TOP_FAILURES_ABSENT: 'top failure reasons are absent',
});

const READINESS_SUPPORT_PATH = Object.freeze({
  READINESS_FAILURE: 'readiness_failure',
  INHERITED_ACTIVE_GATE_NO_PROGRESS: 'inherited_active_gate_no_progress',
});

const DECISION_TABLE_ROWS = Object.freeze([
  Object.freeze({
    edgeId: EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
    owner: OWNER.TOPOLOGY_PUBLICATION,
    boundary: BOUNDARY.PUBLICATION_CONVERGENCE,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.PUBLICATION_STATUS,
      DECISION_INPUT.PENDING_ACK_COUNT,
      DECISION_INPUT.BLOCKED_NODE_COUNT,
      DECISION_INPUT.MISSING_PUBLISHED_COUNT,
      DECISION_INPUT.MISSING_PUBLISHED_NODE_IDS,
      DECISION_INPUT.PRIORITY_SPREAD_PENDING,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_PENDING_ACKS,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([
          REASON.PUBLICATION_PENDING,
          REASON.PENDING_ACKS,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_BLOCKED_NODES,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([
          REASON.PUBLICATION_PENDING,
          REASON.BLOCKED_NODES,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_PENDING_EVIDENCE,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.PUBLICATION_PENDING]),
      }),
      Object.freeze({
        condition:
          DECISION_CONDITION
            .PUBLICATION_MISSING_PUBLISHED_WITHOUT_PRIORITY_SPREAD,
        state: EDGE_STATE.DEFERRED,
        reasons: Object.freeze([
          REASON.PUBLICATION_PUBLISHED,
          REASON.MISSING_PUBLISHED,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PUBLICATION_CLOSED,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.PUBLICATION_PUBLISHED]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    owner: OWNER.PRIORITY_RECOVERY,
    boundary: BOUNDARY.WORKFLOW_PROGRESS,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.UNRESOLVED_SEMANTIC_STATE_IDS,
      DECISION_INPUT.PRIORITY_BLOCKED_PARTITION_COUNT,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_NO_UNRESOLVED_SEMANTIC_STATES,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_SATISFIED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_ONLY_RECOVERING_IN_FLIGHT,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_RETRYABLE]),
      }),
      Object.freeze({
        condition:
          DECISION_CONDITION.PRIORITY_PARTITION_WITNESS_EVENT_DRIVEN_WAIT,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_RETRYABLE]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_BLOCKED_PARTITIONS,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_RECOVERING_IN_FLIGHT,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_RETRYABLE]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.PRIORITY_UNRESOLVED_WITHOUT_IN_FLIGHT,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.ACTIVE_GATE_READY,
      DECISION_INPUT.ACTIVE_GATE_STATE,
      DECISION_INPUT.SNAPSHOT_COVERAGE_COMPLETE,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_READY_OR_COVERED,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.ACTIVE_GATE_READY]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_TIMED_OUT_INCOMPLETE,
        state: EDGE_STATE.BLOCKED,
        reasons: Object.freeze([
          REASON.ACTIVE_GATE_TIMED_OUT,
          REASON.SNAPSHOT_COVERAGE_INCOMPLETE,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_PROGRESS_MISSING,
        state: EDGE_STATE.UNKNOWN,
        reasons: Object.freeze([REASON.EVIDENCE_MISSING]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.ACTIVE_GATE_COVERAGE_DEFERRED,
        state: EDGE_STATE.DEFERRED,
        reasons: Object.freeze([REASON.SNAPSHOT_COVERAGE_INCOMPLETE]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.READINESS_STARTUP_SUPPORT,
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidenceInputs: Object.freeze([
      DECISION_INPUT.ACTIVE_GATE_READY,
      DECISION_INPUT.READINESS_RECOVERABILITY,
    ]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_ACTIVE_GATE_READY,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.READINESS_SATISFIED]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS,
        state: EDGE_STATE.DEFERRED,
        reasons: Object.freeze([
          REASON.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS,
        ]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_TERMINAL_FAILURE,
        state: EDGE_STATE.TERMINAL_FAILED,
        reasons: Object.freeze([REASON.READINESS_TERMINAL]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_EVIDENCE_MISSING,
        state: EDGE_STATE.UNKNOWN,
        reasons: Object.freeze([REASON.EVIDENCE_MISSING]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.READINESS_RETRYABLE_FAILURE,
        state: EDGE_STATE.RETRYABLE,
        reasons: Object.freeze([REASON.READINESS_RETRYABLE]),
      }),
    ]),
  }),
  Object.freeze({
    edgeId: EDGE_ID.TOP_FAILURE_REASONS,
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
    evidenceInputs: Object.freeze([DECISION_INPUT.TOP_REASONS]),
    outcomes: Object.freeze([
      Object.freeze({
        condition: DECISION_CONDITION.TOP_FAILURES_PRESENT,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.TOP_FAILURES_PRESENT]),
      }),
      Object.freeze({
        condition: DECISION_CONDITION.TOP_FAILURES_ABSENT,
        state: EDGE_STATE.SATISFIED,
        reasons: Object.freeze([REASON.TOP_FAILURES_ABSENT]),
      }),
    ]),
  }),
]);

const PUBLICATION_STATE_RULES = Object.freeze([
  Object.freeze({
    state: EDGE_STATE.BLOCKED,
    reasons: Object.freeze([REASON.PENDING_ACKS]),
    matches: (evidence) => evidence.pendingAckCount > SOURCE_ORDER_BASE,
  }),
  Object.freeze({
    state: EDGE_STATE.BLOCKED,
    reasons: Object.freeze([REASON.BLOCKED_NODES]),
    matches: (evidence) => evidence.blockedNodeCount > SOURCE_ORDER_BASE,
  }),
  Object.freeze({
    state: EDGE_STATE.BLOCKED,
    reasons: Object.freeze([]),
    matches: (evidence) => isPublicationPendingEvidence(evidence),
  }),
  Object.freeze({
    state: EDGE_STATE.DEFERRED,
    reasons: Object.freeze([REASON.MISSING_PUBLISHED]),
    matches: (evidence) =>
      isPublicationMissingPublishedEvidence(evidence),
  }),
  Object.freeze({
    state: EDGE_STATE.SATISFIED,
    reasons: Object.freeze([]),
    matches: () => true,
  }),
]);

const READINESS_RECOVERABILITY_RULES = Object.freeze([
  Object.freeze({
    recoverability: READINESS_RECOVERABILITY_TERMINAL,
    matches: (snapshot) => snapshot.recoverability === READINESS_RECOVERABILITY_TERMINAL,
  }),
  Object.freeze({
    recoverability: READINESS_RECOVERABILITY_TERMINAL,
    matches: (snapshot) =>
      snapshot.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL &&
      snapshot.terminalReason === READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS,
  }),
  Object.freeze({
    recoverability: UNKNOWN_VALUE,
    matches: () => true,
  }),
]);

const READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot) =>
      READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_STATE_SET.has(
        snapshot.activeGateState,
      ) &&
      snapshot.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL &&
      snapshot.source === READINESS_SOURCE_UNKNOWN &&
      snapshot.cause === READINESS_CAUSE_NONE,
  }),
  Object.freeze({
    matches: (snapshot) =>
      READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_STATE_SET.has(
        snapshot.activeGateState,
      ) &&
      snapshot.classCode === READINESS_FAILURE_CLASS_SNAPSHOT_TIMEOUT &&
      snapshot.source === READINESS_SOURCE_SELECTED_SNAPSHOT_ERROR &&
      snapshot.cause === READINESS_CAUSE_SNAPSHOT_TIMEOUT,
  }),
]);

const REPLAY_DOMINANT_REASON_RULES = Object.freeze([
  Object.freeze({
    reason: CAUSAL_FAILURE_CLASS.PUBLICATION_ACK_BLOCKED,
    matches: (snapshot) =>
      snapshot.edgeId === EDGE_ID.PUBLICATION_ACK_CONVERGENCE &&
      snapshot.frontierState !== EDGE_STATE.SATISFIED &&
      snapshot.frontierState !== ABSENT_VALUE,
  }),
]);

const SEVERITY_RANK = Object.freeze({
  [EDGE_STATE.TERMINAL_FAILED]: 0,
  [EDGE_STATE.BLOCKED]: 1,
  [EDGE_STATE.RETRYABLE]: 2,
  [EDGE_STATE.DEFERRED]: 3,
  [EDGE_STATE.UNKNOWN]: 4,
  [EDGE_STATE.SATISFIED]: 5,
});

const UNSATISFIED_EDGE_STATES = Object.freeze([
  EDGE_STATE.BLOCKED,
  EDGE_STATE.DEFERRED,
  EDGE_STATE.RETRYABLE,
  EDGE_STATE.TERMINAL_FAILED,
  EDGE_STATE.UNKNOWN,
]);

const NODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: NODE_ID.PUBLICATION_CONVERGENCE,
    owner: OWNER.TOPOLOGY_PUBLICATION,
    boundary: BOUNDARY.PUBLICATION_CONVERGENCE,
  }),
  Object.freeze({
    id: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
  }),
  Object.freeze({
    id: NODE_ID.PRIORITY_RECOVERY_PROGRESS,
    owner: OWNER.PRIORITY_RECOVERY,
    boundary: BOUNDARY.WORKFLOW_PROGRESS,
  }),
  Object.freeze({
    id: NODE_ID.READINESS_STARTUP_SUPPORT,
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
  }),
  Object.freeze({
    id: NODE_ID.TOP_FAILURE_REASONS,
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
  }),
]);

function buildTopologyConvergenceGraph(input = {}) {
  const normalized = normalizeTopologyConvergenceInput(input);
  const edgeSnapshots = [
    buildPublicationEdge(normalized),
    buildPriorityRecoveryEdge(normalized),
    buildActiveGateSnapshotEdge(normalized),
    buildReadinessEdge(normalized),
    buildTopFailureReasonsEdge(normalized),
  ];
  const edges = edgeSnapshots.map((edge, index) => ({
    ...edge,
    sourceOrder: index + SOURCE_ORDER_BASE,
  }));
  const graphEdgeDeclarationsByEdgeId = buildGraphEdgeDeclarations(edges);
  const frontier = computeFrontier(edges);
  const nextExpectedFrontier = computeNextExpectedFrontier(edges, frontier);
  const ownerPresentation = buildTopologyConvergenceOwnerPresentation({
    edges,
    frontier,
  });

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1,
    scenario: normalized.scenario,
    generatedFrom: normalized.generatedFrom,
    summary: {
      nodeCount: NODE_DEFINITIONS.length,
      edgeCount: edges.length,
      frontierCount: frontier.length,
      firstFrontierEdgeId: frontier[FIRST_FRONTIER_INDEX]?.id || ABSENT_VALUE,
      firstFrontierState: frontier[FIRST_FRONTIER_INDEX]?.state || ABSENT_VALUE,
      firstFrontierOwner:
        ownerPresentation.dominantWitness[OWNER_WITNESS_FIELD.OWNER],
      firstFrontierBoundary:
        ownerPresentation.dominantWitness[OWNER_WITNESS_FIELD.BOUNDARY],
      firstFrontierReason:
        ownerPresentation.dominantWitness[
          OWNER_WITNESS_FIELD.DOMINANT_REASON
        ],
    },
    nodes: NODE_DEFINITIONS.map((node) => {
      if (node.id !== NODE_ID.PRIORITY_RECOVERY_PROGRESS) {
        return {...node};
      }
      return {
        ...node,
        owner: firstText(
          graphEdgeDeclarationsByEdgeId[
            EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS
          ]?.owner,
          node.owner,
        ),
        boundary: firstText(
          graphEdgeDeclarationsByEdgeId[
            EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS
          ]?.boundary,
          node.boundary,
        ),
      };
    }),
    edges,
    frontier,
    ownerWitnesses: ownerPresentation.ownerWitnesses,
    frontierWitnesses: ownerPresentation.frontierWitnesses,
    dominantWitness: ownerPresentation.dominantWitness,
    nextExpectedFrontier,
  };
}

function buildTopologyConvergenceGraphFromArtifacts(artifacts = {}) {
  return buildTopologyConvergenceGraph({
    failureBundle: artifacts.failureBundle || artifacts.bundle || {},
    triageSummary: artifacts.triageSummary || artifacts.triage || {},
    report: artifacts.report || {},
  });
}

function buildTopologyConvergenceDecisionTable() {
  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_DECISION_TABLE_V1,
    states: glossaryEntries(EDGE_STATE),
    transitions: cloneDecisionTableRows(),
  };
}

function buildTopologyConvergenceGlossary() {
  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GLOSSARY_V1,
    owners: glossaryEntries(OWNER),
    boundaries: glossaryEntries(BOUNDARY),
    reasons: glossaryEntries(REASON),
    semanticStates: glossaryEntries(SEMANTIC_STATE),
    edgeStates: glossaryEntries(EDGE_STATE),
    edgeIds: glossaryEntries(EDGE_ID),
    nodeIds: glossaryEntries(NODE_ID),
  };
}

function buildTopologyConvergenceOwnerPresentation(graph) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const frontier = Array.isArray(graph?.frontier) ? graph.frontier : [];
  const ownerWitnesses = edges.map((edge) =>
    buildTopologyConvergenceOwnerWitness(edge),
  );
  const frontierWitnesses = frontier.map((edge) =>
    buildTopologyConvergenceOwnerWitness(edge),
  );

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_OWNER_PRESENTATION_V1,
    ownerWitnesses,
    frontierWitnesses,
    dominantWitness: selectTopologyConvergenceDominantWitness({
      frontierWitnesses,
    }),
  };
}

function selectTopologyConvergenceDominantWitness(graphOrPresentation) {
  const frontierWitnesses = Array.isArray(
    graphOrPresentation?.frontierWitnesses,
  ) ?
    graphOrPresentation.frontierWitnesses :
    Array.isArray(graphOrPresentation?.frontier) ?
      graphOrPresentation.frontier.map((edge) =>
        buildTopologyConvergenceOwnerWitness(edge),
      ) :
      [];
  return frontierWitnesses[FIRST_FRONTIER_INDEX] ||
    buildAbsentTopologyConvergenceOwnerWitness();
}

function buildTopologyConvergenceReplayFixture(input = {}, options = {}) {
  const graph = selectTopologyConvergenceReplayGraph(input);
  const expected = buildTopologyConvergenceReplayClassification(graph);
  const sourceArtifact = firstText(
    options.sourceArtifact,
    TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT_ABSENT,
  );

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_FIXTURE_V1,
    scenario: graph.scenario,
    source: {
      type: isTopologyConvergenceGraph(input) ?
        TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_GRAPH :
        TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT,
      artifact: sourceArtifact,
      graphSchemaVersion: graph.schemaVersion,
      generatedFrom: graph.generatedFrom,
    },
    expected,
    publicationConvergence: buildReplayPublicationConvergence(graph),
    summary: buildReplaySummary(graph),
  };
}

function replayTopologyConvergenceFixture(fixture = {}) {
  const graph = buildTopologyConvergenceGraph(fixture);
  const expected = asRecord(fixture.expected);
  const actual = buildTopologyConvergenceReplayClassification(graph);

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_RESULT_V1,
    fixtureSchemaVersion: textOrAbsent(fixture.schemaVersion),
    scenario: graph.scenario,
    expected,
    actual,
    matches: buildReplayMatchSummary(expected, actual),
    graph,
  };
}

function selectTopologyConvergenceReplayGraph(input) {
  if (isTopologyConvergenceGraph(input)) {
    return input;
  }
  return buildTopologyConvergenceGraph(input);
}

function isTopologyConvergenceGraph(input) {
  return asRecord(input).schemaVersion ===
      SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1 &&
    Array.isArray(input.edges);
}

function buildTopologyConvergenceReplayClassification(graph) {
  const witness = selectTopologyConvergenceDominantWitness(graph);
  const handoffEdge = selectReplayEdge(
    graph,
    EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  );

  return {
    firstFrontierEdgeId: witness.edgeId,
    owner: witness.owner,
    boundary: witness.boundary,
    frontierState: witness.frontierState,
    topologyDominantReason: witness.dominantReason,
    dominantReason: selectReplayDominantReason(witness),
    nextAction: selectReplayHandoffNextAction(handoffEdge),
  };
}

function buildReplayMatchSummary(expected, actual) {
  const firstFrontierEdgeId =
    expected.firstFrontierEdgeId === actual.firstFrontierEdgeId;
  const owner = expected.owner === actual.owner;
  const boundary = expected.boundary === actual.boundary;
  const dominantReason = expected.dominantReason === actual.dominantReason;
  const nextAction = expected.nextAction === actual.nextAction;

  return {
    preserved: [
      firstFrontierEdgeId,
      owner,
      boundary,
      dominantReason,
      nextAction,
    ].every(Boolean),
    firstFrontierEdgeId,
    owner,
    boundary,
    dominantReason,
    nextAction,
  };
}

function buildReplayPublicationConvergence(graph) {
  const publicationEdge = selectReplayEdge(
    graph,
    EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
  );
  const activeGateEdge = selectReplayEdge(
    graph,
    EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  );
  const publicationSource = asRecord(publicationEdge.source);
  const activeGateSource = asRecord(activeGateEdge.source);

  return {
    publicationEpoch: numberOrUnknown(publicationSource.publicationEpoch),
    publicationStatus: textOrUnknown(publicationSource.publicationStatus),
    pendingAckNodeIds: arrayOrEmpty(publicationSource.pendingAckNodeIds),
    pendingAckCount: numberOrZero(publicationSource.pendingAckCount),
    blockedNodeCount: numberOrZero(publicationSource.blockedNodeCount),
    publishedActiveNodeIds: arrayOrEmpty(
      publicationSource.publishedActiveNodeIds,
    ),
    missingPublishedNodeIds: arrayOrEmpty(
      publicationSource.missingPublishedNodeIds,
    ),
    missingPublishedCount: numberOrZero(
      publicationSource.missingPublishedCount,
    ),
    publicationPending: parseBooleanVariant(
      publicationSource.publicationPending,
    ),
    recoveryProtocolState: textOrUnknown(
      publicationSource.recoveryProtocolState,
    ),
    prioritySpreadPending: parseBooleanVariant(
      publicationSource.prioritySpreadPending,
    ),
    publicationOwnerStream: buildReplayPublicationOwnerStream(
      publicationSource,
    ),
    publicationActiveGateHandoff: buildReplayPublicationActiveGateHandoff(
      activeGateSource,
    ),
    priorityRecoveryProgressSummary:
      buildReplayPriorityRecoveryProgressSummary(graph),
    activeGate: {
      state: textOrUnknown(activeGateSource.activeGateState),
      progress: buildReplayActiveGateProgress(activeGateSource),
    },
  };
}

function buildReplayPublicationOwnerStream(source) {
  return {
    ackState: textOrUnknown(source.publicationOwnerAckState),
    freshnessFence: textOrUnknown(source.publicationOwnerFreshnessFence),
    recoveryOutcome: textOrUnknown(source.publicationOwnerRecoveryOutcome),
    revision: {
      state: textOrUnknown(source.publicationOwnerRevisionState),
    },
    streamOutcome: textOrUnknown(source.publicationOwnerStreamOutcome),
  };
}

function buildReplayPublicationActiveGateHandoff(source) {
  return {
    state: textOrUnknown(source.publicationActiveGateHandoffState),
    reasonCode: textOrUnknown(source.publicationActiveGateHandoffReasonCode),
    nextAction: textOrUnknown(source.publicationActiveGateHandoffNextAction),
    runtimePromotionAllowed: parseBooleanVariant(
      source.publicationActiveGateHandoffRuntimePromotionAllowed,
    ),
    pendingRecoveryCount: numberOrZero(
      source.publicationActiveGateHandoffPendingRecoveryCount,
    ),
    pendingRecoveryNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingRecoveryNodeIds,
    ),
    pendingReconcileCount: numberOrZero(
      source.publicationActiveGateHandoffPendingReconcileCount,
    ),
    pendingReconcileNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingReconcileNodeIds,
    ),
  };
}

function hasPublicationActiveGateHandoffContract(handoff) {
  const record = asRecord(handoff);
  return textOrUnknown(record.state) !== UNKNOWN_VALUE ||
    textOrUnknown(record.reasonCode) !== UNKNOWN_VALUE ||
    textOrUnknown(record.nextAction) !== UNKNOWN_VALUE;
}

function hasReplayableNoDebtPublicationPendingOwnerEvidence(publication) {
  return parseBooleanVariant(publication.publicationPending) === true &&
    textOrUnknown(publication.recoveryProtocolState) ===
      PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION &&
    numberOrZero(publication.pendingAckCount) === SOURCE_ORDER_BASE &&
    arrayOrEmpty(publication.pendingAckNodeIds).length === SOURCE_ORDER_BASE &&
    numberOrZero(publication.missingPublishedCount) === SOURCE_ORDER_BASE &&
    arrayOrEmpty(publication.missingPublishedNodeIds).length ===
      SOURCE_ORDER_BASE &&
    parseBooleanVariant(publication.prioritySpreadPending) !== true;
}

function buildReplayablePublicationActiveGateHandoffFromOwnerEvidence({
  publicationActiveGateHandoff,
  publication,
  progress,
}) {
  if (hasPublicationActiveGateHandoffContract(publicationActiveGateHandoff)) {
    return publicationActiveGateHandoff;
  }
  if (!hasReplayableNoDebtPublicationPendingOwnerEvidence(publication)) {
    return publicationActiveGateHandoff;
  }
  return buildPublicationActiveGateHandoffContract({
    publicationConvergence: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
      publicationPending: parseBooleanVariant(publication.publicationPending),
      pendingAckNodeIds: arrayOrEmpty(publication.pendingAckNodeIds),
      pendingAckCount: numberOrZero(publication.pendingAckCount),
      missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
      missingPublishedCount: numberOrZero(publication.missingPublishedCount),
      publishedActiveNodeIds: arrayOrEmpty(publication.publishedActiveNodeIds),
      prioritySpreadPending:
        parseBooleanVariant(publication.prioritySpreadPending),
    },
    activeGateProgress: progress,
  });
}

function buildReplayPriorityRecoveryProgressSummary(graph) {
  const priorityEdge = selectReplayEdge(
    graph,
    EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  );
  const source = asRecord(priorityEdge.source);

  return {
    dominantWitness: {
      currentOwner: textOrUnknown(priorityEdge.owner),
      blockingBoundary: textOrUnknown(priorityEdge.boundary),
    },
    priorityRecoveryProgressClasses: {
      unresolvedSemanticStateIds: splitJoinedValues(
        source.unresolvedSemanticStateIds,
      ),
      blockedPartitionIds: splitJoinedValues(source.blockedPartitionIds),
    },
  };
}

function buildReplayActiveGateProgress(source) {
  return {
    snapshotCoverageComplete: parseBooleanVariant(
      source.snapshotCoverageComplete,
    ),
    snapshotCoverageNodeCount: numberOrZero(source.snapshotCoverageNodeCount),
    expectedNodeCount: numberOrZero(source.expectedNodeCount),
    selectedSnapshotError: textOrUnknown(source.selectedSnapshotError),
    selectedSnapshotNodeId: textOrUnknown(source.selectedSnapshotNodeId),
    selectedSnapshotTimeoutMs: numberOrUnknown(source.selectedSnapshotTimeoutMs),
    selectedSnapshotSourceCause:
      textOrUnknown(source.selectedSnapshotSourceCause),
    forcedRepairSnapshotCause:
      textOrUnknown(source.forcedRepairSnapshotCause),
    authoritativeControlSnapshotQueryCause:
      textOrUnknown(source.authoritativeControlSnapshotQueryCause),
    activeGateSnapshotOwnerEdge:
      textOrUnknown(source.activeGateSnapshotOwnerEdge),
    selectedSnapshotObservationMode:
      textOrUnknown(source.selectedSnapshotObservationMode),
    selectedSnapshotObservationState:
      textOrUnknown(source.selectedSnapshotObservationState),
    selectedSnapshotObservationContractState:
      textOrUnknown(source.selectedSnapshotObservationContractState),
    selectedSnapshotObservationRefreshState:
      textOrUnknown(source.selectedSnapshotObservationRefreshState),
    selectedSnapshotObservationNextAction:
      textOrUnknown(source.selectedSnapshotObservationNextAction),
    ...buildReplaySelectedSnapshotObservationRetry(source),
    selectedSnapshotObservationReasonCodes: splitJoinedValues(
      source.selectedSnapshotObservationReasonCodes,
    ),
    selectedSnapshotRepairDeferred: parseBooleanVariant(
      source.selectedSnapshotRepairDeferred,
    ),
    publicationActiveGateHandoffState:
      textOrUnknown(source.publicationActiveGateHandoffState),
    publicationActiveGateHandoffReasonCode:
      textOrUnknown(source.publicationActiveGateHandoffReasonCode),
    publicationActiveGateHandoffNextAction:
      textOrUnknown(source.publicationActiveGateHandoffNextAction),
    publicationActiveGateHandoffRuntimePromotionAllowed:
      parseBooleanVariant(
        source.publicationActiveGateHandoffRuntimePromotionAllowed,
      ),
    publicationActiveGateHandoffPendingRecoveryCount:
      numberOrZero(source.publicationActiveGateHandoffPendingRecoveryCount),
    publicationActiveGateHandoffPendingRecoveryNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingRecoveryNodeIds,
    ),
    publicationActiveGateHandoffPendingReconcileCount:
      numberOrZero(source.publicationActiveGateHandoffPendingReconcileCount),
    publicationActiveGateHandoffPendingReconcileNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingReconcileNodeIds,
    ),
    ...buildReplayOwnerRecoveryQueueProgress(source),
    activeGateOwnerCohortState:
      textOrUnknown(source.activeGateOwnerCohortState),
    activeGateOwnerCohortReasonCode:
      textOrUnknown(source.activeGateOwnerCohortReasonCode),
    activeGateOwnerCohortMissingPublishedCount:
      numberOrZero(source.activeGateOwnerCohortMissingPublishedCount),
    activeGateOwnerCohortMissingPublishedNodeIds: splitJoinedValues(
      source.activeGateOwnerCohortMissingPublishedNodeIds,
    ),
    activeGateOwnerCohortPendingRecoveryCount:
      numberOrZero(source.activeGateOwnerCohortPendingRecoveryCount),
    activeGateOwnerCohortPendingRecoveryNodeIds: splitJoinedValues(
      source.activeGateOwnerCohortPendingRecoveryNodeIds,
    ),
    activeGateOwnerCohortPendingReconcileCount:
      numberOrZero(source.activeGateOwnerCohortPendingReconcileCount),
    activeGateOwnerCohortPendingReconcileNodeIds: splitJoinedValues(
      source.activeGateOwnerCohortPendingReconcileNodeIds,
    ),
    readinessDelay: {
      cause: textOrUnknown(source.readinessDelayCause),
    },
    blockers: splitJoinedValues(source.blockers),
    priorityRecoveryProgressClasses: {},
  };
}

function buildReplaySelectedSnapshotObservationRetry(source) {
  const retryAfterMs = numberOrUnknown(
    source.selectedSnapshotObservationRetryAfterMs,
  );
  if (retryAfterMs === UNKNOWN_VALUE) {
    return {};
  }
  return {selectedSnapshotObservationRetryAfterMs: retryAfterMs};
}

function buildReplayOwnerRecoveryQueueProgress(source) {
  const ownerQueue = {};
  const depthState = textOrUnknown(
    source.selectedControlPlaneOwnerQueueDepthState,
  );
  if (depthState !== UNKNOWN_VALUE) {
    ownerQueue.selectedControlPlaneOwnerQueueDepthState = depthState;
  }
  const pendingWrites = numberOrUnknown(
    source.selectedControlPlaneOwnerQueuePendingWrites,
  );
  if (pendingWrites !== UNKNOWN_VALUE) {
    ownerQueue.selectedControlPlaneOwnerQueuePendingWrites = pendingWrites;
  }
  const pendingWriteGrowthCount = numberOrUnknown(
    source.selectedControlPlaneOwnerQueuePendingWriteGrowthCount,
  );
  if (pendingWriteGrowthCount !== UNKNOWN_VALUE) {
    ownerQueue.selectedControlPlaneOwnerQueuePendingWriteGrowthCount =
      pendingWriteGrowthCount;
  }
  const handoffOutcomeState = textOrUnknown(
    source.membershipPublicationHandoffOutcomeState,
  );
  if (handoffOutcomeState !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeState = handoffOutcomeState;
  }
  const handoffOutcomeReasonCode = textOrUnknown(
    source.membershipPublicationHandoffOutcomeReasonCode,
  );
  if (handoffOutcomeReasonCode !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeReasonCode =
      handoffOutcomeReasonCode;
  }
  const handoffOutcomeEnqueued = parseBooleanVariant(
    source.membershipPublicationHandoffOutcomeEnqueued,
  );
  if (handoffOutcomeEnqueued !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeEnqueued =
      handoffOutcomeEnqueued;
  }
  const handoffOutcomeRetryAfterMs = numberOrUnknown(
    source.membershipPublicationHandoffOutcomeRetryAfterMs,
  );
  if (handoffOutcomeRetryAfterMs !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeRetryAfterMs =
      handoffOutcomeRetryAfterMs;
  }
  return ownerQueue;
}

function buildReplaySummary(graph) {
  const priorityEdge = selectReplayEdge(
    graph,
    EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  );
  const readinessEdge = selectReplayEdge(
    graph,
    EDGE_ID.READINESS_STARTUP_SUPPORT,
  );
  const prioritySource = asRecord(priorityEdge.source);
  const readinessSource = asRecord(readinessEdge.source);

  return {
    dominantReason: textOrUnknown(prioritySource.dominantReason),
    failureClass: textOrUnknown(prioritySource.failureClass),
    readinessFailure: {
      mode: textOrUnknown(readinessSource.mode),
      classCode: textOrUnknown(readinessSource.classCode),
      recoverability: textOrUnknown(readinessSource.recoverability),
      terminalReason: textOrUnknown(readinessSource.terminalReason),
      cause: textOrUnknown(readinessSource.cause),
      source: textOrUnknown(readinessSource.source),
    },
  };
}

function selectReplayEdge(graph, edgeId) {
  return firstRecord(
    selectReplayEdgeFromList(graph.frontier, edgeId),
    selectReplayEdgeFromList(graph.nextExpectedFrontier, edgeId),
    selectReplayEdgeFromList(graph.edges, edgeId),
  );
}

function selectReplayEdgeFromList(edges, edgeId) {
  return arrayOrEmpty(edges).find((edge) => edge.id === edgeId) || {};
}

function selectReplayDominantReason(witness) {
  const snapshot = {
    edgeId: witness.edgeId,
    frontierState: witness.frontierState,
  };
  const rule = REPLAY_DOMINANT_REASON_RULES.find((candidate) =>
    candidate.matches(snapshot),
  );
  return textOrAbsent(rule?.reason || witness.dominantReason);
}

function selectReplayHandoffNextAction(edge) {
  const source = asRecord(edge.source);
  return firstText(
    source.publicationActiveGateHandoffNextAction,
    inferReplayHandoffNextAction(source),
    ABSENT_VALUE,
  );
}

function inferReplayHandoffNextAction(source) {
  if (
    source.publicationActiveGateHandoffReasonCode ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING ||
    source.activeGateOwnerCohortReasonCode ===
      ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION;
  }
  return ABSENT_VALUE;
}

function normalizeTopologyConvergenceInput(input) {
  const report = selectReportRecord(input);
  const scenario = firstScenario(report);
  const directFailureBundle = selectDirectFailureBundleRecord(input, report);
  const failureBundleEvidence = firstFailureBundleEvidenceRecordWithSource(
    recordCandidate(input.failureBundle, SOURCE_PATH.FAILURE_BUNDLE),
    recordCandidate(directFailureBundle, SOURCE_PATH.FAILURE_BUNDLE),
    recordCandidate(report.failureBundle, SOURCE_PATH.REPORT_FAILURE_BUNDLE),
    recordCandidate(
      scenario.failureBundle,
      SOURCE_PATH.REPORT_SCENARIO_FAILURE_BUNDLE,
    ),
  );
  const failureBundle = failureBundleEvidence.record;
  const triageSummary = asRecord(input.triageSummary || input.triage);
  const priorityRecoveryObservation = asRecord(scenario.priorityRecoveryObservation);
  const summary = firstRecord(
    failureBundle.summary,
    triageSummary.summary,
    scenario.summary,
    scenario,
    report.summary,
  );
  const topFailures = firstRecord(failureBundle.topFailures, triageSummary.topFailures);
  const publicationEvidence = firstRecordWithSource(
    recordCandidate(failureBundle.publicationConvergence, SOURCE_PATH.FAILURE_BUNDLE_PUBLICATION),
    recordCandidate(triageSummary.publicationConvergence, SOURCE_PATH.TRIAGE_PUBLICATION),
    recordCandidate(scenario.publicationConvergence, SOURCE_PATH.REPORT_SCENARIO_PUBLICATION),
    recordCandidate(
      priorityRecoveryObservation,
      SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
    ),
    recordCandidate(summary.publicationConvergence, SOURCE_PATH.FAILURE_BUNDLE_SUMMARY),
  );
  const publication = publicationEvidence.record;
  const activeGateEvidence = firstRecordWithSource(
    recordCandidate(
      publication.activeGate,
      flattenEvidencePath(publicationEvidence.sourcePath, SOURCE_FIELD.ACTIVE_GATE),
    ),
    recordCandidate(
      priorityRecoveryObservation.activeGate,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.ACTIVE_GATE,
      ),
    ),
    recordCandidate(
      summary.publicationConvergence?.activeGate,
      flattenEvidencePath(SOURCE_PATH.FAILURE_BUNDLE_SUMMARY, SOURCE_FIELD.ACTIVE_GATE),
    ),
  );
  const activeGate = activeGateEvidence.record;
  const progressEvidence = firstRecordWithSource(
    recordCandidate(
      activeGate.progress,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.PROGRESS),
    ),
    recordCandidate(
      activeGate.bestProgress,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.BEST_PROGRESS),
    ),
    recordCandidate(
      priorityRecoveryObservation.activeGateProgress,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.ACTIVE_GATE_PROGRESS,
      ),
    ),
    recordCandidate(scenario.priorityRecoveryProgress, SOURCE_PATH.REPORT_SCENARIO),
    recordCandidate(scenario.priorityRecoveryProgressSummary, SOURCE_PATH.REPORT_SCENARIO),
  );
  const progress = progressEvidence.record;
  const publicationActiveGateHandoffEvidence = firstRecordWithSource(
    recordCandidate(
      publication[SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF,
      ),
    ),
    recordCandidate(
      progress[SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF],
      flattenEvidencePath(
        progressEvidence.sourcePath,
        SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF,
      ),
    ),
  );
  const explicitPublicationActiveGateHandoff =
    publicationActiveGateHandoffEvidence.record;
  const synthesizedPublicationActiveGateHandoff =
    buildReplayablePublicationActiveGateHandoffFromOwnerEvidence({
      publicationActiveGateHandoff: explicitPublicationActiveGateHandoff,
      publication,
      progress,
    });
  const publicationActiveGateHandoff =
    hasPublicationActiveGateHandoffContract(
      explicitPublicationActiveGateHandoff,
    ) ?
      explicitPublicationActiveGateHandoff :
      synthesizedPublicationActiveGateHandoff;
  const publicationActiveGateHandoffSourcePath =
    hasPublicationActiveGateHandoffContract(
      explicitPublicationActiveGateHandoff,
    ) ?
      publicationActiveGateHandoffEvidence.sourcePath :
      (
        hasPublicationActiveGateHandoffContract(
          synthesizedPublicationActiveGateHandoff,
        ) ?
          publicationEvidence.sourcePath :
          publicationActiveGateHandoffEvidence.sourcePath
      );
  const progressSummaryEvidence = firstRecordWithSource(
    recordCandidate(
      publication.priorityRecoveryProgressSummary,
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_SUMMARY,
      ),
    ),
    recordCandidate(
      scenario.priorityRecoveryProgressSummary,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO,
        SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_SUMMARY,
      ),
    ),
  );
  const progressSummary = progressSummaryEvidence.record;
  const topologyOperatorWitnessEvidence = firstRecordWithSource(
    recordCandidate(
      progressSummary[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
      flattenEvidencePath(
        progressSummaryEvidence.sourcePath,
        SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS,
      ),
    ),
    recordCandidate(
      progress[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
      flattenEvidencePath(
        progressEvidence.sourcePath,
        SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS,
      ),
    ),
    recordCandidate(
      publication[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS,
      ),
    ),
  );
  const priorityRecoveryPartitionWitnessesEvidence = firstArrayWithSource(
    arrayCandidate(
      publication[SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
      ),
    ),
    arrayCandidate(
      priorityRecoveryObservation[
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES
      ],
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
      ),
    ),
    arrayCandidate(
      progressSummary[SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES],
      flattenEvidencePath(
        progressSummaryEvidence.sourcePath,
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
      ),
    ),
  );
  const readinessFailureEvidence = firstRecordWithSource(
    recordCandidate(scenario.readinessFailure, SOURCE_PATH.REPORT_SCENARIO_READINESS_FAILURE),
    recordCandidate(summary.readinessFailure, SOURCE_PATH.READINESS_FAILURE),
    recordCandidate(
      activeGate.readinessFailure,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.READINESS_FAILURE),
    ),
    recordCandidate(failureBundle.readiness?.failure, SOURCE_PATH.READINESS_FAILURE),
    recordCandidate(triageSummary.readiness?.failure, SOURCE_PATH.READINESS_FAILURE),
  );
  const readinessFailure = readinessFailureEvidence.record;

  return {
    scenario: firstText(
      failureBundle.scenario,
      triageSummary.scenario,
      scenario.scenario,
      UNKNOWN_VALUE,
    ),
    generatedFrom: {
      failureBundle: failureBundleEvidence.sourcePath,
      triageSummary: Object.keys(triageSummary).length > SOURCE_ORDER_BASE ?
        SOURCE_PATH.TRIAGE_SUMMARY :
        ABSENT_VALUE,
      report: Object.keys(report).length > SOURCE_ORDER_BASE ?
        SOURCE_PATH.REPORT_SCENARIO :
        ABSENT_VALUE,
    },
    summary,
    publication,
    activeGate,
    progress,
    publicationActiveGateHandoff,
    progressSummary,
    topologyOperatorWitness: topologyOperatorWitnessEvidence.record,
    priorityRecoveryPartitionWitnesses:
      priorityRecoveryPartitionWitnessesEvidence.items,
    readinessFailure,
    evidencePath: {
      publication: publicationEvidence.sourcePath,
      priorityRecoveryProgressClasses: progressEvidence.sourcePath === ABSENT_VALUE ?
        SOURCE_PATH.PRIORITY_RECOVERY_PROGRESS_CLASSES :
        flattenEvidencePath(
          progressEvidence.sourcePath,
          SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_CLASSES,
        ),
      priorityRecoveryProgressSummary: progressSummaryEvidence.sourcePath,
      priorityRecoveryDominantWitness: progressSummaryEvidence.sourcePath ===
        ABSENT_VALUE ?
        ABSENT_VALUE :
        flattenEvidencePath(
          progressSummaryEvidence.sourcePath,
          SOURCE_FIELD.DOMINANT_WITNESS,
        ),
      topologyOperatorWitness: topologyOperatorWitnessEvidence.sourcePath,
      priorityRecoveryPartitionWitnesses:
        priorityRecoveryPartitionWitnessesEvidence.sourcePath,
      activeGateProgress: progressEvidence.sourcePath,
      publicationActiveGateHandoff:
        publicationActiveGateHandoffSourcePath,
      readinessFailure: readinessFailureEvidence.sourcePath,
    },
    topReasons: normalizeTopReasons(firstArray(summary.topReasons, topFailures.topReasons)),
  };
}

function createTopologyConvergenceReasonList() {
  return Array.from(TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST);
}

function buildPublicationEdge(normalized) {
  const evidence = normalizePublicationEvidence(normalized.publication);
  const reasons = createTopologyConvergenceReasonList();
  const state = resolvePublicationState(evidence, reasons);

  return buildEdge({
    id: EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
    from: NODE_ID.PUBLICATION_CONVERGENCE,
    to: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    state,
    owner: OWNER.TOPOLOGY_PUBLICATION,
    boundary: BOUNDARY.PUBLICATION_CONVERGENCE,
    evidencePath: normalized.evidencePath.publication,
    source: evidence.source,
    reasons,
    rank: RANK.PUBLICATION,
    dependencies: [],
    projectionHint: PROJECTION_HINT.PUBLICATION_ACK,
  });
}

function buildPriorityRecoveryEdge(normalized) {
  const evidence = normalizePriorityRecoveryEvidence(normalized);
  const reasons = createTopologyConvergenceReasonList();
  const state = resolvePriorityRecoveryState(evidence, reasons);

  return buildEdge({
    id: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    from: NODE_ID.PRIORITY_RECOVERY_PROGRESS,
    to: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    state,
    owner: evidence.owner,
    boundary: evidence.boundary,
    evidencePath: evidence.evidencePath,
    source: {
      unresolvedSemanticStateIds: joinValues(evidence.semanticStateIds),
      blockedPartitionIds: joinValues(evidence.blockedPartitionIds),
      dominantReason: textOrUnknown(normalized.summary.dominantReason),
      failureClass: textOrUnknown(
        normalized.summary.failureClass ||
        normalized.summary.failureClassification?.failureClass,
      ),
      ...buildPriorityRecoveryEvidenceSource(evidence),
    },
    reasons,
    rank: RANK.PRIORITY_RECOVERY,
    dependencies: [EDGE_ID.PUBLICATION_ACK_CONVERGENCE],
    projectionHint: PROJECTION_HINT.PRIORITY_RECOVERY,
  });
}

function buildActiveGateSnapshotEdge(normalized) {
  const progress = normalized.progress;
  const publicationActiveGateHandoff = normalized.publicationActiveGateHandoff;
  const reasons = createTopologyConvergenceReasonList();
  const state = resolveActiveGateSnapshotState(
    normalized.activeGate,
    progress,
    publicationActiveGateHandoff,
    reasons,
  );

  return buildEdge({
    id: EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    from: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    to: NODE_ID.READINESS_STARTUP_SUPPORT,
    state,
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    evidencePath: normalized.evidencePath.activeGateProgress,
    source: {
      activeGateState: textOrUnknown(normalized.activeGate.state),
      snapshotCoverageComplete: booleanVariant(progress.snapshotCoverageComplete),
      snapshotCoverageNodeCount: numberOrUnknown(progress.snapshotCoverageNodeCount),
      expectedNodeCount: numberOrUnknown(progress.expectedNodeCount),
      selectedSnapshotError: firstText(
        progress.selectedSnapshotError,
        progress.selectedError,
        progress.readinessDelay?.error,
      ),
      ...buildActiveGateSnapshotCauseSource(progress),
      selectedSnapshotObservationMode:
        textOrUnknown(progress.selectedSnapshotObservationMode),
      selectedSnapshotObservationState:
        textOrUnknown(progress.selectedSnapshotObservationState),
      selectedSnapshotObservationContractState:
        textOrUnknown(progress.selectedSnapshotObservationContractState),
      selectedSnapshotObservationRefreshState:
        textOrUnknown(progress.selectedSnapshotObservationRefreshState),
      selectedSnapshotObservationNextAction:
        textOrUnknown(progress.selectedSnapshotObservationNextAction),
      ...buildSelectedSnapshotObservationRetrySource(progress),
      selectedSnapshotObservationReasonCodes: joinValues(
        arrayOrEmpty(progress.selectedSnapshotObservationReasonCodes),
      ),
      selectedSnapshotRepairDeferred: booleanVariant(
        progress.selectedSnapshotRepairDeferred,
      ),
      ...buildPublicationActiveGateHandoffSource(
        publicationActiveGateHandoff,
        progress,
      ),
      ...buildOwnerRecoveryQueueSource(progress, publicationActiveGateHandoff),
      ...buildActiveGateOwnerCohortSource(progress),
      ...buildTopologyOperatorWitnessDiagnosticSource(
        progress.topologyOperatorWitness,
      ),
      readinessDelayCause: textOrUnknown(progress.readinessDelay?.cause),
      blockers: joinValues(arrayOrEmpty(progress.blockers)),
    },
    reasons,
    rank: RANK.SNAPSHOT_COVERAGE,
    dependencies: [
      EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
      EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    ],
    projectionHint: PROJECTION_HINT.SNAPSHOT_COVERAGE,
  });
}

function buildReadinessEdge(normalized) {
  const readiness = normalizeReadinessSupportEvidence(
    normalized.readinessFailure,
    normalized.activeGate,
  );
  const reasons = createTopologyConvergenceReasonList();
  const state = resolveReadinessState(readiness, normalized.activeGate, reasons);

  return buildEdge({
    id: EDGE_ID.READINESS_STARTUP_SUPPORT,
    from: NODE_ID.READINESS_STARTUP_SUPPORT,
    to: NODE_ID.TOP_FAILURE_REASONS,
    state,
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidencePath: normalized.evidencePath.readinessFailure,
    source: {
      mode: textOrUnknown(readiness.mode),
      classCode: textOrUnknown(readiness.classCode),
      recoverability: textOrUnknown(readiness.recoverability),
      terminalReason: textOrUnknown(readiness.terminalReason),
      cause: textOrUnknown(readiness.cause),
      source: textOrUnknown(readiness.source),
      supportPath: readiness.supportPath,
    },
    reasons,
    rank: RANK.READINESS,
    dependencies: [EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE],
    projectionHint: PROJECTION_HINT.READINESS,
  });
}

function buildTopFailureReasonsEdge(normalized) {
  const reasons = normalized.topReasons.length > SOURCE_ORDER_BASE ?
    [REASON.TOP_FAILURES_PRESENT] :
    [REASON.TOP_FAILURES_ABSENT];

  return buildEdge({
    id: EDGE_ID.TOP_FAILURE_REASONS,
    from: NODE_ID.TOP_FAILURE_REASONS,
    to: NODE_ID.TOP_FAILURE_REASONS,
    state: EDGE_STATE.SATISFIED,
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
    evidencePath: SOURCE_PATH.TOP_REASONS,
    source: {
      topReasons: normalized.topReasons.map((entry) => entry.reason).join(REASON_SEPARATOR) ||
        ABSENT_VALUE,
    },
    reasons,
    rank: RANK.TOP_FAILURES,
    dependencies: [EDGE_ID.READINESS_STARTUP_SUPPORT],
    projectionHint: PROJECTION_HINT.TOP_REASONS,
  });
}

function buildEdge(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    state: edge.state,
    owner: edge.owner,
    boundary: edge.boundary,
    evidencePath: edge.evidencePath,
    source: edge.source,
    reasons: edge.reasons.length > SOURCE_ORDER_BASE ? edge.reasons : [REASON.EVIDENCE_MISSING],
    rank: edge.rank,
    priority: edge.rank,
    dependencies: edge.dependencies,
    projectionHint: edge.projectionHint,
  };
}

function normalizeReadinessSupportEvidence(readinessFailure, activeGate) {
  const readiness = asRecord(readinessFailure);
  const recoverability = resolveReadinessRecoverability(readiness);
  const supportPath = resolveReadinessSupportPath(readiness, activeGate);
  return {
    ...readiness,
    recoverability,
    supportPath,
  };
}

function resolveReadinessSupportPath(readiness, activeGate) {
  const snapshot = {
    activeGateState: textOrUnknown(asRecord(activeGate).state),
    classCode: textOrUnknown(readiness.classCode),
    terminalReason: textOrUnknown(readiness.terminalReason),
    source: textOrUnknown(readiness.source),
    cause: textOrUnknown(readiness.cause),
  };
  if (READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES.some((rule) =>
    rule.matches(snapshot),
  )) {
    return READINESS_SUPPORT_PATH.INHERITED_ACTIVE_GATE_NO_PROGRESS;
  }
  return READINESS_SUPPORT_PATH.READINESS_FAILURE;
}

function resolveReadinessRecoverability(readiness) {
  const snapshot = {
    recoverability: textOrUnknown(readiness.recoverability),
    classCode: textOrUnknown(readiness.classCode),
    terminalReason: textOrUnknown(readiness.terminalReason),
  };
  const decision = READINESS_RECOVERABILITY_RULES.find((rule) =>
    rule.matches(snapshot),
  );
  return decision.recoverability;
}

function computeFrontier(edges) {
  const satisfiedIds = new Set(
    edges.filter((edge) => edge.state === EDGE_STATE.SATISFIED).map((edge) => edge.id),
  );
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));

  return edges
    .filter((edge) => UNSATISFIED_EDGE_STATES.includes(edge.state))
    .filter((edge) => edge.dependencies.every((dependencyId) =>
      isSatisfiedDependencyChain({
        dependencyId,
        edgesById,
        satisfiedIds,
        visitedIds: new Set(),
      }),
    ))
    .sort(compareFrontierEdges)
    .map((edge) => ({...edge}));
}

function isSatisfiedDependencyChain({
  dependencyId,
  edgesById,
  satisfiedIds,
  visitedIds,
}) {
  if (satisfiedIds.has(dependencyId) !== true) {
    return false;
  }
  if (visitedIds.has(dependencyId)) {
    return true;
  }
  visitedIds.add(dependencyId);
  const dependencyEdge = edgesById.get(dependencyId);
  if (!dependencyEdge) {
    return true;
  }
  return dependencyEdge.dependencies.every((ancestorId) =>
    isSatisfiedDependencyChain({
      dependencyId: ancestorId,
      edgesById,
      satisfiedIds,
      visitedIds,
    }),
  );
}

function computeNextExpectedFrontier(edges, frontier) {
  const firstFrontier = frontier[FIRST_FRONTIER_INDEX];
  if (!firstFrontier) {
    return [];
  }
  const projectedEdges = edges.map((edge) => {
    if (edge.id !== firstFrontier.id) {
      return edge;
    }
    return {
      ...edge,
      state: EDGE_STATE.SATISFIED,
      reasons: [REASON.PUBLICATION_PUBLISHED],
      projectionHint: firstFrontier.projectionHint,
    };
  });
  return computeFrontier(projectedEdges);
}

function compareFrontierEdges(left, right) {
  return compareNumber(SEVERITY_RANK[left.state], SEVERITY_RANK[right.state]) ||
    compareNumber(left.rank, right.rank) ||
    compareNumber(left.sourceOrder, right.sourceOrder) ||
    left.id.localeCompare(right.id);
}

function resolvePublicationState(evidence, reasons) {
  const publicationPublished =
    evidence.publicationStatus === PUBLICATION_STATUS_PUBLISHED ||
    isPublicationPendingEvidence(evidence) !== true;
  reasons.push(
    publicationPublished ?
      REASON.PUBLICATION_PUBLISHED :
      REASON.PUBLICATION_PENDING,
  );
  if (
    publicationPublished !== true &&
    isNonTerminalTopologyOperatorWitness(evidence.topologyOperatorWitness)
  ) {
    return EDGE_STATE.DEFERRED;
  }
  const decision = PUBLICATION_STATE_RULES.find((rule) =>
    rule.matches(evidence),
  );
  reasons.push(...decision.reasons);
  return decision.state;
}

function isPublicationPendingEvidence(evidence) {
  return isPublicationPendingFlagEvidence(evidence) ||
    PUBLICATION_PENDING_STATUS_SET.has(evidence.publicationStatus) ||
    evidence.recoveryProtocolState ===
      PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING;
}

function isPublicationPendingFlagEvidence(evidence) {
  return evidence.publicationPending === true &&
    evidence.missingPublishedCount === SOURCE_ORDER_BASE;
}

function isPublicationMissingPublishedEvidence(evidence) {
  return hasPublicationMissingPublishedEvidence(evidence) &&
    evidence.prioritySpreadPending !== true &&
    isPublicationConsumerLagEvidence(evidence) !== true;
}

function hasPublicationMissingPublishedEvidence(evidence) {
  return evidence.missingPublishedCount > SOURCE_ORDER_BASE ||
    evidence.missingPublishedNodeIds.length > SOURCE_ORDER_BASE;
}

function isPublicationConsumerLagEvidence(evidence) {
  return evidence.publicationStatus === PUBLICATION_STATUS_PUBLISHED &&
    evidence.pendingAckCount === SOURCE_ORDER_BASE &&
    isClosedPublicationOwnerAckState(evidence.ackState) &&
    evidence.revisionState === PUBLICATION_OWNER_REVISION_STATE_CURRENT &&
    evidence.streamOutcome === PUBLICATION_OWNER_STREAM_OUTCOME_STALE &&
    evidence.freshnessFence ===
      PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG &&
    evidence.recoveryOutcome ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER;
}

function isClosedPublicationOwnerAckState(ackState) {
  return ackState === PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED ||
    ackState === PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED;
}

function normalizePriorityRecoveryEvidence(normalized) {
  const progress = normalized.progress;
  const progressSummary = normalized.progressSummary;
  const progressClasses = asRecord(progress.priorityRecoveryProgressClasses);
  const progressSummaryClasses = asRecord(
    progressSummary[SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_CLASSES],
  );
  const topologyOperatorWitness =
    selectTopologyOperatorWitness(normalized);
  const witnessSelection = buildPriorityRecoveryWitnessSelection(
    normalized.priorityRecoveryPartitionWitnesses,
  );
  const ownerBoundary = resolvePriorityRecoveryOwnerBoundary(
    progressSummary,
    topologyOperatorWitness,
    witnessSelection.dominantWitness,
  );
  const classSelection = selectPriorityRecoveryClassSelection(
    progressSummaryClasses,
    progressClasses,
    witnessSelection.classes,
    topologyOperatorWitness,
  );

  return {
    owner: ownerBoundary.owner,
    boundary: ownerBoundary.boundary,
    evidencePath: selectPriorityRecoveryEvidencePath(
      normalized,
      classSelection.source,
      ownerBoundary,
    ),
    priorityBlockedPartitionCount: firstFiniteNumber(
      progressSummary.priorityBlockedPartitionCount,
      progress.priorityBlockedPartitionCount,
      classSelection.source ===
        PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
        witnessSelection.classes.blockedPartitionIds.length :
        UNKNOWN_VALUE,
    ),
    semanticStateIds: arrayOrEmpty(classSelection.classes.unresolvedSemanticStateIds),
    blockedPartitionIds: arrayOrEmpty(classSelection.classes.blockedPartitionIds),
    waitModes: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.waitModes :
      [],
    nextRequiredActions: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.nextRequiredActions :
      [],
    actuationStates: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.actuationStates :
      [],
    eventDrivenWait: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES &&
      witnessSelection.eventDrivenWait === true,
    topologyOperatorWitness,
    topologyOperatorWitnessState:
      textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.CURRENT_STEP_STATE],
      ),
    topologyOperatorWitnessNextAction:
      textOrUnknown(topologyOperatorWitness[SOURCE_FIELD.NEXT_ACTION]),
  };
}

function resolvePriorityRecoveryState(priorityRecoveryEvidence, reasons) {
  const witnessState =
    resolveTopologyOperatorWitnessEdgeState(priorityRecoveryEvidence);
  if (witnessState !== EDGE_STATE.UNKNOWN) {
    reasons.push(
      witnessState === EDGE_STATE.BLOCKED ?
        REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED :
        REASON.PRIORITY_RECOVERY_RETRYABLE,
    );
    return witnessState;
  }
  if (priorityRecoveryEvidence.semanticStateIds.length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.PRIORITY_RECOVERY_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  if (
    isOnlyRecoveringInFlightPriorityRecoveryEvidence(priorityRecoveryEvidence) ||
    priorityRecoveryEvidence.eventDrivenWait === true
  ) {
    reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    return EDGE_STATE.RETRYABLE;
  }
  if (priorityRecoveryEvidence.priorityBlockedPartitionCount > SOURCE_ORDER_BASE) {
    reasons.push(REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED);
    if (priorityRecoveryEvidence.semanticStateIds.includes(
      PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
    )) {
      reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    }
    return EDGE_STATE.BLOCKED;
  }
  if (priorityRecoveryEvidence.semanticStateIds.includes(
    PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  )) {
    reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    return EDGE_STATE.RETRYABLE;
  }
  reasons.push(REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED);
  return EDGE_STATE.BLOCKED;
}

function isOnlyRecoveringInFlightPriorityRecoveryEvidence(evidence) {
  return evidence.semanticStateIds.every((semanticStateId) =>
    semanticStateId === PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  );
}

function resolvePriorityRecoveryOwnerBoundary(
  progressSummary,
  topologyOperatorWitness = {},
  fallbackDominantWitness = {},
) {
  const progressSummaryDominantWitness = asRecord(
    asRecord(progressSummary)[SOURCE_FIELD.DOMINANT_WITNESS],
  );
  const dominantWitness = asRecord(
    firstRecord(
      topologyOperatorWitness,
      isPriorityRecoveryNonBlockingPartitionWitness(
        progressSummaryDominantWitness,
      ) ?
        {} :
        progressSummaryDominantWitness,
      fallbackDominantWitness,
    ),
  );
  const usesDominantWitness =
    firstText(dominantWitness[SOURCE_FIELD.OWNER], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.BOUNDARY], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.CURRENT_OWNER], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.BLOCKING_BOUNDARY], ABSENT_VALUE) !==
      ABSENT_VALUE;
  return {
    owner: firstText(
      dominantWitness[SOURCE_FIELD.OWNER],
      dominantWitness[SOURCE_FIELD.CURRENT_OWNER],
      OWNER.PRIORITY_RECOVERY,
    ),
    boundary: firstText(
      dominantWitness[SOURCE_FIELD.BOUNDARY],
      dominantWitness[SOURCE_FIELD.BLOCKING_BOUNDARY],
      BOUNDARY.WORKFLOW_PROGRESS,
    ),
    usesDominantWitness,
  };
}

function selectPriorityRecoveryClassSelection(
  progressSummaryClasses,
  progressClasses,
  witnessClasses,
  topologyOperatorWitness,
) {
  if (isTopologyOperatorWitnessPresent(topologyOperatorWitness)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS,
      classes: buildPriorityRecoveryClassesFromTopologyOperatorWitness(
        topologyOperatorWitness,
      ),
    };
  }
  if (hasPriorityRecoveryClassEvidence(progressSummaryClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
      classes: progressSummaryClasses,
    };
  }
  if (hasPriorityRecoveryClassEvidence(progressClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
      classes: progressClasses,
    };
  }
  if (hasPriorityRecoveryClassContract(progressClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
      classes: progressClasses,
    };
  }
  if (hasPriorityRecoveryClassContract(progressSummaryClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
      classes: progressSummaryClasses,
    };
  }
  if (hasPriorityRecoveryClassEvidence(witnessClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES,
      classes: witnessClasses,
    };
  }
  if (Object.keys(progressSummaryClasses).length > SOURCE_ORDER_BASE) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
      classes: progressSummaryClasses,
    };
  }
  return {
    source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
    classes: progressClasses,
  };
}

function selectPriorityRecoveryEvidencePath(normalized, evidenceSource, ownerBoundary) {
  if (
    evidenceSource ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS &&
    normalized.evidencePath.topologyOperatorWitness !== ABSENT_VALUE
  ) {
    return normalized.evidencePath.topologyOperatorWitness;
  }
  if (
    evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES &&
    normalized.evidencePath.priorityRecoveryPartitionWitnesses !== ABSENT_VALUE
  ) {
    return normalized.evidencePath.priorityRecoveryPartitionWitnesses;
  }
  if (evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS) {
    return normalized.evidencePath.priorityRecoveryProgressClasses;
  }
  if (evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY &&
      normalized.evidencePath.priorityRecoveryProgressSummary !== ABSENT_VALUE) {
    return normalized.evidencePath.priorityRecoveryProgressSummary;
  }
  if (ownerBoundary.usesDominantWitness &&
      normalized.evidencePath.priorityRecoveryDominantWitness !== ABSENT_VALUE) {
    return normalized.evidencePath.priorityRecoveryDominantWitness;
  }
  return normalized.evidencePath.priorityRecoveryProgressClasses;
}

function hasPriorityRecoveryClassEvidence(classes) {
  const progressClasses = asRecord(classes);
  return arrayOrEmpty(
    progressClasses.unresolvedSemanticStateIds,
  ).length > SOURCE_ORDER_BASE ||
    arrayOrEmpty(progressClasses.blockedPartitionIds).length >
      SOURCE_ORDER_BASE;
}

function hasPriorityRecoveryClassContract(classes) {
  return Object.keys(asRecord(classes)).length > SOURCE_ORDER_BASE;
}

function buildPriorityRecoveryWitnessSelection(witnesses) {
  const normalizedWitnesses = normalizePriorityRecoveryPartitionWitnesses(
    witnesses,
  );
  const blockingWitnesses = normalizedWitnesses.filter(
    (witness) =>
      isPriorityRecoveryNonBlockingPartitionWitness(witness) !== true,
  );
  const semanticStateIds = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.SEMANTIC_STATE_ID,
  );
  const blockedPartitionIds = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.PARTITION_ID,
  );
  const waitModes = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.WAIT_MODE,
  );
  const nextRequiredActions = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.NEXT_REQUIRED_ACTION,
  );
  const actuationStates = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.ACTUATION_STATE,
  );

  return {
    witnesses: blockingWitnesses,
    dominantWitness: blockingWitnesses[FIRST_FRONTIER_INDEX] || {},
    classes: {
      unresolvedSemanticStateIds: semanticStateIds,
      blockedPartitionIds,
    },
    waitModes,
    nextRequiredActions,
    actuationStates,
    eventDrivenWait: isPriorityRecoveryEventDrivenWaitWitnessSelection({
      witnesses: normalizedWitnesses,
      semanticStateIds,
    }),
  };
}

function selectTopologyOperatorWitness(normalized) {
  const directWitness = asRecord(normalized.topologyOperatorWitness);
  const progressSummaryDominantWitness = asRecord(
    asRecord(normalized.progressSummary)[SOURCE_FIELD.DOMINANT_WITNESS],
  );
  if (
    isTopologyOperatorWitnessPresent(directWitness) &&
    isPriorityRecoveryNonBlockingPartitionWitness(
      progressSummaryDominantWitness,
    ) !== true
  ) {
    return directWitness;
  }
  const partitionWitness = normalizePriorityRecoveryPartitionWitnesses(
    normalized.priorityRecoveryPartitionWitnesses,
  )
    .filter((witness) =>
      isPriorityRecoveryNonBlockingPartitionWitness(witness) !== true,
    )
    .map((witness) =>
      asRecord(witness[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS]),
    )
    .find(isTopologyOperatorWitnessPresent);
  return partitionWitness || {};
}

function isTopologyOperatorWitnessPresent(witness) {
  return (
    Object.keys(asRecord(witness)).length > SOURCE_ORDER_BASE &&
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_STEP_ID]) !== UNKNOWN_VALUE &&
    textOrUnknown(witness[SOURCE_FIELD.NEXT_ACTION]) !== UNKNOWN_VALUE
  );
}

function buildPriorityRecoveryClassesFromTopologyOperatorWitness(witness) {
  const currentState = textOrUnknown(witness[SOURCE_FIELD.CURRENT_STEP_STATE]);
  const semanticStateIds =
    currentState === TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL ?
      [] :
      [PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT];
  const blockedPartitionIds =
    currentState === TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_BLOCKED ?
      [textOrUnknown(witness[SOURCE_FIELD.PARTITION_ID])] :
      [];
  return {
    unresolvedSemanticStateIds: semanticStateIds,
    blockedPartitionIds: blockedPartitionIds.filter((partitionId) =>
      partitionId !== UNKNOWN_VALUE,
    ),
  };
}

function resolveTopologyOperatorWitnessEdgeState(evidence) {
  const state = evidence.topologyOperatorWitnessState;
  return TOPOLOGY_OPERATOR_WITNESS_EDGE_STATE_BY_STEP.get(state) ||
    EDGE_STATE.UNKNOWN;
}

function normalizePriorityRecoveryPartitionWitnesses(witnesses) {
  return arrayOrEmpty(witnesses)
    .map(asRecord)
    .filter((witness) =>
      Object.keys(witness).length > SOURCE_ORDER_BASE,
    );
}

function isPriorityRecoveryNonBlockingPartitionWitness(witness) {
  return (
    PRIORITY_RECOVERY_NON_BLOCKING_WITNESS_SEMANTIC_STATE_SET.has(
      textOrUnknown(witness[SOURCE_FIELD.SEMANTIC_STATE_ID]),
    ) &&
    arrayOrEmpty(witness[SOURCE_FIELD.PROGRESS_CLASS_IDS]).length ===
      SOURCE_ORDER_BASE &&
    arrayOrEmpty(witness[SOURCE_FIELD.BLOCKER_REASON_CODES]).length ===
      SOURCE_ORDER_BASE
  );
}

function collectDistinctRecordText(records, fieldName) {
  const values = new Set();
  for (const record of records) {
    const value = record[fieldName];
    if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
      values.add(value);
    }
  }
  return [...values];
}

function isPriorityRecoveryEventDrivenWaitWitnessSelection(selection) {
  if (selection.witnesses.length === SOURCE_ORDER_BASE) {
    return false;
  }
  if (selection.semanticStateIds.length === SOURCE_ORDER_BASE) {
    return false;
  }
  if (selection.semanticStateIds.every((semanticStateId) =>
    PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET.has(
      semanticStateId,
    ),
  ) !== true) {
    return false;
  }
  return selection.witnesses.every(isPriorityRecoveryEventDrivenWaitWitness);
}

function isPriorityRecoveryEventDrivenWaitWitness(witness) {
  return (
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_OWNER]) ===
      OWNER.PRIORITY_RECOVERY &&
    textOrUnknown(witness[SOURCE_FIELD.BLOCKING_BOUNDARY]) ===
      BOUNDARY.WORKFLOW_PROGRESS &&
    textOrUnknown(witness[SOURCE_FIELD.WAIT_MODE]) ===
      PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN &&
    textOrUnknown(witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION]) ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS
  );
}

function buildPriorityRecoveryEvidenceSource(evidence) {
  const operationProgressProjection =
    buildOperationProgressCompatibilityProjection(
      evidence.operationProgressRecord,
    );
  if (hasOperationProgressProjectionSource(operationProgressProjection)) {
    return buildOperationProgressProjectionSource(operationProgressProjection);
  }
  const topologyOperatorWitness = asRecord(evidence.topologyOperatorWitness);
  return Object.freeze({
    ...buildTopologyOperatorEvidenceSource(topologyOperatorWitness),
    ...buildPriorityRecoveryObservationSource(evidence),
  });
}

function hasOperationProgressProjectionSource(operationProgressProjection) {
  return operationProgressProjection.topologyOperatorCurrentStepId !==
    OPERATION_PROGRESS_PROJECTION_UNAVAILABLE;
}

function buildOperationProgressProjectionSource(operationProgressProjection) {
  return Object.freeze({
    topologyOperatorId: textOrUnknown(
      operationProgressProjection.operationId,
    ),
    topologyOperatorKind: textOrUnknown(
      operationProgressProjection.resource,
    ),
    topologyOperatorCurrentStepId: textOrUnknown(
      operationProgressProjection.topologyOperatorCurrentStepId,
    ),
    topologyOperatorCurrentStepState: textOrUnknown(
      operationProgressProjection.topologyOperatorCurrentStepState,
    ),
    operationProgressResource: textOrUnknown(
      operationProgressProjection.operationProgressResource,
    ),
    operationProgressState: textOrUnknown(
      operationProgressProjection.operationProgressState,
    ),
    operationProgressLastAcceptedEventId: textOrUnknown(
      operationProgressProjection.operationProgressLastAcceptedEventId,
    ),
    topologyOperatorNextAction: textOrUnknown(
      operationProgressProjection.topologyOperatorNextAction,
    ),
  });
}

function buildTopologyOperatorEvidenceSource(topologyOperatorWitness) {
  if (isTopologyOperatorWitnessPresent(topologyOperatorWitness)) {
    return Object.freeze({
      topologyOperatorId: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.OPERATOR_ID],
      ),
      topologyOperatorKind: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.KIND],
      ),
      topologyOperatorCurrentStepId: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.CURRENT_STEP_ID],
      ),
      topologyOperatorCurrentStepState: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.CURRENT_STEP_STATE],
      ),
      topologyOperatorNextAction: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.NEXT_ACTION],
      ),
      topologyOperatorDeadlineMs: numberOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.DEADLINE_MS],
      ),
      topologyOperatorLastObservedAtMs: numberOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.LAST_OBSERVED_AT_MS],
      ),
    });
  }
  return Object.freeze({});
}

function buildPriorityRecoveryObservationSource(evidence) {
  return Object.freeze({
    ...buildPriorityRecoveryObservationEntry(
      evidence.waitModes,
      PRIORITY_RECOVERY_OBSERVATION_FIELD_WAIT_MODES,
    ),
    ...buildPriorityRecoveryObservationEntry(
      evidence.nextRequiredActions,
      PRIORITY_RECOVERY_OBSERVATION_FIELD_NEXT_REQUIRED_ACTIONS,
    ),
    ...buildPriorityRecoveryObservationEntry(
      evidence.actuationStates,
      PRIORITY_RECOVERY_OBSERVATION_FIELD_ACTUATION_STATES,
    ),
  });
}

function buildPriorityRecoveryObservationEntry(values, fieldName) {
  return values.length > SOURCE_ORDER_BASE ?
    Object.freeze({[fieldName]: joinValues(values)}) :
    Object.freeze({});
}

function buildSelectedSnapshotObservationRetrySource(progress) {
  const retryAfterMs = numberOrUnknown(
    progress.selectedSnapshotObservationRetryAfterMs,
  );
  if (retryAfterMs === UNKNOWN_VALUE) {
    return {};
  }
  return {selectedSnapshotObservationRetryAfterMs: retryAfterMs};
}

function buildPublicationActiveGateHandoffSource(handoff, progress) {
  const source = {};
  const state = firstText(
    handoff.state,
    progress.publicationActiveGateHandoffState,
  );
  if (state !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffState = state;
  }
  const reasonCode = firstText(
    handoff.reasonCode,
    progress.publicationActiveGateHandoffReasonCode,
  );
  if (reasonCode !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffReasonCode = reasonCode;
  }
  const nextAction = firstText(
    handoff.nextAction,
    progress.publicationActiveGateHandoffNextAction,
  );
  if (nextAction !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffNextAction = nextAction;
  }
  const runtimePromotionAllowed = booleanVariant(
    handoff.runtimePromotionAllowed ??
      progress.publicationActiveGateHandoffRuntimePromotionAllowed,
  );
  if (runtimePromotionAllowed !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffRuntimePromotionAllowed =
      runtimePromotionAllowed;
  }
  const pendingRecoveryNodeIds = resolveOwnerRecoveryPendingNodeIds(
    handoff,
    progress,
  );
  const pendingRecoveryCount = numberOrUnknown(
    handoff.pendingRecoveryCount ??
      progress.publicationActiveGateHandoffPendingRecoveryCount,
  );
  const ownerRecoveryPendingWriteCount =
    isOwnerRecoveryWaitHandoffContract(handoff, progress) === true ?
      resolveOwnerRecoveryPendingWriteCount(handoff, progress) :
      SOURCE_ORDER_BASE;
  if (
    pendingRecoveryCount !== UNKNOWN_VALUE ||
    pendingRecoveryNodeIds.length > SOURCE_ORDER_BASE ||
    ownerRecoveryPendingWriteCount > SOURCE_ORDER_BASE
  ) {
    source.publicationActiveGateHandoffPendingRecoveryCount = Math.max(
      pendingRecoveryCount === UNKNOWN_VALUE ?
        SOURCE_ORDER_BASE :
        pendingRecoveryCount,
      pendingRecoveryNodeIds.length,
      ownerRecoveryPendingWriteCount,
    );
  }
  if (pendingRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    source.publicationActiveGateHandoffPendingRecoveryNodeIds = joinValues(
      pendingRecoveryNodeIds,
    );
  }
  const pendingReconcileCount = numberOrUnknown(
    handoff.pendingReconcileCount ??
      progress.publicationActiveGateHandoffPendingReconcileCount,
  );
  if (pendingReconcileCount !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffPendingReconcileCount =
      pendingReconcileCount;
  }
  const pendingReconcileNodeIds = arrayOrEmpty(
    handoff.pendingReconcileNodeIds ||
      progress.publicationActiveGateHandoffPendingReconcileNodeIds,
  );
  if (pendingReconcileNodeIds.length > SOURCE_ORDER_BASE) {
    source.publicationActiveGateHandoffPendingReconcileNodeIds = joinValues(
      pendingReconcileNodeIds,
    );
  }
  return source;
}

function buildOwnerRecoveryQueueSource(progress, handoff) {
  const handoffContract = selectPublicationActiveGateHandoffContract(handoff);
  if (!hasOwnerRecoveryQueueEvidence(progress, handoffContract)) {
    return {};
  }
  const queueDepth = asRecord(progress.selectedControlPlaneOwnerQueueDepth);
  const hasObservedQueueDepth =
    Object.keys(queueDepth).length > SOURCE_ORDER_BASE;
  const ownerRecoveryPendingWriteCount =
    resolveOwnerRecoveryPendingWriteCount(handoffContract, progress);
  const source = {
    selectedControlPlaneOwnerQueueDepthState:
      hasObservedQueueDepth ||
      ownerRecoveryPendingWriteCount > SOURCE_ORDER_BASE ?
        OWNER_QUEUE_DEPTH_STATE_OBSERVED :
        UNKNOWN_VALUE,
  };
  const pendingWrites = hasObservedQueueDepth ?
    numberOrUnknown(queueDepth.pendingWrites) :
    (ownerRecoveryPendingWriteCount > SOURCE_ORDER_BASE ?
      ownerRecoveryPendingWriteCount :
      UNKNOWN_VALUE);
  if (pendingWrites !== UNKNOWN_VALUE) {
    source.selectedControlPlaneOwnerQueuePendingWrites = pendingWrites;
  }
  const pendingWriteGrowthCount = numberOrUnknown(
    queueDepth.pendingWriteGrowthCount,
  );
  if (pendingWriteGrowthCount !== UNKNOWN_VALUE) {
    source.selectedControlPlaneOwnerQueuePendingWriteGrowthCount =
      pendingWriteGrowthCount;
  }
  return {
    ...source,
    ...buildMembershipPublicationHandoffOutcomeSource(progress, handoff),
  };
}

function buildKnownMembershipPublicationHandoffOutcomeSource({
  state,
  reasonCode,
  enqueued,
  retryAfterMs,
}) {
  return {
    membershipPublicationHandoffOutcomeState: state,
    ...(reasonCode !== UNKNOWN_VALUE ? {
      membershipPublicationHandoffOutcomeReasonCode: reasonCode,
    } : {}),
    ...(enqueued !== UNKNOWN_VALUE ? {
      membershipPublicationHandoffOutcomeEnqueued: enqueued,
    } : {}),
    ...(retryAfterMs !== UNKNOWN_VALUE ? {
      membershipPublicationHandoffOutcomeRetryAfterMs: retryAfterMs,
    } : {}),
  };
}

function buildMembershipPublicationHandoffOutcomeSource(progress, handoff) {
  const observed = {
    state: textOrUnknown(progress.membershipPublicationHandoffOutcomeState),
    reasonCode: textOrUnknown(
      progress.membershipPublicationHandoffOutcomeReasonCode,
    ),
    enqueued: booleanVariant(
      progress.membershipPublicationHandoffOutcomeEnqueued,
    ),
    retryAfterMs: numberOrUnknown(
      progress.membershipPublicationHandoffOutcomeRetryAfterMs,
    ),
  };
  if (observed.state !== UNKNOWN_VALUE) {
    return buildKnownMembershipPublicationHandoffOutcomeSource(observed);
  }
  const handoffContract = selectPublicationActiveGateHandoffContract(handoff);
  const shouldSynthesizeOwnerOutcome =
    handoffContract &&
    (
      handoffContract.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      isOwnerRecoveryWaitHandoffContract(handoffContract, progress)
    );
  return shouldSynthesizeOwnerOutcome ?
    buildKnownMembershipPublicationHandoffOutcomeSource({
      state: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      enqueued: false,
      retryAfterMs: SOURCE_ORDER_BASE,
    }) :
    {};
}

function hasOwnerRecoveryQueueEvidence(progress, handoffContract) {
  const queueDepth = asRecord(progress.selectedControlPlaneOwnerQueueDepth);
  if (Object.keys(queueDepth).length > SOURCE_ORDER_BASE ||
    textOrUnknown(progress.membershipPublicationHandoffOutcomeState) !==
      UNKNOWN_VALUE ||
    textOrUnknown(progress.membershipPublicationHandoffOutcomeReasonCode) !==
      UNKNOWN_VALUE ||
    booleanVariant(progress.membershipPublicationHandoffOutcomeEnqueued) !==
      UNKNOWN_VALUE ||
    numberOrUnknown(progress.membershipPublicationHandoffOutcomeRetryAfterMs) !==
      UNKNOWN_VALUE) {
    return true;
  }
  if (
    handoffContract &&
    (
      handoffContract.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      isOwnerRecoveryWaitHandoffContract(handoffContract, progress)
    )
  ) {
    return true;
  }
  return false;
}

function isOwnerRecoveryWaitHandoffContract(handoffContract, progress = null) {
  const nextAction =
    textOrUnknown(handoffContract?.nextAction) !== UNKNOWN_VALUE ?
      handoffContract.nextAction :
      textOrUnknown(progress?.publicationActiveGateHandoffNextAction);
  return nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY &&
    resolveOwnerRecoveryPendingWriteCount(handoffContract, progress) >
      SOURCE_ORDER_BASE;
}

function resolveOwnerRecoveryPendingNodeIds(handoffContract, progress = null) {
  const handoffRecoveryNodeIds = arrayOrEmpty(
    handoffContract?.pendingRecoveryNodeIds,
  );
  if (handoffRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    return handoffRecoveryNodeIds;
  }
  const progressHandoffRecoveryNodeIds = arrayOrEmpty(
    progress?.publicationActiveGateHandoffPendingRecoveryNodeIds,
  );
  if (progressHandoffRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    return progressHandoffRecoveryNodeIds;
  }
  if (
    isOwnerRecoveryWaitHandoffContract(handoffContract, progress) !== true
  ) {
    return [];
  }
  return arrayOrEmpty(progress?.activeGateOwnerCohortPendingRecoveryNodeIds);
}

function resolveOwnerRecoveryPendingWriteCount(handoffContract, progress = null) {
  const pendingRecoveryCount = numberOrZero(
    handoffContract?.pendingRecoveryCount,
  );
  if (pendingRecoveryCount > SOURCE_ORDER_BASE) {
    return pendingRecoveryCount;
  }
  const pendingRecoveryNodeCount =
    arrayOrEmpty(handoffContract?.pendingRecoveryNodeIds).length;
  if (pendingRecoveryNodeCount > SOURCE_ORDER_BASE) {
    return pendingRecoveryNodeCount;
  }
  const activeGateOwnerCohortPendingRecoveryCount = numberOrZero(
    progress?.activeGateOwnerCohortPendingRecoveryCount,
  );
  if (activeGateOwnerCohortPendingRecoveryCount > SOURCE_ORDER_BASE) {
    return activeGateOwnerCohortPendingRecoveryCount;
  }
  return arrayOrEmpty(
    progress?.activeGateOwnerCohortPendingRecoveryNodeIds,
  ).length;
}

function buildActiveGateOwnerCohortSource(progress) {
  const source = {};
  const state = textOrUnknown(progress.activeGateOwnerCohortState);
  if (state !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortState = state;
  }
  const reasonCode = textOrUnknown(progress.activeGateOwnerCohortReasonCode);
  if (reasonCode !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortReasonCode = reasonCode;
  }
  const missingPublishedCount = numberOrUnknown(
    progress.activeGateOwnerCohortMissingPublishedCount,
  );
  if (missingPublishedCount !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortMissingPublishedCount = missingPublishedCount;
  }
  const missingPublishedNodeIds = arrayOrEmpty(
    progress.activeGateOwnerCohortMissingPublishedNodeIds,
  );
  if (missingPublishedNodeIds.length > SOURCE_ORDER_BASE) {
    source.activeGateOwnerCohortMissingPublishedNodeIds = joinValues(
      missingPublishedNodeIds,
    );
  }
  const pendingRecoveryCount = numberOrUnknown(
    progress.activeGateOwnerCohortPendingRecoveryCount,
  );
  if (pendingRecoveryCount !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortPendingRecoveryCount = pendingRecoveryCount;
  }
  const pendingRecoveryNodeIds = arrayOrEmpty(
    progress.activeGateOwnerCohortPendingRecoveryNodeIds,
  );
  if (pendingRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    source.activeGateOwnerCohortPendingRecoveryNodeIds = joinValues(
      pendingRecoveryNodeIds,
    );
  }
  const pendingReconcileCount = numberOrUnknown(
    progress.activeGateOwnerCohortPendingReconcileCount,
  );
  if (pendingReconcileCount !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortPendingReconcileCount = pendingReconcileCount;
  }
  const pendingReconcileNodeIds = arrayOrEmpty(
    progress.activeGateOwnerCohortPendingReconcileNodeIds,
  );
  if (pendingReconcileNodeIds.length > SOURCE_ORDER_BASE) {
    source.activeGateOwnerCohortPendingReconcileNodeIds = joinValues(
      pendingReconcileNodeIds,
    );
  }
  return source;
}

function normalizeActiveGateSnapshotCauseEvidence(progress) {
  const selectedSnapshotError = firstText(
    progress.selectedSnapshotError,
    progress.selectedError,
    progress.readinessDelay?.error,
  );
  const selectedSnapshotNodeId = firstText(
    progress.selectedSnapshotNodeId,
    progress.selectedNodeId,
    selectSnapshotNodeIdFromAdminQueryFailure(selectedSnapshotError),
  );
  const selectedSnapshotTimeoutMs = numberOrUnknown(
    progress.selectedSnapshotTimeoutMs,
  );
  const authoritativeControlSnapshotRepairFailure =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT,
    );
  const selectedSnapshotSourceTimeout =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_ADMIN_QUERY_TIMEOUT_PREFIX,
    ) &&
    (
      selectedSnapshotNodeId === UNKNOWN_VALUE ||
      selectedSnapshotError.includes(selectedSnapshotNodeId)
    );
  const selectedSnapshotSourceTransportClosed =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX,
    ) &&
    selectedSnapshotError.includes(SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER) &&
    (
      selectedSnapshotNodeId === UNKNOWN_VALUE ||
      selectedSnapshotError.includes(selectedSnapshotNodeId)
    );
  const forcedRepairSnapshotTimeout =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_FORCED_REPAIR_FAILURE_FRAGMENT,
    ) &&
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT,
    );
  const authoritativeControlSnapshotQueryTimeout =
    authoritativeControlSnapshotRepairFailure === true &&
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_TIMEOUT_FRAGMENT,
    );
  const authoritativeControlSnapshotQueryPressure =
    authoritativeControlSnapshotQueryTimeout !== true &&
    authoritativeControlSnapshotRepairFailure === true &&
    (
      selectedSnapshotError.includes(
        SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_PARTICIPANT_FAILURE_FRAGMENT,
      ) ||
      selectedSnapshotError.includes(
        SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_FRAGMENT,
      ) &&
      selectedSnapshotError.includes(
        SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_SUFFIX,
      )
    );

  return Object.freeze({
    selectedSnapshotError,
    selectedSnapshotNodeId,
    selectedSnapshotTimeoutMs,
    selectedSnapshotSourceTimeout,
    selectedSnapshotSourceTransportClosed,
    forcedRepairSnapshotTimeout,
    authoritativeControlSnapshotQueryTimeout,
    authoritativeControlSnapshotQueryPressure,
  });
}

function selectSnapshotNodeIdFromAdminQueryFailure(selectedSnapshotError) {
  const matchedPrefix = SELECTED_SNAPSHOT_ADMIN_QUERY_NODE_ID_PREFIXES.find(
    (prefix) => selectedSnapshotError.includes(prefix),
  );
  if (!matchedPrefix) {
    return UNKNOWN_VALUE;
  }
  const prefixIndex = selectedSnapshotError.indexOf(matchedPrefix);
  const nodeIdStart =
    prefixIndex + matchedPrefix.length;
  const laneMarkerIndex = selectedSnapshotError.indexOf(
    SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER,
    nodeIdStart,
  );
  if (laneMarkerIndex <= nodeIdStart) {
    return UNKNOWN_VALUE;
  }
  return selectedSnapshotError.slice(nodeIdStart, laneMarkerIndex);
}

function buildActiveGateSnapshotCauseSource(progress) {
  const evidence = normalizeActiveGateSnapshotCauseEvidence(progress);
  const matchedRules = ACTIVE_GATE_SNAPSHOT_CAUSE_RULES.filter((rule) =>
    rule.matches(evidence),
  );
  if (matchedRules.length === SOURCE_ORDER_BASE) {
    return {};
  }
  const source = {};
  if (evidence.selectedSnapshotNodeId !== UNKNOWN_VALUE) {
    source.selectedSnapshotNodeId = evidence.selectedSnapshotNodeId;
  }
  if (evidence.selectedSnapshotTimeoutMs !== UNKNOWN_VALUE) {
    source.selectedSnapshotTimeoutMs = evidence.selectedSnapshotTimeoutMs;
  }
  for (const rule of matchedRules) {
    source[rule.sourceField] = rule.cause;
  }
  source.activeGateSnapshotOwnerEdge =
    selectActiveGateSnapshotOwnerEdge(evidence);
  return source;
}

function selectActiveGateSnapshotOwnerEdge(evidence) {
  const rule = ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_RULES.find((candidate) =>
    candidate.matches(evidence),
  );
  return rule?.ownerEdge || ABSENT_VALUE;
}

function selectActiveGateSnapshotCauseReasons(progress) {
  const evidence = normalizeActiveGateSnapshotCauseEvidence(progress);
  return ACTIVE_GATE_SNAPSHOT_CAUSE_RULES
    .filter((rule) => rule.matches(evidence))
    .map((rule) => rule.reason);
}

function appendActiveGateSnapshotCauseReasons(progress, reasons) {
  reasons.push(...selectActiveGateSnapshotCauseReasons(progress));
}

function hasActiveGateOwnerReconcilePending(progress, handoff = {}) {
  return (
    textOrUnknown(handoff.reasonCode) ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING ||
    textOrUnknown(progress.activeGateOwnerCohortState) ===
      ACTIVE_GATE_OWNER_COHORT_STATE_PENDING ||
    textOrUnknown(progress.activeGateOwnerCohortReasonCode) ===
      ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING
  );
}

function appendActiveGateOwnerCohortReason(progress, handoff, reasons) {
  if (hasActiveGateOwnerReconcilePending(progress, handoff)) {
    reasons.push(REASON.OWNER_RECONCILE_PENDING);
  }
}

function resolveActiveGateSnapshotState(activeGate, progress, handoff, reasons) {
  if (progress.snapshotCoverageComplete === true || activeGate.ready === true) {
    reasons.push(REASON.ACTIVE_GATE_READY);
    return EDGE_STATE.SATISFIED;
  }
  if (activeGate.state === ACTIVE_GATE_STATE_TIMED_OUT) {
    reasons.push(REASON.ACTIVE_GATE_TIMED_OUT);
    appendActiveGateOwnerCohortReason(progress, handoff, reasons);
    reasons.push(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
    appendActiveGateSnapshotCauseReasons(progress, reasons);
    if (progress.selectedSnapshotRepairDeferred === true) {
      reasons.push(REASON.SNAPSHOT_REPAIR_DEFERRED);
    }
    if (isNonTerminalTopologyOperatorWitness(progress.topologyOperatorWitness)) {
      return EDGE_STATE.DEFERRED;
    }
    return EDGE_STATE.BLOCKED;
  }
  if (Object.keys(progress).length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.EVIDENCE_MISSING);
    return EDGE_STATE.UNKNOWN;
  }
  appendActiveGateOwnerCohortReason(progress, handoff, reasons);
  reasons.push(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
  appendActiveGateSnapshotCauseReasons(progress, reasons);
  if (progress.selectedSnapshotRepairDeferred === true) {
    reasons.push(REASON.SNAPSHOT_REPAIR_DEFERRED);
  }
  return EDGE_STATE.DEFERRED;
}

function resolveReadinessState(readiness, activeGate, reasons) {
  if (activeGate.ready === true) {
    reasons.push(REASON.READINESS_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  if (
    readiness.supportPath ===
    READINESS_SUPPORT_PATH.INHERITED_ACTIVE_GATE_NO_PROGRESS
  ) {
    reasons.push(REASON.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS);
    return EDGE_STATE.DEFERRED;
  }
  if (readiness.recoverability === READINESS_RECOVERABILITY_TERMINAL) {
    reasons.push(REASON.READINESS_TERMINAL);
    return EDGE_STATE.TERMINAL_FAILED;
  }
  if (Object.keys(readiness).length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.EVIDENCE_MISSING);
    return EDGE_STATE.UNKNOWN;
  }
  reasons.push(REASON.READINESS_RETRYABLE);
  return EDGE_STATE.RETRYABLE;
}

function normalizePublicationOwnerStreamEvidence(publication) {
  const publicationOwnerStream = asRecord(publication.publicationOwnerStream);
  const revision = asRecord(publicationOwnerStream.revision);
  return {
    ackState: textOrUnknown(
      publication.ackState || publicationOwnerStream.ackState,
    ),
    freshnessFence: textOrUnknown(
      publication.freshnessFence || publicationOwnerStream.freshnessFence,
    ),
    recoveryOutcome: textOrUnknown(
      publication.recoveryOutcome || publicationOwnerStream.recoveryOutcome,
    ),
    revisionState: textOrUnknown(revision.state),
    streamOutcome: textOrUnknown(
      publication.streamOutcome || publicationOwnerStream.streamOutcome,
    ),
  };
}

function normalizePublicationEvidence(publication) {
  const ownerStreamEvidence =
    normalizePublicationOwnerStreamEvidence(publication);
  const topologyOperatorWitness = asRecord(
    publication[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
  );
  return {
    publicationStatus: textOrUnknown(publication.publicationStatus),
    publicationPending: publication.publicationPending === true,
    recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
    pendingAckCount: numberOrZero(publication.pendingAckCount),
    blockedNodeCount: numberOrZero(publication.blockedNodeCount),
    missingPublishedCount: numberOrZero(publication.missingPublishedCount),
    missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
    prioritySpreadPending: publication.prioritySpreadPending === true,
    topologyOperatorWitness,
    ...ownerStreamEvidence,
    source: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      pendingAckNodeIds: arrayOrEmpty(publication.pendingAckNodeIds),
      pendingAckCount: numberOrUnknown(publication.pendingAckCount),
      blockedNodeCount: numberOrUnknown(publication.blockedNodeCount),
      publishedActiveNodeIds: arrayOrEmpty(publication.publishedActiveNodeIds),
      missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
      missingPublishedCount: numberOrUnknown(publication.missingPublishedCount),
      publicationPending: booleanVariant(publication.publicationPending),
      recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
      prioritySpreadPending: booleanVariant(publication.prioritySpreadPending),
      publicationOwnerAckState: ownerStreamEvidence.ackState,
      publicationOwnerFreshnessFence: ownerStreamEvidence.freshnessFence,
      publicationOwnerRecoveryOutcome: ownerStreamEvidence.recoveryOutcome,
      publicationOwnerRevisionState: ownerStreamEvidence.revisionState,
      publicationOwnerStreamOutcome: ownerStreamEvidence.streamOutcome,
      ...buildTopologyOperatorWitnessDiagnosticSource(
        topologyOperatorWitness,
      ),
    },
  };
}

function isNonTerminalTopologyOperatorWitness(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return false;
  }
  return textOrUnknown(record[SOURCE_FIELD.CURRENT_STEP_STATE]) !==
    TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL;
}

function buildTopologyOperatorWitnessDiagnosticSource(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return {};
  }
  return {
    topologyOperatorId: textOrUnknown(record[SOURCE_FIELD.OPERATOR_ID]),
    topologyOperatorKind: textOrUnknown(record[SOURCE_FIELD.KIND]),
    topologyOperatorCurrentStepId: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_ID],
    ),
    topologyOperatorCurrentStepState: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_STATE],
    ),
    topologyOperatorNextAction: textOrUnknown(
      record[SOURCE_FIELD.NEXT_ACTION],
    ),
  };
}

function normalizeTopReasons(topReasons) {
  return arrayOrEmpty(topReasons).map((entry) => ({
    reason: textOrUnknown(entry?.reason),
    count: numberOrZero(entry?.count),
  }));
}

function firstRecord(...values) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > SOURCE_ORDER_BASE) {
      return record;
    }
  }
  return {};
}

function firstFailureBundleEvidenceRecordWithSource(...candidates) {
  for (const candidate of candidates) {
    const record = asRecord(candidate.record);
    if (hasFailureBundleEvidence(record)) {
      return {
        record,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    record: {},
    sourcePath: ABSENT_VALUE,
  };
}

function hasFailureBundleEvidence(record) {
  const evidenceRecords = [
    asRecord(record.summary),
    asRecord(record.publicationConvergence),
    asRecord(record.readiness),
    asRecord(record.topFailures),
  ];
  return evidenceRecords.some((evidenceRecord) => (
    Object.keys(evidenceRecord).length > SOURCE_ORDER_BASE
  ));
}

function recordCandidate(record, sourcePath) {
  return {
    record,
    sourcePath,
  };
}

function arrayCandidate(items, sourcePath) {
  return {
    items,
    sourcePath,
  };
}

function firstRecordWithSource(...candidates) {
  for (const candidate of candidates) {
    const record = asRecord(candidate.record);
    if (Object.keys(record).length > SOURCE_ORDER_BASE) {
      return {
        record,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    record: {},
    sourcePath: ABSENT_VALUE,
  };
}

function firstArrayWithSource(...candidates) {
  for (const candidate of candidates) {
    const items = arrayOrEmpty(candidate.items);
    if (items.length > SOURCE_ORDER_BASE) {
      return {
        items,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    items: [],
    sourcePath: ABSENT_VALUE,
  };
}

function firstScenario(report) {
  const scenarios = arrayOrEmpty(report.scenarios);
  return asRecord(scenarios[FIRST_FRONTIER_INDEX]);
}

function selectReportRecord(input) {
  const explicitReport = asRecord(input.report);
  if (hasReportScenarioEvidence(explicitReport)) {
    return explicitReport;
  }
  if (hasReportScenarioEvidence(input)) {
    return input;
  }
  return {};
}

function hasReportScenarioEvidence(record) {
  return Object.keys(firstScenario(asRecord(record))).length > SOURCE_ORDER_BASE;
}

function selectDirectFailureBundleRecord(input, report) {
  if (Object.keys(asRecord(report)).length > SOURCE_ORDER_BASE) {
    return {};
  }
  if (Object.keys(asRecord(input.failureBundle)).length > SOURCE_ORDER_BASE) {
    return {};
  }
  if (hasDirectFailureBundleEvidence(input)) {
    return input;
  }
  return {};
}

function hasDirectFailureBundleEvidence(record) {
  const directEvidenceRecords = [
    asRecord(record.publicationConvergence),
    asRecord(record.readiness),
    asRecord(record.topFailures),
  ];
  return directEvidenceRecords.some((evidenceRecord) => (
    Object.keys(evidenceRecord).length > SOURCE_ORDER_BASE
  ));
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > SOURCE_ORDER_BASE) {
      return value;
    }
  }
  return [];
}

function asRecord(value) {
  if (value && typeof value === TYPE_OBJECT && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function arrayOrEmpty(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
      return value;
    }
  }
  return UNKNOWN_VALUE;
}

function textOrUnknown(value) {
  if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
    return value;
  }
  return UNKNOWN_VALUE;
}

function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return SOURCE_ORDER_BASE;
  }
  return parsed;
}

function numberOrUnknown(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return UNKNOWN_VALUE;
  }
  return parsed;
}

function booleanVariant(value) {
  if (value === true) {
    return BOOLEAN_TRUE_TEXT;
  }
  if (value === false) {
    return BOOLEAN_FALSE_TEXT;
  }
  return UNKNOWN_VALUE;
}

function parseBooleanVariant(value) {
  if (value === true || value === BOOLEAN_TRUE_TEXT) {
    return true;
  }
  if (value === false || value === BOOLEAN_FALSE_TEXT) {
    return false;
  }
  return UNKNOWN_VALUE;
}

function joinValues(values) {
  if (values.length === SOURCE_ORDER_BASE) {
    return ABSENT_VALUE;
  }
  return values.map((value) => String(value)).join(LIST_SEPARATOR);
}

function splitJoinedValues(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const text = textOrUnknown(value);
  if (text === ABSENT_VALUE || text === UNKNOWN_VALUE) {
    return [];
  }
  return text
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > SOURCE_ORDER_BASE);
}

function compareNumber(left, right) {
  return left - right;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return SOURCE_ORDER_BASE;
}

function flattenEvidencePath(parentPath, childPath) {
  if (!parentPath || parentPath === ABSENT_VALUE) {
    return childPath;
  }
  return `${parentPath}${PATH_SEPARATOR}${childPath}`;
}

function glossaryEntries(values) {
  return Object.entries(values).map(([name, value]) => ({
    name,
    value,
  }));
}

function cloneDecisionTableRows() {
  return DECISION_TABLE_ROWS.map((row) => ({
    edgeId: row.edgeId,
    owner: row.owner,
    boundary: row.boundary,
    evidenceInputs: [...row.evidenceInputs],
    outcomes: row.outcomes.map((outcome) => ({
      condition: outcome.condition,
      state: outcome.state,
      reasons: [...outcome.reasons],
    })),
  }));
}

function buildGraphEdgeDeclarations(edges) {
  const declarations = {};
  for (const edge of edges) {
    declarations[edge.id] = {
      owner: edge.owner,
      boundary: edge.boundary,
    };
  }
  return Object.freeze(declarations);
}

function buildTopologyConvergenceOwnerWitness(edge) {
  if (!edge) {
    return buildAbsentTopologyConvergenceOwnerWitness();
  }
  return {
    [OWNER_WITNESS_FIELD.EDGE_ID]: textOrAbsent(edge.id),
    [OWNER_WITNESS_FIELD.OWNER]: textOrAbsent(edge.owner),
    [OWNER_WITNESS_FIELD.BOUNDARY]: textOrAbsent(edge.boundary),
    [OWNER_WITNESS_FIELD.STATE]: textOrAbsent(edge.state),
    [OWNER_WITNESS_FIELD.FRONTIER_STATE]: textOrAbsent(edge.state),
    [OWNER_WITNESS_FIELD.DOMINANT_REASON]:
      selectOwnerWitnessDominantReason(edge),
    [OWNER_WITNESS_FIELD.REASONS]: arrayOrEmpty(edge.reasons),
    [OWNER_WITNESS_FIELD.EVIDENCE_PATH]: textOrAbsent(edge.evidencePath),
    [OWNER_WITNESS_FIELD.SOURCE]: asRecord(edge.source),
    [OWNER_WITNESS_FIELD.ROOT_CAUSE_CLASS]:
      EDGE_ROOT_CAUSE_CLASS[edge.id] || ROOT_CAUSE_CLASS_UNKNOWN,
  };
}

function buildAbsentTopologyConvergenceOwnerWitness() {
  return {
    [OWNER_WITNESS_FIELD.EDGE_ID]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.OWNER]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.BOUNDARY]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.STATE]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.FRONTIER_STATE]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.DOMINANT_REASON]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.REASONS]: [],
    [OWNER_WITNESS_FIELD.EVIDENCE_PATH]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.SOURCE]: {},
    [OWNER_WITNESS_FIELD.ROOT_CAUSE_CLASS]: ROOT_CAUSE_CLASS_UNKNOWN,
  };
}

function selectOwnerWitnessDominantReason(edge) {
  const primaryReason = arrayOrEmpty(edge.reasons).find((reason) =>
    OWNER_SUPPORTING_REASON_SET.has(reason) !== true,
  );
  return textOrAbsent(primaryReason || edge.reasons?.[FIRST_FRONTIER_INDEX]);
}

function textOrAbsent(value) {
  if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
    return value;
  }
  return ABSENT_VALUE;
}

export {
  EDGE_STATE,
  EDGE_ID,
  REASON,
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceDecisionTable,
  buildTopologyConvergenceGlossary,
  buildTopologyConvergenceGraphFromArtifacts,
  buildTopologyConvergenceOwnerPresentation,
  buildTopologyConvergenceOwnerWitness,
  buildTopologyConvergenceReplayFixture,
  replayTopologyConvergenceFixture,
  selectTopologyConvergenceDominantWitness,
  flattenEvidencePath,
};
