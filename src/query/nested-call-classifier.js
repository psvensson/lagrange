/**
 * Classifier for nested ctx.call inside stage handlers.
 *
 * Determines whether a nested SQL query is bounded (allowed in v0)
 * or unbounded (rejected in v0). Uses conservative heuristics:
 * when in doubt, classify as UNBOUNDED.
 *
 * Requirements: 8.1, 8.2
 * @module query/nested-call-classifier
 */

import {
  NESTED_CALL_CLASSIFICATION as CLS,
  NESTED_CALL_REASON as REASON,
  NESTED_CALL_ERROR_MSG as ERR,
  NESTED_CALL_MAX_IN_PARAMS,
} from './runtime-constants.js';

const LOCAL_STR_STRING = 'string';

/**
 * Case-insensitive regex for JOIN keyword (word-bounded).
 * @type {RegExp}
 */
const JOIN_RE = /\bJOIN\b/i;

/**
 * Case-insensitive regex for nested SELECT (subquery).
 * Matches SELECT that is NOT at the very start of the
 * trimmed query.
 * @type {RegExp}
 */
const SUBQUERY_RE = /\(\s*SELECT\b/i;

/**
 * Case-insensitive regex for WHERE clause presence.
 * @type {RegExp}
 */
const WHERE_RE = /\bWHERE\b/i;

/**
 * Case-insensitive regex for LIMIT clause presence.
 * @type {RegExp}
 */
const LIMIT_RE = /\bLIMIT\b/i;

/**
 * Case-insensitive regex for range operators in WHERE clause.
 * @type {RegExp}
 */
const RANGE_OP_RE = /[><]|>=|<=|\bBETWEEN\b/i;

/**
 * Case-insensitive regex for IN clause with parameters.
 * @type {RegExp}
 */
const IN_CLAUSE_RE = /\bIN\s*\(/i;

/**
 * Case-insensitive regex for ANY clause with parameter.
 * @type {RegExp}
 */
const ANY_CLAUSE_RE = /=\s*ANY\s*\(/i;

const NESTED_CALL_DECISION = Object.freeze({
  JOIN_DETECTED: 'joinDetected',
  SUBQUERY_DETECTED: 'subqueryDetected',
  FULL_TABLE_SCAN: 'fullTableScan',
  BOUNDED_IN_CLAUSE: 'boundedInClause',
  RANGE_SCAN_NO_LIMIT: 'rangeScanNoLimit',
  PK_POINT_LOOKUP: 'pkPointLookup',
  INDEXED_LIMIT_QUERY: 'indexedLimitQuery',
  CONSERVATIVE_DEFAULT: 'conservativeDefault',
});

const NESTED_CALL_OUTCOME_BY_DECISION = Object.freeze({
  [NESTED_CALL_DECISION.JOIN_DETECTED]: Object.freeze({
    classification: CLS.UNBOUNDED,
    reason: REASON.JOIN_DETECTED,
  }),
  [NESTED_CALL_DECISION.SUBQUERY_DETECTED]: Object.freeze({
    classification: CLS.UNBOUNDED,
    reason: REASON.SUBQUERY_DETECTED,
  }),
  [NESTED_CALL_DECISION.FULL_TABLE_SCAN]: Object.freeze({
    classification: CLS.UNBOUNDED,
    reason: REASON.FULL_TABLE_SCAN,
  }),
  [NESTED_CALL_DECISION.BOUNDED_IN_CLAUSE]: Object.freeze({
    classification: CLS.BOUNDED,
    reason: REASON.BOUNDED_IN_CLAUSE,
  }),
  [NESTED_CALL_DECISION.RANGE_SCAN_NO_LIMIT]: Object.freeze({
    classification: CLS.UNBOUNDED,
    reason: REASON.RANGE_SCAN_NO_LIMIT,
  }),
  [NESTED_CALL_DECISION.PK_POINT_LOOKUP]: Object.freeze({
    classification: CLS.BOUNDED,
    reason: REASON.PK_POINT_LOOKUP,
  }),
  [NESTED_CALL_DECISION.INDEXED_LIMIT_QUERY]: Object.freeze({
    classification: CLS.BOUNDED,
    reason: REASON.INDEXED_LIMIT_QUERY,
  }),
  [NESTED_CALL_DECISION.CONSERVATIVE_DEFAULT]: Object.freeze({
    classification: CLS.UNBOUNDED,
    reason: REASON.CONSERVATIVE_DEFAULT,
  }),
});

/**
 * Counts the number of parameter placeholders (?) inside the
 * first IN(...) clause of the query.
 * @param {string} query - SQL query string
 * @return {number} placeholder count, or -1 if no IN clause
 */
function countInParams(query) {
  const inMatch = IN_CLAUSE_RE.exec(query);
  if (!inMatch) return -1;
  const start = inMatch.index + inMatch[0].length;
  const closeIdx = query.indexOf(')', start);
  if (closeIdx === -1) return -1;
  const inner = query.slice(start, closeIdx);
  const placeholders = inner.split('?').length - 1;
  return placeholders;
}

function collectNestedCallSignals(normalizedQuery) {
  const hasIn = IN_CLAUSE_RE.test(normalizedQuery);
  const hasAny = ANY_CLAUSE_RE.test(normalizedQuery);
  return Object.freeze({
    hasAny,
    hasIn,
    hasJoin: JOIN_RE.test(normalizedQuery),
    hasLimit: LIMIT_RE.test(normalizedQuery),
    hasRange: RANGE_OP_RE.test(normalizedQuery),
    hasSubquery: SUBQUERY_RE.test(normalizedQuery),
    hasWhere: WHERE_RE.test(normalizedQuery),
    paramCount: hasIn ? countInParams(normalizedQuery) : 1,
  });
}

function isBoundedInClause(signals) {
  return (signals.hasIn || signals.hasAny) &&
    signals.paramCount >= 0 &&
    signals.paramCount <= NESTED_CALL_MAX_IN_PARAMS;
}

function isPointLookup(signals) {
  return !signals.hasRange && !signals.hasIn && !signals.hasAny;
}

function resolveNestedCallDecision(signals) {
  if (signals.hasJoin) {
    return NESTED_CALL_DECISION.JOIN_DETECTED;
  }
  if (signals.hasSubquery) {
    return NESTED_CALL_DECISION.SUBQUERY_DETECTED;
  }
  if (!signals.hasWhere) {
    return NESTED_CALL_DECISION.FULL_TABLE_SCAN;
  }
  if (isBoundedInClause(signals)) {
    return NESTED_CALL_DECISION.BOUNDED_IN_CLAUSE;
  }
  if (signals.hasRange && !signals.hasLimit) {
    return NESTED_CALL_DECISION.RANGE_SCAN_NO_LIMIT;
  }
  if (isPointLookup(signals)) {
    return NESTED_CALL_DECISION.PK_POINT_LOOKUP;
  }
  return signals.hasLimit ?
    NESTED_CALL_DECISION.INDEXED_LIMIT_QUERY :
    NESTED_CALL_DECISION.CONSERVATIVE_DEFAULT;
}

/**
 * Classify a nested ctx.call SQL query as bounded or unbounded.
 *
 * @param {string} query - SQL query string
 * @return {{classification: string, reason: string}}
 */
function classifyNestedCall(query) {
  if (typeof query !== LOCAL_STR_STRING || query.trim().length === 0) {
    throw new Error(ERR.QUERY_REQUIRED);
  }

  const normalized = query.trim();
  const decision = resolveNestedCallDecision(
    collectNestedCallSignals(normalized),
  );

  return {...NESTED_CALL_OUTCOME_BY_DECISION[decision]};
}

export {classifyNestedCall};
