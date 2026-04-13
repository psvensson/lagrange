/**
 * Shared tap exports for repository tests.
 *
 * This module intentionally keeps tap runtime behavior unmodified so child test
 * output is parsed consistently by the tap CLI.
 */
// @ts-nocheck


// tap exits non-zero on incomplete coverage by default. Our repo uses coverage
// as a signal (reporting), but not as a hard gate in `npm test`.
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
if (stryMutAct_9fa48("152162") ? false : stryMutAct_9fa48("152161") ? true : stryMutAct_9fa48("152160") ? process.env.TAP_ALLOW_INCOMPLETE_COVERAGE : (stryCov_9fa48("152160", "152161", "152162"), !process.env.TAP_ALLOW_INCOMPLETE_COVERAGE)) {
  if (stryMutAct_9fa48("152163")) {
    {}
  } else {
    stryCov_9fa48("152163");
    process.env.TAP_ALLOW_INCOMPLETE_COVERAGE = stryMutAct_9fa48("152164") ? "" : (stryCov_9fa48("152164"), '1');
  }
}
const tap = await import(stryMutAct_9fa48("152165") ? "" : (stryCov_9fa48("152165"), 'tap'));
const t = stryMutAct_9fa48("152166") ? tap.default && tap : (stryCov_9fa48("152166"), tap.default ?? tap);
export const test = t.test.bind(t);
export const beforeEach = stryMutAct_9fa48("152167") ? t.beforeEach.bind(t) : (stryCov_9fa48("152167"), t.beforeEach?.bind(t));
export const afterEach = stryMutAct_9fa48("152168") ? t.afterEach.bind(t) : (stryCov_9fa48("152168"), t.afterEach?.bind(t));
export default t;