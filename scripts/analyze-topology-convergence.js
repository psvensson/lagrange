#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  EDGE_ID,
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceDecisionTable,
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
const ARG_PACKAGE_EVIDENCE_BLOCK = '--package-evidence-block';
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
const PROPERTY_SUMMARY = 'summary';
const STDOUT_NEWLINE = '\n';
const EMPTY_TEXT = '';
const ABSENT_VALUE = 'absent';
const CLI_FLAG_PREFIX = '-';
const FILE_JSON_EXTENSION = '.json';
const MODE_SUMMARY = 'summary';
const MODE_DECISION_TABLE = 'decision-table';
const MODE_GLOSSARY = 'glossary';
const MODE_EXPLAIN = 'explain';
const MODE_PACKAGE_EVIDENCE_BLOCK = 'package-evidence-block';
const SCHEMA_VERSION_TOPOLOGY_OWNER_EXPLAIN_V1 = 'topology-owner-explain-v1';
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
const LIST_SEPARATOR = ', ';
const HELP_TEXT = [
  'Usage: node scripts/analyze-topology-convergence.js <artifact.json> [--explain <edge-id-or-alias>] [--package-evidence-block]',
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
