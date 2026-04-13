/**
 * DedupeRegistry — tracks completed operations by composite
 * key of lineage ID + stage ID to support retry
 * deduplication. On retry, returns cached results instead
 * of re-executing.
 *
 * Requirements: 9.3
 * @module query/dedupe-registry
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
import { DEDUPE_RESULT_FIELD as DF, DEDUPE_KEY_SEPARATOR } from './guardrail-constants.js';

/**
 * Build a composite dedupe key from lineage ID and stage ID.
 *
 * @param {string} lineageId - Lineage identifier.
 * @param {string|number} stageId - Stage identifier.
 * @return {string} Composite key.
 */
function buildDedupeKey(lineageId, stageId) {
  if (stryMutAct_9fa48("110124")) {
    {}
  } else {
    stryCov_9fa48("110124");
    return stryMutAct_9fa48("110125") ? `` : (stryCov_9fa48("110125"), `${lineageId}${DEDUPE_KEY_SEPARATOR}${stageId}`);
  }
}

/**
 * Registry of completed operations keyed by composite
 * lineage ID + stage ID.
 */
class DedupeRegistry {
  constructor() {
    if (stryMutAct_9fa48("110126")) {
      {}
    } else {
      stryCov_9fa48("110126");
      /** @type {Map<string, Object>} */
      this._entries = new Map();
    }
  }

  /**
   * Register a completed operation result by composite key.
   *
   * @param {string} lineageId - Lineage identifier.
   * @param {string|number} stageId - Stage identifier.
   * @param {*} result - Operation result to cache.
   */
  register(lineageId, stageId, result) {
    if (stryMutAct_9fa48("110127")) {
      {}
    } else {
      stryCov_9fa48("110127");
      const key = buildDedupeKey(lineageId, stageId);
      this._entries.set(key, stryMutAct_9fa48("110128") ? {} : (stryCov_9fa48("110128"), {
        [DF.LINEAGE_ID]: lineageId,
        [DF.STAGE_ID]: stageId,
        [DF.RESULT]: result,
        [DF.TIMESTAMP]: Date.now()
      }));
    }
  }

  /**
   * Check if a lineage ID + stage ID was already processed.
   *
   * @param {string} lineageId - Lineage identifier.
   * @param {string|number} stageId - Stage identifier.
   * @return {boolean} True if duplicate.
   */
  isDuplicate(lineageId, stageId) {
    if (stryMutAct_9fa48("110129")) {
      {}
    } else {
      stryCov_9fa48("110129");
      return this._entries.has(buildDedupeKey(lineageId, stageId));
    }
  }

  /**
   * Get cached result for a lineage ID + stage ID.
   *
   * @param {string} lineageId - Lineage identifier.
   * @param {string|number} stageId - Stage identifier.
   * @return {*} Stored result or null if not found.
   */
  getResult(lineageId, stageId) {
    if (stryMutAct_9fa48("110130")) {
      {}
    } else {
      stryCov_9fa48("110130");
      const entry = this._entries.get(buildDedupeKey(lineageId, stageId));
      return entry ? entry[DF.RESULT] : null;
    }
  }

  /**
   * Clear all entries.
   */
  clear() {
    if (stryMutAct_9fa48("110131")) {
      {}
    } else {
      stryCov_9fa48("110131");
      this._entries.clear();
    }
  }

  /**
   * Get number of registered entries.
   *
   * @return {number} Entry count.
   */
  size() {
    if (stryMutAct_9fa48("110132")) {
      {}
    } else {
      stryCov_9fa48("110132");
      return this._entries.size;
    }
  }
}
export { DedupeRegistry, buildDedupeKey };