/**
 * Partial and Guarded-Partial aggregate AST rewrite builder (design
 * coordinator-sqlite-merge §2.2, §2.3, Sub-packages 3b and 3f).
 *
 * Rewrites `PARTIAL_AGGREGATE` and `GUARDED_PARTIAL` statements into:
 * - per-partition partial SQL and parameters;
 * - `__partial` table schema (group keys and MIN/MAX/COUNT(DISTINCT) columns
 *   declared with base column type and collation; COUNT and guarded 32-bit
 *   split columns untyped);
 * - coordinator SQLite guard query (`__guard_ok`) for `GUARDED_PARTIAL`;
 * - coordinator SQLite combine SQL and parameters.
 *
 * @module query/distributed/distributed-select-partial-rewrite
 */

import {EXPR_TYPE, SQL_STORAGE_CLASS} from '../parser-constants.js';
import {PG_EXPR_TYPE} from '../pg/pg-compat-constants.js';
import {
  renderSelectWithParameters,
  resultColumnName,
} from '../sql-statement-renderer.js';
import {
  GUARDED_SUM_NAMES,
  PARTIAL_COUNT_NAME,
  findSchemaColumn,
  joinWhereConjuncts,
  unwrapCollateColumn,
} from './distributed-select-fanout-soundness.js';

const PARTIAL_TABLE_NAME = '__partial';
const PARTIAL_COL_PREFIX = '__p_';
const DISTINCT_COL_PREFIX = '__d_';
const GUARDED_COL_PREFIX = '__gp_';
const GUARD_OK_ALIAS = '__guard_ok';
const GUARD_SUBQUERY_ALIAS = '__guard_groups';
const TWO_POW_32_INT = 4294967296n;
const TWO_POW_31_INT = 2147483648n;
const UINT32_MASK_INT = 4294967295n;
const BIT_SHIFT_32_INT = 32n;
const GUARD_ABS_BOUND_REAL_TEXT = '4611686018427387904.0'; // 2^62 as REAL
const ZERO_REAL_TEXT = '0.0';
const GUARD_OVERFLOW_CODE = 2;
const OR_OPERATOR = 'OR';

const SQL_AGG = Object.freeze({
  COUNT: 'COUNT',
  SUM: 'SUM',
  MIN: 'MIN',
  MAX: 'MAX',
  TOTAL: 'TOTAL',
});

const SQL_FN = Object.freeze({
  COALESCE: 'COALESCE',
  COALESCE_LOWER: 'coalesce',
  TYPEOF: 'typeof',
  ABS: 'abs',
});

const SQL_OP = Object.freeze({
  RSHIFT: '>>',
  BIT_AND: '&',
  EQ: '=',
  LT: '<',
  GTE: '>=',
  AND: 'AND',
  PLUS: '+',
  MUL: '*',
  DIV: '/',
});

const SQL_TYPE_TOKEN = Object.freeze({
  REAL: 'REAL',
  INTEGER_LOWER: 'integer',
  NULL_LOWER: 'null',
});

function intLiteral(value) {
  return {
    type: EXPR_TYPE.LITERAL,
    value,
    sqlType: SQL_STORAGE_CLASS.INTEGER,
  };
}

function realLiteral(valueText) {
  return {
    type: EXPR_TYPE.LITERAL,
    value: valueText,
    sqlType: SQL_STORAGE_CLASS.REAL,
  };
}

function textLiteral(value) {
  return {
    type: EXPR_TYPE.LITERAL,
    value,
    sqlType: SQL_STORAGE_CLASS.TEXT,
  };
}

function nullLiteral() {
  return {
    type: EXPR_TYPE.LITERAL,
    value: null,
    sqlType: SQL_STORAGE_CLASS.NULL,
  };
}

function colRef(column, table = null) {
  return {
    type: EXPR_TYPE.COLUMN_REF,
    table,
    column,
  };
}

function fnCall(name, args) {
  return {
    type: PG_EXPR_TYPE.FUNCTION_CALL,
    name,
    args,
  };
}

function aggCall(fnName, argument, distinct = false) {
  return {
    type: EXPR_TYPE.AGGREGATE,
    function: fnName,
    argument,
    distinct,
  };
}

function binaryExpr(operator, left, right) {
  return {
    type: EXPR_TYPE.BINARY,
    operator,
    left,
    right,
  };
}

function castExpr(expression, targetType) {
  return {
    type: PG_EXPR_TYPE.CAST,
    expression,
    targetType,
  };
}

function searchedCase(whenExpr, thenExpression, elseExpr) {
  return {
    type: PG_EXPR_TYPE.CASE,
    operand: null,
    conditions: [{when: whenExpr, thenExpression}],
    elseExpr,
  };
}

function buildPartialColumnMetadata(colName, baseColName, schema) {
  const baseDef = baseColName ? findSchemaColumn(schema, baseColName) : null;
  if (!baseDef) {
    return {name: colName};
  }
  return {
    name: colName,
    type: baseDef.type ?? baseDef.dataType ?? null,
    collation: baseDef.collation ?? null,
  };
}

function registerStandardPartialAggregate(aggNode, state, schema) {
  const index = state.nextIndex;
  state.nextIndex += 1;
  const fn = String(aggNode.function || '').toUpperCase();
  const tableQualifier = state.tableQualifier;

  if (fn === PARTIAL_COUNT_NAME && aggNode.distinct) {
    const partialName = `${DISTINCT_COL_PREFIX}${index}`;
    const unwrapped = unwrapCollateColumn(aggNode.argument);
    const baseColName = unwrapped?.columnRef?.column || null;
    state.partitionColumns.push({
      type: EXPR_TYPE.COLUMN,
      expression: aggNode.argument,
      alias: partialName,
    });
    state.extraPartitionGroupBy.push(aggNode.argument);
    state.partialTableColumns.push(
      buildPartialColumnMetadata(partialName, baseColName, schema),
    );
    return aggCall(PARTIAL_COUNT_NAME, colRef(partialName, tableQualifier), true);
  }

  const partialName = `${PARTIAL_COL_PREFIX}${index}`;
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: aggNode,
    alias: partialName,
  });

  if (fn === PARTIAL_COUNT_NAME) {
    state.partialTableColumns.push({
      name: partialName,
      type: SQL_STORAGE_CLASS.INTEGER,
    });
    return fnCall(SQL_FN.COALESCE, [
      aggCall(SQL_AGG.SUM, colRef(partialName, tableQualifier), false),
      intLiteral(0),
    ]);
  }

  const unwrapped = unwrapCollateColumn(aggNode.argument);
  const baseColName = unwrapped?.columnRef?.column || null;
  state.partialTableColumns.push(
    buildPartialColumnMetadata(partialName, baseColName, schema),
  );
  return aggCall(fn, colRef(partialName, tableQualifier), false);
}

function registerGuardedSumAggregate(aggNode, state) {
  const index = state.nextGuardedIndex;
  state.nextGuardedIndex += 1;
  const fn = String(aggNode.function || '').toUpperCase();
  const arg = aggNode.argument;
  const tableQualifier = state.tableQualifier;

  const colC = `${GUARDED_COL_PREFIX}${index}_c`;
  const colNonInt = `${GUARDED_COL_PREFIX}${index}_nonint`;
  const colAbs = `${GUARDED_COL_PREFIX}${index}_abs`;
  const colHi = `${GUARDED_COL_PREFIX}${index}_hi`;
  const colLoCarry = `${GUARDED_COL_PREFIX}${index}_lo_carry`;
  const colLoLow = `${GUARDED_COL_PREFIX}${index}_lo_low`;

  // 1. COUNT(e)
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: aggCall(SQL_AGG.COUNT, arg, false),
    alias: colC,
  });
  // 2. coalesce(max(typeof(e) NOT IN ('integer', 'null')), 0)
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: fnCall(SQL_FN.COALESCE_LOWER, [
      aggCall(SQL_AGG.MAX, {
        type: EXPR_TYPE.IN,
        expression: fnCall(SQL_FN.TYPEOF, [arg]),
        values: [
          textLiteral(SQL_TYPE_TOKEN.INTEGER_LOWER),
          textLiteral(SQL_TYPE_TOKEN.NULL_LOWER),
        ],
        negated: true,
      }, false),
      intLiteral(0),
    ]),
    alias: colNonInt,
  });
  // 3. total(abs(CAST(e AS REAL)))
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: aggCall(
      SQL_AGG.TOTAL,
      fnCall(SQL_FN.ABS, [castExpr(arg, SQL_TYPE_TOKEN.REAL)]),
      false,
    ),
    alias: colAbs,
  });
  // 4. sum(e >> 32)
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: aggCall(
      SQL_AGG.SUM,
      binaryExpr(SQL_OP.RSHIFT, arg, intLiteral(BIT_SHIFT_32_INT)),
      false,
    ),
    alias: colHi,
  });
  // 5. sum(e & 4294967295) >> 32
  const sumLowBits = aggCall(
    SQL_AGG.SUM,
    binaryExpr(SQL_OP.BIT_AND, arg, intLiteral(UINT32_MASK_INT)),
    false,
  );
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: binaryExpr(SQL_OP.RSHIFT, sumLowBits, intLiteral(BIT_SHIFT_32_INT)),
    alias: colLoCarry,
  });
  // 6. sum(e & 4294967295) & 4294967295
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: binaryExpr(SQL_OP.BIT_AND, sumLowBits, intLiteral(UINT32_MASK_INT)),
    alias: colLoLow,
  });

  for (const name of [colC, colNonInt, colHi, colLoCarry, colLoLow]) {
    state.partialTableColumns.push({name, type: SQL_STORAGE_CLASS.INTEGER});
  }
  state.partialTableColumns.push({name: colAbs, type: SQL_STORAGE_CLASS.REAL});

  // Per-group guard predicate: COALESCE(SUM(nonint), 0) = 0 AND TOTAL(abs) < 2^62
  const nonIntZero = binaryExpr(
    SQL_OP.EQ,
    fnCall(SQL_FN.COALESCE, [
      aggCall(SQL_AGG.SUM, colRef(colNonInt, tableQualifier), false),
      intLiteral(0),
    ]),
    intLiteral(0),
  );
  const absBelowBound = binaryExpr(
    SQL_OP.LT,
    aggCall(SQL_AGG.TOTAL, colRef(colAbs, tableQualifier), false),
    realLiteral(GUARD_ABS_BOUND_REAL_TEXT),
  );
  state.guardConditions.push(binaryExpr(SQL_OP.AND, nonIntZero, absBelowBound));
  state.overflowConditions.push(
    binaryExpr(
      SQL_OP.GTE,
      fnCall(SQL_FN.COALESCE, [
        aggCall(SQL_AGG.MAX, colRef(colC, tableQualifier), false),
        intLiteral(0),
      ]),
      intLiteral(TWO_POW_31_INT),
    ),
  );

  // Exact integer sum combine: ((SUM(hi) + SUM(lo_carry)) * 4294967296 + SUM(lo_low))
  const exactSumExpr = binaryExpr(
    SQL_OP.PLUS,
    binaryExpr(
      SQL_OP.MUL,
      binaryExpr(
        SQL_OP.PLUS,
        aggCall(SQL_AGG.SUM, colRef(colHi, tableQualifier), false),
        aggCall(SQL_AGG.SUM, colRef(colLoCarry, tableQualifier), false),
      ),
      intLiteral(TWO_POW_32_INT),
    ),
    aggCall(SQL_AGG.SUM, colRef(colLoLow, tableQualifier), false),
  );
  const countSumExpr = fnCall(SQL_FN.COALESCE, [
    aggCall(SQL_AGG.SUM, colRef(colC, tableQualifier), false),
    intLiteral(0),
  ]);
  const countIsZero = binaryExpr(SQL_OP.EQ, countSumExpr, intLiteral(0));

  if (fn === SQL_AGG.SUM) {
    return searchedCase(countIsZero, nullLiteral(), exactSumExpr);
  }
  if (fn === SQL_AGG.TOTAL) {
    return searchedCase(
      countIsZero,
      realLiteral(ZERO_REAL_TEXT),
      castExpr(exactSumExpr, SQL_TYPE_TOKEN.REAL),
    );
  }
  // AVG
  return searchedCase(
    countIsZero,
    nullLiteral(),
    binaryExpr(SQL_OP.DIV, castExpr(exactSumExpr, SQL_TYPE_TOKEN.REAL), countSumExpr),
  );
}

function rewriteAggregateTree(node, state, schema, allowGuarded) {
  if (!node || typeof node !== 'object' || node instanceof Uint8Array) return node;
  if (Array.isArray(node)) {
    return node.map((item) => rewriteAggregateTree(item, state, schema, allowGuarded));
  }
  if (node.type === EXPR_TYPE.AGGREGATE) {
    const fn = String(node.function || '').toUpperCase();
    if (allowGuarded && GUARDED_SUM_NAMES.has(fn) && !node.distinct) {
      return registerGuardedSumAggregate(node, state);
    }
    return registerStandardPartialAggregate(node, state, schema);
  }
  const copy = {};
  for (const [key, value] of Object.entries(node)) {
    copy[key] = rewriteAggregateTree(value, state, schema, allowGuarded);
  }
  return copy;
}

function joinOrDisjuncts(disjuncts) {
  if (!Array.isArray(disjuncts) || disjuncts.length === 0) return null;
  let current = disjuncts[0];
  for (let index = 1; index < disjuncts.length; index += 1) {
    current = binaryExpr(OR_OPERATOR, current, disjuncts[index]);
  }
  return current;
}

function buildGuardSqlAndParams(
  ast,
  coordinatorFrom,
  guardConditions,
  overflowConditions,
  resolveParam,
) {
  const combinedGuardExpr = joinWhereConjuncts(guardConditions);
  const combinedOverflowExpr = joinOrDisjuncts(overflowConditions);
  const groupVerdictExpr = combinedOverflowExpr ?
    {
      type: PG_EXPR_TYPE.CASE,
      operand: null,
      conditions: [
        {when: combinedOverflowExpr, thenExpression: intLiteral(GUARD_OVERFLOW_CODE)},
        {when: combinedGuardExpr, thenExpression: intLiteral(1)},
      ],
      elseExpr: intLiteral(0),
    } :
    combinedGuardExpr;
  const guardInnerAst = {
    type: ast.type,
    distinct: false,
    columns: [{
      type: EXPR_TYPE.COLUMN,
      expression: groupVerdictExpr,
      alias: GUARD_OK_ALIAS,
    }],
    from: coordinatorFrom,
    joins: [],
    where: null,
    groupBy: ast.groupBy || null,
    having: null,
    orderBy: null,
    limit: null,
    ctes: null,
    setOperation: null,
  };
  const maxVerdictExpr = fnCall(SQL_FN.COALESCE, [
    aggCall(SQL_AGG.MAX, colRef(GUARD_OK_ALIAS), false),
    intLiteral(0),
  ]);
  const minVerdictExpr = fnCall(SQL_FN.COALESCE, [
    aggCall(SQL_AGG.MIN, colRef(GUARD_OK_ALIAS), false),
    intLiteral(1),
  ]);
  const guardOuterAst = {
    type: ast.type,
    distinct: false,
    columns: [{
      type: EXPR_TYPE.COLUMN,
      expression: searchedCase(
        binaryExpr(SQL_OP.EQ, maxVerdictExpr, intLiteral(GUARD_OVERFLOW_CODE)),
        intLiteral(GUARD_OVERFLOW_CODE),
        minVerdictExpr,
      ),
      alias: GUARD_OK_ALIAS,
    }],
    from: {
      type: EXPR_TYPE.TABLE,
      name: null,
      alias: GUARD_SUBQUERY_ALIAS,
      subquery: guardInnerAst,
    },
    joins: [],
    where: null,
    groupBy: null,
    having: null,
    orderBy: null,
    limit: null,
    ctes: null,
    setOperation: null,
  };
  return renderSelectWithParameters(guardOuterAst, resolveParam);
}

function populateGroupByPartialColumns(groupBy, state, schema) {
  const seenGroupCols = new Set();
  for (const term of groupBy || []) {
    const unwrapped = unwrapCollateColumn(term);
    const colName = unwrapped.columnRef.column;
    const lower = colName.toLowerCase();
    if (!seenGroupCols.has(lower)) {
      seenGroupCols.add(lower);
      state.partitionColumns.push({
        type: EXPR_TYPE.COLUMN,
        expression: colRef(colName, unwrapped.columnRef.table),
        alias: colName,
      });
      state.partialTableColumns.push(
        buildPartialColumnMetadata(colName, colName, schema),
      );
    }
  }
}

function ensureNonEmptyPartialProjection(state) {
  if (state.partitionColumns.length > 0) return;
  const dummyName = `${PARTIAL_COL_PREFIX}0`;
  state.partitionColumns.push({
    type: EXPR_TYPE.COLUMN,
    expression: intLiteral(1),
    alias: dummyName,
  });
  state.partialTableColumns.push({name: dummyName});
}

/**
 * Build a PARTIAL_AGGREGATE or GUARDED_PARTIAL plan descriptor.
 * @param {Object} options
 * @param {Object} options.ast
 * @param {Function} options.resolveParam
 * @param {Object|null} options.schema
 * @param {boolean} options.allowGuarded
 * @param {string} options.planKind
 * @param {Array<string>|null} options.expectedColumns
 * @param {Function} options.buildUnmergedPlan
 * @return {Object}
 */
function buildPartialOrGuardedPlan({
  ast,
  resolveParam,
  schema,
  allowGuarded,
  planKind,
  expectedColumns,
  buildUnmergedPlan,
}) {
  const tableAlias = ast.from.alias || ast.from.name;
  const state = {
    nextIndex: 0,
    nextGuardedIndex: 0,
    tableQualifier: null,
    partitionColumns: [],
    partialTableColumns: [],
    extraPartitionGroupBy: [],
    guardConditions: [],
    overflowConditions: [],
  };

  populateGroupByPartialColumns(ast.groupBy, state, schema);

  const rewrittenColumns = ast.columns.map((col) => ({
    type: EXPR_TYPE.COLUMN,
    expression: rewriteAggregateTree(col.expression, state, schema, allowGuarded),
    alias: resultColumnName(col),
  }));
  const rewrittenHaving = ast.having ?
    rewriteAggregateTree(ast.having, state, schema, allowGuarded) :
    null;
  const rewrittenOrderBy = ast.orderBy ?
    ast.orderBy.map((term) => ({
      ...term,
      expression: rewriteAggregateTree(term.expression, state, schema, allowGuarded),
    })) :
    null;

  ensureNonEmptyPartialProjection(state);

  const partitionGroupBy = [
    ...(ast.groupBy || []),
    ...state.extraPartitionGroupBy,
  ];
  const partitionAst = {
    type: ast.type,
    distinct: false,
    columns: state.partitionColumns,
    from: ast.from,
    joins: [],
    where: ast.where,
    groupBy: partitionGroupBy.length > 0 ? partitionGroupBy : null,
    having: null,
    orderBy: null,
    limit: null,
    ctes: null,
    setOperation: null,
  };

  const coordinatorFrom = {
    type: EXPR_TYPE.TABLE,
    name: PARTIAL_TABLE_NAME,
    alias: tableAlias,
  };
  const coordinatorAst = {
    type: ast.type,
    distinct: Boolean(ast.distinct),
    columns: rewrittenColumns,
    from: coordinatorFrom,
    joins: [],
    where: null,
    groupBy: ast.groupBy || null,
    having: rewrittenHaving,
    orderBy: rewrittenOrderBy,
    limit: ast.limit || null,
    ctes: null,
    setOperation: null,
  };

  const renderedPartition = renderSelectWithParameters(partitionAst, resolveParam);
  const renderedCoordinator = renderSelectWithParameters(coordinatorAst, resolveParam);

  let guardSql = null;
  let guardParams = [];
  let unmergedPlan = null;
  if (allowGuarded && state.guardConditions.length > 0) {
    const renderedGuard = buildGuardSqlAndParams(
      ast,
      coordinatorFrom,
      state.guardConditions,
      state.overflowConditions,
      resolveParam,
    );
    guardSql = renderedGuard.sql;
    guardParams = renderedGuard.params;
    unmergedPlan = buildUnmergedPlan();
  }

  return {
    kind: planKind,
    orderIndependent: true,
    partitionSql: renderedPartition.sql,
    partitionParams: renderedPartition.params,
    coordinatorTableName: PARTIAL_TABLE_NAME,
    coordinatorTableSchema: {columns: state.partialTableColumns},
    coordinatorSql: renderedCoordinator.sql,
    coordinatorParams: renderedCoordinator.params,
    expectedColumns,
    guardSql,
    guardParams,
    unmergedPlan,
  };
}

export {
  PARTIAL_TABLE_NAME,
  binaryExpr,
  buildPartialOrGuardedPlan,
  colRef,
  fnCall,
  intLiteral,
  searchedCase,
};
