import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OperationWorkflowOwnerSegment5} from './operation-workflow-owner-segment-5.js';
import {
  buildPriorityRemoveSafetyRecoveryProjectionNodeIds,
  resolvePriorityRemoveSafetyMembershipSnapshot,
} from './operation-workflow-remove-safety-membership.js';
import {
  resolvePriorityPublicationReplacementLeaderCandidateState,
  resolvePriorityPublicationReplacementLeaderCandidateAction,
  resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds,
  PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE,
  PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION,
} from './operation-workflow-replacement-leader-state.js';
import {
  hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound,
  resolvePriorityPublicationReplacementLeaderCandidateRow,
} from './operation-workflow-replacement-leader-resolution.js';
import {
  applyObservedOperationState,
  adoptMostAdvancedObservedReplaceState,
} from './operation-workflow-observed-state.js';
import {
  replayReplaceActiveSourceRemovalFromAuthoritative,
  replayReplaceActiveSourceRemovalFromObservedTarget,
} from './operation-workflow-replace-replay.js';
import {
  buildPriorityRecoverySupersededTargetError,
  getPriorityRecoverySupersededTargetErrorFromContext,
  getPriorityRecoverySupersededTargetError,
} from './operation-workflow-priority-recovery-errors.js';
import {
  evaluatePriorityRecoveryCompletionRemoveSafety,
  evaluatePriorityPublishedMembershipRemoveSafety,
  evaluateRemoveSafety,
} from './operation-workflow-remove-safety-evaluator.js';

const {
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS,
  TYPEOF,
  WORKFLOW_STEP,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryOperationAssessment,
  getWorkflowSteps,
  hasPriorityRecoverySpreadGap,
  isPriorityControlPlanePartition,
  normalizeNodeIdList,
  resolvePriorityRecoveryActiveNodeCohort,
} = OPERATION_WORKFLOW_OWNER_SHARED;

class OperationWorkflowOwnerSegment6 extends OperationWorkflowOwnerSegment5 {
  buildPriorityRecoveryAssessmentContextForOperation(
    operation,
    planningSnapshot,
  ) {
    if (
      !operation ||
      !planningSnapshot ||
      typeof planningSnapshot !== TYPEOF.OBJECT
    ) {
      return null;
    }

    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary &&
      typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
        planningSnapshot.priorityPartitionSummary :
        null;
    const decisionSnapshot =
      this.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId || operation.entityId || '',
        [operation],
        planningSnapshot,
      );
    const effectiveEligibleNodeIds = normalizeNodeIdList(
      decisionSnapshot?.admission?.effectiveEligibleNodeIds ||
        resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    );
    const completion =
      decisionSnapshot?.completion ||
      buildPriorityRecoveryCompletion({
        assessment: buildPriorityRecoveryOperationAssessment({
          operation,
          priorityPartitionSummary,
          effectiveEligibleNodeIds,
        }),
        priorityRecoveryActive: hasPriorityRecoverySpreadGap(
          priorityPartitionSummary,
        ),
      });
    return Object.freeze({
      decisionSnapshot,
      completion,
      effectiveEligibleNodeIds: Object.freeze([...effectiveEligibleNodeIds]),
      planningSnapshot,
      priorityPartitionSummary,
    });
  }

  /**
   * Resolve the canonical priority-recovery completion outcome for the
   * operation currently under safety evaluation.
   *
   * Source-removal safety must consume the shared completion contract instead
   * of rebuilding partial spread truth from publication rows alone.
   *
   * @param {Object} operation
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   */
  buildPriorityRecoveryCompletionForOperation(operation, planningSnapshot) {
    const context = this.buildPriorityRecoveryAssessmentContextForOperation(
      operation,
      planningSnapshot,
    );
    return context?.completion || null;
  }

  /**
   * @param {Object|null} planningSnapshot
   * @return {string[]}
   * @private
   */
  buildPriorityRemoveSafetyRecoveryProjectionNodeIds(planningSnapshot) {
    return buildPriorityRemoveSafetyRecoveryProjectionNodeIds(planningSnapshot);
  }

  /**
   * Remove safety must consume one canonical membership snapshot instead of
   * locally switching between durable published rows and fresher recovery
   * projection evidence.
   *
   * If the planning owner already projects every currently voter-ready node,
   * that recovery projection remains authoritative even after the summary says
   * spread is satisfied while the last published membership row still lags.
   *
   * @param {Object|null} planningSnapshot
   * @param {Object|null} priorityRecoveryContext
   * @param {Object[]} projectedVoterReadyRows
   * @return {Object}
   * @private
   */
  resolvePriorityRemoveSafetyMembershipSnapshot(
    planningSnapshot,
    priorityRecoveryContext,
    projectedVoterReadyRows,
  ) {
    return resolvePriorityRemoveSafetyMembershipSnapshot(
      planningSnapshot,
      priorityRecoveryContext,
      projectedVoterReadyRows,
    );
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   */
  isPriorityRecoverySupersededTargetFailureApplicable(
    operation,
  ) {
    if (
      !operation ||
      (operation.type !== OperationType.ADD &&
        operation.type !== OperationType.REPLACE)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Source-removal safety should defer only while the shared completion
   * contract remains blocked. Once priority recovery is canonically
   * `spread_satisfied_in_flight`, the remove gate must stop restating the
   * same concern from projected-count math.
   *
   * @param {Object|null} completion
   * @return {boolean}
   */
  isPriorityRecoveryRemoveSafetySatisfied(completion) {
    if (!completion || typeof completion !== TYPEOF.OBJECT) {
      return false;
    }
    if (
      completion.state ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED
    ) {
      return false;
    }
    return completion.blocked !== true;
  }

  /**
   * Critical priority source-removal safety must not restate stale local
   * voter-ready count math once the shared completion owner already reports a
   * non-blocked recovery outcome for the current operation.
   *
   * The replacement target still has to be voter-ready before this short
   * circuit is allowed to proceed.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async evaluatePriorityRecoveryCompletionRemoveSafety(operation) {
    return evaluatePriorityRecoveryCompletionRemoveSafety(this, operation);
  }

  /**
   * @param {Object} operation
   * @return {Promise<string|null>}
   * @private
   */
  async getPriorityRecoverySupersededTargetError(operation) {
    return getPriorityRecoverySupersededTargetError(this, operation);
  }

  /**
   * @param {Object} operation
   * @param {Object|null} priorityRecoveryContext
   * @return {string|null}
   * @private
   */
  getPriorityRecoverySupersededTargetErrorFromContext(
    operation,
    priorityRecoveryContext,
  ) {
    return getPriorityRecoverySupersededTargetErrorFromContext(
      this,
      operation,
      priorityRecoveryContext,
    );
  }

  /**
   * @param {Object} operation
   * @param {string} targetNodeId
   * @param {string[]} eligibleNodeIds
   * @return {string}
   * @private
   */
  buildPriorityRecoverySupersededTargetError(
    operation,
    targetNodeId,
    eligibleNodeIds,
  ) {
    return buildPriorityRecoverySupersededTargetError(
      operation,
      targetNodeId,
      eligibleNodeIds,
    );
  }

  /**
   * @param {Object} operation
   * @param {Object[]} projectedVoterReadyRows
   * @return {Promise<Object>}
   * @private
   */
  async evaluatePriorityPublishedMembershipRemoveSafety(
    operation,
    projectedVoterReadyRows,
  ) {
    return evaluatePriorityPublishedMembershipRemoveSafety(
      this,
      operation,
      projectedVoterReadyRows,
    );
  }

  /**
   * @return {Object}
   * @private
   */
  buildSafeRemoveSafetyEvaluation() {
    return Object.freeze({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
      deferReason: null,
      error: null,
      handoffRequest: null,
    });
  }

  /**
   * @param {string} error
   * @param {string} deferReason
   * @param {Object} [options]
   * @return {Object}
   * @private
   */
  buildDeferredRemoveSafetyEvaluation(error, deferReason, options = {}) {
    return Object.freeze({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
      deferReason,
      error,
      handoffFailureError: options?.handoffFailureError || error,
      handoffFailurePolicy:
        options?.handoffFailurePolicy ||
        REMOVE_SAFETY_HANDOFF_FAILURE_POLICY.NONE,
      handoffRequest: options?.handoffRequest || null,
    });
  }

  /**
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildFailedRemoveSafetyEvaluation(error) {
    return Object.freeze({
      classification: REMOVE_SAFETY_EVALUATION_CLASSIFICATION.FAIL,
      deferReason: null,
      error,
      handoffRequest: null,
    });
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @return {Promise<string|null>}
   * @private
   */
  async resolveRemoveSafetyDeferredReason(operation, replaceRemovePhase) {
    if (!operation) {
      return null;
    }
    if (operation.type === OperationType.REPLACE && replaceRemovePhase) {
      return REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED;
    }
    if (
      operation.type !== OperationType.REMOVE ||
      !(await this.isCriticalRemoveOverReplicated(operation))
    ) {
      return null;
    }
    return REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED;
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {Promise<Object>}
   * @private
   */
  async buildDeferredRemoveSafetyEvaluationForOperation(
    operation,
    errorMessage,
    options = {},
  ) {
    const replaceRemovePhase = this.repository.isReplaceRemovePhase(operation);
    const deferReason = await this.resolveRemoveSafetyDeferredReason(
      operation,
      replaceRemovePhase,
    );
    if (!deferReason) {
      return this.buildFailedRemoveSafetyEvaluation(errorMessage);
    }
    return this.buildDeferredRemoveSafetyEvaluation(
      errorMessage,
      deferReason,
      options,
    );
  }

  /**
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isReplaceSourceLeaderHandoffRequiredPartition(partitionId) {
    return (
      typeof partitionId === TYPEOF.STRING &&
      REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS.has(partitionId)
    );
  }

  /**
   * @param {Object} options
   * @return {string}
   * @private
   */
  resolvePriorityPublicationReplacementLeaderCandidateState(options = {}) {
    return resolvePriorityPublicationReplacementLeaderCandidateState(options);
  }

  /**
   * @param {string} state
   * @return {string}
   * @private
   */
  resolvePriorityPublicationReplacementLeaderCandidateAction(state) {
    return resolvePriorityPublicationReplacementLeaderCandidateAction(state);
  }

  resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds(
    electionEvidence,
    candidateRows,
    hasReplacementLeaderOwnership,
  ) {
    return resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds(
      electionEvidence,
      candidateRows,
      hasReplacementLeaderOwnership,
      (row) => this.getReplicaRowIdentity(row),
    );
  }

  hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
    operation,
    currentVoterReadyRows,
    operationReplicaId,
    replacementReplicaRow,
  ) {
    return hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
      this,
      operation,
      currentVoterReadyRows,
      operationReplicaId,
      replacementReplicaRow,
    );
  }

  /**
   * @param {Object} operation
   * @param {Object|null} replacementReplicaRow
   * @param {Object[]} currentVoterReadyRows
   * @param {string|null} operationReplicaId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolvePriorityPublicationReplacementLeaderCandidateRow(
    operation,
    replacementReplicaRow,
    currentVoterReadyRows,
    operationReplicaId,
  ) {
    return resolvePriorityPublicationReplacementLeaderCandidateRow(
      this,
      operation,
      replacementReplicaRow,
      currentVoterReadyRows,
      operationReplicaId,
    );
  }

  /**
   * Evaluate safety validation for REMOVE operations.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async evaluateRemoveSafety(operation) {
    return evaluateRemoveSafety(this, operation);
  }

  /**
   * @param {Object} operation
   * @param {Object|null} replacementReplicaRow
   * @return {boolean}
   * @private
   */
  isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
    operation,
    replacementReplicaRow,
  ) {
    return (
      operation?.type === OperationType.REPLACE &&
      operation?.workflowStep === WORKFLOW_STEP.ACTIVE &&
      isPriorityControlPlanePartition({
        partitionId: operation?.partitionId,
      }) &&
      this.isVoterReadyReplicaTopology(replacementReplicaRow)
    );
  }

  /**
   * Get safety validation error for REMOVE operations.
   * @param {Object} operation
   * @return {Promise<string|null>}
   */
  async getRemoveSafetyError(operation) {
    const evaluation = await this.evaluateRemoveSafety(operation);
    return evaluation?.error || null;
  }

  /**
   * Replay REPLACE source-removal from the authoritative row when the local
   * reconcile input is stale at SYNCING but the durable workflow already
   * advanced to ACTIVE on the canonical active-phase owner.
   *
   * This closes the gap where cache-lagged timeout reconciliation observes the
   * target as ACTIVE, replays the ACTIVE transition idempotently, but never
   * re-dispatches source removal because the local row has not caught up.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async replayReplaceActiveSourceRemovalFromAuthoritative(operation) {
    return replayReplaceActiveSourceRemovalFromAuthoritative(this, operation);
  }

  /**
   * Replay REPLACE source-removal from observed target ACTIVE evidence when
   * the durable ACTIVE transition is retryably backpressured.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async replayReplaceActiveSourceRemovalFromObservedTarget(operation) {
    return replayReplaceActiveSourceRemovalFromObservedTarget(this, operation);
  }

  /**
   * @param {Object} operation
   * @return {number}
   * @private
   */
  getOperationWorkflowStepRank(operation) {
    const steps = getWorkflowSteps(operation?.type);
    const workflowStep =
      operation?.workflowStep ?? operation?.workflow_step ?? null;
    if (
      !Array.isArray(steps) ||
      steps.length === NUM.ZERO ||
      typeof workflowStep !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING
    ) {
      return NUM.NEGATIVE_ONE;
    }
    return steps.indexOf(workflowStep);
  }

  /**
   * @param {Object} targetOperation
   * @param {Object} sourceOperation
   * @return {void}
   * @private
   */
  applyObservedOperationState(targetOperation, sourceOperation) {
    applyObservedOperationState(this, targetOperation, sourceOperation);
  }

  /**
   * Prefer the most advanced observed state for a REPLACE operation before
   * replaying active-phase reconciliation, so stale SYNCING rows cannot
   * overwrite a newer STOPPING/REMOVED state.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async adoptMostAdvancedObservedReplaceState(operation) {
    return adoptMostAdvancedObservedReplaceState(this, operation);
  }

  /**
   * Reconcile a REPLACE operation after the target replica has become ACTIVE.
   * Prefer already-observed STOPPING/REMOVED state before committing another
   * ACTIVE transition from a stale local SYNCING row.
   *
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileReplaceActualActive(operation) {
    const observedOperation =
      await this.adoptMostAdvancedObservedReplaceState(operation);
    if (observedOperation) {
      if (this.repository.isOperationTerminal(operation)) {
        return true;
      }
      if (operation.workflowStep === WORKFLOW_STEP.STOPPING) {
        await this.reconcileOperationProgress(operation);
        return true;
      }
      if (operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
        const replaceResumeResult =
          await this.executeOperationFromReconcilePath(operation);
        if (replaceResumeResult?.skipped === true) {
          this.ensurePriorityActiveReplaceRetryArmed(operation);
        }
        return true;
      }
    }

    let activeTransitionCommitted = false;
    try {
      activeTransitionCommitted = await this.updateStep(
        operation,
        WORKFLOW_STEP.ACTIVE,
      );
    } catch (error) {
      if (
        await this.replayReplaceActiveSourceRemovalFromObservedTarget(operation)
      ) {
        return true;
      }
      throw error;
    }
    if (activeTransitionCommitted) {
      const replaceResumeResult =
        await this.executeOperationFromReconcilePath(operation);
      if (replaceResumeResult?.skipped === true) {
        this.ensurePriorityActiveReplaceRetryArmed(operation);
      }
      return true;
    }
    // CL-029: an uncommitted CAS (stale read) followed by a replay that
    // found nothing actionable means the ACTIVE evidence was NOT applied;
    // report it so the caller keeps a retry owner instead of dropping the
    // completion silently.
    return (
      await this.replayReplaceActiveSourceRemovalFromAuthoritative(operation)
    ) === true;
  }

  /**
   * Evaluate safety error for a move intent.
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    if (!move) {
      return null;
    }
    const normalizedType =
      typeof move.type === 'string' ? move.type.toUpperCase() : move.type;
    const operation = {
      type: normalizedType,
      partitionId: move.partitionId || move.entityId,
      replicaId: move.replicaId,
      targetNodeId: move.nodeId,
      workflowStep: WORKFLOW_STEP.PENDING,
    };
    return this.getRemoveSafetyError(operation);
  }
}

export {OperationWorkflowOwnerSegment6};
