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
import {
  SQL_QUERY_VIEW_COMPATIBILITY_METHODS,
} from './sql-query-view-compatibility-methods.js';
import {SQL_QUERY_VIEW_LIVE_METHODS} from './sql-query-view-live-methods.js';

const LOCAL_STR_SELECT = 'select';
const LOCAL_STR_INSERT = 'insert';
const LOCAL_STR_UPDATE = 'update';
const LOCAL_STR_DELETE = 'delete';
const LOCAL_STR_LIVE_SELECT = 'live_select';
const LOCAL_STR_OTHER = 'other';
const LOCAL_STR_ACTIVE = 'active';
const LOCAL_STR_PAUSED = 'paused';
const LOCAL_STR_EXPIRED = 'expired';
const LOCAL_STR_CANCELLED = 'cancelled';
const LOCAL_NUM_ONE_HUNDRED = 100;
const LOCAL_STR_LIVEQUERY_INITIALIZED = 'livequery:initialized';
const LOCAL_STR_LIVEQUERY_EVENT = 'livequery:event';
const LOCAL_STR_LIVEQUERY_EXPIRED = 'livequery:expired';
const LOCAL_STR_LIVEQUERY_PAUSED = 'livequery:paused';
const LOCAL_STR_LIVEQUERY_RESUMED = 'livequery:resumed';
const LOCAL_STR_READ_ONLY_MODE_ONLY_SELECT_QUERIES_ARE_A = 'Read-only mode: Only SELECT queries are allowed';
const LOCAL_STR_READ_ONLY_VIOLATION = 'READ_ONLY_VIOLATION';
const LOCAL_STR_QUERY_REJECTED = 'query:rejected';
const LOCAL_STR_READ_ONLY = 'read_only';
const LOCAL_STR_QUERY_CANCELLED = 'query:cancelled';
const LOCAL_STR_DANGEROUS = 'dangerous';
const LOCAL_STR_NO_CONNECTION_TO_DATABASE = 'No connection to database';
const LOCAL_STR_QUERY_EXECUTED = 'query:executed';
const LOCAL_STR_LIVE_QUERY_SUPPORT_IS_NOT_AVAILABLE = 'Live query support is not available';
const LOCAL_STR_LIVE_QUERY_UNAVAILABLE = 'LIVE_QUERY_UNAVAILABLE';
const LOCAL_STR_LIVEQUERY_STARTED = 'livequery:started';
const LOCAL_STR_LIVE_QUERY_ERROR = 'LIVE_QUERY_ERROR';
const LOCAL_STR_QUERY_ERROR = 'query:error';
const LOCAL_STR_QUERY_SUCCESS = 'query:success';
const LOCAL_STR_CONFIRMATION_REQUEST = 'confirmation:request';
const LOCAL_STR_READONLYMODE_CHANGED = 'readonlymode:changed';
const LOCAL_STR_C_ENTER = 'C-enter';
const LOCAL_STR_ENTER = 'enter';
const LOCAL_STR_C_P = 'C-p';
const LOCAL_STR_P = 'p';
const LOCAL_STR_C_C = 'C-c';
const LOCAL_STR_C = 'c';
const LOCAL_STR_VIEW_SHOWN = 'view:shown';
const LOCAL_STR_VIEW_HIDDEN = 'view:hidden';
const LOCAL_STR_LIVE_QUERY = 'Live Query';
const LOCAL_STR_SUBSCRIPTION_ID = 'Subscription ID';
const LOCAL_STR_STATUS = 'Status';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_EVENT_RATE = 'Event Rate';
const LOCAL_STR_PENDING_QUERIES = 'Pending Queries';
const LOCAL_STR_COUNT = 'Count';
const LOCAL_STR_SQL_QUERY_VIEW = 'SQL Query View';
const LOCAL_STR_ASC = 'asc';

/**
 * Query types for classification
 */
export const QUERY_TYPE = {
  SELECT: LOCAL_STR_SELECT,
  INSERT: LOCAL_STR_INSERT,
  UPDATE: LOCAL_STR_UPDATE,
  DELETE: LOCAL_STR_DELETE,
  LIVE_SELECT: LOCAL_STR_LIVE_SELECT,
  OTHER: LOCAL_STR_OTHER,
};

/**
 * Live query subscription status
 */
export const LIVE_QUERY_STATUS = {
  ACTIVE: LOCAL_STR_ACTIVE,
  PAUSED: LOCAL_STR_PAUSED,
  EXPIRED: LOCAL_STR_EXPIRED,
  CANCELLED: LOCAL_STR_CANCELLED,
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
      maxEntries: LOCAL_NUM_ONE_HUNDRED,
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
      this.eventBus.on(LOCAL_STR_LIVEQUERY_INITIALIZED, (data) =>
        this.handleLiveQueryInitialized(data));
      this.eventBus.on(LOCAL_STR_LIVEQUERY_EVENT, (data) =>
        this.handleLiveQueryStreamEvent(data));
      this.eventBus.on(LOCAL_STR_LIVEQUERY_EXPIRED, (data) =>
        this.handleLiveQueryExpired(data));
      this.eventBus.on(LOCAL_STR_LIVEQUERY_PAUSED, (data) =>
        this.handleLiveQueryPaused(data));
      this.eventBus.on(LOCAL_STR_LIVEQUERY_RESUMED, (data) =>
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
        message: LOCAL_STR_READ_ONLY_MODE_ONLY_SELECT_QUERIES_ARE_A,
        code: LOCAL_STR_READ_ONLY_VIOLATION,
      });
      this.emitEvent(LOCAL_STR_QUERY_REJECTED, {sql, reason: LOCAL_STR_READ_ONLY});
      return false;
    }

    // Check for dangerous queries
    // Requirements: 10.1, 10.2
    if (this.isDangerousQuery(sql)) {
      const confirmed = await this.requestConfirmation(
        'This query may modify or delete data without a WHERE clause. Continue?',
      );
      if (!confirmed) {
        this.emitEvent(LOCAL_STR_QUERY_CANCELLED, {sql, reason: LOCAL_STR_DANGEROUS});
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
        error: LOCAL_STR_NO_CONNECTION_TO_DATABASE,
      });
    }

    this.emitEvent(LOCAL_STR_QUERY_EXECUTED, {queryId, sql});
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
        message: LOCAL_STR_LIVE_QUERY_SUPPORT_IS_NOT_AVAILABLE,
        code: LOCAL_STR_LIVE_QUERY_UNAVAILABLE,
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

      this.emitEvent(LOCAL_STR_LIVEQUERY_STARTED, {subscriptionId, sql});
      return true;
    } catch (err) {
      this.resultsPanel.displayError({
        message: err.message,
        code: LOCAL_STR_LIVE_QUERY_ERROR,
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
      this.emitEvent(LOCAL_STR_QUERY_ERROR, {queryId, error, executionTime});
    } else if (result) {
      // Determine result type and display appropriately
      if (result.operation) {
        this.resultsPanel.displayWriteResult(result, executionTime);
      } else {
        this.resultsPanel.displaySelectResult(result, executionTime);
      }
      this.emitEvent(LOCAL_STR_QUERY_SUCCESS, {queryId, result, executionTime});
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
      this.emitEvent(LOCAL_STR_CONFIRMATION_REQUEST, {message});

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
    this.emitEvent(LOCAL_STR_READONLYMODE_CHANGED, {enabled});
  }

  /**
   * Toggle read-only mode
   * @return {boolean} New read-only state
   */
  toggleReadOnly() {
    this.readOnlyMode = !this.readOnlyMode;
    this.emitEvent(LOCAL_STR_READONLYMODE_CHANGED, {enabled: this.readOnlyMode});
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
    if (keyName === LOCAL_STR_C_ENTER || (key.ctrl && keyName === LOCAL_STR_ENTER)) {
      this.executeQuery();
      return true;
    }

    // Live query controls
    // Requirements: 32.7 - Pause/Resume with Ctrl+P
    if (keyName === LOCAL_STR_C_P || (key.ctrl && keyName === LOCAL_STR_P)) {
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
    if (keyName === LOCAL_STR_C_C || (key.ctrl && keyName === LOCAL_STR_C)) {
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
    this.emitEvent(LOCAL_STR_VIEW_SHOWN);
  }

  /**
   * Hide the view
   */
  hide() {
    this.visible = false;
    if (this.container) {
      this.container.hide();
    }
    this.emitEvent(LOCAL_STR_VIEW_HIDDEN);
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
      this.emitEvent(LOCAL_STR_QUERY_CANCELLED, {queryId});
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
        title: LOCAL_STR_LIVE_QUERY,
        fields: [
          {label: LOCAL_STR_SUBSCRIPTION_ID, value: this.activeLiveQueryId},
          {label: LOCAL_STR_STATUS, value: this.liveQueryStatus || LOCAL_STR_UNKNOWN},
          {label: LOCAL_STR_EVENT_RATE, value: `${this.getLiveQueryEventRate()}/s`},
        ],
      });
    }

    if (this.pendingQueries.size > 0) {
      sections.push({
        title: LOCAL_STR_PENDING_QUERIES,
        fields: [
          {label: LOCAL_STR_COUNT, value: String(this.pendingQueries.size)},
        ],
      });
    }

    return {
      title: LOCAL_STR_SQL_QUERY_VIEW,
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
      headers: [LOCAL_STR_SQL_QUERY_VIEW],
      rows: [],
      columns: [],
      filter: '',
      sortColumn: null,
      sortDirection: LOCAL_STR_ASC,
      selectedIndex: -1,
      totalCount: 0,
      filteredCount: 0,
    };
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

Object.assign(SQLQueryView.prototype, SQL_QUERY_VIEW_COMPATIBILITY_METHODS);
Object.assign(SQLQueryView.prototype, SQL_QUERY_VIEW_LIVE_METHODS);
