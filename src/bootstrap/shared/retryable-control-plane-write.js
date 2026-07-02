import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  NUM,
  TIME_MS,
} from '../../constants/index.js';

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

  while (true) {
    attempt += 1;
    try {
      const result = await executor();
      if (result?.success !== false) {
        return result;
      }
      if (!shouldRetryControlPlaneWrite(result, deadlineMs, now)) {
        return result;
      }
      nextDelayMs = await delayRetryableControlPlaneWrite(
        deadlineMs,
        nextDelayMs,
        result,
        {
          attempt,
          baseDelayMs,
          maxDelayMs,
          now,
          onRetry: options.onRetry,
          sleep,
        },
      );
      continue;
    } catch (error) {
      if (!shouldRetryControlPlaneWrite(error, deadlineMs, now)) {
        throw error;
      }
      nextDelayMs = await delayRetryableControlPlaneWrite(
        deadlineMs,
        nextDelayMs,
        error,
        {
          attempt,
          baseDelayMs,
          maxDelayMs,
          now,
          onRetry: options.onRetry,
          sleep,
        },
      );
    }
  }
}

export {
  runRetryableControlPlaneWrite,
};
