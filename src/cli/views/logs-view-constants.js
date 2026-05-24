/**
 * Shared constants for LogsView and its helper modules.
 */

export const LOG_LEVEL_ERROR = 'ERROR';
export const LOG_LEVEL_WARN = 'WARN';
export const LOG_LEVEL_INFO = 'INFO';
export const LOG_LEVEL_DEBUG = 'DEBUG';
export const LOG_LEVEL_TRACE = 'TRACE';
export const LOG_LEVELS = [
  LOG_LEVEL_ERROR,
  LOG_LEVEL_WARN,
  LOG_LEVEL_INFO,
  LOG_LEVEL_DEBUG,
  LOG_LEVEL_TRACE,
];

export const LOG_LEVEL_COLORS = {
  ERROR: 'red',
  WARN: 'yellow',
  INFO: 'white',
  DEBUG: 'gray',
  TRACE: 'gray',
};

export const LOGS_VIEW_NAME = 'logs';
export const LOGS_COLUMN_TIMESTAMP = 'timestamp';
export const LOGS_COLUMN_LEVEL = 'level';
export const LOGS_COLUMN_NODE_ID = 'node_id';
export const LOGS_COLUMN_SERVICE_ID = 'service_id';
export const LOGS_COLUMN_MESSAGE = 'message';
export const LOGS_SORT_ASC = 'asc';
export const LOGS_SORT_DESC = 'desc';
export const LOGS_SORT_FALLBACK_ID_FIELD = 'log_id';
export const LOGS_EMPTY_STRING = '';
export const LOGS_VALUE_NA = 'N/A';

export const LOGS_EVENT_LIVEQUERY_INITIALIZED = 'livequery:initialized';
export const LOGS_EVENT_VIEW_REFRESH = 'view:refresh';
export const LOGS_EVENT_LIVEQUERY_EVENT = 'livequery:event';
export const LOGS_EVENT_TYPE_SNAPSHOT = 'SNAPSHOT';
export const LOGS_EVENT_TYPE_INSERT = 'INSERT';
export const LOGS_EVENT_TYPE_UPDATE = 'UPDATE';
export const LOGS_EVENT_TYPE_DELETE = 'DELETE';

export const LOGS_QUERY_LIMIT = 200;
export const LOGS_TABLE = 'logs';
export const LOGS_QUERY_ORDER_BY = 'timestamp DESC, created_at DESC, log_id DESC';
export const LOGS_QUERY_SELECT_ALL = 'SELECT *';
export const LOGS_QUERY_LIVE_PREFIX = 'LIVE ';
export const LOGS_QUERY_WHERE = ' WHERE ';
export const LOGS_QUERY_AND = ' AND ';
export const LOGS_QUERY_EQUAL = ' = ';
export const LOGS_QUERY_GTE = ' >= ';
export const LOGS_QUERY_LTE = ' <= ';
export const LOGS_QUERY_LIKE = ' LIKE ';
export const LOGS_QUERY_LIMIT_CLAUSE = ` LIMIT ${LOGS_QUERY_LIMIT}`;
export const LOGS_QUERY_ORDER_BY_CLAUSE = ` ORDER BY ${LOGS_QUERY_ORDER_BY}`;
export const LOGS_QUERY_ERROR_ID = 'logs_error';
export const LOGS_QUERY_ERROR_PREFIX = 'Live query error: ';
export const LOGS_LIVE_QUERY_UNAVAILABLE_ERROR =
  `${LOGS_QUERY_ERROR_PREFIX}Live query manager not available`;
export const LOGS_SYSTEM_NODE_ID = 'system';
export const LOGS_SYSTEM_SERVICE_ID = 'admin-cli';

export const LOGS_TIMESTAMP_UNAVAILABLE = 'N/A';
export const LOGS_TIMESTAMP_INTEGER_REGEX = /^-?\d+$/;
export const LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS = 10000000000;
export const LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND = 1000;
export const LOGS_TIMESTAMP_ISO_DATE_SEPARATOR = 'T';
export const LOGS_TIMESTAMP_DISPLAY_DATE_SEPARATOR = ' ';
export const LOGS_TIMESTAMP_DISPLAY_LENGTH = 23;

export const LOGS_SINCE_RESET_VALUE = 'now';
export const LOGS_SINCE_INVALID_VALUE_PREFIX = 'Invalid since value: ';
export const LOGS_SINCE_RELATIVE_REGEX = /^-(\d+)(ms|s|m|h|d)$/i;
export const LOGS_RELATIVE_UNIT_MILLISECONDS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export const LOGS_HIGHLIGHT_MAX_CHANGED_ROWS = 24;
export const LOGS_DEFAULT_MESSAGE_WIDTH = 80;
export const LOGS_ELLIPSIS_WIDTH = 3;
export const LOGS_ELLIPSIS = '...';
export const LOGS_SQL_NULL = 'NULL';
export const LOGS_SQL_TRUE = '1';
export const LOGS_SQL_FALSE = '0';
export const LOGS_SQL_ESCAPED_QUOTE = '\'\'';
export const LOGS_REGEX_ESCAPE_REPLACEMENT = '\\$&';

export const LOGS_TYPE_NUMBER = 'number';
export const LOGS_TYPE_BOOLEAN = 'boolean';
export const LOGS_TYPE_STRING = 'string';
export const LOGS_TYPE_OBJECT = 'object';

export const LOGS_ACTION_SHOW_DETAIL = 'showDetail';
export const LOGS_KEY_ENTER = 'enter';
export const LOGS_KEY_RETURN = 'return';
export const LOGS_DETAIL_TITLE_ENTRY = 'Log Entry';
export const LOGS_DETAIL_TITLE_MESSAGE = 'Message';
export const LOGS_DETAIL_TITLE_METADATA = 'Metadata';
export const LOGS_DETAIL_LABEL_LOG_ID = 'Log ID';
export const LOGS_DETAIL_LABEL_TIMESTAMP = 'Timestamp';
export const LOGS_DETAIL_LABEL_LEVEL = 'Level';
export const LOGS_DETAIL_LABEL_NODE_ID = 'Node ID';
export const LOGS_DETAIL_LABEL_SERVICE_ID = 'Service ID';
export const LOGS_DETAIL_LABEL_CONTENT = 'Content';
export const LOGS_DETAIL_UNKNOWN = 'Unknown';

export const LOGS_STATUS_LEVEL_LABEL = 'Level';
export const LOGS_STATUS_NODE_LABEL = 'Node';
export const LOGS_STATUS_SERVICE_LABEL = 'Service';
export const LOGS_STATUS_MESSAGE_LABEL = 'Message';
export const LOGS_STATUS_TIME_RANGE_ACTIVE = 'Time range active';

export const LOGS_EXPORT_FORMAT_JSON = 'json';
export const LOGS_EXPORT_FORMAT_CSV = 'csv';
export const LOGS_EXPORT_FORMAT_TEXT = 'text';
export const LOGS_EXPORT_CSV_HEADERS = [
  LOGS_COLUMN_TIMESTAMP,
  LOGS_COLUMN_LEVEL,
  LOGS_COLUMN_NODE_ID,
  LOGS_COLUMN_SERVICE_ID,
  LOGS_COLUMN_MESSAGE,
];
export const LOGS_EXPORT_CSV_HEADER_LINE =
  'timestamp,level,node_id,service_id,message';
export const LOGS_EXPORT_NO_LOGS_TEXT = 'No logs to export';
export const LOGS_COMMA = ',';
export const LOGS_NEWLINE = '\n';
export const LOGS_DOUBLE_QUOTE = '"';
export const LOGS_ESCAPED_DOUBLE_QUOTE = '""';
