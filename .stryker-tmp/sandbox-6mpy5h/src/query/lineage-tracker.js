/**
 * LineageTracker — generates and attaches deterministic
 * lineage identifiers to stage artifacts and primitive
 * requests for retry deduplication.
 *
 * Requirements: 9.2
 * @module query/lineage-tracker
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
import { GUARDRAIL_FIELD as GF, LINEAGE_SEPARATOR } from './guardrail-constants.js';

/**
 * Tracks lineage for a single query execution. Generates
 * deterministic IDs from query ID, stage index, primitive
 * type, and sequence number.
 */
class LineageTracker {
  /**
   * @param {string} queryId - Unique query identifier.
   */
  constructor(queryId) {
    if (stryMutAct_9fa48("113204")) {
      {}
    } else {
      stryCov_9fa48("113204");
      this._queryId = queryId;
    }
  }

  /**
   * Generate a deterministic lineage ID.
   *
   * @param {number} stageIndex - Stage index within query.
   * @param {string} primitiveType - Primitive type name.
   * @param {number} sequenceNum - Sequence number within
   *   the stage and primitive type.
   * @return {string} Lineage ID string.
   */
  generateLineageId(stageIndex, primitiveType, sequenceNum) {
    if (stryMutAct_9fa48("113205")) {
      {}
    } else {
      stryCov_9fa48("113205");
      return (stryMutAct_9fa48("113206") ? [] : (stryCov_9fa48("113206"), [this._queryId, stageIndex, primitiveType, sequenceNum])).join(LINEAGE_SEPARATOR);
    }
  }

  /**
   * Attach a lineage ID to an artifact object.
   *
   * @param {Object} artifact - Object to attach lineage to.
   * @param {number} stageIndex - Stage index.
   * @param {string} primitiveType - Primitive type.
   * @param {number} sequenceNum - Sequence number.
   * @return {Object} The artifact with lineage ID set.
   */
  attachLineage(artifact, stageIndex, primitiveType, sequenceNum) {
    if (stryMutAct_9fa48("113207")) {
      {}
    } else {
      stryCov_9fa48("113207");
      artifact[GF.LINEAGE_ID] = this.generateLineageId(stageIndex, primitiveType, sequenceNum);
      return artifact;
    }
  }

  /**
   * Extract lineage ID from an artifact.
   *
   * @param {Object} artifact - Object to read lineage from.
   * @return {string|null} Lineage ID or null if absent.
   */
  extractLineage(artifact) {
    if (stryMutAct_9fa48("113208")) {
      {}
    } else {
      stryCov_9fa48("113208");
      return stryMutAct_9fa48("113209") ? artifact[GF.LINEAGE_ID] && null : (stryCov_9fa48("113209"), artifact[GF.LINEAGE_ID] ?? null);
    }
  }
}
export { LineageTracker };