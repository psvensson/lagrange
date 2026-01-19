/**
 * ContextsView - Displays function execution contexts with filtering and highlighting
 *
 * Columns: context_id, context_type, name, created_at, updated_at
 * Supports filtering by type and name pattern, highlighting recently updated contexts.
 *
 * Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * Context types
 */
export const CONTEXT_TYPES = ['function', 'service', 'user'];

/**
 * Threshold for "recently updated" highlighting (5 minutes in milliseconds)
 */
export const RECENT_UPDATE_THRESHOLD_MS = 5 * 60 * 1000;

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
    this.viewName = 'contexts';

    // Filter state
    // Requirements: 31.2, 31.5
    this.typeFilter = null;
    this.namePatternFilter = null;

    // Recent update threshold (configurable for testing)
    this.recentUpdateThreshold = options.recentUpdateThreshold ||
      RECENT_UPDATE_THRESHOLD_MS;

    // Default sort by updated_at descending (most recent first)
    this.sortColumn = 'updated_at';
    this.sortDirection = 'desc';
  }

  /**
   * Get column definitions for the contexts view
   * Requirements: 31.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'context_id', label: 'Context ID', width: 20},
      {key: 'context_type', label: 'Type', width: 12},
      {key: 'name', label: 'Name', width: 30},
      {key: 'created_at', label: 'Created At', width: 20},
      {key: 'updated_at', label: 'Updated At', width: 20},
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
      context.context_id || 'N/A',
      context.context_type || 'N/A',
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
  truncateName(name, maxLength = 40) {
    if (!name) {
      return 'N/A';
    }
    const str = String(name);
    if (str.length <= maxLength) {
      return str;
    }
    return str.substring(0, maxLength - 3) + '...';
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
    } catch {
      return 'N/A';
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
    return timeSinceUpdate >= 0 && timeSinceUpdate <= this.recentUpdateThreshold;
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
    if (typeof timestamp === 'number') {
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
    return context.context_id || '';
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
    this.filter = '';
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
        (context.context_type || '').toLowerCase() === this.typeFilter.toLowerCase(),
      );
    }

    // Apply name pattern filter
    // Requirements: 31.5
    if (this.namePatternFilter) {
      try {
        const pattern = new RegExp(this.escapeRegex(this.namePatternFilter), 'i');
        result = result.filter((context) => pattern.test(context.name || ''));
      } catch {
        // If regex is invalid, fall back to simple includes
        const lowerPattern = this.namePatternFilter.toLowerCase();
        result = result.filter((context) =>
          (context.name || '').toLowerCase().includes(lowerPattern),
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
      if (this.sortColumn === 'created_at' || this.sortColumn === 'updated_at') {
        aVal = this.parseTimestamp(aVal);
        bVal = this.parseTimestamp(bVal);
      }

      // Handle null/undefined
      if (aVal === null || aVal === undefined) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      if (bVal === null || bVal === undefined) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }

      // Compare values
      let cmp;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return this.sortDirection === 'asc' ? cmp : -cmp;
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
      action: 'showDetail',
      view: 'contexts',
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
    if (key.name === 'enter' || key.name === 'return') {
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
    if (context.state_data && typeof context.state_data === 'object') {
      const stateFields = Object.entries(context.state_data).map(([k, v]) => ({
        label: k,
        value: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v),
      }));

      if (stateFields.length > 0) {
        sections.push({
          title: 'State Data',
          fields: stateFields,
        });
      }
    } else if (context.state_data) {
      // Handle non-object state_data
      sections.push({
        title: 'State Data',
        fields: [
          {label: 'Data', value: String(context.state_data)},
        ],
      });
    }

    // Add recently updated indicator
    if (this.isRecentlyUpdated(context)) {
      sections.push({
        title: 'Status',
        fields: [
          {label: 'Info', value: 'Recently updated'},
        ],
      });
    }

    return {
      title: `Context: ${context.name || context.context_id || 'Unknown'}`,
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
      counts[type] = 0;
    }

    // Count contexts by type
    for (const context of this.filteredData) {
      const type = (context.context_type || 'unknown').toLowerCase();
      if (counts[type] !== undefined) {
        counts[type]++;
      } else {
        counts[type] = 1;
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
