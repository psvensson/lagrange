const SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT = 64;
const SCHEMA_ADMISSION_TRANSITION_HISTORY_SCHEMA_VERSION = 1;
const SCHEMA_STABILITY_WINDOW_PHASE_OBSERVING = 'observing';
const SCHEMA_STABILITY_WINDOW_TRANSITION = Object.freeze({
  HELD: 'held',
  INACTIVE: 'inactive',
  OBSERVING: 'observing',
  RESET: 'reset',
  STARTED: 'started',
});
const ZERO = 0;

function freezeArray(values = []) {
  return Object.freeze(Array.isArray(values) ? [...values] : []);
}

function normalizeOptionalNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= ZERO ? value : null;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value : null;
}

function buildEmptySchemaAdmissionTransitionHistory() {
  return Object.freeze({
    schemaVersion: SCHEMA_ADMISSION_TRANSITION_HISTORY_SCHEMA_VERSION,
    limit: SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT,
    droppedTransitionCount: ZERO,
    transitions: Object.freeze([]),
  });
}

function resolveSchemaStabilityWindowTransition({
  snapshot,
  previousStabilityWindow,
  nextStabilityWindow,
}) {
  if (snapshot?.stabilityWindowHeld === true) {
    return SCHEMA_STABILITY_WINDOW_TRANSITION.HELD;
  }
  const previousObserving =
    previousStabilityWindow?.phase ===
      SCHEMA_STABILITY_WINDOW_PHASE_OBSERVING;
  const nextObserving =
    nextStabilityWindow?.phase === SCHEMA_STABILITY_WINDOW_PHASE_OBSERVING;
  if (previousObserving && !nextObserving) {
    return SCHEMA_STABILITY_WINDOW_TRANSITION.RESET;
  }
  if (!previousObserving && nextObserving) {
    return SCHEMA_STABILITY_WINDOW_TRANSITION.STARTED;
  }
  return nextObserving ?
    SCHEMA_STABILITY_WINDOW_TRANSITION.OBSERVING :
    SCHEMA_STABILITY_WINDOW_TRANSITION.INACTIVE;
}

function buildCriticalSystemTransitionEvidence(criticalSystemTopology = {}) {
  return Object.freeze({
    ready: criticalSystemTopology.ready === true,
    observationState: normalizeOptionalString(
      criticalSystemTopology.observationState,
    ),
    totalSpreadGap: normalizeOptionalNonNegativeInteger(
      criticalSystemTopology.totalSpreadGap,
    ),
    prioritySpreadGap: normalizeOptionalNonNegativeInteger(
      criticalSystemTopology.prioritySpreadGap,
    ),
    missingLeaderPartitionCount: normalizeOptionalNonNegativeInteger(
      criticalSystemTopology.missingLeaderPartitionCount,
    ),
  });
}

function buildSnapshotTransitionEvidence(snapshot = {}) {
  return Object.freeze({
    state: normalizeOptionalString(snapshot.state),
    canonicalBlocker: normalizeOptionalString(snapshot.canonicalBlocker),
    reasonCodes: freezeArray(snapshot.reasonCodes),
    ready: snapshot.ready === true,
    stabilityWindowHeld: snapshot.stabilityWindowHeld === true,
    stableElapsedMs: normalizeOptionalNonNegativeInteger(
      snapshot.stableElapsedMs,
    ),
    effectiveInFlightCount: normalizeOptionalNonNegativeInteger(
      snapshot.effectiveInFlightCount,
    ),
    controlPlanePressureReasonCodes: freezeArray(
      snapshot.controlPlanePressureSignals?.map(
        (signal) => signal?.reasonCode,
      ).filter(Boolean),
    ),
    criticalSystemTopology: buildCriticalSystemTransitionEvidence(
      snapshot.criticalSystemTopology,
    ),
  });
}

function buildWindowTransitionEvidence({
  snapshot,
  previousStabilityWindow,
  nextStabilityWindow,
  stableConfirmationCount,
}) {
  return Object.freeze({
    windowTransition: resolveSchemaStabilityWindowTransition({
      snapshot,
      previousStabilityWindow,
      nextStabilityWindow,
    }),
    windowPhase: normalizeOptionalString(nextStabilityWindow?.phase),
    windowStartedAtMs: normalizeOptionalNonNegativeInteger(
      nextStabilityWindow?.startedAtMs,
    ),
    lastQuiescentObservationAtMs: normalizeOptionalNonNegativeInteger(
      nextStabilityWindow?.lastQuiescentObservationAtMs,
    ),
    stableConfirmationCount: normalizeOptionalNonNegativeInteger(
      stableConfirmationCount,
    ),
  });
}

function buildSchemaAdmissionTransition(options) {
  return Object.freeze({
    firstObservedAtMs: options.observedAtMs,
    lastObservedAtMs: options.observedAtMs,
    observationCount: 1,
    ...buildSnapshotTransitionEvidence(options.snapshot),
    ...buildWindowTransitionEvidence(options),
  });
}

function schemaAdmissionTransitionFingerprint(transition) {
  return JSON.stringify([
    transition.state,
    transition.canonicalBlocker,
    transition.reasonCodes,
    transition.ready,
    transition.stabilityWindowHeld,
    transition.effectiveInFlightCount,
    transition.controlPlanePressureReasonCodes,
    transition.criticalSystemTopology,
    transition.windowTransition,
    transition.windowPhase,
    transition.stableConfirmationCount,
  ]);
}

function updateRepeatedSchemaAdmissionTransition(
  transition,
  nextTransition,
) {
  return Object.freeze({
    ...transition,
    lastObservedAtMs: nextTransition.lastObservedAtMs,
    observationCount: transition.observationCount + 1,
    stableElapsedMs: nextTransition.stableElapsedMs,
    windowStartedAtMs: nextTransition.windowStartedAtMs,
    lastQuiescentObservationAtMs:
      nextTransition.lastQuiescentObservationAtMs,
  });
}

function advanceSchemaAdmissionTransitionHistory(
  history,
  transitionOptions,
) {
  const currentHistory =
    history?.schemaVersion ===
      SCHEMA_ADMISSION_TRANSITION_HISTORY_SCHEMA_VERSION &&
    Array.isArray(history.transitions) ?
      history :
      buildEmptySchemaAdmissionTransitionHistory();
  const transition = buildSchemaAdmissionTransition(transitionOptions);
  const transitions = [...currentHistory.transitions];
  const previousTransition = transitions.at(-1);
  if (
    previousTransition &&
    schemaAdmissionTransitionFingerprint(previousTransition) ===
      schemaAdmissionTransitionFingerprint(transition)
  ) {
    transitions[transitions.length - 1] =
      updateRepeatedSchemaAdmissionTransition(
        previousTransition,
        transition,
      );
    return Object.freeze({
      ...currentHistory,
      transitions: Object.freeze(transitions),
    });
  }
  transitions.push(transition);
  const droppedNow = Math.max(
    ZERO,
    transitions.length - SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT,
  );
  return Object.freeze({
    ...currentHistory,
    droppedTransitionCount:
      currentHistory.droppedTransitionCount + droppedNow,
    transitions: Object.freeze(
      droppedNow > ZERO ? transitions.slice(droppedNow) : transitions,
    ),
  });
}

export {
  SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT,
  advanceSchemaAdmissionTransitionHistory,
  buildEmptySchemaAdmissionTransitionHistory,
};
