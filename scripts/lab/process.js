import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit', CLOSE: 'close', DATA: 'data'});
const STDIO_INHERIT = 'inherit';
const STDIO_PIPE = 'pipe';
const STDIO_WITH_INPUT = Object.freeze([STDIO_PIPE, STDIO_INHERIT, STDIO_INHERIT]);
const STDIO_CAPTURE = Object.freeze([STDIO_PIPE, STDIO_PIPE, STDIO_PIPE]);
const PLATFORM_WINDOWS = 'win32';
const WINDOWS_LOOKUP = 'where';
const POSIX_SHELL = 'sh';
const POSIX_SHELL_LOGIN_COMMAND = '-lc';
const LOOPBACK_HOST = '127.0.0.1';
const EPHEMERAL_PORT = 0;
const OBJECT_TYPE = 'object';
const PORT_RESERVATION_FAILED = 'Could not reserve a local port';
const DOCKER_PING_TIMEOUT_MS = 10000;
const DOCKER_PING_POLL_MS = 150;
const DOCKER_PING_OK = 'OK';
const DOCKER_PING_TIMEOUT_TEXT = 'timeout';
const EMPTY = '';
const KILL_SIGNAL = 'SIGKILL';
const TIMED_OUT_TEXT = 'timed out after';
const MISSING_PROCESS = 'ESRCH';
const UNACQUIRED_GROUP = 'cannot signal an unacquired process group';
const PLACEMENT_CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit', CLOSE: 'close',
  DATA: 'data', END: 'end'});
const PLACEMENT_LINE = /\r?\n/u;
const TEXT_UTF8 = 'utf8';

export function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hasInput = options.stdin !== undefined;
    const stdio = options.stdio || (hasInput ? [...STDIO_WITH_INPUT] : STDIO_INHERIT);
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio,
      shell: false,
    });
    child.on(CHILD_EVENT.ERROR, rejectPromise);
    child.on(CHILD_EVENT.EXIT, (code, signal) => {
      if (code === 0) return resolvePromise({code, signal});
      const suffix = signal ? ` signal=${signal}` : ` exit=${code}`;
      const error = new Error(`${command} failed:${suffix}`);
      // The exit status itself, for callers whose child has more than one
      // non-zero outcome (the distributed runner's REFUSED is not FAIL).
      error.exitCode = code;
      error.signal = signal;
      rejectPromise(error);
    });
    if (hasInput && child.stdin) child.stdin.end(options.stdin);
  });
}

export function capture(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const bounded = options.timeoutMs > 0;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: [...STDIO_CAPTURE],
      shell: false,
      // Its own process group, so the deadline reaches everything it started.
      detached: bounded,
    });
    let stdout = EMPTY;
    let stderr = EMPTY;
    const failure = {observed: false};
    const exitFailure = {observed: false};
    let completed = false;
    let timedOut = false;

    // An optional deadline: past it the child's whole process group is killed
    // - a shell's hung grandchild would otherwise outlive it and hold the
    // pipes open (verifier round 3) - and the capture fails. A nonzero exit
    // already observed stays primary even when output closure later times out.
    const deadline = bounded ? setTimeout(() => {
      timedOut = true;
      const error = new Error(`${command} ${TIMED_OUT_TEXT} ${options.timeoutMs} ms`);
      if (!failure.observed) Object.assign(failure, {observed: true, error});
      else process.stderr.write(`${error.message}\n`);
      try {
        killGroup(child);
      } catch (cleanupError) {
        failure.error.cause = cleanupError;
        process.stderr.write(`lab capture cleanup unavailable for group ${child.pid}: ` +
          `${cleanupError.message}\n`);
      }
      // The original bound has expired. Release capture's local handles and
      // report the incomplete observation; signalling is not a closed scope.
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      complete();
    }, options.timeoutMs) : null;
    function complete() {
      if (completed) return;
      completed = true;
      if (deadline) clearTimeout(deadline);
      if (exitFailure.observed && failure.error === exitFailure.error) {
        exitFailure.error.message =
          `${command} failed (${exitFailure.error.exitCode}): ${stderr.trim()}`;
      }
      if (timedOut) {
        failure.error.outputComplete = false;
        failure.error.groupClosure = 'unconfirmed';
        failure.error.message += '\nlab capture: deadline expired; output incomplete; ' +
          'process group closure unconfirmed';
      }
      if (failure.observed) rejectPromise(failure.error);
      else resolvePromise(stdout.trim());
    }
    child.stdout.on(CHILD_EVENT.DATA, (chunk) => {
      stdout += chunk;
    });
    child.stderr.on(CHILD_EVENT.DATA, (chunk) => {
      stderr += chunk;
    });
    child.on(CHILD_EVENT.ERROR, (error) => {
      if (deadline) clearTimeout(deadline);
      if (!failure.observed) Object.assign(failure, {observed: true, error});
    });
    child.on(CHILD_EVENT.EXIT, (code, signal) => {
      if (code === 0 || failure.observed) return;
      const error = Object.assign(new Error(`${command} failed (${code})`),
        {exitCode: code, signal});
      Object.assign(exitFailure, {observed: true, error});
      Object.assign(failure, {observed: true, error});
    });
    // Capture owns these pipes. Direct exit can precede their final bytes
    // when a descendant still holds a descriptor, so only close is success.
    child.once(CHILD_EVENT.CLOSE, complete);
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

/**
 * Signal only the process group declared by a detached acquisition. Group
 * absence is not permission to signal a direct child; any other OS refusal
 * remains unavailable to the caller that owns completion and cleanup.
 * @param {import('node:child_process').ChildProcess} child
 */
export function killGroup(child) {
  if (!Number.isInteger(child?.pid) || child.pid <= 1) throw new Error(UNACQUIRED_GROUP);
  try {
    process.kill(-child.pid, KILL_SIGNAL);
  } catch (error) {
    if (error.code !== MISSING_PROCESS) throw error;
  }
}

export async function commandExists(command) {
  const probe = process.platform === PLATFORM_WINDOWS ?
    [WINDOWS_LOOKUP, command] :
    [POSIX_SHELL, POSIX_SHELL_LOGIN_COMMAND, `command -v ${command}`];
  try {
    await capture(probe[0], probe.slice(1));
    return true;
  } catch {
    return false;
  }
}

export function reserveLocalPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.on(CHILD_EVENT.ERROR, rejectPromise);
    server.listen(EPHEMERAL_PORT, LOOPBACK_HOST, () => {
      const address = server.address();
      const port = typeof address === OBJECT_TYPE && address ? address.port : null;
      server.close((error) => {
        if (error) return rejectPromise(error);
        if (!port) return rejectPromise(new Error(PORT_RESERVATION_FAILED));
        resolvePromise(port);
      });
    });
  });
}

export async function waitForDockerPing(port, timeoutMs = DOCKER_PING_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${LOOPBACK_HOST}:${port}/_ping`);
      if (response.ok && (await response.text()).trim() === DOCKER_PING_OK) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, DOCKER_PING_POLL_MS));
  }
  throw new Error(
    `Docker tunnel on port ${port} did not become ready: ${lastError || DOCKER_PING_TIMEOUT_TEXT}`,
  );
}

function exitOf(child) {
  return new Promise((resolve) => {
    child.on(PLACEMENT_CHILD_EVENT.ERROR, () => resolve(null));
    child.on(PLACEMENT_CHILD_EVENT.EXIT, (code) => resolve(code));
  });
}

// Its exit status once its output streams are also closed: every line read.
function closeOf(child) {
  return new Promise((resolve) => {
    let unavailable = false;
    child.on(PLACEMENT_CHILD_EVENT.ERROR, () => {
      unavailable = true;
    });
    child.once(PLACEMENT_CHILD_EVENT.CLOSE, (code) => resolve(unavailable ? null : code));
  });
}

function streamLines(readable, stream, onLine) {
  let partial = EMPTY;
  readable.setEncoding(TEXT_UTF8);
  readable.on(PLACEMENT_CHILD_EVENT.DATA, (text) => {
    const lines = `${partial}${text}`.split(PLACEMENT_LINE);
    partial = lines.pop();
    for (const line of lines) onLine(line, stream);
  });
  readable.on(PLACEMENT_CHILD_EVENT.END, () => {
    if (partial) onLine(partial, stream);
    partial = EMPTY;
  });
}

export {PLACEMENT_CHILD_EVENT, PLACEMENT_LINE, TEXT_UTF8, closeOf, exitOf, streamLines};
