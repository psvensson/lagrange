// ONE definition of "changed", shared by change selection and fast static.
//
// This is shared INPUT DERIVATION, not shared proof logic, so it does not
// recreate the circularity the rest of this work has been removing. The reason
// to share it is concrete: if the selector, eslint, the scoped ratchets and the
// guideline checks each asked git independently, "changed" would eventually
// mean four subtly different things around staged, unstaged and untracked
// files - and the differences would show up as a check that silently examined
// nothing.
//
// The worktree universe is what a developer intuitively expects:
//
//   committed diff from base
// + staged changes
// + tracked working-tree modifications
// + non-ignored untracked files
//
// Untracked files matter for the same reason they matter to the taxonomy: a
// brand-new src/foo.js must be linted and scoped-ratcheted BEFORE `git add`,
// not after, or the checks lapse exactly when a human is least likely to look.
//
// CHANGE RECORDS, NOT PATH STRINGS. A deleted file has no current path, so a
// list of existing paths would drop it from selection entirely - deleting
// src/raft/x.js would prove nothing at all. A rename has TWO semantic sides,
// and if it crosses a subsystem boundary both owners must be proved. Static
// checks consume the paths that still exist; the selector consumes both sides.

import {execFileSync} from 'node:child_process';

import {
  CHANGE_ADDED,
  CHANGE_DELETED,
  CHANGE_MODIFIED,
  CHANGE_RENAMED,
} from './change-selection-constants.js';

// Intrinsics captured at module load. Every string below arrives from `git`,
// which is external data by the adversarial-intrinsics rule: a replaced
// String.prototype.startsWith could turn a deletion into a modification and
// quietly remove its owner from the proof.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const UTF8 = 'utf8';
const MAX_BUFFER = 64 * 1024 * 1024;
const NEWLINE = '\n';
const TAB = '\t';
const DEFAULT_HEAD = 'HEAD';
const RENAME_DETECTION = '-M';
const NAME_STATUS = '--name-status';
const GIT = 'git';
const DIFF = 'diff';
const CACHED = '--cached';
const LS_FILES = 'ls-files';
const OTHERS = '--others';
const EXCLUDE_STANDARD = '--exclude-standard';
const STATUS_RENAMED_PREFIX = 'R';
const STATUS_DELETED_PREFIX = 'D';
const STATUS_ADDED_PREFIX = 'A';

function git(root, args) {
  try {
    return arrayFilter(
      stringSplit(execFileSync(GIT, args,
        {cwd: root, encoding: UTF8, maxBuffer: MAX_BUFFER}), NEWLINE),
      Boolean);
  } catch {
    return null;
  }
}

function parseNameStatus(lines) {
  const records = [];
  for (const line of lines || []) {
    const fields = stringSplit(line, TAB);
    const code = fields[0];
    if (stringStartsWith(code, STATUS_RENAMED_PREFIX)) {
      records.push({
        status: CHANGE_RENAMED,
        oldPath: fields[1],
        path: fields[2],
      });
      continue;
    }
    if (stringStartsWith(code, STATUS_DELETED_PREFIX)) {
      records.push({status: CHANGE_DELETED, oldPath: fields[1], path: null});
      continue;
    }
    records.push({
      status: stringStartsWith(code, STATUS_ADDED_PREFIX) ?
        CHANGE_ADDED : CHANGE_MODIFIED,
      oldPath: null,
      path: fields[1],
    });
  }
  return records;
}

function dedupe(records) {
  const seen = new Map();
  for (const record of records) {
    const key = `${record.status}:${record.oldPath || ''}:${record.path || ''}`;
    if (!seen.has(key)) seen.set(key, record);
  }
  return [...seen.values()].sort((left, right) =>
    (left.path || left.oldPath).localeCompare(right.path || right.oldPath));
}

// `base` optional: without it only the working tree is considered, which is the
// ordinary inner-loop case.
export function changedRecords({root, base = null, head = DEFAULT_HEAD}) {
  const records = [];
  if (base) {
    const committed = git(root,
      [DIFF, NAME_STATUS, RENAME_DETECTION, `${base}..${head}`]);
    if (committed === null) return null;
    records.push(...parseNameStatus(committed));
  }
  records.push(...parseNameStatus(
    git(root, [DIFF, NAME_STATUS, RENAME_DETECTION, DEFAULT_HEAD])));
  records.push(...parseNameStatus(
    git(root, [DIFF, NAME_STATUS, RENAME_DETECTION, CACHED])));
  for (const untracked of git(root,
    [LS_FILES, OTHERS, EXCLUDE_STANDARD]) || []) {
    records.push({status: CHANGE_ADDED, oldPath: null, path: untracked});
  }
  return dedupe(records);
}

// Every path a change touches SEMANTICALLY, including the vanished side of a
// deletion and both sides of a rename. This is what the selector must classify.
export function semanticPaths(records) {
  const paths = new Set();
  for (const record of records || []) {
    if (record.path) paths.add(record.path);
    if (record.oldPath) paths.add(record.oldPath);
  }
  return [...paths].sort();
}

// Paths that still exist, which is all a static checker can open.
export function existingPaths(records) {
  return [...new Set(arrayMap(
    arrayFilter(records || [], (record) => record.path),
    (record) => record.path))].sort();
}

const JAVASCRIPT_SUFFIXES = ['.js', '.mjs', '.cjs'];

export function javaScriptPaths(paths) {
  return arrayFilter(paths, (candidate) =>
    arraySome(JAVASCRIPT_SUFFIXES,
      (suffix) => stringEndsWith(candidate, suffix)));
}

// Backwards-compatible convenience for callers that only need existing paths.
export function changedCandidatePaths(options) {
  const records = changedRecords(options);
  return records === null ? null : existingPaths(records);
}
