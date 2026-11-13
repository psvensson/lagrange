// Acquire, observe and close one assigned placement execution and its original inputs.
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {LAB_LOCK_LINE, LAB_LOCK_PATHS, LAB_LOCK_RECORD, LAB_LOCK_TAKE, MS_PER_SECOND}
  from './machine-lock-constants.js';
import {labLockArgs} from './machine-hold.js';
import {
  PLACEMENT_CREATE_FLAG, PLACEMENT_ENV, PLACEMENT_EXIT,
  PLACEMENT_FORWARDED_ENV, PLACEMENT_LOCAL, PLACEMENT_MACHINE_FACTOR_ENV,
  PLACEMENT_NEWLINE, PLACEMENT_RESULTS_PREFIX, PLACEMENT_RUN_SHA_CHARACTERS,
  PLACEMENT_STDIO_PIPE, PLACEMENT_STREAM, PLACEMENT_TEXT,
} from './placement-constants.js';
import {placementShell} from './placement-shell.js';
import {bundleFor, safeName} from './placement-source.js';
import {PLACEMENT_CHILD_EVENT, PLACEMENT_LINE, TEXT_UTF8, closeOf, exitOf, killGroup, streamLines}
  from './process.js';
import {PLACEMENT_SHELL, PLACEMENT_SHELL_COMMAND, commandLine, remoteCommand, shellQuote}
  from './remote-command.js';

const EMPTY = '';

const PLACEMENT_SHELL_LINE = /^placement-shell=(\d+)$/mu;
// A stopped shard's shell gets this long to clean up before its connection
// is cut.
const PLACEMENT_STOP_GRACE_MS = 10 * MS_PER_SECOND;
// A bundle upload that has not finished by this is a stalled machine.
const PLACEMENT_UPLOAD_DEADLINE_SECONDS = 300;
// How long an aborted shard's lab shell is given to clean up before it is cut.
const PLACEMENT_ABORT_GRACE_MS = 5000;
const PLACEMENT_ABORT_POLL_MS = 100;
// Waits, in a shell, for every pid after $1 to end - a zombie has ended - for
// at most $1 polls: the caller is a signal handler with no event loop left to
// wait in.
const PLACEMENT_WAIT_SCRIPT =
  'n=$1; shift; i=0; while [ "$i" -lt "$n" ]; do alive=; for p in "$@"; do ' +
  's=$(ps -o stat= -p "$p" 2>/dev/null); case "$s" in ""|Z*) ;; *) alive=1;; esac; ' +
  'done; [ -z "$alive" ] && exit 0; sleep 0.1; i=$((i+1)); done';
const PLACEMENT_RUNNER = 'scripts/run-classified-test-files.js';
const PLACEMENT_RUNNER_STDIN = '--stdin';
const PLACEMENT_STDIO_INHERIT = 'inherit';
const PLACEMENT_WRAPPER_HEAD = Object.freeze([
  'set -u',
  'status=0',
  'if command -v timeout >/dev/null 2>&1; then ' +
    // --foreground keeps timeout, and so the upload, in the wrapper's group.
    `bound="timeout --foreground ${PLACEMENT_UPLOAD_DEADLINE_SECONDS}"; ` +
    'else echo "placement: bounded timeout command unavailable" >&2; ' +
    `exit ${PLACEMENT_EXIT.SETUP}; fi`,
]);
const PLACEMENT_WRAPPER_UPLOAD_FAILED = 'echo "placement: the bundle upload failed" >&2;';
const PLACEMENT_WRAPPER_EXIT = 'exit "$status";';
const PLACEMENT_PARENT = 'test-output/placement-worktrees';
const PLACEMENT_LOG_PARENT = 'test-output/placement';
// How often a streamed shard's relay files are read for new lines.
const PLACEMENT_TAIL_POLL_MS = 250;
const PLACEMENT_READ_FLAG = 'r';
const PLACEMENT_EXISTING_PATH = 'EEXIST';
const PLACEMENT_DIAGNOSTIC_SEPARATOR = '; ';
// The controller child's file list, named for this process and a count.
const PLACEMENT_CHILD_LIST_PREFIX = 'controller-';
const PLACEMENT_CHILD_LIST_SUFFIX = '.files';
let childListCount = 0;
const PLACEMENT_STDIO_IGNORE = 'ignore';
const PLACEMENT_RUN_RADIX = 36;
const PLACEMENT_UPLOAD_SCRIPT = [
  `mkdir -p "\${1%/*}" || exit ${PLACEMENT_EXIT.SETUP}`,
  'if [ -e "$1" ] || [ -L "$1" ]; then',
  '  echo "placement: unavailable - attempt already exists: $1" >&2',
  `  exit ${PLACEMENT_EXIT.SETUP}`,
  'fi',
  // GNU dd must create the output itself with O_EXCL. The preceding check
  // names ordinary collisions; exclusive creation also closes the race and
  // refuses special files before reading any upload bytes.
  'dd conv=excl status=none of="$1" || {',
  '  echo "placement: bundle upload unavailable: $1" >&2',
  `  exit ${PLACEMENT_EXIT.SETUP}`,
  '}',
].join(PLACEMENT_NEWLINE);
const PLACEMENT_KILL_SCRIPT = 'kill -s TERM -- "$1"';
export function placementKillScript() {
  return PLACEMENT_KILL_SCRIPT;
}

// Only an observed integer terminal status is an execution outcome.
function placementExitStatus(status) {
  return Number.isInteger(status) ? status : PLACEMENT_EXIT.SETUP;
}
// The controller's timeout policy, and its resolved check base
// (a commit, or none), handed to a lab machine.
function forwardedPolicy(env, checkBase) {
  return {
    tapTimeout: env[PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT] || EMPTY,
    checkBase: checkBase || EMPTY,
  };
}

// The forwarded policy as the lab shell's positional arguments, none omitted.
function forwardedArgs({tapTimeout, checkBase}) {
  return [tapTimeout || EMPTY, checkBase || EMPTY];
}

// The remote shell has one serialization owner. It receives the same lock,
// exit and execution policy as its controller callers, and retains every
// failed or uncertain attempt until its evidence obligation is discharged.
export function placementScript(files) {
  return placementShell(files, {
    exit: PLACEMENT_EXIT,
    locks: {paths: LAB_LOCK_PATHS, take: LAB_LOCK_TAKE, record: LAB_LOCK_RECORD,
      busyLine: LAB_LOCK_LINE.BUSY},
    parent: PLACEMENT_PARENT,
    resultsPrefix: PLACEMENT_RESULTS_PREFIX,
    machineFactorEnv: PLACEMENT_MACHINE_FACTOR_ENV,
    placementEnv: PLACEMENT_ENV,
    localMode: PLACEMENT_LOCAL,
    tapTimeoutEnv: PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT,
  });
}
// The local half of one shard, as one shell: upload the bundle (bounded, so a
// machine that accepts the connection and then stalls cannot hold anything),
// then run the lab-side script. Its own process group, its output in files:
// nothing about it needs this process's event loop.
function shardWrapper({upload, bundleFile, run, scriptFile}) {
  const script = shellQuote(scriptFile);
  const lines = [...PLACEMENT_WRAPPER_HEAD];
  if (upload) {
    const bundle = shellQuote(bundleFile);
    lines.push(`$bound ${upload} < ${bundle} || status=${PLACEMENT_EXIT.SETUP}`,
      `if [ "$status" != 0 ]; then ${PLACEMENT_WRAPPER_UPLOAD_FAILED} ` +
        `${PLACEMENT_WRAPPER_EXIT} fi`);
  }
  lines.push(`${run} < ${script} || status=$?`, PLACEMENT_WRAPPER_EXIT);
  return lines.join(PLACEMENT_NEWLINE);
}

// Signal the shell PID actually published by this attempt. The shell owns
// its acquired groups; its PID is not guessed to be a process group.
function signalLabShell(machine, logFile, env) {
  const shell = PLACEMENT_SHELL_LINE.exec(fs.readFileSync(logFile, TEXT_UTF8))?.[1];
  if (shell) {
    if (!Number.isInteger(Number(shell)) || Number(shell) <= 1) {
      throw new Error(`${PLACEMENT_TEXT.UNAVAILABLE}unacquired shell identity ${shell}`);
    }
    const [command, args] = remoteCommand(machine, PLACEMENT_KILL_SCRIPT, [shell]);
    const signalled = spawnSync(command, args, {env, encoding: TEXT_UTF8,
      stdio: [PLACEMENT_STDIO_IGNORE, PLACEMENT_STDIO_IGNORE, PLACEMENT_STDIO_PIPE],
      timeout: PLACEMENT_STOP_GRACE_MS});
    if (signalled.error) throw signalled.error;
    if (signalled.status !== 0) {
      throw new Error(`${PLACEMENT_TEXT.UNAVAILABLE}shell ${shell} signal failed: ` +
        `exit=${signalled.status} signal=${signalled.signal} ${signalled.stderr}`);
    }
  }
  return shell;
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

// The relay's lines as they land: the ssh session writes the lab machine's
// output into these files live, so following them is streaming without a
// second connection. Returns the finish, which delivers the rest and stops.
function tailLines(file, stream, onLine, recordFailure) {
  const decoder = new StringDecoder(TEXT_UTF8);
  let offset = 0;
  let partial = EMPTY;
  const emit = (text) => {
    const lines = `${partial}${text}`.split(PLACEMENT_LINE);
    partial = lines.pop();
    for (const line of lines) onLine(line, stream);
  };
  const drain = () => {
    const size = fs.statSync(file).size;
    if (size <= offset) return;
    const buffer = Buffer.alloc(size - offset);
    const fd = fs.openSync(file, PLACEMENT_READ_FLAG);
    let read = 0;
    try {
      read = fs.readSync(fd, buffer, 0, buffer.length, offset);
    } finally {
      fs.closeSync(fd);
    }
    offset += read;
    emit(decoder.write(buffer.subarray(0, read)));
  };
  const failure = {observed: false};
  const timer = setInterval(() => {
    try {
      drain();
    } catch (error) {
      Object.assign(failure, {observed: true, error});
      recordFailure(error);
      clearInterval(timer);
    }
  }, PLACEMENT_TAIL_POLL_MS);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    if (failure.observed) throw failure.error;
    drain();
    emit(decoder.end());
    if (partial) onLine(partial, stream);
    partial = EMPTY;
  };
}

// Acquire both output descriptors before the wrapper. A partial acquisition
// closes every descriptor; an error after spawn belongs to the returned child
// and is reported by its settled execution, after that child is stopped.
function spawnShardWrapper(wrapper, {env, logFile, errorFile}) {
  const descriptors = [];
  let child = null;
  const failure = {observed: false};
  try {
    descriptors.push(fs.openSync(logFile, PLACEMENT_CREATE_FLAG));
    descriptors.push(fs.openSync(errorFile, PLACEMENT_CREATE_FLAG));
    child = spawn(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, wrapper],
      {env, stdio: [PLACEMENT_STDIO_IGNORE, ...descriptors], detached: true});
  } catch (error) {
    Object.assign(failure, {observed: true, error});
  } finally {
    for (const descriptor of descriptors) {
      try {
        fs.closeSync(descriptor);
      } catch (error) {
        if (!failure.observed) Object.assign(failure, {observed: true, error});
        else process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${error.message}\n`);
      }
    }
  }
  if (failure.observed && !child) throw failure.error;
  return {child, failure};
}

// Finish every relay even if an earlier one failed, then retain the original
// output. The first IO failure stays primary; it never becomes a green shard.
function finishShardOutput({tails, logFile, errorFile}) {
  const errors = [];
  let log;
  let stderr;
  for (const finish of [
    ...tails,
    () => {
      log = fs.readFileSync(logFile, TEXT_UTF8);
    },
    () => {
      stderr = fs.readFileSync(errorFile, TEXT_UTF8);
    },
  ]) {
    try {
      finish();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    for (const error of errors.slice(1)) {
      process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${error.message}\n`);
    }
    throw errors[0];
  }
  return {log, errors: stderr};
}

function refusedShard(reason) {
  return {done: Promise.resolve({status: PLACEMENT_EXIT.SETUP, log: EMPTY,
    errors: EMPTY, reason}), stop: () => {}, interrupt: () => null, abort: () => {}};
}

function releaseShardInputs(inputs) {
  const errors = [];
  for (const input of inputs) {
    try {
      fs.rmSync(input);
    } catch (error) {
      errors.push(error);
      process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}input cleanup at ${input}: ` +
        `${error.message}\n`);
    }
  }
  return errors;
}

// The exclusive script file claims this controller attempt before any other
// companion is created. Its descriptor remains owned even if writing fails.
function writeShardScript(descriptor, files) {
  const failure = {observed: false};
  try {
    fs.writeFileSync(descriptor, placementScript(files));
  } catch (error) {
    Object.assign(failure, {observed: true, error});
  }
  try {
    fs.closeSync(descriptor);
  } catch (error) {
    if (!failure.observed) Object.assign(failure, {observed: true, error});
    else process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}input cleanup: ${error.message}\n`);
  }
  if (failure.observed) throw failure.error;
}

/**
 * Start one shard on its machine. Returns at once: the upload and the run
 * go on in a process group of their own, reading from and writing to files,
 * so the controller's own blocking lanes cannot stall them. `done` settles
 * with the exit status, the stdout log (the runner's verdict lines) and the
 * stderr log, or a reason when the shard never ran or its deadline stopped
 * it; `stop` stops it now.
 * @param {{machine: Object, files: string[]}} shard
 * `onLine(line, stream)`, when given, receives each line of the relay as it
 * arrives - stdout as `out`, stderr as `err` - not only at settle; `results`
 * names a ledger the runner leaves in the worktree, relayed back as prefixed
 * lines; `gitRoot` is the checkout whose HEAD is the commit (default root).
 * `holder` is what the shard tells other agents under the lab convention: its
 * purpose, and the time it expects to hold the machine, which is also the
 * longest it waits for the machine lock (capped by the lab).
 * @param {{sha: string, deadlineMs: number, root: string,
 *   holder: {purpose: string, expectedMs: number},
 *   runId?: string, env?: Object,
 *   forward?: {tapTimeout?: string, checkBase?: string},
 *   onLine?: Function, results?: string, gitRoot?: string}} options
 * @return {{done: Promise<Object>, stop: Function}}
 */
export function startRemoteShard(shard, {sha, deadlineMs, root, holder,
  env = gitProcessEnvironment(), forward = {}, onLine = null, results = EMPTY, gitRoot = root,
  runId = `${sha.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${process.pid}`}) {
  const {machine} = shard;
  const logDir = path.join(root, PLACEMENT_LOG_PARENT);
  fs.mkdirSync(logDir, {recursive: true});
  const local = path.join(logDir, `${runId}-${safeName(machine.name)}`);
  const logFile = `${local}.log`;
  const errorFile = `${local}.err`;
  const scriptFile = `${local}.sh`;
  const existing = [logFile, errorFile, scriptFile, `${local}.bundle`]
    .find((file) => fs.lstatSync(file, {throwIfNoEntry: false}));
  if (existing) return refusedShard(`${PLACEMENT_TEXT.ATTEMPT_EXISTS}${existing}`);
  const ownedInputs = new Set();
  let bundleFile;
  try {
    const script = fs.openSync(scriptFile, PLACEMENT_CREATE_FLAG);
    ownedInputs.add(scriptFile);
    writeShardScript(script, shard.files);
  } catch (error) {
    releaseShardInputs(ownedInputs);
    if (error.code === PLACEMENT_EXISTING_PATH) {
      return refusedShard(`${PLACEMENT_TEXT.ATTEMPT_EXISTS}${error.path}`);
    }
    throw error;
  }
  try {
    bundleFile = bundleFor(machine, {root: gitRoot, sha, local, ownedInputs});
  } catch (error) {
    releaseShardInputs(ownedInputs);
    return refusedShard(error.code === PLACEMENT_EXISTING_PATH ?
      `${PLACEMENT_TEXT.ATTEMPT_EXISTS}${error.path}` : error.message);
  }
  const remoteBundle = bundleFile ?
    `${machine.repoPath}/${PLACEMENT_PARENT}/${runId}.bundle` : EMPTY;
  let acquisition;
  try {
    const wrapper = shardWrapper({
      upload: bundleFile ?
        commandLine(remoteCommand(machine, PLACEMENT_UPLOAD_SCRIPT, [remoteBundle])) : null,
      bundleFile,
      run: commandLine(remoteCommand(machine, null, [machine.repoPath, sha,
        machine.nodeMajor || EMPTY, String(machine.factor || 1), runId, remoteBundle,
        ...forwardedArgs(forward), results,
        ...labLockArgs({waitMs: holder.expectedMs, purpose: holder.purpose,
          expectedMs: holder.expectedMs, sha, env})], {fromStdin: true})),
      scriptFile,
    });
    acquisition = spawnShardWrapper(wrapper, {env, logFile, errorFile});
  } catch (error) {
    releaseShardInputs(ownedInputs);
    if (error.code === PLACEMENT_EXISTING_PATH) {
      return refusedShard(`${PLACEMENT_TEXT.ATTEMPT_EXISTS}${error.path}`);
    }
    throw error;
  }
  const {child, failure: acquisitionFailure} = acquisition;
  const exited = exitOf(child);
  const failure = {...acquisitionFailure};
  let stopped = null;
  let interrupted = false;
  let cutRequested = false;
  let refuseUnconfirmed;
  let deadline;
  const recordFailure = (error) => {
    if (!failure.observed) Object.assign(failure, {observed: true, error});
    else if (failure.error !== error) {
      process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${error.message}\n`);
    }
  };
  const tails = onLine ? [tailLines(logFile, PLACEMENT_STREAM.OUT, onLine, recordFailure),
    tailLines(errorFile, PLACEMENT_STREAM.ERR, onLine, recordFailure)] : [];
  const cut = () => {
    if (cutRequested) return;
    cutRequested = true;
    try {
      killGroup(child);
    } catch (error) {
      recordFailure(error);
      clearTimeout(deadline);
      for (const finish of tails) {
        try {
          finish();
        } catch (cleanupError) {
          recordFailure(cleanupError);
        }
      }
      process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}wrapper group ${child.pid} ` +
        `closure unconfirmed; original inputs and logs retained at ${local}\n`);
      child.unref();
      refuseUnconfirmed(failure.error);
      throw error;
    }
  };
  // The shell gets one signal and one shared grace. A repeated stop never
  // starts another timer or guesses another resource identity.
  const interrupt = () => {
    if (hasExited(child)) return null;
    if (!stopped) stopped = PLACEMENT_TEXT.INTERRUPTED;
    if (interrupted) return {pid: null, cut};
    interrupted = true;
    try {
      return {pid: signalLabShell(machine, logFile, env) ? child.pid : null, cut};
    } catch (error) {
      recordFailure(error);
      try {
        cut();
      } catch (cleanupError) {
        recordFailure(cleanupError);
      }
      throw error;
    }
  };
  const stop = (reason) => {
    if (stopped || hasExited(child)) return;
    stopped = reason;
    try {
      abortTogether([{interrupt}]);
    } catch (error) {
      recordFailure(error);
    }
  };
  // A deadline that expired while this process was blocked is looked at
  // again after its pending events: a shard that finished meanwhile is not
  // stopped, and its gone shell's pid is never signalled (verifier round 1).
  deadline = setTimeout(() => setImmediate(() => stop(PLACEMENT_TEXT.DEADLINE)),
    deadlineMs);
  const finished = exited.then((status) => {
    clearTimeout(deadline);
    // Output must be read successfully before a clean attempt can discard
    // its acquired inputs. Adverse or uncertain attempts retain them.
    let output;
    try {
      output = finishShardOutput({tails, logFile, errorFile});
    } catch (error) {
      // A readout error is secondary to an already observed adverse exit.
      // Preserve its real status and cause without inventing missing output.
      const primary = !failure.observed && Number.isInteger(status) && status !== 0 ?
        Object.assign(new Error(`placement wrapper exited ${status}; ` +
          `output finalization unavailable: ${error.message}`, {cause: error}),
        {exitCode: status, outputComplete: false, logFile, errorFile}) : error;
      recordFailure(primary);
    }
    if (failure.observed) throw failure.error;
    if (!stopped && status === 0) {
      const cleanupErrors = releaseShardInputs(ownedInputs);
      if (cleanupErrors.length > 0) throw cleanupErrors[0];
    }
    // An observed adverse wrapper status is retained. A stop followed by
    // wrapper0 is still unavailable; a signalled/unobserved exit stays null.
    const outcome = {status: stopped && status === 0 ? PLACEMENT_EXIT.SETUP : status, ...output};
    return stopped ? {...outcome, reason: stopped} : outcome;
  });
  const done = new Promise((resolve, reject) => {
    refuseUnconfirmed = reject;
    finished.then(resolve, reject);
  });
  if (acquisitionFailure.observed) stop(PLACEMENT_TEXT.INTERRUPTED);
  return {done, stop: () => stop(PLACEMENT_TEXT.INTERRUPTED), interrupt,
    abort: () => abortTogether([{interrupt}])};
}

// Every lab shell is asked to stop first, then all of them share one bounded
// grace for their traps - which stop the owned scope and retain its evidence;
// a wrapper cut at once killed a local-mode shell before its trap
// ran (verifier, test-placement round 3) - then whatever is left is cut. Any
// number of shards costs one grace, not one each.
function abortTogether(runs) {
  const pending = [];
  const errors = [];
  for (const run of runs) {
    try {
      const one = run.interrupt ? run.interrupt() : run.abort?.();
      if (one?.cut) pending.push(one);
    } catch (error) {
      errors.push(error);
    }
  }
  const waiting = pending.map((one) => one.pid).filter(Boolean).map(String);
  if (waiting.length > 0) {
    try {
      spawnSync(PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, PLACEMENT_WAIT_SCRIPT,
        PLACEMENT_SHELL, String(PLACEMENT_ABORT_GRACE_MS / PLACEMENT_ABORT_POLL_MS), ...waiting],
      {stdio: PLACEMENT_STDIO_IGNORE, timeout: 2 * PLACEMENT_ABORT_GRACE_MS});
    } catch (error) {
      errors.push(error);
    }
  }
  for (const one of pending) {
    try {
      one.cut();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors,
      'placement cleanup incomplete: ' +
      `${errors.map((error) => error.message).join(PLACEMENT_DIAGNOSTIC_SEPARATOR)}`);
  }
}
// The controller's own files while lab shards run: the classified runner's
// entry point as a child in a group of its own, told never to place again.
// `abort` ends the whole group. With `onLine` its output is not inherited but
// handed over line by line, as a lab shard's relay is, and it is done only
// once that output has been read to the end.
//
// Its file list is its stdin as a FILE, never a socket this process writes:
// the runner reads stdin synchronously, and a child that got there before
// this event loop had written found the non-blocking socket empty and died
// with EAGAIN - every child, when this process was busy for 300 ms after the
// spawn (found 2026-09-23). The file is unlinked once the child holds it.
function runClassifiedChild(root, files, env, {onLine = null, checkBase = EMPTY} = {}) {
  const output = onLine ? PLACEMENT_STDIO_PIPE : PLACEMENT_STDIO_INHERIT;
  const listDir = path.join(root, PLACEMENT_LOG_PARENT);
  fs.mkdirSync(listDir, {recursive: true});
  const list = path.join(listDir, `${PLACEMENT_CHILD_LIST_PREFIX}${process.pid}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${childListCount += 1}` +
    `${PLACEMENT_CHILD_LIST_SUFFIX}`);
  let input = null;
  let child = null;
  const failure = {observed: false};
  try {
    fs.writeFileSync(list, files.join(PLACEMENT_NEWLINE) + PLACEMENT_NEWLINE);
    input = fs.openSync(list, PLACEMENT_READ_FLAG);
    child = spawn(process.execPath, [PLACEMENT_RUNNER, PLACEMENT_RUNNER_STDIN], {
      cwd: root,
      env: {...env, [PLACEMENT_ENV]: PLACEMENT_LOCAL,
        ...(checkBase ? {[PLACEMENT_FORWARDED_ENV.CHECK_BASE]: checkBase} : {})},
      stdio: [input, output, output],
      detached: true,
    });
  } catch (error) {
    Object.assign(failure, {observed: true, error});
  }
  for (const close of [() => input !== null && fs.closeSync(input),
    () => fs.rmSync(list, {force: true})]) {
    try {
      close();
    } catch (error) {
      if (!failure.observed) Object.assign(failure, {observed: true, error});
      else process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${error.message}\n`);
    }
  }
  if (!child) throw failure.error;
  const closed = closeOf(child);
  let closedObserved = false;
  const firstExit = {observed: false};
  child.once(PLACEMENT_CHILD_EVENT.EXIT, (status) => {
    if (status !== 0) {
      Object.assign(firstExit,
        {observed: true, status: placementExitStatus(status)});
    }
  });
  if (onLine) {
    streamLines(child.stdout, PLACEMENT_STREAM.OUT, onLine);
    streamLines(child.stderr, PLACEMENT_STREAM.ERR, onLine);
  }
  let refuseUnconfirmed;
  const done = new Promise((resolve, reject) => {
    refuseUnconfirmed = reject;
    closed.then((status) => {
      closedObserved = true;
      if (failure.observed) reject(failure.error);
      else resolve(placementExitStatus(status));
    });
  });
  const abort = () => {
    // The streaming caller owns pipes: a direct exit can leave a descendant
    // holding them. Only observed close ends this cancellation ownership.
    if (closedObserved) return;
    try {
      killGroup(child);
    } catch (error) {
      if (!failure.observed) {
        Object.assign(failure, {observed: true, error});
        if (firstExit.observed) failure.error.exitCode = firstExit.status;
      }
      process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}controller group ${child.pid} ` +
        `closure unconfirmed: ${error.message}\n`);
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      refuseUnconfirmed(failure.error);
      throw error;
    }
  };
  if (failure.observed) {
    try {
      abort();
    } catch (cleanupError) {
      process.stderr.write(`${PLACEMENT_TEXT.UNAVAILABLE}cleanup: ${cleanupError.message}\n`);
    }
  }
  return {
    done, abort,
    // Its process group, for a caller that must know exactly what it started.
    group: child.pid,
  };
}

export {abortTogether, forwardedPolicy, placementExitStatus, runClassifiedChild};
