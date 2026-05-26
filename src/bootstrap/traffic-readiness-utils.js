import {NUM, TIME_MS, TYPEOF} from '../constants/index.js';
import {LIFECYCLE_EVENT, LIFECYCLE_PHASE} from './lifecycle-controller-constants.js';
import {LIFECYCLE_REASON} from './lifecycle-controller-constants.js';
import {
  isPriorityControlPlanePartition,
} from './system-partition-classification.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_J2SMD = 'BOOTSTRAP_TRAFFIC_NOT_READY';
const LOCAL_STR_1Y6VT = 'Lifecycle traffic readiness';
const LOCAL_STR_1LT6Z = 'Lifecycle metadata publication readiness';
const LOCAL_STR_GMYW4 = 'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY';

const METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS = Object.freeze([
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);

const TRAFFIC_READINESS_WAIT_DEFAULT = Object.freeze({
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
    TRAFFIC_READINESS_WAIT_DEFAULT.BACKOFF_MULTIPLIER;
}

function getTrafficReadinessSnapshot(readinessState) {
  if (!readinessState || typeof readinessState !== LOCAL_STR_OBJECT) {
    return null;
  }
  if (typeof readinessState.evaluate === LOCAL_STR_FUNCTION) {
    return readinessState.evaluate();
  }
  if (typeof readinessState.getSnapshot === LOCAL_STR_FUNCTION) {
    return readinessState.getSnapshot();
  }
  return null;
}

function isTrafficReadySnapshot(snapshot) {
  return Boolean(
    snapshot &&
    snapshot.ready === true &&
    snapshot.phase === LIFECYCLE_PHASE.TRAFFIC_READY,
  );
}

function isTrafficReady(readinessState) {
  return isTrafficReadySnapshot(
    getTrafficReadinessSnapshot(readinessState),
  );
}

function isBackgroundWorkReady(readinessState, options = {}) {
  if (!readinessState || typeof readinessState !== LOCAL_STR_OBJECT) {
    return true;
  }
  return isBackgroundWorkReadySnapshot(
    getTrafficReadinessSnapshot(readinessState),
    options,
  );
}

function isBackgroundWorkReadySnapshot(snapshot, options = {}) {
  if (isTrafficReadySnapshot(snapshot)) {
    return true;
  }

  const partitionId = typeof options?.partitionId === TYPEOF.STRING ?
    options.partitionId :
    null;
  if (partitionId &&
      isPriorityControlPlanePartition({partitionId})) {
    return isMetadataPublicationReadySnapshot(snapshot);
  }

  return false;
}

function isMetadataPublicationReadySnapshot(snapshot) {
  if (!snapshot || snapshot.draining === true) {
    return false;
  }

  const reasons = Array.isArray(snapshot.reasons) ?
    snapshot.reasons.filter((reason) => typeof reason === 'string' && reason.length > 0) :
    [];

  if (isTrafficReadySnapshot(snapshot)) {
    return true;
  }

  if (snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY ||
      snapshot.phase === LIFECYCLE_PHASE.DEGRADED) {
    return reasons.length > LOCAL_NUM_ZERO &&
      reasons.every((reason) =>
        METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS.includes(reason),
      );
  }

  if (snapshot.phase === LIFECYCLE_PHASE.JOIN_READY) {
    return reasons.length === LOCAL_NUM_ONE &&
      reasons[LOCAL_NUM_ZERO] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
  }

  return false;
}

function isMetadataPublicationReady(readinessState) {
  return isMetadataPublicationReadySnapshot(
    getTrafficReadinessSnapshot(readinessState),
  );
}

function buildLifecycleReadinessNotReadyError(snapshot, options = {}) {
  const phase = typeof snapshot?.phase === TYPEOF.STRING ?
    snapshot.phase :
    null;
  const label =
    typeof options.label === TYPEOF.STRING &&
    options.label.length > NUM.ZERO ?
      options.label :
      'Lifecycle traffic readiness';
  const error = new Error(
    phase ?
      `${label} is not satisfied (${phase})` :
      `${label} is not satisfied`,
  );
  error.code =
    typeof options.code === TYPEOF.STRING &&
    options.code.length > NUM.ZERO ?
      options.code :
      LOCAL_STR_J2SMD;
  error.retryAfterMs = normalizePositiveInteger(snapshot?.retryAfterMs, null);
  error.lifecycleReadiness = snapshot || null;
  return error;
}

function resolveTrafficReadinessDelayMs(snapshot, delayMs, maxDelayMs) {
  const stableWindowPending = Array.isArray(snapshot?.reasons) &&
    snapshot.reasons.length === NUM.ONE &&
    snapshot.reasons[NUM.ZERO] ===
      LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
  
  let baseDelay = delayMs;
  if (stableWindowPending &&
      Number.isFinite(snapshot?.stableWindowMs) &&
      Number.isFinite(snapshot?.stableElapsedMs)) {
    const remainingMs = Math.max(
      NUM.ONE,
      Math.ceil(snapshot.stableWindowMs - snapshot.stableElapsedMs),
    );
    baseDelay = Math.min(remainingMs, maxDelayMs);
  } else {
    const hintedDelayMs = normalizePositiveInteger(snapshot?.retryAfterMs, null);
    if (hintedDelayMs !== null) {
      baseDelay = Math.min(hintedDelayMs, maxDelayMs);
    }
  }

  return baseDelay;
}

async function waitForTrafficReadiness(options = {}) {
  return waitForLifecycleReadiness({
    ...options,
    isSatisfied: isTrafficReadySnapshot,
    buildError: (snapshot) => buildLifecycleReadinessNotReadyError(snapshot, {
      label: LOCAL_STR_1Y6VT,
      code: LOCAL_STR_J2SMD,
    }),
  });
}

async function waitForMetadataPublicationReadiness(options = {}) {
  return waitForLifecycleReadiness({
    ...options,
    isSatisfied: isMetadataPublicationReadySnapshot,
    buildError: (snapshot) => buildLifecycleReadinessNotReadyError(snapshot, {
      label: LOCAL_STR_1LT6Z,
      code: LOCAL_STR_GMYW4,
    }),
  });
}

async function waitForLifecycleReadiness(options = {}) {
  const getSnapshot = typeof options.readinessSnapshotProvider ===
    TYPEOF.FUNCTION ?
    options.readinessSnapshotProvider :
    () => getTrafficReadinessSnapshot(options.readinessState || null);
  const isSatisfied = typeof options.isSatisfied === TYPEOF.FUNCTION ?
    options.isSatisfied :
    () => false;
  const buildError = typeof options.buildError === TYPEOF.FUNCTION ?
    options.buildError :
    (snapshot) => buildLifecycleReadinessNotReadyError(snapshot);
  const initialSnapshot = getSnapshot();
  if (!initialSnapshot) {
    return null;
  }
  if (isSatisfied(initialSnapshot)) {
    return initialSnapshot;
  }

  const maxAttempts = normalizePositiveInteger(
    options.maxAttempts,
    TRAFFIC_READINESS_WAIT_DEFAULT.MAX_ATTEMPTS,
  );
  const maxDelayMs = normalizePositiveInteger(
    options.maxDelayMs,
    TRAFFIC_READINESS_WAIT_DEFAULT.MAX_DELAY_MS,
  );
  let delayMs = normalizePositiveInteger(
    options.initialDelayMs,
    TRAFFIC_READINESS_WAIT_DEFAULT.INITIAL_DELAY_MS,
  );
  const backoffMultiplier = normalizeBackoffMultiplier(
    options.backoffMultiplier,
  );
  const sleep = typeof options.sleep === TYPEOF.FUNCTION ?
    options.sleep :
    (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs));

  let lastSnapshot = initialSnapshot;
  for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt += NUM.ONE) {
    lastSnapshot = getSnapshot();
    if (!lastSnapshot) {
      return null;
    }
    if (isSatisfied(lastSnapshot)) {
      return lastSnapshot;
    }

    const effectiveDelayMs = resolveTrafficReadinessDelayMs(
      lastSnapshot,
      delayMs,
      maxDelayMs,
    );
    if (attempt >= maxAttempts) {
      throw buildError({
        ...lastSnapshot,
        retryAfterMs: effectiveDelayMs,
      });
    }

    if (typeof options.onRetry === TYPEOF.FUNCTION) {
      options.onRetry({
        attempt,
        maxAttempts,
        delayMs: effectiveDelayMs,
        snapshot: lastSnapshot,
      });
    }

    await sleep(effectiveDelayMs);
    delayMs = Math.min(
      Math.max(NUM.ONE, Math.floor(delayMs * backoffMultiplier)),
      maxDelayMs,
    );
  }

  throw buildError(lastSnapshot);
}

function attachTrafficReadinessListener(readinessState, listener) {
  if (!readinessState || typeof listener !== LOCAL_STR_FUNCTION) {
    return () => {};
  }
  if (typeof readinessState.on !== LOCAL_STR_FUNCTION) {
    return () => {};
  }
  const removeListener =
    typeof readinessState.off === 'function' ?
      readinessState.off.bind(readinessState) :
      (typeof readinessState.removeListener === 'function' ?
        readinessState.removeListener.bind(readinessState) :
        null);
  if (!removeListener) {
    return () => {};
  }
  readinessState.on(LIFECYCLE_EVENT.TRANSITION, listener);
  return () => {
    removeListener(LIFECYCLE_EVENT.TRANSITION, listener);
  };
}

export {
  attachTrafficReadinessListener,
  isBackgroundWorkReady,
  isBackgroundWorkReadySnapshot,
  getTrafficReadinessSnapshot,
  isMetadataPublicationReady,
  isMetadataPublicationReadySnapshot,
  isTrafficReady,
  TRAFFIC_READINESS_WAIT_DEFAULT,
  waitForMetadataPublicationReadiness,
  waitForTrafficReadiness,
};
