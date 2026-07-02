import {v4 as uuidv4} from 'uuid';
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
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATION,
  LIVE_QUERY_SUBSYSTEM,
} from './live-query-constants.js';
import {
  compilePredicate,
  canonicalizePredicate,
  extractPartitionKeyValue,
} from './live-query-service.js';

const LOCAL_NUM_ZERO_POINT_SEVEN = 0.7;
const LOCAL_NUM_THIRTY_TWO = 32;

const DEFAULT_PARTITION_VERSION = 1;
const ACTIVE_PARTITION_STATE = 'NORMAL';

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
    this.nodeId = options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN;

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
    this.ttlMs = this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) ||
      LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS;

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
        return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.QUERY_GROUP);
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
      const tableInfo = this.getTableInfo();

      if (tableInfo) {
        this.partitionKeyColumn = tableInfo.primary_key ||
          tableInfo.primaryKey || LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK;
        return this.partitionKeyColumn;
      }
    } catch {
      // Cache not available
    }

    return LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK;
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
      const tableInfo = this.getTableInfo();
      const activePartitionVersion = this.resolveActivePartitionVersion(tableInfo);
      const partitions = (this.systemCache.filter(TABLES.PARTITIONS, (p) =>
        p.table_name === this.table || p.tableName === this.table,
      ) || []).filter((partition) =>
        this.isPartitionVisibleForRouting(partition, activePartitionVersion),
      );

      if (keyValue === null) {
        // No partition key filter - subscribe to all partitions
        this.logger.warn(LIVE_QUERY_LOG_MSG.NO_PARTITION_KEY_FILTER, {
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
      this.logger.error(LIVE_QUERY_LOG_MSG.PARTITIONS_LOOKUP_FAILED, {
        queryId: this.queryId,
        error: error.message,
      });
      throw error;
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
   * Read current table metadata from the system cache.
   * @return {Object|null} Table metadata row.
   * @private
   */
  getTableInfo() {
    if (!this.systemCache || !this.table) {
      return null;
    }

    return this.systemCache.get(TABLES.TABLES, this.table) ||
      this.systemCache.find(TABLES.TABLES, (t) =>
        t.table_name === this.table || t.tableName === this.table,
      ) ||
      null;
  }

  /**
   * Resolve active partition version from table metadata.
   * Missing values default to version 1 for compatibility.
   * @param {Object|null} tableInfo
   * @return {number}
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    const value = tableInfo?.active_partition_version ??
      tableInfo?.activePartitionVersion;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < DEFAULT_PARTITION_VERSION) {
      return DEFAULT_PARTITION_VERSION;
    }
    return parsed;
  }

  /**
   * Determine whether a partition participates in current table routing.
   * @param {Object} partition
   * @param {number} activePartitionVersion
   * @return {boolean}
   * @private
   */
  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    const partitionVersion = Number(
      partition?.partition_version ?? partition?.partitionVersion,
    );
    const normalizedVersion = Number.isInteger(partitionVersion) &&
      partitionVersion >= DEFAULT_PARTITION_VERSION ?
      partitionVersion :
      DEFAULT_PARTITION_VERSION;
    if (normalizedVersion !== activePartitionVersion) {
      return false;
    }

    const state = String(
      partition?.state ?? ACTIVE_PARTITION_STATE,
    ).toUpperCase();
    return state === ACTIVE_PARTITION_STATE;
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
          this.logger.warn(LIVE_QUERY_LOG_MSG.FAILED_SEND_CLIENT, {
            queryId: this.queryId,
            clientId,
            error: error.message,
          });
          throw error;
        }
      }

      this.emit(LIVE_QUERY_EMIT.CHANGE, result);
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
    case LIVE_QUERY_OPERATION.INSERT:
      if (newRow && this.predicate(newRow)) {
        return {
          type: LIVE_QUERY_EVENT.INSERT,
          queryId: this.queryId,
          row: newRow,
          hlc,
        };
      }
      break;

    case LIVE_QUERY_OPERATION.UPDATE: {
      const oldMatched = oldRow && this.predicate(oldRow);
      const newMatched = newRow && this.predicate(newRow);

      if (!oldMatched && newMatched) {
        // Row now matches predicate - treat as insert
        return {
          type: LIVE_QUERY_EVENT.INSERT,
          queryId: this.queryId,
          row: newRow,
          hlc,
        };
      } else if (oldMatched && !newMatched) {
        // Row no longer matches - treat as delete
        return {
          type: LIVE_QUERY_EVENT.DELETE,
          queryId: this.queryId,
          row: oldRow,
          hlc,
        };
      } else if (oldMatched && newMatched) {
        // Row still matches - send update
        return {
          type: LIVE_QUERY_EVENT.UPDATE,
          queryId: this.queryId,
          old: oldRow,
          new: newRow,
          hlc,
        };
      }
      break;
    }

    case LIVE_QUERY_OPERATION.DELETE:
      if (oldRow && this.predicate(oldRow)) {
        return {
          type: LIVE_QUERY_EVENT.DELETE,
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

        this.logger.debug(LIVE_QUERY_LOG_MSG.UNSUBSCRIBED_PARTITION, {
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

        this.logger.debug(LIVE_QUERY_LOG_MSG.SUBSCRIBED_PARTITION, {
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
    return `${this.table}${LIVE_QUERY_CURSOR.SEPARATOR}` +
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
      predicateHash: canonicalizePredicate(this.whereClause)
        .substring(0, LOCAL_NUM_THIRTY_TWO),
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

    this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_CLEANED_UP, {
      queryId: this.queryId,
      table: this.table,
    });
  }
}

export {QueryGroup};
