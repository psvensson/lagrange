import {createHash, randomUUID} from 'node:crypto';
import {deserialize, serialize} from 'node:v8';
import {NAMED_WRITE_ATTEMPT, belongsToNamedWrite, judgeNamedWriteOutcome} from
  './control-plane-named-write-outcome.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';
import {ERRORS} from '../constants/errors.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
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
//     re-delivered under its own key by the current admitted route (the partition delivery,
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
const CONTROL_PLANE_WRITE_ROUTE = Object.freeze({SQL: 'sql', CDC: 'cdc'});
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
const NAME_PART_SEPARATOR = ',';

const heldInstances = new Map();
const NAMED_WRITE_RECEIPT = Symbol();

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

function controlPlaneWriteRoute(family, nodeId, tableName) {
  return {
    id: controlPlaneWriteIdentity(family, nodeId, tableName),
    partitionId: INITIAL_PARTITION_IDS[tableName] ?? null,
  };
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

// Capture before an authoritative read. Readback must prove the original
// effect and may retire only the exact retained instance the read observed.
function captureControlPlaneWriteConfirmation(writeIdentity) {
  const record = heldInstances.get(writeIdentity);
  return (observation) => {
    if (!record?.confirmWriteEffect || heldInstances.get(writeIdentity) !== record ||
        !record.confirmWriteEffect(observation)) {
      return false;
    }
    record.settlement = NAMED_WRITE_ATTEMPT.APPLIED;
    return heldInstances.delete(writeIdentity);
  };
}

/**
 * The digest of the exact content a write carries.
 * @param {*} content - Its statement and parameters, or its mutation.
 * @return {string} Hex digest.
 */
function digestWriteContent(content) {
  return createHash(DIGEST_ALGORITHM).update(content).digest(DIGEST_ENCODING);
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

function findLinkedEntryId(answer, record) {
  let entryId = null;
  someLinkedAnswer(answer, (linked) => {
    if (!isWriteOutcomeUnknown(linked) || !belongsToNamedWrite(linked, record)) return false;
    entryId = linked.entryId;
    return true;
  });
  return entryId;
}

function rememberWriteReceipt(answer, record) {
  if (answer && typeof answer === OBJECT_TYPE) {
    Object.defineProperty(answer, NAMED_WRITE_RECEIPT, {value: record.settlement});
  }
  return answer;
}

function settleInstance(record, answer) {
  // Later receipts settle the exact entry the producer sent under this key.
  record.entryId ??= findLinkedEntryId(answer, record);
  const verdict = someLinkedAnswer(answer, isWriteOutcomeUnknown) ?
    NAMED_WRITE_ATTEMPT.UNKNOWN : judgeNamedWriteOutcome(answer, record);
  const releases = verdict === NAMED_WRITE_ATTEMPT.APPLIED ||
    verdict === NAMED_WRITE_ATTEMPT.FAILED ||
    (verdict === NAMED_WRITE_ATTEMPT.NOT_PROPOSED && !record.unresolved);
  if (!releases) {
    record.unresolved = true;
  } else {
    record.settlement = verdict;
    if (heldInstances.get(record.name) === record) heldInstances.delete(record.name);
  }
  return verdict;
}

// Reconstruct the original bytes for every delivery. The live caller supplies
// routing, current authority and wait budget; an old service is never retained.
async function attemptInstance(record, attempt) {
  let answer;
  try {
    answer = await attempt(deserialize(record.content), record.key);
  } catch (error) {
    settleInstance(record, error);
    throw error;
  }
  settleInstance(record, answer);
  return record.settlement === null ? unresolvedAnswer(record, answer) : answer;
}

function holdNewInstance(name, digest, content, route, confirmWriteEffect) {
  const instance = randomUUID();
  const key = `${CONTROL_PLANE_WRITE_KEY_PREFIX}${createHash(DIGEST_ALGORITHM)
    .update(JSON.stringify([name, instance, digest]))
    .digest(DIGEST_ENCODING)
    .slice(0, KEY_DIGEST_LENGTH)}`;
  const record = {name, instance, digest, key, content, routeId: route.id,
    partitionId: route.partitionId, unresolved: false,
    entryId: null, settlement: null, confirmWriteEffect};
  heldInstances.set(name, record);
  return record;
}

function describePendingInstance(record, outcome) {
  return Object.freeze({
    writeIdentity: record.name,
    instance: record.instance,
    idempotencyKey: record.key,
    entryId: record.entryId,
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
function unresolvedAnswer(record, answer) {
  const pendingInstance = describePendingInstance(record, PENDING_INSTANCE_OUTCOME.UNKNOWN);
  return {
    ...answer,
    success: false,
    deferRetry: true,
    error: someLinkedAnswer(answer, isWriteOutcomeUnknown) ?
      answer.error : ERRORS.WRITE_OUTCOME_UNKNOWN,
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
    entryId: pendingInstance.entryId,
    pendingInstance,
  };
}

async function resolvePendingInstance(record, attempt) {
  let answer;
  let thrown = false;
  try {
    answer = await attemptInstance(record, attempt);
  } catch (error) {
    answer = error;
    thrown = true;
  }
  if (record.settlement !== NAMED_WRITE_ATTEMPT.APPLIED &&
      record.settlement !== NAMED_WRITE_ATTEMPT.FAILED) {
    const pendingInstance = describePendingInstance(
      record, PENDING_INSTANCE_OUTCOME.UNKNOWN);
    if (thrown) throw withPendingInstance(answer, pendingInstance);
    return {unresolved: unresolvedAnswer(record, answer)};
  }
  const outcome = record.settlement === NAMED_WRITE_ATTEMPT.APPLIED ?
    PENDING_INSTANCE_OUTCOME.APPLIED : PENDING_INSTANCE_OUTCOME.FAILED;
  return {pendingInstance: describePendingInstance(record, outcome)};
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

async function runNamedControlPlaneWrite(options, content, route, attempt) {
  const name = options.writeIdentity;
  const digest = digestWriteContent(content);
  let record = heldInstances.get(name);
  let pendingInstance = null;
  if (record !== undefined && record.routeId !== route.id) return unresolvedAnswer(record);
  if (record !== undefined && record.digest !== digest) {
    const resolution = await resolvePendingInstance(record, attempt);
    if (resolution.unresolved) {
      return resolution.unresolved;
    }
    pendingInstance = resolution.pendingInstance;
    if (options.pendingAppliedSettles === true &&
      pendingInstance.outcome === PENDING_INSTANCE_OUTCOME.APPLIED) {
      return pendingInstanceAppliedAnswer(pendingInstance);
    }
    record = heldInstances.get(name);
    if (record !== undefined && (record.digest !== digest || record.routeId !== route.id)) {
      // Another write of the name took the slot meanwhile: resolve that
      // one too before this one is issued.
      return runNamedControlPlaneWrite(options, content, route, attempt);
    }
  }
  if (record === undefined) {
    if (heldInstances.size >= MAX_HELD_WRITE_INSTANCES) {
      return capacityRefusal(name);
    }
    record = holdNewInstance(name, digest, content, route, options.confirmWriteEffect);
  }
  try {
    return rememberWriteReceipt(
      withPendingInstance(await attemptInstance(record, attempt), pendingInstance), record);
  } catch (error) {
    throw rememberWriteReceipt(withPendingInstance(error, pendingInstance), record);
  }
}

/**
 * Run one attempt of a control-plane write under its identity: the caller's
 * key; a key minted for this call; or - for a named write - its instance's
 * key per the rule above.
 * @param {Object} options - The caller's {idempotencyKey?, writeIdentity?}.
 * @param {*} content - The exact content this attempt carries (statement
 *   and parameters, or the mutation).
 * @param {Object} route - Delivery producer and authority domain.
 * @param {Function} attempt - (content, idempotencyKey) => Promise of the answer.
 * @return {Promise<*>} The attempt's answer.
 */
function runControlPlaneWrite(options, content, route, attempt) {
  if (isNonEmptyString(options?.idempotencyKey)) {
    return attempt(content, options.idempotencyKey);
  }
  if (!isNonEmptyString(options?.writeIdentity)) {
    return attempt(content, mintControlPlaneWriteKey());
  }
  return runNamedControlPlaneWrite(options, serialize(content), route, attempt);
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

/**
 * Whether an answer, or any answer linked to it, names its write outcome as
 * unknown (proposed or delivered with an unconfirmed commit outcome).
 * @param {*} answer - A write's result or thrown error.
 * @return {boolean}
 */
function isControlPlaneWriteOutcomeUnknown(answer) {
  return someLinkedAnswer(answer, (linked) => isWriteOutcomeUnknown(linked) ||
    linked[NAMED_WRITE_RECEIPT] === null);
}

/**
 * Whether a thrown error proves its write did not apply (either a committed
 * statement failure or a pre-proposal refusal, with no unknown outcome).
 * @param {*} error - A thrown write error.
 * @return {boolean}
 */
function isControlPlaneWriteDefinitivelyUnappliedError(error) {
  return !isControlPlaneWriteOutcomeUnknown(error) && someLinkedAnswer(error, (linked) => {
    const receipt = linked[NAMED_WRITE_RECEIPT];
    return receipt === NAMED_WRITE_ATTEMPT.FAILED || receipt === NAMED_WRITE_ATTEMPT.NOT_PROPOSED;
  });
}

export {
  CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
  CONTROL_PLANE_WRITE_ROUTE,
  captureControlPlaneWriteConfirmation,
  controlPlaneWriteIdentity,
  controlPlaneWriteRoute,
  isControlPlaneWriteDefinitivelyUnappliedError,
  isControlPlaneWriteOutcomeUnknown,
  isPendingInstanceApplied,
  mintControlPlaneWriteKey,
  releaseControlPlaneWriteIdentities,
  releaseControlPlaneWriteIdentity,
  runControlPlaneWrite,
};
