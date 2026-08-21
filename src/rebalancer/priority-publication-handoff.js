import {PriorityPublicationLeaderSafety} from './priority-publication-leader-safety.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
  resolveOperationHandlerType,
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
      typeof handoffRequest !== 'object' ||
      typeof handoffRequest.dispatchNodeId !== 'string' ||
      handoffRequest.dispatchNodeId.length === 0 ||
      typeof handoffRequest.requestReplicaId !== 'string' ||
      handoffRequest.requestReplicaId.length === 0
    ) {
      return null;
    }

    const {entityType, entityId} =
      assertCanonicalRebalancerEntityIdentity(operation);
    const handlerType = resolveOperationHandlerType(entityType);
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

    // R3 (slow-rejoiner-progress-or-evict): anchor the first source-leader handoff ATTEMPT
    // (independent of whether the saturated source ever responds) so the safety snapshot can
    // detect a sustained non-progressing source handoff and escalate to driving the
    // replacement election instead of re-asking the starved source to step down.
    this.recordPriorityPublicationSourceLeaderHandoffRequested(
      operation,
      handoffRequest,
    );

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
      classifySystemPartition({partitionId: operation.partitionId})
        .priorityControlPlane;
    const replacementLeaderElectionHandoff =
      handoffRequest?.requestReason ===
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION;
    const handoffCompleted =
      response?.status === ReplicaOperationResponseStatus.COMPLETED;
    const dispatchNodeId =
      typeof handoffRequest?.dispatchNodeId === 'string' ?
        handoffRequest.dispatchNodeId.trim() :
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
    const continuationApplicable =
      priorityReplaceSourceRemoval &&
      replacementLeaderElectionHandoff &&
      handoffCompleted &&
      dispatchNodeId.length > 0;
    return Object.freeze({
      continuationApplicable,
      handoffCompleted,
      replacementLeaderElectionHandoff,
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
    return (
      REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE
        .EXACT_TARGET_ELECTION_EVIDENCE_RECORDED
    );
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
        'function'
    ) {
      return (
        fallbackObservation && typeof fallbackObservation === 'object' ?
          fallbackObservation :
          null
      );
    }
    const normalizedOperations = (Array.isArray(operations) ? operations : [])
      .filter((operation) => operation && typeof operation === 'object');
    if (normalizedOperations.length === 0) {
      return (
        fallbackObservation && typeof fallbackObservation === 'object' ?
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
    if (operationId.length === 0) {
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
    if (!snapshot || typeof snapshot !== 'object') {
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
    if (!(operationIds instanceof Set) || operationIds.size === 0) {
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
      .filter((value) => value.length > 0);
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
        operationIds instanceof Set && operationIds.size > 0,
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
        serialWaitOperationIds.size > 0 ||
        serialWaitPartitionIds.length > 0,
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
