/**
 * Coordinator write-key evaluation and cross-partition UNIQUE constraint
 * helpers backed by in-memory SQLite and the canonical table-definition owner
 * (design coordinator-sqlite-merge §2.10, WP4).
 *
 * - Evaluates write-key expressions in an in-memory SQLite connection and
 *   applies the target column's declared affinity via `renderTableColumnsSql`.
 * - Enforces multi-row INSERT batch uniqueness by inserting candidate rows into
 *   an in-memory SQLite table declared with the table's exact column types,
 *   collations (`BINARY`, `NOCASE`, `RTRIM`), and `UNIQUE` constraints via
 *   `renderTableDefinitionSql`.
 *
 * @module query/distributed/distributed-write-constraint-helpers
 */

import Database from 'better-sqlite3';

import {
  lexPartitionStatement,
} from '../../partition/partition-statement-admission-lexer.js';
import {
  namesRefusedFunction,
  resolveNamePositions,
} from '../../partition/partition-statement-admission-names.js';
import {EXPR_TYPE} from '../parser-constants.js';
import {PG_EXPR_TYPE} from '../pg/pg-compat-constants.js';
import {QUERY_AST_NODE, QUERY_AST_TYPE, QUERY_ERROR_CODE} from '../query-constants.js';
import {renderExpressionWithParameters} from '../sql-statement-renderer.js';
import {
  renderTableColumnsSql,
  renderTableDefinitionSql,
} from '../sql-table-definition.js';
import {decodeTypedParams, encodeTypedParams} from '../sql-value-codec.js';
import {renderSqliteIdentifier} from '../sqlite-identifier.js';

const MEMORY_DATABASE = ':memory:';
const PROBE_TABLE_NAME = '__write_key_probe';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const UNCONDITIONAL_WHERE_SQL = '1 = 1';
const UPDATE_UNIQUENESS_ORDER_LIMIT_SQL = 'ORDER BY target_match DESC LIMIT 2';
const ERR_UNIQUENESS_PROBE_INCOMPLETE =
  'Cross-partition uniqueness observation failed or was incomplete';

const SQLITE_CONSTRAINT_UNIQUE_CODE = 'SQLITE_CONSTRAINT_UNIQUE';
const SQLITE_ERROR_CODE = 'SQLITE_ERROR';
const CONSTRAINT_TYPE_UNIQUE = 'UNIQUE';
const UNIQUE_FAILED_PREFIX = 'UNIQUE constraint failed: ';
const ERR_COLUMN_REF_IN_KEY =
  'Column references cannot be used in partition key value';
const ERR_SUBQUERY_OR_AGGREGATE_IN_KEY =
  'Subqueries and aggregates cannot be used in partition key value';
const ERR_UNBOUND_PARAMETER_PREFIX = 'Unbound parameter index: ';
const COLUMN_LIST_SEPARATOR = ', ';
const WHERE_AND_SEPARATOR = ' AND ';

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const COLUMN_REF_NODE_TYPES = new Set([
  'column_ref',
  QUERY_AST_NODE.COLUMN_REF,
  EXPR_TYPE.COLUMN_REF,
]);

const DISALLOWED_KEY_NODE_TYPES = new Set([
  EXPR_TYPE.AGGREGATE,
  'aggr_func',
  'aggregate',
  PG_EXPR_TYPE.SUBQUERY,
  PG_EXPR_TYPE.EXISTS,
]);

function throwUnsupportedKeyExpression(message) {
  const error = new Error(message);
  error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  error.errorCode = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  throw error;
}

function throwUniqueConstraintViolation(tableName, colNames) {
  const label = Array.isArray(colNames) ?
    colNames.join(COLUMN_LIST_SEPARATOR) :
    colNames;
  const error = new Error(`${UNIQUE_FAILED_PREFIX}${tableName}.${label}`);
  error.code = SQLITE_CONSTRAINT_UNIQUE_CODE;
  error.errorCode = SQLITE_CONSTRAINT_UNIQUE_CODE;
  throw error;
}

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

function assertAdmissibleKeyExpressionAst(node) {
  if (!node || typeof node !== TYPEOF_OBJECT || node instanceof Uint8Array) {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      assertAdmissibleKeyExpressionAst(child);
    }
    return;
  }
  if (COLUMN_REF_NODE_TYPES.has(node.type)) {
    throwUnsupportedKeyExpression(ERR_COLUMN_REF_IN_KEY);
  }
  if (
    DISALLOWED_KEY_NODE_TYPES.has(node.type) ||
    (node.type === EXPR_TYPE.IN && Boolean(node.subquery))
  ) {
    throwUnsupportedKeyExpression(ERR_SUBQUERY_OR_AGGREGATE_IN_KEY);
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === TYPEOF_OBJECT) {
      assertAdmissibleKeyExpressionAst(value);
    }
  }
}

function normalizeKeyCellValue(value) {
  if (value === undefined) {
    return null;
  }
  if (
    typeof value === 'bigint' &&
    value >= MIN_SAFE_BIGINT &&
    value <= MAX_SAFE_BIGINT
  ) {
    return Number(value);
  }
  return value;
}

const CONNECTION_SCOPED_FUNCTIONS = new Set([
  'changes',
  'last_insert_rowid',
  'total_changes',
]);
const OPEN_PAREN_TOKEN = '(';
const ERR_REFUSED_KEY_FUNCTION =
  'Refused or connection-scoped function in write key expression';

function assertWriteKeySelectAdmitted(selectSql) {
  const lexed = resolveNamePositions(lexPartitionStatement(selectSql));
  if (namesRefusedFunction(lexed)) {
    throwUnsupportedKeyExpression(ERR_REFUSED_KEY_FUNCTION);
  }
  const {tokens} = lexed;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token.identifier !== null &&
      CONNECTION_SCOPED_FUNCTIONS.has(token.identifier) &&
      next?.text === OPEN_PAREN_TOKEN
    ) {
      throwUnsupportedKeyExpression(ERR_REFUSED_KEY_FUNCTION);
    }
  }
}

function renderKeyExpressionBatch(exprs, params) {
  const sqlList = [];
  const boundParams = [];
  for (const expr of exprs) {
    assertAdmissibleKeyExpressionAst(expr);
    const rendered = renderExpressionWithParameters(
      expr,
      (paramExpr) => extractParameterValue(paramExpr, params),
    );
    sqlList.push(rendered.sql);
    boundParams.push(...rendered.params);
  }
  const selectSql = `SELECT ${sqlList.join(COLUMN_LIST_SEPARATOR)}`;
  assertWriteKeySelectAdmitted(selectSql);
  const typedParams = decodeTypedParams(encodeTypedParams(boundParams));
  return {sqlList, selectSql, typedParams};
}

function mapSqliteKeyEvaluationError(error) {
  if (
    error &&
    typeof error === TYPEOF_OBJECT &&
    (!error.code || error.code === SQLITE_ERROR_CODE)
  ) {
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    error.errorCode = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  }
  return error;
}

function hasColumnAffinityOrCollation(columnSchemas) {
  return (
    Array.isArray(columnSchemas) &&
    columnSchemas.length > 0 &&
    columnSchemas.some(
      (col) =>
        (typeof col?.type === TYPEOF_STRING && col.type.length > 0) ||
        (typeof col?.collation === TYPEOF_STRING && col.collation.length > 0),
    )
  );
}

/**
 * Evaluate one or more write-key expressions in an in-memory SQLite session and
 * apply the target columns' declared storage affinities when schema metadata is
 * present.
 * @param {Array<Object>} exprs - Expression AST nodes.
 * @param {Array<*>} [params] - Bound parameters.
 * @param {Array<Object>|null} [columnSchemas] - Target column definitions.
 * @return {Array<*>} Normalized key values.
 */
function evaluateRawExpressionsInSqlite(exprs, params = [], columnSchemas = null) {
  const {sqlList, selectSql, typedParams} = renderKeyExpressionBatch(exprs, params);
  const db = new Database(MEMORY_DATABASE);
  try {
    db.defaultSafeIntegers(true);
    if (
      hasColumnAffinityOrCollation(columnSchemas) &&
      columnSchemas.length === exprs.length
    ) {
      const probeColumns = columnSchemas.map((col, idx) => ({
        name: col?.name || `c${idx}`,
        ...(typeof col?.type === TYPEOF_STRING && col.type.length > 0 ?
          {type: col.type} :
          {}),
        ...(typeof col?.collation === TYPEOF_STRING && col.collation.length > 0 ?
          {collation: col.collation} :
          {}),
      }));
      db.exec(renderTableColumnsSql(PROBE_TABLE_NAME, {columns: probeColumns}));
      const quotedTable = renderSqliteIdentifier(PROBE_TABLE_NAME);
      const quotedCols = probeColumns
        .map((col) => renderSqliteIdentifier(col.name))
        .join(COLUMN_LIST_SEPARATOR);
      db.prepare(
        `INSERT INTO ${quotedTable} (${quotedCols}) ` +
        `SELECT ${sqlList.join(COLUMN_LIST_SEPARATOR)}`,
      ).run(...typedParams);
      const storedRow = db
        .prepare(`SELECT ${quotedCols} FROM ${quotedTable}`)
        .raw(true)
        .safeIntegers(true)
        .get();
      return storedRow.map((val) => (val === undefined ? null : val));
    }
    const rawRow = db
      .prepare(selectSql)
      .raw(true)
      .safeIntegers(true)
      .get(...typedParams);
    return rawRow.map((val) => (val === undefined ? null : val));
  } catch (error) {
    throw mapSqliteKeyEvaluationError(error);
  } finally {
    db.close();
  }
}

function evaluateKeyExpressionsInSqlite(exprs, params = [], columnSchemas = null) {
  return evaluateRawExpressionsInSqlite(exprs, params, columnSchemas)
    .map(normalizeKeyCellValue);
}

function extractCoordinatorKeyValue(
  _coordinator,
  expr,
  params = [],
  columnSchema = null,
) {
  if (!expr || typeof expr !== TYPEOF_OBJECT) {
    return expr;
  }
  const schemas = columnSchema ? [columnSchema] : null;
  return evaluateKeyExpressionsInSqlite([expr], params, schemas)[0];
}

function readCoordinatorTableInfo(coordinator, tableName) {
  return (
    coordinator.getTableInfo?.(tableName) ||
    coordinator.getTableMetadata?.(tableName) ||
    coordinator.systemTableCache?.getTable?.(tableName) ||
    null
  );
}

function resolveCoordinatorTableSchema(coordinator, tableName) {
  const tableInfo = readCoordinatorTableInfo(coordinator, tableName);
  if (!tableInfo) return null;
  if (typeof tableInfo.schema_definition === TYPEOF_STRING) {
    return JSON.parse(tableInfo.schema_definition);
  }
  if (typeof tableInfo.schema === TYPEOF_STRING) {
    return JSON.parse(tableInfo.schema);
  }
  return tableInfo.schema || (tableInfo.columns ? tableInfo : null);
}

function resolveSchemaColumnDefinition(schema, columnName) {
  const target = String(columnName ?? '').toLowerCase();
  const match = Array.isArray(schema?.columns) ?
    schema.columns.find(
      (col) =>
        typeof col?.name === TYPEOF_STRING &&
        col.name.toLowerCase() === target,
    ) :
    null;
  if (!match) {
    return {name: String(columnName)};
  }
  return {
    name: match.name,
    ...(typeof match.type === TYPEOF_STRING && match.type.length > 0 ?
      {type: match.type} :
      {}),
    ...(typeof match.collation === TYPEOF_STRING && match.collation.length > 0 ?
      {collation: match.collation} :
      {}),
  };
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
  if (
    Array.isArray(results) &&
    results.length === partitionIds.length &&
    results.every((res) => res?.success === true && Array.isArray(res.rows))
  ) {
    return;
  }
  const failed = Array.isArray(results) ?
    results.find((res) => res?.success !== true || !Array.isArray(res?.rows)) :
    null;
  const message =
    typeof failed?.error === TYPEOF_STRING && failed.error.length > 0 ?
      failed.error :
      ERR_UNIQUENESS_PROBE_INCOMPLETE;
  const code =
    typeof failed?.errorCode === TYPEOF_STRING && failed.errorCode.length > 0 ?
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
  const whereClause = colNames
    .map((c) => `${renderSqliteIdentifier(c)} = ?`)
    .join(WHERE_AND_SEPARATOR);
  const checkSql =
    `SELECT 1 FROM ${renderSqliteIdentifier(tableName)} ` +
    `WHERE ${whereClause} LIMIT 1`;
  const results = await executor.executeOnPartitions(
    partitionIds,
    checkSql,
    candidateValues,
    undefined,
    true,
  );
  if (
    Array.isArray(results) &&
    results.some(
      (res) =>
        res?.success === true &&
        Array.isArray(res.rows) &&
        res.rows.length > 0,
    )
  ) {
    throwUniqueConstraintViolation(tableName, colNames);
  }
  assertCompletePartitionProbeResults(results, partitionIds);
}

function resolveInsertColumnNames(ast, schema) {
  if (Array.isArray(ast.columns) && ast.columns.length > 0) {
    return ast.columns;
  }
  return Array.isArray(schema?.columns) ?
    schema.columns.map((col) => col.name) :
    [];
}

function isUniqueConstraintError(error) {
  return (
    error?.code === SQLITE_CONSTRAINT_UNIQUE_CODE ||
    String(error?.message || '').includes(UNIQUE_FAILED_PREFIX)
  );
}

function insertBatchCandidateIntoProbeTable(
  db,
  tableName,
  colNames,
  quotedTable,
  quotedCols,
  selectByRowidStmt,
  rowExprs,
  params,
) {
  const {sqlList, typedParams} = renderKeyExpressionBatch(rowExprs, params);
  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO ${quotedTable} (${quotedCols}) ` +
        `SELECT ${sqlList.join(COLUMN_LIST_SEPARATOR)}`,
      )
      .run(...typedParams);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throwUniqueConstraintViolation(tableName, colNames);
    }
    throw mapSqliteKeyEvaluationError(error);
  }
  const storedRow = selectByRowidStmt.get(info.lastInsertRowid);
  return storedRow.map((val) => (val === undefined ? null : val));
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
  const probeColumns = colNames.map((name) =>
    resolveSchemaColumnDefinition(schema, name),
  );
  const probeSchema = {
    columns: probeColumns,
    primaryKey: [],
    tableConstraints: [
      {
        type: CONSTRAINT_TYPE_UNIQUE,
        columns: probeColumns.map((col) => col.name),
      },
    ],
  };
  const db = new Database(MEMORY_DATABASE);
  try {
    db.defaultSafeIntegers(true);
    db.exec(renderTableDefinitionSql(ast.table, probeSchema));
    const quotedTable = renderSqliteIdentifier(ast.table);
    const quotedCols = probeColumns
      .map((col) => renderSqliteIdentifier(col.name))
      .join(COLUMN_LIST_SEPARATOR);
    const selectByRowidStmt = db
      .prepare(`SELECT ${quotedCols} FROM ${quotedTable} WHERE rowid = ?`)
      .raw(true)
      .safeIntegers(true);
    for (const row of ast.values || []) {
      const rowExprs = colIndices.map((idx) => row[idx]);
      const candidateValues = insertBatchCandidateIntoProbeTable(
        db,
        ast.table,
        colNames,
        quotedTable,
        quotedCols,
        selectByRowidStmt,
        rowExprs,
        params,
      );
      if (candidateValues.some((v) => v === null || v === undefined)) {
        continue;
      }
      await assertUniqueAcrossPartitions(
        coordinator,
        ast.table,
        partitionIds,
        colNames,
        candidateValues,
      );
    }
  } finally {
    db.close();
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
  const {sql: targetClause, params: rawTargetParams} =
    renderTargetPredicate(ast.where, params);
  const targetParams = decodeTypedParams(encodeTypedParams(rawTargetParams));
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
    undefined,
    true,
  );
  assertCompletePartitionProbeResults(results, partitionIds);
  const {matchedTargetCount, externalOwnerCount} =
    tallyUpdateUniquenessProbeRows(results);
  if (
    matchedTargetCount > 1 ||
    (matchedTargetCount === 1 && externalOwnerCount > 0)
  ) {
    throwUniqueConstraintViolation(ast.table, colNames);
  }
}

async function checkUpdateColumnSetUniqueness(
  coordinator,
  ast,
  params,
  partitionIds,
  colNames,
  schema,
) {
  const assignments = ast.assignments || ast.set || [];
  const assigned = colNames.map((colName) =>
    assignments.find(
      (a) => String(a.column).toLowerCase() === String(colName).toLowerCase(),
    ),
  );
  if (!assigned.every(Boolean)) return;
  const probeColumns = colNames.map((name) =>
    resolveSchemaColumnDefinition(schema, name),
  );
  const candidateValues = evaluateRawExpressionsInSqlite(
    assigned.map((a) => a.value),
    params,
    probeColumns,
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
        schema,
      );
    }
  }
}

export {
  enforceCoordinatorUniqueConstraints,
  evaluateKeyExpressionsInSqlite,
  extractCoordinatorKeyValue,
  resolveCoordinatorTableSchema,
  resolveSchemaColumnDefinition,
};
