// Machine-level evidence mutex.
//
// Worktrees isolate files, not the machine: live scenario runs and capacity
// benchmarks share docker, PostgreSQL, systemd units, ports, and CPU. Two
// concurrent benchmark runs do not merely flake — they load the box under
// each other's measurement windows and corrupt capacity evidence that the
// Solver then seals as durable (parallel-session-architecture epic, item 4).
// This lock serializes evidence-bearing runs across every worktree of one
// repository: it lives in the SHARED git common dir, which all worktrees
// resolve to the same path, and acquisition is an atomic mkdir so two
// processes can never both win.
//
// Liveness: solver commands are short-lived processes, so a lock is owned by
// a (pid, worktree) pair and is stale when the pid is dead OR the worktree
// is gone. A stale lock is stolen with a printed note, never silently.
//
// CLI:
//   node scripts/solve/machine-lock.js status
//   node scripts/solve/machine-lock.js acquire --label <run-label>
//   node scripts/solve/machine-lock.js release
//   node scripts/solve/machine-lock.js with --label <run-label> -- <cmd...>
// `with` acquires (waiting), runs the command, always releases, and exits
// with the command's exit code. LAGRANGE_EVIDENCE_LOCK_BYPASS=1 skips
// acquisition (recorded in the run's own stdout by the warning it prints).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const LOCK_DIR_SEGMENTS = ['lagrange-sessions', 'evidence-lock'];
const OWNER_FILE_BASENAME = 'owner.json';
const TEXT_ENCODING = 'utf8';
const GIT_BINARY = 'git';
const GIT_COMMON_DIR_ARGUMENTS = Object.freeze(
  ['rev-parse', '--git-common-dir']);
const GIT_TOPLEVEL_ARGUMENTS = Object.freeze(
  ['rev-parse', '--show-toplevel']);
const DEFAULT_WAIT_POLL_MS = 2000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const BYPASS_ENVIRONMENT_FLAG = 'LAGRANGE_EVIDENCE_LOCK_BYPASS';
const COMMAND_SEPARATOR = '--';
const LABEL_FLAG = '--label';
const DEFAULT_LABEL = 'unlabeled-evidence-run';
const EXIT_USAGE = 2;
const ERRNO_EEXIST = 'EEXIST';
const ERRNO_EPERM = 'EPERM';
const STEAL_GUARD_SUFFIX = '.steal-guard';
// A steal is milliseconds of work; a guard older than this belongs to a
// crashed stealer and may itself be removed.
const STEAL_GUARD_STALE_MS = 10 * 1000;
const VERB_STATUS = 'status';
const VERB_ACQUIRE = 'acquire';
const VERB_RELEASE = 'release';
const VERB_WITH = 'with';
const INT32_BYTE_LENGTH = 4;
const SIGNAL_INT = 'SIGINT';
const SIGNAL_TERM = 'SIGTERM';
const EVENT_CLOSE = 'close';
const EVENT_ERROR = 'error';
const STEAL_NOTICE_PREFIX =
  'machine-lock: stealing stale evidence lock held by pid ';
const BYPASS_WARNING_SUFFIX =
  ' set — running WITHOUT the evidence lock; concurrent runs may corrupt ' +
  'measurements\n';
const USAGE_TEXT =
  'usage: machine-lock.js status | acquire [--label <l>] | release | ' +
  'with [--label <l>] -- <command...>\n';

function gitOutput(cwd, args) {
  return execFileSync(GIT_BINARY, [...args], {cwd, encoding: TEXT_ENCODING})
    .trim();
}

export function evidenceLockDir(root) {
  const commonDir = path.resolve(root, gitOutput(root, GIT_COMMON_DIR_ARGUMENTS));
  return path.join(commonDir, ...LOCK_DIR_SEGMENTS);
}

function ownerFilePath(root) {
  return path.join(evidenceLockDir(root), OWNER_FILE_BASENAME);
}

function readOwner(root) {
  try {
    return JSON.parse(fs.readFileSync(ownerFilePath(root), TEXT_ENCODING));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === ERRNO_EPERM;
  }
}

// A lock owner is stale when every recorded pid is dead (the wrapper also
// records its child, so killing only the wrapper does not orphan a running
// benchmark into a stealable lock) or its worktree no longer exists (tmp
// worktrees vanish on reboot). An unreadable owner file under an existing
// lock dir is treated as LIVE, not stale: the window between mkdir and the
// owner write must not invite a steal.
export function ownerIsStale(owner) {
  if (!owner) return false;
  if (pidAlive(owner.pid) || pidAlive(owner.childPid)) {
    if (typeof owner.worktree === 'string' && owner.worktree &&
        !fs.existsSync(owner.worktree)) {
      return true;
    }
    return false;
  }
  return true;
}

export function evidenceLockStatus(root) {
  const dir = evidenceLockDir(root);
  if (!fs.existsSync(dir)) return {held: false, owner: null, stale: false};
  const owner = readOwner(root);
  return {held: true, owner, stale: ownerIsStale(owner)};
}

function removeStealGuardIfStale(guardPath) {
  try {
    const age = Date.now() - fs.statSync(guardPath).mtimeMs;
    if (age > STEAL_GUARD_STALE_MS) {
      fs.rmSync(guardPath, {recursive: true, force: true});
    }
  } catch {
    // Guard vanished on its own; nothing to do.
  }
}

// Serialize the steal itself: the naive check-then-remove steal is a proven
// mutex break (measured 2026-07-29: 7-13 simultaneous "owners" out of 16
// contenders, every round — each stealer's blind remove deleted the fresh
// lock the previous winner had just created). Exactly one contender may
// hold the steal guard; it RE-CHECKS staleness inside the guard, so a lock
// legitimately re-acquired since the caller's check is left alone, and
// every other contender that saw "stale" simply loses this round and
// contends again on the normal mkdir path.
function tryStealStaleLock(root, dir) {
  const guardPath = `${dir}${STEAL_GUARD_SUFFIX}`;
  try {
    fs.mkdirSync(guardPath);
  } catch (error) {
    if (error && error.code !== ERRNO_EEXIST) throw error;
    removeStealGuardIfStale(guardPath);
    return;
  }
  try {
    const current = evidenceLockStatus(root);
    if (current.held && current.stale) {
      process.stderr.write(STEAL_NOTICE_PREFIX +
        `${current.owner?.pid} (${current.owner?.label || DEFAULT_LABEL})\n`);
      try {
        fs.rmSync(dir, {recursive: true, force: true});
      } catch {
        // A contender re-created the dir mid-removal; it is live again.
      }
    }
  } finally {
    fs.rmSync(guardPath, {recursive: true, force: true});
  }
}

// Attempt one atomic acquisition. Returns {acquired, owner} where `owner`
// is the CURRENT holder when acquisition fails.
export function tryAcquireEvidenceLock(root, {label = DEFAULT_LABEL} = {}) {
  const dir = evidenceLockDir(root);
  fs.mkdirSync(path.dirname(dir), {recursive: true});
  const status = evidenceLockStatus(root);
  if (status.held && status.stale) {
    tryStealStaleLock(root, dir);
  }
  try {
    fs.mkdirSync(dir);
  } catch (error) {
    if (error && error.code === ERRNO_EEXIST) {
      return {acquired: false, owner: readOwner(root)};
    }
    throw error;
  }
  const owner = {
    pid: process.pid,
    worktree: gitOutput(root, GIT_TOPLEVEL_ARGUMENTS),
    label,
    acquiredAt: new Date().toISOString(),
  };
  fs.writeFileSync(ownerFilePath(root), `${JSON.stringify(owner)}\n`);
  return {acquired: true, owner};
}

// Release refuses to remove a lock this process does not own unless forced
// (a finishing wrapper whose own lock was stolen must never clobber the
// third party now holding it — measured 2026-07-29). `force` is for the
// operator CLI verb and the steal path, where removing a FOREIGN stale
// lock is the entire point.
export function releaseEvidenceLock(root, {force = true} = {}) {
  if (!force) {
    const owner = readOwner(root);
    if (owner && owner.pid !== process.pid) return false;
  }
  fs.rmSync(evidenceLockDir(root), {recursive: true, force: true});
  return true;
}

// Record the wrapped child so a SIGKILLed wrapper does not turn a running
// benchmark into a stealable "stale" lock (ownerIsStale checks both pids).
function recordWrappedChildPid(root, childPid) {
  const owner = readOwner(root);
  if (!owner || owner.pid !== process.pid) return;
  fs.writeFileSync(ownerFilePath(root),
    `${JSON.stringify({...owner, childPid})}\n`);
}

function sleepMs(ms) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(INT32_BYTE_LENGTH)), 0, 0, ms);
}

// Acquire, waiting for the current holder. Poll rather than watch: holders
// are short-lived sibling processes and the poll cost is negligible next to
// the benchmark runtimes this lock exists to serialize.
export function acquireEvidenceLock(root, {
  label = DEFAULT_LABEL,
  pollMs = DEFAULT_WAIT_POLL_MS,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const attempt = tryAcquireEvidenceLock(root, {label});
    if (attempt.acquired) return attempt;
    if (Date.now() >= deadline) {
      throw new Error(
        `machine-lock: timed out after ${timeoutMs}ms waiting for the ` +
        `evidence lock held by pid ${attempt.owner?.pid} ` +
        `(${attempt.owner?.label || DEFAULT_LABEL})`);
    }
    sleepMs(pollMs);
  }
}

function parseCliArguments(argv) {
  const separatorIndex = argv.indexOf(COMMAND_SEPARATOR);
  const own = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const command = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  const labelIndex = own.indexOf(LABEL_FLAG);
  const label = labelIndex !== -1 && own[labelIndex + 1] ?
    own[labelIndex + 1] : DEFAULT_LABEL;
  return {verb: own[0], label, command};
}

async function main() {
  const root = process.cwd();
  const {verb, label, command} = parseCliArguments(process.argv.slice(2));
  if (verb === VERB_STATUS) {
    process.stdout.write(`${JSON.stringify(evidenceLockStatus(root))}\n`);
    return;
  }
  if (verb === VERB_ACQUIRE) {
    const attempt = tryAcquireEvidenceLock(root, {label});
    if (!attempt.acquired) {
      process.stderr.write(
        `machine-lock: evidence lock is held by pid ${attempt.owner?.pid} ` +
        `(${attempt.owner?.label || DEFAULT_LABEL})\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify(attempt.owner)}\n`);
    return;
  }
  if (verb === VERB_RELEASE) {
    releaseEvidenceLock(root);
    return;
  }
  if (verb === VERB_WITH && command.length > 0) {
    process.exitCode = await runWrappedCommand(root, label, command);
    return;
  }
  process.stderr.write(USAGE_TEXT);
  process.exitCode = EXIT_USAGE;
}

// Async on purpose: spawnSync blocks the event loop, so a SIGTERM to the
// wrapper would kill it WITHOUT the handlers running — leaving the child
// benchmark loading the box while the lock reads stale (dead wrapper pid)
// and the next acquirer steals it mid-measurement (measured 2026-07-29).
// Signals are forwarded to the child; the wrapper outlives it and releases
// only a lock it still owns.
async function runWrappedCommand(root, label, command) {
  const bypassed = Boolean(process.env[BYPASS_ENVIRONMENT_FLAG]);
  if (bypassed) {
    process.stderr.write(
      `machine-lock: ${BYPASS_ENVIRONMENT_FLAG}${BYPASS_WARNING_SUFFIX}`);
  } else {
    acquireEvidenceLock(root, {label});
  }
  const child = spawn(command[0], command.slice(1),
    {cwd: root, stdio: 'inherit'});
  if (!bypassed && child.pid) recordWrappedChildPid(root, child.pid);
  const forward = (signal) => {
    try {
      child.kill(signal);
    } catch {
      // The child is already gone; the close handler settles the exit.
    }
  };
  process.on(SIGNAL_INT, () => forward(SIGNAL_INT));
  process.on(SIGNAL_TERM, () => forward(SIGNAL_TERM));
  const exitCode = await new Promise((resolve) => {
    child.on(EVENT_CLOSE, (code) => resolve(code === null ? 1 : code));
    child.on(EVENT_ERROR, () => resolve(1));
  });
  if (!bypassed) releaseEvidenceLock(root, {force: false});
  return exitCode;
}

const IS_MAIN = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();
