import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceSegment4Part1} from './partition-service-segment-4-part-1.js';

const {
  ACTIVE_VOTER_ROLES,
  ADD_LIKE_REPLICA_OPERATION_TYPES,
  COLUMN,
  CONTROL_PLANE_PARTITION_IDS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CRITICAL_SYSTEM_PARTITION_IDS,
  EntityType,
  LIFECYCLE_REASON,
  NUM,
  PARTITION_RAFT_ROLE,
  PARTITION_REPLICA_COUNT_FIELD,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
  PRESSURE_WORK_CLASS,
  RaftRole,
  ReplicaStatus,
  SERVICE_TYPE,
  STRING,
  SYSTEM_TABLE_NAME,
  TABLES,
  TERMINAL_STATUSES,
  TYPEOF,
  UnifiedRebalancer,
  assertCritical,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryLearnerPromotion,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  getTrafficReadinessSnapshot,
  hasPriorityRecoverySpreadGap,
  isPriorityControlPlanePartition,
  isSystemTableWriteReady,
  normalizePublishedRaftRole,
  resolvePriorityRecoveryActiveNodeCohort,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceSegment4 extends PartitionServiceSegment4Part1 {
  /**
   * Build a rebalancer dependency bundle from current PartitionService
   * state. The bundle is the single shape consumed by
   * applyRebalancerDependencies and initializeRebalancer.
   *
   * Requirements: 7.1 (explicit dependency bundles)
   * Design: D8.1
   * @return {Object|null} Bundle object, or null when any required
   *   dependency is missing.
   * @private
   */
  buildRebalancerDependencyBundle() {
    const systemTableCache = this.systemTableCache;
    const cdcIntegrationService = this.cdcIntegrationService;
    const tablePolicyService = this.tablePolicyService;
    const messageRouter = this.messageRouter;
    const sqlQueryEngine = this.sqlQueryEngine;
    const rebalanceCoordinator = this.rebalanceCoordinator;
    if (
      !systemTableCache ||
      !cdcIntegrationService ||
      !tablePolicyService ||
      !messageRouter ||
      !sqlQueryEngine ||
      !rebalanceCoordinator
    ) {
      return null;
    }
    return {
      systemTableCache,
      cdcIntegrationService,
      tablePolicyService,
      messageRouter,
      sqlQueryEngine,
      rebalanceCoordinator,
    };
  }
  /**
   * Apply a dependency bundle to an existing rebalancer instance.
   * This is the single path for updating rebalancer owner
   * dependencies after construction.
   *
   * Requirements: 7.1 (explicit dependency bundles), 7.4 (gating)
   * Design: D8.1, D8.2
   * @param {Object} bundle - Dependency bundle from
   *   buildRebalancerDependencyBundle.
   * @private
   */
  applyRebalancerDependencies(bundle) {
    if (!bundle || !this.rebalancer) {
      return;
    }
    let coordinatorRoutedThroughSetter = false;
    if (bundle.rebalanceCoordinator) {
      bundle.rebalanceCoordinator.systemTableCache = bundle.systemTableCache;
      bundle.rebalanceCoordinator.cdcIntegrationService =
        bundle.cdcIntegrationService;
      bundle.rebalanceCoordinator.tablePolicyService =
        bundle.tablePolicyService;
      bundle.rebalanceCoordinator.sqlQueryEngine = bundle.sqlQueryEngine;
      if (
        typeof bundle.rebalanceCoordinator.syncOwnerDependencies ===
        PARTITION_SERVICE_TYPE.FUNCTION
      ) {
        bundle.rebalanceCoordinator.syncOwnerDependencies(bundle);
      }
    }
    if (
      typeof this.rebalancer.syncOwnerDependencies ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      this.rebalancer.syncOwnerDependencies(bundle);
      coordinatorRoutedThroughSetter = !!bundle.rebalanceCoordinator;
    } else {
      this.rebalancer.systemTableCache = bundle.systemTableCache;
      this.rebalancer.cdcIntegrationService = bundle.cdcIntegrationService;
      this.rebalancer.tablePolicyService = bundle.tablePolicyService;
      this.rebalancer.messageRouter = bundle.messageRouter;
      this.rebalancer.sqlQueryEngine = bundle.sqlQueryEngine;
    }
    if (
      bundle.rebalanceCoordinator &&
      coordinatorRoutedThroughSetter !== true
    ) {
      const setRebalanceCoordinator = assertCritical(
        typeof this.rebalancer.setRebalanceCoordinator ===
          PARTITION_SERVICE_TYPE.FUNCTION ?
          this.rebalancer.setRebalanceCoordinator.bind(this.rebalancer) :
          null,
        PARTITION_SERVICE_ERROR_MSG.REBALANCER_SET_COORDINATOR_REQUIRED,
      );
      setRebalanceCoordinator(bundle.rebalanceCoordinator);
    }
    this.logger.debug(
      PARTITION_SERVICE_LOG_MSG.REBALANCER_DEPENDENCIES_APPLIED,
      {partitionId: this.partitionId},
    );
  }
  /**
   * Initialize rebalancer only when required dependencies are ready.
   * @private
   */
  maybeInitializeRebalancer() {
    const backgroundReady = this.isBackgroundWorkReady();
    if (this.rebalancer) {
      const bundle2 = this.buildRebalancerDependencyBundle();
      this.applyRebalancerDependencies(bundle2);
      if (
        typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION
      ) {
        this.rebalancer.setLeader(backgroundReady && this.isLeader);
      }
      return;
    }
    if (!backgroundReady || !this.isLeader) {
      return;
    }
    const bundle = this.buildRebalancerDependencyBundle();
    if (!bundle) {
      return;
    }
    this.initializeRebalancer(bundle);
  }
  /**
   * Initialize rebalancer components with required dependencies.
   * @param {Object} [bundle] - Optional pre-built dependency bundle.
   *   When omitted, dependencies are read from PartitionService state
   *   and individually validated.
   * @private
   */
  initializeRebalancer(bundle) {
    const src = bundle || this;
    const systemTableCache = assertCritical(
      src.systemTableCache,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_CACHE_REQUIRED,
    );
    const cdcIntegrationService = assertCritical(
      src.cdcIntegrationService,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_CDC_REQUIRED,
    );
    const tablePolicyService = assertCritical(
      src.tablePolicyService,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_POLICY_REQUIRED,
    );
    const messageRouter = assertCritical(
      src.messageRouter,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_ROUTER_REQUIRED,
    );
    const sqlQueryEngine = assertCritical(
      src.sqlQueryEngine,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_SQL_ENGINE_REQUIRED,
    );
    const rebalanceCoordinator = assertCritical(
      src.rebalanceCoordinator,
      PARTITION_SERVICE_ERROR_MSG.REBALANCER_COORDINATOR_REQUIRED,
    );
    rebalanceCoordinator.systemTableCache = systemTableCache;
    rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
    rebalanceCoordinator.tablePolicyService = tablePolicyService;
    rebalanceCoordinator.sqlQueryEngine = sqlQueryEngine;
    if (
      typeof rebalanceCoordinator.syncOwnerDependencies ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      rebalanceCoordinator.syncOwnerDependencies({
        systemTableCache,
        cdcIntegrationService,
        tablePolicyService,
        messageRouter,
        sqlQueryEngine,
      });
    }
    if (
      typeof rebalanceCoordinator.initialize === PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      rebalanceCoordinator.initialize();
    }
    this.rebalancer = new UnifiedRebalancer({
      entityId: this.partitionId,
      entityType: EntityType.PARTITION,
      systemTableCache,
      cdcIntegrationService,
      tablePolicyService,
      sqlQueryEngine,
      nodeId: this.nodeId,
      replicaStateMachine: this.replicaStateMachine,
      messageRouter,
      rebalanceCoordinator,
    });
    this.rebalancer.initialize();
    this.rebalancer.setLeader(this.isBackgroundWorkReady() && this.isLeader);
  }
  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @private
   */
  queueRoleUpdate(role) {
    this.roleMutationHelper.queue(
      normalizePublishedRaftRole(role, {collapseLeaderToFollower: true}),
    );
  }
  /**
   * Queue a partition leader update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @private
   */
  queueLeaderNodeUpdate(leaderNodeId) {
    this.leaderNodeMutationHelper.queue(leaderNodeId);
  }
  /**
   * Persist the latest pending raft role update.
   * @return {Promise<void>}
   * @private
   */
  async flushRoleUpdate() {
    return this.roleMutationHelper.flush();
  }
  /**
   * Persist the latest pending partition leader update.
   * @return {Promise<void>}
   * @private
   */
  async flushLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper.flush();
  }
  /**
   * Check if the partitions partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isPartitionsLeaderAvailable() {
    if (
      isSystemTableWriteReady(
        this.systemTableCache,
        SYSTEM_TABLE_NAME.PARTITIONS,
      )
    ) {
      return true;
    }
    return (
      this.cdcIntegrationService?.canWriteSystemTableLocally?.(
        SYSTEM_TABLE_NAME.PARTITIONS,
      ) === true
    );
  }
  /**
   * Check if the services table is writable through either cache-visible
   * routing metadata or the local services-p1 leader owner.
   * @return {boolean} True if writes can be issued safely.
   * @private
   */
  isServicesLeaderAvailable() {
    if (
      isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES)
    ) {
      return true;
    }
    return (
      this.cdcIntegrationService?.canWriteSystemTableLocally?.(
        SYSTEM_TABLE_NAME.SERVICES,
      ) === true
    );
  }
  getMetadataPublicationDeliveryPriority() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      PARTITION_SERVICE_LITERAL.CRITICAL :
      PARTITION_SERVICE_LITERAL.BACKGROUND;
  }
  getMetadataPublicationWorkClass() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      PRESSURE_WORK_CLASS.CRITICAL :
      PRESSURE_WORK_CLASS.BACKGROUND;
  }
  shouldMetadataPublicationAllowPressureDefer() {
    return (
      this.getMetadataPublicationWorkClass() !== PRESSURE_WORK_CLASS.CRITICAL
    );
  }
  getMetadataPublicationReadinessDimension() {
    return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  }
  /**
   * Trigger an immediate rebalance check.
   * Called when a significant cluster event occurs (e.g., node join).
   * @param {string} reason - Reason for the trigger.
   */
  triggerRebalanceCheck(reason) {
    if (this.rebalancer && this.isLeader) {
      this.rebalancer.recordStateChange(reason);
    }
  }
  /**
   * Extract ACK from transport response.
   * Requirements: 6.1, 6.2, 6.3, 6.4
   * @param {Object} result - Transport result (now flat structure).
   * @param {string} requestId - Expected request ID.
   * @return {Object|null} ACK or null if not found.
   * @private
   */
  extractAckFromResponse(result, requestId) {
    if (!result) return null;
    if (result.request_id === requestId) {
      return result;
    }
    if (result.result) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NESTED_ACK_UNSUPPORTED);
    }
    return null;
  }
  /**
   * Deliver a message via transport and wait for ACK with timeout.
   * Uses PendingRequestTracker instead of EventEmitter-based ACK handling.
   * Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
   * @param {Object} transport - MessageRouter instance.
   * @param {string} targetAddress - Target address (e.g., 'node-2/lifecycle').
   * @param {Object} message - Message to send.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<Object>} ACK response or timeout error.
   * @private
   */
  async deliverWithAck(
    transport,
    targetAddress,
    message,
    timeoutMs = PARTITION_SERVICE_VALUE.DEFAULT_TIMEOUT_MS,
  ) {
    const requestId = message.request_id;
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.DELIVERING_WITH_ACK, {
      requestId,
      targetAddress,
      messageType: message.type,
      partitionId: this.partitionId,
    });
    const trackPromise = this.pendingRequestTracker.track(requestId, {
      type: message.type,
      targetAddress,
      timeoutMs,
    });
    let earlyRejection = null;
    const buildTrackerShutdownAck = () => ({
      request_id: requestId,
      status: PARTITION_SERVICE_STATUS.INITIATED,
      message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
    });
    trackPromise.catch((err) => {
      earlyRejection = err;
    });
    try {
      const result = await transport.deliver(targetAddress, message);
      if (earlyRejection) {
        if (
          earlyRejection.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN
        ) {
          this.logger.debug(
            PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_DELIVERY,
            {requestId, partitionId: this.partitionId},
          );
          return buildTrackerShutdownAck();
        }
        throw earlyRejection;
      }
      if (result && result.acknowledged === false) {
        const errorMsg =
          result.error || PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK;
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.MESSAGE_DELIVERY_FAILED, {
          requestId,
          targetAddress,
          error: errorMsg,
          partitionId: this.partitionId,
        });
        if (this.pendingRequestTracker.hasPending(requestId)) {
          this.pendingRequestTracker.reject(
            requestId,
            new Error(`Delivery failed: ${errorMsg}`),
          );
        }
        throw new Error(`Delivery failed: ${errorMsg}`);
      }
      const ack = this.extractAckFromResponse(result, requestId);
      if (ack) {
        this.pendingRequestTracker.resolve(requestId, ack);
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.RECEIVED_ACK, {
          requestId,
          status: ack.status,
          partitionId: this.partitionId,
        });
        return ack;
      }
      return await trackPromise;
    } catch (error) {
      if (error.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_ACK, {
          requestId,
          partitionId: this.partitionId,
        });
        return buildTrackerShutdownAck();
      }
      if (this.pendingRequestTracker.hasPending(requestId)) {
        this.pendingRequestTracker.reject(requestId, error);
      }
      throw error;
    }
  }
  /**
   * Schedule learner promotion check after minimum delay.
   * Learners are promoted to followers after catching up with the leader's log.
   * This prevents new replicas from disrupting existing leadership.
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
    const delayMs = this.resolveLearnerPromotionDelayMs(scheduleReason);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      delayMs,
      scheduleReason,
    });
    this.learnerPromotionTimer = setTimeout(() => {
      this.checkLearnerPromotion();
    }, delayMs);
  }
  isPriorityRecoveryPendingForLearnerPromotion() {
    if (!isPriorityControlPlanePartition({partitionId: this.partitionId})) {
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
  resolveLearnerPromotionDelayMs(scheduleReason) {
    if (
      scheduleReason ===
      PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY
    ) {
      if (this.isPriorityRecoveryPendingForLearnerPromotion()) {
        return Math.min(
          this.learnerPromotionDelayMs,
          this.learnerPromotionPriorityRecoveryDelayMs,
        );
      }
      return this.learnerPromotionDelayMs;
    }
    return this.learnerCatchUpCheckIntervalMs;
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
    const operationRows = this.systemTableCache.filter(
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
    if (!Array.isArray(operationRows) || operationRows.length === NUM.ZERO) {
      return [];
    }
    return operationRows
      .map((operationRow) =>
        buildPriorityRecoveryOperationContextFromRecord(operationRow),
      )
      .filter(
        (operationContext) =>
          operationContext && typeof operationContext === TYPEOF.OBJECT,
      );
  }
  getPartitionServiceRowsForPromotion() {
    return this.systemTableCache &&
      typeof this.systemTableCache.filter === PARTITION_SERVICE_TYPE.FUNCTION ?
      this.systemTableCache.filter(TABLES.SERVICES, (serviceRow) => {
        return (
          serviceRow?.[COLUMN.PARTITION_ID] === this.partitionId &&
            serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION
        );
      }) :
      [];
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
      localReplicaId.length > NUM.ZERO && serviceReplicaId === localReplicaId;
    const nodeMatches =
      localNodeId.length > NUM.ZERO && serviceNodeId === localNodeId;
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
      serviceRow?.[COLUMN.RAFT_ROLE] === PARTITION_RAFT_ROLE.LEARNER
    );
  }
  isActiveVoterServiceRowForPromotion(serviceRow) {
    const raftRole = serviceRow?.[COLUMN.RAFT_ROLE];
    return (
      this.isLiveReplicaServiceRowForPromotion(serviceRow) &&
      raftRole !== PARTITION_RAFT_ROLE.LEARNER &&
      ACTIVE_VOTER_ROLES.has(raftRole)
    );
  }
  resolveOperationScopedLearnerCountForPromotion(inFlightAddLikeReplicaIds) {
    const operationReplicaIds =
      inFlightAddLikeReplicaIds instanceof Set ?
        inFlightAddLikeReplicaIds :
        new Set();
    if (operationReplicaIds.size === NUM.ZERO) {
      return {scopeActive: false, learnerCount: NUM.ZERO};
    }
    let learnerCount = NUM.ZERO;
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
      this.role === RaftRole.LEARNER &&
      localReplicaId.length > NUM.ZERO &&
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
      NUM.ZERO;
    const observedLearnerCount = Number.isFinite(observedCounts.learnerCount) ?
      observedCounts.learnerCount :
      NUM.ZERO;
    const operationScopedLearnerCount =
      this.resolveOperationScopedLearnerCountForPromotion(
        observedCounts.inFlightAddLikeReplicaIds,
      );
    const baseLearnerCount = operationScopedLearnerCount.scopeActive ?
      operationScopedLearnerCount.learnerCount :
      observedLearnerCount;
    if (this.role !== RaftRole.LEARNER) {
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
        baseLearnerCount + NUM.ONE;
    const activeVoterCount = localVoterRowVisible ?
      Math.max(observedActiveVoterCount - NUM.ONE, NUM.ZERO) :
      observedActiveVoterCount;
    return {activeVoterCount, learnerCount};
  }
  resolveActiveLearnerNodeIdsForPromotion(serviceLearnerNodeIds) {
    const learnerNodeIds = Array.isArray(serviceLearnerNodeIds) ?
      [...serviceLearnerNodeIds] :
      [];
    const localNodeId = String(this.nodeId || STRING.EMPTY).trim();
    if (
      this.role !== RaftRole.LEARNER ||
      localNodeId.length === NUM.ZERO ||
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
      !isPriorityControlPlanePartition({partitionId: this.partitionId}) &&
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
        .filter((nodeId) => nodeId.length > NUM.ZERO) :
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
    const operationOwnedCriticalReplacementPromotionAllowed =
      isCriticalSystemPartition &&
      hasOwnedAddLikeOperation &&
      activeVoterCount >= targetReplicaCount;
    const replacementPromotionAllowed =
      singleReplacementPromotionAllowed ||
      operationOwnedCriticalReplacementPromotionAllowed;
    const singleVoterExpansionPromotionAllowed =
      this.isJoiningExistingGroup === true &&
      learnerCount === NUM.ONE &&
      activeVoterCount === NUM.ONE;
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
        NUM.ZERO;
    const priorityRecoveryOverflowPromotionAllowed =
      priorityRecoveryAdditionalVotersAllowed > NUM.ZERO;
    const maxAllowedVotersAfterPromotion =
      targetReplicaCount +
      (replacementPromotionAllowed || singleVoterExpansionPromotionAllowed ?
        NUM.ONE :
        NUM.ZERO) +
      priorityRecoveryAdditionalVotersAllowed;
    const votersAfterPromotion = activeVoterCount + NUM.ONE;
    const wouldExceedTargetReplicaCount =
      votersAfterPromotion > maxAllowedVotersAfterPromotion;
    const wouldBeEven = votersAfterPromotion % NUM.TWO === NUM.ZERO;
    const votersAfterAllLearners = activeVoterCount + learnerCount;
    const allLearnersWouldBeOdd = votersAfterAllLearners % NUM.TWO === NUM.ONE;
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
          PARTITION_SERVICE_LITERAL.REPLICA_COUNT_LIMIT :
          PARTITION_SERVICE_LITERAL.ODD_VOTER_REQUIREMENT,
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
      if (replicaId.length > NUM.ZERO) {
        replicaIds.add(replicaId);
      }
      const targetNodeId = String(
        operationRow?.[COLUMN.TARGET_NODE_ID] || STRING.EMPTY,
      ).trim();
      const localNodeId = String(this.nodeId || STRING.EMPTY).trim();
      const localReplicaId = String(this.replicaId || STRING.EMPTY).trim();
      if (
        targetNodeId.length > NUM.ZERO &&
        localReplicaId.length > NUM.ZERO &&
        targetNodeId === localNodeId
      ) {
        replicaIds.add(localReplicaId);
      }
    }
    return replicaIds;
  }
  countPendingLearners() {
    const services = this.getPartitionServiceRowsForPromotion();
    let learnerCount = NUM.ZERO;
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
      publishedReplicaCount > NUM.ZERO
    ) {
      return publishedReplicaCount;
    }
    const configuredReplicaCount = Number(this.replicaCount);
    if (
      Number.isInteger(configuredReplicaCount) &&
      configuredReplicaCount > NUM.ZERO
    ) {
      return configuredReplicaCount;
    }
    return PARTITION_SERVICE_DEFAULT.DEFAULT_REPLICA_COUNT;
  }
  countActiveVoters() {
    const services = this.getPartitionServiceRowsForPromotion();
    let voterCount = NUM.ZERO;
    for (const service of services) {
      if (this.isActiveVoterServiceRowForPromotion(service)) {
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
      typeof this.pendingRequestTracker.getStats === PARTITION_SERVICE_TYPE.FUNCTION ?
        this.pendingRequestTracker.getStats() :
        null;
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

export {PartitionServiceSegment4};
