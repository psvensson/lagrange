#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildCausalAnalysis} from '../src/diagnostics/index.js';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceGraphFromArtifacts,
  selectTopologyConvergenceDominantWitness,
} from '../src/diagnostics/topology-convergence-graph.js';

const ARG_HELP_SHORT = '-h';
const ARG_HELP_LONG = '--help';
const ARG_MARKDOWN = '--markdown';
const ARG_JSON = '--json';
const ARGUMENT_START_INDEX = 2;
const ENCODING_UTF8 = 'utf8';
const JSON_INDENT_SPACES = 2;
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_THREE = 3;
const STDOUT_NEWLINE = '\n';
const EMPTY_TEXT = '';
const ABSENT_VALUE = 'absent';
const FILE_FAILURE_BUNDLE = 'failure-bundle.json';
const FILE_TRIAGE_SUMMARY = 'triage-summary.json';
const FILE_REPORT_SUFFIX = '.report.json';
const PROPERTY_FAILURE_BUNDLE = 'failureBundle';
const PROPERTY_PUBLICATION_CONVERGENCE = 'publicationConvergence';
const PROPERTY_SUMMARY = 'summary';
const OUTPUT_SCHEMA_VERSION = 'representative-evidence-summary-v1';
const OUTPUT_FORMAT_JSON = 'json';
const OUTPUT_FORMAT_MARKDOWN = 'markdown';
const MARKDOWN_TITLE = '# Representative Evidence Summary';
const HELP_TEXT = [
  'Usage: node scripts/summarize-representative-evidence.js <artifact.json> [--json|--markdown]',
  '',
  'Reads a report, failure-bundle, or triage-summary artifact and prints a',
  'compact deterministic handoff combining topology-frontier and causal-model',
  'summary evidence. It does not read raw logs or mutate files.',
].join(STDOUT_NEWLINE);

function parseCliArgs(args) {
  let format = OUTPUT_FORMAT_JSON;
  const positional = [];
  for (const arg of args) {
    if (arg === ARG_HELP_SHORT || arg === ARG_HELP_LONG) {
      return {helpRequested: true, artifactPath: EMPTY_TEXT, format};
    }
    if (arg === ARG_MARKDOWN) {
      format = OUTPUT_FORMAT_MARKDOWN;
      continue;
    }
    if (arg === ARG_JSON) {
      format = OUTPUT_FORMAT_JSON;
      continue;
    }
    positional.push(arg);
  }
  return {
    helpRequested: false,
    artifactPath: positional[NUM_ZERO] || EMPTY_TEXT,
    format,
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, ENCODING_UTF8));
}

function buildTopologyGraphForArtifact(artifactPath, artifact) {
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

function normalizeReasons(reasons) {
  return Array.isArray(reasons) ? reasons : [];
}

function summarizeTopology(graph) {
  const witness = selectTopologyConvergenceDominantWitness(graph);
  return {
    scenario: graph.scenario || ABSENT_VALUE,
    firstFrontierEdgeId: graph.summary?.firstFrontierEdgeId || ABSENT_VALUE,
    frontierCount: Array.isArray(graph.frontier) ? graph.frontier.length : NUM_ZERO,
    dominantWitness: {
      edgeId: witness.edgeId || ABSENT_VALUE,
      owner: witness.owner || ABSENT_VALUE,
      boundary: witness.boundary || ABSENT_VALUE,
      frontierState: witness.frontierState || ABSENT_VALUE,
      dominantReason: witness.dominantReason || ABSENT_VALUE,
      evidencePath: witness.evidencePath || ABSENT_VALUE,
      reasons: normalizeReasons(witness.reasons),
    },
    nextExpectedFrontier: graph.nextExpectedFrontier || ABSENT_VALUE,
  };
}

function summarizeCriticalPath(criticalPath) {
  if (!Array.isArray(criticalPath)) {
    return [];
  }
  return criticalPath.slice(NUM_ZERO, NUM_THREE).map((node) => ({
    nodeId: node.nodeId || ABSENT_VALUE,
    edgeId: node.edgeId || ABSENT_VALUE,
    state: node.state || ABSENT_VALUE,
    owner: node.owner || ABSENT_VALUE,
    boundary: node.boundary || ABSENT_VALUE,
    reasons: normalizeReasons(node.reasons),
  }));
}

function summarizeCausal(analysis) {
  return {
    outcome: analysis.summary?.outcome || ABSENT_VALUE,
    dominantFailureClass: analysis.summary?.dominantFailureClass || ABSENT_VALUE,
    firstCriticalPathNodeId: analysis.summary?.firstCriticalPathNodeId || ABSENT_VALUE,
    exhaustedBudgetCount: analysis.summary?.exhaustedBudgetCount || NUM_ZERO,
    failedInvariantCount: analysis.summary?.failedInvariantCount || NUM_ZERO,
    stopCondition: analysis.stopDecision?.condition || ABSENT_VALUE,
    stopReasons: normalizeReasons(analysis.stopDecision?.reasons),
    criticalPath: summarizeCriticalPath(analysis.graph?.criticalPath),
  };
}

function buildRepresentativeEvidenceSummary(artifactPath, artifact) {
  const topologyGraph = buildTopologyGraphForArtifact(artifactPath, artifact);
  const causalAnalysis = buildCausalAnalysis(artifact);
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    sourceArtifact: artifactPath,
    scenario: topologyGraph.scenario || causalAnalysis.scenario || ABSENT_VALUE,
    topology: summarizeTopology(topologyGraph),
    causal: summarizeCausal(causalAnalysis),
  };
}

function markdownLine(label, value) {
  return `- ${label}: \`${value}\``;
}

function renderMarkdown(summary) {
  const witness = summary.topology.dominantWitness;
  const criticalPath = summary.causal.criticalPath;
  return [
    MARKDOWN_TITLE,
    EMPTY_TEXT,
    markdownLine('Source artifact', summary.sourceArtifact),
    markdownLine('Scenario', summary.scenario),
    markdownLine('Topology frontier edge', summary.topology.firstFrontierEdgeId),
    markdownLine('Topology owner', witness.owner),
    markdownLine('Topology boundary', witness.boundary),
    markdownLine('Dominant reason', witness.dominantReason),
    markdownLine('Evidence path', witness.evidencePath),
    markdownLine('Causal outcome', summary.causal.outcome),
    markdownLine('Dominant failure class', summary.causal.dominantFailureClass),
    markdownLine('Stop condition', summary.causal.stopCondition),
    markdownLine('First critical path node', summary.causal.firstCriticalPathNodeId),
    EMPTY_TEXT,
    '## Critical Path Preview',
    EMPTY_TEXT,
    ...(criticalPath.length > NUM_ZERO ? criticalPath.map((node) =>
      `- \`${node.nodeId}\` owner=\`${node.owner}\` boundary=\`${node.boundary}\` state=\`${node.state}\``,
    ) : ['- `absent`']),
  ].join(STDOUT_NEWLINE);
}

function main(argv) {
  const parsedArgs = parseCliArgs(argv.slice(ARGUMENT_START_INDEX));
  if (parsedArgs.helpRequested) {
    process.stdout.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_SUCCESS;
  }
  if (!parsedArgs.artifactPath) {
    process.stderr.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_USAGE;
  }
  try {
    const artifact = readJsonFile(parsedArgs.artifactPath);
    const summary = buildRepresentativeEvidenceSummary(
      parsedArgs.artifactPath,
      artifact,
    );
    const output = parsedArgs.format === OUTPUT_FORMAT_MARKDOWN ?
      renderMarkdown(summary) :
      JSON.stringify(summary, null, JSON_INDENT_SPACES);
    process.stdout.write(`${output}${STDOUT_NEWLINE}`);
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`${error.message}${STDOUT_NEWLINE}`);
    return EXIT_FAILURE;
  }
}

if (process.argv[NUM_ONE] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  buildRepresentativeEvidenceSummary,
  renderMarkdown,
};
