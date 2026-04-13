/**
 * Constants for dual-path closure verification.
 *
 * Supports the phase closure verification from Requirement 10.3:
 * dual progression paths SHALL be time-bounded and removed at
 * phase closure. This module defines the vocabulary for detecting
 * and reporting dual-path violations.
 *
 * Requirements: 10.3
 */
// @ts-nocheck


/**
 * Control-plane concern identifiers.
 * Each concern must have exactly one progression owner path.
 * @enum {string}
 */function stryNS_9fa48() {
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
const CONCERN = Object.freeze(stryMutAct_9fa48("64397") ? {} : (stryCov_9fa48("64397"), {
  DISPATCH: stryMutAct_9fa48("64398") ? "" : (stryCov_9fa48("64398"), 'dispatch'),
  REBALANCE: stryMutAct_9fa48("64399") ? "" : (stryCov_9fa48("64399"), 'rebalance'),
  SPLIT: stryMutAct_9fa48("64400") ? "" : (stryCov_9fa48("64400"), 'split')
}));

/**
 * Dual-path violation types detected during closure verification.
 * @enum {string}
 */
const VIOLATION_TYPE = Object.freeze(stryMutAct_9fa48("64401") ? {} : (stryCov_9fa48("64401"), {
  /** Two or more progression paths exist for the same concern. */
  DUPLICATE_PROGRESSION: stryMutAct_9fa48("64402") ? "" : (stryCov_9fa48("64402"), 'duplicate_progression'),
  /** A temporary migration toggle is still active. */
  ACTIVE_TOGGLE: stryMutAct_9fa48("64403") ? "" : (stryCov_9fa48("64403"), 'active_toggle'),
  /** A legacy branch coexists with the canonical owner path. */
  LEGACY_BRANCH: stryMutAct_9fa48("64404") ? "" : (stryCov_9fa48("64404"), 'legacy_branch')
}));

/**
 * Verification result status values.
 * @enum {string}
 */
const CLOSURE_STATUS = Object.freeze(stryMutAct_9fa48("64405") ? {} : (stryCov_9fa48("64405"), {
  /** All concerns have a single owner path; no violations found. */
  CLEAN: stryMutAct_9fa48("64406") ? "" : (stryCov_9fa48("64406"), 'clean'),
  /** One or more dual-path violations detected. */
  VIOLATIONS_FOUND: stryMutAct_9fa48("64407") ? "" : (stryCov_9fa48("64407"), 'violations_found')
}));

/**
 * Subsystem identifier for dual-path closure diagnostics.
 * @type {string}
 */
const DUAL_PATH_CLOSURE_SUBSYSTEM = stryMutAct_9fa48("64408") ? "" : (stryCov_9fa48("64408"), 'dual-path-closure');
export { CLOSURE_STATUS, CONCERN, DUAL_PATH_CLOSURE_SUBSYSTEM, VIOLATION_TYPE };