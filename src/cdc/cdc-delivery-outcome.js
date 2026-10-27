import {types} from 'node:util';
import {appendOwnArrayValue, concatenateArraysByIndex, copyArrayByIndex, digest,
  isDenseDataArray, isRecord, isSha256Digest, serializeJsonData} from
  '../utils/canonical-json-data.js';
import {CDC_EVENT_METADATA_FIELD, copyCdcEvent} from './cdc-event-envelope.js';
import {FIELD} from '../constants/fields.js';
import {CDC_OPERATION} from '../constants/index.js';
import {
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_APPLICATION_STATUS,
} from '../message-group/constants.js';
import {
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_STRATEGY,
} from '../topology/cdc-group-propagation-constants.js';
import {deliveryTransportOf, deliveryAnswerOf,
  isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
} from '../transport/transport-semantic-outcome.js';
import {ReplicaOperationResponseStatus} from '../rebalancer/replica-operation-constants.js';

const objectHasOwn = Object.hasOwn;
const isProxy = types.isProxy.bind(types);
const objectKeys = Object.keys;
const objectFreeze = Object.freeze;
const objectAssign = Object.assign;
const numberIsSafeInteger = Number.isSafeInteger;
const numberIsFinite = Number.isFinite;
const arrayIsArray = Array.isArray;
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const SetConstructor = Set;
const setHas = Function.call.bind(Set.prototype.has);
const setAdd = Function.call.bind(Set.prototype.add);

const CDC_COMPLETION = objectFreeze({
  UNKNOWN: 'cdc_committed_acceptance_unknown',
  PROVISIONAL: 'cdc_provisional_ingress',
  INVALID: 'cdc_committed_acceptance_invalid',
  BACKPRESSURE: 'cdc_committed_acceptance_backpressure',
});
const CDC_COVERAGE_STATE = objectFreeze({
  UNCOVERED: 'uncovered',
  PROVISIONAL: 'provisional_coverage',
  COMMITTED: 'native_committed',
});
const UNCOVERED_CDC = objectFreeze({state: CDC_COVERAGE_STATE.UNCOVERED});
const CDC_BINDING_FIELDS = objectFreeze(['sourcePartition', 'eventKey', 'eventDigest']);
const CDC_COMMITTED_RECEIPT_FIELDS = objectFreeze([
  ...CDC_BINDING_FIELDS, 'groupId', 'logIndex', 'term',
]);
const CDC_OUTCOME_FIELD = objectFreeze({
  SUCCESS: 'success',
  ERROR: 'error',
  COMMITTED: 'cdcCommitted',
  PROVISIONAL: 'cdcProvisional',
  VECTOR_DIGEST: 'cdcVectorDigest',
  GROUP_ID: 'groupId',
});
const COMMITTED_REQUIRED_FIELDS = objectFreeze([
  CDC_OUTCOME_FIELD.SUCCESS, CDC_OUTCOME_FIELD.COMMITTED, CDC_OUTCOME_FIELD.VECTOR_DIGEST,
]);
const PROVISIONAL_REQUIRED_FIELDS = objectFreeze([
  CDC_OUTCOME_FIELD.SUCCESS, CDC_OUTCOME_FIELD.ERROR,
  CDC_OUTCOME_FIELD.PROVISIONAL, CDC_OUTCOME_FIELD.VECTOR_DIGEST,
]);

const SUCCESS_STATUSES = objectFreeze([
  ReplicaOperationResponseStatus.COMPLETED,
  TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
  MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
  MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED,
]);

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0;
}

function nonNegativeInteger(value) {
  return numberIsSafeInteger(value) && value >= 0;
}

function nullValue(value) {
  return value === null;
}

function falseValue(value) {
  return value === false;
}

function trueValue(value) {
  return value === true;
}

function emptyArray(value) {
  return isDenseDataArray(value) && value.length === 0;
}

function enumValue(values) {
  return (value) => arrayIncludes(values, value);
}

function nullable(check) {
  return (value) => value === null || check(value);
}

// Optional wrapper metadata is part of this semantic boundary. A wrapper
// cannot turn a contradictory or unrecognized claim into committed success.
// These are answer fields only: the transport outcome travels beside the
// answer (the delivery envelope), so no transport field belongs here.
const OUTCOME_METADATA_FIELDS = objectFreeze({
  messageId: nonEmptyText,
  correlationId: nonEmptyText,
  requestId: nonEmptyText,
  operationId: nonEmptyText,
  causeId: nonEmptyText,
  sourceGroupId: nonEmptyText,
  groupId: nonEmptyText,
  tableName: nonEmptyText,
  operation: enumValue(Object.values(CDC_OPERATION)),
  eventCount: nonNegativeInteger,
  strategy: enumValue(Object.values(CDC_GROUP_PROPAGATION_STRATEGY)),
  mode: enumValue(Object.values(CDC_GROUP_PROPAGATION_STATUS)),
  targetGroupCount: nonNegativeInteger,
  fallbackReason: nullable(enumValue(Object.values(CDC_GROUP_PROPAGATION_REASON))),
  fallbackStrategy: nullable(enumValue(Object.values(CDC_GROUP_PROPAGATION_STRATEGY))),
  timestamp: (value) => numberIsFinite(value) && value >= 0,
  type: enumValue(Object.values(MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE)),
  status: enumValue(SUCCESS_STATUSES),
});

const COMMITTED_OUTCOME_FIELDS = objectFreeze({
  ...OUTCOME_METADATA_FIELDS,
  success: trueValue,
  cdcCommitted: isDenseDataArray,
  cdcVectorDigest: isSha256Digest,
  error: nullValue,
  deferRetry: falseValue,
  retryAfterMs: nullValue,
  deliveryFailures: emptyArray,
});

const PROVISIONAL_OUTCOME_FIELDS = objectFreeze({
  ...OUTCOME_METADATA_FIELDS,
  success: falseValue,
  error: (value) => value === CDC_COMPLETION.PROVISIONAL,
  cdcProvisional: isDenseDataArray,
  cdcVectorDigest: isSha256Digest,
  deferRetry: trueValue,
  retryAfterMs: nullable((value) => numberIsFinite(value) && value > 0),
  deliveryFailures: emptyArray,
});

function outcomeFieldsMatch(answer, fields, required) {
  return isRecord(answer) && arrayEvery(required, (field) => objectHasOwn(answer, field)) &&
    arrayEvery(objectKeys(answer), (field) =>
      objectHasOwn(fields, field) && fields[field](answer[field]));
}

function hasDurableCdcEvents(events) {
  if (isProxy(events)) {
    throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  if (!arrayIsArray(events)) return false;
  // An unreadable member cannot be classified ordinary by invoking its
  // accessor. Reject before either normalization path acquires effects.
  if (!isDenseDataArray(events)) {
    throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (isProxy(event)) {
      throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
    }
    if (event !== null && typeof event === 'object' &&
        objectHasOwn(event, CDC_EVENT_METADATA_FIELD.EVENT_KEY)) return true;
  }
  return false;
}

// Diagnostic cause/replay fields do not change the source operation's effect.
function cdcSemanticEvent(event) {
  const envelope = copyCdcEvent(event);
  return {
    tableName: envelope.tableName,
    operation: envelope.operation,
    data: envelope.data,
    ...(objectHasOwn(envelope, CDC_EVENT_METADATA_FIELD.TIMESTAMP) ?
      {timestamp: envelope.timestamp} : {}),
    ...(objectHasOwn(envelope, CDC_EVENT_METADATA_FIELD.EVENT_KEY) ?
      {sourcePartition: envelope.sourcePartition, eventKey: envelope.eventKey,
        ...(objectHasOwn(envelope, CDC_EVENT_METADATA_FIELD.SOURCE_LOG_INDEX) ?
          {sourceLogIndex: envelope.sourceLogIndex} : {}),
        ...(objectHasOwn(envelope, CDC_EVENT_METADATA_FIELD.SOURCE_ORDINAL) ?
          {sourceOrdinal: envelope.sourceOrdinal} : {}),
        ...(objectHasOwn(envelope, CDC_EVENT_METADATA_FIELD.SOURCE_SCOPE) ?
          {sourceScope: envelope.sourceScope} : {})} : {}),
  };
}

function cdcEventBinding(event) {
  return {
    sourcePartition: event.sourcePartition,
    eventKey: event.eventKey,
    eventDigest: digest(cdcSemanticEvent(event)),
  };
}

function durableCdcBindings(events) {
  const bindings = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (objectHasOwn(event, CDC_EVENT_METADATA_FIELD.EVENT_KEY)) {
      appendOwnArrayValue(bindings, cdcEventBinding(event));
    }
  }
  return bindings;
}

function cdcCommitWaitIdentity(events) {
  if (!isDenseDataArray(events)) {
    throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  return digest(copyArrayByIndex(events, cdcSemanticEvent));
}

function buildCommittedCdcOutcome(events, groupId, {index, term}) {
  return {
    success: true,
    cdcVectorDigest: cdcCommitWaitIdentity(events),
    cdcCommitted: copyArrayByIndex(durableCdcBindings(events), (binding) => ({
      ...binding, groupId, logIndex: index, term,
    })),
  };
}

function buildProvisionalCdcOutcome(events, retryAfterMs, groupId = null) {
  return {
    success: false,
    cdcVectorDigest: cdcCommitWaitIdentity(events),
    error: CDC_COMPLETION.PROVISIONAL,
    deferRetry: true,
    ...(numberIsFinite(retryAfterMs) && retryAfterMs > 0 ? {retryAfterMs} : {}),
    ...(groupId === null ? {} : {groupId}),
    cdcProvisional: durableCdcBindings(events),
  };
}

function sameBinding(actual, expected) {
  return isRecord(actual) && actual.sourcePartition === expected.sourcePartition &&
    actual?.eventKey === expected.eventKey &&
    actual?.eventDigest === expected.eventDigest;
}

function exactReceiptFields(receipt, fields) {
  const keys = objectKeys(receipt);
  return keys.length === fields.length && arrayEvery(keys, (key) => arrayIncludes(fields, key));
}

function distinctBindings(expected) {
  const distinct = new SetConstructor();
  for (let index = 0; index < expected.length; index += 1) {
    const binding = expected[index];
    const key = serializeJsonData([binding.sourcePartition, binding.eventKey]);
    if (setHas(distinct, key)) return false;
    setAdd(distinct, key);
  }
  return true;
}

function matchingBindings(actual, expected, accepts) {
  let matches = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const receipt = actual[index];
    if (sameBinding(receipt, expected) && accepts(receipt)) matches += 1;
  }
  return matches;
}

function exactBindings(actual, expected, accepts = () => true) {
  if (expected.length === 0 || !isDenseDataArray(actual) ||
      actual.length !== expected.length) return false;
  return distinctBindings(expected) && arrayEvery(expected, (binding) =>
    matchingBindings(actual, binding, accepts) === 1);
}

function hasCdcVectorDigest(value) {
  return isRecord(value) && objectHasOwn(value, CDC_OUTCOME_FIELD.VECTOR_DIGEST) &&
    isSha256Digest(value.cdcVectorDigest);
}

function matchesCdcVector(answer, events) {
  return hasCdcVectorDigest(answer) && answer.cdcVectorDigest === cdcCommitWaitIdentity(events);
}

function isCommittedCdcOutcome(answer, events, groupId = null) {
  if (!outcomeFieldsMatch(answer, COMMITTED_OUTCOME_FIELDS, COMMITTED_REQUIRED_FIELDS) ||
      answer.success !== true || !isDenseDataArray(answer.cdcCommitted) ||
      !matchesCdcVector(answer, events)) return false;
  const bindings = durableCdcBindings(events);
  return exactBindings(answer.cdcCommitted, bindings, (actual) =>
    exactReceiptFields(actual, CDC_COMMITTED_RECEIPT_FIELDS) &&
    typeof actual.groupId === 'string' && actual.groupId.length > 0 &&
    (groupId === null || actual.groupId === groupId) &&
    numberIsSafeInteger(actual.logIndex) && actual.logIndex > 0 &&
    numberIsSafeInteger(actual.term) && actual.term > 0);
}

function isProvisionalCdcOutcome(answer, events, groupId = null) {
  if (!outcomeFieldsMatch(answer, PROVISIONAL_OUTCOME_FIELDS, PROVISIONAL_REQUIRED_FIELDS) ||
      answer.success !== false || answer.error !== CDC_COMPLETION.PROVISIONAL ||
      (groupId !== null && (!objectHasOwn(answer, CDC_OUTCOME_FIELD.GROUP_ID) ||
        answer.groupId !== groupId)) ||
      !matchesCdcVector(answer, events)) return false;
  const bindings = durableCdcBindings(events);
  return exactBindings(answer.cdcProvisional, bindings,
    (actual) => exactReceiptFields(actual, CDC_BINDING_FIELDS));
}

function unknownCdcAcceptance(error = CDC_COMPLETION.UNKNOWN) {
  return {success: false, error, deferRetry: true};
}

// Over a delivery envelope: the router delivered it AND its answer is the
// canonical committed (or provisional) CDC outcome. The answer's own
// deferral is CDC's provisional state, never a transport deferral.
function isCommittedCdcDelivery(delivery, events, groupId) {
  return isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) &&
    isCommittedCdcOutcome(deliveryAnswerOf(delivery), events, groupId);
}

function isProvisionalCdcDelivery(delivery, events, groupId = null) {
  return isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) &&
    isProvisionalCdcOutcome(deliveryAnswerOf(delivery), events, groupId);
}

// These observations contain only validated coverage/receipt metadata. The
// source lane binds them to its exact vector, consumer and recipient lifetime;
// no response body or event payload is retained between invocations. A local
// answer is observed as is; a delivery is observed through its envelope.
function observeCdcCoverage(answer, events, groupId = null) {
  if (isCommittedCdcOutcome(answer, events, groupId)) {
    return objectFreeze({state: CDC_COVERAGE_STATE.COMMITTED,
      cdcVectorDigest: answer.cdcVectorDigest,
      receipts: objectFreeze(copyArrayByIndex(answer.cdcCommitted, (receipt) =>
        objectFreeze({...receipt})))});
  }
  return isProvisionalCdcOutcome(answer, events, groupId) ?
    objectFreeze({state: CDC_COVERAGE_STATE.PROVISIONAL,
      cdcVectorDigest: answer.cdcVectorDigest}) : UNCOVERED_CDC;
}

function observeCdcDeliveryCoverage(delivery, events, groupId = null) {
  return isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) ?
    observeCdcCoverage(deliveryAnswerOf(delivery), events, groupId) : UNCOVERED_CDC;
}

function emptyCdcCoverage() {
  return UNCOVERED_CDC;
}

function coverageMatchesVector(coverage, expectedVectorDigest) {
  return hasCdcVectorDigest(coverage) && objectHasOwn(coverage, FIELD.STATE) &&
    (coverage.state === CDC_COVERAGE_STATE.COMMITTED ||
      coverage.state === CDC_COVERAGE_STATE.PROVISIONAL) &&
    coverage.cdcVectorDigest === expectedVectorDigest;
}

function cdcCoverageState(coverages, ...expectedVectorDigests) {
  if (!isDenseDataArray(coverages) || coverages.length === 0 ||
      !hasCdcVectorDigest(coverages[0])) return CDC_COVERAGE_STATE.UNCOVERED;
  // An explicitly supplied missing/invalid binding cannot silently fall back
  // to the observation. Without an expected argument, all bindings still agree.
  const expectedVectorDigest = expectedVectorDigests.length === 0 ?
    coverages[0].cdcVectorDigest : expectedVectorDigests[0];
  if (!isSha256Digest(expectedVectorDigest) || !arrayEvery(coverages, (coverage) =>
    coverageMatchesVector(coverage, expectedVectorDigest))) {
    return CDC_COVERAGE_STATE.UNCOVERED;
  }
  return arrayEvery(coverages, (coverage) => coverage.state === CDC_COVERAGE_STATE.COMMITTED) ?
    CDC_COVERAGE_STATE.COMMITTED : CDC_COVERAGE_STATE.PROVISIONAL;
}

function completeCdcPropagation(events, source, targets, groupId, retryAfterMs) {
  if (!isDenseDataArray(targets)) return unknownCdcAcceptance();
  const state = cdcCoverageState(concatenateArraysByIndex([source], targets),
    cdcCommitWaitIdentity(events));
  if (state === CDC_COVERAGE_STATE.UNCOVERED) return unknownCdcAcceptance();
  if (state === CDC_COVERAGE_STATE.PROVISIONAL) {
    return buildProvisionalCdcOutcome(events, retryAfterMs, groupId);
  }
  const answer = {success: true, cdcVectorDigest: source.cdcVectorDigest,
    cdcCommitted: source.receipts};
  return isCommittedCdcOutcome(answer, events, groupId) ? answer : unknownCdcAcceptance();
}

export {
  CDC_COMPLETION,
  CDC_COVERAGE_STATE,
  buildCommittedCdcOutcome,
  buildProvisionalCdcOutcome,
  cdcCommitWaitIdentity,
  cdcCoverageState,
  completeCdcPropagation,
  emptyCdcCoverage,
  hasDurableCdcEvents,
  isCommittedCdcOutcome,
  isCommittedCdcDelivery,
  isProvisionalCdcDelivery,
  isProvisionalCdcOutcome,
  observeCdcCoverage,
  observeCdcDeliveryCoverage,
  unknownCdcAcceptance,
};
