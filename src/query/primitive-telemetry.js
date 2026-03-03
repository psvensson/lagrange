/**
 * Per-primitive telemetry counters and trace hooks.
 *
 * Tracks bytes, request counts, and latency per primitive
 * (lookup, emit, broadcast, useBroadcast) per query and tenant.
 *
 * Requirements: 5.5, 10.2, 10.3
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {PRIMITIVE_TYPE} from './distributed/distributed-context-constants.js';

const INITIAL_MIN_DURATION_MS = Infinity;

/**
 * Telemetry field names for counter snapshots.
 * @enum {string}
 */
const TELEMETRY_FIELD = Object.freeze({
  QUERY_ID: 'queryId',
  TENANT_ID: 'tenantId',
  PRIMITIVE: 'primitive',
  REQUEST_COUNT: 'requestCount',
  TOTAL_BYTES: 'totalBytes',
  TOTAL_DURATION_MS: 'totalDurationMs',
  MIN_DURATION_MS: 'minDurationMs',
  MAX_DURATION_MS: 'maxDurationMs',
});

/**
 * Telemetry error messages.
 * @enum {string}
 */
const TELEMETRY_ERROR_MSG = Object.freeze({
  QUERY_ID_REQUIRED: 'Query ID is required for telemetry',
  TENANT_ID_REQUIRED: 'Tenant ID is required for telemetry',
  PRIMITIVE_REQUIRED: 'Primitive type is required for telemetry',
  INVALID_PRIMITIVE: 'Invalid primitive type for telemetry',
});

/**
 * Set of valid primitive types for fast membership check.
 * @type {Set<string>}
 */
const VALID_PRIMITIVES = new Set([
  PRIMITIVE_TYPE.LOOKUP,
  PRIMITIVE_TYPE.EMIT,
  PRIMITIVE_TYPE.BROADCAST,
  PRIMITIVE_TYPE.USE_BROADCAST,
]);

/**
 * PrimitiveCounter — accumulates request count, bytes, and
 * latency for a single primitive type.
 */
class PrimitiveCounter {
  constructor() {
    this.requestCount = NUM.ZERO;
    this.totalBytes = NUM.ZERO;
    this.totalDurationMs = NUM.ZERO;
    this.minDurationMs = INITIAL_MIN_DURATION_MS;
    this.maxDurationMs = NUM.ZERO;
  }

  /**
   * Record a single primitive invocation.
   *
   * @param {number} bytes - Bytes transferred.
   * @param {number} durationMs - Latency in milliseconds.
   */
  record(bytes, durationMs) {
    this.requestCount += NUM.ONE;
    this.totalBytes += bytes;
    this.totalDurationMs += durationMs;
    if (durationMs < this.minDurationMs) {
      this.minDurationMs = durationMs;
    }
    if (durationMs > this.maxDurationMs) {
      this.maxDurationMs = durationMs;
    }
  }

  /**
   * Return a frozen snapshot of current counter values.
   *
   * @return {Readonly<Object>} Counter snapshot.
   */
  snapshot() {
    return Object.freeze({
      [TELEMETRY_FIELD.REQUEST_COUNT]: this.requestCount,
      [TELEMETRY_FIELD.TOTAL_BYTES]: this.totalBytes,
      [TELEMETRY_FIELD.TOTAL_DURATION_MS]: this.totalDurationMs,
      [TELEMETRY_FIELD.MIN_DURATION_MS]: this.requestCount > NUM.ZERO ?
        this.minDurationMs : NUM.ZERO,
      [TELEMETRY_FIELD.MAX_DURATION_MS]: this.maxDurationMs,
    });
  }
}

/**
 * PrimitiveTelemetry — per-query, per-tenant telemetry tracker
 * for all distributed movement primitives.
 *
 * Requirement 5.5: Record per-primitive bytes, request counts,
 * and latency metrics for each query and tenant.
 * Requirement 10.2: Unified metrics across execution paths.
 * Requirement 10.3: Per-query primitive usage in diagnostics.
 */
class PrimitiveTelemetry {
  /**
   * @param {Object} options - Telemetry options.
   * @param {string} options.queryId - Query identifier.
   * @param {string} options.tenantId - Tenant identifier.
   * @param {Function} [options.traceHook] - Optional hook called
   *   on every record() with (primitive, bytes, durationMs).
   */
  constructor(options = {}) {
    if (!options.queryId) {
      throw new Error(TELEMETRY_ERROR_MSG.QUERY_ID_REQUIRED);
    }
    if (!options.tenantId) {
      throw new Error(TELEMETRY_ERROR_MSG.TENANT_ID_REQUIRED);
    }

    this.queryId = options.queryId;
    this.tenantId = options.tenantId;
    this.traceHook = options.traceHook ?? null;

    this._counters = new Map();
    for (const prim of VALID_PRIMITIVES) {
      this._counters.set(prim, new PrimitiveCounter());
    }
  }

  /**
   * Record a primitive invocation.
   *
   * @param {string} primitive - Primitive type from PRIMITIVE_TYPE.
   * @param {number} bytes - Bytes transferred.
   * @param {number} durationMs - Latency in milliseconds.
   * @throws {Error} If primitive type is invalid.
   */
  record(primitive, bytes, durationMs) {
    if (!primitive) {
      throw new Error(TELEMETRY_ERROR_MSG.PRIMITIVE_REQUIRED);
    }
    if (!VALID_PRIMITIVES.has(primitive)) {
      throw new Error(TELEMETRY_ERROR_MSG.INVALID_PRIMITIVE);
    }

    this._counters.get(primitive).record(bytes, durationMs);

    if (typeof this.traceHook === TYPEOF.FUNCTION) {
      this.traceHook({
        queryId: this.queryId,
        tenantId: this.tenantId,
        primitive,
        bytes,
        durationMs,
      });
    }
  }

  /**
   * Get the counter snapshot for a specific primitive.
   *
   * @param {string} primitive - Primitive type.
   * @return {Readonly<Object>} Counter snapshot.
   */
  getCounter(primitive) {
    const counter = this._counters.get(primitive);
    if (!counter) {
      throw new Error(TELEMETRY_ERROR_MSG.INVALID_PRIMITIVE);
    }
    return counter.snapshot();
  }

  /**
   * Get a full diagnostics snapshot for all primitives.
   *
   * @return {Readonly<Object>} Full telemetry snapshot.
   */
  snapshot() {
    const primitives = {};
    for (const [prim, counter] of this._counters) {
      primitives[prim] = counter.snapshot();
    }

    return Object.freeze({
      [TELEMETRY_FIELD.QUERY_ID]: this.queryId,
      [TELEMETRY_FIELD.TENANT_ID]: this.tenantId,
      primitives: Object.freeze(primitives),
    });
  }

  /**
   * Create an onTelemetry callback bound to this tracker.
   * Suitable for passing to lookup/emit/broadcast primitives.
   *
   * @return {Function} Telemetry callback.
   */
  createCallback() {
    return (data) => {
      const primitive = data.primitive;
      const bytes = data.byteCount ?? data.recordBytes ?? NUM.ZERO;
      const durationMs = data.durationMs ?? NUM.ZERO;
      this.record(primitive, bytes, durationMs);
    };
  }
}

export {
  PrimitiveCounter,
  PrimitiveTelemetry,
  TELEMETRY_FIELD,
  TELEMETRY_ERROR_MSG,
  VALID_PRIMITIVES,
};
