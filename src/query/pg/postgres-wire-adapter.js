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
import {QUERY_WALL_TIME_LIMIT_MS} from
  '../../wasm-service/query-budget-constants.js';
import {PARSER_DIALECT} from './pg-compat-constants.js';
import {PG_SESSION_STATE, PG_WIRE_ERROR_MSG} from './pg-wire-constants.js';
import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  SERVICE_LIFECYCLE_SQL_COMMAND,
  classifyServiceLifecycleSql,
} from '../service-lifecycle-sql-contract.js';
import {PGWIRE_AUTH_ACTION} from
  '../../runtime/pgwire-auth-constants.js';
import {
  EXECUTION_MODE,
  ADAPTER_SUBSYSTEM,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
} from '../sql-adapter-constants.js';

const ANONYMOUS_PRINCIPAL = 'anonymous';
const CLOSED_SESSION_ROLLBACK_STATEMENT = 'ROLLBACK';
const NO_TRANSACTION_ERROR_CODE = 'NO_TRANSACTION';

function resolvePgWireWallTimeLimitMs(options = {}) {
  const requested = Number(options?.budgets?.WALL_TIME_LIMIT_MS);
  return Number.isFinite(requested) && requested > 0 ?
    requested : QUERY_WALL_TIME_LIMIT_MS;
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
      user: credentials.user || ANONYMOUS_PRINCIPAL,
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
      throw new Error(
        authorization?.error || PG_WIRE_ERROR_MSG.AUTHORIZATION_FAILED,
      );
    }

    const wallTimeLimitMs = resolvePgWireWallTimeLimitMs(options);
    const request = createSqlRequest({
      statement: sql,
      parameters: params,
      tenantId: session.tenantId,
      sessionId,
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
      budgets: options.budgets,
      hints: options.hints,
      dialect: PARSER_DIALECT.POSTGRESQL,
      timeoutBudget: createTimeoutBudget({
        configuredBudgetMs: wallTimeLimitMs,
      }),
      securityContext: session.securityContext,
      expectedTransactionId: options.expectedTransactionId ?? null,
    });

    this.logger.debug(ADAPTER_LOG_MSG.EXECUTING_VIA_SQLCORE, {
      sessionId: request.sessionId,
      tenantId: request.tenantId,
      executionMode: request.executionMode,
    });

    return await this.sqlCore.executeRequest(request);
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
    if (session && options.transactionOpen === true) {
      this.rollbackClosedSessionTransaction(sessionId);
    }
    if (session) {
      session.state = PG_SESSION_STATE.CLOSED;
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Roll back the engine transaction of a session being closed. The
   * request is built before the session is released; its answer is only
   * logged (NO_TRANSACTION: the engine had already ended it).
   * @param {string} sessionId - Session identifier.
   * @private
   */
  rollbackClosedSessionTransaction(sessionId) {
    const logFailure = (error) => this.logger.warn(
      ADAPTER_LOG_MSG.CLOSED_SESSION_ROLLBACK_FAILED, {sessionId, error});
    this.execute(sessionId, CLOSED_SESSION_ROLLBACK_STATEMENT).then(
      (result) => {
        if (result?.success === false &&
            result.errorCode !== NO_TRANSACTION_ERROR_CODE) {
          logFailure(result.error ?? result.errorCode);
        }
      },
      (error) => logFailure(error?.message ?? String(error)),
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

export {PostgresWireAdapter, PG_SESSION_STATE, PG_WIRE_ERROR_MSG};
