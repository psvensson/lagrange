/**
 * Git transitions over quest records, shared by the checks that own quest
 * record invariants (`check-quest-log-append-only.js` for append-only
 * history, `check-closed-quest-shape.js` for closed-quest proof).
 *
 * Neither of those owns branch topology, so the admitted range comes from the
 * repository's change-selection owner at the CLI boundary and otherwise from
 * the merge base with `origin/main` of the repository being examined. The
 * publisher requires a fast-forward but does not forbid merges inside the
 * range, so a commit is compared against every parent rather than the first.
 */

import {execFileSync} from 'node:child_process';

const GIT_BINARY = 'git';
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const MAX_BUFFER_BYTES = 512 * 1024 * 1024;
const HEAD_REV = 'HEAD';
const REMOTE_MAIN = 'origin/main';
const GIT_MERGE_BASE = 'merge-base';
const SHA_SEPARATOR = ' ';
const BATCH_MISSING = 'missing';
const NUL = '\0';
const NO_EDGES = Object.freeze([]);
const NO_PUBLICATION_BASE = null;
const QUIET_STDIO = Object.freeze(['pipe', 'pipe', 'pipe']);

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const bufferIndexOf = Function.call.bind(Buffer.prototype.indexOf);
const bufferSubarray = Function.call.bind(Buffer.prototype.subarray);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

function git(root, args, options = {}) {
  return execFileSync(GIT_BINARY, args, {cwd: root,
    maxBuffer: MAX_BUFFER_BYTES, ...options});
}

/**
 * One `git cat-file --batch` pass over `<rev>:<path>` requests. Each answer
 * is `<sha> blob <size>` then the bytes, or a `missing` header.
 * @param {string} root
 * @param {Array<{key: string, rev: string}>} requests
 * @return {Map<string, Buffer>}
 */
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

/**
 * Paths a commit changed relative to a parent, with their status. Renames are
 * reported as a delete plus an add: a committed path must keep its identity.
 * @param {string} root
 * @param {string} parent
 * @param {string} child
 * @return {Array<{status: string, path: string}>}
 */
function changedPathsBetween(root, parent, child) {
  const listed = String(git(root, ['diff-tree', '-r', '-z', '--no-commit-id',
    '--name-status', '--no-renames', parent, child], {encoding: TEXT_ENCODING}));
  const fields = arrayFilter(stringSplit(listed, NUL), Boolean);
  const changed = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    changed.push({status: fields[index], path: fields[index + 1]});
  }
  return changed;
}

/**
 * Every parent to child transition admitted for review, oldest first. A merge
 * contributes one transition per parent. Without a base every commit
 * reachable from HEAD is admitted, which is what a repository with no
 * publication remote wants.
 * @param {string} root
 * @param {string|null} base
 * @return {Array<{parent: string, child: string}>}
 */
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

/**
 * The merge base with the publication remote, or null when there is none.
 * @param {string} root
 * @return {string|null}
 */
function publicationBase(root) {
  try {
    return stringTrim(String(git(root, [GIT_MERGE_BASE, REMOTE_MAIN, HEAD_REV],
      {encoding: TEXT_ENCODING, stdio: QUIET_STDIO})));
  } catch (_error) {
    return NO_PUBLICATION_BASE;
  }
}

/**
 * Files tracked at a commit, filtered by a classifier.
 * @param {string} root
 * @param {string} rev
 * @param {Function} accepts
 * @return {string[]}
 */
function trackedAt(root, rev, accepts) {
  const listed = String(git(root, ['ls-tree', '-r', '-z', '--name-only', rev],
    {encoding: TEXT_ENCODING}));
  return arrayFilter(stringSplit(listed, NUL), (file) => file && accepts(file));
}

const BASE_FLAG = '--base';
const METRIC_FLAG = '--metric';
const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);

/**
 * The admitted range named on the command line, or null for the default.
 * @param {string[]} argv
 * @return {string|null}
 */
function baseFromArgv(argv) {
  const index = arrayIndexOf(argv, BASE_FLAG);
  return index === -1 ? null : argv[index + 1];
}

/**
 * Report a quest-record check: `--metric` prints the count alone so a probe
 * can read it, otherwise the offences are named. Shared so the checks that
 * own quest-record invariants present one interface.
 * @param {Object} report {argv, offences, cleanMessage, header, remediation}
 * @return {number} exit code
 */
function reportRecordOffences(report) {
  const {argv, offences} = report;
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${offences.length}${LINE_SEPARATOR}`);
    return offences.length === 0 ? EXIT_OK : EXIT_VIOLATION;
  }
  if (offences.length === 0) {
    process.stdout.write(`${report.cleanMessage}${LINE_SEPARATOR}`);
    return EXIT_OK;
  }
  process.stderr.write(`${report.header}${LINE_SEPARATOR}`);
  for (const offence of offences) {
    process.stderr.write(
      `  ${offence.path} at ${offence.at}: ${offence.reason}${LINE_SEPARATOR}`);
  }
  process.stderr.write(`${LINE_SEPARATOR}${report.remediation}${LINE_SEPARATOR}`);
  return EXIT_VIOLATION;
}

export {
  HEAD_REV, NO_EDGES, admittedEdges, baseFromArgv, changedPathsBetween, git,
  publicationBase, readBlobs, reportRecordOffences, trackedAt,
};
