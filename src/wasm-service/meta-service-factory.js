/**
 * Factory for creating built-in meta-service definitions.
 * Used during seed bootstrap to provision sys-wasm-meta
 * and sys-admin-meta service definitions.
 *
 * Requirements: 1.1
 */

import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
  SERVICE_PROFILE,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_DEFAULT,
} from './wasm-service-constants.js';

const META_FACTORY_SUBSYSTEM = 'meta-service-factory';

const META_FACTORY_LOG_MSG = Object.freeze({
  WASM_META_CREATED: 'Created sys-wasm-meta service definition',
  ADMIN_META_CREATED: 'Created sys-admin-meta service definition',
});

/**
 * Create the built-in sys-wasm-meta service definition.
 * Binds to wasm_component runtime kind with the WASM meta
 * command handler reference.
 * @return {Object} Service definition object for sys-wasm-meta.
 */
function createWasmMetaDefinition() {
  return {
    serviceId: META_SERVICE_ID.WASM_META,
    serviceName: META_SERVICE_ID.WASM_META,
    serviceProfile: SERVICE_PROFILE.DEFAULT,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    handlerFunctionId: null,
    readConsistency: READ_CONSISTENCY_MODE.STRONG,
    writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
    replicaCount: WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    resourceBudget: {},
    safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    runtimeRef: META_SERVICE_RUNTIME_REF.WASM_META,
    runtimeConfig: null,
  };
}

/**
 * Create the built-in sys-admin-meta service definition.
 * Binds to native_js runtime kind with the admin command
 * handler reference.
 * @return {Object} Service definition object for sys-admin-meta.
 */
function createAdminMetaDefinition() {
  return {
    serviceId: META_SERVICE_ID.ADMIN_META,
    serviceName: META_SERVICE_ID.ADMIN_META,
    serviceProfile: SERVICE_PROFILE.DEFAULT,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    handlerFunctionId: null,
    readConsistency: READ_CONSISTENCY_MODE.STRONG,
    writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
    replicaCount: WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    resourceBudget: {},
    safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.ADMIN_META,
    runtimeConfig: null,
  };
}

export {
  META_FACTORY_SUBSYSTEM,
  META_FACTORY_LOG_MSG,
  createWasmMetaDefinition,
  createAdminMetaDefinition,
};
