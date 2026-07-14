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

import {
  validateSecurityContext,
  authorizeAction,
} from '../admin/admin-auth-middleware.js';
import {
  createSecurityAuditRecord,
} from '../admin/admin-audit-context.js';
import {
  PGWIRE_AUTH_DECISION,
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_AUDIT_MSG,
  PGWIRE_AUTH_ERROR_MSG,
  PGWIRE_AUTH_LOG_TAG,
  PGWIRE_AUTH_HANDLER_MODE,
} from './pgwire-auth-constants.js';

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
   * @param {string} [options.mode] - Explicit `trust` for loopback-only
   *   deployments. Omit only when an authenticator is supplied.
   * @param {Object} [options.policy] - Policy object with
   *   {allowedActions: Set|'*'}. Required.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    this._authenticator = options.authenticator || null;
    this._mode = options.mode || null;
    if (
      !this._authenticator &&
      this._mode !== PGWIRE_AUTH_HANDLER_MODE.TRUST
    ) {
      throw new Error(PGWIRE_AUTH_ERROR_MSG.MODE_REQUIRED);
    }
    if (
      this._mode &&
      !Object.values(PGWIRE_AUTH_HANDLER_MODE).includes(this._mode)
    ) {
      throw new Error(PGWIRE_AUTH_ERROR_MSG.MODE_UNSUPPORTED);
    }
    if (!options.policy) {
      throw new Error(PGWIRE_AUTH_ERROR_MSG.POLICY_REQUIRED);
    }
    this._policy = options.policy;
    this._logger = options.logger || console;
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
    if (!credentials) {
      return this._failAuth(
        null,
        PGWIRE_AUTH_ERROR_MSG.CREDENTIALS_REQUIRED,
      );
    }
    if (!credentials.user) {
      return this._failAuth(
        null,
        PGWIRE_AUTH_ERROR_MSG.USER_REQUIRED,
      );
    }
    if (!credentials.database) {
      return this._failAuth(
        null,
        PGWIRE_AUTH_ERROR_MSG.DATABASE_REQUIRED,
      );
    }

    // Delegate to pluggable authenticator if provided
    if (this._authenticator) {
      try {
        const authResult = await this._authenticator(credentials);
        if (!authResult || !authResult.authenticated) {
          return this._failAuth(
            {tenantId: credentials.database,
              principal: credentials.user},
            PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED,
          );
        }
        // Build context from authenticator result
        const context = Object.freeze({
          tenantId: credentials.database,
          principal: credentials.user,
          roles: authResult.roles || [],
        });
        return this._succeedAuth(context);
      } catch (_err) {
        return this._failAuth(
          {tenantId: credentials.database,
            principal: credentials.user},
          PGWIRE_AUTH_ERROR_MSG.AUTHENTICATOR_FAILED,
        );
      }
    }

    // Trust-mode: map user/database directly to context
    const context = Object.freeze({
      tenantId: credentials.database,
      principal: credentials.user,
      roles: [],
    });
    return this._succeedAuth(context);
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
    const effectiveAction = action ||
      PGWIRE_AUTH_ACTION.EXECUTE_QUERY;

    // Validate context first (reuse admin-auth-middleware)
    const validation = validateSecurityContext(securityContext);
    if (!validation.valid) {
      const auditRecord = createSecurityAuditRecord(
        PGWIRE_AUTH_AUDIT_MSG.AUTHZ_DENIED,
        PGWIRE_AUTH_DECISION.REJECTED,
        securityContext,
        effectiveAction,
      );
      this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
      return {
        authorized: false,
        auditRecord,
        error: validation.error,
      };
    }

    // Delegate to admin-auth-middleware authorizeAction
    const authzResult = authorizeAction(
      securityContext, effectiveAction, this._policy,
    );

    if (authzResult.authorized) {
      const auditRecord = createSecurityAuditRecord(
        PGWIRE_AUTH_AUDIT_MSG.AUTHZ_GRANTED,
        PGWIRE_AUTH_DECISION.AUTHORIZED,
        securityContext,
        effectiveAction,
      );
      this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
      return {authorized: true, auditRecord};
    }

    const auditRecord = createSecurityAuditRecord(
      PGWIRE_AUTH_AUDIT_MSG.AUTHZ_DENIED,
      PGWIRE_AUTH_DECISION.REJECTED,
      securityContext,
      effectiveAction,
    );
    this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
    return {
      authorized: false,
      auditRecord,
      error: authzResult.error ||
        PGWIRE_AUTH_ERROR_MSG.AUTHORIZATION_DENIED,
    };
  }

  /**
   * Build a successful auth result with audit record.
   *
   * @param {Object} context - Frozen security context.
   * @return {Object} Success result.
   * @private
   */
  _succeedAuth(context) {
    const auditRecord = createSecurityAuditRecord(
      PGWIRE_AUTH_AUDIT_MSG.AUTH_SUCCESS,
      PGWIRE_AUTH_DECISION.AUTHENTICATED,
      context,
      PGWIRE_AUTH_ACTION.CONNECT,
    );
    this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
    return {
      authenticated: true,
      context,
      auditRecord,
    };
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
    const auditRecord = createSecurityAuditRecord(
      PGWIRE_AUTH_AUDIT_MSG.AUTH_FAILED,
      PGWIRE_AUTH_DECISION.DENIED,
      partialContext,
      PGWIRE_AUTH_ACTION.CONNECT,
      {error},
    );
    this._logger.info(PGWIRE_AUTH_LOG_TAG, auditRecord);
    return {
      authenticated: false,
      context: null,
      auditRecord,
      error,
    };
  }
}

export {PgWireAuthHandler};
