/**
 * LogsView - Displays system logs with filtering and highlighting
 *
 * Columns: timestamp, level, node_id, service_id, message
 * Supports multi-criteria filtering, level-based highlighting, and sorting.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8, 29.9, 29.11, 29.12
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

/**
 * LogsView displays system logs with filtering and highlighting
 */
export class LogsView extends BaseView {
  /**
   * Creates a new LogsView
   * @param {Object} options - View options
   * @param {import('../core/remote-cache.js').RemoteCache} [options.cache] - Remote cache
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    super(options);
    this.cache = options.cache || null;
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

    // CDC streaming state
    // Requirements: 29.9
    this.streamingEnabled = true;
    this.recentLogIds = new Set();

    // Setup CDC event listener
    this.setupCDCListener();
  }

  /**
   * Setup CDC event listener for real-time log streaming
   * Requirements: 29.9
   */
  setupCDCListener() {
    if (this.eventBus) {
      this.eventBus.on('cache:update', (event) => {
        if (event.table === 'logs' && this.streamingEnabled && this.visible) {
          this.handleLogCDCEvent(event);
        }
      });
    }
  }

  /**
   * Handle CDC event for logs table
   * Requirements: 29.9
   * @param {Object} event - CDC event
   */
  handleLogCDCEvent(event) {
    const {operation, key} = event;

    if (operation === 'INSERT') {
      // Mark new log as recently added for highlighting
      this.recentLogIds.add(key);
      this.markChanged(key);

      // Clear highlight after a delay
      setTimeout(() => {
        this.recentLogIds.delete(key);
        this.clearChanged(key);
        if (this.eventBus) {
          this.eventBus.emit('view:refresh', {view: this});
        }
      }, 2000);

      // Refresh view to show new log
      if (this.eventBus) {
        this.eventBus.emit('view:refresh', {view: this});
      }
    }
  }

  /**
   * Enable or disable real-time log streaming
   * Requirements: 29.9
   * @param {boolean} enabled - Whether streaming is enabled
   */
  setStreamingEnabled(enabled) {
    this.streamingEnabled = enabled;
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
      this.formatTimestamp(log.timestamp),
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
    if (timestamp === null || timestamp === undefined) {
      return 'N/A';
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      return date.toISOString().replace('T', ' ').substring(0, 23);
    } catch (_err) {
      return 'N/A';
    }
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
    this.updateFilteredData();
  }

  /**
   * Set node filter
   * Requirements: 29.3
   * @param {string|null} nodeId - Node ID to filter by
   */
  setNodeFilter(nodeId) {
    this.nodeFilter = nodeId;
    this.updateFilteredData();
  }

  /**
   * Set service filter
   * Requirements: 29.4
   * @param {string|null} serviceId - Service ID to filter by
   */
  setServiceFilter(serviceId) {
    this.serviceFilter = serviceId;
    this.updateFilteredData();
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
    this.updateFilteredData();
  }

  /**
   * Set message content filter
   * Requirements: 29.6
   * @param {string|null} pattern - Message pattern to filter by
   */
  setMessageFilter(pattern) {
    this.messageFilter = pattern;
    this.updateFilteredData();
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
    this.updateFilteredData();
  }

  /**
   * Apply all filters to data
   * Requirements: 29.2, 29.3, 29.4, 29.5, 29.6
   * @param {Array} data - Data to filter
   * @return {Array} Filtered data
   */
  applyFilter(data) {
    let result = data;

    // Apply level filter
    if (this.levelFilter) {
      result = result.filter((log) =>
        (log.level || 'INFO').toUpperCase() === this.levelFilter.toUpperCase(),
      );
    }

    // Apply node filter
    if (this.nodeFilter) {
      result = result.filter((log) => log.node_id === this.nodeFilter);
    }

    // Apply service filter
    if (this.serviceFilter) {
      result = result.filter((log) => log.service_id === this.serviceFilter);
    }

    // Apply time range filter
    if (this.startTimeFilter !== null) {
      result = result.filter((log) => {
        const ts = this.parseTimestamp(log.timestamp);
        return ts !== null && ts >= this.startTimeFilter;
      });
    }

    if (this.endTimeFilter !== null) {
      result = result.filter((log) => {
        const ts = this.parseTimestamp(log.timestamp);
        return ts !== null && ts <= this.endTimeFilter;
      });
    }

    // Apply message content filter
    if (this.messageFilter) {
      const pattern = new RegExp(this.escapeRegex(this.messageFilter), 'i');
      result = result.filter((log) =>
        pattern.test(log.message || ''),
      );
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
          {label: 'Timestamp', value: this.formatTimestamp(log.timestamp)},
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
      const metadataFields = Object.entries(log.metadata).map(([k, v]) => ({
        label: k,
        value: typeof v === 'object' ? JSON.stringify(v) : String(v),
      }));

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
      const ts = this.parseTimestamp(log.timestamp);
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

    if (this.levelFilter) activeFilters.push(`Level: ${this.levelFilter}`);
    if (this.nodeFilter) activeFilters.push(`Node: ${this.nodeFilter}`);
    if (this.serviceFilter) activeFilters.push(`Service: ${this.serviceFilter}`);
    if (this.messageFilter) activeFilters.push(`Message: "${this.messageFilter}"`);
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

    const headers = ['timestamp', 'level', 'node_id', 'service_id', 'message'];
    const rows = [headers.join(',')];

    for (const log of logs) {
      const row = headers.map((h) => {
        let value = log[h];
        if (value === null || value === undefined) {
          return '';
        }
        // Escape quotes and wrap in quotes if contains comma or newline
        value = String(value);
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
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
      const timestamp = this.formatTimestamp(log.timestamp);
      const level = (log.level || 'INFO').padEnd(5);
      const nodeId = log.node_id || 'N/A';
      const serviceId = log.service_id || 'N/A';
      const message = log.message || '';

      lines.push(`[${timestamp}] ${level} [${nodeId}] [${serviceId}] ${message}`);
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
        start: timeRange.start ? new Date(timeRange.start).toISOString() : null,
        end: timeRange.end ? new Date(timeRange.end).toISOString() : null,
      },
    };
  }
}
