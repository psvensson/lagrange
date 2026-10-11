import {
  PARTICIPANT_SET_STATE,
  isCanonicalTransactionEpoch,
} from '../../constants/index.js';
import {
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  buildTransactionRecoveryIncompleteError,
  buildRecoveredTransactionDecisionState,
  validatePersistedTransactionRow,
} from './distributed-transaction-recovery-validation.js';
import {redriveAuthoritativeRecovery,
  TRANSACTION_AUTHORITY_STATE,
  transactionRecoveryAuthorityCandidate} from
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
import {INITIAL_ROW_FIELDS, TRANSACTION_CREATION_STATE} from
  './distributed-transaction-creation-contract.js';
import {captureTransactionCreationRecoveryOperation,
  reconcileTransactionCreationOwned,
  recordTransactionCreationSweepDiagnostic,
  releaseTerminalServerTransactionCreation,
  releaseTransactionCreationOperation} from
  './distributed-transaction-creation.js';

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

function rotatingCreationSelection(coordinator, transactions) {
  const candidates = transactions.filter((tx) =>
    tx.transactionCreationState &&
    tx.transactionCreationState !== TRANSACTION_CREATION_STATE.ENTERED_ACTIVE)
    .sort((left, right) => left.transactionId.localeCompare(right.transactionId));
  if (candidates.length === 0) return [];
  let start = candidates.findIndex((tx) =>
    coordinator.transactionCreationSweepCursor === null ||
    tx.transactionId > coordinator.transactionCreationSweepCursor);
  if (start < 0) start = 0;
  const selected = [];
  const limit = Math.min(candidates.length,
    coordinator.maxUncertainCreationSweepPerTurn);
  for (let offset = 0; offset < limit; offset += 1) {
    selected.push(candidates[(start + offset) % candidates.length]);
  }
  coordinator.transactionCreationSweepCursor = selected.at(-1).transactionId;
  return selected;
}

function hasMatchingCreationIdentity(transaction, capturedRow) {
  return INITIAL_ROW_FIELDS.every((field) =>
    Object.is(transaction[field], capturedRow[field]));
}

function canAcceptAdvancedCreation(coordinator, tx, capturedRow, payload) {
  return payload?.state === TRANSACTION_AUTHORITY_STATE.AVAILABLE &&
    coordinator.workflowCoordinator.getWorkflowById(tx.workflowId) === tx &&
    coordinator.transactionsBySession.get(tx.sessionId) === tx &&
    validatePersistedTransactionRow(payload.transaction,
      tx.transactionId) !== null &&
    hasMatchingCreationIdentity(payload.transaction, capturedRow) &&
    transactionRecoveryAuthorityCandidate(tx, payload) !== null;
}

function reportRejectedAdvancedCreation(coordinator, tx, error) {
  coordinator.logger?.warn?.(RECOVERY_SWEEP_LOG_MSG, {
    transactionId: tx.transactionId,
    error: error?.message || String(error),
  });
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

function emptySweepResult(fields = {}) {
  return {
    swept: 0, resolved: 0, failed: 0, deferred: 0,
    results: [], ...fields,
  };
}

async function refreshRecoverySweepState(coordinator, creationGeneration) {
  if (typeof coordinator.loadRecoveryStateForSweep !== LOCAL_STR_FUNCTION) {
    return true;
  }
  let payload;
  try {
    payload = await coordinator.loadRecoveryStateForSweep();
  } catch (error) {
    // Discovery is a hint source. A failed cache census cannot suppress the
    // authoritative retries of IDs already retained by this owner.
    coordinator.logger?.warn?.(RECOVERY_SWEEP_LOG_MSG, {
      error: error?.message || String(error),
      retainedTransactions: coordinator.recoveredTransactionIds.size,
    });
  }
  if (coordinator.transactionCreationShutdown ||
      creationGeneration !== coordinator.transactionCreationGeneration) {
    return false;
  }
  if (payload && typeof payload === LOCAL_STR_OBJECT) {
    coordinator.recoverFromSystemTables(payload);
  }
  return true;
}

function recoverySweepSelection(coordinator) {
  const all = Array.from(coordinator.workflowCoordinator.workflowsById.values());
  const creations = rotatingCreationSelection(coordinator, all);
  const creationIds = new Set(creations.map((tx) => tx.workflowId));
  const pendingIds = new Set(all.filter((tx) =>
    tx.transactionCreationState && tx.transactionCreationState !==
      TRANSACTION_CREATION_STATE.ENTERED_ACTIVE).map((tx) => tx.workflowId));
  const ordinary = all.filter((tx) => !pendingIds.has(tx.workflowId) && (
    tx.recoveryDiscovered ||
    (!TERMINAL_TRANSACTION_STATUS.has(tx.status) &&
      coordinator.isTransactionBudgetExceeded(tx))
  ));
  return {creationIds, creations, transactions: [...creations, ...ordinary]};
}

async function redriveSelectedRecovery(coordinator, tx, creationOperation) {
  if (!tx.recoveryDiscovered && TERMINAL_TRANSACTION_STATUS.has(tx.status)) {
    return {path: null, result: {success: true}};
  }
  const creationPending = tx.transactionCreationState &&
    tx.transactionCreationState !== TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
  if (!creationPending) return redriveRecoveredTransaction(coordinator, tx);
  if (tx.transactionCreationAdvancedHandoff === true &&
      tx.recoveryDiscovered === true) {
    return redriveRecoveredTransaction(coordinator, tx);
  }
  return {path: QUERY_OPERATION.BEGIN_TRANSACTION,
    result: await reconcileTransactionCreationOwned(
      coordinator, tx, null, creationOperation)};
}

function sweepEntry(tx, path, protocolResult, deferred = false) {
  return {
    transactionId: tx.transactionId,
    sessionId: tx.sessionId,
    sweepPath: path,
    statusAfter: tx.status,
    success: protocolResult?.success === true,
    ...(deferred ? {deferred: true} : {}),
    error: protocolResult?.error || null,
  };
}

async function runSelectedRecovery(coordinator, tx, creationOperation) {
  let outcome;
  try {
    await coordinator.runTransactionOperation(tx.sessionId, async () => {
      outcome = await redriveSelectedRecovery(coordinator, tx, creationOperation);
      releaseTerminalServerTransactionCreation(coordinator, tx);
    });
  } catch (error) {
    if (!coordinator.shouldDeferRecoverySweepError(error)) throw error;
    return {deferredCause: error,
      entry: sweepEntry(tx, outcome?.path ?? null, error, true)};
  } finally {
    if (creationOperation) {
      releaseTransactionCreationOperation(coordinator, creationOperation);
    }
  }
  const deferred = outcome.result?.success !== true &&
    coordinator.shouldDeferRecoverySweepError(outcome.result);
  return {deferredCause: deferred ? outcome.result : null,
    entry: sweepEntry(tx, outcome.path, outcome.result, deferred)};
}

async function executeRecoverySweepSelection(coordinator, selection) {
  const results = [];
  let deferredCause = null;
  for (const tx of selection.transactions) {
    const selectedCreation = selection.creationIds.has(tx.workflowId);
    const operation = selectedCreation ?
      captureTransactionCreationRecoveryOperation(coordinator, tx) : null;
    if (selectedCreation && !operation) {
      const pressure = {deferRetry: true,
        error: QUERY_ERROR_MSG.TRANSACTION_CREATION_PRESSURE};
      deferredCause ||= pressure;
      results.push(sweepEntry(tx, QUERY_OPERATION.BEGIN_TRANSACTION,
        pressure, true));
      continue;
    }
    const executed = await runSelectedRecovery(coordinator, tx, operation);
    deferredCause ||= executed.deferredCause;
    results.push(executed.entry);
  }
  return {deferredCause, results};
}

function finishRecoverySweep(coordinator, selection, execution) {
  const deferred = execution.results.filter((entry) => entry.deferred).length;
  const resolved = execution.results.filter((entry) => entry.success).length;
  const failed = execution.results.filter(
    (entry) => entry.success !== true && entry.deferred !== true).length;
  if (deferred > 0 && execution.deferredCause) {
    coordinator.deferRecoverySweep(execution.deferredCause);
  } else if (deferred === 0) {
    coordinator.clearRecoverySweepDeferState();
  }
  recordTransactionCreationSweepDiagnostic(coordinator, {
    selectedCount: selection.creations.length,
    stopReason: deferred > 0 ? 'deferred' : failed > 0 ? 'failed' :
      'turn_complete',
  });
  return {
    swept: selection.transactions.length, resolved, failed, deferred,
    deferredUntilMs: deferred > 0 ?
      coordinator.recoverySweepDeferredUntilMs : 0,
    skipped: false,
    results: execution.results,
  };
}

const distributedTransactionRecoveryMethods = {
  shouldDeferRecoverySweepError,

  acceptAdvancedTransactionCreation(tx, capturedRow, payload) {
    if (!canAcceptAdvancedCreation(this, tx, capturedRow, payload)) {
      return false;
    }
    try {
      const candidate = transactionRecoveryAuthorityCandidate(tx, payload);
      if (!candidate) return false;
      Object.assign(tx, candidate);
      tx.transactionRowInserted = true;
      tx.transactionCreationAdvancedHandoff = true;
      tx.recoveryDiscovered = true;
      this.recoveredTransactionIds.add(tx.workflowId);
      return true;
    } catch (error) {
      reportRejectedAdvancedCreation(this, tx, error);
      return false;
    }
  },

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
      return emptySweepResult({skipped: true});
    }
    if (this.isRecoverySweepDeferred()) {
      return emptySweepResult({
        skipped: false,
        deferred: 1,
        deferredUntilMs: this.recoverySweepDeferredUntilMs,
      });
    }
    this.recoverySweepInFlight = true;
    const creationGeneration = this.transactionCreationGeneration;
    try {
      if (!await refreshRecoverySweepState(this, creationGeneration)) {
        return emptySweepResult({skipped: true, deferredUntilMs: 0});
      }
      const selection = recoverySweepSelection(this);
      const execution = await executeRecoverySweepSelection(this, selection);
      return finishRecoverySweep(this, selection, execution);
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
      const transactionEpoch = row[LOCAL_STR_TRANSACTION_EPOCH] ??
        row[LOCAL_STR_TRANSACTIONEPOCH];
      if (!isCanonicalTransactionEpoch(transactionEpoch)) {
        throw buildTransactionRecoveryIncompleteError({
          decisionDimension: LOCAL_STR_TRANSACTION_EPOCH,
          row,
        });
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
