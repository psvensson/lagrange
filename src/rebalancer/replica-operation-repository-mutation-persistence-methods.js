const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryMutationPersistenceMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_MUTATION_MERGE_POLICY,
    CONTROL_PLANE_MUTATION_OPERATION,
    COORDINATOR_OWNER_COMPONENT,
    NUM,
    READ_MODEL_DIVERGENCE_TYPE,
    REBALANCE_COORDINATOR_EVENT,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_OWNER_NAME,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
    SQL,
    SQL_RECONCILIATION_REASON,
    SYSTEM_TABLE_NAME,
    TYPEOF,
    buildControlPlaneFailurePayload,
    buildDivergenceEvent,
  } = options;

  class ReplicaOperationRepositoryMutationPersistenceMethods {
    async persistNewOperation(operation) {
      return this.runReplicaOperationTransitionExclusive(
        async () => {
          const result =
            await this.executeReplicaOperationGatewayMutationWithRetry(
              {
                operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
                tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
                row: this.buildReplicaOperationRow(operation),
                owner: REPLICA_OPERATION_OWNER_NAME,
              },
              {
                ownerId: this.resolveReplicaOperationMutationOwnerId(operation),
                onRetryableFailure: (errorResult) =>
                  this.recoverPersistedReplicaOperationMutation(
                    operation,
                    errorResult,
                  ),
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
            const recoveredPersistedMutation =
              await this.recoverPersistedReplicaOperationMutation(
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
          this.recordOwnerPersistedTransitionVisibilityWitness(operation);
          let visibility = null;
          try {
            visibility =
              await this.confirmReplicaOperationPersistence(operation);
          } finally {
            if (
              visibility?.confirmationState !==
              REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED
            ) {
              this.clearOwnerPersistedTransitionVisibilityWitness(
                operation.operationId,
              );
            }
          }
          this.syncIncompleteOperationObservation(operation);
          const changeCount = this.extractMutationChangeCount(result);
          return changeCount === null ? true : changeCount > NUM.ZERO;
        },
        {operation},
      );
    }

    async persistOperationUpdate(operation, options = {}) {
      const expectedWorkflowStep =
        typeof options.expectedWorkflowStep === TYPEOF.STRING &&
        options.expectedWorkflowStep.length > NUM.ZERO ?
          options.expectedWorkflowStep :
          null;
      if (
        await this.shouldRejectExpectedWorkflowStepMutation(
          operation,
          expectedWorkflowStep,
        )
      ) {
        return false;
      }
      const result = await this.executeReplicaOperationGatewayMutationWithRetry(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          whereClause: this.buildReplicaOperationUpdateWhereClause(
            operation,
            expectedWorkflowStep,
          ),
          data: this.buildReplicaOperationUpdateData(operation),
          owner: REPLICA_OPERATION_OWNER_NAME,
        },
        {
          ownerId: this.resolveReplicaOperationMutationOwnerId(operation),
          sessionId: options.sessionId,
          timeoutBudget: options.timeoutBudget,
          disableSystemWriteSession: options.disableSystemWriteSession === true,
          mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
          onRetryableFailure: (errorResult) =>
            this.recoverPersistedReplicaOperationMutation(
              operation,
              errorResult,
            ),
        },
        {
          sql: expectedWorkflowStep ?
            SQL.UPDATE_OPERATION_EXPECTING_STEP :
            SQL.UPDATE_OPERATION,
          params: this.buildReplicaOperationUpdateParams(
            operation,
            expectedWorkflowStep,
          ),
        },
      );
      if (!result.success) {
        const recoveredPersistedMutation =
          await this.recoverPersistedReplicaOperationMutation(
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
          const authoritativeOperation =
            await this.queryAuthoritativeOperationById(operation.operationId, {
              authoritativeReadMode:
                CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
              requireOwnerRpcRead: false,
            });
          const visibilitySatisfied =
            this.isReplicaOperationVisibilitySatisfied(
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
        this.recordOwnerPersistedTransitionVisibilityWitness(operation);
        this.syncIncompleteOperationObservation(operation);
        return true;
      }
      this.recordOwnerPersistedTransitionVisibilityWitness(operation);
      let visibility = null;
      try {
        visibility = await this.confirmReplicaOperationPersistence(operation);
      } finally {
        if (
          visibility?.confirmationState !==
          REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED
        ) {
          this.clearOwnerPersistedTransitionVisibilityWitness(
            operation.operationId,
          );
        }
      }
      this.syncIncompleteOperationObservation(operation);
      return true;
    }

    async shouldRejectExpectedWorkflowStepMutation(
      operation,
      expectedWorkflowStep,
    ) {
      if (
        typeof expectedWorkflowStep !== TYPEOF.STRING ||
        expectedWorkflowStep.length <= NUM.ZERO
      ) {
        return false;
      }
      const authoritativeOperation =
        await this.queryAuthoritativeOperationById(operation.operationId, {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          requireOwnerRpcRead: false,
        });
      if (
        !authoritativeOperation ||
        authoritativeOperation.workflowStep === expectedWorkflowStep
      ) {
        return false;
      }
      if (
        this.isReplicaOperationVisibilitySatisfied(
          operation,
          authoritativeOperation,
        )
      ) {
        return false;
      }
      return this.isAuthoritativeOperationTerminal(authoritativeOperation);
    }

    isAuthoritativeOperationTerminal(authoritativeOperation) {
      return (
        Number.isFinite(authoritativeOperation?.completedAt) ||
        Number.isFinite(authoritativeOperation?.completed_at)
      );
    }

    async confirmReplicaOperationPersistence(operation) {
      if (!operation?.operationId) {
        return null;
      }
      const visibility =
        await this.confirmReplicaOperationVisibility(operation);
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

    async recoverPersistedReplicaOperationMutation(operation, errorResult) {
      if (
        !operation?.operationId ||
        !this.isRetryableOperationPersistError(errorResult) ||
        !this.shouldShortCircuitDeferredMutationRetry(errorResult)
      ) {
        return false;
      }
      const observation =
        await this.queryAuthoritativeOperationVisibilityObservation(
          operation.operationId,
          {
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
            requireOwnerRpcRead: false,
            allowPriorityRecoveryDeferredVisibility: false,
          },
        );
      if (
        !this.isReplicaOperationVisibilitySatisfied(
          operation,
          observation?.operation || null,
        )
      ) {
        return false;
      }
      this.emitReplicaOperationPersistenceDivergence(observation.operation);
      return true;
    }

    async confirmReplicaOperationVisibility(operation) {
      this.clearAuthoritativeOperationVisibilityOutcome();
      const deadlineMs =
        Date.now() + this.replicaOperationAuthoritativeVisibilityTimeoutMs;
      let deferredOutcome = null;
      let sawVisibilityMismatch = false;
      while (true) {
        const observation =
          await this.queryAuthoritativeOperationVisibilityObservation(
            operation.operationId,
            {
              authoritativeReadMode:
                CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
              allowPriorityRecoveryDeferredVisibility: true,
              allowOwnerPersistedTransitionDeferredVisibility: true,
              expectedOperation: operation,
            },
          );
        if (
          this.isReplicaOperationVisibilitySatisfied(
            operation,
            observation.operation,
          )
        ) {
          return {
            confirmationState:
              REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED,
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
              confirmationState:
                REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
              operation: null,
              deferredOutcome,
            };
          }
          return {
            confirmationState:
              REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.MISSING,
            operation: null,
            deferredOutcome: null,
          };
        }
        await this.waitForReplicaOperationVisibilityRetry(
          this.replicaOperationAuthoritativeVisibilityRetryDelayMs,
        );
      }
    }

    isReplicaOperationVisibilitySatisfied(
      expectedOperation,
      observedOperation,
    ) {
      if (
        !observedOperation ||
        observedOperation.operationId !== expectedOperation.operationId
      ) {
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

    async waitForReplicaOperationVisibilityRetry(delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    emitReplicaOperationPersistenceDivergence(authoritativeOperation) {
      if (!authoritativeOperation?.operationId) {
        return;
      }
      const cachedRow = this.getReplicaOperationRowFromCache(
        authoritativeOperation.operationId,
      );
      const authoritativeValue = this.buildReplicaOperationDivergenceValue(
        authoritativeOperation,
      );
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
          if (
            (cacheValue?.[fieldName] ?? null) !== authoritativeValue[fieldName]
          ) {
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
        reconciliationReason:
          SQL_RECONCILIATION_REASON.RECOVERY_OPERATION_PERSIST_CONFIRMATION,
        rowKey: authoritativeOperation.operationId,
        cacheValue,
        authoritativeValue,
        divergentFields,
      });
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE,
        event,
      );
      if (this.emitter) {
        this.emitter.emit(
          REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
          event,
        );
      }
    }

    buildReplicaOperationDivergenceValue(operation) {
      return {
        operation_id: operation.operationId,
        replica_id: operation.replicaId ?? null,
        status: operation.status ?? null,
        workflow_step: operation.workflowStep ?? null,
        updated_at: Number.isFinite(operation.updatedAt) ?
          operation.updatedAt :
          null,
        completed_at: Number.isFinite(operation.completedAt) ?
          operation.completedAt :
          null,
        error_message: operation.errorMessage ?? null,
      };
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationPersistenceMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationPersistenceMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationPersistenceMethods};
