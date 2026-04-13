/**
 * Stateless PG-to-SQLite AST translation functions.
 * Each function transforms a PG-specific AST node into a
 * SQLite-compatible Internal_AST node.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 5.1, 5.2,
 *               6.1, 6.2, 14.1, 14.2
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
import { EXPR_TYPE } from '../parser-constants.js';
import { PG_TRANSLATE_ERROR, PG_EXPR_TYPE } from './pg-compat-constants.js';
import { resolveAffinity } from './pg-type-affinity.js';

/**
 * Boolean literal value mapping.
 * TRUE → 1, FALSE → 0.
 */
const BOOLEAN_VALUE = Object.freeze(stryMutAct_9fa48("114106") ? {} : (stryCov_9fa48("114106"), {
  TRUE: 1,
  FALSE: 0
}));

/**
 * ON CONFLICT action keywords from node-sql-parser PG AST.
 */
const ON_CONFLICT_ACTION = Object.freeze(stryMutAct_9fa48("114107") ? {} : (stryCov_9fa48("114107"), {
  NOTHING: stryMutAct_9fa48("114108") ? "" : (stryCov_9fa48("114108"), 'nothing'),
  REPLACE: stryMutAct_9fa48("114109") ? "" : (stryCov_9fa48("114109"), 'replace'),
  UPDATE: stryMutAct_9fa48("114110") ? "" : (stryCov_9fa48("114110"), 'update')
}));

/**
 * ILIKE operator name used in the PG AST.
 */
const ILIKE_OPERATOR = stryMutAct_9fa48("114111") ? "" : (stryCov_9fa48("114111"), 'ILIKE');
const NOT_ILIKE_OPERATOR = stryMutAct_9fa48("114112") ? "" : (stryCov_9fa48("114112"), 'NOT ILIKE');

/**
 * LOWER function name for ILIKE translation.
 */
const LOWER_FN_NAME = stryMutAct_9fa48("114113") ? "" : (stryCov_9fa48("114113"), 'lower');

/**
 * Minimum valid positional parameter index (1-based).
 */
const MIN_PARAM_INDEX = 1;
const EMPTY_TYPE_FALLBACK = stryMutAct_9fa48("114114") ? "Stryker was here!" : (stryCov_9fa48("114114"), '');
const EMPTY_ACTION_FALLBACK = stryMutAct_9fa48("114115") ? "Stryker was here!" : (stryCov_9fa48("114115"), '');

/**
 * Translates a PG boolean literal node to an integer literal node.
 * TRUE → 1, FALSE → 0.
 * @param {Object} expr - PG boolean literal node with a boolean value.
 * @returns {Object} Internal_AST literal node with integer value.
 */
function translateBooleanLiteral(expr) {
  if (stryMutAct_9fa48("114116")) {
    {}
  } else {
    stryCov_9fa48("114116");
    const value = (stryMutAct_9fa48("114119") ? expr.value !== true : stryMutAct_9fa48("114118") ? false : stryMutAct_9fa48("114117") ? true : (stryCov_9fa48("114117", "114118", "114119"), expr.value === (stryMutAct_9fa48("114120") ? false : (stryCov_9fa48("114120"), true)))) ? BOOLEAN_VALUE.TRUE : BOOLEAN_VALUE.FALSE;
    return stryMutAct_9fa48("114121") ? {} : (stryCov_9fa48("114121"), {
      type: EXPR_TYPE.LITERAL,
      value
    });
  }
}

/**
 * Translates a PG positional parameter ($N) to a parameter node.
 * Records the 1-based index in the tracker array for later reordering.
 * @param {Object} expr - PG positional param node with numeric value.
 * @param {number[]} tracker - Array to push the 1-based param index into.
 * @returns {Object} Internal_AST parameter node.
 */
function translatePositionalParam(expr, tracker) {
  if (stryMutAct_9fa48("114122")) {
    {}
  } else {
    stryCov_9fa48("114122");
    const index = expr.value;
    tracker.push(index);
    return stryMutAct_9fa48("114123") ? {} : (stryCov_9fa48("114123"), {
      type: EXPR_TYPE.PARAMETER
    });
  }
}

/**
 * Translates a PG type cast expression to a CAST node.
 * Handles both ::type and CAST(expr AS type) forms.
 * @param {Object} expr - PG cast node with target type and inner expression.
 * @param {Function} convertExprFn - Callback to convert the inner expression.
 * @returns {Object} Internal_AST cast node with resolved affinity.
 */
function translateTypeCast(expr, convertExprFn) {
  if (stryMutAct_9fa48("114124")) {
    {}
  } else {
    stryCov_9fa48("114124");
    const innerExpr = convertExprFn(expr.expr);
    const pgType = stryMutAct_9fa48("114127") ? (expr.target?.dataType || expr.as) && EMPTY_TYPE_FALLBACK : stryMutAct_9fa48("114126") ? false : stryMutAct_9fa48("114125") ? true : (stryCov_9fa48("114125", "114126", "114127"), (stryMutAct_9fa48("114129") ? expr.target?.dataType && expr.as : stryMutAct_9fa48("114128") ? false : (stryCov_9fa48("114128", "114129"), (stryMutAct_9fa48("114130") ? expr.target.dataType : (stryCov_9fa48("114130"), expr.target?.dataType)) || expr.as)) || EMPTY_TYPE_FALLBACK);
    const affinity = resolveAffinity(pgType);
    return stryMutAct_9fa48("114131") ? {} : (stryCov_9fa48("114131"), {
      type: PG_EXPR_TYPE.CAST,
      expression: innerExpr,
      affinity
    });
  }
}

/**
 * Translates an ILIKE binary expression to a LIKE node
 * with both operands wrapped in LOWER().
 * @param {Object} expr - PG binary expression with ILIKE operator.
 * @param {Function} convertExprFn - Callback to convert operands.
 * @returns {Object} Internal_AST LIKE node with LOWER-wrapped operands.
 */
function translateIlike(expr, convertExprFn) {
  if (stryMutAct_9fa48("114132")) {
    {}
  } else {
    stryCov_9fa48("114132");
    const left = convertExprFn(expr.left);
    const right = convertExprFn(expr.right);
    const operator = stryMutAct_9fa48("114133") ? expr.operator.toLowerCase() : (stryCov_9fa48("114133"), expr.operator.toUpperCase());
    const negated = stryMutAct_9fa48("114136") ? operator !== NOT_ILIKE_OPERATOR : stryMutAct_9fa48("114135") ? false : stryMutAct_9fa48("114134") ? true : (stryCov_9fa48("114134", "114135", "114136"), operator === NOT_ILIKE_OPERATOR);
    const wrapLower = stryMutAct_9fa48("114137") ? () => undefined : (stryCov_9fa48("114137"), (() => {
      const wrapLower = node => stryMutAct_9fa48("114138") ? {} : (stryCov_9fa48("114138"), {
        type: PG_EXPR_TYPE.FUNCTION_CALL,
        name: LOWER_FN_NAME,
        args: stryMutAct_9fa48("114139") ? [] : (stryCov_9fa48("114139"), [node])
      });
      return wrapLower;
    })());
    return stryMutAct_9fa48("114140") ? {} : (stryCov_9fa48("114140"), {
      type: EXPR_TYPE.LIKE,
      expression: wrapLower(left),
      pattern: wrapLower(right),
      negated
    });
  }
}

/**
 * Translates ON CONFLICT clause on an INSERT AST.
 * DO NOTHING → orIgnore=true, DO UPDATE → orReplace=true.
 * Mutates the insertAst in place by setting orIgnore/orReplace flags.
 *
 * node-sql-parser PG mode produces:
 *   { keyword: 'on', action: { keyword: 'do', expr: { type, value } } }
 * where expr.type/value is 'nothing' or 'update'.
 *
 * @param {Object} insertAst - Internal_AST INSERT node to modify.
 * @param {Object} onConflict - PG ON CONFLICT clause from parser AST.
 */
function translateOnConflict(insertAst, onConflict) {
  if (stryMutAct_9fa48("114141")) {
    {}
  } else {
    stryCov_9fa48("114141");
    if (stryMutAct_9fa48("114144") ? false : stryMutAct_9fa48("114143") ? true : stryMutAct_9fa48("114142") ? onConflict : (stryCov_9fa48("114142", "114143", "114144"), !onConflict)) {
      if (stryMutAct_9fa48("114145")) {
        {}
      } else {
        stryCov_9fa48("114145");
        return;
      }
    }
    const action = stryMutAct_9fa48("114146") ? (onConflict.action?.expr?.value || onConflict.action?.expr?.type || EMPTY_ACTION_FALLBACK).toUpperCase() : (stryCov_9fa48("114146"), (stryMutAct_9fa48("114149") ? (onConflict.action?.expr?.value || onConflict.action?.expr?.type) && EMPTY_ACTION_FALLBACK : stryMutAct_9fa48("114148") ? false : stryMutAct_9fa48("114147") ? true : (stryCov_9fa48("114147", "114148", "114149"), (stryMutAct_9fa48("114151") ? onConflict.action?.expr?.value && onConflict.action?.expr?.type : stryMutAct_9fa48("114150") ? false : (stryCov_9fa48("114150", "114151"), (stryMutAct_9fa48("114153") ? onConflict.action.expr?.value : stryMutAct_9fa48("114152") ? onConflict.action?.expr.value : (stryCov_9fa48("114152", "114153"), onConflict.action?.expr?.value)) || (stryMutAct_9fa48("114155") ? onConflict.action.expr?.type : stryMutAct_9fa48("114154") ? onConflict.action?.expr.type : (stryCov_9fa48("114154", "114155"), onConflict.action?.expr?.type)))) || EMPTY_ACTION_FALLBACK)).toLowerCase());
    if (stryMutAct_9fa48("114158") ? action !== ON_CONFLICT_ACTION.NOTHING : stryMutAct_9fa48("114157") ? false : stryMutAct_9fa48("114156") ? true : (stryCov_9fa48("114156", "114157", "114158"), action === ON_CONFLICT_ACTION.NOTHING)) {
      if (stryMutAct_9fa48("114159")) {
        {}
      } else {
        stryCov_9fa48("114159");
        insertAst.orIgnore = stryMutAct_9fa48("114160") ? false : (stryCov_9fa48("114160"), true);
      }
    } else if (stryMutAct_9fa48("114163") ? action === ON_CONFLICT_ACTION.UPDATE && action === ON_CONFLICT_ACTION.REPLACE : stryMutAct_9fa48("114162") ? false : stryMutAct_9fa48("114161") ? true : (stryCov_9fa48("114161", "114162", "114163"), (stryMutAct_9fa48("114165") ? action !== ON_CONFLICT_ACTION.UPDATE : stryMutAct_9fa48("114164") ? false : (stryCov_9fa48("114164", "114165"), action === ON_CONFLICT_ACTION.UPDATE)) || (stryMutAct_9fa48("114167") ? action !== ON_CONFLICT_ACTION.REPLACE : stryMutAct_9fa48("114166") ? false : (stryCov_9fa48("114166", "114167"), action === ON_CONFLICT_ACTION.REPLACE)))) {
      if (stryMutAct_9fa48("114168")) {
        {}
      } else {
        stryCov_9fa48("114168");
        insertAst.orReplace = stryMutAct_9fa48("114169") ? false : (stryCov_9fa48("114169"), true);
      }
    }
  }
}

/**
 * Reorders a params array based on positional parameter mapping.
 * paramMapping contains 1-based indices; the result array maps
 * each SQL position to the correct original parameter value.
 * @param {Array} params - Original parameters array.
 * @param {number[]} paramMapping - Array of 1-based indices from tracker.
 * @returns {Array} Reordered parameters array.
 */
function reorderParams(params, paramMapping) {
  if (stryMutAct_9fa48("114170")) {
    {}
  } else {
    stryCov_9fa48("114170");
    return paramMapping.map(stryMutAct_9fa48("114171") ? () => undefined : (stryCov_9fa48("114171"), index => params[stryMutAct_9fa48("114172") ? index + MIN_PARAM_INDEX : (stryCov_9fa48("114172"), index - MIN_PARAM_INDEX)]));
  }
}

/**
 * Validates a positional parameter mapping for gaps and out-of-bounds.
 * @param {number[]} mapping - Array of 1-based param indices.
 * @param {number} paramsLength - Length of the provided params array.
 * @throws {Error} If gaps or out-of-bounds indices are found.
 */
function validateParamMapping(mapping, paramsLength) {
  if (stryMutAct_9fa48("114173")) {
    {}
  } else {
    stryCov_9fa48("114173");
    if (stryMutAct_9fa48("114176") ? mapping.length !== 0 : stryMutAct_9fa48("114175") ? false : stryMutAct_9fa48("114174") ? true : (stryCov_9fa48("114174", "114175", "114176"), mapping.length === 0)) {
      if (stryMutAct_9fa48("114177")) {
        {}
      } else {
        stryCov_9fa48("114177");
        return;
      }
    }
    const maxIndex = stryMutAct_9fa48("114178") ? Math.min(...mapping) : (stryCov_9fa48("114178"), Math.max(...mapping));

    // Check out-of-bounds
    if (stryMutAct_9fa48("114182") ? maxIndex <= paramsLength : stryMutAct_9fa48("114181") ? maxIndex >= paramsLength : stryMutAct_9fa48("114180") ? false : stryMutAct_9fa48("114179") ? true : (stryCov_9fa48("114179", "114180", "114181", "114182"), maxIndex > paramsLength)) {
      if (stryMutAct_9fa48("114183")) {
        {}
      } else {
        stryCov_9fa48("114183");
        throw new Error(stryMutAct_9fa48("114184") ? PG_TRANSLATE_ERROR.MISSING_PARAM_INDEX - maxIndex : (stryCov_9fa48("114184"), PG_TRANSLATE_ERROR.MISSING_PARAM_INDEX + maxIndex));
      }
    }

    // Check for gaps: all indices from 1..maxIndex must appear
    const seen = new Set(mapping);
    for (let i = MIN_PARAM_INDEX; stryMutAct_9fa48("114187") ? i > maxIndex : stryMutAct_9fa48("114186") ? i < maxIndex : stryMutAct_9fa48("114185") ? false : (stryCov_9fa48("114185", "114186", "114187"), i <= maxIndex); stryMutAct_9fa48("114188") ? i-- : (stryCov_9fa48("114188"), i++)) {
      if (stryMutAct_9fa48("114189")) {
        {}
      } else {
        stryCov_9fa48("114189");
        if (stryMutAct_9fa48("114192") ? false : stryMutAct_9fa48("114191") ? true : stryMutAct_9fa48("114190") ? seen.has(i) : (stryCov_9fa48("114190", "114191", "114192"), !seen.has(i))) {
          if (stryMutAct_9fa48("114193")) {
            {}
          } else {
            stryCov_9fa48("114193");
            throw new Error(stryMutAct_9fa48("114194") ? PG_TRANSLATE_ERROR.PARAM_GAP - i : (stryCov_9fa48("114194"), PG_TRANSLATE_ERROR.PARAM_GAP + i));
          }
        }
      }
    }
  }
}
export { translateBooleanLiteral, translatePositionalParam, translateTypeCast, translateIlike, translateOnConflict, reorderParams, validateParamMapping };