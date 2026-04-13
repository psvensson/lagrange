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
const TRANSACTION_SUBSYSTEM = stryMutAct_9fa48("155030") ? "" : (stryCov_9fa48("155030"), 'transaction-manager');
const TRANSACTION_STATE = Object.freeze(stryMutAct_9fa48("155031") ? {} : (stryCov_9fa48("155031"), {
  ACTIVE: stryMutAct_9fa48("155032") ? "" : (stryCov_9fa48("155032"), 'active'),
  COMMITTED: stryMutAct_9fa48("155033") ? "" : (stryCov_9fa48("155033"), 'committed'),
  ROLLED_BACK: stryMutAct_9fa48("155034") ? "" : (stryCov_9fa48("155034"), 'rolled_back'),
  ABORTED: stryMutAct_9fa48("155035") ? "" : (stryCov_9fa48("155035"), 'aborted')
}));
const TRANSACTION_ISOLATION_LEVEL = Object.freeze(stryMutAct_9fa48("155036") ? {} : (stryCov_9fa48("155036"), {
  READ_COMMITTED: stryMutAct_9fa48("155037") ? "" : (stryCov_9fa48("155037"), 'READ_COMMITTED')
}));
const TRANSACTION_EVENT = Object.freeze(stryMutAct_9fa48("155038") ? {} : (stryCov_9fa48("155038"), {
  STARTED: stryMutAct_9fa48("155039") ? "" : (stryCov_9fa48("155039"), 'transactionStarted'),
  COMMITTED: stryMutAct_9fa48("155040") ? "" : (stryCov_9fa48("155040"), 'transactionCommitted'),
  ROLLED_BACK: stryMutAct_9fa48("155041") ? "" : (stryCov_9fa48("155041"), 'transactionRolledBack'),
  ABORTED: stryMutAct_9fa48("155042") ? "" : (stryCov_9fa48("155042"), 'transactionAborted')
}));
const TRANSACTION_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("155043") ? {} : (stryCov_9fa48("155043"), {
  TIMEOUT_MS: stryMutAct_9fa48("155044") ? "" : (stryCov_9fa48("155044"), 'transaction.timeoutMs'),
  MAX_CONCURRENT: stryMutAct_9fa48("155045") ? "" : (stryCov_9fa48("155045"), 'transaction.maxConcurrent')
}));
const TRANSACTION_DEFAULT = Object.freeze(stryMutAct_9fa48("155046") ? {} : (stryCov_9fa48("155046"), {
  TIMEOUT_MS: 30000,
  MAX_CONCURRENT: 100,
  CLEANUP_INTERVAL_MS: 5000
}));
const TRANSACTION_LOG_MSG = Object.freeze(stryMutAct_9fa48("155047") ? {} : (stryCov_9fa48("155047"), {
  STARTED: stryMutAct_9fa48("155048") ? "" : (stryCov_9fa48("155048"), 'Transaction started'),
  COMMITTED: stryMutAct_9fa48("155049") ? "" : (stryCov_9fa48("155049"), 'Transaction committed'),
  ROLLED_BACK: stryMutAct_9fa48("155050") ? "" : (stryCov_9fa48("155050"), 'Transaction rolled back'),
  ABORTED: stryMutAct_9fa48("155051") ? "" : (stryCov_9fa48("155051"), 'Transaction aborted')
}));
const TRANSACTION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("155052") ? {} : (stryCov_9fa48("155052"), {
  MAX_CONCURRENT_EXCEEDED: stryMutAct_9fa48("155053") ? "" : (stryCov_9fa48("155053"), 'Maximum concurrent transactions exceeded'),
  NOT_FOUND: stryMutAct_9fa48("155054") ? "" : (stryCov_9fa48("155054"), 'Transaction not found'),
  notFoundWithId: stryMutAct_9fa48("155055") ? () => undefined : (stryCov_9fa48("155055"), transactionId => stryMutAct_9fa48("155056") ? `` : (stryCov_9fa48("155056"), `Transaction not found: ${transactionId}`)),
  notActive: stryMutAct_9fa48("155057") ? () => undefined : (stryCov_9fa48("155057"), state => stryMutAct_9fa48("155058") ? `` : (stryCov_9fa48("155058"), `Transaction is not active: ${state}`)),
  recordOperationInactive: stryMutAct_9fa48("155059") ? () => undefined : (stryCov_9fa48("155059"), state => stryMutAct_9fa48("155060") ? `` : (stryCov_9fa48("155060"), `Cannot record operation: transaction is ${state}`))
}));
const TRANSACTION_REASON = Object.freeze(stryMutAct_9fa48("155061") ? {} : (stryCov_9fa48("155061"), {
  UNKNOWN: stryMutAct_9fa48("155062") ? "" : (stryCov_9fa48("155062"), 'unknown'),
  TIMEOUT: stryMutAct_9fa48("155063") ? "" : (stryCov_9fa48("155063"), 'timeout'),
  SHUTDOWN: stryMutAct_9fa48("155064") ? "" : (stryCov_9fa48("155064"), 'shutdown')
}));
export { TRANSACTION_CONFIG_KEY, TRANSACTION_DEFAULT, TRANSACTION_ERROR_MSG, TRANSACTION_EVENT, TRANSACTION_ISOLATION_LEVEL, TRANSACTION_LOG_MSG, TRANSACTION_REASON, TRANSACTION_STATE, TRANSACTION_SUBSYSTEM };