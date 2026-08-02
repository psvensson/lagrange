import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../constants/index.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  PARTICIPANT_STATUS,
  RECOVERY_COMMIT_TRANSACTION_STATUS,
  RECOVERY_ROLLBACK_TRANSACTION_STATUS,
  RECOVERY_SWEEP_DEFER_BASE_MS,
  RECOVERY_SWEEP_DEFER_MAX_MS,
  RECOVERY_SWEEP_LOG_MSG,
  TERMINAL_TRANSACTION_STATUS,
  TRANSACTION_STATUS,
  WRITE_OPERATION_STATUS,
} from './distributed-transaction-coordinator-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_TRANSACTION_EPOCH = 'transaction_epoch';
const LOCAL_STR_TRANSACTIONEPOCH = 'transactionEpoch';
const LOCAL_STR_TRANSACTION_MODE = 'transaction_mode';
const LOCAL_STR_TRANSACTIONMODE = 'transactionMode';
const LOCAL_STR_PARTICIPANT_SET_STATE = 'participant_set_state';
const LOCAL_STR_PARTICIPANTSETSTATE = 'participantSetState';
const LOCAL_STR_COMMIT_MODE = 'commit_mode';
const LOCAL_STR_COMMITMODE = 'commitMode';
const LOCAL_STR_FROZEN_PARTICIPANT_COUNT = 'frozen_participant_count';
const LOCAL_STR_FROZENPARTICIPANTCOUNT = 'frozenParticipantCount';
const LOCAL_STR_TIMEOUT_DEADLINE = 'timeout_deadline';
const LOCAL_STR_TIMEOUTDEADLINE = 'timeoutDeadline';
const RECOVERED_TRANSACTION_DECISION_EVENT = 'RECOVERY_STATE_RESTORED';

function readTransactionDecisionField(row, snakeKey, camelKey) {
  return Object.prototype.hasOwnProperty.call(row, snakeKey) ?
    row[snakeKey] :
    row[camelKey];
}

function readTransactionDecisionFieldWithActiveLegacyDefault(
  row,
  snakeKey,
  camelKey,
  status,
  legacyDefault,
) {
  const value = readTransactionDecisionField(row, snakeKey, camelKey);
  return value === undefined && status === TRANSACTION_STATUS.ACTIVE ?
    legacyDefault :
    value;
}

function buildRecoveredTransactionDecisionState(row, status) {
  return {
    transactionMode: readTransactionDecisionFieldWithActiveLegacyDefault(
      row,
      LOCAL_STR_TRANSACTION_MODE,
      LOCAL_STR_TRANSACTIONMODE,
      status,
      TRANSACTION_MODE.EXPLICIT,
    ),
    participantSetState:
      readTransactionDecisionFieldWithActiveLegacyDefault(
        row,
        LOCAL_STR_PARTICIPANT_SET_STATE,
        LOCAL_STR_PARTICIPANTSETSTATE,
        status,
        PARTICIPANT_SET_STATE.OPEN,
      ),
    commitMode: readTransactionDecisionFieldWithActiveLegacyDefault(
      row,
      LOCAL_STR_COMMIT_MODE,
      LOCAL_STR_COMMITMODE,
      status,
      COMMIT_MODE.NOT_SELECTED,
    ),
    frozenParticipantCount: Number(
      readTransactionDecisionFieldWithActiveLegacyDefault(
        row,
        LOCAL_STR_FROZEN_PARTICIPANT_COUNT,
        LOCAL_STR_FROZENPARTICIPANTCOUNT,
        status,
        0,
      )),
  };
}

function buildTransactionRecoveryIncompleteError({decisionDimension, row}) {
  const error = new Error(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE);
  error.errorCode = QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE;
  const evidenceFields = {
    decisionDimension,
    transactionId: row?.transaction_id ?? row?.transactionId,
    sessionId: row?.session_id ?? row?.sessionId,
  };
  for (const [fieldName, value] of Object.entries(evidenceFields)) {
    if (typeof value === 'string' && value.length > 0) {
      error[fieldName] = value;
    }
  }
  return error;
}

function validateRecoveredTransactionDecision(tx, row = null) {
  const transactionModeValid =
    Object.values(TRANSACTION_MODE).includes(tx.transactionMode);
  const participantSetStateValid =
    Object.values(PARTICIPANT_SET_STATE).includes(tx.participantSetState);
  const commitModeValid = Object.values(COMMIT_MODE).includes(tx.commitMode);
  const frozenCountValid = Number.isInteger(tx.frozenParticipantCount) &&
    tx.frozenParticipantCount >= 0;
  const openStateValid =
    tx.participantSetState === PARTICIPANT_SET_STATE.OPEN &&
    tx.commitMode === COMMIT_MODE.NOT_SELECTED &&
    tx.frozenParticipantCount === 0 &&
    [
      TRANSACTION_STATUS.ACTIVE,
      TRANSACTION_STATUS.ROLLING_BACK,
      TRANSACTION_STATUS.FAILED,
    ].includes(tx.status);
  const frozenStateValid =
    tx.participantSetState === PARTICIPANT_SET_STATE.FROZEN &&
    tx.commitMode !== COMMIT_MODE.NOT_SELECTED &&
    tx.frozenParticipantCount === tx.participants.size;
  const onePhaseStatusValid =
    tx.commitMode !== COMMIT_MODE.ONE_PHASE_COMMIT ||
    ![
      TRANSACTION_STATUS.PREPARING,
      TRANSACTION_STATUS.PREPARED,
    ].includes(tx.status);
  const onePhaseCountValid =
    tx.commitMode !== COMMIT_MODE.ONE_PHASE_COMMIT ||
    tx.frozenParticipantCount === 1;
  if (
    transactionModeValid &&
    participantSetStateValid &&
    commitModeValid &&
    frozenCountValid &&
    (openStateValid || frozenStateValid) &&
    onePhaseStatusValid &&
    onePhaseCountValid
  ) {
    return;
  }
  const failedDecisionDimension = !transactionModeValid ?
    LOCAL_STR_TRANSACTION_MODE :
    !participantSetStateValid ?
      LOCAL_STR_PARTICIPANT_SET_STATE :
      !commitModeValid || !onePhaseStatusValid || !onePhaseCountValid ?
        LOCAL_STR_COMMIT_MODE :
        LOCAL_STR_FROZEN_PARTICIPANT_COUNT;
  throw buildTransactionRecoveryIncompleteError({
    decisionDimension: failedDecisionDimension,
    row,
  });
}

function buildRecoveredParticipantKeysByTransaction(participantRows) {
  const participantKeysByTransaction = new Map();
  for (const row of participantRows) {
    const transactionId = row.transaction_id || row.transactionId;
    const partitionId = row.partition_id || row.partitionId;
    if (!transactionId || !partitionId) {
      continue;
    }
    const keys = participantKeysByTransaction.get(transactionId) || new Set();
    keys.add(partitionId);
    participantKeysByTransaction.set(transactionId, keys);
  }
  return participantKeysByTransaction;
}

function validateRecoveryRowsBeforeMutation(
  coordinator,
  transactionRows,
  participantRows,
) {
  const participantKeysByTransaction =
    buildRecoveredParticipantKeysByTransaction(participantRows);
  for (const row of transactionRows) {
    const status = row.status || TRANSACTION_STATUS.FAILED;
    if (TERMINAL_TRANSACTION_STATUS.has(status)) {
      continue;
    }
    const sessionId = row.session_id || row.sessionId;
    const transactionId = row.transaction_id || row.transactionId;
    if (!sessionId || !transactionId) {
      throw buildTransactionRecoveryIncompleteError({
        decisionDimension: null,
        row,
      });
    }
    if (coordinator.transactionsBySession.has(sessionId)) {
      continue;
    }
    const participantKeys =
      participantKeysByTransaction.get(transactionId) || new Set();
    validateRecoveredTransactionDecision(
      {
        ...buildRecoveredTransactionDecisionState(row, status),
        status,
        participants: new Map(
          Array.from(participantKeys, (partitionId) => [partitionId, true]),
        ),
      },
      row,
    );
  }
}

/**
 * @param {*} errorLike
 * @return {boolean}
 * @private
 */

function shouldDeferRecoverySweepError(errorLike) {
  return isRetryableControlPlaneError(errorLike);
}

const distributedTransactionRecoveryMethods = {
  recover(rows) {
    if (!Array.isArray(rows)) {
      return;
    }

    this.recoverFromSystemTables({
      transactions: rows,
      participants: rows.flatMap((row) => {
        const transactionId = row.transaction_id || row.transactionId;
        const participants = Array.isArray(row.participants) ?
          row.participants :
          [];
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
  },

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
        if (RECOVERY_ROLLBACK_TRANSACTION_STATUS.has(tx.status)) {
          replayPath = QUERY_OPERATION.ROLLBACK;
          protocolResult = await this.runRollbackProtocol(tx);
          return;
        }
        if (RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status)) {
          replayPath = QUERY_OPERATION.COMMIT;
          protocolResult = await this.runCommitProtocol(tx, {
            allowTimedOutCommitStatuses: true,
          });
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

    const resumed = results.filter(
      (entry) => entry.success && !entry.skipped,
    ).length;
    const failed = results.filter((entry) => !entry.success).length;
    return {
      totalRecovered: recoveredWorkflowIds.length,
      resumed,
      failed,
      results,
    };
  },

  /**
   * Run one recovery sweep cycle for timed-out non-terminal transactions.
   * @return {Promise<Object>} Sweep summary.
   */

  async runRecoverySweep() {
    if (this.recoverySweepInFlight) {
      return {
        swept: 0,
        resolved: 0,
        failed: 0,
        skipped: true,
        deferred: 0,
        results: [],
      };
    }
    if (this.isRecoverySweepDeferred()) {
      return {
        swept: 0,
        resolved: 0,
        failed: 0,
        skipped: false,
        deferred: 1,
        deferredUntilMs: this.recoverySweepDeferredUntilMs,
        results: [],
      };
    }
    this.recoverySweepInFlight = true;
    try {
      if (typeof this.loadRecoveryStateForSweep === LOCAL_STR_FUNCTION) {
        let payload;
        try {
          payload = await this.loadRecoveryStateForSweep();
        } catch (error) {
          if (this.shouldDeferRecoverySweepError(error)) {
            return this.buildDeferredRecoverySweepResult(error);
          }
          throw error;
        }
        if (payload && typeof payload === LOCAL_STR_OBJECT) {
          this.recoverFromSystemTables(payload);
        }
      }

      const stuckTransactions = Array.from(
        this.transactionsBySession.values(),
      ).filter(
        (tx) =>
          !TERMINAL_TRANSACTION_STATUS.has(tx.status) &&
          tx.status !== TRANSACTION_STATUS.FAILED &&
          this.isTransactionBudgetExceeded(tx),
      );
      const results = [];
      let deferred = 0;

      for (const tx of stuckTransactions) {
        let protocolResult = null;
        let sweepPath = null;
        try {
          await this.workflowCoordinator.runExclusive(
            tx.ownerKey,
            async () => {
              if (RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status)) {
                sweepPath = QUERY_OPERATION.COMMIT;
                protocolResult = await this.runCommitProtocol(tx, {
                  allowTimedOutCommitStatuses: true,
                });
                return;
              }
              sweepPath = QUERY_OPERATION.ROLLBACK;
              protocolResult = await this.runRollbackProtocol(tx);
            },
          );
        } catch (error) {
          if (this.shouldDeferRecoverySweepError(error)) {
            deferred += 1;
            const deferredResult = this.buildDeferredRecoverySweepResult(
              error,
              {
                swept: stuckTransactions.length,
                results: [
                  {
                    transactionId: tx.transactionId,
                    sessionId: tx.sessionId,
                    sweepPath,
                    statusAfter: tx.status,
                    success: false,
                    deferred: true,
                    error: error?.message || String(error),
                  },
                ],
              },
            );
            results.push(...deferredResult.results);
            continue;
          }
          throw error;
        }

        if (
          protocolResult?.success !== true &&
          this.shouldDeferRecoverySweepError(protocolResult)
        ) {
          deferred += 1;
          this.deferRecoverySweep(protocolResult);
          results.push({
            transactionId: tx.transactionId,
            sessionId: tx.sessionId,
            sweepPath,
            statusAfter: tx.status,
            success: false,
            deferred: true,
            error: protocolResult?.error || null,
          });
          continue;
        }

        results.push({
          transactionId: tx.transactionId,
          sessionId: tx.sessionId,
          sweepPath,
          statusAfter: tx.status,
          success: protocolResult?.success === true,
          error: protocolResult?.error || null,
        });
      }

      const resolved = results.filter((entry) => entry.success).length;
      const failed = results.filter(
        (entry) => entry.success !== true && entry.deferred !== true,
      ).length;
      if (deferred === 0) {
        this.clearRecoverySweepDeferState();
      }
      return {
        swept: stuckTransactions.length,
        resolved,
        failed,
        deferred,
        deferredUntilMs: deferred > 0 ?
          this.recoverySweepDeferredUntilMs :
          0,
        skipped: false,
        results,
      };
    } finally {
      this.recoverySweepInFlight = false;
    }
  },

  /**
   * Start periodic transaction recovery sweep.
   */

  startRecoverySweep() {
    if (this.recoverySweepTimer) {
      return;
    }
    this.recoverySweepTimer = setInterval(() => {
      void this.runRecoverySweep().catch((error) => {
        this.logger?.error?.(RECOVERY_SWEEP_LOG_MSG, {
          error: error?.message || String(error),
        });
      });
    }, this.recoverySweepIntervalMs);
    this.recoverySweepTimer.unref();
  },

  /**
   * Stop periodic transaction recovery sweep.
   */

  stopRecoverySweep() {
    if (!this.recoverySweepTimer) {
      return;
    }
    clearInterval(this.recoverySweepTimer);
    this.recoverySweepTimer = null;
  },

  /**
   * @return {boolean}
   * @private
   */

  isRecoverySweepDeferred() {
    return (
      Number.isFinite(this.recoverySweepDeferredUntilMs) &&
      this.recoverySweepDeferredUntilMs > this.now()
    );
  },

  /**
   * @param {*} errorLike
   * @return {{delayMs: number, deferredUntilMs: number}}
   * @private
   */

  deferRecoverySweep(errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    const backoffMs =
      retryAfterMs > 0 ?
        retryAfterMs :
        Math.min(
          RECOVERY_SWEEP_DEFER_MAX_MS,
          Math.max(
            this.recoverySweepIntervalMs,
            RECOVERY_SWEEP_DEFER_BASE_MS *
                2 ** this.recoverySweepDeferredAttempts,
          ),
        );
    this.recoverySweepDeferredAttempts += 1;
    this.recoverySweepDeferredUntilMs = this.now() + backoffMs;
    return {
      delayMs: backoffMs,
      deferredUntilMs: this.recoverySweepDeferredUntilMs,
    };
  },

  /**
   * @return {void}
   * @private
   */

  clearRecoverySweepDeferState() {
    this.recoverySweepDeferredUntilMs = 0;
    this.recoverySweepDeferredAttempts = 0;
  },

  /**
   * @param {*} errorLike
   * @param {Object} [overrides={}]
   * @return {Object}
   * @private
   */

  buildDeferredRecoverySweepResult(errorLike, overrides = {}) {
    this.deferRecoverySweep(errorLike);
    return {
      swept: overrides.swept || 0,
      resolved: 0,
      failed: 0,
      skipped: false,
      deferred: Number.isFinite(overrides.deferred) ?
        overrides.deferred :
        1,
      deferredUntilMs: this.recoverySweepDeferredUntilMs,
      error: errorLike?.message || String(errorLike),
      results: Array.isArray(overrides.results) ? overrides.results : [],
    };
  },

  /**
   * Recover coordinator state from canonical system-table rows.
   *
   * @param {Object} payload - Recovery payload.
   * @param {Object[]} [payload.transactions] - sql_transactions rows.
   * @param {Object[]} [payload.participants] - sql_transaction_participants
   *   rows.
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

    validateRecoveryRowsBeforeMutation(
      this,
      transactionRows,
      participantRows,
    );

    const recoveryOutcome = this.workflowCoordinator.recover({
      workflows: transactionRows,
      participants: participantRows,
      loadWorkflow: (row) => {
        const sessionId = row.session_id || row.sessionId;
        const transactionId = row.transaction_id || row.transactionId;
        const status = row.status || TRANSACTION_STATUS.FAILED;
        if (!sessionId || !transactionId) {
          return null;
        }
        const {
          transactionMode,
          participantSetState,
          commitMode,
          frozenParticipantCount,
        } = buildRecoveredTransactionDecisionState(row, status);
        const updatedAt = row.updated_at || row.updatedAt || this.now();
        return {
          sessionId,
          ownerKey: sessionId,
          transactionId,
          workflowId: transactionId,
          status,
          transactionEpoch: this.resolveFiniteNumberField(
            row,
            LOCAL_STR_TRANSACTION_EPOCH,
            LOCAL_STR_TRANSACTIONEPOCH,
          ),
          timeoutDeadline: this.resolveFiniteNumberField(
            row,
            LOCAL_STR_TIMEOUT_DEADLINE,
            LOCAL_STR_TIMEOUTDEADLINE,
          ),
          transactionMode,
          participantSetState,
          commitMode,
          frozenParticipantCount,
          participantSetFrozenAt:
            participantSetState === PARTICIPANT_SET_STATE.FROZEN ?
              updatedAt :
              0,
          decisionTrace: [Object.freeze({
            sequence: 0,
            event: RECOVERED_TRANSACTION_DECISION_EVENT,
            status,
            transactionMode,
            participantSetState,
            commitMode,
            frozenParticipantCount,
            timestamp: updatedAt,
          })],
          writeOperations: [],
          createdAt: row.created_at || row.createdAt || this.now(),
          updatedAt,
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
          participantId:
            row.participant_id ||
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

    // Live transactions the recover() clobber-guard preserved were NOT
    // restored from rows: enrolling them as "recovered" would hand them to
    // resumeRecoveredTransactions (which rolls back live ACTIVE work), and
    // re-appending their writeOperations from rows would duplicate live
    // in-memory entries.
    const restoredWorkflowIds =
      recoveryOutcome?.restoredWorkflowIds || new Set();
    for (const workflowId of restoredWorkflowIds) {
      const tx = this.workflowCoordinator.getWorkflowById(workflowId);
      if (tx) {
        validateRecoveredTransactionDecision(tx, tx);
      }
    }
    for (const row of transactionRows) {
      const transactionId = row.transaction_id || row.transactionId;
      if (!transactionId || !restoredWorkflowIds.has(transactionId)) {
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
      if (!transactionId || !restoredWorkflowIds.has(transactionId)) {
        continue;
      }
      const tx = this.workflowCoordinator.getWorkflowById(transactionId);
      if (!tx) {
        continue;
      }
      tx.writeOperations.push({
        operationId: row.operation_id || row.operationId,
        statementType: row.statement_type || row.statementType,
        partitionIds: this.parseJsonArrayField(
          row.partition_ids || row.partitionIds,
        ),
        idempotencyKey: row.idempotency_key || row.idempotencyKey,
        payloadHash: row.payload_hash || row.payloadHash,
        status: row.status || WRITE_OPERATION_STATUS.PENDING,
        retryCount: row.retry_count || row.retryCount || 0,
        lastError: row.last_error || row.lastError || null,
        createdAt: row.created_at || row.createdAt || tx.createdAt,
        updatedAt: row.updated_at || row.updatedAt || tx.updatedAt,
      });
    }
  },
};

const {
  recover,
  resumeRecoveredTransactions,
  runRecoverySweep,
  startRecoverySweep,
  stopRecoverySweep,
  isRecoverySweepDeferred,
  deferRecoverySweep,
  clearRecoverySweepDeferState,
  buildDeferredRecoverySweepResult,
  recoverFromSystemTables,
} = distributedTransactionRecoveryMethods;

export {
  recover,
  resumeRecoveredTransactions,
  runRecoverySweep,
  startRecoverySweep,
  stopRecoverySweep,
  isRecoverySweepDeferred,
  shouldDeferRecoverySweepError,
  deferRecoverySweep,
  clearRecoverySweepDeferState,
  buildDeferredRecoverySweepResult,
  recoverFromSystemTables,
};
