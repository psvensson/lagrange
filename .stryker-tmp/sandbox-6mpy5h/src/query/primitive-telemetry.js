/**
 * Per-primitive telemetry counters and trace hooks.
 *
 * Tracks bytes, request counts, and latency per primitive
 * (lookup, emit, broadcast, useBroadcast) per query and tenant.
 *
 * Requirements: 5.5, 10.2, 10.3
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
import { NUM, TYPEOF } from '../constants/index.js';
import { PRIMITIVE_TYPE } from './distributed/distributed-context-constants.js';
const INITIAL_MIN_DURATION_MS = Infinity;

/**
 * Telemetry field names for counter snapshots.
 * @enum {string}
 */
const TELEMETRY_FIELD = Object.freeze(stryMutAct_9fa48("114355") ? {} : (stryCov_9fa48("114355"), {
  QUERY_ID: stryMutAct_9fa48("114356") ? "" : (stryCov_9fa48("114356"), 'queryId'),
  TENANT_ID: stryMutAct_9fa48("114357") ? "" : (stryCov_9fa48("114357"), 'tenantId'),
  PRIMITIVE: stryMutAct_9fa48("114358") ? "" : (stryCov_9fa48("114358"), 'primitive'),
  REQUEST_COUNT: stryMutAct_9fa48("114359") ? "" : (stryCov_9fa48("114359"), 'requestCount'),
  TOTAL_BYTES: stryMutAct_9fa48("114360") ? "" : (stryCov_9fa48("114360"), 'totalBytes'),
  TOTAL_DURATION_MS: stryMutAct_9fa48("114361") ? "" : (stryCov_9fa48("114361"), 'totalDurationMs'),
  MIN_DURATION_MS: stryMutAct_9fa48("114362") ? "" : (stryCov_9fa48("114362"), 'minDurationMs'),
  MAX_DURATION_MS: stryMutAct_9fa48("114363") ? "" : (stryCov_9fa48("114363"), 'maxDurationMs')
}));

/**
 * Telemetry error messages.
 * @enum {string}
 */
const TELEMETRY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("114364") ? {} : (stryCov_9fa48("114364"), {
  QUERY_ID_REQUIRED: stryMutAct_9fa48("114365") ? "" : (stryCov_9fa48("114365"), 'Query ID is required for telemetry'),
  TENANT_ID_REQUIRED: stryMutAct_9fa48("114366") ? "" : (stryCov_9fa48("114366"), 'Tenant ID is required for telemetry'),
  PRIMITIVE_REQUIRED: stryMutAct_9fa48("114367") ? "" : (stryCov_9fa48("114367"), 'Primitive type is required for telemetry'),
  INVALID_PRIMITIVE: stryMutAct_9fa48("114368") ? "" : (stryCov_9fa48("114368"), 'Invalid primitive type for telemetry')
}));

/**
 * Set of valid primitive types for fast membership check.
 * @type {Set<string>}
 */
const VALID_PRIMITIVES = new Set(stryMutAct_9fa48("114369") ? [] : (stryCov_9fa48("114369"), [PRIMITIVE_TYPE.LOOKUP, PRIMITIVE_TYPE.EMIT, PRIMITIVE_TYPE.BROADCAST, PRIMITIVE_TYPE.USE_BROADCAST]));

/**
 * PrimitiveCounter — accumulates request count, bytes, and
 * latency for a single primitive type.
 */
class PrimitiveCounter {
  constructor() {
    if (stryMutAct_9fa48("114370")) {
      {}
    } else {
      stryCov_9fa48("114370");
      this.requestCount = NUM.ZERO;
      this.totalBytes = NUM.ZERO;
      this.totalDurationMs = NUM.ZERO;
      this.minDurationMs = INITIAL_MIN_DURATION_MS;
      this.maxDurationMs = NUM.ZERO;
    }
  }

  /**
   * Record a single primitive invocation.
   *
   * @param {number} bytes - Bytes transferred.
   * @param {number} durationMs - Latency in milliseconds.
   */
  record(bytes, durationMs) {
    if (stryMutAct_9fa48("114371")) {
      {}
    } else {
      stryCov_9fa48("114371");
      stryMutAct_9fa48("114372") ? this.requestCount -= NUM.ONE : (stryCov_9fa48("114372"), this.requestCount += NUM.ONE);
      stryMutAct_9fa48("114373") ? this.totalBytes -= bytes : (stryCov_9fa48("114373"), this.totalBytes += bytes);
      stryMutAct_9fa48("114374") ? this.totalDurationMs -= durationMs : (stryCov_9fa48("114374"), this.totalDurationMs += durationMs);
      if (stryMutAct_9fa48("114378") ? durationMs >= this.minDurationMs : stryMutAct_9fa48("114377") ? durationMs <= this.minDurationMs : stryMutAct_9fa48("114376") ? false : stryMutAct_9fa48("114375") ? true : (stryCov_9fa48("114375", "114376", "114377", "114378"), durationMs < this.minDurationMs)) {
        if (stryMutAct_9fa48("114379")) {
          {}
        } else {
          stryCov_9fa48("114379");
          this.minDurationMs = durationMs;
        }
      }
      if (stryMutAct_9fa48("114383") ? durationMs <= this.maxDurationMs : stryMutAct_9fa48("114382") ? durationMs >= this.maxDurationMs : stryMutAct_9fa48("114381") ? false : stryMutAct_9fa48("114380") ? true : (stryCov_9fa48("114380", "114381", "114382", "114383"), durationMs > this.maxDurationMs)) {
        if (stryMutAct_9fa48("114384")) {
          {}
        } else {
          stryCov_9fa48("114384");
          this.maxDurationMs = durationMs;
        }
      }
    }
  }

  /**
   * Return a frozen snapshot of current counter values.
   *
   * @return {Readonly<Object>} Counter snapshot.
   */
  snapshot() {
    if (stryMutAct_9fa48("114385")) {
      {}
    } else {
      stryCov_9fa48("114385");
      return Object.freeze(stryMutAct_9fa48("114386") ? {} : (stryCov_9fa48("114386"), {
        [TELEMETRY_FIELD.REQUEST_COUNT]: this.requestCount,
        [TELEMETRY_FIELD.TOTAL_BYTES]: this.totalBytes,
        [TELEMETRY_FIELD.TOTAL_DURATION_MS]: this.totalDurationMs,
        [TELEMETRY_FIELD.MIN_DURATION_MS]: (stryMutAct_9fa48("114390") ? this.requestCount <= NUM.ZERO : stryMutAct_9fa48("114389") ? this.requestCount >= NUM.ZERO : stryMutAct_9fa48("114388") ? false : stryMutAct_9fa48("114387") ? true : (stryCov_9fa48("114387", "114388", "114389", "114390"), this.requestCount > NUM.ZERO)) ? this.minDurationMs : NUM.ZERO,
        [TELEMETRY_FIELD.MAX_DURATION_MS]: this.maxDurationMs
      }));
    }
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
    if (stryMutAct_9fa48("114391")) {
      {}
    } else {
      stryCov_9fa48("114391");
      if (stryMutAct_9fa48("114394") ? false : stryMutAct_9fa48("114393") ? true : stryMutAct_9fa48("114392") ? options.queryId : (stryCov_9fa48("114392", "114393", "114394"), !options.queryId)) {
        if (stryMutAct_9fa48("114395")) {
          {}
        } else {
          stryCov_9fa48("114395");
          throw new Error(TELEMETRY_ERROR_MSG.QUERY_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("114398") ? false : stryMutAct_9fa48("114397") ? true : stryMutAct_9fa48("114396") ? options.tenantId : (stryCov_9fa48("114396", "114397", "114398"), !options.tenantId)) {
        if (stryMutAct_9fa48("114399")) {
          {}
        } else {
          stryCov_9fa48("114399");
          throw new Error(TELEMETRY_ERROR_MSG.TENANT_ID_REQUIRED);
        }
      }
      this.queryId = options.queryId;
      this.tenantId = options.tenantId;
      this.traceHook = stryMutAct_9fa48("114400") ? options.traceHook && null : (stryCov_9fa48("114400"), options.traceHook ?? null);
      this._counters = new Map();
      for (const prim of VALID_PRIMITIVES) {
        if (stryMutAct_9fa48("114401")) {
          {}
        } else {
          stryCov_9fa48("114401");
          this._counters.set(prim, new PrimitiveCounter());
        }
      }
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
    if (stryMutAct_9fa48("114402")) {
      {}
    } else {
      stryCov_9fa48("114402");
      if (stryMutAct_9fa48("114405") ? false : stryMutAct_9fa48("114404") ? true : stryMutAct_9fa48("114403") ? primitive : (stryCov_9fa48("114403", "114404", "114405"), !primitive)) {
        if (stryMutAct_9fa48("114406")) {
          {}
        } else {
          stryCov_9fa48("114406");
          throw new Error(TELEMETRY_ERROR_MSG.PRIMITIVE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("114409") ? false : stryMutAct_9fa48("114408") ? true : stryMutAct_9fa48("114407") ? VALID_PRIMITIVES.has(primitive) : (stryCov_9fa48("114407", "114408", "114409"), !VALID_PRIMITIVES.has(primitive))) {
        if (stryMutAct_9fa48("114410")) {
          {}
        } else {
          stryCov_9fa48("114410");
          throw new Error(TELEMETRY_ERROR_MSG.INVALID_PRIMITIVE);
        }
      }
      this._counters.get(primitive).record(bytes, durationMs);
      if (stryMutAct_9fa48("114413") ? typeof this.traceHook !== TYPEOF.FUNCTION : stryMutAct_9fa48("114412") ? false : stryMutAct_9fa48("114411") ? true : (stryCov_9fa48("114411", "114412", "114413"), typeof this.traceHook === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("114414")) {
          {}
        } else {
          stryCov_9fa48("114414");
          this.traceHook(stryMutAct_9fa48("114415") ? {} : (stryCov_9fa48("114415"), {
            queryId: this.queryId,
            tenantId: this.tenantId,
            primitive,
            bytes,
            durationMs
          }));
        }
      }
    }
  }

  /**
   * Get the counter snapshot for a specific primitive.
   *
   * @param {string} primitive - Primitive type.
   * @return {Readonly<Object>} Counter snapshot.
   */
  getCounter(primitive) {
    if (stryMutAct_9fa48("114416")) {
      {}
    } else {
      stryCov_9fa48("114416");
      const counter = this._counters.get(primitive);
      if (stryMutAct_9fa48("114419") ? false : stryMutAct_9fa48("114418") ? true : stryMutAct_9fa48("114417") ? counter : (stryCov_9fa48("114417", "114418", "114419"), !counter)) {
        if (stryMutAct_9fa48("114420")) {
          {}
        } else {
          stryCov_9fa48("114420");
          throw new Error(TELEMETRY_ERROR_MSG.INVALID_PRIMITIVE);
        }
      }
      return counter.snapshot();
    }
  }

  /**
   * Get a full diagnostics snapshot for all primitives.
   *
   * @return {Readonly<Object>} Full telemetry snapshot.
   */
  snapshot() {
    if (stryMutAct_9fa48("114421")) {
      {}
    } else {
      stryCov_9fa48("114421");
      const primitives = {};
      for (const [prim, counter] of this._counters) {
        if (stryMutAct_9fa48("114422")) {
          {}
        } else {
          stryCov_9fa48("114422");
          primitives[prim] = counter.snapshot();
        }
      }
      return Object.freeze(stryMutAct_9fa48("114423") ? {} : (stryCov_9fa48("114423"), {
        [TELEMETRY_FIELD.QUERY_ID]: this.queryId,
        [TELEMETRY_FIELD.TENANT_ID]: this.tenantId,
        primitives: Object.freeze(primitives)
      }));
    }
  }

  /**
   * Create an onTelemetry callback bound to this tracker.
   * Suitable for passing to lookup/emit/broadcast primitives.
   *
   * @return {Function} Telemetry callback.
   */
  createCallback() {
    if (stryMutAct_9fa48("114424")) {
      {}
    } else {
      stryCov_9fa48("114424");
      return data => {
        if (stryMutAct_9fa48("114425")) {
          {}
        } else {
          stryCov_9fa48("114425");
          const primitive = data.primitive;
          const bytes = stryMutAct_9fa48("114426") ? (data.byteCount ?? data.recordBytes) && NUM.ZERO : (stryCov_9fa48("114426"), (stryMutAct_9fa48("114427") ? data.byteCount && data.recordBytes : (stryCov_9fa48("114427"), data.byteCount ?? data.recordBytes)) ?? NUM.ZERO);
          const durationMs = stryMutAct_9fa48("114428") ? data.durationMs && NUM.ZERO : (stryCov_9fa48("114428"), data.durationMs ?? NUM.ZERO);
          this.record(primitive, bytes, durationMs);
        }
      };
    }
  }
}
export { PrimitiveCounter, PrimitiveTelemetry, TELEMETRY_FIELD, TELEMETRY_ERROR_MSG, VALID_PRIMITIVES };