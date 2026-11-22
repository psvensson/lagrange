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
import {PG_ERROR_CODE, PG_FORMAT_CODE} from '../../runtime/pgwire-protocol-constants.js';
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

const PG_OID = Object.freeze({
  BOOL: 16,
  BYTEA: 17,
  INT8: 20,
  INT2: 21,
  INT4: 23,
  TEXT: 25,
  JSON: 114,
  FLOAT4: 700,
  FLOAT8: 701,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
  UUID: 2950,
  JSONB: 3802,
});

const UNMODIFIED_TYPE = -1;
const VARIABLE_LENGTH = -1;
const PG_TYPE_SIZE = Object.freeze({
  ONE: 1,
  TWO: 2,
  FOUR: 4,
  EIGHT: 8,
  SIXTEEN: 16,
  VARIABLE: VARIABLE_LENGTH,
});

const PG_TYPE_SPEC_BY_NAME = Object.freeze(Object.assign(Object.create(null), {
  'BOOL': Object.freeze({oid: PG_OID.BOOL, typeSize: PG_TYPE_SIZE.ONE}),
  'BOOLEAN': Object.freeze({oid: PG_OID.BOOL, typeSize: PG_TYPE_SIZE.ONE}),
  'BYTEA': Object.freeze({oid: PG_OID.BYTEA, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'BLOB': Object.freeze({oid: PG_OID.BYTEA, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'INT8': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'BIGINT': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'BIGSERIAL': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'SERIAL8': Object.freeze({oid: PG_OID.INT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'INT2': Object.freeze({oid: PG_OID.INT2, typeSize: PG_TYPE_SIZE.TWO}),
  'SMALLINT': Object.freeze({oid: PG_OID.INT2, typeSize: PG_TYPE_SIZE.TWO}),
  'INT4': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'INT': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'INTEGER': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'SERIAL': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'SERIAL4': Object.freeze({oid: PG_OID.INT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'TEXT': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'VARCHAR': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'CHARACTER VARYING': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'CHAR': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'CHARACTER': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'STRING': Object.freeze({oid: PG_OID.TEXT, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'JSON': Object.freeze({oid: PG_OID.JSON, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'JSONB': Object.freeze({oid: PG_OID.JSONB, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'FLOAT4': Object.freeze({oid: PG_OID.FLOAT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'REAL': Object.freeze({oid: PG_OID.FLOAT4, typeSize: PG_TYPE_SIZE.FOUR}),
  'FLOAT8': Object.freeze({oid: PG_OID.FLOAT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'DOUBLE PRECISION': Object.freeze({oid: PG_OID.FLOAT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'FLOAT': Object.freeze({oid: PG_OID.FLOAT8, typeSize: PG_TYPE_SIZE.EIGHT}),
  'DATE': Object.freeze({oid: PG_OID.DATE, typeSize: PG_TYPE_SIZE.FOUR}),
  'TIMESTAMP': Object.freeze({oid: PG_OID.TIMESTAMP, typeSize: PG_TYPE_SIZE.EIGHT}),
  'TIMESTAMP WITHOUT TIME ZONE': Object.freeze({
    oid: PG_OID.TIMESTAMP,
    typeSize: PG_TYPE_SIZE.EIGHT,
  }),
  'TIMESTAMPTZ': Object.freeze({oid: PG_OID.TIMESTAMPTZ, typeSize: PG_TYPE_SIZE.EIGHT}),
  'TIMESTAMP WITH TIME ZONE': Object.freeze({
    oid: PG_OID.TIMESTAMPTZ,
    typeSize: PG_TYPE_SIZE.EIGHT,
  }),
  'NUMERIC': Object.freeze({oid: PG_OID.NUMERIC, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'DECIMAL': Object.freeze({oid: PG_OID.NUMERIC, typeSize: PG_TYPE_SIZE.VARIABLE}),
  'UUID': Object.freeze({oid: PG_OID.UUID, typeSize: PG_TYPE_SIZE.SIXTEEN}),
}));

const TYPE_SIZE_BY_OID = Object.freeze(new Map([
  [PG_OID.BOOL, PG_TYPE_SIZE.ONE],
  [PG_OID.BYTEA, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.INT8, PG_TYPE_SIZE.EIGHT],
  [PG_OID.INT2, PG_TYPE_SIZE.TWO],
  [PG_OID.INT4, PG_TYPE_SIZE.FOUR],
  [PG_OID.TEXT, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.JSON, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.FLOAT4, PG_TYPE_SIZE.FOUR],
  [PG_OID.FLOAT8, PG_TYPE_SIZE.EIGHT],
  [PG_OID.DATE, PG_TYPE_SIZE.FOUR],
  [PG_OID.TIMESTAMP, PG_TYPE_SIZE.EIGHT],
  [PG_OID.TIMESTAMPTZ, PG_TYPE_SIZE.EIGHT],
  [PG_OID.NUMERIC, PG_TYPE_SIZE.VARIABLE],
  [PG_OID.UUID, PG_TYPE_SIZE.SIXTEEN],
  [PG_OID.JSONB, PG_TYPE_SIZE.VARIABLE],
]));

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
const TYPE_PARAM_SUFFIX_PATTERN = /\([^)]*\)/gu;

function buildColumnDescriptor(name, oid = PG_OID.TEXT, tableOid = 0, columnAttr = 0) {
  const typeSize = TYPE_SIZE_BY_OID.get(oid) ?? PG_TYPE_SIZE.VARIABLE;
  return Object.freeze({
    name,
    oid,
    typeSize,
    typeModifier: UNMODIFIED_TYPE,
    formatCode: PG_FORMAT_CODE.TEXT,
    tableOid,
    columnAttr,
  });
}

function buildLifecycleColumns(entries) {
  return Object.freeze(entries.map(([name, oid]) => buildColumnDescriptor(name, oid)));
}

const LIFECYCLE_STATUS_COLUMNS = buildLifecycleColumns([
  ['desired_state', PG_OID.TEXT],
  ['installation_id', PG_OID.TEXT],
  ['latest_failure_id', PG_OID.TEXT],
  ['operation_id', PG_OID.TEXT],
  ['revision_id', PG_OID.TEXT],
  ['rollout_state', PG_OID.TEXT],
  ['service_definition_id', PG_OID.TEXT],
  ['service_name', PG_OID.TEXT],
  ['version', PG_OID.TEXT],
]);

const LIFECYCLE_OPERATION_COLUMNS = buildLifecycleColumns([
  ['action', PG_OID.TEXT],
  ['desired_state', PG_OID.TEXT],
  ['installation_id', PG_OID.TEXT],
  ['operation_id', PG_OID.TEXT],
  ['operation_status', PG_OID.TEXT],
  ['package_id', PG_OID.TEXT],
  ['revision_id', PG_OID.TEXT],
  ['rollout_state', PG_OID.TEXT],
  ['service_definition_id', PG_OID.TEXT],
  ['service_name', PG_OID.TEXT],
]);

const LIFECYCLE_COLUMNS_BY_COMMAND = Object.freeze(new Map([
  [SERVICE_LIFECYCLE_COMMAND.CALL_BINDING, buildLifecycleColumns([
    ['name', PG_OID.TEXT],
    ['result', PG_OID.TEXT],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.CONFIGURE_ACCESS, buildLifecycleColumns([
    ['binding_version_id', PG_OID.TEXT],
    ['call_targets', PG_OID.INT4],
    ['schema_version', PG_OID.INT4],
    ['service_id', PG_OID.TEXT],
    ['table_slots', PG_OID.INT4],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.CREATE_BINDING, buildLifecycleColumns([
    ['action', PG_OID.TEXT],
    ['binding_id', PG_OID.TEXT],
    ['binding_name', PG_OID.TEXT],
    ['binding_version_id', PG_OID.TEXT],
    ['export_name', PG_OID.TEXT],
    ['generation', PG_OID.INT4],
    ['manifest_digest', PG_OID.TEXT],
    ['operation_status', PG_OID.TEXT],
    ['package_id', PG_OID.TEXT],
    ['source_kind', PG_OID.TEXT],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.PUBLISH_ARTIFACT, buildLifecycleColumns([
    ['already_sealed', PG_OID.BOOL],
    ['artifact_digest', PG_OID.TEXT],
    ['chunk_count', PG_OID.INT4],
    ['media_type', PG_OID.TEXT],
    ['payload_digest', PG_OID.TEXT],
    ['sealed_at', PG_OID.TEXT],
    ['total_size', PG_OID.INT4],
  ])],
  [SERVICE_LIFECYCLE_COMMAND.INSTALL, LIFECYCLE_OPERATION_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.UPGRADE, LIFECYCLE_OPERATION_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.REMOVE, LIFECYCLE_OPERATION_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.SHOW_ONE, LIFECYCLE_STATUS_COLUMNS],
  [SERVICE_LIFECYCLE_COMMAND.SHOW_ALL, LIFECYCLE_STATUS_COLUMNS],
]));

const EXPLAIN_DISTRIBUTED_COLUMNS = buildLifecycleColumns([
  ['plan_id', PG_OID.TEXT],
  ['statement_type', PG_OID.TEXT],
  ['execution_policy', PG_OID.TEXT],
  ['table_plans', PG_OID.JSON],
  ['join_plan', PG_OID.JSON],
  ['merge_plan', PG_OID.JSON],
  ['diagnostics', PG_OID.JSON],
]);

function createDescriptionError(code, sqlState, message) {
  const error = new Error(message);
  error.code = code;
  if (sqlState) {
    error.sqlState = sqlState;
    error.details = Object.freeze({sqlState});
  }
  return error;
}

function normalizeSqlTypeSpec(rawType) {
  if (typeof rawType !== 'string' || rawType.trim().length === 0) {
    return PG_TYPE_SPEC_BY_NAME.TEXT;
  }
  const normalized = rawType.replace(TYPE_PARAM_SUFFIX_PATTERN, '').trim().toUpperCase();
  if (Object.hasOwn(PG_TYPE_SPEC_BY_NAME, normalized)) {
    return PG_TYPE_SPEC_BY_NAME[normalized];
  }
  return PG_TYPE_SPEC_BY_NAME.TEXT;
}

function columnDeclaredTypeName(column) {
  if (typeof column?.dataType?.name === 'string') return column.dataType.name;
  if (typeof column?.type === 'string') return column.type;
  return null;
}

function noUserTableSchema() {
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
    let maxIndex = -1;
    for (const idx of ast._paramMapping) {
      if (Number.isInteger(idx) && idx > maxIndex) maxIndex = idx;
    }
    return maxIndex + 1;
  }
  const indices = new Set();
  collectAstParameterIndices(ast, indices);
  let maxIndex = -1;
  for (const idx of indices) {
    if (idx > maxIndex) maxIndex = idx;
  }
  return maxIndex + 1;
}

function buildSelectScope(ast, outerScope, resolveTableSchema) {
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
        new Map(),
        {byAlias, relations: []},
        resolveTableSchema,
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
        new Map(),
        {byAlias, relations: []},
        resolveTableSchema,
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

function inferExpressionOid(expr, scope, inferredParams) {
  if (!expr || typeof expr !== 'object') return PG_OID.TEXT;
  switch (expr.type) {
  case EXPR_TYPE.COLUMN_REF: {
    const col = lookupColumnDescriptor(scope, expr.table, expr.column);
    return col ? col.oid : PG_OID.TEXT;
  }
  case EXPR_TYPE.LITERAL:
    return inferLiteralOid(expr);
  case EXPR_TYPE.PARAMETER:
    return inferredParams.get(expr.index) || PG_OID.TEXT;
  case PG_EXPR_TYPE.CAST:
    return normalizeSqlTypeSpec(expr.pgTargetType || expr.targetType).oid;
  case EXPR_TYPE.AGGREGATE: {
    const fn = String(expr.name || '').toUpperCase();
    if (fn === COUNT_FN_NAME) return PG_OID.INT8;
    if (fn === AVG_FN_NAME) return PG_OID.FLOAT8;
    if (fn === SUM_FN_NAME && Array.isArray(expr.args) && expr.args[0]) {
      const inner = inferExpressionOid(expr.args[0], scope, inferredParams);
      return inner === PG_OID.FLOAT4 || inner === PG_OID.FLOAT8 ?
        PG_OID.FLOAT8 : PG_OID.INT8;
    }
    if ((fn === MIN_FN_NAME || fn === MAX_FN_NAME) && expr.args?.[0]) {
      return inferExpressionOid(expr.args[0], scope, inferredParams);
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
          return inferExpressionOid(arg, scope, inferredParams);
        }
      }
    }
    return PG_OID.TEXT;
  }
  case PG_EXPR_TYPE.CASE: {
    for (const branch of expr.conditions || []) {
      if (branch.thenExpression?.sqlType !== LITERAL_STORAGE_NULL) {
        return inferExpressionOid(branch.thenExpression, scope, inferredParams);
      }
    }
    if (expr.elseExpr && expr.elseExpr.sqlType !== LITERAL_STORAGE_NULL) {
      return inferExpressionOid(expr.elseExpr, scope, inferredParams);
    }
    return PG_OID.TEXT;
  }
  case EXPR_TYPE.BINARY: {
    const op = String(expr.operator || '').toUpperCase();
    if (BOOLEAN_OPERATORS.has(op)) return PG_OID.BOOL;
    if (NUMERIC_OPERATORS.has(op)) {
      const left = inferExpressionOid(expr.left, scope, inferredParams);
      const right = inferExpressionOid(expr.right, scope, inferredParams);
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
    return inferExpressionOid(expr.expression, scope, inferredParams);
  default:
    return PG_OID.TEXT;
  }
}

function recordInferredParam(inferredParams, paramIndex, oid) {
  if (!Number.isInteger(paramIndex) || !oid) return;
  if (!inferredParams.has(paramIndex)) {
    inferredParams.set(paramIndex, oid);
  }
}

function inferParametersInExpression(expr, scope, inferredParams) {
  if (!expr || typeof expr !== 'object') return;
  if (Array.isArray(expr)) {
    for (const item of expr) inferParametersInExpression(item, scope, inferredParams);
    return;
  }
  if (expr.type === PG_EXPR_TYPE.CAST && expr.expression?.type === EXPR_TYPE.PARAMETER) {
    const oid = normalizeSqlTypeSpec(expr.pgTargetType || expr.targetType).oid;
    recordInferredParam(inferredParams, expr.expression.index, oid);
    return;
  }
  if (expr.type === EXPR_TYPE.BINARY) {
    if (expr.left?.type === EXPR_TYPE.COLUMN_REF && expr.right?.type === EXPR_TYPE.PARAMETER) {
      const col = lookupColumnDescriptor(scope, expr.left.table, expr.left.column);
      if (col) recordInferredParam(inferredParams, expr.right.index, col.oid);
    } else if (expr.right?.type === EXPR_TYPE.COLUMN_REF &&
        expr.left?.type === EXPR_TYPE.PARAMETER) {
      const col = lookupColumnDescriptor(scope, expr.right.table, expr.right.column);
      if (col) recordInferredParam(inferredParams, expr.left.index, col.oid);
    }
  }
  if (expr.type === EXPR_TYPE.IN && expr.expression?.type === EXPR_TYPE.COLUMN_REF &&
      Array.isArray(expr.values)) {
    const col = lookupColumnDescriptor(scope, expr.expression.table, expr.expression.column);
    if (col) {
      for (const val of expr.values) {
        if (val?.type === EXPR_TYPE.PARAMETER) {
          recordInferredParam(inferredParams, val.index, col.oid);
        }
      }
    }
  }
  if (expr.type === EXPR_TYPE.LIKE && expr.right?.type === EXPR_TYPE.PARAMETER) {
    recordInferredParam(inferredParams, expr.right.index, PG_OID.TEXT);
  }
  for (const value of Object.values(expr)) {
    inferParametersInExpression(value, scope, inferredParams);
  }
}

function describeSelectStatement(ast, inferredParams, outerScope, resolveTableSchema) {
  const scope = buildSelectScope(ast, outerScope, resolveTableSchema);
  inferParametersInExpression(ast.where, scope, inferredParams);
  inferParametersInExpression(ast.having, scope, inferredParams);
  inferParametersInExpression(ast.columns, scope, inferredParams);
  if (Array.isArray(ast.joins)) {
    for (const join of ast.joins) inferParametersInExpression(join.on, scope, inferredParams);
  }
  if (ast.limit?.count?.type === EXPR_TYPE.PARAMETER) {
    recordInferredParam(inferredParams, ast.limit.count.index, PG_OID.INT8);
  }
  if (ast.limit?.offset?.type === EXPR_TYPE.PARAMETER) {
    recordInferredParam(inferredParams, ast.limit.offset.index, PG_OID.INT8);
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
    const oid = inferExpressionOid(col.expression, scope, inferredParams);
    columns.push(buildColumnDescriptor(name, oid));
  }

  if (ast.setOperation?.right) {
    describeSelectStatement(ast.setOperation.right, inferredParams, outerScope, resolveTableSchema);
  }
  return {columns};
}

function inferDmlParameters(ast, inferredParams, resolveTableSchema) {
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
          recordInferredParam(inferredParams, row[i].index, targetCols[i].oid);
        } else {
          inferParametersInExpression(row[i], scope, inferredParams);
        }
      }
    }
    return;
  }
  if (ast.type === AST_TYPE.UPDATE) {
    for (const assign of ast.assignments || []) {
      const target = cols.find((c) => c.name === assign.column);
      if (target && assign.value?.type === EXPR_TYPE.PARAMETER) {
        recordInferredParam(inferredParams, assign.value.index, target.oid);
      } else {
        inferParametersInExpression(assign.value, scope, inferredParams);
      }
    }
    inferParametersInExpression(ast.where, scope, inferredParams);
    return;
  }
  if (ast.type === AST_TYPE.DELETE) {
    inferParametersInExpression(ast.where, scope, inferredParams);
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
  const inferredParams = new Map();
  if (Array.isArray(ast._paramMapping)) {
    for (let i = 0; i < paramTypes.length; i += 1) {
      if (Number(paramTypes[i]) > 0) inferredParams.set(i, Number(paramTypes[i]));
    }
  }

  let columns = Object.freeze([]);
  let returnsRows = false;
  if (ast.type === AST_TYPE.SELECT) {
    const selectDesc = describeSelectStatement(ast, inferredParams, null, resolveTableSchema);
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
    inferDmlParameters(ast, inferredParams, resolveTableSchema);
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
