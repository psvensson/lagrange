/**
 * The comparative-benchmark history and invalidation ledger are append-only
 * history (R21, D14). These scenarios drive the checker over a fixture
 * repository seeded with real recorded lines: appending is admitted; a
 * rewritten or removed line is refused in the working tree and once
 * committed; a line that does not parse and an untracked file are refused.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  OFFENCE as HISTORY_OFFENCE, benchmarkHistoryOffences,
} from '../../scripts/checks/check-benchmark-history-append-only.js';
import {OFFENCE} from '../../scripts/checks/check-quest-log-append-only.js';
import {execGit} from '../../scripts/checks/git-invocation.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HISTORY = 'data/tidb-comparison/history.ndjson';
const INVALIDATIONS = 'data/tidb-comparison/invalidations.ndjson';
const ENCODING = 'utf8';
const WORKING_TREE = 'working tree';
const SEEDED_LINES = 2;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function git(root, args) {
  return execGit(args, {cwd: root, encoding: ENCODING});
}

// The repository's own recorded lines, each newline-terminated.
function recordedLines(file) {
  return arrayMap(arrayFilter(stringSplit(fs.readFileSync(path.join(REPO_ROOT, file),
    ENCODING), '\n'), Boolean), (line) => `${line}\n`);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function repo(t, files = [HISTORY, INVALIDATIONS]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-history-append-only-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  write(root, 'README.md', 'fixture\n');
  for (const file of files) {
    write(root, file, arraySlice(recordedLines(file), 0, SEEDED_LINES).join(''));
  }
  commit(root, 'record the benchmark history');
  return root;
}

test('the repository\'s own history and invalidation ledger are clean', () => {
  assert.deepEqual(benchmarkHistoryOffences({root: REPO_ROOT}), []);
});

test('a prefix extension of either file is admitted, uncommitted and committed', (t) => {
  const root = repo(t);
  assert.deepEqual(benchmarkHistoryOffences({root}), []);
  for (const file of [HISTORY, INVALIDATIONS]) {
    fs.appendFileSync(path.join(root, file), recordedLines(file)[SEEDED_LINES]);
  }
  assert.deepEqual(benchmarkHistoryOffences({root}), []);
  commit(root, 'append one record to each');
  assert.deepEqual(benchmarkHistoryOffences({root}), []);
});

test('a rewritten line is refused in the working tree and once committed', (t) => {
  const root = repo(t);
  // Reorder the two recorded lines: same bytes, same length, every line still
  // parses, so the offence is the rewrite itself.
  const lines = recordedLines(HISTORY);
  write(root, HISTORY, lines[1] + lines[0]);
  assert.deepEqual(benchmarkHistoryOffences({root}),
    [{path: HISTORY, reason: OFFENCE.REWRITTEN, at: WORKING_TREE}]);
  const rewritten = commit(root, 'rewrite a recorded history line');
  assert.deepEqual(benchmarkHistoryOffences({root}),
    [{path: HISTORY, reason: OFFENCE.REWRITTEN, at: rewritten}]);
});

test('a removed line is refused in the working tree and once committed', (t) => {
  const root = repo(t);
  write(root, INVALIDATIONS, recordedLines(INVALIDATIONS)[0]);
  assert.deepEqual(benchmarkHistoryOffences({root}),
    [{path: INVALIDATIONS, reason: OFFENCE.TRUNCATED, at: WORKING_TREE}]);
  const removed = commit(root, 'drop an invalidation entry');
  assert.deepEqual(benchmarkHistoryOffences({root}),
    [{path: INVALIDATIONS, reason: OFFENCE.TRUNCATED, at: removed}]);
});

test('a deleted file is refused', (t) => {
  const root = repo(t);
  fs.rmSync(path.join(root, HISTORY));
  assert.deepEqual(benchmarkHistoryOffences({root}),
    [{path: HISTORY, reason: OFFENCE.DELETED, at: WORKING_TREE}]);
});

test('every line must parse through the file\'s owner', (t) => {
  const root = repo(t);
  fs.appendFileSync(path.join(root, HISTORY), '{"not": "a history record"\n');
  const offences = benchmarkHistoryOffences({root});
  assert.equal(offences.length, 1);
  assert.equal(offences[0].path, HISTORY);
  assert.equal(offences[0].at, WORKING_TREE);
  assert.ok(stringStartsWith(offences[0].reason, HISTORY_OFFENCE.UNPARSEABLE),
    offences[0].reason);
  commit(root, 'append an unparseable line');
  assert.deepEqual(arrayMap(benchmarkHistoryOffences({root}), (offence) => offence.at),
    ['HEAD', WORKING_TREE], 'committed, the line fails at HEAD and in the tree');
});

test('a file that is not tracked is refused, never read as empty history', (t) => {
  const root = repo(t, [HISTORY]);
  assert.deepEqual(benchmarkHistoryOffences({root}),
    [{path: INVALIDATIONS, reason: HISTORY_OFFENCE.UNTRACKED, at: 'HEAD'}]);
});
