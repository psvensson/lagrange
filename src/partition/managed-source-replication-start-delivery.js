import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {ROUTER_ERROR_MSG} from '../constants/transport.js';

const SOURCE_START_ANSWER_MAY_BE_LOST = Symbol(
  'source-start-answer-may-be-lost',
);

function deliveryAnswerMayBeLost(error) {
  const outcome = error?.deliveryOutcome ||
    classifyTransportDeliveryOutcome(error);
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
 * @param {Object|null} response - MessageRouter delivery response.
 * @param {string} fallbackMessage - Operation-specific error text.
 * @return {Object} The classified delivered response.
 * @throws {Error} When no handler processed START or it refused execution.
 */
function requireProcessedSourceReplicationStart(response, fallbackMessage) {
  const outcome = classifyTransportDeliveryOutcome(response);
  if (isDeliveredTransportDeliveryOutcome(outcome) &&
      outcome.success !== false) {
    return outcome;
  }
  const error = new Error(outcome.error || fallbackMessage);
  error.retryable = outcome.noHandler === true ||
    outcome.deferRetry === true || outcome.retryable === true;
  error.deliveryOutcome = outcome;
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
  requireProcessedSourceReplicationStart,
  sourceReplicationStartAnswerMayBeLost,
};
