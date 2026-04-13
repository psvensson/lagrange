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
import { v4 as uuidv4 } from 'uuid';

/**
 * HTTP header name for correlation ID propagation.
 * @type {string}
 */
const CORRELATION_HEADER = stryMutAct_9fa48("160193") ? "" : (stryCov_9fa48("160193"), 'x-correlation-id');

/**
 * Generate a new unique correlation ID.
 * @return {string} A UUID v4 string
 */
function generateCorrelationId() {
  if (stryMutAct_9fa48("160194")) {
    {}
  } else {
    stryCov_9fa48("160194");
    return uuidv4();
  }
}

/**
 * Get the correlation ID from a message, or create a new one if not present.
 * @param {Object} message - The message to extract correlation ID from
 * @return {string} The existing or newly generated correlation ID
 */
function getOrCreateCorrelationId(message) {
  if (stryMutAct_9fa48("160195")) {
    {}
  } else {
    stryCov_9fa48("160195");
    return stryMutAct_9fa48("160198") ? message.correlationId && generateCorrelationId() : stryMutAct_9fa48("160197") ? false : stryMutAct_9fa48("160196") ? true : (stryCov_9fa48("160196", "160197", "160198"), message.correlationId || generateCorrelationId());
  }
}

/**
 * Create a new message object with a correlation ID.
 * If correlationId is provided, uses it; otherwise generates a new one.
 * @param {Object} message - The original message
 * @param {string} [correlationId] - Optional correlation ID to use
 * @return {Object} A new message object with correlationId field
 */
function withCorrelationId(message, correlationId) {
  if (stryMutAct_9fa48("160199")) {
    {}
  } else {
    stryCov_9fa48("160199");
    return stryMutAct_9fa48("160200") ? {} : (stryCov_9fa48("160200"), {
      ...message,
      correlationId: stryMutAct_9fa48("160203") ? correlationId && generateCorrelationId() : stryMutAct_9fa48("160202") ? false : stryMutAct_9fa48("160201") ? true : (stryCov_9fa48("160201", "160202", "160203"), correlationId || generateCorrelationId())
    });
  }
}
export { CORRELATION_HEADER, generateCorrelationId, getOrCreateCorrelationId, withCorrelationId };