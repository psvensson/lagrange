import {clearTerminalTransitionRepair} from './operation-workflow-terminal-transition-repair.js';
import {assertOperationUpdateRecord, assertOperationUpdateSubject} from
  './replica-operation-update-outcome.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  RUNTIME_TARGET_PROGRESS_RETENTION_WORKFLOW_STEPS,
} from './replica-operation-step-policy.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const {
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  ReplicaOperationResponseStatus,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_DEFAULT,
  UNIFIED_SERVICE_TYPE,
  classifySystemPartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const EXPECTED_TIMEOUT_HANDLE = 'expectedTimeoutHandle';

const OBSERVED_PROGRESS_RETRY_KIND = Object.freeze({
  OBSERVED_PROGRESS: 'observed_progress',
  DELIVERED_CREATE_PROGRESS: 'delivered_create_progress',
});
const DELIVERED_CREATE_PROGRESS_RESPONSE_STATUSES = Object.freeze(
  new Set([
    ReplicaOperationResponseStatus.INITIATED,
    ReplicaOperationResponseStatus.IN_PROGRESS,
    ReplicaOperationResponseStatus.ALREADY_EXISTS,
    ReplicaOperationResponseStatus.COMPLETED,
  ]),
);

const DELIVERED_CREATE_PROGRESS_WAIT = Object.freeze({
  wait: 'REBALANCE_OPERATION_BUDGET_MS',
  awaited: 'delivered target create progress applied to the operation row',
});

/**
 * The retained delivered-create progress retry reached its operation-budget
 * deadline and is not re-armed: one wait_bound_spent ERROR. A retry entry
 * without a deadline was never bounded, so it reports nothing.
 * @param {Object} owner
 * @param {Object} retryEntry
 * @param {number} now - Date.now() (the deadline's clock).
 * @return {void}
 */
function reportDeliveredCreateProgressSpent(owner, retryEntry, now) {
  if (!Number.isFinite(retryEntry.deadlineMs)) {
    return;
  }
  const operation = retryEntry.operationSnapshot || {};
  reportWaitBoundSpent(owner.logger, {
    ...DELIVERED_CREATE_PROGRESS_WAIT,
    boundMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    elapsedMs: now - retryEntry.deadlineMs +
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
    lastObserved: {
      kind: retryEntry.kind,
      tableName: retryEntry.tableName || null,
      workflowStep: operation.workflowStep,
      status: operation.status,
      targetNodeId: operation.targetNodeId || null,
    },
    scope: {
      nodeId: owner.nodeId || null,
      partitionId: operation.partitionId || null,
      operationId: operation.operationId || null,
    },
  });
}

function withObservedProgressRetention(Base) {
  return class OperationWorkflowObservedProgressRetention extends Base {
    clearObservedProgressRetry(operationId, options = {}) {
      const retryEntry =
        this.observedProgressRetryTimerByOperationId.get(operationId);
      if (!retryEntry || (Object.hasOwn(options, EXPECTED_TIMEOUT_HANDLE) &&
          retryEntry.timeoutHandle !== options.expectedTimeoutHandle)) {
        return;
      }
      if (
        retryEntry.kind ===
          OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS &&
        options.includeDeliveredCreateProgress !== true
      ) {
        return;
      }
      this.clearTimeoutFn(retryEntry.timeoutHandle);
      this.observedProgressRetryTimerByOperationId.delete(operationId);
    }

    armObservedProgressRetry(input) {
      const {
        operationId,
        tableName,
        cacheOperation,
        delayMs,
        kind = OBSERVED_PROGRESS_RETRY_KIND.OBSERVED_PROGRESS,
        operationSnapshot = null,
        deadlineMs = null,
      } = input;
      if (!operationId) {
        return false;
      }
      const retryDelayMs =
        Number.isFinite(delayMs) && delayMs > 0 ?
          Math.floor(delayMs) :
          OBSERVED_PROGRESS_RETRY_DELAY_MS;
      const now = Date.now();
      const desiredAttemptAt = now + retryDelayMs;
      const existing =
        this.observedProgressRetryTimerByOperationId.get(operationId);
      if (existing) {
        this.mergeObservedProgressRetryEvidence(existing, {
          deadlineMs,
          kind,
          operationSnapshot,
        });
        if (desiredAttemptAt >= existing.nextAttemptAt) {
          return true;
        }
        this.clearTimeoutFn(existing.timeoutHandle);
        existing.nextAttemptAt = desiredAttemptAt;
        let timeoutHandle = null;
        timeoutHandle = this.setTimeoutFn(
          () => this.runObservedProgressRetry(operationId, timeoutHandle),
          retryDelayMs,
        );
        existing.timeoutHandle = timeoutHandle;
        return true;
      }
      const retryEntry = {
        cacheOperation,
        deadlineMs,
        kind,
        nextAttemptAt: desiredAttemptAt,
        operationSnapshot: this.cloneOperationSnapshot(operationSnapshot),
        tableName,
        timeoutHandle: null,
      };
      let timeoutHandle = null;
      timeoutHandle = this.setTimeoutFn(
        () => this.runObservedProgressRetry(operationId, timeoutHandle),
        retryDelayMs,
      );
      retryEntry.timeoutHandle = timeoutHandle;
      this.observedProgressRetryTimerByOperationId.set(
        operationId,
        retryEntry,
      );
      return true;
    }

    mergeObservedProgressRetryEvidence(existing, incoming) {
      if (Number.isFinite(incoming.deadlineMs)) {
        existing.deadlineMs = Number.isFinite(existing.deadlineMs) ?
          Math.min(existing.deadlineMs, incoming.deadlineMs) :
          incoming.deadlineMs;
      }
      if (incoming.kind === OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS) {
        existing.kind = incoming.kind;
        existing.operationSnapshot = this.cloneOperationSnapshot(
          incoming.operationSnapshot || existing.operationSnapshot,
        );
      }
    }

    retainGuardedCreateAdmission(expected, observed) {
      // Placement planning does not claim target execution. Require the actual
      // admission column that prevented the guarded terminal SQL from applying.
      if (observed?.createAdmissionState == null ||
          observed.completedAt !== null || observed.createdAt !== expected.createdAt) return false;
      assertOperationUpdateRecord(observed);
      assertOperationUpdateSubject(expected, observed);
      const operationId = observed.operationId;
      const scheduled = this.scheduleObservedProgressRetry(operationId, SYSTEM_TABLE_NAME.SERVICES,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT);
      if (!scheduled) return false;
      const repair = this.terminalTransitionRepairStateByOperationId.get(operationId);
      if (repair?.persistOptions?.requireCreateAdmissionAbsent === true) {
        clearTerminalTransitionRepair(this, operationId);
      }
      return true;
    }

    scheduleObservedProgressRetry(
      operationId,
      tableName,
      cacheOperation,
      delayMs = OBSERVED_PROGRESS_RETRY_DELAY_MS,
      deadlineMs = null,
    ) {
      return this.armObservedProgressRetry({
        operationId,
        tableName,
        cacheOperation,
        delayMs,
        deadlineMs,
      });
    }

    scheduleActiveReplicaHandoffRetry(operation) {
      const deadlineMs = operation.createdAt + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
      const remainingMs = deadlineMs - this.resolveTimeoutCheckNowMs();
      if (!Number.isFinite(remainingMs) || remainingMs <= 0) return false;
      return this.scheduleObservedProgressRetry(
        operation.operationId, SYSTEM_TABLE_NAME.SERVICES,
        OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
        Math.min(OBSERVED_PROGRESS_RETRY_DELAY_MS, remainingMs), deadlineMs,
      );
    }

    isDeliveredCreateProgressRetentionCandidate(
      operation,
      response,
      replaceRemovePhase = false,
    ) {
      const partitionClassification = classifySystemPartition({
        partitionId: operation?.partitionId || null,
      });
      return [
        replaceRemovePhase !== true,
        operation?.entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        operation?.type === OperationType.ADD ||
          operation?.type === OperationType.REPLACE,
        RUNTIME_TARGET_PROGRESS_RETENTION_WORKFLOW_STEPS.has(
          operation?.workflowStep,
        ),
        partitionClassification.systemTable !== true,
        DELIVERED_CREATE_PROGRESS_RESPONSE_STATUSES.has(response?.status),
      ].every(Boolean);
    }

    retainDeliveredCreateProgress(
      operation,
      response,
      replaceRemovePhase = false,
    ) {
      if (!this.isDeliveredCreateProgressRetentionCandidate(
        operation,
        response,
        replaceRemovePhase,
      )) {
        return false;
      }
      const now = Date.now();
      const operationStartedAtMs = Number.isFinite(operation.createdAt) ?
        operation.createdAt :
        now;
      const deadlineMs =
        operationStartedAtMs +
        TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
      if (deadlineMs <= now) {
        return false;
      }
      return this.armObservedProgressRetry({
        operationId: operation.operationId,
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        cacheOperation: OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
        delayMs: Math.min(
          OBSERVED_PROGRESS_RETRY_DELAY_MS,
          deadlineMs - now,
        ),
        kind: OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS,
        operationSnapshot: operation,
        deadlineMs,
      });
    }

    rearmDeliveredCreateProgress(retryEntry) {
      const now = Date.now();
      if (
        !Number.isFinite(retryEntry.deadlineMs) ||
        retryEntry.deadlineMs <= now
      ) {
        reportDeliveredCreateProgressSpent(this, retryEntry, now);
        return false;
      }
      return this.armObservedProgressRetry({
        operationId: retryEntry.operationSnapshot?.operationId || null,
        tableName: retryEntry.tableName,
        cacheOperation: retryEntry.cacheOperation,
        delayMs: Math.min(
          OBSERVED_PROGRESS_RETRY_DELAY_MS,
          retryEntry.deadlineMs - now,
        ),
        kind: OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS,
        operationSnapshot: retryEntry.operationSnapshot,
        deadlineMs: retryEntry.deadlineMs,
      });
    }

    async reconcileDeliveredCreateProgress(retryEntry) {
      const operationId = retryEntry.operationSnapshot?.operationId || null;
      if (!operationId) {
        return false;
      }
      await this.reconcileObservedProgressOperation(operationId);
      const visibilityObservation =
        await this.repository.getOperationByIdVisibilityObservation(
          operationId,
          {
            allowPriorityRecoveryDeferredVisibility: true,
          },
        );
      const operation = visibilityObservation?.operation || null;
      if (
        operation &&
        (
          this.repository.isOperationTerminal(operation) ||
          !this.repository.isOperationLocallyOwned(operation) ||
          !RUNTIME_TARGET_PROGRESS_RETENTION_WORKFLOW_STEPS.has(
            operation.workflowStep,
          )
        )
      ) {
        return true;
      }
      return this.rearmDeliveredCreateProgress({
        ...retryEntry,
        operationSnapshot: operation || retryEntry.operationSnapshot,
      });
    }

    isActiveReplicaHandoffRetrySpent(retryEntry) {
      return retryEntry.kind === OBSERVED_PROGRESS_RETRY_KIND.OBSERVED_PROGRESS &&
        Number.isFinite(retryEntry.deadlineMs) &&
        retryEntry.deadlineMs <= this.resolveTimeoutCheckNowMs();
    }

    runObservedProgressRetry(operationId, expectedTimeoutHandle = null) {
      const retryEntry =
        this.observedProgressRetryTimerByOperationId.get(operationId);
      if (
        !retryEntry ||
        expectedTimeoutHandle !== null &&
          retryEntry.timeoutHandle !== expectedTimeoutHandle
      ) {
        return;
      }
      this.observedProgressRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown || this.isActiveReplicaHandoffRetrySpent(retryEntry)) {
        return;
      }
      if (!this.isInitialized || this.isOperationOwnerLaneHeld(operationId)) {
        this.rearmObservedProgressRetry(operationId, retryEntry);
        return;
      }
      const reconcile =
        retryEntry.kind ===
          OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS ?
          () => this.reconcileDeliveredCreateProgress(retryEntry) :
          () => {
            if (!this.isActiveReplicaHandoffRetrySpent(retryEntry)) {
              return this.reconcileObservedProgressOperation(operationId);
            }
          };
      return this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        reconcile,
      ).catch((error) => {
        if (
          retryEntry.kind ===
            OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS &&
          this.rearmDeliveredCreateProgress(retryEntry)
        ) {
          return;
        }
        this.handleObservedProgressFailure(
          operationId,
          retryEntry.tableName,
          retryEntry.cacheOperation,
          error,
        );
      });
    }

    rearmObservedProgressRetry(operationId, retryEntry) {
      if (
        retryEntry.kind ===
          OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS
      ) {
        this.rearmDeliveredCreateProgress(retryEntry);
      } else if (this.isInitialized) {
        const remainingMs = Number.isFinite(retryEntry.deadlineMs) ?
          retryEntry.deadlineMs - this.resolveTimeoutCheckNowMs() :
          OBSERVED_PROGRESS_RETRY_DELAY_MS;
        if (remainingMs <= 0) return;
        this.scheduleObservedProgressRetry(
          operationId, retryEntry.tableName, retryEntry.cacheOperation,
          Math.min(OBSERVED_PROGRESS_RETRY_DELAY_MS, remainingMs), retryEntry.deadlineMs,
        );
      }
    }
  };
}

export {
  withObservedProgressRetention,
};
