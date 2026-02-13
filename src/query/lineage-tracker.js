/**
 * LineageTracker — generates and attaches deterministic
 * lineage identifiers to stage artifacts and primitive
 * requests for retry deduplication.
 *
 * Requirements: 9.2
 * @module query/lineage-tracker
 */

import {
  GUARDRAIL_FIELD as GF,
  LINEAGE_SEPARATOR,
} from './guardrail-constants.js';

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
    this._queryId = queryId;
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
    return [
      this._queryId,
      stageIndex,
      primitiveType,
      sequenceNum,
    ].join(LINEAGE_SEPARATOR);
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
  attachLineage(artifact, stageIndex, primitiveType,
    sequenceNum) {
    artifact[GF.LINEAGE_ID] = this.generateLineageId(
      stageIndex, primitiveType, sequenceNum,
    );
    return artifact;
  }

  /**
   * Extract lineage ID from an artifact.
   *
   * @param {Object} artifact - Object to read lineage from.
   * @return {string|null} Lineage ID or null if absent.
   */
  extractLineage(artifact) {
    return artifact[GF.LINEAGE_ID] ?? null;
  }
}

export {LineageTracker};
