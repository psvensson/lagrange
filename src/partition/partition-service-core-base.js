import {PARTITION_DRAIN_CAPACITIES} from './partition-cdc-owed-admission.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {createLearnerPromotionWakeState} from './partition-service-learner-promotion-wake-methods.js';
import {
  createLeaderNodeMutationHelper,
  createRoleMutationHelper,
} from './partition-service-metadata-mutation-helpers.js';
import {
  retireRaftPeerFromAuthoritativeServiceChange,
} from './partition-service-raft-peer-cache-reconciliation.js';
import {PARTITION_LEADER_ADDRESS_REFUSAL} from './partition-service-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {PEER_ADDRESS_STATUS} from '../raft/raft-rs-runtime-owner-constants.js';
import {createRaftRsOperationPort} from '../raft/raft-rs-operation-port.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../raft/raft-operation-port-request.js';
import {resolveOwnedTimeSource} from '../time/time-source.js';
import {resolveOwnedRandomSource} from '../random/random-source.js';
import {isLivePartitionServiceRow} from '../constants/service.js';
import {PartitionWriteTraffic} from './partition-write-traffic.js';
import {isSystemTableName} from '../bootstrap/system-table-schema-shared-constants.js';
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
  LoggingService,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_TYPE,
  PARTITION_SUBSYSTEM,
  PartitionCDCDelivery,
  PartitionCDCGenerator,
  PartitionState,
  PendingRequestTracker,
  ProposalQueue,
  RaftRole,
  SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS,
  TABLES,
  TIMEOUT_BUDGET_DEFAULT,
  attachTrafficReadinessListener,
  createControlPlaneRuntimeBundle,
  isBackgroundWorkLifecycleReady,
  isMetadataPublicationLifecycleReady,
  normalizePublishedRaftRole,
} = PARTITION_SERVICE_SHARED;
// COPY, never the caller's array: this list is mutated in place by raft peer
// reconciliation, and callers hand in the shared system-table declaration.
// Taking it by reference made a minted replacement replica append to the
// declaration itself, so every later reader saw a raised replication factor.
function copyPeerList(replicaIds, ownReplicaId) {
  return Array.isArray(replicaIds) ? [...replicaIds] : [ownReplicaId];
}

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
    // One clock for this replica, on the node hosting it. Held in two parts
    // for the reason resolveOwnedTimeSource states: stamps read the resolved
    // source, and only a clock that was actually GIVEN may take over a
    // collaborator that would otherwise schedule for itself.
    const clocks = resolveOwnedTimeSource(options);
    this.providedTimeSource = clocks.providedTimeSource;
    // The node's randomness, when it owns one, handed to the consensus port;
    // unsupplied, the port resolves its own.
    this.providedRandomSource = resolveOwnedRandomSource(options);
    this.timeSource = clocks.timeSource;
    this.partitionId = options.partitionId;
    this.tableId = options.tableId;
    this.tableName = options.tableName || options.tableId;
    this.isSystemTable =
      options.isSystemTable === true || isSystemTableName(this.tableName);
    this.schema = options.schema || null;
    this.keyRange = options.keyRange || {
      start: PARTITION_SERVICE_DEFAULT.KEY_RANGE_START,
      end: PARTITION_SERVICE_DEFAULT.KEY_RANGE_END,
    };
    this.replicaId = options.replicaId;
    this.replicaIds = copyPeerList(options.replicaIds, this.replicaId);
    this.nodeId = options.nodeId || PARTITION_SERVICE_DEFAULT.NODE_ID;
    this.transport = options.transport || null;
    this.dbPath = options.dbPath || PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH;
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
      // The gateway stamps and times for the node hosting this replica.
      now: () => this.timeSource.now(),
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
    // Committed write traffic, the managed split/merge QPM signal (not CDC).
    this.writeTraffic = new PartitionWriteTraffic();
    this.cdcConfirmationTracker = options.cdcConfirmationTracker || null;
    this.pendingCDCEventDeliveries = /* @__PURE__ */ new Set();
    this.proposalQueue = new ProposalQueue({timeSource: this.timeSource,
      reservedCapacities: PARTITION_DRAIN_CAPACITIES});
    this.pendingWriteOutcomes = /* @__PURE__ */ new Map();
    this.cdcDelivery = new PartitionCDCDelivery(this);
    this.migrationColumnDefaultsByTable = /* @__PURE__ */ new Map();
    this.hlcClock = new HLCClockService(this.replicaId, {
      timeSource: this.timeSource,
    });
    // Replica removal owns one irreversible serving fence: once raised,
    // already-open current participant work may finish but no new query,
    // write, or transaction may enter. The node removal owner waits for both
    // admitted requests and participant custody to drain before teardown.
    this.removalServingAdmissionFenced = false;
    this.activeServingRequestCount = 0;
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
    this.startupFailure = null;
    this.initializationSettlement = null;
    this.initializationOwnsCleanup = false;
    this.shutdownSettlement = null;
    this.isLeader = false;
    // Minted and ended only at the leadership edge
    // (src/raft/replica-leadership-state.js).
    this.leadershipTenure = null;
    this.leaderActivationGate = new LeaderActivationGate({
      holdoffMs: this.leaderActivationStabilizationMs,
      activationScheduler: options.leaderActivationScheduler || null,
      sharedActivationScheduler: {
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs,
        timeSource: this.providedTimeSource || undefined,
      },
      timeSource: this.providedTimeSource || undefined,
    });
    this.pendingRequestTracker = new PendingRequestTracker({
      defaultTimeoutMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS,
    });
    this.systemTableCacheChangeListener =
      this.handleSystemTableCacheChange.bind(this);
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
    // The O1 committed-membership stamp (absent: the replicas are founders).
    this.bootstrapMembership = options.bootstrapMembership ?? null;
    // The opening host's authoritative row proves this replica identity
    // existed before (the open-time rule): opened without its durable record
    // it is refused reseed-required.
    this.identityExisted = options.identityExisted === true;
    Object.defineProperty(this, RAFT_OPERATION_PORT_REQUEST.ORIGINAL_ALLOCATION_OPENING, {
      value: options.originalAllocationOpening,
    });
    // The acknowledgement that this opening's prior-existence fact (its
    // SYNCING services row, written after the port opens) is durable: until
    // it resolves the port steps nothing (verifier N3). Absent: no such
    // pending fact.
    this.identityRecorded = options.identityRecorded ?? null;
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
    this.resolveHandlerRetirementLane =
      options.resolveHandlerRetirementLane || null;
    this.learnerCatchUpCheckIntervalMs =
      options.learnerCatchUpCheckIntervalMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS;
    this.learnerPromotionTimer = null;
    // One count-check inputs line per learner: the first PASS states the
    // inputs the decision was made on, and the pass path then stays quiet
    // (quest learner-promotion-guard-inputs-observed).
    this.learnerPromotionCountCheckInputsLogged = false;
    this.learnerPromotionWake = createLearnerPromotionWakeState();
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
  /**
   * Build this replica's consensus operation port. The partition states its
   * own requirements in the request and the rs-raft backend builds the port;
   * there is no selection and no injected provider.
   * @param {Object} request - The partition's RAFT_OPERATION_PORT_REQUEST.
   * @return {Object} The frozen operation port.
   */
  createOperationPort(request) {
    if (this.originalAllocationOpening === undefined) return createRaftRsOperationPort(request);
    return createRaftRsOperationPort({
      ...request,
      [RAFT_OPERATION_PORT_REQUEST.ORIGINAL_ALLOCATION_OPENING]: this.originalAllocationOpening,
    });
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
   * This replica's own live raft status, when it is a usable observation of
   * this replica in this group; else null.
   * @return {Object|null}
   * @private
   */
  readOwnRaftStatus() {
    let status;
    try {
      status = this.raft?.readStatus?.();
    } catch (error) {
      // A status that could not be read is the port's host failure.
      status = {outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, error};
    }
    const usable = status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
      status.groupId === this.partitionId &&
      status.replicaIdentity === this.replicaId;
    return usable ? status : null;
  }
  /**
   * The live raft leader's replica identity, or null without a live leader.
   * @return {string|null}
   */
  readLiveRaftLeaderId() {
    const leaderId = this.readOwnRaftStatus()?.leaderId;
    return typeof leaderId === 'string' && leaderId.length > 0 ? leaderId : null;
  }
  /**
   * The leader's unified address for write forwarding, redirects,
   * split/merge forwarding, the learner promotion proof and the replica
   * admission request: the live raft leader this replica's own status names,
   * at the address its committed configuration places it. Never a cached
   * row, a cached leader id or a hint.
   * @return {string} The live leader's committed address.
   * @throws {Error} PARTITION_LEADER_ADDRESS_REFUSAL (typed, as message and
   *   code): STATUS_UNAVAILABLE, NO_LEADER or LEADER_UNADDRESSED.
   */
  resolveLeaderAddress() {
    const status = this.readOwnRaftStatus();
    const refusal = status === null ?
      PARTITION_LEADER_ADDRESS_REFUSAL.STATUS_UNAVAILABLE :
      !status.leaderId ? PARTITION_LEADER_ADDRESS_REFUSAL.NO_LEADER :
        status.leaderAddressStatus !== PEER_ADDRESS_STATUS.RESOLVED ?
          PARTITION_LEADER_ADDRESS_REFUSAL.LEADER_UNADDRESSED : null;
    if (refusal !== null) {
      throw Object.assign(new Error(refusal), {code: refusal});
    }
    return status.leaderAddress;
  }
  /**
   * Normalize one raw leader identifier into the canonical replica ID.
   * Leader identities can arrive as peer addresses, while partition runtime
   * state should track replica IDs.
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
   * React to authoritative services cache changes for this partition: a
   * retiring row may retire the configured peer it names. Rows never admit
   * a peer (admission is answered from the committed replica operation,
   * partition-replica-admission.js).
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handleSystemTableCacheChange(tableName, operation, record) {
    this.observeLearnerPromotionWakeSource(tableName, operation, record);
    if (tableName === TABLES.PARTITIONS && record) {
      this.handleCanonicalLeaderRowCacheChange(record);
      return;
    }
    if (tableName !== TABLES.SERVICES || !record) {
      return;
    }
    if (
      record.partition_id !== this.partitionId ||
      !isLivePartitionServiceRow(record)
    ) {
      return;
    }
    retireRaftPeerFromAuthoritativeServiceChange(this, operation, record);
  }
}
export {PartitionServiceCoreBase};
