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
  attachRemoteCommandAttribution,
  deploymentFailure,
  isDeploymentFailure,
} from './real-product-deployment-contract.js';
import {classifyRemoteCommandError, errorText} from './real-product-remote-shell.js';

function isIncompleteProbeOutcome(outcome) {
  if (!outcome || outcome.probeFailed === true) return true;
  const diagnostic = outcome.diagnostic;
  if (!diagnostic || typeof diagnostic !== 'object') return false;
  return Boolean(
    diagnostic.aborted === true ||
    diagnostic.deadlineExpired === true ||
    diagnostic.transportError === true ||
    diagnostic.observerInfrastructure === true ||
    Boolean(diagnostic.parseError) ||
    (diagnostic.status === null && Boolean(diagnostic.error)),
  );
}

// One readiness attempt: the probe's verdict {ready, diagnostic}, or, when the
// probe throws, a not-ready attempt whose diagnostic preserves classification.
// An answer outside that contract is a harness defect and is raised.
async function probeOnce(component, probe, probeContext) {
  let outcome;
  try {
    outcome = await probe(probeContext);
  } catch (error) {
    if (error?.terminal === true) throw error;
    const classified = classifyRemoteCommandError(error);
    return {
      ready: false,
      probeFailed: true,
      diagnostic: {
        error: classified.message,
        exitCode: classified.exitCode,
        aborted: classified.aborted,
        deadlineExpired: classified.deadlineExpired,
        timedOut: classified.timedOut,
        ...(classified.httpTimedOut ? {httpTimedOut: true} : {}),
        transportError: classified.transportError,
        observerInfrastructure: classified.observerInfrastructure,
        ...(error?.parseError ? {
          parseError: error.parseError === true ? classified.message : String(error.parseError),
        } : {}),
      },
    };
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

function computeObserverInfrastructureAttribution({
  aborted,
  maxAttempts,
  stablePolls,
  everHadNegativeProduct,
  hasReadySinceNegativeProduct,
  firstReadyAttemptSinceNegativeProduct,
  observerInfraSinceNegativeProduct,
}) {
  if (aborted || observerInfraSinceNegativeProduct <= 0) {
    return false;
  }
  const windowReachableWithoutObserverFailure = !everHadNegativeProduct ?
    maxAttempts >= stablePolls :
    (hasReadySinceNegativeProduct &&
      firstReadyAttemptSinceNegativeProduct !== null &&
      (maxAttempts - firstReadyAttemptSinceNegativeProduct + 1) >= stablePolls);
  return Boolean(windowReachableWithoutObserverFailure);
}

function buildReadinessExhaustedFailure({
  component,
  attempt,
  completedAttempts,
  readyAttempts,
  deniedAttempts,
  productProbeFailureAttempts,
  observerInfraAttempts,
  maxAttempts,
  stablePolls,
  elapsedMs,
  deadlineMs,
  deadlineAtMs,
  aborted,
  deadlineExpired,
  lastCompletedReady,
  lastDeniedObservation,
  lastCompletedObservation,
  lastProbeError,
  lastObserverInfraError,
  everHadNegativeProduct,
  hasReadySinceNegativeProduct,
  firstReadyAttemptSinceNegativeProduct,
  observerInfraSinceNegativeProduct,
}) {
  const preferProbeError = lastCompletedReady === true && lastProbeError !== null;
  const effectiveLast = preferProbeError ?
    lastProbeError :
    (lastCompletedObservation !== null ? lastCompletedObservation : lastProbeError);
  const observerInfrastructure = computeObserverInfrastructureAttribution({
    aborted,
    maxAttempts,
    stablePolls,
    everHadNegativeProduct,
    hasReadySinceNegativeProduct,
    firstReadyAttemptSinceNegativeProduct,
    observerInfraSinceNegativeProduct,
  });
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
    completedAttempts,
    readyAttempts,
    deniedAttempts,
    productProbeFailureAttempts,
    observerInfraAttempts,
    maxAttempts,
    stablePolls,
    elapsedMs,
    deadlineMs,
    deadlineAtMs,
    aborted: Boolean(aborted),
    deadlineExpired: Boolean(deadlineExpired),
    observerInfrastructure,
    lastCompletedReady,
    lastDeniedObservation,
    last: effectiveLast,
    lastObservation: effectiveLast,
    lastCompletedObservation,
    lastProbeError,
    lastObserverInfraError,
  };
  const failure = deploymentFailure(
    DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
    `${component} did not report ready ${reasonText}`,
    diagnostic,
  );
  failure.attempt = attempt;
  failure.attempts = attempt;
  failure.completedAttempts = completedAttempts;
  failure.readyAttempts = readyAttempts;
  failure.deniedAttempts = deniedAttempts;
  failure.productProbeFailureAttempts = productProbeFailureAttempts;
  failure.observerInfraAttempts = observerInfraAttempts;
  failure.elapsedMs = elapsedMs;
  failure.deadlineMs = deadlineMs;
  failure.aborted = Boolean(aborted);
  failure.deadlineExpired = Boolean(deadlineExpired);
  failure.observerInfrastructure = observerInfrastructure;
  failure.lastCompletedReady = lastCompletedReady;
  failure.lastDeniedObservation = lastDeniedObservation;
  failure.lastObservation = effectiveLast;
  failure.lastCompletedObservation = lastCompletedObservation;
  failure.lastProbeError = lastProbeError;
  failure.lastObserverInfraError = lastObserverInfraError;
  return failure;
}

function createPollAttributionState() {
  return {
    lastCompletedObservation: null,
    lastCompletedReady: null,
    lastDeniedObservation: null,
    lastProbeError: null,
    lastObserverInfraError: null,
    consecutive: 0,
    attemptedPolls: 0,
    completedAttempts: 0,
    readyAttempts: 0,
    deniedAttempts: 0,
    productProbeFailureAttempts: 0,
    observerInfraAttempts: 0,
    everHadNegativeProduct: false,
    hasReadySinceNegativeProduct: false,
    firstReadyAttemptSinceNegativeProduct: null,
    observerInfraSinceNegativeProduct: 0,
  };
}

function recordNegativeProductSignal(state) {
  state.everHadNegativeProduct = true;
  state.hasReadySinceNegativeProduct = false;
  state.firstReadyAttemptSinceNegativeProduct = null;
  state.observerInfraSinceNegativeProduct = 0;
}

function recordIncompleteProbeAttempt(state, outcome, attempt) {
  const diag = outcome.diagnostic && typeof outcome.diagnostic === 'object' ?
    outcome.diagnostic : {error: errorText(outcome.diagnostic)};
  state.lastProbeError = {...diag, attempt};
  state.consecutive = 0;
  if (diag.aborted === true || diag.deadlineExpired === true) return;
  if (diag.observerInfrastructure === true) {
    state.observerInfraAttempts += 1;
    state.observerInfraSinceNegativeProduct += 1;
    state.lastObserverInfraError = state.lastProbeError;
    return;
  }
  state.productProbeFailureAttempts += 1;
  recordNegativeProductSignal(state);
}

function recordCompletedProbeAttempt(state, outcome, attempt) {
  state.completedAttempts += 1;
  state.lastCompletedObservation = outcome.diagnostic;
  if (outcome.ready) {
    state.readyAttempts += 1;
    state.lastCompletedReady = true;
    state.consecutive += 1;
    if (!state.hasReadySinceNegativeProduct) {
      state.hasReadySinceNegativeProduct = true;
      state.firstReadyAttemptSinceNegativeProduct = attempt;
    }
    return;
  }
  state.deniedAttempts += 1;
  state.lastCompletedReady = false;
  state.lastDeniedObservation = outcome.diagnostic;
  state.consecutive = 0;
  recordNegativeProductSignal(state);
}

function checkPollCutoff({signal, clock, finiteDeadlineAtMs, throwExhausted}) {
  if (isAborted(signal)) throwExhausted({aborted: true});
  const remainingMs = deadlineRemainingMs({nowFn: clock, deadlineAtMs: finiteDeadlineAtMs});
  if (remainingMs !== null && remainingMs <= 0) {
    throwExhausted({deadlineExpired: true});
  }
  return remainingMs;
}

function resolveEffectiveDeadlineMs(deadlineMs, finiteDeadlineAtMs, startedAt) {
  if (numberIsFinite(deadlineMs)) return deadlineMs;
  if (finiteDeadlineAtMs !== null) return Math.max(0, finiteDeadlineAtMs - startedAt);
  return null;
}

function applyProbeOutcomeToState(state, outcome, attempt) {
  state.attemptedPolls = attempt;
  if (outcome.deferredObservation === true) {
    state.consecutive = 0;
    return;
  }
  if (isIncompleteProbeOutcome(outcome)) {
    recordIncompleteProbeAttempt(state, outcome, attempt);
  } else {
    recordCompletedProbeAttempt(state, outcome, attempt);
  }
}

function assertPositiveAttemptBudget(component, attempts) {
  if (!numberIsInteger(attempts) || attempts < 1) {
    throw new Error(`readiness for ${component} needs a positive attempt budget`);
  }
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
async function pollReadiness(input) {
  const {component, probe, attempts, intervalMs, sleep, now = dateNow, nowFn,
    stablePolls = 1, deadlineAtMs = null, deadlineMs = null, signal = null} = input;
  assertPositiveAttemptBudget(component, attempts);
  const clock = resolveClock(now, nowFn);
  const startedAt = clock();
  const finiteDeadlineAtMs = numberIsFinite(deadlineAtMs) ? deadlineAtMs : null;
  const effectiveDeadlineMs = resolveEffectiveDeadlineMs(deadlineMs, finiteDeadlineAtMs, startedAt);
  const state = createPollAttributionState();
  const throwExhausted = ({aborted = false, deadlineExpired = false} = {}) => {
    throw buildReadinessExhaustedFailure({
      ...state, component, attempt: state.attemptedPolls, maxAttempts: attempts,
      stablePolls, elapsedMs: clock() - startedAt, deadlineMs: effectiveDeadlineMs,
      deadlineAtMs: finiteDeadlineAtMs, aborted, deadlineExpired,
    });
  };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const preProbeRemainingMs = checkPollCutoff({
      signal, clock, finiteDeadlineAtMs, throwExhausted,
    });
    const outcome = await probeOnce(component, probe, {
      attempt, signal, remainingMs: preProbeRemainingMs, deadlineAtMs: finiteDeadlineAtMs,
    });
    applyProbeOutcomeToState(state, outcome, attempt);
    const postProbeRemainingMs = checkPollCutoff({
      signal, clock, finiteDeadlineAtMs, throwExhausted,
    });
    if (state.consecutive >= stablePolls) {
      const readyAt = clock();
      return {state: READINESS_STATE.READY, component, attempts: attempt, stablePolls,
        observedAt: dateToISOString(new DateConstructor(readyAt)),
        timeToReadyMs: readyAt - startedAt, evidence: state.lastCompletedObservation};
    }
    if (attempt < attempts) {
      const remainingMs = postProbeRemainingMs ?? intervalMs;
      await sleepUntilOrAbort(sleep, Math.max(0, Math.min(intervalMs, remainingMs)), signal);
      checkPollCutoff({signal, clock, finiteDeadlineAtMs, throwExhausted});
    }
  }
  return throwExhausted();
}

function resolveTypedObserverInfrastructure(error, classified, aborted, deadlineExpired) {
  if (aborted || error?.hadProductDenial === true) return false;
  if (typeof error?.observerInfrastructure === 'boolean') {
    return error.observerInfrastructure;
  }
  return Boolean(!deadlineExpired && classified.observerInfrastructure);
}

function buildTypedProbeError(error, classified, {aborted, deadlineExpired,
  timedOut, observerInfrastructure}) {
  return {
    error: classified.message,
    exitCode: classified.exitCode,
    aborted,
    deadlineExpired,
    timedOut,
    transportError: Boolean(error?.transportError || classified.transportError),
    observerInfrastructure,
    ...(error?.lastResult !== undefined ? {lastResult: error.lastResult} : {}),
    ...(error?.lastError !== undefined ? {lastError: error.lastError} : {}),
  };
}

function resolveTypedFailureFlags(error, classified) {
  const errObj = error ?? {};
  const aborted = Boolean(errObj.aborted || classified.aborted);
  const deadlineExpired = Boolean(errObj.deadlineExpired || classified.deadlineExpired);
  const timedOut = !aborted && Boolean(errObj.timedOut || classified.timedOut);
  const observerInfrastructure = resolveTypedObserverInfrastructure(
    error, classified, aborted, deadlineExpired,
  );
  return {aborted, deadlineExpired, timedOut, observerInfrastructure};
}

function buildTypedReadinessFailure(component, error) {
  const classified = classifyRemoteCommandError(error);
  const flags = resolveTypedFailureFlags(error, classified);
  const lastCompletedObservation = error?.lastEvaluation ?? null;
  const lastProbeError = buildTypedProbeError(error, classified, flags);
  const effectiveLast = lastCompletedObservation ?? lastProbeError;
  const failure = deploymentFailure(DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
    `${component} readiness failed: ${classified.message}`,
    {component, ...flags,
      last: effectiveLast, lastObservation: effectiveLast,
      lastCompletedObservation, lastProbeError});
  attachRemoteCommandAttribution(failure, classified, error);
  return Object.assign(failure, {
    ...flags,
    lastObservation: effectiveLast,
    lastCompletedObservation,
    lastProbeError,
  });
}

/**
 * Wrap a readiness owner that throws a plain Error on timeout (the TiDB
 * lifecycle and placement owners) into the typed exhaustion.
 */
async function typedReadiness(component, run) {
  try {
    return await run();
  } catch (error) {
    if (isDeploymentFailure(error)) throw error;
    throw buildTypedReadinessFailure(component, error);
  }
}

export {pollReadiness, typedReadiness};
