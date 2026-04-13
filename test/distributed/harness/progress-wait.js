const ZERO = 0;
const ONE = 1;
const DEFAULT_POLL_INTERVAL_MS = 1000;

function normalizePositiveInteger(value, fallback = ZERO) {
  return Number.isFinite(value) && value > ZERO ?
    Math.floor(value) :
    fallback;
}

function normalizeProgressToken(token) {
  if (token === null || token === undefined) {
    return null;
  }
  if (typeof token === 'string') {
    return token;
  }
  if (typeof token === 'number' || typeof token === 'boolean') {
    return String(token);
  }
  try {
    return JSON.stringify(token);
  } catch (_error) {
    return String(token);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForProgressOrStall(options = {}) {
  if (typeof options.probe !== 'function') {
    throw new Error('waitForProgressOrStall requires probe function');
  }

  const now = typeof options.now === 'function' ?
    options.now :
    Date.now;
  const sleepFn = typeof options.sleep === 'function' ?
    options.sleep :
    sleep;
  const timeoutMs = normalizePositiveInteger(options.timeoutMs);
  const pollIntervalMs = Math.max(
    ONE,
    normalizePositiveInteger(
      options.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
    ),
  );
  const noProgressTimeoutMs = Math.max(
    ONE,
    Math.min(
      timeoutMs,
      normalizePositiveInteger(options.noProgressTimeoutMs, timeoutMs),
    ),
  );
  const startedAtMs = now();
  const deadlineMs = startedAtMs + timeoutMs;

  let attemptCount = ZERO;
  let sampleCount = ZERO;
  let transientProbeErrors = ZERO;
  let lastError = null;
  let lastSnapshot = null;
  let lastProgressToken = null;
  let lastProgressAtMs = startedAtMs;

  const resolveNoProgressTimeoutMs = (reason) => {
    if (typeof options.getNoProgressTimeoutMs !== 'function') {
      return noProgressTimeoutMs;
    }
    const resolved = normalizePositiveInteger(
      options.getNoProgressTimeoutMs({
        reason,
        startedAtMs,
        deadlineMs,
        attemptCount,
        sampleCount,
        transientProbeErrors,
        lastError,
        lastSnapshot,
        lastProgressToken,
        lastProgressAtMs,
      }),
      noProgressTimeoutMs,
    );
    return Math.max(
      ONE,
      Math.min(timeoutMs, resolved),
    );
  };

  const buildContext = (reason) => {
    const nowMs = now();
    const effectiveNoProgressTimeoutMs = resolveNoProgressTimeoutMs(reason);
    return {
      reason,
      startedAtMs,
      deadlineMs,
      nowMs,
      elapsedMs: Math.max(ZERO, nowMs - startedAtMs),
      attemptCount,
      sampleCount,
      transientProbeErrors,
      lastError,
      lastSnapshot,
      lastProgressToken,
      lastProgressAtMs,
      noProgressDurationMs: Math.max(ZERO, nowMs - lastProgressAtMs),
      noProgressTimeoutMs: effectiveNoProgressTimeoutMs,
    };
  };

  while (now() <= deadlineMs) {
    attemptCount += ONE;
    let delayMs = pollIntervalMs;

    try {
      const snapshot = await options.probe();
      sampleCount += ONE;
      lastSnapshot = snapshot;
      lastError = null;

      const progressToken = normalizeProgressToken(
        typeof options.getProgressToken === 'function' ?
          options.getProgressToken(snapshot) :
          snapshot,
      );
      if ((sampleCount === ONE && progressToken !== null) ||
          (progressToken !== null && progressToken !== lastProgressToken)) {
        lastProgressToken = progressToken;
        lastProgressAtMs = now();
      }

      if (typeof options.isSuccess === 'function' &&
          options.isSuccess(snapshot) === true) {
        return buildContext('success');
      }

      if (typeof options.getDelayMs === 'function') {
        delayMs = normalizePositiveInteger(
          options.getDelayMs(buildContext('pending')),
          pollIntervalMs,
        );
      }
    } catch (error) {
      lastError = error;
      if (typeof options.isRetryableError === 'function' &&
          options.isRetryableError(error) !== true) {
        throw error;
      }
      transientProbeErrors += ONE;
      if (typeof options.getDelayMs === 'function') {
        delayMs = normalizePositiveInteger(
          options.getDelayMs(buildContext('retrying')),
          pollIntervalMs,
        );
      }
    }

    const stalledContext = buildContext('no_progress');
    if (stalledContext.noProgressDurationMs >=
      stalledContext.noProgressTimeoutMs) {
      const stalledError = typeof options.buildError === 'function' ?
        options.buildError(stalledContext) :
        new Error('waitForProgressOrStall aborted due to stalled progress');
      if (stalledError && typeof stalledError === 'object') {
        stalledError.progressWait = stalledContext;
      }
      throw stalledError;
    }

    if (now() >= deadlineMs) {
      break;
    }
    await sleepFn(
      Math.max(
        ONE,
        Math.min(delayMs, deadlineMs - now()),
      ),
    );
  }

  const timeoutContext = buildContext('timeout');
  const timeoutError = typeof options.buildError === 'function' ?
    options.buildError(timeoutContext) :
    new Error('waitForProgressOrStall timed out');
  if (timeoutError && typeof timeoutError === 'object') {
    timeoutError.progressWait = timeoutContext;
  }
  throw timeoutError;
}

export {
  waitForProgressOrStall,
};
