const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_THOUSAND = 1000;
const DEFAULT_MAX_RETRY_ATTEMPTS = Number.POSITIVE_INFINITY;
const MAX_PLATFORM_TIMER_DELAY_MS = 2_147_483_647;
const RETRYABLE_FAILURE = 'retryable_drain_failure';
const RETRY_DEFERRED = 'retryable_drain_deferred';
const RETRY_EXHAUSTED = 'retryable_drain_exhausted';
const TIMER_REGISTRATION_FAILED = 'retry_timer_registration_failed';
const TIMER_SCHEDULE_STATE = Object.freeze({
  FAILED: 'failed',
  SCHEDULED: 'scheduled',
});
const CONCURRENT_MERGE_STATE = Object.freeze({
  ABSENT: 'absent',
  MERGED: 'merged',
  RESET: 'reset',
});
const FAILURE_LOG_MSG =
  'Reconcile queue item deferred after retryable drain failure';
const EXHAUSTED_LOG_MSG =
  'Reconcile queue item stopped after exhausting retryable drain attempts';
const MapConstructor = Map;
const ProxyConstructor = Proxy;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const mathFloor = Math.floor;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const reflectApply = Reflect.apply;
const reflectGet = Reflect.get;
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);

function defineArrayValue(values, index, value) {
  objectDefineProperty(values, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function defaultRetryableDrainFailureClassifier() {
  return false;
}

function defaultRetryableDrainFailureRetryAfterMs(error) {
  return numberIsFinite(error?.retryAfterMs) && error.retryAfterMs > 0 ?
    mathFloor(error.retryAfterMs) :
    LOCAL_NUM_THOUSAND;
}

function defaultRetryableDrainFailureReason() {
  return RETRYABLE_FAILURE;
}

function defaultRetryAttemptResetClassifier() {
  return false;
}

function normalizeMaxRetryAttempts(value) {
  return numberIsSafeInteger(value) && value > 0 ?
    value :
    DEFAULT_MAX_RETRY_ATTEMPTS;
}

function normalizeReconcileQueueRetryPolicy(policy = {}) {
  const source = policy && typeof policy === LOCAL_STR_OBJECT ? policy : {};
  return objectFreeze({
    isRetryableError:
      typeof source.isRetryableError === LOCAL_STR_FUNCTION ?
        source.isRetryableError :
        defaultRetryableDrainFailureClassifier,
    getRetryAfterMs:
      typeof source.getRetryAfterMs === LOCAL_STR_FUNCTION ?
        source.getRetryAfterMs :
        defaultRetryableDrainFailureRetryAfterMs,
    getFailureReason:
      typeof source.getFailureReason === LOCAL_STR_FUNCTION ?
        source.getFailureReason :
        defaultRetryableDrainFailureReason,
    shouldResetAttempts:
      typeof source.shouldResetAttempts === LOCAL_STR_FUNCTION ?
        source.shouldResetAttempts :
        defaultRetryAttemptResetClassifier,
    maxAttempts: normalizeMaxRetryAttempts(source.maxAttempts),
  });
}

function normalizeRetryAfterMs(value) {
  return numberIsSafeInteger(value) &&
    value > 0 &&
    value <= MAX_PLATFORM_TIMER_DELAY_MS ?
    value :
    LOCAL_NUM_THOUSAND;
}

// Retry policies are extension seams, so preserve the thrown value's prototype
// and arbitrary fields. The proxy memoizes each property at its first boundary
// read, preventing a changing or throwing accessor from being evaluated again
// by later policy and diagnostic stages.
function stabilizeRetryError(error) {
  if ((typeof error !== LOCAL_STR_OBJECT || error === null) &&
      typeof error !== LOCAL_STR_FUNCTION) {
    return error;
  }
  const capturedValues = new MapConstructor();
  return new ProxyConstructor(error, {
    get(target, property) {
      if (mapHas(capturedValues, property)) {
        return mapGet(capturedValues, property);
      }
      let value;
      try {
        value = reflectGet(target, property, target);
      } catch {
        value = undefined;
      }
      mapSet(capturedValues, property, value);
      return value;
    },
  });
}

function readFailureMessage(error) {
  if (typeof error === LOCAL_STR_STRING) return error;
  const message = error?.message;
  return typeof message === LOCAL_STR_STRING ? message : RETRYABLE_FAILURE;
}

function readFailureCode(error) {
  const code = error?.code;
  if (typeof code === LOCAL_STR_STRING) return code;
  const errorCode = error?.errorCode;
  return typeof errorCode === LOCAL_STR_STRING ? errorCode : '';
}

function resolvePolicyValue(callback, fallback, ...args) {
  try {
    return callback(...args);
  } catch {
    return fallback;
  }
}

function pushFailureSample(queue, sample) {
  const samples = queue._retryableDrainFailureSamples;
  if (samples.length < queue.retrySampleCapacity) {
    defineArrayValue(samples, samples.length, sample);
  } else {
    defineArrayValue(samples, queue._retryableDrainFailureSampleIndex, sample);
  }
  queue._retryableDrainFailureSampleIndex =
    (queue._retryableDrainFailureSampleIndex + 1) % queue.retrySampleCapacity;
}

function clearRetryTimer(queue, ownerKey) {
  const retryTimer = mapGet(queue.retryTimers, ownerKey);
  if (!retryTimer) return;
  try {
    queue.clearTimeoutFn(retryTimer);
  } catch {
    // The state transition below still removes the untrusted timer handle.
  }
  mapDelete(queue.retryTimers, ownerKey);
}

function clearRetryState(queue, ownerKey) {
  clearRetryTimer(queue, ownerKey);
  mapDelete(queue.retryStates, ownerKey);
  mapDelete(queue.retryWorkItems, ownerKey);
  mapDelete(queue.exhaustedWorkItems, ownerKey);
  mapDelete(queue.exhaustedRetryStates, ownerKey);
}

function wakeRetryWorkItem(queue, ownerKey) {
  if (queue.stopped) return false;
  const item = mapGet(queue.retryWorkItems, ownerKey);
  if (!item) return false;
  clearRetryTimer(queue, ownerKey);
  mapDelete(queue.retryWorkItems, ownerKey);
  const existing = mapGet(queue.pending, ownerKey);
  if (existing) {
    setForEach(item.reasons, (reason) => setAdd(existing.reasons, reason));
    if (item.context !== null && item.context !== undefined) {
      existing.context = item.context;
    }
    if (item.fenceToken !== undefined && item.fenceToken !== null) {
      existing.fenceToken = item.fenceToken;
    }
  } else {
    mapSet(queue.pending, ownerKey, item);
  }
  queue.scheduleDrain();
  return true;
}

function maybeUnrefTimer(timer) {
  try {
    const unref = timer?.unref;
    if (typeof unref === LOCAL_STR_FUNCTION) reflectApply(unref, timer, []);
  } catch {
    // Timer ownership is valid without the optional process-liveness hint.
  }
}

function scheduleRetryDrain(queue, ownerKey, retryAfterMs) {
  clearRetryTimer(queue, ownerKey);
  let timer;
  let armed = false;
  let firedSynchronously = false;
  try {
    timer = queue.setTimeoutFn(() => {
      if (!armed) {
        firedSynchronously = true;
        return;
      }
      mapDelete(queue.retryTimers, ownerKey);
      wakeRetryWorkItem(queue, ownerKey);
    }, retryAfterMs);
    maybeUnrefTimer(timer);
    mapSet(queue.retryTimers, ownerKey, timer);
    armed = true;
    if (firedSynchronously) {
      mapDelete(queue.retryTimers, ownerKey);
      wakeRetryWorkItem(queue, ownerKey);
    }
    return {state: TIMER_SCHEDULE_STATE.SCHEDULED};
  } catch (error) {
    if (timer !== undefined) {
      try {
        queue.clearTimeoutFn(timer);
      } catch {
        // The typed terminal owner state below remains authoritative.
      }
    }
    mapDelete(queue.retryTimers, ownerKey);
    return {
      state: TIMER_SCHEDULE_STATE.FAILED,
      error: stabilizeRetryError(error),
    };
  }
}

function recordExhausted(queue, ownerKey, item, retryState, overrides = {}) {
  const exhaustedState = {
    ...retryState,
    ...overrides,
    type: RETRY_EXHAUSTED,
    nextAttemptAt: null,
    maxAttempts: queue.retryPolicy.maxAttempts,
  };
  item.retryState = exhaustedState;
  mapDelete(queue.retryWorkItems, ownerKey);
  mapSet(queue.retryStates, ownerKey, exhaustedState);
  mapSet(queue.exhaustedRetryStates, ownerKey, exhaustedState);
  mapSet(queue.exhaustedWorkItems, ownerKey, item);
  queue._retryableDrainFailureCount++;
  queue._retryableDrainExhaustedCount++;
  pushFailureSample(queue, exhaustedState);
  queue.emit(RETRY_EXHAUSTED, exhaustedState);
  queue.logger.error(EXHAUSTED_LOG_MSG, {...exhaustedState});
}

function mergeConcurrentItemContext(item, concurrentlyEnqueued) {
  if (concurrentlyEnqueued.context !== null &&
      concurrentlyEnqueued.context !== undefined) {
    item.context = concurrentlyEnqueued.context;
  }
  if (concurrentlyEnqueued.fenceToken !== undefined &&
      concurrentlyEnqueued.fenceToken !== null) {
    item.fenceToken = concurrentlyEnqueued.fenceToken;
  }
}

function mergeConcurrentEnqueue(queue, ownerKey, item, reasons) {
  const concurrentlyEnqueued = mapGet(queue.pending, ownerKey);
  let state;
  let mergedReasons = reasons;
  if (!concurrentlyEnqueued) {
    state = CONCURRENT_MERGE_STATE.ABSENT;
  } else if (queue._maybeResetRetryAttempts(
    ownerKey, item, RETRYABLE_FAILURE, concurrentlyEnqueued.context,
  )) {
    state = CONCURRENT_MERGE_STATE.RESET;
  } else {
    mapDelete(queue.pending, ownerKey);
    setForEach(concurrentlyEnqueued.reasons,
      (reason) => setAdd(item.reasons, reason));
    mergeConcurrentItemContext(item, concurrentlyEnqueued);
    mergedReasons = queue.snapshotReasons(item.reasons);
    state = CONCURRENT_MERGE_STATE.MERGED;
  }
  return {state, reasons: mergedReasons};
}

function deferRetryableDrainFailure(queue, ownerKey, item, reasons, error) {
  const stableError = stabilizeRetryError(error);
  const retryable = resolvePolicyValue(
    queue.retryPolicy.isRetryableError,
    false,
    stableError,
    item.context,
    {ownerKey, queue: queue.name},
  ) === true;
  if (queue.stopped || !retryable) return false;
  const merged = mergeConcurrentEnqueue(queue, ownerKey, item, reasons);
  if (merged.state === CONCURRENT_MERGE_STATE.RESET) return false;
  reasons = merged.reasons;
  const baseRetryAfterMs = normalizeRetryAfterMs(resolvePolicyValue(
    queue.retryPolicy.getRetryAfterMs,
    LOCAL_NUM_THOUSAND,
    stableError,
    item.context,
    {ownerKey, queue: queue.name},
  ));
  const failureReasonValue = resolvePolicyValue(
    queue.retryPolicy.getFailureReason,
    RETRYABLE_FAILURE,
    stableError,
    item.context,
    {ownerKey, queue: queue.name},
  );
  const failureReason = typeof failureReasonValue === LOCAL_STR_STRING &&
    failureReasonValue.length > 0 ? failureReasonValue : RETRYABLE_FAILURE;
  const timestamp = queue.now();
  const previousState = mapGet(queue.retryStates, ownerKey);
  const failureCount = numberIsFinite(previousState?.failureCount) ?
    previousState.failureCount + 1 : 1;
  const errorCode = readFailureCode(stableError);
  const retryState = {
    type: RETRYABLE_FAILURE,
    queue: queue.name,
    ownerKey,
    reasons,
    failureReason,
    retryAfterMs: baseRetryAfterMs,
    baseRetryAfterMs,
    nextAttemptAt: timestamp + baseRetryAfterMs,
    failureCount,
    errorMessage: readFailureMessage(stableError),
    ...(errorCode.length > 0 ? {errorCode} : {}),
    timestamp,
  };
  item.retryState = retryState;
  if (failureCount >= queue.retryPolicy.maxAttempts) {
    recordExhausted(queue, ownerKey, item, retryState);
    return true;
  }
  mapSet(queue.retryStates, ownerKey, retryState);
  mapSet(queue.retryWorkItems, ownerKey, item);
  const timerSchedule = scheduleRetryDrain(queue, ownerKey, baseRetryAfterMs);
  if (timerSchedule.state === TIMER_SCHEDULE_STATE.FAILED) {
    recordExhausted(queue, ownerKey, item, retryState, {
      failureReason: TIMER_REGISTRATION_FAILED,
      errorMessage: readFailureMessage(timerSchedule.error),
    });
    return true;
  }
  queue._retryableDrainFailureCount++;
  pushFailureSample(queue, retryState);
  queue.emit(RETRY_DEFERRED, retryState);
  queue.logger.warn(FAILURE_LOG_MSG, {...retryState});
  return true;
}

export {
  clearRetryState,
  clearRetryTimer,
  deferRetryableDrainFailure,
  normalizeReconcileQueueRetryPolicy,
  wakeRetryWorkItem,
};
