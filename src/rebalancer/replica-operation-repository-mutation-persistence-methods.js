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
    READ_MODEL_DIVERGENCE_TYPE,
    REBALANCE_COORDINATOR_EVENT,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_OWNER_NAME,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
    SQL,
    SQL_RECONCILIATION_REASON,
    SYSTEM_TABLE_NAME,
    buildControlPlaneFailurePayload,
    buildDivergenceEvent,
  } = options;

  class ReplicaOperationRepositoryMutationPersistenceMethods {
    async persistNewOperation(operation) {
      return this.runReplicaOperationTransitionExclusive(
        async () => this.persistNewOperationUnlocked(operation),
        {operation},
      );
    }

    /**
     * Insert the operation row WITHOUT taking the transition-exclusive lane
     * (CL-017(b): the divergence re-insert path runs from within update
     * persistence, whose callers may already hold the lane — taking it
     * again would deadlock the serialized queue).
     *
     * The canonical-ingress insert is OR-IGNORE idempotent (ignoreExisting):
     * operation ids are minted once, so a retry after a lost outcome
     * (post-apply delivery failure now honestly surfaced instead of silently
     * acked) lands on its own earlier row with zero changes instead of a
     * UNIQUE-constraint participant failure. The already-applied claim is
     * then proven by the authoritative visibility confirmation below — never
     * inferred from the write result alone. (The raw-SQL fallback lane keeps
     * the plain INSERT: production gateways always expose the canonical
     * ingress, and the fallback exists for reduced test harnesses.)
     * @param {Object} operation
     * @return {Promise<boolean>}
     */
    async persistNewOperationUnlocked(operation) {
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
                ignoreExisting: true,
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
      if (changeCount === null || changeCount > 0) {
        return true;
      }
      // OR-IGNORE collision: zero changed rows means an identical-id row
      // already exists — a lost-outcome retry landing on its own earlier
      // write. The visibility confirmation above is the already-applied
      // witness: it either observed the expected row (CONFIRMED, with the
      // authoritative operation attached) or threw. Anything short of that
      // observed row stays a failed persist.
      return Boolean(
        visibility?.confirmationState ===
          REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED &&
          visibility?.operation,
      );
    }

    normalizeExpectedWorkflowStep(options) {
      return typeof options.expectedWorkflowStep === 'string' &&
        options.expectedWorkflowStep.length > 0 ?
        options.expectedWorkflowStep :
        null;
    }

    async persistOperationUpdate(operation, options = {}) {
      const expectedWorkflowStep = this.normalizeExpectedWorkflowStep(options);
      // Terminal-transition writes deliberately carry NO expected-step CAS: the
      // owner's terminal truth must overwrite any lagging non-terminal durable
      // step (a lost progress write would otherwise wedge the CAS forever). The
      // only durable state a terminal write must not clobber is a DIFFERENT
      // terminal state that already won.
      const terminalTransition = options.terminalTransition === true;
      if (
        terminalTransition &&
        (await this.shouldRejectConflictingTerminalTransitionMutation(
          operation,
        ))
      ) {
        return false;
      }
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
        return this.resolveFailedOperationUpdateResult(operation, result);
      }
      if (result.recoveredAfterRetryableFailure === true) {
        this.syncIncompleteOperationObservation(operation);
        return true;
      }
      const changeCount = this.extractMutationChangeCount(result);
      if (changeCount !== null && changeCount <= 0) {
        if (expectedWorkflowStep || terminalTransition) {
          return this.resolveZeroChangeOperationUpdate(
            operation,
            expectedWorkflowStep,
          );
        }
        return false;
      }
      return this.confirmPersistedOperationUpdate(operation, options);
    }

    // Post-write witness + (optional) authoritative visibility confirmation
    // for a persisted update that changed rows.
    async confirmPersistedOperationUpdate(operation, options) {
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

    // A failed gateway mutation either recovers through the already-applied
    // witness (the write landed despite the retryable failure) or escalates.
    async resolveFailedOperationUpdateResult(operation, result) {
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

    // Guarded (expected-step or terminal) update that changed zero rows: the
    // durable state either already reflects the write (idempotent success), or
    // the row diverged from the authoritative partition state.
    async resolveZeroChangeOperationUpdate(operation, expectedWorkflowStep) {
      const authoritativeOperation =
        await this.queryAuthoritativeOperationById(operation.operationId, {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          requireOwnerRpcRead: false,
        });
      const visibilitySatisfied = this.isReplicaOperationVisibilitySatisfied(
        operation,
        authoritativeOperation,
      );
      if (visibilitySatisfied) {
        this.syncIncompleteOperationObservation(operation);
        return visibilitySatisfied;
      }
      // CL-017(b): the UPDATE committed but affected zero rows AND the
      // authoritative read cannot see the row the owner created — the
      // row is MISSING from the partition state that applied the write
      // (the post-churn divergence witness: 'No row found for CDC
      // update' 144ms after the row's own insert-CDC). Retrying the
      // UPDATE no-ops forever and the operation never durably leaves
      // its step; re-insert the owner's copy instead of looping.
      if (!authoritativeOperation) {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.OPERATION_ROW_DIVERGENCE_REINSERT,
          {
            operationId: operation.operationId,
            partitionId: operation.partitionId,
            workflowStep: operation.workflowStep,
            expectedWorkflowStep,
          },
        );
        try {
          const reinserted = await this.persistNewOperationUnlocked(operation);
          if (reinserted) {
            this.syncIncompleteOperationObservation(operation);
            return true;
          }
        } catch (reinsertError) {
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
            operationId: operation.operationId,
            phase: 'divergence_reinsert',
            error: reinsertError?.message || String(reinsertError),
          });
        }
      }
      return visibilitySatisfied;
    }

    // A terminal write is idempotent against its own durable state and must
    // yield only to a DIFFERENT durable terminal state (a concurrent owner
    // already terminalized this operation another way). A missing row falls
    // through to the zero-change divergence arm, which re-inserts.
    async shouldRejectConflictingTerminalTransitionMutation(operation) {
      const authoritativeOperation =
        await this.queryAuthoritativeOperationById(operation.operationId, {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          requireOwnerRpcRead: false,
        });
      if (!authoritativeOperation) {
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

    async shouldRejectExpectedWorkflowStepMutation(
      operation,
      expectedWorkflowStep,
    ) {
      if (
        typeof expectedWorkflowStep !== 'string' ||
        expectedWorkflowStep.length <= 0
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
      if (divergentFields.length === 0) {
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
