import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {DISPATCH_PENDING_WORKFLOW_STEPS} from '../rebalancer/replica-operation-step-policy.js';

const {
  COLUMN,
  ControlPlaneField,
  DISPATCH_LOG_MSG,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  SERVICE_STATUS,
  SYSTEM_TABLE_NAME,
  isCoordinatorOwnedOperationType,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const READY_NODE_DISPATCH_RETRY_CONTEXT_FIELD = Object.freeze({
  FORCE_READY_WATERMARK: 'forceReadyWatermark',
});

/**
 * Reconcile-queue callbacks and cache-change handlers attached to the dispatch
 * service prototype. These run with the service instance as `this`, sharing the
 * same prototype chain as the operation-execution methods.
 */
const REPLICA_DISPATCH_RECONCILE_CALLBACK_METHODS = {
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
      typeof this.isNodeReadyForDispatchRetry === 'function' ?
        this.isNodeReadyForDispatchRetry(nodeId) :
        this.isNodeReady(nodeId);
    if (!nodeId || !readyForDispatchRetry) {
      this.clearNodeReadyRetryWatermark(nodeId);
      return false;
    }

    const nodeRow =
      options.nodeRow && typeof options.nodeRow === 'object' ?
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
  },

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
  },

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
          typeof this.rebalanceCoordinator.dispatchOperation === 'function'
        ) {
          await this.rebalanceCoordinator.dispatchOperation(operation, {
            cause: REPLICA_DISPATCH_SERVICE_LITERAL.REPLICA_OPERATION_DISPATCH,
          });
        } else {
          await this.rebalanceCoordinator.executeOperation(operation);
        }
        return;
      }

      if (!DISPATCH_PENDING_WORKFLOW_STEPS.has(row.workflow_step)) {
        this.clearDeferredOperationDispatchRetry(operationId);
        return;
      }

      await this.dispatchOperationRow(row, {
        readyNodeId:
          typeof context?.readyNodeId === 'string' &&
          context.readyNodeId.length > 0 ?
            context.readyNodeId :
            null,
        readyNodeRow:
          context?.readyNodeRow && typeof context.readyNodeRow === 'object' ?
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
  },

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
  },

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
      typeof this.isNodeReadyForDispatchRetry === 'function' ?
        this.isNodeReadyForDispatchRetry(nodeId) :
        this.isNodeReady(nodeId);
    if (!nodeId || !readyForDispatchRetry) {
      return false;
    }
    const retryContext =
      context && typeof context === 'object' ? context : {};
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
  },

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
        failureCount: retryState?.failureCount || 1,
        error: error.message,
        errorCode: error?.code || null,
      });
    }
  },

  /**
   * Handle cache updates and retry dispatch when key rows become available.
   * @param {string} tableName - Updated table name.
   * @param {string|Object} operationOrRecord - Operation or updated row.
   * @param {Object} [recordInput] - Updated row.
   * @private
   */
  handleCacheNodeChange(tableName, operationOrRecord, recordInput) {
    const operation =
      typeof operationOrRecord === 'string' ? operationOrRecord : null;
    const record = recordInput || operationOrRecord;
    if (!record) {
      return;
    }

    if (tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS) {
      this.scheduleLocalReadyNodeMembershipPublicationAdvance(
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
        record,
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
  },
};

export {REPLICA_DISPATCH_RECONCILE_CALLBACK_METHODS};
