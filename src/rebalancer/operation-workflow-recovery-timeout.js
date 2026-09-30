import {OperationWorkflowRecoveryStatusReconcile} from './operation-workflow-recovery-status-reconcile.js';
import {
  applyOperationWorkflowExecutorOutcomeReconcileMethods,
} from './operation-workflow-executor-outcome-reconcile-methods.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {
  PRE_SYNC_WORKFLOW_STEPS,
  RECONCILE_REPLICA_STATUS_WORKFLOW_STEPS,
  isActiveReplaceSourceRemovalPhase,
} from './replica-operation-step-policy.js';
import {resolveOperationCurrentStepEntry} from './operation-step-age.js';
import {
  resolveOperationDrainOwnerAvailability,
} from './operation-owner-availability-policy.js';

// Fenced orphan adoption (audit findings 5+14): incomplete operations on
// ORDINARY partitions whose recorded owner is remote join the sweep when
// the durable lease is absent (unfenced row) or expired at `now` — a
// live remote lease stays fenced out. The repository's adoption read is the
// fence owner; adoption reuses the same gated lifecycle reconcile
// (single-flight + staleness/prompt gate) as locally-owned orphans, so an
// adopted op is re-driven, never blindly double-dispatched. The adopting
// successor stamps its OWN lease before reconciling (fail-soft).
function extendOrphanSweepWithFencedAdoptions({
  repository,
  ownedOps,
  now,
  touchOwnerLease,
}) {
  const adoptableOps =
    typeof repository.queryOrphanAdoptableOperations === 'function' ?
      repository.queryOrphanAdoptableOperations(now).filter((op) =>
        op && !repository.isOperationTerminal(op),
      ) :
      [];
  const sweepOps = [...ownedOps];
  const sweptOperationIds = new Set(ownedOps.map((op) => op.operationId));
  for (const op of adoptableOps) {
    if (!sweptOperationIds.has(op.operationId)) {
      sweptOperationIds.add(op.operationId);
      sweepOps.push(op);
      void touchOwnerLease(op);
    }
  }
  return sweepOps;
}

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
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
  WORKFLOW_STEP,
  classifySystemPartition,
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
    matches: (evidence) => evidence.cacheVisibleOperationCount === 0,
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
const ORPHAN_REDRIVE_RECONCILE_BOUNDARY = 'orphan_redrive';

class OperationWorkflowRecoveryTimeout extends OperationWorkflowRecoveryStatusReconcile {
  isPriorityRecoveryTimeoutVisibilityOperation(operation) {
    const partitionId = operation?.partitionId || null;
    const partitionClassification = classifySystemPartition({partitionId});
    return (
      partitionClassification.systemTable ||
      partitionClassification.priorityControlPlane
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
    if (timeSource && typeof timeSource.now === 'function') {
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
      this.lastEmptyIncompleteOperationQueryAtMs > 0 &&
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
    if (cachedIncompleteOps.length > 0) {
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
      ).catch((error) =>
        this.handleReplicaOperationReconcileError(
          operation,
          error,
          'timeout_reconcile',
        ),
      );
      timeoutReconcileTasks.push(reconcileTask);
    }

    if (timeoutReconcileTasks.length > 0) {
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

  /**
   * Level-triggered operation-liveness reconciler — the holistic safety net for
   * the whole ORPHANED-OPERATION class, not one shape of it.
   *
   * Operation progress is normally EDGE-triggered (an in-memory executor-outcome
   * event + dispatch-pending re-entry triggers on the owner). Those edges are
   * LOST across owner/leadership churn, and each ad-hoc re-drive path is gated on
   * a narrow phase/step predicate (phase===DISPATCH_PENDING, step===SYNCING, ...),
   * so an op stuck in any off-predicate state is orphaned forever — the recovery
   * reconcile never fires. We kept discovering this one shape at a time
   * (phantom-SYNCING; then the persisted-not-dispatched terminal-phase zombie).
   *
   * Instead of another per-shape sibling, this drives the existing level-triggered
   * reconcile-to-truth core (reconcileOperationLifecycle) for EVERY locally-owned
   * non-terminal op that ground truth says is actionable, on the coordinator's
   * periodic timer — independent of which edge was supposed to fire. It uses the
   * NON-DESTRUCTIVE PROGRESS cause (never RECOVERY), so the pre-sync FAIL semantics
   * that make startup handleRecovery destructive can never fire here. It is bounded
   * to be a SAFETY NET, not a competitor to the edge path:
   *   - locally-owned + single-flight (re-reads under the op lock → idempotent, no
   *     double-dispatch, preserves the single-writer guarantee);
   *   - self-throttled to the empty-scan backoff cadence (no SQL hammering);
   *   - its own authoritative-preferred discovery, so an orphan invisible to the
   *     cache-bounded checkTimeouts sweep is still found;
   *   - acts ONLY on an op whose replica has reached an actionable terminal/active
   *     truth the row has not applied (prompt — e.g. phantom-SYNCING), OR that is
   *     STALE past its step timeout (the edge path is demonstrably not driving it —
   *     e.g. a never-dispatched surplus REMOVE). A genuinely in-flight op that is
   *     still progressing within its step budget is left untouched.
   * Quorum/remove-safety is enforced inside reconcileOperationLifecycle (drain
   * snapshot + evaluateRemoveSafety) before any action, so this inherits it.
   *
   * Scope: the orphaned-EXISTING-op class. It does NOT manufacture ops the planner
   * never created, nor fix transport/2PC dispatch failures — those are distinct.
   *
   * @return {Promise<void>}
   */
  async reconcileOrphanedOperations() {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }
    const now = this.resolveTimeoutCheckNowMs();
    const lastReconcileAtMs = this.lastOrphanedOperationReconcileAtMs ?? 0;
    if (
      lastReconcileAtMs > 0 &&
      now - lastReconcileAtMs < this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return;
    }
    this.lastOrphanedOperationReconcileAtMs = now;

    const cachedIncompleteOps =
      this.repository.hasReplicaOperationCacheObservationBoundary() ?
        await this.repository.queryCachedIncompleteOperations() :
        [];
    const observation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(observation?.operations) ?
      observation.operations :
      [];
    const ownedOps = incompleteOps.filter((op) =>
      op &&
      !this.repository.isOperationTerminal(op) &&
      this.repository.isOperationLocallyOwned(op),
    );
    // Fenced orphan adoption (audit findings 5+14): the fenced sweep
    // extension is owned by a module-level helper to keep this class inside
    // the 800-line budget.
    const sweepOps = extendOrphanSweepWithFencedAdoptions({
      repository: this.repository,
      ownedOps,
      now,
      touchOwnerLease: (op) =>
        typeof this.repository.touchOperationOwnerLease === 'function' ?
          this.repository.touchOperationOwnerLease(op) :
          false,
    });
    if (sweepOps.length === 0) {
      return;
    }
    await Promise.all(
      sweepOps.map(async (op) => {
        if (!(await this.shouldReconcileOrphanedOperation(op, now))) {
          return;
        }
        await this.operationWorkflowRunExclusive(
          this.getOperationOwnerSingleFlightKey(op.operationId),
          () =>
            this.reconcileOperationLifecycle(op, {
              cause: OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS,
              now,
            }),
        ).catch((error) =>
          this.handleReplicaOperationReconcileError(
            op,
            error,
            ORPHAN_REDRIVE_RECONCILE_BOUNDARY,
          ),
        );
      }),
    );
  }

  /**
   * Gate for the level-triggered orphan reconciler: act ONLY on an op that is
   * either (a) behind an actionable replica truth (the replica reached
   * ACTIVE/REMOVED/FAILED but the row has not applied it — drive it promptly,
   * e.g. phantom-SYNCING), or (b) STALE past its current step timeout (the edge
   * path is demonstrably not progressing it — e.g. a never-dispatched surplus
   * REMOVE). A genuinely in-flight op still within its step budget is skipped so
   * the reconciler never races the edge path or fails healthy work.
   *
   * @param {Object} op
   * @param {number} now
   * @return {Promise<boolean>}
   */
  async shouldReconcileOrphanedOperation(op, now) {
    // Cheap, synchronous staleness check FIRST: a stale op is re-driven
    // regardless of replica status, so it needs no authoritative read. This
    // keeps the per-op authoritative read off the hot path for the common
    // stale case (matters on the CPU-starved seed). Anchored on the step-entry
    // timestamp (operation-step-age.js), so same-step dispatch-retry re-stamping
    // can't keep a wedged op looking fresh (CL-044).
    const stepEntry = resolveOperationCurrentStepEntry(op);
    const stepStartedAtMs = Number(stepEntry?.timestamp);
    if (Number.isFinite(stepStartedAtMs)) {
      const stepTimeoutMs = this.getTimeoutForStep(op.workflowStep, op);
      if (
        Number.isFinite(stepTimeoutMs) &&
        stepTimeoutMs > 0 &&
        now - stepStartedAtMs >= stepTimeoutMs
      ) {
        return true;
      }
    }
    // Otherwise act only when the replica has reached an actionable truth the
    // operation row has not yet applied (prompt advance-to-truth, e.g. a
    // SYNCING row whose replica is already ACTIVE).
    let actualStatus = null;
    try {
      actualStatus = await this.getReconciledReplicaStatus(
        op.replicaId,
        op.partitionId,
        op.targetNodeId,
      );
    } catch {
      return false;
    }
    return (
      actualStatus === ReplicaStatus.ACTIVE ||
      actualStatus === ReplicaStatus.REMOVED ||
      actualStatus === ReplicaStatus.FAILED
    );
  }

  /**
   * Shared error handling for a single replica-operation reconcile task: defer
   * transient control-plane errors via the retry grace, otherwise log.
   *
   * @param {Object} operation
   * @param {Error} error
   * @param {string} boundary
   * @return {void}
   */
  handleReplicaOperationReconcileError(operation, error, boundary) {
    if (
      this.deferTransitionRetry(operation.operationId, error, {
        boundary,
        workflowStep: operation?.workflowStep || null,
        partitionId: operation?.partitionId || null,
        updatedAt: operation?.updatedAt,
        createdAt: operation?.createdAt,
      })
    ) {
      return;
    }
    this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, {
      operationId: operation.operationId,
      error: error.message,
      nodeId: this.nodeId,
    });
  }

  isPreSyncStep(step) {
    return PRE_SYNC_WORKFLOW_STEPS.has(step);
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
      isActiveReplaceSourceRemovalPhase(operation.type, operation.workflowStep)
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
      RECONCILE_REPLICA_STATUS_WORKFLOW_STEPS.has(operation.workflowStep)
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
      classifySystemPartition({partitionId: operation.partitionId})
        .priorityControlPlane &&
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

  // The drain's clock is the owner's clock (resolveTimeoutCheckNowMs:
  // RealTimeSource.now() === Date.now() in production), the same clock the
  // dispatch gate stamps its park evidence with.
  resolvePriorityRecoveryOperationDrainStepAgeMs(
    operation,
    now = this.resolveTimeoutCheckNowMs(),
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
    return Math.max(0, Math.floor(now - baseMs));
  }

  normalizeOperationDrainEpochMillis(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
    if (typeof value === 'string' && value.length > 0) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  }

  isPriorityRecoveryOperationDrainStepStale(
    operation,
    now = this.resolveTimeoutCheckNowMs(),
  ) {
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
      timeoutMs > 0 &&
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
  isConcurrentOperationStalePastStepTimeout(
    operation,
    now = this.resolveTimeoutCheckNowMs(),
  ) {
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
    if (!router || typeof router.pingNode !== 'function') {
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
    if (!completion || typeof completion !== 'object') {
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
    return this.resolvePriorityRecoveryOperationDrainStaleState(
      mappedState,
      completion,
      operation,
      sourceState,
    );
  }

  // A stale classification of a PENDING ledger self-move that this owner's
  // own dispatch lane parked recently (fresh park evidence, bounded by the
  // PENDING step budget from the LAST park) is progress: the drain settles it
  // RECOVERING_DISPATCH_PARKED (NOOP) and the lane claims on the incumbents'
  // terminal. Without fresh evidence — never parked, or a lane silent for a
  // full PENDING_TIMEOUT_MS — the stale rules below apply unchanged.
  resolvePriorityRecoveryOperationDrainStaleState(
    mappedState,
    completion,
    operation,
    sourceState,
  ) {
    const staleState = this.resolvePriorityRecoveryOperationDrainStepStaleState(
      mappedState,
      completion,
      operation,
      sourceState,
    );
    if (
      staleState ===
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
          .STALE_WITHOUT_RETIREMENT_EVIDENCE &&
      this.hasFreshOperationLedgerSelfMoveParkEvidence(operation)
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.RECOVERING_DISPATCH_PARKED;
    }
    return staleState;
  }

  resolvePriorityRecoveryOperationDrainStepStaleState(
    mappedState,
    completion,
    operation,
    sourceState,
  ) {
    if (completion.state !== PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED) {
      return mappedState;
    }
    if (
      mappedState === PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT &&
      this.isStaleStoppingRemoveDrainWithoutRetirementEvidence(
        operation,
        sourceState,
      )
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
        .STALE_WITHOUT_RETIREMENT_EVIDENCE;
    }
    if (
      mappedState ===
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE &&
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

  isStaleStoppingRemoveDrainWithoutRetirementEvidence(
    operation,
    sourceState,
  ) {
    return (
      operation?.type === OperationType.REMOVE &&
      operation?.workflowStep === WORKFLOW_STEP.STOPPING &&
      sourceState ===
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_IN_FLIGHT &&
      this.isPriorityRecoveryOperationDrainStepStale(operation)
    );
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
    // Fenced replacement for the unfenced routing-readiness heuristic (audit
    // findings 5+14): a LIVE durable owner lease held by the recorded owner
    // fences priority-control-plane drain remote settlement even when the
    // routing-readiness probe reports the owner unready. An unfenced or
    // expired lease defers to that availability probe.
    return resolveOperationDrainOwnerAvailability({
      ownerNodeId,
      nodeId: this.nodeId,
      operation,
      nowMs: this.resolveTimeoutCheckNowMs(),
      isOwnerRoutingReady: () =>
        this.isNodeReadyForRouting(ownerNodeId, {
          partitionId: operation?.partitionId || null,
          decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
          participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
        }),
    }).unavailable;
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
        'function'
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
      typeof completion === 'object' &&
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
