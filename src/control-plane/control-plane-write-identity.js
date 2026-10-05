import {createHash, randomUUID} from 'node:crypto';
import {ERRORS} from '../constants/errors.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
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
// - A caller that holds a stable key passes it (`idempotencyKey`); it owns
//   that key's lifetime and content.
// - Otherwise a key is minted for this one call (its own retry loops - the
//   CDC routed mutation, the engine - re-use it).
// - A caller whose logical write outlives one call names it
//   (`writeIdentity`, built with controlPlaneWriteIdentity). THE RULE: one
//   entry identity never stands for two logical writes.
//   * A name has at most one INSTANCE at a time: a held record {instance
//     nonce, content digest, key}. Its key is derived from the name, the
//     instance nonce and the digest of the exact content the write carries,
//     so changed content can never be answered with another content's
//     outcome.
//   * A write of the name with the held digest is a re-drive of that same
//     instance: the same key, the same entry.
//   * Any other write of the name is a new logical write. While the held
//     instance is unresolved it is resolved FIRST - its own content
//     re-delivered under its own key (the executor's partition delivery,
//     the one re-delivery owner, re-delivers it under its entryId) - and only
//     then is the new write issued, as a new instance (its answer carries the
//     resolved `pendingInstance`). An instance still unresolved answers the
//     new write with the typed unknown outcome naming it: nothing is applied
//     for content that was not written.
//   * An owner whose logical write is settled by ANY applied instance of its
//     name (a registration's birth or advance at its incarnation, a
//     reservation's birth: every instance writes the same row's birth) says
//     so (`pendingAppliedSettles`): when the resolved pending instance
//     applied, the new content is not issued - it could only collide with
//     the row its pending instance wrote - and the write is answered with
//     the typed CONTROL_PLANE_WRITE_PENDING_INSTANCE_APPLIED carrying the
//     pending instance, for the owner to classify (nothing of this content
//     was applied).
//   * An instance lives for exactly one logical write. It is released when
//     an attempt settles its entry (applied, or a committed statement's
//     failure), when its FIRST attempt is refused before it was proposed
//     (nothing of it can commit), and by its owning authority once that
//     authority classified any outcome other than "still unresolved"
//     (readback, refusal, supersession, abandonment) or its row was deleted
//     or its incarnation ended (releaseControlPlaneWriteIdentities). A
//     refusal before proposal does not release an instance an earlier
//     attempt left unknown: that entry may still commit.
//   * The held records are bounded (MAX_HELD_WRITE_INSTANCES). A held
//     instance is never evicted: at the bound a NEW named write is refused
//     before it is delivered (typed, retryable), so no unresolved instance
//     is forgotten and re-born blind.
const CONTROL_PLANE_WRITE_KEY_PREFIX = 'cpw-';
const MAX_HELD_WRITE_INSTANCES = 4096;
const CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE =
  'CONTROL_PLANE_WRITE_IDENTITY_CAPACITY';
const CONTROL_PLANE_WRITE_PENDING_INSTANCE_APPLIED_CODE =
  'CONTROL_PLANE_WRITE_PENDING_INSTANCE_APPLIED';
const PENDING_INSTANCE_APPLIED_MESSAGE = 'An earlier instance of this ' +
  'logical write applied; this content was not issued';
const CAPACITY_RETRY_AFTER_MS = 1000;
const CAPACITY_REFUSAL_MESSAGE = 'Control-plane write identities at capacity';
const PENDING_INSTANCE_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
});
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const KEY_DIGEST_LENGTH = 32;
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
const BIGINT_TYPE = 'bigint';
const NAME_PART_SEPARATOR = ',';

const heldInstances = new Map();

function isNonEmptyString(value) {
  return typeof value === STRING_TYPE && value.length > 0;
}

/**
 * Mint one control-plane write's idempotency key (a write delivered under a
 * key of its own, or a retry loop's own name).
 * @return {string} A fresh key.
 */
function mintControlPlaneWriteKey() {
  return `${CONTROL_PLANE_WRITE_KEY_PREFIX}${randomUUID()}`;
}

/**
 * The name of a logical control-plane write: its parts (subject first, verb
 * last), so an owner can release every name of a subject at once.
 * @param {...*} parts - JSON values, e.g. ('endpoint', id, inc, 'birth').
 * @return {string} The write identity.
 */
function controlPlaneWriteIdentity(...parts) {
  return JSON.stringify(parts);
}

/**
 * Release every held instance whose name is these parts or starts with them
 * (the subject's names), whatever their state: the owner classified the
 * write, or the row it wrote was deleted, or its incarnation ended.
 * @param {...*} parts - A name's parts, or a prefix of them.
 * @return {number} How many instances were released.
 */
function releaseControlPlaneWriteIdentities(...parts) {
  const exact = controlPlaneWriteIdentity(...parts);
  const prefix = `${exact.slice(0, -1)}${NAME_PART_SEPARATOR}`;
  let released = 0;
  for (const name of [...heldInstances.keys()]) {
    if (name === exact || name.startsWith(prefix)) {
      heldInstances.delete(name);
      released += 1;
    }
  }
  return released;
}

/**
 * Release the instance of one name (a retry loop's own name at its end).
 * @param {string} writeIdentity - The name.
 */
function releaseControlPlaneWriteIdentity(writeIdentity) {
  heldInstances.delete(writeIdentity);
}

/**
 * The digest of the exact content a write carries.
 * @param {*} content - Its statement and parameters, or its mutation.
 * @return {string} Hex digest.
 */
function digestWriteContent(content) {
  return createHash(DIGEST_ALGORITHM)
    .update(JSON.stringify(content ?? null, (_key, value) =>
      (typeof value === BIGINT_TYPE ? `${value}n` : value)))
    .digest(DIGEST_ENCODING);
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

function findLinkedEntryId(answer) {
  let entryId = null;
  someLinkedAnswer(answer, (linked) => {
    if (isWriteOutcomeUnknown(linked) && isNonEmptyString(linked.entryId)) {
      entryId = linked.entryId;
      return true;
    }
    return false;
  });
  return entryId;
}

const isCommittedAnswer = (answer) => answer.committed === true;
const isRefusedBeforeProposal = (answer) =>
  isPartitionWriteFailureCode(answer.failureCode) &&
  !isWriteOutcomeUnknown(answer) && answer.committed !== true;

// What one attempt says of its instance's entry: SETTLED (applied, or a
// committed statement failed), NOT_PROPOSED (refused before it was proposed
// and nothing of it is unknown), or UNKNOWN (anything else - nothing says it
// did not, or will not, apply).
const ATTEMPT_VERDICT = Object.freeze({
  SETTLED: 'settled',
  NOT_PROPOSED: 'not_proposed',
  UNKNOWN: 'unknown',
});

function judgeAttempt(answer, thrown) {
  if (someLinkedAnswer(answer, isWriteOutcomeUnknown)) {
    return ATTEMPT_VERDICT.UNKNOWN;
  }
  if (!thrown && answer?.success !== false) {
    return ATTEMPT_VERDICT.SETTLED;
  }
  if (someLinkedAnswer(answer, isCommittedAnswer)) {
    return ATTEMPT_VERDICT.SETTLED;
  }
  return someLinkedAnswer(answer, isRefusedBeforeProposal) ?
    ATTEMPT_VERDICT.NOT_PROPOSED : ATTEMPT_VERDICT.UNKNOWN;
}

function settleInstance(record, answer, thrown) {
  // The entry an attempt was answered unknown under: the instance's entry,
  // named by every later answer that resolves or reports it.
  record.entryId = findLinkedEntryId(answer) ?? record.entryId;
  const verdict = judgeAttempt(answer, thrown);
  const releases = verdict === ATTEMPT_VERDICT.SETTLED ||
    (verdict === ATTEMPT_VERDICT.NOT_PROPOSED && !record.unresolved);
  if (!releases) {
    record.unresolved = true;
  } else if (heldInstances.get(record.name) === record) {
    heldInstances.delete(record.name);
  }
  return releases;
}

// One attempt of an instance under its key; the instance is settled by the
// attempt's answer, or by what it threw.
async function attemptInstance(record, attempt) {
  let answer;
  try {
    answer = await attempt(record.key);
  } catch (error) {
    settleInstance(record, error, true);
    throw error;
  }
  settleInstance(record, answer, false);
  return answer;
}

function holdNewInstance(name, digest, attempt) {
  const instance = randomUUID();
  const key = `${CONTROL_PLANE_WRITE_KEY_PREFIX}${createHash(DIGEST_ALGORITHM)
    .update(JSON.stringify([name, instance, digest]))
    .digest(DIGEST_ENCODING)
    .slice(0, KEY_DIGEST_LENGTH)}`;
  // The instance's own content, for its re-delivery when a different write
  // of the name must first resolve it.
  const record = {name, instance, digest, key, unresolved: false,
    entryId: null, redeliver: attempt};
  heldInstances.set(name, record);
  return record;
}

function describePendingInstance(record, outcome, answer) {
  return Object.freeze({
    writeIdentity: record.name,
    instance: record.instance,
    idempotencyKey: record.key,
    entryId: findLinkedEntryId(answer) ?? record.entryId,
    outcome,
  });
}

function capacityRefusal(name) {
  return {
    success: false,
    error: `${CAPACITY_REFUSAL_MESSAGE} (${heldInstances.size}/${MAX_HELD_WRITE_INSTANCES} unresolved ` +
      `named writes held); ${name} was not delivered`,
    errorCode: CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
    retryable: true,
    deferRetry: true,
    retryAfterMs: CAPACITY_RETRY_AFTER_MS,
    heldWriteIdentities: heldInstances.size,
    heldWriteIdentityBound: MAX_HELD_WRITE_INSTANCES,
  };
}

// The held instance of a name, resolved under its own entry by re-delivering
// its own content: the pending instance it was, or - still unresolved - the
// answer naming it as the typed unknown (what the re-delivery threw is
// thrown again, carrying the pending instance).
async function resolvePendingInstance(record) {
  let answer;
  let thrown = false;
  try {
    answer = await attemptInstance(record, record.redeliver);
  } catch (error) {
    answer = error;
    thrown = true;
  }
  if (heldInstances.get(record.name) === record) {
    const pendingInstance = describePendingInstance(record,
      PENDING_INSTANCE_OUTCOME.UNKNOWN, answer);
    if (thrown) {
      throw withPendingInstance(answer, pendingInstance);
    }
    return {unresolved: {
      ...answer,
      success: false,
      error: someLinkedAnswer(answer, isWriteOutcomeUnknown) ?
        answer.error : ERRORS.WRITE_OUTCOME_UNKNOWN,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
      entryId: pendingInstance.entryId,
      pendingInstance,
    }};
  }
  const applied = !thrown && answer?.success !== false;
  return {pendingInstance: describePendingInstance(record, applied ?
    PENDING_INSTANCE_OUTCOME.APPLIED : PENDING_INSTANCE_OUTCOME.FAILED,
  answer)};
}

function withPendingInstance(answer, pendingInstance) {
  if (pendingInstance === null || !answer ||
    typeof answer !== OBJECT_TYPE) {
    return answer;
  }
  if (answer instanceof Error) {
    answer.pendingInstance = pendingInstance;
    return answer;
  }
  return {...answer, pendingInstance};
}

// The answer of a write an applied pending instance settles (its owner
// passed pendingAppliedSettles): not issued, named by the pending instance.
function pendingInstanceAppliedAnswer(pendingInstance) {
  return {
    success: false,
    error: PENDING_INSTANCE_APPLIED_MESSAGE,
    errorCode: CONTROL_PLANE_WRITE_PENDING_INSTANCE_APPLIED_CODE,
    pendingInstance,
  };
}

async function runNamedControlPlaneWrite(options, content, attempt) {
  const name = options.writeIdentity;
  const digest = digestWriteContent(content);
  let record = heldInstances.get(name);
  let pendingInstance = null;
  if (record !== undefined && record.digest !== digest) {
    const resolution = await resolvePendingInstance(record);
    if (resolution.unresolved) {
      return resolution.unresolved;
    }
    pendingInstance = resolution.pendingInstance;
    if (options.pendingAppliedSettles === true &&
      pendingInstance.outcome === PENDING_INSTANCE_OUTCOME.APPLIED) {
      return pendingInstanceAppliedAnswer(pendingInstance);
    }
    record = heldInstances.get(name);
    if (record !== undefined && record.digest !== digest) {
      // Another write of the name took the slot meanwhile: resolve that
      // one too before this one is issued.
      return runNamedControlPlaneWrite(options, content, attempt);
    }
  }
  if (record === undefined) {
    if (heldInstances.size >= MAX_HELD_WRITE_INSTANCES) {
      return capacityRefusal(name);
    }
    record = holdNewInstance(name, digest, attempt);
  }
  try {
    return withPendingInstance(await attemptInstance(record, attempt),
      pendingInstance);
  } catch (error) {
    throw withPendingInstance(error, pendingInstance);
  }
}

/**
 * Run one attempt of a control-plane write under its identity: the caller's
 * key; a key minted for this call; or - for a named write - its instance's
 * key per the rule above.
 * @param {Object} options - The caller's {idempotencyKey?, writeIdentity?}.
 * @param {*} content - The exact content this attempt carries (statement
 *   and parameters, or the mutation).
 * @param {Function} attempt - (idempotencyKey) => Promise of the answer.
 * @return {Promise<*>} The attempt's answer.
 */
function runControlPlaneWrite(options, content, attempt) {
  if (isNonEmptyString(options?.idempotencyKey)) {
    return attempt(options.idempotencyKey);
  }
  if (!isNonEmptyString(options?.writeIdentity)) {
    return attempt(mintControlPlaneWriteKey());
  }
  return runNamedControlPlaneWrite(options, content, attempt);
}

/**
 * Whether the pending instance an answer carries applied: an earlier
 * instance of the same logical write, resolved before this one was issued.
 * @param {*} answer - A write's answer or error.
 * @return {boolean} Whether it applied.
 */
function isPendingInstanceApplied(answer) {
  return answer?.pendingInstance?.outcome === PENDING_INSTANCE_OUTCOME.APPLIED;
}

export {
  CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
  controlPlaneWriteIdentity,
  isPendingInstanceApplied,
  mintControlPlaneWriteKey,
  releaseControlPlaneWriteIdentities,
  releaseControlPlaneWriteIdentity,
  runControlPlaneWrite,
};
