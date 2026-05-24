export const SQL_QUERY_VIEW_COMPATIBILITY_METHODS = {
  /**
   * Set data for the view (no-op for SQL view, required for ViewManager compatibility)
   * @param {Array} _data - Data items (ignored)
   */
  setData(_data) {
    // SQL view doesn't use table data - it has its own query results.
  },

  /**
   * Set filter (no-op for SQL view, required for ViewManager compatibility)
   * @param {string} _pattern - Filter pattern (ignored)
   */
  setFilter(_pattern) {
    // SQL view doesn't support filtering in the same way as table views.
  },

  /**
   * Mark a row as changed (no-op for SQL view)
   * @param {string} _key - Row key (ignored)
   */
  markChanged(_key) {
    // SQL view doesn't track changed rows.
  },

  /**
   * Clear changed row highlighting (no-op for SQL view)
   * @param {string} [_key] - Row key (ignored)
   */
  clearChanged(_key) {
    // SQL view doesn't track changed rows.
  },

  /**
   * Move selection up (no-op for SQL view)
   * @param {number} [_count=1] - Number of rows (ignored)
   */
  selectUp(_count = 1) {
    // SQL view handles its own navigation.
  },

  /**
   * Move selection down (no-op for SQL view)
   * @param {number} [_count=1] - Number of rows (ignored)
   */
  selectDown(_count = 1) {
    // SQL view handles its own navigation.
  },

  /**
   * Select first row (no-op for SQL view)
   */
  selectFirst() {
    // SQL view handles its own navigation.
  },

  /**
   * Select last row (no-op for SQL view)
   */
  selectLast() {
    // SQL view handles its own navigation.
  },
};
