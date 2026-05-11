const ABSENT_VALUE = 'absent';
const UNKNOWN_VALUE = 'unknown';
const NOT_APPLICABLE_VALUE = 'not_applicable';
const SCHEMA_VERSION_CAUSAL_ANALYSIS_SCHEMA_V1 = 'causal-analysis-schema-v1';
const SCHEMA_VERSION_CAUSAL_ANALYSIS_V1 = 'causal-analysis-v1';
const SCHEMA_VERSION_CAUSAL_GRAPH_V1 = 'causal-graph-v1';
const SCHEMA_VERSION_BUDGET_ACCOUNTING_V1 = 'budget-timeout-accounting-v1';
const SCHEMA_VERSION_INVARIANT_REVIEW_V1 = 'invariant-review-v1';
const SCHEMA_VERSION_FAILURE_TAXONOMY_V1 = 'failure-class-taxonomy-v1';
const SCHEMA_VERSION_STOP_DECISION_V1 = 'stop-condition-decision-v1';
const TYPE_OBJECT = 'object';
const TYPE_STRING = 'string';
const TYPE_NUMBER = 'number';
const BOOLEAN_TRUE_TEXT = 'true';
const BOOLEAN_FALSE_TEXT = 'false';
const ZERO_COUNT = 0;
const ONE_COUNT = 1;
const FIRST_INDEX = 0;
const PATH_SEPARATOR = '.';
const LIST_SEPARATOR = ',';
const RATIO_COMPLETE = 1;
const PERCENT_SCALE = 100;

const PHASE_ID = Object.freeze({
  STARTUP: 'startup',
  ACTIVE_GATE_SELECTION: 'active_gate_selection',
  BOOTSTRAP_IN_FLIGHT: 'bootstrap_in_flight',
  BOOTSTRAP_READY: 'bootstrap_ready',
  CONVERGENCE_WATCHDOG: 'convergence_watchdog',
  REBALANCE_PROVISIONING: 'rebalance_provisioning',
  REBALANCE_PLACEMENT: 'rebalance_placement',
  REBALANCE_COORDINATION: 'rebalance_coordination',
  REBALANCE_SETTLED: 'rebalance_settled',
  COMPLETION: 'completion',
});

const PHASE_STATE = Object.freeze({
  SATISFIED: 'satisfied',
  BLOCKED: 'blocked',
  WAITING: 'waiting',
  UNKNOWN: UNKNOWN_VALUE,
});

const EVIDENCE_KIND = Object.freeze({
  REPORT: 'report',
  FAILURE_BUNDLE: 'failure_bundle',
  TOPOLOGY_GRAPH: 'topology_graph',
  ACTIVE_GATE: 'active_gate',
  PRIORITY_RECOVERY: 'priority_recovery',
  READINESS: 'readiness',
  STABILITY_GATE: 'stability_gate',
  ERROR_TEXT: 'error_text',
});

const NODE_ROLE = Object.freeze({
  RESTART_COORDINATOR: 'restart_coordinator',
  SNAPSHOT_SOURCE: 'snapshot_source',
  ACTIVE_MEMBER: 'active_member',
  INACTIVE_MEMBER: 'inactive_member',
  MISSING_PUBLICATION: 'missing_publication',
  READINESS_BLOCKED: 'readiness_blocked',
  UNKNOWN: UNKNOWN_VALUE,
});

const DEPENDENCY_KIND = Object.freeze({
  PHASE_ORDER: 'phase_order',
  PUBLICATION_ACK: 'publication_ack',
  SNAPSHOT_COVERAGE: 'snapshot_coverage',
  PRIORITY_RECOVERY: 'priority_recovery',
  READINESS: 'readiness',
  STABILITY_GATE: 'stability_gate',
  CROSS_NODE_VISIBILITY: 'cross_node_visibility',
});

const BUDGET_KIND = Object.freeze({
  SCENARIO_DURATION: 'scenario_duration',
  ACTIVE_GATE_TIMEOUT: 'active_gate_timeout',
  ACTIVE_GATE_ATTEMPTS: 'active_gate_attempts',
  WORKFLOW_STEP_TIMEOUT: 'workflow_step_timeout',
  READINESS_RETRY_WINDOW: 'readiness_retry_window',
});

const BUDGET_STATE = Object.freeze({
  WITHIN: 'within_budget',
  EXHAUSTED: 'exhausted',
  CASCADE: 'cascade',
  UNKNOWN: UNKNOWN_VALUE,
  UNBOUNDED: 'unbounded',
});

const BUDGET_OWNERSHIP_STATE = Object.freeze({
  CLASSIFIED: 'classified',
  UNCLASSIFIED: 'unclassified',
});

const INVARIANT_KIND = Object.freeze({
  NODE_COUNT_BOUNDS: 'node_count_bounds',
  SNAPSHOT_COVERAGE_BOUNDS: 'snapshot_coverage_bounds',
  PUBLICATION_ACK_CLOSED: 'publication_ack_closed',
  PRIORITY_RECOVERY_CLASSIFIED: 'priority_recovery_classified',
  READINESS_BLOCKERS_EXPLAINED: 'readiness_blockers_explained',
  BUDGET_ACCOUNTED: 'budget_accounted',
});

const INVARIANT_STATE = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  UNKNOWN: UNKNOWN_VALUE,
});

const REPORT_OUTCOME = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  UNKNOWN: UNKNOWN_VALUE,
});

const FAILURE_CLASS = Object.freeze({
  ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE:
    'active_gate_snapshot_coverage_incomplete',
  STARTUP_READINESS_BLOCKED: 'startup_readiness_blocked',
  PRIORITY_RECOVERY_EVENT_WAIT: 'priority_recovery_event_wait',
  PUBLICATION_ACK_BLOCKED: 'publication_ack_blocked',
  BUDGET_TIMEOUT_CASCADE: 'budget_timeout_cascade',
  EVIDENCE_INCOMPLETE: 'evidence_incomplete',
  HEALTHY: 'healthy',
});

const RESOLUTION_STRATEGY = Object.freeze({
  LOCAL_RUNTIME_OWNER_FIX: 'local_runtime_owner_fix',
  WAIT_FOR_BOUNDED_PROGRESS: 'wait_for_bounded_progress',
  MIGRATE_OWNER_BOUNDARY: 'migrate_owner_boundary',
  WIDEN_ARCHITECTURE_WORK: 'widen_architecture_work',
  ACCEPT_CLASSIFIED_BACKPRESSURE: 'accept_classified_backpressure',
  ASK_HUMAN: 'ask_human',
  NO_ACTION: 'no_action',
});

const STOP_CONDITION = Object.freeze({
  ALL_INVARIANTS_PASSED: 'all_invariants_passed',
  CLASSIFIED_LOCAL_BLOCKER: 'classified_local_blocker',
  OWNER_BOUNDARY_MIGRATION: 'owner_boundary_migration',
  ARCHITECTURE_GAP: 'architecture_gap',
  CLASSIFIED_BACKPRESSURE: 'classified_backpressure',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
});

const STOP_OUTCOME = Object.freeze({
  CONTINUE_LOCAL_FIX: 'continue_local_fix',
  MIGRATE_OWNER_BOUNDARY: 'migrate_owner_boundary',
  WIDEN_ARCHITECTURE_WORK: 'widen_architecture_work',
  ACCEPT_CLASSIFIED_BACKPRESSURE: 'accept_classified_backpressure',
  ASK_HUMAN: 'ask_human',
  COMPLETE: 'complete',
});

const OWNER = Object.freeze({
  DIAGNOSTICS: 'diagnostics_owner',
  ACTIVE_GATE: 'startup_active_gate_owner',
  READINESS: 'startup_readiness_owner',
  OPERATION_WORKFLOW: 'operation_workflow_owner',
  TOPOLOGY_PUBLICATION: 'topology_publication_owner',
  HUMAN: 'human_operator',
});

const BOUNDARY = Object.freeze({
  CAUSAL_ANALYSIS: 'causal_analysis_framework',
  SNAPSHOT_COVERAGE: 'snapshot_coverage',
  WORKFLOW_PROGRESS: 'workflow_progress',
  STARTUP_SUPPORT_EVIDENCE: 'startup_support_evidence',
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  ARCHITECTURE: 'architecture_boundary',
});

const PHASE_MODEL = Object.freeze([
  Object.freeze({
    id: PHASE_ID.STARTUP,
    dependsOn: Object.freeze([]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.REPORT, EVIDENCE_KIND.READINESS]),
  }),
  Object.freeze({
    id: PHASE_ID.ACTIVE_GATE_SELECTION,
    dependsOn: Object.freeze([PHASE_ID.STARTUP]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.ACTIVE_GATE]),
  }),
  Object.freeze({
    id: PHASE_ID.BOOTSTRAP_IN_FLIGHT,
    dependsOn: Object.freeze([PHASE_ID.ACTIVE_GATE_SELECTION]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.READINESS]),
  }),
  Object.freeze({
    id: PHASE_ID.BOOTSTRAP_READY,
    dependsOn: Object.freeze([PHASE_ID.BOOTSTRAP_IN_FLIGHT]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.READINESS]),
  }),
  Object.freeze({
    id: PHASE_ID.CONVERGENCE_WATCHDOG,
    dependsOn: Object.freeze([PHASE_ID.BOOTSTRAP_READY]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.TOPOLOGY_GRAPH]),
  }),
  Object.freeze({
    id: PHASE_ID.REBALANCE_PROVISIONING,
    dependsOn: Object.freeze([PHASE_ID.CONVERGENCE_WATCHDOG]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.PRIORITY_RECOVERY]),
  }),
  Object.freeze({
    id: PHASE_ID.REBALANCE_PLACEMENT,
    dependsOn: Object.freeze([PHASE_ID.REBALANCE_PROVISIONING]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.PRIORITY_RECOVERY]),
  }),
  Object.freeze({
    id: PHASE_ID.REBALANCE_COORDINATION,
    dependsOn: Object.freeze([PHASE_ID.REBALANCE_PLACEMENT]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.PRIORITY_RECOVERY]),
  }),
  Object.freeze({
    id: PHASE_ID.REBALANCE_SETTLED,
    dependsOn: Object.freeze([PHASE_ID.REBALANCE_COORDINATION]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.STABILITY_GATE]),
  }),
  Object.freeze({
    id: PHASE_ID.COMPLETION,
    dependsOn: Object.freeze([PHASE_ID.REBALANCE_SETTLED]),
    evidenceKinds: Object.freeze([EVIDENCE_KIND.REPORT]),
  }),
]);

const FAILURE_CLASS_RESOLUTION_TABLE = Object.freeze({
  [FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE]:
    RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX,
  [FAILURE_CLASS.STARTUP_READINESS_BLOCKED]:
    RESOLUTION_STRATEGY.MIGRATE_OWNER_BOUNDARY,
  [FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT]:
    RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE,
  [FAILURE_CLASS.PUBLICATION_ACK_BLOCKED]:
    RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX,
  [FAILURE_CLASS.BUDGET_TIMEOUT_CASCADE]:
    RESOLUTION_STRATEGY.WIDEN_ARCHITECTURE_WORK,
  [FAILURE_CLASS.EVIDENCE_INCOMPLETE]: RESOLUTION_STRATEGY.ASK_HUMAN,
  [FAILURE_CLASS.HEALTHY]: RESOLUTION_STRATEGY.NO_ACTION,
});

const STOP_DECISION_TABLE = Object.freeze([
  Object.freeze({
    condition: STOP_CONDITION.ALL_INVARIANTS_PASSED,
    outcome: STOP_OUTCOME.COMPLETE,
    strategy: RESOLUTION_STRATEGY.NO_ACTION,
  }),
  Object.freeze({
    condition: STOP_CONDITION.ARCHITECTURE_GAP,
    outcome: STOP_OUTCOME.WIDEN_ARCHITECTURE_WORK,
    strategy: RESOLUTION_STRATEGY.WIDEN_ARCHITECTURE_WORK,
  }),
  Object.freeze({
    condition: STOP_CONDITION.OWNER_BOUNDARY_MIGRATION,
    outcome: STOP_OUTCOME.MIGRATE_OWNER_BOUNDARY,
    strategy: RESOLUTION_STRATEGY.MIGRATE_OWNER_BOUNDARY,
  }),
  Object.freeze({
    condition: STOP_CONDITION.CLASSIFIED_BACKPRESSURE,
    outcome: STOP_OUTCOME.ACCEPT_CLASSIFIED_BACKPRESSURE,
    strategy: RESOLUTION_STRATEGY.ACCEPT_CLASSIFIED_BACKPRESSURE,
  }),
  Object.freeze({
    condition: STOP_CONDITION.CLASSIFIED_LOCAL_BLOCKER,
    outcome: STOP_OUTCOME.CONTINUE_LOCAL_FIX,
    strategy: RESOLUTION_STRATEGY.LOCAL_RUNTIME_OWNER_FIX,
  }),
  Object.freeze({
    condition: STOP_CONDITION.INSUFFICIENT_EVIDENCE,
    outcome: STOP_OUTCOME.ASK_HUMAN,
    strategy: RESOLUTION_STRATEGY.ASK_HUMAN,
  }),
]);

function buildCausalAnalysisSchema() {
  return {
    schemaVersion: SCHEMA_VERSION_CAUSAL_ANALYSIS_SCHEMA_V1,
    owner: OWNER.DIAGNOSTICS,
    boundary: BOUNDARY.CAUSAL_ANALYSIS,
    phases: PHASE_MODEL.map(clonePhase),
    evidenceKinds: glossaryEntries(EVIDENCE_KIND),
    nodeRoles: glossaryEntries(NODE_ROLE),
    dependencyKinds: glossaryEntries(DEPENDENCY_KIND),
    budgetKinds: glossaryEntries(BUDGET_KIND),
    budgetStates: glossaryEntries(BUDGET_STATE),
    budgetOwnershipStates: glossaryEntries(BUDGET_OWNERSHIP_STATE),
    invariantKinds: glossaryEntries(INVARIANT_KIND),
    invariantStates: glossaryEntries(INVARIANT_STATE),
    reportOutcomes: glossaryEntries(REPORT_OUTCOME),
    failureClasses: glossaryEntries(FAILURE_CLASS),
    resolutionStrategies: glossaryEntries(RESOLUTION_STRATEGY),
    stopConditions: glossaryEntries(STOP_CONDITION),
    stopOutcomes: glossaryEntries(STOP_OUTCOME),
    failureClassResolutionTable: {...FAILURE_CLASS_RESOLUTION_TABLE},
    stopDecisionTable: STOP_DECISION_TABLE.map((row) => ({...row})),
  };
}

function clonePhase(phase) {
  return {
    id: phase.id,
    dependsOn: [...phase.dependsOn],
    evidenceKinds: [...phase.evidenceKinds],
  };
}

function glossaryEntries(values) {
  return Object.entries(values).map(([name, value]) => ({name, value}));
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

function firstRecord(...values) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > ZERO_COUNT) {
      return record;
    }
  }
  return {};
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > ZERO_COUNT) {
      return value;
    }
  }
  return [];
}

function textOrUnknown(value) {
  if (typeof value === TYPE_STRING && value.length > ZERO_COUNT) {
    return value;
  }
  return UNKNOWN_VALUE;
}

function textOrAbsent(value) {
  if (typeof value === TYPE_STRING && value.length > ZERO_COUNT) {
    return value;
  }
  return ABSENT_VALUE;
}

function numberOrUnknown(value) {
  return parseFiniteInput(value, UNKNOWN_VALUE);
}

function numberOrZero(value) {
  return parseFiniteInput(value, ZERO_COUNT);
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

function finiteOrAbsent(value) {
  return parseFiniteInput(value, ABSENT_VALUE);
}

function parseFiniteInput(value, fallback) {
  if (typeof value !== TYPE_STRING && typeof value !== TYPE_NUMBER) {
    return fallback;
  }
  if (typeof value === TYPE_STRING && value.length === ZERO_COUNT) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function joinValues(values) {
  if (values.length === ZERO_COUNT) {
    return ABSENT_VALUE;
  }
  return values.map((value) => String(value)).join(LIST_SEPARATOR);
}

function flattenEvidencePath(parentPath, childPath) {
  if (!parentPath || parentPath === ABSENT_VALUE) {
    return childPath;
  }
  return `${parentPath}${PATH_SEPARATOR}${childPath}`;
}

export {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  NOT_APPLICABLE_VALUE,
  SCHEMA_VERSION_CAUSAL_ANALYSIS_SCHEMA_V1,
  SCHEMA_VERSION_CAUSAL_ANALYSIS_V1,
  SCHEMA_VERSION_CAUSAL_GRAPH_V1,
  SCHEMA_VERSION_BUDGET_ACCOUNTING_V1,
  SCHEMA_VERSION_INVARIANT_REVIEW_V1,
  SCHEMA_VERSION_FAILURE_TAXONOMY_V1,
  SCHEMA_VERSION_STOP_DECISION_V1,
  ZERO_COUNT,
  ONE_COUNT,
  FIRST_INDEX,
  RATIO_COMPLETE,
  PERCENT_SCALE,
  PHASE_ID,
  PHASE_STATE,
  EVIDENCE_KIND,
  NODE_ROLE,
  DEPENDENCY_KIND,
  BUDGET_KIND,
  BUDGET_STATE,
  BUDGET_OWNERSHIP_STATE,
  INVARIANT_KIND,
  INVARIANT_STATE,
  REPORT_OUTCOME,
  FAILURE_CLASS,
  RESOLUTION_STRATEGY,
  STOP_CONDITION,
  STOP_OUTCOME,
  OWNER,
  BOUNDARY,
  PHASE_MODEL,
  FAILURE_CLASS_RESOLUTION_TABLE,
  STOP_DECISION_TABLE,
  buildCausalAnalysisSchema,
  asRecord,
  arrayOrEmpty,
  firstRecord,
  firstArray,
  textOrUnknown,
  textOrAbsent,
  numberOrUnknown,
  numberOrZero,
  booleanVariant,
  finiteOrAbsent,
  joinValues,
  flattenEvidencePath,
};
