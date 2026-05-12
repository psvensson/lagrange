import {
  ABSENT_VALUE,
  SCHEMA_VERSION_CAUSAL_GRAPH_V1,
  ZERO_COUNT,
  FIRST_INDEX,
  PHASE_MODEL,
  PHASE_STATE,
  REPORT_OUTCOME,
  EVIDENCE_KIND,
  NODE_ROLE,
  DEPENDENCY_KIND,
  BOUNDARY,
  PHASE_ID,
  asRecord,
  arrayOrEmpty,
  firstRecord,
  textOrUnknown,
  textOrAbsent,
  numberOrUnknown,
  numberOrZero,
  booleanVariant,
} from './causal-analysis-schema.js';
import {
  EDGE_STATE,
  EDGE_ID,
  REASON,
  buildTopologyConvergenceGraph,
} from './topology-convergence-graph.js';

const NODE_TYPE_PHASE = 'phase';
const NODE_TYPE_ROLLING_RESTART_NODE = 'rolling_restart_node';
const NODE_TYPE_TOPOLOGY_EDGE = 'topology_edge';
const EDGE_TYPE_PHASE = 'phase_dependency';
const EDGE_TYPE_TOPOLOGY = 'topology_dependency';
const EDGE_TYPE_NODE = 'node_dependency';
const NODE_ID_PREFIX_PHASE = 'phase:';
const NODE_ID_PREFIX_TOPOLOGY = 'topology:';
const NODE_ID_PREFIX_MEMBER = 'member:';
const NODE_ID_SELECTED_SNAPSHOT = 'selected_snapshot';
const DIRECT_INPUT_PROVIDED = 'provided';
const WAIT_MODE_EVENT_DRIVEN = 'event_driven';
const WAIT_STATE_ACTIVE = 'active';
const WAIT_STATE_ABSENT = ABSENT_VALUE;
const ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const BOOLEAN_PASSED = true;
const BOOLEAN_FAILED = false;
const EDGE_STATE_SATISFIED = EDGE_STATE.SATISFIED;
const READINESS_FAILURE_NODE_ID = 'startup_readiness_failure';
const READINESS_FAILURE_REASON_SEPARATOR = '=';
const READINESS_FAILURE_REASON_MODE = 'mode';
const READINESS_FAILURE_REASON_CLASS_CODE = 'classCode';
const READINESS_FAILURE_REASON_RECOVERABILITY = 'recoverability';
const READINESS_FAILURE_REASON_TERMINAL_REASON = 'terminalReason';
const READINESS_FAILURE_REASON_SOURCE = 'source';
const READINESS_FAILURE_REASON_CAUSE = 'cause';
const READINESS_FAILURE_REASON_ERROR = 'error';
const READINESS_FAILURE_REASON_ATTEMPTS_SINCE_PROGRESS = 'attemptsSinceProgress';
const READINESS_FAILURE_REASON_MAX_ATTEMPTS = 'maxAttempts';
const READINESS_FAILURE_REASON_STALLED = 'stalled';
const EVIDENCE_PATH_READINESS_NODE_REASONS = 'readiness.nodeReasonsByNodeId';
const EVIDENCE_PATH_READINESS_FAILURE = 'summary.readinessFailure';
const READINESS_FAILURE_REASON_FIELDS = Object.freeze([
  Object.freeze({
    label: READINESS_FAILURE_REASON_MODE,
    select: (failure) => textOrUnknown(failure.mode),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_CLASS_CODE,
    select: (failure) => textOrUnknown(failure.classCode),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_RECOVERABILITY,
    select: (failure) => textOrUnknown(failure.recoverability),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_TERMINAL_REASON,
    select: (failure) => textOrUnknown(failure.terminalReason),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_SOURCE,
    select: (failure) => textOrUnknown(failure.source),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_CAUSE,
    select: (failure) => textOrUnknown(failure.cause),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_ERROR,
    select: (failure) => textOrUnknown(failure.error),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_ATTEMPTS_SINCE_PROGRESS,
    select: (failure) => numberOrUnknown(asRecord(failure.progressSignal).attemptsSinceProgress),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_MAX_ATTEMPTS,
    select: (failure) => numberOrUnknown(asRecord(failure.progressSignal).maxAttempts),
  }),
  Object.freeze({
    label: READINESS_FAILURE_REASON_STALLED,
    select: (failure) => booleanVariant(asRecord(failure.progressSignal).stalled),
  }),
]);
const TOPOLOGY_PUBLICATION_REASON_SET = Object.freeze(new Set([
  REASON.PUBLICATION_PUBLISHED,
  REASON.PUBLICATION_PENDING,
  REASON.PENDING_ACKS,
  REASON.BLOCKED_NODES,
  REASON.MISSING_PUBLISHED,
]));
const TOPOLOGY_PRIORITY_RECOVERY_REASON_SET = Object.freeze(new Set([
  REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED,
  REASON.PRIORITY_RECOVERY_RETRYABLE,
  REASON.PRIORITY_RECOVERY_SATISFIED,
]));
const TOPOLOGY_SNAPSHOT_REASON_SET = Object.freeze(new Set([
  REASON.SNAPSHOT_COVERAGE_INCOMPLETE,
  REASON.ACTIVE_GATE_TIMED_OUT,
  REASON.ACTIVE_GATE_READY,
]));
const TOPOLOGY_READINESS_REASON_SET = Object.freeze(new Set([
  REASON.READINESS_TERMINAL,
  REASON.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS,
  REASON.READINESS_RETRYABLE,
  REASON.READINESS_SATISFIED,
]));
const TOPOLOGY_STABILITY_REASON_SET = Object.freeze(new Set([
  REASON.TOP_FAILURES_PRESENT,
  REASON.TOP_FAILURES_ABSENT,
]));
const TOPOLOGY_DEPENDENCY_KIND_RULES = Object.freeze([
  Object.freeze({
    dependencyKind: DEPENDENCY_KIND.PRIORITY_RECOVERY,
    matches: (snapshot) =>
      snapshot.edgeId === EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS ||
      snapshot.dependencyId === EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS ||
      snapshot.edgeBoundary === BOUNDARY.WORKFLOW_PROGRESS ||
      snapshot.dependencyBoundary === BOUNDARY.WORKFLOW_PROGRESS ||
      hasAnyReason(snapshot.edgeReasons, TOPOLOGY_PRIORITY_RECOVERY_REASON_SET),
  }),
  Object.freeze({
    dependencyKind: DEPENDENCY_KIND.PUBLICATION_ACK,
    matches: (snapshot) =>
      snapshot.dependencyId === EDGE_ID.PUBLICATION_ACK_CONVERGENCE ||
      snapshot.dependencyBoundary === BOUNDARY.PUBLICATION_CONVERGENCE ||
      hasAnyReason(snapshot.dependencyReasons, TOPOLOGY_PUBLICATION_REASON_SET),
  }),
  Object.freeze({
    dependencyKind: DEPENDENCY_KIND.SNAPSHOT_COVERAGE,
    matches: (snapshot) =>
      snapshot.dependencyId === EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE ||
      snapshot.dependencyBoundary === BOUNDARY.SNAPSHOT_COVERAGE ||
      hasAnyReason(snapshot.dependencyReasons, TOPOLOGY_SNAPSHOT_REASON_SET),
  }),
  Object.freeze({
    dependencyKind: DEPENDENCY_KIND.READINESS,
    matches: (snapshot) =>
      snapshot.dependencyId === EDGE_ID.READINESS_STARTUP_SUPPORT ||
      snapshot.dependencyBoundary === BOUNDARY.STARTUP_SUPPORT_EVIDENCE ||
      hasAnyReason(snapshot.dependencyReasons, TOPOLOGY_READINESS_REASON_SET),
  }),
  Object.freeze({
    dependencyKind: DEPENDENCY_KIND.STABILITY_GATE,
    matches: (snapshot) =>
      snapshot.edgeId === EDGE_ID.TOP_FAILURE_REASONS ||
      hasAnyReason(snapshot.edgeReasons, TOPOLOGY_STABILITY_REASON_SET),
  }),
]);
const REPORT_OUTCOME_RULES = Object.freeze([
  Object.freeze({
    outcome: REPORT_OUTCOME.PASSED,
    matches: (snapshot) => snapshot.scenarioPassed === BOOLEAN_PASSED,
  }),
  Object.freeze({
    outcome: REPORT_OUTCOME.PASSED,
    matches: (snapshot) => snapshot.summaryPassed === BOOLEAN_PASSED,
  }),
  Object.freeze({
    outcome: REPORT_OUTCOME.FAILED,
    matches: (snapshot) => snapshot.scenarioPassed === BOOLEAN_FAILED,
  }),
  Object.freeze({
    outcome: REPORT_OUTCOME.FAILED,
    matches: (snapshot) => snapshot.summaryPassed === BOOLEAN_FAILED,
  }),
  Object.freeze({
    outcome: REPORT_OUTCOME.FAILED,
    matches: (snapshot) => snapshot.reportFailedCount > ZERO_COUNT,
  }),
  Object.freeze({
    outcome: REPORT_OUTCOME.PASSED,
    matches: (snapshot) =>
      snapshot.reportPassedCount > ZERO_COUNT &&
      snapshot.reportFailedCount === ZERO_COUNT,
  }),
  Object.freeze({
    outcome: REPORT_OUTCOME.UNKNOWN,
    matches: () => true,
  }),
]);
const DIRECT_FAILURE_BUNDLE_EVIDENCE_SELECTORS = Object.freeze([
  (record) => asRecord(record.publicationConvergence),
  (record) => asRecord(record.readiness),
  (record) => asRecord(record.topFailures),
]);
const FAILURE_BUNDLE_EVIDENCE_RULES = Object.freeze([
  Object.freeze({
    select: (snapshot) => asRecord(snapshot.input.failureBundle),
    matches: (snapshot) => hasRecordEvidence(snapshot.input.failureBundle),
  }),
  Object.freeze({
    select: (snapshot) => asRecord(snapshot.input),
    matches: (snapshot) => hasDirectFailureBundleEvidence(snapshot.input, snapshot.report),
  }),
  Object.freeze({
    select: (snapshot) => asRecord(snapshot.report.failureBundle),
    matches: (snapshot) => hasRecordEvidence(snapshot.report.failureBundle),
  }),
  Object.freeze({
    select: (snapshot) => asRecord(snapshot.scenario.failureBundle),
    matches: (snapshot) => hasRecordEvidence(snapshot.scenario.failureBundle),
  }),
  Object.freeze({
    select: () => ({}),
    matches: () => true,
  }),
]);

function buildCausalGraph(input = {}) {
  const normalized = normalizeCausalInput(input);
  const topologyGraph = buildTopologyConvergenceGraph(input);
  const phaseNodes = buildPhaseNodes(normalized, topologyGraph);
  const topologyNodes = topologyGraph.edges.map(buildTopologyNode);
  const memberNodes = buildMemberNodes(normalized);
  const phaseEdges = buildPhaseEdges();
  const topologyEdges = buildTopologyEdges(topologyGraph);
  const memberEdges = buildMemberEdges(normalized, topologyGraph);
  const edges = [...phaseEdges, ...topologyEdges, ...memberEdges];
  const waits = buildWaits(normalized);
  const criticalPath = buildCriticalPath(topologyGraph, waits);
  const suspectNodes = buildSuspectNodes(memberNodes, normalized);

  return {
    schemaVersion: SCHEMA_VERSION_CAUSAL_GRAPH_V1,
    scenario: normalized.scenario,
    generatedFrom: normalized.generatedFrom,
    phaseModel: phaseNodes,
    nodes: [...phaseNodes, ...topologyNodes, ...memberNodes],
    edges,
    waits,
    criticalPath,
    suspectNodes,
    summary: {
      phaseCount: phaseNodes.length,
      nodeCount: phaseNodes.length + topologyNodes.length + memberNodes.length,
      edgeCount: edges.length,
      waitCount: waits.length,
      suspectNodeCount: suspectNodes.length,
      firstCriticalPathNodeId: textOrAbsent(criticalPath[FIRST_INDEX]?.nodeId),
      firstFrontierEdgeId: textOrAbsent(topologyGraph.summary.firstFrontierEdgeId),
    },
  };
}

function normalizeCausalInput(input) {
  const report = selectReport(input);
  const scenario = asRecord(arrayOrEmpty(report.scenarios)[FIRST_INDEX]);
  const failureBundle = selectFailureBundleEvidence(input, report, scenario);
  const reportSummary = firstRecord(failureBundle.reportSummary, report.summary);
  const summary = firstRecord(failureBundle.summary, scenario, report.summary);
  const publication = firstRecord(
    failureBundle.publicationConvergence,
    summary.publicationConvergence,
    scenario.publicationConvergence,
  );
  const activeGate = asRecord(publication.activeGate);
  const progress = asRecord(activeGate.progress);
  const progressSummary = asRecord(publication.priorityRecoveryProgressSummary);
  const dominantWitness = asRecord(progressSummary.dominantWitness);
  const readinessEvidence = normalizeReadinessEvidence(failureBundle, scenario, summary);
  const reportOutcome = resolveReportOutcome({
    report,
    scenario,
    summary,
  });

  return {
    scenario: textOrUnknown(failureBundle.scenario || scenario.scenario),
    reportOutcome,
    generatedFrom: buildGeneratedFrom(input, report, failureBundle),
    report,
    scenarioRecord: scenario,
    failureBundle,
    reportSummary,
    summary,
    publication,
    activeGate,
    progress,
    progressSummary,
    dominantWitness,
    readiness: readinessEvidence.readiness,
    readinessFailure: readinessEvidence.readinessFailure,
    readinessEvidencePath: readinessEvidence.evidencePath,
    nodeReasonsByNodeId: readinessEvidence.nodeReasonsByNodeId,
  };
}

function selectFailureBundleEvidence(input, report, scenario) {
  const snapshot = {
    input,
    report,
    scenario,
  };
  const rule = FAILURE_BUNDLE_EVIDENCE_RULES.find((candidate) => candidate.matches(snapshot));
  return rule.select(snapshot);
}

function hasDirectFailureBundleEvidence(input, report) {
  const snapshot = {
    report,
    explicitFailureBundle: asRecord(input.failureBundle),
    directEvidenceFound: DIRECT_FAILURE_BUNDLE_EVIDENCE_SELECTORS.some((select) =>
      hasRecordEvidence(select(asRecord(input))),
    ),
  };
  const rules = [
    {
      direct: false,
      matches: (candidate) => hasRecordEvidence(candidate.report),
    },
    {
      direct: false,
      matches: (candidate) => hasRecordEvidence(candidate.explicitFailureBundle),
    },
    {
      direct: true,
      matches: (candidate) => candidate.directEvidenceFound,
    },
    {
      direct: false,
      matches: () => true,
    },
  ];
  return rules.find((rule) => rule.matches(snapshot)).direct;
}

function hasRecordEvidence(value) {
  return Object.keys(asRecord(value)).length > ZERO_COUNT;
}

function resolveReportOutcome({report, scenario, summary}) {
  const reportSummary = asRecord(report.summary);
  const snapshot = {
    scenarioPassed: scenario.passed,
    summaryPassed: summary.passed,
    reportPassedCount: numberOrZero(reportSummary.passed),
    reportFailedCount: numberOrZero(reportSummary.failed),
  };
  return REPORT_OUTCOME_RULES.find((rule) => rule.matches(snapshot)).outcome;
}

function normalizeReadinessEvidence(failureBundle, scenario, summary) {
  const readiness = firstRecord(failureBundle.readiness, scenario.readiness);
  const readinessFailure = firstRecord(
    failureBundle.readinessFailure,
    scenario.readinessFailure,
    summary.readinessFailure,
  );
  return {
    readiness,
    readinessFailure,
    evidencePath: selectReadinessEvidencePath(readiness, readinessFailure),
    nodeReasonsByNodeId: normalizeReadinessNodeReasons(readiness, readinessFailure),
  };
}

function normalizeReadinessNodeReasons(readiness, readinessFailure) {
  return firstRecord(
    asRecord(readiness.nodeReasonsByNodeId),
    buildReadinessFailureNodeReasons(readinessFailure),
  );
}

function buildReadinessFailureNodeReasons(readinessFailure) {
  const reasons = buildReadinessFailureReasons(readinessFailure);
  if (reasons.length === ZERO_COUNT) {
    return {};
  }
  return {
    [READINESS_FAILURE_NODE_ID]: reasons,
  };
}

function buildReadinessFailureReasons(readinessFailure) {
  const failure = asRecord(readinessFailure);
  if (Object.keys(failure).length === ZERO_COUNT) {
    return [];
  }
  return READINESS_FAILURE_REASON_FIELDS.map((field) =>
    `${field.label}${READINESS_FAILURE_REASON_SEPARATOR}${field.select(failure)}`,
  );
}

function selectReadinessEvidencePath(readiness, readinessFailure) {
  const rules = [
    {
      path: EVIDENCE_PATH_READINESS_NODE_REASONS,
      matches: () => Object.keys(asRecord(readiness.nodeReasonsByNodeId)).length > ZERO_COUNT,
    },
    {
      path: EVIDENCE_PATH_READINESS_FAILURE,
      matches: () => Object.keys(asRecord(readinessFailure)).length > ZERO_COUNT,
    },
    {path: ABSENT_VALUE, matches: () => true},
  ];
  return rules.find((rule) => rule.matches()).path;
}

function buildGeneratedFrom(input, report, failureBundle) {
  return {
    report: Object.keys(report).length > ZERO_COUNT ? EVIDENCE_KIND.REPORT : ABSENT_VALUE,
    failureBundle: Object.keys(failureBundle).length > ZERO_COUNT ?
      EVIDENCE_KIND.FAILURE_BUNDLE :
      ABSENT_VALUE,
    directInput: Object.keys(asRecord(input)).length > ZERO_COUNT ?
      DIRECT_INPUT_PROVIDED :
      ABSENT_VALUE,
  };
}

function selectReport(input) {
  const explicitReport = asRecord(input.report);
  if (arrayOrEmpty(explicitReport.scenarios).length > ZERO_COUNT) {
    return explicitReport;
  }
  if (arrayOrEmpty(input.scenarios).length > ZERO_COUNT) {
    return input;
  }
  return {};
}

function buildPhaseNodes(normalized, topologyGraph) {
  const states = resolvePhaseStates(normalized, topologyGraph);
  return PHASE_MODEL.map((phase) => ({
    id: `${NODE_ID_PREFIX_PHASE}${phase.id}`,
    type: NODE_TYPE_PHASE,
    phaseId: phase.id,
    state: states[phase.id] || PHASE_STATE.UNKNOWN,
    evidenceKinds: [...phase.evidenceKinds],
    dependsOn: phase.dependsOn.map((dependencyId) => `${NODE_ID_PREFIX_PHASE}${dependencyId}`),
  }));
}

function resolvePhaseStates(normalized, topologyGraph) {
  const activeGateReady = normalized.activeGate.ready === true;
  const snapshotCovered = normalized.progress.snapshotCoverageComplete === true;
  const publicationSatisfied = topologyGraph.edges.every((edge) =>
    edge.id !== 'publication_ack_convergence' || edge.state === EDGE_STATE_SATISFIED,
  );
  const prioritySatisfied = topologyGraph.edges.every((edge) =>
    edge.id !== 'priority_recovery_partition_progress' ||
      edge.state === EDGE_STATE_SATISFIED,
  );
  const reportPassed = normalized.summary.passed === true;
  return {
    [PHASE_ID.STARTUP]: Object.keys(normalized.summary).length > ZERO_COUNT ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.UNKNOWN,
    [PHASE_ID.ACTIVE_GATE_SELECTION]: Object.keys(normalized.activeGate).length > ZERO_COUNT ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.UNKNOWN,
    [PHASE_ID.BOOTSTRAP_IN_FLIGHT]: activeGateReady ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.BLOCKED,
    [PHASE_ID.BOOTSTRAP_READY]: activeGateReady ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.BLOCKED,
    [PHASE_ID.CONVERGENCE_WATCHDOG]: publicationSatisfied ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.BLOCKED,
    [PHASE_ID.REBALANCE_PROVISIONING]: prioritySatisfied ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.WAITING,
    [PHASE_ID.REBALANCE_PLACEMENT]: snapshotCovered ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.BLOCKED,
    [PHASE_ID.REBALANCE_COORDINATION]: snapshotCovered ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.BLOCKED,
    [PHASE_ID.REBALANCE_SETTLED]: activeGateReady ?
      PHASE_STATE.SATISFIED :
      PHASE_STATE.BLOCKED,
    [PHASE_ID.COMPLETION]: reportPassed ? PHASE_STATE.SATISFIED : PHASE_STATE.BLOCKED,
  };
}

function buildTopologyNode(edge) {
  return {
    id: `${NODE_ID_PREFIX_TOPOLOGY}${edge.id}`,
    type: NODE_TYPE_TOPOLOGY_EDGE,
    role: NODE_ROLE.RESTART_COORDINATOR,
    state: edge.state,
    owner: edge.owner,
    boundary: edge.boundary,
    reasons: [...edge.reasons],
    evidencePath: edge.evidencePath,
  };
}

function buildMemberNodes(normalized) {
  const nodeIds = collectNodeIds(normalized);
  return nodeIds.map((nodeId) => buildMemberNode(nodeId, normalized));
}

function collectNodeIds(normalized) {
  const nodeIds = new Set();
  for (const nodeId of Object.keys(normalized.nodeReasonsByNodeId)) {
    nodeIds.add(nodeId);
  }
  for (const nodeId of arrayOrEmpty(normalized.progress.selectedPublishedActiveNodeIds)) {
    nodeIds.add(nodeId);
  }
  for (const nodeId of arrayOrEmpty(normalized.progress.selectedMissingPublishedNodeIds)) {
    nodeIds.add(nodeId);
  }
  const selectedSnapshotNodeId = textOrAbsent(normalized.progress.selectedSnapshotNodeId);
  if (selectedSnapshotNodeId !== ABSENT_VALUE) {
    nodeIds.add(selectedSnapshotNodeId);
  }
  return [...nodeIds].sort();
}

function buildMemberNode(nodeId, normalized) {
  const reasons = arrayOrEmpty(normalized.nodeReasonsByNodeId[nodeId]);
  const selectedSnapshotNodeId = textOrAbsent(normalized.progress.selectedSnapshotNodeId);
  const role = selectMemberRole({
    nodeId,
    reasons,
    selectedSnapshotNodeId,
    activeNodeIds: arrayOrEmpty(normalized.progress.selectedPublishedActiveNodeIds),
    missingNodeIds: arrayOrEmpty(normalized.progress.selectedMissingPublishedNodeIds),
  });
  return {
    id: `${NODE_ID_PREFIX_MEMBER}${nodeId}`,
    type: NODE_TYPE_ROLLING_RESTART_NODE,
    nodeId,
    role,
    state: role === NODE_ROLE.INACTIVE_MEMBER || role === NODE_ROLE.READINESS_BLOCKED ?
      PHASE_STATE.BLOCKED :
      PHASE_STATE.SATISFIED,
    reasons,
    snapshotSource: booleanVariant(nodeId === selectedSnapshotNodeId),
  };
}

function selectMemberRole(evidence) {
  const rules = [
    {
      role: NODE_ROLE.SNAPSHOT_SOURCE,
      matches: () => evidence.nodeId === evidence.selectedSnapshotNodeId,
    },
    {
      role: NODE_ROLE.MISSING_PUBLICATION,
      matches: () => evidence.missingNodeIds.includes(evidence.nodeId),
    },
    {
      role: NODE_ROLE.READINESS_BLOCKED,
      matches: () => evidence.reasons.length > ZERO_COUNT,
    },
    {
      role: NODE_ROLE.ACTIVE_MEMBER,
      matches: () => evidence.activeNodeIds.includes(evidence.nodeId),
    },
    {role: NODE_ROLE.UNKNOWN, matches: () => true},
  ];
  return rules.find((rule) => rule.matches()).role;
}

function buildPhaseEdges() {
  return PHASE_MODEL.flatMap((phase) => phase.dependsOn.map((dependencyId) => ({
    id: `${EDGE_TYPE_PHASE}:${dependencyId}:${phase.id}`,
    type: EDGE_TYPE_PHASE,
    from: `${NODE_ID_PREFIX_PHASE}${dependencyId}`,
    to: `${NODE_ID_PREFIX_PHASE}${phase.id}`,
    dependencyKind: DEPENDENCY_KIND.PHASE_ORDER,
    state: PHASE_STATE.SATISFIED,
  })));
}

function buildTopologyEdges(topologyGraph) {
  const topologyEdgesById = new Map(topologyGraph.edges.map((edge) => [edge.id, edge]));
  return topologyGraph.edges.flatMap((edge) => edge.dependencies.map((dependencyId) => ({
    id: `${EDGE_TYPE_TOPOLOGY}:${dependencyId}:${edge.id}`,
    type: EDGE_TYPE_TOPOLOGY,
    from: `${NODE_ID_PREFIX_TOPOLOGY}${dependencyId}`,
    to: `${NODE_ID_PREFIX_TOPOLOGY}${edge.id}`,
    dependencyKind: selectTopologyDependencyKind(edge, dependencyId, topologyEdgesById),
    state: edge.state,
  })));
}

function selectTopologyDependencyKind(edge, dependencyId, topologyEdgesById) {
  const dependencyEdge = topologyEdgesById.get(dependencyId);
  const snapshot = {
    edgeId: edge.id,
    edgeBoundary: edge.boundary,
    edgeReasons: edge.reasons,
    dependencyId,
    dependencyBoundary: textOrAbsent(dependencyEdge?.boundary),
    dependencyReasons: arrayOrEmpty(dependencyEdge?.reasons),
  };
  return TOPOLOGY_DEPENDENCY_KIND_RULES.find((rule) => rule.matches(snapshot))
    .dependencyKind;
}

function hasAnyReason(reasons, reasonSet) {
  return reasons.some((reason) => reasonSet.has(reason));
}

function buildMemberEdges(normalized) {
  const missingIds = arrayOrEmpty(normalized.progress.selectedMissingPublishedNodeIds);
  const selectedSnapshotNodeId = textOrAbsent(normalized.progress.selectedSnapshotNodeId);
  return missingIds.map((nodeId) => ({
    id: `${EDGE_TYPE_NODE}:${selectedSnapshotNodeId}:${nodeId}`,
    type: EDGE_TYPE_NODE,
    from: selectedSnapshotNodeId === ABSENT_VALUE ?
      NODE_ID_SELECTED_SNAPSHOT :
      `${NODE_ID_PREFIX_MEMBER}${selectedSnapshotNodeId}`,
    to: `${NODE_ID_PREFIX_MEMBER}${nodeId}`,
    dependencyKind: DEPENDENCY_KIND.CROSS_NODE_VISIBILITY,
    state: PHASE_STATE.BLOCKED,
  }));
}

function buildWaits(normalized) {
  const waitMode = textOrAbsent(normalized.dominantWitness.waitMode);
  if (waitMode === ABSENT_VALUE) {
    return [];
  }
  return [{
    id: `${DEPENDENCY_KIND.PRIORITY_RECOVERY}:${waitMode}`,
    waitMode,
    state: waitMode === WAIT_MODE_EVENT_DRIVEN ? WAIT_STATE_ACTIVE : WAIT_STATE_ABSENT,
    owner: textOrUnknown(normalized.dominantWitness.currentOwner),
    boundary: textOrUnknown(normalized.dominantWitness.blockingBoundary),
    stepAgeMs: numberOrUnknown(normalized.dominantWitness.stepAgeMs),
    stepTimeoutMs: numberOrUnknown(normalized.dominantWitness.stepTimeoutMs),
    nextRequiredAction: textOrUnknown(normalized.dominantWitness.nextRequiredAction),
  }];
}

function buildCriticalPath(topologyGraph, waits) {
  return topologyGraph.frontier.map((edge) => ({
    nodeId: `${NODE_ID_PREFIX_TOPOLOGY}${edge.id}`,
    edgeId: edge.id,
    state: edge.state,
    owner: edge.owner,
    boundary: edge.boundary,
    reasons: [...edge.reasons],
    waitCount: waits.length,
  }));
}

function buildSuspectNodes(memberNodes, normalized) {
  const gateTimedOut = normalized.activeGate.state === ACTIVE_GATE_STATE_TIMED_OUT;
  return memberNodes
    .filter((node) => node.state === PHASE_STATE.BLOCKED || gateTimedOut)
    .map((node) => ({
      nodeId: node.nodeId,
      role: node.role,
      reasons: [...node.reasons],
      activeGateState: textOrUnknown(normalized.activeGate.state),
      snapshotCoverageNodeCount: numberOrZero(normalized.progress.snapshotCoverageNodeCount),
      expectedNodeCount: numberOrZero(normalized.progress.expectedNodeCount),
    }));
}

export {buildCausalGraph, normalizeCausalInput};
