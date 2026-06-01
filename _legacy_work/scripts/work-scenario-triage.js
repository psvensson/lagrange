#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildPriorityRecoveryResiduals,
} from './analyze-priority-recovery-residuals.js';
import {
  buildRepresentativeEvidenceSummary,
} from './summarize-representative-evidence.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const JSON_INDENT_SPACES = 2;
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_HELP = '--help';
const FLAG_MARKDOWN = '--markdown';
const FLAG_JSON = '--json';
const FLAG_WRITE = '--write';
const OUTPUT_SCHEMA_VERSION = 'scenario-triage-v1';
const OUTPUT_FORMAT_MARKDOWN = 'markdown';
const OUTPUT_FORMAT_JSON = 'json';
const HELP_TEXT = [
  'Usage: node scripts/work-scenario-triage.js <artifact.json> [--json|--markdown] [--write <path>]',
  '',
  'Combines representative evidence and focused residual grouping into one',
  'deterministic scenario-triage handoff for package creation and migration.',
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
    format: args.includes(FLAG_JSON) ? OUTPUT_FORMAT_JSON : format,
    writePath: parseOptionValue(args, FLAG_WRITE),
  };
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, ENCODING_UTF8));
}

function buildExtractorCommands(artifactPath) {
  return [
    `npm run work:evidence-summary -- ${artifactPath}`,
    `npm run work:scenario-triage -- ${artifactPath} --markdown`,
    `npm run analyze:priority-recovery-residuals -- ${artifactPath} --markdown`,
    `npm run analyze:topology-convergence -- ${artifactPath}`,
    `npm run analyze:causal-model -- ${artifactPath}`,
  ];
}

function selectPublicationConvergence(artifact) {
  const scenario = artifact.scenarios?.[NUM_ZERO] ||
    artifact.failureBundle?.scenarios?.[NUM_ZERO] ||
    artifact.summary?.scenarios?.[NUM_ZERO] ||
    artifact;
  return scenario.publicationConvergence ||
    artifact.publicationConvergence ||
    artifact.failureBundle?.publicationConvergence ||
    artifact.summary?.publicationConvergence ||
    {};
}

function selectActiveGateProgress(publicationConvergence) {
  return publicationConvergence?.activeGate?.progress ||
    publicationConvergence?.activeGate?.activeGateProgress ||
    publicationConvergence?.activeGateProgress ||
    publicationConvergence?.progress ||
    {};
}

function checkSignalConflict(artifact, priorityRecoveryResiduals) {
  const publicationConvergence = selectPublicationConvergence(artifact);
  const activeGateProgress = selectActiveGateProgress(publicationConvergence);

  const pendingRecoveryCount = Number(
    activeGateProgress.publicationActiveGateHandoffPendingRecoveryCount ??
    activeGateProgress.activeGateOwnerCohortPendingRecoveryCount ??
    NUM_ZERO
  );

  const pendingRecoveryNodeIdsStr = String(
    activeGateProgress.publicationActiveGateHandoffPendingRecoveryNodeIds ||
    activeGateProgress.activeGateOwnerCohortPendingRecoveryNodeIds ||
    EMPTY_TEXT
  );
  const pendingRecoveryNodeIds = pendingRecoveryNodeIdsStr
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  const priorityRecoveryDominantReason = String(
    activeGateProgress.priorityRecoveryProgressClasses?.dominantReason ||
    activeGateProgress.priorityRecoveryProgressClasses?.source?.dominantReason ||
    activeGateProgress.progress?.priorityRecoveryProgressClasses?.dominantReason ||
    EMPTY_TEXT
  );

  const ownerRecoveryPendingWrites = Number(
    activeGateProgress.selectedControlPlaneOwnerQueuePendingWrites ??
    NUM_ZERO
  );

  const handoffOutcomeState = String(
    activeGateProgress.membershipPublicationHandoffOutcomeState ||
    EMPTY_TEXT
  );

  // A conflict exists if the active gate is waiting on recovery (pendingRecoveryCount > 0 or dominantReason is PRIORITY_CONTROL_PLANE_RECOVERY_PENDING)
  // but priorityRecoveryResiduals reports zero witness count (witnessCount === 0).
  const isConflict = (pendingRecoveryCount > NUM_ZERO ||
    priorityRecoveryDominantReason === 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING' ||
    ownerRecoveryPendingWrites > NUM_ZERO) &&
    priorityRecoveryResiduals.witnessCount === NUM_ZERO;

  if (isConflict) {
    return {
      conflictDetected: true,
      pendingRecoveryCount,
      pendingRecoveryNodeIds,
      witnessCount: priorityRecoveryResiduals.witnessCount,
      priorityRecoveryDominantReason: priorityRecoveryDominantReason || 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
      ownerRecoveryPendingWrites,
      handoffOutcomeState,
    };
  }

  return null;
}

function buildPackageCommand(summary) {
  if (summary.signalConflict) {
    return [
      'npm run work:package:new --',
      `--from-artifact ${summary.sourceArtifact}`,
      '--owner diagnostics_owner',
      '--boundary scenario_triage_signal_conflict',
      '--dominant-reason priority_recovery_zero_witness_conflict',
    ].join(' ');
  }
  const witness = summary.representativeEvidence.topology.dominantWitness;
  return [
    'npm run work:package:new --',
    `--from-artifact ${summary.sourceArtifact}`,
    `--owner ${witness.owner}`,
    `--boundary ${witness.boundary}`,
    `--dominant-reason ${witness.dominantReason}`,
  ].join(' ');
}

function buildScenarioTriageSummary(artifactPath, artifact) {
  const representativeEvidence = buildRepresentativeEvidenceSummary(
    artifactPath,
    artifact,
  );
  const priorityRecoveryResiduals = buildPriorityRecoveryResiduals(
    artifactPath,
    artifact,
  );
  const signalConflict = checkSignalConflict(artifact, priorityRecoveryResiduals);
  const summary = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    sourceArtifact: artifactPath,
    scenario: representativeEvidence.scenario,
    representativeEvidence,
    priorityRecoveryResiduals,
    signalConflict,
    extractorCommands: buildExtractorCommands(artifactPath),
  };
  return {
    ...summary,
    suggestedPackageCommand: buildPackageCommand(summary),
  };
}

function markdownList(values = []) {
  if (!Array.isArray(values) || values.length === NUM_ZERO) {
    return '- `none`';
  }
  return values.map((value) => `- \`${value}\``).join(NEWLINE);
}

function renderMarkdown(summary) {
  const witness = summary.representativeEvidence.topology.dominantWitness;
  const causal = summary.representativeEvidence.causal;
  const lines = [
    '# Scenario Triage',
    EMPTY_TEXT,
    `- Source artifact: \`${summary.sourceArtifact}\``,
    `- Scenario: \`${summary.scenario}\``,
    `- Frontier edge: \`${summary.representativeEvidence.topology.firstFrontierEdgeId}\``,
    `- Owner: \`${witness.owner}\``,
    `- Boundary: \`${witness.boundary}\``,
    `- Dominant reason: \`${witness.dominantReason}\``,
    `- Causal outcome: \`${causal.outcome}\``,
    `- Stop condition: \`${causal.stopCondition}\``,
    EMPTY_TEXT,
  ];

  if (summary.signalConflict) {
    lines.push(
      '## Signal Conflict Detected',
      EMPTY_TEXT,
      `- Conflict status: \`TRUE\``,
      `- Active gate pending recovery count: \`${summary.signalConflict.pendingRecoveryCount}\``,
      `- Pending recovery node IDs: \`${JSON.stringify(summary.signalConflict.pendingRecoveryNodeIds)}\``,
      `- Priority recovery residual witness count: \`${summary.signalConflict.witnessCount}\``,
      `- Dominant recovery pending reason: \`${summary.signalConflict.priorityRecoveryDominantReason}\``,
      `- Owner recovery pending writes: \`${summary.signalConflict.ownerRecoveryPendingWrites}\``,
      `- Handoff outcome state: \`${summary.signalConflict.handoffOutcomeState}\``,
      EMPTY_TEXT
    );
  }

  lines.push(
    '## Priority Recovery Residuals',
    EMPTY_TEXT,
    `- Witnesses: \`${summary.priorityRecoveryResiduals.witnessCount}\``,
    `- Owner-boundary groups: \`${summary.priorityRecoveryResiduals.ownerBoundaryGroupCount}\``,
    `- Split required: \`${summary.priorityRecoveryResiduals.splitRequired}\``,
    EMPTY_TEXT
  );

  if (summary.priorityRecoveryResiduals.lowConfidenceResiduals && summary.priorityRecoveryResiduals.lowConfidenceResiduals.length > NUM_ZERO) {
    lines.push('### Low-Confidence Derived Residuals', EMPTY_TEXT);
    for (const residual of summary.priorityRecoveryResiduals.lowConfidenceResiduals) {
      lines.push(
        `- Node \`${residual.nodeId}\`: ` +
        `derived from \`${residual.source}\` with reason \`${residual.reasonCode}\` (confidence: \`${residual.confidence}\`); ` +
        `owner \`${residual.owner}\`, boundary \`${residual.boundary}\``
      );
    }
    lines.push(EMPTY_TEXT);
  }

  lines.push(
    '## Suggested Package Command',
    EMPTY_TEXT,
    `- \`${summary.suggestedPackageCommand}\``,
    EMPTY_TEXT,
    '## Extractor Commands',
    EMPTY_TEXT,
    markdownList(summary.extractorCommands)
  );

  return lines.join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const parsed = parseArgs(args);
  if (parsed.help || !parsed.artifactPath) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const summary = buildScenarioTriageSummary(
    parsed.artifactPath,
    await readJsonFile(parsed.artifactPath),
  );
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
  buildScenarioTriageSummary,
  renderMarkdown,
  runCli,
};
