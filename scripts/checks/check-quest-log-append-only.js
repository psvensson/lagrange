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
 * (`resolvedCheckBase`) at the CLI boundary only, falling back to the merge
 * base with `origin/main` of the repository actually being audited: an
 * ambient base names a commit in THIS repository and is meaningless for any
 * other root, so the library never reads it,
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
import {fileURLToPath} from 'node:url';

import {isQuestLogPath} from '../solve/store.js';
import {resolvedCheckBase} from './changed-paths.js';
import {
  HEAD_REV, NO_EDGES, admittedEdges, baseFromArgv, changedPathsBetween,
  publicationBase, readBlobs, reportRecordOffences, trackedAt,
} from './quest-record-transitions.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKING_TREE = 'working tree';
const STATUS_DELETED = 'D';
const STATUS_ADDED = 'A';
// Named empty states: "this range admits no transition" and "this repository
// has no publication base", both of which are answers, not missing values.

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const bufferEquals = Function.call.bind(Buffer.prototype.equals);
// Buffer.indexOf, not String.indexOf: `cursor` is a byte offset into the
// batch stream, and a log holding any non-ASCII byte would put a character
// offset out of step with it.
const bufferSubarray = Function.call.bind(Buffer.prototype.subarray);
const ARGV_OFFSET = 2;
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

// Every canonical quest log tracked at a commit.
function committedQuestLogs(root, rev) {
  return trackedAt(root, rev, isQuestLogPath);
}

// Canonical quest logs a commit changed relative to its parent.
function changedQuestLogs(root, parent, child) {
  return arrayFilter(changedPathsBetween(root, parent, child),
    (entry) => isQuestLogPath(entry.path));
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

/**
 * Every quest log whose committed history was not preserved append-only,
 * across each admitted commit transition and finally in the working tree.
 * @param {{root?: string, base?: string}} [options]
 * @return {Array<{path: string, reason: string, at: string}>}
 */
function questLogOffences(options = {}) {
  const root = options.root || REPO_ROOT;
  const base = options.base || publicationBase(root);
  const offences = arrayFlatMap(admittedEdges(root, base), (edge) =>
    edgeOffences(root, edge.parent, edge.child));
  return [...offences, ...workingTreeOffences(root)];
}

function main(argv) {
  // The environment supplies the admitted range for this repository only.
  const base = baseFromArgv(argv) || resolvedCheckBase();
  return reportRecordOffences({argv, offences: questLogOffences(base ? {base} : {}),
    cleanMessage: CLEAN_MESSAGE, header: OFFENCE_HEADER, remediation: REMEDIATION});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {OFFENCE, questLogOffences};
