import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  SQL_COMPARISON_AFFINITY,
  applySqlComparisonAffinity,
  areSqlScalarsEqualWithAffinity,
  compareSqlScalarsWithAffinity,
  resolveOperandComparisonAffinity,
} from './distributed/residual-predicate-evaluator.js';

const {QUERY_ERROR_CODE, QUERY_EXECUTOR_LITERAL} = QUERY_EXECUTOR_SHARED;
const UNBOUND_PARAMETER_PREFIX = 'Unbound parameter index: ';
const INVALID_PARAMETER_NAN_MSG = 'Invalid parameter value: NaN is unrepresentable';
const SUBSTR_WITH_LENGTH_ARG_COUNT = 3;
const DECIMAL_BASE = 10;
const GROUP_KEY_DELIMITER = '|';
const LIKE_ESCAPE_REPLACEMENT = '\\$&';
const LIKE_ANY_SEQ_PATTERN = '.*';
const LIKE_ANY_CHAR_PATTERN = '.';
const SORT_DIR_DESC = 'DESC';
const EXPR_NODE_TYPE = Object.freeze({
  CASE: 'case', CAST: 'cast', FUNCTION_CALL: 'function_call', FUNCTION: 'function',
});
const ARITHMETIC_OPERATOR = Object.freeze({
  ADD: '+', SUBTRACT: '-', MULTIPLY: '*', DIVIDE: '/', MODULO: '%', CONCAT: '||',
});
const SCALAR_FN = Object.freeze({
  COALESCE: 'COALESCE', IFNULL: 'IFNULL', NULLIF: 'NULLIF', IIF: 'IIF',
  ABS: 'ABS', LOWER: 'LOWER', UPPER: 'UPPER', TRIM: 'TRIM', LENGTH: 'LENGTH',
  SUBSTR: 'SUBSTR', SUBSTRING: 'SUBSTRING', ROUND: 'ROUND',
});

function defineHiddenRowProperty(target, key, value) {
  if (!key || Object.prototype.hasOwnProperty.call(target, key)) return;
  Object.defineProperty(target, key, {
    value, enumerable: false, configurable: true, writable: true,
  });
}

function walkAstAggregates(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((entry) => walkAstAggregates(entry, visit));
    return;
  }
  if (node.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
    visit(node);
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkAstAggregates(value, visit);
  }
}

function resolveParameterNodeIndex(expr) {
  return Number.isInteger(expr?.__fanoutParamIndex) ?
    expr.__fanoutParamIndex : expr?.index;
}

function resolveBoundParameterValue(expr, params) {
  const index = resolveParameterNodeIndex(expr);
  if (!Array.isArray(params) || !Number.isInteger(index) ||
      index < 0 || index >= params.length || params[index] === undefined) {
    const label = Number.isInteger(index) ?
      String(index) : QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
    const error = new Error(`${UNBOUND_PARAMETER_PREFIX}${label}`);
    error.code = QUERY_ERROR_CODE.SYNTAX_ERROR;
    error.errorCode = QUERY_ERROR_CODE.SYNTAX_ERROR;
    throw error;
  }
  const value = params[index];
  if (typeof value === 'number' && Number.isNaN(value)) {
    const error = new Error(INVALID_PARAMETER_NAN_MSG);
    error.code = QUERY_ERROR_CODE.SYNTAX_ERROR;
    error.errorCode = QUERY_ERROR_CODE.SYNTAX_ERROR;
    throw error;
  }
  return value;
}

function assertAstParametersBound(node, params) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) assertAstParametersBound(entry, params);
    return;
  }
  if (node.type === QUERY_EXECUTOR_LITERAL.STRING_PARAMETER) {
    resolveBoundParameterValue(node, params);
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') assertAstParametersBound(value, params);
  }
}

function evaluateBinaryArithmetic(operator, left, right) {
  if (operator === ARITHMETIC_OPERATOR.CONCAT) {
    return left === null || left === undefined || right === null || right === undefined ?
      {handled: true, value: null} :
      {handled: true, value: String(left) + String(right)};
  }
  if (operator !== ARITHMETIC_OPERATOR.ADD &&
      operator !== ARITHMETIC_OPERATOR.SUBTRACT &&
      operator !== ARITHMETIC_OPERATOR.MULTIPLY &&
      operator !== ARITHMETIC_OPERATOR.DIVIDE &&
      operator !== ARITHMETIC_OPERATOR.MODULO) {
    return {handled: false, value: null};
  }
  if (left === null || left === undefined || right === null || right === undefined) {
    return {handled: true, value: null};
  }
  const numLeft = Number(left);
  const numRight = Number(right);
  if (operator === ARITHMETIC_OPERATOR.ADD) return {handled: true, value: numLeft + numRight};
  if (operator === ARITHMETIC_OPERATOR.SUBTRACT) return {handled: true, value: numLeft - numRight};
  if (operator === ARITHMETIC_OPERATOR.MULTIPLY) return {handled: true, value: numLeft * numRight};
  if (operator === ARITHMETIC_OPERATOR.DIVIDE) {
    if (numRight === 0) return {handled: true, value: null};
    const divVal = Number.isInteger(left) && Number.isInteger(right) ?
      Math.trunc(numLeft / numRight) : numLeft / numRight;
    return {handled: true, value: divVal};
  }
  const divisor = Math.trunc(numRight);
  return {handled: true, value: divisor === 0 ? null : Math.trunc(numLeft) % divisor};
}

function evaluateScalarComparisonOperator(operator, left, right, leftNode, rightNode) {
  if (operator === QUERY_EXECUTOR_LITERAL.STRING_VALUE_5) {
    return areSqlScalarsEqualWithAffinity(left, right, leftNode, rightNode);
  }
  const cmp = compareSqlScalarsWithAffinity(left, right, leftNode, rightNode);
  if (cmp === null) {
    return false;
  }
  switch (operator) {
  case QUERY_EXECUTOR_LITERAL.STRING_VALUE_6:
  case QUERY_EXECUTOR_LITERAL.STRING_VALUE_7:
    return cmp !== 0;
  case QUERY_EXECUTOR_LITERAL.STRING_VALUE_8:
    return cmp < 0;
  case QUERY_EXECUTOR_LITERAL.STRING_VALUE_9:
    return cmp <= 0;
  case QUERY_EXECUTOR_LITERAL.STRING_VALUE_10:
    return cmp > 0;
  case QUERY_EXECUTOR_LITERAL.STRING_VALUE_11:
    return cmp >= 0;
  default:
    return true;
  }
}

function applyGroupColumnAggregate(executor, result, rows, col) {
  const expr = col.expression || col;
  if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
    const canonicalKey = `${expr.function}(${executor.getArgName(expr)})`;
    const alias = col.alias || canonicalKey;
    const value = executor.computeAggregate(rows, expr);
    result[alias] = value;
    defineHiddenRowProperty(result, canonicalKey, value);
  } else if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF && rows.length > 0) {
    const value = resolveRowColumnRef(rows[0], expr);
    const outputKey = col.alias ? col.alias : expr.column;
    result[outputKey] = value;
    defineHiddenRowProperty(result, expr.column, value);
    if (expr.table) {
      defineHiddenRowProperty(result, `${expr.table}.${expr.column}`, value);
    }
  }
}

function attachClauseAggregatesAndHiddenRowKeys(executor, result, rows, ast) {
  const registerHiddenAggregate = (aggExpr) => {
    const canonicalKey = `${aggExpr.function}(${executor.getArgName(aggExpr)})`;
    if (!Object.prototype.hasOwnProperty.call(result, canonicalKey)) {
      defineHiddenRowProperty(
        result,
        canonicalKey,
        executor.computeAggregate(rows, aggExpr),
      );
    }
  };
  walkAstAggregates(ast.having, registerHiddenAggregate);
  walkAstAggregates(ast.orderBy, registerHiddenAggregate);
  if (rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
    for (const [key, value] of Object.entries(rows[0])) {
      defineHiddenRowProperty(result, key, value);
    }
  }
}

function resolveGroupByItemValue(row, groupItem, colName) {
  if (groupItem && typeof groupItem === 'object') {
    const expr = groupItem.expression ? groupItem.expression : groupItem;
    if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) {
      return resolveRowColumnRef(row, expr);
    }
  }
  return row[colName];
}

function collectAggregateValues(rows, arg, distinct) {
  const colName = arg?.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF ? arg.column : null;
  if (!colName) {
    return rows;
  }
  const qualifiedCol = arg.table ? `${arg.table}.${colName}` : null;
  const values = rows
    .map((row) =>
      qualifiedCol && Object.prototype.hasOwnProperty.call(row, qualifiedCol) ?
        row[qualifiedCol] :
        row[colName],
    )
    .filter((value) => value !== null && value !== undefined);
  return distinct ? [...new Set(values)] : values;
}

function reduceNumericAggregate(func, values) {
  if (func === QUERY_EXECUTOR_LITERAL.STRING_SUM) {
    return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  }
  if (values.length === 0) {
    return null;
  }
  if (func === QUERY_EXECUTOR_LITERAL.STRING_AVG) {
    const avgSum = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    return avgSum / values.length;
  }
  if (func === QUERY_EXECUTOR_LITERAL.STRING_MIN) {
    return values.reduce((min, value) => (value < min ? value : min), values[0]);
  }
  if (func === QUERY_EXECUTOR_LITERAL.STRING_MAX) {
    return values.reduce((max, value) => (value > max ? value : max), values[0]);
  }
  return null;
}

function resolveRowColumnRef(row, expr) {
  if (
    expr.table &&
    Object.prototype.hasOwnProperty.call(row, `${expr.table}.${expr.column}`)
  ) {
    return row[`${expr.table}.${expr.column}`];
  }
  return row[expr.column];
}
// Compare one ORDER BY clause's values. Returns 0 whenever the original inline
// comparator would have fallen through to the next clause: equal values, and
// unequal values that answer neither < nor > (e.g. mixed types).
function compareOrderByClauseValues(aVal, bVal, dir) {
  if (aVal === bVal) {
    return 0;
  }
  if (aVal === null) {
    return dir;
  }
  if (bVal === null) {
    return -dir;
  }
  if (
    typeof aVal === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
    typeof bVal === QUERY_EXECUTOR_LITERAL.STRING_STRING
  ) {
    return aVal.localeCompare(bVal) * dir;
  }
  if (aVal < bVal) {
    return -dir;
  }
  if (aVal > bVal) {
    return dir;
  }
  return 0;
}

const queryExecutorSelectAggregationMethods = {
  /**
   * Aggregate SELECT results from multiple partitions.
   * Properly handles cross-partition aggregation for COUNT, SUM, AVG, MIN, MAX.
   * Requirements: 22.3, 22.6, 22.7
   * @param {Array} results - Partition results.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Aggregated result.
   * @private
   */
  aggregateSelectResults(results, ast, params) {
    // Combine rows from all partitions
    let rows = [];
    for (const result of results) {
      if (result.success && result.rows) {
        rows = rows.concat(result.rows);
      }
    }

    // Handle DISTINCT
    if (ast.distinct) {
      rows = this.applyDistinct(rows);
    }

    // Handle GROUP BY with aggregates
    if (ast.groupBy) {
      rows = this.applyGroupBy(rows, ast);
    } else if (this.hasAggregates(ast)) {
      // Aggregates without GROUP BY - aggregate across all partitions
      rows = this.applyAggregates(rows, ast);
    }

    // Handle HAVING
    if (ast.having) {
      rows = this.applyHaving(rows, ast.having, params);
    }

    // Handle ORDER BY
    if (ast.orderBy) {
      rows = this.applyOrderBy(rows, ast.orderBy);
    }

    // Handle LIMIT/OFFSET
    if (ast.limit) {
      rows = this.applyLimit(rows, ast.limit);
    }
    return {
      rows,
    };
  },

  /**
   * Aggregate results from multiple partitions for cross-partition queries.
   * This method handles partial aggregates that need to be combined.
   * Requirements: 22.3, 22.7
   * @param {Array} partitionResults - Results from each partition.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} [params] - Bound query parameters.
   * @return {Object} Combined aggregated result.
   */
  aggregateCrossPartitionResults(partitionResults, ast, params) {
    // For queries with aggregates, we need to combine partial results
    if (!this.hasAggregates(ast)) {
      return this.aggregateSelectResults(partitionResults, ast, params);
    }

    // Collect all rows first
    let allRows = [];
    for (const result of partitionResults) {
      if (result.success && result.rows) {
        allRows = allRows.concat(result.rows);
      }
    }

    // Re-compute aggregates on combined data
    let rows = ast.groupBy ?
      this.applyGroupBy(allRows, ast) :
      this.applyAggregates(allRows, ast);
    if (ast.having) {
      rows = this.applyHaving(rows, ast.having, params);
    }
    return {rows};
  },

  /**
   * Apply DISTINCT to rows.
   * @param {Array} rows - Input rows.
   * @return {Array} Distinct rows.
   * @private
   */
  applyDistinct(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },

  /**
   * Check if AST has aggregate functions.
   * @param {Object} ast - SELECT AST.
   * @return {boolean} True if has aggregates.
   * @private
   */
  hasAggregates(ast) {
    return ast.columns.some(
      (col) =>
        col.expression?.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE ||
        col.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE,
    );
  },

  /**
   * Apply GROUP BY to rows.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Grouped rows.
   * @private
   */
  applyGroupBy(rows, ast) {
    const groups = new Map();
    const groupByColumns = ast.groupBy.map(
      (g) => g.column || g.expression?.column || g,
    );

    // Group rows
    for (const row of rows) {
      const key = groupByColumns
        .map((col, idx) => resolveGroupByItemValue(row, ast.groupBy[idx], col))
        .join(GROUP_KEY_DELIMITER);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    }

    // Apply aggregates to each group
    const result = [];
    for (const groupRows of groups.values()) {
      const aggregatedRow = this.computeGroupAggregates(groupRows, ast);
      result.push(aggregatedRow);
    }
    return result;
  },

  /**
   * Compute aggregates for a group of rows.
   * @param {Array} rows - Group rows.
   * @param {Object} ast - SELECT AST.
   * @return {Object} Aggregated row.
   * @private
   */
  computeGroupAggregates(rows, ast) {
    const result = {};
    if (ast.groupBy && rows.length > 0) {
      const firstRow = rows[0];
      for (const g of ast.groupBy) {
        const col = g.column || g.expression?.column || g;
        const value = resolveGroupByItemValue(firstRow, g, col);
        result[col] = value;
        const groupExpr = g && typeof g === 'object' ?
          (g.expression ? g.expression : g) :
          null;
        if (groupExpr?.table) {
          defineHiddenRowProperty(result, `${groupExpr.table}.${col}`, value);
        }
      }
    }
    for (const col of ast.columns) {
      applyGroupColumnAggregate(this, result, rows, col);
    }
    attachClauseAggregatesAndHiddenRowKeys(this, result, rows, ast);
    return result;
  },

  /**
   * Get argument name for aggregate function.
   * @param {Object} expr - Aggregate expression.
   * @return {string} Argument name.
   * @private
   */
  getArgName(expr) {
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR) {
      return QUERY_EXECUTOR_LITERAL.STRING_VALUE_3;
    }
    if (expr.argument?.type === QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF) {
      return expr.argument.column;
    }
    return QUERY_EXECUTOR_LITERAL.STRING_VALUE_4;
  },

  /**
   * Apply aggregates without GROUP BY.
   * @param {Array} rows - Input rows.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Single aggregated row.
   * @private
   */
  applyAggregates(rows, ast) {
    const result = {};
    for (const col of ast.columns) {
      const expr = col.expression || col;
      if (expr.type === QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE) {
        const canonicalKey = `${expr.function}(${this.getArgName(expr)})`;
        const alias = col.alias || canonicalKey;
        const value = this.computeAggregate(rows, expr);
        result[alias] = value;
        defineHiddenRowProperty(result, canonicalKey, value);
      }
    }
    attachClauseAggregatesAndHiddenRowKeys(this, result, rows, ast);
    return [result];
  },

  /**
   * Compute a single aggregate value across all rows.
   * Supports COUNT, SUM, AVG, MIN, MAX for cross-partition aggregation.
   * Requirements: 22.7
   * @param {Array} rows - Input rows.
   * @param {Object} expr - Aggregate expression.
   * @return {*} Aggregate value.
   * @private
   */
  computeAggregate(rows, expr) {
    const func = expr.function.toUpperCase();
    const arg = expr.argument;
    const values = collectAggregateValues(rows, arg, expr.distinct);
    if (func === QUERY_EXECUTOR_LITERAL.STRING_COUNT) {
      return arg?.type === QUERY_EXECUTOR_LITERAL.STRING_STAR ?
        rows.length :
        values.length;
    }
    return reduceNumericAggregate(func, values);
  },

  assertQueryParametersBound(ast, params) {
    assertAstParametersBound(ast, params);
  },

  applyHaving(rows, having, params) {
    assertAstParametersBound(having, params);
    return rows.filter((row) =>
      Boolean(this.evaluateExpression(row, having, params)),
    );
  },

  evaluateExpression(row, expr, params) {
    if (!expr) return true;
    if (Array.isArray(expr)) {
      return expr.map((entry) => this.evaluateExpression(row, entry, params));
    }
    switch (expr.type) {
    case QUERY_EXECUTOR_LITERAL.STRING_BINARY:
      return this.evaluateBinary(row, expr, params);
    case QUERY_EXECUTOR_LITERAL.STRING_UNARY:
      return this.evaluateUnary(row, expr, params);
    case QUERY_EXECUTOR_LITERAL.STRING_IN:
      return this.evaluateIn(row, expr, params);
    case QUERY_EXECUTOR_LITERAL.STRING_BETWEEN:
      return this.evaluateBetween(row, expr, params);
    case QUERY_EXECUTOR_LITERAL.STRING_LIKE:
      return this.evaluateLike(row, expr, params);
    case EXPR_NODE_TYPE.CASE:
      return this.evaluateCase(row, expr, params);
    case EXPR_NODE_TYPE.CAST:
      return this.evaluateCast(row, expr, params);
    case EXPR_NODE_TYPE.FUNCTION_CALL:
    case EXPR_NODE_TYPE.FUNCTION:
      return this.evaluateFunctionCall(row, expr, params);
    case QUERY_EXECUTOR_LITERAL.STRING_LITERAL:
      return expr.value;
    case QUERY_EXECUTOR_LITERAL.STRING_PARAMETER:
      return resolveBoundParameterValue(expr, params);
    case QUERY_EXECUTOR_LITERAL.STRING_COLUMN_REF:
      return resolveRowColumnRef(row, expr);
    case QUERY_EXECUTOR_LITERAL.STRING_AGGREGATE:
      return row[`${expr.function}(${this.getArgName(expr)})`];
    default:
      return true;
    }
  },

  evaluateCase(row, expr, params) {
    const hasOperand = Boolean(expr.operand);
    const operandVal = hasOperand ?
      this.evaluateExpression(row, expr.operand, params) : null;
    for (const cond of expr.conditions || []) {
      const whenVal = this.evaluateExpression(row, cond.when, params);
      const matched = hasOperand ?
        areSqlScalarsEqualWithAffinity(operandVal, whenVal, expr.operand, cond.when) :
        Boolean(whenVal);
      if (matched) {
        return this.evaluateExpression(row, cond.thenExpression, params);
      }
    }
    return expr.elseExpr ?
      this.evaluateExpression(row, expr.elseExpr, params) : null;
  },

  evaluateCast(row, expr, params) {
    const sourceNode = expr.expression ? expr.expression :
      (expr.expr ? expr.expr : expr.operand);
    const inner = this.evaluateExpression(row, sourceNode, params);
    if (inner === null || inner === undefined) return null;
    return applySqlComparisonAffinity(inner, resolveOperandComparisonAffinity(expr));
  },

  evaluateFunctionCall(row, expr, params) {
    const fnName = String(expr.name || '').toUpperCase();
    const args = (expr.args || []).map((arg) =>
      this.evaluateExpression(row, arg, params),
    );
    const a0 = args[0];
    const a0Null = a0 === null || a0 === undefined;
    switch (fnName) {
    case SCALAR_FN.COALESCE:
    case SCALAR_FN.IFNULL: {
      const found = args.find((val) => val !== null && val !== undefined);
      return found === undefined ? null : found;
    }
    case SCALAR_FN.NULLIF:
      return a0Null || areSqlScalarsEqualWithAffinity(a0, args[1]) ? null : a0;
    case SCALAR_FN.IIF:
      return a0 ? (args[1] === undefined ? null : args[1]) :
        (args[2] === undefined ? null : args[2]);
    case SCALAR_FN.ABS:
      return a0Null ? null : Math.abs(Number(a0));
    case SCALAR_FN.LOWER:
      return a0Null ? null : String(a0).toLowerCase();
    case SCALAR_FN.UPPER:
      return a0Null ? null : String(a0).toUpperCase();
    case SCALAR_FN.TRIM:
      return a0Null ? null : String(a0).trim();
    case SCALAR_FN.LENGTH:
      return a0Null ? null : String(a0).length;
    case SCALAR_FN.SUBSTR:
    case SCALAR_FN.SUBSTRING: {
      if (a0Null || args[1] === null || args[1] === undefined) return null;
      const text = String(a0);
      const start = Math.trunc(Number(args[1]));
      const zeroStart = start > 0 ? start - 1 :
        (start < 0 ? Math.max(text.length + start, 0) : 0);
      if (args.length < SUBSTR_WITH_LENGTH_ARG_COUNT) return text.slice(zeroStart);
      if (args[2] === null || args[2] === undefined) return null;
      const len = Math.max(Math.trunc(Number(args[2])), 0);
      return text.slice(zeroStart, zeroStart + len);
    }
    case SCALAR_FN.ROUND: {
      if (a0Null) return null;
      const digits = args[1] === undefined || args[1] === null ?
        0 : Math.trunc(Number(args[1]));
      const factor = DECIMAL_BASE ** digits;
      return Math.round(Number(a0) * factor) / factor;
    }
    default:
      return null;
    }
  },

  evaluateBinary(row, expr, params) {
    const left = this.evaluateExpression(row, expr.left, params);
    if (expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NULL) {
      return left === null || left === undefined;
    }
    if (expr.operator === QUERY_EXECUTOR_LITERAL.STRING_IS_NOT_NULL) {
      return left !== null && left !== undefined;
    }
    const right = this.evaluateExpression(row, expr.right, params);
    switch (expr.operator) {
    case QUERY_EXECUTOR_LITERAL.STRING_AND:
      return Boolean(left) && Boolean(right);
    case QUERY_EXECUTOR_LITERAL.STRING_OR:
      return Boolean(left) || Boolean(right);
    default: {
      const arithmetic = evaluateBinaryArithmetic(expr.operator, left, right);
      if (arithmetic.handled) return arithmetic.value;
      return evaluateScalarComparisonOperator(
        expr.operator, left, right, expr.left, expr.right,
      );
    }
    }
  },

  evaluateUnary(row, expr, params) {
    const operand = this.evaluateExpression(row, expr.operand, params);
    if (operand === null || operand === undefined) return null;
    switch (expr.operator) {
    case QUERY_EXECUTOR_LITERAL.STRING_NOT:
      return !operand;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_12:
      return +operand;
    case QUERY_EXECUTOR_LITERAL.STRING_VALUE_13:
      return -operand;
    default:
      return operand;
    }
  },

  evaluateIn(row, expr, params) {
    const value = this.evaluateExpression(row, expr.expression, params);
    const candidateValues = (expr.values || []).map((v) =>
      this.evaluateExpression(row, v, params),
    );
    if (value === null || value === undefined) return false;
    const exprAffinity = resolveOperandComparisonAffinity(expr.expression);
    const matches = candidateValues.some((candidate) =>
      areSqlScalarsEqualWithAffinity(
        value, candidate, exprAffinity, SQL_COMPARISON_AFFINITY.NONE,
      ),
    );
    if (matches) return !expr.negated;
    if (expr.negated &&
        candidateValues.some((candidate) => candidate === null || candidate === undefined)) {
      return false;
    }
    return Boolean(expr.negated);
  },

  evaluateBetween(row, expr, params) {
    const value = this.evaluateExpression(row, expr.expression, params);
    const low = this.evaluateExpression(row, expr.low, params);
    const high = this.evaluateExpression(row, expr.high, params);
    const lowCmp = compareSqlScalarsWithAffinity(value, low, expr.expression, expr.low);
    const highCmp = compareSqlScalarsWithAffinity(value, high, expr.expression, expr.high);
    return lowCmp !== null && lowCmp >= 0 && highCmp !== null && highCmp <= 0;
  },

  evaluateLike(row, expr, params) {
    const value = this.evaluateExpression(row, expr.expression, params);
    const pattern = this.evaluateExpression(row, expr.pattern, params);
    if (value === null || value === undefined ||
        pattern === null || pattern === undefined) {
      return false;
    }
    const regex = this.buildLikeRegex(String(pattern));
    const matches = regex.test(String(value));
    return expr.negated ? !matches : matches;
  },

  buildLikeRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, LIKE_ESCAPE_REPLACEMENT);
    const regexPattern = escaped
      .replace(/%/g, LIKE_ANY_SEQ_PATTERN)
      .replace(/_/g, LIKE_ANY_CHAR_PATTERN);
    return new RegExp(`^${regexPattern}$`);
  },

  applyOrderBy(rows, orderBy) {
    return [...rows].sort((a, b) => {
      for (const clause of orderBy) {
        const col = clause.expression?.column || clause.column;
        const dir = clause.direction === SORT_DIR_DESC ? -1 : 1;
        const comparison = compareOrderByClauseValues(a[col], b[col], dir);
        if (comparison !== 0) {
          return comparison;
        }
      }
      return 0;
    });
  },

  applyLimit(rows, limit) {
    const offset = Number.isInteger(limit.offset) ?
      Math.max(limit.offset, 0) :
      0;
    if (!Number.isInteger(limit.count)) {
      return rows.slice(offset);
    }
    const count = Math.max(limit.count, 0);
    return rows.slice(offset, offset + count);
  },
};

function installQueryExecutorSelectAggregationHelpers(target) {
  for (const [name, value] of Object.entries(
    queryExecutorSelectAggregationMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorSelectAggregationHelpers};
