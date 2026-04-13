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
import { createChildTimeoutBudget, createTopLevelOperationBudget, getRemainingBudgetMs } from '../control-plane/timeout-budget.js';
import { NUM, TYPEOF } from '../constants/index.js';
function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  if (stryMutAct_9fa48("167163")) {
    {}
  } else {
    stryCov_9fa48("167163");
    return (stryMutAct_9fa48("167166") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("167165") ? false : stryMutAct_9fa48("167164") ? true : (stryCov_9fa48("167164", "167165", "167166"), Number.isFinite(value) && (stryMutAct_9fa48("167169") ? value <= NUM.ZERO : stryMutAct_9fa48("167168") ? value >= NUM.ZERO : stryMutAct_9fa48("167167") ? true : (stryCov_9fa48("167167", "167168", "167169"), value > NUM.ZERO)))) ? Math.floor(value) : fallback;
  }
}
class TimeoutPolicy {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("167170")) {
      {}
    } else {
      stryCov_9fa48("167170");
      this.operationName = stryMutAct_9fa48("167173") ? options.operationName && null : stryMutAct_9fa48("167172") ? false : stryMutAct_9fa48("167171") ? true : (stryCov_9fa48("167171", "167172", "167173"), options.operationName || null);
      this.configuredBudgetMs = normalizePositiveInteger(options.configuredBudgetMs);
      this.now = (stryMutAct_9fa48("167176") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("167175") ? false : stryMutAct_9fa48("167174") ? true : (stryCov_9fa48("167174", "167175", "167176"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("167177") ? () => undefined : (stryCov_9fa48("167177"), () => Date.now());
    }
  }

  /**
   * Create one top-level timeout budget.
   * @param {Object} [options]
   * @return {Object|null}
   */
  createTopLevelBudget(options = {}) {
    if (stryMutAct_9fa48("167178")) {
      {}
    } else {
      stryCov_9fa48("167178");
      const configuredBudgetMs = normalizePositiveInteger(options.configuredBudgetMs, this.configuredBudgetMs);
      if (stryMutAct_9fa48("167182") ? configuredBudgetMs > NUM.ZERO : stryMutAct_9fa48("167181") ? configuredBudgetMs < NUM.ZERO : stryMutAct_9fa48("167180") ? false : stryMutAct_9fa48("167179") ? true : (stryCov_9fa48("167179", "167180", "167181", "167182"), configuredBudgetMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("167183")) {
          {}
        } else {
          stryCov_9fa48("167183");
          return null;
        }
      }
      return createTopLevelOperationBudget(stryMutAct_9fa48("167184") ? {} : (stryCov_9fa48("167184"), {
        configuredBudgetMs,
        operationName: stryMutAct_9fa48("167187") ? options.operationName && this.operationName : stryMutAct_9fa48("167186") ? false : stryMutAct_9fa48("167185") ? true : (stryCov_9fa48("167185", "167186", "167187"), options.operationName || this.operationName),
        startedAtMs: options.startedAtMs,
        now: stryMutAct_9fa48("167190") ? options.now && this.now : stryMutAct_9fa48("167189") ? false : stryMutAct_9fa48("167188") ? true : (stryCov_9fa48("167188", "167189", "167190"), options.now || this.now)
      }));
    }
  }

  /**
   * Allocate one child budget from the remaining parent deadline.
   * When no parent exists, a new top-level budget is created instead.
   * @param {Object} [options]
   * @return {Object}
   */
  allocate(options = {}) {
    if (stryMutAct_9fa48("167191")) {
      {}
    } else {
      stryCov_9fa48("167191");
      if (stryMutAct_9fa48("167193") ? false : stryMutAct_9fa48("167192") ? true : (stryCov_9fa48("167192", "167193"), options.timeoutBudget)) {
        if (stryMutAct_9fa48("167194")) {
          {}
        } else {
          stryCov_9fa48("167194");
          const allocation = createChildTimeoutBudget(options.timeoutBudget, stryMutAct_9fa48("167195") ? {} : (stryCov_9fa48("167195"), {
            requestedBudgetMs: options.requestedBudgetMs,
            minimumBudgetMs: options.minimumBudgetMs,
            classification: options.classification,
            nestedOperation: options.nestedOperation,
            now: stryMutAct_9fa48("167198") ? options.now && this.now : stryMutAct_9fa48("167197") ? false : stryMutAct_9fa48("167196") ? true : (stryCov_9fa48("167196", "167197", "167198"), options.now || this.now)
          }));
          if (stryMutAct_9fa48("167201") ? !allocation.allowed && !allocation.budget : stryMutAct_9fa48("167200") ? false : stryMutAct_9fa48("167199") ? true : (stryCov_9fa48("167199", "167200", "167201"), (stryMutAct_9fa48("167202") ? allocation.allowed : (stryCov_9fa48("167202"), !allocation.allowed)) || (stryMutAct_9fa48("167203") ? allocation.budget : (stryCov_9fa48("167203"), !allocation.budget)))) {
            if (stryMutAct_9fa48("167204")) {
              {}
            } else {
              stryCov_9fa48("167204");
              return allocation;
            }
          }
          return Object.freeze(stryMutAct_9fa48("167205") ? {} : (stryCov_9fa48("167205"), {
            ...allocation,
            budget: Object.freeze(stryMutAct_9fa48("167206") ? {} : (stryCov_9fa48("167206"), {
              ...allocation.budget,
              operationName: stryMutAct_9fa48("167209") ? (options.timeoutBudget.operationName || this.operationName) && null : stryMutAct_9fa48("167208") ? false : stryMutAct_9fa48("167207") ? true : (stryCov_9fa48("167207", "167208", "167209"), (stryMutAct_9fa48("167211") ? options.timeoutBudget.operationName && this.operationName : stryMutAct_9fa48("167210") ? false : (stryCov_9fa48("167210", "167211"), options.timeoutBudget.operationName || this.operationName)) || null)
            }))
          }));
        }
      }
      const budget = this.createTopLevelBudget(stryMutAct_9fa48("167212") ? {} : (stryCov_9fa48("167212"), {
        configuredBudgetMs: options.requestedBudgetMs,
        startedAtMs: options.startedAtMs,
        operationName: stryMutAct_9fa48("167215") ? options.operationName && this.operationName : stryMutAct_9fa48("167214") ? false : stryMutAct_9fa48("167213") ? true : (stryCov_9fa48("167213", "167214", "167215"), options.operationName || this.operationName),
        now: stryMutAct_9fa48("167218") ? options.now && this.now : stryMutAct_9fa48("167217") ? false : stryMutAct_9fa48("167216") ? true : (stryCov_9fa48("167216", "167217", "167218"), options.now || this.now)
      }));
      if (stryMutAct_9fa48("167221") ? false : stryMutAct_9fa48("167220") ? true : stryMutAct_9fa48("167219") ? budget : (stryCov_9fa48("167219", "167220", "167221"), !budget)) {
        if (stryMutAct_9fa48("167222")) {
          {}
        } else {
          stryCov_9fa48("167222");
          return Object.freeze(stryMutAct_9fa48("167223") ? {} : (stryCov_9fa48("167223"), {
            allowed: stryMutAct_9fa48("167224") ? false : (stryCov_9fa48("167224"), true),
            budget: null,
            grantedBudgetMs: null,
            remainingBudgetMs: null,
            timeoutClassification: null
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("167225") ? {} : (stryCov_9fa48("167225"), {
        allowed: stryMutAct_9fa48("167226") ? false : (stryCov_9fa48("167226"), true),
        budget,
        grantedBudgetMs: budget.configuredBudgetMs,
        remainingBudgetMs: getRemainingBudgetMs(budget, stryMutAct_9fa48("167227") ? {} : (stryCov_9fa48("167227"), {
          now: stryMutAct_9fa48("167230") ? options.now && this.now : stryMutAct_9fa48("167229") ? false : stryMutAct_9fa48("167228") ? true : (stryCov_9fa48("167228", "167229", "167230"), options.now || this.now)
        })),
        timeoutClassification: null
      }));
    }
  }

  /**
   * Allocate one budget or throw a typed timeout error.
   * @param {Object} [options]
   * @return {Object|null}
   */
  allocateOrThrow(options = {}) {
    if (stryMutAct_9fa48("167231")) {
      {}
    } else {
      stryCov_9fa48("167231");
      const allocation = this.allocate(options);
      if (stryMutAct_9fa48("167233") ? false : stryMutAct_9fa48("167232") ? true : (stryCov_9fa48("167232", "167233"), allocation.allowed)) {
        if (stryMutAct_9fa48("167234")) {
          {}
        } else {
          stryCov_9fa48("167234");
          return allocation.budget;
        }
      }
      const error = new Error(stryMutAct_9fa48("167237") ? options.timeoutError && 'Operation timed out' : stryMutAct_9fa48("167236") ? false : stryMutAct_9fa48("167235") ? true : (stryCov_9fa48("167235", "167236", "167237"), options.timeoutError || (stryMutAct_9fa48("167238") ? "" : (stryCov_9fa48("167238"), 'Operation timed out'))));
      error.timeoutClassification = allocation.timeoutClassification;
      throw error;
    }
  }
}
export { TimeoutPolicy };