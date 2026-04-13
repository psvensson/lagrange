/**
 * Transport type constants for the transport abstraction layer.
 * These define the supported transport protocols for node communication.
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
const TRANSPORT_TYPE = Object.freeze(stryMutAct_9fa48("54989") ? {} : (stryCov_9fa48("54989"), {
  WEBSOCKET: stryMutAct_9fa48("54990") ? "" : (stryCov_9fa48("54990"), 'ws'),
  NATS: stryMutAct_9fa48("54991") ? "" : (stryCov_9fa48("54991"), 'nats'),
  VEILID: stryMutAct_9fa48("54992") ? "" : (stryCov_9fa48("54992"), 'veilid')
}));

/**
 * Endpoint status constants for node_endpoints table.
 * Indicates whether an endpoint is currently usable.
 */
const ENDPOINT_STATUS = Object.freeze(stryMutAct_9fa48("54993") ? {} : (stryCov_9fa48("54993"), {
  ACTIVE: stryMutAct_9fa48("54994") ? "" : (stryCov_9fa48("54994"), 'active'),
  INACTIVE: stryMutAct_9fa48("54995") ? "" : (stryCov_9fa48("54995"), 'inactive')
}));
export { TRANSPORT_TYPE, ENDPOINT_STATUS };