#!/usr/bin/env node

// Session worktree utility: materialize the current working tree (committed HEAD +
// uncommitted tracked changes + untracked-non-ignored files) into a throwaway git
// worktree, so a caller can run/revert/experiment without ever mutating the live tree.
// Used by dt-prove.js (red-on-revert proof) and available for per-session isolation.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const DEFAULT_ENCODING = 'utf8';
const BUFFER_ENCODING = 'buffer';
const WORKTREE_PREFIX = 'session-worktree-';

function git(root, args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: DEFAULT_ENCODING,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

function uniqueWorktreePath() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), WORKTREE_PREFIX));
  // git worktree add requires the target dir to not already exist.
  return path.join(base, 'tree');
}

function listUntrackedFiles(root) {
  const out = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return out.split('\0').filter(Boolean);
}

function copyUntrackedInto(root, worktreePath, relPaths) {
  for (const rel of relPaths) {
    const from = path.join(root, rel);
    const to = path.join(worktreePath, rel);
    fs.mkdirSync(path.dirname(to), {recursive: true});
    // Preserve symlinks as links (copyFileSync would dereference them into real files).
    if (fs.lstatSync(from).isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(from), to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function applyTrackedDiff(root, worktreePath) {
  // --binary + buffer IO so binary-file changes round-trip without UTF-8 corruption.
  const diff = git(root, ['diff', 'HEAD', '--binary'], {encoding: BUFFER_ENCODING});
  if (diff.length === 0) {
    return false;
  }
  git(worktreePath, ['apply', '--whitespace=nowarn'], {input: diff, encoding: BUFFER_ENCODING});
  return true;
}

// Create a detached worktree at HEAD, then reconstruct the live working-tree state
// inside it (tracked modifications via patch, untracked files via copy). The live
// tree is never touched. Returns the absolute worktree path.
function createSnapshotWorktree(root, worktreePath = uniqueWorktreePath()) {
  git(root, ['worktree', 'add', '--detach', '--quiet', worktreePath, 'HEAD']);
  try {
    applyTrackedDiff(root, worktreePath);
    copyUntrackedInto(root, worktreePath, listUntrackedFiles(root));
    // Share the host node_modules so test runners resolve their binaries and deps;
    // it is gitignored (absent from the worktree) and identical at this HEAD.
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(worktreePath, 'node_modules'));
  } catch (error) {
    removeWorktree(root, worktreePath);
    throw error;
  }
  return worktreePath;
}

// Remove ONLY the mkdtemp parent we created (guarded by prefix so a caller-supplied
// arbitrary worktree path can never cause its parent dir to be deleted).
function cleanupTempParent(worktreePath) {
  if (!path.basename(path.dirname(worktreePath)).startsWith(WORKTREE_PREFIX)) {
    return;
  }
  try {
    fs.rmSync(path.dirname(worktreePath), {recursive: true, force: true});
  } catch (_error) {
    // Best-effort temp cleanup; nothing more we can safely do.
  }
}

function removeWorktree(root, worktreePath) {
  try {
    git(root, ['worktree', 'remove', '--force', worktreePath]);
  } catch (_error) {
    // Fall back to pruning so a partial add never strands worktree metadata.
    try {
      git(root, ['worktree', 'prune']);
    } catch (_pruneError) {
      // Nothing more we can safely do; the live tree was never mutated.
    }
  }
  cleanupTempParent(worktreePath);
}

function listWorktrees(root) {
  return git(root, ['worktree', 'list']);
}

function main(argv = process.argv, root = process.cwd()) {
  const [command, target] = argv.slice(2);
  if (command === 'snapshot') {
    const wt = createSnapshotWorktree(root);
    process.stdout.write(`${wt}\n`);
    return 0;
  }
  if (command === 'remove' && target) {
    removeWorktree(root, target);
    return 0;
  }
  if (command === 'list') {
    process.stdout.write(listWorktrees(root));
    return 0;
  }
  process.stderr.write('usage: session-worktree <snapshot | remove <path> | list>\n');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

export {
  createSnapshotWorktree,
  removeWorktree,
  listWorktrees,
};
