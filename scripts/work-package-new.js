#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildRepresentativeEvidenceSummary} from './summarize-representative-evidence.js';
import {buildSummary, readLedgerEntries} from './model-ledger.js';
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
  CORE_LOGIC_BRIEF_FIELDS,
  LANE_CAUSAL_ESCALATION,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_RUNTIME_OWNER_BOUNDARY,
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
  WORKFLOW_LANES,
  WORK_PACKAGE_METADATA_SCHEMA,
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
const FLAG_SCHEMA = 'schema';
const FLAG_HELP = 'help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_PREFIX = '--';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TEMPLATE_PLACEHOLDER_PATTERN = /<[^>]+>/u;
const DEFAULT_ACCELERATION_PROOF = 'npm run work:advance -- --check';
const DEFAULT_RERUN_EXPECTED_DELTA =
  'Classify whether fresh representative evidence is green, reduced, ' +
  'migrated, same-frontier, architecture-gap, contradictory, or needs a ' +
  'bounded successor before runtime promotion.';
const CLASSIFICATION_DEFAULT_MODE_INLINE_GATE = 'inline-gate-default';
const CLASSIFICATION_DEFAULT_MODE_SEPARATE_PACKAGE =
  'separate-package-approved';
const CLASSIFICATION_DEFAULT_ARTIFACT_BUDGET = 'one-artifact';
const CLASSIFICATION_DEFAULT_PROOF_BUDGET =
  'two-or-three-canonical-commands';
const CLASSIFICATION_REASON_SUCCESSOR_SELECTION = 'successor-selection';
const SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY =
  'open-runtime-owner-boundary';
const SUCCESSOR_ACTION_RERUN_REPRESENTATIVE_EVIDENCE =
  'rerun-representative-evidence';
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

function buildCoreLogicBriefLines(lane, flags, proof, forbiddenFiles) {
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
    `- ${CORE_LOGIC_BRIEF_MODEL_FIELD}: Collect evidence, normalize one ` +
      `${owner} / ${boundary} snapshot, then use one explicit state model, ` +
      'decision table, or invariant to emit one canonical outcome and reasons.',
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

function buildLaneSufficiencyLine(lane) {
  if (!coreLogicBriefRequiredForLane(lane)) {
    return '- Why this lane is sufficient: bounded workflow/tooling scope unless changed.';
  }
  return '- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.';
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
    '- Subagent sequencing is optional while the package remains classification-only and no implementation write scope is present.',
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
    'npm run work:current-blocker -- --write',
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
  return isStableRuntimeRoute(flags) ?
    SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY :
    SUCCESSOR_ACTION_RERUN_REPRESENTATIVE_EVIDENCE;
}

function inferNextLane(flags = {}, metadata = {}) {
  const successorAction = inferSuccessorAction(flags);
  if (successorAction === SUCCESSOR_ACTION_OPEN_RUNTIME_OWNER_BOUNDARY) {
    return LANE_RUNTIME_OWNER_BOUNDARY;
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
      'candidateRuntimeFiles until that package activates them.',
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
    ...buildCoreLogicBriefLines(lane, flags, proof, forbiddenFiles),
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
    '- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.',
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
    '3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.',
    '4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.',
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
    '## Subagent Progress Ledger',
    EMPTY_TEXT,
    'Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.',
    EMPTY_TEXT,
    '- [ ] Agent <name> (<agent-id>) <role> context loaded: scope and blocker confirmed; evidence: package, sprint, and handoff files read; next: first focused probe.',
    '- [ ] Agent <name> (<agent-id>) <role> probe complete: state/cause confirmed or contradicted; evidence: command and result; next: edit, validate, or blocker handoff.',
    '- [ ] Agent <name> (<agent-id>) <role> validation complete: package proof refreshed; evidence: commands and results; next: final handoff or successor action.',
    EMPTY_TEXT,
    '## Subagent Attempt Ledger',
    EMPTY_TEXT,
    'Required when subagent sequencing is required. Each real subagent records attempt status, last checkpoint, parent action, evidence, and next step. Interrupted or partial-unvalidated attempts must be followed by a superseded/discarded/revalidated checked line before closure.',
    EMPTY_TEXT,
    '- [ ] Agent <name> (<agent-id>) <role> attempt: status: <started|running|interrupted|partial-unvalidated|validated|superseded>; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.',
    '- [ ] Agent <name> (<agent-id>) <role> attempt: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.',
    '- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.',
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
