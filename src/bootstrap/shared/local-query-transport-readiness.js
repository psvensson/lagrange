import {NUM, TIME_MS} from '../../constants/index.js';
import {ROUTER_ERROR_MSG} from '../../constants/transport.js';

const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_READY = 'ready';
const LOCAL_STR_DEFERRED = 'deferred';
const LOCAL_STR_ROUTER_QUERY_TRANSPORT_NOT_READY = 'ROUTER_QUERY_TRANSPORT_NOT_READY';

const LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT = Object.freeze({
  MAX_ATTEMPTS: NUM.SIX,
  INITIAL_DELAY_MS: TIME_MS.SECOND,
  MAX_DELAY_MS: TIME_MS.SECOND * NUM.FIVE,
  BACKOFF_MULTIPLIER: 2,
});

function normalizePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function normalizeBackoffMultiplier(value) {
  return Number.isFinite(value) && value > 0 ?
    value :
    LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.BACKOFF_MULTIPLIER;
}

function normalizeLocalQueryTransportReadiness(rawReadiness) {
  if (!rawReadiness || typeof rawReadiness !== 'object') {
    return Object.freeze({
      ready: null,
      state: LOCAL_STR_UNKNOWN,
      reason: null,
      reasonCode: null,
      errorCode: null,
      retryAfterMs: null,
    });
  }

  const ready = typeof rawReadiness.ready === 'boolean' ?
    rawReadiness.ready :
    null;
  return Object.freeze({
    ready,
    state:
      typeof rawReadiness.state === 'string' &&
        rawReadiness.state.length > 0 ?
        rawReadiness.state :
        (
          ready === true ?
            LOCAL_STR_READY :
            ready === false ?
              LOCAL_STR_DEFERRED :
              LOCAL_STR_UNKNOWN
        ),
    reason:
      typeof rawReadiness.reason === 'string' &&
        rawReadiness.reason.length > 0 ?
        rawReadiness.reason :
        null,
    reasonCode:
      typeof rawReadiness.reasonCode === 'string' &&
        rawReadiness.reasonCode.length > 0 ?
        rawReadiness.reasonCode :
        null,
    errorCode:
      typeof rawReadiness.errorCode === 'string' &&
        rawReadiness.errorCode.length > 0 ?
        rawReadiness.errorCode :
        null,
    retryAfterMs:
      normalizePositiveInteger(rawReadiness.retryAfterMs, null),
  });
}

function getLocalQueryTransportReadiness(messageRouter) {
  if (!messageRouter ||
      typeof messageRouter.getQueryDataPlaneTransportReadiness !==
        'function') {
    return normalizeLocalQueryTransportReadiness(null);
  }
  return normalizeLocalQueryTransportReadiness(
    messageRouter.getQueryDataPlaneTransportReadiness(),
  );
}

function isLocalQueryTransportReady(readiness) {
  return readiness?.ready === true;
}

function buildLocalQueryTransportNotReadyError(readiness) {
  const error = new Error(
    readiness?.reason || ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
  );
  error.code = readiness?.errorCode || LOCAL_STR_ROUTER_QUERY_TRANSPORT_NOT_READY;
  error.retryAfterMs =
    normalizePositiveInteger(readiness?.retryAfterMs, 0);
  error.localQueryTransport = readiness || null;

  const progressContract = {
    owner: 'startup_readiness_owner',
    boundary: 'startup_support_evidence',
    state: 'readiness_retryable',
    reason: readiness?.reasonCode || 'local_query_transport_not_ready',
    nextAction: 'wait_for_local_query_transport',
    wakeSource: 'local_query_transport_event',
    retryAfterMs: error.retryAfterMs,
    terminalState: 'satisfied',
    evidencePath: 'startup_support_evidence',
    blockingDependency: 'local_query_transport',
  };
  error.progressContract = progressContract;
  if (readiness) {
    readiness.progressContract = progressContract;
  }

  return error;
}

async function waitForLocalQueryTransportReadiness(options = {}) {
  const readiness = getLocalQueryTransportReadiness(
    options.messageRouter || null,
  );
  if (isLocalQueryTransportReady(readiness)) {
    return readiness;
  }

  const maxAttempts = normalizePositiveInteger(
    options.maxAttempts,
    LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.MAX_ATTEMPTS,
  );
  const maxDelayMs = normalizePositiveInteger(
    options.maxDelayMs,
    LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.MAX_DELAY_MS,
  );
  let delayMs = normalizePositiveInteger(
    options.initialDelayMs,
    LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.INITIAL_DELAY_MS,
  );
  const backoffMultiplier = normalizeBackoffMultiplier(
    options.backoffMultiplier,
  );
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs));

  let lastReadiness = readiness;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastReadiness = getLocalQueryTransportReadiness(
      options.messageRouter || null,
    );
    if (isLocalQueryTransportReady(lastReadiness)) {
      return lastReadiness;
    }

    const hintedDelayMs = normalizePositiveInteger(
      lastReadiness.retryAfterMs,
      null,
    );
    const effectiveDelayMs = hintedDelayMs !== null ?
      Math.min(hintedDelayMs, maxDelayMs) :
      delayMs;
    if (attempt >= maxAttempts) {
      throw buildLocalQueryTransportNotReadyError({
        ...lastReadiness,
        retryAfterMs: effectiveDelayMs,
      });
    }

    if (typeof options.onRetry === 'function') {
      options.onRetry({
        attempt,
        maxAttempts,
        delayMs: effectiveDelayMs,
        readiness: lastReadiness,
      });
    }

    await sleep(effectiveDelayMs);
    delayMs = Math.min(
      Math.max(1, Math.floor(delayMs * backoffMultiplier)),
      maxDelayMs,
    );
  }

  throw buildLocalQueryTransportNotReadyError(lastReadiness);
}

export {
  LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT,
  buildLocalQueryTransportNotReadyError,
  getLocalQueryTransportReadiness,
  isLocalQueryTransportReady,
  waitForLocalQueryTransportReadiness,
};
