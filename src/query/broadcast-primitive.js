/**
 * Broadcast primitive — ctx.broadcast(ref, dataset) and
 * ctx.useBroadcast(ref).
 *
 * Replicates a small versioned dataset to all participating
 * partitions for local joins. Enforces hard size caps before
 * publish and materializes a local cached view.
 *
 * Requirements: 5.1, 5.4
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  BROADCAST_MAX_PAYLOAD_BYTES,
} from '../wasm-service/query-budget-constants.js';
import {
  BROADCAST_FIELD,
  PRIMITIVE_ERROR_MSG,
  PRIMITIVE_TYPE,
} from './distributed/distributed-context-constants.js';
import {
  GUARDRAIL_FIELD as GF,
} from './guardrail-constants.js';

/**
 * Validate broadcast publish arguments.
 *
 * @param {string} ref - Broadcast reference string.
 * @param {Object} dataset - Broadcast payload with version.
 * @param {Object} [budgets] - Budget overrides.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateBroadcastArgs(ref, dataset, budgets) {
  if (!ref) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED,
    };
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_MUST_BE_STRING,
    };
  }
  if (!dataset) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_PAYLOAD_REQUIRED,
    };
  }
  if (dataset[BROADCAST_FIELD.VERSION] === undefined ||
      dataset[BROADCAST_FIELD.VERSION] === null) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_VERSION_REQUIRED,
    };
  }

  const payloadBytes = estimateBroadcastBytes(dataset);
  const maxBytes = budgets?.BROADCAST_MAX_PAYLOAD_BYTES ??
    BROADCAST_MAX_PAYLOAD_BYTES;
  if (payloadBytes > maxBytes) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED,
    };
  }

  return {valid: true, error: null};
}

/**
 * Validate useBroadcast arguments.
 *
 * @param {string} ref - Broadcast reference string.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateUseBroadcastArgs(ref) {
  if (!ref) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED,
    };
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_MUST_BE_STRING,
    };
  }
  return {valid: true, error: null};
}

/**
 * Estimate byte size of a broadcast dataset.
 *
 * @param {Object} dataset - Broadcast payload.
 * @return {number} Estimated byte count.
 */
function estimateBroadcastBytes(dataset) {
  if (!dataset) return NUM.ZERO;
  return JSON.stringify(dataset).length;
}

/**
 * BroadcastStore — versioned in-memory store for broadcast
 * datasets. Each ref maps to a versioned, size-capped payload.
 *
 * Provides publish (broadcast) and retrieve (useBroadcast)
 * operations with version tagging and hard size enforcement.
 */
class BroadcastStore {
  /**
   * @param {Object} [options] - Store options.
   * @param {number} [options.maxPayloadBytes] - Hard size cap.
   * @param {Function} [options.onTelemetry] - Telemetry callback.
   * @param {Object} [options.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs.
   * @param {number} [options.stageIndex] - Stage index for
   *   lineage ID generation.
   */
  constructor(options = {}) {
    this.maxPayloadBytes = options.maxPayloadBytes ??
      BROADCAST_MAX_PAYLOAD_BYTES;
    this.onTelemetry = options.onTelemetry ?? null;
    this.lineageTracker = options.lineageTracker ?? null;
    this.stageIndex = options.stageIndex ?? NUM.ZERO;
    this._store = new Map();
    this._broadcastSeq = NUM.ZERO;
  }

  /**
   * Publish a versioned broadcast dataset.
   *
   * Requirement 5.4: Broadcast datasets must be versioned and
   * below a hard server-enforced size limit.
   *
   * @param {string} ref - Broadcast reference string.
   * @param {Object} dataset - Payload with version field.
   * @return {Object} Broadcast descriptor with metadata.
   * @throws {Error} On validation failure or size exceeded.
   */
  broadcast(ref, dataset) {
    const validation = validateBroadcastArgs(
      ref,
      dataset,
      {BROADCAST_MAX_PAYLOAD_BYTES: this.maxPayloadBytes},
    );
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const byteCount = estimateBroadcastBytes(dataset);
    const timestamp = Date.now();

    const descriptor = {
      [BROADCAST_FIELD.REF]: ref,
      [BROADCAST_FIELD.VERSION]: dataset[BROADCAST_FIELD.VERSION],
      [BROADCAST_FIELD.PAYLOAD]: dataset,
      [BROADCAST_FIELD.BYTE_COUNT]: byteCount,
      [BROADCAST_FIELD.TIMESTAMP]: timestamp,
    };

    if (this.lineageTracker) {
      this.lineageTracker.attachLineage(
        descriptor, this.stageIndex, PRIMITIVE_TYPE.BROADCAST,
        this._broadcastSeq,
      );
      this._broadcastSeq += NUM.ONE;
    }

    this._store.set(ref, descriptor);

    if (typeof this.onTelemetry === TYPEOF.FUNCTION) {
      this.onTelemetry({
        primitive: PRIMITIVE_TYPE.BROADCAST,
        ref,
        version: dataset[BROADCAST_FIELD.VERSION],
        byteCount,
        timestamp,
      });
    }

    return {
      [BROADCAST_FIELD.REF]: ref,
      [BROADCAST_FIELD.VERSION]: dataset[BROADCAST_FIELD.VERSION],
      [BROADCAST_FIELD.BYTE_COUNT]: byteCount,
    };
  }

  /**
   * Retrieve a previously broadcast dataset by reference.
   *
   * Materializes a local cached view for the caller.
   *
   * @param {string} ref - Broadcast reference string.
   * @return {Object} Broadcast view with payload and metadata.
   * @throws {Error} If ref is invalid or not found.
   */
  useBroadcast(ref) {
    const validation = validateUseBroadcastArgs(ref);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const descriptor = this._store.get(ref);
    if (!descriptor) {
      throw new Error(PRIMITIVE_ERROR_MSG.BROADCAST_REF_NOT_FOUND);
    }

    if (typeof this.onTelemetry === TYPEOF.FUNCTION) {
      this.onTelemetry({
        primitive: PRIMITIVE_TYPE.USE_BROADCAST,
        ref,
        version: descriptor[BROADCAST_FIELD.VERSION],
        byteCount: descriptor[BROADCAST_FIELD.BYTE_COUNT],
      });
    }

    const view = {
      [BROADCAST_FIELD.REF]: descriptor[BROADCAST_FIELD.REF],
      [BROADCAST_FIELD.VERSION]:
        descriptor[BROADCAST_FIELD.VERSION],
      [BROADCAST_FIELD.PAYLOAD]:
        descriptor[BROADCAST_FIELD.PAYLOAD],
      [BROADCAST_FIELD.BYTE_COUNT]:
        descriptor[BROADCAST_FIELD.BYTE_COUNT],
    };

    if (descriptor[GF.LINEAGE_ID] !== undefined) {
      view[GF.LINEAGE_ID] = descriptor[GF.LINEAGE_ID];
    }

    return view;
  }

  /**
   * Check whether a broadcast ref exists.
   *
   * @param {string} ref - Broadcast reference string.
   * @return {boolean} True if ref is stored.
   */
  has(ref) {
    return this._store.has(ref);
  }

  /**
   * Remove a broadcast ref from the store.
   *
   * @param {string} ref - Broadcast reference string.
   * @return {boolean} True if ref was removed.
   */
  delete(ref) {
    return this._store.delete(ref);
  }

  /**
   * Clear all stored broadcasts.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Get the number of stored broadcasts.
   *
   * @return {number} Store size.
   */
  get size() {
    return this._store.size;
  }
}

export {
  validateBroadcastArgs,
  validateUseBroadcastArgs,
  estimateBroadcastBytes,
  BroadcastStore,
};
