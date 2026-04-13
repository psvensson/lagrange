/**
 * ConfigManager - Configuration management with file, environment, and CLI overrides
 * Loads configuration from ~/.ddb-admin/config.json with environment and CLI overrides
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
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
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CLI_COLOR_SCHEME, CLI_DEFAULT, CLI_ENV, CLI_PATH, CLI_VIEW_LIST } from '../cli-constants.js';

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
const CONFIG_SCHEMA = stryMutAct_9fa48("40646") ? {} : (stryCov_9fa48("40646"), {
  node_address: stryMutAct_9fa48("40647") ? {} : (stryCov_9fa48("40647"), {
    type: stryMutAct_9fa48("40648") ? "" : (stryCov_9fa48("40648"), 'string'),
    required: stryMutAct_9fa48("40649") ? true : (stryCov_9fa48("40649"), false)
  }),
  refresh_interval: stryMutAct_9fa48("40650") ? {} : (stryCov_9fa48("40650"), {
    type: stryMutAct_9fa48("40651") ? "" : (stryCov_9fa48("40651"), 'number'),
    min: 1000,
    max: 60000
  }),
  default_view: stryMutAct_9fa48("40652") ? {} : (stryCov_9fa48("40652"), {
    type: stryMutAct_9fa48("40653") ? "" : (stryCov_9fa48("40653"), 'string'),
    enum: stryMutAct_9fa48("40654") ? [] : (stryCov_9fa48("40654"), [...CLI_VIEW_LIST])
  }),
  color_scheme: stryMutAct_9fa48("40655") ? {} : (stryCov_9fa48("40655"), {
    type: stryMutAct_9fa48("40656") ? "" : (stryCov_9fa48("40656"), 'string'),
    enum: stryMutAct_9fa48("40657") ? [] : (stryCov_9fa48("40657"), [CLI_COLOR_SCHEME.DEFAULT, CLI_COLOR_SCHEME.MONOCHROME])
  }),
  cache_persistence: stryMutAct_9fa48("40658") ? {} : (stryCov_9fa48("40658"), {
    type: stryMutAct_9fa48("40659") ? "" : (stryCov_9fa48("40659"), 'boolean')
  }),
  cache_path: stryMutAct_9fa48("40660") ? {} : (stryCov_9fa48("40660"), {
    type: stryMutAct_9fa48("40661") ? "" : (stryCov_9fa48("40661"), 'string')
  }),
  log_path: stryMutAct_9fa48("40662") ? {} : (stryCov_9fa48("40662"), {
    type: stryMutAct_9fa48("40663") ? "" : (stryCov_9fa48("40663"), 'string')
  }),
  cdc_lag_threshold: stryMutAct_9fa48("40664") ? {} : (stryCov_9fa48("40664"), {
    type: stryMutAct_9fa48("40665") ? "" : (stryCov_9fa48("40665"), 'number'),
    min: 1000
  }),
  read_only_mode: stryMutAct_9fa48("40666") ? {} : (stryCov_9fa48("40666"), {
    type: stryMutAct_9fa48("40667") ? "" : (stryCov_9fa48("40667"), 'boolean')
  }),
  keybindings: stryMutAct_9fa48("40668") ? {} : (stryCov_9fa48("40668"), {
    type: stryMutAct_9fa48("40669") ? "" : (stryCov_9fa48("40669"), 'object')
  })
});
export class ConfigManager {
  constructor() {
    if (stryMutAct_9fa48("40670")) {
      {}
    } else {
      stryCov_9fa48("40670");
      /** @type {Config} */
      this.defaults = stryMutAct_9fa48("40671") ? {} : (stryCov_9fa48("40671"), {
        refresh_interval: CLI_DEFAULT.REFRESH_INTERVAL_MS,
        default_view: CLI_DEFAULT.DEFAULT_VIEW,
        color_scheme: CLI_DEFAULT.COLOR_SCHEME,
        cache_persistence: CLI_DEFAULT.CACHE_PERSISTENCE,
        cache_path: path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.CACHE_FILE),
        log_path: path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.ERROR_LOG_FILE),
        cdc_lag_threshold: CLI_DEFAULT.CDC_LAG_THRESHOLD_MS,
        read_only_mode: CLI_DEFAULT.READ_ONLY_MODE,
        keybindings: {}
      });

      /** @type {Config} */
      this.config = stryMutAct_9fa48("40672") ? {} : (stryCov_9fa48("40672"), {
        ...this.defaults
      });

      /** @type {string[]} */
      this.warnings = stryMutAct_9fa48("40673") ? ["Stryker was here"] : (stryCov_9fa48("40673"), []);
    }
  }

  /**
   * Get the config directory path
   * @returns {string}
   */
  getConfigDir() {
    if (stryMutAct_9fa48("40674")) {
      {}
    } else {
      stryCov_9fa48("40674");
      return path.join(os.homedir(), CLI_PATH.CONFIG_DIR_NAME);
    }
  }

  /**
   * Get the config file path
   * @returns {string}
   */
  getConfigPath() {
    if (stryMutAct_9fa48("40675")) {
      {}
    } else {
      stryCov_9fa48("40675");
      return path.join(this.getConfigDir(), CLI_PATH.CONFIG_FILE);
    }
  }

  /**
   * Load configuration from file, environment, and apply defaults
   * Priority: defaults < file < environment
   */
  load() {
    if (stryMutAct_9fa48("40676")) {
      {}
    } else {
      stryCov_9fa48("40676");
      this.warnings = stryMutAct_9fa48("40677") ? ["Stryker was here"] : (stryCov_9fa48("40677"), []);

      // Start with defaults
      this.config = stryMutAct_9fa48("40678") ? {} : (stryCov_9fa48("40678"), {
        ...this.defaults
      });

      // Load from file
      this.loadFromFile();

      // Apply environment variable overrides
      this.loadFromEnvironment();
    }
  }

  /**
   * Load configuration from file
   */
  loadFromFile() {
    if (stryMutAct_9fa48("40679")) {
      {}
    } else {
      stryCov_9fa48("40679");
      const configPath = this.getConfigPath();
      if (stryMutAct_9fa48("40682") ? false : stryMutAct_9fa48("40681") ? true : stryMutAct_9fa48("40680") ? fs.existsSync(configPath) : (stryCov_9fa48("40680", "40681", "40682"), !fs.existsSync(configPath))) {
        if (stryMutAct_9fa48("40683")) {
          {}
        } else {
          stryCov_9fa48("40683");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("40684")) {
          {}
        } else {
          stryCov_9fa48("40684");
          const fileContent = fs.readFileSync(configPath, stryMutAct_9fa48("40685") ? "" : (stryCov_9fa48("40685"), 'utf8'));
          const fileConfig = JSON.parse(fileContent);

          // Validate and merge file config
          for (const [key, value] of Object.entries(fileConfig)) {
            if (stryMutAct_9fa48("40686")) {
              {}
            } else {
              stryCov_9fa48("40686");
              const validationResult = this.validateField(key, value);
              if (stryMutAct_9fa48("40688") ? false : stryMutAct_9fa48("40687") ? true : (stryCov_9fa48("40687", "40688"), validationResult.valid)) {
                if (stryMutAct_9fa48("40689")) {
                  {}
                } else {
                  stryCov_9fa48("40689");
                  this.config[key] = value;
                }
              } else {
                if (stryMutAct_9fa48("40690")) {
                  {}
                } else {
                  stryCov_9fa48("40690");
                  this.warnings.push((stryMutAct_9fa48("40691") ? `` : (stryCov_9fa48("40691"), `Config file: Invalid value for '${key}': ${validationResult.error}. `)) + (stryMutAct_9fa48("40692") ? `` : (stryCov_9fa48("40692"), `Using default: ${this.defaults[key]}`)));
                }
              }
            }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("40693")) {
          {}
        } else {
          stryCov_9fa48("40693");
          if (stryMutAct_9fa48("40695") ? false : stryMutAct_9fa48("40694") ? true : (stryCov_9fa48("40694", "40695"), err instanceof SyntaxError)) {
            if (stryMutAct_9fa48("40696")) {
              {}
            } else {
              stryCov_9fa48("40696");
              this.warnings.push(stryMutAct_9fa48("40697") ? `` : (stryCov_9fa48("40697"), `Invalid JSON in config file: ${err.message}. Using defaults.`));
            }
          } else {
            if (stryMutAct_9fa48("40698")) {
              {}
            } else {
              stryCov_9fa48("40698");
              this.warnings.push(stryMutAct_9fa48("40699") ? `` : (stryCov_9fa48("40699"), `Error reading config file: ${err.message}. Using defaults.`));
            }
          }
        }
      }
    }
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnvironment() {
    if (stryMutAct_9fa48("40700")) {
      {}
    } else {
      stryCov_9fa48("40700");
      // DDB_NODE_ADDRESS
      if (stryMutAct_9fa48("40702") ? false : stryMutAct_9fa48("40701") ? true : (stryCov_9fa48("40701", "40702"), process.env[CLI_ENV.NODE_ADDRESS])) {
        if (stryMutAct_9fa48("40703")) {
          {}
        } else {
          stryCov_9fa48("40703");
          this.config.node_address = process.env[CLI_ENV.NODE_ADDRESS];
        }
      }

      // DDB_REFRESH_INTERVAL
      if (stryMutAct_9fa48("40705") ? false : stryMutAct_9fa48("40704") ? true : (stryCov_9fa48("40704", "40705"), process.env[CLI_ENV.REFRESH_INTERVAL])) {
        if (stryMutAct_9fa48("40706")) {
          {}
        } else {
          stryCov_9fa48("40706");
          const interval = parseInt(process.env[CLI_ENV.REFRESH_INTERVAL], 10);
          const validationResult = this.validateField(stryMutAct_9fa48("40707") ? "" : (stryCov_9fa48("40707"), 'refresh_interval'), interval);
          if (stryMutAct_9fa48("40709") ? false : stryMutAct_9fa48("40708") ? true : (stryCov_9fa48("40708", "40709"), validationResult.valid)) {
            if (stryMutAct_9fa48("40710")) {
              {}
            } else {
              stryCov_9fa48("40710");
              this.config.refresh_interval = interval;
            }
          } else {
            if (stryMutAct_9fa48("40711")) {
              {}
            } else {
              stryCov_9fa48("40711");
              this.warnings.push((stryMutAct_9fa48("40712") ? `` : (stryCov_9fa48("40712"), `Environment: Invalid ${CLI_ENV.REFRESH_INTERVAL}: ${validationResult.error}. `)) + (stryMutAct_9fa48("40713") ? `` : (stryCov_9fa48("40713"), `Using: ${this.config.refresh_interval}`)));
            }
          }
        }
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
    if (stryMutAct_9fa48("40714")) {
      {}
    } else {
      stryCov_9fa48("40714");
      if (stryMutAct_9fa48("40717") ? false : stryMutAct_9fa48("40716") ? true : stryMutAct_9fa48("40715") ? args : (stryCov_9fa48("40715", "40716", "40717"), !args)) return;
      if (stryMutAct_9fa48("40719") ? false : stryMutAct_9fa48("40718") ? true : (stryCov_9fa48("40718", "40719"), args.address)) {
        if (stryMutAct_9fa48("40720")) {
          {}
        } else {
          stryCov_9fa48("40720");
          this.config.node_address = args.address;
        }
      }
      if (stryMutAct_9fa48("40723") ? args.refresh === undefined : stryMutAct_9fa48("40722") ? false : stryMutAct_9fa48("40721") ? true : (stryCov_9fa48("40721", "40722", "40723"), args.refresh !== undefined)) {
        if (stryMutAct_9fa48("40724")) {
          {}
        } else {
          stryCov_9fa48("40724");
          const validationResult = this.validateField(stryMutAct_9fa48("40725") ? "" : (stryCov_9fa48("40725"), 'refresh_interval'), args.refresh);
          if (stryMutAct_9fa48("40727") ? false : stryMutAct_9fa48("40726") ? true : (stryCov_9fa48("40726", "40727"), validationResult.valid)) {
            if (stryMutAct_9fa48("40728")) {
              {}
            } else {
              stryCov_9fa48("40728");
              this.config.refresh_interval = args.refresh;
            }
          } else {
            if (stryMutAct_9fa48("40729")) {
              {}
            } else {
              stryCov_9fa48("40729");
              this.warnings.push((stryMutAct_9fa48("40730") ? `` : (stryCov_9fa48("40730"), `CLI: Invalid refresh interval: ${validationResult.error}. `)) + (stryMutAct_9fa48("40731") ? `` : (stryCov_9fa48("40731"), `Using: ${this.config.refresh_interval}`)));
            }
          }
        }
      }
      if (stryMutAct_9fa48("40733") ? false : stryMutAct_9fa48("40732") ? true : (stryCov_9fa48("40732", "40733"), args.view)) {
        if (stryMutAct_9fa48("40734")) {
          {}
        } else {
          stryCov_9fa48("40734");
          const validationResult = this.validateField(stryMutAct_9fa48("40735") ? "" : (stryCov_9fa48("40735"), 'default_view'), args.view);
          if (stryMutAct_9fa48("40737") ? false : stryMutAct_9fa48("40736") ? true : (stryCov_9fa48("40736", "40737"), validationResult.valid)) {
            if (stryMutAct_9fa48("40738")) {
              {}
            } else {
              stryCov_9fa48("40738");
              this.config.default_view = args.view;
            }
          } else {
            if (stryMutAct_9fa48("40739")) {
              {}
            } else {
              stryCov_9fa48("40739");
              this.warnings.push((stryMutAct_9fa48("40740") ? `` : (stryCov_9fa48("40740"), `CLI: Invalid view: ${validationResult.error}. `)) + (stryMutAct_9fa48("40741") ? `` : (stryCov_9fa48("40741"), `Using: ${this.config.default_view}`)));
            }
          }
        }
      }
      if (stryMutAct_9fa48("40743") ? false : stryMutAct_9fa48("40742") ? true : (stryCov_9fa48("40742", "40743"), args.monochrome)) {
        if (stryMutAct_9fa48("40744")) {
          {}
        } else {
          stryCov_9fa48("40744");
          this.config.color_scheme = CLI_COLOR_SCHEME.MONOCHROME;
        }
      }
      if (stryMutAct_9fa48("40746") ? false : stryMutAct_9fa48("40745") ? true : (stryCov_9fa48("40745", "40746"), args.readOnly)) {
        if (stryMutAct_9fa48("40747")) {
          {}
        } else {
          stryCov_9fa48("40747");
          this.config.read_only_mode = stryMutAct_9fa48("40748") ? false : (stryCov_9fa48("40748"), true);
        }
      }
    }
  }

  /**
   * Validate a configuration field
   * @param {string} key - Configuration key
   * @param {*} value - Value to validate
   * @returns {{valid: boolean, error?: string}}
   */
  validateField(key, value) {
    if (stryMutAct_9fa48("40749")) {
      {}
    } else {
      stryCov_9fa48("40749");
      const schema = CONFIG_SCHEMA[key];

      // Unknown keys are allowed but ignored
      if (stryMutAct_9fa48("40752") ? false : stryMutAct_9fa48("40751") ? true : stryMutAct_9fa48("40750") ? schema : (stryCov_9fa48("40750", "40751", "40752"), !schema)) {
        if (stryMutAct_9fa48("40753")) {
          {}
        } else {
          stryCov_9fa48("40753");
          return stryMutAct_9fa48("40754") ? {} : (stryCov_9fa48("40754"), {
            valid: stryMutAct_9fa48("40755") ? true : (stryCov_9fa48("40755"), false),
            error: stryMutAct_9fa48("40756") ? "" : (stryCov_9fa48("40756"), 'Unknown configuration key')
          });
        }
      }

      // Type check
      if (stryMutAct_9fa48("40759") ? schema.type !== 'number' : stryMutAct_9fa48("40758") ? false : stryMutAct_9fa48("40757") ? true : (stryCov_9fa48("40757", "40758", "40759"), schema.type === (stryMutAct_9fa48("40760") ? "" : (stryCov_9fa48("40760"), 'number')))) {
        if (stryMutAct_9fa48("40761")) {
          {}
        } else {
          stryCov_9fa48("40761");
          if (stryMutAct_9fa48("40764") ? typeof value !== 'number' && isNaN(value) : stryMutAct_9fa48("40763") ? false : stryMutAct_9fa48("40762") ? true : (stryCov_9fa48("40762", "40763", "40764"), (stryMutAct_9fa48("40766") ? typeof value === 'number' : stryMutAct_9fa48("40765") ? false : (stryCov_9fa48("40765", "40766"), typeof value !== (stryMutAct_9fa48("40767") ? "" : (stryCov_9fa48("40767"), 'number')))) || isNaN(value))) {
            if (stryMutAct_9fa48("40768")) {
              {}
            } else {
              stryCov_9fa48("40768");
              return stryMutAct_9fa48("40769") ? {} : (stryCov_9fa48("40769"), {
                valid: stryMutAct_9fa48("40770") ? true : (stryCov_9fa48("40770"), false),
                error: stryMutAct_9fa48("40771") ? "" : (stryCov_9fa48("40771"), 'Must be a number')
              });
            }
          }
          if (stryMutAct_9fa48("40774") ? schema.min !== undefined || value < schema.min : stryMutAct_9fa48("40773") ? false : stryMutAct_9fa48("40772") ? true : (stryCov_9fa48("40772", "40773", "40774"), (stryMutAct_9fa48("40776") ? schema.min === undefined : stryMutAct_9fa48("40775") ? true : (stryCov_9fa48("40775", "40776"), schema.min !== undefined)) && (stryMutAct_9fa48("40779") ? value >= schema.min : stryMutAct_9fa48("40778") ? value <= schema.min : stryMutAct_9fa48("40777") ? true : (stryCov_9fa48("40777", "40778", "40779"), value < schema.min)))) {
            if (stryMutAct_9fa48("40780")) {
              {}
            } else {
              stryCov_9fa48("40780");
              return stryMutAct_9fa48("40781") ? {} : (stryCov_9fa48("40781"), {
                valid: stryMutAct_9fa48("40782") ? true : (stryCov_9fa48("40782"), false),
                error: stryMutAct_9fa48("40783") ? `` : (stryCov_9fa48("40783"), `Must be at least ${schema.min}`)
              });
            }
          }
          if (stryMutAct_9fa48("40786") ? schema.max !== undefined || value > schema.max : stryMutAct_9fa48("40785") ? false : stryMutAct_9fa48("40784") ? true : (stryCov_9fa48("40784", "40785", "40786"), (stryMutAct_9fa48("40788") ? schema.max === undefined : stryMutAct_9fa48("40787") ? true : (stryCov_9fa48("40787", "40788"), schema.max !== undefined)) && (stryMutAct_9fa48("40791") ? value <= schema.max : stryMutAct_9fa48("40790") ? value >= schema.max : stryMutAct_9fa48("40789") ? true : (stryCov_9fa48("40789", "40790", "40791"), value > schema.max)))) {
            if (stryMutAct_9fa48("40792")) {
              {}
            } else {
              stryCov_9fa48("40792");
              return stryMutAct_9fa48("40793") ? {} : (stryCov_9fa48("40793"), {
                valid: stryMutAct_9fa48("40794") ? true : (stryCov_9fa48("40794"), false),
                error: stryMutAct_9fa48("40795") ? `` : (stryCov_9fa48("40795"), `Must be at most ${schema.max}`)
              });
            }
          }
        }
      } else if (stryMutAct_9fa48("40798") ? schema.type !== 'string' : stryMutAct_9fa48("40797") ? false : stryMutAct_9fa48("40796") ? true : (stryCov_9fa48("40796", "40797", "40798"), schema.type === (stryMutAct_9fa48("40799") ? "" : (stryCov_9fa48("40799"), 'string')))) {
        if (stryMutAct_9fa48("40800")) {
          {}
        } else {
          stryCov_9fa48("40800");
          if (stryMutAct_9fa48("40803") ? typeof value === 'string' : stryMutAct_9fa48("40802") ? false : stryMutAct_9fa48("40801") ? true : (stryCov_9fa48("40801", "40802", "40803"), typeof value !== (stryMutAct_9fa48("40804") ? "" : (stryCov_9fa48("40804"), 'string')))) {
            if (stryMutAct_9fa48("40805")) {
              {}
            } else {
              stryCov_9fa48("40805");
              return stryMutAct_9fa48("40806") ? {} : (stryCov_9fa48("40806"), {
                valid: stryMutAct_9fa48("40807") ? true : (stryCov_9fa48("40807"), false),
                error: stryMutAct_9fa48("40808") ? "" : (stryCov_9fa48("40808"), 'Must be a string')
              });
            }
          }
          if (stryMutAct_9fa48("40811") ? schema.enum || !schema.enum.includes(value) : stryMutAct_9fa48("40810") ? false : stryMutAct_9fa48("40809") ? true : (stryCov_9fa48("40809", "40810", "40811"), schema.enum && (stryMutAct_9fa48("40812") ? schema.enum.includes(value) : (stryCov_9fa48("40812"), !schema.enum.includes(value))))) {
            if (stryMutAct_9fa48("40813")) {
              {}
            } else {
              stryCov_9fa48("40813");
              return stryMutAct_9fa48("40814") ? {} : (stryCov_9fa48("40814"), {
                valid: stryMutAct_9fa48("40815") ? true : (stryCov_9fa48("40815"), false),
                error: stryMutAct_9fa48("40816") ? `` : (stryCov_9fa48("40816"), `Must be one of: ${schema.enum.join(stryMutAct_9fa48("40817") ? "" : (stryCov_9fa48("40817"), ', '))}`)
              });
            }
          }
        }
      } else if (stryMutAct_9fa48("40820") ? schema.type !== 'boolean' : stryMutAct_9fa48("40819") ? false : stryMutAct_9fa48("40818") ? true : (stryCov_9fa48("40818", "40819", "40820"), schema.type === (stryMutAct_9fa48("40821") ? "" : (stryCov_9fa48("40821"), 'boolean')))) {
        if (stryMutAct_9fa48("40822")) {
          {}
        } else {
          stryCov_9fa48("40822");
          if (stryMutAct_9fa48("40825") ? typeof value === 'boolean' : stryMutAct_9fa48("40824") ? false : stryMutAct_9fa48("40823") ? true : (stryCov_9fa48("40823", "40824", "40825"), typeof value !== (stryMutAct_9fa48("40826") ? "" : (stryCov_9fa48("40826"), 'boolean')))) {
            if (stryMutAct_9fa48("40827")) {
              {}
            } else {
              stryCov_9fa48("40827");
              return stryMutAct_9fa48("40828") ? {} : (stryCov_9fa48("40828"), {
                valid: stryMutAct_9fa48("40829") ? true : (stryCov_9fa48("40829"), false),
                error: stryMutAct_9fa48("40830") ? "" : (stryCov_9fa48("40830"), 'Must be a boolean')
              });
            }
          }
        }
      } else if (stryMutAct_9fa48("40833") ? schema.type !== 'object' : stryMutAct_9fa48("40832") ? false : stryMutAct_9fa48("40831") ? true : (stryCov_9fa48("40831", "40832", "40833"), schema.type === (stryMutAct_9fa48("40834") ? "" : (stryCov_9fa48("40834"), 'object')))) {
        if (stryMutAct_9fa48("40835")) {
          {}
        } else {
          stryCov_9fa48("40835");
          if (stryMutAct_9fa48("40838") ? (typeof value !== 'object' || value === null) && Array.isArray(value) : stryMutAct_9fa48("40837") ? false : stryMutAct_9fa48("40836") ? true : (stryCov_9fa48("40836", "40837", "40838"), (stryMutAct_9fa48("40840") ? typeof value !== 'object' && value === null : stryMutAct_9fa48("40839") ? false : (stryCov_9fa48("40839", "40840"), (stryMutAct_9fa48("40842") ? typeof value === 'object' : stryMutAct_9fa48("40841") ? false : (stryCov_9fa48("40841", "40842"), typeof value !== (stryMutAct_9fa48("40843") ? "" : (stryCov_9fa48("40843"), 'object')))) || (stryMutAct_9fa48("40845") ? value !== null : stryMutAct_9fa48("40844") ? false : (stryCov_9fa48("40844", "40845"), value === null)))) || Array.isArray(value))) {
            if (stryMutAct_9fa48("40846")) {
              {}
            } else {
              stryCov_9fa48("40846");
              return stryMutAct_9fa48("40847") ? {} : (stryCov_9fa48("40847"), {
                valid: stryMutAct_9fa48("40848") ? true : (stryCov_9fa48("40848"), false),
                error: stryMutAct_9fa48("40849") ? "" : (stryCov_9fa48("40849"), 'Must be an object')
              });
            }
          }
        }
      }
      return stryMutAct_9fa48("40850") ? {} : (stryCov_9fa48("40850"), {
        valid: stryMutAct_9fa48("40851") ? false : (stryCov_9fa48("40851"), true)
      });
    }
  }

  /**
   * Validate the entire configuration
   * @param {Object} config - Configuration to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateConfig(config) {
    if (stryMutAct_9fa48("40852")) {
      {}
    } else {
      stryCov_9fa48("40852");
      const errors = stryMutAct_9fa48("40853") ? ["Stryker was here"] : (stryCov_9fa48("40853"), []);
      for (const [key, value] of Object.entries(config)) {
        if (stryMutAct_9fa48("40854")) {
          {}
        } else {
          stryCov_9fa48("40854");
          if (stryMutAct_9fa48("40856") ? false : stryMutAct_9fa48("40855") ? true : (stryCov_9fa48("40855", "40856"), CONFIG_SCHEMA[key])) {
            if (stryMutAct_9fa48("40857")) {
              {}
            } else {
              stryCov_9fa48("40857");
              const result = this.validateField(key, value);
              if (stryMutAct_9fa48("40860") ? false : stryMutAct_9fa48("40859") ? true : stryMutAct_9fa48("40858") ? result.valid : (stryCov_9fa48("40858", "40859", "40860"), !result.valid)) {
                if (stryMutAct_9fa48("40861")) {
                  {}
                } else {
                  stryCov_9fa48("40861");
                  errors.push(stryMutAct_9fa48("40862") ? `` : (stryCov_9fa48("40862"), `${key}: ${result.error}`));
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("40863") ? {} : (stryCov_9fa48("40863"), {
        valid: stryMutAct_9fa48("40866") ? errors.length !== 0 : stryMutAct_9fa48("40865") ? false : stryMutAct_9fa48("40864") ? true : (stryCov_9fa48("40864", "40865", "40866"), errors.length === 0),
        errors
      });
    }
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    if (stryMutAct_9fa48("40867")) {
      {}
    } else {
      stryCov_9fa48("40867");
      return this.config[key];
    }
  }

  /**
   * Get all configuration
   * @returns {Config}
   */
  getAll() {
    if (stryMutAct_9fa48("40868")) {
      {}
    } else {
      stryCov_9fa48("40868");
      return stryMutAct_9fa48("40869") ? {} : (stryCov_9fa48("40869"), {
        ...this.config
      });
    }
  }

  /**
   * Get default value for a key
   * @param {string} key - Configuration key
   * @returns {*}
   */
  getDefault(key) {
    if (stryMutAct_9fa48("40870")) {
      {}
    } else {
      stryCov_9fa48("40870");
      return this.defaults[key];
    }
  }

  /**
   * Get all warnings from loading
   * @returns {string[]}
   */
  getWarnings() {
    if (stryMutAct_9fa48("40871")) {
      {}
    } else {
      stryCov_9fa48("40871");
      return stryMutAct_9fa48("40872") ? [] : (stryCov_9fa48("40872"), [...this.warnings]);
    }
  }

  /**
   * Check if there were any warnings during loading
   * @returns {boolean}
   */
  hasWarnings() {
    if (stryMutAct_9fa48("40873")) {
      {}
    } else {
      stryCov_9fa48("40873");
      return stryMutAct_9fa48("40877") ? this.warnings.length <= 0 : stryMutAct_9fa48("40876") ? this.warnings.length >= 0 : stryMutAct_9fa48("40875") ? false : stryMutAct_9fa48("40874") ? true : (stryCov_9fa48("40874", "40875", "40876", "40877"), this.warnings.length > 0);
    }
  }

  /**
   * Ensure config directory exists
   */
  ensureConfigDir() {
    if (stryMutAct_9fa48("40878")) {
      {}
    } else {
      stryCov_9fa48("40878");
      const configDir = this.getConfigDir();
      if (stryMutAct_9fa48("40881") ? false : stryMutAct_9fa48("40880") ? true : stryMutAct_9fa48("40879") ? fs.existsSync(configDir) : (stryCov_9fa48("40879", "40880", "40881"), !fs.existsSync(configDir))) {
        if (stryMutAct_9fa48("40882")) {
          {}
        } else {
          stryCov_9fa48("40882");
          fs.mkdirSync(configDir, stryMutAct_9fa48("40883") ? {} : (stryCov_9fa48("40883"), {
            recursive: stryMutAct_9fa48("40884") ? false : (stryCov_9fa48("40884"), true)
          }));
        }
      }
    }
  }

  /**
   * Save current configuration to file
   */
  save() {
    if (stryMutAct_9fa48("40885")) {
      {}
    } else {
      stryCov_9fa48("40885");
      this.ensureConfigDir();
      const configPath = this.getConfigPath();

      // Only save non-default values
      const toSave = {};
      for (const [key, value] of Object.entries(this.config)) {
        if (stryMutAct_9fa48("40886")) {
          {}
        } else {
          stryCov_9fa48("40886");
          if (stryMutAct_9fa48("40889") ? this.defaults[key] === value : stryMutAct_9fa48("40888") ? false : stryMutAct_9fa48("40887") ? true : (stryCov_9fa48("40887", "40888", "40889"), this.defaults[key] !== value)) {
            if (stryMutAct_9fa48("40890")) {
              {}
            } else {
              stryCov_9fa48("40890");
              toSave[key] = value;
            }
          }
        }
      }
      fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), stryMutAct_9fa48("40891") ? "" : (stryCov_9fa48("40891"), 'utf8'));
    }
  }
}