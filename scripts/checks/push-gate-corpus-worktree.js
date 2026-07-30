#!/usr/bin/env node

// Corpus gates measured on the tree being PUSHED, not the working tree.
//
// Parallel-session architecture epic, item 6: whole-corpus ratchets
// (duplication, file-size) cannot honestly judge a push from a dirty or
// foreign working tree — corpus baselines make subset/staged runs vacuously
// pass, and a concurrent session's in-flight files must not gate this push
// (the 2026-07-29 blocked-push incidents). The honest form materializes the
// pushed tree into a throwaway worktree (session-worktree.js) and runs the
// corpus gates there.
//
// The eslint leg stays in the caller: it is already tracked-only and
// path-scoped, so it correctly measures the committed versions of the files
// a push ships without needing a snapshot.
//
// CLI:
//   node scripts/checks/push-gate-corpus-worktree.js
//     (snapshot the CURRENT working tree state and gate it)
//   node scripts/checks/push-gate-corpus-worktree.js --ref <sha>
//     (gate an exact committed tree, e.g. the pushed local-sha)
//
// Exit 0 when every corpus gate passes on the snapshot; exit 1 on the first
// failing gate; exit 2 on usage error. The throwaway worktree is always
// removed, including on gate failure.

import process from 'node:process';
import {execFileSync, spawnSync} from 'node:child_process';

import {
  createSnapshotWorktree,
  removeWorktree,
} from '../session-worktree.js';

const TEXT_ENCODING = 'utf8';
const REF_FLAG = '--ref';
const EXIT_USAGE = 2;
const EXIT_GATE_FAILURE = 1;

// The corpus gates whose verdicts are only meaningful over the WHOLE tree at
// one commit: both compare whole-corpus counts against baselines anchored on
// clean measurements, so running them on a dirty tree either vacuously passes
// (foreign files dilute the corpus) or false-fails (in-flight work counted).
const CORPUS_GATE_COMMANDS = Object.freeze([
  ['npm', ['run', '-s', 'test:duplication']],
  // process.execPath so the file-size gate runs under the same node that is
  // running this script, not whatever `node` first resolves on the pusher's
  // PATH (verifier observation: bare `node` is not hermetic).
  [process.execPath, ['scripts/check-file-size-thresholds.js']],
]);

function usage() {
  process.stderr.write(
    'usage: push-gate-corpus-worktree.js [--ref <sha>]\n');
  process.exit(EXIT_USAGE);
}

function repoRoot() {
  return execFileSync(
    'git', ['rev-parse', '--show-toplevel'], {encoding: TEXT_ENCODING})
    .trim();
}

// Materialize the tree under test. With --ref, reset the snapshot to the
// exact pushed tree; otherwise gate the live working-tree state (committed
// HEAD plus uncommitted tracked and untracked-non-ignored files), which is
// what a pre-push hook is about to ship.
function materializeTreeUnderTest(root, ref) {
  const snapshot = createSnapshotWorktree(root);
  if (!ref) {
    return snapshot;
  }
  try {
    execFileSync(
      'git', ['-C', snapshot, 'reset', '--hard', '--quiet', ref],
      {encoding: TEXT_ENCODING});
  } catch (error) {
    removeWorktree(root, snapshot);
    throw error;
  }
  return snapshot;
}

// Run every corpus gate inside the snapshot, returning the first failing
// exit code (0 when all pass). spawnSync so a failing gate yields its code
// instead of throwing past cleanup.
function runCorpusGates(worktreePath) {
  for (const [command, args] of CORPUS_GATE_COMMANDS) {
    process.stdout.write(
      `[push-gate-corpus] ${command} ${args.join(' ')} ` +
      `(in ${worktreePath})\n`);
    const result = spawnSync(command, args, {
      cwd: worktreePath,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (result.error) {
      process.stderr.write(
        `[push-gate-corpus] could not run ${command}: ` +
        `${result.error.message}\n`);
      return EXIT_GATE_FAILURE;
    }
    if (result.status !== 0) {
      process.stderr.write(
        `[push-gate-corpus] ${command} ${args.join(' ')} failed ` +
        `(exit ${result.status}) on the pushed tree\n`);
      return result.status ?? EXIT_GATE_FAILURE;
    }
  }
  return 0;
}

function main(argv) {
  const args = argv.slice(2);
  let ref = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === REF_FLAG && index + 1 < args.length) {
      ref = args[index + 1];
      index += 1;
    } else {
      usage();
    }
  }

  const root = repoRoot();
  const worktreePath = materializeTreeUnderTest(root, ref);
  let gateStatus;
  try {
    gateStatus = runCorpusGates(worktreePath);
  } finally {
    removeWorktree(root, worktreePath);
  }
  if (gateStatus !== 0) {
    return gateStatus;
  }
  process.stdout.write(
    '[push-gate-corpus] corpus gates passed on the pushed tree\n');
  return 0;
}

try {
  process.exitCode = main(process.argv);
} catch (error) {
  process.stderr.write(
    `[push-gate-corpus] error: ${error?.message ?? String(error)}\n`);
  process.exitCode = EXIT_GATE_FAILURE;
}
