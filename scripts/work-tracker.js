#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
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
  CORE_LOGIC_BRIEF_FIELDS,
  LANE_CAUSAL_ESCALATION,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_RUNTIME_OWNER_BOUNDARY,
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
  SUBAGENT_ATTEMPT_STATUSES,
  SUBAGENT_OPTIONAL_LANES,
  SUBAGENT_UNAVAILABLE_STATES,
  VALID_PACKAGE_STATUSES,
  VALID_OUTPUT_PROFILES,
  VALIDATION_PHASE_CLOSURE,
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PRE_IMPL,
  VALIDATION_PHASES,
  WORK_PACKAGE_METADATA_SCHEMA,
  coreLogicBriefRequiredForLane,
} from './work-package-schema.js';

const [
  CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD,
  CORE_LOGIC_BRIEF_INPUTS_FIELD,
  CORE_LOGIC_BRIEF_MODEL_FIELD,
  CORE_LOGIC_BRIEF_NON_GOALS_FIELD,
  CORE_LOGIC_BRIEF_PROOF_FIELD,
  CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD,
] = CORE_LOGIC_BRIEF_FIELDS;

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const NUM_FOUR = 4;
const NUM_FIVE = 5;
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
const CURRENT_BLOCKER_REPAIR_COMMAND =
  'npm run work:current-blocker -- --write';
const CURRENT_BLOCKER_STALE_FIELD_LIMIT = 8;
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
const ACTIVE_WORK_REFERENCE_PATTERN =
  /\b((?:work\/(?:packages|sprints)|(?:\.\.\/|\.\/)(?:packages|sprints))\/active-[A-Za-z0-9._-]+\.md)\b/gu;
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
const SPRINT_STRATEGY_BRIEF_HEADING = '## Sprint Strategy Brief';
const CURRENT_EDGE_CARD_HEADING = '## Current Edge Card';
const LEGACY_CURRENT_NEXT_ACTION_HEADING = '## Current Next Action';
const CURRENT_EDGE_CARD_CODE_FENCE_OPEN = '```text';
const CURRENT_EDGE_CARD_CODE_FENCE_CLOSE = '```';
const CURRENT_EDGE_CARD_ALLOWED_STOP_MODES =
  'representative-green, migrated, reduced, same-frontier, ' +
  'classification-only, architecture-gap, human-escalation';
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
const COMMIT_LEDGER_PUSHED_LABEL = 'Pushed to';
const COMMIT_LEDGER_FOCUSED_SLICE_LABEL =
  'Commit contains only package-owned files/package-status/allowed sprint handoff';
const MODEL_FIT_PACKAGE_CLASS_LABEL = 'Package class';
const MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL = 'Intended minimum model';
const MODEL_FIT_SCOPE_SHAPE_LABEL = 'Scope shape';
const MODEL_FIT_OUTPUT_PROFILE_LABEL = 'Output profile';
const MODEL_FIT_OWNED_FILES_LABEL = 'Owned files';
const MODEL_FIT_FORBIDDEN_FILES_LABEL = 'Forbidden files';
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
const MODEL_FIT_SPARK_SAFE_CLASS = 'spark-safe';
const MODEL_FIT_SPARK_MODEL = 'gpt-5.3-codex-spark';
const MODEL_FIT_LEAF_SLICE_SCOPE = 'leaf-slice';
const METADATA_FIELD_OPENED = 'opened';
const METADATA_FIELD_CURRENT_STATE = 'currentState';
const METADATA_FIELD_PROOF = 'proof';
const METADATA_FIELD_ARTIFACT = 'artifact';
const METADATA_FIELD_PLAYBACK = 'playback';
const METADATA_FIELD_MODEL_FIT = 'modelFit';
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
const RERUN_DECISION_REQUIRED_COMMAND_PATTERNS = Object.freeze([
  /\bwork:package:route-after-rerun\b/iu,
  /\bSprint Strategy Brief\b/iu,
  /\bCurrent Edge Card\b/iu,
  /\bwork:current-blocker\b/iu,
  /\bwork:validate\b[\s\S]*\bpre-impl\b/iu,
]);
const SAME_FRONTIER_RESULT = 'same-frontier';
const SAME_FRONTIER_ESCALATION_STOP_CONDITIONS = Object.freeze([
  'architecture-gap-stop',
  'human-escalation',
]);
const SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISM_PATTERN =
  /\b(?:wake|retry|timeout|reconcile|drain|dispatch|delivery|timer|advance|bounded)\b/iu;
const SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN = new RegExp(
  '(?:^|[\\s`\'"])(?:[A-Za-z0-9._-]+/[A-Za-z0-9._/@%+=,-]+|' +
    '[A-Za-z0-9._@%+=,-]+\\.(?:json|md|txt|log|tap|js|mjs|cjs))' +
    '(?:$|[\\s`\'".,;])',
  'u',
);
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
  'Present concrete architecture choices to the human before runtime implementation.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_SELECT =
  'Wait for a human-selected architecture route before runtime implementation.';
const ARCHITECTURE_DECISION_GATE_NEXT_ACTION_WATCH =
  'Watch for repeated frontier oscillation and escalate if another local proof returns here.';
const MODEL_FIT_EMPTY_VALUE_PATTERN = /^(?:none|n\/a|na|unknown|tbd|todo)$/iu;
const MODEL_FIT_FOCUSED_PROOF_COMMAND_PATTERN = new RegExp(
  '\\b(?:npm\\s+(?:--silent\\s+)?run|npm\\s+test|' +
    'node(?:\\s+--test)?|tap|rg|git\\s+diff)\\b',
  'iu',
);
const MODEL_FIT_REQUIRED_SPARK_LABELS = Object.freeze([
  MODEL_FIT_OWNED_FILES_LABEL,
  MODEL_FIT_FORBIDDEN_FILES_LABEL,
  MODEL_FIT_FROZEN_DECISIONS_LABEL,
  MODEL_FIT_ESCALATION_TRIGGERS_LABEL,
  MODEL_FIT_FOCUSED_PROOF_LABEL,
]);
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
  /\b(?:current-session|current session|parent\s+codex|manual|local|session|agent\s+codex(?:\s+(?:review|fix|implementation))?|codex\s+(?:review|fix|implementation)(?:\s+(?:agent|subagent|session))?)\b/iu;
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
const CLI_FLAG_PRE_IMPL = '--pre-impl';
const CLI_FLAG_CLOSURE = '--closure';
const CLI_FLAG_TRANSACTION = '--transaction';
const CLI_COMMAND_CURRENT_BLOCKER = 'current-blocker';
const CLI_COMMAND_VALIDATE = 'validate';
const CLI_COMMAND_DOCTOR = 'doctor';
const CLI_COMMAND_CLOSE = 'close';
const CLI_COMMAND_MIGRATE = 'migrate';
const CLI_COMMAND_MOVE = 'move';
const ERROR_NO_ACTIVE_PACKAGE = 'No active work package was found.';
const ERROR_NO_ACTIVE_SPRINT = 'No active sprint file was found.';
const DEFAULT_UNKNOWN = 'unknown';
const DOCTOR_SUGGESTION_NONE =
  'No deterministic suggestions are available for these findings.';
const LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION = 'allowOpenImplementation';
const LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS =
  'allowUnavailableSubagents';
const SUBAGENT_UNAVAILABLE_REASON_PATTERN = /\breason\s*:\s*\S+/iu;
const SUBAGENT_PROGRESS_EVIDENCE_FIELD_PATTERN = /\bevidence\s*:/iu;
const SUBAGENT_PROGRESS_NEXT_OR_BLOCKER_FIELD_PATTERN =
  /\b(?:next|blocker)\s*:/iu;
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
const SUBAGENT_ATTEMPT_PARENT_TERMINAL_ACTIONS = Object.freeze([
  'discarded',
  'revalidated',
  'superseded',
]);

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/work-tracker.js current-blocker [--write]',
    '  node scripts/work-tracker.js validate [--entry|--pre-impl|--closure] [--all] [paths...]',
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

function extractSprintStrategyBriefSection(content) {
  return extractMarkdownLevelTwoSection(
    content,
    SPRINT_STRATEGY_BRIEF_HEADING,
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

function extractCheckedChecklistItems(ledger) {
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
    findCommitLedgerField(ledger, COMMIT_LEDGER_PUSHED_LABEL),
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
  const pushedTo = findCommitLedgerField(ledger, COMMIT_LEDGER_PUSHED_LABEL);
  const focusedSlice = findCommitLedgerField(
    ledger,
    COMMIT_LEDGER_FOCUSED_SLICE_LABEL,
  );
  return [
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
      COMMIT_LEDGER_PUSHED_LABEL,
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
}

function findModelFitField(section, label) {
  const fieldPattern = new RegExp(
    `${escapeRegExp(label)}:\\s*([^\\n]+)`,
    'iu',
  );
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[NUM_ONE]) : null;
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
    [MODEL_FIT_FORBIDDEN_FILES_LABEL]: findModelFitField(
      section,
      MODEL_FIT_FORBIDDEN_FILES_LABEL,
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

function metadataIsPureClassificationPackage(metadata = {}) {
  return metadata &&
    isScenarioDrivenMetadata(metadata) &&
    !hasImplementationWriteScope(metadata) &&
    (
      metadataLane(metadata) === LANE_DIAGNOSTIC_CLASSIFICATION ||
      metadataHasClassificationOnlyOutcome(metadata) ||
      metadataHasClassificationEfficiency(metadata)
    );
}

export function metadataUsesPureClassificationFastPath(metadata = {}) {
  return metadataIsPureClassificationPackage(metadata) &&
    metadataHasClassificationEfficiency(metadata);
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
    (fileStatus === STATUS_DONE || fileStatus === STATUS_SUPERSEDED) &&
    representativeOutcome === CAUSAL_GOVERNANCE_PENDING_OUTCOME
  ) {
    errors.push(
      `${filePath}: closed packages must classify representativeOutcome as ` +
      'representative-green, reduced, same-frontier, migrated, ' +
      'classification-only, architecture-gap, or contradictory.',
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
        'current-blocker refresh, and pre-implementation validation.',
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

export function validateSameFrontierStopContract(
  metadata,
  filePath,
  options = {},
) {
  const fileStatus = options.status || normalizeLedgerText(metadata?.status);
  if (
    fileStatus !== STATUS_ACTIVE ||
    !metadata ||
    !isScenarioDrivenMetadata(metadata) ||
    !metadataHasSameFrontierNoReduction(metadata)
  ) {
    return [];
  }
  const gate = metadata[ARCHITECTURE_DECISION_GATE_FIELD];
  const gateStatus = normalizeLedgerText(gate?.status);
  const stopCondition = scenarioClosureStopCondition(metadata);
  if (
    [
      ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED,
      ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED,
      ARCHITECTURE_DECISION_GATE_STATUS_SELECTED,
    ].includes(gateStatus) ||
    SAME_FRONTIER_ESCALATION_STOP_CONDITIONS.includes(stopCondition)
  ) {
    return [];
  }
  return [
    `${filePath}: same-frontier rerun without concrete reduction must stop ` +
    'local patching and record an architectureDecisionGate or human escalation before another local implementation package.',
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
  const isSelectedRuntimeSuccessor =
    metadataIsSelectedRuntimeSuccessor(metadata);
  if (
    metadataLane(metadata) !== LANE_CAUSAL_ESCALATION &&
    !isDiagnosticOnlyRoute &&
    !isSelectedRuntimeSuccessor
  ) {
    errors.push(
      `${filePath}: frontier oscillation detected (${detection.reason}); ` +
      'use the causal-escalation lane and a cross-boundary handoff package ' +
      'before another local runtime patch. Recent related packages: ' +
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
      summary: 'Open a bounded architecture package for the missing owner contract.',
      route: ARCHITECTURE_DECISION_GATE_ROUTE_ARCHITECTURE_PACKAGE,
      proof: proofOrFallback,
    },
    {
      id: ARCHITECTURE_DECISION_GATE_CHOICE_ID_HUMAN_ESCALATION,
      summary: 'Escalate to a human choice before creating or changing runtime packages.',
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

function normalizeArchitectureDecisionGate(gate = {}, metadata = {}) {
  const choices = Array.isArray(gate.choices) ?
    gate.choices.map(normalizeArchitectureGateChoice) :
    architectureGateChoices(metadata);
  return {
    status: normalizeLedgerText(gate.status) ||
      ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED,
    trigger: normalizeLedgerText(gate.trigger) ||
      ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
    triggerEvidence: Array.isArray(gate.triggerEvidence) ?
      gate.triggerEvidence.map(normalizeLedgerText)
        .filter((value) => value.length > NUM_ZERO) :
      architectureGateEvidence(metadata),
    choices,
    selectedChoice: gate.selectedChoice === null ? null :
      normalizeLedgerText(gate.selectedChoice) || null,
    nextAction: normalizeLedgerText(gate.nextAction) ||
      ARCHITECTURE_DECISION_GATE_NEXT_ACTION_PRESENT,
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
      status: ARCHITECTURE_DECISION_GATE_STATUS_REQUIRED,
      trigger: ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
      triggerEvidence: architectureGateEvidence(
        metadata,
        ARCHITECTURE_DECISION_GATE_TRIGGER_ARCHITECTURE_GAP,
      ),
      choices: architectureGateChoices(metadata),
      selectedChoice: null,
      nextAction: ARCHITECTURE_DECISION_GATE_NEXT_ACTION_PRESENT,
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
      `${filePath}: architectureDecisionGate.selectedChoice must name the human-selected architecture route.`,
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
      'concrete architecture choices before implementation.',
    );
  }
  if (
    status === ARCHITECTURE_DECISION_GATE_STATUS_PRESENTED &&
    phase === VALIDATION_PHASE_PRE_IMPL &&
    fileStatus === STATUS_ACTIVE
  ) {
    errors.push(
      `${filePath}: architectureDecisionGate status is presented; runtime ` +
      'implementation is blocked until a human-selected architecture route is recorded.',
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

function parsePackageMetadata(content, filePath) {
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
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `${filePath}: work-package metadata is not valid JSON: ${error.message}`,
    );
  }
}

function replacePackageMetadata(content, metadata) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    return content;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    return content;
  }
  const nextJson = JSON.stringify(metadata, null, NUM_TWO);
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

function validatePackageMetadataShape(filePath, fileStatus, metadata) {
  const errors = [];
  if (!metadata) {
    return errors;
  }
  if (metadata.schema !== WORK_PACKAGE_METADATA_SCHEMA) {
    errors.push(
      `${filePath}: metadata schema must be ${WORK_PACKAGE_METADATA_SCHEMA}.`,
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
  ]) {
    if (metadata[scopeField] !== undefined && !Array.isArray(metadata[scopeField])) {
      errors.push(`${filePath}: metadata ${scopeField} must be an array.`);
    }
  }
  if (fileStatus === STATUS_ACTIVE) {
    errors.push(...validateActivePackageMetadataShape(filePath, metadata));
    errors.push(...validateActiveScenarioMetadataShape(filePath, metadata));
  }
  return errors;
}

function resolveValidationPhase(args = []) {
  const requestedPhases = [
    args.includes(CLI_FLAG_ENTRY) ? VALIDATION_PHASE_ENTRY : null,
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
  const forceClosedPackageLedger =
    options.enforceClosureSubagentLedger === true &&
    (fileStatus === STATUS_DONE || fileStatus === STATUS_SUPERSEDED) &&
    metadataRequiresSubagentSequencing(metadata);
  const requiresSubagentLedger =
    metadata !== null &&
    metadataRequiresSubagentSequencing(metadata) &&
    (
      fileStatus === STATUS_ACTIVE ||
      isCurrentPolicyClosedSubagentMetadata(fileStatus, metadata) ||
      forceClosedPackageLedger
    ) &&
    phase !== VALIDATION_PHASE_ENTRY;
  return {
    skipSubagentLedger: phase === VALIDATION_PHASE_ENTRY,
    requiresSubagentLedger,
    allowOpenImplementation:
      phase === VALIDATION_PHASE_PRE_IMPL && fileStatus === STATUS_ACTIVE,
    allowUnavailableSubagents:
      phase !== VALIDATION_PHASE_CLOSURE && fileStatus === STATUS_ACTIVE,
  };
}

async function validatePackageFile(filePath, options = {}) {
  const phase = options.phase || VALIDATION_PHASE_PRE_IMPL;
  const content = await readTextFile(filePath);
  const relativePath = normalizeRelativePath(filePath);
  const fileStatus = getPackageStatusFromPath(filePath);
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
  const metadata = parsePackageMetadata(content, relativePath);
  if (fileStatus === STATUS_ACTIVE && !metadata) {
    errors.push(`${relativePath}: active package metadata is required.`);
  }
  errors.push(
    ...validatePackageMetadataShape(relativePath, fileStatus, metadata),
  );
  const subagentValidation = buildSubagentValidationOptions(
    fileStatus,
    metadata,
    phase,
    {
      enforceClosureSubagentLedger: options.enforceClosureSubagentLedger,
    },
  );
  if (!subagentValidation.skipSubagentLedger) {
    errors.push(...validateSubagentSequencingLedger(content, relativePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
        subagentValidation.allowOpenImplementation,
      [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
        subagentValidation.allowUnavailableSubagents,
      [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
        fileStatus === STATUS_TODO,
    }));
    errors.push(...validateSubagentProgressLedger(content, relativePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
        subagentValidation.allowOpenImplementation,
      [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
        subagentValidation.allowUnavailableSubagents,
      [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
        fileStatus === STATUS_TODO,
    }));
    errors.push(...validateSubagentAttemptLedger(content, relativePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
        subagentValidation.allowOpenImplementation,
      [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
        subagentValidation.allowUnavailableSubagents,
      [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
        fileStatus === STATUS_TODO,
    }));
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
  errors.push(...validateModelFitContract(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE && metadata !== null,
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
  }));
  errors.push(...validateScenarioCausalClosureContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE &&
      metadata !== null &&
      isScenarioDrivenMetadata(metadata),
    status: fileStatus,
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
  const requiresCommitLedger =
    metadata !== null &&
    metadata[METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED] === true;
  errors.push(...validateCommitAndPushLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: requiresCommitLedger,
    [LEDGER_VALIDATION_ALLOW_PENDING_COMMIT_LEDGER]:
      fileStatus === STATUS_ACTIVE || fileStatus === STATUS_TODO,
    [LEDGER_VALIDATION_ALLOW_MISSING_HISTORICAL_COMMIT_LEDGER]:
      isHistoricalClosedCommitLedgerMetadata(fileStatus, metadata),
  }));
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

  const packagePath = normalizeSnapshotPathValue(currentBlocker.package);
  if (packagePath.length === NUM_ZERO) {
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
  const allowClosedSnapshot =
    !activeSprintFile &&
    CURRENT_BLOCKER_CLOSED_STATUSES.includes(currentBlocker.status);
  if (!activeSprintFile && !allowClosedSnapshot) {
    errors.push(
      `${CURRENT_BLOCKER_JSON_PATH}: ${ERROR_NO_ACTIVE_SPRINT} Run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND} after activating a sprint.`,
    );
  }
  const activePackageFile = activeSprintFile ?
    await findActivePackageFile(activeSprintFile) :
    null;
  if (!activePackageFile && !allowClosedSnapshot) {
    errors.push(
      `${CURRENT_BLOCKER_JSON_PATH}: ${ERROR_NO_ACTIVE_PACKAGE} Run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND} after activating a package.`,
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
  if (activeSprintFile && activePackageFile && !allowClosedSnapshot) {
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
    });
    errors.push(...result.errors);
  }
  if (errors.length > NUM_ZERO) {
    console.error(errors.join(NEWLINE));
    process.exit(EXIT_FAILURE);
  }
  console.log(
    `Work tracker validation OK for ${targets.length} file(s) ` +
      `at ${phase} phase.`,
  );
}

function appendDoctorField(lines, label, value) {
  lines.push(`- ${label}: ${normalizeLedgerText(value) || DEFAULT_UNKNOWN}`);
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

function metadataProofCommands(metadata = {}) {
  return normalizeMetadataStringList(metadata[METADATA_FIELD_PROOF]);
}

function hasImplementationWriteScope(metadata = {}) {
  return metadataWritePaths(metadata)
    .some((filePath) => IMPLEMENTATION_WRITE_PATH_PATTERN.test(filePath));
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

function buildProcessGuidanceLines(metadata = {}, fileStatus = DEFAULT_UNKNOWN) {
  const lines = [buildProofLadderGuidance(metadata)];
  const isActivePackage = fileStatus === STATUS_ACTIVE;
  const hasImplementationWrites = hasImplementationWriteScope(metadata);
  const hasClassificationOnlyOutcome =
    metadataHasClassificationOnlyOutcome(metadata);
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
  if (hasClassificationOnlyOutcome && hasImplementationWrites) {
    lines.push(
      'Classification-only result has implementation write scope. Move ' +
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
      'present a human gate.',
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
  if (/Subagent Sequencing Ledger/iu.test(error)) {
    return 'Use `npm run work:subagent-prompt -- --role review|fix|' +
      'implementation --package <package>` to generate bounded role prompts, ' +
      'then record the returned real agent id in the ledger.';
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
      'Sprint Strategy Brief, Current Edge Card, current-blocker, and pre-impl validation.';
  }
  if (/classificationEfficiency/iu.test(error)) {
    return 'Add `classificationEfficiency` to pure classifier packages: ' +
      'default mode, separate-package reason, one-artifact/two-or-three-command ' +
      'budget, decision record, successor action, and runtime promotion rule. ' +
      'Stable owner/boundary local-fix routes should open a runtime-owner-boundary successor.';
  }
  if (/same-frontier rerun without concrete reduction/iu.test(error)) {
    return 'Stop local patching: record an architecture decision gate or human ' +
      'escalation before opening another local implementation package.';
  }
  if (/architectureDecisionGate/iu.test(error)) {
    return 'Record `architectureDecisionGate` with concrete choices, proof, ' +
      'and a selected human route before runtime implementation resumes. Use ' +
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
  if (!getPackageStatusFromPath(filePath)) {
    errors.push(`${relativePath}: package filename has no valid status prefix.`);
  }
  if (
    (fileStatus === STATUS_DONE || fileStatus === STATUS_SUPERSEDED) &&
    hasOpenChecklist(content)
  ) {
    errors.push(`${relativePath}: closed package still has open checklist items.`);
  }
  errors.push(...validatePackageMetadataShape(relativePath, fileStatus, metadata));
  const subagentValidation = buildSubagentValidationOptions(
    fileStatus,
    metadata,
    phase,
  );
  if (!subagentValidation.skipSubagentLedger) {
    errors.push(...validateSubagentSequencingLedger(content, relativePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
        subagentValidation.allowOpenImplementation,
      [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
        subagentValidation.allowUnavailableSubagents,
      [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
        fileStatus === STATUS_TODO,
    }));
    errors.push(...validateSubagentProgressLedger(content, relativePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
        subagentValidation.allowOpenImplementation,
      [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
        subagentValidation.allowUnavailableSubagents,
      [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
        fileStatus === STATUS_TODO,
    }));
    errors.push(...validateSubagentAttemptLedger(content, relativePath, {
      [LEDGER_VALIDATION_REQUIRES_LEDGER]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]:
        subagentValidation.requiresSubagentLedger,
      [LEDGER_VALIDATION_ALLOW_OPEN_IMPLEMENTATION]:
        subagentValidation.allowOpenImplementation,
      [LEDGER_VALIDATION_ALLOW_UNAVAILABLE_SUBAGENTS]:
        subagentValidation.allowUnavailableSubagents,
      [LEDGER_VALIDATION_ALLOW_PENDING_SUBAGENT_LEDGER]:
        fileStatus === STATUS_TODO,
    }));
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
  errors.push(...validateModelFitContract(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE && metadata !== null,
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
  }));
  errors.push(...validateScenarioCausalClosureContract(metadata, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE &&
      metadata !== null &&
      isScenarioDrivenMetadata(metadata),
    status: fileStatus,
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
  const requiresCommitLedger =
    metadata !== null &&
    metadata[METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED] === true;
  errors.push(...validateCommitAndPushLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: requiresCommitLedger,
    [LEDGER_VALIDATION_ALLOW_PENDING_COMMIT_LEDGER]:
      fileStatus === STATUS_ACTIVE || fileStatus === STATUS_TODO,
    [LEDGER_VALIDATION_ALLOW_MISSING_HISTORICAL_COMMIT_LEDGER]:
      isHistoricalClosedCommitLedgerMetadata(fileStatus, metadata),
  }));

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
  const processGuidance = buildProcessGuidanceLines(
    metadata || {},
    fileStatus,
  );
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
  if (!activePackageFile) {
    throw new Error(ERROR_NO_ACTIVE_PACKAGE);
  }
  return activePackageFile;
}

async function doctorCommand(args) {
  const phase = resolveValidationPhase(args);
  const packagePath = await resolveDoctorPackagePath(args);
  const content = await readTextFile(packagePath);
  const packageHistoryEntries = await collectPackageHistoryEntries();
  const report = buildPackageDoctorLines(packagePath, content, {
    phase,
    packageHistoryEntries,
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

function findActivePackageLinkInSprint(content) {
  const currentMatch = content.match(CURRENT_ACTIVE_PACKAGE_LINK_PATTERN);
  if (currentMatch) {
    return currentMatch[NUM_ONE];
  }
  const match = content.match(ACTIVE_PACKAGE_LINK_PATTERN);
  return match ? match[NUM_ONE] : null;
}

export async function findActivePackageFile(activeSprintFile) {
  const packageFiles = await listPackageFiles();
  const activePackages = packageFiles.filter((filePath) =>
    getPackageStatusFromPath(filePath) === STATUS_ACTIVE,
  );
  if (activePackages.length === NUM_ONE) {
    return activePackages[NUM_ZERO];
  }
  if (!activeSprintFile) {
    return null;
  }
  const sprintContent = await readTextFile(activeSprintFile);
  const packageLink = findActivePackageLinkInSprint(sprintContent);
  if (!packageLink) {
    return null;
  }
  return path.normalize(path.join(path.dirname(activeSprintFile), packageLink));
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
    sprint: normalizeRelativePath(activeSprintFile),
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
    modelFit: metadata.modelFit || {},
    representativeResidual: isObjectRecord(
      metadata[REPRESENTATIVE_RESIDUAL_METADATA_FIELD],
    ) ? metadata[REPRESENTATIVE_RESIDUAL_METADATA_FIELD] : {},
    causalGovernance: metadata.causalGovernance || {},
    scenarioCausalClosure: metadata.scenarioCausalClosure || {},
    rerunDecision: metadata[RERUN_DECISION_FIELD] || {},
    classificationEfficiency: metadata[CLASSIFICATION_EFFICIENCY_FIELD] || {},
    architectureDecisionGate: buildArchitectureDecisionGatePayload(
      metadata,
      activePackageFile,
      options,
    ),
    predecessor: metadata.predecessor || null,
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
      payload.causalGovernance?.hypothesis,
      payload.currentState,
    ]),
    causalQuestion: firstCurrentBlockerValue([
      payload.scenarioCausalClosure?.missingCausalEdge,
      payload.dominantReason,
    ]),
    implementationSlice: firstCurrentBlockerValue([payload.nextAction]),
    implementationFiles: currentBlockerImplementationFiles(payload),
    expectedImplementationDelta: firstCurrentBlockerValue([
      payload.causalGovernance?.expectedCausalModelChange,
      payload.scenarioCausalClosure?.expectedObservableTransition,
      payload.rerunDecision?.expectedDelta,
    ]),
    falsifyingProbe: firstCurrentBlockerValue([
      payload.scenarioCausalClosure?.missingCausalEdgeProbe,
      payload.causalGovernance?.stopConditionCheck,
      normalizeMetadataStringList(payload.proof)[NUM_ZERO],
    ]),
    stopRule: firstCurrentBlockerValue([
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
    `Allowed stop modes: ${CURRENT_EDGE_CARD_ALLOWED_STOP_MODES}`,
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
    '## Classification Efficiency',
    '',
    'Default mode: ' +
      `\`${payload.classificationEfficiency?.defaultMode || DEFAULT_UNKNOWN}\``,
    '',
    'Separate package reason: ' +
      `\`${payload.classificationEfficiency?.separatePackageReason ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Artifact budget: ' +
      `\`${payload.classificationEfficiency?.artifactBudget ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Proof command budget: ' +
      `\`${payload.classificationEfficiency?.proofCommandBudget ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Commands:',
    '',
    formatMarkdownList(payload.classificationEfficiency?.commands || []),
    '',
    'Decision record: ' +
      `\`${payload.classificationEfficiency?.decisionRecord ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Successor action: ' +
      `\`${payload.classificationEfficiency?.successorAction ||
        DEFAULT_UNKNOWN}\``,
    '',
    'Runtime promotion rule: ' +
      `\`${payload.classificationEfficiency?.runtimePromotionRule ||
        DEFAULT_UNKNOWN}\``,
    '',
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
  if (!activeSprintFile) {
    throw new Error(ERROR_NO_ACTIVE_SPRINT);
  }
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    throw new Error(ERROR_NO_ACTIVE_PACKAGE);
  }
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
    const sprintContent = await readTextFile(activeSprintFile);
    const nextSprintContent = upsertSprintCurrentEdgeCard(
      sprintContent,
      payload,
    );
    const updatedPaths = [
      CURRENT_BLOCKER_JSON_PATH,
      CURRENT_BLOCKER_MARKDOWN_PATH,
    ];
    if (nextSprintContent !== sprintContent) {
      await writeTextFile(activeSprintFile, nextSprintContent);
      updatedPaths.push(normalizeRelativePath(activeSprintFile));
    }
    console.log(
      `Updated ${updatedPaths.join(', ')}.`,
    );
    return;
  }
  console.log(jsonContent);
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

async function rewriteWorkReferences(oldPackagePath, newPackagePath) {
  const oldFileName = path.basename(oldPackagePath);
  const newFileName = path.basename(newPackagePath);
  const files = await listWorkMarkdownFiles();
  for (const filePath of files) {
    if (filePath === newPackagePath) {
      continue;
    }
    const content = await readTextFile(filePath);
    if (!content.includes(oldFileName)) {
      continue;
    }
    await writeTextFile(filePath, content.split(oldFileName).join(newFileName));
  }
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
  });
  if (validation.errors.length > NUM_ZERO) {
    await fs.rm(targetPath, {force: true});
    throw new Error(validation.errors.join(NEWLINE));
  }
  await fs.unlink(packagePath);
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
  const successorPath = successor ? normalizeRelativePath(normalizeCliPath(successor)) : null;
  if (!args.includes(CLI_FLAG_WRITE)) {
    console.log(
      `Dry run: ${normalizeRelativePath(packagePath)} -> ${normalizeRelativePath(targetPath)}`,
    );
    if (successorPath) {
      console.log(`Successor: ${successorPath}`);
    }
    return;
  }
  const nextContent = metadata ?
    replacePackageMetadata(content, {
      ...metadata,
      status: targetStatus,
      ...(targetStatus === STATUS_DONE || targetStatus === STATUS_SUPERSEDED ?
        {closed: metadata.closed || new Date().toISOString().slice(
          NUM_ZERO,
          DATE_SLICE_END,
        ),
        [METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED]: true} :
        {}),
      ...(successorPath ? {successor: successorPath} : {}),
    }) :
    content;
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
  await rewriteWorkReferences(packagePath, targetPath);
  if (args.includes(CLI_FLAG_TRANSACTION)) {
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
  const [, , command, ...args] = process.argv;
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
