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
export const CONFIG_TYPES = ['string', 'number', 'boolean', 'json'];

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
    this.viewName = 'config';

    // Key pattern filter
    // Requirements: 30.2
    this.keyPatternFilter = null;

    // Default sort by key ascending
    this.sortColumn = 'key';
    this.sortDirection = 'asc';
  }

  /**
   * Get column definitions for the config view
   * Requirements: 30.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'key', label: 'Key', width: 35},
      {key: 'value', label: 'Value', width: 30},
      {key: 'type', label: 'Type', width: 10},
      {key: 'requires_restart', label: 'Requires Restart', width: 16},
      {key: 'updated_at', label: 'Last Modified', width: 20},
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
      config.config_key || 'N/A',
      this.formatValue(config.config_value, config.value_type),
      config.value_type || 'string',
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
    if (value === null || value === undefined) {
      return 'null';
    }

    if (type === 'json' && typeof value === 'object') {
      const str = JSON.stringify(value);
      return str.length > 40 ? str.substring(0, 37) + '...' : str;
    }

    if (type === 'boolean') {
      return value ? 'true' : 'false';
    }

    const str = String(value);
    return str.length > 40 ? str.substring(0, 37) + '...' : str;
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
        return 'Yes (!)';
      }
      return 'Yes';
    }
    return 'No';
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) {
      return 'N/A';
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch (_err) {
      return 'N/A';
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
    // If no default_value is defined, consider it as matching
    if (!Object.prototype.hasOwnProperty.call(config, 'default_value')) {
      return false;
    }

    const currentValue = config.config_value;
    const defaultValue = config.default_value;

    // Handle null/undefined cases
    if (currentValue === null || currentValue === undefined) {
      return defaultValue !== null && defaultValue !== undefined;
    }
    if (defaultValue === null || defaultValue === undefined) {
      return true;
    }

    // For objects/arrays, compare JSON strings
    if (typeof currentValue === 'object' || typeof defaultValue === 'object') {
      return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
    }

    // Direct comparison for primitives
    return currentValue !== defaultValue;
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
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      action: 'showDetail',
      view: 'config',
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
    if (key.name === 'enter' || key.name === 'return') {
      return this.handleDrillDown();
    }
    return super.handleKey(key);
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
        title: 'Description',
        fields: [
          {label: 'Info', value: config.description},
        ],
      });
    }

    // Add warning if value differs from default
    if (this.isDifferentFromDefault(config)) {
      sections.push({
        title: 'Status',
        fields: [
          {label: 'Warning', value: 'Value differs from default'},
        ],
      });
    }

    // Add restart warning if applicable
    if (config.requires_restart && config.pending_restart) {
      sections.push({
        title: 'Restart Required',
        fields: [
          {label: 'Warning', value: 'Node restart required for changes to take effect'},
        ],
      });
    }

    return {
      title: `Config: ${config.config_key || 'Unknown'}`,
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
    if (value === null || value === undefined) {
      return 'null';
    }

    if (type === 'json' && typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    if (type === 'boolean') {
      return value ? 'true' : 'false';
    }

    return String(value);
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
    if (inputValue === null || inputValue === undefined) {
      return {valid: true, parsedValue: null};
    }

    const trimmedInput = String(inputValue).trim();

    switch (type) {
    case 'string':
      return {valid: true, parsedValue: trimmedInput};

    case 'number': {
      if (trimmedInput === '') {
        return {valid: false, error: 'Number value cannot be empty'};
      }
      const num = Number(trimmedInput);
      if (isNaN(num)) {
        return {valid: false, error: `Invalid number: "${trimmedInput}"`};
      }
      return {valid: true, parsedValue: num};
    }

    case 'boolean': {
      const lower = trimmedInput.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return {valid: true, parsedValue: true};
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return {valid: true, parsedValue: false};
      }
      return {
        valid: false,
        error: `Invalid boolean: "${trimmedInput}". Use true/false, yes/no, or 1/0`,
      };
    }

    case 'json': {
      if (trimmedInput === '') {
        return {valid: false, error: 'JSON value cannot be empty'};
      }
      try {
        const parsed = JSON.parse(trimmedInput);
        return {valid: true, parsedValue: parsed};
      } catch (err) {
        return {valid: false, error: `Invalid JSON: ${err.message}`};
      }
    }

    default:
      // Unknown type, accept as string
      return {valid: true, parsedValue: trimmedInput};
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
    if (this.cache && typeof this.cache.getNodes === 'function') {
      const nodes = this.cache.getNodes();
      return nodes.map((n) => n.node_id);
    }

    return ['all'];
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
      message.push('⚠️  WARNING: This change requires a node restart to take effect.');
    }

    return {
      title: 'Confirm Configuration Change',
      message: message.join('\n'),
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

    if (!Object.prototype.hasOwnProperty.call(config, 'default_value')) {
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
      message.push('⚠️  WARNING: This change requires a node restart to take effect.');
    }

    return {
      title: 'Confirm Revert to Default',
      message: message.join('\n'),
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
    if (!config) {
      return {editable: false, reason: 'Config key not found'};
    }

    // Check if config is marked as read-only
    if (config.read_only) {
      return {editable: false, reason: 'Config is read-only'};
    }

    return {editable: true};
  }

  /**
   * Check if a config entry can be reverted
   * @param {string} configKey - The config key
   * @return {Object} Revertability result
   */
  canRevert(configKey) {
    const config = this.data.find((c) => c.config_key === configKey);
    if (!config) {
      return {revertable: false, reason: 'Config key not found'};
    }

    if (!Object.prototype.hasOwnProperty.call(config, 'default_value')) {
      return {revertable: false, reason: 'No default value defined'};
    }

    if (!this.isDifferentFromDefault(config)) {
      return {revertable: false, reason: 'Already at default value'};
    }

    if (config.read_only) {
      return {revertable: false, reason: 'Config is read-only'};
    }

    return {revertable: true};
  }
}
