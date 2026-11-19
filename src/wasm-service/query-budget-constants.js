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
 * Default maximum total input rows ingested across all partition fragments in
 * one coordinator SQLite merge session (1,000,000).
 * @type {number}
 */
const MERGE_INPUT_MAX_ROWS = NUM.THOUSAND * NUM.THOUSAND;

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
 * The one query budget: every limit, keyed by its uppercase field name.
 * `normalizeQueryBudget` is the only producer of a budget; every reader
 * consumes its output.
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
  MERGE_INPUT_MAX_ROWS,
  RESULT_MAX_BYTES,
  OUT_MAX_BYTES,
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
});

const QUERY_BUDGET_FIELD_COUNT = Object.keys(DEFAULT_QUERY_BUDGET).length;

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
  UNKNOWN_BUDGET_FIELD:
    'Unknown query budget field',
  INVALID_BUDGET_LIMIT:
    'Query budget limit must be a non-negative safe integer',
  BUDGET_NOT_NORMALIZED:
    'Query budget must be the frozen output of normalizeQueryBudget',
});

const EMPTY_OVERRIDES = Object.freeze({});

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isQueryBudgetEntry(field, value) {
  return Object.hasOwn(DEFAULT_QUERY_BUDGET, field) &&
    Number.isSafeInteger(value) && value >= 0;
}

function assertQueryBudgetEntry(field, value) {
  if (!Object.hasOwn(DEFAULT_QUERY_BUDGET, field)) {
    throw new Error(
      `${QUERY_BUDGET_NORMALIZATION_ERROR_MSG.UNKNOWN_BUDGET_FIELD}: ${field}`,
    );
  }
  if (!isQueryBudgetEntry(field, value)) {
    throw new Error(
      `${QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_LIMIT}: ` +
        `${field}=${String(value)} (${typeof value})`,
    );
  }
}

/**
 * Build the query budget from caller overrides. This is the only place a
 * budget default is applied. Overrides name limits by their uppercase field
 * (the keys of DEFAULT_QUERY_BUDGET); an unknown field or a value that is
 * not a non-negative safe integer is refused, never defaulted.
 *
 * @param {Object} [overrides] - Plain object of limit overrides.
 * @return {Readonly<Object>} Frozen budget holding every limit.
 * @throws {Error} When the overrides are not a plain object, name an unknown
 *   field, or carry an invalid limit.
 */
function normalizeQueryBudget(overrides = EMPTY_OVERRIDES) {
  if (!isPlainObject(overrides)) {
    throw new Error(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_OBJECT);
  }
  for (const [field, value] of Object.entries(overrides)) {
    assertQueryBudgetEntry(field, value);
  }
  return Object.freeze({...DEFAULT_QUERY_BUDGET, ...overrides});
}

/**
 * Whether a value is a budget produced by normalizeQueryBudget: a frozen
 * plain object holding exactly every limit, each a valid value.
 *
 * @param {*} budget - Candidate budget.
 * @return {boolean} True for a normalized budget.
 */
function isNormalizedQueryBudget(budget) {
  return isPlainObject(budget) && Object.isFrozen(budget) &&
    Object.keys(budget).length === QUERY_BUDGET_FIELD_COUNT &&
    Object.entries(budget).every(([field, value]) =>
      isQueryBudgetEntry(field, value));
}

/**
 * Refuse anything but a normalized budget. Readers call this instead of
 * defaulting a missing or misspelled limit.
 *
 * @param {*} budget - Budget a reader received.
 * @return {Readonly<Object>} The same budget.
 * @throws {Error} When the budget is not normalized.
 */
function requireNormalizedQueryBudget(budget) {
  if (!isNormalizedQueryBudget(budget)) {
    throw new Error(QUERY_BUDGET_NORMALIZATION_ERROR_MSG.BUDGET_NOT_NORMALIZED);
  }
  return budget;
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
  MERGE_INPUT_MAX_ROWS,
  RESULT_MAX_BYTES,
  OUT_MAX_BYTES,
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
  DEFAULT_QUERY_BUDGET,
  QUERY_BUDGET_ERROR_MSG,
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
  normalizeQueryBudget,
  isNormalizedQueryBudget,
  requireNormalizedQueryBudget,
};
