import {REPLICA_REMOVE_EXECUTION_REASON, takeoverRemovingRowForCleanupOrThrow,
  completeCleanupTombstoneOrThrow, runRemovalEffectsOrThrow,
  resumeRemovalCleanup} from './replica-removal-cleanup.js';
import {REPLICA_CLEANUP_CONTINUATION} from './replica-cleanup-constants.js';
import {readStateField} from '../utils/state-field-read.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
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
import {
  REPLICA_CONSENSUS_EXIT_REASON,
  awaitReplicaConsensusExit,
} from './replica-removal-consensus-exit.js';
import {
  REPLICA_LEADER_CLEAR_DEFERRED,
  REPLICA_REMOVAL_COMPLETION_DEFERRED,
  buildFailedRemovalOutcome,
  removalRowDeleteDeferred,
  retryableRemovalDebtError,
} from './replica-removal-debt-errors.js';
import {GROUP_RETIREMENT_REASON} from
  '../partition/group-retirement-evidence.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REMOVAL_CONSENSUS_EXIT_WAIT = Object.freeze({
  wait: 'REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS',
  awaited: 'retiring replica\'s applied configuration no longer names it ' +
    '(removal committed) or its group unavailable',
});

/**
 * Log one consensus-exit outcome: the backstop elapsing is a spent wait
 * and an alarm, never a normal exit (owner decision 2026-10-04): one
 * wait_bound_spent ERROR with the wait's last witness read and what the
 * handler last observed of the retiring replica. The removal proceeds as
 * before so a missed event never wedges the node. Every other exit is the
 * ordinary info line.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} exit - Frozen {reason} from awaitReplicaConsensusExit.
 * @param {Object} context - {operationId, replicaId, partitionId,
 *   startedAtMs}.
 * @return {void}
 */
function logReplicaRemovalConsensusExit(handler, exit, context) {
  const {operationId, replicaId, partitionId, startedAtMs} = context;
  if (exit.reason !== REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP) {
    handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT, {
      operationId,
      replicaId,
      partitionId,
      nodeId: handler.nodeId,
      reason: exit.reason,
    });
    return;
  }
  reportWaitBoundSpent(handler.logger, {
    ...REMOVAL_CONSENSUS_EXIT_WAIT,
    boundMs: REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS,
    elapsedMs: Date.now() - startedAtMs,
    lastObserved: () => ({
      exitReason: exit.reason,
      // The wait's last witness read: why no exit event came.
      lastObservation: exit.lastObservation ?? null,
      trackedRaftRole: handler.getTrackedReplicaRole?.(replicaId) ?? null,
      lifecycleState: handler.getTrackedReplicaLifecycleState(replicaId),
    }),
    scope: {nodeId: handler.nodeId, operationId, partitionId, replicaId},
  });
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

/**
 * When the retiring replica leaves consensus. A replica of a group retired
 * as a unit (a verified group-retirement REMOVE, owner decision 2026-10-04)
 * leaves at once: its whole group ends at the durable workflow transition,
 * nobody proposes a conf change for it, and nothing commits in it again.
 * Every other removal keeps participating until its own removal applies
 * (ruling F2).
 * @param {Object} handler
 * @param {Object} request
 * @param {Object|null} service
 * @return {Promise<Object>} Frozen {reason}.
 */
function leaveConsensus(handler, request, service) {
  const {operationId, partitionId, replicaId} = request;
  if (request.groupRetirement?.retire === true) {
    const exit = Object.freeze({
      reason: REPLICA_CONSENSUS_EXIT_REASON.GROUP_RETIRED});
    handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT, {
      operationId, replicaId, partitionId, nodeId: handler.nodeId,
      reason: exit.reason, groupRetirementKind: request.groupRetirement.kind,
    });
    return Promise.resolve(exit);
  }
  return handler.awaitReplicaRemovalConsensusExit(service, {
    operationId,
    replicaId,
    partitionId,
  });
}

async function performReplicaRemoval(handler, request, lifecycle, execution) {
  const {operationId, partitionId, replicaId} = request;
  const continuation = handler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(replicaId, partitionId, handler.nodeId);
  if (continuation.kind === REPLICA_CLEANUP_CONTINUATION.OWNED) {
    execution.retiringRowDurable = true;
    await resumeRemovalCleanup(handler, replicaId, partitionId, continuation);
    execution.serviceRowRemoved = true;
    return true;
  }
  // A group retired as a unit records its retirement as such - on the
  // REMOVING row (the row-driven reconcile proposes no conf change for it)
  // and on the durable lifecycle row.
  const reason = request.groupRetirement?.retire === true ?
    GROUP_RETIREMENT_REASON : request.reason;
  handler.throwIfShuttingDown();
  await handler.waitForReplicaServingDrain(execution.service);
  const retiringRow = await handler.publishReplicaRetiringRow({
    operationId,
    replicaId,
    partitionId,
    removalLifecycleSnapshot: lifecycle,
    triggerReason: request.groupRetirement?.retire === true ?
      GROUP_RETIREMENT_REASON : null,
  });
  if (retiringRow.deferred) {
    handler.deferReplicaRemovalWithoutDurableRow({operationId, replicaId,
      partitionId, service: execution.service,
      removalLifecycleSnapshot: lifecycle});
    return false;
  }
  execution.retiringRowDurable = true;
  // The durable REMOVING row is this removal's claim on a replica under a
  // snapshot-install episode: from here it acts on the service the claim
  // answers (the tracked one, after the episode's step in flight settled).
  execution.service = await handler.snapshotInstallOwner.claimForRemoval(
    replicaId);
  const {service} = execution;
  await leaveConsensus(handler, request, service);
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
        service,
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
      if (handler.getTrackedService(replicaId) !== service) return;
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
  const completed = handler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(replicaId, partitionId, handler.nodeId);
  if (completed.kind === REPLICA_CLEANUP_CONTINUATION.OWNED) {
    handler.getReplicaCleanupTombstoneOwner().finishRemovalContinuation(completed.cleanupAuthority);
  }
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

async function handleReplicaRemovalFailure(handler, request, execution,
  error) {
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
  if (!execution.serviceRowRemoved &&
      handler.getTrackedService(replicaId) === execution.service) {
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
      service: execution.service,
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
      removalLifecycleSnapshot, triggerReason = null}) {
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
      const startedAtMs = Date.now();
      const exit = await awaitReplicaConsensusExit(service, {
        replicaId,
        backstopMs: REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS,
        signal: this.removalConsensusExitRelease.signal,
      });
      logReplicaRemovalConsensusExit(this, exit, {
        operationId,
        replicaId,
        partitionId,
        startedAtMs,
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
      const continuation = this.getReplicaCleanupTombstoneOwner()
        .readRemovalContinuation(replicaId, partitionId, this.nodeId);
      if (continuation.kind === REPLICA_CLEANUP_CONTINUATION.OWNED) {
        return resumeRemovalCleanup(this, replicaId, partitionId, continuation);
      }
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
      // Durable REMOVING: the removal's claim on an install episode.
      const trackedService =
        await this.snapshotInstallOwner.claimForRemoval(replicaId);
      await this.awaitReplicaRemovalConsensusExit(trackedService, {replicaId, partitionId});
      this.throwIfShuttingDown();
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
            trackedService,
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
          if (this.getTrackedService(replicaId) !== trackedService) return;
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
      const completed = this.getReplicaCleanupTombstoneOwner()
        .readRemovalContinuation(replicaId, partitionId, this.nodeId);
      if (completed.kind === REPLICA_CLEANUP_CONTINUATION.OWNED) {
        this.getReplicaCleanupTombstoneOwner()
          .finishRemovalContinuation(completed.cleanupAuthority);
      }
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
      const removalLifecycleSnapshot =
        this.buildReplicaRemovalLifecycleSnapshot(replicaId);
      const execution = {
        // The tracked service; replaced by the removal claim's answer once
        // REMOVING is durable (performReplicaRemoval).
        service: this.getTrackedService(replicaId),
        cleanupError: null,
        retiringRowDurable:
          removalLifecycleSnapshot.retiringRowDurable === true,
        serviceRowRemoved: false,
      };
      try {
        const completed = await performReplicaRemoval(
          this, request, removalLifecycleSnapshot, execution);
        if (!completed) return;
        reportReplicaRemovalSuccess(this, request, execution.cleanupError);
      } catch (error) {
        if (this.shuttingDown) {
          if (operationId) this.inProgressOperations.delete(operationId);
          return;
        }
        await handleReplicaRemovalFailure(this, request, execution, error);
        throw error;
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
