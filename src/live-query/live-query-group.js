import {v4 as uuidv4} from 'uuid';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {PartitionResolver} from '../query/partition-resolver.js';
import {resolveDeclaredPrimaryKeyColumns} from '../partition/partition-boundary-representation.js';
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {
  LIVE_QUERY_AST_TYPE,
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
import {
  canonicalizePredicate,
  extractPartitionKeyValue,
} from './live-query-service.js';
import {
  compareVersions,
  isPartitionVisibleForRouting,
  resolveActivePartitionVersion,
} from './live-query-sql-renderer.js';
import {
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
  renewClientSubscription,
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
} from './live-query-group-helpers.js';

const LOCAL_NUM_THIRTY_TWO = 32;
const WILDCARD_COLUMN = '*';

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
    this.params = options.params || [];
    this.groupKey = options.groupKey || null;
    this.resultSet = new Map();
    this.refreshInFlight = false;
    this.refreshPending = false;
    this.refreshGeneration = 0;

    const {tables, table} = resolveTableInfo(this.parsedQuery);
    this.tables = tables;
    this.table = table;
    this.isComplex = isComplexQuery(this.parsedQuery);

    const {whereClause, predicate} = resolveWhereInfo(this.parsedQuery, this.params);
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
    const subscription = createClientSubscription(client, this.ttlMs);
    const clientId = subscription.clientId;
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
    this.lastActivityAt = Date.now();
    const renewal = renewClientSubscription(subscription, cursor);
    return {
      queryId: this.queryId,
      ...renewal,
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
    return collectExpiredClientIds(this.clients);
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
    const hlcTimestamp = change.hlc_timestamp || change.hlcTimestamp;
    fanOutToClients(this.clients, result, {
      hlcTimestamp,
      logger: this.logger,
      queryId: this.queryId,
    });
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
    return resolveExecutionSQL(this.sql, this.sqlQueryEngine, this.parsedQuery);
  }

  _broadcastReset(resetNotification) {
    this.lastActivityAt = Date.now();
    fanOutToClients(this.clients, resetNotification, {
      logger: this.logger,
      queryId: this.queryId,
    });
    this.emit(LIVE_QUERY_EMIT.CHANGE, resetNotification);
    this.emit(LIVE_QUERY_EVENT.RESET, resetNotification);
  }

  /**
   * Check if the query has a star projection.
   * @return {boolean}
   */
  isStarProjection() {
    const cols = this.parsedQuery?.columns;
    if (!cols || cols.length === 0) return true;
    return cols.some((col) =>
      col.type === LIVE_QUERY_AST_TYPE.STAR || col.star || col === WILDCARD_COLUMN,
    );
  }

  /**
   * Project a row according to parsedQuery.columns.
   * @param {Object} row - Full table row.
   * @return {Object} Projected row.
   */
  projectRow(row) {
    if (!row || typeof row !== 'object' || this.isStarProjection()) {
      return row;
    }
    const cols = this.parsedQuery?.columns;
    if (!cols || cols.length === 0) {
      return row;
    }
    const projected = {};
    for (const col of cols) {
      if (!projectSingleColumn(projected, row, col)) {
        return row;
      }
    }
    return projected;
  }

  /**
   * Resolve primary key identity for a row.
   * @param {Object} row - Row data.
   * @return {*} Primary key value.
   */
  getRowPrimaryKey(row) {
    if (!row) return null;
    const pkCol = this.getPartitionKeyColumn() || 'id';
    return row[pkCol] ?? row.id ?? row.rowid ?? null;
  }

  /**
   * Execute the initial snapshot query and record baseline frontiers.
   * @param {Object} [options]
   * @return {Promise<Array>} Projected snapshot rows.
   */
  async executeInitialQuery(options = {}) {
    if (!this.sqlQueryEngine) {
      this.lastResultSet = [];
      return [];
    }
    const sql = this._resolveExecutionSQL();
    const result = await executeSnapshotQuery(this.sqlQueryEngine, sql, this.params);
    const rawRows = result.rows ?? result.results ?? [];
    const projectedRows = rawRows.map((r) => this.projectRow(r));
    this.lastResultSet = projectedRows;

    storeSnapshotRows(this.resultSet, (r) => this.getRowPrimaryKey(r), rawRows);
    recordInitialFrontiers(this, options, result.appliedIndex);
    return projectedRows;
  }

  /**
   * Initialize subscriptions and execute initial snapshot with frontier handoff.
   * @param {Object} params
   * @param {Function} params.subscribeToPartition
   * @param {Function} [params.unsubscribeFromPartition]
   * @param {Object} [params.options]
   * @return {Promise<Array>} Snapshot rows.
   */
  async initialize({subscribeToPartition, unsubscribeFromPartition, options = {}}) {
    this.startHydration();
    await this.updatePartitionSubscriptions(
      subscribeToPartition, unsubscribeFromPartition, options,
    );
    const rows = await this.executeInitialQuery(options);
    this.drainBufferedEvents();
    this.active = true;
    return rows;
  }

  /**
   * Re-execute complex query against sqlQueryEngine and emit reset snapshot.
   * Serialized and coalesced so stale completions cannot overwrite newer state.
   * @return {Promise<Object|null>} Reset snapshot notification or null.
   */
  async refreshQueryResult() {
    if (!this.sqlQueryEngine) {
      return null;
    }
    if (this.refreshInFlight) {
      this.refreshPending = true;
      return null;
    }
    this.refreshInFlight = true;
    const currentGeneration = ++this.refreshGeneration;

    try {
      const sql = this._resolveExecutionSQL();
      const result = await executeSnapshotQuery(this.sqlQueryEngine, sql, this.params);
      if (currentGeneration < this.refreshGeneration) {
        return null;
      }
      const rawRows = result.rows ?? result.results ?? [];
      const newRows = rawRows.map((r) => this.projectRow(r));
      this.lastResultSet = newRows;
      storeSnapshotRows(this.resultSet, (r) => this.getRowPrimaryKey(r), rawRows);

      const resetNotification = buildResetNotification({
        queryId: this.queryId,
        newRows,
        count: result.count ?? newRows.length,
        generation: currentGeneration,
      });
      this._broadcastReset(resetNotification);
      return resetNotification;
    } catch (error) {
      this.logger.error(LIVE_QUERY_LOG_MSG.REEXECUTION_FAILED, {
        queryId: this.queryId,
        error: error.message,
      });
      return null;
    } finally {
      this.refreshInFlight = false;
      if (this.refreshPending) {
        this.refreshPending = false;
        queueMicrotask(() => this.refreshQueryResult());
      }
    }
  }

  async reexecuteQuery() {
    return this.refreshQueryResult();
  }

  _makeInsertEvent(row, hlc, useDeltaFormat) {
    return buildInsertEvent({
      queryId: this.queryId,
      row: this.projectRow(row),
      hlc,
      useDeltaFormat,
    });
  }

  _makeDeleteEvent(row, hlc, useDeltaFormat) {
    return buildDeleteEvent({
      queryId: this.queryId,
      row: this.projectRow(row),
      hlc,
      useDeltaFormat,
    });
  }

  _makeUpdateEvent(oldRow, newRow, hlc, useDeltaFormat) {
    return buildUpdateEvent({
      queryId: this.queryId,
      oldRow: this.projectRow(oldRow),
      newRow: this.projectRow(newRow),
      hlc,
      useDeltaFormat,
    });
  }

  _evaluateInsert(newRow, hlc, useDeltaFormat) {
    if (!newRow) return null;
    const pk = this.getRowPrimaryKey(newRow);
    const matched = this.predicate(newRow);
    if (matched) {
      if (pk != null) this.resultSet.set(pk, newRow);
      return this._makeInsertEvent(newRow, hlc, useDeltaFormat);
    }
    if (pk != null) this.resultSet.delete(pk);
    return null;
  }

  _evaluateDelete(oldRow, hlc, useDeltaFormat) {
    if (!oldRow) return null;
    const pk = this.getRowPrimaryKey(oldRow);
    const storedRow = pk != null ? this.resultSet.get(pk) : null;
    const effectiveRow = storedRow ? {...storedRow, ...oldRow} : oldRow;
    const matched = storedRow != null || this.predicate(effectiveRow);
    if (pk != null) this.resultSet.delete(pk);
    if (matched) {
      return this._makeDeleteEvent(effectiveRow, hlc, useDeltaFormat);
    }
    return null;
  }

  _evaluateUpdate(oldRow, newRow, hlc, useDeltaFormat) {
    const pk = this.getRowPrimaryKey(newRow) ?? this.getRowPrimaryKey(oldRow);
    const storedRow = pk != null ? this.resultSet.get(pk) : null;
    const {effectiveOld, effectiveNew} = resolveEffectiveRows(storedRow, oldRow, newRow);

    const oldMatched = storedRow != null || Boolean(effectiveOld && this.predicate(effectiveOld));
    const newMatched = Boolean(effectiveNew && this.predicate(effectiveNew));
    updateStoredRowState(this.resultSet, pk, newMatched, effectiveNew);

    if (!oldMatched && newMatched) {
      return this._makeInsertEvent(effectiveNew, hlc, useDeltaFormat);
    }
    if (oldMatched && !newMatched) {
      return this._makeDeleteEvent(effectiveOld, hlc, useDeltaFormat);
    }
    if (oldMatched && newMatched) {
      return this._makeUpdateEvent(effectiveOld, effectiveNew, hlc, useDeltaFormat);
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

  /**
   * Update partition subscriptions (for split/merge handling and initial wiring).
   * @param {Function} subscribeToPartition - Function to subscribe to a partition.
   * @param {Function} unsubscribeFromPartition - Function to unsubscribe.
   * @param {Object} [options] - Handshake options.
   * @return {Promise<void>}
   */
  async updatePartitionSubscriptions(subscribeToPartition, unsubscribeFromPartition, options = {}) {
    const relevantPartitions = await this.findPartitionsForQuery();
    await unsubscribeStalePartitions(this, relevantPartitions, unsubscribeFromPartition);
    await subscribeNewPartitions(this, relevantPartitions, subscribeToPartition, options);
  }

  /**
   * Get query signature for grouping.
   * @return {string} Query signature.
   */
  getQuerySignature() {
    if (this.groupKey) {
      return this.groupKey;
    }
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
    this.resultSet.clear();
    this.removeAllListeners();

    this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_CLEANED_UP, {
      queryId: this.queryId, table: this.table,
    });
  }
}

export {QueryGroup};
