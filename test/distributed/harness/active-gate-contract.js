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

function buildActiveGateNoProgressReport(activeGate) {
  if (!isRecord(activeGate)) {
    return null;
  }
  const hasBudget =
    Number.isInteger(activeGate.maxAttempts) && activeGate.maxAttempts > ZERO;
  return Object.freeze({
    enabled: hasBudget,
    mode: activeGate.mode,
    maxAttempts: activeGate.maxAttempts,
    maxCoordinatorCycles: activeGate.maxCoordinatorCycles,
    attemptsSinceProgress: activeGate.attemptsSinceProgress,
    coordinatorCyclesSinceProgress: activeGate.coordinatorCyclesSinceProgress,
    stalled:
      activeGate.state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED ||
      activeGate.state === PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
    lastMeaningfulProgressAttempt: activeGate.lastMeaningfulProgressAttempt,
    lastMeaningfulProgressElapsedMs: activeGate.lastMeaningfulProgressElapsedMs,
    lastMeaningfulProgress: activeGate.lastMeaningfulProgress,
    currentProgress: activeGate.progress,
    closureRecordId: activeGate.closureRecordId,
    closureWitnessClass: activeGate.closureWitnessClass,
    readinessDelay: activeGate.readinessDelay,
    readinessFailure: activeGate.readinessFailure,
    reasonCode: activeGate.reasonCode,
    stalledReason: activeGate.stalledReason,
    failedNoProgress: activeGate.failedNoProgress,
    lastMeaningfulChange: activeGate.lastMeaningfulChange,
    lastProgressEvent: activeGate.lastProgressEvent,
    activeGateBlockerHistory: activeGate.blockerHistory,
  });
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
      closureRecordId: explicitActiveGate.closureRecordId,
      closureWitnessClass: explicitActiveGate.closureWitnessClass,
      reasonCode: explicitActiveGate.reasonCode,
      stalledReason: explicitActiveGate.stalledReason,
      progress: explicitActiveGate.progress,
      bestProgress: explicitActiveGate.bestProgress,
      blockerHistory:
        explicitActiveGate.blockerHistory ||
        explicitActiveGate.activeGateBlockerHistory,
      admissionState:
        explicitActiveGate.admissionState ||
        explicitActiveGate.activeGateAdmissionState,
      waitPolicy: explicitActiveGate.waitPolicy,
      readinessDelay: explicitActiveGate.readinessDelay,
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
  const activeGateBestProgress = isRecord(options.activeGateBestProgress) ?
    options.activeGateBestProgress :
    isRecord(options.bestProgress) ?
      options.bestProgress :
      null;
  const activeGateNoProgress = isRecord(options.activeGateNoProgress) ?
    options.activeGateNoProgress :
    null;
  const activeGateBlockerHistory = Array.isArray(options.activeGateBlockerHistory) ?
    options.activeGateBlockerHistory :
    Array.isArray(options.blockerHistory) ?
      options.blockerHistory :
      [];
  const activeGateAdmissionState = isRecord(options.activeGateAdmissionState) ?
    options.activeGateAdmissionState :
    isRecord(options.admissionState) ?
      options.admissionState :
      null;
  if (
    !activeGateProgress &&
    !activeGateBestProgress &&
    !activeGateNoProgress &&
    activeGateBlockerHistory.length === ZERO &&
    !activeGateAdmissionState
  ) {
    return null;
  }
  const resolvedState =
    activeGateNoProgress?.stalled === true ?
      PRIORITY_RECOVERY_ACTIVE_GATE_STATE.STALLED :
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
    mode:
      activeGateNoProgress?.mode ||
      options.mode ||
      options.readinessMode ||
      null,
    state: resolvedState,
    attempts: options.attempts,
    elapsedMs: options.elapsedMs,
    maxAttempts: activeGateNoProgress?.maxAttempts,
    maxCoordinatorCycles: activeGateNoProgress?.maxCoordinatorCycles,
    attemptsSinceProgress: activeGateNoProgress?.attemptsSinceProgress,
    coordinatorCyclesSinceProgress:
      activeGateNoProgress?.coordinatorCyclesSinceProgress,
    lastMeaningfulProgressAttempt:
      activeGateNoProgress?.lastMeaningfulProgressAttempt,
    lastMeaningfulProgressElapsedMs:
      activeGateNoProgress?.lastMeaningfulProgressElapsedMs,
    closureRecordId:
      activeGateProgress?.closureRecordId ||
      activeGateBestProgress?.closureRecordId ||
      activeGateNoProgress?.closureRecordId ||
      null,
    closureWitnessClass:
      activeGateProgress?.closureWitnessClass ||
      activeGateBestProgress?.closureWitnessClass ||
      activeGateNoProgress?.closureWitnessClass ||
      null,
    reasonCode: activeGateNoProgress?.reasonCode || null,
    stalledReason: activeGateNoProgress?.stalledReason || null,
    progress:
      activeGateProgress ||
      activeGateNoProgress?.currentProgress ||
      null,
    bestProgress: activeGateBestProgress,
    blockerHistory: activeGateBlockerHistory,
    admissionState: activeGateAdmissionState,
    readinessDelay:
      activeGateNoProgress?.readinessDelay ||
      activeGateProgress?.readinessDelay ||
      activeGateBestProgress?.readinessDelay ||
      null,
    readinessFailure: activeGateNoProgress?.readinessFailure || null,
    lastMeaningfulProgress:
      activeGateNoProgress?.lastMeaningfulProgress || null,
    lastMeaningfulChange:
      activeGateNoProgress?.lastMeaningfulChange || null,
    lastProgressEvent:
      activeGateNoProgress?.lastProgressEvent || null,
    failedNoProgress:
      activeGateNoProgress?.failedNoProgress || null,
    stalled: activeGateNoProgress?.stalled === true,
  });
}

export function derivePriorityRecoveryActiveGateReportFields(activeGate) {
  if (!isRecord(activeGate)) {
    return {
      activeGateProgress: null,
      activeGateBestProgress: null,
      activeGateNoProgress: null,
      activeGateBlockerHistory: null,
      activeGateAdmissionState: null,
    };
  }
  return {
    activeGateProgress: activeGate.progress || null,
    activeGateBestProgress: activeGate.bestProgress || null,
    activeGateNoProgress: buildActiveGateNoProgressReport(activeGate),
    activeGateBlockerHistory:
      activeGate.blockerHistory.length > ZERO ?
        activeGate.blockerHistory :
        null,
    activeGateAdmissionState: activeGate.admissionState || null,
  };
}

export function isPriorityRecoveryActiveGateReady(activeGate) {
  return isRecord(activeGate) && activeGate.ready === true;
}
