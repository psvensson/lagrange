import {NUM, TIME_MS} from '../constants/index.js';
import {LIFECYCLE_EVENT, LIFECYCLE_PHASE} from './lifecycle-controller-constants.js';
import {LIFECYCLE_REASON} from './lifecycle-controller-constants.js';
import {
  classifySystemPartition,
} from './system-partition-classification.js';
import {
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
} from './owners/bootstrap-control-plane-recovery-health.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_BOOTSTRAP_TRAFFIC_NOT_READY = 'BOOTSTRAP_TRAFFIC_NOT_READY';
const LOCAL_STR_LIFECYCLE_TRAFFIC_READINESS = 'Lifecycle traffic readiness';
const LOCAL_STR_LIFECYCLE_METADATA_PUBLICATION_READINESS = 'Lifecycle metadata publication readiness';
const LOCAL_STR_BOOTSTRAP_METADATA_PUBLICATION_NOT_READY = 'BOOTSTRAP_METADATA_PUBLICATION_NOT_READY';

// The diagnostics-unavailable variant (added with the progress-contract
// refactor, fc01198b) is the same tolerance class as
// PRIORITY_CONTROL_PLANE_RECOVERY_PENDING: when seed-contact startup authority
// is available, both must allow metadata-publication readiness during the
// CONTROL_READY/DEGRADED phase. See BOOTSTRAP_INIT_PRIORITY_BYPASS_REASONS and
// BOOTSTRAP_JOIN_NON_BLOCKING_REASONS, which already pair the two variants.
const METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS = Object.freeze([
  LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
]);

const TRAFFIC_READINESS_WAIT_DEFAULT = Object.freeze({
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

  const partitionId = typeof options?.partitionId === 'string' ?
    options.partitionId :
    null;
  const partitionClassification = partitionId ?
    classifySystemPartition({partitionId}) :
    null;
  if (
    partitionClassification?.priorityControlPlane === true ||
    partitionClassification?.formationLivenessDependency === true
  ) {
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
    return reasons.length > 0 &&
      reasons.every((reason) =>
        METADATA_PUBLICATION_ALLOWED_CONTROL_READY_REASONS.includes(reason),
      );
  }

  if (snapshot.phase === LIFECYCLE_PHASE.JOIN_READY) {
    return reasons.length === 1 &&
      reasons[0] === LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
  }

  return false;
}

function isMetadataPublicationReady(readinessState) {
  return isMetadataPublicationReadySnapshot(
    getTrafficReadinessSnapshot(readinessState),
  );
}

function buildLifecycleReadinessNotReadyError(snapshot, options = {}) {
  const phase = typeof snapshot?.phase === 'string' ?
    snapshot.phase :
    null;
  const label =
    typeof options.label === 'string' &&
    options.label.length > 0 ?
      options.label :
      'Lifecycle traffic readiness';
  const error = new Error(
    phase ?
      `${label} is not satisfied (${phase})` :
      `${label} is not satisfied`,
  );
  error.code =
    typeof options.code === 'string' &&
    options.code.length > 0 ?
      options.code :
      LOCAL_STR_BOOTSTRAP_TRAFFIC_NOT_READY;
  error.retryAfterMs = normalizePositiveInteger(snapshot?.retryAfterMs, null);
  error.lifecycleReadiness = snapshot || null;

  const reasons = Array.isArray(snapshot?.reasons) ? snapshot.reasons : [];
  const primaryReason = reasons[0] || 'lifecycle_metadata_publication_not_ready';
  const progressContract = snapshot?.progressContract || {
    owner: 'startup_readiness_owner',
    boundary: 'startup_support_evidence',
    state: 'readiness_retryable',
    reason: primaryReason,
    nextAction: label.toLowerCase().includes('metadata') ? 'wait_for_metadata_publication' : 'wait_for_traffic_readiness',
    wakeSource: label.toLowerCase().includes('metadata') ? 'metadata_publication_event' : 'traffic_readiness_event',
    retryAfterMs: typeof error.retryAfterMs === 'number' ? error.retryAfterMs : 0,
    terminalState: 'satisfied',
    evidencePath: 'startup_support_evidence',
    blockingDependency: label.toLowerCase().includes('metadata') ? 'metadata_publication' : 'traffic_readiness',
  };
  error.progressContract = progressContract;
  if (snapshot) {
    snapshot.progressContract = progressContract;
  }

  return error;
}

function resolveTrafficReadinessDelayMs(snapshot, delayMs, maxDelayMs) {
  const stableWindowPending = Array.isArray(snapshot?.reasons) &&
    snapshot.reasons.length === 1 &&
    snapshot.reasons[0] ===
      LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;

  let baseDelay = delayMs;
  if (stableWindowPending &&
      Number.isFinite(snapshot?.stableWindowMs) &&
      Number.isFinite(snapshot?.stableElapsedMs)) {
    const remainingMs = Math.max(
      1,
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
      label: LOCAL_STR_LIFECYCLE_TRAFFIC_READINESS,
      code: LOCAL_STR_BOOTSTRAP_TRAFFIC_NOT_READY,
    }),
  });
}

async function waitForMetadataPublicationReadiness(options = {}) {
  return waitForLifecycleReadiness({
    ...options,
    isSatisfied: isMetadataPublicationReadySnapshot,
    buildError: (snapshot) => buildLifecycleReadinessNotReadyError(snapshot, {
      label: LOCAL_STR_LIFECYCLE_METADATA_PUBLICATION_READINESS,
      code: LOCAL_STR_BOOTSTRAP_METADATA_PUBLICATION_NOT_READY,
    }),
  });
}

async function waitForLifecycleReadiness(options = {}) {
  const getSnapshot = typeof options.readinessSnapshotProvider ===
    'function' ?
    options.readinessSnapshotProvider :
    () => getTrafficReadinessSnapshot(options.readinessState || null);
  const isSatisfied = typeof options.isSatisfied === 'function' ?
    options.isSatisfied :
    () => false;
  const buildError = typeof options.buildError === 'function' ?
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
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs));

  let lastSnapshot = initialSnapshot;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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

    if (typeof options.onRetry === 'function') {
      options.onRetry({
        attempt,
        maxAttempts,
        delayMs: effectiveDelayMs,
        snapshot: lastSnapshot,
      });
    }

    await sleep(effectiveDelayMs);
    delayMs = Math.min(
      Math.max(1, Math.floor(delayMs * backoffMultiplier)),
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
  buildLifecycleReadinessNotReadyError,
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
