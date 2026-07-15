const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_OPERATION_TRANSITION_OWNER_KEY_PREFIX = Object.freeze({
  FALLBACK_LANE: 'fallback-lane',
  OPERATION: 'operation',
});
const REPLICA_OPERATION_TRANSITION_OWNER_KEY_SEPARATOR = ':';

function assignReplicaOperationRepositoryMutationTransitionMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    REPLICA_OPERATION_TRANSITION_LANE,
    classifySystemPartition,
  } = options;

  class ReplicaOperationRepositoryMutationTransitionMethods {
    runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
      const ownerKey = this.resolveReplicaOperationTransitionOwnerKey(options);
      const activeQueue = this.getReplicaOperationTransitionQueue(ownerKey);
      const queuedExecution = activeQueue
        .catch(() => {})
        .then(async () => executionFactory());
      const settledQueue = queuedExecution.catch(() => {});
      this.replicaOperationTransitionQueues.set(ownerKey, settledQueue);
      void settledQueue.then(() => {
        this.releaseSettledReplicaOperationTransitionQueue(
          ownerKey,
          settledQueue,
        );
      });
      return queuedExecution;
    }

    resolveReplicaOperationTransitionOwnerKey(options = {}) {
      const operationIdCandidate =
        options.operationId ??
        options.operation?.operationId ??
        options.operation?.operation_id;
      const operationId =
        typeof operationIdCandidate === 'string' ?
          operationIdCandidate.trim() :
          '';
      if (operationId.length > 0) {
        return [
          REPLICA_OPERATION_TRANSITION_OWNER_KEY_PREFIX.OPERATION,
          operationId,
        ].join(REPLICA_OPERATION_TRANSITION_OWNER_KEY_SEPARATOR);
      }
      const fallbackLane = this.resolveReplicaOperationTransitionLane(options);
      return [
        REPLICA_OPERATION_TRANSITION_OWNER_KEY_PREFIX.FALLBACK_LANE,
        fallbackLane,
      ].join(REPLICA_OPERATION_TRANSITION_OWNER_KEY_SEPARATOR);
    }

    resolveReplicaOperationTransitionLane(options = {}) {
      const explicitLane = this.normalizeReplicaOperationTransitionLane(
        options.transitionLane || options.lane,
      );
      if (explicitLane) {
        return explicitLane;
      }
      const partitionClassificationInput =
        this.buildReplicaOperationTransitionPartitionClassificationInput(
          options,
        );
      return classifySystemPartition(partitionClassificationInput)
        .priorityControlPlane ?
        REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY :
        REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;
    }

    normalizeReplicaOperationTransitionLane(lane) {
      return lane === REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY ?
        REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY :
        lane === REPLICA_OPERATION_TRANSITION_LANE.DEFAULT ?
          REPLICA_OPERATION_TRANSITION_LANE.DEFAULT :
          null;
    }

    buildReplicaOperationTransitionPartitionClassificationInput(options = {}) {
      const operation = options.operation;
      const partitionRow =
        options.partitionRow && typeof options.partitionRow === 'object' ?
          options.partitionRow :
          operation?.partitionRow &&
              typeof operation.partitionRow === 'object' ?
            operation.partitionRow :
            null;
      const partitionIdCandidate =
        options.partitionId ??
        operation?.partitionId ??
        operation?.partition_id ??
        partitionRow?.partition_id ??
        partitionRow?.partitionId ??
        null;
      const partitionId =
        typeof partitionIdCandidate === 'string' ?
          partitionIdCandidate.trim() :
          null;
      return {
        partitionId:
          partitionId && partitionId.length > 0 ? partitionId : null,
        partitionRow,
      };
    }

    getReplicaOperationTransitionQueue(ownerKey) {
      if (!this.replicaOperationTransitionQueues.has(ownerKey)) {
        this.replicaOperationTransitionQueues.set(
          ownerKey,
          Promise.resolve(),
        );
      }
      return this.replicaOperationTransitionQueues.get(ownerKey);
    }

    releaseSettledReplicaOperationTransitionQueue(ownerKey, settledQueue) {
      if (this.replicaOperationTransitionQueues.get(ownerKey) === settledQueue) {
        this.replicaOperationTransitionQueues.delete(ownerKey);
      }
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationTransitionMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationTransitionMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationTransitionMethods};
