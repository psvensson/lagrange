import {deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
import {PriorityPublicationLeaderSafety} from './priority-publication-leader-safety.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {
  beginReplaceHandoffAttempt,
  recordReplaceHandoffAnswer,
} from './operation-workflow-replace-handoff-attempt.js';
import {
  isDeferredVisibilitySnapshot,
} from './operation-workflow-replace-owner-state.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  ReplicaOperationField,
  resolveOperationHandlerType,
} = SHARED;

const PRIORITY_RECOVERY_PLANNING_REUSE_LITERAL = Object.freeze({
  OPERATION_WORKFLOW_OWNER: 'operation_workflow_owner',
  SERIAL_OPERATION_WAIT: 'priority_operation_serial_wait',
  WAIT_FOR_OPERATION_PROGRESS: 'wait_for_operation_progress',
  WORKFLOW_PROGRESS: 'workflow_progress',
});

class PriorityPublicationHandoff extends PriorityPublicationLeaderSafety {
  /**
   * The authoritative planning snapshot this leader-safety evaluation should
   * use: the one the remove-safety owner already resolved for this
   * evaluation, or a single own read when this method was invoked directly.
   * @param {Object} operation
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  resolveLeaderRemoveSafetyPlanningSnapshot(operation, options = {}) {
    if (typeof options.readAuthoritativePlanningSnapshot === 'function') {
      return options.readAuthoritativePlanningSnapshot();
    }
    return this.readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety(
      operation,
    );
  }

  /**
   * The control-plane publication partition's publication waits before a
   * REPLACE of it removes its source: the publication status must be read
   * and PUBLISHED. It reads the AUTHORITATIVE planning contract, never the
   * AVAILABLE one. When the remove-safety owner has already resolved that
   * authoritative snapshot for this evaluation it supplies it through
   * options.readAuthoritativePlanningSnapshot, so one evaluation performs one
   * owner read; a focused or standalone caller that supplies nothing
   * resolves it here instead. Leadership is not decided here: every
   * partition removal passes the removal leadership gate
   * (operation-workflow-removal-leadership-gate.js); the CL-043
   * completed-election authorization stays deleted (R09, BR11).
   * @param {Object} operation
   * @param {Object} sourceReplicaRow
   * @param {Object} replacementReplicaRow
   * @param {Object} [options]
   * @return {Promise<Object|null>} A publication deferral, or null.
   */
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
      await this.resolveLeaderRemoveSafetyPlanningSnapshot(operation, options);
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
    return null;
  }

  /**
   * F-b / TC5: a removal's leadership handoff leaves only while the
   * operation is still the non-terminal one that decided it (live and
   * cached), in its removal dispatch phase (a REPLACE's source removal, a
   * REMOVE's initial dispatch). Otherwise nothing is sent and no attempt
   * opens.
   * @param {Object} operation
   * @return {boolean}
   */
  isRemovalHandoffStillOwned(operation) {
    if (isDeferredVisibilitySnapshot(operation)) {
      // BR12: a deferred-visibility snapshot issues no handoff.
      return false;
    }
    const cachedRow = this.repository.getReplicaOperationRowFromCache?.(
      operation.operationId) || null;
    const cachedTerminal = cachedRow !== null &&
      cachedRow.completed_at !== null && cachedRow.completed_at !== undefined;
    return !this.repository.isOperationTerminal(operation) &&
      !cachedTerminal &&
      (this.repository.isReplaceRemoveDispatchPhase(operation) ||
        this.isRemoveInitialDispatchPhase(operation));
  }

  /**
   * A removal's named-target attempt (F-b): it opens only when the request
   * leaves under the still-owning operation, naming its one transferee, and
   * its answer - a delivery failure is a refusal - is applied to the
   * attempt it names.
   * @param {Object} operation
   * @param {Object} handoffRequest
   * @param {string} target
   * @param {Object} request
   * @return {Promise<Object|null>}
   */
  async dispatchRemovalHandoffAttempt(
    operation, handoffRequest, target, request) {
    if (!this.isRemovalHandoffStillOwned(operation)) {
      return null;
    }
    const attemptSeq = beginReplaceHandoffAttempt(this, operation.operationId,
      handoffRequest.requestReplicaId);
    let response = null;
    try {
      // The STEP_DOWN answer is the target's; an undelivered request has none.
      response = deliveryAnswerOf(await this.messageRouter.deliver(target, {
        ...request,
        [ReplicaOperationField.ATTEMPT_SEQ]: attemptSeq,
      }, {
        targetNodeId: handoffRequest.dispatchNodeId,
        deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
      }));
    } catch (_error) {
      response = null;
    }
    recordReplaceHandoffAnswer(this, operation.operationId, response,
      attemptSeq);
    return response;
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
    // Every remove-safety handoff is the removal leadership gate's
    // named-target attempt; the non-attempt dispatch and its evidence
    // recording are deleted (fix-f1, section 9).
    if (handoffRequest.leadershipHandoffAttempt !== true) {
      return null;
    }
    return this.dispatchRemovalHandoffAttempt(
      operation, handoffRequest, target, request);
  }

  async shouldContinueAfterRemoveSafetyHandoffResponse(
    _operation,
    removeSafetyEvaluation,
  ) {
    // E11: an answered attempt is followed by one fresh decision (the
    // leader may already be the transferee, e.g. ALREADY_LEADER); an
    // unresolved attempt then waits for its resolution.
    return removeSafetyEvaluation?.handoffRequest?.leadershipHandoffAttempt ===
      true;
  }

  // Priority BUDGET ADMISSION evidence, not a removal decision: AVAILABLE.
  async readAvailablePriorityRecoveryPlanningSnapshotForOperation(operation) {
    return this.readAvailablePriorityRecoveryPlanningSnapshot(operation);
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
