// The existing file pool's admission boundary. The file runner owns actual
// launch/capture/closure; this loop owns only which unstarted file may launch.
import {setTimeout as delay} from 'node:timers/promises';
import {
  HEADROOM, executionContext, formatThermalOutcome, readThermalHeadroom,
  thermalDeadline, thermalPermits, waitForThermalHeadroom,
} from './checks/wait-for-thermal-headroom.js';

export const BATCH_PREVIOUS_CLOSE_ENV = 'LAGRANGE_TEST_BATCH_PREVIOUS_CLOSE_MS';

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
  const previousClose = env[BATCH_PREVIOUS_CLOSE_ENV];
  if (previousClose !== undefined && !Number.isSafeInteger(Number(previousClose))) {
    throw new Error('invalid previous batch closure');
  }
  let lastClose = previousClose === undefined ? null :
    performance.now() + Number(previousClose) - Date.now();
  let refusal = null;
  // One orchestration loop owns the index. No worker can claim a file while
  // another admission is pending, and waiting never blocks child close/output.
  while (nextFileIndex < files.length) {
    if (refusal) break;
    if (!nested && (options.signal?.aborted || performance.now() >= deadline)) {
      refusal = {outcome: HEADROOM.EXHAUSTED, reason: 'cancelled or owned deadline expired'};
      break;
    }
    let limit = requestedJobs;
    if (!nested) {
      let decision;
      try {
        decision = await read();
      } catch (error) {
        refusal = {outcome: HEADROOM.UNAVAILABLE, reason: error.message};
        break;
      }
      if (refusal) break;
      if (decision.outcome === HEADROOM.HOLD) {
        await Promise.all(active);
        decision = await waitForThermalHeadroom({env, deadline, read,
          signal: options.signal, log: (line) => write(`${line}\n`)});
      }
      if (refusal) break;
      write(`${formatThermalOutcome(decision)}\n`);
      if (!thermalPermits(decision)) {
        refusal = decision;
        break;
      }
      limit = Math.min(limit, decision.execution_policy.max_concurrency);
      const cadence = decision.execution_policy.cadence_ms;
      if (cadence > 0 && active.size > 0) {
        await Promise.all(active);
        continue;
      }
      if (cadence > 0 && lastClose !== null && performance.now() < lastClose + cadence) {
        try {
          const remaining = deadline - performance.now();
          await delay(Math.min(lastClose + cadence - performance.now(), remaining),
            undefined, {signal: options.signal});
        } catch (error) {
          refusal = {outcome: HEADROOM.EXHAUSTED, reason: error.message};
          break;
        }
        continue;
      }
    }
    if (!nested && (options.signal?.aborted || performance.now() >= deadline)) {
      refusal = {outcome: HEADROOM.EXHAUSTED, reason: 'cancelled or owned deadline expired'};
      break;
    }
    if (active.size >= limit) {
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
