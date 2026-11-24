/**
 * Helper utilities and extracted functions for Live Query Group.
 *
 * Uses the single canonical SQL statement renderer (`renderSelect` in
 * `src/query/sql-statement-renderer.js`) and in-memory SQLite predicate
 * evaluation (`compilePredicate` in `src/live-query/live-query-service.js`).
 *
 * @module live-query/live-query-group-helpers
 */

import {v4 as uuidv4} from 'uuid';

import {
  assertLiveQueryGroupAdmissible,
  assertLiveQueryPredicateAdmissible,
} from '../query/coordinator-sql-admission.js';
import {EXPR_TYPE} from '../query/parser-constants.js';
import {PG_EXPR_TYPE} from '../query/pg/pg-compat-constants.js';
import {renderSelect} from '../query/sql-statement-renderer.js';
import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_GROUP_STATE,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATION,
} from './live-query-constants.js';
import {
  compilePredicate,
  createClosedNoOpPredicate,
  extractReferencedTables,
  extractTableBindings,
  isComplexWhereNode,
  normalizeWhereAstForRenderer,
} from './live-query-service.js';

const LOCAL_NUM_ZERO_POINT_SEVEN = 0.7;
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NORMAL = 'NORMAL';
const DEFAULT_JOIN_TYPE = 'INNER';
const DEFAULT_ORDER_DIRECTION = 'ASC';
const WILDCARD_COLUMN = '*';

const AGGREGATE_FUNCTIONS = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'GROUP_CONCAT',
  'TOTAL',
  'STRING_AGG',
  'JSON_GROUP_ARRAY',
  'JSON_GROUP_OBJECT',
]);

function isAggregateExpression(expr) {
  if (!expr || typeof expr !== LOCAL_STR_OBJECT) {
    return false;
  }
  if (
    expr.type === LIVE_QUERY_AST_TYPE.AGGR_FUNC ||
    expr.type === LIVE_QUERY_AST_TYPE.AGGREGATE ||
    expr.type === EXPR_TYPE.AGGREGATE
  ) {
    return true;
  }
  if (
    expr.type === LIVE_QUERY_AST_TYPE.FUNCTION ||
    expr.type === PG_EXPR_TYPE.FUNCTION_CALL
  ) {
    const fnName = String(expr.name || expr.func || '').toUpperCase();
    return AGGREGATE_FUNCTIONS.has(fnName);
  }
  return false;
}

function hasAggregateColumn(columns) {
  if (!Array.isArray(columns)) {
    return false;
  }
  for (const col of columns) {
    const expr = col?.expression || col;
    if (isAggregateExpression(expr)) {
      return true;
    }
  }
  return false;
}

function hasNonEmptyList(list) {
  return Array.isArray(list) && list.length > 0;
}

function hasComplexClause(parsedQuery) {
  if (
    hasNonEmptyList(parsedQuery.joins) ||
    hasNonEmptyList(parsedQuery.groupBy) ||
    hasNonEmptyList(parsedQuery.orderBy) ||
    hasNonEmptyList(parsedQuery.ctes)
  ) {
    return true;
  }
  if (parsedQuery.having || parsedQuery.distinct || parsedQuery.limit) {
    return true;
  }
  if (parsedQuery.setOperation) {
    return true;
  }
  return Boolean(parsedQuery.from?.subquery);
}

/**
 * Check if a query requires Tier 2 full re-execution rather than Tier 1
 * single-row incremental delta evaluation.
 * @param {Object} parsedQuery
 * @return {boolean}
 */
function isComplexQuery(parsedQuery) {
  if (!parsedQuery) return false;
  if (hasComplexClause(parsedQuery) || hasAggregateColumn(parsedQuery.columns)) {
    return true;
  }
  return Boolean(parsedQuery.where && isComplexWhereNode(parsedQuery.where));
}

function isStarSelectColumn(col) {
  return (
    col === WILDCARD_COLUMN ||
    col?.type === LIVE_QUERY_AST_TYPE.STAR ||
    Boolean(col?.star)
  );
}

function buildDefaultColumnRefExpression(col) {
  const column = col?.column || col?.name || WILDCARD_COLUMN;
  return col?.table ?
    {type: EXPR_TYPE.COLUMN_REF, column, table: col.table} :
    {type: EXPR_TYPE.COLUMN_REF, column};
}

function normalizeSelectColumnForRenderer(col) {
  if (isStarSelectColumn(col)) {
    return col?.table ?
      {type: EXPR_TYPE.STAR, table: col.table} :
      {type: EXPR_TYPE.STAR};
  }
  const rawExpr = col?.expression || buildDefaultColumnRefExpression(col);
  return {
    ...col,
    expression: normalizeWhereAstForRenderer(rawExpr),
  };
}

function normalizeJoinForRenderer(join) {
  return {
    ...join,
    joinType: String(join?.joinType || DEFAULT_JOIN_TYPE).toUpperCase(),
    table: typeof join?.table === LOCAL_STR_STRING ?
      {name: join.table} :
      join?.table,
    condition: normalizeWhereAstForRenderer(join?.condition),
  };
}

function normalizeOrderTermForRenderer(item) {
  const rawExpr = item?.expression || {
    type: EXPR_TYPE.COLUMN_REF,
    column: item?.column || item?.name,
  };
  return {
    ...item,
    expression: normalizeWhereAstForRenderer(rawExpr),
    direction: String(item?.direction || DEFAULT_ORDER_DIRECTION).toUpperCase(),
  };
}

function normalizeLimitForRenderer(limit) {
  if (!limit) return null;
  if (typeof limit !== LOCAL_STR_OBJECT) {
    return {count: Number(limit), offset: null};
  }
  const count = typeof limit.count === LOCAL_STR_NUMBER ?
    limit.count :
    normalizeWhereAstForRenderer(limit.count);
  const offset =
    limit.offset === null ||
    limit.offset === undefined ||
    typeof limit.offset === LOCAL_STR_NUMBER ?
      limit.offset :
      normalizeWhereAstForRenderer(limit.offset);
  return {count, offset};
}

function normalizeFromForRenderer(parsedQuery) {
  if (parsedQuery.from) {
    return typeof parsedQuery.from === LOCAL_STR_STRING ?
      {name: parsedQuery.from} :
      parsedQuery.from;
  }
  if (typeof parsedQuery.table === LOCAL_STR_STRING) {
    return {name: parsedQuery.table};
  }
  return null;
}

/**
 * Normalize a parsed SELECT AST (including synthetic test ASTs) for the
 * canonical SQL renderer `renderSelect`.
 * @param {Object} parsedQuery
 * @return {Object}
 */
function normalizeSelectAstForRenderer(parsedQuery) {
  if (!parsedQuery || typeof parsedQuery !== LOCAL_STR_OBJECT) {
    return parsedQuery;
  }
  const columns =
    Array.isArray(parsedQuery.columns) && parsedQuery.columns.length > 0 ?
      parsedQuery.columns.map(normalizeSelectColumnForRenderer) :
      [{type: EXPR_TYPE.STAR}];
  return {
    ...parsedQuery,
    columns,
    from: normalizeFromForRenderer(parsedQuery),
    joins: Array.isArray(parsedQuery.joins) ?
      parsedQuery.joins.map(normalizeJoinForRenderer) :
      null,
    where: normalizeWhereAstForRenderer(parsedQuery.where),
    groupBy: Array.isArray(parsedQuery.groupBy) ?
      parsedQuery.groupBy.map(normalizeWhereAstForRenderer) :
      null,
    having: normalizeWhereAstForRenderer(parsedQuery.having),
    orderBy: Array.isArray(parsedQuery.orderBy) ?
      parsedQuery.orderBy.map(normalizeOrderTermForRenderer) :
      null,
    limit: normalizeLimitForRenderer(parsedQuery.limit),
  };
}

function resolveRawSql(parsedQuery) {
  if (typeof parsedQuery?.sql === LOCAL_STR_STRING && parsedQuery.sql.trim().length > 0) {
    return parsedQuery.sql.trim();
  }
  if (typeof parsedQuery?.rawSql === LOCAL_STR_STRING && parsedQuery.rawSql.trim().length > 0) {
    return parsedQuery.rawSql.trim();
  }
  return null;
}

/**
 * Render a SELECT AST through the single canonical SQL statement renderer.
 * @param {Object} parsedQuery - Parsed SELECT AST.
 * @return {string}
 */
function renderLiveQuerySelectSql(parsedQuery) {
  if (!parsedQuery) return '';
  const rawSql = resolveRawSql(parsedQuery);
  if (rawSql !== null) {
    return rawSql;
  }
  return renderSelect(normalizeSelectAstForRenderer(parsedQuery));
}

/**
 * Resolve SQL query string from options.
 * @param {Object} options
 * @return {string|null}
 */
function resolveGroupSql(options) {
  return options.rawSql || options.sql ||
    (typeof options.parsedQuery === LOCAL_STR_STRING ? options.parsedQuery : null);
}

/**
 * Extract referenced tables from parsed AST.
 * @param {Object} parsedAst
 * @return {{tables: Array<string>, table: string|null}}
 */
function resolveTableInfo(parsedAst) {
  const tables = extractReferencedTables(parsedAst);
  return {
    tables,
    table: tables.length > 0 ? tables[0] : null,
  };
}

function resolveSchemasForTables(tables, resolveTableSchema) {
  if (!resolveTableSchema) return null;
  return tables.map((tableName) => resolveTableSchema(tableName)).filter(Boolean);
}

/**
 * Compile WHERE clause predicate from parsed AST using in-memory SQLite.
 * For Tier 2 complex queries (`isComplexQuery(parsedAst) === true`), validates
 * admissibility and returns a closed no-op predicate handle without calling
 * `compilePredicate`, so complex queries are validated and evaluated by the
 * full-query SQL owner and no unused `:memory:` connection is opened.
 * @param {Object} parsedAst
 * @param {Array|Object} [params]
 * @param {Function|null} [resolveTableSchema]
 * @param {Object} [options]
 * @return {{whereClause: Object|null, predicate: Function}}
 */
function resolveWhereInfo(parsedAst, params = [], resolveTableSchema = null, options = {}) {
  assertLiveQueryGroupAdmissible(parsedAst);
  const rawWhere = parsedAst?.where ?? null;
  assertLiveQueryPredicateAdmissible(rawWhere);
  const whereClause = rawWhere ? normalizeWhereAstForRenderer(rawWhere) : null;
  const isComplex = options?.isComplex ?? isComplexQuery(parsedAst);
  if (isComplex) {
    return {
      whereClause,
      predicate: createClosedNoOpPredicate(),
    };
  }
  const tables = extractReferencedTables(parsedAst);
  const schemas = resolveSchemasForTables(tables, resolveTableSchema);
  return {
    whereClause,
    predicate: compilePredicate(whereClause, params, schemas, {
      tableName: tables[0] || null,
      tableBindings: extractTableBindings(parsedAst),
      parsedQuery: parsedAst,
    }),
  };
}

/**
 * Compare two versions or timestamps.
 * @param {*} a
 * @param {*} b
 * @return {number} -1, 0, or 1.
 */
function compareVersions(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) {
    return 0;
  }
  if (typeof a === LOCAL_STR_NUMBER && typeof b === LOCAL_STR_NUMBER) {
    return a - b;
  }
  try {
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    if (bigA < bigB) return -1;
    if (bigA > bigB) return 1;
    return 0;
  } catch {
    return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
  }
}

/**
 * Resolve active partition version from canonical table metadata.
 * Returns null when `active_partition_version` is absent or invalid.
 * @param {Object|null} tableInfo
 * @return {number|null}
 */
function resolveActivePartitionVersion(tableInfo) {
  if (!tableInfo || typeof tableInfo !== LOCAL_STR_OBJECT) {
    return null;
  }
  const value = tableInfo.active_partition_version;
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

/**
 * Check if partition is visible for routing given active version.
 * Requires canonical `partition_version` and `state` fields without defaults.
 * @param {Object} partition
 * @param {number|null} activePartitionVersion
 * @return {boolean}
 */
function isPartitionVisibleForRouting(partition, activePartitionVersion) {
  if (!partition || typeof partition !== LOCAL_STR_OBJECT) {
    return false;
  }
  if (!Number.isInteger(activePartitionVersion) || activePartitionVersion < 1) {
    return false;
  }
  const rawVersion = partition.partition_version;
  if (rawVersion === null || rawVersion === undefined || rawVersion === '') {
    return false;
  }
  const partitionVersion = Number(rawVersion);
  if (!Number.isInteger(partitionVersion) || partitionVersion !== activePartitionVersion) {
    return false;
  }
  if (typeof partition.state !== LOCAL_STR_STRING) {
    return false;
  }
  return partition.state.toUpperCase() === LOCAL_STR_NORMAL;
}

/**
 * Extract canonical log/sequence version from a CDC change event.
 * @param {Object} change
 * @return {*|null}
 */
function extractEventVersion(change) {
  return change?.logIndex ?? change?.sequenceNumber ?? null;
}

/**
 * Determine if a buffered CDC event should be skipped based on frontier.
 * @param {Map} frontiers
 * @param {string} partitionId
 * @param {*} eventVersion
 * @param {Function} compareFn
 * @return {boolean}
 */
function shouldSkipBufferedEvent(frontiers, partitionId, eventVersion, compareFn) {
  if (!partitionId || eventVersion === null) return false;
  const frontier = frontiers.get(partitionId);
  return frontier !== undefined && frontier !== null && compareFn(eventVersion, frontier) <= 0;
}

/**
 * Advance partition frontier if event version is strictly newer.
 */
function checkAndAdvanceFrontier(frontiers, partitionId, eventVersion, compareFn) {
  if (!partitionId || eventVersion === null) return true;
  const frontier = frontiers.get(partitionId);
  if (frontier !== undefined && frontier !== null) {
    if (compareFn(eventVersion, frontier) <= 0) return false;
    frontiers.set(partitionId, eventVersion);
  }
  return true;
}

function extractSubscriptionFrontier(answer, options, partitionId) {
  return answer?.versionContext?.streamVersion ??
    options?.attachAfterVersion ?? options?.partitionFrontiers?.get?.(partitionId);
}

function extractColumnNames(col) {
  const colName = col.expression?.column || col.expression?.name || col.column || col.name;
  return {colName, targetKey: col.alias || colName};
}

/**
 * Project a single column into the projected row container.
 */
function projectSingleColumn(projected, row, col) {
  if (col.type === LIVE_QUERY_AST_TYPE.STAR || col.star || col === WILDCARD_COLUMN) {
    return false;
  }
  const {colName, targetKey} = extractColumnNames(col);
  if (targetKey) {
    projected[targetKey] = (colName && row[colName] !== undefined) ?
      row[colName] : (row[targetKey] ?? null);
  }
  return true;
}

/**
 * Record initial partition frontiers from snapshot result and options.
 */
function recordInitialFrontiers(group, options, appliedIndex) {
  if (options.attachAfterVersion !== undefined && options.partitionId) {
    group.partitionFrontiers.set(options.partitionId, options.attachAfterVersion);
  }
  if (options.partitionFrontiers) {
    for (const [pid, ver] of options.partitionFrontiers) {
      group.partitionFrontiers.set(pid, ver);
    }
  }
  if (appliedIndex !== undefined && options.partitionId) {
    group.partitionFrontiers.set(options.partitionId, appliedIndex);
  }
}

/**
 * Ingest full rows into group result set store.
 */
function storeSnapshotRows(resultSet, getPkFn, rawRows) {
  for (const row of rawRows) {
    const pk = getPkFn(row);
    if (pk != null) resultSet.set(pk, row);
  }
}

/**
 * Merge partial CDC rows with stored full row state.
 */
function resolveEffectiveRows(storedRow, oldRow, newRow) {
  return {
    effectiveOld: storedRow ? {...storedRow, ...(oldRow || {})} : oldRow,
    effectiveNew: storedRow ? {...storedRow, ...(newRow || {})} : newRow,
  };
}

function updateStoredRowState(resultSet, pk, newMatched, effectiveNew) {
  if (pk == null) return;
  if (newMatched) resultSet.set(pk, effectiveNew);
  else resultSet.delete(pk);
}

async function executeSnapshotQuery(sqlQueryEngine, sql, params) {
  const result = await sqlQueryEngine.executeQuery(sql, params);
  if (!result || result.success === false || !Array.isArray(result.rows)) {
    const errorMessage = typeof result?.error === 'string' && result.error.length > 0 ?
      result.error : LIVE_QUERY_LOG_MSG.SNAPSHOT_FAILED;
    const error = new Error(errorMessage);
    if (Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > 0) {
      error.retryAfterMs = Math.floor(result.retryAfterMs);
    }
    throw error;
  }
  return result;
}

/**
 * Resolve SQL query string for execution through the canonical SQL renderer.
 */
function resolveExecutionSQL(sql, sqlQueryEngine, parsedQuery) {
  if (sql) return sql;
  const rawSql = resolveRawSql(parsedQuery);
  if (rawSql !== null) {
    return rawSql;
  }
  const normalized = normalizeSelectAstForRenderer(parsedQuery);
  if (sqlQueryEngine?.executor?.buildSelectSQL) {
    return sqlQueryEngine.executor.buildSelectSQL(normalized);
  }
  return renderLiveQuerySelectSql(normalized);
}

/**
 * Build insert/added CDC event payload.
 */
function buildInsertEvent(config) {
  const {queryId, row, hlc, useDeltaFormat} = config;
  return {
    type: useDeltaFormat ? LIVE_QUERY_EVENT.ADDED : LIVE_QUERY_EVENT.INSERT,
    deltaType: LIVE_QUERY_EVENT.ADDED,
    operation: LIVE_QUERY_OPERATION.INSERT,
    queryId,
    row,
    data: row,
    hlc,
  };
}

/**
 * Build delete/removed CDC event payload.
 */
function buildDeleteEvent(config) {
  const {queryId, row, hlc, useDeltaFormat} = config;
  return {
    type: useDeltaFormat ? LIVE_QUERY_EVENT.REMOVED : LIVE_QUERY_EVENT.DELETE,
    deltaType: LIVE_QUERY_EVENT.REMOVED,
    operation: LIVE_QUERY_OPERATION.DELETE,
    queryId,
    row,
    data: row,
    old: row,
    oldData: row,
    hlc,
  };
}

/**
 * Build update/modified CDC event payload.
 */
function buildUpdateEvent(config) {
  const {queryId, oldRow, newRow, hlc, useDeltaFormat} = config;
  return {
    type: useDeltaFormat ? LIVE_QUERY_EVENT.MODIFIED : LIVE_QUERY_EVENT.UPDATE,
    deltaType: LIVE_QUERY_EVENT.MODIFIED,
    operation: LIVE_QUERY_OPERATION.UPDATE,
    queryId,
    old: oldRow,
    oldData: oldRow,
    new: newRow,
    data: newRow,
    row: newRow,
    hlc,
  };
}

/**
 * Build reset snapshot notification payload.
 */
function buildResetNotification(config) {
  const {queryId, newRows, count, generation} = config;
  return {
    type: LIVE_QUERY_EVENT.RESET,
    queryId,
    rows: newRows,
    results: newRows,
    count,
    generation,
  };
}

/**
 * Create a client subscription record.
 */
function createClientSubscription(client, ttlMs) {
  return {
    client,
    clientId: client?.id || uuidv4(),
    lastRenewal: Date.now(),
    lastSeenHLC: null,
    ttlMs,
  };
}

/**
 * Renew client subscription metadata.
 */
function renewClientSubscription(subscription, cursor) {
  subscription.lastRenewal = Date.now();
  if (cursor) {
    subscription.lastSeenHLC = cursor;
  }
  return {
    clientId: subscription.clientId,
    expiresAt: subscription.lastRenewal + subscription.ttlMs,
    renewBefore: subscription.lastRenewal +
      Math.floor(subscription.ttlMs * LOCAL_NUM_ZERO_POINT_SEVEN),
  };
}

/**
 * Collect all expired client IDs from subscription map.
 */
function collectExpiredClientIds(clients) {
  const now = Date.now();
  const expired = [];
  for (const [clientId, subscription] of clients) {
    if (now > subscription.lastRenewal + subscription.ttlMs) {
      expired.push(clientId);
    }
  }
  return expired;
}

/**
 * Send payload to all subscribed clients.
 */
function fanOutToClients(clients, payload, options = {}) {
  const {hlcTimestamp, logger, queryId} = options;
  for (const [, subscription] of clients) {
    try {
      if (subscription.client && typeof subscription.client.send === 'function') {
        subscription.client.send(JSON.stringify(payload));
      }
      if (hlcTimestamp) {
        subscription.lastSeenHLC = hlcTimestamp;
      }
    } catch (error) {
      if (logger?.warn) {
        logger.warn(LIVE_QUERY_LOG_MSG.FAILED_SEND_CLIENT, {
          queryId,
          error: error.message,
        });
      }
    }
  }
}

function isSubscriptionAccepted(answer) {
  return Boolean(
    answer &&
    answer.acknowledged === true &&
    answer.subscribed === true &&
    answer.success !== false,
  );
}

/**
 * Unsubscribe retired partitions no longer relevant for query.
 */
async function unsubscribeStalePartitions(group, relevantPartitions, unsubscribeFromPartition) {
  const trackedPartitions = new Set([
    ...group.subscribedPartitions,
    ...(group.pendingSubscriptions || []),
    ...group.cdcHandlers.keys(),
  ]);
  for (const partitionId of trackedPartitions) {
    if (!relevantPartitions.has(partitionId)) {
      if (unsubscribeFromPartition) {
        await unsubscribeFromPartition(partitionId, group.queryId);
      }
      group.subscribedPartitions.delete(partitionId);
      group.pendingSubscriptions?.delete(partitionId);
      group.cdcHandlers.delete(partitionId);
      group.partitionFrontiers.delete(partitionId);
      group.logger.debug(LIVE_QUERY_LOG_MSG.UNSUBSCRIBED_PARTITION, {
        queryId: group.queryId, partitionId,
      });
    }
  }
}

/**
 * Subscribe group to one new partition.
 */
async function subscribeToSinglePartition(group, partitionId, subscribeToPartition, options) {
  if (group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED) return;
  let subscribed = false;
  if (typeof subscribeToPartition === 'function') {
    const handler = (change) => group.onCDCEvent(change, partitionId);
    group.cdcHandlers.set(partitionId, handler);
    group.pendingSubscriptions?.add(partitionId);
    const answer = await subscribeToPartition(partitionId, group.queryId, handler, options);
    if (group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED) {
      group.cdcHandlers.delete(partitionId);
      group.pendingSubscriptions?.delete(partitionId);
      group.subscribedPartitions.delete(partitionId);
      return;
    }
    if (answer?.cancelled === true) return;
    if (isSubscriptionAccepted(answer)) {
      subscribed = true;
      const frontier = extractSubscriptionFrontier(answer, options, partitionId);
      if (frontier !== undefined && !group.partitionFrontiers.has(partitionId)) {
        group.partitionFrontiers.set(partitionId, frontier);
      }
    }
  }
  if (!subscribed) {
    group.subscribedPartitions.delete(partitionId);
    group.pendingSubscriptions?.add(partitionId);
    return;
  }
  group.pendingSubscriptions?.delete(partitionId);
  group.subscribedPartitions.add(partitionId);
  group.logger.debug(LIVE_QUERY_LOG_MSG.SUBSCRIBED_PARTITION, {
    queryId: group.queryId, partitionId,
  });
}

/**
 * Subscribe group to all new candidate partitions.
 */
async function subscribeNewPartitions(group, relevantPartitions, subscribeToPartition, options) {
  for (const partitionId of relevantPartitions) {
    if (!group.subscribedPartitions.has(partitionId)) {
      await subscribeToSinglePartition(group, partitionId, subscribeToPartition, options);
    }
  }
}

export {
  buildDeleteEvent,
  buildInsertEvent,
  buildResetNotification,
  buildUpdateEvent,
  checkAndAdvanceFrontier,
  collectExpiredClientIds,
  compareVersions,
  createClientSubscription,
  executeSnapshotQuery,
  extractEventVersion,
  fanOutToClients,
  isComplexQuery,
  isPartitionVisibleForRouting,
  normalizeSelectAstForRenderer,
  projectSingleColumn,
  recordInitialFrontiers,
  renderLiveQuerySelectSql,
  renewClientSubscription,
  resolveActivePartitionVersion,
  resolveEffectiveRows,
  resolveExecutionSQL,
  resolveGroupSql,
  resolveTableInfo,
  resolveWhereInfo,
  shouldSkipBufferedEvent,
  storeSnapshotRows,
  subscribeNewPartitions,
  unsubscribeStalePartitions,
  updateStoredRowState,
};
