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
  PG_FRONTEND_MSG,
  PG_TRANSACTION_STATE,
  PG_SEVERITY,
  PG_ERROR_CODE,
  PG_DESCRIBE_TYPE,
  PG_CLOSE_TYPE,
  PG_SERVER_PARAMS,
  PG_HANDLER_ERROR,
  PG_HANDLER_LOG,
  PG_BUFFER_LIMIT,
} from './pgwire-protocol-constants.js';
import {
  PgWireSession,
  PGWIRE_SESSION_ERROR,
} from './pgwire-session.js';
import {
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

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_BEGIN = 'BEGIN';
const LOCAL_STR_COMMIT = 'COMMIT';
const LOCAL_STR_ROLLBACK = 'ROLLBACK';
const LOCAL_NUM_0X7FFFFFFF = 0x7FFFFFFF;
const LOCAL_STR_DATA = 'data';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CLOSE = 'close';
const LOCAL_NUM_0X4E = 0x4E;
const LOCAL_NUM_16 = 16;
const LOCAL_STR_1RBWE = 'current transaction is aborted, commands ignored ';
const LOCAL_STR_1ZW3J = 'until end of transaction block';
const LOCAL_STR_UNNAMED = '(unnamed)';

// --- Internal handler states ---

const HANDLER_PHASE = Object.freeze({
  STARTUP: 'startup',
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
    this._phase = HANDLER_PHASE.STARTUP;
    this._session = null;
    this._buffer = Buffer.alloc(LOCAL_NUM_ZERO);
    this._pid = (Math.random() * LOCAL_NUM_0X7FFFFFFF) | LOCAL_NUM_ZERO;
    this._secretKey = (Math.random() * LOCAL_NUM_0X7FFFFFFF) | LOCAL_NUM_ZERO;

    this._onData = this._onData.bind(this);
    this._onError = this._onError.bind(this);
    this._onClose = this._onClose.bind(this);
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
    this._buffer = Buffer.alloc(LOCAL_NUM_ZERO);
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
    this._processBuffer();
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
  _processBuffer() {
    if (this._phase === HANDLER_PHASE.STARTUP) {
      this._processStartup();
    } else if (this._phase === HANDLER_PHASE.NORMAL) {
      this._processMessages();
    }
  }

  /**
   * Process startup phase: read startup message (no type byte).
   * @private
   */
  _processStartup() {
    if (this._buffer.length < PG_BUFFER_LIMIT.STARTUP_HEADER_SIZE) {
      return;
    }
    const msgLen = this._buffer.readInt32BE(0);
    if (this._buffer.length < msgLen) return;

    const msgBuf = this._buffer.subarray(0, msgLen);
    this._buffer = this._buffer.subarray(msgLen);

    const version = msgBuf.readInt32BE(
      PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE,
    );

    // Check for SSL request
    if (version === PG_SSL_REQUEST_CODE) {
      // Respond with 'N' (SSL not supported), stay in startup
      this._socket.write(Buffer.from([LOCAL_NUM_0X4E])); // 'N'
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

    this._handleStartup(params);
  }

  /**
   * Handle startup parameters: create session, send auth ok,
   * parameter statuses, backend key data, and ReadyForQuery.
   *
   * @param {Object} params - Startup parameters.
   * @private
   */
  async _handleStartup(params) {
    const sessionId = `pgwire-${randomUUID()}`;
    const tenantId = params.database || 'default';
    const user = params.user || 'anonymous';

    try {
      await this._adapter.authenticate(sessionId, {
        tenantId,
        user,
      });
    } catch (err) {
      this._sendError(
        PG_SEVERITY.FATAL,
        PG_ERROR_CODE.INVALID_AUTHORIZATION,
        err.message,
      );
      this._socket.end();
      return;
    }

    this._session = new PgWireSession({
      sessionId,
      tenantId,
      user,
      database: params.database || null,
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
    this._logger.debug(PG_HANDLER_LOG.AUTH_OK, {sessionId});

    // Process any remaining buffered data
    if (this._buffer.length > LOCAL_NUM_ZERO) {
      this._processMessages();
    }
  }

  /**
   * Process normal-phase messages (type + length + payload).
   * @private
   */
  _processMessages() {
    while (this._buffer.length >= PG_BUFFER_LIMIT.MSG_HEADER_SIZE) {
      const type = this._buffer[0];
      const msgLen = this._buffer.readInt32BE(1);
      const totalLen = 1 + msgLen;

      if (this._buffer.length < totalLen) break;

      const payload = this._buffer.subarray(
        PG_BUFFER_LIMIT.MSG_HEADER_SIZE, totalLen,
      );
      this._buffer = this._buffer.subarray(totalLen);

      this._dispatchMessage(type, payload);
    }
  }

  /**
   * Dispatch a single frontend message by type.
   *
   * @param {number} type - Message type byte.
   * @param {Buffer} payload - Message payload.
   * @private
   */
  _dispatchMessage(type, payload) {
    switch (type) {
    case PG_FRONTEND_MSG.QUERY:
      this._handleSimpleQuery(payload);
      break;
    case PG_FRONTEND_MSG.PARSE:
      this._handleParse(payload);
      break;
    case PG_FRONTEND_MSG.BIND:
      this._handleBind(payload);
      break;
    case PG_FRONTEND_MSG.DESCRIBE:
      this._handleDescribe(payload);
      break;
    case PG_FRONTEND_MSG.EXECUTE:
      this._handleExecute(payload);
      break;
    case PG_FRONTEND_MSG.SYNC:
      this._handleSync();
      break;
    case PG_FRONTEND_MSG.CLOSE:
      this._handleClose(payload);
      break;
    case PG_FRONTEND_MSG.TERMINATE:
      this._handleTerminate();
      break;
    case PG_FRONTEND_MSG.FLUSH:
      // Flush is a no-op for us (we write immediately)
      break;
    default:
      this._logger.debug(PG_HANDLER_LOG.UNSUPPORTED_MSG, {
        type: `0x${type.toString(LOCAL_NUM_16)}`,
      });
      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
        `${PG_HANDLER_ERROR.UNKNOWN_MESSAGE_TYPE}: ` +
            `0x${type.toString(LOCAL_NUM_16)}`,
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

    if (!query || query.trim().length === LOCAL_NUM_ZERO) {
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
          LOCAL_STR_1RBWE +
            LOCAL_STR_1ZW3J,
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

  // --- Extended query protocol ---

  /**
   * Handle Parse ('P') message.
   * Stores the prepared statement in session state.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleParse(payload) {
    const {name, query, paramTypes} = parseParseMessage(payload);

    this._logger.debug(PG_HANDLER_LOG.PARSE_RECEIVED, {
      sessionId: this._session.sessionId,
      name: name || LOCAL_STR_UNNAMED,
    });

    this._session.setPreparedStatement(name, query, paramTypes);
    this._socket.write(buildParseComplete());
  }

  /**
   * Handle Bind ('B') message.
   * Binds parameters to a prepared statement, creating a portal.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleBind(payload) {
    const {portal, statement, params} = parseBindMessage(payload);

    this._logger.debug(PG_HANDLER_LOG.BIND_RECEIVED, {
      sessionId: this._session.sessionId,
      portal: portal || LOCAL_STR_UNNAMED,
      statement: statement || LOCAL_STR_UNNAMED,
    });

    const stmt = this._session.getPreparedStatement(statement);
    if (!stmt) {
      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.INTERNAL_ERROR,
        `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: ` +
          `'${statement}'`,
      );
      return;
    }

    this._session.setPortal(portal, statement, params);
    this._socket.write(buildBindComplete());
  }

  /**
   * Handle Describe ('D') message.
   * Returns RowDescription for a statement or portal.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleDescribe(payload) {
    const {type, name} = parseDescribeMessage(payload);

    if (type === PG_DESCRIBE_TYPE.STATEMENT) {
      const stmt = this._session.getPreparedStatement(name);
      if (!stmt) {
        this._sendError(
          PG_SEVERITY.ERROR,
          PG_ERROR_CODE.INTERNAL_ERROR,
          `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: '${name}'`,
        );
        return;
      }
      // We don't know columns until execution; send NoData
      this._socket.write(buildNoData());
    } else if (type === PG_DESCRIBE_TYPE.PORTAL) {
      const portal = this._session.getPortal(name);
      if (!portal) {
        this._sendError(
          PG_SEVERITY.ERROR,
          PG_ERROR_CODE.INTERNAL_ERROR,
          `Portal not found: '${name}'`,
        );
        return;
      }
      // We don't know columns until execution; send NoData
      this._socket.write(buildNoData());
    } else {
      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.PROTOCOL_VIOLATION,
        `Invalid describe target type: ${type}`,
      );
    }
  }

  /**
   * Handle Execute ('E') message.
   * Executes a portal through the adapter.
   *
   * @param {Buffer} payload
   * @private
   */
  async _handleExecute(payload) {
    const {portal: portalName} = parseExecuteMessage(payload);

    this._logger.debug(PG_HANDLER_LOG.EXECUTE_RECEIVED, {
      sessionId: this._session.sessionId,
      portal: portalName || LOCAL_STR_UNNAMED,
    });

    const portal = this._session.getPortal(portalName);
    if (!portal) {
      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.INTERNAL_ERROR,
        `Portal not found: '${portalName}'`,
      );
      return;
    }

    const stmt = this._session.getPreparedStatement(
      portal.statementName,
    );
    if (!stmt) {
      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.INTERNAL_ERROR,
        `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: ` +
          `'${portal.statementName}'`,
      );
      return;
    }

    // Check for failed transaction state
    if (this._session.isInFailedTransaction()) {
      const upper = stmt.query.trimStart().toUpperCase();
      if (!upper.startsWith(LOCAL_STR_ROLLBACK)) {
        this._sendError(
          PG_SEVERITY.ERROR,
          PG_ERROR_CODE.IN_FAILED_TRANSACTION,
          LOCAL_STR_1RBWE +
            LOCAL_STR_1ZW3J,
        );
        return;
      }
    }

    await this._executeAndSend(stmt.query, portal.params);
  }

  /**
   * Handle Sync ('S') message.
   * Ends an extended query cycle and sends ReadyForQuery.
   * @private
   */
  _handleSync() {
    this._logger.debug(PG_HANDLER_LOG.SYNC_RECEIVED, {
      sessionId: this._session.sessionId,
    });
    this._socket.write(
      buildReadyForQuery(this._session.getTransactionState()),
    );
  }

  /**
   * Handle Close ('C') message.
   * Closes a prepared statement or portal.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleClose(payload) {
    const {type, name} = parseCloseMessage(payload);
    if (type === PG_CLOSE_TYPE.STATEMENT) {
      this._session.closePreparedStatement(name);
    } else if (type === PG_CLOSE_TYPE.PORTAL) {
      this._session.closePortal(name);
    }
    this._socket.write(buildCloseComplete());
  }

  /**
   * Handle Terminate ('X') message.
   * @private
   */
  _handleTerminate() {
    this._logger.debug(PG_HANDLER_LOG.TERMINATE_RECEIVED, {
      sessionId: this._session?.sessionId,
    });
    this.destroy();
    this._socket.end();
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

    // Track transaction state transitions
    if (upper.startsWith(LOCAL_STR_BEGIN)) {
      this._session.setTransactionState(
        PG_TRANSACTION_STATE.IN_TRANSACTION,
      );
    }

    try {
      const result = await this._adapter.execute(
        this._session.sessionId, query, params,
      );

      // Send result set for SELECT-like queries
      const columns = extractColumns(result);
      if (columns.length > LOCAL_NUM_ZERO && Array.isArray(result?.rows)) {
        this._socket.write(buildRowDescription(columns));
        for (const row of result.rows) {
          const values = extractRowValues(row, columns);
          this._socket.write(buildDataRow(values));
        }
      }

      const tag = deriveCommandTag(result, query);
      this._socket.write(buildCommandComplete(tag));

      // Update transaction state on COMMIT/ROLLBACK
      if (upper.startsWith(LOCAL_STR_COMMIT) ||
          upper.startsWith(LOCAL_STR_ROLLBACK)) {
        this._session.setTransactionState(
          PG_TRANSACTION_STATE.IDLE,
        );
      }
    } catch (err) {
      // On error in a transaction, mark as failed
      if (this._session.getTransactionState() ===
          PG_TRANSACTION_STATE.IN_TRANSACTION) {
        this._session.setTransactionState(
          PG_TRANSACTION_STATE.FAILED,
        );
      }

      this._sendError(
        PG_SEVERITY.ERROR,
        PG_ERROR_CODE.INTERNAL_ERROR,
        err.message,
      );
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
  _sendError(severity, code, message) {
    this._socket.write(buildErrorResponse(severity, code, message));
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
