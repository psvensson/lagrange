/**
 * PgWireSession — per-connection session state for PG wire protocol.
 *
 * Tracks prepared statements, portals, and transaction state for a
 * single TCP connection. Session state is connection-scoped and
 * replica-local per Requirement 8.1/8.2.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 *
 * @module runtime/pgwire-session
 */

import {PG_TRANSACTION_STATE} from './pgwire-protocol-constants.js';

// --- Session state constants ---

const PGWIRE_SESSION_STATE = Object.freeze({
  CREATED: 'created',
  AUTHENTICATED: 'authenticated',
  READY: 'ready',
  CLOSED: 'closed',
});

// --- Session error messages ---

const PGWIRE_SESSION_ERROR = Object.freeze({
  SESSION_ID_REQUIRED: 'sessionId is required',
  SESSION_CLOSED: 'Session is closed',
  STATEMENT_NAME_REQUIRED: 'Statement name is required',
  PORTAL_NAME_REQUIRED: 'Portal name is required',
  STATEMENT_NOT_FOUND: 'Prepared statement not found',
});

/**
 * Per-connection session state for a PG wire client.
 *
 * Manages prepared statements, portals, and transaction state.
 * All state is connection-scoped; no cross-replica migration.
 */
class PgWireSession {
  /**
   * @param {Object} options
   * @param {string} options.sessionId - Unique session identifier.
   * @param {string} [options.tenantId] - Tenant identifier.
   * @param {string} [options.user] - Authenticated user name.
   * @param {string} [options.database] - Target database name.
   */
  constructor(options) {
    if (!options || !options.sessionId) {
      throw new Error(PGWIRE_SESSION_ERROR.SESSION_ID_REQUIRED);
    }
    this.sessionId = options.sessionId;
    this.tenantId = options.tenantId || null;
    this.user = options.user || null;
    this.database = options.database || null;
    this.state = PGWIRE_SESSION_STATE.CREATED;
    this.txState = PG_TRANSACTION_STATE.IDLE;
    this.createdAt = Date.now();

    /**
     * Prepared statements by name.
     * Key: statement name ('' for unnamed).
     * Value: {query: string, paramTypes: number[]}
     * @type {Map<string, Object>}
     */
    this._statements = new Map();

    /**
     * Portals by name.
     * Key: portal name ('' for unnamed).
     * Value: {statementName: string, params: unknown[]}
     * @type {Map<string, Object>}
     */
    this._portals = new Map();
  }

  /**
   * Mark session as authenticated.
   */
  markAuthenticated() {
    this.state = PGWIRE_SESSION_STATE.AUTHENTICATED;
  }

  /**
   * Mark session as ready for queries.
   */
  markReady() {
    this.state = PGWIRE_SESSION_STATE.READY;
  }

  /**
   * Close the session and release all state.
   */
  close() {
    this.state = PGWIRE_SESSION_STATE.CLOSED;
    this._statements.clear();
    this._portals.clear();
  }

  /**
   * Store a prepared statement.
   *
   * @param {string} name - Statement name ('' for unnamed).
   * @param {string} query - SQL query text.
   * @param {number[]} [paramTypes] - Parameter type OIDs.
   */
  setPreparedStatement(name, query, paramTypes = []) {
    this._statements.set(name, {query, paramTypes});
    // Close any existing portal with the same name
    // per PG protocol semantics
    this._portals.delete(name);
  }

  /**
   * Get a prepared statement by name.
   *
   * @param {string} name - Statement name.
   * @return {Object|null} Statement or null.
   */
  getPreparedStatement(name) {
    return this._statements.get(name) || null;
  }

  /**
   * Check if a prepared statement exists.
   *
   * @param {string} name - Statement name.
   * @return {boolean}
   */
  hasPreparedStatement(name) {
    return this._statements.has(name);
  }

  /**
   * Remove a prepared statement and its associated portal.
   *
   * @param {string} name - Statement name.
   */
  closePreparedStatement(name) {
    this._statements.delete(name);
    this._portals.delete(name);
  }

  /**
   * Store a portal (bound statement with parameters).
   *
   * @param {string} portalName - Portal name ('' for unnamed).
   * @param {string} statementName - Source prepared statement name.
   * @param {unknown[]} params - Bound parameter values.
   */
  setPortal(portalName, statementName, params) {
    this._portals.set(portalName, {statementName, params});
  }

  /**
   * Get a portal by name.
   *
   * @param {string} name - Portal name.
   * @return {Object|null} Portal or null.
   */
  getPortal(name) {
    return this._portals.get(name) || null;
  }

  /**
   * Remove a portal.
   *
   * @param {string} name - Portal name.
   */
  closePortal(name) {
    this._portals.delete(name);
  }

  /**
   * Get current transaction state byte for ReadyForQuery.
   *
   * @return {number} Transaction state byte.
   */
  getTransactionState() {
    return this.txState;
  }

  /**
   * Set transaction state.
   *
   * @param {number} state - PG_TRANSACTION_STATE value.
   */
  setTransactionState(state) {
    this.txState = state;
  }

  /**
   * Check if session is in a failed transaction block.
   *
   * @return {boolean}
   */
  isInFailedTransaction() {
    return this.txState === PG_TRANSACTION_STATE.FAILED;
  }

  /**
   * Check if session is closed.
   *
   * @return {boolean}
   */
  isClosed() {
    return this.state === PGWIRE_SESSION_STATE.CLOSED;
  }
}

export {
  PgWireSession,
  PGWIRE_SESSION_STATE,
  PGWIRE_SESSION_ERROR,
};
