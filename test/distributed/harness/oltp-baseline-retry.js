const ZERO = 0;
const ONE = 1;
const TWO = 2;

const OLTP_SERIALIZATION_SQLSTATE = '40001';
const OLTP_TRANSACTION_RETRY_POLICY = Object.freeze({
  maxRetries: 3,
  baseDelayMs: 5,
  maxDelayMs: 20,
  retryableSqlStates: Object.freeze([OLTP_SERIALIZATION_SQLSTATE]),
});

function resolveSqlState(error) {
  for (const value of [error?.sqlState, error?.sqlstate, error?.code]) {
    if (typeof value === 'string' && value.length > ZERO) return value;
  }
  return null;
}

function isRetryableOltpTransactionError(error) {
  return OLTP_TRANSACTION_RETRY_POLICY.retryableSqlStates.includes(
    resolveSqlState(error),
  );
}

function retryDelayMs(retryNumber, policy = OLTP_TRANSACTION_RETRY_POLICY) {
  const exponent = Math.max(ZERO, retryNumber - ONE);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * TWO ** exponent);
}

async function defaultSleep(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function executeOltpTransactionWithRetry(options = {}) {
  if (typeof options.executeAttempt !== 'function') {
    throw new Error('OLTP retry owner requires executeAttempt');
  }
  const policy = options.policy || OLTP_TRANSACTION_RETRY_POLICY;
  if (!Number.isInteger(policy.maxRetries) || policy.maxRetries < ZERO) {
    throw new Error('OLTP retry owner requires non-negative maxRetries');
  }
  const sleep = options.sleep || defaultSleep;
  let retries = ZERO;
  let attempts = ZERO;

  while (true) {
    attempts += ONE;
    try {
      const result = await options.executeAttempt({attempts, retries});
      return {result, retries, attempts};
    } catch (error) {
      if (!isRetryableOltpTransactionError(error) || retries >= policy.maxRetries) {
        if (error && typeof error === 'object') {
          error.oltpRetry = {attempts, retries};
        }
        throw error;
      }
      retries += ONE;
      const delayMs = retryDelayMs(retries, policy);
      if (typeof options.onRetry === 'function') {
        options.onRetry({
          attempt: attempts,
          retry: retries,
          delayMs,
          sqlState: resolveSqlState(error),
        });
      }
      if (delayMs > ZERO) await sleep(delayMs);
    }
  }
}

export {
  OLTP_SERIALIZATION_SQLSTATE,
  OLTP_TRANSACTION_RETRY_POLICY,
  executeOltpTransactionWithRetry,
  isRetryableOltpTransactionError,
  retryDelayMs as resolveOltpRetryDelayMs,
};
