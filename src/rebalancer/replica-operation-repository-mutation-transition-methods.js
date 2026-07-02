const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryMutationTransitionMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    REPLICA_OPERATION_TRANSITION_LANE,
    isPriorityControlPlanePartition,
  } = options;

  class ReplicaOperationRepositoryMutationTransitionMethods {
    runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
      const lane = this.resolveReplicaOperationTransitionLane(options);
      const activeQueue = this.getReplicaOperationTransitionQueue(lane);
      const queuedExecution = activeQueue
        .catch(() => {})
        .then(async () => executionFactory());
      this.replicaOperationTransitionQueues.set(
        lane,
        queuedExecution.catch(() => {}),
      );
      return queuedExecution;
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
      return isPriorityControlPlanePartition(partitionClassificationInput) ?
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

    getReplicaOperationTransitionQueue(lane) {
      const normalizedLane =
        this.normalizeReplicaOperationTransitionLane(lane) ||
        REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;
      if (!this.replicaOperationTransitionQueues.has(normalizedLane)) {
        this.replicaOperationTransitionQueues.set(
          normalizedLane,
          Promise.resolve(),
        );
      }
      return this.replicaOperationTransitionQueues.get(normalizedLane);
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
