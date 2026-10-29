/**
 * Live Query Manager - Manages live query subscriptions and query grouping.
 * Handles CDC subscriptions, client grouping, and lifecycle management.
 * Requirements: 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 33.10, 33.11, 33.12,
 *               33.13, 33.14, 33.15, 33.18, 33.19, 33.20
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_EMIT,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_SUBSYSTEM,
} from './live-query-constants.js';
import {QueryGroup} from './live-query-group.js';
import {canonicalizePredicate} from './live-query-service.js';
import {
  buildSelectSQL as renderSelectSQL,
  extractReferencedTables,
} from './live-query-sql-renderer.js';

const LOCAL_NUM_ZERO_POINT_SEVEN = 0.7;

/**
 * LiveQueryManager manages all live query subscriptions.
 */
class LiveQueryManager extends EventEmitter {
  /**
   * Create a new LiveQueryManager.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine for snapshots.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    super();

    this.systemCache = options.systemCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.nodeId = options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN;

    // Query groups: groupKey -> QueryGroup
    this.queryGroups = new Map();

    // Client subscriptions: clientId -> Set<queryId>
    this.clientSubscriptions = new Map();

    // Client query counts for limits
    this.clientQueryCounts = new Map();

    // Configuration
    this.config = ConfigurationManager.getInstance();
    this.maxQueriesPerClient = this.config.get(LIVE_QUERY_CONFIG_KEY.MAX_PER_CLIENT) ||
      LIVE_QUERY_DEFAULTS.MAX_PER_CLIENT;
    this.cleanupIntervalMs = this.config.get(LIVE_QUERY_CONFIG_KEY.CLEANUP_INTERVAL_MS) ||
      LIVE_QUERY_DEFAULTS.CLEANUP_INTERVAL_MS;
    this.cursorRetentionMs = this.config.get(LIVE_QUERY_CONFIG_KEY.CURSOR_RETENTION_MS) ||
      LIVE_QUERY_DEFAULTS.CURSOR_RETENTION_MS;

    // Cleanup interval
    this.cleanupInterval = null;

    // CDC subscription functions (injected)
    this.subscribeToPartition = null;
    this.unsubscribeFromPartition = null;

    // Partition topology handler
    this.partitionTopologyHandler = null;

    // Status
    this.initialized = false;

    // Logging
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
        return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.LIVE_QUERY_MANAGER);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize the manager.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (options.systemCache) {
      this.systemCache = options.systemCache;
    }
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }
    if (options.subscribeToPartition) {
      this.subscribeToPartition = options.subscribeToPartition;
    }
    if (options.unsubscribeFromPartition) {
      this.unsubscribeFromPartition = options.unsubscribeFromPartition;
    }

    // Start cleanup loop
    this.startCleanupLoop();

    this.initialized = true;

    this.logger.info(LIVE_QUERY_LOG_MSG.MANAGER_INITIALIZED, {
      nodeId: this.nodeId,
      maxQueriesPerClient: this.maxQueriesPerClient,
    });
  }

  /**
   * Register a live query for a client.
   * @param {Object} parsedQuery - Parsed SELECT query AST.
   * @param {Object} client - Client connection.
   * @return {Promise<Object>} Registration result.
   */
  async registerLiveQuery(parsedQuery, client, options = {}) {
    const clientId = client.id || client.clientId;

    // Check client query limit
    const currentCount = this.clientQueryCounts.get(clientId) || 0;
    if (currentCount >= this.maxQueriesPerClient) {
      throw new Error(
        `${LIVE_QUERY_ERROR_MSG.MAX_QUERIES_EXCEEDED_PREFIX}` +
          `${this.maxQueriesPerClient}` +
          `${LIVE_QUERY_ERROR_MSG.MAX_QUERIES_EXCEEDED_SUFFIX}`,
      );
    }

    // Compute group key across all referenced tables
    const tables = extractReferencedTables(parsedQuery);
    const tablePrefix = tables.length > 0 ? tables.join(',') : (parsedQuery?.from?.name || '');
    const groupKey = `${tablePrefix}${LIVE_QUERY_CURSOR.SEPARATOR}` +
      `${canonicalizePredicate(parsedQuery?.where)}`;

    let group = this.queryGroups.get(groupKey);
    let isNewGroup = false;

    if (group) {
      // Join existing group
      group.addClient(client);

      this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_JOINED_EXISTING, {
        groupKey,
        queryId: group.queryId,
        clientId,
        clientCount: group.clients.size,
      });

      // Send initial snapshot to joining client
      await this.sendSnapshotToClient(group, client, options);
    } else {
      // Create new group
      group = new QueryGroup({
        parsedQuery,
        rawSql: typeof parsedQuery === 'string' ? parsedQuery : (parsedQuery?.sql || options.sql),
        systemCache: this.systemCache,
        sqlQueryEngine: this.sqlQueryEngine,
        partitionResolver: options.partitionResolver,
        nodeId: this.nodeId,
        deltaFormat: options.deltaFormat ?? false,
      });
      group.addClient(client);
      this.queryGroups.set(groupKey, group);
      isNewGroup = true;

      // Arm subscriptions in buffering mode before snapshot hydration
      group.startHydration();

      await group.updatePartitionSubscriptions(
        this.subscribeToPartition,
        this.unsubscribeFromPartition,
        options,
      );

      // Execute snapshot and record frontiers
      await this.sendSnapshotToClient(group, client, options);

      // Drain buffered CDC events deduplicating version <= attachAfterVersion
      group.drainBufferedEvents();
      group.active = true;

      this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_CREATED, {
        groupKey,
        queryId: group.queryId,
        partitionCount: group.subscribedPartitions.size,
      });
    }

    // Track client subscriptions
    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, new Set());
    }
    this.clientSubscriptions.get(clientId).add(group.queryId);

    // Update client query count
    this.clientQueryCounts.set(clientId, currentCount + 1);

    // Log creation event
    this.logger.info(LIVE_QUERY_LOG_MSG.SUBSCRIPTION_CREATED, {
      queryId: group.queryId,
      clientId,
      table: group.table,
      isNewGroup,
    });

    this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_CREATED, {
      queryId: group.queryId,
      clientId,
      table: group.table,
      groupKey,
    });

    return {
      queryId: group.queryId,
      expiresAt: Date.now() + group.ttlMs,
      renewBefore: Date.now() + Math.floor(group.ttlMs * LOCAL_NUM_ZERO_POINT_SEVEN),
      partitions: Array.from(group.subscribedPartitions),
    };
  }


  /**
   * Send initial snapshot to a client.
   * @param {Object} group - Query group.
   * @param {Object} client - Client connection.
   * @param {Object} [options] - Snapshot options.
   * @return {Promise<void>}
   */
  async sendSnapshotToClient(group, client, options = {}) {
    if (!this.sqlQueryEngine) {
      this.logger.warn(LIVE_QUERY_LOG_MSG.SNAPSHOT_ENGINE_UNAVAILABLE, {
        queryId: group.queryId,
      });
      return;
    }

    try {
      // Execute the full original query (including WHERE, ORDER BY, LIMIT, JOIN)
      const sql = group.sql ||
        (this.sqlQueryEngine.executor?.buildSelectSQL ?
          this.sqlQueryEngine.executor.buildSelectSQL(group.parsedQuery) :
          this.buildSelectSQL(group.parsedQuery));
      const result = await this.sqlQueryEngine.executeQuery(sql);

      const rows = result.rows ?? result.results ?? [];
      group.lastResultSet = rows;

      // Record frontiers if provided
      if (options.attachAfterVersion !== undefined && options.partitionId) {
        group.partitionFrontiers.set(options.partitionId, options.attachAfterVersion);
      }
      if (options.partitionFrontiers) {
        for (const [pid, ver] of options.partitionFrontiers) {
          group.partitionFrontiers.set(pid, ver);
        }
      }
      if (result.appliedIndex !== undefined && options.partitionId) {
        group.partitionFrontiers.set(options.partitionId, result.appliedIndex);
      }

      const snapshot = {
        type: LIVE_QUERY_EVENT.SNAPSHOT,
        queryId: group.queryId,
        rows,
        count: result.count ?? rows.length,
      };

      if (client && typeof client.send === 'function') {
        client.send(JSON.stringify(snapshot));
      }

      this.logger.debug(LIVE_QUERY_LOG_MSG.SNAPSHOT_SENT, {
        queryId: group.queryId,
        clientId: client.id,
        rowCount: snapshot.count,
      });
    } catch (error) {
      this.logger.error(LIVE_QUERY_LOG_MSG.SNAPSHOT_FAILED, {
        queryId: group.queryId,
        error: error.message,
      });

      // Send error to client
      if (client && typeof client.send === 'function') {
        client.send(JSON.stringify({
          type: LIVE_QUERY_EVENT.ERROR,
          queryId: group.queryId,
          error: error.message,
        }));
      }
      throw error;
    }
  }

  /**
   * Build SELECT SQL from parsed query.
   * @param {Object} parsedQuery - Parsed query AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(parsedQuery) {
    return renderSelectSQL(parsedQuery);
  }

  /**
   * Renew a live query subscription.
   * @param {string} queryId - Query ID.
   * @param {string} clientId - Client ID.
   * @param {string} cursor - Last seen HLC timestamp.
   * @return {Object|null} Renewal result or null.
   */
  renewLiveQuery(queryId, clientId, cursor) {
    const group = this.findGroupByQueryId(queryId);
    if (!group) {
      return null;
    }

    const result = group.renewClient(clientId, cursor);

    if (result) {
      this.logger.debug(LIVE_QUERY_LOG_MSG.QUERY_RENEWED, {
        queryId,
        clientId,
        cursor,
      });

      this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_RENEWED, {
        queryId,
        clientId,
        cursor,
      });
    }

    return result;
  }

  /**
   * Resume a live query from cursor position.
   * @param {string} queryId - Query ID.
   * @param {string} clientId - Client ID.
   * @param {string} cursor - HLC cursor to resume from.
   * @return {Promise<Object>} Resume result.
   */
  async resumeLiveQuery(queryId, clientId, cursor) {
    const group = this.findGroupByQueryId(queryId);
    if (!group) {
      throw new Error(`${LIVE_QUERY_ERROR_MSG.QUERY_GROUP_NOT_FOUND_PREFIX}${queryId}`);
    }

    // Validate cursor is within retention window
    const cursorTime = this.parseCursorTime(cursor);
    const oldestAllowed = Date.now() - this.cursorRetentionMs;

    if (cursorTime < oldestAllowed) {
      throw new Error(LIVE_QUERY_ERROR_MSG.CURSOR_TOO_OLD);
    }

    // Re-add client to group
    const client = {id: clientId};
    group.addClient(client);

    // Track subscription
    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, new Set());
    }
    this.clientSubscriptions.get(clientId).add(queryId);

    // Update query count
    const currentCount = this.clientQueryCounts.get(clientId) || 0;
    this.clientQueryCounts.set(clientId, currentCount + 1);

    this.logger.info(LIVE_QUERY_LOG_MSG.QUERY_RESUMED, {
      queryId,
      clientId,
      cursor,
    });

    return {
      queryId,
      resumed: true,
      fromCursor: cursor,
      expiresAt: Date.now() + group.ttlMs,
    };
  }

  /**
   * Parse cursor time from HLC string.
   * @param {string} cursor - HLC cursor string.
   * @return {number} Physical time in milliseconds.
   * @private
   */
  parseCursorTime(cursor) {
    if (!cursor) return 0;

    // HLC format: "physical:logical:nodeId" or just timestamp
    const parts = cursor.split(LIVE_QUERY_CURSOR.SEPARATOR);
    const physical = parseInt(parts[0], 10);
    return isNaN(physical) ? 0 : physical;
  }

  /**
   * Unregister a live query for a client.
   * @param {string} queryId - Query ID.
   * @param {string} clientId - Client ID.
   */
  unregisterLiveQuery(queryId, clientId) {
    const group = this.findGroupByQueryId(queryId);
    if (!group) return;

    const shouldRemove = group.removeClient(clientId);

    // Update tracking
    const subscriptions = this.clientSubscriptions.get(clientId);
    if (subscriptions) {
      subscriptions.delete(queryId);
      if (subscriptions.size === 0) {
        this.clientSubscriptions.delete(clientId);
      }
    }

    // Update query count
    const currentCount = this.clientQueryCounts.get(clientId) || 0;
    if (currentCount > 0) {
      this.clientQueryCounts.set(clientId, currentCount - 1);
    }

    // Remove empty group
    if (shouldRemove) {
      this.removeGroup(group);
    }

    this.logger.info(LIVE_QUERY_LOG_MSG.QUERY_UNREGISTERED, {
      queryId,
      clientId,
      groupRemoved: shouldRemove,
    });

    this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_REMOVED, {
      queryId,
      clientId,
    });
  }

  /**
   * Find a query group by query ID.
   * @param {string} queryId - Query ID.
   * @return {QueryGroup|null} Query group or null.
   */
  findGroupByQueryId(queryId) {
    for (const group of this.queryGroups.values()) {
      if (group.queryId === queryId) {
        return group;
      }
    }
    return null;
  }

  /**
   * Remove a query group.
   * @param {QueryGroup} group - Query group to remove.
   * @private
   */
  removeGroup(group) {
    const groupKey = group.getQuerySignature();
    if (this.unsubscribeFromPartition) {
      for (const partitionId of Array.from(group.subscribedPartitions)) {
        try {
          const res = this.unsubscribeFromPartition(partitionId, group.queryId);
          if (res && typeof res.catch === 'function') {
            res.catch(() => undefined);
          }
        } catch (error) {
          this.logger.debug(LIVE_QUERY_LOG_MSG.UNSUBSCRIBE_PARTITION_FAILED, {
            partitionId,
            queryId: group.queryId,
            error: error?.message,
          });
        }
      }
    }
    group.cleanup();
    this.queryGroups.delete(groupKey);

    this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_REMOVED, {
      queryId: group.queryId,
      groupKey,
    });
  }


  /**
   * Handle client disconnection.
   * @param {string} clientId - Client ID.
   */
  handleClientDisconnection(clientId) {
    this.removeAllClientSubscriptions(clientId);

    this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_DISCONNECTED_CLEANUP, {
      clientId,
    });
  }

  /**
   * Remove all subscriptions for a client.
   * @param {string} clientId - Client ID.
   */
  removeAllClientSubscriptions(clientId) {
    const subscriptions = this.clientSubscriptions.get(clientId);

    if (subscriptions) {
      for (const queryId of subscriptions) {
        const group = this.findGroupByQueryId(queryId);
        if (group) {
          const shouldRemove = group.removeClient(clientId);
          if (shouldRemove) {
            this.removeGroup(group);
          }
        }
      }

      this.clientSubscriptions.delete(clientId);
    }

    this.clientQueryCounts.delete(clientId);
  }

  /**
   * Handle partition topology change (split/merge).
   * @param {Object} change - Partition CDC change event.
   */
  async handlePartitionTopologyChange(change) {
    const tableName = change.new?.table_name || change.old?.table_name ||
      change.new?.tableName || change.old?.tableName;

    // Find all groups that reference this table
    for (const group of this.queryGroups.values()) {
      const referencesTable = (group.tables && group.tables.includes(tableName)) ||
        group.table === tableName;

      if (referencesTable) {
        this.logger.info(LIVE_QUERY_LOG_MSG.SUBSCRIPTIONS_PARTITION_CHANGE, {
          queryId: group.queryId,
          table: tableName,
          operation: change.operation,
        });

        await group.updatePartitionSubscriptions(
          this.subscribeToPartition,
          this.unsubscribeFromPartition,
        );
      }
    }
  }

  /**
   * Start the cleanup loop for expired subscriptions.
   * @private
   */
  startCleanupLoop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSubscriptions();
    }, this.cleanupIntervalMs);
    this.cleanupInterval.unref();
  }

  /**
   * Clean up expired subscriptions.
   * @private
   */
  cleanupExpiredSubscriptions() {
    for (const [groupKey, group] of this.queryGroups) {
      const expiredClients = group.getExpiredClients();

      for (const clientId of expiredClients) {
        group.removeClient(clientId);

        // Update tracking
        const subscriptions = this.clientSubscriptions.get(clientId);
        if (subscriptions) {
          subscriptions.delete(group.queryId);
          if (subscriptions.size === 0) {
            this.clientSubscriptions.delete(clientId);
          }
        }

        const currentCount = this.clientQueryCounts.get(clientId) || 0;
        if (currentCount > 0) {
          this.clientQueryCounts.set(clientId, currentCount - 1);
        }

        this.logger.info(LIVE_QUERY_LOG_MSG.SUBSCRIPTION_EXPIRED, {
          queryId: group.queryId,
          clientId,
        });

        this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_EXPIRED, {
          queryId: group.queryId,
          clientId,
        });
      }

      // Remove empty groups
      if (group.clients.size === 0) {
        this.removeGroup(group);
        this.queryGroups.delete(groupKey);
      }
    }
  }

  /**
   * Get all live queries for monitoring.
   * @return {Array} Array of query metadata.
   */
  getAllQueries() {
    const queries = [];
    for (const group of this.queryGroups.values()) {
      queries.push(group.getMetadata());
    }
    return queries;
  }

  /**
   * Get statistics.
   * @return {Object} Manager statistics.
   */
  getStats() {
    let totalClients = 0;
    for (const group of this.queryGroups.values()) {
      totalClients += group.clients.size;
    }

    return {
      queryGroupCount: this.queryGroups.size,
      totalClientSubscriptions: totalClients,
      uniqueClients: this.clientSubscriptions.size,
    };
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clean up all groups
    for (const group of this.queryGroups.values()) {
      group.cleanup();
    }
    this.queryGroups.clear();
    this.clientSubscriptions.clear();
    this.clientQueryCounts.clear();

    this.initialized = false;
    this.removeAllListeners();

    this.logger.info(LIVE_QUERY_LOG_MSG.MANAGER_SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}

export {LiveQueryManager, QueryGroup};
