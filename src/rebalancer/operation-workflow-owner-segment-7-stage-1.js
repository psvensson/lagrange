import {OperationWorkflowOwnerSegment6} from './operation-workflow-owner-segment-6.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-7-stage-shared.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  NUM,
  OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES,
  OBSERVED_OPERATION_ROW_TARGET_PROGRESS_TYPES,
  OBSERVED_OPERATION_ROW_TARGET_PROGRESS_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION,
  OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION_BY_STATE,
  OBSERVED_PROGRESS_OPERATION_ROUTE_STATE,
  OBSERVED_PROGRESS_OPERATION_ROUTE_STATE_TABLE,
  OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_REPLACE_SOURCE_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_TABLE_STATE,
  OBSERVED_PROGRESS_TABLE_STATE_BY_NAME,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  RECONCILED_REPLICA_STATUS_OBSERVED_TARGET_UNAVAILABLE,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  STOPPING_REPLICA_OBSERVATION_STATE,
  TRANSITION_RETRY_DELAY_MS,
  TYPEOF,
  WORKFLOW_STEP,
} = SHARED;

class OperationWorkflowOwnerSegment7Stage1 extends OperationWorkflowOwnerSegment6 {
  getObservedProgressTableState(tableName) {
    return (
      OBSERVED_PROGRESS_TABLE_STATE_BY_NAME.get(tableName) ||
      OBSERVED_PROGRESS_TABLE_STATE.IGNORED
    );
  }

  isObservedProgressOperationCandidate(operation) {
    if (
      !this.isObservedProgressOperationShapeCandidate(operation) ||
      !this.repository.isOperationLocallyOwned(operation)
    ) {
      return false;
    }

    return true;
  }

  isObservedProgressOperationShapeCandidate(operation) {
    if (!operation || this.repository.isOperationTerminal(operation)) {
      return false;
    }

    if (OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS.has(operation.workflowStep)) {
      return true;
    }

    return (
      operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE
    );
  }

  isObservedOperationRowTargetProgressCandidate(operation) {
    if (
      !this.isObservedOperationRowTargetProgressShapeCandidate(operation) ||
      !this.repository.isOperationLocallyOwned(operation)
    ) {
      return false;
    }

    return true;
  }

  isObservedOperationRowTargetProgressShapeCandidate(operation) {
    if (!operation || this.repository.isOperationTerminal(operation)) {
      return false;
    }

    return (
      OBSERVED_OPERATION_ROW_TARGET_PROGRESS_TYPES.has(operation.type) &&
      OBSERVED_OPERATION_ROW_TARGET_PROGRESS_WORKFLOW_STEPS.has(
        operation.workflowStep,
      )
    );
  }

  hasObservedOperationRowTargetProgress(operation) {
    if (
      !operation ||
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }

    const observedTargetStatus =
      this.repository.getObservedReplicaStatusFromCache(
        operation.replicaId,
        operation.partitionId,
        operation.targetNodeId,
        EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      );
    return OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES.has(
      observedTargetStatus,
    );
  }

  getObservedOperationRowTargetProgressStatus(operation) {
    if (
      !operation ||
      !this.repository ||
      typeof this.repository.getObservedReplicaStatusFromCache !==
        TYPEOF.FUNCTION
    ) {
      return RECONCILED_REPLICA_STATUS_OBSERVED_TARGET_UNAVAILABLE;
    }

    return this.repository.getObservedReplicaStatusFromCache(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
      EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
    );
  }

  findObservedOperationRowProgressOperationIds(
    operationRow,
    cacheOperation,
  ) {
    if (
      !operationRow ||
      typeof operationRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ||
      cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE ||
      !this.repository ||
      typeof this.repository.rowToOperation !== TYPEOF.FUNCTION
    ) {
      return [];
    }

    const operation = this.repository.rowToOperation(operationRow);
    if (
      !this.isObservedOperationRowTargetProgressShapeCandidate(operation) ||
      !this.hasObservedOperationRowTargetProgress(operation)
    ) {
      return [];
    }

    const operationId =
      operation.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return [];
    }
    return [operationId];
  }

  resolveObservedProgressOperationIds(
    tableState,
    record,
    cacheOperation,
  ) {
    switch (tableState) {
    case OBSERVED_PROGRESS_TABLE_STATE.SERVICE_REPLICA_STATE:
      return this.findObservedProgressOperationIds(
        record,
        cacheOperation,
      );
    case OBSERVED_PROGRESS_TABLE_STATE.OPERATION_WORKFLOW_STATE:
      return this.findObservedOperationRowProgressOperationIds(
        record,
        cacheOperation,
      );
    case OBSERVED_PROGRESS_TABLE_STATE.IGNORED:
    default:
      return [];
    }
  }

  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    if (
      !serviceRow ||
      typeof serviceRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      return [];
    }

    if (cacheOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.DELETE) {
      const status = String(serviceRow.status || '').toLowerCase();
      if (!OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES.has(status)) {
        return [];
      }
    }

    const targetNodeId = String(serviceRow.node_id || serviceRow.nodeId || '');
    const replicaId = String(
      serviceRow.service_id ||
        serviceRow.serviceId ||
        serviceRow.replica_id ||
        serviceRow.replicaId ||
        '',
    );
    const partitionId = String(
      serviceRow.partition_id || serviceRow.partitionId || '',
    );
    if (
      targetNodeId.length === NUM.ZERO ||
      (replicaId.length === NUM.ZERO && partitionId.length === NUM.ZERO)
    ) {
      return [];
    }

    const matchingRows =
      this.repository.filterReplicaOperationRowsFromCache((row) => {
        const operation = this.repository.rowToOperation(row);
        if (!this.isObservedProgressOperationShapeCandidate(operation)) {
          return false;
        }
        if (
          this.isObservedProgressReplaceSourceMatch(
            operation,
            targetNodeId,
            replicaId,
            partitionId,
          )
        ) {
          return true;
        }
        if (operation.targetNodeId !== targetNodeId) {
          return false;
        }
        if (replicaId.length > NUM.ZERO && operation.replicaId === replicaId) {
          return true;
        }
        return (
          partitionId.length > NUM.ZERO && operation.partitionId === partitionId
        );
      }) || [];

    return [
      ...new Set(
        matchingRows
          .map((row) => row?.operation_id || row?.operationId || null)
          .filter(
            (opId) =>
              typeof opId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
              opId.length > NUM.ZERO,
          ),
      ),
    ];
  }

  isObservedProgressReplaceSourceMatch(
    operation,
    targetNodeId,
    replicaId,
    partitionId,
  ) {
    if (
      operation?.type !== OperationType.REPLACE ||
      !OBSERVED_PROGRESS_REPLACE_SOURCE_WORKFLOW_STEPS.has(
        operation.workflowStep,
      ) ||
      operation.sourceNodeId !== targetNodeId
    ) {
      return false;
    }

    const sourceReplicaId =
      this.repository.getReplaceSourceReplicaId(operation);
    if (replicaId.length > NUM.ZERO) {
      return sourceReplicaId === replicaId;
    }
    return (
      partitionId.length > NUM.ZERO && operation.partitionId === partitionId
    );
  }

  buildObservedProgressOperationRouteEvidence(operation) {
    const ownerNodeId =
      this.repository.resolveOperationOwnerNodeId(operation) || null;
    return Object.freeze({
      shapeCandidate:
        this.isObservedProgressOperationShapeCandidate(operation),
      locallyOwned:
        this.repository.isOperationLocallyOwned(operation),
      remoteOwnerAvailable:
        typeof ownerNodeId === TYPEOF.STRING &&
        ownerNodeId.length > NUM.ZERO &&
        ownerNodeId !== this.nodeId,
      ownerNodeId,
    });
  }

  resolveObservedProgressOperationRouteAction(evidence) {
    const state =
      OBSERVED_PROGRESS_OPERATION_ROUTE_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      OBSERVED_PROGRESS_OPERATION_ROUTE_STATE.UNAVAILABLE;
    return (
      OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION_BY_STATE.get(state) ||
      OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION.SKIP
    );
  }

  async reconcileObservedProgressOperation(operationId) {
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return false;
    }
    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    const operation = visibilityObservation?.operation || null;
    const routeEvidence =
      this.buildObservedProgressOperationRouteEvidence(operation);
    const routeAction =
      this.resolveObservedProgressOperationRouteAction(routeEvidence);
    if (routeAction === OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION.SKIP) {
      this.clearObservedProgressRetry(operationId);
      return false;
    }
    if (
      routeAction ===
      OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION.WAKE_REMOTE_OWNER
    ) {
      const woken = await this.wakeCoordinatorCreatedRemoteOwner(operation);
      this.clearObservedProgressRetry(operationId);
      return woken;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: 'observed_progress',
    });
    this.clearObservedProgressRetry(operationId);
    return progressed;
  }

  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    const tableState = this.getObservedProgressTableState(tableName);
    if (
      this.isShuttingDown ||
      !this.isInitialized ||
      tableState === OBSERVED_PROGRESS_TABLE_STATE.IGNORED
    ) {
      return;
    }

    const operationIds = this.resolveObservedProgressOperationIds(
      tableState,
      record,
      cacheOperation,
    );
    for (const operationId of operationIds) {
      if (this.isOperationOwnerLaneHeld(operationId)) {
        this.scheduleObservedProgressRetry(
          operationId,
          tableName,
          cacheOperation,
        );
        continue;
      }
      this.operationWorkflowRunExclusive(
        this.getOperationOwnerSingleFlightKey(operationId),
        () => this.reconcileObservedProgressOperation(operationId),
      ).catch((error) => {
        this.handleObservedProgressFailure(
          operationId,
          tableName,
          cacheOperation,
          error,
        );
      });
    }
  }

  async observeStoppingReplicaProgress(replicaId, partitionId, targetNodeId) {
    if (
      this.repository &&
      typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION
    ) {
      const observation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
        {
          allowPartitionNodeFallback: false,
        },
      );
      const observationState =
        observation?.state || STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE;
      return Object.freeze({
        state: observationState,
        lifecycleStatus:
          observationState === STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED ?
            observation.lifecycleStatus :
            null,
      });
    }
    const actualStatus = await this.getActualReplicaStatus(
      replicaId,
      partitionId,
      targetNodeId,
    );
    return Object.freeze({
      state:
        actualStatus === null ?
          STOPPING_REPLICA_OBSERVATION_STATE.ABSENT :
          STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
      lifecycleStatus: actualStatus,
    });
  }

  buildStoppingObservationRetryableError(operation) {
    const error = new Error(
      OPERATION_WORKFLOW_OWNER_LITERAL
        .STOPPING_SOURCE_REMOVAL_OBSERVATION_DEFERRED,
    );
    error.code =
      OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
    error.errorCode =
      OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
    error.retryAfterMs = TRANSITION_RETRY_DELAY_MS;
    error.deferRetry = true;
    error.partitionId = operation?.partitionId || null;
    return error;
  }

  deferStoppingObservationRetry(operation) {
    if (
      !operation?.operationId ||
      !this.isCriticalSystemPartition(operation.partitionId)
    ) {
      return false;
    }
    return this.deferTransitionRetry(
      operation.operationId,
      this.buildStoppingObservationRetryableError(operation),
      {
        boundary: OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING,
        workflowStep: operation.workflowStep || null,
        partitionId: operation.partitionId || null,
        updatedAt: operation.updatedAt,
        createdAt: operation.createdAt,
        operationSnapshot: operation,
      },
    );
  }

  async reconcileStoppingOperationProgress(operation) {
    const removingReplicaId =
      operation.type === OperationType.REPLACE ?
        this.repository.getReplaceSourceReplicaId(operation) :
        operation.replicaId;
    const removingNodeId =
      operation.type === OperationType.REPLACE ?
        operation.sourceNodeId :
        operation.targetNodeId;
    if (!removingReplicaId) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_MISSING_DURING_STOPPING_RECONCILIATION,
      );
      return true;
    }

    const stoppingReplicaObservation = await this.observeStoppingReplicaProgress(
      removingReplicaId,
      operation.partitionId,
      removingNodeId,
    );
    const actualStatus = stoppingReplicaObservation.lifecycleStatus;

    if (
      stoppingReplicaObservation.state ===
        STOPPING_REPLICA_OBSERVATION_STATE.ABSENT ||
      (operation.type === OperationType.REPLACE &&
        actualStatus === ReplicaStatus.FAILED)
    ) {
      await this.completeOperation(operation);
      return true;
    }

    if (
      stoppingReplicaObservation.state ===
      STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE
    ) {
      return this.deferStoppingObservationRetry(operation);
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_REMOVE_RECONCILIATION,
      );
      return true;
    }

    const replayResult =
      await this.executeOperationFromReconcilePath(operation);
    if (
      replayResult?.success === true &&
      replayResult.status !== ReplicaOperationResponseStatus.IN_PROGRESS
    ) {
      return true;
    }

    return false;
  }

  async reconcileActiveReplaceSourceRemovalProgress(operation) {
    if (
      operation?.type !== OperationType.REPLACE ||
      operation?.workflowStep !== WORKFLOW_STEP.ACTIVE
    ) {
      return false;
    }

    const removingReplicaId =
      this.repository.getReplaceSourceReplicaId(operation);
    if (!removingReplicaId) {
      return false;
    }

    const stoppingReplicaObservation = await this.observeStoppingReplicaProgress(
      removingReplicaId,
      operation.partitionId,
      operation.sourceNodeId,
    );
    const actualStatus = stoppingReplicaObservation.lifecycleStatus;

    if (this.isActiveReplaceSourceRetirementObserved(
      operation,
      removingReplicaId,
      stoppingReplicaObservation,
    )) {
      await this.completeOperation(operation);
      return true;
    }

    if (actualStatus === ReplicaStatus.REMOVING) {
      await this.updateStep(operation, WORKFLOW_STEP.STOPPING);
      return true;
    }

    return false;
  }
}

export {OperationWorkflowOwnerSegment7Stage1};
