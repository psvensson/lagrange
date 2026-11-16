// Contract for the shared "changed" derivation.
//
// Built against a DISPOSABLE git repository rather than whatever happens to be
// dirty in this checkout. Asserting against the live worktree would prove the
// property today and go vacuous the moment CI runs from a clean checkout - the
// untracked list would be empty and the assertion would pass by examining
// nothing. Constructing the input is not a violation of the read-only
// invariant: the invariant is that the command under test does not modify the
// repository it inspects, and a harness may build its own fixture.
//
// The cases that matter are the ones a path-string list silently loses:
//
//   deleted    no current path at all -> would vanish from selection entirely
//   renamed    two semantic sides; if they cross a subsystem boundary, BOTH
//              owners must be proved

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  CHANGE_ADDED,
  CHANGE_DELETED,
  CHANGE_MODIFIED,
  CHANGE_RENAMED,
} from '../../scripts/checks/change-selection-constants.js';
import {
  changedRecords,
  existingPaths,
  semanticPaths,
} from '../../scripts/checks/changed-paths.js';
import {gitProcessEnvironment} from
  '../../scripts/checks/git-process-environment.js';
import {execGit} from '../../scripts/checks/git-invocation.js';

const UTF8 = 'utf8';
const QUOTED_PATHS = ['src/räknare.js', 'src/tab\towner.js', 'src/line\nowner.js'];
const MOVED_CONTROL_PATH = 'src/moved\nowner.js';
const COLON_RENAMES = [
  ['src/a.js', 'src/b.js:src/c.js'],
  ['src/a.js:src/b.js', 'src/c.js'],
];

function git(repo, args) {
  execGit(args, {
    cwd: repo,
    encoding: UTF8,
    stdio: 'pipe',
    env: gitProcessEnvironment(),
  });
}

function buildFixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-paths-'));
  const write = (relative, contents) => {
    const absolute = path.join(repo, relative);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    fs.writeFileSync(absolute, contents, UTF8);
  };
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'fixture']);
  write('src/kept.js', 'export const kept = 1;\n');
  write('src/modified.js', 'export const modified = 1;\n');
  write('src/deleted.js', 'export const deleted = 1;\n');
  write('src/before.js', 'export const moved = 1;\n');
  write('.gitignore', 'ignored/\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '--quiet', '-m', 'base']);

  // One of each interesting shape.
  write('src/modified.js', 'export const modified = 2;\n');
  fs.rmSync(path.join(repo, 'src/deleted.js'));
  git(repo, ['mv', 'src/before.js', 'src/after.js']);
  write('src/untracked.js', 'export const untracked = 1;\n');
  write('src/staged.js', 'export const staged = 1;\n');
  git(repo, ['add', 'src/staged.js']);
  write('ignored/thing.js', 'export const ignored = 1;\n');
  return repo;
}

const repo = buildFixtureRepo();
const records = changedRecords({root: repo});
const byPath = (target) => records.find(
  (record) => record.path === target || record.oldPath === target);

test('a deletion survives as a change record', () => {
  const deleted = byPath('src/deleted.js');
  assert.ok(deleted, 'a deleted file must still appear as a change');
  assert.equal(deleted.status, CHANGE_DELETED);
  assert.equal(deleted.path, null);
  assert.equal(deleted.oldPath, 'src/deleted.js');
});

test('a rename records both semantic sides', () => {
  const renamed = records.find((record) => record.status === CHANGE_RENAMED);
  assert.ok(renamed, 'git rename detection must be enabled');
  assert.equal(renamed.oldPath, 'src/before.js');
  assert.equal(renamed.path, 'src/after.js');
});

test('modified, staged and untracked files are all candidates', () => {
  assert.equal(byPath('src/modified.js').status, CHANGE_MODIFIED);
  assert.ok(byPath('src/staged.js'), 'staged changes are candidates');
  const untracked = byPath('src/untracked.js');
  assert.ok(untracked, 'a new file must be a candidate BEFORE git add');
  assert.equal(untracked.status, CHANGE_ADDED);
});

test('ignored files are never candidates', () => {
  assert.equal(byPath('ignored/thing.js'), undefined,
    'gitignored paths must not enter the candidate universe');
});

test('unchanged files are not candidates', () => {
  assert.equal(byPath('src/kept.js'), undefined);
});

test('semantic paths include vanished sides; existing paths do not', () => {
  const semantic = semanticPaths(records);
  const existing = existingPaths(records);

  assert.ok(semantic.includes('src/deleted.js'),
    'deleting a file must still select its subsystem');
  assert.ok(semantic.includes('src/before.js'), 'the rename source side');
  assert.ok(semantic.includes('src/after.js'), 'the rename destination side');

  assert.ok(!existing.includes('src/deleted.js'),
    'a static checker cannot open a deleted file');
  assert.ok(!existing.includes('src/before.js'),
    'a static checker cannot open the pre-rename path');
  assert.ok(existing.includes('src/after.js'));
});

test('the derivation does not modify the repository it inspects', () => {
  const fingerprint = () => execGit(
    ['status', '--porcelain'],
    {cwd: repo, encoding: UTF8, env: gitProcessEnvironment()});
  const before = fingerprint();
  changedRecords({root: repo});
  assert.equal(fingerprint(), before);
});

test('Unicode and control filenames retain their actual names before and after staging', (t) => {
  const fixture = buildFixtureRepo();
  t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
  git(fixture, ['config', 'core.quotePath', 'true']);
  for (const relative of QUOTED_PATHS) {
    fs.writeFileSync(path.join(fixture, relative), 'export const value = 1;\n');
  }
  const untracked = changedRecords({root: fixture});
  for (const relative of QUOTED_PATHS) {
    assert.ok(untracked.some((record) => record.status === CHANGE_ADDED &&
      record.path === relative), JSON.stringify(relative));
  }
  git(fixture, ['add', '--', ...QUOTED_PATHS]);
  const staged = changedRecords({root: fixture});
  for (const relative of QUOTED_PATHS) {
    assert.ok(staged.some((record) => record.status === CHANGE_ADDED &&
      record.path === relative), JSON.stringify(relative));
  }
});

test('NUL path records preserve both control-name rename sides and committed deletions', (t) => {
  const fixture = buildFixtureRepo();
  t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
  git(fixture, ['config', 'core.quotePath', 'true']);
  for (const relative of QUOTED_PATHS) {
    fs.writeFileSync(path.join(fixture, relative), `// ${JSON.stringify(relative)}\n`);
  }
  git(fixture, ['add', '-A']);
  git(fixture, ['commit', '--quiet', '-m', 'record unusual paths']);
  const base = execGit(['rev-parse', 'HEAD'], {
    cwd: fixture, encoding: UTF8, env: gitProcessEnvironment(),
  }).trim();
  git(fixture, ['mv', QUOTED_PATHS[2], MOVED_CONTROL_PATH]);
  git(fixture, ['rm', '--', QUOTED_PATHS[1]]);
  fs.appendFileSync(path.join(fixture, QUOTED_PATHS[0]), '// changed\n');
  git(fixture, ['add', '-A']);
  git(fixture, ['commit', '--quiet', '-m', 'change unusual paths']);
  const changed = changedRecords({root: fixture, base});
  assert.ok(changed.some((record) => record.status === CHANGE_RENAMED &&
    record.oldPath === QUOTED_PATHS[2] && record.path === MOVED_CONTROL_PATH));
  assert.ok(changed.some((record) => record.status === CHANGE_DELETED &&
    record.oldPath === QUOTED_PATHS[1] && record.path === null));
  assert.ok(changed.some((record) => record.status === CHANGE_MODIFIED &&
    record.path === QUOTED_PATHS[0]));
});

test('distinct rename sides cannot alias through a printable record separator', (t) => {
  const fixture = buildFixtureRepo();
  t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
  for (const [before] of COLON_RENAMES) {
    fs.mkdirSync(path.dirname(path.join(fixture, before)), {recursive: true});
    fs.writeFileSync(path.join(fixture, before), `// owner ${before}\n`);
  }
  git(fixture, ['add', '-A']);
  git(fixture, ['commit', '--quiet', '-m', 'record colon paths']);
  for (const [before, after] of COLON_RENAMES) {
    fs.mkdirSync(path.dirname(path.join(fixture, after)), {recursive: true});
    git(fixture, ['mv', '--', before, after]);
  }
  const changed = changedRecords({root: fixture});
  for (const [before, after] of COLON_RENAMES) {
    assert.ok(changed.some((record) => record.status === CHANGE_RENAMED &&
      record.oldPath === before && record.path === after),
    `the distinct rename ${before} -> ${after} remains in the candidate`);
  }
});
