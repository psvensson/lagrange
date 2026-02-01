import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM} from '../constants/index.js';

const ADMIN_SUBSYSTEM = Object.freeze({
  WEBSOCKET_API: 'admin-websocket-api',
});

const ADMIN_ROUTE = Object.freeze({
  HEALTH: '/health',
  STREAM: '/api/admin/stream',
});

const ADMIN_STATUS = Object.freeze({
  HEALTHY: 'healthy',
});

const ADMIN_CLIENT = Object.freeze({
  PREFIX: 'client-',
  RANDOM_BASE: 36,
  RANDOM_START: 2,
  RANDOM_LENGTH: 9,
});

const ADMIN_LIMIT = Object.freeze({
  SQL_PREVIEW_LENGTH: NUM.HUNDRED,
});

const ADMIN_CONFIG_KEY = Object.freeze({
  WEBSOCKET_PORT: CONFIG_KEY.ADMIN_WEBSOCKET_PORT,
  QUERY_TIMEOUT_MS: CONFIG_KEY.ADMIN_QUERY_TIMEOUT_MS,
  CACHE_DUMP_TIMEOUT_MS: CONFIG_KEY.ADMIN_CACHE_DUMP_TIMEOUT_MS,
});

const ADMIN_DEFAULT = Object.freeze({
  NODE_ID: 'admin-api',
  WEBSOCKET_PORT: 8081,
  QUERY_TIMEOUT_MS: 30000,
  CACHE_DUMP_TIMEOUT_MS: 5000,
  HOST: '0.0.0.0',
});

const ADMIN_MESSAGE_TYPE = Object.freeze({
  // Outgoing
  CACHE_DUMP: 'cache_dump',
  CDC_EVENT: 'cdc_event',
  QUERY_RESULT: 'query_result',
  LIVE_QUERY_EVENT: 'live_query_event',
  ERROR: 'error',
  // Incoming
  QUERY: 'query',
  REFRESH: 'refresh',
  LIVE_QUERY_SUBSCRIBE: 'live_query_subscribe',
  LIVE_QUERY_UNSUBSCRIBE: 'live_query_unsubscribe',
});

const ADMIN_ERROR_CODE = Object.freeze({
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  MALFORMED_JSON: 'MALFORMED_JSON',
});

const ADMIN_ERROR_MESSAGE = Object.freeze({
  INVALID_JSON: 'Invalid JSON message',
  MISSING_TYPE: 'Message must have a "type" field',
  MISSING_QUERY_ID: 'Query message must include queryId',
  MISSING_SQL: 'Query message must include sql string',
  QUERY_ENGINE_UNAVAILABLE: 'SQL query engine not available',
  queryTimeout: (timeoutMs) => `Query timeout after ${timeoutMs}ms`,
});

const ADMIN_ERROR_HINT = Object.freeze({
  INVALID_JSON: 'Ensure message is valid JSON',
  MISSING_TYPE: 'Include type field in message',
  MISSING_QUERY_ID: 'Include queryId field',
  MISSING_SQL: 'Include sql field',
});

const ADMIN_ERROR_MATCH = Object.freeze({
  PARSE: 'parse',
  SYNTAX: 'syntax',
  TABLE_NOT_FOUND: 'table not found',
  TABLE_NOT_FOUND_CODE: 'table_not_found',
  TIMEOUT: 'timeout',
});

const ADMIN_LOG_MSG = Object.freeze({
  STARTED: 'Admin WebSocket API started',
  CLIENT_CONNECTED: 'Admin client connected',
  CLIENT_DISCONNECTED: 'Admin client disconnected',
  SOCKET_ERROR: 'WebSocket error',
  CACHE_EMPTY_QUERYING: 'Cache is empty, querying partitions directly',
  CACHE_DUMP_SENT: 'Cache dump sent',
  CACHE_DUMP_FAILED: 'Failed to send cache dump',
  SYSTEM_TABLE_QUERY_FAILED: 'Failed to query system table for dump',
  RECEIVED_MESSAGE: 'Received message',
  UNKNOWN_MESSAGE: 'Ignoring unknown message type',
  EXECUTING_QUERY: 'Executing query',
  QUERY_RESULT_SENT: 'Query result sent',
  REFRESH_REQUESTED: 'Refresh requested',
  SEND_FAILED: 'Failed to send message to client',
  SHUTDOWN: 'Admin WebSocket API shutdown',
  SERVER_CLOSE_ERROR: 'Error closing HTTP server',
});

const ADMIN_CACHE_DUMP = Object.freeze({
  EMPTY: [],
  QUERY_PREFIX: 'SELECT * FROM ',
});

const ADMIN_QUERY_RESULT = Object.freeze({
  AFFECTED_ROWS_DEFAULT: NUM.ZERO,
});

export {
  ADMIN_CONFIG_KEY,
  ADMIN_CLIENT,
  ADMIN_CACHE_DUMP,
  ADMIN_DEFAULT,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_QUERY_RESULT,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
};
