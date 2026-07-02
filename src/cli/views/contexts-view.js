/**
 * ContextsView - Displays function execution contexts with filtering and highlighting
 *
 * Columns: context_id, context_type, name, created_at, updated_at
 * Supports filtering by type and name pattern, highlighting recently updated contexts.
 *
 * Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SERVICE = 'service';
const LOCAL_STR_USER = 'user';
const LOCAL_NUM_FIVE = 5;
const LOCAL_NUM_60 = 60;
const LOCAL_NUM_1000 = 1000;
const LOCAL_STR_CONTEXTS = 'contexts';
const LOCAL_STR_UPDATED_AT = 'updated_at';
const LOCAL_STR_DESC = 'desc';
const LOCAL_STR_CONTEXT_ID = 'context_id';
const LOCAL_STR_CONTEXT_ID_2 = 'Context ID';
const LOCAL_NUM_20 = 20;
const LOCAL_STR_CONTEXT_TYPE = 'context_type';
const LOCAL_STR_TYPE = 'Type';
const LOCAL_NUM_12 = 12;
const LOCAL_STR_NAME = 'name';
const LOCAL_STR_NAME_2 = 'Name';
const LOCAL_NUM_30 = 30;
const LOCAL_STR_CREATED_AT = 'created_at';
const LOCAL_STR_CREATED_AT_2 = 'Created At';
const LOCAL_STR_UPDATED_AT_2 = 'Updated At';
const LOCAL_STR_N_A = 'N/A';
const LOCAL_NUM_40 = 40;
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_2ZI04 = '...';
const LOCAL_STR_T = 'T';
const LOCAL_STR_SPACE = ' ';
const LOCAL_NUM_19 = 19;
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_1D7VE = '\\$&';
const LOCAL_STR_ASC = 'asc';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_SHOWDETAIL = 'showDetail';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_RETURN = 'return';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STATE_DATA = 'State Data';
const LOCAL_STR_DATA = 'Data';
const LOCAL_STR_STATUS = 'Status';
const LOCAL_STR_INFO = 'Info';
const LOCAL_STR_RECENTLY_UPDATED = 'Recently updated';
const LOCAL_STR_UNKNOWN = 'Unknown';

/**
 * Context types
 */
export const CONTEXT_TYPES = [LOCAL_STR_FUNCTION, LOCAL_STR_SERVICE, LOCAL_STR_USER];

/**
 * Threshold for "recently updated" highlighting (5 minutes in milliseconds)
 */
export const RECENT_UPDATE_THRESHOLD_MS = LOCAL_NUM_FIVE * LOCAL_NUM_60 * LOCAL_NUM_1000;

/**
 * ContextsView displays function execution contexts
 */
export class ContextsView extends BaseView {
  /**
   * Creates a new ContextsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {number} [options.recentUpdateThreshold] - Threshold for recent update highlighting
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.viewName = LOCAL_STR_CONTEXTS;

    // Filter state
    // Requirements: 31.2, 31.5
    this.typeFilter = null;
    this.namePatternFilter = null;

    // Recent update threshold (configurable for testing)
    this.recentUpdateThreshold = options.recentUpdateThreshold ||
      RECENT_UPDATE_THRESHOLD_MS;

    // Default sort by updated_at descending (most recent first)
    this.sortColumn = LOCAL_STR_UPDATED_AT;
    this.sortDirection = LOCAL_STR_DESC;
  }

  /**
   * Get column definitions for the contexts view
   * Requirements: 31.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: LOCAL_STR_CONTEXT_ID, label: LOCAL_STR_CONTEXT_ID_2, width: LOCAL_NUM_20},
      {key: LOCAL_STR_CONTEXT_TYPE, label: LOCAL_STR_TYPE, width: LOCAL_NUM_12},
      {key: LOCAL_STR_NAME, label: LOCAL_STR_NAME_2, width: LOCAL_NUM_30},
      {key: LOCAL_STR_CREATED_AT, label: LOCAL_STR_CREATED_AT_2, width: LOCAL_NUM_20},
      {key: LOCAL_STR_UPDATED_AT, label: LOCAL_STR_UPDATED_AT_2, width: LOCAL_NUM_20},
    ];
  }

  /**
   * Format a context record into a row array
   * Requirements: 31.1
   * @param {Object} context - Context record
   * @return {Array<string>} Row values
   */
  formatRow(context) {
    return [
      context.context_id || LOCAL_STR_N_A,
      context.context_type || LOCAL_STR_N_A,
      this.truncateName(context.name),
      this.formatTimestamp(context.created_at),
      this.formatTimestamp(context.updated_at),
    ];
  }

  /**
   * Truncate name for display in table
   * @param {string|null|undefined} name - Context name
   * @param {number} maxLength - Maximum length
   * @return {string} Truncated name
   */
  truncateName(name, maxLength = LOCAL_NUM_40) {
    if (!name) {
      return LOCAL_STR_N_A;
    }
    const str = String(name);
    if (str.length <= maxLength) {
      return str;
    }
    return str.substring(LOCAL_NUM_ZERO, maxLength - LOCAL_NUM_THREE) + LOCAL_STR_2ZI04;
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
      return date.toISOString().replace(LOCAL_STR_T, LOCAL_STR_SPACE)
        .substring(LOCAL_NUM_ZERO, LOCAL_NUM_19);
    } catch {
      return LOCAL_STR_N_A;
    }
  }

  /**
   * Get the row status for styling
   * Requirements: 31.4
   * @param {Object} context - Context record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(context) {
    // Highlight recently updated contexts
    if (this.isRecentlyUpdated(context)) {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Check if a context has been recently updated
   * Requirements: 31.4
   * @param {Object} context - Context record
   * @param {number} [referenceTime] - Reference time for comparison (defaults to now)
   * @return {boolean} True if recently updated
   */
  isRecentlyUpdated(context, referenceTime = Date.now()) {
    if (!context.updated_at) {
      return false;
    }

    const updatedAt = this.parseTimestamp(context.updated_at);
    if (updatedAt === null) {
      return false;
    }

    const timeSinceUpdate = referenceTime - updatedAt;
    return timeSinceUpdate >= LOCAL_NUM_ZERO && timeSinceUpdate <= this.recentUpdateThreshold;
  }

  /**
   * Parse timestamp to numeric value
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {number|null} Numeric timestamp or null
   */
  parseTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) {
      return null;
    }
    if (typeof timestamp === LOCAL_STR_NUMBER) {
      return timestamp;
    }
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Get the unique key for a context entry
   * @param {Object} context - Context record
   * @return {string} Unique key (context_id)
   */
  getItemKey(context) {
    return context.context_id || LOCAL_STR_EMPTY;
  }

  /**
   * Set type filter
   * Requirements: 31.2
   * @param {string|null} type - Context type to filter by
   */
  setTypeFilter(type) {
    this.typeFilter = type;
    this.updateFilteredData();
  }

  /**
   * Clear type filter
   */
  clearTypeFilter() {
    this.typeFilter = null;
    this.updateFilteredData();
  }

  /**
   * Set name pattern filter
   * Requirements: 31.5
   * @param {string|null} pattern - Name pattern to filter by
   */
  setNamePatternFilter(pattern) {
    this.namePatternFilter = pattern;
    this.updateFilteredData();
  }

  /**
   * Clear name pattern filter
   */
  clearNamePatternFilter() {
    this.namePatternFilter = null;
    this.updateFilteredData();
  }

  /**
   * Clear all filters
   */
  clearAllFilters() {
    this.typeFilter = null;
    this.namePatternFilter = null;
    this.filter = LOCAL_STR_EMPTY;
    this.updateFilteredData();
  }

  /**
   * Apply all filters to data
   * Requirements: 31.2, 31.5
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    let result = data;

    // Apply type filter
    // Requirements: 31.2
    if (this.typeFilter) {
      result = result.filter((context) =>
        (context.context_type || LOCAL_STR_EMPTY).toLowerCase() === this.typeFilter.toLowerCase(),
      );
    }

    // Apply name pattern filter
    // Requirements: 31.5
    if (this.namePatternFilter) {
      try {
        const pattern = new RegExp(this.escapeRegex(this.namePatternFilter), 'i');
        result = result.filter((context) => pattern.test(context.name || LOCAL_STR_EMPTY));
      } catch {
        // If regex is invalid, fall back to simple includes
        const lowerPattern = this.namePatternFilter.toLowerCase();
        result = result.filter((context) =>
          (context.name || LOCAL_STR_EMPTY).toLowerCase().includes(lowerPattern),
        );
      }
    }

    // Apply general text filter (from base class)
    if (this.filter && this.filter.trim() !== LOCAL_STR_EMPTY) {
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
    return str.replace(/[.*+?^${}()|[\]\\]/g, LOCAL_STR_1D7VE);
  }

  /**
   * Apply sort to data
   * @param {Array} data - Data to sort
   * @return {Array} Sorted data
   */
  applySort(data) {
    if (!this.sortColumn) {
      return data;
    }

    return [...data].sort((a, b) => {
      let aVal = a[this.sortColumn];
      let bVal = b[this.sortColumn];

      // Special handling for timestamp sorting
      if (this.sortColumn === LOCAL_STR_CREATED_AT || this.sortColumn === LOCAL_STR_UPDATED_AT) {
        aVal = this.parseTimestamp(aVal);
        bVal = this.parseTimestamp(bVal);
      }

      // Handle null/undefined
      if (aVal === null || aVal === undefined) {
        return this.sortDirection === LOCAL_STR_ASC ? LOCAL_NUM_ONE : -LOCAL_NUM_ONE;
      }
      if (bVal === null || bVal === undefined) {
        return this.sortDirection === LOCAL_STR_ASC ? -LOCAL_NUM_ONE : LOCAL_NUM_ONE;
      }

      // Compare values
      let cmp;
      if (typeof aVal === LOCAL_STR_NUMBER && typeof bVal === LOCAL_STR_NUMBER) {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return this.sortDirection === LOCAL_STR_ASC ? cmp : -cmp;
    });
  }

  /**
   * Handle drill-down action (Enter key on selected context)
   * Requirements: 31.3
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedContext = this.getSelectedItem();
    if (!selectedContext) {
      return null;
    }

    return {
      action: LOCAL_STR_SHOWDETAIL,
      view: LOCAL_STR_CONTEXTS,
      context: {contextId: selectedContext.context_id},
      detail: this.getSelectedDetails(),
    };
  }

  /**
   * Handle key input for the contexts view
   * @param {Object} key - Key event
   * @return {boolean|Object} True if handled, navigation object, or false
   */
  handleKey(key) {
    if (key.name === LOCAL_STR_ENTER || key.name === LOCAL_STR_RETURN) {
      return this.handleDrillDown();
    }
    return super.handleKey(key);
  }

  /**
   * Get detail information for the selected context
   * Requirements: 31.3
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const context = this.getSelectedItem();
    if (!context) {
      return null;
    }

    const sections = [
      {
        title: 'Context Entry',
        fields: [
          {label: 'Context ID', value: context.context_id || 'N/A'},
          {label: 'Type', value: context.context_type || 'N/A'},
          {label: 'Name', value: context.name || 'N/A'},
          {label: 'Created At', value: this.formatTimestamp(context.created_at)},
          {label: 'Updated At', value: this.formatTimestamp(context.updated_at)},
        ],
      },
    ];

    // Add state data section if available
    // Requirements: 31.3
    if (context.state_data && typeof context.state_data === LOCAL_STR_OBJECT) {
      const stateFields = Object.entries(context.state_data).map(([k, v]) => ({
        label: k,
        value: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v),
      }));

      if (stateFields.length > LOCAL_NUM_ZERO) {
        sections.push({
          title: LOCAL_STR_STATE_DATA,
          fields: stateFields,
        });
      }
    } else if (context.state_data) {
      // Handle non-object state_data
      sections.push({
        title: LOCAL_STR_STATE_DATA,
        fields: [
          {label: LOCAL_STR_DATA, value: String(context.state_data)},
        ],
      });
    }

    // Add recently updated indicator
    if (this.isRecentlyUpdated(context)) {
      sections.push({
        title: LOCAL_STR_STATUS,
        fields: [
          {label: LOCAL_STR_INFO, value: LOCAL_STR_RECENTLY_UPDATED},
        ],
      });
    }

    return {
      title: `Context: ${context.name || context.context_id || LOCAL_STR_UNKNOWN}`,
      sections,
    };
  }

  /**
   * Get context count by type
   * Requirements: 31.6
   * @return {Object} Object mapping type to count
   */
  getContextCountByType() {
    const counts = {};

    // Initialize counts for known types
    for (const type of CONTEXT_TYPES) {
      counts[type] = LOCAL_NUM_ZERO;
    }

    // Count contexts by type
    for (const context of this.filteredData) {
      const type = (context.context_type || 'unknown').toLowerCase();
      if (counts[type] !== undefined) {
        counts[type]++;
      } else {
        counts[type] = LOCAL_NUM_ONE;
      }
    }

    return counts;
  }

  /**
   * Get status bar information
   * Requirements: 31.6
   * @return {Object} Status bar data
   */
  getStatusBarInfo() {
    const activeFilters = [];

    if (this.typeFilter) {
      activeFilters.push(`Type: ${this.typeFilter}`);
    }
    if (this.namePatternFilter) {
      activeFilters.push(`Name: "${this.namePatternFilter}"`);
    }

    // Count recently updated contexts
    const recentlyUpdatedCount = this.filteredData.filter(
      (context) => this.isRecentlyUpdated(context),
    ).length;

    // Get counts by type
    const countsByType = this.getContextCountByType();

    return {
      contextCount: this.filteredData.length,
      totalCount: this.data.length,
      recentlyUpdatedCount,
      countsByType,
      activeFilters,
    };
  }

  /**
   * Render the view with context-specific styling
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
   * Set the recent update threshold
   * @param {number} thresholdMs - Threshold in milliseconds
   */
  setRecentUpdateThreshold(thresholdMs) {
    this.recentUpdateThreshold = thresholdMs;
  }

  /**
   * Get the recent update threshold
   * @return {number} Threshold in milliseconds
   */
  getRecentUpdateThreshold() {
    return this.recentUpdateThreshold;
  }
}
