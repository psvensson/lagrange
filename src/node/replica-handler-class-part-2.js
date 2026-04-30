/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
 */
import fs from 'fs';
import path from 'path';
import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {NUM, WORKFLOW_STEP} from '../constants/index.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {PartitionServiceRowOwner} from '../partition/partition-service-row-owner.js';
import {createSystemMetadataGatewayRequiredError} from '../control-plane/system-metadata-access-error.js';
import {runRetryableControlPlaneWrite} from '../bootstrap/shared/retryable-control-plane-write.js';
import {OperationType, ReplicaStatus} from '../rebalancer/replica-status.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {
  ReplicaOperationReason,
} from '../rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {isNodeRecordReady} from './node-readiness-policy.js';
import LifeRaft from '../raft/liferaft.js';
import {assignReplicaHandlerRuntimeMethods} from './replica-handler-runtime-methods.js';
import {ReplicaHandlerPart1} from './replica-handler-class-part-1.js';
const REPLICA_HANDLER_LEADER_HANDOFF_STATE = Object.freeze({
  COMPLETED: 'completed',
  NOT_APPLICABLE: 'not_applicable',
  NOT_SUPPORTED: 'not_supported',
});
const REPLICA_HANDLER_LEADER_HANDOFF_LITERAL = Object.freeze({
  EMPTY_LEADER_ID: '',
});
const REPLICA_HANDLER_LITERAL = Object.freeze({
  READY_LEASE_EXPIRES_AT: 'ready_lease_expires_at',
  READYLEASEEXPIRESAT: 'readyLeaseExpiresAt',
  READYLEASEEXPIRESATMS: 'readyLeaseExpiresAtMs',
  READYLEASEEXPIRES: 'readyLeaseExpires',
  VALUE: '',
  DURABLE_REMOVE_CLEANUP_COMPLETE: 'durable_remove_cleanup_complete',
  ADD: 'ADD',
  REPLICAHANDLER: 'ReplicaHandler',
  READ: 'read',
  SYSTEM_TABLE_QUERY_FAILED: 'system table query failed',
});
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);
const VOTER_READY_CHECK_INTERVAL_MS = 250;
const METADATA_RESOLUTION_POLL_INTERVAL_MS = 50;
const partitionMetadataMissingError =
  REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
const tableMetadataMissingError =
  REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
const PARTITION_METADATA_MISSING_PREFIX = partitionMetadataMissingError('');
const TABLE_METADATA_MISSING_PREFIX = tableMetadataMissingError('');
const ESTABLISHED_VOTER_ROLES = new Set([
  RAFT_ROLE.LEADER,
  RAFT_ROLE.FOLLOWER,
  RAFT_ROLE.CANDIDATE,
]);
const CRITICAL_VOTER_READY_GATED_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const CRITICAL_VOTER_READY_FALLBACK_OPERATION_TYPES = new Set([
  OperationType.REMOVE,
  OperationType.REPLACE,
]);
const FAILED_REMOVAL_TOLERATED_STATUS_WRITES = new Set([
  ReplicaStatus.REMOVING,
  ReplicaStatus.FAILED,
]);
const SYSTEM_TABLE_HYDRATION_SQL = Object.freeze({
  PARTITION_BY_ID: `SELECT * FROM ${SYSTEM_TABLE_NAME.PARTITIONS} WHERE partition_id = ?`,
  TABLE_BY_ID: `SELECT * FROM ${SYSTEM_TABLE_NAME.TABLES} WHERE table_id = ?`,
  PARTITION_SERVICES:
    `SELECT * FROM ${SYSTEM_TABLE_NAME.SERVICES} ` +
    'WHERE partition_id = ? AND service_type = ?',
});
function resolveSnapshotStateForTransition(
  existingStatus,
  localStatus,
  targetStatus,
) {
  if (existingStatus) {
    return existingStatus;
  }
  if (localStatus && localStatus !== targetStatus) {
    return localStatus;
  }
  switch (targetStatus) {
  case ReplicaStatus.CREATING:
    return ReplicaStatus.PENDING;
  case ReplicaStatus.SYNCING:
    return ReplicaStatus.CREATING;
  case ReplicaStatus.ACTIVE:
    return ReplicaStatus.SYNCING;
  case ReplicaStatus.REMOVING:
    return ReplicaStatus.ACTIVE;
  case ReplicaStatus.REMOVED:
    return ReplicaStatus.REMOVING;
  default:
    return localStatus || ReplicaStatus.ACTIVE;
  }
}
function isFreshPartitionBootstrapWindow(partition) {
  if (!partition || partition.leader_node_id) {
    return false;
  }
  return (
    Number.isFinite(partition.created_at) &&
    Number.isFinite(partition.updated_at) &&
    partition.created_at === partition.updated_at
  );
}
function hasExplicitReadyLeaseMetadata(nodeRow) {
  return Boolean(
    nodeRow &&
    typeof nodeRow === REPLICA_HANDLER_TYPEOF.OBJECT &&
    (Object.prototype.hasOwnProperty.call(
      nodeRow,
      REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT,
    ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT,
      ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS,
      ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRES,
      )),
  );
}
function isReplicaJoinNodeViable(nodeRow, options = {}) {
  if (!nodeRow) {
    return true;
  }
  if (nodeRow.status !== ReplicaStatus.ACTIVE) {
    return false;
  }
  if (!hasExplicitReadyLeaseMetadata(nodeRow)) {
    return true;
  }
  return isNodeRecordReady(nodeRow, {
    now: options.now,
    requireActiveStatus: true,
  });
}
/**
 * ReplicaHandler handles replica creation and removal requests on target nodes.
 * Returns immediately with status, then performs async work.
 */
class ReplicaHandler extends ReplicaHandlerPart1 {
  /**
   * Request replacement ownership through the explicit election capability.
   * Older provider doubles can still use the timer path, but real runtime
   * providers must expose requestElectionNow via the Raft provider contract.
   * @param {Object|null} raftProvider
   * @param {Object|null} raft
   * @return {string} Canonical leader handoff state.
   * @private
   */
  requestTrackedReplacementLeaderElection(raftProvider, raft) {
    if (!raftProvider || !raft) {
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED;
    }
    if (
      typeof raftProvider.requestElectionNow ===
      REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      raftProvider.requestElectionNow(raft);
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
    }
    if (
      typeof raftProvider.startElectionTimer !==
      REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED;
    }
    raftProvider.startElectionTimer(raft);
    return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
  }

  /**
   * Demote a tracked leader replica before safe source removal.
   * @param {string} replicaId - Replica ID to demote.
   * @return {string} Canonical leader handoff state.
   * @private
   */
  requestTrackedPartitionLeaderHandoff(replicaId, reason = null) {
    const service = this.getTrackedService(replicaId);
    if (!service) {
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE;
    }
    const trackedRole = this.getTrackedReplicaRole(replicaId);
    const raft = service.raft || null;
    const raftProvider = service.raftProvider || null;
    if (trackedRole !== RAFT_ROLE.LEADER) {
      if (
        trackedRole === RAFT_ROLE.FOLLOWER &&
        reason === ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION
      ) {
        return this.requestTrackedReplacementLeaderElection(raftProvider, raft);
      }
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
    }
    if (
      !raft ||
      typeof raft.change !== REPLICA_HANDLER_TYPEOF.FUNCTION ||
      !raftProvider ||
      typeof raftProvider.startElectionTimer !==
        REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      return REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED;
    }
    if (
      typeof service.cancelLeaderOwnedActivation ===
      REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      service.cancelLeaderOwnedActivation();
    }
    raft.change({
      state: LifeRaft.FOLLOWER,
      leader: REPLICA_HANDLER_LEADER_HANDOFF_LITERAL.EMPTY_LEADER_ID,
    });
    raftProvider.startElectionTimer(raft);
    return REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED;
  }
  /**
   * Build one canonical snapshot for REMOVE execution.
   * Failed replicas skip the transitional REMOVING write because the state
   * machine only permits failed -> removed durable cleanup.
   * @param {string} replicaId
   * @return {Object}
   * @private
   */
  buildReplicaRemovalLifecycleSnapshot(replicaId) {
    const trackedState =
      typeof this.replicaStateMachine?.getState === REPLICA_HANDLER_TYPEOF.FUNCTION ?
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
      currentStatus,
      skipRemovingStatusWrite:
        durableStatus === ReplicaStatus.FAILED ||
        durableStatus === ReplicaStatus.REMOVING,
    });
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
   * Failed replicas can proceed directly to durable REMOVE cleanup.
   * This tolerates the race where REMOVE planning snapshots ACTIVE but the
   * shared state machine flips to FAILED before the REMOVING write lands.
   * @param {string} replicaId
   * @param {string} requestedStatus
   * @return {boolean}
   * @private
   */
  shouldSkipReplicaRemovalLifecycleWrite(replicaId, requestedStatus) {
    return this.getTrackedReplicaLifecycleState(replicaId) ===
      ReplicaStatus.FAILED &&
      FAILED_REMOVAL_TOLERATED_STATUS_WRITES.has(requestedStatus);
  }
  /**
   * Reconcile durable cleanup for replicas already marked REMOVED locally.
   * This keeps idempotent REMOVE retries from leaving stale service rows
   * routable after the local replica is already gone.
   * @param {string} replicaId
   * @param {string} partitionId
   * @return {Promise<boolean>} True when stale cleanup work ran.
   * @private
   */
  async reconcileRemovedReplicaCleanup(replicaId, partitionId) {
    const trackedService = this.getTrackedService(replicaId);
    await this.getPartitionServiceRowOwner().removeReplica({
      partitionId,
      replicaId,
      nodeId: this.nodeId,
    });
    if (trackedService) {
      await this.cleanupRemovedReplicaLocalRuntime(
        replicaId,
        partitionId,
        trackedService,
      );
    }
    if (!trackedService) {
      this.localServices.delete(replicaId);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: null,
      });
      if (
        typeof this.replicaStateMachine?.completeDurableRemoval ===
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        this.replicaStateMachine.completeDurableRemoval(replicaId, {
          partitionId,
          nodeId: this.nodeId,
          reason: REPLICA_HANDLER_LITERAL.DURABLE_REMOVE_CLEANUP_COMPLETE,
          serviceId: replicaId,
        });
      }
      return false;
    }
    this.localServices.delete(replicaId);
    this.setLocalReplica(replicaId, {
      replicaId,
      partitionId,
      status: ReplicaStatus.REMOVED,
      service: null,
    });
    if (
      typeof this.replicaStateMachine?.completeDurableRemoval ===
      REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      this.replicaStateMachine.completeDurableRemoval(replicaId, {
        partitionId,
        nodeId: this.nodeId,
        reason: REPLICA_HANDLER_LITERAL.DURABLE_REMOVE_CLEANUP_COMPLETE,
        serviceId: replicaId,
      });
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
    const {operationId, partitionId, replicaId, reason} = request;
    let serviceRowRemoved = false;
    let cleanupError = null;
    const service = this.getTrackedService(replicaId);
    const removalLifecycleSnapshot =
      this.buildReplicaRemovalLifecycleSnapshot(replicaId);
    let skipRemovingStatusWrite =
      removalLifecycleSnapshot.skipRemovingStatusWrite === true;
    try {
      this.throwIfShuttingDown();
      if (!skipRemovingStatusWrite) {
        try {
          await this.persistReplicaStatusWithRetry(
            replicaId,
            ReplicaStatus.REMOVING,
            {partitionId},
          );
        } catch (error) {
          if (!this.shouldSkipReplicaRemovalLifecycleWrite(
            replicaId,
            ReplicaStatus.REMOVING,
          )) {
            if (!isRetryableControlPlaneError(error)) {
              throw error;
            }
            this.logger.warn(
              REPLICA_HANDLER_LOG_MSG.REMOVE_STATUS_WRITE_DEFERRED,
              {
                operationId,
                replicaId,
                partitionId,
                nodeId: this.nodeId,
                error: error.message,
              },
            );
          } else {
            skipRemovingStatusWrite = true;
            this.setLocalReplica(replicaId, {
              replicaId,
              partitionId,
              status: ReplicaStatus.FAILED,
              service,
            });
          }
        }
      }
      // Delete the authoritative row before local shutdown so routing never points at a dead handler.
      try {
        await this.getPartitionServiceRowOwner().removeReplica({
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        serviceRowRemoved = true;
      } catch (deleteError) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.DELETE_SERVICE_ROW_FAILED, {
          replicaId,
          error: deleteError.message,
        });
        throw deleteError;
      }
      try {
        await this.cleanupRemovedReplicaLocalRuntime(
          replicaId,
          partitionId,
          service,
        );
      } catch (error) {
        cleanupError = error;
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.LOCAL_CLEANUP_RETRY_REQUIRED, {
          replicaId,
          partitionId,
          nodeId: this.nodeId,
          error: error.message,
        });
      }
      if (
        typeof this.replicaStateMachine?.completeDurableRemoval ===
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        this.replicaStateMachine.completeDurableRemoval(replicaId, {
          partitionId,
          nodeId: this.nodeId,
          reason: REPLICA_HANDLER_LITERAL.DURABLE_REMOVE_CLEANUP_COMPLETE,
          serviceId: replicaId,
        });
      }
      // Remove from local service tracking
      if (!cleanupError) {
        this.localServices.delete(replicaId);
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: cleanupError ? service : null,
      });
      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }
      // Emit removed outcome only after source-row cleanup is durable.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
        operationId,
        WORKFLOW_STEP.REMOVED,
        {replicaId},
      );
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_COMPLETED, {
        operationId,
        replicaId,
        partitionId,
        reason,
        nodeId: this.nodeId,
        cleanupDeferred: cleanupError !== null,
      });
      this.emit(REPLICA_HANDLER_EVENT.REMOVED, {
        operationId,
        replicaId,
        partitionId,
        reason,
        nodeId: this.nodeId,
      });
    } catch (error) {
      if (this.shuttingDown) {
        if (operationId) {
          this.inProgressOperations.delete(operationId);
        }
        return;
      }
      this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        stack: error.stack,
      });
      // Emit failed outcome — coordinator will transition workflow.
      this.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
        operationId,
        WORKFLOW_STEP.FAILED,
        {
          replicaId,
          errorMessage: error.message,
        },
      );
      if (!serviceRowRemoved) {
        if (
          !skipRemovingStatusWrite &&
          !this.shouldSkipReplicaRemovalLifecycleWrite(
            replicaId,
            ReplicaStatus.FAILED,
          )
        ) {
          try {
            await this.persistReplicaStatusWithRetry(
              replicaId,
              ReplicaStatus.FAILED,
              {
                partitionId,
                errorMessage: error.message,
              },
            );
          } catch (statusError) {
            if (!isRetryableControlPlaneError(statusError)) {
              throw statusError;
            }
            this.logger.warn(
              REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED_STATUS_WRITE_DEFERRED,
              {
                operationId,
                replicaId,
                partitionId,
                nodeId: this.nodeId,
                error: statusError.message,
              },
            );
          }
        }
        this.setLocalReplica(replicaId, {
          replicaId,
          partitionId,
          status: ReplicaStatus.FAILED,
          service,
        });
      }
      // Clean up in-progress tracking
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }
      this.emit(REPLICA_HANDLER_EVENT.REMOVAL_FAILED, {
        operationId,
        replicaId,
        partitionId,
        error: error.message,
        nodeId: this.nodeId,
      });
      throw error;
    }
  }
  /**
   * Update replica status through the replica lifecycle state machine.
   * The state machine owns services-table lifecycle persistence.
   * @param {string} replicaId - Replica ID.
   * @param {string} newStatus - New status.
   * @param {Object} additionalData - Additional data to update.
   * @return {Promise<void>}
   * @private
   */
  async persistReplicaStatusWithRetry(
    replicaId,
    newStatus,
    additionalData = {},
  ) {
    return runRetryableControlPlaneWrite(
      () => this.updateReplicaStatus(replicaId, newStatus, additionalData),
      {
        timeoutMs: REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS,
        onRetry: ({
          attempt,
          delayMs,
          remainingMs,
          retryAfterMs,
          resultOrError,
        }) => {
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_RETRY, {
            replicaId,
            partitionId:
              additionalData.partitionId !== undefined ?
                additionalData.partitionId :
                null,
            newStatus,
            attempt,
            delayMs,
            remainingMs,
            retryAfterMs,
            error: resultOrError?.error || resultOrError?.message || null,
            nodeId: this.nodeId,
          });
        },
      },
    );
  }
  /**
   * Update replica status through the replica lifecycle state machine.
   * The state machine owns services-table lifecycle persistence.
   * @param {string} replicaId - Replica ID.
   * @param {string} newStatus - New status.
   * @param {Object} additionalData - Additional data to update.
   * @return {Promise<void>}
   * @private
   */
  async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
    this.logger.debug(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS, {
      replicaId,
      newStatus,
      nodeId: this.nodeId,
    });
    const previousLocalReplica = this.localReplicas.has(replicaId) ?
      {...this.localReplicas.get(replicaId)} :
      null;
    try {
      const existing = this.systemTableCache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        replicaId,
      );
      const partitionId =
        additionalData.partitionId !== undefined ?
          additionalData.partitionId :
          existing?.partition_id || null;
      const localService = this.getTrackedService(replicaId);
      const localReplica = previousLocalReplica;
      const previousLocalStatus = localReplica?.status || null;
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: newStatus,
        service: localService,
      });
      const trackedState =
        this.replicaStateMachine?.getState?.(replicaId) || null;
      if (
        !trackedState &&
        newStatus !== ReplicaStatus.PENDING &&
        typeof this.replicaStateMachine?.registerReplicaSnapshot ===
          REPLICA_HANDLER_TYPEOF.FUNCTION &&
        (existing || localReplica)
      ) {
        this.replicaStateMachine.registerReplicaSnapshot(replicaId, {
          partitionId,
          nodeId: existing?.node_id || this.nodeId,
          state: resolveSnapshotStateForTransition(
            existing?.status,
            previousLocalStatus,
            newStatus,
          ),
          serviceId: existing?.service_id || replicaId,
          serviceType: existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
          serviceAddress:
            existing?.address || this.buildTrackedServiceAddress(replicaId),
        });
      }
      const transitionResult = await Promise.resolve(
        this.replicaStateMachine.transition(replicaId, newStatus, {
          partitionId,
          nodeId: existing?.node_id || this.nodeId,
          errorMessage: additionalData.errorMessage,
          serviceId: existing?.service_id || replicaId,
          serviceType: existing?.service_type || REPLICA_HANDLER_SERVICE.TYPE,
          serviceAddress:
            existing?.address || this.buildTrackedServiceAddress(replicaId),
        }),
      );
      if (transitionResult === false) {
        throw new Error(
          `Replica state transition rejected for ${replicaId}: ${newStatus}`,
        );
      }
    } catch (error) {
      if (previousLocalReplica) {
        this.localReplicas.set(replicaId, previousLocalReplica);
      } else {
        this.localReplicas.delete(replicaId);
      }
      this.logger.error(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED, {
        replicaId,
        newStatus,
        error: error.message,
      });
      throw error;
    }
  }
  /**
   * Determine whether activation should be gated on voter readiness.
   * Critical partitions gate activation for explicit ADD operations. When ADD
   * metadata is not yet visible, we only gate if there is an in-flight paired
   * REMOVE for the same partition.
   * @param {string} partitionId - Partition ID.
   * @param {string} operationId - Replica operation ID.
   * @param {boolean} [isJoiningExistingGroup=false] - Whether this replica is
   * joining an existing Raft group.
   * @return {boolean} True when voter-ready activation is required.
   * @private
   */
  shouldGateActivationOnVoterReadiness(
    partitionId,
    operationId,
    isJoiningExistingGroup = false,
    explicitOperationType = null,
  ) {
    if (
      typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING ||
      !CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId)
    ) {
      return false;
    }
    const normalizedExplicitOperationType =
      typeof explicitOperationType === REPLICA_HANDLER_TYPEOF.STRING ?
        explicitOperationType.trim().toUpperCase() :
        null;
    if (normalizedExplicitOperationType) {
      return CRITICAL_VOTER_READY_GATED_OPERATION_TYPES.has(
        normalizedExplicitOperationType,
      );
    }
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      return false;
    }
    if (!operationId) {
      return (
        isJoiningExistingGroup &&
        this.hasInFlightCriticalVoterReadyGateOperation(partitionId)
      );
    }
    const operationRow = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operationId,
    );
    if (!operationRow) {
      return (
        isJoiningExistingGroup &&
        this.hasInFlightCriticalVoterReadyGateOperation(partitionId)
      );
    }
    const operationType =
      typeof operationRow.type === REPLICA_HANDLER_TYPEOF.STRING ?
        operationRow.type.toUpperCase() :
        null;
    if (!operationType) {
      return false;
    }
    return CRITICAL_VOTER_READY_GATED_OPERATION_TYPES.has(operationType);
  }
  /**
   * Check whether a critical partition has an in-flight REMOVE operation.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when a non-terminal REMOVE exists.
   * @private
   */
  hasInFlightCriticalVoterReadyGateOperation(partitionId) {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION
    ) {
      return false;
    }
    const gateOperations = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (row) => {
        if (
          row?.partition_id !== partitionId ||
          typeof row?.type !== REPLICA_HANDLER_TYPEOF.STRING
        ) {
          return false;
        }
        return CRITICAL_VOTER_READY_FALLBACK_OPERATION_TYPES.has(
          row.type.toUpperCase(),
        );
      },
    );
    return gateOperations.some((row) => {
      const workflowStep =
        typeof row?.workflow_step === REPLICA_HANDLER_TYPEOF.STRING ?
          row.workflow_step.toUpperCase() :
          null;
      if (workflowStep) {
        return (
          workflowStep !== WORKFLOW_STEP.REMOVED &&
          workflowStep !== WORKFLOW_STEP.FAILED
        );
      }
      const status =
        typeof row?.status === REPLICA_HANDLER_TYPEOF.STRING ?
          row.status.toLowerCase() :
          null;
      return (
        status !== ReplicaStatus.REMOVED && status !== ReplicaStatus.FAILED
      );
    });
  }
  /**
   * Wait for replica to become non-learner and routable.
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForVoterReadyActivation(replicaId, partitionId) {
    this.logger.info(REPLICA_HANDLER_LOG_MSG.WAITING_VOTER_READY, {
      replicaId,
      partitionId,
      timeoutMs: this.syncTimeoutMs,
      nodeId: this.nodeId,
    });
    this.throwIfShuttingDown();
    const deadline = Date.now() + this.syncTimeoutMs;
    while (Date.now() <= deadline) {
      this.throwIfShuttingDown();
      if (this.isReplicaVoterReady(replicaId)) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.VOTER_READY_ACTIVATED, {
          replicaId,
          partitionId,
          nodeId: this.nodeId,
        });
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, VOTER_READY_CHECK_INTERVAL_MS);
      });
    }
    this.logger.warn(REPLICA_HANDLER_LOG_MSG.VOTER_READY_TIMEOUT, {
      replicaId,
      partitionId,
      timeoutMs: this.syncTimeoutMs,
      nodeId: this.nodeId,
    });
    throw new Error(
      `Replica ${replicaId} did not become voter-ready within ${this.syncTimeoutMs}ms`,
    );
  }
  /**
   * Check if a local replica is voter-ready and routable.
   * @param {string} replicaId - Replica ID.
   * @return {boolean} True when replica is non-learner with routable address.
   * @private
   */
  isReplicaVoterReady(replicaId) {
    const normalizedRole = this.getTrackedReplicaRole(replicaId);
    if (!normalizedRole || normalizedRole === RAFT_ROLE.LEARNER) {
      return false;
    }
    const serviceRow = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      replicaId,
    );
    if (!serviceRow || !serviceRow.address) {
      return false;
    }
    if (
      serviceRow.status === ReplicaStatus.FAILED ||
      serviceRow.status === ReplicaStatus.REMOVING ||
      serviceRow.status === ReplicaStatus.REMOVED
    ) {
      return false;
    }
    return true;
  }
  /**
   * Update replica operation workflow step via CDC.
   * @param {string} operationId - Operation ID.
   * @param {string} workflowStep - Workflow step name.
   * @param {Object} [options={}] - Optional data for updates.
   * @param {string} [options.replicaId] - Replica ID to set if missing.
   * @param {string} [options.errorMessage] - Error message for failures.
   * @return {Promise<void>}
   * @private
   */
  /**
   * Emit a typed executor outcome instead of writing to
   * replica_operations directly. The coordinator consumes these
   * outcomes through the owner-key reconcile queue.
   *
   * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
   * @param {string} operationId - Replica operation ID.
   * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
   * @param {Object} [options] - Optional replicaId, errorMessage.
   */
  emitExecutorOutcome(outcomeType, operationId, workflowStep, options = {}) {
    if (this.executorOutcomeEmitter) {
      this.executorOutcomeEmitter.emitOutcome(
        outcomeType,
        operationId,
        workflowStep,
        options,
      );
    }
  }
}
assignReplicaHandlerRuntimeMethods(ReplicaHandler, {
  AddressManager,
  ESTABLISHED_VOTER_ROLES,
  METADATA_RESOLUTION_POLL_INTERVAL_MS,
  NUM,
  PRESSURE_WORK_CLASS,
  PARTITION_METADATA_MISSING_PREFIX,
  PartitionServiceRowOwner,
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LITERAL,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
  ReplicaStatus,
  STORAGE_DEFAULT,
  SYSTEM_TABLE_HYDRATION_SQL,
  SYSTEM_TABLE_NAME,
  TABLE_METADATA_MISSING_PREFIX,
  createControlPlaneRuntimeBundle,
  createSystemMetadataGatewayRequiredError,
  fs,
  isFreshPartitionBootstrapWindow,
  isReplicaJoinNodeViable,
  path,
  partitionMetadataMissingError,
});

export {ReplicaHandler};
