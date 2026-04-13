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
import { NUM } from './numbers.js';

// Canonical owner for prune-script-specific scalar constants.
// These tokens and labels are specific to prune-test-output.js after reuse of
// existing shared constants such as NUM, ENTRYPOINT flags, file text, and
// test-output path/suffix owners.
const TEST_OUTPUT_PRUNE_DEFAULT_KEEP_DAYS = NUM.ZERO;
const TEST_OUTPUT_PRUNE_ARGV_USER_START_INDEX = NUM.TWO;
const TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORTS = NUM.FOUR;
const TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORT_PLAYBACKS = NUM.FOUR;
const TEST_OUTPUT_PRUNE_DEFAULT_KEEP_LEGACY_PLAYBACKS = NUM.FOUR;
const TEST_OUTPUT_PRUNE_DEFAULT_KEEP_TOP_LEVEL = NUM.FOUR;
const TEST_OUTPUT_PRUNE_HOURS_PER_DAY = stryMutAct_9fa48("54911") ? NUM.THREE / NUM.EIGHT : (stryCov_9fa48("54911"), NUM.THREE * NUM.EIGHT);
const TEST_OUTPUT_PRUNE_MINUTES_PER_HOUR = stryMutAct_9fa48("54912") ? NUM.THIRTY / NUM.TWO : (stryCov_9fa48("54912"), NUM.THIRTY * NUM.TWO);
const TEST_OUTPUT_PRUNE_SECONDS_PER_MINUTE = stryMutAct_9fa48("54913") ? NUM.THIRTY / NUM.TWO : (stryCov_9fa48("54913"), NUM.THIRTY * NUM.TWO);
const TEST_OUTPUT_PRUNE_VERB_APPLY = stryMutAct_9fa48("54914") ? "" : (stryCov_9fa48("54914"), 'Deleted');
const TEST_OUTPUT_PRUNE_VERB_DRY_RUN = stryMutAct_9fa48("54915") ? "" : (stryCov_9fa48("54915"), 'Would delete');
const TEST_OUTPUT_PRUNE_UNKNOWN_ARGUMENT_PREFIX = stryMutAct_9fa48("54916") ? "" : (stryCov_9fa48("54916"), 'Unknown argument: ');
const TEST_OUTPUT_PRUNE_INTEGER_ERROR_SUFFIX = stryMutAct_9fa48("54917") ? "" : (stryCov_9fa48("54917"), ' requires a non-negative integer');
const TEST_OUTPUT_PRUNE_PINNED_NAME_SOURCE = stryMutAct_9fa48("54918") ? "" : (stryCov_9fa48("54918"), '(latest|current|acceptance|summary|validation|manifest-shape|report-only)');
const TEST_OUTPUT_PRUNE_PINNED_NAME_FLAG = stryMutAct_9fa48("54919") ? "" : (stryCov_9fa48("54919"), 'i');
const TEST_OUTPUT_PRUNE_ENTRY_TYPE_FILE = stryMutAct_9fa48("54920") ? "" : (stryCov_9fa48("54920"), 'file');
const TEST_OUTPUT_PRUNE_ENTRY_TYPE_DIR = stryMutAct_9fa48("54921") ? "" : (stryCov_9fa48("54921"), 'dir');
const TEST_OUTPUT_PRUNE_BYTE_UNIT_B = stryMutAct_9fa48("54922") ? "" : (stryCov_9fa48("54922"), 'B');
const TEST_OUTPUT_PRUNE_BYTE_UNIT_KB = stryMutAct_9fa48("54923") ? "" : (stryCov_9fa48("54923"), 'KB');
const TEST_OUTPUT_PRUNE_BYTE_UNIT_MB = stryMutAct_9fa48("54924") ? "" : (stryCov_9fa48("54924"), 'MB');
const TEST_OUTPUT_PRUNE_BYTE_UNIT_GB = stryMutAct_9fa48("54925") ? "" : (stryCov_9fa48("54925"), 'GB');
const TEST_OUTPUT_PRUNE_BYTE_UNIT_TB = stryMutAct_9fa48("54926") ? "" : (stryCov_9fa48("54926"), 'TB');
const TEST_OUTPUT_PRUNE_FLAG_ROOT = stryMutAct_9fa48("54927") ? "" : (stryCov_9fa48("54927"), '--root');
const TEST_OUTPUT_PRUNE_FLAG_APPLY = stryMutAct_9fa48("54928") ? "" : (stryCov_9fa48("54928"), '--apply');
const TEST_OUTPUT_PRUNE_FLAG_JSON = stryMutAct_9fa48("54929") ? "" : (stryCov_9fa48("54929"), '--json');
const TEST_OUTPUT_PRUNE_FLAG_KEEP_DAYS = stryMutAct_9fa48("54930") ? "" : (stryCov_9fa48("54930"), '--keep-days');
const TEST_OUTPUT_PRUNE_FLAG_KEEP_REPORTS = stryMutAct_9fa48("54931") ? "" : (stryCov_9fa48("54931"), '--keep-reports');
const TEST_OUTPUT_PRUNE_FLAG_KEEP_REPORT_PLAYBACKS = stryMutAct_9fa48("54932") ? "" : (stryCov_9fa48("54932"), '--keep-report-playbacks');
const TEST_OUTPUT_PRUNE_FLAG_KEEP_LEGACY_PLAYBACKS = stryMutAct_9fa48("54933") ? "" : (stryCov_9fa48("54933"), '--keep-legacy-playbacks');
const TEST_OUTPUT_PRUNE_FLAG_KEEP_TOP_LEVEL = stryMutAct_9fa48("54934") ? "" : (stryCov_9fa48("54934"), '--keep-top-level');
const TEST_OUTPUT_PRUNE_USAGE_HEADER = stryMutAct_9fa48("54935") ? "" : (stryCov_9fa48("54935"), 'Usage:');
const TEST_OUTPUT_PRUNE_USAGE_SCRIPT = stryMutAct_9fa48("54936") ? "" : (stryCov_9fa48("54936"), '  node scripts/prune-test-output.js [options]');
const TEST_OUTPUT_PRUNE_USAGE_OPTIONS = stryMutAct_9fa48("54937") ? "" : (stryCov_9fa48("54937"), 'Options:');
const TEST_OUTPUT_PRUNE_USAGE_ROOT_PREFIX = stryMutAct_9fa48("54938") ? "" : (stryCov_9fa48("54938"), '  --root <dir>                     Primary test-output root (default: ');
const TEST_OUTPUT_PRUNE_USAGE_APPLY = stryMutAct_9fa48("54939") ? "" : (stryCov_9fa48("54939"), '  --apply                          Delete matching files instead of dry-run');
const TEST_OUTPUT_PRUNE_USAGE_JSON = stryMutAct_9fa48("54940") ? "" : (stryCov_9fa48("54940"), '  --json                           Emit JSON summary');
const TEST_OUTPUT_PRUNE_USAGE_SCOPE = stryMutAct_9fa48("54941") ? "" : (stryCov_9fa48("54941"), '  Default scope also includes sibling generated dirs under the workspace root');
const TEST_OUTPUT_PRUNE_USAGE_KEEP_DAYS_PREFIX = stryMutAct_9fa48("54942") ? "" : (stryCov_9fa48("54942"), '  --keep-days <n>                  Keep items newer than N days (default: ');
const TEST_OUTPUT_PRUNE_USAGE_KEEP_REPORTS_PREFIX = stryMutAct_9fa48("54943") ? "" : (stryCov_9fa48("54943"), '  --keep-reports <n>               Keep at least N report JSON files (default: ');
const TEST_OUTPUT_PRUNE_USAGE_KEEP_REPORT_PLAYBACKS_PREFIX = stryMutAct_9fa48("54944") ? "" : (stryCov_9fa48("54944"), '  --keep-report-playbacks <n>      Keep at least N report playback dirs (default: ');
const TEST_OUTPUT_PRUNE_USAGE_KEEP_LEGACY_PLAYBACKS_PREFIX = stryMutAct_9fa48("54945") ? "" : (stryCov_9fa48("54945"), '  --keep-legacy-playbacks <n>      Keep at least N legacy playback dirs (default: ');
const TEST_OUTPUT_PRUNE_USAGE_KEEP_TOP_LEVEL_PREFIX = stryMutAct_9fa48("54946") ? "" : (stryCov_9fa48("54946"), '  --keep-top-level <n>             Keep at least N other top-level entries (default: ');
const TEST_OUTPUT_PRUNE_USAGE_SUFFIX = stryMutAct_9fa48("54947") ? "" : (stryCov_9fa48("54947"), ')');
const TEST_OUTPUT_PRUNE_VERB = Object.freeze(stryMutAct_9fa48("54948") ? {} : (stryCov_9fa48("54948"), {
  APPLY: TEST_OUTPUT_PRUNE_VERB_APPLY,
  DRY_RUN: TEST_OUTPUT_PRUNE_VERB_DRY_RUN
}));
const TEST_OUTPUT_PRUNE_ERROR_TEXT = Object.freeze(stryMutAct_9fa48("54949") ? {} : (stryCov_9fa48("54949"), {
  UNKNOWN_ARGUMENT_PREFIX: TEST_OUTPUT_PRUNE_UNKNOWN_ARGUMENT_PREFIX,
  INTEGER_ERROR_SUFFIX: TEST_OUTPUT_PRUNE_INTEGER_ERROR_SUFFIX
}));
const TEST_OUTPUT_PRUNE_PATTERN = Object.freeze(stryMutAct_9fa48("54950") ? {} : (stryCov_9fa48("54950"), {
  PINNED_NAME_SOURCE: TEST_OUTPUT_PRUNE_PINNED_NAME_SOURCE,
  PINNED_NAME_FLAG: TEST_OUTPUT_PRUNE_PINNED_NAME_FLAG
}));
const TEST_OUTPUT_PRUNE_ENTRY_TYPE_NAME = Object.freeze(stryMutAct_9fa48("54951") ? {} : (stryCov_9fa48("54951"), {
  FILE: TEST_OUTPUT_PRUNE_ENTRY_TYPE_FILE,
  DIR: TEST_OUTPUT_PRUNE_ENTRY_TYPE_DIR
}));
const TEST_OUTPUT_PRUNE_BYTE_UNIT = Object.freeze(stryMutAct_9fa48("54952") ? {} : (stryCov_9fa48("54952"), {
  B: TEST_OUTPUT_PRUNE_BYTE_UNIT_B,
  KB: TEST_OUTPUT_PRUNE_BYTE_UNIT_KB,
  MB: TEST_OUTPUT_PRUNE_BYTE_UNIT_MB,
  GB: TEST_OUTPUT_PRUNE_BYTE_UNIT_GB,
  TB: TEST_OUTPUT_PRUNE_BYTE_UNIT_TB
}));
const TEST_OUTPUT_PRUNE_FLAG_RAW = Object.freeze(stryMutAct_9fa48("54953") ? {} : (stryCov_9fa48("54953"), {
  ROOT: TEST_OUTPUT_PRUNE_FLAG_ROOT,
  APPLY: TEST_OUTPUT_PRUNE_FLAG_APPLY,
  JSON: TEST_OUTPUT_PRUNE_FLAG_JSON,
  KEEP_DAYS: TEST_OUTPUT_PRUNE_FLAG_KEEP_DAYS,
  KEEP_REPORTS: TEST_OUTPUT_PRUNE_FLAG_KEEP_REPORTS,
  KEEP_REPORT_PLAYBACKS: TEST_OUTPUT_PRUNE_FLAG_KEEP_REPORT_PLAYBACKS,
  KEEP_LEGACY_PLAYBACKS: TEST_OUTPUT_PRUNE_FLAG_KEEP_LEGACY_PLAYBACKS,
  KEEP_TOP_LEVEL: TEST_OUTPUT_PRUNE_FLAG_KEEP_TOP_LEVEL
}));
const TEST_OUTPUT_PRUNE_USAGE_TEXT = Object.freeze(stryMutAct_9fa48("54954") ? {} : (stryCov_9fa48("54954"), {
  HEADER: TEST_OUTPUT_PRUNE_USAGE_HEADER,
  SCRIPT: TEST_OUTPUT_PRUNE_USAGE_SCRIPT,
  OPTIONS: TEST_OUTPUT_PRUNE_USAGE_OPTIONS,
  ROOT_PREFIX: TEST_OUTPUT_PRUNE_USAGE_ROOT_PREFIX,
  APPLY: TEST_OUTPUT_PRUNE_USAGE_APPLY,
  JSON: TEST_OUTPUT_PRUNE_USAGE_JSON,
  SCOPE: TEST_OUTPUT_PRUNE_USAGE_SCOPE,
  KEEP_DAYS_PREFIX: TEST_OUTPUT_PRUNE_USAGE_KEEP_DAYS_PREFIX,
  KEEP_REPORTS_PREFIX: TEST_OUTPUT_PRUNE_USAGE_KEEP_REPORTS_PREFIX,
  KEEP_REPORT_PLAYBACKS_PREFIX: TEST_OUTPUT_PRUNE_USAGE_KEEP_REPORT_PLAYBACKS_PREFIX,
  KEEP_LEGACY_PLAYBACKS_PREFIX: TEST_OUTPUT_PRUNE_USAGE_KEEP_LEGACY_PLAYBACKS_PREFIX,
  KEEP_TOP_LEVEL_PREFIX: TEST_OUTPUT_PRUNE_USAGE_KEEP_TOP_LEVEL_PREFIX,
  SUFFIX: TEST_OUTPUT_PRUNE_USAGE_SUFFIX
}));
export { TEST_OUTPUT_PRUNE_ARGV_USER_START_INDEX, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_DAYS, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_LEGACY_PLAYBACKS, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORT_PLAYBACKS, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_REPORTS, TEST_OUTPUT_PRUNE_DEFAULT_KEEP_TOP_LEVEL, TEST_OUTPUT_PRUNE_BYTE_UNIT, TEST_OUTPUT_PRUNE_ENTRY_TYPE_NAME, TEST_OUTPUT_PRUNE_ERROR_TEXT, TEST_OUTPUT_PRUNE_FLAG_RAW, TEST_OUTPUT_PRUNE_HOURS_PER_DAY, TEST_OUTPUT_PRUNE_MINUTES_PER_HOUR, TEST_OUTPUT_PRUNE_PATTERN, TEST_OUTPUT_PRUNE_SECONDS_PER_MINUTE, TEST_OUTPUT_PRUNE_USAGE_TEXT, TEST_OUTPUT_PRUNE_VERB };