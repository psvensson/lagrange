import {QUERY_AST_NODE, QUERY_AST_TYPE, QUERY_ERROR_CODE} from '../query-constants.js';

const UNARY_MINUS = '-';
const UNARY_PLUS = '+';
const OP_MULTIPLY = '*';
const OP_DIVIDE = '/';
const OP_CONCAT = '||';
const FN_UPPER = 'UPPER';
const FN_LOWER = 'LOWER';
const FN_TRIM = 'TRIM';
const FN_COALESCE = 'COALESCE';
const SQLITE_CONSTRAINT_UNIQUE_CODE = 'SQLITE_CONSTRAINT_UNIQUE';
const CONSTRAINT_TYPE_UNIQUE = 'UNIQUE';
const ERR_COLUMN_REF_IN_KEY =
  'Column references cannot be used in partition key value';
const FUNCTION_NODE_TYPES = new Set([
  'function',
  'function_call',
  'FUNCTION_CALL',
]);

function throwUnsupportedKeyExpression(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  throw error;
}

function throwUniqueConstraintViolation(tableName, colNames) {
  const label = Array.isArray(colNames) ? colNames.join(', ') : colNames;
  const error = new Error(`UNIQUE constraint failed: ${tableName}.${label}`);
  error.code = SQLITE_CONSTRAINT_UNIQUE_CODE;
  error.errorCode = SQLITE_CONSTRAINT_UNIQUE_CODE;
  throw error;
}

function extractParameterValue(expr, params) {
  if (
    typeof expr.index === 'number' &&
    expr.index >= 0 &&
    expr.index < params.length
  ) {
    return params[expr.index];
  }
  return params[0];
}

function evaluateUnaryKeyValue(coordinator, expr, params) {
  const operand = coordinator.extractKeyValue(expr.operand || expr.expr, params);
  if (expr.operator === UNARY_MINUS) {
    return -Number(operand);
  }
  if (expr.operator === UNARY_PLUS) {
    return Number(operand);
  }
  return operand;
}

function evaluateBinaryKeyValue(coordinator, expr, params) {
  const left = coordinator.extractKeyValue(expr.left, params);
  const right = coordinator.extractKeyValue(expr.right, params);
  switch (expr.operator) {
  case UNARY_PLUS:
    return Number(left) + Number(right);
  case UNARY_MINUS:
    return Number(left) - Number(right);
  case OP_MULTIPLY:
    return Number(left) * Number(right);
  case OP_DIVIDE:
    return Number(left) / Number(right);
  case OP_CONCAT:
    return String(left ?? '') + String(right ?? '');
  default:
    return throwUnsupportedKeyExpression(
      `Unsupported binary operator in key expression: ${expr.operator}`,
    );
  }
}

function evaluateFunctionKeyValue(coordinator, expr, params) {
  const fnName = String(expr.name || '').toUpperCase();
  const rawArgs = expr.args || [];
  const args = (Array.isArray(rawArgs) ? rawArgs : [rawArgs]).map((arg) =>
    coordinator.extractKeyValue(arg, params),
  );
  switch (fnName) {
  case FN_UPPER:
    return String(args[0] ?? '').toUpperCase();
  case FN_LOWER:
    return String(args[0] ?? '').toLowerCase();
  case FN_TRIM:
    return String(args[0] ?? '').trim();
  case FN_COALESCE:
    return args.find((v) => v !== null && v !== undefined) ?? null;
  default:
    return throwUnsupportedKeyExpression(
      `Unsupported function in key expression: ${fnName}`,
    );
  }
}

const UNARY_NODE_TYPES = new Set([QUERY_AST_NODE.UNARY, 'unary_expr']);
const BINARY_NODE_TYPES = new Set([QUERY_AST_NODE.BINARY, 'binary_expr']);
const COLUMN_REF_NODE_TYPES = new Set(['column_ref', QUERY_AST_NODE.COLUMN_REF]);

function extractCoordinatorKeyValue(coordinator, expr, params = []) {
  if (!expr || typeof expr !== 'object') {
    return expr;
  }
  if (expr.type === QUERY_AST_NODE.LITERAL) return expr.value;
  if (expr.type === QUERY_AST_NODE.PARAMETER) {
    return extractParameterValue(expr, params);
  }
  if (UNARY_NODE_TYPES.has(expr.type)) {
    return evaluateUnaryKeyValue(coordinator, expr, params);
  }
  if (BINARY_NODE_TYPES.has(expr.type)) {
    return evaluateBinaryKeyValue(coordinator, expr, params);
  }
  if (FUNCTION_NODE_TYPES.has(expr.type)) {
    return evaluateFunctionKeyValue(coordinator, expr, params);
  }
  if (COLUMN_REF_NODE_TYPES.has(expr.type)) {
    return throwUnsupportedKeyExpression(ERR_COLUMN_REF_IN_KEY);
  }
  return expr.value !== undefined ?
    expr.value :
    throwUnsupportedKeyExpression(
      `Unsupported expression type in key: ${expr.type}`,
    );
}

function resolveCoordinatorTableSchema(coordinator, tableName) {
  const tableInfo =
    coordinator.getTableInfo(tableName) ||
    coordinator.getTableMetadata?.(tableName) ||
    coordinator.systemTableCache?.getTable?.(tableName) ||
    null;
  if (!tableInfo) return null;
  if (typeof tableInfo.schema === 'string') {
    try {
      return JSON.parse(tableInfo.schema);
    } catch {
      return null;
    }
  }
  return tableInfo.schema || (tableInfo.columns ? tableInfo : null);
}

function collectUniqueColumnSets(schema) {
  const sets = [];
  for (const col of schema?.columns || []) {
    if (col.unique === true) {
      sets.push([col.name]);
    }
  }
  for (const tc of schema?.tableConstraints || []) {
    if (
      String(tc.type || '').toUpperCase() === CONSTRAINT_TYPE_UNIQUE &&
      Array.isArray(tc.columns) &&
      tc.columns.length > 0
    ) {
      sets.push(tc.columns);
    }
  }
  return sets;
}

function resolveTablePartitionIds(coordinator, tableName) {
  const partitions = coordinator.getTablePartitions(tableName) || [];
  return partitions
    .map((p) => p.partition_id || p.partitionId || p)
    .filter(Boolean);
}

async function assertUniqueAcrossPartitions(
  coordinator,
  tableName,
  partitionIds,
  colNames,
  candidateValues,
) {
  if (typeof coordinator.queryExecutor?.executeOnPartitions !== 'function') {
    return;
  }
  const whereClause = colNames.map((c) => `"${c}" = ?`).join(' AND ');
  const checkSql = `SELECT 1 FROM "${tableName}" WHERE ${whereClause} LIMIT 1`;
  const results = await coordinator.queryExecutor.executeOnPartitions(
    partitionIds,
    checkSql,
    candidateValues,
  );
  if (results.some((res) => res?.success && Array.isArray(res.rows) && res.rows.length > 0)) {
    throwUniqueConstraintViolation(tableName, colNames);
  }
}

async function checkInsertColumnSetUniqueness(
  coordinator,
  ast,
  params,
  partitionIds,
  colNames,
) {
  const astColumns = ast.columns || [];
  const colIndices = colNames.map((name) =>
    astColumns.findIndex(
      (c) => String(c).toLowerCase() === String(name).toLowerCase(),
    ),
  );
  if (!colIndices.every((idx) => idx >= 0)) {
    return;
  }
  const seenValues = new Set();
  for (const row of ast.values || []) {
    const candidateValues = colIndices.map((idx) =>
      coordinator.extractKeyValue(row[idx], params),
    );
    if (candidateValues.some((v) => v === null || v === undefined)) {
      continue;
    }
    const keyStr = JSON.stringify(candidateValues);
    if (seenValues.has(keyStr)) {
      throwUniqueConstraintViolation(ast.table, colNames);
    }
    seenValues.add(keyStr);
    await assertUniqueAcrossPartitions(
      coordinator,
      ast.table,
      partitionIds,
      colNames,
      candidateValues,
    );
  }
}

async function checkUpdateColumnSetUniqueness(
  coordinator,
  ast,
  params,
  partitionIds,
  colNames,
) {
  if (colNames.length !== 1) return;
  const colName = colNames[0];
  const assignments = ast.assignments || ast.set || [];
  const assign = assignments.find(
    (a) => String(a.column).toLowerCase() === String(colName).toLowerCase(),
  );
  if (!assign) return;
  const candidateVal = coordinator.extractKeyValue(assign.value, params);
  if (candidateVal === null || candidateVal === undefined) return;
  await assertUniqueAcrossPartitions(
    coordinator,
    ast.table,
    partitionIds,
    [colName],
    [candidateVal],
  );
}

async function enforceCoordinatorUniqueConstraints(coordinator, ast, params = []) {
  if (
    !ast?.table ||
    (ast.type !== QUERY_AST_TYPE.INSERT && ast.type !== QUERY_AST_TYPE.UPDATE)
  ) {
    return;
  }
  const schema = resolveCoordinatorTableSchema(coordinator, ast.table);
  const uniqueColumnSets = collectUniqueColumnSets(schema);
  if (uniqueColumnSets.length === 0) return;
  const partitionIds = resolveTablePartitionIds(coordinator, ast.table);
  if (partitionIds.length === 0) return;

  for (const colNames of uniqueColumnSets) {
    if (ast.type === QUERY_AST_TYPE.INSERT) {
      await checkInsertColumnSetUniqueness(
        coordinator,
        ast,
        params,
        partitionIds,
        colNames,
      );
    } else {
      await checkUpdateColumnSetUniqueness(
        coordinator,
        ast,
        params,
        partitionIds,
        colNames,
      );
    }
  }
}

export {
  enforceCoordinatorUniqueConstraints,
  extractCoordinatorKeyValue,
};
