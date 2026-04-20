import { PARTITION_SERVICE_SHARED } from "./partition-service-shared.js";
import { PartitionServiceSegment4Part1 } from "./partition-service-segment-4-part-1.js";

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
          PARTITION_SERVICE_TYPE.FUNCTION
          ? this.rebalancer.setRebalanceCoordinator.bind(this.rebalancer)
          : null,
        PARTITION_SERVICE_ERROR_MSG.REBALANCER_SET_COORDINATOR_REQUIRED,
      );
      setRebalanceCoordinator(bundle.rebalanceCoordinator);
    }
    this.logger.debug(
      PARTITION_SERVICE_LOG_MSG.REBALANCER_DEPENDENCIES_APPLIED,
      { partitionId: this.partitionId },
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
      normalizePublishedRaftRole(role, { collapseLeaderToFollower: true }),
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
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId)
      ? PARTITION_SERVICE_LITERAL.CRITICAL
      : PARTITION_SERVICE_LITERAL.BACKGROUND;
  }
  getMetadataPublicationWorkClass() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId)
      ? PRESSURE_WORK_CLASS.CRITICAL
      : PRESSURE_WORK_CLASS.BACKGROUND;
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
            { requestId, partitionId: this.partitionId },
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
    if (!isPriorityControlPlanePartition({ partitionId: this.partitionId })) {
      return false;
    }
    const readinessSnapshot = getTrafficReadinessSnapshot(
      this.metadataPublicationReadinessState,
    );
    if (!readinessSnapshot || readinessSnapshot.draining === true) {
      return false;
    }
    const reasons = Array.isArray(readinessSnapshot.reasons)
      ? readinessSnapshot.reasons
      : [];
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
            "",
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
  resolvePriorityRecoveryCompletionForLearnerPromotion(options = {}) {
    const priorityRecoveryActive =
      this.isPriorityRecoveryPendingForLearnerPromotion();
    if (
      !isPriorityControlPlanePartition({ partitionId: this.partitionId }) &&
      priorityRecoveryActive !== true
    ) {
      return null;
    }
    const planningSnapshot =
      this.getPriorityRecoveryPlanningSnapshotForLearnerPromotion();
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary || null;
    const effectiveEligibleNodeIds = planningSnapshot
      ? resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds
      : [];
    const services =
      this.systemTableCache &&
      typeof this.systemTableCache.filter === PARTITION_SERVICE_TYPE.FUNCTION
        ? this.systemTableCache.filter(TABLES.SERVICES, (serviceRow) => {
            return (
              serviceRow?.partition_id === this.partitionId &&
              serviceRow?.service_type === SERVICE_TYPE.PARTITION
            );
          })
        : [];
    const readinessService = this.controlPlaneReadinessService;
    const activeLearnerNodeIds = Array.isArray(services)
      ? services
          .filter((serviceRow) => {
            const status = serviceRow?.status || ReplicaStatus.ACTIVE;
            return (
              status !== ReplicaStatus.FAILED &&
              status !== ReplicaStatus.REMOVING &&
              status !== ReplicaStatus.REMOVED &&
              serviceRow?.raft_role === PARTITION_RAFT_ROLE.LEARNER
            );
          })
          .map((serviceRow) => String(serviceRow?.node_id || "").trim())
          .filter((nodeId) => nodeId.length > NUM.ZERO)
      : [];
    const promotableLearnerNodeIds = [];
    const learnerHoldByNodeId = {};
    for (const nodeId of activeLearnerNodeIds) {
      const readiness =
        readinessService &&
        typeof readinessService.getNodeReadinessSync ===
          PARTITION_SERVICE_TYPE.FUNCTION
          ? readinessService.getNodeReadinessSync(nodeId)
          : null;
      const dimensions =
        readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT
          ? readiness.dimensions
          : {};
      if (
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true
      ) {
        promotableLearnerNodeIds.push(nodeId);
        continue;
      }
      learnerHoldByNodeId[nodeId] = {
        reasonCodes: Array.isArray(readiness?.reasonCodes)
          ? [...readiness.reasonCodes]
          : [],
      };
    }
    const assessment = buildPriorityRecoveryPartitionAssessment({
      partitionId: this.partitionId,
      priorityPartitionSummary,
      admission: {
        effectiveEligibleNodeIds,
        effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
        ineligibleNodes: [],
      },
      learnerPromotion: {
        activeLearnerNodeIds,
        promotableLearnerNodeIds,
        activeLearnerNodeCount: activeLearnerNodeIds.length,
        promotableLearnerNodeCount: promotableLearnerNodeIds.length,
        learnerHoldByNodeId,
      },
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
}

export { PartitionServiceSegment4 };
