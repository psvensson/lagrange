/**
 * PostgresWireAdapter — adapter for external SQL protocol sessions.
 *
 * Handles PostgreSQL wire-protocol session lifecycle (authentication,
 * feature negotiation) and delegates all SQL execution to SqlCore
 * through the canonical SqlRequest contract.
 *
 * Requirements: 1.1, 3.1, 3.2, 3.3
 */
// @ts-nocheck
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
import { LoggingService } from '../../logging/logging-service.js';
import { createSqlRequest } from '../sql-request.js';
import { PARSER_DIALECT } from './pg-compat-constants.js';
import { PG_SESSION_STATE, PG_WIRE_ERROR_MSG } from './pg-wire-constants.js';
import { EXECUTION_MODE, ADAPTER_SUBSYSTEM, ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG } from '../sql-adapter-constants.js';

/**
 * PostgresWireAdapter maps authenticated protocol sessions to
 * tenant/service policy and delegates SQL execution to SqlCore.
 *
 * This adapter does NOT implement the full PostgreSQL wire protocol
 * byte-level parsing (that is a future convergence goal). It provides
 * the session-to-SqlCore bridge so that when wire-level parsing is
 * added, it plugs into this adapter rather than creating a second
 * SQL execution path.
 */
class PostgresWireAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.sqlCore - SQLQueryEngine instance (SqlCore).
   * @param {Function} [options.authenticator] - async (credentials) => session
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("114221")) {
      {}
    } else {
      stryCov_9fa48("114221");
      if (stryMutAct_9fa48("114224") ? false : stryMutAct_9fa48("114223") ? true : stryMutAct_9fa48("114222") ? options.sqlCore : (stryCov_9fa48("114222", "114223", "114224"), !options.sqlCore)) {
        if (stryMutAct_9fa48("114225")) {
          {}
        } else {
          stryCov_9fa48("114225");
          throw new Error(ADAPTER_ERROR_MSG.SQL_CORE_REQUIRED);
        }
      }
      this.sqlCore = options.sqlCore;
      this.authenticator = stryMutAct_9fa48("114228") ? options.authenticator && null : stryMutAct_9fa48("114227") ? false : stryMutAct_9fa48("114226") ? true : (stryCov_9fa48("114226", "114227", "114228"), options.authenticator || null);
      this.sessions = new Map();
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("114229")) {
      {}
    } else {
      stryCov_9fa48("114229");
      try {
        if (stryMutAct_9fa48("114230")) {
          {}
        } else {
          stryCov_9fa48("114230");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("114232") ? false : stryMutAct_9fa48("114231") ? true : (stryCov_9fa48("114231", "114232"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("114233")) {
              {}
            } else {
              stryCov_9fa48("114233");
              return loggingService.forSubsystem(ADAPTER_SUBSYSTEM.POSTGRES_WIRE);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("114234")) {
          {}
        } else {
          stryCov_9fa48("114234");
          console.warn(ADAPTER_LOG_MSG.LOGGING_INIT_FAILED, logErr.message);
        }
      }
      return console;
    }
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
    if (stryMutAct_9fa48("114235")) {
      {}
    } else {
      stryCov_9fa48("114235");
      if (stryMutAct_9fa48("114238") ? false : stryMutAct_9fa48("114237") ? true : stryMutAct_9fa48("114236") ? sessionId : (stryCov_9fa48("114236", "114237", "114238"), !sessionId)) {
        if (stryMutAct_9fa48("114239")) {
          {}
        } else {
          stryCov_9fa48("114239");
          throw new Error(ADAPTER_ERROR_MSG.SESSION_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("114242") ? !credentials && !credentials.tenantId : stryMutAct_9fa48("114241") ? false : stryMutAct_9fa48("114240") ? true : (stryCov_9fa48("114240", "114241", "114242"), (stryMutAct_9fa48("114243") ? credentials : (stryCov_9fa48("114243"), !credentials)) || (stryMutAct_9fa48("114244") ? credentials.tenantId : (stryCov_9fa48("114244"), !credentials.tenantId)))) {
        if (stryMutAct_9fa48("114245")) {
          {}
        } else {
          stryCov_9fa48("114245");
          throw new Error(ADAPTER_ERROR_MSG.TENANT_ID_REQUIRED);
        }
      }

      // Delegate to pluggable authenticator if provided
      if (stryMutAct_9fa48("114247") ? false : stryMutAct_9fa48("114246") ? true : (stryCov_9fa48("114246", "114247"), this.authenticator)) {
        if (stryMutAct_9fa48("114248")) {
          {}
        } else {
          stryCov_9fa48("114248");
          const authResult = await this.authenticator(credentials);
          if (stryMutAct_9fa48("114251") ? !authResult && !authResult.authenticated : stryMutAct_9fa48("114250") ? false : stryMutAct_9fa48("114249") ? true : (stryCov_9fa48("114249", "114250", "114251"), (stryMutAct_9fa48("114252") ? authResult : (stryCov_9fa48("114252"), !authResult)) || (stryMutAct_9fa48("114253") ? authResult.authenticated : (stryCov_9fa48("114253"), !authResult.authenticated)))) {
            if (stryMutAct_9fa48("114254")) {
              {}
            } else {
              stryCov_9fa48("114254");
              throw new Error(PG_WIRE_ERROR_MSG.AUTHENTICATION_FAILED);
            }
          }
        }
      }
      const session = stryMutAct_9fa48("114255") ? {} : (stryCov_9fa48("114255"), {
        sessionId,
        tenantId: credentials.tenantId,
        user: stryMutAct_9fa48("114258") ? credentials.user && null : stryMutAct_9fa48("114257") ? false : stryMutAct_9fa48("114256") ? true : (stryCov_9fa48("114256", "114257", "114258"), credentials.user || null),
        state: PG_SESSION_STATE.AUTHENTICATED,
        createdAt: Date.now()
      });
      this.sessions.set(sessionId, session);
      this.logger.debug(ADAPTER_LOG_MSG.PROTOCOL_SESSION_MAPPED, stryMutAct_9fa48("114259") ? {} : (stryCov_9fa48("114259"), {
        sessionId,
        tenantId: session.tenantId
      }));
      return stryMutAct_9fa48("114260") ? {} : (stryCov_9fa48("114260"), {
        sessionId,
        tenantId: session.tenantId,
        state: session.state
      });
    }
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
   * @return {Promise<Object>} Query result from SqlCore.
   */
  async execute(sessionId, sql, params = stryMutAct_9fa48("114261") ? ["Stryker was here"] : (stryCov_9fa48("114261"), []), options = {}) {
    if (stryMutAct_9fa48("114262")) {
      {}
    } else {
      stryCov_9fa48("114262");
      const session = this.sessions.get(sessionId);
      if (stryMutAct_9fa48("114265") ? false : stryMutAct_9fa48("114264") ? true : stryMutAct_9fa48("114263") ? session : (stryCov_9fa48("114263", "114264", "114265"), !session)) {
        if (stryMutAct_9fa48("114266")) {
          {}
        } else {
          stryCov_9fa48("114266");
          throw new Error(PG_WIRE_ERROR_MSG.SESSION_NOT_AUTHENTICATED);
        }
      }
      if (stryMutAct_9fa48("114269") ? session.state !== PG_SESSION_STATE.CLOSED : stryMutAct_9fa48("114268") ? false : stryMutAct_9fa48("114267") ? true : (stryCov_9fa48("114267", "114268", "114269"), session.state === PG_SESSION_STATE.CLOSED)) {
        if (stryMutAct_9fa48("114270")) {
          {}
        } else {
          stryCov_9fa48("114270");
          throw new Error(PG_WIRE_ERROR_MSG.SESSION_CLOSED);
        }
      }
      const request = createSqlRequest(stryMutAct_9fa48("114271") ? {} : (stryCov_9fa48("114271"), {
        statement: sql,
        parameters: params,
        tenantId: session.tenantId,
        sessionId,
        executionMode: EXECUTION_MODE.SQL_STATEMENT,
        budgets: options.budgets,
        hints: options.hints,
        dialect: PARSER_DIALECT.POSTGRESQL
      }));
      this.logger.debug(ADAPTER_LOG_MSG.EXECUTING_VIA_SQLCORE, stryMutAct_9fa48("114272") ? {} : (stryCov_9fa48("114272"), {
        sessionId: request.sessionId,
        tenantId: request.tenantId,
        executionMode: request.executionMode
      }));
      return await this.sqlCore.executeRequest(request);
    }
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
    if (stryMutAct_9fa48("114273")) {
      {}
    } else {
      stryCov_9fa48("114273");
      const supported = stryMutAct_9fa48("114274") ? ["Stryker was here"] : (stryCov_9fa48("114274"), []);
      const unsupported = stryMutAct_9fa48("114275") ? ["Stryker was here"] : (stryCov_9fa48("114275"), []);
      for (const feature of requestedFeatures) {
        if (stryMutAct_9fa48("114276")) {
          {}
        } else {
          stryCov_9fa48("114276");
          // Currently no extended protocol features are supported;
          // all features are reported as unsupported so clients
          // degrade gracefully.
          unsupported.push(feature);
        }
      }
      if (stryMutAct_9fa48("114280") ? unsupported.length <= 0 : stryMutAct_9fa48("114279") ? unsupported.length >= 0 : stryMutAct_9fa48("114278") ? false : stryMutAct_9fa48("114277") ? true : (stryCov_9fa48("114277", "114278", "114279", "114280"), unsupported.length > 0)) {
        if (stryMutAct_9fa48("114281")) {
          {}
        } else {
          stryCov_9fa48("114281");
          this.logger.debug(ADAPTER_LOG_MSG.UNSUPPORTED_FEATURE, stryMutAct_9fa48("114282") ? {} : (stryCov_9fa48("114282"), {
            sessionId,
            unsupported
          }));
        }
      }
      return stryMutAct_9fa48("114283") ? {} : (stryCov_9fa48("114283"), {
        supported,
        unsupported
      });
    }
  }

  /**
   * Close a protocol session and release resources.
   *
   * @param {string} sessionId - Session identifier.
   */
  closeSession(sessionId) {
    if (stryMutAct_9fa48("114284")) {
      {}
    } else {
      stryCov_9fa48("114284");
      const session = this.sessions.get(sessionId);
      if (stryMutAct_9fa48("114286") ? false : stryMutAct_9fa48("114285") ? true : (stryCov_9fa48("114285", "114286"), session)) {
        if (stryMutAct_9fa48("114287")) {
          {}
        } else {
          stryCov_9fa48("114287");
          session.state = PG_SESSION_STATE.CLOSED;
          this.sessions.delete(sessionId);
        }
      }
    }
  }

  /**
   * Check whether a session is authenticated and open.
   *
   * @param {string} sessionId - Session identifier.
   * @return {boolean} True if session is authenticated and not closed.
   */
  hasSession(sessionId) {
    if (stryMutAct_9fa48("114288")) {
      {}
    } else {
      stryCov_9fa48("114288");
      const session = this.sessions.get(sessionId);
      return stryMutAct_9fa48("114291") ? !!session || session.state !== PG_SESSION_STATE.CLOSED : stryMutAct_9fa48("114290") ? false : stryMutAct_9fa48("114289") ? true : (stryCov_9fa48("114289", "114290", "114291"), (stryMutAct_9fa48("114292") ? !session : (stryCov_9fa48("114292"), !(stryMutAct_9fa48("114293") ? session : (stryCov_9fa48("114293"), !session)))) && (stryMutAct_9fa48("114295") ? session.state === PG_SESSION_STATE.CLOSED : stryMutAct_9fa48("114294") ? true : (stryCov_9fa48("114294", "114295"), session.state !== PG_SESSION_STATE.CLOSED)));
    }
  }
}
export { PostgresWireAdapter, PG_SESSION_STATE, PG_WIRE_ERROR_MSG };