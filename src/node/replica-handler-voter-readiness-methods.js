/**
 * ReplicaHandler voter-readiness gating methods.
 *
 * Owns the decision of whether activation must wait on voter readiness for
 * critical system partitions, and the wait/poll loop that blocks activation
 * until the replica is a routable non-learner.
 *
 * Requirements: 10.2, 3.1
 */
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isBootstrapCriticalSystemPartitionId,
} from '../bootstrap/system-partition-classification.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {REMOVE_LIKE_TERMINAL_WORKFLOW_STEPS} from '../rebalancer/replica-operation-step-policy.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {REPLICA_HANDLER_LOG_MSG, REPLICA_HANDLER_TYPEOF} from './replica-handler-constants.js';
import {
  CRITICAL_VOTER_READY_FALLBACK_OPERATION_TYPES,
  CRITICAL_VOTER_READY_GATED_OPERATION_TYPES,
  VOTER_READY_CHECK_INTERVAL_MS,
} from './replica-handler-transition-policy.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const VOTER_READY_ACTIVATION_WAIT = Object.freeze({
  wait: 'REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS',
  awaited: 'local replica promoted to a routable voter (voter-ready activation)',
});

/**
 * The voter-ready activation wait spent its bound: one wait_bound_spent
 * ERROR with the role, services-row status and address the handler last
 * observed for the replica.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} spent - {replicaId, partitionId, startedAtMs, polls}.
 * @return {void}
 */
function reportVoterReadyActivationSpent(handler, spent) {
  const serviceRow = handler.systemTableCache?.get?.(
    SYSTEM_TABLE_NAME.SERVICES,
    spent.replicaId,
  ) ?? null;
  reportWaitBoundSpent(handler.logger, {
    ...VOTER_READY_ACTIVATION_WAIT,
    boundMs: handler.syncTimeoutMs,
    elapsedMs: Date.now() - spent.startedAtMs,
    lastObserved: {
      trackedRaftRole: handler.getTrackedReplicaRole?.(spent.replicaId) ?? null,
      serviceRowPresent: serviceRow !== null,
      serviceRowStatus: serviceRow?.status ?? null,
      serviceRowRaftRole: serviceRow?.raft_role ?? null,
      serviceRowHasAddress: Boolean(serviceRow?.address),
      polls: spent.polls,
    },
    scope: {
      nodeId: handler.nodeId,
      partitionId: spent.partitionId,
      replicaId: spent.replicaId,
    },
  });
}

function assignReplicaHandlerVoterReadinessMethods(ReplicaHandler) {
  class ReplicaHandlerVoterReadinessMethods {
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
        !isBootstrapCriticalSystemPartitionId(partitionId)
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
          return !REMOVE_LIKE_TERMINAL_WORKFLOW_STEPS.has(workflowStep);
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
      const startedAtMs = Date.now();
      const deadline = startedAtMs + this.syncTimeoutMs;
      let polls = 0;
      while (Date.now() <= deadline) {
        this.throwIfShuttingDown();
        polls += 1;
        if (this.isReplicaVoterReady(replicaId)) {
          // CL-035: seed the locally-decided voting role into the local
          // SERVICES row so the REPLACE remove-safety gate observes the
          // promotion (the durable raft_role write defers through the
          // recovering control plane). Every partition: the promotion is a
          // committed local raft decision regardless of partition class.
          this.seedLocalReplicaVoterRaftRole(replicaId);
          // The seed makes the promotion locally visible — but it also makes
          // the local cache row equal to the durable write the owner still
          // has pending, which historically dedup-masked that write (run-27:
          // the cluster read a raft LEADER as a learner forever, the
          // quorum-spread hold never released). Level-trigger the owner's
          // durable re-assert; with the helper's authoritative dedup this is
          // a no-op once the durable row has truly converged.
          this.getTrackedService(replicaId)?.reassertDurableRaftRole?.();
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
      reportVoterReadyActivationSpent(this, {
        replicaId,
        partitionId,
        startedAtMs,
        polls,
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
      if (!isVoterRaftRole(normalizedRole)) {
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
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerVoterReadinessMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerVoterReadinessMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerVoterReadinessMethods};
