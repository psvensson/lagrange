/**
 * BaseView - Base class for all CLI views with common functionality
 *
 * Provides filtering, sorting, rendering, and row status styling.
 *
 * Requirements: 2.5, 2.6, 17.1, 17.3
 */

/**
 * Row status types for styling
 */
export const ROW_STATUS = {
  NORMAL: 'normal',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Color mappings for row statuses
 * Requirements: 17.1
 */
export const STATUS_COLORS = {
  normal: 'white',
  warning: 'yellow',
  error: 'red',
  changed: 'cyan',
};

/**
 * BaseView class providing common view functionality
 */
export class BaseView {
  /**
   * Creates a new BaseView
   * @param {Object} options - View options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {import('./event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    this.screen = options.screen || null;
    this.eventBus = options.eventBus || null;
    this.options = options;

    // View state
    this.selectedIndex = 0;
    this.filter = '';
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.visible = false;

    // Data
    this.data = [];
    this.filteredData = [];
    this.changedRows = new Set();
  }

  /**
   * Get column definitions for the view
   * Override in subclasses
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [];
  }

  /**
   * Format a data item into a row array
   * Override in subclasses
   * @param {Object} _item - Data item
   * @return {Array<string>} Row values
   */
  formatRow(_item) {
    return [];
  }

  /**
   * Get the row status for styling
   * Override in subclasses
   * @param {Object} _item - Data item
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(_item) {
    return ROW_STATUS.NORMAL;
  }

  /**
   * Get the unique key for a data item
   * Override in subclasses
   * @param {Object} _item - Data item
   * @return {string} Unique key
   */
  getItemKey(_item) {
    return '';
  }

  /**
   * Apply filter to data
   * Requirements: 2.5
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    if (!this.filter || this.filter.trim() === '') {
      return data;
    }

    const lowerFilter = this.filter.toLowerCase();
    return data.filter((item) => {
      // Check if any field contains the filter string
      const values = Object.values(item);
      return values.some((value) => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(lowerFilter);
      });
    });
  }

  /**
   * Apply sort to data
   * Requirements: 2.6
   * @param {Array} data - Data to sort
   * @return {Array} Sorted data
   */
  applySort(data) {
    if (!this.sortColumn) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aVal = a[this.sortColumn];
      const bVal = b[this.sortColumn];

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
   * Set the filter string
   * @param {string} filter - Filter string
   */
  setFilter(filter) {
    this.filter = filter;
    this.selectedIndex = 0;
    this.updateFilteredData();
  }

  /**
   * Clear the filter
   */
  clearFilter() {
    this.filter = '';
    this.selectedIndex = 0;
    this.updateFilteredData();
  }

  /**
   * Set the sort column and direction
   * @param {string} column - Column key to sort by
   * @param {string} [direction] - Sort direction ('asc' or 'desc')
   */
  setSort(column, direction) {
    if (this.sortColumn === column && !direction) {
      // Toggle direction if same column
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = direction || 'asc';
    }
    this.updateFilteredData();
  }

  /**
   * Clear sorting
   */
  clearSort() {
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.updateFilteredData();
  }

  /**
   * Update filtered and sorted data
   */
  updateFilteredData() {
    let result = this.applyFilter(this.data);
    result = this.applySort(result);
    this.filteredData = result;

    // Ensure selected index is valid
    if (this.selectedIndex >= this.filteredData.length) {
      this.selectedIndex = Math.max(0, this.filteredData.length - 1);
    }
  }

  /**
   * Set the view data
   * @param {Array} data - Data items
   */
  setData(data) {
    this.data = data || [];
    this.updateFilteredData();
  }

  /**
   * Mark a row as changed (for highlighting)
   * @param {string} key - Row key
   */
  markChanged(key) {
    this.changedRows.add(key);
  }

  /**
   * Clear changed row highlighting
   * @param {string} [key] - Specific key to clear, or all if not provided
   */
  clearChanged(key) {
    if (key) {
      this.changedRows.delete(key);
    } else {
      this.changedRows.clear();
    }
  }

  /**
   * Check if a row is marked as changed
   * @param {string} key - Row key
   * @return {boolean}
   */
  isChanged(key) {
    return this.changedRows.has(key);
  }

  /**
   * Render the view
   * @param {Object} state - Navigation state
   * @return {Object} Render data with headers and rows
   */
  render(state = {}) {
    const columns = this.getColumns();
    const headers = columns.map((c) => c.label);

    const rows = this.filteredData.map((item, index) => {
      const rowValues = this.formatRow(item);
      const status = this.getRowStatus(item);
      const key = this.getItemKey(item);
      const isChanged = this.isChanged(key);
      const isSelected = index === this.selectedIndex;

      return {
        values: rowValues,
        status,
        isChanged,
        isSelected,
        key,
        item,
      };
    });

    return {
      headers,
      rows,
      columns,
      filter: this.filter,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      selectedIndex: this.selectedIndex,
      totalCount: this.data.length,
      filteredCount: this.filteredData.length,
      state,
    };
  }

  /**
   * Style a row based on status and state
   * Requirements: 17.1, 17.3
   * @param {Array<string>} row - Row values
   * @param {string} status - Row status
   * @param {boolean} isChanged - Whether row is changed
   * @param {boolean} isSelected - Whether row is selected
   * @return {Array<string>} Styled row values
   */
  styleRow(row, status, isChanged, isSelected) {
    let color = STATUS_COLORS[status] || STATUS_COLORS.normal;

    // Changed rows get cyan highlighting
    if (isChanged) {
      color = STATUS_COLORS.changed;
    }

    // Selected row gets inverse styling
    const style = isSelected ? '{inverse}' : `{${color}-fg}`;
    const endStyle = isSelected ? '{/inverse}' : '{/}';

    return row.map((cell) => `${style}${cell}${endStyle}`);
  }

  /**
   * Get the currently selected item
   * @return {Object|null} Selected item or null
   */
  getSelectedItem() {
    if (this.filteredData.length === 0) {
      return null;
    }
    return this.filteredData[this.selectedIndex] || null;
  }

  /**
   * Move selection up
   * @param {number} [count=1] - Number of rows to move
   */
  selectUp(count = 1) {
    this.selectedIndex = Math.max(0, this.selectedIndex - count);
  }

  /**
   * Move selection down
   * @param {number} [count=1] - Number of rows to move
   */
  selectDown(count = 1) {
    this.selectedIndex = Math.min(
      this.filteredData.length - 1,
      this.selectedIndex + count,
    );
  }

  /**
   * Select first row
   */
  selectFirst() {
    this.selectedIndex = 0;
  }

  /**
   * Select last row
   */
  selectLast() {
    this.selectedIndex = Math.max(0, this.filteredData.length - 1);
  }

  /**
   * Show the view
   */
  show() {
    this.visible = true;
    if (this.eventBus) {
      this.eventBus.emit('view:show', {view: this});
    }
  }

  /**
   * Hide the view
   */
  hide() {
    this.visible = false;
    if (this.eventBus) {
      this.eventBus.emit('view:hide', {view: this});
    }
  }

  /**
   * Check if view is visible
   * @return {boolean}
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Handle key input
   * Override in subclasses for custom key handling
   * @param {Object} _key - Key event
   * @return {boolean} True if key was handled
   */
  handleKey(_key) {
    return false;
  }

  /**
   * Refresh the view
   */
  refresh() {
    this.updateFilteredData();
    if (this.eventBus) {
      this.eventBus.emit('view:refresh', {view: this});
    }
  }
}
