#!/usr/bin/env node

import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {
  buildArchitectureDecisionGatePayload,
  buildCurrentBlockerPayload,
  collectPackageHistoryEntries,
  findActivePackageFile,
  findActiveSprintFile,
  metadataRequiresSubagentSequencing,
  metadataRequiresVerificationFix,
  validateExecutionEvidenceLedger,
  validateSubagentSequencingLedger,
} from './work-tracker.js';
import {
  findMissingTheoryLedgerRefs,
  findRelatedTheoryLedgerEntries,
  summarizeTheoryLedgerEntry,
  validateTheoryLedgerContent,
} from './work-theory-ledger.js';
import {normalizeMetadata} from './work-package-schema.js';
import {recommendLaneForPackage} from './work-lane-picker.js';

const execFileAsync = promisify(execFile);

const ENCODING_UTF8 = 'utf8';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const MAX_GIT_STATUS_LINES = 30;
const MAX_ACTIVE_STEERING_RULES = 10;
const MIN_ACTIVE_STEERING_RULES = 5;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const CLI_FLAG_DIRTY_SCOPE = '--dirty-scope';
const CLI_FLAG_PACKAGE = '--package';
const CURRENT_BLOCKER_JSON_PATH = path.join(
  'work',
  'sprints',
  'current-blocker.json',
);
const AGENTS_PATH = 'AGENTS.md';
const LLM_STEERING_DIRECTORY = path.join('.kiro', 'steering', 'llm');
const LLM_STEERING_README_PATH = path.join(LLM_STEERING_DIRECTORY, 'README.md');
const LLM_STEERING_CORE_PATH = path.join(LLM_STEERING_DIRECTORY, 'core.md');
const LLM_STEERING_ARCHITECTURE_PATH = path.join(
  LLM_STEERING_DIRECTORY,
  'architecture.md',
);
const LLM_STEERING_TESTING_PATH = path.join(LLM_STEERING_DIRECTORY, 'testing.md');
const LLM_STEERING_STYLE_PATH = path.join(LLM_STEERING_DIRECTORY, 'style.md');
const LLM_STEERING_GOVERNANCE_PATH = path.join(
  LLM_STEERING_DIRECTORY,
  'governance.md',
);
const COMPACT_STEERING_BASE_PATHS = Object.freeze([
  LLM_STEERING_README_PATH,
  LLM_STEERING_CORE_PATH,
]);
const LLM_DOMAIN_ARCHITECTURE = 'architecture';
const LLM_DOMAIN_TESTING = 'testing';
const LLM_DOMAIN_STYLE = 'style';
const LLM_DOMAIN_GOVERNANCE = 'governance';
const LLM_DOMAIN_PACKS = Object.freeze({
  [LLM_DOMAIN_ARCHITECTURE]: LLM_STEERING_ARCHITECTURE_PATH,
  [LLM_DOMAIN_TESTING]: LLM_STEERING_TESTING_PATH,
  [LLM_DOMAIN_STYLE]: LLM_STEERING_STYLE_PATH,
  [LLM_DOMAIN_GOVERNANCE]: LLM_STEERING_GOVERNANCE_PATH,
});
const WORK_README_PATH = path.join('work', 'README.md');
const THEORY_LEDGER_PATH = path.join('work', 'theory-ledger.md');
const GIT_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--short']);
const NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND = 'npm run work:current-blocker';
const NPM_RUN_WORK_ADVANCE_COMMAND = 'npm run work:advance';
const NPM_RUN_WORK_LLM_START_COMMAND = 'npm run work:llm-start';
const NPM_RUN_WORK_VALIDATE_COMMAND = 'npm run work:validate';
const NPM_RUN_WORK_PACKAGE_DOCTOR_COMMAND = 'npm run work:package:doctor --';
const NPM_RUN_WORK_PACKAGE_DOCTOR_SUGGEST_COMMAND =
  'npm run work:package:doctor -- --suggest';
const NPM_RUN_WORK_SUBAGENT_NEXT_COMMAND = 'npm run work:subagent-next';
const NPM_RUN_WORK_EVIDENCE_SUMMARY_COMMAND = 'npm run work:evidence-summary --';
const NPM_RUN_WORK_SCENARIO_ROUTE_COMMAND = 'npm run work:scenario-route --';
const NPM_RUN_WORK_SCENARIO_TRIAGE_COMMAND = 'npm run work:scenario-triage --';
const ANALYZE_PRIORITY_RECOVERY_RESIDUALS_COMMAND =
  'npm run analyze:priority-recovery-residuals --';
const ANALYZE_DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report';
const ANALYZE_TOPOLOGY_CONVERGENCE_COMMAND =
  'npm run analyze:topology-convergence --';
const ANALYZE_CAUSAL_MODEL_COMMAND =
  'npm --silent run analyze:causal-model --';
const SUMMARIZE_HARNESS_COMMAND =
  'npm run summarize:harness -- --report-dir test-output/reports';
const CHECK_LITERAL_COMMAND = 'node scripts/check-guideline-literals.js';
const CHECK_DECISION_BOUNDARY_COMMAND =
  'node scripts/check-guideline-decision-boundaries.js';
const CHECK_RUNTIME_GRAMMAR_FILE_COMMAND =
  'npm run audit:runtime-grammar:file --';
const GIT_DIFF_CHECK_COMMAND = 'git diff --check --';
const SOURCE_DIRECTORY_PREFIX = 'src/';
const TEST_DIRECTORY_PREFIX = 'test/';
const SCRIPT_DIRECTORY_PREFIX = 'scripts/';
const WORK_DIRECTORY_PREFIX = 'work/';
const JAVASCRIPT_EXTENSION = '.js';
const README_FILE_NAME = 'README.md';
const PLAYBACK_FAILURE_BUNDLE_FILE = 'failure-bundle.json';
const MARKDOWN_HEADING_PREFIX = '# ';
const SECTION_HEADING_PREFIX = '## ';
const CHECKBOX_OPEN_PREFIX = '- [ ]';
const CHECKBOX_ANY_PREFIX = '- [';
const OPEN_CHECKLIST_TEMPLATE_PLACEHOLDER_PATTERN = /<[^>]+>/u;
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const MARKDOWN_LIST_PREFIX = '- ';
const NUMBERED_LIST_PATTERN = /^\d+\.\s+/u;
const LABEL_SEPARATOR = ': ';
const EMPTY_STRING = '';
const SPACE = ' ';
const NEWLINE = '\n';
const PATH_PRESENT = 'present';
const PATH_MISSING = 'missing';
const THEORY_LEDGER_RELATED_LIMIT = 5;
const PATH_PATTERN = 'pattern';
const PATH_NONE = 'none';
const OPTIONAL_TEXT_PRESENT = 'optional-text-present';
const OPTIONAL_TEXT_MISSING = 'optional-text-missing';
const GIT_STATUS_AVAILABLE = 'git-status-available';
const GIT_STATUS_UNAVAILABLE_STATE = 'git-status-unavailable';
const GIT_GROUP_PACKAGE_OWNED = 'packageOwned';
const GIT_GROUP_TRACKER_GENERATED = 'trackerGenerated';
const GIT_GROUP_UNRELATED = 'unrelated';
const LANE_MECHANICAL_MAINTENANCE = 'mechanical-maintenance';
const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const LANE_TEST_ONLY_PROOF = 'test-only-proof';
const LANE_BOUNDED_EXPERIMENT = 'bounded-experiment';
const LANE_SINGLE_FILE_RUNTIME = 'single-file-runtime';
const LOWER_MODEL_EXECUTION_LANES = Object.freeze([
  LANE_MECHANICAL_MAINTENANCE,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_TEST_ONLY_PROOF,
  LANE_BOUNDED_EXPERIMENT,
  LANE_SINGLE_FILE_RUNTIME,
]);
const DEFAULT_UNKNOWN = 'unknown';
const OUTPUT_TITLE = '# Work Context';
const DIRTY_SCOPE_OUTPUT_TITLE = '# Worktree Package Scope';
const SECTION_THEORY_IMPLEMENTATION = 'Theory And Implementation Focus';
const SECTION_ACTIVE_CONSTRAINTS = 'Active Constraints';
const SECTION_CURRENT_BLOCKER = 'Current Blocker';
const SECTION_THEORY_LEDGER_REFS = 'Theory Ledger References';
const SECTION_CURRENT_STATE = 'Current State';
const SECTION_NEXT_ACTION = 'Next Action';
const SECTION_FIRST_FILES = 'First Files To Read';
const SECTION_SECONDARY_STEERING = 'Secondary Steering Packs';
const SECTION_TOUCHED_FILES = 'Touched Files';
const SECTION_SCOPE = 'Scope';
const SECTION_PROOF_LADDER = 'Proof Ladder';
const SECTION_SUBAGENT_SEQUENCING = 'Subagent Sequencing';
const SECTION_SUBAGENT_PROGRESS = 'Subagent Progress';
const SECTION_MODEL_FIT = 'Model Fit';
const SECTION_REPRESENTATIVE_RESIDUAL = 'Representative Residual';
const SECTION_CAUSAL_GOVERNANCE = 'Causal Governance';
const SECTION_SCENARIO_CAUSAL_CLOSURE = 'Scenario Causal Closure';
const SECTION_ARCHITECTURE_DECISION_GATE = 'Architecture Decision Gate';
const SECTION_OPEN_CHECKLIST = 'Open Package Checklist';
const SECTION_OUT_OF_SCOPE = 'Out Of Scope';
const SECTION_USEFUL_COMMANDS = 'Useful Commands';
const SECTION_WORKTREE = 'Worktree Summary';
const PACKAGE_SECTION_OUT_OF_SCOPE = 'Out Of Scope';
const PACKAGE_SECTION_EXECUTION_EVIDENCE = 'Execution Evidence';
const PACKAGE_SECTION_SUBAGENT_LEDGER = 'Subagent Sequencing Ledger';
const PACKAGE_SECTION_SUBAGENT_PROGRESS_LEDGER = 'Subagent Progress Ledger';
const PACKAGE_SECTION_SUBAGENT_PROGRESS_ATTEMPT_LEDGER =
  'Subagent Progress And Attempt Ledger';
const PACKAGE_SECTION_MODEL_FIT = 'Model Fit';
const MODEL_FIT_LABEL_FORBIDDEN_FILES = 'Forbidden files';
const MESSAGE_CURRENT_BLOCKER_MISSING =
  'No current blocker handoff was found.';
const MESSAGE_CURRENT_BLOCKER_HINT =
  `Run \`${NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND}\` first.`;
const MESSAGE_NO_OPEN_CHECKLIST = 'No open checklist items found in package.';
const MESSAGE_NO_OUT_OF_SCOPE = 'No Out Of Scope section found in package.';
const MESSAGE_NO_SUBAGENT_PROGRESS =
  'No Subagent Progress Ledger updates found in package.';
const MESSAGE_NO_GIT_STATUS = 'No dirty git status entries.';
const MESSAGE_GIT_STATUS_UNAVAILABLE = 'Git status unavailable.';
const SUBAGENT_LEDGER_REVIEW_LABEL = 'Review subagent recorded';
const SUBAGENT_LEDGER_FIX_LABEL =
  'Fix subagent recorded or explicitly not needed';
const SUBAGENT_LEDGER_IMPLEMENTATION_LABEL = 'Implementation subagent recorded';
const SUBAGENT_ROLE_REVIEW = 'review';
const SUBAGENT_ROLE_FIX = 'fix';
const SUBAGENT_ROLE_IMPLEMENTATION = 'implementation';
const SUBAGENT_ROLE_VERIFICATION_FIX = 'verification-fix';
const SUBAGENT_ROLE_NONE = 'none';
const SUBAGENT_STATUS_LEDGER_MISSING =
  'Execution evidence not recorded; implementation may proceed as one executor pass, then verifier-fixer evidence is required before closure when scope changes code, tests, scripts, or tracker truth.';
const SUBAGENT_STATUS_REVIEW_MISSING =
  'Review proof missing in legacy ledger; direct implementation may proceed when package scope and proof are explicit.';
const SUBAGENT_STATUS_FIX_REQUIRED =
  'Legacy review found fixes-required; fix runtime/code findings before implementation, or record review-fixed-metadata-only for metadata-only fixes.';
const SUBAGENT_STATUS_FIX_NOT_NEEDED_MISSING =
  'Legacy review is clean; record fix as not-needed or continue with execution evidence.';
const SUBAGENT_STATUS_FIX_MISSING =
  'Fix proof missing in legacy ledger; record the required fix only when review found code/runtime fixes.';
const SUBAGENT_STATUS_IMPLEMENTATION_MISSING =
  'Legacy review/fix proof recorded; implement directly and record execution evidence after focused proof.';
const SUBAGENT_STATUS_IMPLEMENTATION_RECORDED =
  'Implementation proof recorded.';
const SUBAGENT_STATUS_VERIFICATION_FIX_MISSING =
  'Implementation proof recorded; run a separate verifier-fixer that may fix in-scope problems before closure.';
const SUBAGENT_STATUS_VERIFICATION_FIX_RECORDED =
  'Implementation and verifier-fixer proof recorded.';
const SUBAGENT_STATUS_STRICT_VALIDATION_FAILED =
  'Legacy Subagent Sequencing Ledger strict validation failed; repair the recorded proof or replace it with Execution Evidence.';
const SUBAGENT_STATUS_NOT_REQUIRED =
  'Execution evidence only; subagent sequencing is not required for this workflow lane or classification-only fast path.';
const SUBAGENT_PROGRESS_CHECKED_ITEM_PATTERN = /^\[[xX]\]\s*/u;
const SUBAGENT_LEDGER_CHECKED_LINE_PATTERN = /^-\s*\[[xX]\]\s*/mu;
const EXECUTION_EVIDENCE_IMPLEMENTATION_PATTERN = /\bimplementation\b/iu;
const EXECUTION_EVIDENCE_VERIFICATION_FIX_PATTERN =
  /\bverification-fix\b/iu;
const EXECUTION_EVIDENCE_PARENT_REVALIDATED_PATTERN =
  /\b(?:parent\s+revalidated\s+(?:focused\s+)?proof|parent\s+validation)\s*:\s*`?yes`?/iu;
const SUBAGENT_PROGRESS_ITEM_LIMIT = 3;
const SUBAGENT_REVIEW_RESULT_CLEAN = 'clean';
const SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED = 'fixes-required';
const SUBAGENT_FIX_NOT_NEEDED = 'not-needed';
const SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY =
  'review-fixed-metadata-only';
const SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE =
  'first-package-in-sprint';
const SUBAGENT_REVIEW_RESULT_PATTERN =
  /result\s+`?(clean|fixes-required)`?/iu;
const SUBAGENT_AGENT_ID_PATTERN =
  /\(`?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`?\)/iu;
const SUBAGENT_REVIEW_FIXED_METADATA_SCOPE_FIELD_PATTERN =
  /\bscope:\s*([^.;]+)/iu;
const SUBAGENT_REVIEW_FIXED_METADATA_SCOPE_PATTERN =
  /\b(?:metadata-only|package\s+metadata|sprint\s+metadata|tracker|handoff|current-blocker|ledger)\b/iu;
const SUBAGENT_NON_REAL_IDENTITY_PATTERN =
  /\b(?:current-session|current session|parent\s+codex|manual|local|session)\b/iu;
const SUBAGENT_SEQUENCE_ORDER_ERROR_PATTERN = /entries must appear/iu;
const SUBAGENT_FIX_ERROR_PATTERN =
  /fix (?:entry|package|agent)|not-needed/iu;
const SUBAGENT_IMPLEMENTATION_ERROR_PATTERN = /implementation/iu;
const LEDGER_VALIDATION_REQUIRES_LEDGER = 'requiresLedger';
const LEDGER_VALIDATION_REQUIRES_VERIFICATION_FIX = 'requiresVerificationFix';
const LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES = 'requiresStrictEntries';
const FIELD_LABELS = Object.freeze({
  ARTIFACT: 'Artifact',
  BOUNDARY: 'Boundary',
  CAUSAL_QUESTION: 'Causal question',
  DIRTY_ENTRIES: 'Dirty entries',
  DOMINANT_REASON: 'Dominant reason',
  ESCALATION_TRIGGERS: 'Escalation triggers',
  EXPECTED_CAUSAL_MODEL_CHANGE: 'Expected causal-model change',
  EXPECTED_IMPLEMENTATION_DELTA: 'Expected implementation delta',
  FALSIFYING_PROBE: 'Falsifying probe',
  IMPLEMENTATION_FILES: 'Implementation files',
  IMPLEMENTATION_SLICE: 'Implementation slice',
  INTENDED_MINIMUM_MODEL: 'Intended minimum model',
  CAUSAL_DEBT: 'Causal debt',
  CAUSAL_HYPOTHESIS: 'Causal hypothesis',
  CROSS_BOUNDARY_REVIEW: 'Cross-boundary review',
  MODEL_FIT_PACKAGE_CLASS: 'Package class',
  NEXT_ACTION: 'Next action',
  OWNER: 'Owner',
  OUTPUT_PROFILE: 'Output profile',
  PACKAGE: 'Package',
  PACKAGE_TITLE: 'Package title',
  PLAYBACK: 'Playback',
  PREDECESSOR: 'Predecessor',
  THEORY_LEDGER_REFS: 'Theory ledger refs',
  SCENARIO: 'Scenario',
  SCOPE_SHAPE: 'Scope shape',
  SPRINT: 'Sprint',
  STATUS: 'Status',
  TRIGGER: 'Trigger',
  TRIGGER_EVIDENCE: 'Trigger evidence',
  CHOICES: 'Choices',
  SELECTED_CHOICE: 'Selected choice',
  WORKFLOW_LANE: 'Workflow lane',
  RECOMMENDED_LANE: 'Recommended lane',
  STOP_CONDITION_CHECK: 'Stop-condition check',
  STOP_RULE: 'Stop rule',
  SUBAGENT_ROLE: 'Next required subagent role',
  SUBAGENT_STATUS: 'Subagent sequencing status',
  THEORY_UNDER_TEST: 'Theory under test',
  REPRESENTATIVE_OUTCOME: 'Representative outcome',
  REFERENCE_SCENARIO_OR_PROBE: 'Reference scenario/probe',
  PHASE_CHAIN: 'Phase chain',
  CURRENT_FIRST_FRONTIER: 'Current first frontier',
  FRONTIER: 'Frontier',
  KNOWN_DOWNSTREAM_BLOCKERS: 'Known downstream blockers',
  MISSING_CAUSAL_EDGE: 'Missing causal edge',
  MISSING_CAUSAL_EDGE_PROBE: 'Missing causal edge probe',
  BOUNDED_PROGRESS_PROOF: 'Bounded progress proof',
  BOUNDED_PROGRESS_PROOF_ARTIFACT: 'Bounded progress proof artifact',
  EXPECTED_OBSERVABLE_TRANSITION: 'Expected observable transition',
  MAX_PROGRESS_BOUND: 'Max progress bound',
  SAME_FRONTIER_FALLBACK: 'Same-frontier fallback',
  EXPECTED_NEXT_FRONTIER: 'Expected next frontier',
  RESULT_CLASSIFICATION: 'Result classification',
  STOP_CONDITION: 'Stop condition',
});
const GIT_GROUP_LABELS = Object.freeze({
  [GIT_GROUP_PACKAGE_OWNED]: 'Package-owned dirty entries',
  [GIT_GROUP_TRACKER_GENERATED]: 'Tracker-generated dirty entries',
  [GIT_GROUP_UNRELATED]: 'Unrelated dirty entries',
});
const GIT_GROUP_EMPTY_MESSAGES = Object.freeze({
  [GIT_GROUP_PACKAGE_OWNED]: 'No package-owned dirty entries.',
  [GIT_GROUP_TRACKER_GENERATED]: 'No tracker-generated dirty entries.',
  [GIT_GROUP_UNRELATED]: 'No unrelated dirty entries.',
});
const TRACKER_GENERATED_PATHS = Object.freeze([
  path.join('work', 'sprints', 'current-blocker.json'),
  path.join('work', 'sprints', 'current-blocker.md'),
]);
const SHELL_SAFE_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/u;
const SINGLE_QUOTE = '\'';
const SINGLE_QUOTE_ESCAPE = '\'\\\'\'';
const GIT_RENAME_SEPARATOR = ' -> ';
const DOUBLE_QUOTE = '"';
const FORWARD_SLASH = '/';
const REGEXP_ESCAPE_REPLACEMENT = '\\$&';
const IMPLEMENTATION_SCOPE_PATH_PATTERN =
  /^(?:src|test|scripts|reports|test-output)\//u;
const GLOB_ANY_PATH_SEGMENT = '*';
const GLOB_SINGLE_CHARACTER = '?';
const GLOB_PATTERN_MARKERS = Object.freeze([
  GLOB_ANY_PATH_SEGMENT,
  GLOB_SINGLE_CHARACTER,
  '[',
  ']',
  '{',
  '}',
]);
const METADATA_FIELD_STATUS = 'status';
const METADATA_FIELD_LANE = 'lane';
const METADATA_FIELD_SCENARIO = 'scenario';
const METADATA_FIELD_ARTIFACT = 'artifact';
const METADATA_FIELD_PLAYBACK = 'playback';
const METADATA_FIELD_OWNER = 'owner';
const METADATA_FIELD_BOUNDARY = 'boundary';
const METADATA_FIELD_DOMINANT_REASON = 'dominantReason';
const METADATA_FIELD_CURRENT_STATE = 'currentState';
const METADATA_FIELD_NEXT_ACTION = 'nextAction';
const METADATA_FIELD_PROOF = 'proof';
const METADATA_FIELD_TOUCHED_FILES = 'touchedFiles';
const METADATA_FIELD_WRITE_SCOPE = 'writeScope';
const METADATA_FIELD_HANDOFF_FILES = 'handoffFiles';
const METADATA_FIELD_GENERATED_FILES = 'generatedFiles';
const METADATA_FIELD_CANDIDATE_RUNTIME_FILES = 'candidateRuntimeFiles';
const METADATA_FIELD_COMMIT_SCOPE = 'commitScope';
const METADATA_FIELD_THEORY_LEDGER_REFS = 'theoryLedgerRefs';
const METADATA_FIELD_PREDECESSOR = 'predecessor';
const METADATA_FIELD_MODEL_FIT = 'modelFit';
const METADATA_FIELD_REPRESENTATIVE_RESIDUAL = 'representativeResidual';
const METADATA_FIELD_CAUSAL_GOVERNANCE = 'causalGovernance';
const METADATA_FIELD_SCENARIO_CAUSAL_CLOSURE = 'scenarioCausalClosure';
const METADATA_FIELD_ARCHITECTURE_DECISION_GATE = 'architectureDecisionGate';
const MODEL_FIT_FIELD_PACKAGE_CLASS = 'packageClass';
const MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL = 'intendedMinimumModel';
const MODEL_FIT_FIELD_SCOPE_SHAPE = 'scopeShape';
const MODEL_FIT_FIELD_OUTPUT_PROFILE = 'outputProfile';
const MODEL_FIT_FIELD_ESCALATION_TRIGGERS = 'escalationTriggers';
const MODEL_FIT_LABEL_PACKAGE_CLASS = 'Package class';
const MODEL_FIT_LABEL_INTENDED_MINIMUM_MODEL = 'Intended minimum model';
const MODEL_FIT_LABEL_SCOPE_SHAPE = 'Scope shape';
const MODEL_FIT_LABEL_OUTPUT_PROFILE = 'Output profile';
const MODEL_FIT_LABEL_ESCALATION_TRIGGERS = 'Escalation triggers';
const CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS = 'hypothesis';
const CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK = 'stopConditionCheck';
const CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE =
  'expectedCausalModelChange';
const CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME =
  'representativeOutcome';
const CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT = 'causalDebt';
const CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW = 'crossBoundaryReview';
const SCENARIO_CAUSAL_CLOSURE_FIELD_REFERENCE = 'referenceScenarioOrProbe';
const SCENARIO_CAUSAL_CLOSURE_FIELD_PHASE_CHAIN = 'phaseChain';
const SCENARIO_CAUSAL_CLOSURE_FIELD_CURRENT_FRONTIER = 'currentFirstFrontier';
const SCENARIO_CAUSAL_CLOSURE_FIELD_DOWNSTREAM_BLOCKERS =
  'knownDownstreamBlockers';
const SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE = 'missingCausalEdge';
const SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE_PROBE =
  'missingCausalEdgeProbe';
const SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF = 'boundedProgressProof';
const SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF_ARTIFACT =
  'boundedProgressProofArtifact';
const SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_OBSERVABLE_TRANSITION =
  'expectedObservableTransition';
const SCENARIO_CAUSAL_CLOSURE_FIELD_MAX_PROGRESS_BOUND = 'maxProgressBound';
const SCENARIO_CAUSAL_CLOSURE_FIELD_SAME_FRONTIER_FALLBACK =
  'sameFrontierFallback';
const SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_NEXT_FRONTIER =
  'expectedNextFrontier';
const SCENARIO_CAUSAL_CLOSURE_FIELD_RESULT_CLASSIFICATION =
  'resultClassification';
const SCENARIO_CAUSAL_CLOSURE_FIELD_STOP_CONDITION = 'stopCondition';

function appendSection(lines, title) {
  lines.push(EMPTY_STRING, `${SECTION_HEADING_PREFIX}${title}`);
}

function normalizeString(value) {
  return String(value || EMPTY_STRING).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, REGEXP_ESCAPE_REPLACEMENT);
}

function normalizeStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeString)
        .filter((value) => value.length > NUM_ZERO),
    ),
  ];
}

function appendKeyValue(lines, label, value) {
  const normalizedValue = normalizeString(value) || DEFAULT_UNKNOWN;
  lines.push(`${MARKDOWN_LIST_PREFIX}${label}${LABEL_SEPARATOR}${normalizedValue}`);
}

function appendList(lines, values, fallback) {
  const normalizedValues = normalizeStringList(values);
  if (normalizedValues.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${fallback}`);
    return;
  }
  for (const value of normalizedValues) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${value}`);
  }
}

function architectureGateChoiceLabels(choices = []) {
  if (!Array.isArray(choices)) {
    return [];
  }
  return choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') {
        return EMPTY_STRING;
      }
      return [
        normalizeString(choice.id) || DEFAULT_UNKNOWN,
        `route=${normalizeString(choice.route) || DEFAULT_UNKNOWN}`,
        normalizeString(choice.summary) || DEFAULT_UNKNOWN,
      ].join(' ');
    })
    .filter((value) => value.length > NUM_ZERO);
}

function shellQuote(value) {
  const normalizedValue = normalizeString(value);
  if (SHELL_SAFE_PATTERN.test(normalizedValue)) {
    return normalizedValue;
  }
  return SINGLE_QUOTE +
    normalizedValue.replaceAll(SINGLE_QUOTE, SINGLE_QUOTE_ESCAPE) +
    SINGLE_QUOTE;
}

function commandWithPaths(command, paths = []) {
  const normalizedPaths = normalizeStringList(paths);
  if (normalizedPaths.length === NUM_ZERO) {
    return command;
  }
  return [
    command,
    ...normalizedPaths.map(shellQuote),
  ].join(SPACE);
}

function parseOptionValue(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < NUM_ZERO) {
    return EMPTY_STRING;
  }
  return normalizeString(args[optionIndex + NUM_ONE]);
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function readJsonFile(filePath) {
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

async function readOptionalTextFile(filePath) {
  try {
    return {
      content: await readTextFile(filePath),
      status: OPTIONAL_TEXT_PRESENT,
    };
  } catch (_error) {
    return {
      content: EMPTY_STRING,
      status: OPTIONAL_TEXT_MISSING,
    };
  }
}

async function readTheoryLedgerContext() {
  try {
    const content = await readTextFile(THEORY_LEDGER_PATH);
    return validateTheoryLedgerContent(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        entries: [],
        errors: [`${THEORY_LEDGER_PATH} is missing.`],
      };
    }
    return {
      entries: [],
      errors: [error.message],
    };
  }
}

function buildTheoryLedgerReferenceLines(currentBlocker = {}, ledgerContext = {}) {
  const refs = normalizeStringList(currentBlocker.theoryLedgerRefs);
  const entries = ledgerContext.entries || [];
  const ledgerErrors = ledgerContext.errors || [];
  if (ledgerErrors.length > NUM_ZERO) {
    return [
      `Theory ledger unavailable; run npm run work:theory-ledger -- validate. ${ledgerErrors[NUM_ZERO]}`,
    ];
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const missingRefs = findMissingTheoryLedgerRefs(entries, refs);
  if (refs.length > NUM_ZERO) {
    const lines = refs
      .map((ref) => entryById.get(ref))
      .filter(Boolean)
      .map(summarizeTheoryLedgerEntry);
    for (const missingRef of missingRefs) {
      lines.push(
        `${missingRef} [missing] - run npm run work:theory-ledger -- validate and repair the package ref.`,
      );
    }
    return lines;
  }
  const relatedEntries = findRelatedTheoryLedgerEntries(entries, currentBlocker, {
    limit: THEORY_LEDGER_RELATED_LIMIT,
  });
  if (relatedEntries.length === NUM_ZERO) {
    return ['No related theory ledger refs recorded.'];
  }
  return [
    'No explicit refs recorded. Related advisory candidates to review before repeating an old route:',
    ...relatedEntries.map(summarizeTheoryLedgerEntry),
  ];
}

function parsePackageMetadata(content, filePath) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata is required.`);
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata closing marker is missing.`);
  }
  const rawMetadata = JSON.parse(content.slice(jsonStart, closeIndex).trim());
  return normalizeMetadata(rawMetadata, filePath);
}

function parseOptionalPackageMetadata(content, filePath) {
  try {
    return parsePackageMetadata(content, filePath || DEFAULT_UNKNOWN);
  } catch (_error) {
    return null;
  }
}

async function buildCurrentBlockerFromPackage(packagePath) {
  const content = await readTextFile(packagePath);
  const metadata = parsePackageMetadata(content, packagePath);
  const packageHistoryEntries = await collectPackageHistoryEntries();
  const architectureDecisionGate = metadataObject(
    metadata,
    METADATA_FIELD_ARCHITECTURE_DECISION_GATE,
  );
  return {
    currentBlocker: {
      sprint: DEFAULT_UNKNOWN,
      package: packagePath,
      status: metadataText(metadata, METADATA_FIELD_STATUS),
      lane: metadataText(metadata, METADATA_FIELD_LANE),
      scenario: metadataText(metadata, METADATA_FIELD_SCENARIO),
      artifact: metadataText(metadata, METADATA_FIELD_ARTIFACT),
      playback: metadataText(metadata, METADATA_FIELD_PLAYBACK),
      owner: metadataText(metadata, METADATA_FIELD_OWNER),
      boundary: metadataText(metadata, METADATA_FIELD_BOUNDARY),
      dominantReason: metadataText(metadata, METADATA_FIELD_DOMINANT_REASON),
      currentState: metadataText(metadata, METADATA_FIELD_CURRENT_STATE),
      nextAction: metadataText(metadata, METADATA_FIELD_NEXT_ACTION),
      proof: metadataList(metadata, METADATA_FIELD_PROOF),
      touchedFiles: metadataList(metadata, METADATA_FIELD_TOUCHED_FILES),
      writeScope: metadataList(metadata, METADATA_FIELD_WRITE_SCOPE),
      handoffFiles: metadataList(metadata, METADATA_FIELD_HANDOFF_FILES),
      generatedFiles: metadataList(metadata, METADATA_FIELD_GENERATED_FILES),
      candidateRuntimeFiles:
        metadataList(metadata, METADATA_FIELD_CANDIDATE_RUNTIME_FILES),
      commitScope: metadataList(metadata, METADATA_FIELD_COMMIT_SCOPE),
      theoryLedgerRefs: metadataList(metadata, METADATA_FIELD_THEORY_LEDGER_REFS),
      modelFit: metadataModelFit(metadata),
      representativeResidual: metadataObject(
        metadata,
        METADATA_FIELD_REPRESENTATIVE_RESIDUAL,
      ),
      causalGovernance: metadataCausalGovernance(metadata),
      scenarioCausalClosure: metadataScenarioCausalClosure(metadata),
      architectureDecisionGate:
        Object.keys(architectureDecisionGate).length > NUM_ZERO ?
          architectureDecisionGate :
          buildArchitectureDecisionGatePayload(
            metadata,
            packagePath,
            {packageHistoryEntries},
          ),
      predecessor: metadataText(metadata, METADATA_FIELD_PREDECESSOR),
    },
    packageContent: content,
  };
}

async function buildCurrentBlockerFromActivePackage() {
  const activeSprintFile = await findActiveSprintFile();
  const activePackageFile = await findActivePackageFile(activeSprintFile);
  if (!activePackageFile) {
    throw new Error(MESSAGE_CURRENT_BLOCKER_MISSING);
  }
  const content = await readTextFile(activePackageFile);
  const metadata = parsePackageMetadata(content, activePackageFile);
  return {
    currentBlocker: buildCurrentBlockerPayload(
      activeSprintFile,
      activePackageFile,
      metadata,
      {packageHistoryEntries: await collectPackageHistoryEntries()},
    ),
    packageContent: content,
  };
}

function metadataText(metadata, fieldName) {
  return normalizeString(metadata[fieldName]) || DEFAULT_UNKNOWN;
}

function metadataList(metadata, fieldName) {
  return Array.isArray(metadata[fieldName]) ? metadata[fieldName] : [];
}

function metadataObject(metadata, fieldName) {
  const value = metadata[fieldName];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function metadataModelFit(metadata) {
  const modelFit = metadataObject(metadata, METADATA_FIELD_MODEL_FIT);
  return {
    [MODEL_FIT_FIELD_PACKAGE_CLASS]:
      metadataText(modelFit, MODEL_FIT_FIELD_PACKAGE_CLASS),
    [MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL]:
      metadataText(modelFit, MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL),
    [MODEL_FIT_FIELD_SCOPE_SHAPE]:
      metadataText(modelFit, MODEL_FIT_FIELD_SCOPE_SHAPE),
    [MODEL_FIT_FIELD_OUTPUT_PROFILE]:
      metadataText(modelFit, MODEL_FIT_FIELD_OUTPUT_PROFILE),
    [MODEL_FIT_FIELD_ESCALATION_TRIGGERS]:
      metadataList(modelFit, MODEL_FIT_FIELD_ESCALATION_TRIGGERS),
  };
}

function metadataCausalGovernance(metadata) {
  const causalGovernance = metadataObject(
    metadata,
    METADATA_FIELD_CAUSAL_GOVERNANCE,
  );
  return {
    [CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS]:
      metadataText(causalGovernance, CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS),
    [CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK,
      ),
    [CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE,
      ),
    [CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME,
      ),
    [CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT]:
      metadataText(causalGovernance, CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT),
    [CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW,
      ),
  };
}

function metadataScenarioCausalClosure(metadata) {
  const scenarioCausalClosure = metadataObject(
    metadata,
    METADATA_FIELD_SCENARIO_CAUSAL_CLOSURE,
  );
  return {
    [SCENARIO_CAUSAL_CLOSURE_FIELD_REFERENCE]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_REFERENCE,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_PHASE_CHAIN]:
      metadataList(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_PHASE_CHAIN,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_CURRENT_FRONTIER]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_CURRENT_FRONTIER,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_DOWNSTREAM_BLOCKERS]:
      metadataList(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_DOWNSTREAM_BLOCKERS,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE_PROBE]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE_PROBE,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF_ARTIFACT]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF_ARTIFACT,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_OBSERVABLE_TRANSITION]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_OBSERVABLE_TRANSITION,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_MAX_PROGRESS_BOUND]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_MAX_PROGRESS_BOUND,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_SAME_FRONTIER_FALLBACK]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_SAME_FRONTIER_FALLBACK,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_NEXT_FRONTIER]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_NEXT_FRONTIER,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_RESULT_CLASSIFICATION]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_RESULT_CLASSIFICATION,
      ),
    [SCENARIO_CAUSAL_CLOSURE_FIELD_STOP_CONDITION]:
      metadataText(
        scenarioCausalClosure,
        SCENARIO_CAUSAL_CLOSURE_FIELD_STOP_CONDITION,
      ),
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function extractMarkdownTitle(content = EMPTY_STRING) {
  const titleLine = content
    .split(NEWLINE)
    .find((line) => line.startsWith(MARKDOWN_HEADING_PREFIX));
  return titleLine ?
    titleLine.slice(MARKDOWN_HEADING_PREFIX.length).trim() :
    DEFAULT_UNKNOWN;
}

function appendOpenChecklistItem(items, itemParts) {
  const item = normalizeString(itemParts.join(SPACE));
  itemParts.length = NUM_ZERO;
  if (
    item.length > NUM_ZERO &&
    !OPEN_CHECKLIST_TEMPLATE_PLACEHOLDER_PATTERN.test(item)
  ) {
    items.push(item);
  }
}

function extractOpenChecklist(content = EMPTY_STRING) {
  const items = [];
  const currentItemParts = [];

  for (const rawLine of content.split(NEWLINE)) {
    const line = rawLine.trim();
    if (line.startsWith(CHECKBOX_OPEN_PREFIX)) {
      appendOpenChecklistItem(items, currentItemParts);
      currentItemParts.push(line.slice(CHECKBOX_OPEN_PREFIX.length).trim());
      continue;
    }
    if (
      line.length === NUM_ZERO ||
      line.startsWith(CHECKBOX_ANY_PREFIX) ||
      line.startsWith(SECTION_HEADING_PREFIX)
    ) {
      appendOpenChecklistItem(items, currentItemParts);
      continue;
    }
    if (currentItemParts.length > NUM_ZERO) {
      currentItemParts.push(line);
    }
  }

  appendOpenChecklistItem(items, currentItemParts);
  return items;
}

function startsMarkdownListItem(line) {
  return (
    NUMBERED_LIST_PATTERN.test(line) ||
    line.startsWith(MARKDOWN_LIST_PREFIX)
  );
}

function stripMarkdownListMarker(line) {
  if (NUMBERED_LIST_PATTERN.test(line)) {
    return line.replace(NUMBERED_LIST_PATTERN, EMPTY_STRING).trim();
  }
  if (line.startsWith(MARKDOWN_LIST_PREFIX)) {
    return line.slice(MARKDOWN_LIST_PREFIX.length).trim();
  }
  return line;
}

function appendMarkdownSectionItem(items, itemParts) {
  const item = normalizeString(itemParts.join(SPACE));
  itemParts.length = NUM_ZERO;
  if (item.length > NUM_ZERO) {
    items.push(item);
  }
}

function extractMarkdownSection(content = EMPTY_STRING, title) {
  const lines = content.split(NEWLINE);
  const heading = `${SECTION_HEADING_PREFIX}${title}`;
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < NUM_ZERO) {
    return [];
  }
  const sectionItems = [];
  const currentItemParts = [];
  for (const line of lines.slice(startIndex + NUM_ONE)) {
    if (line.startsWith(SECTION_HEADING_PREFIX)) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      break;
    }
    const trimmedLine = line.trim();
    if (trimmedLine.length === NUM_ZERO) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      continue;
    }
    if (startsMarkdownListItem(trimmedLine)) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      currentItemParts.push(stripMarkdownListMarker(trimmedLine));
      continue;
    }
    if (currentItemParts.length > NUM_ZERO) {
      currentItemParts.push(trimmedLine);
      continue;
    }
    sectionItems.push(trimmedLine);
  }
  appendMarkdownSectionItem(sectionItems, currentItemParts);
  return sectionItems;
}

function extractMarkdownSectionText(content = EMPTY_STRING, title) {
  const heading = `${SECTION_HEADING_PREFIX}${title}`;
  const startIndex = content.indexOf(heading);
  if (startIndex < NUM_ZERO) {
    return EMPTY_STRING;
  }
  const nextHeadingIndex = content.indexOf(
    `${NEWLINE}${SECTION_HEADING_PREFIX}`,
    startIndex + heading.length,
  );
  return nextHeadingIndex < NUM_ZERO ?
    content.slice(startIndex) :
    content.slice(startIndex, nextHeadingIndex);
}

function findMarkdownFieldValue(section, label) {
  const fieldPrefix = `${label}${LABEL_SEPARATOR}`;
  const itemParts = [];
  for (const rawLine of section.split(NEWLINE)) {
    const line = rawLine.trim();
    if (startsMarkdownListItem(line)) {
      if (itemParts.length > NUM_ZERO) {
        break;
      }
      const item = stripMarkdownListMarker(line);
      if (item.toLowerCase().startsWith(fieldPrefix.toLowerCase())) {
        itemParts.push(item.slice(fieldPrefix.length).trim());
      }
      continue;
    }
    if (
      itemParts.length > NUM_ZERO &&
      line.length > NUM_ZERO &&
      !line.startsWith(SECTION_HEADING_PREFIX)
    ) {
      itemParts.push(line);
    }
  }
  if (itemParts.length === NUM_ZERO) {
    const pattern = new RegExp(
      `${escapeRegExp(label)}:\\s*([^\\n]+)`,
      'iu',
    );
    const match = pattern.exec(section);
    if (!match) {
      return EMPTY_STRING;
    }
    itemParts.push(match[NUM_ONE]);
  }
  return normalizeString(itemParts.join(SPACE)).replace(/^`|`$/gu, EMPTY_STRING);
}

function buildModelFitContext(currentBlocker = {}, packageContent = EMPTY_STRING) {
  const metadataModel = currentBlocker.modelFit || {};
  const section = extractMarkdownSectionText(packageContent, PACKAGE_SECTION_MODEL_FIT);
  const sectionTriggers = findMarkdownFieldValue(
    section,
    MODEL_FIT_LABEL_ESCALATION_TRIGGERS,
  );
  const triggers = sectionTriggers ?
    normalizeStringList([sectionTriggers]) :
    normalizeStringList(metadataModel[MODEL_FIT_FIELD_ESCALATION_TRIGGERS]);
  return {
    [MODEL_FIT_FIELD_PACKAGE_CLASS]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_PACKAGE_CLASS) ||
      metadataModel[MODEL_FIT_FIELD_PACKAGE_CLASS] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_INTENDED_MINIMUM_MODEL) ||
      metadataModel[MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_SCOPE_SHAPE]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_SCOPE_SHAPE) ||
      metadataModel[MODEL_FIT_FIELD_SCOPE_SHAPE] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_OUTPUT_PROFILE]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_OUTPUT_PROFILE) ||
      metadataModel[MODEL_FIT_FIELD_OUTPUT_PROFILE] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_ESCALATION_TRIGGERS]: triggers,
  };
}

function findCheckedLedgerItem(ledger, label) {
  const pattern = new RegExp(
    `- \\[[xX]\\] ${escapeRegExp(label)}:([\\s\\S]*?)(?=\\n- \\[|$)`,
    'u',
  );
  const match = pattern.exec(ledger);
  return match ? normalizeString(match[NUM_ZERO].replace(/\s+/gu, SPACE)) : null;
}

function findReviewResult(reviewItem) {
  if (isNotNeededReview(reviewItem)) {
    return SUBAGENT_REVIEW_RESULT_CLEAN;
  }
  const match = SUBAGENT_REVIEW_RESULT_PATTERN.exec(reviewItem || EMPTY_STRING);
  return match ? match[NUM_ONE].toLowerCase() : EMPTY_STRING;
}

function isNotNeededReview(reviewItem) {
  const normalizedItem = normalizeString(reviewItem).toLowerCase();
  return normalizedItem.includes(SUBAGENT_FIX_NOT_NEEDED) &&
    normalizedItem.includes(SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE);
}

function isNotNeededFix(fixItem) {
  return normalizeString(fixItem).includes(SUBAGENT_FIX_NOT_NEEDED);
}

function isReviewFixedMetadataOnlyFix(fixItem) {
  const normalizedItem = normalizeString(fixItem);
  const scopeMatch =
    SUBAGENT_REVIEW_FIXED_METADATA_SCOPE_FIELD_PATTERN.exec(normalizedItem);
  const scope = scopeMatch ? normalizeString(scopeMatch[NUM_ONE]) : EMPTY_STRING;
  return normalizedItem.includes(SUBAGENT_FIX_REVIEW_FIXED_METADATA_ONLY) &&
    hasRealAgentProof(fixItem) &&
    SUBAGENT_REVIEW_FIXED_METADATA_SCOPE_PATTERN.test(scope);
}

function hasRealAgentProof(ledgerItem) {
  const normalizedItem = normalizeString(ledgerItem);
  return SUBAGENT_AGENT_ID_PATTERN.test(normalizedItem) &&
    !SUBAGENT_NON_REAL_IDENTITY_PATTERN.test(normalizedItem);
}

function findStrictValidationRole(errors) {
  const firstError = errors[NUM_ZERO] || EMPTY_STRING;
  if (SUBAGENT_SEQUENCE_ORDER_ERROR_PATTERN.test(firstError)) {
    return SUBAGENT_ROLE_REVIEW;
  }
  if (
    firstError.includes(SUBAGENT_LEDGER_FIX_LABEL) ||
    SUBAGENT_FIX_ERROR_PATTERN.test(firstError)
  ) {
    return SUBAGENT_ROLE_FIX;
  }
  if (
    firstError.includes(SUBAGENT_LEDGER_IMPLEMENTATION_LABEL) ||
    SUBAGENT_IMPLEMENTATION_ERROR_PATTERN.test(firstError)
  ) {
    return SUBAGENT_ROLE_IMPLEMENTATION;
  }
  return SUBAGENT_ROLE_REVIEW;
}

function buildStrictValidationStatus(errors) {
  const firstError = normalizeString(errors[NUM_ZERO]);
  return firstError.length === NUM_ZERO ?
    SUBAGENT_STATUS_STRICT_VALIDATION_FAILED :
    `${SUBAGENT_STATUS_STRICT_VALIDATION_FAILED} ${firstError}`;
}

function buildSubagentRoleStatus(role, status) {
  return {role, status};
}

function findCheckedImplementationExecutionEvidence(packageContent) {
  return extractMarkdownSection(packageContent, PACKAGE_SECTION_EXECUTION_EVIDENCE)
    .find((item) =>
      SUBAGENT_PROGRESS_CHECKED_ITEM_PATTERN.test(item) &&
      EXECUTION_EVIDENCE_IMPLEMENTATION_PATTERN.test(item));
}

function findCheckedVerificationFixExecutionEvidence(packageContent) {
  return extractMarkdownSection(packageContent, PACKAGE_SECTION_EXECUTION_EVIDENCE)
    .find((item) =>
      SUBAGENT_PROGRESS_CHECKED_ITEM_PATTERN.test(item) &&
      EXECUTION_EVIDENCE_VERIFICATION_FIX_PATTERN.test(item));
}

function buildSubagentSequencingStatus(
  packageContent = EMPTY_STRING,
  packagePath = EMPTY_STRING,
) {
  if (
    normalizeString(packagePath).toLowerCase() === 'none' &&
    normalizeString(packageContent).length === NUM_ZERO
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_NONE,
      'No active package; verifier-fixer applies when a future package reaches closure.',
    );
  }
  const metadata = parseOptionalPackageMetadata(packageContent, packagePath);
  const requiresVerificationFix = metadataRequiresVerificationFix(metadata);
  if (
    metadata &&
    !metadataRequiresSubagentSequencing(metadata) &&
    !requiresVerificationFix
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_NONE,
      SUBAGENT_STATUS_NOT_REQUIRED,
    );
  }
  const executionEvidenceItem =
    findCheckedImplementationExecutionEvidence(packageContent);
  if (executionEvidenceItem) {
    const normalizedPackagePath = normalizeString(packagePath);
    if (normalizedPackagePath.length > NUM_ZERO) {
      const implementationEvidenceErrors = validateExecutionEvidenceLedger(
        packageContent,
        normalizedPackagePath,
        {
          [LEDGER_VALIDATION_REQUIRES_LEDGER]: true,
        },
      );
      if (implementationEvidenceErrors.length > NUM_ZERO) {
        return buildSubagentRoleStatus(
          SUBAGENT_ROLE_IMPLEMENTATION,
          buildStrictValidationStatus(implementationEvidenceErrors),
        );
      }
      if (requiresVerificationFix) {
        const verificationEvidenceErrors = validateExecutionEvidenceLedger(
          packageContent,
          normalizedPackagePath,
          {
            [LEDGER_VALIDATION_REQUIRES_LEDGER]: true,
            [LEDGER_VALIDATION_REQUIRES_VERIFICATION_FIX]: true,
          },
        );
        const hasVerificationFix =
          findCheckedVerificationFixExecutionEvidence(packageContent);
        if (verificationEvidenceErrors.length > NUM_ZERO) {
          if (!hasVerificationFix) {
            return buildSubagentRoleStatus(
              SUBAGENT_ROLE_VERIFICATION_FIX,
              SUBAGENT_STATUS_VERIFICATION_FIX_MISSING,
            );
          }
          return buildSubagentRoleStatus(
            SUBAGENT_ROLE_VERIFICATION_FIX,
            buildStrictValidationStatus(verificationEvidenceErrors),
          );
        }
      }
    } else if (!EXECUTION_EVIDENCE_PARENT_REVALIDATED_PATTERN.test(
      executionEvidenceItem,
    )) {
      return buildSubagentRoleStatus(
        SUBAGENT_ROLE_IMPLEMENTATION,
        'Execution Evidence implementation item needs parent revalidation before closure.',
      );
    }
    if (
      requiresVerificationFix &&
      !findCheckedVerificationFixExecutionEvidence(packageContent)
    ) {
      return buildSubagentRoleStatus(
        SUBAGENT_ROLE_VERIFICATION_FIX,
        SUBAGENT_STATUS_VERIFICATION_FIX_MISSING,
      );
    }
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_NONE,
      requiresVerificationFix ?
        SUBAGENT_STATUS_VERIFICATION_FIX_RECORDED :
        SUBAGENT_STATUS_IMPLEMENTATION_RECORDED,
    );
  }
  const ledger = extractMarkdownSectionText(
    packageContent,
    PACKAGE_SECTION_SUBAGENT_LEDGER,
  );
  if (ledger.length === NUM_ZERO) {
    return buildSubagentRoleStatus(
      (metadataRequiresSubagentSequencing(metadata) || requiresVerificationFix) ?
        SUBAGENT_ROLE_IMPLEMENTATION :
        SUBAGENT_ROLE_NONE,
      SUBAGENT_STATUS_LEDGER_MISSING,
    );
  }
  if (!SUBAGENT_LEDGER_CHECKED_LINE_PATTERN.test(ledger)) {
    return buildSubagentRoleStatus(
      (metadataRequiresSubagentSequencing(metadata) || requiresVerificationFix) ?
        SUBAGENT_ROLE_IMPLEMENTATION :
        SUBAGENT_ROLE_NONE,
      SUBAGENT_STATUS_LEDGER_MISSING,
    );
  }
  const reviewItem = findCheckedLedgerItem(ledger, SUBAGENT_LEDGER_REVIEW_LABEL);
  if (!reviewItem) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_REVIEW_MISSING,
    );
  }
  if (!isNotNeededReview(reviewItem) && !hasRealAgentProof(reviewItem)) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_REVIEW_MISSING,
    );
  }
  const fixItem = findCheckedLedgerItem(ledger, SUBAGENT_LEDGER_FIX_LABEL);
  const reviewResult = findReviewResult(reviewItem);
  if (!reviewResult) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_REVIEW_MISSING,
    );
  }
  if (!fixItem) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      reviewResult === SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED ?
        SUBAGENT_STATUS_FIX_REQUIRED :
        SUBAGENT_STATUS_FIX_NOT_NEEDED_MISSING,
    );
  }
  if (
    reviewResult === SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED &&
    isNotNeededFix(fixItem)
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      SUBAGENT_STATUS_FIX_REQUIRED,
    );
  }
  if (
    !isNotNeededFix(fixItem) &&
    !isReviewFixedMetadataOnlyFix(fixItem) &&
    !hasRealAgentProof(fixItem)
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      SUBAGENT_STATUS_FIX_MISSING,
    );
  }
  if (
    reviewResult === SUBAGENT_REVIEW_RESULT_CLEAN &&
    !isNotNeededFix(fixItem)
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      SUBAGENT_STATUS_FIX_NOT_NEEDED_MISSING,
    );
  }
  const implementationItem = findCheckedLedgerItem(
    ledger,
    SUBAGENT_LEDGER_IMPLEMENTATION_LABEL,
  );
  if (!implementationItem) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_IMPLEMENTATION,
      SUBAGENT_STATUS_IMPLEMENTATION_MISSING,
    );
  }
  if (!hasRealAgentProof(implementationItem)) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_IMPLEMENTATION,
      SUBAGENT_STATUS_IMPLEMENTATION_MISSING,
    );
  }
  const normalizedPackagePath = normalizeString(packagePath);
  if (normalizedPackagePath.length > NUM_ZERO) {
    const strictErrors = validateSubagentSequencingLedger(
      packageContent,
      normalizedPackagePath,
      {
        [LEDGER_VALIDATION_REQUIRES_LEDGER]: true,
        [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: true,
      },
    );
    if (strictErrors.length > NUM_ZERO) {
      return buildSubagentRoleStatus(
        findStrictValidationRole(strictErrors),
        buildStrictValidationStatus(strictErrors),
      );
    }
  }
  return buildSubagentRoleStatus(
    SUBAGENT_ROLE_NONE,
    SUBAGENT_STATUS_IMPLEMENTATION_RECORDED,
  );
}

function buildSubagentProgressSummary(packageContent = EMPTY_STRING) {
  const progressItems = [
    ...extractMarkdownSection(
      packageContent,
      PACKAGE_SECTION_EXECUTION_EVIDENCE,
    ),
    ...extractMarkdownSection(
      packageContent,
      PACKAGE_SECTION_SUBAGENT_PROGRESS_LEDGER,
    ),
    ...extractMarkdownSection(
      packageContent,
      PACKAGE_SECTION_SUBAGENT_PROGRESS_ATTEMPT_LEDGER,
    ),
  ]
    .filter((item) => SUBAGENT_PROGRESS_CHECKED_ITEM_PATTERN.test(item))
    .map((item) =>
      item.replace(SUBAGENT_PROGRESS_CHECKED_ITEM_PATTERN, EMPTY_STRING));
  if (progressItems.length === NUM_ZERO) {
    return [MESSAGE_NO_SUBAGENT_PROGRESS];
  }
  return progressItems.slice(-SUBAGENT_PROGRESS_ITEM_LIMIT);
}

async function resolvePathPresenceLabel(filePath) {
  if (isGlobPattern(filePath)) {
    return `${filePath} (${PATH_PATTERN})`;
  }
  const exists = await fileExists(filePath);
  return `${filePath} (${exists ? PATH_PRESENT : PATH_MISSING})`;
}

function isGlobPattern(filePath) {
  const normalizedPath = normalizeString(filePath);
  return GLOB_PATTERN_MARKERS.some((marker) => normalizedPath.includes(marker));
}

function pathHasRealValue(filePath) {
  const normalizedPath = normalizeString(filePath);
  return normalizedPath.length > NUM_ZERO && normalizedPath !== PATH_NONE;
}

function scopeList(currentBlocker = {}, fieldName, fallbackFieldName = null) {
  const values = normalizeStringList(currentBlocker[fieldName]);
  if (values.length > NUM_ZERO) {
    return values;
  }
  return fallbackFieldName ?
    normalizeStringList(currentBlocker[fallbackFieldName]) :
    [];
}

function buildWriteScope(currentBlocker = {}) {
  return scopeList(
    currentBlocker,
    METADATA_FIELD_WRITE_SCOPE,
    METADATA_FIELD_TOUCHED_FILES,
  );
}

function buildHandoffFiles(currentBlocker = {}) {
  return scopeList(currentBlocker, METADATA_FIELD_HANDOFF_FILES);
}

function buildGeneratedFiles(currentBlocker = {}) {
  return scopeList(currentBlocker, METADATA_FIELD_GENERATED_FILES);
}

function buildCandidateRuntimeFiles(currentBlocker = {}) {
  return scopeList(currentBlocker, METADATA_FIELD_CANDIDATE_RUNTIME_FILES);
}

function buildCommitScope(currentBlocker = {}) {
  const commitScope = scopeList(currentBlocker, METADATA_FIELD_COMMIT_SCOPE);
  return commitScope.length > NUM_ZERO ? commitScope : buildWriteScope(currentBlocker);
}

function firstNonEmptyValue(values = []) {
  return values
    .map((value) => normalizeString(value))
    .find((value) =>
      value.length > NUM_ZERO &&
      value !== DEFAULT_UNKNOWN) || DEFAULT_UNKNOWN;
}

function firstProofCommand(currentBlocker = {}) {
  return normalizeStringList(currentBlocker.proof)[NUM_ZERO] || DEFAULT_UNKNOWN;
}

function buildImplementationFiles(currentBlocker = {}) {
  const implementationFiles = normalizeStringList([
    ...buildWriteScope(currentBlocker),
    ...buildCandidateRuntimeFiles(currentBlocker),
  ]).filter((filePath) => IMPLEMENTATION_SCOPE_PATH_PATTERN.test(filePath));
  return implementationFiles.length > NUM_ZERO ?
    implementationFiles :
    buildWriteScope(currentBlocker);
}

function buildTheoryImplementationFocus(currentBlocker = {}) {
  const causalGovernance = currentBlocker.causalGovernance || {};
  const scenarioCausalClosure = currentBlocker.scenarioCausalClosure || {};
  const rerunDecision = currentBlocker.rerunDecision || {};
  return {
    theoryUnderTest: firstNonEmptyValue([
      causalGovernance[CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS],
      currentBlocker.currentState,
    ]),
    causalQuestion: firstNonEmptyValue([
      scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE],
      currentBlocker.dominantReason,
    ]),
    implementationSlice: firstNonEmptyValue([
      currentBlocker.nextAction,
    ]),
    implementationFiles: buildImplementationFiles(currentBlocker),
    expectedImplementationDelta: firstNonEmptyValue([
      causalGovernance[CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE],
      scenarioCausalClosure[
        SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_OBSERVABLE_TRANSITION
      ],
      rerunDecision.expectedDelta,
    ]),
    falsifyingProbe: firstNonEmptyValue([
      scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE_PROBE],
      causalGovernance[CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK],
      firstProofCommand(currentBlocker),
    ]),
    stopRule: firstNonEmptyValue([
      scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_SAME_FRONTIER_FALLBACK],
      scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_STOP_CONDITION],
      normalizeStringList(
        currentBlocker.modelFit?.[MODEL_FIT_FIELD_ESCALATION_TRIGGERS],
      ).join(', '),
      currentBlocker.architectureDecisionGate?.nextAction,
      currentBlocker.nextAction,
    ]),
  };
}

function buildReadScope(currentBlocker = {}) {
  return normalizeStringList([
    ...buildWriteScope(currentBlocker),
    ...buildHandoffFiles(currentBlocker),
    ...buildGeneratedFiles(currentBlocker),
    ...buildCandidateRuntimeFiles(currentBlocker),
  ]);
}

function buildOwnerCardPaths(currentBlocker) {
  const touchedFiles = normalizeStringList([
    ...buildWriteScope(currentBlocker),
    ...buildCandidateRuntimeFiles(currentBlocker),
  ]);
  const ownerCards = [];

  for (const filePath of touchedFiles) {
    if (!filePath.startsWith(SOURCE_DIRECTORY_PREFIX)) {
      continue;
    }
    const parts = filePath.split(path.sep);
    if (parts.length < NUM_TWO) {
      continue;
    }
    ownerCards.push(path.join(SOURCE_DIRECTORY_PREFIX, parts[NUM_ONE], README_FILE_NAME));
  }

  return normalizeStringList(ownerCards);
}

function domainPackDescriptor(domain, reason) {
  return {
    domain,
    path: LLM_DOMAIN_PACKS[domain],
    reason,
  };
}

function uniqueDomainPackDescriptors(descriptors = []) {
  const seenPaths = new Set();
  const uniqueDescriptors = [];
  for (const descriptor of descriptors) {
    if (!descriptor?.path || seenPaths.has(descriptor.path)) {
      continue;
    }
    seenPaths.add(descriptor.path);
    uniqueDescriptors.push(descriptor);
  }
  return uniqueDescriptors;
}

function hasScenarioSignal(currentBlocker = {}) {
  const scenario = normalizeString(currentBlocker.scenario);
  return pathHasRealValue(currentBlocker.artifact) ||
    pathHasRealValue(currentBlocker.playback) ||
    (
      scenario.length > NUM_ZERO &&
      scenario !== DEFAULT_UNKNOWN &&
      scenario !== PATH_NONE
    );
}

function buildRelevantLlmDomainPackDescriptors(currentBlocker) {
  const readScope = buildReadScope(currentBlocker);
  const writeScope = buildWriteScope(currentBlocker);
  const domainPacks = [];
  if (readScope.some((filePath) => filePath.startsWith(SOURCE_DIRECTORY_PREFIX))) {
    domainPacks.push(domainPackDescriptor(
      LLM_DOMAIN_ARCHITECTURE,
      'runtime or source ownership files are in scope',
    ));
  }
  if (writeScope.some((filePath) => filePath.startsWith(SCRIPT_DIRECTORY_PREFIX))) {
    domainPacks.push(domainPackDescriptor(
      LLM_DOMAIN_STYLE,
      'workflow scripts or lint-sensitive tooling are in scope',
    ));
  }
  if (
    readScope.some((filePath) => filePath.startsWith(TEST_DIRECTORY_PREFIX)) ||
    hasScenarioSignal(currentBlocker)
  ) {
    domainPacks.push(domainPackDescriptor(
      LLM_DOMAIN_TESTING,
      'tests, scenario, artifact, or playback evidence are in scope',
    ));
  }
  if (
    readScope.some((filePath) => filePath.startsWith(WORK_README_PATH)) ||
    readScope.some((filePath) => filePath.startsWith(WORK_DIRECTORY_PREFIX))
  ) {
    domainPacks.push(domainPackDescriptor(
      LLM_DOMAIN_GOVERNANCE,
      'work package, sprint, or tracker files are in scope',
    ));
  }
  return uniqueDomainPackDescriptors(
    domainPacks.length > NUM_ZERO ?
      domainPacks :
      [domainPackDescriptor(LLM_DOMAIN_GOVERNANCE, 'default workflow scope')],
  );
}

function buildPrimaryLlmDomainPackDescriptor(currentBlocker) {
  return buildRelevantLlmDomainPackDescriptors(currentBlocker)[NUM_ZERO];
}

function buildSecondaryLlmDomainPackDescriptors(currentBlocker) {
  return buildRelevantLlmDomainPackDescriptors(currentBlocker).slice(NUM_ONE);
}

function buildRelevantLlmDomainPackPaths(currentBlocker) {
  const primaryDescriptor = buildPrimaryLlmDomainPackDescriptor(currentBlocker);
  return primaryDescriptor ? [primaryDescriptor.path] : [LLM_STEERING_GOVERNANCE_PATH];
}

async function buildSecondarySteeringPackLabels(currentBlocker) {
  const descriptors = buildSecondaryLlmDomainPackDescriptors(currentBlocker);
  const labels = [];
  for (const descriptor of descriptors) {
    labels.push(
      `${await resolvePathPresenceLabel(descriptor.path)} - ` +
      `read only if needed: ${descriptor.reason}`,
    );
  }
  return labels;
}

function primarySteeringPackLabel(currentBlocker) {
  const descriptor = buildPrimaryLlmDomainPackDescriptor(currentBlocker);
  if (!descriptor) {
    return LLM_STEERING_GOVERNANCE_PATH;
  }
  return `${descriptor.path} (${descriptor.domain})`;
}

function splitMarkdownInlineList(value) {
  return normalizeString(value)
    .replace(/`/gu, EMPTY_STRING)
    .split(/[,;]/u)
    .map(normalizeString)
    .filter((item) => item.length > NUM_ZERO);
}

function buildForbiddenScope(packageContent = EMPTY_STRING) {
  const modelFitSection = extractMarkdownSectionText(
    packageContent,
    PACKAGE_SECTION_MODEL_FIT,
  );
  const modelFitForbidden = splitMarkdownInlineList(
    findMarkdownFieldValue(modelFitSection, MODEL_FIT_LABEL_FORBIDDEN_FILES),
  );
  if (modelFitForbidden.length > NUM_ZERO) {
    return modelFitForbidden;
  }
  return normalizeStringList(
    extractMarkdownSection(packageContent, PACKAGE_SECTION_OUT_OF_SCOPE),
  );
}

function hasRuntimeSourceScope(currentBlocker = {}) {
  return buildReadScope(currentBlocker)
    .some((filePath) => filePath.startsWith(SOURCE_DIRECTORY_PREFIX));
}

function hasTestScope(currentBlocker = {}) {
  return buildReadScope(currentBlocker)
    .some((filePath) => filePath.startsWith(TEST_DIRECTORY_PREFIX));
}

function hasScriptScope(currentBlocker = {}) {
  return buildWriteScope(currentBlocker)
    .some((filePath) => filePath.startsWith(SCRIPT_DIRECTORY_PREFIX));
}

function hasWorkScope(currentBlocker = {}) {
  return buildReadScope(currentBlocker)
    .some((filePath) => filePath.startsWith(WORK_DIRECTORY_PREFIX));
}

function appendActiveRule(rules, rule) {
  if (!rules.includes(rule)) {
    rules.push(rule);
  }
}

function buildRelevantSteeringRules(currentBlocker = {}, packageContent = EMPTY_STRING) {
  const rules = [];
  const forbiddenScope = buildForbiddenScope(packageContent);
  appendActiveRule(
    rules,
    'CORE-02 Work one bounded concern; do not mix unrelated guardrail, runtime, presentation, or roadmap changes.',
  );
  appendActiveRule(
    rules,
    'CORE-15 Use canonical workflow and artifact extractors before raw JSON, logs, broad search, or ad hoc jq.',
  );
  appendActiveRule(
    rules,
    'CORE-17 Validate at the right phase: entry, pre-implementation, then closure.',
  );

  if (currentBlocker.lane === LANE_LIGHTWEIGHT_MAINTENANCE) {
    appendActiveRule(
      rules,
      'ARCH-0001 Lightweight maintenance uses one focused package and proof; omit causal ledgers and subagents unless ownership can change.',
    );
  }
  if (LOWER_MODEL_EXECUTION_LANES.includes(currentBlocker.lane)) {
    appendActiveRule(
      rules,
      'GOV-LOWER-MODEL Lower-model execution packages keep owner, boundary, write scope, proof, forbidden scope, and kill rule concrete; split or escalate on ambiguity.',
    );
  }
  if (hasRuntimeSourceScope(currentBlocker)) {
    appendActiveRule(
      rules,
      'ARCH-0042 Every runtime state transition, lifecycle decision, diagnostic grammar, and resource has one semantic owner.',
    );
    appendActiveRule(
      rules,
      'ARCH-0062 Do not keep patching symptoms while leaving the owner boundary porous.',
    );
    appendActiveRule(
      rules,
      'STYLE-0001 Do not inline domain/runtime scalars when an owner constant or explicit state variant should exist.',
    );
  }
  if (hasScenarioSignal(currentBlocker) || hasTestScope(currentBlocker)) {
    appendActiveRule(
      rules,
      'TEST-0028 The active work package must define the required validation surface.',
    );
    appendActiveRule(
      rules,
      'TEST-0083 Implementation starts only after the owner boundary and smallest proof surface are named.',
    );
  }
  if (hasScenarioSignal(currentBlocker)) {
    appendActiveRule(
      rules,
      'TEST-0085 Distributed artifact triage starts with canonical summaries and focused extractors before broad search or raw logs.',
    );
  }
  if (forbiddenScope.length > NUM_ZERO) {
    appendActiveRule(
      rules,
      'GOV-0023 Do-not-edit boundaries are higher signal than long positive scope lists.',
    );
  }
  if (hasWorkScope(currentBlocker)) {
    appendActiveRule(
      rules,
      'GOV-0078 LLM-driven package work uses canonical workflow tools before raw JSON or log slicing.',
    );
  }
  if (hasScriptScope(currentBlocker)) {
    appendActiveRule(
      rules,
      'STYLE-0007 Write code with ESLint rules in mind from the start.',
    );
  }

  for (const fallbackRule of [
    'ARCH-0041 All non-trivial implementation work must follow the repository work-tracking workflow.',
    'TEST-0028 The active work package must define the required validation surface.',
    'GOV-0078 LLM-driven package work uses canonical workflow tools before raw JSON or log slicing.',
  ]) {
    if (rules.length >= MIN_ACTIVE_STEERING_RULES) {
      break;
    }
    appendActiveRule(rules, fallbackRule);
  }

  return rules.slice(NUM_ZERO, MAX_ACTIVE_STEERING_RULES);
}

function buildActiveConstraintLines(currentBlocker = {}, packageContent = EMPTY_STRING) {
  const theoryFocus = buildTheoryImplementationFocus(currentBlocker);
  const forbiddenScope = buildForbiddenScope(packageContent);
  return [
    `Owner boundary: ${normalizeString(currentBlocker.owner) || DEFAULT_UNKNOWN} / ` +
      `${normalizeString(currentBlocker.boundary) || DEFAULT_UNKNOWN}`,
    `Dominant reason: ${normalizeString(currentBlocker.dominantReason) || DEFAULT_UNKNOWN}`,
    `Primary steering pack: ${primarySteeringPackLabel(currentBlocker)}`,
    `Forbidden files/scope: ${forbiddenScope.join(', ') || DEFAULT_UNKNOWN}`,
    `Proof ladder: ${normalizeStringList(currentBlocker.proof).join('; ') || DEFAULT_UNKNOWN}`,
    `Kill rule: ${theoryFocus.stopRule}`,
    ...buildRelevantSteeringRules(currentBlocker, packageContent)
      .map((rule) => `Steering rule: ${rule}`),
  ];
}

function buildPlaybackEvidencePaths(currentBlocker) {
  if (!pathHasRealValue(currentBlocker.playback)) {
    return [];
  }
  return [
    currentBlocker.playback,
    path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
  ];
}

function buildFirstReadPaths(currentBlocker) {
  const currentPaths = [
    AGENTS_PATH,
    ...COMPACT_STEERING_BASE_PATHS,
    ...buildRelevantLlmDomainPackPaths(currentBlocker),
    WORK_README_PATH,
    currentBlocker.package,
    ...buildOwnerCardPaths(currentBlocker),
    ...(pathHasRealValue(currentBlocker.artifact) ? [currentBlocker.artifact] : []),
    ...buildPlaybackEvidencePaths(currentBlocker),
    ...buildReadScope(currentBlocker),
  ].filter(pathHasRealValue);
  return normalizeStringList(currentPaths);
}

async function buildFirstReadPathLabels(currentBlocker) {
  const uniquePaths = buildFirstReadPaths(currentBlocker);
  return Promise.all(uniquePaths.map(resolvePathPresenceLabel));
}

function buildRuntimeTouchedFiles(currentBlocker) {
  return normalizeStringList(buildWriteScope(currentBlocker)).filter(
    (filePath) =>
      filePath.startsWith(SOURCE_DIRECTORY_PREFIX) &&
      filePath.endsWith(JAVASCRIPT_EXTENSION),
  );
}

function buildUsefulCommands(currentBlocker) {
  const commitScope = buildCommitScope(currentBlocker);
  const runtimeTouchedFiles = buildRuntimeTouchedFiles(currentBlocker);
  const commands = [
    NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND,
    NPM_RUN_WORK_ADVANCE_COMMAND,
    NPM_RUN_WORK_LLM_START_COMMAND,
    NPM_RUN_WORK_VALIDATE_COMMAND,
    NPM_RUN_WORK_SUBAGENT_NEXT_COMMAND,
  ];
  if (pathHasRealValue(currentBlocker.package)) {
    commands.push(
      commandWithPaths(NPM_RUN_WORK_PACKAGE_DOCTOR_COMMAND, [
        currentBlocker.package,
      ]),
    );
    commands.push(
      commandWithPaths(NPM_RUN_WORK_PACKAGE_DOCTOR_SUGGEST_COMMAND, [
        currentBlocker.package,
      ]),
    );
  }
  if (normalizeStringList(currentBlocker.theoryLedgerRefs).length > NUM_ZERO) {
    commands.push('npm run work:theory-ledger -- list');
  }
  if (pathHasRealValue(currentBlocker.artifact)) {
    commands.push(
      commandWithPaths(NPM_RUN_WORK_EVIDENCE_SUMMARY_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(NPM_RUN_WORK_SCENARIO_TRIAGE_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(NPM_RUN_WORK_SCENARIO_ROUTE_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_DISTRIBUTED_FAILURE_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_TOPOLOGY_CONVERGENCE_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_CAUSAL_MODEL_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_PRIORITY_RECOVERY_RESIDUALS_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
  }
  if (pathHasRealValue(currentBlocker.playback)) {
    commands.push(
      commandWithPaths(NPM_RUN_WORK_EVIDENCE_SUMMARY_COMMAND, [
        path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_TOPOLOGY_CONVERGENCE_COMMAND, [
        path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_CAUSAL_MODEL_COMMAND, [
        path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
      ]),
    );
  }
  commands.push(SUMMARIZE_HARNESS_COMMAND);
  if (runtimeTouchedFiles.length > NUM_ZERO) {
    commands.push(commandWithPaths(CHECK_LITERAL_COMMAND, runtimeTouchedFiles));
    commands.push(
      commandWithPaths(CHECK_DECISION_BOUNDARY_COMMAND, runtimeTouchedFiles),
    );
    commands.push(
      commandWithPaths(CHECK_RUNTIME_GRAMMAR_FILE_COMMAND, runtimeTouchedFiles),
    );
  }
  if (commitScope.length > NUM_ZERO) {
    commands.push(commandWithPaths(GIT_DIFF_CHECK_COMMAND, commitScope));
  }
  return commands;
}

function extractGitStatusPaths(line) {
  const pathText = line.slice(NUM_THREE).trim();
  if (pathText.includes(GIT_RENAME_SEPARATOR)) {
    return pathText
      .split(GIT_RENAME_SEPARATOR)
      .map(normalizeGitStatusPath)
      .map(normalizeString)
      .filter((filePath) => filePath.length > NUM_ZERO);
  }
  const normalizedPath = normalizeGitStatusPath(pathText);
  return normalizedPath.length > NUM_ZERO ? [normalizedPath] : [];
}

function buildPackageOwnedPaths(currentBlocker = {}) {
  return new Set(normalizeStringList([
    currentBlocker.package,
    currentBlocker.predecessor,
    currentBlocker.sprint,
    ...buildCommitScope(currentBlocker),
  ]));
}

function pathMatchesAny(filePath, pathSet) {
  if (pathSet.has(filePath)) {
    return true;
  }
  const directoryPrefix = filePath.endsWith(FORWARD_SLASH) ?
    filePath :
    `${filePath}${FORWARD_SLASH}`;
  for (const ownedPath of pathSet) {
    if (isGlobPattern(ownedPath) && globPatternToRegExp(ownedPath).test(filePath)) {
      return true;
    }
    if (ownedPath.startsWith(directoryPrefix)) {
      return true;
    }
  }
  return false;
}

function globPatternToRegExp(pattern) {
  let expression = '^';
  for (let index = NUM_ZERO; index < pattern.length; index += NUM_ONE) {
    const character = pattern[index];
    const nextCharacter = pattern[index + NUM_ONE];
    if (
      character === GLOB_ANY_PATH_SEGMENT &&
      nextCharacter === GLOB_ANY_PATH_SEGMENT
    ) {
      expression += '.*';
      index += NUM_ONE;
      continue;
    }
    if (character === GLOB_ANY_PATH_SEGMENT) {
      expression += '[^/]*';
      continue;
    }
    if (character === GLOB_SINGLE_CHARACTER) {
      expression += '[^/]';
      continue;
    }
    expression += escapeRegExp(character);
  }
  return new RegExp(`${expression}$`, 'u');
}

function normalizeGitStatusPath(filePath) {
  const normalizedPath = normalizeString(filePath);
  if (
    normalizedPath.startsWith(DOUBLE_QUOTE) &&
    normalizedPath.endsWith(DOUBLE_QUOTE)
  ) {
    try {
      return JSON.parse(normalizedPath);
    } catch (_error) {
      return normalizedPath.slice(NUM_ONE, -NUM_ONE);
    }
  }
  return normalizedPath;
}

function groupGitStatusLines(gitStatusLines = [], currentBlocker = {}) {
  const packageOwnedPaths = buildPackageOwnedPaths(currentBlocker);
  const trackerGeneratedPaths = new Set(TRACKER_GENERATED_PATHS);
  const groups = {
    [GIT_GROUP_PACKAGE_OWNED]: [],
    [GIT_GROUP_TRACKER_GENERATED]: [],
    [GIT_GROUP_UNRELATED]: [],
  };

  for (const line of gitStatusLines) {
    const paths = extractGitStatusPaths(line);
    if (paths.some((filePath) => pathMatchesAny(filePath, packageOwnedPaths))) {
      groups[GIT_GROUP_PACKAGE_OWNED].push(line);
      continue;
    }
    if (paths.some((filePath) => pathMatchesAny(filePath, trackerGeneratedPaths))) {
      groups[GIT_GROUP_TRACKER_GENERATED].push(line);
      continue;
    }
    groups[GIT_GROUP_UNRELATED].push(line);
  }

  return groups;
}

async function readGitStatus() {
  try {
    const result = await execFileAsync(GIT_COMMAND, GIT_STATUS_ARGS, {
      cwd: process.cwd(),
    });
    return {
      lines: result.stdout
        .split(NEWLINE)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > NUM_ZERO),
      status: GIT_STATUS_AVAILABLE,
    };
  } catch (_error) {
    return {
      lines: [],
      status: GIT_STATUS_UNAVAILABLE_STATE,
    };
  }
}

function appendGitStatusGroup(lines, groupKey, groupLines) {
  appendKeyValue(lines, GIT_GROUP_LABELS[groupKey], String(groupLines.length));
  if (groupLines.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${GIT_GROUP_EMPTY_MESSAGES[groupKey]}`);
    return;
  }
  for (const line of groupLines.slice(NUM_ZERO, MAX_GIT_STATUS_LINES)) {
    lines.push(`${MARKDOWN_LIST_PREFIX}\`${line}\``);
  }
  const remainingCount = groupLines.length - MAX_GIT_STATUS_LINES;
  if (remainingCount > NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${remainingCount} more entries omitted.`);
  }
}

function appendGitStatus(lines, gitStatus, currentBlocker) {
  if (gitStatus.status === GIT_STATUS_UNAVAILABLE_STATE) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${MESSAGE_GIT_STATUS_UNAVAILABLE}`);
    return;
  }
  const gitStatusLines = gitStatus.lines;
  appendKeyValue(
    lines,
    FIELD_LABELS.DIRTY_ENTRIES,
    String(gitStatusLines.length),
  );
  if (gitStatusLines.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${MESSAGE_NO_GIT_STATUS}`);
    return;
  }
  const groupedStatus = groupGitStatusLines(gitStatusLines, currentBlocker);
  appendGitStatusGroup(lines, GIT_GROUP_PACKAGE_OWNED, groupedStatus.packageOwned);
  appendGitStatusGroup(
    lines,
    GIT_GROUP_TRACKER_GENERATED,
    groupedStatus.trackerGenerated,
  );
  appendGitStatusGroup(lines, GIT_GROUP_UNRELATED, groupedStatus.unrelated);
}

async function resolveOptionalPathPresenceValue(filePath) {
  if (!pathHasRealValue(filePath)) {
    return filePath;
  }
  return resolvePathPresenceLabel(filePath);
}

async function buildContextLines(currentBlocker, packageContent, options = {}) {
  const lines = [OUTPUT_TITLE];
  const packageTitle = extractMarkdownTitle(packageContent || EMPTY_STRING);
  const firstReadPaths = await buildFirstReadPathLabels(currentBlocker);
  const secondarySteeringPacks =
    await buildSecondarySteeringPackLabels(currentBlocker);
  const theoryLedgerContext =
    options.theoryLedgerContext || await readTheoryLedgerContext();
  const gitStatus = await readGitStatus();
  const artifactLabel = await resolveOptionalPathPresenceValue(currentBlocker.artifact);
  const playbackLabel = await resolveOptionalPathPresenceValue(currentBlocker.playback);
  const subagentStatus = buildSubagentSequencingStatus(
    packageContent || EMPTY_STRING,
    currentBlocker.package,
  );
  const modelFit = buildModelFitContext(
    currentBlocker,
    packageContent || EMPTY_STRING,
  );
  const theoryFocus = buildTheoryImplementationFocus(currentBlocker);

  appendSection(lines, SECTION_THEORY_IMPLEMENTATION);
  appendKeyValue(
    lines,
    FIELD_LABELS.THEORY_UNDER_TEST,
    theoryFocus.theoryUnderTest,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CAUSAL_QUESTION,
    theoryFocus.causalQuestion,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.IMPLEMENTATION_SLICE,
    theoryFocus.implementationSlice,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.IMPLEMENTATION_FILES,
    theoryFocus.implementationFiles.join(', '),
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.EXPECTED_IMPLEMENTATION_DELTA,
    theoryFocus.expectedImplementationDelta,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.FALSIFYING_PROBE,
    theoryFocus.falsifyingProbe,
  );
  appendKeyValue(lines, FIELD_LABELS.STOP_RULE, theoryFocus.stopRule);

  appendSection(lines, SECTION_ACTIVE_CONSTRAINTS);
  appendList(
    lines,
    buildActiveConstraintLines(currentBlocker, packageContent || EMPTY_STRING),
    DEFAULT_UNKNOWN,
  );

  appendSection(lines, SECTION_CURRENT_BLOCKER);
  appendKeyValue(lines, FIELD_LABELS.SPRINT, currentBlocker.sprint);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE, currentBlocker.package);
  appendKeyValue(lines, FIELD_LABELS.STATUS, currentBlocker.status);
  appendKeyValue(lines, FIELD_LABELS.WORKFLOW_LANE, currentBlocker.lane);
  const laneRecommendation = recommendLaneForPackage(currentBlocker);
  appendKeyValue(
    lines,
    FIELD_LABELS.RECOMMENDED_LANE,
    `${laneRecommendation.canonicalLane} -> ${laneRecommendation.packageLane}`,
  );
  appendKeyValue(lines, FIELD_LABELS.SCENARIO, currentBlocker.scenario);
  appendKeyValue(lines, FIELD_LABELS.OWNER, currentBlocker.owner);
  appendKeyValue(lines, FIELD_LABELS.BOUNDARY, currentBlocker.boundary);
  appendKeyValue(
    lines,
    FIELD_LABELS.DOMINANT_REASON,
    currentBlocker.dominantReason,
  );
  appendKeyValue(lines, FIELD_LABELS.ARTIFACT, artifactLabel);
  appendKeyValue(lines, FIELD_LABELS.PLAYBACK, playbackLabel);
  appendKeyValue(lines, FIELD_LABELS.PREDECESSOR, currentBlocker.predecessor);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE_TITLE, packageTitle);

  appendSection(lines, SECTION_THEORY_LEDGER_REFS);
  appendList(
    lines,
    buildTheoryLedgerReferenceLines(currentBlocker, theoryLedgerContext),
    'No related theory ledger refs recorded.',
  );

  appendSection(lines, SECTION_SUBAGENT_SEQUENCING);
  appendKeyValue(lines, FIELD_LABELS.SUBAGENT_ROLE, subagentStatus.role);
  appendKeyValue(lines, FIELD_LABELS.SUBAGENT_STATUS, subagentStatus.status);

  appendSection(lines, SECTION_SUBAGENT_PROGRESS);
  appendList(
    lines,
    buildSubagentProgressSummary(packageContent || EMPTY_STRING),
    MESSAGE_NO_SUBAGENT_PROGRESS,
  );

  appendSection(lines, SECTION_MODEL_FIT);
  appendKeyValue(
    lines,
    FIELD_LABELS.MODEL_FIT_PACKAGE_CLASS,
    modelFit[MODEL_FIT_FIELD_PACKAGE_CLASS],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.INTENDED_MINIMUM_MODEL,
    modelFit[MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL],
  );
  appendKeyValue(lines, FIELD_LABELS.SCOPE_SHAPE, modelFit[MODEL_FIT_FIELD_SCOPE_SHAPE]);
  appendKeyValue(
    lines,
    FIELD_LABELS.OUTPUT_PROFILE,
    modelFit[MODEL_FIT_FIELD_OUTPUT_PROFILE],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.ESCALATION_TRIGGERS,
    normalizeStringList(modelFit[MODEL_FIT_FIELD_ESCALATION_TRIGGERS]).join(', '),
  );

  appendSection(lines, SECTION_REPRESENTATIVE_RESIDUAL);
  const representativeResidual = currentBlocker.representativeResidual || {};
  appendKeyValue(
    lines,
    FIELD_LABELS.STATUS,
    representativeResidual.status,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.SCENARIO,
    representativeResidual.scenario,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.ARTIFACT,
    representativeResidual.artifact,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.FRONTIER,
    representativeResidual.frontier,
  );
  appendKeyValue(lines, FIELD_LABELS.OWNER, representativeResidual.owner);
  appendKeyValue(lines, FIELD_LABELS.BOUNDARY, representativeResidual.boundary);
  appendKeyValue(
    lines,
    FIELD_LABELS.DOMINANT_REASON,
    representativeResidual.dominantReason,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.NEXT_ACTION,
    representativeResidual.nextAction,
  );

  appendSection(lines, SECTION_CAUSAL_GOVERNANCE);
  const causalGovernance = currentBlocker.causalGovernance || {};
  appendKeyValue(
    lines,
    FIELD_LABELS.CAUSAL_HYPOTHESIS,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.STOP_CONDITION_CHECK,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.EXPECTED_CAUSAL_MODEL_CHANGE,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.REPRESENTATIVE_OUTCOME,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CAUSAL_DEBT,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CROSS_BOUNDARY_REVIEW,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW],
  );

  appendSection(lines, SECTION_SCENARIO_CAUSAL_CLOSURE);
  const scenarioCausalClosure = currentBlocker.scenarioCausalClosure || {};
  appendKeyValue(
    lines,
    FIELD_LABELS.REFERENCE_SCENARIO_OR_PROBE,
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_REFERENCE],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.PHASE_CHAIN,
    normalizeStringList(
      scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_PHASE_CHAIN],
    ).join(', '),
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CURRENT_FIRST_FRONTIER,
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_CURRENT_FRONTIER],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.KNOWN_DOWNSTREAM_BLOCKERS,
    normalizeStringList(
      scenarioCausalClosure[
        SCENARIO_CAUSAL_CLOSURE_FIELD_DOWNSTREAM_BLOCKERS
      ],
    ).join(', '),
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.MISSING_CAUSAL_EDGE,
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.MISSING_CAUSAL_EDGE_PROBE,
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_MISSING_EDGE_PROBE],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.BOUNDED_PROGRESS_PROOF,
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.BOUNDED_PROGRESS_PROOF_ARTIFACT,
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_FIELD_BOUNDED_PROOF_ARTIFACT
    ],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.EXPECTED_OBSERVABLE_TRANSITION,
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_OBSERVABLE_TRANSITION
    ],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.MAX_PROGRESS_BOUND,
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_FIELD_MAX_PROGRESS_BOUND
    ],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.SAME_FRONTIER_FALLBACK,
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_FIELD_SAME_FRONTIER_FALLBACK
    ],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.EXPECTED_NEXT_FRONTIER,
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_FIELD_EXPECTED_NEXT_FRONTIER
    ],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.RESULT_CLASSIFICATION,
    scenarioCausalClosure[
      SCENARIO_CAUSAL_CLOSURE_FIELD_RESULT_CLASSIFICATION
    ],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.STOP_CONDITION,
    scenarioCausalClosure[SCENARIO_CAUSAL_CLOSURE_FIELD_STOP_CONDITION],
  );

  const architectureDecisionGate = currentBlocker.architectureDecisionGate || {};
  appendSection(lines, SECTION_ARCHITECTURE_DECISION_GATE);
  appendKeyValue(lines, FIELD_LABELS.STATUS, architectureDecisionGate.status);
  appendKeyValue(lines, FIELD_LABELS.TRIGGER, architectureDecisionGate.trigger);
  appendKeyValue(
    lines,
    FIELD_LABELS.SELECTED_CHOICE,
    architectureDecisionGate.selectedChoice,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.NEXT_ACTION,
    architectureDecisionGate.nextAction,
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.TRIGGER_EVIDENCE,
    normalizeStringList(architectureDecisionGate.triggerEvidence).join(', '),
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CHOICES,
    architectureGateChoiceLabels(architectureDecisionGate.choices).join(', '),
  );

  appendSection(lines, SECTION_CURRENT_STATE);
  lines.push(normalizeString(currentBlocker.currentState) || DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_NEXT_ACTION);
  lines.push(normalizeString(currentBlocker.nextAction) || DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_USEFUL_COMMANDS);
  appendList(lines, buildUsefulCommands(currentBlocker), DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_FIRST_FILES);
  appendList(lines, firstReadPaths, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_SECONDARY_STEERING);
  appendList(
    lines,
    secondarySteeringPacks,
    'No secondary steering packs selected.',
  );

  appendSection(lines, SECTION_SCOPE);
  appendKeyValue(lines, 'Write scope', buildWriteScope(currentBlocker).join(', '));
  appendKeyValue(lines, 'Handoff files', buildHandoffFiles(currentBlocker).join(', '));
  appendKeyValue(lines, 'Generated files', buildGeneratedFiles(currentBlocker).join(', '));
  appendKeyValue(
    lines,
    'Candidate runtime files',
    buildCandidateRuntimeFiles(currentBlocker).join(', '),
  );
  appendKeyValue(lines, 'Commit scope', buildCommitScope(currentBlocker).join(', '));

  appendSection(lines, SECTION_TOUCHED_FILES);
  appendList(lines, currentBlocker.touchedFiles, 'No legacy touched files recorded.');

  appendSection(lines, SECTION_PROOF_LADDER);
  appendList(lines, currentBlocker.proof, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_OPEN_CHECKLIST);
  appendList(
    lines,
    extractOpenChecklist(packageContent || EMPTY_STRING),
    MESSAGE_NO_OPEN_CHECKLIST,
  );

  appendSection(lines, SECTION_OUT_OF_SCOPE);
  appendList(
    lines,
    extractMarkdownSection(
      packageContent || EMPTY_STRING,
      PACKAGE_SECTION_OUT_OF_SCOPE,
    ),
    MESSAGE_NO_OUT_OF_SCOPE,
  );

  appendSection(lines, SECTION_WORKTREE);
  appendGitStatus(lines, gitStatus, currentBlocker);

  return lines;
}

async function buildDirtyScopeLines(currentBlocker, gitStatusOverride = null) {
  const lines = [DIRTY_SCOPE_OUTPUT_TITLE];
  const gitStatus = gitStatusOverride || (await readGitStatus());

  appendSection(lines, SECTION_CURRENT_BLOCKER);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE, currentBlocker.package);
  appendKeyValue(lines, FIELD_LABELS.OWNER, currentBlocker.owner);
  appendKeyValue(lines, FIELD_LABELS.BOUNDARY, currentBlocker.boundary);

  appendSection(lines, SECTION_WORKTREE);
  appendGitStatus(lines, gitStatus, currentBlocker);

  return lines;
}

async function main() {
  let currentBlocker;
  let packageContent = EMPTY_STRING;
  const packageOverride = parseOptionValue(process.argv, CLI_FLAG_PACKAGE);
  if (packageOverride) {
    try {
      const packageBlocker = await buildCurrentBlockerFromPackage(packageOverride);
      currentBlocker = packageBlocker.currentBlocker;
      packageContent = packageBlocker.packageContent;
    } catch (error) {
      console.error(error.message);
      return EXIT_FAILURE;
    }
  } else {
    try {
      const packageBlocker = await buildCurrentBlockerFromActivePackage();
      currentBlocker = packageBlocker.currentBlocker;
      packageContent = packageBlocker.packageContent;
    } catch (activeError) {
      if (activeError.message !== MESSAGE_CURRENT_BLOCKER_MISSING) {
        console.error(activeError.message);
        return EXIT_FAILURE;
      }
      try {
        currentBlocker = await readJsonFile(CURRENT_BLOCKER_JSON_PATH);
      } catch (_error) {
        console.error(activeError.message || MESSAGE_CURRENT_BLOCKER_MISSING);
        console.error(MESSAGE_CURRENT_BLOCKER_HINT);
        return EXIT_FAILURE;
      }
    }
  }

  if (process.argv.includes(CLI_FLAG_DIRTY_SCOPE)) {
    const lines = await buildDirtyScopeLines(currentBlocker);
    console.log(lines.join(NEWLINE));
    return EXIT_SUCCESS;
  }

  if (!packageContent) {
    const packageRead = await readOptionalTextFile(currentBlocker.package);
    packageContent = packageRead.content;
  }
  const lines = await buildContextLines(currentBlocker, packageContent);
  console.log(lines.join(NEWLINE));
  return EXIT_SUCCESS;
}

function isDirectRun() {
  return path.resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_STRING) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  process.exitCode = await main();
}

export {
  buildContextLines,
  buildCommitScope,
  buildCurrentBlockerFromActivePackage,
  buildCurrentBlockerFromPackage,
  buildDirtyScopeLines,
  buildFirstReadPaths,
  buildModelFitContext,
  buildOwnerCardPaths,
  buildTheoryImplementationFocus,
  buildWriteScope,
  buildSubagentSequencingStatus,
  buildUsefulCommands,
  groupGitStatusLines,
};
