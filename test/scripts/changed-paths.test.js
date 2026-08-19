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
import {execFileSync} from 'node:child_process';
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

const UTF8 = 'utf8';

function git(repo, args) {
  execFileSync('git', args, {cwd: repo, encoding: UTF8, stdio: 'pipe'});
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
  const fingerprint = () => execFileSync('git',
    ['status', '--porcelain'], {cwd: repo, encoding: UTF8});
  const before = fingerprint();
  changedRecords({root: repo});
  assert.equal(fingerprint(), before);
});
