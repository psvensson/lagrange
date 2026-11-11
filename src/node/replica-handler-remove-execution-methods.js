import {readStateField} from '../utils/state-field-read.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {isFailedCreateRemoveToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {raftRsLifecycleAdministration} from
  '../raft/raft-rs-lifecycle-administration.js';
import {
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  './replica-removal-consensus-exit.js';
import {
  awaitRemovalConsensusExit,
  leaveConsensus,
  requireRemovalParticipantCustodySettled,
  requireRemovalTeardownAuthority,
} from './replica-removal-participation.js';
import {
  beginRemovalExecution,
  endRemovalExecution,
  runRemovalCancellationCheckpoint,
} from './replica-removal-cancellation.js';
import {REPLICA_REMOVAL_CANCEL_ANSWER} from
  './replica-removal-cancel-contract.js';
import {
  REPLICA_LEADER_CLEAR_DEFERRED,
  REPLICA_REMOVAL_COMPLETION_DEFERRED,
  buildFailedRemovalOutcome,
  removalRowDeleteDeferred,
  replicaAbsentNotByOperationError,
  retryableRemovalDebtError,
} from './replica-removal-debt-errors.js';
import {GROUP_RETIREMENT_REASON} from
  '../partition/group-retirement-evidence.js';
import {REMOVAL_AUTHORITY_KIND} from './replica-state-machine-recovery.js';
import {REMOVAL_SERVING_NOT_HOSTED, REMOVAL_SERVING_STATE} from
  '../partition/partition-service-removal-serving-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_REMOVE_EXECUTION_REASON = Object.freeze({
  DURABLE_REMOVE_CLEANUP_COMPLETE: 'durable_remove_cleanup_complete',
});
// Why a removal deferred before its durable retiring row (logged with the
// deferral): its REMOVING write did not become durable, or its replica's
// connection was released by something other than this removal.
const REMOVAL_DEFERRAL_CAUSE = Object.freeze({
  RETIRING_ROW_NOT_DURABLE: 'retiring_row_not_durable',
  SERVING_CLOSED_OUTSIDE_REMOVAL: 'serving_closed_outside_removal',
});
async function bindAuthoritativeRemovingGenerationOrThrow(
  handler,
  replicaId,
  partitionId,
) {
  const stateMachine = handler.replicaStateMachine;
  if (typeof stateMachine?.bindAuthoritativeRemovalAuthority !==
      REPLICA_HANDLER_TYPEOF.FUNCTION) {
    throw retryableRemovalDebtError(
      REPLICA_LEADER_CLEAR_DEFERRED,
      `Replica REMOVING authority unavailable for ${replicaId}`,
    );
  }
  const authority = await stateMachine.bindAuthoritativeRemovalAuthority(
    replicaId,
    {
      partitionId,
      nodeId: handler.nodeId,
    },
  );
  if (authority?.kind !== ReplicaStatus.REMOVING) {
    throw retryableRemovalDebtError(
      REPLICA_LEADER_CLEAR_DEFERRED,
      `Replica REMOVING generation unavailable for ${replicaId}`,
    );
  }
  return authority;
}

async function settleCanonicalLeaderClearOrThrow(
  handler,
  replicaId,
  partitionId,
) {
  if (typeof handler.replicaStateMachine?.settleCanonicalLeaderClearDebt !==
      REPLICA_HANDLER_TYPEOF.FUNCTION) {
    throw retryableRemovalDebtError(
      REPLICA_LEADER_CLEAR_DEFERRED,
      `Replica leader-clear owner unavailable for ${replicaId}`,
    );
  }
  await bindAuthoritativeRemovingGenerationOrThrow(
    handler,
    replicaId,
    partitionId,
  );
  const settled = await handler.replicaStateMachine
    .settleCanonicalLeaderClearDebt(replicaId);
  if (settled === false) {
    throw retryableRemovalDebtError(
      REPLICA_LEADER_CLEAR_DEFERRED,
      `Replica canonical leader clear deferred for ${replicaId}`,
    );
  }
  return bindAuthoritativeRemovingGenerationOrThrow(
    handler,
    replicaId,
    partitionId,
  );
}

async function takeoverRemovingRowForCleanupOrThrow(
  handler,
  replicaId,
  authority,
  guard,
  reason,
) {
  if (!await guard.requireRemoving() || !guard.isCurrent()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  const admissionClosed = await handler.getReplicaCreateAdmissionOwner()
    .closeForLifecycle(authority.replicaState);
  if (admissionClosed !== true || !guard.isCurrent() ||
      guard.beginExactDelete() !== true) {
    throw removalRowDeleteDeferred(replicaId);
  }
  const cleanupAuthority = await handler.getReplicaCleanupTombstoneOwner()
    .takeoverRemoving(authority, reason);
  if (!cleanupAuthority || !guard.isCurrent()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  return cleanupAuthority;
}

async function completeCleanupTombstoneOrThrow(
  handler,
  replicaId,
  partitionId,
  service,
  cleanupAuthority,
  guard,
) {
  const owner = handler.getReplicaCleanupTombstoneOwner();
  if (!await owner.requireCurrent(cleanupAuthority) || !guard.isCurrent()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  await handler.cleanupRemovedReplicaLocalRuntime(
    replicaId,
    partitionId,
    service,
    cleanupAuthority,
  );
  if (isFailedCreateRemoveToken(cleanupAuthority.ownerToken)) {
    const completionReceipt = await owner.markComplete(
      cleanupAuthority,
      {artifactsAbsent: true},
    );
    if (!completionReceipt ||
        !await guard.confirmCleanupComplete(completionReceipt)) {
      throw removalRowDeleteDeferred(replicaId);
    }
    return true;
  }
  if (!await owner.requireCurrent(cleanupAuthority) ||
      !await owner.release(cleanupAuthority, {artifactsAbsent: true}) ||
      !await guard.confirmDeleted()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  return true;
}

async function runRemovalEffectsOrThrow(
  handler,
  replicaId,
  authority,
  action,
  onComplete,
  context,
) {
  const applied = await handler.replicaStateMachine
    .completeDurableRemovalWithAuthority(
      replicaId,
      authority,
      action,
      onComplete,
      context,
    );
  if (applied !== true) throw removalRowDeleteDeferred(replicaId);
  return true;
}

async function performReplicaRemoval(handler, request, service, lifecycle,
  execution) {
  const {operationId, partitionId, replicaId} = request;
  // A group retired as a unit records its retirement as such - on the
  // REMOVING row (the row-driven reconcile proposes no conf change for it)
  // and on the durable lifecycle row.
  const reason = request.groupRetirement?.retire === true ?
    GROUP_RETIREMENT_REASON : request.reason;
  handler.throwIfShuttingDown();
  const serving = await handler.waitForReplicaServingDrain(service);
  // A released connection proves nothing about participant custody (its
  // durable PREPARED reservation is read from the file at the irreversible
  // boundary below). Released before this removal's retiring row is durable
  // (node shutdown, a failed initialization), the removal does not cross
  // its point of no return: shutdown ends it, otherwise it defers before any
  // durable row, the replica keeping its status.
  if (serving.state === REMOVAL_SERVING_STATE.CLOSED &&
      execution.retiringRowDurable !== true) {
    handler.throwIfShuttingDown();
    handler.deferReplicaRemovalWithoutDurableRow({operationId, replicaId,
      partitionId, service, removalLifecycleSnapshot: lifecycle,
      cause: REMOVAL_DEFERRAL_CAUSE.SERVING_CLOSED_OUTSIDE_REMOVAL});
    return false;
  }
  // A cancellation asked before the retiring row is settled here.
  const cancelled = await runRemovalCancellationCheckpoint(handler,
    execution.removal, {retiringRowDurable: execution.retiringRowDurable});
  if (cancelled?.answer === REPLICA_REMOVAL_CANCEL_ANSWER.CANCELLED ||
      cancelled?.answer === REPLICA_REMOVAL_CANCEL_ANSWER.NOT_IN_PROGRESS) {
    return false;
  }
  const retiringRow = await handler.publishReplicaRetiringRow({
    operationId,
    replicaId,
    partitionId,
    service,
    removalLifecycleSnapshot: lifecycle,
    triggerReason: request.groupRetirement?.retire === true ?
      GROUP_RETIREMENT_REASON : null,
  });
  if (retiringRow.deferred) {
    handler.deferReplicaRemovalWithoutDurableRow({operationId, replicaId,
      partitionId, service, removalLifecycleSnapshot: lifecycle,
      cause: REMOVAL_DEFERRAL_CAUSE.RETIRING_ROW_NOT_DURABLE});
    return false;
  }
  execution.retiringRowDurable = true;
  const exit = await leaveConsensus(handler, request, service,
    execution.removal);
  handler.throwIfShuttingDown();
  if (exit.reason === REPLICA_CONSENSUS_EXIT_REASON.CANCELLED) {
    return false;
  }
  // Nothing local retires without exact evidence (2026-11-11): its applied
  // removal, its group's retirement, or no consensus record to retire; and
  // nothing irreversible while participant custody is held or unknown.
  await requireRemovalTeardownAuthority(handler, request, exit);
  requireRemovalParticipantCustodySettled(handler, request, service);
  const authority = await settleCanonicalLeaderClearOrThrow(
    handler,
    replicaId,
    partitionId,
  );
  await runRemovalEffectsOrThrow(
    handler,
    replicaId,
    authority,
    async (guard) => {
      if (!await guard.requireRemoving() || !guard.isCurrent()) {
        throw removalRowDeleteDeferred(replicaId);
      }
      // Retire exactly the runtime this removal owns (the captured service's
      // port), never whatever runtime now serves the reused logical name;
      // a group retirement records its verified evidence with the row.
      await raftRsLifecycleAdministration.retireReplica(
        replicaId,
        reason || REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
        {groupId: partitionId, runtime: service?.raft ?? null,
          evidence: request.groupRetirement?.retire === true ?
            request.groupRetirementEvidence : null},
      );
      // A group retired as a unit: its member-owned tombstone is durable
      // before the replica database (and the lifecycle row in it) is
      // deleted; a failed write keeps the database.
      if (request.groupRetirement?.retire === true) {
        handler.recordGroupRetiredTombstone({partitionId, replicaId,
          evidence: request.groupRetirementEvidence});
      }
      const cleanupAuthority = await takeoverRemovingRowForCleanupOrThrow(
        handler,
        replicaId,
        authority,
        guard,
        reason,
      );
      try {
        await completeCleanupTombstoneOrThrow(
          handler,
          replicaId,
          partitionId,
          service,
          cleanupAuthority,
          guard,
        );
        execution.serviceRowRemoved = true;
      } catch (error) {
        execution.cleanupError = error;
        handler.logger.warn(
          REPLICA_HANDLER_LOG_MSG.LOCAL_CLEANUP_RETRY_REQUIRED,
          {replicaId, partitionId, nodeId: handler.nodeId,
            error: error.message},
        );
        throw error;
      }
      return execution.serviceRowRemoved && await guard.requireComplete();
    },
    () => {
      if (!execution.cleanupError) handler.localServices.delete(replicaId);
      handler.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: execution.cleanupError ? service : null,
        removedByOperationId: execution.cleanupError ? null : operationId,
      });
    },
    {
      partitionId,
      nodeId: handler.nodeId,
      reason: REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
      serviceId: replicaId,
    },
  );
  return true;
}

function reportReplicaRemovalSuccess(handler, request, cleanupError) {
  const {operationId, partitionId, replicaId, reason} = request;
  if (operationId) handler.inProgressOperations.delete(operationId);
  handler.emitExecutorOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
    operationId,
    WORKFLOW_STEP.REMOVED,
    {replicaId},
  );
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_COMPLETED, {
    operationId,
    replicaId,
    partitionId,
    reason,
    nodeId: handler.nodeId,
    cleanupDeferred: cleanupError !== null,
  });
  handler.emit(REPLICA_HANDLER_EVENT.REMOVED, {
    operationId,
    replicaId,
    partitionId,
    reason,
    nodeId: handler.nodeId,
  });
}

async function handleReplicaRemovalFailure(handler, request, service,
  execution, error) {
  const {operationId, partitionId, replicaId} = request;
  handler.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
    operationId, replicaId, partitionId, error: error.message,
    stack: error.stack,
  });
  handler.emitExecutorOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
    operationId,
    WORKFLOW_STEP.FAILED,
    buildFailedRemovalOutcome(replicaId, error),
  );
  if (!execution.serviceRowRemoved) {
    if (!execution.retiringRowDurable) {
      try {
        await handler.persistReplicaStatusWithRetry(
          replicaId,
          ReplicaStatus.FAILED,
          {partitionId, errorMessage: error.message},
        );
      } catch (statusError) {
        if (!isRetryableControlPlaneError(statusError)) throw statusError;
        handler.logger.warn(
          REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED_STATUS_WRITE_DEFERRED,
          {operationId, replicaId, partitionId, nodeId: handler.nodeId,
            error: statusError.message},
        );
      }
    }
    handler.setLocalReplica(replicaId, {
      replicaId,
      partitionId,
      status: execution.retiringRowDurable ?
        ReplicaStatus.REMOVING : ReplicaStatus.FAILED,
      service,
    });
  }
  if (operationId) handler.inProgressOperations.delete(operationId);
  handler.emit(REPLICA_HANDLER_EVENT.REMOVAL_FAILED, {
    operationId, replicaId, partitionId, error: error.message,
    nodeId: handler.nodeId,
  });
}

// The replica's durable lifecycle row, from the partition database file its
// port opened.
function readReplicaLifecycleFile(handler, partitionId, replicaId) {
  return raftRsLifecycleAdministration.readReplicaLifecycle(
    handler.getPartitionDbPath(partitionId, replicaId), partitionId,
    replicaId);
}

function assignReplicaHandlerRemoveExecutionMethods(ReplicaHandler) {
  class ReplicaHandlerRemoveExecutionMethods {
    /**
     * One replica's durable raft-rs lifecycle row, read from the partition
     * database its port opened (it survives a restart that dropped the
     * replica from this node's tracking).
     * @param {string} partitionId - The group.
     * @param {string} replicaId - The replica identity.
     * @return {Object} Frozen {state, reason}.
     * @private
     */
    readReplicaDurableLifecycle(partitionId, replicaId) {
      return readReplicaLifecycleFile(this, partitionId, replicaId);
    }

    /**
     * The lifecycle administration's verdicts on one durable lifecycle read:
     * the read itself plus retired, groupRetired (retired with its whole
     * group), absent (no row) and holdsRow. Never a verdict from absence.
     * @param {Object} lifecycle - readReplicaDurableLifecycle's answer.
     * @return {Object} Frozen read with its verdicts.
     * @private
     */
    lifecycleVerdictsOf(lifecycle) {
      const admin = raftRsLifecycleAdministration;
      return Object.freeze({...lifecycle, retired: admin.isRetired(lifecycle),
        groupRetired: admin.isRetiredFor(lifecycle, GROUP_RETIREMENT_REASON),
        absent: admin.isAbsent(lifecycle), holdsRow: admin.holdsRow(lifecycle)});
    }

    /**
     * Raise the partition-owned transaction admission fence synchronously,
     * before REMOVE_REPLICA returns an accepted status. This gives acceptance
     * one meaning: no new transaction can enter the retiring runtime.
     * @param {string} replicaId
     * @param {Object|null} [replica]
     * @return {Object|null}
     * @private
     */
    fenceReplicaServingAdmissionForRemoval(replicaId, replica = null) {
      const service = replica?.service || this.getTrackedService(replicaId);
      if (service) service.fenceServingAdmissionForRemoval();
      return service || null;
    }

    /**
     * Let transactions admitted before the removal fence finish under their
     * existing owner before deleting the routable service row or runtime.
     * @param {Object|null} service
     * @return {Promise<Object>} A named REMOVAL_SERVING_STATE answer.
     * @private
     */
    async waitForReplicaServingDrain(service) {
      return service ? service.waitForRemovalServingDrain() :
        REMOVAL_SERVING_NOT_HOSTED;
    }

    /**
     * Build one canonical snapshot for REMOVE execution.
     * FAILED is a prior observation, never deletion authority: it enters the
     * same durable REMOVING protocol as every other lifecycle state.
     * @param {string} replicaId
     * @return {Object}
     * @private
     */
    buildReplicaRemovalLifecycleSnapshot(replicaId) {
      const trackedState =
        typeof this.replicaStateMachine?.getState ===
          REPLICA_HANDLER_TYPEOF.FUNCTION ?
          this.replicaStateMachine.getState(replicaId) :
          null;
      const trackedStatus =
        typeof trackedState === REPLICA_HANDLER_TYPEOF.STRING ?
          trackedState :
          typeof trackedState?.state === REPLICA_HANDLER_TYPEOF.STRING ?
            trackedState.state :
            null;
      const localReplica = this.getLocalReplica(replicaId);
      const cachedServiceRow =
        this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId) ||
        null;
      const cachedStatus = readStateField(cachedServiceRow?.status);
      const localStatus = readStateField(localReplica?.status);
      const currentStatus =
        trackedStatus ||
        localStatus ||
        cachedStatus ||
        null;
      const durableStatus = trackedStatus || cachedStatus;
      return Object.freeze({
        trackedState,
        trackedStatus,
        localStatus,
        cachedStatus,
        cachedServiceRow,
        currentStatus,
        skipRemovingStatusWrite:
          durableStatus === ReplicaStatus.REMOVING,
        retiringRowDurable: durableStatus === ReplicaStatus.REMOVING,
      });
    }
    /**
     * Publish the replica's retiring row (REMOVING): the signal on which the
     * group's leader proposes its RemoveNode. A replica whose row already
     * reads REMOVING has already published it.
     * @param {Object} context - {operationId, replicaId, partitionId,
     *   service, removalLifecycleSnapshot}.
     * @return {Promise<Object>} {skipRemovingStatusWrite, deferred}; deferred
     *   when the REMOVING row could not be made durable.
     * @private
     */
    async publishReplicaRetiringRow({operationId, replicaId, partitionId,
      service: _service, removalLifecycleSnapshot, triggerReason = null}) {
      if (removalLifecycleSnapshot.skipRemovingStatusWrite === true) {
        return {
          skipRemovingStatusWrite: true,
          deferred: false,
        };
      }
      try {
        await this.persistReplicaStatusWithRetry(
          replicaId,
          ReplicaStatus.REMOVING,
          triggerReason === null ? {partitionId} : {partitionId, triggerReason},
        );
        return {skipRemovingStatusWrite: false,
          deferred: false};
      } catch (error) {
        if (!isRetryableControlPlaneError(error)) {
          throw error;
        }
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_STATUS_WRITE_DEFERRED, {
          operationId,
          replicaId,
          partitionId,
          nodeId: this.nodeId,
          error: error.message,
        });
        return {skipRemovingStatusWrite: false,
          deferred: true};
      }
    }
    /**
     * A removal effect never proceeds without a durable REMOVING row (lead
     * ruling, as the REPLACE's durable intent): a REMOVING write that
     * exhausted its retry on a retryable control-plane failure defers the
     * REMOVE typed - the status-write deferral family (CREATE's too): no
     * executor outcome, so the operation stays non-terminal and its durable
     * owner re-dispatches it; the in-progress record is cleared and the
     * local status is the durable one again. Nothing waits and nothing
     * retires: the port stays live and the replica a full participant (the
     * serving fence raised at acceptance stays, being irreversible). A
     * removal whose replica's connection was released by something other
     * than this removal (it holds no durable retiring row yet) defers the
     * same way: nothing proves no PREPARED participant is held there.
     * @param {Object} context - {operationId, replicaId, partitionId,
     *   service, removalLifecycleSnapshot, cause}: cause is a
     *   REMOVAL_DEFERRAL_CAUSE.
     * @private
     */
    deferReplicaRemovalWithoutDurableRow({operationId, replicaId,
      partitionId, service, removalLifecycleSnapshot, cause}) {
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: removalLifecycleSnapshot.trackedStatus ||
          removalLifecycleSnapshot.cachedStatus || ReplicaStatus.ACTIVE,
        service,
      });
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_DEFERRED_WITHOUT_ROW, {
        operationId,
        replicaId,
        partitionId,
        nodeId: this.nodeId,
        cause,
      });
    }
    /**
     * Keep the retiring replica participating until its own applied
     * configuration no longer names it, its removal is cancelled, or the
     * node shuts down; a spent round is reported once and waited again
     * (replica-removal-participation.js).
     * @param {Object|null} service - The tracked partition service.
     * @param {Object} context - {operationId, replicaId, partitionId,
     *   removal}.
     * @return {Promise<Object>} Frozen {reason}.
     * @private
     */
    awaitReplicaRemovalConsensusExit(service, context) {
      return awaitRemovalConsensusExit(this, service, context);
    }
    /**
     * Read one tracked replica lifecycle state from the shared state machine.
     * @param {string} replicaId
     * @return {string|null}
     * @private
     */
    getTrackedReplicaLifecycleState(replicaId) {
      const trackedState =
        typeof this.replicaStateMachine?.getState ===
          REPLICA_HANDLER_TYPEOF.FUNCTION ?
          this.replicaStateMachine.getState(replicaId) :
          null;
      if (typeof trackedState === REPLICA_HANDLER_TYPEOF.STRING) {
        return trackedState;
      }
      return typeof trackedState?.state === REPLICA_HANDLER_TYPEOF.STRING ?
        trackedState.state :
        null;
    }
    /**
     * Reconcile an idempotent REMOVE retry through the same durable protocol
     * as the first attempt. The exact REMOVING generation is bound and its
     * leader-clear debt settled before an atomic handoff to cleanup ownership;
     * only that exact cleanup token may remove artifacts and release the row.
     * Genuinely rowless startup candidates are owned separately by the
     * cleanup-tombstone sweep and never enter through a synthetic generation.
     * R14: the REMOVE of the operation that completed this removal, its row
     * ABSENT, is satisfied; generic absence alone still fails closed.
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string|null} operationId - The duplicate REMOVE's operation.
     * @return {Promise<boolean>} True when stale cleanup work ran.
     * @private
     */
    async reconcileRemovedReplicaCleanup(replicaId, partitionId, operationId) {
      const trackedService = this.getTrackedService(replicaId);
      const lifecycleSnapshot =
        this.buildReplicaRemovalLifecycleSnapshot(replicaId);
      const trackedStatus = lifecycleSnapshot.trackedStatus;
      const authority = await this.replicaStateMachine
        .bindAuthoritativeRemovalAuthority(replicaId, {
          partitionId,
          nodeId: this.nodeId,
        });
      const local = this.getLocalReplica(replicaId);
      if (authority?.kind === REMOVAL_AUTHORITY_KIND.ABSENT &&
          local?.status === ReplicaStatus.REMOVED) {
        if (operationId && local.removedByOperationId === operationId) {
          return false;
        }
        // Removed here and absent durably, but not by this operation:
        // nothing will change the answer, so it is final and typed (never a
        // deferral); the coordinator's durable effect check decides it.
        throw replicaAbsentNotByOperationError(replicaId, operationId);
      }
      if (authority?.kind !== REMOVAL_AUTHORITY_KIND.REMOVING ||
          trackedStatus && ![
            ReplicaStatus.REMOVING,
            ReplicaStatus.REMOVED,
          ].includes(trackedStatus)) {
        throw retryableRemovalDebtError(
          REPLICA_REMOVAL_COMPLETION_DEFERRED,
          `Replica removal lacks exact durable authority for ${replicaId}`,
        );
      }
      // A REMOVING generation's cleanup deletes the replica's storage: not
      // while participant custody is held or unknown.
      requireRemovalParticipantCustodySettled(this, {partitionId, replicaId},
        trackedService);
      const removingAuthority = await settleCanonicalLeaderClearOrThrow(
        this,
        replicaId,
        partitionId,
      );
      await runRemovalEffectsOrThrow(
        this,
        replicaId,
        removingAuthority,
        async (guard) => {
          const cleanupAuthority = await takeoverRemovingRowForCleanupOrThrow(
            this,
            replicaId,
            removingAuthority,
            guard,
            REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
          );
          await completeCleanupTombstoneOrThrow(
            this,
            replicaId,
            partitionId,
            trackedService,
            cleanupAuthority,
            guard,
          );
          return true;
        },
        () => {
          this.localServices.delete(replicaId);
          this.setLocalReplica(replicaId, {replicaId, partitionId,
            status: ReplicaStatus.REMOVED, service: null,
            removedByOperationId: null});
        },
        {
          partitionId,
          nodeId: this.nodeId,
          reason:
            REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
          serviceId: replicaId,
        },
      );
      return true;
    }
    /**
     * Async replica removal - reports progress via CDC.
     * @param {Object} request - Removal request.
     * @return {Promise<void>}
     * @private
     */
    async removeReplicaAsync(request) {
      const {operationId, replicaId} = request;
      // request.groupRetirement: the verified group-retirement decision
      // (verifyRemoveGroupRetirement), or absent for an ordinary REMOVE.
      const service = this.getTrackedService(replicaId);
      const removalLifecycleSnapshot =
        this.buildReplicaRemovalLifecycleSnapshot(replicaId);
      const execution = {
        cleanupError: null,
        retiringRowDurable:
          removalLifecycleSnapshot.retiringRowDurable === true,
        serviceRowRemoved: false,
        // Its release and a cancellation asked of it while it runs.
        removal: beginRemovalExecution(this, request),
      };
      try {
        const completed = await performReplicaRemoval(
          this,
          request,
          service,
          removalLifecycleSnapshot,
          execution,
        );
        if (!completed) return;
        reportReplicaRemovalSuccess(this, request, execution.cleanupError);
      } catch (error) {
        if (this.shuttingDown) {
          if (operationId) this.inProgressOperations.delete(operationId);
          return;
        }
        await handleReplicaRemovalFailure(
          this,
          request,
          service,
          execution,
          error,
        );
        throw error;
      } finally {
        endRemovalExecution(this, execution.removal);
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRemoveExecutionMethods.prototype)) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(ReplicaHandler.prototype, methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRemoveExecutionMethods.prototype, methodName));
  }
}

export {assignReplicaHandlerRemoveExecutionMethods};
