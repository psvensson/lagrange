/**
 * Spread-cure transition authorization — the single owner of the
 * durable-to-semantic decode, the evaluation and the stamp of the ONE exact
 * membership transition a critical spread cure authorizes.
 *
 * The owner's decision of 2026-09-18 makes
 * `replica-placement-cure-policy.js` the single authority for whether a
 * spread cure may temporarily exceed the replica target, and makes that
 * decision travel with the operation. It travels as one key of the
 * operation's EXISTING first steps-history metadata record
 * (`OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION`), beside
 * `sourceReplicaId`, `replicaIds`, `peerAddresses` and `readinessSnapshot` —
 * the operation's own metadata channel, not a second record keyed off the
 * operation.
 *
 * The record carries three distinguishable facts, and every reader that
 * changes behaviour on it must consume this decode:
 *
 *   absent key / null / undefined -> ABSENT    (nothing was authorized; never
 *                                   coerced into an authorization)
 *   the exact sanctioned record   -> PRESENT   (one transition, from the
 *                                   membership the policy observed, to
 *                                   exactly one voter more)
 *   anything else                 -> MALFORMED (fail closed: a malformed
 *                                   durable value is never repaired, and it
 *                                   is described by type and size, never
 *                                   echoed)
 *
 * **Total by construction.** Unlike
 * `replica-operation-membership-epoch-binding.js`, which this module is
 * modelled on, NOTHING here throws — not on a Proxy, a revoked Proxy, an
 * accessor, a poisoned prototype or a Symbol. Its consumers are the
 * placement planner, the coordinator's creation path and the learner's 1 s
 * promotion recheck loop; a throw in any of them would turn a diagnostic
 * into an outage. Every entry point catches and states a typed outcome, and
 * the untrusted value is only ever read through own DATA property
 * descriptors, so a value that arrived over the wire can never run code
 * while it is being validated.
 *
 * **What this stage does NOT do.** The receiving guard supplies no
 * membership epoch (lead ruling of 2026-09-19 on the sealed one-evaluation
 * constraint: the carry stage reads nothing the count check did not already
 * read). The epoch criterion and its stale reason stay here and are proven
 * at this owner's level with a supplied epoch; with none supplied the
 * evaluation returns the explicit third outcome
 * MEMBERSHIP_FENCE_NOT_EVALUATED — every other criterion passed and the
 * fence was never applied. It is neither honoured nor refused.
 *
 * Splitting the fields in two is deliberate. The POLICY fields are the cure
 * policy owner's and no other module constructs or amends them; the
 * COORDINATOR fields are the two identities that only exist once the
 * canonical replica id has been allocated. A record missing either half is
 * not a record.
 */

import {
  OPERATION_METADATA_KEY,
} from './replica-operation-progress.js';
import {
  isBoundMembershipPublicationEpoch,
} from './replica-operation-membership-epoch-binding.js';
import {
  memoizedParseStepsHistoryString,
} from './steps-history-parse-memo.js';

const SPREAD_CURE_TRANSITION_INTENT = 'critical_spread_cure';
// The field the authorization rides on a move and on the coordinator's
// operation request. A move that was never authorized does not carry it, and
// an absent field stays absent all the way to the row.
const SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD =
  'spreadCureTransitionAuthorization';
// The named value the carry stage states where a partition membership epoch
// would go. This stage never reads one, so the field is not "absent" and not
// "zero": it was not read, and the payload says exactly that.
const SPREAD_CURE_PARTITION_EPOCH_NOT_READ = 'not_read_by_the_carrier';

const SPREAD_CURE_AUTHORIZATION_BINDING_STATE = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  MALFORMED: 'malformed',
});

// The three outcomes of evaluating a decoded authorization. The third is not
// a shade of the second: every criterion the receiver could check passed,
// and the membership fence was never applied because no epoch was supplied.
const SPREAD_CURE_AUTHORIZATION_OUTCOME = Object.freeze({
  HONOURED: 'honoured',
  NOT_HONOURED: 'not_honoured',
  MEMBERSHIP_FENCE_NOT_EVALUATED: 'membership_fence_not_evaluated',
});

// Why an authorization was not honoured. Each row names one fact the
// receiving replica checked against its own state; HONOURED is the named
// "nothing refused it" state and MEMBERSHIP_FENCE_NOT_EVALUATED the named
// "nobody applied the fence" state — never an absent reason.
const SPREAD_CURE_AUTHORIZATION_REASON = Object.freeze({
  ABSENT: 'authorization_absent',
  MALFORMED: 'authorization_malformed',
  INTENT_UNKNOWN: 'authorization_intent_unknown',
  OPERATION_MISMATCH: 'authorization_operation_mismatch',
  DESTINATION_MISMATCH: 'authorization_destination_mismatch',
  DESIRED_RF_MISMATCH: 'authorization_desired_rf_mismatch',
  MEMBERSHIP_GENERATION_STALE: 'authorization_membership_generation_stale',
  MEMBERSHIP_FENCE_NOT_EVALUATED:
    'authorization_membership_fence_not_evaluated',
  HONOURED: 'authorization_honoured',
});

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_ARRAY = 'array';
const LOCAL_STR_UNREADABLE = 'unreadable';
const DESCRIPTOR_VALUE_FIELD = 'value';
const STEPS_HISTORY_ROW_FIELD = 'steps_history';
const STEPS_HISTORY_RECORD_FIELD = 'stepsHistory';
const FIRST_STEPS_HISTORY_RECORD_INDEX = 0;
const NO_MEASURABLE_SIZE = 0;
const EMPTY_STEPS_HISTORY = Object.freeze([]);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyNames = Object.getOwnPropertyNames;
const objectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectPrototype = Object.prototype;

// Counts take part in the `+1` arithmetic that IS the authorization, so they
// are safe integers: 2**53 + 1 === 2**53, and a merely-integer check would
// admit a record whose "exact transition" is a rounding artefact.
function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonEmptyString(value) {
  return typeof value === LOCAL_STR_STRING && value.length > 0;
}

// A plain record, and nothing that merely resembles one: no array, no class
// instance, no exotic object with a foreign prototype. `typeof` never traps,
// so this is safe to ask of a revoked Proxy; getPrototypeOf can trap, which
// is why every caller is inside a total entry point.
function isPlainRecord(value) {
  if (!value || typeof value !== LOCAL_STR_OBJECT || Array.isArray(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return prototype === objectPrototype || prototype === null;
}

// The policy owner's own fields: the one condition it authorized, the
// replication factor it read from the partition row's authority, the
// membership it observed, the exact resulting count it allows, and where.
const POLICY_AUTHORIZATION_FIELDS = Object.freeze([
  'intent',
  'desiredReplicationFactor',
  'observedMembershipEpoch',
  'observedVoterCount',
  'authorizedResultingVoterCount',
  'destinationNodeId',
]);
// The two identities the coordinator completes once the canonical replica id
// exists. It adds these and nothing else.
const COORDINATOR_AUTHORIZATION_FIELDS = Object.freeze([
  'destinationReplicaId',
  'operationId',
]);
const AUTHORIZATION_FIELDS = Object.freeze([
  ...POLICY_AUTHORIZATION_FIELDS,
  ...COORDINATOR_AUTHORIZATION_FIELDS,
]);

const AUTHORIZATION_FIELD_RULES = Object.freeze({
  intent: (value) => value === SPREAD_CURE_TRANSITION_INTENT,
  desiredReplicationFactor: isPositiveSafeInteger,
  // The epoch domain has ONE predicate, and it lives with the epoch binding
  // owner: this field is the same durable membership-publication epoch that
  // column carries, so it is not re-typed here.
  observedMembershipEpoch: isBoundMembershipPublicationEpoch,
  observedVoterCount: isNonNegativeSafeInteger,
  authorizedResultingVoterCount: isPositiveSafeInteger,
  destinationNodeId: isNonEmptyString,
  destinationReplicaId: isNonEmptyString,
  operationId: isNonEmptyString,
});

const ABSENT_BINDING = Object.freeze({
  state: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.ABSENT,
  authorization: null,
  raw: null,
});
// The value could not even be looked at (a revoked Proxy, a trap that threw,
// a poisoned accessor). Fail closed, and say so rather than pretending the
// key was absent.
const SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION = Object.freeze({
  type: LOCAL_STR_UNREADABLE,
  size: NO_MEASURABLE_SIZE,
});

/**
 * An own DATA property only. An inherited value is not this record's, and an
 * accessor must never be executed while validating a durable value: a value
 * that arrived through the metadata channel is untrusted input, so reading it
 * may not run code it supplied.
 * @param {Object} record
 * @param {string} field
 * @return {{present: boolean, accessor: boolean, value: *}}
 */
function readOwnDataField(record, field) {
  const descriptor = objectGetOwnPropertyDescriptor(record, field);
  if (!descriptor) {
    return {present: false, accessor: false, value: undefined};
  }
  return objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD) ?
    {present: true, accessor: false, value: descriptor.value} :
    {present: false, accessor: true, value: undefined};
}

function measureUnsanctionedValue(value) {
  if (typeof value === LOCAL_STR_STRING || Array.isArray(value)) {
    return value.length;
  }
  return value && typeof value === LOCAL_STR_OBJECT ?
    objectGetOwnPropertyNames(value).length :
    NO_MEASURABLE_SIZE;
}

// A malformed value is named by its type and a bounded size. The value
// itself is never echoed: this description is rendered into the learner's
// promotion log line, which a hostile or corrupt row must not be able to
// grow.
function describeUnsanctionedValue(value) {
  try {
    return Object.freeze({
      type: Array.isArray(value) ? LOCAL_STR_ARRAY : typeof value,
      size: measureUnsanctionedValue(value),
    });
  } catch (_error) {
    return SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION;
  }
}

// Exactly the declared fields and nothing beside them, counting what
// Object.keys does not: a non-enumerable extra and a Symbol extra are both
// junk on a record whose whole contract is "these eight and no more".
function hasExactlyTheDeclaredFields(value, fields) {
  return objectGetOwnPropertyNames(value).length === fields.length &&
    objectGetOwnPropertySymbols(value).length === NO_MEASURABLE_SIZE;
}

/**
 * The sanctioned record, or null. Exactly the declared fields, each of the
 * declared type and range, and an authorized count that is the observed
 * count plus exactly one — the owner's "one exact transition, never a
 * blanket target + 2". Anything else is not repaired; it is rejected.
 * @param {*} value
 * @param {Array<string>} fields the field set this record must carry exactly
 * @return {Object|null} frozen record, or null
 */
function readSanctionedRecord(value, fields) {
  if (!isPlainRecord(value) || !hasExactlyTheDeclaredFields(value, fields)) {
    return null;
  }
  const record = {};
  for (const field of fields) {
    const own = readOwnDataField(value, field);
    if (!own.present || !AUTHORIZATION_FIELD_RULES[field](own.value)) {
      return null;
    }
    record[field] = own.value;
  }
  return record.authorizedResultingVoterCount ===
    record.observedVoterCount + 1 ?
    Object.freeze(record) :
    null;
}

/**
 * The cure policy owner's own minted record, validated at its mint site so a
 * record the decode would call malformed can never leave the policy owner.
 * Total: an input the validator cannot even inspect is "not a record".
 * @param {*} value
 * @return {Object|null} frozen policy record, or null
 */
function readSanctionedSpreadCureTransitionPolicy(value) {
  try {
    return readSanctionedRecord(value, POLICY_AUTHORIZATION_FIELDS);
  } catch (_error) {
    return null;
  }
}

function buildMalformedBinding(description) {
  return Object.freeze({
    state: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.MALFORMED,
    authorization: null,
    raw: description,
  });
}

function decodeSpreadCureTransitionAuthorizationValue(value) {
  if (value === null || value === undefined) {
    return ABSENT_BINDING;
  }
  const authorization = readSanctionedRecord(value, AUTHORIZATION_FIELDS);
  return authorization === null ?
    buildMalformedBinding(describeUnsanctionedValue(value)) :
    Object.freeze({
      state: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
      authorization,
      raw: null,
    });
}

// The authorization is stamped on the operation's FIRST steps-history
// record and nowhere else, so that is the only place it is read from: a key
// on a later entry, on a prototype, or on a poisoned Object.prototype is not
// this operation's authorization and must not decode as one. An own accessor
// where the value should be decodes MALFORMED, not ABSENT - something is
// there, and running it is exactly what must not happen.
//
// This returns the binding itself rather than an intermediate read record:
// there is one named outcome per case and no state that has to be encoded as
// a null on the way out.
function decodeFirstRecordAuthorization(stepsHistory) {
  const firstRecord = Array.isArray(stepsHistory) && stepsHistory.length > 0 ?
    stepsHistory[FIRST_STEPS_HISTORY_RECORD_INDEX] :
    null;
  if (!isPlainRecord(firstRecord)) {
    return ABSENT_BINDING;
  }
  const own = readOwnDataField(
    firstRecord,
    OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION,
  );
  return own.accessor ?
    buildMalformedBinding(SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION) :
    decodeSpreadCureTransitionAuthorizationValue(
      own.present ? own.value : null);
}

// The steps history of a cached or normalized replica_operations row. The
// durable spelling is a JSON string and is parsed through the content-keyed
// memo the recovery snapshot already shares, so the learner's 1 s recheck
// cadence re-parses nothing.
function readReplicaOperationStepsHistory(operationRow) {
  if (!operationRow || typeof operationRow !== LOCAL_STR_OBJECT) {
    return EMPTY_STEPS_HISTORY;
  }
  const raw = operationRow[STEPS_HISTORY_ROW_FIELD] ??
    operationRow[STEPS_HISTORY_RECORD_FIELD];
  if (Array.isArray(raw)) {
    return raw;
  }
  return isNonEmptyString(raw) ?
    memoizedParseStepsHistoryString(raw) :
    EMPTY_STEPS_HISTORY;
}

/**
 * Decode the authorization carried by one replica_operations row. Total: any
 * failure to read the row is the explicit MALFORMED outcome, never a throw
 * into the planner, the coordinator or the promotion recheck loop.
 * @param {Object|null} operationRow a cached or normalized operation row
 * @return {{state: string, authorization: Object|null, raw: Object|null}}
 */
function decodeSpreadCureTransitionAuthorizationFromOperationRow(operationRow) {
  try {
    return decodeFirstRecordAuthorization(
      readReplicaOperationStepsHistory(operationRow));
  } catch (_error) {
    return buildMalformedBinding(SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION);
  }
}

// Every fact the receiving replica checks the authorization against, in a
// fixed order so one refusal has one name. The membership fence is
// deliberately "not older than what this partition can see": a partition
// whose own epoch view LAGS the authorization accepts it, because the
// planner is the authority and the dispatch epoch gate already refused to
// dispatch at a superseded epoch.
function resolveAuthorizationOutcomeReason(authorization, context) {
  if (authorization.intent !== SPREAD_CURE_TRANSITION_INTENT) {
    return SPREAD_CURE_AUTHORIZATION_REASON.INTENT_UNKNOWN;
  }
  if (authorization.operationId !== context.operationId) {
    return SPREAD_CURE_AUTHORIZATION_REASON.OPERATION_MISMATCH;
  }
  if (authorization.destinationNodeId !== context.localNodeId ||
      authorization.destinationReplicaId !== context.localReplicaId) {
    return SPREAD_CURE_AUTHORIZATION_REASON.DESTINATION_MISMATCH;
  }
  if (authorization.desiredReplicationFactor !==
      context.partitionDesiredReplicationFactor) {
    return SPREAD_CURE_AUTHORIZATION_REASON.DESIRED_RF_MISMATCH;
  }
  // No epoch supplied is NOT "epoch 0" and NOT a refusal: the caller did not
  // apply this fence at all, and the outcome says so.
  if (!isBoundMembershipPublicationEpoch(context.partitionMembershipEpoch)) {
    return SPREAD_CURE_AUTHORIZATION_REASON.MEMBERSHIP_FENCE_NOT_EVALUATED;
  }
  return authorization.observedMembershipEpoch <
    context.partitionMembershipEpoch ?
    SPREAD_CURE_AUTHORIZATION_REASON.MEMBERSHIP_GENERATION_STALE :
    SPREAD_CURE_AUTHORIZATION_REASON.HONOURED;
}

const OUTCOME_BY_REASON = Object.freeze({
  [SPREAD_CURE_AUTHORIZATION_REASON.HONOURED]:
    SPREAD_CURE_AUTHORIZATION_OUTCOME.HONOURED,
  [SPREAD_CURE_AUTHORIZATION_REASON.MEMBERSHIP_FENCE_NOT_EVALUATED]:
    SPREAD_CURE_AUTHORIZATION_OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED,
});

function resolveAuthorizationOutcome(reason) {
  return OUTCOME_BY_REASON[reason] ??
    SPREAD_CURE_AUTHORIZATION_OUTCOME.NOT_HONOURED;
}

// The bound the authorization states, compared with the promotion the count
// check computed. `null` is the explicit unavailable value: either no
// authorization stated a bound, or no promotion count was readable.
//
// It is ONLY the arithmetic. A lab count of "promotions an enforced bound
// would admit" must AND this with the evaluation outcome being HONOURED: a
// refused or unfenced authorization can still be within its own bound.
function resolveAuthorizedBound(votersAfterPromotion, authorizedCount) {
  return Number.isSafeInteger(votersAfterPromotion) &&
    isPositiveSafeInteger(authorizedCount) ?
    votersAfterPromotion <= authorizedCount :
    null;
}

function buildUnhonouredEvaluation(reason) {
  return Object.freeze({
    outcome: SPREAD_CURE_AUTHORIZATION_OUTCOME.NOT_HONOURED,
    honoured: false,
    reason,
    authorizedResultingVoterCount: null,
    wouldBeWithinAuthorizedBound: null,
  });
}

function evaluateDecodedAuthorization(options, authorization) {
  const reason = resolveAuthorizationOutcomeReason(authorization, options);
  const authorizedCount = authorization.authorizedResultingVoterCount;
  return Object.freeze({
    outcome: resolveAuthorizationOutcome(reason),
    honoured: reason === SPREAD_CURE_AUTHORIZATION_REASON.HONOURED,
    reason,
    authorizedResultingVoterCount: isPositiveSafeInteger(authorizedCount) ?
      authorizedCount :
      null,
    wouldBeWithinAuthorizedBound: resolveAuthorizedBound(
      options.votersAfterPromotion,
      authorizedCount,
    ),
  });
}

/**
 * Evaluate one decoded authorization against the receiving replica's own
 * state. Never throws, whatever it is handed: an unusable input is the
 * `authorization_absent` outcome, not an exception into the promotion
 * recheck loop.
 *
 * `partitionMembershipEpoch` is OPTIONAL. A caller that supplies one gets
 * the membership fence; a caller that supplies none gets the explicit
 * MEMBERSHIP_FENCE_NOT_EVALUATED outcome, which is neither honoured nor
 * refused.
 * @param {Object} options
 * @param {Object} options.binding the decoded binding
 * @param {string} options.operationId the owned operation ROW's id
 * @param {string} options.localNodeId this replica's node
 * @param {string} options.localReplicaId this replica
 * @param {number} options.partitionDesiredReplicationFactor the partition's
 *   own declared replication factor (0 when undeclared)
 * @param {number} [options.partitionMembershipEpoch] the membership
 *   publication epoch to fence against, when the caller has one
 * @param {number} options.votersAfterPromotion the count check's own
 *   resulting voter count
 * @return {{outcome: string, honoured: boolean, reason: string,
 *   authorizedResultingVoterCount: number|null,
 *   wouldBeWithinAuthorizedBound: boolean|null}} frozen outcome
 */
function evaluateSpreadCureTransitionAuthorization(options) {
  try {
    const binding = isPlainRecord(options) ? options.binding : null;
    const authorization = isPlainRecord(binding) ?
      binding.authorization :
      null;
    if (!isPlainRecord(authorization)) {
      return buildUnhonouredEvaluation(
        isPlainRecord(binding) && binding.state ===
          SPREAD_CURE_AUTHORIZATION_BINDING_STATE.MALFORMED ?
          SPREAD_CURE_AUTHORIZATION_REASON.MALFORMED :
          SPREAD_CURE_AUTHORIZATION_REASON.ABSENT,
      );
    }
    return evaluateDecodedAuthorization(options, authorization);
  } catch (_error) {
    return buildUnhonouredEvaluation(
      SPREAD_CURE_AUTHORIZATION_REASON.MALFORMED,
    );
  }
}

function applyStampedAuthorization(operation, policy, context) {
  operation.stepsHistory[FIRST_STEPS_HISTORY_RECORD_INDEX][
    OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION
  ] = Object.freeze({
    ...policy,
    destinationReplicaId: context.destinationReplicaId,
    operationId: context.operationId,
  });
}

/**
 * Complete the policy owner's record with the two identities the coordinator
 * knows, and stamp it on the operation's existing first steps-history
 * metadata record. A move that carries no sanctioned policy record stamps
 * nothing at all, so a row for an unauthorized move is byte-identical to one
 * written before this carrier existed. Total: a stamp that cannot be made is
 * reported as `false`, never thrown into the creation path.
 * @param {Object} operation the operation record under construction
 * @param {Object} context {authorization, destinationReplicaId, operationId}
 * @return {boolean} whether an authorization was stamped
 */
function stampSpreadCureTransitionAuthorization(operation, context) {
  try {
    const policy = readSanctionedSpreadCureTransitionPolicy(
      isPlainRecord(context) ? context.authorization : null,
    );
    if (policy === null ||
        !isNonEmptyString(context.destinationReplicaId) ||
        !isNonEmptyString(context.operationId) ||
        !Array.isArray(operation?.stepsHistory) ||
        !isPlainRecord(
          operation.stepsHistory[FIRST_STEPS_HISTORY_RECORD_INDEX])) {
      return false;
    }
    applyStampedAuthorization(operation, policy, context);
    return true;
  } catch (_error) {
    return false;
  }
}

export {
  SPREAD_CURE_AUTHORIZATION_BINDING_STATE,
  SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION,
  SPREAD_CURE_AUTHORIZATION_OUTCOME,
  SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
  evaluateSpreadCureTransitionAuthorization,
  readSanctionedSpreadCureTransitionPolicy,
  stampSpreadCureTransitionAuthorization,
};
