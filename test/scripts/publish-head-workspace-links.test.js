// The publisher links the gate worktree's gitignored dependency trees from
// the main checkout. Since data/releases holds committed publication
// receipts, a fresh worktree already has a REAL data/ directory: the link
// must then be per gitignored entry, never a whole-directory symlink that
// collides with the checkout (EEXIST, release-pipeline-dry-run 2026-09-12)
// or shadows the tracked receipts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {linkWorkspaceDependencies} from '../../scripts/publish-head.js';

function tree(base, relativeFiles) {
  for (const relative of relativeFiles) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, relative);
  }
}

test('links only the gitignored entries when the worktree already has data/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-root-'));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-worktree-'));
  tree(root, ['node_modules/pkg/index.js', 'data/movielens/u.data',
    'data/cluster-rejoin-hints.json', 'data/releases/v0.0.1.json']);
  tree(worktree, ['data/releases/v0.0.1.json']);

  const links = linkWorkspaceDependencies(root, worktree);

  assert.ok(fs.lstatSync(path.join(worktree, 'node_modules')).isSymbolicLink(),
    'an absent directory is linked whole');
  assert.ok(fs.lstatSync(path.join(worktree, 'data')).isDirectory() &&
    !fs.lstatSync(path.join(worktree, 'data')).isSymbolicLink(),
  'the real data/ directory of the checkout is kept');
  assert.ok(fs.lstatSync(path.join(worktree, 'data', 'movielens')).isSymbolicLink(),
    'the gitignored dataset tree is linked into it');
  assert.ok(fs.lstatSync(path.join(worktree, 'data', 'cluster-rejoin-hints.json')).isSymbolicLink(),
    'a gitignored file is linked too');
  assert.ok(!fs.lstatSync(path.join(worktree, 'data', 'releases')).isSymbolicLink(),
    'the tracked receipts are not shadowed');
  assert.equal(fs.readFileSync(path.join(worktree, 'data', 'releases', 'v0.0.1.json'), 'utf8'),
    'data/releases/v0.0.1.json');
  assert.deepEqual(links.map((entry) => path.relative(worktree, entry.link)).sort(),
    ['data/cluster-rejoin-hints.json', 'data/movielens', 'node_modules'],
    'every link made is recorded for validation');
});
