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
const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
const LANE_SCENARIO_RELEASE_GATE = 'scenario-release-gate';
const LANE_CAUSAL_ESCALATION = 'causal-escalation';
const MODEL_FIT_SPARK_MODEL = 'gpt-5.3-codex-spark';
const MODEL_FIT_DEFAULT_FRONTIER_MODEL = 'gpt-5.3-codex';
const MODEL_FIT_LEAF_SLICE_SCOPE = 'leaf-slice';
const MODEL_FIT_LIGHTWEIGHT_CLASS = 'bounded-implementation';
const MODEL_FIT_RUNTIME_CLASS = 'runtime-owner-boundary';
const MODEL_FIT_SCENARIO_CLASS = 'representative-frontier-closure';
const MODEL_FIT_CAUSAL_CLASS = 'architecture-gap-analysis';
const MODEL_FIT_RUNTIME_SCOPE = 'owner-boundary-contraction';
const MODEL_FIT_SCENARIO_SCOPE = 'owner-boundary-contraction/current-frontier';
const MODEL_FIT_CAUSAL_SCOPE = 'scenario-causal-escalation';
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
const VALIDATION_PHASE_ENTRY = 'entry';
const VALIDATION_PHASE_PRE_IMPL = 'pre-impl';
const VALIDATION_PHASE_CLOSURE = 'closure';
const SUBAGENT_UNAVAILABLE_HUMAN_WAIVED = 'human-waived';
const SUBAGENT_UNAVAILABLE_TOOL_UNAVAILABLE = 'tool-unavailable';
const SUBAGENT_UNAVAILABLE_BLOCKED_BY_ENVIRONMENT_POLICY =
  'blocked-by-environment-policy';

const VALID_PACKAGE_STATUSES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_DONE,
  STATUS_SUPERSEDED,
  STATUS_TODO,
]);

const WORKFLOW_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_CAUSAL_ESCALATION,
]);

const SUBAGENT_OPTIONAL_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_LIGHTWEIGHT_MAINTENANCE,
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

const VALIDATION_PHASES = Object.freeze([
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PRE_IMPL,
  VALIDATION_PHASE_CLOSURE,
]);

const SUBAGENT_UNAVAILABLE_STATES = Object.freeze([
  SUBAGENT_UNAVAILABLE_HUMAN_WAIVED,
  SUBAGENT_UNAVAILABLE_TOOL_UNAVAILABLE,
  SUBAGENT_UNAVAILABLE_BLOCKED_BY_ENVIRONMENT_POLICY,
]);

const DEFAULT_MODEL_FIT_BY_LANE = Object.freeze({
  [LANE_READ_REVIEW_DOC_ONLY]: Object.freeze({
    packageClass: MODEL_FIT_LIGHTWEIGHT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
  }),
  [LANE_LIGHTWEIGHT_MAINTENANCE]: Object.freeze({
    packageClass: MODEL_FIT_LIGHTWEIGHT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
  }),
  [LANE_RUNTIME_OWNER_BOUNDARY]: Object.freeze({
    packageClass: MODEL_FIT_RUNTIME_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_RUNTIME_SCOPE,
  }),
  [LANE_SCENARIO_RELEASE_GATE]: Object.freeze({
    packageClass: MODEL_FIT_SCENARIO_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_SCENARIO_SCOPE,
  }),
  [LANE_CAUSAL_ESCALATION]: Object.freeze({
    packageClass: MODEL_FIT_CAUSAL_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_CAUSAL_SCOPE,
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
    ledgerRecommendation:
      normalizeText(modelLedgerSummary.recommendation) || 'hold',
  };
}

function renderEnumList(values = []) {
  return values.map((value) => `${LIST_PREFIX}\`${value}\``).join(NEWLINE);
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
    '## Scope Fields',
    EMPTY_TEXT,
    renderEnumList(WORK_PACKAGE_SCOPE_FIELDS),
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
    '## Validation Phases',
    EMPTY_TEXT,
    renderEnumList(VALIDATION_PHASES),
    EMPTY_TEXT,
    '## Subagent Unavailable States',
    EMPTY_TEXT,
    renderEnumList(SUBAGENT_UNAVAILABLE_STATES),
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
  CAUSAL_GOVERNANCE_PENDING_OUTCOME,
  CAUSAL_GOVERNANCE_VALID_OUTCOMES,
  DEFAULT_MODEL_FIT_BY_LANE,
  LANE_CAUSAL_ESCALATION,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  MODEL_FIT_DEFAULT_FRONTIER_MODEL,
  MODEL_FIT_LEAF_SLICE_SCOPE,
  MODEL_FIT_SPARK_MODEL,
  OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD,
  SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS,
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
  SUBAGENT_UNAVAILABLE_STATES,
  VALID_PACKAGE_STATUSES,
  VALIDATION_PHASES,
  VALIDATION_PHASE_CLOSURE,
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PRE_IMPL,
  WORK_PACKAGE_SCOPE_FIELDS,
  WORKFLOW_LANES,
  WORK_PACKAGE_METADATA_SCHEMA,
  defaultModelFitForLane,
  renderSchemaReference,
};
