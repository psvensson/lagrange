const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const ZERO = 0;

export const PRIORITY_RECOVERY_ACTIVE_GATE_STATE = Object.freeze({
  WAITING: 'waiting',
  READY: 'ready',
  SOFT_READY: 'soft_ready',
  STALLED: 'stalled',
  TIMED_OUT: 'timed_out',
  INVARIANT_BREACHED: 'invariant_breached',
});

const PRIORITY_RECOVERY_ACTIVE_GATE_READY_STATES = Object.freeze([
  PRIORITY_RECOVERY_ACTIVE_GATE_STATE.READY,
  PRIORITY_RECOVERY_ACTIVE_GATE_STATE.SOFT_READY,
]);

function isRecord(value) {
  return (
    value !== null &&
    typeof value === TYPEOF_OBJECT &&
    !Array.isArray(value)
  );
}

function normalizeString(value) {
  if (typeof value !== TYPEOF_STRING) {
    return null;
  }
  const normalizedValue = value.trim();
  return normalizedValue.length > ZERO ? normalizedValue : null;
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= ZERO ? value : null;
}

function cloneRecord(value) {
  return isRecord(value) ? Object.freeze({...value}) : null;
}

function cloneArray(value) {
  return Array.isArray(value) ? Object.freeze([...value]) : Object.freeze([]);
}

function normalizeActiveGateState(value) {
  const normalizedValue = normalizeString(value);
  return Object.values(PRIORITY_RECOVERY_ACTIVE_GATE_STATE).includes(
    normalizedValue,
  ) ?
    normalizedValue :
    null;
}

function inferActiveGateState(options = {}) {
  const explicitState = normalizeActiveGateState(options.state);
  if (explicitState) {
    return explicitState;
  }
  if (options.invariantBreached === true) {
    return PRIORITY_RECOVERY_ACTIVE_GATE_STATE.INVARIANT_BREACHED;
  }
  if (options.timedOut === true) {
    return PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT;
  }
  if (options.stalled === true) {
    return PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED;
  }
  if (options.softSuccess === true) {
    return PRIORITY_RECOVERY_ACTIVE_GATE_STATE.SOFT_READY;
  }
  if (options.ready === true) {
    return PRIORITY_RECOVERY_ACTIVE_GATE_STATE.READY;
  }
  return PRIORITY_RECOVERY_ACTIVE_GATE_STATE.WAITING;
}

export function buildPriorityRecoveryActiveGateSnapshot(options = {}) {
  const state = inferActiveGateState(options);
  const progress =
    cloneRecord(options.progress) ||
    cloneRecord(options.currentProgress) ||
    null;
  const bestProgress = cloneRecord(options.bestProgress) || null;
  const blockerHistory = cloneArray(options.blockerHistory);
  const admissionState = cloneRecord(options.admissionState) || null;
  const waitPolicy = cloneRecord(options.waitPolicy) || null;
  const readinessDelay = cloneRecord(options.readinessDelay) || null;
  const readinessFailure = cloneRecord(options.readinessFailure) || null;
  const lastMeaningfulProgress =
    cloneRecord(options.lastMeaningfulProgress) || null;
  const lastMeaningfulChange =
    cloneRecord(options.lastMeaningfulChange) || null;
  const lastProgressEvent = cloneRecord(options.lastProgressEvent) || null;
  const failedNoProgress = cloneRecord(options.failedNoProgress) || null;
  const activeGate = Object.freeze({
    mode: normalizeString(options.mode),
    state,
    ready: PRIORITY_RECOVERY_ACTIVE_GATE_READY_STATES.includes(state),
    softSuccess:
      state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.SOFT_READY,
    attempts: normalizeNonNegativeInteger(options.attempts),
    elapsedMs: normalizeNonNegativeInteger(options.elapsedMs),
    maxAttempts: normalizeNonNegativeInteger(options.maxAttempts),
    maxCoordinatorCycles:
      normalizeNonNegativeInteger(options.maxCoordinatorCycles),
    attemptsSinceProgress:
      normalizeNonNegativeInteger(options.attemptsSinceProgress),
    coordinatorCyclesSinceProgress:
      normalizeNonNegativeInteger(options.coordinatorCyclesSinceProgress),
    lastMeaningfulProgressAttempt:
      normalizeNonNegativeInteger(options.lastMeaningfulProgressAttempt),
    lastMeaningfulProgressElapsedMs:
      normalizeNonNegativeInteger(options.lastMeaningfulProgressElapsedMs),
    closureRecordId: normalizeString(options.closureRecordId),
    closureWitnessClass: normalizeString(options.closureWitnessClass),
    reasonCode: normalizeString(options.reasonCode),
    stalledReason: normalizeString(options.stalledReason),
    progress,
    bestProgress,
    blockerHistory,
    admissionState,
    waitPolicy,
    readinessDelay,
    readinessFailure,
    lastMeaningfulProgress,
    lastMeaningfulChange,
    lastProgressEvent,
    failedNoProgress,
  });
  return activeGate;
}

export function normalizePriorityRecoveryActiveGateSnapshot(options = {}) {
  const explicitActiveGate =
    isRecord(options.activeGate) ?
      options.activeGate :
      (
        normalizeActiveGateState(options.state) ||
        Object.hasOwn(options, 'ready')
      ) ?
        options :
        null;
  if (explicitActiveGate) {
    return buildPriorityRecoveryActiveGateSnapshot({
      mode:
        explicitActiveGate.mode ||
        explicitActiveGate.readinessMode ||
        null,
      state: explicitActiveGate.state,
      ready: explicitActiveGate.ready === true,
      softSuccess: explicitActiveGate.softSuccess === true,
      attempts: explicitActiveGate.attempts,
      elapsedMs: explicitActiveGate.elapsedMs,
      maxAttempts: explicitActiveGate.maxAttempts,
      maxCoordinatorCycles: explicitActiveGate.maxCoordinatorCycles,
      attemptsSinceProgress: explicitActiveGate.attemptsSinceProgress,
      coordinatorCyclesSinceProgress:
        explicitActiveGate.coordinatorCyclesSinceProgress,
      lastMeaningfulProgressAttempt:
        explicitActiveGate.lastMeaningfulProgressAttempt,
      lastMeaningfulProgressElapsedMs:
        explicitActiveGate.lastMeaningfulProgressElapsedMs,
      closureRecordId:
        explicitActiveGate.closureRecordId ||
        explicitActiveGate.progress?.closureRecordId ||
        explicitActiveGate.bestProgress?.closureRecordId,
      closureWitnessClass:
        explicitActiveGate.closureWitnessClass ||
        explicitActiveGate.progress?.closureWitnessClass ||
        explicitActiveGate.bestProgress?.closureWitnessClass,
      reasonCode: explicitActiveGate.reasonCode,
      stalledReason: explicitActiveGate.stalledReason,
      progress: explicitActiveGate.progress || options.activeGateProgress,
      bestProgress: explicitActiveGate.bestProgress || options.bestProgress,
      blockerHistory: explicitActiveGate.blockerHistory,
      admissionState:
        explicitActiveGate.admissionState ||
        explicitActiveGate.activeGateAdmissionState ||
        options.activeGateAdmissionState,
      waitPolicy: explicitActiveGate.waitPolicy,
      readinessDelay:
        explicitActiveGate.readinessDelay ||
        explicitActiveGate.progress?.readinessDelay ||
        explicitActiveGate.bestProgress?.readinessDelay,
      readinessFailure: explicitActiveGate.readinessFailure,
      lastMeaningfulProgress: explicitActiveGate.lastMeaningfulProgress,
      lastMeaningfulChange: explicitActiveGate.lastMeaningfulChange,
      lastProgressEvent: explicitActiveGate.lastProgressEvent,
      failedNoProgress: explicitActiveGate.failedNoProgress,
      timedOut:
        normalizeActiveGateState(explicitActiveGate.state) ===
        PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
      stalled:
        normalizeActiveGateState(explicitActiveGate.state) ===
        PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED,
      invariantBreached:
        normalizeActiveGateState(explicitActiveGate.state) ===
        PRIORITY_RECOVERY_ACTIVE_GATE_STATE.INVARIANT_BREACHED,
    });
  }

  const activeGateProgress = isRecord(options.activeGateProgress) ?
    options.activeGateProgress :
    isRecord(options.progress) ?
      options.progress :
      null;
  const fallbackBestProgress = isRecord(options.bestProgress) ?
    options.bestProgress :
    null;
  const fallbackBlockerHistory = Array.isArray(options.blockerHistory) ?
    options.blockerHistory :
    [];
  const activeGateAdmissionState = isRecord(options.activeGateAdmissionState) ?
    options.activeGateAdmissionState :
    isRecord(options.admissionState) ?
      options.admissionState :
      null;
  if (
    !activeGateProgress &&
    !fallbackBestProgress &&
    fallbackBlockerHistory.length === ZERO &&
    !activeGateAdmissionState
  ) {
    return null;
  }
  const resolvedState =
    activeGateProgress?.blockerSignature === 'ready' ||
    (
      activeGateProgress?.activeNodeCount === activeGateProgress?.expectedNodeCount &&
      activeGateProgress?.gateReasonCount === ZERO &&
      activeGateProgress?.pendingAckCount === ZERO &&
      activeGateProgress?.missingPublishedCount === ZERO &&
      activeGateProgress?.snapshotCoverageComplete === true
    ) ?
      PRIORITY_RECOVERY_ACTIVE_GATE_STATE.READY :
      PRIORITY_RECOVERY_ACTIVE_GATE_STATE.WAITING;
  return buildPriorityRecoveryActiveGateSnapshot({
    mode: options.mode || options.readinessMode || null,
    state: resolvedState,
    attempts: options.attempts,
    elapsedMs: options.elapsedMs,
    closureRecordId:
      activeGateProgress?.closureRecordId ||
      fallbackBestProgress?.closureRecordId ||
      null,
    closureWitnessClass:
      activeGateProgress?.closureWitnessClass ||
      fallbackBestProgress?.closureWitnessClass ||
      null,
    progress: activeGateProgress || null,
    bestProgress: fallbackBestProgress,
    blockerHistory: fallbackBlockerHistory,
    admissionState: activeGateAdmissionState,
    readinessDelay:
      activeGateProgress?.readinessDelay ||
      fallbackBestProgress?.readinessDelay ||
      null,
  });
}

export function derivePriorityRecoveryActiveGateReportFields(activeGate) {
  if (!isRecord(activeGate)) {
    return {
      activeGate: null,
      activeGateProgress: null,
      activeGateAdmissionState: null,
    };
  }
  return {
    activeGate,
    activeGateProgress: activeGate.progress || null,
    activeGateAdmissionState: activeGate.admissionState || null,
  };
}

export function isPriorityRecoveryActiveGateReady(activeGate) {
  return isRecord(activeGate) && activeGate.ready === true;
}
