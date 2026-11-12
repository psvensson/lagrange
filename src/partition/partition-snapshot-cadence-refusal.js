// The standing refusal of a partition's checkpoint cadence. An attempt that
// built (or tried to build) a replica image and was refused is not repeated
// on every sweep: the refusal stands, with the applied index and the
// checkpoint identity it was measured at, until the named event that can
// change its reason (the log advanced, the identity changed) and a spacing
// that doubles per consecutive refusal, or until the declared bound. Pure
// values; the cadence owner keeps the one record and decides with it.

import {
  PARTITION_SNAPSHOT_CADENCE_RETRY as RETRY,
  PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER as TRIGGER,
} from './partition-snapshot-progress-constants.js';

// What the cadence does with an attempt it is about to make.
const PARTITION_SNAPSHOT_CADENCE_ATTEMPT = Object.freeze({
  // No refusal stands: the ordinary attempt.
  UNHELD: 'unheld',
  // A refusal stands and nothing lifts it.
  HELD: 'held',
});

// The cadence's refusal record while no refusal stands.
const NO_STANDING_REFUSAL = null;
const DOUBLING_BASE = 2;

function retrySpacingMs(attempts) {
  return Math.min(RETRY.BOUND_MS,
    RETRY.BASE_MS * (DOUBLING_BASE ** (attempts - 1)));
}

function changeTrigger(refusal, attempt) {
  if (attempt.appliedIndex > refusal.appliedIndex) {
    return TRIGGER.APPLIED_INDEX_ADVANCED;
  }
  return attempt.identityKey === refusal.identityKey ?
    PARTITION_SNAPSHOT_CADENCE_ATTEMPT.HELD : TRIGGER.IDENTITY_CHANGED;
}

/**
 * Whether the cadence may attempt now.
 * @param {Object|null} refusal - The standing refusal, or
 *   NO_STANDING_REFUSAL.
 * @param {Object} attempt - {nowMs, appliedIndex, identityKey} of this sweep.
 * @return {string} UNHELD, HELD, or the retry trigger that lifts the refusal.
 */
function cadenceAttemptDecision(refusal, attempt) {
  if (refusal === NO_STANDING_REFUSAL) {
    return PARTITION_SNAPSHOT_CADENCE_ATTEMPT.UNHELD;
  }
  const elapsedMs = attempt.nowMs - refusal.lastAtMs;
  if (elapsedMs >= RETRY.BOUND_MS) {
    return TRIGGER.BOUND_ELAPSED;
  }
  return elapsedMs >= retrySpacingMs(refusal.attempts) ?
    changeTrigger(refusal, attempt) : PARTITION_SNAPSHOT_CADENCE_ATTEMPT.HELD;
}

/**
 * The refusal standing after one more refused attempt.
 * @param {Object|null} previous - The refusal that stood before it.
 * @param {Object} attempt - {nowMs, appliedIndex, identityKey}.
 * @param {Object} refused - {outcome, reason} of the attempt.
 * @return {Object} The frozen standing refusal.
 */
function standingRefusal(previous, attempt, refused) {
  return Object.freeze({
    outcome: refused.outcome,
    reason: refused.reason,
    attempts: previous === NO_STANDING_REFUSAL ? 1 : previous.attempts + 1,
    firstAtMs: previous === NO_STANDING_REFUSAL ?
      attempt.nowMs : previous.firstAtMs,
    lastAtMs: attempt.nowMs,
    appliedIndex: attempt.appliedIndex,
    identityKey: attempt.identityKey,
  });
}

export {
  NO_STANDING_REFUSAL,
  PARTITION_SNAPSHOT_CADENCE_ATTEMPT,
  cadenceAttemptDecision,
  standingRefusal,
};
