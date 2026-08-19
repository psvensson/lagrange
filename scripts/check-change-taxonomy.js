#!/usr/bin/env node
// Prints the source-taxonomy census and fails closed on any path the taxonomy
// cannot place. READ-ONLY: it inspects the worktree and never writes to it.
//
// The census is printed rather than stored, so drift is visible without another
// generated manifest that would itself need verifying.

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {taxonomyCensus} from './checks/change-selection.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWLINE = '\n';
const PAD = 26;
const FAIL_PREFIX = 'FAIL';
const PARTITION_OK = 'OK';
const PARTITION_BROKEN = 'BROKEN';
const BLANK = '';
const LABEL_TOTAL = 'total';
const LABEL_PARTITION = 'partition';
const LABEL_GIT = 'git:';
const LABEL_TRACKED = 'tracked';
const LABEL_UNTRACKED = 'untracked-candidate';

function main() {
  const census = taxonomyCensus(root);
  const lines = [
    'candidate census:',
    `  ${LABEL_TOTAL.padEnd(PAD)}${census.candidateCount}`,
  ];
  for (const [category, count] of Object.entries(census.counts)) {
    lines.push(`  ${category.toLowerCase().padEnd(PAD)}${count}`);
  }
  lines.push(
    `  ${LABEL_PARTITION.padEnd(PAD)}` +
    `${census.partitionOk ? PARTITION_OK : PARTITION_BROKEN}`,
    BLANK,
    LABEL_GIT,
    `  ${LABEL_TRACKED.padEnd(PAD)}${census.trackedCount}`,
    `  ${LABEL_UNTRACKED.padEnd(PAD)}${census.untrackedCount}`);
  process.stdout.write(lines.join(NEWLINE) + NEWLINE);
  if (census.problems.length > 0) {
    for (const problem of census.problems) {
      process.stderr.write(`${FAIL_PREFIX} ${problem}${NEWLINE}`);
    }
    process.exitCode = 1;
  }
}

main();
