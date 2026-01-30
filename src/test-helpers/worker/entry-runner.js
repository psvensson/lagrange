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

function captureOutput() {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalExit = process.exit;

  let stdout = '';
  let stderr = '';

  // Capture low-level writes (covers console.log in most cases too).
  process.stdout.write = (chunk, encoding, cb) => {
    stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (typeof cb === 'function') cb();
    return true;
  };

  process.stderr.write = (chunk, encoding, cb) => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (typeof cb === 'function') cb();
    return true;
  };

  // Ensure console.* also contributes even if stdout.write is patched differently.
  console.log = (...args) => {
    stdout += `${args.join(' ')}\n`;
  };
  console.error = (...args) => {
    stderr += `${args.join(' ')}\n`;
  };

  process.exit = (code = 0) => {
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
  if (!entryPath) throw new Error('workerData.entryPath is required');

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
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  // Apply environment overrides for the duration of the run.
  const originalEnv = {};
  for (const [k, v] of Object.entries(env)) {
    originalEnv[k] = process.env[k];
    process.env[k] = v;
  }

  // Provide argv like a real CLI.
  process.argv = ['node', entryPath, ...args];

  const cap = captureOutput();
  let exitCode = 0;

  try {
    await import(pathToFileURL(entryPath).href);
    // Give any microtasks a chance to flush writes.
    await new Promise((r) => setTimeout(r, 0));
  } catch (err) {
    if (err && (err.name === 'ExitError' || err instanceof ExitError)) {
      exitCode = err.code ?? 0;
    } else if (err && err.code !== undefined && String(err.message || '').startsWith('process.exit(')) {
      // Defensive: handle a serialized ExitError.
      exitCode = err.code ?? 0;
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

    process.off('unhandledRejection', onUnhandledRejection);
    process.off('uncaughtException', onUncaughtException);

    parentPort.postMessage({stdout, stderr, exitCode});
  }
}

run().catch((err) => {
  parentPort.postMessage({
    stdout: '',
    stderr: err?.stack || String(err),
    exitCode: 1,
    error: true,
  });
});
