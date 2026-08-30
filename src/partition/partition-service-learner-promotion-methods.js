import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  classifySystemPartition,
  isBootstrapCriticalSystemPartitionId,
} from '../bootstrap/system-partition-classification.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  validateLearnerPromotionProofResponse,
} from '../raft/learner-promotion-progress.js';
import {filterSharedRows} from '../cache/shared-row-read.js';

const {
  ACTIVE_VOTER_ROLES,
  ADD_LIKE_REPLICA_OPERATION_TYPES,
  COLUMN,
  LIFECYCLE_REASON,
  PARTITION_REPLICA_COUNT_FIELD,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LEARNER_PROMOTION_WAKE_REASONS,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  RaftRole,
  ReplicaStatus,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TERMINAL_STATUSES,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryLearnerPromotion,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  getTrafficReadinessSnapshot,
  hasPriorityRecoverySpreadGap,
  resolvePriorityRecoveryActiveNodeCohort,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceLearnerPromotionMethods {
  /**
   * Schedule the next learner promotion check. The check is progress-proven
   * by the current leader; this cadence is ONLY the retry/backoff input —
   * elapsed time never satisfies promotion (quest
   * learner-promotion-progress-proof). A wake reason (own services row
   * visible, published epoch changed) arms the same single timer now; the
   * cadence stays the floor and the fallback (quest
   * learner-promotion-proof-channel-wake).
   * @private
   */
  scheduleLearnerPromotion(
    scheduleReason = PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
  ) {
    if (this.learnerPromotionTimer) {
      return;
    }
    if (this.isShutdown) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN,
        {
          partitionId: this.partitionId,
          timer: PARTITION_SERVICE_LITERAL.LEARNERPROMOTIONTIMER,
        },
      );
      return;
    }
    const delayMs =
      PARTITION_SERVICE_LEARNER_PROMOTION_WAKE_REASONS.has(scheduleReason) ?
        PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_WAKE_DELAY_MS :
        this.learnerCatchUpCheckIntervalMs;
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      delayMs,
      scheduleReason,
    });
    this.learnerPromotionTimer = setTimeout(() => {
      Promise.resolve(this.checkLearnerPromotion()).catch((error) => {
        this.logger.warn(
          PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED,
          {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            reason: PARTITION_SERVICE_LITERAL.PROMOTION_CHECK_FAILED,
            error: error.message,
          },
        );
        this.scheduleLearnerPromotion(
          PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON
            .DEFERRED_RECHECK,
        );
      });
    }, delayMs);
  }
  isPriorityRecoveryPendingForLearnerPromotion() {
    if (!classifySystemPartition({
      partitionId: this.partitionId,
    }).priorityControlPlane) {
      return false;
    }
    const readinessSnapshot = getTrafficReadinessSnapshot(
      this.metadataPublicationReadinessState,
    );
    if (!readinessSnapshot || readinessSnapshot.draining === true) {
      return false;
    }
    const reasons = Array.isArray(readinessSnapshot.reasons) ?
      readinessSnapshot.reasons :
      [];
    return reasons.includes(
      LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    );
  }
  getPriorityRecoveryPlanningSnapshotForLearnerPromotion() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService) {
      return null;
    }
    const observedAt = Date.now();
    if (
      typeof readinessService.getPriorityRecoveryPlanningAnswerSync ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return (
        readinessService.getPriorityRecoveryPlanningAnswerSync(
          this.nodeId,
          observedAt,
        ) || null
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningAnswerSync ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return (
        readinessService.getMembershipPublicationPlanningAnswerSync(
          this.nodeId,
          observedAt,
        ) || null
      );
    }
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotSync ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return (
        readinessService.getPriorityRecoveryPlanningSnapshotSync(
          this.nodeId,
          observedAt,
        ) || null
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotSync ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return (
        readinessService.getMembershipPublicationPlanningSnapshotSync(
          this.nodeId,
          observedAt,
        ) || null
      );
    }
    return null;
  }
  getPriorityRecoveryOperationContextsForLearnerPromotion() {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return [];
    }
    const operationRows = filterSharedRows(
      this.systemTableCache,
      TABLES.REPLICA_OPERATIONS,
      (operationRow) => {
        if (!operationRow || operationRow.partition_id !== this.partitionId) {
          return false;
        }
        const operationStatus = String(
          operationRow.status ??
            operationRow.operation_status ??
            operationRow.operationStatus ??
            STRING.EMPTY,
        ).toLowerCase();
        return !TERMINAL_STATUSES.includes(operationStatus);
      },
    );
    if (!Array.isArray(operationRows) || operationRows.length === 0) {
      return [];
    }
    return operationRows
      .map((operationRow) =>
        buildPriorityRecoveryOperationContextFromRecord(operationRow),
      )
      .filter(
        (operationContext) =>
          operationContext && typeof operationContext === 'object',
      );
  }
  getPartitionServiceRowsForPromotion() {
    return filterSharedRows(
      this.systemTableCache,
      TABLES.SERVICES,
      (serviceRow) => {
        return (
          serviceRow?.[COLUMN.PARTITION_ID] === this.partitionId &&
            serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION
        );
      },
    );
  }
  getReplicaServiceStatusForPromotion(serviceRow) {
    return serviceRow?.[COLUMN.STATUS] || ReplicaStatus.ACTIVE;
  }
  isLiveReplicaServiceRowForPromotion(serviceRow) {
    const status = this.getReplicaServiceStatusForPromotion(serviceRow);
    return (
      status !== ReplicaStatus.FAILED &&
      status !== ReplicaStatus.REMOVING &&
      status !== ReplicaStatus.REMOVED
    );
  }
  isLocalReplicaServiceRowForPromotion(serviceRow) {
    const localReplicaId = String(this.replicaId || STRING.EMPTY).trim();
    const serviceReplicaId = String(
      serviceRow?.[COLUMN.REPLICA_ID] ||
        serviceRow?.[COLUMN.SERVICE_ID] ||
        STRING.EMPTY,
    ).trim();
    const localNodeId = String(this.nodeId || STRING.EMPTY).trim();
    const serviceNodeId = String(
      serviceRow?.[COLUMN.NODE_ID] || STRING.EMPTY,
    ).trim();
    const replicaMatches =
      localReplicaId.length > 0 && serviceReplicaId === localReplicaId;
    const nodeMatches =
      localNodeId.length > 0 && serviceNodeId === localNodeId;
    return replicaMatches || nodeMatches;
  }
  getReplicaServiceRowReplicaIdForPromotion(serviceRow) {
    return String(
      serviceRow?.[COLUMN.REPLICA_ID] ||
        serviceRow?.[COLUMN.SERVICE_ID] ||
        STRING.EMPTY,
    ).trim();
  }
  isLearnerServiceRowForPromotion(serviceRow) {
    return (
      this.isLiveReplicaServiceRowForPromotion(serviceRow) &&
      isCatchupLearnerRaftRole(serviceRow?.[COLUMN.RAFT_ROLE])
    );
  }
  isActiveVoterServiceRowForPromotion(serviceRow) {
    const raftRole = serviceRow?.[COLUMN.RAFT_ROLE];
    return (
      this.isLiveReplicaServiceRowForPromotion(serviceRow) &&
      ACTIVE_VOTER_ROLES.has(raftRole)
    );
  }
  resolveOperationScopedLearnerCountForPromotion(inFlightAddLikeReplicaIds) {
    const operationReplicaIds =
      inFlightAddLikeReplicaIds instanceof Set ?
        inFlightAddLikeReplicaIds :
        new Set();
    if (operationReplicaIds.size === 0) {
      return {scopeActive: false, learnerCount: 0};
    }
    let learnerCount = 0;
    const serviceRows = this.getPartitionServiceRowsForPromotion();
    const operationScopedLearnerRows = serviceRows.filter((serviceRow) => {
      const serviceReplicaId =
        this.getReplicaServiceRowReplicaIdForPromotion(serviceRow);
      return (
        this.isLearnerServiceRowForPromotion(serviceRow) &&
        operationReplicaIds.has(serviceReplicaId)
      );
    });
    for (const serviceRow of operationScopedLearnerRows) {
      const serviceReplicaId =
        this.getReplicaServiceRowReplicaIdForPromotion(serviceRow);
      if (operationReplicaIds.has(serviceReplicaId)) {
        learnerCount++;
      }
    }
    const localReplicaId = String(this.replicaId || STRING.EMPTY).trim();
    const localLearnerRowVisible = operationScopedLearnerRows.some(
      (serviceRow) => this.isLocalReplicaServiceRowForPromotion(serviceRow),
    );
    if (
      isCatchupLearnerRaftRole(this.role) &&
      localReplicaId.length > 0 &&
      operationReplicaIds.has(localReplicaId) &&
      !localLearnerRowVisible
    ) {
      learnerCount++;
    }
    return {scopeActive: true, learnerCount};
  }
  resolveLearnerPromotionCounts(observedCounts = {}) {
    const observedActiveVoterCount = Number.isFinite(
      observedCounts.activeVoterCount,
    ) ?
      observedCounts.activeVoterCount :
      0;
    const observedLearnerCount = Number.isFinite(observedCounts.learnerCount) ?
      observedCounts.learnerCount :
      0;
    const operationScopedLearnerCount =
      this.resolveOperationScopedLearnerCountForPromotion(
        observedCounts.inFlightAddLikeReplicaIds,
      );
    const baseLearnerCount = operationScopedLearnerCount.scopeActive ?
      operationScopedLearnerCount.learnerCount :
      observedLearnerCount;
    if (!isCatchupLearnerRaftRole(this.role)) {
      return {
        activeVoterCount: observedActiveVoterCount,
        learnerCount: baseLearnerCount,
      };
    }
    const localReplicaRows = this.getPartitionServiceRowsForPromotion().filter(
      (serviceRow) => this.isLocalReplicaServiceRowForPromotion(serviceRow),
    );
    const localLearnerRowVisible = localReplicaRows.some((serviceRow) =>
      this.isLearnerServiceRowForPromotion(serviceRow),
    );
    const localVoterRowVisible = localReplicaRows.some((serviceRow) =>
      this.isActiveVoterServiceRowForPromotion(serviceRow),
    );
    const learnerCount =
      localLearnerRowVisible || operationScopedLearnerCount.scopeActive ?
        baseLearnerCount :
        baseLearnerCount + 1;
    const activeVoterCount = localVoterRowVisible ?
      Math.max(observedActiveVoterCount - 1, 0) :
      observedActiveVoterCount;
    return {activeVoterCount, learnerCount};
  }
  resolveActiveLearnerNodeIdsForPromotion(serviceLearnerNodeIds) {
    const learnerNodeIds = Array.isArray(serviceLearnerNodeIds) ?
      [...serviceLearnerNodeIds] :
      [];
    const localNodeId = String(this.nodeId || STRING.EMPTY).trim();
    if (
      !isCatchupLearnerRaftRole(this.role) ||
      localNodeId.length === 0 ||
      learnerNodeIds.includes(localNodeId)
    ) {
      return learnerNodeIds;
    }
    return [...learnerNodeIds, localNodeId];
  }
  resolvePriorityRecoveryCompletionForLearnerPromotion(options = {}) {
    const priorityRecoveryActive =
      this.isPriorityRecoveryPendingForLearnerPromotion();
    if (
      !classifySystemPartition({
        partitionId: this.partitionId,
      }).priorityControlPlane &&
      priorityRecoveryActive !== true
    ) {
      return null;
    }
    const planningSnapshot =
      this.getPriorityRecoveryPlanningSnapshotForLearnerPromotion();
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary || null;
    const effectiveEligibleNodeIds = planningSnapshot ?
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds :
      [];
    const services = this.getPartitionServiceRowsForPromotion();
    const readinessService = this.controlPlaneReadinessService;
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
    return buildPriorityRecoveryCompletion({
      assessment,
      targetReplicaCount: options.targetReplicaCount,
      activeVoterCount: options.activeVoterCount,
      learnerCount: options.learnerCount,
      priorityRecoveryActive:
        priorityRecoveryActive ||
        hasPriorityRecoverySpreadGap(priorityPartitionSummary),
    });
  }
  becomeFollower() {
    this.role = RaftRole.FOLLOWER;
    this.isLeader = false;
    this.isJoiningExistingGroup = false;
    this.queueRoleUpdate(RaftRole.FOLLOWER);
    this.startElection();
  }
  /**
   * Check if learner can be promoted to follower.
   * Promotion happens only when ALL of the following hold:
   * 1. A leader has been discovered for the group
   * 2. Promoting would stay within the partition's configured replica count,
   *    allowing at most one temporary replacement voter above target
   * 3. Promoting would not result in an even number of voters (prevents split votes)
   *    unless this is the single temporary replacement voter or all pending
   *    learners together would reach an odd count within target
   * 4. The CURRENT leader proves this learner has applied through the safe
   *    promotion index (the leader's committed index at proof time) for the
   *    current term and membership epoch, and that proof still matches the
   *    local observation after the round trip (quest
   *    learner-promotion-progress-proof). Elapsed time is only the retry
   *    cadence; every refusal defers and reschedules.
   * @return {Promise<void>}
   * @private
   */
  async checkLearnerPromotion() {
    this.learnerPromotionTimer = null;
    this.learnerPromotionWake.checkInFlight = true;
    try {
      await this.runLearnerPromotionCheck();
    } finally {
      // Single-flight: wakes that arrived during this check drain into at
      // most one immediate re-check now that it has completed.
      this.drainLearnerPromotionWake();
    }
  }
  /**
   * The check body (gates in order); every deferral reschedules.
   * @return {Promise<void>}
   * @private
   */
  async runLearnerPromotionCheck() {
    if (!isCatchupLearnerRaftRole(this.role)) {
      return;
    }
    if (!this.leaderId) {
      this.leaderId =
        this.resolveLeaderIdFromMetadata() ||
        this.resolveLeaderIdFromHint() ||
        null;
    }
    if (!this.leaderId) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        reason: PARTITION_SERVICE_LITERAL.LEADER_NOT_DISCOVERED,
      });
      this.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
      );
      return;
    }
    const inFlightAddLikeReplicaIds =
      this.getInFlightAddLikeOperationReplicaIds();
    const promotionCounts = this.resolveLearnerPromotionCounts({
      activeVoterCount: this.countActiveVoters(),
      learnerCount: this.countPendingLearners(),
      inFlightAddLikeReplicaIds,
    });
    const activeVoterCount = promotionCounts.activeVoterCount;
    const learnerCount = promotionCounts.learnerCount;
    const hasOwnedAddLikeOperation = Boolean(
      inFlightAddLikeReplicaIds &&
      inFlightAddLikeReplicaIds.size > 0 &&
      inFlightAddLikeReplicaIds.has(this.replicaId),
    );
    const targetReplicaCount = this.getTargetReplicaCountForPromotion();
    const isCriticalSystemPartition = isBootstrapCriticalSystemPartitionId(
      this.partitionId,
    );
    const singleReplacementPromotionAllowed =
      (this.isJoiningExistingGroup === true || hasOwnedAddLikeOperation) &&
      learnerCount === 1 &&
      activeVoterCount >= targetReplicaCount;
    const operationOwnedCriticalReplacementPromotionAllowed =
      isCriticalSystemPartition &&
      hasOwnedAddLikeOperation &&
      activeVoterCount >= targetReplicaCount;
    const replacementPromotionAllowed =
      singleReplacementPromotionAllowed ||
      operationOwnedCriticalReplacementPromotionAllowed;
    const singleVoterExpansionPromotionAllowed =
      this.isJoiningExistingGroup === true &&
      learnerCount === 1 &&
      activeVoterCount === 1;
    const priorityRecoveryCompletion = isCriticalSystemPartition ?
      this.resolvePriorityRecoveryCompletionForLearnerPromotion({
        targetReplicaCount,
        activeVoterCount,
        learnerCount,
      }) :
      null;
    const priorityRecoveryAdditionalVotersAllowed =
      isCriticalSystemPartition &&
      Number.isFinite(priorityRecoveryCompletion?.temporaryOverflowVoterBudget) ?
        priorityRecoveryCompletion.temporaryOverflowVoterBudget :
        0;
    const priorityRecoveryOverflowPromotionAllowed =
      priorityRecoveryAdditionalVotersAllowed > 0;
    const maxAllowedVotersAfterPromotion =
      targetReplicaCount +
      (replacementPromotionAllowed || singleVoterExpansionPromotionAllowed ?
        1 :
        0) +
      priorityRecoveryAdditionalVotersAllowed;
    const votersAfterPromotion = activeVoterCount + 1;
    const wouldExceedTargetReplicaCount =
      votersAfterPromotion > maxAllowedVotersAfterPromotion;
    const wouldBeEven = votersAfterPromotion % 2 === 0;
    const votersAfterAllLearners = activeVoterCount + learnerCount;
    const allLearnersWouldBeOdd = votersAfterAllLearners % 2 === 1;
    const allLearnersWithinTarget =
      votersAfterAllLearners <= targetReplicaCount;
    if (
      wouldExceedTargetReplicaCount ||
      (wouldBeEven &&
        !replacementPromotionAllowed &&
        !singleVoterExpansionPromotionAllowed &&
        !priorityRecoveryOverflowPromotionAllowed &&
        !(allLearnersWouldBeOdd && allLearnersWithinTarget))
    ) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        reason: wouldExceedTargetReplicaCount ?
          PARTITION_SERVICE_LITERAL.WOULD_EXCEED_TARGET_REPLICA_COUNT :
          PARTITION_SERVICE_LITERAL.WOULD_CAUSE_EVEN_VOTER_COUNT,
        activeVoterCount,
        learnerCount,
        targetReplicaCount,
        maxAllowedVotersAfterPromotion,
      });
      this.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
      );
      return;
    }
    // Progress proof: the current leader must prove this learner applied
    // through the safe promotion index for the current term and membership
    // epoch. Runs LAST so the cheap local quorum-shape gates above never pay
    // the round trip, and the proof is validated against the freshest local
    // observation (leader identity, epoch, role) after it returns.
    await this.applyLearnerPromotionProofGate();
  }
  /**
   * The progress-proof gate itself: request the proof from the discovered
   * leader, fail-closed validate it against the post-round-trip local
   * observation, and only then promote. Every refusal defers with a typed
   * reason on the retry cadence.
   * @return {Promise<void>}
   * @private
   */
  async applyLearnerPromotionProofGate() {
    const requestedLeaderId = this.leaderId;
    const requestedMembershipEpoch =
      this.resolveLearnerPromotionMembershipEpoch();
    const proof = await this.requestLearnerPromotionProofFromLeader({
      leaderReplicaId: requestedLeaderId,
      membershipEpoch: requestedMembershipEpoch,
    });
    const proofValidation = validateLearnerPromotionProofResponse({
      proof,
      isPromotableLearner:
        isCatchupLearnerRaftRole(this.role) && this.isShutdown !== true,
      requestedLeaderId,
      currentLeaderId: this.leaderId,
      requestedMembershipEpoch,
      currentMembershipEpoch: this.resolveLearnerPromotionMembershipEpoch(),
      localTerm: this.resolveCurrentTermSafe(),
    });
    if (!proofValidation.accepted) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        reason: proofValidation.reason,
        proofReason: proofValidation.proofReason,
        proofCause: proofValidation.proofCause,
        leaderReplicaId: requestedLeaderId,
        membershipEpoch: requestedMembershipEpoch,
      });
      this.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
      );
      return;
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_GRANTED, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      leaderReplicaId: requestedLeaderId,
      term: proof.term,
      membershipEpoch: proof.membershipEpoch,
      safePromotionIndex: proof.safePromotionIndex,
      learnerMatchIndex: proof.learnerMatchIndex,
    });
    this.becomeFollower();
  }
  getInFlightAddLikeOperationReplicaIds() {
    const operationRows =
      this.systemTableCache &&
      typeof this.systemTableCache.filter === PARTITION_SERVICE_TYPE.FUNCTION ?
        this.systemTableCache.filter(
          TABLES.REPLICA_OPERATIONS,
          (operationRow) => {
            return (
              operationRow?.[COLUMN.PARTITION_ID] === this.partitionId &&
                ADD_LIKE_REPLICA_OPERATION_TYPES.has(operationRow?.type) &&
                !TERMINAL_STATUSES.includes(
                  String(
                    operationRow?.[COLUMN.STATUS] ??
                      operationRow?.operation_status ??
                      operationRow?.operationStatus ??
                      STRING.EMPTY,
                  ).toLowerCase(),
                )
            );
          },
        ) :
        [];
    const replicaIds = new Set();
    for (const operationRow of operationRows) {
      const replicaId = String(
        operationRow?.[COLUMN.REPLICA_ID] || STRING.EMPTY,
      ).trim();
      if (replicaId.length > 0) {
        replicaIds.add(replicaId);
      }
      const targetNodeId = String(
        operationRow?.[COLUMN.TARGET_NODE_ID] || STRING.EMPTY,
      ).trim();
      const localNodeId = String(this.nodeId || STRING.EMPTY).trim();
      const localReplicaId = String(this.replicaId || STRING.EMPTY).trim();
      if (
        targetNodeId.length > 0 &&
        localReplicaId.length > 0 &&
        targetNodeId === localNodeId
      ) {
        replicaIds.add(localReplicaId);
      }
    }
    return replicaIds;
  }
  countPendingLearners() {
    const services = this.getPartitionServiceRowsForPromotion();
    let learnerCount = 0;
    for (const service of services) {
      if (this.isLearnerServiceRowForPromotion(service)) {
        learnerCount++;
      }
    }
    return learnerCount;
  }
  getTargetReplicaCountForPromotion() {
    const partitionRow =
      this.systemTableCache &&
      typeof this.systemTableCache.get === PARTITION_SERVICE_TYPE.FUNCTION ?
        this.systemTableCache.get(TABLES.PARTITIONS, this.partitionId) :
        {};
    const publishedReplicaCount = Number(
      partitionRow?.[PARTITION_REPLICA_COUNT_FIELD],
    );
    if (
      Number.isInteger(publishedReplicaCount) &&
      publishedReplicaCount > 0
    ) {
      return publishedReplicaCount;
    }
    const configuredReplicaCount = Number(this.replicaCount);
    if (
      Number.isInteger(configuredReplicaCount) &&
      configuredReplicaCount > 0
    ) {
      return configuredReplicaCount;
    }
    return PARTITION_SERVICE_DEFAULT.DEFAULT_REPLICA_COUNT;
  }
  countActiveVoters() {
    const services = this.getPartitionServiceRowsForPromotion();
    let voterCount = 0;
    for (const service of services) {
      if (this.isActiveVoterServiceRowForPromotion(service)) {
        voterCount++;
      }
    }
    return voterCount;
  }
}

function createPartitionServiceLearnerPromotionMethods() {
  const methods = {};
  const prototypeNames =
    Object.getOwnPropertyNames(PartitionServiceLearnerPromotionMethods.prototype);
  for (const name of prototypeNames) {
    if (name !== 'constructor') {
      methods[name] = PartitionServiceLearnerPromotionMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceLearnerPromotionMethods};
