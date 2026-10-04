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
//     working tree is never a proof input. It also refuses when the run cost
//     the checkout its identity - push-gate-integrity.)
//   (--supervise <checkout> --gate <sha> --run ... is the gate's own
//     supervisor of its command; nothing else calls it.)
//
// Exit 0 when every corpus gate passes on the snapshot; exit 1 on the first
// failing gate; exit 2 on usage error. The throwaway worktree is always
// removed; a failed --gate run first keeps its diagnostics (publish-head.js).

import process from 'node:process';
import {execFileSync, spawn, spawnSync} from 'node:child_process';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  createSnapshotWorktree,
  removeWorktree,
} from '../session-worktree.js';
import {
  CHECKOUT_IDENTITY_LOST,
  GATE_WORKSPACE_DIRECTORIES,
  assertWorkspaceDependencyLinks,
  checkoutIdentity,
  exactCheckoutStatus,
  linkWorkspaceDependencies,
  retainGateDiagnostics,
} from '../publish-head.js';
import {
  WORKSPACE_INJECTION_ENV,
} from './change-selection-constants.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const TEXT_ENCODING = 'utf8';
const REF_FLAG = '--ref';
const IN_PLACE_FLAG = '--in-place';
const GATE_FLAG = '--gate';
const REF_LINES_FLAG = '--ref-lines';
const RUN_FLAG = '--run';
const SUPERVISE_FLAG = '--supervise';
const GATE_HOOK_COMMAND = Object.freeze(['bash', '.githooks/pre-push']);
const GATE_PUSHED_SHA_ENV = 'LAGRANGE_GATE_PUSHED_SHA';
const GATE_RED_MAIN_CHECKED_ENV = 'LAGRANGE_GATE_RED_MAIN_CHECKED';
const ENABLED_ENV_VALUE = '1';
const INJECTION_SEPARATOR = ',';
const GIT_PEEL_ARGUMENTS = Object.freeze(['rev-parse', '--verify', '--quiet']);
const COMMIT_PEEL_SUFFIX = '^{commit}';
const GIT_WORKTREE_ADD_ARGUMENTS = Object.freeze(
  ['worktree', 'add', '--detach', '--quiet']);
// The supervisor's stop: the signals it forwards to the command's group (the
// second is the one it sends when the gate process is gone), how often it
// looks for its gate, and how long a stopped group gets before SIGKILL.
const STOP_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const KILL_SIGNAL = 'SIGKILL';
const GATE_WATCH_MS = 100;
const STOP_GRACE_MS = 5000;
const SIGNAL_EXIT_BASE = 128;
const INHERIT_STDIO = 'inherit';
const ERRNO_NO_PERMISSION = 'EPERM';
const CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit'});
// Beside each gate checkout: the gate process that owns it and the sha.
const GATE_OWNER_FILE = 'gate-owner';
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
  GATE_RETAINED: '[push-gate] gate diagnostics retained in ',
  GATE_NOTHING_RETAINED: '[push-gate] no acceptance receipt to retain from the gate checkout\n',
  GATE_IDENTITY_LOST: '[push-gate] refused: ',
  GATE_STOPPED: '[push-gate] the gate process ended while its command ran: ' +
    'the command\'s process group was stopped\n',
  GATE_STRANDED: '[push-gate] releasing a gate checkout whose gate is gone: ',
});
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);

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
function gateWorktreePath(root, owner = null) {
  const parent = path.join(root, ...GATE_WORKTREE_PARENT);
  fs.mkdirSync(parent, {recursive: true});
  const directory = fs.mkdtempSync(path.join(parent, GATE_WORKTREE_PREFIX));
  if (owner) fs.writeFileSync(path.join(directory, GATE_OWNER_FILE), `${process.pid} ${owner}`);
  return path.join(directory, GATE_WORKTREE_LEAF);
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
  const worktreePath = gateWorktreePath(root, commit);
  execFileSync(GIT_BINARY,
    [GIT_WORKING_TREE_FLAG, root, ...GIT_WORKTREE_ADD_ARGUMENTS,
      worktreePath, commit],
    {encoding: TEXT_ENCODING});
  return worktreePath;
}

// push-gate-integrity: a stop request is honoured. The gate itself runs
// synchronously and installs no signal handler - a handler only replaced the
// default action while spawnSync blocked, so a SIGTERM sent to the gate
// process alone was swallowed and the command ran on to decide the verdict.
// The default action now ends the gate at once, by the signal. The command
// runs under a supervisor (this script again, --supervise) in its own process
// group: the supervisor forwards a signal sent to it, and when the gate
// process is gone it stops the group (TERM, then KILL after a grace), keeps
// the diagnostics and removes the checkout. A checkout stranded by a gate that
// died outside that window (making or releasing the checkout) is released by
// the next gate of the repository: every gate checkout records its owner.
function supervisedCommand(worktreePath, sha, command) {
  return [fileURLToPath(import.meta.url), SUPERVISE_FLAG, worktreePath,
    GATE_FLAG, sha, RUN_FLAG, ...command];
}

function releaseGateCheckout(root, worktreePath, sha) {
  const retained = retainGateDiagnostics(root, worktreePath, sha);
  process.stderr.write(retained ? `${LOCAL_TEXT.GATE_RETAINED}${retained}\n` :
    LOCAL_TEXT.GATE_NOTHING_RETAINED);
  removeWorktree(root, worktreePath);
}

function ownerAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === ERRNO_NO_PERMISSION;
  }
}

function releaseStrandedGateCheckouts(root) {
  const parent = path.join(root, ...GATE_WORKTREE_PARENT);
  for (const entry of fs.existsSync(parent) ? fs.readdirSync(parent) : []) {
    const owner = path.join(parent, entry, GATE_OWNER_FILE);
    if (!fs.existsSync(owner)) continue;
    const [pid, sha] = stringSplit(stringTrim(fs.readFileSync(owner, TEXT_ENCODING)),
      LOCAL_TEXT.ARGUMENT_SEPARATOR);
    if (ownerAlive(Number(pid))) continue;
    process.stderr.write(`${LOCAL_TEXT.GATE_STRANDED}${sha} (gate ${pid})\n`);
    releaseGateCheckout(root, path.join(parent, entry, GATE_WORKTREE_LEAF), sha);
  }
}

function superviseGateCommand(root, {gateSha: sha, checkout, command}) {
  const gate = process.ppid;
  const child = spawn(command[0], command.slice(1),
    {cwd: checkout, stdio: INHERIT_STDIO, detached: true});
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // the group is gone
    }
  };
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    signalGroup(signal);
    setTimeout(() => signalGroup(KILL_SIGNAL), STOP_GRACE_MS).unref();
  };
  for (const signal of STOP_SIGNALS) process.on(signal, () => stop(signal));
  const watch = setInterval(() => {
    if (process.ppid !== gate) stop(STOP_SIGNALS[1]);
  }, GATE_WATCH_MS);
  child.on(CHILD_EVENT.ERROR, (error) => {
    process.stderr.write(`[push-gate] could not run ${command[0]}: ${error.message}\n`);
    process.exit(EXIT_GATE_FAILURE);
  });
  child.on(CHILD_EVENT.EXIT, (code, signal) => {
    clearInterval(watch);
    if (process.ppid !== gate) {
      signalGroup(KILL_SIGNAL);
      process.stderr.write(LOCAL_TEXT.GATE_STOPPED);
      fs.writeFileSync(path.join(path.dirname(checkout), GATE_OWNER_FILE),
        `${process.pid} ${sha}`);
      releaseGateCheckout(root, checkout, sha);
    }
    process.exit(code ?? SIGNAL_EXIT_BASE + (os.constants.signals[signal] || 0));
  });
}

function gateExactSha(root, {sha: requestedSha, refLinesFile, command}) {
  releaseStrandedGateCheckouts(root);
  const sha = peelToCommit(root, requestedSha);
  const worktreePath = checkoutExactCommit(root, sha);
  // Every end but a pass - a throw included - keeps the publisher's
  // diagnostics: the checkout is the only copy of what a failed gate wrote.
  let passed = false;
  try {
    const identity = checkoutIdentity(worktreePath, sha);
    const links = linkWorkspaceDependencies(root, worktreePath);
    // A push from a linked worktree exports that worktree's GIT_DIR into the
    // hook; inherited, it would make the gate's own git reads - HEAD, status,
    // the lint range - answer for the pusher's checkout, not this one; and no
    // git read in the run may discover past the checkout into this one.
    const env = {
      ...gitProcessEnvironment(process.env, worktreePath),
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
    const result = spawnSync(process.execPath,
      supervisedCommand(worktreePath, sha, command), {
        cwd: root,
        env,
        input,
        stdio: ['pipe', INHERIT_STDIO, INHERIT_STDIO],
      });
    try {
      assertWorkspaceDependencyLinks(links);
    } catch {
      process.stderr.write(LOCAL_TEXT.GATE_LINKS_BROKEN);
      return EXIT_GATE_FAILURE;
    }
    for (const link of links) fs.unlinkSync(link.link);
    const status = stringTrim(exactCheckoutStatus(identity));
    if (status.length > 0) {
      process.stderr.write(`${LOCAL_TEXT.GATE_DIRTY}${status}\n`);
      return EXIT_GATE_FAILURE;
    }
    passed = result.status === 0;
    return result.status ?? EXIT_GATE_FAILURE;
  } catch (error) {
    if (error.code !== CHECKOUT_IDENTITY_LOST) throw error;
    process.stderr.write(`${LOCAL_TEXT.GATE_IDENTITY_LOST}${error.message}\n`);
    return EXIT_GATE_FAILURE;
  } finally {
    if (passed) removeWorktree(root, worktreePath);
    else releaseGateCheckout(root, worktreePath, sha);
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
  const parsed = {ref: null, inPlace: false, gateSha: null, refLinesFile: null, command: null,
    checkout: null};
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
    } else if (args[index] === SUPERVISE_FLAG && hasValue) {
      parsed.checkout = args[index + 1];
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
function validateGateArguments({ref, inPlace, gateSha, refLinesFile, command, checkout}) {
  if (inPlace && ref !== null) usage();
  if (checkout !== null && (gateSha === null || command === null || refLinesFile !== null)) usage();
  if (gateSha !== null && (inPlace || ref !== null)) usage();
  if (gateSha === null && (refLinesFile !== null || command !== null)) usage();
}

function main(argv) {
  const parsed = parseGateArguments(argv.slice(2));
  validateGateArguments(parsed);
  const {ref, inPlace, gateSha, refLinesFile, command} = parsed;

  const root = repoRoot();
  if (parsed.checkout !== null) return superviseGateCommand(root, parsed);
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
