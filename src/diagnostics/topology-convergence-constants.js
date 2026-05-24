export const ABSENT_VALUE = 'absent';
export const UNKNOWN_VALUE = 'unknown';
export const PATH_SEPARATOR = '.';
export const LIST_SEPARATOR = ',';
export const REASON_SEPARATOR = '|';
export const SOURCE_ORDER_BASE = 0;
export const FIRST_FRONTIER_INDEX = 0;
export const TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST = Object.freeze([]);
export const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1 =
  'topology-convergence-graph-v1';
export const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_FIXTURE_V1 =
  'topology-convergence-replay-fixture-v1';
export const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_RESULT_V1 =
  'topology-convergence-replay-result-v1';
export const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_DECISION_TABLE_V1 =
  'topology-convergence-owner-decision-table-v1';
export const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GLOSSARY_V1 =
  'topology-convergence-owner-glossary-v1';
export const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_OWNER_PRESENTATION_V1 =
  'topology-convergence-owner-presentation-v1';
export const TYPE_OBJECT = 'object';
export const TYPE_STRING = 'string';
export const BOOLEAN_TRUE_TEXT = 'true';
export const BOOLEAN_FALSE_TEXT = 'false';
export const ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
export const ROOT_CAUSE_CLASS_STARTUP = 'startup';
export const ROOT_CAUSE_CLASS_UNKNOWN = 'unknown';
export const OPERATION_PROGRESS_PROJECTION_UNAVAILABLE =
  'operation_progress_projection_unavailable';
export const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
export const PUBLICATION_STATUS_OPEN = 'OPEN';
export const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
export const PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING =
  'publication_pending';
export const PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';
export const PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED = 'acknowledged';
export const PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED = 'not_required';
export const PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG = 'consumer_lag';
export const PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER =
  'waiting_for_consumer';
export const PUBLICATION_OWNER_REVISION_STATE_CURRENT = 'current';
export const PUBLICATION_OWNER_STREAM_OUTCOME_STALE = 'stale';
export const PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT = 'recovering_in_flight';
export const PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
export const PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN = 'event_driven';
export const PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS =
  'wait_for_operation_progress';
export const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
export const ACTIVE_GATE_STATE_STALLED = 'stalled';
export const ACTIVE_GATE_OWNER_COHORT_STATE_PENDING = 'pending';
export const ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
export const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
export const READINESS_RECOVERABILITY_TERMINAL = 'terminal';
export const READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL = 'no_progress_terminal';
export const READINESS_FAILURE_CLASS_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
export const READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS = 'stalled_no_progress';
export const READINESS_SOURCE_UNKNOWN = 'unknown';
export const READINESS_SOURCE_SELECTED_SNAPSHOT_ERROR = 'selectedSnapshotError';
export const READINESS_CAUSE_NONE = 'none';
export const READINESS_CAUSE_SNAPSHOT_TIMEOUT = 'snapshot_timeout';
export const TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_GRAPH = 'topology_convergence_graph';
export const TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT =
  'topology_convergence_artifact';
export const TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT_ABSENT = 'artifact_absent';
export const PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS = 'progress';
export const PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY = 'summary';
export const PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES =
  'partition_witnesses';
export const PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS =
  'topology_operator_witness';
export const PRIORITY_RECOVERY_OBSERVATION_FIELD_WAIT_MODES = 'waitModes';
export const PRIORITY_RECOVERY_OBSERVATION_FIELD_NEXT_REQUIRED_ACTIONS =
  'nextRequiredActions';
export const PRIORITY_RECOVERY_OBSERVATION_FIELD_ACTUATION_STATES =
  'actuationStates';
export const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED = 'planned';
export const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_DISPATCHED = 'dispatched';
export const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_OBSERVED = 'observed';
export const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_RETRY_SCHEDULED =
  'retry_scheduled';
export const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_BLOCKED = 'blocked';
export const TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL = 'terminal';
export const TOPOLOGY_OPERATOR_WITNESS_FIELD_NAME = 'topologyOperatorWitness';
export const SELECTED_SNAPSHOT_SOURCE_CAUSE_TIMEOUT =
  'selected_snapshot_source_timeout';
export const SELECTED_SNAPSHOT_SOURCE_CAUSE_TRANSPORT_CLOSED =
  'selected_transport_closed';
export const FORCED_REPAIR_SNAPSHOT_CAUSE_TIMEOUT =
  'forced_repair_snapshot_timeout';
export const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_TIMEOUT =
  'authoritative_control_snapshot_query_timeout';
export const AUTHORITATIVE_CONTROL_SNAPSHOT_QUERY_CAUSE_PRESSURE =
  'authoritative_control_snapshot_query_pressure';
export const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_SELECTED_SOURCE =
  'selected_snapshot_source_selection';
export const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_FORCED_REPAIR =
  'forced_repair_path_stall';
export const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY =
  'authoritative_control_snapshot_query_pressure';
export const SELECTED_SNAPSHOT_ADMIN_QUERY_TIMEOUT_PREFIX =
  'Admin API query timed out for node ';
export const SELECTED_SNAPSHOT_ADMIN_QUERY_FAILED_PREFIX =
  'Admin API query failed for node ';
export const SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX =
  'Admin API query connection closed before response for node ';
export const SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER = ' on lane ';
export const SELECTED_SNAPSHOT_FORCED_REPAIR_FAILURE_FRAGMENT =
  'forced repair snapshot failed:';
export const SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT =
  'Authoritative control snapshot repair failed:';
export const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_TIMEOUT_FRAGMENT =
  'nodes:Query timeout after ';
export const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_PARTICIPANT_FAILURE_FRAGMENT =
  'nodes:Distributed operation failed due to participant failures';
export const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_FRAGMENT =
  'nodes:Connection to node ';
export const SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_SUFFIX =
  ' closed';
export const SELECTED_SNAPSHOT_ADMIN_QUERY_NODE_ID_PREFIXES = Object.freeze([
  SELECTED_SNAPSHOT_ADMIN_QUERY_FAILED_PREFIX,
  SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX,
]);
export const OWNER_QUEUE_DEPTH_STATE_OBSERVED = 'observed';

export const EDGE_STATE = Object.freeze({
  SATISFIED: 'satisfied',
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
  RETRYABLE: 'retryable',
  TERMINAL_FAILED: 'terminal_failed',
  UNKNOWN: 'unknown',
});

export const TOPOLOGY_OPERATOR_WITNESS_EDGE_STATE_BY_STEP = new Map([
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL, EDGE_STATE.SATISFIED],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_BLOCKED, EDGE_STATE.BLOCKED],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_RETRY_SCHEDULED, EDGE_STATE.RETRYABLE],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_DISPATCHED, EDGE_STATE.RETRYABLE],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_PLANNED, EDGE_STATE.RETRYABLE],
  [TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_OBSERVED, EDGE_STATE.RETRYABLE],
]);

export const NODE_ID = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'active_gate_snapshot_coverage',
  PRIORITY_RECOVERY_PROGRESS: 'priority_recovery_progress',
  READINESS_STARTUP_SUPPORT: 'readiness_startup_support',
  TOP_FAILURE_REASONS: 'top_failure_reasons',
});

export const EDGE_ID = Object.freeze({
  PUBLICATION_ACK_CONVERGENCE: 'publication_ack_convergence',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'active_gate_snapshot_coverage',
  PRIORITY_RECOVERY_PARTITION_PROGRESS: 'priority_recovery_partition_progress',
  READINESS_STARTUP_SUPPORT: 'readiness_startup_support',
  TOP_FAILURE_REASONS: 'top_failure_reasons',
});

export const OWNER = Object.freeze({
  TOPOLOGY_PUBLICATION: 'topology_publication_owner',
  ACTIVE_GATE: 'startup_active_gate_owner',
  PRIORITY_RECOVERY: 'operation_workflow_owner',
  READINESS: 'startup_readiness_owner',
  FAILURE_CLASSIFIER: 'failure_classifier_owner',
});

export const BOUNDARY = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  SNAPSHOT_COVERAGE: 'snapshot_coverage',
  WORKFLOW_PROGRESS: 'workflow_progress',
  STARTUP_SUPPORT_EVIDENCE: 'startup_support_evidence',
  FAILURE_REASON_RANKING: 'failure_reason_ranking',
});

export const PROJECTION_HINT = Object.freeze({
  PUBLICATION_ACK: 'publication ack convergence is already closed; inspect successor edges',
  SNAPSHOT_COVERAGE: 'after priority progress closes, expect active gate snapshot coverage',
  PRIORITY_RECOVERY: 'advance or classify the selected priority recovery operation workflow',
  READINESS: 'after coverage improves, expect startup readiness support evidence to clear',
  TOP_REASONS: 'compare top reason ranking after the dominant frontier edge clears',
  UNKNOWN: 'artifact lacks enough evidence; collect failure bundle and triage summary',
});

export const REASON = Object.freeze({
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

export const SOURCE_PATH = Object.freeze({
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

export const SOURCE_FIELD = Object.freeze({
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

export const OWNER_WITNESS_FIELD = Object.freeze({
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

export const EDGE_ROOT_CAUSE_CLASS = Object.freeze({
  [EDGE_ID.PUBLICATION_ACK_CONVERGENCE]: ROOT_CAUSE_CLASS_TOPOLOGY,
  [EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS]: ROOT_CAUSE_CLASS_TOPOLOGY,
  [EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE]: ROOT_CAUSE_CLASS_STARTUP,
  [EDGE_ID.READINESS_STARTUP_SUPPORT]: ROOT_CAUSE_CLASS_STARTUP,
  [EDGE_ID.TOP_FAILURE_REASONS]: ROOT_CAUSE_CLASS_UNKNOWN,
});

export const OWNER_SUPPORTING_REASON_SET = Object.freeze(new Set([
  REASON.PUBLICATION_PUBLISHED,
  REASON.PUBLICATION_PENDING,
]));

export const ACTIVE_GATE_SNAPSHOT_CAUSE_RULES = Object.freeze([
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

export const ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_RULES = Object.freeze([
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

export const PUBLICATION_PENDING_STATUS_SET = Object.freeze(new Set([
  PUBLICATION_STATUS_OPEN,
  PUBLICATION_STATUS_ACK_PENDING,
]));

export const RANK = Object.freeze({
  PRIORITY_RECOVERY: 10,
  SNAPSHOT_COVERAGE: 20,
  READINESS: 30,
  PUBLICATION: 40,
  TOP_FAILURES: 50,
});

export const SEMANTIC_STATE = Object.freeze({
  PRIORITY_RECOVERY_RECOVERING_IN_FLIGHT:
    PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  PRIORITY_RECOVERY_SPREAD_SATISFIED_IN_FLIGHT:
    PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
});

export const PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
  ]));
export const PRIORITY_RECOVERY_NON_BLOCKING_WITNESS_SEMANTIC_STATE_SET =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_SEMANTIC_SPREAD_SATISFIED_IN_FLIGHT,
  ]));

export const READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS_STATE_SET =
  Object.freeze(new Set([
    ACTIVE_GATE_STATE_TIMED_OUT,
    ACTIVE_GATE_STATE_STALLED,
  ]));

export const DECISION_INPUT = Object.freeze({
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

export const DECISION_CONDITION = Object.freeze({
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

export const READINESS_SUPPORT_PATH = Object.freeze({
  READINESS_FAILURE: 'readiness_failure',
  INHERITED_ACTIVE_GATE_NO_PROGRESS: 'inherited_active_gate_no_progress',
});

export const DECISION_TABLE_ROWS = Object.freeze([
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

export const PUBLICATION_STATE_RULES = Object.freeze([
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
    matches: (evidence) =>
      evidence.publicationPending === true &&
      evidence.missingPublishedCount === SOURCE_ORDER_BASE,
  }),
  Object.freeze({
    state: EDGE_STATE.DEFERRED,
    reasons: Object.freeze([REASON.MISSING_PUBLISHED]),
    matches: (evidence) =>
      (evidence.missingPublishedCount > SOURCE_ORDER_BASE ||
       evidence.missingPublishedNodeIds.length > SOURCE_ORDER_BASE) &&
      evidence.prioritySpreadPending !== true &&
      (evidence.publicationStatus === PUBLICATION_STATUS_PUBLISHED &&
       evidence.pendingAckCount === SOURCE_ORDER_BASE &&
       (evidence.ackState === PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED ||
        evidence.ackState === PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED) &&
       evidence.revisionState === PUBLICATION_OWNER_REVISION_STATE_CURRENT &&
       evidence.streamOutcome === PUBLICATION_OWNER_STREAM_OUTCOME_STALE &&
       evidence.freshnessFence ===
         PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG &&
       evidence.recoveryOutcome ===
         PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER) !== true,
  }),
  Object.freeze({
    state: EDGE_STATE.SATISFIED,
    reasons: Object.freeze([]),
    matches: () => true,
  }),
]);

export const READINESS_RECOVERABILITY_RULES = Object.freeze([
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

export const READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES = Object.freeze([
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

export const REPLAY_DOMINANT_REASON_RULES = Object.freeze([
  Object.freeze({
    reason: 'publication_ack_blocked', // CAUSAL_FAILURE_CLASS.PUBLICATION_ACK_BLOCKED
    matches: (snapshot) =>
      snapshot.edgeId === EDGE_ID.PUBLICATION_ACK_CONVERGENCE &&
      snapshot.frontierState !== EDGE_STATE.SATISFIED &&
      snapshot.frontierState !== ABSENT_VALUE,
  }),
]);

export const SEVERITY_RANK = Object.freeze({
  [EDGE_STATE.TERMINAL_FAILED]: 0,
  [EDGE_STATE.BLOCKED]: 1,
  [EDGE_STATE.RETRYABLE]: 2,
  [EDGE_STATE.DEFERRED]: 3,
  [EDGE_STATE.UNKNOWN]: 4,
  [EDGE_STATE.SATISFIED]: 5,
});

export const UNSATISFIED_EDGE_STATES = Object.freeze([
  EDGE_STATE.BLOCKED,
  EDGE_STATE.DEFERRED,
  EDGE_STATE.RETRYABLE,
  EDGE_STATE.TERMINAL_FAILED,
  EDGE_STATE.UNKNOWN,
]);

export const NODE_DEFINITIONS = Object.freeze([
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

export function glossaryEntries(values) {
  return Object.entries(values).map(([name, value]) => ({
    name,
    value,
  }));
}

export function cloneDecisionTableRows() {
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
