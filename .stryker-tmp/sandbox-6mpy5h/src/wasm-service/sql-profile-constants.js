/**
 * Constants specific to SQL engine service profile factory
 * and validation flows.
 *
 * @module wasm-service/sql-profile-constants
 */
// @ts-nocheck


/**
 * Field names used in SQL profile factory operations.
 * @enum {string}
 */function stryNS_9fa48() {
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
const SQL_PROFILE_FIELD = Object.freeze(stryMutAct_9fa48("163211") ? {} : (stryCov_9fa48("163211"), {
  SERVICE_ID: stryMutAct_9fa48("163212") ? "" : (stryCov_9fa48("163212"), 'serviceId'),
  SERVICE_NAME: stryMutAct_9fa48("163213") ? "" : (stryCov_9fa48("163213"), 'serviceName'),
  SERVICE_PROFILE: stryMutAct_9fa48("163214") ? "" : (stryCov_9fa48("163214"), 'serviceProfile'),
  HANDLER_FUNCTION_ID: stryMutAct_9fa48("163215") ? "" : (stryCov_9fa48("163215"), 'handlerFunctionId'),
  READ_CONSISTENCY: stryMutAct_9fa48("163216") ? "" : (stryCov_9fa48("163216"), 'readConsistency'),
  WRITE_CONSISTENCY: stryMutAct_9fa48("163217") ? "" : (stryCov_9fa48("163217"), 'writeConsistency'),
  REPLICA_COUNT: stryMutAct_9fa48("163218") ? "" : (stryCov_9fa48("163218"), 'replicaCount'),
  SERVICE_PROFILE_META: stryMutAct_9fa48("163219") ? "" : (stryCov_9fa48("163219"), 'service_profile')
}));

/**
 * Error messages for SQL profile operations.
 * @enum {string}
 */
const SQL_PROFILE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("163220") ? {} : (stryCov_9fa48("163220"), {
  MISSING_SERVICE_ID: stryMutAct_9fa48("163221") ? "" : (stryCov_9fa48("163221"), 'SQL engine definition requires a serviceId'),
  MISSING_SERVICE_NAME: stryMutAct_9fa48("163222") ? "" : (stryCov_9fa48("163222"), 'SQL engine definition requires a serviceName'),
  INVALID_REPLICA_COUNT: stryMutAct_9fa48("163223") ? "" : (stryCov_9fa48("163223"), 'SQL engine replica count must be an odd number >= 3')
}));

/**
 * Log messages for SQL profile operations.
 * @enum {string}
 */
const SQL_PROFILE_LOG_MSG = Object.freeze(stryMutAct_9fa48("163224") ? {} : (stryCov_9fa48("163224"), {
  DEFINITION_CREATED: stryMutAct_9fa48("163225") ? "" : (stryCov_9fa48("163225"), 'SQL engine service definition created'),
  ENDPOINT_BUILT: stryMutAct_9fa48("163226") ? "" : (stryCov_9fa48("163226"), 'SQL engine endpoint record built')
}));

/**
 * Default values for SQL engine service definitions.
 * The handler function ID is null because SQL engine
 * profiles do not require a user-provided handler.
 * @enum {*}
 */
const SQL_PROFILE_DEFAULT = Object.freeze(stryMutAct_9fa48("163227") ? {} : (stryCov_9fa48("163227"), {
  HANDLER_FUNCTION_ID: null
}));
export { SQL_PROFILE_FIELD, SQL_PROFILE_ERROR_MSG, SQL_PROFILE_LOG_MSG, SQL_PROFILE_DEFAULT };