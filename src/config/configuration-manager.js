/**
 * Configuration Manager - Centralized configuration system.
 * Provides symbolic names for all constants and validates configuration at startup.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import Ajv from 'ajv';
import {v4 as uuidv4} from 'uuid';
import {
  CONFIG_ENV,
  CONFIG_ERROR_MSG,
  CONFIG_KEY,
  CONFIG_SCHEMA,
  CONFIG_SEPARATOR,
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
  LEGACY_ENV_ALIASES,
} from './config-constants.js';
import {
  LISTENER_PORT_ENV,
  resolveListenerPorts,
} from './listener-port-model.js';

const LISTENER_PORT_OVERRIDE_PATH = Object.freeze({
  ADMIN_WEBSOCKET: Object.freeze(['admin', 'websocketPort']),
  TRANSPORT_WEBSOCKET: Object.freeze(['node', 'wsPort']),
});
const LOCAL_STR_VALUE = 'value';
const arrayIsArray = Array.isArray;
const objectEntries = Object.entries;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const DANGEROUS_CONFIGURATION_KEY = Object.freeze({
  CONSTRUCTOR: 'constructor',
  PROTOTYPE: 'prototype',
  PROTO_SETTER: '__proto__',
});

function isDangerousConfigurationKey(key) {
  return key === DANGEROUS_CONFIGURATION_KEY.PROTO_SETTER ||
    key === DANGEROUS_CONFIGURATION_KEY.CONSTRUCTOR ||
    key === DANGEROUS_CONFIGURATION_KEY.PROTOTYPE;
}

const LEGACY_ENV_NAME_BY_CANONICAL = Object.freeze(Object.fromEntries(
  objectEntries(LEGACY_ENV_ALIASES)
    .map(([legacy, canonical]) => [canonical, legacy]),
));

/**
 * Read an environment variable by its canonical name, falling back to its
 * deprecated legacy alias. The canonical name wins when both are set.
 * @param {string} canonicalName
 * @return {{value: (string|undefined), legacyName: (string|null)}}
 *   The resolved value, and the legacy name iff it supplied the value.
 */
function resolveEnvironmentValue(canonicalName, environment = process.env) {
  const canonical = environment[canonicalName];
  if (canonical !== undefined) {
    return {value: canonical, legacyName: null};
  }
  const legacyName = LEGACY_ENV_NAME_BY_CANONICAL[canonicalName] ?? null;
  const legacy = legacyName === null ? undefined : environment[legacyName];
  return legacy === undefined ?
    {value: undefined, legacyName: null} :
    {value: legacy, legacyName};
}

function hasOwnPath(value, pathParts) {
  let current = value;
  for (let index = 0; index < pathParts.length; index++) {
    const part = pathParts[index];
    if (!current || typeof current !== 'object' ||
        !objectHasOwn(current, part)) {
      return false;
    }
    current = current[part];
  }
  return true;
}


/**
 * ConfigurationManager singleton class.
 * Provides centralized configuration management with validation.
 */
class ConfigurationManager {
  static instance = null;

  /**
   * Create a new ConfigurationManager instance.
   * @private
   */
  constructor() {
    this.config = this.deepClone(DEFAULT_CONFIG);
    this.ajv = new Ajv({allErrors: true, strict: false});
    this.validate = this.ajv.compile(CONFIG_SCHEMA);
    this.initialized = false;
  }

  /**
   * Get the singleton instance.
   * @return {ConfigurationManager} The configuration manager instance.
   */
  static getInstance() {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    ConfigurationManager.instance = null;
  }

  /**
   * Initialize the configuration manager.
   * Loads environment variables and validates configuration.
   * @param {Object} overrides - Optional configuration overrides.
   * @param {Object} options - Initialization options.
   * @param {Object} options.environment - Explicit environment snapshot.
   * @param {Object} options.finalOverrides - Highest-precedence overrides.
   * @throws {Error} If configuration validation fails.
   */
  initialize(overrides = {}, options = {}) {
    const environment = options.environment || process.env;
    const listenerPortOverrides = {
      adminWebSocketPort:
        resolveEnvironmentValue(
          LISTENER_PORT_ENV.ADMIN_WEBSOCKET,
          environment,
        ).value !==
          undefined ||
        hasOwnPath(
          overrides,
          LISTENER_PORT_OVERRIDE_PATH.ADMIN_WEBSOCKET,
        ),
      transportWebSocketPort:
        resolveEnvironmentValue(
          LISTENER_PORT_ENV.TRANSPORT_WEBSOCKET,
          environment,
        )
          .value !== undefined ||
        hasOwnPath(
          overrides,
          LISTENER_PORT_OVERRIDE_PATH.TRANSPORT_WEBSOCKET,
        ),
    };
    // Load environment variables
    this.loadEnvironmentVariables(environment);

    // Apply overrides
    this.applyOverrides(overrides);
    this.applyOverrides(options.finalOverrides || {});

    this.applyListenerPortModel(listenerPortOverrides);

    // Generate node ID if not provided
    if (!this.config.node.id) {
      this.config.node.id = uuidv4();
    }

    // Validate configuration
    const valid = this.validate(this.config);
    if (!valid) {
      const errors = this.validate.errors
        .map((e) => `${e.instancePath} ${e.message}`)
        .join(CONFIG_SEPARATOR.COMMA_SPACE);
      throw new Error(`${CONFIG_ERROR_MSG.VALIDATION_FAILED_PREFIX}${errors}`);
    }

    this.initialized = true;
  }

  applyListenerPortModel(overrides) {
    const ports = resolveListenerPorts({
      restApiPort: this.get(CONFIG_KEY.NODE_REST_API_PORT),
      adminWebSocketPort: overrides.adminWebSocketPort ?
        this.get(CONFIG_KEY.ADMIN_WEBSOCKET_PORT) :
        undefined,
      transportWebSocketPort: overrides.transportWebSocketPort ?
        this.get(CONFIG_KEY.NODE_WS_PORT) :
        undefined,
    });
    this.setByPath(CONFIG_KEY.NODE_REST_API_PORT, ports.restApiPort);
    this.setByPath(
      CONFIG_KEY.ADMIN_WEBSOCKET_PORT,
      ports.adminWebSocketPort,
    );
    this.setByPath(
      CONFIG_KEY.NODE_WS_PORT,
      ports.transportWebSocketPort,
    );
  }

  /**
   * Load configuration from environment variables.
   * @private
   */
  loadEnvironmentVariables(environment = process.env) {
    const mappings = objectEntries(ENV_MAPPINGS);
    for (let index = 0; index < mappings.length; index++) {
      const [envVar, configPath] = mappings[index];
      const {value, legacyName} = resolveEnvironmentValue(envVar, environment);
      if (value === undefined) {
        continue;
      }
      if (legacyName !== null) {
        console.warn(
          CONFIG_ERROR_MSG.DEPRECATED_ENV_PREFIX + legacyName +
            CONFIG_ERROR_MSG.DEPRECATED_ENV_INFIX + envVar,
        );
      }
      this.setByPath(configPath, this.parseEnvValue(value, configPath));
    }
  }

  /**
   * Parse an environment variable value to the appropriate type.
   * @param {string} value - The environment variable value.
   * @param {string} path - The configuration path.
   * @return {*} The parsed value.
   * @private
   */
  parseEnvValue(value, path) {
    // Determine expected type from default config
    const defaultValue = this.getByPath(path, DEFAULT_CONFIG);

    if (typeof defaultValue === 'number') {
      const parsed = Number(value);
      if (isNaN(parsed)) {
        throw new Error(
          `${CONFIG_ERROR_MSG.INVALID_NUMBER_PREFIX}${path}` +
          `${CONFIG_SEPARATOR.COLON_SPACE}${value}`,
        );
      }
      return parsed;
    }

    if (typeof defaultValue === 'boolean') {
      return value.toLowerCase() === CONFIG_ENV.TRUE || value === CONFIG_ENV.ONE;
    }

    return value;
  }

  /**
   * Apply configuration overrides.
   * @param {Object} overrides - Configuration overrides.
   * @private
   */
  applyOverrides(overrides) {
    this.deepMerge(this.config, overrides);
  }

  /**
   * Get a configuration value by path.
   * @param {string} path - Dot-separated path (e.g., 'node.id').
   * @param {Object} obj - Object to get value from (defaults to config).
   * @return {*} The configuration value.
   */
  get(path, obj = this.config) {
    return this.getByPath(path, obj);
  }

  /**
   * Get a configuration value by path.
   * @param {string} path - Dot-separated path.
   * @param {Object} obj - Object to get value from.
   * @return {*} The value at the path.
   * @private
   */
  getByPath(path, obj) {
    const parts = path.split(CONFIG_SEPARATOR.DOT);
    let current = obj;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Set a configuration value by path.
   * @param {string} path - Dot-separated path.
   * @param {*} value - The value to set.
   * @private
   */
  setByPath(path, value) {
    const parts = path.split(CONFIG_SEPARATOR.DOT);
    let current = this.config;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Get all configuration values for a category.
   * @param {string} category - The configuration category.
   * @return {Object} The category configuration.
   */
  getCategory(category) {
    return this.deepClone(this.config[category] || {});
  }

  /**
   * Get all configuration values.
   * @return {Object} The complete configuration.
   */
  getAll() {
    return this.deepClone(this.config);
  }

  /**
   * Check if the configuration manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get the list of configuration categories.
   * @return {string[]} Array of category names.
   */
  getCategories() {
    return objectKeys(this.config);
  }

  /**
   * Get the default value for a configuration path.
   * @param {string} path - Dot-separated path.
   * @return {*} The default value.
   */
  getDefault(path) {
    return this.getByPath(path, DEFAULT_CONFIG);
  }

  /**
   * Deep clone an object.
   * @param {Object} obj - Object to clone.
   * @return {Object} Cloned object.
   * @private
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Deep merge source into target.
   * @param {Object} target - Target object.
   * @param {Object} source - Source object.
   * @private
   */
  deepMerge(target, source) {
    const keys = objectKeys(source);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      if (isDangerousConfigurationKey(key)) {
        throw new Error(`Unsafe configuration key: ${key}`);
      }
      const descriptor = objectGetOwnPropertyDescriptor(source, key);
      if (!descriptor || !objectHasOwn(descriptor, LOCAL_STR_VALUE)) {
        throw new Error(`Configuration property must be data: ${key}`);
      }
      const sourceValue = descriptor.value;
      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !arrayIsArray(sourceValue)
      ) {
        if (!objectHasOwn(target, key)) {
          target[key] = {};
        }
        this.deepMerge(target[key], sourceValue);
      } else {
        target[key] = sourceValue;
      }
    }
  }
}

export {ConfigurationManager, CONFIG_SCHEMA, DEFAULT_CONFIG, ENV_MAPPINGS};
