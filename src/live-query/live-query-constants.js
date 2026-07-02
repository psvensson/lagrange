import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, STRING, TIME_MS} from '../constants/index.js';

const LIVE_QUERY_SUBSYSTEM = Object.freeze({
  QUERY_GROUP: 'query-group',
  LIVE_QUERY_MANAGER: 'live-query-manager',
  LIVE_QUERY_SERVICE: 'live-query-service',
});

const LIVE_QUERY_EVENT = Object.freeze({
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  SNAPSHOT: 'snapshot',
  ERROR: 'error',
});

const LIVE_QUERY_AST_TYPE = Object.freeze({
  BINARY: 'binary',
  UNARY: 'unary',
  LITERAL: 'literal',
  COLUMN_REF: 'column_ref',
  IN: 'in',
  BETWEEN: 'between',
  LIKE: 'like',
  STAR: 'star',
});

const LIVE_QUERY_OPERATOR = Object.freeze({
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  EQUALS: '=',
  NOT_EQUALS: '!=',
  NOT_EQUALS_ALT: '<>',
  LESS_THAN: '<',
  LESS_THAN_OR_EQUAL: '<=',
  GREATER_THAN: '>',
  GREATER_THAN_OR_EQUAL: '>=',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
});

const LIVE_QUERY_SQL = Object.freeze({
  LIVE_PREFIX: 'LIVE ',
  SELECT_PREFIX: 'SELECT',
  SELECT: 'SELECT',
  FROM: 'FROM',
  STAR: '*',
});

const LIVE_QUERY_LOG_MSG = Object.freeze({
  RENEWED: 'Live query renewed',
  CLEANED_UP: 'Live query cleaned up',
  CLIENT_JOINED: 'Client joined query group',
  CLIENT_LEFT: 'Client left query group',
  NO_PARTITION_KEY_FILTER: 'Live query without partition key filter',
  PARTITIONS_LOOKUP_FAILED: 'Failed to find partitions for query',
  FAILED_SEND_CLIENT: 'Failed to send to client',
  UNSUBSCRIBED_PARTITION: 'Unsubscribed from partition',
  SUBSCRIBED_PARTITION: 'Subscribed to partition',
  GROUP_CLEANED_UP: 'Query group cleaned up',
  MANAGER_INITIALIZED: 'Live query manager initialized',
  CLIENT_JOINED_EXISTING: 'Client joined existing query group',
  GROUP_CREATED: 'Created new query group',
  SUBSCRIPTION_CREATED: 'Live query subscription created',
  SNAPSHOT_ENGINE_UNAVAILABLE: 'SQL query engine not available for snapshot',
  SNAPSHOT_SENT: 'Snapshot sent to client',
  SNAPSHOT_FAILED: 'Failed to send snapshot',
  QUERY_RENEWED: 'Live query renewed',
  QUERY_RESUMED: 'Live query resumed',
  QUERY_UNREGISTERED: 'Live query unregistered',
  GROUP_REMOVED: 'Query group removed',
  CLIENT_DISCONNECTED_CLEANUP: 'Client disconnected - cleaned up subscriptions',
  SUBSCRIPTIONS_PARTITION_CHANGE: 'Updating subscriptions for partition change',
  SUBSCRIPTION_EXPIRED: 'Live query subscription expired',
  MANAGER_SHUTDOWN: 'Live query manager shutdown',
});

const LIVE_QUERY_ERROR_MSG = Object.freeze({
  INVALID_SQL: 'Invalid SQL: expected string',
  LIVE_REQUIRES_SELECT: 'LIVE must be followed by SELECT statement',
  CURSOR_TOO_OLD: 'Cursor too old - full resync required',
  MAX_QUERIES_EXCEEDED_PREFIX: 'Maximum concurrent live queries exceeded (',
  MAX_QUERIES_EXCEEDED_SUFFIX: ')',
  QUERY_GROUP_NOT_FOUND_PREFIX: 'Query group not found: ',
});

const LIVE_QUERY_DEFAULT_VALUE = Object.freeze({
  UNKNOWN: STRING.UNKNOWN,
  PRIMARY_KEY_FALLBACK: 'id',
  EMPTY_WHERE: STRING.EMPTY,
});

const LIVE_QUERY_OPERATION = Object.freeze({
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
});

const LIVE_QUERY_REGEX = Object.freeze({
  REGEX_SPECIAL: /[.*+?^${}()|[\]\\]/g,
  PERCENT: /%/g,
  UNDERSCORE: /_/g,
});

const LIVE_QUERY_REGEX_REPLACE = Object.freeze({
  ESCAPE: '\\$&',
  WILDCARD: '.*',
  SINGLE_CHAR: '.',
});

const LIVE_QUERY_REGEX_FLAG = Object.freeze({
  CASE_INSENSITIVE: 'i',
});

const LIVE_QUERY_CURSOR = Object.freeze({
  SEPARATOR: ':',
});

const LIVE_QUERY_EMIT = Object.freeze({
  CHANGE: 'change',
  SUBSCRIPTION_CREATED: 'subscription-created',
  SUBSCRIPTION_RENEWED: 'subscription-renewed',
  SUBSCRIPTION_REMOVED: 'subscription-removed',
  SUBSCRIPTION_EXPIRED: 'subscription-expired',
});

const LIVE_QUERY_CONFIG_KEY = Object.freeze({
  DEFAULT_TTL_MS: CONFIG_KEY.LIVE_QUERY_DEFAULT_TTL_MS,
  MAX_PER_CLIENT: CONFIG_KEY.LIVE_QUERY_MAX_PER_CLIENT,
  CLEANUP_INTERVAL_MS: CONFIG_KEY.LIVE_QUERY_CLEANUP_INTERVAL_MS,
  CURSOR_RETENTION_MS: CONFIG_KEY.LIVE_QUERY_CURSOR_RETENTION_MS,
});

const LIVE_QUERY_DEFAULTS = Object.freeze({
  DEFAULT_TTL_MS: TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  MAX_PER_CLIENT: NUM.HUNDRED,
  CLEANUP_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
  CURSOR_RETENTION_MS: TIME_MS.MINUTE * NUM.FIVE,
});

export {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_EMIT,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_OPERATION,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_REGEX,
  LIVE_QUERY_REGEX_FLAG,
  LIVE_QUERY_REGEX_REPLACE,
  LIVE_QUERY_SQL,
  LIVE_QUERY_SUBSYSTEM,
};
