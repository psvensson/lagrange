// Contract for the boundary between repository content and workspace scaffolding.
//
// The push gate materialises the pushed tree into a throwaway worktree and
// links node_modules and data into it. On 2026-08-19 that made every gate run
// refuse: .gitignore declared those paths directory-only, a symlink is not a
// directory, so git reported both as untracked repository content and the
// exhaustive taxonomy correctly refused to classify them. `npm test` inside a
// gate worktree proved nothing and said UNKNOWN_SCOPE.
//
// The .gitignore phrasing was fixed, but phrasing is the wrong authority: it
// makes the proof universe depend on how a worktree happens to be assembled.
// The layer that INJECTS a path declares it instead.
//
// Both directions are pinned, and the second is the one that keeps this honest:
//
//   declared injection      -> excluded, so the gate can classify its tree
//   undeclared symlink      -> INCLUDED, because new product content may well
//                              be a symlink, and dropping it silently would be
//                              under-selection - the failure mode that looks
//                              exactly like success
//
// So "ignore every untracked symlink" is specifically NOT the rule, and the
// third test below fails if anyone implements it that way.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  changedRecords,
  declaredWorkspaceInjections,
  isWorkspaceInjection,
  semanticPaths,
  withoutWorkspaceInjections,
} from '../../scripts/checks/changed-paths.js';
import {
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';

const UTF8 = 'utf8';
const INJECTED = {[WORKSPACE_INJECTION_ENV]: 'node_modules,data'};

function git(repo, args) {
  execFileSync('git', args, {cwd: repo, encoding: UTF8, stdio: 'pipe'});
}

// A repository assembled the way the push gate assembles one: a committed tree
// plus two external directories linked in, plus a genuinely new product file
// and a genuinely new product symlink.
function buildInjectedWorktree() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-inject-'));
  const external = path.join(workspace, 'external');
  const repo = path.join(workspace, 'repo');
  fs.mkdirSync(path.join(external, 'node_modules'), {recursive: true});
  fs.mkdirSync(path.join(external, 'data'), {recursive: true});
  fs.writeFileSync(
    path.join(external, 'node_modules', 'installed.js'), '', UTF8);
  fs.mkdirSync(path.join(repo, 'src'), {recursive: true});

  git(workspace, ['init', '--quiet', 'repo']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'fixture']);
  fs.writeFileSync(path.join(repo, 'src', 'kept.js'), 'export const a = 1;\n',
    UTF8);
  git(repo, ['add', '.']);
  git(repo, ['commit', '--quiet', '-m', 'base']);

  // The workspace injection, exactly as the gate does it: symlinks, and no
  // .gitignore entry that would hide them.
  fs.symlinkSync(path.join(external, 'node_modules'),
    path.join(repo, 'node_modules'), 'dir');
  fs.symlinkSync(path.join(external, 'data'), path.join(repo, 'data'), 'dir');

  // Genuine new product content, one plain file and one SYMLINK.
  fs.writeFileSync(path.join(repo, 'src', 'added.js'), 'export const b = 2;\n',
    UTF8);
  fs.symlinkSync('kept.js', path.join(repo, 'src', 'product-link.js'));
  return repo;
}

const repo = buildInjectedWorktree();

test('git reports the injected symlinks as untracked repository content', () => {
  // The premise. If git ever stops reporting them the rest of this file goes
  // vacuous, so it is asserted rather than assumed.
  const untracked = execFileSync('git',
    ['ls-files', '--others', '--exclude-standard'],
    {cwd: repo, encoding: UTF8}).split('\n').filter(Boolean);
  assert.ok(untracked.includes('node_modules'),
    'the fixture must reproduce the condition that broke the gate');
  assert.ok(untracked.includes('data'));
});

test('a declared injection is excluded from the candidate universe', () => {
  const paths = semanticPaths(changedRecords({root: repo}));
  const kept = withoutWorkspaceInjections(paths, INJECTED);
  assert.ok(!kept.includes('node_modules'),
    'node_modules was declared by the injecting layer; it is not source');
  assert.ok(!kept.includes('data'));
});

test('an UNDECLARED symlink stays repository content', () => {
  // The load-bearing direction. "Exclude untracked symlinks" would pass every
  // other test in this file and silently drop real product content.
  const paths = semanticPaths(changedRecords({root: repo}));
  const kept = withoutWorkspaceInjections(paths, INJECTED);
  assert.ok(kept.includes('src/product-link.js'),
    'a new product symlink nobody declared must still reach the taxonomy');
  assert.ok(kept.includes('src/added.js'),
    'ordinary new source must still reach the taxonomy');
});

test('paths beneath a declared injection are excluded too', () => {
  const injections = declaredWorkspaceInjections(INJECTED);
  assert.ok(isWorkspaceInjection('node_modules/pkg/index.js', injections));
  assert.ok(!isWorkspaceInjection('node_modules-shim/index.js', injections),
    'prefix matching must respect path boundaries');
  assert.ok(!isWorkspaceInjection('src/data/store.js', injections),
    'a declaration names a repository-root path, not a basename');
});

test('an ordinary checkout declares nothing and excludes nothing', () => {
  // Local development must keep seeing untracked candidates: the change model
  // is identical, only the workspace contents differ.
  assert.equal(declaredWorkspaceInjections({}).size, 0);
  const paths = semanticPaths(changedRecords({root: repo}));
  assert.deepEqual(withoutWorkspaceInjections(paths, {}), paths);
});
