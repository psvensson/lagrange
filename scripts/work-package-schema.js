#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';

const NEWLINE = '\n';
const EMPTY_TEXT = '';
const LIST_PREFIX = '- ';
const STATUS_ACTIVE = 'active';
const STATUS_DONE = 'done';
const STATUS_SUPERSEDED = 'superseded';
const STATUS_TODO = 'todo';
const LANE_READ_REVIEW_DOC_ONLY = 'read-review-doc-only';
const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
const LANE_SCENARIO_RELEASE_GATE = 'scenario-release-gate';
const LANE_CAUSAL_ESCALATION = 'causal-escalation';
const CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD = 'Canonical outcome';
const CORE_LOGIC_BRIEF_INPUTS_FIELD = 'Inputs/signals';
const CORE_LOGIC_BRIEF_MODEL_FIELD = 'State model or invariant';
const CORE_LOGIC_BRIEF_NON_GOALS_FIELD =
  'Non-goals and forbidden interpretations';
const CORE_LOGIC_BRIEF_PROOF_FIELD = 'Proof mapping';
const CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD = 'Wrong-slice trigger';
const MODEL_FIT_SPARK_MODEL = 'gpt-5.3-codex-spark';
const MODEL_FIT_DEFAULT_FRONTIER_MODEL = 'gpt-5.3-codex';
const MODEL_FIT_LEAF_SLICE_SCOPE = 'leaf-slice';
const MODEL_FIT_LIGHTWEIGHT_CLASS = 'bounded-implementation';
const MODEL_FIT_DIAGNOSTIC_CLASS = 'diagnostic-classification';
const MODEL_FIT_RUNTIME_CLASS = 'runtime-owner-boundary';
const MODEL_FIT_SCENARIO_CLASS = 'representative-frontier-closure';
const MODEL_FIT_CAUSAL_CLASS = 'architecture-gap-analysis';
const MODEL_FIT_RUNTIME_SCOPE = 'owner-boundary-contraction';
const MODEL_FIT_DIAGNOSTIC_SCOPE = 'diagnostic-owner-evidence/current-artifact';
const MODEL_FIT_SCENARIO_SCOPE = 'owner-boundary-contraction/current-frontier';
const MODEL_FIT_CAUSAL_SCOPE = 'scenario-causal-escalation';
const OUTPUT_PROFILE_SMALL = 'small';
const OUTPUT_PROFILE_MEDIUM = 'medium';
const OUTPUT_PROFILE_HIGH = 'high';
const OUTPUT_PROFILE_EXTRA_HIGH = 'extra-high';
const WORK_PACKAGE_METADATA_SCHEMA = 'work-package-v1';
const CAUSAL_GOVERNANCE_PENDING_OUTCOME = 'pending-before-rerun';
const SCOPE_FIELD_WRITE_SCOPE = 'writeScope';
const SCOPE_FIELD_HANDOFF_FILES = 'handoffFiles';
const SCOPE_FIELD_GENERATED_FILES = 'generatedFiles';
const SCOPE_FIELD_CANDIDATE_RUNTIME_FILES = 'candidateRuntimeFiles';
const SCOPE_FIELD_COMMIT_SCOPE = 'commitScope';
const OWNER_BOUNDARY_MIGRATION_PROOF_FIELD = 'ownerBoundaryMigrationProof';
const OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD = 'fromOwner';
const OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD = 'fromBoundary';
const OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD = 'toOwner';
const OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD = 'toBoundary';
const OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD = 'reason';
const OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD = 'evidence';
const SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD =
  'recentFrontierHistory';
const SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD =
  'oscillationCheck';
const SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD =
  'handoffInvariant';
const ARCHITECTURE_DECISION_GATE_FIELD = 'architectureDecisionGate';
const RERUN_DECISION_FIELD = 'rerunDecision';
const RERUN_DECISION_SOURCE_ARTIFACT_FIELD = 'sourceArtifact';
const RERUN_DECISION_ROUTE_OWNER_FIELD = 'routeOwner';
const RERUN_DECISION_ROUTE_BOUNDARY_FIELD = 'routeBoundary';
const RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD = 'routeDominantReason';
const RERUN_DECISION_CAUSAL_OUTCOME_FIELD = 'routeCausalOutcome';
const RERUN_DECISION_STOP_MODE_FIELD = 'stopMode';
const RERUN_DECISION_NEXT_LANE_FIELD = 'nextLane';
const RERUN_DECISION_EXPECTED_DELTA_FIELD = 'expectedDelta';
const RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD =
  'requiredRefreshCommands';
const RERUN_DECISION_FIELDS = Object.freeze([
  RERUN_DECISION_SOURCE_ARTIFACT_FIELD,
  RERUN_DECISION_ROUTE_OWNER_FIELD,
  RERUN_DECISION_ROUTE_BOUNDARY_FIELD,
  RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD,
  RERUN_DECISION_CAUSAL_OUTCOME_FIELD,
  RERUN_DECISION_STOP_MODE_FIELD,
  RERUN_DECISION_NEXT_LANE_FIELD,
  RERUN_DECISION_EXPECTED_DELTA_FIELD,
  RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD,
]);
const CLASSIFICATION_EFFICIENCY_FIELD = 'classificationEfficiency';
const CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD = 'defaultMode';
const CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD =
  'separatePackageReason';
const CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD = 'artifactBudget';
const CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD =
  'proofCommandBudget';
const CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD = 'commands';
const CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD = 'decisionRecord';
const CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD = 'successorAction';
const CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD =
  'runtimePromotionRule';
const CLASSIFICATION_EFFICIENCY_FIELDS = Object.freeze([
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
  CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD,
  CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
  CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
]);
const CLASSIFICATION_EFFICIENCY_DEFAULT_MODES = Object.freeze([
  'inline-gate-default',
  'separate-package-approved',
]);
const CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS = Object.freeze([
  'owner-boundary-or-action-changed',
  'runtime-promotion-blocked',
  'architecture-or-human-stop',
  'tracker-truth-change',
  'successor-selection',
]);
const CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS = Object.freeze([
  'update-current-package',
  'record-in-predecessor-or-sprint',
  'open-runtime-owner-boundary',
  'open-tooling-bug',
  'open-causal-escalation',
  'present-human-gate',
  'rerun-representative-evidence',
]);
const ARCHITECTURE_DECISION_GATE_STATUSES = Object.freeze([
  'not-required',
  'required',
  'presented',
  'selected',
  'watching',
]);
const ARCHITECTURE_DECISION_GATE_TRIGGERS = Object.freeze([
  'none',
  'architecture-gap',
  'frontier-oscillation',
]);
const ARCHITECTURE_DECISION_GATE_ROUTES = Object.freeze([
  'continue-local-proof',
  'owner-boundary-migration',
  'architecture-package',
  'human-escalation',
]);
const VALIDATION_PHASE_ENTRY = 'entry';
const VALIDATION_PHASE_PRE_IMPL = 'pre-impl';
const VALIDATION_PHASE_CLOSURE = 'closure';
const SUBAGENT_UNAVAILABLE_HUMAN_WAIVED = 'human-waived';
const SUBAGENT_UNAVAILABLE_TOOL_UNAVAILABLE = 'tool-unavailable';
const SUBAGENT_UNAVAILABLE_BLOCKED_BY_ENVIRONMENT_POLICY =
  'blocked-by-environment-policy';
const SUBAGENT_ATTEMPT_STARTED = 'started';
const SUBAGENT_ATTEMPT_RUNNING = 'running';
const SUBAGENT_ATTEMPT_INTERRUPTED = 'interrupted';
const SUBAGENT_ATTEMPT_PARTIAL_UNVALIDATED = 'partial-unvalidated';
const SUBAGENT_ATTEMPT_VALIDATED = 'validated';
const SUBAGENT_ATTEMPT_SUPERSEDED = 'superseded';

const VALID_PACKAGE_STATUSES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_DONE,
  STATUS_SUPERSEDED,
  STATUS_TODO,
]);

const WORKFLOW_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_CAUSAL_ESCALATION,
]);

const SUBAGENT_OPTIONAL_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_DIAGNOSTIC_CLASSIFICATION,
]);

const CORE_LOGIC_BRIEF_REQUIRED_LANES = Object.freeze([
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_CAUSAL_ESCALATION,
]);

const CORE_LOGIC_BRIEF_FIELDS = Object.freeze([
  CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD,
  CORE_LOGIC_BRIEF_INPUTS_FIELD,
  CORE_LOGIC_BRIEF_MODEL_FIELD,
  CORE_LOGIC_BRIEF_NON_GOALS_FIELD,
  CORE_LOGIC_BRIEF_PROOF_FIELD,
  CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD,
]);

const CAUSAL_GOVERNANCE_VALID_OUTCOMES = Object.freeze([
  'representative-green',
  'reduced',
  'same-frontier',
  'migrated',
  'classification-only',
  'architecture-gap',
  'contradictory',
  CAUSAL_GOVERNANCE_PENDING_OUTCOME,
]);

const SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS = Object.freeze([
  'pending-before-probe',
  'representative-green',
  'reduced',
  'same-frontier',
  'migrated',
  'classification-only',
  'architecture-gap',
  'contradictory',
]);

const SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS = Object.freeze([
  'continue-local-fix',
  'bounded-non-frontier',
  'migrate-owner-boundary',
  'classification-only-stop',
  'architecture-gap-stop',
  'representative-green',
  'human-escalation',
]);

const SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS = Object.freeze([
  'wake',
  'retry',
  'timeout',
  'reconcile',
  'drain',
  'dispatch',
  'delivery',
  'timer',
  'advance',
  'bounded',
]);

const WORK_PACKAGE_SCOPE_FIELDS = Object.freeze([
  SCOPE_FIELD_WRITE_SCOPE,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
]);
const REPRESENTATIVE_RESIDUAL_FIELD = 'representativeResidual';
const REPRESENTATIVE_RESIDUAL_FIELDS = Object.freeze([
  'status',
  'scenario',
  'artifact',
  'frontier',
  'owner',
  'boundary',
  'dominantReason',
  'nextAction',
]);

const OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS = Object.freeze([
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD,
]);

const SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_FIELDS = Object.freeze([
  SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD,
  SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD,
  SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD,
]);

const VALIDATION_PHASES = Object.freeze([
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PRE_IMPL,
  VALIDATION_PHASE_CLOSURE,
]);

const VALID_OUTPUT_PROFILES = Object.freeze([
  OUTPUT_PROFILE_SMALL,
  OUTPUT_PROFILE_MEDIUM,
  OUTPUT_PROFILE_HIGH,
  OUTPUT_PROFILE_EXTRA_HIGH,
]);

const SUBAGENT_UNAVAILABLE_STATES = Object.freeze([
  SUBAGENT_UNAVAILABLE_HUMAN_WAIVED,
  SUBAGENT_UNAVAILABLE_TOOL_UNAVAILABLE,
  SUBAGENT_UNAVAILABLE_BLOCKED_BY_ENVIRONMENT_POLICY,
]);

const SUBAGENT_ATTEMPT_STATUSES = Object.freeze([
  SUBAGENT_ATTEMPT_STARTED,
  SUBAGENT_ATTEMPT_RUNNING,
  SUBAGENT_ATTEMPT_INTERRUPTED,
  SUBAGENT_ATTEMPT_PARTIAL_UNVALIDATED,
  SUBAGENT_ATTEMPT_VALIDATED,
  SUBAGENT_ATTEMPT_SUPERSEDED,
]);

const DEFAULT_MODEL_FIT_BY_LANE = Object.freeze({
  [LANE_READ_REVIEW_DOC_ONLY]: Object.freeze({
    packageClass: MODEL_FIT_LIGHTWEIGHT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_SMALL,
  }),
  [LANE_LIGHTWEIGHT_MAINTENANCE]: Object.freeze({
    packageClass: MODEL_FIT_LIGHTWEIGHT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_DIAGNOSTIC_CLASSIFICATION]: Object.freeze({
    packageClass: MODEL_FIT_DIAGNOSTIC_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_DIAGNOSTIC_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_RUNTIME_OWNER_BOUNDARY]: Object.freeze({
    packageClass: MODEL_FIT_RUNTIME_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_RUNTIME_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_SCENARIO_RELEASE_GATE]: Object.freeze({
    packageClass: MODEL_FIT_SCENARIO_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_SCENARIO_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_CAUSAL_ESCALATION]: Object.freeze({
    packageClass: MODEL_FIT_CAUSAL_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_CAUSAL_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
});

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function firstCountKey(counts = []) {
  const [first] = counts;
  return Array.isArray(first) ? normalizeText(first[0]) : EMPTY_TEXT;
}

function isEscalationRecommended(modelLedgerSummary = {}) {
  return normalizeText(modelLedgerSummary.recommendation) === 'escalate';
}

function defaultModelFitForLane(lane, modelLedgerSummary = {}) {
  const normalizedLane = normalizeText(lane) || LANE_LIGHTWEIGHT_MAINTENANCE;
  const defaults =
    DEFAULT_MODEL_FIT_BY_LANE[normalizedLane] ||
    DEFAULT_MODEL_FIT_BY_LANE[LANE_LIGHTWEIGHT_MAINTENANCE];
  const dominantPackageClass =
    firstCountKey(modelLedgerSummary.packageClasses) || defaults.packageClass;
  const dominantScopeShape =
    firstCountKey(modelLedgerSummary.scopeShapes) || defaults.scopeShape;
  const shouldEscalate = isEscalationRecommended(modelLedgerSummary) &&
    !SUBAGENT_OPTIONAL_LANES.includes(normalizedLane);

  return {
    packageClass: shouldEscalate ? dominantPackageClass : defaults.packageClass,
    intendedMinimumModel: shouldEscalate ?
      MODEL_FIT_DEFAULT_FRONTIER_MODEL :
      defaults.intendedMinimumModel,
    scopeShape: shouldEscalate ? dominantScopeShape : defaults.scopeShape,
    outputProfile: defaults.outputProfile,
    ledgerRecommendation:
      normalizeText(modelLedgerSummary.recommendation) || 'hold',
  };
}

function defaultOutputProfileForLane(lane) {
  const normalizedLane = normalizeText(lane) || LANE_LIGHTWEIGHT_MAINTENANCE;
  return (
    DEFAULT_MODEL_FIT_BY_LANE[normalizedLane] ||
    DEFAULT_MODEL_FIT_BY_LANE[LANE_LIGHTWEIGHT_MAINTENANCE]
  ).outputProfile;
}

function renderEnumList(values = []) {
  return values.map((value) => `${LIST_PREFIX}\`${value}\``).join(NEWLINE);
}

function coreLogicBriefRequiredForLane(lane) {
  return CORE_LOGIC_BRIEF_REQUIRED_LANES.includes(normalizeText(lane));
}

function renderSchemaReference() {
  return [
    '# Work Package Schema Reference',
    EMPTY_TEXT,
    `- Metadata schema: \`${WORK_PACKAGE_METADATA_SCHEMA}\``,
    EMPTY_TEXT,
    '## Package Statuses',
    EMPTY_TEXT,
    renderEnumList(VALID_PACKAGE_STATUSES),
    EMPTY_TEXT,
    '## Workflow Lanes',
    EMPTY_TEXT,
    renderEnumList(WORKFLOW_LANES),
    EMPTY_TEXT,
    '## Output Profiles',
    EMPTY_TEXT,
    renderEnumList(VALID_OUTPUT_PROFILES),
    EMPTY_TEXT,
    '## Scope Fields',
    EMPTY_TEXT,
    renderEnumList(WORK_PACKAGE_SCOPE_FIELDS),
    EMPTY_TEXT,
    '## Core Logic Brief',
    EMPTY_TEXT,
    'Required lanes:',
    EMPTY_TEXT,
    renderEnumList(CORE_LOGIC_BRIEF_REQUIRED_LANES),
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(CORE_LOGIC_BRIEF_FIELDS),
    EMPTY_TEXT,
    '## Causal Decision Contract',
    EMPTY_TEXT,
    '- Required before implementation for active runtime-owner-boundary, scenario-release-gate, and causal-escalation packages.',
    '- Decision table columns: `Signal`, `Normalized value`, `Owner interpretation`, `Emitted outcome`, `Expected delta`, `Disproof probe`.',
    '- Required fields: `Anti-symptom rationale`, `Falsifying focused probe`, `Competing explanations`, `Systemic interaction scan`, and `Ping-pong stop rule`.',
    '- Frontier oscillation packages must also explain the `Oscillation guard` before another local patch.',
    EMPTY_TEXT,
    '## Representative Residual',
    EMPTY_TEXT,
    `- Metadata field: \`${REPRESENTATIVE_RESIDUAL_FIELD}\``,
    renderEnumList(REPRESENTATIVE_RESIDUAL_FIELDS),
    EMPTY_TEXT,
    '## Owner Boundary Migration Proof',
    EMPTY_TEXT,
    `- Metadata field: \`${OWNER_BOUNDARY_MIGRATION_PROOF_FIELD}\``,
    renderEnumList(OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS),
    EMPTY_TEXT,
    '## Rerun Decision',
    EMPTY_TEXT,
    `- Metadata field: \`${RERUN_DECISION_FIELD}\``,
    renderEnumList(RERUN_DECISION_FIELDS),
    EMPTY_TEXT,
    '## Classification Efficiency',
    EMPTY_TEXT,
    `- Metadata field: \`${CLASSIFICATION_EFFICIENCY_FIELD}\``,
    renderEnumList(CLASSIFICATION_EFFICIENCY_FIELDS),
    EMPTY_TEXT,
    'Default modes:',
    EMPTY_TEXT,
    renderEnumList(CLASSIFICATION_EFFICIENCY_DEFAULT_MODES),
    EMPTY_TEXT,
    'Separate package reasons:',
    EMPTY_TEXT,
    renderEnumList(CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS),
    EMPTY_TEXT,
    'Successor actions:',
    EMPTY_TEXT,
    renderEnumList(CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS),
    EMPTY_TEXT,
    '## Validation Phases',
    EMPTY_TEXT,
    renderEnumList(VALIDATION_PHASES),
    EMPTY_TEXT,
    '## Subagent Unavailable States',
    EMPTY_TEXT,
    renderEnumList(SUBAGENT_UNAVAILABLE_STATES),
    EMPTY_TEXT,
    '## Subagent Progress And Attempt Ledger',
    EMPTY_TEXT,
    '- Preferred checkpoint ledger for new packages that require subagent sequencing.',
    '- One checked item satisfies both progress and attempt proof when it includes `Agent <name> (<agent-id>)`, `status: ...`, `last checkpoint: ...`, `parent action: ...`, `evidence: ...`, and `next: ...` or `blocker: ...`.',
    '- Separate `## Subagent Progress Ledger` and `## Subagent Attempt Ledger` sections remain valid for legacy packages.',
    EMPTY_TEXT,
    '## Subagent Progress Ledger',
    EMPTY_TEXT,
    '- Legacy separate progress ledger; use only when a package already keeps progress and attempt proof in separate sections.',
    '- Each real subagent appends one checked update after every completed subtask.',
    '- Checked updates include `Agent <name> (<agent-id>)`, `evidence: ...`, and `next: ...` or `blocker: ...`.',
    '- A review agent may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; use a separate fix subagent only for runtime, test, script, report, or non-metadata fixes.',
    '- The progress ledger explains in-flight work; the Subagent Sequencing Ledger remains the closure proof for required roles.',
    EMPTY_TEXT,
    '## Subagent Attempt Ledger',
    EMPTY_TEXT,
    '- Legacy separate attempt ledger; use only when a package already keeps progress and attempt proof in separate sections.',
    '- Checked attempts include `Agent <name> (<agent-id>)`, `status: ...`, `last checkpoint: ...`, `parent action: ...`, `evidence: ...`, and `next: ...` or `blocker: ...`.',
    '- Valid statuses:',
    EMPTY_TEXT,
    renderEnumList(SUBAGENT_ATTEMPT_STATUSES),
    EMPTY_TEXT,
    '- Interrupted or partial-unvalidated attempts must be followed by a checked superseded/discarded/revalidated attempt line before closure.',
    EMPTY_TEXT,
    '## Causal Governance Outcomes',
    EMPTY_TEXT,
    renderEnumList(CAUSAL_GOVERNANCE_VALID_OUTCOMES),
    EMPTY_TEXT,
    '## Scenario Result Classifications',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS),
    EMPTY_TEXT,
    '## Scenario Stop Conditions',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS),
    EMPTY_TEXT,
    '## Classification-Only Fast Path',
    EMPTY_TEXT,
    '- Applies when package metadata records `classification-only` as the representative outcome, scenario result classification, or representative residual status.',
    '- Requires implementation paths to stay out of `writeScope` and `commitScope`; keep possible runtime/test/script/report paths in `candidateRuntimeFiles` until promotion.',
    '- Subagent sequencing is optional for the fast path. Runtime/test/script/report promotion returns the package to the normal implementation lane.',
    '- Keep fast-path proof to 2-3 canonical commands: representative evidence, one focused extractor/probe, and validation or causal-model proof.',
    EMPTY_TEXT,
    '## Scenario Frontier Oscillation Fields',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_FIELDS),
    EMPTY_TEXT,
    '## Architecture Decision Gate',
    EMPTY_TEXT,
    `- Metadata field: \`${ARCHITECTURE_DECISION_GATE_FIELD}\``,
    EMPTY_TEXT,
    'Statuses:',
    EMPTY_TEXT,
    renderEnumList(ARCHITECTURE_DECISION_GATE_STATUSES),
    EMPTY_TEXT,
    'Triggers:',
    EMPTY_TEXT,
    renderEnumList(ARCHITECTURE_DECISION_GATE_TRIGGERS),
    EMPTY_TEXT,
    'Routes:',
    EMPTY_TEXT,
    renderEnumList(ARCHITECTURE_DECISION_GATE_ROUTES),
    EMPTY_TEXT,
    '## Bounded Progress Mechanisms',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS),
    EMPTY_TEXT,
  ].join(NEWLINE);
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  process.stdout.write(renderSchemaReference());
}

export {
  ARCHITECTURE_DECISION_GATE_FIELD,
  ARCHITECTURE_DECISION_GATE_ROUTES,
  ARCHITECTURE_DECISION_GATE_STATUSES,
  ARCHITECTURE_DECISION_GATE_TRIGGERS,
  CAUSAL_GOVERNANCE_PENDING_OUTCOME,
  CAUSAL_GOVERNANCE_VALID_OUTCOMES,
  CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD,
  CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODES,
  CLASSIFICATION_EFFICIENCY_FIELD,
  CLASSIFICATION_EFFICIENCY_FIELDS,
  CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS,
  CORE_LOGIC_BRIEF_FIELDS,
  CORE_LOGIC_BRIEF_REQUIRED_LANES,
  DEFAULT_MODEL_FIT_BY_LANE,
  LANE_CAUSAL_ESCALATION,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  MODEL_FIT_DEFAULT_FRONTIER_MODEL,
  MODEL_FIT_LEAF_SLICE_SCOPE,
  MODEL_FIT_SPARK_MODEL,
  OUTPUT_PROFILE_MEDIUM,
  RERUN_DECISION_CAUSAL_OUTCOME_FIELD,
  RERUN_DECISION_EXPECTED_DELTA_FIELD,
  RERUN_DECISION_FIELD,
  RERUN_DECISION_FIELDS,
  RERUN_DECISION_NEXT_LANE_FIELD,
  RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD,
  RERUN_DECISION_ROUTE_BOUNDARY_FIELD,
  RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD,
  RERUN_DECISION_ROUTE_OWNER_FIELD,
  RERUN_DECISION_SOURCE_ARTIFACT_FIELD,
  RERUN_DECISION_STOP_MODE_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD,
  SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS,
  SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_FIELDS,
  SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD,
  SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD,
  SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD,
  SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS,
  SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS,
  REPRESENTATIVE_RESIDUAL_FIELD,
  REPRESENTATIVE_RESIDUAL_FIELDS,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_WRITE_SCOPE,
  SUBAGENT_OPTIONAL_LANES,
  SUBAGENT_ATTEMPT_STATUSES,
  SUBAGENT_UNAVAILABLE_STATES,
  VALID_PACKAGE_STATUSES,
  VALID_OUTPUT_PROFILES,
  VALIDATION_PHASES,
  VALIDATION_PHASE_CLOSURE,
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PRE_IMPL,
  WORK_PACKAGE_SCOPE_FIELDS,
  WORKFLOW_LANES,
  WORK_PACKAGE_METADATA_SCHEMA,
  coreLogicBriefRequiredForLane,
  defaultOutputProfileForLane,
  defaultModelFitForLane,
  renderSchemaReference,
};
