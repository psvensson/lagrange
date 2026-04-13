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
const WORKFLOW_STEP = Object.freeze(stryMutAct_9fa48("55341") ? {} : (stryCov_9fa48("55341"), {
  PENDING: stryMutAct_9fa48("55342") ? "" : (stryCov_9fa48("55342"), 'PENDING'),
  SENDING: stryMutAct_9fa48("55343") ? "" : (stryCov_9fa48("55343"), 'SENDING'),
  CREATING: stryMutAct_9fa48("55344") ? "" : (stryCov_9fa48("55344"), 'CREATING'),
  SYNCING: stryMutAct_9fa48("55345") ? "" : (stryCov_9fa48("55345"), 'SYNCING'),
  ACTIVE: stryMutAct_9fa48("55346") ? "" : (stryCov_9fa48("55346"), 'ACTIVE'),
  STOPPING: stryMutAct_9fa48("55347") ? "" : (stryCov_9fa48("55347"), 'STOPPING'),
  REMOVED: stryMutAct_9fa48("55348") ? "" : (stryCov_9fa48("55348"), 'REMOVED'),
  FAILED: stryMutAct_9fa48("55349") ? "" : (stryCov_9fa48("55349"), 'FAILED')
}));
export { WORKFLOW_STEP };