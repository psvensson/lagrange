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
import {AST_TYPE} from '../query/parser-constants.js';
import {classifyTransactionControlStatement} from
  '../query/sql-transaction-control-grammar.js';

// PostgreSQL ends a failed transaction block on COMMIT by rolling it back
// (the CommandComplete tag is ROLLBACK).
const FAILED_BLOCK_END_STATEMENT = 'ROLLBACK';

// Whether the session runs a statement it was sent.
const PGWIRE_STATEMENT_ADMISSION = Object.freeze({
  ADMITTED: 'admitted',
  // Inside a failed transaction block (25P02).
  REFUSED_IN_FAILED_BLOCK: 'refused_in_failed_block',
});

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
    // The engine transaction this session's block is in (from the engine's
    // BEGIN answer); every statement of the block is sent for it, so the
    // engine refuses one for a transaction it no longer holds.
    this.transactionId = null;
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
    if (state === PG_TRANSACTION_STATE.IDLE) this.transactionId = null;
  }

  /**
   * Enter a transaction block the engine began.
   *
   * @param {?string} transactionId - The engine's transaction id.
   */
  enterTransaction(transactionId) {
    this.txState = PG_TRANSACTION_STATE.IN_TRANSACTION;
    this.transactionId = typeof transactionId === 'string' &&
      transactionId.length > 0 ? transactionId : null;
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
   * Admit a statement the client sent. Outside a failed transaction block
   * it runs as sent. A failed block admits only its end, classified by the
   * engine parser's own transaction-control rule: ROLLBACK runs as sent;
   * COMMIT ends the failed block the way PostgreSQL does, by rolling it
   * back; every other statement is refused.
   *
   * @param {string} query - Statement text the client sent.
   * @return {{state: string, statement: string}} The admission state
   *   (PGWIRE_STATEMENT_ADMISSION) and the statement to execute.
   */
  admitStatement(query) {
    if (!this.isInFailedTransaction()) {
      return {state: PGWIRE_STATEMENT_ADMISSION.ADMITTED, statement: query};
    }
    switch (classifyTransactionControlStatement(query)) {
    case AST_TYPE.ROLLBACK:
      return {state: PGWIRE_STATEMENT_ADMISSION.ADMITTED, statement: query};
    case AST_TYPE.COMMIT:
      return {
        state: PGWIRE_STATEMENT_ADMISSION.ADMITTED,
        statement: FAILED_BLOCK_END_STATEMENT,
      };
    default:
      return {
        state: PGWIRE_STATEMENT_ADMISSION.REFUSED_IN_FAILED_BLOCK,
        statement: query,
      };
    }
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
  PGWIRE_STATEMENT_ADMISSION,
  PgWireSession,
  PGWIRE_SESSION_STATE,
  PGWIRE_SESSION_ERROR,
};
