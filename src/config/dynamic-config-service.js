/**
 * Dynamic Configuration Service - Manages configuration through system table.
 * Provides dynamic configuration management with watchers and hot reload.
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {CDC_OPERATION, STRING} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  CONFIG_DEFINITIONS,
  CONFIG_ENV,
  CONFIG_ENV_REGEX,
  CONFIG_ENV_REPLACE,
  CONFIG_ERROR_MSG,
  CONFIG_EVENT,
  CONFIG_KEY,
  CONFIG_KEY_FRAGMENT,
  CONFIG_LOG_LEVELS,
  CONFIG_LOG_MSG,
  CONFIG_SEPARATOR,
  CONFIG_SEED_SOURCE,
  CONFIG_SQL,
  CONFIG_STATS_DEFAULT,
  CONFIG_SUBSYSTEM,
  CONFIG_TABLE_COLUMN,
  CONFIG_VALUE_DEFAULT,
  CONFIG_VALUE_TYPE,
} from './config-constants.js';

const CONFIG_SELECT_ALL_SQL = CONFIG_SQL.SELECT_ALL;
const CONFIG_SELECT_BY_KEY_SQL = CONFIG_SQL.SELECT_BY_KEY;
const CONFIG_MUTATION_DELIVERY_PRIORITY = 'critical';

const ConfigValueType = CONFIG_VALUE_TYPE;


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
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.nodeId = options.nodeId || STRING.UNKNOWN;

    // Local cache of configuration values
    this.configCache = new Map();

    // Watchers for configuration changes
    this.watchers = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONFIG_SUBSYSTEM.DYNAMIC_CONFIG) : console;

    // Statistics
    this.stats = {...CONFIG_STATS_DEFAULT};

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
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    this.initialized = true;

    this.logger.info(CONFIG_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      definedKeys: Object.keys(CONFIG_DEFINITIONS).length,
    });
  }

  /**
   * Seed configuration from environment variables and defaults.
   * Only seeds keys that don't already exist in the config table.
   * Requirements: 30.2, 30.9
   * @param {string} updatedBy - Identity of who is seeding (e.g., 'system').
   * @param {Object} [options={}] - Seeding options.
   * @param {boolean} [options.skipExistingCheck=false] - Legacy compatibility
   *   flag. Seeding now uses idempotent insert-if-absent writes, so per-key
   *   existence reads are no longer required.
   * @param {boolean} [options.useDirectCdcMutations=false] - Legacy
   *   compatibility flag. Seeding always writes through the control-plane
   *   gateway owner.
   * @return {Promise<Object>} Seeding result.
   */
  async seedConfiguration(
    updatedBy = CONFIG_SEED_SOURCE.SYSTEM,
    _options = {},
  ) {
    const seeded = [];
    const skipped = [];
    const now = Date.now();

    for (const [key, definition] of Object.entries(CONFIG_DEFINITIONS)) {
      // Check for environment variable override
      const envKey = this.keyToEnvVar(key);
      const envValue = process.env[envKey];
      const value = envValue !== undefined ?
        this.parseEnvValue(envValue, definition.type) :
        definition.defaultValue;

      // Insert into config table
      const row = {
        [CONFIG_TABLE_COLUMN.KEY]: key,
        [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(
          value, definition.type,
        ),
        [CONFIG_TABLE_COLUMN.VALUE_TYPE]: definition.type,
        [CONFIG_TABLE_COLUMN.REQUIRES_RESTART]:
          definition.requiresRestart ? 1 : 0,
        [CONFIG_TABLE_COLUMN.DESCRIPTION]: definition.description,
        [CONFIG_TABLE_COLUMN.DEFAULT_VALUE]: this.serializeValue(
          definition.defaultValue, definition.type,
        ),
        [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
        [CONFIG_TABLE_COLUMN.UPDATED_AT]: now,
        [CONFIG_TABLE_COLUMN.CREATED_AT]: now,
      };
      const writeOptions = {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: CONFIG_MUTATION_DELIVERY_PRIORITY,
        ignoreExisting: true,
      };

      const mutationResult = await this.getControlPlaneSystemTableGateway()
        .insertSystemTableRow(
          SYSTEM_TABLE_NAME.CONFIG,
          row,
          writeOptions,
        );

      if (this.didConfigSeedInsertApply(mutationResult)) {
        seeded.push(key);
      } else {
        skipped.push(key);
      }
    }

    this.logger.info(CONFIG_LOG_MSG.SEEDING_COMPLETE, {
      seeded: seeded.length,
      skipped: skipped.length,
    });

    return {seeded, skipped};
  }

  /**
   * Classify one config seed write as inserted vs already-present.
   * @param {Object|null} mutationResult
   * @return {boolean}
   * @private
   */
  didConfigSeedInsertApply(mutationResult) {
    return classifyControlPlaneMutationResult(mutationResult).applied;
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
  async set(key, value, updatedBy = CONFIG_ENV.UPDATED_BY_UNKNOWN) {
    // Validate the value
    const validation = this.validateValue(key, value);
    if (!validation.valid) {
      throw new Error(`${CONFIG_ERROR_MSG.INVALID_VALUE_PREFIX}${validation.error}`);
    }

    const definition = CONFIG_DEFINITIONS[key];
    const valueType = definition ? definition.type : this.inferType(value);
    const now = Date.now();

    // Check if key exists
    const existing = await this.getConfigFromTable(key);

    if (existing) {
      // Update existing
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.CONFIG,
        whereClause: {[CONFIG_TABLE_COLUMN.KEY]: key},
        data: {
          [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(value, valueType),
          [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
          [CONFIG_TABLE_COLUMN.UPDATED_AT]: now,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: CONFIG_MUTATION_DELIVERY_PRIORITY,
      });
    } else {
      // Insert new
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: SYSTEM_TABLE_NAME.CONFIG,
        row: {
          [CONFIG_TABLE_COLUMN.KEY]: key,
          [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(value, valueType),
          [CONFIG_TABLE_COLUMN.VALUE_TYPE]: valueType,
          [CONFIG_TABLE_COLUMN.REQUIRES_RESTART]: definition ?
            (definition.requiresRestart ? 1 : 0) : 0,
          [CONFIG_TABLE_COLUMN.DESCRIPTION]: definition ?
            definition.description : STRING.EMPTY,
          [CONFIG_TABLE_COLUMN.DEFAULT_VALUE]: this.serializeValue(
            definition ? definition.defaultValue : value, valueType,
          ),
          [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
          [CONFIG_TABLE_COLUMN.UPDATED_AT]: now,
          [CONFIG_TABLE_COLUMN.CREATED_AT]: now,
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: CONFIG_MUTATION_DELIVERY_PRIORITY,
      });
    }

    this.stats.writes++;

    // Log the change for auditing
    // Note: Local cache will be updated when CDC event arrives via handleCDCEvent()
    this.logger.info(CONFIG_LOG_MSG.UPDATED, {
      key,
      updatedBy,
      requiresRestart: definition ? definition.requiresRestart : false,
    });

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

    if (this.canReadConfig()) {
      const queryResult = await this.getControlPlaneSystemTableGateway().readRows(
        SYSTEM_TABLE_NAME.CONFIG,
        CONFIG_SELECT_ALL_SQL,
        [],
      );
      const configs = queryResult.rows || [];
      for (const config of configs) {
        result[config[CONFIG_TABLE_COLUMN.KEY]] =
          this.deserializeValue(
            config[CONFIG_TABLE_COLUMN.VALUE],
            config[CONFIG_TABLE_COLUMN.VALUE_TYPE],
          );
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

    this.logger.debug(CONFIG_LOG_MSG.WATCHER_REGISTERED, {key});

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
        this.logger.error(CONFIG_LOG_MSG.WATCHER_CALLBACK_FAILED, {
          key,
          error: error.message,
        });
        throw error;
      }
    }

    // Emit event for general listeners
    this.emit(CONFIG_EVENT.CHANGE, {key, newValue, oldValue});
  }

  /**
   * Handle CDC event for config table changes.
   * This is called when the cache receives CDC updates.
   * @param {Object} event - CDC event.
   */
  async handleCDCEvent(event) {
    const {operation, data} = event;
    const key = data[CONFIG_TABLE_COLUMN.KEY];

    if (operation === CDC_OPERATION.INSERT || operation === CDC_OPERATION.UPDATE) {
      const valueType = this.resolveValueType(
        key,
        data[CONFIG_TABLE_COLUMN.VALUE_TYPE],
      );
      const newValue = this.deserializeValue(
        data[CONFIG_TABLE_COLUMN.VALUE],
        valueType,
      );
      const oldValue = this.configCache.get(key);

      // Update local cache
      this.configCache.set(key, newValue);

      // Notify watchers if value changed
      if (oldValue !== newValue) {
        const oldValueSerialized = oldValue === undefined ?
          undefined :
          this.serializeValue(oldValue, valueType);
        await this.notifyWatchers(key, newValue, oldValueSerialized);
      }
    } else if (operation === CDC_OPERATION.DELETE) {
      this.configCache.delete(key);
      this.emit(CONFIG_EVENT.DELETE, {key});
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
        return {
          valid: false,
          error: `${CONFIG_ERROR_MSG.EXPECTED_STRING_PREFIX}${typeof value}`,
        };
      }
      // Special validation for log level
      if (key === CONFIG_KEY.LOGGING_LEVEL) {
        const validLevels = CONFIG_LOG_LEVELS.VALUES;
        if (!validLevels.includes(value)) {
          return {
            valid: false,
            error: `${CONFIG_ERROR_MSG.LOG_LEVEL_INVALID_PREFIX}${
              validLevels.join(CONFIG_SEPARATOR.COMMA_SPACE)
            }`,
          };
        }
      }
      break;

    case ConfigValueType.NUMBER:
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return {
          valid: false,
          error: `${CONFIG_ERROR_MSG.EXPECTED_NUMBER_PREFIX}${typeof value}`,
        };
      }
      // Validate positive numbers for most numeric configs
      if (value < 0 && !key.includes(CONFIG_KEY_FRAGMENT.THRESHOLD)) {
        return {valid: false, error: CONFIG_ERROR_MSG.NON_NEGATIVE_REQUIRED};
      }
      break;

    case ConfigValueType.BOOLEAN:
      if (typeof value !== 'boolean') {
        return {
          valid: false,
          error: `${CONFIG_ERROR_MSG.EXPECTED_BOOLEAN_PREFIX}${typeof value}`,
        };
      }
      break;

    case ConfigValueType.JSON:
      if (typeof value !== 'object') {
        return {
          valid: false,
          error: `${CONFIG_ERROR_MSG.EXPECTED_OBJECT_PREFIX}${typeof value}`,
        };
      }
      break;
    }

    return {valid: true};
  }

  /**
   * Get configuration from SQL engine.
   * @param {string} key - Configuration key.
   * @return {Promise<Object|null>} Configuration row or null.
   * @private
   */
  async getConfigFromTable(key) {
    if (this.canReadConfig()) {
      const result = await this.getControlPlaneSystemTableGateway().readRows(
        SYSTEM_TABLE_NAME.CONFIG,
        CONFIG_SELECT_BY_KEY_SQL,
        [key],
      );
      return result.rows?.[0] || null;
    }
    return null;
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
      return value ? CONFIG_ENV.TRUE : CONFIG_ENV.FALSE;
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
      return serialized === CONFIG_ENV.TRUE || serialized === CONFIG_ENV.ONE;
    case ConfigValueType.JSON:
      try {
        return JSON.parse(serialized);
      } catch (_parseErr) {
        return CONFIG_VALUE_DEFAULT.EMPTY_OBJECT;
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
      .replace(CONFIG_ENV_REGEX.DOT, CONFIG_SEPARATOR.UNDERSCORE)
      .replace(CONFIG_ENV_REGEX.CAMEL_CASE, CONFIG_ENV_REPLACE.CAMEL_CASE)
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
      return value.toLowerCase() === CONFIG_ENV.TRUE || value === CONFIG_ENV.ONE;
    case ConfigValueType.JSON:
      try {
        return JSON.parse(value);
      } catch (_parseErr) {
        return CONFIG_VALUE_DEFAULT.EMPTY_OBJECT;
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
   * Resolve value type for incoming CDC config events.
   * CDC update payloads can omit value_type, so fall back to key metadata.
   * @param {string} key - Config key.
   * @param {string} valueType - Value type from CDC payload.
   * @return {string} Resolved value type.
   * @private
   */
  resolveValueType(key, valueType) {
    if (typeof valueType === 'string' &&
      valueType.length > 0) {
      return valueType;
    }

    const definition = CONFIG_DEFINITIONS[key];
    if (definition?.type) {
      return definition.type;
    }

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

  canReadConfig() {
    return Boolean(
      this.controlPlaneSystemTableGateway ||
      this.sqlQueryEngine ||
      this.cdcIntegrationService,
    );
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getSqlQueryEngine: () => this.sqlQueryEngine,
      getSystemTableCache: () => this.systemTableCache,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
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
