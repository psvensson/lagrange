import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  ReplicaDispatchReplayHealthReadiness,
} from './replica-dispatch-replay-health-readiness.js';
import {
  extractOperationDispatchProgressContext,
  mergeOperationDispatchReconcileContext,
  updateExistingOperationDispatchDeferredRetry,
} from './replica-dispatch-operation-queue-context.js';
import {
  scheduleRemoteDispatchWakeupVerification,
} from './replica-dispatch-retained-verification.js';

const {
  DISPATCH_DEFAULT,
  DISPATCH_LOG_MSG,
  NODE_STATE_UPDATE_RETRY_POLICY,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = REPLICA_DISPATCH_SERVICE_SHARED;

function canDeferOperationDispatchRetry(operationId, errorLike) {
  return Boolean(operationId) && isRetryableControlPlaneError(errorLike);
}

class ReplicaDispatchRetryScheduling extends ReplicaDispatchReplayHealthReadiness {
  /**
   * Normalize operation-dispatch queue shard count to a safe positive integer.
   * One blocked operation reconcile must not head-of-line block unrelated
   * operation ids on the same node.
   *
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeOperationDispatchQueueShardCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_QUEUE_SHARD_COUNT;
    }
    return Math.max(1, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred node-state retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return DISPATCH_DEFAULT.NODE_STATE_UPDATE_RETRY_AFTER_MS;
    }
    return Math.max(1, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred replica dispatch retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeOperationDispatchRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_RETRY_AFTER_MS;
    }
    return Math.max(1, Math.floor(numeric));
  }

  /**
   * Normalize the maximum number of concurrently in-flight priority
   * control-plane dispatches this node will admit before shedding/deferring
   * further priority dispatches to bound the recovery retry fan-out.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizePriorityControlPlaneDispatchMaxInFlight(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return DISPATCH_DEFAULT.PRIORITY_CONTROL_PLANE_DISPATCH_MAX_IN_FLIGHT;
    }
    return Math.max(1, Math.floor(numeric));
  }

  /**
   * Normalize the bounded transport deadline for remote dispatch wake-ups.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeReplicaOperationDispatchTimeoutMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
    }
    return Math.max(1, Math.floor(numeric));
  }

  /**
   * Publish dispatch-service retry slots to the workflow owner so priority
   * recovery can report them as bounded rebalancer handoff progress.
   * @param {string} operationId
   * @param {Object|null} deferredRetry
   * @param {number|null} [retryAfterMs=null]
   * @return {boolean}
   * @private
   */
  recordWorkflowOwnerOperationDispatchDeferredRetry(
    operationId,
    deferredRetry,
    retryAfterMs = null,
  ) {
    const workflowOwner = this.rebalanceCoordinator?.workflowOwner;
    if (
      !workflowOwner ||
      typeof workflowOwner.recordOperationDispatchDeferredRetry !==
        'function'
    ) {
      return false;
    }
    const now = Date.now();
    const nextAttemptAt = Number(deferredRetry?.nextAttemptAt);
    const resolvedRetryAfterMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > 0 ?
        Math.floor(retryAfterMs) :
        (Number.isFinite(nextAttemptAt) && nextAttemptAt > now ?
          Math.max(1, Math.floor(nextAttemptAt - now)) :
          0);
    return workflowOwner.recordOperationDispatchDeferredRetry(
      operationId,
      Object.freeze({
        nextAttemptAt,
        retryAfterMs: resolvedRetryAfterMs,
        errorMessage: deferredRetry?.errorMessage || null,
      }),
      now,
    );
  }

  /**
   * @param {string} operationId
   * @private
   */
  clearWorkflowOwnerOperationDispatchDeferredRetry(operationId) {
    const workflowOwner = this.rebalanceCoordinator?.workflowOwner;
    if (
      workflowOwner &&
      typeof workflowOwner.clearOperationDispatchDeferredRetry ===
        'function'
    ) {
      workflowOwner.clearOperationDispatchDeferredRetry(operationId);
    }
  }

  /**
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveOperationDispatchRetryAfterMs(errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      return Math.max(1, Math.floor(retryAfterMs));
    }
    return this.operationDispatchRetryAfterMs;
  }

  /**
   * Defer one retryable operation-dispatch failure onto the existing owner queue.
   * @param {string} operationId
   * @param {*} errorLike
   * @param {Object|null} [row=null]
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  deferOperationDispatchRetry(operationId, errorLike, row = null, options = {}) {
    if (!canDeferOperationDispatchRetry(operationId, errorLike)) {
      return false;
    }
    const retryAfterMs = this.resolveOperationDispatchRetryAfterMs(errorLike);
    const desiredAttemptAt = Date.now() + retryAfterMs;
    const errorMessage = errorLike?.message || errorLike?.error || null;
    const refreshRowBeforeDispatch =
      options?.[
        REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
      ] === true;
    const existing = this.operationDispatchDeferredRetries.get(operationId);
    const deferredContext = mergeOperationDispatchReconcileContext(
      existing?.context,
      extractOperationDispatchProgressContext(options),
    );
    if (existing) {
      return updateExistingOperationDispatchDeferredRetry({
        deferredContext,
        desiredAttemptAt,
        errorMessage,
        existing,
        operationId,
        refreshRowBeforeDispatch,
        retryAfterMs,
        row,
        service: this,
      });
    }

    const deferredRetry = {
      context: deferredContext,
      errorMessage,
      nextAttemptAt: desiredAttemptAt,
      row: row ? this.cloneDeferredOperationDispatchRow(row) : null,
      [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]:
        refreshRowBeforeDispatch,
      timeoutHandle: this.armDeferredOperationDispatchRetry(
        operationId,
        retryAfterMs,
      ),
    };
    this.operationDispatchDeferredRetries.set(operationId, deferredRetry);
    this.logger.info(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED, {
      nodeId: this.nodeId,
      operationId,
      retryAfterMs,
      error: errorMessage,
    });
    this.recordWorkflowOwnerOperationDispatchDeferredRetry(
      operationId,
      deferredRetry,
      retryAfterMs,
    );
    return true;
  }

  /**
   * @param {string} operationId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredOperationDispatchRetry(operationId, delayMs) {
    return this.armDeferredOperationDispatchRetryWithOptions(
      operationId,
      delayMs,
    );
  }

  /**
   * @param {string} operationId
   * @param {number} delayMs
   * @param {Object} [options={}]
   * @return {*}
   * @private
   */
  armDeferredOperationDispatchRetryWithOptions(
    operationId,
    delayMs,
    options = {},
  ) {
    return this.setTimeoutFn(() => {
      const deferredRetry =
        this.operationDispatchDeferredRetries.get(operationId);
      if (!deferredRetry) {
        return;
      }
      this.operationDispatchDeferredRetries.delete(operationId);
      this.clearWorkflowOwnerOperationDispatchDeferredRetry(operationId);
      const row = deferredRetry?.row ?
        this.cloneDeferredOperationDispatchRow(deferredRetry.row) :
        null;
      const context = mergeOperationDispatchReconcileContext(
        deferredRetry?.context,
        row ? {row} : null,
      ) || {};
      // Provenance marker: this reconcile pass consumed a retained deferred
      // slot. The lost-wake admission in reconcileOperationDispatch is gated
      // on it so unmarked enqueues never gain replay semantics (sealed by the
      // ordinary-CREATING-rows-stay-outside-replay contract).
      context[
        REPLICA_DISPATCH_SERVICE_LITERAL.DEFERRED_RETRY_PROVENANCE
      ] = true;
      if (
        options?.[
          REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
        ] === true ||
        deferredRetry?.[
          REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
        ] === true
      ) {
        context[
          REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
        ] = true;
      }
      this.operationDispatchQueue.enqueue(
        operationId,
        RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        Object.keys(context).length > 0 ? context : undefined,
      );
      this.logger.debug(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED_RETRY, {
        nodeId: this.nodeId,
        operationId,
        retryAfterMs: delayMs,
      });
    }, delayMs);
  }

  /**
   * ACK on the remote direct-dispatch ingress means the target accepted a
   * queue item, not that the durable operation left PENDING. Keep a short
   * source-side verification wake active until a later row read proves the
   * operation is no longer dispatch-replayable.
   *
   * @param {string} operationId
   * @param {Object|null} row
   * @return {boolean}
   * @private
   */
  scheduleRemoteDispatchWakeupVerification(operationId, row = null) {
    return scheduleRemoteDispatchWakeupVerification(this, operationId, row);
  }

  /**
   * Preserve one dispatchable replica_operations row across deferred retries so
   * direct wake-up payloads can survive until cache visibility converges.
   * @param {Object|null} row
   * @return {Object|null}
   * @private
   */
  cloneDeferredOperationDispatchRow(row) {
    if (!row || typeof row !== 'object') {
      return null;
    }
    return {
      ...row,
    };
  }

  /**
   * Refresh the retained row for an already-armed dispatch retry.
   * @param {string} operationId
   * @param {Object|null} row
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  refreshDeferredOperationDispatchRetryRow(
    operationId,
    row = null,
    options = {},
  ) {
    const deferredRetry =
      this.operationDispatchDeferredRetries.get(operationId);
    if (!deferredRetry) {
      return false;
    }
    if (row) {
      deferredRetry.row = this.cloneDeferredOperationDispatchRow(row);
    }
    deferredRetry.context = mergeOperationDispatchReconcileContext(
      deferredRetry.context,
      extractOperationDispatchProgressContext(options),
    );
    if (
      options?.[
        REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
      ] === true
    ) {
      deferredRetry[
        REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
      ] = true;
    }
    this.recordWorkflowOwnerOperationDispatchDeferredRetry(
      operationId,
      deferredRetry,
    );
    return true;
  }

  /**
   * Coalesce duplicate remote wake-ups while the same operation is already
   * either in transport or waiting on its deferred retry/verification timer.
   * @param {string} operationId
   * @param {Object|null} row
   * @return {boolean}
   * @private
   */
  coalesceActiveDirectDispatchWakeup(operationId, row = null) {
    if (!operationId) {
      return false;
    }
    if (
      this.refreshDeferredOperationDispatchRetryRow(
        operationId,
        row,
        {
          [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]:
            true,
        },
      )
    ) {
      return true;
    }
    if (!this.directDispatchWakeupsInFlight.has(operationId)) {
      return false;
    }
    if (row) {
      this.directDispatchWakeupsInFlight.set(
        operationId,
        this.cloneDeferredOperationDispatchRow(row),
      );
    }
    return true;
  }

  /**
   * Mark one direct wake-up as occupying the operation's remote handoff lane.
   * @param {string} operationId
   * @param {Object|null} row
   * @return {void}
   * @private
   */
  markDirectDispatchWakeupInFlight(operationId, row = null) {
    if (!operationId) {
      return;
    }
    this.directDispatchWakeupsInFlight.set(
      operationId,
      this.cloneDeferredOperationDispatchRow(row),
    );
  }

  /**
   * Clear one in-flight direct wake-up and return the freshest retained row.
   * @param {string} operationId
   * @param {Object|null} fallbackRow
   * @return {Object|null}
   * @private
   */
  clearDirectDispatchWakeupInFlight(operationId, fallbackRow = null) {
    const retainedRow = this.directDispatchWakeupsInFlight.get(operationId);
    this.directDispatchWakeupsInFlight.delete(operationId);
    return retainedRow || this.cloneDeferredOperationDispatchRow(fallbackRow);
  }

  /**
   * @param {string} operationId
   * @return {void}
   * @private
   */
  clearDeferredOperationDispatchRetry(operationId) {
    const deferredRetry =
      this.operationDispatchDeferredRetries.get(operationId);
    if (!deferredRetry) {
      return;
    }
    if (deferredRetry.timeoutHandle) {
      this.clearTimeoutFn(deferredRetry.timeoutHandle);
    }
    this.operationDispatchDeferredRetries.delete(operationId);
    this.clearWorkflowOwnerOperationDispatchDeferredRetry(operationId);
  }

  computeNodeStateUpdateRetryDelayMs(
    baseRetryAfterMs,
    failureCount,
    maxRetryAfterMs,
  ) {
    let retryAfterMs = baseRetryAfterMs;
    let remainingBackoffSteps = Math.max(0, failureCount - 1);
    while (remainingBackoffSteps > 0 && retryAfterMs < maxRetryAfterMs) {
      retryAfterMs = Math.min(
        maxRetryAfterMs,
        retryAfterMs * NODE_STATE_UPDATE_RETRY_POLICY.BACKOFF_MULTIPLIER,
      );
      remainingBackoffSteps -= 1;
    }
    return retryAfterMs;
  }

  /**
   * Replace the deferred retry payload for one node without scheduling another
   * immediate write attempt.
   * @param {string} nodeId
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
}

export {ReplicaDispatchRetryScheduling};
