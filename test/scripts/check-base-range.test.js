// Contract for the committed range an ordinary proof must cover.
//
// This is the correctness property that makes modular CI safe on real branches.
// A five-commit pull request must prove EVERY commit in it, not just the tip:
//
//   A -- B -- C -- D        base=A, head=D
//        ^^^^^^^^^^         B, C and D all participate
//
// Proving HEAD~1..HEAD instead would silently skip earlier commits' changes -
// under-selection that looks exactly like a correct narrow proof. The same
// applies to a push range: `before` is the last SHA the remote had, and every
// commit after it belongs to this push.
//
// The range arrives as ONE environment variable, resolved through the shared
// changed-path derivation, because `npm run check` runs the static layer and
// the change proof as separate processes. A base that reached only one of them
// would prove two different ranges under one command.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  changedRecords,
  publicationBase,
  resolvedCheckBase,
  resolvedCheckRange,
  semanticPaths,
} from '../../scripts/checks/changed-paths.js';
import {
  CHECK_BASE_ENV,
  RANGE_SOURCE,
} from '../../scripts/checks/change-selection-constants.js';
import {gitProcessEnvironment} from
  '../../scripts/checks/git-process-environment.js';

const UTF8 = 'utf8';

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: UTF8,
    stdio: 'pipe',
    env: gitProcessEnvironment(),
  });
}

// Four commits, each touching its own file, so any dropped commit is visible by
// name rather than by a count.
function buildBranchRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'check-base-range-'));
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'fixture']);
  const shas = {};
  for (const name of ['a', 'b', 'c', 'd']) {
    fs.mkdirSync(path.join(repo, 'src'), {recursive: true});
    fs.writeFileSync(path.join(repo, 'src', `${name}.js`),
      `export const ${name} = 1;\n`, UTF8);
    git(repo, ['add', '.']);
    git(repo, ['commit', '--quiet', '-m', name]);
    shas[name] = git(repo, ['rev-parse', 'HEAD']).trim();
  }
  return {repo, shas};
}

const {repo, shas} = buildBranchRepo();
const pathsFor = (base, head) =>
  semanticPaths(changedRecords({root: repo, base, head}));

test('a pull-request range proves every commit in it, not just the tip', () => {
  const changed = pathsFor(shas.a, shas.d);
  for (const name of ['b', 'c', 'd']) {
    assert.ok(changed.includes(`src/${name}.js`),
      `src/${name}.js is in base..head and must participate`);
  }
  assert.ok(!changed.includes('src/a.js'),
    'the base commit itself is not part of the range');
});

test('proving only the tip commit would miss the rest', () => {
  // The failure this contract exists to prevent, asserted directly so the
  // property above cannot go vacuous if the range derivation changes.
  const tipOnly = pathsFor(shas.c, shas.d);
  assert.deepEqual(tipOnly, ['src/d.js']);
  assert.ok(!tipOnly.includes('src/b.js'),
    'HEAD~1..HEAD demonstrably drops earlier commits');
});

test('a push range covers every commit after the remote before-SHA', () => {
  // push: base = github.event.before, head = github.sha
  const changed = pathsFor(shas.b, shas.d);
  assert.ok(changed.includes('src/c.js'));
  assert.ok(changed.includes('src/d.js'));
  assert.ok(!changed.includes('src/b.js'),
    'the before-SHA is already on the remote and is not part of the push');
});

test('the range is resolved from ONE environment authority', () => {
  assert.equal(resolvedCheckBase(null, {[CHECK_BASE_ENV]: shas.a}), shas.a);
  assert.equal(resolvedCheckBase(null, {}), null,
    'a library caller that names no root receives only the declared base');
});

// A clone of a four-commit `main` with one more local commit: what a
// developer's checkout looks like the moment before a push.
function buildPublishedClone() {
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'check-base-up-'));
  git(upstream, ['init', '--quiet', '--initial-branch=main']);
  git(upstream, ['config', 'user.email', 'fixture@example.invalid']);
  git(upstream, ['config', 'user.name', 'fixture']);
  fs.writeFileSync(path.join(upstream, 'a.js'), 'export const a = 1;\n', UTF8);
  git(upstream, ['add', '.']);
  git(upstream, ['commit', '--quiet', '-m', 'a']);
  const published = git(upstream, ['rev-parse', 'HEAD']).trim();
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'check-base-clone-'));
  git(clone, ['clone', '--quiet', upstream, '.']);
  git(clone, ['config', 'user.email', 'fixture@example.invalid']);
  git(clone, ['config', 'user.name', 'fixture']);
  fs.writeFileSync(path.join(clone, 'local.js'), 'export const local = 1;\n', UTF8);
  git(clone, ['add', '.']);
  git(clone, ['commit', '--quiet', '-m', 'local']);
  return {clone, published};
}

test('with no declaration the base is the publication merge-base', () => {
  // The hole this closes: a commit already made locally differs from HEAD by
  // nothing, so a HEAD base let every changed-path checker examine nothing
  // and report ok. The base an unqualified proof means is what a push would
  // carry - the merge base with origin/main.
  const {clone, published} = buildPublishedClone();
  assert.equal(publicationBase(clone), published);
  const range = resolvedCheckRange(null, {}, clone);
  assert.deepEqual(range, {base: published, source: RANGE_SOURCE.PUBLICATION});
  assert.equal(resolvedCheckBase(null, {}, clone), published,
    'the base and the range agree, since one is read from the other');
  assert.ok(semanticPaths(changedRecords({root: clone, base: range.base}))
    .includes('local.js'),
  'the locally committed file is in the proof range');
});

test('the source is a named state, never inferred from an empty base', () => {
  const {clone, published} = buildPublishedClone();
  assert.deepEqual(resolvedCheckRange(shas.c, {[CHECK_BASE_ENV]: shas.a}, clone),
    {base: shas.c, source: RANGE_SOURCE.FLAG});
  assert.deepEqual(resolvedCheckRange(null, {[CHECK_BASE_ENV]: shas.a}, clone),
    {base: shas.a, source: RANGE_SOURCE.ENVIRONMENT});
  assert.deepEqual(resolvedCheckRange(null, {}, clone),
    {base: published, source: RANGE_SOURCE.PUBLICATION});
  // The branch-only fixture has no remote: the working tree alone is proved,
  // and the range SAYS so rather than presenting the same null as "no base".
  assert.equal(publicationBase(repo), null);
  assert.deepEqual(resolvedCheckRange(null, {}, repo),
    {base: null, source: RANGE_SOURCE.WORKTREE});
});

test('an explicit flag overrides the environment', () => {
  // An operator asking for a specific range must not be silently overridden by
  // whatever the surrounding job exported.
  assert.equal(
    resolvedCheckBase(shas.c, {[CHECK_BASE_ENV]: shas.a}), shas.c);
});

test('the environment base selects the same range as the flag', () => {
  // The property that lets one variable drive two processes: whatever the
  // static layer resolves, the change proof resolves identically.
  const viaFlag = pathsFor(resolvedCheckBase(shas.a, {}), shas.d);
  const viaEnv = pathsFor(
    resolvedCheckBase(null, {[CHECK_BASE_ENV]: shas.a}), shas.d);
  assert.deepEqual(viaEnv, viaFlag);
});

test('an unreachable base is reported, never silently narrowed', () => {
  // CI falls back to HEAD^ when `before` is the zero SHA or has been garbage
  // collected. That fallback belongs to the workflow; the library must refuse
  // rather than quietly proving the working tree only.
  const missing = '0'.repeat(40);
  assert.equal(changedRecords({root: repo, base: missing, head: shas.d}), null,
    'an undiffable range returns null so the caller fails closed');
});
