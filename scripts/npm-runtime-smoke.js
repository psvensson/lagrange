// The npm publication proof owns the installed public runtime's process and
// output lifetime. A child exit alone does not release inherited stdio pipes.
import {readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {NPM_RUNTIME_MARKER, runInstalledRuntimeProcess,
  runtimeOutputLog, runtimeOutputText} from './npm-runtime-process.js';
import {refuseUnderProbe} from '../src/test-helpers/probe-guard.js';

const CONSUMER_FILE = '.lagrange-runtime-smoke.mjs';
const CONSUMER_SOURCE = new URL('./npm-runtime-smoke-consumer.js', import.meta.url);
const ERROR_EXCERPT_CHARS = 8000;
const PROBE_ACTION = 'an installed embedded runtime';

/**
 * Exercise a fresh installed consumer through its public lifecycle, preserving
 * output beside the tarball. The launcher is the process boundary, injectable
 * for deterministic custody tests without another runtime execution path.
 * @param {string} directory Consumer installation directory.
 * @param {string} dataDir Fresh runtime storage directory.
 * @param {string} logFile Retained raw stdout/stderr path.
 * @param {Function} launch Process launcher.
 */
async function verifyInstalledRuntime(directory, dataDir, logFile, launch) {
  refuseUnderProbe(PROBE_ACTION);
  const consumer = join(directory, CONSUMER_FILE);
  const output = [];
  let failure;
  try {
    await writeFile(consumer, await readFile(CONSUMER_SOURCE));
    await runInstalledRuntimeProcess(directory, consumer, {dataDir,
      startedMarker: NPM_RUNTIME_MARKER.STARTED, stoppedMarker: NPM_RUNTIME_MARKER.STOPPED},
    output, launch);
  } catch (error) {
    failure = new Error(`${error.message}\n${runtimeOutputText(output).slice(-ERROR_EXCERPT_CHARS)}`,
      {cause: error});
  }
  const cleanup = await Promise.allSettled([
    writeFile(logFile, runtimeOutputLog(output)), rm(consumer, {force: true}),
  ]);
  const failures = [failure, ...cleanup.filter((entry) => entry.status === 'rejected')
    .map((entry) => entry.reason)].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, failures[0].message);
}

export {verifyInstalledRuntime};
