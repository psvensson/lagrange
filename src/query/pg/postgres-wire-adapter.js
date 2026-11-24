/**
 * PostgresWireAdapter — adapter for external SQL protocol sessions.
 *
 * Handles PostgreSQL wire-protocol session lifecycle (authentication,
 * feature negotiation) and delegates all SQL execution to SqlCore
 * through the canonical SqlRequest contract.
 *
 * Requirements: 1.1, 3.1, 3.2, 3.3
 */

import {LoggingService} from '../../logging/logging-service.js';
import {createSqlRequest} from '../sql-request.js';
import {createTimeoutBudget} from '../../control-plane/timeout-budget.js';
import {
  normalizeQueryBudget,
} from '../../wasm-service/query-budget-constants.js';
import {
  QUERY_ERROR_CODE,
} from '../query-constants.js';
import {
  projectTransactionParticipantFailure,
} from '../distributed/transaction-participant-error-projection.js';
import {PARSER_DIALECT} from './pg-compat-constants.js';
import {
  PG_SESSION_STATE,
  PG_WIRE_ERROR_MSG,
  PG_WIRE_SQLSTATE,
} from './pg-wire-constants.js';
import {
  describeLifecycleStatement,
} from './postgres-wire-description.js';
import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  SERVICE_LIFECYCLE_SQL_COMMAND,
  classifyServiceLifecycleSql,
} from '../service-lifecycle-sql-contract.js';
import {
  PGWIRE_ANONYMOUS_PRINCIPAL,
  PGWIRE_AUTH_ACTION,
} from '../../runtime/pgwire-auth-constants.js';
import {
  EXECUTION_MODE,
  ADAPTER_SUBSYSTEM,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
} from '../sql-adapter-constants.js';

const CLOSED_SESSION_ROLLBACK_STATEMENT = 'ROLLBACK';
const NO_TRANSACTION_ERROR_CODE = 'NO_TRANSACTION';
const BEGIN_STATEMENT_PATTERN = /^\s*(?:BEGIN|START\s+TRANSACTION)\b/i;

function isBeginStatementSql(sql) {
  return typeof sql === 'string' && BEGIN_STATEMENT_PATTERN.test(sql);
}

function resolveStatementAuthorizationAction(statement) {
  const classification = classifyServiceLifecycleSql(statement);
  if (classification.kind !== SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE) {
    return PGWIRE_AUTH_ACTION.EXECUTE_QUERY;
  }
  switch (classification.command) {
  case SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING:
    return PGWIRE_AUTH_ACTION.BINDING_CALL;
  case SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS:
    return PGWIRE_AUTH_ACTION.ACCESS_CONFIGURE;
  case SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING:
    return PGWIRE_AUTH_ACTION.BINDING_CREATE;
  case SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL:
  case SERVICE_LIFECYCLE_SQL_COMMAND.PUBLISH_ARTIFACT:
    return PGWIRE_AUTH_ACTION.SERVICE_INSTALL;
  case SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE:
    return PGWIRE_AUTH_ACTION.SERVICE_UPGRADE;
  case SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE:
    return PGWIRE_AUTH_ACTION.SERVICE_REMOVE;
  case SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL:
  case SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE:
    return PGWIRE_AUTH_ACTION.SERVICE_READ;
  default:
    throw new Error(ADAPTER_ERROR_MSG.LIFECYCLE_AUTH_ACTION_REQUIRED);
  }
}

function projectPgWireExecutionResult(result) {
  const projected = projectTransactionParticipantFailure(result);
  if (
    projected?.success === false &&
    (projected.errorCode === QUERY_ERROR_CODE.WRITE_CONFLICT ||
      projected.errorCode === QUERY_ERROR_CODE.TRANSACTION_CONFLICT)
  ) {
    return {
      ...projected,
      sqlState: PG_WIRE_SQLSTATE.SERIALIZATION_FAILURE,
    };
  }
  return projected;
}

/**
 * PostgresWireAdapter maps authenticated protocol sessions to
 * tenant/service policy and delegates SQL execution to SqlCore.
 *
 * The byte-level handler delegates here so session security and canonical
 * SqlRequest construction remain below one protocol boundary.
 */
class PostgresWireAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.sqlCore - SQLQueryEngine instance (SqlCore).
   * @param {Object} options.authHandler - Authentication/authorization owner.
   */
  constructor(options = {}) {
    if (!options.sqlCore) {
      throw new Error(ADAPTER_ERROR_MSG.SQL_CORE_REQUIRED);
    }
    if (
      !options.authHandler ||
      typeof options.authHandler.authenticate !== 'function' ||
      typeof options.authHandler.authorizeQuery !== 'function'
    ) {
      throw new Error(ADAPTER_ERROR_MSG.AUTH_HANDLER_REQUIRED);
    }
    this.sqlCore = options.sqlCore;
    this.transactionCoordinator = options.sqlCore.transactionCoordinator || null;
    this.authHandler = options.authHandler;
    this.sessions = new Map();
    this.logger = options.logger || this.initLogger();
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(ADAPTER_SUBSYSTEM.POSTGRES_WIRE);
      }
    } catch (logErr) {
      console.warn(ADAPTER_LOG_MSG.LOGGING_INIT_FAILED,
        logErr.message);
    }
    return console;
  }

  /**
   * Authenticate a new protocol session.
   *
   * Maps credentials to a tenant/service policy context that is
   * attached to every subsequent SqlRequest from this session.
   *
   * Requirement 3.3: Map authenticated protocol sessions to
   * tenant/service policy before query execution.
   *
   * @param {string} sessionId - Unique session identifier.
   * @param {Object} credentials - Authentication credentials.
   * @param {string} credentials.tenantId - Tenant identifier.
   * @param {string} [credentials.user] - Username.
   * @param {string} [credentials.password] - Password.
   * @return {Promise<Object>} Session info with state.
   */
  async authenticate(sessionId, credentials) {
    if (!sessionId) {
      throw new Error(ADAPTER_ERROR_MSG.SESSION_ID_REQUIRED);
    }
    if (!credentials || !credentials.tenantId) {
      throw new Error(ADAPTER_ERROR_MSG.TENANT_ID_REQUIRED);
    }

    const authResult = await this.authHandler.authenticate({
      user: credentials.user || PGWIRE_ANONYMOUS_PRINCIPAL,
      database: credentials.tenantId,
      password: credentials.password,
    });
    if (!authResult || !authResult.authenticated || !authResult.context) {
      throw new Error(
        authResult?.error || PG_WIRE_ERROR_MSG.AUTHENTICATION_FAILED,
      );
    }

    const session = {
      sessionId,
      tenantId: authResult.context.tenantId,
      user: authResult.context.principal,
      state: PG_SESSION_STATE.AUTHENTICATED,
      closed: false,
      inFlightBeginCount: 0,
      rollbackPromise: null,
      createdAt: Date.now(),
      securityContext: authResult.context,
    };

    this.sessions.set(sessionId, session);

    this.logger.debug(ADAPTER_LOG_MSG.PROTOCOL_SESSION_MAPPED, {
      sessionId,
      tenantId: session.tenantId,
    });

    return {
      sessionId,
      tenantId: session.tenantId,
      state: session.state,
    };
  }

  _requireAuthorizedSession(sessionId, sql) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(PG_WIRE_ERROR_MSG.SESSION_NOT_AUTHENTICATED);
    }
    if (session.state === PG_SESSION_STATE.CLOSED) {
      throw new Error(PG_WIRE_ERROR_MSG.SESSION_CLOSED);
    }
    const authorization = this.authHandler.authorizeQuery(
      session.securityContext,
      resolveStatementAuthorizationAction(sql),
    );
    if (!authorization?.authorized) {
      const reason = typeof authorization?.error === 'string' ?
        authorization.error :
        PG_WIRE_ERROR_MSG.AUTHORIZATION_FAILED;
      throw new Error(reason);
    }
    return session;
  }

  _projectExecutedResult(sql, result) {
    const projected = projectPgWireExecutionResult(result);
    const hasColumns = Array.isArray(projected?.columns) && projected.columns.length > 0;
    const needsLifecycleColumns =
      projected?.success === true && !hasColumns && !projected.columnDescriptors &&
      classifyServiceLifecycleSql(sql).kind === SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE;
    return needsLifecycleColumns ?
      {...projected, columnDescriptors: describeLifecycleStatement(sql).columns} :
      projected;
  }

  /**
   * Execute a SQL statement within an authenticated session.
   *
   * Requirement 3.2: Compile and execute statements via SqlCore.
   *
   * @param {string} sessionId - Authenticated session identifier.
   * @param {string} sql - SQL statement text.
   * @param {unknown[]} [params] - Bind parameters.
   * @param {Object} [options] - Execution options.
   * @param {Object} [options.budgets] - Budget overrides.
   * @param {Object} [options.hints] - Planner hint overrides.
   * @param {string|null} [options.expectedTransactionId] - The explicit
   *   transaction the protocol session believes it is in.
   * @return {Promise<Object>} Query result from SqlCore.
   */
  async execute(sessionId, sql, params = [], options = {}) {
    const session = this._requireAuthorizedSession(sessionId, sql);
    // The statement's wall-time budget is the request budget's own limit.
    const budgets = normalizeQueryBudget(options.budgets);
    const request = createSqlRequest({
      statement: sql,
      parameters: params,
      tenantId: session.tenantId,
      sessionId,
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
      budgets,
      hints: options.hints,
      dialect: PARSER_DIALECT.POSTGRESQL,
      timeoutBudget: createTimeoutBudget({
        configuredBudgetMs: budgets.WALL_TIME_LIMIT_MS,
      }),
      securityContext: session.securityContext,
      expectedTransactionId: options.expectedTransactionId ?? null,
      abortSignal: options.abortSignal,
    });
    this.logger.debug(ADAPTER_LOG_MSG.EXECUTING_VIA_SQLCORE, {
      sessionId: request.sessionId,
      tenantId: request.tenantId,
      executionMode: request.executionMode,
    });
    const isBegin = isBeginStatementSql(sql);
    if (isBegin) {
      session.inFlightBeginCount += 1;
    }
    let result;
    try {
      result = await this.sqlCore.executeRequest(request);
    } finally {
      if (isBegin) {
        session.inFlightBeginCount = Math.max(0, session.inFlightBeginCount - 1);
      }
    }
    if (session.closed === true) {
      if (result?.transactionId && session.rollbackPromise === null) {
        session.rollbackPromise = this.rollbackClosedSessionTransaction(
          session,
          result.transactionId,
        );
      }
      if (session.rollbackPromise !== null) {
        await session.rollbackPromise;
      }
    }
    return this._projectExecutedResult(sql, result);
  }

  /**
   * Describe a SQL statement (parameter OIDs and result columns) without
   * executing side effects or invoking guest code.
   *
   * @param {string} sessionId - Authenticated session identifier.
   * @param {string} sql - SQL statement text.
   * @param {number[]} [paramTypes] - Client-declared parameter OIDs from Parse.
   * @param {Object} [options] - Request options.
   * @return {Promise<Object>} Description result.
   */
  async describe(sessionId, sql, paramTypes = [], options = {}) {
    const session = this._requireAuthorizedSession(sessionId, sql);
    if (typeof sql === 'string' && sql.trim().length === 0) {
      return Object.freeze({
        success: true,
        described: true,
        statementType: null,
        isEmpty: true,
        returnsRows: false,
        paramCount: 0,
        paramOids: Object.freeze([]),
        columns: Object.freeze([]),
      });
    }
    if (classifyServiceLifecycleSql(sql).kind ===
        SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE) {
      return describeLifecycleStatement(sql, paramTypes);
    }
    const budgets = normalizeQueryBudget(options.budgets);
    const request = createSqlRequest({
      statement: sql,
      parameters: paramTypes,
      tenantId: session.tenantId,
      sessionId,
      executionMode: EXECUTION_MODE.DESCRIBE,
      budgets,
      dialect: PARSER_DIALECT.POSTGRESQL,
      timeoutBudget: createTimeoutBudget({
        configuredBudgetMs: budgets.WALL_TIME_LIMIT_MS,
      }),
      securityContext: session.securityContext,
      expectedTransactionId: options.expectedTransactionId ?? null,
    });
    return this.sqlCore.executeRequest(request);
  }

  /**
   * Negotiate protocol features.
   *
   * Requirement 3.4: Expose capability/feature negotiation so
   * unsupported features fail explicitly.
   *
   * @param {string} sessionId - Session identifier.
   * @param {string[]} requestedFeatures - Features the client wants.
   * @return {Object} Supported/unsupported feature map.
   */
  negotiateFeatures(sessionId, requestedFeatures) {
    const supported = [];
    const unsupported = [];

    for (const feature of requestedFeatures) {
      // Currently no extended protocol features are supported;
      // all features are reported as unsupported so clients
      // degrade gracefully.
      unsupported.push(feature);
    }

    if (unsupported.length > 0) {
      this.logger.debug(ADAPTER_LOG_MSG.UNSUPPORTED_FEATURE, {
        sessionId,
        unsupported,
      });
    }

    return {supported, unsupported};
  }

  /**
   * Close a protocol session and release resources. A session closed with
   * its transaction block open (the client disconnected mid-block) has its
   * engine transaction rolled back now, best effort, so it does not hold
   * its partitions' transaction slot until the budget sweep.
   *
   * @param {string} sessionId - Session identifier.
   * @param {Object} [options]
   * @param {boolean} [options.transactionOpen] - The session's transaction
   *   block was open when it closed.
   */
  closeSession(sessionId, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    session.closed = true;
    session.state = PG_SESSION_STATE.CLOSED;
    this.sessions.delete(sessionId);
    this.transactionCoordinator?.markInFlightBeginsClosed(sessionId);
    if (options.transactionOpen === true || session.inFlightBeginCount > 0) {
      session.rollbackPromise = this.rollbackClosedSessionTransaction(session);
    }
    return session.rollbackPromise;
  }

  /**
   * Roll back the engine transaction of a session being closed. The
   * request is built from the captured session record; its answer is only
   * logged (NO_TRANSACTION: the engine had already ended it).
   * @param {Object|string} sessionOrId - Session record or session identifier.
   * @param {string|null} [expectedTransactionId] - Optional transaction ID.
   * @return {Promise<Object|null>}
   * @private
   */
  rollbackClosedSessionTransaction(sessionOrId, expectedTransactionId = null) {
    const session = typeof sessionOrId === 'object' && sessionOrId !== null ?
      sessionOrId :
      this.sessions.get(sessionOrId);
    const sessionId = session?.sessionId ?? sessionOrId;
    const logFailure = (error) => this.logger.warn(
      ADAPTER_LOG_MSG.CLOSED_SESSION_ROLLBACK_FAILED, {sessionId, error});
    if (!session) {
      return Promise.resolve(null);
    }
    const budgets = normalizeQueryBudget();
    const request = createSqlRequest({
      statement: CLOSED_SESSION_ROLLBACK_STATEMENT,
      parameters: [],
      tenantId: session.tenantId,
      sessionId,
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
      budgets,
      dialect: PARSER_DIALECT.POSTGRESQL,
      timeoutBudget: createTimeoutBudget({
        configuredBudgetMs: budgets.WALL_TIME_LIMIT_MS,
      }),
      securityContext: session.securityContext,
      expectedTransactionId,
    });
    return this.sqlCore.executeRequest(request).then(
      (result) => {
        if (result?.success === false &&
            result.errorCode !== NO_TRANSACTION_ERROR_CODE) {
          logFailure(result.error ?? result.errorCode);
        }
        return result;
      },
      (error) => {
        logFailure(error?.message ?? String(error));
        return null;
      },
    );
  }

  /**
   * Check whether a session is authenticated and open.
   *
   * @param {string} sessionId - Session identifier.
   * @return {boolean} True if session is authenticated and not closed.
   */
  hasSession(sessionId) {
    const session = this.sessions.get(sessionId);
    return !!session && session.state !== PG_SESSION_STATE.CLOSED;
  }
}

export {
  PostgresWireAdapter,
  PG_SESSION_STATE,
  PG_WIRE_ERROR_MSG,
  projectPgWireExecutionResult,
};
