import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  AddressManager,
  AuthoritativeRowMutationHelper,
  CDCEventBuffer,
  CDCPipelineMetrics,
  COLUMN,
  CONFIG_KEY,
  ConfigurationManager,
  ENTITY_TYPE,
  EventEmitter,
  HLCClockService,
  LeaderActivationGate,
  LeaderActivationScheduler,
  LiferaftProvider,
  LoggingService,
  NUM,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  PARTITION_SUBSYSTEM,
  PRESSURE_WORK_CLASS,
  PartitionCDCDelivery,
  PartitionCDCGenerator,
  PartitionState,
  PendingRequestTracker,
  ProposalQueue,
  RaftRole,
  SERVICE_TYPE,
  SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS,
  SYSTEM_TABLE_NAME,
  TABLES,
  TIMEOUT_BUDGET_DEFAULT,
  TYPEOF,
  assertRaftProviderContract,
  attachTrafficReadinessListener,
  createControlPlaneRuntimeBundle,
  isBackgroundWorkLifecycleReady,
  isMetadataPublicationLifecycleReady,
  normalizePublishedRaftRole,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceCoreBase extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.partitionId) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_PARTITION_ID);
    }
    if (!options.tableId) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_TABLE_ID);
    }
    if (!options.replicaId) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.REQUIRE_REPLICA_ID);
    }
    this.partitionId = options.partitionId;
    this.tableId = options.tableId;
    this.tableName = options.tableName || options.tableId;
    this.externalCdcAllowed =
      typeof options.externalCdcAllowed === PARTITION_SERVICE_LITERAL.BOOLEAN ?
        options.externalCdcAllowed :
        null;
    this.schema = options.schema || null;
    this.keyRange = options.keyRange || {
      start: PARTITION_SERVICE_DEFAULT.KEY_RANGE_START,
      end: PARTITION_SERVICE_DEFAULT.KEY_RANGE_END,
    };
    this.replicaId = options.replicaId;
    this.replicaIds = options.replicaIds || [this.replicaId];
    this.nodeId = options.nodeId || PARTITION_SERVICE_DEFAULT.NODE_ID;
    this.transport = options.transport || null;
    this.raftProvider = options.raftProvider || new LiferaftProvider();
    assertRaftProviderContract(this.raftProvider);
    this.dbPath = options.dbPath || PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH;
    this.leaderAddressHint =
      typeof options.leaderAddress === TYPEOF.STRING &&
      options.leaderAddress.length > NUM.ZERO ?
        options.leaderAddress :
        null;
    const addressManager = AddressManager.getInstance();
    this.unifiedAddress = addressManager.format(
      this.nodeId,
      ENTITY_TYPE.PARTITION,
      this.replicaId,
    );
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) ||
      PARTITION_SERVICE_DEFAULT.DEFAULT_REPLICA_COUNT;
    this.sizeUpdateDebounceMs =
      config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_DEBOUNCE_MS) ||
      PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_DEBOUNCE_MS;
    this.sizeUpdateIntervalMs =
      config.get(CONFIG_KEY.PARTITION_SIZE_UPDATE_INTERVAL_MS) ||
      PARTITION_SERVICE_DEFAULT.SIZE_UPDATE_INTERVAL_MS;
    this.leaderActivationStabilizationMs =
      Number.isFinite(options.leaderActivationStabilizationMs) &&
      options.leaderActivationStabilizationMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationStabilizationMs) :
        (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ??
          PARTITION_SERVICE_LITERAL.VALUE_250);
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationNodeSpacingMs) :
        (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ??
          PARTITION_SERVICE_LITERAL.VALUE_25);
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getSqlQueryEngine: () => this.sqlQueryEngine,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getSystemTableCache: () => this.systemTableCache,
      getMessageRouter: () => this.transport,
      getControlPlaneReadinessService: () => this.controlPlaneReadinessService,
    }).controlPlaneSystemTableGateway;
    this.db = null;
    this.storage = null;
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.state = PartitionState.NORMAL;
    this.sizeBytes = NUM.ZERO;
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = NUM.ZERO;
    this.sizeUpdateTimer = null;
    this.managedSplitWriteActivityDebounceMs =
      PARTITION_SERVICE_DEFAULT.MANAGED_SPLIT_WRITE_ACTIVITY_DEBOUNCE_MS;
    this.lastManagedSplitWriteActivityAtMs = NUM.ZERO;
    this.cdcSubscribers = /* @__PURE__ */ new Set();
    this.cdcSubscriberWrappers = /* @__PURE__ */ new Map();
    this.cdcSubscriberStates = /* @__PURE__ */ new Map();
    this.cdcSubscriptionEpoch = NUM.ZERO;
    this.cdcEventSequenceNumber = NUM.ZERO;
    this.cdcEventBuffer = new CDCEventBuffer({logger: this.logger});
    this.cdcBufferReplayTimer = null;
    this.cdcBufferReplayInFlight = false;
    this.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    this.cdcReplayBufferGrowthCount = NUM.ZERO;
    this.cdcReplayRetryDepth = NUM.ZERO;
    this.cdcPipelineMetrics =
      options.cdcPipelineMetrics || new CDCPipelineMetrics();
    this.cdcConfirmationTracker = options.cdcConfirmationTracker || null;
    this.pendingCDCEventDeliveries = /* @__PURE__ */ new Set();
    this.proposalQueue = new ProposalQueue();
    this.cdcDelivery = new PartitionCDCDelivery(this);
    this.recentlyAppliedEntryKeys = /* @__PURE__ */ new Set();
    this.recentlyAppliedEntryOrder = [];
    this.migrationColumnDefaultsByTable = /* @__PURE__ */ new Map();
    this.maxTrackedAppliedEntries =
      PARTITION_SERVICE_DEFAULT.MAX_TRACKED_APPLIED_ENTRIES;
    this.hlcClock = new HLCClockService(this.replicaId);
    this.activeTransactions = /* @__PURE__ */ new Map();
    this.preparedTransactions = /* @__PURE__ */ new Map();
    this.preparedStateLostSessions = /* @__PURE__ */ new Set();
    this.committedWriteLog = [];
    this.rowCommitEpoch = /* @__PURE__ */ new Map();
    this.maxCommittedWriteLogEntries =
      Number.isFinite(options.maxCommittedWriteLogEntries) &&
      options.maxCommittedWriteLogEntries > NUM.ZERO ?
        Math.floor(options.maxCommittedWriteLogEntries) :
        PARTITION_SERVICE_DEFAULT.MAX_COMMITTED_WRITE_LOG_ENTRIES;
    this.preparedStateHoldTimeoutMs =
      Number.isFinite(options.preparedStateHoldTimeoutMs) &&
      options.preparedStateHoldTimeoutMs > NUM.ZERO ?
        Math.floor(options.preparedStateHoldTimeoutMs) :
        TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS;
    this.preparedStateHoldSweepIntervalMs =
      Number.isFinite(options.preparedStateHoldSweepIntervalMs) &&
      options.preparedStateHoldSweepIntervalMs > NUM.ZERO ?
        Math.floor(options.preparedStateHoldSweepIntervalMs) :
        PARTITION_SERVICE_DEFAULT.PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS;
    this.preparedStateHoldTimer = null;
    this.activeTransaction = null;
    this.transactionOperations = [];
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.PARTITION) :
      console;
    this.cdcGenerator = new PartitionCDCGenerator({
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      tableName: this.tableName,
      db: this.db,
      logger: this.logger,
    });
    this.suppressLifecycleLogs = Boolean(options.suppressLifecycleLogs);
    this.onInitializationStage =
      typeof options.onInitializationStage === PARTITION_SERVICE_TYPE.FUNCTION ?
        options.onInitializationStage :
        null;
    this.initialized = false;
    this.isShutdown = false;
    this.isLeader = false;
    this.leaderActivationScheduler =
      options.leaderActivationScheduler ||
      LeaderActivationScheduler.getShared({
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs,
      });
    this.leaderActivationGate = new LeaderActivationGate({
      holdoffMs: this.leaderActivationStabilizationMs,
      activationScheduler: this.leaderActivationScheduler,
    });
    this.lastPreparedStateReconstructionTerm = null;
    this.pendingRequestTracker = new PendingRequestTracker({
      defaultTimeoutMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS,
    });
    this.systemTableCacheChangeListener =
      this.handleSystemTableCacheChange.bind(this);
    this.peerReconciliationScheduled = false;
    this.rebalancer = null;
    this.rebalanceCoordinator = options.rebalanceCoordinator || null;
    this.ownsRebalanceCoordinator = false;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.tablePolicyService = options.tablePolicyService || null;
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.sqlQueryEngine = this.sqlQueryEngine;
    }
    this.messageGroupService = options.messageGroupService || null;
    this.messageRouter = options.messageRouter || null;
    this.isJoiningExistingGroup = options.isJoiningExistingGroup || false;
    this.roleMutationHelper = this.createRoleMutationHelper();
    this.pendingRoleUpdate = this.role;
    this.persistedRole = null;
    this.leaderNodeMutationHelper = this.createLeaderNodeMutationHelper();
    this.pendingLeaderNodeUpdate = null;
    this.persistedLeaderNodeId = null;
    this.metadataPublicationReadinessTransitionListener =
      this.handleMetadataPublicationReadinessTransition.bind(this);
    this.releaseMetadataPublicationReadinessListener = null;
    this._metadataPublicationReadinessState = null;
    this.metadataPublicationReadinessState =
      options.metadataPublicationReadinessState ||
      options.bootstrapReadinessState ||
      null;
    this.deferElection = options.deferElection || this.isJoiningExistingGroup;
    this.electionStarted = false;
    this.raftTimingConfig = null;
    this.replicaStateMachine = options.replicaStateMachine || null;
    this.peerAddresses = options.peerAddresses || [];
    this.learnerPromotionDelayMs =
      options.learnerPromotionDelayMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_DELAY_MS;
    this.learnerPromotionPriorityRecoveryDelayMs =
      options.learnerPromotionPriorityRecoveryDelayMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS;
    this.learnerCatchUpCheckIntervalMs =
      options.learnerCatchUpCheckIntervalMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS;
    this.learnerPromotionTimer = null;
    this.splitReplication = null;
    this.splitReplicationRun = null;
    this.splitSnapshotBackfillYieldEveryRows =
      SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS;
  }
  get systemTableCache() {
    return this._systemTableCache || null;
  }
  set systemTableCache(systemTableCache) {
    const previousCache = this._systemTableCache || null;
    if (
      previousCache &&
      previousCache !== systemTableCache &&
      typeof previousCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION &&
      this.systemTableCacheChangeListener
    ) {
      previousCache.offCacheChange(this.systemTableCacheChangeListener);
    }
    this._systemTableCache = systemTableCache;
    this.roleMutationHelper?.setSystemTableCache(systemTableCache);
    this.leaderNodeMutationHelper?.setSystemTableCache(systemTableCache);
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = systemTableCache;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.systemTableCache = systemTableCache;
    }
    if (
      systemTableCache &&
      systemTableCache !== previousCache &&
      typeof systemTableCache.onCacheChange ===
        PARTITION_SERVICE_TYPE.FUNCTION &&
      this.systemTableCacheChangeListener
    ) {
      systemTableCache.onCacheChange(this.systemTableCacheChangeListener);
    }
    this.scheduleRaftPeerReconciliation();
  }
  get cdcIntegrationService() {
    return this._cdcIntegrationService || null;
  }
  set cdcIntegrationService(cdcIntegrationService) {
    this._cdcIntegrationService = cdcIntegrationService;
    this.roleMutationHelper?.setCdcIntegrationService(cdcIntegrationService);
    this.leaderNodeMutationHelper?.setCdcIntegrationService(
      cdcIntegrationService,
    );
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
    }
  }
  get controlPlaneReadinessService() {
    return (
      this.rebalanceCoordinator?.controlPlaneReadinessService ||
      this.sqlQueryEngine?.controlPlaneReadinessService ||
      null
    );
  }
  get pendingRoleUpdate() {
    return this.roleMutationHelper?.pendingValue || null;
  }
  set pendingRoleUpdate(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.pendingValue = normalizePublishedRaftRole(role, {
        collapseLeaderToFollower: true,
      });
    }
  }
  get persistedRole() {
    return this.roleMutationHelper?.persistedValue || null;
  }
  set persistedRole(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.persistedValue = role;
    }
  }
  get roleUpdateInFlight() {
    return this.roleMutationHelper?.inFlight || false;
  }
  get roleUpdateRetryTimer() {
    return this.roleMutationHelper?.retryTimer || null;
  }
  set roleUpdateRetryTimer(timer) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.retryTimer = timer;
    }
  }
  get pendingLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper?.pendingValue || null;
  }
  set pendingLeaderNodeUpdate(leaderNodeId) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.pendingValue = leaderNodeId;
    }
  }
  get persistedLeaderNodeId() {
    return this.leaderNodeMutationHelper?.persistedValue || null;
  }
  set persistedLeaderNodeId(leaderNodeId) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.persistedValue = leaderNodeId;
    }
  }
  get leaderNodeUpdateInFlight() {
    return this.leaderNodeMutationHelper?.inFlight || false;
  }
  set leaderNodeUpdateInFlight(inFlight) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.inFlight = inFlight;
    }
  }
  get leaderNodeUpdateRetryTimer() {
    return this.leaderNodeMutationHelper?.retryTimer || null;
  }
  set leaderNodeUpdateRetryTimer(timer) {
    if (this.leaderNodeMutationHelper) {
      this.leaderNodeMutationHelper.retryTimer = timer;
    }
  }
  get metadataPublicationReadinessState() {
    return this._metadataPublicationReadinessState || null;
  }
  set metadataPublicationReadinessState(readinessState) {
    if (
      typeof this.releaseMetadataPublicationReadinessListener ===
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      this.releaseMetadataPublicationReadinessListener();
    }
    this._metadataPublicationReadinessState = readinessState || null;
    this.releaseMetadataPublicationReadinessListener =
      attachTrafficReadinessListener(
        this._metadataPublicationReadinessState,
        this.metadataPublicationReadinessTransitionListener,
      );
  }
  isMetadataPublicationReady() {
    if (!this.metadataPublicationReadinessState) {
      return true;
    }
    return isMetadataPublicationLifecycleReady(
      this.metadataPublicationReadinessState,
    );
  }
  isBackgroundWorkReady() {
    return isBackgroundWorkLifecycleReady(
      this.metadataPublicationReadinessState,
      {partitionId: this.partitionId},
    );
  }
  handleMetadataPublicationReadinessTransition() {
    this.maybeInitializeRebalancer();
    if (!this.isMetadataPublicationReady()) {
      return;
    }
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(
        PARTITION_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_PARTITION_RAFT_ROLE_UPDATE,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(
        PARTITION_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_PARTITION_LEADER_UPDATE,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
  }
  updateRebalancerLeadership() {
    if (!this.rebalancer) {
      this.maybeInitializeRebalancer();
      return;
    }
    if (typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.rebalancer.setLeader(this.isBackgroundWorkReady() && this.isLeader);
    }
  }
  cancelLeaderOwnedActivation() {
    this.leaderActivationGate.cancel({clearActivatedTerm: true});
  }
  scheduleLeaderOwnedActivation(term) {
    this.leaderActivationGate.schedule(
      term,
      () => {
        if (this.isShutdown || !this.isLeader) {
          return;
        }
        if (!this.isJoiningExistingGroup) {
          this.updateRebalancerLeadership();
        }
        this.logger.info(PARTITION_SERVICE_LOG_MSG.BECAME_LEADER, {
          term,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
          rebalancerActive:
            !this.isJoiningExistingGroup && this.isBackgroundWorkReady(),
        });
        if (this.lastPreparedStateReconstructionTerm !== term) {
          const reconstruction = this.reconstructPreparedState();
          this.lastPreparedStateReconstructionTerm = term;
          this.logger.info(
            PARTITION_SERVICE_LOG_MSG.PREPARED_STATE_RECONSTRUCTED,
            {
              partitionId: this.partitionId,
              preparedTransactionCount: reconstruction.preparedTransactionCount,
              prepareLostCount: reconstruction.prepareLostCount,
            },
          );
        }
        this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
          leaderId: this.replicaId,
          term,
          partitionId: this.partitionId,
        });
      },
      {
        immediate: this.replicaIds.length === NUM.ONE,
        shouldActivate: () => !this.isShutdown && this.isLeader,
      },
    );
  }
  createRoleMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      buildWhereClause: (_role, context = {}) => {
        const whereClause = {service_id: this.replicaId};
        const cachedRow = context.cachedRow;
        if (
          typeof cachedRow?.raft_role === TYPEOF.STRING &&
          cachedRow.raft_role.length > NUM.ZERO
        ) {
          whereClause.raft_role = cachedRow.raft_role;
        }
        if (Number.isFinite(cachedRow?.updated_at)) {
          whereClause.updated_at = cachedRow.updated_at;
        }
        return whereClause;
      },
      buildUpdateData: (role, updatedAt) => ({
        raft_role: role,
        updated_at: updatedAt,
      }),
      buildUpdateOptions: () => ({
        deliveryPriority: PARTITION_SERVICE_LITERAL.BACKGROUND,
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
        routingReadinessDimension:
          this.getMetadataPublicationReadinessDimension(),
      }),
      buildExpectedCacheFields: (role) => ({raft_role: role}),
      prepareFlush: () => ({
        skip: false,
        clearPending: false,
        reason: PARTITION_SERVICE_LITERAL.READY,
      }),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) || null,
      readValueFromCache: (systemTableCache) => {
        const cached = systemTableCache?.get?.(TABLES.SERVICES, this.replicaId);
        return cached?.raft_role || null;
      },
      isWriteReady: () => this.isServicesLeaderAvailable(),
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_RAFT_ROLE_FAILED, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          role: context.value ?? this.pendingRoleUpdate,
          error: error.message,
        });
      },
    });
  }
  createLeaderNodeMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.PARTITIONS,
      buildWhereClause: (_leaderNodeId, context = {}) => {
        const whereClause = {[COLUMN.PARTITION_ID]: this.partitionId};
        const cachedRow = context.cachedRow;
        if (
          typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === TYPEOF.STRING &&
          cachedRow[COLUMN.LEADER_NODE_ID].length > NUM.ZERO
        ) {
          whereClause[COLUMN.LEADER_NODE_ID] = cachedRow[COLUMN.LEADER_NODE_ID];
        }
        if (Number.isFinite(cachedRow?.[COLUMN.UPDATED_AT])) {
          whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
        }
        return whereClause;
      },
      buildUpdateData: (leaderNodeId, updatedAt) => ({
        [COLUMN.LEADER_NODE_ID]: leaderNodeId,
        [COLUMN.UPDATED_AT]: updatedAt,
      }),
      buildUpdateOptions: () => ({
        deliveryPriority: this.getMetadataPublicationDeliveryPriority(),
        workClass: this.getMetadataPublicationWorkClass(),
        allowPressureDefer: this.shouldMetadataPublicationAllowPressureDefer(),
        routingReadinessDimension:
          this.getMetadataPublicationReadinessDimension(),
      }),
      buildExpectedCacheFields: (leaderNodeId) => ({
        [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      }),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.PARTITIONS, this.partitionId) || null,
      readValueFromCache: (systemTableCache) => {
        const cached = systemTableCache?.get?.(
          TABLES.PARTITIONS,
          this.partitionId,
        );
        return cached?.[COLUMN.LEADER_NODE_ID] || null;
      },
      prepareFlush: () => ({
        skip: !this.isLeader,
        clearPending: !this.isLeader,
        reason: !this.isLeader ?
          PARTITION_SERVICE_LITERAL.NOT_OWNER :
          PARTITION_SERVICE_LITERAL.READY,
      }),
      isWriteReady: () => this.isPartitionsLeaderAvailable(),
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(
          PARTITION_SERVICE_ERROR_MSG.PERSIST_PARTITION_LEADER_FAILED,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            leaderNodeId: context.value ?? this.pendingLeaderNodeUpdate,
            error: error.message,
          },
        );
      },
    });
  }
  /**
   * Get the unified address for this service.
   * Format: ${nodeId}/partition/${replicaId}
   * Requirements: 1.1, 5.1
   * @return {string} Unified address.
   */
  getUnifiedAddress() {
    return this.unifiedAddress;
  }
  /**
   * Build a unified address for a peer replica.
   * Looks up the nodeId from the system table cache if available.
   * Throws if a unified address cannot be resolved.
   * All addresses use fully qualified network identity format: {nodeId}/partition/{replicaId}
   * Requirements: 1.1, 1.4, 3.1, 3.2, 3.3, 9.1
   * @param {string} peerId - Peer replica ID.
   * @return {string} Unified address for the peer.
   */
  buildPeerAddress(peerId) {
    const addressManager = AddressManager.getInstance();
    const cacheAddress = this.resolvePeerAddressFromCache(peerId);
    if (peerId.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR)) {
      const validation = addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      this.logger.error(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
        peerId,
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        error: validation.error,
      });
      throw new Error(`Peer address must be unified: ${peerId}`);
    }
    if (this.peerAddresses && this.peerAddresses.length > NUM.ZERO) {
      const separator = PARTITION_SERVICE_ADDRESS.SEPARATOR;
      const partitionPeerSuffix =
        `${separator}${ENTITY_TYPE.PARTITION}${separator}${peerId}`;
      const peerSuffix = `${separator}${peerId}`;
      for (const addr of this.peerAddresses) {
        const validation = addressManager.validate(addr);
        if (!validation.valid) {
          this.logger.error(
            PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED,
            {
              peerId: addr,
              partitionId: this.partitionId,
              replicaId: this.replicaId,
              error: validation.error,
            },
          );
          throw new Error(`Peer address must be unified: ${addr}`);
        }
        if (addr.endsWith(partitionPeerSuffix) || addr.endsWith(peerSuffix)) {
          if (cacheAddress) {
            return cacheAddress;
          }
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_LIST, {
            peerId,
            address: addr,
            partitionId: this.partitionId,
          });
          return addr;
        }
      }
    }
    if (cacheAddress) {
      return cacheAddress;
    }
    throw new Error(`Unable to resolve unified peer address for ${peerId}`);
  }
  /**
   * Resolve the leader's unified address for write forwarding.
   * @return {string|null} Unified leader address or null if unavailable.
   * @private
   */
  resolveLeaderAddress() {
    const leaderReplicaId = this.normalizeLeaderReplicaId(this.leaderId);
    if (!leaderReplicaId) {
      return null;
    }
    return this.buildPeerAddress(leaderReplicaId);
  }
  /**
   * Normalize one raw leader identifier into the canonical replica ID.
   * Liferaft leader-change notifications use peer addresses, while partition
   * runtime state should track replica IDs.
   * @param {*} candidate
   * @return {string|null}
   * @private
   */
  normalizeLeaderReplicaId(candidate) {
    if (typeof candidate !== TYPEOF.STRING || candidate.length === NUM.ZERO) {
      return null;
    }
    if (!candidate.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR)) {
      return candidate;
    }
    try {
      const parsed = AddressManager.getInstance().parse(candidate);
      if (
        parsed?.serviceType === ENTITY_TYPE.PARTITION &&
        typeof parsed?.serviceId === TYPEOF.STRING &&
        parsed.serviceId.length > NUM.ZERO
      ) {
        return parsed.serviceId;
      }
    } catch (_error) {
      // Ignore parse failures and keep the original candidate.
    }
    return candidate;
  }
  /**
   * Resolve one peer address from authoritative services cache state.
   * Cache-backed rows override stale bootstrap peer hints when ownership moves.
   * @param {string} peerId
   * @return {string|null}
   * @private
   */
  resolvePeerAddressFromCache(peerId) {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.get !== PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return null;
    }
    const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
    if (!service || !service.node_id) {
      return null;
    }
    const address = AddressManager.getInstance().format(
      service.node_id,
      ENTITY_TYPE.PARTITION,
      peerId,
    );
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_CACHE, {
      peerId,
      nodeId: service.node_id,
      address,
      partitionId: this.partitionId,
    });
    return address;
  }
  /**
   * React to authoritative services cache changes for this partition.
   * Existing voters need this to discover newly added or moved peers.
   * @param {string} tableName
   * @param {string} _operation
   * @param {Object} record
   * @private
   */
  handleSystemTableCacheChange(tableName, _operation, record) {
    if (tableName !== TABLES.SERVICES || !record) {
      return;
    }
    if (
      record.partition_id !== this.partitionId ||
      record.service_type !== SERVICE_TYPE.PARTITION
    ) {
      return;
    }
    this.scheduleRaftPeerReconciliation();
  }
  /**
   * Coalesce peer reconciliation work triggered by cache updates.
   * @private
   */
  scheduleRaftPeerReconciliation() {
    if (this.peerReconciliationScheduled) {
      return;
    }
    this.peerReconciliationScheduled = true;
    setImmediate(() => {
      this.peerReconciliationScheduled = false;
      this.reconcileRaftPeersFromCache();
    });
  }
}
export {PartitionServiceCoreBase};
