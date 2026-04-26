import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerSegment6} from './operation-workflow-owner-segment-6.js';

const {
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_TRANSITION_REASON,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  SQL_RECONCILIATION_REASON,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TRANSITION_RETRY_DELAY_MS,
  TYPEOF,
  WORKFLOW_STEP,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  isPriorityControlPlanePartition,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const STOPPING_REPLICA_OBSERVATION_STATE = Object.freeze({
  OBSERVED: 'observed',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
});

const OBSERVED_PROGRESS_REPLACE_SOURCE_WORKFLOW_STEPS = Object.freeze(
  new Set([WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.STOPPING]),
);

const OBSERVED_PROGRESS_TABLE_STATE = Object.freeze({
  SERVICE_REPLICA_STATE: 'service_replica_state',
  OPERATION_WORKFLOW_STATE: 'operation_workflow_state',
  IGNORED: 'ignored',
});

const OBSERVED_PROGRESS_TABLE_STATE_BY_NAME = Object.freeze(
  new Map([
    [
      SYSTEM_TABLE_NAME.SERVICES,
      OBSERVED_PROGRESS_TABLE_STATE.SERVICE_REPLICA_STATE,
    ],
    [
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      OBSERVED_PROGRESS_TABLE_STATE.OPERATION_WORKFLOW_STATE,
    ],
  ]),
);

const OBSERVED_OPERATION_ROW_TARGET_PROGRESS_TYPES = Object.freeze(
  new Set([OperationType.ADD, OperationType.REPLACE]),
);

const OBSERVED_OPERATION_ROW_TARGET_PROGRESS_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
  ]),
);

const OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.FAILED,
  ]),
);

const TARGET_PENDING_CREATE_ADMISSION_WORKFLOW_STEPS = Object.freeze(
  new Set([WORKFLOW_STEP.SENDING]),
);

const TARGET_CREATING_CREATE_ADMISSION_WORKFLOW_STEPS = Object.freeze(
  new Set([WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING]),
);

const TARGET_CREATE_ADMISSION_WORKFLOW_STEPS_BY_STATUS = Object.freeze(
  new Map([
    [
      ReplicaStatus.PENDING,
      TARGET_PENDING_CREATE_ADMISSION_WORKFLOW_STEPS,
    ],
    [
      ReplicaStatus.CREATING,
      TARGET_CREATING_CREATE_ADMISSION_WORKFLOW_STEPS,
    ],
  ]),
);

const ACTIVE_REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.REMOVING,
  ]),
);

const EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS = Object.freeze(
  new Set([WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]),
);

const PRIORITY_RECOVERY_OPERATION_DRAIN_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  EVIDENCE_UNAVAILABLE: 'evidence_unavailable',
  CONVERGED: 'converged',
  IN_FLIGHT: 'in_flight',
});

const PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.STOPPING,
  ]),
);

const PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES = Object.freeze(
  new Set([PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED]),
);

const PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.CONVERGED,
      OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
      OPERATION_LIFECYCLE_ACTION.NOOP,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE,
      OPERATION_LIFECYCLE_ACTION.NOOP,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT,
      OPERATION_LIFECYCLE_ACTION.NOOP,
    ],
  ]),
);

const PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE =
  'completion_unavailable';

const PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE = Object.freeze({
  NOT_REQUIRED: 'not_required',
  EVIDENCE_UNAVAILABLE: 'evidence_unavailable',
  REMOVAL_CONFIRMED: 'removal_confirmed',
  REMOVAL_IN_FLIGHT: 'removal_in_flight',
  REMOVAL_REQUIRED: 'removal_required',
});

const PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY = Object.freeze({
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
  REMOVED: 'removed',
  FAILED: 'failed',
  REMOVING: 'removing',
  PRESENT: 'present',
});

const PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY_BY_STATUS =
  Object.freeze(
    new Map([
      [
        ReplicaStatus.REMOVED,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.REMOVED,
      ],
      [
        ReplicaStatus.FAILED,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.FAILED,
      ],
      [
        ReplicaStatus.REMOVING,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.REMOVING,
      ],
    ]),
  );

const PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE_BY_OBSERVATION_KEY =
  Object.freeze(
    new Map([
      [
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.ABSENT,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_CONFIRMED,
      ],
      [
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.REMOVED,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_CONFIRMED,
      ],
      [
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.FAILED,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_CONFIRMED,
      ],
      [
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.REMOVING,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_IN_FLIGHT,
      ],
      [
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.PRESENT,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_REQUIRED,
      ],
      [
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.UNAVAILABLE,
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE,
      ],
    ]),
  );

const PRIORITY_RECOVERY_OPERATION_DRAIN_STATE_BY_SOURCE_STATE = Object.freeze(
  new Map([
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED,
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.CONVERGED,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_CONFIRMED,
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.CONVERGED,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_IN_FLIGHT,
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_REQUIRED,
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE,
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE,
    ],
  ]),
);

const PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE = Object.freeze({
  LOCAL_OWNER: 'local_owner',
  REMOTE_SETTLE_ALLOWED: 'remote_settle_allowed',
  REMOTE_OWNER_REQUIRED: 'remote_owner_required',
});

const PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION = Object.freeze({
  ALLOW_RECONCILE: 'allow_reconcile',
  SKIP_REMOTE_OWNER: 'skip_remote_owner',
});

const PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_OWNER,
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_SETTLE_ALLOWED,
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_OWNER_REQUIRED,
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.SKIP_REMOTE_OWNER,
    ],
  ]),
);

class OperationWorkflowOwnerSegment7 extends OperationWorkflowOwnerSegment6 {
  /**
   * @param {string} tableName
   * @return {string}
   * @private
   */
  getObservedProgressTableState(tableName) {
    return (
      OBSERVED_PROGRESS_TABLE_STATE_BY_NAME.get(tableName) ||
      OBSERVED_PROGRESS_TABLE_STATE.IGNORED
    );
  }

  isObservedProgressOperationCandidate(operation) {
    if (
      !operation ||
      this.repository.isOperationTerminal(operation) ||
      !this.repository.isOperationLocallyOwned(operation)
    ) {
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

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isObservedOperationRowTargetProgressCandidate(operation) {
    if (
      !operation ||
      this.repository.isOperationTerminal(operation) ||
      !this.repository.isOperationLocallyOwned(operation)
    ) {
      return false;
    }

    return (
      OBSERVED_OPERATION_ROW_TARGET_PROGRESS_TYPES.has(operation.type) &&
      OBSERVED_OPERATION_ROW_TARGET_PROGRESS_WORKFLOW_STEPS.has(
        operation.workflowStep,
      )
    );
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
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
      );
    return OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES.has(
      observedTargetStatus,
    );
  }

  /**
   * @param {Object} operationRow
   * @param {string} cacheOperation
   * @return {string[]}
   */
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
      !this.isObservedOperationRowTargetProgressCandidate(operation) ||
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

  /**
   * @param {string} tableState
   * @param {Object} record
   * @param {string} cacheOperation
   * @return {string[]}
   * @private
   */
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

  /**
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   */
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
        if (!this.isObservedProgressOperationCandidate(operation)) {
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

  /**
   * @param {Object} operation
   * @param {string} targetNodeId
   * @param {string} replicaId
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
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

  /**
   * @param {string} operationId
   * @return {Promise<boolean>}
   */
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
    if (!this.isObservedProgressOperationCandidate(operation)) {
      this.clearObservedProgressRetry(operationId);
      return false;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: 'observed_progress',
    });
    this.clearObservedProgressRetry(operationId);
    return progressed;
  }

  /**
   * Observe cache progress and re-enter the owner lane.
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   */
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

  // --- Reconciliation and timeout ---

  /**
   * Observe one source-removal replica state without collapsing authoritative
   * absence and authoritative visibility loss into the same outcome.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<Object>}
   * @private
   */
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

  /**
   * @param {Object} operation
   * @return {Error}
   * @private
   */
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

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
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

  /**
   * Reconcile STOPPING remove/replace progression against source replica
   * removal state.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
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

  /**
   * Reconcile REPLACE source-removal evidence even if the durable row has not
   * yet advanced from ACTIVE to STOPPING.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
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

  /**
   * @param {Object} operation
   * @param {string} sourceReplicaId
   * @param {Object} sourceObservation
   * @return {boolean}
   * @private
   */
  isActiveReplaceSourceRetirementObserved(
    operation,
    sourceReplicaId,
    sourceObservation,
  ) {
    if (sourceObservation?.lifecycleStatus === ReplicaStatus.FAILED) {
      return true;
    }
    if (
      sourceObservation?.state !== STOPPING_REPLICA_OBSERVATION_STATE.ABSENT
    ) {
      return false;
    }
    return !this.isActiveReplaceSourceReplicaVisibleInCache(
      operation,
      sourceReplicaId,
    );
  }

  /**
   * @param {Object} operation
   * @param {string} sourceReplicaId
   * @return {boolean}
   * @private
   */
  isActiveReplaceSourceReplicaVisibleInCache(operation, sourceReplicaId) {
    if (
      !this.repository ||
      typeof this.repository.getObservedReplicaRowFromCache !== TYPEOF.FUNCTION
    ) {
      return false;
    }
    const sourceReplicaRow = this.repository.getObservedReplicaRowFromCache(
      sourceReplicaId,
      operation.partitionId,
      operation.sourceNodeId,
      {
        allowPartitionNodeFallback: false,
      },
    );
    if (!sourceReplicaRow) {
      return false;
    }
    const sourceReplicaStatus =
      typeof this.repository.normalizeObservedReplicaLifecycle ===
        TYPEOF.FUNCTION ?
        this.repository.normalizeObservedReplicaLifecycle(sourceReplicaRow) :
        sourceReplicaRow.status;
    return ACTIVE_REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES.has(
      sourceReplicaStatus,
    );
  }

  /**
   * A visible target services row in PENDING or CREATING means create
   * admission has already crossed the target boundary, even if the dispatch
   * response or operation-row transition was lost under pressure.
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @return {boolean}
   * @private
   */
  isTargetCreateAdmissionProgress(operation, actualStatus) {
    const workflowSteps =
      TARGET_CREATE_ADMISSION_WORKFLOW_STEPS_BY_STATUS.get(actualStatus);
    return Boolean(workflowSteps?.has(operation?.workflowStep));
  }

  /**
   * Apply one reconciled target-replica status to the canonical operation
   * owner path.
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async applyReconciledReplicaStatus(operation, actualStatus, options = {}) {
    const cause = options.cause || 'progress';

    if (this.isTargetCreateAdmissionProgress(operation, actualStatus)) {
      await this.updateStep(operation, WORKFLOW_STEP.CREATING);
      return true;
    }

    if (
      this.shouldRearmDispatchFromProgressReconcile(operation, actualStatus)
    ) {
      await this.executeOperationFromReconcilePath(operation);
      return true;
    }

    if (
      actualStatus === ReplicaStatus.SYNCING &&
      (operation.workflowStep === WORKFLOW_STEP.PENDING ||
        operation.workflowStep === WORKFLOW_STEP.SENDING ||
        operation.workflowStep === WORKFLOW_STEP.CREATING)
    ) {
      await this.updateStep(operation, WORKFLOW_STEP.SYNCING);
      return true;
    }

    if (actualStatus === ReplicaStatus.ACTIVE) {
      if (operation.type === OperationType.REPLACE) {
        await this.reconcileReplaceActualActive(operation);
      } else {
        await this.completeOperation(operation);
      }
      return true;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
          operation.workflowStep === WORKFLOW_STEP.SYNCING ?
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_SYNC :
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION,
      );
      return true;
    }

    if (
      actualStatus === null &&
      cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY &&
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION,
      );
      return true;
    }

    return false;
  }

  /**
   * Reconcile one in-flight operation through the canonical owner path.
   * Different wakeup causes share one progression implementation after the
   * owner queue is entered.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationLifecycle(operation, options = {}) {
    if (!operation) {
      return false;
    }
    const priorityRecoveryDrainSnapshot =
      await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
    if (
      await this.reconcilePriorityRecoveryOperationDrain(
        operation,
        priorityRecoveryDrainSnapshot,
      )
    ) {
      return true;
    }
    if (
      !this.shouldEnterOperationLifecycleFromDrainSnapshot(
        priorityRecoveryDrainSnapshot,
      )
    ) {
      return false;
    }

    const cause = options.cause || 'progress';
    const lifecycleAction = this.resolveOperationLifecycleAction(
      operation,
      cause,
    );
    switch (lifecycleAction) {
    case OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY:
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_OPERATION,
      );
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
        operationId: operation.operationId,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId,
      });
      return true;
    case OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY:
      await this.failOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION,
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED,
        {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          partitionId: operation.partitionId,
        },
      );
      return true;
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE:
      if (await this.reconcileActiveReplaceSourceRemovalProgress(operation)) {
        return true;
      }
      await this.executeOperationFromReconcilePath(operation);
      return true;
    case OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH:
      await this.executeOperationFromReconcilePath(operation);
      return true;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING:
      return this.reconcileStoppingOperationProgress(operation);
    case OPERATION_LIFECYCLE_ACTION.NOOP:
      return false;
    case OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS:
    default:
      break;
    }

    const actualStatus = await this.getReconciledReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      this.repository.emitReplicaStatusDivergence(
        operation.replicaId,
        actualStatus,
        SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
      );
    }
    return this.applyReconciledReplicaStatus(operation, actualStatus, {
      cause,
    });
  }

  /**
   * Reconcile one in-flight operation against observed replica state.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   */
  async reconcileOperationProgress(operation, options = {}) {
    return this.reconcileOperationLifecycle(operation, options);
  }

  /**
   * @param {string} step
   * @return {number}
   */
  getTimeoutForStep(step, operation = null) {
    switch (step) {
    case WORKFLOW_STEP.PENDING:
    case WORKFLOW_STEP.SENDING:
      return this.config.pendingTimeoutMs;
    case WORKFLOW_STEP.CREATING:
      return this.config.creatingTimeoutMs;
    case WORKFLOW_STEP.SYNCING: {
      const configuredTimeout = this.config.syncingTimeoutMs;
      const partitionId = operation?.partitionId || null;
      if (!isPriorityControlPlanePartition({partitionId})) {
        return configuredTimeout;
      }
      return Math.max(
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        Math.min(
          configuredTimeout,
          PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
        ),
      );
    }
    case WORKFLOW_STEP.STOPPING:
      return this.config.removingTimeoutMs;
    default:
      return this.config.pendingTimeoutMs;
    }
  }

  /**
   * Per-operation timeout/progress reconciliation.
   * Called after reconcileOperationProgress returns false.
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    if (
      this.hasActiveTransitionRetryGrace(operation?.operationId || null, now)
    ) {
      if (await this.reconcilePriorityRecoveryOperationDrain(operation)) {
        return;
      }
      return;
    }
    const progressed = await this.reconcileOperationProgress(operation, {
      cause: 'timeout',
    });
    if (progressed) {
      return;
    }

    const operationBudget = createTopLevelOperationBudget({
      configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      operationName: 'rebalance',
      startedAtMs: operation.createdAt || operation.updatedAt,
      now: () => now,
    });

    const stepTimeout = this.getTimeoutForStep(
      operation.workflowStep,
      operation,
    );
    const stepAllocation = createChildTimeoutBudget(operationBudget, {
      requestedBudgetMs: stepTimeout,
      minimumBudgetMs: TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
      nestedOperation: `rebalance:${String(
        operation.workflowStep || 'unknown',
      ).toLowerCase()}`,
      now: () => now,
    });

    const elapsed = now - operation.updatedAt;
    const stepExceeded = elapsed >= stepTimeout;
    const budgetExhausted = !stepAllocation.allowed;

    if (stepExceeded || budgetExhausted) {
      const timeoutClassification = budgetExhausted ?
        stepAllocation.timeoutClassification :
        buildTimeoutClassification({
          budget: operationBudget,
          classification:
              TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
          nestedOperation: `rebalance:${String(
            operation.workflowStep || 'unknown',
          ).toLowerCase()}`,
          now: () => now,
        });

      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT, {
        operationId: operation.operationId,
        workflowStep: operation.workflowStep,
        elapsed,
        timeout: stepTimeout,
        budgetExhausted,
        timeoutClassification,
      });

      await this.failOperation(
        operation,
        `Timeout in ${operation.workflowStep} step ` + `after ${elapsed}ms`,
        {
          stepMetadata: {
            timeoutClassification,
            timeoutMs: stepTimeout,
            elapsedMs: elapsed,
            timedOutAtMs: now,
            budgetExhausted,
          },
        },
      );

      this.stats.operationsTimedOut++;
    }
  }

  /**
   * Check for timed out operations.
   * @return {Promise<void>}
   */
  async checkTimeouts() {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const now = Date.now();
    if (
      this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO &&
      now - this.lastEmptyIncompleteOperationQueryAtMs <
        this.incompleteOperationQueryEmptyBackoffMs
    ) {
      return;
    }

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryCachedIncompleteOperations() :
      [];
    if (cachedIncompleteOps.length > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
    } else if (
      canUseCacheObservationBoundary &&
      this.shouldDelayEmptyIncompleteOperationQuery(now)
    ) {
      return;
    }

    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY
    ) {
      this.lastEmptyIncompleteOperationQueryAtMs = now;
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();
    if (
      incompleteOperationObservation.state ===
      INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return;
    }

    const timeoutReconcileTasks = [];

    for (const operation of incompleteOps) {
      if (this.repository.isOperationTerminal(operation)) {
        continue;
      }
      const operationDrainSnapshot =
        await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
      if (
        !this.shouldEnterOperationLifecycleFromDrainSnapshot(
          operationDrainSnapshot,
        )
      ) {
        continue;
      }

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        operation.operationId,
      );

      const reconcileTask = this.operationWorkflowRunExclusive(
        singleFlightKey,
        async () => {
          const visibilityObservation =
            await this.repository.getOperationByIdVisibilityObservation(
              operation.operationId,
              {
                requireOwnerRpcRead: false,
                allowPriorityRecoveryDeferredVisibility: true,
              },
            );
          const timeoutOperation =
            visibilityObservation?.operation || operation;
          if (this.repository.isOperationTerminal(timeoutOperation)) {
            return;
          }
          const timeoutOperationDrainSnapshot =
            await this.buildPriorityRecoveryOperationDrainSnapshot(
              timeoutOperation,
            );
          if (
            !this.shouldEnterOperationLifecycleFromDrainSnapshot(
              timeoutOperationDrainSnapshot,
            )
          ) {
            return;
          }

          await this.reconcileTimeoutOperation(timeoutOperation, Date.now());
        },
      ).catch((error) => {
        if (
          this.deferTransitionRetry(operation.operationId, error, {
            boundary: 'timeout_reconcile',
            workflowStep: operation?.workflowStep || null,
            partitionId: operation?.partitionId || null,
            updatedAt: operation?.updatedAt,
            createdAt: operation?.createdAt,
          })
        ) {
          return;
        }
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
          {
            operationId: operation.operationId,
            error: error.message,
            nodeId: this.nodeId,
          },
        );
      });
      timeoutReconcileTasks.push(reconcileTask);
    }

    if (timeoutReconcileTasks.length > NUM.ZERO) {
      await Promise.all(timeoutReconcileTasks);
    }

    // Periodic reservation reconciliation (Req 4.4)
    await this.reconcileReservations().catch((error) => {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {error: error.message},
      );
    });
  }

  // --- Executor outcome routing ---

  /**
   * Handle an executor outcome event.
   * @param {Object} outcome
   */
  handleExecutorOutcome(outcome) {
    if (this.isShuttingDown || !this.isInitialized) {
      return;
    }

    const operationId = outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return;
    }

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);

    this.operationWorkflowRunExclusive(singleFlightKey, () =>
      this.reconcileExecutorOutcome(outcome),
    ).catch((error) => {
      if (
        this.deferTransitionRetry(operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
          workflowStep: outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] || null,
          partitionId: null,
        })
      ) {
        return;
      }
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
        {
          operationId,
          outcomeType: outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
          error: error.message,
        },
      );
    });
  }

  /**
   * Reconcile a single executor outcome.
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    const operationId = outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    const outcomeType = outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
    const workflowStep = outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
    const errorMessage = outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE];

    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_RECEIVED, {
      operationId,
      outcomeType,
      workflowStep,
    });

    const operation = await this.repository.queryOperationById(operationId);
    if (!operation) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_FOUND,
        {operationId, outcomeType},
      );
      return false;
    }

    if (this.repository.isOperationTerminal(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_TERMINAL,
        {
          operationId,
          outcomeType,
          step: operation.workflowStep,
        },
      );
      return false;
    }

    if (!this.repository.isOperationLocallyOwned(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_LOCAL,
        {operationId, outcomeType},
      );
      return false;
    }

    const mapping = EXECUTOR_OUTCOME_ACTION_MAP[outcomeType];
    if (!mapping) {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, {
        operationId,
        outcomeType,
      });
      return false;
    }

    const shouldResumeReplaceActivePhase =
      mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE &&
      workflowStep === WORKFLOW_STEP.ACTIVE &&
      operation.type === OperationType.REPLACE;

    if (mapping.action === EXECUTOR_OUTCOME_ACTION.UPDATE_STEP) {
      if (!this.isExecutorOutcomeStepBehindOperation(operation, workflowStep)) {
        await this.updateStep(
          operation,
          workflowStep,
          OPERATION_TRANSITION_REASON.EXECUTOR_OUTCOME,
        );
      }
      await this.reconcileExecutorStepUpdateOutcome(
        operation,
        outcomeType,
        workflowStep,
      );
    } else if (shouldResumeReplaceActivePhase) {
      await this.reconcileReplaceActualActive(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE) {
      await this.completeOperation(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.FAIL) {
      await this.failOperation(operation, errorMessage || outcomeType);
    } else {
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, {
        operationId,
        outcomeType,
        action: mapping.action,
      });
      return false;
    }

    this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, {
      operationId,
      outcomeType,
      action: mapping.action,
    });

    return true;
  }

  /**
   * @param {Object} operation
   * @param {string} workflowStep
   * @return {boolean}
   * @private
   */
  isExecutorOutcomeStepBehindOperation(operation, workflowStep) {
    const operationStepRank = this.getOperationWorkflowStepRank(operation);
    const outcomeStepRank = this.getOperationWorkflowStepRank({
      ...operation,
      workflowStep,
    });
    return (
      operationStepRank !== NUM.NEGATIVE_ONE &&
      outcomeStepRank !== NUM.NEGATIVE_ONE &&
      outcomeStepRank < operationStepRank
    );
  }

  /**
   * Some executor step outcomes are only intermediate progress markers.
   * Immediately re-sample authoritative replica state after persisting them
   * so a delayed SYNCING outcome cannot pin an already-active target.
   *
   * @param {Object} operation
   * @param {string} outcomeType
   * @param {string} workflowStep
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileExecutorStepUpdateOutcome(
    operation,
    outcomeType,
    workflowStep,
  ) {
    if (
      outcomeType !== EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING ||
      workflowStep !== WORKFLOW_STEP.SYNCING ||
      !EXECUTOR_STEP_UPDATE_RECONCILE_WORKFLOW_STEPS.has(
        operation?.workflowStep,
      )
    ) {
      return false;
    }
    return this.reconcileOperationLifecycle(operation, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
    });
  }

  // --- Recovery ---

  /**
   * @param {string} step
   * @return {boolean}
   */
  isPreSyncStep(step) {
    return [
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
    ].includes(step);
  }

  /**
   * Resolve the next legal lifecycle action for one locally owned operation.
   * Multiple wake causes can feed the owner, but they should all reduce to one
   * explicit action model.
   *
   * @param {Object} operation
   * @param {string} [cause='progress']
   * @return {string}
   * @private
   */
  resolveOperationLifecycleAction(
    operation,
    cause = OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS,
  ) {
    if (cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY) {
      if (this.isPreSyncStep(operation.workflowStep)) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        return OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY;
      }
    }

    if (
      operation.type === OperationType.REPLACE &&
      operation.workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE;
    }

    if (this.isRemoveInitialDispatchPhase(operation)) {
      return OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.STOPPING &&
      (operation.type === OperationType.REMOVE ||
        operation.type === OperationType.REPLACE)
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING;
    }

    if (
      operation.workflowStep === WORKFLOW_STEP.PENDING ||
      operation.workflowStep === WORKFLOW_STEP.SENDING ||
      operation.workflowStep === WORKFLOW_STEP.CREATING ||
      operation.workflowStep === WORKFLOW_STEP.SYNCING
    ) {
      return OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS;
    }

    return OPERATION_LIFECYCLE_ACTION.NOOP;
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isPriorityRecoveryOperationDrainCandidate(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REPLACE ||
      this.repository.isOperationTerminal(operation)
    ) {
      return false;
    }
    return (
      isPriorityControlPlanePartition({partitionId: operation.partitionId}) &&
      PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS.has(
        operation.workflowStep,
      )
    );
  }

  /**
   * @param {Object|null} completion
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryOperationDrainState(completion, sourceSnapshot) {
    if (!completion || typeof completion !== TYPEOF.OBJECT) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE;
    }
    if (
      !PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATES.has(
        completion.state,
      )
    ) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.IN_FLIGHT;
    }
    const sourceState =
      sourceSnapshot?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED;
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE_BY_SOURCE_STATE.get(
        sourceState,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.EVIDENCE_UNAVAILABLE
    );
  }

  /**
   * @param {Object|null} observation
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryOperationDrainSourceObservationKey(observation) {
    const observationState = observation?.state || null;
    if (observationState === STOPPING_REPLICA_OBSERVATION_STATE.ABSENT) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.ABSENT;
    }
    if (
      observationState === STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE
    ) {
      return (
        PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.UNAVAILABLE
      );
    }
    const lifecycleStatus = observation?.lifecycleStatus || null;
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY_BY_STATUS.get(
        lifecycleStatus,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_OBSERVATION_KEY.PRESENT
    );
  }

  /**
   * @param {Object|null} observation
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryOperationDrainSourceState(observation) {
    const observationKey =
      this.resolvePriorityRecoveryOperationDrainSourceObservationKey(
        observation,
      );
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE_BY_OBSERVATION_KEY.get(
        observationKey,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE
    );
  }

  /**
   * @param {Object} operation
   * @param {string|null} completionState
   * @return {Promise<Object>}
   * @private
   */
  async buildPriorityRecoveryOperationDrainSourceSnapshot(
    operation,
    completionState,
  ) {
    if (
      operation?.type !== OperationType.REPLACE ||
      completionState !== PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED
    ) {
      return Object.freeze({
        state: PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.NOT_REQUIRED,
        sourceReplicaId: null,
        observationState: null,
        lifecycleStatus: null,
      });
    }
    const sourceReplicaId =
      this.repository.getReplaceSourceReplicaId(operation);
    if (!sourceReplicaId) {
      return Object.freeze({
        state:
          PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.EVIDENCE_UNAVAILABLE,
        sourceReplicaId: null,
        observationState: null,
        lifecycleStatus: null,
      });
    }
    const observation = await this.observeStoppingReplicaProgress(
      sourceReplicaId,
      operation.partitionId,
      operation.sourceNodeId,
    );
    return Object.freeze({
      state: this.resolvePriorityRecoveryOperationDrainSourceState(
        observation,
      ),
      sourceReplicaId,
      observationState: observation?.state || null,
      lifecycleStatus: observation?.lifecycleStatus || null,
    });
  }

  /**
   * @param {Object} operation
   * @param {string} drainAction
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryOperationDrainOwnerState(operation, drainAction) {
    if (this.repository.isOperationLocallyOwned(operation)) {
      return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_OWNER;
    }
    if (
      drainAction ===
      OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN
    ) {
      return (
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_SETTLE_ALLOWED
      );
    }
    return PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_OWNER_REQUIRED;
  }

  /**
   * @param {string} ownerState
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryOperationDrainOwnerAction(ownerState) {
    return (
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION_BY_STATE.get(
        ownerState,
      ) ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.SKIP_REMOTE_OWNER
    );
  }

  /**
   * @param {Object} drainSnapshot
   * @return {boolean}
   * @private
   */
  shouldEnterOperationLifecycleFromDrainSnapshot(drainSnapshot) {
    return (
      drainSnapshot?.ownerAction ===
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE
    );
  }

  /**
   * @param {Object} operation
   * @return {Promise<Object>}
   * @private
   */
  async buildPriorityRecoveryOperationDrainSnapshot(operation) {
    if (!this.isPriorityRecoveryOperationDrainCandidate(operation)) {
      const action =
        PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(
          PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
        ) || OPERATION_LIFECYCLE_ACTION.NOOP;
      const ownerState =
        this.resolvePriorityRecoveryOperationDrainOwnerState(
          operation,
          action,
        );
      return Object.freeze({
        state: PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.NOT_APPLICABLE,
        action,
        ownerState,
        ownerAction:
          this.resolvePriorityRecoveryOperationDrainOwnerAction(ownerState),
        completionState:
          PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE,
      });
    }

    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    const completion = this.buildPriorityRecoveryCompletionForOperation(
      operation,
      planningSnapshot,
    );
    const completionState =
      completion?.state ||
      PRIORITY_RECOVERY_OPERATION_DRAIN_COMPLETION_STATE_UNAVAILABLE;
    const sourceSnapshot =
      await this.buildPriorityRecoveryOperationDrainSourceSnapshot(
        operation,
        completionState,
      );
    const state =
      this.resolvePriorityRecoveryOperationDrainState(
        completion,
        sourceSnapshot,
      );
    const action =
      PRIORITY_RECOVERY_OPERATION_DRAIN_ACTION_BY_STATE.get(state) ||
      OPERATION_LIFECYCLE_ACTION.NOOP;
    const ownerState =
      this.resolvePriorityRecoveryOperationDrainOwnerState(
        operation,
        action,
      );
    return Object.freeze({
      state,
      action,
      ownerState,
      ownerAction:
        this.resolvePriorityRecoveryOperationDrainOwnerAction(ownerState),
      completionState,
      sourceState: sourceSnapshot.state,
      sourceReplicaId: sourceSnapshot.sourceReplicaId,
      sourceObservationState: sourceSnapshot.observationState,
      sourceLifecycleStatus: sourceSnapshot.lifecycleStatus,
    });
  }

  /**
   * @param {Object} operation
   * @param {Object|null} drainSnapshot
   * @return {Promise<boolean>}
   * @private
   */
  async reconcilePriorityRecoveryOperationDrain(
    operation,
    drainSnapshot = null,
  ) {
    const resolvedDrainSnapshot =
      drainSnapshot ||
      await this.buildPriorityRecoveryOperationDrainSnapshot(operation);
    if (
      resolvedDrainSnapshot.action !==
      OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN
    ) {
      return false;
    }
    await this.completeOperation(operation);
    return true;
  }

  /**
   * Per-operation recovery logic.
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    await this.reconcileOperationLifecycle(op, {
      cause: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
    });
  }

  /**
   * Reconcile a SYNCING operation by checking actual replica status.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async reconcileSyncingOperation(operation) {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_SYNCING, {
      operationId: operation.operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    const progressed = await this.reconcileOperationLifecycle(operation, {
      cause: 'recovery',
    });
    if (!progressed) {
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_IN_PROGRESS, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        workflowStep: operation.workflowStep,
      });
    }
  }

  /**
   * Handle node recovery.
   * @return {Promise<Object>}
   */
  async handleRecovery() {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, {
      nodeId: this.nodeId,
    });

    const result = {
      totalIncomplete: NUM.ZERO,
      markedFailed: NUM.ZERO,
      reconciled: NUM.ZERO,
      errors: [],
    };

    const canUseCacheObservationBoundary =
      this.repository.hasReplicaOperationCacheObservationBoundary();
    const cachedIncompleteOps = canUseCacheObservationBoundary ?
      await this.repository.queryCachedIncompleteOperations() :
      [];
    const incompleteOperationObservation =
      await this.repository.getIncompleteOperationVisibilityObservation({
        cachedOperations: cachedIncompleteOps,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE
            .CACHE_PREFERRED_SQL_FALLBACK,
      });
    const incompleteOps = Array.isArray(
      incompleteOperationObservation?.operations,
    ) ?
      incompleteOperationObservation.operations :
      [];
    result.totalIncomplete = incompleteOps.length;
    result.incompleteOperationObservationState =
      incompleteOperationObservation.state;
    result.incompleteOperationRetryAfterMs =
      incompleteOperationObservation.retryAfterMs;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, {
      count: incompleteOps.length,
      incompleteOperationObservationState:
        incompleteOperationObservation.state,
      incompleteOperationRetryAfterMs:
        incompleteOperationObservation.retryAfterMs,
      nodeId: this.nodeId,
    });

    for (const op of incompleteOps) {
      if (!this.repository.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;

      const singleFlightKey = this.getOperationOwnerSingleFlightKey(
        op.operationId,
      );

      try {
        await this.operationWorkflowRunExclusive(
          singleFlightKey,
          () => this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        if (this.deferTransitionRetry(op.operationId, error, {
          boundary: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
          workflowStep: op?.workflowStep || null,
          partitionId: op?.partitionId || null,
          updatedAt: op?.updatedAt,
          createdAt: op?.createdAt,
        })) {
          continue;
        }
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
          {
            operationId: op.operationId,
            workflowStep: originalStep,
            partitionId: op.partitionId,
            error: error.message,
          },
        );
        continue;
      }

      if (
        this.isPreSyncStep(originalStep) ||
        originalStep === WORKFLOW_STEP.STOPPING
      ) {
        result.markedFailed++;
      } else if (originalStep === WORKFLOW_STEP.SYNCING) {
        result.reconciled++;
      }
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, {
      nodeId: this.nodeId,
      ...result,
    });

    const reservationResult = await this.reconcileReservations();
    result.reservationsExpired = reservationResult.expired;
    result.reservationsOrphansReleased =
      reservationResult.orphansReleased;

    this.emitter.emit(
      REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
      result,
    );

    return result;
  }

  // --- Helpers ---

  /**
   * @param {string} errorMessage
   * @return {boolean}
   */
  isSafetyPolicyFailure(errorMessage) {
    if (
      typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      !errorMessage
    ) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL
          .WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY_PROJECTION_MEMBERSHIP,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD,
      ) ||
      normalized.includes(
        OPERATION_WORKFLOW_OWNER_LITERAL
          .IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR
          .trim(),
      )
    );
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @param {string} removeSafetyError
   * @return {boolean}
   */
  async getRemoveSafetyDeferReason(
    operation,
    replaceRemovePhase,
    removeSafetyError,
  ) {
    if (!operation || !this.isSafetyPolicyFailure(removeSafetyError)) {
      return null;
    }
    if (operation.type === OperationType.REPLACE && replaceRemovePhase) {
      return REBALANCE_COORDINATOR_DEFER_REASON
        .REPLACE_REMOVE_SAFETY_BLOCKED;
    }
    if (
      operation.type !== OperationType.REMOVE ||
      !await this.isCriticalRemoveOverReplicated(operation)
    ) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED;
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   */
  async isCriticalRemoveOverReplicated(operation) {
    if (
      !operation ||
      operation.type !== OperationType.REMOVE ||
      !this.isCriticalSystemPartition(operation.partitionId)
    ) {
      return false;
    }
    const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(
      operation.partitionId,
    );
    const minReplicaCount = await this.getCriticalMinReplicaCount(
      operation.partitionId,
    );
    return criticalReplicaRows.length > minReplicaCount;
  }

  /**
   * @param {string|null|undefined} operationId
   * @return {void}
   */
  clearDeferredSafetyBlockState(operationId) {
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return;
    }
    this.clearSafetyDeferredRetry(operationId);
    this.safetyDeferredLogStateByOperationId.delete(operationId);
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {void}
   */
  logDeferredSafetyBlockedRemove(
    operation,
    errorMessage,
    deferReason,
  ) {
    const operationId = operation?.operationId;
    if (
      typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING ||
      operationId.length === NUM.ZERO
    ) {
      return;
    }
    const now = Date.now();
    const previousState =
      this.safetyDeferredLogStateByOperationId.get(operationId) || null;
    const errorChanged = previousState?.errorMessage !== errorMessage;
    const throttleElapsed = !previousState ||
      now - previousState.loggedAtMs >=
        SAFETY_DEFERRED_LOG_THROTTLE_MS;

    this.safetyDeferredLogStateByOperationId.set(operationId, {
      errorMessage,
      loggedAtMs: now,
    });

    if (!errorChanged && !throttleElapsed) {
      return;
    }

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DEFERRED_BY_SAFETY_POLICY,
      {
        operationId,
        partitionId: operation.partitionId,
        sourceNodeId: operation.sourceNodeId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        reason: deferReason,
        errorMessage,
      },
    );
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (
      typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      errorLike.trim()
    ) {
      return errorLike;
    }

    if (
      !errorLike ||
      typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT
    ) {
      return fallbackMessage;
    }

    const candidateValues = [
      errorLike.message,
      errorLike.errorMessage,
      errorLike.error?.message,
      errorLike.error?.errorMessage,
      errorLike.details?.message,
      errorLike.details?.errorMessage,
    ];

    for (const candidate of candidateValues) {
      if (
        typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        candidate.trim()
      ) {
        return candidate;
      }
    }

    return fallbackMessage;
  }
}

export {OperationWorkflowOwnerSegment7};
