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
const JSON_FLAG = '--json';
const UTF8_ENCODING = 'utf8';
const GIT_EXECUTABLE = 'git';
const GIT_DIFF_NAME_ONLY_ARGS = ['diff', '--name-only', '--end-of-options'];
const GIT_HEAD_REF = 'HEAD';

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
    process.exit(1);
  }
  for (const testPath of selection.selectedTests) {
    console.log(testPath);
  }
  process.exit(0);
}

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
  for (const testPath of selection.selectedTests) {
    console.log(testPath);
  }
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
