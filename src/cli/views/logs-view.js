/**
 * LogsView - Displays system logs with filtering and highlighting.
 *
 * Streams logs via LIVE SELECT from the owning partition (logs is a
 * non-propagated table, so it is never in the SystemTableCache).
 * When filters change, the view re-subscribes with an updated
 * server-side WHERE clause.
 *
 * Columns: timestamp, level, node_id, service_id, message.
 * Supports multi-criteria filtering, level-based highlighting, and sorting.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8,
 *               29.9, 29.11, 29.12
 */

import {BaseView} from '../core/base-view.js';
import {
  applyLogFilters,
  applyLogSort,
  compareNullishSortValues as compareNullishLogSortValues,
  compareResolvedSortValues as compareResolvedLogSortValues,
  compareRowsForCurrentSort as compareLogRowsForCurrentSort,
  compareTimestampTieBreakers as compareLogTimestampTieBreakers,
  escapeLogRegex,
  exportLogsAsCSV,
  exportLogsAsJSON,
  exportLogsAsText,
  exportLogsFromView,
  formatLogRow,
  formatLogTimestamp,
  getLogColumns,
  getLogLevelColor,
  getLogRowStatus,
  getLogsExportMetadata,
  getLogsStatusBarInfo,
  getLogsTimeRange,
  getSelectedLogDetails,
  resolveLogSortValue,
  truncateLogMessage,
} from './logs-view-data-helpers.js';
import {
  LOG_LEVEL_ERROR,
  LOGS_ACTION_SHOW_DETAIL,
  LOGS_COLUMN_TIMESTAMP,
  LOGS_EMPTY_STRING,
  LOGS_EVENT_LIVEQUERY_EVENT,
  LOGS_EVENT_LIVEQUERY_INITIALIZED,
  LOGS_EVENT_TYPE_DELETE,
  LOGS_EVENT_TYPE_INSERT,
  LOGS_EVENT_TYPE_SNAPSHOT,
  LOGS_EVENT_TYPE_UPDATE,
  LOGS_EVENT_VIEW_REFRESH,
  LOGS_HIGHLIGHT_MAX_CHANGED_ROWS,
  LOGS_KEY_ENTER,
  LOGS_KEY_RETURN,
  LOGS_LIVE_QUERY_UNAVAILABLE_ERROR,
  LOGS_QUERY_ERROR_ID,
  LOGS_SORT_DESC,
  LOGS_SYSTEM_NODE_ID,
  LOGS_SYSTEM_SERVICE_ID,
  LOGS_VIEW_NAME,
} from './logs-view-constants.js';
import {
  buildLiveLogsQuery as buildLiveLogsSql,
  buildLiveLogsWhereConditions as buildLiveLogsSqlWhereConditions,
  buildLogsQuery as buildLogsSql,
  getLogTimestampMs as resolveLogTimestampMs,
  normalizeLogTimestamp,
  parseLogTimestamp,
  quoteSqlLiteral as quoteSqlValueLiteral,
  resolveLiveWindowStartTime as resolveLiveWindowStartTimeValue,
} from './logs-view-query-helpers.js';

export {LOG_LEVELS, LOG_LEVEL_COLORS} from './logs-view-constants.js';

/**
 * LogsView displays system logs with filtering and highlighting.
 */
export class LogsView extends BaseView {
  /**
   * Creates a new LogsView.
   * @param {Object} options - View options.
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache]
   *   Remote cache.
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus]
   *   Event bus.
   * @param {import('../core/connection-manager.js').ConnectionManager}
   *   [options.connectionManager] - Connection manager for SQL queries.
   * @param {boolean} [options.liveQueryEnabled=false] - Enable live query
   *   subscription for logs view.
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
    this.connectionManager = options.connectionManager || null;
    this.liveQueryManager = options.liveQueryManager || null;
    this.liveQueryEnabled = options.liveQueryEnabled === true;
    this.viewName = LOGS_VIEW_NAME;

    this.levelFilter = null;
    this.nodeFilter = null;
    this.serviceFilter = null;
    this.startTimeFilter = null;
    this.endTimeFilter = null;
    this.messageFilter = null;

    this.sortColumn = LOGS_COLUMN_TIMESTAMP;
    this.sortDirection = LOGS_SORT_DESC;

    this.streamingEnabled = true;
    this.changedLogIdQueue = [];

    this.activeSubscriptionId = null;
    this.activeLiveQuerySql = null;
    this.viewEnteredAt = null;
    this.internalSetDataInProgress = false;

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

    this.eventBus.on(LOGS_EVENT_LIVEQUERY_INITIALIZED, (event) => {
      if (!this.activeSubscriptionId) {
        return;
      }
      if (event.subscriptionId !== this.activeSubscriptionId) {
        return;
      }
      const rows = Array.isArray(event.data) ? event.data : [];
      this.applySnapshotRows(rows);
      this.eventBus.emit(LOGS_EVENT_VIEW_REFRESH, {view: this});
    });

    this.eventBus.on(LOGS_EVENT_LIVEQUERY_EVENT, (event) => {
      if (!this.activeSubscriptionId) {
        return;
      }
      if (event.subscriptionId !== this.activeSubscriptionId) {
        return;
      }
      const eventType = (event.eventType || LOGS_EMPTY_STRING).toUpperCase();
      if (eventType === LOGS_EVENT_TYPE_SNAPSHOT && Array.isArray(event.data)) {
        this.applySnapshotRows(event.data);
        this.eventBus.emit(LOGS_EVENT_VIEW_REFRESH, {view: this});
        return;
      }

      if ((eventType === LOGS_EVENT_TYPE_INSERT ||
        eventType === LOGS_EVENT_TYPE_UPDATE) &&
        event.data) {
        this.applyLiveQueryUpsert(event.data);
        this.eventBus.emit(LOGS_EVENT_VIEW_REFRESH, {view: this});
        return;
      }

      if (eventType === LOGS_EVENT_TYPE_DELETE) {
        this.applyLiveQueryDelete(event);
      }
    });
  }

  /**
   * Apply one live query insert/update payload.
   * @param {Object} data - Log row payload.
   * @private
   */
  applyLiveQueryUpsert(data) {
    const selectedLogId = this.getSelectedItem()?.log_id || null;
    const incomingLog = {...data};
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
  }

  /**
   * Apply one live query delete payload.
   * @param {Object} event - Live query event.
   * @private
   */
  applyLiveQueryDelete(event) {
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
      this.eventBus.emit(LOGS_EVENT_VIEW_REFRESH, {view: this});
    }
  }

  buildLiveLogsQuery() {
    return buildLiveLogsSql(this);
  }

  buildLiveLogsWhereConditions() {
    return buildLiveLogsSqlWhereConditions(this);
  }

  quoteSqlLiteral(value) {
    return quoteSqlValueLiteral(value);
  }

  buildLogsQuery() {
    return buildLogsSql(this);
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
      level: LOG_LEVEL_ERROR,
      node_id: LOGS_SYSTEM_NODE_ID,
      service_id: LOGS_SYSTEM_SERVICE_ID,
      message,
    }]);
    if (this.eventBus) {
      this.eventBus.emit(LOGS_EVENT_VIEW_REFRESH, {view: this});
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
   * Enable or disable real-time log streaming.
   * @param {boolean} enabled - Whether streaming is enabled.
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

  resolveLiveWindowStartTime(value) {
    return resolveLiveWindowStartTimeValue(this, value);
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

  isStreamingEnabled() {
    return this.streamingEnabled;
  }

  getColumns() {
    return getLogColumns();
  }

  formatRow(log) {
    return formatLogRow(this, log);
  }

  formatTimestamp(timestamp) {
    return formatLogTimestamp(this, timestamp);
  }

  truncateMessage(message, maxLength) {
    return truncateLogMessage(message, maxLength);
  }

  getRowStatus(log) {
    return getLogRowStatus(log);
  }

  getLevelColor(level) {
    return getLogLevelColor(level);
  }

  getItemKey(log) {
    return log.log_id || LOGS_EMPTY_STRING;
  }

  setLevelFilter(level) {
    this.levelFilter = level;
    this.fetchLogs();
  }

  setNodeFilter(nodeId) {
    this.nodeFilter = nodeId;
    this.fetchLogs();
  }

  setServiceFilter(serviceId) {
    this.serviceFilter = serviceId;
    this.fetchLogs();
  }

  setTimeRangeFilter(startTime, endTime) {
    this.startTimeFilter = startTime;
    this.endTimeFilter = endTime;
    this.fetchLogs();
  }

  setMessageFilter(pattern) {
    this.messageFilter = pattern;
    this.fetchLogs();
  }

  clearAllFilters() {
    this.levelFilter = null;
    this.nodeFilter = null;
    this.serviceFilter = null;
    this.startTimeFilter = null;
    this.endTimeFilter = null;
    this.messageFilter = null;
    this.filter = LOGS_EMPTY_STRING;
    this.fetchLogs();
  }

  applyFilter(data) {
    return applyLogFilters(this, data);
  }

  parseTimestamp(timestamp) {
    return parseLogTimestamp(this, timestamp);
  }

  normalizeNumericTimestamp(timestamp) {
    return normalizeLogTimestamp(timestamp);
  }

  getLogTimestampMs(log) {
    return resolveLogTimestampMs(this, log);
  }

  escapeRegex(str) {
    return escapeLogRegex(str);
  }

  resolveSortValue(log) {
    return resolveLogSortValue(this, log);
  }

  compareNullishSortValues(aVal, bVal) {
    return compareNullishLogSortValues(aVal, bVal);
  }

  compareResolvedSortValues(aVal, bVal) {
    return compareResolvedLogSortValues(aVal, bVal);
  }

  compareTimestampTieBreakers(a, b) {
    return compareLogTimestampTieBreakers(this, a, b);
  }

  compareRowsForCurrentSort(a, b) {
    return compareLogRowsForCurrentSort(this, a, b);
  }

  applySort(data) {
    return applyLogSort(this, data);
  }

  /**
   * Handle drill-down action (Enter key on selected log).
   * @return {Object|null} Navigation action or null.
   */
  handleDrillDown() {
    const selectedLog = this.getSelectedItem();
    if (!selectedLog) {
      return null;
    }

    return {
      action: LOGS_ACTION_SHOW_DETAIL,
      view: LOGS_VIEW_NAME,
      context: {logId: selectedLog.log_id},
      detail: this.getSelectedDetails(),
    };
  }

  /**
   * Handle key input for the logs view.
   * @param {Object} key - Key event.
   * @return {boolean|Object} True if handled, navigation object, or false.
   */
  handleKey(key) {
    if (key.name === LOGS_KEY_ENTER || key.name === LOGS_KEY_RETURN) {
      return this.handleDrillDown();
    }
    return super.handleKey(key);
  }

  getSelectedDetails() {
    return getSelectedLogDetails(this);
  }

  getTimeRange() {
    return getLogsTimeRange(this);
  }

  getStatusBarInfo() {
    return getLogsStatusBarInfo(this);
  }

  /**
   * Render the view with log-specific styling.
   * @param {Object} state - Navigation state.
   * @return {Object} Render data with headers and rows.
   */
  render(state = {}) {
    const baseRender = super.render(state);
    baseRender.statusBar = this.getStatusBarInfo();
    return baseRender;
  }

  exportLogs(format) {
    return exportLogsFromView(this, format);
  }

  exportAsJSON(logs) {
    return exportLogsAsJSON(logs);
  }

  exportAsCSV(logs) {
    return exportLogsAsCSV(logs);
  }

  exportAsText(logs) {
    return exportLogsAsText(this, logs);
  }

  getExportMetadata() {
    return getLogsExportMetadata(this);
  }
}
