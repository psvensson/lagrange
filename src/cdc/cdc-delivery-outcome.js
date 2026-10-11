import {digest} from '../utils/canonical-json-data.js';
import {copyCdcEventMetadata} from './cdc-event-envelope.js';
import {
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
} from '../transport/transport-semantic-outcome.js';

const CDC_COMPLETION = Object.freeze({
  UNKNOWN: 'cdc_committed_acceptance_unknown',
  PROVISIONAL: 'cdc_provisional_ingress',
  INVALID: 'cdc_committed_acceptance_invalid',
  BACKPRESSURE: 'cdc_committed_acceptance_backpressure',
});

function hasDurableCdcEvents(events) {
  return events.some((event) => Object.hasOwn(event, 'eventKey'));
}

// Diagnostic cause/replay fields do not change the source operation's effect.
function cdcSemanticEvent(event) {
  copyCdcEventMetadata(event);
  return {
    tableName: event.tableName,
    operation: event.operation,
    data: event.data,
    timestamp: event.timestamp,
    ...(Object.hasOwn(event, 'eventKey') ?
      {sourcePartition: event.sourcePartition, eventKey: event.eventKey,
        ...(Number.isSafeInteger(event.sourceLogIndex) ?
          {sourceLogIndex: event.sourceLogIndex} : {}),
        ...(Number.isSafeInteger(event.sourceOrdinal) ?
          {sourceOrdinal: event.sourceOrdinal} : {}),
        ...(event.sourceScope ? {sourceScope: event.sourceScope} : {})} : {}),
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
  return events.filter((event) => Object.hasOwn(event, 'eventKey'))
    .map(cdcEventBinding);
}

function cdcCommitWaitIdentity(events) {
  return digest(events.map(cdcSemanticEvent));
}

function buildCommittedCdcOutcome(events, groupId, {index, term}) {
  return {
    success: true,
    cdcCommitted: durableCdcBindings(events).map((binding) => ({
      ...binding, groupId, logIndex: index, term,
    })),
  };
}

function buildProvisionalCdcOutcome(events, retryAfterMs) {
  return {
    success: false,
    error: CDC_COMPLETION.PROVISIONAL,
    deferRetry: true,
    retryAfterMs,
    cdcProvisional: durableCdcBindings(events),
  };
}

function sameBinding(actual, expected) {
  return actual?.sourcePartition === expected.sourcePartition &&
    actual?.eventKey === expected.eventKey &&
    actual?.eventDigest === expected.eventDigest;
}

function exactBindings(actual, expected, accepts = () => true) {
  if (expected.length === 0 || !Array.isArray(actual) ||
      actual.length !== expected.length) return false;
  const distinct = new Set(expected.map((binding) =>
    JSON.stringify([binding.sourcePartition, binding.eventKey])));
  return distinct.size === expected.length && expected.every((binding) =>
    actual.filter((receipt) => sameBinding(receipt, binding) && accepts(receipt)).length === 1);
}

function isCommittedCdcOutcome(answer, events, groupId = null) {
  if (answer?.success !== true || !Array.isArray(answer.cdcCommitted)) return false;
  const bindings = durableCdcBindings(events);
  return exactBindings(answer.cdcCommitted, bindings, (actual) =>
    typeof actual.groupId === 'string' && actual.groupId.length > 0 &&
    (groupId === null || actual.groupId === groupId) &&
    Number.isSafeInteger(actual.logIndex) && actual.logIndex > 0 &&
    Number.isSafeInteger(actual.term) && actual.term > 0);
}

function isProvisionalCdcOutcome(answer, events) {
  if (answer?.success !== false || answer.error !== CDC_COMPLETION.PROVISIONAL) return false;
  const bindings = durableCdcBindings(events);
  return exactBindings(answer.cdcProvisional, bindings);
}

function unknownCdcAcceptance(error = CDC_COMPLETION.UNKNOWN) {
  return {success: false, error, deferRetry: true};
}

function isCommittedCdcDelivery(answer, events, groupId) {
  return isDeliveredTransportDeliveryOutcome(classifyTransportDeliveryOutcome(answer)) &&
    isCommittedCdcOutcome(answer, events, groupId);
}

function isProvisionalCdcDelivery(answer, events) {
  const transport = classifyTransportDeliveryOutcome(answer);
  return transport.acknowledged && !transport.noHandler && transport.errorCode === null &&
    transport.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.TRANSPORT_DEFERRED &&
    isProvisionalCdcOutcome(answer, events);
}

function completeCdcPropagation(event, sourceAnswer, failures, result) {
  if (!hasDurableCdcEvents([event])) return result;
  const sourceCommitted = isCommittedCdcOutcome(sourceAnswer, [event], result.sourceGroupId);
  if (sourceCommitted && failures.length === 0) {
    return {...result, success: true, cdcCommitted: sourceAnswer.cdcCommitted};
  }
  if ((sourceCommitted || isProvisionalCdcOutcome(sourceAnswer, [event])) &&
      failures.every((failure) => isProvisionalCdcDelivery(failure.outcome, [event]))) {
    return {...result, ...buildProvisionalCdcOutcome([event], sourceAnswer.retryAfterMs)};
  }
  return {...result, ...unknownCdcAcceptance()};
}

export {
  CDC_COMPLETION,
  buildCommittedCdcOutcome,
  buildProvisionalCdcOutcome,
  cdcCommitWaitIdentity,
  completeCdcPropagation,
  hasDurableCdcEvents,
  isCommittedCdcOutcome,
  isCommittedCdcDelivery,
  isProvisionalCdcDelivery,
  isProvisionalCdcOutcome,
  unknownCdcAcceptance,
};
