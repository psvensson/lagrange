import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';

const {
  CDC_EVENT,
  stableSerializeMutationKey,
} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * Emit CDC error event only when listeners are registered.
 * @param {Object} context - Service context providing emit and listenerCount methods.
 * @param {Object} payload - CDC error payload.
 */
export function emitErrorEvent(context, payload) {
  if (context.listenerCount(CDC_EVENT.ERROR) > 0) {
    context.emit(CDC_EVENT.ERROR, payload);
  }
}

/**
 * Build one canonical single-flight key for an in-flight system-table
 * mutation so identical callers collapse into one routed write.
 * @param {string} operation
 * @param {string} tableName
 * @param {string|null} identity
 * @param {Object} payload
 * @param {Object} [options={}]
 * @return {string|null} Key or null if coalescing not allowed.
 */
export function buildMutationSingleFlightKey(
  operation,
  tableName,
  identity,
  payload,
  options = {},
) {
  if (options?.allowCoalescing === false) {
    return null;
  }
  if (
    typeof options?.coalescingKey === 'string' &&
    options.coalescingKey.length > 0
  ) {
    return `${operation}:${tableName}:${options.coalescingKey}`;
  }
  return stableSerializeMutationKey({
    operation,
    tableName,
    identity: identity || null,
    payload,
    ignoreExisting: options?.ignoreExisting === true,
  });
}

/**
 * Reuse one in-flight mutation promise when callers submit the same
 * canonical write intent concurrently.
 * @param {Object} context - Service context providing inFlightMutationsByKey Map.
 * @param {string|null} singleFlightKey
 * @param {Function} executionFactory
 * @return {Promise<Object>} Execution result.
 */
export function runCoalescedMutation(context, singleFlightKey, executionFactory) {
  if (!singleFlightKey) {
    return executionFactory();
  }
  const existingMutation = context.inFlightMutationsByKey.get(singleFlightKey);
  if (existingMutation) {
    return existingMutation;
  }
  let inFlightMutation = null;
  inFlightMutation = Promise.resolve()
    .then(() => executionFactory())
    .finally(() => {
      if (
        context.inFlightMutationsByKey.get(singleFlightKey) === inFlightMutation
      ) {
        context.inFlightMutationsByKey.delete(singleFlightKey);
      }
    });
  context.inFlightMutationsByKey.set(singleFlightKey, inFlightMutation);
  return inFlightMutation;
}
