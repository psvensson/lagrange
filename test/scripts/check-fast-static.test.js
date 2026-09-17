// Contract for the fast static layer.
//
// The property that matters most is READ-ONLY. A developer runs `check`
// mid-edit; a command that regenerates artefacts underneath them corrupts their
// working state and, worse, can make a stale-artefact failure disappear by
// fixing it silently. This was a live problem in the old workflow, where
// steering:check regenerated a pack and then diffed it, so running the verifier
// changed what the verifier was verifying.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  describeRange,
  rangeWarnings,
  runFastStatic,
  summaryLine,
} from '../../scripts/check-fast-static.js';
import {
  RANGE_SOURCE,
} from '../../scripts/checks/change-selection-constants.js';
import {
  changedCandidatePaths,
  javaScriptPaths,
} from '../../scripts/checks/changed-paths.js';

const root = process.cwd();
const UTF8 = 'utf8';
const MAX_BUFFER = 64 * 1024 * 1024;
const HASH = 'sha256';

// Fingerprint every candidate path's bytes, so any write anywhere is visible.
function worktreeFingerprint() {
  const list = (args) => execFileSync('git', args,
    {cwd: root, encoding: UTF8, maxBuffer: MAX_BUFFER})
    .split('\n').map((line) => line.trim()).filter(Boolean);
  const paths = [...new Set([
    ...list(['ls-files']),
    ...list(['ls-files', '--others', '--exclude-standard']),
  ])].sort();
  const hash = crypto.createHash(HASH);
  for (const candidate of paths) {
    const absolute = path.join(root, candidate);
    hash.update(candidate);
    try {
      hash.update(fs.readFileSync(absolute));
    } catch {
      hash.update('<unreadable>');
    }
  }
  return {digest: hash.digest('hex'), count: paths.length};
}

// One fingerprinted run serves every contract below: fast static is read-only
// over an unchanged tree, so repeating it (it spawns the whole cheap layer)
// would only re-measure the same outcome.
let fingerprintedRun = null;
function fingerprintedFastStatic() {
  if (fingerprintedRun === null) {
    const before = worktreeFingerprint();
    const outcome = runFastStatic({});
    fingerprintedRun = {after: worktreeFingerprint(), before, outcome};
  }
  return fingerprintedRun;
}

test('fast static is READ-ONLY: it never writes to the worktree', () => {
  const {after, before} = fingerprintedFastStatic();
  assert.equal(after.count, before.count,
    'fast static added or removed a file');
  assert.equal(after.digest, before.digest,
    'fast static modified tracked or untracked bytes; a check a developer ' +
    'runs mid-edit must never rewrite their tree');
});

test('fast static reports its own duration and per-check timings', () => {
  // So a later slowdown can be attributed rather than guessed at.
  const {outcome} = fingerprintedFastStatic();
  assert.ok(outcome.totalMs > 0);
  assert.ok(outcome.results.length > 0);
  for (const result of outcome.results) {
    assert.equal(typeof result.ms, 'number');
    assert.ok(result.script, 'every check reports which command it was');
  }
});

test('changed-path derivation is one shared definition', () => {
  // The selector and the static layer must agree on "changed", or a scoped
  // check can silently examine nothing while reporting success.
  const changed = changedCandidatePaths({root});
  assert.ok(Array.isArray(changed));
  const {outcome} = fingerprintedFastStatic();
  assert.deepEqual(outcome.changed, changed);
  assert.deepEqual(outcome.changedJs, javaScriptPaths(changed));
});

test('untracked files are candidates, not invisible until staged', () => {
  // A brand-new src/foo.js must be linted BEFORE `git add`, or the checks lapse
  // exactly when a human is least likely to look. Asserted against git's own
  // untracked list rather than by writing a probe file, so this test is itself
  // read-only - a test for a read-only contract should not dirty the tree.
  const untracked = execFileSync('git',
    ['ls-files', '--others', '--exclude-standard'],
    {cwd: root, encoding: UTF8, maxBuffer: MAX_BUFFER})
    .split('\n').map((line) => line.trim()).filter(Boolean);
  const changed = changedCandidatePaths({root});
  for (const candidate of untracked) {
    assert.ok(changed.includes(candidate),
      `${candidate} is untracked and non-ignored, so it must be a candidate`);
  }
});

test('the range is printed with its source and an empty one is warned about', () => {
  // A green run must be readable against the range it proved. "ok" over a
  // range with no JavaScript is a docs-only change or a hole, and the line
  // that distinguishes them is the warning.
  assert.equal(describeRange({base: 'abc123', source: RANGE_SOURCE.PUBLICATION}),
    'proof range: abc123..HEAD (publication merge-base)');
  assert.equal(describeRange({base: null, source: RANGE_SOURCE.WORKTREE}),
    'proof range: worktree only (no publication remote)');
  const published = {base: 'abc123', source: RANGE_SOURCE.PUBLICATION};
  const worktree = {base: null, source: RANGE_SOURCE.WORKTREE};
  assert.deepEqual(rangeWarnings({range: published, changedJs: ['src/a.js']}), []);
  const empty = rangeWarnings({range: published, changedJs: []});
  assert.equal(empty.length, 1);
  assert.match(empty[0], /examined nothing/u);
  // A silent fallback to the working tree is the same hole in a different
  // coat: nothing committed was examined, so it is warned about the same way.
  const fallback = rangeWarnings({range: worktree, changedJs: ['src/a.js']});
  assert.equal(fallback.length, 1);
  assert.match(fallback[0], /only the working tree was proved/u);
  assert.equal(rangeWarnings({range: worktree, changedJs: []}).length, 2);
  assert.equal(summaryLine({failures: [], warnings: [], totalMs: 7}),
    'fast-static: ok in 7ms');
  assert.equal(summaryLine({failures: [], warnings: empty, totalMs: 7}),
    'fast-static: ok (0 JavaScript changed) in 7ms',
    'a green verdict over an empty range says so on the verdict line itself');
  assert.equal(summaryLine({failures: [], warnings: fallback, totalMs: 7}),
    'fast-static: ok (worktree only) in 7ms');
  assert.equal(summaryLine({failures: [{}], warnings: [], totalMs: 7}),
    'fast-static: FAIL in 7ms');

  const {outcome} = fingerprintedFastStatic();
  assert.deepEqual(outcome.range, {base: null, source: RANGE_SOURCE.WORKTREE},
    'a library call with no base proves the working tree and says so');
  assert.deepEqual(outcome.warnings,
    rangeWarnings({range: outcome.range, changedJs: outcome.changedJs}));
});
