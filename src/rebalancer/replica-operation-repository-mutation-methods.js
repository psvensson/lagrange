function assignReplicaOperationRepositoryMutationMethods(ReplicaOperationRepository, options = {}) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_MUTATION_MERGE_POLICY,
    CONTROL_PLANE_MUTATION_OPERATION,
    CONTROL_PLANE_QUERY_OPTIONS,
    COORDINATOR_OWNER_COMPONENT,
    ERRORS,
    NUM,
    OPERATION_PERSIST_RETRY_DELAY_MS,
    OPERATION_PERSIST_RETRY_TIMEOUT_MS,
    PARTITION_SERVICE_ERROR_MSG,
    PRESSURE_WORK_CLASS,
    READ_MODEL_DIVERGENCE_TYPE,
    REBALANCE_COORDINATOR_EVENT,
    REBALANCE_COORDINATOR_LOG_MSG,
    REBALANCER_SUBSYSTEM,
    REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE,
    REPLICA_OPERATION_OWNER_NAME,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_TRANSITION_LANE,
    REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
    RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS,
    RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES,
    RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES,
    SQL,
    SQL_RECONCILIATION_REASON,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    buildControlPlaneFailurePayload,
    buildDivergenceEvent,
    cloneControlPlaneFailureParticipants,
    getControlPlaneErrorCode,
    getControlPlaneRetryAfterMs,
    getRemainingBudgetMs,
    isPriorityControlPlanePartition,
    isRetryableControlPlaneError,
    isRetryableWorkflowParticipantLookupErrorMessage,
    uuidv4,
  } = options;

  class ReplicaOperationRepositoryMutationMethods {
  /**
   * Persist a new operation row via SQL INSERT.
   * @param {object} operation
   * @return {Promise<boolean>}
   */
    async persistNewOperation(operation) {
      return this.runReplicaOperationTransitionExclusive(
        async () => {
          const result = await this.executeReplicaOperationGatewayMutationWithRetry(
            {
              operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
              tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
              row: this.buildReplicaOperationRow(operation),
              owner: REPLICA_OPERATION_OWNER_NAME,
            },
            {
              ownerId: operation.operationId,
              onRetryableFailure: (errorResult) =>
                this.recoverPersistedReplicaOperationMutation(operation, errorResult),
            },
            {
              sql: SQL.INSERT_OPERATION,
              params: [
                operation.operationId,
                operation.type,
                operation.partitionId,
                operation.replicaId,
                operation.sourceNodeId,
                operation.targetNodeId,
                operation.status,
                operation.workflowStep,
                operation.createdAt,
                operation.updatedAt,
                operation.completedAt,
                operation.errorMessage,
                JSON.stringify(operation.stepsHistory),
                operation.entityType,
                operation.entityId,
              ],
            },
          );
          if (!result.success) {
            const recoveredPersistedMutation = await this.recoverPersistedReplicaOperationMutation(
              operation,
              result,
            );
            if (!recoveredPersistedMutation) {
              const persistError = this.buildOperationPersistError(result);
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
                operationId: operation.operationId,
                ...buildControlPlaneFailurePayload(this.nodeId, result),
              });
              throw persistError;
            }
            this.syncIncompleteOperationObservation(operation);
            return true;
          }
          if (result.recoveredAfterRetryableFailure === true) {
            this.syncIncompleteOperationObservation(operation);
            return true;
          }
          await this.confirmReplicaOperationPersistence(operation);
          this.syncIncompleteOperationObservation(operation);
          const changeCount = this.extractMutationChangeCount(result);
          return changeCount === null ? true : changeCount > NUM.ZERO;
        },
        {operation},
      );
    }
    /**
   * Persist an operation update via SQL UPDATE.
   * @param {object} operation
   * @param {object} [options]
   * @param {string} [options.sessionId]
   * @param {boolean} [options.confirmPersistence]
   * @param {string} [options.expectedWorkflowStep]
   * @return {Promise<boolean>} True when a row changed or authoritative
   *   confirmation already reflects the target state.
   */
    async persistOperationUpdate(operation, options = {}) {
      const expectedWorkflowStep =
      typeof options.expectedWorkflowStep === 'string' &&
      options.expectedWorkflowStep.length > NUM.ZERO ?
        options.expectedWorkflowStep :
        null;
      const result = await this.executeReplicaOperationGatewayMutationWithRetry(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          whereClause: this.buildReplicaOperationUpdateWhereClause(operation, expectedWorkflowStep),
          data: this.buildReplicaOperationUpdateData(operation),
          owner: REPLICA_OPERATION_OWNER_NAME,
        },
        {
          ownerId: operation.operationId,
          sessionId: options.sessionId,
          timeoutBudget: options.timeoutBudget,
          disableSystemWriteSession: options.disableSystemWriteSession === true,
          mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
          onRetryableFailure: (errorResult) =>
            this.recoverPersistedReplicaOperationMutation(operation, errorResult),
        },
        {
          sql: expectedWorkflowStep ? SQL.UPDATE_OPERATION_EXPECTING_STEP : SQL.UPDATE_OPERATION,
          params: this.buildReplicaOperationUpdateParams(operation, expectedWorkflowStep),
        },
      );
      if (!result.success) {
        const recoveredPersistedMutation = await this.recoverPersistedReplicaOperationMutation(
          operation,
          result,
        );
        if (!recoveredPersistedMutation) {
          const persistError = this.buildOperationPersistError(result);
          this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
            operationId: operation.operationId,
            ...buildControlPlaneFailurePayload(this.nodeId, result),
          });
          throw persistError;
        }
        this.syncIncompleteOperationObservation(operation);
        return true;
      }
      if (result.recoveredAfterRetryableFailure === true) {
        this.syncIncompleteOperationObservation(operation);
        return true;
      }
      const changeCount = this.extractMutationChangeCount(result);
      if (changeCount !== null && changeCount <= NUM.ZERO) {
        if (expectedWorkflowStep) {
          const authoritativeOperation = await this.queryAuthoritativeOperationById(
            operation.operationId,
            {
              authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
              requireOwnerRpcRead: false,
            },
          );
          const visibilitySatisfied = this.isReplicaOperationVisibilitySatisfied(
            operation,
            authoritativeOperation,
          );
          if (visibilitySatisfied) {
            this.syncIncompleteOperationObservation(operation);
          }
          return visibilitySatisfied;
        }
        return false;
      }
      if (options.confirmPersistence === false) {
        this.syncIncompleteOperationObservation(operation);
        return true;
      }
      this.recordOwnerPersistedTransitionVisibilityWitness(operation);
      try {
        await this.confirmReplicaOperationPersistence(operation);
      } finally {
        this.clearOwnerPersistedTransitionVisibilityWitness(operation.operationId);
      }
      this.syncIncompleteOperationObservation(operation);
      return true;
    }
    /**
   * Confirm a persisted operation through authoritative reads and diagnose
   * any cache lag as projection divergence.
   * @param {object} operation
   * @return {Promise<void>}
   */
    async confirmReplicaOperationPersistence(operation) {
      if (!operation?.operationId) {
        return null;
      }
      const visibility = await this.confirmReplicaOperationVisibility(operation);
      if (
        visibility.confirmationState ===
        REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED
      ) {
        return visibility;
      }
      if (!visibility.operation) {
        throw new Error(
          REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED +
          operation.operationId,
        );
      }
      this.emitReplicaOperationPersistenceDivergence(visibility.operation);
      return visibility;
    }
    /**
   * Retryable/deferred mutation failures can still correspond to a durable
   * authoritative row when the gateway accepted the write but surfaced a
   * pressure-shaped completion outcome. Re-prove the final state through the
   * canonical owner read before surfacing a hard failure.
   * @param {object} operation
   * @param {object|string} errorResult
   * @return {Promise<boolean>}
   * @private
   */
    shouldShortCircuitDeferredMutationRetry(errorResult) {
      return (
        errorResult?.deferRetry === true ||
      errorResult?.firstFailedParticipant?.deferRetry === true ||
      (Array.isArray(errorResult?.participantFailures) &&
        errorResult.participantFailures.some((entry) => entry?.deferRetry === true))
      );
    }
    /**
   * Retryable/deferred mutation failures can still correspond to a durable
   * authoritative row when the gateway accepted the write but surfaced a
   * pressure-shaped completion outcome. Re-prove the final state through the
   * canonical owner read before surfacing a hard failure.
   * @param {object} operation
   * @param {object|string} errorResult
   * @return {Promise<boolean>}
   * @private
   */
    async recoverPersistedReplicaOperationMutation(operation, errorResult) {
      if (
        !operation?.operationId ||
      !this.isRetryableOperationPersistError(errorResult) ||
      !this.shouldShortCircuitDeferredMutationRetry(errorResult)
      ) {
        return false;
      }
      const observation = await this.queryAuthoritativeOperationVisibilityObservation(
        operation.operationId,
        {
          authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: false,
        },
      );
      if (!this.isReplicaOperationVisibilitySatisfied(operation, observation?.operation || null)) {
        return false;
      }
      this.emitReplicaOperationPersistenceDivergence(observation.operation);
      return true;
    }
    /**
   * Confirm replica operation visibility through bounded authoritative reads.
   * Cache propagation is eventually consistent under sustained control-plane
   * load, so one missed cache observation must not be treated as a hard loss
   * when the owner-local authoritative row is still progressing.
   * @param {object} operation
   * @return {Promise<object>}
   * @private
   */
    async confirmReplicaOperationVisibility(operation) {
      this.clearAuthoritativeOperationVisibilityOutcome();
      const deadlineMs = Date.now() + this.replicaOperationAuthoritativeVisibilityTimeoutMs;
      let deferredOutcome = null;
      let sawVisibilityMismatch = false;
      while (true) {
        const observation = await this.queryAuthoritativeOperationVisibilityObservation(
          operation.operationId,
          {
            authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
            allowPriorityRecoveryDeferredVisibility: true,
            allowOwnerPersistedTransitionDeferredVisibility: true,
            expectedOperation: operation,
          },
        );
        if (this.isReplicaOperationVisibilitySatisfied(operation, observation.operation)) {
          return {
            confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED,
            operation: observation.operation,
            deferredOutcome: null,
          };
        }
        if (observation.operation) {
          sawVisibilityMismatch = true;
          deferredOutcome = null;
        }
        if (observation.deferredOutcome) {
          deferredOutcome = observation.deferredOutcome;
        }
        if (Date.now() >= deadlineMs) {
          if (deferredOutcome && sawVisibilityMismatch !== true) {
            this.lastAuthoritativeOperationVisibilityOutcome = {
              ...deferredOutcome,
            };
            return {
              confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
              operation: null,
              deferredOutcome,
            };
          }
          return {
            confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.MISSING,
            operation: null,
            deferredOutcome: null,
          };
        }
        await this.waitForReplicaOperationVisibilityRetry(
          this.replicaOperationAuthoritativeVisibilityRetryDelayMs,
        );
      }
    }

    /**
   * @param {object} expectedOperation
   * @param {object|null} observedOperation
   * @return {boolean}
   * @private
   */
    isReplicaOperationVisibilitySatisfied(expectedOperation, observedOperation) {
      if (!observedOperation || observedOperation.operationId !== expectedOperation.operationId) {
        return false;
      }
      if (
        expectedOperation.replicaId !== null &&
      expectedOperation.replicaId !== undefined &&
      observedOperation.replicaId !== expectedOperation.replicaId
      ) {
        return false;
      }
      if (
        expectedOperation.workflowStep !== null &&
      expectedOperation.workflowStep !== undefined &&
      observedOperation.workflowStep !== expectedOperation.workflowStep
      ) {
        return false;
      }
      if (
        expectedOperation.status !== null &&
      expectedOperation.status !== undefined &&
      observedOperation.status !== expectedOperation.status
      ) {
        return false;
      }
      if (
        Number.isFinite(expectedOperation.updatedAt) &&
      Number(observedOperation.updatedAt) < expectedOperation.updatedAt
      ) {
        return false;
      }
      if (
        Number.isFinite(expectedOperation.completedAt) &&
      Number(observedOperation.completedAt) < expectedOperation.completedAt
      ) {
        return false;
      }
      return true;
    }
    /**
   * Wait briefly before re-checking authoritative replica operation visibility.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */
    async waitForReplicaOperationVisibilityRetry(delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    /**
   * Emit divergence when the replica_operations cache lags the
   * authoritative row after a confirmed write.
   * @param {object} authoritativeOperation
   * @return {void}
   * @private
   */
    emitReplicaOperationPersistenceDivergence(authoritativeOperation) {
      if (!authoritativeOperation?.operationId) {
        return;
      }
      const cachedRow = this.getReplicaOperationRowFromCache(authoritativeOperation.operationId);
      const authoritativeValue = this.buildReplicaOperationDivergenceValue(authoritativeOperation);
      const cacheValue = cachedRow ?
        {
          operation_id: cachedRow.operation_id || null,
          replica_id: cachedRow.replica_id || null,
          status: cachedRow.status || null,
          workflow_step: cachedRow.workflow_step || null,
          updated_at: Number(cachedRow.updated_at) || null,
          completed_at: Number(cachedRow.completed_at) || null,
          error_message: cachedRow.error_message || null,
        } :
        null;
      const divergentFields = [];
      if (!cachedRow) {
        divergentFields.push(...Object.keys(authoritativeValue));
      } else {
        for (const fieldName of Object.keys(authoritativeValue)) {
          if ((cacheValue?.[fieldName] ?? null) !== authoritativeValue[fieldName]) {
            divergentFields.push(fieldName);
          }
        }
      }
      if (divergentFields.length === NUM.ZERO) {
        return;
      }
      const divergenceType = !cachedRow ?
        READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING :
        READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;
      const event = buildDivergenceEvent({
        divergenceType,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        ownerComponent: COORDINATOR_OWNER_COMPONENT,
        reconciliationReason: SQL_RECONCILIATION_REASON.RECOVERY_OPERATION_PERSIST_CONFIRMATION,
        rowKey: authoritativeOperation.operationId,
        cacheValue,
        authoritativeValue,
        divergentFields,
      });
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE, event);
      if (this.emitter) {
        this.emitter.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);
      }
    }
    /**
   * @param {object} operation
   * @return {object}
   * @private
   */
    buildReplicaOperationDivergenceValue(operation) {
      return {
        operation_id: operation.operationId,
        replica_id: operation.replicaId ?? null,
        status: operation.status ?? null,
        workflow_step: operation.workflowStep ?? null,
        updated_at: Number.isFinite(operation.updatedAt) ? operation.updatedAt : null,
        completed_at: Number.isFinite(operation.completedAt) ? operation.completedAt : null,
        error_message: operation.errorMessage ?? null,
      };
    }
    /**
   * Execute a mutation query with bounded retry on transient errors.
   * @param {string} sql
   * @param {Array} params
   * @param {object} [options]
   * @return {Promise<object>}
   */
    async executeOperationMutationWithRetry(sql, params, options = {}) {
      const startedAt = Date.now();
      let retryAttempt = NUM.ZERO;
      while (true) {
        const queryOptions = this.buildOperationMutationQueryOptions(options, retryAttempt);
        const result = await this.controlPlaneSystemTableGateway.executeQuery(
          sql,
          params,
          queryOptions,
        );
        if (result.success || !this.isRetryableOperationPersistError(result)) {
          return result;
        }
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = this.resolveOperationMutationRemainingRetryMs(
          elapsedMs,
          options.timeoutBudget,
        );
        if (remainingMs <= NUM.ZERO) {
          return result;
        }
        if (this.shouldRotateOperationMutationSessionOnRetry(result, options)) {
          retryAttempt += NUM.ONE;
        }
        const waitMs = Math.min(this.resolveOperationMutationRetryDelayMs(result), remainingMs);
        await this.waitForOperationPersistRetry(waitMs);
      }
    }
    /**
   * Execute one replica_operations mutation through the canonical gateway
   * mutation ingress when available, falling back to raw query execution only
   * for reduced test doubles that do not expose mutation helpers.
   * @param {object} mutation
   * @param {object} [options]
   * @param {object} [fallback]
   * @return {Promise<object>}
   * @private
   */
    async executeReplicaOperationGatewayMutationWithRetry(mutation, options = {}, fallback = {}) {
      const startedAt = Date.now();
      let retryAttempt = NUM.ZERO;
      const shouldRetryDeferredCanonicalUpdate =
      mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE &&
      this.canUseReplicaOperationMutationIngress(mutation?.operation);
      while (true) {
        const queryOptions = this.buildOperationMutationQueryOptions(options, retryAttempt);
        const result = await this.executeReplicaOperationGatewayMutation(
          mutation,
          queryOptions,
          fallback,
        );
        if (result.success || !this.isRetryableOperationPersistError(result)) {
          return result;
        }
        const recoveredAfterRetryableFailure =
        typeof options?.onRetryableFailure === TYPEOF.FUNCTION ?
          (await options.onRetryableFailure(result)) === true :
          false;
        if (recoveredAfterRetryableFailure) {
          return {success: true, recoveredAfterRetryableFailure: true};
        }
        if (
          this.shouldShortCircuitDeferredMutationRetry(result) &&
        !shouldRetryDeferredCanonicalUpdate
        ) {
          return result;
        }
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = this.resolveOperationMutationRemainingRetryMs(
          elapsedMs,
          options.timeoutBudget,
        );
        if (remainingMs <= NUM.ZERO) {
          return result;
        }
        if (this.shouldRotateOperationMutationSessionOnRetry(result, options)) {
          retryAttempt += NUM.ONE;
        }
        const waitMs = Math.min(this.resolveOperationMutationRetryDelayMs(result), remainingMs);
        await this.waitForOperationPersistRetry(waitMs);
      }
    }
    /**
   * @param {object} mutation
   * @param {object} queryOptions
   * @param {object} [fallback]
   * @return {Promise<object>}
   * @private
   */
    async executeReplicaOperationGatewayMutation(mutation, queryOptions, fallback = {}) {
      const gateway = this.controlPlaneSystemTableGateway;
      const canUseCanonicalMutationIngress = this.canUseReplicaOperationMutationIngress(
        mutation?.operation,
      );
      if (canUseCanonicalMutationIngress) {
        if (typeof gateway?.submitMutation === TYPEOF.FUNCTION) {
          return gateway.submitMutation(mutation, queryOptions);
        }
        if (
          mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT &&
        typeof gateway?.insertSystemTableRow === TYPEOF.FUNCTION
        ) {
          return gateway.insertSystemTableRow(mutation.tableName, mutation.row, queryOptions);
        }
        if (
          mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE &&
        typeof gateway?.updateSystemTableRow === TYPEOF.FUNCTION
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
        typeof gateway?.executeQuery === TYPEOF.FUNCTION &&
      typeof fallback?.sql === TYPEOF.STRING
      ) {
        return gateway.executeQuery(
          fallback.sql,
          Array.isArray(fallback?.params) ? fallback.params : [],
          queryOptions,
        );
      }
      throw new Error(
        REPLICA_OPERATION_REPOSITORY_LITERAL
          .REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS,
      );
    }
    /**
   * @param {string} operationType
   * @return {boolean}
   * @private
   */
    canUseReplicaOperationMutationIngress(operationType) {
      const gateway = this.controlPlaneSystemTableGateway;
      const cdcIntegrationService =
      typeof gateway?.resolveCdcIntegrationService === 'function' ?
        gateway.resolveCdcIntegrationService() :
        gateway?.cdcIntegrationService || null;
      if (operationType === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        return typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION;
      }
      if (operationType === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        return typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION;
      }
      return false;
    }
    /**
   * Check whether a persist error is retryable.
   * @param {object|string} errorResult
   * @return {boolean}
   */
    isRetryableOperationPersistError(errorResult) {
      if (isRetryableControlPlaneError(errorResult)) {
        return true;
      }
      const errorMessage = this.getOperationPersistErrorMessage(errorResult);
      return (
        typeof errorMessage === TYPEOF.STRING &&
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
    /**
   * Normalize one operation persist error message for retry classification.
   * @param {object|string} errorResult
   * @return {string}
   * @private
   */
    getOperationPersistErrorMessage(errorResult) {
      return typeof errorResult === TYPEOF.STRING ?
        errorResult :
        typeof errorResult?.error === TYPEOF.STRING ?
          errorResult.error :
          typeof errorResult?.message === TYPEOF.STRING ?
            errorResult.message :
            REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE;
    }
    /**
   * Preserve structured retry metadata when surfacing one failed mutation as
   * an exception so owner-lane retry classification still sees pressure hints.
   * @param {object|string|Error} errorResult
   * @param {string} [fallbackMessage]
   * @return {Error}
   * @private
   */
    buildOperationPersistError(
      errorResult,
      fallbackMessage = REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED,
    ) {
      const retryablePersistError = this.isRetryableOperationPersistError(errorResult);
      const derivedRetryAfterMs = retryablePersistError ?
        this.resolveOperationMutationRetryDelayMs(errorResult) :
        NUM.ZERO;
      const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);
      const nextRetryAfterMs =
      retryAfterMs > NUM.ZERO ?
        retryAfterMs :
        derivedRetryAfterMs > NUM.ZERO ?
          derivedRetryAfterMs :
          NUM.ZERO;
      const deferRetry =
      errorResult?.deferRetry === true ||
      errorResult?.firstFailedParticipant?.deferRetry === true ||
      (Array.isArray(errorResult?.participantFailures) &&
        errorResult.participantFailures.some((entry) => entry?.deferRetry === true)) ||
      retryablePersistError;
      const error = new Error(this.getOperationPersistErrorMessage(errorResult) || fallbackMessage);
      const errorCode = getControlPlaneErrorCode(errorResult);
      if (typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO) {
        error.code = errorCode;
        error.errorCode = errorCode;
      }
      if (nextRetryAfterMs > NUM.ZERO) {
        error.retryAfterMs = nextRetryAfterMs;
      }
      if (deferRetry) {
        error.deferRetry = true;
      }
      if (
        typeof errorResult?.reasonCode === TYPEOF.STRING &&
      errorResult.reasonCode.length > NUM.ZERO
      ) {
        error.reasonCode = errorResult.reasonCode;
      }
      if (
        typeof errorResult?.participationKind === TYPEOF.STRING &&
      errorResult.participationKind.length > NUM.ZERO
      ) {
        error.participationKind = errorResult.participationKind;
      }
      if (
        typeof errorResult?.tableName === TYPEOF.STRING &&
      errorResult.tableName.length > NUM.ZERO
      ) {
        error.tableName = errorResult.tableName;
      }
      const {participantFailures, firstFailedParticipant} =
      cloneControlPlaneFailureParticipants(errorResult);
      if (participantFailures.length > NUM.ZERO) {
        error.participantFailures = participantFailures;
      }
      if (firstFailedParticipant) {
        error.firstFailedParticipant = firstFailedParticipant;
      }
      if (
        typeof errorResult?.pressureAction === TYPEOF.STRING &&
      errorResult.pressureAction.length > NUM.ZERO
      ) {
        error.pressureAction = errorResult.pressureAction;
      }
      if (
        typeof errorResult?.pressureReason === TYPEOF.STRING &&
      errorResult.pressureReason.length > NUM.ZERO
      ) {
        error.pressureReason = errorResult.pressureReason;
      }
      if (typeof errorResult?.outcome === TYPEOF.STRING && errorResult.outcome.length > NUM.ZERO) {
        error.outcome = errorResult.outcome;
      }
      if (errorResult?.cause && !error.cause) {
        error.cause = errorResult.cause;
      }
      return error;
    }
    /**
   * Check whether a persist failure is a partition transaction contention.
   * @param {object|string} errorResult
   * @return {boolean}
   * @private
   */
    isOperationMutationPartitionContention(errorResult) {
      return (
        this.getOperationPersistErrorMessage(errorResult) ===
      PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE
      );
    }
    /**
   * Rotate repository-generated retry sessions after partition contention.
   * Explicit transition-owned sessions stay stable so the enclosing atomic
   * boundary can decide when to rotate them.
   * @param {object|string} errorResult
   * @param {object} [options]
   * @return {boolean}
   * @private
   */
    shouldRotateOperationMutationSessionOnRetry(errorResult, options = {}) {
      if (typeof options?.sessionId === TYPEOF.STRING && options.sessionId.length > NUM.ZERO) {
        return false;
      }
      return this.isOperationMutationPartitionContention(errorResult);
    }
    /**
   * Resolve the next retry delay for one failed replica_operations mutation.
   * Transaction-contention retries add light jitter so concurrent recovery
   * writers do not keep colliding in lockstep under restart pressure.
   * @param {object|string} errorResult
   * @return {number}
   * @private
   */
    resolveOperationMutationRetryDelayMs(errorResult) {
      const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);
      const baseDelayMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
        Math.floor(retryAfterMs) :
        OPERATION_PERSIST_RETRY_DELAY_MS;
      if (!this.isOperationMutationPartitionContention(errorResult)) {
        return baseDelayMs;
      }
      const jitterCeilingMs = Math.max(NUM.ONE, Math.floor(baseDelayMs / NUM.TWO));
      const boundedRandom = Math.max(NUM.ZERO, Math.min(NUM.ONE, this.random()));
      const jitterMs = Math.floor(boundedRandom * jitterCeilingMs);
      return baseDelayMs + jitterMs;
    }
    /**
   * Wait before retrying a failed persist.
   * @param {number} delayMs
   * @return {Promise<void>}
   */
    async waitForOperationPersistRetry(delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    /**
   * Clamp replica_operations retry time to the narrower of the local retry
   * window and any enclosing timeout budget.
   * @param {number} elapsedMs
   * @param {Object|null} timeoutBudget
   * @return {number}
   * @private
   */
    resolveOperationMutationRemainingRetryMs(elapsedMs, timeoutBudget = null) {
      const localRemainingMs = OPERATION_PERSIST_RETRY_TIMEOUT_MS - elapsedMs;
      if (!timeoutBudget || typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT) {
        return localRemainingMs;
      }
      const budgetRemainingMs = getRemainingBudgetMs(timeoutBudget);
      return Math.min(localRemainingMs, budgetRemainingMs);
    }
    /**
   * Build query options for an operation mutation.
   * @param {object} [options]
   * @param {number} [retryAttempt=0]
   * @return {object}
   */
    buildOperationMutationQueryOptions(options = {}, retryAttempt = NUM.ZERO) {
      const ownerId =
      typeof options.ownerId === 'string' && options.ownerId.length > NUM.ZERO ?
        options.ownerId :
        null;
      const sessionId =
      options.disableSystemWriteSession === true ?
        null :
        this.resolveOperationMutationSessionId(options, retryAttempt);
      return {
        ...CONTROL_PLANE_QUERY_OPTIONS,
        skipCacheWait: true,
        timeoutBudget:
        options.timeoutBudget &&
        typeof options.timeoutBudget === REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT ?
          options.timeoutBudget :
          undefined,
        ...(typeof sessionId === TYPEOF.STRING && sessionId.length > NUM.ZERO ? {sessionId} : {}),
        disableSystemWriteSession: options.disableSystemWriteSession === true,
        deliveryPriority: REPLICA_OPERATION_REPOSITORY_LITERAL.CRITICAL,
        workloadClass: REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE.workloadClass,
        workClass:
        REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE.workClass || PRESSURE_WORK_CLASS.CRITICAL,
        allowPressureDefer: REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE.allowPressureDefer === true,
        allowPressureDegrade:
        REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE.allowPressureDegrade === true,
        mergePolicy: options.mergePolicy || CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
        controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        controlPlaneOperationKind: REPLICA_OPERATION_REPOSITORY_LITERAL.WRITE,
        ...(ownerId ? {coalescingKey: `replica-operation:${ownerId}`} : {}),
      };
    }
    /**
   * Resolve a session ID for an operation mutation.
   * @param {object} [options]
   * @param {number} [retryAttempt=0]
   * @return {string}
   */
    resolveOperationMutationSessionId(options = {}, retryAttempt = NUM.ZERO) {
      if (typeof options.sessionId === TYPEOF.STRING && options.sessionId.length > NUM.ZERO) {
        return options.sessionId;
      }
      const ownerId =
      typeof options.ownerId === 'string' && options.ownerId.length > NUM.ZERO ?
        options.ownerId :
        uuidv4();
      const baseSessionId = `${REBALANCER_SUBSYSTEM.COORDINATOR}:${ownerId}`;
      if (retryAttempt <= NUM.ZERO) {
        return baseSessionId;
      }
      return `${baseSessionId}:retry${retryAttempt}`;
    }
    /**
   * Extract the change count from a mutation result.
   * @param {object} result
   * @return {number|null}
   */
    extractMutationChangeCount(result) {
      const candidate = Number(
        result?.changes ??
        result?.affectedRows ??
        result?.partitionResult?.changes ??
        result?.partitionResult?.affectedRows,
      );
      return Number.isFinite(candidate) ? candidate : null;
    }
    /**
   * @param {object} operation
   * @return {object}
   * @private
   */
    buildReplicaOperationRow(operation) {
      return {
        operation_id: operation.operationId,
        type: operation.type,
        partition_id: operation.partitionId,
        replica_id: operation.replicaId,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        created_at: operation.createdAt,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        entity_type: operation.entityType,
        entity_id: operation.entityId,
      };
    }
    /**
   * @param {object} operation
   * @return {object}
   * @private
   */
    buildReplicaOperationUpdateData(operation) {
      return {
        type: operation.type,
        partition_id: operation.partitionId,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        entity_type: operation.entityType,
        entity_id: operation.entityId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        replica_id: operation.replicaId,
      };
    }
    /**
   * @param {object} operation
   * @param {string|null} expectedWorkflowStep
   * @return {object}
   * @private
   */
    buildReplicaOperationUpdateWhereClause(operation, expectedWorkflowStep = null) {
      const whereClause = {operation_id: operation.operationId};
      if (typeof expectedWorkflowStep === TYPEOF.STRING && expectedWorkflowStep.length > NUM.ZERO) {
        whereClause.workflow_step = expectedWorkflowStep;
      }
      return whereClause;
    }
    /**
   * @param {object} operation
   * @param {string|null} expectedWorkflowStep
   * @return {Array}
   * @private
   */
    buildReplicaOperationUpdateParams(operation, expectedWorkflowStep = null) {
      const params = [
        operation.status,
        operation.workflowStep,
        operation.updatedAt,
        operation.completedAt,
        operation.errorMessage,
        JSON.stringify(operation.stepsHistory),
        operation.replicaId,
        operation.operationId,
      ];
      if (typeof expectedWorkflowStep === TYPEOF.STRING && expectedWorkflowStep.length > NUM.ZERO) {
        params.push(expectedWorkflowStep);
      }
      return params;
    }
    /**
   * Serialize replica operation transitions through a queue.
   * @param {Function} executionFactory
   * @return {Promise}
   */
    runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
      const lane = this.resolveReplicaOperationTransitionLane(options);
      const activeQueue = this.getReplicaOperationTransitionQueue(lane);
      const queuedExecution = activeQueue.catch(() => {}).then(async () => executionFactory());
      this.replicaOperationTransitionQueues.set(
        lane,
        queuedExecution.catch(() => {}),
      );
      return queuedExecution;
    }
    /**
   * Resolve the transition lane for one replica operation mutation.
   * Priority control-plane partitions keep a dedicated progression lane so
   * unrelated ordinary replica_operations work cannot head-of-line block
   * the partitions that publish and repair control-plane recovery itself.
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
    resolveReplicaOperationTransitionLane(options = {}) {
      const explicitLane = this.normalizeReplicaOperationTransitionLane(
        options.transitionLane || options.lane,
      );
      if (explicitLane) {
        return explicitLane;
      }
      const partitionClassificationInput =
      this.buildReplicaOperationTransitionPartitionClassificationInput(options);
      return isPriorityControlPlanePartition(partitionClassificationInput) ?
        REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY :
        REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;
    }
    /**
   * @param {string|null|undefined} lane
   * @return {string|null}
   * @private
   */
    normalizeReplicaOperationTransitionLane(lane) {
      return lane === REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY ?
        REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY :
        lane === REPLICA_OPERATION_TRANSITION_LANE.DEFAULT ?
          REPLICA_OPERATION_TRANSITION_LANE.DEFAULT :
          null;
    }
    /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
    buildReplicaOperationTransitionPartitionClassificationInput(options = {}) {
      const operation = options.operation;
      const partitionRow =
      options.partitionRow && typeof options.partitionRow === 'object' ?
        options.partitionRow :
        operation?.partitionRow && typeof operation.partitionRow === 'object' ?
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
      typeof partitionIdCandidate === 'string' ? partitionIdCandidate.trim() : null;
      return {
        partitionId: partitionId && partitionId.length > NUM.ZERO ? partitionId : null,
        partitionRow,
      };
    }
    /**
   * @param {string} lane
   * @return {Promise<*>}
   * @private
   */
    getReplicaOperationTransitionQueue(lane) {
      const normalizedLane =
      this.normalizeReplicaOperationTransitionLane(lane) ||
      REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;
      if (!this.replicaOperationTransitionQueues.has(normalizedLane)) {
        this.replicaOperationTransitionQueues.set(normalizedLane, Promise.resolve());
      }
      return this.replicaOperationTransitionQueues.get(normalizedLane);
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationMethods.prototype,
    )
  ) {
    if (methodName === 'constructor') {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationMethods};
