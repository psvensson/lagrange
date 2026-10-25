import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../transport/transport-error-codes.js';
import {deliveryTransportOf, deliveryAnswerOf,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyThrownDeliveryError,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {ROUTER_ERROR_MSG} from '../constants/transport.js';

const SOURCE_START_ANSWER_MAY_BE_LOST = Symbol(
  'source-start-answer-may-be-lost',
);

function deliveryAnswerMayBeLost(error) {
  const outcome = error?.deliveryOutcome ||
    classifyThrownDeliveryError(error);
  return error?.message === ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT ||
    outcome.reasonCode ===
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT ||
    (outcome.errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE &&
      outcome.recoverableBeforeSend !== true) ||
    (outcome.errorCode === ROUTER_MESSAGE_TIMEOUT_ERROR_CODE);
}

function markDeliveryAnswerLossCandidate(error) {
  if (error && deliveryAnswerMayBeLost(error)) {
    error[SOURCE_START_ANSWER_MAY_BE_LOST] = true;
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
  error.retryable = transport.noHandler === true ||
    refusal.deferRetry === true || refusal.retryable === true;
  error.deliveryOutcome = transport;
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
  return error?.[SOURCE_START_ANSWER_MAY_BE_LOST] === true;
}

export {
  deliverProcessedSourceReplicationStart,
  sourceReplicationStartAnswerMayBeLost,
};
