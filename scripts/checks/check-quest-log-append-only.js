#!/usr/bin/env node
/**
 * Quest logs are append-only (`npm run audit:quest-log-append-only`).
 *
 * A quest's `log.ndjson` is the one file the live-surface guards exempt as
 * immutable history, and the solver treats it as durable memory: findings,
 * verdicts and terminal states are recorded there and never rewritten. That
 * was a convention with no owner. This check makes it an invariant:
 *
 *   once quest-log bytes have appeared in a commit, every descendant may
 *   append to them but may never alter, truncate, remove or relocate them.
 *
 * So it reasons over commit transitions, not over one snapshot. Comparing a
 * candidate against the publication base cannot protect a log that first
 * appeared after that base, and comparing the working tree against HEAD goes
 * blind the moment a bad rewrite is committed. For every parent -> child edge
 * in the admitted range, each changed canonical quest log must carry its
 * parent's bytes as an exact prefix; the working tree is checked as the final
 * edge so a rewrite is refused before it is committed too. Creation has no
 * parent bytes and passes; deletion cannot satisfy the prefix relation; a
 * rename is a deletion of the committed path and fails as one.
 *
 * The range comes from the repository's change-selection owner
 * (`resolvedCheckBase`), falling back to the merge base with `origin/main`,
 * so this check holds no branch-topology policy of its own. The publisher
 * requires a fast-forward but does not forbid merges inside the range, so a
 * commit is compared against every parent rather than only the first: if two
 * branches appended to the same log, no merge can preserve both prefixes, and
 * dropping one side's entries is exactly the history loss this refuses.
 *
 * `--base <ref>` overrides the range. `--metric` prints the number of
 * offending logs and nothing else, so a probe can read it. The exit code is
 * non-zero when any committed history was not preserved.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {isQuestLogPath} from '../solve/store.js';
import {resolvedCheckBase} from './changed-paths.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GIT_BINARY = 'git';
const TEXT_ENCODING = 'utf8';
const NUL = '\0';
const LINE_SEPARATOR = '\n';
const MAX_BUFFER_BYTES = 512 * 1024 * 1024;
const HEAD_REV = 'HEAD';
const BASE_FLAG = '--base';
const REMOTE_MAIN = 'origin/main';
const WORKING_TREE = 'working tree';
const RENAME_OFF = '--no-renames';
const STATUS_DELETED = 'D';
const STATUS_ADDED = 'A';
const SHA_SEPARATOR = ' ';
const GIT_MERGE_BASE = 'merge-base';
// Named empty states: "this range admits no transition" and "this repository
// has no publication base", both of which are answers, not missing values.
const NO_EDGES = Object.freeze([]);
const NO_PUBLICATION_BASE = null;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const bufferEquals = Function.call.bind(Buffer.prototype.equals);
// Buffer.indexOf, not String.indexOf: `cursor` is a byte offset into the
// batch stream, and a log holding any non-ASCII byte would put a character
// offset out of step with it.
const bufferIndexOf = Function.call.bind(Buffer.prototype.indexOf);
const bufferSubarray = Function.call.bind(Buffer.prototype.subarray);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const METRIC_FLAG = '--metric';
const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const ARGV_OFFSET = 2;
const BATCH_MISSING = 'missing';
const OFFENCE = Object.freeze({
  DELETED: 'the committed log is gone',
  TRUNCATED: 'the log is shorter than its committed history',
  REWRITTEN: 'committed entries were rewritten in place',
});
const CLEAN_MESSAGE = 'quest-log append-only: clean';
const OFFENCE_HEADER = 'quest-log append-only: refusing rewritten history';
const REMEDIATION = 'A quest log is append-only durable memory and the one ' +
  'file the live-surface guards exempt as history. Append a correcting entry ' +
  'instead of editing a recorded one.';

function git(root, args, options = {}) {
  return execFileSync(GIT_BINARY, args, {cwd: root,
    maxBuffer: MAX_BUFFER_BYTES, ...options});
}

// Every canonical quest log tracked at a commit.
function committedQuestLogs(root, rev) {
  const listed = String(git(root, ['ls-tree', '-r', '-z', '--name-only', rev],
    {encoding: TEXT_ENCODING}));
  return arrayFilter(stringSplit(listed, NUL), (file) => file && isQuestLogPath(file));
}

// One `git cat-file --batch` pass over `<rev>:<path>` requests: each answer is
// `<sha> blob <size>\n` then the bytes, or a `missing` header.
function readBlobs(root, requests) {
  const contents = new Map();
  if (requests.length === 0) return contents;
  const output = git(root, ['cat-file', '--batch'],
    {input: arrayMap(requests, (request) => request.rev).join(LINE_SEPARATOR)});
  let cursor = 0;
  for (const request of requests) {
    const headerEnd = bufferIndexOf(output, LINE_SEPARATOR, cursor);
    const header = output.toString(TEXT_ENCODING, cursor, headerEnd);
    if (stringEndsWith(header, BATCH_MISSING)) {
      cursor = headerEnd + 1;
      continue;
    }
    const size = Number(stringSplit(header, SHA_SEPARATOR)[2]);
    const start = headerEnd + 1;
    contents.set(request.key, bufferSubarray(output, start, start + size));
    cursor = start + size + 1;
  }
  return contents;
}

// Canonical quest logs a commit changed relative to its parent, by status.
// Renames are reported as a delete plus an add, which is what the invariant
// means: the committed path must keep its bytes.
function changedQuestLogs(root, parent, child) {
  const listed = String(git(root, ['diff-tree', '-r', '-z', '--no-commit-id',
    '--name-status', RENAME_OFF, parent, child], {encoding: TEXT_ENCODING}));
  const fields = arrayFilter(stringSplit(listed, NUL), Boolean);
  const changed = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const [status, file] = [fields[index], fields[index + 1]];
    if (isQuestLogPath(file)) changed.push({status, path: file});
  }
  return changed;
}

function prefixOffence(before, after) {
  if (after === null) return OFFENCE.DELETED;
  if (after.length < before.length) return OFFENCE.TRUNCATED;
  return bufferEquals(bufferSubarray(after, 0, before.length), before) ?
    null : OFFENCE.REWRITTEN;
}

// One parent -> child transition: the parent's bytes must survive as a prefix.
function edgeOffences(root, parent, child) {
  const changed = arrayFilter(changedQuestLogs(root, parent, child),
    (entry) => entry.status !== STATUS_ADDED);
  if (changed.length === 0) return NO_EDGES;
  const blobs = readBlobs(root, arrayFlatMap(changed, (entry) => [
    {key: `${parent}:${entry.path}`, rev: `${parent}:${entry.path}`},
    {key: `${child}:${entry.path}`, rev: `${child}:${entry.path}`},
  ]));
  const offences = [];
  for (const entry of changed) {
    const before = blobs.get(`${parent}:${entry.path}`);
    if (!before) continue;
    const after = entry.status === STATUS_DELETED ? null :
      blobs.get(`${child}:${entry.path}`) || null;
    const reason = prefixOffence(before, after);
    if (reason) offences.push({path: entry.path, reason, at: child});
  }
  return offences;
}

function workingCopyOffence(root, file, committed) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return OFFENCE.DELETED;
  const handle = fs.openSync(absolute, 'r');
  try {
    if (fs.fstatSync(handle).size < committed.length) return OFFENCE.TRUNCATED;
    const head = Buffer.alloc(committed.length);
    fs.readSync(handle, head, 0, committed.length, 0);
    return bufferEquals(head, committed) ? null : OFFENCE.REWRITTEN;
  } finally {
    fs.closeSync(handle);
  }
}

// The final edge: HEAD -> the working tree, so a rewrite is refused before it
// can be committed as well as after.
function workingTreeOffences(root) {
  const files = committedQuestLogs(root, HEAD_REV);
  const blobs = readBlobs(root, arrayMap(files, (file) =>
    ({key: file, rev: `${HEAD_REV}:${file}`})));
  const offences = [];
  for (const file of files) {
    const committed = blobs.get(file);
    if (!committed) continue;
    const reason = workingCopyOffence(root, file, committed);
    if (reason) offences.push({path: file, reason, at: WORKING_TREE});
  }
  return offences;
}

// Every parent -> child transition admitted for review, oldest first. A
// merge contributes one transition per parent. Without a base every commit
// reachable from HEAD is admitted, which is what a repository with no
// publication remote wants.
function admittedEdges(root, base) {
  const range = base ? `${base}..${HEAD_REV}` : HEAD_REV;
  const listed = stringTrim(String(git(root,
    ['rev-list', '--reverse', '--parents', range], {encoding: TEXT_ENCODING})));
  if (listed === '') return NO_EDGES;
  const rows = arrayMap(stringSplit(listed, LINE_SEPARATOR),
    (line) => stringSplit(line, SHA_SEPARATOR));
  return arrayFlatMap(rows, (shas) =>
    arrayMap(arraySlice(shas, 1), (parent) => ({parent, child: shas[0]})));
}

function publicationBase(root) {
  try {
    return stringTrim(String(git(root, [GIT_MERGE_BASE, REMOTE_MAIN, HEAD_REV],
      {encoding: TEXT_ENCODING})));
  } catch (_error) {
    return NO_PUBLICATION_BASE;
  }
}

/**
 * Every quest log whose committed history was not preserved append-only,
 * across each admitted commit transition and finally in the working tree.
 * @param {{root?: string, base?: string}} [options]
 * @return {Array<{path: string, reason: string, at: string}>}
 */
function questLogOffences(options = {}) {
  const root = options.root || REPO_ROOT;
  const base = options.base || resolvedCheckBase() || publicationBase(root);
  const offences = arrayFlatMap(admittedEdges(root, base), (edge) =>
    edgeOffences(root, edge.parent, edge.child));
  return [...offences, ...workingTreeOffences(root)];
}

function readBase(argv) {
  const index = arrayIndexOf(argv, BASE_FLAG);
  return index === -1 ? null : argv[index + 1];
}

function main(argv) {
  const offences = questLogOffences({base: readBase(argv)});
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${offences.length}${LINE_SEPARATOR}`);
    return offences.length === 0 ? EXIT_OK : EXIT_VIOLATION;
  }
  if (offences.length === 0) {
    process.stdout.write(`${CLEAN_MESSAGE}${LINE_SEPARATOR}`);
    return EXIT_OK;
  }
  process.stderr.write(`${OFFENCE_HEADER}${LINE_SEPARATOR}`);
  for (const offence of offences) {
    process.stderr.write(
      `  ${offence.path} at ${offence.at}: ${offence.reason}${LINE_SEPARATOR}`);
  }
  process.stderr.write(`${LINE_SEPARATOR}${REMEDIATION}${LINE_SEPARATOR}`);
  return EXIT_VIOLATION;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {OFFENCE, questLogOffences};
