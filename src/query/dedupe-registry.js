/**
 * DedupeRegistry — tracks completed operations by composite
 * key of lineage ID + stage ID to support retry
 * deduplication. On retry, returns cached results instead
 * of re-executing.
 *
 * Requirements: 9.3
 * @module query/dedupe-registry
 */

import {
  DEDUPE_RESULT_FIELD as DF,
  DEDUPE_KEY_SEPARATOR,
} from './guardrail-constants.js';

/**
 * Build a composite dedupe key from lineage ID and stage ID.
 *
 * @param {string} lineageId - Lineage identifier.
 * @param {string|number} stageId - Stage identifier.
 * @return {string} Composite key.
 */
function buildDedupeKey(lineageId, stageId) {
  return `${lineageId}${DEDUPE_KEY_SEPARATOR}${stageId}`;
}

/**
 * Registry of completed operations keyed by composite
 * lineage ID + stage ID.
 */
class DedupeRegistry {
  constructor() {
    /** @type {Map<string, Object>} */
    this._entries = new Map();
  }

  /**
   * Register a completed operation result by composite key.
   *
   * @param {string} lineageId - Lineage identifier.
   * @param {string|number} stageId - Stage identifier.
   * @param {*} result - Operation result to cache.
   */
  register(lineageId, stageId, result) {
    const key = buildDedupeKey(lineageId, stageId);
    this._entries.set(key, {
      [DF.LINEAGE_ID]: lineageId,
      [DF.STAGE_ID]: stageId,
      [DF.RESULT]: result,
      [DF.TIMESTAMP]: Date.now(),
    });
  }

  /**
   * Check if a lineage ID + stage ID was already processed.
   *
   * @param {string} lineageId - Lineage identifier.
   * @param {string|number} stageId - Stage identifier.
   * @return {boolean} True if duplicate.
   */
  isDuplicate(lineageId, stageId) {
    return this._entries.has(
      buildDedupeKey(lineageId, stageId),
    );
  }

  /**
   * Get cached result for a lineage ID + stage ID.
   *
   * @param {string} lineageId - Lineage identifier.
   * @param {string|number} stageId - Stage identifier.
   * @return {*} Stored result or null if not found.
   */
  getResult(lineageId, stageId) {
    const entry = this._entries.get(
      buildDedupeKey(lineageId, stageId),
    );
    return entry ? entry[DF.RESULT] : null;
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._entries.clear();
  }

  /**
   * Get number of registered entries.
   *
   * @return {number} Entry count.
   */
  size() {
    return this._entries.size;
  }
}

export {DedupeRegistry, buildDedupeKey};
