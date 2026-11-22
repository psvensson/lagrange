/**
 * Canonical PostgreSQL wire-protocol metadata description owner.
 *
 * Derives ParameterDescription and RowDescription / NoData metadata from the
 * parsed SQL AST, catalog table schemas, and lifecycle command contracts
 * without executing SQL effects or invoking guest code.
 *
 * @module query/pg/postgres-wire-description
 */

import {getSchemaByTableName} from '../../bootstrap/system-table-schemas-constants.js';
import {PG_ERROR_CODE} from '../../runtime/pgwire-protocol-constants.js';
import {SERVICE_LIFECYCLE_COMMAND} from '../../service/service-lifecycle-command-contract.js';
import {extractCatalogSchema} from '../distributed/distributed-select-fanout-plan.js';
import {AST_TYPE, EXPR_TYPE} from '../parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_OPERATION} from '../query-constants.js';
import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  classifyServiceLifecycleSql,
  validateServiceLifecycleSqlGrammar,
} from '../service-lifecycle-sql-contract.js';
import {SQLParser} from '../sql-parser.js';
import {resultColumnName} from '../sql-statement-renderer.js';
import {PG_EXPR_TYPE, PARSER_DIALECT} from './pg-compat-constants.js';
import {
  EXPLAIN_DISTRIBUTED_COLUMNS,
  LIFECYCLE_COLUMNS_BY_COMMAND,
  PG_OID,
  PG_TYPE_SIZE,
  buildColumnDescriptor,
  normalizeSqlTypeSpec,
} from './postgres-wire-description-catalog.js';

const DESCRIBE_ERROR_MSG = Object.freeze({
  PARAM_TYPES_EXCEED_PLACEHOLDERS:
    'Parse message specifies more parameter types than SQL placeholders',
  TABLE_NOT_FOUND_PREFIX: 'Relation does not exist: ',
  STAR_REQUIRES_TABLE: 'SELECT * requires a FROM table or CTE in scope',
  EXPLAIN_REQUIRES_STATEMENT: 'EXPLAIN DISTRIBUTED requires a SQL statement',
  SYNTAX_PREFIX: 'SQL Parse Error: ',
});

const EXPLAIN_DISTRIBUTED_PREFIX = /^\s*EXPLAIN\s+DISTRIBUTED\s+/iu;
const COUNT_FN_NAME = 'COUNT';
const LENGTH_FN_NAME = 'LENGTH';
const CHAR_LENGTH_FN_NAME = 'CHAR_LENGTH';
const SUM_FN_NAME = 'SUM';
const AVG_FN_NAME = 'AVG';
const COALESCE_FN_NAME = 'COALESCE';
const NULLIF_FN_NAME = 'NULLIF';
const MIN_FN_NAME = 'MIN';
const MAX_FN_NAME = 'MAX';
const BOOL_LITERAL_VALUE = 'boolean';
const LITERAL_STORAGE_INTEGER = 'INTEGER';
const LITERAL_STORAGE_REAL = 'REAL';
const LITERAL_STORAGE_BLOB = 'BLOB';
const LITERAL_STORAGE_NULL = 'NULL';
const INT32_MIN_VALUE = -2147483648;
const INT32_MAX_VALUE = 2147483647;
const UNSPECIFIED_OID = 0;

const BOOLEAN_OPERATORS = new Set([
  '=', '!=', '<>', '<', '<=', '>', '>=', 'IS', 'IS NOT', 'IS NULL', 'IS NOT NULL',
  'ISNULL', 'NOTNULL', 'AND', 'OR', 'NOT', 'LIKE', 'NOT LIKE', 'ILIKE', 'NOT ILIKE',
]);
const TEXT_FUNCTION_NAMES = new Set([
  'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM', 'SUBSTR', 'SUBSTRING',
  'REPLACE', 'CONCAT', 'GROUP_CONCAT', 'STRING_AGG', 'TYPEOF',
]);
const NUMERIC_OPERATORS = new Set(['+', '-', '*', '/', '%']);

function noUserTableSchema() {
  return null;
}

function createDescriptionError(code, sqlState, message) {
  const error = new Error(message);
  error.code = code;
  if (sqlState) {
    error.sqlState = sqlState;
    error.details = Object.freeze({sqlState});
  }
  return error;
}

function columnDeclaredTypeName(column) {
  if (typeof column?.dataType?.name === 'string') return column.dataType.name;
  if (typeof column?.type === 'string') return column.type;
  return null;
}

function resolveCatalogTableColumns(tableName, resolveTableSchema) {
  const systemEntry = getSchemaByTableName(tableName);
  const schema = systemEntry !== null ?
    extractCatalogSchema(systemEntry) :
    extractCatalogSchema(resolveTableSchema(tableName));
  if (!schema || !Array.isArray(schema.columns)) {
    throw createDescriptionError(
      QUERY_ERROR_CODE.TABLE_NOT_FOUND,
      null,
      DESCRIBE_ERROR_MSG.TABLE_NOT_FOUND_PREFIX + tableName,
    );
  }
  return schema.columns.map((col, idx) => {
    const spec = normalizeSqlTypeSpec(columnDeclaredTypeName(col));
    return buildColumnDescriptor(col.name, spec.oid, 0, idx + 1);
  });
}

function collectAstParameterIndices(node, targetSet) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectAstParameterIndices(item, targetSet);
    return;
  }
  if (node.type === EXPR_TYPE.PARAMETER && Number.isInteger(node.index)) {
    targetSet.add(node.index);
    return;
  }
  for (const value of Object.values(node)) {
    collectAstParameterIndices(value, targetSet);
  }
}

function resolveParameterCount(ast) {
  if (Array.isArray(ast._paramMapping) && ast._paramMapping.length > 0) {
    let maxSlot = 0;
    for (const slot of ast._paramMapping) {
      if (Number.isInteger(slot) && slot > maxSlot) maxSlot = slot;
    }
    return maxSlot;
  }
  const indices = new Set();
  collectAstParameterIndices(ast, indices);
  let maxIndex = -1;
  for (const idx of indices) {
    if (idx > maxIndex) maxIndex = idx;
  }
  return maxIndex + 1;
}

function resolveParameterSlot(paramNode, paramMapping) {
  if (Array.isArray(paramMapping) && Number.isInteger(paramMapping[paramNode.index])) {
    return paramMapping[paramNode.index] - 1;
  }
  return paramNode.index;
}

function buildSelectScope(ast, inferredParams, outerScope, resolveTableSchema, paramMapping) {
  const relations = [];
  const byAlias = new Map(outerScope ? outerScope.byAlias : undefined);

  const registerRelation = (alias, columns) => {
    const entry = {alias, columns};
    relations.push(entry);
    if (alias) byAlias.set(alias, entry);
  };

  if (Array.isArray(ast.ctes)) {
    for (const cte of ast.ctes) {
      const cteDesc = describeSelectStatement(
        cte.query,
        inferredParams,
        {byAlias, relations: []},
        resolveTableSchema,
        paramMapping,
      );
      const aliasedCols = Array.isArray(cte.columns) && cte.columns.length > 0 ?
        cteDesc.columns.map((col, idx) => buildColumnDescriptor(
          idx < cte.columns.length ? cte.columns[idx] : col.name,
          col.oid,
          col.tableOid,
          col.columnAttr,
        )) :
        cteDesc.columns;
      registerRelation(cte.name, aliasedCols);
    }
  }

  const fromEntries = [];
  if (ast.from) fromEntries.push(ast.from);
  if (Array.isArray(ast.joins)) {
    for (const join of ast.joins) {
      if (join.table) fromEntries.push(join.table);
    }
  }
  const ownRelations = [];
  for (const source of fromEntries) {
    if (source.subquery) {
      const subDesc = describeSelectStatement(
        source.subquery,
        inferredParams,
        {byAlias, relations: []},
        resolveTableSchema,
        paramMapping,
      );
      const alias = source.alias || null;
      const entry = {alias, columns: subDesc.columns};
      ownRelations.push(entry);
      if (alias) byAlias.set(alias, entry);
    } else if (typeof source.name === 'string') {
      const existingCte = byAlias.get(source.name);
      const cols = existingCte ?
        existingCte.columns :
        resolveCatalogTableColumns(source.name, resolveTableSchema);
      const alias = source.alias || source.name;
      const entry = {alias, columns: cols};
      ownRelations.push(entry);
      byAlias.set(alias, entry);
    }
  }
  return {byAlias, relations: ownRelations};
}

function lookupColumnDescriptor(scope, tableRef, columnName) {
  if (tableRef) {
    const rel = scope.byAlias.get(tableRef);
    return rel?.columns.find((col) => col.name === columnName) || null;
  }
  for (const rel of scope.relations) {
    const found = rel.columns.find((col) => col.name === columnName);
    if (found) return found;
  }
  return null;
}

function inferLiteralOid(expr) {
  if (expr.sqlType === LITERAL_STORAGE_NULL) return PG_OID.TEXT;
  if (typeof expr.value === BOOL_LITERAL_VALUE) return PG_OID.BOOL;
  if (expr.sqlType === LITERAL_STORAGE_INTEGER) {
    const num = Number(expr.value);
    if (Number.isSafeInteger(num) &&
        num >= INT32_MIN_VALUE && num <= INT32_MAX_VALUE) {
      return PG_OID.INT4;
    }
    return PG_OID.INT8;
  }
  if (expr.sqlType === LITERAL_STORAGE_REAL) return PG_OID.FLOAT8;
  if (expr.sqlType === LITERAL_STORAGE_BLOB) return PG_OID.BYTEA;
  return PG_OID.TEXT;
}

function inferExpressionOid(expr, scope, inferredParams, paramMapping = null) {
  if (!expr || typeof expr !== 'object') return PG_OID.TEXT;
  switch (expr.type) {
  case EXPR_TYPE.COLUMN_REF: {
    const col = lookupColumnDescriptor(scope, expr.table, expr.column);
    return col ? col.oid : PG_OID.TEXT;
  }
  case EXPR_TYPE.LITERAL:
    return inferLiteralOid(expr);
  case EXPR_TYPE.PARAMETER:
    return inferredParams.get(resolveParameterSlot(expr, paramMapping)) || PG_OID.TEXT;
  case PG_EXPR_TYPE.CAST:
    return normalizeSqlTypeSpec(expr.pgTargetType || expr.targetType).oid;
  case EXPR_TYPE.AGGREGATE: {
    const fn = String(expr.name || '').toUpperCase();
    if (fn === COUNT_FN_NAME) return PG_OID.INT8;
    if (fn === AVG_FN_NAME) return PG_OID.FLOAT8;
    if (fn === SUM_FN_NAME && Array.isArray(expr.args) && expr.args[0]) {
      const inner = inferExpressionOid(expr.args[0], scope, inferredParams, paramMapping);
      return inner === PG_OID.FLOAT4 || inner === PG_OID.FLOAT8 ?
        PG_OID.FLOAT8 : PG_OID.INT8;
    }
    if ((fn === MIN_FN_NAME || fn === MAX_FN_NAME) && expr.args?.[0]) {
      return inferExpressionOid(expr.args[0], scope, inferredParams, paramMapping);
    }
    return PG_OID.TEXT;
  }
  case PG_EXPR_TYPE.FUNCTION_CALL: {
    const fn = String(expr.name || '').toUpperCase();
    if (fn === LENGTH_FN_NAME || fn === CHAR_LENGTH_FN_NAME) return PG_OID.INT4;
    if (TEXT_FUNCTION_NAMES.has(fn)) return PG_OID.TEXT;
    if ((fn === COALESCE_FN_NAME || fn === NULLIF_FN_NAME) && Array.isArray(expr.args)) {
      for (const arg of expr.args) {
        if (arg?.sqlType !== LITERAL_STORAGE_NULL) {
          return inferExpressionOid(arg, scope, inferredParams, paramMapping);
        }
      }
    }
    return PG_OID.TEXT;
  }
  case PG_EXPR_TYPE.CASE: {
    for (const branch of expr.conditions || []) {
      if (branch.thenExpression?.sqlType !== LITERAL_STORAGE_NULL) {
        return inferExpressionOid(branch.thenExpression, scope, inferredParams, paramMapping);
      }
    }
    if (expr.elseExpr && expr.elseExpr.sqlType !== LITERAL_STORAGE_NULL) {
      return inferExpressionOid(expr.elseExpr, scope, inferredParams, paramMapping);
    }
    return PG_OID.TEXT;
  }
  case EXPR_TYPE.BINARY: {
    const op = String(expr.operator || '').toUpperCase();
    if (BOOLEAN_OPERATORS.has(op)) return PG_OID.BOOL;
    if (NUMERIC_OPERATORS.has(op)) {
      const left = inferExpressionOid(expr.left, scope, inferredParams, paramMapping);
      const right = inferExpressionOid(expr.right, scope, inferredParams, paramMapping);
      if (left === PG_OID.FLOAT8 || right === PG_OID.FLOAT8 ||
          left === PG_OID.FLOAT4 || right === PG_OID.FLOAT4) {
        return PG_OID.FLOAT8;
      }
      if (left === PG_OID.NUMERIC || right === PG_OID.NUMERIC) return PG_OID.NUMERIC;
      if (left === PG_OID.INT8 || right === PG_OID.INT8) return PG_OID.INT8;
      if (left === PG_OID.INT4 && right === PG_OID.INT4) return PG_OID.INT4;
    }
    return PG_OID.TEXT;
  }
  case EXPR_TYPE.UNARY:
  case EXPR_TYPE.IN:
  case EXPR_TYPE.BETWEEN:
  case EXPR_TYPE.LIKE:
  case PG_EXPR_TYPE.EXISTS:
    return PG_OID.BOOL;
  case EXPR_TYPE.COLLATE:
    return inferExpressionOid(expr.expression, scope, inferredParams, paramMapping);
  default:
    return PG_OID.TEXT;
  }
}

function recordInferredParam(inferredParams, paramNode, oid, paramMapping) {
  const slot = resolveParameterSlot(paramNode, paramMapping);
  if (!Number.isInteger(slot) || slot < 0 || !oid) return;
  if (!inferredParams.has(slot)) {
    inferredParams.set(slot, oid);
  }
}

function inferParametersInExpression(expr, scope, inferredParams, paramMapping) {
  if (!expr || typeof expr !== 'object') return;
  if (Array.isArray(expr)) {
    for (const item of expr) {
      inferParametersInExpression(item, scope, inferredParams, paramMapping);
    }
    return;
  }
  if (expr.type === PG_EXPR_TYPE.CAST && expr.expression?.type === EXPR_TYPE.PARAMETER) {
    const oid = normalizeSqlTypeSpec(expr.pgTargetType || expr.targetType).oid;
    recordInferredParam(inferredParams, expr.expression, oid, paramMapping);
    return;
  }
  if (expr.type === EXPR_TYPE.BINARY) {
    if (expr.left?.type === EXPR_TYPE.COLUMN_REF && expr.right?.type === EXPR_TYPE.PARAMETER) {
      const col = lookupColumnDescriptor(scope, expr.left.table, expr.left.column);
      if (col) recordInferredParam(inferredParams, expr.right, col.oid, paramMapping);
    } else if (expr.right?.type === EXPR_TYPE.COLUMN_REF &&
        expr.left?.type === EXPR_TYPE.PARAMETER) {
      const col = lookupColumnDescriptor(scope, expr.right.table, expr.right.column);
      if (col) recordInferredParam(inferredParams, expr.left, col.oid, paramMapping);
    }
  }
  if (expr.type === EXPR_TYPE.IN && expr.expression?.type === EXPR_TYPE.COLUMN_REF &&
      Array.isArray(expr.values)) {
    const col = lookupColumnDescriptor(scope, expr.expression.table, expr.expression.column);
    if (col) {
      for (const val of expr.values) {
        if (val?.type === EXPR_TYPE.PARAMETER) {
          recordInferredParam(inferredParams, val, col.oid, paramMapping);
        }
      }
    }
  }
  if (expr.type === EXPR_TYPE.LIKE && expr.right?.type === EXPR_TYPE.PARAMETER) {
    recordInferredParam(inferredParams, expr.right, PG_OID.TEXT, paramMapping);
  }
  for (const value of Object.values(expr)) {
    inferParametersInExpression(value, scope, inferredParams, paramMapping);
  }
}

function describeSelectStatement(
  ast,
  inferredParams,
  outerScope,
  resolveTableSchema,
  paramMapping = null,
) {
  const scope = buildSelectScope(ast, inferredParams, outerScope, resolveTableSchema, paramMapping);
  inferParametersInExpression(ast.where, scope, inferredParams, paramMapping);
  inferParametersInExpression(ast.having, scope, inferredParams, paramMapping);
  inferParametersInExpression(ast.columns, scope, inferredParams, paramMapping);
  if (Array.isArray(ast.joins)) {
    for (const join of ast.joins) {
      inferParametersInExpression(join.on, scope, inferredParams, paramMapping);
    }
  }
  if (ast.limit?.count?.type === EXPR_TYPE.PARAMETER) {
    recordInferredParam(inferredParams, ast.limit.count, PG_OID.INT8, paramMapping);
  }
  if (ast.limit?.offset?.type === EXPR_TYPE.PARAMETER) {
    recordInferredParam(inferredParams, ast.limit.offset, PG_OID.INT8, paramMapping);
  }

  const columns = [];
  for (const col of ast.columns || []) {
    if (col.type === EXPR_TYPE.STAR) {
      if (col.table) {
        const rel = scope.byAlias.get(col.table);
        if (!rel) {
          throw createDescriptionError(
            QUERY_ERROR_CODE.TABLE_NOT_FOUND,
            null,
            DESCRIBE_ERROR_MSG.TABLE_NOT_FOUND_PREFIX + col.table,
          );
        }
        columns.push(...rel.columns);
      } else if (scope.relations.length === 0) {
        throw createDescriptionError(
          QUERY_ERROR_CODE.SYNTAX_ERROR,
          null,
          DESCRIBE_ERROR_MSG.STAR_REQUIRES_TABLE,
        );
      } else {
        for (const rel of scope.relations) columns.push(...rel.columns);
      }
      continue;
    }
    const name = resultColumnName(col);
    const oid = inferExpressionOid(col.expression, scope, inferredParams, paramMapping);
    columns.push(buildColumnDescriptor(name, oid));
  }

  if (ast.setOperation?.right) {
    describeSelectStatement(
      ast.setOperation.right,
      inferredParams,
      outerScope,
      resolveTableSchema,
      paramMapping,
    );
  }
  return {columns};
}

function inferDmlParameters(ast, inferredParams, resolveTableSchema, paramMapping) {
  const cols = resolveCatalogTableColumns(ast.table, resolveTableSchema);
  const scope = {byAlias: new Map([[ast.table, {alias: ast.table, columns: cols}]]),
    relations: [{alias: ast.table, columns: cols}]};

  if (ast.type === AST_TYPE.INSERT) {
    const targetCols = Array.isArray(ast.columns) ?
      ast.columns.map((name) => cols.find((c) => c.name === name) || null) :
      cols;
    for (const row of ast.values || []) {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i]?.type === EXPR_TYPE.PARAMETER && targetCols[i]) {
          recordInferredParam(inferredParams, row[i], targetCols[i].oid, paramMapping);
        } else {
          inferParametersInExpression(row[i], scope, inferredParams, paramMapping);
        }
      }
    }
    return;
  }
  if (ast.type === AST_TYPE.UPDATE) {
    for (const assign of ast.assignments || []) {
      const target = cols.find((c) => c.name === assign.column);
      if (target && assign.value?.type === EXPR_TYPE.PARAMETER) {
        recordInferredParam(inferredParams, assign.value, target.oid, paramMapping);
      } else {
        inferParametersInExpression(assign.value, scope, inferredParams, paramMapping);
      }
    }
    inferParametersInExpression(ast.where, scope, inferredParams, paramMapping);
    return;
  }
  if (ast.type === AST_TYPE.DELETE) {
    inferParametersInExpression(ast.where, scope, inferredParams, paramMapping);
  }
}

function finalizeParameterOids(ast, rawParamTypes, inferredParams) {
  const paramCount = resolveParameterCount(ast);
  const declared = Array.isArray(rawParamTypes) ? rawParamTypes : [];
  if (declared.length > paramCount) {
    throw createDescriptionError(
      QUERY_ERROR_CODE.SYNTAX_ERROR,
      PG_ERROR_CODE.PROTOCOL_VIOLATION,
      DESCRIBE_ERROR_MSG.PARAM_TYPES_EXCEED_PLACEHOLDERS,
    );
  }
  const paramOids = [];
  for (let i = 0; i < paramCount; i += 1) {
    const explicitOid = i < declared.length ? Number(declared[i]) : UNSPECIFIED_OID;
    if (explicitOid > 0) {
      paramOids.push(explicitOid);
    } else {
      paramOids.push(inferredParams.get(i) || PG_OID.TEXT);
    }
  }
  return Object.freeze(paramOids);
}

function describeLifecycleStatement(sql, rawParamTypes = []) {
  const classification = validateServiceLifecycleSqlGrammar(sql);
  const command = classification.command;
  const expectedParams = command === SERVICE_LIFECYCLE_COMMAND.SHOW_ALL ? 0 : 1;
  const declared = Array.isArray(rawParamTypes) ? rawParamTypes : [];
  if (declared.length > expectedParams) {
    throw createDescriptionError(
      QUERY_ERROR_CODE.SYNTAX_ERROR,
      PG_ERROR_CODE.PROTOCOL_VIOLATION,
      DESCRIBE_ERROR_MSG.PARAM_TYPES_EXCEED_PLACEHOLDERS,
    );
  }
  const paramOids = expectedParams === 0 ?
    Object.freeze([]) :
    Object.freeze([declared[0] > 0 ? Number(declared[0]) : PG_OID.TEXT]);
  return Object.freeze({
    success: true,
    described: true,
    statementType: command,
    returnsRows: true,
    paramCount: expectedParams,
    paramOids,
    columns: LIFECYCLE_COLUMNS_BY_COMMAND.get(command),
  });
}

function parseSqlForDescription(sql) {
  try {
    return new SQLParser(sql, {dialect: PARSER_DIALECT.POSTGRESQL}).parse();
  } catch (error) {
    if (error.sqlState || error.code) throw error;
    throw createDescriptionError(
      QUERY_ERROR_CODE.SYNTAX_ERROR,
      null,
      DESCRIBE_ERROR_MSG.SYNTAX_PREFIX + error.message,
    );
  }
}

function describePostgresSqlStatement({
  sql,
  paramTypes = [],
  resolveTableSchema = noUserTableSchema,
}) {
  if (classifyServiceLifecycleSql(sql).kind ===
      SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE) {
    return describeLifecycleStatement(sql, paramTypes);
  }

  const isExplainDistributed = EXPLAIN_DISTRIBUTED_PREFIX.test(sql);
  const statementSql = isExplainDistributed ? sql.replace(EXPLAIN_DISTRIBUTED_PREFIX, '') : sql;
  if (isExplainDistributed && !statementSql.trim()) {
    throw createDescriptionError(
      QUERY_ERROR_CODE.SYNTAX_ERROR,
      null,
      DESCRIBE_ERROR_MSG.EXPLAIN_REQUIRES_STATEMENT,
    );
  }

  let ast;
  try {
    ast = parseSqlForDescription(statementSql);
  } catch (error) {
    if (!isExplainDistributed && error?.code === QUERY_ERROR_CODE.EMPTY_STATEMENT) {
      if (Array.isArray(paramTypes) && paramTypes.length > 0) {
        throw createDescriptionError(
          QUERY_ERROR_CODE.SYNTAX_ERROR,
          PG_ERROR_CODE.PROTOCOL_VIOLATION,
          DESCRIBE_ERROR_MSG.PARAM_TYPES_EXCEED_PLACEHOLDERS,
        );
      }
      return Object.freeze({
        success: true,
        described: true,
        statementType: null,
        isEmpty: true,
        returnsRows: false,
        paramCount: 0,
        paramOids: Object.freeze([]),
        columns: Object.freeze([]),
      });
    }
    throw error;
  }

  const paramMapping = Array.isArray(ast._paramMapping) ? ast._paramMapping : null;
  const inferredParams = new Map();
  if (paramMapping) {
    for (let i = 0; i < paramTypes.length; i += 1) {
      if (Number(paramTypes[i]) > 0) inferredParams.set(i, Number(paramTypes[i]));
    }
  }

  let columns = Object.freeze([]);
  let returnsRows = false;
  if (ast.type === AST_TYPE.SELECT) {
    const selectDesc = describeSelectStatement(
      ast,
      inferredParams,
      null,
      resolveTableSchema,
      paramMapping,
    );
    columns = Object.freeze(selectDesc.columns);
    returnsRows = true;
  } else if (ast.type === AST_TYPE.INSERT || ast.type === AST_TYPE.UPDATE ||
      ast.type === AST_TYPE.DELETE) {
    if (ast.returning) {
      throw createDescriptionError(
        QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
        PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
        QUERY_ERROR_MSG.RETURNING_UNSUPPORTED,
      );
    }
    inferDmlParameters(ast, inferredParams, resolveTableSchema, paramMapping);
  }

  const paramOids = finalizeParameterOids(ast, paramTypes, inferredParams);
  if (isExplainDistributed) {
    return Object.freeze({
      success: true,
      described: true,
      statementType: QUERY_OPERATION.EXPLAIN_DISTRIBUTED,
      returnsRows: true,
      paramCount: paramOids.length,
      paramOids,
      columns: EXPLAIN_DISTRIBUTED_COLUMNS,
    });
  }
  return Object.freeze({
    success: true,
    described: true,
    statementType: ast.type,
    returnsRows,
    paramCount: paramOids.length,
    paramOids,
    columns,
  });
}

export {
  PG_OID,
  PG_TYPE_SIZE,
  describeLifecycleStatement,
  describePostgresSqlStatement,
  normalizeSqlTypeSpec,
};
