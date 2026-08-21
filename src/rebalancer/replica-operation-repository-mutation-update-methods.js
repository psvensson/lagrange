import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';
import {
  resolveOperationOwnerLeaseExpiryForPersist,
} from './replica-operation-owner-lease.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const PERSIST_PHASE_DIVERGENCE_REINSERT = 'divergence_reinsert';
const OWNER_LEASE_TOUCH_LOG_CONTEXT = 'owner_lease_touch';

function buildOperationUpdatePersistResult(options, persisted, disposition, operation) {
  if (options?.returnDisposition !== true) {
    return persisted;
  }
  return Object.freeze({persisted, disposition, operation: operation || null});
}

// A losing terminal write adopts the winning terminal outcome (audit
// finding 6): the in-memory projection mirrors the durable winner so no
// level-triggered path re-asserts the losing terminal state.
function adoptWinningTerminalOperationOutcome(operation, winningTerminal) {
  if (!operation || !winningTerminal) {
    return;
  }
  operation.status = winningTerminal.status;
  operation.workflowStep = winningTerminal.workflowStep;
  operation.completedAt = winningTerminal.completedAt;
  operation.errorMessage = winningTerminal.errorMessage;
}

function assignReplicaOperationRepositoryMutationUpdateMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_MUTATION_MERGE_POLICY,
    CONTROL_PLANE_MUTATION_OPERATION,
    REBALANCE_COORDINATOR_LOG_MSG,
    REPLICA_OPERATION_OWNER_NAME,
    REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
    SQL,
    SYSTEM_TABLE_NAME,
    buildControlPlaneFailurePayload,
    classifySystemPartition,
  } = options;

  class ReplicaOperationRepositoryMutationUpdateMethods {
    // Post-write witness + (optional) authoritative visibility confirmation
    // for a persisted update that changed rows.
    // Record the owner-persisted-transition witness, confirm persistence
    // through the authority, and clear the witness unless the confirmation
    // deferred (a deferred confirm must keep the witness so the retry can
    // still observe the pending write). Returns the confirmation visibility so
    // callers that key on CONFIRMED/operation can read it. Shared by the
    // post-insert confirm in persistNewOperationUnlocked and
    // confirmPersistedOperationUpdate.
    async confirmPersistenceThroughWitness(operation) {
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
      return visibility;
    }

    async persistOperationUpdate(operation, options = {}) {
      const expectedWorkflowStep = this.normalizeExpectedWorkflowStep(options);
      // Terminal-transition writes deliberately carry NO expected-step CAS: the
      // owner's terminal truth must overwrite any lagging non-terminal durable
      // step (a lost progress write would otherwise wedge the CAS forever). The
      // only durable state a terminal write must not clobber is a DIFFERENT
      // terminal state that already won — the UPDATE guards on
      // completed_at IS NULL so that write changes zero rows instead of
      // clobbering the winner (audit finding 6).
      const terminalTransition = options.terminalTransition === true;
      if (terminalTransition) {
        const conflictingTerminal =
          await this.queryConflictingTerminalAuthorityOperation(operation);
        if (conflictingTerminal) {
          // A DIFFERENT durable terminal already won: adopt the winner into
          // the writer's projection and report the typed adoption so callers
          // stand the terminal-repair down instead of re-asserting their own
          // terminal state (audit finding 6).
          adoptWinningTerminalOperationOutcome(
            operation,
            conflictingTerminal,
          );
          return buildOperationUpdatePersistResult(
            options,
            false,
            REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
            conflictingTerminal,
          );
        }
      }
      if (
        await this.shouldRejectExpectedWorkflowStepMutation(
          operation,
          expectedWorkflowStep,
        )
      ) {
        return buildOperationUpdatePersistResult(
          options,
          false,
          REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
          null,
        );
      }
      const result = await this.executeReplicaOperationGatewayMutationWithRetry(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          whereClause: this.buildReplicaOperationUpdateWhereClause(
            operation,
            expectedWorkflowStep,
            {terminalTransition},
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
          sql: this.resolveOperationUpdateSql(
            expectedWorkflowStep,
            terminalTransition,
          ),
          params: this.buildReplicaOperationUpdateParams(
            operation,
            expectedWorkflowStep,
          ),
        },
      );
      if (!result.success) {
        return this.resolveFailedOperationUpdateResult(
          operation,
          result,
          options,
        );
      }
      if (result.recoveredAfterRetryableFailure === true) {
        this.syncIncompleteOperationObservation(operation);
        return buildOperationUpdatePersistResult(
          options,
          true,
          REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED,
          operation,
        );
      }
      const changeCount = this.extractMutationChangeCount(result);
      if (changeCount !== null && changeCount <= 0) {
        if (expectedWorkflowStep || terminalTransition) {
          return this.resolveZeroChangeOperationUpdate(
            operation,
            expectedWorkflowStep,
            {terminalTransition, resultOptions: options},
          );
        }
        return buildOperationUpdatePersistResult(
          options,
          false,
          REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
          null,
        );
      }
      return this.confirmPersistedOperationUpdate(operation, options);
    }

    // An expected-step CAS write pins the step in the WHERE clause; a
    // terminal write guards on completed_at IS NULL instead; the plain
    // update carries neither guard.
    resolveOperationUpdateSql(expectedWorkflowStep, terminalTransition) {
      if (expectedWorkflowStep) {
        return SQL.UPDATE_OPERATION_EXPECTING_STEP;
      }
      return terminalTransition ?
        SQL.UPDATE_OPERATION_TERMINAL :
        SQL.UPDATE_OPERATION;
    }

    async confirmPersistedOperationUpdate(operation, options) {
      if (options.confirmPersistence === false) {
        this.recordOwnerPersistedTransitionVisibilityWitness(operation);
        this.syncIncompleteOperationObservation(operation);
        await this.touchOperationOwnerLeaseWhenRequested(operation, options);
        return buildOperationUpdatePersistResult(
          options,
          true,
          REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
          operation,
        );
      }
      await this.confirmPersistenceThroughWitness(operation);
      await this.touchOperationOwnerLeaseWhenRequested(operation, options);
      return buildOperationUpdatePersistResult(
        options,
        true,
        REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
        operation,
      );
    }

    // The owner-lease touch is opt-in per write (renewOwnerLease: true): only
    // the canonical owner transition-persistence boundary requests it, so
    // reduced direct-repository callers keep byte-identical write shapes. It
    // never fires for a terminal projection — terminal state needs no live
    // owner lease, and skipping the touch keeps terminal-write shapes
    // byte-identical for the CAS suites.
    async touchOperationOwnerLeaseWhenRequested(operation, options = {}) {
      if (
        options?.renewOwnerLease !== true ||
        options?.terminalTransition === true
      ) {
        return false;
      }
      return this.touchOperationOwnerLease(operation);
    }

    // Durable owner-lease heartbeat (audit findings 5+14): after the
    // canonical write succeeds, re-stamp ONLY the lease column so the row's
    // lease_expires_at tracks the owning writer. The touch is fail-soft — a
    // lease-write failure must never fail the transition that just landed —
    // and carries no status/step payload, so it cannot reorder the workflow
    // projection. A terminal row is untouched (completed_at IS NULL guard):
    // terminal state no longer needs a live owner lease.
    async touchOperationOwnerLease(operation) {
      const leaseExpiresAt = resolveOperationOwnerLeaseExpiryForPersist(
        operation,
        this.nodeId,
      );
      if (!operation?.operationId || !Number.isFinite(leaseExpiresAt)) {
        return false;
      }
      try {
        const result = await this.executeOperationMutationWithRetry(
          SQL.UPDATE_OPERATION_OWNER_LEASE,
          [leaseExpiresAt, operation.operationId],
          {
            // Formation-time relief (quest formation-barrier-spread-release-
            // oscillation): a ledger self-coupled operation's lease touch
            // must not bind to the seed-led write-session tables either —
            // the same session-less intent as its admission INSERT and every
            // transition write. Non-ledger lease touches keep their prior
            // write shape byte-identical.
            disableSystemWriteSession:
              classifySystemPartition({
                partitionId: operation?.partitionId,
              }).operationLedger === true,
          },
        );
        return result?.success === true;
      } catch (error) {
        this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
          operationId: operation.operationId,
          phase: OWNER_LEASE_TOUCH_LOG_CONTEXT,
          error: error?.message || String(error),
        });
        return false;
      }
    }

    // A failed gateway mutation either recovers through the already-applied
    // witness (the write landed despite the retryable failure) or escalates.
    async resolveFailedOperationUpdateResult(operation, result, options = {}) {
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
      return buildOperationUpdatePersistResult(
        options,
        true,
        REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED,
        operation,
      );
    }

    // Guarded (expected-step or terminal) update that changed zero rows: the
    // durable state either already reflects the write (idempotent success), or
    // the row diverged from the authoritative partition state. For a terminal
    // write whose authority row is a DIFFERENT terminal, the loser adopts the
    // winning terminal outcome instead of re-asserting its own (audit finding
    // 6: first-terminal-wins, never last-writer-wins).
    async resolveZeroChangeOperationUpdate(
      operation,
      expectedWorkflowStep,
      options = {},
    ) {
      const terminalTransition = options.terminalTransition === true;
      const resultOptions = options.resultOptions || {};
      const authoritativeOperation =
        await this.queryReplicaOperationPersistenceAuthorityOperation(operation);
      const visibilitySatisfied = this.isReplicaOperationVisibilitySatisfied(
        operation,
        authoritativeOperation,
      );
      if (visibilitySatisfied) {
        this.syncIncompleteOperationObservation(operation);
        return buildOperationUpdatePersistResult(
          resultOptions,
          true,
          REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
          authoritativeOperation,
        );
      }
      if (
        terminalTransition &&
        authoritativeOperation &&
        this.isAuthoritativeOperationTerminal(authoritativeOperation)
      ) {
        // Lost the terminal CAS: the authority row is a DIFFERENT terminal
        // state that already won. Adopt the winner into the writer's
        // projection and report the typed adoption so callers stand the
        // terminal-repair down instead of re-arming it.
        adoptWinningTerminalOperationOutcome(operation, authoritativeOperation);
        this.syncIncompleteOperationObservation(operation);
        return buildOperationUpdatePersistResult(
          resultOptions,
          false,
          REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
          authoritativeOperation,
        );
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
            return buildOperationUpdatePersistResult(
              resultOptions,
              true,
              REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED,
              operation,
            );
          }
        } catch (reinsertError) {
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
            operationId: operation.operationId,
            phase: PERSIST_PHASE_DIVERGENCE_REINSERT,
            error: reinsertError?.message || String(reinsertError),
          });
        }
      }
      return buildOperationUpdatePersistResult(
        resultOptions,
        false,
        REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        null,
      );
    }

    // A terminal write is idempotent against its own durable state and must
    // yield only to a DIFFERENT durable terminal state (a concurrent owner
    // already terminated this operation another way). Returns the winning
    // terminal operation when the authority row is a different durable
    // terminal, null otherwise (idempotent replay, lagging non-terminal row,
    // or missing row — the zero-change divergence arm re-inserts).
    async queryConflictingTerminalAuthorityOperation(operation) {
      const authoritativeOperation =
        await this.queryReplicaOperationPersistenceAuthorityOperation(operation);
      if (!authoritativeOperation) {
        return null;
      }
      if (
        this.isReplicaOperationVisibilitySatisfied(
          operation,
          authoritativeOperation,
        )
      ) {
        return null;
      }
      return this.isAuthoritativeOperationTerminal(authoritativeOperation) ?
        authoritativeOperation :
        null;
    }

    // Boolean facade over the conflicting-terminal query for callers that
    // only need the rejection decision.
    async shouldRejectConflictingTerminalTransitionMutation(operation) {
      return (
        (await this.queryConflictingTerminalAuthorityOperation(operation)) !==
        null
      );
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
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationUpdateMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationUpdateMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationUpdateMethods};
