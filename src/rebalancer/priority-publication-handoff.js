import {PriorityPublicationLeaderSafety} from './priority-publication-leader-safety.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';

const {
  NUM,
  OPERATION_HANDLER,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
  SERVICE_TYPE,
  TYPEOF,
  isPriorityControlPlanePartition,
} = SHARED;

const PRIORITY_RECOVERY_PLANNING_REUSE_LITERAL = Object.freeze({
  OPERATION_WORKFLOW_OWNER: 'operation_workflow_owner',
  SERIAL_OPERATION_WAIT: 'priority_operation_serial_wait',
  WAIT_FOR_OPERATION_PROGRESS: 'wait_for_operation_progress',
  WORKFLOW_PROGRESS: 'workflow_progress',
});

class PriorityPublicationHandoff extends PriorityPublicationLeaderSafety {
  async evaluatePriorityPublicationLeaderRemoveSafety(
    operation,
    sourceReplicaRow,
    replacementReplicaRow,
    options = {},
  ) {
    const partitionRow = await this.getCriticalPartitionRowForSafety(
      operation?.partitionId || null,
    );
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    const safetySnapshot =
      this.buildPriorityPublicationLeaderRemoveSafetySnapshot(
        operation,
        sourceReplicaRow,
        replacementReplicaRow,
        partitionRow,
        planningSnapshot,
        options,
      );

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.NOT_APPLICABLE
    ) {
      return null;
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE
    ) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    if (
      this.isCompletedReplacementElectionSafeForPriorityRecovery(
        safetySnapshot,
        replacementReplicaRow,
        {
          operation,
          priorityRecoveryCompletionSafe:
            options?.priorityRecoveryCompletionSafe,
          replacementLeaderRetargetCandidateAvailable:
            options?.replacementLeaderRetargetCandidateAvailable,
        },
      )
    ) {
      return this.buildSafeRemoveSafetyEvaluation();
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.PUBLICATION_STATUS_UNAVAILABLE
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
          safetySnapshot.publicationPartitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN +
          OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP +
          OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN +
          OPERATION_WORKFLOW_OWNER_LITERAL.SAFE_REMOVAL_UNAVAILABLE_SUFFIX,
      );
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_PUBLICATION_PUBLISHED
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION +
          safetySnapshot.publicationPartitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
          safetySnapshot.sourceReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.CANNOT_BE_REMOVED_WHILE +
          OPERATION_WORKFLOW_OWNER_LITERAL.PUBLICATION_STATUS_IS +
          safetySnapshot.publicationStatus,
      );
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE
        .REQUEST_REPLACEMENT_LEADER_ELECTION
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          safetySnapshot.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
          safetySnapshot.sourceReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL,
        {
          handoffRequest: Object.freeze({
            dispatchNodeId: safetySnapshot.replacementNodeId,
            messageType: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
            requestReason:
              ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
            requestReplicaId: safetySnapshot.replacementReplicaId,
          }),
          handoffFailurePolicy:
            safetySnapshot.replacementLeaderElectionNotFoundTerminal === true ?
              REMOVE_SAFETY_HANDOFF_FAILURE_POLICY.FAIL_ON_NOT_FOUND :
              REMOVE_SAFETY_HANDOFF_FAILURE_POLICY.NONE,
          handoffFailureError:
            OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
            safetySnapshot.partitionId +
            OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 +
            safetySnapshot.replacementReplicaId +
            OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_LEADER_ELECTION_RETURNED_NOT_FOUND,
        },
      );
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE
        .FAIL_REPLACEMENT_REPLICA_NOT_FOUND
    ) {
      return this.buildFailedRemoveSafetyEvaluation(
        OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          safetySnapshot.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 +
          safetySnapshot.replacementReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_LEADER_ELECTION_RETURNED_NOT_FOUND,
      );
    }

    if (
      safetySnapshot.state ===
      PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_REPLACEMENT_LEADER_OWNERSHIP
    ) {
      return this.buildDeferredRemoveSafetyEvaluationForOperation(
        operation,
        OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
          safetySnapshot.partitionId +
          OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
          safetySnapshot.sourceReplicaId +
          OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL,
      );
    }

    return this.buildDeferredRemoveSafetyEvaluationForOperation(
      operation,
      OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION +
        safetySnapshot.partitionId +
        OPERATION_WORKFLOW_OWNER_LITERAL.SOURCE_LEADER +
        safetySnapshot.sourceReplicaId +
        OPERATION_WORKFLOW_OWNER_LITERAL.HANDOFF_PENDING_BEFORE_SAFE_REMOVAL,
      {
        handoffRequest: Object.freeze({
          dispatchNodeId: safetySnapshot.sourceNodeId,
          messageType: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          requestReason: ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
          requestReplicaId: safetySnapshot.sourceReplicaId,
        }),
      },
    );
  }

  async dispatchRemoveSafetyHandoffRequest(operation, handoffRequest) {
    if (
      !operation ||
      !handoffRequest ||
      typeof handoffRequest !== TYPEOF.OBJECT ||
      typeof handoffRequest.dispatchNodeId !== TYPEOF.STRING ||
      handoffRequest.dispatchNodeId.length === NUM.ZERO ||
      typeof handoffRequest.requestReplicaId !== TYPEOF.STRING ||
      handoffRequest.requestReplicaId.length === NUM.ZERO
    ) {
      return null;
    }

    const entityType = operation.entityType || SERVICE_TYPE.PARTITION;
    const entityId = operation.entityId || operation.partitionId;
    const handlerType =
      OPERATION_HANDLER[entityType] ||
      OPERATION_HANDLER[SERVICE_TYPE.PARTITION];
    const target = `${handoffRequest.dispatchNodeId}/service/${handlerType}`;
    const request = {
      [ReplicaOperationField.TYPE]: handoffRequest.messageType,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.OPERATION_TYPE]: operation.type,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: handoffRequest.requestReplicaId,
      [ReplicaOperationField.SOURCE_NODE_ID]: operation.sourceNodeId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
    };
    if (handoffRequest.requestReason) {
      request[ReplicaOperationField.REASON] = handoffRequest.requestReason;
    }

    try {
      const response = await this.messageRouter.deliver(target, request, {
        targetNodeId: handoffRequest.dispatchNodeId,
        deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
      });
      this.recordPriorityPublicationLeaderHandoffEvidence(
        operation,
        handoffRequest,
        response,
      );
      this.recordPriorityPublicationReplacementLeaderElectionEvidence(
        operation,
        handoffRequest,
        response,
      );
      return response || null;
    } catch (_error) {
      return null;
    }
  }

  async shouldContinueAfterRemoveSafetyHandoffResponse(
    operation,
    removeSafetyEvaluation,
    response,
  ) {
    const snapshot =
      await this.buildRemoveSafetyHandoffContinuationSnapshot(
        operation,
        removeSafetyEvaluation,
        response,
      );
    const decision =
      this.decideRemoveSafetyHandoffContinuation(snapshot);
    return (
      decision.action === REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION.CONTINUE
    );
  }

  async buildRemoveSafetyHandoffContinuationSnapshot(
    operation,
    removeSafetyEvaluation,
    response,
  ) {
    const handoffRequest = removeSafetyEvaluation?.handoffRequest || null;
    const priorityReplaceSourceRemoval =
      operation?.type === OperationType.REPLACE &&
      this.repository.isReplaceRemovePhase(operation) &&
      isPriorityControlPlanePartition({partitionId: operation.partitionId});
    const replacementLeaderElectionHandoff =
      handoffRequest?.requestReason ===
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION;
    const handoffCompleted =
      response?.status === ReplicaOperationResponseStatus.COMPLETED;
    const dispatchNodeId =
      typeof handoffRequest?.dispatchNodeId === TYPEOF.STRING ?
        handoffRequest.dispatchNodeId.trim() :
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
    const continuationApplicable =
      priorityReplaceSourceRemoval &&
      replacementLeaderElectionHandoff &&
      handoffCompleted &&
      dispatchNodeId.length > NUM.ZERO;
    const priorityRecoveryCompletionSafe =
      continuationApplicable ?
        await this.isRemoveSafetyHandoffPriorityRecoveryCompletionSafe(
          operation,
        ) :
        false;
    const replacementLeaderRetargetCandidateAvailable =
      continuationApplicable ?
        await this.resolveRemoveSafetyHandoffRetargetCandidateAvailability(
          operation,
        ) :
        false;
    const targetReadyForRouting =
      continuationApplicable ?
        this.resolveRemoveSafetyHandoffTargetReadiness(
          operation,
          dispatchNodeId,
        ) :
        true;
    return Object.freeze({
      continuationApplicable,
      handoffCompleted,
      priorityRecoveryCompletionSafe,
      replacementLeaderElectionHandoff,
      replacementLeaderRetargetCandidateAvailable,
      targetReadyForRouting,
    });
  }

  decideRemoveSafetyHandoffContinuation(snapshot) {
    const state =
      this.resolveRemoveSafetyHandoffContinuationState(snapshot);
    const action =
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE.get(state) ||
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION.WAIT;
    return Object.freeze({action, state});
  }

  resolveRemoveSafetyHandoffContinuationState(snapshot) {
    if (
      snapshot?.continuationApplicable !== true ||
      snapshot?.replacementLeaderElectionHandoff !== true ||
      snapshot?.handoffCompleted !== true
    ) {
      return REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE.NOT_APPLICABLE;
    }
    if (
      snapshot.priorityRecoveryCompletionSafe === true &&
      snapshot.replacementLeaderRetargetCandidateAvailable !== true
    ) {
      return (
        REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE
          .PRIORITY_RECOVERY_COMPLETION_READY
      );
    }
    if (snapshot.targetReadyForRouting === false) {
      return (
        REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE
          .PRESSURE_EXCLUDED_TARGET_READY
      );
    }
    return REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE.WAIT_FOR_RETRY;
  }

  async isRemoveSafetyHandoffPriorityRecoveryCompletionSafe(operation) {
    const evaluation =
      await this.evaluatePriorityRecoveryCompletionRemoveSafety(operation);
    return (
      evaluation?.classification ===
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE
    );
  }

  async resolveRemoveSafetyHandoffRetargetCandidateAvailability(operation) {
    if (
      typeof this.hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound !==
      TYPEOF.FUNCTION
    ) {
      return false;
    }
    const criticalReplicaRows =
      await this.getCriticalReplicaRowsForSafety(operation.partitionId);
    const removeSafetyReadiness = {
      partitionId: operation.partitionId,
      decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
      participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
    };
    const currentVoterReadyRows = (Array.isArray(criticalReplicaRows) ?
      criticalReplicaRows :
      []).filter((row) =>
      this.isVoterReadyRoutableReplica(row, removeSafetyReadiness),
    );
    const operationReplicaId =
      this.repository.getReplaceSourceReplicaId(operation);
    const replacementReplicaId =
      this.repository.getReplaceTargetReplicaId(operation) ||
      (typeof operation?.replicaId === TYPEOF.STRING &&
      operation.replicaId.length > NUM.ZERO ?
        operation.replicaId :
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING);
    const replacementReplicaRow =
      currentVoterReadyRows.find((row) =>
        this.isOperationReplicaRow(row, {
          ...operation,
          replicaId: replacementReplicaId,
        }),
      ) || null;
    return this.hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
      operation,
      currentVoterReadyRows,
      operationReplicaId,
      replacementReplicaRow,
    );
  }

  resolveRemoveSafetyHandoffTargetReadiness(operation, dispatchNodeId) {
    const readinessService = this.controlPlaneReadinessService;
    const hasReadinessSource =
      typeof readinessService?.getNodeReadinessSync === TYPEOF.FUNCTION ||
      typeof readinessService?.getControlPlaneParticipationSync ===
        TYPEOF.FUNCTION;
    if (!hasReadinessSource) {
      return true;
    }
    try {
      return this.isNodeReadyForRouting(dispatchNodeId, {
        partitionId: operation.partitionId,
        decisionDimension: REMOVE_SAFETY_READINESS_DIMENSION,
        participationKind: REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
      });
    } catch {
      return true;
    }
  }

  async getPriorityRecoveryPlanningSnapshotForOperation(operation) {
    return this.getPriorityRecoveryPlanningSnapshot(operation);
  }

  resolvePriorityRecoveryIncompleteOperationObservation(
    operations = [],
    fallbackObservation = null,
  ) {
    if (
      !this.repository ||
      typeof this.repository.resolveIncompleteOperationObservation !==
        TYPEOF.FUNCTION
    ) {
      return (
        fallbackObservation && typeof fallbackObservation === TYPEOF.OBJECT ?
          fallbackObservation :
          null
      );
    }
    const normalizedOperations = (Array.isArray(operations) ? operations : [])
      .filter((operation) => operation && typeof operation === TYPEOF.OBJECT);
    if (normalizedOperations.length === NUM.ZERO) {
      return (
        fallbackObservation && typeof fallbackObservation === TYPEOF.OBJECT ?
          fallbackObservation :
          null
      );
    }
    return this.repository.resolveIncompleteOperationObservation(
      normalizedOperations,
    );
  }

  normalizePriorityRecoveryOperationId(value) {
    return String(
      value || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
    ).trim();
  }

  addPriorityRecoveryOperationId(operationIds, value) {
    const operationId = this.normalizePriorityRecoveryOperationId(value);
    if (operationId.length === NUM.ZERO) {
      return;
    }
    operationIds.add(operationId);
  }

  addPriorityRecoveryOperationIds(operationIds, values = []) {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values) {
      this.addPriorityRecoveryOperationId(operationIds, value);
    }
  }

  collectPriorityRecoveryOperationIds(operations = []) {
    const operationIds = new Set();
    for (const operation of Array.isArray(operations) ? operations : []) {
      this.addPriorityRecoveryOperationId(
        operationIds,
        operation?.operationId || operation?.operation_id,
      );
    }
    return operationIds;
  }

  collectPriorityRecoveryDecisionSnapshotOperationIds(snapshot) {
    const operationIds = new Set();
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return operationIds;
    }
    this.addPriorityRecoveryOperationId(operationIds, snapshot.operationId);
    this.addPriorityRecoveryOperationIds(operationIds, snapshot.operationIds);
    this.addPriorityRecoveryOperationIds(
      operationIds,
      snapshot.coordinator?.operationIds,
    );
    this.addPriorityRecoveryOperationIds(
      operationIds,
      snapshot.spreadCompletion?.satisfyingOperationIds,
    );
    this.addPriorityRecoveryOperationIds(
      operationIds,
      snapshot.spreadCompletion?.blockingOperationIds,
    );
    const operationContexts = Array.isArray(snapshot.operationContexts) ?
      snapshot.operationContexts :
      [];
    for (const operationContext of operationContexts) {
      this.addPriorityRecoveryOperationId(
        operationIds,
        operationContext?.operationId,
      );
    }
    return operationIds;
  }

  hasPriorityRecoveryDecisionSnapshotOperationMatch(
    snapshot,
    operationIds,
  ) {
    if (!(operationIds instanceof Set) || operationIds.size === NUM.ZERO) {
      return false;
    }
    const snapshotOperationIds =
      this.collectPriorityRecoveryDecisionSnapshotOperationIds(snapshot);
    for (const operationId of operationIds) {
      if (snapshotOperationIds.has(operationId)) {
        return true;
      }
    }
    return false;
  }

  normalizePriorityRecoveryDecisionSnapshotPartitionIds(values = []) {
    if (!Array.isArray(values)) {
      return [];
    }
    return values
      .map((value) =>
        String(
          value || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
        ).trim(),
      )
      .filter((value) => value.length > NUM.ZERO);
  }

  hasPriorityRecoveryDecisionSnapshotPlanningOnlyWorkflowProgressMatch(
    snapshot,
    operationIds,
  ) {
    const blockerReasons = Array.isArray(snapshot?.blockerReasons) ?
      snapshot.blockerReasons :
      [];
    const serialWaitPartitionIds =
      this.normalizePriorityRecoveryDecisionSnapshotPartitionIds(
        snapshot?.coordinator?.serialWaitPartitionIds,
      );
    const serialWaitOperationIds =
      this.collectPriorityRecoveryDecisionSnapshotOperationIds({
        coordinator: {
          serialWaitOperationIds:
            snapshot?.coordinator?.serialWaitOperationIds,
        },
      });
    const evidence = Object.freeze({
      operationIdsAvailable:
        operationIds instanceof Set && operationIds.size > NUM.ZERO,
      currentOwner:
        snapshot?.progress?.currentOwner ||
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
      nextRequiredAction:
        snapshot?.progress?.nextRequiredAction ||
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
      blockingBoundary:
        snapshot?.progress?.blockingBoundary ||
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
      serialWaitSourceAvailable:
        serialWaitOperationIds.size > NUM.ZERO ||
        serialWaitPartitionIds.length > NUM.ZERO,
      serialWaitProgressClass:
        blockerReasons.includes(
          PRIORITY_RECOVERY_PLANNING_REUSE_LITERAL.SERIAL_OPERATION_WAIT,
        ),
    });
    return (
      evidence.operationIdsAvailable !== true &&
      evidence.currentOwner ===
        PRIORITY_RECOVERY_PLANNING_REUSE_LITERAL
          .OPERATION_WORKFLOW_OWNER &&
      evidence.nextRequiredAction ===
        PRIORITY_RECOVERY_PLANNING_REUSE_LITERAL
          .WAIT_FOR_OPERATION_PROGRESS &&
      evidence.blockingBoundary ===
        PRIORITY_RECOVERY_PLANNING_REUSE_LITERAL.WORKFLOW_PROGRESS &&
      evidence.serialWaitSourceAvailable === true &&
      evidence.serialWaitProgressClass === true
    );
  }
}

export {PriorityPublicationHandoff};
