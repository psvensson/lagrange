import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {
  buildDispatchReadinessGateError,
  buildReplicaOperationVisibilityLagError,
  buildRetryableSkippedDispatchError,
  hasAuthoritativeReplicaOperationRowChanged,
  resolveNodeStateUpdateBudgetFields,
  shouldRetrySkippedDispatchResult,
} from './replica-dispatch-service-dispatch-error-helpers.js';
import {
  ReplicaDispatchReplayReadiness,
} from './replica-dispatch-replay-readiness.js';

const {
  COLUMN,
  ControlPlaneField,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_READINESS_ERROR_CODE,
  DISPATCH_READINESS_ERROR_REASON,
  NUM,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  ReplicaOperationField,
  SERVICE_STATUS,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  assertCritical,
  getControlPlaneErrorMessage,
  isCoordinatorOwnedOperationType,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const READY_NODE_DISPATCH_RETRY_CONTEXT_FIELD = Object.freeze({
  FORCE_READY_WATERMARK: 'forceReadyWatermark',
});

class ReplicaDispatchServiceSegment2 extends ReplicaDispatchReplayReadiness {
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
      typeof payload[ControlPlaneField.OPERATION_ROW] === TYPEOF.OBJECT ?
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
        } :
        undefined,
    );
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

    this.dispatchInFlight.add(operationId);
    try {
      let dispatchResult = null;
      if (
        typeof this.rebalanceCoordinator.dispatchOperation === TYPEOF.FUNCTION
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
            getControlPlaneErrorMessage(dispatchResult).length === NUM.ZERO) &&
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
      typeof originalError?.message === TYPEOF.STRING &&
      originalError.message.length > NUM.ZERO ?
        originalError.message :
        String(originalError || DISPATCH_READINESS_ERROR_REASON.UNKNOWN);
    const code =
      typeof originalError?.code === TYPEOF.STRING &&
      originalError.code.length > NUM.ZERO ?
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

  /**
   * Retry pending dispatches for a ready node while deduping duplicate
   * triggers for the same heartbeat row.
   * @param {Object} options - Retry trigger details.
   * @param {string} options.nodeId - Target node ID.
   * @param {Object} [options.nodeRow] - Candidate nodes row.
   * @param {string} [options.source] - Trigger source for diagnostics.
   * @return {Promise<boolean>} True when retry path was executed.
   * @private
   */
  async retryPendingDispatchesForReadyNode(options = {}) {
    const nodeId = options.nodeId;
    const readyForDispatchRetry =
      typeof this.isNodeReadyForDispatchRetry === TYPEOF.FUNCTION ?
        this.isNodeReadyForDispatchRetry(nodeId) :
        this.isNodeReady(nodeId);
    if (!nodeId || !readyForDispatchRetry) {
      this.clearNodeReadyRetryWatermark(nodeId);
      return false;
    }

    const nodeRow =
      options.nodeRow && typeof options.nodeRow === TYPEOF.OBJECT ?
        options.nodeRow :
        await this.getNodeRow(nodeId);
    if (
      nodeRow &&
      !wasNodeRecordReadyWhenWritten(nodeRow, {
        requireActiveStatus: true,
      })
    ) {
      return false;
    }

    if (
      options?.[
        READY_NODE_DISPATCH_RETRY_CONTEXT_FIELD.FORCE_READY_WATERMARK
      ] !== true &&
      !this.shouldRetryNodeReadyWatermark(nodeId, nodeRow)
    ) {
      this.logger.debug(DISPATCH_LOG_MSG.RETRY_READY_TRIGGER_SKIPPED, {
        nodeId,
        source: options.source || null,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.DUPLICATE_READY_TRIGGER,
      });
      return false;
    }

    await this.retryPendingDispatchesForNode(nodeId, {
      readyNodeRow: nodeRow,
    });
    return true;
  }

  /**
   * Resolve the row for one operation-dispatch reconcile. Verification retries
   * prefer a fresh owner-path row so acknowledged remote wake-ups stop once
   * durable progress is visible, while still retaining the original wake-up
   * row if control-plane visibility is temporarily unavailable.
   *
   * @param {string} operationId
   * @param {Object} [context]
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveOperationDispatchReconcileRow(operationId, context = {}) {
    const contextRow = context?.row || null;
    if (
      context?.[
        REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
      ] !== true
    ) {
      return contextRow || await this.getReplicaOperationRow(operationId);
    }
    return (await this.getReplicaOperationRow(operationId)) || contextRow;
  }

  /**
   * Reconcile callback for the operation dispatch queue.
   * Resolves the operation row and dispatches or executes it.
   * @param {string} operationId - The operation to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @private
   */
  async reconcileOperationDispatch(operationId, context) {
    if (!this.rebalanceCoordinator) {
      return;
    }

    const row = await this.resolveOperationDispatchReconcileRow(
      operationId,
      context,
    );

    if (!row || !row.operation_id) {
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }
    if (!isCoordinatorOwnedOperationType(row.type)) {
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }

    try {
      if (this.shouldExecuteOperationFromDispatchReplay(row)) {
        this.clearDeferredOperationDispatchRetry(operationId);
        const operation = this.buildOperationFromRow(row);
        if (
          typeof this.rebalanceCoordinator.dispatchOperation === TYPEOF.FUNCTION
        ) {
          await this.rebalanceCoordinator.dispatchOperation(operation, {
            cause: REPLICA_DISPATCH_SERVICE_LITERAL.REPLICA_OPERATION_DISPATCH,
          });
        } else {
          await this.rebalanceCoordinator.executeOperation(operation);
        }
        return;
      }

      if (
        row.workflow_step !== WORKFLOW_STEP.PENDING &&
        row.workflow_step !== WORKFLOW_STEP.SENDING
      ) {
        this.clearDeferredOperationDispatchRetry(operationId);
        return;
      }

      await this.dispatchOperationRow(row, {
        readyNodeId:
          typeof context?.readyNodeId === TYPEOF.STRING &&
          context.readyNodeId.length > NUM.ZERO ?
            context.readyNodeId :
            null,
        readyNodeRow:
          context?.readyNodeRow && typeof context.readyNodeRow === TYPEOF.OBJECT ?
            context.readyNodeRow :
            null,
        [REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH]:
          context?.[
            REPLICA_DISPATCH_SERVICE_LITERAL.REFRESH_ROW_BEFORE_DISPATCH
          ] === true,
      });
    } catch (error) {
      if (
        this.deferOperationDispatchRetry(
          operationId,
          error,
          row,
          context,
        )
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Reconcile callback for the node-ready retry queue.
   * Checks readiness and retries pending dispatches for the node.
   * @param {string} nodeId - The node to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @private
   */
  async reconcileNodeReadyRetry(nodeId, context) {
    const nodeRow = context?.nodeRow || null;
    await this.retryPendingDispatchesForReadyNode({
      nodeId,
      nodeRow,
      source: context?.source || null,
      [READY_NODE_DISPATCH_RETRY_CONTEXT_FIELD.FORCE_READY_WATERMARK]:
        context?.[
          READY_NODE_DISPATCH_RETRY_CONTEXT_FIELD.FORCE_READY_WATERMARK
        ] === true,
    });
  }

  /**
   * Enqueue a local READY-node dispatch rediscovery trigger that bypasses the
   * heartbeat watermark. Publication updates can reveal or advance recovery
   * work without changing the node row itself.
   * @param {string} reason - Reconcile reason for the trigger.
   * @param {Object} [context] - Additional retry context.
   * @return {boolean} True when a retry was enqueued.
   * @private
   */
  enqueueLocalReadyNodeDispatchRetry(reason, context = {}) {
    const nodeId = this.nodeId;
    const readyForDispatchRetry =
      typeof this.isNodeReadyForDispatchRetry === TYPEOF.FUNCTION ?
        this.isNodeReadyForDispatchRetry(nodeId) :
        this.isNodeReady(nodeId);
    if (!nodeId || !readyForDispatchRetry) {
      return false;
    }
    const retryContext =
      context && typeof context === TYPEOF.OBJECT ? context : {};
    this.nodeReadyRetryQueue.enqueue(
      nodeId,
      reason,
      {
        ...retryContext,
        source: reason,
        [READY_NODE_DISPATCH_RETRY_CONTEXT_FIELD.FORCE_READY_WATERMARK]: true,
      },
    );
    return true;
  }

  /**
   * Reconcile callback for the node-state update queue.
   * Applies the latest queued payload for one node.
   * @param {string} nodeId - The node to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @return {Promise<void>}
   * @private
   */
  async reconcileNodeStateUpdate(nodeId, context) {
    const payload = context?.payload || null;
    if (!payload || payload[ControlPlaneField.NODE_ID] !== nodeId) {
      return;
    }
    try {
      await this.handleNodeStateUpdate(payload);
      this.clearDeferredNodeStateUpdateRetry(nodeId);
      this.clearNodeStateUpdateRetryState(nodeId);
    } catch (error) {
      if (!this.shouldDeferNodeStateUpdateRetry(error, payload)) {
        throw error;
      }
      const retryAfterMs = this.deferNodeStateUpdateRetry(
        nodeId,
        payload,
        error,
      );
      const retryState = this.nodeStateUpdateRetryStateByNodeId.get(nodeId);
      this.logger.info(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
        nodeId,
        retryAfterMs,
        retryClass:
          retryState?.retryClass || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN,
        failureCount: retryState?.failureCount || NUM.ONE,
        error: error.message,
        errorCode: error?.code || null,
      });
    }
  }

  /**
   * Handle cache updates and retry dispatch when key rows become available.
   * @param {string} tableName - Updated table name.
   * @param {string|Object} operationOrRecord - Operation or updated row.
   * @param {Object} [recordInput] - Updated row.
   * @private
   */
  handleCacheNodeChange(tableName, operationOrRecord, recordInput) {
    const operation =
      typeof operationOrRecord === TYPEOF.STRING ? operationOrRecord : null;
    const record = recordInput || operationOrRecord;
    if (!record) {
      return;
    }

    if (tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS) {
      this.scheduleLocalReadyNodeMembershipPublicationAdvance(
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
        record,
      );
      this.enqueueLocalReadyNodeDispatchRetry(
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
      );
      return;
    }

    if (tableName === SYSTEM_TABLE_NAME.NODES) {
      const nodeId = this.getNodeIdFromRecord(record);
      if (!nodeId) {
        return;
      }
      if (
        wasNodeRecordReadyWhenWritten(record, {
          requireActiveStatus: true,
        })
      ) {
        this.scheduleReadyNodeMembershipPublicationAdvance(
          nodeId,
          record,
          RECONCILE_REASON.NODES_CACHE_READY,
        );
      }
      this.nodeReadyRetryQueue.enqueue(
        nodeId,
        RECONCILE_REASON.NODES_CACHE_READY,
        {nodeRow: record},
      );
      return;
    }

    if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      if (operation === REPLICA_DISPATCH_SERVICE_LITERAL.DELETE) {
        return;
      }
      this.replayReplicaOperationRow(record, {
        pendingReason: RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
        replaceActiveReason:
          RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE,
      });
      return;
    }

    if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
      return;
    }

    const nodeId = this.getNodeIdFromRecord(record);
    const status = record?.[COLUMN.STATUS] || record?.status || null;
    if (
      !nodeId ||
      status !== SERVICE_STATUS.ACTIVE ||
      !this.isNodeReady(nodeId)
    ) {
      return;
    }

    this.nodeReadyRetryQueue.enqueue(
      nodeId,
      RECONCILE_REASON.SERVICES_CACHE_ACTIVE,
    );
  }
}

export {ReplicaDispatchServiceSegment2};
