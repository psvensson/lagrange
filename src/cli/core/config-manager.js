/**
 * ConfigManager - Configuration management with file, environment, and CLI overrides
 * Loads configuration from ~/.ddb-admin/config.json with environment and CLI overrides
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

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

/**
 * Valid configuration keys and their types
 */
const CONFIG_SCHEMA = {
  node_address: {type: 'string', required: false},
  refresh_interval: {type: 'number', min: 1000, max: 60000},
  default_view: {
    type: 'string',
    enum: [
      'nodes', 'services', 'tables', 'partitions',
      'message_groups', 'sql', 'logs', 'config', 'contexts',
    ],
  },
  color_scheme: {type: 'string', enum: ['default', 'monochrome']},
  cache_persistence: {type: 'boolean'},
  cache_path: {type: 'string'},
  log_path: {type: 'string'},
  cdc_lag_threshold: {type: 'number', min: 1000},
  read_only_mode: {type: 'boolean'},
  keybindings: {type: 'object'},
};

export class ConfigManager {
  constructor() {
    /** @type {Config} */
    this.defaults = {
      refresh_interval: 2000,
      default_view: 'nodes',
      color_scheme: 'default',
      cache_persistence: true,
      cache_path: path.join(os.homedir(), '.ddb-admin', 'cache.json'),
      log_path: path.join(os.homedir(), '.ddb-admin', 'error.log'),
      cdc_lag_threshold: 5000,
      read_only_mode: false,
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
    return path.join(os.homedir(), '.ddb-admin');
  }

  /**
   * Get the config file path
   * @returns {string}
   */
  getConfigPath() {
    return path.join(this.getConfigDir(), 'config.json');
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
    // DDB_NODE_ADDRESS
    if (process.env.DDB_NODE_ADDRESS) {
      this.config.node_address = process.env.DDB_NODE_ADDRESS;
    }

    // DDB_REFRESH_INTERVAL
    if (process.env.DDB_REFRESH_INTERVAL) {
      const interval = parseInt(process.env.DDB_REFRESH_INTERVAL, 10);
      const validationResult = this.validateField('refresh_interval', interval);
      if (validationResult.valid) {
        this.config.refresh_interval = interval;
      } else {
        this.warnings.push(
          `Environment: Invalid DDB_REFRESH_INTERVAL: ${validationResult.error}. ` +
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
      this.config.color_scheme = 'monochrome';
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
      return {valid: false, error: 'Unknown configuration key'};
    }

    // Type check
    if (schema.type === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        return {valid: false, error: 'Must be a number'};
      }
      if (schema.min !== undefined && value < schema.min) {
        return {valid: false, error: `Must be at least ${schema.min}`};
      }
      if (schema.max !== undefined && value > schema.max) {
        return {valid: false, error: `Must be at most ${schema.max}`};
      }
    } else if (schema.type === 'string') {
      if (typeof value !== 'string') {
        return {valid: false, error: 'Must be a string'};
      }
      if (schema.enum && !schema.enum.includes(value)) {
        return {valid: false, error: `Must be one of: ${schema.enum.join(', ')}`};
      }
    } else if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return {valid: false, error: 'Must be a boolean'};
      }
    } else if (schema.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {valid: false, error: 'Must be an object'};
      }
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

    fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf8');
  }
}
