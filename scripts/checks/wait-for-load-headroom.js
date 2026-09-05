// Load staging gate for the landing import-graph verify.
//
// `canonicalImportGraphProblem` spawns the import-graph producer with a 30 s
// timeout and retries once; on a shared machine under load the verify
// (~22 s idle) times out twice and the landing refuses with a message that
// looks like a producer defect (memory: 2026-09-04, four such misses at
// 10-25 minutes each). Nothing consulted load. This gate WAITS, bounded,
// until the one-minute load average is under a headroom threshold before the
// verify (or its refresh) spawns, the way the thermal gate stages the heavy
// test corpus. It is a staging aid, not an invariant: skip it explicitly with
// LAGRANGE_SKIP_LOAD_GATE=1, and it never fails the landing by itself — after
// the bounded wait the verify runs regardless and reports its own result.

import os from 'node:os';

const SKIP_ENV = 'LAGRANGE_SKIP_LOAD_GATE';
const ENABLED_ENV_VALUE = '1';
const HEADROOM_FRACTION = 0.75;
const DEFAULT_MAX_WAIT_MS = 120_000;
const DEFAULT_POLL_MS = 5_000;
const LOAD_INDEX_ONE_MINUTE = 0;
const LOAD_DIGITS = 2;
const INT32_BYTES = 4;
const WAIT_MESSAGE_PREFIX = 'load-gate: waiting for load < ';
const WAIT_MESSAGE_NOW = ' (now ';
const WAIT_MESSAGE_SUFFIX = ')\n';
const GAVE_UP_MESSAGE_PREFIX = 'load-gate: load still ';
const GAVE_UP_MESSAGE_INFIX = ' after ';
const GAVE_UP_MESSAGE_SUFFIX = ' ms - running the verify anyway\n';

export function defaultLoadThreshold(cpuCount = os.cpus().length) {
  return Math.max(1, cpuCount * HEADROOM_FRACTION);
}

function sampleOneMinuteLoad() {
  return os.loadavg()[LOAD_INDEX_ONE_MINUTE];
}

// Synchronous, allocation-free sleep for the synchronous landing preflight.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(INT32_BYTES)), 0, 0, ms);
}

function skipRequested(env) {
  return env[SKIP_ENV] === ENABLED_ENV_VALUE;
}

// Waits until `sample()` is below `threshold` or `maxWaitMs` elapsed. Returns
// {waitedMs, load, skipped}. Every collaborator is injectable for tests.
export function waitForLoadHeadroomSync(options = {}) {
  const {
    threshold = defaultLoadThreshold(),
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    pollMs = DEFAULT_POLL_MS,
    sample = sampleOneMinuteLoad,
    sleep = sleepSync,
    log = (line) => process.stderr.write(line),
    env = process.env,
  } = options;
  if (skipRequested(env)) return {waitedMs: 0, load: null, skipped: true};
  let waitedMs = 0;
  let load = sample();
  while (load >= threshold && waitedMs < maxWaitMs) {
    log(`${WAIT_MESSAGE_PREFIX}${threshold.toFixed(LOAD_DIGITS)}` +
      `${WAIT_MESSAGE_NOW}${load.toFixed(LOAD_DIGITS)}${WAIT_MESSAGE_SUFFIX}`);
    const step = Math.min(pollMs, maxWaitMs - waitedMs);
    sleep(step);
    waitedMs += step;
    load = sample();
  }
  if (load >= threshold) {
    log(`${GAVE_UP_MESSAGE_PREFIX}${load.toFixed(LOAD_DIGITS)}` +
      `${GAVE_UP_MESSAGE_INFIX}${waitedMs}${GAVE_UP_MESSAGE_SUFFIX}`);
  }
  return {waitedMs, load, skipped: false};
}
