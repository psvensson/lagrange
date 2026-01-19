/**
 * SQLQueryView - Main view for SQL query interface
 *
 * Combines QueryInput, ResultsPanel, QueryHistory, and other components
 * to provide a complete SQL query interface with read-only mode support,
 * dangerous query detection, and live query support.
 *
 * Requirements: 7.1, 7.2, 7.5, 7.13, 7.14, 7.15, 10.1, 10.2, 10.3, 10.4
 * Requirements: 32.1, 32.2, 32.6, 32.8, 32.13, 32.14
 */

import {QueryInput} from './query-input.js';
import {ResultsPanel} from './results-panel.js';
import {QueryHistory} from './query-history.js';
import {TableAutocomplete} from './table-autocomplete.js';
import {SQLSyntaxHighlighter} from './sql-syntax-highlighter.js';
import {LiveStreamPanel} from './live-stream-panel.js';

/**
 * Query types for classification
 */
export const QUERY_TYPE = {
  SELECT: 'select',
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  LIVE_SELECT: 'live_select',
  OTHER: 'other',
};

/**
 * Live query subscription status
 */
export const LIVE_QUERY_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

/**
 * SQLQueryView class for the SQL query interface
 */
export class SQLQueryView {
  /**
   * Creates a new SQLQueryView
   * @param {Object} options - View options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {Object} [options.connectionManager] - Connection manager for queries
   * @param {Object} [options.cache] - Remote cache for table names
   * @param {boolean} [options.readOnlyMode=false] - Enable read-only mode
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('../core/live-query-manager.js').LiveQueryManager} [options.liveQueryManager] -
   *   Live query manager
   */
  constructor(options = {}) {
    this.screen = options.screen || null;
    this.connectionManager = options.connectionManager || null;
    this.cache = options.cache || null;
    this.readOnlyMode = options.readOnlyMode || false;
    this.eventBus = options.eventBus || null;
    this.liveQueryManager = options.liveQueryManager || null;

    // Components
    this.queryInput = null;
    this.resultsPanel = null;
    this.queryHistory = null;
    this.autocomplete = null;
    this.syntaxHighlighter = null;
    this.liveStreamPanel = null;

    // Query state
    this.pendingQueries = new Map();
    this.confirmationCallback = null;

    // Live query state
    // Requirements: 32.1, 32.6
    this.activeLiveQueryId = null;
    this.liveQueryStatus = null;

    // Widget references
    this.container = null;
    this.visible = false;
  }

  /**
   * Initialize the view components
   * Requirements: 7.1, 7.2
   */
  initialize() {
    // Create syntax highlighter
    this.syntaxHighlighter = new SQLSyntaxHighlighter();

    // Create query history
    this.queryHistory = new QueryHistory({
      maxEntries: 100,
      autoLoad: true,
    });

    // Create autocomplete (if cache available)
    if (this.cache) {
      this.autocomplete = new TableAutocomplete(this.cache);
    }

    // Create query input
    this.queryInput = new QueryInput({
      screen: this.screen,
      syntaxHighlighter: this.syntaxHighlighter,
      autocomplete: this.autocomplete,
      history: this.queryHistory,
      eventBus: this.eventBus,
    });

    // Create results panel
    this.resultsPanel = new ResultsPanel({
      screen: this.screen,
      eventBus: this.eventBus,
    });

    // Create live stream panel
    // Requirements: 32.3, 32.4
    this.liveStreamPanel = new LiveStreamPanel({
      screen: this.screen,
      eventBus: this.eventBus,
    });

    // Wire up connection manager events
    if (this.connectionManager) {
      this.connectionManager.onQueryResult = (msg) => this.handleQueryResult(msg);
      this.connectionManager.onLiveQueryEvent = (msg) =>
        this.handleLiveQueryEvent(msg);
    }

    // Wire up live query manager events
    if (this.liveQueryManager && this.eventBus) {
      this.eventBus.on('livequery:initialized', (data) =>
        this.handleLiveQueryInitialized(data));
      this.eventBus.on('livequery:event', (data) =>
        this.handleLiveQueryStreamEvent(data));
      this.eventBus.on('livequery:expired', (data) =>
        this.handleLiveQueryExpired(data));
      this.eventBus.on('livequery:paused', (data) =>
        this.handleLiveQueryPaused(data));
      this.eventBus.on('livequery:resumed', (data) =>
        this.handleLiveQueryResumed(data));
    }
  }

  /**
   * Execute the current query
   * Requirements: 7.5, 10.1, 10.2, 10.3, 10.4, 32.1, 32.2
   * @return {Promise<boolean>} True if query was executed
   */
  async executeQuery() {
    const sql = this.queryInput.getValue();

    if (!sql || !sql.trim()) {
      return false;
    }

    // Check if this is a LIVE SELECT query
    // Requirements: 32.1
    if (this.isLiveSelectQuery(sql)) {
      return this.executeLiveQuery(sql);
    }

    // Check read-only mode
    // Requirements: 10.3, 10.4
    if (this.readOnlyMode && !this.isSelectQuery(sql)) {
      this.resultsPanel.displayError({
        message: 'Read-only mode: Only SELECT queries are allowed',
        code: 'READ_ONLY_VIOLATION',
      });
      this.emitEvent('query:rejected', {sql, reason: 'read_only'});
      return false;
    }

    // Check for dangerous queries
    // Requirements: 10.1, 10.2
    if (this.isDangerousQuery(sql)) {
      const confirmed = await this.requestConfirmation(
        'This query may modify or delete data without a WHERE clause. Continue?',
      );
      if (!confirmed) {
        this.emitEvent('query:cancelled', {sql, reason: 'dangerous'});
        return false;
      }
    }

    // Add to history
    this.queryHistory.add(sql);

    // Generate query ID
    const queryId = this.generateQueryId();
    const startTime = Date.now();

    // Track pending query
    this.pendingQueries.set(queryId, {sql, startTime});

    // Send query via connection manager
    if (this.connectionManager) {
      this.connectionManager.sendQuery(queryId, sql);
    } else {
      // No connection - simulate error
      this.handleQueryResult({
        queryId,
        error: 'No connection to database',
      });
    }

    this.emitEvent('query:executed', {queryId, sql});
    return true;
  }

  /**
   * Execute a LIVE SELECT query
   * Requirements: 32.1, 32.2
   * @param {string} sql - LIVE SELECT statement
   * @return {Promise<boolean>} True if subscription was created
   */
  async executeLiveQuery(sql) {
    if (!this.liveQueryManager) {
      this.resultsPanel.displayError({
        message: 'Live query support is not available',
        code: 'LIVE_QUERY_UNAVAILABLE',
      });
      return false;
    }

    // Cancel any existing live query
    if (this.activeLiveQueryId) {
      this.cancelLiveQuery();
    }

    try {
      // Add to history
      // Requirements: 32.13
      this.queryHistory.add(sql);

      // Subscribe to live query
      const subscriptionId = this.liveQueryManager.subscribe(sql);
      this.activeLiveQueryId = subscriptionId;
      this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;

      // Clear live stream panel
      this.liveStreamPanel.clear();

      this.emitEvent('livequery:started', {subscriptionId, sql});
      return true;
    } catch (err) {
      this.resultsPanel.displayError({
        message: err.message,
        code: 'LIVE_QUERY_ERROR',
      });
      return false;
    }
  }

  /**
   * Handle query result from connection manager
   * @param {Object} message - Result message
   * @param {string} message.queryId - Query ID
   * @param {Object} [message.result] - Query result
   * @param {string} [message.error] - Error message
   */
  handleQueryResult(message) {
    const {queryId, result, error} = message;
    const pending = this.pendingQueries.get(queryId);

    if (!pending) {
      return;
    }

    const executionTime = Date.now() - pending.startTime;
    this.pendingQueries.delete(queryId);

    if (error) {
      this.resultsPanel.displayError({message: error});
      this.emitEvent('query:error', {queryId, error, executionTime});
    } else if (result) {
      // Determine result type and display appropriately
      if (result.operation) {
        this.resultsPanel.displayWriteResult(result, executionTime);
      } else {
        this.resultsPanel.displaySelectResult(result, executionTime);
      }
      this.emitEvent('query:success', {queryId, result, executionTime});
    }
  }

  /**
   * Check if SQL is a SELECT query
   * Requirements: 10.3
   * @param {string} sql - SQL statement
   * @return {boolean} True if SELECT query
   */
  isSelectQuery(sql) {
    const trimmed = sql.trim();
    return /^\s*select\b/i.test(trimmed);
  }

  /**
   * Check if SQL is a LIVE SELECT query
   * Requirements: 32.1
   * @param {string} sql - SQL statement
   * @return {boolean} True if LIVE SELECT query
   */
  isLiveSelectQuery(sql) {
    const trimmed = sql.trim();
    return /^\s*live\s+select\b/i.test(trimmed);
  }

  /**
   * Check if SQL is a write query (INSERT/UPDATE/DELETE)
   * @param {string} sql - SQL statement
   * @return {boolean} True if write query
   */
  isWriteQuery(sql) {
    const trimmed = sql.trim().toLowerCase();
    return /^(insert|update|delete)\b/i.test(trimmed);
  }

  /**
   * Check if SQL is a dangerous query (DELETE/UPDATE without WHERE)
   * Requirements: 10.1
   * @param {string} sql - SQL statement
   * @return {boolean} True if dangerous
   */
  isDangerousQuery(sql) {
    const trimmed = sql.trim();
    const lower = trimmed.toLowerCase();

    // DELETE without WHERE
    if (/^delete\s+from\s+\S+\s*;?\s*$/i.test(trimmed)) {
      return true;
    }

    // UPDATE without WHERE
    if (/^update\b/i.test(trimmed) && !/\bwhere\b/i.test(lower)) {
      return true;
    }

    return false;
  }

  /**
   * Classify the query type
   * @param {string} sql - SQL statement
   * @return {string} Query type from QUERY_TYPE
   */
  classifyQuery(sql) {
    const trimmed = sql.trim().toLowerCase();

    if (/^live\s+select\b/.test(trimmed)) return QUERY_TYPE.LIVE_SELECT;
    if (/^select\b/.test(trimmed)) return QUERY_TYPE.SELECT;
    if (/^insert\b/.test(trimmed)) return QUERY_TYPE.INSERT;
    if (/^update\b/.test(trimmed)) return QUERY_TYPE.UPDATE;
    if (/^delete\b/.test(trimmed)) return QUERY_TYPE.DELETE;

    return QUERY_TYPE.OTHER;
  }

  /**
   * Request user confirmation for dangerous operations
   * Requirements: 10.1
   * @param {string} message - Confirmation message
   * @return {Promise<boolean>} True if confirmed
   */
  async requestConfirmation(message) {
    return new Promise((resolve) => {
      this.confirmationCallback = resolve;
      this.emitEvent('confirmation:request', {message});

      // If no event bus or UI, auto-reject for safety
      if (!this.eventBus) {
        resolve(false);
      }
    });
  }

  /**
   * Handle confirmation response
   * @param {boolean} confirmed - Whether user confirmed
   */
  handleConfirmation(confirmed) {
    if (this.confirmationCallback) {
      this.confirmationCallback(confirmed);
      this.confirmationCallback = null;
    }
  }

  /**
   * Generate a unique query ID
   * @return {string} Query ID
   */
  generateQueryId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `query_${timestamp}_${random}`;
  }

  /**
   * Clear the query input
   */
  clearInput() {
    this.queryInput.clear();
  }

  /**
   * Get the current query text
   * @return {string} Current query
   */
  getQuery() {
    return this.queryInput.getValue();
  }

  /**
   * Set the query text
   * @param {string} sql - Query text
   */
  setQuery(sql) {
    this.queryInput.setValue(sql);
  }

  /**
   * Get read-only mode status
   * Requirements: 10.3
   * @return {boolean} True if read-only
   */
  isReadOnly() {
    return this.readOnlyMode;
  }

  /**
   * Set read-only mode
   * Requirements: 10.3
   * @param {boolean} enabled - Enable read-only mode
   */
  setReadOnly(enabled) {
    this.readOnlyMode = enabled;
    this.emitEvent('readonlymode:changed', {enabled});
  }

  /**
   * Toggle read-only mode
   * @return {boolean} New read-only state
   */
  toggleReadOnly() {
    this.readOnlyMode = !this.readOnlyMode;
    this.emitEvent('readonlymode:changed', {enabled: this.readOnlyMode});
    return this.readOnlyMode;
  }

  /**
   * Handle key input
   * Requirements: 32.7, 32.9
   * @param {Object} key - Key event
   * @return {boolean} True if handled
   */
  handleKey(key) {
    const keyName = key.full || key.name || '';

    // Ctrl+Enter to execute query
    if (keyName === 'C-enter' || (key.ctrl && keyName === 'enter')) {
      this.executeQuery();
      return true;
    }

    // Live query controls
    // Requirements: 32.7 - Pause/Resume with Ctrl+P
    if (keyName === 'C-p' || (key.ctrl && keyName === 'p')) {
      if (this.hasActiveLiveQuery()) {
        if (this.liveQueryStatus === LIVE_QUERY_STATUS.PAUSED) {
          this.resumeLiveQuery();
        } else {
          this.pauseLiveQuery();
        }
        return true;
      }
    }

    // Requirements: 32.9 - Cancel with Ctrl+C (when live query active)
    if (keyName === 'C-c' || (key.ctrl && keyName === 'c')) {
      if (this.hasActiveLiveQuery()) {
        this.cancelLiveQuery();
        return true;
      }
    }

    // Pass to query input
    return this.queryInput.handleKey(key);
  }

  /**
   * Show the view
   */
  show() {
    this.visible = true;
    if (this.container) {
      this.container.show();
    }
    this.emitEvent('view:shown');
  }

  /**
   * Hide the view
   */
  hide() {
    this.visible = false;
    if (this.container) {
      this.container.hide();
    }
    this.emitEvent('view:hidden');
  }

  /**
   * Check if view is visible
   * @return {boolean} True if visible
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Get the query history
   * @return {QueryHistory} Query history instance
   */
  getHistory() {
    return this.queryHistory;
  }

  /**
   * Get the results panel
   * @return {ResultsPanel} Results panel instance
   */
  getResultsPanel() {
    return this.resultsPanel;
  }

  /**
   * Get the query input
   * @return {QueryInput} Query input instance
   */
  getQueryInput() {
    return this.queryInput;
  }

  /**
   * Check if there are pending queries
   * @return {boolean} True if queries pending
   */
  hasPendingQueries() {
    return this.pendingQueries.size > 0;
  }

  /**
   * Get pending query count
   * @return {number} Number of pending queries
   */
  getPendingQueryCount() {
    return this.pendingQueries.size;
  }

  /**
   * Cancel all pending queries
   */
  cancelPendingQueries() {
    for (const [queryId] of this.pendingQueries) {
      this.emitEvent('query:cancelled', {queryId});
    }
    this.pendingQueries.clear();
  }

  /**
   * Emit an event via the event bus
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitEvent(event, data = {}) {
    if (this.eventBus) {
      this.eventBus.emit(`sqlqueryview:${event}`, data);
    }
  }

  /**
   * Set the container widget
   * @param {Object} container - Blessed container widget
   */
  setContainer(container) {
    this.container = container;
  }

  /**
   * Set data for the view (no-op for SQL view, required for ViewManager compatibility)
   * @param {Array} _data - Data items (ignored)
   */
  setData(_data) {
    // SQL view doesn't use table data - it has its own query results
    // This method exists for ViewManager compatibility
  }

  /**
   * Set filter (no-op for SQL view, required for ViewManager compatibility)
   * @param {string} _pattern - Filter pattern (ignored)
   */
  setFilter(_pattern) {
    // SQL view doesn't support filtering in the same way as table views
  }

  /**
   * Mark a row as changed (no-op for SQL view)
   * @param {string} _key - Row key (ignored)
   */
  markChanged(_key) {
    // SQL view doesn't track changed rows
  }

  /**
   * Clear changed row highlighting (no-op for SQL view)
   * @param {string} [_key] - Row key (ignored)
   */
  clearChanged(_key) {
    // SQL view doesn't track changed rows
  }

  /**
   * Move selection up (no-op for SQL view)
   * @param {number} [_count=1] - Number of rows (ignored)
   */
  selectUp(_count = 1) {
    // SQL view handles its own navigation
  }

  /**
   * Move selection down (no-op for SQL view)
   * @param {number} [_count=1] - Number of rows (ignored)
   */
  selectDown(_count = 1) {
    // SQL view handles its own navigation
  }

  /**
   * Select first row (no-op for SQL view)
   */
  selectFirst() {
    // SQL view handles its own navigation
  }

  /**
   * Select last row (no-op for SQL view)
   */
  selectLast() {
    // SQL view handles its own navigation
  }

  /**
   * Get selected details (for detail panel compatibility)
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    // SQL view doesn't have row selection in the same way
    // Return info about current query state instead
    if (!this.activeLiveQueryId && this.pendingQueries.size === 0) {
      return null;
    }

    const sections = [];

    if (this.activeLiveQueryId) {
      sections.push({
        title: 'Live Query',
        fields: [
          {label: 'Subscription ID', value: this.activeLiveQueryId},
          {label: 'Status', value: this.liveQueryStatus || 'unknown'},
          {label: 'Event Rate', value: `${this.getLiveQueryEventRate()}/s`},
        ],
      });
    }

    if (this.pendingQueries.size > 0) {
      sections.push({
        title: 'Pending Queries',
        fields: [
          {label: 'Count', value: String(this.pendingQueries.size)},
        ],
      });
    }

    return {
      title: 'SQL Query View',
      sections,
    };
  }

  /**
   * Render the view
   * @param {Object} [_state] - Navigation state (optional)
   * @return {Object} Render data for ViewManager compatibility
   */
  render(_state) {
    if (this.queryInput) {
      this.queryInput.render();
    }
    if (this.resultsPanel) {
      this.resultsPanel.render();
    }
    if (this.liveStreamPanel) {
      this.liveStreamPanel.render();
    }
    if (this.screen) {
      this.screen.render();
    }

    // Return empty render data for ViewManager compatibility
    // SQL view renders its own UI components
    return {
      headers: ['SQL Query View'],
      rows: [],
      columns: [],
      filter: '',
      sortColumn: null,
      sortDirection: 'asc',
      selectedIndex: -1,
      totalCount: 0,
      filteredCount: 0,
    };
  }

  /**
   * Handle live query event from connection manager
   * @param {Object} message - Live query event message
   */
  handleLiveQueryEvent(message) {
    if (this.liveQueryManager) {
      this.liveQueryManager.handleLiveQueryEvent(message);
    }
  }

  /**
   * Handle live query initialized event
   * Requirements: 32.2, 32.14
   * @param {Object} data - Event data
   */
  handleLiveQueryInitialized(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    // Display initial results
    if (data.data && data.data.length > 0) {
      this.resultsPanel.displaySelectResult({
        results: data.data,
        count: data.data.length,
      }, 0);
    }

    // Update status
    // Requirements: 32.6
    this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;
    this.emitEvent('livequery:initialized', {
      subscriptionId: data.subscriptionId,
      partitions: data.partitions,
    });
  }

  /**
   * Handle live query stream event
   * Requirements: 32.2, 32.3
   * @param {Object} data - Event data
   */
  handleLiveQueryStreamEvent(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    // Add event to live stream panel
    this.liveStreamPanel.addEvent(data.eventType, data.data, data.timestamp);
  }

  /**
   * Handle live query expired event
   * Requirements: 32.8
   * @param {Object} data - Event data
   */
  handleLiveQueryExpired(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveQueryStatus = LIVE_QUERY_STATUS.EXPIRED;
    this.emitEvent('livequery:expired', {subscriptionId: data.subscriptionId});
  }

  /**
   * Handle live query paused event
   * Requirements: 32.7
   * @param {Object} data - Event data
   */
  handleLiveQueryPaused(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveQueryStatus = LIVE_QUERY_STATUS.PAUSED;
    this.emitEvent('livequery:paused', {subscriptionId: data.subscriptionId});
  }

  /**
   * Handle live query resumed event
   * Requirements: 32.7
   * @param {Object} data - Event data
   */
  handleLiveQueryResumed(data) {
    if (data.subscriptionId !== this.activeLiveQueryId) {
      return;
    }

    this.liveQueryStatus = LIVE_QUERY_STATUS.ACTIVE;
    this.emitEvent('livequery:resumed', {subscriptionId: data.subscriptionId});
  }

  /**
   * Pause the active live query
   * Requirements: 32.7
   * @return {boolean} True if paused
   */
  pauseLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    return this.liveQueryManager.pause(this.activeLiveQueryId);
  }

  /**
   * Resume the active live query
   * Requirements: 32.7
   * @return {boolean} True if resumed
   */
  resumeLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    return this.liveQueryManager.resume(this.activeLiveQueryId);
  }

  /**
   * Cancel the active live query
   * Requirements: 32.9
   * @return {boolean} True if cancelled
   */
  cancelLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    const result = this.liveQueryManager.cancel(this.activeLiveQueryId);
    if (result) {
      this.activeLiveQueryId = null;
      this.liveQueryStatus = LIVE_QUERY_STATUS.CANCELLED;
    }
    return result;
  }

  /**
   * Renew an expired live query
   * Requirements: 32.8
   * @return {boolean} True if renewal initiated
   */
  renewLiveQuery() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return false;
    }

    return this.liveQueryManager.renew(this.activeLiveQueryId);
  }

  /**
   * Check if there is an active live query
   * @return {boolean} True if live query is active
   */
  hasActiveLiveQuery() {
    return this.activeLiveQueryId !== null &&
           this.liveQueryStatus === LIVE_QUERY_STATUS.ACTIVE;
  }

  /**
   * Get the active live query subscription ID
   * @return {string|null} Subscription ID or null
   */
  getActiveLiveQueryId() {
    return this.activeLiveQueryId;
  }

  /**
   * Get the live query status
   * Requirements: 32.6
   * @return {string|null} Status or null
   */
  getLiveQueryStatus() {
    return this.liveQueryStatus;
  }

  /**
   * Get the live query event rate
   * Requirements: 32.10
   * @return {number} Events per second
   */
  getLiveQueryEventRate() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return 0;
    }

    const subscription = this.liveQueryManager.getSubscription(
      this.activeLiveQueryId,
    );
    return subscription ? subscription.eventRate : 0;
  }

  /**
   * Get the monitored partitions for the live query
   * Requirements: 32.14
   * @return {string[]} Partition IDs
   */
  getLiveQueryPartitions() {
    if (!this.activeLiveQueryId || !this.liveQueryManager) {
      return [];
    }

    const subscription = this.liveQueryManager.getSubscription(
      this.activeLiveQueryId,
    );
    return subscription ? subscription.partitions : [];
  }

  /**
   * Get the live stream panel
   * @return {LiveStreamPanel} Live stream panel instance
   */
  getLiveStreamPanel() {
    return this.liveStreamPanel;
  }

  /**
   * Destroy the view and clean up resources
   */
  destroy() {
    this.cancelPendingQueries();

    // Cancel any active live query
    if (this.activeLiveQueryId && this.liveQueryManager) {
      this.liveQueryManager.cancel(this.activeLiveQueryId);
      this.activeLiveQueryId = null;
    }

    if (this.queryHistory) {
      this.queryHistory.save();
    }

    this.queryInput = null;
    this.resultsPanel = null;
    this.queryHistory = null;
    this.autocomplete = null;
    this.syntaxHighlighter = null;
    this.liveStreamPanel = null;
    this.connectionManager = null;
    this.liveQueryManager = null;
    this.cache = null;
    this.eventBus = null;
  }
}
