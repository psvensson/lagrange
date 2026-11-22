/**
 * AST eligibility, projection, ordering, and limit helpers for SQLQueryEngine
 * Global Secondary Index SELECT execution.
 */

import {EXPR_TYPE} from './parser-constants.js';
import {hasSubqueryCteOrCompound} from './distributed/distributed-select-fanout-soundness.js';
import {isLockingReadAst} from './sql-locking-read-execution.js';
import {
  isEqualityOperator,
  isRangeOperator,
} from '../index-management/global-index-predicate-matcher.js';

const LOCAL_STR_AND = 'AND';
const LOCAL_STR_DESC = 'DESC';
const LOCAL_STR_IS_NULL = 'IS NULL';
const LOCAL_STR_STAR = '*';

function matchesFromTable(qualifier, fromNode) {
  if (!qualifier) return true;
  const lower = String(qualifier).toLowerCase();
  return lower === String(fromNode.name).toLowerCase() ||
    Boolean(fromNode.alias && lower === String(fromNode.alias).toLowerCase());
}

function isSimpleColumnRef(node, fromNode) {
  return Boolean(
    node &&
    node.type === EXPR_TYPE.COLUMN_REF &&
    typeof node.column === 'string' &&
    matchesFromTable(node.table, fromNode),
  );
}

function isLiteralOrParam(node) {
  return Boolean(
    node &&
    (node.type === EXPR_TYPE.LITERAL || node.type === EXPR_TYPE.PARAMETER),
  );
}

function recordSeenColumn(colName, seenColumns) {
  const lower = colName.toLowerCase();
  if (seenColumns.has(lower)) return false;
  seenColumns.add(lower);
  return true;
}

function resolveComparisonColumn(node, op, fromNode) {
  if (op === LOCAL_STR_IS_NULL && isSimpleColumnRef(node.left, fromNode)) {
    return node.left.column;
  }
  if (!isEqualityOperator(op) && !isRangeOperator(op)) return null;
  if (isSimpleColumnRef(node.left, fromNode) && isLiteralOrParam(node.right)) {
    return node.left.column;
  }
  if (isEqualityOperator(op) && isSimpleColumnRef(node.right, fromNode) &&
      isLiteralOrParam(node.left)) {
    return node.right.column;
  }
  return null;
}

function isSupportedComparisonNode(node, fromNode, seenColumns) {
  const op = String(node.operator || '').toUpperCase();
  const colName = resolveComparisonColumn(node, op, fromNode);
  return colName ? recordSeenColumn(colName, seenColumns) : false;
}

function isSupportedBetweenNode(node, fromNode, seenColumns) {
  if (!isSimpleColumnRef(node.expression, fromNode)) return false;
  if (!isLiteralOrParam(node.low) || !isLiteralOrParam(node.high)) return false;
  return recordSeenColumn(node.expression.column, seenColumns);
}

function isSupportedGsiWhereAst(node, fromNode, seenColumns = new Set()) {
  if (!node) return true;
  if (node.type === EXPR_TYPE.BETWEEN) {
    return isSupportedBetweenNode(node, fromNode, seenColumns);
  }
  if (node.type !== EXPR_TYPE.BINARY) return false;
  if (String(node.operator || '').toUpperCase() === LOCAL_STR_AND) {
    return isSupportedGsiWhereAst(node.left, fromNode, seenColumns) &&
      isSupportedGsiWhereAst(node.right, fromNode, seenColumns);
  }
  return isSupportedComparisonNode(node, fromNode, seenColumns);
}

function isSupportedOrderByAst(orderBy, fromNode) {
  if (!Array.isArray(orderBy) || orderBy.length === 0) return true;
  return orderBy.every((term) => isSimpleColumnRef(term?.expression, fromNode));
}

function extractStarProjection(columns, fromNode) {
  const hasMismatch = columns.some((c) => c?.table && !matchesFromTable(c.table, fromNode));
  if (hasMismatch || columns.length > 1) return null;
  return {isStar: true, fetchColumns: [LOCAL_STR_STAR], outputColumns: null, aliases: null};
}

function appendOrderByFetchColumns(orderBy, fetchSet) {
  for (const term of orderBy || []) {
    if (term?.expression?.column) fetchSet.add(term.expression.column);
  }
}

function extractSimpleSelectProjection(ast) {
  const columns = Array.isArray(ast.columns) ? ast.columns : [];
  if (columns.length === 0) return null;
  if (columns.some((c) => c?.type === EXPR_TYPE.STAR)) {
    return extractStarProjection(columns, ast.from);
  }
  const outputColumns = [];
  const aliases = new Map();
  const fetchSet = new Set();
  for (const col of columns) {
    if (col?.type !== EXPR_TYPE.COLUMN || !isSimpleColumnRef(col.expression, ast.from)) {
      return null;
    }
    const colName = col.expression.column;
    outputColumns.push({sourceCol: colName, outputKey: col.alias || colName});
    fetchSet.add(colName);
    if (col.alias) aliases.set(colName, col.alias);
  }
  appendOrderByFetchColumns(ast.orderBy, fetchSet);
  return {
    isStar: false,
    fetchColumns: Array.from(fetchSet),
    outputColumns,
    aliases,
  };
}

function compareSortValues(aVal, bVal, direction) {
  if (aVal === bVal) return 0;
  const dir = String(direction || '').toUpperCase() === LOCAL_STR_DESC ? -1 : 1;
  if (aVal === null || aVal === undefined) return -1 * dir;
  if (bVal === null || bVal === undefined) return 1 * dir;
  return aVal < bVal ? -1 * dir : 1 * dir;
}

function applyAstOrderBy(rows, orderBy) {
  if (!Array.isArray(orderBy) || orderBy.length === 0 || rows.length <= 1) {
    return rows;
  }
  return [...rows].sort((a, b) => {
    for (const term of orderBy) {
      const col = term.expression.column;
      const cmp = compareSortValues(a[col], b[col], term.direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

function resolveNumericClauseOperand(operand, params) {
  if (operand === null || operand === undefined) return null;
  if (typeof operand === 'number') return operand;
  if (operand.type === EXPR_TYPE.PARAMETER) return Number(params?.[operand.index]);
  return Number(operand.value);
}

function applyAstLimit(rows, limit, params) {
  if (!limit) return rows;
  const offset = resolveNumericClauseOperand(limit.offset, params) || 0;
  const count = resolveNumericClauseOperand(limit.count, params);
  const start = Math.max(0, offset);
  return Number.isFinite(count) ? rows.slice(start, start + Math.max(0, count)) : rows.slice(start);
}

function projectOutputRows(rows, projection) {
  if (projection.isStar) return rows;
  return rows.map((row) => {
    const out = {};
    for (const item of projection.outputColumns) {
      out[item.outputKey] = row[item.sourceCol];
    }
    return out;
  });
}

function hasUnsupportedSelectClauses(ast) {
  if (hasSubqueryCteOrCompound(ast)) return true;
  if (Array.isArray(ast.joins) && ast.joins.length > 0) return true;
  return Boolean(ast.distinct || ast.groupBy || ast.having || isLockingReadAst(ast));
}

export {
  applyAstLimit,
  applyAstOrderBy,
  extractSimpleSelectProjection,
  hasUnsupportedSelectClauses,
  isSupportedGsiWhereAst,
  isSupportedOrderByAst,
  projectOutputRows,
};
