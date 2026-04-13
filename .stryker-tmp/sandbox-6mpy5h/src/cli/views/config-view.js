/**
 * ConfigView - Displays system configuration with filtering and highlighting
 *
 * Columns: key, value, type, requires_restart, last_modified
 * Supports filtering by key pattern, highlighting non-default values,
 * restart-required warnings, and config editing.
 *
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
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
import { BaseView, ROW_STATUS } from '../core/base-view.js';

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the value is valid
 * @property {*} [parsedValue] - The parsed value if valid
 * @property {string} [error] - Error message if invalid
 */

/**
 * Supported config value types
 */
export const CONFIG_TYPES = stryMutAct_9fa48("48333") ? [] : (stryCov_9fa48("48333"), [stryMutAct_9fa48("48334") ? "" : (stryCov_9fa48("48334"), 'string'), stryMutAct_9fa48("48335") ? "" : (stryCov_9fa48("48335"), 'number'), stryMutAct_9fa48("48336") ? "" : (stryCov_9fa48("48336"), 'boolean'), stryMutAct_9fa48("48337") ? "" : (stryCov_9fa48("48337"), 'json')]);

/**
 * ConfigView displays system configuration entries
 */
export class ConfigView extends BaseView {
  /**
   * Creates a new ConfigView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("48338")) {
      {}
    } else {
      stryCov_9fa48("48338");
      super(options);
      this.cache = stryMutAct_9fa48("48341") ? options.cache && null : stryMutAct_9fa48("48340") ? false : stryMutAct_9fa48("48339") ? true : (stryCov_9fa48("48339", "48340", "48341"), options.cache || null);
      this.viewName = stryMutAct_9fa48("48342") ? "" : (stryCov_9fa48("48342"), 'config');

      // Key pattern filter
      // Requirements: 30.2
      this.keyPatternFilter = null;

      // Default sort by key ascending
      this.sortColumn = stryMutAct_9fa48("48343") ? "" : (stryCov_9fa48("48343"), 'key');
      this.sortDirection = stryMutAct_9fa48("48344") ? "" : (stryCov_9fa48("48344"), 'asc');
    }
  }

  /**
   * Get column definitions for the config view
   * Requirements: 30.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    if (stryMutAct_9fa48("48345")) {
      {}
    } else {
      stryCov_9fa48("48345");
      return stryMutAct_9fa48("48346") ? [] : (stryCov_9fa48("48346"), [stryMutAct_9fa48("48347") ? {} : (stryCov_9fa48("48347"), {
        key: stryMutAct_9fa48("48348") ? "" : (stryCov_9fa48("48348"), 'key'),
        label: stryMutAct_9fa48("48349") ? "" : (stryCov_9fa48("48349"), 'Key'),
        width: 45
      }), stryMutAct_9fa48("48350") ? {} : (stryCov_9fa48("48350"), {
        key: stryMutAct_9fa48("48351") ? "" : (stryCov_9fa48("48351"), 'value'),
        label: stryMutAct_9fa48("48352") ? "" : (stryCov_9fa48("48352"), 'Value'),
        width: 20
      }), stryMutAct_9fa48("48353") ? {} : (stryCov_9fa48("48353"), {
        key: stryMutAct_9fa48("48354") ? "" : (stryCov_9fa48("48354"), 'type'),
        label: stryMutAct_9fa48("48355") ? "" : (stryCov_9fa48("48355"), 'Type'),
        width: 8
      }), stryMutAct_9fa48("48356") ? {} : (stryCov_9fa48("48356"), {
        key: stryMutAct_9fa48("48357") ? "" : (stryCov_9fa48("48357"), 'requires_restart'),
        label: stryMutAct_9fa48("48358") ? "" : (stryCov_9fa48("48358"), 'Restart'),
        width: 8
      }), stryMutAct_9fa48("48359") ? {} : (stryCov_9fa48("48359"), {
        key: stryMutAct_9fa48("48360") ? "" : (stryCov_9fa48("48360"), 'updated_at'),
        label: stryMutAct_9fa48("48361") ? "" : (stryCov_9fa48("48361"), 'Last Modified'),
        width: 20
      })]);
    }
  }

  /**
   * Format a config record into a row array
   * Requirements: 30.1
   * @param {Object} config - Config record
   * @return {Array<string>} Row values
   */
  formatRow(config) {
    if (stryMutAct_9fa48("48362")) {
      {}
    } else {
      stryCov_9fa48("48362");
      return stryMutAct_9fa48("48363") ? [] : (stryCov_9fa48("48363"), [stryMutAct_9fa48("48366") ? config.config_key && 'N/A' : stryMutAct_9fa48("48365") ? false : stryMutAct_9fa48("48364") ? true : (stryCov_9fa48("48364", "48365", "48366"), config.config_key || (stryMutAct_9fa48("48367") ? "" : (stryCov_9fa48("48367"), 'N/A'))), this.formatValue(config.config_value, config.value_type), stryMutAct_9fa48("48370") ? config.value_type && 'string' : stryMutAct_9fa48("48369") ? false : stryMutAct_9fa48("48368") ? true : (stryCov_9fa48("48368", "48369", "48370"), config.value_type || (stryMutAct_9fa48("48371") ? "" : (stryCov_9fa48("48371"), 'string'))), this.formatRequiresRestart(config), this.formatTimestamp(config.updated_at)]);
    }
  }

  /**
   * Format config value for display
   * @param {*} value - Config value
   * @param {string} type - Value type
   * @return {string} Formatted value
   */
  formatValue(value, type) {
    if (stryMutAct_9fa48("48372")) {
      {}
    } else {
      stryCov_9fa48("48372");
      if (stryMutAct_9fa48("48375") ? value === null && value === undefined : stryMutAct_9fa48("48374") ? false : stryMutAct_9fa48("48373") ? true : (stryCov_9fa48("48373", "48374", "48375"), (stryMutAct_9fa48("48377") ? value !== null : stryMutAct_9fa48("48376") ? false : (stryCov_9fa48("48376", "48377"), value === null)) || (stryMutAct_9fa48("48379") ? value !== undefined : stryMutAct_9fa48("48378") ? false : (stryCov_9fa48("48378", "48379"), value === undefined)))) {
        if (stryMutAct_9fa48("48380")) {
          {}
        } else {
          stryCov_9fa48("48380");
          return stryMutAct_9fa48("48381") ? "" : (stryCov_9fa48("48381"), 'null');
        }
      }
      if (stryMutAct_9fa48("48384") ? type === 'json' || typeof value === 'object' : stryMutAct_9fa48("48383") ? false : stryMutAct_9fa48("48382") ? true : (stryCov_9fa48("48382", "48383", "48384"), (stryMutAct_9fa48("48386") ? type !== 'json' : stryMutAct_9fa48("48385") ? true : (stryCov_9fa48("48385", "48386"), type === (stryMutAct_9fa48("48387") ? "" : (stryCov_9fa48("48387"), 'json')))) && (stryMutAct_9fa48("48389") ? typeof value !== 'object' : stryMutAct_9fa48("48388") ? true : (stryCov_9fa48("48388", "48389"), typeof value === (stryMutAct_9fa48("48390") ? "" : (stryCov_9fa48("48390"), 'object')))))) {
        if (stryMutAct_9fa48("48391")) {
          {}
        } else {
          stryCov_9fa48("48391");
          const str = JSON.stringify(value);
          return (stryMutAct_9fa48("48395") ? str.length <= 40 : stryMutAct_9fa48("48394") ? str.length >= 40 : stryMutAct_9fa48("48393") ? false : stryMutAct_9fa48("48392") ? true : (stryCov_9fa48("48392", "48393", "48394", "48395"), str.length > 40)) ? (stryMutAct_9fa48("48396") ? str : (stryCov_9fa48("48396"), str.substring(0, 37))) + (stryMutAct_9fa48("48397") ? "" : (stryCov_9fa48("48397"), '...')) : str;
        }
      }
      if (stryMutAct_9fa48("48400") ? type !== 'boolean' : stryMutAct_9fa48("48399") ? false : stryMutAct_9fa48("48398") ? true : (stryCov_9fa48("48398", "48399", "48400"), type === (stryMutAct_9fa48("48401") ? "" : (stryCov_9fa48("48401"), 'boolean')))) {
        if (stryMutAct_9fa48("48402")) {
          {}
        } else {
          stryCov_9fa48("48402");
          return value ? stryMutAct_9fa48("48403") ? "" : (stryCov_9fa48("48403"), 'true') : stryMutAct_9fa48("48404") ? "" : (stryCov_9fa48("48404"), 'false');
        }
      }
      const str = String(value);
      return (stryMutAct_9fa48("48408") ? str.length <= 40 : stryMutAct_9fa48("48407") ? str.length >= 40 : stryMutAct_9fa48("48406") ? false : stryMutAct_9fa48("48405") ? true : (stryCov_9fa48("48405", "48406", "48407", "48408"), str.length > 40)) ? (stryMutAct_9fa48("48409") ? str : (stryCov_9fa48("48409"), str.substring(0, 37))) + (stryMutAct_9fa48("48410") ? "" : (stryCov_9fa48("48410"), '...')) : str;
    }
  }

  /**
   * Format requires_restart field with warning indicator
   * Requirements: 30.6
   * @param {Object} config - Config record
   * @return {string} Formatted requires_restart value
   */
  formatRequiresRestart(config) {
    if (stryMutAct_9fa48("48411")) {
      {}
    } else {
      stryCov_9fa48("48411");
      if (stryMutAct_9fa48("48413") ? false : stryMutAct_9fa48("48412") ? true : (stryCov_9fa48("48412", "48413"), config.requires_restart)) {
        if (stryMutAct_9fa48("48414")) {
          {}
        } else {
          stryCov_9fa48("48414");
          // Add warning indicator if pending restart
          if (stryMutAct_9fa48("48416") ? false : stryMutAct_9fa48("48415") ? true : (stryCov_9fa48("48415", "48416"), config.pending_restart)) {
            if (stryMutAct_9fa48("48417")) {
              {}
            } else {
              stryCov_9fa48("48417");
              return stryMutAct_9fa48("48418") ? "" : (stryCov_9fa48("48418"), 'Yes (!)');
            }
          }
          return stryMutAct_9fa48("48419") ? "" : (stryCov_9fa48("48419"), 'Yes');
        }
      }
      return stryMutAct_9fa48("48420") ? "" : (stryCov_9fa48("48420"), 'No');
    }
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (stryMutAct_9fa48("48421")) {
      {}
    } else {
      stryCov_9fa48("48421");
      if (stryMutAct_9fa48("48424") ? timestamp === null && timestamp === undefined : stryMutAct_9fa48("48423") ? false : stryMutAct_9fa48("48422") ? true : (stryCov_9fa48("48422", "48423", "48424"), (stryMutAct_9fa48("48426") ? timestamp !== null : stryMutAct_9fa48("48425") ? false : (stryCov_9fa48("48425", "48426"), timestamp === null)) || (stryMutAct_9fa48("48428") ? timestamp !== undefined : stryMutAct_9fa48("48427") ? false : (stryCov_9fa48("48427", "48428"), timestamp === undefined)))) {
        if (stryMutAct_9fa48("48429")) {
          {}
        } else {
          stryCov_9fa48("48429");
          return stryMutAct_9fa48("48430") ? "" : (stryCov_9fa48("48430"), 'N/A');
        }
      }
      try {
        if (stryMutAct_9fa48("48431")) {
          {}
        } else {
          stryCov_9fa48("48431");
          const date = new Date(timestamp);
          if (stryMutAct_9fa48("48433") ? false : stryMutAct_9fa48("48432") ? true : (stryCov_9fa48("48432", "48433"), isNaN(date.getTime()))) {
            if (stryMutAct_9fa48("48434")) {
              {}
            } else {
              stryCov_9fa48("48434");
              return stryMutAct_9fa48("48435") ? "" : (stryCov_9fa48("48435"), 'N/A');
            }
          }
          return stryMutAct_9fa48("48436") ? date.toISOString().replace('T', ' ') : (stryCov_9fa48("48436"), date.toISOString().replace(stryMutAct_9fa48("48437") ? "" : (stryCov_9fa48("48437"), 'T'), stryMutAct_9fa48("48438") ? "" : (stryCov_9fa48("48438"), ' ')).substring(0, 19));
        }
      } catch (_err) {
        if (stryMutAct_9fa48("48439")) {
          {}
        } else {
          stryCov_9fa48("48439");
          return stryMutAct_9fa48("48440") ? "" : (stryCov_9fa48("48440"), 'N/A');
        }
      }
    }
  }

  /**
   * Get the row status for styling
   * Requirements: 30.6, 30.7
   * @param {Object} config - Config record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(config) {
    if (stryMutAct_9fa48("48441")) {
      {}
    } else {
      stryCov_9fa48("48441");
      // Highlight entries that require restart and have pending changes
      if (stryMutAct_9fa48("48444") ? config.requires_restart || config.pending_restart : stryMutAct_9fa48("48443") ? false : stryMutAct_9fa48("48442") ? true : (stryCov_9fa48("48442", "48443", "48444"), config.requires_restart && config.pending_restart)) {
        if (stryMutAct_9fa48("48445")) {
          {}
        } else {
          stryCov_9fa48("48445");
          return ROW_STATUS.WARNING;
        }
      }

      // Highlight entries that differ from default values
      // Requirements: 30.7
      if (stryMutAct_9fa48("48447") ? false : stryMutAct_9fa48("48446") ? true : (stryCov_9fa48("48446", "48447"), this.isDifferentFromDefault(config))) {
        if (stryMutAct_9fa48("48448")) {
          {}
        } else {
          stryCov_9fa48("48448");
          return ROW_STATUS.WARNING;
        }
      }
      return ROW_STATUS.NORMAL;
    }
  }

  /**
   * Check if config value differs from default
   * Requirements: 30.7
   * @param {Object} config - Config record
   * @return {boolean} True if value differs from default
   */
  isDifferentFromDefault(config) {
    if (stryMutAct_9fa48("48449")) {
      {}
    } else {
      stryCov_9fa48("48449");
      // If no default_value is defined, consider it as matching
      if (stryMutAct_9fa48("48452") ? false : stryMutAct_9fa48("48451") ? true : stryMutAct_9fa48("48450") ? Object.prototype.hasOwnProperty.call(config, 'default_value') : (stryCov_9fa48("48450", "48451", "48452"), !Object.prototype.hasOwnProperty.call(config, stryMutAct_9fa48("48453") ? "" : (stryCov_9fa48("48453"), 'default_value')))) {
        if (stryMutAct_9fa48("48454")) {
          {}
        } else {
          stryCov_9fa48("48454");
          return stryMutAct_9fa48("48455") ? true : (stryCov_9fa48("48455"), false);
        }
      }
      const currentValue = config.config_value;
      const defaultValue = config.default_value;

      // Handle null/undefined cases
      if (stryMutAct_9fa48("48458") ? currentValue === null && currentValue === undefined : stryMutAct_9fa48("48457") ? false : stryMutAct_9fa48("48456") ? true : (stryCov_9fa48("48456", "48457", "48458"), (stryMutAct_9fa48("48460") ? currentValue !== null : stryMutAct_9fa48("48459") ? false : (stryCov_9fa48("48459", "48460"), currentValue === null)) || (stryMutAct_9fa48("48462") ? currentValue !== undefined : stryMutAct_9fa48("48461") ? false : (stryCov_9fa48("48461", "48462"), currentValue === undefined)))) {
        if (stryMutAct_9fa48("48463")) {
          {}
        } else {
          stryCov_9fa48("48463");
          return stryMutAct_9fa48("48466") ? defaultValue !== null || defaultValue !== undefined : stryMutAct_9fa48("48465") ? false : stryMutAct_9fa48("48464") ? true : (stryCov_9fa48("48464", "48465", "48466"), (stryMutAct_9fa48("48468") ? defaultValue === null : stryMutAct_9fa48("48467") ? true : (stryCov_9fa48("48467", "48468"), defaultValue !== null)) && (stryMutAct_9fa48("48470") ? defaultValue === undefined : stryMutAct_9fa48("48469") ? true : (stryCov_9fa48("48469", "48470"), defaultValue !== undefined)));
        }
      }
      if (stryMutAct_9fa48("48473") ? defaultValue === null && defaultValue === undefined : stryMutAct_9fa48("48472") ? false : stryMutAct_9fa48("48471") ? true : (stryCov_9fa48("48471", "48472", "48473"), (stryMutAct_9fa48("48475") ? defaultValue !== null : stryMutAct_9fa48("48474") ? false : (stryCov_9fa48("48474", "48475"), defaultValue === null)) || (stryMutAct_9fa48("48477") ? defaultValue !== undefined : stryMutAct_9fa48("48476") ? false : (stryCov_9fa48("48476", "48477"), defaultValue === undefined)))) {
        if (stryMutAct_9fa48("48478")) {
          {}
        } else {
          stryCov_9fa48("48478");
          return stryMutAct_9fa48("48479") ? false : (stryCov_9fa48("48479"), true);
        }
      }

      // For objects/arrays, compare JSON strings
      if (stryMutAct_9fa48("48482") ? typeof currentValue === 'object' && typeof defaultValue === 'object' : stryMutAct_9fa48("48481") ? false : stryMutAct_9fa48("48480") ? true : (stryCov_9fa48("48480", "48481", "48482"), (stryMutAct_9fa48("48484") ? typeof currentValue !== 'object' : stryMutAct_9fa48("48483") ? false : (stryCov_9fa48("48483", "48484"), typeof currentValue === (stryMutAct_9fa48("48485") ? "" : (stryCov_9fa48("48485"), 'object')))) || (stryMutAct_9fa48("48487") ? typeof defaultValue !== 'object' : stryMutAct_9fa48("48486") ? false : (stryCov_9fa48("48486", "48487"), typeof defaultValue === (stryMutAct_9fa48("48488") ? "" : (stryCov_9fa48("48488"), 'object')))))) {
        if (stryMutAct_9fa48("48489")) {
          {}
        } else {
          stryCov_9fa48("48489");
          return stryMutAct_9fa48("48492") ? JSON.stringify(currentValue) === JSON.stringify(defaultValue) : stryMutAct_9fa48("48491") ? false : stryMutAct_9fa48("48490") ? true : (stryCov_9fa48("48490", "48491", "48492"), JSON.stringify(currentValue) !== JSON.stringify(defaultValue));
        }
      }

      // Direct comparison for primitives
      return stryMutAct_9fa48("48495") ? currentValue === defaultValue : stryMutAct_9fa48("48494") ? false : stryMutAct_9fa48("48493") ? true : (stryCov_9fa48("48493", "48494", "48495"), currentValue !== defaultValue);
    }
  }

  /**
   * Get the unique key for a config entry
   * @param {Object} config - Config record
   * @return {string} Unique key
   */
  getItemKey(config) {
    if (stryMutAct_9fa48("48496")) {
      {}
    } else {
      stryCov_9fa48("48496");
      return stryMutAct_9fa48("48499") ? config.config_key && '' : stryMutAct_9fa48("48498") ? false : stryMutAct_9fa48("48497") ? true : (stryCov_9fa48("48497", "48498", "48499"), config.config_key || (stryMutAct_9fa48("48500") ? "Stryker was here!" : (stryCov_9fa48("48500"), '')));
    }
  }

  /**
   * Set key pattern filter
   * Requirements: 30.2
   * @param {string|null} pattern - Key pattern to filter by
   */
  setKeyPatternFilter(pattern) {
    if (stryMutAct_9fa48("48501")) {
      {}
    } else {
      stryCov_9fa48("48501");
      this.keyPatternFilter = pattern;
      this.updateFilteredData();
    }
  }

  /**
   * Clear key pattern filter
   */
  clearKeyPatternFilter() {
    if (stryMutAct_9fa48("48502")) {
      {}
    } else {
      stryCov_9fa48("48502");
      this.keyPatternFilter = null;
      this.updateFilteredData();
    }
  }

  /**
   * Apply all filters to data
   * Requirements: 30.2
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (stryMutAct_9fa48("48503")) {
      {}
    } else {
      stryCov_9fa48("48503");
      let result = data;

      // Apply key pattern filter
      if (stryMutAct_9fa48("48505") ? false : stryMutAct_9fa48("48504") ? true : (stryCov_9fa48("48504", "48505"), this.keyPatternFilter)) {
        if (stryMutAct_9fa48("48506")) {
          {}
        } else {
          stryCov_9fa48("48506");
          try {
            if (stryMutAct_9fa48("48507")) {
              {}
            } else {
              stryCov_9fa48("48507");
              const pattern = new RegExp(this.escapeRegex(this.keyPatternFilter), stryMutAct_9fa48("48508") ? "" : (stryCov_9fa48("48508"), 'i'));
              result = stryMutAct_9fa48("48509") ? result : (stryCov_9fa48("48509"), result.filter(stryMutAct_9fa48("48510") ? () => undefined : (stryCov_9fa48("48510"), config => pattern.test(stryMutAct_9fa48("48513") ? config.config_key && '' : stryMutAct_9fa48("48512") ? false : stryMutAct_9fa48("48511") ? true : (stryCov_9fa48("48511", "48512", "48513"), config.config_key || (stryMutAct_9fa48("48514") ? "Stryker was here!" : (stryCov_9fa48("48514"), '')))))));
            }
          } catch (_err) {
            if (stryMutAct_9fa48("48515")) {
              {}
            } else {
              stryCov_9fa48("48515");
              // If regex is invalid, fall back to simple includes
              const lowerPattern = stryMutAct_9fa48("48516") ? this.keyPatternFilter.toUpperCase() : (stryCov_9fa48("48516"), this.keyPatternFilter.toLowerCase());
              result = stryMutAct_9fa48("48517") ? result : (stryCov_9fa48("48517"), result.filter(stryMutAct_9fa48("48518") ? () => undefined : (stryCov_9fa48("48518"), config => stryMutAct_9fa48("48519") ? (config.config_key || '').toUpperCase().includes(lowerPattern) : (stryCov_9fa48("48519"), (stryMutAct_9fa48("48522") ? config.config_key && '' : stryMutAct_9fa48("48521") ? false : stryMutAct_9fa48("48520") ? true : (stryCov_9fa48("48520", "48521", "48522"), config.config_key || (stryMutAct_9fa48("48523") ? "Stryker was here!" : (stryCov_9fa48("48523"), '')))).toLowerCase().includes(lowerPattern)))));
            }
          }
        }
      }

      // Apply general text filter (from base class)
      if (stryMutAct_9fa48("48526") ? this.filter || this.filter.trim() !== '' : stryMutAct_9fa48("48525") ? false : stryMutAct_9fa48("48524") ? true : (stryCov_9fa48("48524", "48525", "48526"), this.filter && (stryMutAct_9fa48("48528") ? this.filter.trim() === '' : stryMutAct_9fa48("48527") ? true : (stryCov_9fa48("48527", "48528"), (stryMutAct_9fa48("48529") ? this.filter : (stryCov_9fa48("48529"), this.filter.trim())) !== (stryMutAct_9fa48("48530") ? "Stryker was here!" : (stryCov_9fa48("48530"), '')))))) {
        if (stryMutAct_9fa48("48531")) {
          {}
        } else {
          stryCov_9fa48("48531");
          const lowerFilter = stryMutAct_9fa48("48532") ? this.filter.toUpperCase() : (stryCov_9fa48("48532"), this.filter.toLowerCase());
          result = stryMutAct_9fa48("48533") ? result : (stryCov_9fa48("48533"), result.filter(item => {
            if (stryMutAct_9fa48("48534")) {
              {}
            } else {
              stryCov_9fa48("48534");
              const values = Object.values(item);
              return stryMutAct_9fa48("48535") ? values.every(value => {
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(lowerFilter);
              }) : (stryCov_9fa48("48535"), values.some(value => {
                if (stryMutAct_9fa48("48536")) {
                  {}
                } else {
                  stryCov_9fa48("48536");
                  if (stryMutAct_9fa48("48539") ? value === null && value === undefined : stryMutAct_9fa48("48538") ? false : stryMutAct_9fa48("48537") ? true : (stryCov_9fa48("48537", "48538", "48539"), (stryMutAct_9fa48("48541") ? value !== null : stryMutAct_9fa48("48540") ? false : (stryCov_9fa48("48540", "48541"), value === null)) || (stryMutAct_9fa48("48543") ? value !== undefined : stryMutAct_9fa48("48542") ? false : (stryCov_9fa48("48542", "48543"), value === undefined)))) return stryMutAct_9fa48("48544") ? true : (stryCov_9fa48("48544"), false);
                  return stryMutAct_9fa48("48545") ? String(value).toUpperCase().includes(lowerFilter) : (stryCov_9fa48("48545"), String(value).toLowerCase().includes(lowerFilter));
                }
              }));
            }
          }));
        }
      }
      return result;
    }
  }

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @return {string} Escaped string
   */
  escapeRegex(str) {
    if (stryMutAct_9fa48("48546")) {
      {}
    } else {
      stryCov_9fa48("48546");
      return str.replace(stryMutAct_9fa48("48547") ? /[^.*+?^${}()|[\]\\]/g : (stryCov_9fa48("48547"), /[.*+?^${}()|[\]\\]/g), stryMutAct_9fa48("48548") ? "" : (stryCov_9fa48("48548"), '\\$&'));
    }
  }

  /**
   * Handle drill-down action (Enter key on selected config)
   * Requirements: 30.3
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    if (stryMutAct_9fa48("48549")) {
      {}
    } else {
      stryCov_9fa48("48549");
      const selectedConfig = this.getSelectedItem();
      if (stryMutAct_9fa48("48552") ? false : stryMutAct_9fa48("48551") ? true : stryMutAct_9fa48("48550") ? selectedConfig : (stryCov_9fa48("48550", "48551", "48552"), !selectedConfig)) {
        if (stryMutAct_9fa48("48553")) {
          {}
        } else {
          stryCov_9fa48("48553");
          return null;
        }
      }
      return stryMutAct_9fa48("48554") ? {} : (stryCov_9fa48("48554"), {
        action: stryMutAct_9fa48("48555") ? "" : (stryCov_9fa48("48555"), 'showDetail'),
        view: stryMutAct_9fa48("48556") ? "" : (stryCov_9fa48("48556"), 'config'),
        context: stryMutAct_9fa48("48557") ? {} : (stryCov_9fa48("48557"), {
          configKey: selectedConfig.config_key
        }),
        detail: this.getSelectedDetails()
      });
    }
  }

  /**
   * Handle key input for the config view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (stryMutAct_9fa48("48558")) {
      {}
    } else {
      stryCov_9fa48("48558");
      if (stryMutAct_9fa48("48561") ? key.name === 'enter' && key.name === 'return' : stryMutAct_9fa48("48560") ? false : stryMutAct_9fa48("48559") ? true : (stryCov_9fa48("48559", "48560", "48561"), (stryMutAct_9fa48("48563") ? key.name !== 'enter' : stryMutAct_9fa48("48562") ? false : (stryCov_9fa48("48562", "48563"), key.name === (stryMutAct_9fa48("48564") ? "" : (stryCov_9fa48("48564"), 'enter')))) || (stryMutAct_9fa48("48566") ? key.name !== 'return' : stryMutAct_9fa48("48565") ? false : (stryCov_9fa48("48565", "48566"), key.name === (stryMutAct_9fa48("48567") ? "" : (stryCov_9fa48("48567"), 'return')))))) {
        if (stryMutAct_9fa48("48568")) {
          {}
        } else {
          stryCov_9fa48("48568");
          return this.handleDrillDown();
        }
      }

      // 'e' key to edit selected config
      if (stryMutAct_9fa48("48571") ? key.ch !== 'e' : stryMutAct_9fa48("48570") ? false : stryMutAct_9fa48("48569") ? true : (stryCov_9fa48("48569", "48570", "48571"), key.ch === (stryMutAct_9fa48("48572") ? "" : (stryCov_9fa48("48572"), 'e')))) {
        if (stryMutAct_9fa48("48573")) {
          {}
        } else {
          stryCov_9fa48("48573");
          return this.handleEditRequest();
        }
      }

      // 'r' key to revert to default (when in config view context)
      if (stryMutAct_9fa48("48576") ? key.ch !== 'R' : stryMutAct_9fa48("48575") ? false : stryMutAct_9fa48("48574") ? true : (stryCov_9fa48("48574", "48575", "48576"), key.ch === (stryMutAct_9fa48("48577") ? "" : (stryCov_9fa48("48577"), 'R')))) {
        if (stryMutAct_9fa48("48578")) {
          {}
        } else {
          stryCov_9fa48("48578");
          return this.handleRevertRequest();
        }
      }
      return super.handleKey(key);
    }
  }

  /**
   * Handle edit request for selected config
   * @return {Object|null} Edit action or null
   */
  handleEditRequest() {
    if (stryMutAct_9fa48("48579")) {
      {}
    } else {
      stryCov_9fa48("48579");
      const selectedConfig = this.getSelectedItem();
      if (stryMutAct_9fa48("48582") ? false : stryMutAct_9fa48("48581") ? true : stryMutAct_9fa48("48580") ? selectedConfig : (stryCov_9fa48("48580", "48581", "48582"), !selectedConfig)) {
        if (stryMutAct_9fa48("48583")) {
          {}
        } else {
          stryCov_9fa48("48583");
          return null;
        }
      }
      const editability = this.canEdit(selectedConfig.config_key);
      if (stryMutAct_9fa48("48586") ? false : stryMutAct_9fa48("48585") ? true : stryMutAct_9fa48("48584") ? editability.editable : (stryCov_9fa48("48584", "48585", "48586"), !editability.editable)) {
        if (stryMutAct_9fa48("48587")) {
          {}
        } else {
          stryCov_9fa48("48587");
          return stryMutAct_9fa48("48588") ? {} : (stryCov_9fa48("48588"), {
            action: stryMutAct_9fa48("48589") ? "" : (stryCov_9fa48("48589"), 'showError'),
            message: editability.reason
          });
        }
      }
      return stryMutAct_9fa48("48590") ? {} : (stryCov_9fa48("48590"), {
        action: stryMutAct_9fa48("48591") ? "" : (stryCov_9fa48("48591"), 'editConfig'),
        config: selectedConfig,
        currentValue: this.formatFullValue(selectedConfig.config_value, selectedConfig.value_type)
      });
    }
  }

  /**
   * Handle revert request for selected config
   * @return {Object|null} Revert action or null
   */
  handleRevertRequest() {
    if (stryMutAct_9fa48("48592")) {
      {}
    } else {
      stryCov_9fa48("48592");
      const selectedConfig = this.getSelectedItem();
      if (stryMutAct_9fa48("48595") ? false : stryMutAct_9fa48("48594") ? true : stryMutAct_9fa48("48593") ? selectedConfig : (stryCov_9fa48("48593", "48594", "48595"), !selectedConfig)) {
        if (stryMutAct_9fa48("48596")) {
          {}
        } else {
          stryCov_9fa48("48596");
          return null;
        }
      }
      const revertability = this.canRevert(selectedConfig.config_key);
      if (stryMutAct_9fa48("48599") ? false : stryMutAct_9fa48("48598") ? true : stryMutAct_9fa48("48597") ? revertability.revertable : (stryCov_9fa48("48597", "48598", "48599"), !revertability.revertable)) {
        if (stryMutAct_9fa48("48600")) {
          {}
        } else {
          stryCov_9fa48("48600");
          return stryMutAct_9fa48("48601") ? {} : (stryCov_9fa48("48601"), {
            action: stryMutAct_9fa48("48602") ? "" : (stryCov_9fa48("48602"), 'showError'),
            message: revertability.reason
          });
        }
      }
      const revertOp = this.prepareRevert(selectedConfig.config_key);
      return stryMutAct_9fa48("48603") ? {} : (stryCov_9fa48("48603"), {
        action: stryMutAct_9fa48("48604") ? "" : (stryCov_9fa48("48604"), 'revertConfig'),
        config: selectedConfig,
        revertOperation: revertOp,
        confirmation: this.getRevertConfirmation(revertOp)
      });
    }
  }

  /**
   * Get help text for the config view
   * @return {string} Help text for status bar
   */
  getHelpText() {
    if (stryMutAct_9fa48("48605")) {
      {}
    } else {
      stryCov_9fa48("48605");
      return stryMutAct_9fa48("48606") ? "" : (stryCov_9fa48("48606"), 'e:Edit  R:Revert  Enter:Details  d:Detail Panel  /:Filter');
    }
  }

  /**
   * Get detail information for the selected config entry
   * Requirements: 30.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    if (stryMutAct_9fa48("48607")) {
      {}
    } else {
      stryCov_9fa48("48607");
      const config = this.getSelectedItem();
      if (stryMutAct_9fa48("48610") ? false : stryMutAct_9fa48("48609") ? true : stryMutAct_9fa48("48608") ? config : (stryCov_9fa48("48608", "48609", "48610"), !config)) {
        if (stryMutAct_9fa48("48611")) {
          {}
        } else {
          stryCov_9fa48("48611");
          return null;
        }
      }
      const sections = stryMutAct_9fa48("48612") ? [] : (stryCov_9fa48("48612"), [stryMutAct_9fa48("48613") ? {} : (stryCov_9fa48("48613"), {
        title: stryMutAct_9fa48("48614") ? "" : (stryCov_9fa48("48614"), 'Configuration Entry'),
        fields: stryMutAct_9fa48("48615") ? [] : (stryCov_9fa48("48615"), [stryMutAct_9fa48("48616") ? {} : (stryCov_9fa48("48616"), {
          label: stryMutAct_9fa48("48617") ? "" : (stryCov_9fa48("48617"), 'Key'),
          value: stryMutAct_9fa48("48620") ? config.config_key && 'N/A' : stryMutAct_9fa48("48619") ? false : stryMutAct_9fa48("48618") ? true : (stryCov_9fa48("48618", "48619", "48620"), config.config_key || (stryMutAct_9fa48("48621") ? "" : (stryCov_9fa48("48621"), 'N/A')))
        }), stryMutAct_9fa48("48622") ? {} : (stryCov_9fa48("48622"), {
          label: stryMutAct_9fa48("48623") ? "" : (stryCov_9fa48("48623"), 'Value'),
          value: this.formatFullValue(config.config_value, config.value_type)
        }), stryMutAct_9fa48("48624") ? {} : (stryCov_9fa48("48624"), {
          label: stryMutAct_9fa48("48625") ? "" : (stryCov_9fa48("48625"), 'Type'),
          value: stryMutAct_9fa48("48628") ? config.value_type && 'string' : stryMutAct_9fa48("48627") ? false : stryMutAct_9fa48("48626") ? true : (stryCov_9fa48("48626", "48627", "48628"), config.value_type || (stryMutAct_9fa48("48629") ? "" : (stryCov_9fa48("48629"), 'string')))
        }), stryMutAct_9fa48("48630") ? {} : (stryCov_9fa48("48630"), {
          label: stryMutAct_9fa48("48631") ? "" : (stryCov_9fa48("48631"), 'Default Value'),
          value: this.formatFullValue(config.default_value, config.value_type)
        }), stryMutAct_9fa48("48632") ? {} : (stryCov_9fa48("48632"), {
          label: stryMutAct_9fa48("48633") ? "" : (stryCov_9fa48("48633"), 'Requires Restart'),
          value: config.requires_restart ? stryMutAct_9fa48("48634") ? "" : (stryCov_9fa48("48634"), 'Yes') : stryMutAct_9fa48("48635") ? "" : (stryCov_9fa48("48635"), 'No')
        }), stryMutAct_9fa48("48636") ? {} : (stryCov_9fa48("48636"), {
          label: stryMutAct_9fa48("48637") ? "" : (stryCov_9fa48("48637"), 'Last Modified'),
          value: this.formatTimestamp(config.updated_at)
        })])
      })]);

      // Add description if available
      if (stryMutAct_9fa48("48639") ? false : stryMutAct_9fa48("48638") ? true : (stryCov_9fa48("48638", "48639"), config.description)) {
        if (stryMutAct_9fa48("48640")) {
          {}
        } else {
          stryCov_9fa48("48640");
          sections.push(stryMutAct_9fa48("48641") ? {} : (stryCov_9fa48("48641"), {
            title: stryMutAct_9fa48("48642") ? "" : (stryCov_9fa48("48642"), 'Description'),
            fields: stryMutAct_9fa48("48643") ? [] : (stryCov_9fa48("48643"), [stryMutAct_9fa48("48644") ? {} : (stryCov_9fa48("48644"), {
              label: stryMutAct_9fa48("48645") ? "" : (stryCov_9fa48("48645"), 'Info'),
              value: config.description
            })])
          }));
        }
      }

      // Add warning if value differs from default
      if (stryMutAct_9fa48("48647") ? false : stryMutAct_9fa48("48646") ? true : (stryCov_9fa48("48646", "48647"), this.isDifferentFromDefault(config))) {
        if (stryMutAct_9fa48("48648")) {
          {}
        } else {
          stryCov_9fa48("48648");
          sections.push(stryMutAct_9fa48("48649") ? {} : (stryCov_9fa48("48649"), {
            title: stryMutAct_9fa48("48650") ? "" : (stryCov_9fa48("48650"), 'Status'),
            fields: stryMutAct_9fa48("48651") ? [] : (stryCov_9fa48("48651"), [stryMutAct_9fa48("48652") ? {} : (stryCov_9fa48("48652"), {
              label: stryMutAct_9fa48("48653") ? "" : (stryCov_9fa48("48653"), 'Warning'),
              value: stryMutAct_9fa48("48654") ? "" : (stryCov_9fa48("48654"), 'Value differs from default')
            })])
          }));
        }
      }

      // Add restart warning if applicable
      if (stryMutAct_9fa48("48657") ? config.requires_restart || config.pending_restart : stryMutAct_9fa48("48656") ? false : stryMutAct_9fa48("48655") ? true : (stryCov_9fa48("48655", "48656", "48657"), config.requires_restart && config.pending_restart)) {
        if (stryMutAct_9fa48("48658")) {
          {}
        } else {
          stryCov_9fa48("48658");
          sections.push(stryMutAct_9fa48("48659") ? {} : (stryCov_9fa48("48659"), {
            title: stryMutAct_9fa48("48660") ? "" : (stryCov_9fa48("48660"), 'Restart Required'),
            fields: stryMutAct_9fa48("48661") ? [] : (stryCov_9fa48("48661"), [stryMutAct_9fa48("48662") ? {} : (stryCov_9fa48("48662"), {
              label: stryMutAct_9fa48("48663") ? "" : (stryCov_9fa48("48663"), 'Warning'),
              value: stryMutAct_9fa48("48664") ? "" : (stryCov_9fa48("48664"), 'Node restart required for changes to take effect')
            })])
          }));
        }
      }
      return stryMutAct_9fa48("48665") ? {} : (stryCov_9fa48("48665"), {
        title: stryMutAct_9fa48("48666") ? `` : (stryCov_9fa48("48666"), `Config: ${stryMutAct_9fa48("48669") ? config.config_key && 'Unknown' : stryMutAct_9fa48("48668") ? false : stryMutAct_9fa48("48667") ? true : (stryCov_9fa48("48667", "48668", "48669"), config.config_key || (stryMutAct_9fa48("48670") ? "" : (stryCov_9fa48("48670"), 'Unknown')))}`),
        sections
      });
    }
  }

  /**
   * Format full value for detail view (no truncation)
   * @param {*} value - Config value
   * @param {string} type - Value type
   * @return {string} Formatted value
   */
  formatFullValue(value, type) {
    if (stryMutAct_9fa48("48671")) {
      {}
    } else {
      stryCov_9fa48("48671");
      if (stryMutAct_9fa48("48674") ? value === null && value === undefined : stryMutAct_9fa48("48673") ? false : stryMutAct_9fa48("48672") ? true : (stryCov_9fa48("48672", "48673", "48674"), (stryMutAct_9fa48("48676") ? value !== null : stryMutAct_9fa48("48675") ? false : (stryCov_9fa48("48675", "48676"), value === null)) || (stryMutAct_9fa48("48678") ? value !== undefined : stryMutAct_9fa48("48677") ? false : (stryCov_9fa48("48677", "48678"), value === undefined)))) {
        if (stryMutAct_9fa48("48679")) {
          {}
        } else {
          stryCov_9fa48("48679");
          return stryMutAct_9fa48("48680") ? "" : (stryCov_9fa48("48680"), 'null');
        }
      }
      if (stryMutAct_9fa48("48683") ? type === 'json' || typeof value === 'object' : stryMutAct_9fa48("48682") ? false : stryMutAct_9fa48("48681") ? true : (stryCov_9fa48("48681", "48682", "48683"), (stryMutAct_9fa48("48685") ? type !== 'json' : stryMutAct_9fa48("48684") ? true : (stryCov_9fa48("48684", "48685"), type === (stryMutAct_9fa48("48686") ? "" : (stryCov_9fa48("48686"), 'json')))) && (stryMutAct_9fa48("48688") ? typeof value !== 'object' : stryMutAct_9fa48("48687") ? true : (stryCov_9fa48("48687", "48688"), typeof value === (stryMutAct_9fa48("48689") ? "" : (stryCov_9fa48("48689"), 'object')))))) {
        if (stryMutAct_9fa48("48690")) {
          {}
        } else {
          stryCov_9fa48("48690");
          return JSON.stringify(value, null, 2);
        }
      }
      if (stryMutAct_9fa48("48693") ? type !== 'boolean' : stryMutAct_9fa48("48692") ? false : stryMutAct_9fa48("48691") ? true : (stryCov_9fa48("48691", "48692", "48693"), type === (stryMutAct_9fa48("48694") ? "" : (stryCov_9fa48("48694"), 'boolean')))) {
        if (stryMutAct_9fa48("48695")) {
          {}
        } else {
          stryCov_9fa48("48695");
          return value ? stryMutAct_9fa48("48696") ? "" : (stryCov_9fa48("48696"), 'true') : stryMutAct_9fa48("48697") ? "" : (stryCov_9fa48("48697"), 'false');
        }
      }
      return String(value);
    }
  }

  /**
   * Get status bar information
   * @return {Object} Status bar data
   */
  getStatusBarInfo() {
    if (stryMutAct_9fa48("48698")) {
      {}
    } else {
      stryCov_9fa48("48698");
      const activeFilters = stryMutAct_9fa48("48699") ? ["Stryker was here"] : (stryCov_9fa48("48699"), []);
      if (stryMutAct_9fa48("48701") ? false : stryMutAct_9fa48("48700") ? true : (stryCov_9fa48("48700", "48701"), this.keyPatternFilter)) {
        if (stryMutAct_9fa48("48702")) {
          {}
        } else {
          stryCov_9fa48("48702");
          activeFilters.push(stryMutAct_9fa48("48703") ? `` : (stryCov_9fa48("48703"), `Key: "${this.keyPatternFilter}"`));
        }
      }

      // Count entries that differ from default
      const nonDefaultCount = stryMutAct_9fa48("48704") ? this.filteredData.length : (stryCov_9fa48("48704"), this.filteredData.filter(stryMutAct_9fa48("48705") ? () => undefined : (stryCov_9fa48("48705"), config => this.isDifferentFromDefault(config))).length);

      // Count entries requiring restart
      const restartRequiredCount = stryMutAct_9fa48("48706") ? this.filteredData.length : (stryCov_9fa48("48706"), this.filteredData.filter(stryMutAct_9fa48("48707") ? () => undefined : (stryCov_9fa48("48707"), config => stryMutAct_9fa48("48710") ? config.requires_restart || config.pending_restart : stryMutAct_9fa48("48709") ? false : stryMutAct_9fa48("48708") ? true : (stryCov_9fa48("48708", "48709", "48710"), config.requires_restart && config.pending_restart))).length);
      return stryMutAct_9fa48("48711") ? {} : (stryCov_9fa48("48711"), {
        configCount: this.filteredData.length,
        totalCount: this.data.length,
        nonDefaultCount,
        restartRequiredCount,
        activeFilters
      });
    }
  }

  /**
   * Render the view with config-specific styling
   * @param {Object} state - Navigation state
   * @return {Object} Render data with headers and rows
   */
  render(state = {}) {
    if (stryMutAct_9fa48("48712")) {
      {}
    } else {
      stryCov_9fa48("48712");
      const baseRender = super.render(state);

      // Add status bar info
      baseRender.statusBar = this.getStatusBarInfo();
      return baseRender;
    }
  }

  /**
   * Validate a value against the expected type
   * Requirements: 30.5
   * @param {string} inputValue - The input value as a string
   * @param {string} type - The expected type
   * @return {ValidationResult} Validation result
   */
  validateValue(inputValue, type) {
    if (stryMutAct_9fa48("48713")) {
      {}
    } else {
      stryCov_9fa48("48713");
      if (stryMutAct_9fa48("48716") ? inputValue === null && inputValue === undefined : stryMutAct_9fa48("48715") ? false : stryMutAct_9fa48("48714") ? true : (stryCov_9fa48("48714", "48715", "48716"), (stryMutAct_9fa48("48718") ? inputValue !== null : stryMutAct_9fa48("48717") ? false : (stryCov_9fa48("48717", "48718"), inputValue === null)) || (stryMutAct_9fa48("48720") ? inputValue !== undefined : stryMutAct_9fa48("48719") ? false : (stryCov_9fa48("48719", "48720"), inputValue === undefined)))) {
        if (stryMutAct_9fa48("48721")) {
          {}
        } else {
          stryCov_9fa48("48721");
          return stryMutAct_9fa48("48722") ? {} : (stryCov_9fa48("48722"), {
            valid: stryMutAct_9fa48("48723") ? false : (stryCov_9fa48("48723"), true),
            parsedValue: null
          });
        }
      }
      const trimmedInput = stryMutAct_9fa48("48724") ? String(inputValue) : (stryCov_9fa48("48724"), String(inputValue).trim());
      switch (type) {
        case stryMutAct_9fa48("48726") ? "" : (stryCov_9fa48("48726"), 'string'):
          if (stryMutAct_9fa48("48725")) {} else {
            stryCov_9fa48("48725");
            return stryMutAct_9fa48("48727") ? {} : (stryCov_9fa48("48727"), {
              valid: stryMutAct_9fa48("48728") ? false : (stryCov_9fa48("48728"), true),
              parsedValue: trimmedInput
            });
          }
        case stryMutAct_9fa48("48730") ? "" : (stryCov_9fa48("48730"), 'number'):
          if (stryMutAct_9fa48("48729")) {} else {
            stryCov_9fa48("48729");
            {
              if (stryMutAct_9fa48("48731")) {
                {}
              } else {
                stryCov_9fa48("48731");
                if (stryMutAct_9fa48("48734") ? trimmedInput !== '' : stryMutAct_9fa48("48733") ? false : stryMutAct_9fa48("48732") ? true : (stryCov_9fa48("48732", "48733", "48734"), trimmedInput === (stryMutAct_9fa48("48735") ? "Stryker was here!" : (stryCov_9fa48("48735"), '')))) {
                  if (stryMutAct_9fa48("48736")) {
                    {}
                  } else {
                    stryCov_9fa48("48736");
                    return stryMutAct_9fa48("48737") ? {} : (stryCov_9fa48("48737"), {
                      valid: stryMutAct_9fa48("48738") ? true : (stryCov_9fa48("48738"), false),
                      error: stryMutAct_9fa48("48739") ? "" : (stryCov_9fa48("48739"), 'Number value cannot be empty')
                    });
                  }
                }
                const num = Number(trimmedInput);
                if (stryMutAct_9fa48("48741") ? false : stryMutAct_9fa48("48740") ? true : (stryCov_9fa48("48740", "48741"), isNaN(num))) {
                  if (stryMutAct_9fa48("48742")) {
                    {}
                  } else {
                    stryCov_9fa48("48742");
                    return stryMutAct_9fa48("48743") ? {} : (stryCov_9fa48("48743"), {
                      valid: stryMutAct_9fa48("48744") ? true : (stryCov_9fa48("48744"), false),
                      error: stryMutAct_9fa48("48745") ? `` : (stryCov_9fa48("48745"), `Invalid number: "${trimmedInput}"`)
                    });
                  }
                }
                return stryMutAct_9fa48("48746") ? {} : (stryCov_9fa48("48746"), {
                  valid: stryMutAct_9fa48("48747") ? false : (stryCov_9fa48("48747"), true),
                  parsedValue: num
                });
              }
            }
          }
        case stryMutAct_9fa48("48749") ? "" : (stryCov_9fa48("48749"), 'boolean'):
          if (stryMutAct_9fa48("48748")) {} else {
            stryCov_9fa48("48748");
            {
              if (stryMutAct_9fa48("48750")) {
                {}
              } else {
                stryCov_9fa48("48750");
                const lower = stryMutAct_9fa48("48751") ? trimmedInput.toUpperCase() : (stryCov_9fa48("48751"), trimmedInput.toLowerCase());
                if (stryMutAct_9fa48("48754") ? (lower === 'true' || lower === '1') && lower === 'yes' : stryMutAct_9fa48("48753") ? false : stryMutAct_9fa48("48752") ? true : (stryCov_9fa48("48752", "48753", "48754"), (stryMutAct_9fa48("48756") ? lower === 'true' && lower === '1' : stryMutAct_9fa48("48755") ? false : (stryCov_9fa48("48755", "48756"), (stryMutAct_9fa48("48758") ? lower !== 'true' : stryMutAct_9fa48("48757") ? false : (stryCov_9fa48("48757", "48758"), lower === (stryMutAct_9fa48("48759") ? "" : (stryCov_9fa48("48759"), 'true')))) || (stryMutAct_9fa48("48761") ? lower !== '1' : stryMutAct_9fa48("48760") ? false : (stryCov_9fa48("48760", "48761"), lower === (stryMutAct_9fa48("48762") ? "" : (stryCov_9fa48("48762"), '1')))))) || (stryMutAct_9fa48("48764") ? lower !== 'yes' : stryMutAct_9fa48("48763") ? false : (stryCov_9fa48("48763", "48764"), lower === (stryMutAct_9fa48("48765") ? "" : (stryCov_9fa48("48765"), 'yes')))))) {
                  if (stryMutAct_9fa48("48766")) {
                    {}
                  } else {
                    stryCov_9fa48("48766");
                    return stryMutAct_9fa48("48767") ? {} : (stryCov_9fa48("48767"), {
                      valid: stryMutAct_9fa48("48768") ? false : (stryCov_9fa48("48768"), true),
                      parsedValue: stryMutAct_9fa48("48769") ? false : (stryCov_9fa48("48769"), true)
                    });
                  }
                }
                if (stryMutAct_9fa48("48772") ? (lower === 'false' || lower === '0') && lower === 'no' : stryMutAct_9fa48("48771") ? false : stryMutAct_9fa48("48770") ? true : (stryCov_9fa48("48770", "48771", "48772"), (stryMutAct_9fa48("48774") ? lower === 'false' && lower === '0' : stryMutAct_9fa48("48773") ? false : (stryCov_9fa48("48773", "48774"), (stryMutAct_9fa48("48776") ? lower !== 'false' : stryMutAct_9fa48("48775") ? false : (stryCov_9fa48("48775", "48776"), lower === (stryMutAct_9fa48("48777") ? "" : (stryCov_9fa48("48777"), 'false')))) || (stryMutAct_9fa48("48779") ? lower !== '0' : stryMutAct_9fa48("48778") ? false : (stryCov_9fa48("48778", "48779"), lower === (stryMutAct_9fa48("48780") ? "" : (stryCov_9fa48("48780"), '0')))))) || (stryMutAct_9fa48("48782") ? lower !== 'no' : stryMutAct_9fa48("48781") ? false : (stryCov_9fa48("48781", "48782"), lower === (stryMutAct_9fa48("48783") ? "" : (stryCov_9fa48("48783"), 'no')))))) {
                  if (stryMutAct_9fa48("48784")) {
                    {}
                  } else {
                    stryCov_9fa48("48784");
                    return stryMutAct_9fa48("48785") ? {} : (stryCov_9fa48("48785"), {
                      valid: stryMutAct_9fa48("48786") ? false : (stryCov_9fa48("48786"), true),
                      parsedValue: stryMutAct_9fa48("48787") ? true : (stryCov_9fa48("48787"), false)
                    });
                  }
                }
                return stryMutAct_9fa48("48788") ? {} : (stryCov_9fa48("48788"), {
                  valid: stryMutAct_9fa48("48789") ? true : (stryCov_9fa48("48789"), false),
                  error: stryMutAct_9fa48("48790") ? `` : (stryCov_9fa48("48790"), `Invalid boolean: "${trimmedInput}". Use true/false, yes/no, or 1/0`)
                });
              }
            }
          }
        case stryMutAct_9fa48("48792") ? "" : (stryCov_9fa48("48792"), 'json'):
          if (stryMutAct_9fa48("48791")) {} else {
            stryCov_9fa48("48791");
            {
              if (stryMutAct_9fa48("48793")) {
                {}
              } else {
                stryCov_9fa48("48793");
                if (stryMutAct_9fa48("48796") ? trimmedInput !== '' : stryMutAct_9fa48("48795") ? false : stryMutAct_9fa48("48794") ? true : (stryCov_9fa48("48794", "48795", "48796"), trimmedInput === (stryMutAct_9fa48("48797") ? "Stryker was here!" : (stryCov_9fa48("48797"), '')))) {
                  if (stryMutAct_9fa48("48798")) {
                    {}
                  } else {
                    stryCov_9fa48("48798");
                    return stryMutAct_9fa48("48799") ? {} : (stryCov_9fa48("48799"), {
                      valid: stryMutAct_9fa48("48800") ? true : (stryCov_9fa48("48800"), false),
                      error: stryMutAct_9fa48("48801") ? "" : (stryCov_9fa48("48801"), 'JSON value cannot be empty')
                    });
                  }
                }
                try {
                  if (stryMutAct_9fa48("48802")) {
                    {}
                  } else {
                    stryCov_9fa48("48802");
                    const parsed = JSON.parse(trimmedInput);
                    return stryMutAct_9fa48("48803") ? {} : (stryCov_9fa48("48803"), {
                      valid: stryMutAct_9fa48("48804") ? false : (stryCov_9fa48("48804"), true),
                      parsedValue: parsed
                    });
                  }
                } catch (err) {
                  if (stryMutAct_9fa48("48805")) {
                    {}
                  } else {
                    stryCov_9fa48("48805");
                    return stryMutAct_9fa48("48806") ? {} : (stryCov_9fa48("48806"), {
                      valid: stryMutAct_9fa48("48807") ? true : (stryCov_9fa48("48807"), false),
                      error: stryMutAct_9fa48("48808") ? `` : (stryCov_9fa48("48808"), `Invalid JSON: ${err.message}`)
                    });
                  }
                }
              }
            }
          }
        default:
          if (stryMutAct_9fa48("48809")) {} else {
            stryCov_9fa48("48809");
            // Unknown type, accept as string
            return stryMutAct_9fa48("48810") ? {} : (stryCov_9fa48("48810"), {
              valid: stryMutAct_9fa48("48811") ? false : (stryCov_9fa48("48811"), true),
              parsedValue: trimmedInput
            });
          }
      }
    }
  }

  /**
   * Prepare an edit operation for a config entry
   * Requirements: 30.4, 30.5
   * @param {string} configKey - The config key to edit
   * @param {string} newValue - The new value as a string
   * @return {Object} Edit operation result
   */
  prepareEdit(configKey, newValue) {
    if (stryMutAct_9fa48("48812")) {
      {}
    } else {
      stryCov_9fa48("48812");
      const config = this.data.find(stryMutAct_9fa48("48813") ? () => undefined : (stryCov_9fa48("48813"), c => stryMutAct_9fa48("48816") ? c.config_key !== configKey : stryMutAct_9fa48("48815") ? false : stryMutAct_9fa48("48814") ? true : (stryCov_9fa48("48814", "48815", "48816"), c.config_key === configKey)));
      if (stryMutAct_9fa48("48819") ? false : stryMutAct_9fa48("48818") ? true : stryMutAct_9fa48("48817") ? config : (stryCov_9fa48("48817", "48818", "48819"), !config)) {
        if (stryMutAct_9fa48("48820")) {
          {}
        } else {
          stryCov_9fa48("48820");
          return stryMutAct_9fa48("48821") ? {} : (stryCov_9fa48("48821"), {
            success: stryMutAct_9fa48("48822") ? true : (stryCov_9fa48("48822"), false),
            error: stryMutAct_9fa48("48823") ? `` : (stryCov_9fa48("48823"), `Config key not found: ${configKey}`)
          });
        }
      }
      const validation = this.validateValue(newValue, stryMutAct_9fa48("48826") ? config.value_type && 'string' : stryMutAct_9fa48("48825") ? false : stryMutAct_9fa48("48824") ? true : (stryCov_9fa48("48824", "48825", "48826"), config.value_type || (stryMutAct_9fa48("48827") ? "" : (stryCov_9fa48("48827"), 'string'))));
      if (stryMutAct_9fa48("48830") ? false : stryMutAct_9fa48("48829") ? true : stryMutAct_9fa48("48828") ? validation.valid : (stryCov_9fa48("48828", "48829", "48830"), !validation.valid)) {
        if (stryMutAct_9fa48("48831")) {
          {}
        } else {
          stryCov_9fa48("48831");
          return stryMutAct_9fa48("48832") ? {} : (stryCov_9fa48("48832"), {
            success: stryMutAct_9fa48("48833") ? true : (stryCov_9fa48("48833"), false),
            error: validation.error
          });
        }
      }
      return stryMutAct_9fa48("48834") ? {} : (stryCov_9fa48("48834"), {
        success: stryMutAct_9fa48("48835") ? false : (stryCov_9fa48("48835"), true),
        config,
        oldValue: config.config_value,
        newValue: validation.parsedValue,
        requiresRestart: stryMutAct_9fa48("48838") ? config.requires_restart && false : stryMutAct_9fa48("48837") ? false : stryMutAct_9fa48("48836") ? true : (stryCov_9fa48("48836", "48837", "48838"), config.requires_restart || (stryMutAct_9fa48("48839") ? true : (stryCov_9fa48("48839"), false))),
        affectedNodes: this.getAffectedNodes(config)
      });
    }
  }

  /**
   * Get the nodes that will be affected by a config change
   * Requirements: 30.10
   * @param {Object} config - The config entry
   * @return {Array<string>} List of affected node IDs
   */
  getAffectedNodes(config) {
    if (stryMutAct_9fa48("48840")) {
      {}
    } else {
      stryCov_9fa48("48840");
      // If config has a node_id, only that node is affected
      if (stryMutAct_9fa48("48842") ? false : stryMutAct_9fa48("48841") ? true : (stryCov_9fa48("48841", "48842"), config.node_id)) {
        if (stryMutAct_9fa48("48843")) {
          {}
        } else {
          stryCov_9fa48("48843");
          return stryMutAct_9fa48("48844") ? [] : (stryCov_9fa48("48844"), [config.node_id]);
        }
      }

      // Otherwise, all nodes are affected (cluster-wide config)
      if (stryMutAct_9fa48("48847") ? this.cache || typeof this.cache.getNodes === 'function' : stryMutAct_9fa48("48846") ? false : stryMutAct_9fa48("48845") ? true : (stryCov_9fa48("48845", "48846", "48847"), this.cache && (stryMutAct_9fa48("48849") ? typeof this.cache.getNodes !== 'function' : stryMutAct_9fa48("48848") ? true : (stryCov_9fa48("48848", "48849"), typeof this.cache.getNodes === (stryMutAct_9fa48("48850") ? "" : (stryCov_9fa48("48850"), 'function')))))) {
        if (stryMutAct_9fa48("48851")) {
          {}
        } else {
          stryCov_9fa48("48851");
          const nodes = this.cache.getNodes();
          return nodes.map(stryMutAct_9fa48("48852") ? () => undefined : (stryCov_9fa48("48852"), n => n.node_id));
        }
      }
      return stryMutAct_9fa48("48853") ? [] : (stryCov_9fa48("48853"), [stryMutAct_9fa48("48854") ? "" : (stryCov_9fa48("48854"), 'all')]);
    }
  }

  /**
   * Generate a confirmation message for a config edit
   * Requirements: 30.9
   * @param {Object} editOperation - The prepared edit operation
   * @return {Object} Confirmation details
   */
  getEditConfirmation(editOperation) {
    if (stryMutAct_9fa48("48855")) {
      {}
    } else {
      stryCov_9fa48("48855");
      if (stryMutAct_9fa48("48858") ? false : stryMutAct_9fa48("48857") ? true : stryMutAct_9fa48("48856") ? editOperation.success : (stryCov_9fa48("48856", "48857", "48858"), !editOperation.success)) {
        if (stryMutAct_9fa48("48859")) {
          {}
        } else {
          stryCov_9fa48("48859");
          return null;
        }
      }
      const {
        config,
        oldValue,
        newValue,
        requiresRestart,
        affectedNodes
      } = editOperation;
      const message = stryMutAct_9fa48("48860") ? [] : (stryCov_9fa48("48860"), [stryMutAct_9fa48("48861") ? `` : (stryCov_9fa48("48861"), `Change config "${config.config_key}"?`), stryMutAct_9fa48("48862") ? "Stryker was here!" : (stryCov_9fa48("48862"), ''), stryMutAct_9fa48("48863") ? `` : (stryCov_9fa48("48863"), `Current value: ${this.formatFullValue(oldValue, config.value_type)}`), stryMutAct_9fa48("48864") ? `` : (stryCov_9fa48("48864"), `New value: ${this.formatFullValue(newValue, config.value_type)}`), stryMutAct_9fa48("48865") ? "Stryker was here!" : (stryCov_9fa48("48865"), ''), stryMutAct_9fa48("48866") ? `` : (stryCov_9fa48("48866"), `Affected nodes: ${affectedNodes.join(stryMutAct_9fa48("48867") ? "" : (stryCov_9fa48("48867"), ', '))}`)]);
      if (stryMutAct_9fa48("48869") ? false : stryMutAct_9fa48("48868") ? true : (stryCov_9fa48("48868", "48869"), requiresRestart)) {
        if (stryMutAct_9fa48("48870")) {
          {}
        } else {
          stryCov_9fa48("48870");
          message.push(stryMutAct_9fa48("48871") ? "Stryker was here!" : (stryCov_9fa48("48871"), ''));
          message.push(stryMutAct_9fa48("48872") ? "" : (stryCov_9fa48("48872"), '⚠️  WARNING: This change requires a node restart to take effect.'));
        }
      }
      return stryMutAct_9fa48("48873") ? {} : (stryCov_9fa48("48873"), {
        title: stryMutAct_9fa48("48874") ? "" : (stryCov_9fa48("48874"), 'Confirm Configuration Change'),
        message: message.join(stryMutAct_9fa48("48875") ? "" : (stryCov_9fa48("48875"), '\n')),
        requiresRestart,
        affectedNodes
      });
    }
  }

  /**
   * Prepare a revert operation to restore default value
   * Requirements: 30.8
   * @param {string} configKey - The config key to revert
   * @return {Object} Revert operation result
   */
  prepareRevert(configKey) {
    if (stryMutAct_9fa48("48876")) {
      {}
    } else {
      stryCov_9fa48("48876");
      const config = this.data.find(stryMutAct_9fa48("48877") ? () => undefined : (stryCov_9fa48("48877"), c => stryMutAct_9fa48("48880") ? c.config_key !== configKey : stryMutAct_9fa48("48879") ? false : stryMutAct_9fa48("48878") ? true : (stryCov_9fa48("48878", "48879", "48880"), c.config_key === configKey)));
      if (stryMutAct_9fa48("48883") ? false : stryMutAct_9fa48("48882") ? true : stryMutAct_9fa48("48881") ? config : (stryCov_9fa48("48881", "48882", "48883"), !config)) {
        if (stryMutAct_9fa48("48884")) {
          {}
        } else {
          stryCov_9fa48("48884");
          return stryMutAct_9fa48("48885") ? {} : (stryCov_9fa48("48885"), {
            success: stryMutAct_9fa48("48886") ? true : (stryCov_9fa48("48886"), false),
            error: stryMutAct_9fa48("48887") ? `` : (stryCov_9fa48("48887"), `Config key not found: ${configKey}`)
          });
        }
      }
      if (stryMutAct_9fa48("48890") ? false : stryMutAct_9fa48("48889") ? true : stryMutAct_9fa48("48888") ? Object.prototype.hasOwnProperty.call(config, 'default_value') : (stryCov_9fa48("48888", "48889", "48890"), !Object.prototype.hasOwnProperty.call(config, stryMutAct_9fa48("48891") ? "" : (stryCov_9fa48("48891"), 'default_value')))) {
        if (stryMutAct_9fa48("48892")) {
          {}
        } else {
          stryCov_9fa48("48892");
          return stryMutAct_9fa48("48893") ? {} : (stryCov_9fa48("48893"), {
            success: stryMutAct_9fa48("48894") ? true : (stryCov_9fa48("48894"), false),
            error: stryMutAct_9fa48("48895") ? `` : (stryCov_9fa48("48895"), `No default value defined for: ${configKey}`)
          });
        }
      }
      if (stryMutAct_9fa48("48898") ? false : stryMutAct_9fa48("48897") ? true : stryMutAct_9fa48("48896") ? this.isDifferentFromDefault(config) : (stryCov_9fa48("48896", "48897", "48898"), !this.isDifferentFromDefault(config))) {
        if (stryMutAct_9fa48("48899")) {
          {}
        } else {
          stryCov_9fa48("48899");
          return stryMutAct_9fa48("48900") ? {} : (stryCov_9fa48("48900"), {
            success: stryMutAct_9fa48("48901") ? true : (stryCov_9fa48("48901"), false),
            error: stryMutAct_9fa48("48902") ? `` : (stryCov_9fa48("48902"), `Config "${configKey}" is already at default value`)
          });
        }
      }
      return stryMutAct_9fa48("48903") ? {} : (stryCov_9fa48("48903"), {
        success: stryMutAct_9fa48("48904") ? false : (stryCov_9fa48("48904"), true),
        config,
        oldValue: config.config_value,
        newValue: config.default_value,
        requiresRestart: stryMutAct_9fa48("48907") ? config.requires_restart && false : stryMutAct_9fa48("48906") ? false : stryMutAct_9fa48("48905") ? true : (stryCov_9fa48("48905", "48906", "48907"), config.requires_restart || (stryMutAct_9fa48("48908") ? true : (stryCov_9fa48("48908"), false))),
        affectedNodes: this.getAffectedNodes(config),
        isRevert: stryMutAct_9fa48("48909") ? false : (stryCov_9fa48("48909"), true)
      });
    }
  }

  /**
   * Generate a confirmation message for a revert operation
   * Requirements: 30.8, 30.9
   * @param {Object} revertOperation - The prepared revert operation
   * @return {Object} Confirmation details
   */
  getRevertConfirmation(revertOperation) {
    if (stryMutAct_9fa48("48910")) {
      {}
    } else {
      stryCov_9fa48("48910");
      if (stryMutAct_9fa48("48913") ? false : stryMutAct_9fa48("48912") ? true : stryMutAct_9fa48("48911") ? revertOperation.success : (stryCov_9fa48("48911", "48912", "48913"), !revertOperation.success)) {
        if (stryMutAct_9fa48("48914")) {
          {}
        } else {
          stryCov_9fa48("48914");
          return null;
        }
      }
      const {
        config,
        oldValue,
        newValue,
        requiresRestart,
        affectedNodes
      } = revertOperation;
      const message = stryMutAct_9fa48("48915") ? [] : (stryCov_9fa48("48915"), [stryMutAct_9fa48("48916") ? `` : (stryCov_9fa48("48916"), `Revert config "${config.config_key}" to default value?`), stryMutAct_9fa48("48917") ? "Stryker was here!" : (stryCov_9fa48("48917"), ''), stryMutAct_9fa48("48918") ? `` : (stryCov_9fa48("48918"), `Current value: ${this.formatFullValue(oldValue, config.value_type)}`), stryMutAct_9fa48("48919") ? `` : (stryCov_9fa48("48919"), `Default value: ${this.formatFullValue(newValue, config.value_type)}`), stryMutAct_9fa48("48920") ? "Stryker was here!" : (stryCov_9fa48("48920"), ''), stryMutAct_9fa48("48921") ? `` : (stryCov_9fa48("48921"), `Affected nodes: ${affectedNodes.join(stryMutAct_9fa48("48922") ? "" : (stryCov_9fa48("48922"), ', '))}`)]);
      if (stryMutAct_9fa48("48924") ? false : stryMutAct_9fa48("48923") ? true : (stryCov_9fa48("48923", "48924"), requiresRestart)) {
        if (stryMutAct_9fa48("48925")) {
          {}
        } else {
          stryCov_9fa48("48925");
          message.push(stryMutAct_9fa48("48926") ? "Stryker was here!" : (stryCov_9fa48("48926"), ''));
          message.push(stryMutAct_9fa48("48927") ? "" : (stryCov_9fa48("48927"), '⚠️  WARNING: This change requires a node restart to take effect.'));
        }
      }
      return stryMutAct_9fa48("48928") ? {} : (stryCov_9fa48("48928"), {
        title: stryMutAct_9fa48("48929") ? "" : (stryCov_9fa48("48929"), 'Confirm Revert to Default'),
        message: message.join(stryMutAct_9fa48("48930") ? "" : (stryCov_9fa48("48930"), '\n')),
        requiresRestart,
        affectedNodes
      });
    }
  }

  /**
   * Check if a config entry can be edited
   * @param {string} configKey - The config key
   * @return {Object} Editability result
   */
  canEdit(configKey) {
    if (stryMutAct_9fa48("48931")) {
      {}
    } else {
      stryCov_9fa48("48931");
      const config = this.data.find(stryMutAct_9fa48("48932") ? () => undefined : (stryCov_9fa48("48932"), c => stryMutAct_9fa48("48935") ? c.config_key !== configKey : stryMutAct_9fa48("48934") ? false : stryMutAct_9fa48("48933") ? true : (stryCov_9fa48("48933", "48934", "48935"), c.config_key === configKey)));
      return (stryMutAct_9fa48("48936") ? config : (stryCov_9fa48("48936"), !config)) ? stryMutAct_9fa48("48937") ? {} : (stryCov_9fa48("48937"), {
        editable: stryMutAct_9fa48("48938") ? true : (stryCov_9fa48("48938"), false),
        reason: stryMutAct_9fa48("48939") ? "" : (stryCov_9fa48("48939"), 'Config key not found')
      }) : config.read_only ? stryMutAct_9fa48("48940") ? {} : (stryCov_9fa48("48940"), {
        editable: stryMutAct_9fa48("48941") ? true : (stryCov_9fa48("48941"), false),
        reason: stryMutAct_9fa48("48942") ? "" : (stryCov_9fa48("48942"), 'Config is read-only')
      }) : stryMutAct_9fa48("48943") ? {} : (stryCov_9fa48("48943"), {
        editable: stryMutAct_9fa48("48944") ? false : (stryCov_9fa48("48944"), true)
      });
    }
  }

  /**
   * Check if a config entry can be reverted
   * @param {string} configKey - The config key
   * @return {Object} Revertability result
   */
  canRevert(configKey) {
    if (stryMutAct_9fa48("48945")) {
      {}
    } else {
      stryCov_9fa48("48945");
      const config = this.data.find(stryMutAct_9fa48("48946") ? () => undefined : (stryCov_9fa48("48946"), c => stryMutAct_9fa48("48949") ? c.config_key !== configKey : stryMutAct_9fa48("48948") ? false : stryMutAct_9fa48("48947") ? true : (stryCov_9fa48("48947", "48948", "48949"), c.config_key === configKey)));
      const hasDefaultValue = stryMutAct_9fa48("48952") ? config || Object.prototype.hasOwnProperty.call(config, 'default_value') : stryMutAct_9fa48("48951") ? false : stryMutAct_9fa48("48950") ? true : (stryCov_9fa48("48950", "48951", "48952"), config && Object.prototype.hasOwnProperty.call(config, stryMutAct_9fa48("48953") ? "" : (stryCov_9fa48("48953"), 'default_value')));
      return (stryMutAct_9fa48("48954") ? config : (stryCov_9fa48("48954"), !config)) ? stryMutAct_9fa48("48955") ? {} : (stryCov_9fa48("48955"), {
        revertable: stryMutAct_9fa48("48956") ? true : (stryCov_9fa48("48956"), false),
        reason: stryMutAct_9fa48("48957") ? "" : (stryCov_9fa48("48957"), 'Config key not found')
      }) : (stryMutAct_9fa48("48958") ? hasDefaultValue : (stryCov_9fa48("48958"), !hasDefaultValue)) ? stryMutAct_9fa48("48959") ? {} : (stryCov_9fa48("48959"), {
        revertable: stryMutAct_9fa48("48960") ? true : (stryCov_9fa48("48960"), false),
        reason: stryMutAct_9fa48("48961") ? "" : (stryCov_9fa48("48961"), 'No default value defined')
      }) : (stryMutAct_9fa48("48962") ? this.isDifferentFromDefault(config) : (stryCov_9fa48("48962"), !this.isDifferentFromDefault(config))) ? stryMutAct_9fa48("48963") ? {} : (stryCov_9fa48("48963"), {
        revertable: stryMutAct_9fa48("48964") ? true : (stryCov_9fa48("48964"), false),
        reason: stryMutAct_9fa48("48965") ? "" : (stryCov_9fa48("48965"), 'Already at default value')
      }) : config.read_only ? stryMutAct_9fa48("48966") ? {} : (stryCov_9fa48("48966"), {
        revertable: stryMutAct_9fa48("48967") ? true : (stryCov_9fa48("48967"), false),
        reason: stryMutAct_9fa48("48968") ? "" : (stryCov_9fa48("48968"), 'Config is read-only')
      }) : stryMutAct_9fa48("48969") ? {} : (stryCov_9fa48("48969"), {
        revertable: stryMutAct_9fa48("48970") ? false : (stryCov_9fa48("48970"), true)
      });
    }
  }
}