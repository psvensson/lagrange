/**
 * ReplicaHandler create-status persistence and local recovery seed methods.
 *
 * Keeps the priority recovery fallback and its local cache projections behind
 * the existing ReplicaHandler prototype composition seam.
 *
 * Requirements: 10.2, 3.1
 */
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_UPSERT = 'UPSERT';
const MISSING_TRACKED_REPLICA_OBSERVATION = Object.freeze({
  available: false,
  trackedState: null,
});

function registerCachedFailedCreateSnapshot(
  handler,
  replicaId,
  partitionId,
  cachedService,
) {
  handler.replicaStateMachine.registerReplicaSnapshot(replicaId, {
    partitionId,
    nodeId: cachedService.node_id || handler.nodeId,
    state: ReplicaStatus.FAILED,
    serviceId: cachedService.service_id || replicaId,
    serviceType:
      cachedService.service_type || REPLICA_HANDLER_SERVICE.TYPE,
    serviceAddress:
      cachedService.address || handler.buildTrackedServiceAddress(replicaId),
  });
}

function observeTrackedReplicaState(handler, replicaId) {
  if (typeof handler.replicaStateMachine?.getState !==
    REPLICA_HANDLER_TYPEOF.FUNCTION) {
    return MISSING_TRACKED_REPLICA_OBSERVATION;
  }
  return {
    available: true,
    trackedState: handler.replicaStateMachine.getState(replicaId),
  };
}

function getCachedService(handler, replicaId) {
  if (typeof handler.systemTableCache?.get !==
    REPLICA_HANDLER_TYPEOF.FUNCTION) {
    return null;
  }
  return handler.systemTableCache.get(
    SYSTEM_TABLE_NAME.SERVICES,
    replicaId,
  );
}

function canRestoreFailedCreateSnapshot(handler, trackedState, cachedService) {
  return !trackedState &&
    cachedService?.status === ReplicaStatus.FAILED &&
    typeof handler.replicaStateMachine?.registerReplicaSnapshot ===
      REPLICA_HANDLER_TYPEOF.FUNCTION;
}

function resolveFailedCreateReplay(handler, replicaId, partitionId) {
  let trackedState = observeTrackedReplicaState(
    handler,
    replicaId,
  ).trackedState;
  const cachedService = getCachedService(handler, replicaId);
  if (canRestoreFailedCreateSnapshot(handler, trackedState, cachedService)) {
    registerCachedFailedCreateSnapshot(
      handler,
      replicaId,
      partitionId,
      cachedService,
    );
    trackedState = observeTrackedReplicaState(
      handler,
      replicaId,
    ).trackedState;
  }
  return trackedState?.state === ReplicaStatus.FAILED ?
    {cachedService} :
    null;
}

function buildFailedCreateReplayContext(
  handler,
  replicaId,
  partitionId,
  cachedService,
) {
  return {
    partitionId,
    nodeId: cachedService?.node_id || handler.nodeId,
    serviceId: cachedService?.service_id || replicaId,
    serviceType:
      cachedService?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
    serviceAddress:
      cachedService?.address || handler.buildTrackedServiceAddress(replicaId),
  };
}

function assignReplicaHandlerCreateStatusMethods(ReplicaHandler) {
  class ReplicaHandlerCreateStatusMethods {
    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {void}
     * @private
     */
    deferRetryableReplicaCreateStatusWrite(options = {}) {
      const {operationId, partitionId, replicaId, error} = options;
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }
      this.localServices.delete(replicaId);
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_STATUS_WRITE_DEFERRED, {
        operationId,
        partitionId,
        replicaId,
        error: error?.message || this.formatReplicaCreationError(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.floor(error.retryAfterMs) :
          null,
        nodeId: this.nodeId,
      });
    }

    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>}
     * @private
     */
    async persistReplicaCreateInitialStatus(options = {}) {
      const {operationId, partitionId, replicaId} = options;
      if (await this.restartFailedReplicaCreateStatus(options)) {
        return true;
      }
      if (this.shouldUsePriorityReplicaCreateStatusFallback(partitionId)) {
        await this.commitPriorityReplicaCreateStatusLocally({
          operationId,
          partitionId,
          replicaId,
        });
        return true;
      }
      try {
        await this.persistReplicaStatusWithRetry(replicaId, ReplicaStatus.PENDING, {
          partitionId,
        });
        this.throwIfShuttingDown();
        await this.persistReplicaStatusWithRetry(replicaId, ReplicaStatus.CREATING, {
          partitionId,
        });
        return true;
      } catch (error) {
        if (isRetryableControlPlaneError(error) !== true) {
          throw error;
        }
        this.deferRetryableReplicaCreateStatusWrite({
          operationId,
          partitionId,
          replicaId,
          error,
        });
        return false;
      }
    }

    /**
     * A durable CREATE owner may re-dispatch after a typed retryable failure.
     * Admit that command through one narrow state-machine replay seam only
     * after the failed runtime has disappeared from routing. This keeps the
     * ordinary FAILED transition table terminal and leaves resource deletion
     * with canonical REMOVE/startup cleanup.
     * @param {Object} options
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>} Whether a FAILED create was restarted.
     * @private
     */
    async restartFailedReplicaCreateStatus(options = {}) {
      const {partitionId, replicaId} = options;
      const replay = resolveFailedCreateReplay(
        this,
        replicaId,
        partitionId,
      );
      if (!replay) {
        return false;
      }
      const staleRuntime = this.getTrackedService(replicaId);
      await this.fenceFailedReplicaCreateRuntime(
        replicaId,
        partitionId,
        staleRuntime,
      );
      if (this.getTrackedService(replicaId)) {
        throw new Error(
          `Cannot redrive failed replica ${replicaId} while its runtime is tracked`,
        );
      }
      const priorityFallback =
        this.shouldUsePriorityReplicaCreateStatusFallback(partitionId);
      const restarted = await Promise.resolve(
        this.replicaStateMachine.restartFailedCreate(
          replicaId,
          buildFailedCreateReplayContext(
            this,
            replicaId,
            partitionId,
            replay.cachedService,
          ),
          {persist: !priorityFallback},
        ),
      );
      if (restarted !== true) {
        return false;
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.CREATING,
        service: null,
      });
      if (priorityFallback) {
        this.seedLocalPriorityServiceRow(
          replicaId,
          partitionId,
          ReplicaStatus.CREATING,
        );
      }
      return true;
    }

    /**
     * @param {string} partitionId
     * @return {boolean}
     * @private
     */
    shouldUsePriorityReplicaCreateStatusFallback(partitionId) {
      return classifySystemPartition({partitionId}).priorityControlPlane;
    }

    /**
     * Priority control-plane recovery cannot require a second durable status
     * write before the local service exists; that service may be part of the
     * write path needed to make the status durable.
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>}
     * @private
     */
    async persistPriorityReplicaCreateCreatingStatus(options = {}) {
      const {operationId, partitionId, replicaId} = options;
      try {
        await this.updateReplicaStatus(replicaId, ReplicaStatus.CREATING, {
          partitionId,
        });
        return true;
      } catch (error) {
        if (isRetryableControlPlaneError(error) !== true) {
          throw error;
        }
        await this.commitPriorityReplicaCreateStatusLocally({
          operationId,
          partitionId,
          replicaId,
          error,
        });
        return true;
      }
    }

    /**
     * CL-016: the priority local-commit fallback must make the LOCAL cache
     * reflect local truth. isReplicaVoterReady, routing viability, and
     * fan-out target resolution all read the SERVICES row from the local
     * systemTableCache; during priority recovery the durable row write
     * EXPECTEDLY defers (it writes through the very control plane being
     * recovered), so without this seed the voter-ready check polls a row
     * that cannot exist within its budget — every priority REPLACE replica
     * timed out regardless of raft catch-up speed.
     * Bootstrap hydration exception: sanctioned direct
     * applySystemTableChange call site — local-only truth, superseded later
     * by the durable write's CDC round-trip (newer updated_at wins in the
     * cache merge).
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} status - ReplicaStatus value reflecting local truth.
     * @return {boolean} Whether the row was applied.
     * @private
     */
    seedLocalPriorityServiceRow(replicaId, partitionId, status) {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.applySystemTableChange !==
          REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return false;
      }
      const nowMs = Date.now();
      this.systemTableCache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        LOCAL_STR_UPSERT,
        {
          service_id: replicaId,
          service_type: REPLICA_HANDLER_SERVICE.TYPE,
          partition_id: partitionId,
          node_id: this.nodeId,
          status,
          address: this.buildTrackedServiceAddress(replicaId),
          created_at: nowMs,
          updated_at: nowMs,
        },
        {causeId: `priority-local-create:${replicaId}`},
      );
      // Lifecycle persistence must UPSERT for this row until a durable
      // write confirms remote existence (the local row no longer proxies
      // it).
      this.replicaStateMachine?.markServiceRowLocalOnly?.(replicaId);
      return true;
    }

    /**
     * CL-035: the learner->voter promotion updates only the in-memory raft
     * role + a DEFERRED durable raft_role write that flushes through the
     * control plane being recovered (and therefore does not land within
     * budget during post-restart recovery). The REPLACE remove-safety gate
     * (priority-publication-safety-topology.isVoterReadyReplicaTopology)
     * reads the SERVICES row's raft_role and defers removing the superseded
     * source forever while the row still reads learner/null, so the spread
     * never recovers. Mirror the CL-016 local-commit seed for the one field
     * that helper omits: write the locally-decided voting role into the
     * LOCAL cache row so the gate (which merges cache over a null-raft_role
     * authoritative row, preferring defined fields) observes local truth
     * without a control-plane round-trip. Applies to every partition the
     * voter-ready activation gate covers (critical system partitions): the
     * promotion is a committed local raft decision regardless of partition
     * class (the original priority-only scoping matched the then-observed
     * symptom, and the 2026-07-13 formation run wedged six critical-system
     * REPLACEs on replace_remove_safety_blocked while their targets had
     * already logged voter-ready — the CL-035 guard breach). Only seeds when
     * the in-memory role is a non-learner voter (the promotion is a
     * committed local decision in this single-phase raft model, so it cannot
     * mark a still-catching-up learner as a voter).
     *
     * This owner-local projection deliberately preserves the existing row's
     * durable causal version. Minting Date.now() here can out-version the
     * concurrently emitted final ACTIVE lifecycle UPSERT: the cache then
     * retains a locally projected SYNCING row even though storage and CDC
     * both carry ACTIVE. The lifecycle UPSERT preserves raft_role from this
     * cached projection and advances updated_at through its own owner.
     * @param {string} replicaId
     * @return {boolean} Whether the local raft_role seed was applied.
     * @private
     */
    seedLocalReplicaVoterRaftRole(replicaId) {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.applySystemTableChange !==
          REPLICA_HANDLER_TYPEOF.FUNCTION ||
        typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return false;
      }
      // Do not synthesize an incomplete row: only seed the field onto an
      // existing SERVICES row (the create-path seed already established it).
      const existingRow = this.systemTableCache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        replicaId,
      );
      if (!existingRow) {
        return false;
      }
      const trackedRole = this.getTrackedReplicaRole(replicaId);
      if (!isVoterRaftRole(trackedRole)) {
        return false;
      }
      const normalizedRole = normalizePublishedRaftRole(trackedRole, {
        collapseLeaderToFollower: true,
      });
      this.systemTableCache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        LOCAL_STR_UPSERT,
        {
          service_id: replicaId,
          raft_role: normalizedRole,
        },
        {causeId: `local-voter-ready:${replicaId}`},
      );
      this.replicaStateMachine?.markServiceRowLocalOnly?.(replicaId);
      return true;
    }

    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @param {Error} options.error
     * @return {Promise<boolean>}
     * @private
     */
    async commitPriorityReplicaCreateStatusLocally(options = {}) {
      const {operationId, partitionId, replicaId, error} = options;
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.CREATING,
      });
      this.seedLocalPriorityServiceRow(
        replicaId,
        partitionId,
        ReplicaStatus.CREATING,
      );
      const transitionContext = {
        partitionId,
        nodeId: this.nodeId,
        errorMessage: error?.message || null,
        serviceId: replicaId,
        serviceType: REPLICA_HANDLER_SERVICE.TYPE,
        serviceAddress: this.buildTrackedServiceAddress(replicaId),
      };
      const trackedState =
        this.replicaStateMachine?.getState?.(replicaId) || null;
      if (trackedState?.state !== ReplicaStatus.CREATING) {
        if (
          typeof this.replicaStateMachine?._applyTransition ===
            REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          const result = await Promise.resolve(
            this.replicaStateMachine._applyTransition(
              replicaId,
              ReplicaStatus.CREATING,
              transitionContext,
              {
                persist: false,
                validate: trackedState !== null,
              },
            ),
          );
          if (result === false) {
            throw new Error(
              `Replica local state transition rejected for ${replicaId}: ` +
                ReplicaStatus.CREATING,
            );
          }
        } else if (
          !trackedState &&
          typeof this.replicaStateMachine?.registerReplicaSnapshot ===
            REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          this.replicaStateMachine.registerReplicaSnapshot(replicaId, {
            ...transitionContext,
            state: ReplicaStatus.CREATING,
          });
        }
      }
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_STATUS_WRITE_DEFERRED, {
        operationId,
        partitionId,
        replicaId,
        status: ReplicaStatus.CREATING,
        localProgressCommitted: true,
        error: error?.message || this.formatReplicaCreationError(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.floor(error.retryAfterMs) :
          null,
        nodeId: this.nodeId,
      });
      return true;
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerCreateStatusMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerCreateStatusMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerCreateStatusMethods};
