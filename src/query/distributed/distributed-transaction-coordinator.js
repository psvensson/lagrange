import {createHash} from 'node:crypto';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {DurableWorkflowCoordinator} from
  '../../workflow/durable-workflow-coordinator.js';

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

// Participants share the same lifecycle status vocabulary as transactions.
const PARTICIPANT_STATUS = TRANSACTION_STATUS;

const WRITE_OPERATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
});

const TERMINAL_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.COMMITTED,
  TRANSACTION_STATUS.ROLLED_BACK,
]));

const RECOVERY_COMMIT_TRANSACTION_STATUS = Object.freeze(new Set([
  TRANSACTION_STATUS.PREPARING,
  TRANSACTION_STATUS.PREPARED,
  TRANSACTION_STATUS.COMMITTING,
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
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        persistWorkflow: async (workflow) => {
          await this.persistTransaction({
            transactionId: workflow.transactionId || workflow.workflowId,
            sessionId: workflow.sessionId || workflow.ownerKey,
            status: workflow.status,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
          });
        },
        persistParticipant: async (participant) => {
          await this.persistParticipant({
            participantId: participant.participantId,
            transactionId: participant.transactionId || participant.workflowId,
            partitionId: participant.partitionId || participant.participantKey,
            status: participant.status,
            lastError: participant.lastError,
            createdAt: participant.createdAt,
            updatedAt: participant.updatedAt,
          });
        },
        now: this.now,
      });
    this.transactionsBySession = this.workflowCoordinator.workflowsByOwnerKey;
    this.recoveredTransactionIds = new Set();
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
    const transactionId = this.createTransactionId(sessionId);
    const tx = {
      sessionId,
      ownerKey: sessionId,
      transactionId,
      workflowId: transactionId,
      status: TRANSACTION_STATUS.ACTIVE,
      participants: new Map(),
      writeOperations: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.workflowCoordinator.registerWorkflow(tx);

    return {
      success: true,
      operation: QUERY_OPERATION.BEGIN_TRANSACTION,
      sessionId,
      transactionId,
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
      await this.workflowCoordinator.upsertParticipant(tx.workflowId, {
        participantId: this.createParticipantId(tx.transactionId, partitionId),
        transactionId: tx.transactionId,
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
    return this.runCommitProtocol(tx);
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
    return this.runRollbackProtocol(tx);
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
   * Accepts canonical system-table row arrays.
   *
   * @param {Object[]|Object} rows - Transaction rows in
   *   canonical system-table shape.
   */
  recover(rows) {
    if (!Array.isArray(rows)) {
      return;
    }

    this.recoverFromSystemTables({
      transactions: rows,
      participants: rows.flatMap((row) => {
        const transactionId = row.transaction_id || row.transactionId;
        const participants = Array.isArray(row.participants) ? row.participants : [];
        return participants.map((partitionId) => ({
          transaction_id: transactionId,
          partition_id: partitionId,
        }));
      }),
      writeOperations: rows.flatMap((row) => {
        const transactionId = row.transaction_id || row.transactionId;
        const writeOperations = Array.isArray(row.writeOperations) ?
          row.writeOperations :
          [];
        return writeOperations.map((operation) => ({
          ...operation,
          transaction_id: transactionId,
        }));
      }),
    });
  }

  /**
   * Resume all transactions recovered from system-table snapshots.
   * Transactions recovered in ACTIVE status are rolled back; transactions
   * recovered mid-commit are advanced to COMMITTED.
   *
   * @return {Promise<Object>} Replay summary.
   */
  async resumeRecoveredTransactions() {
    const recoveredWorkflowIds = Array.from(this.recoveredTransactionIds);
    const results = [];

    for (const workflowId of recoveredWorkflowIds) {
      const tx = this.workflowCoordinator.getWorkflowById(workflowId);
      if (!tx) {
        this.recoveredTransactionIds.delete(workflowId);
        continue;
      }

      const statusBefore = tx.status;
      let protocolResult;
      let replayPath = null;
      let skipped = false;

      await this.workflowCoordinator.runExclusive(tx.ownerKey, async () => {
        if (TERMINAL_TRANSACTION_STATUS.has(tx.status)) {
          skipped = true;
          protocolResult = {
            success: true,
            operation: null,
            transactionId: tx.transactionId,
            participants: this.getOrderedParticipantIds(tx),
            failedParticipants: [],
          };
          return;
        }
        if (tx.status === TRANSACTION_STATUS.FAILED) {
          skipped = true;
          protocolResult = {
            success: false,
            operation: null,
            transactionId: tx.transactionId,
            participants: this.getOrderedParticipantIds(tx),
            failedParticipants: [],
            errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
            error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
          };
          return;
        }
        if (tx.status === TRANSACTION_STATUS.ACTIVE ||
          tx.status === TRANSACTION_STATUS.ROLLING_BACK) {
          replayPath = QUERY_OPERATION.ROLLBACK;
          protocolResult = await this.runRollbackProtocol(tx);
          return;
        }
        if (RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status)) {
          replayPath = QUERY_OPERATION.COMMIT;
          protocolResult = await this.runCommitProtocol(tx);
          return;
        }
        await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
        protocolResult = {
          success: false,
          operation: QUERY_OPERATION.ROLLBACK,
          transactionId: tx.transactionId,
          participants: this.getOrderedParticipantIds(tx),
          failedParticipants: [],
          errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
          error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
        };
      });

      results.push({
        transactionId: tx.transactionId,
        sessionId: tx.sessionId,
        statusBefore,
        statusAfter: tx.status,
        replayPath,
        skipped,
        success: protocolResult?.success === true,
        error: protocolResult?.error || null,
        failedParticipants: protocolResult?.failedParticipants || [],
      });
      this.recoveredTransactionIds.delete(workflowId);
    }

    const resumed = results.filter((entry) =>
      entry.success && !entry.skipped).length;
    const failed = results.filter((entry) => !entry.success).length;
    return {
      totalRecovered: recoveredWorkflowIds.length,
      resumed,
      failed,
      results,
    };
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

    this.workflowCoordinator.recover({
      workflows: transactionRows,
      participants: participantRows,
      loadWorkflow: (row) => {
        const sessionId = row.session_id || row.sessionId;
        const transactionId = row.transaction_id || row.transactionId;
        const status = row.status || TRANSACTION_STATUS.FAILED;
        if (!sessionId || !transactionId) {
          return null;
        }
        return {
          sessionId,
          ownerKey: sessionId,
          transactionId,
          workflowId: transactionId,
          status,
          writeOperations: [],
          createdAt: row.created_at || row.createdAt || this.now(),
          updatedAt: row.updated_at || row.updatedAt || this.now(),
        };
      },
      loadParticipant: (row) => {
        const transactionId = row.transaction_id || row.transactionId;
        const partitionId = row.partition_id || row.partitionId;
        if (!transactionId || !partitionId) {
          return null;
        }
        return {
          workflowId: transactionId,
          transactionId,
          participantId: row.participant_id ||
            row.participantId ||
            this.createParticipantId(transactionId, partitionId),
          participantKey: partitionId,
          partitionId,
          status: row.status || PARTICIPANT_STATUS.FAILED,
          lastError: row.last_error || row.lastError || null,
          createdAt: row.created_at || row.createdAt || this.now(),
          updatedAt: row.updated_at || row.updatedAt || this.now(),
        };
      },
      isTerminalWorkflow: (workflow) =>
        TERMINAL_TRANSACTION_STATUS.has(workflow.status),
    });

    for (const row of transactionRows) {
      const transactionId = row.transaction_id || row.transactionId;
      if (!transactionId) {
        continue;
      }
      const tx = this.workflowCoordinator.getWorkflowById(transactionId);
      if (!tx) {
        continue;
      }
      this.recoveredTransactionIds.add(transactionId);
    }

    for (const row of writeOperationRows) {
      const transactionId = row.transaction_id || row.transactionId;
      if (!transactionId) {
        continue;
      }
      const tx = this.workflowCoordinator.getWorkflowById(transactionId);
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
   * Persist one transaction status transition.
   * @param {Object} tx - Transaction state.
   * @param {string} status - Next status.
   * @return {Promise<void>}
   * @private
   */
  async setTransactionStatus(tx, status) {
    tx.status = status;
    tx.updatedAt = this.now();
    await this.persistTransactionRecord(tx);
  }

  /**
   * Drive one transaction through the commit protocol.
   * Supports replay from PREPARING/PREPARED/COMMITTING statuses.
   *
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async runCommitProtocol(tx) {
    if (tx.status === TRANSACTION_STATUS.ACTIVE ||
      tx.status === TRANSACTION_STATUS.FAILED) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARING);
    }

    if (tx.status === TRANSACTION_STATUS.PREPARING) {
      const prepareFailures = await this.executeParticipantStage(
        tx,
        PARTICIPANT_STATUS.PREPARING,
        PARTICIPANT_STATUS.PREPARED,
        (partitionId) => this.prepareParticipant(tx.sessionId, partitionId),
        {participantKeys: this.getPrepareParticipantKeys(tx)},
      );
      if (prepareFailures.length > 0) {
        await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
        return this.buildParticipantFailureResult(
          tx,
          QUERY_OPERATION.COMMIT,
          TRANSACTION_STATUS.PREPARING,
          prepareFailures,
        );
      }
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.PREPARED);
    }

    if (tx.status === TRANSACTION_STATUS.PREPARED) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTING);
    }

    if (tx.status !== TRANSACTION_STATUS.COMMITTING) {
      return this.buildParticipantFailureResult(
        tx,
        QUERY_OPERATION.COMMIT,
        tx.status,
        [],
      );
    }

    const commitFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.COMMITTING,
      PARTICIPANT_STATUS.COMMITTED,
      (partitionId) => this.commitParticipant(tx.sessionId, partitionId),
      {participantKeys: this.getCommitParticipantKeys(tx)},
    );
    if (commitFailures.length > 0) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
      return this.buildParticipantFailureResult(
        tx,
        QUERY_OPERATION.COMMIT,
        TRANSACTION_STATUS.COMMITTING,
        commitFailures,
      );
    }

    await this.setTransactionStatus(tx, TRANSACTION_STATUS.COMMITTED);
    this.transactionsBySession.delete(tx.sessionId);
    return {
      success: true,
      operation: QUERY_OPERATION.COMMIT,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
    };
  }

  /**
   * Drive one transaction through rollback.
   * Supports replay from ACTIVE/ROLLING_BACK statuses.
   *
   * @param {Object} tx - Transaction state.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async runRollbackProtocol(tx) {
    if (tx.status !== TRANSACTION_STATUS.ROLLING_BACK) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLING_BACK);
    }

    const rollbackFailures = await this.executeParticipantStage(
      tx,
      PARTICIPANT_STATUS.ROLLING_BACK,
      PARTICIPANT_STATUS.ROLLED_BACK,
      (partitionId) => this.rollbackParticipant(tx.sessionId, partitionId),
      {participantKeys: this.getRollbackParticipantKeys(tx)},
    );

    if (rollbackFailures.length > 0) {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.FAILED);
    } else {
      await this.setTransactionStatus(tx, TRANSACTION_STATUS.ROLLED_BACK);
    }
    this.transactionsBySession.delete(tx.sessionId);

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
   * Build a consistent participant-failure result payload.
   *
   * @param {Object} tx - Transaction state.
   * @param {string} operation - Operation type.
   * @param {string} stage - Current stage.
   * @param {Object[]} failedParticipants - Failed participant entries.
   * @return {Object} Failure payload.
   * @private
   */
  buildParticipantFailureResult(tx, operation, stage, failedParticipants) {
    return {
      success: false,
      operation,
      transactionId: tx.transactionId,
      participants: this.getOrderedParticipantIds(tx),
      failedParticipants,
      stage,
      errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    };
  }

  /**
   * Resolve prepare-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getPrepareParticipantKeys(tx) {
    return Array.from(tx.participants.values())
      .filter((participant) =>
        participant.status !== PARTICIPANT_STATUS.PREPARED &&
        participant.status !== PARTICIPANT_STATUS.COMMITTED)
      .map((participant) => participant.partitionId)
      .sort();
  }

  /**
   * Resolve commit-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getCommitParticipantKeys(tx) {
    return Array.from(tx.participants.values())
      .filter((participant) =>
        participant.status !== PARTICIPANT_STATUS.COMMITTED)
      .map((participant) => participant.partitionId)
      .sort();
  }

  /**
   * Resolve rollback-stage participant keys.
   * @param {Object} tx - Transaction state.
   * @return {string[]} Participant keys.
   * @private
   */
  getRollbackParticipantKeys(tx) {
    return Array.from(tx.participants.values())
      .filter((participant) =>
        participant.status !== PARTICIPANT_STATUS.ROLLED_BACK)
      .map((participant) => participant.partitionId)
      .sort();
  }

  /**
   * Execute one participant stage and persist participant state updates.
   *
   * @param {Object} tx - Transaction state object.
   * @param {string} transientStatus - Status while stage is running.
   * @param {string} successStatus - Status on success.
   * @param {Function} operation - Async participant operation callback.
   * @param {Object} [options] - Stage options.
   * @param {string[]} [options.participantKeys] - Participant keys.
   * @return {Promise<Object[]>} Failed participant entries.
   * @private
   */
  async executeParticipantStage(
    tx,
    transientStatus,
    successStatus,
    operation,
    options = {},
  ) {
    const stageOptions = {
      failureStatus: PARTICIPANT_STATUS.FAILED,
    };
    if (Array.isArray(options.participantKeys)) {
      stageOptions.participantKeys = options.participantKeys;
    }
    const failedParticipants = await this.workflowCoordinator.executeParticipantStage(
      tx.workflowId,
      transientStatus,
      successStatus,
      (partitionId) => operation(partitionId),
      stageOptions,
    );
    return failedParticipants.map((entry) => ({
      partitionId: entry.participantKey,
      error: entry.error,
    }));
  }

  /**
   * Persist transaction record through callback.
   * @param {Object} tx - Transaction state.
   * @return {Promise<void>}
   * @private
   */
  async persistTransactionRecord(tx) {
    await this.workflowCoordinator.persistWorkflowState(tx.workflowId);
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
    await this.workflowCoordinator.persistParticipantState(
      tx.workflowId,
      participant.partitionId,
    );
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
    } catch (_parseErr) {
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
