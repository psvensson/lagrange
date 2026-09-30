import {WORKFLOW_STEP} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {raftRsLifecycleAdministration} from
  '../raft/raft-rs-lifecycle-administration.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {awaitReplicaConsensusExit} from './replica-removal-consensus-exit.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_REMOVE_EXECUTION_REASON = Object.freeze({
  DURABLE_REMOVE_CLEANUP_COMPLETE: 'durable_remove_cleanup_complete',
});
const REPLICA_REMOVAL_COMPLETION_DEFERRED =
  'REPLICA_REMOVAL_COMPLETION_DEFERRED';
const REPLICA_LEADER_CLEAR_DEFERRED = 'REPLICA_LEADER_CLEAR_DEFERRED';

function retryableRemovalDebtError(code, message, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = true;
  if (Number.isFinite(metadata.retryAfterMs)) {
    error.retryAfterMs = metadata.retryAfterMs;
  }
  if (typeof metadata.mutationOutcome === REPLICA_HANDLER_TYPEOF.STRING) {
    error.mutationOutcome = metadata.mutationOutcome;
  }
  return error;
}

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

function removalRowDeleteDeferred(replicaId, metadata = {}) {
  return retryableRemovalDebtError(
    REPLICA_REMOVAL_COMPLETION_DEFERRED,
    `Replica REMOVING row deletion deferred for ${replicaId}`,
    metadata,
  );
}

async function takeoverRemovingRowForCleanupOrThrow(
  handler,
  replicaId,
  authority,
  guard,
  reason,
) {
  if (!await guard.requireRemoving() || !guard.isCurrent() ||
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
  const {operationId, partitionId, replicaId, reason} = request;
  handler.throwIfShuttingDown();
  await handler.waitForReplicaServingDrain(service);
  const retiringRow = await handler.publishReplicaRetiringRow({
    operationId,
    replicaId,
    partitionId,
    service,
    removalLifecycleSnapshot: lifecycle,
  });
  if (retiringRow.deferred) {
    handler.deferReplicaRemovalWithoutDurableRow({operationId, replicaId,
      partitionId, service, removalLifecycleSnapshot: lifecycle});
    return false;
  }
  execution.retiringRowDurable = true;
  await handler.awaitReplicaRemovalConsensusExit(service, {
    operationId,
    replicaId,
    partitionId,
  });
  handler.throwIfShuttingDown();
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
      // port), never whatever runtime now serves the reused logical name.
      await raftRsLifecycleAdministration.retireReplica(
        replicaId,
        reason || REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
        {groupId: partitionId, runtime: service?.raft ?? null},
      );
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
      return execution.serviceRowRemoved && guard.requireAbsent();
    },
    () => {
      if (!execution.cleanupError) handler.localServices.delete(replicaId);
      handler.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: execution.cleanupError ? service : null,
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

function buildFailedRemovalOutcome(replicaId, error) {
  const outcome = {replicaId, errorMessage: error.message};
  if (error?.deferRetry === true) outcome.deferRetry = true;
  const errorCode = typeof error?.errorCode === REPLICA_HANDLER_TYPEOF.STRING ?
    error.errorCode :
    typeof error?.code === REPLICA_HANDLER_TYPEOF.STRING ? error.code : null;
  if (errorCode) outcome.errorCode = errorCode;
  if (Number.isFinite(error?.retryAfterMs)) {
    outcome.retryAfterMs = error.retryAfterMs;
  }
  if (typeof error?.mutationOutcome === REPLICA_HANDLER_TYPEOF.STRING) {
    outcome.mutationOutcome = error.mutationOutcome;
  }
  return outcome;
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

function assignReplicaHandlerRemoveExecutionMethods(ReplicaHandler) {
  class ReplicaHandlerRemoveExecutionMethods {
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
      service?.fenceServingAdmissionForRemoval?.();
      return service || null;
    }

    /**
     * Let transactions admitted before the removal fence finish under their
     * existing owner before deleting the routable service row or runtime.
     * @param {Object|null} service
     * @return {Promise<void>}
     * @private
     */
    async waitForReplicaServingDrain(service) {
      await service?.waitForRemovalServingDrain?.();
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
      const cachedStatus =
        typeof cachedServiceRow?.status === REPLICA_HANDLER_TYPEOF.STRING ?
          cachedServiceRow.status :
          null;
      const localStatus =
        typeof localReplica?.status === REPLICA_HANDLER_TYPEOF.STRING ?
          localReplica.status :
          null;
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
      service: _service, removalLifecycleSnapshot}) {
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
          {partitionId},
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
     * serving fence raised at acceptance stays, being irreversible).
     * @param {Object} context - {operationId, replicaId, partitionId,
     *   service, removalLifecycleSnapshot}.
     * @private
     */
    deferReplicaRemovalWithoutDurableRow({operationId, replicaId,
      partitionId, service, removalLifecycleSnapshot}) {
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
      });
    }
    /**
     * Keep the retiring replica participating until its own applied
     * configuration no longer names it, the group is unavailable to it, the
     * bounded backstop elapses, or the node shuts down
     * (replica-removal-consensus-exit.js).
     * @param {Object|null} service - The tracked partition service.
     * @param {Object} context - {operationId, replicaId, partitionId}.
     * @return {Promise<Object>} Frozen {reason}.
     * @private
     */
    async awaitReplicaRemovalConsensusExit(service, {operationId, replicaId,
      partitionId}) {
      this.removalConsensusExitRelease ??= new AbortController();
      const exit = await awaitReplicaConsensusExit(service, {
        replicaId,
        backstopMs: REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS,
        signal: this.removalConsensusExitRelease.signal,
      });
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT, {
        operationId,
        replicaId,
        partitionId,
        nodeId: this.nodeId,
        reason: exit.reason,
      });
      return exit;
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
     * @param {string} replicaId
     * @param {string} partitionId
     * @return {Promise<boolean>} True when stale cleanup work ran.
     * @private
     */
    async reconcileRemovedReplicaCleanup(replicaId, partitionId) {
      const trackedService = this.getTrackedService(replicaId);
      const lifecycleSnapshot =
        this.buildReplicaRemovalLifecycleSnapshot(replicaId);
      const trackedStatus = lifecycleSnapshot.trackedStatus;
      const authority = await this.replicaStateMachine
        .bindAuthoritativeRemovalAuthority(replicaId, {
          partitionId,
          nodeId: this.nodeId,
        });
      if (authority?.kind !== ReplicaStatus.REMOVING ||
          trackedStatus && ![
            ReplicaStatus.REMOVING,
            ReplicaStatus.REMOVED,
          ].includes(trackedStatus)) {
        throw retryableRemovalDebtError(
          REPLICA_REMOVAL_COMPLETION_DEFERRED,
          `Replica removal lacks exact durable authority for ${replicaId}`,
        );
      }
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
          this.setLocalReplica(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.REMOVED,
            service: null,
          });
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
      const service = this.getTrackedService(replicaId);
      const removalLifecycleSnapshot =
        this.buildReplicaRemovalLifecycleSnapshot(replicaId);
      const execution = {
        cleanupError: null,
        retiringRowDurable:
          removalLifecycleSnapshot.retiringRowDurable === true,
        serviceRowRemoved: false,
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
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRemoveExecutionMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRemoveExecutionMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerRemoveExecutionMethods};
