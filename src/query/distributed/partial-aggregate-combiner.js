import {
  AGGREGATE_COMBINE_MODE,
  COMBINED_AGGREGATE_MARKER,
  PARTIAL_ALIAS,
  SCALAR_BINARY_OPS,
  SCALAR_UNARY_OPS,
} from './distributed-select-fanout-plan.js';
import {EXPR_TYPE} from '../parser-constants.js';

/** Aggregate function names as the parser normalizes them. */
const AGGREGATE_FN = Object.freeze({
  COUNT: 'COUNT',
  SUM: 'SUM',
  AVG: 'AVG',
  MIN: 'MIN',
  MAX: 'MAX',
});

/**
 * Combine partial-aggregate rows returned by the partitions into final,
 * globally-correct result rows: group by the projected group keys,
 * combine each aggregate's partials per its combine mode, then apply
 * HAVING, ORDER BY, and LIMIT/OFFSET exactly once at the coordinator.
 *
 * The queryExecutor argument supplies the existing row-level clause
 * appliers (applyHaving, applyOrderBy, applyLimit) so global-clause
 * semantics stay single-sourced.
 */

/**
 * Combine one aggregate's partial values for one group.
 * @param {Object} aggregate - Aggregate combine spec entry.
 * @param {Array<Object>} groupRows - Partial rows of the group.
 * @return {*} Final aggregate value (SQL semantics: null over no input
 *   for SUM/AVG/MIN/MAX, 0 for COUNT).
 */
function combineAggregate(aggregate, groupRows) {
  switch (aggregate.combineMode) {
  case AGGREGATE_COMBINE_MODE.SUM_OF_COUNTS:
    return groupRows.reduce(
      (total, row) => total + (Number(row[aggregate.partials.value]) || 0),
      0,
    );
  case AGGREGATE_COMBINE_MODE.SUM_OF_SUMS:
    return combineNullSkipping(
      groupRows,
      aggregate.partials.value,
      (total, value) => total + value,
    );
  case AGGREGATE_COMBINE_MODE.MIN_OF_MINS:
    return combineNullSkipping(
      groupRows,
      aggregate.partials.value,
      (best, value) => (value < best ? value : best),
    );
  case AGGREGATE_COMBINE_MODE.MAX_OF_MAXES:
    return combineNullSkipping(
      groupRows,
      aggregate.partials.value,
      (best, value) => (value > best ? value : best),
    );
  case AGGREGATE_COMBINE_MODE.SUM_PAIR_RATIO: {
    const totalCount = groupRows.reduce(
      (total, row) => total + (Number(row[aggregate.partials.count]) || 0),
      0,
    );
    if (totalCount === 0) {
      return null;
    }
    const totalSum = combineNullSkipping(
      groupRows,
      aggregate.partials.sum,
      (total, value) => total + value,
    );
    return totalSum === null ? null : totalSum / totalCount;
  }
  case AGGREGATE_COMBINE_MODE.DISTINCT_VALUES:
    return combineDistinct(aggregate, groupRows);
  default:
    return null;
  }
}

function combineNullSkipping(groupRows, alias, reducer) {
  let acc = null;
  for (const row of groupRows) {
    const value = row[alias];
    if (value === null || value === undefined) {
      continue;
    }
    acc = acc === null ? value : reducer(acc, value);
  }
  return acc;
}

function combineDistinct(aggregate, groupRows) {
  const distinct = new Set();
  for (const row of groupRows) {
    const value = row[aggregate.partials.values];
    if (value !== null && value !== undefined) {
      distinct.add(value);
    }
  }
  const values = [...distinct];
  if (aggregate.fn === AGGREGATE_FN.COUNT) {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  switch (aggregate.fn) {
  case AGGREGATE_FN.SUM:
    return values.reduce((total, value) => total + Number(value), 0);
  case AGGREGATE_FN.AVG:
    return values.reduce((total, value) => total + Number(value), 0) /
      values.length;
  case AGGREGATE_FN.MIN:
    return values.reduce((best, value) => (value < best ? value : best));
  case AGGREGATE_FN.MAX:
    return values.reduce((best, value) => (value > best ? value : best));
  default:
    return null;
  }
}

/**
 * Build the group key for a partial row.
 * @param {Object} combineSpec - Plan combine spec.
 * @param {Object} row - Partial row.
 * @return {string} Stable group key.
 */
function groupKeyOf(combineSpec, row) {
  return JSON.stringify(
    combineSpec.groupKeys.map((key) => row[key.alias]),
  );
}

/**
 * Merge partition partial-aggregate rows into the final result rows.
 * @param {Array<Object>} partialRows - Concatenated partition rows.
 * @param {Object} combineSpec - Plan combine spec.
 * @param {Object} queryExecutor - QueryExecutor (clause appliers).
 * @return {Array<Object>} Final rows.
 */
function combinePartialAggregateRows(partialRows, combineSpec, queryExecutor) {
  const groups = new Map();
  for (const row of partialRows) {
    const key = groupKeyOf(combineSpec, row);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(row);
  }
  if (groups.size === 0 && !combineSpec.hasGroupBy) {
    groups.set(groupKeyOf(combineSpec, {}), []);
  }

  let internalRows = [];
  for (const groupRows of groups.values()) {
    internalRows.push(buildInternalRow(combineSpec, groupRows));
  }

  if (combineSpec.having) {
    internalRows = queryExecutor.applyHaving(
      internalRows,
      combineSpec.having,
    );
  }
  if (combineSpec.orderBy) {
    internalRows = queryExecutor.applyOrderBy(
      internalRows,
      combineSpec.orderBy,
    );
  }
  if (combineSpec.limit) {
    internalRows = queryExecutor.applyLimit(internalRows, combineSpec.limit);
  }
  return internalRows.map((row) => projectFinalRow(combineSpec, row));
}

function buildInternalRow(combineSpec, groupRows) {
  const firstRow = groupRows[0] || {};
  const row = {};
  const starKeys = [];
  if (combineSpec.includeStar) {
    for (const key of Object.keys(firstRow)) {
      if (!isInternalAlias(key)) {
        row[key] = firstRow[key];
        starKeys.push(key);
      }
    }
  }
  for (const key of combineSpec.groupKeys) {
    const value = firstRow[key.alias];
    for (const outputKey of key.outputKeys) {
      row[outputKey] = value;
    }
    row[key.alias] = value;
  }
  for (const bare of combineSpec.bareColumns) {
    row[bare.outputKey] = firstRow[bare.alias];
  }
  const combinedBySpecIndex = new Map();
  for (const aggregate of combineSpec.aggregates) {
    const value = combineAggregate(aggregate, groupRows);
    combinedBySpecIndex.set(aggregate.index, value);
    row[aggregate.havingKey] = value;
    for (const outputKey of aggregate.outputKeys) {
      row[outputKey] = value;
    }
  }
  for (const expressionColumn of combineSpec.expressionColumns) {
    row[expressionColumn.outputKey] = evaluateScalarExpression(
      expressionColumn.expression,
      row,
      combinedBySpecIndex,
    );
  }
  Object.defineProperty(row, STAR_KEYS_PROPERTY, {
    value: starKeys,
    enumerable: false,
  });
  return row;
}

/** Hidden per-row list of star-projected raw column names. */
const STAR_KEYS_PROPERTY = '__fanoutStarKeys';

function isInternalAlias(key) {
  return key.startsWith(PARTIAL_ALIAS.GROUP_KEY_PREFIX) ||
    key.startsWith(PARTIAL_ALIAS.AGGREGATE_PREFIX) ||
    key.startsWith(PARTIAL_ALIAS.BARE_PREFIX);
}

/**
 * Evaluate a coordinator-side scalar expression over a combined row.
 * SQL null semantics: any null operand nullifies arithmetic and
 * comparisons; boolean outcomes surface as 1/0 to match SQLite.
 * @param {Object} node - Expression AST (markers for aggregates).
 * @param {Object} row - Internal combined row.
 * @param {Map} combinedBySpecIndex - Aggregate spec index -> value.
 * @return {*} Scalar value.
 */
function evaluateScalarExpression(node, row, combinedBySpecIndex) {
  switch (node?.type) {
  case EXPR_TYPE.LITERAL:
    return node.value;
  case EXPR_TYPE.COLUMN_REF:
    return row[node.column];
  case COMBINED_AGGREGATE_MARKER:
    return combinedBySpecIndex.get(node.specIndex);
  case EXPR_TYPE.UNARY: {
    const op = SCALAR_UNARY_OPS[node.operator];
    if (!op) {
      return null;
    }
    const operand = evaluateScalarExpression(
      node.operand,
      row,
      combinedBySpecIndex,
    );
    if (operand === null || operand === undefined) {
      return null;
    }
    return op(operand);
  }
  case EXPR_TYPE.BINARY: {
    const op = SCALAR_BINARY_OPS[node.operator];
    if (!op) {
      return null;
    }
    const left = evaluateScalarExpression(
      node.left,
      row,
      combinedBySpecIndex,
    );
    const right = evaluateScalarExpression(
      node.right,
      row,
      combinedBySpecIndex,
    );
    if (left === null || left === undefined ||
      right === null || right === undefined) {
      return null;
    }
    return op(left, right);
  }
  default:
    return null;
  }
}

function projectFinalRow(combineSpec, internalRow) {
  const row = {};
  for (const starKey of internalRow[STAR_KEYS_PROPERTY] || []) {
    row[starKey] = internalRow[starKey];
  }
  for (const key of combineSpec.groupKeys) {
    for (const outputKey of key.outputKeys) {
      row[outputKey] = internalRow[outputKey];
    }
  }
  for (const bare of combineSpec.bareColumns) {
    if (bare.projected) {
      row[bare.outputKey] = internalRow[bare.outputKey];
    }
  }
  for (const aggregate of combineSpec.aggregates) {
    for (const outputKey of aggregate.outputKeys) {
      row[outputKey] = internalRow[outputKey];
    }
  }
  for (const expressionColumn of combineSpec.expressionColumns) {
    row[expressionColumn.outputKey] = internalRow[expressionColumn.outputKey];
  }
  return row;
}

export {combinePartialAggregateRows};
