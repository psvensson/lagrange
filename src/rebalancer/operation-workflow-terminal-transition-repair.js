import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {isTerminalTransitionOutcomeSettled} from './operation-workflow-terminal-reservation-release.js';
import {readStateField} from '../utils/state-field-read.js';
import {deliveryTransportOf, deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
import {TIME_MS} from '../constants/index.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
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
  ReplicaStatus,
  WORKFLOW_STEP,
  isCompletedReplicaOperationAnswer,
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
  TERMINAL_RELEASE_PENDING: 'terminal_release_pending',
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
    const deliveryEnvelope = await owner.deliverReplicaOperationRequest(
      operation,
      target,
      request,
      operation.targetNodeId,
    );
    const transport = deliveryTransportOf(deliveryEnvelope);
    const answer = deliveryAnswerOf(deliveryEnvelope);
    return isDeliveredTransportDeliveryOutcome(transport) &&
      isCompletedReplicaOperationAnswer(answer);
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

function isFailedCreateCleanupRecoveryOwnerCurrent(
  owner,
  ownershipFenceEpoch,
) {
  return owner.isInitialized && !owner.isShuttingDown &&
    Number.isInteger(ownershipFenceEpoch) &&
    typeof owner.getOperationOwnershipFenceEpoch === 'function' &&
    owner.getOperationOwnershipFenceEpoch() === ownershipFenceEpoch;
}

function reportFailedCreateCleanupRecoveryQueryFailure(options, error) {
  if (typeof options.onQueryFailure === 'function') {
    options.onQueryFailure(error);
  }
}

async function runFailedCreateCleanupReleaseRecoveryScan(
  owner,
  ownershipFenceEpoch,
  options,
) {
  if (!isFailedCreateCleanupRecoveryOwnerCurrent(
    owner,
    ownershipFenceEpoch,
  )) return 0;
  let operations;
  try {
    operations = await owner.repository
      .queryTerminalFailedCreateCleanupOperations();
  } catch (error) {
    if (!isFailedCreateCleanupRecoveryOwnerCurrent(
      owner,
      ownershipFenceEpoch,
    )) return 0;
    scheduleFailedCreateCleanupRecoveryScan(owner, ownershipFenceEpoch);
    reportFailedCreateCleanupRecoveryQueryFailure(options, error);
    throw error;
  }
  if (!isFailedCreateCleanupRecoveryOwnerCurrent(
    owner,
    ownershipFenceEpoch,
  )) return 0;
  clearFailedCreateCleanupRecoveryScan(owner);
  let armed = 0;
  for (const operation of operations) {
    if (armFailedCreateCleanupRelease(owner, operation)) armed += 1;
  }
  return armed;
}

function recoverFailedCreateCleanupReleaseDebt(owner, options = {}) {
  const ownershipFenceEpoch = Number.isInteger(
    options.operationOwnershipFenceEpoch,
  ) ?
    options.operationOwnershipFenceEpoch :
    owner.getOperationOwnershipFenceEpoch();
  const ownerKey = owner.getOperationOwnerSingleFlightKey(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
  );
  return owner.operationWorkflowRunExclusive(
    ownerKey,
    () => runFailedCreateCleanupReleaseRecoveryScan(
      owner,
      ownershipFenceEpoch,
      options,
    ),
  );
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

function unrefNativeRetryTimer(owner, timer) {
  if (owner.usesNativeRetryTimers === true &&
      typeof timer?.unref === 'function') {
    timer.unref();
  }
}

function scheduleFailedCreateCleanupRecoveryScan(
  owner,
  ownershipFenceEpoch,
) {
  if (!isFailedCreateCleanupRecoveryOwnerCurrent(owner, ownershipFenceEpoch) ||
      owner.terminalTransitionRepairTimerByOperationId
        .has(FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY)) return;
  const previous = owner.terminalTransitionRepairStateByOperationId.get(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
  );
  const attempt = previous ? previous.attempt + 1 : 0;
  owner.terminalTransitionRepairStateByOperationId.set(
    FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
    {
      recoveryScan: true,
      attempt,
      operationOwnershipFenceEpoch: ownershipFenceEpoch,
    },
  );
  const timer = owner.setTimeoutFn(() => {
    owner.terminalTransitionRepairTimerByOperationId.delete(
      FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
    );
    return recoverFailedCreateCleanupReleaseDebt(owner, {
      operationOwnershipFenceEpoch: ownershipFenceEpoch,
      onQueryFailure(error) {
        owner.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_REPAIR_UNCONFIRMED,
          {operationId: FAILED_CREATE_CLEANUP_RECOVERY_SCAN_KEY,
            error: error?.message || String(error)},
        );
      },
    }).catch(() => {});
  }, resolveTerminalTransitionRepairDelayMs(attempt));
  // The startup debt scan remains level-triggered, but production's native
  // background timer must not become the sole reason an otherwise idle
  // process stays alive. Injected schedulers remain referenced so tests can
  // deterministically observe every backoff and callback.
  unrefNativeRetryTimer(owner, timer);
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
  const releaseOnly = cause === TERMINAL_TRANSITION_REPAIR_CAUSE.TERMINAL_RELEASE_PENDING;
  const cleanupOnly = cause ===
    TERMINAL_TRANSITION_REPAIR_CAUSE.FAILED_CREATE_CLEANUP_RELEASE_PENDING;
  const retainRelease = existingState?.phase ===
    TERMINAL_TRANSITION_REPAIR_CAUSE.TERMINAL_RELEASE_PENDING;
  return {
    projectedOperation: releaseOnly ? owner.cloneOperationSnapshot(projectedOperation) :
      existingState?.projectedOperation || owner.cloneOperationSnapshot(projectedOperation),
    persistOptions: releaseOnly || retainRelease ? {} :
      existingState?.persistOptions || persistOptions,
    phase: releaseOnly || retainRelease ?
      TERMINAL_TRANSITION_REPAIR_CAUSE.TERMINAL_RELEASE_PENDING :
      TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED,
    cleanupRelease: Boolean(existingState?.cleanupRelease) || cleanupOnly,
    persistenceRepair: !releaseOnly && !retainRelease && !cleanupOnly,
    attempt: existingState ? existingState.attempt + 1 : 0,
  };
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
  unrefNativeRetryTimer(owner, timerHandle);
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
      workflowStep: readStateField(projectedOperation?.workflowStep),
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
      const observation = await owner.repository.observeOperationTransition(
        heldState.projectedOperation, heldState.projectedOperation.workflowStep,
        {terminalTransition: true, exactRequest: true});
      if (observation.deferredOutcome) {
        rearmTerminalTransitionRepairIfHeld(owner, operationId);
        return;
      }
      if (observation.outcome) {
        const outcome = buildOperationTransitionOutcome(observation.outcome);
        if (isTerminalTransitionOutcomeSettled(outcome)) {
          await owner.releaseDurableTerminalOperation(heldState.projectedOperation, outcome);
          return;
        }
      }
      // A known terminal release debt is never converted into another write,
      // even if its current read is unavailable or a stale projection is seen.
      if (heldState.phase === TERMINAL_TRANSITION_REPAIR_CAUSE.TERMINAL_RELEASE_PENDING) {
        rearmTerminalTransitionRepairIfHeld(owner, operationId);
        return;
      }
      const repairAdmission = await admitReplaceTerminalRepair(owner,
        heldState.projectedOperation, heldState.persistOptions);
      if (!repairAdmission.admitted) {
        rearmTerminalTransitionRepairIfHeld(owner, operationId);
        return;
      }
      const requestedOperation = structuredClone(heldState.projectedOperation);
      const persistResult = await owner.repository.persistOperationUpdate(
        heldState.projectedOperation, {
          ...repairAdmission.persistOptions,
          terminalTransition: true,
          confirmPersistence: false,
          disableSystemWriteSession: true,
        });
      const outcome = buildOperationTransitionOutcome(persistResult,
        {repository: owner.repository, requestedOperation});
      if (!isTerminalTransitionOutcomeSettled(outcome)) {
        rearmTerminalTransitionRepairIfHeld(owner, operationId);
        return;
      }
      await owner.releaseDurableTerminalOperation(heldState.projectedOperation, outcome);
      await owner.confirmCommittedTransitionPersistence(outcome.operation,
        {terminalTransitionRepair: true, repairPersistOptions: heldState.persistOptions});
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

export {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armFailedCreateCleanupRelease,
  armTerminalTransitionRepair,
  clearTerminalTransitionRepair,
  recoverFailedCreateCleanupReleaseDebt,
  runTerminalTransitionRepairAttempt,
};
