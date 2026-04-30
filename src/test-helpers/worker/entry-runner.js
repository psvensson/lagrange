/**
 * Worker helper to run an ESM entrypoint with controlled argv and captured output.
 *
 * Used by packaging tests to avoid `child_process.spawnSync()` (blocked in some
 * sandboxed CI environments). This is intentionally minimal and only supports
 * fast-exiting entrypoints (e.g. --help/--version).
 */

import {parentPort, workerData} from 'worker_threads';
import {pathToFileURL} from 'node:url';

import {ExitError} from './exit-error.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1O1BI = 'workerData.entryPath is required';
const LOCAL_STR_UNHANDLEDREJECTION = 'unhandledRejection';
const LOCAL_STR_UNCAUGHTEXCEPTION = 'uncaughtException';
const LOCAL_STR_NODE = 'node';
const LOCAL_STR_EXITERROR = 'ExitError';
const LOCAL_STR_PROCESS_EXIT = 'process.exit(';
const LOCAL_NUM_ONE = 1;

function captureOutput() {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalExit = process.exit;

  let stdout = LOCAL_STR_EMPTY;
  let stderr = LOCAL_STR_EMPTY;

  // Capture low-level writes (covers console.log in most cases too).
  process.stdout.write = (chunk, encoding, cb) => {
    stdout += Buffer.isBuffer(chunk) ? chunk.toString(LOCAL_STR_UTF8) : String(chunk);
    if (typeof cb === LOCAL_STR_FUNCTION) cb();
    return true;
  };

  process.stderr.write = (chunk, encoding, cb) => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString(LOCAL_STR_UTF8) : String(chunk);
    if (typeof cb === LOCAL_STR_FUNCTION) cb();
    return true;
  };

  // Ensure console.* also contributes even if stdout.write is patched differently.
  console.log = (...args) => {
    stdout += `${args.join(LOCAL_STR_SPACE)}\n`;
  };
  console.error = (...args) => {
    stderr += `${args.join(LOCAL_STR_SPACE)}\n`;
  };

  process.exit = (code = LOCAL_NUM_ZERO) => {
    throw new ExitError(code);
  };

  return {
    getOutput: () => ({stdout, stderr}),
    restore: () => {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      process.exit = originalExit;
    },
  };
}

async function run() {
  const {entryPath, args = [], env = {}} = workerData || {};
  if (!entryPath) throw new Error(LOCAL_STR_1O1BI);

  // Some entrypoints call `process.exit()` in promise chains (e.g. `main().catch(...)`).
  // When we turn `process.exit()` into a thrown ExitError, that ExitError can become an
  // unhandled rejection. Swallow ExitError rejections/exceptions so the worker can
  // report the exit code instead of crashing.
  let trappedExitCode = null;
  const onUnhandledRejection = (reason) => {
    if (reason && reason.name === 'ExitError') {
      if (trappedExitCode === null) trappedExitCode = reason.code ?? 0;
    }
  };
  const onUncaughtException = (err) => {
    if (err && err.name === 'ExitError') {
      if (trappedExitCode === null) trappedExitCode = err.code ?? 0;
    }
  };
  process.on(LOCAL_STR_UNHANDLEDREJECTION, onUnhandledRejection);
  process.on(LOCAL_STR_UNCAUGHTEXCEPTION, onUncaughtException);

  // Apply environment overrides for the duration of the run.
  const originalEnv = {};
  for (const [k, v] of Object.entries(env)) {
    originalEnv[k] = process.env[k];
    process.env[k] = v;
  }

  // Provide argv like a real CLI.
  process.argv = [LOCAL_STR_NODE, entryPath, ...args];

  const cap = captureOutput();
  let exitCode = LOCAL_NUM_ZERO;

  try {
    await import(pathToFileURL(entryPath).href);
    // Give any microtasks a chance to flush writes.
    await new Promise((r) => setTimeout(r, LOCAL_NUM_ZERO));
  } catch (err) {
    if (err && (err.name === LOCAL_STR_EXITERROR || err instanceof ExitError)) {
      exitCode = err.code ?? LOCAL_NUM_ZERO;
    } else if (err && err.code !== undefined &&
        String(err.message || LOCAL_STR_EMPTY).startsWith(LOCAL_STR_PROCESS_EXIT)) {
      // Defensive: handle a serialized ExitError.
      exitCode = err.code ?? LOCAL_NUM_ZERO;
    } else {
      throw err;
    }
  } finally {
    if (trappedExitCode !== null) {
      exitCode = trappedExitCode;
    }
    const {stdout, stderr} = cap.getOutput();
    cap.restore();

    // Restore env.
    for (const [k] of Object.entries(env)) {
      if (originalEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    }

    process.off(LOCAL_STR_UNHANDLEDREJECTION, onUnhandledRejection);
    process.off(LOCAL_STR_UNCAUGHTEXCEPTION, onUncaughtException);

    parentPort.postMessage({stdout, stderr, exitCode});
  }
}

run().catch((err) => {
  parentPort.postMessage({
    stdout: LOCAL_STR_EMPTY,
    stderr: err?.stack || String(err),
    exitCode: LOCAL_NUM_ONE,
    error: true,
  });
});
