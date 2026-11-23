const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryMutationBudgetMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    OPERATION_PERSIST_RETRY_TIMEOUT_MS,
    REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    createTimeoutBudget,
    getRemainingBudgetMs,
  } = options;

  class ReplicaOperationRepositoryMutationBudgetMethods {
    createOperationMutationTimeoutBudget(timeoutBudget = null) {
      if (timeoutBudget && typeof timeoutBudget ===
          REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT) return timeoutBudget;
      return createTimeoutBudget({
        configuredBudgetMs:
          this.operationPersistRetryTimeoutMs ??
          OPERATION_PERSIST_RETRY_TIMEOUT_MS,
        now: () => this.timeSource.now(),
      });
    }

    resolveOperationMutationRemainingRetryMs(elapsedMs, timeoutBudget = null) {
      const localRemainingMs =
        (this.operationPersistRetryTimeoutMs ??
          OPERATION_PERSIST_RETRY_TIMEOUT_MS) - elapsedMs;
      if (
        !timeoutBudget ||
        typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT
      ) {
        return localRemainingMs;
      }
      const budgetRemainingMs = getRemainingBudgetMs(
        timeoutBudget, {now: () => this.timeSource.now()});
      return Math.min(localRemainingMs, budgetRemainingMs);
    }

    resolveOperationMutationQueryTimeoutMs(timeoutBudget = null) {
      const mutationQueryTimeoutMs =
        this.replicaOperationMutationQueryTimeoutMs ??
        REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS;
      if (
        !timeoutBudget ||
        typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT
      ) {
        return mutationQueryTimeoutMs;
      }
      const budgetRemainingMs = getRemainingBudgetMs(
        timeoutBudget, {now: () => this.timeSource.now()});
      if (budgetRemainingMs <= 0) return 1;
      return Math.max(
        1,
        Math.min(
          mutationQueryTimeoutMs,
          budgetRemainingMs,
        ),
      );
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationBudgetMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) continue;
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationBudgetMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationBudgetMethods};
