import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  DEFAULT_TRANSACTION_SESSION_ID,
  PARTITION_SERVICE_ERROR_MSG,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceTransactionSessionMethods {
  /**
   * Resolve the canonical transaction session ID.
   * @param {string|null} sessionId - Requested session ID.
   * @return {string} Canonical session ID.
   * @private
   */
  normalizeTransactionSessionId(sessionId) {
    return typeof sessionId === 'string' && sessionId.length > 0 ?
      sessionId :
      DEFAULT_TRANSACTION_SESSION_ID;
  }
  /**
   * Resolve one active session ID for transaction operations.
   * @param {string|null} sessionId - Requested session ID.
   * @return {string|null} Active session ID or null.
   * @private
   */
  resolveActiveTransactionSessionId(sessionId) {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      return sessionId;
    }
    // Sessionless resolution stops at the explicit DEFAULT session. The old
    // single-foreign-session adoption arm silently absorbed unrelated writes
    // into whatever transaction happened to be open — run-23's zombie
    // participant BEGIN swallowed every later ledger write that way, making
    // the whole partition non-durable with zero errors. A sessionless write
    // with only a foreign session open now takes the ordinary proposeWrite
    // path instead.
    if (this.activeTransactions.has(DEFAULT_TRANSACTION_SESSION_ID)) {
      return DEFAULT_TRANSACTION_SESSION_ID;
    }
    return null;
  }
  /**
   * Synchronize legacy transaction aliases for compatibility.
   * @private
   */
  syncLegacyTransactionAliases() {
    const defaultState = this.activeTransactions.get(
      DEFAULT_TRANSACTION_SESSION_ID,
    );
    const fallbackState =
      this.activeTransactions.size === 1 ?
        this.activeTransactions.values().next().value :
        null;
    const defaultPreparedState = this.preparedTransactions.get(
      DEFAULT_TRANSACTION_SESSION_ID,
    );
    const fallbackPreparedState =
      this.preparedTransactions.size === 1 ?
        this.preparedTransactions.values().next().value :
        null;
    const activeState =
      defaultState ||
      fallbackState ||
      defaultPreparedState ||
      fallbackPreparedState ||
      null;
    this.activeTransaction = activeState;
    this.transactionOperations = activeState?.operations || [];
  }
  /**
   * Resolve one transaction state by session.
   * @param {string|null} sessionId - Requested session ID.
   * @return {{sessionId: string, state: Object}|null} Resolved state.
   * @private
   */
  resolveActiveTransactionState(sessionId = null) {
    const resolvedSessionId = this.resolveActiveTransactionSessionId(sessionId);
    if (!resolvedSessionId) {
      return null;
    }
    const state = this.activeTransactions.get(resolvedSessionId) || null;
    if (!state) {
      return null;
    }
    return {sessionId: resolvedSessionId, state};
  }
  /**
   * Resolve one prepared session ID for transaction operations.
   * @param {string|null} sessionId - Requested session ID.
   * @return {string|null} Prepared session ID or null.
   * @private
   */
  resolvePreparedTransactionSessionId(sessionId) {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      return sessionId;
    }
    // Mirrors resolveActiveTransactionSessionId: no silent adoption of a
    // single foreign prepared session.
    if (this.preparedTransactions.has(DEFAULT_TRANSACTION_SESSION_ID)) {
      return DEFAULT_TRANSACTION_SESSION_ID;
    }
    return null;
  }
  /**
   * Resolve one prepared transaction state by session.
   * @param {string|null} sessionId - Requested session ID.
   * @return {{sessionId: string, state: Object}|null} Resolved state.
   * @private
   */
  resolvePreparedTransactionState(sessionId = null) {
    const resolvedSessionId =
      this.resolvePreparedTransactionSessionId(sessionId);
    if (!resolvedSessionId) {
      return null;
    }
    const state = this.preparedTransactions.get(resolvedSessionId) || null;
    if (!state) {
      return null;
    }
    return {sessionId: resolvedSessionId, state};
  }
  /**
   * Resolve one open transaction state by session across active and prepared
   * phases.
   * @param {string|null} sessionId - Requested session ID.
   * @return {{sessionId: string, state: Object}|null} Resolved state.
   * @private
   */
  resolveOpenTransactionState(sessionId = null) {
    return (
      this.resolveActiveTransactionState(sessionId) ||
      this.resolvePreparedTransactionState(sessionId)
    );
  }
  /**
   * Build one prepare-lost response payload.
   * @param {string} operation - Transaction operation.
   * @param {string|null} sessionId - Session ID.
   * @return {Object} Prepare-lost response payload.
   * @private
   */
  buildPrepareLostResponse(operation, sessionId = null) {
    return {
      success: false,
      operation,
      partitionId: this.partitionId,
      sessionId: this.normalizeTransactionSessionId(sessionId),
      error: PARTITION_SERVICE_ERROR_MSG.PREPARE_LOST,
    };
  }
}

function createPartitionServiceTransactionSessionMethods() {
  const methods = {};
  for (
    const name of Object.getOwnPropertyNames(
      PartitionServiceTransactionSessionMethods.prototype,
    )
  ) {
    if (name !== 'constructor') {
      methods[name] =
        PartitionServiceTransactionSessionMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceTransactionSessionMethods};
