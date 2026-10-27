// Bounded observations for the existing participant-release interaction.
// These values explain a refusal; they never decide release, drain, retry,
// admission, recovery, or deadline policy.
import {types} from 'node:util';
import {PARTICIPANT_RELEASE_TRIGGER, PARTICIPANT_CUTOVER_BOUND} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const isProxy = types.isProxy;
const stringSlice = String.prototype.slice;
const DESCRIPTOR_VALUE = 'value';
const CONTROL_REFUSAL_FIELD = objectFreeze({
  MISSING_FACT: 'missingFact', PHASE: 'phase', REASON: 'reason',
});

function controlRefusalText(answer, field) {
  if (answer === null || typeof answer !== 'object' || isProxy(answer)) return null;
  let descriptor;
  try {
    descriptor = objectGetOwnPropertyDescriptor(answer, field);
  } catch {
    // Exotic own properties may be unavailable without invoking a getter.
    return null;
  }
  if (!descriptor || !objectHasOwn(descriptor, DESCRIPTOR_VALUE) ||
      typeof descriptor.value !== 'string') return null;
  return reflectApply(stringSlice, descriptor.value,
    [0, PARTICIPANT_CUTOVER_BOUND.CONTROL_REFUSAL_TEXT_MAX_LENGTH]);
}

// Own-data observations only: no getter/coercion, no retained nested answer.
// Strings are prefixes bounded by CONTROL_REFUSAL_TEXT_MAX_LENGTH, not identities.
function captureParticipantControlRefusal(answer) {
  return objectFreeze({
    controlMissingFact: controlRefusalText(answer, CONTROL_REFUSAL_FIELD.MISSING_FACT),
    controlPhase: controlRefusalText(answer, CONTROL_REFUSAL_FIELD.PHASE),
    controlReason: controlRefusalText(answer, CONTROL_REFUSAL_FIELD.REASON),
  });
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
  captureParticipantControlRefusal,
  captureParticipantReleaseDiagnosticTrigger,
  observeParticipantReleaseClockValue,
  safeClockInteger as participantReleaseSafeClockInteger,
  participantReleaseClockMeasured,
  participantReleaseAttemptAgeObservation,
  participantReleaseSeedBudgetObservation,
  readParticipantReleaseClock,
};
