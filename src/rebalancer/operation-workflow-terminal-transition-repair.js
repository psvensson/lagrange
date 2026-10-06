import {TIME_MS} from '../constants/index.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
} from './replica-operation-repository.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';
import {
  admitReplaceTerminalRepair,
} from './operation-workflow-replace-terminal-admission.js';
import {isFailedCreateCleanupToken} from './failed-create-cleanup-token.js';
import {assertCanonicalRebalancerEntityIdentity} from
  './rebalancer-entity-identity.js';

const {
  OperationType,
  REBALANCE_COORDINATOR_LOG_MSG,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  WORKFLOW_STEP,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  resolveOperationHandlerType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// Terminal-transition repair: the write-side half of the post-commit visibility
// confirmation. A terminal transition (FAILED / completed) that the owner
// reported committed but that never became authoritatively visible leaves an
// immortal non-terminal ledger row: the in-memory twin is terminal so no
// level-triggered path re-drives it, the stale-FAIL settle path defers to the
// row's live owner (who has no remaining work), and the row holds budget and
// admission lanes forever (affinity-demo run-21, quest
// formation-voter-surplus-promotion-deferral-livelock). When the confirmation
// throws or defers, this repair re-persists the retained terminal projection
// with capped backoff until the authoritative row reflects it, abandoning only
// when a DIFFERENT durable terminal state won.
const TERMINAL_TRANSITION_REPAIR_RETRY_DELAY_MS = TIME_MS.SECOND / 2;
const TERMINAL_TRANSITION_REPAIR_RETRY_MAX_DELAY_MS = TIME_MS.SECOND * 30;
const TERMINAL_TRANSITION_REPAIR_RETRY_BACKOFF_MULTIPLIER = 2;
const FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY =
  'failed-create-cleanup-release-recovery-scan';
const TERMINAL_TRANSITION_REPAIR_CAUSE = Object.freeze({
  CONFIRMATION_FAILED: 'confirmation_failed',
  CONFIRMATION_DEFERRED: 'confirmation_deferred',
  REPAIR_UNCONFIRMED: 'repair_unconfirmed',
  PERSIST_NOT_COMMITTED: 'persist_not_committed',
  FAILED_CREATE_CLEANUP_RELEASE_PENDING:
    'failed_create_cleanup_release_pending',
});

function isTerminalFailedCreateCleanupRemove(operation) {
  const precondition = operation?.[
    ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
  ];
  return operation?.type === OperationType.REMOVE &&
    operation.workflowStep === WORKFLOW_STEP.REMOVED &&
    operation.status === ReplicaStatus.REMOVED &&
    isFailedCreateCleanupToken(precondition?.cleanup_token) &&
    typeof precondition?.create_attempt_token === 'string' &&
    precondition.create_attempt_token.length > 0;
}

async function deliverFailedCreateCleanupRelease(owner, operation) {
  try {
    const precondition = operation[
      ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
    ];
    const {entityType, entityId} =
      assertCanonicalRebalancerEntityIdentity(operation);
    const target = `${operation.targetNodeId}/service/` +
      resolveOperationHandlerType(entityType);
    const request = {
      [ReplicaOperationField.TYPE]:
        ReplicaOperationMessageType.REMOVE_REPLICA,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.OPERATION_TYPE]: operation.type,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: operation.replicaId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
      [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
        precondition,
    };
    const outcome = classifyTransportDeliveryOutcome(
      await owner.deliverReplicaOperationRequest(
        operation,
        target,
        request,
        operation.targetNodeId,
      ),
    );
    return isDeliveredTransportDeliveryOutcome(outcome) &&
      outcome.status === ReplicaOperationResponseStatus.COMPLETED;
  } catch (_error) {
    return false;
  }
}

function armFailedCreateCleanupRelease(owner, operation) {
  if (!isTerminalFailedCreateCleanupRemove(operation)) return false;
  armTerminalTransitionRepair(
    owner,
    operation,
    TERMINAL_TRANSITION_REPAIR_CAUSE
      .FAILED_CREATE_CLEANUP_RELEASE_PENDING,
  );
  return true;
}

async function recoverFailedCreateCleanupReleaseDebt(owner) {
  let operations;
  try {
    operations = await owner.repository
      .queryTerminalFailedCreateCleanupOperations();
  } catch (error) {
    scheduleFailedCreateCleanupRecoveryScan(owner);
    throw error;
  }
  clearFailedCreateCleanupRecoveryScan(owner);
  let armed = 0;
  for (const operation of operations) {
    if (armFailedCreateCleanupRelease(owner, operation)) armed += 1;
  }
  return armed;
}

function clearFailedCreateCleanupRecoveryScan(owner) {
  const timer = owner.terminalTransitionRepairTimerByOperationId.get(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
  );
  if (timer) owner.clearTimeoutFn(timer);
  owner.terminalTransitionRepairTimerByOperationId.delete(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
  );
  owner.terminalTransitionRepairStateByOperationId.delete(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
  );
}

function scheduleFailedCreateCleanupRecoveryScan(owner) {
  if (owner.isShuttingDown || owner.terminalTransitionRepairTimerByOperationId
    .has(FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY)) return;
  const previous = owner.terminalTransitionRepairStateByOperationId.get(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
  );
  const attempt = previous ? previous.attempt + 1 : 0;
  owner.terminalTransitionRepairStateByOperationId.set(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
    {recoveryScan: true, attempt},
  );
  const timer = owner.setTimeoutFn(() => {
    owner.terminalTransitionRepairTimerByOperationId.delete(
      FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
    );
    return recoverFailedCreateCleanupReleaseDebt(owner).catch((error) => {
      owner.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_UNCONFIRMED,
        {operationId: FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
          error: error?.message || String(error)},
      );
    });
  }, resolveTerminalTransitionRepairDelayMs(attempt));
  // The startup debt scan remains level-triggered, but production's native
  // background timer must not become the sole reason an otherwise idle
  // process stays alive. Injected schedulers remain referenced so tests can
  // deterministically observe every backoff and callback.
  if (owner.usesNativeRetryTimers === true &&
      typeof timer?.unref === 'function') {
    timer.unref();
  }
  owner.terminalTransitionRepairTimerByOperationId.set(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
    timer,
  );
}

function resolveTerminalTransitionRepairDelayMs(attempt) {
  const exponential =
    TERMINAL_TRANSITION_REPAIR_RETRY_DELAY_MS *
    Math.pow(TERMINAL_TRANSITION_REPAIR_RETRY_BACKOFF_MULTIPLIER, attempt);
  return Math.min(
    TERMINAL_TRANSITION_REPAIR_RETRY_MAX_DELAY_MS,
    Math.max(1, Math.floor(exponential)),
  );
}

function buildTerminalTransitionRepairState(
  owner,
  existingState,
  projectedOperation,
  persistOptions,
  cause,
) {
  return {
    projectedOperation: existingState?.projectedOperation ||
      owner.cloneOperationSnapshot(projectedOperation),
    persistOptions: existingState?.persistOptions || persistOptions,
    cleanupRelease: Boolean(existingState?.cleanupRelease) || cause ===
      TERMINAL_TRANSITION_REPAIR_CAUSE
        .FAILED_CREATE_CLEANUP_RELEASE_PENDING,
    persistenceRepair: existingState ?
      Boolean(existingState.persistenceRepair) :
      cause !== TERMINAL_TRANSITION_REPAIR_CAUSE
        .FAILED_CREATE_CLEANUP_RELEASE_PENDING,
    attempt: existingState ? existingState.attempt + 1 : 0,
  };
}

function isTerminalTransitionRepairConfirmed(visibility) {
  return Boolean(
    visibility?.confirmationState ===
      REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED &&
      visibility?.operation,
  );
}

// The visibility confirmation compares the writer's OWN step/status/
// completedAt, so a different durable terminal never satisfies it — but a
// confirmation that lands on a different terminal row is still a confirmed
// terminal: this repair lost and must adopt the winner, not re-arm.
function resolveConfirmedVisibilityDifferentTerminal(owner, visibility) {
  const confirmedOperation = visibility?.operation;
  if (
    !confirmedOperation ||
    !owner.repository.isAuthoritativeOperationTerminal(confirmedOperation)
  ) {
    return false;
  }
  const state =
    owner.terminalTransitionRepairStateByOperationId.get(
      confirmedOperation.operationId,
    );
  if (!state?.projectedOperation) {
    return false;
  }
  return !owner.repository.isReplicaOperationVisibilitySatisfied(
    state.projectedOperation,
    confirmedOperation,
  );
}

function adoptConfirmedWinningTerminalIntoRepair(
  owner,
  operationId,
  heldState,
  winningOperation,
) {
  Object.assign(heldState.projectedOperation, {
    status: winningOperation.status,
    workflowStep: winningOperation.workflowStep,
    completedAt: winningOperation.completedAt,
    errorMessage: winningOperation.errorMessage,
  });
  owner.logger.error(
    REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_ABANDONED,
    {
      operationId,
      workflowStep: winningOperation?.workflowStep || null,
      partitionId: winningOperation?.partitionId || null,
      attempt: heldState.attempt,
    },
  );
  clearTerminalTransitionRepair(owner, operationId);
}

/**
 * Arm (or re-arm) the repair for one unconfirmed terminal transition. The
 * projected terminal operation is retained so later attempts re-assert the
 * exact state the owner committed.
 * @param {Object} owner - OperationWorkflowOwner instance.
 * @param {Object} projectedOperation - The terminal projection that committed.
 * @param {string} cause - TERMINAL_TRANSITION_REPAIR_CAUSE member.
 */
function armTerminalTransitionRepair(owner, projectedOperation, cause,
  persistOptions = {}) {
  const operationId = String(projectedOperation?.operationId || '').trim();
  if (operationId.length === 0 || owner.isShuttingDown) {
    return;
  }
  const existingState =
    owner.terminalTransitionRepairStateByOperationId.get(operationId);
  const state = buildTerminalTransitionRepairState(
    owner,
    existingState,
    projectedOperation,
    persistOptions,
    cause,
  );
  owner.terminalTransitionRepairStateByOperationId.set(operationId, state);
  if (owner.terminalTransitionRepairTimerByOperationId.has(operationId)) {
    return;
  }
  const delayMs = resolveTerminalTransitionRepairDelayMs(state.attempt);
  logTerminalTransitionRepairArmed(owner, projectedOperation, {
    operationId,
    cause,
    attempt: state.attempt,
    delayMs,
  });
  // The callback returns its promise so a deterministic test scheduler can
  // await the attempt; production setTimeout ignores the return value.
  const timerHandle = owner.setTimeoutFn(() => {
    owner.terminalTransitionRepairTimerByOperationId.delete(operationId);
    return runTerminalTransitionRepairAttempt(owner, operationId).catch(
      (error) => {
        owner.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_UNCONFIRMED,
          {
            operationId,
            error: error?.message || String(error),
          },
        );
        rearmTerminalTransitionRepairIfHeld(owner, operationId);
      },
    );
  }, delayMs);
  owner.terminalTransitionRepairTimerByOperationId.set(
    operationId,
    timerHandle,
  );
}

function logTerminalTransitionRepairArmed(
  owner,
  projectedOperation,
  {operationId, cause, attempt, delayMs},
) {
  owner.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_ARMED,
    {
      operationId,
      workflowStep: projectedOperation?.workflowStep || null,
      partitionId: projectedOperation?.partitionId || null,
      cause,
      attempt,
      delayMs,
    },
  );
}

function rearmTerminalTransitionRepairIfHeld(owner, operationId) {
  const state =
    owner.terminalTransitionRepairStateByOperationId.get(operationId);
  if (!state || owner.isShuttingDown) {
    return;
  }
  armTerminalTransitionRepair(
    owner,
    state.projectedOperation,
    TERMINAL_TRANSITION_REPAIR_CAUSE.REPAIR_UNCONFIRMED,
  );
}

/**
 * @param {Object} owner
 * @param {string|null} operationId
 */
function clearTerminalTransitionRepair(owner, operationId) {
  if (!operationId) {
    return;
  }
  const timerHandle =
    owner.terminalTransitionRepairTimerByOperationId.get(operationId);
  if (timerHandle) {
    owner.clearTimeoutFn(timerHandle);
    owner.terminalTransitionRepairTimerByOperationId.delete(operationId);
  }
  owner.terminalTransitionRepairStateByOperationId.delete(operationId);
}

/**
 * One repair attempt: re-assert the retained terminal projection and confirm
 * it became authoritatively visible. Runs under the operation's owner
 * single-flight key so it cannot race other owner work on the same operation.
 * @param {Object} owner
 * @param {string} operationId
 * @return {Promise<void>}
 */
async function runTerminalTransitionRepairAttempt(owner, operationId) {
  const state =
    owner.terminalTransitionRepairStateByOperationId.get(operationId);
  if (!state || owner.isShuttingDown || !owner.isInitialized) {
    return;
  }
  await owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(operationId),
    async () => {
      const heldState =
        owner.terminalTransitionRepairStateByOperationId.get(operationId);
      if (!heldState || owner.isShuttingDown) {
        return;
      }
      if (heldState.cleanupRelease && !heldState.persistenceRepair) {
        await runFailedCreateCleanupReleaseAttempt(
          owner,
          operationId,
          heldState,
        );
        return;
      }
      const repairAdmission = await admitReplaceTerminalRepair(owner,
        heldState.projectedOperation, heldState.persistOptions);
      if (!repairAdmission.admitted) {
        // The REPLACE owner decides this terminal again from fresh state;
        // the retained one is not re-asserted (R11).
        owner.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_ABANDONED,
          {operationId, workflowStep:
            heldState.projectedOperation?.workflowStep || null,
          partitionId: heldState.projectedOperation?.partitionId || null,
          attempt: heldState.attempt},
        );
        clearTerminalTransitionRepair(owner, operationId);
        return;
      }
      const persistResult = await owner.repository.persistOperationUpdate(
        heldState.projectedOperation,
        {
          ...repairAdmission.persistOptions,
          terminalTransition: true,
          confirmPersistence: false,
          disableSystemWriteSession: true,
          returnDisposition: true,
        },
      );
      // Lost the terminal CAS: a DIFFERENT durable terminal already won.
      // Adopt the winner into the retained projection and stand the repair
      // down — re-arming here would oscillate two owners' terminal states
      // forever (audit finding 6).
      if (
        persistResult?.disposition ===
        REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED
      ) {
        if (persistResult.operation) {
          Object.assign(heldState.projectedOperation, {
            status: persistResult.operation.status,
            workflowStep: persistResult.operation.workflowStep,
            completedAt: persistResult.operation.completedAt,
            errorMessage: persistResult.operation.errorMessage,
          });
        }
        owner.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_ABANDONED,
          {
            operationId,
            workflowStep: heldState.projectedOperation?.workflowStep || null,
            partitionId: heldState.projectedOperation?.partitionId || null,
            attempt: heldState.attempt,
          },
        );
        clearTerminalTransitionRepair(owner, operationId);
        return;
      }
      if (
        persistResult === false ||
        persistResult?.persisted === false
      ) {
        await resolveRefusedTerminalTransitionRepairPersist(
          owner,
          operationId,
          heldState,
        );
        return;
      }
      const visibility =
        await owner.repository.confirmReplicaOperationPersistence(
          heldState.projectedOperation,
        );
      if (isTerminalTransitionRepairConfirmed(visibility)) {
        if (
          resolveConfirmedVisibilityDifferentTerminal(owner, visibility)
        ) {
          // The confirmed row is a DIFFERENT terminal than the retained
          // projection (never satisfies the visibility comparison): this
          // repair lost — adopt the winner and stand down.
          adoptConfirmedWinningTerminalIntoRepair(
            owner,
            operationId,
            heldState,
            visibility.operation,
          );
          return;
        }
        if (heldState.cleanupRelease) {
          heldState.persistenceRepair = false;
          heldState.projectedOperation = visibility.operation;
          if (!await deliverFailedCreateCleanupRelease(
            owner,
            visibility.operation,
          )) {
            rearmTerminalTransitionRepairIfHeld(owner, operationId);
            return;
          }
        }
        owner.logger.info(
          REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_SUCCEEDED,
          {
            operationId,
            workflowStep: heldState.projectedOperation?.workflowStep || null,
            partitionId: heldState.projectedOperation?.partitionId || null,
            attempt: heldState.attempt,
          },
        );
        clearTerminalTransitionRepair(owner, operationId);
        return;
      }
      rearmTerminalTransitionRepairIfHeld(owner, operationId);
    },
  );
}

async function runFailedCreateCleanupReleaseAttempt(
  owner,
  operationId,
  heldState,
) {
  const authoritative = await owner.repository
    .queryReplicaOperationPersistenceAuthorityOperation(
      heldState.projectedOperation,
    );
  if (!isTerminalFailedCreateCleanupRemove(authoritative) ||
      !await deliverFailedCreateCleanupRelease(owner, authoritative)) {
    rearmTerminalTransitionRepairIfHeld(owner, operationId);
    return;
  }
  owner.logger.info(
    REBALANCE_COORDINATOR_LOG_MSG.FAILED_CREATE_CLEANUP_RELEASE_SUCCEEDED,
    {
      operationId,
      workflowStep: authoritative.workflowStep,
      partitionId: authoritative.partitionId,
      targetNodeId: authoritative.targetNodeId,
      attempt: heldState.attempt,
    },
  );
  clearTerminalTransitionRepair(owner, operationId);
}

/**
 * A refused persist is NOT proof a different terminal state won: the
 * zero-change arm also returns false against a readable-but-stale
 * NON-terminal row (the CL-017 read/apply divergence family). Abandon only
 * when the authoritative row is durably terminal (any terminal state frees
 * the budget and admission lanes); otherwise the ghost still exists and the
 * repair must keep trying. (The TERMINAL_ADOPTED disposition handles the
 * lost-CAS case before this arm runs; this arm discriminates the residual
 * refused persists.)
 * @param {Object} owner
 * @param {string} operationId
 * @param {Object} heldState
 * @return {Promise<void>}
 */
async function resolveRefusedTerminalTransitionRepairPersist(
  owner,
  operationId,
  heldState,
) {
  const authoritativeOperation =
    await owner.repository.queryReplicaOperationPersistenceAuthorityOperation(
      heldState.projectedOperation,
    );
  if (
    authoritativeOperation &&
    owner.repository.isAuthoritativeOperationTerminal(authoritativeOperation)
  ) {
    // A different durable terminal won: adopt the winner into the retained
    // projection and stand the repair down (never re-assert the loser).
    Object.assign(heldState.projectedOperation, {
      status: authoritativeOperation.status,
      workflowStep: authoritativeOperation.workflowStep,
      completedAt: authoritativeOperation.completedAt,
      errorMessage: authoritativeOperation.errorMessage,
    });
    owner.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_ABANDONED,
      {
        operationId,
        workflowStep: authoritativeOperation.workflowStep || null,
        partitionId: heldState.projectedOperation?.partitionId || null,
        attempt: heldState.attempt,
      },
    );
    clearTerminalTransitionRepair(owner, operationId);
    return;
  }
  rearmTerminalTransitionRepairIfHeld(owner, operationId);
}

export {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armFailedCreateCleanupRelease,
  armTerminalTransitionRepair,
  clearTerminalTransitionRepair,
  recoverFailedCreateCleanupReleaseDebt,
  runTerminalTransitionRepairAttempt,
};
