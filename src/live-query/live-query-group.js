import {v4 as uuidv4} from 'uuid';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {PartitionResolver} from '../query/partition-resolver.js';
import {resolveDeclaredPrimaryKeyColumns} from '../partition/partition-boundary-representation.js';
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_EMIT,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_GROUP_STATE,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATION,
  LIVE_QUERY_SUBSYSTEM,
} from './live-query-constants.js';
import {compilePredicate, canonicalizePredicate, extractPartitionKeyValue} from
  './live-query-service.js';
import {
  buildSelectSQL,
  compareVersions,
  extractReferencedTables,
  isComplexQuery,
  isPartitionVisibleForRouting,
  resolveActivePartitionVersion,
} from './live-query-sql-renderer.js';

const LOCAL_NUM_ZERO_POINT_SEVEN = 0.7;
const LOCAL_NUM_THIRTY_TWO = 32;

function resolveGroupSql(options) {
  return options.rawSql || options.sql ||
    (typeof options.parsedQuery === 'string' ? options.parsedQuery : null);
}

function resolveTableInfo(parsedAst) {
  const tables = extractReferencedTables(parsedAst);
  return {
    tables,
    table: tables.length > 0 ? tables[0] : null,
  };
}

function resolveWhereInfo(parsedAst) {
  const whereClause = parsedAst?.where ?? null;
  return {
    whereClause,
    predicate: compilePredicate(whereClause),
  };
}

function extractEventVersion(change) {
  return change?.logIndex ?? change?.appliedIndex ??
    change?.version ?? change?.sequenceNumber ?? null;
}

function shouldSkipBufferedEvent(frontiers, partitionId, eventVersion, compareFn) {
  if (!partitionId || eventVersion === null) return false;
  const frontier = frontiers.get(partitionId);
  return frontier !== undefined && frontier !== null && compareFn(eventVersion, frontier) <= 0;
}

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
    answer?.streamVersion ??
    options?.attachAfterVersion ??
    options?.partitionFrontiers?.get?.(partitionId);
}

/**
 * QueryGroup manages clients with identical queries sharing CDC subscriptions.
 */
class QueryGroup extends EventEmitter {
  /**
   * Create a new QueryGroup.
   * @param {Object} options - Configuration options.
   * @param {Object} options.parsedQuery - Parsed SELECT query AST.
   * @param {Object} [options.systemCache] - System table cache.
   * @param {Object} [options.sqlQueryEngine] - SQL query engine for execution.
   * @param {Object} [options.partitionResolver] - Canonical partition resolver.
   * @param {string} [options.nodeId] - Node ID.
   * @param {boolean} [options.deltaFormat] - Emit delta-formatted changes.
   */
  constructor(options = {}) {
    super();

    this.queryId = uuidv4();
    this.parsedQuery = options.parsedQuery ?? null;
    this.systemCache = options.systemCache ?? null;
    this.sqlQueryEngine = options.sqlQueryEngine ?? null;
    this.partitionResolver = options.partitionResolver ?? null;
    this.nodeId = options.nodeId ?? LIVE_QUERY_DEFAULT_VALUE.UNKNOWN;
    this.deltaFormat = Boolean(options.deltaFormat);
    this.sql = resolveGroupSql(options);

    const {tables, table} = resolveTableInfo(this.parsedQuery);
    this.tables = tables;
    this.table = table;
    this.isComplex = isComplexQuery(this.parsedQuery);

    const {whereClause, predicate} = resolveWhereInfo(this.parsedQuery);
    this.whereClause = whereClause;
    this.predicate = predicate;

    this.clients = new Map();
    this.subscribedPartitions = new Set();
    this.cdcHandlers = new Map();
    this.partitionFrontiers = new Map();
    this.isHydrating = false;
    this.bufferedEvents = [];
    this.lifecycleState = LIVE_QUERY_GROUP_STATE.INITIALIZING;
    this.lastResultSet = null;

    this.config = ConfigurationManager.getInstance();
    this.ttlMs = this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) ??
      LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS;

    this.partitionKeyColumn = null;
    this.partitionKeyValue = null;
    this.active = false;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.logger = this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.QUERY_GROUP);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Compare two routing keys using the canonical comparator.
   * @param {*} left - Left key.
   * @param {*} right - Right key.
   * @return {number} Negative if left < right, positive if left > right, 0 if equal.
   */
  compareValues(left, right) {
    return compareRoutingKeys(left, right);
  }

  /**
   * Add a client to this group.
   * @param {Object} client - Client connection.
   * @return {Object} Client subscription info.
   */
  addClient(client) {
    const clientId = client.id || uuidv4();
    const subscription = {
      client,
      clientId,
      lastRenewal: Date.now(),
      lastSeenHLC: null,
      ttlMs: this.ttlMs,
    };

    this.clients.set(clientId, subscription);
    this.lastActivityAt = Date.now();

    this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_JOINED, {
      queryId: this.queryId,
      clientId,
      clientCount: this.clients.size,
    });

    return subscription;
  }

  /**
   * Remove a client from this group.
   * @param {string} clientId - Client ID.
   * @return {boolean} True if group should be removed (no clients left).
   */
  removeClient(clientId) {
    this.clients.delete(clientId);
    this.lastActivityAt = Date.now();

    this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_LEFT, {
      queryId: this.queryId,
      clientId,
      clientCount: this.clients.size,
    });

    return this.clients.size === 0;
  }

  /**
   * Renew a client's subscription.
   * @param {string} clientId - Client ID.
   * @param {string} cursor - Last seen HLC timestamp.
   * @return {Object|null} Renewal result or null if client not found.
   */
  renewClient(clientId, cursor) {
    const subscription = this.clients.get(clientId);
    if (!subscription) return null;

    subscription.lastRenewal = Date.now();
    if (cursor) {
      subscription.lastSeenHLC = cursor;
    }
    this.lastActivityAt = Date.now();

    return {
      queryId: this.queryId,
      clientId,
      expiresAt: subscription.lastRenewal + subscription.ttlMs,
      renewBefore: subscription.lastRenewal +
        Math.floor(subscription.ttlMs * LOCAL_NUM_ZERO_POINT_SEVEN),
    };
  }

  /**
   * Check if a client subscription has expired.
   * @param {Object} subscription - Client subscription.
   * @return {boolean} True if expired.
   */
  isSubscriptionExpired(subscription) {
    return Date.now() > subscription.lastRenewal + subscription.ttlMs;
  }

  /**
   * Get expired client subscriptions.
   * @return {Array} Array of expired client IDs.
   */
  getExpiredClients() {
    const expired = [];
    for (const [clientId, subscription] of this.clients) {
      if (this.isSubscriptionExpired(subscription)) {
        expired.push(clientId);
      }
    }
    return expired;
  }

  /**
   * Get the partition key column for the table.
   * @param {string} [tableName=this.table] - Table name.
   * @return {string|null} Partition key column name.
   */
  getPartitionKeyColumn(tableName = this.table) {
    if (this.partitionKeyColumn && tableName === this.table) {
      return this.partitionKeyColumn;
    }

    if (!this.systemCache || !tableName) {
      return null;
    }

    try {
      const tableInfo = this.getTableInfo(tableName);
      if (tableInfo) {
        const keyColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
        if (tableName === this.table) {
          this.partitionKeyColumn = keyColumns[0] || null;
        }
        return keyColumns[0] || null;
      }
    } catch {
      // Cache not available
    }

    return null;
  }

  /**
   * Extract partition key value from WHERE clause.
   * @return {*} Partition key value or null.
   */
  extractPartitionKeyValue() {
    if (this.partitionKeyValue !== null) {
      return this.partitionKeyValue;
    }

    const keyColumn = this.getPartitionKeyColumn();
    this.partitionKeyValue = extractPartitionKeyValue(this.whereClause, keyColumn);
    return this.partitionKeyValue;
  }

  /**
   * Start hydration buffering mode before taking snapshot.
   */
  startHydration() {
    this.isHydrating = true;
    this.bufferedEvents = [];
    this.lifecycleState = LIVE_QUERY_GROUP_STATE.INITIALIZING;
  }

  /**
   * Compare two versions/timestamps for ordering and deduplication.
   * @param {*} a - First version.
   * @param {*} b - Second version.
   * @return {number} -1, 0, or 1.
   */
  compareVersions(a, b) {
    return compareVersions(a, b);
  }

  /**
   * Drain buffered CDC events accumulated during snapshot hydration.
   * Deduplicates events at or below attachAfterVersion for each partition.
   */
  drainBufferedEvents() {
    this.isHydrating = false;
    const events = this.bufferedEvents;
    this.bufferedEvents = [];

    for (const {change, partitionId} of events) {
      const eventVersion = extractEventVersion(change);
      if (shouldSkipBufferedEvent(
        this.partitionFrontiers, partitionId, eventVersion, this.compareVersions,
      )) {
        continue;
      }
      this.handleCDCEvent(change, partitionId);
    }
    this.lifecycleState = LIVE_QUERY_GROUP_STATE.LIVE;
  }

  _resolveTablePartitions(resolver, tableName) {
    const tableInfo = this.getTableInfo(tableName);
    const partitions = this.getVisiblePartitionsForTable(tableName);
    if (partitions.length === 0) return [];

    const keyColumns = (this.partitionKeyColumn && tableName === this.table) ?
      [this.partitionKeyColumn] : undefined;
    return resolver.resolvePartitions(tableName, this.whereClause, partitions, {
      tableInfo, tableMetadata: tableInfo, keyColumns,
    });
  }

  /**
   * Find candidate partitions for all referenced tables using canonical PartitionResolver.
   * @return {Promise<Set>} Set of partition IDs.
   */
  async findPartitionsForQuery() {
    if (!this.systemCache) return new Set();

    const tables = this.tables && this.tables.length > 0 ?
      this.tables : (this.table ? [this.table] : []);
    if (tables.length === 0) return new Set();

    try {
      const resolver = this.partitionResolver || new PartitionResolver({
        systemCache: this.systemCache,
      });

      const matching = new Set();
      for (const tableName of tables) {
        for (const partitionId of this._resolveTablePartitions(resolver, tableName)) {
          matching.add(partitionId);
        }
      }
      return matching;
    } catch (error) {
      this.logger.error(LIVE_QUERY_LOG_MSG.PARTITIONS_LOOKUP_FAILED, {
        queryId: this.queryId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get visible partitions for a given table from systemCache.
   * @param {string} tableName
   * @return {Array} Visible partition rows.
   */
  getVisiblePartitionsForTable(tableName) {
    if (!this.systemCache || !tableName) {
      return [];
    }
    const tableInfo = this.getTableInfo(tableName);
    const activePartitionVersion = this.resolveActivePartitionVersion(tableInfo);
    return (this.systemCache.filter(TABLES.PARTITIONS, (p) =>
      p.table_name === tableName || p.tableName === tableName,
    ) || []).filter((partition) =>
      this.isPartitionVisibleForRouting(partition, activePartitionVersion),
    );
  }

  /**
   * Read current table metadata from the system cache.
   * @param {string} [tableName=this.table]
   * @return {Object|null} Table metadata row.
   */
  getTableInfo(tableName = this.table) {
    if (!this.systemCache || !tableName) {
      return null;
    }

    return this.systemCache.get(TABLES.TABLES, tableName) ||
      this.systemCache.find(TABLES.TABLES, (t) =>
        t.table_name === tableName || t.tableName === tableName,
      ) ||
      null;
  }

  /**
   * Resolve active partition version from table metadata.
   * @param {Object|null} tableInfo
   * @return {number}
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    return resolveActivePartitionVersion(tableInfo);
  }

  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    return isPartitionVisibleForRouting(partition, activePartitionVersion);
  }

  /**
   * Internal callback for incoming CDC events.
   * Buffers when hydrating; otherwise dispatches.
   * @param {Object} change - CDC change event.
   * @param {string} partitionId - Source partition ID.
   */
  onCDCEvent(change, partitionId) {
    if (this.isHydrating) {
      this.bufferedEvents.push({change, partitionId});
      return;
    }
    this.handleCDCEvent(change, partitionId);
  }

  _fanOutResult(result, change) {
    this.lastActivityAt = Date.now();
    for (const [, subscription] of this.clients) {
      try {
        if (subscription.client && typeof subscription.client.send === 'function') {
          subscription.client.send(JSON.stringify(result));
        }
        subscription.lastSeenHLC = change.hlc_timestamp || change.hlcTimestamp;
      } catch (error) {
        this.logger.warn(LIVE_QUERY_LOG_MSG.FAILED_SEND_CLIENT, {
          queryId: this.queryId, error: error.message,
        });
      }
    }
    this.emit(LIVE_QUERY_EMIT.CHANGE, result);
  }

  /**
   * Handle a CDC event from a partition.
   * Evaluates predicate and fans out to all clients, or re-executes if complex query.
   * @param {Object} change - CDC change event.
   * @param {string|null} [partitionId=null] - Partition ID.
   * @return {Promise<Object|null>} Evaluated result or null.
   */
  async handleCDCEvent(change, partitionId = null) {
    const eventVersion = extractEventVersion(change);
    if (!checkAndAdvanceFrontier(
      this.partitionFrontiers, partitionId, eventVersion, this.compareVersions,
    )) {
      return null;
    }

    // Tier 2: Queries with JOIN, GROUP BY, aggregates, ORDER BY, LIMIT re-execute
    if (this.isComplex) {
      await this.reexecuteQuery();
      return null;
    }

    // Tier 1: Incremental delta evaluation
    const result = this.evaluateChange(change);
    if (result) {
      this._fanOutResult(result, change);
    }
    return result;
  }

  _resolveExecutionSQL() {
    if (this.sql) return this.sql;
    if (this.sqlQueryEngine?.executor?.buildSelectSQL) {
      return this.sqlQueryEngine.executor.buildSelectSQL(this.parsedQuery);
    }
    return buildSelectSQL(this.parsedQuery);
  }

  _broadcastReset(resetNotification) {
    this.lastActivityAt = Date.now();
    for (const [, subscription] of this.clients) {
      try {
        if (subscription.client && typeof subscription.client.send === 'function') {
          subscription.client.send(JSON.stringify(resetNotification));
        }
      } catch (error) {
        this.logger.warn(LIVE_QUERY_LOG_MSG.FAILED_SEND_CLIENT, {
          queryId: this.queryId, error: error.message,
        });
      }
    }
    this.emit(LIVE_QUERY_EMIT.CHANGE, resetNotification);
    this.emit(LIVE_QUERY_EVENT.RESET, resetNotification);
  }

  /**
   * Re-execute complex query against sqlQueryEngine and emit reset snapshot.
   * @return {Promise<Object|null>} Reset snapshot notification or null.
   */
  async reexecuteQuery() {
    if (!this.sqlQueryEngine) {
      return null;
    }

    try {
      const sql = this._resolveExecutionSQL();
      const result = await this.sqlQueryEngine.executeQuery(sql);
      const newRows = result.rows ?? result.results ?? [];
      this.lastResultSet = newRows;

      const resetNotification = {
        type: LIVE_QUERY_EVENT.RESET, queryId: this.queryId,
        rows: newRows, results: newRows,
        count: result.count ?? newRows.length,
      };

      this._broadcastReset(resetNotification);
      return resetNotification;
    } catch (error) {
      this.logger.error(LIVE_QUERY_LOG_MSG.REEXECUTION_FAILED, {
        queryId: this.queryId,
        error: error.message,
      });
      return null;
    }
  }

  _makeInsertEvent(row, hlc, useDeltaFormat) {
    return {
      type: useDeltaFormat ? LIVE_QUERY_EVENT.ADDED : LIVE_QUERY_EVENT.INSERT,
      deltaType: LIVE_QUERY_EVENT.ADDED,
      operation: LIVE_QUERY_OPERATION.INSERT,
      queryId: this.queryId,
      row, data: row, hlc,
    };
  }

  _makeDeleteEvent(row, hlc, useDeltaFormat) {
    return {
      type: useDeltaFormat ? LIVE_QUERY_EVENT.REMOVED : LIVE_QUERY_EVENT.DELETE,
      deltaType: LIVE_QUERY_EVENT.REMOVED,
      operation: LIVE_QUERY_OPERATION.DELETE,
      queryId: this.queryId,
      row, data: row, old: row, oldData: row, hlc,
    };
  }

  _makeUpdateEvent(oldRow, newRow, hlc, useDeltaFormat) {
    return {
      type: useDeltaFormat ? LIVE_QUERY_EVENT.MODIFIED : LIVE_QUERY_EVENT.UPDATE,
      deltaType: LIVE_QUERY_EVENT.MODIFIED,
      operation: LIVE_QUERY_OPERATION.UPDATE,
      queryId: this.queryId,
      old: oldRow, oldData: oldRow, new: newRow, data: newRow, row: newRow, hlc,
    };
  }

  _evaluateInsert(newRow, hlc, useDeltaFormat) {
    return (newRow && this.predicate(newRow)) ?
      this._makeInsertEvent(newRow, hlc, useDeltaFormat) : null;
  }

  _evaluateDelete(oldRow, hlc, useDeltaFormat) {
    return (oldRow && this.predicate(oldRow)) ?
      this._makeDeleteEvent(oldRow, hlc, useDeltaFormat) : null;
  }

  _evaluateUpdate(oldRow, newRow, hlc, useDeltaFormat) {
    const oldMatched = Boolean(oldRow && this.predicate(oldRow));
    const newMatched = Boolean(newRow && this.predicate(newRow));
    if (!oldMatched && newMatched) {
      return this._makeInsertEvent(newRow, hlc, useDeltaFormat);
    }
    if (oldMatched && !newMatched) {
      return this._makeDeleteEvent(oldRow, hlc, useDeltaFormat);
    }
    if (oldMatched && newMatched) {
      return this._makeUpdateEvent(oldRow, newRow, hlc, useDeltaFormat);
    }
    return null;
  }

  /**
   * Evaluate a CDC change against the predicate.
   * @param {Object} change - CDC change event.
   * @param {Object} [options] - Evaluation options.
   * @return {Object|null} Event to send to clients or null.
   */
  evaluateChange(change, options = {}) {
    const {operation, data: newRow, old_data: oldRow} = change;
    const hlc = change.hlc_timestamp || change.hlcTimestamp;
    const useDeltaFormat = options.deltaFormat ?? this.deltaFormat ?? false;

    switch (operation?.toUpperCase()) {
    case LIVE_QUERY_OPERATION.INSERT:
      return this._evaluateInsert(newRow, hlc, useDeltaFormat);
    case LIVE_QUERY_OPERATION.UPDATE:
      return this._evaluateUpdate(oldRow, newRow, hlc, useDeltaFormat);
    case LIVE_QUERY_OPERATION.DELETE:
      return this._evaluateDelete(oldRow, hlc, useDeltaFormat);
    default:
      return null;
    }
  }

  async _unsubscribeStalePartitions(relevantPartitions, unsubscribeFromPartition) {
    for (const partitionId of Array.from(this.subscribedPartitions)) {
      if (!relevantPartitions.has(partitionId)) {
        if (unsubscribeFromPartition) {
          await unsubscribeFromPartition(partitionId, this.queryId);
        }
        this.subscribedPartitions.delete(partitionId);
        this.cdcHandlers.delete(partitionId);
        this.partitionFrontiers.delete(partitionId);

        this.logger.debug(LIVE_QUERY_LOG_MSG.UNSUBSCRIBED_PARTITION, {
          queryId: this.queryId,
          partitionId,
        });
      }
    }
  }

  async _subscribeToSinglePartition(partitionId, subscribeToPartition, options) {
    if (subscribeToPartition) {
      const handler = (change) => this.onCDCEvent(change, partitionId);
      this.cdcHandlers.set(partitionId, handler);
      const answer = await subscribeToPartition(partitionId, this.queryId, handler, options);
      const frontier = extractSubscriptionFrontier(answer, options, partitionId);
      if (frontier !== undefined && !this.partitionFrontiers.has(partitionId)) {
        this.partitionFrontiers.set(partitionId, frontier);
      }
    }
    this.subscribedPartitions.add(partitionId);

    this.logger.debug(LIVE_QUERY_LOG_MSG.SUBSCRIBED_PARTITION, {
      queryId: this.queryId,
      partitionId,
    });
  }

  async _subscribeNewPartitions(relevantPartitions, subscribeToPartition, options) {
    for (const partitionId of relevantPartitions) {
      if (!this.subscribedPartitions.has(partitionId)) {
        await this._subscribeToSinglePartition(partitionId, subscribeToPartition, options);
      }
    }
  }

  /**
   * Update partition subscriptions (for split/merge handling and initial wiring).
   * @param {Function} subscribeToPartition - Function to subscribe to a partition.
   * @param {Function} unsubscribeFromPartition - Function to unsubscribe.
   * @param {Object} [options] - Handshake options.
   * @return {Promise<void>}
   */
  async updatePartitionSubscriptions(subscribeToPartition, unsubscribeFromPartition, options = {}) {
    const relevantPartitions = await this.findPartitionsForQuery();
    await this._unsubscribeStalePartitions(relevantPartitions, unsubscribeFromPartition);
    await this._subscribeNewPartitions(relevantPartitions, subscribeToPartition, options);
  }

  /**
   * Get query signature for grouping.
   * @return {string} Query signature.
   */
  getQuerySignature() {
    const tablePart = this.tables && this.tables.length > 0 ?
      this.tables.join(',') :
      (this.table || '');
    return `${tablePart}${LIVE_QUERY_CURSOR.SEPARATOR}` +
      `${canonicalizePredicate(this.whereClause)}`;
  }

  /**
   * Get group metadata for monitoring.
   * @return {Object} Group metadata.
   */
  getMetadata() {
    return {
      queryId: this.queryId,
      table: this.table,
      tables: this.tables,
      predicateHash: canonicalizePredicate(this.whereClause)
        .substring(0, LOCAL_NUM_THIRTY_TWO),
      partitionKeyValue: this.partitionKeyValue,
      clientCount: this.clients.size,
      subscribedPartitions: Array.from(this.subscribedPartitions),
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      active: this.active,
      lifecycleState: this.lifecycleState,
      isComplex: this.isComplex,
    };
  }

  /**
   * Clean up resources and detach listeners.
   */
  cleanup() {
    this.active = false;
    this.lifecycleState = LIVE_QUERY_GROUP_STATE.CLOSED;
    this.isHydrating = false;
    this.bufferedEvents = [];
    this.partitionFrontiers.clear();
    this.clients.clear();
    this.subscribedPartitions.clear();
    this.cdcHandlers.clear();
    this.removeAllListeners();

    this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_CLEANED_UP, {
      queryId: this.queryId, table: this.table,
    });
  }
}

export {QueryGroup};
