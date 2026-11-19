/**
 * Five-kind distributed SELECT fan-out planner (design coordinator-sqlite-merge
 * §2.2, §2.3, Revision 6):
 *
 *   SINGLE_PARTITION      1 table reference routed to 1 partition (order-
 *                         independent or rowid-bearing): runs losslessly
 *                         rendered SQL directly on the partition.
 *   FRAGMENT_MERGE        1 table reference, >= 2 partitions, non-aggregate,
 *                         order-independent, all WHERE conjuncts pushable, no
 *                         per-statement time: ships referenced base columns
 *                         (with sound DISTINCT and SQL-rendered overfetch LIMIT)
 *                         and runs the original projection, DISTINCT, ORDER BY,
 *                         and LIMIT/OFFSET in CoordinatorMergeSession.
 *   PARTIAL_AGGREGATE     1 table reference, >= 2 partitions, allowlisted
 *                         GROUP BY keys and COUNT/MIN/MAX partials, all WHERE
 *                         conjuncts pushable, no per-statement time: ships
 *                         per-partition partials into `__partial` and combines
 *                         in CoordinatorMergeSession.
 *   GUARDED_PARTIAL       1 table reference, >= 2 partitions, allowlisted
 *                         GROUP BY keys and non-DISTINCT deterministic
 *                         SUM/AVG/TOTAL with carry-normalized 32-bit partials
 *                         (Sub-package 3f): coordinator SQLite evaluates
 *                         `GUARD_HELD` vs `GUARD_FAILED`; on `GUARD_FAILED`
 *                         discards phase-1 partials and transitions to
 *                         COORDINATOR_EVALUATED.
 *   COORDINATOR_EVALUATED Everything else (order-dependent queries, expression
 *                         GROUP BY, non-allowlisted MIN/MAX/GROUP BY/DISTINCT,
 *                         GROUP_CONCAT, per-statement time, subqueries, CTEs,
 *                         compounds): ships base rows (with `ORDER BY <pk ASC>`
 *                         when order-dependent) into CoordinatorMergeSession /
 *                         CoordinatorMergeProcessPool.
 *
 * @module query/distributed/distributed-select-fanout-plan
 */

import {EXPR_TYPE} from '../parser-constants.js';
import {QUERY_ERROR_CODE} from '../query-constants.js';
import {
  renderSelectWithParameters,
  resultColumnName,
} from '../sql-statement-renderer.js';
import {
  assertMultiPartitionRowidAdmissible,
  classifySingleTableStatement,
  collectAllBaseTableNames,
  hasUnshadowedRowidReference,
  isAllowlistedColumnExpr,
  isDeterministicExpression,
  isPerStatementTimeExpression,
  joinWhereConjuncts,
  splitWhereConjuncts,
  unwrapCollateColumn,
} from './distributed-select-fanout-soundness.js';
import {
  binaryExpr,
  buildPartialOrGuardedPlan,
  colRef,
  fnCall,
  intLiteral,
  searchedCase,
} from './distributed-select-partial-rewrite.js';

const FANOUT_PLAN_KIND = Object.freeze({
  SINGLE_PARTITION: 'single_partition',
  FRAGMENT_MERGE: 'fragment_merge',
  PARTIAL_AGGREGATE: 'partial_aggregate',
  GUARDED_PARTIAL: 'guarded_partial',
  COORDINATOR_EVALUATED: 'coordinator_evaluated',
  // Alias for callers referencing RAW_ROWS:
  RAW_ROWS: 'coordinator_evaluated',
});

const MAX_GUARDED_PARTIAL_PARTITIONS = 1073741824; // 2^30
const INT64_MAX_BIGINT = 9223372036854775807n;
const ASC_DIRECTION = 'ASC';
const STAR_SYMBOL = '*';
const UNBOUND_PARAM_PREFIX = 'Unbound parameter index: ';
const NON_EXPRESSION_AST_KEYS = new Set(['type', 'alias', 'span']);

const SQL_OP = Object.freeze({
  LT: '<',
  PLUS: '+',
});

const SQL_FN = Object.freeze({
  MIN: 'min',
  MAX: 'max',
});

function createParameterResolver(params) {
  return (paramNode) => {
    const index = paramNode?.index;
    if (
      !Array.isArray(params) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= params.length ||
      params[index] === undefined
    ) {
      const error = new Error(`${UNBOUND_PARAM_PREFIX}${index}`);
      error.code = QUERY_ERROR_CODE.SYNTAX_ERROR;
      throw error;
    }
    return params[index];
  };
}

/**
 * Validate that every PARAMETER AST node in `node` has a bound value in
 * `params` (SQL NULL is valid; `undefined` or out-of-bounds is rejected with
 * SYNTAX_ERROR).
 * @param {*} node - AST node or subtree.
 * @param {Array<*>} params - Positional parameters.
 */
function assertQueryParametersBound(node, params = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) assertQueryParametersBound(item, params);
    return;
  }
  if (node.type === EXPR_TYPE.PARAMETER) {
    createParameterResolver(params)(node);
    return;
  }
  for (const value of Object.values(node)) {
    assertQueryParametersBound(value, params);
  }
}

function extractCatalogSchema(rawSchema) {
  if (!rawSchema || typeof rawSchema !== 'object') return null;
  if (Array.isArray(rawSchema.columns)) return rawSchema;
  if (typeof rawSchema.schema_definition === 'string') {
    return JSON.parse(rawSchema.schema_definition);
  }
  if (typeof rawSchema.schema === 'string') {
    return JSON.parse(rawSchema.schema);
  }
  if (rawSchema.schema && typeof rawSchema.schema === 'object') {
    return rawSchema.schema;
  }
  return null;
}

function extractPrimaryBaseTableName(ast) {
  const baseTables = collectAllBaseTableNames(ast);
  if (baseTables.length > 0) return baseTables[0];
  return typeof ast?.from?.name === 'string' ? ast.from.name : null;
}

function extractTableSchemaForSelect(ast, options) {
  if (options?.schema) {
    return extractCatalogSchema(options.schema);
  }
  const tableName = extractPrimaryBaseTableName(ast);
  if (typeof tableName === 'string' && options?.resolveTableSchema) {
    return extractCatalogSchema(options.resolveTableSchema(tableName));
  }
  return null;
}

function resolveExpectedOutputColumns(ast) {
  if (!Array.isArray(ast?.columns)) return null;
  if (ast.columns.some((col) => col.type === EXPR_TYPE.STAR)) {
    return null;
  }
  return ast.columns.map((col) => resultColumnName(col));
}

function collectBaseColumnsInList(items, into, aliasSet) {
  let hasStar = false;
  for (const item of items) {
    if (collectBaseColumnsInNode(item, into, aliasSet).hasStar) {
      hasStar = true;
    }
  }
  return {hasStar};
}

function collectBaseColumnsInObject(node, into, aliasSet) {
  let hasStar = false;
  for (const [key, value] of Object.entries(node)) {
    if (NON_EXPRESSION_AST_KEYS.has(key)) continue;
    if (collectBaseColumnsInNode(value, into, aliasSet).hasStar) {
      hasStar = true;
    }
  }
  return {hasStar};
}

function collectBaseColumnsInNode(node, into, aliasSet = null) {
  if (!node || typeof node !== 'object') return {hasStar: false};
  if (Array.isArray(node)) {
    return collectBaseColumnsInList(node, into, aliasSet);
  }
  if (node.type === EXPR_TYPE.STAR) {
    return {hasStar: true};
  }
  if (node.type === EXPR_TYPE.COLUMN_REF && typeof node.column === 'string') {
    const isNonBaseAlias = !node.table &&
      Boolean(aliasSet) &&
      aliasSet.has(node.column.toLowerCase());
    if (!isNonBaseAlias) {
      into.add(node.column);
    }
    return {hasStar: false};
  }
  return collectBaseColumnsInObject(node, into, aliasSet);
}

function buildNonBaseSelectAliasSet(columns, baseColumnSet) {
  const aliases = new Set();
  for (const col of columns || []) {
    if (typeof col?.alias === 'string' && col.alias.length > 0) {
      const lower = col.alias.toLowerCase();
      if (!baseColumnSet.has(lower)) {
        aliases.add(lower);
      }
    }
  }
  return aliases;
}

function toLimitOperandAst(value, defaultZero = false) {
  if (value === null || value === undefined) {
    return defaultZero ? intLiteral(0) : intLiteral(-1);
  }
  return typeof value === 'number' ? intLiteral(value) : value;
}

function buildOverfetchLimitExpression(limitClause) {
  const countIsInt = typeof limitClause.count === 'number' &&
    Number.isSafeInteger(limitClause.count);
  const offsetVal = limitClause.offset === null || limitClause.offset === undefined ?
    0 :
    limitClause.offset;
  const offsetIsInt = typeof offsetVal === 'number' && Number.isSafeInteger(offsetVal);
  if (countIsInt && offsetIsInt) {
    return limitClause.count < 0 ? -1 : limitClause.count + Math.max(offsetVal, 0);
  }
  const countExpr = toLimitOperandAst(limitClause.count, false);
  const offsetExpr = toLimitOperandAst(limitClause.offset, true);

  return searchedCase(
    binaryExpr(SQL_OP.LT, countExpr, intLiteral(0)),
    intLiteral(-1),
    fnCall(SQL_FN.MIN, [
      binaryExpr(SQL_OP.PLUS, countExpr, fnCall(SQL_FN.MAX, [offsetExpr, intLiteral(0)])),
      intLiteral(INT64_MAX_BIGINT),
    ]),
  );
}

function isOrderByTermPushable(term, isDistinct, aliasSet, selectColumnNames) {
  const expr = term?.expression ?? term;
  if (!isDeterministicExpression(expr)) return false;
  if (expr?.type === EXPR_TYPE.LITERAL && Number.isInteger(expr.value)) {
    return false;
  }
  const orderCols = new Set();
  if (collectBaseColumnsInNode(expr, orderCols, null).hasStar) {
    return false;
  }
  for (const col of orderCols) {
    if (aliasSet.has(col.toLowerCase())) {
      return false;
    }
  }
  if (!isDistinct) return true;
  const bare = unwrapCollateColumn(expr);
  return Boolean(bare) && selectColumnNames.has(bare.columnRef.column.toLowerCase());
}

function canPushOrderByAndLimitInFragmentMerge(
  ast,
  partitionDistinct,
  selectColumnNames,
  baseColumnSet,
) {
  if (!ast.limit) return false;
  if (ast.distinct && !partitionDistinct) return false;
  const aliasSet = buildNonBaseSelectAliasSet(ast.columns, baseColumnSet);
  const terms = Array.isArray(ast.orderBy) ? ast.orderBy : [];
  return terms.every((term) =>
    isOrderByTermPushable(term, Boolean(ast.distinct), aliasSet, selectColumnNames));
}

function extractWitnessColumnName(schema) {
  if (Array.isArray(schema?.primaryKey) && schema.primaryKey.length > 0) {
    return schema.primaryKey[0];
  }
  if (Array.isArray(schema?.columns) && schema.columns.length > 0) {
    return schema.columns[0].name;
  }
  return null;
}

function buildFragmentPartitionColumns(selectStar, orderStar, allReferenced, schema) {
  if (selectStar || orderStar) {
    return [{type: EXPR_TYPE.STAR, value: STAR_SYMBOL}];
  }
  if (allReferenced.size > 0) {
    return [...allReferenced].map((colName) => ({
      type: EXPR_TYPE.COLUMN,
      expression: colRef(colName),
      alias: null,
    }));
  }
  const witnessCol = extractWitnessColumnName(schema);
  return witnessCol ?
    [{type: EXPR_TYPE.COLUMN, expression: colRef(witnessCol), alias: null}] :
    [{type: EXPR_TYPE.STAR, value: STAR_SYMBOL}];
}

function canPushDistinctToPartition(ast, selectStar, selectLowerSet, orderCols, schema) {
  if (!ast.distinct || selectStar) return false;
  const allSelectBareAllowlisted = ast.columns.every(
    (col) => col.type !== EXPR_TYPE.STAR && isAllowlistedColumnExpr(col.expression, schema),
  );
  if (!allSelectBareAllowlisted) return false;
  return [...orderCols].every((col) => selectLowerSet.has(col.toLowerCase()));
}

function buildFragmentMergePlan(ast, params, schema) {
  const resolveParam = createParameterResolver(params);
  const schemaCols = Array.isArray(schema?.columns) ? schema.columns : [];
  const baseColumnSet = new Set(schemaCols.map((c) => String(c.name).toLowerCase()));
  const selectCols = new Set();
  const orderCols = new Set();
  const selectStar = collectBaseColumnsInNode(ast.columns, selectCols, null).hasStar;
  const aliasSet = buildNonBaseSelectAliasSet(ast.columns, baseColumnSet);
  const orderStar = collectBaseColumnsInNode(ast.orderBy, orderCols, aliasSet).hasStar;
  const allReferenced = new Set([...selectCols, ...orderCols]);
  const selectLowerSet = new Set([...selectCols].map((c) => c.toLowerCase()));

  const partitionDistinct = canPushDistinctToPartition(
    ast,
    selectStar,
    selectLowerSet,
    orderCols,
    schema,
  );
  const pushLimit = canPushOrderByAndLimitInFragmentMerge(
    ast,
    partitionDistinct,
    selectLowerSet,
    baseColumnSet,
  );
  const partitionColumns = buildFragmentPartitionColumns(
    selectStar,
    orderStar,
    allReferenced,
    schema,
  );

  const partitionAst = {
    type: ast.type,
    distinct: partitionDistinct,
    columns: partitionColumns,
    from: ast.from,
    joins: [],
    where: ast.where,
    groupBy: null,
    having: null,
    orderBy: pushLimit ? ast.orderBy : null,
    limit: pushLimit ? {count: buildOverfetchLimitExpression(ast.limit), offset: null} : null,
    ctes: null,
    setOperation: null,
  };

  const coordinatorAst = {
    ...ast,
    where: null,
  };

  const renderedPartition = renderSelectWithParameters(partitionAst, resolveParam);
  const renderedCoordinator = renderSelectWithParameters(coordinatorAst, resolveParam);

  return {
    kind: FANOUT_PLAN_KIND.FRAGMENT_MERGE,
    orderIndependent: true,
    partitionSql: renderedPartition.sql,
    partitionParams: renderedPartition.params,
    coordinatorTableName: ast.from.name,
    coordinatorTableSchema: schema,
    coordinatorSql: renderedCoordinator.sql,
    coordinatorParams: renderedCoordinator.params,
    expectedColumns: resolveExpectedOutputColumns(ast),
  };
}

function isConjunctPushableToPartition(conjunct, orderIndependent) {
  if (isPerStatementTimeExpression(conjunct)) return false;
  if (!orderIndependent && !isDeterministicExpression(conjunct)) {
    return false;
  }
  return true;
}

function buildPrimaryKeyOrderBy(schema) {
  const primaryKey = Array.isArray(schema?.primaryKey) ? schema.primaryKey : [];
  if (primaryKey.length === 0) return null;
  return primaryKey.map((colName) => ({
    expression: colRef(colName),
    direction: ASC_DIRECTION,
  }));
}

function buildFullTableFetchAst(selectType, tableName, pkOrderBy, whereClause = null) {
  return {
    type: selectType,
    distinct: false,
    columns: [{type: EXPR_TYPE.STAR, value: STAR_SYMBOL}],
    from: {type: EXPR_TYPE.TABLE, name: tableName, alias: null},
    joins: [],
    where: whereClause,
    groupBy: null,
    having: null,
    orderBy: pkOrderBy,
    limit: null,
    ctes: null,
    setOperation: null,
  };
}

function buildNestedCoordinatorEvaluatedPlan(ast, resolveParam, schema) {
  const baseTables = collectAllBaseTableNames(ast);
  const primaryTable = extractPrimaryBaseTableName(ast);
  const extraBaseTableNames = baseTables.slice(1);
  const renderedCoordinator = renderSelectWithParameters(ast, resolveParam);
  const pkOrderBy = buildPrimaryKeyOrderBy(schema);
  const partitionAst = primaryTable ?
    buildFullTableFetchAst(ast.type, primaryTable, pkOrderBy) :
    null;
  const renderedPartition = partitionAst ?
    renderSelectWithParameters(partitionAst, resolveParam) :
    {sql: renderedCoordinator.sql, params: renderedCoordinator.params};

  return {
    kind: FANOUT_PLAN_KIND.COORDINATOR_EVALUATED,
    orderIndependent: false,
    hasNestedOrCompound: true,
    extraBaseTableNames,
    partitionSql: renderedPartition.sql,
    partitionParams: renderedPartition.params,
    coordinatorTableName: primaryTable,
    coordinatorTableSchema: schema,
    coordinatorSql: renderedCoordinator.sql,
    coordinatorParams: renderedCoordinator.params,
    expectedColumns: resolveExpectedOutputColumns(ast),
  };
}

function partitionWhereConjuncts(whereClause, orderIndependent) {
  const conjuncts = splitWhereConjuncts(whereClause);
  const pushedConjuncts = [];
  const coordinatorConjuncts = [];
  for (const conjunct of conjuncts) {
    if (isConjunctPushableToPartition(conjunct, orderIndependent)) {
      pushedConjuncts.push(conjunct);
    } else {
      coordinatorConjuncts.push(conjunct);
    }
  }
  return {
    partitionWhere: joinWhereConjuncts(pushedConjuncts),
    coordinatorWhere: orderIndependent ?
      joinWhereConjuncts(coordinatorConjuncts) :
      whereClause,
  };
}

function buildCoordinatorEvaluatedPlan(ast, params, schema, classification) {
  const resolveParam = createParameterResolver(params);
  if (classification.hasNestedOrCompound || !ast.from?.name) {
    return buildNestedCoordinatorEvaluatedPlan(ast, resolveParam, schema);
  }

  const orderIndependent = classification.orderIndependent === true;
  const {partitionWhere, coordinatorWhere} = partitionWhereConjuncts(
    ast.where,
    orderIndependent,
  );
  const pkOrderBy = orderIndependent ? null : buildPrimaryKeyOrderBy(schema);

  const partitionAst = {
    type: ast.type,
    distinct: false,
    columns: [{type: EXPR_TYPE.STAR, value: STAR_SYMBOL}],
    from: ast.from,
    joins: [],
    where: partitionWhere,
    groupBy: null,
    having: null,
    orderBy: pkOrderBy,
    limit: null,
    ctes: null,
    setOperation: null,
  };

  const coordinatorAst = orderIndependent ?
    {...ast, where: coordinatorWhere} :
    ast;

  const renderedPartition = renderSelectWithParameters(partitionAst, resolveParam);
  const renderedCoordinator = renderSelectWithParameters(coordinatorAst, resolveParam);

  return {
    kind: FANOUT_PLAN_KIND.COORDINATOR_EVALUATED,
    orderIndependent,
    hasNestedOrCompound: false,
    partitionSql: renderedPartition.sql,
    partitionParams: renderedPartition.params,
    coordinatorTableName: ast.from.name,
    coordinatorTableSchema: schema,
    coordinatorSql: renderedCoordinator.sql,
    coordinatorParams: renderedCoordinator.params,
    expectedColumns: resolveExpectedOutputColumns(ast),
  };
}

function isSinglePartitionTableQuery(ast, partitionCount, classification) {
  return (
    partitionCount <= 1 &&
    !classification.hasNestedOrCompound &&
    Boolean(ast.from?.name)
  );
}

function canExecuteDirectlyOnSinglePartition(ast, schema, classification) {
  if (classification.orderIndependent) return true;
  if (hasUnshadowedRowidReference(ast, schema)) return true;
  const hasPrimaryKey = Array.isArray(schema?.primaryKey) && schema.primaryKey.length > 0;
  return !hasPrimaryKey;
}

function isMultiPartitionPushdownCandidate(partitionCount, classification) {
  return (
    partitionCount >= 2 &&
    !classification.hasNestedOrCompound &&
    !classification.hasPerStatementTime
  );
}

/**
 * Build the five-kind distributed SELECT fan-out plan.
 * @param {Object} ast - Parsed SELECT AST.
 * @param {Array<*>} [params=[]] - Positional parameters.
 * @param {number} [partitionCount=1] - Number of target partitions.
 * @param {Object} [options={}] - Optional catalog schema or resolver.
 * @return {Object} Fan-out plan descriptor.
 */
function buildSelectFanoutPlan(ast, params = [], partitionCount = 1, options = {}) {
  assertQueryParametersBound(ast, params);
  const schema = extractTableSchemaForSelect(ast, options);
  assertMultiPartitionRowidAdmissible(ast, partitionCount, schema);

  const classification = classifySingleTableStatement(ast, schema);
  const resolveParam = createParameterResolver(params);

  // 1. SINGLE_PARTITION
  if (isSinglePartitionTableQuery(ast, partitionCount, classification)) {
    if (canExecuteDirectlyOnSinglePartition(ast, schema, classification)) {
      const rendered = renderSelectWithParameters(ast, resolveParam);
      return {
        kind: FANOUT_PLAN_KIND.SINGLE_PARTITION,
        orderIndependent: true,
        partitionSql: rendered.sql,
        partitionParams: rendered.params,
        coordinatorTableName: null,
        coordinatorTableSchema: null,
        coordinatorSql: null,
        coordinatorParams: [],
        expectedColumns: resolveExpectedOutputColumns(ast),
      };
    }
    return buildCoordinatorEvaluatedPlan(ast, params, schema, classification);
  }

  if (isMultiPartitionPushdownCandidate(partitionCount, classification)) {
    // 2. FRAGMENT_MERGE
    if (!classification.isAggregateQuery && classification.orderIndependent) {
      return buildFragmentMergePlan(ast, params, schema);
    }

    // 3. PARTIAL_AGGREGATE
    if (classification.isAggregateQuery && classification.eligibleForPartialAggregate) {
      return buildPartialOrGuardedPlan({
        ast,
        resolveParam,
        schema,
        allowGuarded: false,
        planKind: FANOUT_PLAN_KIND.PARTIAL_AGGREGATE,
        expectedColumns: resolveExpectedOutputColumns(ast),
        buildUnmergedPlan: () => null,
      });
    }

    // 4. GUARDED_PARTIAL (Sub-package 3f)
    if (
      partitionCount < MAX_GUARDED_PARTIAL_PARTITIONS &&
      classification.isAggregateQuery &&
      classification.eligibleForGuardedPartial
    ) {
      return buildPartialOrGuardedPlan({
        ast,
        resolveParam,
        schema,
        allowGuarded: true,
        planKind: FANOUT_PLAN_KIND.GUARDED_PARTIAL,
        expectedColumns: resolveExpectedOutputColumns(ast),
        buildUnmergedPlan: () =>
          buildCoordinatorEvaluatedPlan(ast, params, schema, classification),
      });
    }
  }

  // 5. COORDINATOR_EVALUATED
  return buildCoordinatorEvaluatedPlan(ast, params, schema, classification);
}

export {
  FANOUT_PLAN_KIND,
  assertQueryParametersBound,
  buildPrimaryKeyOrderBy,
  buildSelectFanoutPlan,
  createParameterResolver,
  extractCatalogSchema,
  resolveExpectedOutputColumns,
};
