const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_OPERATION_MUTATION_COALESCING_KEY_PREFIX =
  'replica-operation';
const REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE_PREFIX =
  'control-plane:write';
const REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE_SEPARATOR = ':';

function assignReplicaOperationRepositoryMutationGatewayMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    CONTROL_PLANE_MUTATION_MERGE_POLICY,
    CONTROL_PLANE_MUTATION_OPERATION,
    CONTROL_PLANE_QUERY_OPTIONS,
    ERRORS,
    OPERATION_PERSIST_RETRY_DELAY_MS,
    OPERATION_PERSIST_RETRY_TIMEOUT_MS,
    OPERATION_MUTATION_SESSION_RETRY_DECISION,
    PARTITION_SERVICE_ERROR_MSG,
    PRESSURE_WORK_CLASS,
    QUERY_ERROR_MSG,
    REBALANCE_COORDINATOR_LOG_MSG,
    REBALANCER_SUBSYSTEM,
    REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE,
    REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS,
    RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES,
    RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES,
    ROUTER_ERROR_MSG,
    SYSTEM_TABLE_NAME,
    TRANSPORT_ERROR_MSG,
    cloneControlPlaneFailureParticipants,
    getControlPlaneErrorCode,
    getControlPlaneRetryAfterMs,
    getRemainingBudgetMs,
    hasControlPlaneMutationRoutingGapFailureSignature,
    isRetryableControlPlaneError,
    isRetryableWorkflowParticipantLookupErrorMessage,
    uuidv4,
  } = options;

  class ReplicaOperationRepositoryMutationGatewayMethods {
    async executeOperationMutationWithRetry(sql, params, options = {}) {
      const startedAt = Date.now();
      let retryAttempt = 0;
      while (true) {
        const queryOptions = this.buildOperationMutationQueryOptions(
          options,
          retryAttempt,
        );
        let result = null;
        try {
          result = await this.controlPlaneSystemTableGateway.executeQuery(
            sql,
            params,
            queryOptions,
          );
        } catch (error) {
          result = error;
        }
        if (result.success || !this.isRetryableOperationPersistError(result)) {
          return result;
        }
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = this.resolveOperationMutationRemainingRetryMs(
          elapsedMs,
          options.timeoutBudget,
        );
        if (remainingMs <= 0) {
          return result;
        }
        if (this.shouldRotateOperationMutationSessionOnRetry(result, options)) {
          retryAttempt += 1;
        }
        // Stop re-arming the backoff once the owning coordinator is shutting
        // down (otherwise this retry timer keeps the event loop alive).
        if (typeof this.isShuttingDownRequested === 'function' &&
            this.isShuttingDownRequested()) {
          return result;
        }
        const waitMs = Math.min(
          this.resolveOperationMutationRetryDelayMs(result),
          remainingMs,
        );
        await this.waitForOperationPersistRetry(waitMs);
      }
    }

    async executeReplicaOperationGatewayMutationWithRetry(
      mutation,
      options = {},
      fallback = {},
    ) {
      const startedAt = Date.now();
      let retryAttempt = 0;
      const shouldRetryDeferredCanonicalMutation =
        this.canUseReplicaOperationMutationIngress(mutation?.operation);
      while (true) {
        const queryOptions = this.buildOperationMutationQueryOptions(
          options,
          retryAttempt,
        );
        let result = null;
        try {
          result = await this.executeReplicaOperationGatewayMutation(
            mutation,
            queryOptions,
            fallback,
          );
        } catch (error) {
          result = error;
        }
        if (result.success || !this.isRetryableOperationPersistError(result)) {
          return result;
        }
        const recoveredAfterRetryableFailure =
          typeof options?.onRetryableFailure === 'function' ?
            (await options.onRetryableFailure(result)) === true :
            false;
        if (recoveredAfterRetryableFailure) {
          return {success: true, recoveredAfterRetryableFailure: true};
        }
        if (
          this.shouldShortCircuitDeferredMutationRetry(result) &&
          !shouldRetryDeferredCanonicalMutation
        ) {
          return result;
        }
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = this.resolveOperationMutationRemainingRetryMs(
          elapsedMs,
          options.timeoutBudget,
        );
        if (remainingMs <= 0) {
          return result;
        }
        if (this.shouldRotateOperationMutationSessionOnRetry(result, options)) {
          retryAttempt += 1;
        }
        // Stop re-arming the backoff once the owning coordinator is shutting
        // down (otherwise this retry timer keeps the event loop alive).
        if (typeof this.isShuttingDownRequested === 'function' &&
            this.isShuttingDownRequested()) {
          return result;
        }
        const waitMs = Math.min(
          this.resolveOperationMutationRetryDelayMs(result),
          remainingMs,
        );
        await this.waitForOperationPersistRetry(waitMs);
      }
    }

    async executeReplicaOperationGatewayMutation(
      mutation,
      queryOptions,
      fallback = {},
    ) {
      const gateway = this.controlPlaneSystemTableGateway;
      const canUseCanonicalMutationIngress =
        this.canUseReplicaOperationMutationIngress(mutation?.operation);
      if (canUseCanonicalMutationIngress) {
        if (typeof gateway?.submitMutation === 'function') {
          return gateway.submitMutation(mutation, queryOptions);
        }
        if (
          mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT &&
          typeof gateway?.insertSystemTableRow === 'function'
        ) {
          return gateway.insertSystemTableRow(
            mutation.tableName,
            mutation.row,
            queryOptions,
          );
        }
        if (
          mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE &&
          typeof gateway?.updateSystemTableRow === 'function'
        ) {
          return gateway.updateSystemTableRow(
            mutation.tableName,
            mutation.whereClause,
            mutation.data,
            queryOptions,
          );
        }
      }
      if (
        typeof gateway?.executeQuery === 'function' &&
        typeof fallback?.sql === 'string'
      ) {
        return gateway.executeQuery(
          fallback.sql,
          Array.isArray(fallback?.params) ? fallback.params : [],
          queryOptions,
        );
      }
      throw new Error(
        REPLICA_OPERATION_REPOSITORY_LITERAL.REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS,
      );
    }

    canUseReplicaOperationMutationIngress(operationType) {
      const gateway = this.controlPlaneSystemTableGateway;
      const cdcIntegrationService =
        typeof gateway?.resolveCdcIntegrationService === 'function' ?
          gateway.resolveCdcIntegrationService() :
          gateway?.cdcIntegrationService || null;
      if (operationType === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        return (
          typeof cdcIntegrationService?.insertSystemTableRow === 'function'
        );
      }
      if (operationType === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        return (
          typeof cdcIntegrationService?.updateSystemTableRow === 'function'
        );
      }
      return false;
    }

    shouldShortCircuitDeferredMutationRetry(errorResult) {
      return (
        errorResult?.deferRetry === true ||
        errorResult?.firstFailedParticipant?.deferRetry === true ||
        (Array.isArray(errorResult?.participantFailures) &&
          errorResult.participantFailures.some(
            (entry) => entry?.deferRetry === true,
          ))
      );
    }

    isRetryableOperationPersistError(errorResult) {
      if (isRetryableControlPlaneError(errorResult)) {
        return true;
      }
      const errorMessage = this.getOperationPersistErrorMessage(errorResult);
      return (
        typeof errorMessage === 'string' &&
        (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
          errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) ||
          RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some((fragment) =>
            errorMessage.includes(fragment),
          ) ||
          isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) ||
          RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES.includes(errorMessage) ||
          RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES.some((prefix) =>
            errorMessage.startsWith(prefix),
          ))
      );
    }

    getOperationPersistErrorMessage(errorResult) {
      return typeof errorResult === 'string' ?
        errorResult :
        typeof errorResult?.error === 'string' ?
          errorResult.error :
          typeof errorResult?.message === 'string' ?
            errorResult.message :
            REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE;
    }

    buildOperationPersistError(
      errorResult,
      fallbackMessage = REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED,
    ) {
      const retryablePersistError =
        this.isRetryableOperationPersistError(errorResult);
      const derivedRetryAfterMs = retryablePersistError ?
        this.resolveOperationMutationRetryDelayMs(errorResult) :
        0;
      const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);
      const nextRetryAfterMs =
        retryAfterMs > 0 ?
          retryAfterMs :
          derivedRetryAfterMs > 0 ?
            derivedRetryAfterMs :
            0;
      const deferRetry =
        errorResult?.deferRetry === true ||
        errorResult?.firstFailedParticipant?.deferRetry === true ||
        (Array.isArray(errorResult?.participantFailures) &&
          errorResult.participantFailures.some(
            (entry) => entry?.deferRetry === true,
          )) ||
        retryablePersistError;
      const error = new Error(
        this.getOperationPersistErrorMessage(errorResult) || fallbackMessage,
      );
      const errorCode = getControlPlaneErrorCode(errorResult);
      if (typeof errorCode === 'string' && errorCode.length > 0) {
        error.code = errorCode;
        error.errorCode = errorCode;
      }
      if (nextRetryAfterMs > 0) {
        error.retryAfterMs = nextRetryAfterMs;
      }
      if (deferRetry) {
        error.deferRetry = true;
      }
      if (
        typeof errorResult?.reasonCode === 'string' &&
        errorResult.reasonCode.length > 0
      ) {
        error.reasonCode = errorResult.reasonCode;
      }
      if (
        typeof errorResult?.participationKind === 'string' &&
        errorResult.participationKind.length > 0
      ) {
        error.participationKind = errorResult.participationKind;
      }
      if (
        typeof errorResult?.tableName === 'string' &&
        errorResult.tableName.length > 0
      ) {
        error.tableName = errorResult.tableName;
      }
      const {participantFailures, firstFailedParticipant} =
        cloneControlPlaneFailureParticipants(errorResult);
      if (participantFailures.length > 0) {
        error.participantFailures = participantFailures;
      }
      if (firstFailedParticipant) {
        error.firstFailedParticipant = firstFailedParticipant;
      }
      if (
        typeof errorResult?.pressureAction === 'string' &&
        errorResult.pressureAction.length > 0
      ) {
        error.pressureAction = errorResult.pressureAction;
      }
      if (
        typeof errorResult?.pressureReason === 'string' &&
        errorResult.pressureReason.length > 0
      ) {
        error.pressureReason = errorResult.pressureReason;
      }
      if (
        typeof errorResult?.outcome === 'string' &&
        errorResult.outcome.length > 0
      ) {
        error.outcome = errorResult.outcome;
      }
      if (errorResult?.cause && !error.cause) {
        error.cause = errorResult.cause;
      }
      return error;
    }

    isOperationMutationPartitionContention(errorResult) {
      return (
        this.getOperationPersistErrorMessage(errorResult) ===
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE
      );
    }

    hasOperationMutationParticipantFailureEvidence(errorResult, errorMessage) {
      return (
        (Array.isArray(errorResult?.participantFailures) &&
          errorResult.participantFailures.length > 0) ||
        (errorResult?.firstFailedParticipant &&
          typeof errorResult.firstFailedParticipant ===
            REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT) ||
        errorMessage.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE)
      );
    }

    isOperationMutationRouteRepairCandidate(errorResult) {
      if (!this.isRetryableOperationPersistError(errorResult)) {
        return false;
      }
      const errorMessage = this.getOperationPersistErrorMessage(errorResult);
      if (
        typeof errorMessage !== 'string' ||
        errorMessage.length <= 0
      ) {
        return hasControlPlaneMutationRoutingGapFailureSignature(errorResult);
      }
      return (
        hasControlPlaneMutationRoutingGapFailureSignature(errorResult) ||
        errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
        errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) ||
        RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some((fragment) =>
          errorMessage.includes(fragment),
        ) ||
        errorMessage.includes(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT) ||
        errorMessage.includes(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT) ||
        isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) ||
        this.hasOperationMutationParticipantFailureEvidence(
          errorResult,
          errorMessage,
        )
      );
    }

    resolveOperationMutationSessionRetryDecision(errorResult, options = {}) {
      if (
        typeof options?.sessionId === 'string' &&
        options.sessionId.length > 0
      ) {
        return {
          state:
            OPERATION_MUTATION_SESSION_RETRY_DECISION.RETAIN_EXISTING_SESSION,
        };
      }
      if (
        this.isOperationMutationPartitionContention(errorResult) ||
        this.isOperationMutationRouteRepairCandidate(errorResult)
      ) {
        return {
          state:
            OPERATION_MUTATION_SESSION_RETRY_DECISION.ROTATE_IMPLICIT_SESSION,
        };
      }
      return {
        state:
          OPERATION_MUTATION_SESSION_RETRY_DECISION.RETAIN_EXISTING_SESSION,
      };
    }

    shouldRotateOperationMutationSessionOnRetry(errorResult, options = {}) {
      return (
        this.resolveOperationMutationSessionRetryDecision(errorResult, options)
          .state ===
        OPERATION_MUTATION_SESSION_RETRY_DECISION.ROTATE_IMPLICIT_SESSION
      );
    }

    resolveOperationMutationRetryDelayMs(errorResult) {
      const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);
      const baseDelayMs =
        Number.isFinite(retryAfterMs) && retryAfterMs > 0 ?
          Math.floor(retryAfterMs) :
          OPERATION_PERSIST_RETRY_DELAY_MS;
      if (!this.isOperationMutationPartitionContention(errorResult)) {
        return baseDelayMs;
      }
      const jitterCeilingMs = Math.max(
        1,
        Math.floor(baseDelayMs / 2),
      );
      const boundedRandom = Math.max(
        0,
        Math.min(1, this.random()),
      );
      const jitterMs = Math.floor(boundedRandom * jitterCeilingMs);
      return baseDelayMs + jitterMs;
    }

    async waitForOperationPersistRetry(delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    resolveOperationMutationRemainingRetryMs(elapsedMs, timeoutBudget = null) {
      const localRemainingMs = OPERATION_PERSIST_RETRY_TIMEOUT_MS - elapsedMs;
      if (
        !timeoutBudget ||
        typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT
      ) {
        return localRemainingMs;
      }
      const budgetRemainingMs = getRemainingBudgetMs(timeoutBudget);
      return Math.min(localRemainingMs, budgetRemainingMs);
    }

    resolveOperationMutationQueryTimeoutMs(timeoutBudget = null) {
      if (
        !timeoutBudget ||
        typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT
      ) {
        return REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS;
      }
      const budgetRemainingMs = getRemainingBudgetMs(timeoutBudget);
      if (budgetRemainingMs <= 0) {
        return 1;
      }
      return Math.max(
        1,
        Math.min(
          REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS,
          budgetRemainingMs,
        ),
      );
    }

    buildOperationMutationQueryOptions(options = {}, retryAttempt = 0) {
      const timeoutBudget =
        options.timeoutBudget &&
        typeof options.timeoutBudget ===
          REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT ?
          options.timeoutBudget :
          undefined;
      const ownerId =
        typeof options.ownerId === 'string' &&
        options.ownerId.length > 0 ?
          options.ownerId :
          null;
      const coalescingKey =
        this.buildReplicaOperationMutationCoalescingKey(ownerId);
      const deliverySource =
        this.resolveReplicaOperationMutationDeliverySource(
          options,
          ownerId,
        );
      const sessionId =
        options.disableSystemWriteSession === true ?
          null :
          this.resolveOperationMutationSessionId(options, retryAttempt);
      return {
        ...CONTROL_PLANE_QUERY_OPTIONS,
        timeoutMs: this.resolveOperationMutationQueryTimeoutMs(
          timeoutBudget || null,
        ),
        skipCacheWait: true,
        timeoutBudget,
        ...(typeof sessionId === 'string' && sessionId.length > 0 ?
          {sessionId} :
          {}),
        disableSystemWriteSession: options.disableSystemWriteSession === true,
        deliveryPriority: REPLICA_OPERATION_REPOSITORY_LITERAL.CRITICAL,
        workloadClass:
          REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE.workloadClass,
        workClass:
          REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE.workClass ||
          PRESSURE_WORK_CLASS.CRITICAL,
        mergePolicy:
          options.mergePolicy ||
          CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
        ...(options.ignoreExisting === true ? {ignoreExisting: true} : {}),
        controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        controlPlaneOperationKind: REPLICA_OPERATION_REPOSITORY_LITERAL.WRITE,
        ...(coalescingKey ? {coalescingKey} : {}),
        ...(deliverySource ? {deliverySource} : {}),
        ...(coalescingKey ? {replacePendingKey: coalescingKey} : {}),
      };
    }

    buildReplicaOperationMutationCoalescingKey(ownerId) {
      if (typeof ownerId !== 'string' || ownerId.length === 0) {
        return null;
      }
      return `${REPLICA_OPERATION_MUTATION_COALESCING_KEY_PREFIX}` +
        `${REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE_SEPARATOR}${ownerId}`;
    }

    buildReplicaOperationMutationDeliverySource(ownerId) {
      const coalescingKey =
        this.buildReplicaOperationMutationCoalescingKey(ownerId);
      if (coalescingKey === null) {
        return null;
      }
      return [
        REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE_PREFIX,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        coalescingKey,
      ].join(REPLICA_OPERATION_MUTATION_DELIVERY_SOURCE_SEPARATOR);
    }

    resolveReplicaOperationMutationDeliverySource(
      options = {},
      ownerId = null,
    ) {
      if (
        typeof options.deliverySource === 'string' &&
        options.deliverySource.length > 0
      ) {
        return options.deliverySource;
      }
      return this.buildReplicaOperationMutationDeliverySource(ownerId);
    }

    resolveReplicaOperationMutationOwnerId(operation = {}) {
      const candidateOwnerIds = [
        operation?.operationId,
        operation?.operation_id,
        operation?.id,
      ];
      const ownerId = candidateOwnerIds.find(
        (candidate) =>
          typeof candidate === 'string' && candidate.length > 0,
      );
      return typeof ownerId === 'string' ? ownerId : null;
    }

    resolveOperationMutationSessionId(options = {}, retryAttempt = 0) {
      if (
        typeof options.sessionId === 'string' &&
        options.sessionId.length > 0
      ) {
        return options.sessionId;
      }
      const ownerId =
        typeof options.ownerId === 'string' &&
        options.ownerId.length > 0 ?
          options.ownerId :
          uuidv4();
      const baseSessionId = `${REBALANCER_SUBSYSTEM.COORDINATOR}:${ownerId}`;
      if (retryAttempt <= 0) {
        return baseSessionId;
      }
      return `${baseSessionId}:retry${retryAttempt}`;
    }

    extractMutationChangeCount(result) {
      const candidate = Number(
        result?.changes ??
          result?.affectedRows ??
          result?.partitionResult?.changes ??
          result?.partitionResult?.affectedRows,
      );
      return Number.isFinite(candidate) ? candidate : null;
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationGatewayMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationGatewayMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationGatewayMethods};
