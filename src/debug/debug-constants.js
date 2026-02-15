/**
 * Shared debug constants for Track A tracing integration.
 *
 * These constants are reused by service/callback tracing,
 * session resolution, and admin stream routing.
 */

const DEBUG_CAPABILITY = Object.freeze({
  TRACE: 'debug.trace',
  BREAKPOINT: 'debug.breakpoint',
  SNAPSHOT: 'debug.snapshot',
});

const DEBUG_TRACE_LEVEL = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
});

const DEBUG_TRACE_LEVEL_SET = new Set(Object.values(DEBUG_TRACE_LEVEL));

const DEBUG_TRACE_SOURCE = Object.freeze({
  SERVICE: 'service',
  PARTITION_CALLBACK: 'partition_callback',
});

const DEBUG_TRACE_FIELD = Object.freeze({
  LEVEL: 'level',
  MESSAGE: 'message',
  CONTEXT: 'context',
  TIMESTAMP: 'timestamp',
  LINEAGE_ID: 'lineageId',
  STAGE_ID: 'stageId',
  PARTITION_ID: 'partitionId',
  NODE_ID: 'nodeId',
  SERVICE_DEFINITION_ID: 'serviceDefinitionId',
  REPLICA_ID: 'replicaId',
  RUNTIME_KIND: 'runtimeKind',
  SOURCE: 'source',
  SESSION_ID: 'sessionId',
});

const DEBUG_SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  DETACHED: 'detached',
});

const DEBUG_DEFAULT = Object.freeze({
  MAX_SESSION_AGE_MS: 300000,
  SUBSCRIBER_ID_PREFIX: 'trace-sub',
});

const DEBUG_ERROR_MSG = Object.freeze({
  TRACE_LEVEL_INVALID_PREFIX: 'Invalid debug trace level: ',
  TRACE_MESSAGE_REQUIRED: 'Debug trace message is required',
  TRACE_EVENT_REQUIRED: 'Debug trace event is required',
  TRACE_COLLECTOR_REQUIRED: 'TraceCollector requires a valid send target',
  TRACE_RESOLVER_SCOPE_REQUIRED: 'DebugSessionResolver scope is required',
});

const DEBUG_LOG_MSG = Object.freeze({
  TRACE_SUBSCRIBER_CONNECTED: 'Trace subscriber connected',
  TRACE_SUBSCRIBER_DISCONNECTED: 'Trace subscriber disconnected',
});

export {
  DEBUG_CAPABILITY,
  DEBUG_TRACE_LEVEL,
  DEBUG_TRACE_LEVEL_SET,
  DEBUG_TRACE_SOURCE,
  DEBUG_TRACE_FIELD,
  DEBUG_SESSION_STATUS,
  DEBUG_DEFAULT,
  DEBUG_ERROR_MSG,
  DEBUG_LOG_MSG,
};
