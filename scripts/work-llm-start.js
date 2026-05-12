#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildRepresentativeEvidenceSummary} from './summarize-representative-evidence.js';
import {
  buildContextLines,
  buildCurrentBlockerFromPackage,
  buildDirtyScopeLines,
} from './work-context.js';
import {buildPackageDoctorLines} from './work-tracker.js';
import {buildSummary, readLedgerEntries, renderSummary} from './model-ledger.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ONE = 1;
const NUM_TWO = 2;
const DEFAULT_CURRENT_BLOCKER_PATH = path.join(
  'work',
  'sprints',
  'current-blocker.json',
);
const DEFAULT_MODEL_LEDGER_PATH = path.join('work', 'model-ledger.jsonl');
const FLAG_PACKAGE = '--package';
const FLAG_LEDGER = '--ledger';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const PATH_NONE = 'none';
const PATH_UNKNOWN = 'unknown';
const TITLE = '# LLM Start';

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function parseOptionValue(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < 0) {
    return EMPTY_TEXT;
  }
  return normalizeText(args[optionIndex + NUM_ONE]);
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readTextFile(filePath));
}

function pathHasRealValue(filePath) {
  const normalized = normalizeText(filePath);
  return normalized.length > 0 &&
    normalized !== PATH_NONE &&
    normalized !== PATH_UNKNOWN;
}

async function readCurrentBlocker(args = []) {
  const packageOverride = parseOptionValue(args, FLAG_PACKAGE);
  if (packageOverride) {
    return buildCurrentBlockerFromPackage(packageOverride);
  }
  const currentBlocker = await readJsonFile(DEFAULT_CURRENT_BLOCKER_PATH);
  const packageContent = pathHasRealValue(currentBlocker.package) ?
    await readTextFile(currentBlocker.package) :
    EMPTY_TEXT;
  return {currentBlocker, packageContent};
}

async function buildModelLedgerSection(args = []) {
  const ledgerPath = parseOptionValue(args, FLAG_LEDGER) || DEFAULT_MODEL_LEDGER_PATH;
  const entries = await readLedgerEntries(ledgerPath);
  return renderSummary(buildSummary(entries), ledgerPath).trimEnd();
}

async function buildEvidenceSection(currentBlocker) {
  if (!pathHasRealValue(currentBlocker.artifact)) {
    return 'No representative artifact recorded.';
  }
  try {
    const artifact = await readJsonFile(currentBlocker.artifact);
    return JSON.stringify(
      buildRepresentativeEvidenceSummary(currentBlocker.artifact, artifact),
      null,
      NUM_TWO,
    );
  } catch (error) {
    return `Evidence summary unavailable: ${error.message}`;
  }
}

function appendSection(lines, title, content) {
  lines.push(EMPTY_TEXT, `## ${title}`, EMPTY_TEXT, content);
}

async function buildLlmStartLines(args = []) {
  const {currentBlocker, packageContent} = await readCurrentBlocker(args);
  const lines = [TITLE];
  appendSection(
    lines,
    'Work Context',
    (await buildContextLines(currentBlocker, packageContent)).join(NEWLINE),
  );
  appendSection(
    lines,
    'Package Doctor',
    buildPackageDoctorLines(currentBlocker.package, packageContent, {
      suggest: true,
    }).lines.join(NEWLINE),
  );
  appendSection(
    lines,
    'Dirty Scope',
    (await buildDirtyScopeLines(currentBlocker)).join(NEWLINE),
  );
  appendSection(lines, 'Model Ledger', await buildModelLedgerSection(args));
  appendSection(lines, 'Representative Evidence', await buildEvidenceSection(currentBlocker));
  return lines;
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  return `${(await buildLlmStartLines(args)).join(NEWLINE)}${NEWLINE}`;
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
  buildLlmStartLines,
  runCli,
};
