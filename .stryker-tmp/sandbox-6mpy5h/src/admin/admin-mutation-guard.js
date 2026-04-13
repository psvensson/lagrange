/**
 * Guard module that enforces the single-path mutation contract.
 * After migration is complete, any attempt to mutate system state
 * through deprecated/bypass paths should hard-fail.
 *
 * Requirements: 1.5, 12.2
 * @module admin/admin-mutation-guard
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
import { isDeprecatedPath, DEPRECATION_WARNING } from './admin-deprecation.js';
const MUTATION_GUARD_MODE = Object.freeze(stryMutAct_9fa48("4204") ? {} : (stryCov_9fa48("4204"), {
  WARN: stryMutAct_9fa48("4205") ? "" : (stryCov_9fa48("4205"), 'warn'),
  REJECT: stryMutAct_9fa48("4206") ? "" : (stryCov_9fa48("4206"), 'reject')
}));
const MUTATION_GUARD_ERROR_MSG = Object.freeze(stryMutAct_9fa48("4207") ? {} : (stryCov_9fa48("4207"), {
  BYPASS_REJECTED: (stryMutAct_9fa48("4208") ? "" : (stryCov_9fa48("4208"), 'Direct mutation path is rejected.')) + (stryMutAct_9fa48("4209") ? "" : (stryCov_9fa48("4209"), ' Use meta-service commands.')),
  MODE_REQUIRED: stryMutAct_9fa48("4210") ? "" : (stryCov_9fa48("4210"), 'Guard mode is required'),
  ACTION_REQUIRED: stryMutAct_9fa48("4211") ? "" : (stryCov_9fa48("4211"), 'Action is required')
}));
const MUTATION_GUARD_ERROR_CODE = Object.freeze(stryMutAct_9fa48("4212") ? {} : (stryCov_9fa48("4212"), {
  BYPASS_REJECTED: stryMutAct_9fa48("4213") ? "" : (stryCov_9fa48("4213"), 'BYPASS_REJECTED')
}));

/**
 * Valid guard modes for fast lookup.
 * @type {Set<string>}
 */
const VALID_MODES = new Set(Object.values(MUTATION_GUARD_MODE));

/**
 * Guard a mutation action against deprecated bypass paths.
 *
 * @param {string} action - The action string to guard.
 * @param {string} mode - One of MUTATION_GUARD_MODE values.
 * @return {Object} Guard result with allowed, warning, or error.
 */
function guardMutation(action, mode) {
  if (stryMutAct_9fa48("4214")) {
    {}
  } else {
    stryCov_9fa48("4214");
    if (stryMutAct_9fa48("4217") ? false : stryMutAct_9fa48("4216") ? true : stryMutAct_9fa48("4215") ? action : (stryCov_9fa48("4215", "4216", "4217"), !action)) {
      if (stryMutAct_9fa48("4218")) {
        {}
      } else {
        stryCov_9fa48("4218");
        return stryMutAct_9fa48("4219") ? {} : (stryCov_9fa48("4219"), {
          allowed: stryMutAct_9fa48("4220") ? true : (stryCov_9fa48("4220"), false),
          error: MUTATION_GUARD_ERROR_MSG.ACTION_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("4223") ? !mode && !VALID_MODES.has(mode) : stryMutAct_9fa48("4222") ? false : stryMutAct_9fa48("4221") ? true : (stryCov_9fa48("4221", "4222", "4223"), (stryMutAct_9fa48("4224") ? mode : (stryCov_9fa48("4224"), !mode)) || (stryMutAct_9fa48("4225") ? VALID_MODES.has(mode) : (stryCov_9fa48("4225"), !VALID_MODES.has(mode))))) {
      if (stryMutAct_9fa48("4226")) {
        {}
      } else {
        stryCov_9fa48("4226");
        return stryMutAct_9fa48("4227") ? {} : (stryCov_9fa48("4227"), {
          allowed: stryMutAct_9fa48("4228") ? true : (stryCov_9fa48("4228"), false),
          error: MUTATION_GUARD_ERROR_MSG.MODE_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("4231") ? false : stryMutAct_9fa48("4230") ? true : stryMutAct_9fa48("4229") ? isDeprecatedPath(action) : (stryCov_9fa48("4229", "4230", "4231"), !isDeprecatedPath(action))) {
      if (stryMutAct_9fa48("4232")) {
        {}
      } else {
        stryCov_9fa48("4232");
        return stryMutAct_9fa48("4233") ? {} : (stryCov_9fa48("4233"), {
          allowed: stryMutAct_9fa48("4234") ? false : (stryCov_9fa48("4234"), true)
        });
      }
    }
    if (stryMutAct_9fa48("4237") ? mode !== MUTATION_GUARD_MODE.WARN : stryMutAct_9fa48("4236") ? false : stryMutAct_9fa48("4235") ? true : (stryCov_9fa48("4235", "4236", "4237"), mode === MUTATION_GUARD_MODE.WARN)) {
      if (stryMutAct_9fa48("4238")) {
        {}
      } else {
        stryCov_9fa48("4238");
        return stryMutAct_9fa48("4239") ? {} : (stryCov_9fa48("4239"), {
          allowed: stryMutAct_9fa48("4240") ? false : (stryCov_9fa48("4240"), true),
          warning: DEPRECATION_WARNING.DIRECT_MUTATION
        });
      }
    }
    return stryMutAct_9fa48("4241") ? {} : (stryCov_9fa48("4241"), {
      allowed: stryMutAct_9fa48("4242") ? true : (stryCov_9fa48("4242"), false),
      error: MUTATION_GUARD_ERROR_MSG.BYPASS_REJECTED,
      code: MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED
    });
  }
}
export { MUTATION_GUARD_MODE, MUTATION_GUARD_ERROR_MSG, MUTATION_GUARD_ERROR_CODE, guardMutation };