import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  buildDispatchReadinessGateError,
  buildPriorityDispatchLaneExhaustedError,
  buildReplicaOperationVisibilityLagError,
  buildRetryableSkippedDispatchError,
  hasAuthoritativeReplicaOperationRowChanged,
  resolveNodeStateUpdateBudgetFields,
  shouldRetrySkippedDispatchResult,
} from './replica-dispatch-service-dispatch-error-helpers.js';
import {
  ReplicaDispatchReplayReadiness,
} from './replica-dispatch-replay-readiness.js';
import {
  REPLICA_DISPATCH_RECONCILE_CALLBACK_METHODS,
} from './replica-dispatch-reconcile-callbacks.js';

const {
  ControlPlaneField,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_READINESS_ERROR_CODE,
  DISPATCH_READINESS_ERROR_REASON,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  ReplicaOperationField,
  assertCritical,
  classifySystemPartition,
  getControlPlaneErrorMessage,
  isCoordinatorOwnedOperationType,
} = REPLICA_DISPATCH_SERVICE_SHARED;

class ReplicaDispatchOperationExecution extends ReplicaDispatchReplayReadiness {
  resolveNodeStateUpdateBudgetFields(nodeRow) {
    return resolveNodeStateUpdateBudgetFields(nodeRow);
  }

  /**
   * Resolve the canonical system-table gateway for dispatch writes.
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    assertCritical(
      this.controlPlaneSystemTableGateway,
      REPLICA_DISPATCH_SERVICE_LITERAL.REPLICADISPATCHSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY,
    );
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Handle dispatch requests for replica operations.
   * @param {Object} payload - Dispatch payload.
   * @private
   */
  async handleReplicaOperationDispatch(payload) {
    const operationRow =
      payload?.[ControlPlaneField.OPERATION_ROW] &&
      typeof payload[ControlPlaneField.OPERATION_ROW] === 'object' ?
        payload[ControlPlaneField.OPERATION_ROW] :
        null;
    const operationId =
      payload[ControlPlaneField.OPERATION_ID] ||
      operationRow?.operation_id ||
      null;
    if (!operationId) {
      return;
    }

    this.operationDispatchQueue.enqueue(
      operationId,
      RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST,
      operationRow ?
        {
          row: operationRow,
          [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]: true,
          ...(payload?.[ControlPlaneField.HANDOFF_MODE] ?
            {
              [ControlPlaneField.HANDOFF_MODE]:
                payload[ControlPlaneField.HANDOFF_MODE],
            } :
            {}),
        } :
        undefined,
    );
  }

  /**
   * Compute whether a dispatch row belongs to a priority control-plane
   * partition class subject to the in-flight lane admission cap.
   * @param {Object} row - Replica operation row.
   * @param {Object} rowOperation - Operation built from the row.
   * @return {boolean} True for priority control-plane partitions.
   * @private
   */
  isPriorityControlPlaneDispatch(row, rowOperation) {
    return classifySystemPartition({
      partitionId: row.partition_id || rowOperation.partitionId || null,
    }).priorityControlPlane;
  }

  /**
   * Defer a priority dispatch when its lane has no headroom, backing it off
   * onto the owner queue with a retry hint instead of admitting it.
   * Operations already counted in the lane are never shed by their own
   * re-entry.
   * @param {Object} row - Replica operation row.
   * @param {Object} rowOperation - Operation built from the row.
   * @param {string} operationId - Operation identifier.
   * @param {string} targetNodeId - Target node identifier.
   * @param {Object} options - Dispatch evidence context.
   * @return {boolean} True when the dispatch was deferred.
   * @private
   */
  deferWhenPriorityDispatchLaneExhausted(
    row,
    rowOperation,
    operationId,
    targetNodeId,
    options,
  ) {
    const isLaneExhausted =
      this.isPriorityControlPlaneDispatch(row, rowOperation) &&
      !this.priorityDispatchInFlight.has(operationId) &&
      this.priorityDispatchInFlight.size >=
        this.priorityControlPlaneDispatchMaxInFlight;
    if (!isLaneExhausted) {
      return false;
    }
    const laneExhaustedError = buildPriorityDispatchLaneExhaustedError(
      operationId,
      targetNodeId,
      this.operationDispatchRetryAfterMs,
    );
    this.logger.info(DISPATCH_LOG_MSG.PRIORITY_DISPATCH_LANE_EXHAUSTED, {
      nodeId: this.nodeId,
      operationId,
      targetNodeId,
      partitionId: row.partition_id || rowOperation.partitionId || null,
      priorityDispatchInFlight: this.priorityDispatchInFlight.size,
      priorityControlPlaneDispatchMaxInFlight:
        this.priorityControlPlaneDispatchMaxInFlight,
    });
    this.deferOperationDispatchRetry(
      operationId,
      laneExhaustedError,
      row,
      options,
    );
    return true;
  }

  /**
   * Admit a priority dispatch into the in-flight lane set so the lane cap can
   * bound concurrent priority recovery dispatches.
   * @param {Object} row - Replica operation row.
   * @param {Object} rowOperation - Operation built from the row.
   * @param {string} operationId - Operation identifier.
   * @private
   */
  markPriorityDispatchInFlightIfNeeded(row, rowOperation, operationId) {
    if (this.isPriorityControlPlaneDispatch(row, rowOperation)) {
      this.priorityDispatchInFlight.add(operationId);
    }
  }

  /**
   * Dispatch an operation record to its target node.
   * @param {Object} row - Replica operation row.
   * @param {Object} [options={}] - Optional dispatch evidence context.
   * @private
   */
  async dispatchOperationRow(row, options = {}) {
    if (!row || !row.operation_id) {
      return;
    }
    if (!isCoordinatorOwnedOperationType(row.type)) {
      return;
    }
    if (this.isBootstrapTopologyDispatchDeferred(row)) {
      return;
    }

    if (!this.rebalanceCoordinator) {
      return;
    }

    if (this.dispatchInFlight.has(row.operation_id)) {
      return;
    }

    const operationId = row.operation_id;
    if (!this.isReplicaOperationLocallyOwned(row)) {
      await this.sendDirectDispatchWakeup(this.buildOperationFromRow(row));
      return;
    }

    const targetNodeId = row.target_node_id;
    const rowOperation = this.buildOperationFromRow(row);
    const dispatchReadiness = await this.captureDispatchReadiness(
      rowOperation,
      options,
    );
    if (dispatchReadiness.error) {
      const readinessError = this.buildDispatchReadinessRefreshFailureError(
        targetNodeId,
        dispatchReadiness,
      );
      this.recordDispatchFailure({
        operationId,
        targetNodeId,
        workflowStep: row.workflow_step || null,
        skipped: true,
        reason:
          DISPATCH_READINESS_ERROR_REASON.TARGET_NODE_READINESS_REFRESH_FAILED,
        error: readinessError.message,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
      if (
        this.deferOperationDispatchRetry(
          operationId,
          readinessError,
          row,
          options,
        )
      ) {
        return;
      }
      throw readinessError;
    }
    if (!dispatchReadiness.ready) {
      const readinessError = this.buildDispatchNotReadyError(
        targetNodeId,
        dispatchReadiness,
      );
      this.recordDispatchFailure({
        operationId,
        targetNodeId,
        workflowStep: row.workflow_step || null,
        skipped: true,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.TARGET_NODE_NOT_READY,
        error: readinessError.message,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
      if (
        this.deferOperationDispatchRetry(
          operationId,
          readinessError,
          row,
          options,
        )
      ) {
        return;
      }
      return;
    }

    if (
      this.deferWhenPriorityDispatchLaneExhausted(
        row,
        rowOperation,
        operationId,
        targetNodeId,
        options,
      )
    ) {
      return;
    }

    this.dispatchInFlight.add(operationId);
    this.markPriorityDispatchInFlightIfNeeded(row, rowOperation, operationId);
    try {
      let dispatchResult = null;
      if (
        typeof this.rebalanceCoordinator.dispatchOperation === 'function'
      ) {
        dispatchResult =
          await this.rebalanceCoordinator.dispatchOperation(rowOperation, {
            cause: REPLICA_DISPATCH_SERVICE_LITERAL.REPLICA_OPERATION_DISPATCH,
          });
      } else {
        const claimedOperation =
          await this.rebalanceCoordinator.claimDispatchTransition(operationId);
        if (!claimedOperation) {
          this.logger.debug(DISPATCH_LOG_MSG.CLAIM_SKIPPED, {
            operationId,
            nodeId: this.nodeId,
          });
          return;
        }
        const operation = {
          ...claimedOperation,
        };
        if (
          !Array.isArray(operation.stepsHistory) &&
          Array.isArray(rowOperation.stepsHistory)
        ) {
          operation.stepsHistory = rowOperation.stepsHistory;
        }
        if (
          !Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) &&
          Array.isArray(rowOperation[ReplicaOperationField.REPLICA_IDS])
        ) {
          operation[ReplicaOperationField.REPLICA_IDS] =
            rowOperation[ReplicaOperationField.REPLICA_IDS];
        }
        if (
          !Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) &&
          Array.isArray(rowOperation[ReplicaOperationField.PEER_ADDRESSES])
        ) {
          operation[ReplicaOperationField.PEER_ADDRESSES] =
            rowOperation[ReplicaOperationField.PEER_ADDRESSES];
        }
        dispatchResult =
          await this.rebalanceCoordinator.executeOperation(operation);
      }

      if (!dispatchResult || dispatchResult.success !== true) {
        if (
          dispatchResult?.reason ===
          REPLICA_DISPATCH_SERVICE_LITERAL.DEFERRED_RETRY_PENDING
        ) {
          const retryableDispatchError =
            this.buildRetryableSkippedDispatchError(dispatchResult);
          if (
            this.deferOperationDispatchRetry(
              operationId,
              retryableDispatchError,
              row,
              options,
            )
          ) {
            return;
          }
          return;
        }
        if (this.shouldRetrySkippedDispatchResult(dispatchResult)) {
          const retryableDispatchError =
            this.buildRetryableSkippedDispatchError(dispatchResult);
          if (
            this.deferOperationDispatchRetry(
              operationId,
              retryableDispatchError,
              row,
              options,
            )
          ) {
            return;
          }
        }
        if (
          (!dispatchResult ||
            getControlPlaneErrorMessage(dispatchResult).length === 0) &&
          (await this.recoverUnsuccessfulDispatchResult(
            operationId,
            row,
            options,
          ))
        ) {
          return;
        }
        if (
          this.deferOperationDispatchRetry(
            operationId,
            dispatchResult,
            row,
            options,
          )
        ) {
          return;
        }
        this.recordDispatchFailure({
          operationId,
          targetNodeId,
          workflowStep: row.workflow_step || null,
          skipped: dispatchResult?.skipped === true,
          reason:
            dispatchResult?.reason ||
            REPLICA_DISPATCH_SERVICE_LITERAL.DISPATCH_UNSUCCESSFUL,
          error: dispatchResult?.error || null,
          readinessSnapshot: dispatchReadiness.snapshot,
        });
        return;
      }

      this.clearDeferredOperationDispatchRetry(operationId);
      this.dispatchFailureSignaturesByOperationId.delete(operationId);
      this.scheduleRuntimeTargetProgressDispatchVerification(operationId, row);

      this.emit(DISPATCH_EVENT.OPERATION_DISPATCHED, {
        operationId,
        targetNodeId,
        readinessSnapshot: dispatchReadiness.snapshot,
      });
    } catch (error) {
      if (
        this.deferOperationDispatchRetry(operationId, error, row, options)
      ) {
        return;
      }
      throw error;
    } finally {
      this.dispatchInFlight.delete(operationId);
      this.priorityDispatchInFlight.delete(operationId);
    }
  }

  /**
   * Startup can replay ready-node dispatch before the workflow owner has
   * finished initialization. Treat that owner-boundary skip as retryable so
   * the durable PENDING row remains on the canonical dispatch queue.
   *
   * @param {Object|null} dispatchResult
   * @return {boolean}
   * @private
   */
  shouldRetrySkippedDispatchResult(dispatchResult) {
    return shouldRetrySkippedDispatchResult(dispatchResult);
  }

  /**
   * @param {Object|null} dispatchResult
   * @return {Error}
   * @private
   */
  buildRetryableSkippedDispatchError(dispatchResult) {
    return buildRetryableSkippedDispatchError(
      dispatchResult,
      this.operationDispatchRetryAfterMs,
    );
  }

  /**
   * Recover one unsuccessful dispatch attempt that raced authoritative
   * replica_operations visibility.
   *
   * @param {string} operationId
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async recoverUnsuccessfulDispatchResult(operationId, row, options = {}) {
    const visibilityObservation =
      await this.getDispatchRetryOperationVisibilityObservation(operationId);
    const authoritativeRow = visibilityObservation?.row || null;
    if (
      this.shouldSuppressDispatchFailureFromAuthoritativeRow(
        row,
        authoritativeRow,
      )
    ) {
      this.clearDeferredOperationDispatchRetry(operationId);
      this.dispatchFailureSignaturesByOperationId.delete(operationId);
      return true;
    }

    const visibilityLagError = this.buildReplicaOperationVisibilityLagError(
      operationId,
      visibilityObservation?.deferredOutcome || null,
    );
    if (
      this.deferOperationDispatchRetry(
        operationId,
        visibilityLagError,
        authoritativeRow || row,
        options,
      )
    ) {
      this.dispatchFailureSignaturesByOperationId.delete(operationId);
      return true;
    }
    return false;
  }

  /**
   * Suppress one generic dispatch failure when authoritative state already
   * proves that the queued row is stale or ownership moved away.
   *
   * @param {Object|null} row
   * @param {Object|null} authoritativeRow
   * @return {boolean}
   * @private
   */
  shouldSuppressDispatchFailureFromAuthoritativeRow(row, authoritativeRow) {
    if (!authoritativeRow?.operation_id) {
      return false;
    }
    if (!this.isReplicaOperationLocallyOwned(authoritativeRow)) {
      return true;
    }
    if (this.isDispatchReplayableOperationRow(authoritativeRow)) {
      return false;
    }
    return this.hasAuthoritativeReplicaOperationRowChanged(
      row,
      authoritativeRow,
    );
  }

  /**
   * Compare one queued row against the authoritative row shape.
   * @param {Object|null} row
   * @param {Object|null} authoritativeRow
   * @return {boolean}
   * @private
   */
  hasAuthoritativeReplicaOperationRowChanged(row, authoritativeRow) {
    return hasAuthoritativeReplicaOperationRowChanged(
      row,
      authoritativeRow,
    );
  }

  /**
   * Build one retryable visibility-lag error for direct dispatch wake-ups.
   * @param {string} operationId
   * @param {Object|null} deferredOutcome
   * @return {Error}
   * @private
   */
  buildReplicaOperationVisibilityLagError(operationId, deferredOutcome = null) {
    return buildReplicaOperationVisibilityLagError(
      operationId,
      deferredOutcome,
      this.operationDispatchRetryAfterMs,
    );
  }

  /**
   * Build one retryable readiness-gate error for dispatch.
   * @param {string} targetNodeId
   * @param {string} message
   * @param {string} code
   * @param {number|null|undefined} retryAfterMs
   * @param {Error|null} [cause=null]
   * @return {Error}
   * @private
   */
  buildDispatchReadinessGateError(
    targetNodeId,
    message,
    code,
    retryAfterMs,
    cause = null,
  ) {
    return buildDispatchReadinessGateError(
      targetNodeId,
      message,
      code,
      retryAfterMs,
      this.operationDispatchRetryAfterMs,
      cause,
    );
  }

  /**
   * Build one readiness-refresh failure error.
   * @param {string} targetNodeId
   * @param {Object} dispatchReadiness
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshFailureError(targetNodeId, dispatchReadiness) {
    const originalError = dispatchReadiness?.error;
    const originalMessage =
      typeof originalError?.message === 'string' &&
      originalError.message.length > 0 ?
        originalError.message :
        String(originalError || DISPATCH_READINESS_ERROR_REASON.UNKNOWN);
    const code =
      typeof originalError?.code === 'string' &&
      originalError.code.length > 0 ?
        originalError.code :
        DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_READINESS_REFRESH_FAILED;
    return this.buildDispatchReadinessGateError(
      targetNodeId,
      `Target node ${targetNodeId || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN} readiness refresh failed: ` +
        originalMessage,
      code,
      dispatchReadiness?.retryAfterMs,
      originalError,
    );
  }

  /**
   * Build one target-not-ready error.
   * @param {string} targetNodeId
   * @param {Object} dispatchReadiness
   * @return {Error}
   * @private
   */
  buildDispatchNotReadyError(targetNodeId, dispatchReadiness) {
    return this.buildDispatchReadinessGateError(
      targetNodeId,
      `Target node ${targetNodeId || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN} is not ready for dispatch`,
      DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_NOT_READY,
      dispatchReadiness?.retryAfterMs,
    );
  }
}

Object.defineProperties(
  ReplicaDispatchOperationExecution.prototype,
  Object.fromEntries(
    Object.entries(REPLICA_DISPATCH_RECONCILE_CALLBACK_METHODS).map(
      ([name, value]) => [
        name,
        {
          value,
          configurable: true,
          writable: true,
        },
      ],
    ),
  ),
);

export {ReplicaDispatchOperationExecution};
