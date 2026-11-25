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
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {requireConfirmedSingleRowMutation} from
  '../control-plane/control-plane-single-row-confirmation.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {createDynamicConfigProfileResolver} from './network-timing-profile-resolver.js';
import {
  CONFIG_DEFINITIONS,
  CONFIG_ENV,
  CONFIG_ENV_REGEX,
  CONFIG_ENV_REPLACE,
  CONFIG_ERROR_CODE,
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
const CONFIG_MUTATION_CONFIRMATION = Object.freeze({
  ownerName: CONFIG_SUBSYSTEM.DYNAMIC_CONFIG,
  tableName: SYSTEM_TABLE_NAME.CONFIG,
  changed: Object.freeze({code: CONFIG_ERROR_CODE.OBSERVATION_CHANGED,
    message: 'The configuration mutation affected no row'}),
  unconfirmed: Object.freeze({code: CONFIG_ERROR_CODE.OUTCOME_UNCONFIRMED,
    message: 'The configuration mutation application is not confirmed'}),
});

const ConfigValueType = CONFIG_VALUE_TYPE;

/**
 * DynamicConfigService manages configuration through the config system table.
 * Provides watchers for configuration changes and supports hot reload.
 */
// The instant a config row is stamped with: an explicit reading, then the
// node's clock, then the host's.
function resolveConfigStampMs(nowMs, nodeClock) {
  if (Number.isFinite(nowMs)) {
    return nowMs;
  }
  return typeof nodeClock === 'function' ? nodeClock() : Date.now();
}

function selectSeedOutcomeBucket(counts, mutationResult) {
  const effect = classifyControlPlaneMutationResult(mutationResult);
  if (effect.applied) return counts.seeded;
  const present = !effect.failed && (effect.zeroAffectedRows ||
    effect.outcome === CONTROL_PLANE_MUTATION_OUTCOME.NO_OP);
  if (present) return counts.alreadyPresent;
  return !effect.valid || effect.outcome === CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN ?
    counts.unknown : counts.refused;
}

function assertSeedConfigurationComplete(counts) {
  if (counts.refused.length === 0 && counts.unknown.length === 0) return counts;
  const error = new Error(
    `${CONFIG_ERROR_MSG.SEEDING_INCOMPLETE_PREFIX}refused=${counts.refused.length}, ` +
    `unknown=${counts.unknown.length}`,
  );
  error.code = CONFIG_ERROR_CODE.SEEDING_INCOMPLETE;
  error.counts = counts;
  throw error;
}

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
    // This service stamps config rows for one node, so it reads that node's
    // clock. Unsupplied, it is the host clock exactly as before.
    this.now = typeof options.now === 'function' ? options.now : null;
    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.profileTiming = createDynamicConfigProfileResolver(options);

    // Local cache of configuration values
    this.configCache = new Map();
    // CDC applies per key, monotonic for the life of the service.
    this.cdcApplySeqByKey = new Map();

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
   * @param {number} [options.nowMs] - Explicit timestamp override in ms.
   * @return {Promise<Object>} Seeding result.
   */
  async seedConfiguration(updatedBy = CONFIG_SEED_SOURCE.SYSTEM, _options = {}) {
    const counts = {seeded: [], alreadyPresent: [], refused: [], unknown: []};
    const now = resolveConfigStampMs(_options.nowMs, this.now);
    const gateway = this.getControlPlaneSystemTableGateway();
    const writeOptions = {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: CONFIG_MUTATION_DELIVERY_PRIORITY, ignoreExisting: true,
    };
    const outcomes = await Promise.all(
      Object.entries(CONFIG_DEFINITIONS).map(async ([key, definition]) => {
        const envValue = process.env[this.keyToEnvVar(key)];
        const value = envValue !== undefined ?
          this.parseEnvValue(envValue, definition.type) :
          this.profileTiming.seedDefault(key, definition);
        const row = {
          [CONFIG_TABLE_COLUMN.KEY]: key,
          [CONFIG_TABLE_COLUMN.VALUE]: this.serializeValue(value, definition.type),
          [CONFIG_TABLE_COLUMN.VALUE_TYPE]: definition.type,
          [CONFIG_TABLE_COLUMN.REQUIRES_RESTART]: definition.requiresRestart ? 1 : 0,
          [CONFIG_TABLE_COLUMN.DESCRIPTION]: definition.description,
          [CONFIG_TABLE_COLUMN.DEFAULT_VALUE]:
            this.serializeValue(definition.defaultValue, definition.type),
          [CONFIG_TABLE_COLUMN.UPDATED_BY]: updatedBy,
          [CONFIG_TABLE_COLUMN.UPDATED_AT]: now,
          [CONFIG_TABLE_COLUMN.CREATED_AT]: now,
        };
        return {key, mutationResult: await gateway.insertSystemTableRow(
          SYSTEM_TABLE_NAME.CONFIG, row, writeOptions)};
      }),
    );
    for (const {key, mutationResult} of outcomes) {
      selectSeedOutcomeBucket(counts, mutationResult).push(key);
    }
    this.logger.info(CONFIG_LOG_MSG.SEEDING_COMPLETE, {
      seeded: counts.seeded.length, alreadyPresent: counts.alreadyPresent.length,
      refused: counts.refused.length, unknown: counts.unknown.length,
    });
    return assertSeedConfigurationComplete(counts);
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

    // Try system table cache. A CDC apply for the key while this read was in
    // flight is newer than anything it returns: the cache keeps the CDC value
    // and this answers from it.
    const definition = CONFIG_DEFINITIONS[key];
    const cdcSeqAtStart = this.cdcApplySequence(key);
    const config = await this.getConfigFromTable(key);
    if (this.cdcApplySequence(key) !== cdcSeqAtStart) {
      return this.configCache.has(key) ?
        this.configCache.get(key) :
        this.profileTiming.seedDefault(key, definition);
    }
    if (config) {
      const rawValue = this.deserializeValue(config.config_value, config.value_type);
      const value = this.profileTiming.resolveRead(key, rawValue, config, definition);
      this.configCache.set(key, value);
      return value;
    }

    // Return default if defined
    if (definition) {
      return this.profileTiming.seedDefault(key, definition);
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
      const refusal = new Error(
        `${CONFIG_ERROR_MSG.INVALID_VALUE_PREFIX}${validation.error}`);
      refusal.code = CONFIG_ERROR_CODE.VALUE_INVALID;
      throw refusal;
    }

    const definition = CONFIG_DEFINITIONS[key];
    const valueType = definition ? definition.type : this.inferType(value);
    const now = resolveConfigStampMs(null, this.now);

    // Check if key exists
    const existing = await this.getConfigFromTable(key);

    let mutationResult;
    if (existing) {
      // Update existing
      mutationResult = await this.getControlPlaneSystemTableGateway().submitMutation({
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
      mutationResult = await this.getControlPlaneSystemTableGateway().submitMutation({
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

    requireConfirmedSingleRowMutation(mutationResult, CONFIG_MUTATION_CONFIRMATION);
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
        const key = config[CONFIG_TABLE_COLUMN.KEY];
        const val = this.deserializeValue(
          config[CONFIG_TABLE_COLUMN.VALUE], config[CONFIG_TABLE_COLUMN.VALUE_TYPE]);
        result[key] = this.profileTiming.resolveRead(key, val, config, CONFIG_DEFINITIONS[key]);
      }
    }

    // Fill in defaults for missing keys
    for (const [key, definition] of Object.entries(CONFIG_DEFINITIONS)) {
      if (!(key in result)) {
        result[key] = this.profileTiming.seedDefault(key, definition);
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
   * How many CDC events this service has applied for a key. The one ordering
   * authority for a read: a read that started before a later apply is stale.
   * @param {string} key - Configuration key.
   * @return {number} Applies so far.
   */
  cdcApplySequence(key) {
    return this.cdcApplySeqByKey.get(key) ?? 0;
  }

  /**
   * Handle CDC event for config table changes.
   * This is called when the cache receives CDC updates.
   * @param {Object} event - CDC event.
   */
  async handleCDCEvent(event) {
    const {operation, data} = event;
    const key = data[CONFIG_TABLE_COLUMN.KEY];
    this.cdcApplySeqByKey.set(key, this.cdcApplySequence(key) + 1);
    const op = String(operation || '').toUpperCase();
    if (
      op === CDC_OPERATION.INSERT ||
      op === CDC_OPERATION.UPDATE ||
      op === CDC_OPERATION.UPSERT
    ) {
      const valueType = this.resolveValueType(key, data[CONFIG_TABLE_COLUMN.VALUE_TYPE]);
      const rawNew = this.deserializeValue(data[CONFIG_TABLE_COLUMN.VALUE], valueType);
      const newValue = this.profileTiming.resolveRead(key, rawNew, data, CONFIG_DEFINITIONS[key]);
      const oldValue = this.configCache.get(key);
      this.configCache.set(key, newValue);
      if (oldValue !== newValue) {
        const oldValueSerialized = oldValue === undefined ?
          undefined :
          this.serializeValue(oldValue, valueType);
        await this.notifyWatchers(key, newValue, oldValueSerialized);
      }
    } else if (op === CDC_OPERATION.DELETE) {
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
      // The gateway stamps mutations for THIS node.
      now: this.now,
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
