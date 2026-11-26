// Bounded observations for the existing participant-release interaction.
// These values explain a refusal; they never decide release, drain, retry,
// admission, recovery, or deadline policy.
import {types} from 'node:util';
import {PARTICIPANT_RELEASE_TRIGGER, PARTICIPANT_CUTOVER_BOUND, PARTICIPANT_CUTOVER_OUTCOME} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {participantReleaseGenerationValid} from
  '../partition/partition-participant-release-contract.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const arrayIsArray = Array.isArray;
const isProxy = types.isProxy;
const isModuleNamespaceObject = types.isModuleNamespaceObject;
const stringSlice = String.prototype.slice;
const DESCRIPTOR_VALUE = 'value';
const OBSERVATION_TEXT_LIMIT = PARTICIPANT_CUTOVER_BOUND.CONTROL_REFUSAL_TEXT_MAX_LENGTH;
const {DRAIN_PENDING} = PARTICIPANT_CUTOVER_OUTCOME;
const NO_DRAIN_OBSERVATION = null;
const FIELD = objectFreeze({
  LIFECYCLE_INCARNATION: 'lifecycleIncarnation',
  NODE_ID: 'nodeId',
  OWNER_INCARNATION: 'ownerIncarnation',
  REPLICA_ID: 'replicaId',
  RUNTIME_GENERATION: 'runtimeGeneration',
  CONNECTION_GENERATION: 'connectionGeneration',
  ADMISSION_GENERATION: 'admissionGeneration',
  SQLITE_TRANSACTION_OPEN: 'sqliteTransactionOpen',
  PARTICIPANT_STAGING: 'participantStaging',
  PARTICIPANT_PREPARED: 'participantPrepared',
  PROPOSALS: 'proposals',
  PENDING_OUTCOMES: 'pendingOutcomes',
  APPLIED_INDEX: 'appliedIndex',
  COMMIT_INDEX: 'commitIndex',
  LAST_INDEX: 'lastIndex',
  GENERATION: 'generation',
  WORK: 'work',
  OUTCOME: 'outcome',
  BLOCKED_DRAIN: 'blockedDrain',
  MISSING_FACT: 'missingFact',
  PHASE: 'phase',
  REASON: 'reason',
  CONTROL_PARTITION_ID: 'controlPartitionId',
  CONTROL_OUTCOME: 'controlOutcome',
  CONTROL_BLOCKED_DRAIN: 'controlBlockedDrain',
  CONTROL_NODE_ID: 'controlNodeId',
  CONTROL_MISSING_FACT: 'controlMissingFact',
  CONTROL_PHASE: 'controlPhase',
  CONTROL_REASON: 'controlReason',
});

function ownDataField(record, field) {
  // Uninitialized module bindings can throw during descriptor inspection.
  if (record === null || typeof record !== 'object' || isProxy(record) ||
      arrayIsArray(record) || isModuleNamespaceObject(record)) return null;
  const descriptor = objectGetOwnPropertyDescriptor(record, field);
  return descriptor && objectHasOwn(descriptor, DESCRIPTOR_VALUE) ? descriptor.value : null;
}

function controlRefusalText(answer, field) {
  const value = ownDataField(answer, field);
  return typeof value === 'string' ? reflectApply(stringSlice, value, [0, OBSERVATION_TEXT_LIMIT]) :
    null;
}

function boundedIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= OBSERVATION_TEXT_LIMIT ?
    value : null;
}

function releaseDrainGeneration(record) {
  const lifecycle = ownDataField(record, FIELD.LIFECYCLE_INCARNATION);
  const generation = {
    nodeId: boundedIdentity(ownDataField(record, FIELD.NODE_ID)),
    ownerIncarnation: ownDataField(record, FIELD.OWNER_INCARNATION),
    replicaId: boundedIdentity(ownDataField(record, FIELD.REPLICA_ID)),
    lifecycleIncarnation: typeof lifecycle === 'string' ? boundedIdentity(lifecycle) : lifecycle,
    runtimeGeneration: ownDataField(record, FIELD.RUNTIME_GENERATION),
    connectionGeneration: ownDataField(record, FIELD.CONNECTION_GENERATION),
    admissionGeneration: ownDataField(record, FIELD.ADMISSION_GENERATION),
  };
  return participantReleaseGenerationValid(generation) ? objectFreeze(generation) : null;
}

function releaseDrainWork(record) {
  const work = {
    sqliteTransactionOpen: ownDataField(record, FIELD.SQLITE_TRANSACTION_OPEN),
    participantStaging: ownDataField(record, FIELD.PARTICIPANT_STAGING),
    participantPrepared: ownDataField(record, FIELD.PARTICIPANT_PREPARED),
    proposals: ownDataField(record, FIELD.PROPOSALS),
    pendingOutcomes: ownDataField(record, FIELD.PENDING_OUTCOMES),
    appliedIndex: ownDataField(record, FIELD.APPLIED_INDEX),
    commitIndex: ownDataField(record, FIELD.COMMIT_INDEX),
    lastIndex: ownDataField(record, FIELD.LAST_INDEX),
  };
  return typeof work.sqliteTransactionOpen === 'boolean' &&
    typeof work.participantStaging === 'boolean' &&
    [work.participantPrepared, work.proposals, work.pendingOutcomes,
      work.appliedIndex, work.commitIndex, work.lastIndex].every((value) =>
      safeClockInteger(value) && value >= 0) ? objectFreeze(work) : null;
}

function blockedDrainOf(answer, field) {
  const blockedDrain = ownDataField(answer, field);
  const generation = releaseDrainGeneration(ownDataField(blockedDrain, FIELD.GENERATION));
  if (generation === null) return NO_DRAIN_OBSERVATION;
  const work = releaseDrainWork(ownDataField(blockedDrain, FIELD.WORK));
  return work === null ? NO_DRAIN_OBSERVATION : objectFreeze({generation, work});
}

// Bounded text prefixes and one exact diagnostic drain. The canonical
// release answer supplies every value without granting authority here.
function captureParticipantControlRefusal(answer) {
  const controlBlockedDrain = ownDataField(answer, FIELD.OUTCOME) === DRAIN_PENDING ?
    blockedDrainOf(answer, FIELD.BLOCKED_DRAIN) : null;
  return objectFreeze({
    controlMissingFact: controlRefusalText(answer, FIELD.MISSING_FACT),
    controlPhase: controlRefusalText(answer, FIELD.PHASE),
    controlReason: controlRefusalText(answer, FIELD.REASON),
    ...(controlBlockedDrain === null ? {} : {controlBlockedDrain}),
  });
}

function captureParticipantReleaseRecoveryDetail(answer) {
  if (ownDataField(answer, FIELD.OUTCOME) === DRAIN_PENDING) {
    const blockedDrain = blockedDrainOf(answer, FIELD.BLOCKED_DRAIN);
    return blockedDrain === null ? {} : {blockedDrain};
  }
  const controlPartitionId = boundedIdentity(ownDataField(answer, FIELD.CONTROL_PARTITION_ID));
  if (controlPartitionId === null) return {};
  const controlOutcome = boundedIdentity(ownDataField(answer, FIELD.CONTROL_OUTCOME));
  const controlBlockedDrain = controlOutcome === DRAIN_PENDING ?
    blockedDrainOf(answer, FIELD.CONTROL_BLOCKED_DRAIN) : null;
  return {
    controlPartitionId,
    controlNodeId: boundedIdentity(ownDataField(answer, FIELD.CONTROL_NODE_ID)),
    controlOutcome,
    controlMissingFact: controlRefusalText(answer, FIELD.CONTROL_MISSING_FACT),
    controlPhase: controlRefusalText(answer, FIELD.CONTROL_PHASE),
    controlReason: controlRefusalText(answer, FIELD.CONTROL_REASON),
    ...(controlBlockedDrain === null ? {} : {controlBlockedDrain}),
  };
}

const CLOCK_STATE = objectFreeze({
  MEASURED: 'measured',
  UNAVAILABLE: 'unavailable',
  UNSAFE: 'unsafe',
  NONMONOTONIC: 'nonmonotonic',
});

function frozenClockObservation(state, value = null) {
  return objectFreeze({state, value});
}

function safeClockInteger(value) {
  return typeof value === 'number' &&
    numberIsSafeInteger(value) && !objectIs(value, -0);
}

function observeParticipantReleaseClockValue(value) {
  return safeClockInteger(value) ?
    frozenClockObservation(CLOCK_STATE.MEASURED, value) :
    frozenClockObservation(CLOCK_STATE.UNSAFE);
}

function readParticipantReleaseClock(timeSource) {
  try {
    const now = timeSource?.now;
    return typeof now === 'function' ?
      observeParticipantReleaseClockValue(reflectApply(now, timeSource, [])) :
      frozenClockObservation(CLOCK_STATE.UNAVAILABLE);
  } catch {
    return frozenClockObservation(CLOCK_STATE.UNAVAILABLE);
  }
}

function captureParticipantReleaseDiagnosticTrigger(request) {
  const copied = copyStrictOwnDataRecord(request);
  const trigger = copied?.trigger;
  return typeof trigger === 'string' &&
    (trigger === PARTICIPANT_RELEASE_TRIGGER.OPERATOR ||
      trigger === PARTICIPANT_RELEASE_TRIGGER.EXISTING_ORIGIN ||
      trigger === PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED ||
      trigger === PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE) ? trigger : null;
}

function clockUnavailable(observation) {
  return observation?.state === CLOCK_STATE.UNAVAILABLE;
}

function participantReleaseClockMeasured(observation) {
  return observation?.state === CLOCK_STATE.MEASURED;
}

function unsafeObservationState(left, right, third = null) {
  if (clockUnavailable(left) || clockUnavailable(right) || clockUnavailable(third)) {
    return CLOCK_STATE.UNAVAILABLE;
  }
  return participantReleaseClockMeasured(left) &&
    participantReleaseClockMeasured(right) &&
    (third === null || participantReleaseClockMeasured(third)) ? null : CLOCK_STATE.UNSAFE;
}

function safeDifference(later, earlier) {
  const difference = later - earlier;
  return safeClockInteger(difference) ? difference : null;
}

function measuredBudgetOf(value) {
  return safeClockInteger(value) && value >= 0 ? value : null;
}

function participantReleaseAttemptAgeObservation(start, join, terminal, originalTrigger) {
  const unavailableOrUnsafe = unsafeObservationState(start, join, terminal);
  if (unavailableOrUnsafe !== null) {
    return objectFreeze({originalTrigger, clockState: unavailableOrUnsafe,
      joinAgeMs: null, terminalAgeMs: null});
  }
  const joinAgeMs = safeDifference(join.value, start.value);
  const terminalAgeMs = safeDifference(terminal.value, start.value);
  const safe = joinAgeMs !== null && terminalAgeMs !== null;
  const monotonic = start.value <= join.value && join.value <= terminal.value;
  const clockState = !safe ? CLOCK_STATE.UNSAFE :
    monotonic ? CLOCK_STATE.MEASURED : CLOCK_STATE.NONMONOTONIC;
  return objectFreeze({originalTrigger, clockState,
    joinAgeMs: clockState === CLOCK_STATE.MEASURED ? joinAgeMs : null,
    terminalAgeMs: clockState === CLOCK_STATE.MEASURED ? terminalAgeMs : null});
}

function participantReleaseSeedBudgetObservation(start, terminal, budgetMs) {
  const measuredBudget = measuredBudgetOf(budgetMs);
  const unavailableOrUnsafe = unsafeObservationState(start, terminal);
  const invalidState = unavailableOrUnsafe ??
    (measuredBudget === null ? CLOCK_STATE.UNSAFE : null);
  if (invalidState !== null) {
    return objectFreeze({clockState: invalidState,
      budgetMs: measuredBudget, elapsedMs: null, remainingMs: null});
  }
  const elapsedMs = safeDifference(terminal.value, start.value);
  const remainingMs = elapsedMs !== null && elapsedMs < budgetMs ?
    safeDifference(budgetMs, elapsedMs) : 0;
  const safe = elapsedMs !== null && remainingMs !== null;
  const clockState = !safe ? CLOCK_STATE.UNSAFE :
    terminal.value < start.value ? CLOCK_STATE.NONMONOTONIC : CLOCK_STATE.MEASURED;
  return objectFreeze({clockState, budgetMs,
    elapsedMs: clockState === CLOCK_STATE.MEASURED ? elapsedMs : null,
    remainingMs: clockState === CLOCK_STATE.MEASURED ? remainingMs : null});
}

export {
  controlRefusalText as releaseDiagnosticText,
  captureParticipantControlRefusal,
  captureParticipantReleaseRecoveryDetail,
  captureParticipantReleaseDiagnosticTrigger,
  observeParticipantReleaseClockValue,
  safeClockInteger as participantReleaseSafeClockInteger,
  participantReleaseClockMeasured,
  participantReleaseAttemptAgeObservation,
  participantReleaseSeedBudgetObservation,
  readParticipantReleaseClock,
};
