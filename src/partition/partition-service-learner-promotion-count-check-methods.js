/**
 * The inputs of the learner-side count check, and how the guard states them.
 *
 * The count check refuses a spread-cure ADD's promotion in every failing
 * nightly formation (`would_exceed_target_replica_count`,
 * `maxAllowedVotersAfterPromotion` 4) because the priority-recovery overflow
 * budget evaluated on the learner's node is 0 where the planner's grants had
 * 2. This module is the one place that reads those inputs: it evaluates each
 * source exactly once per check, in the order the check has always read them,
 * and hands the values on to the arithmetic owner
 * (learner-promotion-count-check.js) and the log renderer
 * (learner-promotion-count-check-evidence.js). No consumer re-reads a source
 * to describe a decision (quest learner-promotion-guard-inputs-observed).
 *
 * It is a methods bag composed into PartitionService beside
 * partition-service-learner-promotion-methods.js, which owns the check body,
 * the retry cadence and the progress-proof gate.
 */

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  classifySystemPartition,
  isBootstrapCriticalSystemPartitionId,
} from '../bootstrap/system-partition-classification.js';
import {
  readPriorityRecoveryPlanningAnswerOrigin,
} from '../control-plane/priority-recovery-planning-answer-origin.js';
import {
  buildLearnerPromotionCountCheckInputs,
} from './learner-promotion-count-check-evidence.js';
import {
  SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
  evaluateSpreadCureTransitionAuthorization,
} from '../rebalancer/spread-cure-transition-authorization.js';

const {
  COLUMN,
  LIFECYCLE_REASON,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  STRING,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryLearnerPromotion,
  buildPriorityRecoveryPartitionAssessment,
  getTrafficReadinessSnapshot,
  hasPriorityRecoverySpreadGap,
  resolvePriorityRecoveryActiveNodeCohort,
} = PARTITION_SERVICE_SHARED;

const PROTOTYPE_CONSTRUCTOR_NAME = 'constructor';

class PartitionServiceLearnerPromotionCountCheckMethods {
  /**
   * The local readiness view the overflow budget is gated on, read ONCE: the
   * recovery-pending bit the decision uses, together with the phase, reasons
   * and draining flag it was read from, so the guard can log the readiness the
   * decision saw rather than a second snapshot (quest
   * learner-promotion-guard-inputs-observed).
   * @return {Object} frozen readiness record
   * @private
   */
  readPriorityRecoveryReadinessForLearnerPromotion() {
    const priorityControlPlane = classifySystemPartition({
      partitionId: this.partitionId,
    }).priorityControlPlane;
    const readinessSnapshot = priorityControlPlane ?
      getTrafficReadinessSnapshot(this.metadataPublicationReadinessState) :
      null;
    const reasons = Array.isArray(readinessSnapshot?.reasons) ?
      readinessSnapshot.reasons :
      [];
    const draining = readinessSnapshot?.draining === true;
    return Object.freeze({
      snapshotPresent: Boolean(readinessSnapshot),
      phase: readinessSnapshot?.phase ?? null,
      reasons,
      draining,
      recoveryPending:
        Boolean(readinessSnapshot) &&
        !draining &&
        reasons.includes(
          LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        ),
    });
  }
  /**
   * Resolve the priority-recovery completion the count check spends its
   * overflow budget from, and return it together with every input it was
   * derived from — the readiness record, the planning answer and its stated
   * origin, the chosen priority summary, this partition's planner entry and
   * the counted operation contexts. The guard logs THESE values, so no
   * consumer re-reads a source to describe the decision (quest
   * learner-promotion-guard-inputs-observed).
   * @param {Object} options count-check counts the completion is resolved for
   * @return {Object|null} frozen {completion, ...inputs}, or null when this
   *   partition has no priority-recovery evaluation at all
   * @private
   */
  resolvePriorityRecoveryCompletionForLearnerPromotion(options = {}) {
    const nodeReadiness =
      this.readPriorityRecoveryReadinessForLearnerPromotion();
    const priorityRecoveryActive = nodeReadiness.recoveryPending;
    if (
      !classifySystemPartition({
        partitionId: this.partitionId,
      }).priorityControlPlane &&
      priorityRecoveryActive !== true
    ) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    const planningSnapshot =
      this.getPriorityRecoveryPlanningSnapshotForLearnerPromotion(
        readinessService,
      );
    const planningAnswerOrigin = readPriorityRecoveryPlanningAnswerOrigin(
      readinessService,
      this.nodeId,
    );
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary || null;
    const effectiveEligibleNodeIds = planningSnapshot ?
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds :
      [];
    const services = this.getPartitionServiceRowsForPromotion();
    const serviceLearnerNodeIds = Array.isArray(services) ?
      services
        .filter((serviceRow) =>
          this.isLearnerServiceRowForPromotion(serviceRow),
        )
        .map((serviceRow) =>
          String(serviceRow?.[COLUMN.NODE_ID] || STRING.EMPTY).trim(),
        )
        .filter((nodeId) => nodeId.length > 0) :
      [];
    const activeLearnerNodeIds =
      this.resolveActiveLearnerNodeIdsForPromotion(serviceLearnerNodeIds);
    const readinessByNodeId = {};
    for (const nodeId of activeLearnerNodeIds) {
      const readiness =
        readinessService &&
        typeof readinessService.getNodeReadinessSync ===
          PARTITION_SERVICE_TYPE.FUNCTION ?
          readinessService.getNodeReadinessSync(nodeId) :
          null;
      if (readiness && typeof readiness === PARTITION_SERVICE_TYPE.OBJECT) {
        readinessByNodeId[nodeId] = readiness;
      }
    }
    const learnerPromotion = buildPriorityRecoveryLearnerPromotion({
      activeLearnerNodeIds,
      readinessByNodeId,
      recoveryActiveNodeIds: effectiveEligibleNodeIds,
    });
    const assessment = buildPriorityRecoveryPartitionAssessment({
      partitionId: this.partitionId,
      priorityPartitionSummary,
      admission: {
        effectiveEligibleNodeIds,
        effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
        ineligibleNodes: [],
      },
      learnerPromotion,
      operationContexts:
        this.getPriorityRecoveryOperationContextsForLearnerPromotion(),
    });
    return Object.freeze({
      completion: buildPriorityRecoveryCompletion({
        assessment,
        targetReplicaCount: options.targetReplicaCount,
        activeVoterCount: options.activeVoterCount,
        learnerCount: options.learnerCount,
        priorityRecoveryActive:
          priorityRecoveryActive ||
          hasPriorityRecoverySpreadGap(priorityPartitionSummary),
      }),
      nodeReadiness,
      planningAnswer: planningSnapshot,
      planningAnswerOrigin,
      priorityPartitionSummary,
      planner: assessment.planner,
      activeOperationContexts: assessment.activeOperationContexts,
    });
  }
  /**
   * ONE evaluation of every input the count check decides on, in the read
   * order the check has always used. Nothing downstream re-reads a source to
   * describe the decision: the values logged are the values returned here
   * (quest learner-promotion-guard-inputs-observed).
   * @return {Object} frozen observation
   * @private
   */
  observeLearnerPromotionCountCheck() {
    const inFlightAddLike =
      this.collectInFlightAddLikeOperationsForPromotion();
    const inFlightAddLikeReplicaIds = inFlightAddLike.replicaIds;
    const voterCensus = this.collectActiveVoterCensusForPromotion();
    const learnerCensus = this.collectPendingLearnerCensusForPromotion();
    const promotionCounts = this.resolveLearnerPromotionCounts({
      activeVoterCount: voterCensus.count,
      learnerCount: learnerCensus.count,
      inFlightAddLikeReplicaIds,
    });
    const hasOwnedAddLikeOperation = Boolean(
      inFlightAddLikeReplicaIds &&
      inFlightAddLikeReplicaIds.size > 0 &&
      inFlightAddLikeReplicaIds.has(this.replicaId),
    );
    const target = this.resolveTargetReplicaCountForPromotion();
    const isCriticalSystemPartition = isBootstrapCriticalSystemPartitionId(
      this.partitionId,
    );
    const priorityRecovery = isCriticalSystemPartition ?
      this.resolvePriorityRecoveryCompletionForLearnerPromotion({
        targetReplicaCount: target.replicaCount,
        activeVoterCount: promotionCounts.activeVoterCount,
        learnerCount: promotionCounts.learnerCount,
      }) :
      null;
    return Object.freeze({
      activeVoterCount: promotionCounts.activeVoterCount,
      learnerCount: promotionCounts.learnerCount,
      targetReplicaCount: target.replicaCount,
      targetReplicaCountSource: target.source,
      isJoiningExistingGroup: this.isJoiningExistingGroup,
      hasOwnedAddLikeOperation,
      isCriticalSystemPartition,
      temporaryOverflowVoterBudget:
        priorityRecovery?.completion?.temporaryOverflowVoterBudget,
      voterReplicas: voterCensus.voterReplicas,
      learnerReplicaIds: learnerCensus.learnerReplicaIds,
      observedActiveVoterCount: voterCensus.count,
      observedLearnerCount: learnerCensus.count,
      inFlightAddLikeReplicaIds,
      // The row the authorization rides on, captured by the traversal above
      // and NOT read here: only the payload builder reads its steps history,
      // and only when a payload is actually built.
      ownedAddLikeOperationRow: inFlightAddLike.ownedOperationRow,
      priorityRecovery,
    });
  }
  /**
   * The spread-cure transition authorization this operation carried, decoded
   * from the row the in-flight add-like check already read, and evaluated
   * against this replica's own operation, node, replica and declared
   * replication factor.
   *
   * It decides NOTHING: the count check's grant, deferral, reason, cap,
   * allowances and recheck are already settled when this runs, and the
   * result is stated in the log payload only (quest
   * critical-spread-transition-authority-carry).
   *
   * It READS nothing either. Every value it evaluates against is one the
   * count check already held: the operation row from the in-flight add-like
   * traversal, this replica's own identity, and the target the count check
   * decided on. In particular it supplies NO membership publication epoch
   * (lead ruling 2026-09-19 on the sealed one-evaluation constraint), so the
   * binding owner's membership fence is not evaluated at this stage and says
   * so as its own named outcome. On no path does this add a read.
   * @param {Object} observation the one evaluation's inputs
   * @param {Object} decision the count check's own outcome record
   * @return {Object} frozen {binding, partitionMembershipEpoch, evaluation}
   * @private
   */
  resolveSpreadCureTransitionAuthorizationForPromotion(observation, decision) {
    const operationRow = observation.ownedAddLikeOperationRow;
    const binding =
      decodeSpreadCureTransitionAuthorizationFromOperationRow(operationRow);
    return Object.freeze({
      binding,
      partitionMembershipEpoch: SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
      evaluation: evaluateSpreadCureTransitionAuthorization({
        binding,
        // The ROW's own id, not the record's: a record naming a different
        // operation than the row it rides on is exactly what the
        // operation-mismatch reason exists to catch.
        operationId: operationRow?.[COLUMN.OPERATION_ID] ?? null,
        localNodeId: this.nodeId,
        localReplicaId: this.replicaId,
        partitionDesiredReplicationFactor: observation.targetReplicaCount,
        votersAfterPromotion: decision?.votersAfterPromotion,
      }),
    });
  }
  /**
   * The one log payload of one count check, built where it is logged: on a
   * refusal, and on the first pass of a learner. A later pass builds none,
   * so it costs nothing at all.
   * @param {Object} observation the one evaluation's inputs
   * @param {Object} decision the count check's own outcome record
   * @return {Object} frozen log payload
   * @private
   */
  buildLearnerPromotionCountCheckPayload(observation, decision) {
    return buildLearnerPromotionCountCheckInputs({
      ...observation,
      decision,
      authorization:
        this.resolveSpreadCureTransitionAuthorizationForPromotion(
          observation,
          decision,
        ),
    });
  }
  /**
   * The FIRST count-check pass of this learner states the same inputs a
   * refusal does, so a granted promotion is as readable as a refused one.
   * Once per learner: the pass path repeats on the retry cadence and this is
   * diagnosis, not a decision.
   * The counts and the cap live INSIDE the payload here, never as top-level
   * fields: a consumer that discriminates promotion-deferral lines by the
   * presence of a top-level maxAllowedVotersAfterPromotion must keep seeing
   * only refusals.
   * @param {Object} observation the one evaluation's inputs
   * @param {Object} decision the count check's own outcome record
   * @return {void}
   * @private
   */
  logFirstLearnerPromotionCountCheckPass(observation, decision) {
    if (this.learnerPromotionCountCheckInputsLogged === true) {
      return;
    }
    this.learnerPromotionCountCheckInputsLogged = true;
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_COUNT_CHECK_INPUTS,
      {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        countCheckInputs:
          this.buildLearnerPromotionCountCheckPayload(observation, decision),
      },
    );
  }
}

function createPartitionServiceLearnerPromotionCountCheckMethods() {
  const methods = {};
  const prototypeNames = Object.getOwnPropertyNames(
    PartitionServiceLearnerPromotionCountCheckMethods.prototype,
  );
  for (const name of prototypeNames) {
    if (name !== PROTOTYPE_CONSTRUCTOR_NAME) {
      methods[name] =
        PartitionServiceLearnerPromotionCountCheckMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceLearnerPromotionCountCheckMethods};
