import {
  ABSENT_VALUE,
  SCHEMA_VERSION_FAILURE_TAXONOMY_V1,
  ZERO_COUNT,
  FAILURE_CLASS,
  FAILURE_CLASS_RESOLUTION_TABLE,
  RESOLUTION_STRATEGY,
  OWNER,
  BOUNDARY,
  REPORT_OUTCOME,
  asRecord,
  arrayOrEmpty,
  textOrUnknown,
} from './causal-analysis-schema.js';
import {buildCausalGraph, normalizeCausalInput} from './causal-graph-builder.js';
import {accountBudgets} from './budget-timeout-accounting.js';
import {EDGE_STATE} from './topology-convergence-graph.js';

const EDGE_PUBLICATION_ACK = 'publication_ack_convergence';
const EDGE_SNAPSHOT_COVERAGE = 'active_gate_snapshot_coverage';
const EDGE_PRIORITY_RECOVERY = 'priority_recovery_partition_progress';
const REASON_SNAPSHOT_COVERAGE_INCOMPLETE = 'snapshot_coverage_incomplete';
const REASON_STARTUP_READINESS_BLOCKED = 'startup_readiness_blocked';
const REASON_EVENT_DRIVEN_WAIT = 'event_driven_wait';
const REASON_PUBLICATION_ACK_BLOCKED = 'publication_ack_blocked';
const REASON_BUDGET_CASCADE = 'budget_cascade';
const REASON_EVIDENCE_INCOMPLETE = 'evidence_incomplete';
const REASON_NO_FAILURE = 'no_failure';
const WAIT_MODE_EVENT_DRIVEN = 'event_driven';
const EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS =
  'publicationConvergence.priorityRecoveryProgressSummary.dominantWitness';
const EVIDENCE_PATH_BUDGET_CASCADES = 'budgetAccounting.cascades';
const EVIDENCE_PATH_CAUSAL_GRAPH_NODES = 'causalGraph.nodes';
const READINESS_CLASSIFICATION_RULES = Object.freeze([
  Object.freeze({
    classify: (snapshot) => snapshot.reportOutcome !== REPORT_OUTCOME.PASSED &&
      snapshot.blockedReasonEntries.length > ZERO_COUNT,
  }),
]);

function classifyFailures(input = {}) {
  const normalized = normalizeCausalInput(input);
  const graph = buildCausalGraph(input);
  const budgetAccounting = accountBudgets(input);
  const observedClasses = FAILURE_RULES.flatMap((rule) => rule.classify({
    normalized,
    graph,
    budgetAccounting,
  }));
  const classes = observedClasses.length > ZERO_COUNT ? observedClasses : [buildClass({
    failureClass: FAILURE_CLASS.HEALTHY,
    reason: REASON_NO_FAILURE,
    evidencePath: ABSENT_VALUE,
  })];
  return {
    schemaVersion: SCHEMA_VERSION_FAILURE_TAXONOMY_V1,
    scenario: normalized.scenario,
    classes,
    dominantFailureClass: classes[ZERO_COUNT].failureClass,
    resolutionStrategy: classes[ZERO_COUNT].resolutionStrategy,
    summary: {
      classCount: classes.length,
      dominantReason: classes[ZERO_COUNT].reason,
    },
  };
}

const FAILURE_RULES = Object.freeze([
  Object.freeze({
    classify: ({graph}) => classifyTopologyEdge({
      graph,
      edgeId: EDGE_PUBLICATION_ACK,
      stateSet: [EDGE_STATE.BLOCKED],
      failureClass: FAILURE_CLASS.PUBLICATION_ACK_BLOCKED,
      reason: REASON_PUBLICATION_ACK_BLOCKED,
    }),
  }),
  Object.freeze({
    classify: ({graph}) => classifyTopologyEdge({
      graph,
      edgeId: EDGE_SNAPSHOT_COVERAGE,
      stateSet: [EDGE_STATE.BLOCKED, EDGE_STATE.DEFERRED],
      failureClass: FAILURE_CLASS.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE,
      reason: REASON_SNAPSHOT_COVERAGE_INCOMPLETE,
    }),
  }),
  Object.freeze({
    classify: ({graph}) => classifyPriorityWait(graph),
  }),
  Object.freeze({
    classify: ({normalized}) => classifyReadiness(normalized),
  }),
  Object.freeze({
    classify: ({budgetAccounting}) => classifyBudgetCascade(budgetAccounting),
  }),
  Object.freeze({
    classify: ({normalized, graph}) => classifyEvidenceIncomplete(graph, normalized),
  }),
]);

function classifyTopologyEdge({graph, edgeId, stateSet, failureClass, reason}) {
  const edge = findTopologyNode(graph, edgeId);
  if (!edge || stateSet.includes(edge.state) !== true) {
    return [];
  }
  return [buildClass({
    failureClass,
    reason,
    owner: edge.owner,
    boundary: edge.boundary,
    evidencePath: edge.evidencePath,
    causalNodeIds: [edge.id],
  })];
}

function classifyPriorityWait(graph) {
  const edge = findTopologyNode(graph, EDGE_PRIORITY_RECOVERY);
  const eventWait = graph.waits.find((wait) => wait.waitMode === WAIT_MODE_EVENT_DRIVEN);
  if (!edge || !eventWait || edge.state !== EDGE_STATE.RETRYABLE) {
    return [];
  }
  return [buildClass({
    failureClass: FAILURE_CLASS.PRIORITY_RECOVERY_EVENT_WAIT,
    reason: REASON_EVENT_DRIVEN_WAIT,
    owner: eventWait.owner,
    boundary: eventWait.boundary,
    evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY_WITNESS,
    causalNodeIds: [edge.id],
  })];
}

function classifyReadiness(normalized) {
  const reasonEntries = Object.entries(asRecord(normalized.nodeReasonsByNodeId));
  const blockedReasonEntries = reasonEntries.filter((entry) =>
    arrayOrEmpty(entry[1]).length > ZERO_COUNT,
  );
  const snapshot = {
    reportOutcome: normalized.reportOutcome,
    blockedReasonEntries,
  };
  const selectedRule = READINESS_CLASSIFICATION_RULES.find((rule) => rule.classify(snapshot));
  if (!selectedRule) {
    return [];
  }
  return [buildClass({
    failureClass: FAILURE_CLASS.STARTUP_READINESS_BLOCKED,
    reason: REASON_STARTUP_READINESS_BLOCKED,
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidencePath: normalized.readinessEvidencePath,
    causalNodeIds: blockedReasonEntries.map((entry) => `member:${entry[ZERO_COUNT]}`).sort(),
  })];
}

function classifyBudgetCascade(budgetAccounting) {
  if (budgetAccounting.cascades.length === ZERO_COUNT) {
    return [];
  }
  return [buildClass({
    failureClass: FAILURE_CLASS.BUDGET_TIMEOUT_CASCADE,
    reason: REASON_BUDGET_CASCADE,
    owner: OWNER.DIAGNOSTICS,
    boundary: BOUNDARY.CAUSAL_ANALYSIS,
    evidencePath: EVIDENCE_PATH_BUDGET_CASCADES,
    causalNodeIds: budgetAccounting.cascades.map((cascade) => cascade.id),
  })];
}

function classifyEvidenceIncomplete(graph, normalized) {
  if (normalized.reportOutcome === REPORT_OUTCOME.PASSED) {
    return [];
  }
  const unknownNodes = graph.nodes.filter((node) => node.state === 'unknown');
  if (unknownNodes.length === ZERO_COUNT) {
    return [];
  }
  return [buildClass({
    failureClass: FAILURE_CLASS.EVIDENCE_INCOMPLETE,
    reason: REASON_EVIDENCE_INCOMPLETE,
    owner: OWNER.DIAGNOSTICS,
    boundary: BOUNDARY.CAUSAL_ANALYSIS,
    evidencePath: EVIDENCE_PATH_CAUSAL_GRAPH_NODES,
    causalNodeIds: unknownNodes.map((node) => node.id),
  })];
}

function findTopologyNode(graph, edgeId) {
  return graph.nodes.find((node) => node.id === `topology:${edgeId}`);
}

function buildClass({
  failureClass,
  reason,
  owner = OWNER.DIAGNOSTICS,
  boundary = BOUNDARY.CAUSAL_ANALYSIS,
  evidencePath = ABSENT_VALUE,
  causalNodeIds = [],
}) {
  return {
    failureClass,
    reason,
    owner: textOrUnknown(owner),
    boundary: textOrUnknown(boundary),
    evidencePath,
    causalNodeIds: arrayOrEmpty(causalNodeIds),
    resolutionStrategy: FAILURE_CLASS_RESOLUTION_TABLE[failureClass] ||
      RESOLUTION_STRATEGY.ASK_HUMAN,
  };
}

export {classifyFailures};
