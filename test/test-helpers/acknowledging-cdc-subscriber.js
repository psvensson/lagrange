// The one acknowledging CDC subscriber for partition-level tests on the
// durable obligation path (4151a3ab4). A durable CDC event counts as delivered
// only when its subscriber answers the CDC outcome owner's committed receipt
// (buildCommittedCdcOutcome, src/cdc/cdc-delivery-outcome.js); any other
// answer is a refusal the delivery owner redelivers, and the ordered lane
// holds every later event behind it (assertSubscriberAcceptance,
// src/partition/partition-cdc-delivery.js). This subscriber records each event
// it is handed and answers that receipt. It stands in for a downstream committer
// and is never evidence of one: the receipt is a controlled input.
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';

const ACKNOWLEDGING_CDC_SUBSCRIBER_GROUP = 'acknowledging-cdc-subscriber';
const ACKNOWLEDGING_CDC_SUBSCRIBER_TERM = 1;
const PENDING_CDC_SETTLE_ROUNDS = 50;

/**
 * Build a CDC subscriber that answers every event it is handed with the
 * owner's committed receipt and records it in `subscriber.events`.
 * @param {Object} [options] - Options.
 * @param {string} [options.groupId] - The receipt's group identity.
 * @param {Function} [options.onEvent] - (event) => void|Promise, run before
 *   the receipt; a throw refuses the delivery through the real refusal path.
 * @param {Function} [options.canAcceptCDCEvent] - The subscriber's readiness
 *   answer, read by the delivery owner before each invocation.
 * @return {Function} The subscriber, with `events` (every invocation, in order).
 */
function acknowledgingCdcSubscriber({groupId = ACKNOWLEDGING_CDC_SUBSCRIBER_GROUP,
  onEvent = null, canAcceptCDCEvent = null} = {}) {
  const events = [];
  let logIndex = 0;
  const subscriber = async (event) => {
    if (onEvent !== null) await onEvent(event);
    events.push(event);
    logIndex += 1;
    return buildCommittedCdcOutcome([event], groupId,
      {index: logIndex, term: ACKNOWLEDGING_CDC_SUBSCRIBER_TERM});
  };
  subscriber.events = events;
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
