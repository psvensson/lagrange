/**
 * PostgreSQL wire protocol constants.
 *
 * Message type codes, error/notice field identifiers, transaction
 * states, and error severity/code constants for the PG wire
 * protocol handler.
 *
 * Requirements: 9.1, 9.3
 *
 * @module runtime/pgwire-protocol-constants
 */

// --- Protocol version ---

const PG_PROTOCOL_VERSION = Object.freeze({
  MAJOR: 3,
  MINOR: 0,
  /** 196608 = 3 << 16 | 0 */
  CODE: (3 << 16) | 0,
});

// --- SSL request code ---

const PG_SSL_REQUEST_CODE = (1234 << 16) | 5679;

// --- Frontend (client -> server) message type bytes ---

const PG_FRONTEND_MSG = Object.freeze({
  QUERY: 0x51, // 'Q'
  PARSE: 0x50, // 'P'
  BIND: 0x42, // 'B'
  DESCRIBE: 0x44, // 'D'
  EXECUTE: 0x45, // 'E'
  SYNC: 0x53, // 'S'
  CLOSE: 0x43, // 'C'
  TERMINATE: 0x58, // 'X'
  FLUSH: 0x48, // 'H'
});

// --- Backend (server -> client) message type bytes ---

const PG_BACKEND_MSG = Object.freeze({
  AUTH: 0x52, // 'R'
  PARAMETER_STATUS: 0x53, // 'S'
  BACKEND_KEY_DATA: 0x4B, // 'K'
  READY_FOR_QUERY: 0x5A, // 'Z'
  ROW_DESCRIPTION: 0x54, // 'T'
  DATA_ROW: 0x44, // 'D'
  COMMAND_COMPLETE: 0x43, // 'C'
  ERROR_RESPONSE: 0x45, // 'E'
  NOTICE_RESPONSE: 0x4E, // 'N'
  PARSE_COMPLETE: 0x31, // '1'
  BIND_COMPLETE: 0x32, // '2'
  CLOSE_COMPLETE: 0x33, // '3'
  NO_DATA: 0x6E, // 'n'
  EMPTY_QUERY: 0x49, // 'I'
});

// --- Authentication types ---

const PG_AUTH_TYPE = Object.freeze({
  OK: 0,
  CLEARTEXT_PASSWORD: 3,
  MD5_PASSWORD: 5,
  SASL: 10,
});

// --- Transaction state indicators for ReadyForQuery ---

const PG_TRANSACTION_STATE = Object.freeze({
  IDLE: 0x49, // 'I' - not in transaction
  IN_TRANSACTION: 0x54, // 'T' - in transaction block
  FAILED: 0x45, // 'E' - in failed transaction block
});

// --- Error/Notice field identifiers ---

const PG_ERROR_FIELD = Object.freeze({
  SEVERITY: 0x53, // 'S'
  CODE: 0x43, // 'C'
  MESSAGE: 0x4D, // 'M'
  DETAIL: 0x44, // 'D'
  HINT: 0x48, // 'H'
  POSITION: 0x50, // 'P'
});

// --- Error severity values ---

const PG_SEVERITY = Object.freeze({
  ERROR: 'ERROR',
  FATAL: 'FATAL',
  WARNING: 'WARNING',
  NOTICE: 'NOTICE',
});

// --- SQLSTATE error codes (subset) ---

const PG_ERROR_CODE = Object.freeze({
  SUCCESSFUL_COMPLETION: '00000',
  FEATURE_NOT_SUPPORTED: '0A000',
  PROTOCOL_VIOLATION: '08P01',
  INTERNAL_ERROR: 'XX000',
  SYNTAX_ERROR: '42601',
  INVALID_AUTHORIZATION: '28000',
  CONNECTION_FAILURE: '08006',
  IN_FAILED_TRANSACTION: '25P02',
});

// --- Describe target types ---

const PG_DESCRIBE_TYPE = Object.freeze({
  STATEMENT: 0x53, // 'S'
  PORTAL: 0x50, // 'P'
});

// --- Close target types ---

const PG_CLOSE_TYPE = Object.freeze({
  STATEMENT: 0x53, // 'S'
  PORTAL: 0x50, // 'P'
});

// --- Default server parameters sent during startup ---

const PG_SERVER_PARAMS = Object.freeze({
  server_version: '15.0',
  server_encoding: 'UTF8',
  client_encoding: 'UTF8',
  DateStyle: 'ISO, MDY',
  integer_datetimes: 'on',
  standard_conforming_strings: 'on',
});

// --- Protocol handler error messages ---

const PG_HANDLER_ERROR = Object.freeze({
  ADAPTER_REQUIRED:
    'PostgresWireAdapter instance is required',
  SOCKET_REQUIRED:
    'TCP socket is required',
  UNSUPPORTED_PROTOCOL_VERSION:
    'Unsupported protocol version',
  SSL_NOT_SUPPORTED:
    'SSL connections are not supported',
  MISSING_DATABASE_PARAM:
    'Missing required startup parameter: database',
  UNKNOWN_MESSAGE_TYPE:
    'Unknown frontend message type',
  PARSE_UNNAMED_ONLY:
    'Only unnamed prepared statements are supported',
  DESCRIBE_UNNAMED_ONLY:
    'Only unnamed statement/portal describe is supported',
  EMPTY_QUERY:
    'Empty query string',
  SESSION_CREATION_FAILED:
    'Failed to create session',
});

// --- Protocol handler log messages ---

const PG_HANDLER_LOG = Object.freeze({
  STARTUP_RECEIVED: 'PG wire startup message received',
  AUTH_OK: 'PG wire authentication successful',
  QUERY_RECEIVED: 'PG wire simple query received',
  PARSE_RECEIVED: 'PG wire parse message received',
  BIND_RECEIVED: 'PG wire bind message received',
  EXECUTE_RECEIVED: 'PG wire execute message received',
  SYNC_RECEIVED: 'PG wire sync message received',
  TERMINATE_RECEIVED: 'PG wire terminate received',
  CONNECTION_ERROR: 'PG wire connection error',
  CONNECTION_CLOSED: 'PG wire connection closed',
  UNSUPPORTED_MSG: 'PG wire unsupported message type',
});

// --- Buffer size limits ---

const PG_BUFFER_LIMIT = Object.freeze({
  /** Maximum single message size (16 MB) */
  MAX_MESSAGE_SIZE: 16 * 1024 * 1024,
  /** Minimum bytes needed to read message header (type + length) */
  MSG_HEADER_SIZE: 5,
  /** Startup message header size (length only, no type byte) */
  STARTUP_HEADER_SIZE: 4,
  /** Length field size in bytes */
  LENGTH_FIELD_SIZE: 4,
});

export {
  PG_PROTOCOL_VERSION,
  PG_SSL_REQUEST_CODE,
  PG_FRONTEND_MSG,
  PG_BACKEND_MSG,
  PG_AUTH_TYPE,
  PG_TRANSACTION_STATE,
  PG_ERROR_FIELD,
  PG_SEVERITY,
  PG_ERROR_CODE,
  PG_DESCRIBE_TYPE,
  PG_CLOSE_TYPE,
  PG_SERVER_PARAMS,
  PG_HANDLER_ERROR,
  PG_HANDLER_LOG,
  PG_BUFFER_LIMIT,
};
