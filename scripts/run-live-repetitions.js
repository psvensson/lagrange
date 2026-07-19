/**
 * N-repetition live confirmation runner for the MovieLens scenario gate.
 *
 * Usage: node scripts/run-live-repetitions.js <probe|demo>
 *
 * The repetition policy is fixed per run class (owner decision 2026-07-19,
 * recorded in solve/epics/convergence-loop-and-workflow-overhead.md work
 * item 2b): `probe` runs examples/service-data-affinity/run-formation-probe.js
 * 5 times, `demo` runs run-affinity-demo.js 3 times, and the gate holds only
 * when EVERY measuring repetition is green (child exit code 0). Each
 * invocation runs ONE class; probes-before-demos is session guidance for the
 * operator (invoke `probe` first so a probe failure rejects before any
 * ~20-minute demo run is spent), not enforced by this script.
 *
 * Thermal validity: this machine throttles under sustained load, so the
 * runner waits for the CPU package to cool below COOL_START_MAX_C before each
 * repetition and classifies a FAILED repetition as non-measuring (excluded
 * and re-run once, never counted red) when the post-run temperature is at or
 * above THERMAL_INVALID_C — the Solver's invalid-samples-never-count rule
 * applied to heat. Green runs always count; heat cannot manufacture a pass.
 *
 * The aggregate summary is written to
 * test-output/reports/live-repetitions-<class>-<timestamp>.summary.json.
 */

import {execFile, spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {
  computeSourceFingerprint,
} from '../src/diagnostics/source-fingerprint.js';

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUMMARY_DIR = resolve(REPO_ROOT, 'test-output/reports');
const ENTRYPOINT_FILE = 'run-live-repetitions.js';
const SENSOR_COMMAND = 'sensors';
const SENSOR_JSON_FLAG = '-j';
const SENSOR_INPUT_SUFFIX = '_input';
const LINE_BREAK = '\n';
const CHILD_EVENT = Object.freeze({
  CLOSE: 'close',
  DATA: 'data',
  ERROR: 'error',
});
const SLOT_OUTCOME = Object.freeze({
  GREEN: 'green',
  INCONCLUSIVE: 'inconclusive',
  RED: 'red',
});
const POLICY_GATE = 'all measuring repetitions green';
const LOG_MESSAGE = Object.freeze({
  GATE_FAILED: 'RESULT: GATE FAILED',
  INCONCLUSIVE:
    'RESULT: INCONCLUSIVE (thermal validity could not be established)',
  RERUN_EXHAUSTED: 'Thermal re-run budget exhausted; session inconclusive.',
  THERMAL_RERUN: 'non-measuring (thermal); re-running once.',
});

/** Fixed per-class policy: script path and repetition count. No overrides. */
const RUN_CLASSES = Object.freeze({
  probe: Object.freeze({
    script: 'examples/service-data-affinity/run-formation-probe.js',
    repetitions: 5,
  }),
  demo: Object.freeze({
    script: 'examples/service-data-affinity/run-affinity-demo.js',
    repetitions: 3,
  }),
});

/** Do not start a repetition until every core is below this Celsius bound. */
const COOL_START_MAX_C = 70;
/** A failed run that ends at/above this bound is non-measuring, not red. */
const THERMAL_INVALID_C = 85;
/** How long to wait for cool-down before declaring the session inconclusive. */
const COOL_WAIT_TOTAL_MS = 10 * 60 * 1000;
/** Poll interval while waiting for cool-down. */
const COOL_WAIT_POLL_MS = 30 * 1000;
/** Each slot gets at most one non-measuring re-run before giving up. */
const MAX_RERUNS_PER_SLOT = 1;

/** Session exit codes: gate failed vs could-not-measure. */
const EXIT_GATE_FAILED = 1;
const EXIT_INCONCLUSIVE = 2;

/**
 * Read the maximum core temperature in Celsius via `sensors -j`.
 * @param {Function} exec injectable execFile-style runner (tests)
 * @return {Promise<number|null>} max temp, or null when unavailable
 */
export async function readMaxCoreTempC(exec = execFileAsync) {
  try {
    const {stdout} = await exec(SENSOR_COMMAND, [SENSOR_JSON_FLAG]);
    return maxTempFromSensorsJson(JSON.parse(stdout));
  } catch {
    return null;
  }
}

/**
 * Extract the maximum `*_input` temperature from parsed `sensors -j` output.
 * @param {Object} parsed
 * @return {number|null}
 */
export function maxTempFromSensorsJson(parsed) {
  let max = null;
  for (const chip of Object.values(parsed || {})) {
    for (const readings of Object.values(chip || {})) {
      if (typeof readings !== 'object' || readings === null) {
        continue;
      }
      for (const [key, value] of Object.entries(readings)) {
        if (key.endsWith(SENSOR_INPUT_SUFFIX) && typeof value === 'number') {
          max = max === null ? value : Math.max(max, value);
        }
      }
    }
  }
  return max;
}

/**
 * Wait until the machine is cool enough to start a measuring run.
 * @param {Object} io {readTemp, sleep, log}
 * @return {Promise<{ok: boolean, tempC: number|null}>}
 */
async function waitForCoolStart(io) {
  const deadline = Date.now() + COOL_WAIT_TOTAL_MS;
  for (;;) {
    const tempC = await io.readTemp();
    if (tempC === null || tempC < COOL_START_MAX_C) {
      return {ok: true, tempC};
    }
    if (Date.now() >= deadline) {
      return {ok: false, tempC};
    }
    io.log(`Max core ${tempC}C >= ${COOL_START_MAX_C}C; cooling down...`);
    await io.sleep(COOL_WAIT_POLL_MS);
  }
}

/**
 * Run one child repetition, streaming output and capturing report paths.
 * @param {string} script repo-relative runner script
 * @return {Promise<{exitCode: number, reportRefs: string[]}>}
 */
function execRepetition(script) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', [script], {cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'inherit']});
    const reportRefs = [];
    let buffered = '';
    child.stdout.on(CHILD_EVENT.DATA, (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(LINE_BREAK);
      buffered = lines.pop();
      for (const line of lines) {
        process.stdout.write(line + LINE_BREAK);
        const ref = reportRefFromLine(line);
        if (ref) {
          reportRefs.push(ref);
        }
      }
    });
    child.on(CHILD_EVENT.ERROR, rejectPromise);
    child.on(CHILD_EVENT.CLOSE, (code) => {
      resolvePromise({exitCode: code === null ? EXIT_GATE_FAILED : code, reportRefs});
    });
  });
}

/**
 * Recognize the runners' own "where the evidence went" stdout lines.
 * @param {string} line
 * @return {string|null}
 */
export function reportRefFromLine(line) {
  const match = line.match(/^(?:Live demo report|Archived run to)[:]? (.+)$/);
  return match ? match[1].trim() : null;
}

/**
 * Classify one finished repetition.
 * @param {number} exitCode
 * @param {number|null} postTempC
 * @return {{green: boolean, nonMeasuring: boolean}}
 */
export function classifyRepetition(exitCode, postTempC) {
  const green = exitCode === 0;
  const nonMeasuring =
    !green && postTempC !== null && postTempC >= THERMAL_INVALID_C;
  return {green, nonMeasuring};
}

/**
 * Run the full repetition session for one run class.
 * @param {string} runClass 'probe' | 'demo'
 * @param {Object} io injectable {execRun, readTemp, sleep, log, now} (tests)
 * @return {Promise<{gatePassed: boolean, inconclusive: boolean, runs: Array}>}
 */
export async function runRepetitionSession(runClass, io = {}) {
  const policy = RUN_CLASSES[runClass];
  if (!policy) {
    throw new Error(`Unknown run class "${runClass}"; expected probe or demo`);
  }
  const resolvedIo = {
    execRun: io.execRun || (() => execRepetition(policy.script)),
    readTemp: io.readTemp || readMaxCoreTempC,
    sleep: io.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    log: io.log || ((msg) => console.log(msg)),
    now: io.now || (() => new Date().toISOString()),
    readSourceFingerprint: io.readSourceFingerprint ||
      (() => computeSourceFingerprint(resolve(REPO_ROOT, 'src'))),
  };
  const sessionStartedAt = resolvedIo.now();
  const sourceFingerprint = await resolvedIo.readSourceFingerprint();
  const runs = [];
  let measuringGreens = 0;
  for (let slot = 0; slot < policy.repetitions; slot += 1) {
    const outcome = await runSlot(runClass, slot, policy, resolvedIo, runs);
    if (outcome === SLOT_OUTCOME.INCONCLUSIVE) {
      return finalizeSession({
        gatePassed: false,
        inconclusive: true,
        runs,
        sessionStartedAt,
        sourceFingerprint,
      }, resolvedIo);
    }
    if (outcome === SLOT_OUTCOME.RED) {
      return finalizeSession({
        gatePassed: false,
        inconclusive: false,
        runs,
        sessionStartedAt,
        sourceFingerprint,
      }, resolvedIo);
    }
    measuringGreens += 1;
  }
  return finalizeSession({
    gatePassed: measuringGreens === policy.repetitions,
    inconclusive: false,
    runs,
    sessionStartedAt,
    sourceFingerprint,
  }, resolvedIo);
}

async function finalizeSession(session, io) {
  const completedSourceFingerprint = await io.readSourceFingerprint();
  const sourceStable =
    completedSourceFingerprint === session.sourceFingerprint;
  return {
    ...session,
    gatePassed: session.gatePassed && sourceStable,
    inconclusive: session.inconclusive || !sourceStable,
    sessionCompletedAt: io.now(),
    completedSourceFingerprint,
    sourceStable,
  };
}

/**
 * Run one slot, allowing at most one thermal non-measuring re-run.
 * @param {string} runClass
 * @param {number} slot
 * @param {Object} policy
 * @param {Object} io resolved io
 * @param {Array} runs mutated evidence list
 * @return {Promise<string>} 'green' | 'red' | 'inconclusive'
 */
async function runSlot(runClass, slot, policy, io, runs) {
  for (let attempt = 0; attempt <= MAX_RERUNS_PER_SLOT; attempt += 1) {
    const cool = await waitForCoolStart(io);
    if (!cool.ok) {
      io.log(`Cool-down wait exhausted at ${cool.tempC}C; session inconclusive.`);
      return SLOT_OUTCOME.INCONCLUSIVE;
    }
    io.log(`[${runClass} ${slot + 1}/${policy.repetitions}] starting (max core ${cool.tempC}C)`);
    const startedAt = io.now();
    const {exitCode, reportRefs} = await io.execRun();
    const postTempC = await io.readTemp();
    const verdict = classifyRepetition(exitCode, postTempC);
    runs.push({
      slot: slot + 1,
      attempt: attempt + 1,
      startedAt,
      exitCode,
      preTempC: cool.tempC,
      postTempC,
      green: verdict.green,
      nonMeasuring: verdict.nonMeasuring,
      reportRefs,
    });
    if (verdict.green) {
      return SLOT_OUTCOME.GREEN;
    }
    if (!verdict.nonMeasuring) {
      return SLOT_OUTCOME.RED;
    }
    io.log(`Slot ${slot + 1} failed at ${postTempC}C >= ${THERMAL_INVALID_C}C: ` +
      LOG_MESSAGE.THERMAL_RERUN);
  }
  io.log(LOG_MESSAGE.RERUN_EXHAUSTED);
  return SLOT_OUTCOME.INCONCLUSIVE;
}

/**
 * Write the aggregate session summary artifact.
 * @param {string} runClass
 * @param {Object} session runRepetitionSession result
 * @return {Promise<string>} summary path
 */
async function writeSummary(runClass, session) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = resolve(SUMMARY_DIR, `live-repetitions-${runClass}-${stamp}.summary.json`);
  const policy = RUN_CLASSES[runClass];
  await mkdir(SUMMARY_DIR, {recursive: true});
  await writeFile(path, JSON.stringify({
    runClass,
    policy: {repetitions: policy.repetitions, gate: POLICY_GATE},
    gatePassed: session.gatePassed,
    inconclusive: session.inconclusive,
    sessionStartedAt: session.sessionStartedAt,
    sessionCompletedAt: session.sessionCompletedAt,
    sourceFingerprint: session.sourceFingerprint,
    completedSourceFingerprint: session.completedSourceFingerprint,
    sourceStable: session.sourceStable,
    runs: session.runs,
  }, null, 2));
  return path;
}

if (process.argv[1]?.includes(ENTRYPOINT_FILE)) {
  const runClass = process.argv[2];
  runRepetitionSession(runClass)
    .then(async (session) => {
      const summaryPath = await writeSummary(runClass, session);
      console.log(`Session summary: ${summaryPath}`);
      if (session.inconclusive) {
        console.log(LOG_MESSAGE.INCONCLUSIVE);
        process.exitCode = EXIT_INCONCLUSIVE;
      } else if (session.gatePassed) {
        console.log(`RESULT: GATE PASSED (${RUN_CLASSES[runClass].repetitions} green)`);
      } else {
        console.log(LOG_MESSAGE.GATE_FAILED);
        process.exitCode = EXIT_GATE_FAILED;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = EXIT_GATE_FAILED;
    });
}
