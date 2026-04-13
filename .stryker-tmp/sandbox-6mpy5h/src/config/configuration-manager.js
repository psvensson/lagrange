/**
 * Configuration Manager - Centralized configuration system.
 * Provides symbolic names for all constants and validates configuration at startup.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import Ajv from 'ajv';
import { v4 as uuidv4 } from 'uuid';
import { NUM, TYPEOF } from '../constants/index.js';
import { CONFIG_ENV, CONFIG_ERROR_MSG, CONFIG_SCHEMA, CONFIG_SEPARATOR, DEFAULT_CONFIG, ENV_MAPPINGS } from './config-constants.js';

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
    if (stryMutAct_9fa48("53330")) {
      {}
    } else {
      stryCov_9fa48("53330");
      this.config = this.deepClone(DEFAULT_CONFIG);
      this.ajv = new Ajv(stryMutAct_9fa48("53331") ? {} : (stryCov_9fa48("53331"), {
        allErrors: stryMutAct_9fa48("53332") ? false : (stryCov_9fa48("53332"), true),
        strict: stryMutAct_9fa48("53333") ? true : (stryCov_9fa48("53333"), false)
      }));
      this.validate = this.ajv.compile(CONFIG_SCHEMA);
      this.initialized = stryMutAct_9fa48("53334") ? true : (stryCov_9fa48("53334"), false);
    }
  }

  /**
   * Get the singleton instance.
   * @return {ConfigurationManager} The configuration manager instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("53335")) {
      {}
    } else {
      stryCov_9fa48("53335");
      if (stryMutAct_9fa48("53338") ? false : stryMutAct_9fa48("53337") ? true : stryMutAct_9fa48("53336") ? ConfigurationManager.instance : (stryCov_9fa48("53336", "53337", "53338"), !ConfigurationManager.instance)) {
        if (stryMutAct_9fa48("53339")) {
          {}
        } else {
          stryCov_9fa48("53339");
          ConfigurationManager.instance = new ConfigurationManager();
        }
      }
      return ConfigurationManager.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("53340")) {
      {}
    } else {
      stryCov_9fa48("53340");
      ConfigurationManager.instance = null;
    }
  }

  /**
   * Initialize the configuration manager.
   * Loads environment variables and validates configuration.
   * @param {Object} overrides - Optional configuration overrides.
   * @throws {Error} If configuration validation fails.
   */
  initialize(overrides = {}) {
    if (stryMutAct_9fa48("53341")) {
      {}
    } else {
      stryCov_9fa48("53341");
      // Load environment variables
      this.loadEnvironmentVariables();

      // Apply overrides
      this.applyOverrides(overrides);

      // Generate node ID if not provided
      if (stryMutAct_9fa48("53344") ? false : stryMutAct_9fa48("53343") ? true : stryMutAct_9fa48("53342") ? this.config.node.id : (stryCov_9fa48("53342", "53343", "53344"), !this.config.node.id)) {
        if (stryMutAct_9fa48("53345")) {
          {}
        } else {
          stryCov_9fa48("53345");
          this.config.node.id = uuidv4();
        }
      }

      // Validate configuration
      const valid = this.validate(this.config);
      if (stryMutAct_9fa48("53348") ? false : stryMutAct_9fa48("53347") ? true : stryMutAct_9fa48("53346") ? valid : (stryCov_9fa48("53346", "53347", "53348"), !valid)) {
        if (stryMutAct_9fa48("53349")) {
          {}
        } else {
          stryCov_9fa48("53349");
          const errors = this.validate.errors.map(stryMutAct_9fa48("53350") ? () => undefined : (stryCov_9fa48("53350"), e => stryMutAct_9fa48("53351") ? `` : (stryCov_9fa48("53351"), `${e.instancePath} ${e.message}`))).join(CONFIG_SEPARATOR.COMMA_SPACE);
          throw new Error(stryMutAct_9fa48("53352") ? `` : (stryCov_9fa48("53352"), `${CONFIG_ERROR_MSG.VALIDATION_FAILED_PREFIX}${errors}`));
        }
      }
      this.initialized = stryMutAct_9fa48("53353") ? false : (stryCov_9fa48("53353"), true);
    }
  }

  /**
   * Load configuration from environment variables.
   * @private
   */
  loadEnvironmentVariables() {
    if (stryMutAct_9fa48("53354")) {
      {}
    } else {
      stryCov_9fa48("53354");
      for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
        if (stryMutAct_9fa48("53355")) {
          {}
        } else {
          stryCov_9fa48("53355");
          const value = process.env[envVar];
          if (stryMutAct_9fa48("53358") ? value === undefined : stryMutAct_9fa48("53357") ? false : stryMutAct_9fa48("53356") ? true : (stryCov_9fa48("53356", "53357", "53358"), value !== undefined)) {
            if (stryMutAct_9fa48("53359")) {
              {}
            } else {
              stryCov_9fa48("53359");
              this.setByPath(configPath, this.parseEnvValue(value, configPath));
            }
          }
        }
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
    if (stryMutAct_9fa48("53360")) {
      {}
    } else {
      stryCov_9fa48("53360");
      // Determine expected type from default config
      const defaultValue = this.getByPath(path, DEFAULT_CONFIG);
      if (stryMutAct_9fa48("53363") ? typeof defaultValue !== TYPEOF.NUMBER : stryMutAct_9fa48("53362") ? false : stryMutAct_9fa48("53361") ? true : (stryCov_9fa48("53361", "53362", "53363"), typeof defaultValue === TYPEOF.NUMBER)) {
        if (stryMutAct_9fa48("53364")) {
          {}
        } else {
          stryCov_9fa48("53364");
          const parsed = Number(value);
          if (stryMutAct_9fa48("53366") ? false : stryMutAct_9fa48("53365") ? true : (stryCov_9fa48("53365", "53366"), isNaN(parsed))) {
            if (stryMutAct_9fa48("53367")) {
              {}
            } else {
              stryCov_9fa48("53367");
              throw new Error((stryMutAct_9fa48("53368") ? `` : (stryCov_9fa48("53368"), `${CONFIG_ERROR_MSG.INVALID_NUMBER_PREFIX}${path}`)) + (stryMutAct_9fa48("53369") ? `` : (stryCov_9fa48("53369"), `${CONFIG_SEPARATOR.COLON_SPACE}${value}`)));
            }
          }
          return parsed;
        }
      }
      if (stryMutAct_9fa48("53372") ? typeof defaultValue !== TYPEOF.BOOLEAN : stryMutAct_9fa48("53371") ? false : stryMutAct_9fa48("53370") ? true : (stryCov_9fa48("53370", "53371", "53372"), typeof defaultValue === TYPEOF.BOOLEAN)) {
        if (stryMutAct_9fa48("53373")) {
          {}
        } else {
          stryCov_9fa48("53373");
          return stryMutAct_9fa48("53376") ? value.toLowerCase() === CONFIG_ENV.TRUE && value === CONFIG_ENV.ONE : stryMutAct_9fa48("53375") ? false : stryMutAct_9fa48("53374") ? true : (stryCov_9fa48("53374", "53375", "53376"), (stryMutAct_9fa48("53378") ? value.toLowerCase() !== CONFIG_ENV.TRUE : stryMutAct_9fa48("53377") ? false : (stryCov_9fa48("53377", "53378"), (stryMutAct_9fa48("53379") ? value.toUpperCase() : (stryCov_9fa48("53379"), value.toLowerCase())) === CONFIG_ENV.TRUE)) || (stryMutAct_9fa48("53381") ? value !== CONFIG_ENV.ONE : stryMutAct_9fa48("53380") ? false : (stryCov_9fa48("53380", "53381"), value === CONFIG_ENV.ONE)));
        }
      }
      return value;
    }
  }

  /**
   * Apply configuration overrides.
   * @param {Object} overrides - Configuration overrides.
   * @private
   */
  applyOverrides(overrides) {
    if (stryMutAct_9fa48("53382")) {
      {}
    } else {
      stryCov_9fa48("53382");
      this.deepMerge(this.config, overrides);
    }
  }

  /**
   * Get a configuration value by path.
   * @param {string} path - Dot-separated path (e.g., 'node.id').
   * @param {Object} obj - Object to get value from (defaults to config).
   * @return {*} The configuration value.
   */
  get(path, obj = this.config) {
    if (stryMutAct_9fa48("53383")) {
      {}
    } else {
      stryCov_9fa48("53383");
      return this.getByPath(path, obj);
    }
  }

  /**
   * Get a configuration value by path.
   * @param {string} path - Dot-separated path.
   * @param {Object} obj - Object to get value from.
   * @return {*} The value at the path.
   * @private
   */
  getByPath(path, obj) {
    if (stryMutAct_9fa48("53384")) {
      {}
    } else {
      stryCov_9fa48("53384");
      const parts = path.split(CONFIG_SEPARATOR.DOT);
      let current = obj;
      for (const part of parts) {
        if (stryMutAct_9fa48("53385")) {
          {}
        } else {
          stryCov_9fa48("53385");
          if (stryMutAct_9fa48("53388") ? current === undefined && current === null : stryMutAct_9fa48("53387") ? false : stryMutAct_9fa48("53386") ? true : (stryCov_9fa48("53386", "53387", "53388"), (stryMutAct_9fa48("53390") ? current !== undefined : stryMutAct_9fa48("53389") ? false : (stryCov_9fa48("53389", "53390"), current === undefined)) || (stryMutAct_9fa48("53392") ? current !== null : stryMutAct_9fa48("53391") ? false : (stryCov_9fa48("53391", "53392"), current === null)))) {
            if (stryMutAct_9fa48("53393")) {
              {}
            } else {
              stryCov_9fa48("53393");
              return undefined;
            }
          }
          current = current[part];
        }
      }
      return current;
    }
  }

  /**
   * Set a configuration value by path.
   * @param {string} path - Dot-separated path.
   * @param {*} value - The value to set.
   * @private
   */
  setByPath(path, value) {
    if (stryMutAct_9fa48("53394")) {
      {}
    } else {
      stryCov_9fa48("53394");
      const parts = path.split(CONFIG_SEPARATOR.DOT);
      let current = this.config;
      for (let i = NUM.ZERO; stryMutAct_9fa48("53397") ? i >= parts.length - NUM.ONE : stryMutAct_9fa48("53396") ? i <= parts.length - NUM.ONE : stryMutAct_9fa48("53395") ? false : (stryCov_9fa48("53395", "53396", "53397"), i < (stryMutAct_9fa48("53398") ? parts.length + NUM.ONE : (stryCov_9fa48("53398"), parts.length - NUM.ONE))); stryMutAct_9fa48("53399") ? i -= NUM.ONE : (stryCov_9fa48("53399"), i += NUM.ONE)) {
        if (stryMutAct_9fa48("53400")) {
          {}
        } else {
          stryCov_9fa48("53400");
          const part = parts[i];
          if (stryMutAct_9fa48("53403") ? false : stryMutAct_9fa48("53402") ? true : stryMutAct_9fa48("53401") ? part in current : (stryCov_9fa48("53401", "53402", "53403"), !(part in current))) {
            if (stryMutAct_9fa48("53404")) {
              {}
            } else {
              stryCov_9fa48("53404");
              current[part] = {};
            }
          }
          current = current[part];
        }
      }
      current[parts[stryMutAct_9fa48("53405") ? parts.length + NUM.ONE : (stryCov_9fa48("53405"), parts.length - NUM.ONE)]] = value;
    }
  }

  /**
   * Get all configuration values for a category.
   * @param {string} category - The configuration category.
   * @return {Object} The category configuration.
   */
  getCategory(category) {
    if (stryMutAct_9fa48("53406")) {
      {}
    } else {
      stryCov_9fa48("53406");
      return this.deepClone(stryMutAct_9fa48("53409") ? this.config[category] && {} : stryMutAct_9fa48("53408") ? false : stryMutAct_9fa48("53407") ? true : (stryCov_9fa48("53407", "53408", "53409"), this.config[category] || {}));
    }
  }

  /**
   * Get all configuration values.
   * @return {Object} The complete configuration.
   */
  getAll() {
    if (stryMutAct_9fa48("53410")) {
      {}
    } else {
      stryCov_9fa48("53410");
      return this.deepClone(this.config);
    }
  }

  /**
   * Check if the configuration manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("53411")) {
      {}
    } else {
      stryCov_9fa48("53411");
      return this.initialized;
    }
  }

  /**
   * Get the list of configuration categories.
   * @return {string[]} Array of category names.
   */
  getCategories() {
    if (stryMutAct_9fa48("53412")) {
      {}
    } else {
      stryCov_9fa48("53412");
      return Object.keys(this.config);
    }
  }

  /**
   * Get the default value for a configuration path.
   * @param {string} path - Dot-separated path.
   * @return {*} The default value.
   */
  getDefault(path) {
    if (stryMutAct_9fa48("53413")) {
      {}
    } else {
      stryCov_9fa48("53413");
      return this.getByPath(path, DEFAULT_CONFIG);
    }
  }

  /**
   * Deep clone an object.
   * @param {Object} obj - Object to clone.
   * @return {Object} Cloned object.
   * @private
   */
  deepClone(obj) {
    if (stryMutAct_9fa48("53414")) {
      {}
    } else {
      stryCov_9fa48("53414");
      return JSON.parse(JSON.stringify(obj));
    }
  }

  /**
   * Deep merge source into target.
   * @param {Object} target - Target object.
   * @param {Object} source - Source object.
   * @private
   */
  deepMerge(target, source) {
    if (stryMutAct_9fa48("53415")) {
      {}
    } else {
      stryCov_9fa48("53415");
      for (const key of Object.keys(source)) {
        if (stryMutAct_9fa48("53416")) {
          {}
        } else {
          stryCov_9fa48("53416");
          if (stryMutAct_9fa48("53419") ? source[key] !== null && typeof source[key] === TYPEOF.OBJECT || !Array.isArray(source[key]) : stryMutAct_9fa48("53418") ? false : stryMutAct_9fa48("53417") ? true : (stryCov_9fa48("53417", "53418", "53419"), (stryMutAct_9fa48("53421") ? source[key] !== null || typeof source[key] === TYPEOF.OBJECT : stryMutAct_9fa48("53420") ? true : (stryCov_9fa48("53420", "53421"), (stryMutAct_9fa48("53423") ? source[key] === null : stryMutAct_9fa48("53422") ? true : (stryCov_9fa48("53422", "53423"), source[key] !== null)) && (stryMutAct_9fa48("53425") ? typeof source[key] !== TYPEOF.OBJECT : stryMutAct_9fa48("53424") ? true : (stryCov_9fa48("53424", "53425"), typeof source[key] === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("53426") ? Array.isArray(source[key]) : (stryCov_9fa48("53426"), !Array.isArray(source[key]))))) {
            if (stryMutAct_9fa48("53427")) {
              {}
            } else {
              stryCov_9fa48("53427");
              if (stryMutAct_9fa48("53430") ? false : stryMutAct_9fa48("53429") ? true : stryMutAct_9fa48("53428") ? key in target : (stryCov_9fa48("53428", "53429", "53430"), !(key in target))) {
                if (stryMutAct_9fa48("53431")) {
                  {}
                } else {
                  stryCov_9fa48("53431");
                  target[key] = {};
                }
              }
              this.deepMerge(target[key], source[key]);
            }
          } else {
            if (stryMutAct_9fa48("53432")) {
              {}
            } else {
              stryCov_9fa48("53432");
              target[key] = source[key];
            }
          }
        }
      }
    }
  }
}
export { ConfigurationManager, CONFIG_SCHEMA, DEFAULT_CONFIG, ENV_MAPPINGS };