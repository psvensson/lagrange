// File-size admission — the attempt-time projection of the one-way oversized
// ratchet the pre-commit hook enforces (scripts/check-file-size-thresholds.js,
// the single owner of thresholds).
//
// The hook rejects a landing when the oversized-file COUNT grows. Discovering
// that at pre-commit is the most expensive possible moment: on 2026-09-01 it
// fired AFTER an independent verifier had approved the frozen review, forcing
// a size-reduction refactor and a full re-attempt/re-review cycle. This module
// evaluates the same ratchet movement per touched file at attempt admission,
// where repair costs one edit instead of one review.
//
// Ratchet-consistent semantics: a touched file that exceeds its scope
// threshold NOW but was already over the threshold at the attempt base stays
// tolerated (the ratchet only counts, and editing a legacy oversized file does
// not move the count). Only a file the attempt PUSHES over its threshold —
// newly created or grown across the line — is a violation, because landing it
// is what increments the count past the baseline.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {
  FILE_SIZE_SCOPE,
  FILE_SIZE_THRESHOLDS,
} from '../check-file-size-thresholds.js';

const SOURCE_TREE_PREFIX = 'src/';
const TEST_TREE_PREFIX = 'test/';
const JS_FILE_PATTERN = /\.[cm]?js$/u;
const LINE_SPLIT_PATTERN = /\r?\n/u;
const TEXT_ENCODING = 'utf8';
const GIT_SHOW_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const PROBLEM_PREFIX = 'file-size admission: ';
const PROBLEM_ACTION =
  '; extract, split, or simplify before recording the attempt — the ' +
  'pre-commit oversized-file ratchet would reject the landing';

function scopeFor(filePath) {
  if (filePath.startsWith(SOURCE_TREE_PREFIX)) return FILE_SIZE_SCOPE.SOURCE;
  if (filePath.startsWith(TEST_TREE_PREFIX)) return FILE_SIZE_SCOPE.TEST;
  return null;
}

function countLines(content) {
  if (content.length === 0) return 0;
  return content.split(LINE_SPLIT_PATTERN).length;
}

function baseLineCount(root, baseCommit, filePath) {
  if (!baseCommit) return null;
  const shown = spawnSync('git', ['show', `${baseCommit}:${filePath}`], {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: GIT_SHOW_MAX_BUFFER_BYTES,
  });
  if (shown.status !== 0 || typeof shown.stdout !== 'string') return null;
  return countLines(shown.stdout);
}

// Every touched src/test JavaScript file the candidate pushes over its scope
// threshold relative to `baseCommit`. Files missing from the working tree
// (deletions) and files already over threshold at the base are not violations.
export function touchedFileSizeOverflow(root, baseCommit, changedPaths) {
  const overflow = [];
  for (const filePath of changedPaths || []) {
    const scope = scopeFor(filePath);
    if (scope === null || !JS_FILE_PATTERN.test(filePath)) continue;
    const absolute = path.join(root, filePath);
    if (!fs.existsSync(absolute)) continue;
    const threshold = FILE_SIZE_THRESHOLDS[scope];
    const lines = countLines(fs.readFileSync(absolute, TEXT_ENCODING));
    if (lines <= threshold) continue;
    const baseLines = baseLineCount(root, baseCommit, filePath);
    if (baseLines !== null && baseLines > threshold) continue;
    overflow.push({path: filePath, lines, threshold, scope});
  }
  return overflow;
}

export function fileSizeAdmissionProblems(root, baseCommit, changedPaths) {
  return touchedFileSizeOverflow(root, baseCommit, changedPaths)
    .map((entry) =>
      `${PROBLEM_PREFIX}${entry.path} grew to ${entry.lines} lines ` +
      `(threshold ${entry.threshold})${PROBLEM_ACTION}`);
}
