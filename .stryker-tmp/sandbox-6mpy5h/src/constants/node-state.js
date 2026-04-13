/**
 * Unified NODE_STATE enum - single source of truth for node lifecycle
 * and persisted node status.
 *
 * Replaces both STATE (node-specific values) from src/constants/states.js
 * and NODE_STATUS from src/node/node-constants.js.
 *
 * Requirements: 2.1, 2.2, 2.4
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
const NODE_STATE = Object.freeze(stryMutAct_9fa48("54694") ? {} : (stryCov_9fa48("54694"), {
  INITIALIZING: stryMutAct_9fa48("54695") ? "" : (stryCov_9fa48("54695"), 'initializing'),
  STARTING: stryMutAct_9fa48("54696") ? "" : (stryCov_9fa48("54696"), 'starting'),
  CONNECTING: stryMutAct_9fa48("54697") ? "" : (stryCov_9fa48("54697"), 'connecting'),
  DISCOVERING: stryMutAct_9fa48("54698") ? "" : (stryCov_9fa48("54698"), 'discovering'),
  JOINING: stryMutAct_9fa48("54699") ? "" : (stryCov_9fa48("54699"), 'joining'),
  SYNCING: stryMutAct_9fa48("54700") ? "" : (stryCov_9fa48("54700"), 'syncing'),
  READY: stryMutAct_9fa48("54701") ? "" : (stryCov_9fa48("54701"), 'ready'),
  ACTIVE: stryMutAct_9fa48("54702") ? "" : (stryCov_9fa48("54702"), 'active'),
  SUSPECTED: stryMutAct_9fa48("54703") ? "" : (stryCov_9fa48("54703"), 'suspected'),
  FAILED: stryMutAct_9fa48("54704") ? "" : (stryCov_9fa48("54704"), 'failed'),
  RECOVERING: stryMutAct_9fa48("54705") ? "" : (stryCov_9fa48("54705"), 'recovering'),
  DRAINING: stryMutAct_9fa48("54706") ? "" : (stryCov_9fa48("54706"), 'draining'),
  SHUTTING_DOWN: stryMutAct_9fa48("54707") ? "" : (stryCov_9fa48("54707"), 'shutting_down'),
  STOPPED: stryMutAct_9fa48("54708") ? "" : (stryCov_9fa48("54708"), 'stopped')
}));
export { NODE_STATE };