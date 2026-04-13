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
// @ts-nocheck


// --- Protocol version ---
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const PG_PROTOCOL_VERSION = Object.freeze(stryMutAct_9fa48("147751") ? {} : (stryCov_9fa48("147751"), {
  MAJOR: 3,
  MINOR: 0,
  /** 196608 = 3 << 16 | 0 */
  CODE: 3 << 16 | 0
}));

// --- SSL request code ---

const PG_SSL_REQUEST_CODE = 1234 << 16 | 5679;

// --- Frontend (client -> server) message type bytes ---

const PG_FRONTEND_MSG = Object.freeze(stryMutAct_9fa48("147752") ? {} : (stryCov_9fa48("147752"), {
  QUERY: 0x51,
  // 'Q'
  PARSE: 0x50,
  // 'P'
  BIND: 0x42,
  // 'B'
  DESCRIBE: 0x44,
  // 'D'
  EXECUTE: 0x45,
  // 'E'
  SYNC: 0x53,
  // 'S'
  CLOSE: 0x43,
  // 'C'
  TERMINATE: 0x58,
  // 'X'
  FLUSH: 0x48 // 'H'
}));

// --- Backend (server -> client) message type bytes ---

const PG_BACKEND_MSG = Object.freeze(stryMutAct_9fa48("147753") ? {} : (stryCov_9fa48("147753"), {
  AUTH: 0x52,
  // 'R'
  PARAMETER_STATUS: 0x53,
  // 'S'
  BACKEND_KEY_DATA: 0x4B,
  // 'K'
  READY_FOR_QUERY: 0x5A,
  // 'Z'
  ROW_DESCRIPTION: 0x54,
  // 'T'
  DATA_ROW: 0x44,
  // 'D'
  COMMAND_COMPLETE: 0x43,
  // 'C'
  ERROR_RESPONSE: 0x45,
  // 'E'
  NOTICE_RESPONSE: 0x4E,
  // 'N'
  PARSE_COMPLETE: 0x31,
  // '1'
  BIND_COMPLETE: 0x32,
  // '2'
  CLOSE_COMPLETE: 0x33,
  // '3'
  NO_DATA: 0x6E,
  // 'n'
  EMPTY_QUERY: 0x49 // 'I'
}));

// --- Authentication types ---

const PG_AUTH_TYPE = Object.freeze(stryMutAct_9fa48("147754") ? {} : (stryCov_9fa48("147754"), {
  OK: 0,
  CLEARTEXT_PASSWORD: 3,
  MD5_PASSWORD: 5,
  SASL: 10
}));

// --- Transaction state indicators for ReadyForQuery ---

const PG_TRANSACTION_STATE = Object.freeze(stryMutAct_9fa48("147755") ? {} : (stryCov_9fa48("147755"), {
  IDLE: 0x49,
  // 'I' - not in transaction
  IN_TRANSACTION: 0x54,
  // 'T' - in transaction block
  FAILED: 0x45 // 'E' - in failed transaction block
}));

// --- Error/Notice field identifiers ---

const PG_ERROR_FIELD = Object.freeze(stryMutAct_9fa48("147756") ? {} : (stryCov_9fa48("147756"), {
  SEVERITY: 0x53,
  // 'S'
  CODE: 0x43,
  // 'C'
  MESSAGE: 0x4D,
  // 'M'
  DETAIL: 0x44,
  // 'D'
  HINT: 0x48,
  // 'H'
  POSITION: 0x50 // 'P'
}));

// --- Error severity values ---

const PG_SEVERITY = Object.freeze(stryMutAct_9fa48("147757") ? {} : (stryCov_9fa48("147757"), {
  ERROR: stryMutAct_9fa48("147758") ? "" : (stryCov_9fa48("147758"), 'ERROR'),
  FATAL: stryMutAct_9fa48("147759") ? "" : (stryCov_9fa48("147759"), 'FATAL'),
  WARNING: stryMutAct_9fa48("147760") ? "" : (stryCov_9fa48("147760"), 'WARNING'),
  NOTICE: stryMutAct_9fa48("147761") ? "" : (stryCov_9fa48("147761"), 'NOTICE')
}));

// --- SQLSTATE error codes (subset) ---

const PG_ERROR_CODE = Object.freeze(stryMutAct_9fa48("147762") ? {} : (stryCov_9fa48("147762"), {
  SUCCESSFUL_COMPLETION: stryMutAct_9fa48("147763") ? "" : (stryCov_9fa48("147763"), '00000'),
  FEATURE_NOT_SUPPORTED: stryMutAct_9fa48("147764") ? "" : (stryCov_9fa48("147764"), '0A000'),
  PROTOCOL_VIOLATION: stryMutAct_9fa48("147765") ? "" : (stryCov_9fa48("147765"), '08P01'),
  INTERNAL_ERROR: stryMutAct_9fa48("147766") ? "" : (stryCov_9fa48("147766"), 'XX000'),
  SYNTAX_ERROR: stryMutAct_9fa48("147767") ? "" : (stryCov_9fa48("147767"), '42601'),
  INVALID_AUTHORIZATION: stryMutAct_9fa48("147768") ? "" : (stryCov_9fa48("147768"), '28000'),
  CONNECTION_FAILURE: stryMutAct_9fa48("147769") ? "" : (stryCov_9fa48("147769"), '08006'),
  IN_FAILED_TRANSACTION: stryMutAct_9fa48("147770") ? "" : (stryCov_9fa48("147770"), '25P02')
}));

// --- Describe target types ---

const PG_DESCRIBE_TYPE = Object.freeze(stryMutAct_9fa48("147771") ? {} : (stryCov_9fa48("147771"), {
  STATEMENT: 0x53,
  // 'S'
  PORTAL: 0x50 // 'P'
}));

// --- Close target types ---

const PG_CLOSE_TYPE = Object.freeze(stryMutAct_9fa48("147772") ? {} : (stryCov_9fa48("147772"), {
  STATEMENT: 0x53,
  // 'S'
  PORTAL: 0x50 // 'P'
}));

// --- Default server parameters sent during startup ---

const PG_SERVER_PARAMS = Object.freeze(stryMutAct_9fa48("147773") ? {} : (stryCov_9fa48("147773"), {
  server_version: stryMutAct_9fa48("147774") ? "" : (stryCov_9fa48("147774"), '15.0'),
  server_encoding: stryMutAct_9fa48("147775") ? "" : (stryCov_9fa48("147775"), 'UTF8'),
  client_encoding: stryMutAct_9fa48("147776") ? "" : (stryCov_9fa48("147776"), 'UTF8'),
  DateStyle: stryMutAct_9fa48("147777") ? "" : (stryCov_9fa48("147777"), 'ISO, MDY'),
  integer_datetimes: stryMutAct_9fa48("147778") ? "" : (stryCov_9fa48("147778"), 'on'),
  standard_conforming_strings: stryMutAct_9fa48("147779") ? "" : (stryCov_9fa48("147779"), 'on')
}));

// --- Protocol handler error messages ---

const PG_HANDLER_ERROR = Object.freeze(stryMutAct_9fa48("147780") ? {} : (stryCov_9fa48("147780"), {
  ADAPTER_REQUIRED: stryMutAct_9fa48("147781") ? "" : (stryCov_9fa48("147781"), 'PostgresWireAdapter instance is required'),
  SOCKET_REQUIRED: stryMutAct_9fa48("147782") ? "" : (stryCov_9fa48("147782"), 'TCP socket is required'),
  UNSUPPORTED_PROTOCOL_VERSION: stryMutAct_9fa48("147783") ? "" : (stryCov_9fa48("147783"), 'Unsupported protocol version'),
  SSL_NOT_SUPPORTED: stryMutAct_9fa48("147784") ? "" : (stryCov_9fa48("147784"), 'SSL connections are not supported'),
  MISSING_DATABASE_PARAM: stryMutAct_9fa48("147785") ? "" : (stryCov_9fa48("147785"), 'Missing required startup parameter: database'),
  UNKNOWN_MESSAGE_TYPE: stryMutAct_9fa48("147786") ? "" : (stryCov_9fa48("147786"), 'Unknown frontend message type'),
  PARSE_UNNAMED_ONLY: stryMutAct_9fa48("147787") ? "" : (stryCov_9fa48("147787"), 'Only unnamed prepared statements are supported'),
  DESCRIBE_UNNAMED_ONLY: stryMutAct_9fa48("147788") ? "" : (stryCov_9fa48("147788"), 'Only unnamed statement/portal describe is supported'),
  EMPTY_QUERY: stryMutAct_9fa48("147789") ? "" : (stryCov_9fa48("147789"), 'Empty query string'),
  SESSION_CREATION_FAILED: stryMutAct_9fa48("147790") ? "" : (stryCov_9fa48("147790"), 'Failed to create session')
}));

// --- Protocol handler log messages ---

const PG_HANDLER_LOG = Object.freeze(stryMutAct_9fa48("147791") ? {} : (stryCov_9fa48("147791"), {
  STARTUP_RECEIVED: stryMutAct_9fa48("147792") ? "" : (stryCov_9fa48("147792"), 'PG wire startup message received'),
  AUTH_OK: stryMutAct_9fa48("147793") ? "" : (stryCov_9fa48("147793"), 'PG wire authentication successful'),
  QUERY_RECEIVED: stryMutAct_9fa48("147794") ? "" : (stryCov_9fa48("147794"), 'PG wire simple query received'),
  PARSE_RECEIVED: stryMutAct_9fa48("147795") ? "" : (stryCov_9fa48("147795"), 'PG wire parse message received'),
  BIND_RECEIVED: stryMutAct_9fa48("147796") ? "" : (stryCov_9fa48("147796"), 'PG wire bind message received'),
  EXECUTE_RECEIVED: stryMutAct_9fa48("147797") ? "" : (stryCov_9fa48("147797"), 'PG wire execute message received'),
  SYNC_RECEIVED: stryMutAct_9fa48("147798") ? "" : (stryCov_9fa48("147798"), 'PG wire sync message received'),
  TERMINATE_RECEIVED: stryMutAct_9fa48("147799") ? "" : (stryCov_9fa48("147799"), 'PG wire terminate received'),
  CONNECTION_ERROR: stryMutAct_9fa48("147800") ? "" : (stryCov_9fa48("147800"), 'PG wire connection error'),
  CONNECTION_CLOSED: stryMutAct_9fa48("147801") ? "" : (stryCov_9fa48("147801"), 'PG wire connection closed'),
  UNSUPPORTED_MSG: stryMutAct_9fa48("147802") ? "" : (stryCov_9fa48("147802"), 'PG wire unsupported message type')
}));

// --- Buffer size limits ---

const PG_BUFFER_LIMIT = Object.freeze(stryMutAct_9fa48("147803") ? {} : (stryCov_9fa48("147803"), {
  /** Maximum single message size (16 MB) */
  MAX_MESSAGE_SIZE: stryMutAct_9fa48("147804") ? 16 * 1024 / 1024 : (stryCov_9fa48("147804"), (stryMutAct_9fa48("147805") ? 16 / 1024 : (stryCov_9fa48("147805"), 16 * 1024)) * 1024),
  /** Minimum bytes needed to read message header (type + length) */
  MSG_HEADER_SIZE: 5,
  /** Startup message header size (length only, no type byte) */
  STARTUP_HEADER_SIZE: 4,
  /** Length field size in bytes */
  LENGTH_FIELD_SIZE: 4
}));
export { PG_PROTOCOL_VERSION, PG_SSL_REQUEST_CODE, PG_FRONTEND_MSG, PG_BACKEND_MSG, PG_AUTH_TYPE, PG_TRANSACTION_STATE, PG_ERROR_FIELD, PG_SEVERITY, PG_ERROR_CODE, PG_DESCRIBE_TYPE, PG_CLOSE_TYPE, PG_SERVER_PARAMS, PG_HANDLER_ERROR, PG_HANDLER_LOG, PG_BUFFER_LIMIT };