import {OperationWorkflowRecoveryStatusReconcile} from './operation-workflow-recovery-status-reconcile.js';
import {
  applyOperationWorkflowExecutorOutcomeReconcileMethods,
} from './operation-workflow-executor-outcome-reconcile-methods.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {resolveOperationCurrentStepEntry} from './operation-step-age.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  NUM,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_TABLE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_SOURCE_STATES,
  PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_TARGET_OBSERVED_WORKFLOW_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE_BY_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
  REBALANCE_COORDINATOR_LOG_MSG,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  TYPEOF,
  WORKFLOW_STEP,
  isPriorityControlPlanePartition,
} = SHARED;

const TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE = Object.freeze({
  CACHE_EMPTY: 'cache_empty',
  OBSERVED_TARGET_PROGRESS: 'observed_target_progress',
  PRIORITY_RECOVERY_SCAN: 'priority_recovery_scan',
  CACHE_ONLY: 'cache_only',
});

const TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_MODE_BY_STATE = Object.freeze(
  new Map([
    [
      TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE.PRIORITY_RECOVERY_SCAN,
      INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE
        .AUTHORITATIVE_SUPPLEMENT,
    ],
  ]),
);

const TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE.CACHE_EMPTY,
    matches: (evidence) => evidence.cacheVisibleOperationCount === NUM.ZERO,
  }),
  Object.freeze({
    state:
      TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE.OBSERVED_TARGET_PROGRESS,
    matches: (evidence) =>
      evidence.observedTargetProgressVisible === true,
  }),
  Object.freeze({
    state:
      TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE.PRIORITY_RECOVERY_SCAN,
    matches: (evidence) =>
      evidence.priorityRecoveryOperationVisible === true,
  }),
  Object.freeze({
    state: TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE.CACHE_ONLY,
    matches: () => true,
  }),
]);

class OperationWorkflowRecoveryTimeout extends OperationWorkflowRecoveryStatusReconcile {
  isPriorityRecoveryTimeoutVisibilityOperation(operation) {
    const partitionId = operation?.partitionId || null;
    return (
      this.isCriticalSystemPartition(partitionId) ||
      isPriorityControlPlanePartition({partitionId})
    );
  }

  buildTimeoutIncompleteVisibilitySupplementEvidence(
    cachedOperations,
  ) {
    const operations = Array.isArray(cachedOperations) ?
      cachedOperations :
      [];
    return Object.freeze({
      cacheVisibleOperationCount: operations.length,
      observedTargetProgressVisible:
        operations.some((operation) =>
          this.hasObservedOperationRowTargetProgress(operation),
        ),
      priorityRecoveryOperationVisible:
        operations.some((operation) =>
          this.isPriorityRecoveryTimeoutVisibilityOperation(operation) &&
          this.isDispatchRetryableWorkflowStep(operation),
        ),
    });
  }

  resolveTimeoutIncompleteVisibilitySupplementMode(cachedOperations) {
    const evidence =
      this.buildTimeoutIncompleteVisibilitySupplementEvidence(
        cachedOperations,
      );
    const state =
      TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_STATE.CACHE_ONLY;
    return (
      TIMEOUT_INCOMPLETE_VISIBILITY_SUPPLEMENT_MODE_BY_STATE.get(state) ||
      INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.NONE
    );
  }

  // DT6 seam: the timeout-check orchestration reads time through a TimeSource when one is injected
  // (default: none -> Date.now(), byte-identical), so the convergence harness can drive checkTimeouts
  // on a virtual clock. RealTimeSource.now() === Date.now(), so production hosting is unchanged.
  resolveTimeoutCheckNowMs() {
    const timeSource = this.timeSource;
    if (timeSource && typeof timeSource.now === TYPEOF.FUNCTION) {
      return timeSource.now();
    }
    return Date.now();
  }

  async checkTimeouts() {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const now = this.resolveTimeoutCheckNowMs();
    if (
      this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO &&
      now - this.lastEmptyIncompleteOperationQueryAtMs <
        this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return;
    }

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryCachedIncompleteOperations() :
      [];
    if (cachedIncompleteOps.length > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    } else if (
      canUseCacheObservationBoundary &&
      this.shouldDelayEmptyIncompleteOperationQuery(now)
    ) {
      return;
    }

    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
        visibilitySupplementMode:
          this.resolveTimeoutIncompleteVisibilitySupplementMode(
            cachedIncompleteOps,
          ),
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY
    ) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return;
    }

    const timeoutReconcileTasks = [];

    for (const operation of incompleteOps) {
      if (this.repository.isOperationTerminal(operation)) {
        continue;
      }
      const operationDrainSnapshot =
        await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
      if (
        await this.wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(
          operation,
          operationDrainSnapshot,
        )
      ) {
        continue;
      }
      if (
        !this.shouldEnterOperationLifecycleFromDrainSnapshot(
          operationDrainSnapshot,
        )
      ) {
        continue;
      }

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        operation.operationId,
      );

      const reconcileTask = this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          const visibilityObservation =
            await this.repository.getOperationByIdVisibilityObservation(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const timeoutOperation = this.selectTimeoutReconcileOperation(
            visibilityObservation,
            operation,
          );
          if (!timeoutOperation) {
            return;
          }
          if (this.repository.isOperationTerminal(timeoutOperation)) {
            return;
          }
          const timeoutOperationDrainSnapshot =
            await this.buildPriorityRecoveryOperationDrainSnapshot(
              timeoutOperation,
            );
          if (
            await this.wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(
              timeoutOperation,
              timeoutOperationDrainSnapshot,
            )
          ) {
            return;
          }
          if (
            !this.shouldEnterOperationLifecycleFromDrainSnapshot(
              timeoutOperationDrainSnapshot,
            )
          ) {
            return;
          }

          await this.reconcileTimeoutOperation(
            timeoutOperation,
            this.resolveTimeoutCheckNowMs(),
          );
        },
      ).catch((error) => {
        if (
          this.deferTransitionRetry(operation.operationId, error, {
            boundary: 'timeout_reconcile',
            workflowStep: operation?.workflowStep || null,
            partitionId: operation?.partitionId || null,
            updatedAt: operation?.updatedAt,
            createdAt: operation?.createdAt,
          })
        ) {
          return;
        }
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
          {
            operationId: operation.operationId,
            error: error.message,
            nodeId: this.nodeId,
          },
        );
      });
      timeoutReconcileTasks.push(reconcileTask);
    }

    if (timeoutReconcileTasks.length > NUM.ZERO) {
      await Promise.all(timeoutReconcileTasks);
    }

    // Periodic reservation reconciliation (Req 4.4)
    await this.reconcileReservations().catch((error) => {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {error: error.message},
      );
    });
  }

  isPreSyncStep(step) {
    return [
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
    ].includes(step);
  }

  resolveOperationLifecycleAction(
    operation,
    cause = OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS,
  ) {
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      if (this.isPreSyncStep(operation.workflowStep)) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY;
      }
    }

    if (
      operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE;
    }

    if (this.isRemoveInitialDispatchPhase(operation)) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.STOPPING &&
      (operation.type === OperationType.REMOVE ||
        operation.type === OperationType.REPLACE)
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.PENDING ||
      operation.workflowStep === WORKFLOW_STEP.SENDING ||
      operation.workflowStep === WORKFLOW_STEP.CREATING ||
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS;
    }

    return OPERATION_LIFECYCLE_ACTION.NOOP;
  }

  isPriorityRecoveryOperationDrainCandidate(operation) {
    if (
      !operation ||
      !PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES.has(
        operation.type,
      ) ||
      this.repository.isOperationTerminal(operation)
    ) {
      return false;
    }
    return (
      isPriorityControlPlanePartition({partitionId: operation.partitionId}) &&
      PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS.has(
        operation.workflowStep,
      )
    );
  }

  resolveOperationStepEnteredAtMs(operation) {
    const stepEntry = resolveOperationCurrentStepEntry(operation);
    if (!stepEntry) {
      return null;
    }
    return this.normalizeOperationDrainEpochMillis(stepEntry.timestamp);
  }

  resolvePriorityRecoveryOperationDrainStepAgeMs(
    operation,
    now = Date.now(),
  ) {
    const stepEnteredAtMs = this.resolveOperationStepEnteredAtMs(operation);
    const updatedAtMs = this.normalizeOperationDrainEpochMillis(
      operation?.updatedAt,
    );
    const createdAtMs = this.normalizeOperationDrainEpochMillis(
      operation?.createdAt,
    );
    // Prefer time-in-current-step over updatedAt: a wedged op whose dispatch
    // retry loop re-persists updatedAt every ~1s would otherwise never age past
    // its step timeout, so neither the concurrent-op staleness gate (CL-043) nor
    // the timeout reaper that share this clock could ever retire it (CL-044).
    const baseMs = stepEnteredAtMs ?? updatedAtMs ?? createdAtMs;
    if (baseMs === null) {
      return null;
    }
    return Math.max(NUM.ZERO, Math.floor(now - baseMs));
  }

  normalizeOperationDrainEpochMillis(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > NUM.ZERO) {
      return Math.floor(numeric);
    }
    if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed) && parsed > NUM.ZERO) {
        return parsed;
      }
    }
    return null;
  }

  isPriorityRecoveryOperationDrainStepStale(operation, now = Date.now()) {
    const ageMs = this.resolvePriorityRecoveryOperationDrainStepAgeMs(
      operation,
      now,
    );
    if (ageMs === null) {
      return false;
    }
    const timeoutMs = Number(
      this.getTimeoutForStep(operation?.workflowStep, operation),
    );
    return (
      Number.isFinite(timeoutMs) &&
      timeoutMs > NUM.ZERO &&
      ageMs >= timeoutMs
    );
  }

  // CL-043: the concurrent-partition-operation safety gate (evaluateRemoveSafety)
  // defers a critical REMOVE/REPLACE whenever ANY non-terminal op shares the
  // partition. A persist-failed surplus-drain REPLACE — whose replica_operations
  // coordination row never committed (control-plane write timeout during recovery)
  // — is stuck non-terminal with no terminal-timeout anchor, so it blocks every
  // peer drain forever (surplus 5/3 -> readiness oscillation -> scheduler-leader
  // thrash -> leadership_unstable).
  //
  // Treat a concurrent op whose configured step timeout has already elapsed as
  // NOT active. This does not invent a looser notion of "active": such an op is,
  // by the system's own policy, already a reaper candidate
  // (isPriorityRecoveryOperationDrainStepStale + checkTimeouts). A genuinely
  // in-flight op bumps updatedAt each step and stays within its step timeout, so
  // it still blocks; an op with no parseable timestamps cannot be aged and is
  // conservatively still treated as active. The downstream quorum projection in
  // evaluateRemoveSafety independently protects the voter-ready minimum, so the
  // gate is a serialization guard, not the sole quorum protector.
  isConcurrentOperationStalePastStepTimeout(operation, now = Date.now()) {
    return this.isPriorityRecoveryOperationDrainStepStale(operation, now);
  }

  // CL-044: a concurrent op stuck SYNCING/moving to a down or unreachable target
  // cannot make progress, yet it head-of-line-blocks peer recovery that targets
  // LIVE nodes via the concurrent-partition-operation serialization gate. Its
  // dispatch retry loop keeps the staleness clock fresh, so the step-timeout
  // exclusion can lag the recovery deadline. Treat such an op as not-active when
  // its move target fails a live ping. This is a serialization relief only: the
  // independent voter-ready-minimum, published-membership, and per-peer-ping
  // checks still protect quorum for the op that is allowed to proceed. A live,
  // pingable target still blocks (pingNode returns false fast for a
  // non-CONNECTED peer, so a clearly-down target does not delay the gate).
  async isConcurrentOperationTargetUncontactable(operation) {
    const targetNodeId =
      operation?.targetNodeId || operation?.target_node_id || null;
    if (!targetNodeId || targetNodeId === this.nodeId) {
      return false;
    }
    const router = this.messageRouter;
    if (!router || typeof router.pingNode !== TYPEOF.FUNCTION) {
      return false;
    }
    const reachable = await router.pingNode(targetNodeId).catch(() => false);
    return reachable === false;
  }

  resolvePriorityRecoveryOperationDrainState(
    completion,
    sourceSnapshot,
    releaseEvidence = null,
    operation = null,
  ) {
    if (!completion || typeof completion !== TYPEOF.OBJECT) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE;
    }
    if (
      !PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completion.state,
      )
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT;
    }
    const sourceState =
      sourceSnapshot?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED;
    const releaseDecision =
      this.decidePriorityRecoveryOperationDrainRelease(releaseEvidence);
    if (
      releaseDecision.state ===
      PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_STATE.RELEASE
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
        .OWNER_UNAVAILABLE_RELEASED;
    }
    const mappedState =
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE_BY_SOURCE_STATE.get(
        sourceState,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE;
    if (
      mappedState ===
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE &&
      completion.state === PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED &&
      operation &&
      this.isPriorityRecoveryOperationDrainStepStale(operation)
    ) {
      // Without this escape a remote-owned op whose owner never returns and
      // whose source evidence stays unprovable would hold quiesce forever.
      // CONVERGED-only: in-flight-counted spread satisfaction must not get a
      // stale op killed while its own placement is what satisfies the spread.
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
        .STALE_WITHOUT_RETIREMENT_EVIDENCE;
    }
    return mappedState;
  }

  decidePriorityRecoveryOperationDrainRelease(evidence) {
    const decision =
      PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_TABLE.find((entry) =>
        entry.matches(evidence || Object.freeze({})),
      );
    return Object.freeze({
      state:
        decision?.state ||
        PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_DECISION_STATE.HOLD,
    });
  }

  isPriorityRecoveryDrainOwnerUnavailable(ownerNodeId, operation) {
    if (
      typeof ownerNodeId !== TYPEOF.STRING ||
      ownerNodeId.length === NUM.ZERO ||
      ownerNodeId === this.nodeId
    ) {
      return false;
    }
    try {
      return !this.isNodeReadyForRouting(ownerNodeId, {
        partitionId: operation?.partitionId || null,
        decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
        participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
      });
    } catch {
      return false;
    }
  }

  isPriorityRecoveryOperationDrainReleaseEligibleReplace(operation) {
    if (operation?.type !== OperationType.REPLACE) {
      return false;
    }
    if (
      PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_REPLACE_WORKFLOW_STEPS.has(
        operation?.workflowStep,
      )
    ) {
      return true;
    }
    if (
      !PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_TARGET_OBSERVED_WORKFLOW_STEPS
        .has(operation?.workflowStep) ||
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    return (
      this.repository.getObservedReplicaStatusFromCache(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      ) === ReplicaStatus.ACTIVE
    );
  }

  buildPriorityRecoveryOperationDrainReleaseEvidence(
    operation,
    completion,
    sourceSnapshot,
  ) {
    const ownerNodeId =
      this.repository.resolveOperationOwnerNodeId(operation) || null;
    const completionAccepted =
      completion &&
      typeof completion === TYPEOF.OBJECT &&
      PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completion.state,
      );
    const sourceState =
      sourceSnapshot?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE;
    return Object.freeze({
      releaseEligibleReplace:
        this.isPriorityRecoveryOperationDrainReleaseEligibleReplace(operation),
      completionAccepted,
      sourceRemovalPending:
        PRIORITY_RECOVERY_OPERATION_DRAIN_RELEASE_SOURCE_STATES.has(
          sourceState,
        ),
      remoteOwnerUnavailable:
        this.isPriorityRecoveryDrainOwnerUnavailable(ownerNodeId, operation),
      ownerNodeId,
      sourceState,
    });
  }
}

applyOperationWorkflowExecutorOutcomeReconcileMethods(
  OperationWorkflowRecoveryTimeout,
);

export {OperationWorkflowRecoveryTimeout};
