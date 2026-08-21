import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  RUNTIME_TARGET_PROGRESS_RETENTION_WORKFLOW_STEPS,
} from './replica-operation-step-policy.js';

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

function withObservedProgressRetention(Base) {
  return class OperationWorkflowObservedProgressRetention extends Base {
    clearObservedProgressRetry(operationId, options = {}) {
      const retryEntry =
        this.observedProgressRetryTimerByOperationId.get(operationId);
      if (!retryEntry) {
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
        existing.timeoutHandle = this.setTimeoutFn(
          () => this.runObservedProgressRetry(operationId),
          retryDelayMs,
        );
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
      retryEntry.timeoutHandle = this.setTimeoutFn(
        () => this.runObservedProgressRetry(operationId),
        retryDelayMs,
      );
      this.observedProgressRetryTimerByOperationId.set(
        operationId,
        retryEntry,
      );
      return true;
    }

    mergeObservedProgressRetryEvidence(existing, incoming) {
      if (
        incoming.kind !==
          OBSERVED_PROGRESS_RETRY_KIND.DELIVERED_CREATE_PROGRESS
      ) {
        return;
      }
      existing.kind = incoming.kind;
      existing.operationSnapshot = this.cloneOperationSnapshot(
        incoming.operationSnapshot || existing.operationSnapshot,
      );
      if (Number.isFinite(incoming.deadlineMs)) {
        existing.deadlineMs = Number.isFinite(existing.deadlineMs) ?
          Math.min(existing.deadlineMs, incoming.deadlineMs) :
          incoming.deadlineMs;
      }
    }

    scheduleObservedProgressRetry(
      operationId,
      tableName,
      cacheOperation,
      delayMs = OBSERVED_PROGRESS_RETRY_DELAY_MS,
    ) {
      return this.armObservedProgressRetry({
        operationId,
        tableName,
        cacheOperation,
        delayMs,
      });
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

    runObservedProgressRetry(operationId) {
      const retryEntry =
        this.observedProgressRetryTimerByOperationId.get(operationId);
      if (!retryEntry) {
        return;
      }
      this.observedProgressRetryTimerByOperationId.delete(operationId);
      if (this.isShuttingDown) {
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
          () => this.reconcileObservedProgressOperation(operationId);
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
        this.scheduleObservedProgressRetry(
          operationId,
          retryEntry.tableName,
          retryEntry.cacheOperation,
        );
      }
    }
  };
}

export {
  withObservedProgressRetention,
};
