/**
 * ConfigView - Displays system configuration with filtering and highlighting
 *
 * Columns: key, value, type, requires_restart, last_modified
 * Supports filtering by key pattern, highlighting non-default values,
 * restart-required warnings, and config editing.
 *
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';
import {
  formatConfigValue,
  formatFullConfigValue,
  isConfigDifferentFromDefault,
  validateConfigValue,
} from './config-value-helpers.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_JSON = 'json';
const LOCAL_STR_CONFIG = 'config';
const LOCAL_STR_KEY = 'key';
const LOCAL_STR_ASC = 'asc';
const LOCAL_STR_KEY_2 = 'Key';
const LOCAL_NUM_FORTY_FIVE = 45;
const LOCAL_STR_VALUE = 'value';
const LOCAL_STR_VALUE_2 = 'Value';
const LOCAL_NUM_TWENTY = 20;
const LOCAL_STR_TYPE = 'type';
const LOCAL_STR_TYPE_2 = 'Type';
const LOCAL_NUM_EIGHT = 8;
const LOCAL_STR_REQUIRES_RESTART = 'requires_restart';
const LOCAL_STR_RESTART = 'Restart';
const LOCAL_STR_UPDATED_AT = 'updated_at';
const LOCAL_STR_LAST_MODIFIED = 'Last Modified';
const LOCAL_STR_N_A = 'N/A';
const LOCAL_STR_YES = 'Yes (!)';
const LOCAL_STR_YES_2 = 'Yes';
const LOCAL_STR_NO = 'No';
const LOCAL_STR_T = 'T';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_NINETEEN = 19;
const LOCAL_STR_DEFAULT_VALUE = 'default_value';
const LOCAL_STR_BACKSLASH_DOLLAR_AMP = '\\$&';
const LOCAL_STR_SHOWDETAIL = 'showDetail';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_E = 'e';
const LOCAL_STR_R = 'R';
const LOCAL_STR_SHOWERROR = 'showError';
const LOCAL_STR_EDITCONFIG = 'editConfig';
const LOCAL_STR_REVERTCONFIG = 'revertConfig';
const LOCAL_STR_E_EDIT_R_REVERT_ENTER_DETAILS_D_DETAIL_P = 'e:Edit  R:Revert  Enter:Details  d:Detail Panel  /:Filter';
const LOCAL_STR_DESCRIPTION = 'Description';
const LOCAL_STR_INFO = 'Info';
const LOCAL_STR_STATUS = 'Status';
const LOCAL_STR_WARNING = 'Warning';
const LOCAL_STR_VALUE_DIFFERS_FROM_DEFAULT = 'Value differs from default';
const LOCAL_STR_RESTART_REQUIRED = 'Restart Required';
const LOCAL_STR_NODE_RESTART_REQUIRED_FOR_CHANGES_TO_TAK = 'Node restart required for changes to take effect';
const LOCAL_STR_UNKNOWN = 'Unknown';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_ALL = 'all';
const LOCAL_STR_WARNING_THIS_CHANGE_REQUIRES_A_NODE_REST = '⚠️  WARNING: This change requires a node restart to take effect.';
const LOCAL_STR_CONFIRM_CONFIGURATION_CHANGE = 'Confirm Configuration Change';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_CONFIRM_REVERT_TO_DEFAULT = 'Confirm Revert to Default';
const LOCAL_STR_CONFIG_KEY_NOT_FOUND = 'Config key not found';
const LOCAL_STR_CONFIG_IS_READ_ONLY = 'Config is read-only';
const LOCAL_STR_NO_DEFAULT_VALUE_DEFINED = 'No default value defined';
const LOCAL_STR_ALREADY_AT_DEFAULT_VALUE = 'Already at default value';

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
export const CONFIG_TYPES = [LOCAL_STR_STRING, LOCAL_STR_NUMBER, LOCAL_STR_BOOLEAN, LOCAL_STR_JSON];

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
    super(options);
    this.cache = options.cache || null;
    this.viewName = LOCAL_STR_CONFIG;

    // Key pattern filter
    // Requirements: 30.2
    this.keyPatternFilter = null;

    // Default sort by key ascending
    this.sortColumn = LOCAL_STR_KEY;
    this.sortDirection = LOCAL_STR_ASC;
  }

  /**
   * Get column definitions for the config view
   * Requirements: 30.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_KEY, label: LOCAL_STR_KEY_2, width: LOCAL_NUM_FORTY_FIVE},
      {key: LOCAL_STR_VALUE, label: LOCAL_STR_VALUE_2, width: LOCAL_NUM_TWENTY},
      {key: LOCAL_STR_TYPE, label: LOCAL_STR_TYPE_2, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_REQUIRES_RESTART, label: LOCAL_STR_RESTART, width: LOCAL_NUM_EIGHT},
      {key: LOCAL_STR_UPDATED_AT, label: LOCAL_STR_LAST_MODIFIED, width: LOCAL_NUM_TWENTY},
    ];
  }

  /**
   * Format a config record into a row array
   * Requirements: 30.1
   * @param {Object} config - Config record
   * @return {Array<string>} Row values
   */
  formatRow(config) {
    return [
      config.config_key || LOCAL_STR_N_A,
      this.formatValue(config.config_value, config.value_type),
      config.value_type || LOCAL_STR_STRING,
      this.formatRequiresRestart(config),
      this.formatTimestamp(config.updated_at),
    ];
  }

  /**
   * Format config value for display
   * @param {*} value - Config value
   * @param {string} type - Value type
   * @return {string} Formatted value
   */
  formatValue(value, type) {
    return formatConfigValue(value, type);
  }

  /**
   * Format requires_restart field with warning indicator
   * Requirements: 30.6
   * @param {Object} config - Config record
   * @return {string} Formatted requires_restart value
   */
  formatRequiresRestart(config) {
    if (config.requires_restart) {
      // Add warning indicator if pending restart
      if (config.pending_restart) {
        return LOCAL_STR_YES;
      }
      return LOCAL_STR_YES_2;
    }
    return LOCAL_STR_NO;
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) {
      return LOCAL_STR_N_A;
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return LOCAL_STR_N_A;
      }
      return date.toISOString()
        .replace(LOCAL_STR_T, LOCAL_STR_SPACE)
        .substring(0, LOCAL_NUM_NINETEEN);
    } catch (_err) {
      return LOCAL_STR_N_A;
    }
  }

  /**
   * Get the row status for styling
   * Requirements: 30.6, 30.7
   * @param {Object} config - Config record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(config) {
    // Highlight entries that require restart and have pending changes
    if (config.requires_restart && config.pending_restart) {
      return ROW_STATUS.WARNING;
    }

    // Highlight entries that differ from default values
    // Requirements: 30.7
    if (this.isDifferentFromDefault(config)) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Check if config value differs from default
   * Requirements: 30.7
   * @param {Object} config - Config record
   * @return {boolean} True if value differs from default
   */
  isDifferentFromDefault(config) {
    return isConfigDifferentFromDefault(config);
  }

  /**
   * Get the unique key for a config entry
   * @param {Object} config - Config record
   * @return {string} Unique key
   */
  getItemKey(config) {
    return config.config_key || '';
  }

  /**
   * Set key pattern filter
   * Requirements: 30.2
   * @param {string|null} pattern - Key pattern to filter by
   */
  setKeyPatternFilter(pattern) {
    this.keyPatternFilter = pattern;
    this.updateFilteredData();
  }

  /**
   * Clear key pattern filter
   */
  clearKeyPatternFilter() {
    this.keyPatternFilter = null;
    this.updateFilteredData();
  }

  /**
   * Apply all filters to data
   * Requirements: 30.2
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    let result = data;

    // Apply key pattern filter
    if (this.keyPatternFilter) {
      try {
        const pattern = new RegExp(this.escapeRegex(this.keyPatternFilter), 'i');
        result = result.filter((config) => pattern.test(config.config_key || ''));
      } catch (_err) {
        // If regex is invalid, fall back to simple includes
        const lowerPattern = this.keyPatternFilter.toLowerCase();
        result = result.filter((config) =>
          (config.config_key || '').toLowerCase().includes(lowerPattern),
        );
      }
    }

    // Apply general text filter (from base class)
    if (this.filter && this.filter.trim() !== '') {
      const lowerFilter = this.filter.toLowerCase();
      result = result.filter((item) => {
        const values = Object.values(item);
        return values.some((value) => {
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(lowerFilter);
        });
      });
    }

    return result;
  }

  /**
   * Escape special regex characters
   * @param {string} str - String to escape
   * @return {string} Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, LOCAL_STR_BACKSLASH_DOLLAR_AMP);
  }

  /**
   * Handle drill-down action (Enter key on selected config)
   * Requirements: 30.3
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedConfig = this.getSelectedItem();
    if (!selectedConfig) {
      return null;
    }

    return {
      action: LOCAL_STR_SHOWDETAIL,
      view: LOCAL_STR_CONFIG,
      context: {configKey: selectedConfig.config_key},
      detail: this.getSelectedDetails(),
    };
  }

  /**
   * Handle key input for the config view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === LOCAL_STR_ENTER || key.name === LOCAL_STR_RETURN) {
      return this.handleDrillDown();
    }

    // 'e' key to edit selected config
    if (key.ch === LOCAL_STR_E) {
      return this.handleEditRequest();
    }

    // 'r' key to revert to default (when in config view context)
    if (key.ch === LOCAL_STR_R) {
      return this.handleRevertRequest();
    }

    return super.handleKey(key);
  }

  /**
   * Handle edit request for selected config
   * @return {Object|null} Edit action or null
   */
  handleEditRequest() {
    const selectedConfig = this.getSelectedItem();
    if (!selectedConfig) {
      return null;
    }

    const editability = this.canEdit(selectedConfig.config_key);
    if (!editability.editable) {
      return {
        action: LOCAL_STR_SHOWERROR,
        message: editability.reason,
      };
    }

    return {
      action: LOCAL_STR_EDITCONFIG,
      config: selectedConfig,
      currentValue: this.formatFullValue(
        selectedConfig.config_value, selectedConfig.value_type,
      ),
    };
  }

  /**
   * Handle revert request for selected config
   * @return {Object|null} Revert action or null
   */
  handleRevertRequest() {
    const selectedConfig = this.getSelectedItem();
    if (!selectedConfig) {
      return null;
    }

    const revertability = this.canRevert(selectedConfig.config_key);
    if (!revertability.revertable) {
      return {
        action: LOCAL_STR_SHOWERROR,
        message: revertability.reason,
      };
    }

    const revertOp = this.prepareRevert(selectedConfig.config_key);
    return {
      action: LOCAL_STR_REVERTCONFIG,
      config: selectedConfig,
      revertOperation: revertOp,
      confirmation: this.getRevertConfirmation(revertOp),
    };
  }

  /**
   * Get help text for the config view
   * @return {string} Help text for status bar
   */
  getHelpText() {
    return LOCAL_STR_E_EDIT_R_REVERT_ENTER_DETAILS_D_DETAIL_P;
  }

  /**
   * Get detail information for the selected config entry
   * Requirements: 30.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const config = this.getSelectedItem();
    if (!config) {
      return null;
    }

    const sections = [
      {
        title: 'Configuration Entry',
        fields: [
          {label: 'Key', value: config.config_key || 'N/A'},
          {label: 'Value', value: this.formatFullValue(
            config.config_value, config.value_type,
          )},
          {label: 'Type', value: config.value_type || 'string'},
          {label: 'Default Value', value: this.formatFullValue(
            config.default_value, config.value_type,
          )},
          {label: 'Requires Restart', value: config.requires_restart ? 'Yes' : 'No'},
          {label: 'Last Modified', value: this.formatTimestamp(config.updated_at)},
        ],
      },
    ];

    // Add description if available
    if (config.description) {
      sections.push({
        title: LOCAL_STR_DESCRIPTION,
        fields: [
          {label: LOCAL_STR_INFO, value: config.description},
        ],
      });
    }

    // Add warning if value differs from default
    if (this.isDifferentFromDefault(config)) {
      sections.push({
        title: LOCAL_STR_STATUS,
        fields: [
          {label: LOCAL_STR_WARNING, value: LOCAL_STR_VALUE_DIFFERS_FROM_DEFAULT},
        ],
      });
    }

    // Add restart warning if applicable
    if (config.requires_restart && config.pending_restart) {
      sections.push({
        title: LOCAL_STR_RESTART_REQUIRED,
        fields: [
          {label: LOCAL_STR_WARNING, value: LOCAL_STR_NODE_RESTART_REQUIRED_FOR_CHANGES_TO_TAK},
        ],
      });
    }

    return {
      title: `Config: ${config.config_key || LOCAL_STR_UNKNOWN}`,
      sections,
    };
  }

  /**
   * Format full value for detail view (no truncation)
   * @param {*} value - Config value
   * @param {string} type - Value type
   * @return {string} Formatted value
   */
  formatFullValue(value, type) {
    return formatFullConfigValue(value, type);
  }

  /**
   * Get status bar information
   * @return {Object} Status bar data
   */
  getStatusBarInfo() {
    const activeFilters = [];

    if (this.keyPatternFilter) {
      activeFilters.push(`Key: "${this.keyPatternFilter}"`);
    }

    // Count entries that differ from default
    const nonDefaultCount = this.filteredData.filter(
      (config) => this.isDifferentFromDefault(config),
    ).length;

    // Count entries requiring restart
    const restartRequiredCount = this.filteredData.filter(
      (config) => config.requires_restart && config.pending_restart,
    ).length;

    return {
      configCount: this.filteredData.length,
      totalCount: this.data.length,
      nonDefaultCount,
      restartRequiredCount,
      activeFilters,
    };
  }

  /**
   * Render the view with config-specific styling
   * @param {Object} state - Navigation state
   * @return {Object} Render data with headers and rows
   */
  render(state = {}) {
    const baseRender = super.render(state);

    // Add status bar info
    baseRender.statusBar = this.getStatusBarInfo();

    return baseRender;
  }

  /**
   * Validate a value against the expected type
   * Requirements: 30.5
   * @param {string} inputValue - The input value as a string
   * @param {string} type - The expected type
   * @return {ValidationResult} Validation result
   */
  validateValue(inputValue, type) {
    return validateConfigValue(inputValue, type);
  }

  /**
   * Prepare an edit operation for a config entry
   * Requirements: 30.4, 30.5
   * @param {string} configKey - The config key to edit
   * @param {string} newValue - The new value as a string
   * @return {Object} Edit operation result
   */
  prepareEdit(configKey, newValue) {
    const config = this.data.find((c) => c.config_key === configKey);
    if (!config) {
      return {
        success: false,
        error: `Config key not found: ${configKey}`,
      };
    }

    const validation = this.validateValue(newValue, config.value_type || 'string');
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return {
      success: true,
      config,
      oldValue: config.config_value,
      newValue: validation.parsedValue,
      requiresRestart: config.requires_restart || false,
      affectedNodes: this.getAffectedNodes(config),
    };
  }

  /**
   * Get the nodes that will be affected by a config change
   * Requirements: 30.10
   * @param {Object} config - The config entry
   * @return {Array<string>} List of affected node IDs
   */
  getAffectedNodes(config) {
    // If config has a node_id, only that node is affected
    if (config.node_id) {
      return [config.node_id];
    }

    // Otherwise, all nodes are affected (cluster-wide config)
    if (this.cache && typeof this.cache.getNodes === LOCAL_STR_FUNCTION) {
      const nodes = this.cache.getNodes();
      return nodes.map((n) => n.node_id);
    }

    return [LOCAL_STR_ALL];
  }

  /**
   * Generate a confirmation message for a config edit
   * Requirements: 30.9
   * @param {Object} editOperation - The prepared edit operation
   * @return {Object} Confirmation details
   */
  getEditConfirmation(editOperation) {
    if (!editOperation.success) {
      return null;
    }

    const {config, oldValue, newValue, requiresRestart, affectedNodes} = editOperation;

    const message = [
      `Change config "${config.config_key}"?`,
      '',
      `Current value: ${this.formatFullValue(oldValue, config.value_type)}`,
      `New value: ${this.formatFullValue(newValue, config.value_type)}`,
      '',
      `Affected nodes: ${affectedNodes.join(', ')}`,
    ];

    if (requiresRestart) {
      message.push('');
      message.push(LOCAL_STR_WARNING_THIS_CHANGE_REQUIRES_A_NODE_REST);
    }

    return {
      title: LOCAL_STR_CONFIRM_CONFIGURATION_CHANGE,
      message: message.join(LOCAL_STR_NEWLINE),
      requiresRestart,
      affectedNodes,
    };
  }

  /**
   * Prepare a revert operation to restore default value
   * Requirements: 30.8
   * @param {string} configKey - The config key to revert
   * @return {Object} Revert operation result
   */
  prepareRevert(configKey) {
    const config = this.data.find((c) => c.config_key === configKey);
    if (!config) {
      return {
        success: false,
        error: `Config key not found: ${configKey}`,
      };
    }

    if (!Object.prototype.hasOwnProperty.call(config, LOCAL_STR_DEFAULT_VALUE)) {
      return {
        success: false,
        error: `No default value defined for: ${configKey}`,
      };
    }

    if (!this.isDifferentFromDefault(config)) {
      return {
        success: false,
        error: `Config "${configKey}" is already at default value`,
      };
    }

    return {
      success: true,
      config,
      oldValue: config.config_value,
      newValue: config.default_value,
      requiresRestart: config.requires_restart || false,
      affectedNodes: this.getAffectedNodes(config),
      isRevert: true,
    };
  }

  /**
   * Generate a confirmation message for a revert operation
   * Requirements: 30.8, 30.9
   * @param {Object} revertOperation - The prepared revert operation
   * @return {Object} Confirmation details
   */
  getRevertConfirmation(revertOperation) {
    if (!revertOperation.success) {
      return null;
    }

    const {config, oldValue, newValue, requiresRestart, affectedNodes} = revertOperation;

    const message = [
      `Revert config "${config.config_key}" to default value?`,
      '',
      `Current value: ${this.formatFullValue(oldValue, config.value_type)}`,
      `Default value: ${this.formatFullValue(newValue, config.value_type)}`,
      '',
      `Affected nodes: ${affectedNodes.join(', ')}`,
    ];

    if (requiresRestart) {
      message.push('');
      message.push(LOCAL_STR_WARNING_THIS_CHANGE_REQUIRES_A_NODE_REST);
    }

    return {
      title: LOCAL_STR_CONFIRM_REVERT_TO_DEFAULT,
      message: message.join(LOCAL_STR_NEWLINE),
      requiresRestart,
      affectedNodes,
    };
  }

  /**
   * Check if a config entry can be edited
   * @param {string} configKey - The config key
   * @return {Object} Editability result
   */
  canEdit(configKey) {
    const config = this.data.find((c) => c.config_key === configKey);
    return !config ?
      {editable: false, reason: LOCAL_STR_CONFIG_KEY_NOT_FOUND} :
      config.read_only ?
        {editable: false, reason: LOCAL_STR_CONFIG_IS_READ_ONLY} :
        {editable: true};
  }

  /**
   * Check if a config entry can be reverted
   * @param {string} configKey - The config key
   * @return {Object} Revertability result
   */
  canRevert(configKey) {
    const config = this.data.find((c) => c.config_key === configKey);
    const hasDefaultValue = config &&
      Object.prototype.hasOwnProperty.call(config, 'default_value');
    return !config ?
      {revertable: false, reason: LOCAL_STR_CONFIG_KEY_NOT_FOUND} :
      !hasDefaultValue ?
        {revertable: false, reason: LOCAL_STR_NO_DEFAULT_VALUE_DEFINED} :
        !this.isDifferentFromDefault(config) ?
          {revertable: false, reason: LOCAL_STR_ALREADY_AT_DEFAULT_VALUE} :
          config.read_only ?
            {revertable: false, reason: LOCAL_STR_CONFIG_IS_READ_ONLY} :
            {revertable: true};
  }
}
