import {
  POSTGRES_BASELINE_COMPARISON_SEGMENT_1,
} from './postgres-baseline-comparison-segment-1.js';

const {
  DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH,
  DISCOVERY_ERROR_MESSAGE_MAX_CHARS,
  DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
  ONE,
  ZERO,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_1;

function extractDiscoveryErrorMessageChain(error) {
  const messages = [];
  let current = error;
  let depth = ZERO;
  while (
    current !== null &&
    current !== undefined &&
    depth < DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH
  ) {
    let message = null;
    if (typeof current === 'string') {
      message = current;
    } else if (typeof current?.message === 'string') {
      message = current.message;
    }
    if (
      typeof message === 'string' &&
      message.length > ZERO &&
      !messages.includes(message)
    ) {
      messages.push(message);
    }
    if (!current || typeof current !== 'object') {
      break;
    }
    current = current.cause;
    depth += ONE;
  }
  return messages;
}

export function truncateDiscoveryErrorMessage(errorMessage) {
  const text = String(errorMessage || '');
  if (text.length <= DISCOVERY_ERROR_MESSAGE_MAX_CHARS) {
    return text;
  }
  return text.slice(ZERO, DISCOVERY_ERROR_MESSAGE_MAX_CHARS);
}

export function isNodeClientCircuitOpenError(error) {
  if (
    String(error?.code || '') === DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN
  ) {
    return true;
  }
  const messageChain = extractDiscoveryErrorMessageChain(error);
  if (
    messageChain.some((message) =>
      String(message).includes(
        'code=' + DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
      ),
    )
  ) {
    return true;
  }
  return messageChain.some((message) =>
    String(message).includes('circuit breaker is open'),
  );
}
