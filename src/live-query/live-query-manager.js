/**
 * Live Query Manager - Manages live query subscriptions and query grouping.
 * Handles CDC subscriptions, client grouping, and lifecycle management.
 * Requirements: 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 33.10, 33.11, 33.12,
 *               33.13, 33.14, 33.15, 33.18, 33.19, 33.20
 */

import {v4 as uuidv4} from 'uuid';
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  LiveQueryEventType,
  compilePredicate,
  canonicalizePredicate,
  extractPartitionKeyValue,
} from './live-query-service.js';

/**
 * QueryGroup manages clients with identical queries sharing CDC subscriptions.
 */
class QueryGroup extends EventEmitter {
  /**
   * Create a new QueryGroup.
   * @param {Object} options - Configuration options.
   * @param {Object} options.parsedQuery - Parsed SELECT query AST.
   * @param {Object} options.systemCache - System table cache.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    super();

    this.queryId = uuidv4();
    this.parsedQuery = options.parsedQuery || null;
    this.systemCache = options.systemCache || null;
    this.nodeId = options.nodeId || 'unknown';

    // Extract table name
    this.table = this.parsedQuery?.from?.name || null;

    // Compile predicate
    this.predicate = compilePredicate(this.parsedQuery?.where);
    this.whereClause = this.parsedQuery?.where || null;

    // Clients in this group: clientId -> ClientSubscription
    this.clients = new Map();

    // Subscribed partitions
    this.subscribedPartitions = new Set();

    // CDC subscription handlers
    this.cdcHandlers = new Map();

    // Configuration
    this.config = ConfigurationManager.getInstance();
    this.ttlMs = this.config.get('liveQuery.defaultTtlMs') || 30000;

    // Partition key info
    this.partitionKeyColumn = null;
    this.partitionKeyValue = null;

    // Status
    this.active = false;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

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
        return loggingService.forSubsystem('query-group');
      }
    } catch {
      // Logging not available
    }
    return console;
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

    this.logger.info('Client joined query group', {
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

    this.logger.info('Client left query group', {
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
      renewBefore: subscription.lastRenewal + Math.floor(subscription.ttlMs * 0.7),
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
   * @return {string|null} Partition key column name.
   */
  getPartitionKeyColumn() {
    if (this.partitionKeyColumn) {
      return this.partitionKeyColumn;
    }

    if (!this.systemCache || !this.table) {
      return null;
    }

    try {
      const tableInfo = this.systemCache.get('tables', this.table) ||
        this.systemCache.find('tables', (t) =>
          t.table_name === this.table || t.tableName === this.table,
        );

      if (tableInfo) {
        this.partitionKeyColumn = tableInfo.primary_key ||
          tableInfo.primaryKey || 'id';
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }

    return 'id';
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
   * Find partitions for the query based on partition key.
   * @return {Promise<Set>} Set of partition IDs.
   */
  async findPartitionsForQuery() {
    const keyValue = this.extractPartitionKeyValue();

    if (!this.systemCache) {
      return new Set();
    }

    try {
      const partitions = this.systemCache.filter('partitions', (p) =>
        p.table_name === this.table || p.tableName === this.table,
      ) || [];

      if (keyValue === null) {
        // No partition key filter - subscribe to all partitions
        this.logger.warn('Live query without partition key filter', {
          queryId: this.queryId,
          table: this.table,
        });
        return new Set(partitions.map((p) => p.partition_id || p.partitionId));
      }

      // Find partitions containing the key value(s)
      const matching = new Set();
      const keyValues = Array.isArray(keyValue) ? keyValue : [keyValue];

      for (const partition of partitions) {
        for (const kv of keyValues) {
          if (this.isKeyInPartition(kv, partition)) {
            matching.add(partition.partition_id || partition.partitionId);
          }
        }
      }

      return matching;
    } catch (error) {
      this.logger.error('Failed to find partitions for query', {
        queryId: this.queryId,
        error: error.message,
      });
      return new Set();
    }
  }

  /**
   * Check if a key value falls within a partition's range.
   * @param {*} key - Key value.
   * @param {Object} partition - Partition info.
   * @return {boolean} True if key in partition.
   */
  isKeyInPartition(key, partition) {
    const start = partition.partition_key_start ?? partition.keyRange?.start;
    const end = partition.partition_key_end ?? partition.keyRange?.end;

    // NULL start/end means unbounded
    if ((start === null || start === undefined) &&
        (end === null || end === undefined)) {
      return true;
    }

    if (start === null || start === undefined) {
      return this.compareValues(key, end) < 0;
    }

    if (end === null || end === undefined) {
      return this.compareValues(key, start) >= 0;
    }

    return this.compareValues(key, start) >= 0 &&
           this.compareValues(key, end) < 0;
  }

  /**
   * Compare two values.
   * @param {*} a - First value.
   * @param {*} b - Second value.
   * @return {number} Comparison result.
   */
  compareValues(a, b) {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }

    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    return String(a).localeCompare(String(b));
  }

  /**
   * Handle a CDC event from a partition.
   * Evaluates predicate and fans out to all clients.
   * @param {Object} change - CDC change event.
   */
  handleCDCEvent(change) {
    const result = this.evaluateChange(change);

    if (result) {
      this.lastActivityAt = Date.now();

      // Fan-out to all clients
      for (const [clientId, subscription] of this.clients) {
        try {
          if (subscription.client && typeof subscription.client.send === 'function') {
            subscription.client.send(JSON.stringify(result));
          }
          subscription.lastSeenHLC = change.hlc_timestamp || change.hlcTimestamp;
        } catch (error) {
          this.logger.warn('Failed to send to client', {
            queryId: this.queryId,
            clientId,
            error: error.message,
          });
        }
      }

      this.emit('change', result);
    }
  }

  /**
   * Evaluate a CDC change against the predicate.
   * @param {Object} change - CDC change event.
   * @return {Object|null} Event to send to clients or null.
   */
  evaluateChange(change) {
    const {operation, data: newRow, old_data: oldRow} = change;
    const hlc = change.hlc_timestamp || change.hlcTimestamp;

    switch (operation?.toUpperCase()) {
    case 'INSERT':
      if (newRow && this.predicate(newRow)) {
        return {
          type: LiveQueryEventType.INSERT,
          queryId: this.queryId,
          row: newRow,
          hlc,
        };
      }
      break;

    case 'UPDATE': {
      const oldMatched = oldRow && this.predicate(oldRow);
      const newMatched = newRow && this.predicate(newRow);

      if (!oldMatched && newMatched) {
        // Row now matches predicate - treat as insert
        return {
          type: LiveQueryEventType.INSERT,
          queryId: this.queryId,
          row: newRow,
          hlc,
        };
      } else if (oldMatched && !newMatched) {
        // Row no longer matches - treat as delete
        return {
          type: LiveQueryEventType.DELETE,
          queryId: this.queryId,
          row: oldRow,
          hlc,
        };
      } else if (oldMatched && newMatched) {
        // Row still matches - send update
        return {
          type: LiveQueryEventType.UPDATE,
          queryId: this.queryId,
          old: oldRow,
          new: newRow,
          hlc,
        };
      }
      break;
    }

    case 'DELETE':
      if (oldRow && this.predicate(oldRow)) {
        return {
          type: LiveQueryEventType.DELETE,
          queryId: this.queryId,
          row: oldRow,
          hlc,
        };
      }
      break;
    }

    return null;
  }

  /**
   * Update partition subscriptions (for split/merge handling).
   * @param {Function} subscribeToPartition - Function to subscribe to a partition.
   * @param {Function} unsubscribeFromPartition - Function to unsubscribe.
   * @return {Promise<void>}
   */
  async updatePartitionSubscriptions(subscribeToPartition, unsubscribeFromPartition) {
    const relevantPartitions = await this.findPartitionsForQuery();

    // Unsubscribe from partitions no longer relevant
    for (const partitionId of this.subscribedPartitions) {
      if (!relevantPartitions.has(partitionId)) {
        if (unsubscribeFromPartition) {
          await unsubscribeFromPartition(partitionId, this.queryId);
        }
        this.subscribedPartitions.delete(partitionId);

        this.logger.debug('Unsubscribed from partition', {
          queryId: this.queryId,
          partitionId,
        });
      }
    }

    // Subscribe to new partitions
    for (const partitionId of relevantPartitions) {
      if (!this.subscribedPartitions.has(partitionId)) {
        if (subscribeToPartition) {
          await subscribeToPartition(partitionId, this.queryId, (change) => {
            this.handleCDCEvent(change);
          });
        }
        this.subscribedPartitions.add(partitionId);

        this.logger.debug('Subscribed to partition', {
          queryId: this.queryId,
          partitionId,
        });
      }
    }
  }

  /**
   * Get query signature for grouping.
   * @return {string} Query signature.
   */
  getQuerySignature() {
    return `${this.table}:${canonicalizePredicate(this.whereClause)}`;
  }

  /**
   * Get group metadata for monitoring.
   * @return {Object} Group metadata.
   */
  getMetadata() {
    return {
      queryId: this.queryId,
      table: this.table,
      predicateHash: canonicalizePredicate(this.whereClause).substring(0, 32),
      partitionKeyValue: this.partitionKeyValue,
      clientCount: this.clients.size,
      subscribedPartitions: Array.from(this.subscribedPartitions),
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      active: this.active,
    };
  }

  /**
   * Clean up resources.
   */
  cleanup() {
    this.active = false;
    this.clients.clear();
    this.subscribedPartitions.clear();
    this.cdcHandlers.clear();
    this.removeAllListeners();

    this.logger.info('Query group cleaned up', {
      queryId: this.queryId,
      table: this.table,
    });
  }
}


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
    this.nodeId = options.nodeId || 'unknown';

    // Query groups: groupKey -> QueryGroup
    this.queryGroups = new Map();

    // Client subscriptions: clientId -> Set<queryId>
    this.clientSubscriptions = new Map();

    // Client query counts for limits
    this.clientQueryCounts = new Map();

    // Configuration
    this.config = ConfigurationManager.getInstance();
    this.maxQueriesPerClient = this.config.get('liveQuery.maxPerClient') || 100;
    this.cleanupIntervalMs = this.config.get('liveQuery.cleanupIntervalMs') || 5000;
    this.cursorRetentionMs = this.config.get('liveQuery.cursorRetentionMs') || 300000;

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
        return loggingService.forSubsystem('live-query-manager');
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

    this.logger.info('Live query manager initialized', {
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
  async registerLiveQuery(parsedQuery, client) {
    const clientId = client.id || client.clientId;

    // Check client query limit
    const currentCount = this.clientQueryCounts.get(clientId) || 0;
    if (currentCount >= this.maxQueriesPerClient) {
      throw new Error(
        `Maximum concurrent live queries exceeded (${this.maxQueriesPerClient})`,
      );
    }

    // Compute group key
    const table = parsedQuery?.from?.name;
    const groupKey = `${table}:${canonicalizePredicate(parsedQuery?.where)}`;

    let group = this.queryGroups.get(groupKey);
    let isNewGroup = false;

    if (group) {
      // Join existing group
      group.addClient(client);

      this.logger.info('Client joined existing query group', {
        groupKey,
        queryId: group.queryId,
        clientId,
        clientCount: group.clients.size,
      });
    } else {
      // Create new group
      group = new QueryGroup({
        parsedQuery,
        systemCache: this.systemCache,
        nodeId: this.nodeId,
      });
      group.addClient(client);
      this.queryGroups.set(groupKey, group);
      isNewGroup = true;

      // Start CDC subscriptions
      await group.updatePartitionSubscriptions(
        this.subscribeToPartition,
        this.unsubscribeFromPartition,
      );
      group.active = true;

      this.logger.info('Created new query group', {
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
    this.logger.info('Live query subscription created', {
      queryId: group.queryId,
      clientId,
      table,
      isNewGroup,
    });

    this.emit('subscription-created', {
      queryId: group.queryId,
      clientId,
      table,
      groupKey,
    });

    return {
      queryId: group.queryId,
      expiresAt: Date.now() + group.ttlMs,
      renewBefore: Date.now() + Math.floor(group.ttlMs * 0.7),
      partitions: Array.from(group.subscribedPartitions),
    };
  }


  /**
   * Send initial snapshot to a client.
   * @param {Object} group - Query group.
   * @param {Object} client - Client connection.
   * @return {Promise<void>}
   */
  async sendSnapshotToClient(group, client) {
    if (!this.sqlQueryEngine) {
      this.logger.warn('SQL query engine not available for snapshot', {
        queryId: group.queryId,
      });
      return;
    }

    try {
      // Build SELECT query from parsed query
      const sql = this.buildSelectSQL(group.parsedQuery);
      const result = await this.sqlQueryEngine.executeQuery(sql);

      const snapshot = {
        type: LiveQueryEventType.SNAPSHOT,
        queryId: group.queryId,
        rows: result.results || [],
        count: result.count || 0,
      };

      if (client && typeof client.send === 'function') {
        client.send(JSON.stringify(snapshot));
      }

      this.logger.debug('Snapshot sent to client', {
        queryId: group.queryId,
        clientId: client.id,
        rowCount: snapshot.count,
      });
    } catch (error) {
      this.logger.error('Failed to send snapshot', {
        queryId: group.queryId,
        error: error.message,
      });

      // Send error to client
      if (client && typeof client.send === 'function') {
        client.send(JSON.stringify({
          type: LiveQueryEventType.ERROR,
          queryId: group.queryId,
          error: error.message,
        }));
      }
    }
  }

  /**
   * Build SELECT SQL from parsed query.
   * @param {Object} parsedQuery - Parsed query AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(parsedQuery) {
    // Simple reconstruction - in production would use proper SQL builder
    const parts = ['SELECT'];

    // Columns
    if (parsedQuery.columns) {
      const cols = parsedQuery.columns.map((c) => {
        if (c.type === 'star') return '*';
        if (c.expression?.type === 'column_ref') {
          const col = c.expression.column || c.expression.name;
          return c.alias ? `${col} AS ${c.alias}` : col;
        }
        return '*';
      });
      parts.push(cols.join(', '));
    } else {
      parts.push('*');
    }

    // FROM
    parts.push('FROM', parsedQuery.from?.name || 'unknown');

    // WHERE (simplified - would need full AST to SQL conversion)
    // For now, we rely on the original SQL being available

    return parts.join(' ');
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
      this.logger.debug('Live query renewed', {
        queryId,
        clientId,
        cursor,
      });

      this.emit('subscription-renewed', {
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
      throw new Error(`Query group not found: ${queryId}`);
    }

    // Validate cursor is within retention window
    const cursorTime = this.parseCursorTime(cursor);
    const oldestAllowed = Date.now() - this.cursorRetentionMs;

    if (cursorTime < oldestAllowed) {
      throw new Error('Cursor too old - full resync required');
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

    this.logger.info('Live query resumed', {
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
    const parts = cursor.split(':');
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

    this.logger.info('Live query unregistered', {
      queryId,
      clientId,
      groupRemoved: shouldRemove,
    });

    this.emit('subscription-removed', {
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
    group.cleanup();
    this.queryGroups.delete(groupKey);

    this.logger.info('Query group removed', {
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

    this.logger.info('Client disconnected - cleaned up subscriptions', {
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
    const tableName = change.new?.table_name || change.old?.table_name;

    // Find all groups for this table
    for (const group of this.queryGroups.values()) {
      if (group.table === tableName) {
        this.logger.info('Updating subscriptions for partition change', {
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

        this.logger.info('Live query subscription expired', {
          queryId: group.queryId,
          clientId,
        });

        this.emit('subscription-expired', {
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

    this.logger.info('Live query manager shutdown', {
      nodeId: this.nodeId,
    });
  }
}

export {LiveQueryManager, QueryGroup};
