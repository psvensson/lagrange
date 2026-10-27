import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  NUM,
  TIME_MS,
} from '../../constants/index.js';
import {reportWaitBoundSpent} from '../../logging/wait-bound-spent.js';
import {
  mintControlPlaneWriteKey,
  releaseControlPlaneWriteIdentity,
} from '../../control-plane/control-plane-write-identity.js';

const DEFAULT_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.THIRTY; // ends-on: the control-plane write is accepted (non-retryable result)
const RETRYABLE_CONTROL_PLANE_WRITE_WAIT = Object.freeze({
  wait: 'runRetryableControlPlaneWrite.timeoutMs',
  awaited: 'retryable control-plane write accepted',
});
const DEFAULT_RETRY_BASE_DELAY_MS = NUM.HUNDRED;
const DEFAULT_RETRY_MAX_DELAY_MS = TIME_MS.SECOND;

async function defaultSleep(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Report a retryable write whose retry deadline is spent. The caller names
 * its write through `options.spentWait` / `options.scope` / `options.logger`.
 * @param {Object|Error} resultOrError - The last failed result or error.
 * @param {Object} spent - {options, attempt, timeoutMs, elapsedMs}.
 */
function reportControlPlaneWriteSpent(resultOrError, spent) {
  const options = spent.options;
  reportWaitBoundSpent(options.logger || null, {
    ...(options.spentWait || RETRYABLE_CONTROL_PLANE_WRITE_WAIT),
    boundMs: spent.timeoutMs,
    elapsedMs: spent.elapsedMs,
    lastObserved: () => ({
      attempts: spent.attempt,
      lastErrorCode: resultOrError?.code ?? resultOrError?.errorCode ?? null,
      lastError: resultOrError?.message ?? resultOrError?.error ?? null,
      retryAfterMs: getControlPlaneRetryAfterMs(resultOrError),
    }),
    scope: options.scope,
  });
}

function shouldRetryControlPlaneWrite(
  resultOrError,
  deadlineMs,
  now,
  spent,
) {
  if (!isRetryableControlPlaneError(resultOrError)) {
    return false;
  }
  const nowMs = now();
  if (nowMs < deadlineMs) {
    return true;
  }
  reportControlPlaneWriteSpent(resultOrError, {
    ...spent,
    elapsedMs: nowMs - (deadlineMs - spent.timeoutMs),
  });
  return false;
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


// Every attempt is the same logical write. A caller-owned identity wins;
// otherwise this retry owner mints one identity and releases it when the loop
// terminates, so an ambiguous attempt can never become a second apply.
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
        if (result?.success !== false) {
          return result;
        }
        if (!shouldRetryControlPlaneWrite(result, deadlineMs, now, {
          options,
          attempt,
          timeoutMs,
        })) {
          return result;
        }
        resultOrError = result;
      } catch (error) {
        if (!shouldRetryControlPlaneWrite(error, deadlineMs, now, {
          options,
          attempt,
          timeoutMs,
        })) {
          throw error;
        }
        resultOrError = error;
      }
      nextDelayMs = await delayRetryableControlPlaneWrite(
        deadlineMs,
        nextDelayMs,
        resultOrError,
        {...retryOptions, attempt},
      );
    }
  } finally {
    loopIdentity.release();
  }
}

export {
  runRetryableControlPlaneWrite,
};
