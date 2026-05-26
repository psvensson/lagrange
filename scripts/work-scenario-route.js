#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildPriorityRecoveryResiduals,
} from './analyze-priority-recovery-residuals.js';
import {
  buildOwnerFileIndex,
} from './analyze-owner-files.js';
import {
  buildRepresentativeEvidenceSummary,
} from './summarize-representative-evidence.js';
import {
  enrichArtifactWithSidecarsSync,
} from './artifact-sidecar-loader.js';
import {
  buildCausalAnalysis,
} from '../src/diagnostics/index.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const JSON_INDENT_SPACES = 2;
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_HELP = '--help';
const FLAG_MARKDOWN = '--markdown';
const FLAG_JSON = '--json';
const FLAG_WRITE = '--write';
const FLAG_OWNER = '--owner';
const FLAG_BOUNDARY = '--boundary';
const FLAG_DOMINANT_REASON = '--dominant-reason';
const FLAG_EXPLAIN = '--explain';
const FLAG_TEST = '--test';
const OUTPUT_FORMAT_MARKDOWN = 'markdown';
const OUTPUT_FORMAT_JSON = 'json';
const OUTPUT_SCHEMA_VERSION = 'scenario-route-v1';
const DEFAULT_OWNER_FILE_TOP = 5;
const VALUE_UNKNOWN = 'unknown';
const VALUE_NONE = 'none';
const SPACE = ' ';
const COMMAND_WORK_ADVANCE_CHECK = 'npm run work:advance -- --check';
const COMMAND_WORK_PACKAGE_NEW_PREFIX = 'npm run work:package:new --';
const LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
const LANE_EXPERIMENT = 'experiment';
const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
const CAUSAL_OUTCOME_CONTINUE_LOCAL_FIX = 'continue_local_fix';
const STOP_CONDITION_CLASSIFIED_LOCAL_BLOCKER = 'classified_local_blocker';
const SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY =
  'open-runtime-owner-boundary';
const SUCCESSOR_ACTION_OPEN_ARCHITECTURE_EXPERIMENT =
  'open-architecture-experiment';
const SUCCESSOR_ACTION_RERUN_REPRESENTATIVE_EVIDENCE =
  'rerun-representative-evidence';
const MARKDOWN_NONE_LIST_ITEM = '- `none`';
const MARKDOWN_HEADER_SCENARIO_ROUTE = '# Scenario Route';
const MARKDOWN_HEADER_REPRESENTATIVE_EVIDENCE =
  '## Representative Evidence';
const MARKDOWN_HEADER_PRIORITY_RECOVERY_RESIDUALS =
  '## Priority Recovery Residuals';
const MARKDOWN_HEADER_OWNER_FILES = '## Owner Files';
const MARKDOWN_HEADER_SUGGESTED_PROOF = '## Suggested Proof';
const MARKDOWN_HEADER_SUGGESTED_PACKAGE_COMMAND =
  '## Suggested Package Command';
const HELP_TEXT = [
  'Usage: node scripts/work-scenario-route.js <artifact.json> [--owner <owner>] [--boundary <boundary>] [--dominant-reason <reason>] [--explain <edge>] [--test <test.js>] [--json|--markdown] [--write <path>]',
  '',
  'Combines representative evidence, causal summary, priority residuals,',
  'owner-file discovery, and a capped proof ladder into one route handoff.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function parseOptionValue(args, optionName) {
  const index = args.indexOf(optionName);
  if (index < NUM_ZERO) {
    return EMPTY_TEXT;
  }
  return normalizeText(args[index + NUM_ONE]);
}

function parseRepeatedOptionValues(args, optionName) {
  const values = [];
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    if (args[index] === optionName) {
      values.push(normalizeText(args[index + NUM_ONE]));
      index += NUM_ONE;
    }
  }
  return values.filter((value) => value.length > NUM_ZERO);
}

function parseArgs(args = []) {
  if (args.includes(FLAG_HELP)) {
    return {help: true};
  }
  const artifactPath = args.find((arg) => !arg.startsWith('--')) || EMPTY_TEXT;
  const format = args.includes(FLAG_MARKDOWN) ?
    OUTPUT_FORMAT_MARKDOWN :
    OUTPUT_FORMAT_JSON;
  return {
    artifactPath,
    owner: parseOptionValue(args, FLAG_OWNER),
    boundary: parseOptionValue(args, FLAG_BOUNDARY),
    dominantReason: parseOptionValue(args, FLAG_DOMINANT_REASON),
    explain: parseOptionValue(args, FLAG_EXPLAIN),
    tests: parseRepeatedOptionValues(args, FLAG_TEST),
    format: args.includes(FLAG_JSON) ? OUTPUT_FORMAT_JSON : format,
    writePath: parseOptionValue(args, FLAG_WRITE),
  };
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, ENCODING_UTF8));
}

function firstCausalOwnerNode(analysis = {}) {
  const criticalPath = analysis.graph?.criticalPath;
  return Array.isArray(criticalPath) ?
    criticalPath.find((node) =>
      normalizeText(node?.owner).length > NUM_ZERO &&
      normalizeText(node?.boundary).length > NUM_ZERO) :
    null;
}

function routeField(optionValue, causalNodeValue, topologyValue) {
  return normalizeText(optionValue) ||
    normalizeText(causalNodeValue) ||
    normalizeText(topologyValue) ||
    VALUE_UNKNOWN;
}

function buildRoute(options, representativeEvidence, causalAnalysis) {
  const witness = representativeEvidence.topology?.dominantWitness || {};
  const causalOwnerNode = firstCausalOwnerNode(causalAnalysis) || {};
  return {
    owner: routeField(options.owner, causalOwnerNode.owner, witness.owner),
    boundary: routeField(
      options.boundary,
      causalOwnerNode.boundary,
      witness.boundary,
    ),
    dominantReason: routeField(
      options.dominantReason,
      causalOwnerNode.reason,
      witness.dominantReason,
    ),
    explainEdge: normalizeText(options.explain) ||
      representativeEvidence.topology?.firstFrontierEdgeId ||
      VALUE_NONE,
  };
}

function buildRouteCommand(artifactPath, route) {
  const parts = [
    'npm run work:scenario-route --',
    artifactPath,
    '--owner',
    route.owner,
    '--boundary',
    route.boundary,
    '--dominant-reason',
    route.dominantReason,
  ];
  if (route.explainEdge !== VALUE_NONE) {
    parts.push(FLAG_EXPLAIN, route.explainEdge);
  }
  return parts.join(SPACE);
}

function buildSuggestedProof(artifactPath, route, tests = []) {
  return [
    buildRouteCommand(artifactPath, route),
    ...(tests.length > NUM_ZERO ? [`node --test ${tests.join(SPACE)}`] : []),
    COMMAND_WORK_ADVANCE_CHECK,
  ];
}

function hasStableRuntimeOwnerBoundary(route = {}) {
  return route.owner !== VALUE_UNKNOWN && route.boundary !== VALUE_UNKNOWN;
}

function suggestedSuccessorLane(route = {}, representativeEvidence = {}) {
  const causalRouteText = [
    representativeEvidence.causal?.outcome,
    representativeEvidence.causal?.stopCondition,
  ].map(normalizeText).join(SPACE);
  if (/\b(?:same[-_ ]frontier|architecture[-_ ]gap)\b/iu.test(causalRouteText)) {
    return LANE_EXPERIMENT;
  }
  if (
    hasStableRuntimeOwnerBoundary(route) &&
    representativeEvidence.causal?.outcome === CAUSAL_OUTCOME_CONTINUE_LOCAL_FIX &&
    representativeEvidence.causal?.stopCondition ===
      STOP_CONDITION_CLASSIFIED_LOCAL_BLOCKER
  ) {
    return LANE_RUNTIME_OWNER_BOUNDARY;
  }
  return LANE_DIAGNOSTIC_CLASSIFICATION;
}

function suggestedSuccessorAction(route = {}, representativeEvidence = {}) {
  if (suggestedSuccessorLane(route, representativeEvidence) === LANE_EXPERIMENT) {
    return SUCCESSOR_ACTION_OPEN_ARCHITECTURE_EXPERIMENT;
  }
  return suggestedSuccessorLane(route, representativeEvidence) ===
    LANE_RUNTIME_OWNER_BOUNDARY ?
    SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY :
    SUCCESSOR_ACTION_RERUN_REPRESENTATIVE_EVIDENCE;
}

async function buildScenarioRouteSummary(options = {}) {
  const rawArtifact = await readJsonFile(options.artifactPath);
  const artifact = enrichArtifactWithSidecarsSync(
    options.artifactPath,
    rawArtifact,
  );
  const representativeEvidence = buildRepresentativeEvidenceSummary(
    options.artifactPath,
    artifact,
  );
  const causalAnalysis = buildCausalAnalysis(artifact);
  const priorityRecoveryResiduals = buildPriorityRecoveryResiduals(
    options.artifactPath,
    artifact,
  );
  const route = buildRoute(options, representativeEvidence, causalAnalysis);
  const ownerFiles = route.owner !== VALUE_UNKNOWN ?
    await buildOwnerFileIndex({
      owner: route.owner,
      boundary: route.boundary === VALUE_UNKNOWN ? EMPTY_TEXT : route.boundary,
      top: DEFAULT_OWNER_FILE_TOP,
    }) :
    null;
  const suggestedProof = buildSuggestedProof(
    options.artifactPath,
    route,
    options.tests,
  );
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    sourceArtifact: options.artifactPath,
    scenario: representativeEvidence.scenario,
    route,
    representativeEvidence: {
      topologyFrontierEdge: representativeEvidence.topology?.firstFrontierEdgeId,
      topologyOwner: representativeEvidence.topology?.dominantWitness?.owner,
      topologyBoundary: representativeEvidence.topology?.dominantWitness?.boundary,
      topologyDominantReason:
        representativeEvidence.topology?.dominantWitness?.dominantReason,
      causalOutcome: representativeEvidence.causal?.outcome,
      causalStopCondition: representativeEvidence.causal?.stopCondition,
      causalFirstCriticalPathNode:
        representativeEvidence.causal?.firstCriticalPathNodeId,
    },
    priorityRecoveryResiduals: {
      witnessCount: priorityRecoveryResiduals.witnessCount,
      ownerBoundaryGroupCount: priorityRecoveryResiduals.ownerBoundaryGroupCount,
      splitRequired: priorityRecoveryResiduals.splitRequired,
    },
    ownerFiles: ownerFiles ? {
      matchCount: ownerFiles.matchCount,
      files: ownerFiles.files.map((file) => ({
        path: file.path,
        score: file.score,
      })),
    } : null,
    suggestedProof,
    suggestedPackageCommand: [
      COMMAND_WORK_PACKAGE_NEW_PREFIX,
      `--from-artifact ${options.artifactPath}`,
      `--lane ${suggestedSuccessorLane(route, representativeEvidence)}`,
      `--owner ${route.owner}`,
      `--boundary ${route.boundary}`,
      `--dominant-reason ${route.dominantReason}`,
      `--route-causal-outcome ${representativeEvidence.causal?.outcome || VALUE_UNKNOWN}`,
      `--route-stop-mode ${representativeEvidence.causal?.stopCondition || VALUE_UNKNOWN}`,
      `--successor-action ${suggestedSuccessorAction(route, representativeEvidence)}`,
    ].join(SPACE),
  };
}

function markdownList(values = []) {
  if (!Array.isArray(values) || values.length === NUM_ZERO) {
    return MARKDOWN_NONE_LIST_ITEM;
  }
  return values.map((value) => `- \`${value}\``).join(NEWLINE);
}

function renderOwnerFiles(ownerFiles) {
  if (!ownerFiles || ownerFiles.files.length === NUM_ZERO) {
    return MARKDOWN_NONE_LIST_ITEM;
  }
  return ownerFiles.files
    .slice(NUM_ZERO, NUM_THREE)
    .map((file) => `- \`${file.path}\` score=\`${file.score}\``)
    .join(NEWLINE);
}

function renderMarkdown(summary) {
  return [
    MARKDOWN_HEADER_SCENARIO_ROUTE,
    EMPTY_TEXT,
    `- Source artifact: \`${summary.sourceArtifact}\``,
    `- Scenario: \`${summary.scenario}\``,
    `- Route owner: \`${summary.route.owner}\``,
    `- Route boundary: \`${summary.route.boundary}\``,
    `- Dominant reason: \`${summary.route.dominantReason}\``,
    `- Explain edge: \`${summary.route.explainEdge}\``,
    EMPTY_TEXT,
    MARKDOWN_HEADER_REPRESENTATIVE_EVIDENCE,
    EMPTY_TEXT,
    `- Topology frontier: \`${summary.representativeEvidence.topologyFrontierEdge}\``,
    `- Topology owner: \`${summary.representativeEvidence.topologyOwner}\``,
    `- Topology boundary: \`${summary.representativeEvidence.topologyBoundary}\``,
    `- Causal outcome: \`${summary.representativeEvidence.causalOutcome}\``,
    `- Causal stop: \`${summary.representativeEvidence.causalStopCondition}\``,
    EMPTY_TEXT,
    MARKDOWN_HEADER_PRIORITY_RECOVERY_RESIDUALS,
    EMPTY_TEXT,
    `- Witnesses: \`${summary.priorityRecoveryResiduals.witnessCount}\``,
    `- Owner-boundary groups: \`${summary.priorityRecoveryResiduals.ownerBoundaryGroupCount}\``,
    `- Split required: \`${summary.priorityRecoveryResiduals.splitRequired}\``,
    EMPTY_TEXT,
    MARKDOWN_HEADER_OWNER_FILES,
    EMPTY_TEXT,
    renderOwnerFiles(summary.ownerFiles),
    EMPTY_TEXT,
    MARKDOWN_HEADER_SUGGESTED_PROOF,
    EMPTY_TEXT,
    markdownList(summary.suggestedProof),
    EMPTY_TEXT,
    MARKDOWN_HEADER_SUGGESTED_PACKAGE_COMMAND,
    EMPTY_TEXT,
    `- \`${summary.suggestedPackageCommand}\``,
  ].join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const parsed = parseArgs(args);
  if (parsed.help || !parsed.artifactPath) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const summary = await buildScenarioRouteSummary(parsed);
  const output = parsed.format === OUTPUT_FORMAT_MARKDOWN ?
    renderMarkdown(summary) :
    JSON.stringify(summary, null, JSON_INDENT_SPACES);
  if (parsed.writePath) {
    await fs.writeFile(parsed.writePath, `${output}${NEWLINE}`, ENCODING_UTF8);
    return `Wrote ${parsed.writePath}.${NEWLINE}`;
  }
  return `${output}${NEWLINE}`;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(output);
      process.exitCode = EXIT_SUCCESS;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  buildScenarioRouteSummary,
  renderMarkdown,
  runCli,
};
