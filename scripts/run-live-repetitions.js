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
import {readFileSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {NON_MEASURING_VERDICT_REASONS} from './solve/probes.js';
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

/**
 * Disk-contention preflight (PSI). Sustained I/O stall pressure surfaces
 * mid-run as event-loop gaps and non-measuring verdicts (the NVMe relocation
 * lesson: node-0 at 55% blocked produced runs the harness had to throw away).
 * Catch the unfit host BEFORE spending the run: do not start while
 * /proc/pressure/io reports `some avg10` at/above this percentage.
 */
const IO_PRESSURE_FILE = '/proc/pressure/io';
const IO_QUIET_MAX_SOME_AVG10 = 15;
/** How long to wait for I/O quiet before declaring the session inconclusive. */
const IO_WAIT_TOTAL_MS = 10 * 60 * 1000;
/** Poll interval while waiting for I/O pressure to drain. */
const IO_WAIT_POLL_MS = 30 * 1000;

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
 * Extract the `some avg10` percentage from /proc/pressure/io PSI text.
 * @param {string} text raw PSI file content
 * @return {number|null} percentage, or null when unparsable
 */
export function ioSomeAvg10FromPsi(text) {
  const match = /^some avg10=([0-9.]+)/m.exec(text || '');
  return match ? Number(match[1]) : null;
}

/**
 * Read current I/O stall pressure (`some avg10`, percent) from PSI.
 * @param {Function} read injectable readFileSync-style reader (tests)
 * @return {Promise<number|null>} percentage, or null when PSI is unavailable
 */
export async function readIoPressureSomeAvg10(read = readFileSync) {
  try {
    return ioSomeAvg10FromPsi(read(IO_PRESSURE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Wait until disk I/O pressure is low enough to start a measuring run.
 * PSI unavailable (non-Linux, PSI off) never blocks: fitness is then simply
 * unestablished pre-run and the existing post-run gap harvest still governs.
 * @param {Object} io {readIoPressure, sleep, log}
 * @return {Promise<{ok: boolean, someAvg10: number|null}>}
 */
async function waitForIoQuietStart(io) {
  const deadline = Date.now() + IO_WAIT_TOTAL_MS;
  for (;;) {
    const someAvg10 = await io.readIoPressure();
    if (someAvg10 === null || someAvg10 < IO_QUIET_MAX_SOME_AVG10) {
      return {ok: true, someAvg10};
    }
    if (Date.now() >= deadline) {
      return {ok: false, someAvg10};
    }
    io.log(`I/O pressure some avg10 ${someAvg10}% >= ` +
      `${IO_QUIET_MAX_SOME_AVG10}%; waiting for disk contention to drain...`);
    await io.sleep(IO_WAIT_POLL_MS);
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
 * A failed run whose own report carries a NON_MEASURING verdict reason (e.g.
 * host_scheduling_gap_budget_exceeded from the event-loop-gap harvest) did not
 * measure the system under test; like a thermally invalid run it must re-run,
 * never count as red.
 * @param {string[]} reportRefs
 * @return {string|null}
 */
export function reportNonMeasuringReason(reportRefs) {
  for (const ref of reportRefs || []) {
    if (!String(ref).endsWith('.report.json')) continue;
    let data = null;
    try {
      data = JSON.parse(readFileSync(ref, 'utf8'));
    } catch (_error) {
      continue;
    }
    const scenarios = [
      ...(Array.isArray(data?.standardSummary?.scenarios) ?
        data.standardSummary.scenarios : []),
      ...(Array.isArray(data?.scenarios) ? data.scenarios : []),
    ];
    for (const entry of scenarios) {
      const reason = entry?.current?.verdictReason || entry?.verdictReason;
      if (reason && NON_MEASURING_VERDICT_REASONS.includes(reason)) {
        return reason;
      }
    }
  }
  return null;
}

/**
 * Classify one finished repetition.
 * @param {number} exitCode
 * @param {number|null} postTempC
 * @param {string[]} [reportRefs]
 * @return {{green: boolean, nonMeasuring: boolean, nonMeasuringReason: string|null}}
 */
export function classifyRepetition(exitCode, postTempC, reportRefs = []) {
  const green = exitCode === 0;
  const thermal =
    !green && postTempC !== null && postTempC >= THERMAL_INVALID_C;
  const reportReason = !green && !thermal ?
    reportNonMeasuringReason(reportRefs) : null;
  return {
    green,
    nonMeasuring: thermal || reportReason !== null,
    nonMeasuringReason: thermal ?
      `post-run ${postTempC}C >= ${THERMAL_INVALID_C}C` : reportReason,
  };
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
    readIoPressure: io.readIoPressure || readIoPressureSomeAvg10,
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
    const quiet = await waitForIoQuietStart(io);
    if (!quiet.ok) {
      io.log(`I/O-quiet wait exhausted at some avg10 ${quiet.someAvg10}%; ` +
        'session inconclusive.');
      return SLOT_OUTCOME.INCONCLUSIVE;
    }
    io.log(`[${runClass} ${slot + 1}/${policy.repetitions}] starting ` +
      `(max core ${cool.tempC}C, io some avg10 ` +
      `${quiet.someAvg10 === null ? 'n/a' : `${quiet.someAvg10}%`})`);
    const startedAt = io.now();
    const {exitCode, reportRefs} = await io.execRun();
    const postTempC = await io.readTemp();
    const verdict = classifyRepetition(exitCode, postTempC, reportRefs);
    runs.push({
      slot: slot + 1,
      attempt: attempt + 1,
      startedAt,
      exitCode,
      preTempC: cool.tempC,
      preIoSomeAvg10: quiet.someAvg10,
      postTempC,
      green: verdict.green,
      nonMeasuring: verdict.nonMeasuring,
      nonMeasuringReason: verdict.nonMeasuringReason,
      reportRefs,
    });
    if (verdict.green) {
      return SLOT_OUTCOME.GREEN;
    }
    if (!verdict.nonMeasuring) {
      return SLOT_OUTCOME.RED;
    }
    io.log(`Slot ${slot + 1} non-measuring ` +
      `(${verdict.nonMeasuringReason}); re-running once.`);
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
