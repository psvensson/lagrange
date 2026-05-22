#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  EDGE_STATE,
  EDGE_ID,
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceDecisionTable,
  buildTopologyConvergenceReplayFixture,
  buildTopologyConvergenceGraphFromArtifacts,
  buildTopologyConvergenceGlossary,
  buildTopologyConvergenceOwnerPresentation,
  buildTopologyConvergenceOwnerWitness,
  selectTopologyConvergenceDominantWitness,
} from '../src/diagnostics/topology-convergence-graph.js';

const ARG_HELP_SHORT = '-h';
const ARG_HELP_LONG = '--help';
const ARG_DECISION_TABLE = '--decision-table';
const ARG_GLOSSARY = '--glossary';
const ARG_EXPLAIN = '--explain';
const ARG_HANDOFF_PROBE = '--handoff-probe';
const ARG_PACKAGE_EVIDENCE_BLOCK = '--package-evidence-block';
const ARG_REPLAY_FIXTURE = '--replay-fixture';
const ENCODING_UTF8 = 'utf8';
const JSON_INDENT_SPACES = 2;
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const ARGUMENT_SKIP_NEXT = 1;
const FILE_FAILURE_BUNDLE = 'failure-bundle.json';
const FILE_TRIAGE_SUMMARY = 'triage-summary.json';
const FILE_REPORT_SUFFIX = '.report.json';
const PROPERTY_FAILURE_BUNDLE = 'failureBundle';
const PROPERTY_PUBLICATION_CONVERGENCE = 'publicationConvergence';
const PROPERTY_SCENARIOS = 'scenarios';
const PROPERTY_ACTIVE_GATE_PROGRESS = 'activeGateProgress';
const PROPERTY_PROGRESS = 'progress';
const PROPERTY_SUMMARY = 'summary';
const PROPERTY_ACTIVE_GATE = 'activeGate';
const PROPERTY_SELECTED_SNAPSHOT_ADMIN_READY = 'selectedSnapshotAdminReady';
const PROPERTY_SELECTED_SNAPSHOT_NODE_ID = 'selectedSnapshotNodeId';
const PROPERTY_SELECTED_SNAPSHOT_REACHABLE_BY = 'selectedSnapshotReachableBy';
const PROPERTY_ALTERNATIVE_SNAPSHOT_WITNESS_AVAILABLE =
  'alternativeSnapshotWitnessAvailable';
const STDOUT_NEWLINE = '\n';
const EMPTY_TEXT = '';
const ABSENT_VALUE = 'absent';
const UNKNOWN_VALUE = 'unknown';
const PROPERTY_PER_NODE_PUBLICATION_DISAGREEMENT_SET =
  'perNodePublicationDisagreementSet';
const CLI_FLAG_PREFIX = '-';
const FILE_JSON_EXTENSION = '.json';
const MODE_SUMMARY = 'summary';
const MODE_DECISION_TABLE = 'decision-table';
const MODE_GLOSSARY = 'glossary';
const MODE_EXPLAIN = 'explain';
const MODE_HANDOFF_PROBE = 'handoff-probe';
const MODE_PACKAGE_EVIDENCE_BLOCK = 'package-evidence-block';
const MODE_REPLAY_FIXTURE = 'replay-fixture';
const SCHEMA_VERSION_TOPOLOGY_OWNER_EXPLAIN_V1 = 'topology-owner-explain-v1';
const SCHEMA_VERSION_PUBLICATION_ACTIVE_GATE_HANDOFF_PROBE_V1 =
  'topology-publication-active-gate-handoff-probe-v1';
const MISSING_EDGE_PUBLICATION_ACK_TO_ACTIVE_GATE_RECONCILE =
  'publication_ack_to_active_gate_reconcile_missing';
const MISSING_EDGE_NAME_PUBLICATION_ACK_TO_ACTIVE_GATE_RECONCILE =
  'publication_ack_to_active_gate_reconcile';
const MISSING_EDGE_PUBLICATION_OPERATION_WORKFLOW_HANDOFF =
  'publication_operation_workflow_handoff_leg_missing';
const MISSING_EDGE_NAME_PUBLICATION_OPERATION_WORKFLOW_HANDOFF =
  'publication_operation_workflow_handoff';
const CONTRACT_EDGE_PUBLICATION_ACTIVE_GATE_HANDOFF =
  'publication_active_gate_handoff_contract';
const CONTRACT_EDGE_NAME_PUBLICATION_ACTIVE_GATE_HANDOFF =
  'publication_active_gate_handoff_contract';
const REQUIRED_PROGRESS_MECHANISM_RECONCILE = 'reconcile';
const REQUIRED_PROGRESS_MECHANISM_ADVANCE = 'advance';
const REQUIRED_PROGRESS_MECHANISM_DISPATCH = 'dispatch';
const RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_RECONCILE_MISSING =
  'publication_ack_to_active_gate_reconcile_missing';
const RESULT_CLASSIFICATION_PUBLICATION_OPERATION_WORKFLOW_HANDOFF_MISSING =
  'publication_operation_workflow_handoff_leg_missing';
const RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_HANDOFF_CONTRACT_PENDING =
  'publication_active_gate_handoff_contract_pending';
const RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_HANDOFF_CONTRACT_COMPLETE =
  'publication_active_gate_handoff_contract_complete';
const RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_HANDOFF_NOT_DETECTED =
  'publication_active_gate_handoff_not_detected';
const EDGE_STATE_BLOCKED = 'blocked';
const OPERATION_WORKFLOW_OWNER = 'operation_workflow_owner';
const WORKFLOW_PROGRESS_BOUNDARY = 'workflow_progress';
const TOPOLOGY_OPERATOR_CURRENT_STEP_ID_DISPATCH_PENDING =
  'dispatch_pending';
const TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION =
  'advance_existing_operation';
const HANDOFF_PROBE_TARGET_ACTION_BUILD_REPLAYABLE_FIXTURE =
  'build_replayable_handoff_fixture';
const HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION =
  'reconcile_owner_membership_publication';
const HANDOFF_CONTRACT_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const HANDOFF_CONTRACT_STATE_COMPLETE = 'complete';
const OWNER_QUEUE_DEPTH_STATE_UNKNOWN = UNKNOWN_VALUE;
const HANDOFF_DETECTED = true;
const HANDOFF_NOT_DETECTED = false;
const RUNTIME_PROMOTION_DISALLOWED = false;
const BOOLEAN_TRUE_TEXT = 'true';
const BOOLEAN_FALSE_TEXT = 'false';
const MARKDOWN_SECTION_OWNER_EVIDENCE_BLOCK =
  '## Generated Owner Evidence Block';
const MARKDOWN_LIST_PREFIX = '- ';
const MARKDOWN_CODE_DELIMITER = '`';
const LABEL_SOURCE_ARTIFACT = 'Source artifact';
const LABEL_SCENARIO = 'Scenario';
const LABEL_FRONTIER_EDGE = 'Frontier edge';
const LABEL_CURRENT_OWNER = 'Current semantic owner';
const LABEL_CURRENT_BOUNDARY = 'Current boundary';
const LABEL_FRONTIER_STATE = 'Frontier state';
const LABEL_DOMINANT_REASON = 'Dominant reason';
const LABEL_EVIDENCE_PATH = 'Evidence path';
const LABEL_REASONS = 'Reasons';
const LABEL_NEXT_EXPLAIN_COMMAND = 'Next explain command';
const EDGE_ALIAS_PRIORITY = 'priority';
const EDGE_ALIAS_PRIORITY_RECOVERY = 'priority-recovery';
const EDGE_ALIAS_PUBLICATION = 'publication';
const EDGE_ALIAS_ACTIVE_GATE = 'active-gate';
const EDGE_ALIAS_SNAPSHOT = 'snapshot';
const EDGE_ALIAS_READINESS = 'readiness';
const CSV_SEPARATOR = ',';
const LIST_SEPARATOR = ', ';
const HANDOFF_PROBE_CONSUMER_WAITING_STATES = Object.freeze(new Set([
  EDGE_STATE.BLOCKED,
  EDGE_STATE.DEFERRED,
  EDGE_STATE.RETRYABLE,
]));
const HANDOFF_PROBE_OPERATION_WORKFLOW_STATES = Object.freeze(new Set([
  EDGE_STATE.BLOCKED,
  EDGE_STATE.RETRYABLE,
]));
const HANDOFF_CONTRACT_ABSENT = Object.freeze({
  state: ABSENT_VALUE,
  reasonCode: ABSENT_VALUE,
  nextAction: ABSENT_VALUE,
  runtimePromotionAllowed: RUNTIME_PROMOTION_DISALLOWED,
  pendingReconcileCount: NUM_ZERO,
  pendingReconcileNodeIds: [],
});
const HANDOFF_PROBE_DETECTION_RULES = Object.freeze([
  Object.freeze({
    matches: (snapshot) =>
      snapshot.firstFrontierEdgeId === EDGE_ID.PUBLICATION_ACK_CONVERGENCE &&
      snapshot.producerState === EDGE_STATE_BLOCKED &&
      snapshot.consumerState === EDGE_STATE_BLOCKED,
  }),
  Object.freeze({
    matches: (snapshot) =>
      snapshot.firstFrontierEdgeId === EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE &&
      snapshot.producerState === EDGE_STATE.SATISFIED &&
      HANDOFF_PROBE_CONSUMER_WAITING_STATES.has(snapshot.consumerState) &&
      snapshot.missingPublishedCount > NUM_ZERO,
  }),
]);
const PROBE_REQUIRED_PROGRESS_MECHANISM_RULES = Object.freeze([
  Object.freeze({
    matches: (operationWorkflowWitness) =>
      operationWorkflowWitness?.source?.topologyOperatorNextAction ===
        TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION,
    mechanism: REQUIRED_PROGRESS_MECHANISM_ADVANCE,
  }),
  Object.freeze({
    matches: (operationWorkflowWitness) =>
      operationWorkflowWitness?.source?.topologyOperatorCurrentStepId ===
        TOPOLOGY_OPERATOR_CURRENT_STEP_ID_DISPATCH_PENDING,
    mechanism: REQUIRED_PROGRESS_MECHANISM_DISPATCH,
  }),
  Object.freeze({
    matches: () => true,
    mechanism: REQUIRED_PROGRESS_MECHANISM_RECONCILE,
  }),
]);
const HELP_TEXT = [
  'Usage: node scripts/analyze-topology-convergence.js <artifact.json> [--explain <edge-id-or-alias>] [--handoff-probe] [--replay-fixture] [--package-evidence-block]',
  '       node scripts/analyze-topology-convergence.js --decision-table',
  '       node scripts/analyze-topology-convergence.js --glossary',
  '',
  'Reads a failure-bundle.json, triage-summary.json, or report JSON artifact',
  'and prints a TopologyConvergenceGraph JSON summary with frontier projection.',
  'Optional modes expose owner decision tables, glossary indexes, owner explain',
  'output, or package migration/evidence blocks without changing runtime behavior.',
  '',
  'Examples:',
  '  npm run analyze:topology-convergence -- test-output/reports/.playback/run/rolling-restart/failure-bundle.json',
  '  node scripts/analyze-topology-convergence.js test-output/reports/run.report.json',
  '  npm run analyze:topology-convergence -- test-output/reports/run.report.json --explain priority',
  '  npm run analyze:topology-convergence -- test-output/reports/run.report.json --handoff-probe',
  '  npm run analyze:topology-convergence -- test-output/reports/run.report.json --replay-fixture',
  '  npm run analyze:topology-convergence -- --decision-table',
  '  npm run analyze:topology-convergence -- --glossary',
].join(STDOUT_NEWLINE);

const EDGE_ALIASES = Object.freeze({
  [EDGE_ALIAS_PRIORITY]: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  [EDGE_ALIAS_PRIORITY_RECOVERY]: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  [EDGE_ALIAS_PUBLICATION]: EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
  [EDGE_ALIAS_ACTIVE_GATE]: EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  [EDGE_ALIAS_SNAPSHOT]: EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  [EDGE_ALIAS_READINESS]: EDGE_ID.READINESS_STARTUP_SUPPORT,
});

function main(argv) {
  const parsedArgs = parseCliArgs(argv.slice(ARGUMENT_ARTIFACT_INDEX));
  if (parsedArgs.helpRequested) {
    process.stdout.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_SUCCESS;
  }
  if (parsedArgs.mode === MODE_DECISION_TABLE) {
    process.stdout.write(
      `${JSON.stringify(buildTopologyConvergenceDecisionTable(), null, JSON_INDENT_SPACES)}\n`,
    );
    return EXIT_SUCCESS;
  }
  if (parsedArgs.mode === MODE_GLOSSARY) {
    process.stdout.write(
      `${JSON.stringify(buildTopologyConvergenceGlossary(), null, JSON_INDENT_SPACES)}\n`,
    );
    return EXIT_SUCCESS;
  }
  if (!parsedArgs.artifactPath) {
    process.stderr.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_USAGE;
  }

  try {
    const artifact = readJsonFile(parsedArgs.artifactPath);
    const graph = buildGraphForArtifact(parsedArgs.artifactPath, artifact);
    if (parsedArgs.mode === MODE_EXPLAIN) {
      process.stdout.write(
        `${JSON.stringify(selectExplainOutput(graph, parsedArgs.edgeId), null, JSON_INDENT_SPACES)}\n`,
      );
      return EXIT_SUCCESS;
    }
    if (parsedArgs.mode === MODE_HANDOFF_PROBE) {
      process.stdout.write(
        `${JSON.stringify(selectHandoffProbeOutput(graph, artifact), null, JSON_INDENT_SPACES)}\n`,
      );
      return EXIT_SUCCESS;
    }
    if (parsedArgs.mode === MODE_REPLAY_FIXTURE) {
      process.stdout.write(
        `${JSON.stringify(
          selectReplayFixtureOutput(graph, artifact, parsedArgs.artifactPath),
          null,
          JSON_INDENT_SPACES,
        )}\n`,
      );
      return EXIT_SUCCESS;
    }
    if (parsedArgs.mode === MODE_PACKAGE_EVIDENCE_BLOCK) {
      process.stdout.write(
        `${renderPackageEvidenceBlock(graph, parsedArgs.artifactPath)}${STDOUT_NEWLINE}`,
      );
      return EXIT_SUCCESS;
    }
    process.stdout.write(
      `${JSON.stringify(selectCliOutput(graph), null, JSON_INDENT_SPACES)}\n`,
    );
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`${error.message}${STDOUT_NEWLINE}`);
    return EXIT_FAILURE;
  }
}

const ARGUMENT_ARTIFACT_INDEX = 2;

function parseCliArgs(args) {
  const positional = [];
  let mode = MODE_SUMMARY;
  let edgeId = EMPTY_TEXT;

  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const arg = args[index];
    if (arg === ARG_HELP_SHORT || arg === ARG_HELP_LONG) {
      return {helpRequested: true, mode, artifactPath: EMPTY_TEXT, edgeId};
    }
    if (arg === ARG_DECISION_TABLE) {
      mode = MODE_DECISION_TABLE;
      continue;
    }
    if (arg === ARG_GLOSSARY) {
      mode = MODE_GLOSSARY;
      continue;
    }
    if (arg === ARG_PACKAGE_EVIDENCE_BLOCK) {
      mode = MODE_PACKAGE_EVIDENCE_BLOCK;
      continue;
    }
    if (arg === ARG_EXPLAIN) {
      mode = MODE_EXPLAIN;
      const nextArg = args[index + NUM_ONE];
      if (isEdgeSelector(nextArg)) {
        edgeId = nextArg;
        index += ARGUMENT_SKIP_NEXT;
      }
      continue;
    }
    if (arg === ARG_HANDOFF_PROBE) {
      mode = MODE_HANDOFF_PROBE;
      continue;
    }
    if (arg === ARG_REPLAY_FIXTURE) {
      mode = MODE_REPLAY_FIXTURE;
      continue;
    }
    positional.push(arg);
  }

  return {
    helpRequested: false,
    mode,
    artifactPath: positional[NUM_ZERO] || EMPTY_TEXT,
    edgeId: edgeId || positional[NUM_ONE] || EMPTY_TEXT,
  };
}

function isEdgeSelector(value) {
  return Boolean(value) &&
    !value.startsWith(CLI_FLAG_PREFIX) &&
    !value.endsWith(FILE_JSON_EXTENSION) &&
    !value.includes(path.sep);
}

function buildGraphForArtifact(artifactPath, artifact) {
  const baseName = path.basename(artifactPath);
  if (baseName === FILE_FAILURE_BUNDLE) {
    return buildTopologyConvergenceGraphFromArtifacts({failureBundle: artifact});
  }
  if (baseName === FILE_TRIAGE_SUMMARY) {
    return buildTopologyConvergenceGraphFromArtifacts({triageSummary: artifact});
  }
  if (baseName.endsWith(FILE_REPORT_SUFFIX) || artifact[PROPERTY_FAILURE_BUNDLE]) {
    return buildTopologyConvergenceGraph(artifact);
  }
  if (artifact[PROPERTY_PUBLICATION_CONVERGENCE] || artifact[PROPERTY_SUMMARY]) {
    return buildTopologyConvergenceGraphFromArtifacts({triageSummary: artifact});
  }
  return buildTopologyConvergenceGraph(artifact);
}

function selectCliOutput(graph) {
  const ownerPresentation = buildTopologyConvergenceOwnerPresentation(graph);
  return {
    schemaVersion: graph.schemaVersion,
    scenario: graph.scenario,
    summary: graph.summary,
    frontier: graph.frontier,
    ownerWitnesses: ownerPresentation.ownerWitnesses,
    frontierWitnesses: ownerPresentation.frontierWitnesses,
    dominantWitness: ownerPresentation.dominantWitness,
    nextExpectedFrontier: graph.nextExpectedFrontier,
  };
}

function selectExplainOutput(graph, requestedEdgeId) {
  const edge = selectExplainEdge(graph, requestedEdgeId);
  const decisionTable = buildTopologyConvergenceDecisionTable();
  const decisionTableRow = selectExplainDecisionTableRow(
    decisionTable,
    edge,
  );
  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_OWNER_EXPLAIN_V1,
    scenario: graph.scenario,
    evidenceSnapshot: {
      edgeId: edge.id,
      owner: edge.owner,
      boundary: edge.boundary,
      evidencePath: edge.evidencePath,
      source: edge.source,
      reasons: edge.reasons,
    },
    decisionOutcome: {
      state: edge.state,
      frontier: graph.frontier.some((frontierEdge) => frontierEdge.id === edge.id),
      dominantWitness: buildTopologyConvergenceOwnerWitness(edge),
    },
    decisionTable: decisionTableRow,
  };
}

function selectExplainDecisionTableRow(decisionTable, edge) {
  const tableRow = decisionTable.transitions.find(
    (row) => row.edgeId === edge.id,
  );
  return Object.freeze({
    ...tableRow,
    owner: edge.owner,
    boundary: edge.boundary,
  });
}

function selectExplainEdge(graph, requestedEdgeId) {
  const normalizedEdgeId = normalizeRequestedEdgeId(requestedEdgeId);
  if (normalizedEdgeId) {
    const requestedEdge = graph.edges.find((edge) => edge.id === normalizedEdgeId);
    if (requestedEdge) {
      return requestedEdge;
    }
  }
  return selectDominantFrontierEdge(graph) || graph.edges[NUM_ZERO];
}

function normalizeRequestedEdgeId(requestedEdgeId) {
  const normalized = String(requestedEdgeId || EMPTY_TEXT).trim();
  if (!normalized) {
    return EMPTY_TEXT;
  }
  return EDGE_ALIASES[normalized] || normalized;
}

function selectDominantFrontierEdge(graph) {
  return graph.frontier[NUM_ZERO] || null;
}

function selectReplayFixtureOutput(graph, artifact, sourceArtifact) {
  const replayFixture = buildTopologyConvergenceReplayFixture(graph, {
    sourceArtifact,
  });
  const diagnostics = buildHandoffConsumerSnapshotDiagnostics(graph, artifact);
  const progress = selectHandoffArtifactProgress(graph, artifact);
  if (!progress) {
    return replayFixture;
  }
  return enrichReplayFixtureActiveGateProgress(
    replayFixture,
    buildReplayFixtureSnapshotDiagnostics(diagnostics, progress),
  );
}

function enrichReplayFixtureActiveGateProgress(replayFixture, diagnostics) {
  const publicationConvergence = replayFixture.publicationConvergence || {};
  const activeGate = publicationConvergence[PROPERTY_ACTIVE_GATE] || {};
  return {
    ...replayFixture,
    publicationConvergence: {
      ...publicationConvergence,
      [PROPERTY_ACTIVE_GATE]: {
        ...activeGate,
        [PROPERTY_PROGRESS]: {
          ...(activeGate[PROPERTY_PROGRESS] || {}),
          ...diagnostics,
        },
      },
    },
  };
}

function buildReplayFixtureSnapshotDiagnostics(diagnostics, progress) {
  return {
    ...diagnostics,
    [PROPERTY_PER_NODE_PUBLICATION_DISAGREEMENT_SET]:
      progress[PROPERTY_PER_NODE_PUBLICATION_DISAGREEMENT_SET] || {},
  };
}

function selectHandoffProbeOutput(graph, artifact) {
  const producer = selectGraphEdge(
    graph.edges,
    EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
  );
  const consumer = selectHandoffConsumerEdge(graph);
  const operationWorkflow = selectHandoffOperationWorkflowEdge(graph);
  const probeSnapshot = buildHandoffProbeSnapshot(graph, producer, consumer);
  const handoffDetected = isPublicationActiveGateHandoffDetected(probeSnapshot);
  const operationWorkflowWitness = buildProbeWitness(operationWorkflow);
  const consumerWitness = buildProbeWitness(consumer);
  const handoffContract = buildProbeHandoffContract(consumerWitness);
  const handoffContractDetected = isProbeHandoffContractDetected(handoffContract);
  const operationWorkflowHandoffLegMissing =
    isProbeOperationWorkflowHandoffLegMissing({
      handoffDetected,
      handoffContractDetected,
      operationWorkflowWitness,
    });
  const enrichedConsumer = buildHandoffConsumerWitness(
    graph,
    artifact,
    consumerWitness,
  );

  return {
    schemaVersion: SCHEMA_VERSION_PUBLICATION_ACTIVE_GATE_HANDOFF_PROBE_V1,
    scenario: graph.scenario,
    missingEdge: buildProbeMissingEdge({
      handoffDetected,
      handoffContractDetected,
      operationWorkflowHandoffLegMissing,
    }),
    contractEdge: buildProbeContractEdge(handoffContractDetected),
    detected: handoffDetected ? HANDOFF_DETECTED : HANDOFF_NOT_DETECTED,
    producer: buildProbeWitness(producer),
    operationWorkflow: operationWorkflowWitness,
    consumer: enrichedConsumer,
    handoffContract,
    ownerRecoveryQueue: buildProbeOwnerRecoveryQueue(consumerWitness),
    nextOwnerPath: buildProbeNextOwnerPath({
      operationWorkflowWitness,
      consumerWitness,
      handoffContract,
      operationWorkflowHandoffLegMissing,
    }),
    requiredProgressMechanism: selectProbeRequiredProgressMechanism({
      operationWorkflowWitness,
      operationWorkflowHandoffLegMissing,
    }),
    resultClassification: classifyProbeResult(
      handoffDetected,
      handoffContract,
      handoffContractDetected,
      operationWorkflowHandoffLegMissing,
    ),
    runtimePromotionAllowed: handoffContract.runtimePromotionAllowed,
  };
}

function buildHandoffConsumerWitness(graph, artifact, witness) {
  return {
    ...witness,
    source: {
      ...(witness?.source || {}),
      ...buildHandoffConsumerSnapshotDiagnostics(graph, artifact),
    },
  };
}

function buildHandoffConsumerSnapshotDiagnostics(graph, artifact) {
  const progress = selectHandoffArtifactProgress(graph, artifact);
  if (!progress) {
    return {};
  }
  const selectedSnapshotNodeId = progress?.[PROPERTY_SELECTED_SNAPSHOT_NODE_ID];
  const selectedSnapshotReachableBy =
    progress?.[PROPERTY_SELECTED_SNAPSHOT_REACHABLE_BY];
  return {
    [PROPERTY_SELECTED_SNAPSHOT_ADMIN_READY]: probeBooleanVariant(
      progress?.[PROPERTY_SELECTED_SNAPSHOT_ADMIN_READY],
    ),
    [PROPERTY_SELECTED_SNAPSHOT_REACHABLE_BY]:
      typeof selectedSnapshotReachableBy === 'string' &&
      selectedSnapshotReachableBy.length > NUM_ZERO ?
        selectedSnapshotReachableBy :
        UNKNOWN_VALUE,
    [PROPERTY_ALTERNATIVE_SNAPSHOT_WITNESS_AVAILABLE]:
      determineAlternativeSnapshotWitnessAvailability(
        progress[PROPERTY_ALTERNATIVE_SNAPSHOT_WITNESS_AVAILABLE],
        progress[PROPERTY_PER_NODE_PUBLICATION_DISAGREEMENT_SET],
        selectedSnapshotNodeId,
      ),
  };
}

function selectHandoffArtifactProgress(graph, artifact) {
  const scenario = selectHandoffScenario(graph, artifact);
  const publicationConvergence =
    scenario?.[PROPERTY_PUBLICATION_CONVERGENCE] ||
    artifact?.[PROPERTY_PUBLICATION_CONVERGENCE] ||
    {};
  return (
    publicationConvergence?.activeGate?.[PROPERTY_ACTIVE_GATE_PROGRESS] ||
    publicationConvergence?.activeGate?.[PROPERTY_PROGRESS] ||
    publicationConvergence?.[PROPERTY_ACTIVE_GATE_PROGRESS] ||
    publicationConvergence?.[PROPERTY_PROGRESS]
  );
}

function selectHandoffScenario(graph, artifact) {
  const scenarios = artifact?.[PROPERTY_SCENARIOS];
  if (!Array.isArray(scenarios) || scenarios.length === NUM_ZERO) {
    return artifact;
  }
  const targetScenario = graph?.scenario;
  return scenarios.find((candidate) => candidate.scenario === targetScenario) ||
    scenarios[NUM_ZERO];
}

function determineAlternativeSnapshotWitnessAvailability(
  alternativeSnapshotWitnessAvailable,
  perNodePublicationDisagreementSet,
  selectedSnapshotNodeId,
) {
  if (alternativeSnapshotWitnessAvailable === true ||
    alternativeSnapshotWitnessAvailable === false) {
    return alternativeSnapshotWitnessAvailable;
  }
  if (
    perNodePublicationDisagreementSet &&
    typeof perNodePublicationDisagreementSet === 'object'
  ) {
    return Object.keys(perNodePublicationDisagreementSet).some(
      (snapshotId) => snapshotId !== selectedSnapshotNodeId,
    );
  }
  return UNKNOWN_VALUE;
}

function selectHandoffConsumerEdge(graph) {
  return selectGraphEdge(
    graph.nextExpectedFrontier,
    EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  ) ||
    selectGraphEdge(graph.frontier, EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE) ||
    selectGraphEdge(graph.edges, EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE);
}

function selectHandoffOperationWorkflowEdge(graph) {
  return selectGraphEdge(
    graph.nextExpectedFrontier,
    EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  ) ||
    selectGraphEdge(
      graph.frontier,
      EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    ) ||
    selectGraphEdge(
      graph.edges,
      EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    );
}

function selectGraphEdge(edges, edgeId) {
  return arrayOrEmpty(edges).find((edge) => edge.id === edgeId);
}

function buildHandoffProbeSnapshot(graph, producer, consumer) {
  return {
    firstFrontierEdgeId: graph.summary.firstFrontierEdgeId,
    producerState: producer?.state || ABSENT_VALUE,
    consumerState: consumer?.state || ABSENT_VALUE,
    missingPublishedCount: positiveNumberOrZero(
      producer?.source?.missingPublishedCount,
    ),
  };
}

function isPublicationActiveGateHandoffDetected(snapshot) {
  return HANDOFF_PROBE_DETECTION_RULES.some((rule) => rule.matches(snapshot));
}

function buildProbeWitness(edge) {
  const witness = buildTopologyConvergenceOwnerWitness(edge);
  return {
    edge: witness.edgeId,
    owner: witness.owner,
    boundary: witness.boundary,
    state: witness.state,
    dominantReason: witness.dominantReason,
    reasons: witness.reasons,
    evidencePath: witness.evidencePath,
    source: witness.source,
  };
}

function buildProbeHandoffContract(consumerWitness) {
  const source = consumerWitness?.source || {};
  const contractState =
    source.publicationActiveGateHandoffState ||
    source.activeGateOwnerCohortState ||
    ABSENT_VALUE;
  const contractReasonCode =
    source.publicationActiveGateHandoffReasonCode ||
    source.activeGateOwnerCohortReasonCode ||
    ABSENT_VALUE;
  const pendingReconcileNodeIds = splitProbeNodeIds(
    source.publicationActiveGateHandoffPendingReconcileNodeIds ||
      source.activeGateOwnerCohortPendingReconcileNodeIds,
  );
  const pendingReconcileCount = positiveNumberOrZero(
    source.publicationActiveGateHandoffPendingReconcileCount ??
      source.activeGateOwnerCohortPendingReconcileCount,
  );
  const nextAction =
    source.publicationActiveGateHandoffNextAction ||
    (
      contractReasonCode ===
        HANDOFF_CONTRACT_REASON_OWNER_RECONCILE_PENDING ||
      pendingReconcileCount > NUM_ZERO ?
        HANDOFF_CONTRACT_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION :
        ABSENT_VALUE
    );
  return {
    ...HANDOFF_CONTRACT_ABSENT,
    state: contractState,
    reasonCode: contractReasonCode,
    nextAction,
    runtimePromotionAllowed: probeBoolean(
      source.publicationActiveGateHandoffRuntimePromotionAllowed,
    ),
    pendingReconcileCount,
    pendingReconcileNodeIds,
  };
}

function buildProbeOwnerRecoveryQueue(consumerWitness) {
  const source = consumerWitness?.source || {};
  return {
    depth: {
      state:
        source.selectedControlPlaneOwnerQueueDepthState ||
        OWNER_QUEUE_DEPTH_STATE_UNKNOWN,
      pendingWrites: probeNumberOrUnknown(
        source.selectedControlPlaneOwnerQueuePendingWrites,
      ),
      pendingWriteGrowthCount: probeNumberOrUnknown(
        source.selectedControlPlaneOwnerQueuePendingWriteGrowthCount,
      ),
    },
    handoffOutcome: {
      state:
        source.membershipPublicationHandoffOutcomeState || ABSENT_VALUE,
      reasonCode:
        source.membershipPublicationHandoffOutcomeReasonCode || ABSENT_VALUE,
      enqueued: probeBooleanVariant(
        source.membershipPublicationHandoffOutcomeEnqueued,
      ),
      retryAfterMs: probeNumberOrUnknown(
        source.membershipPublicationHandoffOutcomeRetryAfterMs,
      ),
    },
    pendingReconcileCount: positiveNumberOrZero(
      source.publicationActiveGateHandoffPendingReconcileCount ??
        source.activeGateOwnerCohortPendingReconcileCount,
    ),
    activeGateOwnerCohortMissingPublishedCount: positiveNumberOrZero(
      source.activeGateOwnerCohortMissingPublishedCount,
    ),
  };
}

function isProbeOperationWorkflowHandoffLegMissing({
  handoffDetected,
  handoffContractDetected,
  operationWorkflowWitness,
}) {
  return handoffDetected !== true &&
    handoffContractDetected === true &&
    isProbeOperationWorkflowDispatchPending(operationWorkflowWitness);
}

function isProbeOperationWorkflowDispatchPending(witness) {
  return witness?.edge === EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS &&
    witness?.owner === OPERATION_WORKFLOW_OWNER &&
    witness?.boundary === WORKFLOW_PROGRESS_BOUNDARY &&
    HANDOFF_PROBE_OPERATION_WORKFLOW_STATES.has(witness?.state) &&
    witness?.source?.topologyOperatorCurrentStepId ===
      TOPOLOGY_OPERATOR_CURRENT_STEP_ID_DISPATCH_PENDING &&
    witness?.source?.topologyOperatorNextAction ===
      TOPOLOGY_OPERATOR_NEXT_ACTION_ADVANCE_EXISTING_OPERATION;
}

function buildProbeMissingEdge({
  handoffDetected,
  handoffContractDetected,
  operationWorkflowHandoffLegMissing,
}) {
  if (operationWorkflowHandoffLegMissing) {
    return {
      id: MISSING_EDGE_PUBLICATION_OPERATION_WORKFLOW_HANDOFF,
      name: MISSING_EDGE_NAME_PUBLICATION_OPERATION_WORKFLOW_HANDOFF,
    };
  }
  if (!handoffDetected || handoffContractDetected) {
    return null;
  }
  return {
    id: MISSING_EDGE_PUBLICATION_ACK_TO_ACTIVE_GATE_RECONCILE,
    name: MISSING_EDGE_NAME_PUBLICATION_ACK_TO_ACTIVE_GATE_RECONCILE,
  };
}

function buildProbeContractEdge(handoffContractDetected) {
  if (!handoffContractDetected) {
    return null;
  }
  return {
    id: CONTRACT_EDGE_PUBLICATION_ACTIVE_GATE_HANDOFF,
    name: CONTRACT_EDGE_NAME_PUBLICATION_ACTIVE_GATE_HANDOFF,
  };
}

function buildProbeNextOwnerPath({
  operationWorkflowWitness,
  consumerWitness,
  handoffContract,
  operationWorkflowHandoffLegMissing,
}) {
  if (operationWorkflowHandoffLegMissing) {
    return {
      edge: operationWorkflowWitness.edge,
      owner: operationWorkflowWitness.owner,
      boundary: operationWorkflowWitness.boundary,
      evidencePath: operationWorkflowWitness.evidencePath,
      requiredAction: operationWorkflowWitness.source.topologyOperatorNextAction,
      runtimePromotionAllowed: handoffContract.runtimePromotionAllowed,
    };
  }
  const requiredAction = isProbeHandoffContractDetected(handoffContract) ?
    handoffContract.nextAction :
    HANDOFF_PROBE_TARGET_ACTION_BUILD_REPLAYABLE_FIXTURE;
  return {
    edge: consumerWitness.edge,
    owner: consumerWitness.owner,
    boundary: consumerWitness.boundary,
    evidencePath: consumerWitness.evidencePath,
    requiredAction,
    runtimePromotionAllowed: handoffContract.runtimePromotionAllowed,
  };
}

function selectProbeRequiredProgressMechanism({
  operationWorkflowWitness,
  operationWorkflowHandoffLegMissing,
}) {
  if (operationWorkflowHandoffLegMissing !== true) {
    return REQUIRED_PROGRESS_MECHANISM_RECONCILE;
  }
  return PROBE_REQUIRED_PROGRESS_MECHANISM_RULES.find((rule) =>
    rule.matches(operationWorkflowWitness),
  ).mechanism;
}

function classifyProbeResult(
  handoffDetected,
  handoffContract,
  handoffContractDetected,
  operationWorkflowHandoffLegMissing,
) {
  if (operationWorkflowHandoffLegMissing) {
    return RESULT_CLASSIFICATION_PUBLICATION_OPERATION_WORKFLOW_HANDOFF_MISSING;
  }
  if (!handoffDetected) {
    return RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_HANDOFF_NOT_DETECTED;
  }
  if (!handoffContractDetected) {
    return RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_RECONCILE_MISSING;
  }
  if (
    handoffContract.state === HANDOFF_CONTRACT_STATE_COMPLETE &&
    handoffContract.runtimePromotionAllowed
  ) {
    return RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_HANDOFF_CONTRACT_COMPLETE;
  }
  return RESULT_CLASSIFICATION_PUBLICATION_ACTIVE_GATE_HANDOFF_CONTRACT_PENDING;
}

function isProbeHandoffContractDetected(handoffContract) {
  return Boolean(handoffContract) &&
    handoffContract.state !== ABSENT_VALUE &&
    handoffContract.reasonCode !== ABSENT_VALUE &&
    handoffContract.nextAction !== ABSENT_VALUE;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function splitProbeNodeIds(value) {
  return String(value || EMPTY_TEXT)
    .split(CSV_SEPARATOR)
    .map((nodeId) => nodeId.trim())
    .filter((nodeId) => nodeId.length > NUM_ZERO);
}

function probeBoolean(value) {
  if (value === true || value === BOOLEAN_TRUE_TEXT) {
    return true;
  }
  return RUNTIME_PROMOTION_DISALLOWED;
}

function probeBooleanVariant(value) {
  if (value === true || value === BOOLEAN_TRUE_TEXT) {
    return true;
  }
  if (value === false || value === BOOLEAN_FALSE_TEXT) {
    return false;
  }
  return UNKNOWN_VALUE;
}

function probeNumberOrUnknown(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return UNKNOWN_VALUE;
  }
  return parsed;
}

function positiveNumberOrZero(value) {
  return Number.isFinite(value) && value > NUM_ZERO ? value : NUM_ZERO;
}

function renderPackageEvidenceBlock(graph, artifactPath) {
  const witness = selectTopologyConvergenceDominantWitness(graph);
  const explainCommand = [
    'npm run analyze:topology-convergence --',
    artifactPath,
    ARG_EXPLAIN,
    witness.edgeId,
  ].join(' ');
  return [
    MARKDOWN_SECTION_OWNER_EVIDENCE_BLOCK,
    EMPTY_TEXT,
    markdownField(LABEL_SOURCE_ARTIFACT, artifactPath),
    markdownField(LABEL_SCENARIO, graph.scenario),
    markdownField(LABEL_FRONTIER_EDGE, witness.edgeId),
    markdownField(LABEL_CURRENT_OWNER, witness.owner),
    markdownField(LABEL_CURRENT_BOUNDARY, witness.boundary),
    markdownField(LABEL_FRONTIER_STATE, witness.frontierState),
    markdownField(LABEL_DOMINANT_REASON, witness.dominantReason),
    markdownField(LABEL_EVIDENCE_PATH, witness.evidencePath),
    markdownField(LABEL_REASONS, witness.reasons.join(LIST_SEPARATOR) || ABSENT_VALUE),
    markdownField(LABEL_NEXT_EXPLAIN_COMMAND, explainCommand),
  ].join(STDOUT_NEWLINE);
}

function markdownField(label, value) {
  return `${MARKDOWN_LIST_PREFIX}${label}: ${MARKDOWN_CODE_DELIMITER}` +
    `${value}${MARKDOWN_CODE_DELIMITER}`;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

process.exitCode = main(process.argv);
