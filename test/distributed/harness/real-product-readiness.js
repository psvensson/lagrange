/**
 * Fail-closed readiness polling for the comparative-benchmark deployers. A
 * component is ready only when its probe - which reads the product's own
 * documented contract - says so; a probe that throws is a not-ready attempt
 * whose error is the diagnostic. Exhaustion throws `readiness_exhausted`
 * carrying the LAST diagnostic, so measurement never starts on a component
 * nobody saw ready.
 */
import {
  DateConstructor,
  dateNow,
  dateToISOString,
  numberIsFinite,
  numberIsInteger,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  READINESS_STATE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {errorText} from './real-product-remote-shell.js';

// One readiness attempt: the probe's verdict {ready, diagnostic}, or, when the
// probe throws, a not-ready attempt whose diagnostic is the error. An answer
// outside that contract is a harness defect and is raised, never read as a
// verdict.
async function probeOnce(component, probe, probeContext) {
  let outcome;
  try {
    outcome = await probe(probeContext);
  } catch (error) {
    if (error?.terminal === true) throw error;
    return {ready: false, diagnostic: {error: errorText(error)}};
  }
  if (!outcome || typeof outcome.ready !== 'boolean' || !('diagnostic' in outcome)) {
    throw new Error(`readiness probe of ${component} answered outside {ready, diagnostic}`);
  }
  return outcome;
}

function resolveClock(now, nowFn) {
  if (typeof nowFn === 'function') return nowFn;
  if (typeof now === 'function') return now;
  return dateNow;
}

function isAborted(signal) {
  return Boolean(signal?.aborted);
}

function deadlineRemainingMs({nowFn, deadlineAtMs}) {
  if (!numberIsFinite(deadlineAtMs)) return null;
  return deadlineAtMs - nowFn();
}

function sleepUntilOrAbort(sleep, sleepMs, signal) {
  if (!signal) return sleep(sleepMs);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    signal.addEventListener('abort', onAbort, {once: true});
    Promise.resolve(sleep(sleepMs)).then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function buildReadinessExhaustedFailure({
  component,
  attempt,
  maxAttempts,
  elapsedMs,
  deadlineMs,
  deadlineAtMs,
  aborted,
  deadlineExpired,
  last,
}) {
  let reasonText = `after ${attempt} attempts`;
  if (aborted) {
    reasonText = `aborted after ${attempt} attempts`;
  } else if (deadlineExpired) {
    reasonText = `before ${deadlineMs}ms formation deadline after ${attempt} attempts`;
  }
  const diagnostic = {
    component,
    attempts: attempt,
    attempt,
    maxAttempts,
    elapsedMs,
    deadlineMs,
    deadlineAtMs,
    aborted: Boolean(aborted),
    deadlineExpired: Boolean(deadlineExpired),
    last,
    lastObservation: last,
  };
  const failure = deploymentFailure(
    DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
    `${component} did not report ready ${reasonText}`,
    diagnostic,
  );
  failure.attempt = attempt;
  failure.attempts = attempt;
  failure.elapsedMs = elapsedMs;
  failure.deadlineMs = deadlineMs;
  failure.aborted = Boolean(aborted);
  failure.deadlineExpired = Boolean(deadlineExpired);
  failure.lastObservation = last;
  return failure;
}

/**
 * @param {{component: string, probe: Function, attempts: number,
 *   intervalMs: number, sleep: Function, now?: Function, nowFn?: Function,
 *   stablePolls?: number, deadlineAtMs?: number|null, deadlineMs?: number|null,
 *   signal?: AbortSignal|null}} input
 *   probe answers {ready: boolean, diagnostic}
 * @return {Promise<{state: string, component: string, attempts: number,
 *   observedAt: string, evidence: *}>}
 */
async function pollReadiness({component, probe, attempts, intervalMs, sleep,
  now = dateNow, nowFn, stablePolls = 1, deadlineAtMs = null, deadlineMs = null,
  signal = null}) {
  if (!numberIsInteger(attempts) || attempts < 1) {
    throw new Error(`readiness for ${component} needs a positive attempt budget`);
  }
  const clock = resolveClock(now, nowFn);
  const startedAt = clock();
  const finiteDeadlineAtMs = numberIsFinite(deadlineAtMs) ? deadlineAtMs : null;
  const effectiveDeadlineMs = numberIsFinite(deadlineMs) ? deadlineMs :
    (finiteDeadlineAtMs !== null ? Math.max(0, finiteDeadlineAtMs - startedAt) : null);
  let last = null;
  let consecutive = 0;
  let completedAttempts = 0;
  const throwExhausted = ({aborted = false, deadlineExpired = false} = {}) => {
    throw buildReadinessExhaustedFailure({
      component,
      attempt: completedAttempts,
      maxAttempts: attempts,
      elapsedMs: clock() - startedAt,
      deadlineMs: effectiveDeadlineMs,
      deadlineAtMs: finiteDeadlineAtMs,
      aborted,
      deadlineExpired,
      last,
    });
  };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (isAborted(signal)) throwExhausted({aborted: true});
    const preProbeRemainingMs = deadlineRemainingMs({
      nowFn: clock,
      deadlineAtMs: finiteDeadlineAtMs,
    });
    if (preProbeRemainingMs !== null && preProbeRemainingMs <= 0) {
      throwExhausted({deadlineExpired: true});
    }
    const outcome = await probeOnce(component, probe, {
      attempt,
      signal,
      remainingMs: preProbeRemainingMs,
      deadlineAtMs: finiteDeadlineAtMs,
    });
    completedAttempts = attempt;
    last = outcome.diagnostic;
    if (isAborted(signal)) throwExhausted({aborted: true});
    const postProbeRemainingMs = deadlineRemainingMs({
      nowFn: clock,
      deadlineAtMs: finiteDeadlineAtMs,
    });
    if (postProbeRemainingMs !== null && postProbeRemainingMs <= 0) {
      throwExhausted({deadlineExpired: true});
    }
    consecutive = outcome.ready ? consecutive + 1 : 0;
    if (consecutive >= stablePolls) {
      const readyAt = clock();
      return {state: READINESS_STATE.READY, component, attempts: attempt, stablePolls,
        observedAt: dateToISOString(new DateConstructor(readyAt)),
        timeToReadyMs: readyAt - startedAt, evidence: last};
    }
    if (attempt < attempts) {
      const remainingMs = postProbeRemainingMs !== null ?
        Math.max(0, postProbeRemainingMs) : intervalMs;
      const sleepMs = Math.max(0, Math.min(intervalMs, remainingMs));
      await sleepUntilOrAbort(sleep, sleepMs, signal);
      if (isAborted(signal)) throwExhausted({aborted: true});
      const postSleepRemainingMs = deadlineRemainingMs({
        nowFn: clock,
        deadlineAtMs: finiteDeadlineAtMs,
      });
      if (postSleepRemainingMs !== null && postSleepRemainingMs <= 0) {
        throwExhausted({deadlineExpired: true});
      }
    }
  }
  return throwExhausted();
}

/**
 * Wrap a readiness owner that throws a plain Error on timeout (the TiDB
 * lifecycle and placement owners) into the typed exhaustion.
 */
async function typedReadiness(component, run) {
  try {
    return await run();
  } catch (error) {
    if (error?.code) throw error;
    const aborted = Boolean(error?.aborted);
    const deadlineExpired = Boolean(error?.deadlineExpired);
    const failure = deploymentFailure(DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
      `${component} readiness failed: ${errorText(error)}`,
      {
        component,
        aborted,
        deadlineExpired,
        last: {error: errorText(error)},
        lastObservation: {error: errorText(error)},
      });
    failure.aborted = aborted;
    failure.deadlineExpired = deadlineExpired;
    failure.lastObservation = {error: errorText(error)};
    throw failure;
  }
}

export {pollReadiness, typedReadiness};
