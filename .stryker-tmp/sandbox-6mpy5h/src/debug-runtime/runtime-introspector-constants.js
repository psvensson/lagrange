/**
 * Constants for runtime introspection limits and errors.
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
const RUNTIME_INTROSPECTOR_DEFAULT = Object.freeze(stryMutAct_9fa48("77889") ? {} : (stryCov_9fa48("77889"), {
  MAX_MEMORY_READ_BYTES: 4096,
  MAX_VARIABLES_PER_SCOPE: 256,
  REQUEST_TIMEOUT_MS: 250,
  DEFAULT_FRAME_ID: 0
}));
const RUNTIME_INTROSPECTOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("77890") ? {} : (stryCov_9fa48("77890"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("77891") ? "" : (stryCov_9fa48("77891"), 'Runtime introspection request is required'),
  INSTANCE_HANDLE_REQUIRED: stryMutAct_9fa48("77892") ? "" : (stryCov_9fa48("77892"), 'Runtime introspection requires instanceHandle'),
  INDEX_REQUIRED: stryMutAct_9fa48("77893") ? "" : (stryCov_9fa48("77893"), 'Runtime introspection requires index object'),
  RUNTIME_ADAPTER_REQUIRED: stryMutAct_9fa48("77894") ? "" : (stryCov_9fa48("77894"), 'Runtime introspection requires runtimeAdapter.inspect function'),
  FRAME_ID_REQUIRED: stryMutAct_9fa48("77895") ? "" : (stryCov_9fa48("77895"), 'Runtime introspection frameId must be a non-negative integer'),
  OFFSET_REQUIRED: stryMutAct_9fa48("77896") ? "" : (stryCov_9fa48("77896"), 'Runtime introspection offset must be a non-negative integer'),
  LENGTH_REQUIRED: stryMutAct_9fa48("77897") ? "" : (stryCov_9fa48("77897"), 'Runtime introspection length must be a non-negative integer'),
  MEMORY_READ_LIMIT_EXCEEDED: stryMutAct_9fa48("77898") ? "" : (stryCov_9fa48("77898"), 'Runtime introspection memory read exceeds max bytes limit'),
  VARIABLES_LIMIT_EXCEEDED: stryMutAct_9fa48("77899") ? "" : (stryCov_9fa48("77899"), 'Runtime introspection variables request exceeds max scope limit'),
  INSPECT_TIMEOUT: stryMutAct_9fa48("77900") ? "" : (stryCov_9fa48("77900"), 'Runtime introspection inspect request timed out'),
  MEMORY_UNAVAILABLE: stryMutAct_9fa48("77901") ? "" : (stryCov_9fa48("77901"), 'Runtime introspection memory is unavailable on runtime adapter')
}));
export { RUNTIME_INTROSPECTOR_DEFAULT, RUNTIME_INTROSPECTOR_ERROR_MSG };