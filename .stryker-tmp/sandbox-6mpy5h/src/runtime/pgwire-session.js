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
import { PG_TRANSACTION_STATE } from './pgwire-protocol-constants.js';

// --- Session state constants ---

const PGWIRE_SESSION_STATE = Object.freeze(stryMutAct_9fa48("148484") ? {} : (stryCov_9fa48("148484"), {
  CREATED: stryMutAct_9fa48("148485") ? "" : (stryCov_9fa48("148485"), 'created'),
  AUTHENTICATED: stryMutAct_9fa48("148486") ? "" : (stryCov_9fa48("148486"), 'authenticated'),
  READY: stryMutAct_9fa48("148487") ? "" : (stryCov_9fa48("148487"), 'ready'),
  CLOSED: stryMutAct_9fa48("148488") ? "" : (stryCov_9fa48("148488"), 'closed')
}));

// --- Session error messages ---

const PGWIRE_SESSION_ERROR = Object.freeze(stryMutAct_9fa48("148489") ? {} : (stryCov_9fa48("148489"), {
  SESSION_ID_REQUIRED: stryMutAct_9fa48("148490") ? "" : (stryCov_9fa48("148490"), 'sessionId is required'),
  SESSION_CLOSED: stryMutAct_9fa48("148491") ? "" : (stryCov_9fa48("148491"), 'Session is closed'),
  STATEMENT_NAME_REQUIRED: stryMutAct_9fa48("148492") ? "" : (stryCov_9fa48("148492"), 'Statement name is required'),
  PORTAL_NAME_REQUIRED: stryMutAct_9fa48("148493") ? "" : (stryCov_9fa48("148493"), 'Portal name is required'),
  STATEMENT_NOT_FOUND: stryMutAct_9fa48("148494") ? "" : (stryCov_9fa48("148494"), 'Prepared statement not found')
}));

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
    if (stryMutAct_9fa48("148495")) {
      {}
    } else {
      stryCov_9fa48("148495");
      if (stryMutAct_9fa48("148498") ? !options && !options.sessionId : stryMutAct_9fa48("148497") ? false : stryMutAct_9fa48("148496") ? true : (stryCov_9fa48("148496", "148497", "148498"), (stryMutAct_9fa48("148499") ? options : (stryCov_9fa48("148499"), !options)) || (stryMutAct_9fa48("148500") ? options.sessionId : (stryCov_9fa48("148500"), !options.sessionId)))) {
        if (stryMutAct_9fa48("148501")) {
          {}
        } else {
          stryCov_9fa48("148501");
          throw new Error(PGWIRE_SESSION_ERROR.SESSION_ID_REQUIRED);
        }
      }
      this.sessionId = options.sessionId;
      this.tenantId = stryMutAct_9fa48("148504") ? options.tenantId && null : stryMutAct_9fa48("148503") ? false : stryMutAct_9fa48("148502") ? true : (stryCov_9fa48("148502", "148503", "148504"), options.tenantId || null);
      this.user = stryMutAct_9fa48("148507") ? options.user && null : stryMutAct_9fa48("148506") ? false : stryMutAct_9fa48("148505") ? true : (stryCov_9fa48("148505", "148506", "148507"), options.user || null);
      this.database = stryMutAct_9fa48("148510") ? options.database && null : stryMutAct_9fa48("148509") ? false : stryMutAct_9fa48("148508") ? true : (stryCov_9fa48("148508", "148509", "148510"), options.database || null);
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
  }

  /**
   * Mark session as authenticated.
   */
  markAuthenticated() {
    if (stryMutAct_9fa48("148511")) {
      {}
    } else {
      stryCov_9fa48("148511");
      this.state = PGWIRE_SESSION_STATE.AUTHENTICATED;
    }
  }

  /**
   * Mark session as ready for queries.
   */
  markReady() {
    if (stryMutAct_9fa48("148512")) {
      {}
    } else {
      stryCov_9fa48("148512");
      this.state = PGWIRE_SESSION_STATE.READY;
    }
  }

  /**
   * Close the session and release all state.
   */
  close() {
    if (stryMutAct_9fa48("148513")) {
      {}
    } else {
      stryCov_9fa48("148513");
      this.state = PGWIRE_SESSION_STATE.CLOSED;
      this._statements.clear();
      this._portals.clear();
    }
  }

  /**
   * Store a prepared statement.
   *
   * @param {string} name - Statement name ('' for unnamed).
   * @param {string} query - SQL query text.
   * @param {number[]} [paramTypes] - Parameter type OIDs.
   */
  setPreparedStatement(name, query, paramTypes = stryMutAct_9fa48("148514") ? ["Stryker was here"] : (stryCov_9fa48("148514"), [])) {
    if (stryMutAct_9fa48("148515")) {
      {}
    } else {
      stryCov_9fa48("148515");
      this._statements.set(name, stryMutAct_9fa48("148516") ? {} : (stryCov_9fa48("148516"), {
        query,
        paramTypes
      }));
      // Close any existing portal with the same name
      // per PG protocol semantics
      this._portals.delete(name);
    }
  }

  /**
   * Get a prepared statement by name.
   *
   * @param {string} name - Statement name.
   * @return {Object|null} Statement or null.
   */
  getPreparedStatement(name) {
    if (stryMutAct_9fa48("148517")) {
      {}
    } else {
      stryCov_9fa48("148517");
      return stryMutAct_9fa48("148520") ? this._statements.get(name) && null : stryMutAct_9fa48("148519") ? false : stryMutAct_9fa48("148518") ? true : (stryCov_9fa48("148518", "148519", "148520"), this._statements.get(name) || null);
    }
  }

  /**
   * Check if a prepared statement exists.
   *
   * @param {string} name - Statement name.
   * @return {boolean}
   */
  hasPreparedStatement(name) {
    if (stryMutAct_9fa48("148521")) {
      {}
    } else {
      stryCov_9fa48("148521");
      return this._statements.has(name);
    }
  }

  /**
   * Remove a prepared statement and its associated portal.
   *
   * @param {string} name - Statement name.
   */
  closePreparedStatement(name) {
    if (stryMutAct_9fa48("148522")) {
      {}
    } else {
      stryCov_9fa48("148522");
      this._statements.delete(name);
      this._portals.delete(name);
    }
  }

  /**
   * Store a portal (bound statement with parameters).
   *
   * @param {string} portalName - Portal name ('' for unnamed).
   * @param {string} statementName - Source prepared statement name.
   * @param {unknown[]} params - Bound parameter values.
   */
  setPortal(portalName, statementName, params) {
    if (stryMutAct_9fa48("148523")) {
      {}
    } else {
      stryCov_9fa48("148523");
      this._portals.set(portalName, stryMutAct_9fa48("148524") ? {} : (stryCov_9fa48("148524"), {
        statementName,
        params
      }));
    }
  }

  /**
   * Get a portal by name.
   *
   * @param {string} name - Portal name.
   * @return {Object|null} Portal or null.
   */
  getPortal(name) {
    if (stryMutAct_9fa48("148525")) {
      {}
    } else {
      stryCov_9fa48("148525");
      return stryMutAct_9fa48("148528") ? this._portals.get(name) && null : stryMutAct_9fa48("148527") ? false : stryMutAct_9fa48("148526") ? true : (stryCov_9fa48("148526", "148527", "148528"), this._portals.get(name) || null);
    }
  }

  /**
   * Remove a portal.
   *
   * @param {string} name - Portal name.
   */
  closePortal(name) {
    if (stryMutAct_9fa48("148529")) {
      {}
    } else {
      stryCov_9fa48("148529");
      this._portals.delete(name);
    }
  }

  /**
   * Get current transaction state byte for ReadyForQuery.
   *
   * @return {number} Transaction state byte.
   */
  getTransactionState() {
    if (stryMutAct_9fa48("148530")) {
      {}
    } else {
      stryCov_9fa48("148530");
      return this.txState;
    }
  }

  /**
   * Set transaction state.
   *
   * @param {number} state - PG_TRANSACTION_STATE value.
   */
  setTransactionState(state) {
    if (stryMutAct_9fa48("148531")) {
      {}
    } else {
      stryCov_9fa48("148531");
      this.txState = state;
    }
  }

  /**
   * Check if session is in a failed transaction block.
   *
   * @return {boolean}
   */
  isInFailedTransaction() {
    if (stryMutAct_9fa48("148532")) {
      {}
    } else {
      stryCov_9fa48("148532");
      return stryMutAct_9fa48("148535") ? this.txState !== PG_TRANSACTION_STATE.FAILED : stryMutAct_9fa48("148534") ? false : stryMutAct_9fa48("148533") ? true : (stryCov_9fa48("148533", "148534", "148535"), this.txState === PG_TRANSACTION_STATE.FAILED);
    }
  }

  /**
   * Check if session is closed.
   *
   * @return {boolean}
   */
  isClosed() {
    if (stryMutAct_9fa48("148536")) {
      {}
    } else {
      stryCov_9fa48("148536");
      return stryMutAct_9fa48("148539") ? this.state !== PGWIRE_SESSION_STATE.CLOSED : stryMutAct_9fa48("148538") ? false : stryMutAct_9fa48("148537") ? true : (stryCov_9fa48("148537", "148538", "148539"), this.state === PGWIRE_SESSION_STATE.CLOSED);
    }
  }
}
export { PgWireSession, PGWIRE_SESSION_STATE, PGWIRE_SESSION_ERROR };