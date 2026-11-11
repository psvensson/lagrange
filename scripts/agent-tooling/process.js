// Actual child execution only. stdout remains owned by MCP during service launch.
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ownedPath} from './paths.js';

const TERMINATION_GRACE_MS = 5000;
const COMMAND_TIMEOUT_MS = 120000;
const OUTPUT_LIMIT = 8 * 1024 * 1024;
const STANDARD_STREAM_COUNT = 3;
const GROUP_POLL_MS = 50;
const SUPPORTED_PROCESS_PLATFORM = 'linux';
const PROCESS_TEXT_ENCODING = 'utf8';
const PROBE_ACTIVE_MARKER = '1';
const PROCESS_SIGNAL = Object.freeze({INTERRUPT: 'SIGINT', TERMINATE: 'SIGTERM', KILL: 'SIGKILL'});
const PROCESS_ERRNO = Object.freeze({NO_SUCH_PROCESS: 'ESRCH', NO_SUCH_FILE: 'ENOENT'});
const PROC_ROOT = '/proc';
const PROC_STAT_FILE = 'stat';
const PROC_STAT_NAME_END = ')';
const PROC_STAT_FIELD_SEPARATOR = ' ';
const NON_EXECUTING_PROC_STATES = Object.freeze(['Z', 'X']);
const CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit'});
const SERVICE_STDIO_MODE = 'inherit';
const SERVICE_LOCK_ROOT = '.codex/quest-tooling';
const SERVICE_LOCK_SUFFIX = '.lock';
const SERVICE_LOCK_OWNER_FILE = 'owner.json';
const PROCESS_FAILURE = Object.freeze({
  PROBE_ACTION_REFUSED: 'tooling_action_refused_under_probe',
  UNSUPPORTED_HOST: 'tooling_process_host_unsupported',
  INVALID_COMMAND_TIMEOUT: 'tooling_command_timeout_invalid',
  COMMAND_UNAVAILABLE: 'tooling_command_unavailable',
  COMMAND_OUTPUT_INVALID: 'tooling_command_output_invalid',
  COMMAND_OUTPUT_UNAVAILABLE: 'tooling_command_output_unavailable',
  COMMAND_CLEANUP_UNAVAILABLE: 'tooling_command_cleanup_unavailable',
  OWNED_GROUP_STILL_ALIVE: 'tooling_owned_group_still_alive',
});

function refuseProbe() {
  if (process.env.LAGRANGE_PROBE === PROBE_ACTIVE_MARKER) {
    throw new Error(PROCESS_FAILURE.PROBE_ACTION_REFUSED);
  }
}

function commandOutput(output) {
  if (output === null) return {stdout: null, stderr: null};
  if (!Array.isArray(output) || output.length < STANDARD_STREAM_COUNT ||
    Array.from(output).some((slot) => slot !== null && typeof slot !== 'string')) {
    throw new Error(PROCESS_FAILURE.COMMAND_OUTPUT_INVALID);
  }
  return {stdout: output[1], stderr: output[2]};
}

function run(root, command, args, options = {}) {
  refuseProbe();
  if (process.platform !== SUPPORTED_PROCESS_PLATFORM) {
    throw new Error(PROCESS_FAILURE.UNSUPPORTED_HOST);
  }
  const timeout = options.timeout ?? COMMAND_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error(PROCESS_FAILURE.INVALID_COMMAND_TIMEOUT);
  }
  const startedAt = new Date().toISOString();
  // The explicit invocation and text encoding must agree with the observation below.
  const result = spawnSync(command, args, {maxBuffer: OUTPUT_LIMIT, ...options,
    cwd: root, shell: false, argv0: command, encoding: PROCESS_TEXT_ENCODING,
    timeout, killSignal: PROCESS_SIGNAL.KILL, detached: true});
  // spawnSync only terminates its immediate child, including on timeout/overflow.
  // Completion also owns descendants left behind by a normally exiting launcher.
  let error = result.error ? result.error.message : null;
  try {
    finishCommandGroup(result.pid);
  } catch (cleanupError) {
    error = JSON.stringify({code: PROCESS_FAILURE.COMMAND_CLEANUP_UNAVAILABLE,
      groupId: result.pid,
      commandError: result.error ? {code: result.error.code, message: result.error.message} : null,
      cleanupError: {code: cleanupError.code, message: cleanupError.message}});
  }
  return {command: [command, ...args], cwd: root, startedAt,
    endedAt: new Date().toISOString(), exitCode: result.status,
    signal: result.signal, ...commandOutput(result.output), error};
}

function requireSuccess(observation) {
  if (observation.error !== null || observation.exitCode !== 0) {
    throw new Error(`${PROCESS_FAILURE.COMMAND_UNAVAILABLE}: ${JSON.stringify(observation)}`);
  }
  if (observation.stdout === null) {
    throw new Error(PROCESS_FAILURE.COMMAND_OUTPUT_UNAVAILABLE);
  }
  return observation.stdout.trim();
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error.code === PROCESS_ERRNO.NO_SUCH_PROCESS) return false;
    throw error;
  }
}

function hasLiveGroup(pid) {
  for (const name of fs.readdirSync(PROC_ROOT)) {
    if (!/^\d+$/u.test(name)) continue;
    let stat;
    try {
      stat = fs.readFileSync(`${PROC_ROOT}/${name}/${PROC_STAT_FILE}`, PROCESS_TEXT_ENCODING);
    } catch (error) {
      if (error.code === PROCESS_ERRNO.NO_SUCH_FILE ||
        error.code === PROCESS_ERRNO.NO_SUCH_PROCESS) continue;
      throw error;
    }
    const fields = stat.slice(stat.lastIndexOf(PROC_STAT_NAME_END) + 2)
      .split(PROC_STAT_FIELD_SEPARATOR);
    if (Number(fields[2]) === pid && !NON_EXECUTING_PROC_STATES.includes(fields[0])) return true;
  }
  return false;
}

function finishCommandGroup(pid) {
  if (!pid || !hasLiveGroup(pid)) return;
  signalGroup(pid, PROCESS_SIGNAL.KILL);
  const deadline = Date.now() + TERMINATION_GRACE_MS;
  const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  while (hasLiveGroup(pid) && Date.now() < deadline) {
    Atomics.wait(sleeper, 0, 0, GROUP_POLL_MS);
  }
  if (hasLiveGroup(pid)) throw new Error(`${PROCESS_FAILURE.OWNED_GROUP_STILL_ALIVE}: ${pid}`);
}

async function finishGroup(pid) {
  if (!hasLiveGroup(pid)) return;
  signalGroup(pid, PROCESS_SIGNAL.TERMINATE);
  const deadline = Date.now() + TERMINATION_GRACE_MS;
  while (hasLiveGroup(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS));
  }
  if (hasLiveGroup(pid)) signalGroup(pid, PROCESS_SIGNAL.KILL);
  const killDeadline = Date.now() + TERMINATION_GRACE_MS;
  while (hasLiveGroup(pid) && Date.now() < killDeadline) {
    await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS));
  }
  if (hasLiveGroup(pid)) throw new Error(`${PROCESS_FAILURE.OWNED_GROUP_STILL_ALIVE}: ${pid}`);
}

function service(root, name, command, args, env) {
  refuseProbe();
  if (process.platform !== SUPPORTED_PROCESS_PLATFORM) {
    throw new Error(PROCESS_FAILURE.UNSUPPORTED_HOST);
  }
  const lock = ownedPath(root, `${SERVICE_LOCK_ROOT}/${name}${SERVICE_LOCK_SUFFIX}`);
  fs.mkdirSync(lock); // A second live session refuses; no PID guessing or orphan killing.
  fs.writeFileSync(path.join(lock, SERVICE_LOCK_OWNER_FILE), JSON.stringify({pid: process.pid, name,
    startedAt: new Date().toISOString(), root}));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: root, env, stdio: SERVICE_STDIO_MODE, detached: true});
    let timer = null;
    const terminate = () => {
      if (!child.pid || timer !== null) return;
      signalGroup(child.pid, PROCESS_SIGNAL.TERMINATE);
      timer = setTimeout(() => {
        signalGroup(child.pid, PROCESS_SIGNAL.KILL);
      }, TERMINATION_GRACE_MS);
      timer.unref();
    };
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      process.removeListener(PROCESS_SIGNAL.INTERRUPT, terminate);
      process.removeListener(PROCESS_SIGNAL.TERMINATE, terminate);
      fs.rmSync(lock, {recursive: true});
    };
    process.on(PROCESS_SIGNAL.INTERRUPT, terminate);
    process.on(PROCESS_SIGNAL.TERMINATE, terminate);
    child.on(CHILD_EVENT.ERROR, (error) => {
      cleanup();
      reject(error);
    });
    child.on(CHILD_EVENT.EXIT, async (code, signal) => {
      try {
        await finishGroup(child.pid);
        cleanup();
        resolve({exitCode: code, signal});
      } catch (error) {
        // Retain ownership when termination could not be established.
        reject(error);
      }
    });
  });
}

export {hasLiveGroup, refuseProbe, requireSuccess, run, service};
