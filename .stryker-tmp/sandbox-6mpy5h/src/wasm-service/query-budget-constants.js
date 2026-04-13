/**
 * Query budget constants for distributed SQL primitives.
 *
 * Enforces limits on lookup, emit, and broadcast operations
 * to prevent cluster melt from accidental cross-partition chatter.
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
import { NUM } from '../constants/index.js';

/**
 * Maximum number of keys per lookup batch request.
 * @type {number}
 */
const LOOKUP_MAX_KEYS = NUM.THOUSAND;

/**
 * Maximum bytes returned per lookup batch (1 MiB).
 * @type {number}
 */
const LOOKUP_MAX_BYTES = NUM.BYTES_PER_MIB;

/**
 * Maximum intermediate bytes emitted per query (16 MiB).
 * @type {number}
 */
const EMIT_MAX_BYTES = stryMutAct_9fa48("162573") ? NUM.BYTES_PER_MIB / NUM.SIXTEEN : (stryCov_9fa48("162573"), NUM.BYTES_PER_MIB * NUM.SIXTEEN);

/**
 * Maximum broadcast payload bytes (256 KiB).
 * @type {number}
 */
const BROADCAST_MAX_PAYLOAD_BYTES = stryMutAct_9fa48("162574") ? NUM.BYTES_PER_KIB / NUM.TWO_HUNDRED_FIFTY_SIX : (stryCov_9fa48("162574"), NUM.BYTES_PER_KIB * NUM.TWO_HUNDRED_FIFTY_SIX);

/**
 * Default CPU time limit per query in milliseconds (5 s).
 * @type {number}
 */
const QUERY_CPU_TIME_LIMIT_MS = NUM.FIVE_THOUSAND;

/**
 * Default memory limit per query in bytes (64 MiB).
 * @type {number}
 */
const QUERY_MEMORY_LIMIT_BYTES = stryMutAct_9fa48("162575") ? NUM.BYTES_PER_MIB / NUM.SIXTY_FOUR : (stryCov_9fa48("162575"), NUM.BYTES_PER_MIB * NUM.SIXTY_FOUR);

/**
 * Default wall-time limit per query in milliseconds (30 s).
 * @type {number}
 */
const QUERY_WALL_TIME_LIMIT_MS = NUM.THIRTY_THOUSAND;

/**
 * Default maximum result rows per query (100,000).
 * @type {number}
 */
const RESULT_MAX_ROWS = NUM.HUNDRED_THOUSAND;

/**
 * Default maximum result bytes per query (8 MiB).
 * @type {number}
 */
const RESULT_MAX_BYTES = stryMutAct_9fa48("162576") ? NUM.BYTES_PER_MIB / NUM.EIGHT : (stryCov_9fa48("162576"), NUM.BYTES_PER_MIB * NUM.EIGHT);

/**
 * Default maximum output bytes via ctx.out per query (8 MiB).
 * @type {number}
 */
const OUT_MAX_BYTES = stryMutAct_9fa48("162577") ? NUM.BYTES_PER_MIB / NUM.EIGHT : (stryCov_9fa48("162577"), NUM.BYTES_PER_MIB * NUM.EIGHT);

/**
 * Maximum nested ctx.call invocations per stage handler.
 * @type {number}
 */
const NESTED_MAX_CALLS = NUM.THOUSAND;

/**
 * Maximum keys accessed across nested calls per stage.
 * @type {number}
 */
const NESTED_MAX_KEYS = NUM.TEN_THOUSAND;

/**
 * Maximum bytes returned from nested calls per stage (8 MiB).
 * @type {number}
 */
const NESTED_MAX_BYTES = stryMutAct_9fa48("162578") ? NUM.BYTES_PER_MIB / NUM.EIGHT : (stryCov_9fa48("162578"), NUM.BYTES_PER_MIB * NUM.EIGHT);

/**
 * Maximum concurrent inflight nested operations.
 * @type {number}
 */
const MAX_INFLIGHT = NUM.TEN;

/**
 * Frozen default query budget object combining all limits.
 * @type {Readonly<Object>}
 */
const DEFAULT_QUERY_BUDGET = Object.freeze(stryMutAct_9fa48("162579") ? {} : (stryCov_9fa48("162579"), {
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
  EMIT_MAX_BYTES,
  BROADCAST_MAX_PAYLOAD_BYTES,
  CPU_TIME_LIMIT_MS: QUERY_CPU_TIME_LIMIT_MS,
  MEMORY_LIMIT_BYTES: QUERY_MEMORY_LIMIT_BYTES,
  WALL_TIME_LIMIT_MS: QUERY_WALL_TIME_LIMIT_MS,
  RESULT_MAX_ROWS,
  RESULT_MAX_BYTES,
  OUT_MAX_BYTES
}));

/**
 * Field name constants for QueryBudget objects (camelCase).
 * @enum {string}
 */
const QB_FIELD = Object.freeze(stryMutAct_9fa48("162580") ? {} : (stryCov_9fa48("162580"), {
  LOOKUP_MAX_KEYS: stryMutAct_9fa48("162581") ? "" : (stryCov_9fa48("162581"), 'lookupMaxKeys'),
  LOOKUP_MAX_BYTES: stryMutAct_9fa48("162582") ? "" : (stryCov_9fa48("162582"), 'lookupMaxBytes'),
  EMIT_MAX_BYTES: stryMutAct_9fa48("162583") ? "" : (stryCov_9fa48("162583"), 'emitMaxBytes'),
  BROADCAST_MAX_PAYLOAD_BYTES: stryMutAct_9fa48("162584") ? "" : (stryCov_9fa48("162584"), 'broadcastMaxPayloadBytes'),
  CPU_TIME_LIMIT_MS: stryMutAct_9fa48("162585") ? "" : (stryCov_9fa48("162585"), 'cpuTimeLimitMs'),
  MEMORY_LIMIT_BYTES: stryMutAct_9fa48("162586") ? "" : (stryCov_9fa48("162586"), 'memoryLimitBytes'),
  WALL_TIME_LIMIT_MS: stryMutAct_9fa48("162587") ? "" : (stryCov_9fa48("162587"), 'wallTimeLimitMs'),
  RESULT_MAX_ROWS: stryMutAct_9fa48("162588") ? "" : (stryCov_9fa48("162588"), 'resultMaxRows'),
  RESULT_MAX_BYTES: stryMutAct_9fa48("162589") ? "" : (stryCov_9fa48("162589"), 'resultMaxBytes'),
  OUT_MAX_BYTES: stryMutAct_9fa48("162590") ? "" : (stryCov_9fa48("162590"), 'outMaxBytes'),
  NESTED_MAX_CALLS: stryMutAct_9fa48("162591") ? "" : (stryCov_9fa48("162591"), 'nestedMaxCalls'),
  NESTED_MAX_KEYS: stryMutAct_9fa48("162592") ? "" : (stryCov_9fa48("162592"), 'nestedMaxKeys'),
  NESTED_MAX_BYTES: stryMutAct_9fa48("162593") ? "" : (stryCov_9fa48("162593"), 'nestedMaxBytes'),
  MAX_INFLIGHT: stryMutAct_9fa48("162594") ? "" : (stryCov_9fa48("162594"), 'maxInflight')
}));

/**
 * Error messages for query budget violations.
 * @enum {string}
 */
const QUERY_BUDGET_ERROR_MSG = Object.freeze(stryMutAct_9fa48("162595") ? {} : (stryCov_9fa48("162595"), {
  LOOKUP_MAX_KEYS_EXCEEDED: stryMutAct_9fa48("162596") ? "" : (stryCov_9fa48("162596"), 'Lookup batch exceeds maximum key count'),
  LOOKUP_MAX_BYTES_EXCEEDED: stryMutAct_9fa48("162597") ? "" : (stryCov_9fa48("162597"), 'Lookup result exceeds maximum byte limit'),
  EMIT_MAX_BYTES_EXCEEDED: stryMutAct_9fa48("162598") ? "" : (stryCov_9fa48("162598"), 'Emitted intermediate bytes exceed query budget'),
  BROADCAST_MAX_PAYLOAD_EXCEEDED: stryMutAct_9fa48("162599") ? "" : (stryCov_9fa48("162599"), 'Broadcast payload exceeds maximum size limit'),
  CPU_TIME_EXCEEDED: stryMutAct_9fa48("162600") ? "" : (stryCov_9fa48("162600"), 'Query CPU time limit exceeded'),
  MEMORY_EXCEEDED: stryMutAct_9fa48("162601") ? "" : (stryCov_9fa48("162601"), 'Query memory limit exceeded'),
  WALL_TIME_EXCEEDED: stryMutAct_9fa48("162602") ? "" : (stryCov_9fa48("162602"), 'Query wall-time limit exceeded'),
  RESULT_MAX_ROWS_EXCEEDED: stryMutAct_9fa48("162603") ? "" : (stryCov_9fa48("162603"), 'Query result row count exceeds budget limit'),
  RESULT_MAX_BYTES_EXCEEDED: stryMutAct_9fa48("162604") ? "" : (stryCov_9fa48("162604"), 'Query result byte size exceeds budget limit'),
  OUT_MAX_BYTES_EXCEEDED: stryMutAct_9fa48("162605") ? "" : (stryCov_9fa48("162605"), 'Output bytes via ctx.out exceed budget limit')
}));
export { LOOKUP_MAX_KEYS, LOOKUP_MAX_BYTES, EMIT_MAX_BYTES, BROADCAST_MAX_PAYLOAD_BYTES, QUERY_CPU_TIME_LIMIT_MS, QUERY_MEMORY_LIMIT_BYTES, QUERY_WALL_TIME_LIMIT_MS, RESULT_MAX_ROWS, RESULT_MAX_BYTES, OUT_MAX_BYTES, NESTED_MAX_CALLS, NESTED_MAX_KEYS, NESTED_MAX_BYTES, MAX_INFLIGHT, DEFAULT_QUERY_BUDGET, QB_FIELD, QUERY_BUDGET_ERROR_MSG };