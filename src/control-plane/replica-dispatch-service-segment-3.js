import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  ReplicaDispatchReplayHealthReadiness,
} from './replica-dispatch-replay-health-readiness.js';

const {
  ControlPlaneField,
  DISPATCH_DEFAULT,
  DISPATCH_LOG_MSG,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
  NUM,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  TYPEOF,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = REPLICA_DISPATCH_SERVICE_SHARED;

class ReplicaDispatchServiceSegment3 extends ReplicaDispatchReplayHealthReadiness {
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
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize node-state queue shard count to a safe positive integer.
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateQueueShardCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return REPLICA_DISPATCH_SERVICE_LITERAL.FOUR;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred node-state retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return DISPATCH_DEFAULT.NODE_STATE_UPDATE_RETRY_AFTER_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred replica dispatch retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeOperationDispatchRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_RETRY_AFTER_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize the bounded transport deadline for remote dispatch wake-ups.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeReplicaOperationDispatchTimeoutMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }


  /**
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveOperationDispatchRetryAfterMs(errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(retryAfterMs));
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
  deferOperationDispatchRetry(
    operationId,
    errorLike,
    row = null,
    options = {},
  ) {
    if (!operationId || !isRetryableControlPlaneError(errorLike)) {
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
    if (existing) {
      existing.errorMessage = errorMessage;
      if (row) {
        existing.row = this.cloneDeferredOperationDispatchRow(row);
      }
      if (refreshRowBeforeDispatch) {
        existing[
          REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
        ] = true;
      }
      if (desiredAttemptAt < existing.nextAttemptAt) {
        if (existing.timeoutHandle) {
          this.clearTimeoutFn(existing.timeoutHandle);
        }
        existing.nextAttemptAt = desiredAttemptAt;
        existing.timeoutHandle = this.armDeferredOperationDispatchRetry(
          operationId,
          retryAfterMs,
        );
      }
      return true;
    }

    const deferredRetry = {
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
      const row = deferredRetry?.row ?
        this.cloneDeferredOperationDispatchRow(deferredRetry.row) :
        null;
      const context = row ? {row} : {};
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
        Object.keys(context).length > NUM.ZERO ? context : undefined,
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
    if (!operationId) {
      return false;
    }
    this.clearDeferredOperationDispatchRetry(operationId);
    const retryAfterMs = this.operationDispatchRetryAfterMs;
    const deferredRetry = {
      errorMessage:
        REPLICA_DISPATCH_SERVICE_LITERAL.DIRECT_WAKEUP_VERIFICATION,
      nextAttemptAt: Date.now() + retryAfterMs,
      row: row ? this.cloneDeferredOperationDispatchRow(row) : null,
      [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]: true,
      timeoutHandle: this.armDeferredOperationDispatchRetryWithOptions(
        operationId,
        retryAfterMs,
        {
          [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]:
            true,
        },
      ),
    };
    this.operationDispatchDeferredRetries.set(operationId, deferredRetry);
    return true;
  }

  /**
   * Preserve one dispatchable replica_operations row across deferred retries so
   * direct wake-up payloads can survive until cache visibility converges.
   * @param {Object|null} row
   * @return {Object|null}
   * @private
   */
  cloneDeferredOperationDispatchRow(row) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
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
    if (
      options?.[
        REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
      ] === true
    ) {
      deferredRetry[
        REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
      ] = true;
    }
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
  }

  /**
   * Determine whether one node-state write failure should be retried through
   * the owner queue instead of surfacing as a terminal reconcile error.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  shouldDeferNodeStateUpdateRetry(error, payload = null) {
    if (!error) {
      return false;
    }
    const nextState = payload?.[ControlPlaneField.STATE];
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
    const publicationMode = this.resolveNodeStateUpdatePublicationMode(
      nextState,
      isHeartbeatOnly,
      payload,
    );
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({
      publicationMode,
    });
    const retryClass = this.resolveNodeStateUpdateRetryClass(error);
    if (
      retryClass === NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE &&
      publicationProfile?.allowPressureDefer !== true
    ) {
      return false;
    }
    if (error?.deferRetry === true) {
      return true;
    }
    if (error?.code === REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
      return true;
    }
    if (isRetryableControlPlaneError(error)) {
      return true;
    }
    const message = error?.message || String(error);
    if (
      typeof this.cdcIntegrationService?.isTransientCdcError ===
        TYPEOF.FUNCTION &&
      this.cdcIntegrationService.isTransientCdcError(message)
    ) {
      return true;
    }
    return (
      (message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) &&
        message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED)) ||
      message.includes(
        REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE,
      ) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED) ||
      message.includes(
        REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER,
      ) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_TIMEOUT)
    );
  }

  /**
   * Resolve one retry delay for deferred node-state writes.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveNodeStateUpdateRetryAfterMs(error) {
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(error.retryAfterMs));
    }
    return this.nodeStateUpdateRetryAfterMs;
  }

  resolveNodeStateUpdateRetryClass(error) {
    const errorCode = getControlPlaneErrorCode(error);
    const errorMessage = getControlPlaneErrorMessage(error);
    if (
      errorCode === QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE ||
      errorMessage.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) ||
      errorMessage.includes(QUERY_ERROR_MSG.QUERY_ROUTING_FAILED) ||
      errorMessage.includes(QUERY_ERROR_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION) ||
      errorMessage.includes(
        REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER,
      )
    ) {
      return NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE;
    }
    return NODE_STATE_UPDATE_RETRY_CLASS.TRANSIENT;
  }

  resolveNodeStateUpdateRetryFailureCount(nodeId, retryClass) {
    const existingState = this.nodeStateUpdateRetryStateByNodeId.get(nodeId);
    if (!existingState || existingState.retryClass !== retryClass) {
      return NUM.ONE;
    }
    const currentFailureCount = Number(existingState.failureCount);
    if (
      !Number.isFinite(currentFailureCount) ||
      currentFailureCount < NUM.ONE
    ) {
      return NUM.ONE;
    }
    return currentFailureCount + NUM.ONE;
  }

  resolveNodeStateUpdateRetryDelayBounds(retryClass, baseRetryAfterMs) {
    if (retryClass === NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE) {
      return Object.freeze({
        baseRetryAfterMs: Math.max(
          baseRetryAfterMs,
          this.nodeStateUpdateRetryAfterMs *
            NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MIN_DELAY_MULTIPLIER,
        ),
        maxRetryAfterMs: Math.max(
          baseRetryAfterMs,
          this.nodeStateUpdateRetryAfterMs *
            NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MAX_DELAY_MULTIPLIER,
        ),
      });
    }
    return Object.freeze({
      baseRetryAfterMs,
      maxRetryAfterMs: Math.max(
        baseRetryAfterMs,
        baseRetryAfterMs *
          NODE_STATE_UPDATE_RETRY_POLICY.TRANSIENT_MAX_DELAY_MULTIPLIER,
      ),
    });
  }

  computeNodeStateUpdateRetryDelayMs(
    baseRetryAfterMs,
    failureCount,
    maxRetryAfterMs,
  ) {
    let retryAfterMs = baseRetryAfterMs;
    let remainingBackoffSteps = Math.max(NUM.ZERO, failureCount - NUM.ONE);
    while (remainingBackoffSteps > NUM.ZERO && retryAfterMs < maxRetryAfterMs) {
      retryAfterMs = Math.min(
        maxRetryAfterMs,
        retryAfterMs * NODE_STATE_UPDATE_RETRY_POLICY.BACKOFF_MULTIPLIER,
      );
      remainingBackoffSteps -= NUM.ONE;
    }
    return retryAfterMs;
  }

  buildNodeStateUpdateRetryDecision(nodeId, error) {
    const baseRetryAfterMs = this.resolveNodeStateUpdateRetryAfterMs(error);
    const retryClass = this.resolveNodeStateUpdateRetryClass(error);
    const failureCount = this.resolveNodeStateUpdateRetryFailureCount(
      nodeId,
      retryClass,
    );
    const retryDelayBounds = this.resolveNodeStateUpdateRetryDelayBounds(
      retryClass,
      baseRetryAfterMs,
    );
    return Object.freeze({
      action: NODE_STATE_UPDATE_RETRY_ACTION.SCHEDULE_DEFERRED,
      retryClass,
      failureCount,
      retryAfterMs: this.computeNodeStateUpdateRetryDelayMs(
        retryDelayBounds.baseRetryAfterMs,
        failureCount,
        retryDelayBounds.maxRetryAfterMs,
      ),
    });
  }

  recordDeferredNodeStateUpdateRetryState(nodeId, retryDecision, error) {
    if (!nodeId || !retryDecision) {
      return;
    }
    this.nodeStateUpdateRetryStateByNodeId.set(
      nodeId,
      Object.freeze({
        retryClass: retryDecision.retryClass,
        failureCount: retryDecision.failureCount,
        retryAfterMs: retryDecision.retryAfterMs,
        errorMessage:
          getControlPlaneErrorMessage(error) ||
          REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
      }),
    );
  }

  clearNodeStateUpdateRetryState(nodeId) {
    this.nodeStateUpdateRetryStateByNodeId.delete(nodeId);
  }

  /**
   * Store the latest node-state payload and arm one deferred retry timer.
   * @param {string} nodeId
   * @param {Object} payload
   * @param {Error} error
   * @return {number}
   * @private
   */
  deferNodeStateUpdateRetry(nodeId, payload, error) {
    if (!nodeId || !payload) {
      return this.nodeStateUpdateRetryAfterMs;
    }

    const deferredPayload = this.buildDeferredNodeStateUpdatePayload(payload);
    const retryDecision = this.buildNodeStateUpdateRetryDecision(nodeId, error);
    const retryAfterMs = retryDecision.retryAfterMs;
    const desiredAttemptAt = Date.now() + retryAfterMs;
    this.recordDeferredNodeStateUpdateRetryState(nodeId, retryDecision, error);
    const existing = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (existing) {
      existing.payload = deferredPayload;
      existing.errorMessage =
        getControlPlaneErrorMessage(error) ||
        REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING;
      existing.retryClass = retryDecision.retryClass;
      existing.failureCount = retryDecision.failureCount;
      if (existing.timeoutHandle) {
        this.clearTimeoutFn(existing.timeoutHandle);
      }
      existing.nextAttemptAt = desiredAttemptAt;
      existing.timeoutHandle = this.armDeferredNodeStateUpdateRetry(
        nodeId,
        retryAfterMs,
      );
      return retryAfterMs;
    }

    const deferredRetry = {
      payload: deferredPayload,
      nextAttemptAt: desiredAttemptAt,
      errorMessage:
        getControlPlaneErrorMessage(error) ||
        REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
      retryClass: retryDecision.retryClass,
      failureCount: retryDecision.failureCount,
      timeoutHandle: null,
    };
    deferredRetry.timeoutHandle = this.armDeferredNodeStateUpdateRetry(
      nodeId,
      retryAfterMs,
    );
    this.nodeStateUpdateDeferredRetries.set(nodeId, deferredRetry);
    return retryAfterMs;
  }

  /**
   * Arm the deferred retry timer for one node-state update owner key.
   * @param {string} nodeId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredNodeStateUpdateRetry(nodeId, delayMs) {
    return this.setTimeoutFn(() => {
      const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
      if (!deferredRetry) {
        return;
      }
      this.nodeStateUpdateDeferredRetries.delete(nodeId);
      this.resolveNodeStateUpdateQueue(nodeId).enqueue(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
        {payload: deferredRetry.payload},
      );
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED_RETRY, {
        nodeId,
        retryAfterMs: delayMs,
      });
    }, delayMs);
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

export {ReplicaDispatchServiceSegment3};
