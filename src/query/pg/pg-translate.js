/**
 * Stateless PG-to-SQLite AST translation functions.
 * Each function transforms a PG-specific AST node into a
 * SQLite-compatible Internal_AST node.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 5.1, 5.2,
 *               6.1, 6.2, 14.1, 14.2
 */

import {EXPR_TYPE} from '../parser-constants.js';
import {PG_TRANSLATE_ERROR, PG_EXPR_TYPE} from './pg-compat-constants.js';
import {resolveAffinity} from './pg-type-affinity.js';

/**
 * Boolean literal value mapping.
 * TRUE → 1, FALSE → 0.
 */
const BOOLEAN_VALUE = Object.freeze({
  TRUE: 1,
  FALSE: 0,
});

/**
 * ON CONFLICT action keywords from node-sql-parser PG AST.
 */
const ON_CONFLICT_ACTION = Object.freeze({
  NOTHING: 'nothing',
  REPLACE: 'replace',
  UPDATE: 'update',
});

/**
 * ILIKE operator name used in the PG AST.
 */
const ILIKE_OPERATOR = 'ILIKE';
const NOT_ILIKE_OPERATOR = 'NOT ILIKE';

/**
 * LOWER function name for ILIKE translation.
 */
const LOWER_FN_NAME = 'lower';

/**
 * Minimum valid positional parameter index (1-based).
 */
const MIN_PARAM_INDEX = 1;

const EMPTY_TYPE_FALLBACK = '';
const EMPTY_ACTION_FALLBACK = '';

/**
 * Translates a PG boolean literal node to an integer literal node.
 * TRUE → 1, FALSE → 0.
 * @param {Object} expr - PG boolean literal node with a boolean value.
 * @returns {Object} Internal_AST literal node with integer value.
 */
function translateBooleanLiteral(expr) {
  const value = expr.value === true ? BOOLEAN_VALUE.TRUE : BOOLEAN_VALUE.FALSE;
  return {type: EXPR_TYPE.LITERAL, value};
}

/**
 * Translates a PG positional parameter ($N) to a parameter node.
 * Records the 1-based index in the tracker array for later reordering.
 * @param {Object} expr - PG positional param node with numeric value.
 * @param {number[]} tracker - Array to push the 1-based param index into.
 * @returns {Object} Internal_AST parameter node.
 */
function translatePositionalParam(expr, tracker) {
  const index = expr.value;
  tracker.push(index);
  return {type: EXPR_TYPE.PARAMETER};
}

/**
 * Translates a PG type cast expression to a CAST node.
 * Handles both ::type and CAST(expr AS type) forms.
 * @param {Object} expr - PG cast node with target type and inner expression.
 * @param {Function} convertExprFn - Callback to convert the inner expression.
 * @returns {Object} Internal_AST cast node with resolved affinity.
 */
function translateTypeCast(expr, convertExprFn) {
  const innerExpr = convertExprFn(expr.expr);
  const pgType = expr.target?.dataType || expr.as || EMPTY_TYPE_FALLBACK;
  const affinity = resolveAffinity(pgType);
  return {
    type: PG_EXPR_TYPE.CAST,
    expression: innerExpr,
    affinity,
  };
}

/**
 * Translates an ILIKE binary expression to a LIKE node
 * with both operands wrapped in LOWER().
 * @param {Object} expr - PG binary expression with ILIKE operator.
 * @param {Function} convertExprFn - Callback to convert operands.
 * @returns {Object} Internal_AST LIKE node with LOWER-wrapped operands.
 */
function translateIlike(expr, convertExprFn) {
  const left = convertExprFn(expr.left);
  const right = convertExprFn(expr.right);
  const operator = expr.operator.toUpperCase();
  const negated = operator === NOT_ILIKE_OPERATOR;

  const wrapLower = (node) => ({
    type: PG_EXPR_TYPE.FUNCTION_CALL,
    name: LOWER_FN_NAME,
    args: [node],
  });

  return {
    type: EXPR_TYPE.LIKE,
    expression: wrapLower(left),
    pattern: wrapLower(right),
    negated,
  };
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
  if (!onConflict) {
    return;
  }

  const action = (
    onConflict.action?.expr?.value ||
    onConflict.action?.expr?.type ||
    EMPTY_ACTION_FALLBACK
  ).toLowerCase();
  if (action === ON_CONFLICT_ACTION.NOTHING) {
    insertAst.orIgnore = true;
  } else if (
    action === ON_CONFLICT_ACTION.UPDATE ||
    action === ON_CONFLICT_ACTION.REPLACE
  ) {
    insertAst.orReplace = true;
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
  return paramMapping.map((index) => params[index - MIN_PARAM_INDEX]);
}

/**
 * Validates a positional parameter mapping for gaps and out-of-bounds.
 * @param {number[]} mapping - Array of 1-based param indices.
 * @param {number} paramsLength - Length of the provided params array.
 * @throws {Error} If gaps or out-of-bounds indices are found.
 */
function validateParamMapping(mapping, paramsLength) {
  if (mapping.length === 0) {
    return;
  }

  const maxIndex = Math.max(...mapping);

  // Check out-of-bounds
  if (maxIndex > paramsLength) {
    throw new Error(
      PG_TRANSLATE_ERROR.MISSING_PARAM_INDEX + maxIndex
    );
  }

  // Check for gaps: all indices from 1..maxIndex must appear
  const seen = new Set(mapping);
  for (let i = MIN_PARAM_INDEX; i <= maxIndex; i++) {
    if (!seen.has(i)) {
      throw new Error(
        PG_TRANSLATE_ERROR.PARAM_GAP + i
      );
    }
  }
}

export {
  translateBooleanLiteral,
  translatePositionalParam,
  translateTypeCast,
  translateIlike,
  translateOnConflict,
  reorderParams,
  validateParamMapping,
};