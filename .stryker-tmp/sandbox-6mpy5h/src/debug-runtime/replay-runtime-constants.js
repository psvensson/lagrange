/**
 * Constants for snapshot replay runtime and determinism checks.
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
const REPLAY_RUNTIME_DEFAULT = Object.freeze(stryMutAct_9fa48("77664") ? {} : (stryCov_9fa48("77664"), {
  INSTANCE_ID_PREFIX: stryMutAct_9fa48("77665") ? "" : (stryCov_9fa48("77665"), 'replay-'),
  INITIAL_FRAME_CURSOR: 0,
  INITIAL_HOST_CALL_CURSOR: 0
}));
const REPLAY_DRIFT_REASON = Object.freeze(stryMutAct_9fa48("77666") ? {} : (stryCov_9fa48("77666"), {
  LEDGER_EXHAUSTED: stryMutAct_9fa48("77667") ? "" : (stryCov_9fa48("77667"), 'ledger_exhausted'),
  HOST_CALL_MISMATCH: stryMutAct_9fa48("77668") ? "" : (stryCov_9fa48("77668"), 'host_call_mismatch'),
  HOST_CALL_ARGS_MISMATCH: stryMutAct_9fa48("77669") ? "" : (stryCov_9fa48("77669"), 'host_call_args_mismatch'),
  UNCONSUMED_LEDGER_ENTRIES: stryMutAct_9fa48("77670") ? "" : (stryCov_9fa48("77670"), 'unconsumed_ledger_entries')
}));
const REPLAY_RUNTIME_ERROR_MSG = Object.freeze(stryMutAct_9fa48("77671") ? {} : (stryCov_9fa48("77671"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("77672") ? "" : (stryCov_9fa48("77672"), 'Replay request is required'),
  SNAPSHOT_REQUIRED: stryMutAct_9fa48("77673") ? "" : (stryCov_9fa48("77673"), 'Replay runtime requires snapshot object'),
  MANIFEST_REQUIRED: stryMutAct_9fa48("77674") ? "" : (stryCov_9fa48("77674"), 'Replay runtime requires manifest object'),
  INSTANCE_HANDLE_REQUIRED: stryMutAct_9fa48("77675") ? "" : (stryCov_9fa48("77675"), 'Replay runtime requires instanceHandle'),
  INSTANCE_NOT_READY: stryMutAct_9fa48("77676") ? "" : (stryCov_9fa48("77676"), 'Replay runtime instance is not loaded'),
  HOST_CALL_REQUIRED: stryMutAct_9fa48("77677") ? "" : (stryCov_9fa48("77677"), 'Replay runtime host-call request requires namespace and functionName')
}));
export { REPLAY_RUNTIME_DEFAULT, REPLAY_DRIFT_REASON, REPLAY_RUNTIME_ERROR_MSG };