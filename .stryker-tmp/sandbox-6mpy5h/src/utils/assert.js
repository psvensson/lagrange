/**
 * Assert a critical dependency is available.
 * Throws to allow top-level handlers to terminate.
 * @param {*} value
 * @param {string} message
 * @param {Object} [options]
 * @param {Function} [options.ErrorClass]
 * @param {Object} [options.context]
 * @return {*}
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
export function assertCritical(value, message, options = {}) {
  if (stryMutAct_9fa48("160140")) {
    {}
  } else {
    stryCov_9fa48("160140");
    if (stryMutAct_9fa48("160143") ? false : stryMutAct_9fa48("160142") ? true : stryMutAct_9fa48("160141") ? value : (stryCov_9fa48("160141", "160142", "160143"), !value)) {
      if (stryMutAct_9fa48("160144")) {
        {}
      } else {
        stryCov_9fa48("160144");
        const ErrorClass = stryMutAct_9fa48("160147") ? options.ErrorClass && Error : stryMutAct_9fa48("160146") ? false : stryMutAct_9fa48("160145") ? true : (stryCov_9fa48("160145", "160146", "160147"), options.ErrorClass || Error);
        const errorOptions = options.context ? stryMutAct_9fa48("160148") ? {} : (stryCov_9fa48("160148"), {
          context: options.context
        }) : undefined;
        let error;
        try {
          if (stryMutAct_9fa48("160149")) {
            {}
          } else {
            stryCov_9fa48("160149");
            error = errorOptions ? new ErrorClass(message, errorOptions) : new ErrorClass(message);
          }
        } catch {
          if (stryMutAct_9fa48("160150")) {
            {}
          } else {
            stryCov_9fa48("160150");
            error = new Error(message);
          }
        }
        if (stryMutAct_9fa48("160153") ? options.context || error.context === undefined : stryMutAct_9fa48("160152") ? false : stryMutAct_9fa48("160151") ? true : (stryCov_9fa48("160151", "160152", "160153"), options.context && (stryMutAct_9fa48("160155") ? error.context !== undefined : stryMutAct_9fa48("160154") ? true : (stryCov_9fa48("160154", "160155"), error.context === undefined)))) {
          if (stryMutAct_9fa48("160156")) {
            {}
          } else {
            stryCov_9fa48("160156");
            error.context = options.context;
          }
        }
        error.isCritical = stryMutAct_9fa48("160157") ? false : (stryCov_9fa48("160157"), true);
        throw error;
      }
    }
    return value;
  }
}

/**
 * Assert a value is not null or undefined.
 * @param {*} value
 * @param {string} message
 * @param {Object} [options]
 * @return {*}
 */
export function assertDefined(value, message, options = {}) {
  if (stryMutAct_9fa48("160158")) {
    {}
  } else {
    stryCov_9fa48("160158");
    if (stryMutAct_9fa48("160161") ? value === null && value === undefined : stryMutAct_9fa48("160160") ? false : stryMutAct_9fa48("160159") ? true : (stryCov_9fa48("160159", "160160", "160161"), (stryMutAct_9fa48("160163") ? value !== null : stryMutAct_9fa48("160162") ? false : (stryCov_9fa48("160162", "160163"), value === null)) || (stryMutAct_9fa48("160165") ? value !== undefined : stryMutAct_9fa48("160164") ? false : (stryCov_9fa48("160164", "160165"), value === undefined)))) {
      if (stryMutAct_9fa48("160166")) {
        {}
      } else {
        stryCov_9fa48("160166");
        return assertCritical(stryMutAct_9fa48("160167") ? true : (stryCov_9fa48("160167"), false), message, options);
      }
    }
    return value;
  }
}