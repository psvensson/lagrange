#!/usr/bin/env node
// Proof-cone selector CLI (developer-velocity epic V4a).
//
//   node scripts/select-proof-cone.js --changed <file> [--changed <file> ...]
//   node scripts/select-proof-cone.js --diff-base <git-ref>
//   node scripts/select-proof-cone.js --receipt <path>
//
// Prints the selected test list (one per line, run-test-files.js compatible)
// to stdout and writes the versioned selection-rationale receipt. Exits
// non-zero when the selector fails closed with problems; --full-suite prints
// the entire census instead (the caller then runs the normal lanes).

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  ERR_SELECT_USAGE,
  NEWLINE_SEPARATOR,
  SELECTION_SAFETY_FLOOR,
} from './checks/impact-proof-cone-constants.js';
import {
  assertRunnableProofSelection,
  selectProofCone,
  selectRunnableFullProofCensus,
  writeReceipt,
} from './checks/impact-proof-cone.js';

const CHANGED_FLAG = '--changed';
const DIFF_BASE_FLAG = '--diff-base';
const RECEIPT_FLAG = '--receipt';
const FULL_SUITE_FLAG = '--full-suite';
const LINE_SEPARATOR = '\n';
const FAILURE_EXIT_CODE = 1;
const JSON_FLAG = '--json';
const UTF8_ENCODING = 'utf8';
const GIT_EXECUTABLE = 'git';
const GIT_DIFF_NAME_ONLY_ARGS = ['diff', '--name-only', '--end-of-options'];
const GIT_HEAD_REF = 'HEAD';

// The selection is the CLI's output contract, so it must be delivered in full
// before the process exits. Two hazards had to be closed, and the obvious fix
// for each causes the other:
//   - a console.log loop leaves data in an asynchronous buffer that
//     process.exit() discards (measured on hosted CI as 607/339/219/348 of
//     2058 lines, each an exact alphabetical prefix);
//   - fs.writeSync cannot replace it, because Node opens a piped stdout in
//     non-blocking mode: one call performs a PARTIAL write (1097 of 2058) and
//     looping on the offset raises EAGAIN once the pipe buffer fills.
// So write once and let Node drain it, resolving only when the data has been
// handed over. Callers must AWAIT this and must not call process.exit().
function writeSelection(selectedTests) {
  if (selectedTests.length === 0) return Promise.resolve();
  const payload = `${selectedTests.join(LINE_SEPARATOR)}${LINE_SEPARATOR}`;
  return new Promise((resolve, reject) => {
    process.stdout.write(payload, (error) => {
      if (error) reject(error); else resolve();
    });
  });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const changed = [];
let diffBase = null;
let receiptPath = null;
let forceFullSuite = false;
let jsonOutput = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === CHANGED_FLAG) {
    changed.push(args[index + 1]);
    index += 1;
  } else if (args[index] === DIFF_BASE_FLAG) {
    diffBase = args[index + 1];
    index += 1;
  } else if (args[index] === RECEIPT_FLAG) {
    receiptPath = args[index + 1];
    index += 1;
  } else if (args[index] === FULL_SUITE_FLAG) {
    forceFullSuite = true;
  } else if (args[index] === JSON_FLAG) {
    jsonOutput = true;
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

if (forceFullSuite) {
  let selection;
  try {
    selection = selectRunnableFullProofCensus(root);
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = FAILURE_EXIT_CODE;
  }
  // No process.exit() on the success path. Node documents that exit() can
  // terminate with pending stdout I/O, and a piped stdout is asynchronous, so
  // exiting is the hazard rather than the fix. Await the write and let the
  // process end naturally; the remaining branches are guarded below instead of
  // being skipped by an early exit.
  if (selection) await writeSelection(selection.selectedTests);
}

if (!forceFullSuite) {
  if (changed.length === 0) {
    console.error(ERR_SELECT_USAGE);
    process.exit(1);
  }

  const {selection, problems} = selectProofCone(root, changed);
  try {
    assertRunnableProofSelection(selection);
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  }
  const written = writeReceipt(root, selection);
  if (receiptPath) {
    const fs = await import('node:fs');
    fs.copyFileSync(written, path.join(root, receiptPath));
  }

  if (jsonOutput) {
    console.log(JSON.stringify({selection, receipt: path.relative(root, written)}, null, 2));
  } else {
    await writeSelection(selection.selectedTests);
    console.error(
      `proof-cone: tier=${selection.escalation} fullSuite=${selection.fullSuite} ` +
      `selected=${selection.counts.uniqueSelected}/${selection.counts.totalTests} ` +
      `(static=${selection.counts.static} coverage=${selection.counts.coverage} ` +
      `contract=${selection.counts.contract} floor=${selection.counts[SELECTION_SAFETY_FLOOR]}) ` +
      `receipt=${path.relative(root, written)}`);
  }
  if (problems.length > 0 && !selection.fullSuite) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    process.exit(1);
  }
}
