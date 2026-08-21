import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from './replica-operation-insert-disposition.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const ABSENT_VISIBILITY_VALUE = null;

function buildNewOperationPersistResult(options, disposition, operation) {
  if (options?.returnDisposition !== true) {
    return true;
  }
  return Object.freeze({persisted: true, disposition, operation});
}

function assignReplicaOperationRepositoryMutationPersistenceMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
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
    classifySystemPartition,
  } = options;

  // Formation-time relief (quest formation-barrier-spread-release-oscillation):
  // an operation that manages an operation-ledger partition persists its OWN
  // admission row into that ledger. Binding that insert to a system write
  // session couples it to the seed-led, unspread write-session bookkeeping
  // tables — the circular dependency that starves ledger spread exactly while
  // the ledger is concentrated. Ledger self-coupled inserts therefore use the
  // same independent session-less persistence intent every step-transition
  // write already uses (operation-workflow-owner-execution-lane
  // buildOperationTransitionPersistOptions); the insert stays OR-IGNORE
  // idempotent with authoritative-read outcome confirmation.
  function isLedgerSelfCoupledOperationInsert(operation) {
    return classifySystemPartition({
      partitionId: operation?.partitionId,
    }).operationLedger === true;
  }

  async function resolveNewOperationInsertCollision(
    repository,
    operation,
    resultOptions,
  ) {
    // A zero-change OR-IGNORE proves that the mutation participant already
    // holds this primary key. Verify that claim at the partition leader:
    // routing to an arbitrary owner can hit a lagging co-located replica and
    // turn a durable idempotent retry into a false missing-row failure.
    const existingOperation =
      await repository.queryAuthoritativeOperationById(operation.operationId, {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      });
    if (!existingOperation) {
      const conflictingTargetOperation =
        await repository.queryAuthoritativeOperationByTargetClaimKey(
          operation.targetClaimKey,
        );
      if (conflictingTargetOperation) {
        repository.emitReplicaOperationPersistenceDivergence(
          conflictingTargetOperation,
        );
        return buildNewOperationPersistResult(
          resultOptions,
          REPLICA_OPERATION_INSERT_DISPOSITION.TARGET_CLAIM_CONFLICT,
          conflictingTargetOperation,
        );
      }
      throw new Error(
        REPLICA_OPERATION_REPOSITORY_LITERAL
          .AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED +
          operation.operationId,
      );
    }
    if (
      resultOptions?.returnDisposition !== true &&
      !repository.isReplicaOperationVisibilitySatisfied(
        operation,
        existingOperation,
      )
    ) {
      throw new Error(
        REPLICA_OPERATION_REPOSITORY_LITERAL
          .AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED +
          operation.operationId,
      );
    }
    repository.emitReplicaOperationPersistenceDivergence(existingOperation);
    return buildNewOperationPersistResult(
      resultOptions,
      REPLICA_OPERATION_INSERT_DISPOSITION.EXISTING,
      existingOperation,
    );
  }

  class ReplicaOperationRepositoryMutationPersistenceMethods {
    async persistNewOperation(operation, options = {}) {
      return this.runReplicaOperationTransitionExclusive(
        async () => this.persistNewOperationUnlocked(operation, options),
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
     * then proven by an authoritative read — never inferred from the write
     * result alone. Callers that own deterministic operation identities may
     * request the insert disposition to reuse a non-terminal row or advance
     * after a terminal row. The default boolean contract still requires a
     * content match. The raw-SQL fallback remains for reduced test harnesses.
     * @param {Object} operation
     * @param {Object} [options={}] - Optional typed-disposition request.
     * @return {Promise<boolean|Object>}
     */
    async persistNewOperationUnlocked(operation, options = {}) {
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
                disableSystemWriteSession:
                  isLedgerSelfCoupledOperationInsert(operation),
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
                  operation.targetClaimKey || null,
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
                  operation.membershipPublicationEpoch ?? null,
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
        return buildNewOperationPersistResult(
          options,
          REPLICA_OPERATION_INSERT_DISPOSITION.UNKNOWN,
          operation,
        );
      }
      if (result.recoveredAfterRetryableFailure === true) {
        this.syncIncompleteOperationObservation(operation);
        return buildNewOperationPersistResult(
          options,
          REPLICA_OPERATION_INSERT_DISPOSITION.UNKNOWN,
          operation,
        );
      }
      const changeCount = this.extractMutationChangeCount(result);
      if (changeCount !== null && changeCount <= 0) {
        return resolveNewOperationInsertCollision(this, operation, options);
      }
      const visibility = await this.confirmPersistenceThroughWitness(operation);
      // Stamp the durable owner lease on the fresh row (audit findings 5+14)
      // — fail-soft and never on the insert's own write shape; the lease
      // heartbeat rides the dedicated touch statement after the insert lands.
      await this.touchOperationOwnerLease(operation);
      return buildNewOperationPersistResult(
        options,
        changeCount === null ?
          REPLICA_OPERATION_INSERT_DISPOSITION.UNKNOWN :
          REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
        visibility?.operation || operation,
      );
    }

    normalizeExpectedWorkflowStep(options) {
      return typeof options.expectedWorkflowStep === 'string' &&
        options.expectedWorkflowStep.length > 0 ?
        options.expectedWorkflowStep :
        null;
    }

    async queryReplicaOperationPersistenceAuthorityOperation(operation, options = {}) {
      const observation =
        await this.queryReplicaOperationPersistenceAuthorityObservation(
          operation,
          options,
        );
      return observation?.operation || null;
    }

    async queryReplicaOperationPersistenceAuthorityObservation(operation, options = {}) {
      if (!operation?.operationId) {
        return Object.freeze({operation: null, deferredOutcome: null});
      }
      const observationOptions = {
        allowPriorityRecoveryDeferredVisibility:
          options.allowPriorityRecoveryDeferredVisibility === true,
        allowOwnerPersistedTransitionDeferredVisibility:
          options.allowOwnerPersistedTransitionDeferredVisibility === true,
        expectedOperation: operation,
      };
      const localObservation =
        await this.queryAuthoritativeOperationVisibilityObservation(
          operation.operationId,
          {
            ...observationOptions,
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          },
        );
      if (
        this.isReplicaOperationVisibilitySatisfied(
          operation,
          localObservation?.operation || null,
        )
      ) {
        return localObservation;
      }
      const authorityObservation =
        await this.queryAuthoritativeOperationVisibilityObservation(
          operation.operationId,
          {
            ...observationOptions,
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE
                .OWNER_RPC_PREFERRED_SQL_FALLBACK,
            leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
          },
        );
      if (authorityObservation?.operation) {
        return authorityObservation;
      }
      // A failed/deferred/empty escalated read means "authority unreachable",
      // not "row absent": keep the local evidence so a locally visible
      // divergent row still drives terminal-conflict rejection and
      // zero-change resolution instead of masquerading as a missing row.
      if (localObservation?.operation) {
        return localObservation;
      }
      return authorityObservation;
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
      let deferredOutcome = ABSENT_VISIBILITY_VALUE;
      let sawVisibilityMismatch = false;
      while (true) {
        const localObservation =
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
            localObservation.operation,
          )
        ) {
          return {
            confirmationState:
              REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED,
            operation: localObservation.operation,
            deferredOutcome: ABSENT_VISIBILITY_VALUE,
          };
        }
        if (localObservation.operation) {
          sawVisibilityMismatch = true;
          deferredOutcome = ABSENT_VISIBILITY_VALUE;
        }
        if (localObservation.deferredOutcome) {
          deferredOutcome = localObservation.deferredOutcome;
        }
        const authorityObservation =
          await this.queryAuthoritativeOperationVisibilityObservation(
            operation.operationId,
            {
              authoritativeReadMode:
                CONTROL_PLANE_AUTHORITATIVE_READ_MODE
                  .OWNER_RPC_PREFERRED_SQL_FALLBACK,
              allowPriorityRecoveryDeferredVisibility: true,
              allowOwnerPersistedTransitionDeferredVisibility: true,
              expectedOperation: operation,
              leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
            },
          );
        if (
          this.isReplicaOperationVisibilitySatisfied(
            operation,
            authorityObservation.operation,
          )
        ) {
          return {
            confirmationState:
              REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED,
            operation: authorityObservation.operation,
            deferredOutcome: ABSENT_VISIBILITY_VALUE,
          };
        }
        if (authorityObservation.operation) {
          sawVisibilityMismatch = true;
          deferredOutcome = ABSENT_VISIBILITY_VALUE;
        }
        if (authorityObservation.deferredOutcome) {
          deferredOutcome = authorityObservation.deferredOutcome;
        }
        if (Date.now() >= deadlineMs) {
          if (deferredOutcome && sawVisibilityMismatch !== true) {
            this.lastAuthoritativeOperationVisibilityOutcome = {
              ...deferredOutcome,
            };
            return {
              confirmationState:
                REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
              operation: ABSENT_VISIBILITY_VALUE,
              deferredOutcome,
            };
          }
          return {
            confirmationState:
              REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.MISSING,
            operation: ABSENT_VISIBILITY_VALUE,
            deferredOutcome: ABSENT_VISIBILITY_VALUE,
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
