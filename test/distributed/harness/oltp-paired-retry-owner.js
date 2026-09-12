const ZERO = 0;
const ONE = 1;
const TWO = 2;

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;
const SERIALIZATION_FAILURE_SQLSTATE = '40001';
const RETRY_OUTCOME = Object.freeze({
  SERIALIZATION_CONFLICT: 'serialization_conflict',
  TERMINAL_FAILURE: 'terminal_failure',
});

const OLTP_PAIRED_RETRY_POLICY = Object.freeze({
  id: 'scenario-a-retry-v1',
  maxRetries: 3,
  baseDelayMs: 5,
  maxDelayMs: 20,
  retryableSqlStates: Object.freeze([SERIALIZATION_FAILURE_SQLSTATE]),
  ambiguousCommitIsFailure: true,
  adapterRetriesAllowed: false,
});

function normalizeSqlState(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase();
  return SQLSTATE_PATTERN.test(normalized) ? normalized : null;
}

function resolveSqlState(error) {
  for (const value of [error?.sqlState, error?.sqlstate, error?.code]) {
    const sqlState = normalizeSqlState(value);
    if (sqlState) return sqlState;
  }
  return null;
}

function classifyOltpAttemptError(
  error,
  policy = OLTP_PAIRED_RETRY_POLICY,
) {
  const sqlState = resolveSqlState(error);
  if (policy.retryableSqlStates.includes(sqlState)) {
    return Object.freeze({
      retryable: true,
      outcome: RETRY_OUTCOME.SERIALIZATION_CONFLICT,
      sqlState,
    });
  }
  return Object.freeze({
    retryable: false,
    outcome: RETRY_OUTCOME.TERMINAL_FAILURE,
    sqlState,
  });
}

function retryDelayMs(retryNumber, policy = OLTP_PAIRED_RETRY_POLICY) {
  if (!Number.isInteger(retryNumber) || retryNumber < ONE) {
    throw new Error('OLTP paired retry delay requires retryNumber >= 1');
  }
  const exponent = retryNumber - ONE;
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * TWO ** exponent);
}

function validatePolicy(policy) {
  if (!Number.isInteger(policy?.maxRetries) || policy.maxRetries < ZERO) {
    throw new Error('OLTP paired retry owner requires non-negative maxRetries');
  }
  if (!Number.isFinite(policy?.baseDelayMs) || policy.baseDelayMs < ZERO) {
    throw new Error('OLTP paired retry owner requires non-negative baseDelayMs');
  }
  if (!Number.isFinite(policy?.maxDelayMs) ||
      policy.maxDelayMs < policy.baseDelayMs) {
    throw new Error('OLTP paired retry owner requires maxDelayMs >= baseDelayMs');
  }
  if (!Array.isArray(policy?.retryableSqlStates) ||
      policy.retryableSqlStates.some((value) => !normalizeSqlState(value))) {
    throw new Error('OLTP paired retry owner requires valid retryable SQLSTATEs');
  }
}

async function defaultSleep(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function createEvidence(options) {
  return Object.freeze({
    policyId: options.policy.id,
    attempts: options.attempts,
    retries: options.retries,
    retryDelayMs: options.retryDelayMs,
    failures: Object.freeze(options.failures.map((failure) =>
      Object.freeze({...failure}))),
    intendedIssueTimeMs: options.intendedIssueTimeMs,
    completedAtMs: options.completedAtMs,
    requestClockElapsedMs:
      options.completedAtMs - options.intendedIssueTimeMs,
  });
}

function createTerminalError(cause, evidence) {
  const error = new Error(
    cause?.message || 'OLTP paired transaction failed',
    {cause},
  );
  error.name = 'OltpPairedTransactionError';
  error.sqlState = resolveSqlState(cause);
  error.oltpRetryEvidence = evidence;
  return error;
}

async function executePairedOltpTransactionWithRetry(options = {}) {
  if (typeof options.executeAttempt !== 'function') {
    throw new Error('OLTP paired retry owner requires executeAttempt');
  }
  const policy = options.policy || OLTP_PAIRED_RETRY_POLICY;
  validatePolicy(policy);
  const sleep = options.sleep || defaultSleep;
  const now = options.now || Date.now;
  const firstObservedNow = now();
  const intendedIssueTimeMs = options.intendedIssueTimeMs ?? firstObservedNow;
  if (!Number.isFinite(intendedIssueTimeMs) ||
      intendedIssueTimeMs > firstObservedNow) {
    throw new Error(
      'OLTP paired retry owner requires intendedIssueTimeMs <= current time',
    );
  }

  let attempts = ZERO;
  let retries = ZERO;
  let totalRetryDelayMs = ZERO;
  const failures = [];

  while (true) {
    attempts += ONE;
    try {
      const result = await options.executeAttempt({attempts, retries});
      const evidence = createEvidence({
        policy,
        attempts,
        retries,
        retryDelayMs: totalRetryDelayMs,
        failures,
        intendedIssueTimeMs,
        completedAtMs: now(),
      });
      return Object.freeze({result, evidence});
    } catch (cause) {
      const classification = classifyOltpAttemptError(cause, policy);
      failures.push({
        attempt: attempts,
        retryable: classification.retryable,
        outcome: classification.outcome,
        sqlState: classification.sqlState,
      });
      if (!classification.retryable || retries >= policy.maxRetries) {
        const evidence = createEvidence({
          policy,
          attempts,
          retries,
          retryDelayMs: totalRetryDelayMs,
          failures,
          intendedIssueTimeMs,
          completedAtMs: now(),
        });
        throw createTerminalError(cause, evidence);
      }

      retries += ONE;
      const delayMs = retryDelayMs(retries, policy);
      totalRetryDelayMs += delayMs;
      if (typeof options.onRetry === 'function') {
        options.onRetry(Object.freeze({
          attempt: attempts,
          retry: retries,
          delayMs,
          sqlState: classification.sqlState,
          outcome: classification.outcome,
        }));
      }
      if (delayMs > ZERO) await sleep(delayMs);
    }
  }
}

function createRetryAccumulator(policy) {
  return {
    policyId: policy.id,
    logicalTransactions: ZERO,
    attempts: ZERO,
    retries: ZERO,
    retryDelayMs: ZERO,
    serializationConflicts: ZERO,
    terminalTransactions: ZERO,
  };
}

function accumulateEvidence(accumulator, evidence, terminal) {
  accumulator.logicalTransactions += ONE;
  accumulator.attempts += evidence.attempts;
  accumulator.retries += evidence.retries;
  accumulator.retryDelayMs += evidence.retryDelayMs;
  accumulator.serializationConflicts += evidence.failures.filter(
    ({outcome}) => outcome === RETRY_OUTCOME.SERIALIZATION_CONFLICT,
  ).length;
  if (terminal) accumulator.terminalTransactions += ONE;
}

function freezeAccumulator(accumulator) {
  return Object.freeze({...accumulator});
}

function createPairedRetryingOltpAdapter(adapter, options = {}) {
  if (!adapter || typeof adapter.executeTransaction !== 'function') {
    throw new Error(
      'OLTP paired retry adapter requires adapter.executeTransaction',
    );
  }
  const policy = options.policy || OLTP_PAIRED_RETRY_POLICY;
  validatePolicy(policy);
  const now = options.now || Date.now;
  const accumulator = createRetryAccumulator(policy);

  return Object.freeze({
    async executeTransaction(operation) {
      const intendedIssueTimeMs = now();
      try {
        const outcome = await executePairedOltpTransactionWithRetry({
          policy,
          now,
          intendedIssueTimeMs,
          ...(options.sleep ? {sleep: options.sleep} : {}),
          ...(options.onRetry ? {onRetry: options.onRetry} : {}),
          executeAttempt: () => adapter.executeTransaction(operation),
        });
        accumulateEvidence(accumulator, outcome.evidence, false);
        return outcome.result;
      } catch (error) {
        if (error?.oltpRetryEvidence) {
          accumulateEvidence(accumulator, error.oltpRetryEvidence, true);
        }
        throw error;
      }
    },
    getRetryEvidence() {
      return freezeAccumulator(accumulator);
    },
  });
}

export {
  OLTP_PAIRED_RETRY_POLICY,
  RETRY_OUTCOME as OLTP_PAIRED_RETRY_OUTCOME,
  SERIALIZATION_FAILURE_SQLSTATE as OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
  createPairedRetryingOltpAdapter,
  executePairedOltpTransactionWithRetry,
  retryDelayMs as resolvePairedOltpRetryDelayMs,
  resolveSqlState as resolveOltpSqlState,
};
