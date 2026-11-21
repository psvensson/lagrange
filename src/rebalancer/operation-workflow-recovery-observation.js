import {OPERATION_RECONCILE_OUTCOME, didOperationReconcileAdvanceOrComplete} from './operation-workflow-reconcile-outcome.js';
import {assertOperationTransitionOutcome, terminalOperationReconcileOutcome} from './operation-workflow-transition-outcome.js';
import {PriorityRecoverySupersededTarget} from './priority-recovery-superseded-target.js';
import {isUnclaimedPreRuntimeFailedCreateRow} from './failed-create-cleanup-token.js';
import {PRE_SYNC_WORKFLOW_STEPS} from './replica-operation-step-policy.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from './operation-workflow-recovery-reconcile-shared.js';
import {
  clearStoppingObservationDeferrals, handleUnavailableStoppingObservation,
  shouldClearStoppingObservationDeferrals,
} from './operation-workflow-stopping-starvation.js';
import {
  adoptObservedReplaceSourceRetirement, isPartitionReplace,
  isReplaceRemovalIntentDurable,
} from './operation-workflow-replace-owner.js';
import {observeGrowthPromoteIncompleteState} from './operation-workflow-growth-promote.js';
import {isTerminalTransitionOutcomeSettled} from './operation-workflow-terminal-reservation-release.js';

const {
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
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
  OBSERVED_PROGRESS_TABLE_STATE, OBSERVED_PROGRESS_TABLE_STATE_BY_NAME,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  RECONCILED_REPLICA_STATUS_OBSERVED_TARGET_UNAVAILABLE,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  STOPPING_REPLICA_OBSERVATION_STATE,
  TRANSITION_RETRY_DELAY_MS,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  classifySystemPartition,
} = SHARED;

const COORDINATOR_CREATED_CACHE_REENTRY_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  NOT_OPERATION_WORKFLOW_ROW: 'not_operation_workflow_row',
  OBSERVED_TARGET_PROGRESS: 'observed_target_progress',
  NOT_DISPATCH_RETRYABLE: 'not_dispatch_retryable',
  REENTER: 'reenter',
});

const COORDINATOR_CREATED_CACHE_REENTRY_ACTION = Object.freeze({
  SKIP: 'skip',
  ARM_OWNER: 'arm_owner',
});

const COORDINATOR_CREATED_CACHE_REENTRY_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      COORDINATOR_CREATED_CACHE_REENTRY_STATE.REENTER,
      COORDINATOR_CREATED_CACHE_REENTRY_ACTION.ARM_OWNER,
    ],
  ]),
);

const COORDINATOR_CREATED_CACHE_REENTRY_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: COORDINATOR_CREATED_CACHE_REENTRY_STATE.NOT_OPERATION_WORKFLOW_ROW,
    matches: (evidence) =>
      evidence.tableState !==
        OBSERVED_PROGRESS_TABLE_STATE.OPERATION_WORKFLOW_STATE ||
      evidence.cacheDelete === true,
  }),
  Object.freeze({
    state: COORDINATOR_CREATED_CACHE_REENTRY_STATE.UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: COORDINATOR_CREATED_CACHE_REENTRY_STATE.OBSERVED_TARGET_PROGRESS,
    matches: (evidence) =>
      evidence.observedTargetProgressVisible === true,
  }),
  Object.freeze({
    state: COORDINATOR_CREATED_CACHE_REENTRY_STATE.NOT_DISPATCH_RETRYABLE,
    matches: (evidence) =>
      evidence.terminalOperation === true ||
      evidence.dispatchRetryable !== true ||
      evidence.priorityRecoveryReentryEligible !== true,
  }),
  Object.freeze({
    state: COORDINATOR_CREATED_CACHE_REENTRY_STATE.REENTER,
    matches: () => true,
  }),
]);

function classifyStoppingRedrive(owner, operation, lifecycleStatus, result) {
  if (owner.repository.isOperationTerminal(operation)) {
    return terminalOperationReconcileOutcome(operation);
  }
  // Only a fresh, positively observed removing replica and the same
  // operation's acknowledged re-drive establish an external effect in flight.
  if (lifecycleStatus === ReplicaStatus.REMOVING &&
      result?.operationId === operation.operationId && result.success === true &&
      result.status === ReplicaOperationResponseStatus.IN_PROGRESS) {
    return OPERATION_RECONCILE_OUTCOME.STOPPING_REDRIVE_CONFIRMED;
  }
  return OPERATION_RECONCILE_OUTCOME.WAITING;
}

class OperationWorkflowRecoveryObservation extends PriorityRecoverySupersededTarget {
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

  isPreSyncCreateOperation(op) {
    return Boolean(op && (op.type === OperationType.ADD || op.type === OperationType.REPLACE) &&
      PRE_SYNC_WORKFLOW_STEPS.has(op.workflowStep));
  }

  isLearnerTargetAddOperation(op) {
    return Boolean(
      op && op.type === OperationType.ADD &&
      (op.asLearner === true || op.as_learner === true ||
        Boolean(op.placementHoldKey) || Boolean(op.placementAdmission) ||
        (Array.isArray(op.stepsHistory) &&
          op.stepsHistory.some((e) => Boolean(e?.placementAdmission))) ||
        this.placementAdmissionEnabled === true ||
        this.emitter?.placementAdmissionEnabled === true),
    );
  }

  buildObservedTargetReplicaObservationOptions(operation) {
    const ignoreUnclaimedPreRuntimeFailedCreate =
      this.isPreSyncCreateOperation(operation);
    const allowActiveLearner = this.isLearnerTargetAddOperation(operation);
    if (!ignoreUnclaimedPreRuntimeFailedCreate && !allowActiveLearner) {
      return EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS;
    }
    return {
      ...EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
      ...(ignoreUnclaimedPreRuntimeFailedCreate ?
        {ignoreUnclaimedPreRuntimeFailedCreate: true} :
        {}),
      ...(allowActiveLearner ? {allowActiveLearner: true} : {}),
    };
  }

  hasObservedOperationRowTargetProgress(operation) {
    if (
      !operation ||
      !this.isObservedOperationRowTargetProgressShapeCandidate(operation) ||
      typeof this.repository?.getObservedReplicaStatusFromCache !== 'function'
    ) {
      return false;
    }
    const observedTargetStatus = this.repository.getObservedReplicaStatusFromCache(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
      this.buildObservedTargetReplicaObservationOptions(operation),
    );
    return OBSERVED_OPERATION_ROW_TARGET_PROGRESS_STATUSES.has(observedTargetStatus);
  }

  observeIncompleteOperationState(operation) {
    return observeGrowthPromoteIncompleteState(this, operation);
  }

  getObservedOperationRowTargetProgressStatus(operation) {
    if (!operation ||
        typeof this.repository?.getObservedReplicaStatusFromCache !== 'function') {
      return RECONCILED_REPLICA_STATUS_OBSERVED_TARGET_UNAVAILABLE;
    }
    return this.repository.getObservedReplicaStatusFromCache(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
      this.buildObservedTargetReplicaObservationOptions(operation),
    );
  }

  findObservedOperationRowProgressOperationIds(operationRow, cacheOperation) {
    if (!operationRow ||
        typeof operationRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ||
        cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE ||
        typeof this.repository?.rowToOperation !== 'function') {
      return [];
    }
    const operation = this.repository.rowToOperation(operationRow);
    if (!this.isObservedOperationRowTargetProgressShapeCandidate(operation) ||
        !this.hasObservedOperationRowTargetProgress(operation)) {
      return [];
    }
    const operationId =
      operation.operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
    return typeof operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
      operationId.length > 0 ? [operationId] : [];
  }

  resolveObservedProgressOperationIds(tableState, record, cacheOperation) {
    switch (tableState) {
    case OBSERVED_PROGRESS_TABLE_STATE.SERVICE_REPLICA_STATE:
      return this.findObservedProgressOperationIds(record, cacheOperation);
    case OBSERVED_PROGRESS_TABLE_STATE.OPERATION_WORKFLOW_STATE:
      return this.findObservedOperationRowProgressOperationIds(record, cacheOperation);
    case OBSERVED_PROGRESS_TABLE_STATE.IGNORED:
    default:
      return [];
    }
  }

  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    if (!serviceRow || typeof serviceRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return [];
    }
    if (cacheOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.DELETE) {
      // services.status is NOT NULL; no relevant status is ever absent.
      const status = String(serviceRow.status).toLowerCase();
      if (!OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES.has(status)) return [];
    }
    const targetNodeId = String(serviceRow.node_id || serviceRow.nodeId || '');
    const replicaId = String(
      serviceRow.service_id || serviceRow.serviceId ||
      serviceRow.replica_id || serviceRow.replicaId || '',
    );
    const partitionId = String(serviceRow.partition_id || serviceRow.partitionId || '');
    if (targetNodeId.length === 0 || (replicaId.length === 0 && partitionId.length === 0)) {
      return [];
    }
    const unclaimedPreRuntimeFailedCreate =
      cacheOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.DELETE &&
      isUnclaimedPreRuntimeFailedCreateRow(serviceRow);
    const matchingRows =
      this.repository.filterReplicaOperationRowsFromCache((row) => {
        if (!this.canObservedProgressOperationRowMatchService(
          row, targetNodeId, replicaId, partitionId)) return false;
        const operation = this.repository.rowToOperation(row);
        if (!this.isObservedProgressOperationShapeCandidate(operation)) return false;
        if (operation.type === OperationType.GROWTH_PROMOTE) {
          return (
            (replicaId.length > 0 &&
              (operation.replicaId === replicaId ||
                operation.sourceReplicaId === replicaId ||
                (Array.isArray(operation.promoteReplicaIds) &&
                  operation.promoteReplicaIds.includes(replicaId)))) ||
            (partitionId.length > 0 && operation.partitionId === partitionId)
          );
        }
        if (this.isObservedProgressReplaceSourceMatch(
          operation, targetNodeId, replicaId, partitionId)) return true;
        if (operation.targetNodeId !== targetNodeId) return false;
        if (unclaimedPreRuntimeFailedCreate && this.isPreSyncCreateOperation(operation)) {
          return false;
        }
        if (replicaId.length > 0 && operation.replicaId === replicaId) return true;
        return partitionId.length > 0 && operation.partitionId === partitionId;
      }) || [];
    return [
      ...new Set(
        matchingRows
          .map((row) => row?.operation_id || row?.operationId || null)
          .filter((opId) =>
            typeof opId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING && opId.length > 0),
      ),
    ];
  }

  canObservedProgressOperationRowMatchService(
    row,
    targetNodeId,
    replicaId,
    partitionId,
  ) {
    if (!row || typeof row !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT) {
      return false;
    }
    if (row.type === OperationType.GROWTH_PROMOTE) {
      return (
        (replicaId.length > 0 &&
          (row.replica_id === replicaId || row.source_replica_id === replicaId)) ||
        (partitionId.length > 0 && row.partition_id === partitionId)
      );
    }
    if (row.target_node_id === targetNodeId) {
      return (replicaId.length > 0 && row.replica_id === replicaId) ||
        (partitionId.length > 0 && row.partition_id === partitionId);
    }
    if (row.type !== OperationType.REPLACE ||
        row.source_node_id !== targetNodeId ||
        !OBSERVED_PROGRESS_REPLACE_SOURCE_WORKFLOW_STEPS.has(
          row.workflow_step,
        )) {
      return false;
    }
    // A REPLACE source replica lives in steps_history and is owned by the
    // canonical decoder. Retain every source-node candidate when a concrete
    // replica is observed; partition-only observations can prefilter exactly.
    return replicaId.length > 0 ||
      (partitionId.length > 0 && row.partition_id === partitionId);
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
    if (replicaId.length > 0) {
      return sourceReplicaId === replicaId;
    }
    return (
      partitionId.length > 0 && operation.partitionId === partitionId
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
        typeof ownerNodeId === 'string' &&
        ownerNodeId.length > 0 &&
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

  selectCoordinatorCreatedCacheReentryOperation(
    tableState,
    cacheOperation,
    record,
  ) {
    if (
      tableState !== OBSERVED_PROGRESS_TABLE_STATE.OPERATION_WORKFLOW_STATE ||
      cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE ||
      !record ||
      typeof record !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT ||
      !this.repository ||
      typeof this.repository.rowToOperation !== 'function'
    ) {
      return null;
    }
    return this.repository.rowToOperation(record);
  }

  buildCoordinatorCreatedCacheReentryEvidence(
    tableState,
    cacheOperation,
    operation,
  ) {
    const heldGrowthPromote =
      operation?.type === OperationType.GROWTH_PROMOTE &&
      (operation.status === ReplicaStatus.HELD ||
        Boolean(operation.stepsHistory?.[0]?.dispatchHold &&
          operation.status === ReplicaStatus.HELD));
    return Object.freeze({
      tableState,
      cacheDelete: cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE,
      operationAvailable:
        operation &&
        typeof operation === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT &&
        typeof operation.operationId ===
          OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
        operation.operationId.length > 0,
      terminalOperation: this.repository.isOperationTerminal(operation),
      observedTargetProgressVisible:
        this.hasObservedOperationRowTargetProgress(operation),
      dispatchRetryable:
        !heldGrowthPromote && this.isDispatchRetryableWorkflowStep(operation),
      priorityRecoveryReentryEligible:
        this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) ||
        operation?.type === OperationType.GROWTH_PROMOTE,
    });
  }

  resolveCoordinatorCreatedCacheReentryAction(evidence) {
    const state =
      COORDINATOR_CREATED_CACHE_REENTRY_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      COORDINATOR_CREATED_CACHE_REENTRY_STATE.UNAVAILABLE;
    return (
      COORDINATOR_CREATED_CACHE_REENTRY_ACTION_BY_STATE.get(state) ||
      COORDINATOR_CREATED_CACHE_REENTRY_ACTION.SKIP
    );
  }

  scheduleCoordinatorCreatedCacheReentry(operation, action) {
    if (action !== COORDINATOR_CREATED_CACHE_REENTRY_ACTION.ARM_OWNER) {
      return false;
    }
    this.operationWorkflowRunExclusive(
      this.getOperationOwnerSingleFlightKey(operation.operationId),
      () => this.armCoordinatorCreatedOperation(operation),
    ).catch((error) => {
      this.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(
        operation,
        error,
      );
    });
    return true;
  }

  scheduleCoordinatorCreatedCacheReentryFromOperationRow(
    tableState,
    cacheOperation,
    record,
  ) {
    const operation = this.selectCoordinatorCreatedCacheReentryOperation(
      tableState,
      cacheOperation,
      record,
    );
    const evidence = this.buildCoordinatorCreatedCacheReentryEvidence(
      tableState,
      cacheOperation,
      operation,
    );
    return this.scheduleCoordinatorCreatedCacheReentry(
      operation,
      this.resolveCoordinatorCreatedCacheReentryAction(evidence),
    );
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

    this.scheduleCoordinatorCreatedCacheReentryFromOperationRow(
      tableState,
      cacheOperation,
      record,
    );

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
      typeof this.repository.getActualReplicaObservation === 'function'
    ) {
      const observation = await this.repository.getActualReplicaObservation(
        replicaId,
        partitionId,
        targetNodeId,
      );
      const observationState =
        observation?.state || STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE;
      return Object.freeze({
        state: observationState,
        source: observation?.source || null,
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
      source: null,
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
      !classifySystemPartition({partitionId: operation.partitionId}).systemTable
    ) {
      return false;
    }
    return this.deferTransitionRetry(
      operation.operationId,
      this.buildStoppingObservationRetryableError(operation),
      {
        boundary: OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId || null,
        updatedAt: operation.updatedAt,
        createdAt: operation.createdAt,
        operationSnapshot: operation,
      },
    );
  }

  async reconcileStoppingOperationProgress(operation, removalEffectTurn) {
    if (isReplaceRemovalIntentDurable(operation)) {
      await this.runReplaceStoppingOwner(operation, removalEffectTurn);
      return this.repository.isOperationTerminal(operation) ?
        terminalOperationReconcileOutcome(operation) : OPERATION_RECONCILE_OUTCOME.WAITING;
    }
    const removingReplicaId =
      operation.type === OperationType.REPLACE ?
        this.repository.getReplaceSourceReplicaId(operation) :
        operation.replicaId;
    const removingNodeId =
      operation.type === OperationType.REPLACE ?
        operation.sourceNodeId :
        operation.targetNodeId;
    if (!removingReplicaId) {
      const outcome = await this.failOperation(operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_MISSING_DURING_STOPPING_RECONCILIATION);
      return assertOperationTransitionOutcome(outcome).reconcileOutcome;
    }

    const stoppingReplicaObservation = await this.observeStoppingReplicaProgress(
      removingReplicaId,
      operation.partitionId,
      removingNodeId,
    );
    const actualStatus = stoppingReplicaObservation.lifecycleStatus;
    if (
      shouldClearStoppingObservationDeferrals(
        stoppingReplicaObservation,
        STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
      )
    ) {
      clearStoppingObservationDeferrals(this, operation.operationId);
    }

    if (
      stoppingReplicaObservation.state ===
        STOPPING_REPLICA_OBSERVATION_STATE.ABSENT ||
      (operation.type === OperationType.REPLACE &&
        operation.entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE &&
        actualStatus === ReplicaStatus.FAILED)
    ) {
      if (
        operation.type === OperationType.REPLACE &&
        !await this.confirmActiveReplicaTerminalHandoff(operation)
      ) {
        return OPERATION_RECONCILE_OUTCOME.WAITING;
      }
      return assertOperationTransitionOutcome(
        await this.completeOperation(operation)).reconcileOutcome;
    }

    if (
      stoppingReplicaObservation.state ===
      STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE
    ) {
      await handleUnavailableStoppingObservation(
        this,
        operation,
        (candidate) =>
          classifySystemPartition({partitionId: candidate.partitionId})
            .systemTable,
      );
      return OPERATION_RECONCILE_OUTCOME.WAITING;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      return assertOperationTransitionOutcome(
        await this.failOperation(
          operation,
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_REMOVE_RECONCILIATION,
        ),
      ).reconcileOutcome;
    }

    const result = await this.executeOperationFromReconcilePath(operation);
    return classifyStoppingRedrive(this, operation, actualStatus, result);
  }

  // BR7: the effect is observed without a recorded intent; record it and
  // let the STOPPING owner decide from committed membership.
  async adoptActiveReplaceSourceRetirement(operation) {
    if (await adoptObservedReplaceSourceRetirement(this, operation)) {
      await this.runReplaceStoppingOwner(operation);
    }
    return true;
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

    const sourceRetirementObserved =
      this.isActiveReplaceSourceRetirementObserved(
        operation,
        removingReplicaId,
        stoppingReplicaObservation,
      );
    if (
      isPartitionReplace(operation) &&
      (sourceRetirementObserved || actualStatus === ReplicaStatus.REMOVING)
    ) {
      return this.adoptActiveReplaceSourceRetirement(operation);
    }
    if (sourceRetirementObserved) {
      if (!await this.confirmActiveReplicaTerminalHandoff(operation)) {
        return false;
      }
      return isTerminalTransitionOutcomeSettled(await this.completeOperation(operation));
    }

    if (actualStatus === ReplicaStatus.REMOVING) {
      return didOperationReconcileAdvanceOrComplete(
        await this.updateStep(operation, WORKFLOW_STEP.STOPPING));
    }

    return false;
  }
}

export {OperationWorkflowRecoveryObservation};
