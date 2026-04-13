/**
 * Factory for creating SQL engine service definitions with
 * correct defaults. SQL engine profiles reuse the replicated
 * WASM service infrastructure but do not require a
 * user-provided handler function.
 *
 * @module wasm-service/sql-profile-factory
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
import { SERVICE_PROFILE, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { SQL_ENGINE_RUNTIME_KIND } from '../constants/runtime.js';
import { SQL_ENGINE_PROFILE, WASM_SERVICE_DEFAULT } from './wasm-service-constants.js';
import { SQL_PROFILE_DEFAULT, SQL_PROFILE_ERROR_MSG } from './sql-profile-constants.js';

/**
 * Create a service definition configured for the SQL engine
 * profile. Applies SQL-specific defaults for consistency
 * modes and sets the handler function ID to null.
 *
 * @param {Object} options - Definition options.
 * @param {string} options.serviceId - Unique service ID.
 * @param {string} options.serviceName - Human-readable name.
 * @param {number} [options.replicaCount] - Odd number >= 3.
 * @param {string} [options.readConsistency] - Read mode.
 * @param {string} [options.writeConsistency] - Write mode.
 * @param {Object} [options.resourceBudget] - Budget limits.
 * @param {number} [options.safetyIntervalMs] - Safety ms.
 * @return {Object} A service definition object with
 *   SQL_ENGINE profile defaults applied.
 * @throws {Error} If serviceId or serviceName is missing.
 */
function createSqlEngineDefinition(options) {
  if (stryMutAct_9fa48("163228")) {
    {}
  } else {
    stryCov_9fa48("163228");
    if (stryMutAct_9fa48("163231") ? false : stryMutAct_9fa48("163230") ? true : stryMutAct_9fa48("163229") ? options.serviceId : (stryCov_9fa48("163229", "163230", "163231"), !options.serviceId)) {
      if (stryMutAct_9fa48("163232")) {
        {}
      } else {
        stryCov_9fa48("163232");
        throw new Error(SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_ID);
      }
    }
    if (stryMutAct_9fa48("163235") ? false : stryMutAct_9fa48("163234") ? true : stryMutAct_9fa48("163233") ? options.serviceName : (stryCov_9fa48("163233", "163234", "163235"), !options.serviceName)) {
      if (stryMutAct_9fa48("163236")) {
        {}
      } else {
        stryCov_9fa48("163236");
        throw new Error(SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_NAME);
      }
    }
    return stryMutAct_9fa48("163237") ? {} : (stryCov_9fa48("163237"), {
      serviceId: options.serviceId,
      serviceName: options.serviceName,
      serviceProfile: SERVICE_PROFILE.SQL_ENGINE,
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      handlerFunctionId: SQL_PROFILE_DEFAULT.HANDLER_FUNCTION_ID,
      runtimeKind: SQL_ENGINE_RUNTIME_KIND,
      runtimeRef: null,
      runtimeConfig: null,
      readConsistency: stryMutAct_9fa48("163238") ? options.readConsistency && SQL_ENGINE_PROFILE.DEFAULT_READ_CONSISTENCY : (stryCov_9fa48("163238"), options.readConsistency ?? SQL_ENGINE_PROFILE.DEFAULT_READ_CONSISTENCY),
      writeConsistency: stryMutAct_9fa48("163239") ? options.writeConsistency && SQL_ENGINE_PROFILE.DEFAULT_WRITE_CONSISTENCY : (stryCov_9fa48("163239"), options.writeConsistency ?? SQL_ENGINE_PROFILE.DEFAULT_WRITE_CONSISTENCY),
      replicaCount: stryMutAct_9fa48("163240") ? options.replicaCount && WASM_SERVICE_DEFAULT.REPLICA_COUNT : (stryCov_9fa48("163240"), options.replicaCount ?? WASM_SERVICE_DEFAULT.REPLICA_COUNT),
      resourceBudget: stryMutAct_9fa48("163241") ? options.resourceBudget && {} : (stryCov_9fa48("163241"), options.resourceBudget ?? {}),
      safetyIntervalMs: stryMutAct_9fa48("163242") ? options.safetyIntervalMs && WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS : (stryCov_9fa48("163242"), options.safetyIntervalMs ?? WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS)
    });
  }
}

/**
 * Check whether a service definition uses the SQL engine
 * profile.
 *
 * @param {Object} definition - Service definition object.
 * @return {boolean} True if the definition has the
 *   SQL_ENGINE service profile.
 */
function isSqlEngineProfile(definition) {
  if (stryMutAct_9fa48("163243")) {
    {}
  } else {
    stryCov_9fa48("163243");
    return stryMutAct_9fa48("163246") ? definition.serviceProfile !== SERVICE_PROFILE.SQL_ENGINE : stryMutAct_9fa48("163245") ? false : stryMutAct_9fa48("163244") ? true : (stryCov_9fa48("163244", "163245", "163246"), definition.serviceProfile === SERVICE_PROFILE.SQL_ENGINE);
  }
}
export { createSqlEngineDefinition, isSqlEngineProfile };