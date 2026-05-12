#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const DATE_SLICE_END = 10;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const STATUS_ACTIVE = 'active';
const STATUS_DONE = 'done';
const STATUS_SUPERSEDED = 'superseded';
const STATUS_TODO = 'todo';
const VALID_PACKAGE_STATUSES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_DONE,
  STATUS_SUPERSEDED,
  STATUS_TODO,
]);
const WORK_PACKAGE_METADATA_SCHEMA = 'work-package-v1';
const METADATA_LANE_FIELD = 'lane';
const LANE_READ_REVIEW_DOC_ONLY = 'read-review-doc-only';
const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const SUBAGENT_OPTIONAL_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_LIGHTWEIGHT_MAINTENANCE,
]);
const WORK_ROOT = 'work';
const WORK_PACKAGES_DIR = path.join(WORK_ROOT, 'packages');
const WORK_SPRINTS_DIR = path.join(WORK_ROOT, 'sprints');
const CURRENT_BLOCKER_JSON_PATH = path.join(
  WORK_SPRINTS_DIR,
  'current-blocker.json',
);
const CURRENT_BLOCKER_MARKDOWN_PATH = path.join(
  WORK_SPRINTS_DIR,
  'current-blocker.md',
);
const MARKDOWN_EXTENSION = '.md';
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const CHECKBOX_OPEN_PATTERN = /- \[ \]/u;
const PACKAGE_STATUS_PATTERN = /^(active|done|superseded|todo)-.+\.md$/u;
const SPRINT_STATUS_PATTERN = /^(active|done|todo)-.+\.md$/u;
const ACTIVE_PACKAGE_LINK_PATTERN =
  /\]\((\.\.\/packages\/active-[^)]+\.md)\)/u;
const SUBAGENT_LEDGER_HEADING = '## Subagent Sequencing Ledger';
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
const MODEL_FIT_HEADING = '## Model Fit';
const COMMIT_LEDGER_COMMIT_LABEL = 'Focused package commit';
const COMMIT_LEDGER_PUSHED_LABEL = 'Pushed to';
const COMMIT_LEDGER_FOCUSED_SLICE_LABEL =
  'Commit contains only package-owned files/package-status/allowed sprint handoff';
const MODEL_FIT_PACKAGE_CLASS_LABEL = 'Package class';
const MODEL_FIT_INTENDED_MINIMUM_MODEL_LABEL = 'Intended minimum model';
const MODEL_FIT_SCOPE_SHAPE_LABEL = 'Scope shape';
const MODEL_FIT_OWNED_FILES_LABEL = 'Owned files';
const MODEL_FIT_FORBIDDEN_FILES_LABEL = 'Forbidden files';
const MODEL_FIT_FROZEN_DECISIONS_LABEL = 'Frozen decisions';
const MODEL_FIT_ESCALATION_TRIGGERS_LABEL = 'Escalation triggers';
const MODEL_FIT_FOCUSED_PROOF_LABEL = 'Focused proof';
const MODEL_FIT_SPARK_SAFE_CLASS = 'spark-safe';
const MODEL_FIT_SPARK_MODEL = 'gpt-5.3-codex-spark';
const MODEL_FIT_LEAF_SLICE_SCOPE = 'leaf-slice';
const SCENARIO_NONE = 'none';
const SCENARIO_UNKNOWN = 'unknown';
const SCENARIO_TEMPLATE_VALUE = 'scenario-or-none';
const CAUSAL_GOVERNANCE_METADATA_FIELD = 'causalGovernance';
const CAUSAL_GOVERNANCE_HYPOTHESIS_FIELD = 'hypothesis';
const CAUSAL_GOVERNANCE_STOP_CONDITION_FIELD = 'stopConditionCheck';
const CAUSAL_GOVERNANCE_EXPECTED_CHANGE_FIELD = 'expectedCausalModelChange';
const CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD =
  'representativeOutcome';
const CAUSAL_GOVERNANCE_CAUSAL_DEBT_FIELD = 'causalDebt';
const CAUSAL_GOVERNANCE_CROSS_BOUNDARY_REVIEW_FIELD = 'crossBoundaryReview';
const CAUSAL_GOVERNANCE_PENDING_OUTCOME = 'pending-before-rerun';
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
const CAUSAL_GOVERNANCE_REQUIRED_FIELDS = Object.freeze([
  CAUSAL_GOVERNANCE_HYPOTHESIS_FIELD,
  CAUSAL_GOVERNANCE_STOP_CONDITION_FIELD,
  CAUSAL_GOVERNANCE_EXPECTED_CHANGE_FIELD,
  CAUSAL_GOVERNANCE_REPRESENTATIVE_OUTCOME_FIELD,
  CAUSAL_GOVERNANCE_CAUSAL_DEBT_FIELD,
  CAUSAL_GOVERNANCE_CROSS_BOUNDARY_REVIEW_FIELD,
]);
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
const SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISM_PATTERN =
  /\b(?:wake|retry|timeout|reconcile|drain|dispatch|delivery|timer|advance|bounded)\b/iu;
const SCENARIO_CAUSAL_CLOSURE_ARTIFACT_PATH_PATTERN = new RegExp(
  '(?:^|[\\s`\'"])(?:[A-Za-z0-9._-]+/[A-Za-z0-9._/@%+=,-]+|' +
    '[A-Za-z0-9._@%+=,-]+\\.(?:json|md|txt|log|tap|js|mjs|cjs))' +
    '(?:$|[\\s`\'".,;])',
  'u',
);
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
const CHECKBOX_DONE_PREFIX_PATTERN = '- \\[[xX]\\] ';
const CHECKBOX_ANY_PREFIX = '- [';
const LEDGER_VALIDATION_REQUIRES_LEDGER = 'requiresLedger';
const LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES = 'requiresStrictEntries';
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
const SUBAGENT_REVIEW_RESULT_CLEAN = 'clean';
const SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED = 'fixes-required';
const SUBAGENT_FIX_NOT_NEEDED = 'not-needed';
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
const NON_REAL_IDENTITY_PATTERN =
  /\b(?:current-session|current session|parent\s+codex|manual|local|session)\b/iu;
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
const CLI_COMMAND_CURRENT_BLOCKER = 'current-blocker';
const CLI_COMMAND_VALIDATE = 'validate';
const CLI_COMMAND_DOCTOR = 'doctor';
const CLI_COMMAND_CLOSE = 'close';
const CLI_COMMAND_MIGRATE = 'migrate';
const CLI_COMMAND_MOVE = 'move';
const ERROR_NO_ACTIVE_PACKAGE = 'No active work package was found.';
const ERROR_NO_ACTIVE_SPRINT = 'No active sprint file was found.';
const DEFAULT_UNKNOWN = 'unknown';

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/work-tracker.js current-blocker [--write]',
    '  node scripts/work-tracker.js validate [--all] [paths...]',
    '  node scripts/work-tracker.js doctor [package]',
    '  node scripts/work-tracker.js close <package> [--write]',
    '  node scripts/work-tracker.js migrate <package> <successor> [--write]',
    '  node scripts/work-tracker.js move <package> --to <status> [--write]',
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
  const headingIndex = content.indexOf(heading);
  if (headingIndex < NUM_ZERO) {
    return null;
  }
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

function extractCommitAndPushLedger(content) {
  return extractMarkdownLevelTwoSection(content, COMMIT_AND_PUSH_LEDGER_HEADING);
}

function extractModelFitSection(content) {
  return extractMarkdownLevelTwoSection(content, MODEL_FIT_HEADING);
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
  const nextItemIndex = ledger.indexOf(
    `${NEWLINE}${CHECKBOX_ANY_PREFIX}`,
    itemStart + match[NUM_ZERO].length,
  );
  const content = nextItemIndex < NUM_ZERO ?
    ledger.slice(itemStart) :
    ledger.slice(itemStart, nextItemIndex);
  return {
    content,
    index: itemStart,
  };
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

function parseReviewEntry(content) {
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

function parseFixEntry(content) {
  if (isFixNotNeededEntry(content)) {
    return {
      type: SUBAGENT_FIX_NOT_NEEDED,
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

function parseImplementationEntry(content) {
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

function validateSubagentLedgerRoles(entries, filePath) {
  const errors = [];
  const review = parseReviewEntry(entries[SUBAGENT_LEDGER_REVIEW_LABEL].content);
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

  const fix = parseFixEntry(entries[SUBAGENT_LEDGER_FIX_LABEL].content);
  if (!fix) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger fix entry must match ` +
      'Agent <name> (<agent-id>) fixed <package> or not-needed.',
    );
  }
  if (fix?.type === 'agent') {
    errors.push(...validateAgentProof(fix.agent, 'fix', filePath));
  }

  const implementation = parseImplementationEntry(
    entries[SUBAGENT_LEDGER_IMPLEMENTATION_LABEL].content,
  );
  if (!implementation) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation entry must ` +
      'match Agent <name> (<agent-id>) implemented <package>.',
    );
  }
  errors.push(
    ...validateAgentProof(implementation?.agent, 'implementation', filePath),
  );

  if (!review || !fix || !implementation) {
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
  if (implementation.packagePath !== filePath) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation package must ` +
      'match this package path.',
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
  if (review.type === 'agent' && implementation.agent.id === review.agent.id) {
    errors.push(
      `${filePath}: Subagent Sequencing Ledger implementation agent must be ` +
      'separate from the review agent.',
    );
  }
  if (
    fix.type === 'agent' &&
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
  if (!ledger) {
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [`${filePath}: Subagent Sequencing Ledger is required.`] :
      [];
  }
  const errors = [];
  if (hasOpenChecklist(ledger)) {
    errors.push(`${filePath}: Subagent Sequencing Ledger has open items.`);
  }
  const checkedEntries = {};
  for (const label of SUBAGENT_LEDGER_REQUIRED_LABELS) {
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
      {[LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: requiresStrictEntries},
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
    SUBAGENT_LEDGER_REQUIRED_LABELS.every((label) => checkedEntries[label])
  ) {
    errors.push(...validateSubagentLedgerSequence(checkedEntries, filePath));
    errors.push(...validateSubagentLedgerRoles(checkedEntries, filePath));
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
    return options[LEDGER_VALIDATION_REQUIRES_LEDGER] ?
      [`${filePath}: Commit And Push Ledger is required.`] :
      [];
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

function metadataLane(metadata) {
  return normalizeLedgerText(metadata?.[METADATA_LANE_FIELD]).toLowerCase();
}

export function metadataRequiresSubagentSequencing(metadata) {
  if (!metadata) {
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

async function writeTextFile(filePath, content) {
  await fs.writeFile(filePath, content, ENCODING_UTF8);
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

async function listSprintFiles() {
  const sprintFiles = await listMarkdownFiles(WORK_SPRINTS_DIR);
  return sprintFiles.filter((filePath) => !isGeneratedCurrentBlockerPath(filePath));
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
  return errors;
}

async function validatePackageFile(filePath) {
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
  const requiresSubagentLedger =
    fileStatus === STATUS_ACTIVE &&
    metadata !== null &&
    metadataRequiresSubagentSequencing(metadata);
  errors.push(...validateSubagentSequencingLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: requiresSubagentLedger,
    [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: requiresSubagentLedger,
  }));
  errors.push(...validateModelFitContract(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE && metadata !== null,
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
  errors.push(...validateCommitAndPushLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadata !== null &&
      metadata[METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED] === true,
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
  return errors;
}

async function resolveValidationTargets(args) {
  const explicitTargets = args.filter((arg) => !arg.startsWith('--'));
  if (explicitTargets.length > NUM_ZERO) {
    return explicitTargets.map(normalizeCliPath);
  }
  const packageFiles = await listPackageFiles();
  if (args.includes(CLI_FLAG_ALL)) {
    return [
      ...packageFiles,
      ...(await listSprintFiles()),
    ];
  }
  const activePackages = packageFiles.filter((filePath) =>
    getPackageStatusFromPath(filePath) === STATUS_ACTIVE,
  );
  const metadataPackages = [];
  for (const filePath of packageFiles) {
    const content = await readTextFile(filePath);
    if (parsePackageMetadata(content, normalizeRelativePath(filePath))) {
      metadataPackages.push(filePath);
    }
  }
  return [...new Set([...activePackages, ...metadataPackages])];
}

async function validateCommand(args) {
  const targets = await resolveValidationTargets(args);
  const errors = [];
  for (const filePath of targets) {
    if (filePath.includes(`${path.sep}sprints${path.sep}`)) {
      errors.push(...(await validateSprintFile(filePath)));
      continue;
    }
    const result = await validatePackageFile(filePath);
    errors.push(...result.errors);
  }
  if (errors.length > NUM_ZERO) {
    console.error(errors.join(NEWLINE));
    process.exit(EXIT_FAILURE);
  }
  console.log(`Work tracker validation OK for ${targets.length} file(s).`);
}

function appendDoctorField(lines, label, value) {
  lines.push(`- ${label}: ${normalizeLedgerText(value) || DEFAULT_UNKNOWN}`);
}

function summarizeDoctorMetadata(metadata = {}) {
  return {
    lane: metadata[METADATA_LANE_FIELD] || DEFAULT_UNKNOWN,
    scenario: metadata.scenario || DEFAULT_UNKNOWN,
    owner: metadata.owner || DEFAULT_UNKNOWN,
    boundary: metadata.boundary || DEFAULT_UNKNOWN,
    dominantReason: metadata.dominantReason || DEFAULT_UNKNOWN,
    scenarioCausalClosure: isObjectRecord(
      metadata[SCENARIO_CAUSAL_CLOSURE_METADATA_FIELD],
    ) ? 'recorded' : 'missing',
    touchedFileCount: Array.isArray(metadata.touchedFiles) ?
      metadata.touchedFiles.length :
      NUM_ZERO,
    proofCount: Array.isArray(metadata.proof) ? metadata.proof.length : NUM_ZERO,
  };
}

export function buildPackageDoctorLines(filePath, content) {
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
  const requiresSubagentLedger =
    fileStatus === STATUS_ACTIVE &&
    metadata !== null &&
    metadataRequiresSubagentSequencing(metadata);
  errors.push(...validateSubagentSequencingLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]: requiresSubagentLedger,
    [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: requiresSubagentLedger,
  }));
  errors.push(...validateModelFitContract(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      fileStatus === STATUS_ACTIVE && metadata !== null,
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
  errors.push(...validateCommitAndPushLedger(content, relativePath, {
    [LEDGER_VALIDATION_REQUIRES_LEDGER]:
      metadata !== null &&
      metadata[METADATA_COMMIT_AND_PUSH_LEDGER_REQUIRED] === true,
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
  appendDoctorField(
    lines,
    'Scenario causal closure',
    metadataSummary.scenarioCausalClosure,
  );
  appendDoctorField(lines, 'Touched files', String(metadataSummary.touchedFileCount));
  appendDoctorField(lines, 'Proof commands', String(metadataSummary.proofCount));
  appendDoctorField(lines, 'Validation', errors.length === NUM_ZERO ? 'ok' : 'failed');
  if (errors.length > NUM_ZERO) {
    lines.push('', '## Findings');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
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
  const packagePath = await resolveDoctorPackagePath(args);
  const content = await readTextFile(packagePath);
  const report = buildPackageDoctorLines(packagePath, content);
  console.log(report.lines.join(NEWLINE));
  if (report.errors.length > NUM_ZERO) {
    process.exit(EXIT_FAILURE);
  }
}

async function findActiveSprintFile() {
  const sprintFiles = await listSprintFiles();
  return sprintFiles.find((filePath) =>
    getSprintStatusFromPath(filePath) === STATUS_ACTIVE,
  ) || null;
}

async function findActivePackageFile(activeSprintFile) {
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
  const match = sprintContent.match(ACTIVE_PACKAGE_LINK_PATTERN);
  if (!match) {
    return null;
  }
  return path.normalize(path.join(path.dirname(activeSprintFile), match[NUM_ONE]));
}

export function buildCurrentBlockerPayload(
  activeSprintFile,
  activePackageFile,
  metadata,
) {
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
    touchedFiles: Array.isArray(metadata.touchedFiles) ? metadata.touchedFiles : [],
    modelFit: metadata.modelFit || {},
    causalGovernance: metadata.causalGovernance || {},
    scenarioCausalClosure: metadata.scenarioCausalClosure || {},
    predecessor: metadata.predecessor || null,
  };
}

function formatMarkdownList(values) {
  if (!Array.isArray(values) || values.length === NUM_ZERO) {
    return '1. None recorded';
  }
  return values.map((value, index) => `${index + NUM_ONE}. \`${value}\``).join(NEWLINE);
}

export function renderCurrentBlockerMarkdown(payload) {
  return [
    GENERATED_NOTE,
    '',
    '# Current Blocker',
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
    'Escalation triggers:',
    '',
    formatMarkdownList(payload.modelFit?.escalationTriggers || []),
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
    '## Touched Files',
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
  const payload = buildCurrentBlockerPayload(
    activeSprintFile,
    activePackageFile,
    metadata,
  );
  const jsonContent = `${JSON.stringify(payload, null, NUM_TWO)}${NEWLINE}`;
  const markdownContent = renderCurrentBlockerMarkdown(payload);
  if (args.includes(CLI_FLAG_WRITE)) {
    await writeTextFile(CURRENT_BLOCKER_JSON_PATH, jsonContent);
    await writeTextFile(CURRENT_BLOCKER_MARKDOWN_PATH, markdownContent);
    console.log(
      `Updated ${CURRENT_BLOCKER_JSON_PATH} and ${CURRENT_BLOCKER_MARKDOWN_PATH}.`,
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
  return [...packageFiles, ...sprintFiles];
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
  if (metadata) {
    const nextMetadata = {
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
    };
    await writeTextFile(packagePath, replacePackageMetadata(content, nextMetadata));
  }
  await fs.rename(packagePath, targetPath);
  await rewriteWorkReferences(packagePath, targetPath);
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
