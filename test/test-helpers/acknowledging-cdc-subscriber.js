// The one acknowledging CDC subscriber for partition-level tests on the
// durable obligation path (4151a3ab4). The durable subscriber contract is one
// vector of events per call (range shipping): the vector counts as delivered
// only when its subscriber answers the CDC outcome owner's committed receipt
// over that exact vector (buildCommittedCdcOutcome,
// src/cdc/cdc-delivery-outcome.js); any other answer is a refusal the delivery
// owner redelivers, and the ordered lane holds every later event behind it
// (deliverCdcVectorToSubscriber, src/partition/partition-cdc-delivery.js).
// This subscriber records each event it is handed, in order, and each vector,
// and answers that receipt. It stands in for a downstream committer and is
// never evidence of one: the receipt is a controlled input.
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';

const ACKNOWLEDGING_CDC_SUBSCRIBER_GROUP = 'acknowledging-cdc-subscriber';
const ACKNOWLEDGING_CDC_SUBSCRIBER_TERM = 1;
const PENDING_CDC_SETTLE_ROUNDS = 50;

/**
 * Build a CDC subscriber that answers every vector it is handed with the
 * owner's committed receipt and records its events in `subscriber.events`
 * (flat, in delivery order) and the vector in `subscriber.vectors`.
 * @param {Object} [options] - Options.
 * @param {string} [options.groupId] - The receipt's group identity.
 * @param {Function} [options.onEvent] - (event) => void|Promise, run for
 *   each event of the vector before the receipt; a throw refuses the whole
 *   vector through the real refusal path.
 * @param {Function} [options.canAcceptCDCEvent] - The subscriber's readiness
 *   answer, read by the delivery owner before each invocation.
 * @return {Function} The subscriber, with `events` (every delivered event,
 *   in order) and `vectors` (every invocation, in order).
 */
function acknowledgingCdcSubscriber({groupId = ACKNOWLEDGING_CDC_SUBSCRIBER_GROUP,
  onEvent = null, canAcceptCDCEvent = null} = {}) {
  const events = [];
  const vectors = [];
  let logIndex = 0;
  const subscriber = async (vector) => {
    if (onEvent !== null) {
      for (const event of vector) await onEvent(event);
    }
    events.push(...vector);
    vectors.push(vector);
    logIndex += 1;
    return buildCommittedCdcOutcome(vector, groupId,
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
