/**
 * ConfigManager - Configuration management with file, environment, and CLI overrides
 * Loads configuration from ~/.lagrange-admin/config.json with environment and CLI overrides
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  CLI_COLOR_SCHEME,
  CLI_DEFAULT,
  CLI_ENV,
  CLI_PATH,
  CLI_VIEW_LIST,
} from '../cli-constants.js';

const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_UTF8 = 'utf8';

/**
 * @typedef {Object} Config
 * @property {string} [node_address] - Node address to connect to
 * @property {number} refresh_interval - Refresh interval in ms
 * @property {string} default_view - Default view to show
 * @property {string} color_scheme - Color scheme ('default' or 'monochrome')
 * @property {boolean} cache_persistence - Whether to persist cache
 * @property {string} cache_path - Path to cache file
 * @property {string} log_path - Path to error log
 * @property {number} cdc_lag_threshold - CDC lag threshold in ms
 * @property {boolean} read_only_mode - Whether to enable read-only mode
 * @property {Object} keybindings - Custom keybindings
 */

const CONFIG_VALUE_TYPE = Object.freeze({
  BOOLEAN: 'boolean',
  NUMBER: 'number',
  OBJECT: 'object',
  STRING: 'string',
});
const CONFIG_VALIDATION_ERROR = Object.freeze({
  BOOLEAN: 'Must be a boolean',
  NUMBER: 'Must be a number',
  OBJECT: 'Must be an object',
  STRING: 'Must be a string',
  UNKNOWN_KEY: 'Unknown configuration key',
});

/**
 * Valid configuration keys and their types
 */
const CONFIG_SCHEMA = {
  node_address: {type: CONFIG_VALUE_TYPE.STRING, required: false},
  refresh_interval: {
    type: CONFIG_VALUE_TYPE.NUMBER,
    min: 1000,
    max: 60000,
  },
  default_view: {
    type: CONFIG_VALUE_TYPE.STRING,
    enum: [...CLI_VIEW_LIST],
  },
  color_scheme: {
    type: CONFIG_VALUE_TYPE.STRING,
    enum: [CLI_COLOR_SCHEME.DEFAULT, CLI_COLOR_SCHEME.MONOCHROME],
  },
  cache_persistence: {type: CONFIG_VALUE_TYPE.BOOLEAN},
  cache_path: {type: CONFIG_VALUE_TYPE.STRING},
  log_path: {type: CONFIG_VALUE_TYPE.STRING},
  cdc_lag_threshold: {type: CONFIG_VALUE_TYPE.NUMBER, min: 1000},
  read_only_mode: {type: CONFIG_VALUE_TYPE.BOOLEAN},
  keybindings: {type: CONFIG_VALUE_TYPE.OBJECT},
};

function validateNumberField(schema, value) {
  if (typeof value !== CONFIG_VALUE_TYPE.NUMBER || isNaN(value)) {
    return {valid: false, error: CONFIG_VALIDATION_ERROR.NUMBER};
  }
  if (schema.min !== undefined && value < schema.min) {
    return {valid: false, error: `Must be at least ${schema.min}`};
  }
  if (schema.max !== undefined && value > schema.max) {
    return {valid: false, error: `Must be at most ${schema.max}`};
  }
  return {valid: true};
}

function validateStringField(schema, value) {
  if (typeof value !== CONFIG_VALUE_TYPE.STRING) {
    return {valid: false, error: CONFIG_VALIDATION_ERROR.STRING};
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return {valid: false, error: `Must be one of: ${schema.enum.join(LOCAL_STR_COMMA_SPACE)}`};
  }
  return {valid: true};
}

function validateBooleanField(_schema, value) {
  return typeof value === CONFIG_VALUE_TYPE.BOOLEAN ?
    {valid: true} :
    {valid: false, error: CONFIG_VALIDATION_ERROR.BOOLEAN};
}

function validateObjectField(_schema, value) {
  const isObjectValue =
    typeof value === CONFIG_VALUE_TYPE.OBJECT &&
    value !== null &&
    !Array.isArray(value);
  return isObjectValue ?
    {valid: true} :
    {valid: false, error: CONFIG_VALIDATION_ERROR.OBJECT};
}

const CONFIG_FIELD_VALIDATOR = Object.freeze({
  [CONFIG_VALUE_TYPE.BOOLEAN]: validateBooleanField,
  [CONFIG_VALUE_TYPE.NUMBER]: validateNumberField,
  [CONFIG_VALUE_TYPE.OBJECT]: validateObjectField,
  [CONFIG_VALUE_TYPE.STRING]: validateStringField,
});

export class ConfigManager {
  constructor() {
    /** @type {Config} */
    this.defaults = {
      refresh_interval: CLI_DEFAULT.REFRESH_INTERVAL_MS,
      default_view: CLI_DEFAULT.DEFAULT_VIEW,
      color_scheme: CLI_DEFAULT.COLOR_SCHEME,
      cache_persistence: CLI_DEFAULT.CACHE_PERSISTENCE,
      cache_path: path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.CACHE_FILE),
      log_path: path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.ERROR_LOG_FILE),
      cdc_lag_threshold: CLI_DEFAULT.CDC_LAG_THRESHOLD_MS,
      read_only_mode: CLI_DEFAULT.READ_ONLY_MODE,
      keybindings: {},
    };

    /** @type {Config} */
    this.config = {...this.defaults};

    /** @type {string[]} */
    this.warnings = [];
  }

  /**
   * Get the config directory path
   * @returns {string}
   */
  getConfigDir() {
    return path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME);
  }

  /**
   * Get the config file path
   * @returns {string}
   */
  getConfigPath() {
    return path.join(this.getConfigDir(), CLI_PATH.CONFIG_FILE);
  }

  /**
   * Load configuration from file, environment, and apply defaults
   * Priority: defaults < file < environment
   */
  load() {
    this.warnings = [];

    // Start with defaults
    this.config = {...this.defaults};

    // Load from file
    this.loadFromFile();

    // Apply environment variable overrides
    this.loadFromEnvironment();
  }

  /**
   * Load configuration from file
   */
  loadFromFile() {
    const configPath = this.getConfigPath();

    if (!fs.existsSync(configPath)) {
      return;
    }

    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const fileConfig = JSON.parse(fileContent);

      // Validate and merge file config
      for (const [key, value] of Object.entries(fileConfig)) {
        const validationResult = this.validateField(key, value);
        if (validationResult.valid) {
          this.config[key] = value;
        } else {
          this.warnings.push(
            `Config file: Invalid value for '${key}': ${validationResult.error}. ` +
              `Using default: ${this.defaults[key]}`,
          );
        }
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.warnings.push(
          `Invalid JSON in config file: ${err.message}. Using defaults.`,
        );
      } else {
        this.warnings.push(
          `Error reading config file: ${err.message}. Using defaults.`,
        );
      }
    }
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnvironment() {
    // LAGRANGE_NODE_ADDRESS
    if (process.env[CLI_ENV.NODE_ADDRESS]) {
      this.config.node_address = process.env[CLI_ENV.NODE_ADDRESS];
    }

    // LAGRANGE_REFRESH_INTERVAL
    if (process.env[CLI_ENV.REFRESH_INTERVAL]) {
      const interval = parseInt(process.env[CLI_ENV.REFRESH_INTERVAL], 10);
      const validationResult = this.validateField('refresh_interval', interval);
      if (validationResult.valid) {
        this.config.refresh_interval = interval;
      } else {
        this.warnings.push(
          `Environment: Invalid ${CLI_ENV.REFRESH_INTERVAL}: ${validationResult.error}. ` +
            `Using: ${this.config.refresh_interval}`,
        );
      }
    }
  }

  /**
   * Apply CLI argument overrides
   * Priority: CLI args override everything
   * @param {Object} args - Parsed CLI arguments
   * @param {string} [args.address] - Node address
   * @param {number} [args.refresh] - Refresh interval
   * @param {string} [args.view] - Default view
   * @param {boolean} [args.monochrome] - Use monochrome color scheme
   * @param {boolean} [args.readOnly] - Enable read-only mode
   */
  applyCliArgs(args) {
    if (!args) return;

    if (args.address) {
      this.config.node_address = args.address;
    }

    if (args.refresh !== undefined) {
      const validationResult = this.validateField('refresh_interval', args.refresh);
      if (validationResult.valid) {
        this.config.refresh_interval = args.refresh;
      } else {
        this.warnings.push(
          `CLI: Invalid refresh interval: ${validationResult.error}. ` +
            `Using: ${this.config.refresh_interval}`,
        );
      }
    }

    if (args.view) {
      const validationResult = this.validateField('default_view', args.view);
      if (validationResult.valid) {
        this.config.default_view = args.view;
      } else {
        this.warnings.push(
          `CLI: Invalid view: ${validationResult.error}. ` +
            `Using: ${this.config.default_view}`,
        );
      }
    }

    if (args.monochrome) {
      this.config.color_scheme = CLI_COLOR_SCHEME.MONOCHROME;
    }

    if (args.readOnly) {
      this.config.read_only_mode = true;
    }
  }

  /**
   * Validate a configuration field
   * @param {string} key - Configuration key
   * @param {*} value - Value to validate
   * @returns {{valid: boolean, error?: string}}
   */
  validateField(key, value) {
    const schema = CONFIG_SCHEMA[key];

    // Unknown keys are allowed but ignored
    if (!schema) {
      return {valid: false, error: CONFIG_VALIDATION_ERROR.UNKNOWN_KEY};
    }

    const validator = CONFIG_FIELD_VALIDATOR[schema.type];
    if (validator) {
      return validator(schema, value);
    }

    return {valid: true};
  }

  /**
   * Validate the entire configuration
   * @param {Object} config - Configuration to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateConfig(config) {
    const errors = [];

    for (const [key, value] of Object.entries(config)) {
      if (CONFIG_SCHEMA[key]) {
        const result = this.validateField(key, value);
        if (!result.valid) {
          errors.push(`${key}: ${result.error}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Get all configuration
   * @returns {Config}
   */
  getAll() {
    return {...this.config};
  }

  /**
   * Get default value for a key
   * @param {string} key - Configuration key
   * @returns {*}
   */
  getDefault(key) {
    return this.defaults[key];
  }

  /**
   * Get all warnings from loading
   * @returns {string[]}
   */
  getWarnings() {
    return [...this.warnings];
  }

  /**
   * Check if there were any warnings during loading
   * @returns {boolean}
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * Ensure config directory exists
   */
  ensureConfigDir() {
    const configDir = this.getConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, {recursive: true});
    }
  }

  /**
   * Save current configuration to file
   */
  save() {
    this.ensureConfigDir();
    const configPath = this.getConfigPath();

    // Only save non-default values
    const toSave = {};
    for (const [key, value] of Object.entries(this.config)) {
      if (this.defaults[key] !== value) {
        toSave[key] = value;
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), LOCAL_STR_UTF8);
  }
}
