#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const DEFAULT_RECENT_COUNT = 20;
const DEFAULT_LEDGER_PATH = path.join('work', 'model-ledger.jsonl');
const PROCESS_ARG_SCRIPT_INDEX = 1;
const COMMAND_RECORD = 'record';
const COMMAND_SUMMARY = 'summary';
const FLAG_HELP = '--help';
const FLAG_LEDGER = '--ledger';
const FLAG_RECENT = '--recent';

const REQUIRED_RECORD_FIELDS = Object.freeze([
  'package',
  'model',
  'reasoningEffort',
  'taskClass',
  'outcome',
  'validationStatus',
  'correctionLoops',
  'reviewFindings',
  'notes',
]);

const FIELD_FLAGS = Object.freeze({
  package: '--package',
  model: '--model',
  reasoningEffort: '--reasoning-effort',
  taskClass: '--task-class',
  outcome: '--outcome',
  validationStatus: '--validation-status',
  correctionLoops: '--correction-loops',
  reviewFindings: '--review-findings',
  notes: '--notes',
});

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const value = args[index];
    if (value.startsWith('--')) {
      options[value] = args[index + NUM_ONE] || EMPTY_TEXT;
      index += NUM_ONE;
      continue;
    }
    positional.push(value);
  }
  return {command: positional[NUM_ZERO] || EMPTY_TEXT, options};
}

function readOption(options, flag) {
  return String(options[flag] || EMPTY_TEXT).trim();
}

function parseCount(value, fallback) {
  const count = Number(value);
  return Number.isInteger(count) && count > NUM_ZERO ? count : fallback;
}

function buildRecord(options) {
  const record = {
    recordedAt: new Date().toISOString(),
    package: readOption(options, FIELD_FLAGS.package),
    model: readOption(options, FIELD_FLAGS.model),
    reasoningEffort: readOption(options, FIELD_FLAGS.reasoningEffort),
    taskClass: readOption(options, FIELD_FLAGS.taskClass),
    outcome: readOption(options, FIELD_FLAGS.outcome),
    validationStatus: readOption(options, FIELD_FLAGS.validationStatus),
    correctionLoops: parseCount(
      readOption(options, FIELD_FLAGS.correctionLoops),
      NUM_ZERO,
    ),
    reviewFindings: parseCount(
      readOption(options, FIELD_FLAGS.reviewFindings),
      NUM_ZERO,
    ),
    notes: readOption(options, FIELD_FLAGS.notes),
  };
  const missing = REQUIRED_RECORD_FIELDS.filter((field) => {
    const value = record[field];
    return value === EMPTY_TEXT || value === undefined;
  });
  if (missing.length > NUM_ZERO) {
    throw new Error(`Missing required model-ledger fields: ${missing.join(', ')}`);
  }
  return record;
}

async function readRecords(ledgerPath) {
  try {
    const content = await fs.readFile(ledgerPath, ENCODING_UTF8);
    return content
      .split(NEWLINE)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) {
    const key = String(record[field] || 'unknown');
    counts.set(key, (counts.get(key) || NUM_ZERO) + NUM_ONE);
  }
  return [...counts.entries()]
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function average(records, field) {
  if (records.length === NUM_ZERO) {
    return '0.00';
  }
  const total = records.reduce((sum, record) => {
    return sum + Number(record[field] || NUM_ZERO);
  }, NUM_ZERO);
  return (total / records.length).toFixed(2);
}

function buildRecommendation(records) {
  const hasFailedProof = records.some((record) => {
    return record.validationStatus === 'failed';
  });
  const hasCorrectionLoad = records.some((record) => {
    return Number(record.correctionLoops || NUM_ZERO) > NUM_ONE;
  });
  const hasReviewLoad = records.some((record) => {
    return Number(record.reviewFindings || NUM_ZERO) > NUM_ZERO;
  });
  if (hasFailedProof || hasCorrectionLoad || hasReviewLoad) {
    return {
      recommendation: 'escalate',
      reason: 'Recent entries show failed proof, correction loops, or review load.',
    };
  }
  if (records.length >= 3) {
    return {
      recommendation: 'hold',
      reason: 'Recent entries are clean; keep the current model and effort until evidence changes.',
    };
  }
  return {
    recommendation: 'hold',
    reason: 'Not enough evidence to change model or effort.',
  };
}

function renderSummary(records, ledgerPath, recentCount) {
  const recentRecords = records.slice(-recentCount);
  const advice = buildRecommendation(recentRecords);
  return [
    '# Model Ledger Summary',
    EMPTY_TEXT,
    `- Ledger: ${path.resolve(ledgerPath)}`,
    `- Entries considered: ${recentRecords.length} of ${records.length}`,
    `- Models: ${countBy(recentRecords, 'model') || 'none'}`,
    `- Reasoning efforts: ${countBy(recentRecords, 'reasoningEffort') || 'none'}`,
    `- Task classes: ${countBy(recentRecords, 'taskClass') || 'none'}`,
    `- Outcomes: ${countBy(recentRecords, 'outcome') || 'none'}`,
    `- Validation statuses: ${countBy(recentRecords, 'validationStatus') || 'none'}`,
    `- Average correction loops: ${average(recentRecords, 'correctionLoops')}`,
    `- Average review findings: ${average(recentRecords, 'reviewFindings')}`,
    `- Recommendation: ${advice.recommendation}`,
    `- Reason: ${advice.reason}`,
  ].join(NEWLINE);
}

async function appendRecord(ledgerPath, record) {
  await fs.mkdir(path.dirname(ledgerPath), {recursive: true});
  await fs.appendFile(ledgerPath, `${JSON.stringify(record)}${NEWLINE}`, ENCODING_UTF8);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/model-ledger.js record --package <path> --model <name> --reasoning-effort <effort> --task-class <class> --outcome <outcome> --validation-status <status> --correction-loops <count> --review-findings <count> --notes <text>',
    '  node scripts/model-ledger.js summary [--recent <count>]',
    EMPTY_TEXT,
    'Options:',
    '  --ledger <path>    Override the JSONL ledger path.',
    '  --recent <count>   Number of latest entries to summarize. Defaults to 20.',
  ].join(NEWLINE);
}

async function main() {
  const {command, options} = parseArgs(process.argv.slice(2));
  if (command === FLAG_HELP || options[FLAG_HELP] !== undefined) {
    console.log(usage());
    process.exit(EXIT_SUCCESS);
  }
  const ledgerPath = readOption(options, FLAG_LEDGER) || DEFAULT_LEDGER_PATH;
  if (command === COMMAND_RECORD) {
    const record = buildRecord(options);
    await appendRecord(ledgerPath, record);
    console.log(JSON.stringify(record, null, 2));
    process.exit(EXIT_SUCCESS);
  }
  if (command === COMMAND_SUMMARY) {
    const recentCount = parseCount(readOption(options, FLAG_RECENT), DEFAULT_RECENT_COUNT);
    const records = await readRecords(ledgerPath);
    console.log(renderSummary(records, ledgerPath, recentCount));
    process.exit(EXIT_SUCCESS);
  }
  console.error(usage());
  process.exit(EXIT_FAILURE);
}

function isDirectRun() {
  return path.resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_TEXT) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(EXIT_FAILURE);
  });
}

export {
  buildRecord,
  renderSummary,
};
