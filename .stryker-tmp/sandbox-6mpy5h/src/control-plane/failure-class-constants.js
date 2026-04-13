/**
 * Constants for the failure-class registry.
 *
 * The failure-class registry maps harness-discovered failure classes
 * to deterministic test IDs, enforcing the closure policy from
 * Requirement 8: a failure class cannot be closed until a
 * deterministic reproduction exists below full harness scale.
 */
// @ts-nocheck


/**
 * Failure class categories discovered by distributed harness runs.
 * Each category represents a distinct class of control-plane failure.
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
const FAILURE_CLASS = Object.freeze(stryMutAct_9fa48("64666") ? {} : (stryCov_9fa48("64666"), {
  DUAL_LEADER: stryMutAct_9fa48("64667") ? "" : (stryCov_9fa48("64667"), 'dual_leader'),
  BACKWARD_STEP: stryMutAct_9fa48("64668") ? "" : (stryCov_9fa48("64668"), 'backward_step'),
  STALE_CLAIM: stryMutAct_9fa48("64669") ? "" : (stryCov_9fa48("64669"), 'stale_claim'),
  ORPHAN_OPERATION: stryMutAct_9fa48("64670") ? "" : (stryCov_9fa48("64670"), 'orphan_operation'),
  TIMEOUT_BOUNDARY: stryMutAct_9fa48("64671") ? "" : (stryCov_9fa48("64671"), 'timeout_boundary'),
  CDC_DIVERGENCE: stryMutAct_9fa48("64672") ? "" : (stryCov_9fa48("64672"), 'cdc_divergence')
}));

/**
 * Status values for failure class lifecycle.
 * - open: failure discovered, no deterministic reproduction yet
 * - reproduced: deterministic test exists but fix not yet verified
 * - closed: deterministic repro + owner-path regression + invariant
 * @enum {string}
 */
const FAILURE_CLASS_STATUS = Object.freeze(stryMutAct_9fa48("64673") ? {} : (stryCov_9fa48("64673"), {
  OPEN: stryMutAct_9fa48("64674") ? "" : (stryCov_9fa48("64674"), 'open'),
  REPRODUCED: stryMutAct_9fa48("64675") ? "" : (stryCov_9fa48("64675"), 'reproduced'),
  CLOSED: stryMutAct_9fa48("64676") ? "" : (stryCov_9fa48("64676"), 'closed')
}));

/**
 * Field names used in failure class entries.
 * @enum {string}
 */
const FAILURE_CLASS_FIELD = Object.freeze(stryMutAct_9fa48("64677") ? {} : (stryCov_9fa48("64677"), {
  FAILURE_CLASS_ID: stryMutAct_9fa48("64678") ? "" : (stryCov_9fa48("64678"), 'failureClassId'),
  INVARIANT_ID: stryMutAct_9fa48("64679") ? "" : (stryCov_9fa48("64679"), 'invariantId'),
  DETERMINISTIC_TEST_ID: stryMutAct_9fa48("64680") ? "" : (stryCov_9fa48("64680"), 'deterministicTestId'),
  STATUS: stryMutAct_9fa48("64681") ? "" : (stryCov_9fa48("64681"), 'status'),
  DESCRIPTION: stryMutAct_9fa48("64682") ? "" : (stryCov_9fa48("64682"), 'description')
}));

/**
 * Subsystem identifier for the failure-class registry.
 * @type {string}
 */
const FAILURE_CLASS_SUBSYSTEM = stryMutAct_9fa48("64683") ? "" : (stryCov_9fa48("64683"), 'failure-class-registry');

/**
 * Reasons returned by closure-evidence validation.
 * - VALID: deterministic reproduction exists, class is eligible
 * - MISSING_DETERMINISTIC_REPRO: no deterministic test ID attached
 * - HARNESS_ONLY_EVIDENCE: only harness-level evidence, no
 *   deterministic repro below full harness scale
 * - UNKNOWN_FAILURE_CLASS: failure class ID not found in registry
 * @enum {string}
 */
const CLOSURE_VALIDATION_REASON = Object.freeze(stryMutAct_9fa48("64684") ? {} : (stryCov_9fa48("64684"), {
  VALID: stryMutAct_9fa48("64685") ? "" : (stryCov_9fa48("64685"), 'valid'),
  MISSING_DETERMINISTIC_REPRO: stryMutAct_9fa48("64686") ? "" : (stryCov_9fa48("64686"), 'missing_deterministic_repro'),
  HARNESS_ONLY_EVIDENCE: stryMutAct_9fa48("64687") ? "" : (stryCov_9fa48("64687"), 'harness_only_evidence'),
  UNKNOWN_FAILURE_CLASS: stryMutAct_9fa48("64688") ? "" : (stryCov_9fa48("64688"), 'unknown_failure_class')
}));
export { CLOSURE_VALIDATION_REASON, FAILURE_CLASS, FAILURE_CLASS_FIELD, FAILURE_CLASS_STATUS, FAILURE_CLASS_SUBSYSTEM };