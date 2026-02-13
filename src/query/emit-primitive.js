/**
 * Emit primitive — ctx.emit(key, value).
 *
 * Writes keyed intermediate records to engine-managed shuffle
 * streams. Applies queue quotas, backpressure, and spill-to-disk
 * controls. Defines retry/checkpoint boundaries by stage.
 *
 * Requirements: 5.1, 5.3, 9.1
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  EMIT_MAX_BYTES,
} from '../wasm-service/query-budget-constants.js';
import {
  EMIT_FIELD,
  EMIT_QUEUE_STATE,
  PRIMITIVE_ERROR_MSG,
  EMIT_QUEUE_HIGH_WATER_MARK,
  EMIT_SPILL_THRESHOLD_BYTES,
} from './distributed-context-constants.js';
import {
  GUARDRAIL_FIELD as GF,
} from './guardrail-constants.js';

/**
 * Validate emit arguments.
 *
 * @param {Uint8Array|string} key - Partition/shuffle key.
 * @param {Uint8Array} value - Record payload.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateEmitArgs(key, value) {
  if (key === undefined || key === null) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED};
  }
  if (typeof key !== TYPEOF.STRING && !(key instanceof Uint8Array)) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED};
  }
  if (value === undefined || value === null) {
    return {valid: false, error: PRIMITIVE_ERROR_MSG.EMIT_VALUE_REQUIRED};
  }
  if (!(value instanceof Uint8Array)) {
    return {
      valid: false,
      error: PRIMITIVE_ERROR_MSG.EMIT_VALUE_MUST_BE_UINT8ARRAY,
    };
  }
  return {valid: true, error: null};
}

/**
 * Compute byte size of an emit record (key + value).
 *
 * @param {Uint8Array|string} key - Partition/shuffle key.
 * @param {Uint8Array} value - Record payload.
 * @return {number} Total byte size.
 */
function computeEmitRecordBytes(key, value) {
  const keyBytes = typeof key === TYPEOF.STRING ?
    key.length : key.byteLength;
  return keyBytes + value.byteLength;
}

/**
 * ShuffleBuffer — bounded in-memory buffer for emitted records
 * with backpressure and spill-to-disk support.
 *
 * Tracks total emitted bytes against the query budget and
 * transitions through queue states as thresholds are crossed.
 */
class ShuffleBuffer {
  /**
   * @param {Object} [options] - Buffer options.
   * @param {number} [options.maxBytes] - Max emitted bytes budget.
   * @param {number} [options.highWaterMark] - Record count for
   *   backpressure trigger.
   * @param {number} [options.spillThresholdBytes] - Byte threshold
   *   for spill-to-disk.
   * @param {Function} [options.onSpill] - Async callback invoked
   *   when spill threshold is reached. Receives buffered records.
   * @param {Function} [options.onTelemetry] - Telemetry callback.
   * @param {Object} [options.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs to emit records.
   * @param {number} [options.stageIndex] - Stage index for
   *   lineage ID generation.
   */
  constructor(options = {}) {
    this.maxBytes = options.maxBytes ?? EMIT_MAX_BYTES;
    this.highWaterMark = options.highWaterMark ??
      EMIT_QUEUE_HIGH_WATER_MARK;
    this.spillThresholdBytes = options.spillThresholdBytes ??
      EMIT_SPILL_THRESHOLD_BYTES;
    this.onSpill = options.onSpill ?? null;
    this.onTelemetry = options.onTelemetry ?? null;
    this.lineageTracker = options.lineageTracker ?? null;
    this.stageIndex = options.stageIndex ?? NUM.ZERO;

    this.records = [];
    this.totalBytes = NUM.ZERO;
    this.totalRecords = NUM.ZERO;
    this.spillCount = NUM.ZERO;
    this.state = EMIT_QUEUE_STATE.ACCEPTING;
  }

  /**
   * Emit a keyed record into the shuffle buffer.
   *
   * Requirement 5.3: Engine-managed shuffle/group stage with
   * quota-aware buffering and backpressure.
   * Requirement 9.1: Enforce emitted intermediate byte limits.
   *
   * @param {Uint8Array|string} key - Partition/shuffle key.
   * @param {Uint8Array} value - Record payload.
   * @return {Promise<Object>} Emit result with buffer state.
   * @throws {Error} On validation failure or budget exceeded.
   */
  async emit(key, value) {
    if (this.state === EMIT_QUEUE_STATE.CLOSED) {
      throw new Error(PRIMITIVE_ERROR_MSG.EMIT_QUEUE_CLOSED);
    }

    const validation = validateEmitArgs(key, value);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const recordBytes = computeEmitRecordBytes(key, value);

    // Check total budget
    if (this.totalBytes + recordBytes > this.maxBytes) {
      this.state = EMIT_QUEUE_STATE.CLOSED;
      throw new Error(PRIMITIVE_ERROR_MSG.EMIT_MAX_BYTES_EXCEEDED);
    }

    // Add record
    const record = {
      [EMIT_FIELD.KEY]: key,
      [EMIT_FIELD.VALUE]: value,
      [EMIT_FIELD.BYTE_COUNT]: recordBytes,
    };

    if (this.lineageTracker) {
      this.lineageTracker.attachLineage(
        record, this.stageIndex, 'emit',
        this.totalRecords,
      );
    }

    this.records.push(record);
    this.totalBytes += recordBytes;
    this.totalRecords += NUM.ONE;

    // Check spill threshold
    if (this.totalBytes >= this.spillThresholdBytes &&
        this.state !== EMIT_QUEUE_STATE.SPILLING) {
      await this._spill();
    }

    // Check backpressure
    const backpressure = this.records.length >= this.highWaterMark;
    if (backpressure &&
        this.state === EMIT_QUEUE_STATE.ACCEPTING) {
      this.state = EMIT_QUEUE_STATE.BACKPRESSURE;
    }

    // Report telemetry
    if (typeof this.onTelemetry === TYPEOF.FUNCTION) {
      this.onTelemetry({
        primitive: 'emit',
        recordBytes,
        totalBytes: this.totalBytes,
        totalRecords: this.totalRecords,
        queueSize: this.records.length,
        state: this.state,
      });
    }

    return {
      [EMIT_FIELD.BYTE_COUNT]: recordBytes,
      [EMIT_FIELD.QUEUE_SIZE]: this.records.length,
      [EMIT_FIELD.SPILLED]: this.spillCount > NUM.ZERO,
      [EMIT_FIELD.BACKPRESSURE]: backpressure,
    };
  }

  /**
   * Drain all buffered records.
   *
   * @return {Array<Object>} Buffered records.
   */
  drain() {
    const drained = this.records;
    this.records = [];
    return drained;
  }

  /**
   * Close the buffer. No more records can be emitted.
   *
   * @return {{totalBytes: number, totalRecords: number,
   *   spillCount: number, state: string}} Final summary.
   */
  close() {
    this.state = EMIT_QUEUE_STATE.CLOSED;
    return {
      totalBytes: this.totalBytes,
      totalRecords: this.totalRecords,
      spillCount: this.spillCount,
      state: this.state,
    };
  }

  /**
   * Spill buffered records to disk via the onSpill callback.
   *
   * @return {Promise<void>}
   * @private
   */
  async _spill() {
    if (!this.onSpill) return;

    const prevState = this.state;
    this.state = EMIT_QUEUE_STATE.SPILLING;

    const toSpill = this.records;
    this.records = [];
    this.spillCount += NUM.ONE;

    await this.onSpill(toSpill);

    // Restore to accepting if not closed
    if (this.state === EMIT_QUEUE_STATE.SPILLING) {
      this.state = prevState === EMIT_QUEUE_STATE.CLOSED ?
        EMIT_QUEUE_STATE.CLOSED :
        EMIT_QUEUE_STATE.ACCEPTING;
    }
  }
}

export {
  validateEmitArgs,
  computeEmitRecordBytes,
  ShuffleBuffer,
};
