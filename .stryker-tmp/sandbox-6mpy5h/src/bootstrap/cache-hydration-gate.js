/**
 * CacheHydrationGate - Phase gate that validates cache hydration completeness.
 * Ensures all partition and message group leaders have complete metadata
 * before allowing progression to the next bootstrap phase.
 *
 * @module bootstrap/cache-hydration-gate
 * @see Requirements 4.1, 4.2, 4.3, 4.4
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
import { PhaseGate } from './phase-gate.js';
import { createSystemLeaderReadinessSnapshot } from './system-readiness-snapshot.js';

/**
 * CacheHydrationGate - Validates cache hydration completeness.
 * Checks that all partitions and message groups have leader services
 * with complete metadata (including addresses) before allowing joins.
 */
class CacheHydrationGate extends PhaseGate {
  /**
   * Validate cache hydration completeness.
   * @param {Object} context - Bootstrap context.
   * @param {Object} context.systemTableCache - System table cache to validate.
   * @return {import('./phase-gate.js').PhaseGateResult} Validation result.
   */
  validate(context) {
    if (stryMutAct_9fa48("13507")) {
      {}
    } else {
      stryCov_9fa48("13507");
      const {
        systemTableCache
      } = context;
      const readiness = createSystemLeaderReadinessSnapshot(stryMutAct_9fa48("13508") ? {} : (stryCov_9fa48("13508"), {
        systemTableCache,
        allowLeaderServiceFallback: stryMutAct_9fa48("13509") ? false : (stryCov_9fa48("13509"), true)
      }));
      const missingLeaders = readiness.missingLeaders;
      const success = readiness.ready;
      return stryMutAct_9fa48("13510") ? {} : (stryCov_9fa48("13510"), {
        success,
        errors: success ? stryMutAct_9fa48("13511") ? ["Stryker was here"] : (stryCov_9fa48("13511"), []) : stryMutAct_9fa48("13512") ? [] : (stryCov_9fa48("13512"), [stryMutAct_9fa48("13513") ? "" : (stryCov_9fa48("13513"), 'Cache hydration incomplete')]),
        diagnostics: stryMutAct_9fa48("13514") ? {} : (stryCov_9fa48("13514"), {
          missingPartitionLeaders: missingLeaders.missingPartitionLeaders,
          missingMessageGroupLeaders: missingLeaders.missingMessageGroupLeaders,
          missingPartitionLeaderAddresses: missingLeaders.missingPartitionLeaderAddresses,
          missingMessageGroupLeaderAddresses: missingLeaders.missingMessageGroupLeaderAddresses
        })
      });
    }
  }
}
export { CacheHydrationGate };