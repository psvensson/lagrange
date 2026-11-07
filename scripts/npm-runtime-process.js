// Owns the bounded installed runtime process, its group and pipe settlement.
import {spawn} from 'node:child_process';

const TIMEOUT_MS = 120000;
const CLOSE_GRACE_MS = 5000;
const OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
const NPM_RUNTIME_MARKER = Object.freeze({
  STARTED: 'LAGRANGE_NPM_RUNTIME_STARTED', STOPPED: 'LAGRANGE_NPM_RUNTIME_STOPPED',
});
const KILL_SIGNAL = 'SIGKILL';
const NO_PROCESS = 'ESRCH';
const WINDOWS = 'win32';
const TEXT_ENCODING = 'utf8';
const BINARY_ENCODING = 'base64';
const LINE_SEPARATOR = '\n';
const STREAM = Object.freeze({STDOUT: 'stdout', STDERR: 'stderr'});
const EVENT = Object.freeze({DATA: 'data', ERROR: 'error', CLOSE: 'close'});
const SMOKE_FAILURE = Object.freeze({
  TIMEOUT: 'installed runtime smoke deadline expired',
  OUTPUT: 'installed runtime smoke output limit exceeded',
  CLOSE: 'installed runtime smoke did not close after kill',
  WITNESS: 'installed runtime smoke lacks start/stop witnesses',
});

function streamText(output, stream) {
  return Buffer.concat(output.filter((entry) => entry.stream === stream)
    .map((entry) => entry.bytes)).toString(TEXT_ENCODING);
}

function runtimeOutputText(output) {
  return `${STREAM.STDOUT}:\n${streamText(output, STREAM.STDOUT)}\n` +
    `${STREAM.STDERR}:\n${streamText(output, STREAM.STDERR)}`;
}

function runtimeOutputLog(output) {
  return output.map(({stream, bytes}) => JSON.stringify({stream,
    base64: bytes.toString(BINARY_ENCODING)}) + LINE_SEPARATOR).join('');
}

function killProcessGroup(child) {
  if (!child.pid) return;
  if (process.platform === WINDOWS) {
    child.kill(KILL_SIGNAL);
    return;
  }
  try {
    process.kill(-child.pid, KILL_SIGNAL);
  } catch (error) {
    if (error.code !== NO_PROCESS) throw error;
  }
}

function observeRuntimeChild(child, output) {
  return new Promise((resolve, reject) => {
    let failure;
    let closeTimer;
    let stopping = false;
    let bytes = 0;
    const deadline = setTimeout(() => stop(new Error(SMOKE_FAILURE.TIMEOUT)), TIMEOUT_MS);

    function stop(error) {
      if (stopping) return;
      stopping = true;
      failure ??= error;
      closeTimer = setTimeout(() => {
        clearTimeout(deadline);
        child.stdout.destroy();
        child.stderr.destroy();
        reject(new AggregateError([failure], SMOKE_FAILURE.CLOSE));
      }, CLOSE_GRACE_MS);
      try {
        killProcessGroup(child);
      } catch (killError) {
        failure = new AggregateError([failure, killError], failure.message);
      }
    }

    function capture(stream, chunk) {
      bytes += chunk.length;
      if (bytes > OUTPUT_LIMIT_BYTES) stop(new Error(SMOKE_FAILURE.OUTPUT));
      else output.push({stream, bytes: Buffer.from(chunk)});
    }

    child.stdout.on(EVENT.DATA, (chunk) => capture(STREAM.STDOUT, chunk));
    child.stderr.on(EVENT.DATA, (chunk) => capture(STREAM.STDERR, chunk));
    child.once(EVENT.ERROR, (error) => {
      failure ??= error;
    });
    child.once(EVENT.CLOSE, (code, signal) => {
      clearTimeout(deadline);
      clearTimeout(closeTimer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error(`installed runtime exited ${code} (${signal})`));
      const lines = streamText(output, STREAM.STDOUT).split(LINE_SEPARATOR);
      if (!lines.includes(NPM_RUNTIME_MARKER.STARTED) ||
          !lines.includes(NPM_RUNTIME_MARKER.STOPPED)) {
        return reject(new Error(SMOKE_FAILURE.WITNESS));
      }
      resolve();
    });
  });
}

function runInstalledRuntimeProcess(directory, consumer, configuration, output, launch = spawn) {
  const child = launch(process.execPath, [consumer, JSON.stringify(configuration)], {
    cwd: directory, env: process.env, detached: process.platform !== WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return observeRuntimeChild(child, output);
}

export {NPM_RUNTIME_MARKER, runInstalledRuntimeProcess, runtimeOutputLog, runtimeOutputText};
