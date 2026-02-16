/**
 * PostgreSQL function name translation registry.
 * Maps PG function names to translator functions that produce
 * SQLite-compatible Internal_AST nodes.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3
 */

import {EXPR_TYPE} from './sql-parser.js';
import {
  PG_EXPR_TYPE,
  PG_EXTRACT_FORMAT,
  PG_DATE_TRUNC_FORMAT,
  PG_TRANSLATE_ERROR,
} from './pg-compat-constants.js';

/**
 * Literal value for the 'now' argument used in datetime/date/time functions.
 */
const NOW_LITERAL = 'now';

/**
 * SQLite function names used in translations.
 */
const SQLITE_FN = Object.freeze({
  DATETIME: 'datetime',
  DATE: 'date',
  TIME: 'time',
  STRFTIME: 'strftime',
  SUBSTR: 'substr',
});

/**
 * Binary operator for string concatenation.
 */
const CONCAT_OPERATOR = '||';

/**
 * Creates a literal AST node with the given string value.
 * @param {string} value - The literal string value.
 * @returns {Object} Internal_AST literal node.
 */
function makeLiteral(value) {
  return {type: EXPR_TYPE.LITERAL, value};
}

/**
 * Creates a function_call AST node.
 * @param {string} name - SQLite function name.
 * @param {Object[]} args - Translated argument AST nodes.
 * @returns {Object} Internal_AST function_call node.
 */
function makeFunctionCall(name, args) {
  return {type: PG_EXPR_TYPE.FUNCTION_CALL, name, args};
}

/**
 * Translates CONCAT(a, b, ...) to a binary expression chain: ((a || b) || c).
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @returns {Object} Internal_AST binary expression chain with || operator.
 */
function translateConcat(args, convertExprFn) {
  const converted = args.map(convertExprFn);
  return converted.reduce((left, right) => ({
    type: EXPR_TYPE.BINARY,
    operator: CONCAT_OPERATOR,
    left,
    right,
  }));
}

/**
 * Translates SUBSTRING(str, start, len) to SUBSTR(str, start, len).
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @returns {Object} Internal_AST function_call node for substr.
 */
function translateSubstring(args, convertExprFn) {
  const converted = args.map(convertExprFn);
  return makeFunctionCall(SQLITE_FN.SUBSTR, converted);
}

/**
 * Translates NOW() / CURRENT_TIMESTAMP to datetime('now').
 * @returns {Object} Internal_AST function_call node for datetime('now').
 */
function translateNow() {
  return makeFunctionCall(SQLITE_FN.DATETIME, [makeLiteral(NOW_LITERAL)]);
}

/**
 * Translates CURRENT_DATE to date('now').
 * @returns {Object} Internal_AST function_call node for date('now').
 */
function translateCurrentDate() {
  return makeFunctionCall(SQLITE_FN.DATE, [makeLiteral(NOW_LITERAL)]);
}

/**
 * Translates CURRENT_TIME to time('now').
 * @returns {Object} Internal_AST function_call node for time('now').
 */
function translateCurrentTime() {
  return makeFunctionCall(SQLITE_FN.TIME, [makeLiteral(NOW_LITERAL)]);
}

/**
 * Translates EXTRACT(field FROM expr) to CAST(strftime(format, expr) AS INTEGER).
 * @param {Object[]} args - args[0] is the field name node, args[1] is the expression.
 * @param {Function} convertExprFn - Callback to convert the expression argument.
 * @returns {Object} Internal_AST CAST node wrapping a strftime function_call.
 * @throws {Error} If the extract field is not supported.
 */
function translateExtract(args, convertExprFn) {
  const field = (args[0].value || args[0]).toString().toLowerCase();
  const format = PG_EXTRACT_FORMAT[field];
  if (!format) {
    throw new Error(PG_TRANSLATE_ERROR.UNSUPPORTED_EXTRACT_FIELD + field);
  }
  const expr = convertExprFn(args[1]);
  const strftimeCall = makeFunctionCall(
    SQLITE_FN.STRFTIME, [makeLiteral(format), expr],
  );
  return {
    type: PG_EXPR_TYPE.CAST,
    expression: strftimeCall,
    affinity: 'INTEGER',
  };
}

/**
 * Translates DATE_TRUNC(precision, expr) to strftime(format, expr).
 * @param {Object[]} args - args[0] is the precision node, args[1] is the expression.
 * @param {Function} convertExprFn - Callback to convert the expression argument.
 * @returns {Object} Internal_AST function_call node for strftime.
 * @throws {Error} If the date_trunc precision is not supported.
 */
function translateDateTrunc(args, convertExprFn) {
  const precision = (args[0].value || args[0]).toString().toLowerCase();
  const format = PG_DATE_TRUNC_FORMAT[precision];
  if (!format) {
    throw new Error(
      PG_TRANSLATE_ERROR.UNSUPPORTED_DATE_TRUNC_FIELD + precision,
    );
  }
  const expr = convertExprFn(args[1]);
  return makeFunctionCall(SQLITE_FN.STRFTIME, [makeLiteral(format), expr]);
}

/**
 * Pass-through translator: preserves the function name and converts args.
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @param {string} name - Original function name.
 * @returns {Object} Internal_AST function_call node with original name.
 */
function passThrough(args, convertExprFn, name) {
  const converted = args.map(convertExprFn);
  return makeFunctionCall(name, converted);
}

/**
 * Registry mapping PG function names (lowercased) to translator functions.
 * Each translator has signature: (args, convertExprFn, name) => ASTNode.
 */
const PG_FUNCTION_MAP = new Map([
  ['concat', translateConcat],
  ['substring', translateSubstring],
  ['now', translateNow],
  ['current_timestamp', translateNow],
  ['current_date', translateCurrentDate],
  ['current_time', translateCurrentTime],
  ['extract', translateExtract],
  ['date_trunc', translateDateTrunc],
  ['length', passThrough],
  ['lower', passThrough],
  ['upper', passThrough],
  ['trim', passThrough],
  ['coalesce', passThrough],
  ['nullif', passThrough],
  ['substr', passThrough],
]);

/**
 * Main entry point: translates a PG function call to a SQLite-compatible
 * AST node using the function registry.
 * If the function is not in the registry, passes it through unchanged.
 * @param {string} name - PG function name (case-insensitive).
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @returns {Object} Internal_AST node (function_call, binary, or cast).
 */
function translateFunctionCall(name, args, convertExprFn) {
  const normalized = name.toLowerCase();
  const translator = PG_FUNCTION_MAP.get(normalized);
  if (translator) {
    return translator(args, convertExprFn, normalized);
  }
  // Unknown function: pass through with original name and converted args
  const converted = args.map(convertExprFn);
  return makeFunctionCall(name, converted);
}

export {translateFunctionCall, PG_FUNCTION_MAP};
