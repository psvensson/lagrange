#!/usr/bin/env node

// Session worktree utility: materialize the current working tree (committed HEAD +
// uncommitted tracked changes + untracked-non-ignored files) into a throwaway git
// worktree, so a caller can run/revert/experiment without ever mutating the live tree.
// Used by dt-prove.js (red-on-revert proof) and available for per-session isolation.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {execGit} from './checks/git-invocation.js';

const DEFAULT_ENCODING = 'utf8';
const BUFFER_ENCODING = 'buffer';
const WORKTREE_PREFIX = 'session-worktree-';
const DEPENDENCY_DIRECTORY = 'node_modules';
const CLEANUP_WARNING_PREFIX = '[session-worktree] checkout cleanup unavailable at ';
const ACQUISITION_WARNING_PREFIX = '[session-worktree] checkout acquisition unavailable at ';

function reportCleanupWarning(error, worktreePath) {
  process.stderr.write(
    `${CLEANUP_WARNING_PREFIX}${worktreePath}: ` +
    `${error instanceof Error ? error.message : error}\n`);
}

function git(root, args, options = {}) {
  return execGit(['-C', root, ...args], {
    encoding: DEFAULT_ENCODING,
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
  let acquired = false;
  try {
    git(root, ['worktree', 'add', '--detach', '--quiet', worktreePath, 'HEAD']);
    acquired = true;
    applyTrackedDiff(root, worktreePath);
    copyUntrackedInto(root, worktreePath, listUntrackedFiles(root));
    // Share the host node_modules so test runners resolve their binaries and deps;
    // it is gitignored (absent from the worktree) and identical at this HEAD.
    const dependencyLink = path.join(worktreePath, DEPENDENCY_DIRECTORY);
    if (!fs.existsSync(dependencyLink)) {
      fs.symlinkSync(path.join(root, DEPENDENCY_DIRECTORY), dependencyLink);
    }
  } catch (error) {
    if (acquired) {
      try {
        removeWorktree(root, worktreePath);
      } catch (cleanupError) {
        reportCleanupWarning(cleanupError, worktreePath);
      }
    } else {
      process.stderr.write(`${ACQUISITION_WARNING_PREFIX}${worktreePath}: ${error.message}\n`);
    }
    throw error;
  }
  return worktreePath;
}

// Remove an empty session parent only after Git removed its registered
// checkout. A matching prefix never authorizes recursive deletion of other
// material a caller or an interrupted acquisition left in the parent.
function cleanupTempParent(worktreePath) {
  if (!path.basename(path.dirname(worktreePath)).startsWith(WORKTREE_PREFIX)) {
    return;
  }
  fs.rmdirSync(path.dirname(worktreePath));
}

function removeWorktree(root, worktreePath) {
  git(root, ['worktree', 'remove', '--force', worktreePath]);
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
