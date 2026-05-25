#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildRepresentativeEvidenceSummary} from './summarize-representative-evidence.js';
import {buildSummary, readLedgerEntries} from './model-ledger.js';
import {parsePackageMetadata} from './work-tracker.js';
import {
  CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD,
  CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
  CLASSIFICATION_EFFICIENCY_FIELD,
  CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
  BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD,
  BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD,
  BOUNDED_EXPERIMENT_FIELD,
  BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD,
  BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD,
  BOUNDED_EXPERIMENT_KILL_RULE_FIELD,
  BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD,
  BOUNDED_EXPERIMENT_TIMEBOX_FIELD,
  CORE_LOGIC_BRIEF_FIELDS,
  INHERITS_CONTEXT_FIELD,
  LANE_CAUSAL_ESCALATION,
  LANE_BOUNDED_EXPERIMENT,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_EXPERIMENT,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_SINGLE_FILE_RUNTIME,
  LANE_TEST_ONLY_PROOF,
  MODEL_FIT_SPLIT_ALLOWED_DECISION_DEPTH_FIELD,
  MODEL_FIT_SPLIT_CHILD_CANDIDATES_FIELD,
  MODEL_FIT_SPLIT_FIELD,
  MODEL_FIT_SPLIT_SAFE_TO_EXECUTE_WHEN_FIELD,
  MODEL_FIT_SPLIT_SPLIT_TRIGGERS_FIELD,
  MODEL_FIT_SPLIT_TARGET_MODEL_FIELD,
  OBSERVABLE_PREDICTION_ACCURACY_FIELD,
  OBSERVABLE_PREDICTION_EVIDENCE_FIELD,
  OBSERVABLE_PREDICTION_FIELD,
  OBSERVABLE_PREDICTION_METRIC_FIELD,
  OBSERVABLE_PREDICTION_OBSERVED_FIELD,
  OBSERVABLE_PREDICTION_PREDICTED_FIELD,
  RERUN_DECISION_CAUSAL_OUTCOME_FIELD,
  RERUN_DECISION_EXPECTED_DELTA_FIELD,
  RERUN_DECISION_FIELD,
  RERUN_DECISION_NEXT_LANE_FIELD,
  RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD,
  RERUN_DECISION_ROUTE_BOUNDARY_FIELD,
  RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD,
  RERUN_DECISION_ROUTE_OWNER_FIELD,
  RERUN_DECISION_SOURCE_ARTIFACT_FIELD,
  RERUN_DECISION_STOP_MODE_FIELD,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_WRITE_SCOPE,
  VALID_PACKAGE_STATUSES,
  VALID_OUTPUT_PROFILES,
  VALIDATION_TIER_FIELD,
  VALIDATION_TIERS,
  WORKFLOW_LANES,
  WORK_PACKAGE_METADATA_SCHEMA,
  THEORY_LEDGER_REFS_FIELD,
  coreLogicBriefRequiredForLane,
  defaultModelFitForLane,
  renderSchemaReference,
} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const NUM_SIXTY = 60;
const DATE_SLICE_END = 10;
const JSON_INDENT_SPACES = 2;
const DEFAULT_STATUS = 'todo';
const DEFAULT_SCENARIO = 'none';
const DEFAULT_ARTIFACT = 'none';
const DEFAULT_PLAYBACK = 'none';
const DEFAULT_LEDGER_PATH = path.join('work', 'model-ledger.jsonl');
const WORK_PACKAGES_DIRECTORY = path.join('work', 'packages');
const FLAG_WRITE = 'write';
const FLAG_TITLE = 'title';
const FLAG_SLUG = 'slug';
const FLAG_LANE = 'lane';
const FLAG_STATUS = 'status';
const FLAG_OPENED = 'opened';
const FLAG_SCENARIO = 'scenario';
const FLAG_ARTIFACT = 'artifact';
const FLAG_PLAYBACK = 'playback';
const FLAG_OWNER = 'owner';
const FLAG_BOUNDARY = 'boundary';
const FLAG_DOMINANT_REASON = 'dominant-reason';
const FLAG_CURRENT_STATE = 'current-state';
const FLAG_NEXT_ACTION = 'next-action';
const FLAG_PROOF = 'proof';
const FLAG_TOUCHED_FILE = 'touched-file';
const FLAG_OWNED_FILE = 'owned-file';
const FLAG_WRITE_SCOPE = 'write-scope';
const FLAG_HANDOFF_FILE = 'handoff-file';
const FLAG_GENERATED_FILE = 'generated-file';
const FLAG_CANDIDATE_RUNTIME_FILE = 'candidate-runtime-file';
const FLAG_COMMIT_SCOPE = 'commit-scope';
const FLAG_FORBIDDEN_FILE = 'forbidden-file';
const FLAG_PREDECESSOR = 'predecessor';
const FLAG_PACKAGE_CLASS = 'package-class';
const FLAG_INTENDED_MINIMUM_MODEL = 'intended-minimum-model';
const FLAG_SCOPE_SHAPE = 'scope-shape';
const FLAG_OUTPUT_PROFILE = 'output-profile';
const FLAG_LEDGER = 'ledger';
const FLAG_FROM_ARTIFACT = 'from-artifact';
const FLAG_CLASSIFICATION_ONLY = 'classification-only';
const FLAG_ROUTE_CAUSAL_OUTCOME = 'route-causal-outcome';
const FLAG_ROUTE_STOP_MODE = 'route-stop-mode';
const FLAG_EXPECTED_DELTA = 'expected-delta';
const FLAG_SEPARATE_CLASSIFICATION_REASON = 'separate-classification-reason';
const FLAG_SUCCESSOR_ACTION = 'successor-action';
const FLAG_HYPOTHESIS = 'hypothesis';
const FLAG_HYPOTHESIS_DISCRIMINATOR = 'hypothesis-discriminator';
const FLAG_EXPECTED_METRIC = 'expected-metric';
const FLAG_OBSERVED_TRANSITION = 'observed-transition';
const FLAG_INHERITS = 'inherits';
const FLAG_TIMEBOX = 'timebox';
const FLAG_MERGE_REQUIREMENT = 'merge-requirement';
const FLAG_KILL_RULE = 'kill-rule';
const FLAG_VALIDATION_TIER = 'validation-tier';
const FLAG_SPLIT_CANDIDATE = 'split-candidate';
const FLAG_SCHEMA = 'schema';
const FLAG_HELP = 'help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_PREFIX = '--';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TEMPLATE_PLACEHOLDER_PATTERN = /<[^>]+>/u;
const DEFAULT_ACCELERATION_PROOF = 'npm run work:advance -- --check';
const CAUSAL_DECISION_CONTRACT_TABLE_HEADER =
  '| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |';
const CAUSAL_DECISION_CONTRACT_TABLE_SEPARATOR =
  '| --- | --- | --- | --- | --- | --- |';
const DEFAULT_RERUN_EXPECTED_DELTA =
  'Classify whether fresh representative evidence is green, reduced, ' +
  'migrated, same-frontier, architecture-gap, contradictory, or needs an ' +
  'autonomous architecture experiment before runtime promotion.';
const CLASSIFICATION_DEFAULT_MODE_INLINE_GATE = 'inline-gate-default';
const CLASSIFICATION_DEFAULT_MODE_SEPARATE_PACKAGE =
  'separate-package-approved';
const CLASSIFICATION_DEFAULT_ARTIFACT_BUDGET = 'one-artifact';
const CLASSIFICATION_DEFAULT_PROOF_BUDGET =
  'two-or-three-canonical-commands';
const CLASSIFICATION_REASON_SUCCESSOR_SELECTION = 'successor-selection';
const SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY =
  'open-runtime-owner-boundary';
const SUCCESSOR_ACTION_OPEN_ARCHITECTURE_EXPERIMENT =
  'open-architecture-experiment';
const SUCCESSOR_ACTION_RERUN_REPRESENTATIVE_EVIDENCE =
  'rerun-representative-evidence';
const DEFAULT_EXPERIMENT_TIMEBOX = '24h';
const DEFAULT_EXPERIMENT_MERGE_REQUIREMENT =
  'focused test plus canonical route or evidence command';
const DEFAULT_EXPERIMENT_KILL_RULE =
  'same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence';
const DEFAULT_EXPERIMENT_VALIDATION_TIER = 'single-owner';
const OBSERVABLE_PREDICTION_ACCURACY_PENDING = 'pending-before-observation';
const CAUSAL_OUTCOME_CONTINUE_LOCAL_FIX = 'continue_local_fix';
const STOP_MODE_CLASSIFIED_LOCAL_BLOCKER = 'classified_local_blocker';
const [
  CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD,
  CORE_LOGIC_BRIEF_INPUTS_FIELD,
  CORE_LOGIC_BRIEF_MODEL_FIELD,
  CORE_LOGIC_BRIEF_NON_GOALS_FIELD,
  CORE_LOGIC_BRIEF_PROOF_FIELD,
  CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD,
] = CORE_LOGIC_BRIEF_FIELDS;
const REQUIRED_FLAGS = Object.freeze([
  FLAG_TITLE,
  FLAG_SLUG,
  FLAG_OWNER,
  FLAG_BOUNDARY,
  FLAG_DOMINANT_REASON,
  FLAG_NEXT_ACTION,
]);
const REPEATED_FLAGS = Object.freeze([
  FLAG_PROOF,
  FLAG_TOUCHED_FILE,
  FLAG_OWNED_FILE,
  FLAG_WRITE_SCOPE,
  FLAG_HANDOFF_FILE,
  FLAG_GENERATED_FILE,
  FLAG_CANDIDATE_RUNTIME_FILE,
  FLAG_COMMIT_SCOPE,
  FLAG_FORBIDDEN_FILE,
  FLAG_SPLIT_CANDIDATE,
]);
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-package-new.js --title <title> --slug <slug> --owner <owner> --boundary <boundary> --dominant-reason <reason> --next-action <action> [--lane <lane>] [--write]',
  '',
  'Repeated options:',
  '  --proof <command>',
  '  --write-scope <path>',
  '  --handoff-file <path>',
  '  --generated-file <path>',
  '  --candidate-runtime-file <path>',
  '  --commit-scope <path>',
  '  --touched-file <path>  Legacy alias for --write-scope',
  '  --owned-file <path>    Legacy alias for --write-scope and Model Fit',
  '  --forbidden-file <path>',
  '  --output-profile <small|medium|high|extra-high>',
  '  --from-artifact <artifact.json>  Infer owner, boundary, evidence, proof, and defaults from representative evidence.',
  '  --classification-only  Scaffold a no-implementation fast-path package with runtime files held as candidates.',
  '  --route-causal-outcome <outcome>  Record the post-rerun route outcome that created this package.',
  '  --route-stop-mode <mode>  Record the post-rerun stop mode that created this package.',
  '  --expected-delta <text>  Record the expected representative delta before implementation.',
  '  --separate-classification-reason <reason>  Explain why classification is a package instead of an inline gate.',
  '  --successor-action <action>  Record whether classification updates the current package, opens runtime work, reruns evidence, or escalates.',
  '  --hypothesis <text>  Bounded experiment hypothesis.',
  '  --hypothesis-discriminator <text>  Different observable predicted under competing hypotheses.',
  '  --expected-metric <text>  Metric or frontier movement expected from the experiment.',
  '  --observed-transition <text>  Closure observation for the pre-registered prediction.',
  '  --inherits <package>  Package or sprint context inherited by a bounded experiment.',
  '  --timebox <duration>  Bounded experiment timebox, default 24h.',
  '  --merge-requirement <text>  Proof required before merging an experiment.',
  '  --kill-rule <text>  Condition that discards or escalates an experiment.',
  '  --validation-tier <file-local|single-owner|cross-owner|release-gate>',
  '  --split-candidate <text>  Candidate child package for lower-model execution.',
  '',
  'Use --schema to print the shared work-package schema reference.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function todayIsoDate() {
  return new Date().toISOString().slice(NUM_ZERO, DATE_SLICE_END);
}

function parseArgs(args = []) {
  const flags = {};
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const rawArg = args[index];
    if (!rawArg.startsWith(FLAG_PREFIX)) {
      throw new Error(`Unexpected argument "${rawArg}".`);
    }
    const flagName = rawArg.slice(FLAG_PREFIX.length);
    if (
      [
        FLAG_WRITE,
        FLAG_SCHEMA,
        FLAG_HELP,
        FLAG_CLASSIFICATION_ONLY,
      ].includes(flagName)
    ) {
      flags[flagName] = true;
      continue;
    }
    const value = args[index + NUM_ONE];
    if (value === undefined || value.startsWith(FLAG_PREFIX)) {
      throw new Error(`Missing value for ${rawArg}.`);
    }
    if (REPEATED_FLAGS.includes(flagName)) {
      flags[flagName] = [...(flags[flagName] || []), value];
    } else {
      flags[flagName] = value;
    }
    index += NUM_ONE;
  }
  return flags;
}

function readJsonFile(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8)
    .then((content) => JSON.parse(content));
}

function slugPart(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, EMPTY_TEXT);
}

function declaredWriteScopeFromFlags(flags = {}) {
  return [
    ...(flags[FLAG_WRITE_SCOPE] || []),
    ...(flags[FLAG_OWNED_FILE] || []),
    ...(flags[FLAG_TOUCHED_FILE] || []),
  ].map(normalizeText).filter(Boolean);
}

function isSourcePath(filePath) {
  return normalizeText(filePath).startsWith('src/');
}

function isTestOnlyProofPath(filePath) {
  const normalizedPath = normalizeText(filePath);
  return normalizedPath.startsWith('test/') ||
    normalizedPath.startsWith('work/packages/');
}

function buildArtifactSlug(summary) {
  const parts = [
    summary.scenario,
    summary.topology?.dominantWitness?.owner,
    summary.topology?.dominantWitness?.boundary,
  ].map(slugPart).filter(Boolean);
  const slug = parts.join('-').slice(NUM_ZERO, NUM_SIXTY)
    .replace(/-+$/u, EMPTY_TEXT);
  return slug || 'artifact-triage';
}

function artifactTitle(summary) {
  const witness = summary.topology?.dominantWitness || {};
  return [
    'Artifact Triage',
    witness.owner || 'unknown-owner',
    witness.boundary || 'unknown-boundary',
  ].join(' - ');
}

function mergeScalarDefault(flags, fieldName, value) {
  if (normalizeText(flags[fieldName]).length > NUM_ZERO) {
    return flags;
  }
  return {
    ...flags,
    [fieldName]: value,
  };
}

function mergeRepeatedDefaults(flags, fieldName, values = []) {
  const existing = Array.isArray(flags[fieldName]) ? flags[fieldName] : [];
  return {
    ...flags,
    [fieldName]: [...new Set([
      ...existing,
      ...values.map(normalizeText).filter(Boolean),
    ])],
  };
}

async function resolveArtifactDefaults(flags = {}) {
  const artifactPath = normalizeText(flags[FLAG_FROM_ARTIFACT]);
  if (artifactPath.length === NUM_ZERO) {
    return flags;
  }
  const summary = buildRepresentativeEvidenceSummary(
    artifactPath,
    await readJsonFile(artifactPath),
  );
  const witness = summary.topology?.dominantWitness || {};
  const edgeId = summary.topology?.firstFrontierEdgeId || 'first-frontier';
  const owner = witness.owner || 'unknown_owner';
  const boundary = witness.boundary || 'unknown_boundary';
  const dominantReason = witness.dominantReason || summary.causal?.dominantFailureClass ||
    'representative_evidence';
  let nextFlags = {...flags};
  nextFlags = mergeScalarDefault(nextFlags, FLAG_TITLE, artifactTitle(summary));
  nextFlags = mergeScalarDefault(nextFlags, FLAG_SLUG, buildArtifactSlug(summary));
  nextFlags = mergeScalarDefault(nextFlags, FLAG_LANE, LANE_CAUSAL_ESCALATION);
  nextFlags = mergeScalarDefault(nextFlags, FLAG_SCENARIO, summary.scenario);
  nextFlags = mergeScalarDefault(nextFlags, FLAG_ARTIFACT, artifactPath);
  nextFlags = mergeScalarDefault(nextFlags, FLAG_OWNER, owner);
  nextFlags = mergeScalarDefault(nextFlags, FLAG_BOUNDARY, boundary);
  nextFlags = mergeScalarDefault(
    nextFlags,
    FLAG_DOMINANT_REASON,
    dominantReason,
  );
  nextFlags = mergeScalarDefault(
    nextFlags,
    FLAG_CURRENT_STATE,
    `Scaffolded from representative evidence for ${edgeId}.`,
  );
  nextFlags = mergeScalarDefault(
    nextFlags,
    FLAG_NEXT_ACTION,
    `Triage ${edgeId} with combined scenario evidence before runtime edits.`,
  );
  nextFlags = mergeScalarDefault(
    nextFlags,
    FLAG_ROUTE_CAUSAL_OUTCOME,
    summary.causal?.outcome || 'unknown',
  );
  nextFlags = mergeScalarDefault(
    nextFlags,
    FLAG_ROUTE_STOP_MODE,
    summary.causal?.stopCondition || 'unknown',
  );
  nextFlags = mergeScalarDefault(
    nextFlags,
    FLAG_EXPECTED_DELTA,
    DEFAULT_RERUN_EXPECTED_DELTA,
  );
  nextFlags = mergeRepeatedDefaults(nextFlags, FLAG_HANDOFF_FILE, [artifactPath]);
  nextFlags = mergeRepeatedDefaults(nextFlags, FLAG_PROOF, [
    `npm run work:evidence-summary -- ${artifactPath}`,
    `npm run work:scenario-triage -- ${artifactPath} --markdown`,
    `npm run analyze:priority-recovery-residuals -- ${artifactPath} --markdown`,
  ]);
  return nextFlags;
}

function validateFlags(flags = {}) {
  const missing = REQUIRED_FLAGS.filter((flagName) =>
    normalizeText(flags[flagName]).length === NUM_ZERO);
  if (missing.length > NUM_ZERO) {
    throw new Error(
      `Missing required flags: ${missing
        .map((flagName) => `${FLAG_PREFIX}${flagName}`)
        .join(', ')}.`,
    );
  }
  const lane = normalizeText(flags[FLAG_LANE]) || LANE_LIGHTWEIGHT_MAINTENANCE;
  if (!WORKFLOW_LANES.includes(lane)) {
    throw new Error(
      `--${FLAG_LANE} must be one of ${WORKFLOW_LANES.join(', ')}.`,
    );
  }
  const status = normalizeText(flags[FLAG_STATUS]) || DEFAULT_STATUS;
  if (!VALID_PACKAGE_STATUSES.includes(status)) {
    throw new Error(
      `--${FLAG_STATUS} must be one of ${VALID_PACKAGE_STATUSES.join(', ')}.`,
    );
  }
  const outputProfile = normalizeText(flags[FLAG_OUTPUT_PROFILE]);
  if (
    outputProfile.length > NUM_ZERO &&
    !VALID_OUTPUT_PROFILES.includes(outputProfile)
  ) {
    throw new Error(
      `--${FLAG_OUTPUT_PROFILE} must be one of ` +
      `${VALID_OUTPUT_PROFILES.join(', ')}.`,
    );
  }
  const validationTier = normalizeText(flags[FLAG_VALIDATION_TIER]);
  if (
    validationTier.length > NUM_ZERO &&
    !VALIDATION_TIERS.includes(validationTier)
  ) {
    throw new Error(
      `--${FLAG_VALIDATION_TIER} must be one of ` +
      `${VALIDATION_TIERS.join(', ')}.`,
    );
  }
  if (lane === LANE_BOUNDED_EXPERIMENT || lane === LANE_EXPERIMENT) {
    const missingExperimentFlags = [
      FLAG_HYPOTHESIS,
      FLAG_EXPECTED_METRIC,
      lane === LANE_EXPERIMENT ? FLAG_HYPOTHESIS_DISCRIMINATOR : null,
    ].filter((flagName) => normalizeText(flags[flagName]).length === NUM_ZERO);
    if (missingExperimentFlags.length > NUM_ZERO) {
      throw new Error(
        `--lane ${lane} requires ` +
        missingExperimentFlags
          .map((flagName) => `${FLAG_PREFIX}${flagName}`)
          .join(', ') +
        '.',
      );
    }
  }
  const declaredWriteScope = declaredWriteScopeFromFlags(flags);
  if (
    lane === LANE_MECHANICAL_MAINTENANCE &&
    declaredWriteScope.some(isSourcePath)
  ) {
    throw new Error(
      `--lane ${LANE_MECHANICAL_MAINTENANCE} must not include src/ paths; ` +
      'split runtime behavior into a separate package.',
    );
  }
  if (
    lane === LANE_TEST_ONLY_PROOF &&
    declaredWriteScope.some((filePath) => !isTestOnlyProofPath(filePath))
  ) {
    throw new Error(
      `--lane ${LANE_TEST_ONLY_PROOF} write scope must stay in test/ or ` +
      'work/packages/ paths.',
    );
  }
  if (lane === LANE_SINGLE_FILE_RUNTIME) {
    const runtimeFiles = declaredWriteScope.filter(isSourcePath);
    if (runtimeFiles.length !== NUM_ONE) {
      throw new Error(
        `--lane ${LANE_SINGLE_FILE_RUNTIME} requires exactly one src/ ` +
        'runtime file in write scope.',
      );
    }
  }
  const slug = normalizeText(flags[FLAG_SLUG]);
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('--slug must use lowercase dash-separated words.');
  }
}

function markdownList(values = [], fallback) {
  const normalized = values.map(normalizeText).filter(Boolean);
  if (normalized.length === NUM_ZERO) {
    return `1. ${fallback}`;
  }
  return normalized.map((value, index) => `${index + NUM_ONE}. ${value}`).join(NEWLINE);
}

function markdownInlineCodeList(values = [], fallback) {
  const normalized = values.map(normalizeText).filter(Boolean);
  if (normalized.length === NUM_ZERO) {
    return fallback;
  }
  return normalized.map((value) => `\`${value}\``).join(', ');
}

function markdownSentenceList(values = [], fallback) {
  const normalized = values.map(normalizeText).filter(Boolean);
  return normalized.length > NUM_ZERO ? normalized.join('; ') : fallback;
}

function firstFocusedProofCommand(proof = []) {
  return proof.map(normalizeText).find(Boolean) || DEFAULT_ACCELERATION_PROOF;
}

function markdownTableCell(value, fallback) {
  return normalizeText(value || fallback).replace(/\|/gu, '/');
}

function buildCoreLogicBriefLines(
  lane,
  flags,
  proof,
  forbiddenFiles,
  metadata,
) {
  if (!coreLogicBriefRequiredForLane(lane)) {
    return [
      '## Core Logic Brief',
      EMPTY_TEXT,
      '- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.',
    ];
  }
  const owner = normalizeText(flags[FLAG_OWNER]);
  const boundary = normalizeText(flags[FLAG_BOUNDARY]);
  const dominantReason = normalizeText(flags[FLAG_DOMINANT_REASON]);
  const artifact = normalizeText(flags[FLAG_ARTIFACT]) || DEFAULT_ARTIFACT;
  const nextAction = normalizeText(flags[FLAG_NEXT_ACTION]);
  const emittedOutcome =
    normalizeText(metadata?.[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_CAUSAL_OUTCOME_FIELD
    ]) ||
    nextAction;
  const inputSignals = [
    artifact !== DEFAULT_ARTIFACT ? artifact : EMPTY_TEXT,
    markdownSentenceList(proof, nextAction),
  ].filter(Boolean).join('; ');
  return [
    '## Core Logic Brief',
    EMPTY_TEXT,
    `- ${CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD}: ` +
      `${owner} / ${boundary} emits the package outcome for ` +
      `${dominantReason}.`,
    `- ${CORE_LOGIC_BRIEF_INPUTS_FIELD}: ${inputSignals}.`,
    `- ${CORE_LOGIC_BRIEF_MODEL_FIELD}: The ${owner} / ${boundary} ` +
      `decision table in the Causal Decision Contract maps ${dominantReason} ` +
      `and route evidence to one emitted outcome: ${emittedOutcome}.`,
    `- ${CORE_LOGIC_BRIEF_NON_GOALS_FIELD}: Do not reinterpret downstream ` +
      'evidence, widen forbidden boundaries, or patch symptoms outside this ' +
      `package. Forbidden scope: ${markdownSentenceList(
        forbiddenFiles,
        'none beyond lane and package scope',
      )}.`,
    `- ${CORE_LOGIC_BRIEF_PROOF_FIELD}: Implementation and tests must prove ` +
      `the ${owner} / ${boundary} invariant before representative or ` +
      'closure proof is accepted.',
    `- ${CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD}: Stop or split if the canonical ` +
      'outcome changes owner, boundary, required action, or needs files ' +
      'outside the declared scope.',
  ];
}

function buildCausalDecisionContractLines(
  lane,
  flags,
  proof,
  forbiddenFiles,
  metadata,
) {
  if (!coreLogicBriefRequiredForLane(lane)) {
    return [];
  }
  const owner = normalizeText(flags[FLAG_OWNER]);
  const boundary = normalizeText(flags[FLAG_BOUNDARY]);
  const dominantReason = normalizeText(flags[FLAG_DOMINANT_REASON]);
  const nextAction = normalizeText(flags[FLAG_NEXT_ACTION]);
  const artifact = normalizeText(flags[FLAG_ARTIFACT]) || DEFAULT_ARTIFACT;
  const firstProof = firstFocusedProofCommand(proof);
  const expectedDelta =
    normalizeText(metadata?.[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_EXPECTED_DELTA_FIELD
    ]) ||
    DEFAULT_RERUN_EXPECTED_DELTA;
  const forbiddenScope = markdownSentenceList(
    forbiddenFiles,
    'lane and package scope only',
  );
  return [
    '## Causal Decision Contract',
    EMPTY_TEXT,
    CAUSAL_DECISION_CONTRACT_TABLE_HEADER,
    CAUSAL_DECISION_CONTRACT_TABLE_SEPARATOR,
    '| ' +
      [
        'route owner/boundary',
        `${owner} / ${boundary} / ${dominantReason}`,
        `${owner} owns this decision before downstream consumers reinterpret it`,
        nextAction,
        expectedDelta,
        firstProof,
      ].map((value) => markdownTableCell(value, 'not-recorded')).join(' | ') +
      ' |',
    '| ' +
      [
        'scope boundary',
        forbiddenScope,
        'proof that needs forbidden scope means this package is the wrong slice',
        'stop, split, or migrate owner boundary',
        'no widened runtime scope inside this package',
        DEFAULT_ACCELERATION_PROOF,
      ].map((value) => markdownTableCell(value, 'not-recorded')).join(' | ') +
      ' |',
    EMPTY_TEXT,
    `- Anti-symptom rationale: This package changes or classifies ${owner} / ` +
      `${boundary} directly; it does not patch downstream symptoms or widen ` +
      'forbidden scope.',
    `- Falsifying focused probe: \`${firstProof}\``,
    `- Competing explanations: At minimum compare ${dominantReason} against ` +
      'downstream symptom lag, stale instrumentation, and wrong-owner routing ' +
      'before implementation.',
    '- Systemic interaction scan: Check producer, consumer, admission/gating, ' +
      'retry/lifecycle, and evidence-generation effects before assigning the ' +
      'next owner slice.',
    '- Ping-pong stop rule: Do not bounce between adjacent owners on the same ' +
      'unchanged artifact; require fresh representative evidence, a concrete ' +
      'metric reduction, owner/boundary migration proof, or an autonomous ' +
      'architecture experiment before another local patch.',
    '- Oscillation guard: If fresh representative evidence returns the same ' +
      'frontier or another symptom-shaped result, the next package must show ' +
      'concrete reduction, migration, green, or select/open an autonomous ' +
      'architecture experiment before another local patch.',
  ];
}

function buildDecisionExperimentGateLines(lane, flags, proof, metadata) {
  if (!coreLogicBriefRequiredForLane(lane)) {
    return [];
  }
  const owner = normalizeText(flags[FLAG_OWNER]);
  const boundary = normalizeText(flags[FLAG_BOUNDARY]);
  const dominantReason = normalizeText(flags[FLAG_DOMINANT_REASON]);
  const firstProof = firstFocusedProofCommand(proof);
  const artifact = normalizeText(flags[FLAG_ARTIFACT]) || DEFAULT_ARTIFACT;
  const expectedDelta =
    normalizeText(metadata?.[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_EXPECTED_DELTA_FIELD
    ]) ||
    DEFAULT_RERUN_EXPECTED_DELTA;
  const representativeRerun = [
    'npm run work:package:route-after-rerun -- --artifact',
    artifact,
    '--owner',
    owner,
    '--boundary',
    boundary,
    '--dominant-reason',
    dominantReason,
  ].join(' ');
  return [
    '## Decision Experiment Gate',
    EMPTY_TEXT,
    `- Decision question: Does ${owner} / ${boundary} still own ` +
      `${dominantReason}, and what exact producer, consumer, or contract ` +
      'fact must move before implementation is justified?',
    '- Architecture review: Before runtime edits, confirm whether this is ' +
      'still a local owner-boundary route, an owner-boundary migration, an ' +
      'autonomous architecture experiment, or a human-only route caused by ' +
      'contradictory or blocked evidence.',
    `- Competing hypotheses: ${dominantReason} is real owner debt; the ` +
      'visible symptom is downstream lag; instrumentation or stale evidence ' +
      'is misleading; a different owner boundary owns the next move.',
    `- Pre-edit focused probe: \`${firstProof}\``,
    `- Success metrics: ${expectedDelta}; at least one concrete metric, ` +
      'count, frontier, migration, or representative-green condition must move.',
    `- Representative rerun: \`${representativeRerun}\``,
    '- Kill rule: If fresh representative evidence returns the same frontier ' +
      'and dominant reason with no concrete metric reduction, stop for ' +
      'an autonomous architecture experiment instead of opening another local ' +
      'patch; use human escalation only for contradictory or blocked evidence.',
  ];
}

function buildLaneSufficiencyLine(lane) {
  if (lane === LANE_EXPERIMENT) {
    return '- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.';
  }
  if (lane === LANE_BOUNDED_EXPERIMENT) {
    return '- Why this lane is sufficient: same-owner or tightly scoped hypothesis-driven change with inherited context, proof-gated merge, and explicit kill rule.';
  }
  if (!coreLogicBriefRequiredForLane(lane)) {
    return '- Why this lane is sufficient: bounded workflow/tooling scope unless changed.';
  }
  return '- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.';
}

function shouldBuildBoundedExperimentMetadata(lane, flags = {}) {
  return lane === LANE_BOUNDED_EXPERIMENT ||
    lane === LANE_EXPERIMENT ||
    [
      FLAG_HYPOTHESIS,
      FLAG_HYPOTHESIS_DISCRIMINATOR,
      FLAG_EXPECTED_METRIC,
      FLAG_INHERITS,
      FLAG_TIMEBOX,
      FLAG_MERGE_REQUIREMENT,
      FLAG_KILL_RULE,
      FLAG_VALIDATION_TIER,
    ].some((flagName) => normalizeText(flags[flagName]).length > NUM_ZERO);
}

function buildBoundedExperimentMetadata(lane, flags = {}) {
  if (!shouldBuildBoundedExperimentMetadata(lane, flags)) {
    return null;
  }
  return {
    [BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD]:
      normalizeText(flags[FLAG_HYPOTHESIS]) ||
      'State the experiment hypothesis before implementation.',
    [BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD]:
      normalizeText(flags[FLAG_HYPOTHESIS_DISCRIMINATOR]) ||
      'Predict the different observable under H1 vs H2 vs H3 before implementation.',
    [BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD]:
      normalizeText(flags[FLAG_EXPECTED_METRIC]) ||
      'Name the count, frontier, route, or representative result expected to move.',
    [BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD]:
      normalizeText(flags[FLAG_INHERITS]) || 'none',
    [BOUNDED_EXPERIMENT_TIMEBOX_FIELD]:
      normalizeText(flags[FLAG_TIMEBOX]) || DEFAULT_EXPERIMENT_TIMEBOX,
    [BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD]:
      normalizeText(flags[FLAG_MERGE_REQUIREMENT]) ||
      DEFAULT_EXPERIMENT_MERGE_REQUIREMENT,
    [BOUNDED_EXPERIMENT_KILL_RULE_FIELD]:
      normalizeText(flags[FLAG_KILL_RULE]) || DEFAULT_EXPERIMENT_KILL_RULE,
  };
}

function buildObservablePredictionMetadata(lane, flags = {}, metadata = {}) {
  if (lane !== LANE_EXPERIMENT && lane !== LANE_BOUNDED_EXPERIMENT) {
    return null;
  }
  const expectedMetric = normalizeText(flags[FLAG_EXPECTED_METRIC]) ||
    normalizeText(metadata?.[BOUNDED_EXPERIMENT_FIELD]?.[
      BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD
    ]);
  return {
    [OBSERVABLE_PREDICTION_METRIC_FIELD]:
      expectedMetric || 'Name the numeric/state prediction metric.',
    [OBSERVABLE_PREDICTION_PREDICTED_FIELD]:
      expectedMetric || 'State the predicted transition before the probe.',
    [OBSERVABLE_PREDICTION_OBSERVED_FIELD]:
      normalizeText(flags[FLAG_OBSERVED_TRANSITION]) ||
      OBSERVABLE_PREDICTION_ACCURACY_PENDING,
    [OBSERVABLE_PREDICTION_ACCURACY_FIELD]:
      OBSERVABLE_PREDICTION_ACCURACY_PENDING,
    [OBSERVABLE_PREDICTION_EVIDENCE_FIELD]:
      'pending-before-observation',
  };
}

function buildInheritsContextMetadata(lane, flags = {}) {
  const inherits = normalizeText(flags[FLAG_INHERITS]);
  if (
    (lane !== LANE_BOUNDED_EXPERIMENT && lane !== LANE_EXPERIMENT) ||
    inherits.length === NUM_ZERO
  ) {
    return null;
  }
  return {
    owner: true,
    boundary: true,
    forbiddenScope: true,
    proofCommands: true,
    stopRule: true,
  };
}

function buildBoundedExperimentLines(metadata = {}) {
  const experiment = metadata[BOUNDED_EXPERIMENT_FIELD];
  if (!experiment) {
    return [];
  }
  return [
    '## Bounded Experiment',
    EMPTY_TEXT,
    `- Hypothesis: ${experiment[BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD]}`,
    `- Hypothesis discriminator: ${experiment[BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD]}`,
    `- Expected metric: ${experiment[BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD]}`,
    `- Inherits from: \`${experiment[BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD]}\``,
    `- Timebox: \`${experiment[BOUNDED_EXPERIMENT_TIMEBOX_FIELD]}\``,
    `- Validation tier: \`${metadata[VALIDATION_TIER_FIELD] || DEFAULT_EXPERIMENT_VALIDATION_TIER}\``,
    `- Merge requirement: ${experiment[BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD]}`,
    `- Kill rule: ${experiment[BOUNDED_EXPERIMENT_KILL_RULE_FIELD]}`,
    '- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.',
    '- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.',
  ];
}

function buildObservablePredictionLines(metadata = {}) {
  const prediction = metadata[OBSERVABLE_PREDICTION_FIELD];
  if (!prediction) {
    return [];
  }
  return [
    '## Observable Prediction',
    EMPTY_TEXT,
    `- Metric: ${prediction[OBSERVABLE_PREDICTION_METRIC_FIELD]}`,
    `- Predicted: ${prediction[OBSERVABLE_PREDICTION_PREDICTED_FIELD]}`,
    `- Observed: ${prediction[OBSERVABLE_PREDICTION_OBSERVED_FIELD]}`,
    `- Accuracy: ${prediction[OBSERVABLE_PREDICTION_ACCURACY_FIELD]}`,
    `- Evidence: ${prediction[OBSERVABLE_PREDICTION_EVIDENCE_FIELD]}`,
    '- Closure compares predicted vs observed before the package can close.',
  ];
}

function defaultAllowedDecisionDepth(lane) {
  switch (lane) {
    case LANE_MECHANICAL_MAINTENANCE:
      return 'mechanical edits only; no behavior or ownership decisions';
    case LANE_TEST_ONLY_PROOF:
      return 'test assertion or fixture proof only; runtime behavior stays frozen';
    case LANE_EXPERIMENT:
      return 'one probe that distinguishes hypotheses; success is information, not runtime metric movement';
    case LANE_BOUNDED_EXPERIMENT:
      return 'one inherited-owner hypothesis with explicit expected metric and kill rule';
    case LANE_SINGLE_FILE_RUNTIME:
      return 'one preselected runtime file after owner, boundary, and proof are fixed';
    case LANE_RUNTIME_OWNER_BOUNDARY:
      return 'single owner-boundary execution after higher-model route selection';
    case LANE_SCENARIO_RELEASE_GATE:
    case LANE_CAUSAL_ESCALATION:
      return 'planning and route selection; split executable children before implementation';
    default:
      return 'bounded local edit after owner, scope, proof, and forbidden files are named';
  }
}

function defaultSplitCandidatesForLane(lane) {
  if (lane === LANE_MECHANICAL_MAINTENANCE) {
    return [
      'Keep docs/templates/schema metadata edits in this Spark-safe package.',
      'Split any runtime or test behavior into a separate package before execution.',
    ];
  }
  if (lane === LANE_TEST_ONLY_PROOF) {
    return [
      'Add or tighten the focused test in this Spark-safe package.',
      'Open a separate bounded-experiment or single-file-runtime package for implementation.',
    ];
  }
  if (lane === LANE_EXPERIMENT) {
    return [
      'Keep runtime behavior frozen until the probe distinguishes competing hypotheses.',
      'Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.',
    ];
  }
  if (lane === LANE_SINGLE_FILE_RUNTIME) {
    return [
      'Execute only the declared runtime file and focused proof in this gpt-5.4 package.',
      'Split immediately if a second runtime file, shared contract, or owner migration is needed.',
    ];
  }
  if (lane === LANE_RUNTIME_OWNER_BOUNDARY) {
    return [
      'Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.',
      'Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.',
      'Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.',
      'Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.',
    ];
  }
  if (lane === LANE_SCENARIO_RELEASE_GATE || lane === LANE_CAUSAL_ESCALATION) {
    return [
      'Use this package for route selection, owner/boundary decisions, and stop rules.',
      'Create Spark-safe mechanical or test-only children once execution is unambiguous.',
      'Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.',
    ];
  }
  return [
    'Prefer mechanical-maintenance for docs/templates/schema-only edits.',
    'Prefer test-only-proof for tests that do not change runtime behavior.',
    'Prefer bounded-experiment for one same-owner hypothesis with inherited context.',
  ];
}

function buildModelFitSplitMetadata(lane, metadata, flags = {}) {
  const candidateFlags = Array.isArray(flags[FLAG_SPLIT_CANDIDATE]) ?
    flags[FLAG_SPLIT_CANDIDATE] :
    [];
  const childCandidates = candidateFlags.length ?
    candidateFlags.map(normalizeText).filter(Boolean) :
    defaultSplitCandidatesForLane(lane);
  return {
    [MODEL_FIT_SPLIT_TARGET_MODEL_FIELD]:
      metadata.modelFit.intendedMinimumModel,
    [MODEL_FIT_SPLIT_ALLOWED_DECISION_DEPTH_FIELD]:
      defaultAllowedDecisionDepth(lane),
    [MODEL_FIT_SPLIT_SAFE_TO_EXECUTE_WHEN_FIELD]: [
      'owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared',
      'the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence',
      'the first focused proof gives a clear pass, fail, or escalate signal',
    ],
    [MODEL_FIT_SPLIT_SPLIT_TRIGGERS_FIELD]: [
      'write scope expands beyond the declared lower-model lane',
      'proof requires forbidden scope, cross-owner reasoning, or architecture route selection',
      'the implementation needs to decide system behavior instead of executing a named local mechanism',
    ],
    [MODEL_FIT_SPLIT_CHILD_CANDIDATES_FIELD]: childCandidates,
  };
}

function buildModelFitSplitLines(metadata = {}) {
  const split = metadata[MODEL_FIT_SPLIT_FIELD];
  if (!split) {
    return [];
  }
  return [
    '## Model-Fit Split',
    EMPTY_TEXT,
    `- Target executor: \`${split[MODEL_FIT_SPLIT_TARGET_MODEL_FIELD]}\``,
    `- Allowed decision depth: ${split[MODEL_FIT_SPLIT_ALLOWED_DECISION_DEPTH_FIELD]}`,
    '- Safe to execute when:',
    markdownList(split[MODEL_FIT_SPLIT_SAFE_TO_EXECUTE_WHEN_FIELD], 'Scope remains concrete.'),
    '- Split or escalate when:',
    markdownList(split[MODEL_FIT_SPLIT_SPLIT_TRIGGERS_FIELD], 'Scope expands.'),
    '- Candidate lower-model child packages:',
    markdownList(split[MODEL_FIT_SPLIT_CHILD_CANDIDATES_FIELD], 'No child package candidate recorded.'),
  ];
}

function buildClassificationOnlyFastPathLines(isClassificationOnly) {
  if (!isClassificationOnly) {
    return [];
  }
  return [
    '## Classification-Only Fast Path',
    EMPTY_TEXT,
    '- Runtime, test, script, and report paths stay out of `writeScope` and `commitScope` until fresh evidence promotes implementation.',
    '- Keep possible implementation files in `candidateRuntimeFiles` only.',
    '- Subagent sequencing is optional until implementation or tracker-truth write scope is promoted.',
    '- Verifier-fixer proof is optional while the package remains classification-only and no implementation or tracker-truth write scope is present.',
    '- Use 2-3 canonical proof commands, then close and rerun evidence instead of adding more package ceremony.',
    EMPTY_TEXT,
  ];
}

function buildRerunRefreshCommands(metadata) {
  const artifact = normalizeText(metadata.artifact);
  return [
    [
      'npm run work:package:route-after-rerun -- --artifact',
      artifact,
      '--owner',
      metadata.owner,
      '--boundary',
      metadata.boundary,
      '--dominant-reason',
      metadata.dominantReason,
    ].join(' '),
    'update Sprint Strategy Brief and Current Edge Card from the route result',
    'npm run work:repair',
    'npm run work:validate -- --pre-impl',
  ];
}

function buildRerunDecisionMetadata(flags, metadata) {
  const sourceArtifact = normalizeText(metadata.artifact);
  const routeCausalOutcome = normalizeText(flags[FLAG_ROUTE_CAUSAL_OUTCOME]);
  const stopMode = normalizeText(flags[FLAG_ROUTE_STOP_MODE]);
  const expectedDelta = normalizeText(flags[FLAG_EXPECTED_DELTA]);
  if (
    sourceArtifact === DEFAULT_ARTIFACT &&
    routeCausalOutcome.length === NUM_ZERO &&
    stopMode.length === NUM_ZERO &&
    expectedDelta.length === NUM_ZERO
  ) {
    return null;
  }
  return {
    [RERUN_DECISION_SOURCE_ARTIFACT_FIELD]: sourceArtifact,
    [RERUN_DECISION_ROUTE_OWNER_FIELD]: metadata.owner,
    [RERUN_DECISION_ROUTE_BOUNDARY_FIELD]: metadata.boundary,
    [RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD]: metadata.dominantReason,
    [RERUN_DECISION_CAUSAL_OUTCOME_FIELD]:
      routeCausalOutcome || 'pending-before-rerun',
    [RERUN_DECISION_STOP_MODE_FIELD]: stopMode || 'pending-before-rerun',
    [RERUN_DECISION_NEXT_LANE_FIELD]: inferNextLane(flags, metadata),
    [RERUN_DECISION_EXPECTED_DELTA_FIELD]:
      expectedDelta || DEFAULT_RERUN_EXPECTED_DELTA,
    [RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD]:
      buildRerunRefreshCommands(metadata),
  };
}

function isStableRuntimeRoute(flags = {}) {
  return normalizeText(flags[FLAG_ROUTE_CAUSAL_OUTCOME]) ===
      CAUSAL_OUTCOME_CONTINUE_LOCAL_FIX &&
    normalizeText(flags[FLAG_ROUTE_STOP_MODE]) ===
      STOP_MODE_CLASSIFIED_LOCAL_BLOCKER;
}

function inferSuccessorAction(flags = {}) {
  const explicitAction = normalizeText(flags[FLAG_SUCCESSOR_ACTION]);
  if (explicitAction.length > NUM_ZERO) {
    return explicitAction;
  }
  const routeOutcome = normalizeText(flags[FLAG_ROUTE_CAUSAL_OUTCOME]);
  const routeStopMode = normalizeText(flags[FLAG_ROUTE_STOP_MODE]);
  if (/\b(?:same[-_ ]frontier|architecture[-_ ]gap)\b/iu.test(
    `${routeOutcome} ${routeStopMode}`,
  )) {
    return SUCCESSOR_ACTION_OPEN_ARCHITECTURE_EXPERIMENT;
  }
  return isStableRuntimeRoute(flags) ?
    SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY :
    SUCCESSOR_ACTION_RERUN_REPRESENTATIVE_EVIDENCE;
}

function inferNextLane(flags = {}, metadata = {}) {
  const successorAction = inferSuccessorAction(flags);
  if (successorAction === SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY) {
    return LANE_RUNTIME_OWNER_BOUNDARY;
  }
  if (successorAction === SUCCESSOR_ACTION_OPEN_ARCHITECTURE_EXPERIMENT) {
    return LANE_EXPERIMENT;
  }
  return normalizeText(metadata.lane) || LANE_LIGHTWEIGHT_MAINTENANCE;
}

function metadataNeedsClassificationEfficiency(
  flags,
  metadata,
  isClassificationOnly,
) {
  const lane = normalizeText(metadata.lane);
  return isClassificationOnly ||
    lane === LANE_DIAGNOSTIC_CLASSIFICATION ||
    normalizeText(flags[FLAG_ROUTE_CAUSAL_OUTCOME]).length > NUM_ZERO ||
    normalizeText(flags[FLAG_ROUTE_STOP_MODE]).length > NUM_ZERO;
}

function buildClassificationEfficiencyMetadata(
  flags,
  metadata,
  proof,
  isClassificationOnly,
) {
  if (
    !metadataNeedsClassificationEfficiency(
      flags,
      metadata,
      isClassificationOnly,
    )
  ) {
    return null;
  }
  const successorAction = inferSuccessorAction(flags);
  const separatePackageReason =
    normalizeText(flags[FLAG_SEPARATE_CLASSIFICATION_REASON]) ||
    CLASSIFICATION_REASON_SUCCESSOR_SELECTION;
  const defaultMode =
    normalizeText(metadata.lane) === LANE_DIAGNOSTIC_CLASSIFICATION ||
    isClassificationOnly ?
      CLASSIFICATION_DEFAULT_MODE_SEPARATE_PACKAGE :
      CLASSIFICATION_DEFAULT_MODE_INLINE_GATE;
  return {
    [CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD]: defaultMode,
    [CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD]:
      separatePackageReason,
    [CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD]:
      CLASSIFICATION_DEFAULT_ARTIFACT_BUDGET,
    [CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD]:
      CLASSIFICATION_DEFAULT_PROOF_BUDGET,
    [CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD]:
      proof.length > NUM_ZERO ?
        proof.slice(NUM_ZERO, NUM_THREE) :
        [DEFAULT_ACCELERATION_PROOF],
    [CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD]:
      'Record classification in the current package or sprint edge card; ' +
      'open a separate classifier only for material route, owner, boundary, ' +
      'stop-condition, tracker-truth, or successor-selection changes.',
    [CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD]: successorAction,
    [CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD]:
      'When canonical owner and boundary are stable, prefer a ' +
      'runtime-owner-boundary successor and keep runtime files in ' +
      'candidateRuntimeFiles until that package activates them. If the ' +
      'representative route is same-frontier with no reduction or an ' +
      'architecture gap, open an autonomous architecture experiment before ' +
      'more local runtime work.',
  };
}

function concreteModelFitProofCommands(values = []) {
  const concreteValues = values
    .map(normalizeText)
    .filter((value) =>
      value.length > NUM_ZERO &&
      !TEMPLATE_PLACEHOLDER_PATTERN.test(value));
  return concreteValues.length > NUM_ZERO ?
    concreteValues :
    [DEFAULT_ACCELERATION_PROOF];
}

function buildPackagePath(status, opened, slug) {
  const packageDate = opened.replaceAll('-', EMPTY_TEXT);
  return path.join(WORK_PACKAGES_DIRECTORY, `${status}-${packageDate}-${slug}.md`);
}

async function buildModelLedgerSummary(flags = {}) {
  const ledgerPath = normalizeText(flags[FLAG_LEDGER]) || DEFAULT_LEDGER_PATH;
  const entries = await readLedgerEntries(ledgerPath);
  return buildSummary(entries);
}

async function buildPackageContent(flags = {}) {
  flags = await resolveArtifactDefaults(flags);
  const lane = normalizeText(flags[FLAG_LANE]) || LANE_LIGHTWEIGHT_MAINTENANCE;
  const isClassificationOnly = flags[FLAG_CLASSIFICATION_ONLY] === true;
  const modelLedgerSummary = await buildModelLedgerSummary(flags);
  const modelFitDefaults = defaultModelFitForLane(lane, modelLedgerSummary);
  const opened = normalizeText(flags[FLAG_OPENED]) || todayIsoDate();
  const status = normalizeText(flags[FLAG_STATUS]) || DEFAULT_STATUS;
  const proof = flags[FLAG_PROOF] || [];
  const modelFitProof = concreteModelFitProofCommands(proof);
  const legacyTouchedFiles = flags[FLAG_TOUCHED_FILE] || [];
  const writeScope = [
    ...(flags[FLAG_WRITE_SCOPE] || []),
    ...(flags[FLAG_OWNED_FILE] || []),
    ...legacyTouchedFiles,
  ];
  const handoffFiles = flags[FLAG_HANDOFF_FILE] || [];
  const generatedFiles = flags[FLAG_GENERATED_FILE] || [];
  const candidateRuntimeFiles = flags[FLAG_CANDIDATE_RUNTIME_FILE] || [];
  const commitScope = flags[FLAG_COMMIT_SCOPE] || [
    ...writeScope,
    ...generatedFiles,
  ];
  const ownedFiles = writeScope;
  const forbiddenFiles = flags[FLAG_FORBIDDEN_FILE] || [];
  const metadata = {
    schema: WORK_PACKAGE_METADATA_SCHEMA,
    status,
    opened,
    lane,
    scenario: normalizeText(flags[FLAG_SCENARIO]) || DEFAULT_SCENARIO,
    artifact: normalizeText(flags[FLAG_ARTIFACT]) || DEFAULT_ARTIFACT,
    playback: normalizeText(flags[FLAG_PLAYBACK]) || DEFAULT_PLAYBACK,
    owner: normalizeText(flags[FLAG_OWNER]),
    boundary: normalizeText(flags[FLAG_BOUNDARY]),
    dominantReason: normalizeText(flags[FLAG_DOMINANT_REASON]),
    currentState:
      normalizeText(flags[FLAG_CURRENT_STATE]) ||
      'New package scaffolded from the shared work-package schema.',
    nextAction: normalizeText(flags[FLAG_NEXT_ACTION]),
    proof,
    [THEORY_LEDGER_REFS_FIELD]: [],
    [SCOPE_FIELD_WRITE_SCOPE]: writeScope,
    [SCOPE_FIELD_HANDOFF_FILES]: handoffFiles,
    [SCOPE_FIELD_GENERATED_FILES]: generatedFiles,
    [SCOPE_FIELD_CANDIDATE_RUNTIME_FILES]: candidateRuntimeFiles,
    [SCOPE_FIELD_COMMIT_SCOPE]: commitScope,
    modelFit: {
      packageClass:
        normalizeText(flags[FLAG_PACKAGE_CLASS]) ||
        modelFitDefaults.packageClass,
      intendedMinimumModel:
        normalizeText(flags[FLAG_INTENDED_MINIMUM_MODEL]) ||
        modelFitDefaults.intendedMinimumModel,
      scopeShape:
        normalizeText(flags[FLAG_SCOPE_SHAPE]) ||
        modelFitDefaults.scopeShape,
      outputProfile:
        normalizeText(flags[FLAG_OUTPUT_PROFILE]) ||
        modelFitDefaults.outputProfile,
      escalationTriggers: [
        'owned files expand beyond this package',
        'a frozen decision must be reopened',
      ],
    },
  };
  const boundedExperiment = buildBoundedExperimentMetadata(lane, flags);
  if (boundedExperiment) {
    metadata[BOUNDED_EXPERIMENT_FIELD] = boundedExperiment;
    metadata[VALIDATION_TIER_FIELD] =
      normalizeText(flags[FLAG_VALIDATION_TIER]) ||
      DEFAULT_EXPERIMENT_VALIDATION_TIER;
    const observablePrediction = buildObservablePredictionMetadata(
      lane,
      flags,
      metadata,
    );
    if (observablePrediction) {
      metadata[OBSERVABLE_PREDICTION_FIELD] = observablePrediction;
    }
  }
  const inheritsContext = buildInheritsContextMetadata(lane, flags);
  if (inheritsContext) {
    metadata[INHERITS_CONTEXT_FIELD] = inheritsContext;
  }
  metadata[MODEL_FIT_SPLIT_FIELD] = buildModelFitSplitMetadata(
    lane,
    metadata,
    flags,
  );
  if (isClassificationOnly) {
    metadata.representativeResidual = {
      status: 'classification-only',
      scenario: metadata.scenario,
      artifact: metadata.artifact,
      frontier: `${metadata.owner} / ${metadata.boundary}`,
      owner: metadata.owner,
      boundary: metadata.boundary,
      dominantReason: metadata.dominantReason,
      nextAction: metadata.nextAction,
    };
  }
  const classificationEfficiency = buildClassificationEfficiencyMetadata(
    flags,
    metadata,
    proof,
    isClassificationOnly,
  );
  if (classificationEfficiency) {
    metadata[CLASSIFICATION_EFFICIENCY_FIELD] = classificationEfficiency;
  }
  const rerunDecision = buildRerunDecisionMetadata(flags, metadata);
  if (rerunDecision) {
    metadata[RERUN_DECISION_FIELD] = rerunDecision;
  }
  const predecessor = normalizeText(flags[FLAG_PREDECESSOR]);
  if (predecessor) {
    metadata.predecessor = predecessor;
    try {
      // Find the predecessor file and parse its metadata to inherit theoryLedgerRefs
      const predContent = await fs.readFile(predecessor, 'utf8');
      const predMetadata = parsePackageMetadata(predContent, predecessor);
      if (predMetadata && Array.isArray(predMetadata[THEORY_LEDGER_REFS_FIELD])) {
        metadata[THEORY_LEDGER_REFS_FIELD] = predMetadata[THEORY_LEDGER_REFS_FIELD];
      }
    } catch (e) {
      // ignore if predecessor file does not exist or fails to parse
    }
  }

  return [
    `# ${normalizeText(flags[FLAG_TITLE])}`,
    EMPTY_TEXT,
    '<!-- work-package',
    JSON.stringify(metadata, null, JSON_INDENT_SPACES),
    '-->',
    EMPTY_TEXT,
    '## Why',
    EMPTY_TEXT,
    'State the focused concern and why this package owns it.',
    EMPTY_TEXT,
    '## Scope Basis',
    EMPTY_TEXT,
    'Approved maintenance scope or roadmap row.',
    EMPTY_TEXT,
    '## Workflow Lane',
    EMPTY_TEXT,
    `- Selected lane: \`${lane}\``,
    buildLaneSufficiencyLine(lane),
    '- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.',
    EMPTY_TEXT,
    ...buildCoreLogicBriefLines(lane, flags, proof, forbiddenFiles, metadata),
    EMPTY_TEXT,
    ...buildCausalDecisionContractLines(
      lane,
      flags,
      proof,
      forbiddenFiles,
      metadata,
    ),
    EMPTY_TEXT,
    ...buildDecisionExperimentGateLines(lane, flags, proof, metadata),
    EMPTY_TEXT,
    ...buildBoundedExperimentLines(metadata),
    EMPTY_TEXT,
    ...buildObservablePredictionLines(metadata),
    EMPTY_TEXT,
    ...buildClassificationOnlyFastPathLines(isClassificationOnly),
    '## Expected Representative Delta',
    EMPTY_TEXT,
    `- Baseline artifact: \`${metadata.artifact}\``,
    `- Expected delta: ${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_EXPECTED_DELTA_FIELD
    ] || DEFAULT_RERUN_EXPECTED_DELTA}`,
    '- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.',
    '- Representative proof class: fresh representative rerun or canonical route-after-rerun result.',
    '- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.',
    EMPTY_TEXT,
    '## Rerun Decision Gate',
    EMPTY_TEXT,
    `- Source artifact: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_SOURCE_ARTIFACT_FIELD
    ] || metadata.artifact}\``,
    `- Route owner: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_ROUTE_OWNER_FIELD
    ] || metadata.owner}\``,
    `- Route boundary: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_ROUTE_BOUNDARY_FIELD
    ] || metadata.boundary}\``,
    `- Route dominant reason: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD
    ] || metadata.dominantReason}\``,
    `- Route causal outcome: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_CAUSAL_OUTCOME_FIELD
    ] || 'pending-before-rerun'}\``,
    `- Stop mode: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_STOP_MODE_FIELD
    ] || 'pending-before-rerun'}\``,
    `- Next lane: \`${metadata[RERUN_DECISION_FIELD]?.[
      RERUN_DECISION_NEXT_LANE_FIELD
    ] || lane}\``,
    '- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.',
    EMPTY_TEXT,
    '## Classification Efficiency',
    EMPTY_TEXT,
    `- Default mode: \`${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
      CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD
    ] || CLASSIFICATION_DEFAULT_MODE_INLINE_GATE}\``,
    `- Separate package reason: \`${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
      CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD
    ] || 'not-needed-inline-gate'}\``,
    `- Evidence budget: \`${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
      CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD
    ] || CLASSIFICATION_DEFAULT_ARTIFACT_BUDGET}\`; ` +
      `\`${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
        CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD
      ] || CLASSIFICATION_DEFAULT_PROOF_BUDGET}\``,
    `- Decision record: ${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
      CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD
    ] || 'Keep classification inside the package unless route truth changes.'}`,
    `- Successor action: \`${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
      CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD
    ] || 'update-current-package'}\``,
    `- Runtime promotion rule: ${metadata[CLASSIFICATION_EFFICIENCY_FIELD]?.[
      CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD
    ] || 'Stable owner/boundary routes move to runtime-owner-boundary work.'}`,
    EMPTY_TEXT,
    '## LLM Tool-First Contract',
    EMPTY_TEXT,
    'Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:',
    EMPTY_TEXT,
    '1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.',
    '2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.',
    '3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.',
    '4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.',
    '5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.',
    EMPTY_TEXT,
    'If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.',
    EMPTY_TEXT,
    '## Workflow Acceleration Contract',
    EMPTY_TEXT,
    '1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.',
    '2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.',
    '3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.',
    '4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.',
    '5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.',
    EMPTY_TEXT,
    '## In Scope',
    EMPTY_TEXT,
    markdownList(ownedFiles, 'Focused package-owned edit.'),
    EMPTY_TEXT,
    '## Out Of Scope',
    EMPTY_TEXT,
    markdownList(forbiddenFiles, 'Runtime ownership changes.'),
    EMPTY_TEXT,
    '## Model Fit',
    EMPTY_TEXT,
    `- Package class: \`${metadata.modelFit.packageClass}\``,
    `- Intended minimum model: \`${metadata.modelFit.intendedMinimumModel}\``,
    `- Scope shape: \`${metadata.modelFit.scopeShape}\``,
    `- Output profile: \`${metadata.modelFit.outputProfile}\``,
    `- Owned files: ${markdownInlineCodeList(ownedFiles, '`work/packages/<this-package>.md`')}`,
    `- Forbidden files: ${markdownInlineCodeList(forbiddenFiles, '`src/`')}`,
    '- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.',
    '- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.',
    `- Focused proof: ${markdownInlineCodeList(modelFitProof, `\`${DEFAULT_ACCELERATION_PROOF}\``)}`,
    `- Model ledger advisory: \`${modelFitDefaults.ledgerRecommendation}\``,
    EMPTY_TEXT,
    ...buildModelFitSplitLines(metadata),
    EMPTY_TEXT,
    '## Execution Evidence',
    EMPTY_TEXT,
    'Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.',
    'Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.',
    EMPTY_TEXT,
    '- [ ] action: implementation; owner: <owner>; files-changed: <paths or none>; validation: <focused proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.',
    '- [ ] action: verification-fix; owner: <owner>; files-changed: <paths or none>; validation: <verification proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.',
    '- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: <validated|not-needed>.',
    EMPTY_TEXT,
    '## Validation',
    EMPTY_TEXT,
    markdownList(proof, '`git diff --check -- <files>`'),
    EMPTY_TEXT,
  ].join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  let flags = parseArgs(args);
  if (flags[FLAG_HELP]) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  if (flags[FLAG_SCHEMA]) {
    return renderSchemaReference();
  }
  flags = await resolveArtifactDefaults(flags);
  validateFlags(flags);
  const opened = normalizeText(flags[FLAG_OPENED]) || todayIsoDate();
  const status = normalizeText(flags[FLAG_STATUS]) || DEFAULT_STATUS;
  const packagePath = buildPackagePath(status, opened, normalizeText(flags[FLAG_SLUG]));
  const content = await buildPackageContent(flags);
  if (flags[FLAG_WRITE]) {
    await fs.mkdir(path.dirname(packagePath), {recursive: true});
    try {
      await fs.writeFile(packagePath, `${content}${NEWLINE}`, {
        encoding: ENCODING_UTF8,
        flag: 'wx',
      });
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`${packagePath} already exists.`);
      }
      throw error;
    }
    return `Created ${packagePath}.${NEWLINE}`;
  }
  return [
    `Path: ${packagePath}`,
    EMPTY_TEXT,
    content,
    EMPTY_TEXT,
  ].join(NEWLINE);
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
  buildPackageContent,
  parseArgs,
  runCli,
};
