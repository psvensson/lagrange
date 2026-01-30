/**
 * System Cache Query Service - API for local services to query system information.
 * Routes queries to any local message group replica.
 * Requirements: 4.5, 4.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {ERRORS} from '../constants/index.js';

/**
 * Query types supported by the service.
 */
const QueryType = {
  GET: 'get',
  FIND: 'find',
  FILTER: 'filter',
  GET_ALL: 'getAll',
  HAS: 'has',
  COUNT: 'count',
};

/**
 * SystemCacheQueryService provides an API for local services to query
 * system information from message group caches.
 */
class SystemCacheQueryService extends EventEmitter {
  /**
   * Create a new SystemCacheQueryService.
   * @param {Object} options - Configuration options.
   * @param {Function} options.getLocalReplica - Function to get local message group replica.
   */
  constructor(options = {}) {
    super();

    this.getLocalReplica = options.getLocalReplica || null;
    this.messageGroupServices = options.messageGroupServices || new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.queryTimeoutMs = config.get(CONFIG_KEY.MESSAGE_GROUP_CACHE_TTL_MS) || 30000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('cache-query') : console;

    // Statistics
    this.queryCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Register a message group service for query routing.
   * @param {string} serviceId - Service ID.
   * @param {MessageGroupService} service - Message group service instance.
   */
  registerMessageGroup(serviceId, service) {
    this.messageGroupServices.set(serviceId, service);
    this.logger.debug('Registered message group for queries', {serviceId});
  }

  /**
   * Unregister a message group service.
   * @param {string} serviceId - Service ID.
   */
  unregisterMessageGroup(serviceId) {
    this.messageGroupServices.delete(serviceId);
    this.logger.debug('Unregistered message group from queries', {serviceId});
  }

  /**
   * Get a local message group replica for querying.
   * @return {MessageGroupService|null} Active message group service or null.
   * @private
   */
  getActiveReplica() {
    // Use provided function if available
    if (this.getLocalReplica) {
      return this.getLocalReplica();
    }

    // Find first active replica
    for (const service of this.messageGroupServices.values()) {
      if (service.initialized) {
        return service;
      }
    }

    return null;
  }

  /**
   * Query the system table cache.
   * Routes to any local message group replica.
   * @param {string} tableName - System table name.
   * @param {Object} query - Query parameters.
   * @return {Promise<*>} Query result.
   */
  async querySystemCache(tableName, query = {}) {
    this.queryCount++;

    const replica = this.getActiveReplica();
    if (!replica) {
      this.cacheMisses++;
      throw new Error('No active local message group replica available');
    }

    this.logger.debug('Routing query to message group', {
      tableName,
      queryType: this.getQueryType(query),
      replicaId: replica.replicaId,
    });

    try {
      const result = await replica.querySystemCache(tableName, query);
      this.cacheHits++;
      return result;
    } catch (error) {
      this.cacheMisses++;
      this.logger.error(ERRORS.QUERY_FAILED, {
        tableName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a single record by key.
   * @param {string} tableName - System table name.
   * @param {string} key - Record key.
   * @return {Promise<Object|undefined>} Record or undefined.
   */
  async get(tableName, key) {
    return this.querySystemCache(tableName, {key});
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Predicate function.
   * @return {Promise<Object|undefined>} First matching record or undefined.
   */
  async find(tableName, predicate) {
    return this.querySystemCache(tableName, {predicate, findOne: true});
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Predicate function.
   * @return {Promise<Array<Object>>} Matching records.
   */
  async filter(tableName, predicate) {
    return this.querySystemCache(tableName, {predicate});
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - System table name.
   * @return {Promise<Array<Object>>} All records.
   */
  async getAll(tableName) {
    return this.querySystemCache(tableName, {});
  }

  /**
   * Check if a record exists.
   * @param {string} tableName - System table name.
   * @param {string} key - Record key.
   * @return {Promise<boolean>} True if exists.
   */
  async has(tableName, key) {
    const record = await this.get(tableName, key);
    return record !== undefined;
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - System table name.
   * @return {Promise<number>} Record count.
   */
  async count(tableName) {
    const records = await this.getAll(tableName);
    return records.length;
  }

  /**
   * Get nodes from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Node records.
   */
  async getNodes(filter = {}) {
    if (filter.nodeId) {
      const node = await this.get('nodes', filter.nodeId);
      return node ? [node] : [];
    }
    if (filter.status) {
      return this.filter('nodes', (n) => n.status === filter.status);
    }
    return this.getAll('nodes');
  }

  /**
   * Get partitions from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Partition records.
   */
  async getPartitions(filter = {}) {
    if (filter.partitionId) {
      const partition = await this.get('partitions', filter.partitionId);
      return partition ? [partition] : [];
    }
    if (filter.tableId) {
      return this.filter('partitions', (p) => p.tableId === filter.tableId);
    }
    return this.getAll('partitions');
  }

  /**
   * Get tables from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Table records.
   */
  async getTables(filter = {}) {
    if (filter.tableId) {
      const table = await this.get('tables', filter.tableId);
      return table ? [table] : [];
    }
    if (filter.tableName) {
      return this.filter('tables', (t) => t.name === filter.tableName);
    }
    return this.getAll('tables');
  }

  /**
   * Get services from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Service records.
   */
  async getServices(filter = {}) {
    if (filter.serviceId) {
      const service = await this.get('services', filter.serviceId);
      return service ? [service] : [];
    }
    if (filter.nodeId) {
      return this.filter('services', (s) => s.nodeId === filter.nodeId);
    }
    if (filter.type) {
      return this.filter('services', (s) => s.type === filter.type);
    }
    return this.getAll('services');
  }

  /**
   * Get message groups from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Message group records.
   */
  async getMessageGroups(filter = {}) {
    if (filter.groupId) {
      const group = await this.get('message_groups', filter.groupId);
      return group ? [group] : [];
    }
    return this.getAll('message_groups');
  }

  /**
   * Get indices from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Index records.
   */
  async getIndices(filter = {}) {
    if (filter.indexId) {
      const index = await this.get('indices', filter.indexId);
      return index ? [index] : [];
    }
    if (filter.tableId) {
      return this.filter('indices', (i) => i.tableId === filter.tableId);
    }
    return this.getAll('indices');
  }

  /**
   * Determine query type from query parameters.
   * @param {Object} query - Query parameters.
   * @return {string} Query type.
   * @private
   */
  getQueryType(query) {
    if (query.key) return QueryType.GET;
    if (query.predicate && query.findOne) return QueryType.FIND;
    if (query.predicate) return QueryType.FILTER;
    return QueryType.GET_ALL;
  }

  /**
   * Get query statistics.
   * @return {Object} Query statistics.
   */
  getStats() {
    return {
      queryCount: this.queryCount,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.queryCount > 0 ?
        (this.cacheHits / this.queryCount * 100).toFixed(2) + '%' : '0%',
      registeredReplicas: this.messageGroupServices.size,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.queryCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

export {SystemCacheQueryService, QueryType};
