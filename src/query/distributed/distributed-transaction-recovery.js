import {
  PARTICIPANT_SET_STATE,
} from '../../constants/index.js';
import {
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  buildTransactionRecoveryIncompleteError,
  buildRecoveredTransactionDecisionState,
} from './distributed-transaction-recovery-validation.js';
import {redriveAuthoritativeRecovery} from
  './distributed-transaction-recovery-authority.js';
import {PARTICIPANT_TRANSACTION_DECISION} from
  '../../partition/partition-participant-transaction-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  PARTICIPANT_STATUS,
  RECOVERY_COMMIT_TRANSACTION_STATUS,
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
const LOCAL_STR_PREPARED_DIGEST = 'prepared_digest';
const LOCAL_STR_PREPAREDDIGEST = 'preparedDigest';
const LOCAL_STR_PREPARE_INDEX = 'prepare_index';
const LOCAL_STR_PREPAREINDEX = 'prepareIndex';
const LOCAL_STR_PREPARE_TERM = 'prepare_term';
const LOCAL_STR_PREPARETERM = 'prepareTerm';
const LOCAL_STR_TIMEOUT_DEADLINE = 'timeout_deadline';
const LOCAL_STR_TIMEOUTDEADLINE = 'timeoutDeadline';
const RECOVERED_TRANSACTION_DECISION_EVENT = 'RECOVERY_STATE_RESTORED';

/**
 * @param {*} errorLike
 * @return {boolean}
 * @private
 */

function shouldDeferRecoverySweepError(errorLike) {
  return isRetryableControlPlaneError(errorLike);
}

// The PREPARE evidence a recovered participant row retained (design 2.1,
// seam E): its prepared digest, index and term. A row without a digest is
// asked again under the same identity before any COMMIT decision.
function recoveredPrepareEvidenceOf(coordinator, row) {
  const preparedDigest = row[LOCAL_STR_PREPARED_DIGEST] ??
    row[LOCAL_STR_PREPAREDDIGEST] ?? null;
  const retained = typeof preparedDigest === 'string' &&
    preparedDigest.length > 0;
  return {
    preparedDigest: retained ? preparedDigest : null,
    prepareIndex: coordinator.resolveFiniteNumberField(
      row, LOCAL_STR_PREPARE_INDEX, LOCAL_STR_PREPAREINDEX),
    prepareTerm: coordinator.resolveFiniteNumberField(
      row, LOCAL_STR_PREPARE_TERM, LOCAL_STR_PREPARETERM),
    prepareEvidenceRetained: retained,
  };
}

// Recovery's re-drive of one transaction by its recorded decision, or by
// its status when none is recorded yet: a recorded decision is completed
// whatever the status (a FAILED row included); PREPARED or COMMITTING
// continues the commit protocol (prepare-first evidence, then the
// insert-once decision, which may be a ROLLBACK the evidence requires);
// every other undecided status rolls back.
async function redriveRecoveredTransaction(coordinator, tx) {
  if (tx.recoveryDiscovered) return redriveAuthoritativeRecovery(coordinator, tx);
  if (!tx.decision && !RECOVERY_COMMIT_TRANSACTION_STATUS.has(tx.status)) {
    return {path: QUERY_OPERATION.ROLLBACK,
      result: await coordinator.runRollbackProtocol(tx)};
  }
  if (!tx.decision) {
    const result = await coordinator.runCommitProtocol(tx, {
      allowTimedOutCommitStatuses: true,
    });
    if (tx.decision?.decision !== PARTICIPANT_TRANSACTION_DECISION.ROLLBACK) {
      return {path: QUERY_OPERATION.COMMIT, result};
    }
    return {path: QUERY_OPERATION.ROLLBACK, result: {...result,
      success: (result.rollbackFailedParticipants || []).length === 0}};
  }
  return tx.decision.decision === PARTICIPANT_TRANSACTION_DECISION.COMMIT ?
    {path: QUERY_OPERATION.COMMIT,
      result: await coordinator.completeCommitDecision(tx)} :
    {path: QUERY_OPERATION.ROLLBACK,
      result: await coordinator.completeRollbackDecision(tx)};
}

const distributedTransactionRecoveryMethods = {
  shouldDeferRecoverySweepError,

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

      await this.runTransactionOperation(tx.sessionId, async () => {
        if (!tx.recoveryDiscovered && TERMINAL_TRANSACTION_STATUS.has(tx.status)) {
          skipped = true;
          protocolResult = {success: true};
          return;
        }
        const redriven = await redriveRecoveredTransaction(this, tx);
        replayPath = redriven.path;
        protocolResult = redriven.result;
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
        decisionReadState: protocolResult?.decisionReadState ?? null,
        failedParticipants: protocolResult?.failedParticipants || [],
      });
      if (protocolResult?.success === true || skipped) {
        this.recoveredTransactionIds.delete(workflowId);
      }
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
          // Discovery is a hint source. A failed cache census cannot suppress
          // the authoritative retries of IDs already retained by this owner.
          this.logger?.warn?.(RECOVERY_SWEEP_LOG_MSG, {
            error: error?.message || String(error),
            retainedTransactions: this.recoveredTransactionIds.size,
          });
        }
        if (payload && typeof payload === LOCAL_STR_OBJECT) {
          this.recoverFromSystemTables(payload);
        }
      }

      const stuckTransactions = Array.from(
        this.workflowCoordinator.workflowsById.values(),
      ).filter(
        (tx) =>
          tx.recoveryDiscovered || (!TERMINAL_TRANSACTION_STATUS.has(tx.status) &&
            this.isTransactionBudgetExceeded(tx)),
      );
      const results = [];
      let deferred = 0;

      for (const tx of stuckTransactions) {
        let protocolResult = null;
        let sweepPath = null;
        try {
          await this.runTransactionOperation(
            tx.sessionId,
            async () => {
              if (!tx.recoveryDiscovered && TERMINAL_TRANSACTION_STATUS.has(tx.status)) {
                protocolResult = {success: true};
                return;
              }
              const redriven = await redriveRecoveredTransaction(this, tx);
              sweepPath = redriven.path;
              protocolResult = redriven.result;
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
   * @param {Object[]} [payload.decisions] - recorded decision rows
   *   ({transaction_id, decision, decision_text, decision_digest}); a
   *   sql_transactions row carries its own in the same columns.
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
    const knownIds = new Set(this.workflowCoordinator.workflowsById.keys());
    for (const row of transactionRows) {
      if (!(row.transaction_id || row.transactionId) || !(row.session_id || row.sessionId)) {
        throw buildTransactionRecoveryIncompleteError({decisionDimension: null, row});
      }
    }

    const recoveryOutcome = this.workflowCoordinator.recover({
      workflows: transactionRows,
      participants: participantRows.filter((row) =>
        !knownIds.has(row.transaction_id || row.transactionId)),
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
          decision: null,
          participantSetText: row.participant_set_text ?? row.participantSetText ?? null,
          recoveryDiscovered: true,
          transactionRowInserted: true,
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
          ...recoveredPrepareEvidenceOf(this, row),
          createdAt: row.created_at || row.createdAt || this.now(),
          updatedAt: row.updated_at || row.updatedAt || this.now(),
        };
      },
      isTerminalWorkflow: (workflow) => !workflow.recoveryDiscovered &&
        TERMINAL_TRANSACTION_STATUS.has(workflow.status),
    });

    // Live transactions the recover() clobber-guard preserved were NOT
    // restored from rows: enrolling them as "recovered" would hand them to
    // resumeRecoveredTransactions (which rolls back live ACTIVE work), and
    // re-appending their writeOperations from rows would duplicate live
    // in-memory entries.
    const restoredWorkflowIds =
      recoveryOutcome?.restoredWorkflowIds || new Set();
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

export {distributedTransactionRecoveryMethods};
