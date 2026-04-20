const ZERO = 0;
const ONE = 1;
const LOAD_NODE_SLOT_STALL_THRESHOLD_TIMEOUT_DIVISOR = 4;
const LOAD_NODE_SLOT_STALL_THRESHOLD_MIN_MS = 50;

const LOAD_NODE_AVAILABILITY_STATE_READY = 'ready';
const LOAD_NODE_AVAILABILITY_STATE_SLOT_BORROWING = 'slot_borrowing';
const LOAD_NODE_AVAILABILITY_STATE_LOCAL_BLOCKED = 'local_blocked';
const LOAD_NODE_AVAILABILITY_STATE_EXTERNAL_BLOCKED = 'external_blocked';
const LOAD_NODE_AVAILABILITY_STATE_SLOT_SATURATED = 'slot_saturated';
const LOAD_NODE_AVAILABILITY_STATE_SLOT_STALLED = 'slot_stalled';

const LOAD_NODE_AVAILABILITY_STATE = Object.freeze({
  READY: LOAD_NODE_AVAILABILITY_STATE_READY,
  SLOT_BORROWING: LOAD_NODE_AVAILABILITY_STATE_SLOT_BORROWING,
  LOCAL_BLOCKED: LOAD_NODE_AVAILABILITY_STATE_LOCAL_BLOCKED,
  EXTERNAL_BLOCKED: LOAD_NODE_AVAILABILITY_STATE_EXTERNAL_BLOCKED,
  SLOT_SATURATED: LOAD_NODE_AVAILABILITY_STATE_SLOT_SATURATED,
  SLOT_STALLED: LOAD_NODE_AVAILABILITY_STATE_SLOT_STALLED,
});

const LOAD_NODE_AVAILABILITY_REASON = Object.freeze({
  SLOT_BORROWING: LOAD_NODE_AVAILABILITY_STATE_SLOT_BORROWING,
  LOCAL_BLOCKED: LOAD_NODE_AVAILABILITY_STATE_LOCAL_BLOCKED,
  EXTERNAL_BLOCKED: LOAD_NODE_AVAILABILITY_STATE_EXTERNAL_BLOCKED,
  SLOT_SATURATED: LOAD_NODE_AVAILABILITY_STATE_SLOT_SATURATED,
  SLOT_STALLED: LOAD_NODE_AVAILABILITY_STATE_SLOT_STALLED,
});

function normalizePositiveInteger(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  const normalized = Math.floor(numericValue);
  return normalized > ZERO ? normalized : fallback;
}

function buildLoadNodeAvailabilitySnapshot(options = {}) {
  return {
    nowMs: normalizePositiveInteger(options.nowMs, Date.now()),
    localDispatchReady: options.localDispatchReady === true,
    externalAdmissionReady: options.externalAdmissionReady !== false,
    currentInFlight: Math.max(
      ZERO,
      Math.floor(Number(options.currentInFlight) || ZERO),
    ),
    dispatchMaxInFlight: normalizePositiveInteger(
      options.dispatchMaxInFlight,
      ONE,
    ),
    capacityContributionMaxInFlight: normalizePositiveInteger(
      options.capacityContributionMaxInFlight,
      ONE,
    ),
    oldestInFlightStartedAtMs: Number.isFinite(options.oldestInFlightStartedAtMs) ?
      Math.floor(options.oldestInFlightStartedAtMs) :
      null,
    queryTimeoutMs: normalizePositiveInteger(options.queryTimeoutMs, ONE),
    admissionBackoffMs: normalizePositiveInteger(options.admissionBackoffMs, ONE),
  };
}

function resolveLoadNodeSlotStallThresholdMs(snapshot) {
  const timeoutThresholdMs = Math.max(
    ONE,
    Math.floor(snapshot.queryTimeoutMs / LOAD_NODE_SLOT_STALL_THRESHOLD_TIMEOUT_DIVISOR),
  );
  return Math.max(
    LOAD_NODE_SLOT_STALL_THRESHOLD_MIN_MS,
    timeoutThresholdMs,
  );
}

function resolveLoadNodeAvailabilityState(snapshot) {
  const dispatchAtCapacity =
    snapshot.currentInFlight >= snapshot.dispatchMaxInFlight;
  const contributionAtCapacity =
    snapshot.currentInFlight >= snapshot.capacityContributionMaxInFlight;
  const slotStallThresholdMs = resolveLoadNodeSlotStallThresholdMs(snapshot);
  const oldestInFlightAgeMs =
    Number.isFinite(snapshot.oldestInFlightStartedAtMs) ?
      Math.max(ZERO, snapshot.nowMs - snapshot.oldestInFlightStartedAtMs) :
      ZERO;

  if (!snapshot.localDispatchReady) {
    return {
      state: LOAD_NODE_AVAILABILITY_STATE_LOCAL_BLOCKED,
      reasonCodes: [LOAD_NODE_AVAILABILITY_REASON.LOCAL_BLOCKED],
      canDispatch: false,
      contributesCapacity: false,
      oldestInFlightAgeMs,
      slotStallThresholdMs,
    };
  }
  if (!snapshot.externalAdmissionReady) {
    return {
      state: LOAD_NODE_AVAILABILITY_STATE_EXTERNAL_BLOCKED,
      reasonCodes: [LOAD_NODE_AVAILABILITY_REASON.EXTERNAL_BLOCKED],
      canDispatch: false,
      contributesCapacity: false,
      oldestInFlightAgeMs,
      slotStallThresholdMs,
    };
  }
  if (dispatchAtCapacity &&
      oldestInFlightAgeMs >= slotStallThresholdMs) {
    return {
      state: LOAD_NODE_AVAILABILITY_STATE_SLOT_STALLED,
      reasonCodes: [LOAD_NODE_AVAILABILITY_REASON.SLOT_STALLED],
      canDispatch: false,
      contributesCapacity: false,
      oldestInFlightAgeMs,
      slotStallThresholdMs,
    };
  }
  if (contributionAtCapacity && !dispatchAtCapacity) {
    return {
      state: LOAD_NODE_AVAILABILITY_STATE_SLOT_BORROWING,
      reasonCodes: [LOAD_NODE_AVAILABILITY_REASON.SLOT_BORROWING],
      canDispatch: true,
      contributesCapacity: true,
      oldestInFlightAgeMs,
      slotStallThresholdMs,
    };
  }
  if (!dispatchAtCapacity) {
    return {
      state: LOAD_NODE_AVAILABILITY_STATE_READY,
      reasonCodes: [],
      canDispatch: true,
      contributesCapacity: true,
      oldestInFlightAgeMs,
      slotStallThresholdMs,
    };
  }
  return {
    state: LOAD_NODE_AVAILABILITY_STATE_SLOT_SATURATED,
    reasonCodes: [LOAD_NODE_AVAILABILITY_REASON.SLOT_SATURATED],
    canDispatch: false,
    contributesCapacity: true,
    oldestInFlightAgeMs,
    slotStallThresholdMs,
  };
}

export {
  LOAD_NODE_AVAILABILITY_STATE,
  buildLoadNodeAvailabilitySnapshot,
  resolveLoadNodeAvailabilityState,
  resolveLoadNodeSlotStallThresholdMs,
};
