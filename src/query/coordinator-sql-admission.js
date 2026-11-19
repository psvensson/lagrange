/**
 * Coordinator SQL admission for constructs that require SQLite evaluation
 * (design coordinator-sqlite-merge §2.2, §2.5, §5.1):
 *
 * - Connection-scoped SQLite functions (`changes`, `last_insert_rowid`,
 *   `total_changes`) are refused on coordinator read paths because neither a
 *   partition connection nor a merge connection holds client session state.
 * - While coordinator merge, cross-partition joins, FROM-less SELECT clauses,
 *   and live-query predicates/renderers still run JavaScript evaluators (until
 *   WP3 / WP7), explicit `COLLATE`, `LIKE ... ESCAPE`, non-`BINARY` declared
 *   column collations in coordinator-evaluated positions, parameterized
 *   `LIMIT`/`OFFSET`, and extra FROM-less clauses are refused with the typed
 *   `UNSUPPORTED_SQL_FEATURE` rather than silently mis-evaluated.
 *
 * @module query/coordinator-sql-admission
 */

import {AST_TYPE, EXPR_TYPE, SQL_DEFAULT_COLLATION} from './parser-constants.js';
import {PG_EXPR_TYPE} from './pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from './query-constants.js';

const TYPEOF_FUNCTION = 'function';
const TYPEOF_NUMBER = 'number';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const UNION_ALL_OP = 'UNION ALL';
const UNNAMED_SCHEMA_KEY = '*';

const COORDINATOR_ADMISSION_DECISION = Object.freeze({
  ADMITTED: 'admitted',
  REFUSED: 'refused',
});

const SELECT_MERGE_MODE = Object.freeze({
  ORIGINAL_RAW_ROWS: 'original_raw_rows',
  DISTRIBUTED_RAW_ROWS: 'distributed_raw_rows',
  PARTIAL_AGGREGATE: 'partial_aggregate',
});

const EVALUATED_POSITION = Object.freeze({
  NONE: 'none',
  HAVING: 'HAVING',
  ORDER_BY: 'ORDER BY (or a select-list expression an ORDER BY can sort by) applied ' +
    'by the coordinator',
  SELECT_LIST: 'the select list or aggregate of a coordinator-merged statement',
  GROUP_BY: 'GROUP BY of a coordinator-merged statement',
  DISTINCT: 'DISTINCT of a coordinator-merged statement',
  SUBQUERY_OR_COMPOUND: 'a compound SELECT, CTE, derived table or subquery',
});

const CONNECTION_SCOPED_FUNCTIONS = new Set([
  'changes',
  'last_insert_rowid',
  'total_changes',
]);

const FUNCTION_EXPR_TYPE = 'function';
const EVALUABLE_HAVING_SCALAR_FUNCTIONS = new Set([
  'COALESCE', 'IFNULL', 'NULLIF', 'IIF', 'ABS', 'LOWER', 'UPPER',
  'TRIM', 'LENGTH', 'SUBSTR', 'SUBSTRING', 'ROUND',
]);
const EVALUABLE_HAVING_BINARY_OPERATORS = new Set([
  '+', '-', '*', '/', '%', '||', '=', '!=', '<>', '<', '<=', '>', '>=',
  'AND', 'OR', 'IS NULL', 'IS NOT NULL',
]);
const EVALUABLE_HAVING_UNARY_OPERATORS = new Set(['-', '+', 'NOT']);
const EVALUABLE_HAVING_EXPRESSION_TYPES = new Set([
  EXPR_TYPE.BINARY, EXPR_TYPE.UNARY, EXPR_TYPE.LITERAL, EXPR_TYPE.COLUMN_REF,
  EXPR_TYPE.PARAMETER, EXPR_TYPE.AGGREGATE, EXPR_TYPE.IN, EXPR_TYPE.BETWEEN,
  EXPR_TYPE.LIKE, PG_EXPR_TYPE.CASE, PG_EXPR_TYPE.CAST,
  PG_EXPR_TYPE.FUNCTION_CALL, FUNCTION_EXPR_TYPE,
]);

const FROMLESS_CLAUSES = Object.freeze([
  'where',
  'groupBy',
  'having',
  'orderBy',
  'limit',
  'setOperation',
]);

const REFUSAL_MESSAGE = Object.freeze({
  CONNECTION_FUNCTION_PREFIX:
    'A connection-state function is not supported on a coordinator read path: ',
  FROMLESS_CLAUSE:
    'WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET, DISTINCT, WITH and compound ' +
    'operators on a SELECT without FROM are not supported yet (interim I2, until WP3)',
  FANOUT_SYNTAX_PREFIX: 'COLLATE, non-BINARY column collation, and LIKE ... ESCAPE in ',
  FANOUT_SYNTAX_SUFFIX: ' are not supported yet: the coordinator evaluates that position ' +
    '(interim I1a, until WP3)',
  FANOUT_HAVING_EXPRESSION:
    'HAVING expression is not supported by the coordinator evaluator yet ' +
    '(interim, until WP3)',
  FANOUT_LIMIT_PARAMETER: 'LIMIT or OFFSET bound to a parameter is not supported yet: the ' +
    'coordinator applies the limit (interim, until WP3)',
  JOIN_SYNTAX:
    'COLLATE, non-BINARY column collation, and LIKE ... ESCAPE in a cross-partition JOIN ' +
    'statement are not supported yet: the coordinator evaluates the join (interim I1b, until WP3)',
  JOIN_LIMIT_PARAMETER: 'LIMIT or OFFSET bound to a parameter in a cross-partition JOIN ' +
    'statement is not supported yet (interim, until WP3)',
  LIVE_QUERY_PREDICATE:
    'COLLATE, non-BINARY column collation, and LIKE ... ESCAPE in a live-query predicate ' +
    'are not supported yet (interim I1d, until WP7)',
  LIVE_QUERY_RENDERER:
    'COLLATE, non-BINARY column collation, and LIKE ... ESCAPE are not supported by ' +
    'the live-query evaluator or SQL renderer yet (interim I1e, until WP7)',
});

function unsupportedFeatureError(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  return error;
}

function extractSchemaFromTableRecord(record) {
  if (!record || typeof record !== TYPEOF_OBJECT) return null;
  if (Array.isArray(record.columns)) return record;
  if (typeof record.schema_definition === TYPEOF_STRING) {
    return JSON.parse(record.schema_definition);
  }
  if (typeof record.schema === TYPEOF_STRING) {
    return JSON.parse(record.schema);
  }
  if (record.schema !== null && typeof record.schema === TYPEOF_OBJECT) {
    return record.schema;
  }
  return null;
}

function nonBinaryColumnSet(schema) {
  const cols = new Set();
  for (const col of schema?.columns || []) {
    if (typeof col?.collation === TYPEOF_STRING &&
        col.collation.toUpperCase() !== SQL_DEFAULT_COLLATION &&
        typeof col.name === TYPEOF_STRING) {
      cols.add(col.name.toLowerCase());
    }
  }
  return cols;
}

function emptyCollationScope() {
  return {
    byQualifier: new Map(),
    anyNonBinary: new Set(),
    tablesWithNonBinary: new Set(),
  };
}

function recordSchemaInScope(scope, schema, qualifierNames = []) {
  const cols = nonBinaryColumnSet(schema);
  if (cols.size === 0) return;
  for (const col of cols) scope.anyNonBinary.add(col);
  for (const qualifier of qualifierNames) {
    if (typeof qualifier === TYPEOF_STRING && qualifier.length > 0) {
      const lower = qualifier.toLowerCase();
      scope.byQualifier.set(lower, cols);
      scope.tablesWithNonBinary.add(lower);
    }
  }
}

function recordTableSource(tableSource, cteNames, sources) {
  if (!tableSource) return;
  sources.push(tableSource);
  collectSelectTableSources(tableSource.subquery, cteNames, sources);
}

function collectCteTableSources(ctes, cteNames, sources) {
  if (!Array.isArray(ctes)) return;
  for (const cte of ctes) {
    if (typeof cte.name === TYPEOF_STRING) cteNames.add(cte.name.toLowerCase());
    collectSelectTableSources(cte.query, cteNames, sources);
  }
}

function collectSelectTableSources(selectAst, cteNames, sources) {
  if (!selectAst || typeof selectAst !== TYPEOF_OBJECT) return;
  collectCteTableSources(selectAst.ctes, cteNames, sources);
  recordTableSource(selectAst.from, cteNames, sources);
  if (Array.isArray(selectAst.joins)) {
    for (const join of selectAst.joins) {
      recordTableSource(join.table, cteNames, sources);
    }
  }
  if (selectAst.setOperation) {
    collectSelectTableSources(selectAst.setOperation.right, cteNames, sources);
  }
}

function buildCollationScopeForSelect(selectAst, resolveTableSchema) {
  const scope = emptyCollationScope();
  if (typeof resolveTableSchema !== TYPEOF_FUNCTION) return scope;
  const cteNames = new Set();
  const sources = [];
  collectSelectTableSources(selectAst, cteNames, sources);
  for (const source of sources) {
    const name = source?.name;
    if (typeof name !== TYPEOF_STRING || cteNames.has(name.toLowerCase())) continue;
    const schema = extractSchemaFromTableRecord(resolveTableSchema(name));
    recordSchemaInScope(scope, schema, [name, source.alias]);
  }
  return scope;
}

function buildCollationScopeFromSchemas(schemasOrSchema) {
  const scope = emptyCollationScope();
  if (!schemasOrSchema) return scope;
  const list = Array.isArray(schemasOrSchema) ? schemasOrSchema : [schemasOrSchema];
  for (const entry of list) {
    const schema = extractSchemaFromTableRecord(entry);
    if (!schema) continue;
    const cols = nonBinaryColumnSet(schema);
    if (cols.size === 0) continue;
    for (const col of cols) scope.anyNonBinary.add(col);
    scope.tablesWithNonBinary.add(
      typeof schema.tableName === TYPEOF_STRING ?
        schema.tableName.toLowerCase() :
        UNNAMED_SCHEMA_KEY,
    );
  }
  return scope;
}

/**
 * Whether an AST subtree contains explicit syntax that only SQLite can evaluate
 * (`COLLATE` or `LIKE ... ESCAPE`).
 * @param {*} node - AST node or array of nodes.
 * @return {boolean}
 */
function holdsExplicitSqliteSyntax(node) {
  if (!node || typeof node !== TYPEOF_OBJECT) return false;
  if (Array.isArray(node)) return node.some(holdsExplicitSqliteSyntax);
  if (node.type === EXPR_TYPE.COLLATE ||
      (node.type === EXPR_TYPE.LIKE && Boolean(node.escape))) {
    return true;
  }
  return Object.values(node).some(holdsExplicitSqliteSyntax);
}

function matchesNonBinaryColumnRef(node, scope) {
  const col = typeof node.column === TYPEOF_STRING ? node.column.toLowerCase() : '';
  if (col === '') return false;
  if (typeof node.table === TYPEOF_STRING && node.table.length > 0) {
    const tableCols = scope.byQualifier.get(node.table.toLowerCase());
    return tableCols ? tableCols.has(col) : scope.anyNonBinary.has(col);
  }
  return scope.anyNonBinary.has(col);
}

function matchesNonBinaryStar(node, scope) {
  if (typeof node.table === TYPEOF_STRING && node.table.length > 0) {
    return scope.tablesWithNonBinary.has(node.table.toLowerCase());
  }
  return scope.tablesWithNonBinary.size > 0;
}

function holdsNonBinaryColumnRef(node, scope, checkStar = false) {
  if (scope.anyNonBinary.size === 0 || !node || typeof node !== TYPEOF_OBJECT) {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((entry) => holdsNonBinaryColumnRef(entry, scope, checkStar));
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) return matchesNonBinaryColumnRef(node, scope);
  if (checkStar && node.type === EXPR_TYPE.STAR) return matchesNonBinaryStar(node, scope);
  return Object.values(node).some((val) => holdsNonBinaryColumnRef(val, scope, checkStar));
}

function holdsSqliteSemantics(node, scope, checkStar = false) {
  return holdsExplicitSqliteSyntax(node) || holdsNonBinaryColumnRef(node, scope, checkStar);
}

function containsAggregateNode(node) {
  if (!node || typeof node !== TYPEOF_OBJECT) return false;
  if (Array.isArray(node)) return node.some(containsAggregateNode);
  if (node.type === EXPR_TYPE.AGGREGATE) return true;
  return Object.values(node).some(containsAggregateNode);
}

function holdsAggregateSqliteSemantics(node, scope) {
  if (!node || typeof node !== TYPEOF_OBJECT) return false;
  if (Array.isArray(node)) {
    return node.some((entry) => holdsAggregateSqliteSemantics(entry, scope));
  }
  if (node.type === EXPR_TYPE.AGGREGATE) {
    return holdsSqliteSemantics(node.argument, scope);
  }
  return Object.values(node).some((val) => holdsAggregateSqliteSemantics(val, scope));
}

function holdsDistinctAggregateSqliteSemantics(node, scope) {
  if (!node || typeof node !== TYPEOF_OBJECT) return false;
  if (Array.isArray(node)) {
    return node.some((entry) => holdsDistinctAggregateSqliteSemantics(entry, scope));
  }
  if (node.type === EXPR_TYPE.AGGREGATE && node.distinct === true &&
      holdsSqliteSemantics(node.argument, scope)) {
    return true;
  }
  return Object.values(node).some((val) => holdsDistinctAggregateSqliteSemantics(val, scope));
}

function holdsPartialAggregateColumnSqlite(columns, scope) {
  if (holdsDistinctAggregateSqliteSemantics(columns, scope)) return true;
  return columns.some((col) => {
    const expr = col?.expression;
    return Boolean(expr) &&
      expr.type !== EXPR_TYPE.AGGREGATE &&
      containsAggregateNode(expr) &&
      holdsSqliteSemantics(expr, scope);
  });
}

function holdsDirectLimitParameter(limit) {
  if (!limit) return false;
  if (typeof limit.count !== TYPEOF_NUMBER) return true;
  return limit.offset !== null &&
    limit.offset !== undefined &&
    typeof limit.offset !== TYPEOF_NUMBER;
}

function holdsParameterLimit(node) {
  if (!node || typeof node !== TYPEOF_OBJECT) return false;
  if (Array.isArray(node)) return node.some(holdsParameterLimit);
  if (node.type === AST_TYPE.SELECT && holdsDirectLimitParameter(node.limit)) {
    return true;
  }
  return Object.values(node).some(holdsParameterLimit);
}

function collectExpressionSubqueries(node, out) {
  if (!node || typeof node !== TYPEOF_OBJECT) return;
  if (Array.isArray(node)) {
    node.forEach((entry) => collectExpressionSubqueries(entry, out));
    return;
  }
  if ((node.type === PG_EXPR_TYPE.SUBQUERY || node.type === PG_EXPR_TYPE.EXISTS) &&
      node.query) {
    out.push(node.query);
    return;
  }
  if (node.type === EXPR_TYPE.IN && node.subquery?.query) {
    out.push(node.subquery.query);
  }
  Object.values(node).forEach((val) => collectExpressionSubqueries(val, out));
}

function pushSelectIfPresent(nested, query) {
  if (query) nested.push(query);
}

function collectNestedSelects(ast) {
  const nested = [];
  if (Array.isArray(ast.ctes)) {
    ast.ctes.forEach((cte) => pushSelectIfPresent(nested, cte.query));
  }
  pushSelectIfPresent(nested, ast.from ? ast.from.subquery : null);
  if (Array.isArray(ast.joins)) {
    ast.joins.forEach((join) =>
      pushSelectIfPresent(nested, join.table ? join.table.subquery : null),
    );
  }
  for (const clause of [ast.columns, ast.where, ast.groupBy, ast.having, ast.orderBy]) {
    collectExpressionSubqueries(clause, nested);
  }
  return nested;
}

function compoundOrNestedHoldsSqlite(ast, resolveTableSchema) {
  if (ast.setOperation) {
    let cursor = ast;
    let deduplicates = false;
    while (cursor) {
      if (cursor.setOperation && cursor.setOperation.type !== UNION_ALL_OP) {
        deduplicates = true;
      }
      const armScope = buildCollationScopeForSelect(cursor, resolveTableSchema);
      if (holdsSqliteSemantics(cursor, armScope, deduplicates || Boolean(cursor.distinct))) {
        return true;
      }
      cursor = cursor.setOperation?.right ?? null;
    }
  }
  for (const sub of collectNestedSelects(ast)) {
    const subScope = buildCollationScopeForSelect(sub, resolveTableSchema);
    if (holdsSqliteSemantics(sub, subScope, Boolean(sub.distinct)) ||
        compoundOrNestedHoldsSqlite(sub, resolveTableSchema)) {
      return true;
    }
  }
  return false;
}

function columnItemHoldsSqlite(col, scope) {
  const expr = col?.expression ?? col;
  return holdsSqliteSemantics(expr, scope);
}

function selectColumnHoldsSqliteAtOrdinal(columns, ordinal, scope) {
  if (!Array.isArray(columns) || !Number.isInteger(ordinal)) return false;
  const target = columns[ordinal - 1];
  return target ? columnItemHoldsSqlite(target, scope) : false;
}

function selectAliasHoldsSqlite(columns, columnName, scope) {
  if (!Array.isArray(columns) || typeof columnName !== TYPEOF_STRING) return false;
  const lower = columnName.toLowerCase();
  return columns.some((col) =>
    typeof col?.alias === TYPEOF_STRING &&
    col.alias.toLowerCase() === lower &&
    columnItemHoldsSqlite(col, scope),
  );
}

function holdsAliasedColumnSqliteSemantics(node, columns, scope) {
  if (!node || typeof node !== TYPEOF_OBJECT || !Array.isArray(columns)) {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((entry) => holdsAliasedColumnSqliteSemantics(entry, columns, scope));
  }
  if (node.type === EXPR_TYPE.COLUMN_REF && !node.table) {
    return selectAliasHoldsSqlite(columns, node.column, scope);
  }
  return Object.values(node).some((val) =>
    holdsAliasedColumnSqliteSemantics(val, columns, scope),
  );
}

function holdsClauseSqliteSemantics(node, columns, scope) {
  return holdsSqliteSemantics(node, scope) ||
    holdsAliasedColumnSqliteSemantics(node, columns, scope);
}

function unwrapClauseExpression(term) {
  return term?.type ? term : (term?.expression ?? term);
}

function termReferencesSqliteColumn(term, columns, scope) {
  const expr = unwrapClauseExpression(term);
  if (holdsClauseSqliteSemantics(expr, columns, scope)) return true;
  if (expr?.type === EXPR_TYPE.LITERAL && Number.isInteger(expr.value)) {
    return selectColumnHoldsSqliteAtOrdinal(columns, expr.value, scope);
  }
  return false;
}

function isEvaluableHavingFunction(node) {
  if (node.type !== PG_EXPR_TYPE.FUNCTION_CALL && node.type !== FUNCTION_EXPR_TYPE) {
    return true;
  }
  return EVALUABLE_HAVING_SCALAR_FUNCTIONS.has(String(node.name || '').toUpperCase());
}

function isEvaluableHavingOperator(node) {
  if (node.type === EXPR_TYPE.BINARY) {
    return EVALUABLE_HAVING_BINARY_OPERATORS.has(node.operator);
  }
  if (node.type === EXPR_TYPE.UNARY) {
    return EVALUABLE_HAVING_UNARY_OPERATORS.has(node.operator);
  }
  return node.type !== EXPR_TYPE.IN || !node.subquery;
}

function isEvaluableHavingNode(node) {
  if (!node.type) return true;
  return EVALUABLE_HAVING_EXPRESSION_TYPES.has(node.type) &&
    isEvaluableHavingFunction(node) &&
    isEvaluableHavingOperator(node);
}

function havingExpressionEvaluable(node) {
  if (!node || typeof node !== TYPEOF_OBJECT) return true;
  if (Array.isArray(node)) return node.every(havingExpressionEvaluable);
  if (node.type === EXPR_TYPE.AGGREGATE) return true;
  if (!isEvaluableHavingNode(node)) return false;
  return Object.values(node).every((val) =>
    !val || typeof val !== TYPEOF_OBJECT || havingExpressionEvaluable(val),
  );
}

/**
 * Whether the coordinator's re-sort preserves a single partition's ORDER BY
 * order: `applyOrderBy` skips explicit `COLLATE` expressions (no bare column
 * key), so a single partition's SQLite order survives only when no term holds a
 * bare non-BINARY column or alias of a SQLite-only expression and no evaluable
 * term follows an explicit `COLLATE` term.
 * @param {Object} ast - SELECT AST.
 * @param {Object} scope - Collation scope.
 * @return {boolean}
 */
function singlePartitionOrderSurvivesResort(ast, scope) {
  for (const term of ast.orderBy) {
    const expr = unwrapClauseExpression(term);
    if (expr?.type !== EXPR_TYPE.COLLATE &&
        termReferencesSqliteColumn(term, ast.columns, scope)) {
      return false;
    }
  }
  const explicitTerms = ast.orderBy.map((term) => holdsExplicitSqliteSyntax(term));
  const firstExplicit = explicitTerms.indexOf(true);
  return firstExplicit < 0 || !explicitTerms.slice(firstExplicit).includes(false);
}

function isMergeEvaluatedOrderBy(ast, multiPartition, mergeMode, hasAggregatePlan, scope) {
  if (!ast.orderBy) return false;
  if (!ast.orderBy.some((term) => termReferencesSqliteColumn(term, ast.columns, scope))) {
    return false;
  }
  if (multiPartition || mergeMode === SELECT_MERGE_MODE.PARTIAL_AGGREGATE) return true;
  if (mergeMode === SELECT_MERGE_MODE.ORIGINAL_RAW_ROWS && hasAggregatePlan) return true;
  return !singlePartitionOrderSurvivesResort(ast, scope);
}

function selectListMergeEvaluated(ast, multiPartition, mergeMode, hasAggregatePlan, scope) {
  if (mergeMode === SELECT_MERGE_MODE.ORIGINAL_RAW_ROWS && hasAggregatePlan) {
    return holdsSqliteSemantics(ast.columns, scope);
  }
  if (mergeMode === SELECT_MERGE_MODE.PARTIAL_AGGREGATE &&
      holdsPartialAggregateColumnSqlite(ast.columns, scope)) {
    return true;
  }
  if (!multiPartition) return false;
  return ast.columns.some((col) => holdsExplicitSqliteSyntax(col.expression)) ||
    holdsAggregateSqliteSemantics(ast.columns, scope);
}

function selectGroupOrListPosition(ast, multiPartition, mergeMode, hasAggregatePlan, scope) {
  const coordinatorMergesGroups = multiPartition ||
    (mergeMode === SELECT_MERGE_MODE.ORIGINAL_RAW_ROWS && hasAggregatePlan);
  if (coordinatorMergesGroups &&
      (ast.groupBy || []).some((term) => termReferencesSqliteColumn(term, ast.columns, scope))) {
    return EVALUATED_POSITION.GROUP_BY;
  }
  if (selectListMergeEvaluated(ast, multiPartition, mergeMode, hasAggregatePlan, scope)) {
    return EVALUATED_POSITION.SELECT_LIST;
  }
  return EVALUATED_POSITION.NONE;
}

function selectEvaluatedPosition(ast, partitionCount, mergeMode, hasAggregatePlan, scope,
  resolveTableSchema) {
  if (compoundOrNestedHoldsSqlite(ast, resolveTableSchema)) {
    return EVALUATED_POSITION.SUBQUERY_OR_COMPOUND;
  }
  if (holdsClauseSqliteSemantics(ast.having, ast.columns, scope)) {
    return EVALUATED_POSITION.HAVING;
  }
  const multiPartition = partitionCount > 1;
  const isOriginalRawRows = mergeMode === SELECT_MERGE_MODE.ORIGINAL_RAW_ROWS;
  if (ast.distinct && (multiPartition || isOriginalRawRows) &&
      holdsSqliteSemantics(ast.columns, scope, true)) {
    return EVALUATED_POSITION.DISTINCT;
  }
  if (isMergeEvaluatedOrderBy(ast, multiPartition, mergeMode, hasAggregatePlan, scope)) {
    return EVALUATED_POSITION.ORDER_BY;
  }
  return selectGroupOrListPosition(ast, multiPartition, mergeMode, hasAggregatePlan, scope);
}

function isCoordinatorEvaluatedHaving(mergeMode, hasAggregatePlan) {
  return mergeMode === SELECT_MERGE_MODE.PARTIAL_AGGREGATE ||
    (mergeMode === SELECT_MERGE_MODE.ORIGINAL_RAW_ROWS && hasAggregatePlan);
}

/**
 * Refuse a single-table SELECT plan whose coordinator merge would evaluate
 * `COLLATE`, non-`BINARY` column collations, `LIKE ... ESCAPE`, an unevaluable
 * `HAVING` expression, or a parameterized `LIMIT`/`OFFSET` in JavaScript.
 * @param {Object} ast - SELECT AST.
 * @param {number} partitionCount - Partitions the statement fans out to.
 * @param {Object} [context] - Merge mode and schema lookup context.
 */
function assertSelectFanoutAdmissible(
  ast,
  partitionCount,
  {
    mergeMode = SELECT_MERGE_MODE.DISTRIBUTED_RAW_ROWS,
    hasAggregatePlan = false,
    resolveTableSchema = null,
  } = {},
) {
  if (holdsParameterLimit(ast)) {
    throw unsupportedFeatureError(REFUSAL_MESSAGE.FANOUT_LIMIT_PARAMETER);
  }
  if (ast.having &&
      isCoordinatorEvaluatedHaving(mergeMode, hasAggregatePlan === true) &&
      !havingExpressionEvaluable(ast.having)) {
    throw unsupportedFeatureError(REFUSAL_MESSAGE.FANOUT_HAVING_EXPRESSION);
  }
  const scope = buildCollationScopeForSelect(ast, resolveTableSchema);
  const position = selectEvaluatedPosition(
    ast,
    partitionCount,
    mergeMode,
    hasAggregatePlan === true,
    scope,
    resolveTableSchema,
  );
  if (position !== EVALUATED_POSITION.NONE) {
    throw unsupportedFeatureError(
      REFUSAL_MESSAGE.FANOUT_SYNTAX_PREFIX + position + REFUSAL_MESSAGE.FANOUT_SYNTAX_SUFFIX,
    );
  }
}

/**
 * Decide whether a cross-partition JOIN statement is admissible under the
 * current coordinator evaluator.
 * @param {Object} ast - SELECT AST with joins.
 * @param {string[]} partitionIds - Target main-table partition IDs.
 * @param {Function|null} [resolveTableSchema] - Catalog schema resolver.
 * @return {{decision: string, response?: Object}}
 */
function evaluateCrossPartitionJoinAdmission(ast, partitionIds, resolveTableSchema = null) {
  const scope = buildCollationScopeForSelect(ast, resolveTableSchema);
  const hasSqliteSyntax = holdsSqliteSemantics(ast, scope, true) ||
    compoundOrNestedHoldsSqlite(ast, resolveTableSchema);
  const hasParamLimit = holdsParameterLimit(ast);
  if (!hasSqliteSyntax && !hasParamLimit) {
    return {decision: COORDINATOR_ADMISSION_DECISION.ADMITTED};
  }
  return {
    decision: COORDINATOR_ADMISSION_DECISION.REFUSED,
    response: {
      success: false,
      errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
      error: hasSqliteSyntax ?
        REFUSAL_MESSAGE.JOIN_SYNTAX :
        REFUSAL_MESSAGE.JOIN_LIMIT_PARAMETER,
      partitions: partitionIds,
    },
  };
}

function firstConnectionFunctionName(node) {
  if (!node || typeof node !== TYPEOF_OBJECT) {
    return '';
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = firstConnectionFunctionName(entry);
      if (found !== '') return found;
    }
    return '';
  }
  if (node.type === PG_EXPR_TYPE.FUNCTION_CALL &&
      CONNECTION_SCOPED_FUNCTIONS.has(String(node.name).toLowerCase())) {
    return String(node.name);
  }
  for (const value of Object.values(node)) {
    const found = firstConnectionFunctionName(value);
    if (found !== '') return found;
  }
  return '';
}

function holdsFromlessUnsupportedClause(ast) {
  if (ast.from) {
    return false;
  }
  if (ast.distinct === true) {
    return true;
  }
  if (Array.isArray(ast.ctes) && ast.ctes.length > 0) {
    return true;
  }
  return FROMLESS_CLAUSES.some((clause) => Boolean(ast[clause]));
}

/**
 * Decide whether a coordinator SELECT is admissible (refusing connection-state
 * functions and unimplemented FROM-less clauses).
 * @param {Object} ast - SELECT AST.
 * @return {{decision: string, response?: Object}}
 */
function evaluateCoordinatorSelectAdmission(ast) {
  const connectionFn = firstConnectionFunctionName(ast);
  const hasFromlessClause = connectionFn === '' && holdsFromlessUnsupportedClause(ast);
  if (connectionFn === '' && !hasFromlessClause) {
    return {decision: COORDINATOR_ADMISSION_DECISION.ADMITTED};
  }
  const error = connectionFn !== '' ?
    REFUSAL_MESSAGE.CONNECTION_FUNCTION_PREFIX + connectionFn :
    REFUSAL_MESSAGE.FROMLESS_CLAUSE;
  return {
    decision: COORDINATOR_ADMISSION_DECISION.REFUSED,
    response: {
      success: false,
      error,
      errorCode: QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
    },
  };
}

/**
 * Refuse a live-query predicate holding `COLLATE`, non-`BINARY` column
 * collation, or `LIKE ... ESCAPE`.
 * @param {Object|null} whereClause - Parsed WHERE AST.
 * @param {Object|Object[]|null} [schemas] - Referenced catalog schema(s).
 */
function assertLiveQueryPredicateAdmissible(whereClause, schemas = null) {
  const scope = buildCollationScopeFromSchemas(schemas);
  if (holdsSqliteSemantics(whereClause, scope)) {
    throw unsupportedFeatureError(REFUSAL_MESSAGE.LIVE_QUERY_PREDICATE);
  }
}

/**
 * Refuse a live-query AST whose JS predicate/delta/group/order/join evaluation
 * references a non-`BINARY` column or holds `COLLATE` / `LIKE ... ESCAPE`.
 * @param {Object|null} parsedQuery - Parsed SELECT AST.
 * @param {Function|null} [resolveTableSchema] - Catalog schema resolver.
 */
function assertLiveQueryGroupAdmissible(parsedQuery, resolveTableSchema = null) {
  if (!parsedQuery) return;
  if (holdsParameterLimit(parsedQuery)) {
    throw unsupportedFeatureError(REFUSAL_MESSAGE.FANOUT_LIMIT_PARAMETER);
  }
  const scope = buildCollationScopeForSelect(parsedQuery, resolveTableSchema);
  const hasNonBinaryClause =
    holdsSqliteSemantics(parsedQuery.where, scope) ||
    holdsSqliteSemantics(parsedQuery.joins, scope) ||
    holdsClauseSqliteSemantics(parsedQuery.having, parsedQuery.columns, scope) ||
    (parsedQuery.groupBy || []).some((term) =>
      termReferencesSqliteColumn(term, parsedQuery.columns, scope),
    ) ||
    (parsedQuery.orderBy || []).some((term) =>
      termReferencesSqliteColumn(term, parsedQuery.columns, scope),
    );
  const hasDistinctOrAggregate = (Boolean(parsedQuery.distinct) &&
      holdsSqliteSemantics(parsedQuery.columns, scope, true)) ||
    holdsAggregateSqliteSemantics(parsedQuery.columns, scope) ||
    holdsExplicitSqliteSyntax(parsedQuery.columns);
  if (hasNonBinaryClause || hasDistinctOrAggregate ||
      compoundOrNestedHoldsSqlite(parsedQuery, resolveTableSchema)) {
    throw unsupportedFeatureError(REFUSAL_MESSAGE.LIVE_QUERY_PREDICATE);
  }
}

/**
 * Refuse rendering a live-query AST through the secondary live-query renderer
 * when it holds `COLLATE`, non-`BINARY` column collation, or `LIKE ... ESCAPE`.
 * @param {Object|null} parsedQuery - Parsed SELECT AST.
 * @param {Function|null} [resolveTableSchema] - Catalog schema resolver.
 */
function assertLiveQueryRendererAdmissible(parsedQuery, resolveTableSchema = null) {
  const scope = buildCollationScopeForSelect(parsedQuery, resolveTableSchema);
  if (holdsSqliteSemantics(parsedQuery, scope, Boolean(parsedQuery?.distinct)) ||
      compoundOrNestedHoldsSqlite(parsedQuery, resolveTableSchema)) {
    throw unsupportedFeatureError(REFUSAL_MESSAGE.LIVE_QUERY_RENDERER);
  }
}

export {
  COORDINATOR_ADMISSION_DECISION,
  SELECT_MERGE_MODE,
  assertLiveQueryGroupAdmissible,
  assertLiveQueryPredicateAdmissible,
  assertLiveQueryRendererAdmissible,
  assertSelectFanoutAdmissible,
  evaluateCoordinatorSelectAdmission,
  evaluateCrossPartitionJoinAdmission,
};
