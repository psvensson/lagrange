/**
 * Live Query Service - Core service for real-time streaming queries.
 * Parses LIVE SELECT statements, extracts partition keys, and compiles
 * SQLite-backed WHERE predicates over CDC row images (design
 * coordinator-sqlite-merge §2.11, WP7).
 *
 * @module live-query/live-query-service
 */

import Database from 'better-sqlite3';
import {v4 as uuidv4} from 'uuid';

import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {resolveDeclaredPrimaryKeyColumns} from '../partition/partition-boundary-representation.js';
import {
  assertCoordinatorStatementAdmitted,
  assertLiveQueryGroupAdmissible,
  assertLiveQueryPredicateAdmissible,
} from '../query/coordinator-sql-admission.js';
import {EXPR_TYPE, SQL_STORAGE_CLASS} from '../query/parser-constants.js';
import {PartitionResolver} from '../query/partition-resolver.js';
import {PG_EXPR_TYPE} from '../query/pg/pg-compat-constants.js';
import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {renderExpressionWithParameters} from '../query/sql-statement-renderer.js';
import {renderTableColumnsSql} from '../query/sql-table-definition.js';
import {decodeTypedParams, encodeTypedParams} from '../query/sql-value-codec.js';
import {renderSqliteIdentifier} from '../query/sqlite-identifier.js';
import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_SQL,
  LIVE_QUERY_SUBSYSTEM,
} from './live-query-constants.js';

const MEMORY_DATABASE = ':memory:';
const DEFAULT_PREDICATE_TABLE = '__live_row';
const DEFAULT_DUMMY_COLUMN = '__row_present';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_BIGINT = 'bigint';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_NUM_ZERO_POINT_SEVEN = 0.7;
const COMMA_SPACE = ', ';
const PLACEHOLDER = '?';
const SQLITE_ERROR_CODE = 'SQLITE_ERROR';
const NODE_TYPE_PARAM = 'param';
const NODE_TYPE_NULL = 'null';
const NODE_TYPE_IS_NULL = 'is_null';
const NODE_TYPE_IS_NOT_NULL = 'is_not_null';
const NODE_TYPE_FUNCTION = 'function';

const COMPLEX_NODE_TYPES = new Set([
  LIVE_QUERY_AST_TYPE.AGGR_FUNC,
  LIVE_QUERY_AST_TYPE.AGGREGATE,
  PG_EXPR_TYPE.SUBQUERY,
  PG_EXPR_TYPE.EXISTS,
]);

const CHILD_NODE_KEYS = [
  'left', 'right', 'operand', 'expression', 'low', 'high', 'pattern', 'escape',
];

function resolveTableName(target) {
  if (!target) return null;
  return typeof target === LOCAL_STR_STRING ? target : (target.name || target.table || null);
}

function resolveTableAlias(target, explicitAlias = null) {
  if (typeof explicitAlias === LOCAL_STR_STRING && explicitAlias.length > 0) {
    return explicitAlias;
  }
  if (!target || typeof target !== LOCAL_STR_OBJECT) return null;
  const candidate = target.alias ?? target.as ?? null;
  return typeof candidate === LOCAL_STR_STRING && candidate.length > 0 ? candidate : null;
}

function extractPrimaryTable(parsedQuery) {
  const fromTarget = resolveTableName(parsedQuery?.from);
  if (fromTarget) return fromTarget;
  return typeof parsedQuery?.table === LOCAL_STR_STRING ? parsedQuery.table : null;
}

function extractTableBindings(parsedQuery) {
  if (!parsedQuery || typeof parsedQuery !== LOCAL_STR_OBJECT) return [];
  const bindings = [];
  const seen = new Set();
  const addBinding = (tableName, alias) => {
    if (typeof tableName !== LOCAL_STR_STRING || tableName.length === 0) return;
    const normalizedAlias = typeof alias === LOCAL_STR_STRING && alias.length > 0 ?
      alias :
      null;
    const key = `${tableName.toLowerCase()}:${(normalizedAlias || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    bindings.push({tableName, alias: normalizedAlias});
  };
  const primaryTable = extractPrimaryTable(parsedQuery);
  if (primaryTable) {
    addBinding(
      primaryTable,
      resolveTableAlias(parsedQuery.from, parsedQuery.alias ?? parsedQuery.as ?? null),
    );
  }
  if (Array.isArray(parsedQuery.joins)) {
    for (const join of parsedQuery.joins) {
      const joinTable = resolveTableName(join?.table);
      addBinding(joinTable, resolveTableAlias(join?.table, join?.alias ?? join?.as ?? null));
    }
  }
  return bindings;
}

function extractReferencedTables(parsedQuery) {
  const tables = new Set();
  for (const binding of extractTableBindings(parsedQuery)) {
    tables.add(binding.tableName);
  }
  return Array.from(tables);
}

function resolveIndexedParameter(index, params) {
  if (!Array.isArray(params)) return null;
  if (index >= 0 && index < params.length) return params[index];
  if (index - 1 >= 0 && index - 1 < params.length) return params[index - 1];
  return null;
}

function resolveParameterValue(expr, params = []) {
  if (typeof expr.index === LOCAL_STR_NUMBER) {
    return resolveIndexedParameter(expr.index, params);
  }
  if (typeof expr.value === LOCAL_STR_NUMBER && Array.isArray(params)) {
    const oneBased = params[expr.value - 1];
    return oneBased !== undefined ? oneBased : (params[expr.value] ?? null);
  }
  if (typeof expr.name === LOCAL_STR_STRING && params && typeof params === LOCAL_STR_OBJECT) {
    return params[expr.name] !== undefined ? params[expr.name] : null;
  }
  return null;
}

function inferLiteralStorageClass(value) {
  if (value === null || value === undefined) return SQL_STORAGE_CLASS.NULL;
  if (
    typeof value === LOCAL_STR_BOOLEAN ||
    typeof value === LOCAL_STR_BIGINT ||
    Number.isSafeInteger(value)
  ) {
    return SQL_STORAGE_CLASS.INTEGER;
  }
  if (typeof value === LOCAL_STR_NUMBER && Number.isFinite(value)) {
    return SQL_STORAGE_CLASS.REAL;
  }
  if (typeof value === LOCAL_STR_STRING) return SQL_STORAGE_CLASS.TEXT;
  return value instanceof Uint8Array ? SQL_STORAGE_CLASS.BLOB : null;
}

function normalizeNullCheckWhereNode(node) {
  return {
    type: EXPR_TYPE.BINARY,
    operator: node.type === NODE_TYPE_IS_NULL ?
      LIVE_QUERY_OPERATOR.IS_NULL :
      LIVE_QUERY_OPERATOR.IS_NOT_NULL,
    left: normalizeWhereAstForRenderer(node.expression || node.operand || node.left),
    right: null,
  };
}

function normalizeFunctionWhereNode(node) {
  const rawArgs = Array.isArray(node.args) ?
    node.args :
    (node.arg ? [node.arg] : []);
  return {
    ...node,
    type: PG_EXPR_TYPE.FUNCTION_CALL,
    name: node.name || node.func,
    args: rawArgs.map(normalizeWhereAstForRenderer),
  };
}

function normalizeSpecialWhereNode(node) {
  if (node.type === EXPR_TYPE.LITERAL) {
    return node.sqlType ? node : {...node, sqlType: inferLiteralStorageClass(node.value)};
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) {
    return node.column ? node : {...node, column: node.name};
  }
  if (node.type === NODE_TYPE_PARAM) return {...node, type: EXPR_TYPE.PARAMETER};
  if (node.type === NODE_TYPE_NULL) {
    return {type: EXPR_TYPE.LITERAL, value: null, sqlType: SQL_STORAGE_CLASS.NULL};
  }
  if (node.type === NODE_TYPE_IS_NULL || node.type === NODE_TYPE_IS_NOT_NULL) {
    return normalizeNullCheckWhereNode(node);
  }
  if (node.type === NODE_TYPE_FUNCTION) {
    return normalizeFunctionWhereNode(node);
  }
  return null;
}

function normalizeWhereAstForRenderer(node) {
  if (!node || typeof node !== LOCAL_STR_OBJECT) return node;
  if (Array.isArray(node)) return node.map(normalizeWhereAstForRenderer);
  const special = normalizeSpecialWhereNode(node);
  if (special !== null) return special;
  const clone = {...node};
  for (const key of CHILD_NODE_KEYS) {
    if (clone[key] && typeof clone[key] === LOCAL_STR_OBJECT) {
      clone[key] = normalizeWhereAstForRenderer(clone[key]);
    }
  }
  if (Array.isArray(clone.values)) clone.values = clone.values.map(normalizeWhereAstForRenderer);
  if (Array.isArray(clone.args)) clone.args = clone.args.map(normalizeWhereAstForRenderer);
  if (Array.isArray(clone.conditions)) {
    clone.conditions = clone.conditions.map((cond) => ({
      ...cond,
      when: normalizeWhereAstForRenderer(cond.when),
      thenExpression: normalizeWhereAstForRenderer(cond.thenExpression),
    }));
  }
  if (clone.elseExpr) clone.elseExpr = normalizeWhereAstForRenderer(clone.elseExpr);
  return clone;
}

function appendColumnRefNode(node, refs) {
  const column = node.column || node.name;
  if (typeof column === LOCAL_STR_STRING && column.length > 0) {
    const table = typeof node.table === LOCAL_STR_STRING && node.table.length > 0 ?
      node.table :
      null;
    refs.push({table, column});
  }
  return refs;
}

function collectReferencedColumnRefs(node, refs = []) {
  if (!node || typeof node !== LOCAL_STR_OBJECT) return refs;
  if (Array.isArray(node)) {
    for (const item of node) collectReferencedColumnRefs(item, refs);
    return refs;
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) {
    return appendColumnRefNode(node, refs);
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === LOCAL_STR_OBJECT) collectReferencedColumnRefs(value, refs);
  }
  return refs;
}

const TABLE_NAME_KEYS = Object.freeze(['tableName', 'table_name']);

function readTableRecordName(record) {
  if (!record || typeof record !== LOCAL_STR_OBJECT) return null;
  for (const key of TABLE_NAME_KEYS) {
    if (typeof record[key] === LOCAL_STR_STRING && record[key].length > 0) {
      return record[key];
    }
  }
  return null;
}

function extractSchemaFromTableRecord(record) {
  if (!record || typeof record !== LOCAL_STR_OBJECT) return null;
  const tableName = readTableRecordName(record);
  if (Array.isArray(record.columns)) return {...record, tableName};
  if (typeof record.schema_definition === LOCAL_STR_STRING) {
    return {...JSON.parse(record.schema_definition), tableName};
  }
  if (typeof record.schema === LOCAL_STR_STRING) {
    return {...JSON.parse(record.schema), tableName};
  }
  if (record.schema !== null && typeof record.schema === LOCAL_STR_OBJECT) {
    const schemaName = readTableRecordName(record.schema);
    return {...record.schema, tableName: schemaName || tableName};
  }
  return tableName ? {tableName, columns: []} : null;
}

function extractSchemaList(schemasOrSchema) {
  if (!schemasOrSchema) return [];
  const rawList = Array.isArray(schemasOrSchema) ? schemasOrSchema : [schemasOrSchema];
  return rawList.map(extractSchemaFromTableRecord).filter(Boolean);
}

function registerSchemaColumns(targetEntry, columns) {
  for (const col of columns || []) {
    if (typeof col?.name === LOCAL_STR_STRING && col.name.length > 0) {
      targetEntry.columnsByLower.set(col.name.toLowerCase(), {
        name: col.name,
        ...(typeof col.type === LOCAL_STR_STRING && col.type.length > 0 ? {type: col.type} : {}),
        ...(typeof col.collation === LOCAL_STR_STRING && col.collation.length > 0 ?
          {collation: col.collation} :
          {}),
      });
    }
  }
}

function resolvePrimaryProbeTableName(options, schemaList, firstRefTable) {
  if (typeof options?.tableName === LOCAL_STR_STRING && options.tableName.length > 0) {
    return options.tableName;
  }
  const firstSchemaName = schemaList[0]?.tableName;
  if (typeof firstSchemaName === LOCAL_STR_STRING && firstSchemaName.length > 0) {
    return firstSchemaName;
  }
  return firstRefTable || DEFAULT_PREDICATE_TABLE;
}

function resolveEffectiveTableBindings(options, schemaList, refs) {
  const explicit = Array.isArray(options?.tableBindings) ?
    options.tableBindings :
    extractTableBindings(options?.parsedQuery);
  if (explicit.length > 0) return explicit;
  let singleTableName = options?.tableName || null;
  if (schemaList.length === 1 && schemaList[0]?.tableName) {
    singleTableName = schemaList[0].tableName;
  }
  if (!singleTableName) return [];
  const distinctRefTables = Array.from(
    new Set(refs.map((r) => r.table).filter(Boolean)),
  );
  const singleRef = distinctRefTables.length === 1 ? distinctRefTables[0] : null;
  const alias = singleRef && singleRef.toLowerCase() !== singleTableName.toLowerCase() ?
    singleRef :
    null;
  return [{tableName: singleTableName, alias}];
}

function buildProbeTableDefinitions(normalizedWhere, schemas, options = {}) {
  const schemaList = extractSchemaList(schemas);
  const refs = collectReferencedColumnRefs(normalizedWhere);
  const bindings = resolveEffectiveTableBindings(options, schemaList, refs);
  const firstRefTable = refs.find((r) => r.table !== null)?.table || null;
  const primaryBinding = bindings[0] || null;
  const primaryTableName = primaryBinding ?
    (primaryBinding.alias || primaryBinding.tableName) :
    resolvePrimaryProbeTableName(options, schemaList, firstRefTable);
  const primarySourceName = primaryBinding?.tableName || primaryTableName;

  const uniqueEntries = [];
  const entriesByName = new Map();
  const ensureTable = (probeName, sourceTableName = probeName) => {
    const probeKey = probeName.toLowerCase();
    const sourceKey = (sourceTableName || probeName).toLowerCase();
    const existing = entriesByName.get(probeKey) || entriesByName.get(sourceKey);
    if (existing) {
      entriesByName.set(probeKey, existing);
      entriesByName.set(sourceKey, existing);
      return existing;
    }
    const entry = {
      tableName: probeName,
      sourceTableName: sourceTableName || probeName,
      columnsByLower: new Map(),
    };
    uniqueEntries.push(entry);
    entriesByName.set(probeKey, entry);
    entriesByName.set(sourceKey, entry);
    return entry;
  };

  const primaryEntry = ensureTable(primaryTableName, primarySourceName);
  for (const binding of bindings) {
    ensureTable(binding.alias || binding.tableName, binding.tableName);
  }
  for (const schema of schemaList) {
    const targetEntry = schema.tableName ?
      (entriesByName.get(schema.tableName.toLowerCase()) || ensureTable(schema.tableName)) :
      primaryEntry;
    registerSchemaColumns(targetEntry, schema.columns);
  }
  for (const ref of refs) {
    const targetEntry = ref.table ?
      (entriesByName.get(ref.table.toLowerCase()) || ensureTable(ref.table)) :
      primaryEntry;
    const lowerCol = ref.column.toLowerCase();
    if (!targetEntry.columnsByLower.has(lowerCol)) {
      targetEntry.columnsByLower.set(lowerCol, {name: ref.column});
    }
  }
  return uniqueEntries.map((entry) => ({
    tableName: entry.tableName,
    sourceTableName: entry.sourceTableName,
    columns: entry.columnsByLower.size > 0 ?
      Array.from(entry.columnsByLower.values()) :
      [{name: DEFAULT_DUMMY_COLUMN}],
  }));
}

function normalizeRowCellForSqlite(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === LOCAL_STR_BOOLEAN) return val ? 1n : 0n;
  if (
    typeof val === LOCAL_STR_BIGINT ||
    typeof val === LOCAL_STR_NUMBER ||
    typeof val === LOCAL_STR_STRING
  ) {
    return val;
  }
  if (val instanceof Uint8Array) {
    return Buffer.isBuffer(val) ? val : Buffer.from(val.buffer, val.byteOffset, val.byteLength);
  }
  return null;
}

function readNestedRowColumn(row, qualifier, colName) {
  if (
    qualifier &&
    row[qualifier] &&
    typeof row[qualifier] === LOCAL_STR_OBJECT &&
    Object.hasOwn(row[qualifier], colName)
  ) {
    return {found: true, value: row[qualifier][colName]};
  }
  return {found: false, value: null};
}

function readRowColumnValue(row, tableName, colName, sourceTableName = null) {
  if (Object.hasOwn(row, colName)) return row[colName];
  const byProbe = readNestedRowColumn(row, tableName, colName);
  if (byProbe.found) return byProbe.value;
  const bySource = readNestedRowColumn(row, sourceTableName, colName);
  if (bySource.found) return bySource.value;
  const lower = colName.toLowerCase();
  for (const [key, val] of Object.entries(row)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

function mapPredicateCompileError(error) {
  if (
    error &&
    typeof error === LOCAL_STR_OBJECT &&
    (!error.code || error.code === SQLITE_ERROR_CODE)
  ) {
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    error.errorCode = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  }
  return error;
}

function hasComplexWhereChildren(node) {
  for (const key of CHILD_NODE_KEYS) {
    if (node[key] && isComplexWhereNode(node[key])) return true;
  }
  if (Array.isArray(node.values) && node.values.some(isComplexWhereNode)) return true;
  return Array.isArray(node.args) && node.args.some(isComplexWhereNode);
}

function isComplexWhereNode(node) {
  if (!node || typeof node !== LOCAL_STR_OBJECT) return false;
  const type = String(node.type || '').toLowerCase();
  if (COMPLEX_NODE_TYPES.has(type)) return true;
  if (type === EXPR_TYPE.IN && Boolean(node.subquery)) return true;
  return hasComplexWhereChildren(node);
}

function createPreparedTableStatements(db, tableDefinitions) {
  return tableDefinitions.map((def) => {
    db.exec(renderTableColumnsSql(def.tableName, {columns: def.columns}));
    const quotedTable = renderSqliteIdentifier(def.tableName);
    const columnNames = def.columns.map((col) => col.name);
    const quotedCols = columnNames.map(renderSqliteIdentifier).join(COMMA_SPACE);
    const placeholders = columnNames.map(() => PLACEHOLDER).join(COMMA_SPACE);
    return {
      tableName: def.tableName,
      sourceTableName: def.sourceTableName || def.tableName,
      quotedTable,
      columnNames,
      clearStmt: db.prepare(`DELETE FROM ${quotedTable}`),
      insertStmt: db.prepare(
        `INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${placeholders})`,
      ),
    };
  });
}

function compilePredicate(whereClause, params = [], schemas = null, options = {}) {
  assertLiveQueryPredicateAdmissible(whereClause);
  if (!whereClause) {
    const matchAll = () => true;
    matchAll.close = () => {};
    return matchAll;
  }

  const normalizedWhere = normalizeWhereAstForRenderer(whereClause);
  const {sql: whereSql, params: boundParams} = renderExpressionWithParameters(
    normalizedWhere,
    (paramExpr) => resolveParameterValue(paramExpr, params),
  );
  assertCoordinatorStatementAdmitted(`SELECT 1 WHERE ${whereSql}`);
  const typedParams = decodeTypedParams(encodeTypedParams(boundParams));

  if (isComplexWhereNode(normalizedWhere)) {
    const complexPredicate = () => false;
    complexPredicate.close = () => {};
    return complexPredicate;
  }

  const tableDefinitions = buildProbeTableDefinitions(normalizedWhere, schemas, options);
  const db = new Database(MEMORY_DATABASE);
  let tableRunners;
  let selectStmt;
  try {
    db.defaultSafeIntegers(true);
    tableRunners = createPreparedTableStatements(db, tableDefinitions);
    const fromTables = tableRunners.map((runner) => runner.quotedTable).join(COMMA_SPACE);
    selectStmt = db.prepare(`SELECT 1 FROM ${fromTables} WHERE ${whereSql} LIMIT 1`).pluck(true);
  } catch (error) {
    db.close();
    throw mapPredicateCompileError(error);
  }

  const evaluateRow = (row) => {
    if (!row || typeof row !== LOCAL_STR_OBJECT || !db.open) return false;
    for (const runner of tableRunners) {
      const rowValues = runner.columnNames.map((colName) =>
        normalizeRowCellForSqlite(
          readRowColumnValue(row, runner.tableName, colName, runner.sourceTableName),
        ),
      );
      runner.clearStmt.run();
      runner.insertStmt.run(...rowValues);
    }
    const matched = selectStmt.get(...typedParams);
    return matched === 1 || matched === 1n;
  };
  evaluateRow.close = () => {
    if (db.open) db.close();
  };
  return evaluateRow;
}

function extractPartitionKeyValue(whereClause, partitionKeyColumn) {
  if (!whereClause || !partitionKeyColumn) return null;
  return findPartitionKeyValue(whereClause, partitionKeyColumn.toLowerCase());
}

function findEqualityKeyValue(left, right, keyColumn) {
  if (isPartitionKeyColumn(left, keyColumn) && right?.type === LIVE_QUERY_AST_TYPE.LITERAL) {
    return right.value;
  }
  if (isPartitionKeyColumn(right, keyColumn) && left?.type === LIVE_QUERY_AST_TYPE.LITERAL) {
    return left.value;
  }
  return null;
}

function findPartitionKeyValue(expr, keyColumn) {
  if (!expr) return null;
  if (expr.type === LIVE_QUERY_AST_TYPE.BINARY) {
    const {operator, left, right} = expr;
    if (operator === LIVE_QUERY_OPERATOR.AND) {
      const leftValue = findPartitionKeyValue(left, keyColumn);
      return leftValue !== null ? leftValue : findPartitionKeyValue(right, keyColumn);
    }
    return operator === LIVE_QUERY_OPERATOR.EQUALS ?
      findEqualityKeyValue(left, right, keyColumn) :
      null;
  }
  if (
    expr.type === LIVE_QUERY_AST_TYPE.IN &&
    isPartitionKeyColumn(expr.expression, keyColumn) &&
    Array.isArray(expr.values)
  ) {
    return expr.values
      .filter((v) => v.type === LIVE_QUERY_AST_TYPE.LITERAL)
      .map((v) => v.value);
  }
  return null;
}

function isPartitionKeyColumn(expr, keyColumn) {
  if (!expr || expr.type !== LIVE_QUERY_AST_TYPE.COLUMN_REF) return false;
  return (expr.column || expr.name || '').toLowerCase() === keyColumn;
}

function canonicalizePredicate(whereClause) {
  if (!whereClause) return LIVE_QUERY_DEFAULT_VALUE.EMPTY_WHERE;
  return JSON.stringify(sortObject(whereClause));
}

function sortObject(obj) {
  if (obj === null || typeof obj !== LOCAL_STR_OBJECT) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObject(obj[key]);
  }
  return sorted;
}

function parseLiveSelect(sql) {
  if (!sql || typeof sql !== LOCAL_STR_STRING) {
    throw new Error(LIVE_QUERY_ERROR_MSG.INVALID_SQL);
  }
  const trimmed = sql.trim();
  const upperSql = trimmed.toUpperCase();
  if (!upperSql.startsWith(LIVE_QUERY_SQL.LIVE_PREFIX)) {
    return {isLive: false, sql: trimmed};
  }
  const selectSql = trimmed.substring(LIVE_QUERY_SQL.LIVE_PREFIX.length).trim();
  if (!selectSql.toUpperCase().startsWith(LIVE_QUERY_SQL.SELECT_PREFIX)) {
    throw new Error(LIVE_QUERY_ERROR_MSG.LIVE_REQUIRES_SELECT);
  }
  return {isLive: true, sql: selectSql};
}

function resolveLiveQueryPrimaryTable(tables, parsedQuery) {
  return tables.length > 0 ? tables[0] : (parsedQuery?.from?.name || null);
}

function resolveLiveQueryTtlMs(config) {
  return config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) ||
    LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS;
}

function buildLiveQueryServiceTableLookup(systemCache) {
  if (!systemCache) return null;
  const resolver = new PartitionResolver({systemCache});
  return (tableName) => resolver.getTableInfo(tableName);
}

class LiveQueryService {
  constructor(options = {}) {
    this.queryId = uuidv4();
    this.parsedQuery = options.parsedQuery ?? null;
    this.client = options.client ?? null;
    this.systemCache = options.systemCache ?? null;
    this.nodeId = options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN;

    this.tables = extractReferencedTables(this.parsedQuery);
    this.table = resolveLiveQueryPrimaryTable(this.tables, this.parsedQuery);

    this.params = options.params || [];
    this.whereClause = this.parsedQuery?.where ?? null;
    const tableLookup = buildLiveQueryServiceTableLookup(this.systemCache);
    assertLiveQueryGroupAdmissible(this.parsedQuery);
    const schemas = tableLookup ? this.tables.map(tableLookup).filter(Boolean) : null;
    this.predicate = compilePredicate(this.whereClause, this.params, schemas, {
      tableName: this.table,
      tableBindings: extractTableBindings(this.parsedQuery),
      parsedQuery: this.parsedQuery,
    });

    this.partitionKeyValue = null;
    this.partitionKeyColumn = null;
    this.subscribedPartitions = new Set();

    this.config = ConfigurationManager.getInstance();
    this.ttlMs = resolveLiveQueryTtlMs(this.config);
    this.lastRenewal = Date.now();
    this.lastSeenHLC = null;
    this.createdAt = Date.now();

    this.active = false;
    this.cleanedUp = false;
    this.logger = this.initLogger();
  }

  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.LIVE_QUERY_SERVICE);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  getPartitionKeyColumn() {
    if (this.partitionKeyColumn) return this.partitionKeyColumn;
    if (!this.systemCache || !this.table) return null;
    try {
      const tableInfo = this.systemCache.get(TABLES.TABLES, this.table) ||
        this.systemCache.find(TABLES.TABLES, (t) =>
          t.table_name === this.table || t.tableName === this.table,
        );
      if (tableInfo) {
        const keyColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
        this.partitionKeyColumn = keyColumns[0] || null;
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }
    return null;
  }

  extractPartitionKeyValue() {
    if (this.partitionKeyValue !== null) return this.partitionKeyValue;
    const keyColumn = this.getPartitionKeyColumn();
    this.partitionKeyValue = extractPartitionKeyValue(this.whereClause, keyColumn);
    return this.partitionKeyValue;
  }

  evaluatePredicate(row) {
    return this.predicate(row);
  }

  renew(cursor) {
    this.lastRenewal = Date.now();
    if (cursor) this.lastSeenHLC = cursor;
    this.logger.debug(LIVE_QUERY_LOG_MSG.RENEWED, {queryId: this.queryId, cursor});
    return {
      queryId: this.queryId,
      expiresAt: this.lastRenewal + this.ttlMs,
      renewBefore: this.lastRenewal + Math.floor(this.ttlMs * LOCAL_NUM_ZERO_POINT_SEVEN),
    };
  }

  isExpired() {
    return Date.now() > this.lastRenewal + this.ttlMs;
  }

  getMetadata() {
    return {
      queryId: this.queryId,
      table: this.table,
      partitionKeyValue: this.partitionKeyValue,
      subscribedPartitions: Array.from(this.subscribedPartitions),
      ttlMs: this.ttlMs,
      lastRenewal: this.lastRenewal,
      lastSeenHLC: this.lastSeenHLC,
      createdAt: this.createdAt,
      active: this.active,
    };
  }

  getQuerySignature() {
    return `${this.table}${LIVE_QUERY_CURSOR.SEPARATOR}` +
      `${canonicalizePredicate(this.whereClause)}`;
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
  }

  cleanup() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.active = false;
    this.subscribedPartitions.clear();
    this.predicate?.close?.();
    this.logger.debug(LIVE_QUERY_LOG_MSG.CLEANED_UP, {
      queryId: this.queryId,
      table: this.table,
    });
  }
}

export {
  LiveQueryService,
  canonicalizePredicate,
  compilePredicate,
  extractPartitionKeyValue,
  extractReferencedTables,
  extractTableBindings,
  isComplexWhereNode,
  normalizeWhereAstForRenderer,
  parseLiveSelect,
  sortObject,
};
