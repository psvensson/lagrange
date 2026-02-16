import {createHash} from 'node:crypto';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from './query-constants.js';

const TRANSACTION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  PREPARING: 'PREPARING',
  PREPARED: 'PREPARED',
  COMMITTING: 'COMMITTING',
  COMMITTED: 'COMMITTED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
});

const PARTICIPANT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  PREPARING: 'PREPARING',
  PREPARED: 'PREPARED',
  COMMITTING: 'COMMITTING',
  COMMITTED: 'COMMITTED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
});

const WRITE_OPERATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
});

const TERMINAL_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.COMMITTED,
  TRANSACTION_STATUS.ROLLED_BACK,
]));

/**
 * Distributed transaction coordinator with participant state persistence hooks.
 */
class DistributedTransactionCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Function} options.beginParticipant - Begin callback.
   * @param {Function} [options.prepareParticipant] - Prepare callback.
   * @param {Function} options.commitParticipant - Commit callback.
   * @param {Function} options.rollbackParticipant - Rollback callback.
   * @param {Function} [options.persistTransaction] - Persist tx row callback.
   * @param {Function} [options.persistParticipant] - Persist participant callback.
   * @param {Function} [options.persistWriteOperation] - Persist write op callback.
   * @param {Function} [options.now] - Clock function.
   */
  constructor(options = {}) {
    this.beginParticipant = options.beginParticipant || (async () => {});
    this.prepareParticipant = options.prepareParticipant || (async () => {});
    this.commitParticipant = options.commitParticipant || (async () => {});
    this.rollbackParticipant = options.rollbackParticipant || (async () => {});
    this.persistTransaction = options.persistTransaction || (async () => {});
    this.persistParticipant = options.persistParticipant || (async () => {});
    this.persistWriteOperation = options.persistWriteOperation || (async () => {});
    this.now = options.now || (() => Date.now());
    this.transactionsBySession = new Map();
  }

  /**
   * Begin a distributed transaction for a session.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Transaction begin result.
   */
  async begin(sessionId) {
    if (this.transactionsBySession.has(sessionId)) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.TRANSACTION_ACTIVE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_ACTIVE,
      };
    }

    const now = this.now();
    const tx = {
      sessionId,
      transactionId: this.createTransactionId(sessionId),
      status: TRANSACTION_STATUS.ACTIVE,
      participants: new Map(),
      writeOperations: [],
      createdAt: now,
      updatedAt: now,
    };
    this.transactionsBySession.set(sessionId, tx);
    await this.persistTransactionRecord(tx);

    return {
      success: true,
      operation: QUERY_OPERATION.BEGIN_TRANSACTION,
      sessionId,
      transactionId: tx.transactionId,
    };
  }

  /**
   * Enlist partition participants and begin transaction on new participants.
   * @param {string} sessionId - Session ID.
   * @param {string[]} partitionIds - Target partition IDs.
   * @return {Promise<Object>} Enlistment result.
   */
  async enlistParticipants(sessionId, partitionIds) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    const uniquePartitionIds = Array.from(new Set(partitionIds || []));
    const newlyEnlisted = [];
    for (const partitionId of uniquePartitionIds) {
      if (tx.participants.has(partitionId)) {
        continue;
      }
      await this.beginParticipant(sessionId, partitionId);
      const now = this.now();
      tx.participants.set(partitionId, {
        participantId: this.createParticipantId(tx.transactionId, partitionId),
        partitionId,
        status: PARTICIPANT_STATUS.ACTIVE,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
      newlyEnlisted.push(partitionId);
    }

    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
    await this.persistParticipants(tx, newlyEnlisted);

    return {
      success: true,
      participants: this.getOrderedParticipantIds(tx),
      newlyEnlisted,
    };
  }

  /**
   * Record distributed write operation metadata under a transaction.
   * @param {string} sessionId - Session ID.
   * @param {Object} operation - Operation metadata.
   * @return {Promise<void>}
   */
  async recordWriteOperation(sessionId, operation) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return;
    }

    const now = this.now();
    const normalized = {
      operationId: operation.operationId,
      statementType: operation.statementType || QUERY_OPERATION.UPDATE,
      partitionIds: Array.isArray(operation.partitionIds) ?
        [...operation.partitionIds] :
        [],
      idempotencyKey: operation.idempotencyKey || operation.operationId,
      payloadHash: operation.payloadHash || this.createWritePayloadHash(operation),
      status: WRITE_OPERATION_STATUS.PENDING,
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.writeOperations.push(normalized);
    tx.updatedAt = now;

    await this.persistTransactionRecord(tx);
    await this.persistWriteOperationRecord(tx, normalized);
  }

  /**
   * Mark one recorded write operation with execution outcome.
   * @param {string} sessionId - Session ID.
   * @param {string} operationId - Operation identifier.
   * @param {Object} result - Aggregated write result.
   * @return {Promise<void>}
   */
  async markWriteOperationResult(sessionId, operationId, result) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return;
    }

    const operation = tx.writeOperations.find((entry) =>
      entry.operationId === operationId);
    if (!operation) {
      return;
    }

    operation.status = result?.success === true ?
      WRITE_OPERATION_STATUS.SUCCEEDED :
      WRITE_OPERATION_STATUS.FAILED;
    operation.retryCount = Number.isInteger(result?.retryCount) ?
      result.retryCount :
      0;
    operation.lastError = result?.success === true ?
      null :
      result?.error || QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE;
    operation.updatedAt = this.now();
    tx.updatedAt = operation.updatedAt;

    await this.persistTransactionRecord(tx);
    await this.persistWriteOperationRecord(tx, operation);
  }

  /**
   * Commit a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   */
  async commit(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    tx.status = TRANSACTION_STATUS.PREPARING;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);

    const prepareFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.PREPARING,
      PARTICIPANT_STATUS.PREPARED,
      (partitionId) => this.prepareParticipant(sessionId, partitionId),
    );
    if (prepareFailures.length > 0) {
      tx.status = TRANSACTION_STATUS.FAILED;
      tx.updatedAt = this.now();
      await this.persistTransactionRecord(tx);
      return {
        success: false,
        operation: QUERY_OPERATION.COMMIT,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants: prepareFailures,
        stage: TRANSACTION_STATUS.PREPARING,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
      };
    }

    tx.status = TRANSACTION_STATUS.PREPARED;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);

    tx.status = TRANSACTION_STATUS.COMMITTING;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);

    const commitFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.COMMITTING,
      PARTICIPANT_STATUS.COMMITTED,
      (partitionId) => this.commitParticipant(sessionId, partitionId),
    );
    if (commitFailures.length > 0) {
      tx.status = TRANSACTION_STATUS.FAILED;
      tx.updatedAt = this.now();
      await this.persistTransactionRecord(tx);
      return {
        success: false,
        operation: QUERY_OPERATION.COMMIT,
        transactionId: tx.transactionId,
        participants: this.getOrderedParticipantIds(tx),
        failedParticipants: commitFailures,
        stage: TRANSACTION_STATUS.COMMITTING,
        errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
      };
    }

    tx.status = TRANSACTION_STATUS.COMMITTED;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
    this.transactionsBySession.delete(sessionId);

    return {
      success: true,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
    };
  }

  /**
   * Roll back a distributed transaction across all enlisted participants.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   */
  async rollback(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {
        success: false,
        error: QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION,
      };
    }

    tx.status = TRANSACTION_STATUS.ROLLING_BACK;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);

    const rollbackFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.ROLLING_BACK,
      PARTICIPANT_STATUS.ROLLED_BACK,
      (partitionId) => this.rollbackParticipant(sessionId, partitionId),
    );

    tx.status = rollbackFailures.length > 0 ?
      TRANSACTION_STATUS.FAILED :
      TRANSACTION_STATUS.ROLLED_BACK;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
    this.transactionsBySession.delete(sessionId);

    return {
      success: rollbackFailures.length === 0,
      operation: QUERY_OPERATION.ROLLBACK,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants: rollbackFailures,
      errorCode: rollbackFailures.length > 0 ?
        QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE :
        undefined,
      error: rollbackFailures.length > 0 ?
        QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE :
        undefined,
    };
  }

  /**
   * Return transaction metadata for one session.
   * @param {string} sessionId - Session ID.
   * @return {Object|null} Transaction metadata.
   */
  getTransaction(sessionId) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return null;
    }
    return {
      sessionId: tx.sessionId,
      transactionId: tx.transactionId,
      status: tx.status,
      participants: this.getOrderedParticipantIds(tx),
      participantDetails: this.getOrderedParticipantDetails(tx),
      writeOperations: tx.writeOperations.map((operation) => ({...operation})),
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} Active transaction state.
   */
  hasActiveTransaction(sessionId) {
    return this.transactionsBySession.has(sessionId);
  }

  /**
   * Recover in-flight transactions after restart.
   * Supports the old recover(rows) shape for backward compatibility.
   *
   * @param {Object[]|Object} rows - Serialized recovery payload.
   */
  recover(rows) {
    if (!Array.isArray(rows)) {
      return;
    }

    const transactions = [];
    const participants = [];
    const writeOperations = [];

    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      if (row.sessionId && Array.isArray(row.participants)) {
        transactions.push({
          session_id: row.sessionId,
          transaction_id: row.transactionId,
          status: row.status,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        });
        for (const partitionId of row.participants) {
          participants.push({
            participant_id:
              this.createParticipantId(row.transactionId, partitionId),
            transaction_id: row.transactionId,
            partition_id: partitionId,
            status: PARTICIPANT_STATUS.PREPARED,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
          });
        }
        for (const operation of row.writeOperations || []) {
          writeOperations.push({
            operation_id: operation.operationId,
            transaction_id: row.transactionId,
            statement_type: operation.statementType || QUERY_OPERATION.UPDATE,
            status: WRITE_OPERATION_STATUS.PENDING,
            idempotency_key: operation.idempotencyKey || operation.operationId,
            payload_hash: operation.payloadHash ||
              this.createWritePayloadHash(operation),
            retry_count: operation.retryCount || 0,
            last_error: operation.lastError || null,
            created_at: operation.createdAt || row.createdAt,
            updated_at: operation.updatedAt || row.updatedAt,
          });
        }
      } else {
        transactions.push(row);
      }
    }

    this.recoverFromSystemTables({
      transactions,
      participants,
      writeOperations,
    });
  }

  /**
   * Recover coordinator state from canonical system-table rows.
   *
   * @param {Object} payload - Recovery payload.
   * @param {Object[]} [payload.transactions] - sql_transactions rows.
   * @param {Object[]} [payload.participants] - sql_transaction_participants rows.
   * @param {Object[]} [payload.writeOperations] - sql_write_operations rows.
   */
  recoverFromSystemTables(payload = {}) {
    const transactionRows = Array.isArray(payload.transactions) ?
      payload.transactions :
      [];
    const participantRows = Array.isArray(payload.participants) ?
      payload.participants :
      [];
    const writeOperationRows = Array.isArray(payload.writeOperations) ?
      payload.writeOperations :
      [];

    const transactionById = new Map();
    for (const row of transactionRows) {
      const sessionId = row.session_id || row.sessionId;
      const transactionId = row.transaction_id || row.transactionId;
      const status = row.status || TRANSACTION_STATUS.FAILED;
      if (!sessionId || !transactionId) {
        continue;
      }
      if (TERMINAL_TRANSACTION_STATUS.has(status)) {
        continue;
      }
      const tx = {
        sessionId,
        transactionId,
        status,
        participants: new Map(),
        writeOperations: [],
        createdAt: row.created_at || row.createdAt || this.now(),
        updatedAt: row.updated_at || row.updatedAt || this.now(),
      };
      transactionById.set(transactionId, tx);
      this.transactionsBySession.set(sessionId, tx);
    }

    for (const row of participantRows) {
      const transactionId = row.transaction_id || row.transactionId;
      const partitionId = row.partition_id || row.partitionId;
      if (!transactionId || !partitionId) {
        continue;
      }
      const tx = transactionById.get(transactionId);
      if (!tx) {
        continue;
      }
      const participantId = row.participant_id ||
        row.participantId ||
        this.createParticipantId(transactionId, partitionId);
      tx.participants.set(partitionId, {
        participantId,
        partitionId,
        status: row.status || PARTICIPANT_STATUS.FAILED,
        lastError: row.last_error || row.lastError || null,
        createdAt: row.created_at || row.createdAt || tx.createdAt,
        updatedAt: row.updated_at || row.updatedAt || tx.updatedAt,
      });
    }

    for (const row of writeOperationRows) {
      const transactionId = row.transaction_id || row.transactionId;
      if (!transactionId) {
        continue;
      }
      const tx = transactionById.get(transactionId);
      if (!tx) {
        continue;
      }
      tx.writeOperations.push({
        operationId: row.operation_id || row.operationId,
        statementType: row.statement_type || row.statementType,
        partitionIds: this.parseJsonArrayField(row.partition_ids || row.partitionIds),
        idempotencyKey: row.idempotency_key || row.idempotencyKey,
        payloadHash: row.payload_hash || row.payloadHash,
        status: row.status || WRITE_OPERATION_STATUS.PENDING,
        retryCount: row.retry_count || row.retryCount || 0,
        lastError: row.last_error || row.lastError || null,
        createdAt: row.created_at || row.createdAt || tx.createdAt,
        updatedAt: row.updated_at || row.updatedAt || tx.updatedAt,
      });
    }
  }

  /**
   * Execute one participant stage and persist participant state updates.
   *
   * @param {Object} tx - Transaction state object.
   * @param {string} transientStatus - Status while stage is running.
   * @param {string} successStatus - Status on success.
   * @param {Function} operation - Async participant operation callback.
   * @return {Promise<Object[]>} Failed participant entries.
   * @private
   */
  async executeParticipantStage(
    tx,
    transientStatus,
    successStatus,
    operation,
  ) {
    const failedParticipants = [];
    for (const [partitionId, participant] of tx.participants.entries()) {
      participant.status = transientStatus;
      participant.updatedAt = this.now();
      participant.lastError = null;
      await this.persistParticipantRecord(tx, participant);

      try {
        await operation(partitionId);
        participant.status = successStatus;
        participant.updatedAt = this.now();
        participant.lastError = null;
      } catch (error) {
        participant.status = PARTICIPANT_STATUS.FAILED;
        participant.lastError = error.message;
        participant.updatedAt = this.now();
        failedParticipants.push({
          partitionId,
          error: error.message,
        });
      }
      await this.persistParticipantRecord(tx, participant);
    }
    return failedParticipants;
  }

  /**
   * Persist transaction record through callback.
   * @param {Object} tx - Transaction state.
   * @return {Promise<void>}
   * @private
   */
  async persistTransactionRecord(tx) {
    await this.persistTransaction({
      transactionId: tx.transactionId,
      sessionId: tx.sessionId,
      status: tx.status,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    });
  }

  /**
   * Persist selected participants for a transaction.
   * @param {Object} tx - Transaction state.
   * @param {string[]} partitionIds - Participant IDs to persist.
   * @return {Promise<void>}
   * @private
   */
  async persistParticipants(tx, partitionIds) {
    for (const partitionId of partitionIds) {
      const participant = tx.participants.get(partitionId);
      if (!participant) {
        continue;
      }
      await this.persistParticipantRecord(tx, participant);
    }
  }

  /**
   * Persist one participant record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} participant - Participant state.
   * @return {Promise<void>}
   * @private
   */
  async persistParticipantRecord(tx, participant) {
    await this.persistParticipant({
      participantId: participant.participantId,
      transactionId: tx.transactionId,
      partitionId: participant.partitionId,
      status: participant.status,
      lastError: participant.lastError,
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
    });
  }

  /**
   * Persist one write-operation record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} operation - Write operation metadata.
   * @return {Promise<void>}
   * @private
   */
  async persistWriteOperationRecord(tx, operation) {
    await this.persistWriteOperation({
      operationId: operation.operationId,
      transactionId: tx.transactionId,
      statementType: operation.statementType,
      status: operation.status,
      idempotencyKey: operation.idempotencyKey,
      payloadHash: operation.payloadHash,
      partitionIds: operation.partitionIds,
      retryCount: operation.retryCount,
      lastError: operation.lastError,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    });
  }

  /**
   * Build transaction ID.
   * @param {string} sessionId - Session ID.
   * @return {string} Transaction ID.
   * @private
   */
  createTransactionId(sessionId) {
    return `tx-${sessionId}-${this.now()}`;
  }

  /**
   * Build a deterministic participant ID.
   * @param {string} transactionId - Transaction ID.
   * @param {string} partitionId - Partition ID.
   * @return {string} Participant ID.
   * @private
   */
  createParticipantId(transactionId, partitionId) {
    return `${transactionId}:${partitionId}`;
  }

  /**
   * Build payload hash for write operation persistence.
   * @param {Object} operation - Write operation metadata.
   * @return {string} Payload hash.
   * @private
   */
  createWritePayloadHash(operation) {
    const payload = JSON.stringify({
      operationId: operation.operationId,
      statementType: operation.statementType,
      partitionIds: operation.partitionIds || [],
    });
    return createHash('sha1')
      .update(payload)
      .digest('hex');
  }

  /**
   * Parse serialized JSON array payloads.
   * @param {*} value - Raw value.
   * @return {string[]} Parsed array.
   * @private
   */
  parseJsonArrayField(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }
    if (typeof value !== 'string' || !value.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      return [];
    }
  }

  /**
   * Return ordered participant IDs for API responses.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Ordered participant IDs.
   * @private
   */
  getOrderedParticipantIds(tx) {
    return Array.from(tx.participants.keys()).sort();
  }

  /**
   * Return ordered participant details for API responses.
   * @param {Object} tx - Transaction state.
   * @return {Object[]} Ordered participant records.
   * @private
   */
  getOrderedParticipantDetails(tx) {
    return Array.from(tx.participants.values())
      .map((participant) => ({...participant}))
      .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  }
}

export {
  DistributedTransactionCoordinator,
  PARTICIPANT_STATUS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
};
