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
  WASM_SERVICE_PROTOCOL,
} from './wasm-service-constants.js';

const META_FACTORY_SUBSYSTEM = 'meta-service-factory';

// Built-in meta services SHIP NOT-STARTED (replica_count 0): their
// command handling runs IN-PROCESS via the meta-service router
// (routeToMetaService), not via placed runtime replicas — no lifecycle
// module exists for their runtime_refs, so a placed replica can never
// prepare. A non-zero ship count only produces a permanent failed-ADD
// retry loop that burns the cluster-wide concurrent-operation budget
// (observed starving unrelated runtime-service placement). Scale up
// deliberately if/when real lifecycle modules exist.
const META_SERVICE_SHIP_REPLICA_COUNT = 0;

const META_FACTORY_LOG_MSG = Object.freeze({
  WASM_META_CREATED: 'Created sys-wasm-meta service definition',
  ADMIN_META_CREATED: 'Created sys-admin-meta service definition',
  POSTGRES_WIRE_CREATED: 'Created sys-postgres-wire service definition',
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
    replicaCount: META_SERVICE_SHIP_REPLICA_COUNT,
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
    replicaCount: META_SERVICE_SHIP_REPLICA_COUNT,
    resourceBudget: {},
    safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.ADMIN_META,
    runtimeConfig: null,
  };
}

/**
 * Create the built-in sys-postgres-wire service definition.
 * Binds to native_js runtime kind with the PostgreSQL wire
 * runtime reference and postgresql protocol.
 * @return {Object} Service definition object for sys-postgres-wire.
 */
function createPostgresWireDefinition() {
  return {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    serviceName: META_SERVICE_ID.POSTGRES_WIRE,
    serviceProfile: SERVICE_PROFILE.DEFAULT,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    handlerFunctionId: null,
    readConsistency: READ_CONSISTENCY_MODE.STRONG,
    writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
    // pgwire additionally HAS a working lifecycle module now (the wired
    // native_js handler map) — a non-zero ship count would bind :5432 on
    // every placed node, so the not-started posture must stay explicit.
    replicaCount: META_SERVICE_SHIP_REPLICA_COUNT,
    resourceBudget: {},
    safetyIntervalMs: WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    runtimeConfig: null,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
  };
}


export {
  META_FACTORY_SUBSYSTEM,
  META_FACTORY_LOG_MSG,
  createWasmMetaDefinition,
  createAdminMetaDefinition,
  createPostgresWireDefinition,
};
