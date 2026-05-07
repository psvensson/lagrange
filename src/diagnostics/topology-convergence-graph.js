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
const TYPE_OBJECT = 'object';
const TYPE_STRING = 'string';
const BOOLEAN_TRUE_TEXT = 'true';
const BOOLEAN_FALSE_TEXT = 'false';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT = 'recovering_in_flight';
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const READINESS_RECOVERABILITY_TERMINAL = 'terminal';

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
  READINESS_RETRYABLE: 'readiness_retryable',
  READINESS_SATISFIED: 'readiness_satisfied',
  TOP_FAILURES_PRESENT: 'top_failures_present',
  TOP_FAILURES_ABSENT: 'top_failures_absent',
  EVIDENCE_MISSING: 'evidence_missing',
});

const SOURCE_PATH = Object.freeze({
  REPORT_FAILURE_BUNDLE: 'report.failureBundle',
  FAILURE_BUNDLE_PUBLICATION: 'failureBundle.publicationConvergence',
  FAILURE_BUNDLE_SUMMARY: 'failureBundle.summary',
  TRIAGE_PUBLICATION: 'triageSummary.publicationConvergence',
  TRIAGE_SUMMARY: 'triageSummary.summary',
  REPORT_SCENARIO: 'report.scenarios[0]',
  REPORT_SCENARIO_PUBLICATION: 'report.scenarios[0].publicationConvergence',
  REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION:
    'report.scenarios[0].priorityRecoveryObservation',
  REPORT_SCENARIO_READINESS_FAILURE: 'report.scenarios[0].readinessFailure',
  PRIORITY_RECOVERY_PROGRESS_CLASSES:
    'publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses',
  ACTIVE_GATE_PROGRESS: 'publicationConvergence.activeGate.progress',
  READINESS_FAILURE: 'summary.readinessFailure',
  TOP_REASONS: 'summary.topReasons',
});

const SOURCE_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  ACTIVE_GATE_PROGRESS: 'activeGateProgress',
  ACTIVE_GATE_BEST_PROGRESS: 'activeGateBestProgress',
  BEST_PROGRESS: 'bestProgress',
  PROGRESS: 'progress',
  PRIORITY_RECOVERY_PROGRESS_CLASSES: 'priorityRecoveryProgressClasses',
  READINESS_FAILURE: 'readinessFailure',
});

const RANK = Object.freeze({
  PRIORITY_RECOVERY: 10,
  SNAPSHOT_COVERAGE: 20,
  READINESS: 30,
  PUBLICATION: 40,
  TOP_FAILURES: 50,
});

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
  const frontier = computeFrontier(edges);
  const nextExpectedFrontier = computeNextExpectedFrontier(edges, frontier);

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
    },
    nodes: NODE_DEFINITIONS.map((node) => ({...node})),
    edges,
    frontier,
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

function normalizeTopologyConvergenceInput(input) {
  const report = asRecord(input.report || input);
  const scenario = firstScenario(report);
  const failureBundle = firstFailureBundleEvidenceRecord(
    input.failureBundle,
    report.failureBundle,
    scenario.failureBundle,
  );
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
    recordCandidate(
      priorityRecoveryObservation.activeGateBestProgress,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.ACTIVE_GATE_BEST_PROGRESS,
      ),
    ),
    recordCandidate(scenario.priorityRecoveryProgress, SOURCE_PATH.REPORT_SCENARIO),
    recordCandidate(scenario.priorityRecoveryProgressSummary, SOURCE_PATH.REPORT_SCENARIO),
  );
  const progress = progressEvidence.record;
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
      failureBundle: Object.keys(failureBundle).length > SOURCE_ORDER_BASE ?
        SOURCE_PATH.REPORT_FAILURE_BUNDLE :
        ABSENT_VALUE,
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
    readinessFailure,
    evidencePath: {
      publication: publicationEvidence.sourcePath,
      priorityRecoveryProgressClasses: progressEvidence.sourcePath === ABSENT_VALUE ?
        SOURCE_PATH.PRIORITY_RECOVERY_PROGRESS_CLASSES :
        flattenEvidencePath(
          progressEvidence.sourcePath,
          SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_CLASSES,
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
  const progress = normalized.progress;
  const classes = asRecord(progress.priorityRecoveryProgressClasses);
  const semanticStateIds = arrayOrEmpty(classes.unresolvedSemanticStateIds);
  const blockedPartitionIds = arrayOrEmpty(classes.blockedPartitionIds);
  const reasons = [];
  const state = resolvePriorityRecoveryState(progress, semanticStateIds, reasons);

  return buildEdge({
    id: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    from: NODE_ID.PRIORITY_RECOVERY_PROGRESS,
    to: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    state,
    owner: OWNER.PRIORITY_RECOVERY,
    boundary: BOUNDARY.WORKFLOW_PROGRESS,
    evidencePath: normalized.evidencePath.priorityRecoveryProgressClasses,
    source: {
      unresolvedSemanticStateIds: joinValues(semanticStateIds),
      blockedPartitionIds: joinValues(blockedPartitionIds),
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
      blockers: joinValues(arrayOrEmpty(progress.blockers)),
    },
    reasons,
    rank: RANK.SNAPSHOT_COVERAGE,
    dependencies: [EDGE_ID.PUBLICATION_ACK_CONVERGENCE],
    projectionHint: PROJECTION_HINT.SNAPSHOT_COVERAGE,
  });
}

function buildReadinessEdge(normalized) {
  const readiness = normalized.readinessFailure;
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
      cause: textOrUnknown(readiness.cause),
      source: textOrUnknown(readiness.source),
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
    state: normalized.topReasons.length > SOURCE_ORDER_BASE ?
      EDGE_STATE.DEFERRED :
      EDGE_STATE.UNKNOWN,
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

function computeFrontier(edges) {
  const satisfiedIds = new Set(
    edges.filter((edge) => edge.state === EDGE_STATE.SATISFIED).map((edge) => edge.id),
  );

  return edges
    .filter((edge) => UNSATISFIED_EDGE_STATES.includes(edge.state))
    .filter((edge) => edge.dependencies.every((dependencyId) => satisfiedIds.has(dependencyId)))
    .sort(compareFrontierEdges)
    .map((edge) => ({...edge}));
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
  if (evidence.publicationStatus !== PUBLICATION_STATUS_PUBLISHED) {
    reasons.push(REASON.PUBLICATION_PENDING);
    return EDGE_STATE.BLOCKED;
  }
  reasons.push(REASON.PUBLICATION_PUBLISHED);
  if (evidence.pendingAckCount > SOURCE_ORDER_BASE) {
    reasons.push(REASON.PENDING_ACKS);
    return EDGE_STATE.BLOCKED;
  }
  if (evidence.blockedNodeCount > SOURCE_ORDER_BASE) {
    reasons.push(REASON.BLOCKED_NODES);
    return EDGE_STATE.BLOCKED;
  }
  if (evidence.missingPublishedCount > SOURCE_ORDER_BASE) {
    reasons.push(REASON.MISSING_PUBLISHED);
    return EDGE_STATE.DEFERRED;
  }
  return EDGE_STATE.SATISFIED;
}

function resolvePriorityRecoveryState(progress, semanticStateIds, reasons) {
  if (semanticStateIds.length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.PRIORITY_RECOVERY_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  if (Number(progress.priorityBlockedPartitionCount) > SOURCE_ORDER_BASE) {
    if (semanticStateIds.includes(PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT)) {
      reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    }
    reasons.push(REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED);
    return EDGE_STATE.BLOCKED;
  }
  if (semanticStateIds.includes(PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT)) {
    reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    return EDGE_STATE.RETRYABLE;
  }
  reasons.push(REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED);
  return EDGE_STATE.BLOCKED;
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
    pendingAckCount: numberOrZero(publication.pendingAckCount),
    blockedNodeCount: numberOrZero(publication.blockedNodeCount),
    missingPublishedCount: numberOrZero(publication.missingPublishedCount),
    source: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      pendingAckCount: numberOrUnknown(publication.pendingAckCount),
      blockedNodeCount: numberOrUnknown(publication.blockedNodeCount),
      missingPublishedCount: numberOrUnknown(publication.missingPublishedCount),
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

function firstFailureBundleEvidenceRecord(...values) {
  for (const value of values) {
    const record = asRecord(value);
    if (hasFailureBundleEvidence(record)) {
      return record;
    }
  }
  return {};
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

function flattenEvidencePath(parentPath, childPath) {
  if (!parentPath || parentPath === ABSENT_VALUE) {
    return childPath;
  }
  return `${parentPath}${PATH_SEPARATOR}${childPath}`;
}

export {
  EDGE_STATE,
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceGraphFromArtifacts,
  flattenEvidencePath,
};
