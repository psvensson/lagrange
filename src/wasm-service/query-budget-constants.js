/**
 * Query budget constants for distributed SQL primitives.
 *
 * Enforces limits on lookup, emit, and broadcast operations
 * to prevent cluster melt from accidental cross-partition chatter.
 */

import {NUM} from '../constants/index.js';

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
const EMIT_MAX_BYTES = NUM.BYTES_PER_MIB * NUM.SIXTEEN;

/**
 * Maximum broadcast payload bytes (256 KiB).
 * @type {number}
 */
const BROADCAST_MAX_PAYLOAD_BYTES =
  NUM.BYTES_PER_KIB * NUM.TWO_HUNDRED_FIFTY_SIX;

/**
 * Default CPU time limit per query in milliseconds (5 s).
 * @type {number}
 */
const QUERY_CPU_TIME_LIMIT_MS = NUM.FIVE_THOUSAND;

/**
 * Default memory limit per query in bytes (64 MiB).
 * @type {number}
 */
const QUERY_MEMORY_LIMIT_BYTES =
  NUM.BYTES_PER_MIB * NUM.SIXTY_FOUR;

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
const RESULT_MAX_BYTES = NUM.BYTES_PER_MIB * NUM.EIGHT;

/**
 * Default maximum output bytes via ctx.out per query (8 MiB).
 * @type {number}
 */
const OUT_MAX_BYTES = NUM.BYTES_PER_MIB * NUM.EIGHT;

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
const NESTED_MAX_BYTES = NUM.BYTES_PER_MIB * NUM.EIGHT;

/**
 * Maximum concurrent inflight nested operations.
 * @type {number}
 */
const MAX_INFLIGHT = NUM.TEN;

/**
 * Frozen default query budget object combining all limits.
 * @type {Readonly<Object>}
 */
const DEFAULT_QUERY_BUDGET = Object.freeze({
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
  EMIT_MAX_BYTES,
  BROADCAST_MAX_PAYLOAD_BYTES,
  CPU_TIME_LIMIT_MS: QUERY_CPU_TIME_LIMIT_MS,
  MEMORY_LIMIT_BYTES: QUERY_MEMORY_LIMIT_BYTES,
  WALL_TIME_LIMIT_MS: QUERY_WALL_TIME_LIMIT_MS,
  RESULT_MAX_ROWS,
  RESULT_MAX_BYTES,
  OUT_MAX_BYTES,
});

const DEFAULT_EFFECTIVE_QUERY_BUDGET = Object.freeze({
  ...DEFAULT_QUERY_BUDGET,
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
});

/**
 * Field name constants for QueryBudget objects (camelCase).
 * @enum {string}
 */
const QB_FIELD = Object.freeze({
  LOOKUP_MAX_KEYS: 'lookupMaxKeys',
  LOOKUP_MAX_BYTES: 'lookupMaxBytes',
  EMIT_MAX_BYTES: 'emitMaxBytes',
  BROADCAST_MAX_PAYLOAD_BYTES: 'broadcastMaxPayloadBytes',
  CPU_TIME_LIMIT_MS: 'cpuTimeLimitMs',
  MEMORY_LIMIT_BYTES: 'memoryLimitBytes',
  WALL_TIME_LIMIT_MS: 'wallTimeLimitMs',
  RESULT_MAX_ROWS: 'resultMaxRows',
  RESULT_MAX_BYTES: 'resultMaxBytes',
  OUT_MAX_BYTES: 'outMaxBytes',
  NESTED_MAX_CALLS: 'nestedMaxCalls',
  NESTED_MAX_KEYS: 'nestedMaxKeys',
  NESTED_MAX_BYTES: 'nestedMaxBytes',
  MAX_INFLIGHT: 'maxInflight',
});

/**
 * Error messages for query budget violations.
 * @enum {string}
 */
const QUERY_BUDGET_ERROR_MSG = Object.freeze({
  LOOKUP_MAX_KEYS_EXCEEDED:
    'Lookup batch exceeds maximum key count',
  LOOKUP_MAX_BYTES_EXCEEDED:
    'Lookup result exceeds maximum byte limit',
  EMIT_MAX_BYTES_EXCEEDED:
    'Emitted intermediate bytes exceed query budget',
  BROADCAST_MAX_PAYLOAD_EXCEEDED:
    'Broadcast payload exceeds maximum size limit',
  CPU_TIME_EXCEEDED:
    'Query CPU time limit exceeded',
  MEMORY_EXCEEDED:
    'Query memory limit exceeded',
  WALL_TIME_EXCEEDED:
    'Query wall-time limit exceeded',
  RESULT_MAX_ROWS_EXCEEDED:
    'Query result row count exceeds budget limit',
  RESULT_MAX_BYTES_EXCEEDED:
    'Query result byte size exceeds budget limit',
  OUT_MAX_BYTES_EXCEEDED:
    'Output bytes via ctx.out exceed budget limit',
});

const QUERY_BUDGET_NORMALIZATION_ERROR_MSG = Object.freeze({
  INVALID_BUDGET_OBJECT:
    'Query budget overrides must be a plain object',
  CONFLICTING_BUDGET_LIMITS:
    'Conflicting query budget values supplied for the same limit',
});

const EMPTY_BUDGET = Object.freeze({});
const QB_FIELD_ENTRIES = Object.freeze(Object.entries(QB_FIELD));

function resolveDimensionBudgetValue(
  source,
  upperKey,
  camelKey,
  defaultValue,
) {
  const hasUpper =
    Object.hasOwn(source, upperKey) && source[upperKey] !== undefined;
  const hasCamel =
    Object.hasOwn(source, camelKey) && source[camelKey] !== undefined;
  if (hasUpper && hasCamel) {
    const upperValue = source[upperKey];
    const camelValue = source[camelKey];
    if (Object.is(upperValue, camelValue)) {
      return upperValue;
    }
    throw new Error(
      `${QUERY_BUDGET_NORMALIZATION_ERROR_MSG.CONFLICTING_BUDGET_LIMITS}: ` +
        `${upperKey}=${String(upperValue)} vs ${camelKey}=${String(camelValue)}`,
    );
  }
  if (hasUpper) {
    return source[upperKey];
  }
  if (hasCamel) {
    return source[camelKey];
  }
  return defaultValue;
}

/**
 * Normalize query budget overrides into one canonical frozen budget shape
 * containing both uppercase SqlRequest fields and camelCase QB_FIELD keys.
 * Rejects conflicting values when a caller supplies two different values
 * for the same limit dimension. Defaults are applied only after resolving the
 * caller's fields, never inferred from a supplied value equaling a default.
 *
 * @param {Object} [budgets] - Raw or partially-populated query budget object.
 * @return {Readonly<Object>} Frozen normalized query budget.
 */
function normalizeQueryBudget(budgets = EMPTY_BUDGET) {
  const source =
    budgets === undefined || budgets === null ? EMPTY_BUDGET : budgets;
  if (typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_OBJECT);
  }
  const normalized = {...source};
  for (const [upperKey, camelKey] of QB_FIELD_ENTRIES) {
    const resolvedValue = resolveDimensionBudgetValue(
      source,
      upperKey,
      camelKey,
      DEFAULT_EFFECTIVE_QUERY_BUDGET[upperKey],
    );
    normalized[upperKey] = resolvedValue;
    normalized[camelKey] = resolvedValue;
  }
  return Object.freeze(normalized);
}

export {
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
  EMIT_MAX_BYTES,
  BROADCAST_MAX_PAYLOAD_BYTES,
  QUERY_CPU_TIME_LIMIT_MS,
  QUERY_MEMORY_LIMIT_BYTES,
  QUERY_WALL_TIME_LIMIT_MS,
  RESULT_MAX_ROWS,
  RESULT_MAX_BYTES,
  OUT_MAX_BYTES,
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
  DEFAULT_QUERY_BUDGET,
  DEFAULT_EFFECTIVE_QUERY_BUDGET,
  QB_FIELD,
  QUERY_BUDGET_ERROR_MSG,
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
  normalizeQueryBudget,
};
