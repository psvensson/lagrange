/**
 * Extended PostgreSQL query protocol owner.
 *
 * Owns Parse/Bind/Describe/Execute/Sync/Close/Terminate dispatch while the
 * connection handler retains startup, TLS, authentication, framing, and shared
 * result execution.
 */

import {
  PG_FRONTEND_MSG,
  PG_SEVERITY,
  PG_ERROR_CODE,
  PG_DESCRIBE_TYPE,
  PG_CLOSE_TYPE,
  PG_HANDLER_LOG,
} from './pgwire-protocol-constants.js';
import {PGWIRE_SESSION_ERROR} from './pgwire-session.js';
import {
  buildReadyForQuery,
  buildErrorResponse,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildNoData,
} from './pgwire-message-builders.js';
import {
  parseParseMessage,
  parseBindMessage,
  parseDescribeMessage,
  parseExecuteMessage,
  parseCloseMessage,
} from './pgwire-message-parsers.js';

const LOCAL_STR_ROLLBACK = 'ROLLBACK';
const LOCAL_STR_UNNAMED = '(unnamed)';
const LOCAL_STR_PORTAL_NOT_FOUND = 'Portal not found';
const LOCAL_STR_INVALID_DESCRIBE_TARGET = 'Invalid describe target type';
const LOCAL_STR_CURRENT_TRANSACTION_IS_ABORTED_COMMANDS =
  'current transaction is aborted, commands ignored ';
const LOCAL_STR_UNTIL_END_OF_TRANSACTION_BLOCK =
  'until end of transaction block';

class PgWireExtendedQueryHandler {
  constructor(options) {
    this._getSession = options.getSession;
    this._getSocket = options.getSocket;
    this._executeAndSend = options.executeAndSend;
    this._destroyConnection = options.destroyConnection;
    this._logger = options.logger;
  }

  async dispatch(type, payload) {
    switch (type) {
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
      await this._handleExecute(payload);
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
    }
  }

  _sendError(code, message) {
    this._getSocket().write(buildErrorResponse(
      PG_SEVERITY.ERROR,
      code,
      message,
    ));
  }

  _handleParse(payload) {
    const {name, query, paramTypes} = parseParseMessage(payload);
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.PARSE_RECEIVED, {
      sessionId: session.sessionId,
      name: name || LOCAL_STR_UNNAMED,
    });
    session.setPreparedStatement(name, query, paramTypes);
    this._getSocket().write(buildParseComplete());
  }

  _handleBind(payload) {
    const {portal, statement, params} = parseBindMessage(payload);
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.BIND_RECEIVED, {
      sessionId: session.sessionId,
      portal: portal || LOCAL_STR_UNNAMED,
      statement: statement || LOCAL_STR_UNNAMED,
    });
    if (!session.getPreparedStatement(statement)) {
      this._sendError(
        PG_ERROR_CODE.INTERNAL_ERROR,
        `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: '${statement}'`,
      );
      return;
    }
    session.setPortal(portal, statement, params);
    this._getSocket().write(buildBindComplete());
  }

  _handleDescribe(payload) {
    const {type, name} = parseDescribeMessage(payload);
    const session = this._getSession();
    if (type === PG_DESCRIBE_TYPE.STATEMENT) {
      if (!session.getPreparedStatement(name)) {
        this._sendError(
          PG_ERROR_CODE.INTERNAL_ERROR,
          `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: '${name}'`,
        );
        return;
      }
      this._getSocket().write(buildNoData());
      return;
    }
    if (type === PG_DESCRIBE_TYPE.PORTAL) {
      if (!session.getPortal(name)) {
        this._sendError(
          PG_ERROR_CODE.INTERNAL_ERROR,
          `${LOCAL_STR_PORTAL_NOT_FOUND}: '${name}'`,
        );
        return;
      }
      this._getSocket().write(buildNoData());
      return;
    }
    this._sendError(
      PG_ERROR_CODE.PROTOCOL_VIOLATION,
      `${LOCAL_STR_INVALID_DESCRIBE_TARGET}: ${type}`,
    );
  }

  async _handleExecute(payload) {
    const {portal: portalName} = parseExecuteMessage(payload);
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.EXECUTE_RECEIVED, {
      sessionId: session.sessionId,
      portal: portalName || LOCAL_STR_UNNAMED,
    });
    const portal = session.getPortal(portalName);
    if (!portal) {
      this._sendError(
        PG_ERROR_CODE.INTERNAL_ERROR,
        `${LOCAL_STR_PORTAL_NOT_FOUND}: '${portalName}'`,
      );
      return;
    }
    const statement = session.getPreparedStatement(portal.statementName);
    if (!statement) {
      this._sendError(
        PG_ERROR_CODE.INTERNAL_ERROR,
        `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: ` +
          `'${portal.statementName}'`,
      );
      return;
    }
    if (session.isInFailedTransaction()) {
      const upper = statement.query.trimStart().toUpperCase();
      if (!upper.startsWith(LOCAL_STR_ROLLBACK)) {
        this._sendError(
          PG_ERROR_CODE.IN_FAILED_TRANSACTION,
          LOCAL_STR_CURRENT_TRANSACTION_IS_ABORTED_COMMANDS +
            LOCAL_STR_UNTIL_END_OF_TRANSACTION_BLOCK,
        );
        return;
      }
    }
    await this._executeAndSend(statement.query, portal.params);
  }

  _handleSync() {
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.SYNC_RECEIVED, {
      sessionId: session.sessionId,
    });
    this._getSocket().write(
      buildReadyForQuery(session.getTransactionState()),
    );
  }

  _handleClose(payload) {
    const {type, name} = parseCloseMessage(payload);
    const session = this._getSession();
    if (type === PG_CLOSE_TYPE.STATEMENT) {
      session.closePreparedStatement(name);
    } else if (type === PG_CLOSE_TYPE.PORTAL) {
      session.closePortal(name);
    }
    this._getSocket().write(buildCloseComplete());
  }

  _handleTerminate() {
    this._logger.debug(PG_HANDLER_LOG.TERMINATE_RECEIVED, {
      sessionId: this._getSession()?.sessionId,
    });
    this._destroyConnection();
    this._getSocket().end();
  }
}

export {PgWireExtendedQueryHandler};
