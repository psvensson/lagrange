/**
 * Pushdown soundness and order-independence classification for distributed
 * SELECT planning (design coordinator-sqlite-merge §2.2, §2.3, Revision 6).
 *
 * @module query/distributed/distributed-select-fanout-soundness
 */

import {
  TRANSACTION_ADMITTED_FUNCTIONS,
} from '../../partition/partition-transaction-determinism-constants.js';
import {EXPR_TYPE, SQL_DEFAULT_COLLATION} from '../parser-constants.js';
import {PG_EXPR_TYPE} from '../pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from '../query-constants.js';

const FUNCTION_EXPR_TYPE = 'function';
const AND_OPERATOR = 'AND';

const ROWID_ALIASES = new Set(['rowid', '_rowid_', 'oid']);
const ALLOWLISTED_COLUMN_TYPES = new Set(['INTEGER', 'REAL', 'TEXT']);
const PARTIAL_COUNT_NAME = 'COUNT';
const PARTIAL_MIN_MAX_NAMES = new Set(['MIN', 'MAX']);
const GUARDED_SUM_NAMES = new Set(['SUM', 'AVG', 'TOTAL']);
const FUNCTION_CALL_AGGREGATE_NAMES = new Set([
  'total',
  'group_concat',
  'string_agg',
  'json_group_array',
  'json_group_object',
  'jsonb_group_array',
  'jsonb_group_object',
]);

const CURRENT_TIME_KEYWORDS = new Set([
  'current_date',
  'current_time',
  'current_timestamp',
]);

// SQLite date/time functions whose time-value and modifier arguments must be
// inspected for 'now', 'localtime', 'utc', or non-literal expressions (§2.2 G1
// and Revision 6 §3).
const DATETIME_FUNCTIONS_FIRST_ARG = new Set([
  'date',
  'time',
  'datetime',
  'julianday',
  'unixepoch',
]);
const STRFTIME_NAME = 'strftime';
const TIMEDIFF_NAME = 'timediff';
const NOW_LITERAL = 'now';
const LOCALTIME_MODIFIER = 'localtime';
const UTC_MODIFIER = 'utc';

const DETERMINISTIC_SCALAR_FUNCTIONS = new Set([
  ...TRANSACTION_ADMITTED_FUNCTIONS,
  'coalesce',
  'if',
  'iif',
  'ifnull',
  'likelihood',
  'likely',
  'unlikely',
  'printf',
  'format',
  'sign',
  'glob',
  'like',
  'concat',
  'concat_ws',
  'octet_length',
  'zeroblob',
  ...DATETIME_FUNCTIONS_FIRST_ARG,
  STRFTIME_NAME,
  TIMEDIFF_NAME,
]);

const ROWID_REFUSAL_MSG =
  'rowid, _rowid_, and oid are not supported in multi-partition SELECT queries';

const LITERAL_SCALAR_VALUE_TYPES = new Set(['string', 'number', 'bigint']);
const SKIPPED_EXPR_WALK_KEYS = new Set(['query', 'subquery', 'type', 'span']);

function createUnsupportedSqlError(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  return error;
}

function isStringOrNumberLiteral(node) {
  if (!node || node.type !== EXPR_TYPE.LITERAL) return false;
  return LITERAL_SCALAR_VALUE_TYPES.has(typeof node.value);
}

function isSafeTimeValueLiteral(node) {
  if (!isStringOrNumberLiteral(node)) return false;
  return String(node.value).trim().toLowerCase() !== NOW_LITERAL;
}

function isSafeModifierLiteral(node) {
  if (!isStringOrNumberLiteral(node)) return false;
  const normalized = String(node.value).trim().toLowerCase();
  return normalized !== LOCALTIME_MODIFIER && normalized !== UTC_MODIFIER;
}

function isPerStatementFirstArgDateTime(args) {
  if (!Array.isArray(args) || args.length === 0) return true;
  if (!isSafeTimeValueLiteral(args[0])) return true;
  return args.slice(1).some((mod) => !isSafeModifierLiteral(mod));
}

function isPerStatementStrftime(args) {
  if (!Array.isArray(args) || args.length < 2) return true;
  if (!isSafeTimeValueLiteral(args[1])) return true;
  return args.slice(2).some((mod) => !isSafeModifierLiteral(mod));
}

function isPerStatementTimediff(args) {
  if (!Array.isArray(args) || args.length < 2) return true;
  return !isSafeTimeValueLiteral(args[0]) || !isSafeTimeValueLiteral(args[1]);
}

function isPerStatementDateTimeCall(lowerName, args) {
  if (CURRENT_TIME_KEYWORDS.has(lowerName)) {
    return true;
  }
  if (DATETIME_FUNCTIONS_FIRST_ARG.has(lowerName)) {
    return isPerStatementFirstArgDateTime(args);
  }
  if (lowerName === STRFTIME_NAME) {
    return isPerStatementStrftime(args);
  }
  if (lowerName === TIMEDIFF_NAME) {
    return isPerStatementTimediff(args);
  }
  return false;
}

/**
 * Whether an AST subtree contains a per-statement time construct (`CURRENT_*`,
 * `'now'`, `'localtime'`, `'utc'`, or a date/time call with non-literal time or
 * modifier arguments).
 * @param {*} node - AST node or array.
 * @return {boolean}
 */
function isPerStatementTimeExpression(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(isPerStatementTimeExpression);
  if (node.type === PG_EXPR_TYPE.FUNCTION_CALL || node.type === FUNCTION_EXPR_TYPE) {
    const lowerName = String(node.name || '').toLowerCase();
    if (isPerStatementDateTimeCall(lowerName, node.args || [])) {
      return true;
    }
  }
  return Object.values(node).some(isPerStatementTimeExpression);
}

/**
 * Whether an expression is deterministic (no per-statement time construct and
 * every scalar function is in the vetted deterministic function allowlist).
 * @param {*} node - AST node or array.
 * @return {boolean}
 */
function isDeterministicExpression(node) {
  if (!node || typeof node !== 'object') return true;
  if (Array.isArray(node)) return node.every(isDeterministicExpression);
  if (node.type === PG_EXPR_TYPE.FUNCTION_CALL || node.type === FUNCTION_EXPR_TYPE) {
    const lowerName = String(node.name || '').toLowerCase();
    if (isPerStatementDateTimeCall(lowerName, node.args || [])) {
      return false;
    }
    if (!DETERMINISTIC_SCALAR_FUNCTIONS.has(lowerName)) {
      return false;
    }
  }
  return Object.values(node).every((val) =>
    !val || typeof val !== 'object' || isDeterministicExpression(val),
  );
}

function declaredColumnNamesSet(schema) {
  const names = new Set();
  for (const col of schema?.columns || []) {
    if (typeof col?.name === 'string') {
      names.add(col.name.toLowerCase());
    }
  }
  return names;
}

function nodeHasUnshadowedRowid(node, declaredNames) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    return node.some((entry) => nodeHasUnshadowedRowid(entry, declaredNames));
  }
  if (node.type === EXPR_TYPE.COLUMN_REF && typeof node.column === 'string') {
    const lower = node.column.toLowerCase();
    if (ROWID_ALIASES.has(lower) && !declaredNames.has(lower)) {
      return true;
    }
  }
  return Object.values(node).some((val) => nodeHasUnshadowedRowid(val, declaredNames));
}

/**
 * Whether a SELECT AST references an unshadowed `rowid`, `_rowid_`, or `oid`.
 * @param {Object} ast - SELECT AST.
 * @param {Object|null} [schema] - Catalog table schema.
 * @return {boolean}
 */
function hasUnshadowedRowidReference(ast, schema = null) {
  const declaredNames = declaredColumnNamesSet(schema);
  return nodeHasUnshadowedRowid(ast, declaredNames);
}

/**
 * Refuse multi-partition SELECT queries that reference unshadowed `rowid`,
 * `_rowid_`, or `oid` aliases.
 * @param {Object} ast - SELECT AST.
 * @param {number} partitionCount - Number of target partitions.
 * @param {Object|null} [schema] - Catalog table schema.
 */
function assertMultiPartitionRowidAdmissible(ast, partitionCount, schema = null) {
  if (partitionCount > 1 && hasUnshadowedRowidReference(ast, schema)) {
    throw createUnsupportedSqlError(ROWID_REFUSAL_MSG);
  }
}

function findSchemaColumn(schema, columnName) {
  if (!Array.isArray(schema?.columns) || typeof columnName !== 'string') {
    return null;
  }
  const lower = columnName.toLowerCase();
  return schema.columns.find((col) =>
    typeof col?.name === 'string' && col.name.toLowerCase() === lower,
  ) || null;
}

function unwrapCollateColumn(expr) {
  if (!expr || typeof expr !== 'object') return null;
  if (expr.type === EXPR_TYPE.COLLATE) {
    if (expr.expression?.type !== EXPR_TYPE.COLUMN_REF) return null;
    return {
      columnRef: expr.expression,
      explicitCollation: String(expr.collation || '').toUpperCase(),
    };
  }
  if (expr.type === EXPR_TYPE.COLUMN_REF) {
    return {columnRef: expr, explicitCollation: null};
  }
  return null;
}

function extractColumnDeclaredType(colDef) {
  if (typeof colDef?.type === 'string') return colDef.type.toUpperCase();
  if (typeof colDef?.dataType === 'string') return colDef.dataType.toUpperCase();
  return '';
}

function extractColumnEffectiveCollation(colDef, explicitCollation) {
  if (explicitCollation !== null) return explicitCollation;
  if (typeof colDef?.collation === 'string' && colDef.collation.length > 0) {
    return colDef.collation.toUpperCase();
  }
  return SQL_DEFAULT_COLLATION;
}

/**
 * Whether an expression is a bare column reference on the §2.2 order-
 * independence allowlist: declared type normalized to INTEGER, REAL, or TEXT,
 * and effective collation BINARY.
 * @param {Object} expr - Expression node.
 * @param {Object|null} [schema] - Catalog table schema.
 * @return {boolean}
 */
function isAllowlistedColumnExpr(expr, schema = null) {
  const unwrapped = unwrapCollateColumn(expr);
  if (!unwrapped) return false;
  const {columnRef, explicitCollation} = unwrapped;
  if (explicitCollation !== null && explicitCollation !== SQL_DEFAULT_COLLATION) {
    return false;
  }
  if (!Array.isArray(schema?.columns) || schema.columns.length === 0) {
    return true;
  }
  const colDef = findSchemaColumn(schema, columnRef.column);
  if (!colDef) return false;
  const declaredType = extractColumnDeclaredType(colDef);
  const effectiveCollation = extractColumnEffectiveCollation(colDef, explicitCollation);
  return ALLOWLISTED_COLUMN_TYPES.has(declaredType) &&
    effectiveCollation === SQL_DEFAULT_COLLATION;
}

function nodeContainsSubquery(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(nodeContainsSubquery);
  if (
    node.type === PG_EXPR_TYPE.SUBQUERY ||
    node.type === PG_EXPR_TYPE.EXISTS ||
    (node.type === EXPR_TYPE.IN && Boolean(node.subquery))
  ) {
    return true;
  }
  return Object.values(node).some(nodeContainsSubquery);
}

/**
 * Whether a SELECT AST has CTEs, compound set operations, derived tables,
 * joins, or expression subqueries.
 * @param {Object} ast - SELECT AST.
 * @return {boolean}
 */
function hasNestedOrCompoundSelect(ast) {
  if (!ast || typeof ast !== 'object') return false;
  if (Array.isArray(ast.ctes) && ast.ctes.length > 0) return true;
  if (ast.setOperation) return true;
  if (ast.from?.subquery) return true;
  if (Array.isArray(ast.joins) && ast.joins.length > 0) return true;
  return [ast.columns, ast.where, ast.groupBy, ast.having, ast.orderBy]
    .some(nodeContainsSubquery);
}

/**
 * Whether a SELECT AST has CTEs, compound set operations, derived tables,
 * a join against a CTE or derived table, or expression subqueries.
 * @param {Object} ast - SELECT AST.
 * @return {boolean}
 */
function hasSubqueryCteOrCompound(ast) {
  if (!ast || typeof ast !== 'object') return false;
  if (Array.isArray(ast.ctes) && ast.ctes.length > 0) return true;
  if (ast.setOperation) return true;
  if (ast.from?.subquery) return true;
  if ((ast.joins || []).some((join) => Boolean(join?.table?.subquery))) {
    return true;
  }
  const joinConds = (ast.joins || []).map((join) => join?.condition);
  return [ast.columns, ast.where, ast.groupBy, ast.having, ast.orderBy, joinConds]
    .some(nodeContainsSubquery);
}

function extractSubquerySelectAst(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.query && typeof node.query === 'object') return node.query;
  if (node.subquery && typeof node.subquery === 'object') return node.subquery;
  return node;
}

function visitTableRelation(relation, activeCtes, visitSelect, recordBaseTable) {
  if (!relation || typeof relation !== 'object') return;
  if (relation.subquery) {
    visitSelect(relation.subquery, activeCtes);
    return;
  }
  if (typeof relation.name === 'string') {
    recordBaseTable(relation.name, activeCtes);
  }
}

function visitCteList(ctes, activeCtes, visitSelect) {
  if (!Array.isArray(ctes)) return;
  for (const cte of ctes) {
    if (typeof cte?.name === 'string' && cte.name.length > 0) {
      activeCtes.add(cte.name.toLowerCase());
    }
    if (cte?.query) {
      visitSelect(cte.query, activeCtes);
    }
  }
}

function visitJoinList(joins, activeCtes, visitSelect, visitExpr, recordBaseTable) {
  if (!Array.isArray(joins)) return;
  for (const join of joins) {
    visitTableRelation(join?.table, activeCtes, visitSelect, recordBaseTable);
    visitExpr(join?.condition, activeCtes);
  }
}

/**
 * Collect all distinct base catalog table names referenced anywhere in a
 * SELECT AST (across CTEs, derived tables, joins, compounds, and expression
 * subqueries), excluding CTE names.
 * @param {Object} ast - SELECT AST.
 * @return {string[]} Ordered list of distinct base table names.
 */
function collectAllBaseTableNames(ast) {
  const baseTables = [];
  const seenLower = new Set();

  const recordBaseTable = (name, activeCtes) => {
    if (typeof name !== 'string' || name.length === 0) return;
    const lower = name.toLowerCase();
    if (activeCtes.has(lower) || seenLower.has(lower)) return;
    seenLower.add(lower);
    baseTables.push(name);
  };

  let visitSelect = null;

  const visitExpr = (node, activeCtes) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visitExpr(item, activeCtes);
      return;
    }
    if (node.type === PG_EXPR_TYPE.SUBQUERY || node.type === PG_EXPR_TYPE.EXISTS) {
      visitSelect(extractSubquerySelectAst(node), activeCtes);
    } else if (node.type === EXPR_TYPE.IN && node.subquery) {
      visitSelect(extractSubquerySelectAst(node.subquery), activeCtes);
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_EXPR_WALK_KEYS.has(key)) continue;
      visitExpr(value, activeCtes);
    }
  };

  visitSelect = (selectNode, inheritedCtes) => {
    if (!selectNode || typeof selectNode !== 'object') return;
    const activeCtes = new Set(inheritedCtes);
    visitCteList(selectNode.ctes, activeCtes, visitSelect);
    visitTableRelation(selectNode.from, activeCtes, visitSelect, recordBaseTable);
    visitJoinList(selectNode.joins, activeCtes, visitSelect, visitExpr, recordBaseTable);
    visitExpr(
      [
        selectNode.columns,
        selectNode.where,
        selectNode.groupBy,
        selectNode.having,
        selectNode.orderBy,
      ],
      activeCtes,
    );
    if (selectNode.setOperation?.right) {
      visitSelect(selectNode.setOperation.right, activeCtes);
    }
  };

  visitSelect(ast, new Set());
  return baseTables;
}

function isFunctionCallAggregateNode(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type !== PG_EXPR_TYPE.FUNCTION_CALL && node.type !== FUNCTION_EXPR_TYPE) {
    return false;
  }
  return FUNCTION_CALL_AGGREGATE_NAMES.has(String(node.name || '').toLowerCase());
}

function collectAggregatesFromNode(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectAggregatesFromNode(item, out);
    return;
  }
  if (node.type === EXPR_TYPE.AGGREGATE) {
    out.push(node);
    return;
  }
  if (isFunctionCallAggregateNode(node)) {
    out.push({
      type: EXPR_TYPE.AGGREGATE,
      function: String(node.name || '').toUpperCase(),
      argument: node.args?.[0] || null,
      distinct: false,
      isFunctionCallNode: true,
    });
    return;
  }
  for (const value of Object.values(node)) {
    collectAggregatesFromNode(value, out);
  }
}

function collectSelectAggregates(ast) {
  const out = [];
  collectAggregatesFromNode(ast.columns, out);
  collectAggregatesFromNode(ast.having, out);
  collectAggregatesFromNode(ast.orderBy, out);
  return out;
}

function buildSelectAliasMap(columns, schema = null) {
  const declaredNames = declaredColumnNamesSet(schema);
  const map = new Map();
  for (const col of columns || []) {
    if (typeof col?.alias === 'string' && col.alias.length > 0 && col.expression) {
      const lower = col.alias.toLowerCase();
      if (!declaredNames.has(lower)) {
        map.set(lower, col.expression);
      }
    }
  }
  return map;
}

function hasNonKeyBareColumnInNode(node, groupKeySet, aliasMap, allowAliases) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    return node.some((item) =>
      hasNonKeyBareColumnInNode(item, groupKeySet, aliasMap, allowAliases));
  }
  if (node.type === EXPR_TYPE.STAR) return true;
  if (node.type === EXPR_TYPE.AGGREGATE || isFunctionCallAggregateNode(node)) {
    return false;
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) {
    const lower = String(node.column || '').toLowerCase();
    if (allowAliases && !node.table && aliasMap.has(lower)) {
      return hasNonKeyBareColumnInNode(
        aliasMap.get(lower),
        groupKeySet,
        aliasMap,
        false,
      );
    }
    return !groupKeySet.has(lower);
  }
  return Object.values(node).some((val) =>
    hasNonKeyBareColumnInNode(val, groupKeySet, aliasMap, allowAliases));
}

function isPositionalOrderByLiteral(expr) {
  return expr?.type === EXPR_TYPE.LITERAL && Number.isInteger(expr.value);
}

function hasNonKeyBareColumnInSelectList(columns, groupKeySet, aliasMap) {
  const list = Array.isArray(columns) ? columns : [];
  return list.some(
    (col) =>
      col.type === EXPR_TYPE.STAR ||
      hasNonKeyBareColumnInNode(col.expression, groupKeySet, aliasMap, false),
  );
}

function hasNonKeyBareColumnInOrderByList(orderBy, groupKeySet, aliasMap) {
  const terms = Array.isArray(orderBy) ? orderBy : [];
  for (const term of terms) {
    const expr = term?.expression ?? term;
    if (isPositionalOrderByLiteral(expr)) continue;
    if (hasNonKeyBareColumnInNode(expr, groupKeySet, aliasMap, true)) {
      return true;
    }
  }
  return false;
}

function hasNonKeyBareColumns(ast, groupKeySet, schema = null) {
  const aliasMap = buildSelectAliasMap(ast.columns, schema);
  if (hasNonKeyBareColumnInSelectList(ast.columns, groupKeySet, aliasMap)) {
    return true;
  }
  if (hasNonKeyBareColumnInNode(ast.having, groupKeySet, aliasMap, false)) {
    return true;
  }
  return hasNonKeyBareColumnInOrderByList(ast.orderBy, groupKeySet, aliasMap);
}

function classifySingleAggregate(agg, schema) {
  if (agg.isFunctionCallNode === true) {
    return {
      orderIndependent: false,
      partialEligible: false,
      isDistinctCount: false,
      isGuardedSum: false,
    };
  }
  const fn = String(agg.function || '').toUpperCase();
  if (fn === PARTIAL_COUNT_NAME) {
    if (!agg.distinct) {
      const argOk = agg.argument?.type === EXPR_TYPE.STAR ||
        isDeterministicExpression(agg.argument);
      return {
        orderIndependent: argOk,
        partialEligible: argOk,
        isDistinctCount: false,
        isGuardedSum: false,
      };
    }
    const allowlisted = isAllowlistedColumnExpr(agg.argument, schema);
    return {
      orderIndependent: allowlisted,
      partialEligible: allowlisted,
      isDistinctCount: true,
      isGuardedSum: false,
    };
  }
  if (PARTIAL_MIN_MAX_NAMES.has(fn) && !agg.distinct) {
    const allowlisted = isAllowlistedColumnExpr(agg.argument, schema);
    return {
      orderIndependent: allowlisted,
      partialEligible: allowlisted,
      isDistinctCount: false,
      isGuardedSum: false,
    };
  }
  if (GUARDED_SUM_NAMES.has(fn) && !agg.distinct) {
    const det = isDeterministicExpression(agg.argument);
    return {
      orderIndependent: false,
      partialEligible: false,
      isDistinctCount: false,
      isGuardedSum: det,
    };
  }
  return {
    orderIndependent: false,
    partialEligible: false,
    isDistinctCount: false,
    isGuardedSum: false,
  };
}

/**
 * Split a WHERE expression into top-level AND conjuncts.
 * @param {Object|null} expr - WHERE expression.
 * @return {Object[]}
 */
function splitWhereConjuncts(expr) {
  if (!expr) return [];
  if (expr.type === EXPR_TYPE.BINARY && expr.operator === AND_OPERATOR) {
    return [
      ...splitWhereConjuncts(expr.left),
      ...splitWhereConjuncts(expr.right),
    ];
  }
  return [expr];
}

/**
 * Conjoin an array of WHERE conjuncts with AND.
 * @param {Object[]} conjuncts
 * @return {Object|null}
 */
function joinWhereConjuncts(conjuncts) {
  if (!Array.isArray(conjuncts) || conjuncts.length === 0) return null;
  let current = conjuncts[0];
  for (let index = 1; index < conjuncts.length; index += 1) {
    current = {
      type: EXPR_TYPE.BINARY,
      operator: AND_OPERATOR,
      left: current,
      right: conjuncts[index],
    };
  }
  return current;
}

function isDistinctSelectOrderIndependent(ast, schema) {
  if (!ast.distinct) return true;
  if (!Array.isArray(ast.columns) || ast.columns.length === 0) return false;
  return ast.columns.every(
    (col) => col.type !== EXPR_TYPE.STAR && isAllowlistedColumnExpr(col.expression, schema),
  );
}

function areAggregateClausesSound(ast, schema) {
  const groupTerms = Array.isArray(ast.groupBy) ? ast.groupBy : [];
  if (!groupTerms.every((term) => isAllowlistedColumnExpr(term, schema))) {
    return false;
  }
  const groupKeySet = new Set(
    groupTerms
      .map((term) => unwrapCollateColumn(term)?.columnRef?.column?.toLowerCase())
      .filter(Boolean),
  );
  if (hasNonKeyBareColumns(ast, groupKeySet, schema)) {
    return false;
  }
  return (
    isDeterministicExpression(ast.columns) &&
    isDeterministicExpression(ast.having) &&
    isDeterministicExpression(ast.orderBy) &&
    isDeterministicExpression(ast.where)
  );
}

function summarizeAggregateEligibility(aggregates, schema) {
  const classifiedAggs = aggregates.map((agg) => classifySingleAggregate(agg, schema));
  const distinctCountAggs = classifiedAggs.filter((c) => c.isDistinctCount);
  const guardedSumAggs = classifiedAggs.filter((c) => c.isGuardedSum);
  const orderIndependent = classifiedAggs.every((c) => c.orderIndependent);
  const eligibleForPartialAggregate = classifiedAggs.every((c) => c.partialEligible) &&
    (distinctCountAggs.length === 0 || aggregates.length === 1);
  const eligibleForGuardedPartial =
    classifiedAggs.every((c) => c.partialEligible || c.isGuardedSum) &&
    distinctCountAggs.length === 0 &&
    guardedSumAggs.length > 0;
  return {
    orderIndependent,
    eligibleForPartialAggregate,
    eligibleForGuardedPartial,
  };
}

function evaluateStatementEligibility(ast, schema, isAggregateQuery, aggregates) {
  if (!isAggregateQuery) {
    return {
      orderIndependent: isDistinctSelectOrderIndependent(ast, schema),
      eligibleForPartialAggregate: false,
      eligibleForGuardedPartial: false,
    };
  }
  if (!areAggregateClausesSound(ast, schema)) {
    return {
      orderIndependent: false,
      eligibleForPartialAggregate: false,
      eligibleForGuardedPartial: false,
    };
  }
  return summarizeAggregateEligibility(aggregates, schema);
}

/**
 * Classify a single-table SELECT AST under the §2.2 decision table and order-
 * independence allowlist.
 * @param {Object} ast - SELECT AST.
 * @param {Object|null} [schema] - Catalog table schema.
 * @return {{
 *   hasNestedOrCompound: boolean,
 *   hasPerStatementTime: boolean,
 *   isAggregateQuery: boolean,
 *   orderIndependent: boolean,
 *   eligibleForPartialAggregate: boolean,
 *   eligibleForGuardedPartial: boolean,
 *   aggregates: Object[]
 * }}
 */
function nodeHasWindowOrAggregateOrder(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(nodeHasWindowOrAggregateOrder);
  if (
    (node.type === PG_EXPR_TYPE.FUNCTION_CALL ||
      node.type === FUNCTION_EXPR_TYPE ||
      node.type === EXPR_TYPE.AGGREGATE) &&
    (Boolean(node.over) || (Array.isArray(node.orderBy) && node.orderBy.length > 0))
  ) {
    return true;
  }
  return Object.values(node).some(nodeHasWindowOrAggregateOrder);
}

function classifySingleTableStatement(ast, schema = null) {
  const hasNested = hasNestedOrCompoundSelect(ast);
  const hasTime = isPerStatementTimeExpression(ast);
  const hasWindowOrOrder = [
    ast?.columns,
    ast?.where,
    ast?.groupBy,
    ast?.having,
    ast?.orderBy,
  ].some(nodeHasWindowOrAggregateOrder);
  const aggregates = collectSelectAggregates(ast);
  const hasGroupBy = Array.isArray(ast?.groupBy) && ast.groupBy.length > 0;
  const isAggregateQuery = aggregates.length > 0 || hasGroupBy || Boolean(ast?.having);

  const eligibility = hasNested || hasTime || hasWindowOrOrder ?
    {
      orderIndependent: false,
      eligibleForPartialAggregate: false,
      eligibleForGuardedPartial: false,
    } :
    evaluateStatementEligibility(ast, schema, isAggregateQuery, aggregates);

  return {
    hasNestedOrCompound: hasNested,
    hasPerStatementTime: hasTime,
    isAggregateQuery,
    orderIndependent: eligibility.orderIndependent,
    eligibleForPartialAggregate: eligibility.eligibleForPartialAggregate,
    eligibleForGuardedPartial: eligibility.eligibleForGuardedPartial,
    aggregates,
  };
}

export {
  GUARDED_SUM_NAMES,
  PARTIAL_COUNT_NAME,
  assertMultiPartitionRowidAdmissible,
  classifySingleTableStatement,
  collectAllBaseTableNames,
  findSchemaColumn,
  hasSubqueryCteOrCompound,
  hasUnshadowedRowidReference,
  isAllowlistedColumnExpr,
  isDeterministicExpression,
  isPerStatementTimeExpression,
  joinWhereConjuncts,
  splitWhereConjuncts,
  unwrapCollateColumn,
};
