/**
 * Dynamic Configuration Service - Manages configuration through system table.
 * Provides dynamic configuration management with watchers and hot reload.
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {DEFAULT_CONFIG} from './configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Configuration value types.
 */
const ConfigValueType = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  JSON: 'json',
};

/**
 * Default configuration definitions with metadata.
 * Each entry defines the key, default value, type, and whether restart is required.
 */
const CONFIG_DEFINITIONS = {
  // Node configuration
  'node.heartbeatIntervalMs': {
    defaultValue: DEFAULT_CONFIG.node.heartbeatIntervalMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Interval between node heartbeats in milliseconds',
  },
  'node.heartbeatTimeoutMs': {
    defaultValue: DEFAULT_CONFIG.node.heartbeatTimeoutMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Timeout for node heartbeat detection in milliseconds',
  },
  'node.statsCollectionIntervalMs': {
    defaultValue: DEFAULT_CONFIG.node.statsCollectionIntervalMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Interval for collecting node statistics in milliseconds',
  },
  'node.maxServicesPerNode': {
    defaultValue: DEFAULT_CONFIG.node.maxServicesPerNode,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'Maximum number of services per node',
  },
  'node.restApiPort': {
    defaultValue: DEFAULT_CONFIG.node.restApiPort,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'REST API port for node service',
  },

  // Raft configuration
  'raft.electionTimeoutMinMs': {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMinMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'Minimum election timeout in milliseconds',
  },
  'raft.electionTimeoutMaxMs': {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMaxMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'Maximum election timeout in milliseconds',
  },
  'raft.heartbeatIntervalMs': {
    defaultValue: DEFAULT_CONFIG.raft.heartbeatIntervalMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'Raft heartbeat interval in milliseconds',
  },

  // Message group configuration
  'messageGroup.replicaCount': {
    defaultValue: DEFAULT_CONFIG.messageGroup.replicaCount,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'Default replica count for message groups',
  },
  'messageGroup.deliveryTimeoutMs': {
    defaultValue: DEFAULT_CONFIG.messageGroup.deliveryTimeoutMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Message delivery timeout in milliseconds',
  },
  'messageGroup.retryMaxAttempts': {
    defaultValue: DEFAULT_CONFIG.messageGroup.retryMaxAttempts,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Maximum retry attempts for message delivery',
  },
  'messageGroup.cacheTtlMs': {
    defaultValue: DEFAULT_CONFIG.messageGroup.cacheTtlMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Cache TTL in milliseconds',
  },

  // Partition configuration
  'partition.defaultReplicaCount': {
    defaultValue: DEFAULT_CONFIG.partition.defaultReplicaCount,
    type: ConfigValueType.NUMBER,
    requiresRestart: true,
    description: 'Default replica count for partitions',
  },
  'partition.splitThresholdBytes': {
    defaultValue: DEFAULT_CONFIG.partition.splitThresholdBytes,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Partition split threshold in bytes',
  },
  'partition.splitThresholdQpm': {
    defaultValue: DEFAULT_CONFIG.partition.splitThresholdQpm,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Partition split threshold in queries per minute',
  },
  'partition.mergeThresholdBytes': {
    defaultValue: DEFAULT_CONFIG.partition.mergeThresholdBytes,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Partition merge threshold in bytes',
  },
  'partition.mergeThresholdQpm': {
    defaultValue: DEFAULT_CONFIG.partition.mergeThresholdQpm,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Partition merge threshold in queries per minute',
  },
  'partition.evaluationIntervalMs': {
    defaultValue: DEFAULT_CONFIG.partition.evaluationIntervalMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Partition evaluation interval in milliseconds',
  },

  // Logging configuration
  'logging.level': {
    defaultValue: DEFAULT_CONFIG.logging.level,
    type: ConfigValueType.STRING,
    requiresRestart: false,
    description: 'Log level (trace, debug, info, warn, error, fatal)',
  },
  'logging.retentionDays': {
    defaultValue: DEFAULT_CONFIG.logging.retentionDays,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Log retention period in days',
  },

  // Rebalancer configuration
  'rebalancer.periodicCheckIntervalMs': {
    defaultValue: DEFAULT_CONFIG.rebalancer.periodicCheckIntervalMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Rebalancer periodic check interval in milliseconds',
  },
  'rebalancer.maxConcurrentMoves': {
    defaultValue: DEFAULT_CONFIG.rebalancer.maxConcurrentMoves,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Maximum concurrent replica moves',
  },

  // Query coordinator configuration
  'queryCoordinator.maxParallelPartitions': {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.maxParallelPartitions,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Maximum partitions per parallel query',
  },
  'queryCoordinator.queryTimeoutMs': {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.queryTimeoutMs,
    type: ConfigValueType.NUMBER,
    requiresRestart: false,
    description: 'Query timeout in milliseconds',
  },
  'queryCoordinator.speculativeExecutionEnabled': {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.speculativeExecutionEnabled,
    type: ConfigValueType.BOOLEAN,
    requiresRestart: false,
    description: 'Enable speculative execution for slow partitions',
  },
};


/**
 * DynamicConfigService manages configuration through the config system table.
 * Provides watchers for configuration changes and supports hot reload.
 */
class DynamicConfigService extends EventEmitter {
  /**
   * Create a new DynamicConfigService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.systemTableCache - System table cache for reads.
   * @param {string} options.nodeId - Node ID for audit logging.
   */
  constructor(options = {}) {
    super();

    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.nodeId = options.nodeId || 'unknown';

    // Local cache of configuration values
    this.configCache = new Map();

    // Watchers for configuration changes
    this.watchers = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('dynamic-config') : console;

    // Statistics
    this.stats = {
      reads: 0,
      writes: 0,
      watcherNotifications: 0,
    };

    this.initialized = false;
  }

  /**
   * Initialize the dynamic configuration service.
   * @param {Object} options - Initialization options.
   */
  async initialize(options = {}) {
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    this.initialized = true;

    this.logger.info('Dynamic configuration service initialized', {
      nodeId: this.nodeId,
      definedKeys: Object.keys(CONFIG_DEFINITIONS).length,
    });
  }

  /**
   * Seed configuration from environment variables and defaults.
   * Only seeds keys that don't already exist in the config table.
   * Requirements: 30.2, 30.9
   * @param {string} updatedBy - Identity of who is seeding (e.g., 'system').
   * @return {Promise<Object>} Seeding result.
   */
  async seedConfiguration(updatedBy = 'system') {
    if (!this.cdcIntegrationService) {
      throw new Error('CDC integration service not available');
    }

    const seeded = [];
    const skipped = [];
    const now = Date.now();

    for (const [key, definition] of Object.entries(CONFIG_DEFINITIONS)) {
      // Check if key already exists
      const existing = await this.getConfigFromTable(key);
      if (existing) {
        skipped.push(key);
        continue;
      }

      // Check for environment variable override
      const envKey = this.keyToEnvVar(key);
      const envValue = process.env[envKey];
      const value = envValue !== undefined ?
        this.parseEnvValue(envValue, definition.type) :
        definition.defaultValue;

      // Insert into config table
      await this.cdcIntegrationService.insertSystemTableRow(
        SystemTableName.CONFIG,
        {
          config_key: key,
          config_value: this.serializeValue(value, definition.type),
          value_type: definition.type,
          requires_restart: definition.requiresRestart ? 1 : 0,
          description: definition.description,
          default_value: this.serializeValue(
            definition.defaultValue, definition.type,
          ),
          updated_by: updatedBy,
          updated_at: now,
          created_at: now,
        },
      );

      seeded.push(key);
    }

    this.logger.info('Configuration seeding complete', {
      seeded: seeded.length,
      skipped: skipped.length,
    });

    return {seeded, skipped};
  }


  /**
   * Get a configuration value.
   * Requirements: 30.3
   * @param {string} key - Configuration key.
   * @return {Promise<*>} Configuration value or default.
   */
  async get(key) {
    this.stats.reads++;

    // Try local cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }

    // Try system table cache
    const config = await this.getConfigFromTable(key);
    if (config) {
      const value = this.deserializeValue(config.config_value, config.value_type);
      this.configCache.set(key, value);
      return value;
    }

    // Return default if defined
    const definition = CONFIG_DEFINITIONS[key];
    if (definition) {
      return definition.defaultValue;
    }

    return undefined;
  }

  /**
   * Set a configuration value.
   * Requirements: 30.4, 30.8, 30.10
   * @param {string} key - Configuration key.
   * @param {*} value - Configuration value.
   * @param {string} updatedBy - Identity of who made the change.
   * @return {Promise<Object>} Update result.
   */
  async set(key, value, updatedBy = 'unknown') {
    if (!this.cdcIntegrationService) {
      throw new Error('CDC integration service not available');
    }

    // Validate the value
    const validation = this.validateValue(key, value);
    if (!validation.valid) {
      throw new Error(`Invalid configuration value: ${validation.error}`);
    }

    const definition = CONFIG_DEFINITIONS[key];
    const valueType = definition ? definition.type : this.inferType(value);
    const now = Date.now();

    // Check if key exists
    const existing = await this.getConfigFromTable(key);

    if (existing) {
      // Update existing
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.CONFIG,
        {config_key: key},
        {
          config_value: this.serializeValue(value, valueType),
          updated_by: updatedBy,
          updated_at: now,
        },
      );
    } else {
      // Insert new
      await this.cdcIntegrationService.insertSystemTableRow(
        SystemTableName.CONFIG,
        {
          config_key: key,
          config_value: this.serializeValue(value, valueType),
          value_type: valueType,
          requires_restart: definition ? (definition.requiresRestart ? 1 : 0) : 0,
          description: definition ? definition.description : '',
          default_value: this.serializeValue(
            definition ? definition.defaultValue : value, valueType,
          ),
          updated_by: updatedBy,
          updated_at: now,
          created_at: now,
        },
      );
    }

    // Update local cache
    this.configCache.set(key, value);
    this.stats.writes++;

    // Log the change for auditing
    this.logger.info('Configuration updated', {
      key,
      updatedBy,
      requiresRestart: definition ? definition.requiresRestart : false,
    });

    // Notify watchers
    await this.notifyWatchers(key, value, existing?.config_value);

    return {
      success: true,
      key,
      value,
      requiresRestart: definition ? definition.requiresRestart : false,
    };
  }

  /**
   * Get all configuration values.
   * @return {Promise<Object>} All configuration key-value pairs.
   */
  async getAll() {
    const result = {};

    // Get all from table
    if (this.systemTableCache) {
      const configs = this.systemTableCache.getAll(SystemTableName.CONFIG);
      if (configs) {
        for (const config of configs) {
          result[config.config_key] = this.deserializeValue(
            config.config_value, config.value_type,
          );
        }
      }
    }

    // Fill in defaults for missing keys
    for (const [key, definition] of Object.entries(CONFIG_DEFINITIONS)) {
      if (!(key in result)) {
        result[key] = definition.defaultValue;
      }
    }

    return result;
  }


  /**
   * Register a watcher for configuration changes.
   * Requirements: 30.5, 30.6
   * @param {string} key - Configuration key to watch.
   * @param {Function} callback - Callback function(newValue, oldValue, key).
   * @return {Function} Unsubscribe function.
   */
  watch(key, callback) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());
    }
    this.watchers.get(key).add(callback);

    this.logger.debug('Configuration watcher registered', {key});

    // Return unsubscribe function
    return () => {
      const keyWatchers = this.watchers.get(key);
      if (keyWatchers) {
        keyWatchers.delete(callback);
        if (keyWatchers.size === 0) {
          this.watchers.delete(key);
        }
      }
    };
  }

  /**
   * Notify watchers of a configuration change.
   * @param {string} key - Configuration key that changed.
   * @param {*} newValue - New value.
   * @param {string} oldValueSerialized - Old serialized value.
   * @private
   */
  async notifyWatchers(key, newValue, oldValueSerialized) {
    const keyWatchers = this.watchers.get(key);
    if (!keyWatchers || keyWatchers.size === 0) {
      return;
    }

    const definition = CONFIG_DEFINITIONS[key];
    const valueType = definition ? definition.type : this.inferType(newValue);
    const oldValue = oldValueSerialized ?
      this.deserializeValue(oldValueSerialized, valueType) : undefined;

    for (const callback of keyWatchers) {
      try {
        await callback(newValue, oldValue, key);
        this.stats.watcherNotifications++;
      } catch (error) {
        this.logger.error('Configuration watcher callback failed', {
          key,
          error: error.message,
        });
      }
    }

    // Emit event for general listeners
    this.emit('change', {key, newValue, oldValue});
  }

  /**
   * Handle CDC event for config table changes.
   * This is called when the cache receives CDC updates.
   * @param {Object} event - CDC event.
   */
  async handleCDCEvent(event) {
    const {operation, data} = event;
    const key = data.config_key;

    if (operation === 'INSERT' || operation === 'UPDATE') {
      const newValue = this.deserializeValue(data.config_value, data.value_type);
      const oldValue = this.configCache.get(key);

      // Update local cache
      this.configCache.set(key, newValue);

      // Notify watchers if value changed
      if (oldValue !== newValue) {
        await this.notifyWatchers(key, newValue, this.serializeValue(
          oldValue, data.value_type,
        ));
      }
    } else if (operation === 'DELETE') {
      this.configCache.delete(key);
      this.emit('delete', {key});
    }
  }

  /**
   * Check if a configuration key requires restart.
   * Requirements: 30.7
   * @param {string} key - Configuration key.
   * @return {boolean} True if restart is required.
   */
  requiresRestart(key) {
    const definition = CONFIG_DEFINITIONS[key];
    return definition ? definition.requiresRestart : false;
  }

  /**
   * Get configuration metadata.
   * @param {string} key - Configuration key.
   * @return {Object|null} Configuration metadata or null.
   */
  getMetadata(key) {
    return CONFIG_DEFINITIONS[key] || null;
  }

  /**
   * Get all configuration keys that require restart.
   * @return {string[]} Array of keys requiring restart.
   */
  getRestartRequiredKeys() {
    return Object.entries(CONFIG_DEFINITIONS)
      .filter(([_, def]) => def.requiresRestart)
      .map(([key]) => key);
  }

  /**
   * Get all configuration keys that support hot reload.
   * @return {string[]} Array of hot-reloadable keys.
   */
  getHotReloadKeys() {
    return Object.entries(CONFIG_DEFINITIONS)
      .filter(([_, def]) => !def.requiresRestart)
      .map(([key]) => key);
  }


  /**
   * Validate a configuration value.
   * Requirements: 30.10
   * @param {string} key - Configuration key.
   * @param {*} value - Value to validate.
   * @return {Object} Validation result {valid, error}.
   */
  validateValue(key, value) {
    const definition = CONFIG_DEFINITIONS[key];

    if (!definition) {
      // Allow custom keys with inferred types
      return {valid: true};
    }

    // Type validation
    switch (definition.type) {
    case ConfigValueType.STRING:
      if (typeof value !== 'string') {
        return {valid: false, error: `Expected string, got ${typeof value}`};
      }
      // Special validation for log level
      if (key === 'logging.level') {
        const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
        if (!validLevels.includes(value)) {
          return {
            valid: false,
            error: `Invalid log level. Must be one of: ${validLevels.join(', ')}`,
          };
        }
      }
      break;

    case ConfigValueType.NUMBER:
      if (typeof value !== 'number' || isNaN(value)) {
        return {valid: false, error: `Expected number, got ${typeof value}`};
      }
      // Validate positive numbers for most numeric configs
      if (value < 0 && !key.includes('Threshold')) {
        return {valid: false, error: 'Value must be non-negative'};
      }
      break;

    case ConfigValueType.BOOLEAN:
      if (typeof value !== 'boolean') {
        return {valid: false, error: `Expected boolean, got ${typeof value}`};
      }
      break;

    case ConfigValueType.JSON:
      if (typeof value !== 'object') {
        return {valid: false, error: `Expected object, got ${typeof value}`};
      }
      break;
    }

    return {valid: true};
  }

  /**
   * Get configuration from system table cache.
   * @param {string} key - Configuration key.
   * @return {Object|null} Configuration row or null.
   * @private
   */
  async getConfigFromTable(key) {
    if (!this.systemTableCache) {
      return null;
    }

    return this.systemTableCache.get(SystemTableName.CONFIG, key);
  }

  /**
   * Serialize a value for storage.
   * @param {*} value - Value to serialize.
   * @param {string} type - Value type.
   * @return {string} Serialized value.
   * @private
   */
  serializeValue(value, type) {
    switch (type) {
    case ConfigValueType.JSON:
      return JSON.stringify(value);
    case ConfigValueType.BOOLEAN:
      return value ? 'true' : 'false';
    default:
      return String(value);
    }
  }

  /**
   * Deserialize a value from storage.
   * @param {string} serialized - Serialized value.
   * @param {string} type - Value type.
   * @return {*} Deserialized value.
   * @private
   */
  deserializeValue(serialized, type) {
    switch (type) {
    case ConfigValueType.NUMBER:
      return Number(serialized);
    case ConfigValueType.BOOLEAN:
      return serialized === 'true' || serialized === '1';
    case ConfigValueType.JSON:
      try {
        return JSON.parse(serialized);
      } catch {
        return {};
      }
    default:
      return serialized;
    }
  }

  /**
   * Convert a configuration key to environment variable name.
   * @param {string} key - Configuration key (e.g., 'node.heartbeatIntervalMs').
   * @return {string} Environment variable name (e.g., 'NODE_HEARTBEAT_INTERVAL_MS').
   * @private
   */
  keyToEnvVar(key) {
    return key
      .replace(/\./g, '_')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }

  /**
   * Parse an environment variable value.
   * @param {string} value - Environment variable value.
   * @param {string} type - Expected type.
   * @return {*} Parsed value.
   * @private
   */
  parseEnvValue(value, type) {
    switch (type) {
    case ConfigValueType.NUMBER:
      return Number(value);
    case ConfigValueType.BOOLEAN:
      return value.toLowerCase() === 'true' || value === '1';
    case ConfigValueType.JSON:
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    default:
      return value;
    }
  }

  /**
   * Infer the type of a value.
   * @param {*} value - Value to check.
   * @return {string} Inferred type.
   * @private
   */
  inferType(value) {
    if (typeof value === 'number') return ConfigValueType.NUMBER;
    if (typeof value === 'boolean') return ConfigValueType.BOOLEAN;
    if (typeof value === 'object') return ConfigValueType.JSON;
    return ConfigValueType.STRING;
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    return {
      ...this.stats,
      watcherCount: Array.from(this.watchers.values())
        .reduce((sum, set) => sum + set.size, 0),
      cachedKeys: this.configCache.size,
    };
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Clear local cache.
   */
  clearCache() {
    this.configCache.clear();
  }
}

export {
  DynamicConfigService,
  ConfigValueType,
  CONFIG_DEFINITIONS,
};
