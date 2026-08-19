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
  resolvedCheckBase,
  semanticPaths,
} from '../../scripts/checks/changed-paths.js';
import {
  CHECK_BASE_ENV,
} from '../../scripts/checks/change-selection-constants.js';

const UTF8 = 'utf8';

function git(repo, args) {
  return execFileSync('git', args, {cwd: repo, encoding: UTF8, stdio: 'pipe'});
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
    'no declaration means the working tree, which is the inner-loop case');
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
