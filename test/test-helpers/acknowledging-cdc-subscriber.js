// The one acknowledging CDC subscriber for partition-level tests on the
// durable obligation path (4151a3ab4). A durable CDC event counts as delivered
// only when its subscriber answers the CDC outcome owner's committed receipt
// (buildCommittedCdcOutcome, src/cdc/cdc-delivery-outcome.js); any other
// answer is a refusal the delivery owner redelivers, and the ordered lane
// holds every later event behind it (assertSubscriberAcceptance,
// src/partition/partition-cdc-delivery.js). Under the one subscriber contract
// it is handed (events, deliveryContext), events an ordered vector: it records
// each vector and each of its events and answers the receipt over exactly that
// vector. It stands in for a downstream committer and is never evidence of
// one: the receipt is a controlled input.
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';

const ACKNOWLEDGING_CDC_SUBSCRIBER_GROUP = 'acknowledging-cdc-subscriber';
const ACKNOWLEDGING_CDC_SUBSCRIBER_TERM = 1;
const PENDING_CDC_SETTLE_ROUNDS = 50;

/**
 * Build a CDC subscriber that answers every vector it is handed with the
 * owner's committed receipt over that vector and records it.
 * @param {Object} [options] - Options.
 * @param {string} [options.groupId] - The receipt's group identity.
 * @param {Function} [options.onVector] - (events) => void|Promise, run once
 *   per invocation before the receipt.
 * @param {Function} [options.onEvent] - (event) => void|Promise, run for each
 *   member in order before the receipt; a throw (of either hook) refuses the
 *   whole vector through the real refusal path, and nothing of it is recorded.
 * @param {Function} [options.canAcceptCDCEvent] - The subscriber's readiness
 *   answer, read by the delivery owner before each invocation.
 * @return {Function} The subscriber, with `vectors` (every invocation's
 *   vector, in order) and `events` (their members, flattened in order).
 */
function acknowledgingCdcSubscriber({groupId = ACKNOWLEDGING_CDC_SUBSCRIBER_GROUP,
  onVector = null, onEvent = null, canAcceptCDCEvent = null} = {}) {
  const events = [];
  const vectors = [];
  let logIndex = 0;
  const subscriber = async (delivered) => {
    if (onVector !== null) await onVector(delivered);
    for (const event of delivered) {
      if (onEvent !== null) await onEvent(event);
    }
    vectors.push(delivered);
    events.push(...delivered);
    logIndex += 1;
    return buildCommittedCdcOutcome(delivered, groupId,
      {index: logIndex, term: ACKNOWLEDGING_CDC_SUBSCRIBER_TERM});
  };
  subscriber.events = events;
  subscriber.vectors = vectors;
  if (canAcceptCDCEvent !== null) subscriber.canAcceptCDCEvent = canAcceptCDCEvent;
  return subscriber;
}

/**
 * Await the partition's own tracked CDC deliveries (the service's
 * pendingCDCEventDeliveries set) until none is in flight; a drive started by
 * a settled one is awaited too. Armed retry timers are not in flight and are
 * not waited for.
 * @param {Object} service - A PartitionService.
 * @return {Promise<void>}
 */
async function settlePendingCdcDeliveries(service) {
  for (let round = 0; round < PENDING_CDC_SETTLE_ROUNDS &&
      service.pendingCDCEventDeliveries.size > 0; round += 1) {
    await Promise.allSettled([...service.pendingCDCEventDeliveries]);
  }
}

export {acknowledgingCdcSubscriber, settlePendingCdcDeliveries};
