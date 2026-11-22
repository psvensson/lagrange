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
  PG_FORMAT_CODE,
  PG_DESCRIBE_TYPE,
  PG_CLOSE_TYPE,
  PG_HANDLER_LOG,
  PG_TRANSACTION_STATE,
} from './pgwire-protocol-constants.js';
import {
  PGWIRE_SESSION_ERROR,
  PGWIRE_STATEMENT_ADMISSION,
} from './pgwire-session.js';
import {
  buildReadyForQuery,
  buildErrorResponse,
  buildParseComplete,
  buildBindComplete,
  buildCloseComplete,
  buildParameterDescription,
  buildRowDescription,
  buildNoData,
  buildEmptyQueryResponse,
} from './pgwire-message-builders.js';
import {
  parseParseMessage,
  parseBindMessage,
  parseDescribeMessage,
  parseExecuteMessage,
  parseCloseMessage,
} from './pgwire-message-parsers.js';
import {
  extractWireErrorDetail,
  resolveFailureSqlState,
} from './pgwire-result-mapper.js';

const LOCAL_STR_UNNAMED = '(unnamed)';
const LOCAL_STR_PORTAL_NOT_FOUND = 'Portal not found';
const LOCAL_STR_INVALID_DESCRIBE_TARGET = 'Invalid describe target type';
const LOCAL_STR_CURRENT_TRANSACTION_IS_ABORTED_COMMANDS =
  'current transaction is aborted, commands ignored ';
const LOCAL_STR_UNTIL_END_OF_TRANSACTION_BLOCK =
  'until end of transaction block';
const LOCAL_STR_DESCRIBE_FAILED = 'Failed to parse/describe prepared statement';
const LOCAL_STR_DESCRIBE_OWNER_MISSING =
  'Protocol adapter must implement describe()';
const LOCAL_STR_PARAM_COUNT_MISMATCH =
  'Bind message supplies wrong number of parameters for prepared statement';
const LOCAL_STR_PARAM_FORMAT_COUNT_MISMATCH =
  'Bind message parameter format count does not match parameters';
const LOCAL_STR_RESULT_FORMAT_COUNT_MISMATCH =
  'Bind message result format count does not match result columns';
const LOCAL_STR_INVALID_FORMAT_CODE = 'Unsupported wire format code';
const LOCAL_STR_BINARY_PARAM_UNSUPPORTED =
  'Binary parameter format is not supported';
const LOCAL_STR_BINARY_RESULT_UNSUPPORTED =
  'Binary result format is not supported';
const LOCAL_STR_PORTAL_SUSPENSION_UNSUPPORTED =
  'Portal suspension (Execute maxRows > 0) is not supported';
const LOCAL_STR_NEGATIVE_MAX_ROWS = 'Execute maxRows must be non-negative';

function resolveBindFormatAt(formats, index) {
  if (!Array.isArray(formats) || formats.length === 0) {
    return PG_FORMAT_CODE.TEXT;
  }
  return formats.length === 1 ? formats[0] : formats[index];
}

function validateBindFormats(formats, targetCount, countMismatchMsg, binaryUnsupportedMsg) {
  if (formats.length !== 0 && formats.length !== 1 && formats.length !== targetCount) {
    return {
      code: PG_ERROR_CODE.PROTOCOL_VIOLATION,
      message: countMismatchMsg,
    };
  }
  for (const fmt of formats) {
    if (fmt !== PG_FORMAT_CODE.TEXT && fmt !== PG_FORMAT_CODE.BINARY) {
      return {
        code: PG_ERROR_CODE.PROTOCOL_VIOLATION,
        message: `${LOCAL_STR_INVALID_FORMAT_CODE}: ${fmt}`,
      };
    }
    if (fmt === PG_FORMAT_CODE.BINARY) {
      return {
        code: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
        message: binaryUnsupportedMsg,
      };
    }
  }
  return null;
}

class PgWireExtendedQueryHandler {
  constructor(options) {
    if (!options?.describeStatement) {
      throw new Error(LOCAL_STR_DESCRIBE_OWNER_MISSING);
    }
    this._getSession = options.getSession;
    this._getSocket = options.getSocket;
    this._describeStatement = options.describeStatement;
    this._executeAndSend = options.executeAndSend;
    this._destroyConnection = options.destroyConnection;
    this._logger = options.logger;
    this._inExtendedError = false;
  }

  async dispatch(type, payload) {
    if (this._inExtendedError &&
        type !== PG_FRONTEND_MSG.SYNC &&
        type !== PG_FRONTEND_MSG.TERMINATE) {
      return;
    }
    switch (type) {
    case PG_FRONTEND_MSG.PARSE:
      await this._handleParse(payload);
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

  _sendError(code, message, detail = null) {
    this._inExtendedError = true;
    const session = this._getSession();
    if (session &&
        session.getTransactionState() === PG_TRANSACTION_STATE.IN_TRANSACTION) {
      session.setTransactionState(PG_TRANSACTION_STATE.FAILED);
    }
    this._getSocket().write(buildErrorResponse(
      PG_SEVERITY.ERROR,
      code,
      message,
      detail,
    ));
  }

  async _handleParse(payload) {
    const {name, query, paramTypes} = parseParseMessage(payload);
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.PARSE_RECEIVED, {
      sessionId: session.sessionId,
      name: name || LOCAL_STR_UNNAMED,
    });
    let description = null;
    try {
      description = await this._describeStatement(query, paramTypes);
    } catch (err) {
      this._sendError(
        resolveFailureSqlState(err),
        err.message || LOCAL_STR_DESCRIBE_FAILED,
        extractWireErrorDetail(err),
      );
    }
    if (description === null) {
      return;
    }
    if (!description || description.success === false) {
      const failure = description || {message: LOCAL_STR_DESCRIBE_FAILED};
      this._sendError(
        resolveFailureSqlState(failure),
        failure.error || failure.message || LOCAL_STR_DESCRIBE_FAILED,
        extractWireErrorDetail(failure),
      );
      return;
    }
    session.setPreparedStatement(name, query, paramTypes, description);
    this._getSocket().write(buildParseComplete());
  }

  _handleBind(payload) {
    let parsed = null;
    try {
      parsed = parseBindMessage(payload);
    } catch (err) {
      this._sendError(
        resolveFailureSqlState(err),
        err.message,
      );
    }
    if (parsed === null) {
      return;
    }
    const {portal, statement: statementName, paramFormats, params, resultFormats} = parsed;
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.BIND_RECEIVED, {
      sessionId: session.sessionId,
      portal: portal || LOCAL_STR_UNNAMED,
      statement: statementName || LOCAL_STR_UNNAMED,
    });
    const statement = session.getPreparedStatement(statementName);
    if (!statement) {
      this._sendError(
        PG_ERROR_CODE.INVALID_SQL_STATEMENT_NAME,
        `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: '${statementName}'`,
      );
      return;
    }
    const description = statement.description;
    if (!description || description.described !== true) {
      this._sendError(
        PG_ERROR_CODE.INTERNAL_ERROR,
        LOCAL_STR_DESCRIBE_FAILED,
      );
      return;
    }
    if (params.length !== description.paramCount) {
      this._sendError(
        PG_ERROR_CODE.PROTOCOL_VIOLATION,
        `${LOCAL_STR_PARAM_COUNT_MISMATCH}: ` +
          `expected ${description.paramCount}, got ${params.length}`,
      );
      return;
    }
    const paramFmtErr = validateBindFormats(
      paramFormats,
      params.length,
      LOCAL_STR_PARAM_FORMAT_COUNT_MISMATCH,
      LOCAL_STR_BINARY_PARAM_UNSUPPORTED,
    );
    if (paramFmtErr) {
      this._sendError(paramFmtErr.code, paramFmtErr.message);
      return;
    }
    const resultColCount = description.returnsRows ? description.columns.length : 0;
    const resultFmtErr = validateBindFormats(
      resultFormats,
      resultColCount,
      LOCAL_STR_RESULT_FORMAT_COUNT_MISMATCH,
      LOCAL_STR_BINARY_RESULT_UNSUPPORTED,
    );
    if (resultFmtErr) {
      this._sendError(resultFmtErr.code, resultFmtErr.message);
      return;
    }
    const portalDescription = Object.freeze({
      ...description,
      columns: Object.freeze(description.columns.map((col, idx) => Object.freeze({
        ...col,
        formatCode: resolveBindFormatAt(resultFormats, idx),
      }))),
    });
    session.setPortal(portal, statementName, params, {
      paramFormats,
      resultFormats,
      description: portalDescription,
    });
    this._getSocket().write(buildBindComplete());
  }

  _handleDescribe(payload) {
    const {type, name} = parseDescribeMessage(payload);
    const session = this._getSession();
    const socket = this._getSocket();
    if (type === PG_DESCRIBE_TYPE.STATEMENT) {
      const statement = session.getPreparedStatement(name);
      if (!statement) {
        this._sendError(
          PG_ERROR_CODE.INVALID_SQL_STATEMENT_NAME,
          `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: '${name}'`,
        );
        return;
      }
      const desc = statement.description;
      socket.write(buildParameterDescription(desc.paramOids));
      socket.write(
        desc.returnsRows ? buildRowDescription(desc.columns) : buildNoData(),
      );
      return;
    }
    if (type === PG_DESCRIBE_TYPE.PORTAL) {
      const portal = session.getPortal(name);
      if (!portal || !session.getPreparedStatement(portal.statementName)) {
        this._sendError(
          PG_ERROR_CODE.INVALID_CURSOR_NAME,
          `${LOCAL_STR_PORTAL_NOT_FOUND}: '${name}'`,
        );
        return;
      }
      const desc = portal.description;
      socket.write(
        desc.returnsRows ? buildRowDescription(desc.columns) : buildNoData(),
      );
      return;
    }
    this._sendError(
      PG_ERROR_CODE.PROTOCOL_VIOLATION,
      `${LOCAL_STR_INVALID_DESCRIBE_TARGET}: ${type}`,
    );
  }

  async _handleExecute(payload) {
    const {portal: portalName, maxRows} = parseExecuteMessage(payload);
    const session = this._getSession();
    this._logger.debug(PG_HANDLER_LOG.EXECUTE_RECEIVED, {
      sessionId: session.sessionId,
      portal: portalName || LOCAL_STR_UNNAMED,
    });
    const portal = session.getPortal(portalName);
    if (!portal) {
      this._sendError(
        PG_ERROR_CODE.INVALID_CURSOR_NAME,
        `${LOCAL_STR_PORTAL_NOT_FOUND}: '${portalName}'`,
      );
      return;
    }
    const statement = session.getPreparedStatement(portal.statementName);
    if (!statement) {
      this._sendError(
        PG_ERROR_CODE.INVALID_SQL_STATEMENT_NAME,
        `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: ` +
          `'${portal.statementName}'`,
      );
      return;
    }
    if (maxRows < 0) {
      this._sendError(
        PG_ERROR_CODE.PROTOCOL_VIOLATION,
        LOCAL_STR_NEGATIVE_MAX_ROWS,
      );
      return;
    }
    if (maxRows > 0) {
      this._sendError(
        PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
        LOCAL_STR_PORTAL_SUSPENSION_UNSUPPORTED,
      );
      return;
    }
    // A failed transaction block admits only its end (ROLLBACK, or COMMIT
    // answered as ROLLBACK).
    const admission = session.admitStatement(statement.query);
    if (admission.state !== PGWIRE_STATEMENT_ADMISSION.ADMITTED) {
      this._sendError(
        PG_ERROR_CODE.IN_FAILED_TRANSACTION,
        LOCAL_STR_CURRENT_TRANSACTION_IS_ABORTED_COMMANDS +
          LOCAL_STR_UNTIL_END_OF_TRANSACTION_BLOCK,
      );
      return;
    }
    if (statement.description?.isEmpty) {
      this._getSocket().write(buildEmptyQueryResponse());
      return;
    }
    const succeeded = await this._executeAndSend(
      admission.statement,
      portal.params,
      {extended: true, portalDescription: portal.description},
    );
    if (!succeeded) {
      this._inExtendedError = true;
    }
  }

  _handleSync() {
    const session = this._getSession();
    this._inExtendedError = false;
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
