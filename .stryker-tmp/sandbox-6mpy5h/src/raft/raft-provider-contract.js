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
import { RAFT_PROVIDER_CONTRACT, RAFT_PROVIDER_CONTRACT_ERROR_MSG } from './raft-provider-contract-constants.js';
import { TYPEOF } from '../constants/index.js';

/**
 * Validate raft provider contract implementation.
 * @param {*} raftProvider
 */
function assertRaftProviderContract(raftProvider) {
  if (stryMutAct_9fa48("128019")) {
    {}
  } else {
    stryCov_9fa48("128019");
    if (stryMutAct_9fa48("128022") ? false : stryMutAct_9fa48("128021") ? true : stryMutAct_9fa48("128020") ? raftProvider : (stryCov_9fa48("128020", "128021", "128022"), !raftProvider)) {
      if (stryMutAct_9fa48("128023")) {
        {}
      } else {
        stryCov_9fa48("128023");
        throw new Error(RAFT_PROVIDER_CONTRACT_ERROR_MSG.MISSING_PROVIDER);
      }
    }
    for (const methodName of RAFT_PROVIDER_CONTRACT.REQUIRED_METHODS) {
      if (stryMutAct_9fa48("128024")) {
        {}
      } else {
        stryCov_9fa48("128024");
        if (stryMutAct_9fa48("128027") ? typeof raftProvider[methodName] === TYPEOF.FUNCTION : stryMutAct_9fa48("128026") ? false : stryMutAct_9fa48("128025") ? true : (stryCov_9fa48("128025", "128026", "128027"), typeof raftProvider[methodName] !== TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("128028")) {
            {}
          } else {
            stryCov_9fa48("128028");
            throw new Error(RAFT_PROVIDER_CONTRACT_ERROR_MSG.invalidProviderMethod(methodName));
          }
        }
      }
    }
  }
}
export { assertRaftProviderContract };