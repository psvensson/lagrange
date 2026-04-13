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
import { ADJUST_DIRECTION } from './replica-status.js';
const ODD_MODULUS = 2;
const ODD_REMAINDER = 1;
const ODD_STEP = 2;
const ODD_ADJUST = 1;

/**
 * Validate that a replica count is odd (required for Raft quorum).
 * @param {number} count
 * @return {boolean}
 */
function isOddReplicaCount(count) {
  if (stryMutAct_9fa48("131525")) {
    {}
  } else {
    stryCov_9fa48("131525");
    return stryMutAct_9fa48("131528") ? count % ODD_MODULUS !== ODD_REMAINDER : stryMutAct_9fa48("131527") ? false : stryMutAct_9fa48("131526") ? true : (stryCov_9fa48("131526", "131527", "131528"), (stryMutAct_9fa48("131529") ? count * ODD_MODULUS : (stryCov_9fa48("131529"), count % ODD_MODULUS)) === ODD_REMAINDER);
  }
}

/**
 * Adjust replica count to nearest odd number.
 * @param {number} count
 * @param {string} direction
 * @return {number}
 */
function adjustToOddCount(count, direction = ADJUST_DIRECTION.UP) {
  if (stryMutAct_9fa48("131530")) {
    {}
  } else {
    stryCov_9fa48("131530");
    if (stryMutAct_9fa48("131532") ? false : stryMutAct_9fa48("131531") ? true : (stryCov_9fa48("131531", "131532"), isOddReplicaCount(count))) {
      if (stryMutAct_9fa48("131533")) {
        {}
      } else {
        stryCov_9fa48("131533");
        return count;
      }
    }
    return (stryMutAct_9fa48("131536") ? direction !== ADJUST_DIRECTION.UP : stryMutAct_9fa48("131535") ? false : stryMutAct_9fa48("131534") ? true : (stryCov_9fa48("131534", "131535", "131536"), direction === ADJUST_DIRECTION.UP)) ? stryMutAct_9fa48("131537") ? count - ODD_ADJUST : (stryCov_9fa48("131537"), count + ODD_ADJUST) : stryMutAct_9fa48("131538") ? count + ODD_ADJUST : (stryCov_9fa48("131538"), count - ODD_ADJUST);
  }
}

/**
 * Get the next higher odd replica count.
 * @param {number} current
 * @param {number} max
 * @return {number}
 */
function getNextOddCount(current, max) {
  if (stryMutAct_9fa48("131539")) {
    {}
  } else {
    stryCov_9fa48("131539");
    const next = stryMutAct_9fa48("131540") ? current - ODD_STEP : (stryCov_9fa48("131540"), current + ODD_STEP);
    return (stryMutAct_9fa48("131544") ? next > max : stryMutAct_9fa48("131543") ? next < max : stryMutAct_9fa48("131542") ? false : stryMutAct_9fa48("131541") ? true : (stryCov_9fa48("131541", "131542", "131543", "131544"), next <= max)) ? next : current;
  }
}

/**
 * Get the next lower odd replica count.
 * @param {number} current
 * @param {number} min
 * @return {number}
 */
function getPreviousOddCount(current, min) {
  if (stryMutAct_9fa48("131545")) {
    {}
  } else {
    stryCov_9fa48("131545");
    const previous = stryMutAct_9fa48("131546") ? current + ODD_STEP : (stryCov_9fa48("131546"), current - ODD_STEP);
    return (stryMutAct_9fa48("131550") ? previous < min : stryMutAct_9fa48("131549") ? previous > min : stryMutAct_9fa48("131548") ? false : stryMutAct_9fa48("131547") ? true : (stryCov_9fa48("131547", "131548", "131549", "131550"), previous >= min)) ? previous : current;
  }
}
export { isOddReplicaCount, adjustToOddCount, getNextOddCount, getPreviousOddCount };