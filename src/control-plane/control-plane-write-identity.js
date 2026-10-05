import {randomUUID} from 'node:crypto';
import {
  isPartitionWriteFailureCode,
  isWriteOutcomeUnknown,
} from '../partition/partition-write-kernel.js';

// The identity one logical control-plane write is delivered under, across
// every attempt its callers make (R07: an unknown outcome is resolved only by
// the same entry). The write plan derives each partition participant's
// entryId from this idempotency key, so two attempts under one key are one
// committed entry: the second is answered from the first's outcome row - the
// original result - or runs for the first time; never a second apply.
//
// - A caller that holds a stable key passes it (`idempotencyKey`).
// - A caller whose logical write outlives one call (a registration re-driven
//   by its join, an endpoint birth, a reservation ensured again) names it
//   (`writeIdentity`): its key is minted once and HELD while the write's
//   outcome is unknown, so the next attempt of that write is the same entry;
//   it is released once an attempt is answered known (applied, failed for
//   good, or not proposed), so a later write of the same name is a new entry.
// - Otherwise the key is minted for this one call, and the call's own retry
//   loops (the CDC routed mutation, the engine) re-use it.
const CONTROL_PLANE_WRITE_KEY_PREFIX = 'cpw-';
// Bound of the held identities (a write whose outcome stays unknown and is
// never attempted again); the oldest is dropped first.
const MAX_HELD_WRITE_IDENTITIES = 4096;
const LINKED_ANSWER_FIELDS = Object.freeze([
  'partitionResult',
  'firstFailedParticipant',
  'cause',
]);
const LINKED_ANSWER_LIST_FIELDS = Object.freeze([
  'participantFailures',
  'partitionErrors',
]);
const MAX_LINK_DEPTH = 4;
const STRING_TYPE = 'string';
const OBJECT_TYPE = 'object';

const heldWriteKeys = new Map();

function isNonEmptyString(value) {
  return typeof value === STRING_TYPE && value.length > 0;
}

/**
 * Mint one control-plane write's idempotency key.
 * @return {string} A fresh key.
 */
function mintControlPlaneWriteKey() {
  return `${CONTROL_PLANE_WRITE_KEY_PREFIX}${randomUUID()}`;
}

function holdWriteKey(writeIdentity, key) {
  heldWriteKeys.set(writeIdentity, key);
  if (heldWriteKeys.size > MAX_HELD_WRITE_IDENTITIES) {
    heldWriteKeys.delete(heldWriteKeys.keys().next().value);
  }
}

/**
 * The idempotency key this attempt of a write is delivered under: the
 * caller's key; the key held for its named write (minted once when none is
 * held); or a key minted for this call.
 * @param {Object} [options] - {idempotencyKey?, writeIdentity?}.
 * @return {string} The key.
 */
function resolveControlPlaneWriteKey(options = {}) {
  if (isNonEmptyString(options?.idempotencyKey)) {
    return options.idempotencyKey;
  }
  if (!isNonEmptyString(options?.writeIdentity)) {
    return mintControlPlaneWriteKey();
  }
  const held = heldWriteKeys.get(options.writeIdentity);
  if (held !== undefined) {
    return held;
  }
  const minted = mintControlPlaneWriteKey();
  holdWriteKey(options.writeIdentity, minted);
  return minted;
}

// Whether an answer, or any answer linked to it (the partition result it
// wraps, its participants' failures, its cause), satisfies `predicate`.
function someLinkedAnswer(answer, predicate, depth = 0) {
  if (!answer || typeof answer !== OBJECT_TYPE || depth > MAX_LINK_DEPTH) {
    return false;
  }
  if (predicate(answer)) {
    return true;
  }
  for (const field of LINKED_ANSWER_FIELDS) {
    if (someLinkedAnswer(answer[field], predicate, depth + 1)) {
      return true;
    }
  }
  return LINKED_ANSWER_LIST_FIELDS.some((field) =>
    Array.isArray(answer[field]) && answer[field].some((linked) =>
      someLinkedAnswer(linked, predicate, depth + 1)));
}

// A typed answer that says what became of the write: a committed statement
// failed, or the write was refused before it was proposed.
function isKnownTypedAnswer(answer) {
  return answer.committed === true ||
    (isPartitionWriteFailureCode(answer.failureCode) &&
      !isWriteOutcomeUnknown(answer));
}

/**
 * Whether a write's answer - or any answer linked to it - is the typed
 * unknown outcome.
 * @param {*} answer - A result or error.
 * @return {boolean} Whether its outcome is not known.
 */
function isControlPlaneWriteOutcomeUnknown(answer) {
  return someLinkedAnswer(answer, isWriteOutcomeUnknown);
}

/**
 * Settle a named write's held key after one attempt: kept while the outcome
 * is unknown (a typed unknown answer, or a thrown attempt whose error says
 * nothing typed of the write - nothing says it did not apply), released once
 * the attempt is answered known.
 * @param {Object} [options] - The attempt's {idempotencyKey?,
 *   writeIdentity?}.
 * @param {*} answer - The attempt's result, or what it threw.
 * @param {boolean} [thrown] - Whether the attempt threw.
 */
function settleControlPlaneWriteKey(options = {}, answer = null,
  thrown = false) {
  if (isNonEmptyString(options?.idempotencyKey) ||
    !isNonEmptyString(options?.writeIdentity)) {
    return;
  }
  if (isControlPlaneWriteOutcomeUnknown(answer) ||
    (thrown && !someLinkedAnswer(answer, isKnownTypedAnswer))) {
    return;
  }
  heldWriteKeys.delete(options.writeIdentity);
}

/**
 * Run one attempt of a write whose key was resolved for it
 * (resolveControlPlaneWriteKey), settling a named write's held key by the
 * attempt's answer.
 * @param {Object} options - The caller's {idempotencyKey?, writeIdentity?}.
 * @param {Function} attempt - () => Promise of the answer.
 * @return {Promise<*>} The attempt's answer.
 */
async function settleControlPlaneWriteAttempt(options, attempt) {
  let answer;
  try {
    answer = await attempt();
  } catch (error) {
    settleControlPlaneWriteKey(options, error, true);
    throw error;
  }
  settleControlPlaneWriteKey(options, answer, false);
  return answer;
}

export {
  mintControlPlaneWriteKey,
  resolveControlPlaneWriteKey,
  settleControlPlaneWriteAttempt,
};
