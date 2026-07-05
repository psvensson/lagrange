import {TIME_MS} from '../constants/index.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
} from './replica-operation-repository.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  REBALANCE_COORDINATOR_LOG_MSG,
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
const TERMINAL_TRANSITION_REPAIR_CAUSE = Object.freeze({
  CONFIRMATION_FAILED: 'confirmation_failed',
  CONFIRMATION_DEFERRED: 'confirmation_deferred',
  REPAIR_UNCONFIRMED: 'repair_unconfirmed',
});

function resolveTerminalTransitionRepairDelayMs(attempt) {
  const exponential =
    TERMINAL_TRANSITION_REPAIR_RETRY_DELAY_MS *
    Math.pow(TERMINAL_TRANSITION_REPAIR_RETRY_BACKOFF_MULTIPLIER, attempt);
  return Math.min(
    TERMINAL_TRANSITION_REPAIR_RETRY_MAX_DELAY_MS,
    Math.max(1, Math.floor(exponential)),
  );
}

function isTerminalTransitionRepairConfirmed(visibility) {
  return Boolean(
    visibility?.confirmationState ===
      REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED &&
      visibility?.operation,
  );
}

/**
 * Arm (or re-arm) the repair for one unconfirmed terminal transition. The
 * projected terminal operation is retained so later attempts re-assert the
 * exact state the owner committed.
 * @param {Object} owner - OperationWorkflowOwner instance.
 * @param {Object} projectedOperation - The terminal projection that committed.
 * @param {string} cause - TERMINAL_TRANSITION_REPAIR_CAUSE member.
 */
function armTerminalTransitionRepair(owner, projectedOperation, cause) {
  const operationId = String(projectedOperation?.operationId || '').trim();
  if (operationId.length === 0 || owner.isShuttingDown) {
    return;
  }
  const existingState =
    owner.terminalTransitionRepairStateByOperationId.get(operationId);
  const attempt = existingState ? existingState.attempt + 1 : 0;
  owner.terminalTransitionRepairStateByOperationId.set(operationId, {
    projectedOperation:
      existingState?.projectedOperation ||
      owner.cloneOperationSnapshot(projectedOperation),
    attempt,
  });
  if (owner.terminalTransitionRepairTimerByOperationId.has(operationId)) {
    return;
  }
  const delayMs = resolveTerminalTransitionRepairDelayMs(attempt);
  logTerminalTransitionRepairArmed(owner, projectedOperation, {
    operationId,
    cause,
    attempt,
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
      const persisted = await owner.repository.persistOperationUpdate(
        heldState.projectedOperation,
        {
          terminalTransition: true,
          confirmPersistence: false,
          disableSystemWriteSession: true,
        },
      );
      if (persisted === false) {
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

/**
 * A refused persist is NOT proof a different terminal state won: the
 * zero-change arm also returns false against a readable-but-stale
 * NON-terminal row (the CL-017 read/apply divergence family). Abandon only
 * when the authoritative row is durably terminal (any terminal state frees
 * the budget and admission lanes); otherwise the ghost still exists and the
 * repair must keep trying.
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
    await owner.repository.queryAuthoritativeOperationById(operationId, {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      requireOwnerRpcRead: false,
    });
  if (
    authoritativeOperation &&
    owner.repository.isAuthoritativeOperationTerminal(authoritativeOperation)
  ) {
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
  rearmTerminalTransitionRepairIfHeld(owner, operationId);
}

export {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armTerminalTransitionRepair,
  clearTerminalTransitionRepair,
  runTerminalTransitionRepairAttempt,
};
