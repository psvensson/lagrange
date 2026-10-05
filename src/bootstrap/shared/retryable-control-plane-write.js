import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  NUM,
  TIME_MS,
} from '../../constants/index.js';
import {
  mintControlPlaneWriteKey,
  releaseControlPlaneWriteIdentity,
} from '../../control-plane/control-plane-write-identity.js';

const DEFAULT_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.THIRTY;
const DEFAULT_RETRY_BASE_DELAY_MS = NUM.HUNDRED;
const DEFAULT_RETRY_MAX_DELAY_MS = TIME_MS.SECOND;

async function defaultSleep(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function shouldRetryControlPlaneWrite(resultOrError, deadlineMs, now) {
  if (!isRetryableControlPlaneError(resultOrError)) {
    return false;
  }
  return now() < deadlineMs;
}

async function delayRetryableControlPlaneWrite(
  deadlineMs,
  nextDelayMs,
  resultOrError,
  options = {},
) {
  const now = options.now;
  const remainingMs = Math.max(0, deadlineMs - now());
  if (remainingMs <= 0) {
    return nextDelayMs;
  }

  const retryAfterMs = getControlPlaneRetryAfterMs(resultOrError);
  const baseDelayMs = options.baseDelayMs;
  const maxDelayMs = options.maxDelayMs;
  const boundedDelayMs = Math.min(
    remainingMs,
    Math.min(
      maxDelayMs,
      Math.max(
        baseDelayMs,
        retryAfterMs > 0 ? retryAfterMs : nextDelayMs,
      ),
    ),
  );

  if (typeof options.onRetry === 'function') {
    options.onRetry({
      attempt: options.attempt,
      delayMs: boundedDelayMs,
      remainingMs,
      retryAfterMs: retryAfterMs > 0 ? retryAfterMs : null,
      resultOrError,
    });
  }

  await options.sleep(boundedDelayMs);

  return Math.min(
    maxDelayMs,
    Math.max(
      baseDelayMs,
      nextDelayMs * 2,
    ),
  );
}

// Every attempt is the same logical write: the executor delivers each under
// one write identity (the caller's, or named here for this loop), so an
// attempt after an unknown outcome is the same entry, never a second apply.
// A name the loop minted dies with it: its instance is released when the
// loop ends, whatever the outcome (no later write can carry the name).
function loopWriteIdentity(options) {
  if (typeof options.writeIdentity === 'string' &&
    options.writeIdentity.length > 0) {
    return {identity: Object.freeze({writeIdentity: options.writeIdentity}),
      release: () => undefined};
  }
  const writeIdentity = mintControlPlaneWriteKey();
  return {identity: Object.freeze({writeIdentity}),
    release: () => releaseControlPlaneWriteIdentity(writeIdentity)};
}

async function runRetryableControlPlaneWrite(executor, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep =
    typeof options.sleep === 'function' ? options.sleep : defaultSleep;
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs >= 0 ?
    Math.floor(options.timeoutMs) :
    DEFAULT_RETRY_TIMEOUT_MS;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) &&
    options.baseDelayMs > 0 ?
    Math.floor(options.baseDelayMs) :
    DEFAULT_RETRY_BASE_DELAY_MS;
  const maxDelayMs = Number.isFinite(options.maxDelayMs) &&
    options.maxDelayMs > 0 ?
    Math.floor(options.maxDelayMs) :
    DEFAULT_RETRY_MAX_DELAY_MS;
  const deadlineMs = now() + timeoutMs;
  let nextDelayMs = baseDelayMs;
  let attempt = 0;
  const loopIdentity = loopWriteIdentity(options);
  const retryOptions = {baseDelayMs, maxDelayMs, now,
    onRetry: options.onRetry, sleep};

  try {
    while (true) {
      attempt += 1;
      let resultOrError;
      try {
        const result = await executor(loopIdentity.identity);
        if (result?.success !== false ||
          !shouldRetryControlPlaneWrite(result, deadlineMs, now)) {
          return result;
        }
        resultOrError = result;
      } catch (error) {
        if (!shouldRetryControlPlaneWrite(error, deadlineMs, now)) {
          throw error;
        }
        resultOrError = error;
      }
      nextDelayMs = await delayRetryableControlPlaneWrite(deadlineMs,
        nextDelayMs, resultOrError, {...retryOptions, attempt});
    }
  } finally {
    loopIdentity.release();
  }
}

export {
  runRetryableControlPlaneWrite,
};
