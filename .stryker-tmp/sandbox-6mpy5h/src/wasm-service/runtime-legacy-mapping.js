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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { RUNTIME_KIND, SQL_ENGINE_RUNTIME_KIND } from '../constants/runtime.js';
import { SERVICE_PROFILE } from '../constants/service.js';

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
  if (stryMutAct_9fa48("162918")) {
    {}
  } else {
    stryCov_9fa48("162918");
    return stryMutAct_9fa48("162919") ? {} : (stryCov_9fa48("162919"), {
      runtimeKind: (stryMutAct_9fa48("162922") ? row.serviceProfile !== SERVICE_PROFILE.SQL_ENGINE : stryMutAct_9fa48("162921") ? false : stryMutAct_9fa48("162920") ? true : (stryCov_9fa48("162920", "162921", "162922"), row.serviceProfile === SERVICE_PROFILE.SQL_ENGINE)) ? SQL_ENGINE_RUNTIME_KIND : row.handlerFunctionId ? RUNTIME_KIND.WASM_COMPONENT : RUNTIME_KIND.NATIVE_JS,
      runtimeRef: (stryMutAct_9fa48("162925") ? row.serviceProfile !== SERVICE_PROFILE.SQL_ENGINE : stryMutAct_9fa48("162924") ? false : stryMutAct_9fa48("162923") ? true : (stryCov_9fa48("162923", "162924", "162925"), row.serviceProfile === SERVICE_PROFILE.SQL_ENGINE)) ? null : stryMutAct_9fa48("162928") ? row.handlerFunctionId && null : stryMutAct_9fa48("162927") ? false : stryMutAct_9fa48("162926") ? true : (stryCov_9fa48("162926", "162927", "162928"), row.handlerFunctionId || null),
      runtimeConfig: stryMutAct_9fa48("162929") ? row.runtimeConfig && null : (stryCov_9fa48("162929"), row.runtimeConfig ?? null)
    });
  }
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
  if (stryMutAct_9fa48("162930")) {
    {}
  } else {
    stryCov_9fa48("162930");
    if (stryMutAct_9fa48("162933") ? def.runtimeKind !== RUNTIME_KIND.WASM_COMPONENT : stryMutAct_9fa48("162932") ? false : stryMutAct_9fa48("162931") ? true : (stryCov_9fa48("162931", "162932", "162933"), def.runtimeKind === RUNTIME_KIND.WASM_COMPONENT)) {
      if (stryMutAct_9fa48("162934")) {
        {}
      } else {
        stryCov_9fa48("162934");
        return stryMutAct_9fa48("162935") ? def.runtimeRef && null : (stryCov_9fa48("162935"), def.runtimeRef ?? null);
      }
    }
    return null;
  }
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
  if (stryMutAct_9fa48("162936")) {
    {}
  } else {
    stryCov_9fa48("162936");
    if (stryMutAct_9fa48("162938") ? false : stryMutAct_9fa48("162937") ? true : (stryCov_9fa48("162937", "162938"), def.runtimeKind)) {
      if (stryMutAct_9fa48("162939")) {
        {}
      } else {
        stryCov_9fa48("162939");
        return def;
      }
    }
    const inferred = inferRuntimeFromLegacy(def);
    return stryMutAct_9fa48("162940") ? {} : (stryCov_9fa48("162940"), {
      ...def,
      runtimeKind: inferred.runtimeKind,
      runtimeRef: inferred.runtimeRef,
      runtimeConfig: inferred.runtimeConfig
    });
  }
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
  if (stryMutAct_9fa48("162941")) {
    {}
  } else {
    stryCov_9fa48("162941");
    if (stryMutAct_9fa48("162944") ? def.handlerFunctionId !== undefined || def.handlerFunctionId !== null : stryMutAct_9fa48("162943") ? false : stryMutAct_9fa48("162942") ? true : (stryCov_9fa48("162942", "162943", "162944"), (stryMutAct_9fa48("162946") ? def.handlerFunctionId === undefined : stryMutAct_9fa48("162945") ? true : (stryCov_9fa48("162945", "162946"), def.handlerFunctionId !== undefined)) && (stryMutAct_9fa48("162948") ? def.handlerFunctionId === null : stryMutAct_9fa48("162947") ? true : (stryCov_9fa48("162947", "162948"), def.handlerFunctionId !== null)))) {
      if (stryMutAct_9fa48("162949")) {
        {}
      } else {
        stryCov_9fa48("162949");
        return def;
      }
    }
    return stryMutAct_9fa48("162950") ? {} : (stryCov_9fa48("162950"), {
      ...def,
      handlerFunctionId: inferLegacyFromRuntime(def)
    });
  }
}
export { inferRuntimeFromLegacy, inferLegacyFromRuntime, applyRuntimeDefaults, applyLegacyDefaults };