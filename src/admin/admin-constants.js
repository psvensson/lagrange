import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM} from '../constants/index.js';

const ADMIN_SUBSYSTEM = Object.freeze({
  WEBSOCKET_API: 'admin-websocket-api',
});

const ADMIN_ROUTE = Object.freeze({
  ROOT: '/',
  HEALTH: '/health',
  STREAM: '/api/admin/stream',
  TEST_DASHBOARD: '/ui/tests',
  TESTS: '/api/admin/tests',
  TEST_RUNS: '/api/admin/test-runs',
  TEST_RUN_BY_ID: '/api/admin/test-runs/:runId',
  TEST_RUN_STOP: '/api/admin/test-runs/:runId/stop',
  TEST_RUN_STREAM: '/api/admin/test-runs/:runId/stream',
  SERVICE_DIAGNOSTICS: '/api/admin/diagnostics/services',
  CONTROL_SNAPSHOT: '/api/admin/control-snapshot',
  DEBUG_SESSIONS: '/api/admin/debug/sessions',
  DEBUG_SESSION_BY_ID: '/api/admin/debug/sessions/:sessionId',
  DEBUG_SESSION_ATTACH: '/api/admin/debug/sessions/:sessionId/attach',
  DEBUG_SESSION_BREAKPOINTS: '/api/admin/debug/sessions/:sessionId/breakpoints',
  DEBUG_SESSION_SNAPSHOTS: '/api/admin/debug/sessions/:sessionId/snapshots',
  DEBUG_SNAPSHOT_BY_ID: '/api/admin/debug/snapshots/:snapshotId',
  DEBUG_DAP_REQUEST: '/api/admin/debug/dap/request',
  DEBUG_TRACE_STREAM: '/api/admin/debug/trace',
  PLAYBACK_VIEWER: '/ui/playback-viewer',
  OUTPUT_FILES: '/ui/test-output/*',
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
  QUERY_TIMEOUT_MS: CONFIG_KEY.ADMIN_QUERY_TIMEOUT_MS,
  CACHE_DUMP_TIMEOUT_MS: CONFIG_KEY.ADMIN_CACHE_DUMP_TIMEOUT_MS,
});

const ADMIN_DEFAULT = Object.freeze({
  NODE_ID: 'admin-api',
  WEBSOCKET_PORT: 8081,
  QUERY_TIMEOUT_MS: 30000,
  CACHE_DUMP_TIMEOUT_MS: 5000,
  HOST: '0.0.0.0',
  ENFORCEMENT_MODE: 'observe',
});

const ADMIN_STANDALONE_DEFAULT = Object.freeze({
  HOST: '127.0.0.1',
  PORT: 8181,
  NODE_ID: 'standalone-test-run-server',
});

const ADMIN_CONTENT_TYPE = Object.freeze({
  HTML: 'text/html; charset=utf-8',
  JSON: 'application/json; charset=utf-8',
  NDJSON: 'application/x-ndjson; charset=utf-8',
  JAVASCRIPT: 'application/javascript; charset=utf-8',
  CSS: 'text/css; charset=utf-8',
  TEXT: 'text/plain; charset=utf-8',
  EVENT_STREAM: 'text/event-stream; charset=utf-8',
});

const ADMIN_HEADER = Object.freeze({
  TENANT_ID: 'x-tenant-id',
  PRINCIPAL: 'x-principal',
  ROLES: 'x-roles',
});

const ADMIN_TEST_RUN_PATH = Object.freeze({
  SCENARIOS_DIR: 'test/distributed/scenarios',
  CONFIG_DIR: 'test/distributed/config',
  RUNNER_SCRIPT: 'test/distributed/run.js',
  OUTPUT_DIR: 'test-output',
  METADATA_DIR: '.run-metadata',
  DASHBOARD_PAGE: 'src/admin/static/test-run-dashboard.html',
  PLAYBACK_VIEWER: 'test/distributed/harness/playback-viewer.html',
});

const ADMIN_TEST_RUN_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  PASSED: 'passed',
  FAILED: 'failed',
});

const ADMIN_TEST_LOG_STREAM = Object.freeze({
  STDOUT: 'stdout',
  STDERR: 'stderr',
  SYSTEM: 'system',
  ARCHIVE: 'archive',
});

const ADMIN_TEST_STREAM_EVENT = Object.freeze({
  LOG: 'log',
  STATUS: 'status',
  PROGRESS: 'progress',
});

const ADMIN_TEST_DEFAULT = Object.freeze({
  CONFIG_FILE: 'local.json',
  LOG_LINE_LIMIT: 2000,
  ARCHIVE_LOG_LINE_LIMIT: 500,
  STREAM_RETRY_MS: 1000,
  REPORT_EXTENSION: '.report.json',
  SCENARIO_EXTENSION: '.js',
  CONFIG_EXTENSION: '.json',
  TIMELINE_FILENAME: '_timeline.log',
  PLAYBACK_EVENTS_FILENAME: 'events.ndjson',
  PLAYBACK_SAMPLES_FILENAME: 'samples.ndjson',
  PLAYBACK_SNAPSHOTS_FILENAME: 'snapshots.ndjson',
  PLAYBACK_MANIFEST_FILENAME: 'playback-manifest.json',
  GIT_HASH_UNKNOWN: 'unknown',
  SIGNAL_TERM: 'SIGTERM',
});

const ADMIN_TEST_ERROR_MSG = Object.freeze({
  RUN_NOT_FOUND: 'Test run not found',
  RUN_NOT_ACTIVE: 'Test run is not active',
  RUN_DELETE_ACTIVE: 'Cannot delete an active test run',
  SCENARIO_REQUIRED: 'Scenario is required',
  SCENARIO_NOT_FOUND: 'Scenario not found',
  CONFIG_NOT_FOUND: 'Config not found',
  CONFIG_PREFLIGHT_FAILED: 'Config preflight failed',
  OUTPUT_PATH_INVALID: 'Output path is invalid',
  DASHBOARD_NOT_FOUND: 'Admin test dashboard page not found',
  PLAYBACK_VIEWER_NOT_FOUND: 'Playback viewer page not found',
});

const ADMIN_DEBUG_ERROR_MSG = Object.freeze({
  SECURITY_CONTEXT_REQUIRED: 'Debug route requires tenant and principal headers',
  SERVICE_UNAVAILABLE: 'Debug metadata service is not available',
  DAP_UNAVAILABLE: 'Debug DAP router is not available',
});

const ADMIN_ENFORCEMENT_MODE = Object.freeze({
  OBSERVE: 'observe',
  ENFORCE: 'enforce',
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
  PARTITION_CALLBACK: 'partition_callback',
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
  MISSING_CALLBACK_STATEMENT:
    'Partition callback message must include statement string',
  MISSING_CALLBACK_MODULE_REF:
    'Partition callback message must include callbackModuleRef',
  MISSING_CALLBACK_EXPORT:
    'Partition callback message must include callbackExport',
  MISSING_CALLBACK_RUNTIME_KIND:
    'Partition callback message must include runtimeKind',
  QUERY_ENGINE_UNAVAILABLE: 'SQL query engine not available',
  SERVICE_DIAGNOSTICS_UNAVAILABLE:
    'Service lifecycle diagnostics provider is not available',
  SERVICE_DISPATCH_OPERATION_UNSUPPORTED:
    'Unsupported admin service-dispatch operation',
  SYSTEM_CACHE_EMPTY: 'System table cache is empty',
  CONTROL_SNAPSHOT_SCOPE_UNSUPPORTED:
    'Control snapshot scope must be "local"',
  CONTROL_SNAPSHOT_UNAVAILABLE:
    'Control snapshot unavailable because system cache is not configured',
  LIVE_QUERY_MANAGER_UNAVAILABLE:
    'Live query manager not available',
  LIVE_QUERY_MISSING_SUBSCRIPTION_ID:
    'Live query subscribe must include subscriptionId',
  LIVE_QUERY_MISSING_SQL:
    'Live query subscribe must include sql string',
  LIVE_QUERY_PARSE_FAILED:
    'Failed to parse live query SQL',
  queryTimeout: (timeoutMs) => `Query timeout after ${timeoutMs}ms`,
});

const ADMIN_ERROR_HINT = Object.freeze({
  INVALID_JSON: 'Ensure message is valid JSON',
  MISSING_TYPE: 'Include type field in message',
  MISSING_QUERY_ID: 'Include queryId field',
  MISSING_SQL: 'Include sql field',
  MISSING_CALLBACK_STATEMENT: 'Include statement field',
  MISSING_CALLBACK_MODULE_REF: 'Include callbackModuleRef field',
  MISSING_CALLBACK_EXPORT: 'Include callbackExport field',
  MISSING_CALLBACK_RUNTIME_KIND: 'Include runtimeKind field',
  LIVE_QUERY_MISSING_SUBSCRIPTION_ID: 'Include subscriptionId field',
  LIVE_QUERY_MISSING_SQL: 'Include sql field with LIVE SELECT statement',
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
  TEST_RUN_STARTED: 'Admin test run started',
  TEST_RUN_FINISHED: 'Admin test run finished',
  TEST_RUN_STOP_REQUESTED: 'Admin test run stop requested',
  TEST_RUN_DELETED: 'Admin test run deleted',
  TEST_RUN_LOG_STREAM_SUBSCRIBED: 'Admin test run log stream subscribed',
  TEST_RUN_LOG_STREAM_UNSUBSCRIBED: 'Admin test run log stream unsubscribed',
  TRACE_STREAM_SUBSCRIBED: 'Admin debug trace stream subscribed',
  TRACE_STREAM_UNSUBSCRIBED: 'Admin debug trace stream unsubscribed',
  LIVE_QUERY_SUBSCRIBED: 'Live query subscription registered',
  LIVE_QUERY_UNSUBSCRIBED: 'Live query subscription removed',
  LIVE_QUERY_SUBSCRIBE_FAILED: 'Live query subscribe failed',
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

const ADMIN_CONTROL_SNAPSHOT = Object.freeze({
  QUERY_SQL: 'SELECT * FROM control_snapshot_local()',
  QUERY_SCOPE_KEY: 'scope',
  QUERY_SCOPE_LOCAL: 'local',
  SCHEMA_VERSION: 1,
  TABLE_NAME: 'control_snapshot_local',
  IN_FLIGHT_EXCLUDED_STATUSES: Object.freeze([
    'active',
    'removed',
    'failed',
  ]),
});

export {
  ADMIN_CONTENT_TYPE,
  ADMIN_CONFIG_KEY,
  ADMIN_DEBUG_ERROR_MSG,
  ADMIN_CLIENT,
  ADMIN_CACHE_DUMP,
  ADMIN_DEFAULT,
  ADMIN_STANDALONE_DEFAULT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_HEADER,
  ADMIN_QUERY_RESULT,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_LOG_STREAM,
  ADMIN_TEST_RUN_PATH,
  ADMIN_TEST_RUN_STATUS,
  ADMIN_TEST_STREAM_EVENT,
};
