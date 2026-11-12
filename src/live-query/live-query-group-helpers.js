/**
 * Helper utilities and extracted functions for Live Query Group.
 */

import {v4 as uuidv4} from 'uuid';
import {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_ERROR_CODE,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATION,
} from './live-query-constants.js';
import {
  compilePredicate,
  isComplexWhereNode,
} from './live-query-service.js';
import {
  buildSelectSQL,
  extractReferencedTables,
  isComplexQuery as baseIsComplexQuery,
} from './live-query-sql-renderer.js';

const WILDCARD_COLUMN = '*';

/**
 * Check if a query requires full re-execution rather than incremental delta.
 * @param {Object} parsedQuery
 * @return {boolean}
 */
function isComplexQuery(parsedQuery) {
  if (!parsedQuery) return false;
  if (baseIsComplexQuery(parsedQuery)) return true;
  return Boolean(parsedQuery.where && isComplexWhereNode(parsedQuery.where));
}

/**
 * Resolve SQL query string from options.
 * @param {Object} options
 * @return {string|null}
 */
function resolveGroupSql(options) {
  return options.rawSql || options.sql ||
    (typeof options.parsedQuery === 'string' ? options.parsedQuery : null);
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

/**
 * Compile WHERE clause predicate from parsed AST.
 * @param {Object} parsedAst
 * @param {Array|Object} [params]
 * @return {{whereClause: Object|null, predicate: Function}}
 */
function resolveWhereInfo(parsedAst, params = []) {
  const whereClause = parsedAst?.where ?? null;
  return {whereClause, predicate: compilePredicate(whereClause, params)};
}

/**
 * Extract version/sequence number from CDC change event.
 * @param {Object} change
 * @return {*|null}
 */
function extractEventVersion(change) {
  return change?.logIndex ?? change?.appliedIndex ??
    change?.version ?? change?.sequenceNumber ?? null;
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

/**
 * Extract subscription frontier version from subscription answer or options.
 */
function extractSubscriptionFrontier(answer, options, partitionId) {
  return answer?.versionContext?.streamVersion ??
    answer?.streamVersion ??
    options?.attachAfterVersion ??
    options?.partitionFrontiers?.get?.(partitionId);
}

/**
 * Extract column names from a column AST node.
 */
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
 * A result row that does not carry its table's declared primary key: the row
 * has no identity, and no other column stands in for one.
 */
class LiveQueryRowKeyError extends Error {
  constructor(table, column) {
    super(column === null ?
      `Live query table '${table}' has no declared primary key` :
      `Live query row of table '${table}' lacks primary key column '${column}'`);
    this.name = 'LiveQueryRowKeyError';
    this.code = LIVE_QUERY_ERROR_CODE.ROW_KEY_MISSING;
    this.table = table;
    this.column = column;
  }
}

/**
 * The identity of a row: the values of every declared primary key column.
 * @param {Object} row
 * @param {string} table
 * @param {Array<string>} keyColumns - The table's declared key columns.
 * @return {*} The key value, or the JSON of the values of a composite key.
 * @throws {LiveQueryRowKeyError} When the key is undeclared or absent.
 */
function resolveRowIdentity(row, table, keyColumns) {
  if (keyColumns.length === 0) throw new LiveQueryRowKeyError(table, null);
  const values = keyColumns.map((column) => {
    const value = row?.[column];
    if (value === undefined || value === null) throw new LiveQueryRowKeyError(table, column);
    return value;
  });
  return values.length === 1 ? values[0] : JSON.stringify(values);
}

/**
 * Ingest full rows into group result set store.
 */
function storeSnapshotRows(resultSet, getPkFn, rawRows) {
  for (const row of rawRows) {
    resultSet.set(getPkFn(row), row);
  }
}

/**
 * Update row presence in result set store based on predicate match.
 */
function updateStoredRowState(resultSet, pk, newMatched, effectiveNew) {
  if (newMatched) {
    resultSet.set(pk, effectiveNew);
  } else {
    resultSet.delete(pk);
  }
}

/**
 * Execute snapshot SQL query against SQL query engine.
 */
async function executeSnapshotQuery(sqlQueryEngine, sql, params) {
  return sqlQueryEngine.executeQuery(sql, params);
}

/**
 * Resolve SQL query string for execution.
 */
function resolveExecutionSQL(sql, sqlQueryEngine, parsedQuery) {
  if (sql) return sql;
  if (sqlQueryEngine?.executor?.buildSelectSQL) {
    return sqlQueryEngine.executor.buildSelectSQL(parsedQuery);
  }
  return buildSelectSQL(parsedQuery);
}

/**
 * Build insert/added CDC event payload. A change event names each fact once:
 * `data` is the row the event is about (inserted, updated-to or deleted row)
 * and `oldData`, on an update only, is the row before it.
 */
function buildInsertEvent(config) {
  const {queryId, row, hlc, useDeltaFormat} = config;
  return {
    type: useDeltaFormat ? LIVE_QUERY_EVENT.ADDED : LIVE_QUERY_EVENT.INSERT,
    deltaType: LIVE_QUERY_EVENT.ADDED,
    operation: LIVE_QUERY_OPERATION.INSERT,
    queryId,
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
    data: row,
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
    data: newRow,
    oldData: oldRow,
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
    ttlMs,
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
  const {logger, queryId} = options;
  for (const [, subscription] of clients) {
    try {
      if (subscription.client && typeof subscription.client.send === 'function') {
        subscription.client.send(JSON.stringify(payload));
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

/**
 * Unsubscribe retired partitions no longer relevant for query.
 */
async function unsubscribeStalePartitions(group, relevantPartitions, unsubscribeFromPartition) {
  for (const partitionId of Array.from(group.subscribedPartitions)) {
    if (!relevantPartitions.has(partitionId)) {
      if (unsubscribeFromPartition) {
        await unsubscribeFromPartition(partitionId, group.queryId);
      }
      group.subscribedPartitions.delete(partitionId);
      group.cdcHandlers.delete(partitionId);
      group.partitionFrontiers.delete(partitionId);
      group.logger.debug(LIVE_QUERY_LOG_MSG.UNSUBSCRIBED_PARTITION, {
        queryId: group.queryId,
        partitionId,
      });
    }
  }
}

/**
 * Subscribe group to one new partition.
 */
async function subscribeToSinglePartition(group, partitionId, subscribeToPartition, options) {
  if (subscribeToPartition) {
    const handler = (change) => group.onCDCEvent(change, partitionId);
    group.cdcHandlers.set(partitionId, handler);
    const answer = await subscribeToPartition(partitionId, group.queryId, handler, options);
    const frontier = extractSubscriptionFrontier(answer, options, partitionId);
    if (frontier !== undefined && !group.partitionFrontiers.has(partitionId)) {
      group.partitionFrontiers.set(partitionId, frontier);
    }
  }
  group.subscribedPartitions.add(partitionId);
  group.logger.debug(LIVE_QUERY_LOG_MSG.SUBSCRIBED_PARTITION, {
    queryId: group.queryId,
    partitionId,
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
  createClientSubscription,
  executeSnapshotQuery,
  extractEventVersion,
  fanOutToClients,
  isComplexQuery,
  projectSingleColumn,
  recordInitialFrontiers,
  resolveExecutionSQL,
  resolveGroupSql,
  resolveRowIdentity,
  resolveTableInfo,
  resolveWhereInfo,
  shouldSkipBufferedEvent,
  storeSnapshotRows,
  subscribeNewPartitions,
  unsubscribeStalePartitions,
  updateStoredRowState,
};
