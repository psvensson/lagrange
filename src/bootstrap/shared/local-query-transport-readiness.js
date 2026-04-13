import {NUM, TIME_MS, TYPEOF} from '../../constants/index.js';
import {ROUTER_ERROR_MSG} from '../../constants/transport.js';

const LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT = Object.freeze({
  MAX_ATTEMPTS: NUM.SIX,
  INITIAL_DELAY_MS: TIME_MS.SECOND,
  MAX_DELAY_MS: TIME_MS.SECOND * NUM.FIVE,
  BACKOFF_MULTIPLIER: NUM.TWO,
});

function normalizePositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
}

function normalizeBackoffMultiplier(value) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    value :
    LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.BACKOFF_MULTIPLIER;
}

function normalizeLocalQueryTransportReadiness(rawReadiness) {
  if (!rawReadiness || typeof rawReadiness !== TYPEOF.OBJECT) {
    return Object.freeze({
      ready: null,
      state: 'unknown',
      reason: null,
      retryAfterMs: null,
    });
  }

  const ready = typeof rawReadiness.ready === 'boolean' ?
    rawReadiness.ready :
    null;
  return Object.freeze({
    ready,
    state:
      typeof rawReadiness.state === TYPEOF.STRING &&
        rawReadiness.state.length > NUM.ZERO ?
        rawReadiness.state :
        (
          ready === true ?
            'ready' :
            ready === false ?
              'deferred' :
              'unknown'
        ),
    reason:
      typeof rawReadiness.reason === TYPEOF.STRING &&
        rawReadiness.reason.length > NUM.ZERO ?
        rawReadiness.reason :
        null,
    retryAfterMs:
      normalizePositiveInteger(rawReadiness.retryAfterMs, null),
  });
}

function getLocalQueryTransportReadiness(messageRouter) {
  if (!messageRouter ||
      typeof messageRouter.getQueryDataPlaneTransportReadiness !==
        TYPEOF.FUNCTION) {
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
  error.code = 'ROUTER_QUERY_TRANSPORT_NOT_READY';
  error.retryAfterMs =
    normalizePositiveInteger(readiness?.retryAfterMs, NUM.ZERO);
  error.localQueryTransport = readiness || null;
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
  const sleep = typeof options.sleep === TYPEOF.FUNCTION ?
    options.sleep :
    (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs));

  let lastReadiness = readiness;
  for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt += NUM.ONE) {
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

    if (typeof options.onRetry === TYPEOF.FUNCTION) {
      options.onRetry({
        attempt,
        maxAttempts,
        delayMs: effectiveDelayMs,
        readiness: lastReadiness,
      });
    }

    await sleep(effectiveDelayMs);
    delayMs = Math.min(
      Math.max(NUM.ONE, Math.floor(delayMs * backoffMultiplier)),
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
