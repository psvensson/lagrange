/**
 * Constants for the PostgreSQL wire adapter.
 * Session state and error messages used by PostgresWireAdapter.
 * Requirements: 1.1, 3.1, 3.2, 3.3
 */

/**
 * Session state constants for protocol sessions.
 * @enum {string}
 */
const PG_SESSION_STATE = Object.freeze({
  CREATED: 'created',
  AUTHENTICATED: 'authenticated',
  READY: 'ready',
  CLOSED: 'closed',
});

/**
 * Error messages specific to the PostgreSQL wire adapter.
 * @enum {string}
 */
const PG_WIRE_ERROR_MSG = Object.freeze({
  SESSION_NOT_AUTHENTICATED:
    'Session must be authenticated before executing queries',
  SESSION_CLOSED: 'Session is closed',
  AUTHENTICATION_FAILED: 'Authentication failed',
  AUTHORIZATION_FAILED: 'Query authorization failed',
});

export {PG_SESSION_STATE, PG_WIRE_ERROR_MSG};
