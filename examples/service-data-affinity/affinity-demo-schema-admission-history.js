import {
  CONTROL_SNAPSHOT_LEASE_AGE_STATE,
} from '../../src/admin/admin-control-snapshot-stale-watermark-record.js';

const SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT = 64;
const SCHEMA_ADMISSION_TRANSITION_HISTORY_SCHEMA_VERSION = 1;
const SCHEMA_STABILITY_WINDOW_PHASE_OBSERVING = 'observing';
const READY_LEASE_WITNESS_STATE_AVAILABLE = 'available';
const NOT_EXPIRED_AGE_CEILING_MS = 0;
const NO_WITNESS_CHANGES = 0;
const ABSENT_READY_LEASE_WITNESS = Object.freeze({
  observedAtMs: null,
  state: null,
  reason: null,
  staleNodeId: null,
  status: null,
  connectionState: null,
  readyLeaseState: null,
  leaseAgeState: CONTROL_SNAPSHOT_LEASE_AGE_STATE.UNAVAILABLE,
  readyLeaseAgeMs: null,
  leaseExpiredForMs: null,
});
// What makes one witness a DIFFERENT observation of the cluster: which node
// is named and what state its lease is in. The age is deliberately excluded -
// it advances on every poll of a lapsed lease, and counting that would say
// only that time passes.
const READY_LEASE_WITNESS_COMPARED_FIELDS = Object.freeze([
  'state', 'reason', 'staleNodeId', 'status', 'connectionState',
  'readyLeaseState', 'leaseAgeState',
]);
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

function normalizeOptionalFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

// The control snapshot's ready-lease witness, carried on the transition it
// belongs to. The traced run recorded it only on the snapshot the wait
// failed with, so which node held the lapsed lease at any earlier point was
// unrecoverable. This is a bounded projection of that witness - no list, no
// growth - and it enters no fingerprint, so it decides nothing. `staleNodeId`
// is a role key: a plain `nodeId` reads as the EMITTING node once the logging
// service has rewritten it. A lease that has not lapsed is a named state, not
// a negative "expired for": the watermark predicate admits such rows.
function buildReadyLeaseWitnessTransitionEvidence(
  readyLeaseAgeWitness,
  observedAtMs,
) {
  if (!readyLeaseAgeWitness ||
      typeof readyLeaseAgeWitness !== 'object' ||
      Array.isArray(readyLeaseAgeWitness)) {
    return Object.freeze({
      ...ABSENT_READY_LEASE_WITNESS,
      observedAtMs: normalizeOptionalNonNegativeInteger(observedAtMs),
    });
  }
  const readyLease = readyLeaseAgeWitness.readyLease;
  const ageMs = readyLease?.state === READY_LEASE_WITNESS_STATE_AVAILABLE ?
    normalizeOptionalFiniteNumber(readyLease.ageMs) :
    null;
  const expired = ageMs !== null && ageMs >= NOT_EXPIRED_AGE_CEILING_MS;
  return Object.freeze({
    observedAtMs: normalizeOptionalNonNegativeInteger(observedAtMs),
    state: normalizeOptionalString(readyLeaseAgeWitness.state),
    reason: normalizeOptionalString(readyLeaseAgeWitness.reason),
    staleNodeId: normalizeOptionalString(readyLeaseAgeWitness.nodeId),
    status: normalizeOptionalString(readyLeaseAgeWitness.status),
    connectionState: normalizeOptionalString(
      readyLeaseAgeWitness.connectionState,
    ),
    readyLeaseState: normalizeOptionalString(readyLease?.state),
    leaseAgeState: ageMs === null ?
      CONTROL_SNAPSHOT_LEASE_AGE_STATE.UNAVAILABLE :
      (expired ?
        CONTROL_SNAPSHOT_LEASE_AGE_STATE.EXPIRED :
        CONTROL_SNAPSHOT_LEASE_AGE_STATE.NOT_EXPIRED),
    readyLeaseAgeMs: ageMs,
    leaseExpiredForMs: expired ? ageMs : null,
  });
}

// Two witnesses are the same observation of the cluster when the node they
// name and the state of its lease match; WHEN each was observed, and how old
// the lease was then, are carried on the witnesses themselves, so a merged
// run can say which observation each of its two witnesses came from.
function isSameReadyLeaseWitness(left, right) {
  return READY_LEASE_WITNESS_COMPARED_FIELDS.every(
    (field) => left[field] === right[field],
  );
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
    ...buildReadyLeaseWitnessRecord(
      buildReadyLeaseWitnessTransitionEvidence(
        options.snapshot?.readyLeaseAgeWitness,
        options.observedAtMs,
      ),
    ),
  });
}

function buildReadyLeaseWitnessRecord(witness) {
  return {
    readyLeaseWitness: witness,
    latestReadyLeaseWitness: witness,
    readyLeaseWitnessChangeCount: NO_WITNESS_CHANGES,
  };
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

// A repeated observation is not a transition, so the FIRST witness of the run
// is kept - but the named node can change inside a merged run, and that was
// invisible. The latest witness is carried beside the first one, each stamped
// with the observation it belongs to, plus how often it changed. None of this
// enters the fingerprint, so what merges with what is unchanged.
function updateRepeatedSchemaAdmissionTransition(
  transition,
  nextTransition,
) {
  const changed = !isSameReadyLeaseWitness(
    transition.latestReadyLeaseWitness,
    nextTransition.readyLeaseWitness,
  );
  return Object.freeze({
    ...transition,
    lastObservedAtMs: nextTransition.lastObservedAtMs,
    observationCount: transition.observationCount + 1,
    stableElapsedMs: nextTransition.stableElapsedMs,
    windowStartedAtMs: nextTransition.windowStartedAtMs,
    lastQuiescentObservationAtMs:
      nextTransition.lastQuiescentObservationAtMs,
    latestReadyLeaseWitness: nextTransition.readyLeaseWitness,
    readyLeaseWitnessChangeCount:
      transition.readyLeaseWitnessChangeCount + (changed ? 1 : 0),
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
