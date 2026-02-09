import {v4 as uuidv4} from 'uuid';

/**
 * HTTP header name for correlation ID propagation.
 * @type {string}
 */
const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Generate a new unique correlation ID.
 * @return {string} A UUID v4 string
 */
function generateCorrelationId() {
  return uuidv4();
}

/**
 * Get the correlation ID from a message, or create a new one if not present.
 * @param {Object} message - The message to extract correlation ID from
 * @return {string} The existing or newly generated correlation ID
 */
function getOrCreateCorrelationId(message) {
  return message.correlationId || generateCorrelationId();
}

/**
 * Create a new message object with a correlation ID.
 * If correlationId is provided, uses it; otherwise generates a new one.
 * @param {Object} message - The original message
 * @param {string} [correlationId] - Optional correlation ID to use
 * @return {Object} A new message object with correlationId field
 */
function withCorrelationId(message, correlationId) {
  return {
    ...message,
    correlationId: correlationId || generateCorrelationId(),
  };
}

export {
  CORRELATION_HEADER,
  generateCorrelationId,
  getOrCreateCorrelationId,
  withCorrelationId,
};
