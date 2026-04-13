/**
 * Constants for distributed movement primitives.
 *
 * Defines field names, error messages, and configuration for
 * ctx.lookup, ctx.emit, ctx.broadcast, and ctx.useBroadcast.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
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
import { NUM } from '../../constants/index.js';

/**
 * Primitive type identifiers for telemetry and logging.
 * @enum {string}
 */
const PRIMITIVE_TYPE = Object.freeze(stryMutAct_9fa48("110133") ? {} : (stryCov_9fa48("110133"), {
  LOOKUP: stryMutAct_9fa48("110134") ? "" : (stryCov_9fa48("110134"), 'lookup'),
  EMIT: stryMutAct_9fa48("110135") ? "" : (stryCov_9fa48("110135"), 'emit'),
  BROADCAST: stryMutAct_9fa48("110136") ? "" : (stryCov_9fa48("110136"), 'broadcast'),
  USE_BROADCAST: stryMutAct_9fa48("110137") ? "" : (stryCov_9fa48("110137"), 'useBroadcast')
}));

/**
 * Allowed access path types for lookup operations.
 * Only pk, unique, or bounded-index access is permitted.
 * @enum {string}
 */
const LOOKUP_ACCESS_PATH = Object.freeze(stryMutAct_9fa48("110138") ? {} : (stryCov_9fa48("110138"), {
  PRIMARY_KEY: stryMutAct_9fa48("110139") ? "" : (stryCov_9fa48("110139"), 'primary_key'),
  UNIQUE_INDEX: stryMutAct_9fa48("110140") ? "" : (stryCov_9fa48("110140"), 'unique_index'),
  BOUNDED_INDEX: stryMutAct_9fa48("110141") ? "" : (stryCov_9fa48("110141"), 'bounded_index')
}));

/**
 * Field names for lookup key-value objects.
 * @enum {string}
 */
const LOOKUP_KEY_FIELD = Object.freeze(stryMutAct_9fa48("110142") ? {} : (stryCov_9fa48("110142"), {
  COLUMN: stryMutAct_9fa48("110143") ? "" : (stryCov_9fa48("110143"), 'column'),
  VALUE: stryMutAct_9fa48("110144") ? "" : (stryCov_9fa48("110144"), 'value')
}));

/**
 * Field names for lookup result objects.
 * @enum {string}
 */
const LOOKUP_RESULT_FIELD = Object.freeze(stryMutAct_9fa48("110145") ? {} : (stryCov_9fa48("110145"), {
  ROWS: stryMutAct_9fa48("110146") ? "" : (stryCov_9fa48("110146"), 'rows'),
  KEY_COUNT: stryMutAct_9fa48("110147") ? "" : (stryCov_9fa48("110147"), 'keyCount'),
  BYTE_COUNT: stryMutAct_9fa48("110148") ? "" : (stryCov_9fa48("110148"), 'byteCount'),
  DEDUPED_KEY_COUNT: stryMutAct_9fa48("110149") ? "" : (stryCov_9fa48("110149"), 'dedupedKeyCount'),
  PARTITION_COUNT: stryMutAct_9fa48("110150") ? "" : (stryCov_9fa48("110150"), 'partitionCount'),
  ACCESS_PATH: stryMutAct_9fa48("110151") ? "" : (stryCov_9fa48("110151"), 'accessPath')
}));

/**
 * Field names for emit queue state.
 * @enum {string}
 */
const EMIT_FIELD = Object.freeze(stryMutAct_9fa48("110152") ? {} : (stryCov_9fa48("110152"), {
  KEY: stryMutAct_9fa48("110153") ? "" : (stryCov_9fa48("110153"), 'key'),
  VALUE: stryMutAct_9fa48("110154") ? "" : (stryCov_9fa48("110154"), 'value'),
  BYTE_COUNT: stryMutAct_9fa48("110155") ? "" : (stryCov_9fa48("110155"), 'byteCount'),
  QUEUE_SIZE: stryMutAct_9fa48("110156") ? "" : (stryCov_9fa48("110156"), 'queueSize'),
  SPILLED: stryMutAct_9fa48("110157") ? "" : (stryCov_9fa48("110157"), 'spilled'),
  BACKPRESSURE: stryMutAct_9fa48("110158") ? "" : (stryCov_9fa48("110158"), 'backpressure')
}));

/**
 * Field names for broadcast descriptor objects.
 * @enum {string}
 */
const BROADCAST_FIELD = Object.freeze(stryMutAct_9fa48("110159") ? {} : (stryCov_9fa48("110159"), {
  REF: stryMutAct_9fa48("110160") ? "" : (stryCov_9fa48("110160"), 'ref'),
  VERSION: stryMutAct_9fa48("110161") ? "" : (stryCov_9fa48("110161"), 'version'),
  PAYLOAD: stryMutAct_9fa48("110162") ? "" : (stryCov_9fa48("110162"), 'payload'),
  BYTE_COUNT: stryMutAct_9fa48("110163") ? "" : (stryCov_9fa48("110163"), 'byteCount'),
  TIMESTAMP: stryMutAct_9fa48("110164") ? "" : (stryCov_9fa48("110164"), 'timestamp')
}));

/**
 * Emit queue states for backpressure management.
 * @enum {string}
 */
const EMIT_QUEUE_STATE = Object.freeze(stryMutAct_9fa48("110165") ? {} : (stryCov_9fa48("110165"), {
  ACCEPTING: stryMutAct_9fa48("110166") ? "" : (stryCov_9fa48("110166"), 'accepting'),
  BACKPRESSURE: stryMutAct_9fa48("110167") ? "" : (stryCov_9fa48("110167"), 'backpressure'),
  SPILLING: stryMutAct_9fa48("110168") ? "" : (stryCov_9fa48("110168"), 'spilling'),
  CLOSED: stryMutAct_9fa48("110169") ? "" : (stryCov_9fa48("110169"), 'closed')
}));

/**
 * Error messages for distributed movement primitives.
 * @enum {string}
 */
const PRIMITIVE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("110170") ? {} : (stryCov_9fa48("110170"), {
  // lookup errors
  LOOKUP_TABLE_REQUIRED: stryMutAct_9fa48("110171") ? "" : (stryCov_9fa48("110171"), 'Table name is required for lookup'),
  LOOKUP_TABLE_MUST_BE_STRING: stryMutAct_9fa48("110172") ? "" : (stryCov_9fa48("110172"), 'Table name must be a string'),
  LOOKUP_KEYS_REQUIRED: stryMutAct_9fa48("110173") ? "" : (stryCov_9fa48("110173"), 'Keys array is required for lookup'),
  LOOKUP_KEYS_MUST_BE_ARRAY: stryMutAct_9fa48("110174") ? "" : (stryCov_9fa48("110174"), 'Keys must be an array'),
  LOOKUP_KEYS_EMPTY: stryMutAct_9fa48("110175") ? "" : (stryCov_9fa48("110175"), 'Keys array must not be empty'),
  LOOKUP_KEY_MISSING_COLUMN: stryMutAct_9fa48("110176") ? "" : (stryCov_9fa48("110176"), 'Each lookup key must have a column field'),
  LOOKUP_KEY_MISSING_VALUE: stryMutAct_9fa48("110177") ? "" : (stryCov_9fa48("110177"), 'Each lookup key must have a value field'),
  LOOKUP_MAX_KEYS_EXCEEDED: stryMutAct_9fa48("110178") ? "" : (stryCov_9fa48("110178"), 'Lookup batch exceeds maximum key count'),
  LOOKUP_MAX_BYTES_EXCEEDED: stryMutAct_9fa48("110179") ? "" : (stryCov_9fa48("110179"), 'Lookup result exceeds maximum byte limit'),
  LOOKUP_ACCESS_PATH_DENIED: stryMutAct_9fa48("110180") ? "" : (stryCov_9fa48("110180"), 'Lookup requires primary key, unique index, or bounded index access'),
  // emit errors
  EMIT_KEY_REQUIRED: stryMutAct_9fa48("110181") ? "" : (stryCov_9fa48("110181"), 'Key is required for emit'),
  EMIT_VALUE_REQUIRED: stryMutAct_9fa48("110182") ? "" : (stryCov_9fa48("110182"), 'Value is required for emit'),
  EMIT_VALUE_MUST_BE_UINT8ARRAY: stryMutAct_9fa48("110183") ? "" : (stryCov_9fa48("110183"), 'Emit value must be a Uint8Array'),
  EMIT_MAX_BYTES_EXCEEDED: stryMutAct_9fa48("110184") ? "" : (stryCov_9fa48("110184"), 'Emitted intermediate bytes exceed query budget'),
  EMIT_QUEUE_CLOSED: stryMutAct_9fa48("110185") ? "" : (stryCov_9fa48("110185"), 'Emit queue is closed'),
  EMIT_BACKPRESSURE: stryMutAct_9fa48("110186") ? "" : (stryCov_9fa48("110186"), 'Emit backpressure applied; retry after drain'),
  // broadcast errors
  BROADCAST_REF_REQUIRED: stryMutAct_9fa48("110187") ? "" : (stryCov_9fa48("110187"), 'Broadcast reference string is required'),
  BROADCAST_REF_MUST_BE_STRING: stryMutAct_9fa48("110188") ? "" : (stryCov_9fa48("110188"), 'Broadcast reference must be a string'),
  BROADCAST_PAYLOAD_REQUIRED: stryMutAct_9fa48("110189") ? "" : (stryCov_9fa48("110189"), 'Broadcast payload is required'),
  BROADCAST_VERSION_REQUIRED: stryMutAct_9fa48("110190") ? "" : (stryCov_9fa48("110190"), 'Broadcast payload must include a version field'),
  BROADCAST_MAX_PAYLOAD_EXCEEDED: stryMutAct_9fa48("110191") ? "" : (stryCov_9fa48("110191"), 'Broadcast payload exceeds maximum size limit'),
  BROADCAST_REF_NOT_FOUND: stryMutAct_9fa48("110192") ? "" : (stryCov_9fa48("110192"), 'Broadcast reference not found')
}));

/**
 * Log messages for distributed movement primitives.
 * @enum {string}
 */
const PRIMITIVE_LOG_MSG = Object.freeze(stryMutAct_9fa48("110193") ? {} : (stryCov_9fa48("110193"), {
  LOOKUP_STARTED: stryMutAct_9fa48("110194") ? "" : (stryCov_9fa48("110194"), 'Lookup operation started'),
  LOOKUP_COMPLETED: stryMutAct_9fa48("110195") ? "" : (stryCov_9fa48("110195"), 'Lookup operation completed'),
  LOOKUP_DEDUPED: stryMutAct_9fa48("110196") ? "" : (stryCov_9fa48("110196"), 'Lookup keys deduplicated'),
  EMIT_STARTED: stryMutAct_9fa48("110197") ? "" : (stryCov_9fa48("110197"), 'Emit operation started'),
  EMIT_COMPLETED: stryMutAct_9fa48("110198") ? "" : (stryCov_9fa48("110198"), 'Emit operation completed'),
  EMIT_BACKPRESSURE: stryMutAct_9fa48("110199") ? "" : (stryCov_9fa48("110199"), 'Emit backpressure applied'),
  EMIT_SPILL: stryMutAct_9fa48("110200") ? "" : (stryCov_9fa48("110200"), 'Emit spilling to disk'),
  BROADCAST_PUBLISHED: stryMutAct_9fa48("110201") ? "" : (stryCov_9fa48("110201"), 'Broadcast dataset published'),
  BROADCAST_RETRIEVED: stryMutAct_9fa48("110202") ? "" : (stryCov_9fa48("110202"), 'Broadcast dataset retrieved')
}));

/**
 * Default emit queue high-water mark (number of buffered records).
 * @type {number}
 */
const EMIT_QUEUE_HIGH_WATER_MARK = NUM.BYTES_PER_KIB;

/**
 * Default emit spill threshold in bytes (4 MiB).
 * When buffered bytes exceed this, spill to disk.
 * @type {number}
 */
const EMIT_SPILL_THRESHOLD_BYTES = stryMutAct_9fa48("110203") ? NUM.BYTES_PER_MIB / NUM.FOUR : (stryCov_9fa48("110203"), NUM.BYTES_PER_MIB * NUM.FOUR);
export { PRIMITIVE_TYPE, LOOKUP_ACCESS_PATH, LOOKUP_KEY_FIELD, LOOKUP_RESULT_FIELD, EMIT_FIELD, BROADCAST_FIELD, EMIT_QUEUE_STATE, PRIMITIVE_ERROR_MSG, PRIMITIVE_LOG_MSG, EMIT_QUEUE_HIGH_WATER_MARK, EMIT_SPILL_THRESHOLD_BYTES };