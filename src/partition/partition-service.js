import { PARTITION_SERVICE_SHARED } from "./partition-service-shared.js";
import { PartitionServiceSegment4 } from "./partition-service-segment-4.js";

const {
  ACTIVE_VOTER_ROLES,
  ADD_LIKE_REPLICA_OPERATION_TYPES,
  AddressManager,
  AuthoritativeRowMutationHelper,
  CANONICAL_PARTITION_LEADER_OBSERVATION_STATE,
  CDCEventBuffer,
  CDCOperation,
  CDCPipelineMetrics,
  CDC_LIFECYCLE_LOG_MSG,
  CDC_OPERATION,
  CDC_PIPELINE_METRIC,
  COLUMN,
  CONFIG_KEY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_PARTITION_IDS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CRITICAL_SYSTEM_PARTITION_IDS,
  ConfigurationManager,
  DEFAULT_TRANSACTION_SESSION_ID,
  Database,
  ENTITY_TYPE,
  ERRORS,
  EntityType,
  EventEmitter,
  HLCClockService,
  INITIAL_PARTITION_IDS,
  LIFECYCLE_REASON,
  LeaderActivationGate,
  LeaderActivationScheduler,
  LifeRaft,
  LiferaftProvider,
  LoggingService,
  METRICS_LOG_TAG,
  NUM,
  OperationType,
  PARTICIPANT_ACK_FIELD,
  PARTITION_CDC_EVENT_BUILD_STATE,
  PARTITION_RAFT_ROLE,
  PARTITION_REPLICA_COUNT_FIELD,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LIFERAFT_TIMER,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_STATE,
  PARTITION_SUBSYSTEM,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PARTITION_WRITE_COMMIT_MODE,
  PRESSURE_WORK_CLASS,
  PartitionCDCDelivery,
  PartitionCDCGenerator,
  PartitionRaftLogEntry,
  PartitionRaftStorage,
  PartitionState,
  PendingRequestTracker,
  ProposalQueue,
  QUERY_PAYLOAD_FIELD_MIGRATION_ID,
  QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION,
  RaftRole,
  ReplicaStatus,
  SERVICE_TYPE,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS,
  SQL,
  SQLiteLogAdapter,
  STRING,
  SYSTEM_TABLE_NAME,
  TABLES,
  TERMINAL_STATUSES,
  TIMEOUT_BUDGET_DEFAULT,
  TYPEOF,
  UnifiedRebalancer,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_ENTRY_BUILD_MS,
  WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
  WRITE_PHASE_FIELD_LOG_APPEND_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  WRITE_PHASE_FIELD_SQLITE_RUN_MS,
  WRITE_PHASE_FIELD_TOTAL_MS,
  applyRuntimeRaftTiming,
  assertCritical,
  assertRaftProviderContract,
  attachTrafficReadinessListener,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  cloneSplitRoutingEntry,
  computeReplicaElectionTimeouts,
  createControlPlaneRuntimeBundle,
  executePartitionWriteStatement,
  extractPartitionSplitRoutingKey,
  fs,
  getSystemCachePrimaryKeyFieldOrFallback,
  getTrafficReadinessSnapshot,
  hasPriorityRecoverySpreadGap,
  isBackgroundWorkLifecycleReady,
  isMetadataPublicationLifecycleReady,
  isPriorityControlPlanePartition,
  isRaftPacket,
  isSystemTableWriteReady,
  normalizePublishedRaftRole,
  path,
  replayPartitionSplitEntry,
  resolveCanonicalPartitionLeaderObservation,
  resolvePartitionSplitTargetPartitionId,
  resolvePartitionWriteCommitMode,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveRaftTransportDeliveryOptions,
  routePartitionSplitMirroredWrite,
  runRetryableControlPlaneWrite,
  wireReplicaLifecycleEvents,
} = PARTITION_SERVICE_SHARED;

class PartitionService extends PartitionServiceSegment4 {
  /**
   * Check if learner can be promoted to follower.
   * Promotion happens when:
   * 1. Minimum delay has passed (already satisfied by timer)
   * 2. A leader has been discovered for the group
   * 3. Promoting would stay within the partition's configured replica count,
   *    allowing at most one temporary replacement voter above target
   * 4. Promoting would not result in an even number of voters (prevents split votes)
   *    unless this is the single temporary replacement voter or all pending
   *    learners together would reach an odd count within target
   * @private
   */
  checkLearnerPromotion() {
    this.learnerPromotionTimer = null;
    if (this.role !== RaftRole.LEARNER) {
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
    const activeVoterCount = this.countActiveVoters();
    const learnerCount = this.countPendingLearners();
    const inFlightAddLikeReplicaIds =
      this.getInFlightAddLikeOperationReplicaIds();
    const hasOwnedAddLikeOperation = Boolean(
      inFlightAddLikeReplicaIds &&
      inFlightAddLikeReplicaIds.size > NUM.ZERO &&
      inFlightAddLikeReplicaIds.has(this.replicaId),
    );
    const targetReplicaCount = this.getTargetReplicaCountForPromotion();
    const isCriticalSystemPartition = CRITICAL_SYSTEM_PARTITION_IDS.has(
      this.partitionId,
    );
    const singleReplacementPromotionAllowed =
      (this.isJoiningExistingGroup === true || hasOwnedAddLikeOperation) &&
      learnerCount === NUM.ONE &&
      activeVoterCount >= targetReplicaCount;
    const priorityRecoveryCompletion = isCriticalSystemPartition
      ? this.resolvePriorityRecoveryCompletionForLearnerPromotion({
          targetReplicaCount,
          activeVoterCount,
          learnerCount,
        })
      : null;
    const priorityRecoveryAdditionalVotersAllowed =
      isCriticalSystemPartition &&
      Number.isFinite(priorityRecoveryCompletion?.temporaryOverflowVoterBudget)
        ? priorityRecoveryCompletion.temporaryOverflowVoterBudget
        : NUM.ZERO;
    const priorityRecoveryOverflowPromotionAllowed =
      priorityRecoveryAdditionalVotersAllowed > NUM.ZERO;
    const maxAllowedVotersAfterPromotion =
      targetReplicaCount +
      (singleReplacementPromotionAllowed ? NUM.ONE : NUM.ZERO) +
      priorityRecoveryAdditionalVotersAllowed;
    const votersAfterPromotion = activeVoterCount + NUM.ONE;
    const wouldExceedTargetReplicaCount =
      votersAfterPromotion > maxAllowedVotersAfterPromotion;
    const wouldBeEven = votersAfterPromotion % NUM.TWO === NUM.ZERO;
    const votersAfterAllLearners = activeVoterCount + learnerCount;
    const allLearnersWouldBeOdd = votersAfterAllLearners % NUM.TWO === NUM.ONE;
    const allLearnersWithinTarget =
      votersAfterAllLearners <= targetReplicaCount;
    const allLearnersWithinPromotionBudget =
      votersAfterAllLearners <= maxAllowedVotersAfterPromotion;
    const multiLearnerPromotionAllowed =
      allLearnersWouldBeOdd && allLearnersWithinPromotionBudget;
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_CHECK, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      leaderId: this.leaderId,
      logLength: this.storage?.getLogLength() || NUM.ZERO,
      activeVoterCount,
      isCriticalSystemPartition,
      targetReplicaCount,
      maxAllowedVotersAfterPromotion,
      votersAfterPromotion,
      wouldExceedTargetReplicaCount,
      wouldBeEven,
      learnerCount,
      votersAfterAllLearners,
      allLearnersWouldBeOdd,
      allLearnersWithinTarget,
      allLearnersWithinPromotionBudget,
      singleReplacementPromotionAllowed,
      hasOwnedAddLikeOperation,
      priorityRecoveryAdditionalVotersAllowed,
      priorityRecoveryOverflowPromotionAllowed,
      priorityRecoveryCompletionState:
        priorityRecoveryCompletion?.state || null,
      priorityRecoveryCompletionReasonCode:
        priorityRecoveryCompletion?.reasonCode || null,
    });
    if (wouldExceedTargetReplicaCount) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        activeVoterCount,
        targetReplicaCount,
        votersAfterPromotion,
        learnerCount,
        votersAfterAllLearners,
        reason: PARTITION_SERVICE_LITERAL.WOULD_EXCEED_TARGET_REPLICA_COUNT,
        priorityRecoveryCompletionState:
          priorityRecoveryCompletion?.state || null,
        priorityRecoveryCompletionReasonCode:
          priorityRecoveryCompletion?.reasonCode || null,
      });
      this.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
      );
      return;
    }
    if (
      wouldBeEven &&
      activeVoterCount >= NUM.THREE &&
      !singleReplacementPromotionAllowed &&
      !multiLearnerPromotionAllowed
    ) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        activeVoterCount,
        targetReplicaCount,
        votersAfterPromotion,
        learnerCount,
        votersAfterAllLearners,
        reason: allLearnersWouldBeOdd
          ? PARTITION_SERVICE_LITERAL.WOULD_EXCEED_TARGET_REPLICA_COUNT
          : PARTITION_SERVICE_LITERAL.WOULD_CAUSE_EVEN_VOTER_COUNT,
      });
      this.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.DEFERRED_RECHECK,
      );
      return;
    }
    if (wouldBeEven && multiLearnerPromotionAllowed) {
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ALLOWED_MULTI,
        {
          replicaId: this.replicaId,
          partitionId: this.partitionId,
          activeVoterCount,
          learnerCount,
          targetReplicaCount,
          votersAfterAllLearners,
        },
      );
    }
    this.role = RaftRole.FOLLOWER;
    this.queueRoleUpdate(this.role);
    const wasJoiningExistingGroup = this.isJoiningExistingGroup === true;
    if (wasJoiningExistingGroup) {
      this.isJoiningExistingGroup = false;
      this.deferElection = false;
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTED_TO_FOLLOWER, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      leaderId: this.leaderId,
      activeVoterCount: votersAfterPromotion,
      wasJoiningExistingGroup,
    });
    this.startElection();
  }
  /**
   * Resolve add-like in-flight replica operation targets for this partition.
   * Operation ownership is canonical for active replacement/add workflows, so
   * stale learner service rows without active operations must not block a
   * joining learner's promotability.
   *
   * @return {Set<string>|null}
   * @private
   */
  getInFlightAddLikeOperationReplicaIds() {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return null;
    }
    const operationRows = this.systemTableCache.filter(
      TABLES.REPLICA_OPERATIONS,
      (operationRow) => {
        if (!operationRow || operationRow.partition_id !== this.partitionId) {
          return false;
        }
        const operationType = String(
          operationRow.type ??
            operationRow.operation_type ??
            operationRow.operationType ??
            "",
        ).toUpperCase();
        if (!ADD_LIKE_REPLICA_OPERATION_TYPES.has(operationType)) {
          return false;
        }
        const operationStatus = String(
          operationRow.status ??
            operationRow.operation_status ??
            operationRow.operationStatus ??
            "",
        ).toLowerCase();
        return !TERMINAL_STATUSES.includes(operationStatus);
      },
    );
    if (!Array.isArray(operationRows) || operationRows.length === NUM.ZERO) {
      return null;
    }
    const inFlightReplicaIds = /* @__PURE__ */ new Set();
    const normalizedLocalNodeId = String(this.nodeId || "").trim();
    const normalizedLocalReplicaId = String(this.replicaId || "").trim();
    for (const operationRow of operationRows) {
      const replicaId = String(
        operationRow.replica_id ?? operationRow.replicaId ?? "",
      ).trim();
      if (replicaId.length > NUM.ZERO) {
        inFlightReplicaIds.add(replicaId);
        continue;
      }
      const targetNodeId = String(
        operationRow.target_node_id ?? operationRow.targetNodeId ?? "",
      ).trim();
      if (
        targetNodeId.length > NUM.ZERO &&
        normalizedLocalNodeId.length > NUM.ZERO &&
        normalizedLocalReplicaId.length > NUM.ZERO &&
        targetNodeId === normalizedLocalNodeId
      ) {
        inFlightReplicaIds.add(normalizedLocalReplicaId);
      }
    }
    return inFlightReplicaIds.size > NUM.ZERO ? inFlightReplicaIds : null;
  }
  /**
   * Count pending learners in the Raft group.
   * Uses the system table cache to get current replica states.
   * @return {number} Number of pending learners.
   * @private
   */
  countPendingLearners() {
    if (!this.systemTableCache) {
      return NUM.ONE;
    }
    const inFlightAddLikeReplicaIds =
      this.getInFlightAddLikeOperationReplicaIds();
    const services = this.systemTableCache.filter(
      TABLES.SERVICES,
      (service) => {
        return (
          service.partition_id === this.partitionId &&
          service.service_type === SERVICE_TYPE.PARTITION
        );
      },
    );
    let learnerCount = NUM.ZERO;
    for (const service of services) {
      const status = service.status || ReplicaStatus.ACTIVE;
      const raftRole = service.raft_role;
      if (
        status === ReplicaStatus.FAILED ||
        status === ReplicaStatus.REMOVING ||
        status === ReplicaStatus.REMOVED
      ) {
        continue;
      }
      const replicaId = String(
        service.service_id ?? service.replica_id ?? "",
      ).trim();
      if (
        inFlightAddLikeReplicaIds &&
        inFlightAddLikeReplicaIds.size > NUM.ZERO &&
        !inFlightAddLikeReplicaIds.has(replicaId)
      ) {
        continue;
      }
      if (raftRole === PARTITION_RAFT_ROLE.LEARNER) {
        learnerCount++;
      }
    }
    return Math.max(learnerCount, NUM.ONE);
  }
  /**
   * Resolve the authoritative target voter count for learner promotion.
   * Defaults to the configured partition replica count when cache metadata
   * is temporarily unavailable.
   * @return {number}
   * @private
   */
  getTargetReplicaCountForPromotion() {
    const partitionRow = this.getCachedSystemTableRow(
      TABLES.PARTITIONS,
      (partition) => partition?.[COLUMN.PARTITION_ID] === this.partitionId,
    );
    const configuredReplicaCount = Number(
      partitionRow?.[PARTITION_REPLICA_COUNT_FIELD],
    );
    if (
      Number.isFinite(configuredReplicaCount) &&
      configuredReplicaCount > NUM.ZERO
    ) {
      return configuredReplicaCount;
    }
    return this.defaultReplicaCount;
  }
  /**
   * Count active voters in the Raft group (excluding learners).
   * Uses the system table cache to get current replica states.
   * @return {number} Number of active voters.
   * @private
   */
  countActiveVoters() {
    if (!this.systemTableCache) {
      return this.replicaIds.length;
    }
    const services = this.systemTableCache.filter(
      TABLES.SERVICES,
      (service) => {
        return (
          service.partition_id === this.partitionId &&
          service.service_type === SERVICE_TYPE.PARTITION
        );
      },
    );
    let voterCount = NUM.ZERO;
    for (const service of services) {
      const status = service.status || ReplicaStatus.ACTIVE;
      const raftRole = service.raft_role;
      if (
        status === ReplicaStatus.FAILED ||
        status === ReplicaStatus.REMOVING ||
        status === ReplicaStatus.REMOVED
      ) {
        continue;
      }
      if (raftRole === PARTITION_RAFT_ROLE.LEARNER) {
        continue;
      }
      if (ACTIVE_VOTER_ROLES.has(raftRole)) {
        voterCount++;
      }
    }
    return voterCount;
  }
  /**
   * Stop all rebalancing activity for this partition.
   * @return {Promise<void>}
   */
  async quiesceRebalancing() {
    if (this.rebalancer) {
      if (
        typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION
      ) {
        this.rebalancer.setLeader(false);
      }
      if (typeof this.rebalancer.shutdown === PARTITION_SERVICE_TYPE.FUNCTION) {
        this.rebalancer.shutdown();
      }
      this.rebalancer = null;
    }
    if (this.rebalanceCoordinator && this.ownsRebalanceCoordinator) {
      try {
        await this.rebalanceCoordinator.shutdown();
      } catch (error) {
        this.logger.warn(
          PARTITION_SERVICE_ERROR_MSG.REBALANCE_COORDINATOR_SHUTDOWN_FAILED,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      }
    }
    this.rebalanceCoordinator = null;
    this.ownsRebalanceCoordinator = false;
  }
  /**
   * Get compact partition runtime statistics for diagnostics attribution.
   * @return {Object}
   */
  getStats() {
    const pendingRequestTrackerStats =
      this.pendingRequestTracker &&
      typeof this.pendingRequestTracker.getStats === "function"
        ? this.pendingRequestTracker.getStats()
        : null;
    return {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      role: this.role,
      isLeader: this.isLeader,
      initialized: this.initialized,
      cdcReplay: {
        bufferedEvents: this.cdcEventBuffer.size(),
        replayBufferGrowthCount: this.cdcReplayBufferGrowthCount,
        replayRetryDepth: this.cdcReplayRetryDepth,
        replayDelayMs: this.cdcBufferReplayDelayMs,
        replayInFlight: this.cdcBufferReplayInFlight,
        subscriberCount: this.cdcSubscribers.size,
      },
      pendingRequestCount: pendingRequestTrackerStats?.pendingCount || NUM.ZERO,
      pendingRequestTracker: pendingRequestTrackerStats,
    };
  }
  /**
   * Shutdown the partition service.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.isShutdown = true;
    this.leaderActivationGate.shutdown();
    this.logger.info(PARTITION_SERVICE_LOG_MSG.SHUTTING_DOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
    if (this.learnerPromotionTimer) {
      clearTimeout(this.learnerPromotionTimer);
      this.learnerPromotionTimer = null;
    }
    this.peerReconciliationScheduled = false;
    if (
      this.systemTableCache &&
      typeof this.systemTableCache.offCacheChange ===
        PARTITION_SERVICE_TYPE.FUNCTION &&
      this.systemTableCacheChangeListener
    ) {
      this.systemTableCache.offCacheChange(this.systemTableCacheChangeListener);
    }
    if (this.logAdapter) {
      this.logAdapter.close();
    }
    if (this.raft) {
      this.raftProvider.shutdownNode(this.raft);
      this.raft = null;
    }
    this.stopPeriodicSizeUpdates();
    this.stopPreparedStateHoldTimeoutSweep();
    if (
      typeof this.releaseMetadataPublicationReadinessListener ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      this.releaseMetadataPublicationReadinessListener();
    }
    this.releaseMetadataPublicationReadinessListener = null;
    this._metadataPublicationReadinessState = null;
    this.roleMutationHelper.shutdown();
    this.leaderNodeMutationHelper.shutdown();
    if (this.cdcBufferReplayTimer) {
      clearTimeout(this.cdcBufferReplayTimer);
      this.cdcBufferReplayTimer = null;
    }
    this.cdcBufferReplayInFlight = false;
    if (this.pendingRequestTracker) {
      this.pendingRequestTracker.clear();
    }
    this.clearPendingCommittedWrites(
      PARTITION_SERVICE_LITERAL.PARTITION_SERVICE_SHUTDOWN,
    );
    await this.quiesceRebalancing();
    if (this.pendingCDCEventDeliveries.size > NUM.ZERO) {
      await Promise.allSettled([...this.pendingCDCEventDeliveries]);
      this.pendingCDCEventDeliveries.clear();
    }
    if (this.transport) {
      this.transport.unregister(this.unifiedAddress);
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.cdcSubscribers.clear();
    this.cdcSubscriberWrappers.clear();
    this.cdcSubscriberStates.clear();
    this.cdcSubscriptionEpoch = NUM.ZERO;
    this.cdcEventSequenceNumber = NUM.ZERO;
    this.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    this.cdcReplayBufferGrowthCount = NUM.ZERO;
    this.cdcReplayRetryDepth = NUM.ZERO;
    this.recentlyAppliedEntryKeys.clear();
    this.recentlyAppliedEntryOrder = [];
    this.pendingCDCEventDeliveries.clear();
    this.emit(PARTITION_SERVICE_EVENT.SHUTDOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
}
export {
  CDCOperation,
  PartitionRaftLogEntry,
  PartitionRaftStorage,
  PartitionService,
  PartitionState,
  RaftRole,
};
