/**
 * Predicate extraction, row-level condition evaluation, and base row projection
 * helpers for Global Secondary Index read routing.
 */

import {compareRoutingKeys} from '../partition/split-key-comparator.js';

const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_DOUBLE_EQ = '==';
const LOCAL_STR_IS = 'IS';
const LOCAL_STR_LT = '<';
const LOCAL_STR_LTE = '<=';
const LOCAL_STR_GT = '>';
const LOCAL_STR_GTE = '>=';
const LOCAL_STR_BETWEEN = 'BETWEEN';
const LOCAL_STR_AND = 'AND';
const LOCAL_STR_PARAM = 'param';
const LOCAL_STR_PARAMETER = 'parameter';
const LOCAL_STR_IS_NULL = 'IS NULL';
const LOCAL_STR_BETWEEN_TYPE = 'between';
const LOCAL_STR_STAR = '*';
const LOCAL_STR_COLUMN = 'column';

const EQUALITY_OPERATORS = new Set([LOCAL_STR_EQUALS, LOCAL_STR_DOUBLE_EQ, LOCAL_STR_IS]);
const RANGE_OPERATORS = new Set([
  LOCAL_STR_LT,
  LOCAL_STR_LTE,
  LOCAL_STR_GT,
  LOCAL_STR_GTE,
  LOCAL_STR_BETWEEN,
]);

/**
 * Check whether an operator string is a supported equality operator.
 * @param {string} op
 * @return {boolean}
 */
export function isEqualityOperator(op) {
  return EQUALITY_OPERATORS.has(op);
}

/**
 * Check whether an operator string is a supported range operator.
 * @param {string} op
 * @return {boolean}
 */
export function isRangeOperator(op) {
  return RANGE_OPERATORS.has(op);
}

function isColumnNode(node) {
  return Boolean(node && (node.type === LOCAL_STR_COLUMN || node.column));
}

function resolveColAndValNodes(node) {
  if (isColumnNode(node.left)) {
    return {colNode: node.left, valNode: node.right};
  }
  if (isColumnNode(node.right)) {
    return {colNode: node.right, valNode: node.left};
  }
  return {colNode: null, valNode: null};
}

function getColumnNodeName(colNode) {
  if (!colNode) return null;
  const name = colNode.name || colNode.column || colNode.value;
  return typeof name === 'string' ? name : null;
}

function resolvePredicateNodeValue(valNode, params) {
  if (!valNode) return undefined;
  const isParam = valNode.type === LOCAL_STR_PARAM || valNode.type === LOCAL_STR_PARAMETER;
  if (isParam && typeof valNode.index === 'number') {
    return params ? params[valNode.index] : undefined;
  }
  return valNode.value;
}

function recordBetweenCondition(node, params, conditions) {
  const colName = getColumnNodeName(node.expression);
  if (!colName) return;
  conditions.set(colName.toLowerCase(), {
    column: colName,
    operator: LOCAL_STR_BETWEEN,
    value: [
      resolvePredicateNodeValue(node.low, params),
      resolvePredicateNodeValue(node.high, params),
    ],
    node,
  });
}

function recordComparisonCondition(node, op, params, conditions) {
  if (node.type === LOCAL_STR_BETWEEN_TYPE || (op === LOCAL_STR_BETWEEN && node.expression)) {
    recordBetweenCondition(node, params, conditions);
    return;
  }
  const {colNode, valNode} = resolveColAndValNodes(node);
  const colName = getColumnNodeName(colNode);
  if (!colName) return;

  const normalizedOp = op === LOCAL_STR_IS_NULL ? LOCAL_STR_IS : op;
  const value = op === LOCAL_STR_IS_NULL ? null : resolvePredicateNodeValue(valNode, params);
  conditions.set(colName.toLowerCase(), {
    column: colName,
    operator: normalizedOp,
    value,
    node,
  });
}

function extractDictionaryConditions(whereClause, conditions) {
  for (const [col, val] of Object.entries(whereClause)) {
    const lowerCol = col.toLowerCase();
    if (val && typeof val === 'object' && val.operator) {
      conditions.set(lowerCol, {
        column: col,
        operator: String(val.operator).toUpperCase(),
        value: val.value,
      });
    } else {
      conditions.set(lowerCol, {
        column: col,
        operator: LOCAL_STR_EQUALS,
        value: val,
      });
    }
  }
  return conditions;
}

/**
 * Extract column predicate conditions from a WHERE clause (AST or object).
 * @param {Object|null} whereClause
 * @param {Array} [params=[]]
 * @return {Map<string, Object>} Column -> condition description.
 */
export function extractPredicateConditions(whereClause, params = []) {
  const conditions = new Map();
  if (!whereClause) {
    return conditions;
  }

  if (typeof whereClause === 'object' && !whereClause.type && !whereClause.operator) {
    return extractDictionaryConditions(whereClause, conditions);
  }

  function walkNode(node) {
    if (!node) return;
    const op = String(node.operator || node.type || '').toUpperCase();

    if (op === LOCAL_STR_AND) {
      walkNode(node.left);
      walkNode(node.right);
      return;
    }

    if (EQUALITY_OPERATORS.has(op) || RANGE_OPERATORS.has(op) || op === LOCAL_STR_IS_NULL) {
      recordComparisonCondition(node, op, params, conditions);
    }
  }

  walkNode(whereClause);
  return conditions;
}

function resolveRowFieldValue(row, colName) {
  if (!row || typeof row !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(row, colName)) return row[colName];
  const targetLower = colName.toLowerCase();
  const matchedKey = Object.keys(row).find((key) => key.toLowerCase() === targetLower);
  return matchedKey !== undefined ? row[matchedKey] : undefined;
}

function compareConditionValues(left, right) {
  if (left === right) return 0;
  const comparable = typeof left === typeof right && (
    typeof left === 'number' || typeof left === 'bigint' ||
    typeof left === 'string' || Buffer.isBuffer(left)
  );
  if (comparable) return compareRoutingKeys(left, right);
  return left < right ? -1 : 1;
}

function matchesRangeCondition(rowValue, targetValue, op) {
  if (rowValue === null || rowValue === undefined) return false;
  if (op === LOCAL_STR_BETWEEN) {
    return Array.isArray(targetValue) && targetValue.length >= 2 &&
      compareConditionValues(rowValue, targetValue[0]) >= 0 &&
      compareConditionValues(rowValue, targetValue[1]) <= 0;
  }
  const cmp = compareConditionValues(rowValue, targetValue);
  if (op === LOCAL_STR_LT) return cmp < 0;
  if (op === LOCAL_STR_LTE) return cmp <= 0;
  if (op === LOCAL_STR_GT) return cmp > 0;
  if (op === LOCAL_STR_GTE) return cmp >= 0;
  return false;
}

function matchesSingleCondition(row, condition) {
  const rowValue = resolveRowFieldValue(row, condition.column);
  const op = condition.operator;
  if (EQUALITY_OPERATORS.has(op)) {
    return op === LOCAL_STR_IS && condition.value === null ?
      rowValue === null || rowValue === undefined :
      rowValue === condition.value;
  }
  return RANGE_OPERATORS.has(op) ? matchesRangeCondition(rowValue, condition.value, op) : true;
}

/**
 * Filter fetched base rows against extracted predicate conditions.
 * @param {Object[]} rows
 * @param {Object|null} whereClause
 * @param {Array} [params=[]]
 * @return {Object[]}
 */
export function filterRowsByWhereClause(rows, whereClause, params = []) {
  if (!Array.isArray(rows) || rows.length === 0 || !whereClause) return rows;
  const conditions = extractPredicateConditions(whereClause, params);
  if (conditions.size === 0) return rows;
  const conditionList = Array.from(conditions.values());
  return rows.filter((row) => conditionList.every((cond) => matchesSingleCondition(row, cond)));
}

/**
 * Project requested columns onto base rows when a non-star projection list is given.
 * @param {Object[]} rows
 * @param {string[]|null} projectedColumns
 * @return {Object[]}
 */
export function projectBaseRows(rows, projectedColumns) {
  if (!Array.isArray(projectedColumns) || projectedColumns.length === 0) return rows;
  if (projectedColumns.includes(LOCAL_STR_STAR)) return rows;
  return rows.map((row) => {
    const out = {};
    for (const col of projectedColumns) {
      out[col] = resolveRowFieldValue(row, col);
    }
    return out;
  });
}
