import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, STRING, TIME_MS} from '../constants/index.js';

const LIVE_QUERY_SUBSYSTEM = Object.freeze({
  QUERY_GROUP: 'query-group',
  LIVE_QUERY_MANAGER: 'live-query-manager',
});

const LIVE_QUERY_EVENT = Object.freeze({
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  ADDED: 'added',
  MODIFIED: 'modified',
  REMOVED: 'removed',
  RESET: 'reset',
  SNAPSHOT: 'snapshot',
  ERROR: 'error',
});

// The row fields a live-query event may carry, each named once (the
// "Event fields" contract of architecture/live-query-data-plane.md): `data`,
// the row the event is about; the row before an update; `rows`, the result
// of a snapshot or reset.
const LIVE_QUERY_EVENT_ROW_FIELDS = Object.freeze(['data', 'oldData', 'rows']);

const LIVE_QUERY_AST_TYPE = Object.freeze({
  AGGR_FUNC: 'aggr_func',
  AGGREGATE: 'aggregate',
  BETWEEN: 'between',
  BINARY: 'binary',
  COLUMN_REF: 'column_ref',
  FUNCTION: 'function',
  IN: 'in',
  LIKE: 'like',
  LITERAL: 'literal',
  STAR: 'star',
  UNARY: 'unary',
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
  AS: 'AS',
  DISTINCT: 'DISTINCT',
  FROM: 'FROM',
  GROUP_BY: 'GROUP BY',
  HAVING: 'HAVING',
  LIMIT: 'LIMIT',
  LIVE_PREFIX: 'LIVE ',
  NULL: 'NULL',
  OFFSET: 'OFFSET',
  ORDER_BY: 'ORDER BY',
  SELECT: 'SELECT',
  SELECT_PREFIX: 'SELECT',
  STAR: '*',
  WHERE: 'WHERE',
});

const LIVE_QUERY_GROUP_STATE = Object.freeze({
  CLOSED: 'CLOSED',
  INITIALIZING: 'INITIALIZING',
  LIVE: 'LIVE',
});

const LIVE_QUERY_LOG_MSG = Object.freeze({
  CLIENT_JOINED: 'Client joined query group',
  CLIENT_LEFT: 'Client left query group',
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
  QUERY_UNREGISTERED: 'Live query unregistered',
  GROUP_REMOVED: 'Query group removed',
  CLIENT_DISCONNECTED_CLEANUP: 'Client disconnected - cleaned up subscriptions',
  SUBSCRIPTIONS_PARTITION_CHANGE: 'Updating subscriptions for partition change',
  SUBSCRIPTION_EXPIRED: 'Live query subscription expired',
  MANAGER_SHUTDOWN: 'Live query manager shutdown',
  REEXECUTION_FAILED: 'Query re-execution failed',
  UNSUBSCRIBE_PARTITION_FAILED: 'Failed to unsubscribe from partition during cleanup',
});

const LIVE_QUERY_ERROR_MSG = Object.freeze({
  INVALID_SQL: 'Invalid SQL: expected string',
  LIVE_REQUIRES_SELECT: 'LIVE must be followed by SELECT statement',
  MAX_QUERIES_EXCEEDED_PREFIX: 'Maximum concurrent live queries exceeded (',
  MAX_QUERIES_EXCEEDED_SUFFIX: ')',
});

const LIVE_QUERY_ERROR_CODE = Object.freeze({
  ROW_KEY_MISSING: 'LIVE_QUERY_ROW_KEY_MISSING',
});

const LIVE_QUERY_DEFAULT_VALUE = Object.freeze({
  UNKNOWN: STRING.UNKNOWN,
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
  SUBSCRIPTION_REMOVED: 'subscription-removed',
  SUBSCRIPTION_EXPIRED: 'subscription-expired',
});

const LIVE_QUERY_CONFIG_KEY = Object.freeze({
  DEFAULT_TTL_MS: CONFIG_KEY.LIVE_QUERY_DEFAULT_TTL_MS,
  MAX_PER_CLIENT: CONFIG_KEY.LIVE_QUERY_MAX_PER_CLIENT,
  CLEANUP_INTERVAL_MS: CONFIG_KEY.LIVE_QUERY_CLEANUP_INTERVAL_MS,
});

const LIVE_QUERY_DEFAULTS = Object.freeze({
  DEFAULT_TTL_MS: TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  MAX_PER_CLIENT: NUM.HUNDRED,
  CLEANUP_INTERVAL_MS: TIME_MS.SECOND * NUM.FIVE,
});

export {
  LIVE_QUERY_AST_TYPE,
  LIVE_QUERY_CONFIG_KEY,
  LIVE_QUERY_CURSOR,
  LIVE_QUERY_DEFAULTS,
  LIVE_QUERY_DEFAULT_VALUE,
  LIVE_QUERY_EMIT,
  LIVE_QUERY_ERROR_CODE,
  LIVE_QUERY_ERROR_MSG,
  LIVE_QUERY_EVENT,
  LIVE_QUERY_GROUP_STATE,
  LIVE_QUERY_LOG_MSG,
  LIVE_QUERY_EVENT_ROW_FIELDS,
  LIVE_QUERY_OPERATION,
  LIVE_QUERY_OPERATOR,
  LIVE_QUERY_REGEX,
  LIVE_QUERY_REGEX_FLAG,
  LIVE_QUERY_REGEX_REPLACE,
  LIVE_QUERY_SQL,
  LIVE_QUERY_SUBSYSTEM,
};
