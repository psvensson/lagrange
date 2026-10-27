// The one wake surface of a bound WASM creation (design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D6', Revision 3 N7/N13): the
// lifecycle hands the operation owner of the original CREATE a typed,
// enqueue-only wake carrying the exact binding and resource token. The
// lifecycle never awaits the consumer and never retries on its behalf; the
// delivery outcome is returned to the caller, never only logged (R11).
import {CREATION_WAKE_OUTCOME} from '../service/service-consensus-bootstrap.js';
import {WASM_SERVICE_LOG_MSG} from './wasm-service-constants.js';

/**
 * @param {Object} lifecycle - The WasmServiceLifecycle owning the creation.
 * @param {Object} creation - The retained creation ({intent, token}).
 * @param {string} reason - A RECONCILE_REASON creation wake member.
 * @param {Object} [detail] - Typed detail (e.g. {grant: {outcome}}).
 * @return {{outcome: string}} A CREATION_WAKE_OUTCOME.
 */
function deliverWasmCreationWake(lifecycle, creation, reason, detail = {}) {
  const binding = creation.intent.consensusBinding;
  const serviceDefinitionId = binding.serviceDefinitionId;
  const diagnostic = {serviceDefinitionId, reason, operationId: creation.token.operationId};
  const consumer = lifecycle.creationWake;
  if (typeof consumer !== 'function') {
    lifecycle.logger.debug(WASM_SERVICE_LOG_MSG.CREATION_WAKE_UNDELIVERED,
      {...diagnostic, outcome: CREATION_WAKE_OUTCOME.CONSUMER_ABSENT});
    return {outcome: CREATION_WAKE_OUTCOME.CONSUMER_ABSENT};
  }
  try {
    const accepted = consumer(serviceDefinitionId,
      {reason, binding, token: creation.token, ...detail});
    Promise.resolve(accepted).catch((error) => {
      lifecycle.logger.warn(WASM_SERVICE_LOG_MSG.CREATION_WAKE_REJECTED,
        {...diagnostic, error: error?.message});
    });
    return {outcome: CREATION_WAKE_OUTCOME.DELIVERED};
  } catch (error) {
    lifecycle.logger.warn(WASM_SERVICE_LOG_MSG.CREATION_WAKE_UNDELIVERED,
      {...diagnostic, outcome: CREATION_WAKE_OUTCOME.UNDELIVERED, error: error?.message});
    return {outcome: CREATION_WAKE_OUTCOME.UNDELIVERED};
  }
}

export {deliverWasmCreationWake};
