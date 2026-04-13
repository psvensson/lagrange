// @ts-nocheck
// Canonical owner for shared test-output path and suffix constants.
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
const TEST_OUTPUT_ROOT_DIR = stryMutAct_9fa48("54979") ? "" : (stryCov_9fa48("54979"), 'test-output');
const TEST_OUTPUT_REPORTS_DIR = stryMutAct_9fa48("54980") ? "" : (stryCov_9fa48("54980"), 'reports');
const TEST_OUTPUT_PLAYBACK_DIR = stryMutAct_9fa48("54981") ? "" : (stryCov_9fa48("54981"), '.playback');
const TEST_OUTPUT_RUN_METADATA_DIR = stryMutAct_9fa48("54982") ? "" : (stryCov_9fa48("54982"), '.run-metadata');
const TEST_OUTPUT_EXAMPLES_DIR = stryMutAct_9fa48("54983") ? "" : (stryCov_9fa48("54983"), 'examples');
const TEST_OUTPUT_SUFFIX_JSON = stryMutAct_9fa48("54984") ? "" : (stryCov_9fa48("54984"), '.json');
const TEST_OUTPUT_SUFFIX_REPORT = stryMutAct_9fa48("54985") ? "" : (stryCov_9fa48("54985"), '.report.json');
const TEST_OUTPUT_PATH = Object.freeze(stryMutAct_9fa48("54986") ? {} : (stryCov_9fa48("54986"), {
  ROOT: TEST_OUTPUT_ROOT_DIR,
  REPORTS_DIR: TEST_OUTPUT_REPORTS_DIR,
  PLAYBACK_DIR: TEST_OUTPUT_PLAYBACK_DIR,
  RUN_METADATA_DIR: TEST_OUTPUT_RUN_METADATA_DIR,
  EXAMPLES_DIR: TEST_OUTPUT_EXAMPLES_DIR
}));
const TEST_OUTPUT_SUFFIX = Object.freeze(stryMutAct_9fa48("54987") ? {} : (stryCov_9fa48("54987"), {
  JSON: TEST_OUTPUT_SUFFIX_JSON,
  REPORT: TEST_OUTPUT_SUFFIX_REPORT
}));
export { TEST_OUTPUT_EXAMPLES_DIR, TEST_OUTPUT_PATH, TEST_OUTPUT_PLAYBACK_DIR, TEST_OUTPUT_REPORTS_DIR, TEST_OUTPUT_ROOT_DIR, TEST_OUTPUT_RUN_METADATA_DIR, TEST_OUTPUT_SUFFIX, TEST_OUTPUT_SUFFIX_JSON, TEST_OUTPUT_SUFFIX_REPORT };