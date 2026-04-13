/**
 * Dual-path closure verification for control-plane migration.
 *
 * Verifies that no dual progression paths exist for migrated
 * concerns after a phase closure. Detects temporary toggles,
 * duplicate progression branches, and legacy code paths that
 * should have been removed.
 *
 * Each control-plane concern (dispatch, rebalance, split) must
 * have exactly one progression owner path. This module evaluates
 * a concern registry snapshot and produces typed violation results.
 *
 * Requirements: 10.3 (Requirement 10)
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
import { CLOSURE_STATUS, CONCERN, VIOLATION_TYPE } from './dual-path-closure-constants.js';

/**
 * Build a frozen violation result.
 *
 * @param {Object} options
 * @param {string} options.concern - One of CONCERN values.
 * @param {string} options.violationType - One of VIOLATION_TYPE.
 * @param {string} options.detail - Diagnostic detail message.
 * @return {Object} Frozen violation result.
 */
function buildViolation(options) {
  if (stryMutAct_9fa48("64409")) {
    {}
  } else {
    stryCov_9fa48("64409");
    return Object.freeze(stryMutAct_9fa48("64410") ? {} : (stryCov_9fa48("64410"), {
      concern: options.concern,
      violationType: options.violationType,
      detail: (stryMutAct_9fa48("64413") ? typeof options.detail !== 'string' : stryMutAct_9fa48("64412") ? false : stryMutAct_9fa48("64411") ? true : (stryCov_9fa48("64411", "64412", "64413"), typeof options.detail === (stryMutAct_9fa48("64414") ? "" : (stryCov_9fa48("64414"), 'string')))) ? options.detail : null
    }));
  }
}

/**
 * Verify a single concern has exactly one progression owner path.
 *
 * The concernEntry describes the current state of a concern:
 *   {
 *     concern: string,          // CONCERN value
 *     ownerPaths: string[],     // registered progression paths
 *     activeToggles: string[],  // temporary migration toggles
 *     legacyBranches: string[], // legacy branches not yet removed
 *   }
 *
 * @param {Object} concernEntry - Concern state snapshot.
 * @return {Array<Object>} Array of frozen violation results
 *   (empty when the concern is clean).
 */
function verifyConcern(concernEntry) {
  if (stryMutAct_9fa48("64415")) {
    {}
  } else {
    stryCov_9fa48("64415");
    const entry = (stryMutAct_9fa48("64418") ? concernEntry || typeof concernEntry === 'object' : stryMutAct_9fa48("64417") ? false : stryMutAct_9fa48("64416") ? true : (stryCov_9fa48("64416", "64417", "64418"), concernEntry && (stryMutAct_9fa48("64420") ? typeof concernEntry !== 'object' : stryMutAct_9fa48("64419") ? true : (stryCov_9fa48("64419", "64420"), typeof concernEntry === (stryMutAct_9fa48("64421") ? "" : (stryCov_9fa48("64421"), 'object')))))) ? concernEntry : {};
    const violations = stryMutAct_9fa48("64422") ? ["Stryker was here"] : (stryCov_9fa48("64422"), []);
    const ownerPaths = Array.isArray(entry.ownerPaths) ? entry.ownerPaths : stryMutAct_9fa48("64423") ? ["Stryker was here"] : (stryCov_9fa48("64423"), []);
    const activeToggles = Array.isArray(entry.activeToggles) ? entry.activeToggles : stryMutAct_9fa48("64424") ? ["Stryker was here"] : (stryCov_9fa48("64424"), []);
    const legacyBranches = Array.isArray(entry.legacyBranches) ? entry.legacyBranches : stryMutAct_9fa48("64425") ? ["Stryker was here"] : (stryCov_9fa48("64425"), []);
    const concern = (stryMutAct_9fa48("64428") ? typeof entry.concern !== 'string' : stryMutAct_9fa48("64427") ? false : stryMutAct_9fa48("64426") ? true : (stryCov_9fa48("64426", "64427", "64428"), typeof entry.concern === (stryMutAct_9fa48("64429") ? "" : (stryCov_9fa48("64429"), 'string')))) ? entry.concern : stryMutAct_9fa48("64430") ? "Stryker was here!" : (stryCov_9fa48("64430"), '');
    if (stryMutAct_9fa48("64434") ? ownerPaths.length <= 1 : stryMutAct_9fa48("64433") ? ownerPaths.length >= 1 : stryMutAct_9fa48("64432") ? false : stryMutAct_9fa48("64431") ? true : (stryCov_9fa48("64431", "64432", "64433", "64434"), ownerPaths.length > 1)) {
      if (stryMutAct_9fa48("64435")) {
        {}
      } else {
        stryCov_9fa48("64435");
        violations.push(buildViolation(stryMutAct_9fa48("64436") ? {} : (stryCov_9fa48("64436"), {
          concern,
          violationType: VIOLATION_TYPE.DUPLICATE_PROGRESSION,
          detail: (stryMutAct_9fa48("64437") ? `` : (stryCov_9fa48("64437"), `${ownerPaths.length} progression paths: `)) + ownerPaths.join(stryMutAct_9fa48("64438") ? "" : (stryCov_9fa48("64438"), ', '))
        })));
      }
    }
    for (const toggle of activeToggles) {
      if (stryMutAct_9fa48("64439")) {
        {}
      } else {
        stryCov_9fa48("64439");
        violations.push(buildViolation(stryMutAct_9fa48("64440") ? {} : (stryCov_9fa48("64440"), {
          concern,
          violationType: VIOLATION_TYPE.ACTIVE_TOGGLE,
          detail: (stryMutAct_9fa48("64443") ? typeof toggle !== 'string' : stryMutAct_9fa48("64442") ? false : stryMutAct_9fa48("64441") ? true : (stryCov_9fa48("64441", "64442", "64443"), typeof toggle === (stryMutAct_9fa48("64444") ? "" : (stryCov_9fa48("64444"), 'string')))) ? toggle : null
        })));
      }
    }
    for (const branch of legacyBranches) {
      if (stryMutAct_9fa48("64445")) {
        {}
      } else {
        stryCov_9fa48("64445");
        violations.push(buildViolation(stryMutAct_9fa48("64446") ? {} : (stryCov_9fa48("64446"), {
          concern,
          violationType: VIOLATION_TYPE.LEGACY_BRANCH,
          detail: (stryMutAct_9fa48("64449") ? typeof branch !== 'string' : stryMutAct_9fa48("64448") ? false : stryMutAct_9fa48("64447") ? true : (stryCov_9fa48("64447", "64448", "64449"), typeof branch === (stryMutAct_9fa48("64450") ? "" : (stryCov_9fa48("64450"), 'string')))) ? branch : null
        })));
      }
    }
    return violations;
  }
}

/**
 * Verify all concerns in a registry snapshot have single owner
 * paths and no remaining dual-path artifacts.
 *
 * @param {Array<Object>} concernEntries - Array of concern state
 *   snapshots (see verifyConcern for shape).
 * @return {Object} Frozen closure verification result with shape:
 *   {status, violations, totalConcerns, cleanConcerns}
 */
function verifyClosureState(concernEntries) {
  if (stryMutAct_9fa48("64451")) {
    {}
  } else {
    stryCov_9fa48("64451");
    const entries = Array.isArray(concernEntries) ? concernEntries : stryMutAct_9fa48("64452") ? ["Stryker was here"] : (stryCov_9fa48("64452"), []);
    const allViolations = stryMutAct_9fa48("64453") ? ["Stryker was here"] : (stryCov_9fa48("64453"), []);
    let cleanConcerns = 0;
    for (const entry of entries) {
      if (stryMutAct_9fa48("64454")) {
        {}
      } else {
        stryCov_9fa48("64454");
        const violations = verifyConcern(entry);
        if (stryMutAct_9fa48("64457") ? violations.length !== 0 : stryMutAct_9fa48("64456") ? false : stryMutAct_9fa48("64455") ? true : (stryCov_9fa48("64455", "64456", "64457"), violations.length === 0)) {
          if (stryMutAct_9fa48("64458")) {
            {}
          } else {
            stryCov_9fa48("64458");
            stryMutAct_9fa48("64459") ? cleanConcerns-- : (stryCov_9fa48("64459"), cleanConcerns++);
          }
        }
        for (const v of violations) {
          if (stryMutAct_9fa48("64460")) {
            {}
          } else {
            stryCov_9fa48("64460");
            allViolations.push(v);
          }
        }
      }
    }
    const status = (stryMutAct_9fa48("64463") ? allViolations.length !== 0 : stryMutAct_9fa48("64462") ? false : stryMutAct_9fa48("64461") ? true : (stryCov_9fa48("64461", "64462", "64463"), allViolations.length === 0)) ? CLOSURE_STATUS.CLEAN : CLOSURE_STATUS.VIOLATIONS_FOUND;
    return Object.freeze(stryMutAct_9fa48("64464") ? {} : (stryCov_9fa48("64464"), {
      status,
      violations: Object.freeze(allViolations),
      totalConcerns: entries.length,
      cleanConcerns
    }));
  }
}

/**
 * Build a clean concern entry for a migrated concern that has
 * completed dual-path removal.
 *
 * @param {string} concern - One of CONCERN values.
 * @param {string} ownerPath - The single canonical owner path.
 * @return {Object} Frozen concern entry with no toggles or
 *   legacy branches.
 */
function buildCleanConcernEntry(concern, ownerPath) {
  if (stryMutAct_9fa48("64465")) {
    {}
  } else {
    stryCov_9fa48("64465");
    return Object.freeze(stryMutAct_9fa48("64466") ? {} : (stryCov_9fa48("64466"), {
      concern: (stryMutAct_9fa48("64469") ? typeof concern !== 'string' : stryMutAct_9fa48("64468") ? false : stryMutAct_9fa48("64467") ? true : (stryCov_9fa48("64467", "64468", "64469"), typeof concern === (stryMutAct_9fa48("64470") ? "" : (stryCov_9fa48("64470"), 'string')))) ? concern : stryMutAct_9fa48("64471") ? "Stryker was here!" : (stryCov_9fa48("64471"), ''),
      ownerPaths: Object.freeze((stryMutAct_9fa48("64474") ? typeof ownerPath === 'string' || ownerPath.length > 0 : stryMutAct_9fa48("64473") ? false : stryMutAct_9fa48("64472") ? true : (stryCov_9fa48("64472", "64473", "64474"), (stryMutAct_9fa48("64476") ? typeof ownerPath !== 'string' : stryMutAct_9fa48("64475") ? true : (stryCov_9fa48("64475", "64476"), typeof ownerPath === (stryMutAct_9fa48("64477") ? "" : (stryCov_9fa48("64477"), 'string')))) && (stryMutAct_9fa48("64480") ? ownerPath.length <= 0 : stryMutAct_9fa48("64479") ? ownerPath.length >= 0 : stryMutAct_9fa48("64478") ? true : (stryCov_9fa48("64478", "64479", "64480"), ownerPath.length > 0)))) ? stryMutAct_9fa48("64481") ? [] : (stryCov_9fa48("64481"), [ownerPath]) : stryMutAct_9fa48("64482") ? ["Stryker was here"] : (stryCov_9fa48("64482"), [])),
      activeToggles: Object.freeze(stryMutAct_9fa48("64483") ? ["Stryker was here"] : (stryCov_9fa48("64483"), [])),
      legacyBranches: Object.freeze(stryMutAct_9fa48("64484") ? ["Stryker was here"] : (stryCov_9fa48("64484"), []))
    }));
  }
}

/**
 * Build a default concern registry snapshot covering all three
 * canonical control-plane concerns. Each concern starts clean
 * with the provided owner path map.
 *
 * @param {Object} ownerPathMap - Maps CONCERN values to their
 *   single canonical owner path string.
 * @return {Array<Object>} Array of frozen concern entries.
 */
function buildDefaultConcernRegistry(ownerPathMap) {
  if (stryMutAct_9fa48("64485")) {
    {}
  } else {
    stryCov_9fa48("64485");
    const pathMap = (stryMutAct_9fa48("64488") ? ownerPathMap || typeof ownerPathMap === 'object' : stryMutAct_9fa48("64487") ? false : stryMutAct_9fa48("64486") ? true : (stryCov_9fa48("64486", "64487", "64488"), ownerPathMap && (stryMutAct_9fa48("64490") ? typeof ownerPathMap !== 'object' : stryMutAct_9fa48("64489") ? true : (stryCov_9fa48("64489", "64490"), typeof ownerPathMap === (stryMutAct_9fa48("64491") ? "" : (stryCov_9fa48("64491"), 'object')))))) ? ownerPathMap : {};
    return Object.freeze(stryMutAct_9fa48("64492") ? [] : (stryCov_9fa48("64492"), [buildCleanConcernEntry(CONCERN.DISPATCH, stryMutAct_9fa48("64495") ? pathMap[CONCERN.DISPATCH] && '' : stryMutAct_9fa48("64494") ? false : stryMutAct_9fa48("64493") ? true : (stryCov_9fa48("64493", "64494", "64495"), pathMap[CONCERN.DISPATCH] || (stryMutAct_9fa48("64496") ? "Stryker was here!" : (stryCov_9fa48("64496"), '')))), buildCleanConcernEntry(CONCERN.REBALANCE, stryMutAct_9fa48("64499") ? pathMap[CONCERN.REBALANCE] && '' : stryMutAct_9fa48("64498") ? false : stryMutAct_9fa48("64497") ? true : (stryCov_9fa48("64497", "64498", "64499"), pathMap[CONCERN.REBALANCE] || (stryMutAct_9fa48("64500") ? "Stryker was here!" : (stryCov_9fa48("64500"), '')))), buildCleanConcernEntry(CONCERN.SPLIT, stryMutAct_9fa48("64503") ? pathMap[CONCERN.SPLIT] && '' : stryMutAct_9fa48("64502") ? false : stryMutAct_9fa48("64501") ? true : (stryCov_9fa48("64501", "64502", "64503"), pathMap[CONCERN.SPLIT] || (stryMutAct_9fa48("64504") ? "Stryker was here!" : (stryCov_9fa48("64504"), ''))))]));
  }
}
export { buildCleanConcernEntry, buildDefaultConcernRegistry, buildViolation, verifyConcern, verifyClosureState };