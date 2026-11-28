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
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_OUTCOME,
} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {
  TRANSACTION_ID_COLLISION_CODE,
  TRANSACTION_STATUS,
} from './distributed/distributed-transaction-coordinator-constants.js';
import {
  TRANSACTION_METADATA_PERSIST_PURPOSE,
  resolveNowMs,
} from './distributed/distributed-transaction-telemetry.js';
import {
  incompleteParticipantSet,
  readParticipantSet,
} from './distributed/distributed-transaction-participant-set.js';
import {PARTICIPANT_SET_STATE} from '../constants/index.js';
import {sqlQueryEngineTransactionSetMethods} from './sql-query-engine-transaction-set-methods.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const {
  CONTROL_PLANE_MUTATION_OPERATION,
  PRESSURE_WORK_CLASS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  TABLES,
} = SQL_QUERY_ENGINE_SHARED;

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const DECISION_COMMIT = 'COMMIT';
const EMPTY_PARTICIPANT_SET_TEXT = '[]';
const SQL_TRANSACTION_COALESCING_PREFIX = 'sql-transaction:';
const SQL_TRANSACTION_PARTICIPANT_COALESCING_PREFIX =
  'sql-transaction-participant:';
const SQL_WRITE_OPERATION_COALESCING_PREFIX = 'sql-write-operation:';
const TRANSIENT_PARTICIPANT_STATUSES = Object.freeze(new Set([
  'PREPARING',
  'COMMITTING',
  'ROLLING_BACK',
]));
const SQL_TRANSACTION_ROW_READ_SQL = `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} ` +
  'WHERE transaction_id = ?';
// Identity and creation content never change after the insert. Status,
// participant-set, commit-mode, progress, decision and updated_at may all
// advance before a lost INSERT response is resolved by its authoritative
// readback, so they are deliberately excluded from this identity predicate.
const INSERTED_ROW_IMMUTABLE_FIELDS = Object.freeze([
  'transaction_id',
  'session_id',
  'transaction_epoch',
  'timeout_deadline',
  'transaction_mode',
  'created_at',
]);
const INSERTED_ROW_INITIAL_FIELDS = Object.freeze([
  ...INSERTED_ROW_IMMUTABLE_FIELDS,
  'status',
  'participant_set_state',
  'participant_set_text',
  'commit_mode',
  'frozen_participant_count',
  'decision',
  'decision_text',
  'decision_digest',
  'updated_at',
]);

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

function hasSingleAffectedCount(value) {
  return Number.isSafeInteger(value) && value === 1;
}

function isCertifiedSingleRowUpdate(mutation) {
  if (mutation?.success !== true) return false;
  return (
    hasSingleAffectedCount(mutation.partitionResult?.affectedRows) ||
    hasSingleAffectedCount(mutation.affectedRows) ||
    hasSingleAffectedCount(mutation.changes)
  );
}

function matchesParticipantSetReadback(row, data) {
  return (
    row.participant_set_text === data.participant_set_text &&
    row.participant_set_state === data.participant_set_state &&
    row.commit_mode === data.commit_mode &&
    row.frozen_participant_count === data.frozen_participant_count &&
    (data.status === undefined || row.status === data.status || row.decision !== null)
  );
}

function resolveTransactionRowPersistPurpose(record, options) {
  if (options?.insertOnce === true) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.REGISTRATION;
  }
  const status = record?.status;
  if (
    status === TRANSACTION_STATUS.PREPARING ||
    status === TRANSACTION_STATUS.PREPARED
  ) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING;
  }
  if (
    status === TRANSACTION_STATUS.COMMITTING ||
    status === TRANSACTION_STATUS.ROLLING_BACK
  ) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.DECISION_AND_COMMITTING;
  }
  if (
    status === TRANSACTION_STATUS.COMMITTED ||
    status === TRANSACTION_STATUS.ROLLED_BACK
  ) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT;
  }
  return TRANSACTION_METADATA_PERSIST_PURPOSE.REGISTRATION;
}

function resolveParticipantRowPersistPurpose(record) {
  const status = record?.status;
  if (status === TRANSACTION_STATUS.PREPARED || status === TRANSACTION_STATUS.PREPARING) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING;
  }
  if (
    status === TRANSACTION_STATUS.COMMITTED ||
    status === TRANSACTION_STATUS.ROLLED_BACK
  ) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT;
  }
  return TRANSACTION_METADATA_PERSIST_PURPOSE.STATEMENT_OUTCOME;
}

function resolveDecisionProgressStatus(record) {
  if (record?.decision === DECISION_COMMIT) {
    return record?.participantSetText === EMPTY_PARTICIPANT_SET_TEXT ?
      TRANSACTION_STATUS.COMMITTED :
      TRANSACTION_STATUS.COMMITTING;
  }
  return TRANSACTION_STATUS.ROLLING_BACK;
}

function shouldIncludePreparingStatusInFreeze(record) {
  return (
    record.participantSetState === PARTICIPANT_SET_STATE.FROZEN &&
    record.status === TRANSACTION_STATUS.PREPARING &&
    record.recoveryDiscovered !== true
  );
}

function buildParticipantSetUpdateData(record) {
  const data = {
    participant_set_text: record.participantSetText,
    participant_set_state: record.participantSetState,
    commit_mode: record.commitMode,
    frozen_participant_count: record.frozenParticipantCount,
  };
  if (shouldIncludePreparingStatusInFreeze(record)) {
    data.status = TRANSACTION_STATUS.PREPARING;
    if (Number.isFinite(record.updatedAt)) {
      data.updated_at = record.updatedAt;
    }
  }
  return data;
}

function isValidParticipantSetReadbackRow(row, record, data) {
  if (!row || row.session_id !== record.sessionId ||
      row.transaction_epoch !== record.transactionEpoch) {
    return false;
  }
  if (!matchesParticipantSetReadback(row, data)) {
    return false;
  }
  return !(
    record.participantSetState === PARTICIPANT_SET_STATE.OPEN &&
    row.decision !== null
  );
}

function shouldElideTransientParticipantStatus(record) {
  return (
    TRANSIENT_PARTICIPANT_STATUSES.has(record?.status) &&
    !record?.lastError
  );
}

function participantCoalescingKeyOf(participantId) {
  return participantId.length > 0 ?
    `${SQL_TRANSACTION_PARTICIPANT_COALESCING_PREFIX}${participantId}` :
    null;
}

function buildParticipantRowPayload(participantId, transactionId, record) {
  return {
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
  };
}

function resolveWriteOperationWorkClass(record) {
  return typeof record?.workClass === LOCAL_STR_STRING &&
    record.workClass.length > 0 ?
    record.workClass :
    PRESSURE_WORK_CLASS.INTERACTIVE;
}

function buildWriteOperationRowPayload(operationId, transactionId, record) {
  return {
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
  };
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
    const purpose = resolveTransactionRowPersistPurpose(record, options);
    const startedAtMs = resolveNowMs();
    try {
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
    } finally {
      this.transactionCoordinator?.noteMetadataPersistElapsed?.(
        transactionId,
        purpose,
        Math.max(0, resolveNowMs() - startedAtMs),
      );
    }
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
    const row = {
      transaction_id: transactionId,
      ...sqlTransactionRowFieldsOf(record),
      decision: null,
      decision_text: null,
      decision_digest: null,
      created_at: record.createdAt,
    };
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.SQL_TRANSACTIONS,
      row,
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTIONS,
      {workClass: PRESSURE_WORK_CLASS.CRITICAL},
    ));
    if (result?.success === true || isPrimaryKeyCollision(result)) {
      this.assertDistributedTransactionMutationSucceeded(
        result,
        TABLES.SQL_TRANSACTIONS,
      );
      return;
    }
    const stored = copyStrictOwnDataRecord(
      await this.readDistributedTransactionRow(transactionId),
    );
    if (stored === null) {
      this.assertDistributedTransactionMutationSucceeded(
        result,
        TABLES.SQL_TRANSACTIONS,
      );
      return;
    }
    const sameCreation = INSERTED_ROW_IMMUTABLE_FIELDS.every((field) =>
      Object.hasOwn(stored, field) && Object.is(stored[field], row[field]));
    if (!sameCreation) {
      throw typedPersistenceError(TRANSACTION_ID_COLLISION_CODE,
        result?.error || QUERY_ERROR_MSG.TRANSACTION_STATE_PERSIST_FAILED);
    }
    const stillInitial = INSERTED_ROW_INITIAL_FIELDS.every((field) =>
      Object.hasOwn(stored, field) && Object.is(stored[field], row[field]));
    if (!stillInitial) {
      // The insert belongs to this exact creation, but another recovery
      // worker has already advanced its durable authority. Do not install the
      // stale ACTIVE candidate and do not classify this as an ID collision
      // (which would mint a replacement). The normal recovery owner will
      // reread and resume the advanced row.
      const recoveryHold = typedPersistenceError(
        QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
        QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
      );
      recoveryHold.advancedTransactionRow = Object.freeze({...stored});
      throw recoveryHold;
    }
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
  retainAdvancedDistributedTransactionReadback(row) {
    this.transactionCoordinator.recoverFromSystemTables({
      transactions: [row],
      participants: [],
      writeOperations: [],
    });
    if (this.distributedTransactionRecoveryActivated) {
      void this.resumeRecoveredDistributedTransactions();
    }
  },

  /**
   * Record a transaction's decision once and advance its progress status
   * (`COMMITTED` for zero-participant `COMMIT`, `COMMITTING` for non-empty
   * `COMMIT`, `ROLLING_BACK` for `ROLLBACK`) atomically:
   * the UPDATE is guarded on `decision IS NULL`; a guarded write that changes
   * no row found a decision already recorded (typed
   * TRANSACTION_DECISION_RECORDED).
   * @param {Object} record - {transactionId, decision, decisionText,
   *   decisionDigest}.
   * @return {Promise<void>}
   */
  async persistDistributedTransactionDecision(record) {
    if (!this.canPersistDistributedTransactionState()) {
      throw persistenceUnavailableError();
    }
    const progressStatus = resolveDecisionProgressStatus(record);
    const data = {
      decision: record.decision,
      decision_text: record.decisionText,
      decision_digest: record.decisionDigest,
      status: progressStatus,
      ...(Number.isFinite(record?.updatedAt) ? {updated_at: record.updatedAt} : {}),
    };
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
      data,
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
   * Persist admitted participant set or atomic manifest freeze (+ PREPARING
   * transition when transitioning an ACTIVE transaction into prepare).
   * @param {Object} record - Transaction state with intended participant set / freeze fields.
   * @param {string} previousText - Prior participant_set_text CAS guard.
   * @return {Promise<void>}
   */
  async persistDistributedTransactionParticipantSet(record, previousText) {
    const pairs = readParticipantSet(record.transactionId, record.participantSetText);
    if (!pairs || !readParticipantSet(record.transactionId, previousText)) {
      throw incompleteParticipantSet();
    }
    const expected = {
      transaction_id: record.transactionId,
      session_id: record.sessionId,
      transaction_epoch: record.transactionEpoch,
      participant_set_state: PARTICIPANT_SET_STATE.OPEN,
      participant_set_text: previousText,
      decision: null,
    };
    const data = buildParticipantSetUpdateData(record);
    let mutation;
    try {
      mutation = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SQL_TRANSACTIONS,
        whereClause: expected,
        data,
      }, this.buildDistributedTransactionMutationOptions(
        TABLES.SQL_TRANSACTIONS,
        {workClass: PRESSURE_WORK_CLASS.CRITICAL},
      ));
    } catch (error) {
      mutation = {success: false, error: error?.message};
    }
    if (isCertifiedSingleRowUpdate(mutation)) {
      return;
    }
    const row = await this.readDistributedTransactionRow(record.transactionId);
    if (!isValidParticipantSetReadbackRow(row, record, data)) {
      this.assertDistributedTransactionMutationSucceeded(mutation, TABLES.SQL_TRANSACTIONS);
      throw incompleteParticipantSet();
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
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE
            .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      },
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
    const transactionId = trimmedString(record?.transactionId);
    if (shouldElideTransientParticipantStatus(record)) {
      this.transactionCoordinator?.noteElidedMetadataMutation?.(transactionId);
      return;
    }
    const participantId = trimmedString(record?.participantId);
    const purpose = resolveParticipantRowPersistPurpose(record);
    const coalescingKey = participantCoalescingKeyOf(participantId);
    const startedAtMs = resolveNowMs();
    try {
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
        row: buildParticipantRowPayload(participantId, transactionId, record),
      }, this.buildDistributedTransactionMutationOptions(
        TABLES.SQL_TRANSACTION_PARTICIPANTS,
        {workClass: PRESSURE_WORK_CLASS.CRITICAL, coalescingKey},
      ));
      this.assertDistributedTransactionMutationSucceeded(
        result,
        TABLES.SQL_TRANSACTION_PARTICIPANTS,
      );
    } finally {
      this.transactionCoordinator?.noteMetadataPersistElapsed?.(
        transactionId,
        purpose,
        Math.max(0, resolveNowMs() - startedAtMs),
      );
    }
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
    const workClass = resolveWriteOperationWorkClass(record);
    const coalescingKey = operationId.length > 0 ?
      `${SQL_WRITE_OPERATION_COALESCING_PREFIX}${operationId}` :
      null;
    const startedAtMs = resolveNowMs();
    try {
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SQL_WRITE_OPERATIONS,
        row: buildWriteOperationRowPayload(operationId, transactionId, record),
      }, this.buildDistributedTransactionMutationOptions(
        TABLES.SQL_WRITE_OPERATIONS,
        {workClass, coalescingKey},
      ));
      this.assertDistributedTransactionMutationSucceeded(
        result,
        TABLES.SQL_WRITE_OPERATIONS,
      );
    } finally {
      this.transactionCoordinator?.noteMetadataPersistElapsed?.(
        transactionId,
        TRANSACTION_METADATA_PERSIST_PURPOSE.STATEMENT_OUTCOME,
        Math.max(0, resolveNowMs() - startedAtMs),
      );
    }
  },

  /**
   * Persist a bounded batch of distributed write operation rows for one
   * transaction in a single UPSERT_BATCH mutation.
   * @param {Object[]} records - Write operation persistence payloads.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRowsBatch(records) {
    if (!this.canPersistDistributedTransactionState() ||
        !Array.isArray(records) ||
        records.length === 0) {
      return;
    }
    if (records.length === 1) {
      await this.persistDistributedWriteOperationRow(records[0]);
      return;
    }
    const transactionId = trimmedString(records[0]?.transactionId);
    const workClass = resolveWriteOperationWorkClass(records[0]);
    const rows = records.map((record) =>
      buildWriteOperationRowPayload(
        trimmedString(record?.operationId),
        trimmedString(record?.transactionId) || transactionId,
        record,
      ));
    const coalescingKey = transactionId.length > 0 ?
      `${SQL_WRITE_OPERATION_COALESCING_PREFIX}${transactionId}` :
      null;
    const startedAtMs = resolveNowMs();
    try {
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT_BATCH,
        tableName: TABLES.SQL_WRITE_OPERATIONS,
        rows,
      }, this.buildDistributedTransactionMutationOptions(
        TABLES.SQL_WRITE_OPERATIONS,
        {workClass, coalescingKey},
      ));
      this.assertDistributedTransactionMutationSucceeded(
        result,
        TABLES.SQL_WRITE_OPERATIONS,
      );
    } finally {
      this.transactionCoordinator?.noteMetadataPersistElapsed?.(
        transactionId,
        TRANSACTION_METADATA_PERSIST_PURPOSE.STATEMENT_OUTCOME,
        Math.max(0, resolveNowMs() - startedAtMs),
      );
    }
  },
};

const METHOD_BAG_CONSTRUCTOR_KEY = 'constructor';
const DEFAULT_METHOD_BAG_OWNER_NAME = 'SQLQueryEngine';
const PERSISTENCE_METHODS_OWNER_NAME =
  'SQLQueryEngineTransactionPersistenceMethods';

/**
 * Compose an ordered list of method or property-descriptor bags while
 * enforcing that their own property names are pairwise disjoint.
 *
 * @param {Array<Object>} bags - Method or descriptor bags to compose.
 * @param {string} [ownerName] - Human-readable owner name for error messages.
 * @return {Object} Composed own-property record.
 * @throws {Error} When any property name appears in more than one bag.
 */
function composeDisjointMethodBags(
  bags,
  ownerName = DEFAULT_METHOD_BAG_OWNER_NAME,
) {
  if (!Array.isArray(bags)) {
    throw new TypeError(
      `Expected method bag array for ${ownerName} composition`,
    );
  }
  const seenKeys = new Set();
  const composed = {};
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') {
      continue;
    }
    const ownKeys = Object.getOwnPropertyNames(bag).filter(
      (key) => key !== METHOD_BAG_CONSTRUCTOR_KEY,
    );
    for (const key of ownKeys) {
      if (seenKeys.has(key)) {
        throw new Error(
          `Duplicate method "${key}" in ${ownerName} composition`,
        );
      }
      seenKeys.add(key);
      composed[key] = bag[key];
    }
  }
  return composed;
}

function createSQLQueryEngineTransactionPersistenceMethods() {
  const composedMethods = composeDisjointMethodBags(
    [
      sqlQueryEngineTransactionSetMethods,
      sqlQueryEngineTransactionPersistenceMethods,
    ],
    PERSISTENCE_METHODS_OWNER_NAME,
  );
  return Object.fromEntries(
    Object.entries(composedMethods).map(([name, method]) => [
      name,
      {value: method, writable: true, configurable: true, enumerable: false},
    ]),
  );
}

export {
  composeDisjointMethodBags,
  createSQLQueryEngineTransactionPersistenceMethods,
};
