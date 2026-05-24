import {ROW_STATUS} from '../core/base-view.js';
import {
  LOG_LEVEL_COLORS,
  LOG_LEVEL_ERROR,
  LOG_LEVEL_INFO,
  LOG_LEVEL_WARN,
  LOGS_COLUMN_LEVEL,
  LOGS_COLUMN_MESSAGE,
  LOGS_COLUMN_NODE_ID,
  LOGS_COLUMN_SERVICE_ID,
  LOGS_COLUMN_TIMESTAMP,
  LOGS_COMMA,
  LOGS_DEFAULT_MESSAGE_WIDTH,
  LOGS_DETAIL_LABEL_CONTENT,
  LOGS_DETAIL_LABEL_LEVEL,
  LOGS_DETAIL_LABEL_LOG_ID,
  LOGS_DETAIL_LABEL_NODE_ID,
  LOGS_DETAIL_LABEL_SERVICE_ID,
  LOGS_DETAIL_LABEL_TIMESTAMP,
  LOGS_DETAIL_TITLE_ENTRY,
  LOGS_DETAIL_TITLE_MESSAGE,
  LOGS_DETAIL_TITLE_METADATA,
  LOGS_DETAIL_UNKNOWN,
  LOGS_DOUBLE_QUOTE,
  LOGS_ELLIPSIS,
  LOGS_ELLIPSIS_WIDTH,
  LOGS_EMPTY_STRING,
  LOGS_ESCAPED_DOUBLE_QUOTE,
  LOGS_EXPORT_CSV_HEADER_LINE,
  LOGS_EXPORT_CSV_HEADERS,
  LOGS_EXPORT_FORMAT_CSV,
  LOGS_EXPORT_FORMAT_JSON,
  LOGS_EXPORT_FORMAT_TEXT,
  LOGS_EXPORT_NO_LOGS_TEXT,
  LOGS_NEWLINE,
  LOGS_REGEX_ESCAPE_REPLACEMENT,
  LOGS_SORT_ASC,
  LOGS_SORT_FALLBACK_ID_FIELD,
  LOGS_STATUS_LEVEL_LABEL,
  LOGS_STATUS_MESSAGE_LABEL,
  LOGS_STATUS_NODE_LABEL,
  LOGS_STATUS_SERVICE_LABEL,
  LOGS_STATUS_TIME_RANGE_ACTIVE,
  LOGS_TIMESTAMP_DISPLAY_DATE_SEPARATOR,
  LOGS_TIMESTAMP_DISPLAY_LENGTH,
  LOGS_TIMESTAMP_ISO_DATE_SEPARATOR,
  LOGS_TIMESTAMP_UNAVAILABLE,
  LOGS_TYPE_NUMBER,
  LOGS_TYPE_OBJECT,
  LOGS_VALUE_NA,
} from './logs-view-constants.js';

const LOGS_COLUMN_WIDTH_TIMESTAMP = 24;
const LOGS_COLUMN_WIDTH_LEVEL = 8;
const LOGS_COLUMN_WIDTH_NODE_ID = 15;
const LOGS_COLUMN_WIDTH_SERVICE_ID = 20;
const LOGS_COLUMN_WIDTH_MESSAGE = 60;
const LOGS_JSON_INDENT_SPACES = 2;

/**
 * Get column definitions for the logs view.
 * @return {Array<{key: string, label: string, width?: number}>}
 */
export function getLogColumns() {
  return [
    {
      key: LOGS_COLUMN_TIMESTAMP,
      label: LOGS_DETAIL_LABEL_TIMESTAMP,
      width: LOGS_COLUMN_WIDTH_TIMESTAMP,
    },
    {
      key: LOGS_COLUMN_LEVEL,
      label: LOGS_DETAIL_LABEL_LEVEL,
      width: LOGS_COLUMN_WIDTH_LEVEL,
    },
    {
      key: LOGS_COLUMN_NODE_ID,
      label: LOGS_DETAIL_LABEL_NODE_ID,
      width: LOGS_COLUMN_WIDTH_NODE_ID,
    },
    {
      key: LOGS_COLUMN_SERVICE_ID,
      label: LOGS_DETAIL_LABEL_SERVICE_ID,
      width: LOGS_COLUMN_WIDTH_SERVICE_ID,
    },
    {
      key: LOGS_COLUMN_MESSAGE,
      label: LOGS_DETAIL_TITLE_MESSAGE,
      width: LOGS_COLUMN_WIDTH_MESSAGE,
    },
  ];
}

/**
 * Format a log record into a row array.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Object} log - Log record.
 * @return {Array<string>} Row values.
 */
export function formatLogRow(view, log) {
  return [
    view.formatTimestamp(view.getLogTimestampMs(log)),
    log.level || LOG_LEVEL_INFO,
    log.node_id || LOGS_VALUE_NA,
    log.service_id || LOGS_VALUE_NA,
    view.truncateMessage(log.message),
  ];
}

/**
 * Format timestamp for display.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {number|string|null|undefined} timestamp - Timestamp value.
 * @return {string} Formatted timestamp.
 */
export function formatLogTimestamp(view, timestamp) {
  const normalizedTimestamp = view.parseTimestamp(timestamp);
  if (normalizedTimestamp === null) {
    return LOGS_TIMESTAMP_UNAVAILABLE;
  }

  const date = new Date(normalizedTimestamp);
  if (isNaN(date.getTime())) {
    return LOGS_TIMESTAMP_UNAVAILABLE;
  }
  return date.toISOString()
    .replace(LOGS_TIMESTAMP_ISO_DATE_SEPARATOR, LOGS_TIMESTAMP_DISPLAY_DATE_SEPARATOR)
    .substring(0, LOGS_TIMESTAMP_DISPLAY_LENGTH);
}

/**
 * Truncate message for display in table.
 * @param {string|null|undefined} message - Log message.
 * @param {number} maxLength - Maximum length.
 * @return {string} Truncated message.
 */
export function truncateLogMessage(message, maxLength = LOGS_DEFAULT_MESSAGE_WIDTH) {
  if (!message) {
    return LOGS_EMPTY_STRING;
  }
  const singleLine = String(message).replace(/[\r\n]+/g, ' ');
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.substring(0, maxLength - LOGS_ELLIPSIS_WIDTH) +
    LOGS_ELLIPSIS;
}

/**
 * Get the row status for styling based on log level.
 * @param {Object} log - Log record.
 * @return {string} Row status.
 */
export function getLogRowStatus(log) {
  const level = (log.level || LOG_LEVEL_INFO).toUpperCase();

  if (level === LOG_LEVEL_ERROR) {
    return ROW_STATUS.ERROR;
  }

  if (level === LOG_LEVEL_WARN) {
    return ROW_STATUS.WARNING;
  }

  return ROW_STATUS.NORMAL;
}

/**
 * Get the color for a log level.
 * @param {string} level - Log level.
 * @return {string} Color name.
 */
export function getLogLevelColor(level) {
  const normalizedLevel = (level || LOG_LEVEL_INFO).toUpperCase();
  return LOG_LEVEL_COLORS[normalizedLevel] || LOG_LEVEL_COLORS.INFO;
}

/**
 * Apply all logs filters to data.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Array} data - Data to filter.
 * @return {Array} Filtered data.
 */
export function applyLogFilters(view, data) {
  let result = data;

  if (view.levelFilter) {
    result = result.filter((log) =>
      (log.level || LOG_LEVEL_INFO).toUpperCase() ===
        view.levelFilter.toUpperCase(),
    );
  }
  if (view.nodeFilter) {
    result = result.filter((log) => log.node_id === view.nodeFilter);
  }
  if (view.serviceFilter) {
    result = result.filter((log) => log.service_id === view.serviceFilter);
  }
  if (view.startTimeFilter !== null) {
    result = result.filter((log) => {
      const ts = view.getLogTimestampMs(log);
      return ts !== null && ts >= view.startTimeFilter;
    });
  }
  if (view.endTimeFilter !== null) {
    result = result.filter((log) => {
      const ts = view.getLogTimestampMs(log);
      return ts !== null && ts <= view.endTimeFilter;
    });
  }
  if (view.messageFilter) {
    const pattern = new RegExp(view.escapeRegex(view.messageFilter), 'i');
    result = result.filter((log) =>
      pattern.test(log.message || LOGS_EMPTY_STRING),
    );
  }

  if (view.filter && view.filter.trim() !== LOGS_EMPTY_STRING) {
    const lowerFilter = view.filter.toLowerCase();
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
 * Escape special regex characters.
 * @param {string} str - String to escape.
 * @return {string} Escaped string.
 */
export function escapeLogRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, LOGS_REGEX_ESCAPE_REPLACEMENT);
}

/**
 * Resolve the sortable value for a log.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Object} log - Log record.
 * @return {*} Sort value.
 */
export function resolveLogSortValue(view, log) {
  return view.sortColumn === LOGS_COLUMN_TIMESTAMP ?
    view.getLogTimestampMs(log) :
    log?.[view.sortColumn];
}

/**
 * Compare missing sort values.
 * @param {*} aVal - First value.
 * @param {*} bVal - Second value.
 * @return {number|null} Sort comparison or null when both values exist.
 */
export function compareNullishSortValues(aVal, bVal) {
  const aMissing = aVal === null || aVal === undefined;
  const bMissing = bVal === null || bVal === undefined;
  if (aMissing && bMissing) {
    return 0;
  }
  if (aMissing) {
    return 1;
  }
  if (bMissing) {
    return -1;
  }
  return null;
}

/**
 * Compare two resolved sort values.
 * @param {*} aVal - First value.
 * @param {*} bVal - Second value.
 * @return {number} Sort comparison.
 */
export function compareResolvedSortValues(aVal, bVal) {
  if (typeof aVal === LOGS_TYPE_NUMBER && typeof bVal === LOGS_TYPE_NUMBER) {
    return aVal - bVal;
  }
  return String(aVal).localeCompare(String(bVal));
}

/**
 * Compare deterministic timestamp tie-breakers.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Object} a - First log.
 * @param {Object} b - Second log.
 * @return {number} Sort comparison.
 */
export function compareTimestampTieBreakers(view, a, b) {
  const aCreatedAt = view.parseTimestamp(a?.created_at);
  const bCreatedAt = view.parseTimestamp(b?.created_at);
  if (aCreatedAt !== null && bCreatedAt !== null) {
    const timestampCompare = aCreatedAt - bCreatedAt;
    if (timestampCompare !== 0) {
      return timestampCompare;
    }
  } else if (aCreatedAt !== null) {
    return 1;
  } else if (bCreatedAt !== null) {
    return -1;
  }

  const aId = String(a?.[LOGS_SORT_FALLBACK_ID_FIELD] || LOGS_EMPTY_STRING);
  const bId = String(b?.[LOGS_SORT_FALLBACK_ID_FIELD] || LOGS_EMPTY_STRING);
  return aId.localeCompare(bId);
}

/**
 * Compare two rows for the current sort state.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Object} a - First log.
 * @param {Object} b - Second log.
 * @return {number} Sort comparison.
 */
export function compareRowsForCurrentSort(view, a, b) {
  const aVal = view.resolveSortValue(a);
  const bVal = view.resolveSortValue(b);
  const nullishComparison = view.compareNullishSortValues(aVal, bVal);
  if (nullishComparison !== null) {
    return nullishComparison;
  }

  const valueComparison = view.compareResolvedSortValues(aVal, bVal);
  if (valueComparison !== 0 || view.sortColumn !== LOGS_COLUMN_TIMESTAMP) {
    return valueComparison;
  }

  return view.compareTimestampTieBreakers(a, b);
}

/**
 * Apply sort to log data.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Array} data - Data to sort.
 * @return {Array} Sorted data.
 */
export function applyLogSort(view, data) {
  if (!view.sortColumn) {
    return data;
  }

  return [...data].sort((a, b) => {
    const comparison = view.compareRowsForCurrentSort(a, b);
    return view.sortDirection === LOGS_SORT_ASC ? comparison : -comparison;
  });
}

/**
 * Get detail information for the selected log.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {Object|null} Detail information or null.
 */
export function getSelectedLogDetails(view) {
  const log = view.getSelectedItem();
  if (!log) {
    return null;
  }

  const sections = [
    {
      title: LOGS_DETAIL_TITLE_ENTRY,
      fields: [
        {label: LOGS_DETAIL_LABEL_LOG_ID, value: log.log_id || LOGS_VALUE_NA},
        {
          label: LOGS_DETAIL_LABEL_TIMESTAMP,
          value: view.formatTimestamp(view.getLogTimestampMs(log)),
        },
        {label: LOGS_DETAIL_LABEL_LEVEL, value: log.level || LOG_LEVEL_INFO},
        {label: LOGS_DETAIL_LABEL_NODE_ID, value: log.node_id || LOGS_VALUE_NA},
        {
          label: LOGS_DETAIL_LABEL_SERVICE_ID,
          value: log.service_id || LOGS_VALUE_NA,
        },
      ],
    },
    {
      title: LOGS_DETAIL_TITLE_MESSAGE,
      fields: [
        {label: LOGS_DETAIL_LABEL_CONTENT, value: log.message || LOGS_EMPTY_STRING},
      ],
    },
  ];

  if (log.metadata && typeof log.metadata === LOGS_TYPE_OBJECT) {
    const metadataFields = Object.entries(log.metadata).map(
      ([key, value]) => ({
        label: key,
        value: typeof value === LOGS_TYPE_OBJECT ?
          JSON.stringify(value) :
          String(value),
      }),
    );

    if (metadataFields.length > 0) {
      sections.push({
        title: LOGS_DETAIL_TITLE_METADATA,
        fields: metadataFields,
      });
    }
  }

  return {
    title: `Log: ${log.log_id || LOGS_DETAIL_UNKNOWN}`,
    sections,
  };
}

/**
 * Get time range of current data.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {{start: number|null, end: number|null}} Time range.
 */
export function getLogsTimeRange(view) {
  if (view.filteredData.length === 0) {
    return {start: null, end: null};
  }

  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const log of view.filteredData) {
    const ts = view.getLogTimestampMs(log);
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
 * Get status bar information.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {Object} Status bar data.
 */
export function getLogsStatusBarInfo(view) {
  const timeRange = view.getTimeRange();
  const activeFilters = [];

  if (view.levelFilter) {
    activeFilters.push(`${LOGS_STATUS_LEVEL_LABEL}: ${view.levelFilter}`);
  }
  if (view.nodeFilter) {
    activeFilters.push(`${LOGS_STATUS_NODE_LABEL}: ${view.nodeFilter}`);
  }
  if (view.serviceFilter) {
    activeFilters.push(`${LOGS_STATUS_SERVICE_LABEL}: ${view.serviceFilter}`);
  }
  if (view.messageFilter) {
    activeFilters.push(`${LOGS_STATUS_MESSAGE_LABEL}: "${view.messageFilter}"`);
  }
  if (view.startTimeFilter || view.endTimeFilter) {
    activeFilters.push(LOGS_STATUS_TIME_RANGE_ACTIVE);
  }

  return {
    logCount: view.filteredData.length,
    totalCount: view.data.length,
    timeRange,
    activeFilters,
  };
}

/**
 * Export filtered logs to a formatted string.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {string} format - Export format.
 * @return {string} Exported logs.
 */
export function exportLogsFromView(view, format = LOGS_EXPORT_FORMAT_JSON) {
  const logs = view.filteredData;

  switch (format.toLowerCase()) {
  case LOGS_EXPORT_FORMAT_JSON:
    return view.exportAsJSON(logs);
  case LOGS_EXPORT_FORMAT_CSV:
    return view.exportAsCSV(logs);
  case LOGS_EXPORT_FORMAT_TEXT:
    return view.exportAsText(logs);
  default:
    return view.exportAsJSON(logs);
  }
}

/**
 * Export logs as JSON.
 * @param {Array} logs - Logs to export.
 * @return {string} JSON string.
 */
export function exportLogsAsJSON(logs) {
  return JSON.stringify(logs, null, LOGS_JSON_INDENT_SPACES);
}

/**
 * Export logs as CSV.
 * @param {Array} logs - Logs to export.
 * @return {string} CSV string.
 */
export function exportLogsAsCSV(logs) {
  if (logs.length === 0) {
    return LOGS_EXPORT_CSV_HEADER_LINE;
  }

  const rows = [LOGS_EXPORT_CSV_HEADERS.join(LOGS_COMMA)];

  for (const log of logs) {
    const row = LOGS_EXPORT_CSV_HEADERS.map((header) => {
      let value = log[header];
      if (value === null || value === undefined) {
        return LOGS_EMPTY_STRING;
      }
      value = String(value);
      if (
        value.includes(LOGS_COMMA) ||
        value.includes(LOGS_NEWLINE) ||
        value.includes(LOGS_DOUBLE_QUOTE)
      ) {
        value = LOGS_DOUBLE_QUOTE +
          value.replace(/"/g, LOGS_ESCAPED_DOUBLE_QUOTE) +
          LOGS_DOUBLE_QUOTE;
      }
      return value;
    });
    rows.push(row.join(LOGS_COMMA));
  }

  return rows.join(LOGS_NEWLINE);
}

/**
 * Export logs as plain text.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Array} logs - Logs to export.
 * @return {string} Text string.
 */
export function exportLogsAsText(view, logs) {
  if (logs.length === 0) {
    return LOGS_EXPORT_NO_LOGS_TEXT;
  }

  const lines = [];
  for (const log of logs) {
    const timestamp = view.formatTimestamp(view.getLogTimestampMs(log));
    const level = (log.level || LOG_LEVEL_INFO).padEnd(5);
    const nodeId = log.node_id || LOGS_VALUE_NA;
    const serviceId = log.service_id || LOGS_VALUE_NA;
    const message = log.message || LOGS_EMPTY_STRING;

    lines.push(
      `[${timestamp}] ${level} [${nodeId}]` +
      ` [${serviceId}] ${message}`,
    );
  }

  return lines.join(LOGS_NEWLINE);
}

/**
 * Get export metadata.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {Object} Export metadata.
 */
export function getLogsExportMetadata(view) {
  const timeRange = view.getTimeRange();
  return {
    exportedAt: new Date().toISOString(),
    totalLogs: view.data.length,
    filteredLogs: view.filteredData.length,
    filters: {
      level: view.levelFilter,
      nodeId: view.nodeFilter,
      serviceId: view.serviceFilter,
      startTime: view.startTimeFilter,
      endTime: view.endTimeFilter,
      messagePattern: view.messageFilter,
    },
    timeRange: {
      start: timeRange.start ?
        new Date(timeRange.start).toISOString() : null,
      end: timeRange.end ?
        new Date(timeRange.end).toISOString() : null,
    },
  };
}
