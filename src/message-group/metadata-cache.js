/**
 * Metadata Cache - Local cache with TTL for system metadata.
 * Provides caching with automatic expiration and query-on-miss behavior.
 * Requirements: 17.5, 17.6, 17.7
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';

/**
 * Cache entry status enumeration.
 */
const CacheEntryStatus = {
  VALID: 'valid',
  EXPIRED: 'expired',
  STALE: 'stale',
};

/**
 * Default cache configuration.
 */
const DEFAULT_CACHE_CONFIG = {
  defaultTtlMs: 30000, // 30 seconds
  maxEntries: 10000,
  cleanupIntervalMs: 60000, // 1 minute
  consecutiveFailureThreshold: 3,
};

/**
 * Cache entry with TTL tracking.
 */
class CacheEntry {
  /**
   * Create a new cache entry.
   * @param {string} key - Cache key.
   * @param {*} value - Cached value.
   * @param {number} ttlMs - Time-to-live in milliseconds.
   */
  constructor(key, value, ttlMs) {
    this.key = key;
    this.value = value;
    this.ttlMs = ttlMs;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttlMs;
    this.accessCount = 0;
    this.lastAccessedAt = this.createdAt;
  }

  /**
   * Check if the entry is expired.
   * @return {boolean} True if expired.
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * Get the remaining TTL in milliseconds.
   * @return {number} Remaining TTL (0 if expired).
   */
  getRemainingTtl() {
    const remaining = this.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Record an access to this entry.
   */
  recordAccess() {
    this.accessCount++;
    this.lastAccessedAt = Date.now();
  }

  /**
   * Get entry status.
   * @return {string} Entry status.
   */
  getStatus() {
    if (this.isExpired()) {
      return CacheEntryStatus.EXPIRED;
    }
    return CacheEntryStatus.VALID;
  }
}

/**
 * MetadataCache provides local caching with TTL for system metadata.
 * Supports query-on-miss behavior and automatic refresh on failures.
 */
class MetadataCache extends EventEmitter {
  /**
   * Create a new MetadataCache.
   * @param {Object} options - Configuration options.
   * @param {number} options.defaultTtlMs - Default TTL in milliseconds.
   * @param {number} options.maxEntries - Maximum cache entries.
   * @param {number} options.cleanupIntervalMs - Cleanup interval.
   * @param {number} options.consecutiveFailureThreshold - Failures before refresh.
   * @param {Function} options.querySystemPartition - Function to query system partition.
   */
  constructor(options = {}) {
    super();

    this.cacheId = uuidv4();

    // Load configuration
    const config = ConfigurationManager.getInstance();
    this.defaultTtlMs = options.defaultTtlMs ??
      config.get('messageGroup.cacheTtlMs') ??
      DEFAULT_CACHE_CONFIG.defaultTtlMs;
    this.maxEntries = options.maxEntries ??
      DEFAULT_CACHE_CONFIG.maxEntries;
    this.cleanupIntervalMs = options.cleanupIntervalMs ??
      DEFAULT_CACHE_CONFIG.cleanupIntervalMs;
    this.consecutiveFailureThreshold = options.consecutiveFailureThreshold ??
      DEFAULT_CACHE_CONFIG.consecutiveFailureThreshold;

    // Function to query system partition on cache miss
    this.querySystemPartition = options.querySystemPartition || null;

    // Cache storage
    this.cache = new Map();

    // Failure tracking per key
    this.failureCounters = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('metadata-cache') : console;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      expirations: 0,
      evictions: 0,
      refreshes: 0,
      queryOnMiss: 0,
    };

    // Cleanup timer
    this.cleanupTimer = null;
    this.initialized = false;
  }

  /**
   * Initialize the cache and start cleanup timer.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.startCleanupTimer();
    this.initialized = true;

    this.logger.debug('Metadata cache initialized', {
      cacheId: this.cacheId,
      defaultTtlMs: this.defaultTtlMs,
      maxEntries: this.maxEntries,
    });
  }

  /**
   * Set a value in the cache.
   * @param {string} key - Cache key.
   * @param {*} value - Value to cache.
   * @param {Object} options - Cache options.
   * @param {number} options.ttlMs - Custom TTL for this entry.
   */
  set(key, value, options = {}) {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;

    // Check if we need to evict entries
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictOldestEntry();
    }

    const entry = new CacheEntry(key, value, ttlMs);
    this.cache.set(key, entry);

    // Reset failure counter on successful set
    this.failureCounters.delete(key);

    this.logger.debug('Cache entry set', {
      key,
      ttlMs,
      expiresAt: entry.expiresAt,
    });

    this.emit('set', {key, value, ttlMs});
  }

  /**
   * Get a value from the cache.
   * Returns null if not found or expired.
   * @param {string} key - Cache key.
   * @return {*} Cached value or null.
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.isExpired()) {
      this.stats.expirations++;
      this.cache.delete(key);
      return null;
    }

    entry.recordAccess();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Get a value from cache, querying system partition on miss.
   * @param {string} key - Cache key.
   * @param {Object} queryOptions - Options for system partition query.
   * @param {string} queryOptions.tableName - Table to query.
   * @param {string} queryOptions.sql - SQL query.
   * @param {Array} queryOptions.params - Query parameters.
   * @return {Promise<*>} Cached or queried value.
   */
  async getOrQuery(key, queryOptions = {}) {
    // Try cache first
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - query system partition
    if (!this.querySystemPartition) {
      this.logger.debug('Cache miss, no query function configured', {key});
      return null;
    }

    this.stats.queryOnMiss++;

    this.logger.debug('Cache miss, querying system partition', {
      key,
      tableName: queryOptions.tableName,
    });

    try {
      const result = await this.querySystemPartition(queryOptions);

      if (result !== null && result !== undefined) {
        // Cache the result
        this.set(key, result, {ttlMs: queryOptions.ttlMs});
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to query system partition', {
        key,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if a key exists and is not expired.
   * @param {string} key - Cache key.
   * @return {boolean} True if key exists and is valid.
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (entry.isExpired()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a key from the cache.
   * @param {string} key - Cache key.
   * @return {boolean} True if key was deleted.
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    this.failureCounters.delete(key);
    if (deleted) {
      this.emit('delete', {key});
    }
    return deleted;
  }

  /**
   * Clear all entries from the cache.
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.failureCounters.clear();

    this.logger.debug('Cache cleared', {entriesCleared: size});
    this.emit('clear', {entriesCleared: size});
  }

  /**
   * Record a failure for a key and refresh if threshold exceeded.
   * @param {string} key - Cache key.
   * @param {Object} queryOptions - Options for refresh query.
   * @return {Promise<boolean>} True if refresh was triggered.
   */
  async recordFailure(key, queryOptions = {}) {
    const currentCount = (this.failureCounters.get(key) || 0) + 1;
    this.failureCounters.set(key, currentCount);

    this.logger.debug('Failure recorded', {
      key,
      failureCount: currentCount,
      threshold: this.consecutiveFailureThreshold,
    });

    // Check if we should refresh
    if (currentCount >= this.consecutiveFailureThreshold) {
      this.logger.debug('Failure threshold exceeded, refreshing', {key});
      this.stats.refreshes++;

      // Delete stale entry
      this.cache.delete(key);
      this.failureCounters.delete(key);

      // Query fresh data if possible
      if (this.querySystemPartition && queryOptions.tableName) {
        try {
          await this.getOrQuery(key, queryOptions);
          this.emit('refresh', {key, reason: 'consecutive_failures'});
          return true;
        } catch (error) {
          this.logger.error('Refresh query failed', {
            key,
            error: error.message,
          });
        }
      }
    }

    return false;
  }

  /**
   * Reset failure counter for a key.
   * @param {string} key - Cache key.
   */
  resetFailureCounter(key) {
    this.failureCounters.delete(key);
  }

  /**
   * Get partition metadata from cache or query.
   * Convenience method for partition lookups.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object|null>} Partition metadata.
   */
  async getPartition(partitionId) {
    const key = `partition:${partitionId}`;
    return this.getOrQuery(key, {
      tableName: 'partitions',
      sql: 'SELECT * FROM partitions WHERE partition_id = ?',
      params: [partitionId],
    });
  }

  /**
   * Set partition metadata in cache.
   * @param {string} partitionId - Partition ID.
   * @param {Object} data - Partition metadata.
   * @param {Object} options - Cache options.
   */
  setPartition(partitionId, data, options = {}) {
    const key = `partition:${partitionId}`;
    this.set(key, data, options);
  }

  /**
   * Get service metadata from cache or query.
   * @param {string} serviceId - Service ID.
   * @return {Promise<Object|null>} Service metadata.
   */
  async getService(serviceId) {
    const key = `service:${serviceId}`;
    return this.getOrQuery(key, {
      tableName: 'services',
      sql: 'SELECT * FROM services WHERE service_id = ?',
      params: [serviceId],
    });
  }

  /**
   * Set service metadata in cache.
   * @param {string} serviceId - Service ID.
   * @param {Object} data - Service metadata.
   * @param {Object} options - Cache options.
   */
  setService(serviceId, data, options = {}) {
    const key = `service:${serviceId}`;
    this.set(key, data, options);
  }

  /**
   * Get node metadata from cache or query.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Object|null>} Node metadata.
   */
  async getNode(nodeId) {
    const key = `node:${nodeId}`;
    return this.getOrQuery(key, {
      tableName: 'nodes',
      sql: 'SELECT * FROM nodes WHERE node_id = ?',
      params: [nodeId],
    });
  }

  /**
   * Set node metadata in cache.
   * @param {string} nodeId - Node ID.
   * @param {Object} data - Node metadata.
   * @param {Object} options - Cache options.
   */
  setNode(nodeId, data, options = {}) {
    const key = `node:${nodeId}`;
    this.set(key, data, options);
  }

  /**
   * Set the function to query system partitions.
   * @param {Function} fn - Query function.
   */
  setQueryFunction(fn) {
    if (typeof fn !== 'function') {
      throw new Error('Query function must be a function');
    }
    this.querySystemPartition = fn;
  }

  /**
   * Evict the oldest entry from the cache.
   * @private
   */
  evictOldestEntry() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;

      this.logger.debug('Evicted oldest entry', {key: oldestKey});
      this.emit('evict', {key: oldestKey, reason: 'max_entries'});
    }
  }

  /**
   * Clean up expired entries.
   * @private
   */
  cleanupExpiredEntries() {
    const expiredKeys = [];

    for (const [key, entry] of this.cache) {
      if (entry.isExpired()) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.stats.expirations++;
    }

    if (expiredKeys.length > 0) {
      this.logger.debug('Cleaned up expired entries', {
        count: expiredKeys.length,
      });
    }
  }

  /**
   * Start the cleanup timer.
   * @private
   */
  startCleanupTimer() {
    this.stopCleanupTimer();

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer.
   * @private
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get cache statistics.
   * @return {Object} Cache statistics.
   */
  getStats() {
    const hitRate = (this.stats.hits + this.stats.misses) > 0 ?
      this.stats.hits / (this.stats.hits + this.stats.misses) : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate,
      maxEntries: this.maxEntries,
      defaultTtlMs: this.defaultTtlMs,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      expirations: 0,
      evictions: 0,
      refreshes: 0,
      queryOnMiss: 0,
    };
  }

  /**
   * Get all cache entries (for debugging).
   * @return {Array<Object>} Array of entry info.
   */
  getEntries() {
    const entries = [];
    for (const [key, entry] of this.cache) {
      entries.push({
        key,
        status: entry.getStatus(),
        remainingTtl: entry.getRemainingTtl(),
        accessCount: entry.accessCount,
        createdAt: entry.createdAt,
      });
    }
    return entries;
  }

  /**
   * Shutdown the cache.
   */
  shutdown() {
    this.stopCleanupTimer();
    this.cache.clear();
    this.failureCounters.clear();
    this.initialized = false;

    this.logger.debug('Metadata cache shutdown', {cacheId: this.cacheId});
    this.emit('shutdown', {cacheId: this.cacheId});
  }
}

export {
  MetadataCache,
  CacheEntry,
  CacheEntryStatus,
  DEFAULT_CACHE_CONFIG,
};
