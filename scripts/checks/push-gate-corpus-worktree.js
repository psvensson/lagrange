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
//     immutable throwaway checkout with the workspace injections declared
//     and its generated proof material made for it (proof-checkout-
//     preparation.js: the import graph a CI or lab checkout has), then run the WHOLE pre-push hook there - or the given command - with
//     the pushed ref lines on stdin; refuse if the run left the checkout
//     dirty. The pre-push hook calls this for itself when it is not already
//     inside such a checkout, so every stage proves the pushed bytes and the
//     working tree is never a proof input.)
//
// Exit 0 when every corpus gate passes on the snapshot; exit 1 on the first
// failing gate; exit 2 on usage error. An exact gate first closes its owned
// child scope and retains failure diagnostics (publish-head.js). Uncertain
// cleanup or retention preserves the original checkout.

import process from 'node:process';
import {Buffer} from 'node:buffer';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {setImmediate as nextTurn, setTimeout as wait} from 'node:timers/promises';

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
  retainGateDiagnostics,
} from '../publish-head.js';
import {
  WORKSPACE_INJECTION_ENV,
} from './change-selection-constants.js';
import {execGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';
import {prepareProofCheckout} from './proof-checkout-preparation.js';

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
const GATE_STOP_SIGNAL = 'SIGTERM';
const CLEANUP_SIGNALS = Object.freeze(['SIGINT', GATE_STOP_SIGNAL, 'SIGHUP']);
const SIGNAL_EXIT_BASE = 128;
const GATE_STOP_GRACE_MS = 5000;
const GATE_STOP_POLL_MS = 20;
const GATE_FORCE_STOP = 'SIGKILL';
const GATE_PROCESS_ABSENT = 'ESRCH';
const GATE_INPUT_PREFIX = 'ref-lines-';
const GATE_INPUT_FILE = 'stdin';
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
  GATE_RETENTION_UNAVAILABLE:
    '[push-gate] diagnostic retention unavailable; original checkout kept at ',
  GATE_CLEANUP_UNAVAILABLE: '[push-gate] checkout cleanup unavailable at ',
  GATE_ACQUISITION_UNAVAILABLE: '[push-gate] checkout acquisition unavailable at ',
});
const stringTrim = Function.call.bind(String.prototype.trim);
const arrayMap = Function.call.bind(Array.prototype.map);

const EVENT_DATA = 'data';
const EVENT_ERROR = 'error';
const EVENT_EXIT = 'exit';
const EVENT_CLOSE = 'close';
const STDIO_PIPE = 'pipe';
const STDIO_IGNORE = 'ignore';
const OUTPUT_HEADER_PREFIX = '[push-gate-corpus] ';
const OUTPUT_HEADER_IN = ' (in ';
const OUTPUT_HEADER_SUFFIX = ')\n';
const ERROR_PREFIX = '[push-gate-corpus] could not run ';
const ERROR_COLON = ': ';
const FAILED_PREFIX = '[push-gate-corpus] ';
const FAILED_MID = ' failed (exit ';
const FAILED_SUFFIX = ') on the pushed tree\n';
const STOPPED_MID = ' stopped by ';
const STOPPED_SUFFIX = ' on the pushed tree\n';
const NEWLINE = '\n';

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
  const output = execGit(
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
    execGit(
      [GIT_WORKING_TREE_FLAG, snapshot, ...GIT_RESET_ARGUMENTS, ref],
      {encoding: TEXT_ENCODING});
    // reset --hard restores tracked files to the ref but leaves the
    // untracked files createSnapshotWorktree copied from the live session -
    // exactly the concurrent-session in-flight files this --ref mode exists
    // to exclude ("must neither dilute nor false-fail this push"). Clean
    // them, keeping the shared node_modules symlink the runners need.
    execGit(
      [GIT_WORKING_TREE_FLAG, snapshot, ...GIT_CLEAN_ARGUMENTS],
      {encoding: TEXT_ENCODING});
  } catch (error) {
    try {
      removeWorktree(root, snapshot);
    } catch (cleanupError) {
      reportGateCleanup(cleanupError, snapshot);
    }
    throw error;
  }
  return snapshot;
}

function executeCorpusCommand(command, args, worktreePath) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: worktreePath,
      stdio: [STDIO_IGNORE, STDIO_PIPE, STDIO_PIPE],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on(EVENT_DATA, (chunk) => stdoutChunks.push(chunk));
    child.stderr.on(EVENT_DATA, (chunk) => stderrChunks.push(chunk));
    child.on(EVENT_ERROR, (error) => {
      resolve({
        command,
        args,
        error,
        status: EXIT_GATE_FAILURE,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      });
    });
    child.on(EVENT_CLOSE, (status, signal) => {
      resolve({
        command,
        args,
        error: null,
        status,
        signal,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      });
    });
  });
}

function reportCorpusGateResult(result, worktreePath) {
  process.stdout.write(
    `${OUTPUT_HEADER_PREFIX}${result.command} ` +
    `${result.args.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)}` +
    `${OUTPUT_HEADER_IN}${worktreePath}${OUTPUT_HEADER_SUFFIX}`,
  );
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    process.stderr.write(
      `${ERROR_PREFIX}${result.command}${ERROR_COLON}` +
      `${result.error.message}${NEWLINE}`,
    );
    return EXIT_GATE_FAILURE;
  }
  if (result.signal) {
    process.stderr.write(`${FAILED_PREFIX}${result.command} ` +
      `${result.args.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)}${STOPPED_MID}` +
      `${result.signal}${STOPPED_SUFFIX}`);
    return EXIT_GATE_FAILURE;
  }
  if (result.status !== 0) {
    process.stderr.write(
      `${FAILED_PREFIX}${result.command} ` +
      `${result.args.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)}` +
      `${FAILED_MID}${result.status}${FAILED_SUFFIX}`,
    );
    return result.status ?? EXIT_GATE_FAILURE;
  }
  return 0;
}

// Run corpus gates concurrently inside the snapshot, buffering output
// per command and flushing in deterministic order, returning the first failing
// exit code (0 when all pass).
async function runCorpusGates(worktreePath) {
  const executions = arrayMap(CORPUS_GATE_COMMANDS, ([command, args]) =>
    executeCorpusCommand(command, args, worktreePath),
  );
  const results = await Promise.all(executions);
  let firstFailure = 0;

  for (let index = 0; index < results.length; index += 1) {
    const failure = reportCorpusGateResult(results[index], worktreePath);
    if (firstFailure === 0) {
      firstFailure = failure;
    }
  }

  return firstFailure;
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
  return stringTrim(execGit(
    [GIT_WORKING_TREE_FLAG, root, ...GIT_PEEL_ARGUMENTS,
      `${sha}${COMMIT_PEEL_SUFFIX}`],
    {encoding: TEXT_ENCODING}));
}

// A fresh detached checkout of exactly the commit: nothing from the working
// tree is copied, so a file the pushed .gitignore ignores cannot leak in.
function checkoutExactCommit(root, commit, worktreePath) {
  execGit(
    [GIT_WORKING_TREE_FLAG, root, ...GIT_WORKTREE_ADD_ARGUMENTS,
      worktreePath, commit],
    {encoding: TEXT_ENCODING});
}

function failExactGate(scope, status, detail = null) {
  if (scope.status === 0) scope.status = status;
  if (detail) process.stderr.write(`${detail}\n`);
}

// One scope spans exact-checkout acquisition, preparation, the gate command
// and finalization. Signals stop admission; only the finalizer owns removal.
function exactGateScope() {
  const scope = {status: 0, signal: null, active: null, handlers: [],
    childrenClosed: true, cleanupCertain: true, worktreePath: null};
  for (const signal of CLEANUP_SIGNALS) {
    const handler = () => {
      if (scope.signal) return;
      scope.signal = signal;
      failExactGate(scope, SIGNAL_EXIT_BASE + os.constants.signals[signal],
        `[push-gate] interrupted by ${signal}; stopping the acquired child scope`);
      if (scope.active) requestGateChildStop(scope, scope.active, signal);
    };
    process.on(signal, handler);
    scope.handlers.push([signal, handler]);
  }
  return scope;
}

function gateChildClosed(run) {
  if (!run.terminal) return false;
  if (!Number.isInteger(run.pid) || run.pid <= 0) return run.error !== null;
  try {
    process.kill(-run.pid, 0);
    return false;
  } catch (error) {
    if (error.code === GATE_PROCESS_ABSENT) return true;
    throw error;
  }
}

function signalGateGroup(run, signal) {
  if (!Number.isInteger(run.pid) || run.pid <= 0) {
    if (run.error) return;
    throw new Error('the acquired child has no process-group identity');
  }
  try {
    process.kill(-run.pid, signal);
  } catch (error) {
    if (error.code !== GATE_PROCESS_ABSENT) throw error;
  }
}

async function waitForGateChildClosure(run) {
  const deadline = performance.now() + GATE_STOP_GRACE_MS;
  while (!gateChildClosed(run)) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) return false;
    await wait(Math.min(GATE_STOP_POLL_MS, remaining));
  }
  return true;
}

async function stopGateChild(scope, run, signal) {
  try {
    signalGateGroup(run, signal);
    run.quiet = await waitForGateChildClosure(run);
    if (run.quiet) return;
    signalGateGroup(run, GATE_FORCE_STOP);
    run.quiet = await waitForGateChildClosure(run);
    if (!run.quiet) throw new Error('the bounded child/group closure wait expired');
  } catch (error) {
    scope.cleanupCertain = false;
    failExactGate(scope, EXIT_GATE_FAILURE,
      `[push-gate] child cleanup unavailable for group ${run.pid}: ${error.message}`);
    // Reporting an unresolved scope must not itself wait forever. These
    // handles belong to this acquisition; this does not claim child closure.
    run.child.stdin?.destroy();
    run.child.unref();
  }
}

function requestGateChildStop(scope, run, signal) {
  if (!run.stop) {
    run.stop = stopGateChild(scope, run, signal).finally(() => run.stopped());
  }
  return run.stop;
}

function observeGateChild(scope, child, command) {
  const run = {child, pid: child.pid, terminal: null, error: null, inputError: null,
    quiet: false, stop: null};
  run.stopComplete = new Promise((resolve) => { run.stopped = resolve; });
  run.closed = new Promise((resolve) => {
    child.on(EVENT_ERROR, (error) => {
      if (!run.error) run.error = error;
      failExactGate(scope, EXIT_GATE_FAILURE,
        `[push-gate] could not run ${command}: ${error.message}`);
    });
    child.once(EVENT_EXIT, (status, signal) => {
      if (status === 0) return;
      failExactGate(scope, status ?? EXIT_GATE_FAILURE, signal ?
        `[push-gate] ${command} stopped by ${signal}` :
        `[push-gate] ${command} failed (exit ${status})`);
    });
    child.once(EVENT_CLOSE, (status, signal) => {
      if (status !== 0) failExactGate(scope, status ?? EXIT_GATE_FAILURE);
      run.terminal = {status, signal, error: run.error};
      resolve(run.terminal);
    });
  });
  return run;
}

function releaseGateInput(scope, input) {
  if (!input || input.released) return null;
  input.released = true;
  let firstError = null;
  const cleanup = [
    () => { if (input.fd !== null) fs.closeSync(input.fd); },
    () => fs.rmSync(input.file, {force: true}),
    () => fs.rmdirSync(input.directory),
  ];
  for (const close of cleanup) {
    try {
      close();
    } catch (error) {
      if (!firstError) firstError = error;
      scope.cleanupCertain = false;
      failExactGate(scope, EXIT_GATE_FAILURE,
        `[push-gate] input cleanup unavailable at ${input.directory}: ${error.message}`);
    }
  }
  return firstError;
}

// The ref lines are complete in an owned file before spawn. A pipe written by
// an asynchronous parent can give a synchronous fd0 reader EAGAIN (placement
// history, 2026-09-23); only this descriptor crosses the execution boundary.
async function runExactGateChild(scope, command, args, options) {
  await nextTurn();
  if (scope.status !== 0) {
    return {status: null, signal: null, interruption: scope.signal,
      error: new Error('exact-gate execution admission is stopped')};
  }
  let input = null;
  let run = null;
  try {
    const {input: text, ...settings} = options;
    if (text !== undefined) {
      const directory = fs.mkdtempSync(path.join(path.dirname(scope.worktreePath),
        GATE_INPUT_PREFIX));
      input = {directory, file: path.join(directory, GATE_INPUT_FILE), fd: null, released: false};
      fs.writeFileSync(input.file, text);
      input.fd = fs.openSync(input.file, 'r');
      settings.stdio = [input.fd, ...settings.stdio.slice(1)];
    }
    const child = spawn(command, args, {...settings, detached: true});
    run = observeGateChild(scope, child, command);
    scope.active = run;
    scope.childrenClosed = false;
    run.inputError = releaseGateInput(scope, input);
    if (run.inputError) requestGateChildStop(scope, run, GATE_STOP_SIGNAL);
    await Promise.race([run.closed, run.stopComplete]);
    if (run.stop) {
      await run.stop;
    } else if (gateChildClosed(run)) {
      run.quiet = true;
    } else {
      failExactGate(scope, EXIT_GATE_FAILURE,
        `[push-gate] command closed before its acquired group ${run.pid}`);
      await requestGateChildStop(scope, run, GATE_STOP_SIGNAL);
    }
    return {...run.terminal, error: run.error || run.inputError, interruption: scope.signal};
  } catch (error) {
    failExactGate(scope, EXIT_GATE_FAILURE,
      `[push-gate] execution unavailable for ${command}: ${error.message}`);
    if (run) await requestGateChildStop(scope, run, GATE_STOP_SIGNAL);
    return {status: run?.terminal?.status ?? null, signal: run?.terminal?.signal ?? null,
      error, interruption: scope.signal};
  } finally {
    releaseGateInput(scope, input);
    if (run?.quiet) {
      scope.childrenClosed = true;
      scope.active = null;
    }
  }
}

function reportGateCleanup(error, worktreePath) {
  process.stderr.write(`${LOCAL_TEXT.GATE_CLEANUP_UNAVAILABLE}${worktreePath}: ` +
    `${error.message}\n`);
}

async function finalizeExactGate(scope, root, sha, acquired) {
  if (scope.active) await requestGateChildStop(scope, scope.active, GATE_STOP_SIGNAL);
  const worktreePath = scope.worktreePath;
  if (!worktreePath) return;
  if (!acquired) {
    failExactGate(scope, EXIT_GATE_FAILURE,
      `${LOCAL_TEXT.GATE_ACQUISITION_UNAVAILABLE}${worktreePath}; attempted path preserved`);
    return;
  }
  if (!scope.childrenClosed) {
    failExactGate(scope, EXIT_GATE_FAILURE,
      `[push-gate] child scope remains unresolved; original checkout kept at ${worktreePath}`);
    return;
  }
  let keepWorktree = !scope.cleanupCertain;
  if (scope.status !== 0) {
    try {
      const retained = retainGateDiagnostics(root, worktreePath, sha);
      process.stderr.write(retained ? `${LOCAL_TEXT.GATE_RETAINED}${retained}\n` :
        LOCAL_TEXT.GATE_NOTHING_RETAINED);
    } catch (error) {
      keepWorktree = true;
      process.stderr.write(`${LOCAL_TEXT.GATE_RETENTION_UNAVAILABLE}${worktreePath}: ` +
        `${error.message}\n`);
    }
  }
  if (keepWorktree) return;
  try {
    removeWorktree(root, worktreePath);
  } catch (error) {
    failExactGate(scope, EXIT_GATE_FAILURE);
    reportGateCleanup(error, worktreePath);
  }
}

async function executeExactGate(scope, root, sha, {refLinesFile, command}) {
  const worktreePath = scope.worktreePath;
  const links = linkWorkspaceDependencies(root, worktreePath);
  const env = {...gitProcessEnvironment(),
    [WORKSPACE_INJECTION_ENV]: GATE_WORKSPACE_DIRECTORIES.join(INJECTION_SEPARATOR),
    [GATE_PUSHED_SHA_ENV]: sha, [GATE_RED_MAIN_CHECKED_ENV]: ENABLED_ENV_VALUE};
  const run = (program, args, options) => runExactGateChild(scope, program, args, options);
  const preparation = await prepareProofCheckout(worktreePath, {env, run});
  if (!preparation.ok) {
    failExactGate(scope, EXIT_GATE_FAILURE, preparation.problem);
    return;
  }
  if (scope.status !== 0) return;
  const input = refLinesFile ? fs.readFileSync(refLinesFile, TEXT_ENCODING) : EMPTY_INPUT;
  process.stdout.write(`${LOCAL_TEXT.GATE_MATERIALIZED}${sha}${LOCAL_TEXT.GATE_IN}` +
    `${worktreePath}: ${command.join(LOCAL_TEXT.ARGUMENT_SEPARATOR)}\n`);
  const result = await run(command[0], command.slice(1), {cwd: worktreePath, env, input,
    stdio: ['pipe', 'inherit', 'inherit']});
  if (result.error || result.interruption || !scope.childrenClosed) return;
  try {
    assertWorkspaceDependencyLinks(links);
  } catch {
    failExactGate(scope, EXIT_GATE_FAILURE, stringTrim(LOCAL_TEXT.GATE_LINKS_BROKEN));
    return;
  }
  for (const link of links) fs.unlinkSync(link.link);
  const status = stringTrim(execGit(
    [GIT_WORKING_TREE_FLAG, worktreePath, ...GIT_STATUS_ARGUMENTS], {encoding: TEXT_ENCODING}));
  if (status.length > 0) failExactGate(scope, EXIT_GATE_FAILURE, `${LOCAL_TEXT.GATE_DIRTY}${status}`);
}

async function gateExactSha(root, request) {
  const scope = exactGateScope();
  let sha = null;
  let acquired = false;
  try {
    sha = peelToCommit(root, request.sha);
    scope.worktreePath = gateWorktreePath(root);
    checkoutExactCommit(root, sha, scope.worktreePath);
    acquired = true;
    await executeExactGate(scope, root, sha, request);
  } catch (error) {
    failExactGate(scope, EXIT_GATE_FAILURE, `[push-gate] execution unavailable: ${error.message}`);
  } finally {
    try {
      await finalizeExactGate(scope, root, sha, acquired);
    } catch (error) {
      failExactGate(scope, EXIT_GATE_FAILURE);
      reportGateCleanup(error, scope.worktreePath);
    } finally {
      for (const [signal, handler] of scope.handlers) process.off(signal, handler);
    }
  }
  return scope.status;
}

async function gateMaterializedTree(root, ref) {
  const worktreePath = materializeTreeUnderTest(root, ref);
  let status = 0;
  let primaryError = null;
  try {
    status = await runCorpusGates(worktreePath);
  } catch (error) {
    primaryError = error;
  }
  try {
    removeWorktree(root, worktreePath);
  } catch (error) {
    reportGateCleanup(error, worktreePath);
    if (status === 0) status = EXIT_GATE_FAILURE;
  }
  if (primaryError) throw primaryError;
  return status;
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

async function main(argv) {
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
    await runCorpusGates(root) :
    await gateMaterializedTree(root, ref);
  if (gateStatus !== 0) {
    return gateStatus;
  }
  process.stdout.write(LOCAL_TEXT.CORPUS_PASSED);
  return 0;
}

try {
  process.exitCode = await main(process.argv);
} catch (error) {
  process.stderr.write(
    `[push-gate-corpus] error: ${error?.message ?? String(error)}\n`);
  process.exitCode = EXIT_GATE_FAILURE;
}
