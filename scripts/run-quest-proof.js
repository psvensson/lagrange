#!/usr/bin/env node
// Executes the proof cone for a changed-path set (developer-velocity epic
// V4c): derives the selection deterministically, then runs exactly those
// tests through the existing fail-closed run-test-files.js runner. Full-
// suite tiers print the complete census; the cone tiers run the bounded
// selection. This is the Quest-landing evidence command: the repository
// derives the proof, the agent never picks the tests.
//
//   node scripts/run-quest-proof.js --changed <file> [--changed <file> ...]
//   node scripts/run-quest-proof.js --diff-base <git-ref>
//   node scripts/run-quest-proof.js --dry-run ...   (print selection, do not run)

import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  assertRunnableProofSelection,
  selectProofCone,
  writeReceipt,
} from './checks/impact-proof-cone.js';
import {
  ERR_SELECT_USAGE,
  NEWLINE_SEPARATOR,
  OUTCOME_FAIL,
  OUTCOME_PASS,
  SELECTION_CHANGED_TEST,
  SELECTION_SAFETY_FLOOR,
} from './checks/impact-proof-cone-constants.js';

const CHANGED_FLAG = '--changed';
const DIFF_BASE_FLAG = '--diff-base';
const DRY_RUN_FLAG = '--dry-run';
const JOBS_FLAG = '--jobs';
const DEFAULT_JOBS = '4';
const TEST_RUNNER = 'scripts/run-test-files.js';
const UTF8_ENCODING = 'utf8';
const FILES_PER_INVOCATION = 100;
const GIT_EXECUTABLE = 'git';
const GIT_DIFF_NAME_ONLY_ARGS = ['diff', '--name-only', '--end-of-options'];
const GIT_HEAD_REF = 'HEAD';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const changed = [];
let diffBase = null;
let dryRun = false;
let jobs = DEFAULT_JOBS;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === CHANGED_FLAG) {
    changed.push(args[index + 1]);
    index += 1;
  } else if (args[index] === DIFF_BASE_FLAG) {
    diffBase = args[index + 1];
    index += 1;
  } else if (args[index] === DRY_RUN_FLAG) {
    dryRun = true;
  } else if (args[index] === JOBS_FLAG) {
    jobs = args[index + 1];
    index += 1;
  }
}

if (diffBase) {
  const output = execFileSync(GIT_EXECUTABLE, [
    ...GIT_DIFF_NAME_ONLY_ARGS,
    diffBase,
    GIT_HEAD_REF,
  ], {
    cwd: root, encoding: UTF8_ENCODING});
  for (const line of output.split(NEWLINE_SEPARATOR)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) changed.push(trimmed);
  }
}

if (changed.length === 0) {
  console.error(ERR_SELECT_USAGE);
  process.exit(1);
}

const {selection} = selectProofCone(root, changed);
try {
  assertRunnableProofSelection(selection);
} catch (error) {
  console.error(`${OUTCOME_FAIL} quest-proof: ${error.message}`);
  process.exit(1);
}
const receiptPath = writeReceipt(root, selection);
console.error(
  `quest-proof: tier=${selection.escalation} fullSuite=${selection.fullSuite} ` +
  `selected=${selection.counts.uniqueSelected}/${selection.counts.totalTests} ` +
  `(static=${selection.counts.static} coverage=${selection.counts.coverage} ` +
  `contract=${selection.counts.contract} floor=${selection.counts[SELECTION_SAFETY_FLOOR]} ` +
  `changed=${selection.counts[SELECTION_CHANGED_TEST]}) ` +
  `receipt=${path.relative(root, receiptPath)}`);

const SELECTION_LINE_SEPARATOR = '\n';

// Emit the selection completely before exiting. fs.writeSync is not an option:
// Node opens a piped stdout non-blocking, so it partial-writes and then raises
// EAGAIN once the pipe buffer fills.
function writeSelection(selectedTests) {
  if (selectedTests.length === 0) return Promise.resolve();
  const payload =
    `${selectedTests.join(SELECTION_LINE_SEPARATOR)}${SELECTION_LINE_SEPARATOR}`;
  return new Promise((resolve, reject) => {
    process.stdout.write(payload, (error) => {
      if (error) reject(error); else resolve();
    });
  });
}

if (dryRun) {
  // Same output-loss hazard as select-proof-cone.js: a console.log loop leaves
  // data in an asynchronous pipe buffer that process.exit() discards, so a
  // large selection was delivered truncated with a zero exit status. Await the
  // write and let the process end naturally rather than exiting here.
  await writeSelection(selection.selectedTests);
}

if (!dryRun) {
  // Run the selected tests in batches through the existing runner, matching
  // how package.json lanes feed it (xargs -n 100 style).
  const runner = path.join(root, TEST_RUNNER);
  let failedBatches = 0;
  for (let offset = 0; offset < selection.selectedTests.length; offset += FILES_PER_INVOCATION) {
    const batch = selection.selectedTests.slice(offset, offset + FILES_PER_INVOCATION);
    const result = spawnSync(
      process.execPath,
      [runner, `--jobs=${jobs}`, ...batch],
      {cwd: root, stdio: 'inherit'});
    if (result.status !== 0) failedBatches += 1;
  }

  console.error(failedBatches === 0 ?
    `${OUTCOME_PASS} quest-proof: ${selection.counts.uniqueSelected} tests passed` :
    `${OUTCOME_FAIL} quest-proof: ${failedBatches} batch(es) failed`);
  process.exitCode = failedBatches === 0 ? 0 : 1;
}
