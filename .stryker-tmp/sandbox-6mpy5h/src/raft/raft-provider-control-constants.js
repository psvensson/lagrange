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
const RAFT_PROVIDER_CONTROL = Object.freeze(stryMutAct_9fa48("128029") ? {} : (stryCov_9fa48("128029"), {
  ENV_KEY: stryMutAct_9fa48("128030") ? "" : (stryCov_9fa48("128030"), 'RAFT_PROVIDER'),
  LIFERAFT: stryMutAct_9fa48("128031") ? "" : (stryCov_9fa48("128031"), 'liferaft'),
  RAFT_LOGIC: stryMutAct_9fa48("128032") ? "" : (stryCov_9fa48("128032"), 'raft_logic'),
  RAFT_LOGIC_SPIKE: stryMutAct_9fa48("128033") ? "" : (stryCov_9fa48("128033"), 'raft_logic_spike')
}));
const RAFT_PROVIDER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("128034") ? {} : (stryCov_9fa48("128034"), {
  INVALID_PROVIDER: stryMutAct_9fa48("128035") ? "" : (stryCov_9fa48("128035"), 'Unsupported raft provider value; expected liferaft, raft_logic, or raft_logic_spike'),
  processProviderLocked: stryMutAct_9fa48("128036") ? () => undefined : (stryCov_9fa48("128036"), (selected, requested) => (stryMutAct_9fa48("128037") ? `` : (stryCov_9fa48("128037"), `Raft provider already selected for process: ${selected}; `)) + (stryMutAct_9fa48("128038") ? `` : (stryCov_9fa48("128038"), `cannot switch to ${requested} without restart`))),
  runtimeProviderNotImplemented: stryMutAct_9fa48("128039") ? () => undefined : (stryCov_9fa48("128039"), provider => (stryMutAct_9fa48("128040") ? `` : (stryCov_9fa48("128040"), `Configured raft provider ${provider} is not available in this runtime path; `)) + (stryMutAct_9fa48("128041") ? "" : (stryCov_9fa48("128041"), 'use liferaft')))
}));
const RAFT_PROVIDER_LOG_MSG = Object.freeze(stryMutAct_9fa48("128042") ? {} : (stryCov_9fa48("128042"), {
  SELECTED: stryMutAct_9fa48("128043") ? "" : (stryCov_9fa48("128043"), 'Selected raft provider for process startup')
}));
export { RAFT_PROVIDER_CONTROL, RAFT_PROVIDER_ERROR_MSG, RAFT_PROVIDER_LOG_MSG };