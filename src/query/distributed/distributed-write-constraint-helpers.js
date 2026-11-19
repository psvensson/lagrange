import {EXPR_TYPE, SQL_DEFAULT_COLLATION} from '../parser-constants.js';
import {QUERY_AST_NODE, QUERY_AST_TYPE, QUERY_ERROR_CODE} from '../query-constants.js';
import {renderExpressionWithParameters} from '../sql-statement-renderer.js';
import {renderSqliteIdentifier} from '../sqlite-identifier.js';

const TYPEOF_STRING = 'string';
const UNCONDITIONAL_WHERE_SQL = '1 = 1';
const UPDATE_UNIQUENESS_ORDER_LIMIT_SQL = 'ORDER BY target_match DESC LIMIT 2';
const ERR_UNIQUENESS_PROBE_INCOMPLETE =
  'Cross-partition uniqueness observation failed or was incomplete';

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
// Interim I1c (removed by WP4, design §5.1): the coordinator evaluates a
// write-key expression in JavaScript, which cannot apply a collation.
const ERR_COLLATE_IN_KEY =
  'COLLATE in a partition key value is not supported yet (interim I1c, until WP4)';
const ERR_NON_BINARY_UNIQUE_BATCH =
  'Multi-row INSERT on a UNIQUE column with non-BINARY collation is not supported yet ' +
  '(interim I1c, until WP4)';
const COLUMN_LIST_SEPARATOR = ', ';
const WHERE_AND_SEPARATOR = ' AND ';
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
  const label = Array.isArray(colNames) ? colNames.join(COLUMN_LIST_SEPARATOR) : colNames;
  const error = new Error(`UNIQUE constraint failed: ${tableName}.${label}`);
  error.code = SQLITE_CONSTRAINT_UNIQUE_CODE;
  error.errorCode = SQLITE_CONSTRAINT_UNIQUE_CODE;
  throw error;
}

const ERR_UNBOUND_PARAMETER_PREFIX = 'Unbound parameter index: ';

function extractParameterValue(expr, params) {
  const index = typeof expr.index === 'number' ? expr.index : 0;
  if (
    !Array.isArray(params) ||
    index < 0 ||
    index >= params.length ||
    params[index] === undefined
  ) {
    const error = new Error(`${ERR_UNBOUND_PARAMETER_PREFIX}${index}`);
    error.code = QUERY_ERROR_CODE.SYNTAX_ERROR;
    error.errorCode = QUERY_ERROR_CODE.SYNTAX_ERROR;
    throw error;
  }
  return params[index];
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
  if (expr.type === EXPR_TYPE.COLLATE) {
    return throwUnsupportedKeyExpression(ERR_COLLATE_IN_KEY);
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
  if (typeof tableInfo.schema_definition === TYPEOF_STRING) {
    return JSON.parse(tableInfo.schema_definition);
  }
  if (typeof tableInfo.schema === TYPEOF_STRING) {
    return JSON.parse(tableInfo.schema);
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

function assertCompletePartitionProbeResults(results, partitionIds) {
  if (Array.isArray(results) &&
      results.length === partitionIds.length &&
      results.every((res) => res?.success === true && Array.isArray(res.rows))) {
    return;
  }
  const failed = Array.isArray(results) ?
    results.find((res) => res?.success !== true || !Array.isArray(res?.rows)) :
    null;
  const message = typeof failed?.error === TYPEOF_STRING && failed.error.length > 0 ?
    failed.error :
    ERR_UNIQUENESS_PROBE_INCOMPLETE;
  const code = typeof failed?.errorCode === TYPEOF_STRING && failed.errorCode.length > 0 ?
    failed.errorCode :
    QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE;
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  throw error;
}

async function assertUniqueAcrossPartitions(
  coordinator,
  tableName,
  partitionIds,
  colNames,
  candidateValues,
) {
  const executor = coordinator.queryExecutor;
  if (!executor) {
    return;
  }
  const whereClause = colNames.map((c) => `"${c}" = ?`).join(WHERE_AND_SEPARATOR);
  const checkSql = `SELECT 1 FROM "${tableName}" WHERE ${whereClause} LIMIT 1`;
  const results = await executor.executeOnPartitions(
    partitionIds,
    checkSql,
    candidateValues,
  );
  if (Array.isArray(results) &&
      results.some((res) =>
        res?.success === true && Array.isArray(res.rows) && res.rows.length > 0)) {
    throwUniqueConstraintViolation(tableName, colNames);
  }
  assertCompletePartitionProbeResults(results, partitionIds);
}

function columnSetHoldsNonBinaryCollation(schema, colNames) {
  if (!Array.isArray(schema?.columns)) return false;
  const targets = new Set(colNames.map((name) => String(name).toLowerCase()));
  return schema.columns.some((col) =>
    typeof col?.name === TYPEOF_STRING &&
    targets.has(col.name.toLowerCase()) &&
    typeof col.collation === TYPEOF_STRING &&
    col.collation.toUpperCase() !== SQL_DEFAULT_COLLATION,
  );
}

function resolveInsertColumnNames(ast, schema) {
  if (Array.isArray(ast.columns) && ast.columns.length > 0) {
    return ast.columns;
  }
  return Array.isArray(schema?.columns) ? schema.columns.map((col) => col.name) : [];
}

async function checkInsertColumnSetUniqueness(
  coordinator,
  ast,
  params,
  partitionIds,
  colNames,
  schema,
) {
  const astColumns = resolveInsertColumnNames(ast, schema);
  const colIndices = colNames.map((name) =>
    astColumns.findIndex(
      (c) => String(c).toLowerCase() === String(name).toLowerCase(),
    ),
  );
  if (!colIndices.every((idx) => idx >= 0)) {
    return;
  }
  if (Array.isArray(ast.values) && ast.values.length > 1 &&
      columnSetHoldsNonBinaryCollation(schema, colNames)) {
    throwUnsupportedKeyExpression(ERR_NON_BINARY_UNIQUE_BATCH);
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

function tallyUpdateUniquenessProbeRows(results) {
  let matchedTargetCount = 0;
  let externalOwnerCount = 0;
  for (const res of results) {
    for (const row of res.rows) {
      if (Number(row?.target_match) === 1) {
        matchedTargetCount += 1;
      } else if (Number(row?.value_match) === 1) {
        externalOwnerCount += 1;
      }
    }
  }
  return {matchedTargetCount, externalOwnerCount};
}

function renderTargetPredicate(whereExpr, params) {
  if (!whereExpr) {
    return {sql: UNCONDITIONAL_WHERE_SQL, params: []};
  }
  return renderExpressionWithParameters(
    whereExpr,
    (paramExpr) => extractParameterValue(paramExpr, params),
  );
}

async function assertUpdateUniqueAcrossPartitions(
  coordinator,
  ast,
  params,
  partitionIds,
  colNames,
  candidateValues,
) {
  const executor = coordinator.queryExecutor;
  if (!executor) {
    return;
  }
  const valueClause = colNames
    .map((c) => `${renderSqliteIdentifier(c)} = ?`)
    .join(WHERE_AND_SEPARATOR);
  const {sql: targetClause, params: targetParams} =
    renderTargetPredicate(ast.where, params);
  const checkSql =
    `SELECT CASE WHEN (${targetClause}) THEN 1 ELSE 0 END AS target_match, ` +
    `CASE WHEN (${valueClause}) THEN 1 ELSE 0 END AS value_match ` +
    `FROM ${renderSqliteIdentifier(ast.table)} ` +
    `WHERE (${targetClause}) OR (${valueClause}) ` +
    UPDATE_UNIQUENESS_ORDER_LIMIT_SQL;
  const checkParams = [
    ...targetParams,
    ...candidateValues,
    ...targetParams,
    ...candidateValues,
  ];
  const results = await executor.executeOnPartitions(
    partitionIds,
    checkSql,
    checkParams,
  );
  assertCompletePartitionProbeResults(results, partitionIds);
  const {matchedTargetCount, externalOwnerCount} =
    tallyUpdateUniquenessProbeRows(results);
  if (matchedTargetCount > 1 ||
      (matchedTargetCount === 1 && externalOwnerCount > 0)) {
    throwUniqueConstraintViolation(ast.table, colNames);
  }
}

async function checkUpdateColumnSetUniqueness(
  coordinator,
  ast,
  params,
  partitionIds,
  colNames,
) {
  const assignments = ast.assignments || ast.set || [];
  const assigned = colNames.map((colName) =>
    assignments.find(
      (a) => String(a.column).toLowerCase() === String(colName).toLowerCase(),
    ),
  );
  if (!assigned.every(Boolean)) return;
  const candidateValues = assigned.map((a) =>
    coordinator.extractKeyValue(a.value, params),
  );
  if (candidateValues.some((v) => v === null || v === undefined)) return;
  await assertUpdateUniqueAcrossPartitions(
    coordinator,
    ast,
    params,
    partitionIds,
    colNames,
    candidateValues,
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
        schema,
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
