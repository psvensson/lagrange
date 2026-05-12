/**
 * Read-only topology convergence diagnostic graph builder.
 *
 * The graph is derived from parsed failure-bundle, triage-summary, or report
 * artifacts. It does not mutate runtime state or reinterpret owner decisions.
 */

const ABSENT_VALUE = 'absent';
const UNKNOWN_VALUE = 'unknown';
const PATH_SEPARATOR = '.';
const LIST_SEPARATOR = ',';
const REASON_SEPARATOR = '|';
const SOURCE_ORDER_BASE = 0;
const FIRST_FRONTIER_INDEX = 0;
const SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1 =
  'topology-convergence-graph-v1';
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
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_STATUS_OPEN = 'OPEN';
const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
const PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING =
  'publication_pending';
const PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT = 'recovering_in_flight';
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const READINESS_RECOVERABILITY_TERMINAL = 'terminal';
const READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL = 'no_progress_terminal';
const READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS = 'stalled_no_progress';
const READINESS_SOURCE_UNKNOWN = 'unknown';
const READINESS_CAUSE_NONE = 'none';
const PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS = 'progress';
const PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY = 'summary';

const EDGE_STATE = Object.freeze({
  SATISFIED: 'satisfied',
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
  RETRYABLE: 'retryable',
  TERMINAL_FAILED: 'terminal_failed',
  UNKNOWN: 'unknown',
});

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
  SNAPSHOT_COVERAGE_INCOMPLETE: 'snapshot_coverage_incomplete',
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
  READINESS_FAILURE: 'summary.readinessFailure',
  TOP_REASONS: 'summary.topReasons',
});

const SOURCE_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  ACTIVE_GATE_PROGRESS: 'activeGateProgress',
  BEST_PROGRESS: 'bestProgress',
  BLOCKING_BOUNDARY: 'blockingBoundary',
  CURRENT_OWNER: 'currentOwner',
  DOMINANT_REASON: 'dominantReason',
  DOMINANT_WITNESS: 'dominantWitness',
  PROGRESS: 'progress',
  PRIORITY_RECOVERY_PROGRESS_CLASSES: 'priorityRecoveryProgressClasses',
  PRIORITY_RECOVERY_PROGRESS_SUMMARY: 'priorityRecoveryProgressSummary',
  READINESS_FAILURE: 'readinessFailure',
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
});

const DECISION_INPUT = Object.freeze({
  PUBLICATION_STATUS: 'publicationStatus',
  PENDING_ACK_COUNT: 'pendingAckCount',
  BLOCKED_NODE_COUNT: 'blockedNodeCount',
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
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
    'missing published node count is positive without priority spread pending',
  PUBLICATION_CLOSED: 'publication has no pending convergence blockers',
  PRIORITY_NO_UNRESOLVED_SEMANTIC_STATES:
    'priority recovery has no unresolved semantic states',
  PRIORITY_BLOCKED_PARTITIONS:
    'priority recovery has blocked partitions',
  PRIORITY_ONLY_RECOVERING_IN_FLIGHT:
    'priority recovery has only recovering_in_flight semantic state',
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
    'readiness no-progress is inherited from active-gate timeout',
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
    progressSummary,
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
      activeGateProgress: progressEvidence.sourcePath,
      readinessFailure: readinessFailureEvidence.sourcePath,
    },
    topReasons: normalizeTopReasons(firstArray(summary.topReasons, topFailures.topReasons)),
  };
}

function buildPublicationEdge(normalized) {
  const evidence = normalizePublicationEvidence(normalized.publication);
  const reasons = [];
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
  const reasons = [];
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
    },
    reasons,
    rank: RANK.PRIORITY_RECOVERY,
    dependencies: [EDGE_ID.PUBLICATION_ACK_CONVERGENCE],
    projectionHint: PROJECTION_HINT.PRIORITY_RECOVERY,
  });
}

function buildActiveGateSnapshotEdge(normalized) {
  const progress = normalized.progress;
  const reasons = [];
  const state = resolveActiveGateSnapshotState(normalized.activeGate, progress, reasons);

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
  const reasons = [];
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
  if (
    snapshot.activeGateState === ACTIVE_GATE_STATE_TIMED_OUT &&
    snapshot.classCode === READINESS_FAILURE_CLASS_NO_PROGRESS_TERMINAL &&
    snapshot.terminalReason === READINESS_TERMINAL_REASON_STALLED_NO_PROGRESS &&
    snapshot.source === READINESS_SOURCE_UNKNOWN &&
    snapshot.cause === READINESS_CAUSE_NONE
  ) {
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
  return evidence.missingPublishedCount > SOURCE_ORDER_BASE &&
    evidence.prioritySpreadPending !== true;
}

function normalizePriorityRecoveryEvidence(normalized) {
  const progress = normalized.progress;
  const progressSummary = normalized.progressSummary;
  const progressClasses = asRecord(progress.priorityRecoveryProgressClasses);
  const progressSummaryClasses = asRecord(
    progressSummary[SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_CLASSES],
  );
  const ownerBoundary = resolvePriorityRecoveryOwnerBoundary(progressSummary);
  const classSelection = selectPriorityRecoveryClassSelection(
    progressSummaryClasses,
    progressClasses,
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
    ),
    semanticStateIds: arrayOrEmpty(classSelection.classes.unresolvedSemanticStateIds),
    blockedPartitionIds: arrayOrEmpty(classSelection.classes.blockedPartitionIds),
  };
}

function resolvePriorityRecoveryState(priorityRecoveryEvidence, reasons) {
  if (priorityRecoveryEvidence.semanticStateIds.length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.PRIORITY_RECOVERY_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  if (isOnlyRecoveringInFlightPriorityRecoveryEvidence(
    priorityRecoveryEvidence,
  )) {
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

function resolvePriorityRecoveryOwnerBoundary(progressSummary) {
  const dominantWitness = asRecord(
    asRecord(progressSummary)[SOURCE_FIELD.DOMINANT_WITNESS],
  );
  const usesDominantWitness =
    firstText(dominantWitness[SOURCE_FIELD.CURRENT_OWNER], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.BLOCKING_BOUNDARY], ABSENT_VALUE) !==
      ABSENT_VALUE;
  return {
    owner: firstText(
      dominantWitness[SOURCE_FIELD.CURRENT_OWNER],
      OWNER.PRIORITY_RECOVERY,
    ),
    boundary: firstText(
      dominantWitness[SOURCE_FIELD.BLOCKING_BOUNDARY],
      BOUNDARY.WORKFLOW_PROGRESS,
    ),
    usesDominantWitness,
  };
}

function selectPriorityRecoveryClassSelection(progressSummaryClasses, progressClasses) {
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
  if (ownerBoundary.usesDominantWitness &&
      normalized.evidencePath.priorityRecoveryDominantWitness !== ABSENT_VALUE) {
    return normalized.evidencePath.priorityRecoveryDominantWitness;
  }
  if (evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY &&
      normalized.evidencePath.priorityRecoveryProgressSummary !== ABSENT_VALUE) {
    return normalized.evidencePath.priorityRecoveryProgressSummary;
  }
  return normalized.evidencePath.priorityRecoveryProgressClasses;
}

function resolveActiveGateSnapshotState(activeGate, progress, reasons) {
  if (progress.snapshotCoverageComplete === true || activeGate.ready === true) {
    reasons.push(REASON.ACTIVE_GATE_READY);
    return EDGE_STATE.SATISFIED;
  }
  if (activeGate.state === ACTIVE_GATE_STATE_TIMED_OUT) {
    reasons.push(REASON.ACTIVE_GATE_TIMED_OUT);
    reasons.push(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
    return EDGE_STATE.BLOCKED;
  }
  if (Object.keys(progress).length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.EVIDENCE_MISSING);
    return EDGE_STATE.UNKNOWN;
  }
  reasons.push(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
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

function normalizePublicationEvidence(publication) {
  return {
    publicationStatus: textOrUnknown(publication.publicationStatus),
    publicationPending: publication.publicationPending === true,
    recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
    pendingAckCount: numberOrZero(publication.pendingAckCount),
    blockedNodeCount: numberOrZero(publication.blockedNodeCount),
    missingPublishedCount: numberOrZero(publication.missingPublishedCount),
    prioritySpreadPending: publication.prioritySpreadPending === true,
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
    },
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

function joinValues(values) {
  if (values.length === SOURCE_ORDER_BASE) {
    return ABSENT_VALUE;
  }
  return values.map((value) => String(value)).join(LIST_SEPARATOR);
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
  selectTopologyConvergenceDominantWitness,
  flattenEvidencePath,
};
