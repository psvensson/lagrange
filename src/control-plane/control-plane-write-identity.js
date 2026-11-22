import {createHash, randomUUID} from 'node:crypto';
import {deserialize, serialize} from 'node:v8';
import {NAMED_WRITE_ATTEMPT, belongsToNamedWrite, judgeNamedWriteOutcome} from
  './control-plane-named-write-outcome.js';
import {
  completeNamedWriteDelivery,
  createNamedWriteCaller,
  createNamedWriteDelivery,
  requireNamedWriteWaitBudget,
  waitForNamedWriteDelivery,
} from './control-plane-named-write-wait.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from './control-plane-system-table-gateway-constants.js';
import {ERRORS} from '../constants/errors.js';
import {isControlPlaneWriterShutDown} from './control-plane-error-classification.js';
import {OWNER_CONTRACT_NEXT_ACTION, OWNER_CONTRACT_STATE} from './owner-contract-outcome.js';
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
const CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED_CODE = 'CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED';
const NAMED_WRITE_SCOPE_REQUIRED = 'A named control-plane write requires a declared system partition';
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
const WRITE_DELIVERY = Object.freeze({
  ANSWER: 'answer',
  ERROR: 'error',
  WAIT_INTERRUPTED: 'wait_interrupted',
});

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
    partitionId: Object.hasOwn(INITIAL_PARTITION_IDS, tableName) ?
      INITIAL_PARTITION_IDS[tableName] : null,
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
      releaseControlPlaneWriteIdentity(name);
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
  const record = heldInstances.get(writeIdentity);
  if (!record) return;
  record.releaseRequested = true;
  releaseSettledInstance(record);
}

function releaseSettledInstance(record) {
  if (record.delivery === null && heldInstances.get(record.name) === record &&
      (record.settlement !== null || record.releaseRequested)) {
    heldInstances.delete(record.name);
  }
}

// Capture before an authoritative read. Readback must prove the original
// effect and may retire only the exact retained instance the read observed.
function captureControlPlaneWriteConfirmation(writeIdentity) {
  const record = heldInstances.get(writeIdentity);
  return (observation) => {
    if (!record?.confirmWriteEffect || heldInstances.get(writeIdentity) !== record ||
        record.settlement !== null || !record.confirmWriteEffect(observation)) {
      return false;
    }
    record.settlement = NAMED_WRITE_ATTEMPT.APPLIED;
    releaseSettledInstance(record);
    return true;
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
    const own = answer instanceof Error ?
      Object.assign(new Error(answer.message, {cause: answer}), answer) :
      {...answer};
    Object.defineProperty(own, NAMED_WRITE_RECEIPT, {value: record.settlement});
    return own;
  }
  return answer;
}

function settleInstance(record, answer) {
  if (record.settlement !== null) return;
  record.entryId ??= findLinkedEntryId(answer, record);
  const verdict = someLinkedAnswer(answer, isWriteOutcomeUnknown) ?
    NAMED_WRITE_ATTEMPT.UNKNOWN : judgeNamedWriteOutcome(answer, record);
  const releases = verdict === NAMED_WRITE_ATTEMPT.APPLIED ||
    verdict === NAMED_WRITE_ATTEMPT.FAILED ||
    (verdict === NAMED_WRITE_ATTEMPT.NOT_PROPOSED && !record.unresolved);
  if (releases) {
    record.settlement = verdict;
  } else {
    record.unresolved = true;
  }
}

function deliveryObservation(state, answer) {
  return {state, answer};
}

// All joiners see the one real transport answer. Each waiter owns its own
// deadline and cancellation, while the exposed delivery keeps its custody.
function beginDelivery(record, attempt, caller) {
  const delivery = createNamedWriteDelivery();
  record.delivery = delivery;
  const complete = (observation) => {
    record.delivery = null;
    releaseSettledInstance(record);
    completeNamedWriteDelivery(delivery, observation);
  };
  Promise.resolve().then(async () => {
    try {
      requireNamedWriteWaitBudget(caller);
    } catch (answer) {
      if (!record.unresolved && record.settlement === null) {
        record.settlement = NAMED_WRITE_ATTEMPT.NOT_PROPOSED;
      }
      return deliveryObservation(WRITE_DELIVERY.ERROR, answer);
    }
    try {
      const answer = await attempt(deserialize(record.content), record.key, caller.budget);
      settleInstance(record, answer);
      return deliveryObservation(WRITE_DELIVERY.ANSWER, answer);
    } catch (answer) {
      settleInstance(record, answer);
      return deliveryObservation(WRITE_DELIVERY.ERROR, answer);
    }
  }).then(complete, (error) => {
    record.unresolved = true;
    complete(deliveryObservation(WRITE_DELIVERY.ERROR, error));
  });
  return delivery;
}

async function observeDelivery(record, attempt, caller) {
  const delivery = record.delivery ?? beginDelivery(record, attempt, caller);
  try {
    return await waitForNamedWriteDelivery(delivery, caller);
  } catch (error) {
    const pending = describePendingInstance(record, PENDING_INSTANCE_OUTCOME.UNKNOWN);
    return deliveryObservation(
      WRITE_DELIVERY.WAIT_INTERRUPTED, withPendingInstance(error, pending));
  }
}

function holdNewInstance(name, digest, content, route, confirmWriteEffect) {
  const instance = randomUUID();
  const key = `${CONTROL_PLANE_WRITE_KEY_PREFIX}${createHash(DIGEST_ALGORITHM)
    .update(JSON.stringify([name, instance, digest]))
    .digest(DIGEST_ENCODING)
    .slice(0, KEY_DIGEST_LENGTH)}`;
  const record = {name, instance, digest, key, content, routeId: route.id,
    partitionId: route.partitionId, unresolved: false, delivery: null, releaseRequested: false,
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

// The one shape of an unresolved named write, whether its producer ANSWERED
// without proof (a success without its durable commit receipt) or its
// transport THREW the typed unknown: the named outcome UNKNOWN - accepted
// into consensus, not proven (contract PENDING) - whose owned next action is
// the re-send under the same key (RETRY), with the typed failure code and the
// pending instance it names (its own). What the producer answered or threw
// travels unchanged as its cause, and only there: its fields describe that
// answer (a count, the gateway's classification of it), not this write.
function unresolvedAnswer(record, observed = null) {
  const pendingInstance = describePendingInstance(record, PENDING_INSTANCE_OUTCOME.UNKNOWN);
  return {
    success: false,
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN,
    completionState: CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN,
    deferRetry: true,
    error: unresolvedErrorText(observed),
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
    entryId: pendingInstance.entryId,
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    pendingInstance,
    cause: observed,
  };
}

function unresolvedErrorText(observed) {
  const text = observed instanceof Error ? observed.message : observed?.error;
  return someLinkedAnswer(observed, isWriteOutcomeUnknown) && isNonEmptyString(text) ?
    text : ERRORS.WRITE_OUTCOME_UNKNOWN;
}

// Whether an observed attempt leaves its instance unresolved: its answer did
// not settle it, or it threw the typed unknown. A thrown failure that names no
// unknown (a refusal before delivery, an internal error) is the transport's
// own failure and is thrown on as it was. So is the writer's terminal
// shut-down answer, even when it links an unknown: it stays terminal for its
// owner - never "pending, retry" - and names the unresolved instance beside
// it (terminalPendingInstance).
function isUnresolvedObservation(record, state, answer) {
  return record.settlement === null && !isControlPlaneWriterShutDown(answer) &&
    (state === WRITE_DELIVERY.ANSWER || someLinkedAnswer(answer, isWriteOutcomeUnknown));
}

// The pending instance a terminal shut-down answer carries: its own, outcome
// unknown, while an attempt may have proposed it (the instance stays held for
// a successor or the caller to resolve); otherwise the one it was given.
function terminalPendingInstance(record, answer, pendingInstance) {
  return record.settlement === null && isControlPlaneWriterShutDown(answer) ?
    describePendingInstance(record, PENDING_INSTANCE_OUTCOME.UNKNOWN) : pendingInstance;
}

// The held instance of a name, resolved under its own entry by re-delivering
// its own content: the pending instance it was, or - still unresolved - the
// one unresolved answer naming it (what the re-delivery threw otherwise is
// thrown again, carrying the pending instance).
async function resolvePendingInstance(record, attempt, caller) {
  const delivery = await observeDelivery(record, attempt, caller);
  const {answer, state} = delivery;
  if (state === WRITE_DELIVERY.WAIT_INTERRUPTED) throw answer;
  if (record.settlement === null) {
    if (isUnresolvedObservation(record, state, answer)) {
      return {unresolved: unresolvedAnswer(record, answer)};
    }
    const pending = describePendingInstance(record, PENDING_INSTANCE_OUTCOME.UNKNOWN);
    throw rememberWriteReceipt(withPendingInstance(answer, pending), record);
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
    return Object.assign(new Error(answer.message, {cause: answer}), answer, {pendingInstance});
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

async function runNamedControlPlaneWrite(options, content, route, attempt, caller) {
  requireNamedWriteWaitBudget(caller);
  const name = options.writeIdentity;
  const digest = digestWriteContent(content);
  let record = heldInstances.get(name);
  let pendingInstance = null;
  if (record !== undefined && record.routeId !== route.id) return unresolvedAnswer(record);
  if (record !== undefined && record.digest !== digest) {
    const resolution = await resolvePendingInstance(record, attempt, caller);
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
      return runNamedControlPlaneWrite(options, content, route, attempt, caller);
    }
  }
  requireNamedWriteWaitBudget(caller);
  if (record === undefined) {
    if (heldInstances.size >= MAX_HELD_WRITE_INSTANCES) {
      return capacityRefusal(name);
    }
    record = holdNewInstance(name, digest, content, route, options.confirmWriteEffect);
  }
  const observation = await observeDelivery(record, attempt, caller);
  return observedWriteResult(record, observation, pendingInstance);
}

// An unresolved attempt - answered or thrown - is the one unresolved answer,
// which names its own pending instance; a settled one is its answer, carrying
// the earlier instance resolved before it was issued.
function observedWriteResult(record, {answer, state}, pendingInstance) {
  if (state === WRITE_DELIVERY.WAIT_INTERRUPTED) throw answer;
  if (isUnresolvedObservation(record, state, answer)) {
    return rememberWriteReceipt(unresolvedAnswer(record, answer), record);
  }
  const observed = rememberWriteReceipt(withPendingInstance(answer,
    terminalPendingInstance(record, answer, pendingInstance)), record);
  if (state === WRITE_DELIVERY.ERROR) throw observed;
  return observed;
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
function hasControlPlaneWriteName(options) {
  return isNonEmptyString(options?.writeIdentity);
}

function isNamedControlPlaneWrite(options) {
  return !isNonEmptyString(options?.idempotencyKey) && hasControlPlaneWriteName(options);
}

function runControlPlaneWrite(options, content, route, attempt) {
  const hasName = hasControlPlaneWriteName(options);
  if (hasName && !isNonEmptyString(route.partitionId)) {
    return Promise.resolve({success: false,
      error: NAMED_WRITE_SCOPE_REQUIRED, errorCode: CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED_CODE});
  }
  if (isNonEmptyString(options?.idempotencyKey)) {
    return attempt(content, options.idempotencyKey);
  }
  if (!hasName) {
    return attempt(content, mintControlPlaneWriteKey());
  }
  return runNamedControlPlaneWrite(options, serialize(content), route, attempt,
    createNamedWriteCaller(options));
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
  CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED_CODE,
  CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
  CONTROL_PLANE_WRITE_ROUTE,
  captureControlPlaneWriteConfirmation,
  controlPlaneWriteIdentity,
  controlPlaneWriteRoute,
  hasControlPlaneWriteName,
  isControlPlaneWriteDefinitivelyUnappliedError,
  isControlPlaneWriteOutcomeUnknown,
  isNamedControlPlaneWrite,
  isPendingInstanceApplied,
  mintControlPlaneWriteKey,
  releaseControlPlaneWriteIdentities,
  releaseControlPlaneWriteIdentity,
  runControlPlaneWrite,
};
