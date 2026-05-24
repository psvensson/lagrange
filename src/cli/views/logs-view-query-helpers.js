import {
  LOGS_COLUMN_LEVEL,
  LOGS_COLUMN_MESSAGE,
  LOGS_COLUMN_NODE_ID,
  LOGS_COLUMN_SERVICE_ID,
  LOGS_COLUMN_TIMESTAMP,
  LOGS_EMPTY_STRING,
  LOGS_QUERY_AND,
  LOGS_QUERY_EQUAL,
  LOGS_QUERY_GTE,
  LOGS_QUERY_LIKE,
  LOGS_QUERY_LIVE_PREFIX,
  LOGS_QUERY_LIMIT,
  LOGS_QUERY_LIMIT_CLAUSE,
  LOGS_QUERY_LTE,
  LOGS_QUERY_ORDER_BY,
  LOGS_QUERY_ORDER_BY_CLAUSE,
  LOGS_QUERY_SELECT_ALL,
  LOGS_QUERY_WHERE,
  LOGS_RELATIVE_UNIT_MILLISECONDS,
  LOGS_SINCE_INVALID_VALUE_PREFIX,
  LOGS_SINCE_RELATIVE_REGEX,
  LOGS_SINCE_RESET_VALUE,
  LOGS_SQL_ESCAPED_QUOTE,
  LOGS_SQL_FALSE,
  LOGS_SQL_NULL,
  LOGS_SQL_TRUE,
  LOGS_TABLE,
  LOGS_TIMESTAMP_EPOCH_SECONDS_MAX_ABS,
  LOGS_TIMESTAMP_INTEGER_REGEX,
  LOGS_TIMESTAMP_MILLISECONDS_PER_SECOND,
  LOGS_TYPE_BOOLEAN,
  LOGS_TYPE_NUMBER,
  LOGS_TYPE_STRING,
} from './logs-view-constants.js';

/**
 * Build a LIVE SELECT SQL string for the logs table using current filters.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {string} LIVE SELECT SQL string.
 */
export function buildLiveLogsQuery(view) {
  const conditions = buildLiveLogsWhereConditions(view);
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
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {Array<string>} SQL condition strings.
 */
export function buildLiveLogsWhereConditions(view) {
  const conditions = [];

  if (view.levelFilter) {
    conditions.push(
      `${LOGS_COLUMN_LEVEL}${LOGS_QUERY_EQUAL}` +
      view.quoteSqlLiteral(view.levelFilter.toUpperCase()),
    );
  }
  if (view.nodeFilter) {
    conditions.push(
      `${LOGS_COLUMN_NODE_ID}${LOGS_QUERY_EQUAL}` +
      view.quoteSqlLiteral(view.nodeFilter),
    );
  }
  if (view.serviceFilter) {
    conditions.push(
      `${LOGS_COLUMN_SERVICE_ID}${LOGS_QUERY_EQUAL}` +
      view.quoteSqlLiteral(view.serviceFilter),
    );
  }
  if (view.startTimeFilter !== null) {
    conditions.push(
      `${LOGS_COLUMN_TIMESTAMP}${LOGS_QUERY_GTE}` +
      view.quoteSqlLiteral(view.startTimeFilter),
    );
  }
  if (view.endTimeFilter !== null) {
    conditions.push(
      `${LOGS_COLUMN_TIMESTAMP}${LOGS_QUERY_LTE}` +
      view.quoteSqlLiteral(view.endTimeFilter),
    );
  }
  if (view.messageFilter) {
    conditions.push(
      `${LOGS_COLUMN_MESSAGE}${LOGS_QUERY_LIKE}` +
      view.quoteSqlLiteral(`%${view.messageFilter}%`),
    );
  }

  return conditions;
}

/**
 * Convert a JS value to a SQL literal.
 * @param {string|number|boolean|null} value - Value to quote.
 * @return {string} SQL literal string.
 */
export function quoteSqlLiteral(value) {
  if (value === null || value === undefined) {
    return LOGS_SQL_NULL;
  }
  if (typeof value === LOGS_TYPE_NUMBER) {
    return String(Math.trunc(value));
  }
  if (typeof value === LOGS_TYPE_BOOLEAN) {
    return value ? LOGS_SQL_TRUE : LOGS_SQL_FALSE;
  }
  return `'${String(value).replace(/'/g, LOGS_SQL_ESCAPED_QUOTE)}'`;
}

/**
 * Build a SQL query for the logs table using current filters.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @return {{sql: string, params: Array}} SQL and positional params.
 */
export function buildLogsQuery(view) {
  const conditions = [];
  const params = [];

  if (view.levelFilter) {
    params.push(view.levelFilter.toUpperCase());
    conditions.push(`${LOGS_COLUMN_LEVEL} = ?${params.length}`);
  }
  if (view.nodeFilter) {
    params.push(view.nodeFilter);
    conditions.push(`${LOGS_COLUMN_NODE_ID} = ?${params.length}`);
  }
  if (view.serviceFilter) {
    params.push(view.serviceFilter);
    conditions.push(`${LOGS_COLUMN_SERVICE_ID} = ?${params.length}`);
  }
  if (view.startTimeFilter !== null) {
    params.push(view.startTimeFilter);
    conditions.push(`${LOGS_COLUMN_TIMESTAMP} >= ?${params.length}`);
  }
  if (view.endTimeFilter !== null) {
    params.push(view.endTimeFilter);
    conditions.push(`${LOGS_COLUMN_TIMESTAMP} <= ?${params.length}`);
  }
  if (view.messageFilter) {
    params.push(`%${view.messageFilter}%`);
    conditions.push(`${LOGS_COLUMN_MESSAGE} LIKE ?${params.length}`);
  }

  let sql = `${LOGS_QUERY_SELECT_ALL} FROM ${LOGS_TABLE}`;
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(LOGS_QUERY_AND)}`;
  }
  sql += ` ORDER BY ${LOGS_QUERY_ORDER_BY} LIMIT ${LOGS_QUERY_LIMIT}`;

  return {sql, params};
}

/**
 * Resolve live window start time from user-supplied value.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {string|number|null|undefined} value - User input.
 * @return {number} Epoch milliseconds.
 * @throws {Error} When value is invalid.
 */
export function resolveLiveWindowStartTime(view, value) {
  const now = Date.now();
  if (value === null || value === undefined) {
    return now;
  }

  if (typeof value === LOGS_TYPE_NUMBER) {
    const normalized = view.normalizeNumericTimestamp(value);
    if (normalized === null) {
      throw new Error(`${LOGS_SINCE_INVALID_VALUE_PREFIX}${String(value)}`);
    }
    return normalized;
  }

  const trimmedValue = String(value).trim();
  if (trimmedValue === LOGS_EMPTY_STRING ||
    trimmedValue.toLowerCase() === LOGS_SINCE_RESET_VALUE) {
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

  const parsedTimestamp = view.parseTimestamp(trimmedValue);
  if (parsedTimestamp !== null) {
    return parsedTimestamp;
  }

  throw new Error(`${LOGS_SINCE_INVALID_VALUE_PREFIX}${trimmedValue}`);
}

/**
 * Parse timestamp to numeric value.
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {number|string|null|undefined} timestamp - Timestamp value.
 * @return {number|null} Numeric timestamp or null.
 */
export function parseLogTimestamp(view, timestamp) {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }

  if (typeof timestamp === LOGS_TYPE_NUMBER) {
    return view.normalizeNumericTimestamp(timestamp);
  }
  if (typeof timestamp === LOGS_TYPE_STRING) {
    const trimmedTimestamp = timestamp.trim();
    if (trimmedTimestamp === LOGS_EMPTY_STRING) {
      return null;
    }
    if (LOGS_TIMESTAMP_INTEGER_REGEX.test(trimmedTimestamp)) {
      return view.normalizeNumericTimestamp(Number(trimmedTimestamp));
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
 */
export function normalizeLogTimestamp(timestamp) {
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
 * @param {import('./logs-view.js').LogsView} view - Logs view instance.
 * @param {Object} log - Log record.
 * @return {number|null} Epoch milliseconds timestamp.
 */
export function getLogTimestampMs(view, log) {
  const logTimestamp = view.parseTimestamp(log?.timestamp);
  if (logTimestamp !== null) {
    return logTimestamp;
  }
  return view.parseTimestamp(log?.created_at);
}
