import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  createLeaderNodeMutationHelper,
  createRoleMutationHelper,
} from './partition-service-metadata-mutation-helpers.js';
import {
  retireRaftPeerFromAuthoritativeServiceChange,
  resolveLiveRaftLeaderAddressForPeer,
} from './partition-service-raft-peer-cache-reconciliation.js';

const {
  AddressManager,
  CDCEventBuffer,
  CDCPipelineMetrics,
  CONFIG_KEY,
  ConfigurationManager,
  ENTITY_TYPE,
  EventEmitter,
  HLCClockService,
  LeaderActivationGate,
  LeaderActivationScheduler,
  LiferaftProvider,
  LoggingService,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  PARTITION_SUBSYSTEM,
  PartitionCDCDelivery,
  PartitionCDCGenerator,
  PartitionState,
  PendingRequestTracker,
  ProposalQueue,
  RaftRole,
  SERVICE_TYPE,
  SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS,
  TABLES,
  TIMEOUT_BUDGET_DEFAULT,
  assertRaftProviderContract,
  attachTrafficReadinessListener,
  createControlPlaneRuntimeBundle,
  getTrafficReadinessSnapshot,
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
      typeof options.leaderAddress === 'string' &&
      options.leaderAddress.length > 0 ?
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
      options.leaderActivationStabilizationMs >= 0 ?
        Math.floor(options.leaderActivationStabilizationMs) :
        (config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ??
          PARTITION_SERVICE_LITERAL.VALUE_250);
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= 0 ?
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
    this.sizeBytes = 0;
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = 0;
    this.sizeUpdateTimer = null;
    this.managedSplitWriteActivityDebounceMs =
      PARTITION_SERVICE_DEFAULT.MANAGED_SPLIT_WRITE_ACTIVITY_DEBOUNCE_MS;
    this.lastManagedSplitWriteActivityAtMs = 0;
    this.cdcSubscribers = /* @__PURE__ */ new Set();
    this.cdcSubscriberWrappers = /* @__PURE__ */ new Map();
    this.cdcSubscriberStates = /* @__PURE__ */ new Map();
    this.cdcSubscriptionEpoch = 0;
    this.cdcEventSequenceNumber = 0;
    this.cdcEventBuffer = new CDCEventBuffer({logger: this.logger});
    this.cdcBufferReplayTimer = null;
    this.cdcBufferReplayInFlight = false;
    this.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    this.cdcReplayBufferGrowthCount = 0;
    this.cdcReplayRetryDepth = 0;
    this.cdcPipelineMetrics =
      options.cdcPipelineMetrics || new CDCPipelineMetrics();
    this.cdcConfirmationTracker = options.cdcConfirmationTracker || null;
    this.pendingCDCEventDeliveries = /* @__PURE__ */ new Set();
    this.proposalQueue = new ProposalQueue();
    this.pendingWriteOutcomes = /* @__PURE__ */ new Map();
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
      options.maxCommittedWriteLogEntries > 0 ?
        Math.floor(options.maxCommittedWriteLogEntries) :
        PARTITION_SERVICE_DEFAULT.MAX_COMMITTED_WRITE_LOG_ENTRIES;
    this.preparedStateHoldTimeoutMs =
      Number.isFinite(options.preparedStateHoldTimeoutMs) &&
      options.preparedStateHoldTimeoutMs > 0 ?
        Math.floor(options.preparedStateHoldTimeoutMs) :
        TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS;
    this.preparedStateHoldSweepIntervalMs =
      Number.isFinite(options.preparedStateHoldSweepIntervalMs) &&
      options.preparedStateHoldSweepIntervalMs > 0 ?
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
    // S4 snapshot catch-up decision seam: settable before or after
    // construction; threaded into the RaftNode options at the partition
    // construction site (partition-service-raft-init-base.js).
    this.onSnapshotCatchupNeeded =
      typeof options.onSnapshotCatchupNeeded ===
        PARTITION_SERVICE_TYPE.FUNCTION ?
        options.onSnapshotCatchupNeeded :
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
    this.localCanonicalLeaderObservation = null;
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
    this.mergeReplication = null;
    this.mergeReplicationRun = null;
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
    this.maybeInitializeRebalancer({readinessTransitionOnly: true});
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
  /**
   * Resolve whether this partition's rebalancer should hold leadership.
   *
   * Policy: background-work readiness gates rebalancer-leadership
   * ACQUISITION; raft leadership gates RETENTION. Once a rebalancer has
   * acquired leadership while the node was ready, a transient node-wide
   * readiness dip (e.g. the shared metadata-publication readiness state
   * re-entering a degraded phase during control-plane recovery) must NOT
   * demote it while this partition still holds raft leadership. Without
   * this hysteresis every partition's rebalancer flaps in lockstep with
   * the single shared readiness object each time it oscillates, which
   * resets the post-restart quiescence window and stalls convergence. A
   * draining/shutting-down node still demotes (drain is terminal).
   *
   * @return {boolean} Desired rebalancer leadership state.
   * @private
   */
  resolveRebalancerLeadership() {
    if (!this.isLeader) {
      return false;
    }
    if (this.isBackgroundWorkReady()) {
      return true;
    }
    const rebalancer = this.rebalancer;
    if (
      !rebalancer ||
      rebalancer.isLeader !== true ||
      rebalancer.isShuttingDown === true
    ) {
      return false;
    }
    const snapshot = getTrafficReadinessSnapshot(
      this.metadataPublicationReadinessState,
    );
    if (snapshot && snapshot.draining === true) {
      return false;
    }
    return true;
  }
  /**
   * Attach a secondary leadership sink driven in lockstep with this partition's
   * own rebalancer leadership. Used to gate a non-partition reconciler (e.g. the
   * RUNTIME_SERVICE rebalancer owner bound to `service_definitions-p1`) on this
   * partition's raft leadership, so it starts/quiesces with the partition leader
   * and inherits the same drain hysteresis. Pass `null` to detach. A no-op for
   * every partition that has no sink attached.
   * @param {?{setLeader: function(boolean): void}} sink
   */
  setRebalancerLeadershipSink(sink) {
    this.rebalancerLeadershipSink =
      sink && typeof sink.setLeader === PARTITION_SERVICE_TYPE.FUNCTION ?
        sink :
        null;
    this.driveRebalancerLeadershipSink();
  }

  /** @private */
  driveRebalancerLeadershipSink() {
    if (this.rebalancerLeadershipSink) {
      this.rebalancerLeadershipSink.setLeader(this.resolveRebalancerLeadership());
    }
  }

  updateRebalancerLeadership() {
    if (!this.rebalancer) {
      this.maybeInitializeRebalancer();
      this.driveRebalancerLeadershipSink();
      return;
    }
    if (typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.rebalancer.setLeader(this.resolveRebalancerLeadership());
    }
    this.driveRebalancerLeadershipSink();
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
        this.reassertDurableLeaderNodeId();
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
        immediate: this.replicaIds.length === 1,
        shouldActivate: () => !this.isShutdown && this.isLeader,
      },
    );
  }
  /**
   * Re-read one metadata row from the authoritative partition and repair the
   * local cache copy. Metadata publications CAS-guard on the cached row, and
   * that cache normally converges through CDC — which can be exactly the
   * feed a starved publication is blocking, so the guard must be able to
   * converge through this direct read instead.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @return {Promise<boolean>} True when a repair pass completed.
   */
  async refreshMetadataPublicationGuardRow(tableName, key) {
    const cdcIntegrationService = this.cdcIntegrationService;
    if (
      !cdcIntegrationService ||
      typeof cdcIntegrationService.refreshAuthoritativeCacheRow !== 'function'
    ) {
      return false;
    }
    return (
      (await cdcIntegrationService.refreshAuthoritativeCacheRow(
        tableName,
        key,
      )) === true
    );
  }
  createRoleMutationHelper() {
    return createRoleMutationHelper(this);
  }
  createLeaderNodeMutationHelper() {
    return createLeaderNodeMutationHelper(this);
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
    if (this.peerAddresses && this.peerAddresses.length > 0) {
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
    const cacheAddress = this.resolvePeerAddressFromCache(leaderReplicaId);
    if (cacheAddress) {
      return cacheAddress;
    }
    const liveRaftLeaderAddress =
      resolveLiveRaftLeaderAddressForPeer(this, leaderReplicaId);
    if (liveRaftLeaderAddress) {
      return liveRaftLeaderAddress;
    }
    throw new Error(
      `Unable to resolve unified peer address for ${leaderReplicaId}`,
    );
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
    if (typeof candidate !== 'string' || candidate.length === 0) {
      return null;
    }
    if (!candidate.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR)) {
      return candidate;
    }
    try {
      const parsed = AddressManager.getInstance().parse(candidate);
      if (
        parsed?.serviceType === ENTITY_TYPE.PARTITION &&
        typeof parsed?.serviceId === 'string' &&
        parsed.serviceId.length > 0
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
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handleSystemTableCacheChange(tableName, operation, record) {
    if (tableName === TABLES.PARTITIONS && record) {
      this.handleCanonicalLeaderRowCacheChange(record);
      return;
    }
    if (tableName !== TABLES.SERVICES || !record) {
      return;
    }
    if (
      record.partition_id !== this.partitionId ||
      record.service_type !== SERVICE_TYPE.PARTITION
    ) {
      return;
    }
    retireRaftPeerFromAuthoritativeServiceChange(this, operation, record);
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
