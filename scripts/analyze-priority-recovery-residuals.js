#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const JSON_INDENT_SPACES = 2;
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const LIST_SEPARATOR = ',';
const KEY_SEPARATOR = '/';
const SLUG_SOURCE_SEPARATOR = '_';
const SLUG_SEPARATOR = '-';
const COMMAND_SEPARATOR = ' ';
const SCHEMA_VERSION = 'priority-recovery-residuals-v1';
const UNKNOWN_VALUE = 'unknown';
const PRIORITY_REASON = 'priority_recovery_progress_blocked';
const SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const QUEST_NEW_COMMAND_PREFIX = 'npm run solve:new --';
const QUEST_NEW_FLAG_ID = '--id';
const QUEST_NEW_FLAG_STATEMENT = '--statement';
const SUCCESSOR_NEXT_ACTION =
  'Prove or split this residual owner boundary.';
const MARKDOWN_NO_WITNESSES_LINE =
  '- No priority recovery partition witnesses found.';
const MARKDOWN_LIST_SEPARATOR = ', ';
const MARKDOWN_SUCCESSOR_COMMANDS_HEADING = '## Successor Commands';
const HELP_TEXT = [
  'Usage:',
  '  node scripts/analyze-priority-recovery-residuals.js <artifact.json> [--markdown]',
  '',
  'Reads representative report or failure-bundle JSON and extracts priority',
  'recovery residual partition witnesses by owner and boundary.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, ENCODING_UTF8));
}

function selectScenario(artifact) {
  return artifact.scenarios?.[NUM_ZERO] ||
    artifact.failureBundle?.scenarios?.[NUM_ZERO] ||
    artifact.summary?.scenarios?.[NUM_ZERO] ||
    artifact;
}

function selectPublicationConvergence(artifact) {
  const scenario = selectScenario(artifact);
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

function selectScenarioName(artifact) {
  return normalizeText(selectScenario(artifact).name) ||
    normalizeText(selectScenario(artifact).scenario) ||
    normalizeText(artifact.scenario) ||
    UNKNOWN_VALUE;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  const normalized = normalizeText(value);
  return normalized ? normalized.split(LIST_SEPARATOR).map(normalizeText) : [];
}

function isNonBlockingPriorityRecoveryWitness(witness = {}) {
  return (
    normalizeText(witness.semanticStateId) ===
      SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT &&
    normalizeArray(witness.progressClassIds).length === NUM_ZERO &&
    normalizeArray(witness.blockerReasonCodes).length === NUM_ZERO
  );
}

function witnessKey(witness = {}) {
  return [
    normalizeText(witness.currentOwner) || UNKNOWN_VALUE,
    normalizeText(witness.blockingBoundary) || UNKNOWN_VALUE,
  ].join(KEY_SEPARATOR);
}

function addAll(targetSet, values = []) {
  for (const value of values) {
    if (normalizeText(value)) {
      targetSet.add(normalizeText(value));
    }
  }
}

function buildGroupSnapshot(group) {
  return {
    owner: group.owner,
    boundary: group.boundary,
    partitionIds: [...group.partitionIds].sort(),
    semanticStateIds: [...group.semanticStateIds].sort(),
    progressClassIds: [...group.progressClassIds].sort(),
    blockerReasonCodes: [...group.blockerReasonCodes].sort(),
    nextRequiredActions: [...group.nextRequiredActions].sort(),
    actuationStates: [...group.actuationStates].sort(),
    waitModes: [...group.waitModes].sort(),
    witnessCount: group.witnesses.length,
    witnesses: group.witnesses,
  };
}

function slugPart(value) {
  return normalizeText(value)
    .toLowerCase()
    .replaceAll(SLUG_SOURCE_SEPARATOR, SLUG_SEPARATOR)
    .replace(/[^a-z0-9-]+/gu, SLUG_SEPARATOR)
    .replace(/^-+|-+$/gu, EMPTY_TEXT) ||
    UNKNOWN_VALUE;
}

function buildSuccessorSuggestion(group, artifactPath, scenario) {
  const slug = [
    'priority-recovery',
    slugPart(group.owner),
    slugPart(group.boundary),
  ].join('-');
  const title = [
    'Priority Recovery',
    group.owner,
    group.boundary,
    'Residual',
  ].join(' ');
  return {
    owner: group.owner,
    boundary: group.boundary,
    slug,
    title,
    command: [
      QUEST_NEW_COMMAND_PREFIX,
      QUEST_NEW_FLAG_ID, slug,
      QUEST_NEW_FLAG_STATEMENT,
      JSON.stringify(
        `${title} is resolved for ${scenario} using ${artifactPath}; ` +
        `${PRIORITY_REASON}; ${SUCCESSOR_NEXT_ACTION}`,
      ),
    ].join(COMMAND_SEPARATOR),
  };
}

function buildPriorityRecoveryResiduals(artifactPath, artifact) {
  const publicationConvergence = selectPublicationConvergence(artifact);
  const witnesses = (
    publicationConvergence.priorityRecoveryPartitionWitnesses || []
  ).filter((witness) =>
    isNonBlockingPriorityRecoveryWitness(witness) !== true,
  );
  const groups = new Map();
  for (const witness of witnesses) {
    const key = witnessKey(witness);
    if (!groups.has(key)) {
      groups.set(key, {
        owner: normalizeText(witness.currentOwner) || UNKNOWN_VALUE,
        boundary: normalizeText(witness.blockingBoundary) || UNKNOWN_VALUE,
        partitionIds: new Set(),
        semanticStateIds: new Set(),
        progressClassIds: new Set(),
        blockerReasonCodes: new Set(),
        nextRequiredActions: new Set(),
        actuationStates: new Set(),
        waitModes: new Set(),
        witnesses: [],
      });
    }
    const group = groups.get(key);
    group.partitionIds.add(normalizeText(witness.partitionId) || UNKNOWN_VALUE);
    group.semanticStateIds.add(normalizeText(witness.semanticStateId) || UNKNOWN_VALUE);
    addAll(group.progressClassIds, normalizeArray(witness.progressClassIds));
    addAll(group.blockerReasonCodes, normalizeArray(witness.blockerReasonCodes));
    group.nextRequiredActions.add(
      normalizeText(witness.nextRequiredAction) || UNKNOWN_VALUE,
    );
    group.actuationStates.add(normalizeText(witness.actuationState) || UNKNOWN_VALUE);
    group.waitModes.add(normalizeText(witness.waitMode) || UNKNOWN_VALUE);
    group.witnesses.push({
      partitionId: normalizeText(witness.partitionId) || UNKNOWN_VALUE,
      semanticStateId: normalizeText(witness.semanticStateId) || UNKNOWN_VALUE,
      progressClassIds: normalizeArray(witness.progressClassIds),
      blockerReasonCodes: normalizeArray(witness.blockerReasonCodes),
      currentOwner: normalizeText(witness.currentOwner) || UNKNOWN_VALUE,
      blockingBoundary: normalizeText(witness.blockingBoundary) || UNKNOWN_VALUE,
      actuationState: normalizeText(witness.actuationState) || UNKNOWN_VALUE,
      waitMode: normalizeText(witness.waitMode) || UNKNOWN_VALUE,
      nextRequiredAction:
        normalizeText(witness.nextRequiredAction) || UNKNOWN_VALUE,
      operationIds: normalizeArray(witness.operationIds),
      serialWaitOperationIds: normalizeArray(witness.serialWaitOperationIds),
      serialWaitPartitionIds: normalizeArray(witness.serialWaitPartitionIds),
    });
  }
  const ownerBoundaryGroups = [...groups.values()]
    .map(buildGroupSnapshot)
    .sort((left, right) => {
      if (right.witnessCount !== left.witnessCount) {
        return right.witnessCount - left.witnessCount;
      }
      return `${left.owner}/${left.boundary}`.localeCompare(
        `${right.owner}/${right.boundary}`,
      );
    });

  const lowConfidenceResiduals = [];
  if (witnesses.length === NUM_ZERO) {
    const activeGateProgress = selectActiveGateProgress(publicationConvergence);
    const pendingRecoveryNodeIdsStr = String(
      activeGateProgress.publicationActiveGateHandoffPendingRecoveryNodeIds ||
      activeGateProgress.activeGateOwnerCohortPendingRecoveryNodeIds ||
      EMPTY_TEXT,
    );
    const pendingRecoveryNodeIds = pendingRecoveryNodeIdsStr
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const pendingRecoveryCount = Number(
      activeGateProgress.publicationActiveGateHandoffPendingRecoveryCount ??
      activeGateProgress.activeGateOwnerCohortPendingRecoveryCount ??
      NUM_ZERO,
    );

    const priorityRecoveryDominantReason = String(
      activeGateProgress.priorityRecoveryProgressClasses?.dominantReason ||
      activeGateProgress.priorityRecoveryProgressClasses?.source?.dominantReason ||
      activeGateProgress.progress?.priorityRecoveryProgressClasses?.dominantReason ||
      EMPTY_TEXT,
    );

    const ownerRecoveryPendingWrites = Number(
      activeGateProgress.selectedControlPlaneOwnerQueuePendingWrites ??
      NUM_ZERO,
    );

    if (pendingRecoveryNodeIds.length > NUM_ZERO || pendingRecoveryCount > NUM_ZERO || priorityRecoveryDominantReason === 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING' || ownerRecoveryPendingWrites > NUM_ZERO) {
      const nodeIds = pendingRecoveryNodeIds.length > NUM_ZERO ?
        pendingRecoveryNodeIds : [UNKNOWN_VALUE];
      for (const nodeId of nodeIds) {
        lowConfidenceResiduals.push({
          nodeId,
          owner: 'startup_active_gate_owner',
          boundary: 'snapshot_coverage',
          source: 'active_gate_cohort_recovery_pending',
          reasonCode: 'priority_recovery_zero_witness_conflict',
          confidence: 'low',
        });
      }
    }
  }

  const scenario = selectScenarioName(artifact);
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceArtifact: artifactPath,
    scenario,
    witnessCount: witnesses.length,
    splitRequired: ownerBoundaryGroups.length > NUM_ONE,
    ownerBoundaryGroupCount: ownerBoundaryGroups.length,
    ownerBoundaryGroups,
    suggestedSuccessors: ownerBoundaryGroups.map((group) =>
      buildSuccessorSuggestion(group, artifactPath, scenario)),
    lowConfidenceResiduals,
  };
}

function renderMarkdown(summary) {
  const lines = [
    '# Priority Recovery Residuals',
    EMPTY_TEXT,
    `- Source artifact: \`${summary.sourceArtifact}\``,
    `- Scenario: \`${summary.scenario}\``,
    `- Witnesses: \`${summary.witnessCount}\``,
    `- Owner-boundary groups: \`${summary.ownerBoundaryGroupCount}\``,
    `- Split required: \`${summary.splitRequired}\``,
    EMPTY_TEXT,
  ];

  if (summary.lowConfidenceResiduals && summary.lowConfidenceResiduals.length > NUM_ZERO) {
    lines.push('## Low-Confidence Derived Residuals', EMPTY_TEXT);
    for (const residual of summary.lowConfidenceResiduals) {
      lines.push(
        `- Node \`${residual.nodeId}\`: ` +
        `derived from \`${residual.source}\` with reason \`${residual.reasonCode}\` (confidence: \`${residual.confidence}\`); ` +
        `owner \`${residual.owner}\`, boundary \`${residual.boundary}\``,
      );
    }
    lines.push(EMPTY_TEXT);
  }

  lines.push('## Groups', EMPTY_TEXT);
  if (summary.ownerBoundaryGroups.length === NUM_ZERO) {
    lines.push(MARKDOWN_NO_WITNESSES_LINE);
  }
  for (const group of summary.ownerBoundaryGroups) {
    lines.push(
      `- \`${group.owner} / ${group.boundary}\`: ` +
      `${group.witnessCount} witness(es); partitions ` +
      `${group.partitionIds.join(MARKDOWN_LIST_SEPARATOR) || UNKNOWN_VALUE}; semantic states ` +
      `${group.semanticStateIds.join(MARKDOWN_LIST_SEPARATOR) || UNKNOWN_VALUE}`,
    );
  }
  lines.push(EMPTY_TEXT, MARKDOWN_SUCCESSOR_COMMANDS_HEADING, EMPTY_TEXT);
  for (const successor of summary.suggestedSuccessors) {
    lines.push(`- \`${successor.command}\``);
  }
  return lines.join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  if (args.includes(FLAG_HELP) || args.length === NUM_ZERO) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const artifactPath = args.find((arg) => !arg.startsWith('--'));
  const summary = buildPriorityRecoveryResiduals(
    artifactPath,
    await readJsonFile(artifactPath),
  );
  return args.includes(FLAG_MARKDOWN) ?
    `${renderMarkdown(summary)}${NEWLINE}` :
    `${JSON.stringify(summary, null, JSON_INDENT_SPACES)}${NEWLINE}`;
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
  buildPriorityRecoveryResiduals,
  renderMarkdown,
  runCli,
};
