/**
 * Constants for EndpointService.
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
const ENDPOINT_SUBSYSTEM = stryMutAct_9fa48("64593") ? "" : (stryCov_9fa48("64593"), 'endpoint-service');
const ENDPOINT_SVC_STATE = Object.freeze(stryMutAct_9fa48("64594") ? {} : (stryCov_9fa48("64594"), {
  CREATED: stryMutAct_9fa48("64595") ? "" : (stryCov_9fa48("64595"), 'created'),
  INITIALIZED: stryMutAct_9fa48("64596") ? "" : (stryCov_9fa48("64596"), 'initialized'),
  STOPPED: stryMutAct_9fa48("64597") ? "" : (stryCov_9fa48("64597"), 'stopped')
}));
const ENDPOINT_SVC_LOG_MSG = Object.freeze(stryMutAct_9fa48("64598") ? {} : (stryCov_9fa48("64598"), {
  INITIALIZED: stryMutAct_9fa48("64599") ? "" : (stryCov_9fa48("64599"), 'EndpointService initialized'),
  REGISTERED: stryMutAct_9fa48("64600") ? "" : (stryCov_9fa48("64600"), 'Endpoint registered'),
  REMOVED: stryMutAct_9fa48("64601") ? "" : (stryCov_9fa48("64601"), 'Endpoint removed'),
  STOPPED: stryMutAct_9fa48("64602") ? "" : (stryCov_9fa48("64602"), 'EndpointService stopped')
}));
const ENDPOINT_SVC_ERROR_MSG = Object.freeze(stryMutAct_9fa48("64603") ? {} : (stryCov_9fa48("64603"), {
  MISSING_NODE_ID: stryMutAct_9fa48("64604") ? "" : (stryCov_9fa48("64604"), 'EndpointService requires nodeId'),
  MISSING_OWNER: stryMutAct_9fa48("64605") ? "" : (stryCov_9fa48("64605"), 'EndpointService requires serviceEndpointsOwner'),
  NOT_INITIALIZED: stryMutAct_9fa48("64606") ? "" : (stryCov_9fa48("64606"), 'EndpointService must be initialized first'),
  MISSING_ENDPOINT_ID: stryMutAct_9fa48("64607") ? "" : (stryCov_9fa48("64607"), 'Endpoint ID is required')
}));
const ENDPOINT_SVC_EVENT = Object.freeze(stryMutAct_9fa48("64608") ? {} : (stryCov_9fa48("64608"), {
  REGISTERED: stryMutAct_9fa48("64609") ? "" : (stryCov_9fa48("64609"), 'endpointRegistered'),
  REMOVED: stryMutAct_9fa48("64610") ? "" : (stryCov_9fa48("64610"), 'endpointRemoved')
}));
export { ENDPOINT_SUBSYSTEM, ENDPOINT_SVC_STATE, ENDPOINT_SVC_LOG_MSG, ENDPOINT_SVC_ERROR_MSG, ENDPOINT_SVC_EVENT };