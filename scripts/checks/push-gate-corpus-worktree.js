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
//   node scripts/checks/push-gate-corpus-worktree.js --in-place
//     (gate THIS tree where it stands: for a caller that already runs
//     inside an exact-HEAD worktree, such as `npm run publish`, a second
//     materialization would only copy the same bytes again)
//   node scripts/checks/push-gate-corpus-worktree.js --gate <sha>
//       [--ref-lines <file>] [--run <command> [args...]]
//     (proof-authority-integrity: materialize the pushed sha ONCE into an
//     immutable throwaway checkout with the workspace injections declared,
//     then run the WHOLE pre-push hook there - or the given command - with
//     the pushed ref lines on stdin; refuse if the run left the checkout
//     dirty. The pre-push hook calls this for itself when it is not already
//     inside such a checkout, so every stage proves the pushed bytes and the
//     working tree is never a proof input.)
//
// Exit 0 when every corpus gate passes on the snapshot; exit 1 on the first
// failing gate; exit 2 on usage error. The throwaway worktree is always
// removed, including on gate failure.

import process from 'node:process';
import {execFileSync, spawnSync} from 'node:child_process';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSnapshotWorktree,
  removeWorktree,
} from '../session-worktree.js';
import {
  GATE_WORKSPACE_DIRECTORIES,
  assertWorkspaceDependencyLinks,
  linkWorkspaceDependencies,
} from '../publish-head.js';
import {
  WORKSPACE_INJECTION_ENV,
} from './change-selection-constants.js';

const TEXT_ENCODING = 'utf8';
const REF_FLAG = '--ref';
const IN_PLACE_FLAG = '--in-place';
const GATE_FLAG = '--gate';
const REF_LINES_FLAG = '--ref-lines';
const RUN_FLAG = '--run';
const GATE_HOOK_COMMAND = Object.freeze(['bash', '.githooks/pre-push']);
const GATE_PUSHED_SHA_ENV = 'LAGRANGE_GATE_PUSHED_SHA';
const GATE_RED_MAIN_CHECKED_ENV = 'LAGRANGE_GATE_RED_MAIN_CHECKED';
const ENABLED_ENV_VALUE = '1';
const INJECTION_SEPARATOR = ',';
const GIT_STATUS_ARGUMENTS = Object.freeze(['status', '--porcelain']);
const GIT_PEEL_ARGUMENTS = Object.freeze(['rev-parse', '--verify', '--quiet']);
const COMMIT_PEEL_SUFFIX = '^{commit}';
const GIT_WORKTREE_ADD_ARGUMENTS = Object.freeze(
  ['worktree', 'add', '--detach', '--quiet']);
const CLEANUP_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const SIGNAL_EXIT_BASE = 128;
// The gate checkout lives under the repository (gitignored), as the
// publisher's does: a checkout under the system temp dir fails the tests that
// resolve their fixtures against os.tmpdir(). The parent keeps the session
// worktree prefix so its cleanup removes it.
const GATE_WORKTREE_PARENT = Object.freeze(['test-output', 'push-gate-worktrees']);
const GATE_WORKTREE_PREFIX = 'session-worktree-';
const GATE_WORKTREE_LEAF = 'tree';
const EMPTY_INPUT = '';
const EXIT_USAGE = 2;
const EXIT_GATE_FAILURE = 1;
const GIT_BINARY = 'git';
const GIT_WORKING_TREE_FLAG = '-C';
const GIT_ROOT_ARGUMENTS = Object.freeze(['rev-parse', '--show-toplevel']);
const GIT_RESET_ARGUMENTS = Object.freeze(
  ['reset', '--hard', '--quiet']);
const GIT_CLEAN_ARGUMENTS = Object.freeze(
  ['clean', '-fdq', '-e', 'node_modules']);
const LOCAL_TEXT = Object.freeze({
  ARGUMENT_SEPARATOR: ' ',
  CORPUS_PASSED:
    '[push-gate-corpus] corpus gates passed on the pushed tree\n',
  USAGE: 'usage: push-gate-corpus-worktree.js [--ref <sha> | --in-place | ' +
    '--gate <sha> [--ref-lines <file>] [--run <command> [args...]]]\n',
  GATE_MATERIALIZED: '[push-gate] proving ',
  GATE_IN: ' in ',
  GATE_DIRTY: '[push-gate] the gate mutated the exact checkout of the pushed sha:\n',
  GATE_LINKS_BROKEN: '[push-gate] a workspace injection link was replaced during the gate\n',
});
const stringTrim = Function.call.bind(String.prototype.trim);

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
  process.stderr.write(LOCAL_TEXT.USAGE);
  process.exit(EXIT_USAGE);
}

function repoRoot() {
  const output = execFileSync(
    GIT_BINARY,
    GIT_ROOT_ARGUMENTS,
    {encoding: TEXT_ENCODING},
  );
  return stringTrim(output);
}

// Materialize the tree under test. With --ref, reset the snapshot to the
// exact pushed tree; otherwise gate the live working-tree state (committed
// HEAD plus uncommitted tracked and untracked-non-ignored files), which is
// what a pre-push hook is about to ship.
function gateWorktreePath(root) {
  const parent = path.join(root, ...GATE_WORKTREE_PARENT);
  fs.mkdirSync(parent, {recursive: true});
  return path.join(fs.mkdtempSync(path.join(parent, GATE_WORKTREE_PREFIX)),
    GATE_WORKTREE_LEAF);
}

function materializeTreeUnderTest(root, ref, worktreePath = undefined) {
  const snapshot = createSnapshotWorktree(root, worktreePath);
  if (!ref) {
    return snapshot;
  }
  try {
    execFileSync(
      GIT_BINARY,
      [GIT_WORKING_TREE_FLAG, snapshot, ...GIT_RESET_ARGUMENTS, ref],
      {encoding: TEXT_ENCODING});
    // reset --hard restores tracked files to the ref but leaves the
    // untracked files createSnapshotWorktree copied from the live session -
    // exactly the concurrent-session in-flight files this --ref mode exists
    // to exclude ("must neither dilute nor false-fail this push"). Clean
    // them, keeping the shared node_modules symlink the runners need.
    execFileSync(
      GIT_BINARY,
      [GIT_WORKING_TREE_FLAG, snapshot, ...GIT_CLEAN_ARGUMENTS],
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
      `[push-gate-corpus] ${command} ` +
      `${args.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)} ` +
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
        `[push-gate-corpus] ${command} ` +
        `${args.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)} failed ` +
        `(exit ${result.status}) on the pushed tree\n`);
      return result.status ?? EXIT_GATE_FAILURE;
    }
  }
  return 0;
}

// proof-authority-integrity: the pushed sha, materialized once, is the only
// tree the whole gate reads. The injections (node_modules, data) are declared
// to the inner run through the same variable the publisher uses, so the inner
// hook runs its stages in place; the run's stdin carries the pushed ref lines
// so the inner hook sees the same push. Any tracked mutation left behind, or
// a replaced injection link, refuses the push.
// The commit a pushed sha names: an annotated tag peels to the commit it
// points at, and a symbolic name (HEAD) resolves to its sha, so the exported
// identity is always the checkout's HEAD.
function peelToCommit(root, sha) {
  return stringTrim(execFileSync(GIT_BINARY,
    [GIT_WORKING_TREE_FLAG, root, ...GIT_PEEL_ARGUMENTS,
      `${sha}${COMMIT_PEEL_SUFFIX}`],
    {encoding: TEXT_ENCODING}));
}

// A fresh detached checkout of exactly the commit: nothing from the working
// tree is copied, so a file the pushed .gitignore ignores cannot leak in.
function checkoutExactCommit(root, commit) {
  const worktreePath = gateWorktreePath(root);
  execFileSync(GIT_BINARY,
    [GIT_WORKING_TREE_FLAG, root, ...GIT_WORKTREE_ADD_ARGUMENTS,
      worktreePath, commit],
    {encoding: TEXT_ENCODING});
  return worktreePath;
}

// An interrupted gate must not strand its checkout: the signal removes the
// worktree, then re-raises through the conventional exit code.
function removeWorktreeOnSignal(root, worktreePath) {
  const handlers = [];
  for (const signal of CLEANUP_SIGNALS) {
    const handler = () => {
      removeWorktree(root, worktreePath);
      process.exit(SIGNAL_EXIT_BASE + (os.constants.signals[signal] || 0));
    };
    process.on(signal, handler);
    handlers.push([signal, handler]);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

function gateExactSha(root, {sha: requestedSha, refLinesFile, command}) {
  const sha = peelToCommit(root, requestedSha);
  const worktreePath = checkoutExactCommit(root, sha);
  const releaseSignals = removeWorktreeOnSignal(root, worktreePath);
  try {
    const links = linkWorkspaceDependencies(root, worktreePath);
    const env = {
      ...process.env,
      [WORKSPACE_INJECTION_ENV]:
        GATE_WORKSPACE_DIRECTORIES.join(INJECTION_SEPARATOR),
      [GATE_PUSHED_SHA_ENV]: sha,
      [GATE_RED_MAIN_CHECKED_ENV]: ENABLED_ENV_VALUE,
    };
    const input = refLinesFile ?
      fs.readFileSync(refLinesFile, TEXT_ENCODING) : EMPTY_INPUT;
    process.stdout.write(
      `${LOCAL_TEXT.GATE_MATERIALIZED}${sha}${LOCAL_TEXT.GATE_IN}` +
      `${worktreePath}: ${command.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)}\n`);
    const result = spawnSync(command[0], command.slice(1), {
      cwd: worktreePath,
      env,
      input,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (result.error) {
      process.stderr.write(`[push-gate] could not run ${command[0]}: ` +
        `${result.error.message}\n`);
      return EXIT_GATE_FAILURE;
    }
    try {
      assertWorkspaceDependencyLinks(links);
    } catch {
      process.stderr.write(LOCAL_TEXT.GATE_LINKS_BROKEN);
      return EXIT_GATE_FAILURE;
    }
    for (const link of links) fs.unlinkSync(link.link);
    const status = stringTrim(execFileSync(GIT_BINARY,
      [GIT_WORKING_TREE_FLAG, worktreePath, ...GIT_STATUS_ARGUMENTS],
      {encoding: TEXT_ENCODING}));
    if (status.length > 0) {
      process.stderr.write(`${LOCAL_TEXT.GATE_DIRTY}${status}\n`);
      return EXIT_GATE_FAILURE;
    }
    return result.status ?? EXIT_GATE_FAILURE;
  } finally {
    releaseSignals();
    removeWorktree(root, worktreePath);
  }
}

function gateMaterializedTree(root, ref) {
  const worktreePath = materializeTreeUnderTest(root, ref);
  try {
    return runCorpusGates(worktreePath);
  } finally {
    removeWorktree(root, worktreePath);
  }
}

// The command line, read once: each flag names what it selects, and an
// unknown argument is the usage refusal.
function parseGateArguments(args) {
  const parsed = {ref: null, inPlace: false, gateSha: null, refLinesFile: null, command: null};
  for (let index = 0; index < args.length; index += 1) {
    const hasValue = index + 1 < args.length;
    if (args[index] === REF_FLAG && hasValue) {
      parsed.ref = args[index + 1];
      index += 1;
    } else if (args[index] === IN_PLACE_FLAG) {
      parsed.inPlace = true;
    } else if (args[index] === GATE_FLAG && hasValue) {
      parsed.gateSha = args[index + 1];
      index += 1;
    } else if (args[index] === REF_LINES_FLAG && hasValue) {
      parsed.refLinesFile = args[index + 1];
      index += 1;
    } else if (args[index] === RUN_FLAG && hasValue) {
      parsed.command = args.slice(index + 1);
      break;
    } else {
      usage();
    }
  }
  return parsed;
}

// The three modes exclude each other, and the exact-sha extras belong to
// the exact-sha mode only.
function validateGateArguments({ref, inPlace, gateSha, refLinesFile, command}) {
  if (inPlace && ref !== null) usage();
  if (gateSha !== null && (inPlace || ref !== null)) usage();
  if (gateSha === null && (refLinesFile !== null || command !== null)) usage();
}

function main(argv) {
  const parsed = parseGateArguments(argv.slice(2));
  validateGateArguments(parsed);
  const {ref, inPlace, gateSha, refLinesFile, command} = parsed;

  const root = repoRoot();
  if (gateSha !== null) {
    return gateExactSha(root, {
      sha: gateSha,
      refLinesFile,
      command: command || [...GATE_HOOK_COMMAND],
    });
  }
  const gateStatus = inPlace ?
    runCorpusGates(root) :
    gateMaterializedTree(root, ref);
  if (gateStatus !== 0) {
    return gateStatus;
  }
  process.stdout.write(LOCAL_TEXT.CORPUS_PASSED);
  return 0;
}

try {
  process.exitCode = main(process.argv);
} catch (error) {
  process.stderr.write(
    `[push-gate-corpus] error: ${error?.message ?? String(error)}\n`);
  process.exitCode = EXIT_GATE_FAILURE;
}
