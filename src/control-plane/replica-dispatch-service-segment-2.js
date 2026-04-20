import { REPLICA_DISPATCH_SERVICE_SHARED } from "./replica-dispatch-service-shared.js";
import { ReplicaDispatchServiceSegment1 } from "./replica-dispatch-service-segment-1.js";

const {
  COLUMN,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_EVENT,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_READY_LEASE_MS,
  DISPATCH_DEFAULT,
  DISPATCH_ERROR_MSG,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_READINESS_ERROR_CODE,
  DISPATCH_READINESS_ERROR_REASON,
  DISPATCH_READINESS_MESSAGE,
  DISPATCH_READINESS_REASON,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
  EventEmitter,
  LoggingService,
  MEMBERSHIP_PUBLICATION_STATUS,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
  NUM,
  OPERATION_METADATA_KEY,
  OperationType,
  OwnerKeyReconcileQueue,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  READY_NODE_PUBLICATION_ADVANCEMENT_STATE,
  REBALANCE_COORDINATOR_EVENT,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  assertCritical,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getNodeHeartbeatWatermark,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isCoordinatorOwnedOperationType,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  isRetryableControlPlaneError,
  isTerminalMembershipPublicationStatus,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReadyNodePublicationAdvancementState,
  resolveReplayControlPlaneNodeStatePublicationMode,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

class ReplicaDispatchServiceSegment2 extends ReplicaDispatchServiceSegment1 {
  resolveNodeStateUpdateBudgetFields(nodeRow) {
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return {};
    }

    const budgetFields = {};
    const storageBudgetBytes = Number(nodeRow?.[COLUMN.STORAGE_BUDGET_BYTES]);
    if (Number.isFinite(storageBudgetBytes) && storageBudgetBytes > NUM.ZERO) {
      budgetFields[COLUMN.STORAGE_BUDGET_BYTES] =
        Math.floor(storageBudgetBytes);
    }

    const storageBudgetSource = nodeRow?.[COLUMN.STORAGE_BUDGET_SOURCE];
    if (
      typeof storageBudgetSource === TYPEOF.STRING &&
      storageBudgetSource.length > NUM.ZERO
    ) {
      budgetFields[COLUMN.STORAGE_BUDGET_SOURCE] = storageBudgetSource;
    }

    const storageBudgetUpdatedAt = Number(
      nodeRow?.[COLUMN.STORAGE_BUDGET_UPDATED_AT],
    );
    if (
      Number.isFinite(storageBudgetUpdatedAt) &&
      storageBudgetUpdatedAt > NUM.ZERO
    ) {
      budgetFields[COLUMN.STORAGE_BUDGET_UPDATED_AT] = Math.floor(
        storageBudgetUpdatedAt,
      );
    }

    return budgetFields;
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
      typeof payload[ControlPlaneField.OPERATION_ROW] === TYPEOF.OBJECT
        ? payload[ControlPlaneField.OPERATION_ROW]
        : null;
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
      operationRow ? { row: operationRow } : undefined,
    );
  }

  /**
   * Dispatch an operation record to its target node.
   * @param {Object} row - Replica operation row.
   * @private
   */
  async dispatchOperationRow(row) {
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
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }

    const targetNodeId = row.target_node_id;
    const rowOperation = this.buildOperationFromRow(row);
    const dispatchReadiness = await this.captureDispatchReadiness(rowOperation);
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
      if (this.deferOperationDispatchRetry(operationId, readinessError, row)) {
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
      if (this.deferOperationDispatchRetry(operationId, readinessError, row)) {
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
          await this.rebalanceCoordinator.dispatchOperation(rowOperation);
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
          return;
        }
        if (
          (!dispatchResult ||
            getControlPlaneErrorMessage(dispatchResult).length === NUM.ZERO) &&
          (await this.recoverUnsuccessfulDispatchResult(operationId, row))
        ) {
          return;
        }
        if (
          this.deferOperationDispatchRetry(operationId, dispatchResult, row)
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
      if (this.deferOperationDispatchRetry(operationId, error, row)) {
        return;
      }
      throw error;
    } finally {
      this.dispatchInFlight.delete(operationId);
    }
  }

  /**
   * Recover one unsuccessful dispatch attempt that raced authoritative
   * replica_operations visibility.
   *
   * @param {string} operationId
   * @param {Object} row
   * @return {Promise<boolean>}
   * @private
   */
  async recoverUnsuccessfulDispatchResult(operationId, row) {
    const authoritativeRow =
      await this.getAuthoritativeReplicaOperationRow(operationId);
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

    const visibilityLagError =
      this.buildReplicaOperationVisibilityLagError(operationId);
    if (
      this.deferOperationDispatchRetry(
        operationId,
        visibilityLagError,
        authoritativeRow || row,
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
    if (!row?.operation_id || !authoritativeRow?.operation_id) {
      return false;
    }
    if (
      row.workflow_step !== authoritativeRow.workflow_step ||
      row.status !== authoritativeRow.status ||
      row.replica_id !== authoritativeRow.replica_id ||
      row.source_node_id !== authoritativeRow.source_node_id ||
      row.target_node_id !== authoritativeRow.target_node_id
    ) {
      return true;
    }
    const staleUpdatedAt = Number(row.updated_at);
    const authoritativeUpdatedAt = Number(authoritativeRow.updated_at);
    return (
      Number.isFinite(authoritativeUpdatedAt) &&
      (!Number.isFinite(staleUpdatedAt) ||
        authoritativeUpdatedAt > staleUpdatedAt)
    );
  }

  /**
   * Build one retryable visibility-lag error for direct dispatch wake-ups.
   * @param {string} operationId
   * @return {Error}
   * @private
   */
  buildReplicaOperationVisibilityLagError(operationId) {
    const error = new Error(
      `${REPLICA_DISPATCH_SERVICE_LITERAL.CACHE_UPDATE_NOT_OBSERVED_FOR_REPLICA_OPERATION} ${operationId}`,
    );
    error.code =
      REPLICA_DISPATCH_SERVICE_LITERAL.REPLICA_OPERATION_VISIBILITY_LAG;
    error.operationId = operationId;
    error.deferRetry = true;
    error.retryAfterMs = this.operationDispatchRetryAfterMs;
    return error;
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
    const error = new Error(message);
    error.code = code;
    error.targetNodeId = targetNodeId || null;
    error.deferRetry = true;
    error.retryAfterMs =
      Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO
        ? retryAfterMs
        : this.operationDispatchRetryAfterMs;
    if (cause) {
      error.cause = cause;
    }
    return error;
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
      originalError.message.length > NUM.ZERO
        ? originalError.message
        : String(originalError || DISPATCH_READINESS_ERROR_REASON.UNKNOWN);
    const code =
      typeof originalError?.code === TYPEOF.STRING &&
      originalError.code.length > NUM.ZERO
        ? originalError.code
        : DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_READINESS_REFRESH_FAILED;
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
   * Retry dispatches for operations targeting a ready node.
   * Re-enters the canonical per-operation queue so ready-node retries cannot
   * create a second inline dispatch owner path.
   * @param {string} nodeId - Ready node ID.
   * @return {Promise<void>}
   * @private
   */
  async retryPendingDispatchesForNode(nodeId) {
    if (!nodeId || this.retryInFlightNodes.has(nodeId)) {
      return;
    }

    this.retryInFlightNodes.add(nodeId);
    try {
      const dispatchRows = await this.getDispatchRetryRowsForNode(nodeId);
      if (dispatchRows.length === NUM.ZERO) {
        return;
      }

      this.logger.info(DISPATCH_LOG_MSG.RETRY_PENDING_READY_NODE, {
        nodeId,
        pendingCount: dispatchRows.length,
      });

      for (const row of dispatchRows) {
        if (!row?.operation_id) {
          continue;
        }
        this.operationDispatchQueue.enqueue(
          row.operation_id,
          RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
          { row },
        );
      }
    } finally {
      this.retryInFlightNodes.delete(nodeId);
    }
  }

  /**
   * Resolve the node that must be ready for one dispatch replay.
   * REPLACE operations in ACTIVE replay source removal against the source
   * node, while initial dispatch phases still target the replacement node.
   *
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveDispatchReplayNodeId(operation) {
    if (!operation || typeof operation !== TYPEOF.OBJECT) {
      return null;
    }
    if (
      operation.type === OperationType.REPLACE &&
      operation.workflow_step === WORKFLOW_STEP.ACTIVE
    ) {
      return operation.source_node_id || operation.target_node_id || null;
    }
    return operation.target_node_id || null;
  }

  /**
   * Determine whether one row remains replayable through the dispatch queue.
   * PENDING/SENDING rows replay initial dispatch. ACTIVE REPLACE rows replay
   * source removal on the canonical owner.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isDispatchReplayableOperationRow(operation) {
    if (!operation || typeof operation !== TYPEOF.OBJECT) {
      return false;
    }
    if (
      operation.workflow_step === WORKFLOW_STEP.PENDING ||
      operation.workflow_step === WORKFLOW_STEP.SENDING
    ) {
      return true;
    }
    return (
      operation.type === OperationType.REPLACE &&
      operation.workflow_step === WORKFLOW_STEP.ACTIVE
    );
  }

  /**
   * Read dispatch-retry replica_operations for one target node.
   * Uses SystemTableCache first, then falls back to the authoritative
   * repository owner path when unresolved priority recovery indicates cache
   * visibility may be lagging.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Array<Object>>} Dispatchable operation rows.
   * @private
   */
  async getDispatchRetryRowsForNode(nodeId) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      membershipPublicationService &&
      typeof membershipPublicationService.getDispatchRetryRowsForNode ===
        TYPEOF.FUNCTION
    ) {
      try {
        const dispatchRows =
          await membershipPublicationService.getDispatchRetryRowsForNode(
            nodeId,
          );
        return Array.isArray(dispatchRows) ? dispatchRows : [];
      } catch (error) {
        this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED, {
          nodeId,
          error: error?.message || String(error),
          path: REPLICA_DISPATCH_SERVICE_LITERAL.MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY,
        });
      }
    }

    const cacheRows =
      this.replicaOperationsOwner &&
      typeof this.replicaOperationsOwner.listReplicaOperationsFromCache ===
        TYPEOF.FUNCTION
        ? (await this.replicaOperationsOwner.listReplicaOperationsFromCache())
            .rows || []
        : this.getSystemTableRowsFromCache(
            SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          );
    const dispatchRows = cacheRows.filter((row) => {
      return (
        isCoordinatorOwnedOperationType(row?.type) &&
        this.isReplicaOperationLocallyOwned(row) &&
        this.resolveDispatchReplayNodeId(row) === nodeId &&
        this.isDispatchReplayableOperationRow(row)
      );
    });
    if (dispatchRows.length > NUM.ZERO) {
      return dispatchRows;
    }

    if (
      !(await this.shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId))
    ) {
      return dispatchRows;
    }

    return this.getAuthoritativeDispatchRetryRowsForNode(nodeId);
  }

  /**
   * Compatibility alias for older tests/callers. Ready-node retry now
   * re-enters both PENDING and SENDING rows, but the historical method name
   * is kept to avoid a second compatibility seam.
   *
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   */
  async getPendingReplicaOpsForNode(nodeId) {
    return this.getDispatchRetryRowsForNode(nodeId);
  }

  /**
   * Decide whether ready-node retry should bypass cache-only rediscovery for
   * unresolved priority control-plane recovery.
   * @param {string} nodeId
   * @return {Promise<boolean>}
   * @private
   */
  async shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId) {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return false;
    }

    try {
      return shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId, {
        cacheVisible: false,
        publicationConvergence:
          await this.resolvePriorityRecoveryPublicationConvergence(
            readinessService,
            nodeId,
          ),
      });
    } catch (error) {
      this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_REFRESH_FAILED, {
        nodeId,
        error: error?.message || String(error),
      });
      return false;
    }
  }

  /**
   * Resolve one publication-convergence snapshot for priority-recovery
   * rediscovery.
   * @param {Object} readinessService
   * @param {string} nodeId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolvePriorityRecoveryPublicationConvergence(
    readinessService,
    nodeId,
  ) {
    if (
      typeof readinessService.getMembershipPublicationDiagnosticsSync ===
      TYPEOF.FUNCTION
    ) {
      const syncDiagnostics =
        readinessService.getMembershipPublicationDiagnosticsSync(
          nodeId,
          Date.now(),
        );
      if (syncDiagnostics) {
        return syncDiagnostics;
      }
    }
    if (
      typeof readinessService.getMembershipPublicationDiagnostics ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getMembershipPublicationDiagnostics(
        nodeId,
        Date.now(),
      );
    }
    return null;
  }

  /**
   * Read dispatch-retry operations through the canonical repository owner path
   * when cache coverage is missing under priority recovery.
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeDispatchRetryRowsForNode(nodeId) {
    const repository = this.rebalanceCoordinator?.repository || null;
    if (
      !repository ||
      typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION
    ) {
      return [];
    }

    try {
      const operations = await repository.queryIncompleteOperations({
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      if (!Array.isArray(operations) || operations.length === NUM.ZERO) {
        return [];
      }

      return operations
        .filter((operation) => {
          return (
            isCoordinatorOwnedOperationType(operation?.type) &&
            this.isReplicaOperationLocallyOwned(operation) &&
            this.resolveDispatchReplayNodeId({
              type: operation?.type,
              source_node_id: operation?.sourceNodeId,
              target_node_id: operation?.targetNodeId,
              workflow_step: operation?.workflowStep,
            }) === nodeId &&
            this.isDispatchReplayableOperationRow({
              type: operation?.type,
              workflow_step: operation?.workflowStep,
            })
          );
        })
        .map((operation) => this.buildOperationRowFromCoordinator(operation));
    } catch (error) {
      this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED, {
        nodeId,
        error: error?.message || String(error),
        path: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE_PRIORITY_RECOVERY_RETRY,
      });
      return [];
    }
  }

  /**
   * Check whether one replica operation row is owned by this node.
   * Ready-node retries must only re-enter operations through the canonical
   * owner, even though replica_operations rows are globally replicated.
   * @param {Object} operation - Replica operation row or object.
   * @return {boolean}
   * @private
   */
  isReplicaOperationLocallyOwned(operation) {
    if (!operation || typeof operation !== TYPEOF.OBJECT) {
      return false;
    }
    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.isOperationLocallyOwned ===
        TYPEOF.FUNCTION
    ) {
      return this.rebalanceCoordinator.isOperationLocallyOwned(operation);
    }
    if (
      this.rebalanceCoordinator &&
      typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId ===
        TYPEOF.FUNCTION
    ) {
      return (
        this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation) ===
        this.nodeId
      );
    }
    return (
      String(
        operation?.sourceNodeId ||
          operation?.source_node_id ||
          REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
      ) === this.nodeId
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
    if (!nodeId || !this.isNodeReady(nodeId)) {
      this.clearNodeReadyRetryWatermark(nodeId);
      return false;
    }

    const nodeRow =
      options.nodeRow && typeof options.nodeRow === TYPEOF.OBJECT
        ? options.nodeRow
        : await this.getNodeRow(nodeId);
    if (
      nodeRow &&
      !wasNodeRecordReadyWhenWritten(nodeRow, {
        requireActiveStatus: true,
      })
    ) {
      return false;
    }

    if (!this.shouldRetryNodeReadyWatermark(nodeId, nodeRow)) {
      this.logger.debug(DISPATCH_LOG_MSG.RETRY_READY_TRIGGER_SKIPPED, {
        nodeId,
        source: options.source || null,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.DUPLICATE_READY_TRIGGER,
      });
      return false;
    }

    await this.retryPendingDispatchesForNode(nodeId);
    return true;
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

    let row = context?.row || null;

    if (!row) {
      row = await this.getReplicaOperationRow(operationId);
    }

    if (!row || !row.operation_id) {
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }
    if (!isCoordinatorOwnedOperationType(row.type)) {
      this.clearDeferredOperationDispatchRetry(operationId);
      return;
    }

    try {
      if (
        row.type === OperationType.REPLACE &&
        row.workflow_step === WORKFLOW_STEP.ACTIVE
      ) {
        this.clearDeferredOperationDispatchRetry(operationId);
        const operation = this.buildOperationFromRow(row);
        if (
          typeof this.rebalanceCoordinator.dispatchOperation === TYPEOF.FUNCTION
        ) {
          await this.rebalanceCoordinator.dispatchOperation(operation);
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

      await this.dispatchOperationRow(row);
    } catch (error) {
      if (this.deferOperationDispatchRetry(operationId, error, row)) {
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
    });
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
        { nodeRow: record },
      );
      return;
    }

    if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      if (operation === REPLICA_DISPATCH_SERVICE_LITERAL.DELETE) {
        return;
      }
      this.enqueueReplicaOperationRow(record, {
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

  /**
   * Enqueue a locally owned replica operation row for dispatch reconciliation.
   * Cache and CDC visibility can arrive on different nodes or at different
   * times, so both paths must converge on the same local-owner gate. SENDING
   * rows remain replayable because retryable dispatch failures deliberately
   * park persisted workflow state in SENDING until the owner re-arms it.
   * @param {Object} row - Replica operation row.
   * @param {Object} reasons - Reconcile reason overrides.
   * @param {string} reasons.pendingReason - Reason for pending rows.
   * @param {string} reasons.replaceActiveReason - Reason for active REPLACE rows.
   * @return {boolean} True when a reconcile item was enqueued.
   * @private
   */
}

export { ReplicaDispatchServiceSegment2 };
