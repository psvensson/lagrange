import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway.js';
import {isDeepStrictEqual} from 'node:util';
import {
  buildAcknowledgedRemoveCasFields, buildStrandedRemoveCasFields,
  isSameAcknowledgedRemovePreimage, readCurrentRemoveSubject,
} from './operation-workflow-stranded-remove-repair.js';
import {elapsedWorkflowPreimageMatches} from './operation-workflow-elapsed-preimage.js';
import {
  assertOperationUpdateRecord, assertOperationUpdateSubject, buildOperationUpdateOutcome,
  invalidOperationPersistenceOutcome,
} from './replica-operation-update-outcome.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';
import {
  resolveOperationOwnerLeaseExpiryForPersist,
} from './replica-operation-owner-lease.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {hasLiveCreateGrant, requiresPartitionCreateGrant, operationCarriesReplicaCreateAdmission} from
  './replica-operation-create-admission-fields.js';
import {operationCarriesMessageGroupMembership} from
  './replica-operation-message-group-membership-fields.js';

const UPDATE_CONFIRMATION_UNRESOLVED = 'Committed operation update confirmation is unresolved';
const UPDATE_CONFIRMATION_UNRESOLVED_CODE = 'OPERATION_PERSISTENCE_CONFIRMATION_UNRESOLVED';
const UPDATE_NOT_CONFIRMED = 'confirmation does not prove the requested write';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const EXPECTED_STEPS_HISTORY_REQUIRES_STEP_CAS =
  'expectedStepsHistory refines a non-terminal expected-step CAS';
const NO_OBSERVED_OPERATION_TRANSITION = Object.freeze({outcome: null});
const PERSIST_PHASE_DIVERGENCE_REINSERT = 'divergence_reinsert';
const OWNER_LEASE_TOUCH_LOG_CONTEXT = 'owner_lease_touch';

// A losing terminal write adopts the winning terminal outcome (audit
// finding 6): the in-memory projection mirrors the durable winner so no
// level-triggered path re-asserts the losing terminal state.
function adoptWinningTerminalOperationOutcome(operation, winningTerminal) {
  if (!operation || !winningTerminal) {
    return;
  }
  assertOperationUpdateRecord(winningTerminal, {terminal: true});
  assertOperationUpdateSubject(operation, winningTerminal);
  Object.assign(operation, structuredClone(winningTerminal));
}

// The observed-history CAS operand, serialized exactly as the row's
// steps_history is written. It only refines a non-terminal expected-step CAS.
function serializeExpectedStepsHistory(
  options,
  expectedWorkflowStep,
  terminalTransition,
) {
  if (options.expectedStepsHistory === undefined) {
    return null;
  }
  if (
    !Array.isArray(options.expectedStepsHistory) ||
    !expectedWorkflowStep ||
    terminalTransition
  ) {
    throw new Error(EXPECTED_STEPS_HISTORY_REQUIRES_STEP_CAS);
  }
  return JSON.stringify(options.expectedStepsHistory);
}

function refusedUpdate() {
  return buildOperationUpdateOutcome({
    persisted: false, disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED, operation: null,
  });
}

async function readAcknowledgedRemoveObservation(repository, preimage) {
  const {operation} = await readCurrentRemoveSubject(repository, preimage);
  return operation && (operation.completedAt !== null ||
    isSameAcknowledgedRemovePreimage(preimage, operation)) ?
    {operation, deferredOutcome: null} :
    {operation: null, deferredOutcome: null, outcome: refusedUpdate()};
}

function hasWinningTerminalOperation(repository, terminalTransition,
  authoritativeOperation) {
  if (!terminalTransition || !authoritativeOperation) return false;
  return repository.isAuthoritativeOperationTerminal(authoritativeOperation);
}

function requiresExistingOperationRow(operation, options) {
  return Boolean(options.elapsedWorkflowPreimage || options.acknowledgedRemovePreimage ||
    options.expectedStepsHistory !== undefined ||
    options.requireExactCreateTarget === true ||
    operationCarriesReplicaCreateAdmission(operation) ||
    operationCarriesMessageGroupMembership(operation));
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
    isReplicaOperationUpdateSatisfied(expected, observed) {
      return this.isReplicaOperationVisibilitySatisfied(expected, observed) &&
        expected.createdAt === observed.createdAt &&
        isDeepStrictEqual(this.buildReplicaOperationUpdateData(expected),
          this.buildReplicaOperationUpdateData(observed));
    }

    /** Resolve existing durable truth before a workflow prepares a new effect. */
    async observeOperationTransition(operation, step, options = {}) {
      const observation = options.acknowledgedRemovePreimage ?
        await readAcknowledgedRemoveObservation(this, options.acknowledgedRemovePreimage) :
        await this.queryReplicaOperationPersistenceAuthorityObservation(
          operation, {requireAbsenceConfirmation: true});
      if (observation.outcome) return observation;
      const durable = observation.operation;
      if (!durable) return {...observation, ...NO_OBSERVED_OPERATION_TRANSITION};
      assertOperationUpdateRecord(durable);
      assertOperationUpdateSubject(operation, durable);
      const terminal = durable.completedAt !== null;
      const exact = durable.workflowStep === step && (options.exactRequest === true ?
        this.isReplicaOperationUpdateSatisfied(operation, durable) :
        options.terminalTransition !== true || options.stepMetadata === undefined &&
          durable.errorMessage === options.terminalErrorMessage);
      const replay = exact && (options.terminalTransition !== true || terminal);
      const disposition = replay ? REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY :
        REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED;
      const unresolvedSameStep = options.exactRequest === true && durable.workflowStep === step;
      return {...observation, outcome: terminal || replay ? buildOperationUpdateOutcome({
        persisted: replay, disposition, operation: durable,
      }) : unresolvedSameStep ? buildOperationUpdateOutcome({persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED, operation: null}) : null};
    }

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
      // A confirmation may observe the row already advanced past this write
      // (even terminal); the observation records what was confirmed, never
      // the superseded write.
      this.syncIncompleteOperationObservation(
        visibility?.confirmationState ===
          REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED ?
          visibility.operation :
          operation,
      );
      return visibility;
    }

    async persistOperationUpdate(operation, options = {}) {
      assertOperationUpdateRecord(operation, {terminal: options.terminalTransition === true});
      const expectedWorkflowStep = this.normalizeExpectedWorkflowStep(options);
      // Terminal-transition writes deliberately carry NO expected-step CAS: the
      // owner's terminal truth must overwrite any lagging non-terminal durable
      // step (a lost progress write would otherwise wedge the CAS forever). The
      // only durable state a terminal write must not clobber is a DIFFERENT
      // terminal state that already won — the UPDATE guards on
      // completed_at IS NULL so that write changes zero rows instead of
      // clobbering the winner (audit finding 6).
      const terminalTransition = options.terminalTransition === true;
      const expectedStepsHistory = serializeExpectedStepsHistory(
        options,
        expectedWorkflowStep,
        terminalTransition,
      );
      const grantRequired = expectedWorkflowStep !== WORKFLOW_STEP.CREATING &&
        operation.workflowStep === WORKFLOW_STEP.CREATING &&
        requiresPartitionCreateGrant(operation);
      if (grantRequired && !hasLiveCreateGrant(operation)) {
        return buildOperationUpdateOutcome({persisted: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED, operation: null});
      }
      const {acknowledgedRemovePreimage} = options;
      const removeReplyCasFields = acknowledgedRemovePreimage ?
        buildAcknowledgedRemoveCasFields(
          acknowledgedRemovePreimage, operation, terminalTransition) :
        options.strandedRemovePreimage === undefined ? {} :
          buildStrandedRemoveCasFields(options.strandedRemovePreimage, operation,
            expectedWorkflowStep, expectedStepsHistory);
      const elapsedPreimage = options.elapsedWorkflowPreimage;
      let elapsedCasFields;
      if (terminalTransition) {
        // Recovery credit requires a proved preimage. Unavailable authority
        // cannot establish that a later matching terminal was newly applied.
        const preimage = acknowledgedRemovePreimage ?
          await readAcknowledgedRemoveObservation(this, acknowledgedRemovePreimage) :
          await this.queryAuthoritativeOperationVisibilityObservation(
            operation.operationId, {
              authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
              leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
              requireAbsenceConfirmation: true,
              requireCompleteExactKey: Boolean(elapsedPreimage),
              expectedOperation: operation,
              timeoutBudget: options.timeoutBudget,
            });
        if (preimage.deferredOutcome) {
          const error = new Error(preimage.deferredOutcome.reasonCode);
          error.code = preimage.deferredOutcome.reasonCode;
          error.deferredOutcome = preimage.deferredOutcome;
          error.deferRetry = true;
          error.retryAfterMs = preimage.deferredOutcome.retryAfterMs;
          throw error;
        }
        if (preimage.outcome) return preimage.outcome;
        const terminalPreimage = preimage.operation;
        if (terminalPreimage) {
          assertOperationUpdateRecord(terminalPreimage);
          assertOperationUpdateSubject(operation, terminalPreimage);
        }
        if (terminalPreimage && this.isAuthoritativeOperationTerminal(terminalPreimage)) {
          const replay = this.isReplicaOperationUpdateSatisfied(operation, terminalPreimage);
          // A known identical terminal preimage is replay before mutation. A
          // lost reply to its inevitable zero-row CAS must never reclassify it
          // as a newly recovered write. A different terminal remains the winner.
          adoptWinningTerminalOperationOutcome(operation, terminalPreimage);
          return buildOperationUpdateOutcome({
            persisted: replay,
            disposition: replay ? REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY :
              REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
            operation: terminalPreimage,
          });
        }
        if (elapsedPreimage) {
          const fields = preimage.persistedCasFields;
          if (!elapsedWorkflowPreimageMatches(terminalPreimage, elapsedPreimage) ||
              fields?.source_replica_id === undefined ||
              typeof fields.steps_history !== 'string') {
            return buildOperationUpdateOutcome({
              persisted: false,
              disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
              operation: null,
            });
          }
          // The REPLACE decoder may take the source from history. The SQL CAS
          // compares the actual stored source and history values from this read.
          elapsedCasFields = {...elapsedPreimage, ...fields};
        }
      }
      if (
        await this.shouldRejectExpectedWorkflowStepMutation(
          operation,
          expectedWorkflowStep,
        )
      ) {
        return buildOperationUpdateOutcome({
          persisted: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
          operation: null,
        });
      }
      const result = await this.executeReplicaOperationGatewayMutationWithRetry(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          whereClause: this.buildReplicaOperationUpdateWhereClause(
            operation,
            expectedWorkflowStep,
            {
              terminalTransition,
              createGrantCasFields: grantRequired ? {
                workflow_step: WORKFLOW_STEP.SENDING, completed_at: null,
                replica_id: operation.replicaId, target_node_id: operation.targetNodeId,
                create_admission_state: operation.createAdmissionState,
                create_admission_token: operation.createAdmissionToken,
                create_admission_attempt_token: operation.createAdmissionAttemptToken,
                create_admission_attempt_seq: operation.createAdmissionAttemptSeq,
                create_admission_replica_created_at: operation.createAdmissionReplicaCreatedAt,
                create_admission_workflow_updated_at: operation.createAdmissionWorkflowUpdatedAt,
                create_admission_owner_incarnation: operation.createAdmissionOwnerIncarnation,
              } : null,
              requireCreateAdmissionAbsent:
                options.requireCreateAdmissionAbsent === true,
              requireExactCreateTarget: options.requireExactCreateTarget === true,
              expectedStepsHistory,
              removeReplyCasFields,
              elapsedWorkflowPreimage: elapsedCasFields,
            },
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
            this.recoverPersistedReplicaOperationUpdate(
              operation,
              errorResult,
            ),
          // A terminal authority check belongs at the mutation attempt, not
          // at the caller that projected the row. Retry attempts repeat it.
          beforeAttempt: options.terminalAdmission,
        },
      );
      if (result.admissionRefused === true) {
        return buildOperationUpdateOutcome({
          persisted: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
          operation: null,
        });
      }
      if (result.success !== true) {
        return this.resolveFailedOperationUpdateResult(
          operation,
          result,
          options,
        );
      }
      if (result.recoveredAfterRetryableFailure === true) {
        this.syncIncompleteOperationObservation(operation);
        return buildOperationUpdateOutcome({
          persisted: true,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED,
          operation,
        });
      }
      const changeCount = this.extractMutationChangeCount(result);
      if (changeCount === null) {
        return this.resolveUncountedOperationUpdate(operation, acknowledgedRemovePreimage);
      }
      if (changeCount <= 0) {
        if (expectedWorkflowStep || terminalTransition) {
          return this.resolveZeroChangeOperationUpdate(
            operation,
            expectedWorkflowStep,
            {terminalTransition, acknowledgedRemovePreimage,
              expectedStepsHistory: options.expectedStepsHistory,
              requireExactCreateTarget: options.requireExactCreateTarget,
              elapsedWorkflowPreimage: options.elapsedWorkflowPreimage},
          );
        }
        return buildOperationUpdateOutcome({
          persisted: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
          operation: null,
        });
      }
      return this.confirmPersistedOperationUpdate(operation, options);
    }

    async resolveUncountedOperationUpdate(operation, acknowledgedRemovePreimage) {
      const observation = await this.observeOperationTransition(operation, operation.workflowStep,
        {exactRequest: true, acknowledgedRemovePreimage});
      // An absent count proves no new write. A separate authority observation
      // may prove replay or another winner; uncertainty retains the obligation.
      return observation.outcome || buildOperationUpdateOutcome({persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED, operation: null});
    }

    async confirmPersistedOperationUpdate(operation, options) {
      // The changed-row result proves a write occurred. Its returned winner
      // must come from authority, including fields not changed by this UPDATE.
      try {
        await this.touchOperationOwnerLeaseWhenRequested(operation, options);
        const visibility = await this.confirmPersistenceThroughWitness(operation);
        const observed = visibility?.operation;
        if (!observed || visibility.confirmationState !==
            REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED) {
          const error = new Error(UPDATE_CONFIRMATION_UNRESOLVED);
          error.code = UPDATE_CONFIRMATION_UNRESOLVED_CODE;
          error.deferredOutcome = visibility?.deferredOutcome;
          error.deferRetry = true;
          error.retryAfterMs = visibility?.deferredOutcome?.retryAfterMs;
          throw error;
        }
        assertOperationUpdateRecord(observed);
        assertOperationUpdateSubject(operation, observed);
        if ((options.expectedStepsHistory || options.acknowledgedRemovePreimage) &&
            observed.createdAt !== operation.createdAt) {
          throw invalidOperationPersistenceOutcome(UPDATE_NOT_CONFIRMED);
        }
        const exact = this.isReplicaOperationUpdateSatisfied(operation, observed);
        if (!exact && observed.completedAt === null) {
          throw invalidOperationPersistenceOutcome(UPDATE_NOT_CONFIRMED);
        }
        return buildOperationUpdateOutcome({
          persisted: exact,
          disposition: exact ? REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED :
            REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
          operation: observed,
        });
      } catch (error) {
        // Preserve this fact separately from whether its resulting state is
        // currently observable. The workflow retains the unresolved obligation.
        error.operationWriteCommitted = true;
        throw error;
      }
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

    async recoverPersistedReplicaOperationUpdate(operation, errorResult) {
      const observation =
        await this.observeRetryableReplicaOperationMutation(operation, errorResult);
      const observed = observation?.operation;
      if (!observed) return false;
      assertOperationUpdateRecord(observed);
      assertOperationUpdateSubject(operation, observed);
      if (!this.isReplicaOperationUpdateSatisfied(operation, observed)) return false;
      this.emitReplicaOperationPersistenceDivergence(observed);
      Object.assign(operation, structuredClone(observed));
      return true;
    }

    // A failed gateway mutation either recovers through the already-applied
    // witness (the write landed despite the retryable failure) or escalates.
    async resolveFailedOperationUpdateResult(operation, result) {
      const recoveredPersistedMutation =
        await this.recoverPersistedReplicaOperationUpdate(
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
      return buildOperationUpdateOutcome({
        persisted: true,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED,
        operation,
      });
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
      const authoritativeOperation = options.acknowledgedRemovePreimage ?
        (await readCurrentRemoveSubject(this, options.acknowledgedRemovePreimage)).operation :
        await this.queryReplicaOperationPersistenceAuthorityOperation(operation);
      const visibilitySatisfied = this.isReplicaOperationUpdateSatisfied(
        operation,
        authoritativeOperation,
      );
      if (visibilitySatisfied) {
        this.syncIncompleteOperationObservation(operation);
        return buildOperationUpdateOutcome({
          persisted: true,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
          operation: authoritativeOperation,
        });
      }
      if (hasWinningTerminalOperation(
        this,
        terminalTransition,
        authoritativeOperation,
      )) {
        // Lost the terminal CAS: the authority row is a DIFFERENT terminal
        // state that already won. Adopt the winner into the writer's
        // projection and report the typed adoption so callers stand the
        // terminal-repair down instead of re-arming it.
        adoptWinningTerminalOperationOutcome(operation, authoritativeOperation);
        this.syncIncompleteOperationObservation(operation);
        return buildOperationUpdateOutcome({
          persisted: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
          operation: authoritativeOperation,
        });
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
        // A vanished row also destroys the durable linearization record for
        // an admitted physical CREATE. Re-inserting an in-memory admission
        // tuple could resurrect CLOSED work or a generation removed after
        // the snapshot was taken. Only admission-free operation rows retain
        // the older divergence-repair authority; admitted work must defer to
        // startup/operation recovery without recreating its authority.
        if (requiresExistingOperationRow(operation, options)) {
          return buildOperationUpdateOutcome({
            persisted: false,
            disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
            operation: null,
          });
        }
        try {
          const reinserted = await this.repairRetainedOperation(operation);
          if (reinserted) {
            this.syncIncompleteOperationObservation(operation);
            return buildOperationUpdateOutcome({
              persisted: true,
              disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED,
              operation,
            });
          }
        } catch (reinsertError) {
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
            operationId: operation.operationId,
            phase: PERSIST_PHASE_DIVERGENCE_REINSERT,
            error: reinsertError?.message || String(reinsertError),
          });
        }
      }
      return buildOperationUpdateOutcome({
        persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        operation: null,
      });
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
        this.isReplicaOperationUpdateSatisfied(
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
      if (!authoritativeOperation) return false;
      assertOperationUpdateRecord(authoritativeOperation);
      return authoritativeOperation.completedAt !== null;
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
