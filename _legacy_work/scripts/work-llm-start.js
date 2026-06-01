#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildRepresentativeEvidenceSummary} from './summarize-representative-evidence.js';
import {
  buildSprintRemainingSummary,
  renderSprintRemainingSummary,
} from './work-sprint-remaining.js';
import {
  buildContextLines,
  buildCurrentBlockerFromPackage,
  buildDirtyScopeLines,
} from './work-context.js';
import {
  buildPackageDoctorLines,
  readTheoryLedgerContext,
} from './work-tracker.js';
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
const FLAG_CURRENT_BLOCKER = '--current-blocker';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const PATH_NONE = 'none';
const PATH_UNKNOWN = 'unknown';
const TITLE = '# LLM Start';
const STATUS_ACTIVE = 'active';
const ACTIVE_PACKAGE_FILE_PATTERN = /^active-.+\.md$/u;
const CURRENT_BLOCKER_REPAIR_COMMAND = 'npm run work:repair';
const SPRINT_REMAINING_COMMAND = 'npm run work:sprint:remaining';

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

async function readCurrentBlockerJson(filePath) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Current blocker snapshot ${filePath} is missing. Run ` +
        `${CURRENT_BLOCKER_REPAIR_COMMAND}, then rerun npm run work:llm-start.`,
      );
    }
    throw error;
  }
}

function pathHasRealValue(filePath) {
  const normalized = normalizeText(filePath);
  return normalized.length > 0 &&
    normalized !== PATH_NONE &&
    normalized !== PATH_UNKNOWN;
}

function packagePathLooksActive(filePath) {
  return ACTIVE_PACKAGE_FILE_PATTERN.test(path.basename(normalizeText(filePath)));
}

async function readCurrentBlockerPackageContent(currentBlocker) {
  if (!pathHasRealValue(currentBlocker.package)) {
    return EMPTY_TEXT;
  }
  if (
    currentBlocker.status !== STATUS_ACTIVE ||
    !packagePathLooksActive(currentBlocker.package)
  ) {
    throw new Error(
      `Current blocker package ${currentBlocker.package} is not active. Run ` +
      `${CURRENT_BLOCKER_REPAIR_COMMAND}, then rerun npm run work:llm-start.`,
    );
  }
  try {
    return await readTextFile(currentBlocker.package);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Current blocker package ${currentBlocker.package} is missing. Run ` +
        `${CURRENT_BLOCKER_REPAIR_COMMAND}, then rerun npm run work:llm-start.`,
      );
    }
    throw error;
  }
}

function buildPackageDoctorSection(
  currentBlocker,
  packageContent,
  theoryLedgerContext,
) {
  if (!pathHasRealValue(currentBlocker.package)) {
    return 'No active package recorded. Package doctor skipped; use ' +
      `${SPRINT_REMAINING_COMMAND} to select the next queued package or ` +
      'create one focused package if no queued package owns the work.';
  }
  return buildPackageDoctorLines(currentBlocker.package, packageContent, {
    suggest: true,
    theoryLedgerContext,
  }).lines.join(NEWLINE);
}

async function buildSprintRemainingSection(currentBlocker) {
  if (!pathHasRealValue(currentBlocker.sprint)) {
    return 'No active sprint recorded.';
  }
  try {
    return renderSprintRemainingSummary(
      await buildSprintRemainingSummary({sprintPath: currentBlocker.sprint}),
    );
  } catch (error) {
    return `Sprint remaining summary unavailable: ${error.message}`;
  }
}

async function readCurrentBlocker(args = []) {
  const packageOverride = parseOptionValue(args, FLAG_PACKAGE);
  if (packageOverride) {
    return buildCurrentBlockerFromPackage(packageOverride);
  }
  const currentBlockerPath =
    parseOptionValue(args, FLAG_CURRENT_BLOCKER) || DEFAULT_CURRENT_BLOCKER_PATH;
  const currentBlocker = await readCurrentBlockerJson(currentBlockerPath);
  const packageContent = await readCurrentBlockerPackageContent(currentBlocker);
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
  const theoryLedgerContext = await readTheoryLedgerContext();
  const lines = [TITLE];
  appendSection(
    lines,
    'Work Context',
    (await buildContextLines(currentBlocker, packageContent)).join(NEWLINE),
  );
  appendSection(
    lines,
    'Sprint Remaining',
    await buildSprintRemainingSection(currentBlocker),
  );
  appendSection(
    lines,
    'Package Doctor',
    buildPackageDoctorSection(currentBlocker, packageContent, theoryLedgerContext),
  );
  appendSection(
    lines,
    'Dirty Scope',
    (await buildDirtyScopeLines(currentBlocker)).join(NEWLINE),
  );
  appendSection(lines, 'Model Ledger', await buildModelLedgerSection(args));
  appendSection(
    lines,
    'Representative Evidence',
    await buildEvidenceSection(currentBlocker),
  );
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
