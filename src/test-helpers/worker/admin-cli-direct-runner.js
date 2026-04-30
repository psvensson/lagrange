/**
 * Worker entry to run AdminCLI directly (without going through the bin wrapper).
 * Used by packaging tests as a "non-packaged" baseline.
 */

import {parentPort, workerData} from 'worker_threads';

import {AdminCLI} from '../../cli/index.js';
import {ExitError} from './exit-error.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

function captureOutput() {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalExit = process.exit;

  let stdout = LOCAL_STR_EMPTY;
  let stderr = LOCAL_STR_EMPTY;

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
    get: () => ({stdout, stderr}),
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
  const {args = [], env = {}} = workerData || {};

  const originalEnv = {};
  for (const [k, v] of Object.entries(env)) {
    originalEnv[k] = process.env[k];
    process.env[k] = v;
  }

  const cap = captureOutput();
  let exitCode = LOCAL_NUM_ZERO;

  try {
    const cli = new AdminCLI();
    await cli.start(args);
  } catch (err) {
    if (err instanceof ExitError) {
      exitCode = err.code ?? LOCAL_NUM_ZERO;
    } else {
      throw err;
    }
  } finally {
    const {stdout, stderr} = cap.get();
    cap.restore();

    for (const [k] of Object.entries(env)) {
      if (originalEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    }

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
