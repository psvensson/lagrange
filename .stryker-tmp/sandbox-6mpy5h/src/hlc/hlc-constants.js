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
import { CONFIG_KEY } from '../config/config-constants.js';
import { NUM } from '../constants/index.js';
const HLC_SUBSYSTEM = stryMutAct_9fa48("79954") ? "" : (stryCov_9fa48("79954"), 'hlc');
const HLC_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("79955") ? {} : (stryCov_9fa48("79955"), {
  MAX_DRIFT_MS: CONFIG_KEY.HLC_MAX_DRIFT_MS,
  MAX_LOGICAL_COUNTER: CONFIG_KEY.HLC_MAX_LOGICAL_COUNTER
}));
const HLC_DEFAULT = Object.freeze(stryMutAct_9fa48("79956") ? {} : (stryCov_9fa48("79956"), {
  MAX_DRIFT_MS: 500,
  MAX_LOGICAL_COUNTER: 65535
}));
const HLC_SEPARATOR = Object.freeze(stryMutAct_9fa48("79957") ? {} : (stryCov_9fa48("79957"), {
  FIELD: stryMutAct_9fa48("79958") ? "" : (stryCov_9fa48("79958"), '-')
}));
const HLC_PART = Object.freeze(stryMutAct_9fa48("79959") ? {} : (stryCov_9fa48("79959"), {
  MIN_COUNT: NUM.THREE,
  NODE_ID_INDEX: NUM.TWO,
  PARSE_RADIX: NUM.TEN
}));
const HLC_LOG_MSG = Object.freeze(stryMutAct_9fa48("79960") ? {} : (stryCov_9fa48("79960"), {
  EXCESSIVE_CLOCK_DRIFT: stryMutAct_9fa48("79961") ? "" : (stryCov_9fa48("79961"), 'Excessive clock drift detected')
}));
const HLC_ERROR_MSG = Object.freeze(stryMutAct_9fa48("79962") ? {} : (stryCov_9fa48("79962"), {
  NOT_STRING_PREFIX: stryMutAct_9fa48("79963") ? "" : (stryCov_9fa48("79963"), 'HLC timestamp must be a string, got '),
  INVALID_STRING_PREFIX: stryMutAct_9fa48("79964") ? "" : (stryCov_9fa48("79964"), 'Invalid HLC timestamp string: ')
}));
export { HLC_CONFIG_KEY, HLC_DEFAULT, HLC_ERROR_MSG, HLC_LOG_MSG, HLC_PART, HLC_SEPARATOR, HLC_SUBSYSTEM };