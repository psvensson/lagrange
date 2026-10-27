import {COLUMN} from '../constants/columns.js';

let serviceRowCreatedAtHighWater = 0;
const SERVICE_ROW_INCARNATION_EXHAUSTED =
  'Service row incarnation space exhausted';

/**
 * Mint one process-lifetime-unique durable SERVICES row incarnation
 * (created_at) for a partition or message-group replica birth.
 *
 * Registration evidence is deliberately process-local: its WeakSet brand
 * cannot survive or cross a process boundary. While such evidence can still
 * exist, every SERVICES row creator executes in this owner isolate and shares
 * this bounded high-water. The data-directory process guard excludes a second
 * process; after restart, old evidence has lost its brand. The durable
 * created_at value therefore cannot be reused while evidence for its former
 * incarnation remains admissible: a replica removed and reborn under the same
 * id in the same millisecond (or under a regressed clock) gets a distinct
 * created_at, so a delayed removal of the old generation cannot match it.
 * @param {number} requestedTimestamp Owner clock candidate.
 * @return {number} Monotonic durable incarnation value.
 */
function mintServiceRowCreatedAt(requestedTimestamp) {
  const requested = Number.isSafeInteger(requestedTimestamp) ?
    requestedTimestamp :
    Date.now();
  if (serviceRowCreatedAtHighWater >= Number.MAX_SAFE_INTEGER) {
    throw new Error(SERVICE_ROW_INCARNATION_EXHAUSTED);
  }
  const createdAt = Math.max(
    requested,
    serviceRowCreatedAtHighWater + 1,
  );
  serviceRowCreatedAtHighWater = createdAt;
  return createdAt;
}

// Birth identity is shared by the two SERVICES registration owners. Lifecycle
// status/generation, observation availability and publication rights stay with
// their existing owners; role and update timestamps are not birth identity.
const SERVICE_ROW_BIRTH_FIELDS = Object.freeze([
  COLUMN.SERVICE_ID,
  COLUMN.SERVICE_TYPE,
  COLUMN.PARTITION_ID,
  COLUMN.GROUP_ID,
  COLUMN.NODE_ID,
  COLUMN.REPLICA_ID,
  COLUMN.ADDRESS,
  COLUMN.CREATED_AT,
]);

/**
 * Compare an authoritative observation with the exact owner-built birth sent.
 * This comparison neither grants a new INSERT nor proves current activation.
 * @param {Object|null} observed - One authoritative SERVICES row.
 * @param {Object} expected - The captured row of the original invocation.
 * @return {boolean} Whether the immutable birth identity matches exactly.
 */
function isExactServiceRowBirth(observed, expected) {
  return Number.isSafeInteger(observed?.[COLUMN.CREATED_AT]) &&
    observed?.create_attempt_token === expected?.create_attempt_token &&
    SERVICE_ROW_BIRTH_FIELDS.every((field) =>
      observed?.[field] === expected?.[field]);
}

export {mintServiceRowCreatedAt, isExactServiceRowBirth};
