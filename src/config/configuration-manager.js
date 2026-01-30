/**
 * Configuration Manager - Centralized configuration system.
 * Provides symbolic names for all constants and validates configuration at startup.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import Ajv from 'ajv';
import {v4 as uuidv4} from 'uuid';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONFIG_ENV,
  CONFIG_ERROR_MSG,
  CONFIG_SCHEMA,
  CONFIG_SEPARATOR,
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
} from './config-constants.js';


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
   * @throws {Error} If configuration validation fails.
   */
  initialize(overrides = {}) {
    // Load environment variables
    this.loadEnvironmentVariables();

    // Apply overrides
    this.applyOverrides(overrides);

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

  /**
   * Load configuration from environment variables.
   * @private
   */
  loadEnvironmentVariables() {
    for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setByPath(configPath, this.parseEnvValue(value, configPath));
      }
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

    if (typeof defaultValue === TYPEOF.NUMBER) {
      const parsed = Number(value);
      if (isNaN(parsed)) {
        throw new Error(
          `${CONFIG_ERROR_MSG.INVALID_NUMBER_PREFIX}${path}` +
          `${CONFIG_SEPARATOR.COLON_SPACE}${value}`,
        );
      }
      return parsed;
    }

    if (typeof defaultValue === TYPEOF.BOOLEAN) {
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

    for (const part of parts) {
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

    for (let i = NUM.ZERO; i < parts.length - NUM.ONE; i += NUM.ONE) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - NUM.ONE]] = value;
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
    return Object.keys(this.config);
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
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === TYPEOF.OBJECT &&
        !Array.isArray(source[key])
      ) {
        if (!(key in target)) {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

export {ConfigurationManager, CONFIG_SCHEMA, DEFAULT_CONFIG, ENV_MAPPINGS};
