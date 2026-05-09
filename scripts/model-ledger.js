#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const NUM_TWENTY = 20;
const DECIMAL_PLACES = 2;
const JSON_INDENT_SPACES = 2;
const DEFAULT_LEDGER_PATH = path.join('work', 'model-ledger.jsonl');
const COMMAND_RECORD = 'record';
const COMMAND_SUMMARY = 'summary';
const COMMAND_HELP = 'help';
const FLAG_LEDGER = 'ledger';
const FLAG_RECENT = 'recent';
const FLAG_PACKAGE = 'package';
const FLAG_MODEL = 'model';
const FLAG_REASONING_EFFORT = 'reasoning-effort';
const FLAG_TASK_CLASS = 'task-class';
const FLAG_PACKAGE_CLASS = 'package-class';
const FLAG_INTENDED_MINIMUM_MODEL = 'intended-minimum-model';
const FLAG_SCOPE_SHAPE = 'scope-shape';
const FLAG_ESCALATED = 'escalated';
const FLAG_BAILOUT_REASON = 'bailout-reason';
const FLAG_OUTCOME = 'outcome';
const FLAG_VALIDATION_STATUS = 'validation-status';
const FLAG_CORRECTION_LOOPS = 'correction-loops';
const FLAG_REVIEW_FINDINGS = 'review-findings';
const FLAG_NOTES = 'notes';
const RECORD_FIELD_RECORDED_AT = 'recordedAt';
const RECORD_FIELD_PACKAGE = 'package';
const RECORD_FIELD_MODEL = 'model';
const RECORD_FIELD_REASONING_EFFORT = 'reasoningEffort';
const RECORD_FIELD_TASK_CLASS = 'taskClass';
const RECORD_FIELD_PACKAGE_CLASS = 'packageClass';
const RECORD_FIELD_INTENDED_MINIMUM_MODEL = 'intendedMinimumModel';
const RECORD_FIELD_SCOPE_SHAPE = 'scopeShape';
const RECORD_FIELD_ESCALATED = 'escalated';
const RECORD_FIELD_BAILOUT_REASON = 'bailoutReason';
const RECORD_FIELD_OUTCOME = 'outcome';
const RECORD_FIELD_VALIDATION_STATUS = 'validationStatus';
const RECORD_FIELD_CORRECTION_LOOPS = 'correctionLoops';
const RECORD_FIELD_REVIEW_FINDINGS = 'reviewFindings';
const RECORD_FIELD_NOTES = 'notes';
const OUTCOME_SUCCESS = 'success';
const OUTCOME_DONE = 'done';
const OUTCOME_PASSED = 'passed';
const VALIDATION_PASSED = 'passed';
const VALIDATION_GREEN = 'green';
const VALIDATION_FAILED = 'failed';
const VALIDATION_RED = 'red';
const VALIDATION_NOT_RUN = 'not-run';
const VALIDATION_SKIPPED = 'skipped';
const RECOMMEND_ESCALATE = 'escalate';
const RECOMMEND_DEESCALATE = 'de-escalate';
const RECOMMEND_HOLD = 'hold';
const EMPTY_TEXT = '';
const SPACE = ' ';
const NEWLINE = '\n';
const FLAG_PREFIX = '--';
const LABEL_SEPARATOR = ': ';
const LIST_PREFIX = '- ';
const COUNT_SEPARATOR = '=';
const COUNT_JOINER = ', ';
const SUMMARY_TITLE = '# Model Ledger Summary';
const HELP_TEXT = [
  'Usage:',
  '  node scripts/model-ledger.js record --package <path> --model <name> --reasoning-effort <effort> --task-class <class> --package-class <class> --intended-minimum-model <model> --scope-shape <shape> --escalated <true|false> --bailout-reason <reason|none> --outcome <outcome> --validation-status <status> --correction-loops <count> --review-findings <count> --notes <text>',
  '  node scripts/model-ledger.js summary [--recent <count>]',
  '',
  'Options:',
  '  --ledger <path>    Override the JSONL ledger path for tests or one-off analysis.',
  '  --recent <count>   Number of latest entries to summarize. Defaults to 20.',
].join(NEWLINE);

const RECORD_FLAG_TO_FIELD = Object.freeze({
  [FLAG_PACKAGE]: RECORD_FIELD_PACKAGE,
  [FLAG_MODEL]: RECORD_FIELD_MODEL,
  [FLAG_REASONING_EFFORT]: RECORD_FIELD_REASONING_EFFORT,
  [FLAG_TASK_CLASS]: RECORD_FIELD_TASK_CLASS,
  [FLAG_PACKAGE_CLASS]: RECORD_FIELD_PACKAGE_CLASS,
  [FLAG_INTENDED_MINIMUM_MODEL]: RECORD_FIELD_INTENDED_MINIMUM_MODEL,
  [FLAG_SCOPE_SHAPE]: RECORD_FIELD_SCOPE_SHAPE,
  [FLAG_ESCALATED]: RECORD_FIELD_ESCALATED,
  [FLAG_BAILOUT_REASON]: RECORD_FIELD_BAILOUT_REASON,
  [FLAG_OUTCOME]: RECORD_FIELD_OUTCOME,
  [FLAG_VALIDATION_STATUS]: RECORD_FIELD_VALIDATION_STATUS,
  [FLAG_CORRECTION_LOOPS]: RECORD_FIELD_CORRECTION_LOOPS,
  [FLAG_REVIEW_FINDINGS]: RECORD_FIELD_REVIEW_FINDINGS,
  [FLAG_NOTES]: RECORD_FIELD_NOTES,
});
const REQUIRED_RECORD_FLAGS = Object.freeze([
  FLAG_PACKAGE,
  FLAG_MODEL,
  FLAG_REASONING_EFFORT,
  FLAG_TASK_CLASS,
  FLAG_PACKAGE_CLASS,
  FLAG_INTENDED_MINIMUM_MODEL,
  FLAG_SCOPE_SHAPE,
  FLAG_ESCALATED,
  FLAG_BAILOUT_REASON,
  FLAG_OUTCOME,
  FLAG_VALIDATION_STATUS,
  FLAG_CORRECTION_LOOPS,
  FLAG_REVIEW_FINDINGS,
  FLAG_NOTES,
]);
const SUCCESSFUL_OUTCOMES = Object.freeze([
  OUTCOME_SUCCESS,
  OUTCOME_DONE,
  OUTCOME_PASSED,
]);
const PASSING_VALIDATION_STATUSES = Object.freeze([
  VALIDATION_PASSED,
  VALIDATION_GREEN,
]);
const NON_PASSING_VALIDATION_STATUSES = Object.freeze([
  VALIDATION_FAILED,
  VALIDATION_RED,
  VALIDATION_NOT_RUN,
  VALIDATION_SKIPPED,
]);
const SUMMARY_EMPTY_COUNTS = 'none';
const SUMMARY_NO_ENTRIES = 'No entries found.';
const SUMMARY_NOT_ENOUGH_EVIDENCE = 'Not enough evidence; keep current choice.';
const SUMMARY_ESCALATE_REASON =
  'Recent entries show failed proof, repeated correction loops, or review load.';
const SUMMARY_DEESCALATE_REASON =
  'Recent high-effort entries are mostly clean with low correction load.';
const SUMMARY_HOLD_REASON =
  'Recent entries do not justify changing model or effort.';

function normalizeText(value) {
  if (value === null || value === undefined) {
    return EMPTY_TEXT;
  }
  return String(value).trim();
}

function parseNonNegativeInteger(value, fieldName) {
  const normalized = normalizeText(value);
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return Number.parseInt(normalized, 10);
}

function parsePositiveInteger(value, fieldName) {
  const parsed = parseNonNegativeInteger(value, fieldName);
  if (parsed < NUM_ONE) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function parseBoolean(value, fieldName) {
  const normalized = normalizeLookupValue(value);
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  throw new Error(`${fieldName} must be true or false.`);
}

function normalizeLookupValue(value) {
  return normalizeText(value).toLowerCase();
}

function isFlag(value) {
  return normalizeText(value).startsWith(FLAG_PREFIX);
}

function stripFlagPrefix(value) {
  return normalizeText(value).slice(FLAG_PREFIX.length);
}

function parseCliArgs(args = []) {
  const [rawCommand = COMMAND_SUMMARY, ...rest] = args;
  const command = normalizeLookupValue(rawCommand);
  const flags = {};

  for (let index = NUM_ZERO; index < rest.length; index += NUM_TWO) {
    const rawFlag = rest[index];
    const rawValue = rest[index + NUM_ONE];
    if (!isFlag(rawFlag)) {
      throw new Error(`Unexpected argument "${rawFlag}".`);
    }
    if (rawValue === undefined || isFlag(rawValue)) {
      throw new Error(`Missing value for ${rawFlag}.`);
    }
    flags[stripFlagPrefix(rawFlag)] = rawValue;
  }

  return {command, flags};
}

function normalizeLedgerPath(value = DEFAULT_LEDGER_PATH) {
  const normalized = normalizeText(value) || DEFAULT_LEDGER_PATH;
  return path.isAbsolute(normalized) ?
    normalized :
    path.join(process.cwd(), normalized);
}

function validateRequiredRecordFlags(flags = {}) {
  const missingFlags = REQUIRED_RECORD_FLAGS.filter((flag) =>
    !normalizeText(flags[flag]));
  if (missingFlags.length > NUM_ZERO) {
    throw new Error(
      `Missing required record flags: ${missingFlags
        .map((flag) => `${FLAG_PREFIX}${flag}`)
        .join(COUNT_JOINER)}.`,
    );
  }
}

function buildLedgerRecord(flags = {}, recordedAt = new Date().toISOString()) {
  validateRequiredRecordFlags(flags);
  const record = {
    [RECORD_FIELD_RECORDED_AT]: recordedAt,
  };

  for (const [flag, field] of Object.entries(RECORD_FLAG_TO_FIELD)) {
    if (
      field === RECORD_FIELD_CORRECTION_LOOPS ||
      field === RECORD_FIELD_REVIEW_FINDINGS
    ) {
      record[field] = parseNonNegativeInteger(flags[flag], field);
      continue;
    }
    if (field === RECORD_FIELD_ESCALATED) {
      record[field] = parseBoolean(flags[flag], field);
      continue;
    }
    record[field] = normalizeText(flags[flag]);
  }

  return record;
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
}

async function appendJsonLine(filePath, value) {
  await ensureParentDirectory(filePath);
  await fs.appendFile(
    filePath,
    `${JSON.stringify(value)}${NEWLINE}`,
    ENCODING_UTF8,
  );
}

async function readLedgerEntries(filePath) {
  let content = EMPTY_TEXT;
  try {
    content = await fs.readFile(filePath, ENCODING_UTF8);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const entries = [];
  const lines = content.split(/\r?\n/u);
  for (let index = NUM_ZERO; index < lines.length; index += NUM_ONE) {
    const line = normalizeText(lines[index]);
    if (!line) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      throw new Error(
        `${filePath}: invalid JSONL at line ${index + NUM_ONE}: ` +
        error.message,
      );
    }
  }
  return entries;
}

function countBy(entries = [], fieldName) {
  const counts = new Map();
  for (const entry of entries) {
    const key = normalizeText(entry[fieldName]) || SUMMARY_EMPTY_COUNTS;
    counts.set(key, (counts.get(key) || NUM_ZERO) + NUM_ONE);
  }
  return [...counts.entries()].sort((left, right) => {
    if (right[NUM_ONE] !== left[NUM_ONE]) {
      return right[NUM_ONE] - left[NUM_ONE];
    }
    return left[NUM_ZERO].localeCompare(right[NUM_ZERO]);
  });
}

function renderCounts(counts = []) {
  if (counts.length === NUM_ZERO) {
    return SUMMARY_EMPTY_COUNTS;
  }
  return counts
    .map(([key, value]) => `${key}${COUNT_SEPARATOR}${value}`)
    .join(COUNT_JOINER);
}

function average(entries = [], fieldName) {
  if (entries.length === NUM_ZERO) {
    return NUM_ZERO;
  }
  const total = entries.reduce((sum, entry) =>
    sum + Number(entry[fieldName] || NUM_ZERO), NUM_ZERO);
  return total / entries.length;
}

function countMatching(entries = [], predicate) {
  return entries.filter(predicate).length;
}

function isSuccessfulOutcome(entry = {}) {
  return SUCCESSFUL_OUTCOMES.includes(
    normalizeLookupValue(entry[RECORD_FIELD_OUTCOME]),
  );
}

function isPassingValidation(entry = {}) {
  return PASSING_VALIDATION_STATUSES.includes(
    normalizeLookupValue(entry[RECORD_FIELD_VALIDATION_STATUS]),
  );
}

function isNonPassingValidation(entry = {}) {
  const normalizedStatus = normalizeLookupValue(
    entry[RECORD_FIELD_VALIDATION_STATUS],
  );
  return NON_PASSING_VALIDATION_STATUSES.includes(normalizedStatus) ||
    !isPassingValidation(entry);
}

function isHighEffort(entry = {}) {
  return ['high', 'xhigh'].includes(
    normalizeLookupValue(entry[RECORD_FIELD_REASONING_EFFORT]),
  );
}

function buildRecommendation(recentEntries = []) {
  if (recentEntries.length === NUM_ZERO) {
    return {
      recommendation: RECOMMEND_HOLD,
      reason: SUMMARY_NOT_ENOUGH_EVIDENCE,
    };
  }

  const failedValidationCount =
    countMatching(recentEntries, isNonPassingValidation);
  const failedOutcomeCount = countMatching(
    recentEntries,
    (entry) => !isSuccessfulOutcome(entry),
  );
  const averageCorrectionLoops = average(
    recentEntries,
    RECORD_FIELD_CORRECTION_LOOPS,
  );
  const averageReviewFindings = average(
    recentEntries,
    RECORD_FIELD_REVIEW_FINDINGS,
  );
  const highEffortCount = countMatching(recentEntries, isHighEffort);
  const cleanCount = countMatching(recentEntries, (entry) =>
    isSuccessfulOutcome(entry) &&
    isPassingValidation(entry) &&
    Number(entry[RECORD_FIELD_CORRECTION_LOOPS] || NUM_ZERO) === NUM_ZERO &&
    Number(entry[RECORD_FIELD_REVIEW_FINDINGS] || NUM_ZERO) === NUM_ZERO);

  if (
    failedValidationCount > NUM_ZERO ||
    failedOutcomeCount > NUM_ZERO ||
    averageCorrectionLoops >= NUM_TWO ||
    averageReviewFindings >= NUM_TWO
  ) {
    return {
      recommendation: RECOMMEND_ESCALATE,
      reason: SUMMARY_ESCALATE_REASON,
    };
  }

  if (
    recentEntries.length >= NUM_THREE &&
    highEffortCount === recentEntries.length &&
    cleanCount === recentEntries.length
  ) {
    return {
      recommendation: RECOMMEND_DEESCALATE,
      reason: SUMMARY_DEESCALATE_REASON,
    };
  }

  return {
    recommendation: RECOMMEND_HOLD,
    reason: SUMMARY_HOLD_REASON,
  };
}

function buildSummary(entries = [], options = {}) {
  const limit = options.recent || NUM_TWENTY;
  const recentEntries = entries.slice(-limit);
  const recommendation = buildRecommendation(recentEntries);

  return {
    totalEntries: entries.length,
    consideredEntries: recentEntries.length,
    recentLimit: limit,
    models: countBy(recentEntries, RECORD_FIELD_MODEL),
    reasoningEfforts: countBy(recentEntries, RECORD_FIELD_REASONING_EFFORT),
    taskClasses: countBy(recentEntries, RECORD_FIELD_TASK_CLASS),
    packageClasses: countBy(recentEntries, RECORD_FIELD_PACKAGE_CLASS),
    intendedMinimumModels: countBy(
      recentEntries,
      RECORD_FIELD_INTENDED_MINIMUM_MODEL,
    ),
    scopeShapes: countBy(recentEntries, RECORD_FIELD_SCOPE_SHAPE),
    escalated: countBy(recentEntries, RECORD_FIELD_ESCALATED),
    bailoutReasons: countBy(recentEntries, RECORD_FIELD_BAILOUT_REASON),
    outcomes: countBy(recentEntries, RECORD_FIELD_OUTCOME),
    validationStatuses: countBy(recentEntries, RECORD_FIELD_VALIDATION_STATUS),
    averageCorrectionLoops: average(
      recentEntries,
      RECORD_FIELD_CORRECTION_LOOPS,
    ),
    averageReviewFindings: average(recentEntries, RECORD_FIELD_REVIEW_FINDINGS),
    ...recommendation,
  };
}

function renderSummary(summary = {}, ledgerPath = DEFAULT_LEDGER_PATH) {
  const lines = [
    SUMMARY_TITLE,
    EMPTY_TEXT,
    `${LIST_PREFIX}Ledger${LABEL_SEPARATOR}${ledgerPath}`,
    `${LIST_PREFIX}Entries considered${LABEL_SEPARATOR}` +
      `${summary.consideredEntries} of ${summary.totalEntries}`,
  ];

  if (summary.consideredEntries === NUM_ZERO) {
    lines.push(`${LIST_PREFIX}${SUMMARY_NO_ENTRIES}`);
  }

  lines.push(
    `${LIST_PREFIX}Models${LABEL_SEPARATOR}${renderCounts(summary.models)}`,
    `${LIST_PREFIX}Reasoning efforts${LABEL_SEPARATOR}` +
      renderCounts(summary.reasoningEfforts),
    `${LIST_PREFIX}Task classes${LABEL_SEPARATOR}` +
      renderCounts(summary.taskClasses),
    `${LIST_PREFIX}Package classes${LABEL_SEPARATOR}` +
      renderCounts(summary.packageClasses),
    `${LIST_PREFIX}Intended minimum models${LABEL_SEPARATOR}` +
      renderCounts(summary.intendedMinimumModels),
    `${LIST_PREFIX}Scope shapes${LABEL_SEPARATOR}` +
      renderCounts(summary.scopeShapes),
    `${LIST_PREFIX}Escalated${LABEL_SEPARATOR}${renderCounts(summary.escalated)}`,
    `${LIST_PREFIX}Bailout reasons${LABEL_SEPARATOR}` +
      renderCounts(summary.bailoutReasons),
    `${LIST_PREFIX}Outcomes${LABEL_SEPARATOR}${renderCounts(summary.outcomes)}`,
    `${LIST_PREFIX}Validation statuses${LABEL_SEPARATOR}` +
      renderCounts(summary.validationStatuses),
    `${LIST_PREFIX}Average correction loops${LABEL_SEPARATOR}` +
      summary.averageCorrectionLoops.toFixed(DECIMAL_PLACES),
    `${LIST_PREFIX}Average review findings${LABEL_SEPARATOR}` +
      summary.averageReviewFindings.toFixed(DECIMAL_PLACES),
    `${LIST_PREFIX}Recommendation${LABEL_SEPARATOR}` +
      summary.recommendation,
    `${LIST_PREFIX}Reason${LABEL_SEPARATOR}${summary.reason}`,
  );

  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

async function recordCommand(flags = {}) {
  const ledgerPath = normalizeLedgerPath(flags[FLAG_LEDGER]);
  const record = buildLedgerRecord(flags);
  await appendJsonLine(ledgerPath, record);
  return `${JSON.stringify(record, null, JSON_INDENT_SPACES)}${NEWLINE}`;
}

async function summaryCommand(flags = {}) {
  const ledgerPath = normalizeLedgerPath(flags[FLAG_LEDGER]);
  const recent = flags[FLAG_RECENT] ?
    parsePositiveInteger(flags[FLAG_RECENT], FLAG_RECENT) :
    NUM_TWENTY;
  const entries = await readLedgerEntries(ledgerPath);
  return renderSummary(buildSummary(entries, {recent}), ledgerPath);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const {command, flags} = parseCliArgs(args);
  if (command === COMMAND_HELP || command === '--help' || command === '-h') {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  if (command === COMMAND_RECORD) {
    return recordCommand(flags);
  }
  if (command === COMMAND_SUMMARY) {
    return summaryCommand(flags);
  }
  throw new Error(`Unknown model-ledger command "${command}".`);
}

function isDirectRun() {
  return path.resolve(process.argv[NUM_ONE] || EMPTY_TEXT) ===
    fileURLToPath(import.meta.url);
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
  buildLedgerRecord,
  buildRecommendation,
  buildSummary,
  parseCliArgs,
  readLedgerEntries,
  renderSummary,
  runCli,
};
