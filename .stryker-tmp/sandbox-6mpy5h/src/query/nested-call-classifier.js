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
import { NESTED_CALL_CLASSIFICATION as CLS, NESTED_CALL_REASON as REASON, NESTED_CALL_ERROR_MSG as ERR, NESTED_CALL_MAX_IN_PARAMS } from './runtime-constants.js';

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
const SUBQUERY_RE = stryMutAct_9fa48("113330") ? /\(\S*SELECT\b/i : stryMutAct_9fa48("113329") ? /\(\sSELECT\b/i : (stryCov_9fa48("113329", "113330"), /\(\s*SELECT\b/i);

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
const RANGE_OP_RE = stryMutAct_9fa48("113331") ? /[^><]|>=|<=|\bBETWEEN\b/i : (stryCov_9fa48("113331"), /[><]|>=|<=|\bBETWEEN\b/i);

/**
 * Case-insensitive regex for IN clause with parameters.
 * @type {RegExp}
 */
const IN_CLAUSE_RE = stryMutAct_9fa48("113333") ? /\bIN\S*\(/i : stryMutAct_9fa48("113332") ? /\bIN\s\(/i : (stryCov_9fa48("113332", "113333"), /\bIN\s*\(/i);

/**
 * Case-insensitive regex for ANY clause with parameter.
 * @type {RegExp}
 */
const ANY_CLAUSE_RE = stryMutAct_9fa48("113337") ? /=\s*ANY\S*\(/i : stryMutAct_9fa48("113336") ? /=\s*ANY\s\(/i : stryMutAct_9fa48("113335") ? /=\S*ANY\s*\(/i : stryMutAct_9fa48("113334") ? /=\sANY\s*\(/i : (stryCov_9fa48("113334", "113335", "113336", "113337"), /=\s*ANY\s*\(/i);
const NESTED_CALL_DECISION = Object.freeze(stryMutAct_9fa48("113338") ? {} : (stryCov_9fa48("113338"), {
  JOIN_DETECTED: stryMutAct_9fa48("113339") ? "" : (stryCov_9fa48("113339"), 'joinDetected'),
  SUBQUERY_DETECTED: stryMutAct_9fa48("113340") ? "" : (stryCov_9fa48("113340"), 'subqueryDetected'),
  FULL_TABLE_SCAN: stryMutAct_9fa48("113341") ? "" : (stryCov_9fa48("113341"), 'fullTableScan'),
  BOUNDED_IN_CLAUSE: stryMutAct_9fa48("113342") ? "" : (stryCov_9fa48("113342"), 'boundedInClause'),
  RANGE_SCAN_NO_LIMIT: stryMutAct_9fa48("113343") ? "" : (stryCov_9fa48("113343"), 'rangeScanNoLimit'),
  PK_POINT_LOOKUP: stryMutAct_9fa48("113344") ? "" : (stryCov_9fa48("113344"), 'pkPointLookup'),
  INDEXED_LIMIT_QUERY: stryMutAct_9fa48("113345") ? "" : (stryCov_9fa48("113345"), 'indexedLimitQuery'),
  CONSERVATIVE_DEFAULT: stryMutAct_9fa48("113346") ? "" : (stryCov_9fa48("113346"), 'conservativeDefault')
}));
const NESTED_CALL_OUTCOME_BY_DECISION = Object.freeze(stryMutAct_9fa48("113347") ? {} : (stryCov_9fa48("113347"), {
  [NESTED_CALL_DECISION.JOIN_DETECTED]: Object.freeze(stryMutAct_9fa48("113348") ? {} : (stryCov_9fa48("113348"), {
    classification: CLS.UNBOUNDED,
    reason: REASON.JOIN_DETECTED
  })),
  [NESTED_CALL_DECISION.SUBQUERY_DETECTED]: Object.freeze(stryMutAct_9fa48("113349") ? {} : (stryCov_9fa48("113349"), {
    classification: CLS.UNBOUNDED,
    reason: REASON.SUBQUERY_DETECTED
  })),
  [NESTED_CALL_DECISION.FULL_TABLE_SCAN]: Object.freeze(stryMutAct_9fa48("113350") ? {} : (stryCov_9fa48("113350"), {
    classification: CLS.UNBOUNDED,
    reason: REASON.FULL_TABLE_SCAN
  })),
  [NESTED_CALL_DECISION.BOUNDED_IN_CLAUSE]: Object.freeze(stryMutAct_9fa48("113351") ? {} : (stryCov_9fa48("113351"), {
    classification: CLS.BOUNDED,
    reason: REASON.BOUNDED_IN_CLAUSE
  })),
  [NESTED_CALL_DECISION.RANGE_SCAN_NO_LIMIT]: Object.freeze(stryMutAct_9fa48("113352") ? {} : (stryCov_9fa48("113352"), {
    classification: CLS.UNBOUNDED,
    reason: REASON.RANGE_SCAN_NO_LIMIT
  })),
  [NESTED_CALL_DECISION.PK_POINT_LOOKUP]: Object.freeze(stryMutAct_9fa48("113353") ? {} : (stryCov_9fa48("113353"), {
    classification: CLS.BOUNDED,
    reason: REASON.PK_POINT_LOOKUP
  })),
  [NESTED_CALL_DECISION.INDEXED_LIMIT_QUERY]: Object.freeze(stryMutAct_9fa48("113354") ? {} : (stryCov_9fa48("113354"), {
    classification: CLS.BOUNDED,
    reason: REASON.INDEXED_LIMIT_QUERY
  })),
  [NESTED_CALL_DECISION.CONSERVATIVE_DEFAULT]: Object.freeze(stryMutAct_9fa48("113355") ? {} : (stryCov_9fa48("113355"), {
    classification: CLS.UNBOUNDED,
    reason: REASON.CONSERVATIVE_DEFAULT
  }))
}));

/**
 * Counts the number of parameter placeholders (?) inside the
 * first IN(...) clause of the query.
 * @param {string} query - SQL query string
 * @return {number} placeholder count, or -1 if no IN clause
 */
function countInParams(query) {
  if (stryMutAct_9fa48("113356")) {
    {}
  } else {
    stryCov_9fa48("113356");
    const inMatch = IN_CLAUSE_RE.exec(query);
    if (stryMutAct_9fa48("113359") ? false : stryMutAct_9fa48("113358") ? true : stryMutAct_9fa48("113357") ? inMatch : (stryCov_9fa48("113357", "113358", "113359"), !inMatch)) return stryMutAct_9fa48("113360") ? +1 : (stryCov_9fa48("113360"), -1);
    const start = stryMutAct_9fa48("113361") ? inMatch.index - inMatch[0].length : (stryCov_9fa48("113361"), inMatch.index + inMatch[0].length);
    const closeIdx = query.indexOf(stryMutAct_9fa48("113362") ? "" : (stryCov_9fa48("113362"), ')'), start);
    if (stryMutAct_9fa48("113365") ? closeIdx !== -1 : stryMutAct_9fa48("113364") ? false : stryMutAct_9fa48("113363") ? true : (stryCov_9fa48("113363", "113364", "113365"), closeIdx === (stryMutAct_9fa48("113366") ? +1 : (stryCov_9fa48("113366"), -1)))) return stryMutAct_9fa48("113367") ? +1 : (stryCov_9fa48("113367"), -1);
    const inner = stryMutAct_9fa48("113368") ? query : (stryCov_9fa48("113368"), query.slice(start, closeIdx));
    const placeholders = stryMutAct_9fa48("113369") ? inner.split('?').length + 1 : (stryCov_9fa48("113369"), inner.split(stryMutAct_9fa48("113370") ? "" : (stryCov_9fa48("113370"), '?')).length - 1);
    return placeholders;
  }
}

/**
 * Classify a nested ctx.call SQL query as bounded or unbounded.
 *
 * @param {string} query - SQL query string
 * @return {{classification: string, reason: string}}
 */
function classifyNestedCall(query) {
  if (stryMutAct_9fa48("113371")) {
    {}
  } else {
    stryCov_9fa48("113371");
    if (stryMutAct_9fa48("113374") ? typeof query !== 'string' && query.trim().length === 0 : stryMutAct_9fa48("113373") ? false : stryMutAct_9fa48("113372") ? true : (stryCov_9fa48("113372", "113373", "113374"), (stryMutAct_9fa48("113376") ? typeof query === 'string' : stryMutAct_9fa48("113375") ? false : (stryCov_9fa48("113375", "113376"), typeof query !== (stryMutAct_9fa48("113377") ? "" : (stryCov_9fa48("113377"), 'string')))) || (stryMutAct_9fa48("113379") ? query.trim().length !== 0 : stryMutAct_9fa48("113378") ? false : (stryCov_9fa48("113378", "113379"), (stryMutAct_9fa48("113380") ? query.length : (stryCov_9fa48("113380"), query.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("113381")) {
        {}
      } else {
        stryCov_9fa48("113381");
        throw new Error(ERR.QUERY_REQUIRED);
      }
    }
    const normalized = stryMutAct_9fa48("113382") ? query : (stryCov_9fa48("113382"), query.trim());
    const hasJoin = JOIN_RE.test(normalized);
    const hasSubquery = SUBQUERY_RE.test(normalized);
    const hasWhere = WHERE_RE.test(normalized);
    const hasLimit = LIMIT_RE.test(normalized);
    const hasIn = IN_CLAUSE_RE.test(normalized);
    const hasAny = ANY_CLAUSE_RE.test(normalized);
    const hasRange = RANGE_OP_RE.test(normalized);
    const paramCount = hasIn ? countInParams(normalized) : 1;
    const decision = hasJoin ? NESTED_CALL_DECISION.JOIN_DETECTED : hasSubquery ? NESTED_CALL_DECISION.SUBQUERY_DETECTED : (stryMutAct_9fa48("113383") ? hasWhere : (stryCov_9fa48("113383"), !hasWhere)) ? NESTED_CALL_DECISION.FULL_TABLE_SCAN : (stryMutAct_9fa48("113386") ? (hasIn || hasAny) && paramCount >= 0 || paramCount <= NESTED_CALL_MAX_IN_PARAMS : stryMutAct_9fa48("113385") ? false : stryMutAct_9fa48("113384") ? true : (stryCov_9fa48("113384", "113385", "113386"), (stryMutAct_9fa48("113388") ? hasIn || hasAny || paramCount >= 0 : stryMutAct_9fa48("113387") ? true : (stryCov_9fa48("113387", "113388"), (stryMutAct_9fa48("113390") ? hasIn && hasAny : stryMutAct_9fa48("113389") ? true : (stryCov_9fa48("113389", "113390"), hasIn || hasAny)) && (stryMutAct_9fa48("113393") ? paramCount < 0 : stryMutAct_9fa48("113392") ? paramCount > 0 : stryMutAct_9fa48("113391") ? true : (stryCov_9fa48("113391", "113392", "113393"), paramCount >= 0)))) && (stryMutAct_9fa48("113396") ? paramCount > NESTED_CALL_MAX_IN_PARAMS : stryMutAct_9fa48("113395") ? paramCount < NESTED_CALL_MAX_IN_PARAMS : stryMutAct_9fa48("113394") ? true : (stryCov_9fa48("113394", "113395", "113396"), paramCount <= NESTED_CALL_MAX_IN_PARAMS)))) ? NESTED_CALL_DECISION.BOUNDED_IN_CLAUSE : (stryMutAct_9fa48("113399") ? hasRange || !hasLimit : stryMutAct_9fa48("113398") ? false : stryMutAct_9fa48("113397") ? true : (stryCov_9fa48("113397", "113398", "113399"), hasRange && (stryMutAct_9fa48("113400") ? hasLimit : (stryCov_9fa48("113400"), !hasLimit)))) ? NESTED_CALL_DECISION.RANGE_SCAN_NO_LIMIT : (stryMutAct_9fa48("113403") ? !hasRange && !hasIn || !hasAny : stryMutAct_9fa48("113402") ? false : stryMutAct_9fa48("113401") ? true : (stryCov_9fa48("113401", "113402", "113403"), (stryMutAct_9fa48("113405") ? !hasRange || !hasIn : stryMutAct_9fa48("113404") ? true : (stryCov_9fa48("113404", "113405"), (stryMutAct_9fa48("113406") ? hasRange : (stryCov_9fa48("113406"), !hasRange)) && (stryMutAct_9fa48("113407") ? hasIn : (stryCov_9fa48("113407"), !hasIn)))) && (stryMutAct_9fa48("113408") ? hasAny : (stryCov_9fa48("113408"), !hasAny)))) ? NESTED_CALL_DECISION.PK_POINT_LOOKUP : hasLimit ? NESTED_CALL_DECISION.INDEXED_LIMIT_QUERY : NESTED_CALL_DECISION.CONSERVATIVE_DEFAULT;
    return stryMutAct_9fa48("113409") ? {} : (stryCov_9fa48("113409"), {
      ...NESTED_CALL_OUTCOME_BY_DECISION[decision]
    });
  }
}
export { classifyNestedCall };