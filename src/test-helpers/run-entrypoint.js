import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const LOCAL_NUM_5000 = 5000;
const LOCAL_STR_MESSAGE = 'message';
const LOCAL_STR_ENTRYPOINT_FAILED = 'Entrypoint failed';
const LOCAL_STR_EMPTY = '';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_ERROR = 'error';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = join(__dirname, 'worker', 'entry-runner.js');

/**
 * Run a JS entrypoint in a worker thread and capture stdout/stderr.
 * Avoids `child_process.spawnSync()` which may be blocked in CI sandboxes.
 *
 * @param {string} entryPath absolute path to an entrypoint file (ESM)
 * @param {object} [opts]
 * @param {string[]} [opts.args]
 * @param {Record<string,string>} [opts.env]
 * @param {number} [opts.timeoutMs]
 * @return {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
export function runEntrypoint(entryPath, opts = {}) {
  const {args = [], env = {}, timeoutMs = LOCAL_NUM_5000} = opts;

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {entryPath, args, env},
    });
    // Don't keep the event loop alive if something goes wrong.
    worker.unref();

    const timer = setTimeout(() => {
      // Terminate best-effort; don't wait for termination to resolve.
      worker.terminate().catch(() => {});
      reject(new Error(`runEntrypoint timeout after ${timeoutMs}ms: ${entryPath}`));
    }, timeoutMs);

    worker.once(LOCAL_STR_MESSAGE, (msg) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (msg && msg.error) {
        reject(new Error(msg.stderr || LOCAL_STR_ENTRYPOINT_FAILED));
        return;
      }
      resolve({
        stdout: msg.stdout || LOCAL_STR_EMPTY,
        stderr: msg.stderr || LOCAL_STR_EMPTY,
        exitCode: msg.exitCode ?? LOCAL_NUM_ZERO,
      });
    });

    worker.once(LOCAL_STR_ERROR, (err) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      reject(err);
    });
  });
}

