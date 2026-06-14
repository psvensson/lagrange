import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchRetryScheduling} from './replica-dispatch-retry-scheduling.js';
import {createReplicaDispatchServiceDispatchObservationMethods} from './replica-dispatch-service-dispatch-observation-methods.js';
import {
  shouldAllowPriorityRecoveryDispatchBootstrap,
} from './replica-dispatch-priority-recovery-bootstrap.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  ControlPlaneField,
  ControlPlaneReadinessService,
  DISPATCH_ERROR_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_READINESS_MESSAGE,
  DISPATCH_READINESS_REASON,
  NUM,
  OPERATION_METADATA_KEY,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  ReplicaOperationField,
  SERVICE_TYPE,
  STRING,
  TYPEOF,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isSystemTablePartition,
  isRetryableControlPlaneError,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const DISPATCH_RETRY_READY_NODE_DIMENSIONS = Object.freeze([
  CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
]);

class ReplicaDispatchReadinessCapture extends ReplicaDispatchRetryScheduling {
  replaceDeferredNodeStateUpdatePayload(nodeId, payload) {
    const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (!deferredRetry) {
      return false;
    }
    deferredRetry.payload = this.buildDeferredNodeStateUpdatePayload(payload);
    return true;
  }

  /**
   * Cancel and clear one deferred node-state retry slot.
   * @param {string} nodeId
   * @private
   */
  clearDeferredNodeStateUpdateRetry(nodeId) {
    const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (!deferredRetry) {
      return;
    }
    if (deferredRetry.timeoutHandle) {
      this.clearTimeoutFn(deferredRetry.timeoutHandle);
    }
    this.nodeStateUpdateDeferredRetries.delete(nodeId);
  }

  /**
   * Build one queue name for an operation-dispatch shard.
   * @param {number} shardIndex - Zero-based shard index.
   * @return {string}
   * @private
   */
  buildOperationDispatchQueueName(shardIndex) {
    if (this.operationDispatchQueueShardCount <= NUM.ONE) {
      return DISPATCH_QUEUE_NAME.OPERATION;
    }
    return `${DISPATCH_QUEUE_NAME.OPERATION}-${shardIndex}`;
  }

  /**
   * Resolve one reconcile shard for an operation-dispatch owner key.
   * Distinct operation ids may progress concurrently, while each owner key
   * still remains single-flight inside its assigned shard.
   *
   * @param {string} ownerKey - Operation owner key.
   * @return {OwnerKeyReconcileQueue}
   * @private
   */
  resolveOperationDispatchQueue(ownerKey) {
    if (
      !Array.isArray(this.operationDispatchQueues) ||
      this.operationDispatchQueues.length <= NUM.ONE
    ) {
      return Array.isArray(this.operationDispatchQueues) &&
        this.operationDispatchQueues.length === NUM.ONE ?
        this.operationDispatchQueues[NUM.ZERO] :
        this.operationDispatchQueue;
    }

    const normalizedOwnerKey =
      typeof ownerKey === TYPEOF.STRING ? ownerKey : String(ownerKey || '');
    let hash = NUM.ZERO;
    for (const char of normalizedOwnerKey) {
      hash =
        (hash * REPLICA_DISPATCH_SERVICE_LITERAL.THIRTY_ONE +
          char.charCodeAt(NUM.ZERO)) >>>
        NUM.ZERO;
    }
    const queueIndex = hash % this.operationDispatchQueues.length;
    return this.operationDispatchQueues[queueIndex];
  }

  /**
   * Expose one compatibility queue facade while routing distinct operation ids
   * across dedicated shards under the hood.
   *
   * Tests and diagnostics still observe `operationDispatchQueue`, but one
   * slow operation reconcile can no longer stall every other owner key.
   *
   * @return {Object}
   * @private
   */
  buildOperationDispatchQueueFacade() {
    return {
      enqueue: (ownerKey, reason, context, options) =>
        this.resolveOperationDispatchQueue(ownerKey).enqueue(
          ownerKey,
          reason,
          context,
          options,
        ),
      shutdown: () => {
        for (const queue of this.operationDispatchQueues) {
          queue.shutdown();
        }
      },
      get size() {
        return this.operationDispatchQueues.reduce(
          (sum, queue) => sum + queue.size,
          NUM.ZERO,
        );
      },
      get draining() {
        return this.operationDispatchQueues.some(
          (queue) => queue.draining === true,
        );
      },
      operationDispatchQueues: this.operationDispatchQueues,
    };
  }

  /**
   * Build one queue name for a node-state update shard.
   * @param {number} shardIndex - Zero-based shard index.
   * @return {string}
   * @private
   */
  buildNodeStateUpdateQueueName(shardIndex) {
    if (this.nodeStateUpdateQueueShardCount <= NUM.ONE) {
      return DISPATCH_QUEUE_NAME.NODE_STATE_UPDATE;
    }
    return `${DISPATCH_QUEUE_NAME.NODE_STATE_UPDATE}-${shardIndex}`;
  }

  /**
   * Resolve one node-state update reconcile shard for a node.
   * Assignments are stable for process lifetime to preserve owner-key ordering.
   * @param {string} nodeId - Node ID.
   * @return {OwnerKeyReconcileQueue}
   * @private
   */
  resolveNodeStateUpdateQueue(nodeId) {
    if (
      !Array.isArray(this.nodeStateUpdateQueues) ||
      this.nodeStateUpdateQueues.length <= NUM.ONE
    ) {
      return this.nodeStateUpdateQueue;
    }

    const assignedQueueIndex = this.nodeStateUpdateQueueAssignments.get(nodeId);
    if (Number.isFinite(assignedQueueIndex)) {
      return this.nodeStateUpdateQueues[assignedQueueIndex];
    }

    const queueIndex =
      this.nextNodeStateUpdateQueueIndex % this.nodeStateUpdateQueues.length;
    this.nextNodeStateUpdateQueueIndex += NUM.ONE;
    this.nodeStateUpdateQueueAssignments.set(nodeId, queueIndex);
    return this.nodeStateUpdateQueues[queueIndex];
  }

  /**
   * Build an Operation object from a replica_operations row.
   * @param {Object} row - Replica operation row.
   * @return {Object} Operation object.
   * @private
   */
  buildOperationFromRow(row) {
    const stepsHistory = row.steps_history ? JSON.parse(row.steps_history) : [];
    const operation = {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
      entityType: row[COLUMN.ENTITY_TYPE] || SERVICE_TYPE.PARTITION,
      entityId: row[COLUMN.ENTITY_ID] || row.partition_id,
      replicaId: row.replica_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      status: row.status,
      workflowStep: row.workflow_step,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      stepsHistory,
    };
    const sourceReplicaId = getOperationMetadataString(
      stepsHistory,
      OPERATION_METADATA_KEY.SOURCE_REPLICA_ID,
    );
    if (
      typeof sourceReplicaId === TYPEOF.STRING &&
      sourceReplicaId.length > NUM.ZERO
    ) {
      operation.sourceReplicaId = sourceReplicaId;
    }
    const replicaIds = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.REPLICA_IDS,
    );
    if (replicaIds.length > NUM.ZERO) {
      operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;
    }
    const peerAddresses = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.PEER_ADDRESSES,
    );
    if (peerAddresses.length > NUM.ZERO) {
      operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
    }
    const bootstrapTableMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA,
    );
    if (bootstrapTableMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
        bootstrapTableMetadata;
    }
    const bootstrapPartitionMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
    );
    if (bootstrapPartitionMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] =
        bootstrapPartitionMetadata;
    }
    return operation;
  }

  /**
   * Convert a coordinator operation object to replica_operations row shape.
   * @param {Object} operation - RebalanceCoordinator operation object.
   * @return {Object} Row-like object compatible with dispatchOperationRow.
   * @private
   */
  buildOperationRowFromCoordinator(operation) {
    let stepsHistory = operation.stepsHistory;
    if (typeof stepsHistory !== TYPEOF.STRING) {
      stepsHistory = Array.isArray(stepsHistory) ?
        JSON.stringify(stepsHistory) :
        STRING.EMPTY_JSON_ARRAY;
    }

    return {
      operation_id: operation.operationId,
      type: operation.type,
      partition_id: operation.partitionId,
      replica_id: operation.replicaId,
      source_node_id: operation.sourceNodeId,
      target_node_id: operation.targetNodeId,
      status: operation.status,
      workflow_step: operation.workflowStep,
      created_at: operation.createdAt,
      updated_at: operation.updatedAt,
      completed_at: operation.completedAt,
      error_message: operation.errorMessage,
      steps_history: stepsHistory,
      [COLUMN.ENTITY_TYPE]: operation.entityType,
      [COLUMN.ENTITY_ID]: operation.entityId,
    };
  }

  /**
   * Dispatch is internal control-plane progression. Critical system-table
   * recovery operations must use the recovery eligibility dimension because
   * repair eligibility can remain closed until priority spread itself
   * progresses.
   *
   * @param {Object|string|null} operationOrPartitionId
   * @return {string}
   * @private
   */
  resolveDispatchReadinessDecisionDimension(operationOrPartitionId = null) {
    const partitionId =
      typeof operationOrPartitionId === TYPEOF.STRING ?
        operationOrPartitionId :
        operationOrPartitionId?.partitionId ||
          operationOrPartitionId?.partition_id ||
          null;
    if (isSystemTablePartition({partitionId})) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * Check readiness eligibility from explicit canonical evidence.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT ?
        readiness.dimensions :
        null;
    if (!dimensions) {
      return false;
    }
    if (dimensions[decisionDimension] === true) {
      return true;
    }
    if (
      decisionDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      return false;
    }
    return false;
  }

  /**
   * Allow control-plane recovery dispatch to reuse the already visible sync
   * readiness snapshot when the bounded authoritative refresh path fails for a
   * retryable reason. This keeps critical recovery progressing under transient
   * control-plane pressure without widening dispatch eligibility beyond the
   * canonical recovery-eligible snapshot already in hand.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */
  shouldUseSyncDispatchReadinessFallback(readiness, decisionDimension, error) {
    if (
      decisionDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      return false;
    }
    if (!this.isReadinessDimensionSatisfied(readiness, decisionDimension)) {
      return false;
    }
    if (!isRetryableControlPlaneError(error)) {
      return false;
    }
    return true;
  }

  /**
   * Check whether a node is ready for internal topology dispatch work.
   * Dispatch is an internal topology consumer and gates on repairEligible
   * only (Req 4.2). Serve-only dimensions do not block dispatch.
   * @readModel DISPATCH_NODE_READINESS — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId - Node ID.
   * @return {boolean} True if node is ready.
   * @private
   */
  isNodeReady(nodeId, options = {}) {
    if (
      !nodeId ||
      typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }

    const decisionDimension =
      typeof options?.decisionDimension === TYPEOF.STRING &&
      options.decisionDimension.length > NUM.ZERO ?
        options.decisionDimension :
        this.resolveDispatchReadinessDecisionDimension();
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension: decisionDimension,
      },
    );
    return this.isReadinessDimensionSatisfied(readiness, decisionDimension);
  }

  isNodeReadyForDispatchRetry(nodeId) {
    return DISPATCH_RETRY_READY_NODE_DIMENSIONS.some((decisionDimension) =>
      this.isNodeReady(nodeId, {decisionDimension}),
    );
  }

  /**
   * Capture readiness snapshot for a dispatch decision.
   * Same-node dispatches that already have the canonical local handler
   * capability must not self-deadlock on a second authoritative refresh.
   * Returns both the ready/not-ready verdict and the compact snapshot summary
   * for persistence in diagnostics.
   *
   * @param {Object} operation - Target operation snapshot.
   * @return {Promise<{
   *   ready: boolean,
   *   snapshot: Object|null,
   *   retryAfterMs: number|null,
   *   error?: Error,
   * }>}
   * @private
   */
  async captureDispatchReadiness(operation, options = {}) {
    const nodeId = operation?.targetNodeId || null;
    if (!nodeId) {
      return this.buildDispatchReadinessResult(null, null, {
        ready: false,
        snapshot: null,
        retryAfterMs: null,
      });
    }
    const decisionDimension =
      this.resolveDispatchReadinessDecisionDimension(operation);
    const readyRetryReadiness = this.buildReadyRetryDispatchReadiness(
      operation,
      decisionDimension,
      options,
    );
    if (readyRetryReadiness) {
      return this.buildDispatchReadinessResult(
        readyRetryReadiness,
        decisionDimension,
      );
    }
    const localHandlerReadiness = await this.buildLocalHandlerDispatchReadiness(
      operation,
      decisionDimension,
    );
    if (localHandlerReadiness) {
      return this.buildDispatchReadinessResult(
        localHandlerReadiness,
        decisionDimension,
      );
    }
    let readiness = null;
    if (
      typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
      TYPEOF.FUNCTION
    ) {
      readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
        nodeId,
        {
          decisionDimension,
        },
      );
    }
    if (
      typeof this.controlPlaneReadinessService.getNodeReadiness ===
      TYPEOF.FUNCTION
    ) {
      try {
        const authoritativeReadiness = await this.getBoundedDispatchReadiness(
          nodeId,
          decisionDimension,
        );
        if (
          authoritativeReadiness &&
          typeof authoritativeReadiness === TYPEOF.OBJECT
        ) {
          readiness = authoritativeReadiness;
        }
      } catch (error) {
        if (
          this.shouldUseSyncDispatchReadinessFallback(
            readiness,
            decisionDimension,
            error,
          )
        ) {
          const retryAfterMs =
            Number.isFinite(readiness?.retryAfterMs) &&
            readiness.retryAfterMs > NUM.ZERO ?
              Math.floor(readiness.retryAfterMs) :
              null;
          return this.buildDispatchReadinessResult(
            readiness,
            decisionDimension,
            {
              ready: true,
              retryAfterMs,
            },
          );
        }
        return this.buildDispatchReadinessResult(readiness, decisionDimension, {
          ready: false,
          retryAfterMs: this.resolveOperationDispatchRetryAfterMs(error),
          error,
        });
      }
    }
    return this.buildDispatchReadinessResult(readiness, decisionDimension, {
      ready: this.resolveDispatchReadinessReady(
        operation,
        readiness,
        decisionDimension,
      ),
    });
  }

  /**
   * @param {Object|null} operation
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  resolveDispatchReadinessReady(operation, readiness, decisionDimension) {
    return (
      this.isReadinessDimensionSatisfied(readiness, decisionDimension) ||
      shouldAllowPriorityRecoveryDispatchBootstrap({
        operation,
        readiness,
        decisionDimension,
        selfNodeId: this.nodeId,
      })
    );
  }

  /**
   * Ready-node retries already proved one fresh ready lease for the target.
   * Reuse that evidence with the canonical sync readiness snapshot instead of
   * forcing a second authoritative refresh before the same dispatch attempt.
   *
   * @param {Object|null} operation
   * @param {string} decisionDimension
   * @param {Object} [options={}]
   * @return {Object|null}
   * @private
   */
  buildReadyRetryDispatchReadiness(operation, decisionDimension, options = {}) {
    const readyNodeId =
      typeof options?.readyNodeId === TYPEOF.STRING ?
        options.readyNodeId :
        null;
    const targetNodeId = operation?.targetNodeId || null;
    if (!readyNodeId || !targetNodeId || readyNodeId !== targetNodeId) {
      return null;
    }
    const readyNodeRow =
      options?.readyNodeRow && typeof options.readyNodeRow === TYPEOF.OBJECT ?
        options.readyNodeRow :
        null;
    if (
      !readyNodeRow ||
      !wasNodeRecordReadyWhenWritten(readyNodeRow, {
        requireActiveStatus: true,
      })
    ) {
      return null;
    }
    if (
      typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
      TYPEOF.FUNCTION
    ) {
      return null;
    }
    const syncReadiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, {
        decisionDimension,
      });
    if (!this.isReadinessDimensionSatisfied(syncReadiness, decisionDimension)) {
      return null;
    }
    return syncReadiness;
  }

  /**
   * Same-node dispatch targets use one local capability owner instead of
   * re-proving remote control-plane reachability through an authoritative
   * refresh that can block their own progression.
   *
   * @param {Object|null} operation
   * @param {string} decisionDimension
   * @return {Promise<Object|null>}
   * @private
   */
  async buildLocalHandlerDispatchReadiness(operation, decisionDimension) {
    const targetNodeId = operation?.targetNodeId || null;
    if (!targetNodeId || targetNodeId !== this.nodeId) {
      return null;
    }
    const entityType = operation?.entityType || SERVICE_TYPE.PARTITION;
    const hasLocalHandler = await this.hasHandlerOnTarget(
      targetNodeId,
      entityType,
    );
    if (!hasLocalHandler) {
      return null;
    }
    return {
      nodeId: targetNodeId,
      observedAt: new Date().toISOString(),
      dimensions: {
        [decisionDimension]: true,
      },
      reasons: [
        {
          code: DISPATCH_READINESS_REASON.LOCAL_HANDLER_AVAILABLE,
        },
      ],
    };
  }

  /**
   * Build one dispatch-readiness result object.
   * @param {Object|null} readiness
   * @param {string|null} decisionDimension
   * @param {Object} [overrides={}]
   * @return {{
   *   ready: boolean,
   *   snapshot: Object|null,
   *   retryAfterMs: number|null,
   *   error?: Error,
   * }}
   * @private
   */
  buildDispatchReadinessResult(readiness, decisionDimension, overrides = {}) {
    const snapshot = Object.prototype.hasOwnProperty.call(overrides, 'snapshot') ?
      overrides.snapshot :
      ControlPlaneReadinessService.compactSnapshotSummary(
        readiness,
        decisionDimension,
      );
    const retryAfterMs = Object.prototype.hasOwnProperty.call(
      overrides,
      'retryAfterMs',
    ) ?
      overrides.retryAfterMs :
      Number.isFinite(readiness?.retryAfterMs) &&
          readiness.retryAfterMs > NUM.ZERO ?
        Math.floor(readiness.retryAfterMs) :
        null;
    const result = {
      ready: Object.prototype.hasOwnProperty.call(overrides, 'ready') ?
        overrides.ready :
        this.isReadinessDimensionSatisfied(readiness, decisionDimension),
      snapshot,
      retryAfterMs,
    };
    if (
      Object.prototype.hasOwnProperty.call(
        overrides,
        REPLICA_DISPATCH_SERVICE_LITERAL.ERROR,
      )
    ) {
      result.error = overrides.error;
    }
    return result;
  }

  /**
   * Forward control message to the current leader.
   * @param {Object} mgService - Message group service.
   * @param {Object} payload - Control message payload.
   * @private
   */
  async forwardToLeader(mgService, payload, options = {}) {
    const requiredTables = Array.isArray(options.requiredTables) ?
      [
        ...new Set(
          options.requiredTables.filter(
            (tableName) =>
              typeof tableName === TYPEOF.STRING &&
                tableName.length > NUM.ZERO,
          ),
        ),
      ] :
      [];
    if (requiredTables.length > NUM.ZERO) {
      const ingressDecision =
        options.ingressDecision ||
        (await this.resolveMessageGroupIngressDecision(
          mgService,
          requiredTables,
        ));
      if (
        typeof mgService?.forwardMetadataIngressPayloadToLeader !==
        TYPEOF.FUNCTION
      ) {
        throw this.buildIngressReadinessError(
          ingressDecision,
          DISPATCH_ERROR_MSG.METADATA_FORWARD_PATH_UNAVAILABLE,
        );
      }
      await mgService.forwardMetadataIngressPayloadToLeader(payload, {
        requiredTables,
        forwardedByNodeId: this.nodeId,
      });
      return;
    }

    const leaderId = mgService.getLeaderId();
    if (!leaderId) {
      const ingressDecision =
        options.ingressDecision ||
        this.resolveMessageGroupIngressReadiness(mgService, requiredTables);
      throw this.buildIngressReadinessError(
        ingressDecision,
        DISPATCH_READINESS_MESSAGE.CONTROL_PLANE_LEADER_NOT_READY,
      );
    }

    const forwardedBy = Array.isArray(payload[ControlPlaneField.FORWARDED_BY]) ?
      payload[ControlPlaneField.FORWARDED_BY] :
      payload[ControlPlaneField.FORWARDED_BY] ?
        [payload[ControlPlaneField.FORWARDED_BY]] :
        [];

    if (forwardedBy.includes(this.nodeId)) {
      return;
    }

    const leaderAddress = mgService.buildPeerAddress(leaderId);
    const forwardedPayload = {
      ...payload,
      [ControlPlaneField.FORWARDED_BY]: [...forwardedBy, this.nodeId],
    };

    await mgService.sendMessage(leaderAddress, forwardedPayload);
  }

  /**
   * Build one ingress-readiness error.
   * @param {Object|null} readiness
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildIngressReadinessError(readiness, fallbackMessage) {
    const error = new Error(readiness?.reason || fallbackMessage);
    if (
      Number.isFinite(readiness?.retryAfterMs) &&
      readiness.retryAfterMs > NUM.ZERO
    ) {
      error.deferRetry = true;
      error.retryAfterMs = readiness.retryAfterMs;
    }
    return error;
  }

  /**
   * Check if a payload is a control-plane message.
   * @param {Object} payload - Message payload.
   * @return {boolean} True if control-plane message.
   * @private
   */
}

Object.defineProperties(
  ReplicaDispatchReadinessCapture.prototype,
  createReplicaDispatchServiceDispatchObservationMethods(),
);

export {ReplicaDispatchReadinessCapture};
