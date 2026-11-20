/** Live Query Service - Core service for real-time streaming queries. */
import Database from 'better-sqlite3';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {LoggingService} from '../logging/logging-service.js';
import {resolveDeclaredPrimaryKeyColumns} from '../partition/partition-boundary-representation.js';
import {
  assertCoordinatorStatementAdmitted, assertLiveQueryGroupAdmissible,
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
  LIVE_QUERY_AST_TYPE, LIVE_QUERY_CONFIG_KEY, LIVE_QUERY_CURSOR, LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE, LIVE_QUERY_ERROR_MSG, LIVE_QUERY_LOG_MSG, LIVE_QUERY_OPERATOR,
  LIVE_QUERY_SQL, LIVE_QUERY_SUBSYSTEM,
} from './live-query-constants.js';

const MEMORY_DATABASE = ':memory:';
const DEFAULT_PREDICATE_TABLE = '__live_row';
const DEFAULT_DUMMY_COLUMN = '__row_present';
const ROOT_QUERY_SCOPE = 'root';
const NESTED_QUERY_SCOPE_PREFIX = 'nested:';
const PROP_QUERY = 'query';
const PROP_SUBQUERY = 'subquery';
const RENEWAL_JITTER_FACTOR = 0.7;
const COMMA_SPACE = ', ';
const PLACEHOLDER = '?';
const SQLITE_ERROR_CODE = 'SQLITE_ERROR';
const NODE_TYPE_PARAM = 'param';
const NODE_TYPE_NULL = 'null';
const NODE_TYPE_IS_NULL = 'is_null';
const NODE_TYPE_IS_NOT_NULL = 'is_not_null';
const NODE_TYPE_FUNCTION = 'function';

const COMPLEX_NODE_TYPES = new Set([
  LIVE_QUERY_AST_TYPE.AGGR_FUNC, LIVE_QUERY_AST_TYPE.AGGREGATE,
  PG_EXPR_TYPE.SUBQUERY, PG_EXPR_TYPE.EXISTS,
]);
const CHILD_NODE_KEYS = ['left', 'right', 'operand', 'expression', 'low', 'high', 'pattern', 'escape'];

function resolveTableName(target) {
  if (!target) return null;
  return typeof target === 'string' ? target : (target.name || target.table || null);
}

function resolveTableAlias(target, explicitAlias = null) {
  if (typeof explicitAlias === 'string' && explicitAlias.length > 0) return explicitAlias;
  const candidate = target && typeof target === 'object' ? (target.alias ?? target.as) : null;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function extractPrimaryTable(parsedQuery) {
  return resolveTableName(parsedQuery?.from) ||
    (typeof parsedQuery?.table === 'string' ? parsedQuery.table : null);
}

function makeTableBinding(queryScope, occurrenceIndex, tableName, alias) {
  const normalizedAlias = typeof alias === 'string' && alias.length > 0 ? alias : null;
  const effectiveName = normalizedAlias || tableName;
  return {
    occurrenceId: `${queryScope}:${occurrenceIndex}:${tableName}:${effectiveName}`,
    queryScope, tableName, alias: normalizedAlias, effectiveName,
  };
}

function isSelectAstNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return Boolean(
    node.from || node.table || Array.isArray(node.joins) || Array.isArray(node.ctes) ||
    node.setOperation || String(node.type || '').toUpperCase() === LIVE_QUERY_SQL.SELECT,
  );
}

function collectNestedSelectsFromExpression(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectNestedSelectsFromExpression(item, out);
    return out;
  }
  if (isSelectAstNode(node.query)) out.push(node.query);
  const sub = isSelectAstNode(node.subquery?.query) ? node.subquery.query : node.subquery;
  if (isSelectAstNode(sub)) out.push(sub);
  for (const [key, value] of Object.entries(node)) {
    if (key !== PROP_QUERY && key !== PROP_SUBQUERY && value && typeof value === 'object') {
      collectNestedSelectsFromExpression(value, out);
    }
  }
  return out;
}

function collectDirectNestedSelects(queryNode) {
  const nested = [];
  for (const cte of queryNode.ctes || []) {
    if (isSelectAstNode(cte?.query)) nested.push(cte.query);
  }
  if (isSelectAstNode(queryNode.from?.subquery)) nested.push(queryNode.from.subquery);
  for (const join of queryNode.joins || []) {
    if (isSelectAstNode(join?.table?.subquery)) nested.push(join.table.subquery);
    collectNestedSelectsFromExpression(join?.condition, nested);
  }
  for (const clause of [
    queryNode.columns, queryNode.where, queryNode.groupBy, queryNode.having, queryNode.orderBy,
  ]) {
    collectNestedSelectsFromExpression(clause, nested);
  }
  if (isSelectAstNode(queryNode.setOperation?.right)) nested.push(queryNode.setOperation.right);
  return nested;
}

function visitQueryScopeBindings(queryNode, queryScope, bindings, traversalState) {
  if (!queryNode || typeof queryNode !== 'object') return;
  for (const cte of queryNode.ctes || []) {
    if (typeof cte?.name === 'string' && cte.name.length > 0) {
      traversalState.cteNames.add(cte.name.toLowerCase());
    }
  }
  let occurrenceCount = 0;
  const addBinding = (tableName, alias) => {
    if (typeof tableName === 'string' && tableName &&
        !traversalState.cteNames.has(tableName.toLowerCase())) {
      bindings.push(makeTableBinding(queryScope, occurrenceCount++, tableName, alias));
    }
  };
  const primaryTable = extractPrimaryTable(queryNode);
  if (primaryTable) {
    addBinding(
      primaryTable, resolveTableAlias(queryNode.from, queryNode.alias ?? queryNode.as ?? null),
    );
  }
  for (const join of queryNode.joins || []) {
    addBinding(
      resolveTableName(join?.table),
      resolveTableAlias(join?.table, join?.alias ?? join?.as ?? null),
    );
  }
  for (const nestedQuery of collectDirectNestedSelects(queryNode)) {
    const nestedScope = `${NESTED_QUERY_SCOPE_PREFIX}${traversalState.nextNestedIndex++}`;
    visitQueryScopeBindings(nestedQuery, nestedScope, bindings, traversalState);
  }
}

function extractTableBindings(parsedQuery) {
  if (!parsedQuery || typeof parsedQuery !== 'object') return [];
  const bindings = [];
  visitQueryScopeBindings(parsedQuery, ROOT_QUERY_SCOPE, bindings, {
    nextNestedIndex: 0, cteNames: new Set(),
  });
  return bindings;
}

function extractReferencedTables(parsedQuery) {
  return Array.from(new Set(extractTableBindings(parsedQuery).map((b) => b.tableName)));
}

function resolveIndexedParameter(index, params) {
  if (!Array.isArray(params)) return null;
  if (index >= 0 && index < params.length) return params[index];
  return index - 1 >= 0 && index - 1 < params.length ? params[index - 1] : null;
}

function resolveParameterValue(expr, params = []) {
  if (typeof expr.index === 'number') return resolveIndexedParameter(expr.index, params);
  if (typeof expr.value === 'number' && Array.isArray(params)) {
    const oneBased = params[expr.value - 1];
    return oneBased !== undefined ? oneBased : (params[expr.value] ?? null);
  }
  if (typeof expr.name === 'string' && params && typeof params === 'object') {
    return params[expr.name] !== undefined ? params[expr.name] : null;
  }
  return null;
}

function inferLiteralStorageClass(value) {
  if (value === null || value === undefined) return SQL_STORAGE_CLASS.NULL;
  if (typeof value === 'boolean' || typeof value === 'bigint' || Number.isSafeInteger(value)) {
    return SQL_STORAGE_CLASS.INTEGER;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return SQL_STORAGE_CLASS.REAL;
  if (typeof value === 'string') return SQL_STORAGE_CLASS.TEXT;
  return value instanceof Uint8Array ? SQL_STORAGE_CLASS.BLOB : null;
}

function normalizeNullCheckWhereNode(node) {
  return {
    type: EXPR_TYPE.BINARY,
    operator: node.type === NODE_TYPE_IS_NULL ?
      LIVE_QUERY_OPERATOR.IS_NULL : LIVE_QUERY_OPERATOR.IS_NOT_NULL,
    left: normalizeWhereAstForRenderer(node.expression || node.operand || node.left),
    right: null,
  };
}

function normalizeFunctionWhereNode(node) {
  const rawArgs = Array.isArray(node.args) ? node.args : (node.arg ? [node.arg] : []);
  return {
    ...node, type: PG_EXPR_TYPE.FUNCTION_CALL, name: node.name || node.func,
    args: rawArgs.map(normalizeWhereAstForRenderer),
  };
}

function normalizeSpecialWhereNode(node) {
  if (node.type === EXPR_TYPE.LITERAL) {
    return node.sqlType ? node : {...node, sqlType: inferLiteralStorageClass(node.value)};
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) return node.column ? node : {...node, column: node.name};
  if (node.type === NODE_TYPE_PARAM) return {...node, type: EXPR_TYPE.PARAMETER};
  if (node.type === NODE_TYPE_NULL) {
    return {type: EXPR_TYPE.LITERAL, value: null, sqlType: SQL_STORAGE_CLASS.NULL};
  }
  if (node.type === NODE_TYPE_IS_NULL || node.type === NODE_TYPE_IS_NOT_NULL) {
    return normalizeNullCheckWhereNode(node);
  }
  return node.type === NODE_TYPE_FUNCTION ? normalizeFunctionWhereNode(node) : null;
}

function normalizeWhereAstForRenderer(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(normalizeWhereAstForRenderer);
  const special = normalizeSpecialWhereNode(node);
  if (special !== null) return special;
  const clone = {...node};
  for (const key of CHILD_NODE_KEYS) {
    if (clone[key] && typeof clone[key] === 'object') {
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
  if (typeof column === 'string' && column.length > 0) {
    refs.push({
      table: typeof node.table === 'string' && node.table.length > 0 ? node.table : null,
      column,
    });
  }
  return refs;
}

function collectReferencedColumnRefs(node, refs = []) {
  if (!node || typeof node !== 'object') return refs;
  if (Array.isArray(node)) {
    for (const item of node) collectReferencedColumnRefs(item, refs);
    return refs;
  }
  if (node.type === EXPR_TYPE.COLUMN_REF) return appendColumnRefNode(node, refs);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectReferencedColumnRefs(value, refs);
  }
  return refs;
}

const TABLE_NAME_KEYS = Object.freeze(['tableName', 'table_name']);

function readTableRecordName(record) {
  if (!record || typeof record !== 'object') return null;
  for (const key of TABLE_NAME_KEYS) {
    if (typeof record[key] === 'string' && record[key].length > 0) return record[key];
  }
  return null;
}

function extractSchemaFromTableRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const tableName = readTableRecordName(record);
  if (Array.isArray(record.columns)) return {...record, tableName};
  if (typeof record.schema_definition === 'string') {
    return {...JSON.parse(record.schema_definition), tableName};
  }
  if (typeof record.schema === 'string') return {...JSON.parse(record.schema), tableName};
  if (record.schema !== null && typeof record.schema === 'object') {
    return {...record.schema, tableName: readTableRecordName(record.schema) || tableName};
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
    if (typeof col?.name === 'string' && col.name.length > 0) {
      const def = {name: col.name};
      if (typeof col.type === 'string' && col.type.length > 0) def.type = col.type;
      if (typeof col.collation === 'string' && col.collation.length > 0) {
        def.collation = col.collation;
      }
      targetEntry.columnsByLower.set(col.name.toLowerCase(), def);
    }
  }
}

function resolvePrimaryProbeTableName(options, schemaList, firstRefTable) {
  if (typeof options?.tableName === 'string' && options.tableName.length > 0) {
    return options.tableName;
  }
  const firstSchemaName = schemaList[0]?.tableName;
  return (typeof firstSchemaName === 'string' && firstSchemaName) ||
    firstRefTable || DEFAULT_PREDICATE_TABLE;
}

function inferBindingsFromSchemasAndRefs(options, schemaList, refs) {
  const distinctRefTables = Array.from(new Set(refs.map((r) => r.table).filter(Boolean)));
  if (schemaList.length > 1) {
    if (distinctRefTables.length === 0) {
      return schemaList.filter((s) => s.tableName)
        .map((s, idx) => makeTableBinding(ROOT_QUERY_SCOPE, idx, s.tableName, null));
    }
    return distinctRefTables.map((refTable, idx) => {
      const lowerRef = refTable.toLowerCase();
      const matched = schemaList.find((s) => s.tableName?.toLowerCase() === lowerRef) ||
        schemaList.find((s) => s.tableName?.toLowerCase().startsWith(lowerRef)) ||
        schemaList[idx] || schemaList[0];
      const sourceTable = matched?.tableName || refTable;
      const alias = sourceTable.toLowerCase() === lowerRef ? null : refTable;
      return makeTableBinding(ROOT_QUERY_SCOPE, idx, sourceTable, alias);
    });
  }
  const singleTableName = (schemaList.length === 1 && schemaList[0]?.tableName) ?
    schemaList[0].tableName : (options?.tableName || null);
  if (!singleTableName) return [];
  if (distinctRefTables.length === 0) {
    return [makeTableBinding(ROOT_QUERY_SCOPE, 0, singleTableName, null)];
  }
  return distinctRefTables.map((refTable, idx) => makeTableBinding(
    ROOT_QUERY_SCOPE, idx, singleTableName,
    refTable.toLowerCase() !== singleTableName.toLowerCase() ? refTable : null,
  ));
}

function resolveEffectiveTableBindings(options, schemaList, refs) {
  const rawExplicit = Array.isArray(options?.tableBindings) ?
    options.tableBindings : extractTableBindings(options?.parsedQuery);
  const rootExplicit = rawExplicit.filter(
    (b) => b && (!b.queryScope || b.queryScope === ROOT_QUERY_SCOPE),
  );
  if (rootExplicit.length > 0) {
    return rootExplicit.map((b, idx) =>
      b.occurrenceId ? b : makeTableBinding(ROOT_QUERY_SCOPE, idx, b.tableName, b.alias),
    );
  }
  return rawExplicit.length > 0 ? [] : inferBindingsFromSchemasAndRefs(options, schemaList, refs);
}

function registerUnqualifiedRefColumns(uniqueEntries, primaryEntry, ref) {
  const lowerCol = ref.column.toLowerCase();
  if (uniqueEntries.some((entry) => entry.columnsByLower.has(lowerCol))) return;
  const primarySourceLower = primaryEntry.sourceTableName.toLowerCase();
  for (const entry of uniqueEntries) {
    if (entry === primaryEntry || entry.sourceTableName.toLowerCase() === primarySourceLower) {
      entry.columnsByLower.set(lowerCol, {name: ref.column});
    }
  }
}

function buildProbeTableDefinitions(normalizedWhere, schemas, options = {}) {
  const schemaList = extractSchemaList(schemas);
  const refs = collectReferencedColumnRefs(normalizedWhere);
  const bindings = resolveEffectiveTableBindings(options, schemaList, refs);
  const firstRefTable = refs.find((r) => r.table !== null)?.table || null;
  const primaryBinding = bindings[0] || null;
  const primaryTableName = primaryBinding ?
    (primaryBinding.effectiveName || primaryBinding.alias || primaryBinding.tableName) :
    resolvePrimaryProbeTableName(options, schemaList, firstRefTable);
  const primarySourceName = primaryBinding?.tableName || primaryTableName;
  const uniqueEntries = [];
  const entriesByProbeKey = new Map();
  const entriesBySourceKey = new Map();
  const addSourceMapping = (sourceKey, entry) => {
    const bucket = entriesBySourceKey.get(sourceKey) || [];
    if (!bucket.includes(entry)) bucket.push(entry);
    entriesBySourceKey.set(sourceKey, bucket);
  };
  const ensureTable = (probeName, sourceTableName = probeName, occurrenceId = null) => {
    const probeKey = probeName.toLowerCase();
    const sourceName = sourceTableName || probeName;
    const sourceKey = sourceName.toLowerCase();
    const existing = entriesByProbeKey.get(probeKey);
    if (existing) {
      addSourceMapping(sourceKey, existing);
      return existing;
    }
    const entry = {
      occurrenceId, tableName: probeName, sourceTableName: sourceName, columnsByLower: new Map(),
    };
    uniqueEntries.push(entry);
    entriesByProbeKey.set(probeKey, entry);
    addSourceMapping(sourceKey, entry);
    return entry;
  };
  const primaryEntry = ensureTable(
    primaryTableName, primarySourceName, primaryBinding?.occurrenceId || null,
  );
  for (const b of bindings) {
    ensureTable(b.effectiveName || b.alias || b.tableName, b.tableName, b.occurrenceId || null);
  }
  for (let i = 0; i < schemaList.length; i += 1) {
    const schema = schemaList[i];
    if (!schema.tableName) {
      const target = schemaList.length === uniqueEntries.length ? uniqueEntries[i] : primaryEntry;
      registerSchemaColumns(target, schema.columns);
      continue;
    }
    const schemaKey = schema.tableName.toLowerCase();
    const sourceTargets = entriesBySourceKey.get(schemaKey) || [];
    if (sourceTargets.length > 0) {
      for (const targetEntry of sourceTargets) registerSchemaColumns(targetEntry, schema.columns);
    } else if (bindings.length === 0) {
      registerSchemaColumns(
        entriesByProbeKey.get(schemaKey) || ensureTable(schema.tableName), schema.columns,
      );
    }
  }
  for (const ref of refs) {
    if (!ref.table) {
      registerUnqualifiedRefColumns(uniqueEntries, primaryEntry, ref);
      continue;
    }
    let targetEntry = entriesByProbeKey.get(ref.table.toLowerCase()) || null;
    if (!targetEntry) {
      const singleSchema = schemaList.length === 1 ? schemaList[0] : null;
      const inferredSource = singleSchema?.tableName ? singleSchema.tableName : ref.table;
      targetEntry = ensureTable(ref.table, inferredSource);
      if (singleSchema) registerSchemaColumns(targetEntry, singleSchema.columns);
    }
    const lowerCol = ref.column.toLowerCase();
    if (!targetEntry.columnsByLower.has(lowerCol)) {
      targetEntry.columnsByLower.set(lowerCol, {name: ref.column});
    }
  }
  return uniqueEntries.map((entry) => ({
    ...(entry.occurrenceId ? {occurrenceId: entry.occurrenceId} : {}),
    tableName: entry.tableName, sourceTableName: entry.sourceTableName,
    columns: entry.columnsByLower.size > 0 ?
      Array.from(entry.columnsByLower.values()) : [{name: DEFAULT_DUMMY_COLUMN}],
  }));
}

function normalizeRowCellForSqlite(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'boolean') return val ? 1n : 0n;
  if (typeof val === 'bigint' || typeof val === 'number' || typeof val === 'string') return val;
  return val instanceof Uint8Array ?
    (Buffer.isBuffer(val) ? val : Buffer.from(val.buffer, val.byteOffset, val.byteLength)) : null;
}

function readNestedRowColumn(row, qualifier, colName) {
  if (!qualifier || !row[qualifier] || typeof row[qualifier] !== 'object') {
    return {found: false, value: null};
  }
  const nested = row[qualifier];
  if (Object.hasOwn(nested, colName)) return {found: true, value: nested[colName]};
  const lower = colName.toLowerCase();
  for (const [key, val] of Object.entries(nested)) {
    if (key.toLowerCase() === lower) return {found: true, value: val};
  }
  return {found: false, value: null};
}

function readRowColumnValue(row, tableName, colName, sourceTableName = null) {
  const byProbe = readNestedRowColumn(row, tableName, colName);
  if (byProbe.found) return byProbe.value;
  const bySource = readNestedRowColumn(row, sourceTableName, colName);
  if (bySource.found) return bySource.value;
  if (Object.hasOwn(row, colName)) return row[colName];
  const lower = colName.toLowerCase();
  for (const [key, val] of Object.entries(row)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

function mapPredicateCompileError(error) {
  if (error && typeof error === 'object' && (!error.code || error.code === SQLITE_ERROR_CODE)) {
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    error.errorCode = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
  }
  return error;
}

function hasComplexWhereChildren(node) {
  for (const key of CHILD_NODE_KEYS) {
    if (node[key] && isComplexWhereNode(node[key])) return true;
  }
  return (Array.isArray(node.values) && node.values.some(isComplexWhereNode)) ||
    (Array.isArray(node.args) && node.args.some(isComplexWhereNode));
}

function isComplexWhereNode(node) {
  if (!node || typeof node !== 'object') return false;
  const type = String(node.type || '').toLowerCase();
  return COMPLEX_NODE_TYPES.has(type) ||
    (type === EXPR_TYPE.IN && Boolean(node.subquery)) || hasComplexWhereChildren(node);
}

function createPreparedTableStatements(db, tableDefinitions) {
  return tableDefinitions.map((def) => {
    db.exec(renderTableColumnsSql(def.tableName, {columns: def.columns}));
    const quotedTable = renderSqliteIdentifier(def.tableName);
    const columnNames = def.columns.map((col) => col.name);
    const quotedCols = columnNames.map(renderSqliteIdentifier).join(COMMA_SPACE);
    const placeholders = columnNames.map(() => PLACEHOLDER).join(COMMA_SPACE);
    return {
      tableName: def.tableName, sourceTableName: def.sourceTableName || def.tableName,
      quotedTable, columnNames,
      clearStmt: db.prepare(`DELETE FROM ${quotedTable}`),
      insertStmt: db.prepare(`INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${placeholders})`),
    };
  });
}

function createClosedNoOpPredicate() {
  return Object.assign(() => false, {close: () => {}, closed: true, isOpen: false});
}

function compilePredicate(whereClause, params = [], schemas = null, options = {}) {
  assertLiveQueryPredicateAdmissible(whereClause);
  if (!whereClause) {
    let closed = false;
    const matchAll = () => !closed;
    matchAll.close = () => {
      closed = true;
    };
    return Object.defineProperties(matchAll, {
      closed: {get: () => closed}, isOpen: {get: () => false},
    });
  }
  const normalizedWhere = normalizeWhereAstForRenderer(whereClause);
  const {sql: whereSql, params: boundParams} = renderExpressionWithParameters(
    normalizedWhere, (paramExpr) => resolveParameterValue(paramExpr, params),
  );
  assertCoordinatorStatementAdmitted(`SELECT 1 WHERE ${whereSql}`);
  const typedParams = decodeTypedParams(encodeTypedParams(boundParams));
  if (isComplexWhereNode(normalizedWhere)) return createClosedNoOpPredicate();

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
    if (!row || typeof row !== 'object' || !db.open) return false;
    for (const runner of tableRunners) {
      const rowValues = runner.columnNames.map((colName) => normalizeRowCellForSqlite(
        readRowColumnValue(row, runner.tableName, colName, runner.sourceTableName),
      ));
      runner.clearStmt.run();
      runner.insertStmt.run(...rowValues);
    }
    const matched = selectStmt.get(...typedParams);
    return matched === 1 || matched === 1n;
  };
  evaluateRow.close = () => {
    if (db.open) db.close();
  };
  return Object.defineProperties(evaluateRow, {
    closed: {get: () => !db.open}, isOpen: {get: () => Boolean(db.open)},
  });
}

function extractPartitionKeyValue(whereClause, partitionKeyColumn) {
  return (!whereClause || !partitionKeyColumn) ?
    null : findPartitionKeyValue(whereClause, partitionKeyColumn.toLowerCase());
}

function findEqualityKeyValue(left, right, keyColumn) {
  if (isPartitionKeyColumn(left, keyColumn) && right?.type === LIVE_QUERY_AST_TYPE.LITERAL) {
    return right.value;
  }
  return isPartitionKeyColumn(right, keyColumn) && left?.type === LIVE_QUERY_AST_TYPE.LITERAL ?
    left.value : null;
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
      findEqualityKeyValue(left, right, keyColumn) : null;
  }
  return (expr.type === LIVE_QUERY_AST_TYPE.IN &&
    isPartitionKeyColumn(expr.expression, keyColumn) &&
    Array.isArray(expr.values)) ?
    expr.values.filter((v) => v.type === LIVE_QUERY_AST_TYPE.LITERAL).map((v) => v.value) : null;
}

function isPartitionKeyColumn(expr, keyColumn) {
  return Boolean(expr && expr.type === LIVE_QUERY_AST_TYPE.COLUMN_REF) &&
    (expr.column || expr.name || '').toLowerCase() === keyColumn;
}

function canonicalizePredicate(whereClause) {
  return whereClause ?
    JSON.stringify(sortObject(whereClause)) : LIVE_QUERY_DEFAULT_VALUE.EMPTY_WHERE;
}

function sortObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = sortObject(obj[key]);
  return sorted;
}

function parseLiveSelect(sql) {
  if (!sql || typeof sql !== 'string') throw new Error(LIVE_QUERY_ERROR_MSG.INVALID_SQL);
  const trimmed = sql.trim();
  if (!trimmed.toUpperCase().startsWith(LIVE_QUERY_SQL.LIVE_PREFIX)) {
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
  return config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) || LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS;
}

function buildLiveQueryServiceTableLookup(systemCache) {
  if (!systemCache) return null;
  const resolver = new PartitionResolver({systemCache});
  return (tableName) => {
    const info = resolver.getTableInfo(tableName);
    return info ? {...info, tableName: readTableRecordName(info) || tableName} : null;
  };
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
        this.partitionKeyColumn = resolveDeclaredPrimaryKeyColumns(tableInfo)[0] || null;
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }
    return null;
  }

  extractPartitionKeyValue() {
    if (this.partitionKeyValue === null) {
      this.partitionKeyValue = extractPartitionKeyValue(
        this.whereClause, this.getPartitionKeyColumn(),
      );
    }
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
      queryId: this.queryId, expiresAt: this.lastRenewal + this.ttlMs,
      renewBefore: this.lastRenewal + Math.floor(this.ttlMs * RENEWAL_JITTER_FACTOR),
    };
  }

  isExpired() {
    return Date.now() > this.lastRenewal + this.ttlMs;
  }

  getMetadata() {
    return {
      queryId: this.queryId, table: this.table, partitionKeyValue: this.partitionKeyValue,
      subscribedPartitions: Array.from(this.subscribedPartitions), ttlMs: this.ttlMs,
      lastRenewal: this.lastRenewal, lastSeenHLC: this.lastSeenHLC, createdAt: this.createdAt,
      active: this.active,
    };
  }

  getQuerySignature() {
    return `${this.table}${LIVE_QUERY_CURSOR.SEPARATOR}${canonicalizePredicate(this.whereClause)}`;
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
    this.logger.debug(LIVE_QUERY_LOG_MSG.CLEANED_UP, {queryId: this.queryId, table: this.table});
  }
}

export {
  LiveQueryService, buildProbeTableDefinitions, canonicalizePredicate, compilePredicate,
  createClosedNoOpPredicate, extractPartitionKeyValue, extractReferencedTables,
  extractTableBindings, isComplexWhereNode, normalizeWhereAstForRenderer, parseLiveSelect,
  sortObject,
};
