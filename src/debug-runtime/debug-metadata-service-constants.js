/**
 * Constants for SQL-backed debug metadata service.
 */

const DEBUG_METADATA_ACTION = Object.freeze({
  CREATE_SESSION: 'debug.createSession',
  ATTACH_SESSION: 'debug.attachSession',
  UPDATE_SESSION: 'debug.updateSession',
  DETACH_SESSION: 'debug.detachSession',
  LIST_SESSIONS: 'debug.listSessions',
  WRITE_BREAKPOINTS: 'debug.writeBreakpoints',
  READ_BREAKPOINTS: 'debug.readBreakpoints',
  WRITE_SNAPSHOT: 'debug.writeSnapshot',
  READ_SNAPSHOT: 'debug.readSnapshot',
  LIST_SNAPSHOTS: 'debug.listSnapshots',
});

const DEBUG_METADATA_ROLE = Object.freeze({
  ADMIN: 'debug_admin',
  ATTACH: 'debug_attach',
  READ: 'debug_read',
  WRITE: 'debug_write',
});

const DEBUG_METADATA_DEFAULT = Object.freeze({
  SESSION_ID_PREFIX: 'debug-meta',
  COLUMN_NUMBER: 0,
  RESOLVED_FALSE: 0,
  RESOLVED_TRUE: 1,
  MAX_LIMIT: 100,
});

const DEBUG_METADATA_ERROR_CODE = Object.freeze({
  ENGINE_REQUIRED: 'ENGINE_REQUIRED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  BREAKPOINTS_REQUIRED: 'BREAKPOINTS_REQUIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
});

const DEBUG_METADATA_ERROR_MSG = Object.freeze({
  ENGINE_REQUIRED: 'SQL query engine is required',
  REQUEST_REQUIRED: 'Debug metadata request is required',
  SESSION_ID_REQUIRED: 'sessionId is required',
  SERVICE_NAME_REQUIRED: 'serviceName is required',
  BREAKPOINTS_REQUIRED: 'breakpoints array is required',
  SNAPSHOT_REQUIRED: 'snapshot artifact is required',
  SESSION_NOT_FOUND: 'Debug session not found',
  SNAPSHOT_NOT_FOUND: 'Debug snapshot not found',
  SECURITY_CONTEXT_REQUIRED: 'securityContext is required',
  AUTHORIZATION_FAILED: 'Debug metadata authorization failed',
});

const DEBUG_METADATA_SQL = Object.freeze({
  INSERT_OR_REPLACE_INTO: 'INSERT OR REPLACE INTO',
  ORDER_BY_CREATED_ASC: ' ORDER BY created_at ASC',
  ORDER_BY_CAPTURED_DESC: ' ORDER BY captured_at DESC',
  LIMIT: ' LIMIT ',
});

const DEBUG_METADATA_ROW_LIMIT = Object.freeze({
  SESSIONS: 50,
  BREAKPOINTS: 200,
  SNAPSHOTS: 50,
});

export {
  DEBUG_METADATA_ACTION,
  DEBUG_METADATA_ROLE,
  DEBUG_METADATA_DEFAULT,
  DEBUG_METADATA_ERROR_CODE,
  DEBUG_METADATA_ERROR_MSG,
  DEBUG_METADATA_SQL,
  DEBUG_METADATA_ROW_LIMIT,
};
