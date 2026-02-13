/**
 * Meta-service lifecycle integration.
 * Ensures sys-wasm-meta and sys-admin-meta replicas are
 * created and started through the existing WasmServiceLifecycle
 * ownership path. No parallel lifecycle logic.
 *
 * Requirements: 1.2, 7.2
 * @module wasm-service/meta-service-lifecycle
 */

import {META_SERVICE_ID} from '../constants/index.js';

const META_LIFECYCLE_ERROR_MSG = Object.freeze({
  NOT_META_SERVICE: 'Service ID is not a recognized meta-service',
  LIFECYCLE_REQUIRED: 'WasmServiceLifecycle instance is required',
});

/**
 * Returns true if the serviceId is a known meta-service.
 *
 * @param {string} serviceId - The service ID to check.
 * @return {boolean} True if meta-service, false otherwise.
 */
function isMetaService(serviceId) {
  return serviceId === META_SERVICE_ID.WASM_META ||
    serviceId === META_SERVICE_ID.ADMIN_META;
}

/**
 * Create a meta-service replica by delegating to the
 * existing WasmServiceLifecycle. Validates that the
 * definition belongs to a known meta-service before
 * delegating.
 *
 * @param {import('./wasm-service-lifecycle.js').WasmServiceLifecycle}
 *   lifecycle - The lifecycle instance to delegate to.
 * @param {Object} definition - Service definition with
 *   serviceId field.
 * @param {Object} replicaConfig - Replica configuration
 *   passed through to lifecycle.createReplica.
 * @return {import('./wasm-service-replica.js').WasmServiceReplica}
 *   The created replica.
 * @throws {Error} If lifecycle is missing or definition is
 *   not a meta-service.
 */
function createMetaServiceReplica(lifecycle, definition, replicaConfig) {
  if (!lifecycle) {
    throw new Error(META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED);
  }
  if (!isMetaService(definition.serviceId)) {
    throw new Error(META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE);
  }
  return lifecycle.createReplica(definition, replicaConfig);
}

/**
 * Start a meta-service replica by delegating to the
 * existing WasmServiceLifecycle.
 *
 * @param {import('./wasm-service-lifecycle.js').WasmServiceLifecycle}
 *   lifecycle - The lifecycle instance to delegate to.
 * @param {string} serviceId - The meta-service ID to start.
 * @param {Object} [startOptions] - Start options passed
 *   through to lifecycle.startReplica.
 * @return {{port: number, endpoint: Object}|null} Startup
 *   result from the lifecycle, or null if replica not found.
 * @throws {Error} If lifecycle is missing or serviceId is
 *   not a meta-service.
 */
function startMetaServiceReplica(lifecycle, serviceId, startOptions) {
  if (!lifecycle) {
    throw new Error(META_LIFECYCLE_ERROR_MSG.LIFECYCLE_REQUIRED);
  }
  if (!isMetaService(serviceId)) {
    throw new Error(META_LIFECYCLE_ERROR_MSG.NOT_META_SERVICE);
  }
  return lifecycle.startReplica(serviceId, startOptions);
}

export {
  META_LIFECYCLE_ERROR_MSG,
  isMetaService,
  createMetaServiceReplica,
  startMetaServiceReplica,
};
