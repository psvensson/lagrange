const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_PRESSUREGOVERNOR = 'pressureGovernor';
const LOCAL_STR_LSYAT = 'pendingWriteGrowthCount';
const LOCAL_STR_BACKGROUND = 'background';
const LOCAL_STR_LOGSOWNER = 'logsOwner';
const LOCAL_STR_LOGS = 'logs';
const LOCAL_STR_WRITE = 'write';
const LOCAL_STR_12XVB = 'CONTROL_PLANE_PRESSURE_DEGRADED';
const LOCAL_STR_OV8OK = 'Distributed operation failed due to participant failures';
const LOCAL_STR_CONNECTION_TO_NODE = 'Connection to node';
const LOCAL_STR_CLOSED = 'closed';
const LOCAL_STR_10U11 = 'No connection to node';
const LOCAL_STR_MESSAGE_TIMEOUT = 'Message timeout';
const LOCAL_STR_1Y4H5 = 'Query routing failed';
const LOCAL_STR_10811 = 'Failed to forward write to leader';
const LOCAL_STR_10NUJ = 'control-plane:write';
const LOCAL_STR_1KX9P = 'control-plane:read';
const LOCAL_STR_121M5 = 'control-plane:table:logs';
const LOCAL_STR_1SYL3 = 'transport:logs-writer';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_INFO = 'INFO';
const LOCAL_STR_PIPE = '|';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_1M0NB = 'retainedBacklogGrowthCount';

const LOGGING_METRIC_PREFIX = 'metrics.logging.';
const LOGS_TABLE_METRIC_PREFIX = 'metrics.logs_table.';
const LOG_RETENTION_METRIC_PREFIX = 'metrics.log_retention.';
const LOG_QUERY_METRIC_PREFIX = 'metrics.log_query.';
const LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS = Object.freeze([
  LOCAL_STR_1SYL3,
]);
const LOGS_TABLE_CONTROL_PLANE_WRITE_PRESSURE_RESOURCE_KEYS = Object.freeze([
  LOCAL_STR_10NUJ,
  LOCAL_STR_121M5,
]);
const LOGS_TABLE_CONTROL_PLANE_QUERY_PRESSURE_RESOURCE_KEYS = Object.freeze([
  LOCAL_STR_1KX9P,
  LOCAL_STR_121M5,
]);
const LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS = Object.freeze([
  ...LOGS_TABLE_CONTROL_PLANE_WRITE_PRESSURE_RESOURCE_KEYS,
  ...LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS,
]);

const LOGGING_PIPELINE_METRIC_PREFIX = Object.freeze({
  LOGGING: LOGGING_METRIC_PREFIX,
  LOGS_TABLE: LOGS_TABLE_METRIC_PREFIX,
  LOG_RETENTION: LOG_RETENTION_METRIC_PREFIX,
  LOG_QUERY: LOG_QUERY_METRIC_PREFIX,
});
const LOGGING_PIPELINE_METRIC_PREFIXES = Object.freeze(
  Object.values(LOGGING_PIPELINE_METRIC_PREFIX),
);

const LOGS_TABLE_CONNECTED_EVENT = 'connected';
const LOGS_TABLE_FLUSHED_EVENT = 'flushed';
const LOGS_TABLE_EVENT = Object.freeze({
  CONNECTED: LOGS_TABLE_CONNECTED_EVENT,
  FLUSHED: LOGS_TABLE_FLUSHED_EVENT,
});
const LOGS_TABLE_FLUSH_MODE = 'background';
const LOGS_TABLE_CONNECT_METRIC =
  'metrics.logging.logs_table_connect.start';
const LOGS_TABLE_OWNER = 'LogsTableService';
const MIN_CHUNK_SIZE = 1;
const MIN_YIELD_MS = 0;
const MIN_SLEEP_MS = 1;
const LOG_PRESSURE_FAMILY = Object.freeze({
  CONNECTION_CLOSED: 'connection_closed',
  NO_CONNECTION: 'no_connection',
  MESSAGE_TIMEOUT: 'message_timeout',
  QUERY_ROUTING_FAILED: 'query_routing_failed',
  PARTICIPANT_FAILURE: 'participant_failure',
  FORWARD_WRITE_FAILED: 'forward_write_failed',
});
const LOG_PRESSURE_MESSAGE_FRAGMENT = Object.freeze({
  CONNECTION_CLOSED: 'Connection to node',
  NO_CONNECTION: 'No connection to node',
  MESSAGE_TIMEOUT: 'Message timeout',
  QUERY_ROUTING_FAILED: 'Query routing failed',
  PARALLEL_QUERY_EXECUTION_FAILED: 'Parallel query execution failed',
  QUERY_EXECUTION_FAILED: 'Query execution failed',
  PARTITION_ROUTING_CANDIDATES_FILTERED_BY_READINESS:
    'Partition routing candidates filtered by readiness',
  PARTICIPANT_FAILURE:
    'Distributed operation failed due to participant failures',
  TRANSIENT_CDC_SQL_ERROR: 'Transient CDC SQL error',
  TRANSIENT_CDC_SQL_EXCEPTION: 'Transient CDC SQL exception',
  FAILED_TO_UPDATE_SYSTEM_TABLE_ROW: 'Failed to update system table row',
  FAILED_TO_QUERY_OPERATIONS_FROM_SYSTEM_TABLE:
    'Failed to query operations from system table',
  DEFERRED_RETRYABLE_REPLICA_OPERATION_TRANSITION_FAILURE:
    'Deferred retryable replica operation transition failure',
  FAILED_TO_RECONNECT_TARGET_NODE_BEFORE_DELIVERY:
    'Failed to reconnect target node before delivery',
  RECONNECTION_FAILED: 'Reconnection failed',
  WEBSOCKET_ERROR: 'WebSocket error',
  FORWARD_WRITE_FAILED: 'Failed to forward write to leader',
});

export {
  LOCAL_NUM_ZERO,
  LOCAL_NUM_ONE,
  LOCAL_STR_FUNCTION,
  LOCAL_STR_MESSAGEROUTER,
  LOCAL_STR_PRESSUREGOVERNOR,
  LOCAL_STR_LSYAT,
  LOCAL_STR_BACKGROUND,
  LOCAL_STR_LOGSOWNER,
  LOCAL_STR_LOGS,
  LOCAL_STR_WRITE,
  LOCAL_STR_12XVB,
  LOCAL_STR_OV8OK,
  LOCAL_STR_CONNECTION_TO_NODE,
  LOCAL_STR_CLOSED,
  LOCAL_STR_10U11,
  LOCAL_STR_MESSAGE_TIMEOUT,
  LOCAL_STR_1Y4H5,
  LOCAL_STR_10811,
  LOCAL_STR_10NUJ,
  LOCAL_STR_121M5,
  LOCAL_STR_STRING,
  LOCAL_STR_INFO,
  LOCAL_STR_PIPE,
  LOCAL_STR_EMPTY,
  LOCAL_STR_1M0NB,
  LOGS_TABLE_CONTROL_PLANE_QUERY_PRESSURE_RESOURCE_KEYS,
  LOGS_TABLE_SHARED_PRESSURE_RESOURCE_KEYS,
  LOGS_TABLE_TRANSPORT_PRESSURE_RESOURCE_KEYS,
  LOGGING_PIPELINE_METRIC_PREFIXES,
  LOGS_TABLE_EVENT,
  LOGS_TABLE_FLUSH_MODE,
  LOGS_TABLE_CONNECT_METRIC,
  LOGS_TABLE_OWNER,
  MIN_CHUNK_SIZE,
  MIN_YIELD_MS,
  MIN_SLEEP_MS,
  LOG_PRESSURE_FAMILY,
  LOG_PRESSURE_MESSAGE_FRAGMENT,
};
