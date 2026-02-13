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

/**
 * Classify a nested ctx.call SQL query as bounded or unbounded.
 *
 * @param {string} query - SQL query string
 * @return {{classification: string, reason: string}}
 */
function classifyNestedCall(query) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error(ERR.QUERY_REQUIRED);
  }

  const normalized = query.trim();

  // JOIN → always unbounded
  if (JOIN_RE.test(normalized)) {
    return {
      classification: CLS.UNBOUNDED,
      reason: REASON.JOIN_DETECTED,
    };
  }

  // Subquery → always unbounded
  if (SUBQUERY_RE.test(normalized)) {
    return {
      classification: CLS.UNBOUNDED,
      reason: REASON.SUBQUERY_DETECTED,
    };
  }

  const hasWhere = WHERE_RE.test(normalized);
  const hasLimit = LIMIT_RE.test(normalized);

  // No WHERE → full table scan → unbounded
  if (!hasWhere) {
    return {
      classification: CLS.UNBOUNDED,
      reason: REASON.FULL_TABLE_SCAN,
    };
  }

  // Has WHERE — check for IN/ANY bounded batch
  const hasIn = IN_CLAUSE_RE.test(normalized);
  const hasAny = ANY_CLAUSE_RE.test(normalized);
  if (hasIn || hasAny) {
    const paramCount = hasIn ? countInParams(normalized) : 1;
    if (paramCount >= 0 &&
        paramCount <= NESTED_CALL_MAX_IN_PARAMS) {
      return {
        classification: CLS.BOUNDED,
        reason: REASON.BOUNDED_IN_CLAUSE,
      };
    }
  }

  const hasRange = RANGE_OP_RE.test(normalized);

  // Range scan without LIMIT → unbounded
  if (hasRange && !hasLimit) {
    return {
      classification: CLS.UNBOUNDED,
      reason: REASON.RANGE_SCAN_NO_LIMIT,
    };
  }

  // WHERE with equality (no range) — likely pk/unique lookup
  if (!hasRange && !hasIn && !hasAny) {
    return {
      classification: CLS.BOUNDED,
      reason: REASON.PK_POINT_LOOKUP,
    };
  }

  // WHERE + LIMIT → bounded indexed query
  if (hasLimit) {
    return {
      classification: CLS.BOUNDED,
      reason: REASON.INDEXED_LIMIT_QUERY,
    };
  }

  // Conservative default
  return {
    classification: CLS.UNBOUNDED,
    reason: REASON.CONSERVATIVE_DEFAULT,
  };
}

export {classifyNestedCall};
