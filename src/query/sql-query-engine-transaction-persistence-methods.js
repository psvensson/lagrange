/**
 * The engine's persistence of distributed transaction state through the
 * canonical control-plane gateway (TX1 design revision 10, section 2.1; seam
 * items B/S, C, E and S4b).
 *
 * - The sql_transactions row is inserted once, with the gateway's INSERT kind
 *   and no coalescing key, before any participant work; every later write of
 *   it is an UPDATE of that row, so no pending status write can replace it.
 *   A failed insert that is not the confirmed primary-key collision of the
 *   minted identity is resolved by reading the row, never assumed.
 * - The decision is recorded once: an UPDATE of the row guarded on
 *   `decision IS NULL`. A guarded write that changes no row lost to the
 *   decision recorded first, which the coordinator then reads and follows.
 * - Each participant row retains the participant's PREPARE evidence
 *   (prepared digest, index, term) before the decision.
 * - An engine that cannot persist transaction state refuses, typed
 *   (TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE), instead of skipping the
 *   write: BEGIN fails before any participant work.
 *
 * @module query/sql-query-engine-transaction-persistence-methods
 */

import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {resolveMutationCompletionState} from
  '../control-plane/control-plane-system-table-gateway-mutation-contracts.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {TRANSACTION_ID_COLLISION_CODE} from
  './distributed/distributed-transaction-coordinator-constants.js';
import {PARTICIPANT_SET_STATE} from '../constants/index.js';
import {sqlQueryEngineTransactionSetMethods} from './sql-query-engine-transaction-set-methods.js';
import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';
import {
  INITIAL_ROW_FIELDS,
  TRANSACTION_CREATION_READ_STATE,
  hasCanonicalImmutableCreationFields,
  isCanonicalInitialRow,
  sameImmutableCreation,
} from './distributed/distributed-transaction-creation-contract.js';
import {validatePersistedTransactionRow} from
  './distributed/distributed-transaction-recovery-validation.js';
import {getRemainingBudgetMs} from '../control-plane/timeout-budget.js';

const {
  CONTROL_PLANE_MUTATION_OPERATION,
  PRESSURE_WORK_CLASS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  TABLES,
} = SQL_QUERY_ENGINE_SHARED;

const LOCAL_STR_FUNCTION = 'function';
const SQL_TRANSACTION_COALESCING_PREFIX = 'sql-transaction:';
const SQL_TRANSACTION_PARTICIPANT_COALESCING_PREFIX =
  'sql-transaction-participant:';
const SQL_WRITE_OPERATION_COALESCING_PREFIX = 'sql-write-operation:';
const SQL_TRANSACTION_ROW_READ_SQL = `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
  'WHERE transaction_id = ?';
// Identity and creation content never change after the insert. Status,
// participant-set, commit-mode, progress, decision and updated_at may all
// advance before a lost INSERT response is resolved by its authoritative
// readback, so they are deliberately excluded from this identity predicate.
function trimmedString(value) {
  return String(value || '').trim();
}

function typedPersistenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  return error;
}

function persistenceUnavailableError() {
  return typedPersistenceError(
    QUERY_ERROR_CODE.TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE,
    QUERY_ERROR_MSG.TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE,
  );
}

function creationUncertainError(message, readState) {
  const error = typedPersistenceError(
    QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN,
    message || QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN,
  );
  error.creationReadState = readState;
  return error;
}

function isPrimaryKeyCollision(result) {
  return result?.failureCode === TRANSACTION_ID_COLLISION_CODE ||
    result?.errorCode === TRANSACTION_ID_COLLISION_CODE ||
    result?.code === TRANSACTION_ID_COLLISION_CODE;
}

function sqlTransactionRowFieldsOf(record) {
  return {
    session_id: record.sessionId,
    status: record.status,
    transaction_epoch: record.transactionEpoch,
    timeout_deadline: record.timeoutDeadline,
    transaction_mode: record.transactionMode,
    participant_set_state: record.participantSetState,
    participant_set_text: record.participantSetText,
    commit_mode: record.commitMode,
    frozen_participant_count: record.frozenParticipantCount,
    updated_at: record.updatedAt,
  };
}

function rowsMatchExactly(left, right, fields) {
  return fields.every((field) => Object.is(left[field], right[field]));
}

function advancedCreationRecoveryError(stored) {
  const recoveryHold = typedPersistenceError(
    QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
    QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
  );
  recoveryHold.advancedTransactionRow = Object.freeze({...stored});
  return recoveryHold;
}

function canonicalCreationReadback(row, transactionId) {
  return row !== null &&
    INITIAL_ROW_FIELDS.every((field) => Object.hasOwn(row, field)) &&
    hasCanonicalImmutableCreationFields(row, transactionId) &&
    validatePersistedTransactionRow(row, transactionId) !== null;
}

function resolveAvailableCreationReadback(result, stored, initialRow) {
  if (sameImmutableCreation(stored, initialRow) &&
      rowsMatchExactly(stored, initialRow, INITIAL_ROW_FIELDS)) return;
  if (sameImmutableCreation(stored, initialRow)) {
    throw advancedCreationRecoveryError(stored);
  }
  if (isPrimaryKeyCollision(result)) {
    throw typedPersistenceError(TRANSACTION_ID_COLLISION_CODE,
      result?.error || QUERY_ERROR_MSG.TRANSACTION_STATE_PERSIST_FAILED);
  }
  throw creationUncertainError(
    result?.error,
    TRANSACTION_CREATION_READ_STATE.AVAILABLE,
  );
}

const sqlQueryEngineTransactionPersistenceMethods = {
  assertDistributedTransactionMutationSucceeded(result, tableName) {
    if (result?.success === true) {
      return;
    }
    const error = new Error(
      result?.error || QUERY_ERROR_MSG.TRANSACTION_STATE_PERSIST_FAILED,
    );
    error.code = isPrimaryKeyCollision(result) ?
      TRANSACTION_ID_COLLISION_CODE :
      result?.errorCode || QUERY_ERROR_CODE.TRANSACTION_STATE_PERSIST_FAILED;
    error.tableName = tableName;
    throw error;
  },

  /**
   * Persist one sql_transactions row: inserted once (options.insertOnce),
   * else updated in place.
   * @param {Object} record - Transaction persistence payload.
   * @param {Object} [options] - {insertOnce}.
   * @return {Promise<void>}
   */
  async persistDistributedTransactionRow(record, options = {}) {
    if (!this.canPersistDistributedTransactionState()) {
      throw persistenceUnavailableError();
    }
    const transactionId = trimmedString(record?.transactionId);
    if (options.insertOnce === true) {
      await this.insertDistributedTransactionRowOnce(transactionId, record);
      return;
    }
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SQL_TRANSACTIONS,
      whereClause: {transaction_id: transactionId},
      // Progress never reopens admission or overwrites immutable identity.
      data: {status: record.status, updated_at: record.updatedAt},
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTIONS,
      {
        // Durable transaction state must bypass interactive admission
        // pressure and retain critical delivery priority so recovery metadata
        // does not stall behind background control-plane backlog.
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: `${SQL_TRANSACTION_COALESCING_PREFIX}${transactionId}`,
      },
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_TRANSACTIONS,
    );
  },

  /**
   * Insert the transaction's row once. A failure that is not the confirmed
   * collision of the minted identity is resolved by reading the row back:
   * this engine's own row is the insert; another row of the same identity is
   * the collision; no readable row is a typed failure, never assumed.
   * @param {string} transactionId - The minted identity.
   * @param {Object} record - Transaction persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async insertDistributedTransactionRowOnce(transactionId, record) {
    const builtRow = {
      transaction_id: transactionId,
      ...sqlTransactionRowFieldsOf(record),
      decision: null,
      decision_text: null,
      decision_digest: null,
      created_at: record.createdAt,
    };
    const row = record.transactionCreationInitialRow || builtRow;
    if (!isCanonicalInitialRow(row) ||
        !rowsMatchExactly(row, builtRow, INITIAL_ROW_FIELDS)) {
      throw creationUncertainError(
        QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN,
        TRANSACTION_CREATION_READ_STATE.INVALID,
      );
    }
    if (getRemainingBudgetMs(record.timeoutBudget, {now: this.nowFn}) <= 0) {
      throw creationUncertainError(
        QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN,
        TRANSACTION_CREATION_READ_STATE.UNAVAILABLE,
      );
    }
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.SQL_TRANSACTIONS,
      row,
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTIONS,
      {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        idempotencyKey: record.transactionCreationDeliveryKey,
        timeoutBudget: record.timeoutBudget,
      },
    ));
    if (result?.success === true &&
        resolveMutationCompletionState(result) ===
          CONTROL_PLANE_MUTATION_OUTCOME.APPLIED) {
      return;
    }
    if (getRemainingBudgetMs(record.timeoutBudget, {now: this.nowFn}) <= 0) {
      throw creationUncertainError(result?.error,
        TRANSACTION_CREATION_READ_STATE.UNAVAILABLE);
    }
    const readback = await this.readDistributedTransactionCreationRow(
      transactionId,
      {timeoutBudget: record.timeoutBudget},
    );
    if (readback.state === TRANSACTION_CREATION_READ_STATE.AVAILABLE) {
      // A same-creation row may already have advanced under another recovery
      // worker. Only the complete immutable mismatch plus the gateway's
      // specific primary-key disposition authorizes reminting.
      resolveAvailableCreationReadback(result, readback.row, row);
      return;
    }
    throw creationUncertainError(result?.error, readback.state);
  },

  /**
   * Read and capture the exact-key creation row without collapsing absence,
   * unavailability and malformed data into one value.
   * @param {string} transactionId
   * @return {Promise<{state: string, row?: Object}>}
   * @private
   */
  async readDistributedTransactionCreationRow(transactionId, options = {}) {
    const gateway = this.getControlPlaneSystemTableGateway();
    if (typeof gateway?.readAuthoritativeRows !== LOCAL_STR_FUNCTION) {
      return {state: TRANSACTION_CREATION_READ_STATE.UNAVAILABLE};
    }
    let read;
    try {
      read = await gateway.readAuthoritativeRows(
        TABLES.SQL_TRANSACTIONS,
        SQL_TRANSACTION_ROW_READ_SQL,
        [trimmedString(transactionId)],
        {workClass: PRESSURE_WORK_CLASS.CRITICAL,
          timeoutBudget: options.timeoutBudget},
      );
    } catch (_error) {
      return {state: TRANSACTION_CREATION_READ_STATE.UNAVAILABLE};
    }
    if (read?.success !== true) {
      return {state: TRANSACTION_CREATION_READ_STATE.UNAVAILABLE};
    }
    const rows = copyDenseOwnDataRecordArray(read.rows);
    if (rows === null) {
      return {state: TRANSACTION_CREATION_READ_STATE.INVALID};
    }
    if (rows.length === 0) {
      return {state: TRANSACTION_CREATION_READ_STATE.MISSING};
    }
    if (rows.length !== 1) {
      return {state: TRANSACTION_CREATION_READ_STATE.INVALID};
    }
    const [row] = rows;
    if (!canonicalCreationReadback(row, transactionId)) {
      return {state: TRANSACTION_CREATION_READ_STATE.INVALID};
    }
    return {state: TRANSACTION_CREATION_READ_STATE.AVAILABLE,
      row: Object.freeze(row)};
  },

  /**
   * Hand an advanced same-creation readback to the existing recovery owner.
   * The BEGIN FIFO still owns this session while this method runs, so replay
   * is queued and deliberately not awaited here. It starts when BEGIN returns
   * its typed hold and releases that same FIFO lane.
   * @param {Object} row - Strict authoritative sql_transactions snapshot.
   * @return {void}
   * @private
   */
  async retainAdvancedDistributedTransactionReadback(tx, row, timeoutBudget) {
    const payload = await this.readDistributedTransactionRecoveryState(
      row.transaction_id,
      {timeoutBudget},
    );
    const accepted = this.transactionCoordinator
      .acceptAdvancedTransactionCreation(tx, row, payload);
    if (!accepted) return false;
    if (this.distributedTransactionRecoveryActivated) {
      void this.resumeRecoveredDistributedTransactions();
    }
    return true;
  },

  /**
   * Record a transaction's decision once: the UPDATE is guarded on
   * `decision IS NULL`; a guarded write that changes no row found a decision
   * already recorded (typed TRANSACTION_DECISION_RECORDED).
   * @param {Object} record - {transactionId, decision, decisionText,
   *   decisionDigest}.
   * @return {Promise<void>}
   */
  async persistDistributedTransactionDecision(record) {
    if (!this.canPersistDistributedTransactionState()) {
      throw persistenceUnavailableError();
    }
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SQL_TRANSACTIONS,
      whereClause: {
        transaction_id: trimmedString(record?.transactionId),
        session_id: record.sessionId,
        transaction_epoch: record.transactionEpoch,
        participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
        participant_set_text: record.participantSetText,
        decision: null,
      },
      data: {
        decision: record.decision,
        decision_text: record.decisionText,
        decision_digest: record.decisionDigest,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTIONS,
      {workClass: PRESSURE_WORK_CLASS.CRITICAL},
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_TRANSACTIONS,
    );
    if (resolveMutationCompletionState(result) ===
        CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED) {
      throw typedPersistenceError(
        QUERY_ERROR_CODE.TRANSACTION_DECISION_RECORDED,
        QUERY_ERROR_MSG.TRANSACTION_DECISION_RECORDED,
      );
    }
  },

  /**
   * Read one transaction's sql_transactions row through the gateway's
   * authoritative read: null when the gateway cannot read it.
   * @param {string} transactionId - The transaction.
   * @return {Promise<Object|null>} The row.
   */
  async readDistributedTransactionRow(transactionId) {
    const gateway = this.getControlPlaneSystemTableGateway();
    if (typeof gateway?.readAuthoritativeRows !== LOCAL_STR_FUNCTION) {
      return null;
    }
    const read = await gateway.readAuthoritativeRows(
      TABLES.SQL_TRANSACTIONS,
      SQL_TRANSACTION_ROW_READ_SQL,
      [trimmedString(transactionId)],
      {workClass: PRESSURE_WORK_CLASS.CRITICAL},
    );
    if (read?.success !== true || !Array.isArray(read.rows)) {
      return null;
    }
    return read.rows[0] ?? null;
  },

  /**
   * Persist one distributed transaction participant row, with the PREPARE
   * evidence the participant answered.
   * @param {Object} record - Participant persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionParticipantRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      throw persistenceUnavailableError();
    }
    const participantId = trimmedString(record?.participantId);
    const transactionId = trimmedString(record?.transactionId);
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
      row: {
        participant_id: participantId,
        transaction_id: transactionId,
        partition_id: record.partitionId,
        status: record.status,
        last_error: record.lastError,
        prepared_digest: record.preparedDigest ?? null,
        prepare_index: record.prepareIndex ?? null,
        prepare_term: record.prepareTerm ?? null,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
      {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: participantId.length > 0 ?
          `${SQL_TRANSACTION_PARTICIPANT_COALESCING_PREFIX}${participantId}` :
          null,
      },
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
    );
  },

  /**
   * Persist one distributed write operation row (bookkeeping, not decision
   * bearing: an engine that cannot persist skips it).
   * @param {Object} record - Write operation persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const operationId = trimmedString(record?.operationId);
    const transactionId = trimmedString(record?.transactionId);
    const workClass =
      typeof record?.workClass === LOCAL_STR_STRING &&
        record.workClass.length > 0 ?
        record.workClass :
        PRESSURE_WORK_CLASS.INTERACTIVE;
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_WRITE_OPERATIONS,
      row: {
        operation_id: operationId,
        transaction_id: transactionId || null,
        statement_type: record.statementType,
        status: record.status,
        idempotency_key: record.idempotencyKey,
        payload_hash: record.payloadHash,
        retry_count: record.retryCount || 0,
        last_error: record.lastError || null,
        partition_ids: JSON.stringify(record.partitionIds || []),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_WRITE_OPERATIONS,
      {
        workClass,
        coalescingKey: operationId.length > 0 ?
          `${SQL_WRITE_OPERATION_COALESCING_PREFIX}${operationId}` :
          null,
      },
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_WRITE_OPERATIONS,
    );
  },
};

function createSQLQueryEngineTransactionPersistenceMethods() {
  return Object.fromEntries(Object.entries(
    {...sqlQueryEngineTransactionPersistenceMethods,
      ...sqlQueryEngineTransactionSetMethods}).map(([name, method]) => [
    name,
    {value: method, writable: true, configurable: true, enumerable: false},
  ]));
}

export {createSQLQueryEngineTransactionPersistenceMethods};
