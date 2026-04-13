/**
 * Constants for admin runtime-service view helpers.
 *
 * Covers logical service health states, view labels,
 * protocol URI schemes, and endpoint display formatting.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
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
import { META_SERVICE_ID } from '../constants/wasm-meta.js';

/**
 * Health state for a logical service derived from
 * desired vs observed replica counts.
 * @enum {string}
 */
const LOGICAL_SERVICE_HEALTH = Object.freeze(stryMutAct_9fa48("4706") ? {} : (stryCov_9fa48("4706"), {
  HEALTHY: stryMutAct_9fa48("4707") ? "" : (stryCov_9fa48("4707"), 'healthy'),
  PARTIAL: stryMutAct_9fa48("4708") ? "" : (stryCov_9fa48("4708"), 'partial'),
  DEGRADED: stryMutAct_9fa48("4709") ? "" : (stryCov_9fa48("4709"), 'degraded'),
  UNKNOWN: stryMutAct_9fa48("4710") ? "" : (stryCov_9fa48("4710"), 'unknown')
}));

/**
 * Row kind label distinguishing logical service summary rows
 * from individual replica rows in combined views.
 * @enum {string}
 */
const VIEW_ROW_KIND = Object.freeze(stryMutAct_9fa48("4711") ? {} : (stryCov_9fa48("4711"), {
  LOGICAL_SERVICE: stryMutAct_9fa48("4712") ? "" : (stryCov_9fa48("4712"), 'logical_service'),
  REPLICA: stryMutAct_9fa48("4713") ? "" : (stryCov_9fa48("4713"), 'replica')
}));

/**
 * Protocol URI scheme mapping for endpoint display.
 * Maps internal protocol identifiers to user-facing URI prefixes.
 * @enum {string}
 */
const PROTOCOL_URI_SCHEME = Object.freeze(stryMutAct_9fa48("4714") ? {} : (stryCov_9fa48("4714"), {
  POSTGRESQL: stryMutAct_9fa48("4715") ? "" : (stryCov_9fa48("4715"), 'postgresql://'),
  WEBSOCKET: stryMutAct_9fa48("4716") ? "" : (stryCov_9fa48("4716"), 'ws://')
}));

/**
 * Built-in runtime service IDs that must appear in
 * replica-oriented admin views.
 */
const BUILT_IN_RUNTIME_SERVICE_IDS = Object.freeze(stryMutAct_9fa48("4717") ? [] : (stryCov_9fa48("4717"), [META_SERVICE_ID.POSTGRES_WIRE, META_SERVICE_ID.ADMIN_META, META_SERVICE_ID.WASM_META]));

/**
 * Default port placeholder when endpoint port is unavailable.
 * @type {string}
 */
const PORT_UNKNOWN = stryMutAct_9fa48("4718") ? "" : (stryCov_9fa48("4718"), 'unknown');
export { LOGICAL_SERVICE_HEALTH, VIEW_ROW_KIND, PROTOCOL_URI_SCHEME, BUILT_IN_RUNTIME_SERVICE_IDS, PORT_UNKNOWN };