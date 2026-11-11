import {deliveryTransportOf, deliveryAnswerOf,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {
  TRANSPORT_DELIVERY_FAILURE,
  classifyTransportDeliveryFailure,
  mayResendAfterTransportFailure,
} from '../transport/transport-delivery-failure.js';

const SOURCE_START_OUTCOME = Object.freeze({ANSWER_UNKNOWN: 'source_start_answer_unknown'});
const SOURCE_START_DELIVERY_FAILED = 'Source replication START delivery failed';

// START's one re-send fact: a re-send is not the same authorization (its
// answer is resolved by the workflow's confirmation read), so an ambiguous
// failure is START_ANSWER_UNKNOWN, never a blind re-send.
function markDeliveryAnswerLossCandidate(error) {
  if (error && (sourceReplicationStartAnswerMayBeLost(error) ||
      classifyTransportDeliveryFailure(error.deliveryOutcome ?? error) ===
        TRANSPORT_DELIVERY_FAILURE.AMBIGUOUS)) {
    error.sourceStartOutcome = SOURCE_START_OUTCOME.ANSWER_UNKNOWN;
    error.retryable = true;
  }
  return error;
}

/**
 * Require a source START response that reached and completed its registered
 * handler. A router ACK is transport evidence only: noHandler means the
 * target dropped the message before durable START authorization.
 *
 * @param {Object} delivery - MessageRouter delivery envelope.
 * @param {string} fallbackMessage - Operation-specific error text.
 * @return {Object|null} The delivered START answer.
 * @throws {Error} When no handler processed START or it refused execution.
 */
function requireProcessedSourceReplicationStart(delivery, fallbackMessage) {
  const transport = deliveryTransportOf(delivery);
  const answer = deliveryAnswerOf(delivery);
  const delivered = isDeliveredTransportDeliveryOutcome(transport);
  if (delivered && answer?.success !== false) {
    return answer;
  }
  // A refusal is the handler's answer when delivered, else the transport's.
  const refusal = delivered ? answer : transport;
  const error = new Error(refusal.error || fallbackMessage);
  // Undelivered: the transport's decision (nothing executed is re-sent);
  // delivered: the source handler's own answer.
  error.retryable = delivered ?
    refusal.deferRetry === true || refusal.retryable === true :
    mayResendAfterTransportFailure(classifyTransportDeliveryFailure(transport),
      {identityKeyed: false});
  error.deliveryOutcome = transport;
  error.deferRetry = refusal.deferRetry === true;
  error.retryAfterMs = refusal.retryAfterMs;
  if (delivered && sourceReplicationStartAnswerMayBeLost(answer)) {
    error.sourceStartOutcome = SOURCE_START_OUTCOME.ANSWER_UNKNOWN;
  }
  throw error;
}

async function deliverProcessedSourceReplicationStart(
  messageRouter,
  address,
  message,
  fallbackMessage,
) {
  try {
    const response = await messageRouter.deliver(address, message);
    return requireProcessedSourceReplicationStart(response, fallbackMessage);
  } catch (error) {
    throw markDeliveryAnswerLossCandidate(error);
  }
}

function sourceReplicationStartAnswerMayBeLost(error) {
  return error?.sourceStartOutcome === SOURCE_START_OUTCOME.ANSWER_UNKNOWN;
}

// START owns uncertainty about its authorization, across any number of hops.
// The forwarding router still owns only its own hop's transport. Reuse the
// same START delivery/classification path and carry only the domain obligation.
async function forwardSourceReplicationStart(messageRouter, address, message) {
  try {
    return await deliverProcessedSourceReplicationStart(
      messageRouter, address, message, SOURCE_START_DELIVERY_FAILED);
  } catch (error) {
    return {success: false, error: error.message, retryable: error.retryable === true,
      deferRetry: error.deferRetry === true, retryAfterMs: error.retryAfterMs,
      ...(sourceReplicationStartAnswerMayBeLost(error) ?
        {sourceStartOutcome: SOURCE_START_OUTCOME.ANSWER_UNKNOWN} : {})};
  }
}

// Both managed workflows use this one continuation decision. A failed hop
// cannot erase a START authorization whose answer is still unknown.
async function startSourceReplicationWithConfirmation({start, isRetryable, confirm}) {
  try {
    await start();
  } catch (error) {
    if (!sourceReplicationStartAnswerMayBeLost(error) || !isRetryable(error) ||
        !await confirm()) throw error;
  }
}

export {
  deliverProcessedSourceReplicationStart,
  forwardSourceReplicationStart,
  startSourceReplicationWithConfirmation,
  sourceReplicationStartAnswerMayBeLost,
};
