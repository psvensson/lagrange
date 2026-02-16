/**
 * LogsView - Displays system logs with filtering and highlighting
 *
 * Streams logs via LIVE SELECT from the owning partition (logs is a
 * non-propagated table, so it is never in the SystemTableCache).
 * When filters change, the view re-subscribes with an updated
 * server-side WHERE clause.
 *
 * Columns: timestamp, level, node_id, service_id, message
 * Supports multi-criteria filtering, level-based highlighting, and sorting.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8,
 *               29.9, 29.11, 29.12
 */

import {BaseView, ROW_STATUS} from '../core/base-view.js';

/**
 * Log levels in order of severity
 */
export const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

/**
 * Color mappings for log levels
 * Requirements: 29.8
 */
export const LOG_LEVEL_COLORS = {
  ERROR: 'red',
  WARN: 'yellow',
  INFO: 'white',
  DEBUG: 'gray',
  TRACE: 'gray',
};

const LOGS_QUERY_LIMIT = 200;
const LOGS_TABLE = 'logs';
const LOGS_QUERY_ORDER_BY = 'timestamp DESC, created_at DESC, log_id DESC';
const LOGS_QUERY_SELECT_ALL = 'SELECT *';
const LOGS_QUERY_LIVE_PREFIX = 'LIVE ';
const LOGS_QUERY_WHERE = ' WHERE ';
const LOGS_QUERY_AND = ' AND ';
const LOGS_QUERY_EQUAL = ' = ';
const LOGS_QUERY_GTE = ' >= ';
const LOGS_QUERY_LTE = ' <= ';
const LOGS_QUERY_LIKE = ' LIKE ';
const LOGS_QUERY_LIMIT_CLAUSE = ` LIMIT ${LOGS_QUERY_LIMIT}`;
const LOGS_QUERY_ORDER_BY_CLAUSE = ` ORDER BY ${LOGS_QUERY_ORDER_BY}`;
const LOGS_QUERY_ERROR_ID = 'logs_error';
const LOGS_HIGHLIGHT_MAX_CHANGED_ROWS = 24;
const LOGS_SYSTEM_NODE_ID = 'system';
const LOGS_SYSTEM_SERVICE_ID = 'admin-cli';
const LOGS_QUERY_ERROR_PREFIX = 'Live query error: ';
const LOGS_LIVE_QUERY_UNAVAILABLE_ERROR =
  `${LOGS_QUERY_ERROR_PREFIX}Live query manager not available`;
const LOGS_TIMESTAMP_UNAVAILABLE = 'N/A';
const LOGS_TIMESTAMP_INTEGER_REGEX = /^-?\d+$/;
const LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS = 10000000000;
const LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND = 1000;
const LOGS_SORT_FALLBACK_ID_FIELD = 'log_id';
const LOGS_SINCE_RESET_VALUE = 'now';
const LOGS_SINCE_INVALID_VALUE_PREFIX = 'Invalid since value: ';
const LOGS_SINCE_RELATIVE_REGEX = /^-(\d+)(ms|s|m|h|d)$/i;
const LOGS_RELATIVE_UNIT_MILLISECONDS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};
const LOGS_EVENT_TYPE_SNAPSHOT = 'SNAPSHOT';
const LOGS_EVENT_TYPE_INSERT = 'INSERT';
const LOGS_EVENT_TYPE_UPDATE = 'UPDATE';
const LOGS_EVENT_TYPE_DELETE = 'DELETE';

/**
 * LogsView displays system logs with filtering and highlighting
 */
export class LogsView extends BaseView {
  /**
   * Creates a new LogsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   * @param {import('../core/connection-manager.js').ConnectionManager}
   *   [options.connectionManager] - Connection manager for SQL queries
   * @param {boolean} [options.liveQueryEnabled=false] - Enable live query
   *   subscription for logs view.
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.connectionManager = options.connectionManager || null;
    this.liveQueryManager = options.liveQueryManager || null;
    this.liveQueryEnabled = options.liveQueryEnabled === true;
    this.viewName = 'logs';

    // Multi-criteria filter state
    this.levelFilter = null;
    this.nodeFilter = null;
    this.serviceFilter = null;
    this.startTimeFilter = null;
    this.endTimeFilter = null;
    this.messageFilter = null;

    // Default sort by timestamp descending (most recent first)
    this.sortColumn = 'timestamp';
    this.sortDirection = 'desc';

    // Streaming state (kept for API compat; actual streaming
    // is driven by live query events)
    this.streamingEnabled = true;
    this.changedLogIdQueue = [];

    // Live query subscription tracking
    this.activeSubscriptionId = null;
    this.activeLiveQuerySql = null;
    this.viewEnteredAt = null;
    this.internalSetDataInProgress = false;

    // Wire up live query event listeners
    this.setupLiveQueryListeners();
  }

  /**
   * Show the logs view and start a fresh live window from entry time.
   */
  show() {
    super.show();

    if (this.liveQueryEnabled !== true) {
      return;
    }

    this.viewEnteredAt = Date.now();
    this.startTimeFilter = this.viewEnteredAt;
    this.endTimeFilter = null;
    this.clearChangedLogHighlights();
    this.replaceData([]);
    this.fetchLogs();
  }

  /**
   * Hide the logs view and stop any active live query subscription.
   */
  hide() {
    this.cancelActiveLiveQuerySubscription();
    super.hide();
  }

  /**
   * Listen for live query events (initial snapshot and incremental CDC).
   * @private
   */
  setupLiveQueryListeners() {
    if (!this.eventBus) {
      return;
    }

    this.eventBus.on('livequery:initialized', (event) => {
      if (!this.activeSubscriptionId) {
        return;
      }
      if (event.subscriptionId !== this.activeSubscriptionId) {
        return;
      }
      const rows = Array.isArray(event.data) ? event.data : [];
      this.applySnapshotRows(rows);
      this.eventBus.emit('view:refresh', {view: this});
    });

    this.eventBus.on('livequery:event', (event) => {
      if (!this.activeSubscriptionId) {
        return;
      }
      if (event.subscriptionId !== this.activeSubscriptionId) {
        return;
      }
      const eventType = (event.eventType || '').toUpperCase();
      if (eventType === LOGS_EVENT_TYPE_SNAPSHOT && Array.isArray(event.data)) {
        this.applySnapshotRows(event.data);
        this.eventBus.emit('view:refresh', {view: this});
        return;
      }

      if ((eventType === LOGS_EVENT_TYPE_INSERT ||
        eventType === LOGS_EVENT_TYPE_UPDATE) &&
        event.data) {
        const selectedLogId = this.getSelectedItem()?.log_id || null;
        const incomingLog = {...event.data};
        const incomingLogId = this.getItemKey(incomingLog);

        let replaced = false;
        if (incomingLogId) {
          const existingIndex = this.data.findIndex((log) =>
            this.getItemKey(log) === incomingLogId,
          );
          if (existingIndex >= 0) {
            this.data[existingIndex] = incomingLog;
            replaced = true;
          }
        }
        if (!replaced) {
          this.data.push(incomingLog);
        }

        this.updateFilteredData();
        this.restoreSelectionByLogId(selectedLogId);
        if (incomingLogId) {
          this.markLogAsChanged(incomingLogId);
        }
        this.eventBus.emit('view:refresh', {view: this});
        return;
      }

      if (eventType === LOGS_EVENT_TYPE_DELETE) {
        const deletedLog = event.data || event.oldData || null;
        const deletedLogId = this.getItemKey(deletedLog || {});
        if (!deletedLogId) {
          return;
        }
        const selectedLogId = this.getSelectedItem()?.log_id || null;
        const previousLength = this.data.length;
        this.data = this.data.filter((log) => this.getItemKey(log) !== deletedLogId);
        if (this.data.length !== previousLength) {
          this.updateFilteredData();
          this.restoreSelectionByLogId(selectedLogId);
          this.eventBus.emit('view:refresh', {view: this});
        }
      }
    });
  }

  /**
   * Build a LIVE SELECT SQL string for the logs table using
   * current filters. Used when a liveQueryManager is available.
   * @return {string} LIVE SELECT SQL string.
   */
  buildLiveLogsQuery() {
    const conditions = this.buildLiveLogsWhereConditions();
    let sql = `${LOGS_QUERY_LIVE_PREFIX}${LOGS_QUERY_SELECT_ALL} FROM ${LOGS_TABLE}`;
    if (conditions.length > 0) {
      sql += `${LOGS_QUERY_WHERE}${conditions.join(LOGS_QUERY_AND)}`;
    }
    sql += LOGS_QUERY_ORDER_BY_CLAUSE;
    sql += LOGS_QUERY_LIMIT_CLAUSE;
    return sql;
  }

  /**
   * Build SQL WHERE conditions for live query using SQL literals.
   * @return {Array<string>} SQL condition strings.
   * @private
   */
  buildLiveLogsWhereConditions() {
    const conditions = [];

    if (this.levelFilter) {
      conditions.push(
        `level${LOGS_QUERY_EQUAL}${this.quoteSqlLiteral(this.levelFilter.toUpperCase())}`,
      );
    }
    if (this.nodeFilter) {
      conditions.push(
        `node_id${LOGS_QUERY_EQUAL}${this.quoteSqlLiteral(this.nodeFilter)}`,
      );
    }
    if (this.serviceFilter) {
      conditions.push(
        `service_id${LOGS_QUERY_EQUAL}${this.quoteSqlLiteral(this.serviceFilter)}`,
      );
    }
    if (this.startTimeFilter !== null) {
      conditions.push(
        `timestamp${LOGS_QUERY_GTE}${this.quoteSqlLiteral(this.startTimeFilter)}`,
      );
    }
    if (this.endTimeFilter !== null) {
      conditions.push(
        `timestamp${LOGS_QUERY_LTE}${this.quoteSqlLiteral(this.endTimeFilter)}`,
      );
    }
    if (this.messageFilter) {
      conditions.push(
        `message${LOGS_QUERY_LIKE}${this.quoteSqlLiteral(`%${this.messageFilter}%`)}`,
      );
    }

    return conditions;
  }

  /**
   * Convert a JS value to a SQL literal.
   * @param {string|number|boolean|null} value - Value to quote.
   * @return {string} SQL literal string.
   * @private
   */
  quoteSqlLiteral(value) {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(Math.trunc(value));
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    return `'${String(value).replace(/'/g, '\'\'')}'`;
  }

  /**
   * Build a SQL query for the logs table using current filters.
   * Filters are applied server-side so only matching rows are
   * transferred.
   * @return {{sql: string, params: Array}} SQL and positional params.
   */
  buildLogsQuery() {
    const conditions = [];
    const params = [];

    if (this.levelFilter) {
      params.push(this.levelFilter.toUpperCase());
      conditions.push(`level = ?${params.length}`);
    }
    if (this.nodeFilter) {
      params.push(this.nodeFilter);
      conditions.push(`node_id = ?${params.length}`);
    }
    if (this.serviceFilter) {
      params.push(this.serviceFilter);
      conditions.push(`service_id = ?${params.length}`);
    }
    if (this.startTimeFilter !== null) {
      params.push(this.startTimeFilter);
      conditions.push(`timestamp >= ?${params.length}`);
    }
    if (this.endTimeFilter !== null) {
      params.push(this.endTimeFilter);
      conditions.push(`timestamp <= ?${params.length}`);
    }
    if (this.messageFilter) {
      params.push(`%${this.messageFilter}%`);
      conditions.push(`message LIKE ?${params.length}`);
    }

    let sql = `SELECT * FROM ${LOGS_TABLE}`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY ${LOGS_QUERY_ORDER_BY} LIMIT ${LOGS_QUERY_LIMIT}`;

    return {sql, params};
  }

  /**
   * Apply one snapshot batch and keep selection anchored by log_id.
   * Highlights rows that are newly present compared to prior snapshot data.
   * @param {Array<Object>} rows - Snapshot rows.
   * @private
   */
  applySnapshotRows(rows) {
    const snapshotRows = Array.isArray(rows) ? rows : [];
    const selectedLogId = this.getSelectedItem()?.log_id || null;
    const previousLogIds = new Set(
      this.data
        .map((log) => this.getItemKey(log))
        .filter((logId) => Boolean(logId)),
    );

    this.replaceData(snapshotRows);
    this.restoreSelectionByLogId(selectedLogId);
    this.clearChangedLogHighlights();

    if (previousLogIds.size === 0) {
      return;
    }

    for (const log of snapshotRows) {
      const logId = this.getItemKey(log);
      if (!logId || previousLogIds.has(logId)) {
        continue;
      }
      this.markLogAsChanged(logId);
    }
  }

  /**
   * Restore selected row by stable log id after data refresh.
   * @param {string|null} logId - Previously selected log id.
   * @private
   */
  restoreSelectionByLogId(logId) {
    if (!logId) {
      return;
    }
    const index = this.filteredData.findIndex((log) => this.getItemKey(log) === logId);
    if (index >= 0) {
      this.selectedIndex = index;
    }
  }

  /**
   * Clear all changed-row highlights tracked by this view.
   * @private
   */
  clearChangedLogHighlights() {
    this.clearChanged();
    this.changedLogIdQueue = [];
  }

  /**
   * Mark one log id as changed and keep highlight queue bounded.
   * @param {string} logId - Log row id.
   * @private
   */
  markLogAsChanged(logId) {
    if (!logId || this.changedRows.has(logId)) {
      return;
    }

    this.markChanged(logId);
    this.changedLogIdQueue.push(logId);

    if (this.changedLogIdQueue.length <= LOGS_HIGHLIGHT_MAX_CHANGED_ROWS) {
      return;
    }

    const staleLogId = this.changedLogIdQueue.shift();
    if (staleLogId) {
      this.clearChanged(staleLogId);
    }
  }

  /**
   * Ensure an active LIVE SELECT subscription for current log filters.
   * The logs view uses live query streaming as its source of truth.
   */
  fetchLogs() {
    if (this.liveQueryEnabled !== true) {
      this.updateFilteredData();
      return;
    }

    if (!this.liveQueryManager || !this.streamingEnabled) {
      this.cancelActiveLiveQuerySubscription();
      this.applyQueryError(LOGS_LIVE_QUERY_UNAVAILABLE_ERROR);
      return;
    }

    const desiredLiveSql = this.buildLiveLogsQuery();

    if (this.activeSubscriptionId) {
      const activeSqlMismatch = desiredLiveSql !== this.activeLiveQuerySql;
      if (activeSqlMismatch) {
        this.cancelActiveLiveQuerySubscription();
      }
    }

    if (!this.activeSubscriptionId) {
      this.activeSubscriptionId = this.liveQueryManager.subscribe(desiredLiveSql);
      this.activeLiveQuerySql = desiredLiveSql;
    }
  }

  /**
   * Apply a query error as an ERROR row and notify listeners.
   * @param {string} message - Error message.
   * @private
   */
  applyQueryError(message) {
    this.replaceData([{
      log_id: LOGS_QUERY_ERROR_ID,
      timestamp: Date.now(),
      level: 'ERROR',
      node_id: LOGS_SYSTEM_NODE_ID,
      service_id: LOGS_SYSTEM_SERVICE_ID,
      message,
    }]);
    if (this.eventBus) {
      this.eventBus.emit('view:refresh', {view: this});
    }
  }

  /**
   * Set data for the view.
   * In live-query mode, data can only be replaced by internal live-query paths.
   * @param {Array} data - Data items.
   */
  setData(data) {
    if (this.liveQueryEnabled === true && this.internalSetDataInProgress !== true) {
      return;
    }
    super.setData(data);
  }

  /**
   * Replace view data from internal live-query handlers.
   * @param {Array} data - Data items.
   * @private
   */
  replaceData(data) {
    this.internalSetDataInProgress = true;
    try {
      super.setData(data);
    } finally {
      this.internalSetDataInProgress = false;
    }
  }

  /**
   * Enable or disable real-time log streaming
   * Requirements: 29.9
   * @param {boolean} enabled - Whether streaming is enabled
   */
  setStreamingEnabled(enabled) {
    this.streamingEnabled = enabled;
    if (!enabled) {
      this.cancelActiveLiveQuerySubscription();
      return;
    }
    this.fetchLogs();
  }

  /**
   * Disable live query mode and clear active subscription state.
   */
  disableLiveQuerySupport() {
    this.cancelActiveLiveQuerySubscription();
    this.liveQueryEnabled = false;
  }

  /**
   * Set logs live window start time and refresh live subscription.
   * Supports epoch values, ISO strings, `now`, and relative strings
   * like `-30s`, `-5m`, `-2h`, `-1d`.
   * @param {string|number|null|undefined} value - Start time value.
   * @return {number} Resolved epoch milliseconds start time.
   */
  setLiveWindowStartTime(value) {
    const resolvedStartTime = this.resolveLiveWindowStartTime(value);
    this.startTimeFilter = resolvedStartTime;
    this.endTimeFilter = null;
    this.fetchLogs();
    return resolvedStartTime;
  }

  /**
   * Resolve live window start time from user-supplied value.
   * @param {string|number|null|undefined} value - User input.
   * @return {number} Epoch milliseconds.
   * @throws {Error} When value is invalid.
   * @private
   */
  resolveLiveWindowStartTime(value) {
    const now = Date.now();
    if (value === null || value === undefined) {
      return now;
    }

    if (typeof value === 'number') {
      const normalized = this.normalizeNumericTimestamp(value);
      if (normalized === null) {
        throw new Error(`${LOGS_SINCE_INVALID_VALUE_PREFIX}${String(value)}`);
      }
      return normalized;
    }

    const trimmedValue = String(value).trim();
    if (trimmedValue === '' || trimmedValue.toLowerCase() === LOGS_SINCE_RESET_VALUE) {
      return now;
    }

    const relativeMatch = trimmedValue.match(LOGS_SINCE_RELATIVE_REGEX);
    if (relativeMatch) {
      const amount = Number(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const unitMs = LOGS_RELATIVE_UNIT_MILLISECONDS[unit];
      if (Number.isFinite(amount) && amount >= 0 && Number.isFinite(unitMs)) {
        return now - (amount * unitMs);
      }
    }

    const parsedTimestamp = this.parseTimestamp(trimmedValue);
    if (parsedTimestamp !== null) {
      return parsedTimestamp;
    }

    throw new Error(`${LOGS_SINCE_INVALID_VALUE_PREFIX}${trimmedValue}`);
  }

  /**
   * Cancel active live query subscription, if any.
   * @private
   */
  cancelActiveLiveQuerySubscription() {
    if (this.activeSubscriptionId && this.liveQueryManager) {
      this.liveQueryManager.cancel(this.activeSubscriptionId);
    }
    this.activeSubscriptionId = null;
    this.activeLiveQuerySql = null;
  }

  /**
   * Check if streaming is enabled
   * @return {boolean}
   */
  isStreamingEnabled() {
    return this.streamingEnabled;
  }

  /**
   * Get column definitions for the logs view
   * Requirements: 29.1
   * @return {Array<{key: string, label: string, width?: number}>}
   */
  getColumns() {
    return [
      {key: 'timestamp', label: 'Timestamp', width: 24},
      {key: 'level', label: 'Level', width: 8},
      {key: 'node_id', label: 'Node ID', width: 15},
      {key: 'service_id', label: 'Service ID', width: 20},
      {key: 'message', label: 'Message', width: 60},
    ];
  }

  /**
   * Format a log record into a row array
   * Requirements: 29.1
   * @param {Object} log - Log record
   * @return {Array<string>} Row values
   */
  formatRow(log) {
    return [
      this.formatTimestamp(this.getLogTimestampMs(log)),
      log.level || 'INFO',
      log.node_id || 'N/A',
      log.service_id || 'N/A',
      this.truncateMessage(log.message),
    ];
  }

  /**
   * Format timestamp for display
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {string} Formatted timestamp
   */
  formatTimestamp(timestamp) {
    const normalizedTimestamp = this.parseTimestamp(timestamp);
    if (normalizedTimestamp === null) {
      return LOGS_TIMESTAMP_UNAVAILABLE;
    }

    const date = new Date(normalizedTimestamp);
    if (isNaN(date.getTime())) {
      return LOGS_TIMESTAMP_UNAVAILABLE;
    }
    return date.toISOString().replace('T', ' ').substring(0, 23);
  }

  /**
   * Truncate message for display in table
   * @param {string|null|undefined} message - Log message
   * @param {number} maxLength - Maximum length
   * @return {string} Truncated message
   */
  truncateMessage(message, maxLength = 80) {
    if (!message) {
      return '';
    }
    // Replace newlines with spaces for table display
    const singleLine = String(message).replace(/[\r\n]+/g, ' ');
    if (singleLine.length <= maxLength) {
      return singleLine;
    }
    return singleLine.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get the row status for styling based on log level
   * Requirements: 29.8
   * @param {Object} log - Log record
   * @return {string} Row status (normal, warning, error)
   */
  getRowStatus(log) {
    const level = (log.level || 'INFO').toUpperCase();

    if (level === 'ERROR') {
      return ROW_STATUS.ERROR;
    }

    if (level === 'WARN') {
      return ROW_STATUS.WARNING;
    }

    return ROW_STATUS.NORMAL;
  }

  /**
   * Get the color for a log level
   * Requirements: 29.8
   * @param {string} level - Log level
   * @return {string} Color name
   */
  getLevelColor(level) {
    const normalizedLevel = (level || 'INFO').toUpperCase();
    return LOG_LEVEL_COLORS[normalizedLevel] || LOG_LEVEL_COLORS.INFO;
  }

  /**
   * Get the unique key for a log entry
   * @param {Object} log - Log record
   * @return {string} Unique key (log_id)
   */
  getItemKey(log) {
    return log.log_id || '';
  }

  /**
   * Set level filter
   * Requirements: 29.2
   * @param {string|null} level - Log level to filter by
   */
  setLevelFilter(level) {
    this.levelFilter = level;
    this.fetchLogs();
  }

  /**
   * Set node filter
   * Requirements: 29.3
   * @param {string|null} nodeId - Node ID to filter by
   */
  setNodeFilter(nodeId) {
    this.nodeFilter = nodeId;
    this.fetchLogs();
  }

  /**
   * Set service filter
   * Requirements: 29.4
   * @param {string|null} serviceId - Service ID to filter by
   */
  setServiceFilter(serviceId) {
    this.serviceFilter = serviceId;
    this.fetchLogs();
  }

  /**
   * Set time range filter
   * Requirements: 29.5
   * @param {number|null} startTime - Start timestamp
   * @param {number|null} endTime - End timestamp
   */
  setTimeRangeFilter(startTime, endTime) {
    this.startTimeFilter = startTime;
    this.endTimeFilter = endTime;
    this.fetchLogs();
  }

  /**
   * Set message content filter
   * Requirements: 29.6
   * @param {string|null} pattern - Message pattern to filter by
   */
  setMessageFilter(pattern) {
    this.messageFilter = pattern;
    this.fetchLogs();
  }

  /**
   * Clear all filters
   */
  clearAllFilters() {
    this.levelFilter = null;
    this.nodeFilter = null;
    this.serviceFilter = null;
    this.startTimeFilter = null;
    this.endTimeFilter = null;
    this.messageFilter = null;
    this.filter = '';
    this.fetchLogs();
  }

  /**
   * Apply all filters to data.
   * When connected, server-side SQL handles the primary filters.
   * Client-side filtering is used as fallback (no connection) and
   * for the general text filter from the base class.
   * Requirements: 29.2, 29.3, 29.4, 29.5, 29.6
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    let result = data;

    // Apply structured filters client-side (fallback when offline
    // or for data already loaded via setData in tests).
    if (this.levelFilter) {
      result = result.filter((log) =>
        (log.level || 'INFO').toUpperCase() ===
          this.levelFilter.toUpperCase(),
      );
    }
    if (this.nodeFilter) {
      result = result.filter((log) =>
        log.node_id === this.nodeFilter,
      );
    }
    if (this.serviceFilter) {
      result = result.filter((log) =>
        log.service_id === this.serviceFilter,
      );
    }
    if (this.startTimeFilter !== null) {
      result = result.filter((log) => {
        const ts = this.getLogTimestampMs(log);
        return ts !== null && ts >= this.startTimeFilter;
      });
    }
    if (this.endTimeFilter !== null) {
      result = result.filter((log) => {
        const ts = this.getLogTimestampMs(log);
        return ts !== null && ts <= this.endTimeFilter;
      });
    }
    if (this.messageFilter) {
      const pattern = new RegExp(
        this.escapeRegex(this.messageFilter), 'i',
      );
      result = result.filter((log) =>
        pattern.test(log.message || ''),
      );
    }

    // Apply general text filter from base class
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
   * Parse timestamp to numeric value
   * @param {number|string|null|undefined} timestamp - Timestamp value
   * @return {number|null} Numeric timestamp or null
   */
  parseTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) {
      return null;
    }

    if (typeof timestamp === 'number') {
      return this.normalizeNumericTimestamp(timestamp);
    }
    if (typeof timestamp === 'string') {
      const trimmedTimestamp = timestamp.trim();
      if (trimmedTimestamp === '') {
        return null;
      }
      if (LOGS_TIMESTAMP_INTEGER_REGEX.test(trimmedTimestamp)) {
        return this.normalizeNumericTimestamp(Number(trimmedTimestamp));
      }
      const parsed = Date.parse(trimmedTimestamp);
      return isNaN(parsed) ? null : parsed;
    }
    if (timestamp instanceof Date) {
      const parsed = timestamp.getTime();
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  /**
   * Normalize a numeric timestamp to epoch milliseconds.
   * @param {number} timestamp - Numeric timestamp in seconds or milliseconds.
   * @return {number|null} Epoch milliseconds or null when invalid.
   * @private
   */
  normalizeNumericTimestamp(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return null;
    }
    if (Math.abs(timestamp) <= LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS) {
      return Math.trunc(timestamp * LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND);
    }
    return Math.trunc(timestamp);
  }

  /**
   * Resolve the best available log timestamp in epoch milliseconds.
   * Uses `timestamp` first, then `created_at` as fallback.
   * @param {Object} log - Log record.
   * @return {number|null} Epoch milliseconds timestamp.
   * @private
   */
  getLogTimestampMs(log) {
    const logTimestamp = this.parseTimestamp(log?.timestamp);
    if (logTimestamp !== null) {
      return logTimestamp;
    }
    return this.parseTimestamp(log?.created_at);
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
   * Requirements: 29.12
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
      if (this.sortColumn === 'timestamp') {
        aVal = this.getLogTimestampMs(a);
        bVal = this.getLogTimestampMs(b);
      }

      // Handle null/undefined
      if ((aVal === null || aVal === undefined) &&
        (bVal === null || bVal === undefined)) {
        return 0;
      }
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

      // Deterministic tie-breakers for dense same-millisecond log bursts.
      if (cmp === 0 && this.sortColumn === 'timestamp') {
        const aCreatedAt = this.parseTimestamp(a?.created_at);
        const bCreatedAt = this.parseTimestamp(b?.created_at);

        if (aCreatedAt !== null && bCreatedAt !== null) {
          cmp = aCreatedAt - bCreatedAt;
        } else if (aCreatedAt !== null) {
          cmp = 1;
        } else if (bCreatedAt !== null) {
          cmp = -1;
        }
      }
      if (cmp === 0 && this.sortColumn === 'timestamp') {
        const aId = String(a?.[LOGS_SORT_FALLBACK_ID_FIELD] || '');
        const bId = String(b?.[LOGS_SORT_FALLBACK_ID_FIELD] || '');
        cmp = aId.localeCompare(bId);
      }

      return this.sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  /**
   * Handle drill-down action (Enter key on selected log)
   * Requirements: 29.7
   * @return {Object|null} Navigation action or null
   */
  handleDrillDown() {
    const selectedLog = this.getSelectedItem();
    if (!selectedLog) {
      return null;
    }

    return {
      action: 'showDetail',
      view: 'logs',
      context: {logId: selectedLog.log_id},
      detail: this.getSelectedDetails(),
    };
  }

  /**
   * Handle key input for the logs view
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
   * Get detail information for the selected log
   * Requirements: 29.7
   * @return {Object|null} Detail information or null
   */
  getSelectedDetails() {
    const log = this.getSelectedItem();
    if (!log) {
      return null;
    }

    const sections = [
      {
        title: 'Log Entry',
        fields: [
          {label: 'Log ID', value: log.log_id || 'N/A'},
          {label: 'Timestamp', value: this.formatTimestamp(this.getLogTimestampMs(log))},
          {label: 'Level', value: log.level || 'INFO'},
          {label: 'Node ID', value: log.node_id || 'N/A'},
          {label: 'Service ID', value: log.service_id || 'N/A'},
        ],
      },
      {
        title: 'Message',
        fields: [
          {label: 'Content', value: log.message || ''},
        ],
      },
    ];

    // Add metadata section if available
    if (log.metadata && typeof log.metadata === 'object') {
      const metadataFields = Object.entries(log.metadata).map(
        ([k, v]) => ({
          label: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v),
        }),
      );

      if (metadataFields.length > 0) {
        sections.push({
          title: 'Metadata',
          fields: metadataFields,
        });
      }
    }

    return {
      title: `Log: ${log.log_id || 'Unknown'}`,
      sections,
    };
  }

  /**
   * Get time range of current data
   * Requirements: 29.11
   * @return {Object} Time range with start and end
   */
  getTimeRange() {
    if (this.filteredData.length === 0) {
      return {start: null, end: null};
    }

    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const log of this.filteredData) {
      const ts = this.getLogTimestampMs(log);
      if (ts !== null) {
        if (ts < minTime) minTime = ts;
        if (ts > maxTime) maxTime = ts;
      }
    }

    return {
      start: minTime === Infinity ? null : minTime,
      end: maxTime === -Infinity ? null : maxTime,
    };
  }

  /**
   * Get status bar information
   * Requirements: 29.11
   * @return {Object} Status bar data
   */
  getStatusBarInfo() {
    const timeRange = this.getTimeRange();
    const activeFilters = [];

    if (this.levelFilter) {
      activeFilters.push(`Level: ${this.levelFilter}`);
    }
    if (this.nodeFilter) {
      activeFilters.push(`Node: ${this.nodeFilter}`);
    }
    if (this.serviceFilter) {
      activeFilters.push(`Service: ${this.serviceFilter}`);
    }
    if (this.messageFilter) {
      activeFilters.push(`Message: "${this.messageFilter}"`);
    }
    if (this.startTimeFilter || this.endTimeFilter) {
      activeFilters.push('Time range active');
    }

    return {
      logCount: this.filteredData.length,
      totalCount: this.data.length,
      timeRange,
      activeFilters,
    };
  }

  /**
   * Render the view with log-specific styling
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
   * Export filtered logs to a formatted string
   * Requirements: 29.10
   * @param {string} format - Export format ('json', 'csv', 'text')
   * @return {string} Exported logs as string
   */
  exportLogs(format = 'json') {
    const logs = this.filteredData;

    switch (format.toLowerCase()) {
    case 'json':
      return this.exportAsJSON(logs);
    case 'csv':
      return this.exportAsCSV(logs);
    case 'text':
      return this.exportAsText(logs);
    default:
      return this.exportAsJSON(logs);
    }
  }

  /**
   * Export logs as JSON
   * @param {Array} logs - Logs to export
   * @return {string} JSON string
   */
  exportAsJSON(logs) {
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Export logs as CSV
   * @param {Array} logs - Logs to export
   * @return {string} CSV string
   */
  exportAsCSV(logs) {
    if (logs.length === 0) {
      return 'timestamp,level,node_id,service_id,message';
    }

    const headers = [
      'timestamp', 'level', 'node_id', 'service_id', 'message',
    ];
    const rows = [headers.join(',')];

    for (const log of logs) {
      const row = headers.map((h) => {
        let value = log[h];
        if (value === null || value === undefined) {
          return '';
        }
        value = String(value);
        if (
          value.includes(',') ||
          value.includes('\n') ||
          value.includes('"')
        ) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Export logs as plain text
   * @param {Array} logs - Logs to export
   * @return {string} Text string
   */
  exportAsText(logs) {
    if (logs.length === 0) {
      return 'No logs to export';
    }

    const lines = [];
    for (const log of logs) {
      const timestamp = this.formatTimestamp(this.getLogTimestampMs(log));
      const level = (log.level || 'INFO').padEnd(5);
      const nodeId = log.node_id || 'N/A';
      const serviceId = log.service_id || 'N/A';
      const message = log.message || '';

      lines.push(
        `[${timestamp}] ${level} [${nodeId}]` +
        ` [${serviceId}] ${message}`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Get export metadata
   * @return {Object} Export metadata
   */
  getExportMetadata() {
    const timeRange = this.getTimeRange();
    return {
      exportedAt: new Date().toISOString(),
      totalLogs: this.data.length,
      filteredLogs: this.filteredData.length,
      filters: {
        level: this.levelFilter,
        nodeId: this.nodeFilter,
        serviceId: this.serviceFilter,
        startTime: this.startTimeFilter,
        endTime: this.endTimeFilter,
        messagePattern: this.messageFilter,
      },
      timeRange: {
        start: timeRange.start ?
          new Date(timeRange.start).toISOString() : null,
        end: timeRange.end ?
          new Date(timeRange.end).toISOString() : null,
      },
    };
  }
}
