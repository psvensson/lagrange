import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit', DATA: 'data'});
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
      rejectPromise(new Error(`${command} failed:${suffix}`));
    });
    if (hasInput && child.stdin) child.stdin.end(options.stdin);
  });
}

export function capture(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: [...STDIO_CAPTURE],
      shell: false,
    });
    let stdout = EMPTY;
    let stderr = EMPTY;
    child.stdout.on(CHILD_EVENT.DATA, (chunk) => {
      stdout += chunk;
    });
    child.stderr.on(CHILD_EVENT.DATA, (chunk) => {
      stderr += chunk;
    });
    child.on(CHILD_EVENT.ERROR, rejectPromise);
    child.on(CHILD_EVENT.EXIT, (code) => {
      if (code === 0) return resolvePromise(stdout.trim());
      rejectPromise(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
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
