/**
 * PgWireProtocolHandler — PostgreSQL wire protocol message handler.
 *
 * Handles startup/auth handshake, simple query protocol, and
 * extended query protocol (Parse/Bind/Describe/Execute/Sync).
 * Maps all SQL execution to canonical SqlRequest through the
 * existing PostgresWireAdapter.
 *
 * Requirements: 8.1, 9.1, 9.4, 10.1
 *
 * @module runtime/pgwire-protocol-handler
 */

import {randomUUID} from 'node:crypto';
import {
  PG_PROTOCOL_VERSION,
  PG_SSL_REQUEST_CODE,
  PG_SSL_RESPONSE,
  PG_FRONTEND_MSG,
  PG_TRANSACTION_STATE,
  PG_SEVERITY,
  PG_ERROR_CODE,
  PG_SERVER_PARAMS,
  PG_HANDLER_ERROR,
  PG_HANDLER_LOG,
  PG_BUFFER_LIMIT,
} from './pgwire-protocol-constants.js';
import {PgWireSession} from './pgwire-session.js';
import {
  buildAuthOk,
  buildAuthCleartextPassword,
  buildParameterStatus,
  buildBackendKeyData,
  buildReadyForQuery,
  buildErrorResponse,
  buildRowDescription,
  buildDataRow,
  buildCommandComplete,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
  buildEmptyQueryResponse,
} from './pgwire-message-builders.js';
import {
  parseStartupParams,
  parseQueryMessage,
  parseParseMessage,
  parseBindMessage,
  parseDescribeMessage,
  parseExecuteMessage,
  parseCloseMessage,
} from './pgwire-message-parsers.js';
import {
  deriveCommandTag,
  extractColumns,
  extractRowValues,
} from './pgwire-result-mapper.js';
import {
  writeCString,
  readCString,
} from './pgwire-buffer-codec.js';
import {
  PGWIRE_AUTH_MODE,
  PGWIRE_TLS_MODE,
} from './pgwire-descriptor.js';
import {upgradePgwireSocketToTls} from './pgwire-tls-context.js';
import {PgWireExtendedQueryHandler} from
  './pgwire-extended-query-handler.js';

const LOCAL_STR_BEGIN = 'BEGIN';
const LOCAL_STR_COMMIT = 'COMMIT';
const LOCAL_STR_ROLLBACK = 'ROLLBACK';
const LOCAL_NUM_INT32_MAX = 0x7FFFFFFF;
const LOCAL_STR_DATA = 'data';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CLOSE = 'close';
const LOCAL_NUM_SIXTEEN = 16;
const LOCAL_STR_CURRENT_TRANSACTION_IS_ABORTED_COMMANDS = 'current transaction is aborted, commands ignored ';
const LOCAL_STR_UNTIL_END_OF_TRANSACTION_BLOCK = 'until end of transaction block';

// --- Internal handler states ---

const HANDLER_PHASE = Object.freeze({
  STARTUP: 'startup',
  AUTHENTICATION: 'authentication',
  NORMAL: 'normal',
  CLOSED: 'closed',
});

/**
 * PgWireProtocolHandler — handles one TCP connection's PG wire
 * protocol lifecycle.
 *
 * Wired into the TCP server created by pgwire-runtime-module.
 * Each connection gets its own handler instance.
 */
class PgWireProtocolHandler {
  /**
   * @param {Object} options
   * @param {Object} options.adapter - PostgresWireAdapter instance.
   * @param {import('node:net').Socket} options.socket - TCP socket.
   * @param {string} [options.authMode] - Explicit descriptor auth mode.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options) {
    if (!options || !options.adapter) {
      throw new Error(PG_HANDLER_ERROR.ADAPTER_REQUIRED);
    }
    if (!options.socket) {
      throw new Error(PG_HANDLER_ERROR.SOCKET_REQUIRED);
    }
    this._adapter = options.adapter;
    this._socket = options.socket;
    this._logger = options.logger || console;
    this._authMode = options.authMode || PGWIRE_AUTH_MODE.TRUST;
    this._tlsMode = options.tlsMode || PGWIRE_TLS_MODE.DISABLE;
    this._secureContext = options.secureContext || null;
    this._tlsSocketFactory = options.tlsSocketFactory ||
      upgradePgwireSocketToTls;
    this._tlsActive = false;
    this._phase = HANDLER_PHASE.STARTUP;
    this._session = null;
    this._pendingAuth = null;
    this._buffer = Buffer.alloc(0);
    this._processing = Promise.resolve();
    this._pid = (Math.random() * LOCAL_NUM_INT32_MAX) | 0;
    this._secretKey = (Math.random() * LOCAL_NUM_INT32_MAX) | 0;

    this._onData = this._onData.bind(this);
    this._onError = this._onError.bind(this);
    this._onClose = this._onClose.bind(this);
    this._extendedQueryHandler = new PgWireExtendedQueryHandler({
      getSession: () => this._session,
      getSocket: () => this._socket,
      executeAndSend: (query, params) => this._executeAndSend(query, params),
      destroyConnection: () => this.destroy(),
      logger: this._logger,
    });
  }

  /**
   * Start handling the connection.
   * Attaches socket event listeners and begins protocol handling.
   */
  start() {
    this._socket.on(LOCAL_STR_DATA, this._onData);
    this._socket.on(LOCAL_STR_ERROR, this._onError);
    this._socket.on(LOCAL_STR_CLOSE, this._onClose);
  }

  /**
   * Detach listeners and close session.
   */
  destroy() {
    this._phase = HANDLER_PHASE.CLOSED;
    this._socket.removeListener(LOCAL_STR_DATA, this._onData);
    this._socket.removeListener(LOCAL_STR_ERROR, this._onError);
    this._socket.removeListener(LOCAL_STR_CLOSE, this._onClose);
    if (this._session && !this._session.isClosed()) {
      const sid = this._session.sessionId;
      this._adapter.closeSession(sid);
      this._session.close();
    }
    this._pendingAuth = null;
    this._buffer = Buffer.alloc(0);
  }

  /**
   * Get the session (for testing).
   * @return {PgWireSession|null}
   */
  getSession() {
    return this._session;
  }

  // --- Socket event handlers ---

  /** @private */
  _onData(chunk) {
    if (this._phase === HANDLER_PHASE.CLOSED) return;
    this._buffer = Buffer.concat([this._buffer, chunk]);
    this._processing = this._processing
      .then(() => this._processBuffer())
      .catch((error) => this._handleProcessingError(error));
  }

  /** @private */
  _onError(err) {
    this._logger.debug(PG_HANDLER_LOG.CONNECTION_ERROR, {
      error: err.message,
    });
    this.destroy();
  }

  /** @private */
  _onClose() {
    this._logger.debug(PG_HANDLER_LOG.CONNECTION_CLOSED);
    this.destroy();
  }

  // --- Buffer processing ---

  /** @private */
  async _processBuffer() {
    if (this._phase === HANDLER_PHASE.STARTUP) {
      await this._processStartup();
    }
    if (this._phase === HANDLER_PHASE.AUTHENTICATION) {
      await this._processAuthentication();
    }
    if (this._phase === HANDLER_PHASE.NORMAL) {
      await this._processMessages();
    }
  }

  /**
   * Process startup phase: read startup message (no type byte).
   * @private
   */
  async _processStartup() {
    if (this._buffer.length < PG_BUFFER_LIMIT.STARTUP_HEADER_SIZE) {
      return;
    }
    const msgLen = this._buffer.readInt32BE(0);
    if (msgLen < PG_BUFFER_LIMIT.STARTUP_HEADER_SIZE * 2) {
      this._failProtocol(PG_HANDLER_ERROR.INVALID_MESSAGE_LENGTH);
      return;
    }
    if (msgLen > PG_BUFFER_LIMIT.MAX_MESSAGE_SIZE) {
      this._failProtocol(PG_HANDLER_ERROR.MESSAGE_TOO_LARGE);
      return;
    }
    if (this._buffer.length < msgLen) return;

    const msgBuf = this._buffer.subarray(0, msgLen);
    this._buffer = this._buffer.subarray(msgLen);

    const version = msgBuf.readInt32BE(
      PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE,
    );

    // Check for SSL request
    if (version === PG_SSL_REQUEST_CODE) {
      if (msgLen !== PG_BUFFER_LIMIT.SSL_REQUEST_SIZE) {
        this._failProtocol(PG_HANDLER_ERROR.INVALID_MESSAGE_LENGTH);
        return;
      }
      this._handleSslRequest();
      return;
    }

    if (this._tlsMode === PGWIRE_TLS_MODE.REQUIRE && !this._tlsActive) {
      this._sendError(
        PG_SEVERITY.FATAL,
        PG_ERROR_CODE.CONNECTION_FAILURE,
        PG_HANDLER_ERROR.TLS_REQUIRED,
      );
      this._socket.end();
      return;
    }

    if (version !== PG_PROTOCOL_VERSION.CODE) {
      this._sendError(
        PG_SEVERITY.FATAL,
        PG_ERROR_CODE.PROTOCOL_VIOLATION,
        PG_HANDLER_ERROR.UNSUPPORTED_PROTOCOL_VERSION,
      );
      this._socket.end();
      return;
    }

    // Parse startup parameters (after 4-byte length + 4-byte version)
    const paramsBuf = msgBuf.subarray(8);
    const params = parseStartupParams(paramsBuf);

    this._logger.debug(PG_HANDLER_LOG.STARTUP_RECEIVED, {
      user: params.user,
      database: params.database,
    });

    await this._handleStartup(params);
  }

  /**
   * Apply the descriptor-owned SSLRequest policy and upgrade when enabled.
   * @private
   */
  _handleSslRequest() {
    if (this._buffer.length > 0) {
      this._failProtocol(PG_HANDLER_ERROR.SSL_REQUEST_PIPELINING_FORBIDDEN);
      return;
    }
    if (this._tlsMode === PGWIRE_TLS_MODE.DISABLE) {
      this._socket.write(Buffer.from([PG_SSL_RESPONSE.UNSUPPORTED]));
      return;
    }
    if (!this._secureContext || this._tlsActive) {
      this._sendError(
        PG_SEVERITY.FATAL,
        PG_ERROR_CODE.CONNECTION_FAILURE,
        PG_HANDLER_ERROR.TLS_CONFIGURATION_REQUIRED,
      );
      this._socket.end();
      return;
    }

    const rawSocket = this._socket;
    rawSocket.removeListener(LOCAL_STR_DATA, this._onData);
    rawSocket.removeListener(LOCAL_STR_ERROR, this._onError);
    rawSocket.removeListener(LOCAL_STR_CLOSE, this._onClose);
    rawSocket.write(Buffer.from([PG_SSL_RESPONSE.SUPPORTED]));
    try {
      this._socket = this._tlsSocketFactory(
        rawSocket,
        this._secureContext,
      );
      this._tlsActive = true;
      this._socket.on(LOCAL_STR_DATA, this._onData);
      this._socket.on(LOCAL_STR_ERROR, this._onError);
      this._socket.on(LOCAL_STR_CLOSE, this._onClose);
      this._logger.debug(PG_HANDLER_LOG.TLS_NEGOTIATED);
    } catch (_error) {
      this._logger.debug(PG_HANDLER_LOG.CONNECTION_ERROR, {
        error: PG_HANDLER_ERROR.TLS_NEGOTIATION_FAILED,
      });
      rawSocket.destroy();
      this.destroy();
    }
  }

  /**
   * Handle startup parameters: create session, send auth ok,
   * parameter statuses, backend key data, and ReadyForQuery.
   *
   * @param {Object} params - Startup parameters.
   * @private
   */
  async _handleStartup(params) {
    const pendingAuth = Object.freeze({
      sessionId: `pgwire-${randomUUID()}`,
      tenantId: params.database || 'default',
      user: params.user || 'anonymous',
      database: params.database || null,
    });

    if (this._authMode === PGWIRE_AUTH_MODE.PASSWORD) {
      this._pendingAuth = pendingAuth;
      this._phase = HANDLER_PHASE.AUTHENTICATION;
      this._socket.write(buildAuthCleartextPassword());
      return;
    }

    await this._completeAuthentication(pendingAuth);
  }

  /**
   * Process one PostgreSQL PasswordMessage without logging its payload.
   * @private
   */
  async _processAuthentication() {
    if (this._buffer.length < PG_BUFFER_LIMIT.MSG_HEADER_SIZE) return;

    const type = this._buffer[0];
    const msgLen = this._buffer.readInt32BE(1);
    if (msgLen < PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE + 1) {
      this._failProtocol(PG_HANDLER_ERROR.INVALID_MESSAGE_LENGTH);
      return;
    }
    if (msgLen > PG_BUFFER_LIMIT.MAX_MESSAGE_SIZE) {
      this._failProtocol(PG_HANDLER_ERROR.MESSAGE_TOO_LARGE);
      return;
    }

    const totalLen = 1 + msgLen;
    if (this._buffer.length < totalLen) return;
    if (type !== PG_FRONTEND_MSG.PASSWORD) {
      this._failAuthentication(PG_HANDLER_ERROR.PASSWORD_MESSAGE_REQUIRED);
      return;
    }

    const payload = this._buffer.subarray(
      PG_BUFFER_LIMIT.MSG_HEADER_SIZE,
      totalLen,
    );
    if (payload.at(-1) !== 0) {
      this._failProtocol(PG_HANDLER_ERROR.INVALID_MESSAGE_LENGTH);
      return;
    }
    const password = payload.subarray(0, -1).toString('utf8');
    this._buffer = this._buffer.subarray(totalLen);
    await this._completeAuthentication(this._pendingAuth, password);
  }

  /**
   * Authenticate through the canonical adapter and finish the startup reply.
   * @param {Object} pendingAuth - Server-owned pending session identity.
   * @param {string|undefined} [password] - PasswordMessage value.
   * @private
   */
  async _completeAuthentication(pendingAuth, password) {
    const {sessionId, tenantId, user, database} = pendingAuth;

    try {
      await this._adapter.authenticate(sessionId, {
        tenantId,
        user,
        password,
      });
    } catch (err) {
      if (this._phase === HANDLER_PHASE.CLOSED) return;
      this._failAuthentication(err.message);
      return;
    }

    if (this._phase === HANDLER_PHASE.CLOSED) {
      this._adapter.closeSession(sessionId);
      return;
    }

    this._session = new PgWireSession({
      sessionId,
      tenantId,
      user,
      database,
    });
    this._session.markAuthenticated();

    // AuthenticationOk
    this._socket.write(buildAuthOk());

    // ParameterStatus messages
    for (const [name, value] of Object.entries(PG_SERVER_PARAMS)) {
      this._socket.write(buildParameterStatus(name, value));
    }

    // BackendKeyData
    this._socket.write(
      buildBackendKeyData(this._pid, this._secretKey),
    );

    // ReadyForQuery
    this._session.markReady();
    this._socket.write(
      buildReadyForQuery(PG_TRANSACTION_STATE.IDLE),
    );

    this._phase = HANDLER_PHASE.NORMAL;
    this._pendingAuth = null;
    this._logger.debug(PG_HANDLER_LOG.AUTH_OK, {sessionId});
  }

  /**
   * Fail a pending authentication exchange without retaining credentials.
   * @param {string} message - Safe failure detail.
   * @private
   */
  _failAuthentication(message) {
    this._pendingAuth = null;
    this._sendError(
      PG_SEVERITY.FATAL,
      PG_ERROR_CODE.INVALID_AUTHORIZATION,
      message,
    );
    this._phase = HANDLER_PHASE.CLOSED;
    this._socket.end();
  }

  /**
   * Process normal-phase messages (type + length + payload).
   * @private
   */
  async _processMessages() {
    while (this._buffer.length >= PG_BUFFER_LIMIT.MSG_HEADER_SIZE) {
      const type = this._buffer[0];
      const msgLen = this._buffer.readInt32BE(1);
      if (msgLen < PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE) {
        this._failProtocol(PG_HANDLER_ERROR.INVALID_MESSAGE_LENGTH);
        return;
      }
      if (msgLen > PG_BUFFER_LIMIT.MAX_MESSAGE_SIZE) {
        this._failProtocol(PG_HANDLER_ERROR.MESSAGE_TOO_LARGE);
        return;
      }
      const totalLen = 1 + msgLen;

      if (this._buffer.length < totalLen) break;

      const payload = this._buffer.subarray(
        PG_BUFFER_LIMIT.MSG_HEADER_SIZE, totalLen,
      );
      this._buffer = this._buffer.subarray(totalLen);

      await this._dispatchMessage(type, payload);
      if (this._phase === HANDLER_PHASE.CLOSED) {
        return;
      }
    }
  }

  /**
   * Dispatch a single frontend message by type.
   *
   * @param {number} type - Message type byte.
   * @param {Buffer} payload - Message payload.
   * @private
   */
  async _dispatchMessage(type, payload) {
    switch (type) {
    case PG_FRONTEND_MSG.QUERY:
      await this._handleSimpleQuery(payload);
      break;
    case PG_FRONTEND_MSG.PARSE:
    case PG_FRONTEND_MSG.BIND:
    case PG_FRONTEND_MSG.DESCRIBE:
    case PG_FRONTEND_MSG.EXECUTE:
    case PG_FRONTEND_MSG.SYNC:
    case PG_FRONTEND_MSG.CLOSE:
    case PG_FRONTEND_MSG.TERMINATE:
      await this._extendedQueryHandler.dispatch(type, payload);
      break;
    case PG_FRONTEND_MSG.FLUSH:
      // Flush is a no-op for us (we write immediately)
      break;
    default:
      this._logger.debug(PG_HANDLER_LOG.UNSUPPORTED_MSG, {
        type: `0x${type.toString(LOCAL_NUM_SIXTEEN)}`,
      });
      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
        `${PG_HANDLER_ERROR.UNKNOWN_MESSAGE_TYPE}: ` +
            `0x${type.toString(LOCAL_NUM_SIXTEEN)}`,
      );
      break;
    }
  }

  // --- Simple query protocol ---

  /**
   * Handle a simple Query ('Q') message.
   *
   * Executes the query through PostgresWireAdapter and sends
   * RowDescription + DataRow* + CommandComplete + ReadyForQuery.
   *
   * @param {Buffer} payload - Query message payload.
   * @private
   */
  async _handleSimpleQuery(payload) {
    const {query} = parseQueryMessage(payload);

    this._logger.debug(PG_HANDLER_LOG.QUERY_RECEIVED, {
      sessionId: this._session.sessionId,
    });

    if (!query || query.trim().length === 0) {
      this._socket.write(buildEmptyQueryResponse());
      this._socket.write(
        buildReadyForQuery(this._session.getTransactionState()),
      );
      return;
    }

    // Check for failed transaction state
    if (this._session.isInFailedTransaction()) {
      const upper = query.trimStart().toUpperCase();
      if (!upper.startsWith(LOCAL_STR_ROLLBACK)) {
        this._sendError(
          PG_SEVERITY.ERROR,
          PG_ERROR_CODE.IN_FAILED_TRANSACTION,
          LOCAL_STR_CURRENT_TRANSACTION_IS_ABORTED_COMMANDS +
            LOCAL_STR_UNTIL_END_OF_TRANSACTION_BLOCK,
        );
        this._socket.write(
          buildReadyForQuery(this._session.getTransactionState()),
        );
        return;
      }
    }

    await this._executeAndSend(query, []);

    this._socket.write(
      buildReadyForQuery(this._session.getTransactionState()),
    );
  }

  // --- Shared execution ---

  /**
   * Execute a query through the adapter and send result messages.
   *
   * Updates transaction state based on query type and result.
   * Sends RowDescription + DataRow* + CommandComplete on success,
   * or ErrorResponse on failure.
   *
   * @param {string} query - SQL query text.
   * @param {unknown[]} params - Bind parameters.
   * @private
   */
  async _executeAndSend(query, params) {
    const upper = query.trimStart().toUpperCase();
    this._applyTransactionStart(upper);

    try {
      const result = await this._adapter.execute(
        this._session.sessionId, query, params,
      );
      if (
        result?.provisioningDeadlineExpired === true &&
        typeof result?.jobId === 'string'
      ) {
        const error = new Error('Schema provisioning remains active');
        error.sqlState = PG_ERROR_CODE.LOCK_NOT_AVAILABLE;
        error.detail = {
          provisioning_job_id: result.jobId,
          retry_after_ms: result.retryAfterMs || 0,
        };
        throw error;
      }
      if (result?.success === false) {
        const error = new Error(
          result.error || result.message ||
          PG_HANDLER_ERROR.QUERY_EXECUTION_FAILED,
        );
        Object.assign(error, result);
        throw error;
      }

      // Send result set for SELECT-like queries
      const columns = extractColumns(result);
      if (columns.length > 0 && Array.isArray(result?.rows)) {
        this._socket.write(buildRowDescription(columns));
        for (const row of result.rows) {
          const values = extractRowValues(row, columns);
          this._socket.write(buildDataRow(values));
        }
      }

      const tag = deriveCommandTag(result, query);
      this._socket.write(buildCommandComplete(tag));

      this._applyTransactionCompletion(upper);
    } catch (err) {
      this._applyTransactionFailure();
      this._sendError(
        PG_SEVERITY.ERROR,
        typeof err.sqlState === 'string' ?
          err.sqlState : PG_ERROR_CODE.INTERNAL_ERROR,
        err.message,
        err.detail || null,
      );
    }
  }

  /** @private */
  _applyTransactionStart(upperQuery) {
    if (upperQuery.startsWith(LOCAL_STR_BEGIN)) {
      this._session.setTransactionState(PG_TRANSACTION_STATE.IN_TRANSACTION);
    }
  }

  /** @private */
  _applyTransactionCompletion(upperQuery) {
    if (
      upperQuery.startsWith(LOCAL_STR_COMMIT) ||
      upperQuery.startsWith(LOCAL_STR_ROLLBACK)
    ) {
      this._session.setTransactionState(PG_TRANSACTION_STATE.IDLE);
    }
  }

  /** @private */
  _applyTransactionFailure() {
    if (
      this._session.getTransactionState() ===
      PG_TRANSACTION_STATE.IN_TRANSACTION
    ) {
      this._session.setTransactionState(PG_TRANSACTION_STATE.FAILED);
    }
  }

  // --- Error sending ---

  /**
   * Send an ErrorResponse message to the client.
   *
   * @param {string} severity - PG_SEVERITY value.
   * @param {string} code - SQLSTATE code.
   * @param {string} message - Error message.
   * @private
   */
  _sendError(severity, code, message, detail = null) {
    this._socket.write(buildErrorResponse(severity, code, message, detail));
  }

  /** @private */
  _failProtocol(message) {
    this._sendError(
      PG_SEVERITY.FATAL,
      PG_ERROR_CODE.PROTOCOL_VIOLATION,
      message,
    );
    this._phase = HANDLER_PHASE.CLOSED;
    this._socket.end();
  }

  /** @private */
  _handleProcessingError(error) {
    if (this._phase === HANDLER_PHASE.CLOSED) {
      return;
    }
    this._logger.debug(PG_HANDLER_LOG.CONNECTION_ERROR, {
      error: error.message,
    });
    this._failProtocol(error.message);
  }
}

export {
  PgWireProtocolHandler,
  HANDLER_PHASE,
  // Message builders (exported for testing)
  buildAuthOk,
  buildParameterStatus,
  buildBackendKeyData,
  buildReadyForQuery,
  buildErrorResponse,
  buildRowDescription,
  buildDataRow,
  buildCommandComplete,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
  buildEmptyQueryResponse,
  // Parsers (exported for testing)
  parseStartupParams,
  parseQueryMessage,
  parseParseMessage,
  parseBindMessage,
  parseDescribeMessage,
  parseExecuteMessage,
  parseCloseMessage,
  // Helpers (exported for testing)
  deriveCommandTag,
  extractColumns,
  extractRowValues,
  writeCString,
  readCString,
};
