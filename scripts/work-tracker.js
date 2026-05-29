#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {execSync} from 'node:child_process';
import Ajv from 'ajv';
import {
  CAUSAL_GOVERNANCE_PENDING_OUTCOME,
  CAUSAL_GOVERNANCE_VALID_OUTCOMES,
  CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD,
  CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODES,
  CLASSIFICATION_EFFICIENCY_FIELD,
  CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS,
  CLOSURE_SUMMARY_FIELD,
  CLOSURE_SUMMARY_FIELDS,
  CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD,
  CLOSURE_SUMMARY_RESULT_FIELD,
  EXPERIMENT_OUTCOME_DECISION_FIELD,
  EXPERIMENT_OUTCOME_DISTINGUISHED_HYPOTHESIS_FIELD,
  EXPERIMENT_OUTCOME_EVIDENCE_FIELD,
  EXPERIMENT_OUTCOME_FIELD,
  EXPERIMENT_OUTCOME_NEXT_BOUNDARY_FIELD,
  EXPERIMENT_OUTCOME_NEXT_OWNER_FIELD,
  SYSTEM_THEORY_ARCHITECTURE_GAP_TRIGGERS_FIELD,
  SYSTEM_THEORY_CHANGED_FACTS_FIELD,
  SYSTEM_THEORY_COMPETING_THEORIES_FIELD,
  SYSTEM_THEORY_DOWNSTREAM_SYMPTOMS_FIELD,
  SYSTEM_THEORY_ELIMINATED_THEORIES_FIELD,
  SYSTEM_THEORY_FIELD,
  SYSTEM_THEORY_FIELDS,
  SYSTEM_THEORY_OWNER_BOUNDARY_MAP_FIELD,
  SYSTEM_THEORY_OWNERSHIP_MIGRATION_TRIGGERS_FIELD,
  SYSTEM_THEORY_PHASE_CHAIN_FIELD,
  SYSTEM_THEORY_PROBLEM_STATEMENT_FIELD,
  SYSTEM_THEORY_STABLE_FACTS_FIELD,
  SYSTEM_THEORY_TRANSITION_EXPECTED_EVIDENCE_FIELD,
  SYSTEM_THEORY_TRANSITION_FALSIFIER_FIELD,
  SYSTEM_THEORY_TRANSITION_FIELDS,
  SYSTEM_THEORY_TRANSITION_INPUT_SIGNAL_FIELD,
  SYSTEM_THEORY_TRANSITION_MIGRATION_TRIGGER_FIELD,
  SYSTEM_THEORY_TRANSITION_MISSING_TRANSITION_FIELD,
  SYSTEM_THEORY_TRANSITION_OWNER_FIELD,
  SYSTEM_THEORY_TRANSITION_TABLE_FIELD,
  SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD,
  SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_INVARIANT_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_COUPLING_NOTE_FIELD,
  MODEL_THEORY_FIELD,
  MODEL_THEORY_FIELDS,
  MODEL_THEORY_KIND_FIELD,
  MODEL_THEORY_EXECUTABLE_ARTIFACT_FIELD,
  MODEL_THEORY_PROPERTIES_PROVEN_FIELD,
  MODEL_THEORY_ASSUMPTIONS_FIELD,
  MODEL_THEORY_COUNTER_EXAMPLE_HANDLING_FIELD,
  MODEL_THEORY_LINKED_SYSTEM_THEORY_REF_FIELD,
  MODEL_THEORY_VALID_KINDS,
  SLICE_THEORY_FALSIFIER_FIELD,
  SLICE_THEORY_FIELD,
  SLICE_THEORY_FIELDS,
  SLICE_THEORY_KILL_RULE_FIELD,
  SLICE_THEORY_REPRESENTATIVE_MOVEMENT_FIELD,
  SLICE_THEORY_SELECTED_MECHANISM_FIELD,
  SLICE_THEORY_SELECTED_THEORY_FIELD,
  SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD,
  SLICE_THEORY_SYSTEM_REF_FIELD,
  SLICE_THEORY_THEORY_FIT_SCORE_FIELD,
  SLICE_THEORY_WRONG_SLICE_TRIGGERS_FIELD,
  THEORY_FIT_SCORE_FIELDS,
  BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD,
  BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD,
  BOUNDED_EXPERIMENT_FIELD,
  BOUNDED_EXPERIMENT_FIELDS,
  BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD,
  BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD,
  BOUNDED_EXPERIMENT_KILL_RULE_FIELD,
  BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD,
  BOUNDED_EXPERIMENT_TIMEBOX_FIELD,
  CORE_LOGIC_BRIEF_FIELDS,
  INHERITS_CONTEXT_FIELD,
  INHERITS_CONTEXT_FIELDS,
  LANE_CAUSAL_ESCALATION,
  LANE_BOUNDED_EXPERIMENT,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_EXPERIMENT,
  LANE_DISCOVERY,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_SINGLE_FILE_RUNTIME,
  LANE_TEST_ONLY_PROOF,
  LANE_FAST_SPIKE,
  MODEL_FIT_54_MODEL,
  OBSERVABLE_PREDICTION_ACCURACY_FIELD,
  OBSERVABLE_PREDICTION_EVIDENCE_FIELD,
  OBSERVABLE_PREDICTION_FIELD,
  OBSERVABLE_PREDICTION_METRIC_DELTA_FIELD,
  OBSERVABLE_PREDICTION_METRIC_FIELD,
  OBSERVABLE_PREDICTION_OBSERVED_FIELD,
  OBSERVABLE_PREDICTION_PREDICTED_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS,
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
  SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD,
  SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD,
  SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD,
  SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS,
  SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_WRITE_SCOPE,
  THEORY_LOOP_ENFORCEMENT_FIELD,
  THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE,
  THEORY_LOOP_FIELD,
  THEORY_LOOP_RESULT_FIELD,
  THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD,
  THEORY_LOOP_SUCCESSOR_PACKAGE_FIELD,
  THEORY_LOOP_SUCCESSOR_REQUIRED_FIELD,
  THEORY_LOOP_OUTCOME_FIELD,
  THEORY_LOOP_OUTCOME_VALUES,
  THEORY_LOOP_JOINT_FALSIFIER_COMMAND_FIELD,
  THEORY_LOOP_ALTERNATING_PAIR_BOUNDARIES_FIELD,
  THEORY_LEDGER_REFS_FIELD,
  SUBAGENT_ATTEMPT_STATUSES,
  SUBAGENT_OPTIONAL_LANES,
  SUBAGENT_UNAVAILABLE_STATES,
  VALID_PACKAGE_STATUSES,
  VALID_OUTPUT_PROFILES,
  VALIDATION_TIER_FIELD,
  VALIDATION_TIERS,
  VALIDATION_PHASE_CLOSURE,
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PROBE,
  VALIDATION_PHASE_PRE_IMPL,
  VALIDATION_PHASES,
  WORK_PACKAGE_METADATA_SCHEMA,
  normalizeMetadata,
  METADATA_FIELD_STABILITY_CREDIT,
  METADATA_FIELD_WHY_HIGHEST_LEVERAGE_NOW,
  METADATA_FIELD_REPRESENTATIVE_RERUN_CADENCE,
  METADATA_FIELD_CODE_QUALITY_ADMISSION,
  STABILITY_CREDIT_VALID_VALUES,
  REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES,
  CODE_QUALITY_ADMISSION_REASONS,
  coreLogicBriefRequiredForLane,
  MECHANISM_CARD_FIELD,
  MECHANISM_CARD_FIELDS,
} from './work-package-schema.js';
import {
  findMissingTheoryLedgerRefs,
  findRelatedTheoryLedgerEntries,
  summarizeTheoryLedgerEntry,
  validateTheoryLedgerContent,
  THEORY_LEDGER_FIELDS,
} from './work-theory-ledger.js';
import {
  parsePackageFile as parseFrontierHistoryPackageFile,
  filterAndSummarizeHistory as filterFrontierHistory,
  detectCompositionalSignals,
  findAlternatingPairBoundaries,
  computeLoopMetrics,
  packageIsRederive,
  extractMechanismTerm,
  COMPOSITIONAL_PAIRS,
} from './work-frontier-history.js';

let globalKindOption = null;
let globalDryRunOption = false;

for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--kind') {
    globalKindOption = process.argv[i + 1];
  }
  if (process.argv[i] === '--dry-run') {
    globalDryRunOption = true;
  }
}

const [
  CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD,
  CORE_LOGIC_BRIEF_INPUTS_FIELD,
  CORE_LOGIC_BRIEF_MODEL_FIELD,
  CORE_LOGIC_BRIEF_NON_GOALS_FIELD,
  CORE_LOGIC_BRIEF_PROOF_FIELD,
  CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD,
] = CORE_LOGIC_BRIEF_FIELDS;

const CLOSURE_SUMMARY_ADOPTION_DATE = '2026-05-28';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const NUM_FOUR = 4;
const NUM_FIVE = 5;
const NUM_MINUS_ONE = -1;
const DATE_SLICE_END = 10;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const STATUS_ACTIVE = 'active';
const STATUS_DONE = 'done';
const STATUS_FAILED = 'failed';
const STATUS_SUPERSEDED = 'superseded';
const STATUS_TODO = 'todo';
const METADATA_LANE_FIELD = 'lane';
const WORK_ROOT = 'work';
const WORK_PACKAGES_DIR = path.join(WORK_ROOT, 'packages');
const WORK_SPRINTS_DIR = path.join(WORK_ROOT, 'sprints');
const WORK_TRACKS_DIR = path.join(WORK_ROOT, 'tracks');
const CURRENT_BLOCKER_JSON_PATH = path.join(
  WORK_SPRINTS_DIR,
  'current-blocker.json',
);
const CURRENT_BLOCKER_SCHEMA = 'current-blocker-v1';
const CURRENT_BLOCKER_REPAIR_COMMAND = 'npm run work:repair';
const CURRENT_BLOCKER_STALE_FIELD_LIMIT = 8;
const CURRENT_BLOCKER_NO_ACTIVE_SPRINT = 'none';
const CURRENT_BLOCKER_CLOSED_STATUSES = Object.freeze([
  STATUS_DONE,
  STATUS_FAILED,
]);
const CURRENT_BLOCKER_MARKDOWN_PATH = path.join(
  WORK_SPRINTS_DIR,
  'current-blocker.md',
);
const MARKDOWN_EXTENSION = '.md';
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const CHECKBOX_OPEN_PATTERN = /(?:^|\n)(?:-|\d+\.) \[ \]/u;
const PACKAGE_STATUS_PATTERN = /^(active|done|superseded|todo)-.+\.md$/u;
const SPRINT_STATUS_PATTERN = /^(active|done|todo)-.+\.md$/u;
const ACTIVE_PACKAGE_LINK_PATTERN =
  /\]\((\.\.\/packages\/active-[^)]+\.md)\)/u;
const CURRENT_ACTIVE_PACKAGE_LINK_PATTERN =
  /(?:current\s+active\s+package|active\s+package|continue)\s*:?\s*(?:\n\s*)?\[[^\]]+\]\((\.\.\/packages\/active-[^)]+\.md)\)/iu;
const ACTIVE_PACKAGE_REFERENCE_PATTERN =
  /((?:work\/packages|(?:\.\.\/|\.\/)packages)\/active-[A-Za-z0-9._-]+\.md)/u;
const CURRENT_EDGE_CARD_ACTIVE_PACKAGE_REFERENCE_PATTERN =
  /^Active package:\s*`?((?:work\/packages|(?:\.\.\/|\.\/)packages)\/active-[A-Za-z0-9._-]+\.md)`?\s*$/imu;
const NEXT_PACKAGE_HEADING = '## Next Package';
const ACTIVE_WORK_REFERENCE_PATTERN =
  /\b((?:work\/(?:packages|sprints)|(?:\.\.\/|\.\/)(?:packages|sprints))\/active-[A-Za-z0-9._-]+\.md)\b/gu;
const EXECUTION_EVIDENCE_HEADING = '## Execution Evidence';
const SUBAGENT_LEDGER_HEADING = '## Subagent Sequencing Ledger';
const SUBAGENT_PROGRESS_LEDGER_HEADING = '## Subagent Progress Ledger';
const SUBAGENT_ATTEMPT_LEDGER_HEADING = '## Subagent Attempt Ledger';
const SUBAGENT_COMBINED_PROGRESS_ATTEMPT_LEDGER_HEADING =
  '## Subagent Progress And Attempt Ledger';
const MARKDOWN_LEVEL_TWO_HEADING_PREFIX = '## ';
const SUBAGENT_LEDGER_REVIEW_LABEL = 'Review subagent recorded';
const SUBAGENT_LEDGER_FIX_LABEL =
  'Fix subagent recorded or explicitly not needed';
const SUBAGENT_LEDGER_IMPLEMENTATION_LABEL = 'Implementation subagent recorded';
const SUBAGENT_LEDGER_REQUIRED_LABELS = Object.freeze([
  SUBAGENT_LEDGER_REVIEW_LABEL,
  SUBAGENT_LEDGER_FIX_LABEL,
  SUBAGENT_LEDGER_IMPLEMENTATION_LABEL,
]);
const COMMIT_AND_PUSH_LEDGER_HEADING = '## Commit And Push Ledger';
const COMMIT_AND_PUSH_LEDGER_LEGACY_HEADING = '## Closure Commit Proof';
const COMMIT_AND_PUSH_LEDGER_HEADINGS = Object.freeze([
  COMMIT_AND_PUSH_LEDGER_HEADING,
  COMMIT_AND_PUSH_LEDGER_LEGACY_HEADING,
]);
const COMMIT_LEDGER_POLICY_OPENED_ON_OR_AFTER = '2026-05-14';
const SUBAGENT_ATTEMPT_LEDGER_POLICY_OPENED_AFTER = '2026-05-18';
const MODEL_FIT_HEADING = '## Model Fit';
const CORE_LOGIC_BRIEF_HEADING = '## Core Logic Brief';
const CAUSAL_DECISION_CONTRACT_HEADING = '## Causal Decision Contract';
const DECISION_EXPERIMENT_GATE_HEADING = '## Decision Experiment Gate';
const SPRINT_STRATEGY_BRIEF_HEADING = '## Sprint Strategy Brief';
const CURRENT_EDGE_CARD_HEADING = '## Current Edge Card';
const LEGACY_CURRENT_NEXT_ACTION_HEADING = '## Current Next Action';
const CURRENT_EDGE_CARD_CODE_FENCE_OPEN = '```text';
const CURRENT_EDGE_CARD_CODE_FENCE_CLOSE = '```';
const CURRENT_EDGE_CARD_ALLOWED_STOP_MODES =
  'representative-green, migrated, reduced, same-frontier, ' +
  'classification-only, architecture-gap, human-escalation';
const CURRENT_EDGE_CARD_THEORY_LOOP_STOP_MODES =
  'success-condition-met only; representative-green, owner-boundary-migration, ' +
  'architecture-gap, same-frontier, classification-only, needs-rerun, pending, ' +
  'and unknown are package outcomes unless they exactly match the original sprint success condition';
const CURRENT_EDGE_CARD_FIELD_PACKAGE = 'active package';
const CURRENT_EDGE_CARD_FIELD_ARTIFACT = 'artifact';
const CURRENT_EDGE_CARD_FIELD_OWNER = 'owner';
const CURRENT_EDGE_CARD_FIELD_BOUNDARY = 'boundary';
const CURRENT_EDGE_CARD_FIELD_DOMINANT_REASON = 'dominant reason';
const CURRENT_EDGE_CARD_FIELD_FRONTIER = 'current first frontier';
const CURRENT_EDGE_CARD_FIELD_NEXT_ACTION = 'next action';
const CURRENT_EDGE_CARD_LABEL_REPRESENTATIVE_ARTIFACT =
  'Representative artifact';
const CURRENT_EDGE_CARD_LABEL_VISIBLE_FIRST_FRONTIER =
  'Visible first frontier';
const CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE = 'Active package';
const CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE_OWNER = 'Active package owner';
const CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE_BOUNDARY =
  'Active package boundary';
const CURRENT_EDGE_CARD_LABEL_SELECTED_CAUSE = 'Selected cause';
const CURRENT_EDGE_CARD_LABEL_REQUIRED_ACTION = 'Required action';
const CURRENT_BLOCKER_THEORY_SECTION_HEADING =
  '## Theory And Implementation Focus';
const CURRENT_BLOCKER_IMPLEMENTATION_SCOPE_PATTERN =
  /^(?:src|test|scripts|reports|test-output)\//u;
const COMMIT_LEDGER_COMMIT_LABEL = 'Focused package commit';
const COMMIT_LEDGER_PUSH_TARGET_LABEL = 'Push target';
// Legacy alias: pre-F7 packages wrote `Pushed to: <remote>/<branch>` before
// the push actually happened. The field is now `Push target` (intent) plus
// an optional `Pushed: yes|no` line populated by `work:sprint:push` after
// the push succeeds. Validators accept either label for the URL value.
const COMMIT_LEDGER_PUSHED_LABEL = 'Pushed to';
const COMMIT_LEDGER_PUSHED_BOOLEAN_LABEL = 'Pushed';
const COMMIT_LEDGER_FOCUSED_SLICE_LABEL =
  'Commit contains only package-owned files/package-status/allowed sprint handoff';
const MODEL_FIT_PACKAGE_CLASS_LABEL = 'Package class';
const MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL = 'Intended minimum model';
const MODEL_FIT_SCOPE_SHAPE_LABEL = 'Scope shape';
const MODEL_FIT_OUTPUT_PROFILE_LABEL = 'Output profile';
const MODEL_FIT_OWNED_FILES_LABEL = 'Owned files';
const MODEL_FIT_FORBIDDEN_FILES_LABEL = 'Forbidden files';
const MODEL_FIT_DO_NOT_EDIT_SCOPE_LABEL = 'Do-not-edit scope';
const MODEL_FIT_FROZEN_DECISIONS_LABEL = 'Frozen decisions';
const MODEL_FIT_ESCALATION_TRIGGERS_LABEL = 'Escalation triggers';
const MODEL_FIT_FOCUSED_PROOF_LABEL = 'Focused proof';
const CAUSAL_DECISION_CONTRACT_TABLE_LABEL = 'Decision table';
const CAUSAL_DECISION_CONTRACT_ANTI_SYMPTOM_LABEL =
  'Anti-symptom rationale';
const CAUSAL_DECISION_CONTRACT_FALSIFYING_PROBE_LABEL =
  'Falsifying focused probe';
const CAUSAL_DECISION_CONTRACT_COMPETING_EXPLANATIONS_LABEL =
  'Competing explanations';
const CAUSAL_DECISION_CONTRACT_SYSTEMIC_INTERACTION_SCAN_LABEL =
  'Systemic interaction scan';
const CAUSAL_DECISION_CONTRACT_PING_PONG_STOP_RULE_LABEL =
  'Ping-pong stop rule';
const CAUSAL_DECISION_CONTRACT_OSCILLATION_GUARD_LABEL =
  'Oscillation guard';
const CAUSAL_DECISION_CONTRACT_TABLE_HEADER_PATTERN =
  /\|\s*Signal\s*\|\s*Normalized value\s*\|\s*Owner interpretation\s*\|\s*Emitted outcome\s*\|\s*Expected delta\s*\|\s*Disproof probe\s*\|/iu;
const CAUSAL_DECISION_CONTRACT_TABLE_ROW_PATTERN =
  /^\|\s*(?!\s*Signal\s*\|)(?!\s*-+\s*\|)[^|\n]+\|[^|\n]+\|[^|\n]+\|[^|\n]+\|[^|\n]+\|[^|\n]+\|\s*$/imu;
const GENERIC_CORE_LOGIC_MODEL_PATTERN =
  /\bCollect evidence,\s*normalize one\b[\s\S]{0,120}\bthen use one explicit state model,\s*decision table,\s*or invariant\b/iu;
const SPRINT_STRATEGY_BRIEF_GOAL_STATE_LABEL = 'Goal state';
const SPRINT_STRATEGY_BRIEF_CURRENT_CAUSAL_THESIS_LABEL =
  'Current causal thesis';
const SPRINT_STRATEGY_BRIEF_COMPETING_HYPOTHESES_LABEL =
  'Competing hypotheses';
const SPRINT_STRATEGY_BRIEF_CONFIDENCE_AND_EVIDENCE_LABEL =
  'Confidence and evidence';
const SPRINT_STRATEGY_BRIEF_EXPECTED_GREEN_PATH_LABEL = 'Expected green path';
const SPRINT_STRATEGY_BRIEF_WRONG_DIRECTION_SIGNALS_LABEL =
  'Wrong direction signals';
const SPRINT_STRATEGY_BRIEF_NEXT_BEST_PACKAGE_LABEL = 'Next best package';
const SPRINT_STRATEGY_BRIEF_STOP_OR_ESCALATE_RULE_LABEL =
  'Stop or escalate rule';
const SPRINT_STRATEGY_BRIEF_FIELDS = Object.freeze([
  SPRINT_STRATEGY_BRIEF_GOAL_STATE_LABEL,
  SPRINT_STRATEGY_BRIEF_CURRENT_CAUSAL_THESIS_LABEL,
  SPRINT_STRATEGY_BRIEF_COMPETING_HYPOTHESES_LABEL,
  SPRINT_STRATEGY_BRIEF_CONFIDENCE_AND_EVIDENCE_LABEL,
  SPRINT_STRATEGY_BRIEF_EXPECTED_GREEN_PATH_LABEL,
  SPRINT_STRATEGY_BRIEF_WRONG_DIRECTION_SIGNALS_LABEL,
  SPRINT_STRATEGY_BRIEF_NEXT_BEST_PACKAGE_LABEL,
  SPRINT_STRATEGY_BRIEF_STOP_OR_ESCALATE_RULE_LABEL,
]);
const THEORY_LOOP_SUCCESS_EVIDENCE_HEADING =
  '## Theory Loop Success Evidence';
const THEORY_LOOP_EVIDENCE_ANCHOR_HEADING = '## Evidence Anchor';
const THEORY_LOOP_SUCCESS_CONDITION_MET_LABEL = 'Success condition met';
const THEORY_LOOP_ORIGINAL_SUCCESS_CONDITION_LABEL = 'Success condition';
const THEORY_LOOP_MATCHED_SUCCESS_CONDITION_LABEL =
  'Matched success condition';
const THEORY_LOOP_FRESH_REPRESENTATIVE_EVIDENCE_LABEL =
  'Fresh representative evidence';
const THEORY_LOOP_RESULT_LABEL = 'Result';
const THEORY_LOOP_CONTINUATION_STOPPED_LABEL = 'Continuation stopped because';
const THEORY_LOOP_SUCCESS_RESULT_VALUE = 'success-condition-met';
const THEORY_LOOP_FORBIDDEN_SUCCESS_CONDITION_PATTERN =
  /\b(?:architecture[-\s]+gap|architecture[-\s]+stop|owner[-\s]+boundary[-\s]+migration|same[-\s]+frontier|classification[-\s]+only|needs[-\s]+rerun|route[-\s]+selection|human[-\s]+escalation)\b/iu;
const THEORY_LOOP_PACKAGE_RESULT_VALUES = Object.freeze([
  'fixed',
  'avoided',
  'supported',
  'falsified',
  'migrated',
  'representative-green',
  'architecture-gap',
  'needs-rerun',
]);
const THEORY_LOOP_UNFINISHED_RESULT_PATTERN =
  /\b(?:same-frontier|classification-only|needs-rerun|pending|unknown|not[-\s]+met)\b/iu;
const MODEL_FIT_SPARK_SAFE_CLASS = 'spark-safe';
const MODEL_FIT_SPARK_MODEL = 'gpt-5.3-codex-spark';
const MODEL_FIT_LEAF_SLICE_SCOPE = 'leaf-slice';
const METADATA_FIELD_OPENED = 'opened';
const METADATA_FIELD_CURRENT_STATE = 'currentState';
const METADATA_FIELD_PROOF = 'proof';
const METADATA_FIELD_ARTIFACT = 'artifact';
const METADATA_FIELD_PLAYBACK = 'playback';
const METADATA_FIELD_MODEL_FIT = 'modelFit';
const DEFAULT_THEORY_LEDGER_PATH = path.join('work', 'theory-ledger.md');
const THEORY_LEDGER_REF_PATTERN = /^theory-[0-9]{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const THEORY_LEDGER_RELATED_LIMIT = 5;
const MODEL_FIT_METADATA_PACKAGE_CLASS_FIELD = 'packageClass';
const MODEL_FIT_METADATA_INTENDED_MINIMUM_MODEL_FIELD =
  'intendedMinimumModel';
const MODEL_FIT_METADATA_SCOPE_SHAPE_FIELD = 'scopeShape';
const MODEL_FIT_METADATA_OUTPUT_PROFILE_FIELD = 'outputProfile';
const MODEL_FIT_METADATA_ESCALATION_TRIGGERS_FIELD = 'escalationTriggers';
const ACTIVE_PACKAGE_REQUIRED_TEXT_METADATA_FIELDS = Object.freeze([
  METADATA_FIELD_OPENED,
  METADATA_LANE_FIELD,
  METADATA_FIELD_CURRENT_STATE,
]);
const ACTIVE_SCENARIO_REQUIRED_TEXT_METADATA_FIELDS = Object.freeze([
  METADATA_FIELD_ARTIFACT,
  METADATA_FIELD_PLAYBACK,
  'dominantReason',
]);
const ACTIVE_SCENARIO_REQUIRED_ARRAY_METADATA_FIELDS = Object.freeze([
  METADATA_FIELD_PROOF,
  SCOPE_FIELD_WRITE_SCOPE,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
]);
const ACTIVE_SCENARIO_REQUIRED_MODEL_FIT_METADATA_FIELDS = Object.freeze([
  MODEL_FIT_METADATA_PACKAGE_CLASS_FIELD,
  MODEL_FIT_METADATA_INTENDED_MINIMUM_MODEL_FIELD,
  MODEL_FIT_METADATA_SCOPE_SHAPE_FIELD,
  MODEL_FIT_METADATA_OUTPUT_PROFILE_FIELD,
]);
const SCENARIO_NONE = 'none';
const SCENARIO_UNKNOWN = 'unknown';
const SCENARIO_TEMPLATE_VALUE = 'scenario-or-none';
const REPRESENTATIVE_RESIDUAL_METADATA_FIELD = 'representativeResidual';
const REPRESENTATIVE_RESIDUAL_STATUS_FIELD = 'status';
const REPRESENTATIVE_RESIDUAL_SCENARIO_FIELD = 'scenario';
const REPRESENTATIVE_RESIDUAL_ARTIFACT_FIELD = 'artifact';
const REPRESENTATIVE_RESIDUAL_FRONTIER_FIELD = 'frontier';
const REPRESENTATIVE_RESIDUAL_OWNER_FIELD = 'owner';
const REPRESENTATIVE_RESIDUAL_BOUNDARY_FIELD = 'boundary';
const REPRESENTATIVE_RESIDUAL_DOMINANT_REASON_FIELD = 'dominantReason';
const REPRESENTATIVE_RESIDUAL_NEXT_ACTION_FIELD = 'nextAction';
const REPRESENTATIVE_RESIDUAL_REQUIRED_FIELDS = Object.freeze([
  REPRESENTATIVE_RESIDUAL_STATUS_FIELD,
  REPRESENTATIVE_RESIDUAL_SCENARIO_FIELD,
  REPRESENTATIVE_RESIDUAL_ARTIFACT_FIELD,
  REPRESENTATIVE_RESIDUAL_FRONTIER_FIELD,
  REPRESENTATIVE_RESIDUAL_OWNER_FIELD,
  REPRESENTATIVE_RESIDUAL_BOUNDARY_FIELD,
  REPRESENTATIVE_RESIDUAL_DOMINANT_REASON_FIELD,
  REPRESENTATIVE_RESIDUAL_NEXT_ACTION_FIELD,
]);
const REPRESENTATIVE_RESIDUAL_LIVE_CLAIM_PATTERN =
  /\brepresentative\b(?:\s+\S+){0,16}\s+\b(?:remains?|stays?|still|live|open|red)\b|\b(?:remains?|stays?|still|live|open|red)\b(?:\s+\S+){0,16}\s+\brepresentative\b/iu;
const DIAGNOSTICS_CLASSIFICATION_METADATA_PATTERN =
  /\b(?:diagnostics|classification|residual_inventory|causal-escalation)\b/iu;
const CAUSAL_GOVERNANCE_METADATA_FIELD = 'causalGovernance';
const CAUSAL_GOVERNANCE_HYPOTHESIS_FIELD = 'hypothesis';
const CAUSAL_GOVERNANCE_STOP_CONDITION_FIELD = 'stopConditionCheck';
const CAUSAL_GOVERNANCE_EXPECTED_CHANGE_FIELD = 'expectedCausalModelChange';
const CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD =
  'representativeOutcome';
const CAUSAL_GOVERNANCE_CAUSAL_DEBT_FIELD = 'causalDebt';
const CAUSAL_GOVERNANCE_CROSS_BOUNDARY_REVIEW_FIELD = 'crossBoundaryReview';
const CAUSAL_GOVERNANCE_REQUIRED_FIELDS = Object.freeze([
  CAUSAL_GOVERNANCE_HYPOTHESIS_FIELD,
  CAUSAL_GOVERNANCE_STOP_CONDITION_FIELD,
  CAUSAL_GOVERNANCE_EXPECTED_CHANGE_FIELD,
  CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD,
  CAUSAL_GOVERNANCE_CAUSAL_DEBT_FIELD,
  CAUSAL_GOVERNANCE_CROSS_BOUNDARY_REVIEW_FIELD,
]);
const CLASSIFICATION_ONLY_RESULT = 'classification-only';
const CAUSAL_GOVERNANCE_CAUSAL_MODEL_COMMAND_PATTERN =
  /\bnpm\s+(?:--silent\s+)?run\s+analyze:causal-model\b/iu;
const SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD = 'scenarioCausalClosure';
const SCENARIO_CAUSAL_CLOSURE_REFERENCE_FIELD = 'referenceScenarioOrProbe';
const SCENARIO_CAUSAL_CLOSURE_PHASE_CHAIN_FIELD = 'phaseChain';
const SCENARIO_CAUSAL_CLOSURE_CURRENT_FRONTIER_FIELD = 'currentFirstFrontier';
const SCENARIO_CAUSAL_CLOSURE_DOWNSTREAM_BLOCKERS_FIELD =
  'knownDownstreamBlockers';
const SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_FIELD = 'missingCausalEdge';
const SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_PROBE_FIELD =
  'missingCausalEdgeProbe';
const SCENARIO_CAUSAL_CLOSURE_FALSIFYING_PROBE_FIELD =
  'falsifyingProbe';
const SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_FIELD = 'boundedProgressProof';
const SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_ARTIFACT_FIELD =
  'boundedProgressProofArtifact';
const SCENARIO_CAUSAL_CLOSURE_EXPECTED_OBSERVABLE_TRANSITION_FIELD =
  'expectedObservableTransition';
const SCENARIO_CAUSAL_CLOSURE_MAX_PROGRESS_BOUND_FIELD = 'maxProgressBound';
const SCENARIO_CAUSAL_CLOSURE_SAME_FRONTIER_FALLBACK_FIELD =
  'sameFrontierFallback';
const SCENARIO_CAUSAL_CLOSURE_EXPECTED_NEXT_FRONTIER_FIELD =
  'expectedNextFrontier';
const SCENARIO_CAUSAL_CLOSURE_RESULT_CLASSIFICATION_FIELD =
  'resultClassification';
const SCENARIO_CAUSAL_CLOSURE_STOP_CONDITION_FIELD = 'stopCondition';
const SCENARIO_CAUSAL_CLOSURE_TEXT_FIELDS = Object.freeze([
  SCENARIO_CAUSAL_CLOSURE_REFERENCE_FIELD,
  SCENARIO_CAUSAL_CLOSURE_CURRENT_FRONTIER_FIELD,
  SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_FIELD,
  SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_PROBE_FIELD,
  SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_FIELD,
  SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_ARTIFACT_FIELD,
  SCENARIO_CAUSAL_CLOSURE_EXPECTED_OBSERVABLE_TRANSITION_FIELD,
  SCENARIO_CAUSAL_CLOSURE_MAX_PROGRESS_BOUND_FIELD,
  SCENARIO_CAUSAL_CLOSURE_SAME_FRONTIER_FALLBACK_FIELD,
  SCENARIO_CAUSAL_CLOSURE_EXPECTED_NEXT_FRONTIER_FIELD,
  SCENARIO_CAUSAL_CLOSURE_RESULT_CLASSIFICATION_FIELD,
  SCENARIO_CAUSAL_CLOSURE_STOP_CONDITION_FIELD,
]);
const SCENARIO_CAUSAL_CLOSURE_ARRAY_FIELDS = Object.freeze([
  SCENARIO_CAUSAL_CLOSURE_PHASE_CHAIN_FIELD,
  SCENARIO_CAUSAL_CLOSURE_DOWNSTREAM_BLOCKERS_FIELD,
]);
const SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_ARRAY_FIELDS =
  Object.freeze([
    SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD,
  ]);
const SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_TEXT_FIELDS =
  Object.freeze([
    SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD,
    SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD,
  ]);
const FRONTIER_OSCILLATION_RECENT_HISTORY_LIMIT = NUM_FOUR;
const FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT = NUM_TWO;
const FRONTIER_OSCILLATION_SEQUENCE_MINIMUM = NUM_THREE;
const FRONTIER_OSCILLATION_DATE_DASH_PATTERN =
  /\b(20\d{2})-(\d{2})-(\d{2})\b/u;
const FRONTIER_OSCILLATION_DATE_COMPACT_PATTERN = /\b(20\d{6})\b/u;
const FRONTIER_OSCILLATION_MATERIAL_RESULTS = Object.freeze([
  'migrated',
  'same-frontier',
  'reduced',
  'classification-only',
]);
const BOUNDARY_FAMILY_OSCILLATION = Object.freeze([
  'publication_convergence',
  'active_gate_snapshot_coverage',
  'readiness_support',
  'operation_workflow_handoff',
]);
const REPRESENTATIVE_MOVEMENT_RESULTS = Object.freeze([
  'representative-green',
  'reduced',
  'migrated',
]);
const RERUN_DECISION_REQUIRED_COMMAND_PATTERNS = Object.freeze([
  /\bwork:package:route-after-rerun\b/iu,
  /\bSprint Strategy Brief\b/iu,
  /\bCurrent Edge Card\b/iu,
  /\b(?:work:repair|work:current-blocker)\b/iu,
  /\bwork:validate\b[\s\S]*\bentry\b/iu,
  /\bwork:validate\b[\s\S]*\bpre-impl\b/iu,
]);
const SAME_FRONTIER_RESULT = 'same-frontier';
const SAME_FRONTIER_HUMAN_EXCEPTION_PATTERN =
  /\b(?:contradict|policy|credential|permission|unavailable|blocked|evidence-incomplete|human-only|manual-only)\b/iu;
const SAME_FRONTIER_RUNTIME_SUCCESSOR_LANES = Object.freeze([
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SINGLE_FILE_RUNTIME,
]);
const REPRESENTATIVE_MOVEMENT_PREDICTION_PATTERN =
  /\b(?:representative[-\s]+green|green|reduced?|reduces|reducing|reduction|migrated?|migration|moves?|frontier moved|owner-boundary migration|count\s*[:=]?\s*\d+\s*->\s*\d+|->)\b/iu;
const REPRESENTATIVE_CLASSIFICATION_ONLY_PATTERN =
  /^\s*classify whether\b/iu;
const SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISM_PATTERN =
  /\b(?:wake|retry|timeout|reconcile|drain|dispatch|delivery|timer|advance|bounded)\b/iu;
const SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN = new RegExp(
  '(?:^|[\\s`\'"])(?:[A-Za-z0-9._-]+/[A-Za-z0-9._/@%+=,-]+|' +
    '[A-Za-z0-9._@%+=,-]+\\.(?:json|md|txt|log|tap|js|mjs|cjs))' +
    '(?:$|[\\s`\'".,;])',
  'u',
);
const PLACEHOLDER_ARTIFACT_PATH = 'test-output/report.json';
const PACKAGE_SCAFFOLD_POLICY_OPENED_ON_OR_AFTER = '2026-05-27';
const PACKAGE_SCAFFOLD_PLACEHOLDER_PATTERNS = Object.freeze([
  {
    label: 'generic Why placeholder',
    pattern: /\bState the focused concern and why this package owns it\./iu,
  },
  {
    label: 'generic Scope Basis placeholder',
    pattern: /\bApproved maintenance scope or roadmap row\./iu,
  },
  {
    label: 'schema scaffold current-state text',
    pattern: /\bNew package scaffolded from the shared work-package schema\./iu,
  },
  {
    label: 'representative scaffold current-state text',
    pattern: /\bScaffolded from representative evidence\b/iu,
  },
  {
    label: 'generic emitted package outcome',
    pattern: /\bemits the package outcome\b/iu,
  },
  {
    label: 'template package path',
    pattern: /\bwork\/packages\/<this-package>\.md\b/iu,
  },
  {
    label: 'template workflow command',
    pattern: /\bnpm run work:[^`\n]*<(?:artifact|package|owner|role)[^>]*>/iu,
  },
  {
    label: 'template execution owner',
    pattern: /\bowner:\s*<owner>/iu,
  },
  {
    label: 'template changed files',
    pattern: /\bfiles-changed:\s*<paths or none>/iu,
  },
  {
    label: 'template validation field',
    pattern: /\bvalidation:\s*<[^>]+>/iu,
  },
  {
    label: 'template outcome field',
    pattern: /\boutcome:\s*<[^>]+>/iu,
  },
  {
    label: 'template token',
    pattern: /<(?:owner|package|artifact|paths or none|role|this-package)>/iu,
  },
]);
const ARCHITECTURE_DECISION_GATE_FIELD = 'architectureDecisionGate';
const ARCHITECTURE_DECISION_GATE_STATUS_NOT_REQUIRED = 'not-required';
const ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED = 'required';
const ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED = 'presented';
const ARCHITECTURE_DECISION_GATE_STATUS_SELECTED = 'selected';
const ARCHITECTURE_DECISION_GATE_STATUS_WATCHING = 'watching';
const ARCHITECTURE_DECISION_GATE_TRIGGER_NONE = 'none';
const ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP =
  'architecture-gap';
const ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION =
  'frontier-oscillation';
const ARCHITECTURE_DECISION_GATE_ROUTE_CONTINUE_LOCAL_PROOF =
  'continue-local-proof';
const ARCHITECTURE_DECISION_GATE_ROUTE_OWNER_BOUNDARY_MIGRATION =
  'owner-boundary-migration';
const ARCHITECTURE_DECISION_GATE_ROUTE_ARCHITECTURE_PACKAGE =
  'architecture-package';
const ARCHITECTURE_DECISION_GATE_ROUTE_HUMAN_ESCALATION =
  'human-escalation';
const ARCHITECTURE_DECISION_GATE_STATUSES = Object.freeze([
  ARCHITECTURE_DECISION_GATE_STATUS_NOT_REQUIRED,
  ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED,
  ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED,
  ARCHITECTURE_DECISION_GATE_STATUS_SELECTED,
  ARCHITECTURE_DECISION_GATE_STATUS_WATCHING,
]);
const ARCHITECTURE_DECISION_GATE_TRIGGERS = Object.freeze([
  ARCHITECTURE_DECISION_GATE_TRIGGER_NONE,
  ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
  ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION,
]);
const ARCHITECTURE_DECISION_GATE_ROUTES = Object.freeze([
  ARCHITECTURE_DECISION_GATE_ROUTE_CONTINUE_LOCAL_PROOF,
  ARCHITECTURE_DECISION_GATE_ROUTE_OWNER_BOUNDARY_MIGRATION,
  ARCHITECTURE_DECISION_GATE_ROUTE_ARCHITECTURE_PACKAGE,
  ARCHITECTURE_DECISION_GATE_ROUTE_HUMAN_ESCALATION,
]);
const ARCHITECTURE_DECISION_GATE_CHOICE_ID_LOCAL_PROOF =
  'continue-local-proof';
const ARCHITECTURE_DECISION_GATE_CHOICE_ID_MIGRATE_OWNER =
  'migrate-owner-boundary';
const ARCHITECTURE_DECISION_GATE_CHOICE_ID_ARCHITECTURE_PACKAGE =
  'open-architecture-package';
const ARCHITECTURE_DECISION_GATE_CHOICE_ID_HUMAN_ESCALATION =
  'human-escalation';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_PRESENT =
  'Select an autonomous architecture experiment unless evidence is contradictory or blocked.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_SELECT =
  'Select an architecture route before runtime implementation; default to an architecture package.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_WATCH =
  'Watch for repeated frontier oscillation; open an autonomous architecture experiment if another local proof returns here unchanged.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_LOCAL_PROOF =
  'Execute the selected local proof route; rerun canonical evidence before opening another architecture gate.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_OWNER_MIGRATION =
  'Execute the selected owner-boundary migration route before local runtime proof continues.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_ARCHITECTURE_PACKAGE =
  'Open the autonomous architecture experiment package before runtime implementation resumes.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_HUMAN_ESCALATION =
  'Stop for the recorded human escalation route before implementation continues.';
const OBSERVABLE_PREDICTION_ACCURACY_PENDING = 'pending-before-observation';
const OBSERVABLE_PREDICTION_ACCURACY_MATCHED = 'matched';
const OBSERVABLE_PREDICTION_ACCURACY_PARTIAL = 'partial';
const OBSERVABLE_PREDICTION_ACCURACY_MISSED = 'missed';
const OBSERVABLE_PREDICTION_ACCURACY_CONTRADICTED = 'contradicted';
const OBSERVABLE_PREDICTION_ACCURACIES = Object.freeze([
  OBSERVABLE_PREDICTION_ACCURACY_PENDING,
  OBSERVABLE_PREDICTION_ACCURACY_MATCHED,
  OBSERVABLE_PREDICTION_ACCURACY_PARTIAL,
  OBSERVABLE_PREDICTION_ACCURACY_MISSED,
  OBSERVABLE_PREDICTION_ACCURACY_CONTRADICTED,
]);
const CLOSURE_SUMMARY_PENDING_VALUE_PATTERN =
  /^(?:pending(?:\s+closure)?|pending-before-(?:probe|observation))$/iu;
const EXPERIMENT_OUTCOME_DECISION_OPEN_RUNTIME = 'open-runtime-owner-boundary';
const EXPERIMENT_OUTCOME_DECISION_OPEN_ARCHITECTURE =
  'open-architecture-experiment';
const EXPERIMENT_OUTCOME_DECISION_OPEN_ARCHITECTURE_CONTRACT =
  'open-architecture-contract';
const EXPERIMENT_OUTCOME_DECISION_OWNER_MIGRATION =
  'owner-boundary-migration';
const EXPERIMENT_OUTCOME_DECISION_HUMAN_ESCALATION = 'human-escalation';
const EXPERIMENT_OUTCOME_DECISION_EVIDENCE_INCOMPLETE =
  'evidence-incomplete';
const EXPERIMENT_OUTCOME_DECISIONS = Object.freeze([
  EXPERIMENT_OUTCOME_DECISION_OPEN_RUNTIME,
  EXPERIMENT_OUTCOME_DECISION_OPEN_ARCHITECTURE,
  EXPERIMENT_OUTCOME_DECISION_OPEN_ARCHITECTURE_CONTRACT,
  EXPERIMENT_OUTCOME_DECISION_OWNER_MIGRATION,
  EXPERIMENT_OUTCOME_DECISION_HUMAN_ESCALATION,
  EXPERIMENT_OUTCOME_DECISION_EVIDENCE_INCOMPLETE,
]);
const EXPERIMENT_OUTCOME_INCOMPLETE_HYPOTHESIS =
  'evidence-incomplete';
const MODEL_FIT_EMPTY_VALUE_PATTERN = /^(?:none|n\/a|na|unknown|tbd|todo)$/iu;
const MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN = new RegExp(
  '\\b(?:npm\\s+(?:--silent\\s+)?run|npm\\s+test|' +
    'node(?:\\s+--test)?|tap|rg|git\\s+diff)\\b',
  'iu',
);
const TWO_LEVEL_THEORY_MECHANISM_PATTERN =
  /\b(?:observation_gap|selection_gap|admission_gap|transition_gap|scheduling_gap|budget_gap|concurrency_gap|contract_gap|ownership_gap|downstream_symptom|coupled_invariants|emergent_oscillation|protocol_mismatch|feedback_amplification)\b/iu;
const TWO_LEVEL_THEORY_EMERGENT_MECHANISM_PATTERN =
  /\b(?:coupled_invariants|emergent_oscillation|protocol_mismatch|feedback_amplification)\b/iu;
const TWO_LEVEL_THEORY_SCORE_PATTERN = /\b(?:high|medium|low)\b/iu;
const MODEL_FIT_REQUIRED_SPARK_LABELS = Object.freeze([
  MODEL_FIT_OWNED_FILES_LABEL,
  MODEL_FIT_FORBIDDEN_FILES_LABEL,
  MODEL_FIT_FROZEN_DECISIONS_LABEL,
  MODEL_FIT_ESCALATION_TRIGGERS_LABEL,
  MODEL_FIT_FOCUSED_PROOF_LABEL,
]);
const DECISION_EXPERIMENT_DECISION_QUESTION_LABEL = 'Decision question';
const DECISION_EXPERIMENT_ARCHITECTURE_REVIEW_LABEL =
  'Architecture review';
const DECISION_EXPERIMENT_COMPETING_HYPOTHESES_LABEL =
  'Competing hypotheses';
const DECISION_EXPERIMENT_PRE_EDIT_PROBE_LABEL = 'Pre-edit focused probe';
const DECISION_EXPERIMENT_SUCCESS_METRICS_LABEL = 'Success metrics';
const DECISION_EXPERIMENT_REPRESENTATIVE_RERUN_LABEL =
  'Representative rerun';
const DECISION_EXPERIMENT_KILL_RULE_LABEL = 'Kill rule';
const DECISION_EXPERIMENT_FIELDS = Object.freeze([
  DECISION_EXPERIMENT_DECISION_QUESTION_LABEL,
  DECISION_EXPERIMENT_ARCHITECTURE_REVIEW_LABEL,
  DECISION_EXPERIMENT_COMPETING_HYPOTHESES_LABEL,
  DECISION_EXPERIMENT_PRE_EDIT_PROBE_LABEL,
  DECISION_EXPERIMENT_SUCCESS_METRICS_LABEL,
  DECISION_EXPERIMENT_REPRESENTATIVE_RERUN_LABEL,
  DECISION_EXPERIMENT_KILL_RULE_LABEL,
]);
const DECISION_EXPERIMENT_ARCHITECTURE_REVIEW_PATTERN =
  /\b(?:architecture|owner|boundary|contract|human|route)\b/iu;
const DECISION_EXPERIMENT_SUCCESS_METRIC_PATTERN =
  /\b(?:reduce|reduced|reduction|migrate|migration|green|count|metric|frontier|representative)\b/iu;
const DECISION_EXPERIMENT_KILL_RULE_PATTERN =
  /\b(?:stop|escalat|architecture|human|same-frontier|no-reduction|unchanged)\b/iu;
const MODEL_FIT_OPEN_ENDED_FRONTIER_PATTERNS = Object.freeze([
  /\bopen-ended\s+frontier\b/iu,
  /\b(?:any|unknown|whatever|unbounded)\s+frontier\b/iu,
  /\b(?:find|discover|explore|chase|investigate|fix)\s+(?:(?:a|the|any)\s+)?(?:new|next|fresh)?\s*frontier\b/iu,
  /\bfrontier\s+(?:appears|emerges|wherever|whatever)\b/iu,
  /\brepresentative\b[\s\S]{0,120}\b(?:expand|broaden|continue|chase|fix)\b[\s\S]{0,80}\bscope\b/iu,
]);
const CORE_LOGIC_BRIEF_NOT_NEEDED_PATTERN = /\bnot-needed\b/iu;
const IMPLEMENTATION_WRITE_PATH_PATTERN =
  /^(?:src|test|scripts|test-output\/reports|test-output\/.*\.report\.json)\b/u;
const STATIC_GUARDRAIL_COMMAND_PATTERN =
  /\b(?:check-guideline|audit:runtime-grammar|check-runtime-grammar|guard:guideline)\b/iu;
const REPRESENTATIVE_EVIDENCE_COMMAND_PATTERN =
  /\b(?:test\/distributed\/run\.js|distributed:|work:evidence-summary|work:scenario-triage|summarize:harness)\b/iu;
const ARCHITECTURE_GATE_SELECTED_STATUS = 'selected';
const PROOF_COMMAND_CAP = NUM_FIVE;
const CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP = NUM_THREE;
const CLASSIFICATION_EFFICIENCY_STABLE_ROUTE_OUTCOME =
  'continue_local_fix';
const CLASSIFICATION_EFFICIENCY_STABLE_ROUTE_STOP =
  'classified_local_blocker';
const CLASSIFICATION_EFFICIENCY_RUNTIME_SUCCESSOR_ACTION =
  'open-runtime-owner-boundary';
const CLASSIFICATION_EFFICIENCY_ONE_ARTIFACT_PATTERN = /\bone-artifact\b/iu;
const CLASSIFICATION_EFFICIENCY_COMMAND_BUDGET_PATTERN =
  /\btwo-or-three-canonical-commands\b/iu;
const CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_PATTERN =
  /\bruntime-owner-boundary\b/iu;
const CHECKBOX_DONE_PREFIX_PATTERN = '(?:-|\\d+\\.) \\[[xX]\\] ';
const CHECKBOX_ANY_ITEM_PATTERN = /\n(?:-|\d+\.) \[[ xX]\] /gu;
const CHECKBOX_ITEM_PRESENT_PATTERN = /(?:^|\n)(?:-|\d+\.) \[[ xX]\] /u;
const CHECKBOX_CHECKED_ITEM_PATTERN =
  /(?:^|\n)((?:-|\d+\.) \[[xX]\] [\s\S]*?)(?=\n(?:-|\d+\.) \[[ xX]\] |\s*$)/gu;
const LEDGER_VALIDATION_REQUIRES_LEDGER = 'requiresLedger';
const LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES = 'requiresStrictEntries';
const LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER =
  'allowPendingSubagentLedger';
const LEDGER_VALIDATION_ALLOW_PENDING_COMMIT_LEDGER =
  'allowPendingCommitLedger';
const LEDGER_VALIDATION_ALLOW_MISSING_HISTORICAL_COMMIT_LEDGER =
  'allowMissingHistoricalCommitLedger';
const METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED =
  'commitAndPushLedgerRequired';
const LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER =
  'pending-before-implementation-resumes';
const LEDGER_TEMPLATE_PLACEHOLDER_PATTERN = /<[^>\n]+>/u;
const LEDGER_MARKDOWN_CODE_DELIMITER = '`';
const LEDGER_FIELD_TRAILING_PUNCTUATION_PATTERN = /[.;]\s*$/u;
const EMPTY_PROOF_CLI_VALUE_PATTERN =
  /\s--(?:artifact|output)\s+(?:""|'')(?=\s|$)/u;
const MALFORMED_REPORT_ARTIFACT_PATTERN = /\S+-\.report\.json\b/iu;
const CONCRETE_SOURCE_FILE_PATTERN = /^src\/[^*?\n]+\.js$/u;
const THEORY_LOOP_NON_EXECUTABLE_CONTRACT_PATTERN =
  /\b(?:do\s+not\s+edit(?:\s+new)?\s+source|source\s+changes?\s+stay\s+blocked|metadata\s+pass|route-only|evidence-only|classification-only|package-only|successor-creation-only|creating\s+(?:a\s+)?new\s+package|create\s+(?:or\s+link\s+)?(?:the\s+)?successor\s+package\s+without\s+source)\b/iu;
const AGENT_ID_PATTERN_TEXT =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const AGENT_PROOF_PATTERN_TEXT =
  'Agent\\s+([^()]+?)\\s+\\(`?(' + AGENT_ID_PATTERN_TEXT + ')`?\\)';
const AGENT_PROOF_PATTERN_TEXT_RE = new RegExp(AGENT_PROOF_PATTERN_TEXT, 'iu');
const SUBAGENT_REVIEW_RESULT_CLEAN = 'clean';
const SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED = 'fixes-required';
const SUBAGENT_FIX_NOT_NEEDED = 'not-needed';
const SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY =
  'review-fixed-metadata-only';
const SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE =
  'first-package-in-sprint';
const SUBAGENT_REVIEW_PATTERN = new RegExp(
  AGENT_PROOF_PATTERN_TEXT + '\\s+reviewed\\s+`?([^;`]+)`?\\s*;\\s*' +
    'result\\s+`?(' + SUBAGENT_REVIEW_RESULT_CLEAN + '|' +
    SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED + ')`?',
  'iu',
);
const SUBAGENT_FIX_PATTERN = new RegExp(
  AGENT_PROOF_PATTERN_TEXT + '\\s+fixed\\s+`?([^;`]+)`?(?:[.;]|$)',
  'iu',
);
const SUBAGENT_IMPLEMENTATION_PATTERN = new RegExp(
  AGENT_PROOF_PATTERN_TEXT + '\\s+implemented\\s+`?([^;`]+)`?(?:[.;]|$)',
  'iu',
);
const SUBAGENT_FIX_REVIEW_FIXED_PACKAGE_PATTERN =
  /\b(?:for|on)\s+`?([^;`]+)`?/iu;
const SUBAGENT_FIX_REVIEW_FIXED_METADATA_SCOPE_FIELD_PATTERN =
  /\bscope:\s*([^.;]+)/iu;
const SUBAGENT_FIX_REVIEW_FIXED_METADATA_SCOPE_PATTERN =
  /\b(?:metadata-only|package\s+metadata|sprint\s+metadata|tracker|handoff|current-blocker|ledger)\b/iu;
const SUBAGENT_PARENT_REVALIDATION_PATTERN =
  /\b(?:parent\s+revalidated\s+(?:focused\s+)?proof|parent\s+validation)\s*:\s*`?yes`?/iu;
const NON_REAL_IDENTITY_PATTERN =
  /\b(?:current-session|current session|parent\s+codex|manual\s+(?:parent\s+)?codex|local\s+session|session\s+identity|agent\s+codex(?:\s+(?:review|fix|implementation))?|codex\s+(?:review|fix|implementation)(?:\s+(?:agent|subagent|session))?)\b/iu;
const FILE_PATH_TOKEN_PATTERN = /\S*\/\S+/gu;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/iu;
const REMOTE_BRANCH_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/u;
const LEDGER_YES_VALUE = 'yes';
const NEWLINE = '\n';
const GENERATED_NOTE = '<!-- Generated by scripts/work-tracker.js. -->';
const CLI_FLAG_ALL = '--all';
const CLI_FLAG_WRITE = '--write';
const CLI_FLAG_STATUS = '--status';
const CLI_FLAG_TO = '--to';
const CLI_FLAG_SUCCESSOR = '--successor';
const CLI_FLAG_SUGGEST = '--suggest';
const CLI_FLAG_FIX_DRY_RUN = '--fix-dry-run';
const CLI_FLAG_ENTRY = '--entry';
const CLI_FLAG_PROBE = '--probe';
const CLI_FLAG_PRE_IMPL = '--pre-impl';
const CLI_FLAG_CLOSURE = '--closure';
const CLI_FLAG_TRANSACTION = '--transaction';
const CLI_COMMAND_CURRENT_BLOCKER = 'current-blocker';
const CLI_COMMAND_REPAIR = 'repair';
const CLI_COMMAND_VALIDATE = 'validate';
const CLI_COMMAND_DOCTOR = 'doctor';
const CLI_COMMAND_CLOSE = 'close';
const CLI_COMMAND_MIGRATE = 'migrate';
const CLI_COMMAND_MOVE = 'move';
const ERROR_NO_ACTIVE_PACKAGE = 'No active work package was found.';
const ERROR_NO_ACTIVE_SPRINT = 'No active sprint file was found.';
const DEFAULT_UNKNOWN = 'unknown';
const PROBE_PACKAGE_MAX_MARKDOWN_LINES = 30;
const PROBE_PACKAGE_EXECUTION_EVIDENCE_HEADING_PATTERN =
  /^## Execution Evidence\b/imu;
const COMPACT_PROBE_PACKAGE_CLASS = 'compact-probe';
const REQUIRED_PRE_IMPL_PROBE_FIELD = 'requiredPreImplProbe';
const REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD = 'command';
const REQUIRED_PRE_IMPL_PROBE_ARTIFACT_FIELD = 'artifact';
const REQUIRED_PRE_IMPL_PROBE_REASON_FIELD = 'reason';
const DOCTOR_SUGGESTION_NONE =
  'No deterministic suggestions are available for these findings.';
const LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION = 'allowOpenImplementation';
const LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS =
  'allowUnavailableSubagents';
const LEDGER_VALIDATION_REQUIRES_VERIFICATION_FIX = 'requiresVerificationFix';
const LEDGER_VALIDATION_REQUIRES_FRESHNESS_REVIEW = 'requiresFreshnessReview';
const SUBAGENT_UNAVAILABLE_REASON_PATTERN = /\breason\s*:\s*\S+/iu;
const SUBAGENT_PROGRESS_EVIDENCE_FIELD_PATTERN = /\bevidence\s*:/iu;
const SUBAGENT_PROGRESS_NEXT_OR_BLOCKER_FIELD_PATTERN =
  /\b(?:next|blocker)\s*:/iu;
const EXECUTION_EVIDENCE_CHANGED_FILES_FIELD_PATTERN =
  /\bchanged files\s*:/iu;
const EXECUTION_EVIDENCE_FILES_CHANGED_FIELD_PATTERN =
  /\bfiles-changed\s*:/iu;
const EXECUTION_EVIDENCE_ACTION_FIELD_PATTERN = /\baction\s*:/iu;
const EXECUTION_EVIDENCE_OWNER_FIELD_PATTERN = /\bowner\s*:/iu;
const EXECUTION_EVIDENCE_VALIDATION_FIELD_PATTERN = /\bvalidation\s*:/iu;
const EXECUTION_EVIDENCE_OUTCOME_FIELD_PATTERN = /\boutcome\s*:/iu;
const SUBAGENT_ATTEMPT_STATUS_PATTERN =
  /\bstatus\s*:\s*`?([a-z-]+)`?/iu;
const SUBAGENT_ATTEMPT_LAST_CHECKPOINT_FIELD_PATTERN =
  /\blast checkpoint\s*:/iu;
const SUBAGENT_ATTEMPT_PARENT_ACTION_PATTERN =
  /\bparent action\s*:\s*`?([a-z-]+)`?/iu;
const SUBAGENT_ATTEMPT_PARENT_ACTIONS = Object.freeze([
  'accepted',
  'discarded',
  'pending',
  'revalidated',
  'superseded',
]);
const SUBAGENT_ATTEMPT_OPEN_STATUSES = Object.freeze([
  'started',
  'running',
]);
const SUBAGENT_ATTEMPT_UNVALIDATED_STATUSES = Object.freeze([
  'interrupted',
  'partial-unvalidated',
]);
const SUBAGENT_ATTEMPT_VALIDATED_STATUS = 'validated';
const SUBAGENT_ATTEMPT_SUPERSEDED_STATUS = 'superseded';
const EXECUTION_EVIDENCE_IMPLEMENTATION_PATTERN =
  /(?:^(?:-\s*)?\[[xX]\]\s*(?:action\s*:\s*)?implementation\b|\baction\s*:\s*implementation\b)/iu;
const EXECUTION_EVIDENCE_VERIFICATION_FIX_PATTERN =
  /(?:^(?:-\s*)?\[[xX]\]\s*(?:action\s*:\s*)?verification-fix\b|\baction\s*:\s*verification-fix\b)/iu;
const EXECUTION_EVIDENCE_FRESHNESS_REVIEW_PATTERN =
  /(?:^(?:-\s*)?\[[xX]\]\s*(?:action\s*:\s*)?freshness-review\b|\baction\s*:\s*freshness-review\b)/iu;
const EXECUTION_EVIDENCE_FRESHNESS_REVIEW_DECISION_PATTERN =
  /\b(?:freshness\s+decision|decision)\s*:\s*`?fresh`?/iu;
const EXECUTION_EVIDENCE_TERMINAL_STATUS_PATTERN =
  /\bstatus\s*:\s*`?(?:validated|passed|green|success|done|superseded)`?/iu;
const EXECUTION_EVIDENCE_TERMINAL_OUTCOME_PATTERN =
  /\boutcome\s*:\s*`?(?:validated|passed|green|success|done|superseded)`?/iu;
const VERIFICATION_FIX_SCOPE_PATTERN =
  /^(?:src|test|scripts|work)\//u;
const SUBAGENT_ATTEMPT_PARENT_TERMINAL_ACTIONS = Object.freeze([
  'discarded',
  'revalidated',
  'superseded',
]);
const BOUNDED_EXPERIMENT_CONCRETE_FIELDS = Object.freeze([
  BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD,
  BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD,
  BOUNDED_EXPERIMENT_TIMEBOX_FIELD,
  BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD,
  BOUNDED_EXPERIMENT_KILL_RULE_FIELD,
]);

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/work-tracker.js current-blocker [--write]',
    '  node scripts/work-tracker.js validate [--entry|--probe|--pre-impl|--closure] [--all] [paths...]',
    '  node scripts/work-tracker.js doctor [package]',
    '  node scripts/work-tracker.js close <package> [--write] [--transaction]',
    '  node scripts/work-tracker.js migrate <package> <successor> [--write] [--transaction]',
    '  node scripts/work-tracker.js move <package> --to <status> [--write] [--transaction]',
  ].join(NEWLINE));
}

function normalizeRelativePath(filePath) {
  return path.relative(process.cwd(), path.resolve(process.cwd(), filePath));
}

function getBaseName(filePath) {
  return path.basename(filePath);
}

function getPackageStatusFromPath(filePath) {
  const fileName = getBaseName(filePath);
  const match = fileName.match(PACKAGE_STATUS_PATTERN);
  return match ? match[NUM_ONE] : null;
}

function getSprintStatusFromPath(filePath) {
  const fileName = getBaseName(filePath);
  const match = fileName.match(SPRINT_STATUS_PATTERN);
  return match ? match[NUM_ONE] : null;
}

function hasOpenChecklist(content) {
  return CHECKBOX_OPEN_PATTERN.test(content);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractMarkdownLevelTwoSection(content, heading) {
  const headingPattern = new RegExp(
    `(^|${NEWLINE})${escapeRegExp(heading)}(?:${NEWLINE}|$)`,
    'u',
  );
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch) {
    return null;
  }
  const headingIndex = headingMatch.index +
    (headingMatch[NUM_ONE] === NEWLINE ? NUM_ONE : NUM_ZERO);
  const nextHeadingIndex = content.indexOf(
    `${NEWLINE}${MARKDOWN_LEVEL_TWO_HEADING_PREFIX}`,
    headingIndex + heading.length,
  );
  return nextHeadingIndex < NUM_ZERO ?
    content.slice(headingIndex) :
    content.slice(headingIndex, nextHeadingIndex);
}

function extractSubagentSequencingLedger(content) {
  return extractMarkdownLevelTwoSection(content, SUBAGENT_LEDGER_HEADING);
}

export function extractExecutionEvidenceLedger(content) {
  return extractMarkdownLevelTwoSection(content, EXECUTION_EVIDENCE_HEADING);
}

function extractSubagentProgressLedger(content) {
  return extractMarkdownLevelTwoSection(
    content,
    SUBAGENT_PROGRESS_LEDGER_HEADING,
  ) || extractMarkdownLevelTwoSection(
    content,
    SUBAGENT_COMBINED_PROGRESS_ATTEMPT_LEDGER_HEADING,
  );
}

function extractSubagentAttemptLedger(content) {
  return extractMarkdownLevelTwoSection(
    content,
    SUBAGENT_ATTEMPT_LEDGER_HEADING,
  ) || extractMarkdownLevelTwoSection(
    content,
    SUBAGENT_COMBINED_PROGRESS_ATTEMPT_LEDGER_HEADING,
  );
}

function extractCommitAndPushLedger(content) {
  for (const heading of COMMIT_AND_PUSH_LEDGER_HEADINGS) {
    const ledger = extractMarkdownLevelTwoSection(content, heading);
    if (ledger) {
      return ledger;
    }
  }
  return null;
}

function extractModelFitSection(content) {
  return extractMarkdownLevelTwoSection(content, MODEL_FIT_HEADING);
}

function extractCoreLogicBriefSection(content) {
  return extractMarkdownLevelTwoSection(content, CORE_LOGIC_BRIEF_HEADING);
}

function extractCausalDecisionContractSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    CAUSAL_DECISION_CONTRACT_HEADING,
  );
}

function extractDecisionExperimentGateSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    DECISION_EXPERIMENT_GATE_HEADING,
  );
}

function extractSprintStrategyBriefSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    SPRINT_STRATEGY_BRIEF_HEADING,
  );
}

function extractTheoryLoopEvidenceAnchorSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    THEORY_LOOP_EVIDENCE_ANCHOR_HEADING,
  );
}

function extractTheoryLoopSuccessEvidenceSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    THEORY_LOOP_SUCCESS_EVIDENCE_HEADING,
  );
}

function extractCurrentEdgeCardSection(content) {
  return extractMarkdownLevelTwoSection(content, CURRENT_EDGE_CARD_HEADING);
}

function extractLegacyCurrentNextActionSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    LEGACY_CURRENT_NEXT_ACTION_HEADING,
  );
}

function findCheckedSubagentLedgerEntry(ledger, label) {
  const checkedLabelPattern = new RegExp(
    `${CHECKBOX_DONE_PREFIX_PATTERN}${escapeRegExp(label)}:`,
    'u',
  );
  const match = checkedLabelPattern.exec(ledger);
  if (!match) {
    return null;
  }
  const itemStart = match.index;
  CHECKBOX_ANY_ITEM_PATTERN.lastIndex = itemStart + match[NUM_ZERO].length;
  const nextItemMatch = CHECKBOX_ANY_ITEM_PATTERN.exec(ledger);
  const nextItemIndex = nextItemMatch?.index ?? NUM_ZERO - NUM_ONE;
  const content = nextItemIndex < NUM_ZERO ?
    ledger.slice(itemStart) :
    ledger.slice(itemStart, nextItemIndex);
  return {
    content,
    index: itemStart,
  };
}

function findOpenSubagentLedgerEntry(ledger, label) {
  const openLabelPattern = new RegExp(
    `(?:-|\\d+\\.) \\[ \\] ${escapeRegExp(label)}:`,
    'u',
  );
  return openLabelPattern.test(ledger);
}

function hasOnlyOpenImplementationChecklist(ledger) {
  const openLabels = SUBAGENT_LEDGER_REQUIRED_LABELS.filter((label) =>
    findOpenSubagentLedgerEntry(ledger, label));
  return openLabels.length === NUM_ONE &&
    openLabels[NUM_ZERO] === SUBAGENT_LEDGER_IMPLEMENTATION_LABEL;
}

function findSubagentUnavailableState(content) {
  const normalizedContent = normalizeLedgerText(content).toLowerCase();
  const state = SUBAGENT_UNAVAILABLE_STATES.find((candidateState) =>
    normalizedContent.includes(candidateState));
  if (!state || !SUBAGENT_UNAVAILABLE_REASON_PATTERN.test(normalizedContent)) {
    return null;
  }
  return state;
}

export function extractCheckedChecklistItems(ledger) {
  const items = [];
  CHECKBOX_CHECKED_ITEM_PATTERN.lastIndex = NUM_ZERO;
  let match = CHECKBOX_CHECKED_ITEM_PATTERN.exec(ledger);
  while (match) {
    items.push(normalizeLedgerText(match[NUM_ONE]));
    match = CHECKBOX_CHECKED_ITEM_PATTERN.exec(ledger);
  }
  return items;
}

function isProgressLedgerNonAgentItem(content) {
  return findSubagentUnavailableState(content) !== null;
}

function validateCheckedSubagentProgressItem(content, filePath, options = {}) {
  const errors = [];
  const checkedItemErrors = validateCheckedSubagentLedgerItem(content, options);
  for (const checkedItemError of checkedItemErrors) {
    errors.push(
      `${filePath}: Subagent Progress Ledger checked item ` +
      `${checkedItemError}.`,
    );
  }
  if (
    options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES] === true &&
    !isProgressLedgerNonAgentItem(content) &&
    !AGENT_PROOF_PATTERN_TEXT_RE.test(content)
  ) {
    errors.push(
      `${filePath}: Subagent Progress Ledger checked item must include ` +
      'Agent <name> (<agent-id>) or an explicit unavailable state.',
    );
  }
  if (!SUBAGENT_PROGRESS_EVIDENCE_FIELD_PATTERN.test(content)) {
    errors.push(
      `${filePath}: Subagent Progress Ledger checked item must include ` +
      '`evidence:`.',
    );
  }
  if (!SUBAGENT_PROGRESS_NEXT_OR_BLOCKER_FIELD_PATTERN.test(content)) {
    errors.push(
      `${filePath}: Subagent Progress Ledger checked item must include ` +
      '`next:` or `blocker:`.',
    );
  }
  return errors;
}

export function validateSubagentProgressLedger(content, filePath, options = {}) {
  const ledger = extractSubagentProgressLedger(content);
  if (!ledger) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [
        `${filePath}: Subagent Progress Ledger or Subagent Progress And ` +
          'Attempt Ledger is required.',
      ] :
      [];
  }
  if (
    options[LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER] &&
    !options[LEDGER_VALIDATION_REQUIRES_LEDGER]
  ) {
    return [];
  }
  const errors = [];
  if (!CHECKBOX_ITEM_PRESENT_PATTERN.test(ledger)) {
    errors.push(
      `${filePath}: Subagent Progress Ledger must contain checklist items.`,
    );
  }
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    hasOpenChecklist(ledger) &&
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true
  ) {
    errors.push(`${filePath}: Subagent Progress Ledger has open items.`);
  }
  const checkedItems = extractCheckedChecklistItems(ledger);
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    checkedItems.length === NUM_ZERO
  ) {
    errors.push(
      `${filePath}: Subagent Progress Ledger must record at least one ` +
      'completed subtask update before pre-implementation or closure.',
    );
  }
  for (const checkedItem of checkedItems) {
    errors.push(...validateCheckedSubagentProgressItem(
      checkedItem,
      filePath,
      {
        [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
          options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES],
        [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
          options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS],
      },
    ));
  }
  return errors;
}

function isAttemptLedgerNonAgentItem(content) {
  return findSubagentUnavailableState(content) !== null;
}

function parseAttemptStatus(content) {
  const match = SUBAGENT_ATTEMPT_STATUS_PATTERN.exec(normalizeLedgerText(content));
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]).toLowerCase() : null;
}

function parseAttemptParentAction(content) {
  const match = SUBAGENT_ATTEMPT_PARENT_ACTION_PATTERN.exec(
    normalizeLedgerText(content),
  );
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]).toLowerCase() : null;
}

function itemSupersedesUnvalidatedAttempt(content) {
  const status = parseAttemptStatus(content);
  const parentAction = parseAttemptParentAction(content);
  return status === SUBAGENT_ATTEMPT_SUPERSEDED_STATUS ||
    SUBAGENT_ATTEMPT_PARENT_TERMINAL_ACTIONS.includes(parentAction) ||
    /\bsuperseded by\s+Agent\s+/iu.test(content);
}

function validateCheckedSubagentAttemptItem(content, filePath, options = {}) {
  const errors = [];
  const checkedItemErrors = validateCheckedSubagentLedgerItem(content, options);
  for (const checkedItemError of checkedItemErrors) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item ` +
      `${checkedItemError}.`,
    );
  }
  if (
    options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES] === true &&
    !isAttemptLedgerNonAgentItem(content) &&
    !AGENT_PROOF_PATTERN_TEXT_RE.test(content)
  ) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item must include ` +
      'Agent <name> (<agent-id>) or an explicit unavailable state.',
    );
  }

  const status = parseAttemptStatus(content);
  if (!status) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item must include ` +
      '`status: <started|running|interrupted|partial-unvalidated|' +
      'validated|superseded>`.',
    );
  } else if (!SUBAGENT_ATTEMPT_STATUSES.includes(status)) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item status ` +
      `\`${status}\` is not valid.`,
    );
  }

  if (!SUBAGENT_ATTEMPT_LAST_CHECKPOINT_FIELD_PATTERN.test(content)) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item must include ` +
      '`last checkpoint:`.',
    );
  }
  if (!SUBAGENT_PROGRESS_EVIDENCE_FIELD_PATTERN.test(content)) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item must include ` +
      '`evidence:`.',
    );
  }
  if (!SUBAGENT_PROGRESS_NEXT_OR_BLOCKER_FIELD_PATTERN.test(content)) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item must include ` +
      '`next:` or `blocker:`.',
    );
  }

  const parentAction = parseAttemptParentAction(content);
  if (!parentAction) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item must include ` +
      '`parent action:`.',
    );
  } else if (!SUBAGENT_ATTEMPT_PARENT_ACTIONS.includes(parentAction)) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item parent action ` +
      `\`${parentAction}\` is not valid.`,
    );
  }

  if (
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true &&
    SUBAGENT_ATTEMPT_OPEN_STATUSES.includes(status)
  ) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger checked item status ` +
      `\`${status}\` is not terminal for closure.`,
    );
  }
  if (
    status === SUBAGENT_ATTEMPT_VALIDATED_STATUS &&
    !['accepted', 'revalidated'].includes(parentAction)
  ) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger validated attempts require ` +
      '`parent action: accepted` or `parent action: revalidated`.',
    );
  }
  return errors;
}

export function validateSubagentAttemptLedger(content, filePath, options = {}) {
  const ledger = extractSubagentAttemptLedger(content);
  if (!ledger) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [
        `${filePath}: Subagent Attempt Ledger or Subagent Progress And ` +
          'Attempt Ledger is required.',
      ] :
      [];
  }
  if (
    options[LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER] &&
    !options[LEDGER_VALIDATION_REQUIRES_LEDGER]
  ) {
    return [];
  }
  const errors = [];
  if (!CHECKBOX_ITEM_PRESENT_PATTERN.test(ledger)) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger must contain checklist items.`,
    );
  }
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    hasOpenChecklist(ledger) &&
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true
  ) {
    errors.push(`${filePath}: Subagent Attempt Ledger has open items.`);
  }
  const checkedItems = extractCheckedChecklistItems(ledger);
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    checkedItems.length === NUM_ZERO
  ) {
    errors.push(
      `${filePath}: Subagent Attempt Ledger must record at least one ` +
      'completed attempt checkpoint before pre-implementation or closure.',
    );
  }
  for (const [index, checkedItem] of checkedItems.entries()) {
    errors.push(...validateCheckedSubagentAttemptItem(
      checkedItem,
      filePath,
      {
        [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
          options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES],
        [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
          options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION],
        [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
          options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS],
      },
    ));
    const status = parseAttemptStatus(checkedItem);
    if (SUBAGENT_ATTEMPT_UNVALIDATED_STATUSES.includes(status)) {
      const hasSupersedingAttempt = checkedItems
        .slice(index + NUM_ONE)
        .some(itemSupersedesUnvalidatedAttempt);
      if (!hasSupersedingAttempt) {
        errors.push(
          `${filePath}: Subagent Attempt Ledger ${status} attempt must be ` +
          'followed by a checked superseded/discarded/revalidated attempt line.',
        );
      }
    }
  }
  return errors;
}

function validateCheckedSubagentLedgerItem(content, options = {}) {
  const errors = [];
  if (LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(content)) {
    errors.push('contains a template placeholder');
  }
  if (content.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)) {
    errors.push(`contains ${LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER}`);
  }
  if (options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES] === true) {
    if (
      findSubagentUnavailableState(content) &&
      options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS] !== true
    ) {
      errors.push('contains a non-closure subagent unavailable state');
    }
    const contentWithoutPaths = content.replace(FILE_PATH_TOKEN_PATTERN, '');
    if (NON_REAL_IDENTITY_PATTERN.test(contentWithoutPaths)) {
      errors.push('contains a non-real agent identity');
    }
  }
  return errors;
}

function validateCheckedExecutionEvidenceItem(content, filePath, options = {}) {
  const errors = [];
  for (const checkedItemError of validateCheckedSubagentLedgerItem(content, {
    [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: false,
  })) {
    errors.push(
      `${filePath}: Execution Evidence checked item ${checkedItemError}.`,
    );
  }
  const usesFiveFieldShape = hasFiveFieldExecutionEvidenceItem(content);
  const status = parseAttemptStatus(content);
  if (!usesFiveFieldShape && !status) {
    errors.push(
      `${filePath}: Execution Evidence checked item must include ` +
      '`status:` or the five fields `action:`, `owner:`, `files-changed:`, ' +
      '`validation:`, and `outcome:`.',
    );
  }
  if (
    !usesFiveFieldShape &&
    !SUBAGENT_PROGRESS_EVIDENCE_FIELD_PATTERN.test(content)
  ) {
    errors.push(
      `${filePath}: Execution Evidence checked item must include ` +
      '`evidence:` or the five-field evidence shape.',
    );
  }
  if (
    !usesFiveFieldShape &&
    !SUBAGENT_PROGRESS_NEXT_OR_BLOCKER_FIELD_PATTERN.test(content)
  ) {
    errors.push(
      `${filePath}: Execution Evidence checked item must include ` +
      '`next:` or `blocker:`, or the five-field evidence shape.',
    );
  }
  if (
    status &&
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true &&
    SUBAGENT_ATTEMPT_OPEN_STATUSES.includes(status)
  ) {
    errors.push(
      `${filePath}: Execution Evidence checked item status \`${status}\` ` +
      'is not terminal for closure.',
    );
  }
  return errors;
}

function findImplementationExecutionEvidenceItem(checkedItems = []) {
  return checkedItems.find((item) =>
    EXECUTION_EVIDENCE_IMPLEMENTATION_PATTERN.test(item));
}

function findVerificationFixExecutionEvidenceItem(checkedItems = []) {
  return checkedItems.find((item) =>
    EXECUTION_EVIDENCE_VERIFICATION_FIX_PATTERN.test(item));
}

function hasFiveFieldExecutionEvidenceItem(content) {
  return (
    EXECUTION_EVIDENCE_ACTION_FIELD_PATTERN.test(content) &&
    EXECUTION_EVIDENCE_OWNER_FIELD_PATTERN.test(content) &&
    EXECUTION_EVIDENCE_FILES_CHANGED_FIELD_PATTERN.test(content) &&
    EXECUTION_EVIDENCE_VALIDATION_FIELD_PATTERN.test(content) &&
    EXECUTION_EVIDENCE_OUTCOME_FIELD_PATTERN.test(content)
  );
}

function hasTerminalExecutionEvidenceItem(content) {
  return (
    EXECUTION_EVIDENCE_TERMINAL_STATUS_PATTERN.test(content) ||
    EXECUTION_EVIDENCE_TERMINAL_OUTCOME_PATTERN.test(content)
  );
}

function hasExecutionEvidenceChangedFilesField(content) {
  return (
    EXECUTION_EVIDENCE_CHANGED_FILES_FIELD_PATTERN.test(content) ||
    EXECUTION_EVIDENCE_FILES_CHANGED_FIELD_PATTERN.test(content)
  );
}

function findExecutionEvidenceItem(checkedItems = [], pattern) {
  return checkedItems.find((item) => pattern.test(item));
}

function findExecutionEvidenceItemIndex(checkedItems = [], pattern) {
  return checkedItems.findIndex((item) => pattern.test(item));
}

function hasRealExecutionEvidenceAgentProof(content) {
  const contentWithoutPaths = content.replace(FILE_PATH_TOKEN_PATTERN, '');
  return AGENT_PROOF_PATTERN_TEXT_RE.test(contentWithoutPaths) &&
    !NON_REAL_IDENTITY_PATTERN.test(contentWithoutPaths);
}

function validateFreshnessReviewExecutionEvidenceItem(content, filePath) {
  const errors = [];
  if (!hasTerminalExecutionEvidenceItem(content)) {
    errors.push(
      `${filePath}: Execution Evidence freshness-review item must record ` +
      'status or outcome validated, passed, green, success, or done.',
    );
  }
  if (!hasRealExecutionEvidenceAgentProof(content)) {
    errors.push(
      `${filePath}: Execution Evidence freshness-review item must record ` +
      'a real Agent <name> (<agent-id>) from a fresh subagent.',
    );
  }
  if (!EXECUTION_EVIDENCE_FRESHNESS_REVIEW_DECISION_PATTERN.test(content)) {
    errors.push(
      `${filePath}: Execution Evidence freshness-review item must record ` +
      '`decision: fresh` before implementation.',
    );
  }
  return errors;
}

export function validateExecutionEvidenceLedger(content, filePath, options = {}) {
  const metadata = options.metadata;
  const execution = metadata && metadata.execution;

  if (execution && (execution.freshnessReview || execution.implementation || execution.verificationFix || execution.theoryLedger || execution.repair)) {
    const errors = [];
    if (options[LEDGER_VALIDATION_REQUIRES_FRESHNESS_REVIEW] === true) {
      if (!execution.freshnessReview) {
        errors.push(
          `${filePath}: execution.freshnessReview front-matter object is ` +
          'required before implementation.',
        );
      } else {
        if (execution.freshnessReview.decision !== 'fresh') {
          errors.push(
            `${filePath}: execution.freshnessReview.decision must be ` +
            '`fresh` before implementation.',
          );
        }
        if (!new RegExp(`^${AGENT_ID_PATTERN_TEXT}$`, 'iu').test(
          normalizeLedgerText(execution.freshnessReview.agentId),
        )) {
          errors.push(
            `${filePath}: execution.freshnessReview.agentId must record ` +
            'the real subagent id.',
          );
        }
      }
    }
    if (options[LEDGER_VALIDATION_REQUIRES_LEDGER] && options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true) {
      if (!execution.implementation) {
        errors.push(
          `${filePath}: execution.implementation front-matter object is required before closure.`,
        );
      } else {
        if (execution.implementation.parentRevalidatedFocusedProof !== true) {
          errors.push(
            `${filePath}: execution.implementation.parentRevalidatedFocusedProof must be true before closure.`,
          );
        }
        if (!Array.isArray(execution.implementation.filesChanged)) {
          errors.push(
            `${filePath}: execution.implementation.filesChanged must be an array of files.`,
          );
        }
      }
    }
    if (options[LEDGER_VALIDATION_REQUIRES_VERIFICATION_FIX] === true) {
      if (!execution.verificationFix) {
        errors.push(
          `${filePath}: execution.verificationFix front-matter object is required before closure.`,
        );
      } else {
        if (execution.verificationFix.parentRevalidatedFocusedProof !== true) {
          errors.push(
            `${filePath}: execution.verificationFix.parentRevalidatedFocusedProof must be true before closure.`,
          );
        }
      }
    }
    return errors;
  }

  const ledger = extractExecutionEvidenceLedger(content);
  if (!ledger) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [`${filePath}: Execution Evidence is required.`] :
      [];
  }
  if (
    options[LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER] &&
    !options[LEDGER_VALIDATION_REQUIRES_LEDGER]
  ) {
    return [];
  }
  const errors = [];
  if (
    hasOpenChecklist(ledger) &&
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true
  ) {
    errors.push(`${filePath}: Execution Evidence has open items.`);
  }
  const checkedItems = extractCheckedChecklistItems(ledger);
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    checkedItems.length === NUM_ZERO
  ) {
    errors.push(
      `${filePath}: Execution Evidence must record at least one checked ` +
      'implementation evidence item before closure.',
    );
  }
  for (const checkedItem of checkedItems) {
    errors.push(...validateCheckedExecutionEvidenceItem(
      checkedItem,
      filePath,
      options,
    ));
  }
  const freshnessReviewItem = findExecutionEvidenceItem(
    checkedItems,
    EXECUTION_EVIDENCE_FRESHNESS_REVIEW_PATTERN,
  );
  const implementationItem =
    findImplementationExecutionEvidenceItem(checkedItems);
  const verificationFixItem =
    findVerificationFixExecutionEvidenceItem(checkedItems);
  if (options[LEDGER_VALIDATION_REQUIRES_FRESHNESS_REVIEW] === true) {
    if (!freshnessReviewItem) {
      errors.push(
        `${filePath}: Execution Evidence must include a checked ` +
        'freshness-review item before implementation.',
      );
    } else {
      errors.push(...validateFreshnessReviewExecutionEvidenceItem(
        freshnessReviewItem,
        filePath,
      ));
      const freshnessReviewIndex = findExecutionEvidenceItemIndex(
        checkedItems,
        EXECUTION_EVIDENCE_FRESHNESS_REVIEW_PATTERN,
      );
      const implementationIndex = findExecutionEvidenceItemIndex(
        checkedItems,
        EXECUTION_EVIDENCE_IMPLEMENTATION_PATTERN,
      );
      if (
        implementationIndex !== NUM_MINUS_ONE &&
        freshnessReviewIndex > implementationIndex
      ) {
        errors.push(
          `${filePath}: Execution Evidence freshness-review item must appear ` +
          'before implementation.',
        );
      }
    }
  }
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] !== true
  ) {
    if (!implementationItem) {
      errors.push(
        `${filePath}: Execution Evidence must include a checked ` +
        'implementation item before closure.',
      );
    } else {
      if (!hasTerminalExecutionEvidenceItem(implementationItem)) {
        errors.push(
          `${filePath}: Execution Evidence implementation item must record ` +
          'status or outcome validated, passed, green, success, or done.',
        );
      }
      if (!SUBAGENT_PARENT_REVALIDATION_PATTERN.test(implementationItem)) {
        errors.push(
          `${filePath}: Execution Evidence implementation item must record ` +
          '`parent revalidated focused proof: yes` before closure.',
        );
      }
    }
    if (options[LEDGER_VALIDATION_REQUIRES_VERIFICATION_FIX] === true) {
      if (!verificationFixItem) {
        errors.push(
          `${filePath}: Execution Evidence must include a checked ` +
          'verification-fix item before closure.',
        );
      } else {
        if (!hasTerminalExecutionEvidenceItem(verificationFixItem)) {
          errors.push(
            `${filePath}: Execution Evidence verification-fix item must ` +
            'record status or outcome validated, passed, green, success, done, or superseded.',
          );
        }
        if (!SUBAGENT_PARENT_REVALIDATION_PATTERN.test(verificationFixItem)) {
          errors.push(
            `${filePath}: Execution Evidence verification-fix item must ` +
            'record `parent revalidated focused proof: yes` before closure.',
          );
        }
        if (!hasExecutionEvidenceChangedFilesField(verificationFixItem)) {
          errors.push(
            `${filePath}: Execution Evidence verification-fix item must ` +
            'record `changed files:` or `files-changed:` before closure.',
          );
        }
      }
    }
  }
  return errors;
}

function normalizeLedgerText(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function normalizeLedgerFieldValue(value) {
  let normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.startsWith(LEDGER_MARKDOWN_CODE_DELIMITER) &&
    normalizedValue.endsWith(LEDGER_MARKDOWN_CODE_DELIMITER)
  ) {
    normalizedValue = normalizedValue.slice(NUM_ONE, -NUM_ONE);
  }
  return normalizedValue
    .replace(LEDGER_FIELD_TRAILING_PUNCTUATION_PATTERN, '')
    .trim();
}

function normalizeLedgerPackage(value) {
  return normalizeLedgerFieldValue(value);
}

function validateAgentProof(agent, roleLabel, filePath) {
  const errors = [];
  if (!agent) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger ${roleLabel} entry must ` +
      'include Agent <name> (<agent-id>)',
    );
    return errors;
  }
  if (NON_REAL_IDENTITY_PATTERN.test(agent.name)) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger ${roleLabel} entry uses a ` +
      'non-real agent identity',
    );
  }
  return errors;
}

function parseReviewEntry(content, options = {}) {
  if (
    options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS] === true &&
    findSubagentUnavailableState(content)
  ) {
    return {
      type: findSubagentUnavailableState(content),
      result: SUBAGENT_REVIEW_RESULT_CLEAN,
    };
  }
  if (isReviewNotNeededEntry(content)) {
    return {
      type: SUBAGENT_FIX_NOT_NEEDED,
      result: SUBAGENT_REVIEW_RESULT_CLEAN,
    };
  }
  const match = SUBAGENT_REVIEW_PATTERN.exec(normalizeLedgerText(content));
  if (!match) {
    return null;
  }
  return {
    type: 'agent',
    agent: {
      name: normalizeLedgerText(match[NUM_ONE]),
      id: match[NUM_TWO].toLowerCase(),
    },
    packagePath: normalizeLedgerPackage(match[NUM_TWO + NUM_ONE]),
    result: normalizeLedgerFieldValue(match[NUM_TWO + NUM_TWO]).toLowerCase(),
  };
}

function isReviewNotNeededEntry(content) {
  const normalizedContent = normalizeLedgerText(content).toLowerCase();
  return normalizedContent.includes(SUBAGENT_FIX_NOT_NEEDED) &&
    normalizedContent.includes(SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE);
}

function isFixNotNeededEntry(content) {
  const normalizedContent = normalizeLedgerText(content);
  const notNeededPattern = new RegExp(
    escapeRegExp(SUBAGENT_LEDGER_FIX_LABEL) + ':\\s+`?' +
      escapeRegExp(SUBAGENT_FIX_NOT_NEEDED) + '`?[.;]?$',
    'iu',
  );
  return notNeededPattern.test(normalizedContent);
}

function isReviewFixedMetadataOnlyEntry(content) {
  return normalizeLedgerText(content)
    .includes(SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY);
}

function reviewFixedMetadataScopeValue(content) {
  const match = SUBAGENT_FIX_REVIEW_FIXED_METADATA_SCOPE_FIELD_PATTERN.exec(
    normalizeLedgerText(content),
  );
  return match ? normalizeLedgerText(match[NUM_ONE]) : EMPTY_TEXT;
}

function reviewFixedMetadataScopeIsAllowed(content) {
  return SUBAGENT_FIX_REVIEW_FIXED_METADATA_SCOPE_PATTERN.test(
    reviewFixedMetadataScopeValue(content),
  );
}

function parseFixEntry(content, options = {}) {
  if (
    options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS] === true &&
    findSubagentUnavailableState(content)
  ) {
    return {
      type: findSubagentUnavailableState(content),
    };
  }
  if (isFixNotNeededEntry(content)) {
    return {
      type: SUBAGENT_FIX_NOT_NEEDED,
    };
  }
  if (isReviewFixedMetadataOnlyEntry(content)) {
    const normalizedContent = normalizeLedgerText(content);
    const agentMatch = AGENT_PROOF_PATTERN_TEXT_RE.exec(normalizedContent);
    const packageMatch =
      SUBAGENT_FIX_REVIEW_FIXED_PACKAGE_PATTERN.exec(normalizedContent);
    return {
      type: SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY,
      agent: agentMatch ? {
        name: normalizeLedgerText(agentMatch[NUM_ONE]),
        id: agentMatch[NUM_TWO].toLowerCase(),
      } : null,
      packagePath: packageMatch ?
        normalizeLedgerPackage(packageMatch[NUM_ONE]) :
        null,
      metadataOnlyScope: reviewFixedMetadataScopeIsAllowed(normalizedContent),
    };
  }
  const match = SUBAGENT_FIX_PATTERN.exec(normalizeLedgerText(content));
  if (!match) {
    return null;
  }
  return {
    type: 'agent',
    agent: {
      name: normalizeLedgerText(match[NUM_ONE]),
      id: match[NUM_TWO].toLowerCase(),
    },
    packagePath: normalizeLedgerPackage(match[NUM_TWO + NUM_ONE]),
  };
}

function parseImplementationEntry(content, options = {}) {
  if (
    options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS] === true &&
    findSubagentUnavailableState(content)
  ) {
    return {
      type: findSubagentUnavailableState(content),
    };
  }
  const match = SUBAGENT_IMPLEMENTATION_PATTERN.exec(normalizeLedgerText(content));
  if (!match) {
    return null;
  }
  return {
    agent: {
      name: normalizeLedgerText(match[NUM_ONE]),
      id: match[NUM_TWO].toLowerCase(),
    },
    packagePath: normalizeLedgerPackage(match[NUM_TWO + NUM_ONE]),
    parentRevalidated: SUBAGENT_PARENT_REVALIDATION_PATTERN.test(
      normalizeLedgerText(content),
    ),
  };
}

function validateSubagentLedgerSequence(entries, filePath) {
  const errors = [];
  if (
    entries[SUBAGENT_LEDGER_REVIEW_LABEL]?.index >=
      entries[SUBAGENT_LEDGER_FIX_LABEL]?.index ||
    entries[SUBAGENT_LEDGER_FIX_LABEL]?.index >=
      entries[SUBAGENT_LEDGER_IMPLEMENTATION_LABEL]?.index
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger entries must appear in ` +
      'review, fix, implementation order.',
    );
  }
  return errors;
}

function validateSubagentLedgerReviewFixRoles(entries, filePath, options = {}) {
  const errors = [];
  const review = parseReviewEntry(
    entries[SUBAGENT_LEDGER_REVIEW_LABEL].content,
    options,
  );
  if (!review) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger review entry must match ` +
      'Agent <name> (<agent-id>) reviewed <package>; result ' +
      '<clean|fixes-required>, or `not-needed` for ' +
      `${SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE}.`,
    );
  }
  if (review?.type === 'agent') {
    errors.push(...validateAgentProof(review.agent, 'review', filePath));
  }

  const fix = parseFixEntry(
    entries[SUBAGENT_LEDGER_FIX_LABEL].content,
    options,
  );
  if (!fix) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger fix entry must match ` +
      'Agent <name> (<agent-id>) fixed <package> or not-needed.',
    );
  }
  if (fix?.type === 'agent') {
    errors.push(...validateAgentProof(fix.agent, 'fix', filePath));
  }
  if (fix?.type === SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY) {
    errors.push(...validateAgentProof(
      fix.agent,
      'review-fixed metadata-only fix',
      filePath,
    ));
    if (!fix.packagePath) {
      errors.push(
        `${filePath}: Subagent Sequencing Ledger review-fixed metadata-only ` +
        'fix entry must name the reviewed package after `for` or `on`.',
      );
    }
    if (!fix.metadataOnlyScope) {
      errors.push(
        `${filePath}: Subagent Sequencing Ledger review-fixed metadata-only ` +
        'fix entry must state metadata-only, package metadata, sprint ' +
        'metadata, tracker, handoff, current-blocker, or ledger scope.',
      );
    }
  }

  if (!review || !fix) {
    return errors;
  }
  if (
    review.result === SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED &&
    fix.type === SUBAGENT_FIX_NOT_NEEDED
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger fix entry cannot be ` +
      'not-needed when review result is fixes-required.',
    );
  }
  if (
    review.result === SUBAGENT_REVIEW_RESULT_CLEAN &&
    fix.type !== SUBAGENT_FIX_NOT_NEEDED
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger fix entry must be not-needed ` +
      'when review result is clean.',
    );
  }
  if (
    review.type === 'agent' &&
    fix.type === 'agent' &&
    fix.packagePath !== review.packagePath
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger fix package must match the ` +
      'reviewed package.',
    );
  }
  if (
    review.type === 'agent' &&
    fix.type === SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY &&
    fix.packagePath !== review.packagePath
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger review-fixed metadata-only ` +
      'fix package must match the reviewed package.',
    );
  }
  if (
    review.type === 'agent' &&
    fix.type === 'agent' &&
    fix.agent.id === review.agent.id
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger fix agent must be separate ` +
      'from the review agent.',
    );
  }
  if (
    review.type === 'agent' &&
    fix.type === SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY &&
    fix.agent?.id !== review.agent.id
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger review-fixed metadata-only ` +
      'fix must be recorded by the review agent.',
    );
  }
  return errors;
}

function validateSubagentLedgerRoles(entries, filePath, options = {}) {
  const errors = validateSubagentLedgerReviewFixRoles(entries, filePath, options);
  const review = parseReviewEntry(
    entries[SUBAGENT_LEDGER_REVIEW_LABEL].content,
    options,
  );
  const fix = parseFixEntry(
    entries[SUBAGENT_LEDGER_FIX_LABEL].content,
    options,
  );
  const implementation = parseImplementationEntry(
    entries[SUBAGENT_LEDGER_IMPLEMENTATION_LABEL].content,
    options,
  );
  if (!implementation) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation entry must ` +
      'match Agent <name> (<agent-id>) implemented <package>.',
    );
  }
  if (implementation?.agent) {
    errors.push(
      ...validateAgentProof(implementation.agent, 'implementation', filePath),
    );
    if (
      options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES] !== false &&
      implementation.parentRevalidated !== true
    ) {
      errors.push(
        `${filePath}: Subagent Sequencing Ledger implementation entry must ` +
        'record `parent revalidated focused proof: yes` before closure.',
      );
    }
  }

  if (!review || !fix || !implementation) {
    return errors;
  }
  if (implementation.agent && implementation.packagePath !== filePath) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation package must ` +
      'match this package path.',
    );
  }
  if (
    review.type === 'agent' &&
    implementation.agent &&
    implementation.agent.id === review.agent.id
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation agent must be ` +
      'separate from the review agent.',
    );
  }
  if (
    fix.type === 'agent' &&
    implementation.agent &&
    implementation.agent.id === fix.agent.id
  ) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation agent must be ` +
      'separate from the fix agent.',
    );
  }
  return errors;
}

export function validateSubagentSequencingLedger(content, filePath, options = {}) {
  const ledger = extractSubagentSequencingLedger(content);
  const requiresStrictEntries =
    options[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES] !== false;
  const allowOpenImplementation =
    options[LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION] === true;
  const requiredLabels = allowOpenImplementation ?
    [
      SUBAGENT_LEDGER_REVIEW_LABEL,
      SUBAGENT_LEDGER_FIX_LABEL,
    ] :
    SUBAGENT_LEDGER_REQUIRED_LABELS;
  if (!ledger) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [`${filePath}: Subagent Sequencing Ledger is required.`] :
      [];
  }
  if (
    options[LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER] &&
    !options[LEDGER_VALIDATION_REQUIRES_LEDGER]
  ) {
    return [];
  }
  const errors = [];
  if (
    hasOpenChecklist(ledger) &&
    !(allowOpenImplementation && hasOnlyOpenImplementationChecklist(ledger))
  ) {
    errors.push(`${filePath}: Subagent Sequencing Ledger has open items.`);
  }
  const checkedEntries = {};
  for (const label of requiredLabels) {
    const checkedEntry = findCheckedSubagentLedgerEntry(ledger, label);
    if (!checkedEntry) {
      errors.push(
        `${filePath}: Subagent Sequencing Ledger is missing checked ` +
        `"${label}" item.`,
      );
      continue;
    }
    checkedEntries[label] = checkedEntry;
    const checkedItemErrors = validateCheckedSubagentLedgerItem(
      checkedEntry.content,
      {
        [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: requiresStrictEntries,
        [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
          options[LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS],
      },
    );
    for (const checkedItemError of checkedItemErrors) {
      errors.push(
        `${filePath}: Subagent Sequencing Ledger checked "${label}" item ` +
        `${checkedItemError}.`,
      );
    }
  }
  if (
    requiresStrictEntries &&
    requiredLabels.every((label) => checkedEntries[label])
  ) {
    if (!allowOpenImplementation) {
      errors.push(...validateSubagentLedgerSequence(checkedEntries, filePath));
      errors.push(...validateSubagentLedgerRoles(checkedEntries, filePath, options));
    } else {
      errors.push(...validateSubagentLedgerReviewFixRoles(
        checkedEntries,
        filePath,
        options,
      ));
    }
  }
  return errors;
}

function findCommitLedgerField(ledger, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'u',
  );
  const match = fieldPattern.exec(ledger);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

// Push target is the post-F7 canonical label; pre-F7 packages used
// `Pushed to`. Read prefers the new label, falls back to the legacy one
// so existing closed packages keep validating.
function findCommitLedgerPushTarget(ledger) {
  return (
    findCommitLedgerField(ledger, COMMIT_LEDGER_PUSH_TARGET_LABEL) ||
    findCommitLedgerField(ledger, COMMIT_LEDGER_PUSHED_LABEL)
  );
}

function isPendingCommitLedgerValue(value) {
  return value === null ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER) ||
    /\bpending\b/iu.test(value);
}

function isPendingCommitAndPushLedger(ledger) {
  return [
    findCommitLedgerField(ledger, COMMIT_LEDGER_COMMIT_LABEL),
    findCommitLedgerPushTarget(ledger),
    findCommitLedgerField(ledger, COMMIT_LEDGER_FOCUSED_SLICE_LABEL),
  ].some(isPendingCommitLedgerValue);
}

function isHistoricalClosedCommitLedgerMetadata(fileStatus, metadata) {
  const opened = normalizeLedgerText(metadata?.opened).slice(
    NUM_ZERO,
    DATE_SLICE_END,
  );
  return (
    (fileStatus === STATUS_DONE || fileStatus === STATUS_SUPERSEDED) &&
    opened.length === DATE_SLICE_END &&
    opened < COMMIT_LEDGER_POLICY_OPENED_ON_OR_AFTER
  );
}

function isCurrentPolicyClosedSubagentMetadata(fileStatus, metadata) {
  const opened = normalizeLedgerText(metadata?.opened).slice(
    NUM_ZERO,
    DATE_SLICE_END,
  );
  return (
    (fileStatus === STATUS_DONE || fileStatus === STATUS_SUPERSEDED) &&
    metadataRequiresSubagentSequencing(metadata) &&
    opened.length === DATE_SLICE_END &&
    opened > SUBAGENT_ATTEMPT_LEDGER_POLICY_OPENED_AFTER
  );
}

function validateCommitLedgerFieldValue(filePath, label, value, validateValue) {
  const errors = [];
  if (value === null) {
    errors.push(`${filePath}: Commit And Push Ledger is missing ${label}.`);
    return errors;
  }
  if (
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    errors.push(
      `${filePath}: Commit And Push Ledger ${label} contains a placeholder.`,
    );
  }
  const valueError = validateValue(value);
  if (valueError) {
    errors.push(`${filePath}: Commit And Push Ledger ${label} ${valueError}.`);
  }
  return errors;
}

export function validateCommitAndPushLedger(content, filePath, options = {}) {
  const ledger = extractCommitAndPushLedger(content);
  if (!ledger) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
      !options[LEDGER_VALIDATION_ALLOW_MISSING_HISTORICAL_COMMIT_LEDGER] ?
      [`${filePath}: Commit And Push Ledger is required.`] :
      [];
  }
  if (
    options[LEDGER_VALIDATION_ALLOW_PENDING_COMMIT_LEDGER] &&
    !options[LEDGER_VALIDATION_REQUIRES_LEDGER] &&
    isPendingCommitAndPushLedger(ledger)
  ) {
    return [];
  }
  const focusedCommit = findCommitLedgerField(ledger, COMMIT_LEDGER_COMMIT_LABEL);
  const pushedTo = findCommitLedgerPushTarget(ledger);
  const focusedSlice = findCommitLedgerField(
    ledger,
    COMMIT_LEDGER_FOCUSED_SLICE_LABEL,
  );
  const pushedBoolean = findCommitLedgerField(
    ledger,
    COMMIT_LEDGER_PUSHED_BOOLEAN_LABEL,
  );
  const pushTargetLabelInUse = ledger.includes(
    `${COMMIT_LEDGER_PUSH_TARGET_LABEL}:`,
  ) ?
    COMMIT_LEDGER_PUSH_TARGET_LABEL :
    COMMIT_LEDGER_PUSHED_LABEL;
  const errors = [
    ...validateCommitLedgerFieldValue(
      filePath,
      COMMIT_LEDGER_COMMIT_LABEL,
      focusedCommit,
      (value) => COMMIT_SHA_PATTERN.test(value) ?
        null :
        'must be a git commit SHA',
    ),
    ...validateCommitLedgerFieldValue(
      filePath,
      pushTargetLabelInUse,
      pushedTo,
      (value) => REMOTE_BRANCH_PATTERN.test(value) ?
        null :
        'must be <remote>/<branch>',
    ),
    ...validateCommitLedgerFieldValue(
      filePath,
      COMMIT_LEDGER_FOCUSED_SLICE_LABEL,
      focusedSlice,
      (value) => value.toLowerCase() === LEDGER_YES_VALUE ?
        null :
        'must be yes',
    ),
  ];
  // Optional `Pushed: yes|no` line. Additive: legacy ledgers without it
  // continue to validate. When present, must be `yes` (optionally followed
  // by an ISO timestamp populated by `work:sprint:push`) or `no`.
  if (pushedBoolean !== null) {
    const v = pushedBoolean.toLowerCase();
    const ok = v === 'no' || v === 'yes' || /^yes\s+\S/u.test(v);
    if (!ok) {
      errors.push(
        `${filePath}: Commit And Push Ledger ${COMMIT_LEDGER_PUSHED_BOOLEAN_LABEL} ` +
        'must be yes or no.',
      );
    }
  }
  return errors;
}

function findModelFitField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

function findFirstModelFitField(section, labels) {
  for (const label of labels) {
    const value = findModelFitField(section, label);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function findCoreLogicBriefField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

function findSprintStrategyBriefField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

function findTheoryLoopSuccessEvidenceField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

function metadataRequiresCoreLogicBrief(metadata) {
  return metadata !== null &&
    coreLogicBriefRequiredForLane(metadataLane(metadata));
}

function validateCoreLogicBriefField(filePath, label, value) {
  if (value === null) {
    return [`${filePath}: Core Logic Brief is missing ${label}.`];
  }
  if (
    value.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: Core Logic Brief ${label} must be a concrete value.`,
    ];
  }
  return [];
}

export function validateCoreLogicBrief(content, filePath, options = {}) {
  const requiresBrief =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const section = extractCoreLogicBriefSection(content);
  if (!section) {
    return requiresBrief ?
      [`${filePath}: Core Logic Brief section is required.`] :
      [];
  }
  if (CORE_LOGIC_BRIEF_NOT_NEEDED_PATTERN.test(section)) {
    return requiresBrief ?
      [
        `${filePath}: Core Logic Brief cannot be not-needed for this ` +
        'workflow lane.',
      ] :
      [];
  }
  const errors = [];
  for (const label of CORE_LOGIC_BRIEF_FIELDS) {
    errors.push(
      ...validateCoreLogicBriefField(
        filePath,
        label,
        findCoreLogicBriefField(section, label),
      ),
    );
  }
  if (
    options.rejectGeneric === true &&
    GENERIC_CORE_LOGIC_MODEL_PATTERN.test(
      findCoreLogicBriefField(section, CORE_LOGIC_BRIEF_MODEL_FIELD) ||
        EMPTY_TEXT,
    )
  ) {
    errors.push(
      `${filePath}: Core Logic Brief ${CORE_LOGIC_BRIEF_MODEL_FIELD} ` +
      'must name the concrete decision model; move generic scaffolding into ' +
      `${CAUSAL_DECISION_CONTRACT_HEADING} before implementation.`,
    );
  }
  return errors;
}

function findCausalDecisionContractField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

function validateCausalDecisionContractField(filePath, label, value) {
  if (value === null) {
    return [`${filePath}: Causal Decision Contract is missing ${label}.`];
  }
  if (
    value.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: Causal Decision Contract ${label} must be concrete.`,
    ];
  }
  return [];
}

function validateCausalDecisionContractTable(section, filePath) {
  const errors = [];
  if (!CAUSAL_DECISION_CONTRACT_TABLE_HEADER_PATTERN.test(section)) {
    errors.push(
      `${filePath}: Causal Decision Contract ${CAUSAL_DECISION_CONTRACT_TABLE_LABEL} ` +
      'must include columns Signal, Normalized value, Owner interpretation, ' +
      'Emitted outcome, Expected delta, and Disproof probe.',
    );
  }
  if (!CAUSAL_DECISION_CONTRACT_TABLE_ROW_PATTERN.test(section)) {
    errors.push(
      `${filePath}: Causal Decision Contract ${CAUSAL_DECISION_CONTRACT_TABLE_LABEL} ` +
      'must include at least one concrete decision row.',
    );
  }
  if (
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(section) ||
    section.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    errors.push(
      `${filePath}: Causal Decision Contract ${CAUSAL_DECISION_CONTRACT_TABLE_LABEL} ` +
      'must not contain placeholders or pending markers.',
    );
  }
  return errors;
}

function metadataRequiresCausalDecisionContract(metadata, fileStatus) {
  return fileStatus === STATUS_ACTIVE &&
    metadata !== null &&
    coreLogicBriefRequiredForLane(metadataLane(metadata));
}

function metadataRequiresOscillationGuard(metadata, fileStatus) {
  if (!metadataRequiresCausalDecisionContract(metadata, fileStatus)) {
    return false;
  }
  const architectureGate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  const scenarioClosure =
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD] || {};
  return (
    isObjectRecord(architectureGate) &&
    normalizeLedgerText(architectureGate.trigger) ===
      ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION
  ) ||
    normalizeLedgerText(
      scenarioClosure[SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD],
    ).length > NUM_ZERO ||
    normalizeMetadataStringList(
      scenarioClosure[SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD],
    ).length > NUM_ZERO;
}

export function validateMechanismCardGate(content, metadata, filePath, options = {}) {
  const status = options.status || (metadata && normalizeLedgerText(metadata.status));
  const isTargetStatus = status === STATUS_ACTIVE || status === STATUS_TODO;
  if (!isTargetStatus) {
    return [];
  }

  const isTheoryLoopLane = [
    LANE_DIAGNOSTIC_CLASSIFICATION,
    LANE_EXPERIMENT,
    LANE_BOUNDED_EXPERIMENT,
    LANE_RUNTIME_OWNER_BOUNDARY,
    LANE_SCENARIO_RELEASE_GATE,
    LANE_CAUSAL_ESCALATION,
    'diagnostic-classification',
    'experiment',
    'bounded-experiment',
    'runtime-owner-boundary',
    'scenario-release-gate',
    'causal-escalation',
  ].includes(metadata?.lane);

  const isTheoryLoopTooling =
    metadata?.lane === LANE_LIGHTWEIGHT_MAINTENANCE &&
    (
      /theory-loop/iu.test(filePath) ||
      /mechanism-card/iu.test(filePath) ||
      /artifact-compare/iu.test(filePath) ||
      /negative-learning/iu.test(filePath) ||
      /theory_loop/iu.test(metadata?.boundary || '') ||
      /mechanism_card/iu.test(metadata?.boundary || '')
    );

  if (!isTheoryLoopLane && !isTheoryLoopTooling) {
    return [];
  }

  const errors = [];
  const hasMetadataCard = metadata && metadata.mechanismCard && typeof metadata.mechanismCard === 'object';
  const hasMarkdownSection = content.includes('## Mechanism Card');

  if (!hasMetadataCard && !hasMarkdownSection) {
    errors.push(
      `${filePath}: non-trivial theory-loop package requires mechanism-card readiness; ` +
      `expose a mechanismCard metadata object or declare a ## Mechanism Card section.`
    );
    return errors;
  }

  const requiredFields = [
    'failureMechanism',
    'stableFacts',
    'changedFacts',
    'rejectedAlternatives',
    'ownerWhoDecides',
    'currentAction',
    'missingTransitionOrObservation',
    'smallestFalsifyingProbe',
    'expectedMovement',
    'negativeResultMeans',
    'escalationRule'
  ];

  if (hasMetadataCard) {
    const card = metadata.mechanismCard;
    for (const field of requiredFields) {
      if (card[field] === undefined) {
        errors.push(`${filePath}: metadata mechanismCard is missing required field ${field}.`);
      } else {
        const val = String(card[field]).trim();
        if (val.length === 0) {
          errors.push(`${filePath}: metadata mechanismCard.${field} must not be empty.`);
        } else if (val.includes('<placeholder>') || val.startsWith('<')) {
          if (status === STATUS_ACTIVE) {
            errors.push(`${filePath}: metadata mechanismCard.${field} must be a concrete value.`);
          }
        }
      }
    }
  } else {
    const section = extractMarkdownLevelTwoSection(content, '## Mechanism Card');
    if (section === null) {
      errors.push(`${filePath}: ## Mechanism Card section is missing.`);
    } else {
      const sectionText = String(section);
      const fieldPatterns = {
        failureMechanism: [/Failure\s+Mechanism\s*:\s*(.*)/iu],
        stableFacts: [/Stable\s+Facts\s*:\s*(.*)/iu],
        changedFacts: [/Changed\s+Facts\s*:\s*(.*)/iu],
        rejectedAlternatives: [/(?:Rejected\s+Alternatives|Why\s+not\s+the\s+alternatives)\s*:\s*(.*)/iu],
        ownerWhoDecides: [/Owner\s+who\s+decides\s*:\s*(.*)/iu],
        currentAction: [/(?:Current\s+Action|Current\s+code\s+or\s+workflow\s+action)\s*:\s*(.*)/iu],
        missingTransitionOrObservation: [/(?:Missing\s+Transition\s+Or\s+Observation|Missing\s+transition\s+or\s+missing\s+observation)\s*:\s*(.*)/iu],
        smallestFalsifyingProbe: [/Smallest\s+falsifying\s+probe\s*:\s*(.*)/iu],
        expectedMovement: [/Expected\s+movement\s*:\s*(.*)/iu],
        negativeResultMeans: [/Negative\s+result\s+means\s*:\s*(.*)/iu],
        escalationRule: [/Escalation\s+rule\s*:\s*(.*)/iu],
      };

      for (const field of requiredFields) {
        const val = findMarkdownField(sectionText, fieldPatterns[field]);
        if (val === null) {
          errors.push(`${filePath}: ## Mechanism Card section is missing required field ${field}.`);
        } else {
          if (val.length === 0) {
            errors.push(`${filePath}: ## Mechanism Card field ${field} must not be empty.`);
          } else if (val.includes('<placeholder>') || val.startsWith('<')) {
            if (status === STATUS_ACTIVE) {
              errors.push(`${filePath}: ## Mechanism Card field ${field} must be a concrete value.`);
            }
          }
        }
      }
    }
  }

  return errors;
}

function findMarkdownField(sectionText, patterns) {
  for (const pattern of patterns) {
    const match = sectionText.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

export function validateCausalDecisionContract(
  content,
  metadata,
  filePath,
  options = {},
) {
  const requiresContract =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const section = extractCausalDecisionContractSection(content);
  if (!section) {
    if (metadata?.[CAUSAL_GOVERNANCE_METADATA_FIELD]) {
      return [];
    }
    return requiresContract ?
      [
        `${filePath}: Causal Decision Contract section is required for ` +
        'active scenario/runtime packages.',
      ] :
      [];
  }
  const errors = [];
  errors.push(...validateCausalDecisionContractTable(section, filePath));
  const antiSymptom = findCausalDecisionContractField(
    section,
    CAUSAL_DECISION_CONTRACT_ANTI_SYMPTOM_LABEL,
  );
  errors.push(...validateCausalDecisionContractField(
    filePath,
    CAUSAL_DECISION_CONTRACT_ANTI_SYMPTOM_LABEL,
    antiSymptom,
  ));
  const falsifyingProbe = findCausalDecisionContractField(
    section,
    CAUSAL_DECISION_CONTRACT_FALSIFYING_PROBE_LABEL,
  );
  errors.push(...validateCausalDecisionContractField(
    filePath,
    CAUSAL_DECISION_CONTRACT_FALSIFYING_PROBE_LABEL,
    falsifyingProbe,
  ));
  if (
    falsifyingProbe !== null &&
    !MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(falsifyingProbe)
  ) {
    errors.push(
      `${filePath}: Causal Decision Contract ` +
      `${CAUSAL_DECISION_CONTRACT_FALSIFYING_PROBE_LABEL} must name a ` +
      'focused command.',
    );
  }
  errors.push(...validateCausalDecisionContractField(
    filePath,
    CAUSAL_DECISION_CONTRACT_COMPETING_EXPLANATIONS_LABEL,
    findCausalDecisionContractField(
      section,
      CAUSAL_DECISION_CONTRACT_COMPETING_EXPLANATIONS_LABEL,
    ),
  ));
  errors.push(...validateCausalDecisionContractField(
    filePath,
    CAUSAL_DECISION_CONTRACT_SYSTEMIC_INTERACTION_SCAN_LABEL,
    findCausalDecisionContractField(
      section,
      CAUSAL_DECISION_CONTRACT_SYSTEMIC_INTERACTION_SCAN_LABEL,
    ),
  ));
  errors.push(...validateCausalDecisionContractField(
    filePath,
    CAUSAL_DECISION_CONTRACT_PING_PONG_STOP_RULE_LABEL,
    findCausalDecisionContractField(
      section,
      CAUSAL_DECISION_CONTRACT_PING_PONG_STOP_RULE_LABEL,
    ),
  ));
  if (metadataRequiresOscillationGuard(metadata, options.status)) {
    const oscillationGuard = findCausalDecisionContractField(
      section,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_GUARD_LABEL,
    );
    errors.push(...validateCausalDecisionContractField(
      filePath,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_GUARD_LABEL,
      oscillationGuard,
    ));
    if (
      oscillationGuard !== null &&
      !/\b(?:oscillation|same-frontier|symptom|frontier)\b/iu.test(
        oscillationGuard,
      )
    ) {
      errors.push(
        `${filePath}: Causal Decision Contract ` +
        `${CAUSAL_DECISION_CONTRACT_OSCILLATION_GUARD_LABEL} must explain ` +
        'why this is not another same-frontier symptom patch.',
      );
    }
  }
  return errors;
}

function metadataRequiresDecisionExperimentGate(metadata, fileStatus) {
  return fileStatus === STATUS_ACTIVE &&
    metadata !== null &&
    coreLogicBriefRequiredForLane(metadataLane(metadata)) &&
    !metadataUsesClassificationOnlyFastPath(metadata) &&
    !metadataUsesPureClassificationFastPath(metadata);
}

function findDecisionExperimentGateField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
}

function validateDecisionExperimentGateField(filePath, label, value) {
  if (value === null) {
    return [`${filePath}: Decision Experiment Gate is missing ${label}.`];
  }
  if (
    value.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: Decision Experiment Gate ${label} must be concrete.`,
    ];
  }
  return [];
}

export function validateDecisionExperimentGate(
  content,
  metadata,
  filePath,
  options = {},
) {
  const requiresGate =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const section = extractDecisionExperimentGateSection(content);
  if (!section) {
    if (
      (
        metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD] &&
        metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.resultClassification &&
        !metadataHasWatchingFrontierOscillationGate(metadata)
      ) ||
      (
        metadata?.[ARCHITECTURE_DECISION_GATE_FIELD] &&
        metadata?.[ARCHITECTURE_DECISION_GATE_FIELD]?.choices &&
        !metadataHasWatchingFrontierOscillationGate(metadata)
      )
    ) {
      return [];
    }
    return requiresGate ?
      [
        `${filePath}: Decision Experiment Gate section is required before ` +
        'runtime/scenario implementation.',
      ] :
      [];
  }
  const errors = [];
  for (const label of DECISION_EXPERIMENT_FIELDS) {
    errors.push(...validateDecisionExperimentGateField(
      filePath,
      label,
      findDecisionExperimentGateField(section, label),
    ));
  }
  const architectureReview = findDecisionExperimentGateField(
    section,
    DECISION_EXPERIMENT_ARCHITECTURE_REVIEW_LABEL,
  );
  if (
    architectureReview !== null &&
    !DECISION_EXPERIMENT_ARCHITECTURE_REVIEW_PATTERN.test(architectureReview)
  ) {
    errors.push(
      `${filePath}: Decision Experiment Gate ` +
      `${DECISION_EXPERIMENT_ARCHITECTURE_REVIEW_LABEL} must name the ` +
      'owner, boundary, contract, architecture, route, or human review.',
    );
  }
  const competingHypotheses = findDecisionExperimentGateField(
    section,
    DECISION_EXPERIMENT_COMPETING_HYPOTHESES_LABEL,
  );
  if (
    metadataHasWatchingFrontierOscillationGate(metadata) &&
    competingHypotheses !== null &&
    !/\bH1\b[\s\S]*\bH2\b[\s\S]*\bH3\b[\s\S]*\b(?:different|discriminat|observable|predict)\b/iu.test(
      competingHypotheses,
    )
  ) {
    errors.push(
      `${filePath}: Decision Experiment Gate ` +
      `${DECISION_EXPERIMENT_COMPETING_HYPOTHESES_LABEL} must write a ` +
      'hypothesis discriminator that predicts different observables under H1 vs H2 vs H3 before runtime edits.',
    );
  }
  for (const label of [
    DECISION_EXPERIMENT_PRE_EDIT_PROBE_LABEL,
    DECISION_EXPERIMENT_REPRESENTATIVE_RERUN_LABEL,
  ]) {
    const value = findDecisionExperimentGateField(section, label);
    if (value !== null && !MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(value)) {
      errors.push(
        `${filePath}: Decision Experiment Gate ${label} must name a ` +
        'focused command.',
      );
    }
  }
  const successMetrics = findDecisionExperimentGateField(
    section,
    DECISION_EXPERIMENT_SUCCESS_METRICS_LABEL,
  );
  if (
    successMetrics !== null &&
    !DECISION_EXPERIMENT_SUCCESS_METRIC_PATTERN.test(successMetrics)
  ) {
    errors.push(
      `${filePath}: Decision Experiment Gate ` +
      `${DECISION_EXPERIMENT_SUCCESS_METRICS_LABEL} must name a concrete ` +
      'metric reduction, migration, representative green, count, or frontier move.',
    );
  }
  const killRule = findDecisionExperimentGateField(
    section,
    DECISION_EXPERIMENT_KILL_RULE_LABEL,
  );
  if (
    killRule !== null &&
    !DECISION_EXPERIMENT_KILL_RULE_PATTERN.test(killRule)
  ) {
    errors.push(
      `${filePath}: Decision Experiment Gate ` +
      `${DECISION_EXPERIMENT_KILL_RULE_LABEL} must stop or escalate on ` +
      'unchanged same-frontier/no-reduction evidence.',
    );
  }
  return errors;
}

function validateSprintStrategyBriefField(filePath, label, value) {
  if (value === null) {
    return [`${filePath}: Sprint Strategy Brief is missing ${label}.`];
  }
  if (
    value.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: Sprint Strategy Brief ${label} must be a concrete value.`,
    ];
  }
  return [];
}

export function validateSprintStrategyBrief(content, filePath, options = {}) {
  const requiresBrief =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const section = extractSprintStrategyBriefSection(content);
  if (!section) {
    return requiresBrief ?
      [`${filePath}: Sprint Strategy Brief section is required.`] :
      [];
  }
  const errors = [];
  for (const label of SPRINT_STRATEGY_BRIEF_FIELDS) {
    errors.push(
      ...validateSprintStrategyBriefField(
        filePath,
        label,
        findSprintStrategyBriefField(section, label),
      ),
    );
  }
  return errors;
}

function isTheoryLoopSprint(content, filePath = EMPTY_TEXT) {
  return (
    /^## Theory Loop Sprint\b/mu.test(content) ||
    (
      /^## Theory Option Set\b/mu.test(content) &&
      /^## Discriminator First\b/mu.test(content) &&
      /^## Real Package Rule\b/mu.test(content)
    ) ||
    (
      /theory-loop/iu.test(normalizeLedgerText(filePath)) &&
      /^## Theory Loop Generative Brief\b/mu.test(content)
    )
  );
}

function validateConcreteTheoryLoopSuccessField(filePath, label, value) {
  if (value === null) {
    return [
      `${filePath}: Theory Loop Success Evidence is missing ${label}.`,
    ];
  }
  if (
    value.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: Theory Loop Success Evidence ${label} must be a concrete value.`,
    ];
  }
  return [];
}

export function validateTheoryLoopSprintClosure(
  content,
  filePath,
  options = {},
) {
  const status = options.status || EMPTY_TEXT;
  if (!isTheoryLoopSprint(content, filePath) || status !== STATUS_DONE) {
    return [];
  }
  const evidenceAnchorSection = extractTheoryLoopEvidenceAnchorSection(content);
  const originalSuccessCondition = evidenceAnchorSection ?
    findTheoryLoopSuccessEvidenceField(
      evidenceAnchorSection,
      THEORY_LOOP_ORIGINAL_SUCCESS_CONDITION_LABEL,
    ) :
    null;
  const section = extractTheoryLoopSuccessEvidenceSection(content);
  if (!section) {
    return [
      `${filePath}: theory-loop sprint is marked done but lacks ` +
      `${THEORY_LOOP_SUCCESS_EVIDENCE_HEADING}; theory-loop sprints must ` +
      'continue until the original success condition is met by fresh representative evidence.',
    ];
  }
  const errors = [];
  const successConditionMet = findTheoryLoopSuccessEvidenceField(
    section,
    THEORY_LOOP_SUCCESS_CONDITION_MET_LABEL,
  );
  const freshEvidence = findTheoryLoopSuccessEvidenceField(
    section,
    THEORY_LOOP_FRESH_REPRESENTATIVE_EVIDENCE_LABEL,
  );
  const result = findTheoryLoopSuccessEvidenceField(
    section,
    THEORY_LOOP_RESULT_LABEL,
  );
  const matchedSuccessCondition = findTheoryLoopSuccessEvidenceField(
    section,
    THEORY_LOOP_MATCHED_SUCCESS_CONDITION_LABEL,
  );
  const continuationStopped = findTheoryLoopSuccessEvidenceField(
    section,
    THEORY_LOOP_CONTINUATION_STOPPED_LABEL,
  );
  errors.push(...validateConcreteTheoryLoopSuccessField(
    filePath,
    THEORY_LOOP_ORIGINAL_SUCCESS_CONDITION_LABEL,
    originalSuccessCondition,
  ));
  if (
    originalSuccessCondition !== null &&
    THEORY_LOOP_FORBIDDEN_SUCCESS_CONDITION_PATTERN.test(originalSuccessCondition)
  ) {
    errors.push(
      `${filePath}: Evidence Anchor ${THEORY_LOOP_ORIGINAL_SUCCESS_CONDITION_LABEL} ` +
      'must name the original representative or release success metric, not an alternate stop such as architecture-gap, owner-boundary-migration, classification, or route selection.',
    );
  }
  errors.push(...validateConcreteTheoryLoopSuccessField(
    filePath,
    THEORY_LOOP_SUCCESS_CONDITION_MET_LABEL,
    successConditionMet,
  ));
  errors.push(...validateConcreteTheoryLoopSuccessField(
    filePath,
    THEORY_LOOP_FRESH_REPRESENTATIVE_EVIDENCE_LABEL,
    freshEvidence,
  ));
  errors.push(...validateConcreteTheoryLoopSuccessField(
    filePath,
    THEORY_LOOP_RESULT_LABEL,
    result,
  ));
  errors.push(...validateConcreteTheoryLoopSuccessField(
    filePath,
    THEORY_LOOP_MATCHED_SUCCESS_CONDITION_LABEL,
    matchedSuccessCondition,
  ));
  errors.push(...validateConcreteTheoryLoopSuccessField(
    filePath,
    THEORY_LOOP_CONTINUATION_STOPPED_LABEL,
    continuationStopped,
  ));
  if (normalizeLedgerText(successConditionMet).toLowerCase() !== 'yes') {
    errors.push(
      `${filePath}: Theory Loop Success Evidence ` +
      `${THEORY_LOOP_SUCCESS_CONDITION_MET_LABEL} must be exactly "yes" before the sprint can close.`,
    );
  }
  const normalizedResult = normalizeLedgerText(result).toLowerCase();
  if (
    normalizedResult.length > NUM_ZERO &&
    normalizedResult !== THEORY_LOOP_SUCCESS_RESULT_VALUE
  ) {
    errors.push(
      `${filePath}: Theory Loop Success Evidence ${THEORY_LOOP_RESULT_LABEL} ` +
      `must be ${THEORY_LOOP_SUCCESS_RESULT_VALUE}; architecture-gap, ` +
      'migration, classification, or route selection are package learning ' +
      'outcomes, not sprint success.',
    );
  }
  if (
    originalSuccessCondition !== null &&
    matchedSuccessCondition !== null &&
    matchedSuccessCondition !== originalSuccessCondition
  ) {
    errors.push(
      `${filePath}: Theory Loop Success Evidence ` +
      `${THEORY_LOOP_MATCHED_SUCCESS_CONDITION_LABEL} must exactly match the ` +
      `original Evidence Anchor ${THEORY_LOOP_ORIGINAL_SUCCESS_CONDITION_LABEL}.`,
    );
  }
  const closureText = [
    originalSuccessCondition,
    successConditionMet,
    freshEvidence,
    result,
    matchedSuccessCondition,
    continuationStopped,
  ].map(normalizeLedgerText).join(' ');
  if (THEORY_LOOP_UNFINISHED_RESULT_PATTERN.test(closureText)) {
    errors.push(
      `${filePath}: Theory Loop Success Evidence describes unfinished work; ` +
      'same-frontier, classification-only, needs-rerun, pending, unknown, or not-met results cannot close a theory-loop sprint.',
    );
  }
  return errors;
}

function validateModelFitField(filePath, label, value) {
  if (value === null) {
    return [`${filePath}: Model Fit is missing ${label}.`];
  }
  if (
    value.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
    value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [`${filePath}: Model Fit ${label} must be a concrete value.`];
  }
  return [];
}

function isSparkSafeModelFit(fields) {
  return fields[MODEL_FIT_PACKAGE_CLASS_LABEL] === MODEL_FIT_SPARK_SAFE_CLASS ||
    (fields[MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL] || EMPTY_TEXT)
      .toLowerCase()
      .includes(MODEL_FIT_SPARK_MODEL);
}

function validateSparkSafeModelFit(content, filePath, fields) {
  const errors = [];
  const intendedModel = fields[MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL] ||
    EMPTY_TEXT;
  if (!intendedModel.toLowerCase().includes(MODEL_FIT_SPARK_MODEL)) {
    errors.push(
      `${filePath}: gpt-5.3-codex-spark Model Fit intended minimum model ` +
      'must include ' +
      `${MODEL_FIT_SPARK_MODEL}.`,
    );
  }
  if (fields[MODEL_FIT_SCOPE_SHAPE_LABEL] !== MODEL_FIT_LEAF_SLICE_SCOPE) {
    errors.push(
      `${filePath}: gpt-5.3-codex-spark Model Fit scope shape must be ` +
      `${MODEL_FIT_LEAF_SLICE_SCOPE}.`,
    );
  }
  for (const label of MODEL_FIT_REQUIRED_SPARK_LABELS) {
    errors.push(...validateModelFitField(filePath, label, fields[label]));
  }
  if (
    fields[MODEL_FIT_FOCUSED_PROOF_LABEL] &&
    !MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(
      fields[MODEL_FIT_FOCUSED_PROOF_LABEL],
    )
  ) {
    errors.push(
      `${filePath}: gpt-5.3-codex-spark Model Fit focused proof must ` +
      'name a focused ' +
      'command.',
    );
  }
  if (
    MODEL_FIT_OPEN_ENDED_FRONTIER_PATTERNS.some((pattern) =>
      pattern.test(content))
  ) {
    errors.push(
      `${filePath}: gpt-5.3-codex-spark Model Fit must not contain open-ended ` +
      'frontier language.',
    );
  }
  return errors;
}

export function validateModelFitContract(content, filePath, options = {}) {
  const metadata = options.metadata;
  if (metadata && metadata.modelFit) {
    const fields = {
      [MODEL_FIT_PACKAGE_CLASS_LABEL]: metadata.modelFit.packageClass,
      [MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL]:
        metadata.modelFit.intendedMinimumModel,
      [MODEL_FIT_SCOPE_SHAPE_LABEL]: metadata.modelFit.scopeShape,
      [MODEL_FIT_OUTPUT_PROFILE_LABEL]: metadata.modelFit.outputProfile,
    };
    const errors = [
      ...validateModelFitField(
        filePath,
        MODEL_FIT_PACKAGE_CLASS_LABEL,
        fields[MODEL_FIT_PACKAGE_CLASS_LABEL],
      ),
      ...validateModelFitField(
        filePath,
        MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL,
        fields[MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL],
      ),
      ...validateModelFitField(
        filePath,
        MODEL_FIT_SCOPE_SHAPE_LABEL,
        fields[MODEL_FIT_SCOPE_SHAPE_LABEL],
      ),
      ...validateModelFitField(
        filePath,
        MODEL_FIT_OUTPUT_PROFILE_LABEL,
        fields[MODEL_FIT_OUTPUT_PROFILE_LABEL],
      ),
    ];
    if (
      fields[MODEL_FIT_OUTPUT_PROFILE_LABEL] &&
      !VALID_OUTPUT_PROFILES.includes(fields[MODEL_FIT_OUTPUT_PROFILE_LABEL])
    ) {
      errors.push(
        `${filePath}: metadata.modelFit.outputProfile must be one ` +
          `of ${VALID_OUTPUT_PROFILES.join(', ')}.`,
      );
    }
    if (options[LEDGER_VALIDATION_REQUIRES_LEDGER]) {
      const ambiguityScore = metadata.modelFit.ambiguityScore;
      if (ambiguityScore === undefined) {
        errors.push(
          `${filePath}: metadata.modelFit.ambiguityScore is required for active packages ` +
            `to guard against high-entropy subagent execution loops.`
        );
      } else {
        const score = Number(ambiguityScore);
        if (!Number.isInteger(score) || score < 1 || score > 5) {
          errors.push(
            `${filePath}: metadata.modelFit.ambiguityScore must be an integer between 1 and 5 inclusive.`
          );
        } else if (score > 3 && options.phase !== VALIDATION_PHASE_ENTRY) {
          errors.push(
            `${filePath}: metadata.modelFit.ambiguityScore is ${score} (> 3), which requires ` +
              `escalation to a stronger model or human split before implementation.`
          );
        }
      }
    }
    return errors;
  }
  const section = extractModelFitSection(content);
  if (!section) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [`${filePath}: Model Fit section is required.`] :
      [];
  }
  const fields = {
    [MODEL_FIT_PACKAGE_CLASS_LABEL]: findModelFitField(
      section,
      MODEL_FIT_PACKAGE_CLASS_LABEL,
    ),
    [MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL]: findModelFitField(
      section,
      MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL,
    ),
    [MODEL_FIT_SCOPE_SHAPE_LABEL]: findModelFitField(
      section,
      MODEL_FIT_SCOPE_SHAPE_LABEL,
    ),
    [MODEL_FIT_OUTPUT_PROFILE_LABEL]: findModelFitField(
      section,
      MODEL_FIT_OUTPUT_PROFILE_LABEL,
    ),
    [MODEL_FIT_OWNED_FILES_LABEL]: findModelFitField(
      section,
      MODEL_FIT_OWNED_FILES_LABEL,
    ),
    [MODEL_FIT_FORBIDDEN_FILES_LABEL]: findFirstModelFitField(
      section,
      [
        MODEL_FIT_DO_NOT_EDIT_SCOPE_LABEL,
        MODEL_FIT_FORBIDDEN_FILES_LABEL,
      ],
    ),
    [MODEL_FIT_FROZEN_DECISIONS_LABEL]: findModelFitField(
      section,
      MODEL_FIT_FROZEN_DECISIONS_LABEL,
    ),
    [MODEL_FIT_ESCALATION_TRIGGERS_LABEL]: findModelFitField(
      section,
      MODEL_FIT_ESCALATION_TRIGGERS_LABEL,
    ),
    [MODEL_FIT_FOCUSED_PROOF_LABEL]: findModelFitField(
      section,
      MODEL_FIT_FOCUSED_PROOF_LABEL,
    ),
  };
  const errors = [
    ...validateModelFitField(
      filePath,
      MODEL_FIT_PACKAGE_CLASS_LABEL,
      fields[MODEL_FIT_PACKAGE_CLASS_LABEL],
    ),
    ...validateModelFitField(
      filePath,
      MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL,
      fields[MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL],
    ),
    ...validateModelFitField(
      filePath,
      MODEL_FIT_SCOPE_SHAPE_LABEL,
      fields[MODEL_FIT_SCOPE_SHAPE_LABEL],
    ),
  ];
  if (
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] ||
    fields[MODEL_FIT_OUTPUT_PROFILE_LABEL] !== null
  ) {
    errors.push(...validateModelFitField(
      filePath,
      MODEL_FIT_OUTPUT_PROFILE_LABEL,
      fields[MODEL_FIT_OUTPUT_PROFILE_LABEL],
    ));
  }
  if (
    fields[MODEL_FIT_OUTPUT_PROFILE_LABEL] &&
    !VALID_OUTPUT_PROFILES.includes(fields[MODEL_FIT_OUTPUT_PROFILE_LABEL])
  ) {
    errors.push(
      `${filePath}: Model Fit ${MODEL_FIT_OUTPUT_PROFILE_LABEL} must be one ` +
      `of ${VALID_OUTPUT_PROFILES.join(', ')}.`,
    );
  }
  if (isSparkSafeModelFit(fields)) {
    errors.push(...validateSparkSafeModelFit(content, filePath, fields));
  }
  return errors;
}

function isObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isScenarioDrivenMetadata(metadata) {
  if (metadataLane(metadata) === LANE_FAST_SPIKE) {
    return false;
  }
  const scenario = normalizeLedgerText(metadata?.scenario).toLowerCase();
  return scenario.length > NUM_ZERO &&
    scenario !== SCENARIO_NONE &&
    scenario !== SCENARIO_UNKNOWN &&
    scenario !== SCENARIO_TEMPLATE_VALUE;
}

function collectMetadataText(value, texts = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMetadataText(item, texts);
    }
    return texts;
  }
  if (isObjectRecord(value)) {
    for (const item of Object.values(value)) {
      collectMetadataText(item, texts);
    }
    return texts;
  }
  if (value !== null && value !== undefined) {
    const text = normalizeLedgerText(value);
    if (text.length > NUM_ZERO) {
      texts.push(text);
    }
  }
  return texts;
}

function metadataIsDiagnosticsOrClassification(metadata) {
  const metadataKind = [
    metadataLane(metadata),
    metadata?.owner,
    metadata?.boundary,
    metadata?.dominantReason,
  ].map(normalizeLedgerText).join(' ');
  return DIAGNOSTICS_CLASSIFICATION_METADATA_PATTERN.test(metadataKind);
}

function metadataKeepsRepresentativeResidualLive(metadata) {
  return REPRESENTATIVE_RESIDUAL_LIVE_CLAIM_PATTERN.test(
    collectMetadataText(metadata).join(' '),
  );
}

function metadataRequiresRepresentativeResidual(metadata, fileStatus) {
  return fileStatus === STATUS_ACTIVE &&
    metadata !== null &&
    metadataIsDiagnosticsOrClassification(metadata) &&
    metadataKeepsRepresentativeResidualLive(metadata);
}

function textMentionsValue(text, value) {
  const normalizedText = normalizeLedgerText(text).toLowerCase();
  const normalizedValue = normalizeLedgerText(value).toLowerCase();
  return normalizedValue.length > NUM_ZERO &&
    normalizedText.includes(normalizedValue);
}

function metadataLane(metadata) {
  return normalizeLedgerText(metadata?.[METADATA_LANE_FIELD]).toLowerCase();
}

function metadataIsExperimentLane(metadata) {
  return [
    LANE_EXPERIMENT,
    LANE_BOUNDED_EXPERIMENT,
  ].includes(metadataLane(metadata));
}

function metadataScenarioKey(metadata) {
  return normalizeLedgerText(metadata?.scenario).toLowerCase();
}

function ownerBoundaryKey(owner, boundary) {
  const normalizedOwner = normalizeLedgerText(owner).toLowerCase();
  const normalizedBoundary = normalizeLedgerText(boundary).toLowerCase();
  if (
    normalizedOwner.length === NUM_ZERO ||
    normalizedBoundary.length === NUM_ZERO
  ) {
    return EMPTY_TEXT;
  }
  return `${normalizedOwner}/${normalizedBoundary}`;
}

function metadataOwnerBoundaryKey(metadata) {
  return ownerBoundaryKey(metadata?.owner, metadata?.boundary);
}

function scenarioClosureResult(metadata) {
  return normalizeLedgerText(
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.[
      SCENARIO_CAUSAL_CLOSURE_RESULT_CLASSIFICATION_FIELD
    ] ||
      metadata?.[CAUSAL_GOVERNANCE_METADATA_FIELD]?.[
        CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD
      ],
  ).toLowerCase();
}

export function metadataHasClassificationOnlyOutcome(metadata = {}) {
  const outcomeValues = [
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.[
      SCENARIO_CAUSAL_CLOSURE_RESULT_CLASSIFICATION_FIELD
    ],
    metadata?.[CAUSAL_GOVERNANCE_METADATA_FIELD]?.[
      CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD
    ],
    metadata?.[REPRESENTATIVE_RESIDUAL_METADATA_FIELD]?.[
      REPRESENTATIVE_RESIDUAL_STATUS_FIELD
    ],
    scenarioClosureResult(metadata),
  ].map((value) => normalizeLedgerText(value).toLowerCase());
  return outcomeValues.includes(CLASSIFICATION_ONLY_RESULT);
}

export function metadataUsesClassificationOnlyFastPath(metadata = {}) {
  return metadataHasClassificationOnlyOutcome(metadata) &&
    !hasImplementationWriteScope(metadata);
}

function metadataHasClassificationEfficiency(metadata = {}) {
  return isObjectRecord(metadata?.[CLASSIFICATION_EFFICIENCY_FIELD]);
}

export function metadataHasPureClassificationIntent(metadata = {}) {
  return metadata &&
    isScenarioDrivenMetadata(metadata) &&
    (
      metadataLane(metadata) === LANE_DIAGNOSTIC_CLASSIFICATION ||
      metadataHasClassificationOnlyOutcome(metadata) ||
      metadataHasClassificationEfficiency(metadata)
    );
}

function metadataIsPureClassificationPackage(metadata = {}) {
  return metadataHasPureClassificationIntent(metadata) &&
    !hasImplementationWriteScope(metadata);
}

export function metadataUsesPureClassificationFastPath(metadata = {}) {
  return metadataIsPureClassificationPackage(metadata) &&
    metadataHasClassificationEfficiency(metadata);
}

export function metadataAllowsRepairDirtyScopeAutocomplete(metadata = {}) {
  return !metadataHasPureClassificationIntent(metadata);
}

function isMaterialOscillationResult(metadata) {
  const result = scenarioClosureResult(metadata);
  return result.length === NUM_ZERO ||
    FRONTIER_OSCILLATION_MATERIAL_RESULTS.includes(result);
}

function extractFrontierOscillationDateKey(value) {
  const text = normalizeLedgerText(value);
  const dashMatch = FRONTIER_OSCILLATION_DATE_DASH_PATTERN.exec(text);
  if (dashMatch) {
    return `${dashMatch[NUM_ONE]}${dashMatch[NUM_TWO]}${dashMatch[NUM_THREE]}`;
  }
  const compactMatch = FRONTIER_OSCILLATION_DATE_COMPACT_PATTERN.exec(text);
  return compactMatch ? compactMatch[NUM_ONE] : EMPTY_TEXT;
}

function frontierHistorySortKey(entry = {}) {
  const metadata = entry.metadata || {};
  return [
    extractFrontierOscillationDateKey(metadata.closed),
    extractFrontierOscillationDateKey(metadata.opened),
    extractFrontierOscillationDateKey(entry.filePath),
    normalizeLedgerText(entry.filePath),
  ].join('|');
}

function normalizeFrontierHistoryEntry(entry = {}) {
  const metadata = entry.metadata || {};
  return {
    filePath: normalizeLedgerText(entry.filePath),
    metadata,
    ownerBoundaryKey: metadataOwnerBoundaryKey(metadata),
    scenarioKey: metadataScenarioKey(metadata),
    sortKey: normalizeLedgerText(entry.sortKey) || frontierHistorySortKey(entry),
  };
}

function sortedFrontierHistoryEntries(entries = []) {
  return entries
    .map(normalizeFrontierHistoryEntry)
    .filter((entry) =>
      entry.filePath.length > NUM_ZERO &&
      entry.ownerBoundaryKey.length > NUM_ZERO &&
      entry.scenarioKey.length > NUM_ZERO)
    .sort((left, right) => right.sortKey.localeCompare(left.sortKey));
}

export function metadataRequiresSubagentSequencing(metadata) {
  if (!metadata) {
    return false;
  }
  if (
    metadataUsesClassificationOnlyFastPath(metadata) ||
    metadataUsesPureClassificationFastPath(metadata)
  ) {
    return false;
  }
  return !SUBAGENT_OPTIONAL_LANES.includes(metadataLane(metadata));
}

export function metadataRequiresFreshnessReview(metadata) {
  if (!metadata) {
    return false;
  }
  const freshnessMode = normalizeLedgerText(
    metadata.freshness || metadata.gates?.freshness || metadata.strictFreshness,
  );
  return freshnessMode === 'strict' || metadataRequiresSubagentSequencing(metadata);
}

export function metadataRequiresVerificationFix(metadata) {
  if (!metadata) {
    return false;
  }
  const scopedPaths = [
    ...metadataScopeList(metadata, SCOPE_FIELD_WRITE_SCOPE),
    ...metadataScopeList(metadata, SCOPE_FIELD_COMMIT_SCOPE),
  ];
  return scopedPaths.some((filePath) =>
    VERIFICATION_FIX_SCOPE_PATTERN.test(normalizeLedgerText(filePath)));
}

function validateCausalGovernanceField(filePath, fieldName, value) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: causalGovernance.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

function validateRepresentativeResidualField(filePath, fieldName, value) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: representativeResidual.${fieldName} must be a ` +
      'concrete value.',
    ];
  }
  return [];
}

export function validateRepresentativeResidualContract(
  metadata,
  filePath,
  options = {},
) {
  const requiresResidual =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const representativeResidual =
    metadata?.[REPRESENTATIVE_RESIDUAL_METADATA_FIELD];
  if (!representativeResidual) {
    return requiresResidual ?
      [
        `${filePath}: metadata representativeResidual is required because ` +
        'this active diagnostics/classification package keeps the sprint ' +
        'representative residual live.',
      ] :
      [];
  }
  if (!isObjectRecord(representativeResidual)) {
    return [
      `${filePath}: metadata representativeResidual must be an object.`,
    ];
  }

  const errors = [];
  for (const fieldName of REPRESENTATIVE_RESIDUAL_REQUIRED_FIELDS) {
    errors.push(
      ...validateRepresentativeResidualField(
        filePath,
        fieldName,
        representativeResidual[fieldName],
      ),
    );
  }

  const artifact = normalizeLedgerText(
    representativeResidual[REPRESENTATIVE_RESIDUAL_ARTIFACT_FIELD],
  );
  if (
    artifact.length > NUM_ZERO &&
    !SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN.test(artifact)
  ) {
    errors.push(
      `${filePath}: representativeResidual.artifact must name a report ` +
      'or proof artifact path.',
    );
  }

  const packageScenario = normalizeLedgerText(metadata?.scenario).toLowerCase();
  const residualScenario = normalizeLedgerText(
    representativeResidual[REPRESENTATIVE_RESIDUAL_SCENARIO_FIELD],
  ).toLowerCase();
  if (
    packageScenario.length > NUM_ZERO &&
    residualScenario.length > NUM_ZERO &&
    packageScenario !== SCENARIO_NONE &&
    packageScenario !== SCENARIO_UNKNOWN &&
    packageScenario !== SCENARIO_TEMPLATE_VALUE &&
    packageScenario !== residualScenario
  ) {
    errors.push(
      `${filePath}: representativeResidual.scenario must match package ` +
      'scenario.',
    );
  }

  return errors;
}

export function findActiveSprintFileSync() {
  try {
    if (!fsSync.existsSync(WORK_SPRINTS_DIR)) {
      return null;
    }
    const files = fsSync.readdirSync(WORK_SPRINTS_DIR);
    for (const file of files) {
      const fullPath = path.join(WORK_SPRINTS_DIR, file);
      if (isGeneratedCurrentBlockerPath(fullPath)) {
        continue;
      }
      if (file.endsWith('.md') && file.startsWith('active-')) {
        return fullPath;
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export function metadataRequiresProgressContract(metadata, fileStatus, filePath) {
  if (fileStatus !== STATUS_ACTIVE || !metadata || !filePath) {
    return false;
  }
  const activeSprintFile = findActiveSprintFileSync();
  if (!activeSprintFile) {
    return false;
  }
  if (!activeSprintFile.includes('owner-boundary-progress-contract-transformation')) {
    return false;
  }
  const isProgressLane = [
    LANE_RUNTIME_OWNER_BOUNDARY,
    LANE_CAUSAL_ESCALATION,
    LANE_SCENARIO_RELEASE_GATE,
    LANE_SINGLE_FILE_RUNTIME,
  ].includes(metadata.lane);
  if (!isProgressLane) {
    return false;
  }
  try {
    const filename = path.basename(filePath);
    const sprintContent = fsSync.readFileSync(activeSprintFile, 'utf8');
    return sprintContent.includes(filename);
  } catch (err) {
    return false;
  }
}


export function validateProgressContract(metadata, filePath, options = {}) {
  const requiresProgressContract = options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const progressContract = metadata?.progressContract;
  if (!progressContract) {
    return requiresProgressContract ?
      [`${filePath}: metadata progressContract is required.`] :
      [];
  }
  if (!isObjectRecord(progressContract)) {
    return [`${filePath}: metadata progressContract must be an object.`];
  }

  const requiredFields = [
    'owner',
    'boundary',
    'state',
    'reason',
    'nextAction',
    'wakeSource',
    'retryAfterMs',
    'terminalState',
    'evidencePath',
    'blockingDependency'
  ];

  const errors = [];
  for (const fieldName of requiredFields) {
    const value = progressContract[fieldName];
    if (fieldName === 'retryAfterMs') {
      if (typeof value !== 'number' || value < 0) {
        errors.push(`${filePath}: progressContract.retryAfterMs must be a non-negative number.`);
      }
    } else {
      const normalizedValue = normalizeLedgerText(value);
      if (
        normalizedValue.length === 0 ||
        MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
        LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
        normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
      ) {
        errors.push(`${filePath}: progressContract.${fieldName} must be a concrete value.`);
      }
    }
  }

  return errors;
}


export function validateCausalGovernanceContract(
  metadata,
  filePath,
  options = {},
) {
  const requiresGovernance =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const causalGovernance = metadata?.[CAUSAL_GOVERNANCE_METADATA_FIELD];
  if (!causalGovernance) {
    return requiresGovernance ?
      [`${filePath}: metadata causalGovernance is required.`] :
      [];
  }
  if (!isObjectRecord(causalGovernance)) {
    return [`${filePath}: metadata causalGovernance must be an object.`];
  }

  const errors = [];
  for (const fieldName of CAUSAL_GOVERNANCE_REQUIRED_FIELDS) {
    errors.push(
      ...validateCausalGovernanceField(
        filePath,
        fieldName,
        causalGovernance[fieldName],
      ),
    );
  }

  const representativeOutcome = normalizeLedgerText(
    causalGovernance[CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD],
  ).toLowerCase();
  if (
    representativeOutcome.length > NUM_ZERO &&
    !CAUSAL_GOVERNANCE_VALID_OUTCOMES.includes(representativeOutcome)
  ) {
    errors.push(
      `${filePath}: causalGovernance.representativeOutcome must be one of ` +
      CAUSAL_GOVERNANCE_VALID_OUTCOMES.join(', ') + '.',
    );
  }
  if (
    ((fileStatus === STATUS_DONE || (
      fileStatus !== STATUS_SUPERSEDED &&
      options.phase === VALIDATION_PHASE_CLOSURE
    ))) &&
    (representativeOutcome === CAUSAL_GOVERNANCE_PENDING_OUTCOME || representativeOutcome === 'pending-before-rerun')
  ) {
    errors.push(
      `${filePath}: cannot close scenario-driven package while ` +
      `causalGovernance.representativeOutcome remains "${representativeOutcome}". ` +
      `Rerun the causal model analyzer and record the validated outcome.`,
    );
  }
  if (
    !CAUSAL_GOVERNANCE_CAUSAL_MODEL_COMMAND_PATTERN.test(
      normalizeLedgerText(
        causalGovernance[CAUSAL_GOVERNANCE_STOP_CONDITION_FIELD],
      ),
    )
  ) {
    errors.push(
      `${filePath}: causalGovernance.stopConditionCheck must cite ` +
      '`npm run analyze:causal-model`.',
    );
  }
  return errors;
}

function validateScenarioCausalClosureConcreteValue(filePath, fieldName, value) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: scenarioCausalClosure.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

function validateScenarioCausalClosureArrayField(
  filePath,
  fieldName,
  values,
) {
  if (!Array.isArray(values) || values.length === NUM_ZERO) {
    return [
      `${filePath}: scenarioCausalClosure.${fieldName} must be a ` +
      'non-empty array.',
    ];
  }
  const errors = [];
  for (let index = NUM_ZERO; index < values.length; index += NUM_ONE) {
    errors.push(
      ...validateScenarioCausalClosureConcreteValue(
        filePath,
        `${fieldName}[${index}]`,
        values[index],
      ),
    );
  }
  return errors;
}

export function validateScenarioCausalClosureContract(
  metadata,
  filePath,
  options = {},
) {
  const requiresClosure =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const scenarioCausalClosure =
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD];
  if (!scenarioCausalClosure) {
    return requiresClosure ?
      [`${filePath}: metadata scenarioCausalClosure is required.`] :
      [];
  }
  if (!isObjectRecord(scenarioCausalClosure)) {
    return [`${filePath}: metadata scenarioCausalClosure must be an object.`];
  }

  const errors = [];
  for (const fieldName of SCENARIO_CAUSAL_CLOSURE_TEXT_FIELDS) {
    errors.push(
      ...validateScenarioCausalClosureConcreteValue(
        filePath,
        fieldName,
        scenarioCausalClosure[fieldName],
      ),
    );
  }
  for (const fieldName of SCENARIO_CAUSAL_CLOSURE_ARRAY_FIELDS) {
    errors.push(
      ...validateScenarioCausalClosureArrayField(
        filePath,
        fieldName,
        scenarioCausalClosure[fieldName],
      ),
    );
  }

  const resultClassification = normalizeLedgerText(
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_RESULT_CLASSIFICATION_FIELD
    ],
  ).toLowerCase();
  if (
    resultClassification.length > NUM_ZERO &&
    !SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS.includes(
      resultClassification,
    )
  ) {
    errors.push(
      `${filePath}: scenarioCausalClosure.resultClassification must be one ` +
      'of ' +
      SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS.join(', ') +
      '.',
    );
  }

  const stopCondition = normalizeLedgerText(
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_STOP_CONDITION_FIELD],
  ).toLowerCase();
  if (
    stopCondition.length > NUM_ZERO &&
    !SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS.includes(stopCondition)
  ) {
    errors.push(
      `${filePath}: scenarioCausalClosure.stopCondition must be one of ` +
      SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS.join(', ') +
      '.',
    );
  }

  if (
    !SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISM_PATTERN.test(
      normalizeLedgerText(
        scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_FIELD],
      ),
    )
  ) {
    errors.push(
      `${filePath}: scenarioCausalClosure.boundedProgressProof must mention ` +
      'a concrete wake, retry, timeout, reconcile, drain, dispatch, delivery, ' +
      'timer, advance, or bounded progress mechanism.',
    );
  }
  if (
    !MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(
      normalizeLedgerText(
        scenarioCausalClosure[
          SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_PROBE_FIELD
        ],
      ),
    )
  ) {
    errors.push(
      `${filePath}: scenarioCausalClosure.missingCausalEdgeProbe must ` +
      'name a focused command.',
    );
  }
  if (
    !SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN.test(
      normalizeLedgerText(
        scenarioCausalClosure[
          SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_ARTIFACT_FIELD
        ],
      ),
    )
  ) {
    errors.push(
      `${filePath}: scenarioCausalClosure.boundedProgressProofArtifact ` +
      'must name a path or proof artifact.',
    );
  }
  if (
    metadata &&
    options.status === STATUS_ACTIVE &&
    (metadataLane(metadata) === 'runtime-owner-boundary' || metadataLane(metadata) === 'scenario-release-gate') &&
    (options.phase === VALIDATION_PHASE_PRE_IMPL || options.phase === VALIDATION_PHASE_CLOSURE)
  ) {
    const falsifyingProbe = normalizeLedgerText(
      scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FALSIFYING_PROBE_FIELD],
    );
    if (!MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(falsifyingProbe)) {
      errors.push(
        `${filePath}: scenarioCausalClosure.falsifyingProbe must name a focused npm test command ` +
        `to serve as the falsifying blocker probe in runtime lanes.`
      );
    }
  }

  return errors;
}

function metadataHasWatchingFrontierOscillationGate(metadata = {}) {
  const gate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  return isObjectRecord(gate) &&
    normalizeLedgerText(gate.status) ===
      ARCHITECTURE_DECISION_GATE_STATUS_WATCHING &&
    normalizeLedgerText(gate.trigger) ===
      ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION;
}

function metadataRequiresObservablePrediction(metadata, fileStatus, phase) {
  if (
    fileStatus !== STATUS_ACTIVE ||
    phase === VALIDATION_PHASE_ENTRY ||
    !metadata
  ) {
    return false;
  }
  return metadataLane(metadata) === LANE_EXPERIMENT ||
    metadataHasWatchingFrontierOscillationGate(metadata) ||
    metadataPredictsRepresentativeMovement(metadata);
}

function metadataRequiresExperimentOutcome(metadata, fileStatus, phase) {
  return metadataLane(metadata) === LANE_EXPERIMENT &&
    phase === VALIDATION_PHASE_CLOSURE &&
    [STATUS_ACTIVE, STATUS_DONE].includes(fileStatus);
}

function predictionEvidenceIsCommandOrArtifact(evidence) {
  return MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(evidence) ||
    SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN.test(evidence);
}

function metadataPredictsRepresentativeMovement(metadata = {}) {
  if (
    metadataHasClassificationOnlyOutcome(metadata) &&
    !hasImplementationWriteScope(metadata)
  ) {
    return false;
  }
  if (
    ![
      LANE_RUNTIME_OWNER_BOUNDARY,
      LANE_SINGLE_FILE_RUNTIME,
      LANE_SCENARIO_RELEASE_GATE,
      LANE_CAUSAL_ESCALATION,
    ].includes(metadataLane(metadata))
  ) {
    return false;
  }
  return [
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.[
      SCENARIO_CAUSAL_CLOSURE_EXPECTED_OBSERVABLE_TRANSITION_FIELD
    ],
    metadata?.[RERUN_DECISION_FIELD]?.[RERUN_DECISION_EXPECTED_DELTA_FIELD],
    metadata?.[CAUSAL_GOVERNANCE_METADATA_FIELD]?.[
      CAUSAL_GOVERNANCE_EXPECTED_CHANGE_FIELD
    ],
  ].some((value) => {
    const normalized = normalizeLedgerText(value);
    return normalized.length > NUM_ZERO &&
      !REPRESENTATIVE_CLASSIFICATION_ONLY_PATTERN.test(normalized) &&
      REPRESENTATIVE_MOVEMENT_PREDICTION_PATTERN.test(normalized);
  });
}

function validateObservablePredictionConcreteValue(filePath, fieldName, value) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: ${OBSERVABLE_PREDICTION_FIELD}.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

function predictionValuesMatch(predicted, observed) {
  return normalizeLedgerText(predicted).toLowerCase() ===
    normalizeLedgerText(observed).toLowerCase();
}

function observablePredictionMetricDeltaIsPresent(value) {
  return value !== null && value !== undefined &&
    normalizeLedgerText(value).length > NUM_ZERO;
}

function validateObservablePredictionMetricDelta(filePath, value) {
  if (!observablePredictionMetricDeltaIsPresent(value)) {
    return [];
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < NUM_ZERO) {
    return [
      `${filePath}: ${OBSERVABLE_PREDICTION_FIELD}.` +
      `${OBSERVABLE_PREDICTION_METRIC_DELTA_FIELD} must be a non-negative number.`,
    ];
  }
  return [];
}

export function validateObservablePredictionContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const requiresPrediction =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true ||
    metadataRequiresObservablePrediction(metadata, fileStatus, phase);
  const prediction = metadata?.[OBSERVABLE_PREDICTION_FIELD];
  if (!prediction) {
    return requiresPrediction ?
      [
        `${filePath}: metadata ${OBSERVABLE_PREDICTION_FIELD} is required ` +
        'to pre-register a falsifiable numeric/state prediction before the probe.',
      ] :
      [];
  }
  if (!isObjectRecord(prediction)) {
    return [
      `${filePath}: metadata ${OBSERVABLE_PREDICTION_FIELD} must be an object.`,
    ];
  }

  const errors = [];
  for (const fieldName of [
    OBSERVABLE_PREDICTION_METRIC_FIELD,
    OBSERVABLE_PREDICTION_PREDICTED_FIELD,
  ]) {
    errors.push(...validateObservablePredictionConcreteValue(
      filePath,
      fieldName,
      prediction[fieldName],
    ));
  }
  errors.push(...validateObservablePredictionMetricDelta(
    filePath,
    prediction[OBSERVABLE_PREDICTION_METRIC_DELTA_FIELD],
  ));

  const observed = normalizeLedgerText(
    prediction[OBSERVABLE_PREDICTION_OBSERVED_FIELD],
  );
  const accuracy = normalizeLedgerText(
    prediction[OBSERVABLE_PREDICTION_ACCURACY_FIELD],
  );
  const evidence = normalizeLedgerText(
    prediction[OBSERVABLE_PREDICTION_EVIDENCE_FIELD],
  );

  if (accuracy.length > NUM_ZERO &&
    !OBSERVABLE_PREDICTION_ACCURACIES.includes(accuracy)) {
    errors.push(
      `${filePath}: ${OBSERVABLE_PREDICTION_FIELD}.accuracy must be one of ` +
      `${OBSERVABLE_PREDICTION_ACCURACIES.join(', ')}.`,
    );
  }

  if (phase !== VALIDATION_PHASE_CLOSURE) {
    return errors;
  }
  if (fileStatus === STATUS_SUPERSEDED) {
    return errors;
  }

  errors.push(...validateObservablePredictionConcreteValue(
    filePath,
    OBSERVABLE_PREDICTION_OBSERVED_FIELD,
    observed,
  ));
  errors.push(...validateObservablePredictionConcreteValue(
    filePath,
    OBSERVABLE_PREDICTION_ACCURACY_FIELD,
    accuracy,
  ));
  errors.push(...validateObservablePredictionConcreteValue(
    filePath,
    OBSERVABLE_PREDICTION_EVIDENCE_FIELD,
    evidence,
  ));
  if (accuracy === OBSERVABLE_PREDICTION_ACCURACY_PENDING) {
    errors.push(
      `${filePath}: ${OBSERVABLE_PREDICTION_FIELD}.accuracy cannot remain ` +
      `${OBSERVABLE_PREDICTION_ACCURACY_PENDING} at closure.`,
    );
  }
  if (
    accuracy === OBSERVABLE_PREDICTION_ACCURACY_MATCHED &&
    !predictionValuesMatch(
      prediction[OBSERVABLE_PREDICTION_PREDICTED_FIELD],
      observed,
    )
  ) {
    errors.push(
      `${filePath}: ${OBSERVABLE_PREDICTION_FIELD}.accuracy is matched, ` +
      'but predicted and observed transitions differ.',
    );
  }
  if (evidence.length > NUM_ZERO && !predictionEvidenceIsCommandOrArtifact(evidence)) {
    errors.push(
      `${filePath}: ${OBSERVABLE_PREDICTION_FIELD}.evidence must name a ` +
      'focused command or artifact path.',
    );
  }
  return errors;
}

function validateExperimentOutcomeConcreteValue(filePath, fieldName, value) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: ${EXPERIMENT_OUTCOME_FIELD}.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

export function validateExperimentOutcomeContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const requiresOutcome =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true ||
    metadataRequiresExperimentOutcome(metadata, fileStatus, phase);
  const outcome = metadata?.[EXPERIMENT_OUTCOME_FIELD];
  if (!outcome) {
    return requiresOutcome ?
      [
        `${filePath}: metadata ${EXPERIMENT_OUTCOME_FIELD} is required ` +
        'at experiment closure to record the distinguished hypothesis or evidence-incomplete decision.',
      ] :
      [];
  }
  if (!isObjectRecord(outcome)) {
    return [
      `${filePath}: metadata ${EXPERIMENT_OUTCOME_FIELD} must be an object.`,
    ];
  }

  const errors = [];
  const distinguishedHypothesis = normalizeLedgerText(
    outcome[EXPERIMENT_OUTCOME_DISTINGUISHED_HYPOTHESIS_FIELD],
  );
  const decision = normalizeLedgerText(
    outcome[EXPERIMENT_OUTCOME_DECISION_FIELD],
  );
  const evidence = normalizeLedgerText(
    outcome[EXPERIMENT_OUTCOME_EVIDENCE_FIELD],
  );
  errors.push(...validateExperimentOutcomeConcreteValue(
    filePath,
    EXPERIMENT_OUTCOME_DISTINGUISHED_HYPOTHESIS_FIELD,
    distinguishedHypothesis,
  ));
  errors.push(...validateExperimentOutcomeConcreteValue(
    filePath,
    EXPERIMENT_OUTCOME_DECISION_FIELD,
    decision,
  ));
  errors.push(...validateExperimentOutcomeConcreteValue(
    filePath,
    EXPERIMENT_OUTCOME_EVIDENCE_FIELD,
    evidence,
  ));
  if (
    decision.length > NUM_ZERO &&
    !EXPERIMENT_OUTCOME_DECISIONS.includes(decision)
  ) {
    errors.push(
      `${filePath}: ${EXPERIMENT_OUTCOME_FIELD}.decision must be one of ` +
      `${EXPERIMENT_OUTCOME_DECISIONS.join(', ')}.`,
    );
  }
  if (
    decision === EXPERIMENT_OUTCOME_DECISION_EVIDENCE_INCOMPLETE &&
    distinguishedHypothesis !== EXPERIMENT_OUTCOME_INCOMPLETE_HYPOTHESIS
  ) {
    errors.push(
      `${filePath}: ${EXPERIMENT_OUTCOME_FIELD}.distinguishedHypothesis ` +
      `must be ${EXPERIMENT_OUTCOME_INCOMPLETE_HYPOTHESIS} when decision is ` +
      `${EXPERIMENT_OUTCOME_DECISION_EVIDENCE_INCOMPLETE}.`,
    );
  }
  if (
    decision !== EXPERIMENT_OUTCOME_DECISION_EVIDENCE_INCOMPLETE &&
    distinguishedHypothesis.length > NUM_ZERO &&
    !/^H[1-9]\d*$/u.test(distinguishedHypothesis)
  ) {
    errors.push(
      `${filePath}: ${EXPERIMENT_OUTCOME_FIELD}.distinguishedHypothesis ` +
      'must name the distinguished hypothesis such as H1, H2, or H3, or use evidence-incomplete.',
    );
  }
  if (
    [
      EXPERIMENT_OUTCOME_DECISION_OPEN_RUNTIME,
      EXPERIMENT_OUTCOME_DECISION_OWNER_MIGRATION,
    ].includes(decision)
  ) {
    errors.push(...validateExperimentOutcomeConcreteValue(
      filePath,
      EXPERIMENT_OUTCOME_NEXT_OWNER_FIELD,
      outcome[EXPERIMENT_OUTCOME_NEXT_OWNER_FIELD],
    ));
    errors.push(...validateExperimentOutcomeConcreteValue(
      filePath,
      EXPERIMENT_OUTCOME_NEXT_BOUNDARY_FIELD,
      outcome[EXPERIMENT_OUTCOME_NEXT_BOUNDARY_FIELD],
    ));
  }
  if (evidence.length > NUM_ZERO && !predictionEvidenceIsCommandOrArtifact(evidence)) {
    errors.push(
      `${filePath}: ${EXPERIMENT_OUTCOME_FIELD}.evidence must name a ` +
      'focused command or artifact path.',
    );
  }
  return errors;
}

function metadataRequiresRerunDecision(metadata, fileStatus) {
  if (
    fileStatus !== STATUS_ACTIVE ||
    !metadata ||
    !isScenarioDrivenMetadata(metadata) ||
    metadataHasClassificationOnlyOutcome(metadata)
  ) {
    return false;
  }
  const lane = metadataLane(metadata);
  if (
    lane === LANE_DIAGNOSTIC_CLASSIFICATION &&
    !hasImplementationWriteScope(metadata)
  ) {
    return true;
  }
  if (
    lane === LANE_CAUSAL_ESCALATION &&
    !hasImplementationWriteScope(metadata) &&
    metadataKeepsRepresentativeResidualLive(metadata)
  ) {
    return true;
  }
  return [
    scenarioClosureResult(metadata),
    representativeOutcome(metadata),
    normalizeLedgerText(
      metadata?.[REPRESENTATIVE_RESIDUAL_METADATA_FIELD]?.[
        REPRESENTATIVE_RESIDUAL_STATUS_FIELD
      ],
    ).toLowerCase(),
  ].some((result) =>
    result.length > NUM_ZERO &&
    result !== CAUSAL_GOVERNANCE_PENDING_OUTCOME &&
    result !== 'pending-before-probe');
}

function validateRerunDecisionConcreteValue(filePath, fieldName, value) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: rerunDecision.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

function validateRerunDecisionRefreshCommands(filePath, commands) {
  if (!Array.isArray(commands) || commands.length === NUM_ZERO) {
    return [
      `${filePath}: rerunDecision.requiredRefreshCommands must be a ` +
      'non-empty array.',
    ];
  }
  const rendered = commands.map(normalizeLedgerText).join(NEWLINE);
  const errors = [];
  for (const pattern of RERUN_DECISION_REQUIRED_COMMAND_PATTERNS) {
    if (!pattern.test(rendered)) {
      errors.push(
        `${filePath}: rerunDecision.requiredRefreshCommands must cite ` +
        'route-after-rerun, Sprint Strategy Brief, Current Edge Card, ' +
        'current-blocker refresh, entry validation, and pre-implementation validation.',
      );
      break;
    }
  }
  for (let index = NUM_ZERO; index < commands.length; index += NUM_ONE) {
    errors.push(
      ...validateRerunDecisionConcreteValue(
        filePath,
        `requiredRefreshCommands[${index}]`,
        commands[index],
      ),
    );
  }
  return errors;
}

export function validateRerunDecisionContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const requiresRerunDecision =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true ||
    metadataRequiresRerunDecision(metadata, fileStatus);
  const rerunDecision = metadata?.[RERUN_DECISION_FIELD];
  if (!rerunDecision) {
    return requiresRerunDecision ?
      [
        `${filePath}: metadata rerunDecision is required after a ` +
        'representative rerun routes successor work; cite owner, boundary, ' +
        'dominant reason, stop mode, expected delta, and required refresh commands.',
      ] :
      [];
  }
  if (!isObjectRecord(rerunDecision)) {
    return [`${filePath}: metadata rerunDecision must be an object.`];
  }
  const errors = [];
  for (const fieldName of [
    RERUN_DECISION_SOURCE_ARTIFACT_FIELD,
    RERUN_DECISION_ROUTE_OWNER_FIELD,
    RERUN_DECISION_ROUTE_BOUNDARY_FIELD,
    RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD,
    RERUN_DECISION_CAUSAL_OUTCOME_FIELD,
    RERUN_DECISION_STOP_MODE_FIELD,
    RERUN_DECISION_NEXT_LANE_FIELD,
    RERUN_DECISION_EXPECTED_DELTA_FIELD,
  ]) {
    errors.push(
      ...validateRerunDecisionConcreteValue(
        filePath,
        fieldName,
        rerunDecision[fieldName],
      ),
    );
  }
  errors.push(...validateRerunDecisionRefreshCommands(
    filePath,
    rerunDecision[RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD],
  ));
  return errors;
}

function metadataRequiresClassificationEfficiency(metadata, fileStatus) {
  return fileStatus === STATUS_ACTIVE &&
    metadataIsPureClassificationPackage(metadata);
}

function validateClassificationEfficiencyConcreteValue(
  filePath,
  fieldName,
  value,
) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: classificationEfficiency.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

function validateClassificationEfficiencyCommands(filePath, commands) {
  if (!Array.isArray(commands) || commands.length === NUM_ZERO) {
    return [
      `${filePath}: classificationEfficiency.commands must be a non-empty array.`,
    ];
  }
  const errors = [];
  if (commands.length > CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP) {
    errors.push(
      `${filePath}: classificationEfficiency.commands must stay within the ` +
      `classification budget of ${CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP} ` +
      'canonical commands.',
    );
  }
  for (let index = NUM_ZERO; index < commands.length; index += NUM_ONE) {
    errors.push(
      ...validateClassificationEfficiencyConcreteValue(
        filePath,
        `commands[${index}]`,
        commands[index],
      ),
    );
  }
  return errors;
}

function metadataHasStableRuntimeRerunRoute(metadata = {}) {
  const rerunDecision = metadata?.[RERUN_DECISION_FIELD];
  if (!isObjectRecord(rerunDecision)) {
    return false;
  }
  return normalizeLedgerText(
    rerunDecision[RERUN_DECISION_ROUTE_OWNER_FIELD],
  ) === normalizeLedgerText(metadata.owner) &&
    normalizeLedgerText(
      rerunDecision[RERUN_DECISION_ROUTE_BOUNDARY_FIELD],
    ) === normalizeLedgerText(metadata.boundary) &&
    normalizeLedgerText(
      rerunDecision[RERUN_DECISION_CAUSAL_OUTCOME_FIELD],
    ) === CLASSIFICATION_EFFICIENCY_STABLE_ROUTE_OUTCOME &&
    normalizeLedgerText(
      rerunDecision[RERUN_DECISION_STOP_MODE_FIELD],
    ) === CLASSIFICATION_EFFICIENCY_STABLE_ROUTE_STOP;
}

export function validateClassificationEfficiencyContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const requiresEfficiency =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true ||
    metadataRequiresClassificationEfficiency(metadata, fileStatus);
  const efficiency = metadata?.[CLASSIFICATION_EFFICIENCY_FIELD];
  if (!efficiency) {
    return requiresEfficiency ?
      [
        `${filePath}: metadata classificationEfficiency is required for pure ` +
        'classification packages; record inline-default mode, separate-package ' +
        'reason, evidence budget, decision record, successor action, and ' +
        'runtime promotion rule.',
      ] :
      [];
  }
  if (!isObjectRecord(efficiency)) {
    return [
      `${filePath}: metadata classificationEfficiency must be an object.`,
    ];
  }

  const errors = [];
  for (const fieldName of [
    CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
    CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
    CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
    CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
    CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
    CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
    CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
  ]) {
    errors.push(
      ...validateClassificationEfficiencyConcreteValue(
        filePath,
        fieldName,
        efficiency[fieldName],
      ),
    );
  }

  const defaultMode = normalizeLedgerText(
    efficiency[CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD],
  );
  if (
    defaultMode.length > NUM_ZERO &&
    !CLASSIFICATION_EFFICIENCY_DEFAULT_MODES.includes(defaultMode)
  ) {
    errors.push(
      `${filePath}: classificationEfficiency.defaultMode must be one of ` +
      CLASSIFICATION_EFFICIENCY_DEFAULT_MODES.join(', ') + '.',
    );
  }
  const separatePackageReason = normalizeLedgerText(
    efficiency[CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD],
  );
  if (
    separatePackageReason.length > NUM_ZERO &&
    !CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS.includes(
      separatePackageReason,
    )
  ) {
    errors.push(
      `${filePath}: classificationEfficiency.separatePackageReason must be one of ` +
      CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS.join(', ') + '.',
    );
  }
  const successorAction = normalizeLedgerText(
    efficiency[CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD],
  );
  if (
    successorAction.length > NUM_ZERO &&
    !CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS.includes(successorAction)
  ) {
    errors.push(
      `${filePath}: classificationEfficiency.successorAction must be one of ` +
      CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS.join(', ') + '.',
    );
  }

  if (
    !CLASSIFICATION_EFFICIENCY_ONE_ARTIFACT_PATTERN.test(
      normalizeLedgerText(
        efficiency[CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD],
      ),
    )
  ) {
    errors.push(
      `${filePath}: classificationEfficiency.artifactBudget must keep pure ` +
      'classification packages to one representative artifact.',
    );
  }
  if (
    !CLASSIFICATION_EFFICIENCY_COMMAND_BUDGET_PATTERN.test(
      normalizeLedgerText(
        efficiency[CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD],
      ),
    )
  ) {
    errors.push(
      `${filePath}: classificationEfficiency.proofCommandBudget must record ` +
      'two-or-three-canonical-commands.',
    );
  }
  errors.push(...validateClassificationEfficiencyCommands(
    filePath,
    efficiency[CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD],
  ));

  if (
    metadataIsPureClassificationPackage(metadata) &&
    metadataProofCommands(metadata).length > CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP
  ) {
    errors.push(
      `${filePath}: pure classification package metadata proof must stay ` +
      `within ${CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP} canonical commands; ` +
      'record supporting detail in notes or promote a runtime package.',
    );
  }

  if (
    metadataIsPureClassificationPackage(metadata) &&
    metadataHasStableRuntimeRerunRoute(metadata) &&
    successorAction !== CLASSIFICATION_EFFICIENCY_RUNTIME_SUCCESSOR_ACTION
  ) {
    errors.push(
      `${filePath}: stable owner/boundary classification must prefer a ` +
      'runtime-owner-boundary successor instead of another classification package.',
    );
  }
  const rerunDecision = metadata?.[RERUN_DECISION_FIELD];
  if (
    metadataHasStableRuntimeRerunRoute(metadata) &&
    isObjectRecord(rerunDecision) &&
    normalizeLedgerText(rerunDecision[RERUN_DECISION_NEXT_LANE_FIELD]) !==
      LANE_RUNTIME_OWNER_BOUNDARY
  ) {
    errors.push(
      `${filePath}: rerunDecision.nextLane must be ` +
      `${LANE_RUNTIME_OWNER_BOUNDARY} when stable owner/boundary evidence ` +
      'selects a local runtime fix.',
    );
  }
  if (
    successorAction === CLASSIFICATION_EFFICIENCY_RUNTIME_SUCCESSOR_ACTION &&
    !CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_PATTERN.test(
      normalizeLedgerText(
        efficiency[CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD],
      ),
    )
  ) {
    errors.push(
      `${filePath}: classificationEfficiency.runtimePromotionRule must name ` +
      'runtime-owner-boundary when successorAction opens runtime work.',
    );
  }
  return errors;
}

function metadataHasSameFrontierNoReduction(metadata = {}) {
  return [
    scenarioClosureResult(metadata),
    representativeOutcome(metadata),
    normalizeLedgerText(
      metadata?.[REPRESENTATIVE_RESIDUAL_METADATA_FIELD]?.[
        REPRESENTATIVE_RESIDUAL_STATUS_FIELD
      ],
    ).toLowerCase(),
  ].includes(SAME_FRONTIER_RESULT);
}

function observablePredictionHasConcreteMovement(metadata = {}) {
  const prediction = metadata?.[OBSERVABLE_PREDICTION_FIELD];
  if (!isObjectRecord(prediction)) {
    return false;
  }
  const accuracy = normalizeLedgerText(
    prediction[OBSERVABLE_PREDICTION_ACCURACY_FIELD],
  );
  const observed = normalizeLedgerText(
    prediction[OBSERVABLE_PREDICTION_OBSERVED_FIELD],
  );
  if (
    ![
      OBSERVABLE_PREDICTION_ACCURACY_MATCHED,
      OBSERVABLE_PREDICTION_ACCURACY_PARTIAL,
    ].includes(accuracy) ||
    observed.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(observed) ||
    observed.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return false;
  }
  return REPRESENTATIVE_MOVEMENT_PREDICTION_PATTERN.test(observed) &&
    !/\b(?:same-frontier|unchanged|no reduction|no movement)\b/iu.test(observed);
}

function scenarioClosureHasConcreteMovement(metadata = {}) {
  const closure = metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD];
  const expectedTransition = normalizeLedgerText(
    closure?.[SCENARIO_CAUSAL_CLOSURE_EXPECTED_OBSERVABLE_TRANSITION_FIELD],
  );
  return expectedTransition.length > NUM_ZERO &&
    !MODEL_FIT_EMPTY_VALUE_PATTERN.test(expectedTransition) &&
    !expectedTransition.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER) &&
    REPRESENTATIVE_MOVEMENT_PREDICTION_PATTERN.test(expectedTransition) &&
    !/\b(?:same-frontier|unchanged|no reduction|no movement)\b/iu.test(
      expectedTransition,
    );
}

function metadataHasConcreteMovement(metadata = {}) {
  const representativeResidualStatus = normalizeLedgerText(
    metadata?.[REPRESENTATIVE_RESIDUAL_METADATA_FIELD]?.[
      REPRESENTATIVE_RESIDUAL_STATUS_FIELD
    ],
  ).toLowerCase();
  return REPRESENTATIVE_MOVEMENT_RESULTS.includes(scenarioClosureResult(metadata)) ||
    REPRESENTATIVE_MOVEMENT_RESULTS.includes(representativeOutcome(metadata)) ||
    REPRESENTATIVE_MOVEMENT_RESULTS.includes(representativeResidualStatus) ||
    observablePredictionHasConcreteMovement(metadata) ||
    scenarioClosureHasConcreteMovement(metadata);
}

function metadataIsRuntimeSuccessorLane(metadata = {}) {
  return SAME_FRONTIER_RUNTIME_SUCCESSOR_LANES.includes(metadataLane(metadata));
}

function metadataIsSameFrontierWithoutMovement(metadata = {}) {
  return metadataHasSameFrontierNoReduction(metadata) &&
    !metadataHasConcreteMovement(metadata);
}

function sameFrontierNoMovementHistoryCount(
  metadata,
  filePath,
  packageHistoryEntries = [],
) {
  const currentKey = metadataOwnerBoundaryKey(metadata);
  const scenarioKey = metadataScenarioKey(metadata);
  if (currentKey.length === NUM_ZERO || scenarioKey.length === NUM_ZERO) {
    return NUM_ZERO;
  }
  const normalizedFilePath = normalizeRelativePath(filePath);
  return sortedFrontierHistoryEntries(packageHistoryEntries)
    .filter((entry) =>
      entry.filePath !== normalizedFilePath &&
      entry.scenarioKey === scenarioKey &&
      entry.ownerBoundaryKey === currentKey &&
      metadataIsSameFrontierWithoutMovement(entry.metadata))
    .length;
}

export function validateSameFrontierStopContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const sameFrontierCount = sameFrontierNoMovementHistoryCount(
    metadata,
    filePath,
    options.packageHistoryEntries || [],
  );
  if (
    fileStatus === STATUS_ACTIVE &&
    phase === VALIDATION_PHASE_ENTRY &&
    metadata &&
    isScenarioDrivenMetadata(metadata) &&
    metadataIsRuntimeSuccessorLane(metadata) &&
    sameFrontierCount >= NUM_TWO
  ) {
    return [
      `${filePath}: two-shot same-frontier rule rejected a third ` +
      `${metadataLane(metadata)} package for ${metadataOwnerBoundaryKey(metadata)}; ` +
      'open an autonomous architecture experiment instead; human escalation is only for contradictory or blocked evidence.',
    ];
  }
  if (
    fileStatus !== STATUS_ACTIVE ||
    !metadata ||
    !isScenarioDrivenMetadata(metadata) ||
    !metadataIsSameFrontierWithoutMovement(metadata)
  ) {
    return [];
  }
  if (
    metadataHasSelectedArchitecturePackageRoute(metadata) ||
    metadataHasSameFrontierHumanException(metadata)
  ) {
    return [];
  }
  return [
    `${filePath}: same-frontier rerun without concrete reduction must stop ` +
    'local patching and select/open an autonomous architecture experiment ' +
    '(architectureDecisionGate route=architecture-package) before another ' +
    'local implementation package; human escalation is only for contradictory ' +
    'or blocked evidence.',
  ];
}

function validateOwnerBoundaryMigrationProof(filePath, proof) {
  if (!isObjectRecord(proof)) {
    return [
      `${filePath}: metadata ${OWNER_BOUNDARY_MIGRATION_PROOF_FIELD} ` +
      'must be an object.',
    ];
  }
  const errors = [];
  for (const fieldName of OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS) {
    const normalizedValue = normalizeLedgerText(proof[fieldName]);
    if (
      normalizedValue.length === NUM_ZERO ||
      MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) ||
      LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
      normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
    ) {
      errors.push(
        `${filePath}: ${OWNER_BOUNDARY_MIGRATION_PROOF_FIELD}.` +
        `${fieldName} must be a concrete value.`,
      );
    }
  }
  const evidence = normalizeLedgerText(
    proof[OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD],
  );
  if (
    evidence.length > NUM_ZERO &&
    !MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(evidence) &&
    !SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN.test(evidence)
  ) {
    errors.push(
      `${filePath}: ${OWNER_BOUNDARY_MIGRATION_PROOF_FIELD}.evidence ` +
      'must name a focused command or artifact path.',
    );
  }
  return errors;
}

export function validateScenarioFrontierOwnerBoundaryContract(
  metadata,
  filePath,
  options = {},
) {
  const requiresContract =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true;
  const proof = metadata?.[OWNER_BOUNDARY_MIGRATION_PROOF_FIELD];
  const errors = proof === undefined ?
    [] :
    validateOwnerBoundaryMigrationProof(filePath, proof);

  if (!requiresContract || !metadata) {
    return errors;
  }

  const scenarioCausalClosure =
    metadata[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD];
  if (!isObjectRecord(scenarioCausalClosure)) {
    return errors;
  }

  const currentFirstFrontier = normalizeLedgerText(
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_CURRENT_FRONTIER_FIELD],
  );
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (
    currentFirstFrontier.length === NUM_ZERO ||
    owner.length === NUM_ZERO ||
    boundary.length === NUM_ZERO
  ) {
    return errors;
  }

  if (
    textMentionsValue(currentFirstFrontier, owner) &&
    textMentionsValue(currentFirstFrontier, boundary)
  ) {
    return errors;
  }

  if (proof === undefined) {
    errors.push(
      `${filePath}: metadata owner/boundary must appear in ` +
      'scenarioCausalClosure.currentFirstFrontier, or ' +
      `${OWNER_BOUNDARY_MIGRATION_PROOF_FIELD} must explain the bounded ` +
      'diagnostic/support-role or owner-boundary migration proof.',
    );
  }
  return errors;
}

function validateFrontierOscillationClosureFields(
  metadata,
  filePath,
  requiresFields,
) {
  if (!requiresFields) {
    return [];
  }
  const scenarioCausalClosure =
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD];
  if (!isObjectRecord(scenarioCausalClosure)) {
    return [];
  }
  const errors = [];
  for (const fieldName of SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_ARRAY_FIELDS) {
    errors.push(
      ...validateScenarioCausalClosureArrayField(
        filePath,
        fieldName,
        scenarioCausalClosure[fieldName],
      ),
    );
  }
  for (const fieldName of SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_TEXT_FIELDS) {
    errors.push(
      ...validateScenarioCausalClosureConcreteValue(
        filePath,
        fieldName,
        scenarioCausalClosure[fieldName],
      ),
    );
  }
  return errors;
}

function metadataHasSelectedLocalProofGate(metadata = {}) {
  const gate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  if (!isObjectRecord(gate)) {
    return false;
  }
  if (normalizeLedgerText(gate.status) !== ARCHITECTURE_GATE_SELECTED_STATUS) {
    return false;
  }
  const selectedChoice = normalizeLedgerText(gate.selectedChoice);
  const choices = Array.isArray(gate.choices) ? gate.choices : [];
  return choices.some((choice) =>
    isObjectRecord(choice) &&
    normalizeLedgerText(choice.id) === selectedChoice &&
    normalizeLedgerText(choice.route) ===
      ARCHITECTURE_DECISION_GATE_ROUTE_CONTINUE_LOCAL_PROOF);
}

function metadataIsSelectedRuntimeSuccessor(metadata = {}) {
  return metadataLane(metadata) === LANE_RUNTIME_OWNER_BOUNDARY &&
    hasImplementationWriteScope(metadata) &&
    metadataHasSelectedLocalProofGate(metadata);
}

function frontierHistoryEntrySummary(entry) {
  const metadata = entry.metadata || {};
  return [
    normalizeLedgerText(entry.filePath),
    normalizeLedgerText(metadata.owner),
    normalizeLedgerText(metadata.boundary),
    scenarioClosureResult(metadata) || DEFAULT_UNKNOWN,
  ].filter((value) => value.length > NUM_ZERO).join(' / ');
}

function getNormalizedBoundary(metadata) {
  return normalizeLedgerText(metadata?.boundary).toLowerCase();
}

function isOscillationFamilyBoundary(boundary) {
  const norm = normalizeLedgerText(boundary).toLowerCase().replace(/[- ]/g, '_');
  return BOUNDARY_FAMILY_OSCILLATION.includes(norm) ||
         norm.includes('publication_convergence') ||
         norm.includes('active_gate_snapshot_coverage') ||
         norm.includes('readiness_support') ||
         norm.includes('operation_workflow_handoff') ||
         norm.includes('readiness') ||
         norm.includes('workflow_progress') ||
         norm.includes('operation_workflow');
}

function detectFrontierOscillation(metadata, filePath, packageHistoryEntries) {
  const currentKey = metadataOwnerBoundaryKey(metadata);
  const scenarioKey = metadataScenarioKey(metadata);
  if (currentKey.length === NUM_ZERO || scenarioKey.length === NUM_ZERO) {
    return null;
  }

  const normalizedFilePath = normalizeRelativePath(filePath);
  const recentEntries = sortedFrontierHistoryEntries(packageHistoryEntries)
    .filter((entry) =>
      entry.filePath !== normalizedFilePath &&
      entry.scenarioKey === scenarioKey &&
      isMaterialOscillationResult(entry.metadata))
    .slice(NUM_ZERO, FRONTIER_OSCILLATION_RECENT_HISTORY_LIMIT);

  const currentBoundary = getNormalizedBoundary(metadata);
  if (isOscillationFamilyBoundary(currentBoundary)) {
    const familyEntries = recentEntries.filter((entry) =>
      isOscillationFamilyBoundary(entry.metadata?.boundary),
    );
    if (familyEntries.length >= NUM_TWO) {
      const uniqueBoundaries = new Set([
        currentBoundary,
        ...familyEntries.map((e) => getNormalizedBoundary(e.metadata)),
      ].filter((b) => b.length > NUM_ZERO));
      if (uniqueBoundaries.size >= NUM_TWO) {
        return {
          reason: 'repeated adjacent-boundary oscillation within the same boundary family',
          relatedEntries: familyEntries.slice(NUM_ZERO, FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT),
        };
      }
    }
  }

  const sameBoundaryEntry = recentEntries.find((entry) =>
    entry.ownerBoundaryKey === currentKey);
  if (sameBoundaryEntry) {
    return {
      reason: 'frontier returned to a recently closed related boundary',
      relatedEntries: [sameBoundaryEntry, ...recentEntries
        .filter((entry) => entry !== sameBoundaryEntry)
        .slice(NUM_ZERO, FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT)],
    };
  }

  const alternatingEntries = recentEntries.slice(
    NUM_ZERO,
    FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT,
  );
  if (
    alternatingEntries.length === FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT &&
    alternatingEntries[NUM_ZERO].ownerBoundaryKey !==
      alternatingEntries[NUM_ONE].ownerBoundaryKey &&
    alternatingEntries[NUM_ONE].ownerBoundaryKey === currentKey
  ) {
    return {
      reason: 'frontier alternated between two related owner boundaries',
      relatedEntries: alternatingEntries,
    };
  }

  const recentSequence = [
    currentKey,
    ...recentEntries.map((entry) => entry.ownerBoundaryKey),
  ].slice(NUM_ZERO, FRONTIER_OSCILLATION_SEQUENCE_MINIMUM);
  const uniqueBoundaries = new Set(recentSequence);
  if (
    recentSequence.length === FRONTIER_OSCILLATION_SEQUENCE_MINIMUM &&
    uniqueBoundaries.size === FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT
  ) {
    return {
      reason: 'adjacent owner-boundary fixes did not close the representative gate',
      relatedEntries: recentEntries.slice(
        NUM_ZERO,
        FRONTIER_OSCILLATION_RELATED_PACKAGE_LIMIT,
      ),
    };
  }

  return null;
}

export function validateFrontierOscillationContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  if (
    fileStatus !== STATUS_ACTIVE ||
    !metadata ||
    !isScenarioDrivenMetadata(metadata)
  ) {
    return [];
  }

  const detection = detectFrontierOscillation(
    metadata,
    filePath,
    options.packageHistoryEntries || [],
  );
  if (!detection) {
    return [];
  }

  const errors = [];
  const isDiagnosticOnlyRoute =
    metadataLane(metadata) === LANE_DIAGNOSTIC_CLASSIFICATION &&
    !hasImplementationWriteScope(metadata);
  const isExperimentProbe = metadataLane(metadata) === LANE_EXPERIMENT;
  const isSelectedRuntimeSuccessor =
    metadataIsSelectedRuntimeSuccessor(metadata);
  if (
    metadataLane(metadata) !== LANE_CAUSAL_ESCALATION &&
    !isDiagnosticOnlyRoute &&
    !isExperimentProbe &&
    !isSelectedRuntimeSuccessor
  ) {
    errors.push(
      `${filePath}: frontier oscillation detected (${detection.reason}); ` +
      'use the causal-escalation lane or an autonomous architecture ' +
      'experiment with cross-boundary handoff proof before another local ' +
      'runtime patch. Recent related packages: ' +
      detection.relatedEntries.map(frontierHistoryEntrySummary).join('; ') +
      '.',
    );
    return errors;
  }

  errors.push(...validateFrontierOscillationClosureFields(
    metadata,
    filePath,
    metadataLane(metadata) === LANE_CAUSAL_ESCALATION || isDiagnosticOnlyRoute,
  ));
  return errors;
}

function scenarioClosureStopCondition(metadata = {}) {
  return normalizeLedgerText(
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.[
      SCENARIO_CAUSAL_CLOSURE_STOP_CONDITION_FIELD
    ],
  ).toLowerCase();
}

function representativeOutcome(metadata = {}) {
  return normalizeLedgerText(
    metadata?.[CAUSAL_GOVERNANCE_METADATA_FIELD]?.[
      CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD
    ],
  ).toLowerCase();
}

function metadataHasArchitectureGap(metadata = {}) {
  return scenarioClosureResult(metadata) ===
      ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP ||
    scenarioClosureStopCondition(metadata) === 'architecture-gap-stop' ||
    representativeOutcome(metadata) ===
      ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP;
}

function architectureGateEvidence(metadata = {}, trigger = EMPTY_TEXT, detection = null) {
  if (trigger === ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION) {
    return [
      detection?.reason || 'frontier oscillation detected',
      ...(detection?.relatedEntries || []).map(frontierHistoryEntrySummary),
    ].filter((value) => normalizeLedgerText(value).length > NUM_ZERO);
  }
  const closure = metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD] || {};
  return [
    scenarioClosureResult(metadata) ?
      `scenario result classification: ${scenarioClosureResult(metadata)}` :
      EMPTY_TEXT,
    scenarioClosureStopCondition(metadata) ?
      `scenario stop condition: ${scenarioClosureStopCondition(metadata)}` :
      EMPTY_TEXT,
    normalizeLedgerText(closure[SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_FIELD]),
    normalizeLedgerText(closure[SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_PROBE_FIELD]),
  ].filter((value) => normalizeLedgerText(value).length > NUM_ZERO);
}

function architectureGateProof(metadata = {}) {
  const proof = Array.isArray(metadata?.proof) ? metadata.proof : [];
  const probe = normalizeLedgerText(
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.[
      SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_PROBE_FIELD
    ],
  );
  return [...new Set([...proof, probe].filter((value) =>
    normalizeLedgerText(value).length > NUM_ZERO))];
}

function architectureGateChoices(metadata = {}) {
  const proof = architectureGateProof(metadata);
  const proofOrFallback = proof.length > NUM_ZERO ? proof : [
    CURRENT_BLOCKER_REPAIR_COMMAND,
  ];
  return [
    {
      id: ARCHITECTURE_DECISION_GATE_CHOICE_ID_LOCAL_PROOF,
      summary: 'Continue with a bounded local proof if the missing edge stays inside this owner boundary.',
      route: ARCHITECTURE_DECISION_GATE_ROUTE_CONTINUE_LOCAL_PROOF,
      proof: proofOrFallback,
    },
    {
      id: ARCHITECTURE_DECISION_GATE_CHOICE_ID_MIGRATE_OWNER,
      summary: 'Migrate the active package to the owner boundary named by the first frontier evidence.',
      route: ARCHITECTURE_DECISION_GATE_ROUTE_OWNER_BOUNDARY_MIGRATION,
      proof: proofOrFallback,
    },
    {
      id: ARCHITECTURE_DECISION_GATE_CHOICE_ID_ARCHITECTURE_PACKAGE,
      summary: 'Open a bounded autonomous architecture experiment for the missing owner contract.',
      route: ARCHITECTURE_DECISION_GATE_ROUTE_ARCHITECTURE_PACKAGE,
      proof: proofOrFallback,
    },
    {
      id: ARCHITECTURE_DECISION_GATE_CHOICE_ID_HUMAN_ESCALATION,
      summary: 'Escalate to a human only when evidence is contradictory, policy-blocked, credential-blocked, or unavailable.',
      route: ARCHITECTURE_DECISION_GATE_ROUTE_HUMAN_ESCALATION,
      proof: proofOrFallback,
    },
  ];
}

function normalizeArchitectureGateChoice(choice = {}) {
  return {
    id: normalizeLedgerText(choice.id),
    summary: normalizeLedgerText(choice.summary),
    route: normalizeLedgerText(choice.route),
    proof: Array.isArray(choice.proof) ? choice.proof.map(normalizeLedgerText)
      .filter((value) => value.length > NUM_ZERO) : [],
  };
}

function architectureGateSelectedChoice(choices, selectedChoice) {
  return choices.find((choice) =>
    isObjectRecord(choice) &&
    normalizeLedgerText(choice.id) === selectedChoice);
}

function defaultArchitectureDecisionGateNextAction(gate = {}, choices = []) {
  const status = normalizeLedgerText(gate.status);
  if (status === ARCHITECTURE_DECISION_GATE_STATUS_WATCHING) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_WATCH;
  }
  if (
    status === ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED ||
    status === ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED
  ) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_SELECT;
  }
  if (status !== ARCHITECTURE_DECISION_GATE_STATUS_SELECTED) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_PRESENT;
  }
  const selectedChoice = normalizeLedgerText(gate.selectedChoice);
  const selected = architectureGateSelectedChoice(choices, selectedChoice);
  const route = normalizeLedgerText(selected?.route);
  if (route === ARCHITECTURE_DECISION_GATE_ROUTE_CONTINUE_LOCAL_PROOF) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_LOCAL_PROOF;
  }
  if (route === ARCHITECTURE_DECISION_GATE_ROUTE_OWNER_BOUNDARY_MIGRATION) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_OWNER_MIGRATION;
  }
  if (route === ARCHITECTURE_DECISION_GATE_ROUTE_ARCHITECTURE_PACKAGE) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_ARCHITECTURE_PACKAGE;
  }
  if (route === ARCHITECTURE_DECISION_GATE_ROUTE_HUMAN_ESCALATION) {
    return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_HUMAN_ESCALATION;
  }
  return ARCHITECTURE_DECISION_GATE_NEXT_ACTION_SELECT;
}

function normalizeArchitectureDecisionGate(gate = {}, metadata = {}) {
  const status = normalizeLedgerText(gate.status) ||
    ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED;
  const choices = Array.isArray(gate.choices) ?
    gate.choices.map(normalizeArchitectureGateChoice) :
    architectureGateChoices(metadata);
  const defaultNextAction = defaultArchitectureDecisionGateNextAction(
    {
      ...gate,
      status,
    },
    choices,
  );
  return {
    status,
    trigger: normalizeLedgerText(gate.trigger) ||
      ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
    triggerEvidence: Array.isArray(gate.triggerEvidence) ?
      gate.triggerEvidence.map(normalizeLedgerText)
        .filter((value) => value.length > NUM_ZERO) :
      architectureGateEvidence(metadata),
    choices,
    selectedChoice: gate.selectedChoice === null ? null :
      normalizeLedgerText(gate.selectedChoice) || null,
    nextAction: status === ARCHITECTURE_DECISION_GATE_STATUS_SELECTED ?
      defaultNextAction :
      normalizeLedgerText(gate.nextAction) || defaultNextAction,
  };
}

export function buildArchitectureDecisionGatePayload(
  metadata = {},
  filePath = EMPTY_TEXT,
  options = {},
) {
  const existingGate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  if (isObjectRecord(existingGate)) {
    return normalizeArchitectureDecisionGate(existingGate, metadata);
  }

  if (metadataHasArchitectureGap(metadata)) {
    return {
      status: ARCHITECTURE_DECISION_GATE_STATUS_SELECTED,
      trigger: ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
      triggerEvidence: architectureGateEvidence(
        metadata,
        ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
      ),
      choices: architectureGateChoices(metadata),
      selectedChoice: ARCHITECTURE_DECISION_GATE_CHOICE_ID_ARCHITECTURE_PACKAGE,
      nextAction: ARCHITECTURE_DECISION_GATE_NEXT_ACTION_ARCHITECTURE_PACKAGE,
    };
  }

  const detection = detectFrontierOscillation(
    metadata,
    filePath,
    options.packageHistoryEntries || [],
  );
  if (detection) {
    return {
      status: ARCHITECTURE_DECISION_GATE_STATUS_WATCHING,
      trigger: ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION,
      triggerEvidence: architectureGateEvidence(
        metadata,
        ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION,
        detection,
      ),
      choices: architectureGateChoices(metadata),
      selectedChoice: null,
      nextAction: ARCHITECTURE_DECISION_GATE_NEXT_ACTION_WATCH,
    };
  }

  return {
    status: ARCHITECTURE_DECISION_GATE_STATUS_NOT_REQUIRED,
    trigger: ARCHITECTURE_DECISION_GATE_TRIGGER_NONE,
    triggerEvidence: [],
    choices: [],
    selectedChoice: null,
    nextAction: 'No architecture decision gate is required for this package.',
  };
}

function validateArchitectureGateConcreteText(filePath, fieldName, value) {
  const normalized = normalizeLedgerText(value);
  if (
    normalized.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalized) ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalized) ||
    normalized.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return [
      `${filePath}: architectureDecisionGate.${fieldName} must be a concrete value.`,
    ];
  }
  return [];
}

function validateArchitectureGateChoices(filePath, choices = []) {
  if (!Array.isArray(choices) || choices.length === NUM_ZERO) {
    return [
      `${filePath}: architectureDecisionGate choices must present concrete architecture choices.`,
    ];
  }
  const errors = [];
  for (let index = NUM_ZERO; index < choices.length; index += NUM_ONE) {
    const choice = choices[index];
    if (!isObjectRecord(choice)) {
      errors.push(
        `${filePath}: architectureDecisionGate.choices[${index}] must be an object.`,
      );
      continue;
    }
    for (const fieldName of ['id', 'summary', 'route']) {
      errors.push(...validateArchitectureGateConcreteText(
        filePath,
        `choices[${index}].${fieldName}`,
        choice[fieldName],
      ));
    }
    const route = normalizeLedgerText(choice.route);
    if (
      route.length > NUM_ZERO &&
      !ARCHITECTURE_DECISION_GATE_ROUTES.includes(route)
    ) {
      errors.push(
        `${filePath}: architectureDecisionGate.choices[${index}].route ` +
        `must be one of ${ARCHITECTURE_DECISION_GATE_ROUTES.join(', ')}.`,
      );
    }
    if (!Array.isArray(choice.proof) || choice.proof.length === NUM_ZERO) {
      errors.push(
        `${filePath}: architectureDecisionGate.choices[${index}].proof ` +
        'must name at least one focused proof command or artifact.',
      );
      continue;
    }
    for (let proofIndex = NUM_ZERO; proofIndex < choice.proof.length; proofIndex += NUM_ONE) {
      errors.push(...validateArchitectureGateConcreteText(
        filePath,
        `choices[${index}].proof[${proofIndex}]`,
        choice.proof[proofIndex],
      ));
    }
  }
  return errors;
}

function validateArchitectureGateSelectedChoice(filePath, gate) {
  const selectedChoice = normalizeLedgerText(gate.selectedChoice);
  if (selectedChoice.length === NUM_ZERO) {
    return [
      `${filePath}: architectureDecisionGate.selectedChoice must name the selected architecture route.`,
    ];
  }
  const choices = Array.isArray(gate.choices) ? gate.choices : [];
  const selected = choices.find((choice) =>
    isObjectRecord(choice) && normalizeLedgerText(choice.id) === selectedChoice);
  if (!selected) {
    return [
      `${filePath}: architectureDecisionGate.selectedChoice must match a concrete choice id.`,
    ];
  }
  return validateArchitectureGateChoices(filePath, [selected]);
}

function proofLadderEndsInNpmTest(metadata = {}) {
  const proof = metadataProofCommands(metadata);
  if (proof.length === NUM_ZERO) {
    return false;
  }
  const lastProof = proof[proof.length - NUM_ONE];
  return /\bnpm\s+test\b/iu.test(lastProof);
}

function hasRuntimeSourceWriteScope(metadata = {}) {
  return metadataWritePaths(metadata).some(isSourceWritePath);
}

function metadataHasSelectedNonLocalArchitectureRoute(metadata = {}) {
  const gate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  if (!isObjectRecord(gate)) {
    return false;
  }
  if (
    normalizeLedgerText(gate.status) !==
    ARCHITECTURE_DECISION_GATE_STATUS_SELECTED
  ) {
    return false;
  }
  const selectedChoice = normalizeLedgerText(gate.selectedChoice);
  const choices = Array.isArray(gate.choices) ? gate.choices : [];
  return choices.some((choice) =>
    isObjectRecord(choice) &&
    normalizeLedgerText(choice.id) === selectedChoice &&
    normalizeLedgerText(choice.route) !==
      ARCHITECTURE_DECISION_GATE_ROUTE_CONTINUE_LOCAL_PROOF);
}

function selectedArchitectureGateRoute(metadata = {}) {
  const gate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  if (!isObjectRecord(gate)) {
    return EMPTY_TEXT;
  }
  if (
    normalizeLedgerText(gate.status) !==
    ARCHITECTURE_DECISION_GATE_STATUS_SELECTED
  ) {
    return EMPTY_TEXT;
  }
  const selectedChoice = normalizeLedgerText(gate.selectedChoice);
  const choices = Array.isArray(gate.choices) ? gate.choices : [];
  const selected = choices.find((choice) =>
    isObjectRecord(choice) &&
    normalizeLedgerText(choice.id) === selectedChoice);
  return selected ? normalizeLedgerText(selected.route) : EMPTY_TEXT;
}

function metadataHasSelectedArchitecturePackageRoute(metadata = {}) {
  return selectedArchitectureGateRoute(metadata) ===
    ARCHITECTURE_DECISION_GATE_ROUTE_ARCHITECTURE_PACKAGE;
}

function metadataHasActiveArchitectureDecisionGate(metadata = {}) {
  const gate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  if (!isObjectRecord(gate)) {
    return metadataHasSelectedArchitecturePackageRoute(metadata);
  }
  const status = normalizeLedgerText(gate.status);
  const trigger = normalizeLedgerText(gate.trigger);
  return status.length > NUM_ZERO &&
    status !== ARCHITECTURE_DECISION_GATE_STATUS_NOT_REQUIRED &&
    (
      trigger !== ARCHITECTURE_DECISION_GATE_TRIGGER_NONE ||
      [
        ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED,
        ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED,
        ARCHITECTURE_DECISION_GATE_STATUS_SELECTED,
        ARCHITECTURE_DECISION_GATE_STATUS_WATCHING,
      ].includes(status)
    );
}

function metadataHasRepeatedFrontierSignal(metadata = {}) {
  const closure = metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD];
  if (!isObjectRecord(closure)) {
    return false;
  }
  const recentFrontierHistory = Array.isArray(closure.recentFrontierHistory) ?
    closure.recentFrontierHistory : [];
  if (recentFrontierHistory.length > NUM_ZERO) {
    return true;
  }
  return /\b(?:same-frontier|oscillat|repeat|unchanged|no[-\s]+reduction)\b/iu
    .test([
      closure.oscillationCheck,
      closure.sameFrontierFallback,
      closure.stopCondition,
      closure.resultClassification,
    ].map(normalizeLedgerText).join(' '));
}

function metadataRequiresTwoLevelTheory(metadata, fileStatus, phase) {
  if (
    fileStatus !== STATUS_ACTIVE ||
    phase === VALIDATION_PHASE_ENTRY ||
    !metadata
  ) {
    return false;
  }
  const ambiguityScore = Number(
    metadata?.[METADATA_FIELD_MODEL_FIT]?.ambiguityScore,
  );
  return metadataLane(metadata) === LANE_CAUSAL_ESCALATION ||
    metadataHasSelectedArchitecturePackageRoute(metadata) ||
    metadataIsOwnerBoundaryMigrationPackage(metadata) ||
    metadataHasActiveArchitectureDecisionGate(metadata) ||
    metadataHasRepeatedFrontierSignal(metadata) ||
    (
      Number.isFinite(ambiguityScore) &&
      ambiguityScore >= NUM_TWO &&
      coreLogicBriefRequiredForLane(metadataLane(metadata))
    );
}

function metadataHasSameFrontierHumanException(metadata = {}) {
  const route = selectedArchitectureGateRoute(metadata);
  const stopCondition = scenarioClosureStopCondition(metadata);
  if (
    route !== ARCHITECTURE_DECISION_GATE_ROUTE_HUMAN_ESCALATION &&
    stopCondition !== ARCHITECTURE_DECISION_GATE_ROUTE_HUMAN_ESCALATION
  ) {
    return false;
  }
  return SAME_FRONTIER_HUMAN_EXCEPTION_PATTERN.test([
    metadata?.dominantReason,
    metadata?.nextAction,
    metadata?.currentState,
    metadata?.[ARCHITECTURE_DECISION_GATE_FIELD]?.nextAction,
    ...(Array.isArray(
      metadata?.[ARCHITECTURE_DECISION_GATE_FIELD]?.triggerEvidence,
    ) ? metadata[ARCHITECTURE_DECISION_GATE_FIELD].triggerEvidence : []),
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.missingCausalEdge,
    metadata?.[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD]?.sameFrontierFallback,
  ].map(normalizeLedgerText).join(' '));
}

function metadataIsOwnerBoundaryMigrationPackage(metadata = {}) {
  return isObjectRecord(metadata?.[OWNER_BOUNDARY_MIGRATION_PROOF_FIELD]);
}

function metadataIsArchitectureContractPackage(metadata = {}) {
  return /(?:architecture|owner)[-_ ](?:contract|package)|architecture[-_ ]gap/iu.test(
    [
      metadataLane(metadata),
      metadata?.owner,
      metadata?.boundary,
      metadata?.dominantReason,
      metadata?.modelFit?.packageClass,
      metadata?.nextAction,
    ].map(normalizeLedgerText).join(' '),
  );
}

function metadataIsHumanEscalationPackage(metadata = {}) {
  return metadataHasSameFrontierHumanException(metadata);
}

function metadataAllowsWatchingOscillationRuntimeEdit(metadata = {}) {
  return metadataLane(metadata) === LANE_EXPERIMENT ||
    metadataHasSelectedNonLocalArchitectureRoute(metadata) ||
    metadataIsOwnerBoundaryMigrationPackage(metadata) ||
    metadataIsArchitectureContractPackage(metadata) ||
    metadataIsHumanEscalationPackage(metadata);
}

export function validateArchitectureDecisionGateContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const gate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  const requiresGate = metadataHasArchitectureGap(metadata);
  if (!gate) {
    return requiresGate ? [
      `${filePath}: metadata architectureDecisionGate is required because ` +
      'scenario evidence classified an architecture-gap; present concrete ' +
      'architecture choices before implementation.',
    ] : [];
  }
  if (!isObjectRecord(gate)) {
    return [`${filePath}: metadata architectureDecisionGate must be an object.`];
  }

  const errors = [];
  const status = normalizeLedgerText(gate.status);
  const trigger = normalizeLedgerText(gate.trigger);
  if (!ARCHITECTURE_DECISION_GATE_STATUSES.includes(status)) {
    errors.push(
      `${filePath}: architectureDecisionGate.status must be one of ` +
      `${ARCHITECTURE_DECISION_GATE_STATUSES.join(', ')}.`,
    );
  }
  if (!ARCHITECTURE_DECISION_GATE_TRIGGERS.includes(trigger)) {
    errors.push(
      `${filePath}: architectureDecisionGate.trigger must be one of ` +
      `${ARCHITECTURE_DECISION_GATE_TRIGGERS.join(', ')}.`,
    );
  }
  if (
    trigger !== ARCHITECTURE_DECISION_GATE_TRIGGER_NONE &&
    (!Array.isArray(gate.triggerEvidence) ||
      gate.triggerEvidence.length === NUM_ZERO)
  ) {
    errors.push(
      `${filePath}: architectureDecisionGate.triggerEvidence must record ` +
      'why the gate is active.',
    );
  }
  if (Array.isArray(gate.triggerEvidence)) {
    for (let index = NUM_ZERO; index < gate.triggerEvidence.length; index += NUM_ONE) {
      errors.push(...validateArchitectureGateConcreteText(
        filePath,
        `triggerEvidence[${index}]`,
        gate.triggerEvidence[index],
      ));
    }
  }
  if (
    status === ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED ||
    status === ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED ||
    status === ARCHITECTURE_DECISION_GATE_STATUS_SELECTED
  ) {
    errors.push(...validateArchitectureGateChoices(filePath, gate.choices));
  }
  if (status === ARCHITECTURE_DECISION_GATE_STATUS_SELECTED) {
    errors.push(...validateArchitectureGateSelectedChoice(filePath, gate));
  }
  if (
    status === ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED &&
    phase === VALIDATION_PHASE_PRE_IMPL &&
    fileStatus === STATUS_ACTIVE
  ) {
    errors.push(
      `${filePath}: architectureDecisionGate status is required; present ` +
      'concrete architecture choices or select the autonomous architecture package before implementation.',
    );
  }
  if (
    status === ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED &&
    phase === VALIDATION_PHASE_PRE_IMPL &&
    fileStatus === STATUS_ACTIVE
  ) {
    errors.push(
      `${filePath}: architectureDecisionGate status is presented; runtime ` +
      'implementation is blocked until a selected architecture route is recorded.',
    );
  }
  if (
    status === ARCHITECTURE_DECISION_GATE_STATUS_WATCHING &&
    trigger === ARCHITECTURE_DECISION_GATE_TRIGGER_FRONTIER_OSCILLATION &&
    phase === VALIDATION_PHASE_PRE_IMPL &&
    fileStatus === STATUS_ACTIVE &&
    hasRuntimeSourceWriteScope(metadata) &&
    !metadataAllowsWatchingOscillationRuntimeEdit(metadata)
  ) {
    errors.push(
      `${filePath}: architectureDecisionGate is watching frontier-oscillation; ` +
      'pre-implementation cannot start another active runtime edit until ' +
      'the next package is an autonomous experiment, owner-boundary migration, ' +
      'architecture contract, or selected architecture-package route; human ' +
      'escalation is only for contradictory or blocked evidence.',
    );
  }
  if (
    requiresGate &&
    status === ARCHITECTURE_DECISION_GATE_STATUS_NOT_REQUIRED
  ) {
    errors.push(
      `${filePath}: architectureDecisionGate cannot be not-required when ` +
      'scenario evidence classified an architecture-gap.',
    );
  }
  return errors;
}

function validateTwoLevelConcreteField(filePath, fieldPath, value) {
  if (isConcreteMetadataText(value)) {
    return [];
  }
  return [`${filePath}: ${fieldPath} must be a concrete two-level theory value.`];
}

function validateTwoLevelConcreteArray(
  filePath,
  parentField,
  metadata,
  fieldName,
  minLength = NUM_ONE,
) {
  const value = metadata?.[fieldName];
  const fieldPath = `${parentField}.${fieldName}`;
  if (!Array.isArray(value)) {
    return [`${filePath}: ${fieldPath} must be an array.`];
  }
  const errors = [];
  if (value.length < minLength) {
    errors.push(
      `${filePath}: ${fieldPath} must contain at least ${minLength} ` +
      'concrete item(s).',
    );
  }
  for (let index = NUM_ZERO; index < value.length; index += NUM_ONE) {
    errors.push(...validateTwoLevelConcreteField(
      filePath,
      `${fieldPath}[${index}]`,
      value[index],
    ));
  }
  return errors;
}

function validateTwoLevelCommandField(filePath, fieldPath, value) {
  const errors = validateTwoLevelConcreteField(filePath, fieldPath, value);
  const normalized = normalizeLedgerText(value);
  if (
    normalized.length > NUM_ZERO &&
    !MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN.test(normalized)
  ) {
    errors.push(`${filePath}: ${fieldPath} must name a focused command.`);
  }
  return errors;
}

function validateSystemTheoryTransitionTable(filePath, systemTheory) {
  const transitionTable =
    systemTheory?.[SYSTEM_THEORY_TRANSITION_TABLE_FIELD];
  const fieldPath =
    `${SYSTEM_THEORY_FIELD}.${SYSTEM_THEORY_TRANSITION_TABLE_FIELD}`;
  if (!Array.isArray(transitionTable)) {
    return [`${filePath}: ${fieldPath} must be an array.`];
  }
  const errors = [];
  if (transitionTable.length === NUM_ZERO) {
    errors.push(
      `${filePath}: ${fieldPath} must contain at least one transition row.`,
    );
  }
  for (let index = NUM_ZERO; index < transitionTable.length; index += NUM_ONE) {
    const row = transitionTable[index];
    const rowPath = `${fieldPath}[${index}]`;
    if (!isObjectRecord(row)) {
      errors.push(`${filePath}: ${rowPath} must be an object.`);
      continue;
    }
    for (const fieldName of SYSTEM_THEORY_TRANSITION_FIELDS) {
      const valuePath = `${rowPath}.${fieldName}`;
      if (fieldName === SYSTEM_THEORY_TRANSITION_FALSIFIER_FIELD) {
        errors.push(...validateTwoLevelCommandField(
          filePath,
          valuePath,
          row[fieldName],
        ));
      } else {
        errors.push(...validateTwoLevelConcreteField(
          filePath,
          valuePath,
          row[fieldName],
        ));
      }
    }
  }
  return errors;
}

function validateSystemTheory(filePath, systemTheory) {
  if (!isObjectRecord(systemTheory)) {
    return [`${filePath}: metadata ${SYSTEM_THEORY_FIELD} must be an object.`];
  }
  const errors = [];
  errors.push(...validateTwoLevelConcreteField(
    filePath,
    `${SYSTEM_THEORY_FIELD}.${SYSTEM_THEORY_PROBLEM_STATEMENT_FIELD}`,
    systemTheory[SYSTEM_THEORY_PROBLEM_STATEMENT_FIELD],
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_PHASE_CHAIN_FIELD,
    NUM_TWO,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_OWNER_BOUNDARY_MAP_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_STABLE_FACTS_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_CHANGED_FACTS_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_COMPETING_THEORIES_FIELD,
    NUM_TWO,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_ELIMINATED_THEORIES_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_DOWNSTREAM_SYMPTOMS_FIELD,
  ));
  errors.push(...validateSystemTheoryTransitionTable(filePath, systemTheory));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_OWNERSHIP_MIGRATION_TRIGGERS_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    SYSTEM_THEORY_FIELD,
    systemTheory,
    SYSTEM_THEORY_ARCHITECTURE_GAP_TRIGGERS_FIELD,
  ));
  errors.push(...validateSystemTheoryWholeSystemInvariants(
    filePath,
    systemTheory,
  ));
  return errors;
}

function validateSystemTheoryWholeSystemInvariants(filePath, systemTheory) {
  const errors = [];
  const scalar = systemTheory[SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD];
  const list = systemTheory[SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD];
  const hasScalar = scalar !== undefined && scalar !== null;
  const hasList = list !== undefined && list !== null;
  if (!hasScalar && !hasList) {
    errors.push(
      `${filePath}: ${SYSTEM_THEORY_FIELD}.` +
      `${SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD} or ` +
      `${SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD} must be present.`,
    );
    return errors;
  }
  if (hasScalar && !hasList) {
    errors.push(...validateTwoLevelConcreteField(
      filePath,
      `${SYSTEM_THEORY_FIELD}.${SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD}`,
      scalar,
    ));
  }
  if (!hasList) {
    return errors;
  }
  const fieldPath =
    `${SYSTEM_THEORY_FIELD}.${SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD}`;
  if (!Array.isArray(list)) {
    errors.push(`${filePath}: ${fieldPath} must be an array.`);
    return errors;
  }
  if (list.length === NUM_ZERO) {
    errors.push(
      `${filePath}: ${fieldPath} must contain at least one invariant entry.`,
    );
    return errors;
  }
  let anyCoupling = false;
  for (let index = NUM_ZERO; index < list.length; index += NUM_ONE) {
    const entry = list[index];
    const entryPath = `${fieldPath}[${index}]`;
    if (!isObjectRecord(entry)) {
      errors.push(`${filePath}: ${entryPath} must be an object.`);
      continue;
    }
    errors.push(...validateTwoLevelConcreteField(
      filePath,
      `${entryPath}.${SYSTEM_THEORY_INVARIANT_ENTRY_INVARIANT_FIELD}`,
      entry[SYSTEM_THEORY_INVARIANT_ENTRY_INVARIANT_FIELD],
    ));
    const coupledWith =
      entry[SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD];
    if (!Array.isArray(coupledWith)) {
      errors.push(
        `${filePath}: ${entryPath}.` +
        `${SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD} must be an array.`,
      );
    } else if (coupledWith.length > NUM_ZERO) {
      anyCoupling = true;
      for (let j = NUM_ZERO; j < coupledWith.length; j += NUM_ONE) {
        errors.push(...validateTwoLevelConcreteField(
          filePath,
          `${entryPath}.` +
          `${SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD}[${j}]`,
          coupledWith[j],
        ));
      }
    }
    errors.push(...validateTwoLevelConcreteField(
      filePath,
      `${entryPath}.${SYSTEM_THEORY_INVARIANT_ENTRY_COUPLING_NOTE_FIELD}`,
      entry[SYSTEM_THEORY_INVARIANT_ENTRY_COUPLING_NOTE_FIELD],
    ));
  }
  if (list.length > NUM_ONE && !anyCoupling) {
    errors.push(
      `${filePath}: ${fieldPath}: when more than one invariant is listed, ` +
      'at least one entry must declare a non-empty coupledWith list ' +
      '(coupled-invariants-undeclared).',
    );
  }
  return errors;
}

function validateModelTheory(filePath, modelTheory) {
  if (modelTheory === undefined || modelTheory === null) {
    return [];
  }
  if (!isObjectRecord(modelTheory)) {
    return [`${filePath}: metadata ${MODEL_THEORY_FIELD} must be an object.`];
  }
  const errors = [];
  const kind = modelTheory[MODEL_THEORY_KIND_FIELD];
  const kindPath = `${MODEL_THEORY_FIELD}.${MODEL_THEORY_KIND_FIELD}`;
  errors.push(...validateTwoLevelConcreteField(filePath, kindPath, kind));
  if (
    typeof kind === 'string' &&
    kind.length > NUM_ZERO &&
    !MODEL_THEORY_VALID_KINDS.includes(kind)
  ) {
    errors.push(
      `${filePath}: ${kindPath} must be one of ` +
      `${MODEL_THEORY_VALID_KINDS.join(', ')}.`,
    );
  }
  const artifact = modelTheory[MODEL_THEORY_EXECUTABLE_ARTIFACT_FIELD];
  const artifactPath =
    `${MODEL_THEORY_FIELD}.${MODEL_THEORY_EXECUTABLE_ARTIFACT_FIELD}`;
  errors.push(...validateTwoLevelConcreteField(
    filePath,
    artifactPath,
    artifact,
  ));
  if (
    typeof artifact === 'string' &&
    artifact.length > NUM_ZERO &&
    !/^(?:test|scripts|docs\/specs)\//u.test(artifact)
  ) {
    errors.push(
      `${filePath}: ${artifactPath} must point under test/, scripts/, ` +
      'or docs/specs/.',
    );
  }
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    MODEL_THEORY_FIELD,
    modelTheory,
    MODEL_THEORY_PROPERTIES_PROVEN_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteArray(
    filePath,
    MODEL_THEORY_FIELD,
    modelTheory,
    MODEL_THEORY_ASSUMPTIONS_FIELD,
  ));
  errors.push(...validateTwoLevelConcreteField(
    filePath,
    `${MODEL_THEORY_FIELD}.${MODEL_THEORY_COUNTER_EXAMPLE_HANDLING_FIELD}`,
    modelTheory[MODEL_THEORY_COUNTER_EXAMPLE_HANDLING_FIELD],
  ));
  errors.push(...validateTwoLevelConcreteField(
    filePath,
    `${MODEL_THEORY_FIELD}.${MODEL_THEORY_LINKED_SYSTEM_THEORY_REF_FIELD}`,
    modelTheory[MODEL_THEORY_LINKED_SYSTEM_THEORY_REF_FIELD],
  ));
  return errors;
}

function validateTheoryFitScore(filePath, score) {
  const fieldPath =
    `${SLICE_THEORY_FIELD}.${SLICE_THEORY_THEORY_FIT_SCORE_FIELD}`;
  if (!isObjectRecord(score)) {
    return [`${filePath}: ${fieldPath} must be an object.`];
  }
  const errors = [];
  for (const fieldName of THEORY_FIT_SCORE_FIELDS) {
    const valuePath = `${fieldPath}.${fieldName}`;
    const value = score[fieldName];
    errors.push(...validateTwoLevelConcreteField(filePath, valuePath, value));
    const normalized = normalizeLedgerText(value);
    if (
      normalized.length > NUM_ZERO &&
      !TWO_LEVEL_THEORY_SCORE_PATTERN.test(normalized)
    ) {
      errors.push(
        `${filePath}: ${valuePath} must include a high, medium, or low ` +
        'fit score with rationale.',
      );
    }
  }
  return errors;
}

function validateSliceTheory(filePath, sliceTheory) {
  if (!isObjectRecord(sliceTheory)) {
    return [`${filePath}: metadata ${SLICE_THEORY_FIELD} must be an object.`];
  }
  const errors = [];
  for (const fieldName of SLICE_THEORY_FIELDS) {
    if (fieldName === SLICE_THEORY_THEORY_FIT_SCORE_FIELD) {
      errors.push(...validateTheoryFitScore(filePath, sliceTheory[fieldName]));
      continue;
    }
    if (fieldName === SLICE_THEORY_WRONG_SLICE_TRIGGERS_FIELD) {
      errors.push(...validateTwoLevelConcreteArray(
        filePath,
        SLICE_THEORY_FIELD,
        sliceTheory,
        fieldName,
      ));
      continue;
    }
    const fieldPath = `${SLICE_THEORY_FIELD}.${fieldName}`;
    if (fieldName === SLICE_THEORY_FALSIFIER_FIELD) {
      errors.push(...validateTwoLevelCommandField(
        filePath,
        fieldPath,
        sliceTheory[fieldName],
      ));
    } else {
      errors.push(...validateTwoLevelConcreteField(
        filePath,
        fieldPath,
        sliceTheory[fieldName],
      ));
    }
  }
  const selectedMechanism = normalizeLedgerText(
    sliceTheory[SLICE_THEORY_SELECTED_MECHANISM_FIELD],
  );
  if (
    selectedMechanism.length > NUM_ZERO &&
    !TWO_LEVEL_THEORY_MECHANISM_PATTERN.test(selectedMechanism)
  ) {
    errors.push(
      `${filePath}: ${SLICE_THEORY_FIELD}.` +
      `${SLICE_THEORY_SELECTED_MECHANISM_FIELD} must name a mechanism ` +
      'taxonomy term such as contract_gap or ownership_gap.',
    );
  }
  const movement = normalizeLedgerText(
    sliceTheory[SLICE_THEORY_REPRESENTATIVE_MOVEMENT_FIELD],
  );
  if (
    movement.length > NUM_ZERO &&
    !REPRESENTATIVE_MOVEMENT_PREDICTION_PATTERN.test(movement) &&
    !/\b(?:contract|architecture[-\s]+gap|route selection|selected route)\b/iu.test(movement)
  ) {
    errors.push(
      `${filePath}: ${SLICE_THEORY_FIELD}.` +
      `${SLICE_THEORY_REPRESENTATIVE_MOVEMENT_FIELD} must name a concrete ` +
      'frontier move, migration, route selection, representative green, or architecture-gap result.',
    );
  }
  const killRule = normalizeLedgerText(sliceTheory[SLICE_THEORY_KILL_RULE_FIELD]);
  if (
    killRule.length > NUM_ZERO &&
    !DECISION_EXPERIMENT_KILL_RULE_PATTERN.test(killRule)
  ) {
    errors.push(
      `${filePath}: ${SLICE_THEORY_FIELD}.${SLICE_THEORY_KILL_RULE_FIELD} ` +
      'must stop or escalate on unchanged evidence, same-frontier evidence, ' +
      'no-reduction evidence, or architecture-gap evidence.',
    );
  }
  return errors;
}

export function validateTwoLevelTheoryContract(
  metadata,
  filePath,
  options = {},
) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  const requiresTheory =
    options[LEDGER_VALIDATION_REQUIRES_LEDGER] === true ||
    metadataRequiresTwoLevelTheory(metadata, fileStatus, phase);
  const systemTheory = metadata?.[SYSTEM_THEORY_FIELD];
  const sliceTheory = metadata?.[SLICE_THEORY_FIELD];
  const errors = [];
  if (!systemTheory && requiresTheory) {
    errors.push(
      `${filePath}: metadata ${SYSTEM_THEORY_FIELD} is required for active ` +
      'causal-escalation, architecture-gated, owner-migration, or repeated-frontier packages.',
    );
  }
  if (!sliceTheory && requiresTheory) {
    errors.push(
      `${filePath}: metadata ${SLICE_THEORY_FIELD} is required for active ` +
      'causal-escalation, architecture-gated, owner-migration, or repeated-frontier packages.',
    );
  }
  if (systemTheory !== undefined) {
    errors.push(...validateSystemTheory(filePath, systemTheory));
  }
  if (sliceTheory !== undefined) {
    errors.push(...validateSliceTheory(filePath, sliceTheory));
  }
  errors.push(...validateModelTheory(filePath, metadata?.[MODEL_THEORY_FIELD]));
  return errors;
}

const COMPOSITIONAL_GATE_PACKAGE_DIR = 'work/packages';
const COMPOSITIONAL_GATE_HISTORY_LIMIT = 12;
const COMPOSITIONAL_GATE_REVISION_SLUG_PATTERNS = [
  /system-theory-rederive/iu,
  /system-theory-revision/iu,
  /system-theory-rev\b/iu,
  /whole-system-theory/iu,
];
const COMPOSITIONAL_GATE_REVISION_LANE_VALUES = new Set([
  'system-theory-rederive',
  'system-theory-revision',
  'theory-rederive',
]);
// F0 — canonical packageClass tokens for the rederive class. Detection
// prefers modelFit.packageClass; lane / kind / slug are legacy fallbacks.
const COMPOSITIONAL_GATE_REVISION_PACKAGE_CLASS_VALUES = new Set([
  'system-theory-rederive',
  'system-theory-revision',
  'theory-rederive',
  'whole-system-theory',
]);

export function metadataIsSystemTheoryRevision(metadata, filePath) {
  if (!metadata || typeof metadata !== 'object') return false;
  const packageClass = normalizeLedgerText(metadata.modelFit?.packageClass);
  if (
    packageClass &&
    COMPOSITIONAL_GATE_REVISION_PACKAGE_CLASS_VALUES.has(packageClass)
  ) return true;
  const lane = normalizeLedgerText(metadata.lane);
  if (lane && COMPOSITIONAL_GATE_REVISION_LANE_VALUES.has(lane)) return true;
  const kind = normalizeLedgerText(metadata.packageKind || metadata.kind);
  if (kind && COMPOSITIONAL_GATE_REVISION_LANE_VALUES.has(kind)) return true;
  if (metadata.systemTheoryRevision === true) return true;
  const slug = String(filePath || '').toLowerCase();
  return COMPOSITIONAL_GATE_REVISION_SLUG_PATTERNS.some((re) => re.test(slug));
}

function loadCompositionalSignalsFromFrontier(packageDir, owner, boundary) {
  if (!owner || !boundary) return {signals: [], history: []};
  let entries;
  try {
    entries = fsSync.readdirSync(packageDir);
  } catch (_error) {
    return {signals: [], history: []};
  }
  const mdFiles = entries.filter((f) =>
    f.endsWith('.md') &&
    (f.startsWith('done-') || f.startsWith('active-') || f.startsWith('superseded-')),
  );
  const parsed = mdFiles
    .map((f) => parseFrontierHistoryPackageFile(path.join(packageDir, f)))
    .filter(Boolean);
  const history = filterFrontierHistory(parsed, owner, boundary, COMPOSITIONAL_GATE_HISTORY_LIMIT);
  return {history, signals: detectCompositionalSignals(history)};
}

export function validateCompositionalAutoPromoteGate(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const fileStatus = options.status || normalizeLedgerText(metadata.status);
  if (phase !== VALIDATION_PHASE_PRE_IMPL) return errors;
  if (fileStatus !== STATUS_ACTIVE && fileStatus !== STATUS_TODO) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  const isRevision = metadataIsSystemTheoryRevision(metadata, filePath);
  const isArchitectureGap = metadataIsArchitectureGapAnalysis(metadata, filePath);
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  const {signals} = loadCompositionalSignalsFromFrontier(packageDir, owner, boundary);
  if (signals.length === 0) return errors;
  // R7 specialisation: pair-alternation-post-rederive REQUIRES architecture-gap;
  // even a fresh rederive cannot pass this gate.
  const postRederive = signals.find(
    (s) => s.pattern === 'pair-alternation-post-rederive',
  );
  if (postRederive && !isArchitectureGap) {
    errors.push(
      `${filePath}: pair-alternation-post-rederive-requires-architecture-gap — ` +
      `${postRederive.mechanism} continued to alternate after the most recent ` +
      `system-theory-rederive on owner=${owner} boundary=${boundary}. ` +
      'Another rederive is not permitted; open an architecture-gap-analysis ' +
      `package (lane: causal-escalation with slug containing 'architecture-gap', ` +
      `or set metadata.architectureGapAnalysis: true) before any further runtime ` +
      'or rederive package on this pair.',
    );
    return errors;
  }
  if (isRevision) return errors;
  if (isArchitectureGap) return errors;
  const summary = signals
    .map((s) => `${s.pattern}:${s.mechanism}`)
    .join(', ');
  errors.push(
    `${filePath}: compositional-gate-blocked — ${signals.length} compositional ` +
    `signal(s) fired for owner=${owner} boundary=${boundary} ` +
    `(${summary}). Per work/RULES.md "Compositional Auto-Promote Rule", ` +
    'no further local slice may be promoted on this owner/boundary until a ' +
    'systemTheory revision package is opened. Open a package with lane ' +
    '"system-theory-rederive" (or set systemTheoryRevision: true), or run ' +
    '`npm run work:system-theory:rederive -- --owner ' + owner +
    ' --boundary ' + boundary + '` for guidance.',
  );
  return errors;
}

// ---------------------------------------------------------------------------
// Theory-Loop Phase 4: R1 / R2 / R3 / R4 / R5 / R6 / R8 / R9 validators.
// These build on the compositional-signal substrate above and are wired into
// the pre-impl orchestrator alongside validateCompositionalAutoPromoteGate.
// All validators are additive: legacy sprints/packages without the relevant
// fields/signals are exempt (validator no-ops).
// ---------------------------------------------------------------------------

const ARCHITECTURE_GAP_LANE_VALUES = new Set([
  'architecture-gap-analysis',
  'causal-escalation',
]);
const ARCHITECTURE_GAP_SLUG_PATTERN = /architecture[-_]gap/iu;
// F0 — canonical packageClass tokens for the architecture-gap class.
const ARCHITECTURE_GAP_PACKAGE_CLASS_PATTERN = /^architecture-gap(?:[-\s]|$)/iu;
const JOINT_FALSIFIER_TAG_PATTERN = /#\s*coupled[-_]invariant\b/iu;
const SPRINT_JOINT_PROBE_HEADING = '## Joint Coupled-Invariant Probe';
const SPRINT_JOINT_PROBE_LABEL_COMMAND = 'Command';
const SPRINT_JOINT_PROBE_LABEL_LAST_RUN = 'Last run';
const SPRINT_JOINT_PROBE_LABEL_RESIDUAL_COUNT = 'Last residual count';
const SPRINT_JOINT_PROBE_LABEL_RESIDUAL_TREND = 'Residual trend';
const SPRINT_JOINT_PROBE_LABEL_BOUNDARIES = 'Boundaries covered';
const SPRINT_JOINT_PROBE_TREND_VALUES = new Set([
  'decreasing',
  'flat',
  'increasing',
  'unknown',
]);
const STICKY_LEDGER_RECENT_PACKAGE_WINDOW = 3;
const STICKY_LEDGER_REDERIVE_AGE_DAYS = 14;
const LOOP_EXHAUSTION_LOOKBACK = 3;
const LOOP_EXHAUSTION_NON_CONFIRMED_OUTCOMES = new Set([
  'inconclusive',
  'theory-falsified',
  'migrated',
]);

export function metadataIsArchitectureGapAnalysis(metadata, filePath) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.architectureGapAnalysis === true) return true;
  const packageClass = normalizeLedgerText(metadata.modelFit?.packageClass);
  if (packageClass && ARCHITECTURE_GAP_PACKAGE_CLASS_PATTERN.test(packageClass)) {
    return true;
  }
  const lane = normalizeLedgerText(metadata.lane);
  const slug = String(filePath || '').toLowerCase();
  if (ARCHITECTURE_GAP_SLUG_PATTERN.test(slug)) {
    return ARCHITECTURE_GAP_LANE_VALUES.has(lane) ||
      lane === 'architecture-gap-analysis' ||
      lane === 'causal-escalation';
  }
  return lane === 'architecture-gap-analysis';
}

function listPackagesInDir(packageDir) {
  let entries;
  try {
    entries = fsSync.readdirSync(packageDir);
  } catch (_e) {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.md') &&
      (f.startsWith('active-') || f.startsWith('todo-') ||
       f.startsWith('done-') || f.startsWith('superseded-')))
    .map((f) => parseFrontierHistoryPackageFile(path.join(packageDir, f)))
    .filter(Boolean);
}

function getAlternatingPairBoundariesForGate(packageDir, owner, boundary) {
  const parsed = listPackagesInDir(packageDir);
  return findAlternatingPairBoundaries(parsed, owner, boundary, 24);
}

function detectAlternatingPairActive(packageDir, owner, boundary, minClosures = 3) {
  // Returns the partner boundaries when (a) ≥1 partner exists by mechanism-
  // pair membership, AND (b) the total number of closed packages spanning
  // {self, partners} within the recent window is at least minClosures.
  const parsed = listPackagesInDir(packageDir);
  const partners = findAlternatingPairBoundaries(parsed, owner, boundary, 24);
  if (partners.length === 0) return [];
  const targetKeys = new Set([
    `${owner}::${boundary}`,
    ...partners.map((p) => `${p.owner}::${p.boundary}`),
  ]);
  const closedOnPair = parsed
    .filter((pkg) => pkg.status === 'done')
    .filter((pkg) => targetKeys.has(`${pkg.owner}::${pkg.boundary}`));
  if (closedOnPair.length < minClosures) return [];
  return partners;
}

function readPackageMetadata(filePath) {
  let content;
  try {
    content = fsSync.readFileSync(filePath, ENCODING_UTF8);
  } catch (_e) {
    return null;
  }
  const m = content.match(/<!--\s*work-package\s*\n([\s\S]*?)\n\s*-->/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch (_e) {
    return null;
  }
}

function isSourceTouchingPackage(meta) {
  if (!meta) return false;
  const lane = normalizeLedgerText(meta.lane || meta?.intent?.lane);
  if (
    lane === 'system-theory-rederive' ||
    lane === 'system-theory-revision' ||
    lane === 'theory-rederive'
  ) return false;
  if (meta.systemTheoryRevision === true) return false;
  const writeScope = []
    .concat(meta.writeScope || [])
    .concat(meta?.scope?.writeScope || []);
  return writeScope.some((p) => isSourceWritePath(normalizeLedgerText(p)));
}

export function validateAlternatingPairMutex(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata.status);
  if (phase !== VALIDATION_PHASE_PRE_IMPL) return errors;
  if (status !== STATUS_ACTIVE && status !== STATUS_TODO) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  // Exempt: this package itself is a rederive package — rederive is the
  // permitted way to break the mutex. (Mutex applies to runtime/scenario
  // packages that intend to write src/.)
  const selfIsRederive = metadataIsSystemTheoryRevision(metadata, filePath);
  const selfIsArchGap = metadataIsArchitectureGapAnalysis(metadata, filePath);
  const selfIsSourceTouching = (() => {
    const writeScope = []
      .concat(metadata.writeScope || [])
      .concat(metadata?.scope?.writeScope || []);
    return writeScope.some((p) => isSourceWritePath(normalizeLedgerText(p)));
  })();
  if (selfIsRederive || selfIsArchGap) return errors;
  if (!selfIsSourceTouching) return errors;
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  const pairBoundaries = detectAlternatingPairActive(packageDir, owner, boundary);
  if (pairBoundaries.length === 0) return errors;
  const selfFileName = path.basename(String(filePath || '')).toLowerCase();
  const otherActivePackagesOnPair = listPackagesInDir(packageDir)
    .filter((pkg) => pkg.status === STATUS_ACTIVE || pkg.status === STATUS_TODO)
    .filter((pkg) => pkg.fileName.toLowerCase() !== selfFileName)
    .filter((pkg) => {
      const sameOurs =
        pkg.owner === owner && pkg.boundary === boundary;
      const samePair = pairBoundaries.some(
        (p) => p.owner === pkg.owner && p.boundary === pkg.boundary,
      );
      return sameOurs || samePair;
    });
  if (otherActivePackagesOnPair.length === 0) return errors;
  const rederiveActive = otherActivePackagesOnPair.find((p) => {
    const meta = readPackageMetadata(path.join(packageDir, p.fileName));
    return metadataIsSystemTheoryRevision(meta, p.fileName);
  });
  if (rederiveActive) {
    errors.push(
      `${filePath}: alternating-pair-rederive-in-progress — a system-theory-` +
      `rederive package (${rederiveActive.fileName}) is open on the same ` +
      `alternating pair as owner=${owner} boundary=${boundary}. Per ` +
      'work/RULES.md "Alternating-Pair Mutex", runtime/scenario work on the ' +
      'pair must wait for the rederive to close (or be superseded) before ' +
      'activating. Mark this package superseded or block its activation until ' +
      `${rederiveActive.fileName} is done.`,
    );
    return errors;
  }
  const conflict = otherActivePackagesOnPair[0];
  errors.push(
    `${filePath}: alternating-pair-concurrent-runtime — another runtime ` +
    `package (${conflict.fileName}) is active on the same alternating pair ` +
    `(${conflict.owner}/${conflict.boundary}) as this package (${owner}/` +
    `${boundary}). Per work/RULES.md "Alternating-Pair Mutex", only one ` +
    'runtime/scenario package may be active per alternating pair; supersede ' +
    'or close one before activating the other.',
  );
  return errors;
}

function rederiveSignalRequiringCoupling(signals) {
  return signals.find((s) =>
    s.pattern === 'compositional-pair-alternation' ||
    s.pattern === 'pair-alternation-post-rederive' ||
    s.pattern === 'emergent-class-present',
  );
}

export function validateRederiveCoupledInvariants(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata.status);
  if (
    phase !== VALIDATION_PHASE_PRE_IMPL &&
    phase !== VALIDATION_PHASE_CLOSURE
  ) return errors;
  if (
    status !== STATUS_ACTIVE &&
    status !== STATUS_TODO &&
    status !== STATUS_DONE
  ) return errors;
  if (!metadataIsSystemTheoryRevision(metadata, filePath)) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  const {signals} = loadCompositionalSignalsFromFrontier(packageDir, owner, boundary);
  const localTrigger = rederiveSignalRequiringCoupling(signals);
  const pairBoundaries = detectAlternatingPairActive(packageDir, owner, boundary);
  const trigger = localTrigger || (pairBoundaries.length > 0
    ? {pattern: 'compositional-pair-alternation', mechanism: 'cross-boundary'}
    : null);
  if (!trigger && options.requireUnconditionally !== true) return errors;
  const systemTheory = metadata.systemTheory;
  if (!isObjectRecord(systemTheory)) {
    errors.push(
      `${filePath}: rederive-coupled-invariants-missing — system-theory-` +
      'rederive package must declare metadata.systemTheory with the list-form ' +
      'wholeSystemInvariants block.',
    );
    return errors;
  }
  const list = systemTheory.wholeSystemInvariants;
  if (!Array.isArray(list) || list.length < 2) {
    errors.push(
      `${filePath}: rederive-coupled-invariants-missing — ` +
      'systemTheory.wholeSystemInvariants must be a list with at least 2 ' +
      `entries when triggered by ${trigger.pattern}. ` +
      'Single-invariant systemTheory cannot represent a coupled pair.',
    );
    return errors;
  }
  const anyCoupling = list.some((entry) =>
    isObjectRecord(entry) &&
    Array.isArray(entry.coupledWith) &&
    entry.coupledWith.length > 0,
  );
  if (!anyCoupling) {
    errors.push(
      `${filePath}: rederive-coupled-invariants-missing — at least one ` +
      'wholeSystemInvariants entry must declare a non-empty coupledWith list.',
    );
  }
  // When the trigger involves cross-boundary alternation, require both pair
  // boundary names to appear in at least one invariant entry's invariant text
  // or couplingNote.
  if (
    trigger.pattern === 'compositional-pair-alternation' ||
    trigger.pattern === 'pair-alternation-post-rederive'
  ) {
    const selfToken = String(boundary).toLowerCase();
    const partnerTokens = pairBoundaries
      .map((p) => String(p.boundary).toLowerCase())
      .filter(Boolean);
    const corpus = list
      .map((entry) =>
        isObjectRecord(entry)
          ? `${entry.invariant || ''} ${entry.couplingNote || ''}`
          : '',
      )
      .join(' ')
      .toLowerCase();
    const selfMentioned = selfToken && corpus.includes(selfToken);
    const partnerMentioned = partnerTokens.some((t) => corpus.includes(t));
    if (!selfMentioned || (partnerTokens.length > 0 && !partnerMentioned)) {
      const missing = [];
      if (!selfMentioned) missing.push(selfToken);
      if (partnerTokens.length > 0 && !partnerMentioned) {
        missing.push(`at least one of {${partnerTokens.join(', ')}}`);
      }
      errors.push(
        `${filePath}: rederive-coupled-invariants-missing — ` +
        'wholeSystemInvariants entries must cite the self boundary and at ' +
        `least one alternating-pair partner boundary in 'invariant' or 'couplingNote'. Missing: ${missing.join('; ')}.`,
      );
    }
  }
  return errors;
}

function findSprintFileFromMetadata(metadata) {
  const candidates = []
    .concat(metadata?.scope?.commitScope || [])
    .concat(metadata.commitScope || [])
    .concat(metadata?.scope?.writeScope || [])
    .concat(metadata.writeScope || []);
  for (const candidate of candidates.map(normalizeLedgerText)) {
    if (/^work\/sprints\/(?:active|todo)-.+\.md$/u.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractSprintJointProbeSection(sprintContent) {
  if (!sprintContent) return null;
  const lines = sprintContent.split('\n');
  let inSection = false;
  const body = [];
  for (const line of lines) {
    if (/^##\s/u.test(line)) {
      if (inSection) break;
      if (/^##\s+Joint Coupled-Invariant Probe\s*$/u.test(line)) {
        inSection = true;
        continue;
      }
    }
    if (inSection) body.push(line);
  }
  if (!inSection) return null;
  const fields = {};
  for (const line of body) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue;
    const colon = trimmed.indexOf(':');
    if (colon < 0) continue;
    const key = trimmed.slice(1, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    fields[key] = value;
  }
  return fields;
}

export function validateRederiveJointFalsifier(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  if (
    phase !== VALIDATION_PHASE_PRE_IMPL &&
    phase !== VALIDATION_PHASE_CLOSURE
  ) return errors;
  if (!metadataIsSystemTheoryRevision(metadata, filePath)) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  const {signals} = loadCompositionalSignalsFromFrontier(packageDir, owner, boundary);
  const localTrigger = signals.find((s) =>
    s.pattern === 'compositional-pair-alternation' ||
    s.pattern === 'pair-alternation-post-rederive' ||
    s.pattern === 'emergent-class-present',
  );
  const pairBoundaries = detectAlternatingPairActive(packageDir, owner, boundary);
  const trigger = localTrigger || (pairBoundaries.length > 0
    ? {pattern: 'compositional-pair-alternation'}
    : null);
  if (!trigger && options.requireUnconditionally !== true) return errors;
  const theoryLoop = metadata[THEORY_LOOP_FIELD] || {};
  const taggedFalsifier = (metadata.proof || [])
    .map(parseProofCommand)
    .filter(Boolean)
    .find((c) => c.role === 'falsifier' && JOINT_FALSIFIER_TAG_PATTERN.test(c.command));
  const jointFromField = normalizeLedgerText(
    theoryLoop[THEORY_LOOP_JOINT_FALSIFIER_COMMAND_FIELD],
  );
  const jointCommand = taggedFalsifier
    ? taggedFalsifier.command.replace(/#\s*coupled[-_]invariant\b.*$/iu, '').trim()
    : jointFromField;
  if (!jointCommand) {
    errors.push(
      `${filePath}: rederive-joint-falsifier-missing — rederive package must ` +
      'declare a joint coupled-invariant falsifier, either as a proof falsifier ' +
      'command tagged with `# coupled-invariant`, or as ' +
      `theoryLoop.${THEORY_LOOP_JOINT_FALSIFIER_COMMAND_FIELD}.`,
    );
    return errors;
  }
  if (/\s&&\s|\s\|\|\s|\s;\s/u.test(jointCommand)) {
    errors.push(
      `${filePath}: rederive-joint-falsifier-not-replayable — joint falsifier ` +
      'must be a single replayable command; chaining via &&, ||, or ; is not ' +
      'allowed.',
    );
  }
  // The command must mention the self boundary and at least one partner.
  const partnerBoundaries = pairBoundaries.map((p) => p.boundary).filter(Boolean);
  const tokenizedCommand = jointCommand.toLowerCase();
  const mentions = (b) => {
    const snake = String(b).toLowerCase();
    const kebab = snake.replace(/_/g, '-');
    return tokenizedCommand.includes(snake) || tokenizedCommand.includes(kebab);
  };
  const selfMentioned = mentions(boundary);
  const partnerMentioned = partnerBoundaries.length === 0
    ? true
    : partnerBoundaries.some(mentions);
  if (!selfMentioned || !partnerMentioned) {
    const missing = [];
    if (!selfMentioned) missing.push(String(boundary));
    if (!partnerMentioned) {
      missing.push(`at least one of {${partnerBoundaries.join(', ')}}`);
    }
    errors.push(
      `${filePath}: rederive-joint-falsifier-boundaries-missing — joint ` +
      'falsifier command must mention the self boundary and at least one ' +
      `alternating-pair partner boundary (missing: ${missing.join('; ')}).`,
    );
  }
  // The same command must appear in the active sprint's
  // ## Joint Coupled-Invariant Probe section.
  const sprintPath = findSprintFileFromMetadata(metadata);
  if (sprintPath) {
    const sprintAbs = path.resolve(process.cwd(), sprintPath);
    let sprintContent = '';
    try {
      sprintContent = fsSync.readFileSync(sprintAbs, ENCODING_UTF8);
    } catch (_e) {
      sprintContent = '';
    }
    const probe = extractSprintJointProbeSection(sprintContent);
    if (!probe || !probe[SPRINT_JOINT_PROBE_LABEL_COMMAND]) {
      errors.push(
        `${filePath}: sprint-joint-coupled-invariant-probe-missing — active ` +
        `sprint (${sprintPath}) must include a "${SPRINT_JOINT_PROBE_HEADING}" ` +
        'section with at least a `Command:` line that matches the package ' +
        'joint falsifier.',
      );
    } else if (!probe[SPRINT_JOINT_PROBE_LABEL_COMMAND].includes(jointCommand)) {
      errors.push(
        `${filePath}: sprint-joint-coupled-invariant-probe-missing — sprint ` +
        `${SPRINT_JOINT_PROBE_HEADING} Command does not include the rederive ` +
        'package joint falsifier command verbatim.',
      );
    }
  }
  return errors;
}

function countConsecutiveBoundaryHistory(history, owner, boundary) {
  let count = 0;
  for (const item of history) {
    if (item.status !== 'done') continue;
    if (item.owner === owner && item.boundary === boundary) count += 1;
    else break;
  }
  return count;
}

function readLedgerSlugs(ledgerPath) {
  try {
    const raw = fsSync.readFileSync(ledgerPath, ENCODING_UTF8);
    const slugs = new Set();
    const re = /^###?\s*`?(theory-\d{8}-[a-z0-9][a-z0-9-]*)`?/gmu;
    let m;
    while ((m = re.exec(raw))) slugs.add(m[1]);
    return slugs;
  } catch (_e) {
    return new Set();
  }
}

function findRecentRederiveLedgerSlug(packageDir, owner, boundary, ledgerSlugs) {
  const parsed = listPackagesInDir(packageDir)
    .filter((pkg) => pkg.status === 'done')
    .filter((pkg) => pkg.owner === owner && pkg.boundary === boundary)
    .filter((pkg) => packageIsRederive(pkg));
  const cutoffMs =
    Date.now() - STICKY_LEDGER_REDERIVE_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const pkg of parsed) {
    const dateMatch = String(pkg.opened || pkg.dateStr || '')
      .match(/(\d{4})-?(\d{2})-?(\d{2})/u);
    if (!dateMatch) continue;
    const ms = Date.parse(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
    if (Number.isNaN(ms) || ms < cutoffMs) continue;
    const meta = readPackageMetadata(path.join(packageDir, pkg.fileName));
    const refs = []
      .concat(meta?.theoryLedgerRefs || [])
      .concat(meta?.execution?.theoryLedgerRefs || []);
    for (const ref of refs.map(normalizeLedgerText)) {
      if (ledgerSlugs.has(ref)) return ref;
    }
  }
  return null;
}

export function validateStickyTheoryLedger(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata.status);
  if (phase !== VALIDATION_PHASE_PRE_IMPL) return errors;
  if (status !== STATUS_ACTIVE && status !== STATUS_TODO) return errors;
  // Skip: rederive, architecture-gap, lightweight maintenance, and
  // non-source-touching (classification-only / documentary) packages.
  if (metadataIsSystemTheoryRevision(metadata, filePath)) return errors;
  if (metadataIsArchitectureGapAnalysis(metadata, filePath)) return errors;
  if (!isSourceTouchingPackage(metadata)) return errors;
  const lane = normalizeLedgerText(metadata.lane);
  if (
    lane === 'lightweight-maintenance' ||
    lane === 'mechanical-maintenance' ||
    lane === 'read-review-doc-only' ||
    lane === 'read-doc'
  ) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  const history = filterFrontierHistory(
    listPackagesInDir(packageDir),
    owner,
    boundary,
    STICKY_LEDGER_RECENT_PACKAGE_WINDOW + 2,
  );
  const consecutive = countConsecutiveBoundaryHistory(history, owner, boundary);
  if (consecutive < STICKY_LEDGER_RECENT_PACKAGE_WINDOW) return errors;
  const refs = []
    .concat(metadata?.theoryLedgerRefs || [])
    .concat(metadata?.execution?.theoryLedgerRefs || []);
  const ledgerPath = options.ledgerPath
    ? path.resolve(options.ledgerPath)
    : path.resolve(process.cwd(), DEFAULT_THEORY_LEDGER_PATH);
  const ledgerSlugs = readLedgerSlugs(ledgerPath);
  const realRefs = refs
    .map(normalizeLedgerText)
    .filter((ref) => ledgerSlugs.has(ref));
  if (realRefs.length === 0) {
    errors.push(
      `${filePath}: sticky-theory-ledger-empty — owner=${owner} ` +
      `boundary=${boundary} has ≥${STICKY_LEDGER_RECENT_PACKAGE_WINDOW} ` +
      'consecutive closed packages; metadata.theoryLedgerRefs (or ' +
      'execution.theoryLedgerRefs) must include at least one real theory ' +
      `entry from ${path.relative(process.cwd(), ledgerPath) || DEFAULT_THEORY_LEDGER_PATH}.`,
    );
    return errors;
  }
  const recentRederiveSlug = findRecentRederiveLedgerSlug(
    packageDir, owner, boundary, ledgerSlugs,
  );
  if (recentRederiveSlug && !realRefs.includes(recentRederiveSlug)) {
    errors.push(
      `${filePath}: sticky-theory-ledger-missing-rederive-ref — the most ` +
      `recent rederive on owner=${owner} boundary=${boundary} produced ` +
      `ledger entry ${recentRederiveSlug}; this package must carry it ` +
      'forward in theoryLedgerRefs.',
    );
  }
  return errors;
}

function packageOutcome(meta) {
  return normalizeLedgerText(
    meta?.[THEORY_LOOP_FIELD]?.[THEORY_LOOP_OUTCOME_FIELD],
  ).toLowerCase();
}

function isLoopExhausted(packageDir, owner, boundary) {
  const pairBoundaries = getAlternatingPairBoundariesForGate(
    packageDir, owner, boundary,
  );
  const relevant = new Set([
    `${owner}::${boundary}`,
    ...pairBoundaries.map((p) => `${p.owner}::${p.boundary}`),
  ]);
  const parsed = listPackagesInDir(packageDir)
    .filter((pkg) => pkg.status === 'done')
    .filter((pkg) => relevant.has(`${pkg.owner}::${pkg.boundary}`))
    .sort((a, b) => String(b.opened || '').localeCompare(String(a.opened || '')));
  const recent = parsed.slice(0, LOOP_EXHAUSTION_LOOKBACK);
  if (recent.length < LOOP_EXHAUSTION_LOOKBACK) return false;
  const outcomes = recent.map((pkg) => {
    const meta = readPackageMetadata(path.join(packageDir, pkg.fileName));
    return packageOutcome(meta);
  });
  if (outcomes.some((o) => o === 'theory-confirmed')) return false;
  return outcomes.every((o) =>
    LOOP_EXHAUSTION_NON_CONFIRMED_OUTCOMES.has(o),
  );
}

export function validateLoopExhaustionEscalation(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata.status);
  if (
    phase !== VALIDATION_PHASE_PRE_IMPL &&
    phase !== VALIDATION_PHASE_CLOSURE
  ) return errors;
  if (status !== STATUS_ACTIVE && status !== STATUS_TODO && status !== STATUS_DONE) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  // Closure-phase: enforce that theory-loop packages set outcome.
  if (phase === VALIDATION_PHASE_CLOSURE || status === STATUS_DONE) {
    if (metadataIsTheoryLoopPackageLite(metadata)) {
      const outcome = packageOutcome(metadata);
      if (!outcome) {
        errors.push(
          `${filePath}: theory-loop-outcome-missing — closure must set ` +
          `theoryLoop.${THEORY_LOOP_OUTCOME_FIELD} to one of ${THEORY_LOOP_OUTCOME_VALUES.join(', ')}.`,
        );
      } else if (!THEORY_LOOP_OUTCOME_VALUES.includes(outcome)) {
        errors.push(
          `${filePath}: theory-loop-outcome-invalid — theoryLoop.` +
          `${THEORY_LOOP_OUTCOME_FIELD}=${outcome} is not one of ` +
          `${THEORY_LOOP_OUTCOME_VALUES.join(', ')}.`,
        );
      }
    }
  }
  // Pre-impl: block runtime/scenario packages when loop is exhausted.
  if (phase !== VALIDATION_PHASE_PRE_IMPL) return errors;
  if (metadataIsArchitectureGapAnalysis(metadata, filePath)) return errors;
  if (metadataIsSystemTheoryRevision(metadata, filePath)) {
    // Rederive after loop exhaustion is exactly what R7 forbids; this
    // validator complements but doesn't duplicate R7. Skip here.
    return errors;
  }
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  if (!isLoopExhausted(packageDir, owner, boundary)) return errors;
  errors.push(
    `${filePath}: loop-exhausted-architecture-gap-required — the last ` +
    `${LOOP_EXHAUSTION_LOOKBACK} closed packages on the alternating pair ` +
    `including ${owner}/${boundary} all closed with outcome in ` +
    `{${[...LOOP_EXHAUSTION_NON_CONFIRMED_OUTCOMES].join(', ')}} and none ` +
    'achieved theory-confirmed. Only an architecture-gap-analysis package ' +
    '(lane: causal-escalation with slug containing "architecture-gap", or ' +
    'metadata.architectureGapAnalysis: true) may be opened on this pair ' +
    'until a coupled invariant is confirmed.',
  );
  const ledgerPath = options.ledgerPath
    ? path.resolve(options.ledgerPath)
    : path.resolve(process.cwd(), DEFAULT_THEORY_LEDGER_PATH);
  const ledgerSlugs = readLedgerSlugs(ledgerPath);
  const hasArchGap = [...ledgerSlugs].some((slug) =>
    /architecture-gap/iu.test(slug),
  );
  if (!hasArchGap) {
    errors.push(
      `${filePath}: loop-exhausted-missing-architecture-ledger-entry — ` +
      `${path.relative(process.cwd(), ledgerPath) || DEFAULT_THEORY_LEDGER_PATH} ` +
      'must gain a `theory-YYYYMMDD-...-architecture-gap` entry before any ' +
      'further runtime package is authorised on this pair.',
    );
  }
  return errors;
}

function metadataIsTheoryLoopPackageLite(metadata) {
  const theoryLoop = metadata?.[THEORY_LOOP_FIELD];
  return isObjectRecord(theoryLoop) && (
    normalizeLedgerText(theoryLoop[THEORY_LOOP_ENFORCEMENT_FIELD]) ===
      THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE ||
    theoryLoop[THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD] === true
  );
}

export function validateRederiveStructuralArtifact(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  if (
    phase !== VALIDATION_PHASE_PRE_IMPL &&
    phase !== VALIDATION_PHASE_CLOSURE
  ) return errors;
  if (!metadataIsSystemTheoryRevision(metadata, filePath)) return errors;
  const writeScope = []
    .concat(metadata.writeScope || [])
    .concat(metadata?.scope?.writeScope || [])
    .map(normalizeLedgerText);
  const commitScope = []
    .concat(metadata.commitScope || [])
    .concat(metadata?.scope?.commitScope || [])
    .map(normalizeLedgerText);
  const combined = new Set([...writeScope, ...commitScope]);
  // Strip the package's own file from the comparison.
  const selfFile = String(filePath || '').toLowerCase();
  const isSelf = (p) => p.toLowerCase() === selfFile ||
    p.toLowerCase().endsWith(path.basename(selfFile));
  const nonSelf = [...combined].filter((p) => p && !isSelf(p));
  // A rederive package must touch at least one structural artifact:
  //   (a) work/sprints/...md  (sprint joint-probe section update),
  //   (b) work/theory-ledger.md (new ledger entry),
  //   (c) work/RULES.md (taxonomy / doctrine extension), OR
  //   (d) a src/ source file (no exemption claimed).
  const hasSprint = nonSelf.some((p) => /^work\/sprints\/.+\.md$/u.test(p));
  const hasLedger = nonSelf.some((p) => p === 'work/theory-ledger.md');
  const hasRules = nonSelf.some((p) => p === 'work/RULES.md');
  const hasSource = nonSelf.some(isSourceWritePath);
  if (!hasSprint && !hasLedger && !hasRules && !hasSource) {
    errors.push(
      `${filePath}: rederive-no-structural-artifact — rederive package ` +
      'writeScope/commitScope must include at least one of: a sprint markdown ' +
      'file under work/sprints/ (joint-probe section delta), ' +
      'work/theory-ledger.md (new theory entry), work/RULES.md (doctrine/' +
      'taxonomy extension), or a src/ file. Documentary-only rederive ' +
      'packages are rejected.',
    );
  }
  return errors;
}

export function validateAlternatingPairActiveLimit(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata.status);
  if (phase !== VALIDATION_PHASE_PRE_IMPL) return errors;
  if (status !== STATUS_ACTIVE && status !== STATUS_TODO) return errors;
  const owner = normalizeLedgerText(metadata.owner);
  const boundary = normalizeLedgerText(metadata.boundary);
  if (!owner || !boundary) return errors;
  // Rederive and architecture-gap-analysis packages are exempt as self — they
  // are the lane explicitly permitted to run while the pair is contended.
  if (
    metadataIsSystemTheoryRevision(metadata, filePath) ||
    metadataIsArchitectureGapAnalysis(metadata, filePath)
  ) return errors;
  const packageDir = options.packageDir
    ? path.resolve(options.packageDir)
    : path.resolve(process.cwd(), COMPOSITIONAL_GATE_PACKAGE_DIR);
  const pairBoundaries = detectAlternatingPairActive(packageDir, owner, boundary);
  if (pairBoundaries.length === 0) return errors;
  const pairKeys = new Set([
    `${owner}::${boundary}`,
    ...pairBoundaries.map((p) => `${p.owner}::${p.boundary}`),
  ]);
  const selfFileName = path.basename(String(filePath || '')).toLowerCase();
  const others = listPackagesInDir(packageDir)
    .filter((pkg) => pkg.status === 'active')
    .filter((pkg) => pkg.fileName.toLowerCase() !== selfFileName)
    .filter((pkg) => pairKeys.has(`${pkg.owner}::${pkg.boundary}`))
    .filter((pkg) => {
      // Only source-touching, non-rederive, non-arch-gap competitors count.
      const m = readPackageMetadata(path.join(packageDir, pkg.fileName));
      if (!m) return false;
      if (metadataIsSystemTheoryRevision(m, pkg.fileName)) return false;
      if (metadataIsArchitectureGapAnalysis(m, pkg.fileName)) return false;
      return isSourceTouchingPackage(m);
    });
  if (others.length >= 1) {
    errors.push(
      `${filePath}: alternating-pair-active-limit-exceeded — at most one ` +
      `active package permitted per alternating pair; ${others.map((p) => p.fileName).join(', ')} ` +
      `already covers the pair {${[...pairKeys].join(' | ')}}.`,
    );
  }
  return errors;
}

// R11. packageClass write-scope fit.
// - Rederive and architecture-gap classes must NOT list src/ in writeScope
//   (error: rederive-writescope-contains-src).
// - representative-frontier-closure packages on the runtime-owner-boundary
//   lane SHOULD list at least one src/ path in writeScope
//   (warning: runtime-writescope-no-src) — honours the Real Package Rule.
// Detection prefers modelFit.packageClass; lane/slug remain legacy fallbacks
// via metadataIsSystemTheoryRevision / metadataIsArchitectureGapAnalysis.
export function validatePackageClassWriteScopeFit(
  metadata,
  filePath,
  options = {},
) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  if (phase !== VALIDATION_PHASE_PRE_IMPL) return errors;
  const status = options.status || normalizeLedgerText(metadata.status);
  if (status !== STATUS_ACTIVE && status !== STATUS_TODO) return errors;

  const writeScope = []
    .concat(metadata.writeScope || [])
    .concat(metadata?.scope?.writeScope || [])
    .map((p) => normalizeLedgerText(p))
    .filter(Boolean);
  const srcEntries = writeScope.filter((p) => isSourceWritePath(p));

  const isRederive = metadataIsSystemTheoryRevision(metadata, filePath);
  const isArchGap = metadataIsArchitectureGapAnalysis(metadata, filePath);
  if ((isRederive || isArchGap) && srcEntries.length > 0) {
    const klass = isRederive ? 'system-theory-rederive' : 'architecture-gap-analysis';
    errors.push(
      `${filePath}: rederive-writescope-contains-src — ${klass} package class ` +
      'must not list src/ paths in writeScope; move runtime targets to ' +
      `candidateRuntimeFiles. Offending entries: ${srcEntries.join(', ')}.`,
    );
    return errors;
  }

  // Warning path for representative-frontier-closure on runtime-owner-boundary.
  if (isRederive || isArchGap) return errors;
  const packageClass = normalizeLedgerText(metadata?.modelFit?.packageClass);
  const lane = normalizeLedgerText(metadata.lane);
  if (
    lane === LANE_RUNTIME_OWNER_BOUNDARY &&
    packageClass === 'representative-frontier-closure' &&
    srcEntries.length === 0
  ) {
    errors.push(
      `${filePath}: runtime-writescope-no-src — representative-frontier-closure ` +
      'on runtime-owner-boundary lane must list at least one src/ path in ' +
      'writeScope (Real Package Rule).',
    );
  }
  return errors;
}

// Package Economy: new active packages must not re-introduce steering doctrine
// that already lives in .kiro/steering/llm/core.md and work/RULES.md. These
// sections are validator-unenforced boilerplate; copying them is pure red tape
// (RULES.md §package-economy). Scoped to the active package at entry/pre-impl so
// in-flight todo packages and the 700+ legacy done packages stay valid.
const REDUNDANT_BOILERPLATE_HEADINGS = Object.freeze([
  '## LLM Tool-First Contract',
  '## Workflow Acceleration Contract',
  '## Shared Boundary Contract',
  '## Static Drift Ledger',
  '## Residual Closure Inventory',
]);

export function validatePackageEconomy(content, filePath, options = {}) {
  const errors = [];
  if (typeof content !== 'string') return errors;
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  if (
    phase !== VALIDATION_PHASE_ENTRY &&
    phase !== VALIDATION_PHASE_PRE_IMPL
  ) {
    return errors;
  }
  if (options.status !== STATUS_ACTIVE) return errors;
  const offending = REDUNDANT_BOILERPLATE_HEADINGS.filter(
    (heading) => extractMarkdownLevelTwoSection(content, heading) !== null,
  );
  if (offending.length > 0) {
    errors.push(
      `${filePath}: redundant-steering-boilerplate — remove ` +
      `${offending.map((h) => h.replace(/^##\s+/u, '')).join(', ')}; this ` +
      'doctrine already lives in .kiro/steering/llm/core.md and work/RULES.md ' +
      'and is not validator-enforced per package (RULES.md §package-economy).',
    );
  }
  return errors;
}

export function validateSprintJointCoupledInvariantProbe(
  sprintContent,
  sprintPath,
  options = {},
) {
  const errors = [];
  if (typeof sprintContent !== 'string') return errors;
  // Sprint must have been the target of a rederive (systemTheoryRederivedAt set).
  if (!/^systemTheoryRederivedAt:\s*\d{4}-\d{2}-\d{2}/mu.test(sprintContent)) {
    return errors;
  }
  const probe = extractSprintJointProbeSection(sprintContent);
  if (!probe) {
    errors.push(
      `${sprintPath}: sprint-joint-probe-section-missing — sprint has ` +
      'systemTheoryRederivedAt but no "## Joint Coupled-Invariant Probe" ' +
      'section. Add the section with Command, Last run, Last residual count, ' +
      'Residual trend, and Boundaries covered.',
    );
    return errors;
  }
  const required = [
    SPRINT_JOINT_PROBE_LABEL_COMMAND,
    SPRINT_JOINT_PROBE_LABEL_LAST_RUN,
    SPRINT_JOINT_PROBE_LABEL_RESIDUAL_COUNT,
    SPRINT_JOINT_PROBE_LABEL_RESIDUAL_TREND,
    SPRINT_JOINT_PROBE_LABEL_BOUNDARIES,
  ];
  for (const label of required) {
    if (!probe[label] || probe[label].length === 0) {
      errors.push(
        `${sprintPath}: sprint-joint-probe-section-missing — Joint ` +
        `Coupled-Invariant Probe missing label \`${label}:\`.`,
      );
    }
  }
  const trend = String(probe[SPRINT_JOINT_PROBE_LABEL_RESIDUAL_TREND] || '')
    .toLowerCase()
    .trim();
  if (trend && !SPRINT_JOINT_PROBE_TREND_VALUES.has(trend)) {
    errors.push(
      `${sprintPath}: sprint-joint-probe-section-missing — Residual trend ` +
      `must be one of ${[...SPRINT_JOINT_PROBE_TREND_VALUES].join(', ')}, got "${trend}".`,
    );
  }
  // History-based stuck check (R8 extended): if the most recent two trends
  // recorded on the active sprint were both flat or increasing, the next
  // runtime package on the pair must be blocked. Detect via optional
  // ## Joint Probe History section (lines beginning with `- YYYY-MM-DD:
  // count=N trend=...`). Block via a side-channel error key so the orchestrator
  // can surface it; absence of history is fine.
  const historyRe = /^## Joint Probe History\s*\n([\s\S]*?)(?=\n##\s|$)/mu;
  const historyMatch = sprintContent.match(historyRe);
  if (historyMatch) {
    const trends = [];
    for (const line of historyMatch[1].split('\n')) {
      const m = line.match(/trend\s*=\s*([a-z]+)/iu);
      if (m) trends.push(m[1].toLowerCase());
    }
    const recent = trends.slice(-2);
    if (
      recent.length === 2 &&
      recent.every((t) => t === 'flat' || t === 'increasing') &&
      options.activatingPackage === true
    ) {
      errors.push(
        `${sprintPath}: sprint-joint-probe-residual-stuck — last two ` +
        `joint-probe trends were [${recent.join(', ')}]; no new runtime ` +
        'package may activate on the alternating pair until trend becomes ' +
        'decreasing or an architecture-gap-analysis package is recorded.',
      );
    }
  }
  return errors;
}

function normalizeCliPath(filePath) {
  return path.normalize(
    path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath),
  );
}

function parseOptionValue(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < NUM_ZERO) {
    return null;
  }
  return args[optionIndex + NUM_ONE] || null;
}

function parseTargetStatus(args, fallbackStatus) {
  const requestedStatus =
    parseOptionValue(args, CLI_FLAG_TO) ||
    parseOptionValue(args, CLI_FLAG_STATUS) ||
    fallbackStatus;
  return VALID_PACKAGE_STATUSES.includes(requestedStatus) ?
    requestedStatus :
    null;
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readTextFile(filePath));
}

export async function readTheoryLedgerContext(
  ledgerPath = DEFAULT_THEORY_LEDGER_PATH,
) {
  try {
    const content = await readTextFile(ledgerPath);
    return validateTheoryLedgerContent(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        entries: [],
        errors: [`${ledgerPath} is missing.`],
      };
    }
    return {
      entries: [],
      errors: [error.message],
    };
  }
}

async function writeTextFile(filePath, content) {
  await fs.writeFile(filePath, content, ENCODING_UTF8);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort();
}

async function listPackageFiles() {
  return listMarkdownFiles(WORK_PACKAGES_DIR);
}

export async function collectPackageHistoryEntries() {
  const packageFiles = await listPackageFiles();
  const entries = [];
  for (const filePath of packageFiles) {
    const relativePath = normalizeRelativePath(filePath);
    let metadata = null;
    try {
      metadata = parsePackageMetadata(await readTextFile(filePath), relativePath);
    } catch {
      continue;
    }
    if (!metadata || !isScenarioDrivenMetadata(metadata)) {
      continue;
    }
    entries.push({
      filePath: relativePath,
      metadata,
      status: getPackageStatusFromPath(filePath) || DEFAULT_UNKNOWN,
    });
  }
  return entries;
}

async function listSprintFiles() {
  const sprintFiles = await listMarkdownFiles(WORK_SPRINTS_DIR);
  return sprintFiles.filter((filePath) => !isGeneratedCurrentBlockerPath(filePath));
}

async function listTrackFiles() {
  if (!(await pathExists(WORK_TRACKS_DIR))) {
    return [];
  }
  return listMarkdownFiles(WORK_TRACKS_DIR);
}

export function isGeneratedCurrentBlockerPath(filePath) {
  const normalizedPath = normalizeRelativePath(filePath);
  return normalizedPath === CURRENT_BLOCKER_MARKDOWN_PATH ||
    normalizedPath === CURRENT_BLOCKER_JSON_PATH;
}

let ajvValidator = null;

function getAjvValidator() {
  if (ajvValidator) {
    return ajvValidator;
  }
  const ajv = new Ajv({ allErrors: true });
  const schemaPath = path.join(process.cwd(), '.kiro', 'steering', 'schemas', 'work-package.schema.json');
  try {
    if (fsSync.existsSync(schemaPath)) {
      const schemaContent = fsSync.readFileSync(schemaPath, 'utf8');
      const schema = JSON.parse(schemaContent);
      ajvValidator = ajv.compile(schema);
    }
  } catch (err) {
    console.error(`Failed to load or compile work-package JSON Schema: ${err.message}`);
  }
  return ajvValidator;
}

export function parsePackageMetadata(content, filePath) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    return null;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    throw new Error(
      `${filePath}: work-package metadata comment is missing a closing marker.`,
    );
  }
  const jsonText = content.slice(jsonStart, closeIndex).trim();
  try {
    const rawMetadata = JSON.parse(jsonText);
    if (rawMetadata.schema === 'work-package-v2') {
      const validate = getAjvValidator();
      if (validate) {
        const valid = validate(rawMetadata);
        if (!valid) {
          const schemaErrors = validate.errors.map((err) => {
            const errorPath = err.instancePath || 'root';
            return `${errorPath}: ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`;
          }).join(', ');
          throw new Error(
            `work-package metadata failed JSON Schema validation: ${schemaErrors}`,
          );
        }
      }
    }
    return normalizeMetadata(rawMetadata, filePath);
  } catch (error) {
    throw new Error(
      `${filePath}: work-package metadata is not valid JSON: ${error.message}`,
    );
  }
}

export function replacePackageMetadata(content, metadata) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    return content;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    return content;
  }

  let metadataToSave = metadata;
  if (metadata && metadata.schema === 'work-package-v2') {
    metadataToSave = {
      schema: 'work-package-v2',
      status: metadata.status,
      intent: { ...(metadata.intent || {}) },
      scope: { ...(metadata.scope || {}) },
      gates: { ...(metadata.gates || {}) },
      modelFit: { ...(metadata.modelFit || {}) },
      execution: { ...(metadata.execution || {}) }
    };

    const v2Keys = {
      intent: ['opened', 'closed', 'lane', 'scenario', 'artifact', 'playback', 'owner', 'boundary', 'currentState', 'nextAction', 'dominantReason', 'discoveryRef', 'epicRef', 'predecessor', 'successor'],
      scope: ['writeScope', 'handoffFiles', 'generatedFiles', 'candidateRuntimeFiles', 'commitScope'],
      gates: ['whyHighestLeverageNow', 'stabilityCredit', 'representativeRerunCadence', 'codeQualityAdmission', 'companionGatesFile'],
      modelFit: ['packageClass', 'intendedMinimumModel', 'scopeShape', 'outputProfile', 'escalationTriggers', 'ambiguityScore'],
      execution: ['evidence', 'theoryLedgerRefs']
    };
    const nestedV2FieldKeys = new Set([
      'schema',
      'status',
      'intent',
      'scope',
      'gates',
      'modelFit',
      'execution',
      'proof',
      ...Object.values(v2Keys).flat(),
    ]);

    for (const [section, keys] of Object.entries(v2Keys)) {
      for (const k of keys) {
        if (metadata[k] !== undefined) {
          if (
            section === 'gates' &&
            k === 'codeQualityAdmission' &&
            isObjectRecord(metadata[k]) &&
            typeof metadataToSave.gates?.[k] === 'string'
          ) {
            continue;
          }
          metadataToSave[section][k] = metadata[k];
        }
      }
    }

    if (isObjectRecord(metadata.codeQualityAdmission)) {
      metadataToSave.codeQualityAdmission = metadata.codeQualityAdmission;
    }

    if (metadata.proof !== undefined) {
      if (!metadataToSave.execution.proof) {
        metadataToSave.execution.proof = {};
      }
      metadataToSave.execution.proof.commands = metadata.proof;
    }

    for (const [key, value] of Object.entries(metadata)) {
      if (!nestedV2FieldKeys.has(key)) {
        metadataToSave[key] = value;
      }
    }
  }

  const nextJson = JSON.stringify(metadataToSave, null, NUM_TWO);
  return [
    content.slice(NUM_ZERO, jsonStart),
    NEWLINE,
    nextJson,
    NEWLINE,
    content.slice(closeIndex),
  ].join('');
}

function isConcreteMetadataText(value, options = {}) {
  const normalizedValue = normalizeLedgerText(value);
  if (
    normalizedValue.length === NUM_ZERO ||
    LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER)
  ) {
    return false;
  }
  return options.allowEmptyKeyword === true ||
    !MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue);
}

function validateConcreteMetadataField(filePath, metadata, fieldName, options = {}) {
  if (isConcreteMetadataText(metadata?.[fieldName], options)) {
    return [];
  }
  return [
    `${filePath}: metadata ${fieldName} must be concrete for active ` +
    'current-blocker handoff generation.',
  ];
}

function validateRequiredMetadataArray(filePath, metadata, fieldName, options = {}) {
  const value = metadata?.[fieldName];
  if (!Array.isArray(value)) {
    return [
      `${filePath}: metadata ${fieldName} must be an array for active ` +
      'current-blocker handoff generation.',
    ];
  }
  if (options.allowEmpty === false && value.length === NUM_ZERO) {
    return [
      `${filePath}: metadata ${fieldName} must not be empty for active ` +
      'current-blocker handoff generation.',
    ];
  }
  return [];
}

function validateBoundedExperimentField(filePath, experiment, fieldName) {
  const value = experiment?.[fieldName];
  if (isConcreteMetadataText(value, {
    allowEmptyKeyword: fieldName === BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD,
  })) {
    return [];
  }
  return [
    `${filePath}: metadata ${BOUNDED_EXPERIMENT_FIELD}.${fieldName} ` +
    `must be concrete for ${LANE_BOUNDED_EXPERIMENT} packages.`,
  ];
}

function validateInheritsContext(filePath, metadata) {
  const inheritsContext = metadata?.[INHERITS_CONTEXT_FIELD];
  if (inheritsContext === undefined) {
    return [];
  }
  if (!isObjectRecord(inheritsContext)) {
    return [
      `${filePath}: metadata ${INHERITS_CONTEXT_FIELD} must be an object.`,
    ];
  }
  const errors = [];
  for (const fieldName of INHERITS_CONTEXT_FIELDS) {
    if (inheritsContext[fieldName] !== true) {
      errors.push(
        `${filePath}: metadata ${INHERITS_CONTEXT_FIELD}.${fieldName} ` +
        'must be true when context inheritance is recorded.',
      );
    }
  }
  return errors;
}

function validateBoundedExperimentMetadataShape(filePath, metadata) {
  if (!metadataIsExperimentLane(metadata)) {
    return [];
  }
  const experiment = metadata?.[BOUNDED_EXPERIMENT_FIELD];
  if (!isObjectRecord(experiment)) {
    return [
      `${filePath}: metadata ${BOUNDED_EXPERIMENT_FIELD} is required for ` +
      `${metadataLane(metadata)} packages.`,
    ];
  }
  const errors = [];
  for (const fieldName of BOUNDED_EXPERIMENT_CONCRETE_FIELDS) {
    errors.push(...validateBoundedExperimentField(
      filePath,
      experiment,
      fieldName,
    ));
  }
  if (experiment[BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD] !== undefined) {
    errors.push(...validateBoundedExperimentField(
      filePath,
      experiment,
      BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD,
    ));
  }
  if (metadataLane(metadata) === LANE_EXPERIMENT) {
    errors.push(...validateBoundedExperimentField(
      filePath,
      experiment,
      BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD,
    ));
  }
  const validationTier = normalizeLedgerText(metadata[VALIDATION_TIER_FIELD]);
  if (
    validationTier.length === NUM_ZERO ||
    !VALIDATION_TIERS.includes(validationTier)
  ) {
    errors.push(
      `${filePath}: metadata ${VALIDATION_TIER_FIELD} must be one of ` +
      `${VALIDATION_TIERS.join(', ')} for ${metadataLane(metadata)} ` +
      'packages.',
    );
  }
  errors.push(...validateInheritsContext(filePath, metadata));
  return errors;
}

function metadataScopeList(metadata, fieldName) {
  return Array.isArray(metadata?.[fieldName]) ?
    metadata[fieldName].map(normalizeLedgerText).filter(Boolean) :
    [];
}

function isSourceWritePath(filePath) {
  return normalizeLedgerText(filePath).startsWith('src/');
}

function isConcreteSourceFilePath(filePath) {
  const normalized = normalizeLedgerText(filePath).replace(/\\/gu, '/');
  return CONCRETE_SOURCE_FILE_PATTERN.test(normalized);
}

function isTestOnlyProofWritePath(filePath) {
  const normalizedPath = normalizeLedgerText(filePath);
  return normalizedPath.startsWith('test/') ||
    normalizedPath.startsWith('work/packages/');
}

function validateLowerModelLaneMetadataShape(filePath, metadata) {
  const lane = metadataLane(metadata);
  const writeScope = metadataScopeList(metadata, SCOPE_FIELD_WRITE_SCOPE);
  const commitScope = metadataScopeList(metadata, SCOPE_FIELD_COMMIT_SCOPE);
  const scopedPaths = [...writeScope, ...commitScope];
  const errors = [];
  if (
    lane === LANE_MECHANICAL_MAINTENANCE &&
    scopedPaths.some(isSourceWritePath)
  ) {
    errors.push(
      `${filePath}: ${LANE_MECHANICAL_MAINTENANCE} packages must not ` +
      'include src/ paths; split runtime behavior into a separate package.',
    );
  }
  if (
    lane === LANE_TEST_ONLY_PROOF &&
    scopedPaths.some((filePathValue) => !isTestOnlyProofWritePath(filePathValue))
  ) {
    errors.push(
      `${filePath}: ${LANE_TEST_ONLY_PROOF} packages must keep writeScope ` +
      'and commitScope in test/ or work/packages/ paths.',
    );
  }
  if (lane === LANE_DISCOVERY) {
    const invalidPaths = writeScope.filter((filePathValue) => {
      const normalizedPath = normalizeLedgerText(filePathValue);
      return !normalizedPath.startsWith('work/packages/') &&
        !normalizedPath.startsWith('work/sprints/') &&
        normalizedPath !== 'work/theory-ledger.md';
    });
    if (invalidPaths.length > 0) {
      errors.push(
        `${filePath}: ${LANE_DISCOVERY} packages must restrict writeScope to ` +
        'package files, sprints, and work/theory-ledger.md (no runtime, tests, or scripts).',
      );
    }
  }
  if (lane === LANE_SINGLE_FILE_RUNTIME) {
    const runtimeFiles = writeScope.filter(isSourceWritePath);
    if (runtimeFiles.length !== NUM_ONE) {
      errors.push(
        `${filePath}: ${LANE_SINGLE_FILE_RUNTIME} packages require exactly ` +
        'one src/ runtime file in writeScope.',
      );
    }
    const intendedModel = normalizeLedgerText(
      metadata?.[METADATA_FIELD_MODEL_FIT]?.[
        MODEL_FIT_METADATA_INTENDED_MINIMUM_MODEL_FIELD
      ],
    );
    if (intendedModel !== MODEL_FIT_54_MODEL) {
      errors.push(
        `${filePath}: ${LANE_SINGLE_FILE_RUNTIME} packages must use ` +
        `${MODEL_FIT_54_MODEL} as modelFit.intendedMinimumModel.`,
      );
    }
  }
  return errors;
}

function validateActivePackageMetadataShape(filePath, metadata) {
  const errors = [];
  for (const fieldName of ACTIVE_PACKAGE_REQUIRED_TEXT_METADATA_FIELDS) {
    errors.push(...validateConcreteMetadataField(filePath, metadata, fieldName));
  }
  return errors;
}

function validateActiveScenarioModelFitMetadata(filePath, metadata) {
  const modelFit = metadata?.[METADATA_FIELD_MODEL_FIT];
  if (!isObjectRecord(modelFit)) {
    return [
      `${filePath}: metadata modelFit must be an object for active ` +
      'scenario current-blocker handoff generation.',
    ];
  }
  const errors = [];
  for (const fieldName of ACTIVE_SCENARIO_REQUIRED_MODEL_FIT_METADATA_FIELDS) {
    errors.push(...validateConcreteMetadataField(filePath, modelFit, fieldName));
  }
  const outputProfile = normalizeLedgerText(
    modelFit[MODEL_FIT_METADATA_OUTPUT_PROFILE_FIELD],
  );
  if (
    outputProfile.length > NUM_ZERO &&
    !VALID_OUTPUT_PROFILES.includes(outputProfile)
  ) {
    errors.push(
      `${filePath}: metadata modelFit.outputProfile must be one of ` +
      `${VALID_OUTPUT_PROFILES.join(', ')}.`,
    );
  }
  errors.push(...validateRequiredMetadataArray(
    filePath,
    modelFit,
    MODEL_FIT_METADATA_ESCALATION_TRIGGERS_FIELD,
    {allowEmpty: false},
  ));
  return errors;
}

function validateActiveScenarioMetadataShape(filePath, metadata) {
  if (!isScenarioDrivenMetadata(metadata)) {
    return [];
  }
  const errors = [];
  for (const fieldName of ACTIVE_SCENARIO_REQUIRED_TEXT_METADATA_FIELDS) {
    errors.push(...validateConcreteMetadataField(filePath, metadata, fieldName, {
      allowEmptyKeyword: fieldName === METADATA_FIELD_PLAYBACK,
    }));
  }
  for (const fieldName of ACTIVE_SCENARIO_REQUIRED_ARRAY_METADATA_FIELDS) {
    errors.push(...validateRequiredMetadataArray(filePath, metadata, fieldName, {
      allowEmpty: fieldName !== METADATA_FIELD_PROOF,
    }));
  }
  errors.push(...validateActiveScenarioModelFitMetadata(filePath, metadata));
  return errors;
}

function packageScaffoldPolicyApplies(fileStatus, metadata, phase) {
  const opened = normalizeLedgerText(metadata?.opened);
  return phase === VALIDATION_PHASE_PRE_IMPL &&
    [STATUS_ACTIVE, STATUS_TODO].includes(fileStatus) &&
    opened.length > NUM_ZERO &&
    opened >= PACKAGE_SCAFFOLD_POLICY_OPENED_ON_OR_AFTER;
}

export function validatePackageScaffoldReadiness(
  content,
  filePath,
  metadata,
  options = {},
) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata?.status);
  if (!packageScaffoldPolicyApplies(status, metadata, phase)) {
    return [];
  }
  const errors = [];
  const artifact = normalizeLedgerText(metadata?.artifact);
  if (artifact === PLACEHOLDER_ARTIFACT_PATH) {
    errors.push(
      `${filePath}: pre-implementation package must not use placeholder ` +
        `artifact ${PLACEHOLDER_ARTIFACT_PATH}; cite a concrete report or ` +
        'record artifact none.',
    );
  }
  if (content.includes(PLACEHOLDER_ARTIFACT_PATH)) {
    errors.push(
      `${filePath}: pre-implementation package body must not cite ` +
        `placeholder artifact ${PLACEHOLDER_ARTIFACT_PATH}.`,
    );
  }
  const matchedLabels = new Set();
  for (const {label, pattern} of PACKAGE_SCAFFOLD_PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) {
      matchedLabels.add(label);
    }
  }
  for (const label of matchedLabels) {
    errors.push(
      `${filePath}: pre-implementation package contains scaffold ` +
        `placeholder content (${label}); replace it with concrete owner, ` +
        'artifact, scope, proof, or outcome text before activation.',
    );
  }
  return errors;
}

function validateProofRoles(filePath, metadata = {}) {
  if (isEpicPackage(filePath)) {
    return [];
  }
  const isNewPackage = metadata.opened && metadata.opened >= '2026-05-22';
  if (!isNewPackage) {
    return [];
  }

  const errors = [];
  const rawProof = metadata[METADATA_FIELD_PROOF] || [];
  if (!Array.isArray(rawProof) || rawProof.length === 0) {
    errors.push(`${filePath}: proof ladder is required and must not be empty.`);
    return errors;
  }

  const parsedCommands = rawProof.map(parseProofCommand).filter(Boolean);
  const roles = parsedCommands.map((c) => c.role);

  const hasFalsifier = roles.includes('falsifier');
  const hasRegression = roles.includes('regression');

  const lane = normalizeLedgerText(metadata.lane);
  const isReadDocOrMaintenance = [
    LANE_READ_REVIEW_DOC_ONLY,
    LANE_MECHANICAL_MAINTENANCE,
    LANE_LIGHTWEIGHT_MAINTENANCE,
    LANE_DISCOVERY,
    'discovery',
    'read-doc',
    'maintenance'
  ].includes(lane);

  if (isReadDocOrMaintenance) {
    if (!hasRegression) {
      errors.push(
        `${filePath}: proof ladder in maintenance/read-doc/discovery lane must contain at least a 'regression' command.`
      );
    }
  } else {
    if (!hasFalsifier) {
      errors.push(
        `${filePath}: proof ladder is missing a required 'falsifier' command.`
      );
    }
    if (!hasRegression) {
      errors.push(
        `${filePath}: proof ladder is missing a required 'regression' command.`
      );
    }
  }

  return errors;
}

function validateClosureSummaryMetadata(filePath, metadata = {}, options = {}) {
  const errors = [];
  const summary = metadata[CLOSURE_SUMMARY_FIELD];
  const shouldRequireOnClosure = options.requires === true;
  const isClosurePhase = options.phase === VALIDATION_PHASE_CLOSURE;

  if (summary === undefined) {
    return shouldRequireOnClosure ?
      [`${filePath}: metadata ${CLOSURE_SUMMARY_FIELD} is required for package closure after ${CLOSURE_SUMMARY_ADOPTION_DATE}.`] :
      errors;
  }
  if (!isObjectRecord(summary)) {
    return [`${filePath}: metadata ${CLOSURE_SUMMARY_FIELD} must be an object.`];
  }
  for (const fieldName of CLOSURE_SUMMARY_FIELDS) {
    const value = normalizeLedgerText(summary[fieldName]);
    if (value.length === NUM_ZERO) {
      errors.push(
        `${filePath}: metadata ${CLOSURE_SUMMARY_FIELD}.${fieldName} must be a non-empty string.`,
      );
    } else if (isClosurePhase && (
      MODEL_FIT_EMPTY_VALUE_PATTERN.test(value) ||
      LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(value) ||
      value.includes(LEDGER_PENDING_BEFORE_IMPLEMENTATION_MARKER) ||
      CLOSURE_SUMMARY_PENDING_VALUE_PATTERN.test(value)
    )) {
      errors.push(
        `${filePath}: metadata ${CLOSURE_SUMMARY_FIELD}.${fieldName} must be concrete at closure.`,
      );
    }
  }
  const resultClassification = normalizeLedgerText(
    summary[CLOSURE_SUMMARY_RESULT_FIELD],
  ).toLowerCase();
  if (
    resultClassification.length > NUM_ZERO &&
    !SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS.includes(
      resultClassification,
    )
  ) {
    errors.push(
      `${filePath}: metadata ${CLOSURE_SUMMARY_FIELD}.` +
        `${CLOSURE_SUMMARY_RESULT_FIELD} must be one of ` +
        `${SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS.join(', ')}.`,
    );
  }
  if (
    isClosurePhase &&
    resultClassification === 'pending-before-probe'
  ) {
    errors.push(
      `${filePath}: metadata ${CLOSURE_SUMMARY_FIELD}.` +
        `${CLOSURE_SUMMARY_RESULT_FIELD} cannot remain pending-before-probe at closure.`,
    );
  }
  const predictionAccuracy = normalizeLedgerText(
    summary[CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD],
  ).toLowerCase();
  if (
    predictionAccuracy.length > NUM_ZERO &&
    !OBSERVABLE_PREDICTION_ACCURACIES.includes(predictionAccuracy)
  ) {
    errors.push(
      `${filePath}: metadata ${CLOSURE_SUMMARY_FIELD}.` +
        `${CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD} must be one of ` +
        `${OBSERVABLE_PREDICTION_ACCURACIES.join(', ')}.`,
    );
  }
  if (
    isClosurePhase &&
    predictionAccuracy === OBSERVABLE_PREDICTION_ACCURACY_PENDING
  ) {
    errors.push(
      `${filePath}: metadata ${CLOSURE_SUMMARY_FIELD}.` +
        `${CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD} cannot remain ` +
        `${OBSERVABLE_PREDICTION_ACCURACY_PENDING} at closure.`,
    );
  }
  return errors;
}

export function validatePackageMetadataShape(filePath, fileStatus, metadata) {
  const errors = [];
  if (!metadata) {
    return errors;
  }
  errors.push(...validateProofRoles(filePath, metadata));
  if (metadata.schema !== 'work-package-v1' && metadata.schema !== 'work-package-v2') {
    errors.push(
      `${filePath}: metadata schema must be work-package-v1 or work-package-v2.`,
    );
  }
  if (
    (fileStatus === STATUS_ACTIVE || fileStatus === STATUS_TODO) &&
    metadata.schema !== WORK_PACKAGE_METADATA_SCHEMA
  ) {
    errors.push(
      `${filePath}: ${fileStatus} packages must use ${WORK_PACKAGE_METADATA_SCHEMA}; ` +
        'work-package-v1 is accepted only for historical closed packages.',
    );
  }
  if (metadata.status !== fileStatus) {
    errors.push(
      `${filePath}: metadata status ${metadata.status} does not match ` +
      `filename status ${fileStatus}.`,
    );
  }
  if (!metadata.scenario) {
    errors.push(`${filePath}: metadata scenario is required.`);
  }
  if (!metadata.owner) {
    errors.push(`${filePath}: metadata owner is required.`);
  }
  if (!metadata.boundary) {
    errors.push(`${filePath}: metadata boundary is required.`);
  }
  if (!metadata.nextAction) {
    errors.push(`${filePath}: metadata nextAction is required.`);
  }
  for (const scopeField of [
    SCOPE_FIELD_WRITE_SCOPE,
    SCOPE_FIELD_HANDOFF_FILES,
    SCOPE_FIELD_GENERATED_FILES,
    SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
    SCOPE_FIELD_COMMIT_SCOPE,
    THEORY_LEDGER_REFS_FIELD,
  ]) {
    if (metadata[scopeField] !== undefined && !Array.isArray(metadata[scopeField])) {
      errors.push(`${filePath}: metadata ${scopeField} must be an array.`);
    }
  }
  if (Array.isArray(metadata[THEORY_LEDGER_REFS_FIELD])) {
    for (const theoryRef of metadata[THEORY_LEDGER_REFS_FIELD]) {
      const normalizedRef = normalizeLedgerText(theoryRef);
      if (!THEORY_LEDGER_REF_PATTERN.test(normalizedRef)) {
        errors.push(
          `${filePath}: metadata ${THEORY_LEDGER_REFS_FIELD} entries must ` +
            `look like theory-YYYYMMDD-short-slug.`,
        );
      }
    }
  }
  const isScenarioOrRuntimeLane = [
    LANE_RUNTIME_OWNER_BOUNDARY,
    LANE_SCENARIO_RELEASE_GATE,
    LANE_CAUSAL_ESCALATION,
  ].includes(metadata.lane);

  const isNewPackage = metadata.opened && metadata.opened >= '2026-05-22';

  if (isNewPackage) {
    if (metadata.stabilityCredit === undefined) {
      errors.push(`${filePath}: metadata stabilityCredit is required.`);
    }
    if (metadata.lane !== LANE_READ_REVIEW_DOC_ONLY) {
      if (metadata.whyHighestLeverageNow === undefined) {
        errors.push(`${filePath}: metadata whyHighestLeverageNow is required.`);
      }
    }
  }

  if (metadata.whyHighestLeverageNow !== undefined) {
    const whyLeverage = String(metadata.whyHighestLeverageNow).trim();
    if (whyLeverage.length === 0) {
      errors.push(`${filePath}: metadata whyHighestLeverageNow must not be empty.`);
    } else {
      const LEVERAGE_FIELD_REQUIRED_TERMS_PATTERN =
        /\b(?:sprint|goal|universal\s+owner|owner\s+contract|representative|gate|stability|frontier)\b/iu;
      if (
        !LEVERAGE_FIELD_REQUIRED_TERMS_PATTERN.test(whyLeverage) &&
        !whyLeverage.includes('<placeholder>') &&
        !whyLeverage.startsWith('<')
      ) {
        errors.push(
          `${filePath}: metadata whyHighestLeverageNow must name the active sprint goal, ` +
            `representative gate, or current first frontier it advances.`,
        );
      }
      if (
        fileStatus === STATUS_ACTIVE &&
        (whyLeverage.includes('<placeholder>') || whyLeverage.startsWith('<'))
      ) {
        errors.push(
          `${filePath}: metadata whyHighestLeverageNow must be a concrete value.`,
        );
      }
    }
  }

  if (metadata.stabilityCredit !== undefined) {
    if (!STABILITY_CREDIT_VALID_VALUES.includes(metadata.stabilityCredit)) {
      errors.push(
        `${filePath}: metadata stabilityCredit must be one of: ` +
          `${STABILITY_CREDIT_VALID_VALUES.join(', ')}.`,
      );
    } else if (isScenarioOrRuntimeLane) {
      const representativeCredits = [
        'representative-green',
        'representative-migrated',
        'representative-reduced',
      ];
      if (
        !representativeCredits.includes(metadata.stabilityCredit) &&
        metadata.stabilityCredit !== 'local-proof-only'
      ) {
        errors.push(
          `${filePath}: runtime/scenario packages cannot hide behind local proof; ` +
            `metadata stabilityCredit must be one of: ${representativeCredits.join(', ')}, or local-proof-only with a valid cadence record.`,
        );
      }
    }
  }

  const isMaintenanceOrCleanup =
    metadata.lane === LANE_MECHANICAL_MAINTENANCE ||
    metadata.lane === LANE_TEST_ONLY_PROOF ||
    /cleanup|quality|refactor|maintenance/iu.test(metadata.boundary || '');

  if (isNewPackage && fileStatus === STATUS_ACTIVE && isMaintenanceOrCleanup) {
    if (metadata.codeQualityAdmission === undefined) {
      errors.push(
        `${filePath}: maintenance or cleanup package in active sprint must record codeQualityAdmission; ` +
        `generic cleanup packages must state their stability-relevant effect before activation.`,
      );
    }
  }

  if (metadata.codeQualityAdmission !== undefined) {
    const admission = metadata.codeQualityAdmission;
    if (!isObjectRecord(admission)) {
      errors.push(`${filePath}: metadata codeQualityAdmission must be an object.`);
    } else {
      const reason = normalizeLedgerText(admission.reason);
      if (!CODE_QUALITY_ADMISSION_REASONS.includes(reason)) {
        errors.push(
          `${filePath}: metadata codeQualityAdmission.reason must be one of: ` +
          `${CODE_QUALITY_ADMISSION_REASONS.join(', ')}.`,
        );
      }
      const evidence = String(admission.evidence || '').trim();
      if (evidence.length === 0) {
        errors.push(`${filePath}: metadata codeQualityAdmission.evidence must be a non-empty string.`);
      }
    }
  }

  const isFocusedRuntimeOrScenarioLane = [
    LANE_RUNTIME_OWNER_BOUNDARY,
    LANE_SCENARIO_RELEASE_GATE,
  ].includes(metadata.lane);

  if (isFocusedRuntimeOrScenarioLane && metadata.stabilityCredit === 'local-proof-only') {
    if (metadata.representativeRerunCadence === undefined) {
      errors.push(
        `${filePath}: focused runtime/scenario package with passing owner proof (local-proof-only) ` +
          `must record representativeRerunCadence; runtime/scenario packages cannot hide behind local proof without a valid cadence record.`,
      );
    }
  }

  if (metadata.representativeRerunCadence !== undefined) {
    if (!REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES.includes(metadata.representativeRerunCadence)) {
      errors.push(
        `${filePath}: metadata representativeRerunCadence must be one of: ` +
          `${REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES.join(', ')}.`,
      );
    }
  }

  errors.push(...validateClosureSummaryMetadata(filePath, metadata));

  if (fileStatus === STATUS_ACTIVE) {
    errors.push(...validateActivePackageMetadataShape(filePath, metadata));
    errors.push(...validateActiveScenarioMetadataShape(filePath, metadata));
  }
  errors.push(...validateBoundedExperimentMetadataShape(filePath, metadata));
  errors.push(...validateLowerModelLaneMetadataShape(filePath, metadata));
  return errors;
}

function resolveValidationPhase(args = []) {
  const requestedPhases = [
    args.includes(CLI_FLAG_ENTRY) ? VALIDATION_PHASE_ENTRY : null,
    args.includes(CLI_FLAG_PROBE) ? VALIDATION_PHASE_PROBE : null,
    args.includes(CLI_FLAG_PRE_IMPL) ? VALIDATION_PHASE_PRE_IMPL : null,
    args.includes(CLI_FLAG_CLOSURE) ? VALIDATION_PHASE_CLOSURE : null,
  ].filter(Boolean);
  if (requestedPhases.length > NUM_ONE) {
    throw new Error(
      `Use only one validation phase: ${VALIDATION_PHASES.join(', ')}.`,
    );
  }
  return requestedPhases[NUM_ZERO] || VALIDATION_PHASE_PRE_IMPL;
}

function buildSubagentValidationOptions(fileStatus, metadata, phase, options = {}) {
  const requiresFreshnessReview =
    phase !== VALIDATION_PHASE_ENTRY &&
    fileStatus === STATUS_ACTIVE &&
    metadataRequiresFreshnessReview(metadata);
  const requiresVerificationFix =
    phase === VALIDATION_PHASE_CLOSURE &&
    fileStatus !== STATUS_SUPERSEDED &&
    metadataRequiresVerificationFix(metadata);
  const forceClosedPackageLedger =
    options.enforceClosureSubagentLedger === true &&
    fileStatus === STATUS_DONE &&
    metadataRequiresSubagentSequencing(metadata);
  const requiresSubagentLedger =
    metadata !== null &&
    (
      metadataRequiresSubagentSequencing(metadata) ||
      requiresFreshnessReview ||
      requiresVerificationFix
    ) &&
    (
      (fileStatus === STATUS_ACTIVE && phase === VALIDATION_PHASE_CLOSURE) ||
      isCurrentPolicyClosedSubagentMetadata(fileStatus, metadata) ||
      forceClosedPackageLedger ||
      requiresFreshnessReview ||
      requiresVerificationFix
    ) &&
    phase !== VALIDATION_PHASE_ENTRY;
  return {
    skipSubagentLedger:
      phase === VALIDATION_PHASE_ENTRY || fileStatus === STATUS_SUPERSEDED,
    requiresSubagentLedger,
    requiresFreshnessReview,
    requiresVerificationFix,
    allowOpenImplementation:
      phase === VALIDATION_PHASE_PRE_IMPL && fileStatus === STATUS_ACTIVE,
    allowUnavailableSubagents:
      phase !== VALIDATION_PHASE_CLOSURE && fileStatus === STATUS_ACTIVE,
  };
}

function metadataRequiredPreImplProbe(metadata = {}) {
  const explicitRequirement = metadata[REQUIRED_PRE_IMPL_PROBE_FIELD];
  if (isObjectRecord(explicitRequirement)) {
    return explicitRequirement;
  }
  if (typeof explicitRequirement === 'string') {
    return {
      [REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD]: explicitRequirement,
    };
  }
  const closure = metadata[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD];
  if (!isObjectRecord(closure)) {
    return null;
  }
  const artifact = normalizeLedgerText(
    closure[SCENARIO_CAUSAL_CLOSURE_BOUNDED_PROOF_ARTIFACT_FIELD],
  );
  const command = normalizeLedgerText(
    closure[SCENARIO_CAUSAL_CLOSURE_MISSING_EDGE_PROBE_FIELD],
  );
  if (
    artifact.length === NUM_ZERO ||
    MODEL_FIT_EMPTY_VALUE_PATTERN.test(artifact)
  ) {
    return null;
  }
  return {
    [REQUIRED_PRE_IMPL_PROBE_ARTIFACT_FIELD]: artifact,
    [REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD]: command,
    [REQUIRED_PRE_IMPL_PROBE_REASON_FIELD]:
      'scenario bounded progress proof artifact',
  };
}

function requiredPreImplProbeValueIsConcrete(value) {
  const normalizedValue = normalizeLedgerText(value);
  return normalizedValue.length > NUM_ZERO &&
    !MODEL_FIT_EMPTY_VALUE_PATTERN.test(normalizedValue) &&
    !LEDGER_TEMPLATE_PLACEHOLDER_PATTERN.test(normalizedValue);
}

export function validateRequiredPreImplProbeContract(metadata, filePath) {
  const requirement = metadataRequiredPreImplProbe(metadata);
  if (!requirement || !hasRuntimeSourceWriteScope(metadata)) {
    return [];
  }
  const command = normalizeLedgerText(
    requirement[REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD],
  );
  const artifact = normalizeLedgerText(
    requirement[REQUIRED_PRE_IMPL_PROBE_ARTIFACT_FIELD],
  );
  const errors = [];
  if (
    !requiredPreImplProbeValueIsConcrete(command) &&
    !requiredPreImplProbeValueIsConcrete(artifact)
  ) {
    errors.push(
      `${filePath}: ${REQUIRED_PRE_IMPL_PROBE_FIELD} must name a focused ` +
      'pre-implementation command or artifact for runtime source edits.',
    );
    return errors;
  }
  const proofText = metadataProofCommands(metadata).join(NEWLINE);
  if (
    requiredPreImplProbeValueIsConcrete(artifact) &&
    !proofText.includes(artifact)
  ) {
    errors.push(
      `${filePath}: runtime source pre-implementation proof must cite ` +
      `required fixture/probe artifact ${artifact}.`,
    );
  }
  if (
    requiredPreImplProbeValueIsConcrete(command) &&
    !proofText.includes(command)
  ) {
    errors.push(
      `${filePath}: runtime source pre-implementation proof must cite ` +
      `required fixture/probe command ${command}.`,
    );
  }
  return errors;
}

function validateExecutableContracts(metadata, filePath, options = {}) {
  const errors = [];
  if (!metadata || options.phase === VALIDATION_PHASE_ENTRY || options.status !== STATUS_ACTIVE) {
    return errors;
  }
  if (options.phase === VALIDATION_PHASE_PRE_IMPL) {
    errors.push(...validateRequiredPreImplProbeContract(metadata, filePath));
  }
  const writeScope = metadata[SCOPE_FIELD_WRITE_SCOPE];
  if (!Array.isArray(writeScope)) {
    return errors;
  }
  for (const file of writeScope) {
    if (typeof file !== 'string' || !file.endsWith('.js') || !file.startsWith('src/')) {
      continue;
    }
    try {
      if (fsSync.existsSync(file)) {
        const jsContent = fsSync.readFileSync(file, 'utf8');
        const nullOrUndefinedMatch = jsContent.match(/\b(state|status)\s*=\s*(null|undefined)\b/iu);
        if (nullOrUndefinedMatch) {
          errors.push(
            `${filePath}: runtime file "${file}" violates the work/RULES.md#coding-constraints rule ` +
            `by assigning "${nullOrUndefinedMatch[0]}". null and undefined must not encode domain/runtime state.`
          );
        }
        const ifStatementMatches = jsContent.match(/if\s*\(\s*(state|status)\s*===[\s\S]*?\}\s*if\s*\(\s*(state|status)\s*===/g);
        if (ifStatementMatches) {
          errors.push(
            `${filePath}: runtime file "${file}" contains consecutive independent if statements on state/status ` +
            `("if (state === ... } if (state === ..."). This violates the work/RULES.md#coding-constraints rule requiring a single structured state adjudicator/decision table.`
          );
        }
      }
    } catch (error) {
      // Ignore if file doesn't exist yet
    }
  }
  return errors;
}

export function validateContractProofRequirement(metadata, filePath, options = {}) {
  const errors = [];
  if (!metadata || options.phase === VALIDATION_PHASE_ENTRY || options.status !== STATUS_ACTIVE) {
    return errors;
  }

  const lane = metadataLane(metadata);

  if (lane === LANE_RUNTIME_OWNER_BOUNDARY || lane === LANE_SCENARIO_RELEASE_GATE) {
    const proof = Array.isArray(metadata.proof) ? metadata.proof : [];
    const contractTransitionPattern = /\b(?:contract|transition|state|outcome|ready|pending|deferred|blocked|failed|rebalancer|lifecycle|membership|placement|cutover)\b/i;
    let hasNamedTransition = false;
    for (const cmd of proof) {
      if (contractTransitionPattern.test(cmd)) {
        hasNamedTransition = true;
        break;
      }
    }
    if (!hasNamedTransition) {
      errors.push(
        `${filePath}: runtime/scenario package proof commands must name the contract transition under proof, not only a changed timeout or count.`
      );
    }
  }

  if (lane === LANE_RUNTIME_OWNER_BOUNDARY) {
    const proof = Array.isArray(metadata.proof) ? metadata.proof : [];
    const proofText = proof.join(NEWLINE);
    const hasFixture = /\bfixture\b/i.test(proofText);
    const hasConsumer = /\bconsumer\b/i.test(proofText);
    if (!hasFixture) {
      errors.push(
        `${filePath}: owner-boundary package proof commands must include a focused contract fixture.`
      );
    }
    if (!hasConsumer) {
      errors.push(
        `${filePath}: owner-boundary package proof commands must include an affected consumer proof.`
      );
    }
    if (isScenarioDrivenMetadata(metadata)) {
      if (!hasRepresentativeEvidenceProof(metadata)) {
        errors.push(
          `${filePath}: scenario-driven owner-boundary package proof commands must include representative routing evidence.`
        );
      }
    }
  }

  return errors;
}


export function validateProbePackageContract(content, filePath, metadata) {
  const errors = [];
  const markdownLineCount = content.split(NEWLINE).length;
  const modelFit = isObjectRecord(metadata?.[METADATA_FIELD_MODEL_FIT]) ?
    metadata[METADATA_FIELD_MODEL_FIT] :
    {};
  const packageClass = normalizeLedgerText(
    modelFit.packageClass,
  ).toLowerCase();
  const isCompactProbePackage =
    packageClass === COMPACT_PROBE_PACKAGE_CLASS;
  if (
    isCompactProbePackage &&
    markdownLineCount > PROBE_PACKAGE_MAX_MARKDOWN_LINES
  ) {
    errors.push(
      `${filePath}: probe package has ${markdownLineCount} markdown lines; ` +
      `keep probe packages at or below ${PROBE_PACKAGE_MAX_MARKDOWN_LINES} lines.`,
    );
  }
  if (
    isCompactProbePackage &&
    PROBE_PACKAGE_EXECUTION_EVIDENCE_HEADING_PATTERN.test(content)
  ) {
    errors.push(
      `${filePath}: probe packages must not include the closure ` +
      'Execution Evidence ladder; validate them with --probe.',
    );
  }
  if (!metadata) {
    return errors;
  }
  if (metadataLane(metadata) !== LANE_EXPERIMENT) {
    errors.push(
      `${filePath}: probe packages must use lane ${LANE_EXPERIMENT}.`,
    );
  }
  const proof = Array.isArray(metadata.proof) ? metadata.proof : [];
  if (proof.length === NUM_ZERO) {
    errors.push(
      `${filePath}: probe package metadata.proof must name at least one ` +
      'probe command or artifact.',
    );
  }
  if (metadataScopeList(metadata, SCOPE_FIELD_WRITE_SCOPE).some(isSourceWritePath)) {
    errors.push(
      `${filePath}: probe packages must not include src/ runtime files in ` +
      'writeScope; promote out of the probe lane before runtime edits.',
    );
  }
  errors.push(...validateBoundedExperimentMetadataShape(filePath, metadata));
  errors.push(...validateObservablePredictionContract(metadata, filePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: true,
    status: STATUS_ACTIVE,
    phase: VALIDATION_PHASE_PROBE,
  }));
  return errors;
}

function validateDiscoveryRef(metadata, filePath) {
  const errors = [];
  if (!metadata) {
    return errors;
  }
  const lane = metadataLane(metadata);
  const isRuntime = lane === 'runtime' || lane === 'single-file-runtime' || lane === 'runtime-owner-boundary';

  if (!isRuntime) {
    return errors;
  }

  const ambiguityScore = metadata?.modelFit?.ambiguityScore;
  if (ambiguityScore === undefined || Number(ambiguityScore) < 2) {
    return errors;
  }

  const discoveryRef = metadata?.intent?.discoveryRef || metadata?.discoveryRef;
  if (!discoveryRef) {
    errors.push(
      `${filePath}: high-ambiguity runtime package (ambiguityScore >= 2) must cite a discovery or experiment predecessor in metadata.intent.discoveryRef.`,
    );
    return errors;
  }

  let refPath = String(discoveryRef).trim();
  if (!refPath.startsWith('work/packages/')) {
    refPath = path.join('work/packages', refPath);
  }
  if (!refPath.endsWith('.md')) {
    refPath = refPath + '.md';
  }

  if (!fsSync.existsSync(refPath)) {
    errors.push(
      `${filePath}: metadata.intent.discoveryRef "${discoveryRef}" refers to non-existent file "${refPath}".`,
    );
    return errors;
  }

  try {
    const refContent = fsSync.readFileSync(refPath, 'utf8');
    const refMetadata = parsePackageMetadata(refContent, refPath);
    if (!refMetadata) {
      errors.push(
        `${filePath}: metadata.intent.discoveryRef "${discoveryRef}" could not parse metadata.`,
      );
      return errors;
    }

    const isClosed = refMetadata.status === 'done' || path.basename(refPath).startsWith('done-');
    if (!isClosed) {
      errors.push(
        `${filePath}: metadata.intent.discoveryRef "${discoveryRef}" must refer to a CLOSED (done) package.`,
      );
    }

    const refLane = String(refMetadata.lane || refMetadata.intent?.lane || '').trim().toLowerCase();
    const isDiscoveryOrExperiment = refLane === 'discovery' || refLane === 'experiment' || refLane === 'bounded-experiment' || refLane === 'fast-spike';
    if (!isDiscoveryOrExperiment) {
      errors.push(
        `${filePath}: metadata.intent.discoveryRef "${discoveryRef}" must refer to a discovery or experiment package (got lane "${refLane}").`,
      );
    }
  } catch (err) {
    errors.push(
      `${filePath}: metadata.intent.discoveryRef "${discoveryRef}" error reading/parsing file: ${err.message}`,
    );
  }

  return errors;
}

function validateWorkflowAdminSemantics(filePath, content, fileStatus, metadata, options = {}) {
  const errors = [];
  const relativePath = normalizeRelativePath(filePath);

  if (relativePath.includes('test') || relativePath.includes('temp') || relativePath.includes('mock') || relativePath.includes('admin-package')) {
    return [];
  }

  // 1. Stale active references validation
  const staleRegex = /\b(active|todo)-([a-zA-Z0-9-]+)\.md\b/g;
  let match;
  while ((match = staleRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    if (fullMatch === path.basename(filePath)) {
      continue;
    }
    const baseSlug = match[2];
    const candidateDonePath = `work/packages/done-${baseSlug}.md`;
    if (fsSync.existsSync(candidateDonePath)) {
      errors.push(`${relativePath}: contains stale active reference "${fullMatch}" (package has been closed to "${path.basename(candidateDonePath)}").`);
    }
  }

  // 2. Missing generated handoff refreshes validation
  if (options.phase === VALIDATION_PHASE_CLOSURE && fileStatus === STATUS_ACTIVE) {
    const blockerPath = 'work/sprints/current-blocker.json';
    if (fsSync.existsSync(blockerPath)) {
      try {
        const blockerContent = fsSync.readFileSync(blockerPath, 'utf8');
        const blocker = JSON.parse(blockerContent);
        if (normalizeRelativePath(blocker.package) !== relativePath) {
          errors.push(`${relativePath}: current-blocker.json is out of sync or missing generated handoff refresh (expected package "${relativePath}", got "${blocker.package}").`);
        }
      } catch (err) {
        errors.push(`${relativePath}: error reading/parsing current-blocker.json: ${err.message}`);
      }
    } else {
      errors.push(`${relativePath}: current-blocker.json is missing; generated handoff refresh is required.`);
    }
  }

  // 3. Manual ledger drift & format drift
  if (content.includes('parent revalidated focused proof') && !content.includes('parent revalidated focused proof: yes')) {
    errors.push(`${relativePath}: parent revalidated focused proof must be exactly "yes" to prevent ledger drift.`);
  }

  // 4. Roadmap execution semantics
  if (metadata && metadata.lane) {
    const allowedLanes = [
      'mechanical-maintenance',
      'lightweight-maintenance',
      'single-file-runtime',
      'runtime-owner-boundary',
      'scenario-release-gate',
      'test-only-proof',
      'bounded-experiment',
      'diagnostic-classification',
      'discovery',
      'fast-spike',
      'read-review-doc-only',
      'causal-escalation',
      'experiment'
    ];
    if (!allowedLanes.includes(metadata.lane)) {
      errors.push(`${relativePath}: lane "${metadata.lane}" violates roadmap execution semantics.`);
    }
  }

  return errors;
}

function isEpicPackage(filePath, content, options = {}) {
  if (options.kind === 'epic') {
    return true;
  }
  if (globalKindOption === 'epic') {
    return true;
  }
  const normalizedPath = String(filePath || '').toLowerCase();
  if (normalizedPath.includes('epic') && !normalizedPath.includes('epic-package-construct')) {
    return true;
  }
  if (content && content.includes('## Causal Question') && content.includes('## Shared Discriminator')) {
    return true;
  }
  return false;
}

function runPackageValidationsSync(filePath, content, fileStatus, metadata, options = {}) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const relativePath = normalizeRelativePath(filePath);
  const errors = [];

  if (!fileStatus) {
    errors.push(`${relativePath}: package filename has no valid status prefix.`);
  }
  if (
    (fileStatus === STATUS_DONE || fileStatus === STATUS_SUPERSEDED) &&
    hasOpenChecklist(content)
  ) {
    errors.push(`${relativePath}: closed package still has open checklist items.`);
  }
  if (fileStatus === STATUS_ACTIVE && !metadata) {
    errors.push(`${relativePath}: active package metadata is required.`);
  }
  if (!metadata) {
    return errors;
  }
  errors.push(
    ...validatePackageMetadataShape(relativePath, fileStatus, metadata),
  );
  errors.push(...validatePackageScaffoldReadiness(
    content,
    relativePath,
    metadata,
    {phase, status: fileStatus},
  ));

  const isEpic = isEpicPackage(filePath, content, options);
  if (isEpic) {
    const requiredSections = [
      { heading: '## Causal Question', err: 'must declare a ## Causal Question section.' },
      { heading: '## Expected Leaf Set', err: 'must declare a ## Expected Leaf Set section.' },
      { heading: '## Shared Discriminator', err: 'must declare a ## Shared Discriminator section.' },
      { heading: '## Stop Rule', err: 'must declare a ## Stop Rule section.' }
    ];
    for (const sec of requiredSections) {
      if (extractMarkdownLevelTwoSection(content, sec.heading) === null) {
        errors.push(`${relativePath}: epic package ${sec.err}`);
      }
    }

    if (fileStatus === STATUS_DONE || phase === VALIDATION_PHASE_CLOSURE) {
      const retroSection = extractMarkdownLevelTwoSection(content, '## Retrospective');
      if (retroSection === null) {
        errors.push(`${relativePath}: epic package closure requires a ## Retrospective section.`);
      } else {
        const retroContent = String(retroSection).toLowerCase();
        if (!retroContent.includes('learn')) {
          errors.push(`${relativePath}: epic package retrospective must answer 'What did we learn that we could not have predicted at lane-pick time?'.`);
        }
        if (!retroContent.includes('discriminator')) {
          errors.push(`${relativePath}: epic package retrospective must answer 'Did the discriminator hold for every leaf, or did any leaf reveal a different cut?'.`);
        }
        if (!retroContent.includes('theory-ledger') && !retroContent.includes('ledger')) {
          errors.push(`${relativePath}: epic package retrospective must answer 'Theory-ledger update yes/no (with rationale if no)'.`);
        }
      }
    }
    return errors;
  }

  if (phase !== VALIDATION_PHASE_ENTRY && fileStatus === STATUS_ACTIVE) {
    errors.push(...validateDiscoveryRef(metadata, relativePath));
    errors.push(...validateWorkflowAdminSemantics(filePath, content, fileStatus, metadata, { ...options, phase }));
  }
  errors.push(...validateTheoryLedgerReferenceContinuity(
    relativePath,
    metadata,
    options.theoryLedgerContext,
  ));
  errors.push(...validateTheoryLedgerGates(
    relativePath,
    content,
    fileStatus,
    metadata,
    options.theoryLedgerContext,
    phase,
  ));

  const subagentValidation = buildSubagentValidationOptions(
    fileStatus,
    metadata,
    phase,
    {
      enforceClosureSubagentLedger: options.enforceClosureSubagentLedger,
    },
  );
  if (!subagentValidation.skipSubagentLedger) {
    const hasExecutionEvidence =
      (extractExecutionEvidenceLedger(content) !== null) ||
      (metadata && metadata.execution && (
        metadata.execution.freshnessReview ||
        metadata.execution.implementation ||
        metadata.execution.verificationFix
      ));
    if (hasExecutionEvidence) {
      errors.push(...validateExecutionEvidenceLedger(content, relativePath, {
        [LEDGER_VALIDATION_REQUIRES_LEDGER]:
          subagentValidation.requiresSubagentLedger,
        [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
          subagentValidation.allowOpenImplementation,
        [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
          fileStatus === STATUS_TODO,
        [LEDGER_VALIDATION_REQUIRES_FRESHNESS_REVIEW]:
          subagentValidation.requiresFreshnessReview,
        [LEDGER_VALIDATION_REQUIRES_VERIFICATION_FIX]:
          subagentValidation.requiresVerificationFix,
        metadata,
      }));
    } else if (subagentValidation.requiresFreshnessReview) {
      errors.push(
        `${relativePath}: Execution Evidence is required with a checked ` +
        'freshness-review item from a new subagent before implementation.',
      );
    } else if (subagentValidation.requiresVerificationFix) {
      errors.push(
        `${relativePath}: Execution Evidence is required with checked ` +
        'implementation and verification-fix items before closure.',
      );
    } else if (subagentValidation.requiresSubagentLedger) {
      errors.push(
        `${relativePath}: Execution Evidence is required with a checked ` +
        'implementation item before closure; legacy subagent ledgers are ' +
        'advisory provenance only.',
      );
    }
  }

  errors.push(...validateCoreLogicBrief(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      phase !== VALIDATION_PHASE_ENTRY &&
      fileStatus === STATUS_ACTIVE &&
      metadataRequiresCoreLogicBrief(metadata),
    rejectGeneric:
      phase !== VALIDATION_PHASE_ENTRY &&
      metadataRequiresCausalDecisionContract(metadata, fileStatus),
  }));
  errors.push(...validateCausalDecisionContract(content, metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      phase !== VALIDATION_PHASE_ENTRY &&
      metadataRequiresCausalDecisionContract(metadata, fileStatus),
    status: fileStatus,
  }));
  errors.push(...validateDecisionExperimentGate(content, metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      phase !== VALIDATION_PHASE_ENTRY &&
      metadataRequiresDecisionExperimentGate(metadata, fileStatus),
    status: fileStatus,
  }));
  errors.push(...validateModelFitContract(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE &&
      metadata !== null &&
      metadataLane(metadata) !== LANE_FAST_SPIKE,
    metadata,
    phase,
  }));
  errors.push(...validateRepresentativeResidualContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadataRequiresRepresentativeResidual(metadata, fileStatus),
    status: fileStatus,
  }));
  errors.push(...validateCausalGovernanceContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE &&
      metadata !== null &&
      isScenarioDrivenMetadata(metadata),
    status: fileStatus,
    phase,
  }));
  errors.push(...validateScenarioCausalClosureContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE &&
      metadata !== null &&
      isScenarioDrivenMetadata(metadata),
    status: fileStatus,
    phase,
  }));
  errors.push(...validateObservablePredictionContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadataRequiresObservablePrediction(metadata, fileStatus, phase),
    status: fileStatus,
    phase,
  }));
  errors.push(...validateExperimentOutcomeContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadataRequiresExperimentOutcome(metadata, fileStatus, phase),
    status: fileStatus,
    phase,
  }));
  errors.push(...validateRerunDecisionContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadataRequiresRerunDecision(metadata, fileStatus),
    status: fileStatus,
  }));
  errors.push(...validateClassificationEfficiencyContract(
    metadata,
    relativePath,
    {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        metadataRequiresClassificationEfficiency(metadata, fileStatus),
      status: fileStatus,
    },
  ));
  errors.push(...validateSameFrontierStopContract(metadata, relativePath, {
    status: fileStatus,
    phase,
    packageHistoryEntries: options.packageHistoryEntries || [],
  }));
  errors.push(...validateScenarioFrontierOwnerBoundaryContract(
    metadata,
    relativePath,
    {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        fileStatus === STATUS_ACTIVE &&
        metadata !== null &&
        isScenarioDrivenMetadata(metadata),
      status: fileStatus,
    },
  ));
  errors.push(...validateFrontierOscillationContract(
    metadata,
    relativePath,
    {
      packageHistoryEntries: options.packageHistoryEntries || [],
      status: fileStatus,
    },
  ));
  errors.push(...validateArchitectureDecisionGateContract(
    metadata,
    relativePath,
    {
      phase,
      packageHistoryEntries: options.packageHistoryEntries || [],
      status: fileStatus,
    },
  ));
  errors.push(...validateTwoLevelTheoryContract(
    metadata,
    relativePath,
    {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        metadataRequiresTwoLevelTheory(metadata, fileStatus, phase),
      phase,
      status: fileStatus,
    },
  ));
  errors.push(...validateCompositionalAutoPromoteGate(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
  }));
  errors.push(...validateAlternatingPairMutex(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
  }));
  errors.push(...validateAlternatingPairActiveLimit(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
  }));
  errors.push(...validatePackageClassWriteScopeFit(metadata, relativePath, {
    phase,
    status: fileStatus,
  }));
  errors.push(...validatePackageEconomy(content, relativePath, {
    phase,
    status: fileStatus,
  }));
  errors.push(...validateRederiveCoupledInvariants(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
  }));
  errors.push(...validateRederiveJointFalsifier(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
  }));
  errors.push(...validateRederiveStructuralArtifact(metadata, relativePath, {
    phase,
    status: fileStatus,
  }));
  errors.push(...validateStickyTheoryLedger(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
    ledgerPath: options.ledgerPath,
  }));
  errors.push(...validateLoopExhaustionEscalation(metadata, relativePath, {
    phase,
    status: fileStatus,
    packageDir: options.packageDir,
    ledgerPath: options.ledgerPath,
  }));
  errors.push(...validateTheoryLoopPackageContract(
    content,
    metadata,
    relativePath,
    {
      phase,
      status: fileStatus,
    },
  ));
  errors.push(...validateProgressContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadataRequiresProgressContract(metadata, fileStatus, relativePath),
    status: fileStatus,
  }));
  const requiresCommitLedger =
    metadata !== null &&
    fileStatus !== STATUS_SUPERSEDED &&
    metadata[METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED] === true;
  errors.push(...validateCommitAndPushLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: requiresCommitLedger,
    [LEDGER_VALIDATION_ALLOW_PENDING_COMMIT_LEDGER]:
      fileStatus === STATUS_ACTIVE || fileStatus === STATUS_TODO,
    [LEDGER_VALIDATION_ALLOW_MISSING_HISTORICAL_COMMIT_LEDGER]:
      isHistoricalClosedCommitLedgerMetadata(fileStatus, metadata),
  }));
  errors.push(...validateClassificationOnlyImplementationScope(
    metadata,
    relativePath,
    {
      phase,
      status: fileStatus,
    },
  ));
  errors.push(...validateExecutableContracts(metadata, relativePath, { phase, status: fileStatus }));
  errors.push(...validateContractProofRequirement(metadata, relativePath, { phase, status: fileStatus }));
  errors.push(...validateMechanismCardGate(content, metadata, relativePath, { phase, status: fileStatus }));
  errors.push(...validateClosureSummaryMetadata(relativePath, metadata, {
    requires:
      phase === VALIDATION_PHASE_CLOSURE &&
      fileStatus === STATUS_ACTIVE,
    phase,
    status: fileStatus,
  }));

  return errors;
}

async function validatePackageFile(filePath, options = {}) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const content = await readTextFile(filePath);
  const relativePath = normalizeRelativePath(filePath);
  const fileStatus = getPackageStatusFromPath(filePath);
  let metadata = null;
  let parseError = null;
  try {
    metadata = parsePackageMetadata(content, relativePath);
  } catch (err) {
    parseError = err.message;
  }

  const errors = runPackageValidationsSync(filePath, content, fileStatus, metadata, {
    phase,
    theoryLedgerContext: options.theoryLedgerContext,
    enforceClosureSubagentLedger: options.enforceClosureSubagentLedger,
    packageHistoryEntries: options.packageHistoryEntries,
  });

  if (parseError) {
    errors.push(parseError);
  }

  if (fileStatus === STATUS_ACTIVE && metadata && metadata.predecessor) {
    const isCurrentFocused = [
      LANE_RUNTIME_OWNER_BOUNDARY,
      LANE_SCENARIO_RELEASE_GATE,
    ].includes(metadata.lane);

    if (isCurrentFocused) {
      const predPath = normalizeCliPath(metadata.predecessor);
      if (await pathExists(predPath)) {
        try {
          const predContent = await readTextFile(predPath);
          const predMetadata = parsePackageMetadata(predContent, predPath);
          if (predMetadata) {
            const isPredFocused = [
              LANE_RUNTIME_OWNER_BOUNDARY,
              LANE_SCENARIO_RELEASE_GATE,
            ].includes(predMetadata.lane);

            if (isPredFocused && predMetadata.stabilityCredit === 'local-proof-only') {
              const hasCadenceRecord = predMetadata.representativeRerunCadence &&
                REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES.includes(predMetadata.representativeRerunCadence);
              if (!hasCadenceRecord) {
                errors.push(
                  `${relativePath}: cannot activate adjacent runtime package because predecessor ` +
                    `${metadata.predecessor} has only local proof and no cadence record.`,
                );
              }
            }
          }
        } catch (err) {
          // ignore parsing/reading errors
        }
      }
    }
  }
  if (phase === VALIDATION_PHASE_PROBE) {
    errors.push(...validateProbePackageContract(
      content,
      relativePath,
      metadata,
    ));
    return {
      errors,
      hasMetadata: metadata !== null,
    };
  }
  return {
    errors,
    hasMetadata: metadata !== null,
  };
}

async function validateSprintFile(filePath) {
  const content = await readTextFile(filePath);
  const relativePath = normalizeRelativePath(filePath);
  const fileStatus = getSprintStatusFromPath(filePath);
  const errors = [];
  if (!fileStatus) {
    errors.push(`${relativePath}: sprint filename has no valid status prefix.`);
  }
  if (fileStatus === STATUS_DONE && hasOpenChecklist(content)) {
    errors.push(`${relativePath}: closed sprint still has open checklist items.`);
  }
  errors.push(...validateSprintStrategyBrief(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: fileStatus === STATUS_ACTIVE,
  }));
  errors.push(...validateTheoryLoopSprintClosure(content, relativePath, {
    status: fileStatus,
  }));
  errors.push(...validateSprintJointCoupledInvariantProbe(content, relativePath, {
    status: fileStatus,
  }));
  if (fileStatus === STATUS_ACTIVE) {
    const activePayload = await buildActiveSprintCurrentBlockerPayload(filePath);
    if (activePayload && isScenarioPayload(activePayload)) {
      errors.push(...validateSprintCurrentEdgeCard(
        content,
        relativePath,
        activePayload,
      ));
      errors.push(...validateLegacyCurrentNextActionSection(
        content,
        relativePath,
      ));
    }
  }
  return errors;
}

function isScenarioPayload(payload) {
  const scenario = normalizeLedgerText(payload?.scenario).toLowerCase();
  return scenario.length > NUM_ZERO &&
    scenario !== SCENARIO_NONE &&
    scenario !== SCENARIO_UNKNOWN &&
    scenario !== SCENARIO_TEMPLATE_VALUE;
}

async function buildActiveSprintCurrentBlockerPayload(filePath) {
  const activeSprintFile = await findActiveSprintFile();
  if (
    !activeSprintFile ||
    normalizeRelativePath(activeSprintFile) !== normalizeRelativePath(filePath)
  ) {
    return null;
  }
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    return null;
  }
  const activePackageRelativePath = normalizeRelativePath(activePackageFile);
  const packageContent = await readTextFile(activePackageFile);
  const metadata = parsePackageMetadata(
    packageContent,
    activePackageRelativePath,
  );
  return metadata ?
    buildCurrentBlockerPayload(activeSprintFile, activePackageFile, metadata, {
      packageHistoryEntries: await collectPackageHistoryEntries(),
    }) :
    null;
}

async function resolveValidationTargets(args) {
  const explicitTargets = args.filter((arg) => !arg.startsWith('--'));
  if (explicitTargets.length > NUM_ZERO) {
    return explicitTargets.map(normalizeCliPath);
  }
  const packageFiles = await listPackageFiles();
  const sprintFiles = await listSprintFiles();
  if (args.includes(CLI_FLAG_ALL)) {
    return [
      ...packageFiles,
      ...sprintFiles,
    ];
  }
  const activePackages = packageFiles.filter((filePath) =>
    getPackageStatusFromPath(filePath) === STATUS_ACTIVE,
  );
  const activeSprints = sprintFiles.filter((filePath) =>
    getSprintStatusFromPath(filePath) === STATUS_ACTIVE,
  );
  return [
    ...activePackages,
    ...activeSprints,
  ];
}

function hasExplicitValidationTargets(args) {
  return args.some((arg) => !arg.startsWith('--'));
}

function normalizeSnapshotPathValue(filePath) {
  const normalizedPath = normalizeLedgerText(filePath);
  return normalizedPath.length > NUM_ZERO ?
    normalizeRelativePath(normalizeCliPath(normalizedPath)) :
    EMPTY_TEXT;
}

function normalizePayloadForCompare(value) {
  if (Array.isArray(value)) {
    return value.map(normalizePayloadForCompare);
  }
  if (isObjectRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizePayloadForCompare(value[key])]),
    );
  }
  return value;
}

function payloadValuesMatch(actual, expected) {
  return JSON.stringify(normalizePayloadForCompare(actual)) ===
    JSON.stringify(normalizePayloadForCompare(expected));
}

function appendPayloadDifference(differences, pathLabel) {
  if (differences.length >= CURRENT_BLOCKER_STALE_FIELD_LIMIT) {
    return;
  }
  differences.push(pathLabel || 'root');
}

function collectCurrentBlockerPayloadDifferences(
  actual,
  expected,
  pathLabel = EMPTY_TEXT,
  differences = [],
) {
  if (payloadValuesMatch(actual, expected)) {
    return differences;
  }
  if (
    differences.length >= CURRENT_BLOCKER_STALE_FIELD_LIMIT ||
    Array.isArray(actual) ||
    Array.isArray(expected) ||
    !isObjectRecord(actual) ||
    !isObjectRecord(expected)
  ) {
    appendPayloadDifference(differences, pathLabel);
    return differences;
  }
  const keys = [
    ...new Set([...Object.keys(actual), ...Object.keys(expected)]),
  ].sort();
  for (const key of keys) {
    const nextPath = pathLabel.length > NUM_ZERO ? `${pathLabel}.${key}` : key;
    collectCurrentBlockerPayloadDifferences(
      actual[key],
      expected[key],
      nextPath,
      differences,
    );
    if (differences.length >= CURRENT_BLOCKER_STALE_FIELD_LIMIT) {
      break;
    }
  }
  return differences;
}

export function validateCurrentBlockerPayloadFreshness(
  currentBlocker,
  expectedPayload,
  options = {},
) {
  if (payloadValuesMatch(currentBlocker, expectedPayload)) {
    return [];
  }
  const snapshotPath = options.snapshotPath || CURRENT_BLOCKER_JSON_PATH;
  const differences = collectCurrentBlockerPayloadDifferences(
    currentBlocker,
    expectedPayload,
  );
  const suffix = differences.length >= CURRENT_BLOCKER_STALE_FIELD_LIMIT ?
    ', ...' :
    EMPTY_TEXT;
  return [
    `${snapshotPath}: current-blocker snapshot is stale for fields: ` +
    `${differences.join(', ')}${suffix}; run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
  ];
}

function resolveActiveWorkReferencePath(markdownFilePath, referencePath) {
  const normalizedReferencePath = normalizeLedgerText(referencePath);
  if (normalizedReferencePath.startsWith(`${WORK_ROOT}/`)) {
    return normalizeRelativePath(normalizeCliPath(normalizedReferencePath));
  }
  return normalizeRelativePath(
    path.join(
      path.dirname(normalizeCliPath(markdownFilePath)),
      normalizedReferencePath,
    ),
  );
}

function collectActiveWorkReferences(content) {
  const references = [];
  ACTIVE_WORK_REFERENCE_PATTERN.lastIndex = NUM_ZERO;
  for (
    let match = ACTIVE_WORK_REFERENCE_PATTERN.exec(content);
    match;
    match = ACTIVE_WORK_REFERENCE_PATTERN.exec(content)
  ) {
    references.push(match[NUM_ONE]);
  }
  return references;
}

function buildActiveWorkReferenceFreshnessError(
  markdownFilePath,
  referencePath,
  resolvedPath,
) {
  return `${normalizeRelativePath(markdownFilePath)}: active work reference ` +
    `${referencePath} resolves to missing ${resolvedPath}; run ` +
    `${CURRENT_BLOCKER_REPAIR_COMMAND} and update track handoffs after ` +
    'renaming active files.';
}

export function validateActiveWorkReferences(
  content,
  markdownFilePath,
  options = {},
) {
  const existingPathSet = new Set(
    (Array.isArray(options.existingPaths) ? options.existingPaths : [])
      .map((filePath) => normalizeRelativePath(normalizeCliPath(filePath))),
  );
  const useProvidedExistingPaths = Array.isArray(options.existingPaths);
  const errors = [];
  for (const referencePath of collectActiveWorkReferences(content)) {
    const resolvedPath = resolveActiveWorkReferencePath(
      markdownFilePath,
      referencePath,
    );
    if (useProvidedExistingPaths && !existingPathSet.has(resolvedPath)) {
      errors.push(
        buildActiveWorkReferenceFreshnessError(
          markdownFilePath,
          referencePath,
          resolvedPath,
        ),
      );
    }
  }
  return errors;
}

export function validateCurrentBlockerSnapshot(currentBlocker, options = {}) {
  const snapshotPath = options.snapshotPath || CURRENT_BLOCKER_JSON_PATH;
  const allowClosedSnapshot = options.allowClosed === true;
  const errors = [];
  if (!isObjectRecord(currentBlocker)) {
    return [`${snapshotPath}: current-blocker snapshot must be an object.`];
  }

  if (currentBlocker.schema !== CURRENT_BLOCKER_SCHEMA) {
    errors.push(
      `${snapshotPath}: current-blocker schema must be ` +
      `${CURRENT_BLOCKER_SCHEMA}.`,
    );
  }

  const isNoActiveSnapshot =
    allowClosedSnapshot &&
    currentBlocker.status === 'none' &&
    normalizeLedgerText(currentBlocker.package) === 'none';
  const packagePath = isNoActiveSnapshot ?
    EMPTY_TEXT :
    normalizeSnapshotPathValue(currentBlocker.package);
  if (isNoActiveSnapshot) {
    // A deliberate no-active snapshot is valid between package slices.
  } else if (packagePath.length === NUM_ZERO) {
    errors.push(
      `${snapshotPath}: current-blocker package is required; run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    );
  } else {
    if (options.packageExists === false) {
      errors.push(
        `${snapshotPath}: package ${packagePath} does not exist; run ` +
        `${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
      );
    }
    const packageStatus = getPackageStatusFromPath(packagePath);
    const isClosedSnapshot =
      allowClosedSnapshot &&
      CURRENT_BLOCKER_CLOSED_STATUSES.includes(currentBlocker.status);
    if (isClosedSnapshot && packageStatus === STATUS_ACTIVE) {
      errors.push(
        `${snapshotPath}: closed current-blocker snapshot must not point to ` +
        `an active-* package; run ${CURRENT_BLOCKER_REPAIR_COMMAND} after ` +
        'opening a new sprint.',
      );
    } else if (
      !isClosedSnapshot &&
      (packageStatus !== STATUS_ACTIVE || currentBlocker.status !== STATUS_ACTIVE)
    ) {
      errors.push(
        `${snapshotPath}: current-blocker package must be an active-* ` +
        `package with status active; run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
      );
    }
  }

  const activePackagePath = normalizeSnapshotPathValue(options.activePackageFile);
  if (
    packagePath.length > NUM_ZERO &&
    activePackagePath.length > NUM_ZERO &&
    packagePath !== activePackagePath
  ) {
    errors.push(
      `${snapshotPath}: package ${packagePath} does not match discovered ` +
      `active package ${activePackagePath}; run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    );
  }

  const sprintPath = normalizeSnapshotPathValue(currentBlocker.sprint);
  if (sprintPath.length === NUM_ZERO) {
    errors.push(
      `${snapshotPath}: current-blocker sprint is required; run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    );
  }
  const activeSprintPath = normalizeSnapshotPathValue(options.activeSprintFile);
  if (
    sprintPath.length > NUM_ZERO &&
    activeSprintPath.length > NUM_ZERO &&
    sprintPath !== activeSprintPath
  ) {
    errors.push(
      `${snapshotPath}: sprint ${sprintPath} does not match discovered ` +
      `active sprint ${activeSprintPath}; run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    );
  }

  return errors;
}

async function validateCurrentBlockerFreshness() {
  if (!(await pathExists(CURRENT_BLOCKER_JSON_PATH))) {
    return [
      `${CURRENT_BLOCKER_JSON_PATH}: generated current-blocker snapshot is ` +
      `missing; run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    ];
  }

  let currentBlocker = null;
  try {
    currentBlocker = await readJsonFile(CURRENT_BLOCKER_JSON_PATH);
  } catch (error) {
    return [
      `${CURRENT_BLOCKER_JSON_PATH}: current-blocker snapshot is not valid ` +
      `JSON: ${error.message}; run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    ];
  }

  const errors = [];
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  const allowNoActiveSnapshot =
    !activeSprintFile &&
    !activePackageFile &&
    currentBlocker.status === 'none';
  const allowClosedSnapshot =
    !activeSprintFile &&
    !activePackageFile &&
    (
      CURRENT_BLOCKER_CLOSED_STATUSES.includes(currentBlocker.status) ||
      allowNoActiveSnapshot
    );
  if (!activeSprintFile && !activePackageFile && !allowClosedSnapshot) {
    errors.push(
      `${CURRENT_BLOCKER_JSON_PATH}: ${ERROR_NO_ACTIVE_SPRINT} Run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND} after activating a sprint or ` +
      'recording a track Next Package.',
    );
  }
  if (!activePackageFile && !allowClosedSnapshot) {
    errors.push(
      `${CURRENT_BLOCKER_JSON_PATH}: ` +
      `${await formatActivePackageResolutionFailure(activeSprintFile)} Run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND} after updating the active sprint or ` +
      'track Next Package.',
    );
  }
  const packagePath = normalizeSnapshotPathValue(currentBlocker.package);
  const packageExists = packagePath.length > NUM_ZERO ?
    await pathExists(packagePath) :
    false;
  errors.push(...validateCurrentBlockerSnapshot(currentBlocker, {
    activePackageFile,
    activeSprintFile,
    allowClosed: allowClosedSnapshot,
    packageExists,
    snapshotPath: CURRENT_BLOCKER_JSON_PATH,
  }));
  if (activePackageFile && !allowClosedSnapshot) {
    const activePackageRelativePath = normalizeRelativePath(activePackageFile);
    try {
      const packageContent = await readTextFile(activePackageFile);
      const metadata = parsePackageMetadata(
        packageContent,
        activePackageRelativePath,
      );
      if (!metadata) {
        errors.push(
          `${CURRENT_BLOCKER_JSON_PATH}: active package ` +
          `${activePackageRelativePath} has no work-package metadata; run ` +
          `${CURRENT_BLOCKER_REPAIR_COMMAND} after repairing the package.`,
        );
      } else {
        const expectedPayload = buildCurrentBlockerPayload(
          activeSprintFile,
          activePackageFile,
          metadata,
          {packageHistoryEntries: await collectPackageHistoryEntries()},
        );
        errors.push(...validateCurrentBlockerPayloadFreshness(
          currentBlocker,
          expectedPayload,
          {snapshotPath: CURRENT_BLOCKER_JSON_PATH},
        ));
      }
    } catch (error) {
      errors.push(
        `${CURRENT_BLOCKER_JSON_PATH}: cannot rebuild current-blocker from ` +
        `${activePackageRelativePath}: ${error.message}; run ` +
        `${CURRENT_BLOCKER_REPAIR_COMMAND} after repairing the package.`,
      );
    }
  }
  return errors;
}

async function validateActiveWorkReferenceFreshness() {
  const markdownFiles = [
    ...(await listTrackFiles()),
    ...((await pathExists(CURRENT_BLOCKER_MARKDOWN_PATH)) ?
      [CURRENT_BLOCKER_MARKDOWN_PATH] :
      []),
  ];
  const errors = [];
  for (const markdownFilePath of markdownFiles) {
    const content = await readTextFile(markdownFilePath);
    for (const referencePath of collectActiveWorkReferences(content)) {
      const resolvedPath = resolveActiveWorkReferencePath(
        markdownFilePath,
        referencePath,
      );
      if (!(await pathExists(resolvedPath))) {
        errors.push(
          buildActiveWorkReferenceFreshnessError(
            markdownFilePath,
            referencePath,
            resolvedPath,
          ),
        );
      }
    }
  }
  return errors;
}

async function validateCommand(args) {
  const phase = resolveValidationPhase(args);
  const targets = await resolveValidationTargets(args);
  const packageHistoryEntries = await collectPackageHistoryEntries();
  const theoryLedgerContext = await readTheoryLedgerContext();
  const errors = [];
  if (!hasExplicitValidationTargets(args)) {
    errors.push(...(await validateCurrentBlockerFreshness()));
  }
  if (
    !hasExplicitValidationTargets(args) ||
    phase === VALIDATION_PHASE_CLOSURE
  ) {
    errors.push(...(await validateActiveWorkReferenceFreshness()));
  }
  for (const filePath of targets) {
    if (filePath.includes(`${path.sep}sprints${path.sep}`)) {
      errors.push(...(await validateSprintFile(filePath)));
      continue;
    }
    const result = await validatePackageFile(filePath, {
      phase,
      packageHistoryEntries,
      theoryLedgerContext,
    });
    errors.push(...result.errors);
  }
  if (errors.length > NUM_ZERO) {
    console.error(errors.join(NEWLINE));
    process.exit(EXIT_FAILURE);
  }
  if (globalDryRunOption) {
    console.log(`Dry-run validation successful for epic package.`);
    process.exit(EXIT_SUCCESS);
  }
  console.log(
    `Work tracker validation OK for ${targets.length} file(s) ` +
      `at ${phase} phase.`,
  );
}

function appendDoctorField(lines, label, value) {
  lines.push(`- ${label}: ${normalizeLedgerText(value) || DEFAULT_UNKNOWN}`);
}

function metadataTheoryLedgerRefs(metadata = {}) {
  return normalizeMetadataStringList(metadata[THEORY_LEDGER_REFS_FIELD]);
}

function validateTheoryLedgerReferenceContinuity(
  filePath,
  metadata,
  theoryLedgerContext = {},
) {
  const refs = metadataTheoryLedgerRefs(metadata);
  if (refs.length === NUM_ZERO) {
    return [];
  }
  if (!Array.isArray(theoryLedgerContext.entries)) {
    return [];
  }
  const ledgerErrors = theoryLedgerContext.errors || [];
  if (ledgerErrors.length > NUM_ZERO) {
    return [
      `${filePath}: metadata ${THEORY_LEDGER_REFS_FIELD} cannot be checked ` +
      `because ${DEFAULT_THEORY_LEDGER_PATH} is invalid; run ` +
      '`npm run work:theory-ledger -- validate`.',
    ];
  }
  return findMissingTheoryLedgerRefs(theoryLedgerContext.entries || [], refs)
    .map((missingRef) =>
      `${filePath}: metadata ${THEORY_LEDGER_REFS_FIELD} references ` +
      `${missingRef}, but it is not present in ${DEFAULT_THEORY_LEDGER_PATH}.`);
}

function validateTheoryLedgerGates(
  filePath,
  content,
  status,
  metadata,
  theoryLedgerContext = {},
  phase = VALIDATION_PHASE_PRE_IMPL
) {
  const errors = [];
  if (!metadata) {
    return errors;
  }
  const epicRef = metadata?.intent?.epicRef || metadata?.epicRef;
  if (epicRef) {
    return errors;
  }
  const normalizeText = (value) => String(value || '').trim();

  const entries = theoryLedgerContext.entries || [];
  const lane = metadata.lane;
  const packageClass = metadata.modelFit?.packageClass;

  // High risk check
  const isHighRisk = [
    LANE_RUNTIME_OWNER_BOUNDARY,
    LANE_SCENARIO_RELEASE_GATE,
    LANE_CAUSAL_ESCALATION,
    LANE_EXPERIMENT,
    LANE_BOUNDED_EXPERIMENT
  ].includes(lane) || packageClass === 'workflow-tooling';

  // Gate 1: Pre-implementation related-theory gate
  if (isHighRisk && (phase === VALIDATION_PHASE_PRE_IMPL || phase === VALIDATION_PHASE_CLOSURE)) {
    const refs = normalizeMetadataStringList(metadata[THEORY_LEDGER_REFS_FIELD]);
    const hasAcknowledge = refs.length > NUM_ZERO && !refs.every(ref => ['none', 'n/a'].includes(ref.toLowerCase()));

    if (!hasAcknowledge) {
      // Find related theory candidates
      const related = findRelatedTheoryLedgerEntries(entries, metadata, { limit: 5 });
      if (related.length > NUM_ZERO) {
        // Need to acknowledge or have a reason in the package content
        const reasonRegex = /\b(?:not-applicable|planned-new-theory)\b/iu;
        if (!reasonRegex.test(content)) {
          errors.push(
            `${filePath}: high-risk package must acknowledge related theories in ${THEORY_LEDGER_REFS_FIELD} ` +
            `or explicitly record a concrete "not-applicable" or "planned-new-theory" reason in the package.`
          );
        }
      }
    }
  }

  // Gate 2: Superseded/falsified route guard
  const citedTheoryIds = [...content.matchAll(/theory-[0-9]{8}-[a-z0-9-]+/gu)].map(m => m[0]);
  const related = findRelatedTheoryLedgerEntries(entries, metadata, { limit: 5 });
  const allTheories = [...new Set([...citedTheoryIds, ...related.map(e => e.id)])];

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const nonActiveStatuses = [
    'superseded',
    'falsified',
    'avoided',
    'stale',
    'needs-rerun',
  ];

  for (const theoryId of allTheories) {
    const entry = entryById.get(theoryId);
    if (entry) {
      const entryStatus = normalizeText(entry.fields[THEORY_LEDGER_FIELDS.STATUS] || entry.fields['Status']).toLowerCase();
      if (nonActiveStatuses.includes(entryStatus)) {
        // Must explain why we are not repeating that route
        const justificationKeywords = /\b(?:because|justification|rationale|instead|prevent|avoid|since|why)\b/iu;
        if (!justificationKeywords.test(content)) {
          errors.push(
            `${filePath}: package cites or matches non-active theory ${theoryId} [${entryStatus}] ` +
            `but does not provide a justification explanation (using because, instead, rationale, prevent, avoid) ` +
            `to explain why this route is not being repeated.`
          );
        }
      }
    }
  }

  // Gate 3: Closure write-back gate
  if (phase === VALIDATION_PHASE_CLOSURE) {
    const noUpdateRegex = /\b(?:no ledger update|ledger update not needed|ledger: not-needed|theory-ledger: not-needed)\b/iu;
    const structuredNoUpdate = metadata && metadata.execution && (metadata.execution.theoryLedger === 'no-ledger-update' || metadata.execution.theoryLedger === 'no ledger update');
    if (!noUpdateRegex.test(content) && !structuredNoUpdate) {
      const baseNameWithoutStatus = path.basename(filePath).replace(/^(active|done|todo|superseded)-/, '');

      let hasLink = false;
      for (const entry of entries) {
        const linkedPkgs = normalizeText(entry.fields[THEORY_LEDGER_FIELDS.LINKED_PACKAGES] || entry.fields['Linked packages']).toLowerCase();
        if (linkedPkgs.includes(baseNameWithoutStatus.toLowerCase())) {
          hasLink = true;
          break;
        }
      }
      if (!hasLink) {
        errors.push(
          `${filePath}: closure requires either a theory ledger update linking to this package, ` +
          `or explicitly recording "no ledger update" in the package.`
        );
      }
    }
  }

  return errors;
}

function buildTheoryLedgerGuidance(metadata = {}, theoryLedgerContext = {}) {
  const refs = metadataTheoryLedgerRefs(metadata);
  if (!Array.isArray(theoryLedgerContext.entries)) {
    return [];
  }
  const ledgerErrors = theoryLedgerContext.errors || [];
  const entries = theoryLedgerContext.entries || [];
  if (ledgerErrors.length > NUM_ZERO) {
    return [
      `${DEFAULT_THEORY_LEDGER_PATH} could not be read as advisory memory; ` +
      'run `npm run work:theory-ledger -- validate` before relying on prior theories.',
    ];
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  if (refs.length > NUM_ZERO) {
    const resolvedRefs = refs
      .map((ref) => entryById.get(ref))
      .filter(Boolean)
      .map(summarizeTheoryLedgerEntry);
    if (resolvedRefs.length === NUM_ZERO) {
      return [];
    }
    return [
      `Resolved theory ledger refs: ${resolvedRefs.join('; ')}`,
    ];
  }
  const relatedEntries = findRelatedTheoryLedgerEntries(entries, metadata, {
    limit: THEORY_LEDGER_RELATED_LIMIT,
  });
  if (relatedEntries.length === NUM_ZERO) {
    return [];
  }
  return [
    'Related theory ledger candidates exist; review active, falsified, ' +
      'superseded, avoided, stale, and needs-rerun status before choosing scope: ' +
      relatedEntries.map(summarizeTheoryLedgerEntry).join('; '),
  ];
}

function summarizeDoctorMetadata(metadata = {}) {
  const modelFit = isObjectRecord(metadata[METADATA_FIELD_MODEL_FIT]) ?
    metadata[METADATA_FIELD_MODEL_FIT] :
    {};
  return {
    lane: metadata[METADATA_LANE_FIELD] || DEFAULT_UNKNOWN,
    scenario: metadata.scenario || DEFAULT_UNKNOWN,
    owner: metadata.owner || DEFAULT_UNKNOWN,
    boundary: metadata.boundary || DEFAULT_UNKNOWN,
    dominantReason: metadata.dominantReason || DEFAULT_UNKNOWN,
    progressContract: isObjectRecord(metadata.progressContract) ? 'recorded' : 'missing',
    scenarioCausalClosure: isObjectRecord(
      metadata[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD],
    ) ? 'recorded' : 'missing',
    writeScopeCount: Array.isArray(metadata[SCOPE_FIELD_WRITE_SCOPE]) ?
      metadata[SCOPE_FIELD_WRITE_SCOPE].length :
      NUM_ZERO,
    handoffFileCount: Array.isArray(metadata[SCOPE_FIELD_HANDOFF_FILES]) ?
      metadata[SCOPE_FIELD_HANDOFF_FILES].length :
      NUM_ZERO,
    generatedFileCount: Array.isArray(metadata[SCOPE_FIELD_GENERATED_FILES]) ?
      metadata[SCOPE_FIELD_GENERATED_FILES].length :
      NUM_ZERO,
    candidateRuntimeFileCount: Array.isArray(
      metadata[SCOPE_FIELD_CANDIDATE_RUNTIME_FILES],
    ) ?
      metadata[SCOPE_FIELD_CANDIDATE_RUNTIME_FILES].length :
      NUM_ZERO,
    commitScopeCount: Array.isArray(metadata[SCOPE_FIELD_COMMIT_SCOPE]) ?
      metadata[SCOPE_FIELD_COMMIT_SCOPE].length :
      NUM_ZERO,
    theoryLedgerRefCount: Array.isArray(metadata[THEORY_LEDGER_REFS_FIELD]) ?
      metadata[THEORY_LEDGER_REFS_FIELD].length :
      NUM_ZERO,
    legacyTouchedFileCount: Array.isArray(metadata.touchedFiles) ?
      metadata.touchedFiles.length :
      NUM_ZERO,
    proofCount: Array.isArray(metadata.proof) ? metadata.proof.length : NUM_ZERO,
    classificationOnlyFastPath:
      metadataUsesClassificationOnlyFastPath(metadata) ? 'yes' : 'no',
    pureClassificationFastPath:
      metadataUsesPureClassificationFastPath(metadata) ? 'yes' : 'no',
    outputProfile:
      modelFit[MODEL_FIT_METADATA_OUTPUT_PROFILE_FIELD] || DEFAULT_UNKNOWN,
  };
}

function normalizeMetadataStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(normalizeLedgerText)
    .filter((value) => value.length > NUM_ZERO);
}

function metadataWritePaths(metadata = {}) {
  return [
    ...normalizeMetadataStringList(metadata[SCOPE_FIELD_WRITE_SCOPE]),
    ...normalizeMetadataStringList(metadata[SCOPE_FIELD_COMMIT_SCOPE]),
  ];
}

function parseProofCommand(item) {
  if (typeof item === 'string') {
    const trimmed = item.trim();
    const match = trimmed.match(/^(falsifier|regression|supporting)\s*:\s*(.+)$/i);
    if (match) {
      return {
        role: match[1].toLowerCase(),
        command: match[2].trim()
      };
    }
    return {
      role: null,
      command: trimmed
    };
  } else if (item && typeof item === 'object') {
    if (typeof item.role === 'string' && typeof item.command === 'string') {
      const role = item.role.trim().toLowerCase();
      if (['falsifier', 'regression', 'supporting'].includes(role)) {
        return {
          role,
          command: item.command.trim()
        };
      }
    }
    for (const role of ['falsifier', 'regression', 'supporting']) {
      if (typeof item[role] === 'string') {
        return {
          role,
          command: item[role].trim()
        };
      }
    }
  }
  return null;
}

function metadataProofCommands(metadata = {}) {
  const rawProof = metadata[METADATA_FIELD_PROOF] || [];
  if (Array.isArray(rawProof)) {
    return rawProof
      .map((item) => {
        const parsed = parseProofCommand(item);
        return parsed ? parsed.command : '';
      })
      .filter((command) => command.length > 0);
  }
  return normalizeMetadataStringList(rawProof);
}

function validateTheoryLoopProofCommands(metadata = {}, filePath) {
  const proofCommands = metadataProofCommands(metadata);
  const errors = [];
  if (proofCommands.some((command) =>
    EMPTY_PROOF_CLI_VALUE_PATTERN.test(command)
  )) {
    errors.push(
      `${filePath}: theory-loop package proof must not pass an empty ` +
      '--artifact or --output value; use a concrete representative evidence path.',
    );
  }
  if (proofCommands.some((command) =>
    MALFORMED_REPORT_ARTIFACT_PATTERN.test(command)
  )) {
    errors.push(
      `${filePath}: theory-loop package proof must not cite a malformed ` +
      'report path ending in -.report.json.',
    );
  }
  return errors;
}

function hasImplementationWriteScope(metadata = {}) {
  return metadataWritePaths(metadata)
    .some((filePath) => IMPLEMENTATION_WRITE_PATH_PATTERN.test(filePath));
}

function metadataIsTheoryLoopPackage(metadata = {}, content = EMPTY_TEXT) {
  const theoryLoop = metadata?.[THEORY_LOOP_FIELD];
  return (
    isObjectRecord(theoryLoop) &&
    normalizeLedgerText(theoryLoop[THEORY_LOOP_ENFORCEMENT_FIELD]) ===
      THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE
  ) ||
    /^## Theory Loop\b/mu.test(content) ||
    /^## Theory Loop Package Contract\b/mu.test(content);
}

function proofHasRole(metadata = {}, role) {
  const rawProof = metadata[METADATA_FIELD_PROOF] || [];
  return Array.isArray(rawProof) &&
    rawProof.map(parseProofCommand)
      .filter(Boolean)
      .some((command) => command.role === role);
}

function theoryLoopSuccessorPackage(metadata = {}) {
  return normalizeLedgerText(
    metadata?.[THEORY_LOOP_FIELD]?.[
      THEORY_LOOP_SUCCESSOR_PACKAGE_FIELD
    ] ||
      metadata?.successor ||
      metadata?.intent?.successor,
  );
}

function theoryLoopImplementationChangedSource(content, metadata = {}) {
  const executionFiles = metadata?.execution?.implementation?.filesChanged;
  if (
    Array.isArray(executionFiles) &&
    executionFiles.map(normalizeLedgerText).some(isSourceWritePath)
  ) {
    return true;
  }
  const ledger = extractExecutionEvidenceLedger(content);
  if (!ledger) {
    return false;
  }
  const implementationItem = findImplementationExecutionEvidenceItem(
    extractCheckedChecklistItems(ledger),
  );
  return implementationItem ?
    /\bfiles-changed\s*:[^\n]*\bsrc\//iu.test(implementationItem) ||
      /\bchanged files\s*:[^\n]*\bsrc\//iu.test(implementationItem) :
    false;
}

export function validateTheoryLoopPackageContract(
  content,
  metadata = {},
  filePath,
  options = {},
) {
  if (!metadataIsTheoryLoopPackage(metadata, content)) {
    return [];
  }
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata?.status);
  const errors = [];
  const theoryLoop = metadata?.[THEORY_LOOP_FIELD];
  if (!isObjectRecord(theoryLoop)) {
    errors.push(
      `${filePath}: theory-loop package must declare metadata.${THEORY_LOOP_FIELD} ` +
      `with enforcement ${THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE}.`,
    );
  } else {
    if (
      normalizeLedgerText(theoryLoop[THEORY_LOOP_ENFORCEMENT_FIELD]) !==
      THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE
    ) {
      errors.push(
        `${filePath}: theoryLoop.${THEORY_LOOP_ENFORCEMENT_FIELD} must be ` +
        `${THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE}.`,
      );
    }
    if (theoryLoop[THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD] !== true) {
      errors.push(
        `${filePath}: theoryLoop.${THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD} must be true.`,
      );
    }
    if (theoryLoop[THEORY_LOOP_SUCCESSOR_REQUIRED_FIELD] !== true) {
      errors.push(
        `${filePath}: theoryLoop.${THEORY_LOOP_SUCCESSOR_REQUIRED_FIELD} must be true.`,
      );
    }
  }
  if (metadataHasPureClassificationIntent(metadata)) {
    errors.push(
      `${filePath}: theory-loop packages cannot be classification-only; ` +
      'classification-only evidence stays in the sprint until it promotes real src/ work.',
    );
  }
  const writeScope = metadataScopeList(metadata, SCOPE_FIELD_WRITE_SCOPE);
  const commitScope = metadataScopeList(metadata, SCOPE_FIELD_COMMIT_SCOPE);
  if (!writeScope.some(isConcreteSourceFilePath)) {
    errors.push(
      `${filePath}: theory-loop package writeScope must include at least one concrete src/ .js source file.`,
    );
  }
  if (!commitScope.some(isConcreteSourceFilePath)) {
    errors.push(
      `${filePath}: theory-loop package commitScope must include the promoted concrete src/ .js source file.`,
    );
  }
  if (!proofHasRole(metadata, 'falsifier')) {
    errors.push(
      `${filePath}: theory-loop package proof must include a falsifier command.`,
    );
  }
  if (!proofHasRole(metadata, 'regression')) {
    errors.push(
      `${filePath}: theory-loop package proof must include a regression command.`,
    );
  }
  errors.push(...validateTheoryLoopProofCommands(metadata, filePath));
  if (!metadata?.[SYSTEM_THEORY_FIELD]) {
    errors.push(
      `${filePath}: theory-loop package must include metadata.${SYSTEM_THEORY_FIELD} before implementation.`,
    );
  }
  if (!metadata?.[SLICE_THEORY_FIELD]) {
    errors.push(
      `${filePath}: theory-loop package must include metadata.${SLICE_THEORY_FIELD} before implementation.`,
    );
  }
  const sliceSourceContract = normalizeLedgerText(
    metadata?.[SLICE_THEORY_FIELD]?.[
      SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD
    ],
  );
  if (
    metadata?.[SLICE_THEORY_FIELD] &&
    !/\bsrc\/[^*?\s]+\.js\b/iu.test(sliceSourceContract)
  ) {
    errors.push(
      `${filePath}: sliceTheory.${SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD} ` +
      'must name the concrete src/ .js source-code contract tested by this package.',
    );
  }
  if (
    metadata?.[SLICE_THEORY_FIELD] &&
    THEORY_LOOP_NON_EXECUTABLE_CONTRACT_PATTERN.test(sliceSourceContract)
  ) {
    errors.push(
      `${filePath}: sliceTheory.${SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD} ` +
      'must describe an executable source edit, not reading, routing, metadata, or successor-package work.',
    );
  }
  if (status === STATUS_DONE || phase === VALIDATION_PHASE_CLOSURE) {
    if (
      !isObjectRecord(theoryLoop) ||
      !THEORY_LOOP_PACKAGE_RESULT_VALUES.includes(
        normalizeLedgerText(theoryLoop[THEORY_LOOP_RESULT_FIELD]).toLowerCase(),
      )
    ) {
      errors.push(
        `${filePath}: theory-loop package closure must record theoryLoop.${THEORY_LOOP_RESULT_FIELD} ` +
        `as one of ${THEORY_LOOP_PACKAGE_RESULT_VALUES.join(', ')}.`,
      );
    }
    if (!theoryLoopImplementationChangedSource(content, metadata)) {
      errors.push(
        `${filePath}: theory-loop package closure must record checked implementation evidence with files-changed under src/.`,
      );
    }
    const successorPackage = theoryLoopSuccessorPackage(metadata);
    if (!/^work\/packages\/(?:todo|active)-.+\.md$/u.test(successorPackage)) {
      errors.push(
        `${filePath}: theory-loop package closure must create and link a successor package in theoryLoop.${THEORY_LOOP_SUCCESSOR_PACKAGE_FIELD} or successor.`,
      );
    } else if (
      options.successorExists !== true &&
      !fsSync.existsSync(path.join(process.cwd(), successorPackage))
    ) {
      errors.push(
        `${filePath}: linked theory-loop successor package does not exist: ${successorPackage}.`,
      );
    }
  }
  return errors;
}

function validateClassificationOnlyImplementationScope(
  metadata = {},
  filePath,
  options = {},
) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const status = options.status || normalizeLedgerText(metadata?.status);
  if (
    status !== STATUS_ACTIVE ||
    phase === VALIDATION_PHASE_ENTRY ||
    !metadataHasPureClassificationIntent(metadata) ||
    !hasImplementationWriteScope(metadata)
  ) {
    return [];
  }
  const scopeLabel = metadataHasClassificationOnlyOutcome(metadata)
    ? 'classification-only result'
    : 'pure classification package';
  return [
    `${filePath}: ${scopeLabel} must not include runtime, test, ` +
      'script, or report paths in writeScope/commitScope; move implementation ' +
      'paths to candidateRuntimeFiles or change the package outcome before ' +
      'pre-implementation.',
  ];
}

function hasStaticGuardrailProof(metadata = {}) {
  return metadataProofCommands(metadata)
    .some((command) => STATIC_GUARDRAIL_COMMAND_PATTERN.test(command));
}

function hasRepresentativeEvidenceProof(metadata = {}) {
  return metadataProofCommands(metadata)
    .some((command) => REPRESENTATIVE_EVIDENCE_COMMAND_PATTERN.test(command));
}

function buildProofLadderGuidance(metadata = {}) {
  const proofCount = metadataProofCommands(metadata).length;
  if (metadataUsesClassificationOnlyFastPath(metadata)) {
    if (proofCount > CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP) {
      return 'Classification-only proof ladder is heavy: keep fast-path ' +
        `packages to 2-${CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP} canonical ` +
        'commands, then close and rerun evidence instead of adding more ' +
        'implementation ceremony.';
    }
    return `Classification-only proof ladder is compact: ${proofCount}/` +
      `${CLASSIFICATION_ONLY_FAST_PATH_PROOF_CAP} durable commands.`;
  }
  if (proofCount > PROOF_COMMAND_CAP) {
    return 'Proof ladder is heavy: keep default packages to 3-5 durable ' +
      'commands and move supporting extractors into notes unless this is an ' +
      'explicit audit or architecture package.';
  }
  return `Proof ladder is compact: ${proofCount}/${PROOF_COMMAND_CAP} ` +
    'durable commands.';
}

function hasLegacySubagentLedger(content) {
  return (
    extractSubagentSequencingLedger(content) !== null ||
    extractSubagentProgressLedger(content) !== null ||
    extractSubagentAttemptLedger(content) !== null
  );
}

function buildLegacySubagentLedgerGuidance(content) {
  if (!hasLegacySubagentLedger(content)) {
    return [];
  }
  return [
    'Legacy subagent ledger section detected: keep it as historical ' +
      'provenance, but migrate the next closure to `## Execution Evidence`; ' +
      'legacy ledger fields are advisory, not closure gates.',
  ];
}

function buildProcessGuidanceLines(
  metadata = {},
  fileStatus = DEFAULT_UNKNOWN,
  content = EMPTY_TEXT,
) {
  const lines = [buildProofLadderGuidance(metadata)];
  const isActivePackage = fileStatus === STATUS_ACTIVE;
  const hasImplementationWrites = hasImplementationWriteScope(metadata);
  const hasClassificationOnlyOutcome =
    metadataHasClassificationOnlyOutcome(metadata);
  const hasPureClassificationIntent =
    metadataHasPureClassificationIntent(metadata);
  const usesClassificationOnlyFastPath =
    metadataUsesClassificationOnlyFastPath(metadata);
  const usesPureClassificationFastPath =
    metadataUsesPureClassificationFastPath(metadata);
  if (usesClassificationOnlyFastPath) {
    lines.push(
      'Classification-only fast path applies: subagent sequencing and static ' +
      'guardrails are not required until runtime, test, script, or report ' +
      'writes are promoted into write scope.',
    );
  }
  if (usesPureClassificationFastPath && !usesClassificationOnlyFastPath) {
    lines.push(
      'Pure classification fast path applies: classification is a short-lived ' +
      'decision record with a capped proof budget; subagent sequencing resumes ' +
      'only when runtime/test/script/report writes move into write scope.',
    );
  }
  if (hasPureClassificationIntent && hasImplementationWrites) {
    const scopeLabel = hasClassificationOnlyOutcome
      ? 'Classification-only result'
      : 'Pure classification package';
    lines.push(
      `${scopeLabel} has implementation write scope. Move ` +
      'implementation paths to candidateRuntimeFiles, or change the package ' +
      'outcome before runtime/test/script edits begin.',
    );
  }
  if (
    isActivePackage &&
    !hasImplementationWrites &&
    !usesClassificationOnlyFastPath &&
    !usesPureClassificationFastPath
  ) {
    lines.push(
      'Admin stop applies: this active package owns no implementation write ' +
      'scope, so the next pass must run representative evidence, close as ' +
      'classification-only, open a concrete runtime/tooling bug package, or ' +
      'open an autonomous architecture experiment. Human gates are only for ' +
      'contradictory or blocked evidence.',
    );
    if (!hasRepresentativeEvidenceProof(metadata)) {
      lines.push(
        'Add or run one representative evidence command before creating ' +
        'another metadata-only package.',
      );
    }
  }
  if (!hasImplementationWrites && hasStaticGuardrailProof(metadata)) {
    lines.push(
      'Static guardrails are not default proof for metadata-only packages; ' +
      'keep them only when implementation files changed.',
    );
  }
  lines.push(...buildLegacySubagentLedgerGuidance(content));
  const architectureGate = metadata?.[ARCHITECTURE_DECISION_GATE_FIELD];
  if (
    isObjectRecord(architectureGate) &&
    architectureGate.status === ARCHITECTURE_GATE_SELECTED_STATUS
  ) {
    lines.push(
      'Architecture gate already selected: execute the selected route or ' +
      'rerun representative evidence before opening another architecture gate.',
    );
  }
  return lines;
}

function buildDoctorSuggestion(error) {
  if (/representativeOutcome must be one of/iu.test(error)) {
    return 'Use one of the schema outcomes from `npm run work:package:schema`; ' +
      'active packages normally use `pending-before-rerun`, while completed ' +
      'classification packages use `classification-only`, `reduced`, ' +
      '`migrated`, `same-frontier`, `representative-green`, ' +
      '`architecture-gap`, or `contradictory`.';
  }
  if (/resultClassification must be one of/iu.test(error)) {
    return 'Use one of the scenario result classifications from ' +
      '`npm run work:package:schema`; for classification-only residual work, ' +
      'prefer `classification-only` when the split is recorded and ' +
      '`pending-before-probe` before proof runs.';
  }
  if (/stopCondition must be one of/iu.test(error)) {
    return 'Use a schema stop condition from `npm run work:package:schema`; ' +
      'classification-only packages normally use `classification-only-stop`, ' +
      'owner migrations use `migrate-owner-boundary`, and local fixes use ' +
      '`continue-local-fix`.';
  }
  if (/missingCausalEdgeProbe must name a focused command/iu.test(error)) {
    return 'Replace prose probe descriptions with an executable command, for ' +
      'example `npm run analyze:topology-convergence -- <artifact> --explain ' +
      '<edge>` or `npm test -- <focused-test.js>`.';
  }
  if (/Execution Evidence|Subagent Sequencing Ledger/iu.test(error)) {
    return 'Prefer one `## Execution Evidence` section with checked role ' +
      'entries that record `status:`, `evidence:`, `next:` or `blocker:`, ' +
      'and `parent revalidated focused proof: yes` for closure. Agent ' +
      'identity is optional provenance.';
  }
  if (/Subagent Progress Ledger/iu.test(error)) {
    return 'Add a `## Subagent Progress And Attempt Ledger` and have each ' +
      'real subagent append one checked checkpoint after every completed ' +
      'subtask, including status, last checkpoint, parent action, `evidence:` ' +
      'and `next:` or `blocker:`.';
  }
  if (/Subagent Attempt Ledger/iu.test(error)) {
    return 'Add a `## Subagent Progress And Attempt Ledger` with checked ' +
      'attempt checkpoints. Interrupted or partial-unvalidated attempts must ' +
      'be followed by a checked superseded/discarded/revalidated line before ' +
      'closure.';
  }
  if (/Model Fit section is required/iu.test(error)) {
    return 'Use `npm run work:package:new -- --lane <lane> ...` to scaffold a ' +
      'package with schema-valid Model Fit fields prefilled from the model ledger.';
  }
  if (/Core Logic Brief/iu.test(error)) {
    return 'Add a Core Logic Brief before runtime/scenario implementation: ' +
      'canonical outcome, inputs/signals, state model or invariant, non-goals, ' +
      'proof mapping, and wrong-slice trigger. Use `not-needed` only for ' +
      'read/review/doc-only or lightweight maintenance packages.';
  }
  if (/Causal Decision Contract/iu.test(error)) {
    return 'Add a Causal Decision Contract with table columns Signal, ' +
      'Normalized value, Owner interpretation, Emitted outcome, Expected ' +
      'delta, and Disproof probe. Include anti-symptom rationale, a focused ' +
      'falsifying probe command, competing explanations, a systemic ' +
      'interaction scan, a ping-pong stop rule, and an oscillation guard for ' +
      'returned same-frontier work.';
  }
  if (/Decision Experiment Gate/iu.test(error)) {
    return 'Add a Decision Experiment Gate with a decision question, tiny ' +
      'architecture review, competing hypotheses, pre-edit focused probe, ' +
      'success metrics, representative rerun command, and kill rule before ' +
      'another runtime/scenario implementation slice.';
  }
  if (/Sprint Strategy Brief/iu.test(error)) {
    return 'Add a Sprint Strategy Brief near the top of the active sprint: ' +
      'goal state, current causal thesis, competing hypotheses, confidence ' +
      'and evidence, expected green path, wrong-direction signals, next best ' +
      'package, and stop or escalate rule.';
  }
  if (/Commit And Push Ledger is required/iu.test(error)) {
    return 'After validation and package closure, commit only package-owned ' +
      'files, push the branch, and record commit SHA, remote/branch, and ' +
      '`yes` for focused-slice containment.';
  }
  if (/metadata representativeResidual is required/iu.test(error)) {
    return 'Add concrete `representativeResidual` metadata with status, ' +
      'scenario, artifact, frontier, owner, boundary, dominantReason, and ' +
      'nextAction when diagnostic or classification work keeps a sprint ' +
      'representative residual live.';
  }
  if (/whyHighestLeverageNow/iu.test(error)) {
    return 'Add `whyHighestLeverageNow` metadata stating why this work is the highest-leverage next action for the active sprint goal, representative stability gate, or first frontier it advances.';
  }
  if (/representativeRerunCadence/iu.test(error)) {
    return 'Add `representativeRerunCadence` metadata stating how a representative rerun is recorded (fresh-representative-rerun, scheduled-rerun-command, explicit-invalid-rerun-reason, or architecture-stop-reason) for focused runtime/scenario packages with passing local proof.';
  }
  if (/cannot activate adjacent runtime package because predecessor/iu.test(error)) {
    return 'Perform a representative rerun or record a cadence record in the predecessor package before starting another adjacent runtime package.';
  }
  if (/scenarioCausalClosure\.currentFirstFrontier/iu.test(error)) {
    return 'Update the package owner/boundary to the canonical first frontier, ' +
      'or add `ownerBoundaryMigrationProof` with from/to owner-boundary and ' +
      'focused evidence when the package is only diagnostic/support work.';
  }
  if (/frontier oscillation detected/iu.test(error)) {
    return 'Open or convert the next package to the `causal-escalation` lane, ' +
      'record `recentFrontierHistory`, `oscillationCheck`, and ' +
      '`handoffInvariant`, and prove the producer-consumer missing edge before ' +
      'another local runtime patch.';
  }
  if (/rerunDecision/iu.test(error)) {
    return 'Record `rerunDecision` from `npm run work:package:route-after-rerun`: ' +
      'source artifact, route owner/boundary/dominant reason, causal outcome, ' +
      'stop mode, next lane, expected delta, and required refresh commands for ' +
      'Sprint Strategy Brief, Current Edge Card, current-blocker, entry, and pre-impl validation.';
  }
  if (/classificationEfficiency/iu.test(error)) {
    return 'Add `classificationEfficiency` to pure classifier packages: ' +
      'default mode, separate-package reason, one-artifact/two-or-three-command ' +
      'budget, decision record, successor action, and runtime promotion rule. ' +
      'Stable owner/boundary local-fix routes should open a runtime-owner-boundary successor.';
  }
  if (/codeQualityAdmission/iu.test(error)) {
    return 'Add `codeQualityAdmission` metadata to maintenance/cleanup packages in active stability sprints, ' +
      'stating a stability-relevant reason (removes-duplicate-decision-paths, preserves-owner-outcomes, ' +
      'improves-evidence-fidelity, prevents-regression, or active-guardrail-requirement) and supporting evidence.';
  }
  if (/same-frontier rerun without concrete reduction/iu.test(error)) {
    return 'Stop local patching: select/open an autonomous architecture ' +
      'experiment with `architectureDecisionGate` route `architecture-package` ' +
      'before another local implementation package. Use human escalation only ' +
      'when evidence is contradictory, policy-blocked, credential-blocked, or unavailable.';
  }
  if (/systemTheory|sliceTheory|two-level theory/iu.test(error)) {
    return 'Record `systemTheory` for the whole-system causal map and ' +
      '`sliceTheory` for the one executable package contract, including a ' +
      'focused falsifier, representative movement, kill rule, wrong-slice ' +
      'triggers, and high/medium/low theory-fit scores.';
  }
  if (/architectureDecisionGate/iu.test(error)) {
    return 'Record `architectureDecisionGate` with concrete choices, proof, ' +
      'and a selected architecture route before runtime implementation resumes. ' +
      'Default to `architecture-package` for architecture gaps and unchanged ' +
      'same-frontier evidence; use ' +
      '`work:package:new -- --from-artifact <artifact>` for bounded successor ' +
      'scaffolding when the route is a new package.';
  }
  return EMPTY_TEXT;
}

function buildDoctorSuggestions(errors = []) {
  return [
    ...new Set(
      errors
        .map(buildDoctorSuggestion)
        .filter((suggestion) => suggestion.length > NUM_ZERO),
    ),
  ];
}

function appendDoctorSuggestions(lines, errors, heading) {
  const suggestions = buildDoctorSuggestions(errors);
  lines.push('', heading);
  if (suggestions.length === NUM_ZERO) {
    lines.push(`- ${DOCTOR_SUGGESTION_NONE}`);
    return;
  }
  for (const suggestion of suggestions) {
    lines.push(`- ${suggestion}`);
  }
}

export function buildPackageDoctorLines(filePath, content, options = {}) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const relativePath = normalizeRelativePath(filePath);
  const fileStatus = getPackageStatusFromPath(filePath) || DEFAULT_UNKNOWN;
  const errors = [];
  let metadata = null;
  try {
    metadata = parsePackageMetadata(content, relativePath);
  } catch (error) {
    errors.push(error.message);
  }

  errors.push(...runPackageValidationsSync(filePath, content, fileStatus, metadata, {
    phase,
    theoryLedgerContext: options.theoryLedgerContext,
    packageHistoryEntries: options.packageHistoryEntries,
  }));

  if (fileStatus === STATUS_ACTIVE && metadata && metadata.predecessor) {
    const isCurrentFocused = [
      LANE_RUNTIME_OWNER_BOUNDARY,
      LANE_SCENARIO_RELEASE_GATE,
    ].includes(metadata.lane);

    if (isCurrentFocused) {
      const predPath = normalizeCliPath(metadata.predecessor);
      if (fsSync.existsSync(predPath)) {
        try {
          const predContent = fsSync.readFileSync(predPath, 'utf8');
          const predMetadata = parsePackageMetadata(predContent, predPath);
          if (predMetadata) {
            const isPredFocused = [
              LANE_RUNTIME_OWNER_BOUNDARY,
              LANE_SCENARIO_RELEASE_GATE,
            ].includes(predMetadata.lane);

            if (isPredFocused && predMetadata.stabilityCredit === 'local-proof-only') {
              const hasCadenceRecord = predMetadata.representativeRerunCadence &&
                REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES.includes(predMetadata.representativeRerunCadence);
              if (!hasCadenceRecord) {
                errors.push(
                  `${relativePath}: cannot activate adjacent runtime package because predecessor ` +
                    `${metadata.predecessor} has only local proof and no cadence record.`,
                );
              }
            }
          }
        } catch (err) {
          // ignore
        }
      }
    }
  }

  const metadataSummary = summarizeDoctorMetadata(metadata || {});
  const lines = ['# Work Package Doctor'];
  appendDoctorField(lines, 'Package', relativePath);
  appendDoctorField(lines, 'Status', fileStatus);
  appendDoctorField(lines, 'Workflow lane', metadataSummary.lane);
  appendDoctorField(lines, 'Scenario', metadataSummary.scenario);
  appendDoctorField(lines, 'Owner', metadataSummary.owner);
  appendDoctorField(lines, 'Boundary', metadataSummary.boundary);
  appendDoctorField(lines, 'Dominant reason', metadataSummary.dominantReason);
  appendDoctorField(lines, 'Output profile', metadataSummary.outputProfile);
  appendDoctorField(lines, 'Validation phase', phase);
  appendDoctorField(
    lines,
    'Scenario causal closure',
    metadataSummary.scenarioCausalClosure,
  );
  appendDoctorField(lines, 'Progress contract', metadataSummary.progressContract);
  appendDoctorField(lines, 'Write scope', String(metadataSummary.writeScopeCount));
  appendDoctorField(lines, 'Handoff files', String(metadataSummary.handoffFileCount));
  appendDoctorField(lines, 'Generated files', String(metadataSummary.generatedFileCount));
  appendDoctorField(
    lines,
    'Candidate runtime files',
    String(metadataSummary.candidateRuntimeFileCount),
  );
  appendDoctorField(lines, 'Commit scope', String(metadataSummary.commitScopeCount));
  appendDoctorField(
    lines,
    'Theory ledger refs',
    String(metadataSummary.theoryLedgerRefCount),
  );
  appendDoctorField(
    lines,
    'Legacy touched files',
    String(metadataSummary.legacyTouchedFileCount),
  );
  appendDoctorField(lines, 'Proof commands', String(metadataSummary.proofCount));
  appendDoctorField(
    lines,
    'Classification-only fast path',
    metadataSummary.classificationOnlyFastPath,
  );
  appendDoctorField(
    lines,
    'Pure classification fast path',
    metadataSummary.pureClassificationFastPath,
  );
  appendDoctorField(lines, 'Validation', errors.length === NUM_ZERO ? 'ok' : 'failed');
  const processGuidance = [
    ...buildProcessGuidanceLines(
      metadata || {},
      fileStatus,
      content,
    ),
    ...buildTheoryLedgerGuidance(
      metadata || {},
      options.theoryLedgerContext,
    ),
  ];
  if (processGuidance.length > NUM_ZERO) {
    lines.push('', '## Process Guidance');
    for (const guidance of processGuidance) {
      lines.push(`- ${guidance}`);
    }
  }
  if (errors.length > NUM_ZERO) {
    lines.push('', '## Findings');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
  }
  if (options.suggest || options.fixDryRun) {
    appendDoctorSuggestions(
      lines,
      errors,
      options.fixDryRun ? '## Fix Dry Run' : '## Suggestions',
    );
  }
  return {
    lines,
    errors,
  };
}

async function resolveDoctorPackagePath(args) {
  const packageArg = args.find((arg) => !arg.startsWith('--'));
  if (packageArg) {
    return normalizeCliPath(packageArg);
  }
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  await assertResolvableActivePackage(activeSprintFile, activePackageFile);
  return activePackageFile;
}

async function doctorCommand(args) {
  const phase = resolveValidationPhase(args);
  const packagePath = await resolveDoctorPackagePath(args);
  const content = await readTextFile(packagePath);
  const packageHistoryEntries = await collectPackageHistoryEntries();
  const theoryLedgerContext = await readTheoryLedgerContext();
  const report = buildPackageDoctorLines(packagePath, content, {
    phase,
    packageHistoryEntries,
    theoryLedgerContext,
    suggest: args.includes(CLI_FLAG_SUGGEST),
    fixDryRun: args.includes(CLI_FLAG_FIX_DRY_RUN),
  });
  console.log(report.lines.join(NEWLINE));
  if (report.errors.length > NUM_ZERO) {
    process.exit(EXIT_FAILURE);
  }
}

export async function findActiveSprintFile() {
  const sprintFiles = await listSprintFiles();
  return sprintFiles.find((filePath) =>
    getSprintStatusFromPath(filePath) === STATUS_ACTIVE,
  ) || null;
}

export function findActivePackageLinkInSprint(content) {
  const currentEdgeCardSection = extractCurrentEdgeCardSection(content);
  const currentEdgeCardMatch = currentEdgeCardSection?.match(
    CURRENT_EDGE_CARD_ACTIVE_PACKAGE_REFERENCE_PATTERN,
  );
  if (currentEdgeCardMatch) {
    return currentEdgeCardMatch[NUM_ONE];
  }
  const currentMatch = content.match(CURRENT_ACTIVE_PACKAGE_LINK_PATTERN);
  if (currentMatch) {
    return currentMatch[NUM_ONE];
  }
  const match = content.match(ACTIVE_PACKAGE_LINK_PATTERN);
  if (match) {
    return match[NUM_ONE];
  }
  const referenceMatch = content.match(ACTIVE_PACKAGE_REFERENCE_PATTERN);
  return referenceMatch ? referenceMatch[NUM_ONE] : null;
}

function findNextPackageLinkInTrack(content) {
  const nextPackageSection = extractMarkdownLevelTwoSection(
    content,
    NEXT_PACKAGE_HEADING,
  );
  const references = collectActiveWorkReferences(
    nextPackageSection || content,
  ).filter((referencePath) =>
    normalizeLedgerText(referencePath).includes(`${WORK_PACKAGES_DIR}/`) ||
    normalizeLedgerText(referencePath).includes('/packages/'),
  );
  return references.length === NUM_ONE ? references[NUM_ZERO] : null;
}

export function resolveSprintPackageReference(activeSprintFile, packageReference) {
  const normalizedReference = normalizeLedgerText(packageReference);
  if (
    path.isAbsolute(normalizedReference) ||
    normalizedReference.startsWith(`${WORK_ROOT}/`)
  ) {
    return normalizeCliPath(normalizedReference);
  }
  return normalizeCliPath(
    path.join(path.dirname(activeSprintFile), normalizedReference),
  );
}

export async function findActivePackageFile(activeSprintFile) {
  const packageFiles = await listPackageFiles();
  const activePackages = packageFiles.filter((filePath) =>
    getPackageStatusFromPath(filePath) === STATUS_ACTIVE,
  );
  if (activeSprintFile) {
    const sprintContent = await readTextFile(activeSprintFile);
    const packageLink = findActivePackageLinkInSprint(sprintContent);
    if (packageLink) {
      const sprintPackageFile = resolveSprintPackageReference(
        activeSprintFile,
        packageLink,
      );
      const matchingActivePackage = activePackages.find((filePath) =>
        normalizeRelativePath(filePath) === normalizeRelativePath(sprintPackageFile),
      );
      return matchingActivePackage || sprintPackageFile;
    }
  }
  if (!activeSprintFile) {
    const trackFiles = await listTrackFiles();
    for (const trackFile of trackFiles) {
      const trackContent = await readTextFile(trackFile);
      const trackPackageLink = findNextPackageLinkInTrack(trackContent);
      if (!trackPackageLink) {
        continue;
      }
      const trackPackageFile = normalizeCliPath(trackPackageLink);
      const matchingActivePackage = activePackages.find((filePath) =>
        normalizeRelativePath(filePath) === normalizeRelativePath(trackPackageFile),
      );
      if (matchingActivePackage) {
        return matchingActivePackage;
      }
    }
  }
  return activePackages.length === NUM_ONE ? activePackages[NUM_ZERO] : null;
}

async function formatActivePackageResolutionFailure(activeSprintFile) {
  const packageFiles = await listPackageFiles();
  const activePackages = packageFiles
    .filter((filePath) => getPackageStatusFromPath(filePath) === STATUS_ACTIVE)
    .map(normalizeRelativePath);
  const sprintMessage = activeSprintFile ?
    `active sprint ${normalizeRelativePath(activeSprintFile)}` :
    'no active sprint';
  if (activePackages.length === NUM_ZERO) {
    return `${ERROR_NO_ACTIVE_PACKAGE} Found ${sprintMessage} and no ` +
      'active-* package files.';
  }
  return `${ERROR_NO_ACTIVE_PACKAGE} Found ${sprintMessage} and active ` +
    `package files: ${activePackages.join(', ')}. The active sprint Current ` +
    'Edge Card or a track Next Package section must name exactly one active ' +
    'package.';
}

async function assertResolvableActivePackage(activeSprintFile, activePackageFile) {
  if (!activePackageFile) {
    throw new Error(await formatActivePackageResolutionFailure(activeSprintFile));
  }
  if (!(await pathExists(activePackageFile))) {
    const activeSource = activeSprintFile ?
      normalizeRelativePath(activeSprintFile) :
      'track Next Package handoff';
    throw new Error(
      `${normalizeRelativePath(activePackageFile)}: active package named by ` +
      `${activeSource} does not exist. Update the active sprint Current Edge ` +
      'Card, track Next Package, or activate the successor package, then ' +
      `run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    );
  }
}

function metadataArray(metadata, fieldName) {
  return Array.isArray(metadata?.[fieldName]) ? metadata[fieldName] : [];
}

function metadataScopeArray(metadata, fieldName, fallbackFieldName = null) {
  const values = metadataArray(metadata, fieldName);
  if (values.length > NUM_ZERO) {
    return values;
  }
  return fallbackFieldName ? metadataArray(metadata, fallbackFieldName) : [];
}

export function buildCurrentBlockerPayload(
  activeSprintFile,
  activePackageFile,
  metadata,
  options = {},
) {
  const legacyTouchedFiles = metadataArray(metadata, 'touchedFiles');
  const writeScope = metadataScopeArray(
    metadata,
    SCOPE_FIELD_WRITE_SCOPE,
    'touchedFiles',
  );
  const handoffFiles = metadataArray(metadata, SCOPE_FIELD_HANDOFF_FILES);
  const generatedFiles = metadataArray(metadata, SCOPE_FIELD_GENERATED_FILES);
  const candidateRuntimeFiles = metadataArray(
    metadata,
    SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  );
  const metadataCommitScope = metadataArray(metadata, SCOPE_FIELD_COMMIT_SCOPE);
  const commitScope = metadataCommitScope.length > NUM_ZERO ?
    metadataCommitScope :
    writeScope;
  return {
    schema: 'current-blocker-v1',
    generatedBy: 'scripts/work-tracker.js',
    sprint: activeSprintFile ?
      normalizeRelativePath(activeSprintFile) :
      CURRENT_BLOCKER_NO_ACTIVE_SPRINT,
    package: normalizeRelativePath(activePackageFile),
    status: metadata.status,
    lane: metadata[METADATA_LANE_FIELD] || DEFAULT_UNKNOWN,
    scenario: metadata.scenario || DEFAULT_UNKNOWN,
    artifact: metadata.artifact || DEFAULT_UNKNOWN,
    playback: metadata.playback || DEFAULT_UNKNOWN,
    owner: metadata.owner || DEFAULT_UNKNOWN,
    boundary: metadata.boundary || DEFAULT_UNKNOWN,
    dominantReason: metadata.dominantReason || DEFAULT_UNKNOWN,
    currentState: metadata.currentState || DEFAULT_UNKNOWN,
    nextAction: metadata.nextAction || DEFAULT_UNKNOWN,
    proof: Array.isArray(metadata.proof) ? metadata.proof : [],
    writeScope,
    handoffFiles,
    generatedFiles,
    candidateRuntimeFiles,
    commitScope,
    touchedFiles: legacyTouchedFiles,
    theoryLedgerRefs: metadataArray(metadata, THEORY_LEDGER_REFS_FIELD),
    modelFit: metadata.modelFit || {},
    representativeResidual: isObjectRecord(
      metadata[REPRESENTATIVE_RESIDUAL_METADATA_FIELD],
    ) ? metadata[REPRESENTATIVE_RESIDUAL_METADATA_FIELD] : {},
    theoryLoop: metadata[THEORY_LOOP_FIELD] || {},
    causalGovernance: metadata.causalGovernance || {},
    scenarioCausalClosure: metadata.scenarioCausalClosure || {},
    observablePrediction: metadata[OBSERVABLE_PREDICTION_FIELD] || {},
    experimentOutcome: metadata[EXPERIMENT_OUTCOME_FIELD] || {},
    rerunDecision: metadata[RERUN_DECISION_FIELD] || {},
    classificationEfficiency: metadata[CLASSIFICATION_EFFICIENCY_FIELD],
    systemTheory: metadata[SYSTEM_THEORY_FIELD] || {},
    sliceTheory: metadata[SLICE_THEORY_FIELD] || {},
    architectureDecisionGate: buildArchitectureDecisionGatePayload(
      metadata,
      activePackageFile,
      options,
    ),
    predecessor: metadata.predecessor || null,
  };
}

function buildNoActiveCurrentBlockerPayload(activeSprintFile = null) {
  return {
    schema: CURRENT_BLOCKER_SCHEMA,
    generatedBy: 'scripts/work-tracker.js',
    sprint: activeSprintFile ?
      normalizeRelativePath(activeSprintFile) :
      CURRENT_BLOCKER_NO_ACTIVE_SPRINT,
    package: 'none',
    status: 'none',
    lane: 'none',
    scenario: 'none',
    artifact: 'none',
    playback: 'none',
    owner: 'none',
    boundary: 'none',
    dominantReason: 'none',
    currentState: 'No active work package. Start a new package when implementation resumes.',
    nextAction: 'Create or activate one focused package for the next executable concern.',
    proof: [],
    writeScope: [],
    handoffFiles: [],
    generatedFiles: [
      CURRENT_BLOCKER_JSON_PATH,
      CURRENT_BLOCKER_MARKDOWN_PATH,
    ],
    candidateRuntimeFiles: [],
    commitScope: [],
    touchedFiles: [],
    modelFit: {},
    representativeResidual: {},
    causalGovernance: {},
    scenarioCausalClosure: {},
    observablePrediction: {},
    experimentOutcome: {},
    rerunDecision: {},
    classificationEfficiency: {},
    systemTheory: {},
    sliceTheory: {},
    architectureDecisionGate: {},
    predecessor: null,
    theoryLedgerRefs: [],
  };
}

function formatMarkdownList(values) {
  if (!Array.isArray(values) || values.length === NUM_ZERO) {
    return '1. None recorded';
  }
  return values.map((value, index) => `${index + NUM_ONE}. \`${value}\``).join(NEWLINE);
}

function firstCurrentBlockerValue(values = []) {
  return values
    .map((value) => normalizeLedgerText(value))
    .find((value) => value.length > NUM_ZERO) || DEFAULT_UNKNOWN;
}

function currentBlockerImplementationFiles(payload) {
  const implementationFiles = [
    ...normalizeMetadataStringList(payload.writeScope),
    ...normalizeMetadataStringList(payload.candidateRuntimeFiles),
  ].filter((filePath) =>
    CURRENT_BLOCKER_IMPLEMENTATION_SCOPE_PATTERN.test(filePath));
  return implementationFiles.length > NUM_ZERO ?
    implementationFiles :
    normalizeMetadataStringList(payload.writeScope);
}

function currentBlockerTheoryFocus(payload) {
  return {
    theoryUnderTest: firstCurrentBlockerValue([
      payload.sliceTheory?.selectedSystemTheory,
      payload.causalGovernance?.hypothesis,
      payload.currentState,
    ]),
    causalQuestion: firstCurrentBlockerValue([
      payload.systemTheory?.problemStatement,
      payload.scenarioCausalClosure?.missingCausalEdge,
      payload.dominantReason,
    ]),
    implementationSlice: firstCurrentBlockerValue([
      payload.sliceTheory?.sourceTestContract,
      payload.nextAction,
    ]),
    implementationFiles: currentBlockerImplementationFiles(payload),
    expectedImplementationDelta: firstCurrentBlockerValue([
      payload.sliceTheory?.representativeExpectedMovement,
      payload.causalGovernance?.expectedCausalModelChange,
      payload.scenarioCausalClosure?.expectedObservableTransition,
      payload.observablePrediction?.predicted,
      payload.rerunDecision?.expectedDelta,
    ]),
    falsifyingProbe: firstCurrentBlockerValue([
      payload.sliceTheory?.falsifier,
      payload.scenarioCausalClosure?.missingCausalEdgeProbe,
      payload.causalGovernance?.stopConditionCheck,
      normalizeMetadataStringList(payload.proof)[NUM_ZERO],
    ]),
    stopRule: firstCurrentBlockerValue([
      payload.sliceTheory?.killRule,
      payload.scenarioCausalClosure?.sameFrontierFallback,
      payload.scenarioCausalClosure?.stopCondition,
      payload.architectureDecisionGate?.nextAction,
    ]),
  };
}

function formatArchitectureGateChoices(choices) {
  if (!Array.isArray(choices) || choices.length === NUM_ZERO) {
    return '1. None recorded';
  }
  return choices.map((choice, index) =>
    `${index + NUM_ONE}. \`${choice.id || DEFAULT_UNKNOWN}\` ` +
    `route=\`${choice.route || DEFAULT_UNKNOWN}\` - ` +
    `${choice.summary || DEFAULT_UNKNOWN}`,
  ).join(NEWLINE);
}

function formatSystemTheoryTransitionTable(rows = []) {
  if (!Array.isArray(rows) || rows.length === NUM_ZERO) {
    return '1. None recorded';
  }
  return rows.map((row, index) =>
    `${index + NUM_ONE}. Input \`${row.inputSignal || DEFAULT_UNKNOWN}\` ` +
    `owner \`${row.owner || DEFAULT_UNKNOWN}\`; missing ` +
    `\`${row.missingTransition || DEFAULT_UNKNOWN}\`; expected ` +
    `\`${row.expectedEvidence || DEFAULT_UNKNOWN}\`; falsifier ` +
    `\`${row.falsifier || DEFAULT_UNKNOWN}\`; migration trigger ` +
    `\`${row.migrationTrigger || DEFAULT_UNKNOWN}\``,
  ).join(NEWLINE);
}

function formatTheoryFitScore(score = {}) {
  if (!isObjectRecord(score)) {
    return '1. None recorded';
  }
  return THEORY_FIT_SCORE_FIELDS.map((fieldName, index) =>
    `${index + NUM_ONE}. \`${fieldName}\`: ` +
    `${score[fieldName] || DEFAULT_UNKNOWN}`,
  ).join(NEWLINE);
}

function formatCurrentEdgeCardValue(value) {
  return normalizeLedgerText(value) || DEFAULT_UNKNOWN;
}

function formatCurrentEdgeCardList(values) {
  if (!Array.isArray(values) || values.length === NUM_ZERO) {
    return DEFAULT_UNKNOWN;
  }
  return values
    .map((value) => normalizeLedgerText(value))
    .filter((value) => value.length > NUM_ZERO)
    .join(', ') || DEFAULT_UNKNOWN;
}

function currentEdgeCardFirstFrontier(payload) {
  return formatCurrentEdgeCardValue(
    payload.scenarioCausalClosure?.currentFirstFrontier ||
      payload.representativeResidual?.frontier,
  );
}

function currentEdgeCardCausalOutcome(payload) {
  return formatCurrentEdgeCardValue(
    payload.rerunDecision?.routeCausalOutcome ||
      payload.causalGovernance?.representativeOutcome,
  );
}

function currentEdgeCardExpectedDelta(payload) {
  return formatCurrentEdgeCardValue(
    payload.rerunDecision?.expectedDelta ||
      payload.scenarioCausalClosure?.expectedObservableTransition,
  );
}

function currentEdgeCardForbiddenEdits(payload) {
  return formatCurrentEdgeCardValue(
    payload.scenarioCausalClosure?.handoffInvariant ||
      formatCurrentEdgeCardList(payload.modelFit?.escalationTriggers || []),
  );
}

function currentEdgeCardIsTheoryLoop(payload) {
  return normalizeLedgerText(payload?.representativeResidual?.status) ===
    'active-theory-loop' ||
    normalizeLedgerText(payload?.theoryLoop?.[
      THEORY_LOOP_ENFORCEMENT_FIELD
    ]) === THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE;
}

function currentEdgeCardAllowedStopModes(payload) {
  return currentEdgeCardIsTheoryLoop(payload) ?
    CURRENT_EDGE_CARD_THEORY_LOOP_STOP_MODES :
    CURRENT_EDGE_CARD_ALLOWED_STOP_MODES;
}

export function renderCurrentEdgeCardSection(payload) {
  return [
    CURRENT_EDGE_CARD_HEADING,
    '',
    CURRENT_EDGE_CARD_CODE_FENCE_OPEN,
    `${CURRENT_EDGE_CARD_LABEL_REPRESENTATIVE_ARTIFACT}: ` +
      `${formatCurrentEdgeCardValue(payload.artifact)}`,
    `${CURRENT_EDGE_CARD_LABEL_VISIBLE_FIRST_FRONTIER}: ` +
      `${currentEdgeCardFirstFrontier(payload)}`,
    `${CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE}: ` +
      `${formatCurrentEdgeCardValue(payload.package)}`,
    `${CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE_OWNER}: ` +
      `${formatCurrentEdgeCardValue(payload.owner)}`,
    `${CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE_BOUNDARY}: ` +
      `${formatCurrentEdgeCardValue(payload.boundary)}`,
    `${CURRENT_EDGE_CARD_LABEL_SELECTED_CAUSE}: ` +
      `${formatCurrentEdgeCardValue(payload.dominantReason)}`,
    `${CURRENT_EDGE_CARD_LABEL_REQUIRED_ACTION}: ` +
      `${formatCurrentEdgeCardValue(payload.nextAction)}`,
    'Representative status: ' +
      `${formatCurrentEdgeCardValue(payload.representativeResidual?.status)}`,
    `Causal outcome: ${currentEdgeCardCausalOutcome(payload)}`,
    'Architecture gate: ' +
      `${formatCurrentEdgeCardValue(payload.architectureDecisionGate?.status)} / ` +
      `${formatCurrentEdgeCardValue(payload.architectureDecisionGate?.selectedChoice)}`,
    `Expected delta: ${currentEdgeCardExpectedDelta(payload)}`,
    `Current state: ${formatCurrentEdgeCardValue(payload.currentState)}`,
    `Allowed edits: ${formatCurrentEdgeCardList(payload.writeScope)}`,
    'Candidate runtime files: ' +
      `${formatCurrentEdgeCardList(payload.candidateRuntimeFiles)}`,
    `Forbidden edits: ${currentEdgeCardForbiddenEdits(payload)}`,
    `Required latest proof: ${formatCurrentEdgeCardList(payload.proof)}`,
    `Allowed stop modes: ${currentEdgeCardAllowedStopModes(payload)}`,
    CURRENT_EDGE_CARD_CODE_FENCE_CLOSE,
  ].join(NEWLINE);
}

function insertSectionAfterAnchor(content, anchorSection, nextSection) {
  const anchorIndex = content.indexOf(anchorSection);
  if (anchorIndex < NUM_ZERO) {
    return `${content.trimEnd()}${NEWLINE}${NEWLINE}${nextSection}${NEWLINE}`;
  }
  const insertIndex = anchorIndex + anchorSection.length;
  return [
    content.slice(NUM_ZERO, insertIndex).trimEnd(),
    '',
    nextSection,
    '',
    content.slice(insertIndex).trimStart(),
  ].join(NEWLINE);
}

export function upsertSprintCurrentEdgeCard(content, payload) {
  const nextSection = renderCurrentEdgeCardSection(payload);
  const existingSection = extractCurrentEdgeCardSection(content);
  if (existingSection) {
    return content.replace(existingSection, `${nextSection}${NEWLINE}`);
  }
  const strategySection = extractSprintStrategyBriefSection(content);
  if (strategySection) {
    return insertSectionAfterAnchor(content, strategySection, nextSection);
  }
  return `${content.trimEnd()}${NEWLINE}${NEWLINE}${nextSection}${NEWLINE}`;
}

function currentEdgeCardExpectedFields(payload) {
  return [
    {
      label: CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE,
      reportField: CURRENT_EDGE_CARD_FIELD_PACKAGE,
      value: payload.package,
    },
    {
      label: CURRENT_EDGE_CARD_LABEL_REPRESENTATIVE_ARTIFACT,
      reportField: CURRENT_EDGE_CARD_FIELD_ARTIFACT,
      value: payload.artifact,
    },
    {
      label: CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE_OWNER,
      reportField: CURRENT_EDGE_CARD_FIELD_OWNER,
      value: payload.owner,
    },
    {
      label: CURRENT_EDGE_CARD_LABEL_ACTIVE_PACKAGE_BOUNDARY,
      reportField: CURRENT_EDGE_CARD_FIELD_BOUNDARY,
      value: payload.boundary,
    },
    {
      label: CURRENT_EDGE_CARD_LABEL_SELECTED_CAUSE,
      reportField: CURRENT_EDGE_CARD_FIELD_DOMINANT_REASON,
      value: payload.dominantReason,
    },
    {
      label: CURRENT_EDGE_CARD_LABEL_VISIBLE_FIRST_FRONTIER,
      reportField: CURRENT_EDGE_CARD_FIELD_FRONTIER,
      value: payload.scenarioCausalClosure?.currentFirstFrontier ||
        payload.representativeResidual?.frontier,
    },
    {
      label: CURRENT_EDGE_CARD_LABEL_REQUIRED_ACTION,
      reportField: CURRENT_EDGE_CARD_FIELD_NEXT_ACTION,
      value: payload.nextAction,
    },
  ].filter(({value}) =>
    formatCurrentEdgeCardValue(value) !== DEFAULT_UNKNOWN);
}

function findCurrentEdgeCardField(section, label) {
  const fieldPattern = new RegExp(
    `^${escapeRegExp(label)}:\\s*([^\\n]+)$`,
    'imu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerText(match[NUM_ONE]) : null;
}

export function validateSprintCurrentEdgeCard(content, filePath, payload) {
  const section = extractCurrentEdgeCardSection(content);
  if (!section) {
    return [
      `${filePath}: Current Edge Card section is required for the active ` +
      `scenario sprint; run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
    ];
  }
  const staleFields = currentEdgeCardExpectedFields(payload)
    .filter(({label, value}) => {
      const currentValue = findCurrentEdgeCardField(section, label);
      return currentValue === null ||
        !currentValue.includes(formatCurrentEdgeCardValue(value));
    })
    .map(({reportField}) => reportField);
  if (staleFields.length === NUM_ZERO) {
    return [];
  }
  return [
    `${filePath}: Current Edge Card is stale for fields: ` +
    `${staleFields.join(', ')}; run ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
  ];
}

function validateLegacyCurrentNextActionSection(content, filePath) {
  if (!extractLegacyCurrentNextActionSection(content)) {
    return [];
  }
  return [
    `${filePath}: active sprints must not keep a separate Current Next ` +
    `Action section; use Current Edge Card and ${CURRENT_BLOCKER_REPAIR_COMMAND}.`,
  ];
}

export function renderCurrentBlockerMarkdown(payload) {
  const theoryFocus = currentBlockerTheoryFocus(payload);
  const classificationEfficiency = isObjectRecord(
    payload.classificationEfficiency,
  ) ? payload.classificationEfficiency : null;
  const classificationEfficiencyLines = classificationEfficiency ? [
    '## Classification Efficiency',
    '',
    'Default mode: ' +
      `\`${classificationEfficiency.defaultMode || DEFAULT_UNKNOWN}\``,
    '',
    'Separate package reason: ' +
      `\`${classificationEfficiency.separatePackageReason ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Artifact budget: ' +
      `\`${classificationEfficiency.artifactBudget || DEFAULT_UNKNOWN}\``,
    '',
    'Proof command budget: ' +
      `\`${classificationEfficiency.proofCommandBudget ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Commands:',
    '',
    formatMarkdownList(classificationEfficiency.commands || []),
    '',
    'Decision record: ' +
      `\`${classificationEfficiency.decisionRecord || DEFAULT_UNKNOWN}\``,
    '',
    'Successor action: ' +
      `\`${classificationEfficiency.successorAction || DEFAULT_UNKNOWN}\``,
    '',
    'Runtime promotion rule: ' +
      `\`${classificationEfficiency.runtimePromotionRule ||
        DEFAULT_UNKNOWN}\``,
    '',
  ] : [];
  return [
    GENERATED_NOTE,
    '',
    '# Current Blocker',
    '',
    CURRENT_BLOCKER_THEORY_SECTION_HEADING,
    '',
    `Theory under test: ${theoryFocus.theoryUnderTest}`,
    '',
    `Causal question: ${theoryFocus.causalQuestion}`,
    '',
    `Implementation slice: ${theoryFocus.implementationSlice}`,
    '',
    'Implementation files:',
    '',
    formatMarkdownList(theoryFocus.implementationFiles),
    '',
    `Expected implementation delta: ${theoryFocus.expectedImplementationDelta}`,
    '',
    `Falsifying probe: ${theoryFocus.falsifyingProbe}`,
    '',
    `Stop rule: ${theoryFocus.stopRule}`,
    '',
    `Sprint: \`${payload.sprint}\``,
    '',
    `Package: \`${payload.package}\``,
    '',
    `Workflow lane: \`${payload.lane || DEFAULT_UNKNOWN}\``,
    '',
    `Scenario: \`${payload.scenario}\``,
    '',
    `Artifact: \`${payload.artifact}\``,
    '',
    `Playback: \`${payload.playback}\``,
    '',
    '## Boundary',
    '',
    `Owner: \`${payload.owner}\``,
    '',
    `Boundary: \`${payload.boundary}\``,
    '',
    `Dominant reason: \`${payload.dominantReason}\``,
    '',
    `Current state: ${payload.currentState}`,
    '',
    '## Next Action',
    '',
    payload.nextAction,
    '',
    '## Proof Ladder',
    '',
    formatMarkdownList(payload.proof),
    '',
    '## Model Fit',
    '',
    `Package class: \`${payload.modelFit?.packageClass || DEFAULT_UNKNOWN}\``,
    '',
    'Intended minimum model: ' +
      `\`${payload.modelFit?.intendedMinimumModel || DEFAULT_UNKNOWN}\``,
    '',
    `Scope shape: \`${payload.modelFit?.scopeShape || DEFAULT_UNKNOWN}\``,
    '',
    `Output profile: \`${payload.modelFit?.outputProfile || DEFAULT_UNKNOWN}\``,
    '',
    'Escalation triggers:',
    '',
    formatMarkdownList(payload.modelFit?.escalationTriggers || []),
    '',
    '## System Theory',
    '',
    'Problem statement: ' +
      `${payload.systemTheory?.problemStatement || DEFAULT_UNKNOWN}`,
    '',
    'Phase chain:',
    '',
    formatMarkdownList(payload.systemTheory?.phaseChain || []),
    '',
    'Owner-boundary map:',
    '',
    formatMarkdownList(payload.systemTheory?.ownerBoundaryMap || []),
    '',
    'Stable facts:',
    '',
    formatMarkdownList(payload.systemTheory?.stableFacts || []),
    '',
    'Changed facts:',
    '',
    formatMarkdownList(payload.systemTheory?.changedFacts || []),
    '',
    'Competing theories:',
    '',
    formatMarkdownList(payload.systemTheory?.competingTheories || []),
    '',
    'Eliminated theories:',
    '',
    formatMarkdownList(payload.systemTheory?.eliminatedTheories || []),
    '',
    'Downstream symptoms:',
    '',
    formatMarkdownList(payload.systemTheory?.downstreamSymptoms || []),
    '',
    'Transition table:',
    '',
    formatSystemTheoryTransitionTable(payload.systemTheory?.transitionTable || []),
    '',
    'Ownership migration triggers:',
    '',
    formatMarkdownList(payload.systemTheory?.ownershipMigrationTriggers || []),
    '',
    'Architecture-gap triggers:',
    '',
    formatMarkdownList(payload.systemTheory?.architectureGapTriggers || []),
    '',
    'Whole-system invariant: ' +
      `${payload.systemTheory?.wholeSystemInvariant || DEFAULT_UNKNOWN}`,
    '',
    '## Slice Theory',
    '',
    'System theory reference: ' +
      `${payload.sliceTheory?.systemTheoryRef || DEFAULT_UNKNOWN}`,
    '',
    'Selected system theory: ' +
      `${payload.sliceTheory?.selectedSystemTheory || DEFAULT_UNKNOWN}`,
    '',
    'Selected mechanism: ' +
      `${payload.sliceTheory?.selectedMechanism || DEFAULT_UNKNOWN}`,
    '',
    'Source/test contract: ' +
      `${payload.sliceTheory?.sourceTestContract || DEFAULT_UNKNOWN}`,
    '',
    'Falsifier: ' +
      `${payload.sliceTheory?.falsifier || DEFAULT_UNKNOWN}`,
    '',
    'Representative expected movement: ' +
      `${payload.sliceTheory?.representativeExpectedMovement || DEFAULT_UNKNOWN}`,
    '',
    'Kill rule: ' +
      `${payload.sliceTheory?.killRule || DEFAULT_UNKNOWN}`,
    '',
    'Theory-fit score:',
    '',
    formatTheoryFitScore(payload.sliceTheory?.theoryFitScore || {}),
    '',
    'Wrong-slice triggers:',
    '',
    formatMarkdownList(payload.sliceTheory?.wrongSliceTriggers || []),
    '',
    '## Theory Ledger References',
    '',
    formatMarkdownList(payload.theoryLedgerRefs || []),
    '',
    '## Representative Residual',
    '',
    `Status: \`${payload.representativeResidual?.status || DEFAULT_UNKNOWN}\``,
    '',
    `Scenario: \`${payload.representativeResidual?.scenario || DEFAULT_UNKNOWN}\``,
    '',
    `Artifact: \`${payload.representativeResidual?.artifact || DEFAULT_UNKNOWN}\``,
    '',
    `Frontier: \`${payload.representativeResidual?.frontier || DEFAULT_UNKNOWN}\``,
    '',
    `Owner: \`${payload.representativeResidual?.owner || DEFAULT_UNKNOWN}\``,
    '',
    `Boundary: \`${payload.representativeResidual?.boundary || DEFAULT_UNKNOWN}\``,
    '',
    'Dominant reason: ' +
      `\`${payload.representativeResidual?.dominantReason || DEFAULT_UNKNOWN}\``,
    '',
    'Next action: ' +
      `\`${payload.representativeResidual?.nextAction || DEFAULT_UNKNOWN}\``,
    '',
    '## Causal Governance',
    '',
    'Causal hypothesis: ' +
      `\`${payload.causalGovernance?.hypothesis || DEFAULT_UNKNOWN}\``,
    '',
    'Stop-condition check: ' +
      `\`${payload.causalGovernance?.stopConditionCheck || DEFAULT_UNKNOWN}\``,
    '',
    'Expected causal-model change: ' +
      `\`${payload.causalGovernance?.expectedCausalModelChange || DEFAULT_UNKNOWN}\``,
    '',
    'Representative outcome: ' +
      `\`${payload.causalGovernance?.representativeOutcome || DEFAULT_UNKNOWN}\``,
    '',
    'Causal debt: ' +
      `\`${payload.causalGovernance?.causalDebt || DEFAULT_UNKNOWN}\``,
    '',
    'Cross-boundary review: ' +
      `\`${payload.causalGovernance?.crossBoundaryReview || DEFAULT_UNKNOWN}\``,
    '',
    '## Scenario Causal Closure',
    '',
    'Reference scenario/probe: ' +
      `\`${payload.scenarioCausalClosure?.referenceScenarioOrProbe || DEFAULT_UNKNOWN}\``,
    '',
    'Phase chain:',
    '',
    formatMarkdownList(payload.scenarioCausalClosure?.phaseChain || []),
    '',
    'Current first frontier: ' +
      `\`${payload.scenarioCausalClosure?.currentFirstFrontier || DEFAULT_UNKNOWN}\``,
    '',
    'Known downstream blockers:',
    '',
    formatMarkdownList(
      payload.scenarioCausalClosure?.knownDownstreamBlockers || [],
    ),
    '',
    'Missing causal edge: ' +
      `\`${payload.scenarioCausalClosure?.missingCausalEdge || DEFAULT_UNKNOWN}\``,
    '',
    'Missing causal edge probe: ' +
      `\`${payload.scenarioCausalClosure?.missingCausalEdgeProbe ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Bounded progress proof: ' +
      `\`${payload.scenarioCausalClosure?.boundedProgressProof || DEFAULT_UNKNOWN}\``,
    '',
    'Bounded progress proof artifact: ' +
      `\`${payload.scenarioCausalClosure?.boundedProgressProofArtifact ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Expected observable transition: ' +
      `\`${payload.scenarioCausalClosure?.expectedObservableTransition ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Max progress bound: ' +
      `\`${payload.scenarioCausalClosure?.maxProgressBound || DEFAULT_UNKNOWN}\``,
    '',
    'Same-frontier fallback: ' +
      `\`${payload.scenarioCausalClosure?.sameFrontierFallback ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Expected next frontier: ' +
      `\`${payload.scenarioCausalClosure?.expectedNextFrontier || DEFAULT_UNKNOWN}\``,
    '',
    'Result classification: ' +
      `\`${payload.scenarioCausalClosure?.resultClassification || DEFAULT_UNKNOWN}\``,
    '',
    'Stop condition: ' +
      `\`${payload.scenarioCausalClosure?.stopCondition || DEFAULT_UNKNOWN}\``,
    '',
    'Recent frontier history:',
    '',
    formatMarkdownList(
      payload.scenarioCausalClosure?.recentFrontierHistory || [],
    ),
    '',
    'Oscillation check: ' +
      `\`${payload.scenarioCausalClosure?.oscillationCheck || DEFAULT_UNKNOWN}\``,
    '',
    'Handoff invariant: ' +
      `\`${payload.scenarioCausalClosure?.handoffInvariant || DEFAULT_UNKNOWN}\``,
    '',
    '## Observable Prediction',
    '',
    `Metric: \`${payload.observablePrediction?.metric || DEFAULT_UNKNOWN}\``,
    '',
    `Predicted: \`${payload.observablePrediction?.predicted || DEFAULT_UNKNOWN}\``,
    '',
    `Observed: \`${payload.observablePrediction?.observed || DEFAULT_UNKNOWN}\``,
    '',
    `Accuracy: \`${payload.observablePrediction?.accuracy || DEFAULT_UNKNOWN}\``,
    '',
    `Evidence: \`${payload.observablePrediction?.evidence || DEFAULT_UNKNOWN}\``,
    '',
    `Metric delta: \`${payload.observablePrediction?.metricDelta ?? DEFAULT_UNKNOWN}\``,
    '',
    '## Experiment Outcome',
    '',
    `Distinguished hypothesis: \`${payload.experimentOutcome?.distinguishedHypothesis || DEFAULT_UNKNOWN}\``,
    '',
    `Decision: \`${payload.experimentOutcome?.decision || DEFAULT_UNKNOWN}\``,
    '',
    `Next owner: \`${payload.experimentOutcome?.nextOwner || DEFAULT_UNKNOWN}\``,
    '',
    `Next boundary: \`${payload.experimentOutcome?.nextBoundary || DEFAULT_UNKNOWN}\``,
    '',
    `Evidence: \`${payload.experimentOutcome?.evidence || DEFAULT_UNKNOWN}\``,
    '',
    '## Rerun Decision',
    '',
    `Source artifact: \`${payload.rerunDecision?.sourceArtifact || DEFAULT_UNKNOWN}\``,
    '',
    `Route owner: \`${payload.rerunDecision?.routeOwner || DEFAULT_UNKNOWN}\``,
    '',
    `Route boundary: \`${payload.rerunDecision?.routeBoundary || DEFAULT_UNKNOWN}\``,
    '',
    'Route dominant reason: ' +
      `\`${payload.rerunDecision?.routeDominantReason || DEFAULT_UNKNOWN}\``,
    '',
    'Route causal outcome: ' +
      `\`${payload.rerunDecision?.routeCausalOutcome || DEFAULT_UNKNOWN}\``,
    '',
    `Stop mode: \`${payload.rerunDecision?.stopMode || DEFAULT_UNKNOWN}\``,
    '',
    `Next lane: \`${payload.rerunDecision?.nextLane || DEFAULT_UNKNOWN}\``,
    '',
    'Expected delta: ' +
      `\`${payload.rerunDecision?.expectedDelta || DEFAULT_UNKNOWN}\``,
    '',
    'Required refresh commands:',
    '',
    formatMarkdownList(
      payload.rerunDecision?.requiredRefreshCommands || [],
    ),
    '',
    ...classificationEfficiencyLines,
    '## Architecture Decision Gate',
    '',
    `Status: \`${payload.architectureDecisionGate?.status || DEFAULT_UNKNOWN}\``,
    '',
    `Trigger: \`${payload.architectureDecisionGate?.trigger || DEFAULT_UNKNOWN}\``,
    '',
    'Trigger evidence:',
    '',
    formatMarkdownList(payload.architectureDecisionGate?.triggerEvidence || []),
    '',
    'Choices:',
    '',
    formatArchitectureGateChoices(payload.architectureDecisionGate?.choices || []),
    '',
    'Selected choice: ' +
      `\`${payload.architectureDecisionGate?.selectedChoice || DEFAULT_UNKNOWN}\``,
    '',
    'Gate next action: ' +
      `${payload.architectureDecisionGate?.nextAction || DEFAULT_UNKNOWN}`,
    '',
    '## Scope',
    '',
    'Write scope:',
    '',
    formatMarkdownList(payload.writeScope),
    '',
    'Handoff files:',
    '',
    formatMarkdownList(payload.handoffFiles),
    '',
    'Generated files:',
    '',
    formatMarkdownList(payload.generatedFiles),
    '',
    'Candidate runtime files:',
    '',
    formatMarkdownList(payload.candidateRuntimeFiles),
    '',
    'Commit scope:',
    '',
    formatMarkdownList(payload.commitScope),
    '',
    'Legacy touched files:',
    '',
    formatMarkdownList(payload.touchedFiles),
    '',
  ].join(NEWLINE);
}

async function currentBlockerCommand(args) {
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    const payload = buildNoActiveCurrentBlockerPayload(activeSprintFile);
    const jsonContent = `${JSON.stringify(payload, null, NUM_TWO)}${NEWLINE}`;
    const markdownContent = renderCurrentBlockerMarkdown(payload);
    if (args.includes(CLI_FLAG_WRITE)) {
      await writeTextFile(CURRENT_BLOCKER_JSON_PATH, jsonContent);
      await writeTextFile(CURRENT_BLOCKER_MARKDOWN_PATH, markdownContent);
      console.log(
        `Updated ${CURRENT_BLOCKER_JSON_PATH}, ${CURRENT_BLOCKER_MARKDOWN_PATH}.`,
      );
      return;
    }
    console.log(jsonContent);
    return;
  }
  await assertResolvableActivePackage(activeSprintFile, activePackageFile);
  const packageContent = await readTextFile(activePackageFile);
  const metadata = parsePackageMetadata(
    packageContent,
    normalizeRelativePath(activePackageFile),
  );
  if (!metadata) {
    throw new Error(
      `${normalizeRelativePath(activePackageFile)} has no work-package metadata.`,
    );
  }
  const relativePackagePath = normalizeRelativePath(activePackageFile);
  const packageHistoryEntries = await collectPackageHistoryEntries();
  const generationErrors = [
    ...validatePackageMetadataShape(relativePackagePath, STATUS_ACTIVE, metadata),
    ...validateCausalGovernanceContract(metadata, relativePackagePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]: isScenarioDrivenMetadata(metadata),
      status: STATUS_ACTIVE,
    }),
    ...validateScenarioCausalClosureContract(metadata, relativePackagePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]: isScenarioDrivenMetadata(metadata),
      status: STATUS_ACTIVE,
    }),
    ...validateTwoLevelTheoryContract(metadata, relativePackagePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        metadataRequiresTwoLevelTheory(
          metadata,
          STATUS_ACTIVE,
          VALIDATION_PHASE_PRE_IMPL,
        ),
      status: STATUS_ACTIVE,
      phase: VALIDATION_PHASE_PRE_IMPL,
    }),
  ];
  if (generationErrors.length > NUM_ZERO) {
    throw new Error(generationErrors.join(NEWLINE));
  }
  const payload = buildCurrentBlockerPayload(
    activeSprintFile,
    activePackageFile,
    metadata,
    {packageHistoryEntries},
  );
  const jsonContent = `${JSON.stringify(payload, null, NUM_TWO)}${NEWLINE}`;
  const markdownContent = renderCurrentBlockerMarkdown(payload);
  if (args.includes(CLI_FLAG_WRITE)) {
    await writeTextFile(CURRENT_BLOCKER_JSON_PATH, jsonContent);
    await writeTextFile(CURRENT_BLOCKER_MARKDOWN_PATH, markdownContent);
    const updatedPaths = [
      CURRENT_BLOCKER_JSON_PATH,
      CURRENT_BLOCKER_MARKDOWN_PATH,
    ];
    if (activeSprintFile) {
      const sprintContent = await readTextFile(activeSprintFile);
      const nextSprintContent = upsertSprintCurrentEdgeCard(
        sprintContent,
        payload,
      );
      if (nextSprintContent !== sprintContent) {
        await writeTextFile(activeSprintFile, nextSprintContent);
        updatedPaths.push(normalizeRelativePath(activeSprintFile));
      }
    }
    console.log(
      `Updated ${updatedPaths.join(', ')}.`,
    );
    return;
  }
  console.log(jsonContent);
}

async function repairCommand() {
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (activePackageFile) {
    const content = await readTextFile(activePackageFile);
    const relativePackagePath = normalizeRelativePath(activePackageFile);
    let metadata = null;
    try {
      metadata = parsePackageMetadata(content, relativePackagePath);
    } catch (err) {
      console.warn(`Warning: Could not parse metadata for ${activePackageFile} to auto-heal schema: ${err.message}`);
    }

    if (metadata) {
      let modified = false;

      // 1. Auto-heal basic schema constraints
      if (metadata.schema !== 'work-package-v1' && metadata.schema !== 'work-package-v2') {
        metadata.schema = WORK_PACKAGE_METADATA_SCHEMA;
        modified = true;
      }
      if (!metadata.opened) {
        metadata.opened = new Date().toISOString().slice(0, 10);
        modified = true;
      }

      // Initialize missing scope arrays
      for (const scopeField of [
        SCOPE_FIELD_WRITE_SCOPE,
        SCOPE_FIELD_HANDOFF_FILES,
        SCOPE_FIELD_GENERATED_FILES,
        SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
        SCOPE_FIELD_COMMIT_SCOPE,
        THEORY_LEDGER_REFS_FIELD,
      ]) {
        if (metadata[scopeField] === undefined) {
          metadata[scopeField] = [];
          modified = true;
        } else if (!Array.isArray(metadata[scopeField])) {
          metadata[scopeField] = [metadata[scopeField]];
          modified = true;
        }
      }

      // Populate stabilityCredit / whyHighestLeverageNow defaults
      const isNewPackage = metadata.opened && metadata.opened >= '2026-05-22';
      if (isNewPackage) {
        if (metadata.stabilityCredit === undefined) {
          metadata.stabilityCredit = 'local-proof-only';
          modified = true;
        }
        if (metadata.lane !== LANE_READ_REVIEW_DOC_ONLY && metadata.whyHighestLeverageNow === undefined) {
          metadata.whyHighestLeverageNow = 'This package advances the active sprint goal and current first frontier.';
          modified = true;
        }
      }

      // Ambiguity score auto-healing
      if (metadata.modelFit) {
        if (metadata.modelFit.ambiguityScore === undefined) {
          metadata.modelFit.ambiguityScore = 1;
          modified = true;
        }
      }

      // 2. Git status-based autocompletion for writeScope / commitScope
      let gitStatusFiles = [];
      if (metadataAllowsRepairDirtyScopeAutocomplete(metadata)) {
        try {
          const stdout = execSync('git status --porcelain', { encoding: 'utf8' });
          gitStatusFiles = stdout
            .split('\n')
            .map(line => {
              if (line.length < 4) return '';
              let file = line.slice(3).trim();
              if (file.startsWith('"') && file.endsWith('"')) {
                file = file.slice(1, -1);
              }
              return file;
            })
            .filter(Boolean)
            .filter(file => {
              if (file.startsWith('work/packages/')) return false;
              if (file.startsWith('work/sprints/')) return false;
              if (file === 'work/model-ledger.jsonl') return false;
              if (file === 'work/theory-ledger.md') return false;
              if (file === 'package.json' || file === 'package-lock.json') return false;

              if (metadata.lane === 'mechanical-maintenance' && isSourceWritePath(file)) {
                return false;
              }
              if (metadata.lane === 'test-only-proof' && !isTestOnlyProofWritePath(file)) {
                return false;
              }
              if (metadata.lane === 'read-review-doc-only') {
                return false;
              }
              return true;
            });
        } catch (err) {
          // ignore
        }
      }

      if (gitStatusFiles.length > 0) {
        const uniqueWriteScope = [...new Set([...metadata.writeScope, ...gitStatusFiles])];
        if (uniqueWriteScope.length !== metadata.writeScope.length || !uniqueWriteScope.every((v, i) => v === metadata.writeScope[i])) {
          metadata.writeScope = uniqueWriteScope;
          modified = true;
        }
      }

      // Autocomplete commitScope
      const targetCommitScope = [
        ...metadata.writeScope,
        ...metadata.generatedFiles,
        relativePackagePath,
      ];
      const uniqueCommitScope = [...new Set([...metadata.commitScope, ...targetCommitScope])];
      if (uniqueCommitScope.length !== metadata.commitScope.length || !uniqueCommitScope.every((v, i) => v === metadata.commitScope[i])) {
        metadata.commitScope = uniqueCommitScope;
        modified = true;
      }

      if (modified) {
        const newContent = replacePackageMetadata(content, metadata);
        await fs.writeFile(activePackageFile, newContent, 'utf8');
        console.log(`Auto-healed active package metadata and autocompleted scopes in ${activePackageFile}`);
      }
    }
  }

  await currentBlockerCommand([CLI_FLAG_WRITE]);
  const freshnessErrors = await validateCurrentBlockerFreshness();
  if (freshnessErrors.length > NUM_ZERO) {
    throw new Error(freshnessErrors.join(NEWLINE));
  }
}

function buildPackageTargetPath(packagePath, targetStatus) {
  const directoryPath = path.dirname(packagePath);
  const fileName = path.basename(packagePath);
  const currentStatus = getPackageStatusFromPath(packagePath);
  if (!currentStatus) {
    throw new Error(`${packagePath}: invalid package status prefix.`);
  }
  const targetFileName = fileName.replace(`${currentStatus}-`, `${targetStatus}-`);
  return path.join(directoryPath, targetFileName);
}

async function listWorkMarkdownFiles() {
  const packageFiles = await listPackageFiles();
  const sprintFiles = await listSprintFiles();
  const trackFiles = await listTrackFiles();
  return [
    ...packageFiles,
    ...sprintFiles,
    ...trackFiles,
    ...((await pathExists(CURRENT_BLOCKER_MARKDOWN_PATH)) ?
      [CURRENT_BLOCKER_MARKDOWN_PATH] :
      []),
  ];
}

export async function planWorkReferenceRewrites(oldPackagePath, newPackagePath) {
  const oldFileName = path.basename(oldPackagePath);
  const files = await listWorkMarkdownFiles();
  const oldRelativePath = normalizeRelativePath(oldPackagePath);
  const newRelativePath = normalizeRelativePath(newPackagePath);
  const rewriteFiles = [];
  for (const filePath of files) {
    const relativePath = normalizeRelativePath(filePath);
    if (relativePath === oldRelativePath || relativePath === newRelativePath) {
      continue;
    }
    const content = await readTextFile(filePath);
    if (!content.includes(oldFileName)) {
      continue;
    }
    rewriteFiles.push(filePath);
  }
  return rewriteFiles;
}

function normalizeScopePaths(paths = []) {
  return paths.map((filePath) =>
    normalizeRelativePath(path.resolve(process.cwd(), filePath)));
}

export async function validateReferenceRewriteScope(
  rewriteFiles,
  metadata,
  packagePath,
  targetPath,
) {
  const allowed = new Set([
    normalizeRelativePath(packagePath),
    normalizeRelativePath(targetPath),
    CURRENT_BLOCKER_MARKDOWN_PATH,
    ...normalizeScopePaths(metadata?.writeScope || []),
    ...normalizeScopePaths(metadata?.generatedFiles || []),
    ...normalizeScopePaths(metadata?.commitScope || []),
  ]);
  try {
    const activeSprintFile = await findActiveSprintFile();
    if (activeSprintFile) {
      allowed.add(normalizeRelativePath(activeSprintFile));
    }
  } catch {
    // Package moves can still be scoped safely in repos without an active sprint.
  }

  const outsideScope = rewriteFiles
    .map((filePath) => normalizeRelativePath(filePath))
    .filter((filePath) => !allowed.has(filePath));
  if (outsideScope.length > NUM_ZERO) {
    throw new Error(
      'Package move would rewrite references outside target package scope: ' +
        outsideScope.join(', ') +
        '. Add these files to writeScope/commitScope or split the reference update.',
    );
  }
}

async function rewriteWorkReferences(oldPackagePath, newPackagePath, rewriteFiles) {
  const oldFileName = path.basename(oldPackagePath);
  const newFileName = path.basename(newPackagePath);
  for (const filePath of rewriteFiles) {
    const content = await readTextFile(filePath);
    await writeTextFile(filePath, content.split(oldFileName).join(newFileName));
  }
}

async function validateMigrationSuccessorPackage(successorPath) {
  if (!successorPath) {
    return null;
  }
  const successorFile = normalizeCliPath(successorPath);
  const relativeSuccessorPath = normalizeRelativePath(successorFile);
  if (getPackageStatusFromPath(successorFile) !== STATUS_ACTIVE) {
    throw new Error(
      `${relativeSuccessorPath}: migration successor must be an active-* package.`,
    );
  }
  if (!(await pathExists(successorFile))) {
    throw new Error(
      `${relativeSuccessorPath}: migration successor package does not exist.`,
    );
  }
  const successorContent = await readTextFile(successorFile);
  const successorMetadata = parsePackageMetadata(
    successorContent,
    relativeSuccessorPath,
  );
  if (!successorMetadata) {
    throw new Error(
      `${relativeSuccessorPath}: migration successor has no work-package metadata.`,
    );
  }
  return {
    filePath: successorFile,
    metadata: successorMetadata,
  };
}

async function upsertSuccessorCurrentEdgeCard(successorPackage) {
  if (!successorPackage) {
    return false;
  }
  const activeSprintFile = await findActiveSprintFile();
  if (!activeSprintFile) {
    return false;
  }
  const payload = buildCurrentBlockerPayload(
    activeSprintFile,
    successorPackage.filePath,
    successorPackage.metadata,
    {packageHistoryEntries: await collectPackageHistoryEntries()},
  );
  const sprintContent = await readTextFile(activeSprintFile);
  const nextSprintContent = upsertSprintCurrentEdgeCard(sprintContent, payload);
  if (nextSprintContent === sprintContent) {
    return false;
  }
  await writeTextFile(activeSprintFile, nextSprintContent);
  return true;
}

async function regenerateCurrentBlockerWhenActivePackageExists() {
  const activeSprintFile = await findActiveSprintFile();
  if (!activeSprintFile) {
    return false;
  }
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    return false;
  }
  await currentBlockerCommand([CLI_FLAG_WRITE]);
  return true;
}

function validationPhaseForTargetStatus(targetStatus) {
  return targetStatus === STATUS_DONE || targetStatus === STATUS_SUPERSEDED ?
    VALIDATION_PHASE_CLOSURE :
    VALIDATION_PHASE_PRE_IMPL;
}

async function writeValidatedMovedPackage(
  packagePath,
  targetPath,
  nextContent,
  targetStatus,
) {
  if (await pathExists(targetPath)) {
    throw new Error(`${normalizeRelativePath(targetPath)} already exists.`);
  }
  await writeTextFile(targetPath, nextContent);
  const validation = await validatePackageFile(targetPath, {
    phase: validationPhaseForTargetStatus(targetStatus),
    enforceClosureSubagentLedger:
      targetStatus === STATUS_DONE || targetStatus === STATUS_SUPERSEDED,
    packageHistoryEntries: await collectPackageHistoryEntries(),
    theoryLedgerContext: await readTheoryLedgerContext(),
  });
  if (validation.errors.length > NUM_ZERO) {
    await fs.rm(targetPath, {force: true});
    throw new Error(validation.errors.join(NEWLINE));
  }
  await fs.unlink(packagePath);
}

function resolveGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim();
    let branch = '';
    try {
      const upstream = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {encoding: 'utf8'}).trim();
      if (upstream && upstream !== '@{u}') {
        branch = upstream;
      }
    } catch {
      // fallback
    }
    if (!branch) {
      const localBranch = execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf8'}).trim();
      branch = `origin/${localBranch}`;
    }
    return {commit, branch};
  } catch (err) {
    throw new Error('Git repository info could not be resolved: ' + err.message);
  }
}

function autoPopulateCommitLedgerInMarkdown(content) {
  const ledger = extractCommitAndPushLedger(content);
  if (!ledger) {
    return content;
  }
  const {commit, branch} = resolveGitInfo();
  const heading = COMMIT_AND_PUSH_LEDGER_HEADINGS.find(h => content.includes(h));
  if (!heading) {
    return content;
  }
  const reconstructedLedger = [
    heading,
    '',
    `1. ${COMMIT_LEDGER_COMMIT_LABEL}: ${commit}`,
    `2. ${COMMIT_LEDGER_PUSH_TARGET_LABEL}: ${branch}`,
    `3. ${COMMIT_LEDGER_FOCUSED_SLICE_LABEL}: yes`,
    `4. ${COMMIT_LEDGER_PUSHED_BOOLEAN_LABEL}: no`,
    ''
  ].join(NEWLINE);
  const headingPattern = new RegExp(
    `(^|${NEWLINE})${escapeRegExp(heading)}(?:${NEWLINE}|$)`,
    'u',
  );
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch) {
    return content;
  }
  const headingIndex = headingMatch.index +
    (headingMatch[NUM_ONE] === NEWLINE ? NUM_ONE : NUM_ZERO);
  const nextHeadingIndex = content.indexOf(
    `${NEWLINE}${MARKDOWN_LEVEL_TWO_HEADING_PREFIX}`,
    headingIndex + heading.length,
  );
  if (nextHeadingIndex < NUM_ZERO) {
    return content.slice(NUM_ZERO, headingIndex) + reconstructedLedger;
  } else {
    return content.slice(NUM_ZERO, headingIndex) + reconstructedLedger + content.slice(nextHeadingIndex);
  }
}

async function movePackageCommand(args, fallbackTargetStatus, requiresSuccessor) {
  const packageArg = args.find((arg) => !arg.startsWith('--'));
  if (!packageArg) {
    throw new Error('Package path is required.');
  }
  const targetStatus = parseTargetStatus(args, fallbackTargetStatus);
  if (!targetStatus) {
    throw new Error('A valid target status is required.');
  }
  const packagePath = normalizeCliPath(packageArg);
  const content = await readTextFile(packagePath);
  if (
    (targetStatus === STATUS_DONE || targetStatus === STATUS_SUPERSEDED) &&
    hasOpenChecklist(content)
  ) {
    throw new Error(
      `${normalizeRelativePath(packagePath)} still has open checklist items.`,
    );
  }
  const successor =
    parseOptionValue(args, CLI_FLAG_SUCCESSOR) ||
    (requiresSuccessor ? args.filter((arg) => !arg.startsWith('--'))[NUM_ONE] : null);
  if (requiresSuccessor && !successor) {
    throw new Error('A successor package path is required for migration.');
  }
  const targetPath = buildPackageTargetPath(packagePath, targetStatus);
  const metadata = parsePackageMetadata(content, normalizeRelativePath(packagePath));
  const targetMetadata = metadata ? {
    ...metadata,
    status: targetStatus,
    ...(targetStatus === STATUS_DONE || targetStatus === STATUS_SUPERSEDED ?
      {closed: metadata.closed || new Date().toISOString().slice(
        NUM_ZERO,
        DATE_SLICE_END,
      ),
      [METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED]: true} :
      {}),
  } : null;
  const successorPath = successor ? normalizeRelativePath(normalizeCliPath(successor)) : null;
  if (successorPath && targetMetadata) {
    targetMetadata.successor = successorPath;
  }
  if (targetStatus === STATUS_DONE && targetMetadata) {
    const closureSummaryErrors = validateClosureSummaryMetadata(
      normalizeRelativePath(targetPath),
      targetMetadata,
      {
        requires: true,
        phase: VALIDATION_PHASE_CLOSURE,
        status: targetStatus,
      },
    );
    if (closureSummaryErrors.length > NUM_ZERO) {
      throw new Error(closureSummaryErrors.join(NEWLINE));
    }
  }
  const migrationSuccessor = requiresSuccessor ?
    await validateMigrationSuccessorPackage(successorPath) :
    null;
  const referenceRewritePlan = await planWorkReferenceRewrites(
    packagePath,
    targetPath,
  );
  if (!args.includes(CLI_FLAG_WRITE)) {
    console.log(
      `Dry run: ${normalizeRelativePath(packagePath)} -> ${normalizeRelativePath(targetPath)}`,
    );
    if (referenceRewritePlan.length > NUM_ZERO) {
      console.log('Reference rewrites:');
      for (const filePath of referenceRewritePlan) {
        console.log(`- ${normalizeRelativePath(filePath)}`);
      }
    }
    if (successorPath) {
      console.log(`Successor: ${successorPath}`);
    }
    return;
  }
  await validateReferenceRewriteScope(
    referenceRewritePlan,
    targetMetadata,
    packagePath,
    targetPath,
  );
  let nextContent = metadata ?
    replacePackageMetadata(content, targetMetadata) :
    content;
  if (targetStatus === STATUS_DONE || targetStatus === STATUS_SUPERSEDED) {
    nextContent = autoPopulateCommitLedgerInMarkdown(nextContent);
  }
  if (args.includes(CLI_FLAG_TRANSACTION)) {
    await writeValidatedMovedPackage(
      packagePath,
      targetPath,
      nextContent,
      targetStatus,
    );
  } else {
    if (metadata) {
      await writeTextFile(packagePath, nextContent);
    }
    await fs.rename(packagePath, targetPath);
  }
  await rewriteWorkReferences(packagePath, targetPath, referenceRewritePlan);
  if (args.includes(CLI_FLAG_TRANSACTION)) {
    await upsertSuccessorCurrentEdgeCard(migrationSuccessor);
    const regenerated = await regenerateCurrentBlockerWhenActivePackageExists();
    if (regenerated) {
      const freshnessErrors = await validateCurrentBlockerFreshness();
      if (freshnessErrors.length > NUM_ZERO) {
        throw new Error(freshnessErrors.join(NEWLINE));
      }
    }
  }
  console.log(
    `Moved ${normalizeRelativePath(packagePath)} to ${normalizeRelativePath(targetPath)}.`,
  );
}

async function main() {
  const rawArgs = process.argv.slice(2);
  let command = null;
  const args = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--kind') {
      i++;
    } else if (rawArgs[i] === '--dry-run') {
      // skip
    } else {
      if (!command && !rawArgs[i].startsWith('-') && !rawArgs[i].includes('work/packages/')) {
        command = rawArgs[i];
      } else {
        args.push(rawArgs[i]);
      }
    }
  }

  if ((globalKindOption || globalDryRunOption) && !command) {
    command = CLI_COMMAND_VALIDATE;
  }

  try {
    if (command === CLI_COMMAND_VALIDATE) {
      await validateCommand(args);
      return;
    }
    if (command === CLI_COMMAND_DOCTOR) {
      await doctorCommand(args);
      return;
    }
    if (command === CLI_COMMAND_CURRENT_BLOCKER) {
      await currentBlockerCommand(args);
      return;
    }
    if (command === CLI_COMMAND_REPAIR) {
      await repairCommand();
      return;
    }
    if (command === CLI_COMMAND_CLOSE) {
      await movePackageCommand(args, STATUS_DONE, false);
      return;
    }
    if (command === CLI_COMMAND_MIGRATE) {
      await movePackageCommand(args, STATUS_DONE, true);
      return;
    }
    if (command === CLI_COMMAND_MOVE) {
      await movePackageCommand(args, null, false);
      return;
    }
    printUsage();
    process.exit(command ? EXIT_FAILURE : EXIT_SUCCESS);
  } catch (error) {
    console.error(error.message);
    process.exit(EXIT_FAILURE);
  }
}

if (process.argv[NUM_ONE] === fileURLToPath(import.meta.url)) {
  await main();
}
