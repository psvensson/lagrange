/**
 * Constants for PG wire authentication and policy context mapping.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 *
 * @module runtime/pgwire-auth-constants
 */

// --- Auth decision outcomes ---

const PGWIRE_AUTH_DECISION = Object.freeze({
  AUTHENTICATED: 'authenticated',
  DENIED: 'denied',
  AUTHORIZED: 'authorized',
  REJECTED: 'rejected',
});

// --- Auth actions for policy checks ---

const PGWIRE_AUTH_ACTION = Object.freeze({
  CONNECT: 'pgwire.connect',
  EXECUTE_QUERY: 'pgwire.execute_query',
});

// --- Structured audit log messages ---

const PGWIRE_AUTH_AUDIT_MSG = Object.freeze({
  AUTH_SUCCESS: 'PG wire authentication succeeded',
  AUTH_FAILED: 'PG wire authentication failed',
  AUTHZ_GRANTED: 'PG wire authorization granted',
  AUTHZ_DENIED: 'PG wire authorization denied',
});

// --- Error messages ---

const PGWIRE_AUTH_ERROR_MSG = Object.freeze({
  CREDENTIALS_REQUIRED: 'Credentials are required',
  USER_REQUIRED: 'User is required for authentication',
  DATABASE_REQUIRED: 'Database is required for authentication',
  AUTHENTICATOR_FAILED: 'Authentication failed',
  AUTHORIZATION_DENIED: 'Authorization denied for action',
  SESSION_NOT_AUTHENTICATED:
    'Session must be authenticated before authorization',
  MODE_REQUIRED:
    'PG wire authentication requires an explicit mode or authenticator',
  MODE_UNSUPPORTED:
    'Unsupported PG wire authentication mode',
  POLICY_REQUIRED:
    'PG wire authorization requires an explicit policy',
});

const PGWIRE_AUTH_HANDLER_MODE = Object.freeze({
  TRUST: 'trust',
  PASSWORD: 'password',
});

// --- Log tag for auth audit entries ---

const PGWIRE_AUTH_LOG_TAG = 'pgwire.auth';

export {
  PGWIRE_AUTH_DECISION,
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_AUDIT_MSG,
  PGWIRE_AUTH_ERROR_MSG,
  PGWIRE_AUTH_LOG_TAG,
  PGWIRE_AUTH_HANDLER_MODE,
};
