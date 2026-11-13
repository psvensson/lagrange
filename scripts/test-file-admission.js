// The existing file pool's admission boundary. The file runner owns actual
// launch/capture/closure; this loop owns only which unstarted file may launch.
import {setTimeout as delay} from 'node:timers/promises';
import {
  HEADROOM, executionContext, formatThermalOutcome, readThermalHeadroom,
  thermalDeadline, thermalPermits, waitForThermalHeadroom,
} from './checks/wait-for-thermal-headroom.js';

export const BATCH_PREVIOUS_CLOSE_ENV = 'LAGRANGE_TEST_BATCH_PREVIOUS_CLOSE_MS';

const ADMISSION_STEP = Object.freeze({LAUNCH: 'launch', RECHECK: 'recheck', REFUSE: 'refuse'});

function executionExpired(nested, signal, deadline) {
  return !nested && (signal?.aborted || performance.now() >= deadline);
}

function previousBatchClose(env) {
  const previousClose = env[BATCH_PREVIOUS_CLOSE_ENV];
  if (previousClose !== undefined && !Number.isSafeInteger(Number(previousClose))) {
    throw new Error('invalid previous batch closure');
  }
  return previousClose === undefined ? null :
    performance.now() + Number(previousClose) - Date.now();
}

// One current decision before a pool claim. Active files settle normally before
// any cooling/cadence wait; a wait returns RECHECK so no old observation grants
// a later file admission. The caller alone owns results and the next file index.
async function prepareFileAdmission({nested, requestedJobs, active, read, env, deadline,
  signal, write, getLastClose, alreadyRefused}) {
  if (nested) return {step: ADMISSION_STEP.LAUNCH, limit: requestedJobs};
  let decision;
  try {
    decision = await read();
    if (alreadyRefused()) return {step: ADMISSION_STEP.RECHECK};
    if (decision.outcome === HEADROOM.HOLD) {
      await Promise.all(active);
      if (alreadyRefused()) return {step: ADMISSION_STEP.RECHECK};
      decision = await waitForThermalHeadroom({env, deadline, read, signal,
        log: (line) => write(`${line}\n`)});
    }
  } catch (error) {
    return {step: ADMISSION_STEP.REFUSE,
      decision: {outcome: HEADROOM.UNAVAILABLE, reason: error.message}};
  }
  write(`${formatThermalOutcome(decision)}\n`);
  if (!thermalPermits(decision)) return {step: ADMISSION_STEP.REFUSE, decision};
  const {cadence_ms: cadence, max_concurrency: maximum} = decision.execution_policy;
  if (cadence > 0 && active.size > 0) {
    await Promise.all(active);
    return {step: ADMISSION_STEP.RECHECK};
  }
  const lastClose = getLastClose();
  if (cadence > 0 && lastClose !== null && performance.now() < lastClose + cadence) {
    try {
      const remaining = deadline - performance.now();
      await delay(Math.min(lastClose + cadence - performance.now(), remaining),
        undefined, {signal});
    } catch (error) {
      return {step: ADMISSION_STEP.REFUSE,
        decision: {outcome: HEADROOM.EXHAUSTED, reason: error.message}};
    }
    return {step: ADMISSION_STEP.RECHECK};
  }
  return {step: ADMISSION_STEP.LAUNCH, limit: Math.min(requestedJobs, maximum)};
}

export async function runAdmittedTestFiles(files, options, launch) {
  const env = {...process.env, ...options.env};
  const nested = executionContext(env) !== null;
  const requestedJobs = Math.min(options.jobs, files.length);
  const results = [];
  const active = new Set();
  const unresolved = [];
  const write = options.write ?? ((text) => process.stdout.write(text));
  const deadline = nested ? null : thermalDeadline(env);
  const read = options.thermalRead ?? (() => readThermalHeadroom({
    env, deadline, signal: options.signal,
  }));
  let nextFileIndex = 0;
  let lastClose = previousBatchClose(env);
  let refusal = null;
  // One orchestration loop owns the index. No worker can claim a file while
  // another admission is pending, and waiting never blocks child close/output.
  while (nextFileIndex < files.length) {
    if (refusal) break;
    if (executionExpired(nested, options.signal, deadline)) {
      refusal = {outcome: HEADROOM.EXHAUSTED, reason: 'cancelled or owned deadline expired'};
      break;
    }
    const admission = await prepareFileAdmission({nested, requestedJobs, active, read,
      env, deadline, signal: options.signal, write, getLastClose: () => lastClose,
      alreadyRefused: () => refusal !== null});
    if (refusal) break;
    if (admission.step === ADMISSION_STEP.REFUSE) {
      refusal = admission.decision;
      break;
    }
    if (admission.step === ADMISSION_STEP.RECHECK) continue;
    if (executionExpired(nested, options.signal, deadline)) {
      refusal = {outcome: HEADROOM.EXHAUSTED, reason: 'cancelled or owned deadline expired'};
      break;
    }
    if (active.size >= admission.limit) {
      await Promise.race(active);
      continue;
    }
    const index = nextFileIndex;
    let launched;
    try {
      launched = launch(files[index], options);
    } catch (error) {
      refusal = {outcome: HEADROOM.UNAVAILABLE, reason: error.message};
      break;
    }
    nextFileIndex += 1;
    const child = launched.then((result) => {
      results[index] = result;
      lastClose = performance.now();
    }, (error) => {
      unresolved.push(files[index]);
      refusal = {outcome: HEADROOM.UNAVAILABLE, reason: error.message};
    }).finally(() => active.delete(child));
    active.add(child);
  }
  await Promise.all(active);
  return {results: results.filter(Boolean), refusal, nextFileIndex, unresolved};
}
