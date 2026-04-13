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
const RAFT_PROVIDER_CONTRACT_METHOD = Object.freeze(stryMutAct_9fa48("128005") ? {} : (stryCov_9fa48("128005"), {
  CREATE_NODE_CLASS: stryMutAct_9fa48("128006") ? "" : (stryCov_9fa48("128006"), 'createNodeClass'),
  PROPOSE: stryMutAct_9fa48("128007") ? "" : (stryCov_9fa48("128007"), 'propose'),
  JOIN_PEER: stryMutAct_9fa48("128008") ? "" : (stryCov_9fa48("128008"), 'joinPeer'),
  START_ELECTION_TIMER: stryMutAct_9fa48("128009") ? "" : (stryCov_9fa48("128009"), 'startElectionTimer'),
  CLEAR_TIMERS: stryMutAct_9fa48("128010") ? "" : (stryCov_9fa48("128010"), 'clearTimers'),
  SHUTDOWN_NODE: stryMutAct_9fa48("128011") ? "" : (stryCov_9fa48("128011"), 'shutdownNode'),
  GET_CURRENT_TERM: stryMutAct_9fa48("128012") ? "" : (stryCov_9fa48("128012"), 'getCurrentTerm'),
  GET_COMMITTED_INDEX: stryMutAct_9fa48("128013") ? "" : (stryCov_9fa48("128013"), 'getCommittedIndex')
}));
const RAFT_PROVIDER_CONTRACT = Object.freeze(stryMutAct_9fa48("128014") ? {} : (stryCov_9fa48("128014"), {
  METHODS: RAFT_PROVIDER_CONTRACT_METHOD,
  REQUIRED_METHODS: Object.freeze(Object.values(RAFT_PROVIDER_CONTRACT_METHOD))
}));
const RAFT_PROVIDER_CONTRACT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("128015") ? {} : (stryCov_9fa48("128015"), {
  MISSING_PROVIDER: stryMutAct_9fa48("128016") ? "" : (stryCov_9fa48("128016"), 'raftProvider is required'),
  invalidProviderMethod: stryMutAct_9fa48("128017") ? () => undefined : (stryCov_9fa48("128017"), methodName => stryMutAct_9fa48("128018") ? `` : (stryCov_9fa48("128018"), `raftProvider must implement ${methodName}(...)`))
}));
export { RAFT_PROVIDER_CONTRACT, RAFT_PROVIDER_CONTRACT_METHOD, RAFT_PROVIDER_CONTRACT_ERROR_MSG };