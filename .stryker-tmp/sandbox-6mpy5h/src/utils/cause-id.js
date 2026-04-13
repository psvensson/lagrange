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
import { v4 as uuidv4 } from 'uuid';
import { NUM, TYPEOF } from '../constants/index.js';
function normalizeCauseId(value) {
  if (stryMutAct_9fa48("160179")) {
    {}
  } else {
    stryCov_9fa48("160179");
    if (stryMutAct_9fa48("160182") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("160181") ? false : stryMutAct_9fa48("160180") ? true : (stryCov_9fa48("160180", "160181", "160182"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("160183")) {
        {}
      } else {
        stryCov_9fa48("160183");
        return null;
      }
    }
    const trimmed = stryMutAct_9fa48("160184") ? value : (stryCov_9fa48("160184"), value.trim());
    if (stryMutAct_9fa48("160187") ? trimmed.length !== NUM.ZERO : stryMutAct_9fa48("160186") ? false : stryMutAct_9fa48("160185") ? true : (stryCov_9fa48("160185", "160186", "160187"), trimmed.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("160188")) {
        {}
      } else {
        stryCov_9fa48("160188");
        return null;
      }
    }
    return trimmed;
  }
}
function getOrCreateCauseId(causeId) {
  if (stryMutAct_9fa48("160189")) {
    {}
  } else {
    stryCov_9fa48("160189");
    return stryMutAct_9fa48("160192") ? normalizeCauseId(causeId) && uuidv4() : stryMutAct_9fa48("160191") ? false : stryMutAct_9fa48("160190") ? true : (stryCov_9fa48("160190", "160191", "160192"), normalizeCauseId(causeId) || uuidv4());
  }
}
export { getOrCreateCauseId, normalizeCauseId };