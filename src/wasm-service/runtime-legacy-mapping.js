/**
 * Deterministic bidirectional mapping between legacy WASM-centric
 * service_definitions rows and the unified runtime model.
 *
 * Read path: legacy row without runtime fields -> inferred runtime fields.
 * Write path: runtime-aware definition -> legacy-compatible row fields.
 *
 * Mapping rules (from design doc):
 * 1. Legacy WASM service: runtime_kind=wasm_component, runtime_ref=handler_function_id
 * 2. Admin/native service: runtime_kind=native_js, runtime_ref=<handler_id>
 * 3. Container service: runtime_kind=oci_container, runtime_ref=<digest_ref>
 *
 * Requirements: 3.1, 5.2, 5.3
 */

import {
  RUNTIME_KIND,
  SQL_ENGINE_RUNTIME_KIND,
} from '../constants/runtime.js';
import {SERVICE_PROFILE} from '../constants/service.js';

/**
 * Infer runtime fields from a legacy service definition row.
 * Used on the read path when a row lacks explicit runtime_kind.
 *
 * Rules:
 * - service_profile=sql_engine -> native_js, runtime_ref=null
 * - handler_function_id present -> wasm_component, runtime_ref=handler_function_id
 * - handler_function_id absent  -> native_js, runtime_ref=null
 *
 * @param {Object} row - Deserialized service definition (camelCase keys).
 * @return {{runtimeKind: string, runtimeRef: string|null, runtimeConfig: string|null}}
 */
function inferRuntimeFromLegacy(row) {
  if (row.serviceProfile === SERVICE_PROFILE.SQL_ENGINE) {
    return {
      runtimeKind: SQL_ENGINE_RUNTIME_KIND,
      runtimeRef: null,
      runtimeConfig: row.runtimeConfig ?? null,
    };
  }
  if (row.handlerFunctionId) {
    return {
      runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      runtimeRef: row.handlerFunctionId,
      runtimeConfig: row.runtimeConfig ?? null,
    };
  }
  return {
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: null,
    runtimeConfig: row.runtimeConfig ?? null,
  };
}

/**
 * Infer legacy handler_function_id from runtime fields.
 * Used on the write path to keep legacy columns populated.
 *
 * Rules:
 * - wasm_component: handler_function_id = runtime_ref
 * - native_js:      handler_function_id = null (no WASM handler)
 * - oci_container:  handler_function_id = null (no WASM handler)
 *
 * @param {Object} def - Service definition with runtime fields (camelCase).
 * @return {string|null} The handler_function_id value for the legacy column.
 */
function inferLegacyFromRuntime(def) {
  if (def.runtimeKind === RUNTIME_KIND.WASM_COMPONENT) {
    return def.runtimeRef ?? null;
  }
  return null;
}

/**
 * Apply runtime field inference to a deserialized service definition.
 * If runtime_kind is already set, returns the definition unchanged.
 * If runtime_kind is missing/null, infers it from legacy fields.
 *
 * Pure function: does not mutate the input.
 *
 * @param {Object} def - Deserialized service definition (camelCase keys).
 * @return {Object} Definition with runtime fields guaranteed populated.
 */
function applyRuntimeDefaults(def) {
  if (def.runtimeKind) {
    return def;
  }
  const inferred = inferRuntimeFromLegacy(def);
  return {
    ...def,
    runtimeKind: inferred.runtimeKind,
    runtimeRef: inferred.runtimeRef,
    runtimeConfig: inferred.runtimeConfig,
  };
}

/**
 * Apply legacy field inference to a service definition before
 * serialization. Ensures handler_function_id stays populated
 * for backward compatibility when writing runtime-aware rows.
 *
 * If handlerFunctionId is already explicitly set, it is preserved.
 * Otherwise it is inferred from runtime fields.
 *
 * Pure function: does not mutate the input.
 *
 * @param {Object} def - Service definition (camelCase keys).
 * @return {Object} Definition with legacy fields guaranteed populated.
 */
function applyLegacyDefaults(def) {
  if (def.handlerFunctionId !== undefined &&
      def.handlerFunctionId !== null) {
    return def;
  }
  return {
    ...def,
    handlerFunctionId: inferLegacyFromRuntime(def),
  };
}

export {
  inferRuntimeFromLegacy,
  inferLegacyFromRuntime,
  applyRuntimeDefaults,
  applyLegacyDefaults,
};
