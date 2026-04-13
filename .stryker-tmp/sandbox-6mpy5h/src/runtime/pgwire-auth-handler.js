/**
 * PgWireAuthHandler — authentication and policy context mapping
 * for PostgreSQL wire protocol sessions.
 *
 * Maps PG wire startup parameters (user, database) to canonical
 * tenant/principal context. Validates credentials, enforces
 * authorization policy before query execution, and emits
 * structured audit log entries for all auth decisions.
 *
 * Reuses validation patterns from admin-auth-middleware and
 * audit record creation from admin-audit-context. No duplication
 * of auth logic.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 *
 * @module runtime/pgwire-auth-handler
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
import { validateSecurityContext, authorizeAction } from '../admin/admin-auth-middleware.js';
import { createSecurityAuditRecord } from '../admin/admin-audit-context.js';
import { PGWIRE_AUTH_DECISION, PGWIRE_AUTH_ACTION, PGWIRE_AUTH_AUDIT_MSG, PGWIRE_AUTH_ERROR_MSG, PGWIRE_AUTH_LOG_TAG } from './pgwire-auth-constants.js';

/**
 * PgWireAuthHandler handles authentication and authorization
 * for PG wire protocol connections.
 *
 * Fail-closed: no session context is produced on auth failure.
 */
class PgWireAuthHandler {
  /**
   * @param {Object} options
   * @param {Function} [options.authenticator] - async (credentials)
   *   => {authenticated: boolean, roles?: string[]}.
   *   When null, trust-mode authentication is used (maps user/db
   *   directly to context without credential verification).
   * @param {Object} [options.policy] - Policy object with
   *   {allowedActions: Set|'*'}. Defaults to wildcard (allow all).
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("147248")) {
      {}
    } else {
      stryCov_9fa48("147248");
      this._authenticator = stryMutAct_9fa48("147251") ? options.authenticator && null : stryMutAct_9fa48("147250") ? false : stryMutAct_9fa48("147249") ? true : (stryCov_9fa48("147249", "147250", "147251"), options.authenticator || null);
      this._policy = stryMutAct_9fa48("147254") ? options.policy && null : stryMutAct_9fa48("147253") ? false : stryMutAct_9fa48("147252") ? true : (stryCov_9fa48("147252", "147253", "147254"), options.policy || null);
      this._logger = stryMutAct_9fa48("147257") ? options.logger && console : stryMutAct_9fa48("147256") ? false : stryMutAct_9fa48("147255") ? true : (stryCov_9fa48("147255", "147256", "147257"), options.logger || console);
    }
  }

  /**
   * Authenticate a PG wire connection and produce a canonical
   * tenant/principal security context.
   *
   * Fail-closed: returns null context on any auth failure.
   *
   * @param {Object} credentials
   * @param {string} credentials.user - PG startup user parameter.
   * @param {string} credentials.database - PG startup database
   *   parameter (maps to tenantId).
   * @param {string} [credentials.password] - Optional password.
   * @return {Promise<Object>} Result with shape:
   *   {authenticated: boolean, context: Object|null,
   *    auditRecord: Object, error?: string}
   */
  async authenticate(credentials) {
    if (stryMutAct_9fa48("147258")) {
      {}
    } else {
      stryCov_9fa48("147258");
      if (stryMutAct_9fa48("147261") ? false : stryMutAct_9fa48("147260") ? true : stryMutAct_9fa48("147259") ? credentials : (stryCov_9fa48("147259", "147260", "147261"), !credentials)) {
        if (stryMutAct_9fa48("147262")) {
          {}
        } else {
          stryCov_9fa48("147262");
          return this._failAuth(null, PGWIRE_AUTH_ERROR_MSG.CREDENTIALS_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("147265") ? false : stryMutAct_9fa48("147264") ? true : stryMutAct_9fa48("147263") ? credentials.user : (stryCov_9fa48("147263", "147264", "147265"), !credentials.user)) {
        if (stryMutAct_9fa48("147266")) {
          {}
        } else {
          stryCov_9fa48("147266");
          return this._failAuth(null, PGWIRE_AUTH_ERROR_MSG.USER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("147269") ? false : stryMutAct_9fa48("147268") ? true : stryMutAct_9fa48("147267") ? credentials.database : (stryCov_9fa48("147267", "147268", "147269"), !credentials.database)) {
        if (stryMutAct_9fa48("147270")) {
          {}
        } else {
          stryCov_9fa48("147270");
          return this._failAuth(null, PGWIRE_AUTH_ERROR_MSG.DATABASE_REQUIRED);
        }
      }

      // Delegate to pluggable authenticator if provided
      if (stryMutAct_9fa48("147272") ? false : stryMutAct_9fa48("147271") ? true : (stryCov_9fa48("147271", "147272"), this._authenticator)) {
        if (stryMutAct_9fa48("147273")) {
          {}
        } else {
          stryCov_9fa48("147273");
          try {
            if (stryMutAct_9fa48("147274")) {
              {}
            } else {
              stryCov_9fa48("147274");
              const authResult = await this._authenticator(credentials);
              if (stryMutAct_9fa48("147277") ? !authResult && !authResult.authenticated : stryMutAct_9fa48("147276") ? false : stryMutAct_9fa48("147275") ? true : (stryCov_9fa48("147275", "147276", "147277"), (stryMutAct_9fa48("147278") ? authResult : (stryCov_9fa48("147278"), !authResult)) || (stryMutAct_9fa48("147279") ? authResult.authenticated : (stryCov_9fa48("147279"), !authResult.authenticated)))) {
                if (stryMutAct_9fa48("147280")) {
                  {}
                } else {
                  stryCov_9fa48("147280");
                  return this._failAuth(stryMutAct_9fa48("147281") ? {} : (stryCov_9fa48("147281"), {
                    tenantId: credentials.database,
                    principal: credentials.user
                  }), PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED);
                }
              }
              // Build context from authenticator result
              const context = Object.freeze(stryMutAct_9fa48("147282") ? {} : (stryCov_9fa48("147282"), {
                tenantId: credentials.database,
                principal: credentials.user,
                roles: stryMutAct_9fa48("147285") ? authResult.roles && [] : stryMutAct_9fa48("147284") ? false : stryMutAct_9fa48("147283") ? true : (stryCov_9fa48("147283", "147284", "147285"), authResult.roles || (stryMutAct_9fa48("147286") ? ["Stryker was here"] : (stryCov_9fa48("147286"), [])))
              }));
              return this._succeedAuth(context);
            }
          } catch (err) {
            if (stryMutAct_9fa48("147287")) {
              {}
            } else {
              stryCov_9fa48("147287");
              return this._failAuth(stryMutAct_9fa48("147288") ? {} : (stryCov_9fa48("147288"), {
                tenantId: credentials.database,
                principal: credentials.user
              }), stryMutAct_9fa48("147291") ? err.message && PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED : stryMutAct_9fa48("147290") ? false : stryMutAct_9fa48("147289") ? true : (stryCov_9fa48("147289", "147290", "147291"), err.message || PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED));
            }
          }
        }
      }

      // Trust-mode: map user/database directly to context
      const context = Object.freeze(stryMutAct_9fa48("147292") ? {} : (stryCov_9fa48("147292"), {
        tenantId: credentials.database,
        principal: credentials.user,
        roles: stryMutAct_9fa48("147293") ? ["Stryker was here"] : (stryCov_9fa48("147293"), [])
      }));
      return this._succeedAuth(context);
    }
  }

  /**
   * Authorize a query execution action against the session's
   * security context and the configured policy.
   *
   * Reuses authorizeAction from admin-auth-middleware.
   *
   * @param {Object} securityContext - {tenantId, principal, roles}.
   * @param {string} [action] - Action to authorize. Defaults to
   *   PGWIRE_AUTH_ACTION.EXECUTE_QUERY.
   * @return {Object} Result with shape:
   *   {authorized: boolean, auditRecord: Object, error?: string}
   */
  authorizeQuery(securityContext, action) {
    if (stryMutAct_9fa48("147294")) {
      {}
    } else {
      stryCov_9fa48("147294");
      const effectiveAction = stryMutAct_9fa48("147297") ? action && PGWIRE_AUTH_ACTION.EXECUTE_QUERY : stryMutAct_9fa48("147296") ? false : stryMutAct_9fa48("147295") ? true : (stryCov_9fa48("147295", "147296", "147297"), action || PGWIRE_AUTH_ACTION.EXECUTE_QUERY);

      // Validate context first (reuse admin-auth-middleware)
      const validation = validateSecurityContext(securityContext);
      if (stryMutAct_9fa48("147300") ? false : stryMutAct_9fa48("147299") ? true : stryMutAct_9fa48("147298") ? validation.valid : (stryCov_9fa48("147298", "147299", "147300"), !validation.valid)) {
        if (stryMutAct_9fa48("147301")) {
          {}
        } else {
          stryCov_9fa48("147301");
          const auditRecord = createSecurityAuditRecord(PGWIRE_AUTH_AUDIT_MSG.AUTHZ_DENIED, PGWIRE_AUTH_DECISION.REJECTED, securityContext, effectiveAction);
          this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
          return stryMutAct_9fa48("147302") ? {} : (stryCov_9fa48("147302"), {
            authorized: stryMutAct_9fa48("147303") ? true : (stryCov_9fa48("147303"), false),
            auditRecord,
            error: validation.error
          });
        }
      }

      // If no policy configured, allow all (wildcard)
      if (stryMutAct_9fa48("147306") ? false : stryMutAct_9fa48("147305") ? true : stryMutAct_9fa48("147304") ? this._policy : (stryCov_9fa48("147304", "147305", "147306"), !this._policy)) {
        if (stryMutAct_9fa48("147307")) {
          {}
        } else {
          stryCov_9fa48("147307");
          const auditRecord = createSecurityAuditRecord(PGWIRE_AUTH_AUDIT_MSG.AUTHZ_GRANTED, PGWIRE_AUTH_DECISION.AUTHORIZED, securityContext, effectiveAction);
          this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
          return stryMutAct_9fa48("147308") ? {} : (stryCov_9fa48("147308"), {
            authorized: stryMutAct_9fa48("147309") ? false : (stryCov_9fa48("147309"), true),
            auditRecord
          });
        }
      }

      // Delegate to admin-auth-middleware authorizeAction
      const authzResult = authorizeAction(securityContext, effectiveAction, this._policy);
      if (stryMutAct_9fa48("147311") ? false : stryMutAct_9fa48("147310") ? true : (stryCov_9fa48("147310", "147311"), authzResult.authorized)) {
        if (stryMutAct_9fa48("147312")) {
          {}
        } else {
          stryCov_9fa48("147312");
          const auditRecord = createSecurityAuditRecord(PGWIRE_AUTH_AUDIT_MSG.AUTHZ_GRANTED, PGWIRE_AUTH_DECISION.AUTHORIZED, securityContext, effectiveAction);
          this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
          return stryMutAct_9fa48("147313") ? {} : (stryCov_9fa48("147313"), {
            authorized: stryMutAct_9fa48("147314") ? false : (stryCov_9fa48("147314"), true),
            auditRecord
          });
        }
      }
      const auditRecord = createSecurityAuditRecord(PGWIRE_AUTH_AUDIT_MSG.AUTHZ_DENIED, PGWIRE_AUTH_DECISION.REJECTED, securityContext, effectiveAction);
      this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
      return stryMutAct_9fa48("147315") ? {} : (stryCov_9fa48("147315"), {
        authorized: stryMutAct_9fa48("147316") ? true : (stryCov_9fa48("147316"), false),
        auditRecord,
        error: stryMutAct_9fa48("147319") ? authzResult.error && PGWIRE_AUTH_ERROR_MSG.AUTHORIZATION_DENIED : stryMutAct_9fa48("147318") ? false : stryMutAct_9fa48("147317") ? true : (stryCov_9fa48("147317", "147318", "147319"), authzResult.error || PGWIRE_AUTH_ERROR_MSG.AUTHORIZATION_DENIED)
      });
    }
  }

  /**
   * Build a successful auth result with audit record.
   *
   * @param {Object} context - Frozen security context.
   * @return {Object} Success result.
   * @private
   */
  _succeedAuth(context) {
    if (stryMutAct_9fa48("147320")) {
      {}
    } else {
      stryCov_9fa48("147320");
      const auditRecord = createSecurityAuditRecord(PGWIRE_AUTH_AUDIT_MSG.AUTH_SUCCESS, PGWIRE_AUTH_DECISION.AUTHENTICATED, context, PGWIRE_AUTH_ACTION.CONNECT);
      this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
      return stryMutAct_9fa48("147321") ? {} : (stryCov_9fa48("147321"), {
        authenticated: stryMutAct_9fa48("147322") ? false : (stryCov_9fa48("147322"), true),
        context,
        auditRecord
      });
    }
  }

  /**
   * Build a failed auth result with audit record.
   * Fail-closed: context is always null.
   *
   * @param {Object|null} partialContext - Partial context for audit.
   * @param {string} error - Error message.
   * @return {Object} Failure result.
   * @private
   */
  _failAuth(partialContext, error) {
    if (stryMutAct_9fa48("147323")) {
      {}
    } else {
      stryCov_9fa48("147323");
      const auditRecord = createSecurityAuditRecord(PGWIRE_AUTH_AUDIT_MSG.AUTH_FAILED, PGWIRE_AUTH_DECISION.DENIED, partialContext, PGWIRE_AUTH_ACTION.CONNECT, stryMutAct_9fa48("147324") ? {} : (stryCov_9fa48("147324"), {
        error
      }));
      this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
      return stryMutAct_9fa48("147325") ? {} : (stryCov_9fa48("147325"), {
        authenticated: stryMutAct_9fa48("147326") ? true : (stryCov_9fa48("147326"), false),
        context: null,
        auditRecord,
        error
      });
    }
  }
}
export { PgWireAuthHandler };